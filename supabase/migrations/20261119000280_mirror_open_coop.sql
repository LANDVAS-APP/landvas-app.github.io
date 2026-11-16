-- The Mirror Arcade, for everyone — and together:
--  * Every arcade shows its 🪞 Mirror door now. Walk through for 25,000 tickets (once, for good), or find the way in
--    yourself (the hidden recipe still works, still pays its finder's bounty, and still isn't written anywhere).
--  * Co-op on the other side of the glass: you see whoever else is in that arcade's mirror, and Versus or Co-op rounds
--    work at every mirrored cabinet and the mirror's own four, exactly like the front hall (Classic or Endless, 2-4
--    players, bonus tickets). The rounds are ordinary mirror rounds (×Ink, uncapped).
--  * Under the hood the mirror shares the front's match tables: a match and a place in the room each have a side
--    ('front' or 'mirror'); a mirror match's rounds live in arcade_mirror_plays.

-- ===== who has it, and how ==================================================================================================
alter table public.arcade_mirror_found add column if not exists how text not null default 'found';
alter table public.arcade_mirror_found drop constraint if exists arcade_mirror_found_how_check;
alter table public.arcade_mirror_found add constraint arcade_mirror_found_how_check check (how in ('found', 'bought', 'granted'));
update private.arcade_secrets set cfg = cfg || '{"price_tickets": 25000}'::jsonb where id = 'mirror' and not (cfg ? 'price_tickets');

-- the admin page can set the price (0 = free for everyone)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_arcade_secret_save(text, jsonb)'::regprocedure);
  n := replace(d, $a$  if p_cfg ? 'window_minutes' and$a$,
                  $b$  if p_cfg ? 'price_tickets' and coalesce((p_cfg ->> 'price_tickets')::numeric, -1) not between 0 and 100000000 then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  if p_cfg ? 'window_minutes' and$b$);
  if n = d then raise exception 'mirror_open: admin save anchor not found'; end if;
  execute n;
end $$;

-- not in yet: what it costs (and what you have); in: how you got in
do $$
declare d text; n text; m text;
begin
  d := pg_get_functiondef('public.arcade_mirror_get()'::regprocedure);
  n := replace(d, $a$  if not private.mir_found(v_uid) then return '{"found": false}'::jsonb; end if;$a$,
                  $b$  if not private.mir_found(v_uid) then
    return jsonb_build_object('found', false, 'open', coalesce((c ->> 'enabled')::boolean, true),
      'price', coalesce((c ->> 'price_tickets')::int, 25000), 'tickets', coalesce((select tickets from public.arcade_players where player_id = v_uid), 0));
  end if;$b$);
  if n = d then raise exception 'mirror_open: mirror_get anchor not found'; end if;
  m := replace(n, $a$'found_at', (select found_at from public.arcade_mirror_found where player_id = v_uid),$a$,
                  $b$'found_at', (select found_at from public.arcade_mirror_found where player_id = v_uid), 'how', (select how from public.arcade_mirror_found where player_id = v_uid),$b$);
  if m = n then raise exception 'mirror_open: mirror_get found_at anchor not found'; end if;
  execute m;
end $$;

/** Walk through the glass for tickets (once, for good). */
create or replace function public.arcade_mirror_buy() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mir_cfg();
  v_price int := greatest(0, coalesce((c ->> 'price_tickets')::int, 25000));
