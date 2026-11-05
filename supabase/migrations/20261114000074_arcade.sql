-- v0.56 Arcade plots: a neon arcade hall you walk round with your explorer.
--   * walk up to a cabinet and play: Tower Stacker, Cyclone, Skee-Ball, Hoop Shot, Bop-a-Bot, Claw Crane.
--     Every game is won by skill and timing, never by luck, and playing is always free
--   * scores win tickets 🎟️ (and a little Ink, capped a day). Tickets are the arcade's own money: spend them at
--     the prize counter (prizes go on the shelves of your arcade), on new cabinets, cabinet upgrades (more tickets
--     a round) and decor (floors, neon, lights)
--   * your arcade levels up from every game played in it (yours and visitors'), which unlocks more cabinets; you
--     get a 10% ticket bonus whenever a visitor plays
--   * high-score boards for every cabinet, a daily bonus with a streak
-- Anti-cheat: a round has to last a little while, and a score can't climb faster than the game allows.

insert into public.plot_kinds (id, name, description, sort) values
  ('arcade', 'Arcade', 'A neon arcade: walk in, play the cabinets, win tickets and prizes.', 4)
on conflict (id) do nothing;

insert into public.game_config (key, value, description) values ('arcade', '{
  "enabled": true,
  "daily_cap": 120,
  "level": {"base": 120, "growth": 1.32, "max": 30},
  "owner_share": 0.10,
  "daily_bonus": {"tickets": 20, "per_streak": 6, "max_streak": 7, "ink": 2},
  "upgrade": {"max": 5, "base": 90, "growth": 1.9, "bonus": 0.2},
  "games": {
    "stacker":  {"order": 1, "name": "Tower Stacker", "emoji": "🏗️", "color": "#FF3D9A", "level": 1, "cost": 0,   "min_seconds": 3, "max_score": 900,  "per_second": 14, "tickets_per_point": 1,    "points_per_ink": 30, "max_ink": 10},
    "cyclone":  {"order": 2, "name": "Cyclone",       "emoji": "🌀", "color": "#22E3FF", "level": 1, "cost": 0,   "min_seconds": 8, "max_score": 1100, "per_second": 60, "tickets_per_point": 0.3,  "points_per_ink": 90, "max_ink": 10},
    "skeeball": {"order": 3, "name": "Skee-Ball",     "emoji": "🎳", "color": "#FFB13D", "level": 2, "cost": 120, "min_seconds": 10, "max_score": 900,  "per_second": 40, "tickets_per_point": 0.2,  "points_per_ink": 120, "max_ink": 10},
    "hoops":    {"order": 4, "name": "Hoop Shot",     "emoji": "🏀", "color": "#FF7A3D", "level": 3, "cost": 260, "min_seconds": 30, "max_score": 450,  "per_second": 9,  "tickets_per_point": 0.8,  "points_per_ink": 35, "max_ink": 10},
    "bop":      {"order": 5, "name": "Bop-a-Bot",     "emoji": "🤖", "color": "#4FD18B", "level": 4, "cost": 420, "min_seconds": 30, "max_score": 550,  "per_second": 14, "tickets_per_point": 0.6,  "points_per_ink": 45, "max_ink": 10},
    "claw":     {"order": 6, "name": "Claw Crane",    "emoji": "🧸", "color": "#B57BFF", "level": 6, "cost": 700, "min_seconds": 12, "max_score": 800,  "per_second": 30, "tickets_per_point": 0.35, "points_per_ink": 80, "max_ink": 10}
  },
  "prizes": [
    {"id": "gum",      "name": "Bubble gum",        "emoji": "🍬", "tickets": 15,   "tier": 1},
    {"id": "ring",     "name": "Mood ring",         "emoji": "💍", "tickets": 30,   "tier": 1},
    {"id": "yoyo",     "name": "Glow yo-yo",        "emoji": "🪀", "tickets": 45,   "tier": 1},
    {"id": "duck",     "name": "Rubber duck",       "emoji": "🦆", "tickets": 60,   "tier": 1},
    {"id": "bear",     "name": "Teddy bear",        "emoji": "🧸", "tickets": 120,  "tier": 2},
    {"id": "dino",     "name": "Plush dino",        "emoji": "🦖", "tickets": 180,  "tier": 2},
    {"id": "shades",   "name": "Neon shades",       "emoji": "🕶️", "tickets": 220,  "tier": 2},
    {"id": "octo",     "name": "Squishy octopus",   "emoji": "🐙", "tickets": 300,  "tier": 2},
    {"id": "unicorn",  "name": "Giant unicorn",     "emoji": "🦄", "tickets": 500,  "tier": 3},
    {"id": "guitar",   "name": "Toy guitar",        "emoji": "🎸", "tickets": 650,  "tier": 3},
    {"id": "rocket",   "name": "Model rocket",      "emoji": "🚀", "tickets": 900,  "tier": 3},
    {"id": "alien",    "name": "Mega alien plush",  "emoji": "👾", "tickets": 1400, "tier": 4},
    {"id": "dragon",   "name": "Dragon kite",       "emoji": "🐉", "tickets": 2200, "tier": 4},
    {"id": "console",  "name": "Retro console",     "emoji": "🎮", "tickets": 3500, "tier": 4},
    {"id": "crown",    "name": "Arcade crown",      "emoji": "👑", "tickets": 6000, "tier": 5},
    {"id": "trophy",   "name": "Golden trophy",     "emoji": "🏆", "tickets": 10000, "tier": 5}
  ],
  "decor": {
    "floor": [
      {"id": "cosmic",  "name": "Cosmic carpet",  "tickets": 0},
      {"id": "checker", "name": "Retro checker",  "tickets": 150},
      {"id": "grid",    "name": "Neon grid",      "tickets": 400},
      {"id": "galaxy",  "name": "Galaxy swirl",   "tickets": 900},
      {"id": "gold",    "name": "Gold tiles",     "tickets": 2500}
    ],
    "neon": [
      {"id": "pink",    "name": "Hot pink",       "tickets": 0},
      {"id": "cyan",    "name": "Electric cyan",  "tickets": 80},
      {"id": "lime",    "name": "Toxic lime",     "tickets": 160},
      {"id": "violet",  "name": "Ultra violet",   "tickets": 260},
      {"id": "sunset",  "name": "Sunset",         "tickets": 500},
      {"id": "rainbow", "name": "Rainbow",        "tickets": 1500}
    ],
    "lights": [
      {"id": "steady",  "name": "Steady glow",    "tickets": 0},
      {"id": "chase",   "name": "Chase lights",   "tickets": 200},
      {"id": "disco",   "name": "Disco ball",     "tickets": 700},
      {"id": "lasers",  "name": "Laser show",     "tickets": 1800}
    ]
  }
}', 'Arcade plots: the cabinets (unlock level and ticket cost, anti-cheat limits, tickets and Ink per point), arcade levels, cabinet upgrades, the prize counter, decor, the daily bonus and the daily Ink cap.')
on conflict (key) do nothing;

create table if not exists public.arcades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  group_id uuid unique references public.canvas_groups (id) on delete set null,
  xp bigint not null default 0,
  plays bigint not null default 0,
  machines jsonb not null default '{"stacker": 1, "cyclone": 1}'::jsonb,  -- cabinet -> level
  decor jsonb not null default '{"floor": "cosmic", "neon": "pink", "lights": "steady"}'::jsonb,
  decor_owned jsonb not null default '["floor:cosmic", "neon:pink", "lights:steady"]'::jsonb,
  seed int not null default floor(random() * 2147483646)::int,
  created_at timestamptz not null default now()
);
alter table public.arcades enable row level security;
revoke all on public.arcades from anon, authenticated;

