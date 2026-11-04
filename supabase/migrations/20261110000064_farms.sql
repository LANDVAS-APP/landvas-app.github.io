-- v0.46 Farms. A plot (or a group of connected plots) can now be a Farm: soil beds you plant, water and
-- harvest in a 3D farmyard, crops that grow while you're away, a market that buys your harvest for Ink,
-- and four farm minigames (two 2D, two 3D). Switching a plot to a farm keeps its art and habitat safe,
-- like every plot type. Farms only merge with farms; a bigger farm has more beds.

insert into public.plot_kinds (id, name, description, sort) values
  ('farm', 'Farm', 'Grow crops, harvest and sell them, and play farm games.', 2)
on conflict (id) do nothing;

insert into public.game_config (key, value, description) values ('farm', '{
  "enabled": true,
  "beds_base": 6, "beds_per_plot": 4, "beds_max": 48,
  "daily_cap": 120,
  "water_speedup": 0.4,
  "golden_chance": 0.06, "golden_mult": 5,
  "crops": {
    "carrot":     {"name": "Carrot",       "emoji": "🥕", "seed": 0,  "minutes": 3,   "yield": [2, 4], "sell": 2,  "color": "#FF8A3D"},
    "lettuce":    {"name": "Lettuce",      "emoji": "🥬", "seed": 1,  "minutes": 6,   "yield": [2, 3], "sell": 2,  "color": "#7BD957"},
    "strawberry": {"name": "Strawberry",   "emoji": "🍓", "seed": 3,  "minutes": 15,  "yield": [3, 5], "sell": 3,  "color": "#FF4D6D"},
    "sunflower":  {"name": "Sunflower",    "emoji": "🌻", "seed": 3,  "minutes": 20,  "yield": [2, 4], "sell": 4,  "color": "#FFD23F"},
    "tomato":     {"name": "Tomato",       "emoji": "🍅", "seed": 4,  "minutes": 30,  "yield": [3, 6], "sell": 4,  "color": "#E8433A"},
    "corn":       {"name": "Corn",         "emoji": "🌽", "seed": 5,  "minutes": 45,  "yield": [4, 7], "sell": 4,  "color": "#F5C842"},
    "pumpkin":    {"name": "Pumpkin",      "emoji": "🎃", "seed": 8,  "minutes": 90,  "yield": [1, 2], "sell": 18, "color": "#F08A24"},
    "melon":      {"name": "Golden melon", "emoji": "🍈", "seed": 20, "minutes": 180, "yield": [1, 1], "sell": 70, "color": "#C9E265"}
  },
  "games": {
    "veggie_catch": {"name": "Veggie Catch",  "emoji": "🧺", "dim": "2d", "seconds": 40, "max_score": 240, "points_per_ink": 10, "max_ink": 20},
    "pest_pop":     {"name": "Pest Pop",      "emoji": "🐛", "dim": "2d", "seconds": 35, "max_score": 240, "points_per_ink": 10, "max_ink": 20},
    "tractor":      {"name": "Tractor Rush",  "emoji": "🚜", "dim": "3d", "seconds": 45, "max_score": 260, "points_per_ink": 10, "max_ink": 22},
    "sheep":        {"name": "Sheep Round-up", "emoji": "🐑", "dim": "3d", "seconds": 60, "max_score": 200, "points_per_ink": 8,  "max_ink": 22}
  }
}', 'Farms: beds per farm (base + per connected plot), crops (seed price in Ink, grow time, yield, sale price), watering speed-up, golden harvest chance, the daily Ink cap from the market and farm games, and the games.')
on conflict (key) do nothing;

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  group_id uuid unique references public.canvas_groups (id) on delete set null,
  seed int not null default floor(random() * 2147483646)::int,
  harvests bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.farms enable row level security;
revoke all on public.farms from anon, authenticated;

create table if not exists public.farm_beds (
  farm_id uuid not null references public.farms (id) on delete cascade,
  idx int not null,
  crop text not null,
  planted_at timestamptz not null default now(),
  ready_at timestamptz not null,
  watered boolean not null default false,
  primary key (farm_id, idx)
);
alter table public.farm_beds enable row level security;
revoke all on public.farm_beds from anon, authenticated;

create table if not exists public.farm_items (
  player_id uuid not null references public.players (id) on delete cascade,
  item text not null, qty bigint not null default 0 check (qty >= 0),
  primary key (player_id, item)
);
alter table public.farm_items enable row level security;
revoke all on public.farm_items from anon, authenticated;

