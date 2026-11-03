-- v0.25 Space: build a rocket with Ink (four simple parts), fly to the Moon and the planets of
-- the solar system (or jump to a random far-off world and make it your home), collect samples
-- on each world once a day, and play space minigames that pay Ink under a daily cap.
-- Travel takes real time; the engine level decides how far the rocket can go.

insert into public.game_config (key, value, description) values ('space', '{
  "enabled": true,
  "daily_cap": 150,
  "parts": {
    "nose":   {"label": "Nose cone", "ink": 15},
    "fins":   {"label": "Fins",      "ink": 15},
    "tank":   {"label": "Fuel tank", "ink": 30},
    "engine": {"label": "Engine",    "ink": 40}
  },
  "engine_upgrade_ink": [0, 300, 800],
  "worlds": {
    "moon":    {"tier": 1, "minutes": 1,  "fuel": 0,  "sample": 3,  "first": 10},
    "venus":   {"tier": 1, "minutes": 3,  "fuel": 5,  "sample": 5,  "first": 15},
    "mars":    {"tier": 1, "minutes": 3,  "fuel": 5,  "sample": 5,  "first": 15},
    "mercury": {"tier": 1, "minutes": 5,  "fuel": 8,  "sample": 6,  "first": 20},
    "jupiter": {"tier": 2, "minutes": 10, "fuel": 12, "sample": 8,  "first": 30},
    "saturn":  {"tier": 2, "minutes": 15, "fuel": 15, "sample": 9,  "first": 30},
    "uranus":  {"tier": 3, "minutes": 25, "fuel": 20, "sample": 10, "first": 40},
    "neptune": {"tier": 3, "minutes": 30, "fuel": 22, "sample": 11, "first": 40},
    "pluto":   {"tier": 3, "minutes": 40, "fuel": 25, "sample": 12, "first": 50},
    "exo":     {"tier": 3, "minutes": 20, "fuel": 20, "sample": 12, "first": 25}
  },
  "games": {
    "asteroids": {"enabled": true, "seconds": 45, "max_score": 150, "points_per_ink": 6, "max_ink": 25},
    "lander":    {"enabled": true, "seconds": 50, "max_score": 120, "points_per_ink": 5, "max_ink": 25}
  }
}', 'Space: rocket part prices, engine upgrades (Ink per level), worlds (engine tier needed, travel minutes, fuel Ink, daily sample Ink, first-visit Ink) and space minigames, all paid under one daily cap.')
on conflict (key) do nothing;

create table if not exists public.space_pilots (
  player_id uuid primary key references public.players (id) on delete cascade,
  parts text[] not null default '{}',
  engine int not null default 1,
  location text not null default 'earth',
  dest text,
  depart_at timestamptz,
  arrive_at timestamptz,
  exo_seed int,             -- the far-off world you're at / flying to
  home_seed int,            -- the far-off world you made your home
  home_name text check (home_name is null or char_length(home_name) between 1 and 32),
  visited text[] not null default '{}',
  samples jsonb not null default '{}'::jsonb,   -- world -> day of the last sample run
  ink_day timestamptz,
  ink_today int not null default 0,
  launches int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.space_pilots enable row level security;
revoke all on public.space_pilots from anon, authenticated;

create table if not exists public.space_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  game text not null,
  seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int,
  ink int
);
create index if not exists space_games_owner_idx on public.space_games (owner_id, started_at desc);
alter table public.space_games enable row level security;
revoke all on public.space_games from anon, authenticated;

-- the grant allow-list gains 'space' (Ink earned in space)
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward', 'space') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

create or replace function private.space_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('space'), '{}'::jsonb) $$;

