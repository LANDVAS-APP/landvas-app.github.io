-- LANDVAS v0.5
--   * unclaimed plots are a complete mystery: type (like rarity) comes from a
--     server-side salt and is revealed only when the plot is claimed
--   * players' real-world area stays private outside the map itself: public
--     profiles, the visit room, the gallery and artwork pages no longer carry
--     coordinates (owners and moderators still see their own), and the tables
--     that tie a player to coordinates can no longer be read directly
--   * profile pictures and a customisable explorer (bought with Ink)
--   * a shop of art tools and explorer cosmetics (prices in the shop config)
--   * referral codes (one custom code per account) paying the inviter Ink
--   * friends, a global chat and a live activity feed

-- ===== 1. Secret plot types and rarities ==============================================
-- Every unclaimed plot's type and rarity come from a keyed hash (MD5 over a
-- 180-bit secret that never leaves the database), independently per plot. Knowing
-- this code, or the types and rarities of claimed plots nearby, predicts nothing.
-- (The earlier salted formula only shifted a public hash, so it could be solved.)
-- Plots that are already claimed keep the type and rarity they were given.
insert into private.secrets (key, value)
select 'cell_key_' || n, ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint
from generate_series(1, 3) n
on conflict (key) do nothing;

create or replace function private.cell_roll(p_kind text, p_gx int, p_gy int) returns bigint
language sql stable as $$
  select ('x' || substr(md5(
            coalesce((select string_agg(value::text, ':' order by key) from private.secrets where key like 'cell\_key\_%'), '')
            || '|' || p_kind || '|' || p_gx || '|' || p_gy), 1, 15))::bit(60)::bigint
$$;

create or replace function private.plot_type_for(p_gx int, p_gy int) returns text
language plpgsql stable as $$
declare v_total int; v_roll bigint; v_acc int := 0; r record;
begin
  select coalesce(sum(weight), 0) into v_total from public.plot_types where weight > 0;
  if v_total = 0 then return 'graphite'; end if;
  v_roll := private.cell_roll('type', p_gx, p_gy) % v_total;
  for r in select id, weight from public.plot_types where weight > 0 order by sort, id loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then return r.id; end if;
  end loop;
  return 'graphite';
end $$;

create or replace function private.plot_rarity_for(p_gx int, p_gy int) returns text
language plpgsql stable as $$
declare v_total int; v_roll bigint; v_acc int := 0; r record;
begin
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_roll := private.cell_roll('rarity', p_gx, p_gy) % v_total;
  for r in select id, weight from public.plot_rarities where weight > 0 order by sort, id loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then return r.id; end if;
  end loop;
  return 'common';
end $$;

-- the price of an unclaimed plot never depends on (or reveals) its type or rarity
create or replace function private.acquire_cost(p_uid uuid, p_gx int, p_gy int) returns jsonb
language plpgsql stable as $$
declare v_cfg jsonb := private.cfg('economy') -> 'acquire'; v_owned int; v_cost numeric;
begin
  select count(*) into v_owned from public.world_plots where owner_id = p_uid;
  v_cost := coalesce((v_cfg ->> 'base_ink')::numeric, 100) * power(coalesce((v_cfg ->> 'growth')::numeric, 1), greatest(v_owned - 1, 0));
  v_cost := least(round(v_cost), coalesce((v_cfg ->> 'max_ink')::numeric, 1000000));
  return jsonb_build_object('ink', v_cost::bigint, 'owned', v_owned);
end $$;

create or replace function private.take_plot(p_uid uuid, p_gx int, p_gy int, p_method text, p_cost jsonb)
returns jsonb
language plpgsql as $$
declare v_type text; v_rarity text; v_group uuid;
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  v_type := private.plot_type_for(p_gx, p_gy);
  v_rarity := private.plot_rarity_for(p_gx, p_gy);
  insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at)
  values (p_gx, p_gy, v_type, v_rarity, p_uid, now())
  on conflict (gx, gy) do nothing;
  if not found then
    update public.world_plots
       set owner_id = p_uid, claimed_at = now(), level = 1,
           art_publication_id = null, art_rev = null, updated_at = now()
     where gx = p_gx and gy = p_gy and owner_id is null and not locked
    returning plot_type, rarity into v_type, v_rarity;
    if not found then
      raise exception 'plot_unavailable' using errcode = 'P0001';
    end if;
  end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));
  v_group := private.create_group_with_cells(p_uid, jsonb_build_array(jsonb_build_array(p_gx, p_gy)),
                                             private.empty_manifest(), null, 'initial');
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  return jsonb_build_object('gx', p_gx, 'gy', p_gy, 'plot_type', v_type, 'rarity', v_rarity, 'group_id', v_group,
                            'usd_per_second', private.plot_rent_rate(v_rarity, 1),
                            'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity),
                            'type_info', (select to_jsonb(t) from public.plot_types t where t.id = v_type));
end $$;

-- Everything the plot panel needs. Unclaimed plots are a mystery: their type,
-- minigame, rarity and rent are revealed when they are claimed.
create or replace function public.plot_details(p_gx int, p_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_plot public.world_plots%rowtype;
  v_type text;
  v_rarity text;
  v_group uuid;
  v_res jsonb;
  v_is_mine boolean := false;
  v_starter boolean := false;
  v_owned boolean;
  v_ex record;
  v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 6);
  v_level int;
begin
  if p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  select * into v_plot from public.world_plots where gx = p_gx and gy = p_gy;
  v_owned := v_plot.owner_id is not null;
  v_type := case when v_owned then v_plot.plot_type end;
  v_rarity := case when v_owned then v_plot.rarity end;
  v_level := coalesce(v_plot.level, 1);
  v_is_mine := v_uid is not null and v_plot.owner_id = v_uid;
  if v_uid is not null then
    select not starter_plot_claimed into v_starter from public.players where id = v_uid;
  end if;
  select group_id into v_group from public.canvas_group_members where gx = p_gx and gy = p_gy;

  v_res := jsonb_build_object(
    'gx', p_gx, 'gy', p_gy,
    'center', jsonb_build_object('lng', private.lng_of(p_gx + 0.5), 'lat', private.lat_of(p_gy + 0.5)),
    'name', case when v_owned then v_plot.name end,
    'plot_type', v_type,
    'type_info', case when v_owned then (select to_jsonb(t) from public.plot_types t where t.id = v_type) end,
    'rarity', v_rarity,
    'rarity_info', case when v_owned then (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity) end,
    'mystery', not v_owned,
    'rarity_hidden', not v_owned,
    'rent', case when v_owned then jsonb_build_object(
      'usd_per_second', private.plot_rent_rate(v_rarity, v_level),
      'boost_multiplier', coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20)) end,
    'owned', v_owned,
    'is_mine', v_is_mine,
    'owner', case when v_owned then private.profile_json(v_plot.owner_id) end,
    'level', v_level,
    'claimed_at', v_plot.claimed_at,
    'locked', coalesce(v_plot.locked, false),
    'art', (select jsonb_build_object('publication_id', a.id, 'title', a.title, 'published_at', a.published_at,
                                      'plot_count', a.plot_count, 'artist', private.profile_json(a.owner_id),
                                      'appreciation_count', a.appreciation_count)
            from public.artwork_publications a where a.id = v_plot.art_publication_id),
    'neighbors', (
      select jsonb_agg(jsonb_build_object(
        'gx', n.gx, 'gy', n.gy, 'dir', n.dir,
        'plot_type', case when w.owner_id is not null then w.plot_type end,
        'rarity', case when w.owner_id is not null then w.rarity end,
        'owned', w.owner_id is not null,
        'is_mine', v_uid is not null and w.owner_id = v_uid,
        'owner_username', (select username from public.profiles where id = w.owner_id),
        'group_id', m.group_id,
        'same_group', v_group is not null and m.group_id = v_group) order by n.dir)
      from private.neighbors(p_gx, p_gy) n
      left join public.world_plots w on w.gx = n.gx and w.gy = n.gy
      left join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy)
  );

  -- reach from the viewer's own explorer (never reveals anyone else's position)
  if v_uid is not null then
    select * into v_ex from private.explorer_now(v_uid);
    if found then
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', true, 'distance', private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy), 'max', v_reach,
        'in_reach', not private.flag('location_gated_claims') or private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy) <= v_reach));
    else
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', false, 'distance', null, 'max', v_reach, 'in_reach', not private.flag('location_gated_claims')));
    end if;
  end if;

  if v_is_mine then
    v_res := v_res || jsonb_build_object(
      'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'plot_count', g.plot_count, 'project_id', g.project_id,
                                          'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy)
                from public.canvas_groups g where g.id = v_group),
      'connections', (
        select coalesce(jsonb_agg(distinct jsonb_build_object('group_id', g.id, 'name', g.name, 'plot_count', g.plot_count)), '[]'::jsonb)
        from public.canvas_group_members me
        join private.neighbors(me.gx, me.gy) n on true
        join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy and m.group_id <> v_group
        join public.canvas_groups g on g.id = m.group_id and g.owner_id = v_uid and g.status = 'active'
        where me.group_id = v_group));
  elsif not v_owned then
    v_res := v_res || jsonb_build_object(
      'acquire', case when v_uid is not null and exists (select 1 from public.players where id = v_uid)
                      then private.acquire_cost(v_uid, p_gx, p_gy) || jsonb_build_object('starter_available', coalesce(v_starter, false))
                      else jsonb_build_object('starter_available', true) end,
      'available', not coalesce(v_plot.locked, false));
  end if;
  return v_res;
