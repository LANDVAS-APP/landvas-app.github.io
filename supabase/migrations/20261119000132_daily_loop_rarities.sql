-- v1.1: the daily loop and the rarity update.
--
-- Rarities: Uncommon joins between Common and Rare (carved out of Common, so no other cell changes), and six
-- ultra-rare rarities sit on top, each on its own one-in-thousands roll and each with its own way of earning:
--   Solar ☀️      ×3 rent while the sun is up at the plot's real place on Earth
--   Lunar 🌙      ×3 rent while it's night there
--   Comet ☄️      ×30 rent for one hour a day — its own "comet hour"
--   Ancient 🏛️    grows +3% a day you own it, up to ×6
--   Prismatic 🌈  every plot you own earns +5% more (stacks, up to +50%)
--   Genesis 🌌    one in half a million; every plot you own earns +25% more
-- Shiny plots: any claim has a 1-in-1,000 chance to be shiny, and a shiny plot earns ×5 rent.
-- Hot Zones: one real city a day where rarities are boosted (the better of two rolls, 5× the ultra odds, 2× shiny).
-- The plot-type collection: own one of every plot type for +25% rent on everything (+5% at half the set).
-- The daily streak: check in every day for Ink (more each day of the week), a guaranteed Rare-or-better roll
-- every 7th day and a guaranteed Legendary-or-better roll every 30th.

-- ---- rarities ----------------------------------------------------------------------------------------------------
alter table public.plot_rarities drop constraint if exists plot_rarities_id_check;
alter table public.plot_rarities add column if not exists ppm int not null default 0 check (ppm >= 0);
alter table public.plot_rarities add column if not exists emoji text;
alter table public.plot_rarities add column if not exists ability text;

update public.plot_rarities set sort = case id when 'common' then 1 when 'rare' then 3 when 'epic' then 4 when 'legendary' then 5 when 'mythic' then 6 else sort end;
update public.plot_rarities set weight = 350 where id = 'common' and weight = 500;
insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, emoji, ability) values
  ('uncommon',  'Uncommon',  150, 0.0000000013, 1.07, 1, '#2DD4BF', '#B2F5EA', 2, 0, null, null),
  ('solar',     'Solar',       0, 0.0000000120, 2.5,  1, '#FF9F1C', '#FFE08A', 7, 400, '☀️', 'Earns ×3 rent while the sun is up where it really is on Earth.'),
  ('lunar',     'Lunar',       0, 0.0000000120, 2.5,  1, '#8FA8FF', '#E1E8FF', 8, 400, '🌙', 'Earns ×3 rent while it’s night where it really is on Earth.'),
  ('comet',     'Comet',       0, 0.0000000150, 2.8,  1, '#22E3FF', '#C9F8FF', 9, 200, '☄️', 'Once a day its comet passes: ×30 rent for a whole hour.'),
  ('ancient',   'Ancient',     0, 0.0000000200, 3,    1, '#C9A66B', '#F1E2BF', 10, 100, '🏛️', 'Grows +3% rent for every day you own it, up to ×6.'),
  ('prismatic', 'Prismatic',   0, 0.0000000300, 3.5,  1, '#FF7AE0', '#FFFFFF', 11, 50, '🌈', 'Every plot you own earns +5% more (stacks, up to +50%).'),
  ('genesis',   'Genesis',     0, 0.0000003000, 5,    1, '#FFFFFF', '#FFD6FF', 12, 2, '🌌', 'One in half a million. Every plot you own earns +25% more.')
on conflict (id) do nothing;

