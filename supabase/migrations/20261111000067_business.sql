-- v0.49 Business plots: an idle tycoon that starts with a lemonade stand.
--   * tap the lemonade stand to sell a cup (taps are counted on the server, a few seconds at a time, with a
--     sensible speed limit)
--   * buy ventures that earn every second, even while you're away: Lemonade Stand → Cookie Cart → Food Truck →
--     Coffee Shop → Bookstore → Arcade → Hotel → Tech Startup → Bank → Space Corp. Each one costs 15% more
--     than the last; owning 25, 50, 100… of a venture doubles what it makes
--   * ~80 upgrades that unlock as you play (per venture, for tapping, and for the whole company)
--   * golden customers every few minutes: tap one for a lucky windfall, a Frenzy (x7 income) or a Tap Storm
--   * Go public (IPO): start again with shares that boost everything forever (2% each)
--   * daily dividends in Ink, Ink for milestones, tips from visitors, and four capitalism minigames
--   * your business empire is yours, not the plot's: every business plot you own adds 10% to all income
-- Cash 💵 is the business's own money (big numbers are fine; it's a double). Ink from a business is capped a day.

insert into public.plot_kinds (id, name, description, sort) values
  ('business', 'Business', 'Start with a lemonade stand and build a corporation.', 3)
on conflict (id) do nothing;

insert into public.game_config (key, value, description) values ('business', '{
  "enabled": true,
  "daily_cap": 120,
  "growth": 1.15,
  "offline_hours": 8,
  "taps_per_second": 16,
  "plot_bonus": 0.10,
  "share_bonus": 0.02,
  "share_unit": 1e9,
  "milestones": [25, 50, 100, 150, 200, 300, 400, 500],
  "milestone_ink": 3,
  "golden": {"min": 150, "max": 330, "window": 22, "frenzy": 7, "frenzy_secs": 77, "storm": 50, "storm_secs": 13, "ink": 1},
  "ventures": {
    "lemonade":   {"order": 1,  "name": "Lemonade Stand", "emoji": "🍋", "cost": 15,     "rate": 0.1,
                   "upgrades": ["Fresh-squeezed lemons", "Bendy straws", "Pink lemonade", "Ice-cold cooler", "Neon lemon sign", "Secret family recipe"]},
    "cookies":    {"order": 2,  "name": "Cookie Cart",    "emoji": "🍪", "cost": 100,    "rate": 1,
                   "upgrades": ["Chocolate chunks", "Grandma’s recipe", "Warm from the oven", "Sprinkles on everything", "Cookie subscriptions", "Triple-stuffed"]},
    "food_truck": {"order": 3,  "name": "Food Truck",     "emoji": "🚚", "cost": 1100,   "rate": 8,
                   "upgrades": ["Neon menu board", "Secret sauce", "Late-night route", "Internet famous", "A fleet of trucks", "Food festival king"]},
    "coffee":     {"order": 4,  "name": "Coffee Shop",    "emoji": "☕", "cost": 12000,  "rate": 47,
                   "upgrades": ["Espresso machine", "Latte art", "Cosy armchairs", "Oat milk", "Drive-thru", "Roast your own beans"]},
    "bookstore":  {"order": 5,  "name": "Bookstore",      "emoji": "📚", "cost": 130000, "rate": 260,
                   "upgrades": ["Reading nook", "Signed first editions", "Book club", "The bookshop cat", "Midnight launches", "Your own publishing house"]},
    "arcade":     {"order": 6,  "name": "Arcade",         "emoji": "🕹️", "cost": 1.4e6,  "rate": 1400,
                   "upgrades": ["Prize counter", "Claw machines", "Retro cabinets", "Tournament nights", "VR booths", "Arcade chain"]},
    "hotel":      {"order": 7,  "name": "Hotel",          "emoji": "🏨", "cost": 2e7,    "rate": 7800,
                   "upgrades": ["Rooftop pool", "Room service", "Spa wing", "Five stars", "Penthouse suites", "Island resort"]},
    "tech":       {"order": 8,  "name": "Tech Startup",   "emoji": "💻", "cost": 3.3e8,  "rate": 44000,
                   "upgrades": ["Bean bags", "Free snacks", "A viral app", "Series A", "Unicorn status", "Moonshot lab"]},
    "bank":       {"order": 9,  "name": "Bank",           "emoji": "🏦", "cost": 5.1e9,  "rate": 260000,
                   "upgrades": ["A shiny vault", "Gold reserves", "Mobile banking", "Investment arm", "Too big to fail", "World reserve"]},
    "space":      {"order": 10, "name": "Space Corp",     "emoji": "🚀", "cost": 7.5e10, "rate": 1.6e6,
                   "upgrades": ["Reusable rockets", "Moon base", "Asteroid mining", "Space hotels", "Mars colony", "Galactic franchise"]}
  },
  "venture_upgrades": {"at": [1, 5, 25, 50, 100, 150], "cost_mult": [10, 50, 500, 50000, 5000000, 500000000]},
  "tap_upgrades": [
    {"key": "t1", "name": "Two hands",        "taps": 1,     "cost": 100,   "x": 2},
    {"key": "t2", "name": "Lemon squeezer",   "taps": 100,   "cost": 500,   "x": 2},
    {"key": "t3", "name": "Golden pitcher",   "taps": 1000,  "cost": 10000, "x": 2},
    {"key": "t4", "name": "Customer charm",   "taps": 2000,  "cost": 1e5,   "pct": 0.01},
    {"key": "t5", "name": "Viral pour",       "taps": 5000,  "cost": 1e7,   "pct": 0.01},
    {"key": "t6", "name": "Tycoon’s touch",   "taps": 10000, "cost": 1e9,   "pct": 0.01},
    {"key": "t7", "name": "Midas mitts",      "taps": 25000, "cost": 1e11,  "pct": 0.01},
    {"key": "t8", "name": "Infinite thirst",  "taps": 50000, "cost": 1e13,  "pct": 0.01}
  ],
  "global_upgrades": [
    {"key": "g1", "name": "Flyers on every lamppost", "emoji": "📰", "alltime": 1e4,  "cost": 2e4,   "x": 1.25},
    {"key": "g2", "name": "Loyalty cards",            "emoji": "💳", "alltime": 5e5,  "cost": 7.7e5, "golden": 0.85},
    {"key": "g3", "name": "Social media ads",         "emoji": "📱", "alltime": 1e6,  "cost": 1e6,   "x": 1.5},
    {"key": "g4", "name": "VIP customers",            "emoji": "🎩", "alltime": 5e7,  "cost": 7.7e7, "golden_dur": 2},
    {"key": "g5", "name": "Billboards",               "emoji": "🪧", "alltime": 1e8,  "cost": 1e8,   "x": 2},
    {"key": "g6", "name": "Celebrity endorsement",    "emoji": "🌟", "alltime": 1e10, "cost": 1e10,  "x": 2},
    {"key": "g7", "name": "Global franchise",         "emoji": "🌍", "alltime": 1e12, "cost": 1e12,  "x": 2},
    {"key": "g8", "name": "AI-run everything",        "emoji": "🤖", "alltime": 1e14, "cost": 1e14,  "x": 3}
  ],
  "dividend": {"base": 3, "per_sqrt_share": 2, "per_ipo": 1, "max": 40, "cash_seconds": 600},
  "ipo_ink": 15,
  "tip": {"owner_seconds": 300, "owner_min": 100, "visitor_ink": 2},
  "games": {
    "stock_trader":  {"name": "Stock Trader",  "emoji": "📈", "dim": "2d", "seconds": 45, "max_score": 300, "points_per_ink": 12, "max_ink": 22},
    "haggle":        {"name": "Haggle!",       "emoji": "🤝", "dim": "2d", "seconds": 45, "max_score": 300, "points_per_ink": 12, "max_ink": 22},
    "lemon_pour":    {"name": "Lemon Pour",    "emoji": "🥤", "dim": "2d", "seconds": 40, "max_score": 260, "points_per_ink": 10, "max_ink": 22},
    "delivery_dash": {"name": "Delivery Dash", "emoji": "📦", "dim": "3d", "seconds": 60, "max_score": 300, "points_per_ink": 12, "max_ink": 22}
  }
}', 'Business plots: ventures (cost, earnings a second, upgrade names), cost growth, milestones, upgrades, golden customers, going public, dividends, tips, the daily Ink cap and the games.')
on conflict (key) do nothing;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  group_id uuid unique references public.canvas_groups (id) on delete set null,
  seed int not null default floor(random() * 2147483646)::int,
  tips bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.businesses enable row level security;