/** Ink earned in space: one daily cap across samples and minigames. Returns what was paid. */
create or replace function private.space_pay(p_uid uuid, p_amount int, p_ref_type text, p_ref_id text, p_idem text, p_capped boolean default true) returns int
language plpgsql as $$
declare s public.space_pilots%rowtype; v_day timestamptz := private.day_start(now()); v_cap int := coalesce((private.space_cfg() ->> 'daily_cap')::int, 150); v_pay int;
begin
  if p_amount <= 0 then return 0; end if;
  select * into s from public.space_pilots where player_id = p_uid for update;
  if s.ink_day is distinct from v_day then s.ink_today := 0; end if;
  v_pay := case when p_capped then least(p_amount, greatest(0, v_cap - s.ink_today)) else p_amount end;
  update public.space_pilots set ink_day = v_day, ink_today = s.ink_today + case when p_capped then v_pay else 0 end where player_id = p_uid;
  if v_pay > 0 then perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'space', p_ref_type, p_ref_id, p_idem); end if;
  return v_pay;
end $$;

/** The pilot's row, created on first use; a trip that has landed is settled here. */
create or replace function private.space_pilot(p_uid uuid) returns public.space_pilots
language plpgsql as $$
declare s public.space_pilots%rowtype;
begin
  insert into public.space_pilots (player_id) values (p_uid) on conflict do nothing;
  select * into s from public.space_pilots where player_id = p_uid for update;
  if s.dest is not null and s.arrive_at <= now() then
    update public.space_pilots set location = s.dest, dest = null, depart_at = null, arrive_at = null,
           visited = case when s.dest = 'earth' or s.dest = any(s.visited) then s.visited else s.visited || s.dest end,
           updated_at = now()
     where player_id = p_uid returning * into s;
  end if;
  return s;
end $$;

create or replace function private.space_json(s public.space_pilots) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'parts', to_jsonb(s.parts), 'built', cardinality(s.parts) >= 4, 'engine', s.engine,
    'location', s.location, 'dest', s.dest, 'depart_at', s.depart_at, 'arrive_at', s.arrive_at,
    'exo_seed', s.exo_seed, 'home_seed', s.home_seed, 'home_name', s.home_name,
    'visited', to_jsonb(s.visited), 'samples', s.samples, 'launches', s.launches,
    'ink_today', case when s.ink_day is distinct from private.day_start(now()) then 0 else s.ink_today end,
    'day', private.day_start(now()), 'server_time', now(), 'config', private.space_cfg(),
    'balances', private.balances(s.player_id))
$$;

create or replace function public.space_state() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return private.space_json(private.space_pilot(v_uid));
end $$;

/** Build one rocket part. Four parts make a rocket. */
create or replace function public.space_build(p_part text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_cost int;
begin
  perform private.rate_limit('space_build', 60, 3600);
  s := private.space_pilot(v_uid);
  v_cost := (private.space_cfg() -> 'parts' -> p_part ->> 'ink')::int;
  if v_cost is null then raise exception 'invalid_part' using errcode = 'P0001'; end if;
  if p_part = any(s.parts) then return private.space_json(s); end if;
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'space_part', 'space', p_part, 'space-part:' || v_uid || ':' || p_part);
  update public.space_pilots set parts = s.parts || p_part, updated_at = now() where player_id = v_uid returning * into s;
  return private.space_json(s);
end $$;

/** A bigger engine reaches farther worlds (Mk II: Jupiter and Saturn; Mk III: the outer planets and beyond). */
create or replace function public.space_upgrade_engine() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_cost int;
begin
  perform private.rate_limit('space_build', 60, 3600);
  s := private.space_pilot(v_uid);
  if cardinality(s.parts) < 4 then raise exception 'rocket_not_built' using errcode = 'P0001'; end if;
  v_cost := (private.space_cfg() -> 'engine_upgrade_ink' ->> s.engine)::int;
  if v_cost is null then raise exception 'engine_maxed' using errcode = 'P0001'; end if;
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'space_engine', 'space', (s.engine + 1)::text, 'space-engine:' || v_uid || ':' || (s.engine + 1));
  update public.space_pilots set engine = s.engine + 1, updated_at = now() where player_id = v_uid returning * into s;
  return private.space_json(s);
