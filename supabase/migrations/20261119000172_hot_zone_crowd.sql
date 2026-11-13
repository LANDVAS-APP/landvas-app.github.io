-- The Hot Zone's crowd, for the app's Hot Zone button: how many players are there right now, and how many have
-- been there today. "There" = their explorer is standing inside today's zone; "today" also counts anyone who
-- claimed a plot in the zone's city today. Counts only — no names, no positions.
create or replace function public.hot_zone_crowd() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_z jsonb := private.hot_zone(private.today());
  v_cx numeric; v_cy numeric; v_r numeric; v_day timestamptz := private.day_start(now());
  v_now int; v_today int;
begin
  if v_z is null then return jsonb_build_object('now', 0, 'today', 0); end if;
  v_cx := (v_z ->> 'gx')::numeric; v_cy := (v_z ->> 'gy')::numeric; v_r := (v_z ->> 'radius')::numeric;
  with here as (
    select e.player_id, p.last_active_at
    from public.explorers e join public.players p on p.id = e.player_id
    where p.status = 'active'
      and greatest(e.fixed_at, e.updated_at, p.last_active_at) >= v_day
      and (private.lng_to_gx(e.lng) - v_cx) ^ 2 + (private.lat_to_gy(e.lat) - v_cy) ^ 2 <= v_r ^ 2
  ), claimed as (
    select distinct w.owner_id as player_id
    from public.world_plots w
    where w.city_id = (v_z ->> 'id')::int and w.owner_id is not null and w.claimed_at >= v_day
  )
  select (select count(*) from here where last_active_at >= now() - interval '15 minutes'),
         (select count(*) from (select player_id from here union select player_id from claimed) t)
    into v_now, v_today;
  return jsonb_build_object('now', v_now, 'today', v_today);
end $$;

revoke all on function public.hot_zone_crowd() from public, anon;
grant execute on function public.hot_zone_crowd() to authenticated;
