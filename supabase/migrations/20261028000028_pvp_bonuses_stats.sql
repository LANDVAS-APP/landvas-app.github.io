-- v0.14: PvP minigames (free, anonymous, in rounds), performance bonuses for minigames,
-- minigame wins in the live feed, and per-player minigame stats for the operator.

-- ===== 1. Minigame performance bonuses ==========================================
-- minigames.games.<game>.bonuses = [rule, …], each rule one of:
--   {"type": "round",   "min_pct": 90, "ink": 2}              each cleared round at or above min_pct pays ink (the best matching round tier)
--   {"type": "all",     "min_pct": 90, "ink": 5}              level cleared with EVERY round at or above min_pct pays ink once
--   {"type": "count",   "count": 2, "min_pct": 80, "ink": 3}   at least `count` cleared rounds at or above min_pct pays ink once
--   {"type": "average", "min_pct": 85, "ink": 4}              level cleared with an average at or above min_pct pays ink once
-- Different types add up; within a type the best matching rule pays. Every bonus is multiplied
-- like the rest of a game's Ink (rarity, plot upgrades, multipliers, boosts) and counts toward
-- the daily paid-run limit. "Quality" is each game's own 0-100% measure of how well a round went.
alter table public.minigame_sessions add column if not exists quality jsonb;
alter table public.minigame_sessions add column if not exists play_ms int;
alter table public.minigame_rewards add column if not exists breakdown jsonb;

create or replace function private.bonus_ink(p_rules jsonb, p_quality jsonb, p_mask jsonb, p_total int, p_passed boolean) returns jsonb
language plpgsql immutable as $$
declare
  v_q numeric[]; v_ok boolean[]; k int; v_best numeric; v_ink numeric := 0; v_hits jsonb := '[]'::jsonb; v_min numeric; v_avg numeric; x jsonb;
begin
  if jsonb_typeof(p_rules) is distinct from 'array' or jsonb_array_length(p_rules) = 0 or jsonb_typeof(p_quality) is distinct from 'array' then
    return jsonb_build_object('ink', 0, 'hits', '[]'::jsonb);
  end if;
  p_total := greatest(coalesce(p_total, 1), 1);
  v_q := array(select least(greatest(coalesce((p_quality ->> (i - 1))::numeric, 0), 0), 100) from generate_series(1, p_total) i);
  v_ok := array(select case when jsonb_typeof(p_mask) = 'array' then coalesce((p_mask ->> (i - 1))::boolean, false) else coalesce(p_passed, false) end
                from generate_series(1, p_total) i);
  -- per round: the best matching round tier, for each cleared round
  for k in 1 .. p_total loop
    if v_ok[k] then
      select max(greatest(coalesce((r ->> 'ink')::numeric, 0), 0)) into v_best from jsonb_array_elements(p_rules) r
       where r ->> 'type' = 'round' and v_q[k] >= coalesce((r ->> 'min_pct')::numeric, 0);
      if coalesce(v_best, 0) > 0 then
        v_ink := v_ink + v_best;
        v_hits := v_hits || jsonb_build_object('type', 'round', 'round', k, 'quality', v_q[k], 'ink', v_best);
      end if;
    end if;
  end loop;
  -- at least N cleared rounds at or above a mark
  select r into x from jsonb_array_elements(p_rules) r
   where r ->> 'type' = 'count'
     and (select count(*) from generate_series(1, p_total) i where v_ok[i] and v_q[i] >= coalesce((r ->> 'min_pct')::numeric, 0)) >= greatest(coalesce((r ->> 'count')::int, 1), 1)
   order by coalesce((r ->> 'ink')::numeric, 0) desc limit 1;
  if x is not null and coalesce((x ->> 'ink')::numeric, 0) > 0 then
    v_ink := v_ink + (x ->> 'ink')::numeric;
    v_hits := v_hits || jsonb_build_object('type', 'count', 'count', (x ->> 'count')::int, 'min_pct', (x ->> 'min_pct')::numeric, 'ink', (x ->> 'ink')::numeric);
  end if;
  if coalesce(p_passed, false) then
    select min(q), avg(q) into v_min, v_avg from unnest(v_q) q;
    x := null;
    select r into x from jsonb_array_elements(p_rules) r
     where r ->> 'type' = 'all' and v_min >= coalesce((r ->> 'min_pct')::numeric, 0)
     order by coalesce((r ->> 'ink')::numeric, 0) desc limit 1;
    if x is not null and coalesce((x ->> 'ink')::numeric, 0) > 0 then
      v_ink := v_ink + (x ->> 'ink')::numeric;
      v_hits := v_hits || jsonb_build_object('type', 'all', 'min_pct', (x ->> 'min_pct')::numeric, 'ink', (x ->> 'ink')::numeric);
    end if;
    x := null;
    select r into x from jsonb_array_elements(p_rules) r
     where r ->> 'type' = 'average' and v_avg >= coalesce((r ->> 'min_pct')::numeric, 0)
     order by coalesce((r ->> 'ink')::numeric, 0) desc limit 1;
    if x is not null and coalesce((x ->> 'ink')::numeric, 0) > 0 then
      v_ink := v_ink + (x ->> 'ink')::numeric;
      v_hits := v_hits || jsonb_build_object('type', 'average', 'min_pct', (x ->> 'min_pct')::numeric, 'average', round(v_avg), 'ink', (x ->> 'ink')::numeric);
    end if;
  end if;
  return jsonb_build_object('ink', v_ink, 'hits', v_hits);
end $$;
revoke all on function private.bonus_ink(jsonb, jsonb, jsonb, int, boolean) from public;

create or replace function private.check_bonus_rules(p_rules jsonb) returns void
language plpgsql immutable as $$
declare r jsonb;
begin
  if p_rules is null or jsonb_typeof(p_rules) = 'null' then return; end if;
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 24 then raise exception 'invalid_bonus_rules' using errcode = 'P0001'; end if;
  for r in select e from jsonb_array_elements(p_rules) e loop
    if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'type', '') not in ('round', 'all', 'count', 'average')
       or jsonb_typeof(r -> 'min_pct') is distinct from 'number' or (r ->> 'min_pct')::numeric not between 0 and 100
       or jsonb_typeof(r -> 'ink') is distinct from 'number' or (r ->> 'ink')::numeric not between 0 and 100000
       or (r ->> 'type' = 'count' and (jsonb_typeof(r -> 'count') is distinct from 'number' or (r ->> 'count')::numeric not between 1 and 10)) then
      raise exception 'invalid_bonus_rules' using errcode = 'P0001';
    end if;
  end loop;
end $$;
revoke all on function private.check_bonus_rules(jsonb) from public;

