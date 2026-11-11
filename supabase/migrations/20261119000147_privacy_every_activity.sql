-- Privacy for every single activity. On top of "hide everything" and the category switches, each kind of thing that
-- can show on the live feed now has its own switch: e.g. sacrificing Ink, an Inkborn, an egg or a plot for Luck are
-- four separate switches, and so are each of the arcade moments. Joining LANDVAS and inviting friends get their own
-- category ("Account") too. Everything stays public by default; you always see all of your own activity.

/** every feed activity, by category: the switch is 'fa_' || id */
create or replace function private.feed_activities() returns table (grp text, id text) language sql immutable as $$
  values
    ('feed_account', 'join'), ('feed_account', 'referral'),
    ('feed_claims', 'claim'), ('feed_claims', 'shiny'), ('feed_claims', 'crown'), ('feed_claims', 'planet_plot'), ('feed_claims', 'core'),
    ('feed_badges', 'achievement'),
    ('feed_games', 'minigame'), ('feed_games', 'pvp'), ('feed_games', 'challenge'), ('feed_games', 'sketch'), ('feed_games', 'level'),
    ('feed_games', 'arcade_playing'), ('feed_games', 'arcade_record'), ('feed_games', 'arcade_prize'), ('feed_games', 'arcade_cosmetic'),
    ('feed_games', 'arcade_level'), ('feed_games', 'arcade_install'),
    ('feed_art', 'publish'), ('feed_art', 'featured'), ('feed_art', 'duet'), ('feed_art', 'stamp'),
    ('feed_luck', 'luck_ink'), ('feed_luck', 'luck_inkborn'), ('feed_luck', 'luck_egg'), ('feed_luck', 'luck_plot'), ('feed_luck', 'luck_pick'),
    ('feed_travel', 'flight'), ('feed_travel', 'exploring'), ('feed_travel', 'settle'),
    ('feed_places', 'harvest'), ('feed_places', 'estate'), ('feed_places', 'ipo'), ('feed_places', 'base'), ('feed_places', 'dig'), ('feed_places', 'playdate')
$$;

/** which single activity a feed event is */
create or replace function private.feed_activity(p_kind text, p_data jsonb) returns text language sql immutable as $$
  select case p_kind
    when 'luck' then case when p_data ->> 'sub' = 'pick' then 'luck_pick' else 'luck_' || coalesce(p_data ->> 'what', 'plot') end
    when 'arcade' then 'arcade_' || coalesce(p_data ->> 'sub', 'playing')
    when 'claim' then case when coalesce((p_data ->> 'shiny')::boolean, false) then 'shiny' else 'claim' end
    else p_kind end
$$;

/** the privacy switches (true = shown) */
create or replace function private.privacy_keys() returns text[] language sql immutable as $$
  select array['feed', 'feed_account', 'feed_claims', 'feed_badges', 'feed_games', 'feed_art', 'feed_luck', 'feed_travel', 'feed_places',
               'profile_badges', 'profile_games', 'profile_stats']
         || (select array_agg('fa_' || a.id) from private.feed_activities() a)
$$;

/** which category switch a feed event falls under */
create or replace function private.feed_group(p_kind text) returns text language sql immutable as $$
  select case
    when p_kind in ('join', 'referral') then 'feed_account'
    when p_kind in ('claim', 'crown', 'planet_plot', 'core') then 'feed_claims'
    when p_kind = 'achievement' then 'feed_badges'
    when p_kind in ('minigame', 'pvp', 'arcade', 'sketch', 'challenge', 'level') then 'feed_games'
    when p_kind in ('publish', 'featured', 'duet', 'stamp') then 'feed_art'
    when p_kind = 'luck' then 'feed_luck'
    when p_kind in ('flight', 'exploring', 'settle') then 'feed_travel'
    when p_kind in ('harvest', 'ipo', 'estate', 'dig', 'base', 'playdate') then 'feed_places'
    else null end
$$;

/** is a feed event shown to others? all three levels must be on: the whole feed, its category, the activity itself */
create or replace function private.feed_shown(p_privacy jsonb, p_kind text, p_data jsonb) returns boolean language sql immutable as $$
  select coalesce((p_privacy ->> 'feed')::boolean, true)
     and (private.feed_group(p_kind) is null or coalesce((p_privacy ->> private.feed_group(p_kind))::boolean, true))
     and coalesce((p_privacy ->> ('fa_' || private.feed_activity(p_kind, coalesce(p_data, '{}'::jsonb))))::boolean, true)
$$;

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
            and (f.player_id = v_uid or private.feed_shown(pr.privacy, f.kind, f.data))
            and (f.kind <> 'publish' or exists (select 1 from public.artwork_publications a
                                                where a.id = (f.data ->> 'publication_id')::uuid and a.status = 'published'))
          order by f.id desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) e), '[]'::jsonb);
end $$;

drop function if exists private.feed_shown(jsonb, text);

do $$
declare f text;
begin
  foreach f in array array['private.feed_activities()', 'private.feed_activity(text, jsonb)', 'private.privacy_keys()', 'private.feed_group(text)',
                           'private.feed_shown(jsonb, text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