revoke all on public.businesses from anon, authenticated;

create table if not exists public.biz_state (
  player_id uuid primary key references public.players (id) on delete cascade,
  cash double precision not null default 0,
  run_earned double precision not null default 0,     -- since you last went public
  alltime double precision not null default 0,        -- ever
  shares double precision not null default 0,
  taps bigint not null default 0,
  ventures jsonb not null default '{}'::jsonb,        -- {"lemonade": 12, ...}
  upgrades jsonb not null default '[]'::jsonb,        -- ["v:lemonade:1", "t1", "g1", ...]
  ink_marks jsonb not null default '[]'::jsonb,       -- milestones already paid in Ink
  golden_at timestamptz not null default now() + interval '90 seconds',
  buff text, buff_mult double precision not null default 1, buff_from timestamptz, buff_until timestamptz,
  synced_at timestamptz not null default now(),
  ipos int not null default 0,
  dividend_day timestamptz,
  created_at timestamptz not null default now()
);
alter table public.biz_state enable row level security;
revoke all on public.biz_state from anon, authenticated;

create table if not exists public.biz_ink_days (
  player_id uuid not null references public.players (id) on delete cascade,
  day timestamptz not null, ink int not null default 0,
  primary key (player_id, day)
);
alter table public.biz_ink_days enable row level security;
revoke all on public.biz_ink_days from anon, authenticated;

create table if not exists public.biz_tips (
  visitor_id uuid not null references public.players (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  day timestamptz not null,
  primary key (visitor_id, business_id, day)
);
alter table public.biz_tips enable row level security;
revoke all on public.biz_tips from anon, authenticated;

create table if not exists public.biz_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  game text not null, seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, ink int, cash double precision
);
create index if not exists biz_games_owner_idx on public.biz_games (owner_id, started_at desc);
alter table public.biz_games enable row level security;
revoke all on public.biz_games from anon, authenticated;

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo'));

-- business Ink is an allowed way to earn Ink
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward', 'space', 'farm', 'business') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

-- ---- helpers -------------------------------------------------------------------------------------------
create or replace function private.biz_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('business'), '{}'::jsonb) $$;
create or replace function private.biz_ink_today(p_uid uuid) returns int language sql stable as $$
  select coalesce((select ink from public.biz_ink_days where player_id = p_uid and day = private.day_start(now())), 0)