end $$;

-- ===== 2. Location privacy outside the map ==================================================
create or replace function private.can_see_location(p_owner uuid, p_viewer uuid) returns boolean
language sql stable as $$
  select p_viewer is not null and (p_viewer = p_owner or private.has_role(p_viewer, array['moderator', 'support']))
$$;

create or replace function private.artwork_card(p_pub public.artwork_publications, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p_pub.id, 'title', p_pub.title, 'plot_count', p_pub.plot_count, 'published_at', p_pub.published_at,
    'thumb_path', p_pub.thumb_path, 'preview_path', p_pub.preview_path,
    'preview_width', p_pub.preview_width, 'preview_height', p_pub.preview_height,
    'appreciation_count', p_pub.appreciation_count, 'status', p_pub.status,
    'artist', private.profile_json(p_pub.owner_id),
    'appreciated', p_viewer is not null and exists (
      select 1 from public.gallery_reactions r where r.publication_id = p_pub.id and r.player_id = p_viewer))
  || case when private.can_see_location(p_pub.owner_id, p_viewer) then jsonb_build_object(
       'center_lng', p_pub.center_lng, 'center_lat', p_pub.center_lat,
       'min_gx', p_pub.min_gx, 'min_gy', p_pub.min_gy, 'max_gx', p_pub.max_gx, 'max_gy', p_pub.max_gy)
     else '{}'::jsonb end
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
    'description', v_pub.description,
    'cells', case when private.can_see_location(v_pub.owner_id, v_uid) then v_pub.cells end,
    'is_owner', v_owner, 'color_count', v_pub.color_count,
    'decision_reason', case when v_owner or v_mod then v_pub.decision_reason end,
    'live_plots', (select count(*) from public.world_plots where art_publication_id = v_pub.id),
    'featured', (select coalesce(jsonb_agg(section), '[]'::jsonb) from public.featured_artwork
                 where publication_id = v_pub.id and starts_at <= now() and (ends_at is null or ends_at > now())),
    'more_by_artist', (select coalesce(jsonb_agg(c.card), '[]'::jsonb) from (
        select private.artwork_card(a, v_uid) as card from public.artwork_publications a
        where a.owner_id = v_pub.owner_id and a.status = 'published' and a.id <> v_pub.id
        order by a.published_at desc limit 6) c));
end $$;

-- A player's land for their profile and visit room: every canvas with its plots
-- laid out relative to its own corner — the shapes, never where they are.
create or replace function public.player_land(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_p public.profiles%rowtype;
begin
  select * into v_p from public.profiles where lower(username) = lower(p_username);
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (v_uid is not null and v_p.id = v_uid) and not private.has_role(v_uid, array['moderator', 'support'])
     and not private.visible_to(v_p.id, v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'player', private.profile_json(v_p.id),
    'total_plots', (select count(*) from public.world_plots where owner_id = v_p.id),
    'usd_per_second', (select coalesce(sum(private.plot_rent_rate(rarity, level)), 0) from public.world_plots where owner_id = v_p.id),
    'rarity_counts', (select coalesce(jsonb_object_agg(rarity, n), '{}'::jsonb) from (
                        select rarity, count(*) as n from public.world_plots where owner_id = v_p.id group by rarity) s),
    'type_counts', (select coalesce(jsonb_object_agg(plot_type, n), '{}'::jsonb) from (
                      select plot_type, count(*) as n from public.world_plots where owner_id = v_p.id group by plot_type) s),
    -- cells: [dx, dy, rarity, type, level, has_art, name]
    'canvases', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'plot_count', g.plot_count,
          'width', g.max_gx - g.min_gx + 1, 'height', g.max_gy - g.min_gy + 1,
          'cells', (select coalesce(jsonb_agg(jsonb_build_array(
                       (((m.gx - g.min_gx) % 4194304) + 4194304) % 4194304, m.gy - g.min_gy,
                       p.rarity, p.plot_type, p.level, p.art_rev is not null, p.name) order by m.gy, m.gx), '[]'::jsonb)
                    from public.canvas_group_members m join public.world_plots p on p.gx = m.gx and p.gy = m.gy
                    where m.group_id = g.id),
          'art', (select private.artwork_card(a, v_uid) from public.artwork_publications a
                  where a.group_id = g.id and a.status = 'published' order by a.published_at desc limit 1))
          order by g.plot_count desc, g.created_at), '[]'::jsonb)
        from (select * from public.canvas_groups where owner_id = v_p.id and status = 'active'
              order by plot_count desc, created_at limit 300) g));
end $$;

-- ===== 3. Profile pictures and explorer style =========================================
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f]{16,64}\.(webp|png|jpg)$');
alter table public.profiles add column if not exists explorer_style jsonb not null default '{}'::jsonb;

create or replace function private.profile_json(p_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_seed', p.avatar_seed, 'avatar_style', p.avatar_style, 'accent_color', p.accent_color,
    'avatar_path', p.avatar_path, 'explorer_style', p.explorer_style,
    'bio', p.bio, 'created_at', p.created_at)
  from public.profiles p where p.id = p_id
$$;

