-- v0.6.6 The Restaurant becomes its own game: you run the kitchen of a little diner that grows into a restaurant.
-- Open for a shift (two minutes): customers walk in, take a table and order off your menu. Cook each dish at its
-- station (coffee machine, griddle, oven, blender, stove), pick it up when it's done (before it burns), and serve
-- the table. Fast service earns bigger tips; the dish of the day pays double. Between shifts: buy and speed up
-- stations, add tables, redecorate (more patience, bigger tips) and hire a night crew that earns tips while you're
-- away. Ingredients come from your suppliers (the helpers) and the pantry.
--
-- The server deals each shift's customers (who comes when, what they order) and checks what you report back: a
-- table can only be served once, no sooner than its dishes can be cooked and no later than its patience, and only
-- with the ingredients you have.

insert into public.game_config (key, value, description) values ('realm_diner', $cfg${
  "shift_seconds": 120,
  "patience": 40,
  "burn_seconds": 7,
  "tray": 4,
  "ink_per_tips": 60,
  "xp_per_tip": 0.25,
  "special_mult": 2,
  "crew_tips_per_hour": 40,
  "crew_cap_hours": 8,
  "tables": { "start": 2, "max": 8, "cost": [0, 0, 120, 300, 700, 1500, 3200, 6500, 12000] },
  "decor": { "names": ["Bare walls", "Fresh paint", "Potted plants", "Neon sign", "Jukebox", "Chandelier"], "cost": [0, 250, 900, 2800, 8000, 22000], "tip_bonus": 0.1, "patience_bonus": 4 },
  "crew": { "names": ["No crew", "Night waiter", "Line cook", "Sous chef", "Head chef", "Celebrity chef"], "cost": [0, 400, 1800, 6000, 16000, 42000] },
  "stations": {
    "coffee":  { "name": "Coffee machine", "emoji": "☕", "level": 1,  "cost": [0, 150],      "speed_cost": 80 },
    "griddle": { "name": "Griddle",        "emoji": "🍳", "level": 1,  "cost": [0, 220],      "speed_cost": 120 },
    "oven":    { "name": "Pizza oven",     "emoji": "🔥", "level": 6,  "cost": [700, 2400],   "speed_cost": 400 },
    "blender": { "name": "Blender",        "emoji": "🌀", "level": 12, "cost": [2500, 7000],  "speed_cost": 1200 },
    "stove":   { "name": "Stove",          "emoji": "🍲", "level": 20, "cost": [8000, 22000], "speed_cost": 3500 }
  },
  "speed_max": 3,
  "speed_step": 0.18,
  "dishes": {
    "coffee":   { "name": "Coffee",         "emoji": "☕", "station": "coffee",  "seconds": 2.5, "price": 4,   "in": {},                                   "level": 1 },
    "toast":    { "name": "Buttered toast", "emoji": "🍞", "station": "griddle", "seconds": 3,   "price": 6,   "in": { "flour": 1 },                       "level": 1 },
    "pancakes": { "name": "Pancakes",       "emoji": "🥞", "station": "griddle", "seconds": 4,   "price": 14,  "in": { "flour": 2, "egg": 1 },             "level": 3 },
    "omelette": { "name": "Omelette",       "emoji": "🍳", "station": "griddle", "seconds": 5,   "price": 26,  "in": { "egg": 2, "cheese": 1 },            "level": 6 },
    "pizza":    { "name": "Pizza",          "emoji": "🍕", "station": "oven",    "seconds": 7,   "price": 42,  "in": { "flour": 2, "cheese": 2 },          "level": 6 },
    "tacos":    { "name": "Fish tacos",     "emoji": "🌮", "station": "griddle", "seconds": 5,   "price": 70,  "in": { "fish": 1, "flour": 1 },            "level": 10 },
    "smoothie": { "name": "Berry smoothie", "emoji": "🥤", "station": "blender", "seconds": 3,   "price": 64,  "in": { "berry": 1 },                       "level": 12 },
    "pie":      { "name": "Berry pie",      "emoji": "🥧", "station": "oven",    "seconds": 8,   "price": 120, "in": { "berry": 1, "flour": 2, "egg": 1 }, "level": 15 },
    "pasta":    { "name": "Truffle pasta",  "emoji": "🍝", "station": "stove",   "seconds": 8,   "price": 240, "in": { "truffle": 1, "egg": 1, "flour": 1 }, "level": 20 },
    "stew":     { "name": "Captain's stew", "emoji": "🍲", "station": "stove",   "seconds": 9,   "price": 300, "in": { "fish": 2, "truffle": 1 },          "level": 24 }
  },
  "pantry": { "flour": 3, "egg": 8, "cheese": 20, "fish": 50, "berry": 120, "truffle": 330 },
  "pantry_free": { "flour": 20, "egg": 8 }
}$cfg$::jsonb, 'Restaurant: stations, dishes, tables, decor, crew, shifts')
on conflict (key) do nothing;

