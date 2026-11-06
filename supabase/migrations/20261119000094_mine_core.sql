-- v0.6.2 The Crystal Mine becomes its own game: a real mine you dig, tile by tile, down through six layers
-- (topsoil, stone, deep rock, crystal caverns, magma depths, ancient ruins). Each tile is worked out the same way
-- here and in the app from the mine's seed, so the server checks every dig: you can only dig next to a tunnel,
-- each tile costs pickaxe energy (which refills over time), and what's inside is paid out here.
-- Ores, crystals and gems go to the mine's wallet (sell, smelt), geodes to crack at the bench, fossils and relics to
-- the museum (the realm's finds book), chests hold gold; every 10 metres of new depth pays a little Ink.
-- Tools (bought with gold): pickaxe (cheaper digs), energy tank (more energy), lungs (faster refill),
-- lantern (see further into the rock); dynamite blasts 3x3 for free.

insert into public.game_config (key, value, description) values ('realm_mine', $cfg${
  "width": 9, "max_depth": 400,
  "energy": { "base": 40, "per_tank": 12, "regen_per_min": 0.8, "regen_per_level": 0.2 },
  "layers": [
    { "from": 0,   "id": "topsoil", "name": "Topsoil",          "base": "dirt",  "hp": 1 },
    { "from": 10,  "id": "stone",   "name": "Stone",            "base": "stone", "hp": 2 },
    { "from": 30,  "id": "deep",    "name": "Deep rock",        "base": "deep",  "hp": 3 },
    { "from": 60,  "id": "caverns", "name": "Crystal caverns",  "base": "cave_rock", "hp": 3 },
    { "from": 100, "id": "magma",   "name": "Magma depths",     "base": "magma", "hp": 4 },
    { "from": 150, "id": "ruins",   "name": "Ancient ruins",    "base": "ruin",  "hp": 4 }
  ],
  "specials": [
    { "k": "cave",    "from": 15,  "w": 450 },
    { "k": "copper",  "from": 2,   "w": 700 },
    { "k": "iron",    "from": 12,  "w": 520 },
    { "k": "silver",  "from": 30,  "w": 360 },
    { "k": "crystal", "from": 45,  "w": 320 },
    { "k": "gem",     "from": 70,  "w": 130 },
    { "k": "geode",   "from": 20,  "w": 130 },
    { "k": "fossil",  "from": 5,   "w": 90 },
    { "k": "chest",   "from": 8,   "w": 28 },
    { "k": "lava",    "from": 100, "w": 320 },
    { "k": "relic",   "from": 150, "w": 70 }
  ],
  "tiles": {
    "dirt":      { "hp": 1, "loot": {} },
    "stone":     { "hp": 2, "loot": { "stone": [1, 2] } },
    "deep":      { "hp": 3, "loot": { "stone": [2, 3] } },
    "cave_rock": { "hp": 3, "loot": { "stone": [1, 3] } },
    "magma":     { "hp": 4, "loot": { "stone": [2, 3] } },
    "ruin":      { "hp": 4, "loot": { "stone": [2, 4] } },
    "cave":      { "hp": 0, "loot": {} },
    "copper":    { "hp": 0, "loot": { "copper": [2, 4] } },
    "iron":      { "hp": 1, "loot": { "iron": [2, 3] } },
    "silver":    { "hp": 1, "loot": { "silver": [1, 3] } },
    "crystal":   { "hp": 1, "loot": { "crystal": [1, 2] } },
    "gem":       { "hp": 2, "loot": { "gem": [1, 1] } },
    "geode":     { "hp": 1, "loot": { "geode": [1, 1] } },
    "fossil":    { "hp": 1, "loot": {} },
    "chest":     { "hp": 0, "loot": {} },
    "lava":      { "hp": 0, "loot": {}, "burn": 3 },
    "relic":     { "hp": 2, "loot": {} }
  },
  "tools": {
    "pick":  { "name": "Pickaxe",       "emoji": "⛏️", "blurb": "Every two levels, each tile costs 1 less energy", "max": 8,  "cost": 60,  "growth": 2.1 },
    "tank":  { "name": "Energy tank",   "emoji": "🔋", "blurb": "+12 most energy",                                 "max": 10, "cost": 50,  "growth": 1.9 },
    "regen": { "name": "Miner’s lungs", "emoji": "💨", "blurb": "Energy comes back faster",                         "max": 10, "cost": 80,  "growth": 1.9 },
    "lamp":  { "name": "Lantern",       "emoji": "🏮", "blurb": "See one more tile into the rock",                  "max": 3,  "cost": 150, "growth": 3.0 }
  },
  "dynamite": { "cost": 35, "max": 20 },
  "geode": { "crystal": [2, 5], "gem_chance": 0.3, "find_chance": 0.08, "xp": 15 },
  "depth_ink": { "every": 10, "ink": 2 },
  "xp_per_hp": 2
}$cfg$::jsonb, 'The Crystal Mine: dig layers, tiles, tools, dynamite, geodes')
on conflict (key) do nothing;

create table if not exists public.realm_mines (
  realm_id uuid primary key references public.realms (id) on delete cascade,
  energy numeric not null default 40,
  energy_at timestamptz not null default now(),
  deepest int not null default 0,
  dug int[] not null default '{}',
  tools jsonb not null default '{}'::jsonb,
  dynamite int not null default 3,
  dug_count int not null default 0
);
alter table public.realm_mines enable row level security;
revoke all on public.realm_mines from anon, authenticated;

create or replace function private.rmine_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('realm_mine'), '{}'::jsonb) $$;
/** the same little hash the app uses (Park–Miller rounds, exact in both) */
create or replace function private.rmine_hash(p_seed int, p_x int, p_y int) returns bigint language plpgsql immutable as $$
declare h bigint := ((p_seed::bigint % 2147483647) + p_x::bigint * 92821 + p_y::bigint * 68917 + 12345) % 2147483647;
begin
  h := (h * 48271) % 2147483647; h := (h * 48271) % 2147483647; h := (h * 48271) % 2147483647;
  return h;