insert into public.game_config (key, value, description) values
  ('rarity_abilities', '{"solar": {"mult": 3}, "lunar": {"mult": 3}, "comet": {"mult": 30, "hours": 1}, "ancient": {"per_day": 0.03, "max": 6}, "prismatic": {"pct": 5, "max_pct": 50}, "genesis": {"pct": 25}}',
   'The ultra rarities'' abilities: Solar/Lunar rent multipliers by day/night at the plot, Comet''s hourly multiplier, Ancient''s growth per day and cap, Prismatic''s and Genesis''s bonus to every plot (percent).'),
  ('shiny', '{"enabled": true, "one_in": 1000, "rent_mult": 5}', 'Shiny plots: the chance (1 in N) a claim is shiny, and how much more rent a shiny plot earns.'),
  ('collection', '{"enabled": true, "tiers": [{"types": 4, "pct": 5}, {"types": 8, "pct": 25}]}', 'The plot-type collection: owning this many different plot types adds this percent to all your rent.'),
  ('hot_zones', '{"enabled": true, "radius": 2500, "ultra_mult": 5, "shiny_mult": 2, "cities": [{"name": "Tokyo", "gx": 3724678, "gy": 1651506}, {"name": "New York", "gx": 1234919, "gy": 1576977}, {"name": "London", "gx": 2095665, "gy": 1394716}, {"name": "Paris", "gx": 2124557, "gy": 1442959}, {"name": "Los Angeles", "gx": 719513, "gy": 1674758}, {"name": "Sydney", "gx": 3858868, "gy": 2516969}, {"name": "São Paulo", "gx": 1553834, "gy": 2379604}, {"name": "Toronto", "gx": 1172270, "gy": 1530732}, {"name": "Berlin", "gx": 2253331, "gy": 1375543}, {"name": "Mexico City", "gx": 942166, "gy": 1866276}, {"name": "Mumbai", "gx": 2946238, "gy": 1870676}, {"name": "Salt Lake City", "gx": 793527, "gy": 1576239}, {"name": "Seoul", "gx": 3576552, "gy": 1624253}, {"name": "Dubai", "gx": 2741103, "gy": 1793537}, {"name": "Rome", "gx": 2242745, "gy": 1558519}, {"name": "Cairo", "gx": 2461074, "gy": 1729868}, {"name": "Singapore", "gx": 3306740, "gy": 2081397}, {"name": "Chicago", "gx": 1076190, "gy": 1558906}, {"name": "Rio de Janeiro", "gx": 1594151, "gy": 2371443}, {"name": "Cape Town", "gx": 2311808, "gy": 2517756}, {"name": "Denver", "gx": 873926, "gy": 1591835}, {"name": "Istanbul", "gx": 2434774, "gy": 1572427}, {"name": "Bangkok", "gx": 3268082, "gy": 1935317}, {"name": "Buenos Aires", "gx": 1416957, "gy": 2527326}, {"name": "Amsterdam", "gx": 2154288, "gy": 1378456}, {"name": "Honolulu", "gx": 257969, "gy": 1842980}, {"name": "Reykjavík", "gx": 1841502, "gy": 1114686}, {"name": "Nairobi", "gx": 2526158, "gy": 2112207}]
}',
   'Hot Zones: one city a day (in order, by day) where claims roll the better of two rarities, ultra rarities are N× likelier and shiny 2×. Radius in plots.'),
  ('daily_streak', '{"enabled": true, "ink": [20, 30, 40, 50, 60, 80, 120], "week_ticket": "rare", "day30_ticket": "legendary", "day30_ink": 500}',
   'The daily streak: Ink for each day of the week (day 1..7, repeating), a guaranteed roll of at least this rarity every 7th day, and a bigger one plus Ink every 30th.')
on conflict (key) do nothing;

-- ---- Hot Zones ---------------------------------------------------------------------------------------------------
create or replace function private.hot_zone(p_day date) returns jsonb language sql stable as $$
  select case when not coalesce((c ->> 'enabled')::boolean, true) or jsonb_array_length(coalesce(c -> 'cities', '[]')) = 0 then null
    else (c -> 'cities' -> ((p_day - date '2026-01-01') % jsonb_array_length(c -> 'cities')))
         || jsonb_build_object('radius', coalesce((c ->> 'radius')::int, 2500), 'day', p_day) end
  from (select private.cfg('hot_zones') c) x
$$;
create or replace function private.today() returns date language sql stable as $$ select (private.day_start(now()) at time zone 'UTC')::date $$;
create or replace function private.in_hot_zone(p_gx int, p_gy int) returns boolean language sql stable as $$
  select coalesce(z is not null and ((p_gx - (z ->> 'gx')::int)::numeric ^ 2 + (p_gy - (z ->> 'gy')::int)::numeric ^ 2) <= ((z ->> 'radius')::numeric ^ 2), false)
  from (select private.hot_zone(private.today()) z) x
$$;
create or replace function public.hot_zone_today() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('today', private.hot_zone(private.today()), 'tomorrow', private.hot_zone(private.today() + 1),
    'ends_at', private.day_start(now()) + interval '1 day',
    'ultra_mult', coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5), 'shiny_mult', coalesce((private.cfg('hot_zones') ->> 'shiny_mult')::numeric, 2))
$$;