create table if not exists public.realm_diners (
  realm_id uuid primary key references public.realms (id) on delete cascade,
  stations jsonb not null default '{"coffee": {"n": 1, "speed": 0}, "griddle": {"n": 1, "speed": 0}}'::jsonb,
  tables int not null default 2,
  decor int not null default 0,
  crew int not null default 0,
  crew_at timestamptz not null default now(),
  shifts int not null default 0,
  served int not null default 0,
  best_tips int not null default 0,
  pantry_day date
);
alter table public.realm_diners enable row level security;
revoke all on public.realm_diners from anon, authenticated;

create table if not exists public.realm_diner_shifts (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms (id) on delete cascade,
  customers jsonb not null,
  special text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  result jsonb
);
create index if not exists realm_diner_shifts_realm on public.realm_diner_shifts (realm_id, started_at desc);
alter table public.realm_diner_shifts enable row level security;
revoke all on public.realm_diner_shifts from anon, authenticated;

create or replace function private.rdin_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('realm_diner'), '{}'::jsonb) $$;
create or replace function private.rdin_row(p_realm uuid) returns public.realm_diners language plpgsql as $$
declare d public.realm_diners%rowtype;
begin
  select * into d from public.realm_diners where realm_id = p_realm for update;
  if found then return d; end if;
  insert into public.realm_diners (realm_id) values (p_realm) on conflict do nothing;
  select * into d from public.realm_diners where realm_id = p_realm for update;
  return d;
end $$;
/** the dishes on the menu: unlocked by level, and you need the station to cook them */
create or replace function private.rdin_menu(p_lv int, p_stations jsonb) returns text[] language sql stable as $$
  select coalesce(array_agg(key order by (value ->> 'level')::int, key), '{}') from jsonb_each(private.rdin_cfg() -> 'dishes')
   where (value ->> 'level')::int <= p_lv and coalesce((p_stations -> (value ->> 'station') ->> 'n')::int, 0) > 0
$$;
create or replace function private.rdin_patience(p_decor int) returns numeric language sql stable as $$
  select (private.rdin_cfg() ->> 'patience')::numeric + p_decor * (private.rdin_cfg() -> 'decor' ->> 'patience_bonus')::numeric
$$;
/** how long a dish takes at your station (faster with speed upgrades) */
create or replace function private.rdin_secs(p_dish text, p_stations jsonb) returns numeric language sql stable as $$
  select (c -> 'dishes' -> p_dish ->> 'seconds')::numeric * (1 - (c ->> 'speed_step')::numeric * coalesce((p_stations -> (c -> 'dishes' -> p_dish ->> 'station') ->> 'speed')::int, 0))
    from private.rdin_cfg() c
$$;
create or replace function private.rdin_crew_pending(d public.realm_diners) returns int language sql stable as $$
  select floor(d.crew * (c ->> 'crew_tips_per_hour')::numeric * (1 + d.decor * (c -> 'decor' ->> 'tip_bonus')::numeric)
               * least((c ->> 'crew_cap_hours')::numeric, extract(epoch from now() - d.crew_at) / 3600))::int from private.rdin_cfg() c
$$;
create or replace function private.rdin_json(p_realm uuid) returns jsonb language plpgsql as $$
declare d public.realm_diners%rowtype := private.rdin_row(p_realm); r public.realms%rowtype; v_lv int;
begin
  select * into r from public.realms where id = p_realm; v_lv := private.rlm_lv(r.xp);
  return jsonb_build_object('stations', d.stations, 'tables', d.tables, 'decor', d.decor, 'crew', d.crew, 'crew_at', d.crew_at, 'crew_pending', private.rdin_crew_pending(d),
    'shifts', d.shifts, 'served', d.served, 'best_tips', d.best_tips, 'pantry_ready', d.pantry_day is distinct from current_date,
    'menu', to_jsonb(private.rdin_menu(v_lv, d.stations)), 'patience', private.rdin_patience(d.decor), 'cfg', private.rdin_cfg(), 'server_time', now());
