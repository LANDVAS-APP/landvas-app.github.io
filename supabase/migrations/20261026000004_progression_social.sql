-- LANDVAS progression & social: achievements, minigames, gallery, profiles,
-- leaderboards, events, and player-side moderation (reports, blocks, appeals).

-- ===== Achievements =========================================================

create or replace function private.achievement_metrics(p_uid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'plots', (select count(*) from public.world_plots where owner_id = p_uid),
    'regions', (select count(distinct ((gx >> 13) * 8 + (gy >> 13))) from public.world_plots where owner_id = p_uid),
    'saved_tiles', (select coalesce(max(tile_count), 0) from public.artwork_versions where owner_id = p_uid and kind = 'save'),
    'publications', (select count(*) from public.artwork_publications where owner_id = p_uid and status in ('published', 'superseded')),
    'largest_publication', (select coalesce(max(plot_count), 0) from public.artwork_publications where owner_id = p_uid and status in ('published', 'superseded')),
    'max_colors', (select coalesce(max(color_count), 0) from public.artwork_publications where owner_id = p_uid and status in ('published', 'superseded')),
    'largest_group', (select coalesce(max(plot_count), 0) from public.canvas_groups where owner_id = p_uid and status = 'active'),
    'tracecraft', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'tracecraft'),
    'colorburst', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'colorburst'),
    'patternshift', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'patternshift'),
    'lightlines', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'lightlines'),
    'minigame_wins', (select coalesce(sum(wins), 0) from public.minigame_records where player_id = p_uid),
    'appreciations_received', (select coalesce(sum(appreciation_count), 0) from public.artwork_publications where owner_id = p_uid),
    'appreciations_given', (select count(*) from public.gallery_reactions where player_id = p_uid),
    'upgrades', (select coalesce(sum(level - 1), 0) from public.world_plots where owner_id = p_uid),
    'rare_plots', (select count(*) from public.world_plots where owner_id = p_uid and rarity in ('epic', 'legendary', 'mythic')),
    'legendary_plots', (select count(*) from public.world_plots where owner_id = p_uid and rarity in ('legendary', 'mythic')),
    'mythic_plots', (select count(*) from public.world_plots where owner_id = p_uid and rarity = 'mythic'),
    'boosts', (select count(*) from public.boost_activations where player_id = p_uid))
$$;

create or replace function private.evaluate_achievements(p_uid uuid) returns jsonb
language plpgsql as $$
declare v_m jsonb; v_new jsonb := '[]'::jsonb; a record;
begin
  if p_uid is null then return v_new; end if;
  v_m := private.achievement_metrics(p_uid);
  for a in
    select * from public.achievements x
    where x.is_active and not exists (select 1 from public.player_achievements pa where pa.player_id = p_uid and pa.achievement_key = x.key)
    order by x.sort
  loop
    if coalesce((v_m ->> a.metric)::int, 0) >= a.threshold then
      insert into public.player_achievements (player_id, achievement_key) values (p_uid, a.key) on conflict do nothing;
      if found then
        perform private.grant(p_uid, a.reward, 'achievement', 'achievement', a.key, 'achievement:' || a.key);
        v_new := v_new || jsonb_build_array(jsonb_build_object('key', a.key, 'name', a.name, 'description', a.description,
                                                               'icon', a.icon, 'reward', a.reward));
      end if;
    end if;
  end loop;
  return v_new;
end $$;

create or replace function public.achievements_catalog() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_m jsonb;
begin
  if v_uid is not null then v_m := private.achievement_metrics(v_uid); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', a.key, 'name', a.name, 'description', a.description, 'icon', a.icon, 'category', a.category,
      'threshold', a.threshold, 'reward', a.reward,
      'progress', least(coalesce((v_m ->> a.metric)::int, 0), a.threshold),
      'unlocked_at', pa.unlocked_at,
      'unlocked_by', (select count(*) from public.player_achievements x where x.achievement_key = a.key)) order by a.sort)
    from public.achievements a
    left join public.player_achievements pa on pa.achievement_key = a.key and pa.player_id = v_uid
    where a.is_active), '[]'::jsonb);
