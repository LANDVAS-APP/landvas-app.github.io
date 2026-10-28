-- LANDVAS v0.6 minigames
--   * four new art minigames on four new plot types (Fresco, Clay, Prism, Glass)
--   * every plot keeps its own level progress (a new owner starts at level 1)
--   * per-game controls: max level, rounds per level (default 5), base Ink,
--     Ink per level and the plot-upgrade Ink bonus
-- Plots that are already claimed keep their type; new types appear on new claims.

-- ===== 1. New games and plot types =====================================================
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as tbl from pg_constraint
           where contype = 'c' and conrelid in ('public.plot_types'::regclass, 'public.minigame_sessions'::regclass)
             and (pg_get_constraintdef(oid) like '%lightlines%' or pg_get_constraintdef(oid) like '%lumina%') loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table public.plot_types add constraint plot_types_id_check
  check (id in ('graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'clay', 'prism', 'glass'));
alter table public.plot_types add constraint plot_types_minigame_check
  check (minigame in ('tracecraft', 'colorburst', 'patternshift', 'lightlines', 'memorymural', 'sculptor', 'hueflow', 'mirrorline'));
alter table public.minigame_sessions add constraint minigame_sessions_game_check
  check (game in ('tracecraft', 'colorburst', 'patternshift', 'lightlines', 'memorymural', 'sculptor', 'hueflow', 'mirrorline'));

insert into public.plot_types (id, name, minigame, minigame_name, tagline, color_primary, color_secondary, weight, acquire_multiplier, sort) values
  ('fresco', 'Fresco', 'memorymural', 'Memory Mural', 'Plaster walls that remember every stroke', '#FF8A5B', '#FFD6A5', 20, 1.0, 5),
  ('clay', 'Clay', 'sculptor', 'Sculptor', 'Soft earth waiting to be shaped', '#C8794A', '#F2C49B', 20, 1.0, 6),
  ('prism', 'Prism', 'hueflow', 'HueFlow', 'Light split into every shade', '#5EE6C7', '#B49BFF', 20, 1.0, 7),
  ('glass', 'Glass', 'mirrorline', 'Mirrorline', 'Mirrored panes and perfect reflections', '#8FD8FF', '#E3F6FF', 20, 1.0, 8)
on conflict (id) do nothing;

-- ===== 2. Rounds per level and per-plot progress =========================================
alter table public.minigame_sessions add column if not exists rounds int check (rounds between 1 and 10);

create table if not exists public.plot_game_progress (
  gx int not null,
  gy int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  game text not null,
  highest_level int not null default 0,
  best_score int not null default 0,
  plays int not null default 0,
  wins int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (gx, gy, player_id)
);
alter table public.plot_game_progress enable row level security;
revoke all on public.plot_game_progress from anon, authenticated;

-- plots owned today keep the progress their owner already made in that game
insert into public.plot_game_progress (gx, gy, player_id, game, highest_level, best_score, plays, wins)
select p.gx, p.gy, p.owner_id, t.minigame, coalesce(r.highest_level, 0), coalesce(r.best_score, 0), 0, 0
from public.world_plots p
join public.plot_types t on t.id = p.plot_type
left join public.minigame_records r on r.player_id = p.owner_id and r.game = t.minigame
where p.owner_id is not null
on conflict (gx, gy, player_id) do nothing;

-- per-game settings; every game defaults to 5 rounds and the global max level
update public.game_config set value = jsonb_set(value, '{games}', (
  select jsonb_object_agg(g, coalesce(value -> 'games' -> g, '{}'::jsonb)
                              || jsonb_build_object('enabled', coalesce((value -> 'games' -> g ->> 'enabled')::boolean, true))
                              || jsonb_build_object('ink_multiplier', coalesce((value -> 'games' -> g ->> 'ink_multiplier')::numeric, 1))
                              || jsonb_build_object('rounds', coalesce((value -> 'games' -> g ->> 'rounds')::int, 5))
                              || jsonb_build_object('max_level', coalesce((value -> 'games' -> g ->> 'max_level')::int, coalesce((value ->> 'max_level')::int, 60))))
  from unnest(array['tracecraft', 'colorburst', 'patternshift', 'lightlines', 'memorymural', 'sculptor', 'hueflow', 'mirrorline']) g))
where key = 'minigames';

-- ===== 3. Sessions =======================================================================
create or replace function public.start_minigame(p_game text, p_level int, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_cfg jsonb := private.cfg('minigames');
  v_game jsonb := coalesce(private.cfg('minigames') -> 'games' -> p_game, '{}'::jsonb);
  v_type text; v_highest int; v_id uuid; v_seed bigint; v_expires timestamptz; v_level int; v_max int; v_rounds int;
begin
  perform private.rate_limit('minigame_start', 180, 3600);
  if not coalesce((v_game ->> 'enabled')::boolean, false) then
    raise exception 'minigame_unavailable' using errcode = 'P0001';
  end if;
  select wp.plot_type, wp.level into v_type, v_level from public.world_plots wp
  where wp.gx = p_gx and wp.gy = p_gy and wp.owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if (select minigame from public.plot_types where id = v_type) <> p_game then
    raise exception 'wrong_plot_type' using errcode = 'P0001';
  end if;
  -- levels unlock per plot: every plot climbs on its own
  select coalesce(max(highest_level), 0) into v_highest from public.plot_game_progress
   where gx = p_gx and gy = p_gy and player_id = v_uid;
  v_max := greatest(1, least(coalesce((v_game ->> 'max_level')::int, (v_cfg ->> 'max_level')::int, 60), 500));
  if p_level < 1 or p_level > least(v_highest + 1, v_max) then
    raise exception 'level_locked' using errcode = 'P0001';
  end if;
  v_rounds := greatest(1, least(coalesce((v_game ->> 'rounds')::int, 5), 10));
  update public.minigame_sessions set status = 'abandoned', finished_at = now()
  where player_id = v_uid and game = p_game and status = 'active';
  v_seed := floor(random() * 2147483646)::bigint + 1;
  v_expires := now() + make_interval(mins => coalesce((v_cfg ->> 'session_minutes')::int, 20) + v_rounds * 2);
  insert into public.minigame_sessions (player_id, game, level, seed, gx, gy, expires_at, rounds)
  values (v_uid, p_game, p_level, v_seed, p_gx, p_gy, v_expires, v_rounds)
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'game', p_game, 'level', p_level, 'seed', v_seed, 'rounds', v_rounds,
                            'plot_level', v_level, 'plot_highest_level', v_highest, 'max_level', v_max,
                            'started_at', now(), 'expires_at', v_expires, 'server_time', now());
end $$;

create or replace function public.svc_get_session(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'player_id', s.player_id, 'game', s.game, 'level', s.level, 'seed', s.seed, 'rounds', s.rounds,
                            'status', s.status, 'started_at', s.started_at, 'expires_at', s.expires_at, 'server_time', now(),
                            'elapsed_ms', floor(extract(epoch from (now() - s.started_at)) * 1000))
  from public.minigame_sessions s where s.id = p_session_id
$$;

-- Progress of each of my plots in its game (for the play screens).
create or replace function public.my_plot_progress() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(p.gx || '_' || p.gy, jsonb_build_object(
           'game', t.minigame, 'highest_level', coalesce(g.highest_level, 0), 'best_score', coalesce(g.best_score, 0),
           'plays', coalesce(g.plays, 0), 'wins', coalesce(g.wins, 0))), '{}'::jsonb)
  from public.world_plots p
  join public.plot_types t on t.id = p.plot_type
  left join public.plot_game_progress g on g.gx = p.gx and g.gy = p.gy and g.player_id = p.owner_id
  where p.owner_id = auth.uid()
$$;

create or replace function public.svc_finish_minigame(p_session_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
  v_game jsonb; v_plot_record jsonb;
begin
  select * into v_s from public.minigame_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if v_s.status <> 'active' then raise exception 'session_closed' using errcode = 'P0001', detail = v_s.status; end if;
  if now() > v_s.expires_at + interval '1 minute' then
    update public.minigame_sessions set status = 'expired', finished_at = now() where id = p_session_id;
    return jsonb_build_object('status', 'expired', 'passed', false, 'score', 0);
  end if;
  v_rw := v_cfg -> 'rewards';
  v_game := coalesce(v_cfg -> 'games' -> v_s.game, '{}'::jsonb);
  v_elapsed := extract(epoch from (now() - v_s.started_at)) * 1000;
  select coalesce(array_agg(f), '{}') into v_flags from jsonb_array_elements_text(coalesce(p_result -> 'flags', '[]'::jsonb)) f;
  v_valid := coalesce((p_result ->> 'valid')::boolean, false);
  if coalesce((p_result ->> 'min_duration_ms')::numeric, 0) > v_elapsed + 2000 then
    v_valid := false;
    v_flags := array_append(v_flags, 'faster_than_server_clock');
  end if;
  v_passed := v_valid and coalesce((p_result ->> 'passed')::boolean, false);
  v_score := case when v_valid then greatest(0, least(coalesce((p_result ->> 'score')::int, 0), 100000)) else 0 end;
  v_stars := case when v_passed then greatest(0, least(coalesce((p_result ->> 'stars')::int, 0), 3)) else 0 end;

  select best_score into v_best_before from public.minigame_records where player_id = v_s.player_id and game = v_s.game;
  update public.minigame_sessions
     set status = case when v_valid then 'validated' else 'rejected' end,
         finished_at = now(), score = v_score, passed = v_passed, stars = v_stars,
         summary = p_result -> 'summary', flags = v_flags,
         review_status = case when v_valid and coalesce((p_result ->> 'suspicious')::boolean, false) then 'flagged' else 'none' end
   where id = p_session_id;

  insert into public.minigame_records (player_id, game, highest_level, best_score, total_score, plays, wins, last_played_at)
  values (v_s.player_id, v_s.game, case when v_passed then v_s.level else 0 end, v_score, v_score, 1,
          case when v_passed then 1 else 0 end, now())
  on conflict (player_id, game) do update set
    highest_level = greatest(public.minigame_records.highest_level, case when v_passed then v_s.level else 0 end),
    best_score = greatest(public.minigame_records.best_score, v_score),
    total_score = public.minigame_records.total_score + v_score,
    plays = public.minigame_records.plays + 1,
    wins = public.minigame_records.wins + case when v_passed then 1 else 0 end,
    last_played_at = now()
  returning jsonb_build_object('highest_level', highest_level, 'best_score', best_score, 'plays', plays, 'wins', wins) into v_record;

  -- every plot keeps its own level progress for its game (a new owner starts fresh)
  if v_s.gx is not null then
    insert into public.plot_game_progress (gx, gy, player_id, game, highest_level, best_score, plays, wins, updated_at)
    values (v_s.gx, v_s.gy, v_s.player_id, v_s.game, case when v_passed then v_s.level else 0 end, v_score, 1, case when v_passed then 1 else 0 end, now())
    on conflict (gx, gy, player_id) do update set
      game = excluded.game,
      highest_level = greatest(public.plot_game_progress.highest_level, excluded.highest_level),
      best_score = greatest(public.plot_game_progress.best_score, excluded.best_score),
      plays = public.plot_game_progress.plays + 1,
      wins = public.plot_game_progress.wins + excluded.wins,
      updated_at = now()
    returning jsonb_build_object('highest_level', highest_level, 'best_score', best_score, 'plays', plays, 'wins', wins) into v_plot_record;
  end if;

  if v_valid then
    select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1) into v_plot_level, v_rarity_mult
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity
    where wp.gx = v_s.gx and wp.gy = v_s.gy and wp.owner_id = v_s.player_id;
    select count(*) into v_today from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
    where mr.player_id = v_s.player_id and ms.game = v_s.game and mr.ink > 0 and mr.created_at >= private.day_start(now());
    v_limit := coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6);
    v_mult := (1 + coalesce((v_game ->> 'plot_level_bonus')::numeric, (v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    v_ink_mult := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0)
                         * greatest(coalesce((v_cfg -> 'games' -> v_s.game ->> 'ink_multiplier')::numeric, 1), 0);
    if v_passed and v_today < v_limit then
      v_ink := floor((coalesce((v_game ->> 'base_ink')::numeric, (v_rw ->> 'base_ink')::numeric)
                      + coalesce((v_game ->> 'ink_per_level')::numeric, (v_rw ->> 'ink_per_level')::numeric) * v_s.level
                      + v_score / greatest((v_rw ->> 'score_ink_divisor')::numeric, 1)) * v_ink_mult);
      v_bp := floor(((v_rw ->> 'brush_points_base')::numeric + (v_rw ->> 'brush_points_per_star')::numeric * v_stars) * least(v_mult, 1.5));
      v_pig := case when v_stars >= 3 then floor((v_rw ->> 'pigments_on_three_stars')::numeric * least(v_mult, 1.5)) else 0 end;
    elsif v_passed then
      v_practice := true;
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    else
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    end if;
    v_held := coalesce((p_result ->> 'suspicious')::boolean, false);
    insert into public.minigame_rewards (session_id, player_id, ink, pigments, brush_points, multiplier, held)
    values (p_session_id, v_s.player_id, v_ink, v_pig, v_bp, round(v_ink_mult, 3), v_held);
    if v_held then
      insert into public.moderation_cases (kind, priority, session_id, subject_player_id, reason, details)
      values ('score_review', 2, p_session_id, v_s.player_id, 'suspicious_minigame_result',
              jsonb_build_object('flags', v_flags, 'score', v_score, 'game', v_s.game, 'level', v_s.level));
    else
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
      if v_ink > 0 then perform private.referral_qualify(v_s.player_id, 'first_win'); end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', case when v_valid then 'validated' else 'rejected' end,
    'valid', v_valid, 'passed', v_passed, 'score', v_score, 'stars', v_stars, 'flags', to_jsonb(v_flags),
    'new_best', v_score > coalesce(v_best_before, 0),
    'rewards', jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp, 'held', v_held,
                                  'multiplier', round(coalesce(v_ink_mult, 0), 3), 'practice', v_practice,
                                  'rewarded_left', greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0),
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'plot_record', v_plot_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $$;

create or replace function public.leaderboard(p_kind text, p_game text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_rows jsonb;
begin
  if p_kind = 'plots' then
    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player', private.profile_json(r.id), 'value', r.v) order by r.rank), '[]'::jsonb) into v_rows
    from (select owner_id as id, count(*) as v, rank() over (order by count(*) desc) as rank
          from public.world_plots wp where owner_id is not null and private.visible_to(owner_id, v_uid)
          group by owner_id order by v desc limit 50) r;
  elsif p_kind = 'murals' then
    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player', private.profile_json(r.owner_id), 'value', r.plot_count,
                                                 'artwork', jsonb_build_object('id', r.id, 'title', r.title, 'thumb_path', r.thumb_path)) order by r.rank), '[]'::jsonb) into v_rows
    from (select a.id, a.owner_id, a.title, a.thumb_path, a.plot_count, rank() over (order by a.plot_count desc, a.published_at) as rank
          from public.artwork_publications a where a.status = 'published' and private.visible_to(a.owner_id, v_uid)
          order by a.plot_count desc, a.published_at limit 50) r;
  elsif p_kind = 'appreciated' then
    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player', private.profile_json(r.id), 'value', r.v) order by r.rank), '[]'::jsonb) into v_rows
    from (select owner_id as id, sum(appreciation_count) as v, rank() over (order by sum(appreciation_count) desc) as rank
          from public.artwork_publications where status in ('published', 'superseded') and private.visible_to(owner_id, v_uid)
          group by owner_id having sum(appreciation_count) > 0 order by v desc limit 50) r;
  elsif p_kind = 'level' then
    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player', private.profile_json(r.id), 'value', private.artist_level(r.v),
                                                 'extra', r.v) order by r.rank), '[]'::jsonb) into v_rows
    from (select player_id as id, amount as v, rank() over (order by amount desc) as rank
          from public.resource_balances where resource = 'brush_points' and amount > 0 and private.visible_to(player_id, v_uid)
          order by amount desc limit 50) r;
  elsif p_kind = 'minigame' then
    if not exists (select 1 from public.plot_types where minigame = p_game) then
      raise exception 'invalid_game' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player', private.profile_json(r.player_id), 'value', r.best_score,
                                                 'extra', r.highest_level) order by r.rank), '[]'::jsonb) into v_rows
    from (select player_id, best_score, highest_level, rank() over (order by best_score desc) as rank
          from public.minigame_records where game = p_game and best_score > 0 and private.visible_to(player_id, v_uid)
          order by best_score desc limit 50) r;
  else
    raise exception 'invalid_leaderboard' using errcode = 'P0001';
  end if;
  return jsonb_build_object('kind', p_kind, 'game', p_game, 'rows', v_rows);