-- ---- the roll: ultra first (its own roll, in parts per million), then the usual table; a Hot Zone rolls twice -------
create or replace function private.plot_rarity_for(p_gx int, p_gy int) returns text
language plpgsql stable as $$
declare v_total int; v_roll bigint; v_acc int := 0; r record; v_hot boolean := private.in_hot_zone(p_gx, p_gy);
  v_um numeric := case when v_hot then coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5) else 1 end;
  v_u bigint := abs(private.cell_roll('ultra', p_gx, p_gy)) % 1000000; v_uacc numeric := 0; v_a text; v_b text;
begin
  for r in select id, ppm from public.plot_rarities where ppm > 0 order by ppm, sort loop
    v_uacc := v_uacc + r.ppm * v_um;
    if v_u < v_uacc then return r.id; end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_a := private.rarity_pick(private.cell_roll('rarity', p_gx, p_gy) % v_total);
  if not v_hot then return v_a; end if;
  v_b := private.rarity_pick(abs(private.cell_roll('hot' || private.today()::text, p_gx, p_gy)) % v_total);
  return case when (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_b else v_a end;
end $$;
create or replace function private.rarity_pick(p_roll bigint) returns text language plpgsql stable as $$
declare v_acc int := 0; r record;
begin
  for r in select id, weight from public.plot_rarities where weight > 0 order by sort, id loop
    v_acc := v_acc + r.weight;
    if p_roll < v_acc then return r.id; end if;
  end loop;
  return 'common';
end $$;

-- ---- shiny -------------------------------------------------------------------------------------------------------
alter table public.world_plots add column if not exists shiny boolean not null default false;
create or replace function private.roll_shiny() returns trigger language plpgsql as $$
declare c jsonb := private.cfg('shiny'); v_n numeric := greatest(coalesce((c ->> 'one_in')::numeric, 1000), 1);
begin
  -- a fresh claim (not a transfer of an owned plot) rolls for shiny
  if new.owner_id is not null and (tg_op = 'INSERT' or old.owner_id is null) and coalesce((c ->> 'enabled')::boolean, true) then
    if private.in_hot_zone(new.gx, new.gy) then v_n := v_n / coalesce((private.cfg('hot_zones') ->> 'shiny_mult')::numeric, 2); end if;
    new.shiny := random() < 1 / v_n;
  elsif new.owner_id is null then new.shiny := false;
  end if;
  return new;
end $$;
drop trigger if exists world_plots_shiny on public.world_plots;
create trigger world_plots_shiny before insert or update of owner_id on public.world_plots for each row execute function private.roll_shiny();

-- ---- rent: shiny, Ancient, Prismatic, Genesis and the collection are rates; Solar, Lunar and Comet are time windows --
create or replace function private.collection_pct(p_uid uuid) returns numeric language sql stable as $$
  select coalesce((select max((t ->> 'pct')::numeric) from jsonb_array_elements(coalesce(c -> 'tiers', '[]')) t where (t ->> 'types')::int <= n), 0)
  from (select private.cfg('collection') c, (select count(distinct plot_type) from public.world_plots where owner_id = p_uid) n) x
  where coalesce((c ->> 'enabled')::boolean, true)
$$;
/** everything that raises all of a player's rent, as one multiplier (1 = none) */
create or replace function private.rent_mult(p_uid uuid) returns numeric language sql stable as $$
  select 1 + (coalesce(private.collection_pct(p_uid), 0)
    + least(coalesce((a -> 'prismatic' ->> 'pct')::numeric, 5) * (select count(*) from public.world_plots where owner_id = p_uid and rarity = 'prismatic'), coalesce((a -> 'prismatic' ->> 'max_pct')::numeric, 50))
    + coalesce((a -> 'genesis' ->> 'pct')::numeric, 25) * least((select count(*) from public.world_plots where owner_id = p_uid and rarity = 'genesis'), 4)) / 100
  from (select private.cfg('rarity_abilities') a) x
$$;
/** one plot's own rate: rarity × level × shiny × (Ancient's age) */
create or replace function private.plot_rate(p public.world_plots, p_base numeric) returns numeric language sql stable as $$
  select p_base * (1 + coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) * (greatest(coalesce(p.level, 1), 1) - 1))
    * case when p.shiny then coalesce((private.cfg('shiny') ->> 'rent_mult')::numeric, 5) else 1 end
    * case when p.rarity = 'ancient' then least(1 + coalesce((private.cfg('rarity_abilities') -> 'ancient' ->> 'per_day')::numeric, 0.03)
            * floor(extract(epoch from now() - coalesce(p.claimed_at, now())) / 86400), coalesce((private.cfg('rarity_abilities') -> 'ancient' ->> 'max')::numeric, 6)) else 1 end