end $$;
create or replace function private.rmine_tile(p_seed int, p_x int, p_y int, c jsonb) returns text language plpgsql immutable as $$
declare r int := (private.rmine_hash(p_seed, p_x, p_y) % 10000)::int; acc int := 0; s jsonb; v_base text := 'dirt'; l jsonb;
begin
  for s in select e from jsonb_array_elements(c -> 'specials') e loop
    if p_y >= (s ->> 'from')::int then acc := acc + (s ->> 'w')::int; if r < acc then return s ->> 'k'; end if; end if;
  end loop;
  for l in select e from jsonb_array_elements(c -> 'layers') e loop if p_y >= (l ->> 'from')::int then v_base := l ->> 'base'; end if; end loop;
  return v_base;
end $$;
/** the layer's hardness, plus the tile's own */
create or replace function private.rmine_hp(p_y int, p_kind text, c jsonb) returns int language sql immutable as $$
  select greatest(0, coalesce((c -> 'tiles' -> p_kind ->> 'hp')::int, 1) + case when p_kind in ('dirt', 'stone', 'deep', 'cave_rock', 'magma', 'ruin', 'cave', 'lava') then 0
    else coalesce((select (e ->> 'hp')::int from jsonb_array_elements(c -> 'layers') e where p_y >= (e ->> 'from')::int order by (e ->> 'from')::int desc limit 1), 1) end)
$$;
create or replace function private.rmine_max_energy(m public.realm_mines, c jsonb) returns int language sql stable as $$
  select (c -> 'energy' ->> 'base')::int + (c -> 'energy' ->> 'per_tank')::int * coalesce((m.tools ->> 'tank')::int, 0)
