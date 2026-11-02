-- Inkborn v0.23: creatures cost Ink after the first, and creatures earn Ink back:
--  * Ink Springs: happy creatures (and Ink Spring decorations) fill a habitat's spring over time; the owner collects it
--  * Jobs: send a creature foraging / exploring / on a quest; it comes back with Ink
--  * Inkborn games: minigames where you play as your creature (Berry Dash, Firefly Catch)
-- Everything Inkborn pays shares one daily cap (inkborn.daily_cap), and jobs and games use the creature's energy,
-- which refills by itself (+12 an hour), so it can't be farmed.

update public.game_config set value = value || '{
  "create_ink": 100, "free_creatures": 1, "daily_cap": 150,
  "spring": {"enabled": true, "per_creature_hour": 2, "per_spring_hour": 1, "max_springs": 3, "min_happiness": 50, "max_hours": 12},
  "jobs": {
    "forage":  {"label": "Forage for berries", "minutes": 30,  "ink": 6,  "energy": 15},
    "explore": {"label": "Explore the woods",  "minutes": 120, "ink": 18, "energy": 30},
    "quest":   {"label": "Go on a quest",      "minutes": 480, "ink": 45, "energy": 50}
  },
  "games": {
    "berrydash": {"enabled": true, "seconds": 45, "energy": 15, "max_score": 140, "points_per_ink": 4, "max_ink": 25},
    "fireflies": {"enabled": true, "seconds": 40, "energy": 15, "max_score": 100, "points_per_ink": 3, "max_ink": 25}
  }
}'::jsonb, description = 'Inkborn: creature limits and price (first free, then create_ink), habitat capacity, decorations, AI portraits (off until an image service is configured), and Ink earned by creatures: springs, jobs and Inkborn games, all under one daily cap.'
 where key = 'inkborn';

-- how many creatures each keeper has ever made (releasing one doesn't make the next free)
create table public.inkborn_keepers (
  owner_id uuid primary key references public.players (id) on delete cascade,
  made int not null default 0,
  ink_day timestamptz,
  ink_today int not null default 0
);
alter table public.inkborn_keepers enable row level security;
insert into public.inkborn_keepers (owner_id, made) select owner_id, count(*) from public.inkborn group by owner_id;

alter table public.habitats add column spring_at timestamptz not null default now();
alter table public.inkborn add column job text, add column job_until timestamptz, add column job_started timestamptz;

create table public.inkborn_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  inkborn_id uuid references public.inkborn (id) on delete set null,
  game text not null,
  seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int,
  ink int
);
create index inkborn_games_owner_idx on public.inkborn_games (owner_id, started_at desc);
alter table public.inkborn_games enable row level security;

-- ===== shared ===========================================================================
-- Ink from Inkborn: one daily cap across springs, jobs and games. Returns what was paid.
create or replace function private.inkborn_pay(p_uid uuid, p_amount int, p_ref_type text, p_ref_id text, p_idem text) returns int
language plpgsql as $$
declare k public.inkborn_keepers%rowtype; v_day timestamptz := private.day_start(now()); v_cap int := coalesce((private.ink_cfg() ->> 'daily_cap')::int, 150); v_pay int;
begin
  if p_amount <= 0 then return 0; end if;
  insert into public.inkborn_keepers (owner_id) values (p_uid) on conflict do nothing;
  select * into k from public.inkborn_keepers where owner_id = p_uid for update;
  if k.ink_day is distinct from v_day then k.ink_today := 0; end if;
  v_pay := least(p_amount, greatest(0, v_cap - k.ink_today));
  update public.inkborn_keepers set ink_day = v_day, ink_today = k.ink_today + v_pay where owner_id = p_uid;
  if v_pay > 0 then perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'inkborn', p_ref_type, p_ref_id, p_idem); end if;
  return v_pay;
end $$;