create or replace function public.set_avatar_image(p_path text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('avatar', 30, 3600);
  if p_path is not null and p_path !~ ('^' || v_uid::text || '/[0-9a-f]{16,64}\.(webp|png|jpg)$') then
    raise exception 'invalid_avatar' using errcode = 'P0001';
  end if;
  update public.profiles set avatar_path = p_path, updated_at = now() where id = v_uid;
  return private.profile_json(v_uid);
end $$;

create or replace function public.admin_clear_avatar(p_player_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_old text;
begin
  select avatar_path into v_old from public.profiles where id = p_player_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.profiles set avatar_path = null, updated_at = now() where id = p_player_id;
  perform private.audit('player.clear_avatar', 'player', p_player_id::text, jsonb_build_object('old', v_old, 'reason', p_reason));
  return private.profile_json(p_player_id);
end $$;

-- ===== 4. The shop: art tools and explorer cosmetics =======================================
-- Everyone starts with the pencil, paintbrush, eraser, fill, eyedropper, lines
-- and a 12-colour starter palette. Everything else is bought with what players
-- earn. Explorer cosmetics cost Ink. Free items (cost {}) are always owned.
update public.game_config set description = 'Art tools, palettes, layer slots, frames and explorer cosmetics. Free items (empty cost) are owned by everyone.',
  value = jsonb_build_object('items', '[
  {"key": "brush.ink", "name": "Ink Pen", "kind": "brush", "group": "Brushes", "description": "Crisp lines that swell with pressure.", "cost": {"ink": 30}},
  {"key": "brush.marker", "name": "Marker", "kind": "brush", "group": "Brushes", "description": "Bold chisel strokes for lettering and flats.", "cost": {"ink": 30}},
  {"key": "brush.pixel", "name": "Pixel Brush", "kind": "brush", "group": "Brushes", "description": "Hard square pixels for retro pixel art.", "cost": {"ink": 40}},
  {"key": "brush.airbrush", "name": "Airbrush", "kind": "brush", "group": "Brushes", "description": "Soft, buildable spray for glows and gradients.", "cost": {"ink": 60}},
  {"key": "brush.spray", "name": "Spray Can", "kind": "brush", "group": "Brushes", "description": "Street-art speckle with pressure-driven density.", "cost": {"ink": 60}},
  {"key": "brush.calligraphy", "name": "Calligraphy Nib", "kind": "brush", "group": "Brushes", "description": "Angled nib for elegant thick-thin strokes.", "cost": {"ink": 60}},
  {"key": "tool.shapes", "name": "Shape Tools", "kind": "tool", "group": "Tools", "description": "Perfect rectangles and circles, outlined or filled.", "cost": {"ink": 40}},
  {"key": "tool.gradient", "name": "Gradient Tool", "kind": "tool", "group": "Tools", "description": "Smooth two-colour blends across your canvas.", "cost": {"ink": 60}},
  {"key": "tool.bigbrush", "name": "Giant Brushes", "kind": "tool", "group": "Tools", "description": "Brush sizes up to 300 px (starter brushes stop at 48 px).", "cost": {"ink": 50}},
  {"key": "tool.symmetry", "name": "Symmetry Mirror", "kind": "tool", "group": "Tools", "description": "Mirror, flip, quad and radial symmetry while you paint.", "cost": {"ink": 80}},
  {"key": "tool.mixer", "name": "Colour Mixer", "kind": "tool", "group": "Tools", "description": "Pick any colour in the spectrum and type hex codes.", "cost": {"ink": 120}},
  {"key": "palette.graphite", "name": "Graphite Greys", "kind": "palette", "group": "Colours", "description": "Eight greys from charcoal to chalk.", "cost": {"ink": 20}},
  {"key": "palette.earth", "name": "Earth & Mineral", "kind": "palette", "group": "Colours", "description": "Ochres, umbers and slate for natural scenes.", "cost": {"ink": 30}},
  {"key": "palette.pastel", "name": "Pastel Bloom", "kind": "palette", "group": "Colours", "description": "Soft chalky tones for dreamy murals.", "cost": {"ink": 30}},
  {"key": "palette.ocean", "name": "Ocean Deep", "kind": "palette", "group": "Colours", "description": "Teals, aquas and abyss blues.", "cost": {"ink": 30}},
  {"key": "palette.sunset", "name": "Sunset Blaze", "kind": "palette", "group": "Colours", "description": "Hot pinks, corals and golden hour.", "cost": {"ink": 30}},
  {"key": "palette.skin", "name": "Skin Tones", "kind": "palette", "group": "Colours", "description": "A wide range of natural skin tones.", "cost": {"ink": 30}},
  {"key": "palette.neon", "name": "Neon", "kind": "palette", "group": "Colours", "description": "Twelve electric colours inspired by Lumina plots.", "cost": {"ink": 40}},
  {"key": "palette.retro", "name": "Retro Arcade", "kind": "palette", "group": "Colours", "description": "Sixteen 8-bit console colours.", "cost": {"ink": 50}},
  {"key": "palette.metal", "name": "Metallics", "kind": "palette", "group": "Colours", "description": "Gold, silver, bronze and chrome shades.", "cost": {"ink": 50, "pigments": 5}},
  {"key": "layers.extra1", "name": "Layer Slots +2", "kind": "layer_slot", "group": "Studio", "description": "Work with up to 8 layers.", "cost": {"pigments": 25}},
  {"key": "layers.extra2", "name": "Layer Slots +2 (II)", "kind": "layer_slot", "group": "Studio", "description": "Work with up to 10 layers.", "cost": {"pigments": 60}, "requires": "layers.extra1"},
  {"key": "frame.gold", "name": "Gilded Profile Frame", "kind": "frame", "group": "Studio", "description": "A gallery-gold frame for your avatar.", "cost": {"gallery_tokens": 5}},
  {"key": "frame.prism", "name": "Prism Profile Frame", "kind": "frame", "group": "Studio", "description": "A shifting rainbow frame for your avatar.", "cost": {"gallery_tokens": 10}},
  {"key": "explorer.hat.beret", "name": "Painter''s Beret", "kind": "explorer", "part": "hat", "id": "beret", "group": "Explorer", "description": "The classic.", "cost": {}},
  {"key": "explorer.hat.none", "name": "No Hat", "kind": "explorer", "part": "hat", "id": "none", "group": "Explorer", "description": "Let the hair breathe.", "cost": {}},
  {"key": "explorer.hat.cap", "name": "Street Cap", "kind": "explorer", "part": "hat", "id": "cap", "group": "Explorer", "description": "A backwards cap for muralists.", "cost": {"ink": 40}},
  {"key": "explorer.hat.headphones", "name": "Headphones", "kind": "explorer", "part": "hat", "id": "headphones", "group": "Explorer", "description": "Paint to the beat.", "cost": {"ink": 60}},
  {"key": "explorer.hat.tophat", "name": "Top Hat", "kind": "explorer", "part": "hat", "id": "tophat", "group": "Explorer", "description": "Gallery-opening formal.", "cost": {"ink": 80}},
  {"key": "explorer.hat.wizard", "name": "Wizard Hat", "kind": "explorer", "part": "hat", "id": "wizard", "group": "Explorer", "description": "Starry and suspiciously pointy.", "cost": {"ink": 120}},
  {"key": "explorer.hat.crown", "name": "Crown", "kind": "explorer", "part": "hat", "id": "crown", "group": "Explorer", "description": "For the ruler of the block.", "cost": {"ink": 200}},
  {"key": "explorer.hat.halo", "name": "Halo", "kind": "explorer", "part": "hat", "id": "halo", "group": "Explorer", "description": "A glowing ring of pure talent.", "cost": {"ink": 250}},
  {"key": "explorer.hold.brush", "name": "Paintbrush", "kind": "explorer", "part": "hold", "id": "brush", "group": "Explorer", "description": "Never leave home without it.", "cost": {}},
  {"key": "explorer.hold.pencil", "name": "Giant Pencil", "kind": "explorer", "part": "hold", "id": "pencil", "group": "Explorer", "description": "Sketch first, ask later.", "cost": {"ink": 40}},
  {"key": "explorer.hold.roller", "name": "Paint Roller", "kind": "explorer", "part": "hold", "id": "roller", "group": "Explorer", "description": "Cover walls fast.", "cost": {"ink": 50}},
  {"key": "explorer.hold.spray", "name": "Spray Can", "kind": "explorer", "part": "hold", "id": "spray", "group": "Explorer", "description": "Shake, rattle and paint.", "cost": {"ink": 60}},
  {"key": "explorer.hold.palette", "name": "Palette", "kind": "explorer", "part": "hold", "id": "palette", "group": "Explorer", "description": "Every colour at hand.", "cost": {"ink": 80}},
  {"key": "explorer.hold.wand", "name": "Magic Wand", "kind": "explorer", "part": "hold", "id": "wand", "group": "Explorer", "description": "Sparkles included.", "cost": {"ink": 150}},
  {"key": "explorer.outfit.accent", "name": "Signature Colour", "kind": "explorer", "part": "outfit", "id": "accent", "group": "Explorer", "description": "Your profile colour.", "cost": {}},
  {"key": "explorer.outfit.midnight", "name": "Midnight", "kind": "explorer", "part": "outfit", "id": "midnight", "group": "Explorer", "description": "Deep navy with silver piping.", "cost": {"ink": 60}},
  {"key": "explorer.outfit.camo", "name": "Paint Camo", "kind": "explorer", "part": "outfit", "id": "camo", "group": "Explorer", "description": "Splatter camouflage.", "cost": {"ink": 80}},
  {"key": "explorer.outfit.galaxy", "name": "Galaxy", "kind": "explorer", "part": "outfit", "id": "galaxy", "group": "Explorer", "description": "A nebula you can wear.", "cost": {"ink": 120}},
  {"key": "explorer.outfit.rainbow", "name": "Rainbow", "kind": "explorer", "part": "outfit", "id": "rainbow", "group": "Explorer", "description": "Every hue, all at once.", "cost": {"ink": 150}},
  {"key": "explorer.outfit.gold", "name": "Solid Gold", "kind": "explorer", "part": "outfit", "id": "gold", "group": "Explorer", "description": "Shiny. Very shiny.", "cost": {"ink": 200}},
  {"key": "explorer.trail.none", "name": "No Trail", "kind": "explorer", "part": "trail", "id": "none", "group": "Explorer", "description": "Leave no trace.", "cost": {}},
  {"key": "explorer.trail.sparkle", "name": "Sparkles", "kind": "explorer", "part": "trail", "id": "sparkle", "group": "Explorer", "description": "Glitter wherever you walk.", "cost": {"ink": 80}},
  {"key": "explorer.trail.paint", "name": "Paint Drips", "kind": "explorer", "part": "trail", "id": "paint", "group": "Explorer", "description": "Colourful drops in your footsteps.", "cost": {"ink": 100}},
  {"key": "explorer.trail.hearts", "name": "Hearts", "kind": "explorer", "part": "trail", "id": "hearts", "group": "Explorer", "description": "Spread the love.", "cost": {"ink": 100}},
  {"key": "explorer.trail.stars", "name": "Stardust", "kind": "explorer", "part": "trail", "id": "stars", "group": "Explorer", "description": "Little stars that twinkle out.", "cost": {"ink": 120}},
  {"key": "explorer.trail.rainbow", "name": "Rainbow Streak", "kind": "explorer", "part": "trail", "id": "rainbow", "group": "Explorer", "description": "A rainbow follows you.", "cost": {"ink": 180}},
  {"key": "explorer.aura.accent", "name": "Signature Aura", "kind": "explorer", "part": "aura", "id": "accent", "group": "Explorer", "description": "A ring in your colour.", "cost": {}},
  {"key": "explorer.aura.ice", "name": "Frost Aura", "kind": "explorer", "part": "aura", "id": "ice", "group": "Explorer", "description": "Cool blue shimmer.", "cost": {"ink": 120}},
  {"key": "explorer.aura.fire", "name": "Flame Aura", "kind": "explorer", "part": "aura", "id": "fire", "group": "Explorer", "description": "Hot orange flicker.", "cost": {"ink": 120}},
  {"key": "explorer.aura.gold", "name": "Golden Aura", "kind": "explorer", "part": "aura", "id": "gold", "group": "Explorer", "description": "A champion''s glow.", "cost": {"ink": 160}},
  {"key": "explorer.aura.rainbow", "name": "Prism Aura", "kind": "explorer", "part": "aura", "id": "rainbow", "group": "Explorer", "description": "A spinning rainbow ring.", "cost": {"ink": 200}}
]'::jsonb)
 where key = 'shop';

create or replace function private.shop_item(p_key text) returns jsonb
language sql stable as $$
  select i from jsonb_array_elements(coalesce(private.cfg('shop') -> 'items', '[]'::jsonb)) i where i ->> 'key' = p_key limit 1
$$;

create or replace function private.item_is_free(p_item jsonb) returns boolean
language sql immutable as $$
  select not exists (select 1 from jsonb_each_text(coalesce(p_item -> 'cost', '{}'::jsonb)) c where c.value::numeric > 0)
$$;

create or replace function public.purchase_unlock(p_key text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_item jsonb; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'purchase_unlock');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('purchase', 120, 3600);
  v_item := private.shop_item(p_key);
  if v_item is null or coalesce((v_item ->> 'enabled')::boolean, true) = false then
    raise exception 'unknown_item' using errcode = 'P0001';
  end if;
  if private.item_is_free(v_item) or exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = p_key) then
    raise exception 'already_unlocked' using errcode = 'P0001';
  end if;
  if v_item ? 'requires' and not exists (
    select 1 from public.player_unlocks where player_id = v_uid and unlock_key = v_item ->> 'requires') then
    raise exception 'requires_unlock' using errcode = 'P0001', detail = v_item ->> 'requires';
  end if;
  perform private.charge(v_uid, v_item -> 'cost', 'unlock', 'unlock', p_key, p_idempotency_key);
  insert into public.player_unlocks (player_id, unlock_key) values (v_uid, p_key);
  v_res := jsonb_build_object('ok', true, 'key', p_key, 'balances', private.balances(v_uid),
                              'unlocks', (select jsonb_agg(unlock_key order by unlock_key) from public.player_unlocks where player_id = v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- Dress your explorer. Each part must be free or bought; unknown parts keep their current value.
create or replace function public.equip_explorer(p_style jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cur jsonb; v_new jsonb := '{}'::jsonb; part text; v_id text; v_item jsonb;
  v_defaults jsonb := '{"hat": "beret", "hold": "brush", "outfit": "accent", "trail": "none", "aura": "accent"}'::jsonb;
begin
  perform private.rate_limit('equip', 240, 3600);
  select explorer_style into v_cur from public.profiles where id = v_uid;
  foreach part in array array['hat', 'hold', 'outfit', 'trail', 'aura'] loop
    v_id := coalesce(p_style ->> part, v_cur ->> part, v_defaults ->> part);
    v_item := private.shop_item('explorer.' || part || '.' || v_id);
    if v_item is null then raise exception 'unknown_item' using errcode = 'P0001', detail = part || '.' || v_id; end if;
    if not private.item_is_free(v_item)
       and not exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = 'explorer.' || part || '.' || v_id) then
      raise exception 'not_owned' using errcode = 'P0001', detail = part || '.' || v_id;
    end if;
    v_new := v_new || jsonb_build_object(part, v_id);
  end loop;
  update public.profiles set explorer_style = v_new, updated_at = now() where id = v_uid;
  return private.profile_json(v_uid);
end $$;

-- ===== 5. Referrals ================================================================
insert into public.game_config (key, value, description) values ('referrals',
  '{"enabled": true, "reward_ink": 500, "referee_reward_ink": 0, "qualify": "first_win", "daily_cap": 25, "redeem_window_days": 7}',
  'Inviting friends: the inviter earns reward_ink when the new player reaches the qualify step (signup, starter_plot or first_win). daily_cap limits paid referrals per inviter per day; new players can enter a code within redeem_window_days of joining.')
on conflict (key) do nothing;

create table if not exists public.referral_codes (
  code text primary key check (code ~ '^[A-Z0-9_]{3,20}$'),
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('default', 'custom')),
  created_at timestamptz not null default now(),
  unique (player_id, kind)
);

create table if not exists public.referrals (
  referee_id uuid primary key references public.players(id) on delete cascade,
  referrer_id uuid not null references public.players(id) on delete cascade,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'capped', 'void')),
  reward_ink int not null default 0,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (referee_id <> referrer_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

-- Ink comes from minigame wins and, by the operator's choice, referrals and converting USD rent.
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
    end if;
  end loop;
end $$;

create or replace function private.ensure_referral_code(p_uid uuid) returns text
language plpgsql as $$
declare v_code text; v_try text; i int := 0;
begin
  select code into v_code from public.referral_codes where player_id = p_uid and kind = 'default';
  if v_code is not null then return v_code; end if;
  select upper(username) into v_try from public.profiles where id = p_uid;
  while v_try is null or v_try !~ '^[A-Z0-9_]{3,20}$' or exists (select 1 from public.referral_codes where code = v_try) loop
    i := i + 1;
    v_try := 'LV' || upper(substr(md5(p_uid::text || i::text || random()::text), 1, 6));
    if i > 20 then raise exception 'referral_code_unavailable' using errcode = 'P0001'; end if;
  end loop;
  insert into public.referral_codes (code, player_id, kind) values (v_try, p_uid, 'default');
  return v_try;
end $$;

create or replace function public.my_referrals() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_cfg jsonb := coalesce(private.cfg('referrals'), '{}'::jsonb); v_default text;
begin
  v_default := private.ensure_referral_code(v_uid);
  return jsonb_build_object(
    'enabled', coalesce((v_cfg ->> 'enabled')::boolean, true),
    'reward_ink', coalesce((v_cfg ->> 'reward_ink')::int, 500),
    'referee_reward_ink', coalesce((v_cfg ->> 'referee_reward_ink')::int, 0),
    'qualify', coalesce(v_cfg ->> 'qualify', 'first_win'),
    'daily_cap', coalesce((v_cfg ->> 'daily_cap')::int, 25),
    'default_code', v_default,
    'custom_code', (select code from public.referral_codes where player_id = v_uid and kind = 'custom'),
    'stats', (select jsonb_build_object(
                'total', count(*), 'pending', count(*) filter (where status = 'pending'),
                'rewarded', count(*) filter (where status = 'rewarded'),
                'earned_ink', coalesce(sum(reward_ink) filter (where status = 'rewarded'), 0))
              from public.referrals where referrer_id = v_uid),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(r.referee_id), 'status', r.status,
                                                             'reward_ink', r.reward_ink, 'created_at', r.created_at, 'qualified_at', r.qualified_at)
                                         order by r.created_at desc), '[]'::jsonb)
               from (select * from public.referrals where referrer_id = v_uid order by created_at desc limit 50) r),
    'referred_by', (select jsonb_build_object('player', private.profile_json(r.referrer_id), 'status', r.status, 'code', r.code)
                    from public.referrals r where r.referee_id = v_uid),
    'can_redeem', not exists (select 1 from public.referrals where referee_id = v_uid)
                  and (select created_at from public.players where id = v_uid)
                      > now() - make_interval(days => coalesce((v_cfg ->> 'redeem_window_days')::int, 7)));
