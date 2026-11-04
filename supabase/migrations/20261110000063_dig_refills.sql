-- v0.45 Easier to grind: much more digging energy, refilling 3x faster, and ways to top up —
-- a free refill every day, Ink refills, and rations you make from what you dig (ice + moondust).

update public.game_config
   set value = jsonb_set(jsonb_set(value, '{energy}', '{"max": 600, "per_tap": 1, "regen_per_minute": 6}'::jsonb), '{taps_per_second}', '8')
       || '{"refills": {"free_per_day": 1, "ink": {"cost": 15, "energy": 250, "per_day": 6}, "ration": {"cost": {"ice": 4, "dust": 8}, "energy": 80}}}'::jsonb
 where key = 'mining' and not value ? 'refills';

alter table public.planet_miners add column if not exists refill_day timestamptz;
alter table public.planet_miners add column if not exists free_refills int not null default 0;
alter table public.planet_miners add column if not exists ink_refills int not null default 0;

create or replace function private.refill_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'free_left', greatest(0, coalesce((private.mine_cfg() -> 'refills' ->> 'free_per_day')::int, 1) - case when m.refill_day = private.day_start(now()) then m.free_refills else 0 end),
    'ink_left', greatest(0, coalesce((private.mine_cfg() -> 'refills' -> 'ink' ->> 'per_day')::int, 6) - case when m.refill_day = private.day_start(now()) then m.ink_refills else 0 end))
  from public.planet_miners m where m.player_id = p_uid
$$;

-- the dig state now says what refills are left
create or replace function private.dig_json(p_uid uuid, p_world text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'world', p_world, 'depth', coalesce(s.depth, 0), 'shaft', to_jsonb(s.d), 'layers_reached', coalesce(s.layers_reached, 0),
    'tools', to_jsonb(m.tools), 'power', private.best_power(m),
    'energy', floor(m.energy), 'energy_max', coalesce((private.mine_cfg() -> 'energy' ->> 'max')::int, 240),
    'regen_per_minute', coalesce((private.mine_cfg() -> 'energy' ->> 'regen_per_minute')::numeric, 2),
    'refills', private.refill_json(p_uid),
    'items', private.items_json(p_uid), 'config', private.mine_cfg())
  from public.planet_miners m left join public.planet_shafts s on s.player_id = m.player_id and s.world = p_world
  where m.player_id = p_uid
$$;

/** Top up digging energy: 'free' (once a day), 'ink' (a few a day) or 'ration' (made from ice + moondust, any time). */
create or replace function public.planet_dig_refill(p_kind text, p_world text default null, p_gx int default null, p_gy int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mine_cfg() -> 'refills'; m public.planet_miners%rowtype;
  v_max numeric := coalesce((private.mine_cfg() -> 'energy' ->> 'max')::numeric, 600); v_add numeric; v_day timestamptz := private.day_start(now()); k record; v_have bigint;
begin
  perform private.rate_limit('dig_refill', 120, 3600);
  m := private.miner(v_uid);
  if m.refill_day is distinct from v_day then
    update public.planet_miners set refill_day = v_day, free_refills = 0, ink_refills = 0 where player_id = v_uid returning * into m;
  end if;
  if m.energy >= v_max - 0.5 then raise exception 'energy_full' using errcode = 'P0001'; end if;
  if p_kind = 'free' then
    if m.free_refills >= coalesce((c ->> 'free_per_day')::int, 1) then raise exception 'refill_used' using errcode = 'P0001'; end if;
    v_add := v_max;
    update public.planet_miners set free_refills = free_refills + 1 where player_id = v_uid;
  elsif p_kind = 'ink' then
    if m.ink_refills >= coalesce((c -> 'ink' ->> 'per_day')::int, 6) then raise exception 'refill_used' using errcode = 'P0001'; end if;
    perform private.charge(v_uid, jsonb_build_object('ink', coalesce((c -> 'ink' ->> 'cost')::int, 15)), 'dig_refill', 'planet', 'ink', 'dig-refill:' || v_uid || ':' || v_day::date || ':' || (m.ink_refills + 1));
    v_add := coalesce((c -> 'ink' ->> 'energy')::numeric, 250);
    update public.planet_miners set ink_refills = ink_refills + 1 where player_id = v_uid;
  elsif p_kind = 'ration' then
    for k in select key, value::bigint n from jsonb_each_text(c -> 'ration' -> 'cost') loop
      select qty into v_have from public.planet_items where player_id = v_uid and item = k.key for update;
      if coalesce(v_have, 0) < k.n then raise exception 'not_enough_materials' using errcode = 'P0001', detail = k.key; end if;
    end loop;
    for k in select key, value::bigint n from jsonb_each_text(c -> 'ration' -> 'cost') loop
      update public.planet_items set qty = qty - k.n where player_id = v_uid and item = k.key;
    end loop;
    v_add := coalesce((c -> 'ration' ->> 'energy')::numeric, 80);
  else
    raise exception 'invalid_refill' using errcode = 'P0001';
  end if;
  update public.planet_miners set energy = least(v_max, energy + v_add), energy_at = now() where player_id = v_uid;
  return (case when p_gx is not null then private.plot_dig_json(v_uid, p_world, p_gx, p_gy) else private.dig_json(v_uid, p_world) end)
         || jsonb_build_object('refilled', p_kind, 'added', v_add, 'balances', private.balances(v_uid));
end $$;

do $$
begin
  execute 'revoke all on function private.refill_json(uuid) from public';
  execute 'revoke all on function public.planet_dig_refill(text, text, int, int) from public, anon';
  execute 'grant execute on function public.planet_dig_refill(text, text, int, int) to authenticated, service_role';
end $$;

alter table public.planet_miners alter column energy set default 600;