$$;
create or replace function private.rmine_rate(m public.realm_mines, c jsonb) returns numeric language sql stable as $$
  select (c -> 'energy' ->> 'regen_per_min')::numeric * (1 + (c -> 'energy' ->> 'regen_per_level')::numeric * coalesce((m.tools ->> 'regen')::int, 0))
$$;
create or replace function private.rmine_energy_now(m public.realm_mines, c jsonb) returns numeric language sql stable as $$
  select least(private.rmine_max_energy(m, c)::numeric, m.energy + private.rmine_rate(m, c) * extract(epoch from now() - m.energy_at) / 60)
$$;
create or replace function private.rmine_row(p_realm uuid) returns public.realm_mines language plpgsql as $$
declare m public.realm_mines%rowtype;
begin
  insert into public.realm_mines (realm_id) values (p_realm) on conflict do nothing;
  select * into m from public.realm_mines where realm_id = p_realm for update;
  return m;
end $$;
create or replace function private.rmine_json(p_realm uuid) returns jsonb language plpgsql as $$
declare m public.realm_mines%rowtype := private.rmine_row(p_realm); c jsonb := private.rmine_cfg(); t text; v_costs jsonb := '{}'::jsonb;
begin
  for t in select jsonb_object_keys(c -> 'tools') loop
    v_costs := v_costs || jsonb_build_object(t, case when coalesce((m.tools ->> t)::int, 0) >= (c -> 'tools' -> t ->> 'max')::int then null
      else round((c -> 'tools' -> t ->> 'cost')::numeric * power((c -> 'tools' -> t ->> 'growth')::numeric, coalesce((m.tools ->> t)::int, 0))) end);
  end loop;
  return jsonb_build_object('energy', round(private.rmine_energy_now(m, c), 2), 'energy_max', private.rmine_max_energy(m, c), 'rate', private.rmine_rate(m, c),
    'deepest', m.deepest, 'dug', to_jsonb(m.dug), 'tools', m.tools, 'tool_costs', v_costs, 'dynamite', m.dynamite, 'dug_count', m.dug_count, 'cfg', c);
end $$;

/** a find for depth y from the realm's finds book, picked by the tile's hash (rarer ones deeper) */
create or replace function private.rmine_find(p_kind text, p_y int, p_h bigint, p_relic boolean) returns text language plpgsql stable as $$
declare f jsonb := private.rlm_cfg(p_kind) -> 'finds'; v_keys text[]; v_n int;
begin
  select array_agg(k order by (f -> k ->> 'order')::int) into v_keys from jsonb_object_keys(f) k
   where (f -> k ->> 'level')::int <= greatest(1, p_y / 6) and (not p_relic or (f -> k ->> 'rarity') in ('rare', 'epic', 'legendary'));
  if v_keys is null then select array_agg(k order by (f -> k ->> 'order')::int) into v_keys from jsonb_object_keys(f) k; end if;
  v_n := array_length(v_keys, 1);
  -- later entries are rarer: weight towards the start
  return v_keys[1 + floor(power(((p_h / 7) % 1000) / 1000.0, 1.6) * v_n)::int];
end $$;