end $$;
create or replace function private.rdin_owned(p_id uuid) returns public.realms language plpgsql as $$
declare r public.realms%rowtype := private.rlm_owned(p_id, private.require_active_player());
begin
  if r.kind <> 'diner' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return r;
end $$;
create or replace function private.rdin_out(p_realm uuid, p_uid uuid, p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select p_extra || jsonb_build_object('diner', private.rdin_json(p_realm), 'me', private.rlm_me(p_uid, 'diner'), 'level', private.rlm_level((select xp from public.realms where id = p_realm)))
$$;
create or replace function private.rdin_spend(p_uid uuid, p_tips int) returns void language plpgsql as $$
begin
  perform private.rlm_player(p_uid, 'diner');
  if not private.jcovers((select wallet from public.realm_players where player_id = p_uid and kind = 'diner'), jsonb_build_object('tips', p_tips)) then raise exception 'not_enough' using errcode = 'P0001'; end if;
  update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('tips', p_tips), -1) where player_id = p_uid and kind = 'diner';
end $$;

create or replace function public.diner_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_id;
  if not found or r.kind <> 'diner' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return public.realm_get(p_id) || jsonb_build_object('diner_core', private.rdin_json(r.id));
end $$;

/** open for a shift: the server deals the customers (arrival, order) and the dish of the day */
create or replace function public.diner_open(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdin_owned(p_id); d public.realm_diners%rowtype := private.rdin_row(p_id); c jsonb := private.rdin_cfg();
  v_lv int := private.rlm_lv(r.xp); v_menu text[]; v_n int; v_len numeric := (c ->> 'shift_seconds')::numeric * 1000; v_gap numeric; v_at numeric := 1500;
  v_cust jsonb := '[]'::jsonb; v_order jsonb; v_two boolean; v_special text; v_id uuid; i int := 0; v_pick int;
begin
  perform private.rate_limit('diner_shift', 60, 3600);
  -- today's menu: what you can cook and have the ingredients for (at least one of each)
  perform private.rlm_player(r.owner_id, 'diner');
  select array_agg(k order by o) into v_menu from unnest(private.rdin_menu(v_lv, d.stations)) with ordinality m(k, o)
   where private.jcovers((select wallet from public.realm_players where player_id = r.owner_id and kind = 'diner'), c -> 'dishes' -> k -> 'in');
  v_n := coalesce(array_length(v_menu, 1), 0);
  if v_n = 0 then raise exception 'not_found' using errcode = 'P0001'; end if;
  -- more tables, more customers (but never a flood)
  v_gap := greatest(3200, 9500 - d.tables * 800);
  v_special := v_menu[1 + (extract(doy from now())::int + hashtext(r.id::text) % 7 + 7) % v_n];
  while v_at < v_len - 8000 loop
    v_two := v_lv >= 4 and random() < least(0.45, 0.12 + v_lv * 0.015);
    -- newer dishes come up a little more often than the old favourites
    v_pick := v_n - floor(power(random(), 1.6) * v_n)::int; v_order := jsonb_build_array(v_menu[v_pick]);
    if v_two then v_order := v_order || to_jsonb(v_menu[1 + floor(random() * v_n)::int]); end if;
    v_cust := v_cust || jsonb_build_object('i', i, 'at', round(v_at), 'order', v_order, 'look', floor(random() * 1000)::int);
    i := i + 1; v_at := v_at + v_gap * (0.6 + random() * 0.8);
  end loop;
  insert into public.realm_diner_shifts (realm_id, customers, special) values (r.id, v_cust, v_special) returning id into v_id;
  return jsonb_build_object('shift', jsonb_build_object('id', v_id, 'customers', v_cust, 'special', v_special, 'menu', to_jsonb(v_menu), 'seconds', c ->> 'shift_seconds', 'patience', private.rdin_patience(d.decor),
    'secs', (select jsonb_object_agg(k, private.rdin_secs(k, d.stations)) from unnest(v_menu) k)));
end $$;

/** close the shift: p_served = [{i, at}] (ms after opening). Each table pays its dishes (more for speed; the dish of
    the day double), using the ingredients you have. */
create or replace function public.diner_close(p_id uuid, p_shift uuid, p_served jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdin_owned(p_id); d public.realm_diners%rowtype := private.rdin_row(p_id); c jsonb := private.rdin_cfg(); s public.realm_diner_shifts%rowtype;
  v_pat numeric := private.rdin_patience(d.decor) * 1000; v_seen int[] := '{}'; v_last numeric := -1e9; v_wallet jsonb; v_need jsonb; e record; cu jsonb; v_min numeric; v_wait numeric;
  v_base numeric; v_tip numeric; v_tips numeric := 0; v_val numeric := 0; v_used jsonb := '{}'::jsonb; v_ok int := 0; v_dish text; v_max_at numeric := 0; v_lv int; v_ink int; v_stars int; v_count int; v_res jsonb;
begin
  perform private.rate_limit('diner_shift', 60, 3600);
  select * into s from public.realm_diner_shifts where id = p_shift and realm_id = r.id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.ended_at is not null then raise exception 'already_claimed' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_served, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_served, '[]'::jsonb)) > 200 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  perform private.rlm_player(r.owner_id, 'diner');
  select wallet into v_wallet from public.realm_players where player_id = r.owner_id and kind = 'diner' for update;
  v_count := jsonb_array_length(s.customers);
  -- you can't report a table served later than the shift has actually been running
  select coalesce(max((x ->> 'at')::numeric), 0) into v_max_at from jsonb_array_elements(coalesce(p_served, '[]'::jsonb)) x;
  if v_max_at / 1000 > extract(epoch from now() - s.started_at) + 3 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  for e in select (x ->> 'i')::int i, (x ->> 'at')::numeric at from jsonb_array_elements(coalesce(p_served, '[]'::jsonb)) x order by (x ->> 'at')::numeric loop
    if e.i is null or e.at is null or e.i < 0 or e.i >= v_count or e.i = any(v_seen) then continue; end if;
    -- two tables served in the same instant isn't possible
    if e.at - v_last < 350 then continue; end if;
    cu := s.customers -> e.i;
    select coalesce(max(private.rdin_secs(x, d.stations)), 0) * 1000 into v_min from jsonb_array_elements_text(cu -> 'order') x;
    v_wait := e.at - (cu ->> 'at')::numeric;
    if v_wait < v_min - 250 or v_wait > v_pat + 1500 or e.at > (c ->> 'shift_seconds')::numeric * 1000 + 60000 then continue; end if;
    -- the ingredients for this table
    v_need := '{}'::jsonb;
    for v_dish in select jsonb_array_elements_text(cu -> 'order') loop v_need := private.jadd(v_need, c -> 'dishes' -> v_dish -> 'in'); end loop;
    if not private.jcovers(v_wallet, v_need) then continue; end if;
    v_wallet := private.jadd(v_wallet, v_need, -1); v_used := private.jadd(v_used, v_need);
    v_base := 0;
    for v_dish in select jsonb_array_elements_text(cu -> 'order') loop
      v_base := v_base + (c -> 'dishes' -> v_dish ->> 'price')::numeric * case when v_dish = s.special then (c ->> 'special_mult')::numeric else 1 end;
    end loop;
    -- speedy service: up to +50% on top
    v_tip := v_base * (1 + 0.5 * greatest(0, 1 - v_wait / v_pat)) * (1 + d.decor * (c -> 'decor' ->> 'tip_bonus')::numeric);
    v_tips := v_tips + v_tip; v_val := v_val + v_base; v_ok := v_ok + 1; v_seen := v_seen || e.i; v_last := e.at;
  end loop;
  v_tips := floor(v_tips);
  v_stars := case when v_count = 0 then 0 when v_ok::numeric / v_count >= 0.95 then 3 when v_ok::numeric / v_count >= 0.75 then 2 when v_ok::numeric / v_count >= 0.45 then 1 else 0 end;
  update public.realm_players set wallet = private.jadd(private.jadd(wallet, v_used, -1), jsonb_build_object('tips', v_tips)),
    lifetime = private.jadd(lifetime, jsonb_build_object('tips', v_tips)) where player_id = r.owner_id and kind = 'diner';
  update public.realm_diners set shifts = shifts + 1, served = served + v_ok, best_tips = greatest(best_tips, v_tips::int) where realm_id = r.id;
  v_ink := private.rlm_pay(r.owner_id, 'diner', floor(v_tips / (c ->> 'ink_per_tips')::numeric)::int + v_stars, r.id::text, 'diner-shift:' || s.id);
  v_lv := private.rlm_xp(r.id, ceil(v_tips * (c ->> 'xp_per_tip')::numeric + v_ok * 2)::bigint);
  v_res := jsonb_build_object('served', v_ok, 'customers', v_count, 'tips', v_tips, 'stars', v_stars, 'used', v_used, 'ink', v_ink, 'best', v_tips > d.best_tips);
  update public.realm_diner_shifts set ended_at = now(), result = v_res where id = s.id;
  return private.rdin_out(r.id, r.owner_id, jsonb_build_object('result', v_res, 'level_up', v_lv));
