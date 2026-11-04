-- v0.55 Balance pass.
--   * Planet Ink: still up to 100 a day on each world, and now up to 300 a day across all worlds together (hopping
--     between ten worlds could earn 1,000 a day, far more than farms, shops or Inkborn)
--   * Storms: every 45 minutes instead of 30, 8 shards instead of 10, 1-3 Ink each (was 2-5)
--   * Bases: levelling a building up no longer makes it need 50% more power and crew per level (now +20%), so
--     upgrades are worth it; refineries, smelters and trading posts get ratios a real base can actually feed
--     (refinery 4 stone -> 1 iron twice an hour; smelter 4 iron + 2 copper -> 1 titanium an hour; trading post 5 dust
--     or stone -> 1 Ink, 3 times an hour); upgrade costs grow a little gentler (x1.5 a level, was x1.6)

update public.game_config set value = value || '{"daily_cap_total": 300}'::jsonb where key = 'planets' and not value ? 'daily_cap_total';

update public.game_config set value = jsonb_set(jsonb_set(jsonb_set(value, '{weather,every_minutes}', '45'), '{weather,shards}', '8'), '{weather,ink}', '[1, 3]')
 where key = 'discover';

update public.game_config set value = value
  || jsonb_build_object('upgrade_growth', 1.5)
  || jsonb_build_object('modules', (value -> 'modules')
       || jsonb_build_object('refinery', jsonb_set(value -> 'modules' -> 'refinery', '{fx,convert}', '{"from": {"stone": 4}, "to": {"iron": 1}, "times": 2}'))
       || jsonb_build_object('smelter', jsonb_set(value -> 'modules' -> 'smelter', '{fx,convert}', '{"from": {"iron": 4, "copper": 2}, "to": {"titanium": 1}, "times": 1}'))
       || jsonb_build_object('market', jsonb_set(value -> 'modules' -> 'market', '{fx,sell}', '{"dust": 5, "stone": 5, "per": 1, "max": 3}')))
 where key = 'bases' and value -> 'modules' ? 'refinery';

/** Pay planet Ink: up to the world's daily cap, and up to the daily cap across all worlds. */
create or replace function private.planet_pay_world(p_uid uuid, p_world text, p_amount int, p_ref text, p_idem text) returns int
language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_cap int := coalesce((private.planet_cfg() ->> 'daily_cap')::int, 100);
  v_total int := coalesce((private.planet_cfg() ->> 'daily_cap_total')::int, 300); v_had int; v_all int; v_pay int;
begin
  if p_amount <= 0 then return 0; end if;
  insert into public.planet_ink_days (player_id, world, day) values (p_uid, p_world, v_day) on conflict do nothing;
  select ink into v_had from public.planet_ink_days where player_id = p_uid and world = p_world and day = v_day for update;
  select coalesce(sum(ink), 0) into v_all from public.planet_ink_days where player_id = p_uid and day = v_day;
  v_pay := least(p_amount, greatest(0, v_cap - v_had), greatest(0, v_total - v_all));
  if v_pay > 0 then
    update public.planet_ink_days set ink = ink + v_pay where player_id = p_uid and world = p_world and day = v_day;
    perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'space', 'planet', p_ref, p_idem);
  end if;
  return v_pay;
end $$;
revoke all on function private.planet_pay_world(uuid, text, int, text, text) from public;

create or replace function private.base_econ(p_layout jsonb, p_levels jsonb, p_owner uuid) returns jsonb language plpgsql stable as $$
declare c jsonb := private.base_cfg(); m jsonb; fx jsonb; lv int; mult numeric; v_sup numeric := 0; v_dem numeric := 0; v_crew numeric := 0; v_need numeric := 0;
  v_boost numeric := 0; v_depots int := 0; v_eff numeric; v_out jsonb := '{}'::jsonb; v_ink numeric := 0; v_res numeric := 0; v_conv jsonb := '[]'::jsonb; v_sell jsonb := '[]'::jsonb;
  k record; v_rs jsonb := private.base_research_of(p_owner); v_auto numeric; v_per jsonb := '[]'::jsonb;
