-- v0.7.3 Who's here, without a database write every few seconds.
--
-- Arcades, arenas, homes and planets used to keep you "in the room" with a check-in every 5-6 seconds, each one a
-- database write. The live channel each room already uses now also tracks who is connected (Realtime presence, no
-- database), so people appear and leave on screen at once, and the check-in only needs to happen about every 30
-- seconds (more often while a match is being set up). A check-in now holds your place for a lease of 35 seconds past
-- its own time, so every rule that asks "were they here in the last few seconds" keeps working between check-ins.
-- Where a rule measured the time since the last check-in (clan hall time, how far you may have walked since, "seen
-- x seconds ago") it now counts from the check-in itself.
create or replace function private.presence_lease() returns interval
language sql stable as $$ select make_interval(secs => coalesce((private.cfg('presence') ->> 'lease_seconds')::int, 35)) $$;

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
          case when private.arc_cfg() -> 'games' ? p_playing then p_playing end, now(), now() + private.presence_lease())
  on conflict (player_id) do update set arcade_id = excluded.arcade_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else arcade_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else arcade_presence.z end),
    playing = excluded.playing, joined_at = case when v_new then now() else arcade_presence.joined_at end, seen_at = now() + private.presence_lease();
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
          case when (c -> 'games') ? p_playing then p_playing end, p_from, now(), now() + private.presence_lease())
  on conflict (player_id) do update set shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else arena_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else arena_presence.z end),
    playing = excluded.playing, from_arcade = coalesce(p_from, arena_presence.from_arcade),
    joined_at = case when v_new then now() else arena_presence.joined_at end, seen_at = now() + private.presence_lease();
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
  perform pg_advisory_xact_lock(hashtext('home-live:' || p_host));
  select * into me from public.home_presence where player_id = v_uid;
  if found and me.host_id = p_host and me.seen_at > now() - v_stale then
    v_shard := me.shard;
    if v_clan then perform private.clan_credit(v_uid, 'hall', least(40, greatest(0, floor(extract(epoch from now() - (me.seen_at - private.presence_lease())))))::bigint); end if;
  else
    v_new := true;
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
  perform pg_advisory_xact_lock(hashtext('planet-live:' || p_world));
  select * into me from public.planet_presence where player_id = v_uid;
  if found and me.world = p_world and me.seen_at > now() - v_stale then
    v_shard := me.shard;
  else
    v_new := true;
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

create or replace function public.space_warp_to_player(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); me public.space_pilots%rowtype; them public.space_pilots%rowtype;
  v_friend boolean; pr public.planet_presence%rowtype; v_in int; v_max int := coalesce((private.planet_cfg() -> 'live' ->> 'group_size')::int, 10);
  v_d float8[]; v_spawn jsonb := null;
