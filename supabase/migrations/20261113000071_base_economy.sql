-- v0.53 Bases in 3D, built in detail, and bases that work.
--   * Every piece is placed freely: any angle, stacked up to 24 m high, scaled (shapes on each axis), with a main
--     and an accent colour (any colour), a material (matte, metal, wood, stone, and with research: glass, chrome,
--     glow, neon) and a style variant
--   * ~60 pieces: structures (walls, floors, stairs, arches, towers, bridges…), free-form shapes to build
--     anything (box, cylinder, sphere, cone, wedge, torus, pyramid, arch, panel, ring), power, production and decor
--   * working buildings: solar panels, wind turbines and fusion generators make power; habitat pods and domes
--     house crew; drill rigs, ice condensers, greenhouses, crystal farms and plasma taps produce; refineries and
--     smelters turn raw materials into better ones; labs make research; trading posts sell surplus for Ink;
--     depots hold more. Short on power or crew? Everything runs slower. Antennas boost the lot
--   * production builds up while you're away (up to 12 hours) and you collect it into your materials; every
--     working building can be levelled up (each level makes it 50% better)
--   * research (from labs) unlocks new buildings, materials, shapes and boosts
-- Existing bases keep working exactly as they are.

update public.game_config set value = value || '{
  "max_modules": 80, "max_modules_total": 600, "max_z": 24, "scale": [0.25, 4], "max_hours": 12,
  "storage_base": 120, "storage_per_depot": 240, "upgrade_growth": 1.6, "max_level": 10,
  "materials": {
    "matte": {"name": "Matte"}, "metal": {"name": "Metal"}, "wood": {"name": "Wood"}, "stone": {"name": "Stone"},
    "glass": {"name": "Glass", "req": "glassworks"}, "chrome": {"name": "Chrome", "req": "polish"},
    "glow": {"name": "Glow", "req": "lighting"}, "neon": {"name": "Neon", "req": "neon"}
  },
  "categories": {
    "build": {"name": "Structures", "emoji": "🏗️"}, "shape": {"name": "Shapes", "emoji": "🔷"}, "power": {"name": "Power", "emoji": "⚡"},
    "make": {"name": "Production", "emoji": "🏭"}, "decor": {"name": "Decor", "emoji": "🪴"}
  },
  "modules": {
    "dome":       {"cat": "build", "name": "Dome",            "emoji": "🫧", "w": 4, "d": 4, "h": 2,  "cost": {"ink": 30, "stone": 20, "iron": 5}, "fx": {"crew": 6}},
    "hab":        {"cat": "build", "name": "Habitat pod",     "emoji": "🏠", "w": 3, "d": 5, "h": 2.4,"cost": {"ink": 25, "stone": 15, "iron": 10}, "fx": {"crew": 4}},
    "tower":      {"cat": "build", "name": "Tower",           "emoji": "🗼", "w": 2, "d": 2, "h": 8,  "cost": {"stone": 20, "iron": 12}},
    "wall":       {"cat": "build", "name": "Wall",            "emoji": "🧱", "w": 2, "d": 0.3,"h": 2.5,"cost": {"stone": 3}},
    "window":     {"cat": "build", "name": "Window wall",     "emoji": "🪟", "w": 2, "d": 0.3,"h": 2.5,"cost": {"stone": 2, "crystal": 1}},
    "door":       {"cat": "build", "name": "Door",            "emoji": "🚪", "w": 1.4,"d": 0.4,"h": 2.4,"cost": {"iron": 2}},
    "floor":      {"cat": "build", "name": "Floor tile",      "emoji": "⬜", "w": 2, "d": 2, "h": 0.2,"cost": {"stone": 1}},
    "stairs":     {"cat": "build", "name": "Stairs",          "emoji": "🪜", "w": 1.4,"d": 3, "h": 2.5,"cost": {"stone": 4}, "req": "architecture"},
    "pillar":     {"cat": "build", "name": "Pillar",          "emoji": "🏛️", "w": 0.6,"d": 0.6,"h": 3, "cost": {"stone": 2}},
    "roof":       {"cat": "build", "name": "Roof",            "emoji": "🔺", "w": 3, "d": 3, "h": 1.4,"cost": {"stone": 4, "iron": 1}},
    "bridge":     {"cat": "build", "name": "Bridge",          "emoji": "🌉", "w": 1.6,"d": 6, "h": 0.8,"cost": {"iron": 6}, "req": "architecture"},
    "pad":        {"cat": "build", "name": "Landing pad",     "emoji": "🛬", "w": 6, "d": 6, "h": 0.2,"cost": {"ink": 20, "stone": 30}},
    "box":        {"cat": "shape", "name": "Box",             "emoji": "🟦", "w": 1, "d": 1, "h": 1, "prim": true, "cost": {"stone": 1}},
    "cyl":        {"cat": "shape", "name": "Cylinder",        "emoji": "🛢️", "w": 1, "d": 1, "h": 1, "prim": true, "cost": {"stone": 1}},
    "ball":       {"cat": "shape", "name": "Sphere",          "emoji": "🔵", "w": 1, "d": 1, "h": 1, "prim": true, "cost": {"stone": 1}},
    "cone":       {"cat": "shape", "name": "Cone",            "emoji": "🔺", "w": 1, "d": 1, "h": 1, "prim": true, "cost": {"stone": 1}},
    "panel":      {"cat": "shape", "name": "Panel",           "emoji": "▭",  "w": 1, "d": 0.1,"h": 1, "prim": true, "cost": {"iron": 1}},
    "wedge":      {"cat": "shape", "name": "Wedge",           "emoji": "📐", "w": 1, "d": 1, "h": 1, "prim": true, "cost": {"stone": 1}, "req": "architecture"},
    "pyramid":    {"cat": "shape", "name": "Pyramid",         "emoji": "🔼", "w": 1, "d": 1, "h": 1, "prim": true, "cost": {"stone": 1}, "req": "architecture"},
    "torus":      {"cat": "shape", "name": "Ring",            "emoji": "⭕", "w": 1, "d": 1, "h": 0.3,"prim": true, "cost": {"iron": 1}, "req": "architecture"},
    "arch":       {"cat": "shape", "name": "Arch",            "emoji": "🌈", "w": 2, "d": 0.5,"h": 1.2,"prim": true, "cost": {"stone": 2}, "req": "architecture"},
    "capsule":    {"cat": "shape", "name": "Capsule",         "emoji": "💊", "w": 1, "d": 1, "h": 1.6,"prim": true, "cost": {"iron": 1}, "req": "architecture"},
    "solar":      {"cat": "power", "name": "Solar panel",     "emoji": "🔆", "w": 2, "d": 3, "h": 1.4,"cost": {"copper": 6, "crystal": 2}, "fx": {"power": 4}},
    "wind":       {"cat": "power", "name": "Wind turbine",    "emoji": "🌬️", "w": 2, "d": 2, "h": 7,  "cost": {"iron": 10, "copper": 4}, "fx": {"power": 3}},
    "battery":    {"cat": "power", "name": "Battery bank",    "emoji": "🔋", "w": 2, "d": 1, "h": 1.4,"cost": {"copper": 8, "iron": 4}, "fx": {"power": 2}},
    "generator":  {"cat": "power", "name": "Fusion generator","emoji": "⚛️", "w": 3, "d": 3, "h": 3,  "cost": {"ink": 60, "titanium": 10, "crystal": 8}, "fx": {"power": 15}, "req": "fusion"},
    "rig":        {"cat": "make",  "name": "Drill rig",       "emoji": "🏗️", "w": 3, "d": 3, "h": 4.5,"cost": {"ink": 40, "iron": 20, "titanium": 5}, "fx": {"power": -3, "crew": -1, "out": {"stone": 3, "iron": 2, "copper": 1}}},
    "condenser":  {"cat": "make",  "name": "Ice condenser",   "emoji": "🧊", "w": 2, "d": 2, "h": 3,  "cost": {"iron": 8, "copper": 4}, "fx": {"power": -3, "crew": -1, "out": {"ice": 5}}},
    "greenhouse": {"cat": "make",  "name": "Greenhouse",      "emoji": "🌱", "w": 3, "d": 3, "h": 3,  "cost": {"ink": 15, "ice": 10, "crystal": 4}, "fx": {"power": -2, "crew": -1, "out": {"dust": 3}, "ink": 1}},
    "refinery":   {"cat": "make",  "name": "Refinery",        "emoji": "🏭", "w": 3, "d": 3, "h": 4,  "cost": {"ink": 30, "iron": 15, "copper": 6}, "fx": {"power": -5, "crew": -2, "convert": {"from": {"stone": 8}, "to": {"iron": 2}, "times": 3}}},
    "smelter":    {"cat": "make",  "name": "Smelter",         "emoji": "🔥", "w": 3, "d": 3, "h": 3.5,"cost": {"ink": 50, "iron": 25, "crystal": 10}, "fx": {"power": -6, "crew": -2, "convert": {"from": {"iron": 6, "copper": 3}, "to": {"titanium": 1}, "times": 2}}, "req": "alloys"},
    "lab":        {"cat": "make",  "name": "Research lab",    "emoji": "🔬", "w": 3, "d": 3, "h": 3,  "cost": {"ink": 35, "iron": 10, "crystal": 6}, "fx": {"power": -6, "crew": -2, "research": 3}},
    "market":     {"cat": "make",  "name": "Trading post",    "emoji": "🏪", "w": 3, "d": 2, "h": 3,  "cost": {"ink": 25, "stone": 15, "copper": 4}, "fx": {"power": -2, "crew": -1, "sell": {"dust": 10, "stone": 10, "per": 1, "max": 4}}},
    "crystalfarm":{"cat": "make",  "name": "Crystal farm",    "emoji": "💎", "w": 3, "d": 3, "h": 2.5,"cost": {"ink": 60, "crystal": 15, "titanium": 4}, "fx": {"power": -6, "crew": -1, "out": {"crystal": 2}}, "req": "crystallography"},
    "plasmatap":  {"cat": "make",  "name": "Plasma tap",      "emoji": "🌋", "w": 3, "d": 3, "h": 5,  "cost": {"ink": 120, "titanium": 20, "gem": 6}, "fx": {"power": -10, "crew": -2, "out": {"plasma": 1}}, "req": "plasma"},
    "depot":      {"cat": "make",  "name": "Storage depot",   "emoji": "📦", "w": 3, "d": 3, "h": 2.5,"cost": {"stone": 20, "iron": 8}, "fx": {"storage": 1}},
    "antenna":    {"cat": "make",  "name": "Antenna",         "emoji": "📡", "w": 1, "d": 1, "h": 3.4,"cost": {"iron": 4, "copper": 2}, "fx": {"boost": 0.05}},
    "lamp":       {"cat": "decor", "name": "Lamp",            "emoji": "💡", "w": 1, "d": 1, "h": 2.4,"cost": {"iron": 1, "crystal": 1}},
    "fence":      {"cat": "decor", "name": "Fence",           "emoji": "🚧", "w": 2, "d": 1, "h": 1,  "cost": {"stone": 2}},
    "crate":      {"cat": "decor", "name": "Crate",           "emoji": "📦", "w": 1, "d": 1, "h": 0.9,"cost": {"stone": 3}},
    "beacon":     {"cat": "decor", "name": "Beacon",          "emoji": "🗼", "w": 1, "d": 1, "h": 3.6,"cost": {"crystal": 3, "plasma": 1}},
    "garden":     {"cat": "decor", "name": "Moss garden",     "emoji": "🪴", "w": 2, "d": 2, "h": 0.6,"cost": {"dust": 10, "ice": 4}},
    "statue":     {"cat": "decor", "name": "Statue",          "emoji": "🗿", "w": 1, "d": 1, "h": 1.8,"cost": {"gem": 3, "stone": 10}},
    "flag":       {"cat": "decor", "name": "Flag",            "emoji": "🚩", "w": 1, "d": 1, "h": 3,  "cost": {"ink": 5}},
    "tree":       {"cat": "decor", "name": "Alien tree",      "emoji": "🌴", "w": 2, "d": 2, "h": 4,  "cost": {"dust": 6, "ice": 2}},
    "shroom":     {"cat": "decor", "name": "Glow shroom",     "emoji": "🍄", "w": 1, "d": 1, "h": 1.5,"cost": {"dust": 3}},
    "rock":       {"cat": "decor", "name": "Boulder",         "emoji": "🪨", "w": 1.5,"d": 1.5,"h": 1,"cost": {"stone": 2}},
    "crystals":   {"cat": "decor", "name": "Crystal cluster", "emoji": "🔮", "w": 1, "d": 1, "h": 1.4,"cost": {"crystal": 2}},
    "fountain":   {"cat": "decor", "name": "Fountain",        "emoji": "⛲", "w": 2, "d": 2, "h": 1.6,"cost": {"stone": 8, "ice": 6}},
    "bench":      {"cat": "decor", "name": "Bench",           "emoji": "🪑", "w": 1.6,"d": 0.6,"h": 0.8,"cost": {"iron": 1}},
    "dish":       {"cat": "decor", "name": "Satellite dish",  "emoji": "📡", "w": 2, "d": 2, "h": 2.6,"cost": {"iron": 4, "copper": 3}},
    "telescope":  {"cat": "decor", "name": "Telescope",       "emoji": "🔭", "w": 1.4,"d": 1.4,"h": 2.2,"cost": {"iron": 3, "crystal": 2}},
    "rocket":     {"cat": "decor", "name": "Model rocket",    "emoji": "🚀", "w": 1.4,"d": 1.4,"h": 5,  "cost": {"iron": 8, "titanium": 2}},
    "sign":       {"cat": "decor", "name": "Light sign",      "emoji": "🪧", "w": 2, "d": 0.3,"h": 1.6,"cost": {"iron": 2, "crystal": 1}},
    "teleporter": {"cat": "decor", "name": "Teleporter",      "emoji": "🌀", "w": 2, "d": 2, "h": 3,  "cost": {"plasma": 3, "gem": 2}, "req": "teleport"}
  },
  "research": {
    "glassworks":     {"name": "Glassworks",      "emoji": "🪟", "cost": 10,  "desc": "Glass material for any piece"},
    "lighting":       {"name": "Lighting",        "emoji": "💡", "cost": 15,  "desc": "Glow material for any piece"},
    "fusion":         {"name": "Fusion power",    "emoji": "⚛️", "cost": 20,  "desc": "Build fusion generators (15 power each)"},
    "architecture":   {"name": "Architecture",    "emoji": "📐", "cost": 25,  "desc": "Stairs, bridges, wedges, pyramids, rings, arches and capsules"},
    "polish":         {"name": "Polish",          "emoji": "🪞", "cost": 25,  "desc": "Chrome material for any piece"},
    "neon":           {"name": "Neon",            "emoji": "🌈", "cost": 30,  "desc": "Neon material for any piece"},
    "alloys":         {"name": "Alloys",          "emoji": "🔩", "cost": 40,  "desc": "Smelters turn iron and copper into titanium"},
    "crystallography":{"name": "Crystallography", "emoji": "💎", "cost": 60,  "desc": "Crystal farms grow crystals"},
    "automation":     {"name": "Automation",      "emoji": "🤖", "cost": 80,  "desc": "+20% from every production building"},
    "plasma":         {"name": "Plasma",          "emoji": "🌋", "cost": 120, "desc": "Plasma taps draw plasma from deep down"},
    "teleport":       {"name": "Teleportation",   "emoji": "🌀", "cost": 150, "desc": "Teleporter pads (they look amazing)"},
    "megastructures": {"name": "Megastructures",  "emoji": "🏙️", "cost": 250, "desc": "+50% storage, and pieces up to 24 m tall"}
  }
}'::jsonb where key = 'bases' and not value ? 'research';

