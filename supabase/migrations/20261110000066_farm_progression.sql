-- v0.48 Farm progression. Your farming has a level (XP from planting, harvesting, selling, cooking,
-- orders and farm games), every level takes a little more than the last, and the farm grows with you:
--   * crops unlock by level (carrots and lettuce at 1 … golden melons at 10)
--   * Farm Coins 🪙 from everything you sell (Ink is still capped a day; coins aren't)
--   * upgrades bought with coins, each dearer than the last: sprinklers (auto-water), fertilizer (faster),
--     green thumb (bigger harvests), golden touch (more golden crops), market stall (better prices), bigger barn (+beds)
--   * buildings that produce while you're away: chicken coop (eggs), beehive (honey), dairy barn (milk)
--   * a windmill (corn → flour) and a kitchen: recipes that combine produce into dishes worth far more
--   * an orders board: customers want mixes of produce and dishes, for coins, XP and Ink
--   * daily chores: a calm to-do list (feed the hens, mend the fence, water some beds…) for a little Ink
--   * two new farm games that bring it together: Recipe Rush (cook orders against the clock) and
--     Pollinator (fly a bee through the flowers back to the hive)

update public.game_config set value = value || '{
  "progression": {
    "level_base": 40, "level_pow": 1.55, "max_level": 60,
    "xp": {"plant": 1, "harvest_item": 2, "per_coin_sold": 0.25, "craft": 3, "collect": 1, "game_per_points": 12},
    "crop_levels": {"carrot": 1, "lettuce": 1, "strawberry": 2, "sunflower": 3, "tomato": 3, "corn": 5, "pumpkin": 7, "melon": 10},
    "level_coins": 25, "price_per_level": 0.02
  },
  "upgrades": {
    "sprinkler":    {"name": "Sprinklers",    "emoji": "💦", "desc": "New plantings get watered for you (10% a level)", "level": 2, "base": 40,  "growth": 1.65, "max": 10},
    "market_stall": {"name": "Market stall",  "emoji": "🏪", "desc": "+10% coins for everything you sell, a level",   "level": 2, "base": 50,  "growth": 1.6,  "max": 10},
    "fertilizer":   {"name": "Fertilizer",    "emoji": "🧪", "desc": "Crops grow 6% faster, a level",                  "level": 3, "base": 70,  "growth": 1.7,  "max": 10},
    "green_thumb":  {"name": "Green thumb",   "emoji": "👍", "desc": "+10% chance of an extra crop per plant, a level", "level": 4, "base": 90,  "growth": 1.7,  "max": 10},
    "barn":         {"name": "Bigger barn",   "emoji": "🏚️", "desc": "+2 beds on every farm of yours, a level",       "level": 5, "base": 150, "growth": 1.9,  "max": 8},
    "golden_touch": {"name": "Golden touch",  "emoji": "✨", "desc": "+1% golden harvests, a level",                    "level": 6, "base": 160, "growth": 1.8,  "max": 10}
  },
  "buildings": {
    "coop":    {"name": "Chicken coop", "emoji": "🐔", "item": "egg",   "level": 2, "build": 60,  "minutes": 15, "cap": 6, "upgrade": 120, "growth": 1.8, "max": 6},
    "hive":    {"name": "Beehive",      "emoji": "🐝", "item": "honey", "level": 4, "build": 180, "minutes": 35, "cap": 4, "upgrade": 260, "growth": 1.8, "max": 6},
    "mill":    {"name": "Windmill",     "emoji": "🌬️", "level": 5, "build": 300, "upgrade": 400, "growth": 2, "max": 3},
    "kitchen": {"name": "Kitchen",      "emoji": "🍳", "level": 6, "build": 450, "upgrade": 600, "growth": 2, "max": 3},
    "dairy":   {"name": "Dairy barn",   "emoji": "🐄", "item": "milk",  "level": 8, "build": 700, "minutes": 50, "cap": 4, "upgrade": 900, "growth": 1.8, "max": 6}
  },
  "products": {
    "egg":   {"name": "Egg",   "emoji": "🥚", "sell": 3},
    "honey": {"name": "Honey", "emoji": "🍯", "sell": 7},
    "milk":  {"name": "Milk",  "emoji": "🥛", "sell": 9}
  },
  "recipes": {
    "flour":       {"name": "Flour",          "emoji": "🌾", "building": "mill",    "needs": {"corn": 2},                                          "makes": 2, "sell": 5},
    "salad":       {"name": "Garden salad",   "emoji": "🥗", "building": "kitchen", "needs": {"lettuce": 2, "tomato": 1},                          "makes": 1, "sell": 16},
    "omelette":    {"name": "Omelette",       "emoji": "🍳", "building": "kitchen", "needs": {"egg": 2, "tomato": 1},                              "makes": 1, "sell": 16},
    "honey_toast": {"name": "Honey toast",    "emoji": "🍞", "building": "kitchen", "needs": {"honey": 1, "flour": 1},                             "makes": 1, "sell": 18},
    "jam":         {"name": "Strawberry jam", "emoji": "🫙", "building": "kitchen", "needs": {"strawberry": 3, "honey": 1},                        "makes": 1, "sell": 26},
    "carrot_cake": {"name": "Carrot cake",    "emoji": "🍰", "building": "kitchen", "needs": {"carrot": 3, "egg": 2, "flour": 1},                  "makes": 1, "sell": 34},
    "pumpkin_pie": {"name": "Pumpkin pie",    "emoji": "🥧", "building": "kitchen", "needs": {"pumpkin": 1, "egg": 1, "flour": 1, "milk": 1},      "makes": 1, "sell": 70},
    "smoothie":    {"name": "Melon smoothie", "emoji": "🥤", "building": "kitchen", "needs": {"melon": 1, "honey": 1, "strawberry": 2, "milk": 1}, "makes": 1, "sell": 140}
  },
  "orders": {"slots": 3, "per_day": 15, "wait_minutes": 8, "coin_mult": 1.7, "ink": [3, 12]}
}'::jsonb where key = 'farm' and not value ? 'progression';

