-- v0.12: complete control over minigame Ink.
--   minigames.games.<game>.level_ink = [Ink for COMPLETING level 1, level 2, …]  (paid once, only when every round is cleared)
--   minigames.games.<game>.round_ink = [Ink for clearing round 1, round 2, …]     (paid per cleared round; 0 = nothing)
-- Both are multiplied by rarity, plot upgrades, multipliers and boosts. The old round bonus becomes round_ink.

update public.game_config c
   set value = jsonb_set(c.value, '{games}', (
     select coalesce(jsonb_object_agg(g.k, (g.v - 'round_bonus') || jsonb_build_object('round_ink',
              coalesce(g.v -> 'round_bonus', (select jsonb_agg(0) from generate_series(1, greatest(coalesce((g.v ->> 'rounds')::int, 5), 1)))))), '{}'::jsonb)
     from jsonb_each(c.value -> 'games') g(k, v)), true)
 where c.key = 'minigames';

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
    if g.v ? 'round_ink' then
      for v_item in select e from jsonb_array_elements(g.v -> 'round_ink') e loop
        if jsonb_typeof(v_item) <> 'number' or v_item::numeric not between 0 and 100000 then
          raise exception 'invalid_minigame_config' using errcode = 'P0001';
        end if;
      end loop;
    end if;
    if g.v ? 'level_ink' then
      for v_item in select e from jsonb_array_elements(g.v -> 'level_ink') e loop
        if jsonb_typeof(v_item) <> 'number' or v_item::numeric not between 0 and 100000 then
          raise exception 'invalid_minigame_config' using errcode = 'P0001';
        end if;
      end loop;
    end if;
  end loop;
end $$;
revoke all on function private.check_minigame_games(jsonb) from public;

create or replace function public.svc_finish_minigame(p_session_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
  v_game jsonb; v_plot_record jsonb; v_cleared int := 0; v_total int := 1; v_per_round numeric; v_boost numeric := 1; v_table jsonb; v_bonus numeric := 0; v_mask jsonb; v_unlimited boolean;
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
      v_ink := floor(((case when v_passed then greatest(coalesce(v_per_round, 0), 0) else 0 end) + greatest(v_bonus, 0)) * v_ink_mult);
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
                                  'rounds_cleared', v_cleared, 'rounds', v_total, 'level_ink', case when v_passed then floor(coalesce(v_per_round, 0) * v_ink_mult) else 0 end, 'boost', v_boost,
                                  'rewarded_left', case when v_unlimited then null else greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0) end,
                                  'unlimited', coalesce(v_unlimited, false), 'round_ink', floor(v_bonus * coalesce(v_ink_mult, 1)),
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'plot_record', v_plot_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $$;