end $$;

-- ===== Minigames ============================================================

create or replace function public.start_minigame(p_game text, p_level int, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_cfg jsonb := private.cfg('minigames');
  v_type text; v_highest int; v_id uuid; v_seed bigint; v_expires timestamptz; v_level int;
begin
  perform private.rate_limit('minigame_start', 180, 3600);
  if not coalesce((v_cfg -> 'games' -> p_game ->> 'enabled')::boolean, false) then
    raise exception 'minigame_unavailable' using errcode = 'P0001';
  end if;
  select wp.plot_type, wp.level into v_type, v_level from public.world_plots wp
  where wp.gx = p_gx and wp.gy = p_gy and wp.owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if (select minigame from public.plot_types where id = v_type) <> p_game then
    raise exception 'wrong_plot_type' using errcode = 'P0001';
  end if;
  select coalesce(max(highest_level), 0) into v_highest from public.minigame_records where player_id = v_uid and game = p_game;
  if p_level < 1 or p_level > least(v_highest + 1, coalesce((v_cfg ->> 'max_level')::int, 60)) then
    raise exception 'level_locked' using errcode = 'P0001';
  end if;
  update public.minigame_sessions set status = 'abandoned', finished_at = now()
  where player_id = v_uid and game = p_game and status = 'active';
  v_seed := floor(random() * 2147483646)::bigint + 1;
  v_expires := now() + make_interval(mins => coalesce((v_cfg ->> 'session_minutes')::int, 20));
  insert into public.minigame_sessions (player_id, game, level, seed, gx, gy, expires_at)
  values (v_uid, p_game, p_level, v_seed, p_gx, p_gy, v_expires)
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'game', p_game, 'level', p_level, 'seed', v_seed,
                            'plot_level', v_level, 'started_at', now(), 'expires_at', v_expires, 'server_time', now());
end $$;

create or replace function public.my_minigame_records() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'records', coalesce((select jsonb_object_agg(game, jsonb_build_object('highest_level', highest_level, 'best_score', best_score,
                                                                         'plays', plays, 'wins', wins, 'total_score', total_score,
                                                                         'last_played_at', last_played_at))
                         from public.minigame_records where player_id = auth.uid()), '{}'::jsonb),
    'level_bests', coalesce((select jsonb_object_agg(k, v) from (
        select game || ':' || level as k, max(score) as v from public.minigame_sessions
        where player_id = auth.uid() and status = 'validated' and passed group by game, level) s), '{}'::jsonb),
    'rewarded_today', coalesce((select jsonb_object_agg(game, n) from (
        select ms.game, count(*) as n from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
        where mr.player_id = auth.uid() and mr.ink > 0 and mr.created_at >= private.day_start(now()) group by ms.game) s), '{}'::jsonb),
    'daily_rewarded_wins_per_game', coalesce((private.cfg('minigames') ->> 'daily_rewarded_wins_per_game')::int, 6),
    'resets_at', private.day_start(now()) + interval '1 day')
$$;

create or replace function public.svc_get_session(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'player_id', s.player_id, 'game', s.game, 'level', s.level, 'seed', s.seed,
                            'status', s.status, 'started_at', s.started_at, 'expires_at', s.expires_at, 'server_time', now(),
                            'elapsed_ms', floor(extract(epoch from (now() - s.started_at)) * 1000))
  from public.minigame_sessions s where s.id = p_session_id
$$;

