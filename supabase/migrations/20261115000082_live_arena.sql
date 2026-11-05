-- The Live Arena: one lobby shared by everyone, reached through the portal in any arcade. Whoever's arcade you
-- walk in from, you join a room of up to 10 players from anywhere, and play live head-to-head games together:
--   duel   1v1        teams  2v2        ffa  everyone for themselves (up to 4)        coop  all together
-- The match host's device runs the game and streams it to the others over the room's realtime channel; at the
-- end the host reports the result and the server pays everyone: tickets by place, a little Ink (capped per day so
-- it can't be farmed with spare accounts), and a squad boost — the bigger the squad, the bigger the pay.
-- The squad boost also applies to Versus/Team races on the arcade machines.

create table if not exists public.arena_presence (
  player_id uuid primary key references public.players (id) on delete cascade,
  shard int not null default 0,
  x real not null default 0, z real not null default 6,
  playing text,
  from_arcade uuid references public.arcades (id) on delete set null,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists arena_presence_room_idx on public.arena_presence (shard, seen_at);

create table if not exists public.arena_matches (
  id uuid primary key default gen_random_uuid(),
  shard int not null default 0,
  game text not null,
  mode text not null check (mode in ('duel', 'teams', 'ffa', 'coop')),
  host_id uuid not null references public.players (id) on delete cascade,
  seed int not null default floor(random() * 2147483646)::int,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'done', 'cancelled')),
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  settled_at timestamptz
);
create index if not exists arena_matches_room_idx on public.arena_matches (shard, status, created_at desc);
create table if not exists public.arena_match_players (
  match_id uuid not null references public.arena_matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  slot int, team int, place int,
  tickets int not null default 0, ink numeric not null default 0,
  joined_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists arena_match_players_player_idx on public.arena_match_players (player_id, joined_at desc);
create table if not exists public.arena_ink_days (
  player_id uuid not null references public.players (id) on delete cascade,
  day timestamptz not null, ink numeric not null default 0,
  primary key (player_id, day)
);
alter table public.arena_presence enable row level security;
alter table public.arena_matches enable row level security;
alter table public.arena_match_players enable row level security;
alter table public.arena_ink_days enable row level security;
revoke all on public.arena_presence, public.arena_matches, public.arena_match_players, public.arena_ink_days from anon, authenticated;

update public.game_config set value = value || '{"arena": {
  "room_size": 10, "stale_seconds": 12, "lobby_minutes": 3, "countdown_seconds": 4, "min_seconds": 25, "max_minutes": 15,
  "squad_boost": 0.05, "daily_ink_cap": 20,
  "rewards": {"place_tickets": [40, 25, 18, 12], "team_win_tickets": 40, "team_lose_tickets": 20, "draw_tickets": 25,
              "coop_base_tickets": 10, "coop_wave_tickets": 8, "coop_max_tickets": 140,
              "win_ink": 1.0, "play_ink": 0.5, "coop_wave_ink": 0.25, "coop_max_ink": 2},
  "games": {
    "paintwars": {"order": 1, "name": "Paint Wars",    "emoji": "🎨", "color": "#FF3D9A", "modes": ["ffa", "teams", "duel"], "blurb": "Roll over the floor to paint it your colour. Most paint when time runs out wins."},
    "bumper":    {"order": 2, "name": "Bumper Orbs",   "emoji": "🫧", "color": "#22E3FF", "modes": ["duel", "ffa", "teams"], "blurb": "Shove everyone off the shrinking platform. Last one on wins the round."},
    "trails":    {"order": 3, "name": "Ink Trails",    "emoji": "〰️", "color": "#B6FF3D", "modes": ["duel", "ffa"], "blurb": "Steer your ink line and never cross a trail. Last one drawing wins the round."},
    "volley":    {"order": 4, "name": "Bubble Volley", "emoji": "🏐", "color": "#FFB13D", "modes": ["duel", "teams"], "blurb": "Bounce the bubble over the net. First side to 7 wins."},
    "meteor":    {"order": 5, "name": "Meteor Guard",  "emoji": "☄️", "color": "#B57BFF", "modes": ["coop"], "blurb": "Together, guard the core from waves of meteors. How many waves can you last?"}
  }
}}'::jsonb where key = 'arcade';

