-- v0.43 Bigger bases and base visits. Own the plots next to each other and merge them into one base
-- (up to 4 x 4 plots, 32 x 32 m): the base is anchored at its south-west plot and the module limit grows
-- with it. Anyone who comes across a base can look round it (the owner hears about it).

update public.game_config set value = value || '{"max_merge": 4, "max_modules_total": 300}'::jsonb
 where key = 'bases' and not value ? 'max_merge';

alter table public.planet_bases add column if not exists w int not null default 1;
alter table public.planet_bases add column if not exists h int not null default 1;
alter table public.planet_bases drop constraint if exists planet_bases_size_check;
alter table public.planet_bases add constraint planet_bases_size_check check (w between 1 and 8 and h between 1 and 8);

create or replace function private.planet_plot_json(p public.planet_plots, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'name', p.name, 'mine', p.owner_id = p_viewer, 'rarity', p.rarity,
    'owner', (select jsonb_build_object('username', pr.username, 'accent', pr.accent_color) from public.profiles pr where pr.id = p.owner_id),
    'base', (select jsonb_build_object('layout', b.layout, 'rev', b.rev, 'w', b.w, 'h', b.h) from public.planet_bases b where b.world = p.world and b.gx = p.gx and b.gy = p.gy),
    -- part of a bigger base anchored on another plot
    'in_base', (select jsonb_build_array(b.gx, b.gy) from public.planet_bases b
                 where b.world = p.world and (b.w > 1 or b.h > 1) and not (b.gx = p.gx and b.gy = p.gy) and jsonb_array_length(b.layout) > 0
                   and p.gy between b.gy and b.gy + b.h - 1
                   and ((p.gx - b.gx) % private.planet_cols(p.world) + private.planet_cols(p.world)) % private.planet_cols(p.world) < b.w limit 1),
    'shaft', (select jsonb_build_object('depth', round(s.depth, 1), 'cored', s.cored_at is not null) from public.planet_plot_shafts s
               where s.world = p.world and s.gx = p.gx and s.gy = p.gy and s.depth > 0))
$$;

