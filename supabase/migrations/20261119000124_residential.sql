-- v0.9.6 Residential plots, with the game's first subplots.
--
-- A Residential plot is one of two subplots (kinds of their own, so they merge only with their own kind):
--   🏠 Home      the house on your profile. Visitors can only walk into a player's house once they have a Home
--                subplot (players from before today keep theirs). The house grows with the land: the biggest
--                square of Home plots (1x1 … 10x10) sets its size, and every size up unlocks something — a second
--                floor and stairs, a third floor, balconies, more floors, a roof terrace, a lift, a rooftop pool.
--                Checking in at someone's house now means signing their check-in book: a note or a drawing.
--   🏘️ Landlord  houses rented to virtual tenants. On the 1st of every month (UTC) rent day comes round: Landlord
--                plots earn 50x their USD rent for the whole day, then back to normal for the rest of the month.
-- Switching a plot between Home and Landlord is free.

-- ---- the two subplots -------------------------------------------------------------------------------------------
insert into public.plot_kinds (id, name, description, sort, enabled) values
  ('home', 'Residential · Home', 'Your home: the house visitors walk into from your profile. Merge Home plots into bigger squares (up to 10x10) to grow it.', 11, true),
  ('landlord', 'Residential · Landlord', 'Houses rented to virtual tenants: on the 1st of every month these plots earn 50x USD rent all day.', 12, true)
on conflict (id) do update set name = excluded.name, description = excluded.description, sort = excluded.sort, enabled = true;

insert into public.game_config (key, value) values ('residential', $cfg${
  "landlord_mult": 50,
  "items_base": 90, "items_per_level": 45,
  "sizes": [
    {"size": 1,  "name": "Cottage",          "floors": 1, "balcony": false, "roof": false, "elevator": false, "pool": false, "unlock": "A cosy one-room home"},
    {"size": 2,  "name": "Two-Storey House", "floors": 2, "balcony": false, "roof": false, "elevator": false, "pool": false, "unlock": "An upstairs floor and a staircase"},
    {"size": 3,  "name": "Townhouse",        "floors": 3, "balcony": false, "roof": false, "elevator": false, "pool": false, "unlock": "A third floor"},
    {"size": 4,  "name": "Balcony House",    "floors": 3, "balcony": true,  "roof": false, "elevator": false, "pool": false, "unlock": "Balconies on the upper floors"},
    {"size": 5,  "name": "Manor",            "floors": 4, "balcony": true,  "roof": false, "elevator": false, "pool": false, "unlock": "A fourth floor"},
    {"size": 6,  "name": "Terrace Manor",    "floors": 4, "balcony": true,  "roof": true,  "elevator": false, "pool": false, "unlock": "An open-air roof terrace"},
    {"size": 7,  "name": "Mansion",          "floors": 5, "balcony": true,  "roof": true,  "elevator": false, "pool": false, "unlock": "A fifth floor"},
    {"size": 8,  "name": "Grand Mansion",    "floors": 5, "balcony": true,  "roof": true,  "elevator": true,  "pool": false, "unlock": "A lift to every floor"},
    {"size": 9,  "name": "Sky Tower",        "floors": 6, "balcony": true,  "roof": true,  "elevator": true,  "pool": false, "unlock": "A sixth floor"},
    {"size": 10, "name": "Penthouse Tower",  "floors": 6, "balcony": true,  "roof": true,  "elevator": true,  "pool": true,  "unlock": "A rooftop pool"}
  ]
}$cfg$::jsonb) on conflict (key) do update set value = excluded.value;

-- players from before today keep a visitable house without a Home subplot
alter table public.homes add column if not exists legacy boolean not null default false;
insert into public.homes (player_id, legacy) select id, true from public.players on conflict (player_id) do update set legacy = true;

-- ---- the house ----------------------------------------------------------------------------------------------------
/** the biggest n x n square (up to 10) of a group's plots */
create or replace function private.house_size_of(p_group uuid) returns int language plpgsql stable as $$
declare n int; p int;
begin
  if p_group is null then return 0; end if;
  select plot_count into p from public.canvas_groups where id = p_group;
  n := least(10, floor(sqrt(greatest(coalesce(p, 1), 1)))::int);
  while n > 1 loop
    if private.group_has_square(p_group, n) then return n; end if;
    n := n - 1;
  end loop;
  return 1;
end $$;