$$;
create or replace function private.rent_rate(p_uid uuid) returns numeric language sql stable as $$
  select coalesce(sum(private.plot_rate(p, r.usd_per_second)), 0) * private.rent_mult(p_uid)
  from public.world_plots p join public.plot_rarities r on r.id = p.rarity
  where p.owner_id = p_uid
$$;
/** Solar, Lunar and Comet: extra rent (per second) during a daily window, start hour (UTC) and length in hours */
create or replace function private.rent_windows(p_uid uuid) returns table (rate numeric, start_h numeric, len_h numeric) language sql stable as $$
  with a as (select private.cfg('rarity_abilities') a), m as (select private.rent_mult(p_uid) m),
  w as (
    select private.plot_rate(p, r.usd_per_second) * m.m * (case p.rarity when 'comet' then coalesce((a.a -> 'comet' ->> 'mult')::numeric, 30) else coalesce((a.a -> p.rarity ->> 'mult')::numeric, 3) end - 1) as rate,
      round((case p.rarity
        when 'solar' then 6 - ((p.gx + 0.5) / 4194304.0 * 360 - 180) / 15
        when 'lunar' then 18 - ((p.gx + 0.5) / 4194304.0 * 360 - 180) / 15
        else (abs(private.cell_roll('comet', p.gx, p.gy)) % 96) / 4.0 end + 48)::numeric % 24 * 4) / 4 as start_h,
      case p.rarity when 'comet' then coalesce((a.a -> 'comet' ->> 'hours')::numeric, 1) else 12 end as len_h
    from public.world_plots p join public.plot_rarities r on r.id = p.rarity cross join a cross join m
    where p.owner_id = p_uid and p.rarity in ('solar', 'lunar', 'comet'))
  select sum(rate), start_h, len_h from w group by start_h, len_h
$$;
/** seconds of [from, to] inside a window that opens every day at start_h (UTC) for len_h hours */
create or replace function private.window_seconds(p_from timestamptz, p_to timestamptz, p_start numeric, p_len numeric) returns numeric language sql immutable as $$
  select coalesce(sum(greatest(0, extract(epoch from least(d + make_interval(secs => ((p_start + p_len) * 3600)::double precision), p_to)
                                             - greatest(d + make_interval(secs => (p_start * 3600)::double precision), p_from)))), 0)
  from generate_series(date_trunc('day', p_from at time zone 'UTC') - interval '1 day', date_trunc('day', p_to at time zone 'UTC'), interval '1 day') g(dd)
  cross join lateral (select dd at time zone 'UTC' as d) x
  where p_to > p_from
$$;
create or replace function private.ability_extra(p_uid uuid, p_settled_at timestamptz) returns numeric language sql stable as $$
  select coalesce(sum(w.rate * private.window_seconds(greatest(p_settled_at, now() - make_interval(days => coalesce((private.cfg('rent') ->> 'max_offline_days')::int, 30))), now(), w.start_h, w.len_h)), 0)
  from private.rent_windows(p_uid) w
$$;
create or replace function private.rent_extras_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'windows', (select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'start', start_h, 'len', len_h)), '[]'::jsonb) from private.rent_windows(p_uid)),
    'multiplier', private.rent_mult(p_uid), 'collection_pct', private.collection_pct(p_uid),
    'shiny', (select count(*) from public.world_plots where owner_id = p_uid and shiny))
