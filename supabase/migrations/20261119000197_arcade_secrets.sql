-- Arcade secrets: the hidden things in every arcade, all run the same way, and their own page in admin.landvas.app.
--
--   mirror    The Mirror Arcade (…196): five cabinets in a row in the logo's COLOURS -> a mirrored second arcade.
--   founder   The Founder's Code: five cabinets in a row that trace the logo's SHAPE (the L) across the hall's 4x4
--             floor plan -> LAND GRAB, a cabinet that rises out of the floor by the front door (for the finder, in every
--             arcade).
--   backroom  The Back Room: drop the claw straight down the prize chute on every go of a Claw Crane round -> it fishes
--             out a rusty token; feed the token to the ticket machine within 10 minutes -> ADMIT ONE, and a panel in the
--             back wall by the jukebox slides open -> the back room and PROTO-0, a broken prototype full of microgames.
--   bside     The B-Side: play the arcade songs slowest to fastest, then thump the jukebox three times -> the lights go
--             out, Track 00 plays, and the B-Side: every song gets a rhythm chart played on the hall's 16 cabinets.
--
-- Every recipe lives in private.arcade_secrets (one row per secret) — never in game_config (anyone can read that) or
-- in the app's code. The server only ever answers yes/no for what a player just did. Finders keep what they found
-- when a recipe changes. Each secret pays a one-time bounty, then ink_mult times an ordinary cabinet's Ink per point:
-- uncapped (no daily cap and no Ink Flow pacing) unless the admin page turns a daily cap on. Nothing is posted.

create table if not exists private.arcade_secrets (
  id text primary key,
  cfg jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
revoke all on private.arcade_secrets from public, anon, authenticated;

-- the Mirror Arcade's settings move in here (same keys), plus the payout switches every secret has
insert into private.arcade_secrets (id, cfg)
  select 'mirror', cfg || '{"uncapped": true, "daily_cap": 0}'::jsonb from private.arcade_mirror_cfg where id = 1
  on conflict (id) do nothing;
insert into private.arcade_secrets (id, cfg) values
('founder', $c${
  "enabled": true, "bounty": 1000, "ink_mult": 3, "uncapped": true, "daily_cap": 0,
  "shape": [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], "any_position": true, "window_minutes": 60,
  "games": {"landgrab": {"name": "LAND GRAB", "emoji": "🟩", "color": "#3DDC97", "min_seconds": 10, "max_score": 60000, "per_second": 260, "tickets_per_point": 0.02, "points_per_ink": 2500}}
}$c$::jsonb),
('backroom', $c${
  "enabled": true, "bounty": 750, "ink_mult": 3, "uncapped": true, "daily_cap": 0,
  "game": "claw", "goes": 5, "zone": "chute", "token_minutes": 10,
  "games": {"proto": {"name": "PROTO-0", "emoji": "📟", "color": "#FFB13D", "min_seconds": 10, "max_score": 20000, "per_second": 40, "tickets_per_point": 0.12, "points_per_ink": 450}}
}$c$::jsonb),
('bside', $c${
  "enabled": true, "bounty": 750, "ink_mult": 3, "uncapped": true, "daily_cap": 0,
  "songs": ["chill", "neon", "funk", "pixel", "boss"], "min_seconds": 8, "thumps": 3,
  "games": {"bside": {"name": "B-Side", "emoji": "💿", "color": "#B57BFF", "min_seconds": 15, "max_score": 12000, "per_second": 60, "tickets_per_point": 0.05, "points_per_ink": 900}}
}$c$::jsonb)
on conflict (id) do nothing;

create or replace function private.secret_cfg(p_id text) returns jsonb language sql stable as $$
  select coalesce((select cfg from private.arcade_secrets where id = p_id), '{}'::jsonb)
$$;
-- the Mirror Arcade reads its settings from here now
create or replace function private.mir_cfg() returns jsonb language sql stable as $$ select private.secret_cfg('mirror') $$;
drop table if exists private.arcade_mirror_cfg;

alter table public.arcade_mirror_found add column if not exists bounty_paid int not null default 0;

create table if not exists public.arcade_secret_state (
  player_id uuid not null references public.players (id) on delete cascade,
  secret text not null,
  found_at timestamptz,
  ink_frac numeric not null default 0,
  bounty_paid int not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, secret)
);
create index if not exists arcade_secret_state_found_idx on public.arcade_secret_state (secret, found_at desc) where found_at is not null;
alter table public.arcade_secret_state enable row level security;
revoke all on public.arcade_secret_state from anon, authenticated;