begin
  perform private.rate_limit('space_launch', 240, 3600);
  if p_player = v_uid then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if not private.visible_to(p_player, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  me := private.space_pilot(v_uid);
  if cardinality(me.parts) < 4 then raise exception 'rocket_not_built' using errcode = 'P0001'; end if;
  select * into them from public.space_pilots where player_id = p_player;
  if not found or them.location = 'earth' or them.dest is not null then raise exception 'not_in_space' using errcode = 'P0001'; end if;
  v_friend := private.friend_state(v_uid, p_player) = 'friends';
  -- where they are (their last known spot on this world), and whether their live group is still live
  select * into pr from public.planet_presence where player_id = p_player and world = them.location;
  if pr.player_id is not null and pr.seen_at > now() - interval '15 seconds' then
    select count(*) into v_in from public.planet_presence where world = pr.world and shard = pr.shard and seen_at > now() - interval '15 seconds' and player_id <> v_uid;
  else
    v_in := null;
  end if;
  -- a far-off world (someone's home) only with friends; anyone else only into a live group with room
  if them.location like 'exo:%' and not v_friend then raise exception 'not_friends' using errcode = 'P0001'; end if;
  if not v_friend and (v_in is null or v_in >= v_max) then raise exception 'room_full' using errcode = 'P0001'; end if;
  -- warp there (free and instant), and join their live group if it has room
  update public.space_pilots set location = them.location, dest = null, depart_at = null, arrive_at = null, exo_seed = coalesce(them.exo_seed, exo_seed),
         visited = case when them.location = any(visited) then visited else visited || them.location end, launches = launches + 1, updated_at = now()
   where player_id = v_uid returning * into me;
  if pr.player_id is not null then
    v_d := pr.d;
    if v_in is not null and v_in < v_max then
      insert into public.planet_presence (player_id, world, shard, d, face, hop, joined_at, seen_at)
      values (v_uid, pr.world, pr.shard, pr.d, pr.face, 0, now(), now() + private.presence_lease())
      on conflict (player_id) do update set world = excluded.world, shard = excluded.shard, d = excluded.d, face = excluded.face, hop = 0, joined_at = now(), seen_at = now() + private.presence_lease();
    end if;
    v_spawn := jsonb_build_object('d', to_jsonb(v_d), 'player', p_player);
  end if;
  perform private.notify(p_player, 'warp', v_uid, jsonb_build_object('world', them.location, 'joined', v_in is not null and v_in < v_max));
  return private.space_json(me) || jsonb_build_object('warped', true, 'spawn', v_spawn, 'with', private.profile_json(p_player));
end $$;

create or replace function public.planet_meteor_grab(p_world text, p_idx int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m jsonb := private.planet_cfg() -> 'meteors'; s public.space_pilots%rowtype;
  v_every int := coalesce((m ->> 'every_minutes')::int, 10) * 60; v_win bigint := floor(extract(epoch from now()) / v_every);
  v_r float8 := private.planet_radius(p_world);
  met record; v_here float8[]; v_seen timestamptz; v_dist float8; v_ink int; v_paid int;
begin
  perform private.rate_limit('planet_meteor', 300, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  select * into met from private.meteor_list(p_world, v_win) where idx = p_idx;
  if not found then raise exception 'meteor_gone' using errcode = 'P0001'; end if;
  -- where you are: what you report now if it agrees with your last heartbeat, else the heartbeat
  select d, seen_at into v_here, v_seen from public.planet_presence where player_id = v_uid and world = p_world and seen_at > now() - interval '30 seconds';
  if v_here is null then raise exception 'too_far' using errcode = 'P0001'; end if;
  if private.unit3(p_d) is not null and acos(least(1, greatest(-1, v_here[1] * (private.unit3(p_d))[1] + v_here[2] * (private.unit3(p_d))[2] + v_here[3] * (private.unit3(p_d))[3]))) * v_r < 40 + 12 * greatest(0, extract(epoch from now() - (v_seen - private.presence_lease()))) then
    v_here := private.unit3(p_d);
  end if;
  v_dist := acos(least(1, greatest(-1, v_here[1] * met.d[1] + v_here[2] * met.d[2] + v_here[3] * met.d[3]))) * v_r;
  if v_dist > coalesce((m ->> 'reach_m')::int, 22) then raise exception 'too_far' using errcode = 'P0001', detail = round(v_dist)::text; end if;
  v_ink := case when met.golden then coalesce((m ->> 'golden_ink')::int, 20)
           else coalesce((m ->> 'ink_min')::int, 3) + floor(private.h01(p_world || ':' || v_win || ':' || p_idx || ':i') * (coalesce((m ->> 'ink_max')::int, 8) - coalesce((m ->> 'ink_min')::int, 3) + 1))::int end;
  insert into public.planet_meteors (world, win, idx, player_id, ink) values (p_world, v_win, p_idx, v_uid, 0) on conflict do nothing;
  if not found then raise exception 'meteor_taken' using errcode = 'P0001'; end if;
  v_paid := private.planet_pay_world(v_uid, p_world, v_ink, p_world || ':' || v_win || ':' || p_idx, 'meteor:' || p_world || ':' || v_win || ':' || p_idx);
  update public.planet_meteors set ink = v_paid where world = p_world and win = v_win and idx = p_idx;
  return jsonb_build_object('paid', v_paid, 'earned', v_ink, 'golden', met.golden, 'capped', v_paid < v_ink, 'balances', private.balances(v_uid));
end $$;

create or replace function public.planet_find(p_world text, p_kind text, p_idx int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.disc_cfg(); s public.space_pilots%rowtype; v_r float8 := private.planet_radius(p_world);
  v_here float8[]; v_seen timestamptz; v_at float8[]; v_reach float8; v_dist float8; v_ref text; v_ink int := 0; v_paid int := 0; v_items jsonb := '{}'::jsonb; v_sp jsonb; v_pk text; k record;
  wn jsonb; v_day date := (private.day_start(now()))::date; v_rare boolean; v_new_species boolean := false; v_wk text;
begin
  perform private.rate_limit('planet_find', 400, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  if p_kind = 'shard' then
    wn := private.weather_now(p_world);
    if not (now() between (wn ->> 'starts')::timestamptz and (wn ->> 'ends')::timestamptz + interval '20 seconds') or p_idx < 0 or p_idx >= coalesce((c -> 'weather' ->> 'shards')::int, 10) then
      raise exception 'storm_over' using errcode = 'P0001';
    end if;
    v_ref := (wn ->> 'win') || ':' || p_idx;
    v_at := private.near_landing(p_world, 'shard:' || p_world || ':' || v_ref, 15, coalesce((c -> 'weather' ->> 'radius_m')::float8, 220));
    v_reach := coalesce((c -> 'weather' ->> 'reach_m')::float8, 22);
  elsif p_kind = 'alien' then
    if p_idx < 0 or p_idx >= coalesce((c -> 'aliens' ->> 'per_day')::int, 12) then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_ref := v_day || ':' || p_idx;
    v_at := private.near_landing(p_world, 'alien:' || p_world || ':' || v_ref, 25, coalesce((c -> 'aliens' ->> 'radius_m')::float8, 420));
    v_reach := coalesce((c -> 'aliens' ->> 'reach_m')::float8, 14);
  elsif p_kind = 'poi' then
    if p_idx < 0 or p_idx >= coalesce((c -> 'pois' ->> 'count')::int, 40) then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_ref := p_idx::text;
    v_at := private.poi_point(p_world, p_idx);
    v_reach := coalesce((c -> 'pois' ->> 'reach_m')::float8, 10);
  else raise exception 'not_found' using errcode = 'P0001'; end if;
  -- where you are: what you report now if it agrees with your last heartbeat, else the heartbeat
  select d, seen_at into v_here, v_seen from public.planet_presence where player_id = v_uid and world = p_world and seen_at > now() - interval '30 seconds';
  if v_here is null then raise exception 'too_far' using errcode = 'P0001'; end if;
  if private.unit3(p_d) is not null and acos(least(1, greatest(-1, v_here[1] * (private.unit3(p_d))[1] + v_here[2] * (private.unit3(p_d))[2] + v_here[3] * (private.unit3(p_d))[3]))) * v_r < 40 + 12 * greatest(0, extract(epoch from now() - (v_seen - private.presence_lease()))) then
    v_here := private.unit3(p_d);
  end if;
  v_dist := acos(least(1, greatest(-1, v_here[1] * v_at[1] + v_here[2] * v_at[2] + v_here[3] * v_at[3]))) * v_r;
  if v_dist > v_reach then raise exception 'too_far' using errcode = 'P0001', detail = round(v_dist)::text; end if;
  insert into public.planet_finds (player_id, world, kind, ref) values (v_uid, p_world, p_kind, v_ref) on conflict do nothing;
  if not found then raise exception 'already_found' using errcode = 'P0001'; end if;
  -- what it gives
  if p_kind = 'shard' then
    v_wk := private.weather_kind(p_world);
    v_rare := private.h01('shard:' || p_world || ':' || v_ref || ':rare') < 0.2;
    v_items := jsonb_build_object(case when v_rare then c -> 'weather' -> 'kinds' -> v_wk ->> 'rare' else c -> 'weather' -> 'kinds' -> v_wk ->> 'item' end, case when v_rare then 2 else 4 end);
    v_ink := coalesce((c -> 'weather' -> 'ink' ->> 0)::int, 2) + floor(private.h01('shard:' || v_ref || ':i') * (coalesce((c -> 'weather' -> 'ink' ->> 1)::int, 5) - coalesce((c -> 'weather' -> 'ink' ->> 0)::int, 2) + 1))::int;
  elsif p_kind = 'alien' then
    v_sp := private.alien_species(p_world, v_day, p_idx);
    v_ink := coalesce((v_sp ->> 'ink')::int, 2);
    insert into public.alien_codex (player_id, species, n, first_world) values (v_uid, v_sp ->> 'id', 1, p_world)
      on conflict (player_id, species) do update set n = alien_codex.n + 1;
    v_new_species := (select n from public.alien_codex where player_id = v_uid and species = v_sp ->> 'id') = 1;
    if v_new_species then v_ink := v_ink * 3; end if;
  else
    v_pk := private.poi_kind(p_world, p_idx);
    v_ink := coalesce((c -> 'pois' -> 'kinds' -> v_pk ->> 'ink')::int, 3);
    for k in select key, value from jsonb_each(c -> 'pois' -> 'kinds' -> v_pk -> 'items') loop
      v_items := v_items || jsonb_build_object(k.key, (k.value ->> 0)::int + floor(private.h01('poi:' || p_world || ':' || p_idx || ':' || k.key || ':' || v_uid) * ((k.value ->> 1)::int - (k.value ->> 0)::int + 1))::int);
    end loop;
  end if;
  for k in select key, value::int n from jsonb_each_text(v_items) loop
    if k.n > 0 then insert into public.planet_items (player_id, item, qty) values (v_uid, k.key, k.n) on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty; end if;
  end loop;
  v_paid := private.planet_pay_world(v_uid, p_world, v_ink, p_world || ':' || p_kind || ':' || v_ref, 'find:' || p_world || ':' || p_kind || ':' || v_ref || ':' || v_uid);
  return jsonb_build_object('kind', p_kind, 'idx', p_idx, 'paid', v_paid, 'earned', v_ink, 'items', v_items, 'species', v_sp, 'new_species', v_new_species, 'poi', v_pk,
    'balances', private.balances(v_uid), 'inventory', private.items_json(v_uid));
end $$;

create or replace function public.planet_here(p_world text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_shard int;
begin
  select shard into v_shard from public.planet_presence where player_id = v_uid and world = p_world;
  return coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(pr.player_id), 'd', to_jsonb(pr.d),
      'friend', private.friend_state(v_uid, pr.player_id) = 'friends', 'with_you', pr.shard = v_shard,
      'seen', greatest(0, extract(epoch from now() - (pr.seen_at - private.presence_lease())))::int) order by (private.friend_state(v_uid, pr.player_id) = 'friends') desc, pr.seen_at desc)
    from public.planet_presence pr
    where pr.world = p_world and pr.player_id <> v_uid and pr.seen_at > now() - interval '60 seconds' and private.visible_to(pr.player_id, v_uid)), '[]'::jsonb);
end $$;