/** a player's home: their biggest Home subplot */
create or replace function private.home_group(p_uid uuid) returns uuid language sql stable as $$
  select g.id from public.canvas_groups g
   where g.owner_id = p_uid and g.kind = 'home' and g.status = 'active'
   order by private.house_size_of(g.id) desc, g.plot_count desc, g.created_at
   limit 1
$$;

/** everything about a player's house: may it be visited, how big it is, what it has, what the next size adds */
create or replace function private.house_json(p_uid uuid) returns jsonb language plpgsql stable as $$
declare c jsonb := private.cfg('residential'); g uuid := private.home_group(p_uid); n int; s jsonb; v_legacy boolean; v_levels int;
begin
  select legacy into v_legacy from public.homes where player_id = p_uid;
  v_legacy := coalesce(v_legacy, false);
  n := greatest(1, coalesce(private.house_size_of(g), 1));
  s := c -> 'sizes' -> (n - 1);
  v_levels := (s ->> 'floors')::int + case when (s ->> 'roof')::boolean then 1 else 0 end;
  return jsonb_build_object(
    'has_home', g is not null, 'legacy', v_legacy, 'allowed', g is not null or v_legacy,
    'group_id', g, 'plots', coalesce((select plot_count from public.canvas_groups where id = g), 0),
    'size', n, 'name', s ->> 'name', 'floors', (s ->> 'floors')::int,
    'balcony', (s ->> 'balcony')::boolean, 'roof', (s ->> 'roof')::boolean, 'elevator', (s ->> 'elevator')::boolean, 'pool', (s ->> 'pool')::boolean,
    'levels', v_levels,
    'max_items', coalesce((c ->> 'items_base')::int, 90) + coalesce((c ->> 'items_per_level')::int, 45) * (v_levels - 1),
    'next', case when n < 10 then c -> 'sizes' -> n end,
    'ladder', c -> 'sizes');
end $$;