end $$;

create or replace function public.create_referral_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform private.rate_limit('referral_code', 20, 3600);
  if v_code !~ '^[A-Z0-9_]{4,16}$' then raise exception 'invalid_referral_code' using errcode = 'P0001', detail = 'format'; end if;
  begin
    perform private.clean_plot_name(v_code);
  exception when others then
    raise exception 'invalid_referral_code' using errcode = 'P0001', detail = 'language';
  end;
  if exists (select 1 from public.referral_codes where player_id = v_uid and kind = 'custom') then
    raise exception 'custom_code_exists' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.referral_codes where code = v_code)
     or exists (select 1 from public.profiles where upper(username) = v_code and id <> v_uid)
     or v_code in ('ADMIN', 'LANDVAS', 'OFFICIAL', 'SUPPORT', 'STAFF', 'MODERATOR') then
    raise exception 'code_taken' using errcode = 'P0001';
  end if;
  perform private.ensure_referral_code(v_uid);
  insert into public.referral_codes (code, player_id, kind) values (v_code, v_uid, 'custom');
  perform private.audit('referral.custom_code', 'player', v_uid::text, jsonb_build_object('code', v_code));
  return public.my_referrals();
end $$;

-- Rank of referral milestones; a referral pays out once the new player reaches the configured one.
create or replace function private.referral_rank(p_event text) returns int
language sql immutable as $$ select case p_event when 'signup' then 0 when 'starter_plot' then 1 when 'first_win' then 2 else 9 end $$;

