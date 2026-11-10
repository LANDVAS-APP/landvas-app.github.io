-- v0.9.9 Out and about.
--  * Joystick, planet style: steer freely with a thumb-stick. Walking is free; buy a Bike, then a Car, to go faster
--    and further (the Car runs on the joystick tank — "fuel"). You can only roam so far from where you really are
--    (or, while you're away travelling, from the station or airport you arrived at).
--  * Finds: things to do on the map that aren't plots — Ink crystals, balloons, gifts and the odd golden star turn
--    up every day all over the world. Walk up (or ride) and tap them.
--  * Travel groups: up to 10 travellers. When the leader sets off, everyone in the group rides too and arrives at the
--    same time, each boarding at the stop nearest them. Members see each other on the map — but only while they're
--    away travelling. Nobody's GPS (or home) is ever shown.
--  * Home stays private: a trip that sets off from home shows others only where it's going (no start, no route), and
--    your own trip data no longer carries your home point.

insert into public.game_config (key, value) values ('explore', $cfg${
  "vehicles": {
    "walk": {"name": "Walk", "speed_kmh": 6, "range_m": 600, "ink": 0, "fuel": false},
    "bike": {"name": "Bike", "speed_kmh": 20, "range_m": 2000, "ink": 250, "fuel": false},
    "car": {"name": "Car", "speed_kmh": 60, "range_m": 6000, "ink": 1200, "fuel": true, "needs": "bike"}
  },
  "finds": {"cell": 24, "density": 0.55, "reach_m": 45, "ink_daily_cap": 40, "max_cells": 900,
    "kinds": [
      {"id": "crystal", "weight": 45, "ink": 2},
      {"id": "balloon", "weight": 30, "ink": 1},
      {"id": "gift", "weight": 20, "ink_min": 1, "ink_max": 6},
      {"id": "star", "weight": 5, "ink": 10}
    ]},
  "group_max": 10
}$cfg$::jsonb) on conflict (key) do update set value = excluded.value;
create or replace function private.explore_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('explore'), '{}'::jsonb) $$;

-- finds and vehicles grant/spend Ink
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.grant(uuid,jsonb,text,text,text,text)'::regprocedure);
  n := replace(d, '''clan'', ''travel'') then', '''clan'', ''travel'', ''finds'') then');
  if n = d then raise exception 'explore: grant anchor not found'; end if;
  execute n;
end $$;

-- ---- vehicles ---------------------------------------------------------------------------------------------------
alter table public.explorers add column if not exists vehicle text not null default 'walk';
alter table public.explorers drop constraint if exists explorers_vehicle_check;
alter table public.explorers add constraint explorers_vehicle_check check (vehicle in ('walk', 'bike', 'car'));
create table if not exists public.vehicles_owned (
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('bike', 'car')),
  bought_at timestamptz not null default now(),
  primary key (player_id, kind)
);
alter table public.vehicles_owned enable row level security;
revoke all on public.vehicles_owned from anon, authenticated;

create or replace function private.vehicle_owned(p_uid uuid, p_kind text) returns boolean language sql stable as $$
  select p_kind = 'walk' or exists (select 1 from public.vehicles_owned where player_id = p_uid and kind = p_kind)
$$;
create or replace function private.vehicle_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('current', v.cur, 'speed_kmh', (c -> v.cur ->> 'speed_kmh')::float8, 'range_m', (c -> v.cur ->> 'range_m')::float8,
    'fuel', coalesce((c -> v.cur ->> 'fuel')::boolean, false),
    'all', (select jsonb_agg(jsonb_build_object('id', k, 'name', c -> k ->> 'name', 'speed_kmh', (c -> k ->> 'speed_kmh')::float8, 'range_m', (c -> k ->> 'range_m')::float8,
              'ink', coalesce((c -> k ->> 'ink')::int, 0), 'fuel', coalesce((c -> k ->> 'fuel')::boolean, false), 'needs', c -> k ->> 'needs',
              'owned', private.vehicle_owned(p_uid, k)) order by o) from unnest(array['walk', 'bike', 'car']) with ordinality as u(k, o)))
  from (select private.explore_cfg() -> 'vehicles' as c) s,
       (select coalesce((select vehicle from public.explorers where player_id = p_uid), 'walk') as cur) v
