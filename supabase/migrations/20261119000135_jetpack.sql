-- The Jetpack: an even faster ride for the joystick (after the Car). 150 km/h, roams 15 km, runs on the tank.
update public.game_config set value = jsonb_set(value, '{vehicles,jet}',
  '{"name": "Jetpack", "speed_kmh": 150, "range_m": 15000, "ink": 4000, "fuel": true, "needs": "car"}'::jsonb)
 where key = 'explore';

alter table public.explorers drop constraint if exists explorers_vehicle_check;
alter table public.explorers add constraint explorers_vehicle_check check (vehicle in ('walk', 'bike', 'car', 'jet'));
alter table public.vehicles_owned drop constraint if exists vehicles_owned_kind_check;
alter table public.vehicles_owned add constraint vehicles_owned_kind_check check (kind in ('bike', 'car', 'jet'));

do $$ declare d text; n text; begin
  d := pg_get_functiondef('private.vehicle_json(uuid)'::regprocedure);
  n := replace(d, $a$unnest(array['walk', 'bike', 'car'])$a$, $a$unnest(array['walk', 'bike', 'car', 'jet'])$a$);
  if n = d then raise exception 'jetpack: vehicle_json anchor not found'; end if; execute n;

  d := pg_get_functiondef('public.vehicle_buy(text)'::regprocedure);
  n := replace(d, $a$if p_kind not in ('bike', 'car') or c is null$a$, $a$if p_kind not in ('bike', 'car', 'jet') or c is null$a$);
  n := replace(n, $a$raise exception 'needs_bike_first' using errcode = 'P0001';$a$,
                  $a$raise exception '%', case when c ->> 'needs' = 'car' then 'needs_car_first' else 'needs_bike_first' end using errcode = 'P0001';$a$);
  if n = d or position('needs_car_first' in n) = 0 then raise exception 'jetpack: vehicle_buy anchor not found'; end if; execute n;

  d := pg_get_functiondef('public.vehicle_use(text)'::regprocedure);
  n := replace(d, $a$if p_kind not in ('walk', 'bike', 'car') then$a$, $a$if p_kind not in ('walk', 'bike', 'car', 'jet') then$a$);
  if n = d then raise exception 'jetpack: vehicle_use anchor not found'; end if; execute n;
end $$;
