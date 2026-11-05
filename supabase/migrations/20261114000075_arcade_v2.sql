-- v0.57 Arcade, round two.
--   * arcade Ink has no daily limit any more, but it's earned slowly: every point counts towards the next drop of
--     Ink (fractions carry over between rounds), at a rate a strong player turns into roughly 40 Ink an hour
--   * Endless mode on every cabinet: no top score, separate high-score boards (Classic and Endless)
--   * bonuses: one "hot" cabinet in each arcade every hour (double tickets, +50% Ink), and the first round of the
--     day on each cabinet pays bonus tickets
--   * tickets buy arcade-only cosmetics: explorer hats, outfits, held items and auras, and things for your Inkborn to
--     wear (hats, glasses, neckwear and glows). They can only be won with tickets, never bought with Ink, and
--     tickets never turn back into Ink
-- Free to play, mostly won by skill; tickets and cosmetics have no Ink value.

alter table public.arcade_players add column if not exists ink_frac numeric not null default 0;
alter table public.arcade_plays add column if not exists mode text not null default 'classic' check (mode in ('classic', 'endless'));
alter table public.arcade_plays add column if not exists bonus jsonb;
drop index if exists arcade_plays_board_idx;
create index if not exists arcade_plays_board2_idx on public.arcade_plays (arcade_id, game, mode, score desc) where finished_at is not null;
create index if not exists arcade_plays_daily_idx on public.arcade_plays (player_id, game, started_at desc);