$$;

/** buy a Bike (then a Car) */
create or replace function public.vehicle_buy(p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.explore_cfg() -> 'vehicles' -> p_kind; v_cost int;
begin
  if p_kind not in ('bike', 'car') or c is null then raise exception 'invalid_vehicle' using errcode = 'P0001'; end if;
  if private.vehicle_owned(v_uid, p_kind) then raise exception 'already_owned' using errcode = 'P0001'; end if;
  if c ->> 'needs' is not null and not private.vehicle_owned(v_uid, c ->> 'needs') then raise exception 'needs_bike_first' using errcode = 'P0001'; end if;
  v_cost := coalesce((c ->> 'ink')::int, 0);
  if v_cost > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'vehicle', 'vehicle', p_kind, 'vehicle:' || v_uid || ':' || p_kind); end if;
  insert into public.vehicles_owned (player_id, kind) values (v_uid, p_kind);
  update public.explorers set vehicle = p_kind where player_id = v_uid;
  return private.explorer_json(v_uid) || jsonb_build_object('balances', private.balances(v_uid), 'cost', v_cost);
end $$;

/** ride a vehicle you own (or walk) */
create or replace function public.vehicle_use(p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if p_kind not in ('walk', 'bike', 'car') then raise exception 'invalid_vehicle' using errcode = 'P0001'; end if;
  if not private.vehicle_owned(v_uid, p_kind) then raise exception 'vehicle_not_owned' using errcode = 'P0001'; end if;
  update public.explorers set vehicle = p_kind, joy_bucket_m = 0, joy_at = now() where player_id = v_uid;
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  return private.explorer_json(v_uid);
end $$;

-- ---- the joystick, planet style ------------------------------------------------------------------------------------
-- Speed and range come from your vehicle. Walking and biking are free; the Car burns the tank (fuel). The anchor is
-- where you really are (your last GPS fix) — or, away travelling, the stop you arrived at. The server checks every
-- step: speed (a short burst bucket), range from the anchor, fuel.
create or replace function public.joystick_step(p_lng float8, p_lat float8) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  j jsonb := coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb);
  e public.explorers%rowtype; c record; t record; vc jsonb; here public.travel_stops;
  v_speed float8; v_range float8; v_fuel boolean; v_alng float8; v_alat float8;
  v_tank float8 := greatest(coalesce((j ->> 'tank_seconds')::float8, 60), 0);
  v_burst float8 := least(greatest(coalesce((j ->> 'burst_seconds')::float8, 4), 1), 30);
  v_day timestamptz := private.day_start(now());
  v_refill boolean; v_secs float8; v_bucket float8; v_dt float8; v_d float8; v_allow float8; v_travel boolean;