create table if not exists public.arcade_players (
  player_id uuid primary key references public.players (id) on delete cascade,
  tickets bigint not null default 0,
  lifetime bigint not null default 0,
  prizes jsonb not null default '{}'::jsonb,
  bonus_day timestamptz, streak int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.arcade_players enable row level security;
revoke all on public.arcade_players from anon, authenticated;

create table if not exists public.arcade_ink_days (
  player_id uuid not null references public.players (id) on delete cascade,
  day timestamptz not null, ink int not null default 0,
  primary key (player_id, day)
);
alter table public.arcade_ink_days enable row level security;
revoke all on public.arcade_ink_days from anon, authenticated;

create table if not exists public.arcade_plays (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  arcade_id uuid references public.arcades (id) on delete cascade,
  game text not null, seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, tickets int, ink int
);
create index if not exists arcade_plays_board_idx on public.arcade_plays (arcade_id, game, score desc) where finished_at is not null;
create index if not exists arcade_plays_game_idx on public.arcade_plays (game, score desc) where finished_at is not null;
create index if not exists arcade_plays_player_idx on public.arcade_plays (player_id, started_at desc);
alter table public.arcade_plays enable row level security;
revoke all on public.arcade_plays from anon, authenticated;

-- arcade Ink is an allowed way to earn Ink
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward', 'space', 'farm', 'business', 'arcade') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

-- ---- helpers -------------------------------------------------------------------------------------------
create or replace function private.arc_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('arcade'), '{}'::jsonb) $$;
create or replace function private.arc_ink_today(p_uid uuid) returns int language sql stable as $$
  select coalesce((select ink from public.arcade_ink_days where player_id = p_uid and day = private.day_start(now())), 0)