end $$;

/** upgrades: a station (or a second one), a station's speed, a table, the decor, the night crew */
create or replace function public.diner_buy(p_id uuid, p_what text, p_arg text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdin_owned(p_id); d public.realm_diners%rowtype := private.rdin_row(p_id); c jsonb := private.rdin_cfg(); v_lv int := private.rlm_lv(r.xp);
  st jsonb; v_n int; v_sp int; v_cost int; v_got int := 0;
begin
  perform private.rate_limit('diner_act', 600, 3600);
  if p_what = 'station' then
    st := c -> 'stations' -> p_arg; if st is null then raise exception 'not_found' using errcode = 'P0001'; end if;
    if v_lv < (st ->> 'level')::int then raise exception 'level_too_low' using errcode = 'P0001'; end if;
    v_n := coalesce((d.stations -> p_arg ->> 'n')::int, 0);
    if v_n >= jsonb_array_length(st -> 'cost') then raise exception 'maxed' using errcode = 'P0001'; end if;
    v_cost := (st -> 'cost' ->> v_n)::int;
    perform private.rdin_spend(r.owner_id, v_cost);
    update public.realm_diners set stations = jsonb_set(stations, array[p_arg], jsonb_build_object('n', v_n + 1, 'speed', coalesce((stations -> p_arg ->> 'speed')::int, 0))) where realm_id = r.id;
  elsif p_what = 'speed' then
    st := c -> 'stations' -> p_arg; v_n := coalesce((d.stations -> p_arg ->> 'n')::int, 0);
    if st is null or v_n = 0 then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_sp := coalesce((d.stations -> p_arg ->> 'speed')::int, 0);
    if v_sp >= (c ->> 'speed_max')::int then raise exception 'maxed' using errcode = 'P0001'; end if;
    v_cost := (st ->> 'speed_cost')::int * (v_sp + 1) * (v_sp + 1);
    perform private.rdin_spend(r.owner_id, v_cost);
    update public.realm_diners set stations = jsonb_set(stations, array[p_arg, 'speed'], to_jsonb(v_sp + 1)) where realm_id = r.id;
  elsif p_what = 'table' then
    if d.tables >= (c -> 'tables' ->> 'max')::int then raise exception 'maxed' using errcode = 'P0001'; end if;
    v_cost := (c -> 'tables' -> 'cost' ->> d.tables)::int;
    perform private.rdin_spend(r.owner_id, v_cost);
    update public.realm_diners set tables = tables + 1 where realm_id = r.id;
  elsif p_what = 'decor' then
    if d.decor + 1 >= jsonb_array_length(c -> 'decor' -> 'cost') then raise exception 'maxed' using errcode = 'P0001'; end if;
    v_cost := (c -> 'decor' -> 'cost' ->> (d.decor + 1))::int;
    perform private.rdin_spend(r.owner_id, v_cost);
    update public.realm_diners set decor = decor + 1 where realm_id = r.id;
  elsif p_what = 'crew' then
    if d.crew + 1 >= jsonb_array_length(c -> 'crew' -> 'cost') then raise exception 'maxed' using errcode = 'P0001'; end if;
    v_cost := (c -> 'crew' -> 'cost' ->> (d.crew + 1))::int;
    -- pay out what the old crew earned first
    v_got := private.rdin_crew_pending(d);
    perform private.rdin_spend(r.owner_id, v_cost);
    update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('tips', v_got)) where player_id = r.owner_id and kind = 'diner';
    update public.realm_diners set crew = crew + 1, crew_at = now() where realm_id = r.id;
  else raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.rdin_out(r.id, r.owner_id, jsonb_build_object('level_up', private.rlm_xp(r.id, 5 + v_cost / 30)));
