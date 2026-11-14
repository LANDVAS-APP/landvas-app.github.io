-- The Mirror Arcade: a hidden second arcade on the other side of the glass.
--
--   * Nobody is told it exists. It opens for a player who plays five cabinets in a row, in one arcade, in the
--     colours of the LANDVAS logo's L: Rose -> Amber -> Sun -> Mint -> Sky (any cabinet glowing that colour counts),
--     every round scoring something, all within an hour. The recipe lives here in the private schema, never in
--     game_config (which anyone can read) or in the app's code, and arcade_mirror_check() only ever answers yes/no
--     for the round just finished, from rounds the server really recorded.
--   * Once found it's theirs for good: arcade_mirror_get() answers { found: false } for everyone else.
--   * Every ordinary cabinet plays mirrored there (with a twist, a little faster: the anti-cheat limits get a little
--     more room), plus four cabinets of its own (twin, glass, flip, sym).
--   * Ink: ink_mult (3) times an ordinary cabinet's Ink per point, uncapped: no per-run cap, no daily cap and no Ink
--     Flow pacing, whatever the Ink Flow switch says. A one-time bounty for finding it.
--   * Nothing is posted: its plays live in their own table (no feed triggers, no realtime), there's no live room,
--     and its boards only show players who found it.
-- To re-roll the recipe or tune it: update private.arcade_mirror_cfg (one row) — e.g. from the SQL editor.

create table if not exists private.arcade_mirror_cfg (
  id int primary key default 1 check (id = 1),
  cfg jsonb not null
);
insert into private.arcade_mirror_cfg (id, cfg) values (1, $cfg$
{
  "enabled": true,
  "ink_mult": 3,
  "bounty": 500,
  "window_minutes": 60,
  "recipe": [["stacker", "plinko", "racer"], ["skeeball", "hoops", "fruit"], ["pusher", "maze"], ["bop", "blaster"], ["cyclone", "airhockey"]],
  "pace_slack": 0.6,
  "pace_room": 1.6,
  "games": {
    "twin":  {"order": 101, "name": "Twin Drops",    "emoji": "💧", "color": "#7FF3FF", "min_seconds": 8, "max_score": 8000,  "per_second": 150, "tickets_per_point": 0.05,  "points_per_ink": 1500},
    "glass": {"order": 102, "name": "Glass Breaker", "emoji": "🪟", "color": "#BFE3FF", "min_seconds": 8, "max_score": 20000, "per_second": 200, "tickets_per_point": 0.025, "points_per_ink": 1800},
    "flip":  {"order": 103, "name": "Flipside",      "emoji": "🙃", "color": "#B57BFF", "min_seconds": 8, "max_score": 10000, "per_second": 150, "tickets_per_point": 0.035, "points_per_ink": 2200},
    "sym":   {"order": 104, "name": "Symmetry",      "emoji": "🦋", "color": "#FF7AC8", "min_seconds": 8, "max_score": 40000, "per_second": 250, "tickets_per_point": 0.012, "points_per_ink": 5000}
  }
}
$cfg$::jsonb) on conflict (id) do nothing;
revoke all on private.arcade_mirror_cfg from public, anon, authenticated;

create table if not exists public.arcade_mirror_found (
  player_id uuid primary key references public.players (id) on delete cascade,
  found_at timestamptz not null default now(),
  ink_frac numeric not null default 0
);
alter table public.arcade_mirror_found enable row level security;
revoke all on public.arcade_mirror_found from anon, authenticated;

create table if not exists public.arcade_mirror_plays (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  game text not null,
  mode text not null default 'classic' check (mode in ('classic', 'endless')),
  seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, tickets int, ink int
);
create index if not exists arcade_mirror_plays_board_idx on public.arcade_mirror_plays (game, mode, score desc) where finished_at is not null;
create index if not exists arcade_mirror_plays_player_idx on public.arcade_mirror_plays (player_id, started_at desc);
alter table public.arcade_mirror_plays enable row level security;
revoke all on public.arcade_mirror_plays from anon, authenticated;

create or replace function private.mir_cfg() returns jsonb language sql stable as $$
  select coalesce((select cfg from private.arcade_mirror_cfg where id = 1), '{}'::jsonb)
$$;
create or replace function private.mir_found(p_uid uuid) returns boolean language sql stable as $$
  select coalesce((private.mir_cfg() ->> 'enabled')::boolean, true) and exists (select 1 from public.arcade_mirror_found where player_id = p_uid)
$$;

/** One cabinet on the mirror side: one of its own, or an ordinary cabinet (whose faster mirrored pace gets a little
    more room in the anti-cheat limits). Null if there's no such cabinet. */