create table if not exists public.arcade_secret_plays (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  secret text not null,
  game text not null,
  mode text not null default 'classic' check (mode in ('classic', 'endless')),
  seed int not null,
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, tickets int, ink int
);
create index if not exists arcade_secret_plays_board_idx on public.arcade_secret_plays (secret, game, mode, score desc) where finished_at is not null;
create index if not exists arcade_secret_plays_player_idx on public.arcade_secret_plays (player_id, started_at desc);
alter table public.arcade_secret_plays enable row level security;
revoke all on public.arcade_secret_plays from anon, authenticated;

create or replace function private.secret_on(p_id text) returns boolean language sql stable as $$
  select coalesce((private.secret_cfg(p_id) ->> 'enabled')::boolean, false)
$$;
create or replace function private.secret_found(p_uid uuid, p_id text) returns boolean language sql stable as $$
  select case when p_id = 'mirror' then private.mir_found(p_uid)
    else private.secret_on(p_id) and exists (select 1 from public.arcade_secret_state where player_id = p_uid and secret = p_id and found_at is not null) end
$$;

/** Ink from a secret: uncapped and never paced (the default), or — if the admin page turned a daily cap on — paced like
    any Ink and held to that many a day. Returns what was paid. */
create or replace function private.secret_pay(p_uid uuid, p_id text, p_amount int, p_ref text, p_idem text, p_bounty boolean default false) returns int language plpgsql as $$
declare c jsonb := private.secret_cfg(p_id); v_amt int := greatest(0, coalesce(p_amount, 0)); v_cap int := coalesce((c ->> 'daily_cap')::int, 0); v_today int;
  v_uncapped boolean := coalesce((c ->> 'uncapped')::boolean, true);
begin
  if v_amt <= 0 then return 0; end if;
  if not v_uncapped and v_cap > 0 and not p_bounty then
    v_today := case when p_id = 'mirror'
      then (select coalesce(sum(ink), 0) from public.arcade_mirror_plays where player_id = p_uid and finished_at >= date_trunc('day', now()))
      else (select coalesce(sum(ink), 0) from public.arcade_secret_plays where player_id = p_uid and secret = p_id and finished_at >= date_trunc('day', now())) end;
    v_amt := least(v_amt, greatest(0, v_cap - v_today));
    if v_amt <= 0 then return 0; end if;
  end if;
  if v_uncapped or p_bounty then perform set_config('landvas.ink_paced', '1', true); end if;
  perform private.grant(p_uid, jsonb_build_object('ink', v_amt), 'arcade', case when p_id = 'mirror' then 'arcade_mirror' else 'arcade_secret' end, p_ref, p_idem);
  perform set_config('landvas.ink_paced', '', true);
  return v_amt;
end $$;
-- the Mirror Arcade pays through the same switches now
create or replace function private.mir_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
begin
  return private.secret_pay(p_uid, 'mirror', p_amount, p_ref, p_idem, p_ref = 'mirror-found');
end $$;

/** Mark a secret found (once). Pays the bounty the first time. */
create or replace function private.secret_open(p_uid uuid, p_id text) returns jsonb language plpgsql as $$
declare v_first boolean := false; v_bounty int := 0;
begin
  insert into public.arcade_secret_state (player_id, secret, found_at) values (p_uid, p_id, now())
  on conflict (player_id, secret) do update set found_at = now(), updated_at = now() where arcade_secret_state.found_at is null
  returning true into v_first;
  v_first := coalesce(v_first, false);
  if v_first then
    v_bounty := private.secret_pay(p_uid, p_id, coalesce((private.secret_cfg(p_id) ->> 'bounty')::int, 0), p_id || '-found', 'arcade-secret-found:' || p_id || ':' || p_uid, true);
    update public.arcade_secret_state set bounty_paid = v_bounty where player_id = p_uid and secret = p_id;
  end if;
  return jsonb_build_object('opened', true, 'secret', p_id, 'first', v_first, 'bounty', v_bounty, 'balances', private.balances(p_uid));
end $$;

/** The hall's 4x4 floor plan: each cabinet's column (0 left .. 3 right, seen from the door) and row (0 at the back wall
    .. 3 by the door). Same order the game lays them out in: by "order", slots filling the rows -2.4, 2.2, -7, 6.8. */
create or replace function private.arc_grid() returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_array((i - 1) % 4, (array[1, 2, 0, 3])[((i - 1) / 4) + 1])), '{}'::jsonb)
  from (select k, row_number() over (order by coalesce((g ->> 'order')::int, 99), k) i
        from jsonb_each(coalesce(private.arc_cfg() -> 'games', '{}'::jsonb)) e(k, g)) x
  where i <= 16
$$;