$$;
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.rent_settle(uuid)'::regprocedure);
  n := replace(d, '+ private.landlord_extra(p_uid, a.settled_at), 15);', '+ private.landlord_extra(p_uid, a.settled_at) + private.ability_extra(p_uid, a.settled_at), 15);');
  if n = d then raise exception 'rarity update: rent_settle anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('private.rent_json(uuid)'::regprocedure);
  n := replace(d, '(v_acc ->> ''amount'')::numeric + private.landlord_extra(p_uid, a.settled_at));', '(v_acc ->> ''amount'')::numeric + private.landlord_extra(p_uid, a.settled_at) + private.ability_extra(p_uid, a.settled_at));');
  n := replace(n, '''landlord'', private.landlord_json(p_uid), ''server_time'', now());', '''landlord'', private.landlord_json(p_uid), ''extras'', private.rent_extras_json(p_uid), ''server_time'', now());');
  if position('ability_extra' in n) = 0 or position('rent_extras_json' in n) = 0 then raise exception 'rarity update: rent_json anchors not found'; end if;
  execute n;
  -- a plot's own rate as shown when it's claimed (shiny and the rest are added in the rate itself)
  d := pg_get_functiondef('public.plot_blocks(jsonb)'::regprocedure);
  n := replace(d, 'p.rarity, p.name, coalesce(g.kind, ''canvas'')))', 'p.rarity, p.name, coalesce(g.kind, ''canvas''), p.shiny))');
  if n = d then raise exception 'rarity update: plot_blocks anchor not found'; end if;
  execute n;
end $$;

-- the claim result says whether it's shiny, and what it really earns
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, $a$'usd_per_second', private.plot_rent_rate(v_rarity, 1),$a$,
    $a$'usd_per_second', (select private.plot_rate(p, r.usd_per_second) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.gx = p_gx and p.gy = p_gy),
                            'shiny', (select shiny from public.world_plots where gx = p_gx and gy = p_gy), 'hot_zone', private.in_hot_zone(p_gx, p_gy),$a$);
  if n = d then raise exception 'rarity update: take_plot anchor not found'; end if;
  execute n;
end $$;

-- my plots: each one's real rate (shiny, Ancient) and whether it's shiny
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.my_plots()'::regprocedure);
  n := replace(d, $a$'usd_per_second', private.plot_rent_rate(p.rarity, p.level))$a$,
    $a$'usd_per_second', private.plot_rate(p, (select usd_per_second from public.plot_rarities where id = p.rarity)), 'shiny', p.shiny)$a$);
  if n = d then raise exception 'rarity update: my_plots anchor not found'; end if;
  execute n;
end $$;

-- "rare plots" in stats count everything Epic and up (the ultras too)
do $$
declare f record; d text; n text;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname in ('public', 'private') and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%rarity in (''epic'', ''legendary'', ''mythic'')%' loop
    d := pg_get_functiondef(f.sig);
    n := replace(replace(d, $a$rarity in ('epic', 'legendary', 'mythic')$a$, $a$rarity in (select id from public.plot_rarities where sort >= 4)$a$),
                 $a$rarity in ('legendary', 'mythic')$a$, $a$rarity in (select id from public.plot_rarities where sort >= 5)$a$);
    execute n;
  end loop;
end $$;

-- ---- the plot-type collection ---------------------------------------------------------------------------------------
create or replace function public.my_collection() returns jsonb language sql volatile security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'owned', (select count(*) from public.world_plots w where w.owner_id = u.uid and w.plot_type = t.id)) order by t.id), '[]') from public.plot_types t),
    'rarities', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'owned', (select count(*) from public.world_plots w where w.owner_id = u.uid and w.rarity = r.id),
                   'shiny', (select count(*) from public.world_plots w where w.owner_id = u.uid and w.rarity = r.id and w.shiny)) order by r.sort), '[]') from public.plot_rarities r),
    'tiers', coalesce(private.cfg('collection') -> 'tiers', '[]'), 'pct', private.collection_pct(u.uid), 'multiplier', private.rent_mult(u.uid))
  from (select private.require_active_player() uid) u
$$;

-- ---- the daily streak & guaranteed rolls --------------------------------------------------------------------------
create table if not exists public.daily_streaks (
  player_id uuid primary key references public.players(id) on delete cascade,
  last_day date, streak int not null default 0, best int not null default 0, total_days int not null default 0,
  updated_at timestamptz not null default now());
create table if not exists public.roll_tickets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  min_rarity text not null references public.plot_rarities(id),
  source text not null, created_at timestamptz not null default now(), used_at timestamptz, plot jsonb);
create index if not exists roll_tickets_open on public.roll_tickets (player_id) where used_at is null;
alter table public.daily_streaks enable row level security;
alter table public.roll_tickets enable row level security;

-- the daily streak pays Ink (a reason Ink can come from, like the daily wheel)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.grant(uuid,jsonb,text,text,text,text)'::regprocedure);
  n := replace(d, $a$'wheel', $a$, $a$'wheel', 'daily_streak', $a$);
  if n = d then raise exception 'rarity update: grant anchor not found'; end if;
  execute n;