end $$;

/** Launch for a world ('earth' to come home, 'exo' for a random far-off world, 'home' for the one you settled). */
create or replace function public.space_launch(p_dest text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; w jsonb; v_key text; v_min numeric; v_fuel int; v_dest text; v_seed int;
begin
  perform private.rate_limit('space_launch', 120, 3600);
  s := private.space_pilot(v_uid);
  if cardinality(s.parts) < 4 then raise exception 'rocket_not_built' using errcode = 'P0001'; end if;
  if s.dest is not null then raise exception 'space_in_flight' using errcode = 'P0001'; end if;
  v_dest := p_dest; v_seed := s.exo_seed;
  if p_dest = 'earth' then
    if s.location = 'earth' then return private.space_json(s); end if;
    -- coming home takes half the trip out, and is free
    v_key := case when s.location like 'exo:%' then 'exo' else s.location end;
    v_min := greatest(0.5, coalesce((private.space_cfg() -> 'worlds' -> v_key ->> 'minutes')::numeric, 2) / 2); v_fuel := 0;
  else
    v_key := case when p_dest = 'home' then 'exo' else p_dest end;
    w := private.space_cfg() -> 'worlds' -> v_key;
    if w is null then raise exception 'invalid_world' using errcode = 'P0001'; end if;
    if s.engine < coalesce((w ->> 'tier')::int, 1) then raise exception 'engine_too_small' using errcode = 'P0001'; end if;
    if p_dest = 'home' then
      if s.home_seed is null then raise exception 'no_home_world' using errcode = 'P0001'; end if;
      v_dest := 'exo:' || s.home_seed; v_seed := s.home_seed;
    elsif p_dest = 'exo' then
      v_seed := floor(random() * 2147483646)::int + 1;
      v_dest := 'exo:' || v_seed;
    end if;
    if v_dest = s.location then return private.space_json(s); end if;
    v_min := coalesce((w ->> 'minutes')::numeric, 3); v_fuel := coalesce((w ->> 'fuel')::int, 0);
    if v_fuel > 0 then
      perform private.charge(v_uid, jsonb_build_object('ink', v_fuel), 'space_fuel', 'space', v_dest, 'space-fuel:' || v_uid || ':' || s.launches);
    end if;
  end if;
  update public.space_pilots set dest = v_dest, depart_at = now(), arrive_at = now() + make_interval(secs => v_min * 60),
         exo_seed = case when v_dest like 'exo:%' then v_seed else exo_seed end, launches = s.launches + 1, updated_at = now()
   where player_id = v_uid returning * into s;
  return private.space_json(s) || jsonb_build_object('fuel_spent', v_fuel);
end $$;

/** Once a day per world: the samples you found on the surface. The first ever visit pays a bonus. */
create or replace function public.space_collect() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; w jsonb; v_key text; v_day text := private.day_start(now())::text;
  v_ink int; v_first int := 0; v_paid int; v_first_paid int := 0;
begin
  perform private.rate_limit('space_collect', 120, 3600);
  s := private.space_pilot(v_uid);
  if s.dest is not null or s.location = 'earth' then raise exception 'not_on_a_world' using errcode = 'P0001'; end if;
  if s.samples ->> s.location = v_day then raise exception 'samples_taken' using errcode = 'P0001'; end if;
  v_key := case when s.location like 'exo:%' then 'exo' else s.location end;
  w := private.space_cfg() -> 'worlds' -> v_key;
  v_ink := coalesce((w ->> 'sample')::int, 3);
  -- the first-ever visit bonus (each planet once; far-off worlds only the first one)
  if not (s.samples ? ('first:' || v_key)) then v_first := coalesce((w ->> 'first')::int, 0); end if;
  update public.space_pilots set samples = samples || jsonb_build_object(s.location, v_day) || case when v_first > 0 then jsonb_build_object('first:' || v_key, true) else '{}'::jsonb end,
         updated_at = now() where player_id = v_uid;
  v_paid := private.space_pay(v_uid, v_ink, 'space_sample', s.location, 'space-sample:' || v_uid || ':' || s.location || ':' || v_day);
  if v_first > 0 then v_first_paid := private.space_pay(v_uid, v_first, 'space_first', v_key, 'space-first:' || v_uid || ':' || v_key, false); end if;
  select * into s from public.space_pilots where player_id = v_uid;
  return private.space_json(s) || jsonb_build_object('paid', v_paid, 'first_bonus', v_first_paid, 'capped', v_paid < v_ink);
end $$;

/** Make the far-off world you're standing on your home world (you can fly back any time). */
create or replace function public.space_settle(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_name text := btrim(coalesce(p_name, ''));
begin
  s := private.space_pilot(v_uid);
  if s.dest is not null or s.location not like 'exo:%' then raise exception 'not_on_a_world' using errcode = 'P0001'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 32 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  update public.space_pilots set home_seed = s.exo_seed, home_name = v_name, updated_at = now() where player_id = v_uid returning * into s;
  return private.space_json(s);
end $$;

/** Who else has been to a world (for the planet card): how many pilots, and a few recent ones. */
create or replace function public.space_world(p_world text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('world', p_world,
    'pilots', (select count(*) from public.space_pilots where p_world = any(visited)),
    'here', (select count(*) from public.space_pilots where location = p_world and dest is null),
    'recent', (select coalesce(jsonb_agg(private.profile_json(x.player_id)), '[]'::jsonb) from (
       select player_id from public.space_pilots where p_world = any(visited) and private.visible_to(player_id, auth.uid()) order by updated_at desc limit 6) x))
$$;

-- ===== space minigames =====================================================================
create or replace function public.space_game_start(p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g jsonb; s public.space_pilots%rowtype; v public.space_games%rowtype;
begin
  perform private.rate_limit('space_game', 90, 3600);
  s := private.space_pilot(v_uid);
  if cardinality(s.parts) < 4 then raise exception 'rocket_not_built' using errcode = 'P0001'; end if;
  g := private.space_cfg() -> 'games' -> p_game;
  if g is null or not coalesce((g ->> 'enabled')::boolean, true) then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  insert into public.space_games (owner_id, game, seed) values (v_uid, p_game, floor(random() * 2147483647)::int) returning * into v;
  return jsonb_build_object('session', v.id, 'seed', v.seed, 'game', p_game, 'seconds', coalesce((g ->> 'seconds')::int, 45));
end $$;

create or replace function public.space_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v public.space_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int; v_paid int;
begin
  select * into v from public.space_games where id = p_session for update;
  if not found or v.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if v.finished_at is not null then return jsonb_build_object('score', v.score, 'paid', v.ink, 'repeat', true); end if;
  g := private.space_cfg() -> 'games' -> v.game;
  v_secs := extract(epoch from (now() - v.started_at));
  if v_secs < coalesce((g ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 100)));
  v_ink := case when v_secs > 1800 then 0 else least(coalesce((g ->> 'max_ink')::int, 25), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 5))))::int end;
  perform private.space_pilot(v_uid);
  v_paid := private.space_pay(v_uid, v_ink, 'space_game', v.id::text, 'sgame:' || v.id);
  update public.space_games set finished_at = now(), score = v_score, ink = v_paid where id = v.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'balances', private.balances(v_uid),
    'best', (select max(score) from public.space_games where owner_id = v_uid and game = v.game and finished_at is not null));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.space_cfg()', 'private.space_pay(uuid, int, text, text, text, boolean)', 'private.space_pilot(uuid)', 'private.space_json(public.space_pilots)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.space_state()', 'public.space_build(text)', 'public.space_upgrade_engine()', 'public.space_launch(text)', 'public.space_collect()',
    'public.space_settle(text)', 'public.space_world(text)', 'public.space_game_start(text)', 'public.space_game_finish(uuid, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