/** Did the round that just finished open a secret? Checks the Mirror Arcade (colours), then the Founder's Code (shape). */
create or replace function public.arcade_secret_check(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r jsonb; c jsonb := private.secret_cfg('founder'); v_shape jsonb := c -> 'shape';
  v_grid jsonb; v_n int; v_rows record; v_i int := 0; v_ok boolean := true; v_newest uuid; v_arcade uuid; v_from timestamptz; v_to timestamptz;
  v_dx int; v_dy int; v_pos jsonb;
begin
  r := public.arcade_mirror_check(p_session);
  if coalesce((r ->> 'opened')::boolean, false) then return r || '{"secret": "mirror"}'::jsonb; end if;
  if not private.secret_on('founder') or v_shape is null or jsonb_typeof(v_shape) <> 'array' or jsonb_array_length(v_shape) < 2 then return '{"opened": false}'::jsonb; end if;
  v_n := jsonb_array_length(v_shape); v_grid := private.arc_grid();
  for v_rows in
    select q.* from (select id, arcade_id, game, score, started_at, finished_at from public.arcade_plays
                     where player_id = v_uid and finished_at is not null order by finished_at desc, started_at desc limit v_n) q
    order by q.finished_at asc, q.started_at asc
  loop
    v_pos := v_grid -> v_rows.game;
    if v_i = 0 then
      v_arcade := v_rows.arcade_id; v_from := v_rows.started_at;
      if v_pos is null then v_ok := false; else
        v_dx := (v_pos ->> 0)::int - (v_shape -> 0 ->> 0)::int; v_dy := (v_pos ->> 1)::int - (v_shape -> 0 ->> 1)::int;
        if not coalesce((c ->> 'any_position')::boolean, true) and (v_dx <> 0 or v_dy <> 0) then v_ok := false; end if;
      end if;
    end if;
    v_newest := v_rows.id; v_to := v_rows.finished_at;
    if v_pos is null or v_rows.arcade_id is distinct from v_arcade or coalesce(v_rows.score, 0) <= 0
       or (v_pos ->> 0)::int <> (v_shape -> v_i ->> 0)::int + coalesce(v_dx, 0) or (v_pos ->> 1)::int <> (v_shape -> v_i ->> 1)::int + coalesce(v_dy, 0) then v_ok := false; end if;
    v_i := v_i + 1;
  end loop;
  if v_i < v_n or not v_ok or v_newest is distinct from p_session or v_arcade is null
     or v_to - v_from > make_interval(mins => coalesce((c ->> 'window_minutes')::int, 60)) then
    return '{"opened": false}'::jsonb;
  end if;
  return private.secret_open(v_uid, 'founder');
end $$;

/** Something a player did that a secret might be listening for (the server keeps the recipe):
      backroom/claw   { session, drops: [[u, v], …] } — where each go of a Claw Crane round dropped (0..1 across the
                      machine from the left, 0..1 from the back) -> a rusty token for token_minutes
      backroom/feed   feeding the token to the ticket machine -> opened
      bside/thump     { tracks: [{ id, secs }, …] } — the songs played on the jukebox, oldest first, and for how long */
create or replace function public.arcade_secret_event(p_secret text, p_kind text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.secret_cfg(p_secret); s record; v_drops jsonb; v_goes int; v_zone text;
  v_ok boolean := true; d jsonb; u numeric; v numeric; v_until timestamptz; v_songs jsonb; v_tracks jsonb; v_n int; v_m int; i int; v_lo int; v_hi int; v_in boolean;
begin
  perform private.rate_limit('arcade_secret_event', 300, 3600);
  if not private.secret_on(p_secret) then return '{"opened": false}'::jsonb; end if;
  if p_secret = 'backroom' and p_kind = 'claw' then
    select id, game, score, finished_at into s from public.arcade_plays where id = (p_data ->> 'session')::uuid and player_id = v_uid;
    v_goes := greatest(1, coalesce((c ->> 'goes')::int, 5)); v_zone := coalesce(c ->> 'zone', 'chute'); v_drops := p_data -> 'drops';
    if s.id is null or s.game <> coalesce(c ->> 'game', 'claw') or s.finished_at is null or s.finished_at < now() - interval '10 minutes'
       or v_drops is null or jsonb_typeof(v_drops) <> 'array' or jsonb_array_length(v_drops) < v_goes then return '{"token": false}'::jsonb; end if;
    v_lo := jsonb_array_length(v_drops) - v_goes; v_hi := jsonb_array_length(v_drops) - 1;
    for i in v_lo .. v_hi loop
      d := v_drops -> i; u := (d ->> 0)::numeric; v := (d ->> 1)::numeric;
      -- (a CASE can't sit inside an IF's condition in plpgsql: its THENs end the condition)
      v_in := case v_zone
          when 'chute' then u < 0.2 and v > 0.8
          when 'front-right' then u > 0.8 and v > 0.8
          when 'back-left' then u < 0.2 and v < 0.2
          when 'back-right' then u > 0.8 and v < 0.2
          when 'center' then abs(u - 0.5) < 0.15 and abs(v - 0.5) < 0.15
          else false end;
      if u is null or v is null or not coalesce(v_in, false) then v_ok := false; end if;
    end loop;
    if not v_ok then return '{"token": false}'::jsonb; end if;
    v_until := now() + make_interval(mins => greatest(1, coalesce((c ->> 'token_minutes')::int, 10)));
    insert into public.arcade_secret_state (player_id, secret, data) values (v_uid, 'backroom', jsonb_build_object('token_until', v_until))
    on conflict (player_id, secret) do update set data = arcade_secret_state.data || jsonb_build_object('token_until', v_until), updated_at = now();
    return jsonb_build_object('token', true, 'until', v_until);
  elsif p_secret = 'backroom' and p_kind = 'feed' then
    select (data ->> 'token_until')::timestamptz into v_until from public.arcade_secret_state where player_id = v_uid and secret = 'backroom';
    if v_until is null or v_until < now() then return '{"opened": false}'::jsonb; end if;
    update public.arcade_secret_state set data = data - 'token_until' where player_id = v_uid and secret = 'backroom';
    return private.secret_open(v_uid, 'backroom');
  elsif p_secret = 'bside' and p_kind = 'thump' then
    v_songs := c -> 'songs'; v_tracks := p_data -> 'tracks';
    if v_songs is null or jsonb_typeof(v_songs) <> 'array' or v_tracks is null or jsonb_typeof(v_tracks) <> 'array' then return '{"opened": false}'::jsonb; end if;
    v_n := jsonb_array_length(v_songs); v_m := jsonb_array_length(v_tracks);
    if v_n < 1 or v_m < v_n then return '{"opened": false}'::jsonb; end if;
    v_hi := v_n - 1;
    for i in 0 .. v_hi loop
      d := v_tracks -> (v_m - v_n + i);
      if d ->> 'id' is distinct from v_songs ->> i or coalesce((d ->> 'secs')::numeric, 0) < coalesce((c ->> 'min_seconds')::numeric, 8) then return '{"opened": false}'::jsonb; end if;
    end loop;
    return private.secret_open(v_uid, 'bside');
  end if;
  return '{"opened": false}'::jsonb;
end $$;

/** What a player has found (nothing at all for someone who's found nothing), and their progress in each. */
create or replace function public.arcade_secrets_me() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_found jsonb; v_token timestamptz;
begin
  select coalesce(jsonb_agg(secret order by secret), '[]'::jsonb) into v_found from public.arcade_secret_state where player_id = v_uid and found_at is not null and private.secret_on(secret);
  if private.mir_found(v_uid) then v_found := v_found || '["mirror"]'::jsonb; end if;
  select (data ->> 'token_until')::timestamptz into v_token from public.arcade_secret_state where player_id = v_uid and secret = 'backroom';
  return jsonb_build_object('found', v_found, 'token_until', case when v_token > now() and private.secret_on('backroom') then v_token end,
    'bside', (select data - 'token_until' from public.arcade_secret_state where player_id = v_uid and secret = 'bside' and found_at is not null),
    'proto', (select data - 'token_until' from public.arcade_secret_state where player_id = v_uid and secret = 'backroom' and found_at is not null));
end $$;

create or replace function private.secret_board(p_secret text, p_game text, p_mode text, p_n int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(q.player_id), 'score', q.score) order by q.score desc), '[]'::jsonb)
  from (select player_id, max(score) score from public.arcade_secret_plays where secret = p_secret and game = p_game and mode = p_mode and finished_at is not null and score > 0
        group by player_id order by max(score) desc limit p_n) q
