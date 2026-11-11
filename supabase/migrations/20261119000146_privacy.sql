-- Privacy you control. Everything stays public by default (as it was); each player can hide, from the live feed:
-- everything, or just their claims & Crowns, badges, game wins, art, Luck, travel, or places (farms, estates…);
-- and from their public profile: their badges, their minigame records & wins, and their stats (plots, art, level).
-- A player always sees all of their own activity.

alter table public.profiles add column if not exists privacy jsonb not null default '{}'::jsonb;

/** the privacy switches and their defaults (true = shown) */
create or replace function private.privacy_keys() returns text[] language sql immutable as $$
  select array['feed', 'feed_claims', 'feed_badges', 'feed_games', 'feed_art', 'feed_luck', 'feed_travel', 'feed_places',
               'profile_badges', 'profile_games', 'profile_stats']
$$;
create or replace function private.privacy_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_object_agg(k, coalesce((p.privacy ->> k)::boolean, true)) from public.profiles p, unnest(private.privacy_keys()) k where p.id = p_uid
$$;
create or replace function private.shows(p_uid uuid, p_key text) returns boolean language sql stable as $$
  select coalesce((select (privacy ->> p_key)::boolean from public.profiles where id = p_uid), true)
$$;
/** which privacy switch a feed event falls under */
create or replace function private.feed_group(p_kind text) returns text language sql immutable as $$
  select case
    when p_kind in ('claim', 'crown', 'planet_plot', 'core') then 'feed_claims'
    when p_kind = 'achievement' then 'feed_badges'
    when p_kind in ('minigame', 'pvp', 'arcade', 'sketch', 'challenge', 'level') then 'feed_games'
    when p_kind in ('publish', 'featured', 'duet', 'stamp') then 'feed_art'
    when p_kind = 'luck' then 'feed_luck'
    when p_kind in ('flight', 'exploring', 'settle') then 'feed_travel'
    when p_kind in ('harvest', 'ipo', 'estate', 'dig', 'base', 'playdate') then 'feed_places'
    else null end
$$;
/** is a feed event shown to others, by its player's privacy? */
create or replace function private.feed_shown(p_privacy jsonb, p_kind text) returns boolean language sql immutable as $$
  select coalesce((p_privacy ->> 'feed')::boolean, true)
     and (private.feed_group(p_kind) is null or coalesce((p_privacy ->> private.feed_group(p_kind))::boolean, true))
$$;

/** set some of your privacy switches */
create or replace function public.set_privacy(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_clean jsonb;
begin
  select coalesce(jsonb_object_agg(k, (p_patch ->> k)::boolean), '{}'::jsonb) into v_clean
  from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k
  where k = any (private.privacy_keys()) and jsonb_typeof(p_patch -> k) = 'boolean';
  update public.profiles set privacy = privacy || v_clean where id = v_uid;
  return private.privacy_json(v_uid);
end $$;
create or replace function public.my_privacy() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return private.privacy_json(v_uid);
end $$;

-- the live feed respects it (you always see your own)
create or replace function public.feed_recent(p_after_id bigint default null, p_before_id bigint default null, p_limit int default 40) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'created_at', e.created_at,
                                        'data', case when e.kind = 'exploring' then e.data || private.room_json(e.player_id, e.data ->> 'world') else e.data end,
                                        'player', private.profile_json(e.player_id)) order by e.id desc)
    from (select f.* from public.feed_events f join public.profiles pr on pr.id = f.player_id
          where (p_after_id is null or f.id > p_after_id) and (p_before_id is null or f.id < p_before_id)
            and private.visible_to(f.player_id, v_uid)
            and (f.player_id = v_uid or private.feed_shown(pr.privacy, f.kind))
            and (f.kind <> 'publish' or exists (select 1 from public.artwork_publications a
                                                where a.id = (f.data ->> 'publication_id')::uuid and a.status = 'published'))
          order by f.id desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) e), '[]'::jsonb);
end $$;

-- the public profile respects it
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
    'stats', case when not v_me and not private.shows(v_p.id, 'profile_stats') then jsonb_build_object('member_since', v_p.created_at) else jsonb_build_object(
      'plots', (select count(*) from public.world_plots where owner_id = v_p.id),
      'artworks', (select count(*) from public.artwork_publications where owner_id = v_p.id and status in ('published', 'superseded')),
      'canvas_area', (select coalesce(sum(plot_count), 0) from public.artwork_publications where owner_id = v_p.id and status = 'published'),
      'appreciations', (select coalesce(sum(appreciation_count), 0) from public.artwork_publications where owner_id = v_p.id),
      'artist_level', private.artist_level(coalesce(v_bp, 0)),
      'member_since', v_p.created_at) end,
    'largest_mural', (select private.artwork_card(a, v_uid) from public.artwork_publications a
                      where a.owner_id = v_p.id and a.status = 'published' order by a.plot_count desc, a.published_at desc limit 1),
    'featured', (select private.artwork_card(a, v_uid) from public.artwork_publications a
                 where a.id = v_p.featured_publication_id and a.status = 'published'),
    'favorites', (select coalesce(jsonb_agg(private.artwork_card(a, v_uid)), '[]'::jsonb) from public.artwork_publications a
                  where a.id = any(v_p.favorite_publication_ids) and a.status = 'published'),
    'gallery', (select coalesce(jsonb_agg(s.card order by s.published_at desc), '[]'::jsonb) from (
                  select private.artwork_card(a, v_uid) as card, a.published_at from public.artwork_publications a
                  where a.owner_id = v_p.id and a.status = 'published' order by a.published_at desc limit 60) s),
    'privacy', case when v_me then private.privacy_json(v_p.id) end,
    'hidden', jsonb_build_object('badges', not v_me and not private.shows(v_p.id, 'profile_badges'), 'games', not v_me and not private.shows(v_p.id, 'profile_games'),
                                 'stats', not v_me and not private.shows(v_p.id, 'profile_stats')),
    'achievements', case when not v_me and not private.shows(v_p.id, 'profile_badges') then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('key', a.key, 'name', a.name, 'icon', a.icon,
                                                                 'unlocked_at', pa.unlocked_at) order by pa.unlocked_at desc), '[]'::jsonb)
                     from public.player_achievements pa join public.achievements a on a.key = pa.achievement_key
                     where pa.player_id = v_p.id) end,
    'minigames', case when not v_me and not private.shows(v_p.id, 'profile_games') then '{}'::jsonb else (select coalesce(jsonb_object_agg(game, jsonb_build_object('highest_level', highest_level, 'best_score', best_score,
                                                                           'plays', plays, 'wins', wins)), '{}'::jsonb)
                  from public.minigame_records where player_id = v_p.id) end);
end $$;

revoke all on function public.set_privacy(jsonb) from public, anon;
grant execute on function public.set_privacy(jsonb) to authenticated;
revoke all on function public.my_privacy() from public, anon;
grant execute on function public.my_privacy() to authenticated;
do $$
declare f text;
begin
  foreach f in array array['private.privacy_keys()', 'private.privacy_json(uuid)', 'private.shows(uuid, text)', 'private.feed_group(text)', 'private.feed_shown(jsonb, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