$$;
/** Pay arcade Ink, up to the daily cap. Returns what was paid. */
create or replace function private.arc_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_had int; v_pay int;
begin
  if coalesce(p_amount, 0) <= 0 then return 0; end if;
  insert into public.arcade_ink_days (player_id, day) values (p_uid, v_day) on conflict do nothing;
  select ink into v_had from public.arcade_ink_days where player_id = p_uid and day = v_day for update;
  v_pay := least(p_amount, greatest(0, coalesce((private.arc_cfg() ->> 'daily_cap')::int, 120) - v_had));
  if v_pay > 0 then
    update public.arcade_ink_days set ink = ink + v_pay where player_id = p_uid and day = v_day;
    perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'arcade', 'arcade', p_ref, p_idem);
  end if;
  return v_pay;
end $$;
create or replace function private.arc_player(p_uid uuid) returns public.arcade_players language plpgsql as $$
declare r public.arcade_players%rowtype;
begin
  insert into public.arcade_players (player_id) values (p_uid) on conflict do nothing;
  select * into r from public.arcade_players where player_id = p_uid for update;
  return r;
end $$;
/** An arcade's level from its XP, and how far into the level it is. */
create or replace function private.arc_level(p_xp bigint) returns jsonb language plpgsql stable as $$
declare c jsonb := coalesce(private.cfg('arcade') -> 'level', '{}'::jsonb); v_lv int := 1; v_need numeric; v_at numeric := 0;
  v_max int := coalesce((c ->> 'max')::int, 30); v_base numeric := coalesce((c ->> 'base')::numeric, 120); v_g numeric := coalesce((c ->> 'growth')::numeric, 1.32);
begin
  loop
    v_need := round(v_base * power(v_g, v_lv - 1));
    exit when v_lv >= v_max or p_xp < v_at + v_need;
    v_at := v_at + v_need; v_lv := v_lv + 1;
  end loop;
  return jsonb_build_object('level', v_lv, 'xp', p_xp, 'into', p_xp - v_at, 'need', case when v_lv >= v_max then 0 else v_need end, 'max', v_lv >= v_max);
end $$;
create or replace function private.arc_upgrade_cost(p_lv int) returns int language sql stable as $$
  select round(coalesce((private.arc_cfg() -> 'upgrade' ->> 'base')::numeric, 90) * power(coalesce((private.arc_cfg() -> 'upgrade' ->> 'growth')::numeric, 1.9), p_lv - 1))::int
$$;
create or replace function private.arc_board(p_arcade uuid, p_game text, p_n int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(q.player_id), 'score', q.score) order by q.score desc), '[]'::jsonb)
  from (select player_id, max(score) score from public.arcade_plays where arcade_id = p_arcade and game = p_game and finished_at is not null and score > 0
        group by player_id order by max(score) desc limit p_n) q
$$;

