-- v0.9.7 Travel plots: a Travel plot is a Train or a Plane subplot. Owning one lets your explorer ride to a real
-- train station (Train) or airport (Plane) anywhere on the map: you board at the station or airport nearest you,
-- ride (a train stops at the real stations along the way), and arrive. Once there your explorer really is there —
-- claim plots, play, check in — and every new station or airport is a souvenir stamp in your passport. Head home
-- when you're done (until then your GPS doesn't pull you back). Every stop anyone has travelled to has a building
-- on the map. Switching a plot between Train and Plane is free.

insert into public.plot_kinds (id, name, description, sort, enabled) values
  ('train', 'Travel · Train', 'Ride trains to real stations anywhere on the network: board at the station nearest you, stop along the way, arrive and play there.', 13, true),
  ('plane', 'Travel · Plane', 'Fly to real airports anywhere in the world: board at the airport nearest you, land and play there.', 14, true)
on conflict (id) do update set name = excluded.name, description = excluded.description, sort = excluded.sort, enabled = true;

insert into public.game_config (key, value) values ('travel', $cfg${
  "train": {"base_seconds": 20, "seconds_per_km": 0.15, "max_seconds": 360, "max_km": 3000, "board_km": 300, "trips_base": 4, "trips_per_plot": 1, "trips_max": 12},
  "plane": {"base_seconds": 25, "seconds_per_km": 0.03, "max_seconds": 360, "max_km": 20100, "board_km": 400, "trips_base": 2, "trips_per_plot": 1, "trips_max": 8},
  "home": {"base_seconds": 15, "seconds_per_km": 0.02, "max_seconds": 240},
  "stay_m": 2500, "stamp_ink": 2, "country_ink": 10, "ink_daily_cap": 30, "max_stops": 8
}$cfg$::jsonb) on conflict (key) do update set value = excluded.value;

create or replace function private.travel_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('travel'), '{}'::jsonb) $$;

-- ---- tables -------------------------------------------------------------------------------------------------------
create table if not exists public.travel_trips (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  mode text not null check (mode in ('train', 'plane', 'home')),
  from_stop text references public.travel_stops (id),
  to_stop text references public.travel_stops (id),
  stops jsonb not null default '[]'::jsonb,
  km numeric not null default 0,
  departs_at timestamptz not null default now(),
  arrives_at timestamptz not null,
  arrived boolean not null default false,
  leg int not null default 0
);
create index if not exists travel_trips_player on public.travel_trips (player_id, departs_at desc);
create index if not exists travel_trips_to on public.travel_trips (to_stop);
create index if not exists travel_trips_from on public.travel_trips (from_stop);
create table if not exists public.travel_visits (
  player_id uuid not null references public.players (id) on delete cascade,
  stop_id text not null references public.travel_stops (id),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  visits int not null default 1,
  primary key (player_id, stop_id)
);
create index if not exists travel_visits_stop on public.travel_visits (stop_id, last_at desc);
alter table public.travel_trips enable row level security;
alter table public.travel_visits enable row level security;
revoke all on public.travel_trips, public.travel_visits from anon, authenticated;

-- the explorer can be away on a trip: its GPS is ignored until it's back home
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.explorers'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%mode%' loop
    execute format('alter table public.explorers drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.explorers add constraint explorers_mode_check check (mode in ('gps', 'manual', 'travel'));
alter table public.explorers add column if not exists home_lng double precision;
alter table public.explorers add column if not exists home_lat double precision;
alter table public.explorers add column if not exists trip_id uuid;

-- Travel Ink is earned (stamps), so it may be granted
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.grant(uuid,jsonb,text,text,text,text)'::regprocedure);
  n := replace(d, '''clan'') then', '''clan'', ''travel'') then');
  if n = d then raise exception 'travel: grant anchor not found'; end if;
  execute n;
end $$;

-- switching between Train and Plane is free (like Home and Landlord)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.set_group_kind(uuid,text)'::regprocedure);
  n := replace(d, 'and not (g.kind in (''home'', ''landlord'') and p_kind in (''home'', ''landlord''))',
    'and not ((g.kind in (''home'', ''landlord'') and p_kind in (''home'', ''landlord'')) or (g.kind in (''train'', ''plane'') and p_kind in (''train'', ''plane'')))');
  if n = d then raise exception 'travel: set_group_kind anchor not found'; end if;
  execute n;
end $$;

-- ---- helpers --------------------------------------------------------------------------------------------------------
create or replace function private.stop_json(s public.travel_stops) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name, 'code', s.code, 'country', s.country, 'region', s.region, 'lng', s.lng, 'lat', s.lat)
$$;
create or replace function private.travel_kind(p_mode text) returns text language sql immutable as $$
  select case p_mode when 'train' then 'station' when 'plane' then 'airport' end