alter table public.planet_bases add column if not exists levels jsonb not null default '{}'::jsonb;   -- {"moduleId": 3}
alter table public.planet_bases add column if not exists storage jsonb not null default '{}'::jsonb;  -- {"stone": 12.5, ...}
alter table public.planet_bases add column if not exists ink_pending numeric not null default 0;
alter table public.planet_bases add column if not exists research_pending numeric not null default 0;
alter table public.planet_bases add column if not exists prod_at timestamptz not null default now();

create table if not exists public.base_research (
  player_id uuid primary key references public.players (id) on delete cascade,
  points numeric not null default 0,
  unlocked jsonb not null default '[]'::jsonb
);
alter table public.base_research enable row level security;
revoke all on public.base_research from anon, authenticated;

create or replace function private.base_research_of(p_uid uuid) returns jsonb language sql stable as $$
  select coalesce((select unlocked from public.base_research where player_id = p_uid), '[]'::jsonb)
$$;

/** What a base does: power and crew (and how well it runs on them), what it makes an hour, storage room. */
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
    if coalesce((fx ->> 'power')::numeric, 0) > 0 then v_sup := v_sup + (fx ->> 'power')::numeric * mult; else v_dem := v_dem - coalesce((fx ->> 'power')::numeric, 0); end if;
    if coalesce((fx ->> 'crew')::numeric, 0) > 0 then v_crew := v_crew + (fx ->> 'crew')::numeric * mult; else v_need := v_need - coalesce((fx ->> 'crew')::numeric, 0); end if;
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