-- the daily chores: five a day from this list, each a little Ink, and a bonus for the lot
update public.game_config set value = value || '{
  "chores": {
    "per_day": 5, "bonus_ink": 10, "bonus_coins": 30,
    "list": {
      "feed_hens":   {"name": "Scatter corn for the hens",  "emoji": "🐔", "kind": "tap", "seconds": 4, "ink": 4},
      "pet_dog":     {"name": "Give the farm dog a pat",    "emoji": "🐕", "kind": "tap", "seconds": 3, "ink": 3},
      "fence":       {"name": "Mend a fence post",          "emoji": "🪵", "kind": "tap", "seconds": 5, "ink": 4},
      "trough":      {"name": "Fill the water trough",      "emoji": "🪣", "kind": "tap", "seconds": 4, "ink": 4},
      "wildflowers": {"name": "Pick wildflowers by the pond","emoji": "🌼", "kind": "tap", "seconds": 4, "ink": 3},
      "sweep":       {"name": "Sweep out the barn",         "emoji": "🧹", "kind": "tap", "seconds": 5, "ink": 4},
      "sunset":      {"name": "Sit on the porch a moment",  "emoji": "🌅", "kind": "tap", "seconds": 6, "ink": 3},
      "plant":       {"name": "Plant 6 beds",               "emoji": "🌱", "kind": "count", "metric": "plant",   "target": 6,  "ink": 5},
      "water":       {"name": "Water 4 growing beds",       "emoji": "💧", "kind": "count", "metric": "water",   "target": 4,  "ink": 5},
      "harvest":     {"name": "Harvest 20 crops",           "emoji": "🧺", "kind": "count", "metric": "harvest", "target": 20, "ink": 6},
      "market":      {"name": "Sell something at market",   "emoji": "🏪", "kind": "count", "metric": "sell",    "target": 1,  "ink": 4},
      "collect":     {"name": "Collect from a building",    "emoji": "🥚", "kind": "count", "metric": "collect", "target": 1,  "ink": 4, "needs_building": true},
      "order":       {"name": "Deliver an order",           "emoji": "📋", "kind": "count", "metric": "order",   "target": 1,  "ink": 6},
      "cook":        {"name": "Cook or mill something",     "emoji": "🍳", "kind": "count", "metric": "craft",   "target": 1,  "ink": 5, "needs_building": true},
      "tractor":     {"name": "Plant or harvest 5 beds by tractor", "emoji": "🚜", "kind": "count", "metric": "tractor", "target": 5, "ink": 5}
    }
  }
}'::jsonb where key = 'farm' and not value ? 'chores';

-- the two new games
update public.game_config set value = jsonb_set(value, '{games}', (value -> 'games') || '{
  "recipe_rush": {"name": "Recipe Rush", "emoji": "👩‍🍳", "dim": "2d", "seconds": 50, "max_score": 300, "points_per_ink": 12, "max_ink": 22},
  "pollinator":  {"name": "Pollinator",  "emoji": "🐝", "dim": "3d", "seconds": 45, "max_score": 260, "points_per_ink": 10, "max_ink": 22}
}'::jsonb) where key = 'farm' and not (value -> 'games') ? 'recipe_rush';

create table if not exists public.farm_progress (
  player_id uuid primary key references public.players (id) on delete cascade,
  xp numeric not null default 0,
  coins numeric not null default 0,
  upgrades jsonb not null default '{}'::jsonb,     -- {"sprinkler": 2, ...}
  buildings jsonb not null default '{}'::jsonb,    -- {"coop": {"lvl": 1, "at": "<last collected>"}, ...}
  orders_day timestamptz, orders_done int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.farm_progress enable row level security;
revoke all on public.farm_progress from anon, authenticated;

create table if not exists public.farm_orders (
  player_id uuid not null references public.players (id) on delete cascade,
  slot int not null,
  wants jsonb not null,            -- {"carrot": 6, "salad": 1}
  coins int not null, xp int not null, ink int not null,
  available_at timestamptz not null default now(),
  primary key (player_id, slot)
);
alter table public.farm_orders enable row level security;
revoke all on public.farm_orders from anon, authenticated;

create table if not exists public.farm_chores (
  player_id uuid not null references public.players (id) on delete cascade,
  day timestamptz not null,
  key text not null,
  progress int not null default 0,
  claimed_at timestamptz,
  primary key (player_id, day, key)
);
alter table public.farm_chores enable row level security;
revoke all on public.farm_chores from anon, authenticated;

-- ---- daily chores ----------------------------------------------------------------------------------------
/** Today's chores for a player (picked the same way all day, from the ones they can do). */
create or replace function private.farm_chores_pick(p_uid uuid) returns void language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); c jsonb := private.farm_cfg() -> 'chores'; v_has_b boolean;
begin
  if exists (select 1 from public.farm_chores where player_id = p_uid and day = v_day) then return; end if;
  v_has_b := exists (select 1 from public.farm_progress where player_id = p_uid and buildings <> '{}'::jsonb);
  -- three calm tap chores and two farming ones, a different mix each day
  insert into public.farm_chores (player_id, day, key)
  select p_uid, v_day, key from (
    (select key from jsonb_each(c -> 'list') where value ->> 'kind' = 'tap' order by md5(p_uid::text || v_day::text || key) limit 3)
    union all
    (select key from jsonb_each(c -> 'list') where value ->> 'kind' = 'count' and (v_has_b or not coalesce((value ->> 'needs_building')::boolean, false))
      order by md5(p_uid::text || v_day::text || key) limit greatest(0, coalesce((c ->> 'per_day')::int, 5) - 3))
  ) x on conflict do nothing;
end $$;
/** Count farming towards today's chores. */
create or replace function private.farm_chore_bump(p_uid uuid, p_metric text, p_n int) returns void language plpgsql as $$
begin
  if coalesce(p_n, 0) <= 0 then return; end if;
  perform private.farm_chores_pick(p_uid);
  update public.farm_chores ch set progress = progress + p_n
   where ch.player_id = p_uid and ch.day = private.day_start(now()) and ch.claimed_at is null
     and private.farm_cfg() -> 'chores' -> 'list' -> ch.key ->> 'metric' = p_metric;