begin
  perform private.rate_limit('arcade_mirror_buy', 30, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if private.mir_found(v_uid) then return public.arcade_mirror_get(); end if;
  perform private.arc_player(v_uid);
  update public.arcade_players set tickets = tickets - v_price where player_id = v_uid and tickets >= v_price;
  if not found then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
  insert into public.arcade_mirror_found (player_id, how) values (v_uid, 'bought') on conflict (player_id) do nothing;
  return public.arcade_mirror_get();
end $$;

-- ===== the two sides of an arcade =========================================================================================
alter table public.arcade_presence add column if not exists side text not null default 'front';
alter table public.arcade_presence drop constraint if exists arcade_presence_side_check;
alter table public.arcade_presence add constraint arcade_presence_side_check check (side in ('front', 'mirror'));
alter table public.arcade_matches add column if not exists side text not null default 'front';
alter table public.arcade_matches drop constraint if exists arcade_matches_side_check;
alter table public.arcade_matches add constraint arcade_matches_side_check check (side in ('front', 'mirror'));
alter table public.arcade_match_players add column if not exists mirror_session uuid references public.arcade_mirror_plays (id) on delete set null;
create index if not exists arcade_match_players_mirror_session_idx on public.arcade_match_players (mirror_session);

/** a match round, from whichever side it was played on */
create or replace view private.arc_match_rounds as
  select id, score, finished_at, tickets, reward_score from public.arcade_plays
  union all
  select id, score, finished_at, tickets, reward_score from public.arcade_mirror_plays;

-- the front hall only ever sees the front: its room, its lobbies, its matches
do $$
declare d text; n text; a text[]; b text[]; i int;
begin
  d := pg_get_functiondef('public.arcade_live(uuid, real, real, text)'::regprocedure);
  n := d;
  a := array[
    $x$if found and me.arcade_id = p_arcade and me.seen_at > now() - v_stale then v_shard := me.shard;$x$,
    $x$     where arcade_id = p_arcade and seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;$x$,
    $x$playing = excluded.playing, joined_at = case when v_new then now() else arcade_presence.joined_at end, seen_at = now() + private.presence_lease();$x$,
    $x$where mp.player_id = v_uid and m.arcade_id = p_arcade and (m.status in ('lobby', 'playing') or m.settled_at > now() - interval '2 minutes')$x$,
    $x$where p.arcade_id = p_arcade and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),$x$,
    $x$from public.arcade_matches m where m.arcade_id = p_arcade and m.shard = v_shard and m.status = 'lobby'$x$];
  b := array[
    $x$if found and me.arcade_id = p_arcade and me.side = 'front' and me.seen_at > now() - v_stale then v_shard := me.shard;$x$,
    $x$     where arcade_id = p_arcade and side = 'front' and seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;$x$,
    $x$playing = excluded.playing, joined_at = case when v_new then now() else arcade_presence.joined_at end, seen_at = now() + private.presence_lease(), side = 'front';$x$,
    $x$where mp.player_id = v_uid and m.arcade_id = p_arcade and m.side = 'front' and (m.status in ('lobby', 'playing') or m.settled_at > now() - interval '2 minutes')$x$,
    $x$where p.arcade_id = p_arcade and p.shard = v_shard and p.side = 'front' and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),$x$,
    $x$from public.arcade_matches m where m.arcade_id = p_arcade and m.shard = v_shard and m.side = 'front' and m.status = 'lobby'$x$];
  for i in 1 .. array_length(a, 1) loop
    if position(a[i] in n) = 0 then raise exception 'mirror_coop: arcade_live anchor % not found', i; end if;
    n := replace(n, a[i], b[i]);
  end loop;
  execute n;
end $$;

