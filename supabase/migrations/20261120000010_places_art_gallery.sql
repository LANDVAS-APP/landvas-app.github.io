-- Places, part 1 (the Estates & Domains master plan, wave 1, step 1):
--   * one live room + chat system for every new place (the arcade's, generalised): rooms of up to 10 walking about,
--     positions streamed on a realtime channel, and a room chat that sits beside the global and party chats.
--   * Art's places: the Studio (any Art canvas: your easel, your mural through the window) and, through its double
--     doors, the Gallery (an Art Estate, the 'atelier' kind): an exhibition designer. Hang your own published art,
--     frame it, light it, write its plaque, open a week-long show; visitors admire pieces, which pays Renown (a place
--     currency that never turns into Ink or USD); Renown buys frames, lights, wall colours and rooms.
-- Nothing here pays Ink or touches rent.

-- ---- settings (admin.landvas.app edits these; every number is read live) ------------------------------------------
insert into public.game_config (key, value, description) values ('places', jsonb_build_object(
  'room_size', 10, 'stale_seconds', 12, 'chat_days', 2), 'Live rooms and room chat in the new places (wave 1+)')
on conflict (key) do nothing;

insert into public.game_config (key, value, description) values ('gallery', jsonb_build_object(
  'enabled', true,
  'rooms_start', 3, 'rooms_max', 5, 'room_prices', jsonb_build_array(300, 600),
  'show_days', 7, 'show_min_pieces', 3,
  'admire_owner_renown', 5, 'admire_visitor_renown', 1,
  'admire_owner_daily', 200, 'admire_visitor_daily', 20, 'admire_min_account_hours', 24,
  'show_renown_per_point', 2, 'show_renown_cap', 200,
  'charter_renown', 100,
  'frames', jsonb_build_object(
    'oak',     jsonb_build_object('name', 'Oak', 'price', 0, 'order', 1),
    'gilt',    jsonb_build_object('name', 'Gilt', 'price', 60, 'order', 2),
    'ebony',   jsonb_build_object('name', 'Ebony', 'price', 90, 'order', 3),
    'neon',    jsonb_build_object('name', 'Neon', 'price', 150, 'order', 4),
    'float',   jsonb_build_object('name', 'Floating glass', 'price', 220, 'order', 5),
    'baroque', jsonb_build_object('name', 'Baroque gold', 'price', 400, 'order', 6)),
  'lights', jsonb_build_object(
    'warm',     jsonb_build_object('name', 'Warm spot', 'price', 0, 'order', 1),
    'daylight', jsonb_build_object('name', 'Daylight', 'price', 40, 'order', 2),
    'cool',     jsonb_build_object('name', 'Cool spot', 'price', 80, 'order', 3),
    'rose',     jsonb_build_object('name', 'Rose gel', 'price', 120, 'order', 4),
    'violet',   jsonb_build_object('name', 'Violet gel', 'price', 160, 'order', 5)),
  'walls', jsonb_build_object(
    'white',    jsonb_build_object('name', 'Gallery white', 'price', 0, 'order', 1),
    'charcoal', jsonb_build_object('name', 'Charcoal', 'price', 80, 'order', 2),
    'sage',     jsonb_build_object('name', 'Sage', 'price', 80, 'order', 3),
    'oxblood',  jsonb_build_object('name', 'Oxblood', 'price', 140, 'order', 4),
    'midnight', jsonb_build_object('name', 'Midnight blue', 'price', 140, 'order', 5))
), 'The Gallery (Art Estate): rooms, shows, admires, Renown and the Renown shop')
on conflict (key) do nothing;

-- ---- art stays on Art's own tiers ----------------------------------------------------------------------------------
-- An Art Estate (the Gallery) and Domain (the Museum) grow out of the canvas: the land is still your mural, and the
-- Studio's easel paints it. Every other place keeps the rule that there's no art on it.
create or replace function private.no_art_on_habitat_trg() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.canvas_groups where id = new.group_id
              and (kind in ('habitat', 'farm', 'business', 'arcade', 'mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl')
                   or (private.estate_base(kind) is not null and private.estate_base(kind) <> 'canvas'))) then
    raise exception 'habitat_plot' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---- live rooms ---------------------------------------------------------------------------------------------------
create table if not exists public.place_presence (
  player_id uuid primary key references public.players (id) on delete cascade,
  place text not null,
  shard int not null default 0,
  x real not null default 0, z real not null default 0,
  act text,
  joined_at timestamptz not null default now(),
  -- a check-in holds your place for a lease past its own time (private.presence_lease(), as in the arcade and homes)
  seen_at timestamptz not null default now()
);
create index if not exists place_presence_room_idx on public.place_presence (place, shard, seen_at);
alter table public.place_presence enable row level security;
revoke all on public.place_presence from anon, authenticated;