begin
  for m in select * from jsonb_array_elements(coalesce(p_layout, '[]'::jsonb)) loop
    fx := c -> 'modules' -> (m ->> 'k') -> 'fx';
    if fx is null then continue; end if;
    lv := greatest(1, coalesce((p_levels ->> (m ->> 'id'))::int, 1));
    mult := power(1.5, lv - 1);
    -- power and crew makers grow 50% a level; a levelled-up building only needs a little more to run (+20% a level)
    if coalesce((fx ->> 'power')::numeric, 0) > 0 then v_sup := v_sup + (fx ->> 'power')::numeric * mult; else v_dem := v_dem - coalesce((fx ->> 'power')::numeric, 0) * (1 + 0.2 * (lv - 1)); end if;
    if coalesce((fx ->> 'crew')::numeric, 0) > 0 then v_crew := v_crew + (fx ->> 'crew')::numeric * mult; else v_need := v_need - coalesce((fx ->> 'crew')::numeric, 0) * (1 + 0.2 * (lv - 1)); end if;
    v_boost := v_boost + coalesce((fx ->> 'boost')::numeric, 0);
    if fx ? 'storage' then v_depots := v_depots + lv; end if;
  end loop;
  v_eff := least(1, case when v_dem > 0 then v_sup / v_dem else 1 end) * least(1, case when v_need > 0 then v_crew / v_need else 1 end);
  v_auto := (1 + least(0.2, v_boost)) * (case when v_rs ? 'automation' then 1.2 else 1 end) * v_eff;
  for m in select * from jsonb_array_elements(coalesce(p_layout, '[]'::jsonb)) loop
    fx := c -> 'modules' -> (m ->> 'k') -> 'fx';
    if fx is null or not (fx ? 'out' or fx ? 'ink' or fx ? 'research' or fx ? 'convert' or fx ? 'sell') then continue; end if;
    lv := greatest(1, coalesce((p_levels ->> (m ->> 'id'))::int, 1));
    mult := power(1.5, lv - 1) * v_auto;
    for k in select key, value::numeric n from jsonb_each_text(coalesce(fx -> 'out', '{}'::jsonb)) loop
      v_out := v_out || jsonb_build_object(k.key, coalesce((v_out ->> k.key)::numeric, 0) + k.n * mult);
    end loop;
    v_ink := v_ink + coalesce((fx ->> 'ink')::numeric, 0) * mult;
    v_res := v_res + coalesce((fx ->> 'research')::numeric, 0) * mult;
    if fx ? 'convert' then v_conv := v_conv || jsonb_build_array((fx -> 'convert') || jsonb_build_object('rate', (fx -> 'convert' ->> 'times')::numeric * mult)); end if;
    if fx ? 'sell' then v_sell := v_sell || jsonb_build_array((fx -> 'sell') || jsonb_build_object('rate', (fx -> 'sell' ->> 'max')::numeric * mult)); end if;
    v_per := v_per || jsonb_build_array(jsonb_build_object('id', m ->> 'id', 'k', m ->> 'k', 'lv', lv, 'mult', round(mult, 3)));
  end loop;
  return jsonb_build_object('power', jsonb_build_object('supply', round(v_sup, 1), 'demand', round(v_dem, 1)), 'crew', jsonb_build_object('have', round(v_crew, 1), 'need', round(v_need, 1)),
    'efficiency', round(v_eff, 3), 'boost', least(0.2, v_boost), 'out', v_out, 'ink', round(v_ink, 2), 'research', round(v_res, 2), 'convert', v_conv, 'sell', v_sell,
    'storage_cap', round((coalesce((c ->> 'storage_base')::numeric, 120) + coalesce((c ->> 'storage_per_depot')::numeric, 240) * v_depots) * (case when v_rs ? 'megastructures' then 1.5 else 1 end)),
    'buildings', v_per);
end $$;