-- a match's scores and payouts read the round from whichever side it was played on
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.arc_match_json(uuid, uuid)'::regprocedure);
  n := replace(d, $a$left join public.arcade_plays ap on ap.id = mp.session$a$, $b$left join private.arc_match_rounds ap on ap.id = coalesce(mp.session, mp.mirror_session)$b$);
  n := replace(n, $a$'session', case when mp.player_id = p_viewer then mp.session end)$a$, $b$'session', case when mp.player_id = p_viewer then coalesce(mp.session, mp.mirror_session) end)$b$);
  n := replace(n, $a$'id', m.id, 'arcade_id', m.arcade_id,$a$, $b$'id', m.id, 'side', m.side, 'arcade_id', m.arcade_id,$b$);
  n := replace(n, $a$'level', (select coalesce((a.machines ->> m.game)::int, 1) from public.arcades a where a.id = m.arcade_id))$a$,
                  $b$'level', case when m.side = 'mirror' then 1 else (select coalesce((a.machines ->> m.game)::int, 1) from public.arcades a where a.id = m.arcade_id) end)$b$);
  if n = d or position('arc_match_rounds' in n) = 0 or position('''side'', m.side' in n) = 0 or position('when m.side = ''mirror'' then 1' in n) = 0
     or position('coalesce(mp.session, mp.mirror_session) end' in n) = 0 then raise exception 'mirror_coop: arc_match_json anchors not found'; end if;
  execute n;

  d := pg_get_functiondef('private.arc_match_settle(uuid)'::regprocedure);
  n := replace(d, $a$left join public.arcade_plays ap on ap.id = mp.session$a$, $b$left join private.arc_match_rounds ap on ap.id = coalesce(mp.session, mp.mirror_session)$b$);
  n := replace(n, $a$g := private.arc_cfg() -> 'games' -> m.game;$a$, $b$g := case when m.side = 'mirror' then private.mir_game(m.game) else private.arc_cfg() -> 'games' -> m.game end;$b$);
  if n = d or position('public.arcade_plays' in n) > 0 or position('private.mir_game(m.game)' in n) = 0 then raise exception 'mirror_coop: arc_match_settle anchors not found'; end if;
  execute n;

  -- joining: you have to be on the same side of the glass (and a mirror cabinet's own target)
  d := pg_get_functiondef('public.arcade_match_join(uuid)'::regprocedure);
  n := replace(d, $a$if me.player_id is null or me.shard <> m.shard then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;$a$,
                  $b$if me.player_id is null or me.shard <> m.shard or me.side <> m.side then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  if m.side = 'mirror' and not private.mir_found(v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;$b$);
  n := replace(n, $a$(private.arc_cfg() -> 'games' -> m.game ->> 'points_per_ink')$a$, $b$(coalesce(private.arc_cfg() -> 'games' -> m.game, private.mir_game(m.game)) ->> 'points_per_ink')$b$);
  if n = d or position('me.side <> m.side' in n) = 0 or position('private.mir_game(m.game)' in n) = 0 then raise exception 'mirror_coop: arcade_match_join anchors not found'; end if;
  execute n;

  d := pg_get_functiondef('public.arcade_match_leave(uuid)'::regprocedure);
  n := replace(d, $a$(private.arc_cfg() -> 'games' -> m.game ->> 'points_per_ink')$a$, $b$(coalesce(private.arc_cfg() -> 'games' -> m.game, private.mir_game(m.game)) ->> 'points_per_ink')$b$);
  if n = d then raise exception 'mirror_coop: arcade_match_leave anchor not found'; end if;
  execute n;

  -- Classic or Endless for a mirror cabinet's own games too
  d := pg_get_functiondef('public.arcade_match_set_play(uuid, text)'::regprocedure);
  n := replace(d, $a$g := coalesce(private.arc_cfg() -> 'games' -> m.game, private.arc_cfg() -> 'carnival' -> 'games' -> m.game);$a$,
                  $b$g := coalesce(private.arc_cfg() -> 'games' -> m.game, private.arc_cfg() -> 'carnival' -> 'games' -> m.game, private.mir_game(m.game));$b$);
  if n = d then raise exception 'mirror_coop: arcade_match_set_play anchor not found'; end if;
  execute n;
end $$;

/** The mirror side of an arcade: who else is through the glass (a room of up to 10, your party first), its open lobbies
    and your match. Same shape as arcade_live. */
create or replace function public.arcade_mirror_live(p_arcade uuid, p_x real default null, p_z real default null, p_playing text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); a public.arcades%rowtype;
  c jsonb := coalesce(private.cfg('arcade') -> 'live', '{}'::jsonb);
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  v_lobby interval := make_interval(mins => coalesce((private.cfg('arcade') -> 'match' ->> 'lobby_minutes')::int, 3));
  me public.arcade_presence%rowtype; v_shard int; v_new boolean := false; v_match uuid;
begin
  perform private.rate_limit('arcade_live', 9000, 3600);
  if not private.mir_found(v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into a from public.arcades where id = p_arcade;
  if not found or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into me from public.arcade_presence where player_id = v_uid;
  if found and me.arcade_id = p_arcade and me.side = 'mirror' and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    perform pg_advisory_xact_lock(hashtext('arcade-mirror-live:' || p_arcade));
    -- your party's room if it has space, else the fullest room with space, else a new one
    select p.shard into v_shard from public.arcade_presence p join public.travel_group_members gm on gm.player_id = p.player_id
     where gm.group_id = private.my_group(v_uid) and p.player_id <> v_uid and p.arcade_id = p_arcade and p.side = 'mirror' and p.seen_at > now() - v_stale
       and (select count(*) from public.arcade_presence q where q.arcade_id = p_arcade and q.side = 'mirror' and q.shard = p.shard
              and q.seen_at > now() - v_stale and q.player_id <> v_uid) < v_max
     group by p.shard order by count(*) desc, p.shard limit 1;
    if v_shard is null then
      select shard into v_shard from public.arcade_presence
       where arcade_id = p_arcade and side = 'mirror' and seen_at > now() - v_stale and player_id <> v_uid
       group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    end if;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
       where not exists (select 1 from public.arcade_presence where arcade_id = p_arcade and side = 'mirror' and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
  end if;
  insert into public.arcade_presence (player_id, arcade_id, shard, x, z, playing, joined_at, seen_at, side)
  values (v_uid, p_arcade, v_shard, greatest(-8, least(8, coalesce(p_x, 0))), greatest(-13, least(13, coalesce(p_z, 6))),
          case when p_playing is not null and private.mir_game(p_playing) is not null then p_playing end, now(), now() + private.presence_lease(), 'mirror')
  on conflict (player_id) do update set arcade_id = excluded.arcade_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else arcade_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else arcade_presence.z end),
    playing = excluded.playing, joined_at = case when v_new then now() else arcade_presence.joined_at end, seen_at = excluded.seen_at, side = 'mirror';
  if pg_try_advisory_xact_lock(hashtext('arcade-tidy:' || p_arcade)) then
    update public.arcade_matches set status = 'cancelled' where arcade_id = p_arcade and status = 'lobby' and created_at < now() - v_lobby;
    for v_match in select id from public.arcade_matches where arcade_id = p_arcade and status = 'playing' loop perform private.arc_match_settle(v_match); end loop;
  end if;
  v_match := null;
  select mp.match_id into v_match from public.arcade_match_players mp join public.arcade_matches m on m.id = mp.match_id
   where mp.player_id = v_uid and m.arcade_id = p_arcade and m.side = 'mirror' and (m.status in ('lobby', 'playing') or m.settled_at > now() - interval '2 minutes')
   order by mp.joined_at desc limit 1;
  return jsonb_build_object(
    'arcade_id', p_arcade, 'shard', v_shard, 'joined', v_new, 'room_size', v_max, 'side', 'mirror',
    'channel', 'arcade-mirror:' || p_arcade || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z, 'playing', p.playing) order by p.joined_at), '[]'::jsonb)
                from public.arcade_presence p
                where p.arcade_id = p_arcade and p.side = 'mirror' and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_arcade', (select count(*) from public.arcade_presence where arcade_id = p_arcade and side = 'mirror' and seen_at > now() - v_stale),
    'lobbies', (select coalesce(jsonb_agg(private.arc_match_json(m.id, v_uid) order by m.created_at desc), '[]'::jsonb)
                from public.arcade_matches m where m.arcade_id = p_arcade and m.side = 'mirror' and m.shard = v_shard and m.status = 'lobby'
                  and private.visible_to(m.host_id, v_uid)),
    'match', case when v_match is not null then private.arc_match_json(v_match, v_uid) end);
end $$;

/** A Versus or Co-op round at a mirror cabinet (one of the mirrored 16 or the mirror's own four). */
create or replace function public.arcade_mirror_match_create(p_arcade uuid, p_game text, p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); me public.arcade_presence%rowtype; v_id uuid; g jsonb := private.mir_game(p_game);
begin
  perform private.rate_limit('arcade_match', 120, 3600);
  if not private.mir_found(v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if g is null or coalesce(p_mode, '') not in ('versus', 'team') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  me := private.arc_here(v_uid, p_arcade);
  if me.player_id is null or me.side <> 'mirror' then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  delete from public.arcade_match_players mp using public.arcade_matches m where mp.match_id = m.id and m.status = 'lobby' and mp.player_id = v_uid;
  update public.arcade_matches set status = 'cancelled' where host_id = v_uid and status = 'lobby';
  insert into public.arcade_matches (arcade_id, shard, game, mode, host_id, target, side)
  values (p_arcade, me.shard, p_game, p_mode, v_uid, case when p_mode = 'team' then greatest(20, floor(coalesce((g ->> 'points_per_ink')::numeric, 200) / 2)::int) end, 'mirror')
  returning id into v_id;
  insert into public.arcade_match_players (match_id, player_id) values (v_id, v_uid);
  return private.arc_match_json(v_id, v_uid);
end $$;

/** The host starts a mirror match: everyone gets the same mirror round (same seed), starting together. */
create or replace function public.arcade_mirror_match_start(p_match uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arcade_matches%rowtype; r record; v_s uuid;
  v_at timestamptz := now() + make_interval(secs => coalesce((private.cfg('arcade') -> 'match' ->> 'countdown_seconds')::int, 4));
begin
  select * into m from public.arcade_matches where id = p_match for update;
  if not found or m.status <> 'lobby' or m.side <> 'mirror' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if m.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  if (select count(*) from public.arcade_match_players where match_id = m.id) < 2 then raise exception 'need_players' using errcode = 'P0001'; end if;
  for r in select player_id from public.arcade_match_players where match_id = m.id loop
    insert into public.arcade_mirror_plays (player_id, game, seed, mode, started_at) values (r.player_id, m.game, m.seed, coalesce(m.play, 'classic'), v_at) returning id into v_s;
    update public.arcade_match_players set mirror_session = v_s where match_id = m.id and player_id = r.player_id;
  end loop;
  update public.arcade_matches set status = 'playing', started_at = v_at where id = m.id;
  return private.arc_match_json(m.id, v_uid);
end $$;

-- "Looking for players": mirror rounds too, for anyone who can get through the glass
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.lfg_items(uuid)'::regprocedure);
  n := replace(d, $a$'route', '/arcade/' || m.arcade_id, 'at', m.created_at) j, m.created_at at
      from public.arcade_matches m
     where m.status = 'lobby' and m.created_at > now() - interval '20 minutes'$a$,
                  $b$'route', '/arcade/' || m.arcade_id || case when m.side = 'mirror' then '?room=mirror' else '' end, 'at', m.created_at) j, m.created_at at
      from public.arcade_matches m
     where m.status = 'lobby' and m.created_at > now() - interval '20 minutes' and (m.side = 'front' or private.mir_found(p_uid))$b$);
  n := replace(n, $a$'title', coalesce(private.arc_cfg() -> 'games' -> m.game ->> 'name', m.game), 'emoji', private.arc_cfg() -> 'games' -> m.game ->> 'emoji',$a$,
                  $b$'title', case when m.side = 'mirror' then '🪞 ' else '' end || coalesce(private.arc_cfg() -> 'games' -> m.game ->> 'name', private.mir_game(m.game) ->> 'name', m.game),
             'emoji', coalesce(private.arc_cfg() -> 'games' -> m.game ->> 'emoji', private.mir_game(m.game) ->> 'emoji'),$b$);
  if n = d or position('room=mirror' in n) = 0 or position('''🪞 ''' in n) = 0 then raise exception 'mirror_coop: lfg_items anchors not found'; end if;
  execute n;
end $$;

do $$ declare f text; begin
  revoke all on private.arc_match_rounds from public, anon, authenticated;
  foreach f in array array['public.arcade_mirror_buy()', 'public.arcade_mirror_live(uuid, real, real, text)', 'public.arcade_mirror_match_create(uuid, text, text)',
    'public.arcade_mirror_match_start(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