/** A base, for a visitor (or its owner): who built it, how big, what's in it. Lets the owner know you looked round. */
create or replace function public.planet_base_view(p_world text, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.planet_bases%rowtype;
begin
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy;
  if not found or not private.visible_to(b.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.owner_id <> v_uid and jsonb_array_length(b.layout) > 0 then
    perform private.rate_limit('visit_ping', 240, 3600);
    perform private.notify(b.owner_id, 'base_visit', v_uid, jsonb_build_object('world', p_world, 'gx', p_gx, 'gy', p_gy));
  end if;
  return jsonb_build_object('world', p_world, 'gx', b.gx, 'gy', b.gy, 'w', b.w, 'h', b.h, 'layout', b.layout, 'rev', b.rev, 'mine', b.owner_id = v_uid,
    'owner', private.profile_json(b.owner_id), 'name', (select name from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy),
    'modules', jsonb_array_length(b.layout), 'plot_m', coalesce((private.planet_cfg() ->> 'plot_m')::numeric, 8),
    'catalog', jsonb_build_object('modules', private.base_cfg() -> 'modules'));
end $$;

/** Save a base: on one plot, or (p_w x p_h) plots of yours merged into one, anchored at (p_gx, p_gy) in the south-west.
    New modules are paid for; removed ones give back part of their materials. */
drop function if exists public.planet_base_save(text, int, int, jsonb, int);
create or replace function public.planet_base_save(p_world text, p_gx int, p_gy int, p_layout jsonb, p_rev int, p_w int default 1, p_h int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.base_cfg(); b public.planet_bases%rowtype; v_plot numeric := coalesce((private.planet_cfg() ->> 'plot_m')::numeric, 8);
  m jsonb; mod jsonb; v_w numeric; v_d numeric; v_ids text[] := '{}'; v_old_ids text[]; v_cost jsonb := '{}'::jsonb; v_back jsonb := '{}'::jsonb; k record; v_have bigint;
  v_refund numeric := coalesce((c ->> 'refund')::numeric, 0.5); v_layout jsonb := '[]'::jsonb;
  v_w_n int := greatest(1, coalesce(p_w, 1)); v_h_n int := greatest(1, coalesce(p_h, 1)); v_cols int := private.planet_cols(p_world); v_max int; v_cells int; o public.planet_bases%rowtype;
begin
  perform private.rate_limit('planet_base', 300, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if v_w_n > coalesce((c ->> 'max_merge')::int, 4) or v_h_n > coalesce((c ->> 'max_merge')::int, 4) then raise exception 'base_too_big' using errcode = 'P0001'; end if;
  -- every plot under the base is yours
  select count(*) into v_cells from public.planet_plots
   where world = p_world and owner_id = v_uid and gy between p_gy and p_gy + v_h_n - 1
     and ((gx - p_gx) % v_cols + v_cols) % v_cols < v_w_n;
  if v_cells < v_w_n * v_h_n then raise exception 'not_owner' using errcode = 'P0001'; end if;
  -- and no other base already sits on any of them (empty ones just go)
  for o in select * from public.planet_bases pb where pb.world = p_world and not (pb.gx = p_gx and pb.gy = p_gy)
             and pb.gy <= p_gy + v_h_n - 1 and pb.gy + pb.h - 1 >= p_gy
             and (((pb.gx - p_gx) % v_cols + v_cols) % v_cols < v_w_n or ((p_gx - pb.gx) % v_cols + v_cols) % v_cols < pb.w) loop
    if jsonb_array_length(o.layout) > 0 then raise exception 'plot_has_base' using errcode = 'P0001', detail = o.gx || ',' || o.gy; end if;
    delete from public.planet_bases where world = o.world and gx = o.gx and gy = o.gy;
  end loop;
  v_max := least(coalesce((c ->> 'max_modules_total')::int, 300), coalesce((c ->> 'max_modules')::int, 40) * v_w_n * v_h_n);
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > v_max then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
  insert into public.planet_bases (world, gx, gy, owner_id) values (p_world, p_gx, p_gy, v_uid) on conflict do nothing;
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy for update;
  if b.rev <> coalesce(p_rev, -1) then raise exception 'layout_conflict' using errcode = 'P0001'; end if;
  -- check every module, and keep only the fields we know
  for m in select * from jsonb_array_elements(p_layout) loop
    mod := c -> 'modules' -> (m ->> 'k');
    if mod is null or coalesce(m ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,24}$' or (m ->> 'id') = any(v_ids) then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    v_ids := v_ids || (m ->> 'id');
    -- footprint (turned a quarter makes it w x d the other way) must sit on the plot
    v_w := case when coalesce((m ->> 'r')::int, 0) % 2 = 1 then (mod ->> 'd')::numeric else (mod ->> 'w')::numeric end;
    v_d := case when coalesce((m ->> 'r')::int, 0) % 2 = 1 then (mod ->> 'w')::numeric else (mod ->> 'd')::numeric end;
    if (m ->> 'x')::numeric - v_w / 2 < -0.01 or (m ->> 'x')::numeric + v_w / 2 > v_plot * v_w_n + 0.01
       or (m ->> 'y')::numeric - v_d / 2 < -0.01 or (m ->> 'y')::numeric + v_d / 2 > v_plot * v_h_n + 0.01
       or coalesce((m ->> 'r')::int, 0) not between 0 and 3
       or not ((c -> 'palette') ? coalesce(m ->> 'c', '#F2F5FB')) then
      raise exception 'invalid_layout' using errcode = 'P0001';
    end if;
    v_layout := v_layout || jsonb_build_array(jsonb_build_object('id', m ->> 'id', 'k', m ->> 'k', 'x', round((m ->> 'x')::numeric, 2), 'y', round((m ->> 'y')::numeric, 2),
      'r', coalesce((m ->> 'r')::int, 0), 'c', coalesce(m ->> 'c', '#F2F5FB')));
  end loop;
  select coalesce(array_agg(x ->> 'id'), '{}') into v_old_ids from jsonb_array_elements(b.layout) x;
  -- what's new costs; what's gone gives back part of its materials
  for m in select * from jsonb_array_elements(v_layout) where not ((value ->> 'id') = any(v_old_ids)) loop
    for k in select key, value::bigint n from jsonb_each_text(c -> 'modules' -> (m ->> 'k') -> 'cost') loop
      v_cost := v_cost || jsonb_build_object(k.key, coalesce((v_cost ->> k.key)::bigint, 0) + k.n);
    end loop;
  end loop;
  for m in select * from jsonb_array_elements(b.layout) where not ((value ->> 'id') = any(v_ids)) loop
    for k in select key, value::bigint n from jsonb_each_text(c -> 'modules' -> (m ->> 'k') -> 'cost') where key <> 'ink' loop
      v_back := v_back || jsonb_build_object(k.key, coalesce((v_back ->> k.key)::bigint, 0) + floor(k.n * v_refund)::bigint);
    end loop;
  end loop;
  for k in select key, value::bigint n from jsonb_each_text(v_cost) where key <> 'ink' loop
    select qty into v_have from public.planet_items where player_id = v_uid and item = k.key for update;
    if coalesce(v_have, 0) + coalesce((v_back ->> k.key)::bigint, 0) < k.n then raise exception 'not_enough_materials' using errcode = 'P0001', detail = k.key; end if;
  end loop;
  if coalesce((v_cost ->> 'ink')::int, 0) > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', (v_cost ->> 'ink')::int), 'planet_base', 'planet', p_world || ':' || p_gx || ':' || p_gy, 'planet-base:' || p_world || ':' || p_gx || ':' || p_gy || ':' || b.rev);
  end if;
  for k in select key, value::bigint n from jsonb_each_text(v_back) loop
    insert into public.planet_items (player_id, item, qty) values (v_uid, k.key, k.n) on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
  end loop;
  for k in select key, value::bigint n from jsonb_each_text(v_cost) where key <> 'ink' loop
    update public.planet_items set qty = qty - k.n where player_id = v_uid and item = k.key;
  end loop;
  update public.planet_bases set layout = v_layout, rev = rev + 1, w = v_w_n, h = v_h_n, updated_at = now() where world = p_world and gx = p_gx and gy = p_gy returning * into b;
  if jsonb_array_length(v_layout) >= 3 and not exists (select 1 from public.feed_events where kind = 'base' and player_id = v_uid and created_at > now() - interval '1 hour') then
    insert into public.feed_events (kind, player_id, data) values ('base', v_uid, jsonb_build_object('world', p_world, 'modules', jsonb_array_length(v_layout), 'plots', v_w_n * v_h_n));
  end if;
  return jsonb_build_object('layout', b.layout, 'rev', b.rev, 'w', b.w, 'h', b.h, 'spent', v_cost, 'refunded', v_back, 'items', private.items_json(v_uid), 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.planet_base_save(text, int, int, jsonb, int, int, int)', 'public.planet_base_view(text, int, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
