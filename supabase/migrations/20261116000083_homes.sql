-- Homes: every player has a 3D home that is also their public face. Visitors walk in and see the owner's art on
-- the walls, their trophies and career levels, their Inkborn wandering about, and a door to each of their places
-- (arcade, habitat, farm, business). The owner decorates it: furniture (some free, the rest bought with Ink or
-- arcade tickets), wallpaper, floor, the view from the windows, the lighting, the name over the door, and who may
-- use each door (everyone, friends, or nobody). Up to 10 people share a home at once, live, like the arcade.

create table if not exists public.homes (
  player_id uuid primary key references public.players (id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 32),
  style jsonb not null default '{}'::jsonb,
  layout jsonb not null default '[]'::jsonb,
  doors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.home_items (
  player_id uuid not null references public.players (id) on delete cascade,
  item text not null,
  qty int not null default 0 check (qty >= 0),
  primary key (player_id, item)
);
create table if not exists public.home_presence (
  player_id uuid primary key references public.players (id) on delete cascade,
  host_id uuid not null references public.players (id) on delete cascade,
  shard int not null default 0,
  x real not null default 0, z real not null default 4.6,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists home_presence_room_idx on public.home_presence (host_id, shard, seen_at);
alter table public.homes enable row level security;
alter table public.home_items enable row level security;
alter table public.home_presence enable row level security;
revoke all on public.homes, public.home_items, public.home_presence from anon, authenticated;

-- the catalogue. price: {} free, {"ink": n} or {"tickets": n}. mount: floor (stands on the floor), wall (hangs on
-- the back or right wall), ceil (hangs from the ceiling), rug (lies flat, can go under things).
insert into public.game_config (key, value) values ('home', '{
  "room_size": 10, "stale_seconds": 12, "max_items": 90, "free_each": 6,
  "styles": {
    "wall": ["paint", "stripes", "floral", "brick", "wood", "stars", "splatter", "tiles", "scallop"],
    "floor": ["oak", "walnut", "herringbone", "checker", "carpet", "marble", "tatami", "tiles"],
    "view": ["city", "forest", "beach", "mountains", "space", "sunset"],
    "mood": ["warm", "day", "cozy", "neon", "candle"]
  },
  "items": {
    "sofa": {"price": {}, "mount": "floor"}, "armchair": {"price": {}, "mount": "floor"}, "coffee_table": {"price": {}, "mount": "floor"},
    "rug_rect": {"price": {}, "mount": "rug"}, "floor_lamp": {"price": {}, "mount": "floor"}, "monstera": {"price": {}, "mount": "floor"},
    "bookshelf": {"price": {}, "mount": "floor"}, "bed": {"price": {}, "mount": "floor"}, "side_table": {"price": {}, "mount": "floor"},
    "dining_table": {"price": {}, "mount": "floor"}, "dining_chair": {"price": {}, "mount": "floor"}, "cactus": {"price": {}, "mount": "floor"},
    "wall_clock": {"price": {}, "mount": "wall"}, "wall_shelf": {"price": {}, "mount": "wall"},
    "beanbag": {"price": {"ink": 3}, "mount": "floor"}, "rug_round": {"price": {"ink": 2}, "mount": "rug"}, "rug_rainbow": {"price": {"ink": 4}, "mount": "rug"},
    "desk": {"price": {"ink": 4}, "mount": "floor"}, "dresser": {"price": {"ink": 4}, "mount": "floor"}, "table_lamp": {"price": {"ink": 2}, "mount": "floor"},
    "lava_lamp": {"price": {"ink": 3}, "mount": "floor"}, "chandelier": {"price": {"ink": 8}, "mount": "ceil"}, "string_lights": {"price": {"ink": 3}, "mount": "wall"},
    "bonsai": {"price": {"ink": 4}, "mount": "floor"}, "flower_vase": {"price": {"ink": 2}, "mount": "floor"}, "hanging_plant": {"price": {"ink": 3}, "mount": "ceil"},
    "fireplace": {"price": {"ink": 12}, "mount": "floor"}, "piano": {"price": {"ink": 15}, "mount": "floor"}, "record_player": {"price": {"ink": 5}, "mount": "floor"},
    "tv_console": {"price": {"ink": 8}, "mount": "floor"}, "aquarium": {"price": {"ink": 12}, "mount": "floor"}, "easel": {"price": {"ink": 6}, "mount": "floor"},
    "telescope": {"price": {"ink": 8}, "mount": "floor"}, "globe": {"price": {"ink": 3}, "mount": "floor"}, "grandfather_clock": {"price": {"ink": 10}, "mount": "floor"},
    "trophy_case": {"price": {}, "mount": "floor"}, "pet_bed": {"price": {"ink": 5}, "mount": "floor"}, "toy_chest": {"price": {"ink": 3}, "mount": "floor"},
    "fountain": {"price": {"ink": 14}, "mount": "floor"}, "kitchen": {"price": {"ink": 10}, "mount": "floor"}, "fridge": {"price": {"ink": 6}, "mount": "floor"},
    "bar_stool": {"price": {"ink": 2}, "mount": "floor"}, "wall_mirror": {"price": {"ink": 3}, "mount": "wall"}, "wall_tv": {"price": {"ink": 6}, "mount": "wall"},
    "poster": {"price": {"ink": 1}, "mount": "wall"},
    "mini_arcade": {"price": {"tickets": 300}, "mount": "floor"}, "neon_heart": {"price": {"tickets": 200}, "mount": "wall"},
    "gumball": {"price": {"tickets": 120}, "mount": "floor"}, "plushies": {"price": {"tickets": 150}, "mount": "floor"}, "jukebox": {"price": {"tickets": 250}, "mount": "floor"}
  }
}'::jsonb) on conflict (key) do update set value = excluded.value;

create or replace function private.home_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('home'), '{}'::jsonb) $$;

create or replace function private.home_row(p_uid uuid) returns public.homes language plpgsql as $$
declare h public.homes%rowtype;
begin
  select * into h from public.homes where player_id = p_uid;
  if not found then insert into public.homes (player_id) values (p_uid) on conflict (player_id) do nothing returning * into h;
    if h.player_id is null then select * into h from public.homes where player_id = p_uid; end if;
  end if;
  return h;
end $$;

-- who may use a door: 'public' (anyone who can see the owner), 'friends', or 'hidden' (only the owner)
create or replace function private.home_door_ok(p_doors jsonb, p_kind text, p_owner uuid, p_viewer uuid) returns boolean language sql stable as $$
  select p_owner = p_viewer or case coalesce(p_doors ->> p_kind, 'public')
    when 'hidden' then false
    when 'friends' then private.friend_state(p_owner, p_viewer) = 'friends'
    else true end
$$;

-- every place of a kind (all of them for the owner; the busiest one for a visitor)
create or replace function private.home_places(p_owner uuid, p_viewer uuid, p_un text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'arcade', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', a.id, 'name', private.place_name(g.name, p_un, 'Arcade'), 'plots', coalesce(g.plot_count, 1),
                                  'level', (private.arc_level(a.xp) ->> 'level')::int, 'score', a.plays, 'rarity', private.group_rarity(a.group_id),
                                  'here', (select count(*) from public.arcade_presence ap where ap.arcade_id = a.id and ap.seen_at > now() - interval '12 seconds')) x
          from public.arcades a join public.canvas_groups g on g.id = a.group_id and g.kind = 'arcade' and g.status = 'active'
         where a.owner_id = p_owner) t), '[]'::jsonb),
    'habitat', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', h.id, 'name', case when h.kind = 'starter' then p_un || '’s home sanctuary' else private.place_name(g.name, p_un, 'Sanctuary') end,
                                  'plots', coalesce(g.plot_count, 0), 'starter', h.kind = 'starter', 'rarity', private.group_rarity(h.group_id),
                                  'score', (select count(*) from public.inkborn c where c.habitat_id = h.id) * 100 + coalesce(g.plot_count, 0)) x
          from public.habitats h left join public.canvas_groups g on g.id = h.group_id
         where h.owner_id = p_owner and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))) t), '[]'::jsonb),
    'farm', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', f.id, 'name', private.place_name(g.name, p_un, 'Farm'), 'plots', g.plot_count, 'score', f.harvests,
                                  'rarity', private.group_rarity(f.group_id)) x
          from public.farms f join public.canvas_groups g on g.id = f.group_id and g.kind = 'farm' and g.status = 'active'
         where f.owner_id = p_owner) t), '[]'::jsonb),
    'business', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', b.id, 'name', private.place_name(g.name, p_un, 'Business'), 'plots', g.plot_count, 'score', b.tips,
                                  'rarity', private.group_rarity(b.group_id)) x
          from public.businesses b join public.canvas_groups g on g.id = b.group_id and g.kind = 'business' and g.status = 'active'
         where b.owner_id = p_owner) t), '[]'::jsonb))