end $$;
create or replace function private.farm_chores_json(p_uid uuid) returns jsonb language plpgsql as $$
declare c jsonb := private.farm_cfg() -> 'chores';
begin
  perform private.farm_chores_pick(p_uid);
  return jsonb_build_object('list', coalesce((select jsonb_agg((c -> 'list' -> ch.key) || jsonb_build_object('key', ch.key, 'progress', ch.progress, 'done', ch.claimed_at is not null,
           'ready', ch.claimed_at is null and (c -> 'list' -> ch.key ->> 'kind' = 'tap' or ch.progress >= coalesce((c -> 'list' -> ch.key ->> 'target')::int, 1)))
         order by (c -> 'list' -> ch.key ->> 'kind') desc, ch.key)
       from public.farm_chores ch where ch.player_id = p_uid and ch.day = private.day_start(now())), '[]'::jsonb),
    'bonus_ink', coalesce((c ->> 'bonus_ink')::int, 10), 'bonus_coins', coalesce((c ->> 'bonus_coins')::int, 30),
    'resets_at', private.day_start(now()) + interval '1 day');
end $$;

/** Tick off a chore: tap chores just get done, farming ones once you've done enough. All done = a bonus. */
create or replace function public.farm_chore_claim(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.farm_cfg() -> 'chores'; ch public.farm_chores%rowtype; d jsonb; v_day timestamptz := private.day_start(now());
  v_ink int; v_bonus boolean := false;
begin
  perform private.rate_limit('farm_chore', 60, 3600);
  perform private.farm_chores_pick(v_uid);
  select * into ch from public.farm_chores where player_id = v_uid and day = v_day and key = p_key for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if ch.claimed_at is not null then raise exception 'already_done' using errcode = 'P0001'; end if;
  d := c -> 'list' -> p_key;
  if d ->> 'kind' <> 'tap' and ch.progress < coalesce((d ->> 'target')::int, 1) then raise exception 'not_done_yet' using errcode = 'P0001'; end if;
  update public.farm_chores set claimed_at = now(), progress = greatest(progress, coalesce((d ->> 'target')::int, 1)) where player_id = v_uid and day = v_day and key = p_key;
  v_ink := coalesce((d ->> 'ink')::int, 3);
  perform private.grant(v_uid, jsonb_build_object('ink', v_ink), 'farm', 'chore', p_key, 'farm-chore:' || v_uid || ':' || v_day::date || ':' || p_key);
  perform private.farm_add_xp(v_uid, 5);
  if not exists (select 1 from public.farm_chores where player_id = v_uid and day = v_day and claimed_at is null) then
    v_bonus := true;
    perform private.grant(v_uid, jsonb_build_object('ink', coalesce((c ->> 'bonus_ink')::int, 10)), 'farm', 'chore', 'all', 'farm-chore:' || v_uid || ':' || v_day::date || ':all');
    perform private.farm_add_coins(v_uid, coalesce((c ->> 'bonus_coins')::int, 30));
  end if;
  return jsonb_build_object('chores', private.farm_chores_json(v_uid), 'paid', v_ink, 'all_done', v_bonus, 'balances', private.balances(v_uid));
end $$;

/** The tractor: count beds it planted or harvested (the actions themselves are the normal ones). */
create or replace function public.farm_tractor_tally(p_beds int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('farm_tractor', 200, 3600);
  perform private.farm_chore_bump(v_uid, 'tractor', least(20, greatest(0, coalesce(p_beds, 0))));
  return private.farm_chores_json(v_uid);
end $$;

-- ---- levels ------------------------------------------------------------------------------------------
/** Total XP needed to reach a level (level 1 = 0). */
create or replace function private.farm_level_xp(p_level int) returns numeric language sql immutable as $$
  select case when p_level <= 1 then 0 else round(40 * power(p_level - 1, 1.55) + 10 * (p_level - 1)) end
$$;
create or replace function private.farm_level_of(p_xp numeric) returns int language sql immutable as $$
  select coalesce(max(n), 1) from generate_series(1, 60) n where private.farm_level_xp(n) <= coalesce(p_xp, 0)
$$;
create or replace function private.farm_prog(p_uid uuid) returns public.farm_progress language plpgsql as $$
declare r public.farm_progress%rowtype;
begin
  insert into public.farm_progress (player_id) values (p_uid) on conflict do nothing;
  select * into r from public.farm_progress where player_id = p_uid for update;
  return r;
end $$;
create or replace function private.farm_up(p_uid uuid, p_key text) returns int language sql stable as $$
  select coalesce((select (upgrades ->> p_key)::int from public.farm_progress where player_id = p_uid), 0)
$$;
create or replace function private.farm_level(p_uid uuid) returns int language sql stable as $$
  select private.farm_level_of((select xp from public.farm_progress where player_id = p_uid))
$$;
/** Add XP; level-ups pay coins. Returns the levels gained. */
create or replace function private.farm_add_xp(p_uid uuid, p_xp numeric) returns int language plpgsql as $$
declare r public.farm_progress%rowtype; v_before int; v_after int;
begin
  if coalesce(p_xp, 0) <= 0 then return 0; end if;
  r := private.farm_prog(p_uid);
  v_before := private.farm_level_of(r.xp);
  v_after := private.farm_level_of(r.xp + p_xp);
  update public.farm_progress set xp = xp + p_xp,
         coins = coins + case when v_after > v_before then (select sum(n * coalesce((private.farm_cfg() -> 'progression' ->> 'level_coins')::int, 25)) from generate_series(v_before + 1, v_after) n) else 0 end,
         updated_at = now()
   where player_id = p_uid;
  return v_after - v_before;
end $$;
create or replace function private.farm_add_coins(p_uid uuid, p_coins numeric) returns void language plpgsql as $$
begin
  perform private.farm_prog(p_uid);
  update public.farm_progress set coins = greatest(0, coins + p_coins), updated_at = now() where player_id = p_uid;
end $$;
create or replace function private.farm_give(p_uid uuid, p_item text, p_n int) returns void language plpgsql as $$
begin
  if coalesce(p_n, 0) <= 0 then return; end if;
  insert into public.farm_items (player_id, item, qty) values (p_uid, p_item, p_n) on conflict (player_id, item) do update set qty = farm_items.qty + excluded.qty;
end $$;
/** What one of anything sells for (crops, golden crops, products, dishes), before the market stall. */
create or replace function private.farm_value(p_item text) returns numeric language sql stable as $$
  select coalesce(
    (private.farm_cfg() -> 'crops' -> regexp_replace(p_item, '^golden_', '') ->> 'sell')::numeric * case when p_item like 'golden_%' then coalesce((private.farm_cfg() ->> 'golden_mult')::numeric, 5) else 1 end,
    (private.farm_cfg() -> 'products' -> p_item ->> 'sell')::numeric,
    (private.farm_cfg() -> 'recipes' -> p_item ->> 'sell')::numeric, 1)
$$;

/** Beds on a farm: by its plots, plus the owner's barn upgrades. */
create or replace function private.farm_beds_count(p_farm uuid) returns int language sql stable as $$
  select least(coalesce((private.farm_cfg() ->> 'beds_max')::int, 48) + 16,
               coalesce((private.farm_cfg() ->> 'beds_base')::int, 6) + coalesce((private.farm_cfg() ->> 'beds_per_plot')::int, 4) * greatest(0, coalesce(g.plot_count, 1) - 1)
               + 2 * private.farm_up(f.owner_id, 'barn'))
  from public.farms f left join public.canvas_groups g on g.id = f.group_id where f.id = p_farm
$$;

/** A building's state: level, and how much it has made since you last collected. */
create or replace function private.farm_building_json(p_uid uuid, p_key text) returns jsonb language sql stable as $$
  with b as (select private.farm_cfg() -> 'buildings' -> p_key c, (select buildings -> p_key from public.farm_progress where player_id = p_uid) s)
  select jsonb_build_object('key', p_key, 'lvl', coalesce((b.s ->> 'lvl')::int, 0),
    'ready', case when b.s is null or b.c ->> 'item' is null then 0 else least(
        coalesce((b.c ->> 'cap')::int, 4) * coalesce((b.s ->> 'lvl')::int, 1),
        floor(extract(epoch from now() - (b.s ->> 'at')::timestamptz) / 60 / ((b.c ->> 'minutes')::numeric / (1 + 0.25 * (coalesce((b.s ->> 'lvl')::int, 1) - 1)))))::int end,
    'every_min', case when b.c ->> 'item' is null or b.s is null then null else round((b.c ->> 'minutes')::numeric / (1 + 0.25 * (coalesce((b.s ->> 'lvl')::int, 1) - 1)), 1) end,
    'cap', case when b.c ->> 'item' is null then null else coalesce((b.c ->> 'cap')::int, 4) * greatest(1, coalesce((b.s ->> 'lvl')::int, 1)) end,
    'since', b.s ->> 'at')
  from b
$$;

create or replace function private.farm_upgrade_cost(p_key text, p_lvl int) returns int language sql stable as $$
  select round(coalesce((private.farm_cfg() -> 'upgrades' -> p_key ->> 'base')::numeric, 50) * power(coalesce((private.farm_cfg() -> 'upgrades' -> p_key ->> 'growth')::numeric, 1.7), p_lvl))::int
$$;
create or replace function private.farm_building_cost(p_key text, p_lvl int) returns int language sql stable as $$
  select case when p_lvl <= 0 then coalesce((private.farm_cfg() -> 'buildings' -> p_key ->> 'build')::int, 100)
    else round(coalesce((private.farm_cfg() -> 'buildings' -> p_key ->> 'upgrade')::numeric, 100) * power(coalesce((private.farm_cfg() -> 'buildings' -> p_key ->> 'growth')::numeric, 1.8), p_lvl - 1))::int end
$$;

-- ---- orders -------------------------------------------------------------------------------------------
/** A new order for a slot, sized to your level and made of things you can actually make. */
create or replace function private.farm_new_order(p_uid uuid, p_slot int, p_delay boolean) returns void language plpgsql as $$
declare cfg jsonb := private.farm_cfg(); v_lvl int := private.farm_level(p_uid); v_pool text[]; v_wants jsonb := '{}'::jsonb; v_kinds int; v_item text; v_q int; v_value numeric := 0; i int; k record;
begin
  -- what you can grow, collect or cook at your level
  select array_agg(key) into v_pool from (
    select key from jsonb_each_text(cfg -> 'progression' -> 'crop_levels') where value::int <= v_lvl
    union all select key from jsonb_each(cfg -> 'buildings') where value ->> 'item' is not null and coalesce((select (buildings -> key ->> 'lvl')::int from public.farm_progress where player_id = p_uid), 0) > 0
    union all select r.key from jsonb_each(cfg -> 'recipes') r where coalesce((select (buildings -> (r.value ->> 'building') ->> 'lvl')::int from public.farm_progress where player_id = p_uid), 0) > 0
  ) x;
  if v_pool is null then v_pool := array['carrot']; end if;
  v_kinds := least(cardinality(v_pool), 1 + floor(random() * least(3, 1 + v_lvl / 4.0))::int);
  for i in 1 .. v_kinds loop
    v_item := v_pool[1 + floor(random() * cardinality(v_pool))::int];
    v_q := greatest(1, round((2 + random() * 4 + v_lvl * 0.5) / greatest(1, sqrt(private.farm_value(v_item) / 3)))::int);
    v_wants := v_wants || jsonb_build_object(v_item, coalesce((v_wants ->> v_item)::int, 0) + v_q);
  end loop;
  for k in select key, value::int n from jsonb_each_text(v_wants) loop v_value := v_value + private.farm_value(k.key) * k.n; end loop;
  insert into public.farm_orders (player_id, slot, wants, coins, xp, ink, available_at)
  values (p_uid, p_slot, v_wants, ceil(v_value * coalesce((cfg -> 'orders' ->> 'coin_mult')::numeric, 1.7)), ceil(v_value * 0.8) + 5,
          coalesce((cfg -> 'orders' -> 'ink' ->> 0)::int, 3) + floor(random() * (coalesce((cfg -> 'orders' -> 'ink' ->> 1)::int, 12) - coalesce((cfg -> 'orders' -> 'ink' ->> 0)::int, 3) + 1))::int,
          now() + case when p_delay then make_interval(mins => coalesce((cfg -> 'orders' ->> 'wait_minutes')::int, 8)) else interval '0' end)
  on conflict (player_id, slot) do update set wants = excluded.wants, coins = excluded.coins, xp = excluded.xp, ink = excluded.ink, available_at = excluded.available_at;
end $$;
create or replace function private.farm_orders_json(p_uid uuid) returns jsonb language plpgsql as $$
declare i int; v_slots int := coalesce((private.farm_cfg() -> 'orders' ->> 'slots')::int, 3);
begin
  for i in 0 .. v_slots - 1 loop
    if not exists (select 1 from public.farm_orders where player_id = p_uid and slot = i) then perform private.farm_new_order(p_uid, i, false); end if;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('slot', o.slot, 'wants', o.wants, 'coins', o.coins, 'xp', o.xp, 'ink', o.ink, 'available_at', o.available_at, 'ready', o.available_at <= now(),
      'can_fill', not exists (select 1 from jsonb_each_text(o.wants) w where coalesce((select qty from public.farm_items fi where fi.player_id = p_uid and fi.item = w.key), 0) < w.value::int))
    order by o.slot) from public.farm_orders o where o.player_id = p_uid), '[]'::jsonb);