create or replace function private.mir_game(p_game text) returns jsonb language plpgsql stable as $$
declare c jsonb := private.mir_cfg(); g jsonb;
begin
  g := c -> 'games' -> p_game;
  if g is not null then return g || '{"own": true}'::jsonb; end if;
  g := private.arc_cfg() -> 'games' -> p_game;
  if g is null or not coalesce((g ->> 'enabled')::boolean, true) then return null; end if;
  return g || jsonb_build_object('own', false,
    'min_seconds', floor(coalesce((g ->> 'min_seconds')::numeric, 5) * coalesce((c ->> 'pace_slack')::numeric, 0.6)),
    'per_second', coalesce((g ->> 'per_second')::numeric, 20) * coalesce((c ->> 'pace_room')::numeric, 1.6));
end $$;

/** every cabinet on the mirror side, as the app shows them */
create or replace function private.mir_games() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k, 'name', g ->> 'name', 'emoji', g ->> 'emoji', 'color', coalesce(g ->> 'color', '#DDE8FF'),
           'order', coalesce((g ->> 'order')::int, 99), 'own', (g ->> 'own')::boolean) order by (g ->> 'own')::boolean, coalesce((g ->> 'order')::int, 99), k), '[]'::jsonb)
  from (select k, private.mir_game(k) g
        from (select jsonb_object_keys(coalesce(private.arc_cfg() -> 'games', '{}'::jsonb)) k
              union select jsonb_object_keys(coalesce(private.mir_cfg() -> 'games', '{}'::jsonb))) ks) x
  where g is not null
$$;

create or replace function private.mir_board(p_game text, p_mode text, p_n int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(q.player_id), 'score', q.score) order by q.score desc), '[]'::jsonb)
  from (select player_id, max(score) score from public.arcade_mirror_plays where game = p_game and mode = p_mode and finished_at is not null and score > 0
        group by player_id order by max(score) desc limit p_n) q
$$;

/** Ink from the mirror side: uncapped and never paced (no daily cap, no Ink Flow), whatever the Ink Flow switch says. */
create or replace function private.mir_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
begin
  if coalesce(p_amount, 0) <= 0 then return 0; end if;
  perform set_config('landvas.ink_paced', '1', true);
  perform private.grant(p_uid, jsonb_build_object('ink', p_amount), 'arcade', 'arcade_mirror', p_ref, p_idem);
  perform set_config('landvas.ink_paced', '', true);
  return p_amount;
end $$;

/** Did the round that just finished open the way through the glass? Only ever yes or no. The newest five finished
    rounds (this one last) must be in one arcade, within the window, each scoring, and follow the recipe's colours. */