create or replace function private.arc_me(p_uid uuid) returns jsonb language plpgsql as $$
declare p public.arcade_players%rowtype := private.arc_player(p_uid); cfg jsonb := private.arc_cfg();
begin
  return jsonb_build_object('tickets', p.tickets, 'lifetime', p.lifetime, 'prizes', p.prizes,
    'bonus_ready', p.bonus_day is distinct from private.day_start(now()),
    'streak', case when p.bonus_day >= private.day_start(now()) - interval '1 day' then p.streak else 0 end,
    'ink_today', private.arc_ink_today(p_uid), 'daily_cap', coalesce((cfg ->> 'daily_cap')::int, 120),
    'best', coalesce((select jsonb_object_agg(game, s) from (select game, max(score) s from public.arcade_plays where player_id = p_uid and finished_at is not null group by game) q), '{}'::jsonb));
end $$;

create or replace function private.arc_view(p_arcade uuid, p_viewer uuid) returns jsonb language plpgsql as $$
declare a public.arcades%rowtype; g public.canvas_groups%rowtype; cfg jsonb := private.arc_cfg(); v_lv jsonb; o public.arcade_players%rowtype;
begin
  select * into a from public.arcades where id = p_arcade;
  select * into g from public.canvas_groups where id = a.group_id;
  v_lv := private.arc_level(a.xp);
  select * into o from public.arcade_players where player_id = a.owner_id;
  return jsonb_build_object('id', a.id, 'group_id', a.group_id, 'seed', a.seed, 'name', coalesce(g.name, 'Arcade'), 'plots', coalesce(g.plot_count, 1),
    'owner', private.profile_json(a.owner_id), 'mine', a.owner_id = p_viewer, 'level', v_lv, 'plays', a.plays,
    'machines', a.machines, 'decor', a.decor, 'decor_owned', a.decor_owned, 'shelf', coalesce(o.prizes, '{}'::jsonb),
    'games', cfg -> 'games', 'prizes', cfg -> 'prizes', 'decor_catalog', cfg -> 'decor',
    'upgrade', jsonb_build_object('max', coalesce((cfg -> 'upgrade' ->> 'max')::int, 5), 'bonus', coalesce((cfg -> 'upgrade' ->> 'bonus')::numeric, 0.2),
      'costs', (select jsonb_object_agg(k, private.arc_upgrade_cost(coalesce((a.machines ->> k)::int, 1))) from jsonb_object_keys(a.machines) k)),
    'boards', (select jsonb_object_agg(k, private.arc_board(a.id, k, 5)) from jsonb_object_keys(cfg -> 'games') k),
    'me', private.arc_me(p_viewer), 'server_time', now());
end $$;

-- ---- the arcade ------------------------------------------------------------------------------------------
create or replace function public.arcade_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype;
begin
  select * into a from public.arcades where id = p_id;
  if not found or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.owner_id <> v_uid then perform private.notify(a.owner_id, 'visit', v_uid, jsonb_build_object('arcade', a.id)); end if;
  return private.arc_view(a.id, v_uid);
end $$;

create or replace function public.arcade_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('arcade_id', a.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'level', (private.arc_level(a.xp) ->> 'level')::int, 'plays', a.plays, 'machines', (select count(*) from jsonb_object_keys(a.machines)))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'arcade'
  join public.arcades a on a.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$$;

/** Put a coin in (it's free): a round of one of this arcade's cabinets. */
create or replace function public.arcade_start(p_arcade uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype; g jsonb := private.arc_cfg() -> 'games' -> p_game; s public.arcade_plays%rowtype;
begin
  perform private.rate_limit('arcade_play', 300, 3600);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  select * into a from public.arcades where id = p_arcade;
  if not found or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (a.machines ? p_game) then raise exception 'machine_locked' using errcode = 'P0001'; end if;
  insert into public.arcade_plays (player_id, arcade_id, game, seed) values (v_uid, a.id, p_game, floor(random() * 2147483646)::int) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'game', p_game, 'level', coalesce((a.machines ->> p_game)::int, 1),
    'best', (select max(score) from public.arcade_plays where player_id = v_uid and game = p_game and finished_at is not null),
    'record', (select max(score) from public.arcade_plays where arcade_id = a.id and game = p_game and finished_at is not null));
end $$;

/** Game over: tickets for the score (more on an upgraded cabinet), a little Ink (capped a day), XP for the arcade,
    and the owner's cut of a visitor's tickets. */