create or replace function private.arena_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('arcade') -> 'arena', '{}'::jsonb) $$;
create or replace function private.arena_need(p_mode text) returns int4range language sql immutable as $$
  select case p_mode when 'duel' then int4range(2, 2, '[]') when 'teams' then int4range(4, 4, '[]') when 'ffa' then int4range(2, 4, '[]') else int4range(2, 4, '[]') end
$$;

create or replace function private.arena_match_json(p_match uuid, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'game', m.game, 'mode', m.mode, 'status', m.status, 'host', m.host_id,
    'seed', case when m.status <> 'lobby' then m.seed end, 'result', m.result,
    'created_at', m.created_at, 'started_at', m.started_at, 'server_time', now(),
    'players', (select coalesce(jsonb_agg(private.profile_json(mp.player_id) || jsonb_build_object(
                  'slot', mp.slot, 'team', mp.team, 'place', mp.place, 'tickets', mp.tickets, 'ink', mp.ink) order by mp.slot nulls last, mp.joined_at), '[]'::jsonb)
                from public.arena_match_players mp where mp.match_id = m.id))
  from public.arena_matches m where m.id = p_match
$$;

create or replace function private.arena_here(p_uid uuid) returns public.arena_presence language sql stable as $$
  select * from public.arena_presence where player_id = p_uid and seen_at > now() - make_interval(secs => coalesce((private.arena_cfg() ->> 'stale_seconds')::int, 12))
$$;

-- ===== presence ===============================================================================================
create or replace function public.arena_live(p_x real default null, p_z real default null, p_playing text default null, p_from uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := private.arena_cfg();
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  me public.arena_presence%rowtype; v_shard int; v_new boolean := false; v_match uuid;
begin
  perform private.rate_limit('arena_live', 9000, 3600);
  perform pg_advisory_xact_lock(hashtext('arena-live'));
  select * into me from public.arena_presence where player_id = v_uid;
  if found and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    select shard into v_shard from public.arena_presence where seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 100000) n
       where not exists (select 1 from public.arena_presence where shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
  end if;
  insert into public.arena_presence (player_id, shard, x, z, playing, from_arcade, joined_at, seen_at)
  values (v_uid, v_shard, greatest(-8, least(8, coalesce(p_x, 0))), greatest(-13, least(13, coalesce(p_z, 6))),
          case when (c -> 'games') ? p_playing then p_playing end, p_from, now(), now())
  on conflict (player_id) do update set shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else arena_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else arena_presence.z end),
    playing = excluded.playing, from_arcade = coalesce(p_from, arena_presence.from_arcade),
    joined_at = case when v_new then now() else arena_presence.joined_at end, seen_at = now();
  -- tidy up: lobbies nobody started, and games whose host vanished
  update public.arena_matches set status = 'cancelled' where status = 'lobby' and created_at < now() - make_interval(mins => coalesce((c ->> 'lobby_minutes')::int, 3));
  update public.arena_matches set status = 'cancelled' where status = 'playing' and started_at < now() - make_interval(mins => coalesce((c ->> 'max_minutes')::int, 15));
  select mp.match_id into v_match from public.arena_match_players mp join public.arena_matches m on m.id = mp.match_id
   where mp.player_id = v_uid and (m.status in ('lobby', 'playing') or m.settled_at > now() - interval '2 minutes')
   order by mp.joined_at desc limit 1;
  return jsonb_build_object(
    'shard', v_shard, 'joined', v_new, 'room_size', v_max, 'channel', 'arena:' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z, 'playing', p.playing) order by p.joined_at), '[]'::jsonb)
                from public.arena_presence p where p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_arena', (select count(*) from public.arena_presence where seen_at > now() - v_stale),
    'lobbies', (select coalesce(jsonb_agg(private.arena_match_json(m.id, v_uid) order by m.created_at desc), '[]'::jsonb)
                from public.arena_matches m where m.shard = v_shard and m.status = 'lobby' and private.visible_to(m.host_id, v_uid)),
    'match', case when v_match is not null then private.arena_match_json(v_match, v_uid) end);