-- Called only after the shared validator replayed the move log server-side.
-- p_result: {valid, passed, score, stars, summary, flags[], suspicious, min_duration_ms}
create or replace function public.svc_finish_minigame(p_session_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
begin
  select * into v_s from public.minigame_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if v_s.status <> 'active' then raise exception 'session_closed' using errcode = 'P0001', detail = v_s.status; end if;
  if now() > v_s.expires_at + interval '1 minute' then
    update public.minigame_sessions set status = 'expired', finished_at = now() where id = p_session_id;
    return jsonb_build_object('status', 'expired', 'passed', false, 'score', 0);
  end if;
  v_rw := v_cfg -> 'rewards';
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

  if v_valid then
    -- Ink (the land currency) is earned ONLY here: wins pay base + level + score,
    -- scaled by the plot's level and rarity, for the first N wins per game per day.
    select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1) into v_plot_level, v_rarity_mult
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity
    where wp.gx = v_s.gx and wp.gy = v_s.gy and wp.owner_id = v_s.player_id;
    select count(*) into v_today from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
    where mr.player_id = v_s.player_id and ms.game = v_s.game and mr.ink > 0 and mr.created_at >= private.day_start(now());
    v_limit := coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6);
    v_mult := (1 + coalesce((v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    if v_passed and v_today < v_limit then
      v_ink := floor(((v_rw ->> 'base_ink')::numeric + (v_rw ->> 'ink_per_level')::numeric * v_s.level
                      + v_score / greatest((v_rw ->> 'score_ink_divisor')::numeric, 1)) * v_mult);
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
    values (p_session_id, v_s.player_id, v_ink, v_pig, v_bp, round(v_mult, 3), v_held);
    if v_held then
      insert into public.moderation_cases (kind, priority, session_id, subject_player_id, reason, details)
      values ('score_review', 2, p_session_id, v_s.player_id, 'suspicious_minigame_result',
              jsonb_build_object('flags', v_flags, 'score', v_score, 'game', v_s.game, 'level', v_s.level));
    else
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
    end if;
  end if;

  return jsonb_build_object(
    'status', case when v_valid then 'validated' else 'rejected' end,
    'valid', v_valid, 'passed', v_passed, 'score', v_score, 'stars', v_stars, 'flags', to_jsonb(v_flags),
    'new_best', v_score > coalesce(v_best_before, 0),
    'rewards', jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp, 'held', v_held,
                                  'multiplier', round(coalesce(v_mult, 0), 3), 'practice', v_practice,
                                  'rewarded_left', greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0),
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $$;

-- ===== Gallery ==============================================================

create or replace function private.artwork_card(p_pub public.artwork_publications, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p_pub.id, 'title', p_pub.title, 'plot_count', p_pub.plot_count, 'published_at', p_pub.published_at,
    'thumb_path', p_pub.thumb_path, 'preview_path', p_pub.preview_path,
    'preview_width', p_pub.preview_width, 'preview_height', p_pub.preview_height,
    'appreciation_count', p_pub.appreciation_count, 'center_lng', p_pub.center_lng, 'center_lat', p_pub.center_lat,
    'min_gx', p_pub.min_gx, 'min_gy', p_pub.min_gy, 'max_gx', p_pub.max_gx, 'max_gy', p_pub.max_gy,
    'status', p_pub.status,
    'artist', private.profile_json(p_pub.owner_id),
    'appreciated', p_viewer is not null and exists (
      select 1 from public.gallery_reactions r where r.publication_id = p_pub.id and r.player_id = p_viewer))
$$;

create or replace function private.visible_to(p_owner uuid, p_viewer uuid) returns boolean
language sql stable as $$
  select not exists (select 1 from public.profiles p where p.id = p_owner and p.is_hidden)
     and not exists (select 1 from public.players pl where pl.id = p_owner and pl.status = 'banned')
     and (p_viewer is null or not exists (
       select 1 from public.player_blocks b where b.blocker_id = p_viewer and b.blocked_id = p_owner))
$$;

-- p_section: featured | staff_picks | new | appreciated | largest | regional | mine | liked
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
        and (p_section <> 'regional' or (p_bbox is not null
             and a.max_gx >= (p_bbox ->> 'min_gx')::int and a.min_gx <= (p_bbox ->> 'max_gx')::int
             and a.max_gy >= (p_bbox ->> 'min_gy')::int and a.min_gy <= (p_bbox ->> 'max_gy')::int))
      order by ord limit v_limit offset v_off) s;
  end if;
  return v_res;
end $$;

create or replace function public.trending_artists(p_days int default 7, p_limit int default 12) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('artist', private.profile_json(t.owner_id), 'appreciations', t.n,
                                               'top_artwork', (select private.artwork_card(a, auth.uid()) from public.artwork_publications a
                                                               where a.owner_id = t.owner_id and a.status = 'published'
                                                               order by a.appreciation_count desc, a.published_at desc limit 1))
                    order by t.n desc), '[]'::jsonb)
  from (
    select a.owner_id, count(*) as n from public.gallery_reactions r
    join public.artwork_publications a on a.id = r.publication_id
    where r.created_at > now() - make_interval(days => least(greatest(p_days, 1), 90)) and a.status = 'published'
      and private.visible_to(a.owner_id, auth.uid())
    group by a.owner_id order by n desc limit least(greatest(p_limit, 1), 50)) t
