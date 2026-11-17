-- The chats get faces and names worth reading:
--  * every chat line's player carries `name_rarity`: the rarity their name is coloured in — the one they chose to show
--    off (it must be one they own), else their rarest plot. A Phantom keeps its secret (it shows as the Common it
--    pretends to be) and a Doppelgänger shows its disguise, here as on the map.
--  * the global chat takes replies: a message can answer another one (`reply_to`); the line carries a little quote of
--    what it answers, and the player answered gets an alert.
--  * tapping a name opens a peek at that player: player_peek(id), a light card (their face, name colour, rarest plot,
--    a few stats, their clan, friend state) that honours their privacy switches.
--  * the rareness order covers every rarity now (the ultras of the expansion, the fusions and the Primordials were
--    missing, so a Primordial counted for less than a Common on profiles).

-- ---- the rareness order (Common … the Primordials) ---------------------------------------------------------------------
create or replace function private.rarity_rareness(p_id text) returns integer language sql immutable as $$
  select coalesce(array_position(array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'enchanted',
    'solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken',
    'volcano', 'world_tree', 'lodestone', 'glacier', 'mycelium', 'hive', 'phantom', 'wanderer',
    'ancient', 'mirror', 'leyline',
    'eclipse', 'eternal_flame', 'constellation', 'kaleidoscope', 'krakatoa', 'elder_tree', 'shooting_star', 'doppelganger', 'compass_rose',
    'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity',
    'heart_world', 'throne_ink', 'serpent_egg', 'world_eye', 'void_gate', 'first_light', 'fallen_star', 'genesis_well', 'chrysalis',
    'hourglass', 'sunspot', 'eleven', 'loom', 'upside_down', 'midas', 'chain', 'transmuter', 'doubling_cube', 'rift'], p_id), 0)
$$;

-- ---- what the world sees of a player's land ----------------------------------------------------------------------------
/** the rarities a player's land shows the world (a Phantom shows as a Common, a Doppelgänger as its disguise) */
create or replace function private.shown_rarities(p_uid uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(distinct r), '{}'::text[]) from (
    select k.id r from public.plot_rarities k
    where k.id not in ('phantom', 'doppelganger')
      and exists (select 1 from public.world_plots w where w.rarity = k.id and w.owner_id = p_uid)
    union all
    select 'common' where exists (select 1 from public.world_plots w where w.rarity = 'phantom' and w.owner_id = p_uid)
    union all
    select coalesce(x.state ->> 'disguise', 'common') from public.world_plots w
      left join public.rarity_powers x on x.gx = w.gx and x.gy = w.gy
    where w.rarity = 'doppelganger' and w.owner_id = p_uid) s
$$;

/** how many plots of each shown rarity a player has (and how many of them shine) */
create or replace function private.shown_rarity_counts(p_uid uuid) returns table (rarity text, n bigint, shiny bigint) language sql stable as $$
  select r, count(*), count(*) filter (where s) from (
    select case w.rarity when 'phantom' then 'common'
                         when 'doppelganger' then coalesce((select x.state ->> 'disguise' from public.rarity_powers x where x.gx = w.gx and x.gy = w.gy), 'common')
                         else w.rarity end r, coalesce(w.shiny, false) s
    from public.world_plots w where w.owner_id = p_uid) z
  group by r
$$;

-- ---- name colours ------------------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists name_rarity text;

/** the rarity a player's name is coloured in: the one they chose (while they still show one), else their rarest */
create or replace function private.name_rarity(p_uid uuid) returns text language sql stable as $$
  select case when s.pick is not null and s.pick = any(s.shown) then s.pick
              else (select r from unnest(s.shown) r order by private.rarity_rareness(r) desc, r limit 1) end
  from (select (select name_rarity from public.profiles where id = p_uid) pick, private.shown_rarities(p_uid) shown) s
$$;

/** a player as a chat line shows them: their profile and the rarity their name wears */
create or replace function private.chat_profile_json(p_id uuid) returns jsonb language sql stable as $$
  select private.profile_json(p_id) || jsonb_build_object('name_rarity', private.name_rarity(p_id))