$$;
/** how many plots of a Travel subplot a player has */
create or replace function private.travel_plots(p_uid uuid, p_mode text) returns int language sql stable as $$
  select coalesce(sum(plot_count), 0)::int from public.canvas_groups where owner_id = p_uid and kind = p_mode and status = 'active'
$$;
create or replace function private.travel_trips_left(p_uid uuid, p_mode text) returns int language sql stable as $$
  select greatest(0, least(coalesce((c ->> 'trips_max')::int, 12),
           coalesce((c ->> 'trips_base')::int, 2) + coalesce((c ->> 'trips_per_plot')::int, 1) * greatest(private.travel_plots(p_uid, p_mode) - 1, 0))
         - (select count(*) from public.travel_trips where player_id = p_uid and mode = p_mode and departs_at >= private.day_start(now()))::int)
  from (select private.travel_cfg() -> p_mode c) x
$$;
/** the nearest station or airport to a point (within max_km; on a given rail network if asked) */
create or replace function private.nearest_stop(p_kind text, p_lng float8, p_lat float8, p_max_km float8, p_region text default null) returns public.travel_stops
language plpgsql stable as $$
declare s public.travel_stops; r float8 := 10; dl float8;
begin
  -- widen the search box until something turns up (most places have a stop close by)
  while r <= greatest(p_max_km, 10) * 2 loop
    dl := least(180, r / greatest(111.32 * cos(radians(least(abs(p_lat), 85))), 1));
    select * into s from public.travel_stops t
     where t.kind = p_kind and t.lat between p_lat - r / 110.6 and p_lat + r / 110.6 and t.lng between p_lng - dl and p_lng + dl
       and (p_region is null or t.region = p_region)
     order by private.haversine_m(p_lng, p_lat, t.lng, t.lat) limit 1;
    if found and private.haversine_m(p_lng, p_lat, s.lng, s.lat) <= p_max_km * 1000 then return s; end if;
    r := r * 3;
  end loop;
  return null;
end $$;

/** a ride's route and timing. Trains go station to station along the network (each hop to the station within reach
 *  that gets closest to the destination for the least detour), so they stop at the real stations on the way. */
create or replace function private.travel_route(p_mode text, a public.travel_stops, b public.travel_stops) returns jsonb language plpgsql stable as $$
declare
  c jsonb := private.travel_cfg() -> p_mode; v_max int := coalesce((private.travel_cfg() ->> 'max_stops')::int, 8);
  v_direct float8 := private.haversine_m(a.lng, a.lat, b.lng, b.lat) / 1000; v_km float8 := 0;
  cur public.travel_stops := a; nxt public.travel_stops; v_rem float8; v_r float8; v_dl float8; v_path jsonb := '[]'::jsonb; v_stops jsonb := '[]'::jsonb;
  n int; i int; v_cum float8 := 0; v_secs int; p jsonb; v_seen text[] := array[a.id, b.id];