create or replace function private.check_minigame_games(p_value jsonb) returns void
language plpgsql immutable as $$
declare g record; v_item jsonb;
begin
  for g in select k, v from jsonb_each(coalesce(p_value -> 'games', '{}'::jsonb)) x(k, v) loop
    if coalesce((g.v ->> 'ink_multiplier')::numeric, 1) not between 0 and 100
       or coalesce((g.v ->> 'rounds')::int, 5) not between 1 and 10
       or coalesce((g.v ->> 'max_level')::int, 60) not between 1 and 500
       or coalesce((g.v ->> 'base_ink')::numeric, 0) not between 0 and 100000
       or coalesce((g.v ->> 'ink_per_level')::numeric, 0) not between 0 and 10000
       or coalesce((g.v ->> 'plot_level_bonus')::numeric, 0) not between 0 and 10
       or (g.v ? 'level_ink' and (jsonb_typeof(g.v -> 'level_ink') <> 'array' or jsonb_array_length(g.v -> 'level_ink') > 500))
       or (g.v ? 'round_ink' and (jsonb_typeof(g.v -> 'round_ink') <> 'array' or jsonb_array_length(g.v -> 'round_ink') > 10))
       or (g.v ? 'boost' and jsonb_typeof(g.v -> 'boost') = 'object' and coalesce((g.v -> 'boost' ->> 'multiplier')::numeric, 1) not between 1 and 50) then
      raise exception 'invalid_minigame_config' using errcode = 'P0001';
    end if;
    if g.v ? 'boost' and jsonb_typeof(g.v -> 'boost') = 'object' and g.v -> 'boost' ->> 'ends_at' is not null then
      perform (g.v -> 'boost' ->> 'ends_at')::timestamptz; -- must be a real time
    end if;
    for v_item in select e from jsonb_array_elements(case when jsonb_typeof(g.v -> 'round_ink') = 'array' then g.v -> 'round_ink' else '[]'::jsonb end) e loop
      if jsonb_typeof(v_item) <> 'number' or v_item::numeric not between 0 and 100000 then raise exception 'invalid_minigame_config' using errcode = 'P0001'; end if;
    end loop;
    for v_item in select e from jsonb_array_elements(case when jsonb_typeof(g.v -> 'level_ink') = 'array' then g.v -> 'level_ink' else '[]'::jsonb end) e loop
      if jsonb_typeof(v_item) <> 'number' or v_item::numeric not between 0 and 100000 then raise exception 'invalid_minigame_config' using errcode = 'P0001'; end if;
    end loop;
    perform private.check_bonus_rules(g.v -> 'bonuses');
  end loop;
end $$;
revoke all on function private.check_minigame_games(jsonb) from public;

-- ===== 2. The live feed shows minigame and PvP wins ===============================
alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp'));


