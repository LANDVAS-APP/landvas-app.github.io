-- v0.35 Digging. On every world you can sink your own shaft down through its layers — regolith,
-- bedrock, ore veins, deep rock, and finally the crust — turning up materials as you go (stone,
-- ice, iron, copper, crystal, titanium, gems, plasma and core shards). Each layer is harder than the
-- last; better tools dig faster: shovel -> pickaxe -> drill -> plasma drill -> core bore, crafted
-- from what you dig (plus Ink). Digging uses energy that refills over time, the server counts every
-- tap (no faster than a person can tap), and reaching a layer for the first time pays Ink.
-- Materials are yours across all worlds — later they build bases and fuel rovers.

insert into public.game_config (key, value, description) values ('mining', '{
  "enabled": true,
  "taps_per_second": 6,
  "energy": {"max": 240, "per_tap": 1, "regen_per_minute": 2},
  "find_chance": 0.32,
  "layers": [
    {"id": "regolith", "name": "Regolith",   "to": 12,   "hardness": 1,  "color": "#B9B2A6", "finds": {"dust": 55, "stone": 38, "ice": 7},                                  "first_ink": 10},
    {"id": "bedrock",  "name": "Bedrock",    "to": 60,   "hardness": 3,  "color": "#7D7569", "finds": {"stone": 52, "ice": 18, "iron": 22, "crystal": 8},                  "first_ink": 25},
    {"id": "ore",      "name": "Ore veins",  "to": 240,  "hardness": 7,  "color": "#8A5A44", "finds": {"iron": 34, "copper": 26, "stone": 18, "crystal": 16, "ice": 6},    "first_ink": 60},
    {"id": "deep",     "name": "Deep rock",  "to": 1000, "hardness": 15, "color": "#4E3B4F", "finds": {"crystal": 32, "titanium": 28, "iron": 18, "gem": 14, "copper": 8}, "first_ink": 150},
    {"id": "crust",    "name": "The crust",  "to": 5000, "hardness": 32, "color": "#7A2E2E", "finds": {"titanium": 28, "gem": 24, "plasma": 26, "core": 22},              "first_ink": 400}
  ],
  "tools": [
    {"id": "shovel", "name": "Shovel",       "power": 1,  "cost": {}},
    {"id": "pick",   "name": "Pickaxe",      "power": 3,  "cost": {"ink": 40,  "stone": 30}},
    {"id": "drill",  "name": "Drill",        "power": 8,  "cost": {"ink": 120, "stone": 80, "iron": 40}},
    {"id": "plasma", "name": "Plasma drill", "power": 20, "cost": {"ink": 300, "iron": 80, "copper": 40, "crystal": 40}},
    {"id": "core",   "name": "Core bore",    "power": 50, "cost": {"ink": 800, "titanium": 60, "gem": 30, "plasma": 20}}
  ],
  "items": {
    "dust": {"name": "Moondust", "emoji": "🌫️"}, "stone": {"name": "Stone", "emoji": "🪨"}, "ice": {"name": "Ice", "emoji": "🧊"},
    "iron": {"name": "Iron", "emoji": "⚙️"}, "copper": {"name": "Copper", "emoji": "🟠"}, "crystal": {"name": "Crystal", "emoji": "💎"},
    "titanium": {"name": "Titanium", "emoji": "🔩"}, "gem": {"name": "Star gem", "emoji": "💠"}, "plasma": {"name": "Plasma", "emoji": "🔥"}, "core": {"name": "Core shard", "emoji": "🌋"}
  }
}', 'Digging on the planets: layers (depth in metres, hardness, what you find), tools (dig power, crafting cost), energy and the find chance per tap.')
on conflict (key) do nothing;

create table if not exists public.planet_items (
  player_id uuid not null references public.players (id) on delete cascade,
  item text not null, qty bigint not null default 0 check (qty >= 0),
  primary key (player_id, item)
);
alter table public.planet_items enable row level security;
revoke all on public.planet_items from anon, authenticated;

create table if not exists public.planet_miners (
  player_id uuid primary key references public.players (id) on delete cascade,
  tools text[] not null default '{shovel}',
  energy numeric not null default 240,
  energy_at timestamptz not null default now(),
  last_dig_at timestamptz,
  taps bigint not null default 0
);
alter table public.planet_miners enable row level security;
revoke all on public.planet_miners from anon, authenticated;