$$;
/** Pay business Ink, up to the daily cap. Returns what was paid. */
create or replace function private.biz_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_had int; v_pay int;
begin
  if coalesce(p_amount, 0) <= 0 then return 0; end if;
  insert into public.biz_ink_days (player_id, day) values (p_uid, v_day) on conflict do nothing;
  select ink into v_had from public.biz_ink_days where player_id = p_uid and day = v_day for update;
  v_pay := least(p_amount, greatest(0, coalesce((private.biz_cfg() ->> 'daily_cap')::int, 120) - v_had));
  if v_pay > 0 then
    update public.biz_ink_days set ink = ink + v_pay where player_id = p_uid and day = v_day;
    perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'business', 'business', p_ref, p_idem);
  end if;
  return v_pay;
end $$;

/** Your business state, locked for update (made the first time). */
create or replace function private.biz_lock(p_uid uuid) returns public.biz_state language plpgsql as $$
declare r public.biz_state%rowtype;
begin
  insert into public.biz_state (player_id) values (p_uid) on conflict do nothing;
  select * into r from public.biz_state where player_id = p_uid for update;
  return r;
end $$;

/** Every upgrade there is: for each venture, for tapping, and for the whole company. */
create or replace function private.biz_catalog() returns table (key text, kind text, venture text, name text, emoji text, need double precision, cost double precision,
  x double precision, pct double precision, golden double precision, golden_dur double precision, ord int)
language sql stable as $$
  with c as (select private.biz_cfg() cfg)
  select 'v:' || v.key || ':' || a.value, 'venture', v.key, v.value -> 'upgrades' ->> (a.ord::int - 1), v.value ->> 'emoji', a.value::double precision,
         (v.value ->> 'cost')::double precision * (c.cfg -> 'venture_upgrades' -> 'cost_mult' ->> (a.ord::int - 1))::double precision, 2::double precision, 0::double precision, 1::double precision, 1::double precision,
         (v.value ->> 'order')::int * 100 + a.ord::int
    from c, jsonb_each(c.cfg -> 'ventures') v, jsonb_array_elements_text(c.cfg -> 'venture_upgrades' -> 'at') with ordinality a (value, ord)
  union all
  select t.value ->> 'key', 'tap', null, t.value ->> 'name', '👆', (t.value ->> 'taps')::double precision, (t.value ->> 'cost')::double precision,
         coalesce((t.value ->> 'x')::double precision, 1), coalesce((t.value ->> 'pct')::double precision, 0), 1, 1, 2000 + t.ord::int
    from c, jsonb_array_elements(c.cfg -> 'tap_upgrades') with ordinality t (value, ord)
  union all
  select g.value ->> 'key', 'global', null, g.value ->> 'name', g.value ->> 'emoji', (g.value ->> 'alltime')::double precision, (g.value ->> 'cost')::double precision,
         coalesce((g.value ->> 'x')::double precision, 1), 0, coalesce((g.value ->> 'golden')::double precision, 1), coalesce((g.value ->> 'golden_dur')::double precision, 1), 3000 + g.ord::int
    from c, jsonb_array_elements(c.cfg -> 'global_upgrades') with ordinality g (value, ord)
$$;

create or replace function private.biz_owned(p_st public.biz_state, p_key text) returns int language sql immutable as $$
  select coalesce((p_st.ventures ->> p_key)::int, 0)
$$;
/** What one venture type earns a second (before the company-wide boosts). */
create or replace function private.biz_vrate(p_st public.biz_state, p_key text) returns double precision language sql stable as $$
  with c as (select private.biz_cfg() cfg), n as (select private.biz_owned(p_st, p_key) n)
  select coalesce((c.cfg -> 'ventures' -> p_key ->> 'rate')::double precision, 0) * n.n
       * power(2, (select count(*) from jsonb_array_elements_text(c.cfg -> 'milestones') m where m::int <= n.n))
       * power(2, (select count(*) from jsonb_array_elements_text(c.cfg -> 'venture_upgrades' -> 'at') a where p_st.upgrades ? ('v:' || p_key || ':' || a)))
  from c, n
$$;
create or replace function private.biz_plots(p_uid uuid) returns int language sql stable as $$
  select coalesce(sum(plot_count), 0)::int from public.canvas_groups where owner_id = p_uid and kind = 'business' and status = 'active'
$$;
/** Company-wide multiplier: global upgrades, shares, and extra business plots. */
create or replace function private.biz_gmult(p_st public.biz_state) returns double precision language sql stable as $$
  select coalesce((select exp(sum(ln(c.x))) from private.biz_catalog() c where c.kind = 'global' and p_st.upgrades ? c.key), 1)
       * (1 + coalesce((private.biz_cfg() ->> 'share_bonus')::double precision, 0.02) * p_st.shares)
       * (1 + coalesce((private.biz_cfg() ->> 'plot_bonus')::double precision, 0.1) * greatest(0, private.biz_plots(p_st.player_id) - 1))
$$;
create or replace function private.biz_income(p_st public.biz_state) returns double precision language sql stable as $$
  select coalesce(sum(private.biz_vrate(p_st, v.key)), 0) * private.biz_gmult(p_st) from jsonb_each(private.biz_cfg() -> 'ventures') v
$$;
/** One tap at the lemonade stand. */
create or replace function private.biz_tap_value(p_st public.biz_state, p_income double precision) returns double precision language sql stable as $$
  select coalesce((select exp(sum(ln(c.x))) from private.biz_catalog() c where c.kind = 'tap' and p_st.upgrades ? c.key), 1)
           * (1 + coalesce((private.biz_cfg() ->> 'share_bonus')::double precision, 0.02) * p_st.shares)
       + p_income * coalesce((select sum(c.pct) from private.biz_catalog() c where c.kind = 'tap' and p_st.upgrades ? c.key), 0)