$$;

/** One secret's game(s) for a finder: settings shown in the app, records, your bests and progress. */
create or replace function public.arcade_secret_get(p_secret text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.secret_cfg(p_secret); v_games jsonb;
begin
  if p_secret = 'mirror' or not private.secret_found(v_uid, p_secret) then return '{"found": false}'::jsonb; end if;
  v_games := coalesce((select jsonb_agg(jsonb_build_object('id', k, 'name', g ->> 'name', 'emoji', g ->> 'emoji', 'color', g ->> 'color')) from jsonb_each(coalesce(c -> 'games', '{}'::jsonb)) e(k, g)), '[]'::jsonb);
  return jsonb_build_object('found', true, 'secret', p_secret, 'ink_mult', coalesce((c ->> 'ink_mult')::numeric, 3), 'games', v_games,
    'songs', case when p_secret = 'bside' then c -> 'songs' end,
    'boards', coalesce((select jsonb_object_agg(g || ':' || m, private.secret_board(p_secret, g, m, 10))
       from (select distinct game g, mode m from public.arcade_secret_plays where secret = p_secret and finished_at is not null) x), '{}'::jsonb),
    'best', coalesce((select jsonb_object_agg(game || ':' || mode, s) from (select game, mode, max(score) s from public.arcade_secret_plays
       where player_id = v_uid and secret = p_secret and finished_at is not null group by game, mode) b), '{}'::jsonb),
    'data', (select data - 'token_until' from public.arcade_secret_state where player_id = v_uid and secret = p_secret),
    'me', private.arc_me(v_uid));
end $$;

/** the settings for one of a secret's games ('bside.neon.hard' -> 'bside') */
create or replace function private.secret_game(p_secret text, p_game text) returns jsonb language sql stable as $$
  select private.secret_cfg(p_secret) -> 'games' -> split_part(p_game, '.', 1)
$$;

create or replace function public.arcade_secret_start(p_secret text, p_game text, p_mode text default 'classic', p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.secret_cfg(p_secret); g jsonb; s public.arcade_secret_plays%rowtype;
  v_song text; v_diff text; v_songs jsonb; v_data jsonb; v_idx int; v_prev text;
begin
  perform private.rate_limit('arcade_play', 300, 3600);
  if p_secret = 'mirror' or not private.secret_found(v_uid, p_secret) then raise exception 'not_found' using errcode = 'P0001'; end if;
  g := private.secret_game(p_secret, p_game);
  if g is null or coalesce(p_mode, 'classic') not in ('classic', 'endless') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  if p_secret = 'bside' then
    -- a chart: song . difficulty, and it has to be unlocked (each song opens when the one before it is cleared)
    v_song := split_part(p_game, '.', 2); v_diff := split_part(p_game, '.', 3); v_songs := c -> 'songs';
    if v_diff not in ('easy', 'hard', 'expert') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
    select data into v_data from public.arcade_secret_state where player_id = v_uid and secret = 'bside';
    if v_song = 'after' then
      if exists (select 1 from jsonb_array_elements_text(v_songs) x where not coalesce((v_data -> 'cleared' -> x) ?| array['hard', 'expert'], false)) then raise exception 'locked' using errcode = 'P0001'; end if;
    else
      select ord - 1 into v_idx from jsonb_array_elements_text(v_songs) with ordinality t(x, ord) where x = v_song;
      if v_idx is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
      if v_idx > 0 then
        v_prev := v_songs ->> (v_idx - 1);
        if coalesce(jsonb_array_length(v_data -> 'cleared' -> v_prev), 0) = 0 then raise exception 'locked' using errcode = 'P0001'; end if;
      end if;
    end if;
  end if;
  insert into public.arcade_secret_plays (player_id, secret, game, mode, seed, meta)
  values (v_uid, p_secret, p_game, coalesce(p_mode, 'classic'), floor(random() * 2147483646)::int, coalesce(p_meta, '{}'::jsonb)) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'game', p_game, 'mode', s.mode, 'level', 1);
end $$;

/** Game over in a secret's game: tickets as usual, ink_mult times the Ink per point (uncapped unless a cap is on).
    p_meta: B-Side { clear, fc } (cleared the chart / full combo); PROTO-0 { stage }. */
create or replace function public.arcade_secret_finish(p_session uuid, p_score int, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.arcade_secret_plays%rowtype; c jsonb; g jsonb; v_secs numeric; v_score int; v_tix int := 0; v_paid int := 0;
  v_inkf numeric := 0; v_prev_best int; v_rec int; st public.arcade_secret_state%rowtype; v_song text; v_diff text; v_data jsonb;
begin
  select * into s from public.arcade_secret_plays where id = p_session for update;
  if not found or s.player_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'tickets', s.tickets, 'paid', s.ink, 'repeat', true, 'me', private.arc_me(v_uid)); end if;
  c := private.secret_cfg(s.secret); g := private.secret_game(s.secret, s.game);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  v_secs := extract(epoch from now() - s.started_at);
  if v_secs < coalesce((g ->> 'min_seconds')::numeric, 5) then
    if s.mode = 'endless' or s.secret = 'bside' then p_score := 0; else raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  end if;
  v_score := greatest(0, least(coalesce(p_score, 0), ceil(v_secs * coalesce((g ->> 'per_second')::numeric, 20))::int,
    case when s.mode = 'endless' then 2147483647 else coalesce((g ->> 'max_score')::int, 500) end));
  v_prev_best := (select max(score) from public.arcade_secret_plays where player_id = v_uid and secret = s.secret and game = s.game and mode = s.mode and finished_at is not null);
  v_rec := (select max(score) from public.arcade_secret_plays where secret = s.secret and game = s.game and mode = s.mode and finished_at is not null);
  insert into public.arcade_secret_state (player_id, secret) values (v_uid, s.secret) on conflict do nothing;
  select * into st from public.arcade_secret_state where player_id = v_uid and secret = s.secret for update;
  v_data := st.data;
  if v_secs <= 3600 then
    perform private.arc_player(v_uid);
    v_tix := floor(v_score * coalesce((g ->> 'tickets_per_point')::numeric, 0.1))::int;
    v_inkf := coalesce(st.ink_frac, 0) + v_score * coalesce((c ->> 'ink_mult')::numeric, 3) / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 200));
    v_paid := private.secret_pay(v_uid, s.secret, floor(v_inkf)::int, 'arcade_secret:' || s.id, 'arcade-secret:' || s.id);
    update public.arcade_players set tickets = tickets + v_tix, lifetime = lifetime + v_tix where player_id = v_uid;
    -- progress the game keeps
    if s.secret = 'bside' and v_score > 0 then
      v_song := split_part(s.game, '.', 2); v_diff := split_part(s.game, '.', 3);
      if coalesce((p_meta ->> 'clear')::boolean, false) and not coalesce((v_data -> 'cleared' -> v_song) ? v_diff, false) then
        v_data := jsonb_set(v_data, '{cleared}', coalesce(v_data -> 'cleared', '{}'::jsonb) || jsonb_build_object(v_song, coalesce(v_data -> 'cleared' -> v_song, '[]'::jsonb) || to_jsonb(v_diff)));
      end if;
      if coalesce((p_meta ->> 'fc')::boolean, false) and not coalesce((v_data -> 'fc' -> v_song) ? v_diff, false) then
        v_data := jsonb_set(v_data, '{fc}', coalesce(v_data -> 'fc', '{}'::jsonb) || jsonb_build_object(v_song, coalesce(v_data -> 'fc' -> v_song, '[]'::jsonb) || to_jsonb(v_diff)));
      end if;
      -- every song full-combo'd on Expert: the jukebox turns gold
      if not coalesce((v_data ->> 'gold')::boolean, false) and not exists (select 1 from jsonb_array_elements_text(c -> 'songs') x where not coalesce((v_data -> 'fc' -> x) ? 'expert', false)) then
        v_data := v_data || '{"gold": true}'::jsonb;
      end if;
    elsif s.secret = 'backroom' and (p_meta ->> 'stage') is not null then
      v_data := v_data || jsonb_build_object('stage', greatest(coalesce((v_data ->> 'stage')::int, 0), least(9999, (p_meta ->> 'stage')::int)));
    elsif s.secret = 'founder' and (p_meta ->> 'level') is not null then
      v_data := v_data || jsonb_build_object('level', greatest(coalesce((v_data ->> 'level')::int, 0), least(9999, (p_meta ->> 'level')::int)));
    end if;
    update public.arcade_secret_state set ink_frac = v_inkf - floor(v_inkf), data = v_data, updated_at = now() where player_id = v_uid and secret = s.secret;
  end if;
  update public.arcade_secret_plays set finished_at = now(), score = v_score, tickets = v_tix, ink = v_paid, meta = s.meta || coalesce(p_meta, '{}'::jsonb) where id = s.id;
  return jsonb_build_object('score', v_score, 'mode', s.mode, 'tickets', v_tix, 'earned', v_paid, 'paid', v_paid, 'capped', false,
    'ink_progress', round(v_inkf - floor(v_inkf), 3), 'bonus', '[]'::jsonb, 'hot', false,
    'best', greatest(coalesce(v_prev_best, 0), v_score), 'new_best', v_score > coalesce(v_prev_best, 0) and v_score > 0,
    'record', greatest(coalesce(v_rec, 0), v_score), 'new_record', v_score > coalesce(v_rec, 0) and v_score > 0,
    'owner_cut', 0, 'level_up', null, 'data', v_data - 'token_until', 'me', private.arc_me(v_uid), 'balances', private.balances(v_uid));