create or replace function private.referral_qualify(p_referee uuid, p_event text) returns void
language plpgsql as $$
declare
  r public.referrals%rowtype; v_cfg jsonb := coalesce(private.cfg('referrals'), '{}'::jsonb);
  v_reward int := coalesce((v_cfg ->> 'reward_ink')::int, 500); v_welcome int := coalesce((v_cfg ->> 'referee_reward_ink')::int, 0);
  v_today int;
begin
  select * into r from public.referrals where referee_id = p_referee and status = 'pending' for update;
  if not found then return; end if;
  if private.referral_rank(p_event) < private.referral_rank(coalesce(v_cfg ->> 'qualify', 'first_win')) then return; end if;
  if exists (select 1 from public.players where id = r.referrer_id and status = 'banned') then
    update public.referrals set status = 'void', qualified_at = now() where referee_id = p_referee;
    return;
  end if;
  select count(*) into v_today from public.referrals
   where referrer_id = r.referrer_id and status = 'rewarded' and qualified_at >= private.day_start(now());
  if v_today >= coalesce((v_cfg ->> 'daily_cap')::int, 25) then
    update public.referrals set status = 'capped', qualified_at = now() where referee_id = p_referee;
    return;
  end if;
  if v_reward > 0 then
    perform private.grant(r.referrer_id, jsonb_build_object('ink', v_reward), 'referral', 'player', p_referee::text, 'referral:' || p_referee::text);
  end if;
  if v_welcome > 0 then
    perform private.grant(p_referee, jsonb_build_object('ink', v_welcome), 'referral_welcome', 'player', r.referrer_id::text, 'referral_welcome');
  end if;
  update public.referrals set status = 'rewarded', reward_ink = v_reward, qualified_at = now() where referee_id = p_referee;
  insert into public.feed_events (kind, player_id, data) values ('referral', r.referrer_id, jsonb_build_object('reward_ink', v_reward));
end $$;