$$;

/** your name colour: what you picked (null: your rarest), what it shows now, and every rarity you could pick */
create or replace function public.name_color_info() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'pick', (select name_rarity from public.profiles where id = v_uid),
    'shown', private.name_rarity(v_uid),
    'auto', (select r from unnest(private.shown_rarities(v_uid)) r order by private.rarity_rareness(r) desc, r limit 1),
    'options', (select coalesce(jsonb_agg(jsonb_build_object('rarity', c.rarity, 'count', c.n, 'shiny', c.shiny) order by private.rarity_rareness(c.rarity) desc, c.rarity), '[]'::jsonb)
                from private.shown_rarity_counts(v_uid) c),
    'secret', exists (select 1 from public.world_plots where owner_id = v_uid and rarity in ('phantom', 'doppelganger')));
end $$;

/** show off one of your rarities in your name's colour (null: your rarest, whatever it is) */
create or replace function public.set_name_color(p_rarity text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('name_color', 60, 3600);
  if p_rarity is not null and not (p_rarity = any(private.shown_rarities(v_uid))) then
    raise exception 'name_color_not_owned' using errcode = 'P0001';
  end if;
  update public.profiles set name_rarity = p_rarity, updated_at = now() where id = v_uid;
  return public.name_color_info();
end $$;

-- every room's chat lines carry the name colour
create or replace function private.party_chat_json(m public.party_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'kind', m.kind, 'player', private.chat_profile_json(m.player_id))
$$;
create or replace function private.planet_chat_json(m public.planet_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'player', private.chat_profile_json(m.player_id))
$$;
create or replace function private.home_chat_json(m public.home_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'player', private.chat_profile_json(m.player_id))
$$;
create or replace function private.clan_chat_json(m public.clan_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'player', private.chat_profile_json(m.player_id))
$$;
create or replace function private.arcade_chat_json(m public.arcade_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'kind', 'chat', 'player', private.chat_profile_json(m.player_id))
$$;
create or replace function private.arena_chat_json(m public.arena_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'kind', 'chat', 'player', private.chat_profile_json(m.player_id))
$$;

-- ---- replies in the global chat ----------------------------------------------------------------------------------------
alter table public.chat_messages add column if not exists reply_to bigint references public.chat_messages (id) on delete set null;
create index if not exists chat_messages_reply_to_idx on public.chat_messages (reply_to) where reply_to is not null;

/** the little quote a reply carries: who it answers and what they said (gone once removed; hidden if you blocked them) */
create or replace function private.chat_reply_json(p_id bigint) returns jsonb language sql stable as $$
  select case when r.id is null or r.deleted_at is not null then jsonb_build_object('id', p_id, 'gone', true)
              when not private.visible_to(r.player_id, private.uid()) then jsonb_build_object('id', p_id, 'hidden', true)
              else jsonb_build_object('id', r.id, 'body', left(r.body, 140),
                     'player', jsonb_build_object('id', pr.id, 'username', pr.username, 'display_name', pr.display_name,
                                                  'accent_color', pr.accent_color, 'name_rarity', private.name_rarity(pr.id))) end
  from (select p_id) x
  left join public.chat_messages r on r.id = x.p_id
  left join public.profiles pr on pr.id = r.player_id
$$;

create or replace function private.chat_json(m public.chat_messages) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'created_at', m.created_at, 'player', private.chat_profile_json(m.player_id))
         || case when m.kind <> 'chat' then jsonb_build_object('kind', m.kind, 'data', m.data) else '{}'::jsonb end
         || case when m.reply_to is not null then jsonb_build_object('reply', private.chat_reply_json(m.reply_to)) else '{}'::jsonb end
$$;

-- someone answered you in the global chat: an alert (one per person every couple of minutes, however chatty)
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan', 'power',
  'party_invite', 'party_join', 'chat_reply'));