begin
  perform private.rate_limit('joystick', 9000, 3600);
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -85.05 and 85.05 then
    raise exception 'invalid_position' using errcode = 'P0001';
  end if;
  if not coalesce((j ->> 'enabled')::boolean, true) then raise exception 'joystick_disabled' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  if e.mode = 'travel' then perform private.travel_settle(v_uid); select * into e from public.explorers where player_id = v_uid; end if;
  v_travel := e.mode = 'travel';
  vc := private.explore_cfg() -> 'vehicles' -> coalesce(e.vehicle, 'walk');
  v_speed := greatest(coalesce((vc ->> 'speed_kmh')::float8, 6), 1) / 3.6;
  v_range := greatest(coalesce((vc ->> 'range_m')::float8, 600), 50);
  v_fuel := coalesce((vc ->> 'fuel')::boolean, false);
  if v_travel then
    if e.dest_lng is not null then raise exception 'on_the_way' using errcode = 'P0001'; end if;
    here := private.travel_here(e);
    v_alng := here.lng; v_alat := here.lat;
    v_range := greatest(v_range, coalesce((private.travel_cfg() ->> 'stay_m')::float8, 2500));
  else
    -- at home the joystick only nudges a GPS-anchored explorer
    if e.gps_at is null or e.gps_at < now() - interval '20 minutes' then raise exception 'gps_required' using errcode = 'P0001'; end if;
    v_alng := e.gps_lng; v_alat := e.gps_lat;
    v_range := v_range + coalesce(e.gps_accuracy_m, 50);
  end if;
  v_refill := coalesce((j ->> 'daily_refill')::boolean, true) and (e.joy_day is null or e.joy_day < v_day);
  v_secs := case when v_refill then greatest(e.joy_seconds, v_tank) else e.joy_seconds end;
  select * into c from private.explorer_now(v_uid);
  v_dt := case when e.joy_at is null then v_burst else greatest(extract(epoch from (now() - e.joy_at)), 0) end;
  v_bucket := least(v_speed * v_burst, coalesce(e.joy_bucket_m, 0) + v_dt * v_speed * 1.15);
  v_d := private.haversine_m(c.lng, c.lat, p_lng, p_lat);
  v_allow := greatest(least(v_d, v_bucket, case when v_fuel then v_secs * v_speed else 1e12 end), 0);
  if v_allow < 0.01 then
    update public.explorers
       set joy_seconds = v_secs::real, joy_day = case when v_refill then v_day else e.joy_day end, joy_bucket_m = v_bucket::real, joy_at = now()
     where player_id = v_uid;
    return private.explorer_json(v_uid) || jsonb_build_object('moved_m', 0, 'clamped', v_d > 0.5, 'empty', v_fuel and v_secs <= 0.01);
  end if;
  select * into t from private.mercator_lerp(c.lng, c.lat, p_lng, p_lat, case when v_d > 0 then v_allow / v_d else 0 end);
  -- no further than your vehicle's range from where you really are (or the stop you're staying at)
  if private.haversine_m(v_alng, v_alat, t.lng, t.lat) > v_range
     and private.haversine_m(v_alng, v_alat, t.lng, t.lat) > private.haversine_m(v_alng, v_alat, c.lng, c.lat) then
    return private.explorer_json(v_uid) || jsonb_build_object('moved_m', 0, 'clamped', true, 'leash', true, 'empty', v_fuel and v_secs <= 0.01);
  end if;
  update public.explorers
     set mode = case when v_travel then 'travel' else 'manual' end, lng = t.lng, lat = t.lat, fixed_at = now(), accuracy_m = null,
         dest_lng = null, dest_lat = null, speed_mps = null,
         joy_seconds = case when v_fuel then greatest(v_secs - v_allow / v_speed, 0) else v_secs end::real,
         joy_day = case when v_refill then v_day else e.joy_day end,
         joy_bucket_m = greatest(v_bucket - v_allow, 0)::real, joy_at = now(), updated_at = now()
   where player_id = v_uid;
  return private.explorer_json(v_uid)
      || jsonb_build_object('moved_m', round(v_allow::numeric, 2), 'clamped', v_allow < v_d - 0.5,
                            'empty', v_fuel and v_secs - v_allow / v_speed <= 0.01);
end $$;

-- ---- home stays private -----------------------------------------------------------------------------------------
alter table public.travel_trips add column if not exists group_id uuid;
alter table public.travel_trips add column if not exists with_leader boolean not null default false;
-- your trip no longer carries your home point (nothing needs it but the server)
create or replace function private.trip_json(p_uid uuid) returns jsonb language sql stable as $$
  select case when e.mode = 'travel' and t.id is not null then jsonb_build_object(
    'id', t.id, 'mode', t.mode, 'km', t.km, 'leg', t.leg, 'departs_at', t.departs_at, 'arrives_at', t.arrives_at, 'arrived', t.arrived or t.arrives_at <= now(),
    'from', (select private.stop_json(s) from public.travel_stops s where s.id = t.from_stop and t.mode <> 'home'),
    'to', (select private.stop_json(s) from public.travel_stops s where s.id = t.to_stop),
    'stops', t.stops, 'group', t.group_id is not null) end
  from public.explorers e left join public.travel_trips t on t.id = e.trip_id
  where e.player_id = p_uid
$$;