create or replace function public.arcade_mirror_check(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mir_cfg(); v_recipe jsonb := c -> 'recipe';
  v_n int; v_rows record; v_ok boolean := true; v_i int := 0; v_first boolean := false; v_bounty int := 0; v_newest uuid; v_arcade uuid; v_from timestamptz; v_to timestamptz;
begin
  perform private.rate_limit('arcade_mirror_check', 400, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) or v_recipe is null or jsonb_typeof(v_recipe) <> 'array' then return '{"opened": false}'::jsonb; end if;
  v_n := jsonb_array_length(v_recipe);
  if v_n = 0 then return '{"opened": false}'::jsonb; end if;
  for v_rows in
    select q.* from (select id, arcade_id, game, score, started_at, finished_at from public.arcade_plays
                     where player_id = v_uid and finished_at is not null order by finished_at desc, started_at desc limit v_n) q
    order by q.finished_at asc, q.started_at asc
  loop
    if v_i = 0 then v_arcade := v_rows.arcade_id; v_from := v_rows.started_at; end if;
    v_newest := v_rows.id; v_to := v_rows.finished_at;
    if v_rows.arcade_id is distinct from v_arcade or coalesce(v_rows.score, 0) <= 0 or not ((v_recipe -> v_i) ? v_rows.game) then v_ok := false; end if;
    v_i := v_i + 1;
  end loop;
  if v_i < v_n or not v_ok or v_newest is distinct from p_session or v_arcade is null
     or v_to - v_from > make_interval(mins => coalesce((c ->> 'window_minutes')::int, 60)) then
    return '{"opened": false}'::jsonb;
  end if;
  insert into public.arcade_mirror_found (player_id) values (v_uid) on conflict (player_id) do nothing returning true into v_first;
  v_first := coalesce(v_first, false);
  if v_first then v_bounty := private.mir_pay(v_uid, coalesce((c ->> 'bounty')::int, 0), 'mirror-found', 'arcade-mirror-found:' || v_uid); end if;
  return jsonb_build_object('opened', true, 'first', v_first, 'bounty', v_bounty, 'balances', private.balances(v_uid));
end $$;

/** The mirror side, for a player who's found it (everyone else: { found: false }). */
create or replace function public.arcade_mirror_get() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mir_cfg(); v_games jsonb;
begin
  if not private.mir_found(v_uid) then return '{"found": false}'::jsonb; end if;
  v_games := private.mir_games();
  return jsonb_build_object('found', true,
    'found_at', (select found_at from public.arcade_mirror_found where player_id = v_uid),
    'ink_mult', coalesce((c ->> 'ink_mult')::numeric, 3),
    'games', v_games,
    'boards', coalesce((select jsonb_object_agg(x ->> 'id', private.mir_board(x ->> 'id', 'classic', 10)) from jsonb_array_elements(v_games) x), '{}'::jsonb),
    'boards_endless', coalesce((select jsonb_object_agg(x ->> 'id', private.mir_board(x ->> 'id', 'endless', 10)) from jsonb_array_elements(v_games) x), '{}'::jsonb),
    'best', coalesce((select jsonb_object_agg(game, s) from (select game, max(score) s from public.arcade_mirror_plays where player_id = v_uid and mode = 'classic' and finished_at is not null group by game) b), '{}'::jsonb),
    'best_endless', coalesce((select jsonb_object_agg(game, s) from (select game, max(score) s from public.arcade_mirror_plays where player_id = v_uid and mode = 'endless' and finished_at is not null group by game) b), '{}'::jsonb),
    'me', private.arc_me(v_uid));
end $$;

create or replace function public.arcade_mirror_start(p_game text, p_mode text default 'classic') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g jsonb; s public.arcade_mirror_plays%rowtype;
begin
  perform private.rate_limit('arcade_play', 300, 3600);
  if not private.mir_found(v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  g := private.mir_game(p_game);
  if g is null or coalesce(p_mode, 'classic') not in ('classic', 'endless') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  insert into public.arcade_mirror_plays (player_id, game, seed, mode) values (v_uid, p_game, floor(random() * 2147483646)::int, coalesce(p_mode, 'classic')) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'game', p_game, 'mode', s.mode, 'level', 1);
end $$;

/** Game over on the mirror side: tickets as usual, ink_mult times the Ink per point, uncapped. */
create or replace function public.arcade_mirror_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mir_cfg(); s public.arcade_mirror_plays%rowtype; g jsonb;
  v_secs numeric; v_score int; v_tix int := 0; v_paid int := 0; v_inkf numeric := 0; v_prev_best int; v_rec int; f public.arcade_mirror_found%rowtype;
begin
  select * into s from public.arcade_mirror_plays where id = p_session for update;
  if not found or s.player_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'tickets', s.tickets, 'paid', s.ink, 'repeat', true, 'me', private.arc_me(v_uid)); end if;
  g := private.mir_game(s.game);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  v_secs := extract(epoch from now() - s.started_at);
  if v_secs < coalesce((g ->> 'min_seconds')::numeric, 5) then
    if s.mode = 'endless' then p_score := 0; else raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  end if;
  -- the same anti-cheat as every cabinet: never faster than the game allows; Classic stops at its top score
  v_score := greatest(0, least(coalesce(p_score, 0), ceil(v_secs * coalesce((g ->> 'per_second')::numeric, 20))::int,
    case when s.mode = 'endless' then 2147483647 else coalesce((g ->> 'max_score')::int, 500) end));
  v_prev_best := (select max(score) from public.arcade_mirror_plays where player_id = v_uid and game = s.game and mode = s.mode and finished_at is not null);
  v_rec := (select max(score) from public.arcade_mirror_plays where game = s.game and mode = s.mode and finished_at is not null);
  if v_secs <= 3600 then
    perform private.arc_player(v_uid);
    select * into f from public.arcade_mirror_found where player_id = v_uid for update;
    v_tix := floor(v_score * coalesce((g ->> 'tickets_per_point')::numeric, 0.2))::int;
    v_inkf := coalesce(f.ink_frac, 0) + v_score * coalesce((c ->> 'ink_mult')::numeric, 3) / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 200));
    v_paid := private.mir_pay(v_uid, floor(v_inkf)::int, 'arcade_mirror:' || s.id, 'arcade-mirror:' || s.id);
    update public.arcade_mirror_found set ink_frac = v_inkf - floor(v_inkf) where player_id = v_uid;
    update public.arcade_players set tickets = tickets + v_tix, lifetime = lifetime + v_tix where player_id = v_uid;
  end if;
  update public.arcade_mirror_plays set finished_at = now(), score = v_score, tickets = v_tix, ink = v_paid where id = s.id;
  return jsonb_build_object('score', v_score, 'mode', s.mode, 'tickets', v_tix, 'earned', v_paid, 'paid', v_paid, 'capped', false,
    'ink_progress', round(v_inkf - floor(v_inkf), 3), 'bonus', '[]'::jsonb, 'hot', false,
    'best', greatest(coalesce(v_prev_best, 0), v_score), 'new_best', v_score > coalesce(v_prev_best, 0) and v_score > 0,
    'record', greatest(coalesce(v_rec, 0), v_score), 'new_record', v_score > coalesce(v_rec, 0) and v_score > 0,
    'owner_cut', 0, 'level_up', null, 'me', private.arc_me(v_uid), 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.mir_cfg()', 'private.mir_found(uuid)', 'private.mir_game(text)', 'private.mir_games()', 'private.mir_board(text, text, int)', 'private.mir_pay(uuid, int, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.arcade_mirror_check(uuid)', 'public.arcade_mirror_get()', 'public.arcade_mirror_start(text, text)', 'public.arcade_mirror_finish(uuid, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