/** Bring a base's production up to now (into its storage; up to 12 hours away at a time). */
create or replace function private.base_accrue(p_world text, p_gx int, p_gy int) returns public.planet_bases language plpgsql as $$
declare b public.planet_bases%rowtype; e jsonb; v_h numeric; v_st jsonb; v_cap numeric; k record; cv jsonb; v_times numeric; v_can numeric; f record; v_ink numeric;
begin
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy for update;
  if not found then return b; end if;
  v_h := least(extract(epoch from now() - b.prod_at) / 3600, coalesce((private.base_cfg() ->> 'max_hours')::numeric, 12));
  if v_h <= 0 or jsonb_array_length(b.layout) = 0 then
    update public.planet_bases set prod_at = now() where world = p_world and gx = p_gx and gy = p_gy returning * into b; return b;
  end if;
  e := private.base_econ(b.layout, b.levels, b.owner_id);
  v_cap := (e ->> 'storage_cap')::numeric; v_st := b.storage;
  for k in select key, value::numeric n from jsonb_each_text(e -> 'out') loop
    v_st := v_st || jsonb_build_object(k.key, least(v_cap, coalesce((v_st ->> k.key)::numeric, 0) + k.n * v_h));
  end loop;
  -- refineries and smelters: as many batches as the time allows and the inputs (in storage) cover
  for cv in select * from jsonb_array_elements(e -> 'convert') loop
    v_times := (cv ->> 'rate')::numeric * v_h;
    for f in select key, value::numeric n from jsonb_each_text(cv -> 'from') loop
      v_can := coalesce((v_st ->> f.key)::numeric, 0) / f.n; v_times := least(v_times, v_can);
    end loop;
    if v_times > 0 then
      for f in select key, value::numeric n from jsonb_each_text(cv -> 'from') loop v_st := v_st || jsonb_build_object(f.key, (v_st ->> f.key)::numeric - f.n * v_times); end loop;
      for f in select key, value::numeric n from jsonb_each_text(cv -> 'to') loop v_st := v_st || jsonb_build_object(f.key, least(v_cap, coalesce((v_st ->> f.key)::numeric, 0) + f.n * v_times)); end loop;
    end if;
  end loop;
  -- trading posts sell the common surplus for Ink
  v_ink := (e ->> 'ink')::numeric * v_h;
  for cv in select * from jsonb_array_elements(e -> 'sell') loop
    v_times := (cv ->> 'rate')::numeric * v_h;
    for f in select key, value::numeric n from jsonb_each_text(cv - 'per' - 'max' - 'rate') loop
      v_can := least(v_times, coalesce((v_st ->> f.key)::numeric, 0) / f.n);
      if v_can > 0 then v_st := v_st || jsonb_build_object(f.key, (v_st ->> f.key)::numeric - f.n * v_can); v_ink := v_ink + v_can * coalesce((cv ->> 'per')::numeric, 1); v_times := v_times - v_can; end if;
    end loop;
  end loop;
  update public.planet_bases set storage = v_st, ink_pending = least(200, ink_pending + v_ink), research_pending = research_pending + (e ->> 'research')::numeric * v_h, prod_at = now()
   where world = p_world and gx = p_gx and gy = p_gy returning * into b;
  return b;