end $$;

-- the Mirror Arcade remembers the bounty it paid (for the admin page's totals)
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
  if v_first then
    v_bounty := private.mir_pay(v_uid, coalesce((c ->> 'bounty')::int, 0), 'mirror-found', 'arcade-mirror-found:' || v_uid);
    update public.arcade_mirror_found set bounty_paid = v_bounty where player_id = v_uid;
  end if;
  return jsonb_build_object('opened', true, 'first', v_first, 'bounty', v_bounty, 'balances', private.balances(v_uid));
end $$;

-- ---- admin.landvas.app → Arcade secrets ---------------------------------------------------------------------------

create or replace function private.secret_stats(p_id text) returns jsonb language plpgsql stable as $$
declare r jsonb;
begin
  if p_id = 'mirror' then
    select jsonb_build_object(
      'finders', (select count(*) from public.arcade_mirror_found),
      'finders_7d', (select count(*) from public.arcade_mirror_found where found_at > now() - interval '7 days'),
      'plays', (select count(*) from public.arcade_mirror_plays where finished_at is not null),
      'plays_24h', (select count(*) from public.arcade_mirror_plays where finished_at > now() - interval '24 hours'),
      'players_24h', (select count(distinct player_id) from public.arcade_mirror_plays where finished_at > now() - interval '24 hours'),
      'ink', (select coalesce(sum(ink), 0) from public.arcade_mirror_plays) + (select coalesce(sum(bounty_paid), 0) from public.arcade_mirror_found),
      'ink_7d', (select coalesce(sum(ink), 0) from public.arcade_mirror_plays where finished_at > now() - interval '7 days'),
      'games', (select coalesce(jsonb_object_agg(game, n), '{}'::jsonb) from (select game, count(*) n from public.arcade_mirror_plays where finished_at is not null group by game) x),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(player_id), 'found_at', found_at) order by found_at desc), '[]'::jsonb)
                 from (select player_id, found_at from public.arcade_mirror_found order by found_at desc limit 40) f)) into r;
  else
    select jsonb_build_object(
      'finders', (select count(*) from public.arcade_secret_state where secret = p_id and found_at is not null),
      'finders_7d', (select count(*) from public.arcade_secret_state where secret = p_id and found_at > now() - interval '7 days'),
      'plays', (select count(*) from public.arcade_secret_plays where secret = p_id and finished_at is not null),
      'plays_24h', (select count(*) from public.arcade_secret_plays where secret = p_id and finished_at > now() - interval '24 hours'),
      'players_24h', (select count(distinct player_id) from public.arcade_secret_plays where secret = p_id and finished_at > now() - interval '24 hours'),
      'ink', (select coalesce(sum(ink), 0) from public.arcade_secret_plays where secret = p_id) + (select coalesce(sum(bounty_paid), 0) from public.arcade_secret_state where secret = p_id),
      'ink_7d', (select coalesce(sum(ink), 0) from public.arcade_secret_plays where secret = p_id and finished_at > now() - interval '7 days'),
      'tokens', case when p_id = 'backroom' then (select count(*) from public.arcade_secret_state where secret = p_id and (data ->> 'token_until')::timestamptz > now()) end,
      'games', (select coalesce(jsonb_object_agg(game, n), '{}'::jsonb) from (select split_part(game, '.', 1) || coalesce('.' || nullif(split_part(game, '.', 2), ''), '') game, count(*) n
                from public.arcade_secret_plays where secret = p_id and finished_at is not null group by 1) x),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(player_id), 'found_at', found_at) order by found_at desc), '[]'::jsonb)
                 from (select player_id, found_at from public.arcade_secret_state where secret = p_id and found_at is not null order by found_at desc limit 40) f)) into r;
  end if;
  return r;