$$;

create or replace function public.home_get(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_id uuid; v_un text; h public.homes%rowtype; v_own boolean; v_places jsonb; k text; v_doors jsonb := '{}'::jsonb;
begin
  perform private.rate_limit('home_get', 1200, 3600);
  select id, username into v_id, v_un from public.profiles where lower(username) = lower(btrim(coalesce(p_username, '')));
  if v_id is null or not private.visible_to(v_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_own := v_id = v_uid;
  if v_own then h := private.home_row(v_id);
  else
    select * into h from public.homes where player_id = v_id;
    if not found then h.player_id := v_id; h.style := '{}'::jsonb; h.layout := '[]'::jsonb; h.doors := '{}'::jsonb; end if;
  end if;
  v_places := private.home_places(v_id, v_uid, v_un);
  for k in select jsonb_object_keys(v_places) loop
    v_doors := v_doors || jsonb_build_object(k, jsonb_build_object(
      'privacy', coalesce(h.doors ->> k, 'public'),
      'open', private.home_door_ok(h.doors, k, v_id, v_uid),
      'count', jsonb_array_length(v_places -> k),
      'places', case when not private.home_door_ok(h.doors, k, v_id, v_uid) then '[]'::jsonb
                     when v_own then v_places -> k
                     when jsonb_array_length(v_places -> k) > 0 then jsonb_build_array(v_places -> k -> 0) else '[]'::jsonb end));
  end loop;
  return jsonb_build_object(
    'host', private.profile_json(v_id) || jsonb_build_object('explorer_style', (select explorer_style from public.profiles where id = v_id)),
    'own', v_own, 'name', h.name, 'style', h.style, 'layout', h.layout, 'doors', v_doors,
    'careers', jsonb_build_object(
      'arcade', coalesce((select max((private.arc_level(a.xp) ->> 'level')::int) from public.arcades a where a.owner_id = v_id), 0),
      'keeper', coalesce((select private.keeper_level_of(xp) from public.keeper_state where player_id = v_id), 0),
      'farmer', coalesce((select private.farm_level_of(xp) from public.farm_progress where player_id = v_id), 0),
      'merchant', coalesce((select alltime from public.biz_state where player_id = v_id), 0),
      'creatures', (select count(*) from public.inkborn where owner_id = v_id),
      'plots', (select count(*) from public.world_plots where owner_id = v_id)),
    'inkborn', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'genome', c.genome, 'companion', c.id = kp.companion_id) order by c.id = kp.companion_id desc, c.bond desc)
                        from (select * from public.inkborn where owner_id = v_id order by bond desc, created_at limit 6) c
                        left join public.inkborn_keepers kp on kp.owner_id = v_id), '[]'::jsonb),
    'items', case when v_own then coalesce((select jsonb_object_agg(item, qty) from public.home_items where player_id = v_id and qty > 0), '{}'::jsonb) end,
    'tickets', case when v_own then coalesce((select tickets from public.arcade_players where player_id = v_id), 0) end,
    'catalog', private.home_cfg() - 'room_size' - 'stale_seconds');
