-- v0.7: location privacy and fair progress.
--  * explorers follow real GPS only: no teleports, no hand placement, no travel to a tapped plot
--  * the joystick holds one minute and stays on a leash around the player's real position
--  * art can no longer be searched by place
--  * every level needs all its rounds cleared; each cleared round pays its share of Ink
--  * every plot's minigame level starts over at 1 (production upgrades are kept)

-- ===== 1. GPS-only explorers ====================================================
update public.game_config
   set value = jsonb_set(
         jsonb_set(value || '{"manual_travel": false}'::jsonb, '{joystick}',
                   coalesce(value -> 'joystick', '{}'::jsonb) || '{"tank_seconds": 60}'::jsonb, true),
         '{gps_only}', 'true'::jsonb, true)
 where key = 'explorer';

-- explorers that were placed by hand (never had a GPS fix) are removed: the next GPS fix places them again
delete from public.explorers where gps_at is null;
-- everyone else snaps back to their last real GPS position; trips in progress stop; tanks hold a minute
update public.explorers
   set mode = 'gps', lng = gps_lng, lat = gps_lat, fixed_at = now(), accuracy_m = gps_accuracy_m,
       dest_lng = null, dest_lat = null, speed_mps = null,
       joy_seconds = least(coalesce(joy_seconds, 60), 60), updated_at = now();

create or replace function public.travel_to(p_lng float8, p_lat float8, p_jump boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_active_player();
  raise exception 'gps_required' using errcode = 'P0001';
end $$;

create or replace function public.joystick_step(p_lng float8, p_lat float8) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  j jsonb := coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb);
  e public.explorers%rowtype; c record; t record;
  v_speed float8 := greatest(coalesce((j ->> 'speed_kmh')::float8, 40), 1) / 3.6;
  v_tank float8 := greatest(coalesce((j ->> 'tank_seconds')::float8, 60), 0);
  v_burst float8 := least(greatest(coalesce((j ->> 'burst_seconds')::float8, 4), 1), 30);
  v_day timestamptz := private.day_start(now());
  v_refill boolean; v_secs float8; v_bucket float8; v_dt float8; v_d float8; v_allow float8;
begin
  perform private.rate_limit('joystick', 9000, 3600);
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -85.05 and 85.05 then
    raise exception 'invalid_position' using errcode = 'P0001';
  end if;
  if not coalesce((j ->> 'enabled')::boolean, true) then raise exception 'joystick_disabled' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  -- the joystick only nudges a GPS-anchored explorer, and never further than one tank from the player
  if e.gps_at is null or e.gps_at < now() - interval '20 minutes' then
    raise exception 'gps_required' using errcode = 'P0001';
  end if;
  v_refill := coalesce((j ->> 'daily_refill')::boolean, true) and (e.joy_day is null or e.joy_day < v_day);
  v_secs := case when v_refill then greatest(e.joy_seconds, v_tank) else e.joy_seconds end;
  select * into c from private.explorer_now(v_uid);
  v_dt := case when e.joy_at is null then v_burst else greatest(extract(epoch from (now() - e.joy_at)), 0) end;
  v_bucket := least(v_speed * v_burst, coalesce(e.joy_bucket_m, 0) + v_dt * v_speed * 1.15);
  v_d := private.haversine_m(c.lng, c.lat, p_lng, p_lat);
  v_allow := greatest(least(v_d, v_bucket, v_secs * v_speed), 0);
  if v_allow < 0.01 then
    update public.explorers
       set joy_seconds = v_secs::real, joy_day = case when v_refill then v_day else e.joy_day end,
           joy_bucket_m = v_bucket::real, joy_at = now()
     where player_id = v_uid;
    return private.explorer_json(v_uid) || jsonb_build_object('moved_m', 0, 'clamped', v_d > 0.5, 'empty', v_secs <= 0.01);
  end if;
  select * into t from private.mercator_lerp(c.lng, c.lat, p_lng, p_lat, case when v_d > 0 then v_allow / v_d else 0 end);
  if private.haversine_m(e.gps_lng, e.gps_lat, t.lng, t.lat) > v_speed * v_tank + coalesce(e.gps_accuracy_m, 50)
     and private.haversine_m(e.gps_lng, e.gps_lat, t.lng, t.lat) > private.haversine_m(e.gps_lng, e.gps_lat, c.lng, c.lat) then
    return private.explorer_json(v_uid) || jsonb_build_object('moved_m', 0, 'clamped', true, 'leash', true, 'empty', v_secs <= 0.01);
  end if;
  update public.explorers
     set mode = 'manual', lng = t.lng, lat = t.lat, fixed_at = now(), accuracy_m = null,
         dest_lng = null, dest_lat = null, speed_mps = null,
         joy_seconds = greatest(v_secs - v_allow / v_speed, 0)::real,
         joy_day = case when v_refill then v_day else e.joy_day end,
         joy_bucket_m = greatest(v_bucket - v_allow, 0)::real, joy_at = now(), updated_at = now()
   where player_id = v_uid;
  return private.explorer_json(v_uid)
      || jsonb_build_object('moved_m', round(v_allow::numeric, 2), 'clamped', v_allow < v_d - 0.5,
                            'empty', v_secs - v_allow / v_speed <= 0.01);
