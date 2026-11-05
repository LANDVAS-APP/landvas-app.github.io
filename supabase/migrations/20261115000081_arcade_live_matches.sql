-- Arcades go live: up to 10 people in the same arcade at once (like the planets), walking round together, and
-- multiplayer matches on any cabinet for 2-4 players in the same room:
--   versus  everyone plays the same round (same seed) at the same time; top score wins a ticket bonus
--   team    same, but the scores add up; reach the team target and everyone gets the bonus
-- Scores are each player's own server-checked round (arcade_finish as usual); the match only adds bonus tickets.
-- Profiles: one place of each type, the one used most.

-- ===== presence ===============================================================================================
create table if not exists public.arcade_presence (
  player_id uuid primary key references public.players (id) on delete cascade,
  arcade_id uuid not null references public.arcades (id) on delete cascade,
  shard int not null default 0,
  x real not null default 0, z real not null default 6,
  playing text,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists arcade_presence_room_idx on public.arcade_presence (arcade_id, shard, seen_at);
alter table public.arcade_presence enable row level security;
revoke all on public.arcade_presence from anon, authenticated;

-- ===== matches ================================================================================================
create table if not exists public.arcade_matches (
  id uuid primary key default gen_random_uuid(),
  arcade_id uuid not null references public.arcades (id) on delete cascade,
  shard int not null default 0,
  game text not null,
  mode text not null check (mode in ('versus', 'team')),
  host_id uuid not null references public.players (id) on delete cascade,
  seed int not null default floor(random() * 2147483646)::int,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'done', 'cancelled')),
  target int,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  settled_at timestamptz
);
create index if not exists arcade_matches_room_idx on public.arcade_matches (arcade_id, shard, status, created_at desc);
create table if not exists public.arcade_match_players (
  match_id uuid not null references public.arcade_matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  session uuid references public.arcade_plays (id) on delete set null,
  joined_at timestamptz not null default now(),
  bonus int not null default 0,
  primary key (match_id, player_id)
);
create index if not exists arcade_match_players_player_idx on public.arcade_match_players (player_id, joined_at desc);
alter table public.arcade_matches enable row level security;
alter table public.arcade_match_players enable row level security;
revoke all on public.arcade_matches from anon, authenticated;
revoke all on public.arcade_match_players from anon, authenticated;

update public.game_config set value = value || '{"live": {"room_size": 10, "stale_seconds": 12},
  "match": {"max_players": 4, "lobby_minutes": 3, "countdown_seconds": 4, "round_minutes": 6, "versus_bonus": 0.5, "team_bonus": 0.4, "min_bonus": 10}}'::jsonb
where key = 'arcade';

/** A match as the players see it: who's in, their (checked) scores once they've finished, and where you stand. */
create or replace function private.arc_match_json(p_match uuid, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'arcade_id', m.arcade_id, 'game', m.game, 'mode', m.mode, 'status', m.status, 'host', m.host_id,
    'seed', case when m.status <> 'lobby' then m.seed end, 'target', m.target,
    'created_at', m.created_at, 'started_at', m.started_at, 'server_time', now(),
    'players', (select coalesce(jsonb_agg(private.profile_json(mp.player_id) || jsonb_build_object(
                  'score', ap.score, 'finished', ap.finished_at is not null, 'bonus', mp.bonus,
                  'session', case when mp.player_id = p_viewer then mp.session end) order by mp.joined_at), '[]'::jsonb)
                from public.arcade_match_players mp left join public.arcade_plays ap on ap.id = mp.session
                where mp.match_id = m.id),
    'level', (select coalesce((a.machines ->> m.game)::int, 1) from public.arcades a where a.id = m.arcade_id))
  from public.arcade_matches m where m.id = p_match
$$;

/** Pay out a match once everyone's finished (or the round ran out of time). Safe to call more than once. */
create or replace function private.arc_match_settle(p_match uuid) returns void language plpgsql as $$
declare m public.arcade_matches%rowtype; c jsonb := coalesce(private.cfg('arcade') -> 'match', '{}'::jsonb);
  v_all boolean; v_top int; v_total int; r record; v_b int;
