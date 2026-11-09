-- v0.7.5 The workshop's layout solver stops as soon as the flows settle.
--
-- It always ran (cells + 2) passes over every cell, so a big layout took ~0.5 s on every save (the main server's
-- slowest call after the sketch screen). Flows settle after about as many passes as the longest chain, and once a
-- pass changes nothing every later pass would give the same answer, so it now stops there: same result, a fraction
-- of the work. (A layout that never settles still stops after cells + 2 passes, as before.)
create or replace function private.rfac_solve(p_grid jsonb) returns jsonb language plpgsql stable as $$
declare c jsonb := private.rfac_cfg(); pc jsonb := c -> 'pieces'; v_cap numeric := (c ->> 'belt_cap')::numeric;
  v_keys text[] := array(select jsonb_object_keys(p_grid) order by 1); v_n int; it int; k text; n text; cell jsonb; p jsonb;
  outs jsonb := '{}'::jsonb; nouts jsonb; ins jsonb := '{}'::jsonb; nins jsonb; v_in jsonb; v_out jsonb; v_tot numeric; v_rate numeric; need record; v_income jsonb := '{}'::jsonb; v_status jsonb := '{}'::jsonb;
  -- who feeds each cell: built once
  feeds jsonb := '{}'::jsonb;
begin
  v_n := coalesce(array_length(v_keys, 1), 0);
  if v_n = 0 then return jsonb_build_object('income', '{}'::jsonb, 'cells', '{}'::jsonb); end if;
  foreach k in array v_keys loop
    cell := p_grid -> k; p := pc -> (cell ->> 't');
    if p is null or (p ->> 'kind') = 'dock' then continue; end if;
    n := private.rfac_next(k, coalesce((cell ->> 'd')::int, 1));
    if p_grid ? n then feeds := jsonb_set(feeds, array[n], coalesce(feeds -> n, '[]'::jsonb) || to_jsonb(k)); end if;
  end loop;
  for it in 1 .. v_n + 2 loop
    nouts := '{}'::jsonb; nins := '{}'::jsonb;
    foreach k in array v_keys loop
      cell := p_grid -> k; p := pc -> (cell ->> 't');
      if p is null then continue; end if;
      v_in := '{}'::jsonb;
      for n in select jsonb_array_elements_text(coalesce(feeds -> k, '[]'::jsonb)) loop v_in := private.rfac_add(v_in, outs -> n); end loop;
      nins := nins || jsonb_build_object(k, v_in);
      if (p ->> 'kind') = 'source' then v_out := jsonb_build_object(p ->> 'out', (p ->> 'rate')::numeric);
      elsif (p ->> 'kind') = 'belt' then
        select coalesce(sum(value::numeric), 0) into v_tot from jsonb_each_text(v_in);
        v_out := case when v_tot > v_cap then private.rfac_add('{}'::jsonb, v_in, v_cap / v_tot) else v_in end;
      elsif (p ->> 'kind') = 'machine' then
        v_rate := (p ->> 'rate')::numeric;
        for need in select key, value::numeric v from jsonb_each_text(p -> 'in') loop v_rate := least(v_rate, coalesce((v_in ->> need.key)::numeric, 0) / need.v); end loop;
        v_out := case when v_rate > 0.000001 then jsonb_build_object(p ->> 'out', v_rate) else '{}'::jsonb end;
      else v_out := '{}'::jsonb;
      end if;
      nouts := nouts || jsonb_build_object(k, v_out);
    end loop;
    ins := nins;
    -- settled: every further pass would give exactly this again
    exit when nouts = outs;
    outs := nouts;
  end loop;
  foreach k in array v_keys loop
    cell := p_grid -> k; p := pc -> (cell ->> 't');
    if p is null then continue; end if;
    if (p ->> 'kind') = 'dock' then v_income := private.rfac_add(v_income, ins -> k); end if;
    v_status := v_status || jsonb_build_object(k, case
      when (p ->> 'kind') = 'machine' and (outs -> k) = '{}'::jsonb then 'starved'
      when (p ->> 'kind') in ('source', 'machine', 'belt') and (outs -> k) <> '{}'::jsonb and not (p_grid ? private.rfac_next(k, coalesce((cell ->> 'd')::int, 1))) then 'spilling'
      else 'ok' end);
  end loop;
  return jsonb_build_object('income', (select coalesce(jsonb_object_agg(key, round(value::numeric, 4)), '{}'::jsonb) from jsonb_each_text(v_income)),
    'cells', (select coalesce(jsonb_object_agg(key, jsonb_build_object('out', outs -> key, 'status', v_status ->> key)), '{}'::jsonb) from jsonb_each(p_grid)));
end $$;