/** a player's house, for their profile: may you go in, and how big is it */
create or replace function public.home_status(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_id uuid; h jsonb;
begin
  select id into v_id from public.profiles where lower(username) = lower(btrim(coalesce(p_username, '')));
  if v_id is null or not private.visible_to(v_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  h := private.house_json(v_id);
  return jsonb_build_object('own', v_id = v_uid, 'allowed', (h ->> 'allowed')::boolean, 'has_home', (h ->> 'has_home')::boolean,
    'size', (h ->> 'size')::int, 'name', h ->> 'name', 'floors', (h ->> 'floors')::int);
end $$;

-- a Home plot makes sure its owner's house exists
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.ensure_kind_row(uuid,uuid,text)'::regprocedure);
  n := replace(d, '  if p_kind = ''habitat'' and not exists', '  if p_kind = ''home'' then perform private.home_row(p_owner); end if;' || chr(10) || '  if p_kind = ''habitat'' and not exists');
  if n = d then raise exception 'residential: ensure_kind_row anchor not found'; end if;
  execute n;
end $$;

-- switching between Home and Landlord is free; and rent is settled first (Landlord plots earn on their own clock)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.set_group_kind(uuid,text)'::regprocedure);
  n := replace(d, 'private.kind_family(p_kind)' || chr(10) || '     and (g.kind_changed_at',
                  'private.kind_family(p_kind)' || chr(10) || '     and not (g.kind in (''home'', ''landlord'') and p_kind in (''home'', ''landlord''))' || chr(10) || '     and (g.kind_changed_at');
  n := replace(n, '  perform private.rate_limit(''set_group_kind'', 60, 3600);', '  perform private.rate_limit(''set_group_kind'', 60, 3600);' || chr(10) || '  perform private.rent_settle(v_uid);');
  if n = d or position('''home'', ''landlord''' in n) = 0 or position('rent_settle' in n) = 0 then raise exception 'residential: set_group_kind anchors not found'; end if;
  execute n;
end $$;

-- ---- visiting: only a house that exists --------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.home_get(text)'::regprocedure);
  n := replace(d, '  v_own := v_id = v_uid;',
    '  v_own := v_id = v_uid;' || chr(10) || '  if not v_own and not coalesce((private.house_json(v_id) ->> ''allowed'')::boolean, false) then raise exception ''no_home'' using errcode = ''P0001''; end if;');
  n := replace(n, '''own'', v_own, ''name'', h.name,', '''own'', v_own, ''house'', private.house_json(v_id), ''name'', h.name,');
  if n = d or position('no_home' in n) = 0 or position('''house''' in n) = 0 then raise exception 'residential: home_get anchors not found'; end if;
  execute n;
end $$;

-- the furniture: more of it in a bigger house, and on every floor (each piece says which: "f", 0 = ground)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.home_check_layout(uuid,jsonb)'::regprocedure);
  n := replace(d, 'declare c jsonb := private.home_cfg();',
    'declare hj jsonb := private.house_json(p_uid); v_levels int := coalesce((hj ->> ''levels'')::int, 1); v_balcony boolean := coalesce((hj ->> ''balcony'')::boolean, false); v_f int; c jsonb := private.home_cfg();');
  n := replace(n, '> coalesce((c ->> ''max_items'')::int, 90) then', '> coalesce((hj ->> ''max_items'')::int, 90) then');
  n := replace(n, '    x := round((e ->> ''x'')::numeric, 2);',
    '    v_f := least(greatest(case when jsonb_typeof(e -> ''f'') = ''number'' then floor((e ->> ''f'')::numeric)::int else 0 end, 0), v_levels - 1);' || chr(10) || '    x := round((e ->> ''x'')::numeric, 2);');
  -- upstairs there are no doors to keep clear, and a balcony out the front
  n := replace(n, 'elsif x < -5.4 or x > 6.7 or z < -5.7 or z > 5.7 then',
    'elsif x < (case when v_f > 0 then -6.7 else -5.4 end) or x > 6.7 or z < -5.7 or z > (case when v_f > 0 and v_balcony then 7.7 else 5.7 end) then');
  n := replace(n, 'jsonb_build_object(''i'', e ->> ''i'', ''x'', x, ''z'', z, ''r'', r)',
    'jsonb_build_object(''i'', e ->> ''i'', ''x'', x, ''z'', z, ''r'', r) || case when v_f > 0 then jsonb_build_object(''f'', v_f) else ''{}''::jsonb end');
  n := replace(n, 'coalesce((c ->> ''free_each'')::int, 6) then', 'coalesce((c ->> ''free_each'')::int, 6) * v_levels then');
  if position('hj ->> ''max_items''' in n) = 0 or position('v_f := least' in n) = 0 or position('then -6.7 else' in n) = 0
     or position('jsonb_build_object(''f'', v_f)' in n) = 0 or position('* v_levels then' in n) = 0 then
    raise exception 'residential: home_check_layout anchors not found';
  end if;
  execute n;
end $$;

-- who's on which floor, live
alter table public.home_presence add column if not exists f smallint not null default 0;
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.home_live(uuid,real,real)'::regprocedure);
  n := replace(d, 'p_z real DEFAULT NULL::real)', 'p_z real DEFAULT NULL::real, p_f integer DEFAULT NULL::integer)');
  n := replace(n, '  v_clan := exists (select 1 from public.clans where id = p_host);',
    '  v_clan := exists (select 1 from public.clans where id = p_host);' || chr(10) ||
    '  if not v_clan and p_host <> v_uid and not coalesce((private.house_json(p_host) ->> ''allowed'')::boolean, false) then raise exception ''no_home'' using errcode = ''P0001''; end if;');
  n := replace(n, 'insert into public.home_presence (player_id, host_id, shard, x, z, joined_at, seen_at)', 'insert into public.home_presence (player_id, host_id, shard, x, z, f, joined_at, seen_at)');
  n := replace(n, 'greatest(-6, least(6, coalesce(p_z, 4.6))), now(),', 'greatest(-6, least(8.5, coalesce(p_z, 4.6))), greatest(0, least(9, coalesce(p_f, 0))), now(),');
  n := replace(n, '    joined_at = case when v_new then now() else home_presence.joined_at end,',
    '    f = coalesce(p_f, case when v_new then excluded.f else home_presence.f end), joined_at = case when v_new then now() else home_presence.joined_at end,');
  n := replace(n, 'jsonb_build_object(''x'', p.x, ''z'', p.z,', 'jsonb_build_object(''x'', p.x, ''z'', p.z, ''f'', p.f,');
  if position('p_f integer' in n) = 0 or position('no_home' in n) = 0 or position('x, z, f, joined_at' in n) = 0 or position('least(8.5' in n) = 0
     or position('f = coalesce(p_f' in n) = 0 or position('''f'', p.f' in n) = 0 then
    raise exception 'residential: home_live anchors not found';
  end if;
  drop function public.home_live(uuid, real, real);
  execute n;
end $$;
revoke all on function public.home_live(uuid, real, real, integer) from public, anon;
grant execute on function public.home_live(uuid, real, real, integer) to authenticated;
revoke all on function public.home_status(text) from public, anon;
grant execute on function public.home_status(text) to authenticated;

-- ---- the check-in book: a note or a drawing -------------------------------------------------------------------
alter table public.room_notes add column if not exists drawing jsonb;
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.room_notes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%char_length(body)%' loop
    execute format('alter table public.room_notes drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.room_notes add constraint room_notes_body_check check (char_length(body) <= 140 and (char_length(body) >= 1 or drawing is not null));

/** a drawing for the book: strokes of whole-number points on a 400 x 300 page, a few thousand points at most */
create or replace function private.clean_drawing(p jsonb) returns jsonb language plpgsql immutable as $$
declare st jsonb; v_out jsonb := '[]'::jsonb; arr jsonb; n int := 0; c text; w int;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 's') <> 'array' or jsonb_array_length(p -> 's') = 0 then return null; end if;
  if jsonb_array_length(p -> 's') > 160 then raise exception 'drawing_too_big' using errcode = 'P0001'; end if;
  for st in select * from jsonb_array_elements(p -> 's') loop
    if jsonb_typeof(st) <> 'object' then raise exception 'invalid_drawing' using errcode = 'P0001'; end if;
    c := st ->> 'c';
    if c is null or c !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'invalid_drawing' using errcode = 'P0001'; end if;
    if jsonb_typeof(st -> 'w') <> 'number' then raise exception 'invalid_drawing' using errcode = 'P0001'; end if;
    w := round((st ->> 'w')::numeric)::int;
    if w not between 1 and 30 then raise exception 'invalid_drawing' using errcode = 'P0001'; end if;
    arr := st -> 'p';
    if jsonb_typeof(arr) <> 'array' or jsonb_array_length(arr) < 2 or jsonb_array_length(arr) % 2 = 1 then raise exception 'invalid_drawing' using errcode = 'P0001'; end if;
    n := n + jsonb_array_length(arr) / 2;
    if n > 4000 then raise exception 'drawing_too_big' using errcode = 'P0001'; end if;
    if exists (select 1 from jsonb_array_elements(arr) with ordinality e(v, k)
                where jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric)
                   or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > case when k % 2 = 1 then 400 else 300 end) then
      raise exception 'invalid_drawing' using errcode = 'P0001';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('c', upper(c), 'w', w, 'p', arr));
  end loop;
  return jsonb_build_object('s', v_out);
end $$;

drop function if exists public.room_note(text, text);
create or replace function public.room_note(p_username text, p_body text default null, p_drawing jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_host uuid; v_body text; v_draw jsonb;
begin
  perform private.rate_limit('room_note', 20, 3600);
  select id into v_host from public.profiles where lower(username) = lower(p_username);
  if v_host is null or not private.visible_to(v_host, v_uid) then raise exception 'room_not_found' using errcode = 'P0001'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if char_length(v_body) > 0 then v_body := coalesce(private.chat_clean(v_body), ''); end if;
  v_draw := private.clean_drawing(p_drawing);
  if char_length(v_body) = 0 and v_draw is null then raise exception 'empty_message' using errcode = 'P0001'; end if;
  insert into public.room_notes (host_id, author_id, body, drawing) values (v_host, v_uid, left(v_body, 140), v_draw);
  perform private.notify(v_host, 'note', v_uid, jsonb_build_object('body', case when char_length(v_body) = 0 then '🎨 left you a drawing' else left(v_body, 140) end));
  return public.room_social(p_username);
end $$;
revoke all on function public.room_note(text, text, jsonb) from public, anon;
grant execute on function public.room_note(text, text, jsonb) to authenticated;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.room_social(text)'::regprocedure);
  n := replace(d, '''body'', n.body,', '''body'', n.body, ''drawing'', n.drawing,');
  if n = d then raise exception 'residential: room_social anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('private.room_status(uuid,uuid)'::regprocedure);
  n := replace(d, '''checked_in'', exists (',
    '''signed_today'', exists (select 1 from public.room_notes n where n.host_id = p_host and n.author_id = p_visitor and not n.hidden and n.created_at >= private.day_start(now())),' || chr(10) || '    ''checked_in'', exists (');
  if n = d then raise exception 'residential: room_status anchor not found'; end if;
  execute n;
  -- checking in means signing the book first (and the house has to exist)
  d := pg_get_functiondef('public.room_checkin(text)'::regprocedure);
  n := replace(d, '    raise exception ''already_checked_in'' using errcode = ''P0001'';' || chr(10) || '  end if;',
    '    raise exception ''already_checked_in'' using errcode = ''P0001'';' || chr(10) || '  end if;' || chr(10) ||
    '  if not coalesce((private.house_json(v_host) ->> ''allowed'')::boolean, false) then raise exception ''no_home'' using errcode = ''P0001''; end if;' || chr(10) ||
    '  if not exists (select 1 from public.room_notes where host_id = v_host and author_id = v_uid and not hidden and created_at >= private.day_start(now())) then' || chr(10) ||
    '    raise exception ''sign_the_book'' using errcode = ''P0001'';' || chr(10) || '  end if;');
  if n = d then raise exception 'residential: room_checkin anchor not found'; end if;
  execute n;
end $$;

-- ---- Landlord: rent day on the 1st --------------------------------------------------------------------------------
/** the USD rent of a player's Landlord plots */
create or replace function private.landlord_rate(p_uid uuid) returns numeric language sql stable as $$
  with c as (select coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) as lb)
  select coalesce(sum(r.usd_per_second * (1 + c.lb * (p.level - 1))), 0)
  from public.world_plots p
  join public.plot_rarities r on r.id = p.rarity
  join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
  join public.canvas_groups g on g.id = m.group_id and g.kind = 'landlord' and g.status = 'active' and g.owner_id = p_uid
  cross join c
  where p.owner_id = p_uid
$$;

/** how many seconds of [from, to] fall on the 1st of a month (UTC) */
create or replace function private.rent_day_seconds(p_from timestamptz, p_to timestamptz) returns numeric language sql stable as $$
  select coalesce(sum(greatest(0, extract(epoch from (least(p_to, d + interval '1 day') - greatest(p_from, d))))), 0)
  from generate_series(date_trunc('month', p_from at time zone 'UTC'), date_trunc('month', p_to at time zone 'UTC'), interval '1 month') s(m)
  cross join lateral (select s.m at time zone 'UTC' as d) x
  where p_to > p_from
$$;

/** the extra a player's Landlord plots have earned on rent days since rent was last settled */
create or replace function private.landlord_extra(p_uid uuid, p_settled_at timestamptz) returns numeric language sql stable as $$
  select case when lr = 0 then 0 else lr * (coalesce((private.cfg('residential') ->> 'landlord_mult')::numeric, 50) - 1)
    * private.rent_day_seconds(greatest(p_settled_at, now() - make_interval(days => coalesce((private.cfg('rent') ->> 'max_offline_days')::int, 30))), now()) end
  from (select private.landlord_rate(p_uid) lr) x
$$;

create or replace function private.landlord_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'rate', lr, 'multiplier', coalesce((private.cfg('residential') ->> 'landlord_mult')::numeric, 50),
    'plots', (select count(*) from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id
               where g.owner_id = p_uid and g.kind = 'landlord' and g.status = 'active'),
    'active', extract(day from now() at time zone 'UTC') = 1,
    'day_start', date_trunc('month', now() at time zone 'UTC') at time zone 'UTC',
    'day_end', (date_trunc('month', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC',
    'next', (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC')
  from (select private.landlord_rate(p_uid) lr) x
$$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.rent_settle(uuid)'::regprocedure);
  n := replace(d, 'v_amount := round((v_acc ->> ''amount'')::numeric, 15);', 'v_amount := round((v_acc ->> ''amount'')::numeric + private.landlord_extra(p_uid, a.settled_at), 15);');
  if n = d then raise exception 'residential: rent_settle anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('private.rent_json(uuid)'::regprocedure);
  n := replace(d, '  v_live := a.balance_usd + (v_acc ->> ''amount'')::numeric;', '  v_acc := v_acc || jsonb_build_object(''amount'', (v_acc ->> ''amount'')::numeric + private.landlord_extra(p_uid, a.settled_at));' || chr(10) || '  v_live := a.balance_usd + (v_acc ->> ''amount'')::numeric;');
  n := replace(n, '''server_time'', now());', '''landlord'', private.landlord_json(p_uid), ''server_time'', now());');
  if position('landlord_extra' in n) = 0 or position('landlord_json' in n) = 0 then raise exception 'residential: rent_json anchors not found'; end if;
  execute n;
end $$;

do $$ declare f text; begin
  foreach f in array array['private.house_size_of(uuid)', 'private.home_group(uuid)', 'private.house_json(uuid)', 'private.clean_drawing(jsonb)',
    'private.landlord_rate(uuid)', 'private.rent_day_seconds(timestamptz, timestamptz)', 'private.landlord_extra(uuid, timestamptz)', 'private.landlord_json(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