begin
  select * into m from public.arcade_matches where id = p_match for update;
  if not found or m.status <> 'playing' then return; end if;
  select bool_and(ap.finished_at is not null) into v_all
    from public.arcade_match_players mp left join public.arcade_plays ap on ap.id = mp.session where mp.match_id = m.id;
  if not coalesce(v_all, false) and m.started_at > now() - make_interval(mins => coalesce((c ->> 'round_minutes')::int, 6)) then return; end if;
  select max(coalesce(ap.score, 0)), sum(coalesce(ap.score, 0)) into v_top, v_total
    from public.arcade_match_players mp left join public.arcade_plays ap on ap.id = mp.session and ap.finished_at is not null where mp.match_id = m.id;
  for r in select mp.player_id, coalesce(ap.score, 0) score, coalesce(ap.tickets, 0) tickets
             from public.arcade_match_players mp left join public.arcade_plays ap on ap.id = mp.session and ap.finished_at is not null
            where mp.match_id = m.id loop
    v_b := 0;
    if m.mode = 'versus' and v_top > 0 and r.score = v_top then
      v_b := greatest(coalesce((c ->> 'min_bonus')::int, 10), floor(r.tickets * coalesce((c ->> 'versus_bonus')::numeric, 0.5))::int);
    elsif m.mode = 'team' and v_total >= coalesce(m.target, 0) and r.score > 0 then
      v_b := greatest(coalesce((c ->> 'min_bonus')::int, 10), floor(r.tickets * coalesce((c ->> 'team_bonus')::numeric, 0.4))::int);
    end if;
    if v_b > 0 then
      insert into public.arcade_players (player_id) values (r.player_id) on conflict (player_id) do nothing;
      update public.arcade_players set tickets = tickets + v_b, lifetime = lifetime + v_b where player_id = r.player_id;
      update public.arcade_match_players set bonus = v_b where match_id = m.id and player_id = r.player_id;
    end if;
  end loop;
  update public.arcade_matches set status = 'done', settled_at = now() where id = m.id;
end $$;

-- ===== the heartbeat ==========================================================================================
create or replace function public.arcade_live(p_arcade uuid, p_x real default null, p_z real default null, p_playing text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); a public.arcades%rowtype;
  c jsonb := coalesce(private.cfg('arcade') -> 'live', '{}'::jsonb);
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  v_lobby interval := make_interval(mins => coalesce((private.cfg('arcade') -> 'match' ->> 'lobby_minutes')::int, 3));
  me public.arcade_presence%rowtype; v_shard int; v_new boolean := false; v_match uuid;
begin
  perform private.rate_limit('arcade_live', 9000, 3600);
  select * into a from public.arcades where id = p_arcade;
  if not found or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('arcade-live:' || p_arcade));
  select * into me from public.arcade_presence where player_id = v_uid;
  if found and me.arcade_id = p_arcade and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    -- the fullest room with space; friends first would be nice, but busy rooms make a busy arcade
    select shard into v_shard from public.arcade_presence
     where arcade_id = p_arcade and seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
       where not exists (select 1 from public.arcade_presence where arcade_id = p_arcade and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
  end if;
  insert into public.arcade_presence (player_id, arcade_id, shard, x, z, playing, joined_at, seen_at)
  values (v_uid, p_arcade, v_shard, greatest(-8, least(8, coalesce(p_x, 0))), greatest(-13, least(13, coalesce(p_z, 6))),
          case when private.arc_cfg() -> 'games' ? p_playing then p_playing end, now(), now())
  on conflict (player_id) do update set arcade_id = excluded.arcade_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else arcade_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else arcade_presence.z end),
    playing = excluded.playing, joined_at = case when v_new then now() else arcade_presence.joined_at end, seen_at = now();
  -- lobbies nobody started in time close by themselves; rounds that ran out of time pay out
  update public.arcade_matches set status = 'cancelled' where arcade_id = p_arcade and status = 'lobby' and created_at < now() - v_lobby;
  for v_match in select id from public.arcade_matches where arcade_id = p_arcade and status = 'playing' loop perform private.arc_match_settle(v_match); end loop;
  select mp.match_id into v_match from public.arcade_match_players mp join public.arcade_matches m on m.id = mp.match_id
   where mp.player_id = v_uid and m.arcade_id = p_arcade and (m.status in ('lobby', 'playing') or m.settled_at > now() - interval '2 minutes')
   order by mp.joined_at desc limit 1;
  return jsonb_build_object(
    'arcade_id', p_arcade, 'shard', v_shard, 'joined', v_new, 'room_size', v_max,
    'channel', 'arcade:' || p_arcade || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z, 'playing', p.playing) order by p.joined_at), '[]'::jsonb)
                from public.arcade_presence p
                where p.arcade_id = p_arcade and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_arcade', (select count(*) from public.arcade_presence where arcade_id = p_arcade and seen_at > now() - v_stale),
    'lobbies', (select coalesce(jsonb_agg(private.arc_match_json(m.id, v_uid) order by m.created_at desc), '[]'::jsonb)
                from public.arcade_matches m where m.arcade_id = p_arcade and m.shard = v_shard and m.status = 'lobby'
                  and private.visible_to(m.host_id, v_uid)),
    'match', case when v_match is not null then private.arc_match_json(v_match, v_uid) end);
end $$;

