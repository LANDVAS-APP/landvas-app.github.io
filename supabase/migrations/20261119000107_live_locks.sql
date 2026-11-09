-- v0.7.4 Check-ins no longer wait in line behind everyone else in the room.
--
-- Every check-in for planets, arcades, arenas and homes took a lock on the whole room (for arenas, on every arena in
-- the game at once), so with many players in one place each check-in queued behind all the others. The lock is only
-- needed when someone joins and is placed into a group (so two people can't both take a group's last spot). A
-- check-in from someone already in their group only refreshes their own row, so it now skips the lock entirely.
--
-- Room upkeep (closing lobbies nobody started, paying out rounds that ran out of time, closing abandoned home games)
-- also ran inside every check-in. It now runs only when nobody else is doing it at that moment; otherwise that
-- check-in skips it and someone else's does it a moment later. Payouts still lock their match row and check its
-- status first, so a round can't pay twice. What players see and get is unchanged.

-- ── planets ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.planet_live(p_world text, p_d jsonb default null, p_face jsonb default null, p_hop real default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  s public.space_pilots%rowtype;
  v_cfg jsonb := coalesce(private.planet_cfg() -> 'live', '{}'::jsonb);
  v_max int := coalesce((v_cfg ->> 'group_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((v_cfg ->> 'stale_seconds')::int, 15));
  me public.planet_presence%rowtype;
  v_shard int; v_new boolean := false; v_d float8[] := private.unit3(p_d); v_face float8[] := private.unit3(p_face);
  v_spawn jsonb;
begin
  perform private.rate_limit('planet_live', 9000, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  if not private.planet_open(v_uid, p_world) and p_world not like 'exo:%' then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  select * into me from public.planet_presence where player_id = v_uid;
  if found and me.world = p_world and me.seen_at > now() - v_stale then
    v_shard := me.shard;
  else
    v_new := true;
    -- only joining needs the world's lock (two arrivals can't both take a group's last spot)
    perform pg_advisory_xact_lock(hashtext('planet-live:' || p_world));
    -- the fullest live group that still has room; else the first free group number
    select shard into v_shard from public.planet_presence
     where world = p_world and seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
       where not exists (select 1 from public.planet_presence where world = p_world and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
    -- land right next to someone who's here
    select jsonb_build_object('d', to_jsonb(p.d), 'player', p.player_id) into v_spawn from public.planet_presence p
     where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid
     order by p.seen_at desc limit 1;
  end if;
  if v_new and p_world not like 'exo:%' and not exists (select 1 from public.feed_events where kind = 'exploring' and player_id = v_uid and data ->> 'world' = p_world and created_at > now() - interval '30 minutes') then
    insert into public.feed_events (kind, player_id, data) values ('exploring', v_uid, jsonb_build_object('world', p_world, 'shard', v_shard));
  end if;
  insert into public.planet_presence (player_id, world, shard, d, face, hop, joined_at, seen_at)
  values (v_uid, p_world, v_shard, coalesce(v_d, array[0, 0, 1]::float8[]), coalesce(v_face, array[0, 1, 0]::float8[]), greatest(0, least(50, coalesce(p_hop, 0))), now(), now() + private.presence_lease())
  on conflict (player_id) do update set world = excluded.world, shard = excluded.shard,
    d = coalesce(v_d, case when v_new then excluded.d else planet_presence.d end),
    face = coalesce(v_face, planet_presence.face), hop = excluded.hop,
    joined_at = case when v_new then now() else planet_presence.joined_at end, seen_at = now() + private.presence_lease();
  return jsonb_build_object(
    'world', p_world, 'shard', v_shard, 'joined', v_new, 'spawn', v_spawn, 'group_size', v_max,
    'channel', 'planet:' || p_world || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('d', to_jsonb(p.d), 'face', to_jsonb(p.face), 'hop', p.hop,
                  'companion', private.companion_json(p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.planet_presence p
                where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'on_world', (select count(*) from public.planet_presence where world = p_world and seen_at > now() - v_stale));
end $$;

-- ── arcades ─────────────────────────────────────────────────────────────────────────────────────────────────────
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
  select * into me from public.arcade_presence where player_id = v_uid;
  if found and me.arcade_id = p_arcade and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    perform pg_advisory_xact_lock(hashtext('arcade-live:' || p_arcade));
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
          case when private.arc_cfg() -> 'games' ? p_playing then p_playing end, now(), now() + private.presence_lease())
  on conflict (player_id) do update set arcade_id = excluded.arcade_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else arcade_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else arcade_presence.z end),
    playing = excluded.playing, joined_at = case when v_new then now() else arcade_presence.joined_at end, seen_at = now() + private.presence_lease();
  -- lobbies nobody started in time close by themselves; rounds that ran out of time pay out
  -- (one check-in at a time does this; the rest skip it rather than wait)
  if pg_try_advisory_xact_lock(hashtext('arcade-tidy:' || p_arcade)) then
    update public.arcade_matches set status = 'cancelled' where arcade_id = p_arcade and status = 'lobby' and created_at < now() - v_lobby;
    for v_match in select id from public.arcade_matches where arcade_id = p_arcade and status = 'playing' loop perform private.arc_match_settle(v_match); end loop;
  end if;
  v_match := null;
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

-- ── arenas (this lock covered every arena in the game) ──────────────────────────────────────────────────────────
create or replace function public.arena_live(p_x real default null, p_z real default null, p_playing text default null, p_from uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := private.arena_cfg();
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  me public.arena_presence%rowtype; v_shard int; v_new boolean := false; v_match uuid;
begin
  perform private.rate_limit('arena_live', 9000, 3600);
  select * into me from public.arena_presence where player_id = v_uid;
  if found and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    perform pg_advisory_xact_lock(hashtext('arena-live'));
    select shard into v_shard from public.arena_presence where seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 100000) n
       where not exists (select 1 from public.arena_presence where shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
  end if;
  insert into public.arena_presence (player_id, shard, x, z, playing, from_arcade, joined_at, seen_at)
  values (v_uid, v_shard, greatest(-8, least(8, coalesce(p_x, 0))), greatest(-13, least(13, coalesce(p_z, 6))),
          case when (c -> 'games') ? p_playing then p_playing end, p_from, now(), now() + private.presence_lease())
  on conflict (player_id) do update set shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else arena_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else arena_presence.z end),
    playing = excluded.playing, from_arcade = coalesce(p_from, arena_presence.from_arcade),
    joined_at = case when v_new then now() else arena_presence.joined_at end, seen_at = now() + private.presence_lease();
  -- tidy up: lobbies nobody started, and games whose host vanished (one check-in at a time; the rest skip it)
  if pg_try_advisory_xact_lock(hashtext('arena-tidy')) then
    update public.arena_matches set status = 'cancelled' where status = 'lobby' and created_at < now() - make_interval(mins => coalesce((c ->> 'lobby_minutes')::int, 3));
    update public.arena_matches set status = 'cancelled' where status = 'playing' and started_at < now() - make_interval(mins => coalesce((c ->> 'max_minutes')::int, 15));
  end if;
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

-- ── homes and clan halls ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.home_live(p_host uuid, p_x real default null, p_z real default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := private.home_cfg();
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  me public.home_presence%rowtype; v_shard int; v_new boolean := false; v_clan boolean;
begin
  perform private.rate_limit('home_live', 9000, 3600);
  if not private.room_ok(p_host, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_clan := exists (select 1 from public.clans where id = p_host);
  if v_clan then v_max := greatest(v_max, 16); perform private.clan_visit(p_host, v_uid); end if;
  select * into me from public.home_presence where player_id = v_uid;
  if found and me.host_id = p_host and me.seen_at > now() - v_stale then
    v_shard := me.shard;
    if v_clan then perform private.clan_credit(v_uid, 'hall', least(40, greatest(0, floor(extract(epoch from now() - (me.seen_at - private.presence_lease())))))::bigint); end if;
  else
    v_new := true;
    perform pg_advisory_xact_lock(hashtext('home-live:' || p_host));
    if v_uid = p_host then v_shard := 0;
    else
      select shard into v_shard from public.home_presence
       where host_id = p_host and seen_at > now() - v_stale and player_id <> v_uid
       group by shard having count(*) < v_max order by bool_or(player_id = p_host) desc, count(*) desc, shard limit 1;
      if v_shard is null then
        select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
         where not exists (select 1 from public.home_presence where host_id = p_host and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
      end if;
    end if;
  end if;
  insert into public.home_presence (player_id, host_id, shard, x, z, joined_at, seen_at)
  values (v_uid, p_host, v_shard, greatest(-7, least(7, coalesce(p_x, 0))), greatest(-6, least(6, coalesce(p_z, 4.6))), now(), now() + private.presence_lease())
  on conflict (player_id) do update set host_id = excluded.host_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else home_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else home_presence.z end),
    joined_at = case when v_new then now() else home_presence.joined_at end, seen_at = now() + private.presence_lease();
  return jsonb_build_object('shard', v_shard, 'joined', v_new, 'room_size', v_max, 'channel', 'home:' || p_host || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z,
                  'explorer_style', (select explorer_style from public.profiles where id = p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.home_presence p
                where p.host_id = p_host and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_home', (select count(*) from public.home_presence where host_id = p_host and seen_at > now() - v_stale))
    || private.hg_room(v_uid, p_host, v_shard);
end $$;

-- home games upkeep, run by one check-in at a time
create or replace function private.hg_room(p_uid uuid, p_home uuid, p_shard int) returns jsonb
language plpgsql as $$
declare v_mine uuid; v_lobby interval := make_interval(mins => coalesce((private.hg_cfg() ->> 'lobby_minutes')::int, 4));
begin
  if pg_try_advisory_xact_lock(hashtext('home-tidy:' || p_home)) then
    update public.home_games set status = 'cancelled' where home_id = p_home and status = 'lobby' and created_at < now() - v_lobby;
    -- games nobody finished in an hour are closed
    update public.home_games set status = 'cancelled' where home_id = p_home and status = 'playing' and started_at < now() - interval '1 hour';
  end if;
  select gp.game_id into v_mine from public.home_game_players gp join public.home_games g on g.id = gp.game_id
   where gp.player_id = p_uid and g.home_id = p_home and (g.status in ('lobby', 'playing') or g.settled_at > now() - interval '2 minutes')
   order by gp.joined_at desc limit 1;
  return jsonb_build_object(
    'tables', (select coalesce(jsonb_agg(private.hg_json(g.id) order by g.created_at desc), '[]'::jsonb) from public.home_games g
               where g.home_id = p_home and g.shard = p_shard and g.status = 'lobby' and private.visible_to(g.host_id, p_uid)),
    'game', case when v_mine is not null then private.hg_json(v_mine) end);
end $$;