end $$;

create or replace function private.streak_reward(p_n int) returns jsonb language sql stable as $$
  select jsonb_build_object('day', p_n,
    'ink', coalesce((c -> 'ink' ->> ((p_n - 1) % greatest(jsonb_array_length(coalesce(c -> 'ink', '[20]')), 1)))::int, 20) + case when p_n % 30 = 0 then coalesce((c ->> 'day30_ink')::int, 500) else 0 end,
    'ticket', case when p_n % 30 = 0 then c ->> 'day30_ticket' when p_n % 7 = 0 then c ->> 'week_ticket' end)
  from (select private.cfg('daily_streak') c) x
$$;
create or replace function private.daily_json(p_uid uuid) returns jsonb language sql stable as $$
  with s as (select * from public.daily_streaks where player_id = p_uid), t as (select private.today() d),
  cur as (select case when s.last_day >= t.d - 1 then s.streak else 0 end n, s.last_day = t.d claimed, coalesce(s.best, 0) best from t left join s on true)
  select jsonb_build_object('enabled', coalesce((private.cfg('daily_streak') ->> 'enabled')::boolean, true),
    'streak', cur.n, 'claimed_today', coalesce(cur.claimed, false), 'best', cur.best,
    'next', private.streak_reward(case when coalesce(cur.claimed, false) then cur.n + 1 else cur.n + 1 end),
    'calendar', (select jsonb_agg(private.streak_reward(k)) from generate_series(((cur.n - (case when coalesce(cur.claimed, false) then 1 else 0 end)) / 30) * 30 + 1, ((cur.n - (case when coalesce(cur.claimed, false) then 1 else 0 end)) / 30) * 30 + 30) k),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'min_rarity', min_rarity, 'source', source) order by created_at), '[]') from public.roll_tickets where player_id = p_uid and used_at is null),
    'resets_at', private.day_start(now()) + interval '1 day')
  from cur
$$;
create or replace function public.daily_status() returns jsonb language sql volatile security definer set search_path = public, pg_temp as $$
  select private.daily_json(private.require_active_player())