-- slower Ink, fewer (but still plenty of) tickets, and room for great endless runs
update public.game_config set value = value || jsonb_build_object(
  'daily_cap', null,
  'hot', jsonb_build_object('tickets', 2, 'ink', 1.5),
  'first_play_tickets', 15,
  'games', (value -> 'games')
    || jsonb_build_object('stacker',  (value -> 'games' -> 'stacker')  || '{"points_per_ink": 160,  "tickets_per_point": 0.25}'::jsonb)
    || jsonb_build_object('cyclone',  (value -> 'games' -> 'cyclone')  || '{"points_per_ink": 1000, "tickets_per_point": 0.04, "per_second": 80}'::jsonb)
    || jsonb_build_object('skeeball', (value -> 'games' -> 'skeeball') || '{"points_per_ink": 800,  "tickets_per_point": 0.05, "per_second": 60}'::jsonb)
    || jsonb_build_object('hoops',    (value -> 'games' -> 'hoops')    || '{"points_per_ink": 120,  "tickets_per_point": 0.25, "min_seconds": 20}'::jsonb)
    || jsonb_build_object('bop',      (value -> 'games' -> 'bop')      || '{"points_per_ink": 240,  "tickets_per_point": 0.12, "min_seconds": 15, "per_second": 20}'::jsonb)
    || jsonb_build_object('claw',     (value -> 'games' -> 'claw')     || '{"points_per_ink": 270,  "tickets_per_point": 0.1, "per_second": 40}'::jsonb),
  'cosmetics', '[
    {"key": "explorer.hat.pixelcrown",  "name": "Pixel Crown",        "emoji": "👑", "tickets": 2400, "kind": "explorer", "part": "hat"},
    {"key": "explorer.hat.propeller",   "name": "Propeller Cap",      "emoji": "🧢", "tickets": 600,  "kind": "explorer", "part": "hat"},
    {"key": "explorer.hat.visor",       "name": "VR Visor",           "emoji": "🥽", "tickets": 1500, "kind": "explorer", "part": "hat"},
    {"key": "explorer.hat.antennae",    "name": "Alien Antennae",     "emoji": "👽", "tickets": 900,  "kind": "explorer", "part": "hat"},
    {"key": "explorer.hold.joystick",   "name": "Arcade Stick",       "emoji": "🕹️", "tickets": 700,  "kind": "explorer", "part": "hold"},
    {"key": "explorer.hold.plush",      "name": "Prize Plush",        "emoji": "🧸", "tickets": 1100, "kind": "explorer", "part": "hold"},
    {"key": "explorer.hold.tickets",    "name": "Ticket Streamer",    "emoji": "🎟️", "tickets": 1800, "kind": "explorer", "part": "hold"},
    {"key": "explorer.outfit.pixel",    "name": "8-Bit Jacket",       "emoji": "👾", "tickets": 1300, "kind": "explorer", "part": "outfit"},
    {"key": "explorer.outfit.synth",    "name": "Synthwave Suit",     "emoji": "🌆", "tickets": 2800, "kind": "explorer", "part": "outfit"},
    {"key": "explorer.outfit.champion", "name": "Champion Jacket",    "emoji": "🏆", "tickets": 6500, "kind": "explorer", "part": "outfit"},
    {"key": "explorer.aura.neon",       "name": "Neon Aura",          "emoji": "💗", "tickets": 2000, "kind": "explorer", "part": "aura"},
    {"key": "explorer.aura.arcade",     "name": "Arcade Lights Aura", "emoji": "🌈", "tickets": 4500, "kind": "explorer", "part": "aura"},
    {"key": "explorer.trail.tickets",   "name": "Ticket Trail",       "emoji": "🎫", "tickets": 2200, "kind": "explorer", "part": "trail"},
    {"key": "explorer.trail.pixels",    "name": "Pixel Trail",        "emoji": "🟪", "tickets": 1600, "kind": "explorer", "part": "trail"},
    {"key": "inkborn.whead.party",      "name": "Party Hat",          "emoji": "🥳", "tickets": 400,  "kind": "inkborn", "part": "whead", "id": "party"},
    {"key": "inkborn.whead.crown",      "name": "Tiny Crown",         "emoji": "👑", "tickets": 1800, "kind": "inkborn", "part": "whead", "id": "crown"},
    {"key": "inkborn.whead.propeller",  "name": "Propeller Beanie",   "emoji": "🧢", "tickets": 800,  "kind": "inkborn", "part": "whead", "id": "propeller"},
    {"key": "inkborn.whead.headset",    "name": "Gamer Headset",      "emoji": "🎧", "tickets": 1200, "kind": "inkborn", "part": "whead", "id": "headset"},
    {"key": "inkborn.wface.shades",     "name": "Neon Shades",        "emoji": "🕶️", "tickets": 700,  "kind": "inkborn", "part": "wface", "id": "shades"},
    {"key": "inkborn.wface.stars",      "name": "Star Glasses",       "emoji": "🤩", "tickets": 1100, "kind": "inkborn", "part": "wface", "id": "stars"},
    {"key": "inkborn.wface.visor",      "name": "Pixel Visor",        "emoji": "🥽", "tickets": 1600, "kind": "inkborn", "part": "wface", "id": "visor"},
    {"key": "inkborn.wneck.bowtie",     "name": "Bow Tie",            "emoji": "🎀", "tickets": 350,  "kind": "inkborn", "part": "wneck", "id": "bowtie"},
    {"key": "inkborn.wneck.medal",      "name": "Gold Medal",         "emoji": "🏅", "tickets": 2400, "kind": "inkborn", "part": "wneck", "id": "medal"},
    {"key": "inkborn.wneck.scarf",      "name": "Striped Scarf",      "emoji": "🧣", "tickets": 600,  "kind": "inkborn", "part": "wneck", "id": "scarf"},
    {"key": "inkborn.waura.neon",       "name": "Neon Glow",          "emoji": "💫", "tickets": 2600, "kind": "inkborn", "part": "waura", "id": "neon"},
    {"key": "inkborn.waura.sparkle",    "name": "Sparkle Cloud",      "emoji": "✨", "tickets": 1400, "kind": "inkborn", "part": "waura", "id": "sparkle"},
    {"key": "inkborn.waura.rainbow",    "name": "Rainbow Ring",       "emoji": "🌈", "tickets": 5000, "kind": "inkborn", "part": "waura", "id": "rainbow"}
  ]'::jsonb)
where key = 'arcade';

-- old signatures (new ones take a mode)
drop function if exists public.arcade_start(uuid, text);
drop function if exists public.arcade_hall_of_fame(text);
drop function if exists private.arc_board(uuid, text, int);