$$;

create or replace function public.artwork_detail(p_publication_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_pub public.artwork_publications%rowtype; v_owner boolean; v_mod boolean;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_owner := v_uid is not null and v_pub.owner_id = v_uid;
  v_mod := private.has_role(v_uid, array['moderator']);
  if not (v_owner or v_mod) and (v_pub.status not in ('published', 'superseded') or not private.visible_to(v_pub.owner_id, v_uid)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.artwork_card(v_pub, v_uid) || jsonb_build_object(
    'description', v_pub.description, 'cells', v_pub.cells, 'is_owner', v_owner, 'color_count', v_pub.color_count,
    'decision_reason', case when v_owner or v_mod then v_pub.decision_reason end,
    'live_plots', (select count(*) from public.world_plots where art_publication_id = v_pub.id),
    'featured', (select coalesce(jsonb_agg(section), '[]'::jsonb) from public.featured_artwork
                 where publication_id = v_pub.id and starts_at <= now() and (ends_at is null or ends_at > now())),
    'more_by_artist', (select coalesce(jsonb_agg(c.card), '[]'::jsonb) from (
        select private.artwork_card(a, v_uid) as card from public.artwork_publications a
        where a.owner_id = v_pub.owner_id and a.status = 'published' and a.id <> v_pub.id
        order by a.published_at desc limit 6) c));
end $$;

create or replace function public.appreciate(p_publication_id uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_pub public.artwork_publications%rowtype; v_count int;
begin
  perform private.rate_limit('appreciate', 120, 3600);
  perform private.rate_limit('appreciate_daily', 600, 86400);
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found or v_pub.status <> 'published' or not private.visible_to(v_pub.owner_id, v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_pub.owner_id = v_uid then raise exception 'cannot_appreciate_own' using errcode = 'P0001'; end if;
  if (select count(*) from public.world_plots where owner_id = v_uid) < coalesce((private.cfg('limits') ->> 'min_plots_to_react')::int, 1) then
    raise exception 'claim_a_plot_first' using errcode = 'P0001';
  end if;
  if p_on then
    insert into public.gallery_reactions (publication_id, player_id) values (p_publication_id, v_uid) on conflict do nothing;
    if found then update public.artwork_publications set appreciation_count = appreciation_count + 1 where id = p_publication_id; end if;
  else
    delete from public.gallery_reactions where publication_id = p_publication_id and player_id = v_uid;
    if found then update public.artwork_publications set appreciation_count = greatest(appreciation_count - 1, 0) where id = p_publication_id; end if;
  end if;
  select appreciation_count into v_count from public.artwork_publications where id = p_publication_id;
  perform private.evaluate_achievements(v_pub.owner_id);
  return jsonb_build_object('appreciated', p_on, 'appreciation_count', v_count,
                            'achievements', private.evaluate_achievements(v_uid));
end $$;

-- ===== Profiles & leaderboards ==============================================

create or replace function public.profile_by_username(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_p public.profiles%rowtype; v_me boolean; v_bp bigint;
begin
  select * into v_p from public.profiles where lower(username) = lower(p_username);
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_me := v_uid is not null and v_p.id = v_uid;
  if not v_me and not private.has_role(v_uid, array['moderator', 'support']) and not private.visible_to(v_p.id, v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select amount into v_bp from public.resource_balances where player_id = v_p.id and resource = 'brush_points';
  return jsonb_build_object(
    'profile', private.profile_json(v_p.id),
    'is_me', v_me,
    'blocked', v_uid is not null and exists (select 1 from public.player_blocks where blocker_id = v_uid and blocked_id = v_p.id),
    'stats', jsonb_build_object(
      'plots', (select count(*) from public.world_plots where owner_id = v_p.id),
      'artworks', (select count(*) from public.artwork_publications where owner_id = v_p.id and status in ('published', 'superseded')),
      'canvas_area', (select coalesce(sum(plot_count), 0) from public.artwork_publications where owner_id = v_p.id and status = 'published'),
      'appreciations', (select coalesce(sum(appreciation_count), 0) from public.artwork_publications where owner_id = v_p.id),
      'artist_level', private.artist_level(coalesce(v_bp, 0)),
      'member_since', v_p.created_at),
    'largest_mural', (select private.artwork_card(a, v_uid) from public.artwork_publications a
                      where a.owner_id = v_p.id and a.status = 'published' order by a.plot_count desc, a.published_at desc limit 1),
    'featured', (select private.artwork_card(a, v_uid) from public.artwork_publications a
                 where a.id = v_p.featured_publication_id and a.status = 'published'),
    'favorites', (select coalesce(jsonb_agg(private.artwork_card(a, v_uid)), '[]'::jsonb) from public.artwork_publications a
                  where a.id = any(v_p.favorite_publication_ids) and a.status = 'published'),
    'gallery', (select coalesce(jsonb_agg(s.card order by s.published_at desc), '[]'::jsonb) from (
                  select private.artwork_card(a, v_uid) as card, a.published_at from public.artwork_publications a
                  where a.owner_id = v_p.id and a.status = 'published' order by a.published_at desc limit 60) s),
    'achievements', (select coalesce(jsonb_agg(jsonb_build_object('key', a.key, 'name', a.name, 'icon', a.icon,
                                                                 'unlocked_at', pa.unlocked_at) order by pa.unlocked_at desc), '[]'::jsonb)
                     from public.player_achievements pa join public.achievements a on a.key = pa.achievement_key
                     where pa.player_id = v_p.id),
    'minigames', (select coalesce(jsonb_object_agg(game, jsonb_build_object('highest_level', highest_level, 'best_score', best_score,
                                                                           'plays', plays, 'wins', wins)), '{}'::jsonb)
                  from public.minigame_records where player_id = v_p.id));
end $$;

-- p_kind: plots | murals | appreciated | level | minigame (with p_game)
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
    if p_game not in ('tracecraft', 'colorburst', 'patternshift', 'lightlines') then
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

-- ===== Events ===============================================================

create or replace function public.events_list() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'key', e.key, 'name', e.name, 'kind', e.kind, 'description', e.description, 'status', e.status,
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'region', e.region, 'config', e.config - 'internal',
    'participants', (select count(*) from public.event_progress p where p.event_id = e.id),
    'my_progress', (select jsonb_build_object('progress', p.progress, 'score', p.score, 'rewarded', p.rewarded)
                    from public.event_progress p where p.event_id = e.id and p.player_id = auth.uid()),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(t.player_id), 'score', t.score) order by t.score desc), '[]'::jsonb)
            from (select player_id, score from public.event_progress where event_id = e.id order by score desc limit 10) t))
    order by case e.status when 'active' then 0 when 'scheduled' then 1 else 2 end, e.starts_at), '[]'::jsonb)
  from public.event_definitions e
  where e.status in ('scheduled', 'active') or (e.status = 'ended' and e.ends_at > now() - interval '30 days')
