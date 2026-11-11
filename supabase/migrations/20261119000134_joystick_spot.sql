-- v1.2: the joystick no longer needs a fresh GPS fix. It steers from your last real location (still on the same
-- leash), and wherever you steer to stays put — through refreshes — until you go back to GPS or tap Home.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.joystick_step(double precision,double precision)'::regprocedure);
  n := replace(d, $a$    if e.gps_at is null or e.gps_at < now() - interval '20 minutes' then raise exception 'gps_required' using errcode = 'P0001'; end if;$a$,
                  $a$    if e.gps_lng is null then raise exception 'gps_required' using errcode = 'P0001'; end if; -- (your last real location: no fresh fix needed)$a$);
  if n = d then raise exception 'joystick spot: joystick_step anchor not found'; end if;
  execute n;
end $$;

/** Home: put the explorer back on your last real (GPS) location, without asking for GPS again. */
create or replace function public.explorer_home() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.explorers%rowtype;
begin
  select * into e from public.explorers where player_id = v_uid for update;
  if not found or e.gps_lng is null then raise exception 'gps_required' using errcode = 'P0001'; end if;
  if e.mode = 'travel' then raise exception 'on_a_trip' using errcode = 'P0001'; end if;
  update public.explorers set mode = 'gps', lng = e.gps_lng, lat = e.gps_lat, fixed_at = now(), dest_lng = null, dest_lat = null, speed_mps = null where player_id = v_uid;
  return private.explorer_json(v_uid);
end $$;
revoke all on function public.explorer_home() from public, anon;
grant execute on function public.explorer_home() to authenticated;
