-- Fly anywhere, and fewer free trips.
--  * Pin flights: drop a pin anywhere on Earth (or tap "Fly to the Hot Zone") and your explorer flies there — no
--    Plane plot needed. Once you land you're really there: claim plots around you (at the normal price), play,
--    steer with the joystick. Head home when you're done, like any trip.
--  * Trips: 2 a day in total (flights, pin flights and train rides together). Refill 2 more for 100 Ink, or by
--    watching a rewarded ad (once an ad network is connected).
--  * The Hot Zone's "roll a plot there" costs 150 Ink a roll (it lands somewhere random in the zone); flying there and
--    picking your own plots costs the usual price.

update public.game_config set value = value || '{"daily_trips": 2, "refill_trips": 2, "refill_ink": 100,
  "pin": {"base_seconds": 25, "seconds_per_km": 0.03, "max_seconds": 360, "min_km": 1}}'::jsonb
 where key = 'travel';
update public.game_config set value = value || '{"roll_ink": 150}'::jsonb where key = 'hot_zones';

-- ---- where a pin flight goes -------------------------------------------------------------------------------------------
alter table public.travel_trips add column if not exists dest_lng double precision;
alter table public.travel_trips add column if not exists dest_lat double precision;
alter table public.travel_trips add column if not exists dest_name text;
/** a pin as if it were a stop (so the trip, the HUD and the arrival read the same) */
create or replace function private.pin_json(t public.travel_trips) returns jsonb language sql immutable as $$
  select case when t.dest_lng is not null then jsonb_build_object('id', 'pin', 'kind', 'pin', 'name', coalesce(t.dest_name, 'Your pin'), 'code', '📍',
    'country', '', 'region', '', 'lng', t.dest_lng, 'lat', t.dest_lat) end
$$;

create or replace function private.travel_here(e public.explorers) returns public.travel_stops language plpgsql stable as $$
declare s public.travel_stops; t public.travel_trips;
begin
  select st.* into s from public.travel_trips x join public.travel_stops st on st.id = x.to_stop where x.id = e.trip_id;
  if not found then
    select * into t from public.travel_trips where id = e.trip_id;
    s.lng := coalesce(t.dest_lng, e.lng); s.lat := coalesce(t.dest_lat, e.lat);
  end if;
  return s;
end $$;
create or replace function private.trip_point(t public.travel_trips, i int) returns float8[] language sql stable as $$
  select case when i < jsonb_array_length(t.stops) then array[(t.stops -> i ->> 'lng')::float8, (t.stops -> i ->> 'lat')::float8]
              when t.to_stop is null and t.dest_lng is not null then array[t.dest_lng, t.dest_lat]
              else (select array[s.lng, s.lat] from public.travel_stops s where s.id = t.to_stop) end
$$;

do $$
declare d text; n text;
begin
  -- the trip shows a pin as its destination
  d := pg_get_functiondef('private.trip_json(uuid)'::regprocedure);
  n := replace(d, $a$'to', (select private.stop_json(s) from public.travel_stops s where s.id = t.to_stop),$a$,
                  $a$'to', coalesce((select private.stop_json(s) from public.travel_stops s where s.id = t.to_stop), private.pin_json(t)), 'pin', t.dest_lng is not null,$a$);
  if n = d then raise exception 'flights: trip_json anchor not found'; end if;
  execute n;
  -- landing at a pin: stand there (no stamp: pins aren't stations or airports)
  d := pg_get_functiondef('private.travel_settle(uuid)'::regprocedure);
  n := replace(d, $a$  -- you're there: stand at the stop
$a$, $a$  -- a pin: stand on it
  if t.to_stop is null and t.dest_lng is not null then
    update public.explorers set lng = t.dest_lng, lat = t.dest_lat, fixed_at = now(), dest_lng = null, dest_lat = null, speed_mps = null, updated_at = now()
     where player_id = p_uid;
    update public.travel_trips set arrival = jsonb_build_object('stop', private.pin_json(t), 'new_stamp', false, 'new_country', false, 'ink', 0, 'mode', t.mode, 'pin', true) where id = t.id;
    return jsonb_build_object('stop', private.pin_json(t), 'new_stamp', false, 'new_country', false, 'ink', 0, 'mode', t.mode, 'pin', true);
  end if;
  -- you're there: stand at the stop
$a$);
  if n = d then raise exception 'flights: travel_settle anchor not found'; end if;
  execute n;
end $$;

-- ---- 2 trips a day, all kinds together; refills ---------------------------------------------------------------------------
create table if not exists public.travel_refills (
  player_id uuid not null references public.players (id) on delete cascade,
  day date not null,
  refills int not null default 0,
  primary key (player_id, day)
);
alter table public.travel_refills enable row level security;
revoke all on public.travel_refills from anon, authenticated;

create or replace function private.travel_trips_left(p_uid uuid, p_mode text) returns int language sql stable as $$
  select greatest(0, coalesce((c ->> 'daily_trips')::int, 2)
           + coalesce((c ->> 'refill_trips')::int, 2) * coalesce((select refills from public.travel_refills where player_id = p_uid and day = private.game_day(now())), 0)
           - (select count(*) from public.travel_trips where player_id = p_uid and mode in ('train', 'plane') and not with_leader and departs_at >= private.day_start(now()))::int)
  from (select private.travel_cfg() c) x
$$;

/** 2 more trips today for 100 Ink */
create or replace function public.travel_refill() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.travel_cfg(); v_day date := private.game_day(now()); v_cost int := coalesce((c ->> 'refill_ink')::int, 100);
begin
  perform private.rate_limit('travel_refill', 30, 3600);
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'travel_refill', 'travel', v_day::text, 'travel_refill:' || v_uid || ':' || gen_random_uuid());
  insert into public.travel_refills (player_id, day, refills) values (v_uid, v_day, 1)
  on conflict (player_id, day) do update set refills = travel_refills.refills + 1;
  return jsonb_build_object('left', private.travel_trips_left(v_uid, 'plane'), 'cost', v_cost, 'balances', private.balances(v_uid));