-- other travellers: a trip from home shows only where it's going (no start, no route, no departure time)
create or replace function public.travel_traffic() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  select coalesce(jsonb_agg(x.j order by x.done, x.departs_at desc), '[]'::jsonb) into v_out from (
    select t.arrived or t.arrives_at <= now() as done, t.departs_at,
      private.profile_json(t.player_id) || jsonb_build_object(
        'trip', t.id, 'mode', t.mode, 'arrived', t.arrived or t.arrives_at <= now(), 'inbound', t.from_home,
        'km', case when t.from_home then null else t.km end,
        'to', jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code, 'country', b.country, 'lng', b.lng, 'lat', b.lat),
        'from', case when t.from_home then null
                     else jsonb_build_object('id', a.id, 'name', a.name, 'code', a.code, 'country', a.country, 'lng', a.lng, 'lat', a.lat) end,
        'stops', case when t.from_home then '[]'::jsonb else t.stops end,
        'starts_at', case when t.from_home then null else t.departs_at end,
        'arrives_at', t.arrives_at) as j
    from public.travel_trips t
    join public.travel_stops b on b.id = t.to_stop
    left join public.travel_stops a on a.id = t.from_stop
    where t.mode in ('train', 'plane') and t.departs_at > now() - interval '6 hours'
      and t.player_id is distinct from v_uid
      and private.visible_to(t.player_id, v_uid)
      and coalesce((select p.share from public.travel_prefs p where p.player_id = t.player_id), true)
    order by t.departs_at desc
    limit 50
  ) x;
  return v_out;
end $$;

-- ---- travel groups ------------------------------------------------------------------------------------------------
create table if not exists public.travel_groups (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references public.players (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists travel_groups_leader on public.travel_groups (leader_id);
create table if not exists public.travel_group_members (
  group_id uuid not null references public.travel_groups (id) on delete cascade,
  player_id uuid not null unique references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, player_id)
);
create table if not exists public.travel_group_invites (
  group_id uuid not null references public.travel_groups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  invited_by uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, player_id)
);
create index if not exists travel_group_invites_player on public.travel_group_invites (player_id);
create index if not exists travel_group_invites_by on public.travel_group_invites (invited_by);
alter table public.travel_groups enable row level security;
alter table public.travel_group_members enable row level security;
alter table public.travel_group_invites enable row level security;
revoke all on public.travel_groups, public.travel_group_members, public.travel_group_invites from anon, authenticated;
alter table public.travel_trips drop constraint if exists travel_trips_group_fk;
alter table public.travel_trips add constraint travel_trips_group_fk foreign key (group_id) references public.travel_groups (id) on delete set null;
create index if not exists travel_trips_group on public.travel_trips (group_id);

create or replace function private.my_group(p_uid uuid) returns uuid language sql stable as $$
  select group_id from public.travel_group_members where player_id = p_uid
$$;

/** your group: members (where they are only while away travelling), the join code, your invites */
create or replace function public.travel_group() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.travel_groups%rowtype;
begin
  select * into g from public.travel_groups where id = private.my_group(v_uid);
  return jsonb_build_object(
    'group', case when g.id is null then null else jsonb_build_object(
      'id', g.id, 'code', g.code, 'leader', g.leader_id = v_uid, 'max', coalesce((private.explore_cfg() ->> 'group_max')::int, 10),
      'members', (select coalesce(jsonb_agg(private.profile_json(m.player_id) || jsonb_build_object('leader', m.player_id = g.leader_id, 'me', m.player_id = v_uid) || coalesce(
          -- where a member is: only while they're away travelling (never their GPS, never home)
          (select case when e.mode = 'travel' then jsonb_build_object('away', true, 'lng', n.lng, 'lat', n.lat, 'traveling', n.traveling,
                   'dest_lng', case when n.traveling then e.dest_lng end, 'dest_lat', case when n.traveling then e.dest_lat end,
                   'arrives_at', case when n.traveling then n.arrives_at end, 'fixed_at', e.fixed_at, 'speed_mps', e.speed_mps,
                   'origin_lng', e.lng, 'origin_lat', e.lat, 'vehicle', e.vehicle,
                   'trip', (select jsonb_build_object('mode', t.mode, 'to', s.name) from public.travel_trips t left join public.travel_stops s on s.id = t.to_stop where t.id = e.trip_id))
                  else jsonb_build_object('away', false) end
             from public.explorers e cross join lateral private.explorer_now(e.player_id) n
            where e.player_id = m.player_id and (e.mode <> 'travel' or (select t.mode from public.travel_trips t where t.id = e.trip_id) is distinct from 'home')),
          jsonb_build_object('away', false)) order by m.player_id <> g.leader_id, m.joined_at), '[]'::jsonb)
        from public.travel_group_members m where m.group_id = g.id),
      'invited', (select coalesce(jsonb_agg(private.profile_json(i.player_id)), '[]'::jsonb) from public.travel_group_invites i where i.group_id = g.id)) end,
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('group_id', i.group_id, 'by', private.profile_json(i.invited_by),
                  'size', (select count(*) from public.travel_group_members x where x.group_id = i.group_id)) order by i.created_at desc), '[]'::jsonb)
                from public.travel_group_invites i where i.player_id = v_uid));