begin
  if p_mode = 'train' and v_direct > 25 then
    for it in 1..60 loop
      v_rem := private.haversine_m(cur.lng, cur.lat, b.lng, b.lat) / 1000;
      exit when v_rem <= 40;
      nxt := null;
      foreach v_r in array array[120, 220, 400]::float8[] loop
        exit when v_r > v_rem + 1;
        v_dl := v_r / greatest(111.32 * cos(radians(least(abs(cur.lat), 85))), 1);
        select t.* into nxt from public.travel_stops t
         where t.kind = 'station' and t.region = a.region and t.id <> all (v_seen)
           and t.lat between cur.lat - v_r / 110.6 and cur.lat + v_r / 110.6 and t.lng between cur.lng - v_dl and cur.lng + v_dl
           and private.haversine_m(cur.lng, cur.lat, t.lng, t.lat) between 12000 and v_r * 1000
           and private.haversine_m(t.lng, t.lat, b.lng, b.lat) < (v_rem - 10) * 1000
         order by (private.haversine_m(cur.lng, cur.lat, t.lng, t.lat) + private.haversine_m(t.lng, t.lat, b.lng, b.lat) - v_rem * 1000)
                  / greatest(v_rem * 1000 - private.haversine_m(t.lng, t.lat, b.lng, b.lat), 1)
                  - private.haversine_m(cur.lng, cur.lat, t.lng, t.lat) / 4e7
         limit 1;
        exit when nxt.id is not null;
      end loop;
      exit when nxt.id is null;
      v_path := v_path || jsonb_build_array(jsonb_build_object('id', nxt.id, 'name', nxt.name, 'country', nxt.country, 'lng', nxt.lng, 'lat', nxt.lat,
        'km', private.haversine_m(cur.lng, cur.lat, nxt.lng, nxt.lat) / 1000));
      v_seen := v_seen || nxt.id; cur := nxt;
    end loop;
    -- at most max_stops of them, evenly spread along the way
    n := jsonb_array_length(v_path);
    for i in 0..n - 1 loop
      if n <= v_max or (floor((i + 1) * v_max::float8 / n) <> floor(i * v_max::float8 / n)) then
        p := v_path -> i;
        v_stops := v_stops || jsonb_build_array(p - 'km');
      end if;
    end loop;
  end if;
  -- the route's length, through its stops
  cur := a;
  for i in 0..jsonb_array_length(v_stops) - 1 loop
    p := v_stops -> i;
    v_km := v_km + private.haversine_m(cur.lng, cur.lat, (p ->> 'lng')::float8, (p ->> 'lat')::float8) / 1000;
    cur.lng := (p ->> 'lng')::float8; cur.lat := (p ->> 'lat')::float8;
  end loop;
  v_km := v_km + private.haversine_m(cur.lng, cur.lat, b.lng, b.lat) / 1000;
  -- where each stop falls along the way (0..1), for the progress bar
  cur := a;
  for i in 0..jsonb_array_length(v_stops) - 1 loop
    p := v_stops -> i;
    v_cum := v_cum + private.haversine_m(cur.lng, cur.lat, (p ->> 'lng')::float8, (p ->> 'lat')::float8) / 1000;
    cur.lng := (p ->> 'lng')::float8; cur.lat := (p ->> 'lat')::float8;
    v_stops := jsonb_set(v_stops, array[i::text, 't'], to_jsonb(round((v_cum / greatest(v_km, 0.001))::numeric, 4)));
  end loop;
  v_secs := least(coalesce((c ->> 'max_seconds')::int, 360), round(coalesce((c ->> 'base_seconds')::numeric, 20) + v_km * coalesce((c ->> 'seconds_per_km')::numeric, 0.1))::int);
  return jsonb_build_object('km', round(v_km::numeric, 1), 'direct_km', round(v_direct::numeric, 1), 'seconds', v_secs, 'stops', v_stops);
end $$;

/** where an explorer away on a trip is staying: the stop it arrived at (or where it stands) */
create or replace function private.travel_here(e public.explorers) returns public.travel_stops language plpgsql stable as $$
declare s public.travel_stops;
begin
  select st.* into s from public.travel_trips t join public.travel_stops st on st.id = t.to_stop where t.id = e.trip_id;
  if not found then s.lng := e.lng; s.lat := e.lat; end if;
  return s;
end $$;