-- the explorer cosmetics are shop items (so the explorer screen can show and equip them), marked arcade-only
update public.game_config set value = jsonb_set(value, '{items}', (value -> 'items') || (
  select coalesce(jsonb_agg(jsonb_build_object('key', c ->> 'key', 'name', c ->> 'name', 'kind', 'explorer', 'part', c ->> 'part',
      'id', split_part(c ->> 'key', '.', 3), 'group', 'Explorer', 'description', 'Only from the arcade prize counter.',
      'cost', jsonb_build_object('tickets', (c ->> 'tickets')::int), 'arcade', true)), '[]'::jsonb)
  from jsonb_array_elements((select value -> 'cosmetics' from public.game_config where key = 'arcade')) c
  where c ->> 'kind' = 'explorer' and not exists (select 1 from jsonb_array_elements(value -> 'items') y where y ->> 'key' = c ->> 'key'))) where key = 'shop';

-- arcade-only items can't be bought with Ink
create or replace function public.purchase_unlock(p_key text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_item jsonb; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'purchase_unlock');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('purchase', 120, 3600);
  v_item := private.shop_item(p_key);
  if v_item is null or coalesce((v_item ->> 'enabled')::boolean, true) = false then
    raise exception 'unknown_item' using errcode = 'P0001';
  end if;
  if coalesce((v_item ->> 'arcade')::boolean, false) then raise exception 'arcade_only' using errcode = 'P0001'; end if;
  if private.item_is_free(v_item) or exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = p_key) then
    raise exception 'already_unlocked' using errcode = 'P0001';
  end if;
  if v_item ? 'requires' and not exists (
    select 1 from public.player_unlocks where player_id = v_uid and unlock_key = v_item ->> 'requires') then
    raise exception 'requires_unlock' using errcode = 'P0001', detail = v_item ->> 'requires';
  end if;
  perform private.charge(v_uid, v_item -> 'cost', 'unlock', 'unlock', p_key, p_idempotency_key);
  insert into public.player_unlocks (player_id, unlock_key) values (v_uid, p_key);
  v_res := jsonb_build_object('ok', true, 'key', p_key, 'balances', private.balances(v_uid),
                              'unlocks', (select jsonb_agg(unlock_key order by unlock_key) from public.player_unlocks where player_id = v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- ---- Inkborn wear: kept in the genome (so every drawing of the creature shows it), only set by inkborn_wear ------
create or replace function private.inkborn_wear_guard() returns trigger language plpgsql as $$
declare k text[] := array['whead', 'wface', 'wneck', 'waura'];
begin
  if tg_op = 'INSERT' then new.genome := new.genome - k;
  elsif coalesce(current_setting('landvas.wear', true), '') <> '1' then
    new.genome := (new.genome - k) || coalesce((select jsonb_object_agg(key, value) from jsonb_each(old.genome) where key = any (k)), '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists inkborn_wear_guard on public.inkborn;
create trigger inkborn_wear_guard before insert or update of genome on public.inkborn for each row execute function private.inkborn_wear_guard();

/** Put something you've won on one of your creatures (or take it off: p_item null). */
create or replace function public.inkborn_wear(p_id uuid, p_slot text, p_item text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype;
begin
  perform private.rate_limit('inkborn_wear', 240, 3600);
  if p_slot not in ('whead', 'wface', 'wneck', 'waura') then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_item is not null and not exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = 'inkborn.' || p_slot || '.' || p_item) then
    raise exception 'not_owned' using errcode = 'P0001';
  end if;
  perform set_config('landvas.wear', '1', true);
  update public.inkborn set genome = case when p_item is null then genome - p_slot else genome || jsonb_build_object(p_slot, p_item) end, updated_at = now()
   where id = c.id returning * into c;
  perform set_config('landvas.wear', '', true);
  return private.inkborn_json(c, v_uid);
end $$;

-- ---- earning ------------------------------------------------------------------------------------------------------
/** Arcade Ink: no daily limit. Returns what was paid. */
create or replace function private.arc_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
begin
  if coalesce(p_amount, 0) <= 0 then return 0; end if;
  insert into public.arcade_ink_days (player_id, day) values (p_uid, private.day_start(now())) on conflict do nothing;
  update public.arcade_ink_days set ink = ink + p_amount where player_id = p_uid and day = private.day_start(now());
  perform private.grant(p_uid, jsonb_build_object('ink', p_amount), 'arcade', 'arcade', p_ref, p_idem);
  return p_amount;
end $$;

/** This hour's hot cabinet in an arcade (one of its installed cabinets). */
create or replace function private.arc_hot(a public.arcades) returns text language sql stable as $$
  select k from (select k, row_number() over (order by k) - 1 i, count(*) over () n from jsonb_object_keys(a.machines) k) q
  where i = abs(hashtext(a.id::text || ':' || floor(extract(epoch from now()) / 3600)::text)) % n
$$;

create or replace function private.arc_board(p_arcade uuid, p_game text, p_n int, p_mode text default 'classic') returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(q.player_id), 'score', q.score) order by q.score desc), '[]'::jsonb)
  from (select player_id, max(score) score from public.arcade_plays where arcade_id = p_arcade and game = p_game and mode = p_mode and finished_at is not null and score > 0
        group by player_id order by max(score) desc limit p_n) q