-- minigame finish: performance bonuses, an exact Ink breakdown, per-round quality and the live feed
create or replace function public.svc_finish_minigame(p_session_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
  v_game jsonb; v_plot_record jsonb; v_cleared int := 0; v_total int := 1; v_per_round numeric; v_boost numeric := 1; v_table jsonb; v_bonus numeric := 0; v_mask jsonb; v_unlimited boolean;
  v_quality jsonb; v_bonus_res jsonb := jsonb_build_object('ink', 0, 'hits', '[]'::jsonb); v_perf numeric := 0; v_breakdown jsonb;
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
  -- each cleared round pays its share of the level's Ink; clearing them all beats the level
  v_total := greatest(coalesce((p_result ->> 'rounds_total')::int, v_s.rounds, 1), 1);
  v_cleared := case when v_valid then least(greatest(coalesce((p_result ->> 'rounds_passed')::int, case when v_passed then v_total else 0 end), 0), v_total) else 0 end;

  -- how well each round went (0-100), for bonus rules and the operator's stats
  v_quality := case when v_valid and jsonb_typeof(p_result -> 'rounds_quality') = 'array' then p_result -> 'rounds_quality' else '[]'::jsonb end;

  select best_score into v_best_before from public.minigame_records where player_id = v_s.player_id and game = v_s.game;
  update public.minigame_sessions
     set status = case when v_valid then 'validated' else 'rejected' end,
         finished_at = now(), score = v_score, passed = v_passed, stars = v_stars,
         summary = p_result -> 'summary', flags = v_flags, quality = v_quality,
         play_ms = case when v_valid then least(greatest(coalesce((p_result ->> 'min_duration_ms')::numeric, 0), 0), v_elapsed + 2000)::int end,
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
    -- the operator can switch the daily cap on paid runs off entirely
    v_unlimited := not coalesce((v_cfg ->> 'limit_paid_runs')::boolean, true);
    v_limit := case when v_unlimited then 2147483647 else coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6) end;
    v_mult := (1 + coalesce((v_game ->> 'plot_level_bonus')::numeric, (v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    -- a live boost on this game multiplies its Ink until it ends
    if v_game ? 'boost' and coalesce((v_game -> 'boost' ->> 'multiplier')::numeric, 1) > 1
       and (v_game -> 'boost' ->> 'ends_at' is null or (v_game -> 'boost' ->> 'ends_at')::timestamptz > now()) then
      v_boost := least((v_game -> 'boost' ->> 'multiplier')::numeric, 50);
    end if;
    v_ink_mult := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0)
                         * greatest(coalesce((v_cfg -> 'games' -> v_s.game ->> 'ink_multiplier')::numeric, 1), 0) * v_boost;
    -- level_ink[level] pays once, for completing the level (every round cleared);
    -- round_ink[round] pays for each round cleared, by its position (round 1, round 2, …)
    v_table := v_game -> 'level_ink';
    v_per_round := case when jsonb_typeof(v_table) = 'array' and jsonb_array_length(v_table) > 0
      then (v_table ->> (least(v_s.level, jsonb_array_length(v_table)) - 1))::numeric else 0 end;  -- (level-complete Ink)
    if v_cleared > 0 and v_today < v_limit then
      v_mask := p_result -> 'rounds_mask';
      if jsonb_typeof(v_game -> 'round_ink') = 'array' then
        select coalesce(sum(coalesce((v_game -> 'round_ink' ->> (k - 1))::numeric, 0)), 0) into v_bonus
        from generate_series(1, v_total) k
        where case when jsonb_typeof(v_mask) = 'array' then coalesce((v_mask ->> (k - 1))::boolean, false) else k <= v_cleared end;
      end if;
      -- performance bonuses: tiers per round, every round above X%, N rounds above X%, average above X%
      v_bonus_res := private.bonus_ink(v_game -> 'bonuses', v_quality, v_mask, v_total, v_passed);
      v_perf := greatest(coalesce((v_bonus_res ->> 'ink')::numeric, 0), 0);
      v_ink := floor(((case when v_passed then greatest(coalesce(v_per_round, 0), 0) else 0 end) + greatest(v_bonus, 0) + v_perf) * v_ink_mult);
      if v_passed then
        v_bp := floor(((v_rw ->> 'brush_points_base')::numeric + (v_rw ->> 'brush_points_per_star')::numeric * v_stars) * least(v_mult, 1.5));
        v_pig := case when v_stars >= 3 then floor((v_rw ->> 'pigments_on_three_stars')::numeric * least(v_mult, 1.5)) else 0 end;
      else
        v_bp := (v_rw ->> 'fail_brush_points')::int;
      end if;
    elsif v_cleared > 0 then
      v_practice := true;
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    else
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    end if;
    v_held := coalesce((p_result ->> 'suspicious')::boolean, false);
    v_breakdown := jsonb_build_object(
      'level_ink', case when v_passed and v_cleared > 0 and not v_practice then floor(greatest(coalesce(v_per_round, 0), 0) * v_ink_mult) else 0 end,
      'round_ink', case when v_practice then 0 else floor(greatest(v_bonus, 0) * v_ink_mult) end,
      'bonus_ink', case when v_practice then 0 else floor(v_perf * v_ink_mult) end,
      'bonuses', case when v_practice then '[]'::jsonb else coalesce(v_bonus_res -> 'hits', '[]'::jsonb) end,
      'multiplier', round(coalesce(v_ink_mult, 0), 3), 'rarity', coalesce(v_rarity_mult, 1), 'plot_level', coalesce(v_plot_level, 1), 'boost', v_boost,
      'capped', v_practice, 'rounds_cleared', v_cleared, 'rounds', v_total);
    insert into public.minigame_rewards (session_id, player_id, ink, pigments, brush_points, multiplier, held, breakdown)
    values (p_session_id, v_s.player_id, v_ink, v_pig, v_bp, round(v_ink_mult, 3), v_held, v_breakdown);
    if v_held then
      insert into public.moderation_cases (kind, priority, session_id, subject_player_id, reason, details)
      values ('score_review', 2, p_session_id, v_s.player_id, 'suspicious_minigame_result',
              jsonb_build_object('flags', v_flags, 'score', v_score, 'game', v_s.game, 'level', v_s.level));
    else
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
      if v_ink > 0 then perform private.referral_qualify(v_s.player_id, 'first_win'); end if;
      -- the live feed: a cleared level (at most one minigame event per player every few minutes)
      if v_passed and not exists (select 1 from public.feed_events f where f.player_id = v_s.player_id and f.kind = 'minigame'
                                  and f.created_at > now() - interval '3 minutes') then
        insert into public.feed_events (kind, player_id, data)
        values ('minigame', v_s.player_id, jsonb_build_object('game', v_s.game, 'level', v_s.level, 'stars', v_stars));
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', case when v_valid then 'validated' else 'rejected' end,
    'valid', v_valid, 'passed', v_passed, 'score', v_score, 'stars', v_stars, 'flags', to_jsonb(v_flags),
    'new_best', v_score > coalesce(v_best_before, 0),
    'rewards', jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp, 'held', v_held,
                                  'multiplier', round(coalesce(v_ink_mult, 0), 3), 'practice', v_practice,
                                  'rounds_cleared', v_cleared, 'rounds', v_total, 'level_ink', case when v_passed then floor(coalesce(v_per_round, 0) * v_ink_mult) else 0 end, 'boost', v_boost,
                                  'rewarded_left', case when v_unlimited then null else greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0) end,
                                  'unlimited', coalesce(v_unlimited, false), 'round_ink', floor(v_bonus * coalesce(v_ink_mult, 1)),
                                  'bonus_ink', floor(v_perf * coalesce(v_ink_mult, 1)), 'bonuses', coalesce(v_bonus_res -> 'hits', '[]'::jsonb),
                                  'quality', v_quality,
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'plot_record', v_plot_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $$;
-- ===== 3. PvP minigames: free to play, anonymous, in rounds ======================
-- Replaces staked duels. Nobody puts Ink up: the operator sets what a win pays. You can't pick
-- (or see) who you play: the server pairs you at random with someone who started the same game,
-- never the same rival twice in the cooldown window, and pays only runs that meet a quality bar,
-- from accounts old enough, up to a daily limit, so a second account gains nothing a solo game
-- wouldn't. Both players get the same boards; each round goes to the higher score (a tie to the
-- faster round) and the match to whoever takes more rounds.

-- close out every staked duel: unfinished ones hand the stakes back
do $$
declare d record; r record;
begin
  for d in select * from public.duels where status in ('challenger_playing', 'open', 'opponent_playing') for update loop
    for r in select player_id, role from public.duel_runs where duel_id = d.id loop
      perform private.grant(r.player_id, jsonb_build_object('ink', d.stake), 'duel_refund', 'duel', d.id::text,
                            'duel:' || d.id || ':refund:' || left(r.role, 1));
    end loop;
    if not exists (select 1 from public.duel_runs where duel_id = d.id and player_id = d.challenger_id) then
      perform private.grant(d.challenger_id, jsonb_build_object('ink', d.stake), 'duel_refund', 'duel', d.id::text, 'duel:' || d.id || ':refund:c');
    end if;
    update public.duels set status = 'cancelled', finished_at = now() where id = d.id;
  end loop;
end $$;
update public.game_config set value = value || '{"enabled": false, "retired": true}'::jsonb where key = 'duels';
drop function if exists public.duel_create(text, int, text, text);
drop function if exists public.duel_accept(uuid, text);
drop function if exists public.duel_cancel(uuid);
drop function if exists public.duels_lobby();
drop function if exists public.svc_duel_run(uuid, uuid);
drop function if exists public.svc_duel_finish(uuid, uuid, jsonb);
drop function if exists public.admin_duels();

-- Ink a PvP match may pay
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
    end if;
  end loop;
end $$;