end $$;

/** Everything about your farming progress (for the farm screen). */
create or replace function private.farm_prog_json(p_uid uuid) returns jsonb language plpgsql as $$
declare r public.farm_progress%rowtype := private.farm_prog(p_uid); cfg jsonb := private.farm_cfg(); v_lvl int := private.farm_level_of(r.xp);
begin
  return jsonb_build_object(
    'level', v_lvl, 'xp', round(r.xp), 'level_xp', private.farm_level_xp(v_lvl), 'next_xp', private.farm_level_xp(v_lvl + 1),
    'coins', floor(r.coins), 'upgrades', r.upgrades,
    'upgrade_costs', (select jsonb_object_agg(key, private.farm_upgrade_cost(key, coalesce((r.upgrades ->> key)::int, 0))) from jsonb_each(cfg -> 'upgrades')),
    'buildings', (select jsonb_object_agg(key, private.farm_building_json(p_uid, key) || jsonb_build_object('cost', private.farm_building_cost(key, coalesce((r.buildings -> key ->> 'lvl')::int, 0)))) from jsonb_each(cfg -> 'buildings')),
    'orders', private.farm_orders_json(p_uid),
    'orders_left', greatest(0, coalesce((cfg -> 'orders' ->> 'per_day')::int, 15) - case when r.orders_day = private.day_start(now()) then r.orders_done else 0 end),
    'chores', private.farm_chores_json(p_uid));