end $$;

-- ===== 4. Admin validation for the new per-game settings ==================================
create or replace function private.check_minigame_games(p_value jsonb) returns void
language plpgsql immutable as $$
declare g record;
begin
  for g in select k, v from jsonb_each(coalesce(p_value -> 'games', '{}'::jsonb)) x(k, v) loop
    if coalesce((g.v ->> 'ink_multiplier')::numeric, 1) not between 0 and 100
       or coalesce((g.v ->> 'rounds')::int, 5) not between 1 and 10
       or coalesce((g.v ->> 'max_level')::int, 60) not between 1 and 500
       or coalesce((g.v ->> 'base_ink')::numeric, 0) not between 0 and 100000
       or coalesce((g.v ->> 'ink_per_level')::numeric, 0) not between 0 and 10000
       or coalesce((g.v ->> 'plot_level_bonus')::numeric, 0) not between 0 and 10 then
      raise exception 'invalid_minigame_config' using errcode = 'P0001';
    end if;
  end loop;
end $$;
revoke all on function private.check_minigame_games(jsonb) from public;

create or replace function public.admin_config_set(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_old jsonb; g record;
begin
  select value into v_old from public.game_config where key = p_key for update;
  if not found then raise exception 'unknown_config_key' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_value) is distinct from jsonb_typeof(v_old) then raise exception 'config_type_mismatch' using errcode = 'P0001'; end if;
  if p_key = 'economy' and not (p_value ? 'acquire' and p_value ? 'upgrade' and p_value ? 'starter_bonus' and p_value ? 'publish_reward') then
    raise exception 'config_missing_required_keys' using errcode = 'P0001';
  end if;
  if p_key = 'economy' and ((p_value -> 'starter_bonus') ? 'ink' or (p_value -> 'publish_reward') ? 'ink') then
    raise exception 'ink_minigame_only' using errcode = 'P0001';
  end if;
  if p_key = 'economy' and coalesce((p_value -> 'acquire' ->> 'base_ink')::numeric, -1) not between 1 and 1000000 then
    raise exception 'invalid_economy_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' and (
       coalesce((p_value -> 'boost' ->> 'multiplier')::numeric, 0) not between 1 and 100
    or coalesce((p_value -> 'boost' ->> 'minutes_per_boost')::int, 0) not between 1 and 1440
    or coalesce((p_value -> 'boost' ->> 'max_stack_hours')::numeric, 0) not between 0.5 and 72
    or coalesce((p_value -> 'boost' ->> 'free_per_day')::int, -1) not between 0 and 96
    or coalesce((p_value -> 'boost' ->> 'reset_hour_utc')::int, -1) not between 0 and 23
    or coalesce((p_value ->> 'level_bonus')::numeric, -1) not between 0 and 1
    or coalesce((p_value ->> 'max_offline_days')::int, 0) not between 1 and 3650
    or coalesce((p_value -> 'convert' ->> 'ink_per_usd')::numeric, 100) not between 1 and 1000000) then
    raise exception 'invalid_rent_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' then
    perform private.rent_settle(player_id) from public.rent_accounts;
  end if;
  if p_key = 'explorer' and (
       coalesce((p_value ->> 'claim_reach')::int, -1) not between 0 and 100
    or coalesce((p_value ->> 'max_speed_kmh')::numeric, 0) not between 10 and 5000
    or coalesce((p_value ->> 'travel_speed_kmh')::numeric, 0) not between 1 and 2000
    or coalesce((p_value ->> 'jump_cooldown_hours')::int, -1) not between 0 and 8760
    or (p_value ? 'joystick' and (
         coalesce((p_value -> 'joystick' ->> 'speed_kmh')::numeric, 0) not between 1 and 500
      or coalesce((p_value -> 'joystick' ->> 'tank_seconds')::numeric, -1) not between 0 and 86400
      or coalesce((p_value -> 'joystick' ->> 'burst_seconds')::numeric, 4) not between 1 and 30))) then
    raise exception 'invalid_explorer_config' using errcode = 'P0001';
  end if;
  if p_key = 'minigames' then
    if not (p_value ? 'rewards') or coalesce((p_value -> 'rewards' ->> 'base_ink')::numeric, -1) not between 0 and 100000
       or coalesce((p_value -> 'rewards' ->> 'ink_per_level')::numeric, -1) not between 0 and 10000
       or coalesce((p_value -> 'rewards' ->> 'score_ink_divisor')::numeric, 0) not between 1 and 1000000
       or coalesce((p_value ->> 'daily_rewarded_wins_per_game')::int, -1) not between 0 and 1000
       or coalesce((p_value ->> 'plot_level_bonus')::numeric, -1) not between 0 and 10
       or coalesce((p_value ->> 'ink_multiplier')::numeric, 1) not between 0 and 100 then
      raise exception 'invalid_minigame_config' using errcode = 'P0001';
    end if;
    perform private.check_minigame_games(p_value);
  end if;
  if p_key = 'shop' and (jsonb_typeof(p_value -> 'items') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_value -> 'items') i
                  where coalesce(i ->> 'key', '') !~ '^[a-z0-9_.]{2,48}$'
                     or exists (select 1 from jsonb_each_text(coalesce(i -> 'cost', '{}'::jsonb)) c
                                where c.key not in ('ink', 'pigments', 'brush_points', 'gallery_tokens') or c.value !~ '^[0-9]{1,7}$'))) then
    raise exception 'invalid_shop_config' using errcode = 'P0001';
  end if;
  if p_key = 'referrals' and (
       coalesce((p_value ->> 'reward_ink')::int, -1) not between 0 and 100000
    or coalesce((p_value ->> 'referee_reward_ink')::int, 0) not between 0 and 100000
    or coalesce((p_value ->> 'daily_cap')::int, -1) not between 0 and 10000
    or coalesce((p_value ->> 'redeem_window_days')::int, -1) not between 0 and 3650
    or coalesce(p_value ->> 'qualify', '') not in ('signup', 'starter_plot', 'first_win')) then
    raise exception 'invalid_referral_config' using errcode = 'P0001';
  end if;
  if p_key = 'moderation' and coalesce(p_value ->> 'mode', '') not in ('manual', 'auto', 'screened') then
    raise exception 'invalid_moderation_mode' using errcode = 'P0001';
  end if;
  if p_key = 'limits' and (coalesce((p_value ->> 'max_canvas_side')::int, 0) not between 1 and 32
                           or coalesce((p_value ->> 'max_canvas_plots')::int, 0) not between 1 and 1024) then
    raise exception 'invalid_limits' using errcode = 'P0001';
  end if;
  update public.game_config set value = p_value, updated_at = now(), updated_by = v_uid where key = p_key;
  perform private.audit('config.set', 'config', p_key, jsonb_build_object('old', v_old, 'new', p_value));
  return public.admin_config_get();
end $$;

do $$
begin
  revoke all on function public.my_plot_progress() from public, anon;
  grant execute on function public.my_plot_progress() to authenticated, service_role;
end $$;