create table if not exists public.farm_ink_days (
  player_id uuid not null references public.players (id) on delete cascade,
  day timestamptz not null, ink int not null default 0,
  primary key (player_id, day)
);
alter table public.farm_ink_days enable row level security;
revoke all on public.farm_ink_days from anon, authenticated;

create table if not exists public.farm_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  farm_id uuid references public.farms (id) on delete set null,
  game text not null, seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, ink int
);
create index if not exists farm_games_owner_idx on public.farm_games (owner_id, started_at desc);
alter table public.farm_games enable row level security;
revoke all on public.farm_games from anon, authenticated;

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest'));

-- farm Ink (the market and farm games) is an allowed way to earn Ink
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward', 'space', 'farm') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;


create or replace function private.farm_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('farm'), '{}'::jsonb) $$;
create or replace function private.farm_beds_count(p_farm uuid) returns int language sql stable as $$
  select least(coalesce((private.farm_cfg() ->> 'beds_max')::int, 48),
               coalesce((private.farm_cfg() ->> 'beds_base')::int, 6) + coalesce((private.farm_cfg() ->> 'beds_per_plot')::int, 4) * greatest(0, coalesce(g.plot_count, 1) - 1))
  from public.farms f left join public.canvas_groups g on g.id = f.group_id where f.id = p_farm
$$;
create or replace function private.farm_items_json(p_uid uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(item, qty), '{}'::jsonb) from public.farm_items where player_id = p_uid and qty > 0
$$;
create or replace function private.farm_ink_today(p_uid uuid) returns int language sql stable as $$
  select coalesce((select ink from public.farm_ink_days where player_id = p_uid and day = private.day_start(now())), 0)
$$;
/** Pay farm Ink, up to the daily cap. Returns what was paid. */
create or replace function private.farm_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_had int; v_pay int;
begin
  if p_amount <= 0 then return 0; end if;
  insert into public.farm_ink_days (player_id, day) values (p_uid, v_day) on conflict do nothing;
  select ink into v_had from public.farm_ink_days where player_id = p_uid and day = v_day for update;
  v_pay := least(p_amount, greatest(0, coalesce((private.farm_cfg() ->> 'daily_cap')::int, 120) - v_had));
  if v_pay > 0 then
    update public.farm_ink_days set ink = ink + v_pay where player_id = p_uid and day = v_day;
    perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'farm', 'farm', p_ref, p_idem);
  end if;
  return v_pay;
end $$;

create or replace function private.farm_json(p_farm uuid, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', f.id, 'group_id', f.group_id, 'seed', f.seed, 'name', coalesce(g.name, 'Farm'), 'plots', coalesce(g.plot_count, 1),
    'owner', private.profile_json(f.owner_id), 'mine', f.owner_id = p_viewer, 'harvests', f.harvests,
    'cells', coalesce((select jsonb_agg(jsonb_build_array(m.gx, m.gy) order by m.gy, m.gx) from public.canvas_group_members m where m.group_id = f.group_id), '[]'::jsonb),
    'beds_count', private.farm_beds_count(f.id),
    'beds', coalesce((select jsonb_agg(jsonb_build_object('idx', b.idx, 'crop', b.crop, 'planted_at', b.planted_at, 'ready_at', b.ready_at, 'watered', b.watered, 'ready', b.ready_at <= now()) order by b.idx)
                      from public.farm_beds b where b.farm_id = f.id), '[]'::jsonb),
    'items', case when f.owner_id = p_viewer then private.farm_items_json(p_viewer) else null end,
    'ink_today', case when f.owner_id = p_viewer then private.farm_ink_today(p_viewer) else null end,
    'config', private.farm_cfg(), 'server_time', now())
  from public.farms f left join public.canvas_groups g on g.id = f.group_id where f.id = p_farm
$$;

/** A farm (yours, or someone else's to look round). */
create or replace function public.farm_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype;
begin
  select * into f from public.farms where id = p_id;
  if not found or not private.visible_to(f.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if f.owner_id <> v_uid then perform private.notify(f.owner_id, 'visit', v_uid, jsonb_build_object('farm', f.id)); end if;
  return private.farm_json(f.id, v_uid);
end $$;

create or replace function public.farm_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('farm_id', f.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'growing', (select count(*) from public.farm_beds b where b.farm_id = f.id))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'farm'
  join public.farms f on f.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$$;

create or replace function private.my_farm(p_farm uuid, p_uid uuid) returns public.farms language plpgsql as $$
declare f public.farms%rowtype;
begin
  select * into f from public.farms where id = p_farm for update;
  if not found or f.owner_id <> p_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.canvas_groups g where g.id = f.group_id and g.kind = 'farm' and g.status = 'active') then raise exception 'not_a_farm' using errcode = 'P0001'; end if;
  return f;