/** the trip you're on (or just finished), for the map and the HUD */
create or replace function private.trip_json(p_uid uuid) returns jsonb language sql stable as $$
  select case when e.mode = 'travel' and t.id is not null then jsonb_build_object(
    'id', t.id, 'mode', t.mode, 'km', t.km, 'leg', t.leg, 'departs_at', t.departs_at, 'arrives_at', t.arrives_at, 'arrived', t.arrived or t.arrives_at <= now(),
    'from', (select private.stop_json(s) from public.travel_stops s where s.id = t.from_stop),
    'to', (select private.stop_json(s) from public.travel_stops s where s.id = t.to_stop),
    'stops', t.stops, 'home', jsonb_build_object('lng', e.home_lng, 'lat', e.home_lat)) end
  from public.explorers e left join public.travel_trips t on t.id = e.trip_id
  where e.player_id = p_uid
$$;

/** where leg `i` of a trip ends: its i-th stop, or (after the last) the destination */
create or replace function private.trip_point(t public.travel_trips, i int) returns float8[] language sql stable as $$
  select case when i < jsonb_array_length(t.stops) then array[(t.stops -> i ->> 'lng')::float8, (t.stops -> i ->> 'lat')::float8]
              else (select array[s.lng, s.lat] from public.travel_stops s where s.id = t.to_stop) end
$$;

/** the trip moves on: past each station it has reached to the next leg; when it has come in, a stamp (and a little
 *  Ink) for a new stop; a home trip hands the explorer back to GPS */
create or replace function private.travel_settle(p_uid uuid) returns jsonb language plpgsql as $$
declare e public.explorers%rowtype; t public.travel_trips%rowtype; s public.travel_stops; c jsonb := private.travel_cfg();
  v_new boolean := false; v_country boolean := false; v_ink int := 0; v_today int; v_arr timestamptz; v_pt float8[]; v_n int;
begin
  select * into e from public.explorers where player_id = p_uid for update;
  if not found or e.mode <> 'travel' or e.trip_id is null then return null; end if;
  select * into t from public.travel_trips where id = e.trip_id for update;
  if not found or t.arrived then return null; end if;
  v_n := case when t.mode = 'home' then 0 else jsonb_array_length(t.stops) end;
  -- through the stations it has passed, one leg at a time (each leg starts when the last one ended)
  loop
    exit when e.dest_lng is null or coalesce(e.speed_mps, 0) <= 0;
    v_arr := e.fixed_at + make_interval(secs => private.haversine_m(e.lng, e.lat, e.dest_lng, e.dest_lat) / e.speed_mps);
    if v_arr > now() then return null; end if;
    exit when t.leg >= v_n;
    v_pt := private.trip_point(t, t.leg + 1);
    update public.explorers set lng = e.dest_lng, lat = e.dest_lat, fixed_at = v_arr, dest_lng = v_pt[1], dest_lat = v_pt[2], updated_at = now()
     where player_id = p_uid returning * into e;
    update public.travel_trips set leg = leg + 1 where id = t.id returning * into t;
  end loop;
  update public.travel_trips set arrived = true, leg = v_n where id = t.id;
  if t.mode = 'home' then
    update public.explorers set mode = 'gps', lng = e.home_lng, lat = e.home_lat, fixed_at = now(), dest_lng = null, dest_lat = null, speed_mps = null,
           trip_id = null, home_lng = null, home_lat = null, updated_at = now()
     where player_id = p_uid;
    return jsonb_build_object('home', true);
  end if;
  -- you're there: stand at the stop
  select * into s from public.travel_stops where id = t.to_stop;
  update public.explorers set lng = s.lng, lat = s.lat, fixed_at = now(), dest_lng = null, dest_lat = null, speed_mps = null, updated_at = now()
   where player_id = p_uid;
  v_new := not exists (select 1 from public.travel_visits where player_id = p_uid and stop_id = s.id);
  v_country := s.country <> '' and not exists (select 1 from public.travel_visits v join public.travel_stops x on x.id = v.stop_id where v.player_id = p_uid and x.country = s.country);
  insert into public.travel_visits (player_id, stop_id) values (p_uid, s.id)
  on conflict (player_id, stop_id) do update set last_at = now(), visits = travel_visits.visits + 1;
  if v_new then
    select coalesce(sum(delta), 0) into v_today from public.resource_ledger where player_id = p_uid and resource = 'ink' and reason = 'travel' and created_at >= private.day_start(now());
    v_ink := least(coalesce((c ->> 'stamp_ink')::int, 2) + case when v_country then coalesce((c ->> 'country_ink')::int, 10) else 0 end,
                   greatest(0, coalesce((c ->> 'ink_daily_cap')::int, 30) - v_today));
    if v_ink > 0 then perform private.grant(p_uid, jsonb_build_object('ink', v_ink), 'travel', 'travel_stop', s.id, 'travel:' || p_uid || ':' || s.id); end if;
  end if;
  return jsonb_build_object('stop', private.stop_json(s), 'new_stamp', v_new, 'new_country', v_country, 'ink', v_ink, 'mode', t.mode);