create table if not exists public.planet_shafts (
  player_id uuid not null references public.players (id) on delete cascade,
  world text not null,
  depth numeric not null default 0,
  d float8[],                       -- where on the globe the shaft is
  layers_reached int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, world)
);
alter table public.planet_shafts enable row level security;
revoke all on public.planet_shafts from anon, authenticated;

create or replace function private.mine_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('mining'), '{}'::jsonb) $$;

/** Your miner row with energy brought up to date. */
create or replace function private.miner(p_uid uuid) returns public.planet_miners language plpgsql as $$
declare m public.planet_miners%rowtype; e jsonb := private.mine_cfg() -> 'energy';
begin
  insert into public.planet_miners (player_id) values (p_uid) on conflict do nothing;
  select * into m from public.planet_miners where player_id = p_uid for update;
  m.energy := least(coalesce((e ->> 'max')::numeric, 240), m.energy + extract(epoch from now() - m.energy_at) / 60 * coalesce((e ->> 'regen_per_minute')::numeric, 2));
  m.energy_at := now();
  update public.planet_miners set energy = m.energy, energy_at = m.energy_at where player_id = p_uid;
  return m;
end $$;

create or replace function private.items_json(p_uid uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(item, qty), '{}'::jsonb) from public.planet_items where player_id = p_uid and qty > 0
$$;

create or replace function private.best_power(m public.planet_miners) returns int language sql stable as $$
  select coalesce(max((t ->> 'power')::int), 1) from jsonb_array_elements(private.mine_cfg() -> 'tools') t where t ->> 'id' = any(m.tools)
$$;

create or replace function private.dig_json(p_uid uuid, p_world text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'world', p_world, 'depth', coalesce(s.depth, 0), 'shaft', to_jsonb(s.d), 'layers_reached', coalesce(s.layers_reached, 0),
    'tools', to_jsonb(m.tools), 'power', private.best_power(m),
    'energy', floor(m.energy), 'energy_max', coalesce((private.mine_cfg() -> 'energy' ->> 'max')::int, 240),
    'regen_per_minute', coalesce((private.mine_cfg() -> 'energy' ->> 'regen_per_minute')::numeric, 2),
    'items', private.items_json(p_uid), 'config', private.mine_cfg())
  from public.planet_miners m left join public.planet_shafts s on s.player_id = m.player_id and s.world = p_world
  where m.player_id = p_uid
$$;