-- the grant allow-list gains 'inkborn' (Ink a player's creatures earned)
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

create or replace function private.inkborn_json(c public.inkborn, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'source', c.source, 'genome', c.genome, 'personality', c.personality,
    'habitat_id', c.habitat_id, 'bond', c.bond, 'created_at', c.created_at, 'portrait_status', c.portrait_status, 'portrait_path', c.portrait_path,
    'mine', c.owner_id = p_viewer, 'last_fed', c.last_fed, 'last_played', c.last_played,
    'job', c.job, 'job_until', c.job_until, 'job_started', c.job_started)
    || private.inkborn_now(c)
    || case when c.owner_id = p_viewer then jsonb_build_object('drawing', c.drawing) else '{}'::jsonb end
$$;

-- what the next creature costs, and today's Inkborn Ink
create or replace function public.inkborn_economy() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); k public.inkborn_keepers%rowtype; cfg jsonb := private.ink_cfg();
begin
  select * into k from public.inkborn_keepers where owner_id = v_uid;
  return jsonb_build_object(
    'made', coalesce(k.made, 0),
    'next_cost', case when coalesce(k.made, 0) < coalesce((cfg ->> 'free_creatures')::int, 1) then 0 else coalesce((cfg ->> 'create_ink')::int, 100) end,
    'ink_today', case when k.ink_day is not distinct from private.day_start(now()) then k.ink_today else 0 end,
    'daily_cap', coalesce((cfg ->> 'daily_cap')::int, 150),
    'jobs', coalesce(cfg -> 'jobs', '{}'::jsonb), 'games', coalesce(cfg -> 'games', '{}'::jsonb), 'spring', coalesce(cfg -> 'spring', '{}'::jsonb));
end $$;

