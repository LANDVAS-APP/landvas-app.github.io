-- v0.37 Bases. Build on your planet plots: domes, habitat pods, solar panels, greenhouses, antennas,
-- landing pads, lamps, fences, crates, drill rigs, beacons, gardens and statues — placed anywhere on
-- the plot, turned and coloured as you like. Modules are paid for with the materials you dig (and a
-- little Ink); taking one down gives half its materials back. Everyone on the world sees your base.

insert into public.game_config (key, value, description) values ('bases', '{
  "enabled": true,
  "max_modules": 40,
  "refund": 0.5,
  "palette": ["#F2F5FB", "#C9CCD6", "#59647D", "#FF5C8A", "#FFB13D", "#FFE36B", "#4FD18B", "#4FA8FF", "#8B5CFF", "#B69CFF", "#7FE3FF", "#E06A3E"],
  "modules": {
    "dome":       {"name": "Dome",          "emoji": "🫧", "w": 4, "d": 4, "cost": {"ink": 30, "stone": 20, "iron": 5}},
    "hab":        {"name": "Habitat pod",   "emoji": "🏠", "w": 3, "d": 5, "cost": {"ink": 25, "stone": 15, "iron": 10}},
    "solar":      {"name": "Solar panel",   "emoji": "🔆", "w": 2, "d": 3, "cost": {"copper": 6, "crystal": 2}},
    "greenhouse": {"name": "Greenhouse",    "emoji": "🌱", "w": 3, "d": 3, "cost": {"ink": 15, "ice": 10, "crystal": 4}},
    "antenna":    {"name": "Antenna",       "emoji": "📡", "w": 1, "d": 1, "cost": {"iron": 4, "copper": 2}},
    "pad":        {"name": "Landing pad",   "emoji": "🛬", "w": 6, "d": 6, "cost": {"ink": 20, "stone": 30}},
    "lamp":       {"name": "Lamp",          "emoji": "💡", "w": 1, "d": 1, "cost": {"iron": 1, "crystal": 1}},
    "fence":      {"name": "Fence",         "emoji": "🚧", "w": 2, "d": 1, "cost": {"stone": 2}},
    "crate":      {"name": "Crate",         "emoji": "📦", "w": 1, "d": 1, "cost": {"stone": 3}},
    "rig":        {"name": "Drill rig",     "emoji": "🏗️", "w": 3, "d": 3, "cost": {"ink": 40, "iron": 20, "titanium": 5}},
    "beacon":     {"name": "Beacon",        "emoji": "🗼", "w": 1, "d": 1, "cost": {"crystal": 3, "plasma": 1}},
    "garden":     {"name": "Moss garden",   "emoji": "🪴", "w": 2, "d": 2, "cost": {"dust": 10, "ice": 4}},
    "statue":     {"name": "Statue",        "emoji": "🗿", "w": 1, "d": 1, "cost": {"gem": 3, "stone": 10}},
    "flag":       {"name": "Flag",          "emoji": "🚩", "w": 1, "d": 1, "cost": {"ink": 5}}
  }
}', 'Planet bases: the modules you can build on a planet plot (footprint in metres, cost in Ink and dug materials), colours, the most modules a plot holds and how much a removed module gives back.')
on conflict (key) do nothing;

create table if not exists public.planet_bases (
  world text not null, gx int not null, gy int not null,
  owner_id uuid not null references public.players (id) on delete cascade,
  layout jsonb not null default '[]'::jsonb,   -- [{"id": "a1", "k": "dome", "x": 2.5, "y": 3, "r": 0..3, "c": "#hex"}] in metres on the 8 x 8 plot
  rev int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (world, gx, gy)
);
alter table public.planet_bases enable row level security;
revoke all on public.planet_bases from anon, authenticated;

create or replace function private.base_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('bases'), '{}'::jsonb) $$;

-- every plot now carries its base, so whoever sees the plot sees what's built on it
create or replace function private.planet_plot_json(p public.planet_plots, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'name', p.name, 'mine', p.owner_id = p_viewer, 'rarity', p.rarity,
    'owner', (select jsonb_build_object('username', pr.username, 'accent', pr.accent_color) from public.profiles pr where pr.id = p.owner_id),
    'base', (select jsonb_build_object('layout', b.layout, 'rev', b.rev) from public.planet_bases b where b.world = p.world and b.gx = p.gx and b.gy = p.gy))
$$;

/** Save a plot's base. New modules are paid for; removed ones give back part of their materials. */
create or replace function public.planet_base_save(p_world text, p_gx int, p_gy int, p_layout jsonb, p_rev int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.base_cfg(); b public.planet_bases%rowtype; v_plot numeric := coalesce((private.planet_cfg() ->> 'plot_m')::numeric, 8);
  m jsonb; mod jsonb; v_w numeric; v_d numeric; v_ids text[] := '{}'; v_old_ids text[]; v_cost jsonb := '{}'::jsonb; v_back jsonb := '{}'::jsonb; k record; v_have bigint;
  v_refund numeric := coalesce((c ->> 'refund')::numeric, 0.5); v_layout jsonb := '[]'::jsonb;
begin
  perform private.rate_limit('planet_base', 300, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > coalesce((c ->> 'max_modules')::int, 40) then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
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
    if (m ->> 'x')::numeric - v_w / 2 < -0.01 or (m ->> 'x')::numeric + v_w / 2 > v_plot + 0.01
       or (m ->> 'y')::numeric - v_d / 2 < -0.01 or (m ->> 'y')::numeric + v_d / 2 > v_plot + 0.01
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
  update public.planet_bases set layout = v_layout, rev = rev + 1, updated_at = now() where world = p_world and gx = p_gx and gy = p_gy returning * into b;
  if jsonb_array_length(v_layout) >= 3 and not exists (select 1 from public.feed_events where kind = 'base' and player_id = v_uid and created_at > now() - interval '1 hour') then
    insert into public.feed_events (kind, player_id, data) values ('base', v_uid, jsonb_build_object('world', p_world, 'modules', jsonb_array_length(v_layout)));
  end if;
  return jsonb_build_object('layout', b.layout, 'rev', b.rev, 'spent', v_cost, 'refunded', v_back, 'items', private.items_json(v_uid), 'balances', private.balances(v_uid));
end $$;

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base'));

/** The base catalogue and your materials (for the builder). */
create or replace function public.planet_base_catalog() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return jsonb_build_object('config', private.base_cfg(), 'items', private.items_json(v_uid), 'item_info', private.mine_cfg() -> 'items',
    'plot_m', coalesce((private.planet_cfg() ->> 'plot_m')::numeric, 8));
end $$;

do $$
declare f text;
begin
  execute 'revoke all on function private.base_cfg() from public';
  foreach f in array array['public.planet_base_save(text, int, int, jsonb, int)', 'public.planet_base_catalog()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