/** dig: cells (indices y*width+x) in the order you broke them. Returns what you got and the mine now. */
create or replace function public.mine_dig(p_id uuid, p_cells jsonb, p_blast int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; m public.realm_mines%rowtype; c jsonb := private.rmine_cfg();
  W int := (c ->> 'width')::int; v_max int := (c ->> 'max_depth')::int; v_e numeric; idx int; x int; y int; k text; hp int; cost int; h bigint;
  v_loot jsonb := '{}'::jsonb; v_finds jsonb := '[]'::jsonb; v_done int[] := '{}'; v_xp int := 0; v_pick int; v_f text; p public.realm_players%rowtype;
  v_ink int := 0; v_deep0 int; v_lv int; a jsonb; v_cells int[] := coalesce((select array_agg(e::int order by n) from jsonb_array_elements_text(case when jsonb_typeof(p_cells) = 'array' then p_cells else '[]'::jsonb end) with ordinality t(e, n)), '{}'); v_blast boolean := p_blast is not null; v_new boolean;
begin
  perform private.rate_limit('mine_dig', 3000, 3600);
  r := private.rlm_owned(p_id, v_uid);
  if r.kind <> 'mine' then raise exception 'not_found' using errcode = 'P0001'; end if;
  m := private.rmine_row(r.id); v_e := private.rmine_energy_now(m, c); v_pick := coalesce((m.tools ->> 'pick')::int, 0); v_deep0 := m.deepest;
  if v_blast then
    if m.dynamite < 1 then raise exception 'no_dynamite' using errcode = 'P0001'; end if;
    x := p_blast % W; y := p_blast / W;
    if not (y = 0 or (p_blast - W) = any(m.dug) or (x > 0 and (p_blast - 1) = any(m.dug)) or (x < W - 1 and (p_blast + 1) = any(m.dug)) or (p_blast + W) = any(m.dug) or p_blast = any(m.dug)) then
      raise exception 'mine_not_reachable' using errcode = 'P0001'; end if;
    v_cells := '{}';
    for idx in select (yy * W + xx) from generate_series(greatest(0, y - 1), least(v_max - 1, y + 1)) yy, generate_series(greatest(0, x - 1), least(W - 1, x + 1)) xx loop v_cells := v_cells || idx; end loop;
    m.dynamite := m.dynamite - 1;
  end if;
  if array_length(v_cells, 1) > 60 then raise exception 'too_many' using errcode = 'P0001'; end if;
  p := private.rlm_player(v_uid, 'mine');
  foreach idx in array v_cells loop
    x := idx % W; y := idx / W;
    if idx < 0 or y >= v_max or idx = any(m.dug) or idx = any(v_done) then continue; end if;
    if not v_blast and not (y = 0 or (idx - W) = any(m.dug || v_done) or (x > 0 and (idx - 1) = any(m.dug || v_done)) or (x < W - 1 and (idx + 1) = any(m.dug || v_done)) or (idx + W) = any(m.dug || v_done)) then
      continue; end if;
    k := private.rmine_tile(r.seed, x, y, c); h := private.rmine_hash(r.seed, x, y);
    hp := private.rmine_hp(y, k, c);
    cost := case when v_blast then 0 when hp = 0 then 0 else greatest(1, hp - v_pick / 2) end + case when k = 'lava' and not v_blast then coalesce((c -> 'tiles' -> 'lava' ->> 'burn')::int, 3) else 0 end;
    if v_e < cost then exit; end if;
    v_e := v_e - cost; v_done := v_done || idx;
    v_xp := v_xp + greatest(1, hp) * coalesce((c ->> 'xp_per_hp')::int, 2) + case when k in ('gem', 'chest', 'relic', 'fossil', 'geode') then 10 else 0 end;
    for a in select jsonb_build_object('k', key, 'v', value) from jsonb_each(coalesce(c -> 'tiles' -> k -> 'loot', '{}'::jsonb)) loop
      v_loot := private.jadd(v_loot, jsonb_build_object(a ->> 'k', ((a -> 'v' ->> 0)::int + (h / 11) % ((a -> 'v' ->> 1)::int - (a -> 'v' ->> 0)::int + 1))));
    end loop;
    if k = 'chest' then v_loot := private.jadd(v_loot, jsonb_build_object('gold', 25 + y * 2 + (h / 13) % 60)); end if;
    if k in ('fossil', 'relic') or (k = 'chest' and (h / 17) % 10 < 3) then
      v_f := private.rmine_find('mine', y, h, k = 'relic');
      if v_f is not null then
        v_new := coalesce((p.finds ->> v_f)::int, 0) = 0 and not exists (select 1 from jsonb_array_elements(v_finds) e where e ->> 'id' = v_f);
        p.finds := jsonb_set(p.finds, array[v_f], to_jsonb(coalesce((p.finds ->> v_f)::int, 0) + 1));
        v_finds := v_finds || jsonb_build_array(jsonb_build_object('id', v_f, 'new', v_new, 'at', idx));
        if v_new then v_ink := v_ink + coalesce((private.rlm_cfg('mine') -> 'finds' -> v_f ->> 'ink')::int, 0); end if;
      end if;
    end if;
    if y > m.deepest then m.deepest := y; end if;
  end loop;
  update public.realm_mines set energy = v_e, energy_at = now(), dug = m.dug || v_done, deepest = m.deepest, dynamite = m.dynamite, dug_count = dug_count + coalesce(array_length(v_done, 1), 0)
   where realm_id = r.id;
  update public.realm_players set wallet = private.jadd(wallet, v_loot), lifetime = private.jadd(lifetime, v_loot), finds = p.finds where player_id = v_uid and kind = 'mine';
  -- every 10 metres of new depth pays a little Ink
  v_ink := v_ink + (m.deepest / coalesce((c -> 'depth_ink' ->> 'every')::int, 10) - v_deep0 / coalesce((c -> 'depth_ink' ->> 'every')::int, 10)) * coalesce((c -> 'depth_ink' ->> 'ink')::int, 2);
  v_ink := private.rlm_pay(v_uid, 'mine', v_ink, r.id::text, 'mine-ink:' || r.id || ':' || m.dug_count || ':' || coalesce(array_length(v_done, 1), 0) || ':' || m.deepest);
  v_lv := private.rlm_xp(r.id, v_xp);
  return jsonb_build_object('dug', to_jsonb(v_done), 'loot', v_loot, 'finds', v_finds, 'xp', v_xp, 'ink', v_ink, 'level_up', v_lv,
    'mine', private.rmine_json(r.id), 'me', private.rlm_me(v_uid, 'mine'), 'level', private.rlm_level((select xp from public.realms where id = r.id)));
end $$;

create or replace function public.mine_tool(p_id uuid, p_tool text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; m public.realm_mines%rowtype; c jsonb := private.rmine_cfg(); t jsonb; v_lv int; v_cost int;
begin
  perform private.rate_limit('mine_tool', 300, 3600);
  r := private.rlm_owned(p_id, v_uid);
  t := c -> 'tools' -> p_tool; if r.kind <> 'mine' or t is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  m := private.rmine_row(r.id); v_lv := coalesce((m.tools ->> p_tool)::int, 0);
  if v_lv >= (t ->> 'max')::int then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := round((t ->> 'cost')::numeric * power((t ->> 'growth')::numeric, v_lv));
  perform private.rlm_player(v_uid, 'mine');
  if not private.jcovers((select wallet from public.realm_players where player_id = v_uid and kind = 'mine'), jsonb_build_object('gold', v_cost)) then raise exception 'not_enough' using errcode = 'P0001'; end if;
  update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('gold', v_cost), -1) where player_id = v_uid and kind = 'mine';
  -- keep the energy you'd built up, counted at the old refill rate
  update public.realm_mines set energy = private.rmine_energy_now(m, c), energy_at = now(), tools = jsonb_set(tools, array[p_tool], to_jsonb(v_lv + 1)) where realm_id = r.id;
  perform private.rlm_xp(r.id, 10 + v_lv * 10);
  return jsonb_build_object('mine', private.rmine_json(r.id), 'me', private.rlm_me(v_uid, 'mine'));
end $$;

create or replace function public.mine_buy_dynamite(p_id uuid, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; m public.realm_mines%rowtype; c jsonb := private.rmine_cfg() -> 'dynamite'; v_n int; v_cost int;
begin
  perform private.rate_limit('mine_tool', 300, 3600);
  r := private.rlm_owned(p_id, v_uid); if r.kind <> 'mine' then raise exception 'not_found' using errcode = 'P0001'; end if;
  m := private.rmine_row(r.id);
  v_n := least(greatest(coalesce(p_n, 1), 1), (c ->> 'max')::int - m.dynamite);
  if v_n <= 0 then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := v_n * (c ->> 'cost')::int;
  perform private.rlm_player(v_uid, 'mine');
  if not private.jcovers((select wallet from public.realm_players where player_id = v_uid and kind = 'mine'), jsonb_build_object('gold', v_cost)) then raise exception 'not_enough' using errcode = 'P0001'; end if;
  update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('gold', v_cost), -1) where player_id = v_uid and kind = 'mine';
  update public.realm_mines set dynamite = dynamite + v_n where realm_id = r.id;
  return jsonb_build_object('mine', private.rmine_json(r.id), 'me', private.rlm_me(v_uid, 'mine'));
end $$;

/** crack a geode at the bench: crystals, maybe a gem, maybe a find */
create or replace function public.mine_crack(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; c jsonb := private.rmine_cfg() -> 'geode'; p public.realm_players%rowtype;
  v_loot jsonb; v_find text; v_new boolean := false; v_ink int := 0; v_lv int;
begin
  perform private.rate_limit('mine_crack', 600, 3600);
  r := private.rlm_owned(p_id, v_uid); if r.kind <> 'mine' then raise exception 'not_found' using errcode = 'P0001'; end if;
  p := private.rlm_player(v_uid, 'mine');
  if coalesce((p.wallet ->> 'geode')::numeric, 0) < 1 then raise exception 'not_enough' using errcode = 'P0001'; end if;
  v_loot := jsonb_build_object('crystal', (c -> 'crystal' ->> 0)::int + floor(random() * ((c -> 'crystal' ->> 1)::int - (c -> 'crystal' ->> 0)::int + 1))::int);
  if random() < (c ->> 'gem_chance')::numeric then v_loot := v_loot || jsonb_build_object('gem', 1 + floor(random() * 2)::int); end if;
  if random() < (c ->> 'find_chance')::numeric then
    v_find := private.rmine_find('mine', 60 + floor(random() * 100)::int, floor(random() * 2147483647)::bigint, true);
    v_new := coalesce((p.finds ->> v_find)::int, 0) = 0;
    p.finds := jsonb_set(p.finds, array[v_find], to_jsonb(coalesce((p.finds ->> v_find)::int, 0) + 1));
    if v_new then v_ink := coalesce((private.rlm_cfg('mine') -> 'finds' -> v_find ->> 'ink')::int, 0); end if;
  end if;
  update public.realm_players set wallet = private.jadd(private.jadd(wallet, jsonb_build_object('geode', 1), -1), v_loot), lifetime = private.jadd(lifetime, v_loot), finds = p.finds
   where player_id = v_uid and kind = 'mine';
  v_ink := private.rlm_pay(v_uid, 'mine', v_ink, r.id::text, 'mine-geode:' || gen_random_uuid());
  v_lv := private.rlm_xp(r.id, (c ->> 'xp')::int);
  return jsonb_build_object('loot', v_loot, 'find', v_find, 'new', v_new, 'ink', v_ink, 'level_up', v_lv, 'me', private.rlm_me(v_uid, 'mine'));
end $$;

create or replace function public.mine_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_id;
  if not found or r.kind <> 'mine' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return public.realm_get(p_id) || jsonb_build_object('mine_core', private.rmine_json(r.id));
end $$;

-- a second minigame for the mine: Minecart Rush (same rules as Deep Dig's rewards)
update public.game_config set value = jsonb_set(value, '{kinds,mine,games,cart}',
  (value -> 'kinds' -> 'mine' -> 'games' -> 'dig') || jsonb_build_object('name', 'Minecart Rush', 'emoji', '🛤️', 'blurb', 'Ride the rails: switch tracks, jump the gaps, grab the ore.', 'level', 3))
 where key = 'realms' and value -> 'kinds' -> 'mine' -> 'games' ? 'dig' and not (value -> 'kinds' -> 'mine' -> 'games' ? 'cart');

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and p.proname like 'rmine\_%') or (n.nspname = 'public' and p.proname like 'mine\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