end $$;

-- a rewarded ad refills trips too
create or replace function public.svc_ad_reward(p_player_id uuid, p_reward text, p_network text, p_transaction_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare j jsonb := coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb); v_id bigint;
begin
  if not private.flag('rewarded_ads') then raise exception 'ads_disabled' using errcode = 'P0001'; end if;
  if p_reward is null or p_reward not in ('joystick_refill', 'travel_refill') then raise exception 'unknown_reward' using errcode = 'P0001'; end if;
  if coalesce(p_network, '') = '' or coalesce(p_transaction_id, '') = '' then raise exception 'invalid_receipt' using errcode = 'P0001'; end if;
  insert into private.ad_rewards (player_id, reward, network, transaction_id)
  values (p_player_id, p_reward, left(p_network, 40), left(p_transaction_id, 200))
  on conflict (network, transaction_id) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if p_reward = 'travel_refill' then
    insert into public.travel_refills (player_id, day, refills) values (p_player_id, private.game_day(now()), 1)
    on conflict (player_id, day) do update set refills = travel_refills.refills + 1;
  else
    update public.explorers set joy_seconds = greatest(joy_seconds, coalesce((j ->> 'tank_seconds')::real, 600)), updated_at = now()
     where player_id = p_player_id;
  end if;
  return jsonb_build_object('ok', true, 'duplicate', false);
end $$;

-- ---- fly to a pin ---------------------------------------------------------------------------------------------------------
create or replace function public.travel_fly_to(p_lng float8, p_lat float8, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.travel_cfg() -> 'pin'; e public.explorers%rowtype; c record;
  v_m float8; v_secs int; v_trip uuid;
begin
  perform private.rate_limit('travel_depart', 60, 3600);
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -85 and 85 then raise exception 'invalid_position' using errcode = 'P0001'; end if;
  perform private.travel_settle(v_uid);
  if private.travel_trips_left(v_uid, 'plane') < 1 then raise exception 'no_trips_left' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  select * into c from private.explorer_now(v_uid);
  if c.traveling then raise exception 'on_the_way' using errcode = 'P0001'; end if;
  if c.lng is null then raise exception 'gps_required' using errcode = 'P0001'; end if;
  v_m := private.haversine_m(c.lng, c.lat, p_lng, p_lat);
  if v_m < coalesce((cfg ->> 'min_km')::float8, 1) * 1000 then raise exception 'too_close' using errcode = 'P0001'; end if;
  v_secs := least(coalesce((cfg ->> 'max_seconds')::int, 360), round(coalesce((cfg ->> 'base_seconds')::numeric, 25) + v_m / 1000 * coalesce((cfg ->> 'seconds_per_km')::numeric, 0.03))::int);
  insert into public.travel_trips (player_id, mode, from_stop, to_stop, km, arrives_at, dest_lng, dest_lat, dest_name)
  values (v_uid, 'plane', null, null, round((v_m / 1000)::numeric, 1), now() + make_interval(secs => v_secs), p_lng, p_lat, nullif(left(trim(coalesce(p_name, '')), 60), ''))
  returning id into v_trip;
  update public.explorers
     set mode = 'travel',
         home_lng = case when e.mode = 'travel' and e.home_lng is not null then e.home_lng else c.lng end,
         home_lat = case when e.mode = 'travel' and e.home_lat is not null then e.home_lat else c.lat end,
         lng = c.lng, lat = c.lat, fixed_at = now(), accuracy_m = null, dest_lng = p_lng, dest_lat = p_lat,
         speed_mps = greatest(v_m, 1) / greatest(v_secs, 1), trip_id = v_trip, updated_at = now()
   where player_id = v_uid;
  return public.travel_status();
end $$;

-- ---- the Hot Zone roll costs 150 Ink -----------------------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.quick_buy_plot(text,uuid,boolean)'::regprocedure);
  n := replace(d, $a$    v_cost := private.acquire_cost(v_uid, v_cell[1], v_cell[2]);$a$,
                  $a$    v_cost := case when coalesce(p_hot, false) then jsonb_build_object('ink', coalesce((private.cfg('hot_zones') ->> 'roll_ink')::int, 150))
                   else private.acquire_cost(v_uid, v_cell[1], v_cell[2]) end;$a$);
  if n = d then raise exception 'flights: quick_buy_plot anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('public.hot_zone_today()'::regprocedure);
  n := replace(d, $a$'ends_at',$a$, $a$'roll_ink', coalesce((private.cfg('hot_zones') ->> 'roll_ink')::int, 150), 'ends_at',$a$);
  if n = d then raise exception 'flights: hot_zone_today anchor not found'; end if;
  execute n;
end $$;

revoke all on function public.travel_fly_to(float8, float8, text) from public, anon;
grant execute on function public.travel_fly_to(float8, float8, text) to authenticated;
revoke all on function public.travel_refill() from public, anon;
grant execute on function public.travel_refill() to authenticated;
revoke all on function private.pin_json(public.travel_trips) from public, anon, authenticated;