create or replace function public.arcade_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.arcade_plays%rowtype; a public.arcades%rowtype; cfg jsonb := private.arc_cfg(); g jsonb;
  v_secs numeric; v_score int; v_lv int; v_tix int := 0; v_ink int := 0; v_paid int := 0; v_owner int := 0; v_prev_best int; v_rec int; v_lv0 int; v_lv1 int; p public.arcade_players%rowtype;
begin
  select * into s from public.arcade_plays where id = p_session for update;
  if not found or s.player_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'tickets', s.tickets, 'paid', s.ink, 'repeat', true); end if;
  g := cfg -> 'games' -> s.game;
  v_secs := extract(epoch from now() - s.started_at);
  if v_secs < coalesce((g ->> 'min_seconds')::numeric, 5) then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  -- no faster than the game allows, and never past its top score
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 500), ceil(v_secs * coalesce((g ->> 'per_second')::numeric, 20))::int));
  select * into a from public.arcades where id = s.arcade_id for update;
  v_prev_best := (select max(score) from public.arcade_plays where player_id = v_uid and game = s.game and finished_at is not null);
  v_rec := (select max(score) from public.arcade_plays where arcade_id = s.arcade_id and game = s.game and finished_at is not null);
  if v_secs <= 1800 and a.id is not null then
    v_lv := coalesce((a.machines ->> s.game)::int, 1);
    v_tix := floor(v_score * coalesce((g ->> 'tickets_per_point')::numeric, 0.5) * (1 + coalesce((cfg -> 'upgrade' ->> 'bonus')::numeric, 0.2) * (v_lv - 1)))::int;
    v_ink := least(coalesce((g ->> 'max_ink')::int, 10), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 30))))::int;
    v_paid := private.arc_pay(v_uid, v_ink, 'arcade:' || s.id, 'arcade-play:' || s.id);
    p := private.arc_player(v_uid);
    update public.arcade_players set tickets = tickets + v_tix, lifetime = lifetime + v_tix where player_id = v_uid;
    v_lv0 := (private.arc_level(a.xp) ->> 'level')::int;
    update public.arcades set xp = xp + greatest(1, v_tix), plays = plays + 1 where id = a.id returning * into a;
    v_lv1 := (private.arc_level(a.xp) ->> 'level')::int;
    if a.owner_id <> v_uid and v_tix > 0 then
      v_owner := greatest(1, floor(v_tix * coalesce((cfg ->> 'owner_share')::numeric, 0.1)))::int;
      perform private.arc_player(a.owner_id);
      update public.arcade_players set tickets = tickets + v_owner, lifetime = lifetime + v_owner where player_id = a.owner_id;
    end if;
  end if;
  update public.arcade_plays set finished_at = now(), score = v_score, tickets = v_tix, ink = v_paid where id = s.id;
  return jsonb_build_object('score', v_score, 'tickets', v_tix, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink,
    'best', greatest(coalesce(v_prev_best, 0), v_score), 'new_best', v_score > coalesce(v_prev_best, 0) and v_score > 0,
    'record', greatest(coalesce(v_rec, 0), v_score), 'new_record', v_score > coalesce(v_rec, 0) and v_score > 0,
    'owner_cut', v_owner, 'level_up', case when v_lv1 > v_lv0 then v_lv1 else null end,
    'me', private.arc_me(v_uid), 'balances', private.balances(v_uid));
end $$;

/** Today's bonus tickets (more for every day in a row, up to a week) and a drop of Ink. */
create or replace function public.arcade_daily() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b jsonb := private.arc_cfg() -> 'daily_bonus'; p public.arcade_players%rowtype; v_day timestamptz := private.day_start(now());
  v_streak int; v_tix int; v_paid int;
begin
  p := private.arc_player(v_uid);
  if p.bonus_day = v_day then raise exception 'already_done' using errcode = 'P0001'; end if;
  v_streak := least(coalesce((b ->> 'max_streak')::int, 7), case when p.bonus_day = v_day - interval '1 day' then p.streak + 1 else 1 end);
  v_tix := coalesce((b ->> 'tickets')::int, 20) + coalesce((b ->> 'per_streak')::int, 6) * (v_streak - 1);
  update public.arcade_players set bonus_day = v_day, streak = v_streak, tickets = tickets + v_tix, lifetime = lifetime + v_tix where player_id = v_uid;
  v_paid := private.arc_pay(v_uid, coalesce((b ->> 'ink')::int, 2), 'daily', 'arcade-daily:' || v_uid || ':' || v_day::date || ':' || gen_random_uuid());
  return jsonb_build_object('tickets', v_tix, 'streak', v_streak, 'paid', v_paid, 'me', private.arc_me(v_uid), 'balances', private.balances(v_uid));