$$;
create or replace function private.biz_cost(p_base double precision, p_n int, p_q int) returns double precision language sql immutable as $$
  select p_base * power(1.15::double precision, p_n) * (power(1.15::double precision, p_q) - 1) / 0.15
$$;
create or replace function private.biz_max_q(p_base double precision, p_n int, p_cash double precision) returns int language sql immutable as $$
  select greatest(0, floor(ln(greatest(0, p_cash) * 0.15 / (p_base * power(1.15::double precision, p_n)) + 1) / ln(1.15)))::int
$$;
create or replace function private.biz_golden_gap(p_st public.biz_state) returns interval language sql stable as $$
  with g as (select private.biz_cfg() -> 'golden' g)
  select make_interval(secs => (coalesce((g.g ->> 'min')::double precision, 150) + random() * (coalesce((g.g ->> 'max')::double precision, 330) - coalesce((g.g ->> 'min')::double precision, 150)))
    * coalesce((select exp(sum(ln(c.golden))) from private.biz_catalog() c where c.kind = 'global' and p_st.upgrades ? c.key), 1))
  from g
$$;

/** Bring the business up to now: what it earned since you last looked (up to the offline limit, with any
    Frenzy counted). Returns the row as it stands and what was earned. */
create or replace function private.biz_accrue(p_uid uuid, out st public.biz_state, out earned double precision, out away double precision) language plpgsql as $$
declare v_inc double precision; v_el double precision; v_ov double precision := 0; cfg jsonb := private.biz_cfg();
begin
  st := private.biz_lock(p_uid);
  v_inc := private.biz_income(st);
  away := extract(epoch from now() - st.synced_at);
  v_el := least(away, coalesce((cfg ->> 'offline_hours')::double precision, 8) * 3600);
  if st.buff = 'frenzy' and st.buff_until is not null then
    v_ov := greatest(0, least(extract(epoch from now()), extract(epoch from st.buff_until)) - greatest(extract(epoch from st.synced_at), extract(epoch from st.buff_from)));
    v_ov := least(v_ov, v_el);
  end if;
  earned := greatest(0, v_inc * (v_el + (st.buff_mult - 1) * v_ov));
  if st.buff_until is not null and st.buff_until < now() - interval '5 seconds' then st.buff := null; st.buff_mult := 1; st.buff_from := null; st.buff_until := null; end if;
  if st.golden_at + make_interval(secs => coalesce((cfg -> 'golden' ->> 'window')::int, 22)) < now() then st.golden_at := now() + private.biz_golden_gap(st); end if;
  update public.biz_state set cash = cash + earned, run_earned = run_earned + earned, alltime = alltime + earned, synced_at = now(),
         buff = st.buff, buff_mult = st.buff_mult, buff_from = st.buff_from, buff_until = st.buff_until, golden_at = st.golden_at
   where player_id = p_uid returning * into st;
end $$;

/** Everything the business screen needs. */
create or replace function private.biz_json(p_st public.biz_state) returns jsonb language plpgsql stable as $$
declare cfg jsonb := private.biz_cfg(); v_inc double precision := private.biz_income(p_st); v_g double precision := private.biz_gmult(p_st);
  v_unit double precision := coalesce((cfg ->> 'share_unit')::double precision, 1e9); v_can double precision; v_plots int := private.biz_plots(p_st.player_id);
