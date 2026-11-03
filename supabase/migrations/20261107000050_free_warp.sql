-- v0.33 Free warp: any world you've unlocked (your engine reaches it) or already visited — and your
-- home world, and Earth — is an instant, free trip. Only brand-new far-off worlds still take time
-- (and fuel) to reach; and you can warp even mid-flight, which simply redirects the rocket.

/** Can this pilot warp (free and instant) to that destination? */
create or replace function private.space_warpable(s public.space_pilots, p_dest text) returns boolean
language sql stable as $$
  select case
    when p_dest is null then false
    when p_dest = 'earth' then true
    when p_dest like 'exo:%' then p_dest = 'exo:' || s.home_seed or p_dest = any(s.visited)
    else (private.space_cfg() -> 'worlds') ? p_dest
         and (p_dest = any(s.visited) or s.engine >= coalesce((private.space_cfg() -> 'worlds' -> p_dest ->> 'tier')::int, 1))
  end
$$;

/** Where you can warp to right now. */
create or replace function private.space_warps(s public.space_pilots) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(d), '[]'::jsonb) from (
    select 'earth' d
    union all select k from jsonb_object_keys(private.space_cfg() -> 'worlds') k where k <> 'exo' and private.space_warpable(s, k)
    union all select v from unnest(s.visited) v where v like 'exo:%'
    union all select 'exo:' || s.home_seed where s.home_seed is not null and not (('exo:' || s.home_seed) = any(s.visited))
  ) x
$$;

create or replace function private.space_rush_cost(s public.space_pilots) returns int
language sql stable as $$
  select case when s.dest is null or s.arrive_at <= now() then null
    when private.space_warpable(s, s.dest) then 0
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
    'rush_cost', private.space_rush_cost(s), 'warps', private.space_warps(s),
    'day', private.day_start(now()), 'server_time', now(), 'config', private.space_cfg(),
    'balances', private.balances(s.player_id))
$$;

/** Launch for a world ('earth', a world id, 'home', 'exo' for a random new far-off world, or a
    far-off world you've been to as 'exo:<seed>'). Warpable destinations arrive instantly, for free. */
create or replace function public.space_launch(p_dest text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; w jsonb; v_key text; v_min numeric; v_fuel int := 0; v_dest text; v_seed int;
begin
  perform private.rate_limit('space_launch', 240, 3600);
  s := private.space_pilot(v_uid);
  if cardinality(s.parts) < 4 then raise exception 'rocket_not_built' using errcode = 'P0001'; end if;
  v_dest := p_dest; v_seed := s.exo_seed;
  if p_dest = 'home' then
    if s.home_seed is null then raise exception 'no_home_world' using errcode = 'P0001'; end if;
    v_dest := 'exo:' || s.home_seed; v_seed := s.home_seed;
  elsif p_dest like 'exo:%' then
    if not (p_dest = any(s.visited) or p_dest = 'exo:' || s.home_seed) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
    v_seed := substr(p_dest, 5)::int;
  elsif p_dest = 'exo' then
    v_seed := floor(random() * 2147483646)::int + 1;
    v_dest := 'exo:' || v_seed;
  elsif p_dest <> 'earth' then
    w := private.space_cfg() -> 'worlds' -> p_dest;
    if w is null then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  end if;
  if v_dest = s.location and s.dest is null then return private.space_json(s); end if;

  -- warp: free and instant (and fine mid-flight — it just redirects the rocket)
  if private.space_warpable(s, v_dest) then
    update public.space_pilots set dest = v_dest, depart_at = now(), arrive_at = now() - interval '1 second',
           exo_seed = case when v_dest like 'exo:%' then v_seed else exo_seed end, launches = s.launches + 1, updated_at = now()
     where player_id = v_uid;
    s := private.space_pilot(v_uid); -- lands it
    return private.space_json(s) || jsonb_build_object('fuel_spent', 0, 'warped', true);
  end if;

  -- somewhere new: a real trip
  if s.dest is not null then raise exception 'space_in_flight' using errcode = 'P0001'; end if;
  v_key := case when v_dest like 'exo:%' then 'exo' else v_dest end;
  w := private.space_cfg() -> 'worlds' -> v_key;
  if s.engine < coalesce((w ->> 'tier')::int, 1) then raise exception 'engine_too_small' using errcode = 'P0001'; end if;
  v_min := coalesce((w ->> 'minutes')::numeric, 3); v_fuel := coalesce((w ->> 'fuel')::int, 0);
  if v_fuel > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', v_fuel), 'space_fuel', 'space', v_dest, 'space-fuel:' || v_uid || ':' || s.launches);
  end if;
  update public.space_pilots set dest = v_dest, depart_at = now(), arrive_at = now() + make_interval(secs => v_min * 60),
         exo_seed = case when v_dest like 'exo:%' then v_seed else exo_seed end, launches = s.launches + 1, updated_at = now()
   where player_id = v_uid returning * into s;
  return private.space_json(s) || jsonb_build_object('fuel_spent', v_fuel, 'warped', false);
end $$;

revoke all on function private.space_warpable(public.space_pilots, text) from public;
revoke all on function private.space_warps(public.space_pilots) from public;