create or replace function public.redeem_referral(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cfg jsonb := coalesce(private.cfg('referrals'), '{}'::jsonb);
  v_code text := upper(trim(coalesce(p_code, ''))); v_owner uuid;
begin
  perform private.rate_limit('redeem_referral', 10, 3600);
  if not coalesce((v_cfg ->> 'enabled')::boolean, true) then raise exception 'referrals_disabled' using errcode = 'P0001'; end if;
  if exists (select 1 from public.referrals where referee_id = v_uid) then raise exception 'already_referred' using errcode = 'P0001'; end if;
  if (select created_at from public.players where id = v_uid) < now() - make_interval(days => coalesce((v_cfg ->> 'redeem_window_days')::int, 7)) then
    raise exception 'referral_window_closed' using errcode = 'P0001';
  end if;
  select player_id into v_owner from public.referral_codes where code = v_code;
  if v_owner is null then
    select id into v_owner from public.profiles where upper(username) = v_code;
    if v_owner is not null then v_code := private.ensure_referral_code(v_owner); end if;
  end if;
  if v_owner is null or exists (select 1 from public.players where id = v_owner and status = 'banned') then
    raise exception 'invalid_referral_code' using errcode = 'P0001';
  end if;
  if v_owner = v_uid then raise exception 'cannot_refer_self' using errcode = 'P0001'; end if;
  insert into public.referrals (referee_id, referrer_id, code) values (v_uid, v_owner, v_code);
  -- milestones this player already reached count straight away
  perform private.referral_qualify(v_uid, 'signup');
  if (select starter_plot_claimed from public.players where id = v_uid) then perform private.referral_qualify(v_uid, 'starter_plot'); end if;
  if exists (select 1 from public.minigame_rewards where player_id = v_uid and ink > 0 and not held) then perform private.referral_qualify(v_uid, 'first_win'); end if;
  return public.my_referrals();
end $$;

-- hooks: claiming the starter plot and the first paid minigame win
create or replace function public.claim_starter_plot(p_gx int, p_gy int, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_res jsonb;
  v_bonus jsonb := coalesce(private.cfg('economy') -> 'starter_bonus', '{}'::jsonb);
  v_name text := private.clean_plot_name(p_name);
begin
  perform private.rate_limit('claim', 30, 3600);
  perform 1 from public.players where id = v_uid and not starter_plot_claimed for update;
  if not found then raise exception 'starter_already_claimed' using errcode = 'P0001'; end if;
  perform private.require_in_reach(v_uid, p_gx, p_gy);
  perform private.rent_settle(v_uid);
  v_res := private.take_plot(v_uid, p_gx, p_gy, 'starter', '{}'::jsonb);
  if v_name is not null then update public.world_plots set name = v_name where gx = p_gx and gy = p_gy; end if;
  update public.players set starter_plot_claimed = true where id = v_uid;
  perform private.grant(v_uid, v_bonus, 'starter_bonus', 'plot', private.cell_key(p_gx, p_gy), 'starter_bonus');
  perform private.referral_qualify(v_uid, 'starter_plot');
  return v_res || jsonb_build_object('name', v_name, 'bonus', v_bonus, 'achievements', private.evaluate_achievements(v_uid),
                                     'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid));
end $$;

create or replace function public.svc_finish_minigame(p_session_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
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
    select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1) into v_plot_level, v_rarity_mult
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity
    where wp.gx = v_s.gx and wp.gy = v_s.gy and wp.owner_id = v_s.player_id;
    select count(*) into v_today from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
    where mr.player_id = v_s.player_id and ms.game = v_s.game and mr.ink > 0 and mr.created_at >= private.day_start(now());
    v_limit := coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6);
    v_mult := (1 + coalesce((v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    v_ink_mult := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0)
                         * greatest(coalesce((v_cfg -> 'games' -> v_s.game ->> 'ink_multiplier')::numeric, 1), 0);
    if v_passed and v_today < v_limit then
      v_ink := floor(((v_rw ->> 'base_ink')::numeric + (v_rw ->> 'ink_per_level')::numeric * v_s.level
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
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $$;

-- ===== 5b. Convert USD rent into Ink ($1 = 100 Ink, any amount worth at least 1 Ink) =====
update public.game_config set value = value || '{"convert": {"enabled": true, "ink_per_usd": 100}}'::jsonb
 where key = 'rent' and not (value ? 'convert');
alter table public.rent_ledger drop constraint if exists rent_ledger_kind_check;
alter table public.rent_ledger add constraint rent_ledger_kind_check
  check (kind in ('rent', 'cashout_hold', 'cashout_release', 'cashout_paid', 'adjustment', 'convert'));

-- p_usd null = convert everything available. Only whole Ink is issued; the
-- remainder stays in the USD balance.
create or replace function public.convert_usd_to_ink(p_usd numeric default null, p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_prev jsonb; v_cfg jsonb := coalesce(private.cfg('rent') -> 'convert', '{}'::jsonb);
  v_rate numeric := greatest(coalesce((v_cfg ->> 'ink_per_usd')::numeric, 100), 1); v_bal numeric; v_ink bigint; v_cost numeric; v_res jsonb;
begin
  if p_idempotency_key is not null then
    v_prev := private.idem_begin(v_uid, p_idempotency_key, 'convert_usd');
    if v_prev is not null then return v_prev; end if;
  end if;
  if not coalesce((v_cfg ->> 'enabled')::boolean, true) then raise exception 'conversion_disabled' using errcode = 'P0001'; end if;
  perform private.rate_limit('convert', 120, 3600);
  perform private.rent_settle(v_uid);
  select balance_usd into v_bal from public.rent_accounts where player_id = v_uid for update;
  v_bal := coalesce(v_bal, 0);
  v_ink := floor(least(coalesce(p_usd, v_bal), v_bal) * v_rate);
  if p_usd is not null and p_usd <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if v_ink < 1 then raise exception 'conversion_too_small' using errcode = 'P0001', detail = (1 / v_rate)::text; end if;
  v_cost := v_ink / v_rate;
  update public.rent_accounts set balance_usd = balance_usd - v_cost, updated_at = now()
   where player_id = v_uid and balance_usd >= v_cost
  returning balance_usd into v_bal;
  if not found then raise exception 'insufficient_funds' using errcode = 'P0001', detail = 'usd'; end if;
  insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref)
  values (v_uid, 'convert', -v_cost, v_bal, v_ink::text || ' Ink');
  perform private.grant(v_uid, jsonb_build_object('ink', v_ink), 'usd_conversion', 'rent', null, coalesce(p_idempotency_key, 'convert:' || gen_random_uuid()::text));
  v_res := jsonb_build_object('ink', v_ink, 'usd', v_cost, 'rate', v_rate, 'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid));
  if p_idempotency_key is not null then return private.idem_finish(v_uid, p_idempotency_key, v_res); end if;
  return v_res;
end $$;

-- ===== 6. Friends ===================================================================
create table if not exists public.friendships (
  requester_id uuid not null references public.players(id) on delete cascade,
  addressee_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

create or replace function private.friend_state(p_me uuid, p_other uuid) returns text
language sql stable as $$
  select coalesce((
    select case when f.status = 'accepted' then 'friends' when f.requester_id = p_me then 'outgoing' else 'incoming' end
    from public.friendships f
    where (f.requester_id = p_me and f.addressee_id = p_other) or (f.requester_id = p_other and f.addressee_id = p_me)
    limit 1), 'none')
$$;

create or replace function public.friend_status(p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('status', 'none'); end if;
  return jsonb_build_object('status', case when v_uid = p_player_id then 'self' else private.friend_state(v_uid, p_player_id) end);
end $$;

create or replace function public.friend_request(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_state text;
begin
  perform private.rate_limit('friend_request', 60, 3600);
  if p_player_id = v_uid then raise exception 'cannot_friend_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player_id) or not private.visible_to(p_player_id, v_uid)
     or exists (select 1 from public.player_blocks where blocker_id = p_player_id and blocked_id = v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_state := private.friend_state(v_uid, p_player_id);
  if v_state = 'friends' then raise exception 'already_friends' using errcode = 'P0001'; end if;
  if v_state = 'outgoing' then raise exception 'request_pending' using errcode = 'P0001'; end if;
  if v_state = 'incoming' then
    update public.friendships set status = 'accepted', responded_at = now() where requester_id = p_player_id and addressee_id = v_uid;
    return jsonb_build_object('status', 'friends');
  end if;
  if (select count(*) from public.friendships where requester_id = v_uid or addressee_id = v_uid) >= 1000 then
    raise exception 'friend_limit' using errcode = 'P0001';
  end if;
  insert into public.friendships (requester_id, addressee_id) values (v_uid, p_player_id);
  return jsonb_build_object('status', 'outgoing');
end $$;

create or replace function public.friend_respond(p_player_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where requester_id = p_player_id and addressee_id = v_uid and status = 'pending';
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
    return jsonb_build_object('status', 'friends');
  end if;
  delete from public.friendships where requester_id = p_player_id and addressee_id = v_uid and status = 'pending';
  return jsonb_build_object('status', 'none');
end $$;

create or replace function public.friend_remove(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.friendships
   where (requester_id = v_uid and addressee_id = p_player_id) or (requester_id = p_player_id and addressee_id = v_uid);
  return jsonb_build_object('status', 'none');
end $$;

create or replace function public.my_friends() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(o.id), 'since', o.since,
                                                              'plots', (select count(*) from public.world_plots where owner_id = o.id))
                                          order by lower(o.username)), '[]'::jsonb)
                from (select pr.id, pr.username, coalesce(f.responded_at, f.created_at) as since
                      from public.friendships f
                      join public.profiles pr on pr.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
                      where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid)
                        and private.visible_to(pr.id, v_uid)) o),
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(f.requester_id), 'at', f.created_at)
                                           order by f.created_at desc), '[]'::jsonb)
                 from public.friendships f where f.addressee_id = v_uid and f.status = 'pending' and private.visible_to(f.requester_id, v_uid)),
    'outgoing', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(f.addressee_id), 'at', f.created_at)
                                           order by f.created_at desc), '[]'::jsonb)
                 from public.friendships f where f.requester_id = v_uid and f.status = 'pending'));
end $$;

-- ===== 7. Global chat ==================================================================
alter table public.players add column if not exists chat_muted_until timestamptz;
insert into public.feature_flags (key, enabled, is_public, description, config)
values ('global_chat', true, true, 'The global chat room', '{}')
on conflict (key) do nothing;

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room text not null default 'global' check (room in ('global')),
  player_id uuid not null references public.players(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.players(id) on delete set null
);
create index if not exists chat_messages_room_idx on public.chat_messages (room, id desc);

-- Mask blocked words (whole words, any case or l33t spelling) with asterisks.
create or replace function private.chat_clean(p_body text) returns text
language plpgsql stable as $$
declare
  v text := regexp_replace(btrim(coalesce(p_body, '')), '\s+', ' ', 'g'); w text; v_words jsonb := coalesce(private.cfg('moderation') -> 'blocked_words', '[]'::jsonb);
  tok text; out_parts text[] := '{}'; norm text;