-- ===== creating costs Ink after the first ================================================
create or replace function public.inkborn_create(p_client_key text, p_name text, p_source text, p_genome jsonb, p_drawing jsonb, p_habitat_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; h public.habitats%rowtype; v_name text; v_pers text; v_starter uuid;
  v_made int; v_cost int := 0; cfg jsonb := private.ink_cfg();
begin
  if not coalesce((cfg ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  -- the same save sent twice is one creature (and one payment)
  select * into c from public.inkborn where owner_id = v_uid and client_key = p_client_key;
  if found then return private.inkborn_json(c, v_uid); end if;
  perform private.rate_limit('inkborn_create', 40, 3600);
  if (select count(*) from public.inkborn where owner_id = v_uid) >= coalesce((cfg ->> 'max_creatures')::int, 60) then
    raise exception 'too_many_creatures' using errcode = 'P0001';
  end if;
  if p_source not in ('drawn', 'random', 'custom') then raise exception 'invalid_source' using errcode = 'P0001'; end if;
  perform private.check_genome(p_genome);
  if p_source = 'drawn' then perform private.check_strokes(p_drawing, 2); end if;
  v_name := private.chat_clean(p_name);
  if v_name is null or char_length(v_name) not between 1 and 24 or v_name <> btrim(p_name) then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  v_pers := coalesce(p_genome ->> 'mood', 'curious');
  if v_pers not in ('playful', 'sleepy', 'curious', 'shy', 'foodie', 'brave') then v_pers := 'curious'; end if;
  v_starter := private.starter_habitat(v_uid);
  select * into h from public.habitats where id = coalesce(p_habitat_id, v_starter);
  if not found or h.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if (select count(*) from public.inkborn where habitat_id = h.id) >= private.habitat_capacity(h) then
    select * into h from public.habitats where id = v_starter;
    if (select count(*) from public.inkborn where habitat_id = h.id) >= private.habitat_capacity(h) then h.id := null; end if;
  end if;
  -- the first creature is free; each one after costs Ink
  insert into public.inkborn_keepers (owner_id) values (v_uid) on conflict do nothing;
  select made into v_made from public.inkborn_keepers where owner_id = v_uid for update;
  if v_made >= coalesce((cfg ->> 'free_creatures')::int, 1) then v_cost := coalesce((cfg ->> 'create_ink')::int, 100); end if;
  insert into public.inkborn (owner_id, client_key, name, source, genome, drawing, personality, habitat_id, portrait_status)
  values (v_uid, p_client_key, v_name, p_source, p_genome, case when p_source = 'drawn' then p_drawing end, v_pers, h.id,
          case when p_source = 'drawn' then case when coalesce((cfg ->> 'ai_portraits')::boolean, false) then 'queued' else 'unconfigured' end else 'none' end)
  returning * into c;
  if v_cost > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'inkborn', 'inkborn', c.id::text, 'inkborn:' || v_uid || ':' || p_client_key); end if;
  update public.inkborn_keepers set made = made + 1 where owner_id = v_uid;
  if c.portrait_status = 'queued' then insert into public.inkborn_portrait_jobs (inkborn_id, owner_id) values (c.id, v_uid); end if;
  return private.inkborn_json(c, v_uid) || jsonb_build_object('ink_spent', v_cost, 'balances', private.balances(v_uid));
end $$;

-- ===== Ink Springs =======================================================================
create or replace function private.spring_state(h public.habitats) returns jsonb
language sql stable as $$
  with s as (select coalesce(private.ink_cfg() -> 'spring', '{}'::jsonb) cfg),
  n as (
    select
      (select count(*) from public.inkborn c where c.habitat_id = h.id and c.job is null
         and (private.inkborn_now(c) ->> 'happiness')::int >= coalesce((s.cfg ->> 'min_happiness')::int, 50)) happy,
      least((select count(*) from jsonb_array_elements(h.layout) e where e ->> 'k' = 'inkspring'), coalesce((s.cfg ->> 'max_springs')::int, 3)) springs,
      least(extract(epoch from (now() - h.spring_at)) / 3600, coalesce((s.cfg ->> 'max_hours')::numeric, 12)) hours,
      s.cfg
    from s)
  select jsonb_build_object(
    'happy', happy, 'springs', springs, 'hours', round(hours::numeric, 2),
    'rate', happy * coalesce((cfg ->> 'per_creature_hour')::numeric, 2) + springs * coalesce((cfg ->> 'per_spring_hour')::numeric, 1),
    'ready', floor(hours * (happy * coalesce((cfg ->> 'per_creature_hour')::numeric, 2) + springs * coalesce((cfg ->> 'per_spring_hour')::numeric, 1)))::int,
    'full_in_hours', round(greatest(0, coalesce((cfg ->> 'max_hours')::numeric, 12) - hours)::numeric, 2),
    'enabled', coalesce((cfg ->> 'enabled')::boolean, true))
  from n
$$;

create or replace function public.habitat_spring(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.habitats%rowtype;
begin
  select * into h from public.habitats where id = p_id;
  if not found or h.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return private.spring_state(h);
end $$;

create or replace function public.habitat_collect(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.habitats%rowtype; st jsonb; v_paid int;
begin
  perform private.rate_limit('habitat_collect', 120, 3600);
  select * into h from public.habitats where id = p_id for update;
  if not found or h.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  st := private.spring_state(h);
  if not (st ->> 'enabled')::boolean then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if (st ->> 'ready')::int < 1 then return st || jsonb_build_object('paid', 0); end if;
  v_paid := private.inkborn_pay(v_uid, (st ->> 'ready')::int, 'habitat', h.id::text, 'spring:' || h.id || ':' || extract(epoch from h.spring_at)::bigint);
  update public.habitats set spring_at = now() where id = h.id returning * into h;
  return private.spring_state(h) || jsonb_build_object('paid', v_paid, 'capped', v_paid < (st ->> 'ready')::int, 'balances', private.balances(v_uid));
end $$;

-- ===== jobs ==============================================================================
create or replace function public.inkborn_job_start(p_id uuid, p_job text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; j jsonb; v_now jsonb; v_en int;
begin
  perform private.rate_limit('inkborn_job', 120, 3600);
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  j := private.ink_cfg() -> 'jobs' -> p_job;
  if j is null then raise exception 'invalid_job' using errcode = 'P0001'; end if;
  if c.job is not null then raise exception 'inkborn_busy' using errcode = 'P0001'; end if;
  v_now := private.inkborn_now(c);
  v_en := (v_now ->> 'energy')::int;
  if v_en < coalesce((j ->> 'energy')::int, 20) then raise exception 'inkborn_tired' using errcode = 'P0001'; end if;
  update public.inkborn set job = p_job, job_started = now(), job_until = now() + make_interval(mins => coalesce((j ->> 'minutes')::int, 30)),
         energy = v_en - coalesce((j ->> 'energy')::int, 20), happiness = (v_now ->> 'happiness')::int, stats_at = now(), updated_at = now()
   where id = c.id returning * into c;
  return private.inkborn_json(c, v_uid);
end $$;

create or replace function public.inkborn_job_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; j jsonb; v_ink int; v_paid int; v_bonus numeric;
begin
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if c.job is null then raise exception 'no_job' using errcode = 'P0001'; end if;
  if c.job_until > now() then raise exception 'job_not_done' using errcode = 'P0001'; end if;
  j := private.ink_cfg() -> 'jobs' -> c.job;
  -- a closer bond brings back a little more (up to +50%)
  v_bonus := 1 + least(0.5, c.bond / 400.0);
  v_ink := floor(coalesce((j ->> 'ink')::int, 0) * v_bonus);
  v_paid := private.inkborn_pay(v_uid, v_ink, 'inkborn', c.id::text, 'job:' || c.id || ':' || extract(epoch from c.job_started)::bigint);
  update public.inkborn set job = null, job_until = null, job_started = null, bond = bond + 2, updated_at = now() where id = c.id returning * into c;
  return private.inkborn_json(c, v_uid) || jsonb_build_object('paid', v_paid, 'earned', v_ink, 'capped', v_paid < v_ink, 'balances', private.balances(v_uid));
end $$;

-- ===== Inkborn games (you play as your creature) ========================================
create or replace function public.inkborn_game_start(p_id uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; g jsonb; v_now jsonb; v_en int; s public.inkborn_games%rowtype;
begin
  perform private.rate_limit('inkborn_game', 90, 3600);
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  g := private.ink_cfg() -> 'games' -> p_game;
  if g is null or not coalesce((g ->> 'enabled')::boolean, true) then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  if c.job is not null then raise exception 'inkborn_busy' using errcode = 'P0001'; end if;
  v_now := private.inkborn_now(c);
  v_en := (v_now ->> 'energy')::int;
  if v_en < coalesce((g ->> 'energy')::int, 15) then raise exception 'inkborn_tired' using errcode = 'P0001'; end if;
  update public.inkborn set energy = v_en - coalesce((g ->> 'energy')::int, 15), happiness = least(100, (v_now ->> 'happiness')::int + 5),
         stats_at = now(), last_played = now(), updated_at = now() where id = c.id;
  insert into public.inkborn_games (owner_id, inkborn_id, game, seed) values (v_uid, c.id, p_game, floor(random() * 2147483647)::int) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'game', p_game, 'seconds', coalesce((g ->> 'seconds')::int, 45));
end $$;

create or replace function public.inkborn_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.inkborn_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int; v_paid int;
begin
  select * into s from public.inkborn_games where id = p_session for update;
  if not found or s.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'paid', s.ink, 'repeat', true); end if;
  g := private.ink_cfg() -> 'games' -> s.game;
  v_secs := extract(epoch from (now() - s.started_at));
  -- a round can't end before its clock does, and can't score more than the game allows
  if v_secs < coalesce((g ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 100)));
  v_ink := case when v_secs > 1800 then 0 else least(coalesce((g ->> 'max_ink')::int, 25), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 4))))::int end;
  v_paid := private.inkborn_pay(v_uid, v_ink, 'inkborn_game', s.id::text, 'igame:' || s.id);
  update public.inkborn_games set finished_at = now(), score = v_score, ink = v_paid where id = s.id;
  if s.inkborn_id is not null and v_score > 0 then
    update public.inkborn set bond = bond + least(3, greatest(1, v_score / 30)), updated_at = now() where id = s.inkborn_id;
  end if;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'balances', private.balances(v_uid),
    'best', (select max(score) from public.inkborn_games where owner_id = v_uid and game = s.game and finished_at is not null));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.inkborn_economy()', 'public.habitat_spring(uuid)', 'public.habitat_collect(uuid)', 'public.inkborn_job_start(uuid, text)',
    'public.inkborn_job_claim(uuid)', 'public.inkborn_game_start(uuid, text)', 'public.inkborn_game_finish(uuid, int)',
    'public.inkborn_create(text, text, text, jsonb, jsonb, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