begin
  v_can := floor(cbrt(p_st.alltime / v_unit));
  return jsonb_build_object(
    'cash', p_st.cash, 'income', v_inc, 'tap_value', private.biz_tap_value(p_st, v_inc), 'run_earned', p_st.run_earned, 'alltime', p_st.alltime,
    'shares', p_st.shares, 'shares_on_ipo', greatest(0, v_can - p_st.shares), 'next_share_at', v_unit * power(greatest(v_can, p_st.shares) + 1, 3), 'ipos', p_st.ipos,
    'taps', p_st.taps, 'multiplier', v_g, 'plots', v_plots,
    'ventures', (select jsonb_agg(jsonb_build_object(
        'key', v.key, 'name', v.value ->> 'name', 'emoji', v.value ->> 'emoji', 'owned', private.biz_owned(p_st, v.key),
        'cost', private.biz_cost((v.value ->> 'cost')::double precision, private.biz_owned(p_st, v.key), 1),
        'cost10', private.biz_cost((v.value ->> 'cost')::double precision, private.biz_owned(p_st, v.key), 10),
        'max_q', private.biz_max_q((v.value ->> 'cost')::double precision, private.biz_owned(p_st, v.key), p_st.cash),
        'rate', private.biz_vrate(p_st, v.key) * v_g,
        'each', (v.value ->> 'rate')::double precision * v_g * case when private.biz_owned(p_st, v.key) > 0 then private.biz_vrate(p_st, v.key) / ((v.value ->> 'rate')::double precision * private.biz_owned(p_st, v.key)) else 1 end,
        'next_milestone', (select min(m::int) from jsonb_array_elements_text(cfg -> 'milestones') m where m::int > private.biz_owned(p_st, v.key)),
        'revealed', private.biz_owned(p_st, v.key) > 0 or p_st.alltime >= (v.value ->> 'cost')::double precision * 0.4 or (v.value ->> 'order')::int = 1)
      order by (v.value ->> 'order')::int) from jsonb_each(cfg -> 'ventures') v),
    'upgrades_owned', jsonb_array_length(p_st.upgrades),
    'upgrades', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'kind', c.kind, 'venture', c.venture, 'name', c.name, 'emoji', c.emoji, 'cost', c.cost,
        'x', c.x, 'pct', c.pct, 'golden', c.golden, 'golden_dur', c.golden_dur) order by c.cost)
      from private.biz_catalog() c where not (p_st.upgrades ? c.key) and (
        (c.kind = 'venture' and private.biz_owned(p_st, c.venture) >= c.need) or (c.kind = 'tap' and p_st.taps >= c.need) or (c.kind = 'global' and p_st.alltime >= c.need))), '[]'::jsonb),
    'upgrades_next', coalesce((select jsonb_agg(x order by (x ->> 'cost')::double precision) from (
      select jsonb_build_object('key', c.key, 'kind', c.kind, 'venture', c.venture, 'name', c.name, 'emoji', c.emoji, 'cost', c.cost, 'need', c.need) x
      from private.biz_catalog() c where not (p_st.upgrades ? c.key) and not (
        (c.kind = 'venture' and private.biz_owned(p_st, c.venture) >= c.need) or (c.kind = 'tap' and p_st.taps >= c.need) or (c.kind = 'global' and p_st.alltime >= c.need))
        and (c.kind <> 'venture' or private.biz_owned(p_st, c.venture) > 0)
      order by c.cost limit 4) q), '[]'::jsonb),
    'golden_at', p_st.golden_at, 'golden_window', coalesce((cfg -> 'golden' ->> 'window')::int, 22),
    'buff', case when p_st.buff is not null and p_st.buff_until > now() then jsonb_build_object('kind', p_st.buff, 'mult', p_st.buff_mult, 'until', p_st.buff_until) else null end,
    'dividend_ready', p_st.dividend_day is distinct from private.day_start(now()),
    'dividend_ink', least(coalesce((cfg -> 'dividend' ->> 'max')::int, 40), coalesce((cfg -> 'dividend' ->> 'base')::int, 3) + floor(coalesce((cfg -> 'dividend' ->> 'per_sqrt_share')::numeric, 2) * sqrt(p_st.shares))::int + p_st.ipos * coalesce((cfg -> 'dividend' ->> 'per_ipo')::int, 1)),
    'ink_today', private.biz_ink_today(p_st.player_id), 'daily_cap', coalesce((cfg ->> 'daily_cap')::int, 120),
    'server_time', now());
end $$;

create or replace function private.biz_view(p_biz uuid, p_viewer uuid) returns jsonb language plpgsql as $$
declare b public.businesses%rowtype; g public.canvas_groups%rowtype; st public.biz_state%rowtype; v jsonb; a record;
begin
  select * into b from public.businesses where id = p_biz;
  select * into g from public.canvas_groups where id = b.group_id;
  v := jsonb_build_object('id', b.id, 'group_id', b.group_id, 'seed', b.seed, 'name', coalesce(g.name, 'Business'), 'plots', coalesce(g.plot_count, 1),
    'owner', private.profile_json(b.owner_id), 'mine', b.owner_id = p_viewer, 'tips', b.tips, 'games', private.biz_cfg() -> 'games');
  if b.owner_id = p_viewer then
    select * into a from private.biz_accrue(p_viewer);
    v := v || jsonb_build_object('state', private.biz_json(a.st), 'away', case when a.away > 120 then jsonb_build_object('seconds', a.away, 'earned', a.earned) else null end);
  else
    select * into st from public.biz_state where player_id = b.owner_id;
    v := v || jsonb_build_object('public', jsonb_build_object(
      'alltime', coalesce(st.alltime, 0), 'shares', coalesce(st.shares, 0), 'ipos', coalesce(st.ipos, 0), 'income', case when st.player_id is null then 0 else private.biz_income(st) end,
      'ventures', coalesce(st.ventures, '{}'::jsonb)),
      'tipped_today', exists (select 1 from public.biz_tips where visitor_id = p_viewer and business_id = b.id and day = private.day_start(now())));
  end if;
  return v;
end $$;