$$;

create or replace function private.arc_me(p_uid uuid) returns jsonb language plpgsql as $$
declare p public.arcade_players%rowtype := private.arc_player(p_uid);
begin
  return jsonb_build_object('tickets', p.tickets, 'lifetime', p.lifetime, 'prizes', p.prizes,
    'bonus_ready', p.bonus_day is distinct from private.day_start(now()),
    'streak', case when p.bonus_day >= private.day_start(now()) - interval '1 day' then p.streak else 0 end,
    'ink_today', private.arc_ink_today(p_uid), 'daily_cap', null, 'ink_progress', round(p.ink_frac, 3),
    'best', coalesce((select jsonb_object_agg(game, s) from (select game, max(score) s from public.arcade_plays where player_id = p_uid and finished_at is not null and mode = 'classic' group by game) q), '{}'::jsonb),
    'best_endless', coalesce((select jsonb_object_agg(game, s) from (select game, max(score) s from public.arcade_plays where player_id = p_uid and finished_at is not null and mode = 'endless' group by game) q), '{}'::jsonb),
    'played_today', coalesce((select jsonb_agg(distinct game) from public.arcade_plays where player_id = p_uid and finished_at is not null and started_at >= private.day_start(now())), '[]'::jsonb),
    'owned', coalesce((select jsonb_agg(unlock_key) from public.player_unlocks where player_id = p_uid and (unlock_key like 'inkborn.w%' or unlock_key in (
      select c ->> 'key' from jsonb_array_elements(private.arc_cfg() -> 'cosmetics') c))), '[]'::jsonb));
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
    'games', cfg -> 'games', 'prizes', cfg -> 'prizes', 'decor_catalog', cfg -> 'decor', 'cosmetics', cfg -> 'cosmetics',
    'hot', jsonb_build_object('game', private.arc_hot(a), 'until', to_timestamp((floor(extract(epoch from now()) / 3600) + 1) * 3600),
      'tickets', coalesce((cfg -> 'hot' ->> 'tickets')::numeric, 2), 'ink', coalesce((cfg -> 'hot' ->> 'ink')::numeric, 1.5)),
    'first_play_tickets', coalesce((cfg ->> 'first_play_tickets')::int, 15),
    'upgrade', jsonb_build_object('max', coalesce((cfg -> 'upgrade' ->> 'max')::int, 5), 'bonus', coalesce((cfg -> 'upgrade' ->> 'bonus')::numeric, 0.2),
      'costs', (select jsonb_object_agg(k, private.arc_upgrade_cost(coalesce((a.machines ->> k)::int, 1))) from jsonb_object_keys(a.machines) k)),
    'boards', (select jsonb_object_agg(k, private.arc_board(a.id, k, 5, 'classic')) from jsonb_object_keys(cfg -> 'games') k),
    'boards_endless', (select jsonb_object_agg(k, private.arc_board(a.id, k, 5, 'endless')) from jsonb_object_keys(cfg -> 'games') k),
    'me', private.arc_me(p_viewer), 'server_time', now());