end $$;

/** Every secret: its settings (recipes included), numbers and latest finders, plus the hall's cabinets for the editors. */
create or replace function public.admin_arcade_secrets() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin('{economy}');
  return jsonb_build_object(
    'secrets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'cfg', cfg, 'updated_at', updated_at, 'updated_by', private.profile_json(updated_by), 'stats', private.secret_stats(id))
                 order by array_position(array['mirror', 'founder', 'backroom', 'bside'], id), id), '[]'::jsonb) from private.arcade_secrets),
    'cabinets', (select coalesce(jsonb_agg(jsonb_build_object('id', k, 'name', g ->> 'name', 'emoji', g ->> 'emoji', 'color', g ->> 'color', 'order', coalesce((g ->> 'order')::int, 99), 'level', (g ->> 'level')::int,
                 'cell', private.arc_grid() -> k) order by coalesce((g ->> 'order')::int, 99), k), '[]'::jsonb) from jsonb_each(coalesce(private.arc_cfg() -> 'games', '{}'::jsonb)) e(k, g)));
end $$;

/** Save one secret's settings (the whole row), checked. */
create or replace function public.admin_arcade_secret_save(p_id text, p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin('{economy}'); v_old jsonb; x jsonb; k text; n numeric;
begin
  select cfg into v_old from private.arcade_secrets where id = p_id;
  if v_old is null or p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  -- the payout switches every secret has
  if jsonb_typeof(p_cfg -> 'enabled') is distinct from 'boolean' or jsonb_typeof(p_cfg -> 'uncapped') is distinct from 'boolean'
     or coalesce((p_cfg ->> 'bounty')::numeric, -1) not between 0 and 100000 or coalesce((p_cfg ->> 'ink_mult')::numeric, -1) not between 0 and 20
     or coalesce((p_cfg ->> 'daily_cap')::numeric, -1) not between 0 and 1000000 then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  -- each game's tuning
  if jsonb_typeof(p_cfg -> 'games') is distinct from 'object' then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  for k, x in select * from jsonb_each(p_cfg -> 'games') loop
    foreach n in array array[(x ->> 'min_seconds')::numeric, (x ->> 'max_score')::numeric, (x ->> 'per_second')::numeric, (x ->> 'tickets_per_point')::numeric, (x ->> 'points_per_ink')::numeric] loop
      if n is null or n < 0 then raise exception 'invalid_config' using errcode = 'P0001'; end if;
    end loop;
    if (x ->> 'points_per_ink')::numeric < 1 then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  end loop;
  -- each recipe
  if p_id = 'mirror' and (jsonb_typeof(p_cfg -> 'recipe') is distinct from 'array' or jsonb_array_length(p_cfg -> 'recipe') not between 1 and 9
       or exists (select 1 from jsonb_array_elements(p_cfg -> 'recipe') r where jsonb_typeof(r) <> 'array' or jsonb_array_length(r) = 0)) then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  if p_id = 'founder' and (jsonb_typeof(p_cfg -> 'shape') is distinct from 'array' or jsonb_array_length(p_cfg -> 'shape') not between 2 and 9
       or exists (select 1 from jsonb_array_elements(p_cfg -> 'shape') r where (r ->> 0)::int not between 0 and 3 or (r ->> 1)::int not between 0 and 3)) then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  if p_id = 'backroom' and (coalesce(p_cfg ->> 'zone', '') not in ('chute', 'front-right', 'back-left', 'back-right', 'center') or coalesce((p_cfg ->> 'goes')::int, 0) not between 1 and 10
       or coalesce((p_cfg ->> 'token_minutes')::int, 0) not between 1 and 240) then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  if p_id = 'bside' and (jsonb_typeof(p_cfg -> 'songs') is distinct from 'array' or jsonb_array_length(p_cfg -> 'songs') not between 2 and 8 or coalesce((p_cfg ->> 'min_seconds')::numeric, -1) not between 1 and 300) then
    raise exception 'invalid_config' using errcode = 'P0001'; end if;
  if p_cfg ? 'window_minutes' and coalesce((p_cfg ->> 'window_minutes')::int, 0) not between 1 and 1440 then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  update private.arcade_secrets set cfg = p_cfg, updated_at = now(), updated_by = v_uid where id = p_id;
  perform private.audit('arcade_secret.save', 'arcade_secret', p_id, jsonb_build_object('before', v_old, 'after', p_cfg));
  return public.admin_arcade_secrets();
end $$;

/** Give a player a secret (as if they'd found it, no bounty) or take it away. */
create or replace function public.admin_arcade_secret_finder(p_id text, p_player uuid, p_found boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin('{economy}');
begin
  if not exists (select 1 from private.arcade_secrets where id = p_id) or not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_id = 'mirror' then
    if p_found then insert into public.arcade_mirror_found (player_id) values (p_player) on conflict do nothing;
    else delete from public.arcade_mirror_found where player_id = p_player; end if;
  elsif p_found then
    insert into public.arcade_secret_state (player_id, secret, found_at) values (p_player, p_id, now())
    on conflict (player_id, secret) do update set found_at = coalesce(arcade_secret_state.found_at, now());
  else
    update public.arcade_secret_state set found_at = null where player_id = p_player and secret = p_id;
  end if;
  perform private.audit(case when p_found then 'arcade_secret.grant' else 'arcade_secret.revoke' end, 'player', p_player::text, jsonb_build_object('secret', p_id));
  return private.secret_stats(p_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.secret_cfg(text)', 'private.secret_on(text)', 'private.secret_found(uuid, text)', 'private.secret_pay(uuid, text, int, text, text, boolean)',
    'private.secret_open(uuid, text)', 'private.arc_grid()', 'private.secret_board(text, text, text, int)', 'private.secret_game(text, text)', 'private.secret_stats(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.arcade_secret_check(uuid)', 'public.arcade_secret_event(text, text, jsonb)', 'public.arcade_secrets_me()', 'public.arcade_secret_get(text)',
    'public.arcade_secret_start(text, text, text, jsonb)', 'public.arcade_secret_finish(uuid, int, jsonb)', 'public.arcade_mirror_check(uuid)',
    'public.admin_arcade_secrets()', 'public.admin_arcade_secret_save(text, jsonb)', 'public.admin_arcade_secret_finder(text, uuid, boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