end $$;

/** Plant a crop in an empty bed (the seed costs a little Ink; carrots are free). */
create or replace function public.farm_plant(p_farm uuid, p_bed int, p_crop text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype; c jsonb := private.farm_cfg() -> 'crops' -> p_crop; v_seed int;
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  f := private.my_farm(p_farm, v_uid);
  if c is null then raise exception 'invalid_crop' using errcode = 'P0001'; end if;
  if p_bed is null or p_bed < 0 or p_bed >= private.farm_beds_count(f.id) then raise exception 'invalid_bed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.farm_beds where farm_id = f.id and idx = p_bed) then raise exception 'bed_taken' using errcode = 'P0001'; end if;
  v_seed := coalesce((c ->> 'seed')::int, 0);
  if v_seed > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_seed), 'farm_seed', 'farm', p_crop, 'seed:' || f.id || ':' || p_bed || ':' || extract(epoch from clock_timestamp())::bigint); end if;
  insert into public.farm_beds (farm_id, idx, crop, ready_at) values (f.id, p_bed, p_crop, now() + make_interval(mins => coalesce((c ->> 'minutes')::int, 5)));
  return private.farm_json(f.id, v_uid) || jsonb_build_object('balances', private.balances(v_uid));
end $$;

/** Water a growing bed: it grows faster (once per planting). */
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
  return private.farm_json(f.id, v_uid);
end $$;