end $$;

/** Swap tickets for a prize at the counter (it goes on the shelves of your arcade). */
create or replace function public.arcade_prize(p_prize text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); z jsonb; p public.arcade_players%rowtype;
begin
  perform private.rate_limit('arcade_shop', 300, 3600);
  select x into z from jsonb_array_elements(private.arc_cfg() -> 'prizes') x where x ->> 'id' = p_prize;
  if z is null then raise exception 'invalid_prize' using errcode = 'P0001'; end if;
  p := private.arc_player(v_uid);
  if p.tickets < (z ->> 'tickets')::int then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
  update public.arcade_players set tickets = tickets - (z ->> 'tickets')::int,
         prizes = prizes || jsonb_build_object(p_prize, coalesce((prizes ->> p_prize)::int, 0) + 1) where player_id = v_uid;
  return jsonb_build_object('prize', z, 'me', private.arc_me(v_uid));
end $$;

/** Owner: buy a new cabinet (needs the arcade's level, costs tickets). */
create or replace function public.arcade_unlock(p_arcade uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype; g jsonb := private.arc_cfg() -> 'games' -> p_game; p public.arcade_players%rowtype;
begin
  perform private.rate_limit('arcade_shop', 300, 3600);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  select * into a from public.arcades where id = p_arcade for update;
  if not found or a.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if a.machines ? p_game then raise exception 'already_owned' using errcode = 'P0001'; end if;
  if (private.arc_level(a.xp) ->> 'level')::int < coalesce((g ->> 'level')::int, 1) then raise exception 'level_too_low' using errcode = 'P0001'; end if;
  p := private.arc_player(v_uid);
  if p.tickets < coalesce((g ->> 'cost')::int, 0) then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
  update public.arcade_players set tickets = tickets - coalesce((g ->> 'cost')::int, 0) where player_id = v_uid;
  update public.arcades set machines = machines || jsonb_build_object(p_game, 1) where id = a.id;
  return private.arc_view(a.id, v_uid);
end $$;

/** Owner: upgrade a cabinet (+20% tickets a round per level). */
create or replace function public.arcade_upgrade(p_arcade uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype; v_lv int; v_cost int; p public.arcade_players%rowtype;
begin
  perform private.rate_limit('arcade_shop', 300, 3600);
  select * into a from public.arcades where id = p_arcade for update;
  if not found or a.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not (a.machines ? p_game) then raise exception 'machine_locked' using errcode = 'P0001'; end if;
  v_lv := (a.machines ->> p_game)::int;
  if v_lv >= coalesce((private.arc_cfg() -> 'upgrade' ->> 'max')::int, 5) then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := private.arc_upgrade_cost(v_lv);
  p := private.arc_player(v_uid);
  if p.tickets < v_cost then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
  update public.arcade_players set tickets = tickets - v_cost where player_id = v_uid;
  update public.arcades set machines = machines || jsonb_build_object(p_game, v_lv + 1) where id = a.id;
  return private.arc_view(a.id, v_uid);
end $$;

/** Owner: buy (the first time) and use a floor, neon colour or light show. */
create or replace function public.arcade_decor(p_arcade uuid, p_slot text, p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype; z jsonb; p public.arcade_players%rowtype;
begin
  perform private.rate_limit('arcade_shop', 300, 3600);
  select * into a from public.arcades where id = p_arcade for update;
  if not found or a.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select x into z from jsonb_array_elements(private.arc_cfg() -> 'decor' -> p_slot) x where x ->> 'id' = p_id;
  if z is null then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  if not (a.decor_owned ? (p_slot || ':' || p_id)) then
    p := private.arc_player(v_uid);
    if p.tickets < coalesce((z ->> 'tickets')::int, 0) then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
    update public.arcade_players set tickets = tickets - coalesce((z ->> 'tickets')::int, 0) where player_id = v_uid;
    update public.arcades set decor_owned = decor_owned || to_jsonb(p_slot || ':' || p_id) where id = a.id;
  end if;
  update public.arcades set decor = decor || jsonb_build_object(p_slot, p_id) where id = a.id;
  return private.arc_view(a.id, v_uid);
end $$;

/** The best scores ever on each cabinet, across every arcade. */
create or replace function public.arcade_hall_of_fame(p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(q.player_id), 'score', q.score) order by q.score desc)
    from (select player_id, max(score) score from public.arcade_plays where game = p_game and finished_at is not null and score > 0
          and private.visible_to(player_id, v_uid) group by player_id order by max(score) desc limit 20) q), '[]'::jsonb);