end $$;

create or replace function private.base_upgrade_cost(p_kind text, p_lv int) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(key, ceil(value::numeric * power(coalesce((private.base_cfg() ->> 'upgrade_growth')::numeric, 1.6), p_lv) * 1.2)), '{}'::jsonb)
  from jsonb_each_text(private.base_cfg() -> 'modules' -> p_kind -> 'cost')
$$;

/** A base's working side: what it makes, what's waiting, and what each building's next level costs. */
create or replace function private.base_state_json(b public.planet_bases) returns jsonb language plpgsql stable as $$
declare e jsonb := private.base_econ(b.layout, b.levels, b.owner_id);
begin
  return jsonb_build_object('econ', e, 'storage', (select coalesce(jsonb_object_agg(key, floor(value::numeric)), '{}'::jsonb) from jsonb_each_text(b.storage)),
    'ink_pending', floor(b.ink_pending), 'research_pending', floor(b.research_pending), 'levels', b.levels, 'prod_at', b.prod_at,
    'upgrades', coalesce((select jsonb_object_agg(m ->> 'id', private.base_upgrade_cost(m ->> 'k', greatest(1, coalesce((b.levels ->> (m ->> 'id'))::int, 1))))
      from jsonb_array_elements(b.layout) m where private.base_cfg() -> 'modules' -> (m ->> 'k') ? 'fx'), '{}'::jsonb),
    'research', jsonb_build_object('points', floor(coalesce((select points from public.base_research where player_id = b.owner_id), 0)), 'unlocked', private.base_research_of(b.owner_id)));