end $$;

/** the tip jar: what the night crew made while you were away */
create or replace function public.diner_jar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdin_owned(p_id); d public.realm_diners%rowtype := private.rdin_row(p_id); v_got int := private.rdin_crew_pending(d); v_ink int := 0;
begin
  perform private.rate_limit('diner_act', 600, 3600);
  if v_got > 0 then
    perform private.rlm_player(r.owner_id, 'diner');
    update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('tips', v_got)), lifetime = private.jadd(lifetime, jsonb_build_object('tips', v_got)) where player_id = r.owner_id and kind = 'diner';
    update public.realm_diners set crew_at = now() where realm_id = r.id;
    v_ink := private.rlm_pay(r.owner_id, 'diner', floor(v_got / ((private.rdin_cfg() ->> 'ink_per_tips')::numeric * 2))::int, r.id::text, 'diner-jar:' || r.id || ':' || extract(epoch from now())::bigint);
  end if;
  return private.rdin_out(r.id, r.owner_id, jsonb_build_object('got', jsonb_build_object('tips', v_got), 'ink', v_ink, 'level_up', case when v_got > 0 then private.rlm_xp(r.id, ceil(v_got * 0.1)::bigint) end));
end $$;

/** the pantry: buy ingredients with tips (and a free delivery once a day) */
create or replace function public.diner_pantry(p_id uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdin_owned(p_id); d public.realm_diners%rowtype := private.rdin_row(p_id); c jsonb := private.rdin_cfg(); v_lv int := private.rlm_lv(r.xp);
  e record; v_cost numeric := 0; v_add jsonb := '{}'::jsonb; v_free boolean := false;
begin
  perform private.rate_limit('diner_act', 600, 3600);
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if p_items ? '_free' then
    if d.pantry_day = current_date then raise exception 'already_claimed' using errcode = 'P0001'; end if;
    v_add := c -> 'pantry_free'; v_free := true;
    update public.realm_diners set pantry_day = current_date where realm_id = r.id;
  else
    for e in select key, value::numeric n from jsonb_each_text(p_items) loop
      if c -> 'pantry' -> e.key is null or e.n <> floor(e.n) or e.n < 1 or e.n > 500 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
      if v_lv < coalesce((private.rlm_cfg('diner') -> 'resources' -> e.key ->> 'level')::int, 1) then raise exception 'level_too_low' using errcode = 'P0001'; end if;
      v_cost := v_cost + e.n * (c -> 'pantry' ->> e.key)::numeric; v_add := v_add || jsonb_build_object(e.key, e.n);
    end loop;
    perform private.rdin_spend(r.owner_id, ceil(v_cost)::int);
  end if;
  perform private.rlm_player(r.owner_id, 'diner');
  update public.realm_players set wallet = private.jadd(wallet, v_add) where player_id = r.owner_id and kind = 'diner';
  return private.rdin_out(r.id, r.owner_id, jsonb_build_object('got', v_add, 'free', v_free));
end $$;

-- a second minigame for the restaurant: Burger Stack
update public.game_config set value = jsonb_set(value, '{kinds,diner,games,stack}',
  (value -> 'kinds' -> 'diner' -> 'games' -> 'orders') || jsonb_build_object('name', 'Burger Stack', 'emoji', '🍔', 'blurb', 'Slide the plate to catch what the ticket asks for, in order. A wrong catch and the tower wobbles!', 'level', 3))
 where key = 'realms' and value -> 'kinds' -> 'diner' -> 'games' ? 'orders' and not (value -> 'kinds' -> 'diner' -> 'games' ? 'stack');

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and p.proname like 'rdin\_%') or (n.nspname = 'public' and p.proname like 'diner\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