create table if not exists public.place_chat (
  id bigserial primary key,
  place text not null,
  shard int not null default 0,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists place_chat_room_idx on public.place_chat (place, shard, id desc);
create index if not exists place_chat_player_idx on public.place_chat (player_id);
alter table public.place_chat enable row level security;
revoke all on public.place_chat from anon, authenticated;

/** whose place this is: 'studio:<group>' (any Art canvas) or 'gallery:<group>' (an Art Estate or Domain).
    Raises not_found for anything else, so a made-up key can't open a room. */
create or replace function private.place_host(p_place text) returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_kind text; v_id uuid; v_owner uuid; g record;
begin
  v_kind := split_part(coalesce(p_place, ''), ':', 1);
  begin v_id := split_part(p_place, ':', 2)::uuid; exception when others then raise exception 'not_found' using errcode = 'P0001'; end;
  if v_kind not in ('studio', 'gallery') or p_place <> v_kind || ':' || v_id then raise exception 'not_found' using errcode = 'P0001'; end if;
  select owner_id, kind into g from public.canvas_groups where id = v_id;
  if not found or g.owner_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_kind = 'studio' and coalesce(g.kind, 'canvas') not in ('canvas', 'atelier', 'museum') then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_kind = 'gallery' and coalesce(g.kind, 'canvas') not in ('atelier', 'museum') then raise exception 'not_found' using errcode = 'P0001'; end if;
  return g.owner_id;
end $$;

-- (helpers that read a table are PL/pgSQL so they keep their plan: see 20261119000520_efficiency.sql)
create or replace function private.place_room(p_uid uuid, p_place text) returns int language plpgsql stable as $$
#variable_conflict use_column
begin
  return (select shard from public.place_presence where player_id = p_uid and place = p_place
             and seen_at > now() - make_interval(secs => coalesce((private.cfg('places') ->> 'stale_seconds')::int, 12)) limit 1);
end $$;

/** the heartbeat: keeps your place in a room of this place (the fullest with space; your party's if it has space),
    and lists who's in it. Positions stream over `channel` between beats. */
create or replace function public.place_live(p_place text, p_x real default null, p_z real default null, p_act text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := coalesce(private.cfg('places'), '{}'::jsonb);
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  v_host uuid; me public.place_presence%rowtype; v_shard int; v_new boolean := false;
begin
  perform private.rate_limit('place_live', 9000, 3600);
  v_host := private.place_host(p_place);
  if not private.visible_to(v_host, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('place-live:' || p_place));
  select * into me from public.place_presence where player_id = v_uid;
  if found and me.place = p_place and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    -- your party is here: into their room, if it has space
    v_shard := (select p.shard from public.place_presence p join public.travel_group_members gm on gm.player_id = p.player_id
                 where gm.group_id = private.my_group(v_uid) and p.player_id <> v_uid and p.place = p_place and p.seen_at > now() - v_stale
                   and (select count(*) from public.place_presence q where q.place = p_place and q.shard = p.shard and q.seen_at > now() - v_stale and q.player_id <> v_uid) < v_max
                 limit 1);
    if v_shard is null then
      select shard into v_shard from public.place_presence
       where place = p_place and seen_at > now() - v_stale and player_id <> v_uid
       group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    end if;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
       where not exists (select 1 from public.place_presence where place = p_place and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
  end if;
  insert into public.place_presence (player_id, place, shard, x, z, act, joined_at, seen_at)
  values (v_uid, p_place, v_shard, greatest(-80, least(80, coalesce(p_x, 0))), greatest(-80, least(80, coalesce(p_z, 0))),
          left(p_act, 32), now(), now() + private.presence_lease())
  on conflict (player_id) do update set place = excluded.place, shard = excluded.shard,
    x = coalesce(greatest(-80, least(80, p_x)), case when v_new then excluded.x else place_presence.x end),
    z = coalesce(greatest(-80, least(80, p_z)), case when v_new then excluded.z else place_presence.z end),
    act = excluded.act, joined_at = case when v_new then now() else place_presence.joined_at end, seen_at = now() + private.presence_lease();
  return jsonb_build_object(
    'place', p_place, 'shard', v_shard, 'joined', v_new, 'room_size', v_max,
    'channel', 'place:' || p_place || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z, 'act', p.act) order by p.joined_at), '[]'::jsonb)
                from public.place_presence p
                where p.place = p_place and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_place', (select count(*) from public.place_presence where place = p_place and seen_at > now() - v_stale));
end $$;

create or replace function public.place_leave() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.place_presence where player_id = private.require_active_player();
end $$;

create or replace function private.place_chat_json(m public.place_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'kind', 'chat', 'player', private.profile_json(m.player_id))
$$;

create or replace function public.place_chat_send(p_place text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_shard int; v_muted timestamptz; v_body text; r public.place_chat%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  v_shard := private.place_room(v_uid, p_place);
  if v_shard is null then raise exception 'not_in_place' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('place_chat_burst', 1, 1);
  perform private.rate_limit('place_chat', 20, 60);
  perform private.rate_limit('place_chat_hour', 400, 3600);
  v_body := private.chat_clean(p_body);
  if char_length(v_body) > 200 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  insert into public.place_chat (place, shard, player_id, body) values (p_place, v_shard, v_uid, v_body) returning * into r;
  delete from public.place_chat where place = p_place and created_at < now() - make_interval(days => coalesce((private.cfg('places') ->> 'chat_days')::int, 2));
  return private.place_chat_json(r);
end $$;

create or replace function public.place_chat_list(p_place text, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_shard int := private.place_room(v_uid, p_place);
begin
  perform private.rate_limit('place_chat_list', 3000, 3600);
  if v_shard is null then return jsonb_build_object('items', '[]'::jsonb, 'shard', null, 'topic', null); end if;
  return jsonb_build_object('shard', v_shard, 'topic', 'pc:' || p_place || ':' || v_shard,
    'items', (select coalesce(jsonb_agg(private.place_chat_json(c) order by c.id), '[]'::jsonb)
      from (select * from public.place_chat c where c.place = p_place and c.shard = v_shard and c.id > coalesce(p_after, 0)
              and c.created_at > now() - interval '2 hours' and private.visible_to(c.player_id, v_uid) order by c.id desc limit 50) c));
end $$;

create or replace function private.push_place_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['pc:' || new.place || ':' || new.shard], 'chat');
  return null;
end $$;
drop trigger if exists place_chat_push on public.place_chat;
create trigger place_chat_push after insert on public.place_chat for each row execute function private.push_place_chat_trg();

-- ---- Renown (a place currency: earned in galleries and museums, spent on their looks; never Ink, never USD) ---------
create table if not exists public.player_renown (
  player_id uuid primary key references public.players (id) on delete cascade,
  renown bigint not null default 0 check (renown >= 0),
  earned bigint not null default 0,
  unlocks text[] not null default '{}',
  charter boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.player_renown enable row level security;
revoke all on public.player_renown from anon, authenticated;

create table if not exists public.renown_ledger (
  id bigserial primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  delta bigint not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists renown_ledger_player_idx on public.renown_ledger (player_id, created_at desc);
alter table public.renown_ledger enable row level security;
revoke all on public.renown_ledger from anon, authenticated;

create or replace function private.renown_add(p_uid uuid, p_delta bigint, p_reason text, p_ref text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v bigint;
begin
  insert into public.player_renown (player_id) values (p_uid) on conflict (player_id) do nothing;
  update public.player_renown set renown = renown + p_delta, earned = earned + greatest(p_delta, 0), updated_at = now()
   where player_id = p_uid and renown + p_delta >= 0 returning renown into v;
  if v is null then raise exception 'not_enough_renown' using errcode = 'P0001'; end if;
  insert into public.renown_ledger (player_id, delta, reason, ref) values (p_uid, p_delta, p_reason, p_ref);
  return v;
end $$;

-- ---- the Gallery ----------------------------------------------------------------------------------------------------
create table if not exists public.gallery_halls (
  group_id uuid primary key references public.canvas_groups (id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  rooms int not null default 3,
  room_walls jsonb not null default '{}'::jsonb,          -- room number (as text) -> wall colour id
  show_no int not null default 0,
  show_title text check (char_length(show_title) <= 48),
  show_opened_at timestamptz,
  show_closes_at timestamptz,
  piece_of_week uuid references public.artwork_publications (id) on delete set null,
  potw_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gallery_halls enable row level security;
revoke all on public.gallery_halls from anon, authenticated;

create table if not exists public.gallery_hangs (
  group_id uuid not null references public.canvas_groups (id) on delete cascade,
  slot text not null check (slot ~ '^r[1-9][lr][12]$'),
  publication_id uuid not null references public.artwork_publications (id) on delete cascade,
  frame text not null default 'oak',
  light text not null default 'warm',
  power int not null default 60 check (power between 0 and 100),
  aim int not null default 0 check (aim between -30 and 30),
  plaque_title text check (char_length(plaque_title) <= 60),
  plaque_story text check (char_length(plaque_story) <= 160),
  hung_at timestamptz not null default now(),
  primary key (group_id, slot)
);
create unique index if not exists gallery_hangs_once on public.gallery_hangs (group_id, publication_id);
alter table public.gallery_hangs enable row level security;
revoke all on public.gallery_hangs from anon, authenticated;

create table if not exists public.gallery_shows (
  group_id uuid not null references public.canvas_groups (id) on delete cascade,
  show_no int not null,
  title text,
  opened_at timestamptz not null,
  closes_at timestamptz not null,
  closed_at timestamptz,
  score jsonb,
  admires int not null default 0,
  renown int not null default 0,
  primary key (group_id, show_no)
);
alter table public.gallery_shows enable row level security;
revoke all on public.gallery_shows from anon, authenticated;

create table if not exists public.gallery_admires (
  publication_id uuid not null references public.artwork_publications (id) on delete cascade,
  visitor_id uuid not null references public.players (id) on delete cascade,
  day date not null,
  group_id uuid not null references public.canvas_groups (id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  owner_renown int not null default 0,
  visitor_renown int not null default 0,
  created_at timestamptz not null default now(),
  primary key (publication_id, visitor_id, day)
);
create index if not exists gallery_halls_owner_idx on public.gallery_halls (owner_id);
create index if not exists gallery_halls_potw_idx on public.gallery_halls (piece_of_week) where piece_of_week is not null;
create index if not exists gallery_hangs_publication_idx on public.gallery_hangs (publication_id);
create index if not exists gallery_admires_group_idx on public.gallery_admires (group_id, created_at desc);
create index if not exists gallery_admires_owner_day_idx on public.gallery_admires (owner_id, day);
create index if not exists gallery_admires_visitor_day_idx on public.gallery_admires (visitor_id, day);
alter table public.gallery_admires enable row level security;
revoke all on public.gallery_admires from anon, authenticated;

create or replace function private.gal_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('gallery'), '{}'::jsonb) $$;

/** the Estate (or Domain) group, its hall (made on first use) */
create or replace function private.gal_hall(p_group uuid) returns public.gallery_halls language plpgsql security definer set search_path = public, pg_temp as $$
declare g record; h public.gallery_halls%rowtype;
begin
  select id, owner_id, kind into g from public.canvas_groups where id = p_group;
  if not found or g.owner_id is null or coalesce(g.kind, 'canvas') not in ('atelier', 'museum') then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into h from public.gallery_halls where group_id = p_group;
  if not found then
    insert into public.gallery_halls (group_id, owner_id, rooms) values (p_group, g.owner_id, greatest(1, least(9, coalesce((private.gal_cfg() ->> 'rooms_start')::int, 3))))
    on conflict (group_id) do nothing;
    select * into h from public.gallery_halls where group_id = p_group;
  elsif h.owner_id <> g.owner_id then
    -- the land changed hands: the new owner gets the room, empty
    delete from public.gallery_hangs where group_id = p_group;
    update public.gallery_halls set owner_id = g.owner_id, show_title = null, show_opened_at = null, show_closes_at = null, piece_of_week = null, updated_at = now()
     where group_id = p_group returning * into h;
  end if;
  return h;
end $$;

/** has this player got this frame / light / wall (free ones always) */
create or replace function private.gal_has(p_uid uuid, p_cat text, p_id text) returns boolean language plpgsql stable as $$
#variable_conflict use_column
begin
  return coalesce((private.gal_cfg() -> p_cat -> p_id ->> 'price')::int, -1) = 0
      or exists (select 1 from public.player_renown where player_id = p_uid and (p_cat || ':' || p_id) = any (unlocks));
end $$;

/** how good the show on the walls is, out of 100, and what would make it better */
create or replace function private.gallery_score(p_group uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  h public.gallery_halls%rowtype; v_n int; v_slots int; v_plaques int; v_lit int; v_rooms2 int; v_needed int; v_frames int;
  s_fill int; s_plaq int; s_light int; s_flow int; s_frames int; tips jsonb := '[]'::jsonb;
begin
  select * into h from public.gallery_halls where group_id = p_group;
  v_slots := coalesce(h.rooms, 3) * 4;
  select count(*), count(*) filter (where coalesce(plaque_title, '') <> '' and coalesce(plaque_story, '') <> ''),
         count(*) filter (where power between 45 and 85), count(distinct frame)
    into v_n, v_plaques, v_lit, v_frames
    from public.gallery_hangs where group_id = p_group and substring(slot from 2 for 1)::int <= coalesce(h.rooms, 3);
  select count(*) into v_rooms2 from (select substring(slot from 2 for 1) r from public.gallery_hangs where group_id = p_group
                                       and substring(slot from 2 for 1)::int <= coalesce(h.rooms, 3) group by 1 having count(*) >= 2) x;
  v_needed := greatest(1, ceil(v_n / 4.0)::int);
  s_fill := round(30 * least(1.0, v_n / greatest(6.0, v_slots * 0.75)));
  s_plaq := case when v_n = 0 then 0 else round(15.0 * v_plaques / v_n) end;
  s_light := case when v_n = 0 then 0 else round(20.0 * v_lit / v_n) end;
  s_flow := case when v_n = 0 then 0 else round(20 * least(1.0, v_rooms2::numeric / v_needed)) end;
  s_frames := round(15 * least(1.0, greatest(0, v_frames - 1) / 2.0));
  if s_fill < 30 then tips := tips || to_jsonb(format('Hang %s more piece%s to fill the walls', ceil(greatest(6.0, v_slots * 0.75))::int - v_n, case when ceil(greatest(6.0, v_slots * 0.75))::int - v_n = 1 then '' else 's' end)); end if;
  if s_plaq < 15 and v_n > 0 then tips := tips || to_jsonb(format('Write a title and a story on %s more plaque%s', v_n - v_plaques, case when v_n - v_plaques = 1 then '' else 's' end)); end if;
  if s_light < 20 and v_n > 0 then tips := tips || to_jsonb('Gallery light sits between 45 and 85: too dim hides the paint, too bright washes it out'::text); end if;
  if s_flow < 20 and v_n > 0 then tips := tips || to_jsonb('Spread the show out: at least two pieces in each room you use'::text); end if;
  if s_frames < 15 then tips := tips || to_jsonb(case when v_frames <= 1 then 'Mix your frames: three different frames earn full marks' else 'One more kind of frame earns full marks' end); end if;
  return jsonb_build_object('total', s_fill + s_plaq + s_light + s_flow + s_frames, 'fill', s_fill, 'plaques', s_plaq, 'light', s_light, 'flow', s_flow,
    'frames', s_frames, 'pieces', v_n, 'slots', v_slots, 'tips', tips);
end $$;

/** a show whose week is up closes by itself (looked at whenever anyone opens the gallery), and pays its Renown once */
create or replace function private.gallery_settle(p_group uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.gallery_halls%rowtype; s jsonb; v_r int; c jsonb := private.gal_cfg();
begin
  select * into h from public.gallery_halls where group_id = p_group for update;
  if not found or h.show_closes_at is null or h.show_closes_at > now() then return; end if;
  perform private.gallery_close(p_group);
end $$;

create or replace function private.gallery_close(p_group uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.gallery_halls%rowtype; s jsonb; v_r int; c jsonb := private.gal_cfg(); v_adm int;
begin
  select * into h from public.gallery_halls where group_id = p_group for update;
  if not found or h.show_opened_at is null then return null; end if;
  s := private.gallery_score(p_group);
  v_r := least(coalesce((c ->> 'show_renown_cap')::int, 200), (s ->> 'total')::int * coalesce((c ->> 'show_renown_per_point')::int, 2));
  select count(*) into v_adm from public.gallery_admires where group_id = p_group and created_at >= h.show_opened_at;
  update public.gallery_shows set closed_at = now(), score = s, admires = v_adm, renown = v_r
   where group_id = p_group and show_no = h.show_no and closed_at is null;
  if found and v_r > 0 then perform private.renown_add(h.owner_id, v_r, 'gallery_show', p_group || ':' || h.show_no); end if;
  update public.gallery_halls set show_opened_at = null, show_closes_at = null, updated_at = now() where group_id = p_group;
  return jsonb_build_object('score', s, 'renown', v_r, 'admires', v_adm);
end $$;

/** a piece as the gallery shows it */
create or replace function private.gal_piece(p uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  return (select jsonb_build_object('id', a.id, 'title', a.title, 'preview_path', coalesce(a.preview_path, a.thumb_path), 'thumb_path', a.thumb_path,
           'w', coalesce(a.preview_width, 256), 'h', coalesce(a.preview_height, 256), 'plots', a.plot_count,
           'artist', (select username from public.profiles where id = a.owner_id), 'appreciations', a.appreciation_count,
           'craft', a.craft_score)
    from public.artwork_publications a where a.id = p limit 1);
end $$;

/** everything the Studio and Gallery need in one call */
create or replace function public.art_place(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); g record; v_kind text; v_mine boolean; h public.gallery_halls%rowtype; c jsonb := private.gal_cfg();
  v_mural jsonb; v_realm uuid; v_acclaim numeric; v_day date := (private.day_start(now()) at time zone 'UTC')::date; out jsonb; v_charter boolean;
begin
  perform private.rate_limit('art_place', 2000, 3600);
  select id, owner_id, kind, name, plot_count into g from public.canvas_groups where id = p_group;
  v_kind := coalesce(g.kind, 'canvas');
  if not found or g.owner_id is null or v_kind not in ('canvas', 'atelier', 'museum') or not private.visible_to(g.owner_id, v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_mine := g.owner_id = v_uid;
  select jsonb_build_object('id', a.id, 'title', a.title, 'preview_path', coalesce(a.preview_path, a.thumb_path), 'w', coalesce(a.preview_width, 256), 'h', coalesce(a.preview_height, 256))
    into v_mural from public.artwork_publications a where a.group_id = p_group and a.status = 'published' order by a.published_at desc nulls last limit 1;
  select id into v_realm from public.realms where group_id = p_group and kind = v_kind;
  insert into public.player_renown (player_id) values (v_uid) on conflict (player_id) do nothing;
  if v_kind in ('atelier', 'museum') then
    h := private.gal_hall(p_group);
    perform private.gallery_settle(p_group);
    select * into h from public.gallery_halls where group_id = p_group;
    if v_mine then
      -- the old Atelier's currency (acclaim) is Renown now: it moves over, every time, so Hue Hunter's pay lands here
      select coalesce((wallet ->> 'acclaim')::numeric, 0) into v_acclaim from public.realm_players where player_id = v_uid and kind = 'atelier';
      if coalesce(v_acclaim, 0) >= 1 then
        update public.realm_players set wallet = jsonb_set(wallet, '{acclaim}', to_jsonb(v_acclaim - floor(v_acclaim))) where player_id = v_uid and kind = 'atelier';
        perform private.renown_add(v_uid, floor(v_acclaim)::bigint, 'acclaim', 'atelier');
      end if;
      -- the first Gallery comes with a little Renown to start (once per player)
      select charter into v_charter from public.player_renown where player_id = v_uid;
      if not coalesce(v_charter, false) then
        update public.player_renown set charter = true where player_id = v_uid;
        perform private.renown_add(v_uid, coalesce((c ->> 'charter_renown')::int, 100), 'charter', p_group::text);
      end if;
    end if;
  end if;
  out := jsonb_build_object(
    'group_id', g.id, 'name', g.name, 'kind', v_kind, 'plots', g.plot_count, 'mine', v_mine,
    'tier', case when v_kind in ('atelier', 'museum') then 'gallery' else 'studio' end,
    'owner', private.profile_json(g.owner_id), 'mural', v_mural, 'realm_id', v_realm,
    'me', (select jsonb_build_object('renown', r.renown, 'unlocks', to_jsonb(r.unlocks)) from public.player_renown r where r.player_id = v_uid),
    'server_time', now(),
    'cfg', jsonb_build_object('frames', c -> 'frames', 'lights', c -> 'lights', 'walls', c -> 'walls', 'room_prices', c -> 'room_prices',
                              'rooms_max', c -> 'rooms_max', 'show_days', c -> 'show_days', 'show_min_pieces', c -> 'show_min_pieces',
                              'admire_owner_renown', c -> 'admire_owner_renown', 'admire_visitor_renown', c -> 'admire_visitor_renown'));
  if v_kind in ('atelier', 'museum') then
    out := out || jsonb_build_object('hall', jsonb_build_object(
      'rooms', h.rooms, 'room_walls', h.room_walls,
      'show', case when h.show_opened_at is not null then jsonb_build_object('no', h.show_no, 'title', h.show_title, 'opened_at', h.show_opened_at, 'closes_at', h.show_closes_at,
                     'admires', (select count(*) from public.gallery_admires where group_id = p_group and created_at >= h.show_opened_at)) end,
      'last_show', (select jsonb_build_object('no', s.show_no, 'title', s.title, 'score', s.score, 'admires', s.admires, 'renown', s.renown, 'closed_at', s.closed_at)
                      from public.gallery_shows s where s.group_id = p_group and s.closed_at is not null order by s.show_no desc limit 1),
      'score', private.gallery_score(p_group),
      'piece_of_week', case when h.piece_of_week is not null then private.gal_piece(h.piece_of_week) end,
      'hangs', (select coalesce(jsonb_agg(jsonb_build_object('slot', x.slot, 'frame', x.frame, 'light', x.light, 'power', x.power, 'aim', x.aim,
                       'plaque_title', x.plaque_title, 'plaque_story', x.plaque_story, 'piece', private.gal_piece(x.publication_id),
                       'admires', (select count(*) from public.gallery_admires a where a.publication_id = x.publication_id and a.group_id = p_group),
                       'admired', exists (select 1 from public.gallery_admires a where a.publication_id = x.publication_id and a.visitor_id = v_uid and a.day = v_day))
                     order by x.slot), '[]'::jsonb)
                from public.gallery_hangs x where x.group_id = p_group)));
  end if;
  if v_mine then
    out := out || jsonb_build_object('works', (select coalesce(jsonb_agg(private.gal_piece(a.id) || jsonb_build_object('status', a.status, 'published_at', a.published_at)
                                                  order by a.published_at desc nulls last), '[]'::jsonb)
                                         from public.artwork_publications a
                                        where a.owner_id = v_uid and a.status in ('published', 'superseded') and coalesce(a.preview_path, a.thumb_path) is not null));
  end if;
  return out;
end $$;

create or replace function private.gal_owner(p_group uuid) returns public.gallery_halls language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.gallery_halls%rowtype;
begin
  if not coalesce((private.gal_cfg() ->> 'enabled')::boolean, true) then raise exception 'gallery_closed' using errcode = 'P0001'; end if;
  h := private.gal_hall(p_group);
  if h.owner_id <> private.require_active_player() then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return h;
end $$;

create or replace function public.gallery_hang(p_group uuid, p_slot text, p_publication uuid, p_frame text, p_light text, p_power int, p_aim int,
                                               p_title text default null, p_story text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.gallery_halls%rowtype; a record;
begin
  perform private.rate_limit('gallery_edit', 600, 3600);
  h := private.gal_owner(p_group);
  if p_slot !~ '^r[1-9][lr][12]$' or substring(p_slot from 2 for 1)::int > h.rooms then raise exception 'bad_slot' using errcode = 'P0001'; end if;
  select id, owner_id, status, coalesce(preview_path, thumb_path) as img into a from public.artwork_publications where id = p_publication;
  if not found or a.owner_id <> v_uid or a.status not in ('published', 'superseded') or a.img is null then raise exception 'not_your_art' using errcode = 'P0001'; end if;
  if not private.gal_has(v_uid, 'frames', coalesce(p_frame, 'oak')) then raise exception 'locked_frame' using errcode = 'P0001'; end if;
  if not private.gal_has(v_uid, 'lights', coalesce(p_light, 'warm')) then raise exception 'locked_light' using errcode = 'P0001'; end if;
  -- a piece hangs once: moving it frees its old spot
  delete from public.gallery_hangs where group_id = p_group and publication_id = p_publication and slot <> p_slot;
  insert into public.gallery_hangs (group_id, slot, publication_id, frame, light, power, aim, plaque_title, plaque_story, hung_at)
  values (p_group, p_slot, p_publication, coalesce(p_frame, 'oak'), coalesce(p_light, 'warm'), greatest(0, least(100, coalesce(p_power, 60))),
          greatest(-30, least(30, coalesce(p_aim, 0))), nullif(left(btrim(coalesce(p_title, '')), 60), ''), nullif(left(btrim(coalesce(p_story, '')), 160), ''), now())
  on conflict (group_id, slot) do update set publication_id = excluded.publication_id, frame = excluded.frame, light = excluded.light, power = excluded.power,
    aim = excluded.aim, plaque_title = excluded.plaque_title, plaque_story = excluded.plaque_story,
    hung_at = case when gallery_hangs.publication_id = excluded.publication_id then gallery_hangs.hung_at else now() end;
  return public.art_place(p_group);
end $$;

create or replace function public.gallery_unhang(p_group uuid, p_slot text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.rate_limit('gallery_edit', 600, 3600);
  perform private.gal_owner(p_group);
  delete from public.gallery_hangs where group_id = p_group and slot = p_slot;
  update public.gallery_halls set piece_of_week = null where group_id = p_group
     and piece_of_week is not null and not exists (select 1 from public.gallery_hangs where group_id = p_group and publication_id = gallery_halls.piece_of_week);
  return public.art_place(p_group);
end $$;

/** the Renown shop: 'frames:gilt', 'lights:rose', 'walls:sage' (yours, for every gallery you have) */
create or replace function public.gallery_buy(p_group uuid, p_item text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_cat text := split_part(p_item, ':', 1); v_id text := split_part(p_item, ':', 2); v_price int;
begin
  perform private.rate_limit('gallery_buy', 120, 3600);
  perform private.gal_owner(p_group);
  if v_cat not in ('frames', 'lights', 'walls') then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_price := (private.gal_cfg() -> v_cat -> v_id ->> 'price')::int;
  if v_price is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if private.gal_has(v_uid, v_cat, v_id) then raise exception 'already_yours' using errcode = 'P0001'; end if;
  perform private.renown_add(v_uid, -v_price, 'shop', p_item);
  update public.player_renown set unlocks = array_append(unlocks, p_item) where player_id = v_uid;
  return public.art_place(p_group);
end $$;

create or replace function public.gallery_add_room(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.gallery_halls%rowtype; c jsonb := private.gal_cfg(); v_price int;
begin
  perform private.rate_limit('gallery_buy', 120, 3600);
  h := private.gal_owner(p_group);
  if h.rooms >= coalesce((c ->> 'rooms_max')::int, 5) then raise exception 'max_rooms' using errcode = 'P0001'; end if;
  v_price := (c -> 'room_prices' ->> (h.rooms - coalesce((c ->> 'rooms_start')::int, 3)))::int;
  if v_price is null then raise exception 'max_rooms' using errcode = 'P0001'; end if;
  perform private.renown_add(v_uid, -v_price, 'room', p_group || ':' || (h.rooms + 1));
  update public.gallery_halls set rooms = rooms + 1, updated_at = now() where group_id = p_group;
  return public.art_place(p_group);
end $$;

create or replace function public.gallery_wall(p_group uuid, p_room int, p_wall text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.gallery_halls%rowtype;
begin
  perform private.rate_limit('gallery_edit', 600, 3600);
  h := private.gal_owner(p_group);
  if p_room < 1 or p_room > h.rooms then raise exception 'bad_slot' using errcode = 'P0001'; end if;
  if not private.gal_has(v_uid, 'walls', p_wall) then raise exception 'locked_wall' using errcode = 'P0001'; end if;
  update public.gallery_halls set room_walls = room_walls || jsonb_build_object(p_room::text, p_wall), updated_at = now() where group_id = p_group;
  return public.art_place(p_group);
end $$;

create or replace function public.gallery_open_show(p_group uuid, p_title text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.gallery_halls%rowtype; c jsonb := private.gal_cfg(); s jsonb; v_no int;
begin
  perform private.rate_limit('gallery_show', 30, 3600);
  h := private.gal_owner(p_group);
  perform private.gallery_settle(p_group);
  select * into h from public.gallery_halls where group_id = p_group;
  if h.show_opened_at is not null then raise exception 'show_running' using errcode = 'P0001'; end if;
  s := private.gallery_score(p_group);
  if (s ->> 'pieces')::int < coalesce((c ->> 'show_min_pieces')::int, 3) then raise exception 'show_too_small' using errcode = 'P0001'; end if;
  v_no := h.show_no + 1;
  update public.gallery_halls set show_no = v_no, show_title = nullif(left(btrim(coalesce(p_title, '')), 48), ''), show_opened_at = now(),
         show_closes_at = now() + make_interval(days => coalesce((c ->> 'show_days')::int, 7)), updated_at = now()
   where group_id = p_group;
  insert into public.gallery_shows (group_id, show_no, title, opened_at, closes_at)
  values (p_group, v_no, nullif(left(btrim(coalesce(p_title, '')), 48), ''), now(), now() + make_interval(days => coalesce((c ->> 'show_days')::int, 7)));
  return public.art_place(p_group);
end $$;

create or replace function public.gallery_close_show(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  perform private.rate_limit('gallery_show', 30, 3600);
  perform private.gal_owner(p_group);
  r := private.gallery_close(p_group);
  if r is null then raise exception 'no_show' using errcode = 'P0001'; end if;
  return public.art_place(p_group) || jsonb_build_object('closed', r);
end $$;

/** a visitor stands in front of a piece and admires it: once a day per piece. Renown for both (accounts old enough,
    with land of their own, within each day's limit); the owner never admires their own. */
create or replace function public.gallery_admire(p_group uuid, p_publication uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); h public.gallery_halls%rowtype; c jsonb := private.gal_cfg();
  v_day date := (private.day_start(now()) at time zone 'UTC')::date; v_o int := 0; v_v int := 0; v_ok boolean;
begin
  perform private.rate_limit('gallery_admire', 240, 3600);
  h := private.gal_hall(p_group);
  if h.owner_id = v_uid then raise exception 'own_gallery' using errcode = 'P0001'; end if;
  if not private.visible_to(h.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.gallery_hangs where group_id = p_group and publication_id = p_publication) then raise exception 'not_hung' using errcode = 'P0001'; end if;
  if private.place_room(v_uid, 'gallery:' || p_group) is null then raise exception 'not_in_place' using errcode = 'P0001'; end if;
  if exists (select 1 from public.gallery_admires where publication_id = p_publication and visitor_id = v_uid and day = v_day) then raise exception 'already_admired' using errcode = 'P0001'; end if;
  v_ok := private.old_enough(v_uid, coalesce((c ->> 'admire_min_account_hours')::numeric, 24)) and exists (select 1 from public.world_plots where owner_id = v_uid);
  if v_ok then
    if (select coalesce(sum(owner_renown), 0) from public.gallery_admires where owner_id = h.owner_id and day = v_day) < coalesce((c ->> 'admire_owner_daily')::int, 200) then
      v_o := coalesce((c ->> 'admire_owner_renown')::int, 5);
    end if;
    if (select coalesce(sum(visitor_renown), 0) from public.gallery_admires where visitor_id = v_uid and day = v_day) < coalesce((c ->> 'admire_visitor_daily')::int, 20) then
      v_v := coalesce((c ->> 'admire_visitor_renown')::int, 1);
    end if;
  end if;
  insert into public.gallery_admires (publication_id, visitor_id, day, group_id, owner_id, owner_renown, visitor_renown)
  values (p_publication, v_uid, v_day, p_group, h.owner_id, v_o, v_v);
  if v_o > 0 then perform private.renown_add(h.owner_id, v_o, 'admired', p_publication::text); end if;
  if v_v > 0 then perform private.renown_add(v_uid, v_v, 'admire', p_publication::text); end if;
  return jsonb_build_object('owner_renown', v_o, 'renown', v_v,
    'admires', (select count(*) from public.gallery_admires where publication_id = p_publication and group_id = p_group),
    'me', (select renown from public.player_renown where player_id = v_uid));
end $$;

create or replace function public.gallery_potw(p_group uuid, p_publication uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.rate_limit('gallery_edit', 600, 3600);
  perform private.gal_owner(p_group);
  if p_publication is not null and not exists (select 1 from public.gallery_hangs where group_id = p_group and publication_id = p_publication) then
    raise exception 'not_hung' using errcode = 'P0001';
  end if;
  update public.gallery_halls set piece_of_week = p_publication, potw_at = case when p_publication is null then null else now() end, updated_at = now() where group_id = p_group;
  return public.art_place(p_group);
end $$;

/** the plot panel's card: what's on in this gallery (anyone who can see the land) */
create or replace function public.gallery_card(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.gallery_halls%rowtype; g record;
begin
  perform private.rate_limit('gallery_card', 3000, 3600);
  select owner_id, kind into g from public.canvas_groups where id = p_group;
  if not found or g.owner_id is null or not private.visible_to(g.owner_id, v_uid) then return null; end if;
  if coalesce(g.kind, 'canvas') not in ('atelier', 'museum') then return jsonb_build_object('tier', 'studio'); end if;
  select * into h from public.gallery_halls where group_id = p_group;
  return jsonb_build_object('tier', 'gallery',
    'pieces', (select count(*) from public.gallery_hangs where group_id = p_group),
    'show', case when h.show_opened_at is not null and h.show_closes_at > now() then jsonb_build_object('title', h.show_title, 'closes_at', h.show_closes_at) end,
    'piece_of_week', case when h.piece_of_week is not null then private.gal_piece(h.piece_of_week) end,
    'here', (select count(*) from public.place_presence where place = 'gallery:' || p_group
               and seen_at > now() - make_interval(secs => coalesce((private.cfg('places') ->> 'stale_seconds')::int, 12))));
end $$;

grant execute on function public.place_live(text, real, real, text), public.place_leave(), public.place_chat_send(text, text), public.place_chat_list(text, bigint),
  public.art_place(uuid), public.gallery_hang(uuid, text, uuid, text, text, int, int, text, text), public.gallery_unhang(uuid, text),
  public.gallery_buy(uuid, text), public.gallery_add_room(uuid), public.gallery_wall(uuid, int, text), public.gallery_open_show(uuid, text),
  public.gallery_close_show(uuid), public.gallery_admire(uuid, uuid), public.gallery_potw(uuid, uuid), public.gallery_card(uuid) to authenticated;