end $$;

-- ===== 2. Art is never searchable by place =======================================
create or replace function public.gallery_list(p_section text, p_limit int default 24, p_offset int default 0, p_bbox jsonb default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_limit int := least(greatest(coalesce(p_limit, 24), 1), 60); v_off int := greatest(coalesce(p_offset, 0), 0); v_res jsonb;
begin
  if p_section in ('featured', 'staff_picks') then
    select coalesce(jsonb_agg(s.card || jsonb_build_object('note', s.note, 'criteria', s.criteria) order by s.sort, s.created_at desc), '[]'::jsonb) into v_res
    from (
      select private.artwork_card(a, v_uid) as card, f.note, f.criteria, f.sort, f.created_at
      from public.featured_artwork f join public.artwork_publications a on a.id = f.publication_id
      where f.section = case when p_section = 'featured' then 'featured' else 'staff_pick' end
        and a.status = 'published' and f.starts_at <= now() and (f.ends_at is null or f.ends_at > now())
        and private.visible_to(a.owner_id, v_uid)
      order by f.sort, f.created_at desc limit v_limit offset v_off) s;
  elsif p_section = 'mine' then
    select coalesce(jsonb_agg(s.card order by s.created_at desc), '[]'::jsonb) into v_res from (
      select private.artwork_card(a, v_uid) as card, a.created_at from public.artwork_publications a
      where a.owner_id = v_uid and a.status in ('published', 'superseded', 'pending_review', 'processing', 'approved', 'rejected', 'removed')
      order by a.created_at desc limit v_limit offset v_off) s;
  elsif p_section = 'liked' then
    select coalesce(jsonb_agg(s.card order by s.created_at desc), '[]'::jsonb) into v_res from (
      select private.artwork_card(a, v_uid) as card, r.created_at from public.gallery_reactions r
      join public.artwork_publications a on a.id = r.publication_id
      where r.player_id = v_uid and a.status = 'published'
      order by r.created_at desc limit v_limit offset v_off) s;
  else
    select coalesce(jsonb_agg(s.card order by s.ord), '[]'::jsonb) into v_res from (
      select private.artwork_card(a, v_uid) as card,
             row_number() over (order by
               case when p_section = 'appreciated' then a.appreciation_count end desc nulls last,
               case when p_section = 'largest' then a.plot_count end desc nulls last,
               a.published_at desc) as ord
      from public.artwork_publications a
      where a.status = 'published' and private.visible_to(a.owner_id, v_uid)
        and p_section <> 'regional'  -- art is never searchable by place (p_bbox is ignored)
      order by ord limit v_limit offset v_off) s;
  end if;
  return v_res;
end $$;

-- ===== 3. Ink per cleared round; all rounds to level up ==========================
create or replace function public.svc_finish_minigame(p_session_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
  v_game jsonb; v_plot_record jsonb; v_cleared int := 0; v_total int := 1;
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
    v_limit := coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6);
    v_mult := (1 + coalesce((v_game ->> 'plot_level_bonus')::numeric, (v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    v_ink_mult := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0)
                         * greatest(coalesce((v_cfg -> 'games' -> v_s.game ->> 'ink_multiplier')::numeric, 1), 0);
    if v_cleared > 0 and v_today < v_limit then
      v_ink := floor((coalesce((v_game ->> 'base_ink')::numeric, (v_rw ->> 'base_ink')::numeric)
                      + coalesce((v_game ->> 'ink_per_level')::numeric, (v_rw ->> 'ink_per_level')::numeric) * v_s.level
                      + v_score / greatest((v_rw ->> 'score_ink_divisor')::numeric, 1)) * v_cleared / v_total * v_ink_mult);
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
                                  'rounds_cleared', v_cleared, 'rounds', v_total,
                                  'rewarded_left', greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0),
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'plot_record', v_plot_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $$;

-- ===== 4. Every plot's minigame level starts at 1 ================================
-- (levels were reached under the old 3-of-5 rule and seeded from each player's best;
--  world_plots.level — the production upgrade — is untouched)
update public.plot_game_progress set highest_level = 0, updated_at = now();
update public.minigame_records set highest_level = 0;