begin
  if v = '' then raise exception 'chat_empty' using errcode = 'P0001'; end if;
  if char_length(v) > 300 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  if v ~ '[\x01-\x08\x0b-\x1f\x7f]' then raise exception 'chat_invalid' using errcode = 'P0001'; end if;
  if v ~* '(https?:|www\.|\.(com|net|org|io|gg|xyz|ru|co|me|tv|app|ly)(\M|/|$)|discord\.)' then
    raise exception 'chat_links' using errcode = 'P0001';
  end if;
  foreach tok in array string_to_array(v, ' ') loop
    norm := regexp_replace(translate(lower(tok), '0134578@$!', 'oieastbasi'), '[^a-z]', '', 'g');
    if norm <> '' and (exists (select 1 from jsonb_array_elements_text(v_words) b(w) where b.w = norm or b.w = private.collapse_repeats(norm))
                      or exists (select 1 from jsonb_array_elements_text(coalesce(private.cfg('moderation') -> 'blocked_fragments', '[]'::jsonb)) f(w)
                                 where position(f.w in norm) > 0)) then
      out_parts := out_parts || repeat('*', greatest(char_length(tok), 3));
    else
      out_parts := out_parts || tok;
    end if;
  end loop;
  return array_to_string(out_parts, ' ');
end $$;

create or replace function private.chat_json(m public.chat_messages) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'created_at', m.created_at, 'player', private.profile_json(m.player_id))
$$;

create or replace function public.send_chat_message(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_muted timestamptz; v_body text; m public.chat_messages%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('chat_burst', 1, 2);
  perform private.rate_limit('chat', 20, 60);
  perform private.rate_limit('chat_hour', 300, 3600);
  v_body := private.chat_clean(p_body);
  insert into public.chat_messages (player_id, body) values (v_uid, v_body) returning * into m;
  return private.chat_json(m);
end $$;

-- Newest messages (or only those after p_after_id when polling), oldest first.
create or replace function public.chat_recent(p_after_id bigint default null, p_limit int default 60) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_mod boolean := private.has_role(v_uid, array['moderator']);
begin
  return jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(private.chat_json(m) || case when v_mod and m.deleted_at is not null then jsonb_build_object('deleted', true) else '{}'::jsonb end
                       order by m.id)
      from (select c.* from public.chat_messages c
            where c.room = 'global' and (p_after_id is null or c.id > p_after_id)
              and (c.deleted_at is null or v_mod)
              and private.visible_to(c.player_id, v_uid)
            order by c.id desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) m), '[]'::jsonb),
    'muted_until', (select case when chat_muted_until > now() then chat_muted_until end from public.players where id = v_uid),
    'enabled', private.flag('global_chat'));
end $$;

create or replace function public.report_chat_message(p_message_id bigint, p_reason text default 'inappropriate') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.chat_messages%rowtype;
begin
  perform private.rate_limit('report_chat', 30, 3600);
  select * into m from public.chat_messages where id = p_message_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.moderation_cases (kind, priority, subject_player_id, reporter_id, reason, details)
  values ('report', 2, m.player_id, v_uid, 'chat_message', jsonb_build_object('message_id', m.id, 'body', m.body, 'why', left(coalesce(p_reason, ''), 200)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_delete_chat_message(p_message_id bigint, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  update public.chat_messages set deleted_at = now(), deleted_by = v_uid where id = p_message_id and deleted_at is null;
  update public.moderation_cases set status = 'resolved', resolution = 'message deleted', resolved_by = v_uid, resolved_at = now()
   where kind = 'report' and status = 'open' and (details ->> 'message_id')::bigint = p_message_id;
  perform private.audit('chat.delete', 'chat_message', p_message_id::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_mute_player(p_player_id uuid, p_minutes int, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_until timestamptz;
begin
  if p_player_id = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
  v_until := case when coalesce(p_minutes, 0) > 0 then now() + make_interval(mins => least(p_minutes, 525600)) end;
  update public.players set chat_muted_until = v_until where id = p_player_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit(case when v_until is null then 'chat.unmute' else 'chat.mute' end, 'player', p_player_id::text,
                        jsonb_build_object('minutes', p_minutes, 'reason', p_reason));
  return jsonb_build_object('muted_until', v_until);
end $$;

-- ===== 8. Live feed =====================================================================
create table if not exists public.feed_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level')),
  player_id uuid not null references public.players(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists feed_events_created_idx on public.feed_events (id desc);

create or replace function private.feed_join_trg() returns trigger
language plpgsql as $$
begin
  insert into public.feed_events (kind, player_id) values ('join', new.id);
  return null;
end $$;
drop trigger if exists profiles_feed_join on public.profiles;
create trigger profiles_feed_join after insert on public.profiles for each row execute function private.feed_join_trg();

create or replace function private.feed_claim_trg() returns trigger
language plpgsql as $$
declare v_rarity text; v_type text;
begin
  if new.method in ('starter', 'acquire', 'purchase') then
    select rarity, plot_type into v_rarity, v_type from public.world_plots where gx = new.gx and gy = new.gy;
    insert into public.feed_events (kind, player_id, data)
    values ('claim', new.player_id, jsonb_build_object('rarity', v_rarity, 'plot_type', v_type, 'starter', new.method = 'starter'));
  end if;
  return null;
end $$;
drop trigger if exists plot_ownership_feed on public.plot_ownership;
create trigger plot_ownership_feed after insert on public.plot_ownership for each row execute function private.feed_claim_trg();

create or replace function private.feed_publish_trg() returns trigger
language plpgsql as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    insert into public.feed_events (kind, player_id, data)
    values ('publish', new.owner_id, jsonb_build_object('publication_id', new.id, 'title', new.title,
                                                        'thumb_path', new.thumb_path, 'plot_count', new.plot_count));
  end if;
  return null;
end $$;
drop trigger if exists artwork_publications_feed on public.artwork_publications;
create trigger artwork_publications_feed after update of status on public.artwork_publications
  for each row execute function private.feed_publish_trg();

create or replace function private.feed_achievement_trg() returns trigger
language plpgsql as $$
begin
  insert into public.feed_events (kind, player_id, data)
  select 'achievement', new.player_id, jsonb_build_object('key', a.key, 'name', a.name, 'icon', a.icon)
  from public.achievements a where a.key = new.achievement_key;
  return null;
end $$;
drop trigger if exists player_achievements_feed on public.player_achievements;
create trigger player_achievements_feed after insert on public.player_achievements for each row execute function private.feed_achievement_trg();

-- Public, location-free activity: joins, claims (with the revealed rarity), new art, badges, referrals.
create or replace function public.feed_recent(p_after_id bigint default null, p_before_id bigint default null, p_limit int default 40) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'data', e.data, 'created_at', e.created_at,
                                        'player', private.profile_json(e.player_id)) order by e.id desc)
    from (select f.* from public.feed_events f
          where (p_after_id is null or f.id > p_after_id) and (p_before_id is null or f.id < p_before_id)
            and private.visible_to(f.player_id, v_uid)
            and (f.kind <> 'publish' or exists (select 1 from public.artwork_publications a
                                                where a.id = (f.data ->> 'publication_id')::uuid and a.status = 'published'))
          order by f.id desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) e), '[]'::jsonb);
end $$;

-- ===== 9. Admin ===========================================================================
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
    for g in select k, v from jsonb_each(coalesce(p_value -> 'games', '{}'::jsonb)) x(k, v) loop
      if coalesce((g.v ->> 'ink_multiplier')::numeric, 1) not between 0 and 100 then
        raise exception 'invalid_minigame_config' using errcode = 'P0001';
      end if;
    end loop;
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

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support']);
begin
  return jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = v_uid),
    'players_total', (select count(*) from public.players),
    'players_active_15m', (select count(*) from public.players where last_active_at > now() - interval '15 minutes'),
    'players_active_24h', (select count(*) from public.players where last_active_at > now() - interval '1 day'),
    'signups_24h', (select count(*) from public.players where created_at > now() - interval '1 day'),
    'plots_owned', (select count(*) from public.world_plots where owner_id is not null),
    'plots_claimed_24h', (select count(*) from public.plot_ownership where acquired_at > now() - interval '1 day'),
    'named_plots', (select count(*) from public.world_plots where owner_id is not null and name is not null),
    'groups_active', (select count(*) from public.canvas_groups where status = 'active'),
    'art_published_24h', (select count(*) from public.artwork_publications where published_at > now() - interval '1 day'),
    'pending_review', (select count(*) from public.artwork_publications where status = 'pending_review'),
    'publications', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from public.artwork_publications group by status) s),
    'open_cases', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
        select kind, count(*) as n from public.moderation_cases where status = 'open' group by kind) s),
    'jobs', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from private.render_jobs group by status) s),
    'oldest_queued_seconds', (select coalesce(extract(epoch from now() - min(created_at)), 0)::int
                              from private.render_jobs where status = 'queued'),
    'client_errors_24h', (select count(*) from private.client_errors where created_at > now() - interval '1 day'),
    'minigame_sessions_24h', (select count(*) from public.minigame_sessions where started_at > now() - interval '1 day'),
    'minigame_wins_24h', (select count(*) from public.minigame_sessions where started_at > now() - interval '1 day' and passed),
    'flagged_sessions', (select count(*) from public.minigame_sessions where review_status = 'flagged'),
    'ink_issued_24h', (select coalesce(sum(delta), 0) from public.resource_ledger where resource = 'ink' and delta > 0 and created_at > now() - interval '1 day'),
    'ink_spent_24h', (select coalesce(-sum(delta), 0) from public.resource_ledger where resource = 'ink' and delta < 0 and created_at > now() - interval '1 day'),
    'gps_jumps_24h', (select count(*) from private.security_events where kind = 'gps_jump_rejected' and created_at > now() - interval '1 day'),
    'chat_messages_24h', (select count(*) from public.chat_messages where created_at > now() - interval '1 day'),
    'friendships', (select count(*) from public.friendships where status = 'accepted'),
    'referrals', jsonb_build_object(
      'total', (select count(*) from public.referrals),
      'pending', (select count(*) from public.referrals where status = 'pending'),
      'rewarded_24h', (select count(*) from public.referrals where status = 'rewarded' and qualified_at > now() - interval '1 day'),
      'ink_paid_24h', (select coalesce(sum(delta), 0) from public.resource_ledger where resource = 'ink' and reason = 'referral' and created_at > now() - interval '1 day')),
    'rent', jsonb_build_object(
      'settled_liability_usd', (select coalesce(sum(balance_usd + held_usd), 0) from public.rent_accounts),
      'lifetime_usd', (select coalesce(sum(lifetime_usd), 0) from public.rent_accounts),
      'paid_usd', (select coalesce(sum(paid_usd), 0) from public.rent_accounts),
      'rate_usd_per_second', (select coalesce(sum(r.usd_per_second * (1 + coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) * (p.level - 1))), 0)
                              from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id is not null),
      'boosted_players_now', (select count(*) from public.rent_accounts where boost_until > now())),
    'server_time', now());