end $$;

-- ---- for players ----------------------------------------------------------------------------------------------------
/** where you are, what you can ride, how many trips are left today, and your trip */
create or replace function public.travel_status() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_arr jsonb;
begin
  v_arr := private.travel_settle(v_uid);
  return jsonb_build_object(
    'train', jsonb_build_object('plots', private.travel_plots(v_uid, 'train'), 'left', private.travel_trips_left(v_uid, 'train')),
    'plane', jsonb_build_object('plots', private.travel_plots(v_uid, 'plane'), 'left', private.travel_trips_left(v_uid, 'plane')),
    'trip', private.trip_json(v_uid), 'arrival', v_arr,
    'away', coalesce((select mode = 'travel' from public.explorers where player_id = v_uid), false),
    'stamps', (select count(*) from public.travel_visits where player_id = v_uid),
    'countries', (select count(distinct s.country) from public.travel_visits v join public.travel_stops s on s.id = v.stop_id where v.player_id = v_uid and s.country <> ''),
    'explorer', private.explorer_json(v_uid));
end $$;

/** find stations (train) or airports (plane): by name or code, or nearest a point on the map */
create or replace function public.travel_search(p_mode text, p_q text default null, p_lng float8 default null, p_lat float8 default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_kind text := private.travel_kind(p_mode); q text := lower(btrim(coalesce(p_q, ''))); c record; dl float8;
begin
  if v_kind is null then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  select * into c from private.explorer_now(v_uid);
  if char_length(q) >= 2 then
    return coalesce((select jsonb_agg(private.stop_json(s.st) || jsonb_build_object('km', case when c.lng is null then null else round((private.haversine_m(c.lng, c.lat, s.lng, s.lat) / 1000)::numeric) end) order by s.rk, s.nm)
      from (select s.*, s as st, case when lower(s.code) = q then 0 when lower(s.name) like q || '%' then 1 else 2 end rk, lower(s.name) nm
              from public.travel_stops s where s.kind = v_kind and (lower(s.name) like '%' || q || '%' or lower(s.code) = q)
              order by rk, nm limit 15) s), '[]'::jsonb);
  end if;
  if p_lng is null or p_lat is null then return '[]'::jsonb; end if;
  dl := 2.5 / greatest(cos(radians(least(abs(p_lat), 85))), 0.05);
  return coalesce((select jsonb_agg(private.stop_json(s.st) || jsonb_build_object('km', case when c.lng is null then null else round((private.haversine_m(c.lng, c.lat, s.lng, s.lat) / 1000)::numeric) end,
                                                                            'from_point_km', round((private.haversine_m(p_lng, p_lat, s.lng, s.lat) / 1000)::numeric, 1)) order by d)
    from (select s.*, s as st, private.haversine_m(p_lng, p_lat, s.lng, s.lat) d from public.travel_stops s
           where s.kind = v_kind and s.lat between p_lat - 2.5 and p_lat + 2.5 and s.lng between p_lng - dl and p_lng + dl
           order by d limit 8) s), '[]'::jsonb);
end $$;

/** where a ride would board, where it would stop and how long it would take */
create or replace function public.travel_plan(p_mode text, p_to text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c record; a public.travel_stops; b public.travel_stops; cfg jsonb := private.travel_cfg() -> p_mode; r jsonb;
begin
  if private.travel_kind(p_mode) is null then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  select * into b from public.travel_stops where id = p_to and kind = private.travel_kind(p_mode);
  if not found then raise exception 'unknown_stop' using errcode = 'P0001'; end if;
  select * into c from private.explorer_now(v_uid);
  if c.lng is null then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  if c.traveling then raise exception 'on_the_way' using errcode = 'P0001'; end if;
  a := private.nearest_stop(private.travel_kind(p_mode), c.lng, c.lat, coalesce((cfg ->> 'board_km')::float8, 300), case when p_mode = 'train' then b.region end);
  if a.id is null then raise exception '%', case when p_mode = 'train' then 'no_station_near' else 'no_airport_near' end using errcode = 'P0001'; end if;
  if a.id = b.id then raise exception 'already_here' using errcode = 'P0001'; end if;
  r := private.travel_route(p_mode, a, b);
  if (r ->> 'km')::float8 > coalesce((cfg ->> 'max_km')::float8, 3000) then raise exception 'too_far_by_train' using errcode = 'P0001'; end if;
  return jsonb_build_object('mode', p_mode, 'from', private.stop_json(a), 'to', private.stop_json(b), 'board_km', round((private.haversine_m(c.lng, c.lat, a.lng, a.lat) / 1000)::numeric, 1),
    'left', private.travel_trips_left(v_uid, p_mode), 'plots', private.travel_plots(v_uid, p_mode)) || r;
end $$;

/** board: your explorer goes to the station or airport nearest you and sets off */
create or replace function public.travel_depart(p_mode text, p_to text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); p jsonb; e public.explorers%rowtype; c record; v_trip uuid; v_m float8;
begin
  perform private.rate_limit('travel_depart', 60, 3600);
  perform private.travel_settle(v_uid);
  if private.travel_plots(v_uid, p_mode) < 1 then raise exception '%', case when p_mode = 'train' then 'needs_train_plot' else 'needs_plane_plot' end using errcode = 'P0001'; end if;
  if private.travel_trips_left(v_uid, p_mode) < 1 then raise exception 'no_trips_left' using errcode = 'P0001'; end if;
  p := public.travel_plan(p_mode, p_to);
  select * into e from public.explorers where player_id = v_uid for update;
  select * into c from private.explorer_now(v_uid);
  insert into public.travel_trips (player_id, mode, from_stop, to_stop, stops, km, arrives_at)
  values (v_uid, p_mode, p -> 'from' ->> 'id', p -> 'to' ->> 'id', p -> 'stops', (p ->> 'km')::numeric, now() + make_interval(secs => (p ->> 'seconds')::int))
  returning id into v_trip;
  -- one speed for the whole route (through its stops), so it arrives on time
  v_m := (p ->> 'km')::float8 * 1000;
  update public.explorers
     set mode = 'travel',
         -- home is where you set off from the first time (later legs keep it)
         home_lng = case when e.mode = 'travel' and e.home_lng is not null then e.home_lng else c.lng end,
         home_lat = case when e.mode = 'travel' and e.home_lat is not null then e.home_lat else c.lat end,
         lng = (p -> 'from' ->> 'lng')::float8, lat = (p -> 'from' ->> 'lat')::float8, fixed_at = now(), accuracy_m = null,
         -- the first leg: to the first station on the way (or straight there)
         dest_lng = coalesce((p -> 'stops' -> 0 ->> 'lng')::float8, (p -> 'to' ->> 'lng')::float8),
         dest_lat = coalesce((p -> 'stops' -> 0 ->> 'lat')::float8, (p -> 'to' ->> 'lat')::float8),
         speed_mps = greatest(v_m, 1) / greatest((p ->> 'seconds')::float8, 1), trip_id = v_trip, updated_at = now()
   where player_id = v_uid;
  return public.travel_status();
end $$;

/** head home: a ride back to where you set off from; your GPS takes over again when you're there */
create or replace function public.travel_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.explorers%rowtype; c record; cfg jsonb := private.travel_cfg() -> 'home'; v_m float8; v_secs int; v_trip uuid;
begin
  perform private.rate_limit('travel_depart', 60, 3600);
  perform private.travel_settle(v_uid);
  select * into e from public.explorers where player_id = v_uid for update;
  if not found or e.mode <> 'travel' then raise exception 'not_away' using errcode = 'P0001'; end if;
  select * into c from private.explorer_now(v_uid);
  if c.traveling then raise exception 'on_the_way' using errcode = 'P0001'; end if;
  v_m := private.haversine_m(c.lng, c.lat, e.home_lng, e.home_lat);
  v_secs := least(coalesce((cfg ->> 'max_seconds')::int, 240), round(coalesce((cfg ->> 'base_seconds')::numeric, 15) + v_m / 1000 * coalesce((cfg ->> 'seconds_per_km')::numeric, 0.02))::int);
  insert into public.travel_trips (player_id, mode, from_stop, to_stop, km, arrives_at)
  values (v_uid, 'home', (select x.from_stop from public.travel_trips x where x.id = e.trip_id), null, round((v_m / 1000)::numeric, 1), now() + make_interval(secs => v_secs))
  returning id into v_trip;
  update public.explorers set lng = c.lng, lat = c.lat, fixed_at = now(), dest_lng = e.home_lng, dest_lat = e.home_lat,
         speed_mps = greatest(v_m, 1) / greatest(v_secs, 1), trip_id = v_trip, updated_at = now()
   where player_id = v_uid;
  return public.travel_status();
end $$;

/** your passport: every station and airport you've been to */
create or replace function public.travel_passport() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(private.stop_json(s) || jsonb_build_object('first_at', v.first_at, 'last_at', v.last_at, 'visits', v.visits) order by v.first_at desc)
    from public.travel_visits v join public.travel_stops s on s.id = v.stop_id where v.player_id = v_uid), '[]'::jsonb);