drop function if exists public.send_chat_message(text);
create or replace function public.send_chat_message(p_body text, p_reply_to bigint default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_muted timestamptz; v_body text; m public.chat_messages%rowtype; t public.chat_messages%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  if p_reply_to is not null then
    select * into t from public.chat_messages where id = p_reply_to;
    if t.id is null or t.room <> 'global' or t.kind <> 'chat' or t.deleted_at is not null or not private.visible_to(t.player_id, v_uid) then
      raise exception 'reply_not_found' using errcode = 'P0001';
    end if;
  end if;
  perform private.rate_limit('chat_burst', 1, 2);
  perform private.rate_limit('chat', 20, 60);
  perform private.rate_limit('chat_hour', 300, 3600);
  v_body := private.chat_clean(p_body);
  insert into public.chat_messages (player_id, body, reply_to) values (v_uid, v_body, t.id) returning * into m;
  -- the one answered hears about it (not for answering yourself, nor if they blocked you, nor twice in two minutes)
  if t.id is not null and t.player_id <> v_uid and private.visible_to(v_uid, t.player_id)
     and not exists (select 1 from public.player_notifications n where n.player_id = t.player_id and n.kind = 'chat_reply'
                       and n.actor_id = v_uid and n.created_at > now() - interval '2 minutes') then
    perform private.notify(t.player_id, 'chat_reply', v_uid, jsonb_build_object('id', m.id, 'body', left(m.body, 140), 'to', left(t.body, 80)));
  end if;
  return private.chat_json(m);
end $$;

-- ---- a peek at a player (tap their name) -------------------------------------------------------------------------------
create or replace function public.player_peek(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_p public.profiles%rowtype; v_me boolean; v_rar text; v_bp bigint; v_stats boolean; v_badges boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_p from public.profiles where id = p_player;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_me := v_p.id = v_uid;
  -- (hidden from you if you blocked them, or they blocked you)
  if not v_me and not private.has_role(v_uid, array['moderator', 'support']) and (not private.visible_to(v_p.id, v_uid)
       or exists (select 1 from public.player_blocks where blocker_id = v_p.id and blocked_id = v_uid)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_rar := private.name_rarity(v_p.id);
  v_stats := v_me or private.shows(v_p.id, 'profile_stats');
  v_badges := v_me or private.shows(v_p.id, 'profile_badges');
  select amount into v_bp from public.resource_balances where player_id = v_p.id and resource = 'brush_points';
  return jsonb_build_object(
    'profile', private.chat_profile_json(v_p.id),
    'is_me', v_me,
    'friend', case when v_me then null else private.friend_state(v_uid, v_p.id) end,
    'blocked', not v_me and exists (select 1 from public.player_blocks where blocker_id = v_uid and blocked_id = v_p.id),
    'online', not v_me and private.is_online(v_p.id) and (private.shows(v_p.id, 'online') or private.friend_state(v_uid, v_p.id) = 'friends'),
    'member_since', v_p.created_at,
    'rarest', case when v_rar is null then null else (
      select jsonb_build_object('rarity', v_rar, 'picked', v_p.name_rarity is not null and v_p.name_rarity = v_rar, 'count', c.n, 'shiny', c.shiny)
      from private.shown_rarity_counts(v_p.id) c where c.rarity = v_rar) end,
    'stats', case when not v_stats then null else jsonb_build_object(
      'plots', (select count(*) from public.world_plots where owner_id = v_p.id),
      'ultras', (select coalesce(sum(c.n), 0) from private.shown_rarity_counts(v_p.id) c join public.plot_rarities k on k.id = c.rarity where k.tier is not null),
      'artworks', (select count(*) from public.artwork_publications where owner_id = v_p.id and status in ('published', 'superseded')),
      'artist_level', private.artist_level(coalesce(v_bp, 0))) end,
    'badge', case when not v_badges then null else (
      select jsonb_build_object('key', a.key, 'name', a.name, 'icon', a.icon, 'category', a.category, 'threshold', a.threshold)
      from public.player_achievements pa join public.achievements a on a.key = pa.achievement_key
      where pa.player_id = v_p.id
      order by (a.key = v_p.showcase_badge) desc, a.threshold desc nulls last, pa.unlocked_at desc limit 1) end,
    'badges', case when not v_badges then null else (select count(*) from public.player_achievements where player_id = v_p.id) end,
    'crowns', case when v_me or private.shows(v_p.id, 'royalty') then
      (select count(*) from public.world_plots where owner_id = v_p.id and rarity in ('crown', 'crown_state', 'crown_country')) else 0 end,
    'clan', (select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'emblem', c.emblem, 'color', c.color)
             from public.clan_members cm join public.clans c on c.id = cm.clan_id where cm.player_id = v_p.id limit 1));
end $$;

-- ---- profiles: a Phantom keeps its secret there too ---------------------------------------------------------------------
create or replace function private.profile_showcase(p_uid uuid, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'badge', (select showcase_badge from public.profiles where id = p_uid),
    'rarest', (select jsonb_build_object('rarity', rarity, 'count', n, 'shiny', sh, 'since', since) from (
                 select r rarity, count(*) n, count(*) filter (where shiny) sh, min(claimed_at) since from (
                   select case when p_uid is distinct from p_viewer and w.rarity in ('phantom', 'doppelganger') then
                               case when w.rarity = 'phantom' then 'common'
                                    else coalesce((select x.state ->> 'disguise' from public.rarity_powers x where x.gx = w.gx and x.gy = w.gy), 'common') end
                               else w.rarity end r, w.shiny, w.claimed_at
                   from public.world_plots w where w.owner_id = p_uid) z
                 group by r order by private.rarity_rareness(r) desc limit 1) r),
    'crowns', case when p_uid = p_viewer or private.shows(p_uid, 'royalty') then (
                 select coalesce(jsonb_agg(jsonb_build_object('tier', p.rarity, 'shiny', p.shiny, 'since', p.claimed_at, 'country', k.country,
                   'kingdom', case p.rarity when 'crown' then k.name when 'crown_state' then coalesce(k.state, coalesce(k.country_name, k.country)) else coalesce(k.country_name, k.country) end)
                   order by private.rarity_rareness(p.rarity) desc, p.claimed_at), '[]'::jsonb)
                 from public.world_plots p join public.world_cities k on k.id = p.city_id
                 where p.owner_id = p_uid and p.rarity in ('crown', 'crown_state', 'crown_country')) else '[]'::jsonb end,
    'ultra_sets', (select coalesce(jsonb_agg(r order by private.rarity_rareness(r)), '[]'::jsonb) from unnest(array['solar', 'lunar', 'comet', 'chaos', 'phoenix',
                     'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity',
                     'volcano', 'world_tree', 'phantom', 'wanderer', 'lodestone', 'leyline', 'glacier', 'mycelium', 'hive', 'heart_world']) r
                   where exists (select 1 from public.player_unlocks u where u.player_id = p_uid and u.unlock_key = 'explorer.hat.' || private.ultra_set_id(r))))
$$;

do $$ begin
  revoke all on function public.send_chat_message(text, bigint) from public, anon;
  grant execute on function public.send_chat_message(text, bigint) to authenticated, service_role;
  revoke all on function public.player_peek(uuid) from public, anon;
  grant execute on function public.player_peek(uuid) to authenticated, service_role;
  revoke all on function public.name_color_info() from public, anon;
  grant execute on function public.name_color_info() to authenticated, service_role;
  revoke all on function public.set_name_color(text) from public, anon;
  grant execute on function public.set_name_color(text) to authenticated, service_role;
  revoke all on function private.shown_rarities(uuid) from public, anon, authenticated;
  revoke all on function private.shown_rarity_counts(uuid) from public, anon, authenticated;
  revoke all on function private.name_rarity(uuid) from public, anon, authenticated;
  revoke all on function private.chat_profile_json(uuid) from public, anon, authenticated;
  revoke all on function private.chat_reply_json(bigint) from public, anon, authenticated;
end $$;