create or replace function public.planet_dig_state(p_world text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.miner(v_uid);
  return private.dig_json(v_uid, p_world);
end $$;

/** Dig: a batch of taps (sent about once a second). Returns what turned up. */
create or replace function public.planet_dig(p_world text, p_taps int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mine_cfg(); m public.planet_miners%rowtype; s public.space_pilots%rowtype;
  sh public.planet_shafts%rowtype; v_taps int; v_allowed numeric; v_power int; v_depth numeric; v_layers jsonb := c -> 'layers'; v_n int;
  v_layer jsonb; v_li int; v_left numeric; v_finds jsonb := '{}'::jsonb; v_new int := 0; v_ink int := 0; i int; f record; v_roll numeric; v_tot numeric; v_acc numeric; v_item text;
  v_first jsonb := '[]'::jsonb;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  m := private.miner(v_uid);
  -- no faster than a person can tap (a little slack for the first batch)
  v_allowed := case when m.last_dig_at is null then 12 else extract(epoch from now() - m.last_dig_at) * coalesce((c ->> 'taps_per_second')::numeric, 6) + 3 end;
  v_taps := least(greatest(coalesce(p_taps, 0), 0), 30, floor(v_allowed)::int, floor(m.energy / coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1))::int);
  if v_taps <= 0 then
    if m.energy < 1 then raise exception 'no_energy' using errcode = 'P0001'; end if;
    return private.dig_json(v_uid, p_world) || jsonb_build_object('dug', 0, 'finds', '{}'::jsonb);
  end if;
  insert into public.planet_shafts (player_id, world, d) values (v_uid, p_world, private.unit3(p_d)) on conflict do nothing;
  select * into sh from public.planet_shafts where player_id = v_uid and world = p_world for update;
  v_power := private.best_power(m);
  v_n := jsonb_array_length(v_layers);
  v_depth := sh.depth;
  for i in 1 .. v_taps loop
    -- which layer you're in (the deepest keeps going)
    v_li := 0;
    while v_li < v_n - 1 and v_depth >= (v_layers -> v_li ->> 'to')::numeric loop v_li := v_li + 1; end loop;
    v_layer := v_layers -> v_li;
    v_depth := least((v_layers -> (v_n - 1) ->> 'to')::numeric, v_depth + v_power::numeric / (v_layer ->> 'hardness')::numeric);
    if random() < coalesce((c ->> 'find_chance')::numeric, 0.32) then
      select sum(value::numeric) into v_tot from jsonb_each_text(v_layer -> 'finds');
      v_roll := random() * v_tot; v_acc := 0; v_item := null;
      for f in select key, value::numeric w from jsonb_each_text(v_layer -> 'finds') loop
        v_acc := v_acc + f.w; if v_roll < v_acc then v_item := f.key; exit; end if;
      end loop;
      if v_item is not null then v_finds := v_finds || jsonb_build_object(v_item, coalesce((v_finds ->> v_item)::int, 0) + 1); end if;
    end if;
  end loop;
  -- layers reached for the first time pay Ink
  for v_li in 0 .. v_n - 1 loop
    if v_depth > (case when v_li = 0 then 0 else (v_layers -> (v_li - 1) ->> 'to')::numeric end) and v_li + 1 > sh.layers_reached then
      v_new := v_li + 1; v_ink := v_ink + coalesce((v_layers -> v_li ->> 'first_ink')::int, 0);
      v_first := v_first || jsonb_build_array(v_layers -> v_li ->> 'id');
    end if;
  end loop;
  update public.planet_shafts set depth = v_depth, layers_reached = greatest(layers_reached, v_new), updated_at = now(),
         d = coalesce(d, private.unit3(p_d)) where player_id = v_uid and world = p_world;
  update public.planet_miners set energy = m.energy - v_taps * coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1), last_dig_at = now(), taps = taps + v_taps
   where player_id = v_uid;
  for f in select key, value::int n from jsonb_each_text(v_finds) loop
    insert into public.planet_items (player_id, item, qty) values (v_uid, f.key, f.n)
    on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
  end loop;
  if v_ink > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_ink), 'space', 'dig_layer', p_world || ':' || v_new, 'dig-layer:' || v_uid || ':' || p_world || ':' || v_new); end if;
  return private.dig_json(v_uid, p_world) || jsonb_build_object('dug', v_taps, 'finds', v_finds, 'new_layers', v_first, 'layer_ink', v_ink, 'balances', private.balances(v_uid));
end $$;

/** Craft (or buy) a tool: its Ink and material costs. */
create or replace function public.planet_craft_tool(p_tool text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); t jsonb; m public.planet_miners%rowtype; k record; v_have bigint;
begin
  select x into t from jsonb_array_elements(private.mine_cfg() -> 'tools') x where x ->> 'id' = p_tool;
  if t is null then raise exception 'invalid_tool' using errcode = 'P0001'; end if;
  m := private.miner(v_uid);
  if p_tool = any(m.tools) then return private.dig_json(v_uid, null); end if;
  for k in select key, value::bigint n from jsonb_each_text(t -> 'cost') where key <> 'ink' loop
    select qty into v_have from public.planet_items where player_id = v_uid and item = k.key for update;
    if coalesce(v_have, 0) < k.n then raise exception 'not_enough_materials' using errcode = 'P0001', detail = k.key; end if;
  end loop;
  if coalesce((t -> 'cost' ->> 'ink')::int, 0) > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', (t -> 'cost' ->> 'ink')::int), 'planet_tool', 'planet', p_tool, 'planet-tool:' || v_uid || ':' || p_tool);
  end if;
  for k in select key, value::bigint n from jsonb_each_text(t -> 'cost') where key <> 'ink' loop
    update public.planet_items set qty = qty - k.n where player_id = v_uid and item = k.key;
  end loop;
  update public.planet_miners set tools = array_append(tools, p_tool) where player_id = v_uid;
  return private.dig_json(v_uid, null) || jsonb_build_object('crafted', p_tool, 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.mine_cfg()', 'private.miner(uuid)', 'private.items_json(uuid)', 'private.best_power(public.planet_miners)', 'private.dig_json(uuid, text)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.planet_dig_state(text)', 'public.planet_dig(text, int, jsonb)', 'public.planet_craft_tool(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