end $$;

/** start a group (you need a Travel plot to lead one) */
create or replace function public.travel_group_create() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_id uuid; v_code text;
begin
  perform private.rate_limit('travel_group', 60, 3600);
  if private.my_group(v_uid) is not null then raise exception 'already_in_group' using errcode = 'P0001'; end if;
  if private.travel_plots(v_uid, 'train') + private.travel_plots(v_uid, 'plane') < 1 then raise exception 'needs_travel_plot' using errcode = 'P0001'; end if;
  loop
    v_code := upper(translate(substr(md5(gen_random_uuid()::text), 1, 6), '0o1il', 'XYZWK'));
    exit when not exists (select 1 from public.travel_groups where code = v_code);
  end loop;
  insert into public.travel_groups (leader_id, code) values (v_uid, v_code) returning id into v_id;
  insert into public.travel_group_members (group_id, player_id) values (v_id, v_uid);
  return public.travel_group();
end $$;

create or replace function private.group_join(p_uid uuid, p_group uuid) returns void language plpgsql as $$
begin
  if private.my_group(p_uid) is not null then raise exception 'already_in_group' using errcode = 'P0001'; end if;
  perform 1 from public.travel_groups where id = p_group for update;
  if not found then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  if (select count(*) from public.travel_group_members where group_id = p_group) >= coalesce((private.explore_cfg() ->> 'group_max')::int, 10) then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  insert into public.travel_group_members (group_id, player_id) values (p_group, p_uid);
  delete from public.travel_group_invites where player_id = p_uid;
end $$;

/** join with a code someone shared */
create or replace function public.travel_group_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid;
begin
  perform private.rate_limit('travel_group', 60, 3600);
  select id into v_g from public.travel_groups where code = upper(btrim(coalesce(p_code, '')));
  if v_g is null then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  perform private.group_join(v_uid, v_g);
  return public.travel_group();
end $$;

/** invite someone by username (any member can) */
create or replace function public.travel_group_invite(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid); v_to uuid;
begin
  perform private.rate_limit('travel_invite', 60, 3600);
  if v_g is null then raise exception 'not_in_group' using errcode = 'P0001'; end if;
  select id into v_to from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''))) and private.visible_to(id, v_uid);
  if v_to is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if v_to = v_uid or exists (select 1 from public.travel_group_members where group_id = v_g and player_id = v_to) then raise exception 'already_in_group' using errcode = 'P0001'; end if;
  insert into public.travel_group_invites (group_id, player_id, invited_by) values (v_g, v_to, v_uid) on conflict do nothing;
  return public.travel_group();
end $$;