$$;

create or replace function public.join_event(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if not exists (select 1 from public.event_definitions where id = p_event_id and status in ('scheduled', 'active')) then
    raise exception 'event_unavailable' using errcode = 'P0001';
  end if;
  insert into public.event_progress (event_id, player_id) values (p_event_id, v_uid) on conflict do nothing;
  return public.events_list();
end $$;

-- ===== Player-side moderation ===============================================

create or replace function public.report_artwork(p_publication_id uuid, p_reason text, p_details text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_owner uuid;
begin
  perform private.rate_limit('report', 20, 3600);
  if p_reason not in ('sexual', 'violence', 'hate', 'harassment', 'self_harm', 'spam', 'personal_info', 'copyright', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  select owner_id into v_owner from public.artwork_publications where id = p_publication_id and status in ('published', 'superseded');
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  begin
    insert into public.moderation_cases (kind, priority, publication_id, subject_player_id, reporter_id, reason, details)
    values ('report', case when p_reason in ('sexual', 'self_harm', 'personal_info') then 1 else 2 end,
            p_publication_id, v_owner, v_uid, p_reason, jsonb_build_object('details', left(coalesce(p_details, ''), 1000)));
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end;
  update public.artwork_publications set report_count = report_count + 1 where id = p_publication_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.block_player(p_player_id uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('block', 60, 3600);
  if p_player_id = v_uid then raise exception 'cannot_block_self' using errcode = 'P0001'; end if;
  if p_on then
    insert into public.player_blocks (blocker_id, blocked_id) values (v_uid, p_player_id) on conflict do nothing;
  else
    delete from public.player_blocks where blocker_id = v_uid and blocked_id = p_player_id;
  end if;
  return jsonb_build_object('blocked', p_on);
end $$;

create or replace function public.my_blocks() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(private.profile_json(blocked_id) order by created_at desc), '[]'::jsonb)
  from public.player_blocks where blocker_id = auth.uid()
$$;

create or replace function public.submit_appeal(p_publication_id uuid, p_message text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  perform private.rate_limit('appeal', 5, 86400);
  if not exists (select 1 from public.artwork_publications where id = p_publication_id and owner_id = v_uid and status in ('rejected', 'removed')) then
    raise exception 'not_appealable' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.moderation_cases where publication_id = p_publication_id and kind = 'appeal' and status = 'open') then
    raise exception 'appeal_pending' using errcode = 'P0001';
  end if;
  if p_message is null or char_length(trim(p_message)) not between 10 and 2000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  insert into public.moderation_cases (kind, priority, publication_id, subject_player_id, reporter_id, reason, details)
  values ('appeal', 2, p_publication_id, v_uid, v_uid, 'artist_appeal', jsonb_build_object('message', trim(p_message)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.submit_copyright_claim(
  p_publication_id uuid, p_claimant_name text, p_claimant_email text, p_work_description text,
  p_good_faith boolean, p_accuracy boolean, p_signature text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_owner uuid;
begin
  perform private.rate_limit('copyright_claim', 10, 86400);
  select owner_id into v_owner from public.artwork_publications where id = p_publication_id and status in ('published', 'superseded');
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not coalesce(p_good_faith, false) or not coalesce(p_accuracy, false) then
    raise exception 'statements_required' using errcode = 'P0001';
  end if;
  if coalesce(char_length(trim(p_claimant_name)), 0) < 2 or coalesce(p_claimant_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(char_length(trim(p_work_description)), 0) < 10 or coalesce(char_length(trim(p_signature)), 0) < 2 then
    raise exception 'incomplete_claim' using errcode = 'P0001';
  end if;
  insert into public.moderation_cases (kind, priority, publication_id, subject_player_id, reporter_id, reason, details)
  values ('copyright', 1, p_publication_id, v_owner, v_uid, 'copyright_claim',
          jsonb_build_object('claimant_name', trim(p_claimant_name), 'claimant_email', trim(p_claimant_email),
                             'work_description', trim(p_work_description), 'signature', trim(p_signature),
                             'good_faith', true, 'accuracy', true, 'submitted_at', now()));
  return jsonb_build_object('ok', true);
end $$;