insert into public.game_config (key, value, description) values ('pvp', '{
  "enabled": true,
  "daily_rewarded_matches": 10,
  "min_account_hours": 24,
  "min_quality_pct": 50,
  "rematch_cooldown_hours": 24,
  "round_seconds": 90,
  "open_hours": 48,
  "games": {
    "turfwars":     {"enabled": true, "rounds": 3, "win_ink": 10, "draw_ink": 3, "round_win_ink": [0, 0, 0], "bonuses": []},
    "paletteclash": {"enabled": true, "rounds": 3, "win_ink": 10, "draw_ink": 3, "round_win_ink": [0, 0, 0], "bonuses": []},
    "forgery":      {"enabled": true, "rounds": 3, "win_ink": 10, "draw_ink": 3, "round_win_ink": [0, 0, 0], "bonuses": []},
    "pixelrecall":  {"enabled": true, "rounds": 3, "win_ink": 10, "draw_ink": 3, "round_win_ink": [0, 0, 0], "bonuses": []}
  }
}', 'PvP minigames: free head-to-head games in rounds against an anonymous rival. win_ink pays the match winner, round_win_ink[n] whoever takes round n, draw_ink both on a dead heat, and bonuses reward your own play (the same rules as minigames). Payouts need min_quality_pct, an account at least min_account_hours old, and stop after daily_rewarded_matches a day.')
on conflict (key) do nothing;

create or replace function private.check_pvp_config_trg() returns trigger
language plpgsql as $$
declare g record; v jsonb := new.value; x jsonb;
begin
  if new.key <> 'pvp' then return new; end if;
  if coalesce((v ->> 'daily_rewarded_matches')::int, -1) not between 0 and 1000
     or coalesce((v ->> 'min_account_hours')::numeric, -1) not between 0 and 8760
     or coalesce((v ->> 'min_quality_pct')::numeric, -1) not between 0 and 100
     or coalesce((v ->> 'rematch_cooldown_hours')::numeric, -1) not between 0 and 720
     or coalesce((v ->> 'round_seconds')::int, 0) not between 20 and 600
     or coalesce((v ->> 'open_hours')::numeric, 0) not between 1 and 720
     or jsonb_typeof(v -> 'games') is distinct from 'object' then
    raise exception 'invalid_pvp_config' using errcode = 'P0001';
  end if;
  for g in select k, val from jsonb_each(v -> 'games') e(k, val) loop
    if g.k not in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall')
       or coalesce((g.val ->> 'rounds')::int, 0) not between 1 and 7
       or coalesce((g.val ->> 'win_ink')::numeric, -1) not between 0 and 100000
       or coalesce((g.val ->> 'draw_ink')::numeric, 0) not between 0 and 100000
       or (g.val ? 'round_win_ink' and (jsonb_typeof(g.val -> 'round_win_ink') <> 'array' or jsonb_array_length(g.val -> 'round_win_ink') > 7)) then
      raise exception 'invalid_pvp_config' using errcode = 'P0001';
    end if;
    for x in select e from jsonb_array_elements(case when jsonb_typeof(g.val -> 'round_win_ink') = 'array' then g.val -> 'round_win_ink' else '[]'::jsonb end) e loop
      if jsonb_typeof(x) <> 'number' or x::numeric not between 0 and 100000 then raise exception 'invalid_pvp_config' using errcode = 'P0001'; end if;
    end loop;
    perform private.check_bonus_rules(g.val -> 'bonuses');
  end loop;
  return new;
end $$;
drop trigger if exists game_config_pvp_check on public.game_config;
create trigger game_config_pvp_check before insert or update on public.game_config for each row execute function private.check_pvp_config_trg();

create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall')),
  seed bigint not null,
  rounds int not null check (rounds between 1 and 7),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'done', 'expired')),
  created_by uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  open_until timestamptz not null,
  finished_at timestamptz,
  winner_id uuid references public.players(id) on delete set null,
  rounds_won_a int,
  rounds_won_b int,
  per_round jsonb
);
create index if not exists pvp_matches_open on public.pvp_matches (game, created_at) where status = 'waiting';
alter table public.pvp_matches enable row level security;
revoke all on public.pvp_matches from anon, authenticated;