end $$;

/** Start a round: Classic (the cabinet's normal game) or Endless (no top score). */
create or replace function public.arcade_start(p_arcade uuid, p_game text, p_mode text default 'classic') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype; g jsonb := private.arc_cfg() -> 'games' -> p_game; s public.arcade_plays%rowtype;
begin
  perform private.rate_limit('arcade_play', 300, 3600);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  if coalesce(p_mode, 'classic') not in ('classic', 'endless') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  select * into a from public.arcades where id = p_arcade;
  if not found or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (a.machines ? p_game) then raise exception 'machine_locked' using errcode = 'P0001'; end if;
  insert into public.arcade_plays (player_id, arcade_id, game, seed, mode) values (v_uid, a.id, p_game, floor(random() * 2147483646)::int, coalesce(p_mode, 'classic')) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'game', p_game, 'mode', s.mode, 'level', coalesce((a.machines ->> p_game)::int, 1),
    'hot', private.arc_hot(a) = p_game,
    'best', (select max(score) from public.arcade_plays where player_id = v_uid and game = p_game and mode = s.mode and finished_at is not null),
    'record', (select max(score) from public.arcade_plays where arcade_id = a.id and game = p_game and mode = s.mode and finished_at is not null));
end $$;

/** Game over: tickets (more on an upgraded or hot cabinet, plus the first round of the day), Ink a little at a time
    with no daily limit, XP for the arcade, and the owner's cut of a visitor's tickets. */
create or replace function public.arcade_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.arcade_plays%rowtype; a public.arcades%rowtype; cfg jsonb := private.arc_cfg(); g jsonb;
  v_secs numeric; v_score int; v_lv int; v_tix int := 0; v_paid int := 0; v_owner int := 0; v_prev_best int; v_rec int; v_lv0 int; v_lv1 int;
  p public.arcade_players%rowtype; v_hot boolean := false; v_first boolean := false; v_inkf numeric := 0; v_bonus jsonb := '[]'::jsonb;
