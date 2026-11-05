-- Arcade activity on the live feed, and everyone's places (arcades, habitats, farms, businesses) on their profile.
--
-- Feed: the arcade's own functions are left alone; triggers on its tables post the moments worth sharing, each
-- with a cooldown so a busy player doesn't flood the feed:
--   playing   someone started playing at an arcade (with a Join button)            once per 20 min per player
--   record    a new high score on a machine at that arcade (or across all arcades)   once per 10 min per machine
--   prize     a big prize (tier 3+) won at the prize counter                         once per 10 min per prize
--   cosmetic  arcade-only explorer gear or Inkborn wear unlocked                     every time (each is a one-off)
--   level     an arcade levelled up (from level 3)                                   every level
--   install   a new machine installed                                                every machine

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo', 'arcade'));
create index if not exists feed_events_player_kind_idx on public.feed_events (player_id, kind, id desc);

/** Where it happened: the arcade's id, its name (or "@owner's Arcade") and its owner. */
create or replace function private.arc_place(p_arcade uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('arcade_id', a.id, 'owner', pr.username, 'owner_id', a.owner_id,
    'arcade', case when g.name is null or btrim(g.name) = '' or g.name ~* '^untitled' then pr.username || '’s Arcade' else g.name end)
  from public.arcades a join public.profiles pr on pr.id = a.owner_id left join public.canvas_groups g on g.id = a.group_id
  where a.id = p_arcade
$$;

create or replace function private.arc_feed(p_uid uuid, p_sub text, p_data jsonb, p_cooldown interval, p_key text default null)
returns void language plpgsql as $$
begin
  if p_cooldown > interval '0' and exists (
    select 1 from public.feed_events where player_id = p_uid and kind = 'arcade' and data ->> 'sub' = p_sub
      and (p_key is null or data ->> 'key' = p_key) and created_at > now() - p_cooldown) then
    return;
  end if;
  insert into public.feed_events (kind, player_id, data)
  values ('arcade', p_uid, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('sub', p_sub, 'key', p_key));
end $$;

create or replace function private.arc_game_json(p_game text) returns jsonb language sql stable as $$
  select jsonb_build_object('game', p_game, 'game_name', coalesce(private.cfg('arcade') -> 'games' -> p_game ->> 'name', p_game),
                            'emoji', coalesce(private.cfg('arcade') -> 'games' -> p_game ->> 'emoji', '🕹️'))
$$;

-- someone starts playing / sets a record
create or replace function private.arc_plays_feed() returns trigger language plpgsql as $$
declare v_prev int; v_world int; v_place jsonb;
begin
  if new.arcade_id is null then return new; end if;
  v_place := private.arc_place(new.arcade_id);
  if tg_op = 'INSERT' then
    perform private.arc_feed(new.player_id, 'playing', v_place || private.arc_game_json(new.game) || jsonb_build_object('mode', new.mode), interval '20 minutes');
  elsif old.finished_at is null and new.finished_at is not null and coalesce(new.score, 0) > 0 then
    select max(score) into v_prev from public.arcade_plays
     where arcade_id = new.arcade_id and game = new.game and mode = new.mode and finished_at is not null and id <> new.id;
    if v_prev is not null and new.score > v_prev then
      select max(score) into v_world from public.arcade_plays
       where game = new.game and mode = new.mode and finished_at is not null and id <> new.id;
      perform private.arc_feed(new.player_id, 'record',
        v_place || private.arc_game_json(new.game) || jsonb_build_object('score', new.score, 'mode', new.mode, 'beat', v_prev, 'world', new.score > coalesce(v_world, 0)),
        interval '10 minutes', new.arcade_id::text || ':' || new.game || ':' || new.mode);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists arc_plays_feed on public.arcade_plays;
create trigger arc_plays_feed after insert or update of finished_at on public.arcade_plays
  for each row execute function private.arc_plays_feed();

-- an arcade levels up or gets a new machine
create or replace function private.arc_arcade_feed() returns trigger language plpgsql as $$
declare v_l0 int; v_l1 int; k text;
begin
  if new.xp is distinct from old.xp then
    v_l0 := (private.arc_level(old.xp) ->> 'level')::int; v_l1 := (private.arc_level(new.xp) ->> 'level')::int;
    if v_l1 > v_l0 and v_l1 >= 3 then
      perform private.arc_feed(new.owner_id, 'level', private.arc_place(new.id) || jsonb_build_object('level', v_l1), interval '0');
    end if;
  end if;
  if new.machines is distinct from old.machines then
    for k in select jsonb_object_keys(new.machines) except select jsonb_object_keys(old.machines) loop
      perform private.arc_feed(new.owner_id, 'install', private.arc_place(new.id) || private.arc_game_json(k), interval '0');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists arc_arcade_feed on public.arcades;
create trigger arc_arcade_feed after update of xp, machines on public.arcades
  for each row execute function private.arc_arcade_feed();

-- a big prize from the counter
create or replace function private.arc_prize_feed() returns trigger language plpgsql as $$
declare k text; p jsonb;
begin
  if new.prizes is not distinct from old.prizes then return new; end if;
  for k in select key from jsonb_each_text(new.prizes) where value::int > coalesce((old.prizes ->> key)::int, 0) loop
    select x into p from jsonb_array_elements(private.cfg('arcade') -> 'prizes') x where x ->> 'id' = k;
    if p is not null and coalesce((p ->> 'tier')::int, 0) >= 3 then
      perform private.arc_feed(new.player_id, 'prize', jsonb_build_object('prize', p ->> 'name', 'emoji', p ->> 'emoji', 'tickets', (p ->> 'tickets')::int), interval '10 minutes', k);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists arc_prize_feed on public.arcade_players;
create trigger arc_prize_feed after update of prizes on public.arcade_players
  for each row execute function private.arc_prize_feed();

-- arcade-only gear unlocked
create or replace function private.arc_cosmetic_feed() returns trigger language plpgsql as $$
declare c jsonb;
begin
  select x into c from jsonb_array_elements(coalesce(private.cfg('arcade') -> 'cosmetics', '[]'::jsonb)) x where x ->> 'key' = new.unlock_key;
  if c is not null then
    perform private.arc_feed(new.player_id, 'cosmetic', jsonb_build_object('name', c ->> 'name', 'emoji', c ->> 'emoji', 'for', c ->> 'kind', 'tickets', (c ->> 'tickets')::int), interval '0');
  end if;
  return new;
end $$;
drop trigger if exists arc_cosmetic_feed on public.player_unlocks;
create trigger arc_cosmetic_feed after insert on public.player_unlocks
  for each row execute function private.arc_cosmetic_feed();

-- ===== everyone's places, for their profile ===================================================================
/** The best rarity among a group's plots (for the card's colour). */
create or replace function private.group_rarity(p_group uuid) returns text language sql stable as $$
  select wp.rarity from public.canvas_group_members m join public.world_plots wp on wp.gx = m.gx and wp.gy = m.gy
   where m.group_id = p_group
   order by array_position(array['common', 'rare', 'epic', 'legendary', 'mythic'], wp.rarity::text) desc nulls last limit 1
$$;

/** A place's own name, or "@owner's Farm" while it's still called "Untitled …". */
create or replace function private.place_name(p_name text, p_owner text, p_what text) returns text language sql immutable as $$
  select case when p_name is null or btrim(p_name) = '' or p_name ~* '^untitled' then p_owner || '’s ' || p_what else p_name end
$$;

create or replace function public.player_places(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_cfg jsonb := private.cfg('arcade'); v_un text;
begin
  select id, username into v_id, v_un from public.profiles where lower(username) = lower(p_username);
  if v_id is null or not private.visible_to(v_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'arcades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', private.arc_place(a.id) ->> 'arcade', 'plots', coalesce(g.plot_count, 1),
        'level', (private.arc_level(a.xp) ->> 'level')::int, 'plays', a.plays, 'neon', a.decor ->> 'neon',
        'machines', (select count(*) from jsonb_object_keys(a.machines)),
        'emojis', (select coalesce(jsonb_agg(v_cfg -> 'games' -> k ->> 'emoji' order by (v_cfg -> 'games' -> k ->> 'order')::int), '[]'::jsonb)
                   from jsonb_object_keys(a.machines) k),
        'rarity', private.group_rarity(a.group_id),
        'playing', (select count(distinct ap.player_id) from public.arcade_plays ap where ap.arcade_id = a.id and ap.started_at > now() - interval '10 minutes'))
        order by a.plays desc)
      from public.arcades a join public.canvas_groups g on g.id = a.group_id and g.kind = 'arcade' and g.status = 'active'
      where a.owner_id = v_id), '[]'::jsonb),
    'habitats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', case when h.kind = 'starter' then v_un || '’s home sanctuary' else private.place_name(g.name, v_un, 'Sanctuary') end, 'plots', coalesce(g.plot_count, 0), 'starter', h.kind = 'starter',
        'residents', (select count(*) from public.inkborn c where c.habitat_id = h.id),
        'genomes', (select coalesce(jsonb_agg(c.genome order by c.created_at), '[]'::jsonb) from (select genome, created_at from public.inkborn c2 where c2.habitat_id = h.id order by c2.created_at limit 3) c),
        'rarity', private.group_rarity(h.group_id))
        order by coalesce(g.plot_count, 0) desc)
      from public.habitats h left join public.canvas_groups g on g.id = h.group_id
      where h.owner_id = v_id and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))), '[]'::jsonb),
    'farms', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', private.place_name(g.name, v_un, 'Farm'), 'plots', g.plot_count, 'harvests', f.harvests,
                                          'rarity', private.group_rarity(f.group_id)) order by g.plot_count desc)
      from public.farms f join public.canvas_groups g on g.id = f.group_id and g.kind = 'farm' and g.status = 'active'
      where f.owner_id = v_id), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', private.place_name(g.name, v_un, 'Business'), 'plots', g.plot_count, 'tips', b.tips,
                                          'alltime', coalesce((select alltime from public.biz_state s where s.player_id = v_id), 0),
                                          'rarity', private.group_rarity(b.group_id)) order by g.plot_count desc)
      from public.businesses b join public.canvas_groups g on g.id = b.group_id and g.kind = 'business' and g.status = 'active'
      where b.owner_id = v_id), '[]'::jsonb));
end $$;
grant execute on function public.player_places(text) to anon, authenticated, service_role;