end $$;

-- ---- a plot can be an arcade ------------------------------------------------------------------------------
create or replace function private.no_art_on_habitat_trg() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.canvas_groups where id = new.group_id and kind in ('habitat', 'farm', 'business', 'arcade')) then
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
    'arcade_id', (select a.id from public.arcades a where a.group_id = g.id),
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
  if p_kind = 'arcade' then
    insert into public.arcades (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
    perform private.arc_player(v_uid);
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
  foreach f in array array['private.arc_cfg()', 'private.arc_ink_today(uuid)', 'private.arc_pay(uuid, int, text, text)', 'private.arc_player(uuid)',
    'private.arc_level(bigint)', 'private.arc_upgrade_cost(int)', 'private.arc_board(uuid, text, int)', 'private.arc_me(uuid)', 'private.arc_view(uuid, uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.arcade_get(uuid)', 'public.arcade_start(uuid, text)', 'public.arcade_finish(uuid, int)', 'public.arcade_daily()',
    'public.arcade_prize(text)', 'public.arcade_unlock(uuid, text)', 'public.arcade_upgrade(uuid, text)', 'public.arcade_decor(uuid, text, text)',
    'public.arcade_hall_of_fame(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.arcade_for_plot(int, int) from public';
  execute 'grant execute on function public.arcade_for_plot(int, int) to anon, authenticated, service_role';
end $$;

-- ---- your explorer: male or female ------------------------------------------------------------------------
update public.game_config set value = jsonb_set(value, '{items}', (value -> 'items') || (
  select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements('[
    {"key": "explorer.sex.m", "name": "Male", "kind": "explorer", "part": "sex", "id": "m", "group": "Explorer", "description": "A male explorer.", "cost": {}},
    {"key": "explorer.sex.f", "name": "Female", "kind": "explorer", "part": "sex", "id": "f", "group": "Explorer", "description": "A female explorer.", "cost": {}}
  ]'::jsonb) x where not exists (select 1 from jsonb_array_elements(value -> 'items') y where y ->> 'key' = x ->> 'key'))) where key = 'shop';

create or replace function public.equip_explorer(p_style jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cur jsonb; v_new jsonb := '{}'::jsonb; part text; v_id text; v_item jsonb;
  v_defaults jsonb := '{"hat": "beret", "hold": "brush", "outfit": "accent", "trail": "none", "aura": "accent", "hair": "short", "hairc": "brown", "skin": "peach", "body": "classic"}'::jsonb;
begin
  perform private.rate_limit('equip', 240, 3600);
  select explorer_style into v_cur from public.profiles where id = v_uid;
  foreach part in array array['hat', 'hold', 'outfit', 'trail', 'aura', 'hair', 'hairc', 'skin', 'body', 'sex'] loop
    v_id := coalesce(p_style ->> part, v_cur ->> part, v_defaults ->> part);
    if v_id is null then continue; end if; -- no sex chosen yet: that's fine
    v_item := private.shop_item('explorer.' || part || '.' || v_id);
    if v_item is null then raise exception 'unknown_item' using errcode = 'P0001', detail = part || '.' || v_id; end if;
    if not private.item_is_free(v_item)
       and not exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = 'explorer.' || part || '.' || v_id) then
      raise exception 'not_owned' using errcode = 'P0001', detail = part || '.' || v_id;
    end if;
    v_new := v_new || jsonb_build_object(part, v_id);
  end loop;
  update public.profiles set explorer_style = v_new, updated_at = now() where id = v_uid;
  return private.profile_json(v_uid);
end $$;