create table if not exists public.pvp_runs (
  match_id uuid not null references public.pvp_matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seat text not null check (seat in ('a', 'b')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  valid boolean,
  rounds jsonb,           -- [{score, time_ms, quality, summary}]
  total_score int,
  total_ms int,
  avg_quality int,
  flags text[] not null default '{}',
  bonus jsonb,            -- personal bonus breakdown (paid when the run is checked)
  reward jsonb,           -- result payout (paid when the match is decided)
  ink int not null default 0,
  primary key (match_id, player_id),
  unique (match_id, seat)
);
create index if not exists pvp_runs_player on public.pvp_runs (player_id, started_at desc);
alter table public.pvp_runs enable row level security;
revoke all on public.pvp_runs from anon, authenticated;

create or replace function private.pvp_game_cfg(p_game text) returns jsonb
language sql stable as $$ select coalesce(private.cfg('pvp') -> 'games' -> p_game, '{}'::jsonb) $$;

create or replace function private.pvp_deadline(r public.pvp_runs, p_rounds int) returns timestamptz
language sql stable as $$
  select r.started_at + make_interval(secs => p_rounds * coalesce((private.cfg('pvp') ->> 'round_seconds')::int, 90) + 30)
$$;

-- Is this player's run allowed to earn match Ink? (quality bar, account age, daily limit)
create or replace function private.pvp_eligible(p_player uuid, r public.pvp_runs) returns text
language plpgsql stable as $$
declare v_cfg jsonb := private.cfg('pvp'); v_age numeric;
begin
  if not coalesce(r.valid, false) then return 'run_not_verified'; end if;
  if coalesce(r.avg_quality, 0) < coalesce((v_cfg ->> 'min_quality_pct')::numeric, 50) then return 'below_quality_bar'; end if;
  select extract(epoch from now() - created_at) / 3600 into v_age from public.players where id = p_player;
  if coalesce(v_age, 0) < coalesce((v_cfg ->> 'min_account_hours')::numeric, 24) then return 'account_too_new'; end if;
  if (select count(*) from public.pvp_runs x where x.player_id = p_player and x.ink > 0 and x.finished_at >= private.day_start(now())
        and x.match_id <> r.match_id) >= coalesce((v_cfg ->> 'daily_rewarded_matches')::int, 10) then
    return 'daily_limit';
  end if;
  return null;
end $$;

-- Decide a match where both runs are in, and pay it out.
create or replace function private.pvp_resolve(p_match uuid) returns void
language plpgsql as $$
declare
  m public.pvp_matches%rowtype; a public.pvp_runs%rowtype; b public.pvp_runs%rowtype; g jsonb;
  k int; sa int; sb int; ta int; tb int; v_per jsonb := '[]'::jsonb; wa int := 0; wb int := 0; v_win text; v_pay numeric; v_why text; v_seat text; r public.pvp_runs%rowtype;
  v_ta int; v_tb int; v_rival_valid boolean;
begin
  select * into m from public.pvp_matches where id = p_match for update;
  if m.status <> 'playing' then return; end if;
  select * into a from public.pvp_runs where match_id = p_match and seat = 'a';
  select * into b from public.pvp_runs where match_id = p_match and seat = 'b';
  if a.finished_at is null or b.finished_at is null then return; end if;
  g := private.pvp_game_cfg(m.game);
  for k in 1 .. m.rounds loop
    sa := case when a.valid then coalesce((a.rounds -> (k - 1) ->> 'score')::int, 0) else 0 end;
    sb := case when b.valid then coalesce((b.rounds -> (k - 1) ->> 'score')::int, 0) else 0 end;
    ta := case when a.valid then coalesce((a.rounds -> (k - 1) ->> 'time_ms')::int, 2147483647) else 2147483647 end;
    tb := case when b.valid then coalesce((b.rounds -> (k - 1) ->> 'time_ms')::int, 2147483647) else 2147483647 end;
    v_per := v_per || to_jsonb(case when sa > sb then 'a' when sb > sa then 'b' when ta < tb then 'a' when tb < ta then 'b' else 'tie' end);
  end loop;
  select count(*) filter (where x = '"a"'), count(*) filter (where x = '"b"') into wa, wb from jsonb_array_elements(v_per) x;
  v_ta := case when coalesce(a.valid, false) then coalesce(a.total_score, 0) else 0 end;
  v_tb := case when coalesce(b.valid, false) then coalesce(b.total_score, 0) else 0 end;
  v_win := case when wa <> wb then case when wa > wb then 'a' else 'b' end
                when v_ta <> v_tb then case when v_ta > v_tb then 'a' else 'b' end
                when coalesce(a.valid, false) and coalesce(b.valid, false) and a.total_ms <> b.total_ms then case when a.total_ms < b.total_ms then 'a' else 'b' end
                else 'draw' end;
  update public.pvp_matches set status = 'done', finished_at = now(), per_round = v_per, rounds_won_a = wa, rounds_won_b = wb,
         winner_id = case v_win when 'a' then a.player_id when 'b' then b.player_id end
   where id = p_match;
  foreach v_seat in array array['a', 'b'] loop
    r := case when v_seat = 'a' then a else b end;
    v_pay := 0;
    -- rounds this player took
    select coalesce(sum(coalesce((g -> 'round_win_ink' ->> (i - 1))::numeric, 0)), 0) into v_pay
      from generate_series(1, m.rounds) i where v_per ->> (i - 1) = v_seat;
    v_pay := v_pay + case when v_win = v_seat then coalesce((g ->> 'win_ink')::numeric, 0) when v_win = 'draw' then coalesce((g ->> 'draw_ink')::numeric, 0) else 0 end;
    v_why := private.pvp_eligible(r.player_id, r);
    -- beating a rival who never really played (timed out or an unverifiable run) pays nothing
    v_rival_valid := case when v_seat = 'a' then coalesce(b.valid, false) else coalesce(a.valid, false) end;
    if v_why is null and not v_rival_valid then v_why := 'rival_did_not_play'; end if;
    if v_why is not null then v_pay := 0; end if;
    v_pay := floor(greatest(v_pay, 0));
    update public.pvp_runs set reward = jsonb_build_object('result', case when v_win = 'draw' then 'draw' when v_win = v_seat then 'won' else 'lost' end,
                                                          'ink', v_pay, 'rounds_won', case when v_seat = 'a' then wa else wb end, 'withheld', v_why),
                               ink = ink + v_pay
     where match_id = p_match and player_id = r.player_id;
    if v_pay > 0 then
      perform private.grant(r.player_id, jsonb_build_object('ink', v_pay), 'pvp', 'pvp_match', p_match::text, 'pvp:' || p_match || ':' || v_seat);
    end if;
    if v_win = v_seat then
      insert into public.feed_events (kind, player_id, data)
      values ('pvp', r.player_id, jsonb_build_object('game', m.game, 'rounds_won', case when v_seat = 'a' then wa else wb end, 'rounds', m.rounds));
    end if;
  end loop;
end $$;

-- Close out runs that ran out of time (they score nothing) and matches nobody joined.
create or replace function private.pvp_sweep() returns void
language plpgsql as $$
declare v_m record;
begin
  update public.pvp_runs r set finished_at = now(), valid = false, rounds = '[]'::jsonb, total_score = 0, total_ms = 0, avg_quality = 0, flags = array['timed_out']
    from public.pvp_matches x
   where x.id = r.match_id and r.finished_at is null and now() > private.pvp_deadline(r, x.rounds);
  for v_m in select id from public.pvp_matches where status = 'playing'
           and not exists (select 1 from public.pvp_runs r where r.match_id = pvp_matches.id and r.finished_at is null) for update skip locked loop
    perform private.pvp_resolve(v_m.id);
  end loop;
  -- nobody joined in time, or the opener walked away: nobody else gets matched into it
  update public.pvp_matches pm set status = 'expired', finished_at = now()
   where pm.status = 'waiting' and (pm.open_until < now()
     or exists (select 1 from public.pvp_runs pr where pr.match_id = pm.id and pr.seat = 'a' and pr.finished_at is not null and not coalesce(pr.valid, false)));
end $$;

-- What a player may see of a match: their own rounds, and the rival's only once it's decided.
-- Never who the rival is.
create or replace function private.pvp_view(m public.pvp_matches, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'match_id', m.id, 'game', m.game, 'rounds', m.rounds, 'created_at', m.created_at, 'finished_at', m.finished_at,
    'status', case when m.status = 'done' then 'done' when m.status = 'expired' then 'expired'
                   when mine.finished_at is null then 'playing' else 'waiting' end,
    'you', jsonb_build_object('rounds', mine.rounds, 'total_score', mine.total_score, 'avg_quality', mine.avg_quality, 'valid', mine.valid, 'bonus', mine.bonus, 'reward', mine.reward, 'ink', mine.ink),
    'rival', case when m.status = 'done' then jsonb_build_object('name', 'Anonymous rival', 'rounds', (select jsonb_agg(jsonb_build_object('score', e ->> 'score', 'time_ms', e ->> 'time_ms', 'quality', e ->> 'quality')) from jsonb_array_elements(coalesce(o.rounds, '[]'::jsonb)) e), 'total_score', o.total_score) end,
    'per_round', case when m.status = 'done' then (select jsonb_agg(case when w #>> '{}' = 'tie' then 'tie' when w #>> '{}' = mine.seat then 'you' else 'rival' end) from jsonb_array_elements(m.per_round) w) end,
    'result', case when m.status = 'done' then coalesce(mine.reward ->> 'result', case when m.winner_id is null then 'draw' when m.winner_id = p_viewer then 'won' else 'lost' end) end)
  from public.pvp_runs mine
  left join public.pvp_runs o on o.match_id = m.id and o.player_id <> p_viewer
  where mine.match_id = m.id and mine.player_id = p_viewer
$$;

create or replace function private.pvp_start_json(m public.pvp_matches, r public.pvp_runs) returns jsonb
language sql stable as $$
  select jsonb_build_object('match_id', m.id, 'game', m.game, 'seed', m.seed, 'rounds', m.rounds, 'started_at', r.started_at,
    'expires_at', private.pvp_deadline(r, m.rounds), 'round_seconds', coalesce((private.cfg('pvp') ->> 'round_seconds')::int, 90),
    'matched', m.status = 'playing', 'server_time', now())
$$;

-- Find a game: join a random open match from someone else (never one you've faced recently), or open one.
create or replace function public.pvp_play(p_game text, p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cfg jsonb := private.cfg('pvp'); g jsonb; v_prev jsonb;
  m public.pvp_matches%rowtype; r public.pvp_runs%rowtype; v_res jsonb; v_cool interval;
begin
  perform private.pvp_sweep();
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then raise exception 'pvp_disabled' using errcode = 'P0001'; end if;
  g := private.pvp_game_cfg(p_game);
  if p_game not in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall') or not coalesce((g ->> 'enabled')::boolean, true) then
    raise exception 'invalid_game' using errcode = 'P0001';
  end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'pvp_play');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('pvp_play', 60, 3600);
  if exists (select 1 from public.pvp_runs x where x.player_id = v_uid and x.finished_at is null) then
    raise exception 'pvp_in_progress' using errcode = 'P0001';
  end if;
  v_cool := make_interval(secs => coalesce((v_cfg ->> 'rematch_cooldown_hours')::numeric, 24) * 3600);
  select * into m from public.pvp_matches x
   where x.status = 'waiting' and x.game = p_game and x.created_by <> v_uid and x.open_until > now()
     and not exists (  -- no rematch against the same player within the cooldown
       select 1 from public.pvp_runs mine join public.pvp_runs theirs on theirs.match_id = mine.match_id and theirs.player_id = x.created_by
       where mine.player_id = v_uid and mine.started_at > now() - v_cool)
   order by random() limit 1 for update skip locked;
  if found then
    update public.pvp_matches set status = 'playing' where id = m.id returning * into m;
    insert into public.pvp_runs (match_id, player_id, seat) values (m.id, v_uid, 'b') returning * into r;
  else
    insert into public.pvp_matches (game, seed, rounds, created_by, open_until)
    values (p_game, floor(random() * 2147483646 + 1)::bigint, least(greatest(coalesce((g ->> 'rounds')::int, 3), 1), 7), v_uid,
            now() + make_interval(secs => coalesce((v_cfg ->> 'open_hours')::numeric, 48) * 3600))
    returning * into m;
    insert into public.pvp_runs (match_id, player_id, seat) values (m.id, v_uid, 'a') returning * into r;
  end if;
  v_res := private.pvp_start_json(m, r);
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

create or replace function public.pvp_lobby() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_cfg jsonb;
begin
  perform private.pvp_sweep();
  v_cfg := private.cfg('pvp');
  return jsonb_build_object(
    'config', jsonb_build_object(
      'enabled', coalesce((v_cfg ->> 'enabled')::boolean, false), 'round_seconds', v_cfg -> 'round_seconds',
      'daily_rewarded_matches', v_cfg -> 'daily_rewarded_matches', 'min_quality_pct', v_cfg -> 'min_quality_pct',
      'min_account_hours', v_cfg -> 'min_account_hours',
      'games', (select coalesce(jsonb_object_agg(k, jsonb_build_object('enabled', coalesce((v ->> 'enabled')::boolean, true), 'rounds', v -> 'rounds',
                         'win_ink', v -> 'win_ink', 'draw_ink', v -> 'draw_ink', 'round_win_ink', v -> 'round_win_ink', 'bonuses', coalesce(v -> 'bonuses', '[]'::jsonb),
                         'waiting', (select count(*) from public.pvp_matches x where x.status = 'waiting' and x.game = k and x.created_by is distinct from v_uid and x.open_until > now()))), '{}'::jsonb)
                from jsonb_each(coalesce(v_cfg -> 'games', '{}'::jsonb)) e(k, v))),
    'matches', case when v_uid is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(private.pvp_view(m, v_uid) order by m.created_at desc), '[]'::jsonb)
      from (select x.* from public.pvp_matches x join public.pvp_runs r on r.match_id = x.id and r.player_id = v_uid
            order by r.started_at desc limit 30) m) end,
    'record', case when v_uid is null then null else (
      select jsonb_build_object('won', count(*) filter (where r.reward ->> 'result' = 'won'), 'lost', count(*) filter (where r.reward ->> 'result' = 'lost'),
                                'draws', count(*) filter (where r.reward ->> 'result' = 'draw'), 'ink', coalesce(sum(r.ink), 0),
                                'paid_today', count(*) filter (where r.ink > 0 and r.finished_at >= private.day_start(now())))
      from public.pvp_runs r where r.player_id = v_uid) end,
    'resets_at', private.day_start(now()) + interval '1 day');
end $$;

-- the validator (Edge Function / worker) reads the run it is checking
create or replace function public.svc_pvp_run(p_match_id uuid, p_player_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('match_id', m.id, 'game', m.game, 'seed', m.seed, 'rounds', m.rounds, 'seat', r.seat,
                            'started_at', r.started_at, 'finished', r.finished_at is not null)
  from public.pvp_matches m join public.pvp_runs r on r.match_id = m.id
  where m.id = p_match_id and r.player_id = p_player_id
$$;

create or replace function public.svc_pvp_finish(p_match_id uuid, p_player_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.pvp_matches%rowtype; r public.pvp_runs%rowtype; g jsonb; v_valid boolean; v_rounds jsonb; v_q jsonb; v_bonus jsonb; v_ink int := 0; v_why text;
  v_elapsed numeric; v_claimed numeric;
begin
  select * into m from public.pvp_matches where id = p_match_id for update;
  select * into r from public.pvp_runs where match_id = p_match_id and player_id = p_player_id for update;
  if not found then raise exception 'match_unavailable' using errcode = 'P0001'; end if;
  if r.finished_at is not null then raise exception 'run_finished' using errcode = 'P0001'; end if;
  g := private.pvp_game_cfg(m.game);
  v_elapsed := extract(epoch from (now() - r.started_at)) * 1000;
  v_rounds := case when jsonb_typeof(p_result -> 'rounds') = 'array' then p_result -> 'rounds' else '[]'::jsonb end;
  select coalesce(sum(least(greatest(coalesce((e ->> 'time_ms')::numeric, 0), 0), 3600000)), 0) into v_claimed from jsonb_array_elements(v_rounds) e;
  v_valid := coalesce((p_result ->> 'valid')::boolean, false) and jsonb_array_length(v_rounds) = m.rounds
             and v_claimed <= v_elapsed + 2000 and now() <= private.pvp_deadline(r, m.rounds) + interval '20 seconds';
  if not v_valid then v_rounds := '[]'::jsonb; end if;
  v_rounds := (select coalesce(jsonb_agg(jsonb_build_object(
                 'score', greatest(0, least(coalesce((e ->> 'score')::int, 0), 100000)),
                 'time_ms', greatest(0, coalesce((e ->> 'time_ms')::int, 0)),
                 'quality', least(greatest(coalesce((e ->> 'quality')::int, 0), 0), 100),
                 'summary', coalesce(e -> 'summary', '{}'::jsonb)) order by n), '[]'::jsonb)
               from jsonb_array_elements(v_rounds) with ordinality t(e, n));
  update public.pvp_runs set finished_at = now(), valid = v_valid, rounds = v_rounds,
         total_score = (select coalesce(sum((e ->> 'score')::int), 0) from jsonb_array_elements(v_rounds) e),
         total_ms = (select coalesce(sum((e ->> 'time_ms')::int), 0) from jsonb_array_elements(v_rounds) e),
         avg_quality = (select coalesce(round(avg((e ->> 'quality')::int)), 0) from jsonb_array_elements(v_rounds) e),
         flags = coalesce((select array_agg(f) from jsonb_array_elements_text(coalesce(p_result -> 'flags', '[]'::jsonb)) f), '{}')
   where match_id = p_match_id and player_id = p_player_id returning * into r;
  -- your own play earns its bonuses straight away (every round counts as played)
  if v_valid then
    select coalesce(jsonb_agg(true), '[]'::jsonb) into v_q from generate_series(1, m.rounds);
    v_bonus := private.bonus_ink(g -> 'bonuses', (select jsonb_agg(e -> 'quality') from jsonb_array_elements(v_rounds) e), v_q, m.rounds, true);
    v_why := private.pvp_eligible(p_player_id, r);
    v_ink := case when v_why is null then floor(greatest(coalesce((v_bonus ->> 'ink')::numeric, 0), 0)) else 0 end;
    update public.pvp_runs set bonus = v_bonus || jsonb_build_object('paid', v_ink, 'withheld', case when v_ink = 0 and coalesce((v_bonus ->> 'ink')::numeric, 0) > 0 then v_why end),
                               ink = ink + v_ink
     where match_id = p_match_id and player_id = p_player_id;
    if v_ink > 0 then
      perform private.grant(p_player_id, jsonb_build_object('ink', v_ink), 'pvp', 'pvp_match', p_match_id::text, 'pvp:' || p_match_id || ':bonus:' || r.seat);
    end if;
  end if;
  if m.status = 'playing' then perform private.pvp_resolve(m.id); end if;
  select * into m from public.pvp_matches where id = p_match_id;
  return private.pvp_view(m, p_player_id) || jsonb_build_object('balances', private.balances(p_player_id));
end $$;

-- The operator sees everything, names included, and pairs that keep meeting.
create or replace function public.admin_pvp() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy', 'moderator']);
begin
  return jsonb_build_object(
    'today', (select jsonb_build_object('matches', count(*), 'done', count(*) filter (where m.status = 'done'), 'waiting', count(*) filter (where m.status = 'waiting'),
                                        'ink_paid', (select coalesce(sum(r.ink), 0) from public.pvp_runs r where r.finished_at >= private.day_start(now())))
              from public.pvp_matches m where m.created_at >= private.day_start(now())),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'game', m.game, 'status', m.status, 'rounds', m.rounds, 'created_at', m.created_at,
                 'per_round', m.per_round,
                 'players', (select jsonb_agg(jsonb_build_object('seat', r.seat, 'player', private.profile_json(r.player_id), 'total_score', r.total_score,
                                                                  'avg_quality', r.avg_quality, 'valid', r.valid, 'ink', r.ink, 'result', r.reward ->> 'result',
                                                                  'withheld', coalesce(r.reward ->> 'withheld', r.bonus ->> 'withheld')) order by r.seat)
                             from public.pvp_runs r where r.match_id = m.id)) order by m.created_at desc), '[]'::jsonb)
               from (select * from public.pvp_matches order by created_at desc limit 40) m),
    -- the same two accounts meeting again and again can be one person
    'frequent_pairs', (select coalesce(jsonb_agg(jsonb_build_object('a', private.profile_json(p.a), 'b', private.profile_json(p.b), 'matches', p.n, 'ink', p.ink) order by p.n desc), '[]'::jsonb)
                       from (select least(x.player_id, y.player_id) a, greatest(x.player_id, y.player_id) b, count(*) n, sum(x.ink + y.ink) / 1 ink
                             from public.pvp_runs x join public.pvp_runs y on y.match_id = x.match_id and y.seat = 'b' and x.seat = 'a'
                             where x.started_at > now() - interval '7 days'
                             group by 1, 2 having count(*) >= 3 order by count(*) desc limit 20) p));