end $$;

create or replace function public.admin_player_detail(p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']); e public.explorers%rowtype;
begin
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = p_player_id;
  return jsonb_build_object(
    'player', (select to_jsonb(p) from public.players p where p.id = p_player_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_player_id),
    'email', (select email from auth.users where id = p_player_id),
    'balances', private.balances(p_player_id),
    'rent', private.rent_json(p_player_id),
    'explorer', (select jsonb_build_object('mode', x.mode, 'gx', x.gx >> 8 << 8, 'gy', x.gy >> 8 << 8, 'traveling', x.traveling)
                 from private.explorer_now(p_player_id) x),
    'joystick', case when e.player_id is not null then private.joystick_json(e) end,
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = p_player_id),
    'plots', (select count(*) from public.world_plots where owner_id = p_player_id),
    -- [gx, gy, rarity, type, level, has_art, group_id, name]
    'plot_list', (select coalesce(jsonb_agg(jsonb_build_array(p.gx, p.gy, p.rarity, p.plot_type, p.level, p.art_rev is not null, m.group_id, p.name)
                                            order by p.claimed_at), '[]'::jsonb)
                  from (select * from public.world_plots where owner_id = p_player_id order by claimed_at limit 2000) p
                  left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy),
    'groups', (select count(*) from public.canvas_groups where owner_id = p_player_id and status = 'active'),
    'referrals', jsonb_build_object(
      'codes', (select coalesce(jsonb_agg(code order by kind), '[]'::jsonb) from public.referral_codes where player_id = p_player_id),
      'invited', (select count(*) from public.referrals where referrer_id = p_player_id),
      'rewarded', (select count(*) from public.referrals where referrer_id = p_player_id and status = 'rewarded'),
      'referred_by', (select pr.username from public.referrals r join public.profiles pr on pr.id = r.referrer_id where r.referee_id = p_player_id)),
    'ledger', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]'::jsonb) from (
                 select * from public.resource_ledger where player_id = p_player_id order by id desc limit 40) l),
    'publications', (select coalesce(jsonb_agg(private.publication_json(a) order by a.created_at desc), '[]'::jsonb)
                     from public.artwork_publications a where a.owner_id = p_player_id and a.status <> 'cancelled'),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) - 'seed' order by s.started_at desc), '[]'::jsonb) from (
                   select * from public.minigame_sessions where player_id = p_player_id order by started_at desc limit 30) s),
    'security_events', (select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'details', s.details, 'created_at', s.created_at)
                                                   order by s.id desc), '[]'::jsonb) from (
                          select * from private.security_events where player_id = p_player_id order by id desc limit 30) s),
    'cases', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.moderation_cases c
              where c.subject_player_id = p_player_id or c.reporter_id = p_player_id));
end $$;

-- ===== 10. Row level security and privileges ================================================
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.friendships enable row level security;
alter table public.chat_messages enable row level security;
alter table public.feed_events enable row level security;
-- all reads go through the functions above (which filter hidden/blocked players)
revoke all on public.referral_codes, public.referrals, public.friendships, public.chat_messages, public.feed_events from anon, authenticated;
revoke all on table private.secrets from public;
revoke all on function private.cell_roll(text, int, int) from public;
-- Tables that tie a player to map coordinates are read only through the game's
-- functions (which leave locations out of everything player-centric). Direct
-- reads such as world_plots?owner_id=eq.<id> would reveal where someone's land is.
drop policy if exists world_plots_read on public.world_plots;
drop policy if exists canvas_groups_read on public.canvas_groups;
drop policy if exists canvas_group_members_read on public.canvas_group_members;
drop policy if exists publications_read on public.artwork_publications;
revoke select on public.world_plots, public.canvas_groups, public.canvas_group_members, public.artwork_publications from anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'private.can_see_location(uuid, uuid)', 'private.shop_item(text)', 'private.item_is_free(jsonb)', 'private.ensure_referral_code(uuid)',
    'private.referral_rank(text)', 'private.referral_qualify(uuid, text)', 'private.friend_state(uuid, uuid)', 'private.chat_clean(text)',
    'private.chat_json(public.chat_messages)', 'private.feed_join_trg()', 'private.feed_claim_trg()', 'private.feed_publish_trg()',
    'private.feed_achievement_trg()'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array[
    'public.plot_details(int, int)', 'public.artwork_detail(uuid)', 'public.player_land(text)', 'public.set_avatar_image(text)',
    'public.admin_clear_avatar(uuid, text)', 'public.purchase_unlock(text, text)', 'public.equip_explorer(jsonb)',
    'public.my_referrals()', 'public.create_referral_code(text)', 'public.redeem_referral(text)',
    'public.claim_starter_plot(int, int, text)', 'public.svc_finish_minigame(uuid, jsonb)',
    'public.friend_status(uuid)', 'public.friend_request(uuid)', 'public.friend_respond(uuid, boolean)', 'public.friend_remove(uuid)',
    'public.my_friends()', 'public.send_chat_message(text)', 'public.chat_recent(bigint, int)', 'public.report_chat_message(bigint, text)',
    'public.admin_delete_chat_message(bigint, text)', 'public.admin_mute_player(uuid, int, text)', 'public.feed_recent(bigint, bigint, int)',
    'public.admin_config_set(text, jsonb)', 'public.admin_overview()', 'public.admin_player_detail(uuid)',
    'public.convert_usd_to_ink(numeric, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon, authenticated', f);
    if f like 'public.svc\_%' then
      execute format('grant execute on function %s to service_role', f);
    else
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
  foreach f in array array['public.plot_details(int, int)', 'public.artwork_detail(uuid)', 'public.player_land(text)',
                           'public.friend_status(uuid)', 'public.feed_recent(bigint, bigint, int)'] loop
    execute format('grant execute on function %s to anon', f);
  end loop;
end $$;