end $$;

create or replace function private.farm_json(p_farm uuid, p_viewer uuid) returns jsonb language plpgsql as $$
declare f public.farms%rowtype; g public.canvas_groups%rowtype; v jsonb;
begin
  select * into f from public.farms where id = p_farm;
  select * into g from public.canvas_groups where id = f.group_id;
  v := jsonb_build_object(
    'id', f.id, 'group_id', f.group_id, 'seed', f.seed, 'name', coalesce(g.name, 'Farm'), 'plots', coalesce(g.plot_count, 1),
    'owner', private.profile_json(f.owner_id), 'mine', f.owner_id = p_viewer, 'harvests', f.harvests,
    'cells', coalesce((select jsonb_agg(jsonb_build_array(m.gx, m.gy) order by m.gy, m.gx) from public.canvas_group_members m where m.group_id = f.group_id), '[]'::jsonb),
    'beds_count', private.farm_beds_count(f.id),
    'beds', coalesce((select jsonb_agg(jsonb_build_object('idx', b.idx, 'crop', b.crop, 'planted_at', b.planted_at, 'ready_at', b.ready_at, 'watered', b.watered, 'ready', b.ready_at <= now()) order by b.idx)
                      from public.farm_beds b where b.farm_id = f.id), '[]'::jsonb),
    'items', case when f.owner_id = p_viewer then private.farm_items_json(p_viewer) else null end,
    'ink_today', case when f.owner_id = p_viewer then private.farm_ink_today(p_viewer) else null end,
    'owner_level', private.farm_level(f.owner_id),
    'buildings_built', (select coalesce(jsonb_agg(key), '[]'::jsonb) from jsonb_each(coalesce((select buildings from public.farm_progress where player_id = f.owner_id), '{}'::jsonb))),
    'config', private.farm_cfg(), 'server_time', now());
  if f.owner_id = p_viewer then v := v || jsonb_build_object('progress', private.farm_prog_json(p_viewer)); end if;
  return v;
end $$;

-- ---- the farm actions, now with progression --------------------------------------------------------------
create or replace function public.farm_plant(p_farm uuid, p_bed int, p_crop text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype; c jsonb := private.farm_cfg() -> 'crops' -> p_crop; v_seed int; v_mins numeric; v_water boolean;
  v_need int;
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  f := private.my_farm(p_farm, v_uid);
  if c is null then raise exception 'invalid_crop' using errcode = 'P0001'; end if;
  if p_bed is null or p_bed < 0 or p_bed >= private.farm_beds_count(f.id) then raise exception 'invalid_bed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.farm_beds where farm_id = f.id and idx = p_bed) then raise exception 'bed_taken' using errcode = 'P0001'; end if;
  v_need := coalesce((private.farm_cfg() -> 'progression' -> 'crop_levels' ->> p_crop)::int, 1);
  if private.farm_level(v_uid) < v_need then raise exception 'farm_level_needed' using errcode = 'P0001', detail = v_need::text; end if;
  v_seed := coalesce((c ->> 'seed')::int, 0);
  if v_seed > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_seed), 'farm_seed', 'farm', p_crop, 'seed:' || f.id || ':' || p_bed || ':' || gen_random_uuid()); end if;
  -- fertilizer grows it faster; sprinklers may water it straight away
  v_mins := coalesce((c ->> 'minutes')::numeric, 5) * greatest(0.3, 1 - 0.06 * private.farm_up(v_uid, 'fertilizer'));
  v_water := random() < 0.1 * private.farm_up(v_uid, 'sprinkler');
  if v_water then v_mins := v_mins * (1 - coalesce((private.farm_cfg() ->> 'water_speedup')::numeric, 0.4)); end if;
  insert into public.farm_beds (farm_id, idx, crop, ready_at, watered) values (f.id, p_bed, p_crop, now() + make_interval(secs => v_mins * 60), v_water);
  perform private.farm_add_xp(v_uid, coalesce((private.farm_cfg() -> 'progression' -> 'xp' ->> 'plant')::numeric, 1));
  perform private.farm_chore_bump(v_uid, 'plant', 1);
  return private.farm_json(f.id, v_uid) || jsonb_build_object('balances', private.balances(v_uid), 'sprinkled', v_water);