create or replace function public.arcade_leave() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.arcade_presence where player_id = v_uid;
  -- leaving takes you out of any lobby you were waiting in (and closes the ones you were hosting)
  delete from public.arcade_match_players mp using public.arcade_matches m where mp.match_id = m.id and m.status = 'lobby' and mp.player_id = v_uid;
  update public.arcade_matches set status = 'cancelled' where host_id = v_uid and status = 'lobby';
end $$;

-- ===== matches ================================================================================================
create or replace function private.arc_here(p_uid uuid, p_arcade uuid) returns public.arcade_presence language sql stable as $$
  select * from public.arcade_presence where player_id = p_uid and arcade_id = p_arcade
     and seen_at > now() - make_interval(secs => coalesce((private.cfg('arcade') -> 'live' ->> 'stale_seconds')::int, 12))
$$;

create or replace function public.arcade_match_create(p_arcade uuid, p_game text, p_mode text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype; me public.arcade_presence%rowtype; v_id uuid;
  g jsonb := private.arc_cfg() -> 'games' -> p_game;
begin
  perform private.rate_limit('arcade_match', 120, 3600);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  if p_mode not in ('versus', 'team') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  select * into a from public.arcades where id = p_arcade;
  if not found or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (a.machines ? p_game) then raise exception 'machine_locked' using errcode = 'P0001'; end if;
  me := private.arc_here(v_uid, p_arcade);
  if me.player_id is null then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  -- one lobby at a time: leave any other you're waiting in
  delete from public.arcade_match_players mp using public.arcade_matches m where mp.match_id = m.id and m.status = 'lobby' and mp.player_id = v_uid;
  update public.arcade_matches set status = 'cancelled' where host_id = v_uid and status = 'lobby';
  insert into public.arcade_matches (arcade_id, shard, game, mode, host_id, target)
  values (p_arcade, me.shard, p_game, p_mode, v_uid, case when p_mode = 'team' then greatest(20, floor(coalesce((g ->> 'points_per_ink')::numeric, 200) / 2)::int) end)
  returning id into v_id;
  insert into public.arcade_match_players (match_id, player_id) values (v_id, v_uid);
  return private.arc_match_json(v_id, v_uid);
end $$;

create or replace function public.arcade_match_join(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arcade_matches%rowtype; me public.arcade_presence%rowtype; v_n int;
begin
  select * into m from public.arcade_matches where id = p_match for update;
  if not found or m.status <> 'lobby' or not private.visible_to(m.host_id, v_uid) then raise exception 'match_closed' using errcode = 'P0001'; end if;
  me := private.arc_here(v_uid, m.arcade_id);
  if me.player_id is null or me.shard <> m.shard then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  if exists (select 1 from public.arcade_match_players where match_id = m.id and player_id = v_uid) then return private.arc_match_json(m.id, v_uid); end if;
  select count(*) into v_n from public.arcade_match_players where match_id = m.id;
  if v_n >= coalesce((private.cfg('arcade') -> 'match' ->> 'max_players')::int, 4) then raise exception 'match_full' using errcode = 'P0001'; end if;
  delete from public.arcade_match_players mp using public.arcade_matches x where mp.match_id = x.id and x.status = 'lobby' and mp.player_id = v_uid;
  update public.arcade_matches set status = 'cancelled' where host_id = v_uid and status = 'lobby';
  insert into public.arcade_match_players (match_id, player_id) values (m.id, v_uid);
  if m.mode = 'team' then
    update public.arcade_matches set target = greatest(20, floor(coalesce((private.arc_cfg() -> 'games' -> m.game ->> 'points_per_ink')::numeric, 200) / 2)::int) * (v_n + 1) where id = m.id;
  end if;
  return private.arc_match_json(m.id, v_uid);
end $$;

create or replace function public.arcade_match_leave(p_match uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arcade_matches%rowtype; v_n int;
begin
  select * into m from public.arcade_matches where id = p_match for update;
  if not found or m.status <> 'lobby' then return; end if;
  delete from public.arcade_match_players where match_id = m.id and player_id = v_uid;
  select count(*) into v_n from public.arcade_match_players where match_id = m.id;
  if m.host_id = v_uid or v_n = 0 then update public.arcade_matches set status = 'cancelled' where id = m.id;
  elsif m.mode = 'team' then
    update public.arcade_matches set target = greatest(20, floor(coalesce((private.arc_cfg() -> 'games' -> m.game ->> 'points_per_ink')::numeric, 200) / 2)::int) * v_n where id = m.id;
  end if;
end $$;

/** The host starts the match: everyone gets a round of the same game with the same seed, starting together. */
create or replace function public.arcade_match_start(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arcade_matches%rowtype; r record; v_s uuid;
  v_at timestamptz := now() + make_interval(secs => coalesce((private.cfg('arcade') -> 'match' ->> 'countdown_seconds')::int, 4));
begin
  select * into m from public.arcade_matches where id = p_match for update;
  if not found or m.status <> 'lobby' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if m.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  if (select count(*) from public.arcade_match_players where match_id = m.id) < 2 then raise exception 'need_players' using errcode = 'P0001'; end if;
  for r in select player_id from public.arcade_match_players where match_id = m.id loop
    insert into public.arcade_plays (player_id, arcade_id, game, seed, mode, started_at) values (r.player_id, m.arcade_id, m.game, m.seed, 'classic', v_at) returning id into v_s;
    update public.arcade_match_players set session = v_s where match_id = m.id and player_id = r.player_id;
  end loop;
  update public.arcade_matches set status = 'playing', started_at = v_at where id = m.id;
  return private.arc_match_json(m.id, v_uid);
end $$;

/** After finishing your round (arcade_finish as usual): see the standings; pays out once everyone's done. */
create or replace function public.arcade_match_result(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if not exists (select 1 from public.arcade_match_players where match_id = p_match and player_id = v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.arc_match_settle(p_match);
  return private.arc_match_json(p_match, v_uid);
end $$;

do $$ declare f text; begin
  foreach f in array array['public.arcade_live(uuid, real, real, text)', 'public.arcade_leave()', 'public.arcade_match_create(uuid, text, text)',
    'public.arcade_match_join(uuid)', 'public.arcade_match_leave(uuid)', 'public.arcade_match_start(uuid)', 'public.arcade_match_result(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ===== profiles: one place of each type, the one used most =====================================================
create or replace function public.player_places(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_cfg jsonb := private.cfg('arcade'); v_un text;
begin
  select id, username into v_id, v_un from public.profiles where lower(username) = lower(p_username);
  if v_id is null or not private.visible_to(v_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'arcades', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'id', a.id, 'name', private.arc_place(a.id) ->> 'arcade', 'plots', coalesce(g.plot_count, 1),
          'level', (private.arc_level(a.xp) ->> 'level')::int, 'plays', a.plays, 'neon', a.decor ->> 'neon',
          'machines', (select count(*) from jsonb_object_keys(a.machines)),
          'emojis', (select coalesce(jsonb_agg(v_cfg -> 'games' -> k ->> 'emoji' order by (v_cfg -> 'games' -> k ->> 'order')::int), '[]'::jsonb) from jsonb_object_keys(a.machines) k),
          'rarity', private.group_rarity(a.group_id),
          'playing', (select count(*) from public.arcade_presence ap where ap.arcade_id = a.id
                        and ap.seen_at > now() - make_interval(secs => coalesce((v_cfg -> 'live' ->> 'stale_seconds')::int, 12)))) x
        from public.arcades a join public.canvas_groups g on g.id = a.group_id and g.kind = 'arcade' and g.status = 'active'
        where a.owner_id = v_id order by a.plays desc, a.xp desc limit 1) t), '[]'::jsonb),
    'habitats', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'id', h.id, 'name', case when h.kind = 'starter' then v_un || '’s home sanctuary' else private.place_name(g.name, v_un, 'Sanctuary') end,
          'plots', coalesce(g.plot_count, 0), 'starter', h.kind = 'starter',
          'residents', (select count(*) from public.inkborn c where c.habitat_id = h.id),
          'genomes', (select coalesce(jsonb_agg(c.genome order by c.created_at), '[]'::jsonb) from (select genome, created_at from public.inkborn c2 where c2.habitat_id = h.id order by c2.created_at limit 3) c),
          'rarity', private.group_rarity(h.group_id)) x
        from public.habitats h left join public.canvas_groups g on g.id = h.group_id
        where h.owner_id = v_id and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))
        order by (select count(*) from public.inkborn c where c.habitat_id = h.id) desc, coalesce(g.plot_count, 0) desc, h.kind = 'starter' limit 1) t), '[]'::jsonb),
    'farms', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', f.id, 'name', private.place_name(g.name, v_un, 'Farm'), 'plots', g.plot_count, 'harvests', f.harvests,
                                  'rarity', private.group_rarity(f.group_id)) x
        from public.farms f join public.canvas_groups g on g.id = f.group_id and g.kind = 'farm' and g.status = 'active'
        where f.owner_id = v_id order by f.harvests desc, g.plot_count desc limit 1) t), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', b.id, 'name', private.place_name(g.name, v_un, 'Business'), 'plots', g.plot_count, 'tips', b.tips,
                                  'alltime', coalesce((select alltime from public.biz_state s where s.player_id = v_id), 0),
                                  'rarity', private.group_rarity(b.group_id)) x
        from public.businesses b join public.canvas_groups g on g.id = b.group_id and g.kind = 'business' and g.status = 'active'
        where b.owner_id = v_id order by b.tips desc, g.plot_count desc limit 1) t), '[]'::jsonb));
end $$;