$$;
create or replace function public.daily_claim() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_day date := private.today(); s public.daily_streaks%rowtype; v_n int; v_r jsonb; v_t uuid;
begin
  if not coalesce((private.cfg('daily_streak') ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  insert into public.daily_streaks (player_id) values (v_uid) on conflict do nothing;
  select * into s from public.daily_streaks where player_id = v_uid for update;
  if s.last_day = v_day then raise exception 'already_claimed' using errcode = 'P0001'; end if;
  v_n := case when s.last_day = v_day - 1 then s.streak + 1 else 1 end;
  update public.daily_streaks set last_day = v_day, streak = v_n, best = greatest(best, v_n), total_days = total_days + 1, updated_at = now() where player_id = v_uid;
  v_r := private.streak_reward(v_n);
  perform private.grant(v_uid, jsonb_build_object('ink', (v_r ->> 'ink')::int), 'daily_streak', 'day', v_day::text, 'daily-' || v_day::text || '-' || gen_random_uuid()::text); -- (the locked streak row already stops a second claim)
  if v_r ->> 'ticket' is not null then
    insert into public.roll_tickets (player_id, min_rarity, source) values (v_uid, v_r ->> 'ticket', 'streak_' || v_n) returning id into v_t;
  end if;
  return jsonb_build_object('reward', v_r || jsonb_build_object('ticket_id', v_t), 'status', private.daily_json(v_uid), 'balances', private.balances(v_uid));
end $$;

-- ---- quick buy: a ticket (free, guaranteed rarity) and/or the Hot Zone ---------------------------------------------
drop function if exists public.quick_buy_plot(text);
drop function if exists private.quick_buy_cell(uuid);
create or replace function private.quick_buy_cell(p_uid uuid, p_hot boolean, p_min_sort int) returns int[]
language plpgsql volatile as $$
declare v_cfg jsonb := coalesce(private.cfg('quick_buy'), '{}'::jsonb); v_r int := greatest(coalesce((v_cfg ->> 'radius')::int, 24), 4);
  v_tries int := greatest(coalesce((v_cfg ->> 'tries')::int, 80), 10); v_ax int; v_ay int; v_x int; v_y int; v_ring int; v_i int; v_ex record; v_c jsonb; v_z jsonb;
begin
  if p_hot then
    v_z := private.hot_zone(private.today());
    if v_z is null then raise exception 'no_hot_zone' using errcode = 'P0001'; end if;
    v_ax := (v_z ->> 'gx')::int; v_ay := (v_z ->> 'gy')::int; v_r := greatest(((v_z ->> 'radius')::int * 0.6)::int, 10);
  else
    select * into v_ex from private.explorer_now(p_uid);
    if found and v_ex.gx is not null then v_ax := v_ex.gx; v_ay := v_ex.gy;
    else
      select gx, gy into v_ax, v_ay from public.world_plots where owner_id = p_uid order by claimed_at desc limit 1;
      if v_ax is null then
        v_c := (v_cfg -> 'cities') -> floor(random() * greatest(jsonb_array_length(coalesce(v_cfg -> 'cities', '[]'::jsonb)), 1))::int;
        v_ax := coalesce((v_c ->> 0)::int, 793527); v_ay := coalesce((v_c ->> 1)::int, 1576239);
      end if;
    end if;
  end if;
  v_ring := v_r;
  for v_pass in 1..8 loop
    for v_i in 1..v_tries * (case when p_min_sort > 1 then 6 else 1 end) loop
      v_x := (v_ax + floor((random() * 2 - 1) * v_ring)::int + 4194304) % 4194304;
      v_y := least(greatest(v_ay + floor((random() * 2 - 1) * v_ring)::int, 0), 4194303);
      if not exists (select 1 from public.world_plots where gx = v_x and gy = v_y and (owner_id is not null or locked))
         and (p_min_sort <= 1 or (select sort from public.plot_rarities where id = private.plot_rarity_for(v_x, v_y)) >= p_min_sort) then
        return array[v_x, v_y];
      end if;
    end loop;
    v_ring := case when p_hot then v_ring else v_ring * 4 end;
  end loop;
  raise exception 'no_free_plot' using errcode = 'P0001';
end $$;

create or replace function public.quick_buy_plot(p_idempotency_key text, p_ticket uuid default null, p_hot boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_cell int[]; v_starter boolean; v_cost jsonb; v_res jsonb; v_tk public.roll_tickets%rowtype; v_min int := 1;
  v_bonus jsonb := coalesce(private.cfg('economy') -> 'starter_bonus', '{}'::jsonb);
begin
  if not coalesce((private.cfg('quick_buy') ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'quick_buy_plot');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('acquire', 120, 3600);
  if p_ticket is not null then
    select * into v_tk from public.roll_tickets where id = p_ticket and player_id = v_uid and used_at is null for update;
    if not found then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
    select sort into v_min from public.plot_rarities where id = v_tk.min_rarity;
  end if;
  select not starter_plot_claimed into v_starter from public.players where id = v_uid for update;
  if (select count(*) from public.world_plots where owner_id = v_uid) >= coalesce((private.cfg('limits') ->> 'max_plots_per_player')::int, 2500) then
    raise exception 'plot_limit_reached' using errcode = 'P0001';
  end if;
  v_cell := private.quick_buy_cell(v_uid, coalesce(p_hot, false), v_min);
  perform private.rent_settle(v_uid);
  if p_ticket is not null then
    v_res := private.take_plot(v_uid, v_cell[1], v_cell[2], 'acquire', jsonb_build_object('ticket', p_ticket));
    v_cost := jsonb_build_object('ink', 0);
    update public.roll_tickets set used_at = now(), plot = jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'rarity', v_res ->> 'rarity') where id = p_ticket;
    v_starter := false;
  elsif v_starter then
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

revoke all on function public.quick_buy_plot(text, uuid, boolean) from public, anon;
grant execute on function public.quick_buy_plot(text, uuid, boolean) to authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.hot_zone_today()', 'public.my_collection()', 'public.daily_status()', 'public.daily_claim()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.hot_zone(date)', 'private.today()', 'private.in_hot_zone(integer, integer)', 'private.rarity_pick(bigint)', 'private.roll_shiny()',
    'private.collection_pct(uuid)', 'private.rent_mult(uuid)', 'private.plot_rate(public.world_plots, numeric)', 'private.rent_windows(uuid)', 'private.window_seconds(timestamptz, timestamptz, numeric, numeric)',
    'private.ability_extra(uuid, timestamptz)', 'private.rent_extras_json(uuid)', 'private.streak_reward(integer)', 'private.daily_json(uuid)', 'private.quick_buy_cell(uuid, boolean, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