/** Harvest a ready bed (or, with p_bed null, every ready bed). Sometimes a crop comes up golden. */
create or replace function public.farm_harvest(p_farm uuid, p_bed int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype; b record; cfg jsonb := private.farm_cfg(); c jsonb; v_n int; v_got jsonb := '{}'::jsonb;
  v_item text; v_gold int := 0; v_beds int := 0;
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  f := private.my_farm(p_farm, v_uid);
  for b in delete from public.farm_beds where farm_id = f.id and ready_at <= now() and (p_bed is null or idx = p_bed) returning * loop
    c := cfg -> 'crops' -> b.crop; v_beds := v_beds + 1;
    v_n := coalesce((c -> 'yield' ->> 0)::int, 1) + floor(random() * (coalesce((c -> 'yield' ->> 1)::int, 1) - coalesce((c -> 'yield' ->> 0)::int, 1) + 1))::int;
    if b.watered then v_n := v_n + 1; end if;
    v_item := b.crop;
    if random() < coalesce((cfg ->> 'golden_chance')::numeric, 0.06) then v_item := 'golden_' || b.crop; v_gold := v_gold + 1; v_n := greatest(1, v_n / 2); end if;
    v_got := v_got || jsonb_build_object(v_item, coalesce((v_got ->> v_item)::int, 0) + v_n);
  end loop;
  if v_beds = 0 then raise exception 'not_ready' using errcode = 'P0001'; end if;
  for b in select key, value::int n from jsonb_each_text(v_got) loop
    insert into public.farm_items (player_id, item, qty) values (v_uid, b.key, b.n) on conflict (player_id, item) do update set qty = farm_items.qty + excluded.qty;
  end loop;
  update public.farms set harvests = harvests + v_beds where id = f.id;
  if v_gold > 0 and not exists (select 1 from public.feed_events where kind = 'harvest' and player_id = v_uid and created_at > now() - interval '1 hour') then
    insert into public.feed_events (kind, player_id, data) values ('harvest', v_uid, jsonb_build_object('farm', f.id, 'golden', v_gold, 'got', v_got));
  end if;
  return private.farm_json(f.id, v_uid) || jsonb_build_object('harvested', v_got, 'beds_harvested', v_beds, 'golden', v_gold);
end $$;

/** Sell produce at the market for Ink (up to the farm's daily cap). Golden produce is worth 5x. */
create or replace function public.farm_sell(p_item text, p_qty int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.farm_cfg(); v_crop text := regexp_replace(p_item, '^golden_', ''); c jsonb; v_have bigint;
  v_each int; v_qty int := greatest(0, coalesce(p_qty, 0)); v_paid int;
begin
  perform private.rate_limit('farm_sell', 600, 3600);
  c := cfg -> 'crops' -> v_crop;
  if c is null or v_qty = 0 then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  select qty into v_have from public.farm_items where player_id = v_uid and item = p_item for update;
  if coalesce(v_have, 0) < v_qty then raise exception 'not_enough_produce' using errcode = 'P0001'; end if;
  v_each := coalesce((c ->> 'sell')::int, 1) * case when p_item like 'golden_%' then coalesce((cfg ->> 'golden_mult')::int, 5) else 1 end;
  -- never sell more than the cap can pay for
  v_qty := least(v_qty, greatest(0, ceil((coalesce((cfg ->> 'daily_cap')::int, 120) - private.farm_ink_today(v_uid))::numeric / v_each))::int);
  if v_qty = 0 then raise exception 'farm_cap_reached' using errcode = 'P0001'; end if;
  update public.farm_items set qty = qty - v_qty where player_id = v_uid and item = p_item;
  v_paid := private.farm_pay(v_uid, v_qty * v_each, 'sell:' || p_item, 'farm-sell:' || v_uid || ':' || gen_random_uuid());
  return jsonb_build_object('sold', v_qty, 'item', p_item, 'paid', v_paid, 'items', private.farm_items_json(v_uid), 'ink_today', private.farm_ink_today(v_uid),
    'daily_cap', coalesce((cfg ->> 'daily_cap')::int, 120), 'balances', private.balances(v_uid));
end $$;

create or replace function public.farm_game_start(p_farm uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype; g jsonb := private.farm_cfg() -> 'games' -> p_game; s public.farm_games%rowtype;
begin
  perform private.rate_limit('farm_game', 120, 3600);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  f := private.my_farm(p_farm, v_uid);
  insert into public.farm_games (owner_id, farm_id, game, seed) values (v_uid, f.id, p_game, floor(random() * 2147483646)::int) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'seconds', coalesce((g ->> 'seconds')::int, 40), 'game', p_game, 'ink_today', private.farm_ink_today(v_uid),
    'daily_cap', coalesce((private.farm_cfg() ->> 'daily_cap')::int, 120));
end $$;

/** Finish a farm game: Ink for the score (daily cap), and a basket of produce for a good round. */
create or replace function public.farm_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.farm_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0;
  v_crop text; v_bonus int := 0;
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
    -- a basket of produce: more for a better round
    v_bonus := floor(v_score / 40.0)::int;
    if v_bonus > 0 then
      select key into v_crop from jsonb_each(private.farm_cfg() -> 'crops') where (value ->> 'minutes')::int <= 45 order by md5(s.id::text || key) limit 1;
      insert into public.farm_items (player_id, item, qty) values (v_uid, v_crop, v_bonus) on conflict (player_id, item) do update set qty = farm_items.qty + excluded.qty;
    end if;
  end if;
  update public.farm_games set finished_at = now(), score = v_score, ink = v_paid where id = s.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'bonus', case when v_bonus > 0 then jsonb_build_object(v_crop, v_bonus) else '{}'::jsonb end,
    'best', (select max(score) from public.farm_games where owner_id = v_uid and game = s.game and finished_at is not null), 'balances', private.balances(v_uid));
end $$;

/** Your farms (for the Farm hub). */
create or replace function public.my_farms() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return jsonb_build_object('farms', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', g.name, 'plots', g.plot_count, 'beds_count', private.farm_beds_count(f.id),
      'growing', (select count(*) from public.farm_beds b where b.farm_id = f.id), 'ready', (select count(*) from public.farm_beds b where b.farm_id = f.id and b.ready_at <= now()))
      order by g.plot_count desc) from public.farms f join public.canvas_groups g on g.id = f.group_id and g.kind = 'farm' and g.status = 'active' where f.owner_id = v_uid), '[]'::jsonb),
    'items', private.farm_items_json(v_uid), 'ink_today', private.farm_ink_today(v_uid), 'config', private.farm_cfg());
end $$;