end $$;

create or replace function public.planet_base_state(p_world text, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.planet_bases%rowtype;
begin
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy;
  if not found or b.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  b := private.base_accrue(p_world, p_gx, p_gy);
  return private.base_state_json(b);
end $$;

/** Collect what the base has made: materials into your stores, Ink (under the world's daily cap), research. */
create or replace function public.planet_base_collect(p_world text, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.planet_bases%rowtype; k record; v_got jsonb := '{}'::jsonb; v_left jsonb := '{}'::jsonb; v_paid int := 0; v_res int;
begin
  perform private.rate_limit('planet_base_collect', 240, 3600);
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy;
  if not found or b.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  b := private.base_accrue(p_world, p_gx, p_gy);
  for k in select key, value::numeric n from jsonb_each_text(b.storage) loop
    if floor(k.n) >= 1 then
      insert into public.planet_items (player_id, item, qty) values (v_uid, k.key, floor(k.n)) on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
      v_got := v_got || jsonb_build_object(k.key, floor(k.n));
    end if;
    if k.n - floor(k.n) > 0 then v_left := v_left || jsonb_build_object(k.key, k.n - floor(k.n)); end if;
  end loop;
  if floor(b.ink_pending) >= 1 then
    v_paid := private.planet_pay_world(v_uid, p_world, floor(b.ink_pending)::int, p_world || ':base:' || p_gx || ':' || p_gy, 'base-collect:' || p_world || ':' || p_gx || ':' || p_gy || ':' || gen_random_uuid());
  end if;
  v_res := floor(b.research_pending);
  if v_res > 0 then
    insert into public.base_research (player_id, points) values (v_uid, v_res) on conflict (player_id) do update set points = base_research.points + excluded.points;
  end if;
  update public.planet_bases set storage = v_left, ink_pending = ink_pending - floor(ink_pending), research_pending = research_pending - v_res
   where world = p_world and gx = p_gx and gy = p_gy returning * into b;
  return private.base_state_json(b) || jsonb_build_object('collected', v_got, 'ink', v_paid, 'research_gained', v_res, 'items', private.items_json(v_uid), 'balances', private.balances(v_uid));
end $$;

/** Level up one working building (materials and a little Ink; each level makes it 50% better). */
create or replace function public.planet_base_upgrade(p_world text, p_gx int, p_gy int, p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.planet_bases%rowtype; m jsonb; v_lv int; v_cost jsonb; k record; v_have bigint;
begin
  perform private.rate_limit('planet_base', 300, 3600);
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy;
  if not found or b.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  b := private.base_accrue(p_world, p_gx, p_gy);
  select x into m from jsonb_array_elements(b.layout) x where x ->> 'id' = p_id;
  if m is null or not (private.base_cfg() -> 'modules' -> (m ->> 'k') ? 'fx') then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_lv := greatest(1, coalesce((b.levels ->> p_id)::int, 1));
  if v_lv >= coalesce((private.base_cfg() ->> 'max_level')::int, 10) then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := private.base_upgrade_cost(m ->> 'k', v_lv);
  for k in select key, value::bigint n from jsonb_each_text(v_cost) where key <> 'ink' loop
    select qty into v_have from public.planet_items where player_id = v_uid and item = k.key for update;
    if coalesce(v_have, 0) < k.n then raise exception 'not_enough_materials' using errcode = 'P0001', detail = k.key; end if;
  end loop;
  if coalesce((v_cost ->> 'ink')::int, 0) > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', (v_cost ->> 'ink')::int), 'planet_base', 'planet', p_world || ':' || p_gx || ':' || p_gy, 'base-up:' || p_world || ':' || p_gx || ':' || p_gy || ':' || p_id || ':' || v_lv);
  end if;
  for k in select key, value::bigint n from jsonb_each_text(v_cost) where key <> 'ink' loop
    update public.planet_items set qty = qty - k.n where player_id = v_uid and item = k.key;
  end loop;
  update public.planet_bases set levels = levels || jsonb_build_object(p_id, v_lv + 1) where world = p_world and gx = p_gx and gy = p_gy returning * into b;
  return private.base_state_json(b) || jsonb_build_object('upgraded', p_id, 'to', v_lv + 1, 'spent', v_cost, 'items', private.items_json(v_uid), 'balances', private.balances(v_uid));
end $$;

/** Spend research points on a discovery. */
create or replace function public.base_research_buy(p_node text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); n jsonb := private.base_cfg() -> 'research' -> p_node; r public.base_research%rowtype;
begin
  if n is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.base_research (player_id) values (v_uid) on conflict do nothing;
  select * into r from public.base_research where player_id = v_uid for update;
  if r.unlocked ? p_node then raise exception 'already_owned' using errcode = 'P0001'; end if;
  if r.points < (n ->> 'cost')::numeric then raise exception 'not_enough_research' using errcode = 'P0001', detail = n ->> 'cost'; end if;
  update public.base_research set points = points - (n ->> 'cost')::numeric, unlocked = unlocked || to_jsonb(p_node) where player_id = v_uid returning * into r;
  return jsonb_build_object('points', floor(r.points), 'unlocked', r.unlocked, 'bought', p_node);
end $$;

create or replace function public.planet_base_catalog() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return jsonb_build_object('config', private.base_cfg(), 'items', private.items_json(v_uid), 'item_info', private.mine_cfg() -> 'items',
    'plot_m', coalesce((private.planet_cfg() ->> 'plot_m')::numeric, 8),
    'research', jsonb_build_object('points', floor(coalesce((select points from public.base_research where player_id = v_uid), 0)), 'unlocked', private.base_research_of(v_uid)));
end $$;

/** Save a base (one plot, or up to 4 x 4 of yours merged), with every piece placed in full detail. */
create or replace function public.planet_base_save(p_world text, p_gx int, p_gy int, p_layout jsonb, p_rev int, p_w int default 1, p_h int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.base_cfg(); b public.planet_bases%rowtype; v_plot numeric := coalesce((private.planet_cfg() ->> 'plot_m')::numeric, 8);
  m jsonb; mod jsonb; v_w numeric; v_d numeric; v_ids text[] := '{}'; v_old_ids text[]; v_cost jsonb := '{}'::jsonb; v_back jsonb := '{}'::jsonb; k record; v_have bigint;
  v_refund numeric := coalesce((c ->> 'refund')::numeric, 0.5); v_layout jsonb := '[]'::jsonb;
  v_w_n int := greatest(1, coalesce(p_w, 1)); v_h_n int := greatest(1, coalesce(p_h, 1)); v_cols int := private.planet_cols(p_world); v_max int; v_cells int; o public.planet_bases%rowtype;
  v_rs jsonb := private.base_research_of(v_uid); v_a numeric; v_sx numeric; v_sy numeric; v_sz numeric; v_z numeric; v_mat text; v_ext numeric; v_maxz numeric; v_smin numeric; v_smax numeric;
  v_hex text := '^#[0-9A-Fa-f]{6}$'; v_levels jsonb;
begin
  perform private.rate_limit('planet_base', 300, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if v_w_n > coalesce((c ->> 'max_merge')::int, 4) or v_h_n > coalesce((c ->> 'max_merge')::int, 4) then raise exception 'base_too_big' using errcode = 'P0001'; end if;
  select count(*) into v_cells from public.planet_plots
   where world = p_world and owner_id = v_uid and gy between p_gy and p_gy + v_h_n - 1
     and ((gx - p_gx) % v_cols + v_cols) % v_cols < v_w_n;
  if v_cells < v_w_n * v_h_n then raise exception 'not_owner' using errcode = 'P0001'; end if;
  for o in select * from public.planet_bases pb where pb.world = p_world and not (pb.gx = p_gx and pb.gy = p_gy)
             and pb.gy <= p_gy + v_h_n - 1 and pb.gy + pb.h - 1 >= p_gy
             and (((pb.gx - p_gx) % v_cols + v_cols) % v_cols < v_w_n or ((p_gx - pb.gx) % v_cols + v_cols) % v_cols < pb.w) loop
    if jsonb_array_length(o.layout) > 0 then raise exception 'plot_has_base' using errcode = 'P0001', detail = o.gx || ',' || o.gy; end if;
    delete from public.planet_bases where world = o.world and gx = o.gx and gy = o.gy;
  end loop;
  v_max := least(coalesce((c ->> 'max_modules_total')::int, 600), coalesce((c ->> 'max_modules')::int, 80) * v_w_n * v_h_n);
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > v_max then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
  insert into public.planet_bases (world, gx, gy, owner_id) values (p_world, p_gx, p_gy, v_uid) on conflict do nothing;
  -- bank what the base made under its old layout first
  b := private.base_accrue(p_world, p_gx, p_gy);
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy for update;
  if b.rev <> coalesce(p_rev, -1) then raise exception 'layout_conflict' using errcode = 'P0001'; end if;
  v_maxz := case when v_rs ? 'megastructures' then coalesce((c ->> 'max_z')::numeric, 24) else 12 end;
  v_smin := coalesce((c -> 'scale' ->> 0)::numeric, 0.25); v_smax := coalesce((c -> 'scale' ->> 1)::numeric, 4);
  for m in select * from jsonb_array_elements(p_layout) loop
    mod := c -> 'modules' -> (m ->> 'k');
    if mod is null or coalesce(m ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,24}$' or (m ->> 'id') = any(v_ids) then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    if mod ? 'req' and not (v_rs ? (mod ->> 'req')) and not ((m ->> 'id') = any(coalesce((select array_agg(x ->> 'id') from jsonb_array_elements(b.layout) x), '{}'))) then
      raise exception 'research_needed' using errcode = 'P0001', detail = mod ->> 'req';
    end if;
    v_ids := v_ids || (m ->> 'id');
    -- angle (any; old layouts used quarter turns), height, size and look
    v_a := coalesce((m ->> 'a')::numeric, coalesce((m ->> 'r')::numeric, 0) * 90); v_a := v_a - 360 * floor(v_a / 360);
    v_z := least(v_maxz, greatest(0, coalesce((m ->> 'z')::numeric, 0)));
    v_sx := least(v_smax, greatest(v_smin, coalesce((m ->> 'sx')::numeric, (m ->> 's')::numeric, 1)));
    v_sy := least(v_smax, greatest(v_smin, coalesce((m ->> 'sy')::numeric, (m ->> 's')::numeric, 1)));
    v_sz := least(v_smax, greatest(v_smin, coalesce((m ->> 'sz')::numeric, (m ->> 's')::numeric, 1)));
    v_mat := coalesce(m ->> 'm', 'matte');
    if not ((c -> 'materials') ? v_mat) or (c -> 'materials' -> v_mat ? 'req' and not (v_rs ? (c -> 'materials' -> v_mat ->> 'req'))) then raise exception 'research_needed' using errcode = 'P0001', detail = v_mat; end if;
    if coalesce(m ->> 'c', '#F2F5FB') !~ v_hex or coalesce(m ->> 'c2', '#59647D') !~ v_hex then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    -- the footprint, turned to its angle, has to sit on the base
    v_w := (mod ->> 'w')::numeric * v_sx; v_d := (mod ->> 'd')::numeric * v_sz;
    v_ext := abs(cos(radians(v_a))) * v_w / 2 + abs(sin(radians(v_a))) * v_d / 2;
    if (m ->> 'x')::numeric - v_ext < -0.05 or (m ->> 'x')::numeric + v_ext > v_plot * v_w_n + 0.05 then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    v_ext := abs(sin(radians(v_a))) * v_w / 2 + abs(cos(radians(v_a))) * v_d / 2;
    if (m ->> 'y')::numeric - v_ext < -0.05 or (m ->> 'y')::numeric + v_ext > v_plot * v_h_n + 0.05 then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    v_layout := v_layout || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', m ->> 'id', 'k', m ->> 'k', 'x', round((m ->> 'x')::numeric, 2), 'y', round((m ->> 'y')::numeric, 2),
      'r', round(v_a / 90) :: int % 4, 'a', round(v_a, 1), 'z', case when v_z > 0 then round(v_z, 2) end,
      'sx', case when v_sx <> 1 then round(v_sx, 2) end, 'sy', case when v_sy <> 1 then round(v_sy, 2) end, 'sz', case when v_sz <> 1 then round(v_sz, 2) end,
      'c', coalesce(m ->> 'c', '#F2F5FB'), 'c2', m ->> 'c2', 'm', case when v_mat <> 'matte' then v_mat end,
      'v', case when coalesce((m ->> 'v')::int, 0) between 1 and 3 then (m ->> 'v')::int end)));
  end loop;
  select coalesce(array_agg(x ->> 'id'), '{}') into v_old_ids from jsonb_array_elements(b.layout) x;
  for m in select * from jsonb_array_elements(v_layout) where not ((value ->> 'id') = any(v_old_ids)) loop
    for k in select key, value::numeric n from jsonb_each_text(c -> 'modules' -> (m ->> 'k') -> 'cost') loop
      -- shapes cost by how big they are
      v_cost := v_cost || jsonb_build_object(k.key, coalesce((v_cost ->> k.key)::bigint, 0)
        + case when coalesce((c -> 'modules' -> (m ->> 'k') ->> 'prim')::boolean, false)
            then greatest(1, ceil(k.n * coalesce((m ->> 'sx')::numeric, 1) * coalesce((m ->> 'sy')::numeric, 1) * coalesce((m ->> 'sz')::numeric, 1)))
            else k.n end);
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
  -- buildings that stay keep their level
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_levels from jsonb_each(b.levels) where key = any(v_ids);
  update public.planet_bases set layout = v_layout, levels = v_levels, rev = rev + 1, w = v_w_n, h = v_h_n, updated_at = now() where world = p_world and gx = p_gx and gy = p_gy returning * into b;
  perform private.quest_bump(v_uid, p_world, 'modules', (select count(*) from jsonb_array_elements(v_layout) x where not ((x ->> 'id') = any(v_old_ids))));
  if jsonb_array_length(v_layout) >= 3 and not exists (select 1 from public.feed_events where kind = 'base' and player_id = v_uid and created_at > now() - interval '1 hour') then
    insert into public.feed_events (kind, player_id, data) values ('base', v_uid, jsonb_build_object('world', p_world, 'modules', jsonb_array_length(v_layout), 'plots', v_w_n * v_h_n));
  end if;
  return jsonb_build_object('layout', b.layout, 'rev', b.rev, 'w', b.w, 'h', b.h, 'spent', v_cost, 'refunded', v_back, 'items', private.items_json(v_uid), 'balances', private.balances(v_uid),
    'state', private.base_state_json(b));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.base_research_of(uuid)', 'private.base_econ(jsonb, jsonb, uuid)', 'private.base_accrue(text, int, int)',
    'private.base_upgrade_cost(text, int)', 'private.base_state_json(public.planet_bases)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.planet_base_state(text, int, int)', 'public.planet_base_collect(text, int, int)', 'public.planet_base_upgrade(text, int, int, text)',
    'public.base_research_buy(text)', 'public.planet_base_catalog()', 'public.planet_base_save(text, int, int, jsonb, int, int, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
