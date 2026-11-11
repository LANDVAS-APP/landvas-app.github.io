-- v1.0: Simple mode and Base plots.
--
-- Base plots: just land. They earn USD rent like any plot, and have no extras (no canvas, habitat, farm…).
-- Every new plot starts as one; giving it a type is free whenever its owner wants.
--
-- Simple mode: buy a plot straight from the home screen, no map needed. The server picks a free plot for you
-- (near your explorer if you have one, else next to your own land, else in one of the world's big cities) and its
-- rarity is wherever it lands: a roll.

insert into public.plot_kinds (id, name, description, sort) values
  ('base', 'Base plot', 'Just land: it earns rent. Give it a type any time to unlock its extras.', -1)
on conflict (id) do update set name = excluded.name, description = excluded.description, enabled = true;

alter table public.canvas_groups alter column kind set default 'base';

insert into public.game_config (key, value, description) values ('quick_buy', '{
  "enabled": true, "radius": 24, "tries": 80,
  "cities": [[1234919,1576977],[719513,1674758],[2095665,1394716],[2124557,1442959],[3724678,1651506],[3858868,2516969],
             [1553834,2379604],[1172270,1530732],[2253331,1375543],[942166,1866276],[2946238,1870676],[793527,1576239]]
}', 'Simple mode quick buy: where a plot bought from the home screen lands (radius in plots around the anchor, random tries per ring) and the city cells used when a player has no explorer or land yet.')
on conflict (key) do nothing;

-- giving a Base plot a type is always free (it has no extras to lose). Patched in place, keeping every earlier patch.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.set_group_kind(uuid,text)'::regprocedure);
  n := replace(d, '  if private.kind_family(g.kind) <> private.kind_family(p_kind)' || chr(10),
                  '  if g.kind <> ''base'' and private.kind_family(g.kind) <> private.kind_family(p_kind)' || chr(10));
  if n = d then raise exception 'simple mode: set_group_kind anchor not found'; end if;
  execute n;
end $$;

-- A free plot for a quick buy: random cells around an anchor, the search widening until one is free.
create or replace function private.quick_buy_cell(p_uid uuid) returns int[]
language plpgsql volatile as $$
declare v_cfg jsonb := coalesce(private.cfg('quick_buy'), '{}'::jsonb); v_r int := greatest(coalesce((v_cfg ->> 'radius')::int, 24), 4);
  v_tries int := greatest(coalesce((v_cfg ->> 'tries')::int, 80), 10); v_ax int; v_ay int; v_x int; v_y int; v_ring int; v_i int; v_ex record; v_c jsonb;
begin
  select * into v_ex from private.explorer_now(p_uid);
  if found and v_ex.gx is not null then v_ax := v_ex.gx; v_ay := v_ex.gy;
  else
    select gx, gy into v_ax, v_ay from public.world_plots where owner_id = p_uid order by claimed_at desc limit 1;
    if v_ax is null then
      v_c := (v_cfg -> 'cities') -> floor(random() * greatest(jsonb_array_length(coalesce(v_cfg -> 'cities', '[]'::jsonb)), 1))::int;
      v_ax := coalesce((v_c ->> 0)::int, 793527); v_ay := coalesce((v_c ->> 1)::int, 1576239);
    end if;
  end if;
  v_ring := v_r;
  for v_pass in 1..6 loop
    for v_i in 1..v_tries loop
      v_x := (v_ax + floor((random() * 2 - 1) * v_ring)::int + 4194304) % 4194304;
      v_y := least(greatest(v_ay + floor((random() * 2 - 1) * v_ring)::int, 0), 4194303);
      if not exists (select 1 from public.world_plots where gx = v_x and gy = v_y and (owner_id is not null or locked)) then
        return array[v_x, v_y];
      end if;
    end loop;
    v_ring := v_ring * 4;
  end loop;
  raise exception 'no_free_plot' using errcode = 'P0001';
end $$;

-- Buy a plot from the home screen: the first one is the free starter plot, then the usual Ink price.
create or replace function public.quick_buy_plot(p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_cell int[]; v_starter boolean; v_cost jsonb; v_res jsonb;
  v_bonus jsonb := coalesce(private.cfg('economy') -> 'starter_bonus', '{}'::jsonb);
begin
  if not coalesce((private.cfg('quick_buy') ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'quick_buy_plot');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('acquire', 120, 3600);
  select not starter_plot_claimed into v_starter from public.players where id = v_uid for update;
  if (select count(*) from public.world_plots where owner_id = v_uid) >= coalesce((private.cfg('limits') ->> 'max_plots_per_player')::int, 2500) then
    raise exception 'plot_limit_reached' using errcode = 'P0001';
  end if;
  v_cell := private.quick_buy_cell(v_uid);
  perform private.rent_settle(v_uid);
  if v_starter then
    v_res := private.take_plot(v_uid, v_cell[1], v_cell[2], 'starter', '{}'::jsonb);
    update public.players set starter_plot_claimed = true where id = v_uid;
    perform private.grant(v_uid, v_bonus, 'starter_bonus', 'plot', private.cell_key(v_cell[1], v_cell[2]), 'starter_bonus');
    perform private.referral_qualify(v_uid, 'starter_plot');
    v_cost := jsonb_build_object('ink', 0);
  else
    v_cost := private.acquire_cost(v_uid, v_cell[1], v_cell[2]);
    perform private.ledger_apply(v_uid, 'ink', -(v_cost ->> 'ink')::bigint, 'acquire_plot', 'plot', private.cell_key(v_cell[1], v_cell[2]), p_idempotency_key);
    v_res := private.take_plot(v_uid, v_cell[1], v_cell[2], 'acquire', jsonb_build_object('ink', v_cost -> 'ink'));
    perform private.grant(v_uid, jsonb_build_object('brush_points', 5), 'acquire_plot', 'plot', private.cell_key(v_cell[1], v_cell[2]), p_idempotency_key);
  end if;
  v_res := v_res || jsonb_build_object('starter', v_starter, 'cost', v_cost, 'name', null, 'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid),
                                       'achievements', private.evaluate_achievements(v_uid), 'next_cost', private.acquire_cost(v_uid, v_cell[1], v_cell[2]));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- What the next quick buy costs (free while the starter plot or free plots are left).
create or replace function public.quick_buy_quote() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_starter boolean;
begin
  select not starter_plot_claimed into v_starter from public.players where id = v_uid;
  return private.acquire_cost(v_uid, 0, 0) || jsonb_build_object('starter', coalesce(v_starter, false),
    'enabled', coalesce((private.cfg('quick_buy') ->> 'enabled')::boolean, true));
end $$;

revoke all on function public.quick_buy_plot(text) from public, anon;
revoke all on function public.quick_buy_quote() from public, anon;
grant execute on function public.quick_buy_plot(text) to authenticated;
grant execute on function public.quick_buy_quote() to authenticated;
revoke all on function private.quick_buy_cell(uuid) from public, anon, authenticated;