end $$;

/** the stops in view that someone has travelled to: each has a building on the map */
create or replace function public.travel_buildings(p_w float8, p_s float8, p_e float8, p_n float8) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(private.stop_json(s.st) || jsonb_build_object('visitors', s.n) order by s.n desc), '[]'::jsonb)
  from (select s.*, s as st, (select count(*) from public.travel_visits v where v.stop_id = s.id) n
          from public.travel_stops s
         where s.lat between p_s and p_n and s.lng between p_w and p_e
           and (exists (select 1 from public.travel_visits v where v.stop_id = s.id) or exists (select 1 from public.travel_trips t where t.to_stop = s.id and not t.arrived))
         limit 60) s
$$;

/** one station or airport: who has been, and your stamp */
create or replace function public.travel_stop(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); s public.travel_stops;
begin
  select * into s from public.travel_stops where id = p_id;
  if not found then raise exception 'unknown_stop' using errcode = 'P0001'; end if;
  return private.stop_json(s) || jsonb_build_object(
    'visitors', (select count(*) from public.travel_visits where stop_id = s.id),
    'recent', (select coalesce(jsonb_agg(private.profile_json(v.player_id) || jsonb_build_object('at', v.last_at) order by v.last_at desc), '[]'::jsonb)
                 from (select * from public.travel_visits where stop_id = s.id and private.visible_to(player_id, v_uid) order by last_at desc limit 12) v),
    'mine', (select jsonb_build_object('first_at', first_at, 'visits', visits) from public.travel_visits where stop_id = s.id and player_id = v_uid));
