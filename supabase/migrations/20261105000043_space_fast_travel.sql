-- v0.26 Space fast travel: pay a little Ink to arrive right away — at launch, or part-way
-- through a trip. The price is a small base plus a bit per minute still left to fly.

update public.game_config set value = value || '{"fast_travel": {"enabled": true, "base_ink": 3, "ink_per_minute": 2}}'::jsonb
 where key = 'space' and not (value ? 'fast_travel');

/** What fast travel costs right now (null when there's no trip to speed up). */
create or replace function private.space_rush_cost(s public.space_pilots) returns int
language sql stable as $$
  select case when s.dest is null or s.arrive_at <= now() then null
    else coalesce((private.space_cfg() -> 'fast_travel' ->> 'base_ink')::int, 3)
         + coalesce((private.space_cfg() -> 'fast_travel' ->> 'ink_per_minute')::int, 2) * ceil(extract(epoch from (s.arrive_at - now())) / 60)::int end
$$;

create or replace function private.space_json(s public.space_pilots) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'parts', to_jsonb(s.parts), 'built', cardinality(s.parts) >= 4, 'engine', s.engine,
    'location', s.location, 'dest', s.dest, 'depart_at', s.depart_at, 'arrive_at', s.arrive_at,
    'exo_seed', s.exo_seed, 'home_seed', s.home_seed, 'home_name', s.home_name,
    'visited', to_jsonb(s.visited), 'samples', s.samples, 'launches', s.launches,
    'ink_today', case when s.ink_day is distinct from private.day_start(now()) then 0 else s.ink_today end,
    'rush_cost', private.space_rush_cost(s),
    'day', private.day_start(now()), 'server_time', now(), 'config', private.space_cfg(),
    'balances', private.balances(s.player_id))
$$;

/** Fast travel: land now for a little Ink. */
create or replace function public.space_rush() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_cost int;
begin
  perform private.rate_limit('space_launch', 120, 3600);
  if not coalesce((private.space_cfg() -> 'fast_travel' ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  s := private.space_pilot(v_uid);
  v_cost := private.space_rush_cost(s);
  if v_cost is null then raise exception 'not_in_flight' using errcode = 'P0001'; end if;
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'space_rush', 'space', s.dest, 'space-rush:' || v_uid || ':' || s.launches);
  update public.space_pilots set arrive_at = now() - interval '1 second', updated_at = now() where player_id = v_uid;
  s := private.space_pilot(v_uid);  -- lands it
  return private.space_json(s) || jsonb_build_object('rush_paid', v_cost);
end $$;

revoke all on function private.space_rush_cost(public.space_pilots) from public;
revoke all on function public.space_rush() from public, anon;
grant execute on function public.space_rush() to authenticated, service_role;