end $$;

create or replace function private.home_check_layout(p_uid uuid, p_layout jsonb) returns jsonb language plpgsql stable as $$
declare c jsonb := private.home_cfg(); e jsonb; it jsonb; v_out jsonb := '[]'::jsonb; v_counts jsonb := '{}'::jsonb; x numeric; z numeric; r int; v_n int; v_c int;
begin
  if p_layout is null or jsonb_typeof(p_layout) <> 'array' then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_layout) > coalesce((c ->> 'max_items')::int, 90) then raise exception 'too_many_items' using errcode = 'P0001'; end if;
  for e in select * from jsonb_array_elements(p_layout) loop
    it := c -> 'items' -> (e ->> 'i');
    if it is null or jsonb_typeof(e -> 'x') <> 'number' or jsonb_typeof(e -> 'z') <> 'number' then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    x := round((e ->> 'x')::numeric, 2); z := round((e ->> 'z')::numeric, 2); r := coalesce((e ->> 'r')::int, 0);
    if r not between 0 and 3 then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    -- an optional colour (fabric / wood / paint swatch)
    v_c := case when jsonb_typeof(e -> 'c') = 'number' then (e ->> 'c')::int end;
    if v_c is not null and v_c not between 0 and 11 then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    -- the room is x -7..7, z -6..6; the strip by the doors (x < -5.4) stays clear
    if it ->> 'mount' = 'wall' then
      if not ((abs(z + 5.9) <= 0.3 and x between -5.2 and 6.4) or (abs(x - 6.9) <= 0.3 and z between -5.4 and 5.6)) then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    elsif x < -5.4 or x > 6.7 or z < -5.7 or z > 5.7 then raise exception 'invalid_layout' using errcode = 'P0001';
    end if;
    v_counts := jsonb_set(v_counts, array[e ->> 'i'], to_jsonb(coalesce((v_counts ->> (e ->> 'i'))::int, 0) + 1));
    v_out := v_out || jsonb_build_array(jsonb_build_object('i', e ->> 'i', 'x', x, 'z', z, 'r', r) || case when v_c is null then '{}'::jsonb else jsonb_build_object('c', v_c) end);
  end loop;
  -- free things: a few of each; bought things: as many as you've bought
  for e in select jsonb_build_object('k', key, 'n', value) from jsonb_each(v_counts) loop
    it := c -> 'items' -> (e ->> 'k'); v_n := (e ->> 'n')::int;
    if it -> 'price' = '{}'::jsonb then
      if v_n > coalesce((c ->> 'free_each')::int, 6) then raise exception 'too_many_items' using errcode = 'P0001'; end if;
    elsif v_n > coalesce((select qty from public.home_items where player_id = p_uid and item = e ->> 'k'), 0) then
      raise exception 'item_not_owned' using errcode = 'P0001';
    end if;
  end loop;
  return v_out;
