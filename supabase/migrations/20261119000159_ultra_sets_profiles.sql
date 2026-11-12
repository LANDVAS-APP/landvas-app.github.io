-- Ultra sets and showcase profiles.
--   * Get an ultra-rarity plot (roll it, or take a Crown) and its whole set unlocks for good: an explorer hat, outfit,
--     held relic, aura and trail, and a head piece, eyewear, neck piece and glow for your Inkborn. They can't be bought.
--   * Profiles show off your rarest rarity, a badge of your choice (or your best one), your Crowns and your ultra sets.

-- ---- which set goes with which ultra ---------------------------------------------------------------------------
create or replace function private.ultra_set_id(p_rarity text) returns text language sql immutable as $$
  select case p_rarity when 'crown' then 'xcity' when 'crown_state' then 'xstate' when 'crown_country' then 'xcountry'
    else case when p_rarity in ('solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'genesis', 'singularity')
      then 'x' || p_rarity end end
$$;

create or replace function private.ultra_set_keys(p_rarity text) returns text[] language sql immutable as $$
  select case when private.ultra_set_id(p_rarity) is null then '{}'::text[] else array[
    'explorer.hat.', 'explorer.outfit.', 'explorer.hold.', 'explorer.aura.', 'explorer.trail.',
    'inkborn.whead.', 'inkborn.wface.', 'inkborn.wneck.', 'inkborn.waura.'] end
$$;

/** Unlock an ultra's set for a player (once). Returns how many pieces were new. */
create or replace function private.grant_ultra_set(p_uid uuid, p_rarity text) returns int language plpgsql as $$
declare v_id text := private.ultra_set_id(p_rarity); n int;
begin
  if v_id is null or p_uid is null then return 0; end if;
  insert into public.player_unlocks (player_id, unlock_key)
  select p_uid, k || v_id from unnest(private.ultra_set_keys(p_rarity)) k
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform private.notify(p_uid, 'ultra_set', null, jsonb_build_object('rarity', p_rarity, 'set', v_id)); end if;
  return n;
end $$;

create or replace function private.ultra_set_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.owner_id is not null and private.ultra_set_id(new.rarity) is not null
     and (tg_op = 'INSERT' or old.owner_id is distinct from new.owner_id or old.rarity is distinct from new.rarity) then
    perform private.grant_ultra_set(new.owner_id, new.rarity);
  end if;
  return null;
end $$;
drop trigger if exists world_plots_ultra_set on public.world_plots;
create trigger world_plots_ultra_set after insert or update of owner_id, rarity on public.world_plots
  for each row execute function private.ultra_set_trg();

-- alerts can say "your Kraken set is unlocked"
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set'));

-- ---- the explorer pieces are shop items (so the explorer screen shows them), never for sale -----------------
update public.game_config set value = jsonb_set(value, '{items}', (
  select coalesce(jsonb_agg(i), '[]'::jsonb) from jsonb_array_elements(value -> 'items') i where not (i ? 'ultra')
) || (
  select jsonb_agg(jsonb_build_object('key', 'explorer.' || part || '.' || private.ultra_set_id(r), 'name', nm, 'kind', 'explorer', 'part', part,
           'id', private.ultra_set_id(r), 'group', 'Explorer', 'description', 'Unlocked by getting a ' || rname || ' plot.',
           'cost', jsonb_build_object('ultra', 1), 'ultra', r) order by o, po)
  from (values
    (1, 'solar', 'Solar', 'Sun Crown', 'Solar Flare Suit', 'Sunstaff'),
    (2, 'lunar', 'Lunar', 'Moon Tiara', 'Night Sky Cloak', 'Moon Wand'),
    (3, 'comet', 'Comet', 'Comet Helm', 'Stardust Racer', 'Comet Lance'),
    (4, 'chaos', 'Chaos', 'Chaos Jester', 'Glitch Jacket', 'Loaded Dice'),
    (5, 'phoenix', 'Phoenix', 'Phoenix Crest', 'Ember Wings', 'Phoenix Torch'),
    (6, 'gemini', 'Gemini', 'Twin Stars', 'Twin Suit', 'Twin Wands'),
    (7, 'kraken', 'Kraken', 'Kraken Hat', 'Kraken Tentacle Tee', 'Kraken Trident'),
    (8, 'ancient', 'Ancient', 'Golden Laurels', 'Ancient Toga', 'Ancient Scroll'),
    (9, 'mirror', 'Mirror', 'Mirror Visor', 'Chrome Suit', 'Hand Mirror'),
    (10, 'prismatic', 'Prismatic', 'Prism Crystal', 'Prism Facets', 'Prism Shard'),
    (11, 'crown', 'City Crown', 'City Crown', 'Royal Robe', 'Royal Scepter'),
    (12, 'crown_state', 'State Crown', 'State Diadem', 'Violet Regalia', 'State Orb'),
    (13, 'crown_country', 'Country Crown', 'Imperial Crown', 'Imperial Regalia', 'Imperial Sword'),
    (14, 'genesis', 'Genesis', 'Genesis Halo', 'Nebula Suit', 'Starseed'),
    (15, 'singularity', 'Singularity', 'Event Horizon', 'Void Suit', 'Black Hole Orb')
  ) s(o, r, rname, hat, outfit, hold),
  lateral (values (1, 'hat', hat), (2, 'outfit', outfit), (3, 'hold', hold), (4, 'aura', rname || ' Aura'), (5, 'trail', rname || ' Trail')) p(po, part, nm)
)) where key = 'shop';

-- ultra pieces come only from the plot, not the shop
do $$
declare d text;
begin
  d := pg_get_functiondef('public.purchase_unlock(text, text)'::regprocedure);
  if position('arcade_only' in d) = 0 then raise exception 'purchase_unlock anchor missing'; end if;
  d := replace(d, $a$if coalesce((v_item ->> 'arcade')::boolean, false) then raise exception 'arcade_only' using errcode = 'P0001'; end if;$a$,
    $a$if coalesce((v_item ->> 'arcade')::boolean, false) then raise exception 'arcade_only' using errcode = 'P0001'; end if;
  if v_item ? 'ultra' then raise exception 'ultra_only' using errcode = 'P0001'; end if;$a$);
  if position('ultra_only' in d) = 0 then raise exception 'purchase_unlock patch failed'; end if;
  execute d;
end $$;

-- everyone who already holds an ultra gets its set
select private.grant_ultra_set(owner_id, rarity) from (select distinct owner_id, rarity from public.world_plots
  where owner_id is not null and private.ultra_set_id(rarity) is not null) x;

-- ---- profiles: a chosen badge, the rarest rarity, Crowns and ultra sets ------------------------------------------
alter table public.profiles add column if not exists showcase_badge text;

create or replace function public.set_showcase_badge(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('showcase', 60, 3600);
  if p_key is not null and not exists (select 1 from public.player_achievements where player_id = v_uid and achievement_key = p_key) then
    raise exception 'not_owned' using errcode = 'P0001';
  end if;
  update public.profiles set showcase_badge = p_key, updated_at = now() where id = v_uid;
  return jsonb_build_object('showcase_badge', p_key);
end $$;
revoke all on function public.set_showcase_badge(text) from public, anon;
grant execute on function public.set_showcase_badge(text) to authenticated;

create or replace function private.rarity_rareness(p_id text) returns int language sql immutable as $$
  select coalesce(array_position(array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'solar', 'lunar', 'comet', 'chaos', 'phoenix',
    'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity'], p_id), 0)
$$;

create or replace function private.profile_showcase(p_uid uuid, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'badge', (select showcase_badge from public.profiles where id = p_uid),
    'rarest', (select jsonb_build_object('rarity', rarity, 'count', n, 'shiny', sh, 'since', since) from (
                 select rarity, count(*) n, count(*) filter (where shiny) sh, min(claimed_at) since from public.world_plots
                 where owner_id = p_uid group by rarity order by private.rarity_rareness(rarity) desc limit 1) r),
    'crowns', case when p_uid = p_viewer or private.shows(p_uid, 'royalty') then (
                 select coalesce(jsonb_agg(jsonb_build_object('tier', p.rarity, 'shiny', p.shiny, 'since', p.claimed_at, 'country', k.country,
                   'kingdom', case p.rarity when 'crown' then k.name when 'crown_state' then coalesce(k.state, coalesce(k.country_name, k.country)) else coalesce(k.country_name, k.country) end)
                   order by private.rarity_rareness(p.rarity) desc, p.claimed_at), '[]'::jsonb)
                 from public.world_plots p join public.world_cities k on k.id = p.city_id
                 where p.owner_id = p_uid and p.rarity in ('crown', 'crown_state', 'crown_country')) else '[]'::jsonb end,
    'ultra_sets', (select coalesce(jsonb_agg(r order by private.rarity_rareness(r)), '[]'::jsonb) from unnest(array['solar', 'lunar', 'comet', 'chaos', 'phoenix',
                     'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity']) r
                   where exists (select 1 from public.player_unlocks u where u.player_id = p_uid and u.unlock_key = 'explorer.hat.' || private.ultra_set_id(r))))
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.profile_by_username(text)'::regprocedure);
  if position($a$'minigames', case$a$ in d) = 0 then raise exception 'profile_by_username anchor missing'; end if;
  d := replace(d, $a$'minigames', case$a$, $a$'showcase', private.profile_showcase(v_p.id, v_uid),
    'minigames', case$a$);
  -- badges carry what the medal needs (category, goal) and what they're for
  d := replace(d, $a$jsonb_build_object('key', a.key, 'name', a.name, 'icon', a.icon,$a$,
                  $a$jsonb_build_object('key', a.key, 'name', a.name, 'icon', a.icon, 'category', a.category, 'threshold', a.threshold, 'description', a.description,$a$);
  if position('profile_showcase' in d) = 0 or position($a$'category', a.category$a$ in d) = 0 then raise exception 'profile_by_username patch failed'; end if;
  execute d;
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.ultra_set_id(text)', 'private.ultra_set_keys(text)', 'private.grant_ultra_set(uuid, text)', 'private.ultra_set_trg()',
    'private.rarity_rareness(text)', 'private.profile_showcase(uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
