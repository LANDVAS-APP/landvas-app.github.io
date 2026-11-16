-- Other players on the map — only ever where they *aren't*:
--  * An explorer shows on everyone's map (and can be found from the lobbies or a profile) only while it's out in the
--    game without GPS: away on a trip (a train, a flight, staying somewhere and riding the joystick there), or
--    steered by the joystick far from home. Anyone on GPS is never shown and can't be found.
--  * Never within 3 km of their real spot (last GPS fix) or of where their trip set off from; never on the way home;
--    only while they're online; only if "Show my explorer on the map" is on (it is unless they turn it off).
--  * Nothing that points back home leaves the server: no start point, no start time — just where it is now and,
--    mid-ride, where that leg is heading.

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.privacy_keys()'::regprocedure);
  n := replace(d, '''joinable'']', '''joinable'', ''on_map'']');
  if n = d then raise exception 'map_explorers: privacy_keys anchor not found'; end if;
  execute n;
end $$;

insert into public.game_config (key, value) values ('map_explorers', '{"enabled": true, "min_from_real_m": 3000, "limit": 60}'::jsonb)
on conflict (key) do nothing;

/** where someone's explorer may be shown to p_viewer right now — or null (on GPS, near their real spot, heading home,
    offline, hidden, blocked) */
create or replace function private.findable_json(p_player uuid, p_viewer uuid) returns jsonb language plpgsql stable as $$
declare e public.explorers; n record; c jsonb := coalesce(private.cfg('map_explorers'), '{}'::jsonb); v_tmode text; v_tto text;
  v_min float8 := coalesce((c ->> 'min_from_real_m')::float8, 3000);
begin
  if not coalesce((c ->> 'enabled')::boolean, true) or p_player = p_viewer then return null; end if;
  select * into e from public.explorers where player_id = p_player;
  if e.player_id is null or e.mode not in ('manual', 'travel') then return null; end if;
  if e.mode = 'travel' then
    select t.mode, s.name into v_tmode, v_tto from public.travel_trips t left join public.travel_stops s on s.id = t.to_stop where t.id = e.trip_id;
    if v_tmode = 'home' then return null; end if;
  end if;
  if not private.is_online(p_player) or not private.shows(p_player, 'on_map')
     or not private.visible_to(p_player, p_viewer) or not private.visible_to(p_viewer, p_player) then return null; end if;
  select * into n from private.explorer_now(p_player);
  -- never anywhere near home: their last real fix, or where a trip set off
  if e.gps_lng is not null and private.haversine_m(n.lng, n.lat, e.gps_lng, e.gps_lat) < v_min then return null; end if;
  if e.mode = 'travel' and e.home_lng is not null and private.haversine_m(n.lng, n.lat, e.home_lng, e.home_lat) < v_min then return null; end if;
  if e.mode = 'manual' and e.gps_lng is null then return null; end if; -- (no real spot to keep clear of: don't guess)
  return jsonb_build_object('how', case when e.mode = 'travel' then 'travel' else 'joystick' end,
    'lng', n.lng, 'lat', n.lat, 'traveling', coalesce(n.traveling, false),
    'dest_lng', case when n.traveling then e.dest_lng end, 'dest_lat', case when n.traveling then e.dest_lat end,
    'arrives_at', case when n.traveling then n.arrives_at end, 'vehicle', e.vehicle,
    'trip', case when e.mode = 'travel' then jsonb_build_object('mode', v_tmode, 'to', v_tto) end);
end $$;

/** explorers out on the map in the view — never anyone on GPS */
create or replace function public.map_explorers(p_west float8, p_south float8, p_east float8, p_north float8) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_mine uuid := private.my_group(v_uid);
  v_lim int := least(greatest(coalesce((private.cfg('map_explorers') ->> 'limit')::int, 60), 1), 200);
  w float8 := least(p_west, p_east); ea float8 := greatest(p_west, p_east); s float8 := least(p_south, p_north); nn float8 := greatest(p_south, p_north);
begin
  perform private.rate_limit('map_explorers', 2400, 3600);
  if p_west is null or p_south is null or p_east is null or p_north is null then raise exception 'invalid_position' using errcode = 'P0001'; end if;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(x.j), '[]'::jsonb) from (
    select private.profile_json(e.player_id) || f || jsonb_build_object(
             'in_party', v_mine is not null and private.my_group(e.player_id) = v_mine,
             'joinable', case when private.my_group(e.player_id) is null then private.shows(e.player_id, 'joinable')
                              else exists (select 1 from public.travel_groups g where g.id = private.my_group(e.player_id) and g.visibility = 'public') end) j
      from public.player_activity a
      join public.explorers e on e.player_id = a.player_id and e.mode in ('manual', 'travel')
      cross join lateral private.findable_json(e.player_id, v_uid) f
     where a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3))
       and a.player_id <> v_uid
       and f is not null
       and (f ->> 'lng')::float8 between w and ea and (f ->> 'lat')::float8 between s and nn
     order by e.updated_at desc limit v_lim) x));
end $$;

/** find someone on the map (only if they're out in the game, away from home) */
create or replace function public.find_explorer(p_player uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('find_explorer', 600, 3600);
  return private.findable_json(p_player, v_uid);
end $$;

-- the lobbies' "on their own" list says who can be found on the map
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.joinable_players(uuid)'::regprocedure);
  n := replace(d, $a$'friend', private.friend_state(p_uid, a.player_id) = 'friends') j,$a$,
                  $b$'friend', private.friend_state(p_uid, a.player_id) = 'friends', 'findable', private.findable_json(a.player_id, p_uid) is not null) j,$b$);
  if n = d then raise exception 'map_explorers: joinable_players anchor not found'; end if;
  execute n;
end $$;

do $$ declare f text; begin
  execute 'revoke all on function private.findable_json(uuid, uuid) from public, anon, authenticated';
  foreach f in array array['public.map_explorers(double precision, double precision, double precision, double precision)', 'public.find_explorer(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