-- ---- the business screen ------------------------------------------------------------------------------------
/** A business (yours, or someone else's to look round). */
create or replace function public.biz_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.businesses%rowtype;
begin
  select * into b from public.businesses where id = p_id;
  if not found or not private.visible_to(b.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.owner_id <> v_uid then perform private.notify(b.owner_id, 'visit', v_uid, jsonb_build_object('business', b.id)); end if;
  return private.biz_view(b.id, v_uid);
end $$;

create or replace function public.biz_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('business_id', b.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'alltime', coalesce((select alltime from public.biz_state s where s.player_id = g.owner_id), 0))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'business'
  join public.businesses b on b.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$$;

/** Bank your taps (sent every few seconds) and bring the business up to now. */
create or replace function public.biz_sync(p_taps int default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev timestamptz; a record; v_allowed int; v_val double precision; v_gain double precision := 0; st public.biz_state%rowtype;
begin
  perform private.rate_limit('biz_sync', 3000, 3600);
  perform private.biz_lock(v_uid);
  select synced_at into v_prev from public.biz_state where player_id = v_uid;
  select * into a from private.biz_accrue(v_uid);
  st := a.st;
  -- no more taps than fingers can manage since the last sync
  v_allowed := least(greatest(0, coalesce(p_taps, 0)), ceil(extract(epoch from now() - v_prev) * coalesce((private.biz_cfg() ->> 'taps_per_second')::numeric, 16))::int + 24);
  if v_allowed > 0 then
    v_val := private.biz_tap_value(st, private.biz_income(st));
    if st.buff = 'storm' and st.buff_until > now() - interval '2 seconds' then v_val := v_val * st.buff_mult; end if;
    v_gain := v_val * v_allowed;
    update public.biz_state set cash = cash + v_gain, run_earned = run_earned + v_gain, alltime = alltime + v_gain, taps = taps + v_allowed
     where player_id = v_uid returning * into st;
  end if;
  return private.biz_json(st) || jsonb_build_object('tapped', v_allowed, 'tap_gain', v_gain,
    'away', case when a.away > 120 then jsonb_build_object('seconds', a.away, 'earned', a.earned) else null end);
end $$;

/** Buy ventures: p_qty of them (0 = as many as you can afford). Hitting a milestone pays a little Ink. */
create or replace function public.biz_buy(p_key text, p_qty int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.biz_cfg(); v jsonb := cfg -> 'ventures' -> p_key; a record; st public.biz_state%rowtype;
  v_n int; v_q int; v_cost double precision; m int; v_marks jsonb := '[]'::jsonb; v_ink int := 0;
begin
  perform private.rate_limit('biz_act', 2400, 3600);
  if v is null then raise exception 'invalid_venture' using errcode = 'P0001'; end if;
  select * into a from private.biz_accrue(v_uid); st := a.st;
  v_n := private.biz_owned(st, p_key);
  v_q := case when coalesce(p_qty, 1) <= 0 then private.biz_max_q((v ->> 'cost')::double precision, v_n, st.cash) else least(p_qty, 1000) end;
  if v_q <= 0 then raise exception 'not_enough_cash' using errcode = 'P0001'; end if;
  v_cost := private.biz_cost((v ->> 'cost')::double precision, v_n, v_q);
  if st.cash + 1e-6 < v_cost then raise exception 'not_enough_cash' using errcode = 'P0001', detail = v_cost::text; end if;
  update public.biz_state set cash = greatest(0, cash - v_cost), ventures = ventures || jsonb_build_object(p_key, v_n + v_q) where player_id = v_uid returning * into st;
  -- milestones crossed (Ink the first time ever, capped a day)
  for m in select x::int from jsonb_array_elements_text(cfg -> 'milestones') x where x::int > v_n and x::int <= v_n + v_q loop
    v_marks := v_marks || to_jsonb(m);
    if not (st.ink_marks ? (p_key || ':' || m)) then
      v_ink := v_ink + private.biz_pay(v_uid, coalesce((cfg ->> 'milestone_ink')::int, 3), 'milestone:' || p_key || ':' || m, 'biz-mile:' || v_uid || ':' || p_key || ':' || m);
      update public.biz_state set ink_marks = ink_marks || to_jsonb(p_key || ':' || m) where player_id = v_uid returning * into st;
    end if;
  end loop;
  return private.biz_json(st) || jsonb_build_object('bought', p_key, 'qty', v_q, 'spent', v_cost, 'milestones', v_marks, 'ink', v_ink);
end $$;

/** Buy an upgrade that's unlocked. */
create or replace function public.biz_upgrade(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a record; st public.biz_state%rowtype; c record;
begin
  perform private.rate_limit('biz_act', 2400, 3600);
  select * into a from private.biz_accrue(v_uid); st := a.st;
  select * into c from private.biz_catalog() x where x.key = p_key;
  if not found then raise exception 'invalid_upgrade' using errcode = 'P0001'; end if;
  if st.upgrades ? p_key then raise exception 'already_owned' using errcode = 'P0001'; end if;
  if not ((c.kind = 'venture' and private.biz_owned(st, c.venture) >= c.need) or (c.kind = 'tap' and st.taps >= c.need) or (c.kind = 'global' and st.alltime >= c.need)) then
    raise exception 'upgrade_locked' using errcode = 'P0001';
  end if;
  if st.cash + 1e-6 < c.cost then raise exception 'not_enough_cash' using errcode = 'P0001', detail = c.cost::text; end if;
  update public.biz_state set cash = greatest(0, cash - c.cost), upgrades = upgrades || to_jsonb(p_key) where player_id = v_uid returning * into st;
  return private.biz_json(st) || jsonb_build_object('upgraded', p_key, 'name', c.name, 'spent', c.cost);
end $$;

/** Serve a golden customer while they're there: a windfall, a Frenzy or a Tap Storm (and a drop of Ink). */
create or replace function public.biz_golden() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g jsonb := private.biz_cfg() -> 'golden'; a record; st public.biz_state%rowtype; v_roll double precision := random();
  v_kind text; v_gain double precision := 0; v_dur double precision; v_inc double precision; v_ink int;
begin
  perform private.rate_limit('biz_golden', 60, 3600);
  st := private.biz_lock(v_uid);
  if now() < st.golden_at or now() > st.golden_at + make_interval(secs => coalesce((g ->> 'window')::int, 22)) then raise exception 'no_customer' using errcode = 'P0001'; end if;
  select * into a from private.biz_accrue(v_uid); st := a.st;
  v_inc := private.biz_income(st);
  v_dur := coalesce((select exp(sum(ln(c.golden_dur))) from private.biz_catalog() c where c.kind = 'global' and st.upgrades ? c.key), 1);
  if v_roll < 0.5 or v_inc <= 0 then
    v_kind := 'lucky'; v_gain := least(st.cash * 0.15, v_inc * 900) + 13 + v_inc * 30 * v_dur;
    update public.biz_state set cash = cash + v_gain, run_earned = run_earned + v_gain, alltime = alltime + v_gain where player_id = v_uid;
  elsif v_roll < 0.85 then
    v_kind := 'frenzy';
    update public.biz_state set buff = 'frenzy', buff_mult = coalesce((g ->> 'frenzy')::double precision, 7), buff_from = now(),
           buff_until = now() + make_interval(secs => coalesce((g ->> 'frenzy_secs')::double precision, 77) * v_dur) where player_id = v_uid;
  else
    v_kind := 'storm';
    update public.biz_state set buff = 'storm', buff_mult = coalesce((g ->> 'storm')::double precision, 50), buff_from = now(),
           buff_until = now() + make_interval(secs => coalesce((g ->> 'storm_secs')::double precision, 13) * v_dur) where player_id = v_uid;
  end if;
  update public.biz_state set golden_at = now() + private.biz_golden_gap(st) where player_id = v_uid returning * into st;
  v_ink := private.biz_pay(v_uid, coalesce((g ->> 'ink')::int, 1), 'golden', 'biz-golden:' || v_uid || ':' || gen_random_uuid());
  return private.biz_json(st) || jsonb_build_object('golden', jsonb_build_object('kind', v_kind, 'gain', v_gain, 'ink', v_ink));
end $$;

/** Go public: everything starts again, but you keep your shares (each one +2% to everything, forever). */
create or replace function public.biz_ipo() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.biz_cfg(); a record; st public.biz_state%rowtype; v_new double precision; v_ink int;
begin
  perform private.rate_limit('biz_ipo', 20, 3600);
  select * into a from private.biz_accrue(v_uid); st := a.st;
  v_new := floor(cbrt(st.alltime / coalesce((cfg ->> 'share_unit')::double precision, 1e9))) - st.shares;
  if v_new < 1 then raise exception 'not_ready_for_ipo' using errcode = 'P0001'; end if;
  update public.biz_state set shares = shares + v_new, ipos = ipos + 1, cash = 0, run_earned = 0, ventures = '{}'::jsonb, upgrades = '[]'::jsonb,
         buff = null, buff_mult = 1, buff_from = null, buff_until = null
   where player_id = v_uid returning * into st;
  v_ink := private.biz_pay(v_uid, coalesce((cfg ->> 'ipo_ink')::int, 15), 'ipo', 'biz-ipo:' || v_uid || ':' || st.ipos);
  insert into public.feed_events (kind, player_id, data) values ('ipo', v_uid, jsonb_build_object('shares', st.shares, 'ipos', st.ipos));
  return private.biz_json(st) || jsonb_build_object('ipo', jsonb_build_object('new_shares', v_new, 'shares', st.shares, 'ink', v_ink));
end $$;

/** Today's dividend: a little Ink (more with more shares) and a bonus of cash. Once a day. */
create or replace function public.biz_dividend() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); d jsonb := private.biz_cfg() -> 'dividend'; a record; st public.biz_state%rowtype; v_day timestamptz := private.day_start(now());
  v_ink int; v_paid int; v_cash double precision;
begin
  select * into a from private.biz_accrue(v_uid); st := a.st;
  if st.dividend_day = v_day then raise exception 'already_done' using errcode = 'P0001'; end if;
  v_ink := least(coalesce((d ->> 'max')::int, 40), coalesce((d ->> 'base')::int, 3) + floor(coalesce((d ->> 'per_sqrt_share')::numeric, 2) * sqrt(st.shares))::int + st.ipos * coalesce((d ->> 'per_ipo')::int, 1));
  v_cash := private.biz_income(st) * coalesce((d ->> 'cash_seconds')::double precision, 600) + 50;
  update public.biz_state set dividend_day = v_day, cash = cash + v_cash, run_earned = run_earned + v_cash, alltime = alltime + v_cash where player_id = v_uid returning * into st;
  v_paid := private.biz_pay(v_uid, v_ink, 'dividend', 'biz-div:' || v_uid || ':' || v_day::date);
  return private.biz_json(st) || jsonb_build_object('dividend', jsonb_build_object('ink', v_paid, 'cash', v_cash));
end $$;

/** Buy a lemonade at someone's business (once a day each): they get a rush of customers, you a drop of Ink. */
create or replace function public.biz_tip(p_biz uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.businesses%rowtype; t jsonb := private.biz_cfg() -> 'tip'; st public.biz_state%rowtype; v_cash double precision; v_paid int;
begin
  perform private.rate_limit('biz_tip', 60, 3600);
  select * into b from public.businesses where id = p_biz;
  if not found or not private.visible_to(b.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.owner_id = v_uid then raise exception 'own_business' using errcode = 'P0001'; end if;
  insert into public.biz_tips (visitor_id, business_id, day) values (v_uid, b.id, private.day_start(now())) on conflict do nothing;
  if not found then raise exception 'already_done' using errcode = 'P0001'; end if;
  st := private.biz_lock(b.owner_id);
  v_cash := greatest(coalesce((t ->> 'owner_min')::double precision, 100), private.biz_income(st) * coalesce((t ->> 'owner_seconds')::double precision, 300));
  update public.biz_state set cash = cash + v_cash, run_earned = run_earned + v_cash, alltime = alltime + v_cash where player_id = b.owner_id;
  update public.businesses set tips = tips + 1 where id = b.id;
  v_paid := private.biz_pay(v_uid, coalesce((t ->> 'visitor_ink')::int, 2), 'tip', 'biz-tip:' || v_uid || ':' || b.id || ':' || private.day_start(now())::date);
  perform private.notify(b.owner_id, 'visit', v_uid, jsonb_build_object('business', b.id, 'tip', true));
  return jsonb_build_object('paid', v_paid, 'owner_cash', v_cash, 'balances', private.balances(v_uid));
end $$;

create or replace function public.biz_game_start(p_biz uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.businesses%rowtype; g jsonb := private.biz_cfg() -> 'games' -> p_game; s public.biz_games%rowtype;
begin
  perform private.rate_limit('biz_game', 120, 3600);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  select * into b from public.businesses where id = p_biz;
  if not found or b.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  insert into public.biz_games (owner_id, business_id, game, seed) values (v_uid, b.id, p_game, floor(random() * 2147483646)::int) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'seconds', coalesce((g ->> 'seconds')::int, 45), 'game', p_game,
    'ink_today', private.biz_ink_today(v_uid), 'daily_cap', coalesce((private.biz_cfg() ->> 'daily_cap')::int, 120));
end $$;

/** Finish a business game: Ink for the score (daily cap), and cash worth some seconds of your income. */
create or replace function public.biz_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.biz_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0;
  v_cash double precision := 0; a record; st public.biz_state%rowtype;
begin
  select * into s from public.biz_games where id = p_session for update;
  if not found or s.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'paid', s.ink, 'cash', s.cash, 'repeat', true); end if;
  g := private.biz_cfg() -> 'games' -> s.game;
  v_secs := extract(epoch from now() - s.started_at);
  if v_secs < coalesce((g ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 300)));
  if v_secs <= 1800 then
    v_ink := least(coalesce((g ->> 'max_ink')::int, 22), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 12))))::int;
    v_paid := private.biz_pay(v_uid, v_ink, 'game:' || s.id, 'biz-game:' || s.id);
    select * into a from private.biz_accrue(v_uid); st := a.st;
    -- a good round is worth a few minutes of the whole company's earnings
    v_cash := v_score * 2 + private.biz_income(st) * v_score * 0.6;
    update public.biz_state set cash = cash + v_cash, run_earned = run_earned + v_cash, alltime = alltime + v_cash where player_id = v_uid;
  end if;
  update public.biz_games set finished_at = now(), score = v_score, ink = v_paid, cash = v_cash where id = s.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'cash', v_cash,
    'best', (select max(score) from public.biz_games where owner_id = v_uid and game = s.game and finished_at is not null), 'balances', private.balances(v_uid));