end $$;

create or replace function public.arena_leave() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.arena_presence where player_id = v_uid;
  delete from public.arena_match_players mp using public.arena_matches m where mp.match_id = m.id and m.status = 'lobby' and mp.player_id = v_uid;
  update public.arena_matches set status = 'cancelled' where host_id = v_uid and status = 'lobby';
end $$;

-- ===== lobbies ================================================================================================
create or replace function public.arena_create(p_game text, p_mode text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g jsonb := private.arena_cfg() -> 'games' -> p_game; me public.arena_presence%rowtype; v_id uuid;
begin
  perform private.rate_limit('arena_match', 120, 3600);
  if g is null or not ((g -> 'modes') ? p_mode) then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  me := private.arena_here(v_uid);
  if me.player_id is null then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  delete from public.arena_match_players mp using public.arena_matches m where mp.match_id = m.id and m.status = 'lobby' and mp.player_id = v_uid;
  update public.arena_matches set status = 'cancelled' where host_id = v_uid and status = 'lobby';
  insert into public.arena_matches (shard, game, mode, host_id) values (me.shard, p_game, p_mode, v_uid) returning id into v_id;
  insert into public.arena_match_players (match_id, player_id) values (v_id, v_uid);
  return private.arena_match_json(v_id, v_uid);
end $$;

create or replace function public.arena_join(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arena_matches%rowtype; me public.arena_presence%rowtype; v_n int;
begin
  select * into m from public.arena_matches where id = p_match for update;
  if not found or m.status <> 'lobby' or not private.visible_to(m.host_id, v_uid) then raise exception 'match_closed' using errcode = 'P0001'; end if;
  me := private.arena_here(v_uid);
  if me.player_id is null or me.shard <> m.shard then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  if exists (select 1 from public.arena_match_players where match_id = m.id and player_id = v_uid) then return private.arena_match_json(m.id, v_uid); end if;
  select count(*) into v_n from public.arena_match_players where match_id = m.id;
  if v_n >= upper(private.arena_need(m.mode)) - 1 then raise exception 'match_full' using errcode = 'P0001'; end if;
  delete from public.arena_match_players mp using public.arena_matches x where mp.match_id = x.id and x.status = 'lobby' and mp.player_id = v_uid;
  update public.arena_matches set status = 'cancelled' where host_id = v_uid and status = 'lobby';
  insert into public.arena_match_players (match_id, player_id) values (m.id, v_uid);
  return private.arena_match_json(m.id, v_uid);
end $$;

create or replace function public.arena_leave_match(p_match uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arena_matches%rowtype;
begin
  select * into m from public.arena_matches where id = p_match for update;
  if not found or m.status <> 'lobby' then return; end if;
  delete from public.arena_match_players where match_id = m.id and player_id = v_uid;
  if m.host_id = v_uid or not exists (select 1 from public.arena_match_players where match_id = m.id) then update public.arena_matches set status = 'cancelled' where id = m.id; end if;
end $$;

/** The host starts it: players get their slots (and teams, alternating, in 2v2) and everyone counts down together. */
create or replace function public.arena_start(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arena_matches%rowtype; v_n int; r record; i int := 0;
begin
  select * into m from public.arena_matches where id = p_match for update;
  if not found or m.status <> 'lobby' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if m.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.arena_match_players where match_id = m.id;
  if not (private.arena_need(m.mode) @> v_n) then raise exception 'need_players' using errcode = 'P0001'; end if;
  for r in select player_id from public.arena_match_players where match_id = m.id order by joined_at loop
    update public.arena_match_players set slot = i, team = case when m.mode = 'teams' then i % 2 end where match_id = m.id and player_id = r.player_id;
    i := i + 1;
  end loop;
  update public.arena_matches set status = 'playing',
    started_at = now() + make_interval(secs => coalesce((private.arena_cfg() ->> 'countdown_seconds')::int, 4)) where id = m.id;
  return private.arena_match_json(m.id, v_uid);
end $$;

/** A little Ink from the arena, capped per day (so spare accounts can't farm it). Fractions carry over. */
create or replace function private.arena_ink(p_uid uuid, p_amount numeric, p_ref text) returns numeric language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_had numeric; v_cap numeric := coalesce((private.arena_cfg() ->> 'daily_ink_cap')::numeric, 20);
  v_give numeric; v_frac numeric; v_whole int;
begin
  insert into public.arena_ink_days (player_id, day) values (p_uid, v_day) on conflict do nothing;
  select ink into v_had from public.arena_ink_days where player_id = p_uid and day = v_day for update;
  v_give := greatest(0, least(p_amount, v_cap - v_had));
  if v_give <= 0 then return 0; end if;
  update public.arena_ink_days set ink = ink + v_give where player_id = p_uid and day = v_day;
  perform private.arc_player(p_uid);
  select ink_frac + v_give into v_frac from public.arcade_players where player_id = p_uid;
  v_whole := floor(v_frac)::int;
  perform private.arc_pay(p_uid, v_whole, p_ref, p_ref || ':' || p_uid);
  update public.arcade_players set ink_frac = v_frac - v_whole where player_id = p_uid;
  return v_give;
end $$;

/** The host reports how it went; the server checks it and pays everyone (once). */
create or replace function public.arena_report(p_match uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arena_matches%rowtype; c jsonb := private.arena_cfg(); rw jsonb := c -> 'rewards';
  v_n int; v_boost numeric; r record; v_place int; v_tix int; v_ink numeric; v_win int; v_waves int; v_ids uuid[];
begin
  select * into m from public.arena_matches where id = p_match for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if m.status = 'done' then return private.arena_match_json(m.id, v_uid); end if;
  if m.status <> 'playing' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if m.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  if m.started_at > now() - make_interval(secs => coalesce((c ->> 'min_seconds')::int, 25)) then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  select count(*), array_agg(player_id) into v_n, v_ids from public.arena_match_players where match_id = m.id;
  v_boost := 1 + coalesce((c ->> 'squad_boost')::numeric, 0.05) * (v_n - 1);
  if m.mode in ('duel', 'ffa') then
    -- places 1..n for every player (ties allowed)
    if jsonb_typeof(p_result -> 'places') <> 'object' then raise exception 'invalid_result' using errcode = 'P0001'; end if;
    for r in select player_id from public.arena_match_players where match_id = m.id loop
      v_place := (p_result -> 'places' ->> r.player_id::text)::int;
      if v_place is null or v_place < 1 or v_place > v_n then raise exception 'invalid_result' using errcode = 'P0001'; end if;
      v_tix := coalesce((rw -> 'place_tickets' ->> least(v_place, 4) - 1)::int, 10);
      v_ink := case when v_place = 1 then coalesce((rw ->> 'win_ink')::numeric, 1) else coalesce((rw ->> 'play_ink')::numeric, 0.5) end;
      update public.arena_match_players set place = v_place, tickets = floor(v_tix * v_boost)::int, ink = round(v_ink * v_boost, 3) where match_id = m.id and player_id = r.player_id;
    end loop;
  elsif m.mode = 'teams' then
    v_win := (p_result ->> 'winner')::int; -- 0, 1, or null for a draw
    if v_win is not null and v_win not in (0, 1) then raise exception 'invalid_result' using errcode = 'P0001'; end if;
    update public.arena_match_players set
      place = case when v_win is null then 1 when team = v_win then 1 else 2 end,
      tickets = floor(case when v_win is null then coalesce((rw ->> 'draw_tickets')::int, 25) when team = v_win then coalesce((rw ->> 'team_win_tickets')::int, 40) else coalesce((rw ->> 'team_lose_tickets')::int, 20) end * v_boost)::int,
      ink = round(case when v_win is not null and team = v_win then coalesce((rw ->> 'win_ink')::numeric, 1) else coalesce((rw ->> 'play_ink')::numeric, 0.5) end * v_boost, 3)
    where match_id = m.id;
  else
    v_waves := greatest(0, least(200, coalesce((p_result ->> 'waves')::int, 0)));
    -- a wave takes at least a few seconds: no more waves than the game could have had
    v_waves := least(v_waves, floor(extract(epoch from now() - m.started_at) / 6)::int);
    update public.arena_match_players set place = 1,
      tickets = floor(least(coalesce((rw ->> 'coop_max_tickets')::int, 140), coalesce((rw ->> 'coop_base_tickets')::int, 10) + coalesce((rw ->> 'coop_wave_tickets')::int, 8) * v_waves) * v_boost)::int,
      ink = round(least(coalesce((rw ->> 'coop_max_ink')::numeric, 2), coalesce((rw ->> 'coop_wave_ink')::numeric, 0.25) * v_waves) * v_boost, 3)
    where match_id = m.id;
    p_result := jsonb_build_object('waves', v_waves);
  end if;
  -- pay
  for r in select player_id, tickets, ink from public.arena_match_players where match_id = m.id loop
    perform private.arc_player(r.player_id);
    update public.arcade_players set tickets = tickets + r.tickets, lifetime = lifetime + r.tickets where player_id = r.player_id;
    update public.arena_match_players set ink = private.arena_ink(r.player_id, r.ink, 'arena:' || m.id) where match_id = m.id and player_id = r.player_id;
  end loop;
  update public.arena_matches set status = 'done', settled_at = now(), result = p_result || jsonb_build_object('players', v_n, 'boost', v_boost) where id = m.id;
  return private.arena_match_json(m.id, v_uid);
end $$;

create or replace function public.arena_get(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if not exists (select 1 from public.arena_match_players where match_id = p_match and player_id = v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return private.arena_match_json(p_match, v_uid);
end $$;

do $$ declare f text; begin
  foreach f in array array['public.arena_live(real, real, text, uuid)', 'public.arena_leave()', 'public.arena_create(text, text)', 'public.arena_join(uuid)',
    'public.arena_leave_match(uuid)', 'public.arena_start(uuid)', 'public.arena_report(uuid, jsonb)', 'public.arena_get(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ===== the squad boost on Versus / Team races too ==============================================================
create or replace function private.arc_match_settle(p_match uuid) returns void language plpgsql as $$
declare m public.arcade_matches%rowtype; c jsonb := coalesce(private.cfg('arcade') -> 'match', '{}'::jsonb);
  v_all boolean; v_top int; v_total int; r record; v_b int; v_n int; v_boost numeric; v_inkf numeric; v_whole int; g jsonb;
begin
  select * into m from public.arcade_matches where id = p_match for update;
  if not found or m.status <> 'playing' then return; end if;
  select bool_and(ap.finished_at is not null), count(*) into v_all, v_n
    from public.arcade_match_players mp left join public.arcade_plays ap on ap.id = mp.session where mp.match_id = m.id;
  if not coalesce(v_all, false) and m.started_at > now() - make_interval(mins => coalesce((c ->> 'round_minutes')::int, 6)) then return; end if;
  v_boost := coalesce((private.arena_cfg() ->> 'squad_boost')::numeric, 0.05) * (v_n - 1);
  g := private.arc_cfg() -> 'games' -> m.game;
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
    -- squad boost: a little more for everyone who played, the bigger the squad
    if r.score > 0 then
      v_b := v_b + ceil(r.tickets * v_boost)::int;
      perform private.arc_player(r.player_id);
      select ink_frac + r.score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 200)) * v_boost into v_inkf from public.arcade_players where player_id = r.player_id;
      v_whole := floor(v_inkf)::int;
      perform private.arc_pay(r.player_id, v_whole, 'arcade-match:' || m.id, 'arcade-match:' || m.id || ':' || r.player_id);
      update public.arcade_players set ink_frac = v_inkf - v_whole where player_id = r.player_id;
    end if;
    if v_b > 0 then
      insert into public.arcade_players (player_id) values (r.player_id) on conflict (player_id) do nothing;
      update public.arcade_players set tickets = tickets + v_b, lifetime = lifetime + v_b where player_id = r.player_id;
      update public.arcade_match_players set bonus = v_b where match_id = m.id and player_id = r.player_id;
    end if;
  end loop;
  update public.arcade_matches set status = 'done', settled_at = now() where id = m.id;
end $$;
