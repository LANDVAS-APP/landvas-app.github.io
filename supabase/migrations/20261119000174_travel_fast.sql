-- Fast travel: on a train, a plane or the trip home, pay Ink to arrive right now. The price is the minutes left
-- (rounded up) times `fast_ink_per_min`, never under `fast_min_ink` or over `fast_max_ink` (travel config;
-- defaults 1 Ink a minute, 5–60 Ink). You still pass through every station on the way (stamps and their Ink are
-- the same as riding it out).

/** what it costs to arrive now (null when there's no trip under way) */
create or replace function private.travel_fast_cost(p_uid uuid) returns int language sql stable as $$
  select case when t.id is null or t.arrived or t.arrives_at <= now() then null else
    least(coalesce((c ->> 'fast_max_ink')::int, 60),
          greatest(coalesce((c ->> 'fast_min_ink')::int, 5),
                   ceil(extract(epoch from (t.arrives_at - now())) / 60.0 * coalesce((c ->> 'fast_ink_per_min')::numeric, 1))::int)) end
  from (select private.travel_cfg() c) cfg
  left join public.explorers e on e.player_id = p_uid and e.mode = 'travel'
  left join public.travel_trips t on t.id = e.trip_id
$$;

create or replace function public.travel_fast() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.explorers%rowtype; t public.travel_trips%rowtype; v_cost int;
begin
  perform private.rate_limit('travel_fast', 30, 3600);
  select * into e from public.explorers where player_id = v_uid for update;
  if not found or e.mode <> 'travel' or e.trip_id is null then raise exception 'no_trip' using errcode = 'P0001'; end if;
  select * into t from public.travel_trips where id = e.trip_id for update;
  if not found or t.arrived or t.arrives_at <= now() then raise exception 'no_trip' using errcode = 'P0001'; end if;
  v_cost := private.travel_fast_cost(v_uid);
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'travel_fast', 'travel', t.id::text, 'travel_fast:' || t.id);
  -- every leg is behind you now: the trip settles through each station to the destination
  update public.explorers set speed_mps = 1e9, updated_at = now() where player_id = v_uid;
  update public.travel_trips set arrives_at = now() where id = t.id;
  return public.travel_status() || jsonb_build_object('fast_cost', v_cost, 'balances', private.balances(v_uid));
end $$;
revoke all on function public.travel_fast() from public, anon;
grant execute on function public.travel_fast() to authenticated;
revoke all on function private.travel_fast_cost(uuid) from public, anon, authenticated;

-- the trip says what arriving now would cost
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.travel_status()'::regprocedure);
  n := replace(d, $a$'trip', private.trip_json(v_uid), 'arrival', v_arr,$a$, $a$'trip', private.trip_json(v_uid), 'arrival', v_arr, 'fast_ink', private.travel_fast_cost(v_uid),$a$);
  if n = d then raise exception 'travel fast: travel_status anchor not found'; end if;
  execute n;
end $$;
