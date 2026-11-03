-- v0.38 Rovers. Buy a rover (Ink plus materials you've dug) and drive it across the worlds, far faster
-- than walking. Driving burns fuel by the kilometre; refuel with ice you've dug (or Ink). The server
-- works out the distance from where you actually went (no faster than the rover can go) and burns
-- the fuel; run dry and you're back on foot.

insert into public.game_config (key, value, description) values ('rovers', '{
  "enabled": true,
  "fuel_per_ice": 10,
  "fuel_per_ink": 4,
  "models": [
    {"id": "buggy",   "name": "Moon Buggy",  "emoji": "🚙", "speed": 22, "tank": 120, "burn_per_km": 10, "cost": {"ink": 150, "iron": 20, "copper": 10}},
    {"id": "crawler", "name": "Crawler",     "emoji": "🚜", "speed": 32, "tank": 240, "burn_per_km": 8,  "cost": {"ink": 400, "iron": 60, "copper": 30, "titanium": 15}},
    {"id": "hover",   "name": "Hover rover", "emoji": "🛸", "speed": 50, "tank": 360, "burn_per_km": 6,  "cost": {"ink": 900, "titanium": 40, "plasma": 15, "gem": 10}}
  ]
}', 'Rovers: the models (top speed m/s, fuel tank, fuel burned per km, price in Ink and materials) and what ice or Ink is worth in fuel.')
on conflict (key) do nothing;

create table if not exists public.planet_rovers (
  player_id uuid primary key references public.players (id) on delete cascade,
  owned text[] not null default '{}',
  active text,
  fuel numeric not null default 0,
  driving boolean not null default false,
  drive_world text, last_d float8[], last_at timestamptz,
  km numeric not null default 0,
  km_day timestamptz, km_today numeric not null default 0
);
alter table public.planet_rovers enable row level security;
revoke all on public.planet_rovers from anon, authenticated;

create or replace function private.rover_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('rovers'), '{}'::jsonb) $$;
create or replace function private.rover_model(p_id text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(private.rover_cfg() -> 'models') x where x ->> 'id' = p_id
$$;
create or replace function private.rover_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('owned', to_jsonb(coalesce(r.owned, '{}')), 'active', r.active, 'fuel', round(coalesce(r.fuel, 0), 1),
    'tank', coalesce((private.rover_model(r.active) ->> 'tank')::numeric, 0), 'driving', coalesce(r.driving, false), 'world', r.drive_world,
    'km', round(coalesce(r.km, 0), 2), 'km_today', case when r.km_day = private.day_start(now()) then round(r.km_today, 2) else 0 end,
    'config', private.rover_cfg(), 'items', private.items_json(p_uid), 'item_info', private.mine_cfg() -> 'items')
  from (select p_uid id) x left join public.planet_rovers r on r.player_id = p_uid
$$;

create or replace function public.rover_state() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return private.rover_json(v_uid);
end $$;

create or replace function public.rover_buy(p_model text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m jsonb := private.rover_model(p_model); r public.planet_rovers%rowtype; k record; v_have bigint;
begin
  if m is null then raise exception 'invalid_rover' using errcode = 'P0001'; end if;
  insert into public.planet_rovers (player_id) values (v_uid) on conflict do nothing;
  select * into r from public.planet_rovers where player_id = v_uid for update;
  if p_model = any(r.owned) then
    update public.planet_rovers set active = p_model, fuel = least(fuel, (m ->> 'tank')::numeric) where player_id = v_uid;
    return private.rover_json(v_uid);
  end if;
  for k in select key, value::bigint n from jsonb_each_text(m -> 'cost') where key <> 'ink' loop
    select qty into v_have from public.planet_items where player_id = v_uid and item = k.key for update;
    if coalesce(v_have, 0) < k.n then raise exception 'not_enough_materials' using errcode = 'P0001', detail = k.key; end if;
  end loop;
  if coalesce((m -> 'cost' ->> 'ink')::int, 0) > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', (m -> 'cost' ->> 'ink')::int), 'rover', 'planet', p_model, 'rover:' || v_uid || ':' || p_model);
  end if;
  for k in select key, value::bigint n from jsonb_each_text(m -> 'cost') where key <> 'ink' loop
    update public.planet_items set qty = qty - k.n where player_id = v_uid and item = k.key;
  end loop;
  -- a new rover comes with a quarter of a tank
  update public.planet_rovers set owned = owned || p_model, active = p_model, fuel = greatest(fuel, (m ->> 'tank')::numeric / 4) where player_id = v_uid;
  return private.rover_json(v_uid) || jsonb_build_object('bought', p_model, 'balances', private.balances(v_uid));
end $$;

/** Refuel the active rover with ice (p_ice) and/or Ink (p_ink). */
create or replace function public.rover_refuel(p_ice int default 0, p_ink int default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.rover_cfg(); r public.planet_rovers%rowtype; v_tank numeric; v_room numeric;
  v_ice int := greatest(0, coalesce(p_ice, 0)); v_ink int := greatest(0, coalesce(p_ink, 0)); v_have bigint; v_add numeric;
begin
  select * into r from public.planet_rovers where player_id = v_uid for update;
  if not found or r.active is null then raise exception 'no_rover' using errcode = 'P0001'; end if;
  v_tank := (private.rover_model(r.active) ->> 'tank')::numeric; v_room := v_tank - r.fuel;
  -- never pay for more than fits
  v_ice := least(v_ice, ceil(v_room / coalesce((c ->> 'fuel_per_ice')::numeric, 10))::int);
  v_room := v_room - v_ice * coalesce((c ->> 'fuel_per_ice')::numeric, 10);
  v_ink := least(v_ink, greatest(0, ceil(v_room / coalesce((c ->> 'fuel_per_ink')::numeric, 4)))::int);
  if v_ice > 0 then
    select qty into v_have from public.planet_items where player_id = v_uid and item = 'ice' for update;
    if coalesce(v_have, 0) < v_ice then raise exception 'not_enough_materials' using errcode = 'P0001', detail = 'ice'; end if;
    update public.planet_items set qty = qty - v_ice where player_id = v_uid and item = 'ice';
  end if;
  if v_ink > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_ink), 'rover_fuel', 'planet', r.active, 'rover-fuel:' || gen_random_uuid()); end if;
  v_add := v_ice * coalesce((c ->> 'fuel_per_ice')::numeric, 10) + v_ink * coalesce((c ->> 'fuel_per_ink')::numeric, 4);
  update public.planet_rovers set fuel = least(v_tank, fuel + v_add) where player_id = v_uid;
  return private.rover_json(v_uid) || jsonb_build_object('added', v_add, 'balances', private.balances(v_uid));
end $$;

/** Get in (p_on) or out. */
create or replace function public.rover_drive(p_world text, p_on boolean, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.planet_rovers%rowtype; s public.space_pilots%rowtype;
begin
  select * into r from public.planet_rovers where player_id = v_uid for update;
  if p_on then
    if r.player_id is null or r.active is null then raise exception 'no_rover' using errcode = 'P0001'; end if;
    s := private.space_pilot(v_uid);
    if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
    if r.active is null then raise exception 'no_rover' using errcode = 'P0001'; end if;
    if r.fuel <= 0 then raise exception 'no_fuel' using errcode = 'P0001'; end if;
    update public.planet_rovers set driving = true, drive_world = p_world, last_d = private.unit3(p_d), last_at = now() where player_id = v_uid;
  else
    update public.planet_rovers set driving = false where player_id = v_uid;
  end if;
  return private.rover_json(v_uid);
end $$;

/** While driving (about every 2 s): where you are now. Burns fuel for the distance (capped at top speed). */
create or replace function public.rover_tick(p_world text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.planet_rovers%rowtype; m jsonb; v_d float8[] := private.unit3(p_d);
  v_dist float8 := 0; v_secs float8; v_burn numeric; v_day timestamptz := private.day_start(now());
begin
  perform private.rate_limit('rover_tick', 4000, 3600);
  select * into r from public.planet_rovers where player_id = v_uid for update;
  if not found or not r.driving or r.drive_world <> p_world then return private.rover_json(v_uid) || jsonb_build_object('driving', false); end if;
  m := private.rover_model(r.active);
  if v_d is not null and r.last_d is not null then
    v_dist := acos(least(1, greatest(-1, v_d[1] * r.last_d[1] + v_d[2] * r.last_d[2] + v_d[3] * r.last_d[3]))) * private.planet_radius(p_world);
    v_secs := greatest(0.5, extract(epoch from now() - r.last_at));
    v_dist := least(v_dist, (m ->> 'speed')::float8 * v_secs * 1.25 + 5); -- no faster than the rover goes
  end if;
  v_burn := least(r.fuel, v_dist / 1000 * (m ->> 'burn_per_km')::numeric);
  update public.planet_rovers set fuel = fuel - v_burn, last_d = coalesce(v_d, last_d), last_at = now(), km = km + v_dist / 1000,
         km_today = case when km_day = v_day then km_today else 0 end + v_dist / 1000, km_day = v_day,
         driving = (fuel - v_burn) > 0.0001
   where player_id = v_uid returning * into r;
  return private.rover_json(v_uid) || jsonb_build_object('moved_m', round(v_dist::numeric, 1), 'burned', round(v_burn, 2), 'out_of_fuel', not r.driving);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.rover_cfg()', 'private.rover_model(text)', 'private.rover_json(uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.rover_state()', 'public.rover_buy(text)', 'public.rover_refuel(int, int)', 'public.rover_drive(text, boolean, jsonb)', 'public.rover_tick(text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