end $$;

-- ===== 4. The operator's view of how a player earns ===============================
create or replace function private.avg_quality(q jsonb) returns numeric
language sql immutable as $$
  select case when jsonb_typeof(q) = 'array' and jsonb_array_length(q) > 0 then round(avg((e #>> '{}')::numeric), 1) end
  from jsonb_array_elements(case when jsonb_typeof(q) = 'array' then q else '[]'::jsonb end) e
$$;

create or replace function public.admin_player_minigames(p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy', 'moderator', 'support']);
begin
  return jsonb_build_object(
    -- one line per game: how often, how well, how fast, and what it paid
    'games', (select coalesce(jsonb_agg(x order by x ->> 'game'), '[]'::jsonb) from (
      select jsonb_build_object(
        'game', s.game,
        'plays', count(*),
        'verified', count(*) filter (where s.status = 'validated'),
        'rejected', count(*) filter (where s.status = 'rejected'),
        'abandoned', count(*) filter (where s.status in ('expired', 'abandoned', 'active')),
        'flagged', count(*) filter (where s.review_status = 'flagged'),
        'levels_cleared', count(*) filter (where s.passed),
        'clear_rate', round(100.0 * count(*) filter (where s.passed) / nullif(count(*) filter (where s.status = 'validated'), 0), 1),
        'highest_level', coalesce(max(s.level) filter (where s.passed), 0),
        'avg_clear_ms', round(avg(coalesce(s.play_ms, extract(epoch from s.finished_at - s.started_at) * 1000)) filter (where s.passed)),
        'best_clear_ms', round(min(coalesce(s.play_ms, extract(epoch from s.finished_at - s.started_at) * 1000)) filter (where s.passed)),
        'avg_quality', round(avg(private.avg_quality(s.quality)), 1),
        'best_quality', max(private.avg_quality(s.quality)),
        'ink', coalesce(sum(w.ink) filter (where not w.held), 0),
        'ink_held', coalesce(sum(w.ink) filter (where w.held), 0),
        'ink_7d', coalesce(sum(w.ink) filter (where not w.held and w.created_at > now() - interval '7 days'), 0),
        'ink_today', coalesce(sum(w.ink) filter (where not w.held and w.created_at >= private.day_start(now())), 0),
        'level_ink', coalesce(sum((w.breakdown ->> 'level_ink')::numeric), 0),
        'round_ink', coalesce(sum((w.breakdown ->> 'round_ink')::numeric), 0),
        'bonus_ink', coalesce(sum((w.breakdown ->> 'bonus_ink')::numeric), 0),
        'capped_runs', count(*) filter (where (w.breakdown ->> 'capped')::boolean),
        'last_played_at', max(s.started_at)) x
      from public.minigame_sessions s left join public.minigame_rewards w on w.session_id = s.id
      where s.player_id = p_player_id group by s.game) g),
    -- each plot's own level progress
    'plots', (select coalesce(jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'game', p.game, 'name', wp.name, 'rarity', wp.rarity,
                                                         'highest_level', p.highest_level, 'plays', p.plays, 'wins', p.wins, 'best_score', p.best_score,
                                                         'updated_at', p.updated_at) order by p.updated_at desc), '[]'::jsonb)
              from public.plot_game_progress p left join public.world_plots wp on wp.gx = p.gx and wp.gy = p.gy
              where p.player_id = p_player_id),
    -- every recent run with its rounds and exactly how its Ink was made up
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', s.id, 'game', s.game, 'level', s.level, 'gx', s.gx, 'gy', s.gy, 'status', s.status, 'review_status', s.review_status,
                   'started_at', s.started_at, 'finished_at', s.finished_at, 'play_ms', s.play_ms,
                   'server_ms', round(extract(epoch from s.finished_at - s.started_at) * 1000),
                   'passed', s.passed, 'stars', s.stars, 'score', s.score, 'rounds', s.rounds, 'quality', s.quality,
                   'avg_quality', private.avg_quality(s.quality), 'flags', to_jsonb(s.flags),
                   'rounds_detail', coalesce(s.summary -> 'rounds', s.summary -> 'shapes'),
                   'ink', w.ink, 'held', w.held, 'multiplier', w.multiplier, 'breakdown', w.breakdown) order by s.started_at desc), '[]'::jsonb)
                 from (select * from public.minigame_sessions where player_id = p_player_id order by started_at desc limit 80) s
                 left join public.minigame_rewards w on w.session_id = s.id),
    -- every Ink credit by where it came from
    'ink_sources', (select coalesce(jsonb_agg(jsonb_build_object('reason', l.reason, 'total', l.total, 'd7', l.d7, 'today', l.today, 'credits', l.n) order by l.total desc), '[]'::jsonb)
                    from (select reason, sum(delta) total, sum(delta) filter (where created_at > now() - interval '7 days') d7,
                                 sum(delta) filter (where created_at >= private.day_start(now())) today, count(*) n
                          from public.resource_ledger where player_id = p_player_id and resource = 'ink' and delta > 0 group by reason) l),
    'ink_spent', (select coalesce(jsonb_agg(jsonb_build_object('reason', l.reason, 'total', -l.total, 'debits', l.n) order by l.total), '[]'::jsonb)
                  from (select reason, sum(delta) total, count(*) n from public.resource_ledger
                        where player_id = p_player_id and resource = 'ink' and delta < 0 group by reason) l),
    -- PvP: their record, recent matches and who they keep meeting (names shown to staff only)
    'pvp', jsonb_build_object(
      'record', (select jsonb_build_object('matches', count(*), 'won', count(*) filter (where reward ->> 'result' = 'won'),
                                           'lost', count(*) filter (where reward ->> 'result' = 'lost'), 'draws', count(*) filter (where reward ->> 'result' = 'draw'),
                                           'ink', coalesce(sum(ink), 0), 'avg_quality', round(avg(avg_quality), 1))
                 from public.pvp_runs where player_id = p_player_id),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('match_id', m.id, 'game', m.game, 'started_at', r.started_at, 'status', m.status,
                    'result', r.reward ->> 'result', 'ink', r.ink, 'avg_quality', r.avg_quality, 'total_score', r.total_score, 'total_ms', r.total_ms,
                    'withheld', coalesce(r.reward ->> 'withheld', r.bonus ->> 'withheld'), 'valid', r.valid,
                    'rival', private.profile_json(o.player_id), 'rival_score', o.total_score) order by r.started_at desc), '[]'::jsonb)
                 from (select * from public.pvp_runs where player_id = p_player_id order by started_at desc limit 30) r
                 join public.pvp_matches m on m.id = r.match_id
                 left join public.pvp_runs o on o.match_id = r.match_id and o.player_id <> r.player_id),
      'rivals', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(x.rival), 'matches', x.n, 'won', x.won) order by x.n desc), '[]'::jsonb)
                 from (select o.player_id rival, count(*) n, count(*) filter (where r.reward ->> 'result' = 'won') won
                       from public.pvp_runs r join public.pvp_runs o on o.match_id = r.match_id and o.player_id <> r.player_id
                       where r.player_id = p_player_id group by o.player_id order by count(*) desc limit 10) x)));
end $$;

-- ===== 5. Permissions ==================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'private.pvp_game_cfg(text)', 'private.pvp_deadline(public.pvp_runs, int)', 'private.pvp_eligible(uuid, public.pvp_runs)',
    'private.pvp_resolve(uuid)', 'private.pvp_sweep()', 'private.pvp_view(public.pvp_matches, uuid)',
    'private.pvp_start_json(public.pvp_matches, public.pvp_runs)', 'private.check_pvp_config_trg()', 'private.avg_quality(jsonb)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.pvp_play(text, text)', 'public.pvp_lobby()', 'public.svc_pvp_run(uuid, uuid)', 'public.svc_pvp_finish(uuid, uuid, jsonb)',
                           'public.admin_pvp()', 'public.admin_player_minigames(uuid)', 'public.svc_finish_minigame(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if f like 'public.svc\_%' then
      execute format('grant execute on function %s to service_role', f);
    else
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
end $$;