end $$;

-- ---- the explorer while away ------------------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  -- your GPS doesn't pull you back while you're away (a home trip arriving hands you back to it)
  d := pg_get_functiondef('public.report_position(double precision,double precision,double precision)'::regprocedure);
  n := replace(d, '  select * into e from public.explorers where player_id = v_uid for update;' || chr(10) || '  if not found then',
    '  select * into e from public.explorers where player_id = v_uid for update;' || chr(10) ||
    '  if found and e.mode = ''travel'' then perform private.travel_settle(v_uid); select * into e from public.explorers where player_id = v_uid; end if;' || chr(10) ||
    '  if found and e.mode = ''travel'' then return private.explorer_json(v_uid) || jsonb_build_object(''accepted'', false, ''away'', true); end if;' || chr(10) ||
    '  if not found then');
  if n = d then raise exception 'travel: report_position anchor not found'; end if;
  execute n;
  -- walking about where you've arrived (the joystick): no GPS needed, and it keeps you near the station
  d := pg_get_functiondef('public.joystick_step(double precision,double precision)'::regprocedure);
  n := replace(d, '  if e.gps_at is null or e.gps_at < now() - interval ''20 minutes'' then',
    '  if e.mode = ''travel'' then perform private.travel_settle(v_uid); select * into e from public.explorers where player_id = v_uid; end if;' || chr(10) ||
    '  if e.mode = ''travel'' then' || chr(10) ||
    '    if e.dest_lng is not null then raise exception ''on_the_way'' using errcode = ''P0001''; end if;' || chr(10) ||
    '  elsif e.gps_at is null or e.gps_at < now() - interval ''20 minutes'' then');
  n := replace(n, '  if private.haversine_m(e.gps_lng, e.gps_lat, t.lng, t.lat) > v_speed * v_tank',
    '  if (e.mode = ''travel'' and private.haversine_m((private.travel_here(e)).lng, (private.travel_here(e)).lat, t.lng, t.lat) > coalesce((private.travel_cfg() ->> ''stay_m'')::float8, 2500)' ||
    ' and private.haversine_m((private.travel_here(e)).lng, (private.travel_here(e)).lat, t.lng, t.lat) > private.haversine_m((private.travel_here(e)).lng, (private.travel_here(e)).lat, c.lng, c.lat))' || chr(10) ||
    '     or e.mode <> ''travel'' and private.haversine_m(e.gps_lng, e.gps_lat, t.lng, t.lat) > v_speed * v_tank');
  n := replace(n, 'set mode = ''manual'', lng = t.lng', 'set mode = case when e.mode = ''travel'' then ''travel'' else ''manual'' end, lng = t.lng');
  if position('on_the_way' in n) = 0 or position('travel_here' in n) = 0 or position('then ''travel'' else ''manual''' in n) = 0 then
    raise exception 'travel: joystick_step anchors not found'; end if;
  execute n;
  -- the explorer's JSON carries the trip
  d := pg_get_functiondef('private.explorer_json(uuid)'::regprocedure);
  n := replace(d, '''server_time'', now());', '''trip'', private.trip_json(p_uid), ''server_time'', now());');
  if n = d then raise exception 'travel: explorer_json anchor not found'; end if;
  execute n;
end $$;

do $$ declare f text; begin
  foreach f in array array['private.travel_cfg()', 'private.stop_json(public.travel_stops)', 'private.travel_kind(text)', 'private.travel_plots(uuid, text)',
    'private.travel_trips_left(uuid, text)', 'private.nearest_stop(text, double precision, double precision, double precision, text)',
    'private.travel_route(text, public.travel_stops, public.travel_stops)', 'private.travel_here(public.explorers)', 'private.trip_json(uuid)', 'private.travel_settle(uuid)', 'private.trip_point(public.travel_trips, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.travel_status()', 'public.travel_search(text, text, double precision, double precision)', 'public.travel_plan(text, text)',
    'public.travel_depart(text, text)', 'public.travel_home()', 'public.travel_passport()', 'public.travel_stop(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.travel_buildings(double precision, double precision, double precision, double precision) from public;
grant execute on function public.travel_buildings(double precision, double precision, double precision, double precision) to anon, authenticated;