begin
  select * into s from public.arcade_plays where id = p_session for update;
  if not found or s.player_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'tickets', s.tickets, 'paid', s.ink, 'repeat', true); end if;
  g := cfg -> 'games' -> s.game;
  v_secs := extract(epoch from now() - s.started_at);
  -- an endless run can end early (out of lives): it just scores nothing rather than failing
  if v_secs < coalesce((g ->> 'min_seconds')::numeric, 5) then
    if s.mode = 'endless' then p_score := 0; else raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  end if;
  -- never faster than the game allows; Classic also stops at the cabinet's top score
  v_score := greatest(0, least(coalesce(p_score, 0), ceil(v_secs * coalesce((g ->> 'per_second')::numeric, 20))::int,
    case when s.mode = 'endless' then 2147483647 else coalesce((g ->> 'max_score')::int, 500) end));
  select * into a from public.arcades where id = s.arcade_id for update;
  v_prev_best := (select max(score) from public.arcade_plays where player_id = v_uid and game = s.game and mode = s.mode and finished_at is not null);
  v_rec := (select max(score) from public.arcade_plays where arcade_id = s.arcade_id and game = s.game and mode = s.mode and finished_at is not null);
  if v_secs <= 3600 and a.id is not null then
    v_lv := coalesce((a.machines ->> s.game)::int, 1);
    v_hot := private.arc_hot(a) = s.game;
    v_first := v_score > 0 and not exists (select 1 from public.arcade_plays where player_id = v_uid and game = s.game and finished_at is not null and started_at >= private.day_start(now()));
    v_tix := floor(v_score * coalesce((g ->> 'tickets_per_point')::numeric, 0.2) * (1 + coalesce((cfg -> 'upgrade' ->> 'bonus')::numeric, 0.2) * (v_lv - 1))
                   * case when v_hot then coalesce((cfg -> 'hot' ->> 'tickets')::numeric, 2) else 1 end)::int;
    if v_hot and v_score > 0 then v_bonus := v_bonus || '["hot"]'::jsonb; end if;
    if v_first then v_tix := v_tix + coalesce((cfg ->> 'first_play_tickets')::int, 15); v_bonus := v_bonus || '["first"]'::jsonb; end if;
    p := private.arc_player(v_uid);
    -- Ink, a fraction at a time
    v_inkf := p.ink_frac + v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 200)) * case when v_hot then coalesce((cfg -> 'hot' ->> 'ink')::numeric, 1.5) else 1 end;
    v_paid := private.arc_pay(v_uid, floor(v_inkf)::int, 'arcade:' || s.id, 'arcade-play:' || s.id);
    update public.arcade_players set tickets = tickets + v_tix, lifetime = lifetime + v_tix, ink_frac = v_inkf - floor(v_inkf) where player_id = v_uid;
    v_lv0 := (private.arc_level(a.xp) ->> 'level')::int;
    update public.arcades set xp = xp + greatest(1, v_tix), plays = plays + 1 where id = a.id returning * into a;
    v_lv1 := (private.arc_level(a.xp) ->> 'level')::int;
    if a.owner_id <> v_uid and v_tix > 0 then
      v_owner := greatest(1, floor(v_tix * coalesce((cfg ->> 'owner_share')::numeric, 0.1)))::int;
      perform private.arc_player(a.owner_id);
      update public.arcade_players set tickets = tickets + v_owner, lifetime = lifetime + v_owner where player_id = a.owner_id;
    end if;
  end if;
  update public.arcade_plays set finished_at = now(), score = v_score, tickets = v_tix, ink = v_paid, bonus = v_bonus where id = s.id;
  return jsonb_build_object('score', v_score, 'mode', s.mode, 'tickets', v_tix, 'earned', v_paid, 'paid', v_paid, 'capped', false,
    'ink_progress', round(v_inkf - floor(v_inkf), 3), 'bonus', v_bonus, 'hot', v_hot,
    'best', greatest(coalesce(v_prev_best, 0), v_score), 'new_best', v_score > coalesce(v_prev_best, 0) and v_score > 0,
    'record', greatest(coalesce(v_rec, 0), v_score), 'new_record', v_score > coalesce(v_rec, 0) and v_score > 0,
    'owner_cut', v_owner, 'level_up', case when v_lv1 > v_lv0 then v_lv1 else null end,
    'me', private.arc_me(v_uid), 'balances', private.balances(v_uid));
end $$;

/** Swap tickets for an arcade-only cosmetic (for your explorer, or for your Inkborn to wear). */
create or replace function public.arcade_cosmetic(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); z jsonb; p public.arcade_players%rowtype;
begin
  perform private.rate_limit('arcade_shop', 300, 3600);
  select x into z from jsonb_array_elements(private.arc_cfg() -> 'cosmetics') x where x ->> 'key' = p_key;
  if z is null then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  if exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = p_key) then raise exception 'already_unlocked' using errcode = 'P0001'; end if;
  p := private.arc_player(v_uid);
  if p.tickets < (z ->> 'tickets')::int then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
  update public.arcade_players set tickets = tickets - (z ->> 'tickets')::int where player_id = v_uid;
  insert into public.player_unlocks (player_id, unlock_key) values (v_uid, p_key);
  return jsonb_build_object('item', z, 'me', private.arc_me(v_uid));
end $$;

/** The best scores ever on a cabinet, across every arcade (Classic or Endless). */
create or replace function public.arcade_hall_of_fame(p_game text, p_mode text default 'classic') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(q.player_id), 'score', q.score) order by q.score desc)
    from (select player_id, max(score) score from public.arcade_plays where game = p_game and mode = coalesce(p_mode, 'classic') and finished_at is not null and score > 0
          and private.visible_to(player_id, v_uid) group by player_id order by max(score) desc limit 20) q), '[]'::jsonb);
end $$;


do $$
declare f text;
begin
  foreach f in array array['private.arc_hot(public.arcades)', 'private.arc_board(uuid, text, int, text)', 'private.inkborn_wear_guard()'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.arcade_start(uuid, text, text)', 'public.arcade_cosmetic(text)', 'public.arcade_hall_of_fame(text, text)', 'public.inkborn_wear(uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