create or replace function public.travel_group_accept(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if not exists (select 1 from public.travel_group_invites where group_id = p_group and player_id = v_uid) then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  perform private.group_join(v_uid, p_group);
  return public.travel_group();
end $$;

create or replace function public.travel_group_decline(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.travel_group_invites where group_id = p_group and player_id = v_uid;
  return public.travel_group();
end $$;

create or replace function private.group_leave(p_uid uuid) returns void language plpgsql as $$
declare g public.travel_groups%rowtype; v_next uuid;
begin
  select * into g from public.travel_groups where id = private.my_group(p_uid) for update;
  if not found then return; end if;
  delete from public.travel_group_members where group_id = g.id and player_id = p_uid;
  if g.leader_id = p_uid then
    select player_id into v_next from public.travel_group_members where group_id = g.id order by joined_at limit 1;
    if v_next is null then delete from public.travel_groups where id = g.id;
    else update public.travel_groups set leader_id = v_next where id = g.id; end if;
  end if;
end $$;

create or replace function public.travel_group_leave() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if private.my_group(v_uid) is null then raise exception 'not_in_group' using errcode = 'P0001'; end if;
  perform private.group_leave(v_uid);
  return public.travel_group();
end $$;

/** the leader can ask someone to leave */
create or replace function public.travel_group_kick(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid);
begin
  if v_g is null or not exists (select 1 from public.travel_groups where id = v_g and leader_id = v_uid) then raise exception 'not_group_leader' using errcode = 'P0001'; end if;
  if p_player = v_uid then raise exception 'not_group_leader' using errcode = 'P0001'; end if;
  delete from public.travel_group_members where group_id = v_g and player_id = p_player;
  return public.travel_group();
end $$;

/** everyone in the leader's group rides too: each boards at the stop nearest them and arrives with the leader */
create or replace function private.travel_ride_along(p_leader uuid, p_trip uuid) returns jsonb language plpgsql as $$
declare
  lt public.travel_trips%rowtype; b public.travel_stops; a public.travel_stops; m record; e public.explorers%rowtype; c record;
  cfg jsonb; r jsonb; v_secs float8; v_trip uuid; v_m float8; v_g uuid := private.my_group(p_leader);
  v_with jsonb := '[]'::jsonb; v_left jsonb := '[]'::jsonb;
begin
  if v_g is null then return null; end if;
  select * into lt from public.travel_trips where id = p_trip;
  update public.travel_trips set group_id = v_g where id = p_trip;
  select * into b from public.travel_stops where id = lt.to_stop;
  cfg := private.travel_cfg() -> lt.mode;
  for m in select player_id from public.travel_group_members where group_id = v_g and player_id <> p_leader order by joined_at loop
    select * into e from public.explorers where player_id = m.player_id for update;
    if not found then v_left := v_left || to_jsonb((select username from public.profiles where id = m.player_id)); continue; end if;
    if e.mode = 'travel' then perform private.travel_settle(m.player_id); select * into e from public.explorers where player_id = m.player_id; end if;
    select * into c from private.explorer_now(m.player_id);
    -- still on their way somewhere: they catch the next one
    if c.lng is null or c.traveling then v_left := v_left || to_jsonb((select username from public.profiles where id = m.player_id)); continue; end if;
    a := private.nearest_stop(b.kind, c.lng, c.lat, coalesce((cfg ->> 'board_km')::float8, 300), case when lt.mode = 'train' then b.region end);
    if a.id is null or a.id = b.id then
      if a.id is null then v_left := v_left || to_jsonb((select username from public.profiles where id = m.player_id)); end if;
      continue;
    end if;
    r := private.travel_route(lt.mode, a, b);
    if (r ->> 'km')::float8 > coalesce((cfg ->> 'max_km')::float8, 3000) then v_left := v_left || to_jsonb((select username from public.profiles where id = m.player_id)); continue; end if;
    v_secs := greatest(extract(epoch from lt.arrives_at - now()), 10);
    insert into public.travel_trips (player_id, mode, from_stop, to_stop, stops, km, arrives_at, from_home, group_id, with_leader)
    values (m.player_id, lt.mode, a.id, b.id, r -> 'stops', (r ->> 'km')::numeric, now() + make_interval(secs => v_secs), e.mode <> 'travel', v_g, true)
    returning id into v_trip;
    v_m := (r ->> 'km')::float8 * 1000;
    update public.explorers
       set mode = 'travel',
           home_lng = case when e.mode = 'travel' and e.home_lng is not null then e.home_lng else c.lng end,
           home_lat = case when e.mode = 'travel' and e.home_lat is not null then e.home_lat else c.lat end,
           lng = a.lng, lat = a.lat, fixed_at = now(), accuracy_m = null,
           dest_lng = coalesce((r -> 'stops' -> 0 ->> 'lng')::float8, b.lng), dest_lat = coalesce((r -> 'stops' -> 0 ->> 'lat')::float8, b.lat),
           speed_mps = greatest(v_m, 1) / v_secs, trip_id = v_trip, updated_at = now()
     where player_id = m.player_id;
    v_with := v_with || to_jsonb((select username from public.profiles where id = m.player_id));
  end loop;
  return jsonb_build_object('with', v_with, 'left_behind', v_left);
end $$;

-- the leader's departure takes the group along; riding along doesn't use up your own trips
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.travel_depart(text,text)'::regprocedure);
  n := replace(d, '   where player_id = v_uid;' || chr(10) || '  return public.travel_status();',
    '   where player_id = v_uid;' || chr(10) || '  return public.travel_status() || jsonb_build_object(''group'', private.travel_ride_along(v_uid, v_trip));');
  if n = d then raise exception 'explore: travel_depart anchor not found'; end if;
  execute n;
end $$;
create or replace function private.travel_trips_left(p_uid uuid, p_mode text) returns int language sql stable as $$
  select greatest(0, least(coalesce((c ->> 'trips_max')::int, 12),
           coalesce((c ->> 'trips_base')::int, 2) + coalesce((c ->> 'trips_per_plot')::int, 1) * greatest(private.travel_plots(p_uid, p_mode) - 1, 0))
         - (select count(*) from public.travel_trips where player_id = p_uid and mode = p_mode and not with_leader and departs_at >= private.day_start(now()))::int)
  from (select private.travel_cfg() -> p_mode c) x
$$;

-- ---- finds: things to do on the map -------------------------------------------------------------------------------
create table if not exists public.find_claims (
  player_id uuid not null references public.players (id) on delete cascade,
  find_id text not null,
  kind text not null,
  ink int not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (player_id, find_id)
);
create index if not exists find_claims_day on public.find_claims (player_id, claimed_at desc);
alter table public.find_claims enable row level security;
revoke all on public.find_claims from anon, authenticated;

/** today's find in a spawn cell, if there is one (the same for everyone, new every day) */
create or replace function private.find_at(p_day int, p_cx int, p_cy int) returns jsonb language plpgsql stable as $$
declare
  f jsonb := private.explore_cfg() -> 'finds'; h text := md5('find:' || p_day || ':' || p_cx || ':' || p_cy);
  v_cell int := coalesce((f ->> 'cell')::int, 24);
  p float8 := ('x' || substr(h, 1, 8))::bit(32)::bigint / 4294967296.0;
  w float8 := ('x' || substr(h, 9, 8))::bit(32)::bigint / 4294967296.0;
  ox int := (('x' || substr(h, 17, 4))::bit(16)::int) % v_cell; oy int := (('x' || substr(h, 21, 4))::bit(16)::int) % v_cell;
  r float8 := ('x' || substr(h, 25, 8))::bit(32)::bigint / 4294967296.0;
  k jsonb; tot float8 := 0; acc float8 := 0; gx bigint; gy bigint; n float8; v_ink int;
begin
  if p >= coalesce((f ->> 'density')::float8, 0.5) then return null; end if;
  select sum((x ->> 'weight')::float8) into tot from jsonb_array_elements(f -> 'kinds') x;
  for k in select x from jsonb_array_elements(f -> 'kinds') x loop
    acc := acc + (k ->> 'weight')::float8 / tot;
    exit when w < acc;
  end loop;
  v_ink := coalesce((k ->> 'ink')::int, (k ->> 'ink_min')::int + floor(r * ((k ->> 'ink_max')::int - (k ->> 'ink_min')::int + 1))::int);
  gx := p_cx::bigint * v_cell + ox; gy := p_cy::bigint * v_cell + oy;
  n := pi() * (1 - 2 * (gy + 0.5) / 4194304.0);
  return jsonb_build_object('id', 'f' || p_day || '_' || p_cx || '_' || p_cy, 'kind', k ->> 'id', 'ink', v_ink,
    'lng', (gx + 0.5) / 4194304.0 * 360 - 180, 'lat', degrees(atan(sinh(n))));
end $$;
create or replace function private.find_day() returns int language sql stable as $$
  select floor(extract(epoch from private.day_start(now())) / 86400)::int
$$;

/** the finds around a part of the map (zoomed in), and which you've already collected */
create or replace function public.map_finds(p_w float8, p_s float8, p_e float8, p_n float8) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); f jsonb := private.explore_cfg() -> 'finds'; v_cell int := coalesce((f ->> 'cell')::int, 24);
  v_day int := private.find_day(); x0 int; x1 int; y0 int; y1 int; v_out jsonb := '[]'::jsonb; cx int; cy int; v jsonb;
begin
  if p_w is null or p_s is null or p_e is null or p_n is null or p_e < p_w or p_n < p_s then return '[]'::jsonb; end if;
  x0 := floor(private.lng_to_gx(greatest(p_w, -180)) / v_cell::float8); x1 := floor(private.lng_to_gx(least(p_e, 179.9999)) / v_cell::float8);
  y0 := floor(private.lat_to_gy(least(p_n, 85)) / v_cell::float8); y1 := floor(private.lat_to_gy(greatest(p_s, -85)) / v_cell::float8);
  if (x1 - x0 + 1)::bigint * (y1 - y0 + 1) > coalesce((f ->> 'max_cells')::int, 900) then return '[]'::jsonb; end if;
  for cx in x0..x1 loop
    for cy in y0..y1 loop
      v := private.find_at(v_day, cx, cy);
      continue when v is null or exists (select 1 from public.find_claims where player_id = v_uid and find_id = v ->> 'id');
      v_out := v_out || jsonb_build_array(v - 'ink');
    end loop;
  end loop;
  return v_out;
end $$;

/** collect a find you're standing by */
create or replace function public.map_find_claim(p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); f jsonb := private.explore_cfg() -> 'finds'; m text[]; v jsonb; c record;
  v_ink int; v_today int; v_d float8;
begin
  perform private.rate_limit('map_find', 600, 3600);
  m := regexp_match(coalesce(p_id, ''), '^f(-?\d+)_(-?\d+)_(-?\d+)$');
  if m is null or m[1]::int <> private.find_day() then raise exception 'find_gone' using errcode = 'P0001'; end if;
  v := private.find_at(m[1]::int, m[2]::int, m[3]::int);
  if v is null then raise exception 'find_gone' using errcode = 'P0001'; end if;
  if exists (select 1 from public.find_claims where player_id = v_uid and find_id = p_id) then raise exception 'already_found' using errcode = 'P0001'; end if;
  select * into c from private.explorer_now(v_uid);
  if c.lng is null then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  v_d := private.haversine_m(c.lng, c.lat, (v ->> 'lng')::float8, (v ->> 'lat')::float8);
  if v_d > coalesce((f ->> 'reach_m')::float8, 45) then
    raise exception 'find_too_far' using errcode = 'P0001', detail = round(v_d)::text;
  end if;
  select coalesce(sum(ink), 0) into v_today from public.find_claims where player_id = v_uid and claimed_at >= private.day_start(now());
  v_ink := least((v ->> 'ink')::int, greatest(0, coalesce((f ->> 'ink_daily_cap')::int, 40) - v_today));
  insert into public.find_claims (player_id, find_id, kind, ink) values (v_uid, p_id, v ->> 'kind', v_ink);
  if v_ink > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_ink), 'finds', 'find', p_id, 'find:' || v_uid || ':' || p_id); end if;
  return jsonb_build_object('id', p_id, 'kind', v ->> 'kind', 'ink', v_ink, 'capped', v_ink < (v ->> 'ink')::int,
    'today', (select count(*) from public.find_claims where player_id = v_uid and claimed_at >= private.day_start(now())),
    'balances', private.balances(v_uid));
end $$;

-- the explorer's JSON carries the vehicle
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.explorer_json(uuid)'::regprocedure);
  n := replace(d, '''trip'', private.trip_json(p_uid),', '''trip'', private.trip_json(p_uid), ''vehicle'', private.vehicle_json(p_uid),');
  if n = d then raise exception 'explore: explorer_json anchor not found'; end if;
  execute n;
end $$;

do $$ declare f text; begin
  foreach f in array array['private.explore_cfg()', 'private.vehicle_owned(uuid, text)', 'private.vehicle_json(uuid)', 'private.my_group(uuid)',
    'private.group_join(uuid, uuid)', 'private.group_leave(uuid)', 'private.travel_ride_along(uuid, uuid)', 'private.find_at(integer, integer, integer)', 'private.find_day()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.vehicle_buy(text)', 'public.vehicle_use(text)', 'public.travel_group()', 'public.travel_group_create()',
    'public.travel_group_join(text)', 'public.travel_group_invite(text)', 'public.travel_group_accept(uuid)', 'public.travel_group_decline(uuid)',
    'public.travel_group_leave()', 'public.travel_group_kick(uuid)', 'public.map_finds(double precision, double precision, double precision, double precision)',
    'public.map_find_claim(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