end $$;

-- ---- a plot can be a business ----------------------------------------------------------------------------
create or replace function private.no_art_on_habitat_trg() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.canvas_groups where id = new.group_id and kind in ('habitat', 'farm', 'business')) then
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
    'business_id', (select b.id from public.businesses b where b.group_id = g.id),
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
declare v_uid uuid := private.require_active_player(); g public.canvas_groups%rowtype; h public.habitats%rowtype; v_starter uuid; v_fee int := 0;
begin
  perform private.rate_limit('set_group_kind', 60, 3600);
  select * into g from public.canvas_groups where id = p_group_id for update;
  if not found or g.owner_id <> v_uid or g.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_kinds where id = p_kind and enabled) then raise exception 'invalid_plot_kind' using errcode = 'P0001'; end if;
  if g.kind = p_kind then return private.group_json(g.id); end if;
  -- choosing what a brand-new plot becomes is free; after that, switching costs a little Ink
  if g.kind_changed_at is not null or g.created_at < now() - make_interval(mins => coalesce((private.cfg('plot_switch') ->> 'free_minutes')::int, 15)) then
    v_fee := coalesce((private.cfg('plot_switch') ->> 'fee')::int, 20);
    if v_fee > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_fee), 'plot_switch', 'group', g.id::text, 'plot-switch:' || g.id || ':' || gen_random_uuid()); end if;
  end if;
  if exists (select 1 from public.artwork_publications where group_id = g.id and status in ('processing', 'pending_review', 'approved', 'uploading')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select * into h from public.habitats where group_id = g.id;
  if p_kind = 'farm' then
    insert into public.farms (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
  end if;
  if p_kind = 'business' then
    insert into public.businesses (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
    perform private.biz_lock(v_uid);
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
  update public.canvas_groups set kind = p_kind, kind_changed_at = now(), updated_at = now() where id = g.id;
  perform private.audit('group.kind', 'group', g.id::text, jsonb_build_object('from', g.kind, 'to', p_kind));
  return private.group_json(g.id) || jsonb_build_object('fee', v_fee, 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.biz_cfg()', 'private.biz_ink_today(uuid)', 'private.biz_pay(uuid, int, text, text)', 'private.biz_lock(uuid)', 'private.biz_catalog()',
    'private.biz_owned(public.biz_state, text)', 'private.biz_vrate(public.biz_state, text)', 'private.biz_plots(uuid)', 'private.biz_gmult(public.biz_state)',
    'private.biz_income(public.biz_state)', 'private.biz_tap_value(public.biz_state, double precision)', 'private.biz_cost(double precision, int, int)',
    'private.biz_max_q(double precision, int, double precision)', 'private.biz_golden_gap(public.biz_state)', 'private.biz_accrue(uuid)',
    'private.biz_json(public.biz_state)', 'private.biz_view(uuid, uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.biz_get(uuid)', 'public.biz_sync(int)', 'public.biz_buy(text, int)', 'public.biz_upgrade(text)', 'public.biz_golden()',
    'public.biz_ipo()', 'public.biz_dividend()', 'public.biz_tip(uuid)', 'public.biz_game_start(uuid, text)', 'public.biz_game_finish(uuid, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.biz_for_plot(int, int) from public';
  execute 'grant execute on function public.biz_for_plot(int, int) to anon, authenticated, service_role';
end $$;