end $$;

create or replace function public.farm_harvest(p_farm uuid, p_bed int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype; b record; cfg jsonb := private.farm_cfg(); c jsonb; v_n int; v_got jsonb := '{}'::jsonb;
  v_item text; v_gold int := 0; v_beds int := 0; v_items int := 0; v_thumb int; v_touch int; v_lvl int; v_up int;
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  f := private.my_farm(p_farm, v_uid);
  v_thumb := private.farm_up(v_uid, 'green_thumb'); v_touch := private.farm_up(v_uid, 'golden_touch');
  for b in delete from public.farm_beds where farm_id = f.id and ready_at <= now() and (p_bed is null or idx = p_bed) returning * loop
    c := cfg -> 'crops' -> b.crop; v_beds := v_beds + 1;
    v_n := coalesce((c -> 'yield' ->> 0)::int, 1) + floor(random() * (coalesce((c -> 'yield' ->> 1)::int, 1) - coalesce((c -> 'yield' ->> 0)::int, 1) + 1))::int;
    if b.watered then v_n := v_n + 1; end if;
    if random() < 0.1 * v_thumb then v_n := v_n + 1 + floor(v_thumb / 4.0)::int; end if;
    v_item := b.crop;
    if random() < coalesce((cfg ->> 'golden_chance')::numeric, 0.06) + 0.01 * v_touch then v_item := 'golden_' || b.crop; v_gold := v_gold + 1; v_n := greatest(1, v_n / 2); end if;
    v_got := v_got || jsonb_build_object(v_item, coalesce((v_got ->> v_item)::int, 0) + v_n);
    v_items := v_items + v_n;
  end loop;
  if v_beds = 0 then raise exception 'not_ready' using errcode = 'P0001'; end if;
  for b in select key, value::int n from jsonb_each_text(v_got) loop perform private.farm_give(v_uid, b.key, b.n); end loop;
  update public.farms set harvests = harvests + v_beds where id = f.id;
  perform private.farm_chore_bump(v_uid, 'harvest', v_items);
  v_lvl := private.farm_level(v_uid);
  v_up := private.farm_add_xp(v_uid, v_items * coalesce((cfg -> 'progression' -> 'xp' ->> 'harvest_item')::numeric, 2));
  if v_gold > 0 and not exists (select 1 from public.feed_events where kind = 'harvest' and player_id = v_uid and created_at > now() - interval '1 hour') then
    insert into public.feed_events (kind, player_id, data) values ('harvest', v_uid, jsonb_build_object('farm', f.id, 'golden', v_gold, 'got', v_got));
  end if;
  return private.farm_json(f.id, v_uid) || jsonb_build_object('harvested', v_got, 'beds_harvested', v_beds, 'golden', v_gold, 'level_up', v_up, 'level', v_lvl + v_up);
end $$;

create or replace function public.farm_water(p_farm uuid, p_bed int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype; b public.farm_beds%rowtype;
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  f := private.my_farm(p_farm, v_uid);
  select * into b from public.farm_beds where farm_id = f.id and idx = p_bed for update;
  if not found then raise exception 'bed_empty' using errcode = 'P0001'; end if;
  if b.watered or b.ready_at <= now() then return private.farm_json(f.id, v_uid); end if;
  update public.farm_beds set watered = true,
         ready_at = now() + (ready_at - now()) * (1 - coalesce((private.farm_cfg() ->> 'water_speedup')::numeric, 0.4))
   where farm_id = f.id and idx = p_bed;
  perform private.farm_chore_bump(v_uid, 'water', 1);
  return private.farm_json(f.id, v_uid);
end $$;

/** Sell at the market: coins for everything (better with the market stall and your level), and Ink until the day's cap. */
create or replace function public.farm_sell(p_item text, p_qty int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.farm_cfg(); v_have bigint; v_qty int := greatest(0, coalesce(p_qty, 0));
  v_value numeric; v_coins numeric; v_paid int; v_up int; v_ink_cap_left int;
begin
  perform private.rate_limit('farm_sell', 600, 3600);
  if v_qty = 0 or (cfg -> 'crops' -> regexp_replace(p_item, '^golden_', '') is null and cfg -> 'products' -> p_item is null and cfg -> 'recipes' -> p_item is null) then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  select qty into v_have from public.farm_items where player_id = v_uid and item = p_item for update;
  if coalesce(v_have, 0) < v_qty then raise exception 'not_enough_produce' using errcode = 'P0001'; end if;
  update public.farm_items set qty = qty - v_qty where player_id = v_uid and item = p_item;
  v_value := private.farm_value(p_item) * v_qty;
  v_coins := v_value * (1 + 0.1 * private.farm_up(v_uid, 'market_stall') + coalesce((cfg -> 'progression' ->> 'price_per_level')::numeric, 0.02) * (private.farm_level(v_uid) - 1));
  perform private.farm_add_coins(v_uid, v_coins);
  v_ink_cap_left := greatest(0, coalesce((cfg ->> 'daily_cap')::int, 120) - private.farm_ink_today(v_uid));
  v_paid := private.farm_pay(v_uid, least(v_ink_cap_left, ceil(v_value)::int), 'sell:' || p_item, 'farm-sell:' || v_uid || ':' || gen_random_uuid());
  v_up := private.farm_add_xp(v_uid, v_coins * coalesce((cfg -> 'progression' -> 'xp' ->> 'per_coin_sold')::numeric, 0.25));
  perform private.farm_chore_bump(v_uid, 'sell', 1);
  return jsonb_build_object('sold', v_qty, 'item', p_item, 'paid', v_paid, 'coins', floor(v_coins), 'items', private.farm_items_json(v_uid), 'ink_today', private.farm_ink_today(v_uid),
    'daily_cap', coalesce((cfg ->> 'daily_cap')::int, 120), 'level_up', v_up, 'progress', private.farm_prog_json(v_uid), 'balances', private.balances(v_uid));
end $$;

/** Buy the next level of an upgrade with Farm Coins. */
create or replace function public.farm_upgrade(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); u jsonb := private.farm_cfg() -> 'upgrades' -> p_key; r public.farm_progress%rowtype; v_lvl int; v_cost int;
begin
  if u is null then raise exception 'invalid_upgrade' using errcode = 'P0001'; end if;
  r := private.farm_prog(v_uid);
  if private.farm_level_of(r.xp) < coalesce((u ->> 'level')::int, 1) then raise exception 'farm_level_needed' using errcode = 'P0001', detail = (u ->> 'level'); end if;
  v_lvl := coalesce((r.upgrades ->> p_key)::int, 0);
  if v_lvl >= coalesce((u ->> 'max')::int, 10) then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := private.farm_upgrade_cost(p_key, v_lvl);
  if r.coins < v_cost then raise exception 'not_enough_coins' using errcode = 'P0001', detail = v_cost::text; end if;
  update public.farm_progress set coins = coins - v_cost, upgrades = upgrades || jsonb_build_object(p_key, v_lvl + 1), updated_at = now() where player_id = v_uid;
  return private.farm_prog_json(v_uid) || jsonb_build_object('bought', p_key, 'to', v_lvl + 1, 'spent', v_cost);
end $$;

/** Build a building, or upgrade it (more made, faster). Collects what it had made first. */
create or replace function public.farm_build(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b jsonb := private.farm_cfg() -> 'buildings' -> p_key; r public.farm_progress%rowtype; v_lvl int; v_cost int;
begin
  if b is null then raise exception 'invalid_building' using errcode = 'P0001'; end if;
  r := private.farm_prog(v_uid);
  if private.farm_level_of(r.xp) < coalesce((b ->> 'level')::int, 1) then raise exception 'farm_level_needed' using errcode = 'P0001', detail = (b ->> 'level'); end if;
  v_lvl := coalesce((r.buildings -> p_key ->> 'lvl')::int, 0);
  if v_lvl >= coalesce((b ->> 'max')::int, 5) then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := private.farm_building_cost(p_key, v_lvl);
  if r.coins < v_cost then raise exception 'not_enough_coins' using errcode = 'P0001', detail = v_cost::text; end if;
  if v_lvl > 0 and b ->> 'item' is not null then perform public.farm_collect(p_key); end if;
  update public.farm_progress set coins = coins - v_cost,
         buildings = buildings || jsonb_build_object(p_key, jsonb_build_object('lvl', v_lvl + 1, 'at', now())), updated_at = now()
   where player_id = v_uid;
  perform private.farm_add_xp(v_uid, 10 * (v_lvl + 1));
  return private.farm_prog_json(v_uid) || jsonb_build_object('built', p_key, 'to', v_lvl + 1, 'spent', v_cost);
end $$;

/** Collect what a coop, hive or dairy has made. */
create or replace function public.farm_collect(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b jsonb := private.farm_cfg() -> 'buildings' -> p_key; s jsonb; v_n int; v_every numeric;
begin
  if b is null or b ->> 'item' is null then raise exception 'invalid_building' using errcode = 'P0001'; end if;
  perform private.farm_prog(v_uid);
  s := private.farm_building_json(v_uid, p_key);
  if coalesce((s ->> 'lvl')::int, 0) = 0 then raise exception 'not_built' using errcode = 'P0001'; end if;
  v_n := (s ->> 'ready')::int; v_every := (s ->> 'every_min')::numeric;
  if v_n > 0 then
    perform private.farm_give(v_uid, b ->> 'item', v_n);
    -- the clock keeps any part-made one; a full building starts again from now
    update public.farm_progress set buildings = jsonb_set(buildings, array[p_key, 'at'], to_jsonb(
        case when v_n >= (s ->> 'cap')::int then now() else (s ->> 'since')::timestamptz + make_interval(secs => v_n * v_every * 60) end))
     where player_id = v_uid;
    perform private.farm_add_xp(v_uid, v_n * coalesce((private.farm_cfg() -> 'progression' -> 'xp' ->> 'collect')::numeric, 1));
    perform private.farm_chore_bump(v_uid, 'collect', 1);
  end if;
  return private.farm_prog_json(v_uid) || jsonb_build_object('collected', jsonb_build_object(b ->> 'item', v_n), 'items', private.farm_items_json(v_uid));
end $$;

/** Cook (or mill) a recipe, p_times over. */
create or replace function public.farm_craft(p_recipe text, p_times int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r jsonb := private.farm_cfg() -> 'recipes' -> p_recipe; v_t int := greatest(1, least(50, coalesce(p_times, 1))); k record; v_have bigint; v_blvl int; v_up int;
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  if r is null then raise exception 'invalid_recipe' using errcode = 'P0001'; end if;
  perform private.farm_prog(v_uid);
  v_blvl := coalesce((select (buildings -> (r ->> 'building') ->> 'lvl')::int from public.farm_progress where player_id = v_uid), 0);
  if v_blvl = 0 then raise exception 'not_built' using errcode = 'P0001', detail = r ->> 'building'; end if;
  for k in select key, value::int n from jsonb_each_text(r -> 'needs') loop
    select qty into v_have from public.farm_items where player_id = v_uid and item = k.key for update;
    if coalesce(v_have, 0) < k.n * v_t then raise exception 'not_enough_produce' using errcode = 'P0001', detail = k.key; end if;
  end loop;
  for k in select key, value::int n from jsonb_each_text(r -> 'needs') loop
    update public.farm_items set qty = qty - k.n * v_t where player_id = v_uid and item = k.key;
  end loop;
  -- a better kitchen (or mill) sometimes makes one extra
  perform private.farm_give(v_uid, p_recipe, coalesce((r ->> 'makes')::int, 1) * v_t + (select count(*)::int from generate_series(1, v_t) where random() < 0.15 * (v_blvl - 1)));
  perform private.farm_chore_bump(v_uid, 'craft', v_t);
  v_up := private.farm_add_xp(v_uid, v_t * coalesce((private.farm_cfg() -> 'progression' -> 'xp' ->> 'craft')::numeric, 3) * (1 + (r ->> 'sell')::numeric / 20));
  return private.farm_prog_json(v_uid) || jsonb_build_object('crafted', p_recipe, 'times', v_t, 'items', private.farm_items_json(v_uid), 'level_up', v_up);
end $$;

/** Fill an order: hand over what it wants, get its coins, XP and Ink. A new order turns up a little later. */
create or replace function public.farm_order_fill(p_slot int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); o public.farm_orders%rowtype; r public.farm_progress%rowtype; k record; v_have bigint; v_paid int; v_up int; v_day timestamptz := private.day_start(now());
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  r := private.farm_prog(v_uid);
  if r.orders_day is distinct from v_day then update public.farm_progress set orders_day = v_day, orders_done = 0 where player_id = v_uid returning * into r; end if;
  if r.orders_done >= coalesce((private.farm_cfg() -> 'orders' ->> 'per_day')::int, 15) then raise exception 'orders_done_today' using errcode = 'P0001'; end if;
  select * into o from public.farm_orders where player_id = v_uid and slot = p_slot for update;
  if not found or o.available_at > now() then raise exception 'not_found' using errcode = 'P0001'; end if;
  for k in select key, value::int n from jsonb_each_text(o.wants) loop
    select qty into v_have from public.farm_items where player_id = v_uid and item = k.key for update;
    if coalesce(v_have, 0) < k.n then raise exception 'not_enough_produce' using errcode = 'P0001', detail = k.key; end if;
  end loop;
  for k in select key, value::int n from jsonb_each_text(o.wants) loop update public.farm_items set qty = qty - k.n where player_id = v_uid and item = k.key; end loop;
  perform private.farm_add_coins(v_uid, o.coins);
  v_paid := private.farm_pay(v_uid, o.ink, 'order', 'farm-order:' || v_uid || ':' || gen_random_uuid());
  v_up := private.farm_add_xp(v_uid, o.xp);
  update public.farm_progress set orders_done = orders_done + 1 where player_id = v_uid;
  perform private.farm_chore_bump(v_uid, 'order', 1);
  perform private.farm_new_order(v_uid, p_slot, true);
  return private.farm_prog_json(v_uid) || jsonb_build_object('filled', jsonb_build_object('coins', o.coins, 'xp', o.xp, 'ink', v_paid), 'items', private.farm_items_json(v_uid), 'level_up', v_up, 'balances', private.balances(v_uid));
end $$;

/** Swap an order you don't fancy for another (the new one takes a few minutes to turn up). */
create or replace function public.farm_order_skip(p_slot int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('farm_order_skip', 20, 3600);
  if not exists (select 1 from public.farm_orders where player_id = v_uid and slot = p_slot and available_at <= now()) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.farm_new_order(v_uid, p_slot, true);
  return private.farm_prog_json(v_uid);
end $$;

/** Farm games pay coins and XP too (and Recipe Rush cooks you a dish, Pollinator brings honey). */
create or replace function public.farm_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.farm_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0;
  v_crop text; v_bonus int := 0; v_coins int := 0; v_up int := 0; v_extra jsonb := '{}'::jsonb;
begin
  select * into s from public.farm_games where id = p_session for update;
  if not found or s.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'paid', s.ink, 'repeat', true); end if;
  g := private.farm_cfg() -> 'games' -> s.game;
  v_secs := extract(epoch from now() - s.started_at);
  if v_secs < coalesce((g ->> 'seconds')::int, 40) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 200)));
  if v_secs <= 1800 then
    v_ink := least(coalesce((g ->> 'max_ink')::int, 20), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 10))))::int;
    v_paid := private.farm_pay(v_uid, v_ink, 'game:' || s.id, 'farm-game:' || s.id);
    v_bonus := floor(v_score / 40.0)::int;
    if v_bonus > 0 then
      select key into v_crop from jsonb_each(private.farm_cfg() -> 'crops') where (value ->> 'minutes')::int <= 45
         and coalesce((private.farm_cfg() -> 'progression' -> 'crop_levels' ->> key)::int, 1) <= private.farm_level(v_uid) order by md5(s.id::text || key) limit 1;
      perform private.farm_give(v_uid, coalesce(v_crop, 'carrot'), v_bonus);
      v_extra := jsonb_build_object(coalesce(v_crop, 'carrot'), v_bonus);
    end if;
    if s.game = 'recipe_rush' and v_score >= 60 then perform private.farm_give(v_uid, 'salad', 1 + v_score / 120); v_extra := v_extra || jsonb_build_object('salad', 1 + v_score / 120); end if;
    if s.game = 'pollinator' and v_score >= 50 then perform private.farm_give(v_uid, 'honey', 1 + v_score / 90); v_extra := v_extra || jsonb_build_object('honey', 1 + v_score / 90); end if;
    v_coins := floor(v_score / 4.0)::int;
    perform private.farm_add_coins(v_uid, v_coins);
    v_up := private.farm_add_xp(v_uid, floor(v_score / coalesce((private.farm_cfg() -> 'progression' -> 'xp' ->> 'game_per_points')::numeric, 12)));
  end if;
  update public.farm_games set finished_at = now(), score = v_score, ink = v_paid where id = s.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'bonus', v_extra, 'coins', v_coins, 'level_up', v_up,
    'best', (select max(score) from public.farm_games where owner_id = v_uid and game = s.game and finished_at is not null), 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.farm_level_xp(int)', 'private.farm_level_of(numeric)', 'private.farm_prog(uuid)', 'private.farm_up(uuid, text)', 'private.farm_level(uuid)',
    'private.farm_add_xp(uuid, numeric)', 'private.farm_add_coins(uuid, numeric)', 'private.farm_give(uuid, text, int)', 'private.farm_value(text)',
    'private.farm_building_json(uuid, text)', 'private.farm_upgrade_cost(text, int)', 'private.farm_building_cost(text, int)', 'private.farm_new_order(uuid, int, boolean)',
    'private.farm_orders_json(uuid)', 'private.farm_prog_json(uuid)',
    'private.farm_chores_pick(uuid)', 'private.farm_chore_bump(uuid, text, int)', 'private.farm_chores_json(uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.farm_upgrade(text)', 'public.farm_build(text)', 'public.farm_collect(text)', 'public.farm_craft(text, int)',
    'public.farm_order_fill(int)', 'public.farm_order_skip(int)', 'public.farm_chore_claim(text)', 'public.farm_tractor_tally(int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