-- no art publishing from a farm (or a habitat)
create or replace function private.no_art_on_habitat_trg() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.canvas_groups where id = new.group_id and kind in ('habitat', 'farm')) then
    raise exception 'habitat_plot' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.group_json(p_group uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'status', g.status, 'plot_count', g.plot_count, 'kind', g.kind,
    'habitat_id', (select h.id from public.habitats h where h.group_id = g.id),
    'farm_id', (select f.id from public.farms f where f.group_id = g.id),
    'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy,
    'project_id', g.project_id, 'created_at', g.created_at, 'updated_at', g.updated_at,
    'cells', (
      select coalesce(jsonb_agg(jsonb_build_array(m.gx, m.gy, wp.plot_type, wp.level, wp.art_rev is not null) order by m.gy, m.gx), '[]'::jsonb)
      from public.canvas_group_members m join public.world_plots wp on wp.gx = m.gx and wp.gy = m.gy
      where m.group_id = g.id),
    'project', (
      select jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description,
                                'current_version_id', p.current_version_id, 'version_count', p.version_count,
                                'tile_count', v.tile_count, 'layer_count', v.layer_count, 'updated_at', p.updated_at)
      from public.artwork_projects p left join public.artwork_versions v on v.id = p.current_version_id
      where p.id = g.project_id),
    'latest_publication', (
      select jsonb_build_object('id', a.id, 'status', a.status, 'title', a.title, 'created_at', a.created_at,
                                'published_at', a.published_at, 'decision_reason', a.decision_reason,
                                'thumb_path', a.thumb_path, 'plot_count', a.plot_count)
      from public.artwork_publications a
      where a.group_id = g.id and a.status not in ('cancelled')
      order by a.created_at desc limit 1),
    'adjacent_groups', (
      select coalesce(jsonb_agg(distinct m2.group_id), '[]'::jsonb)
      from public.canvas_group_members m1
      join private.neighbors(m1.gx, m1.gy) n on true
      join public.canvas_group_members m2 on m2.gx = n.gx and m2.gy = n.gy
      join public.canvas_groups g2 on g2.id = m2.group_id
      where m1.group_id = g.id and m2.group_id <> g.id and g2.owner_id = g.owner_id and g2.status = 'active'))
  from public.canvas_groups g where g.id = p_group
$$;

create or replace function public.set_group_kind(p_group_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups%rowtype; h public.habitats%rowtype; v_starter uuid;
begin
  perform private.rate_limit('set_group_kind', 60, 3600);
  select * into g from public.canvas_groups where id = p_group_id for update;
  if not found or g.owner_id <> v_uid or g.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_kinds where id = p_kind and enabled) then raise exception 'invalid_plot_kind' using errcode = 'P0001'; end if;
  if g.kind = p_kind then return private.group_json(g.id); end if;
  if exists (select 1 from public.artwork_publications where group_id = g.id and status in ('processing', 'pending_review', 'approved', 'uploading')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select * into h from public.habitats where group_id = g.id;
  if p_kind = 'farm' then
    insert into public.farms (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
  end if;
  if p_kind = 'habitat' then
    if h.id is null then insert into public.habitats (owner_id, group_id, kind) values (v_uid, g.id, 'plot') returning * into h; end if;
    -- creatures that lived here before come home
    update public.inkborn set habitat_id = h.id, prev_habitat_id = null where owner_id = v_uid and prev_habitat_id = h.id;
  elsif h.id is not null then
    -- the habitat (layout + who lived here) is kept; its creatures wait in the starter sanctuary
    v_starter := private.starter_habitat(v_uid);
    update public.inkborn set prev_habitat_id = h.id, habitat_id = v_starter where habitat_id = h.id;
  end if;
  update public.canvas_groups set kind = p_kind, updated_at = now() where id = g.id;
  perform private.audit('group.kind', 'group', g.id::text, jsonb_build_object('from', g.kind, 'to', p_kind));
  return private.group_json(g.id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.farm_cfg()', 'private.farm_beds_count(uuid)', 'private.farm_items_json(uuid)', 'private.farm_ink_today(uuid)',
    'private.farm_pay(uuid, int, text, text)', 'private.farm_json(uuid, uuid)', 'private.my_farm(uuid, uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.farm_get(uuid)', 'public.farm_plant(uuid, int, text)', 'public.farm_water(uuid, int)',
    'public.farm_harvest(uuid, int)', 'public.farm_sell(text, int)', 'public.farm_game_start(uuid, text)', 'public.farm_game_finish(uuid, int)', 'public.my_farms()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.farm_for_plot(int, int) from public';
  execute 'grant execute on function public.farm_for_plot(int, int) to anon, authenticated, service_role';
end $$;