end $$;

create or replace function private.home_check_style(p_style jsonb) returns jsonb language plpgsql stable as $$
declare s jsonb := private.home_cfg() -> 'styles'; v jsonb := '{}'::jsonb; k text;
begin
  if p_style is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p_style) <> 'object' then raise exception 'invalid_style' using errcode = 'P0001'; end if;
  foreach k in array array['wall', 'floor', 'view', 'mood'] loop
    if p_style ? k then
      if not (s -> k) ? (p_style ->> k) then raise exception 'invalid_style' using errcode = 'P0001'; end if;
      v := v || jsonb_build_object(k, p_style ->> k);
    end if;
  end loop;
  foreach k in array array['wall_color', 'floor_color', 'trim'] loop
    if p_style ? k then
      if (p_style ->> k) !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'invalid_style' using errcode = 'P0001'; end if;
      v := v || jsonb_build_object(k, upper(p_style ->> k));
    end if;
  end loop;
  return v;
end $$;

create or replace function public.home_save(p_name text, p_style jsonb, p_layout jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_name text;
begin
  perform private.rate_limit('home_save', 240, 3600);
  perform private.home_row(v_uid);
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null then
    v_name := private.chat_clean(v_name);
    if v_name is null or char_length(v_name) = 0 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
    v_name := left(v_name, 32);
  end if;
  update public.homes set name = v_name, style = private.home_check_style(p_style), layout = private.home_check_layout(v_uid, p_layout), updated_at = now()
   where player_id = v_uid;
  return public.home_get((select username from public.profiles where id = v_uid));
end $$;

create or replace function public.home_doors(p_doors jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v jsonb := '{}'::jsonb; r record;
begin
  perform private.rate_limit('home_save', 240, 3600);
  perform private.home_row(v_uid);
  for r in select key, value from jsonb_each_text(coalesce(p_doors, '{}'::jsonb)) loop
    if r.key not in ('arcade', 'habitat', 'farm', 'business') or r.value not in ('public', 'friends', 'hidden') then raise exception 'invalid_style' using errcode = 'P0001'; end if;
    v := v || jsonb_build_object(r.key, r.value);
  end loop;
  update public.homes set doors = doors || v, updated_at = now() where player_id = v_uid;
  return public.home_get((select username from public.profiles where id = v_uid));
end $$;

create or replace function public.home_buy(p_item text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); it jsonb := private.home_cfg() -> 'items' -> p_item; v_prev jsonb; v_res jsonb; v_t int;
begin
  perform private.rate_limit('home_buy', 300, 3600);
  if it is null or it -> 'price' = '{}'::jsonb then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'home_buy'); if v_prev is not null then return v_prev; end if;
  if (it -> 'price') ? 'tickets' then
    v_t := (it -> 'price' ->> 'tickets')::int;
    perform private.arc_player(v_uid);
    if (select tickets from public.arcade_players where player_id = v_uid) < v_t then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
    update public.arcade_players set tickets = tickets - v_t where player_id = v_uid;
  else
    perform private.charge(v_uid, it -> 'price', 'home_item', 'home', p_item, 'home-buy:' || v_uid || ':' || p_idempotency_key);
  end if;
  insert into public.home_items (player_id, item, qty) values (v_uid, p_item, 1)
  on conflict (player_id, item) do update set qty = home_items.qty + 1;
  v_res := jsonb_build_object('item', p_item, 'qty', (select qty from public.home_items where player_id = v_uid and item = p_item),
                              'balances', private.balances(v_uid), 'tickets', (select tickets from public.arcade_players where player_id = v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- the live room: up to 10 in a home at once (more spill into a second copy of the room)
create or replace function public.home_live(p_host uuid, p_x real default null, p_z real default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := private.home_cfg();
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  me public.home_presence%rowtype; v_shard int; v_new boolean := false;
begin
  perform private.rate_limit('home_live', 9000, 3600);
  if not exists (select 1 from public.profiles where id = p_host) or not private.visible_to(p_host, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('home-live:' || p_host));
  select * into me from public.home_presence where player_id = v_uid;
  if found and me.host_id = p_host and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    -- the owner always gets the first room; everyone else the fullest one with space
    if v_uid = p_host then v_shard := 0;
    else
      select shard into v_shard from public.home_presence
       where host_id = p_host and seen_at > now() - v_stale and player_id <> v_uid
       group by shard having count(*) < v_max order by bool_or(player_id = p_host) desc, count(*) desc, shard limit 1;
      if v_shard is null then
        select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
         where not exists (select 1 from public.home_presence where host_id = p_host and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
      end if;
    end if;
  end if;
  insert into public.home_presence (player_id, host_id, shard, x, z, joined_at, seen_at)
  values (v_uid, p_host, v_shard, greatest(-7, least(7, coalesce(p_x, 0))), greatest(-6, least(6, coalesce(p_z, 4.6))), now(), now())
  on conflict (player_id) do update set host_id = excluded.host_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else home_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else home_presence.z end),
    joined_at = case when v_new then now() else home_presence.joined_at end, seen_at = now();
  return jsonb_build_object('shard', v_shard, 'joined', v_new, 'room_size', v_max, 'channel', 'home:' || p_host || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z,
                  'explorer_style', (select explorer_style from public.profiles where id = p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.home_presence p
                where p.host_id = p_host and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_home', (select count(*) from public.home_presence where host_id = p_host and seen_at > now() - v_stale));
end $$;

create or replace function public.home_leave() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin delete from public.home_presence where player_id = private.require_active_player(); end $$;

do $$ declare f text; begin
  foreach f in array array['private.home_cfg()', 'private.home_row(uuid)', 'private.home_door_ok(jsonb, text, uuid, uuid)', 'private.home_places(uuid, uuid, text)',
    'private.home_check_layout(uuid, jsonb)', 'private.home_check_style(jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.home_get(text)', 'public.home_save(text, jsonb, jsonb)', 'public.home_doors(jsonb)', 'public.home_buy(text, text)',
    'public.home_live(uuid, real, real)', 'public.home_leave()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
