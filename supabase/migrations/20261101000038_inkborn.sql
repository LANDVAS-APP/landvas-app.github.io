-- v0.22: Inkborn. A plot (canvas group) is now either an Art Canvas or an Inkborn Habitat
-- (plot_kinds is open for future kinds: farms, shops, underground entrances…). Habitats are
-- living sanctuaries where the creatures players create (Inkborn) live. Every player also
-- gets a free starter sanctuary that doesn't need land.
-- Nothing is destroyed when a plot changes kind: its artwork project and versions stay as
-- they are (the art snapshot), and a habitat's layout stays in `habitats` (the habitat
-- snapshot), so switching back restores either one. Land income, prices and Ink are untouched.

create table if not exists public.plot_kinds (
  id text primary key,
  name text not null,
  description text not null,
  enabled boolean not null default true,
  sort int not null default 0
);
insert into public.plot_kinds (id, name, description, sort) values
  ('canvas', 'Art Canvas', 'Create and showcase artwork on the live map.', 0),
  ('habitat', 'Inkborn Habitat', 'Build a living biome and raise creatures.', 1)
on conflict (id) do nothing;
alter table public.plot_kinds enable row level security;
revoke all on public.plot_kinds from anon, authenticated;

alter table public.canvas_groups add column if not exists kind text not null default 'canvas' references public.plot_kinds(id);

insert into public.game_config (key, value, description) values ('inkborn', '{
  "enabled": true, "max_creatures": 60, "starter_capacity": 4, "capacity_base": 3, "capacity_per_plot": 2,
  "decor_base": 30, "decor_per_plot": 20, "ai_portraits": false, "ai_daily_per_player": 3
}', 'Inkborn: creature limits, habitat capacity (base + per connected plot), decorations per habitat, and AI portraits (off until an image service is configured).')
on conflict (key) do nothing;

create table if not exists public.habitats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players(id) on delete cascade,
  group_id uuid unique references public.canvas_groups(id) on delete set null,
  kind text not null default 'plot' check (kind in ('starter', 'plot')),
  biome text not null default 'woodland' check (biome in ('woodland')),
  seed int not null default floor(random() * 2147483646)::int,
  layout jsonb not null default '[]'::jsonb,
  layout_rev int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists habitats_one_starter on public.habitats (owner_id) where kind = 'starter';
alter table public.habitats enable row level security;
revoke all on public.habitats from anon, authenticated;

create table if not exists public.inkborn (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players(id) on delete cascade,
  client_key text not null check (char_length(client_key) between 8 and 80),
  name text not null check (char_length(name) between 1 and 24),
  source text not null check (source in ('drawn', 'random', 'custom')),
  genome jsonb not null,
  drawing jsonb,
  personality text not null check (personality in ('playful', 'sleepy', 'curious', 'shy', 'foodie', 'brave')),
  habitat_id uuid references public.habitats(id) on delete set null,
  prev_habitat_id uuid references public.habitats(id) on delete set null,
  portrait_status text not null default 'none' check (portrait_status in ('none', 'unconfigured', 'queued', 'ready', 'failed')),
  portrait_path text,
  happiness int not null default 75,
  energy int not null default 90,
  bond int not null default 0,
  bond_today int not null default 0,
  bond_day timestamptz,
  stats_at timestamptz not null default now(),
  last_fed timestamptz,
  last_played timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_key)
);
create index if not exists inkborn_owner on public.inkborn (owner_id, created_at);
create index if not exists inkborn_habitat on public.inkborn (habitat_id);
alter table public.inkborn enable row level security;
revoke all on public.inkborn from anon, authenticated;

create table if not exists public.inkborn_portrait_jobs (
  id uuid primary key default gen_random_uuid(),
  inkborn_id uuid not null references public.inkborn(id) on delete cascade,
  owner_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.inkborn_portrait_jobs enable row level security;
revoke all on public.inkborn_portrait_jobs from anon, authenticated;

create or replace function private.ink_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('inkborn'), '{}'::jsonb) $$;

-- ===== helpers ========================================================================
create or replace function private.starter_habitat(p_owner uuid) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from public.habitats where owner_id = p_owner and kind = 'starter';
  if v is null then
    insert into public.habitats (owner_id, kind) values (p_owner, 'starter') on conflict do nothing returning id into v;
    if v is null then select id into v from public.habitats where owner_id = p_owner and kind = 'starter'; end if;
  end if;
  return v;
end $$;

create or replace function private.habitat_capacity(h public.habitats) returns int
language sql stable as $$
  select case when h.kind = 'starter' then coalesce((private.ink_cfg() ->> 'starter_capacity')::int, 4)
    else coalesce((private.ink_cfg() ->> 'capacity_base')::int, 3)
         + coalesce((private.ink_cfg() ->> 'capacity_per_plot')::int, 2) * greatest(coalesce((select plot_count from public.canvas_groups where id = h.group_id), 1) - 1, 0) end
$$;

create or replace function private.habitat_plots(h public.habitats) returns int
language sql stable as $$
  select case when h.kind = 'starter' then 2 else greatest(coalesce((select plot_count from public.canvas_groups where id = h.group_id), 1), 1) end
$$;

-- creature stats move with time: happiness drifts down slowly (never below 35), energy recovers
create or replace function private.inkborn_now(c public.inkborn) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'happiness', greatest(35, least(100, c.happiness - floor(extract(epoch from (now() - c.stats_at)) / 3600 * 2)::int)),
    'energy', least(100, c.energy + floor(extract(epoch from (now() - c.stats_at)) / 3600 * 12)::int))
$$;

create or replace function private.inkborn_json(c public.inkborn, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'source', c.source, 'genome', c.genome, 'personality', c.personality,
    'habitat_id', c.habitat_id, 'bond', c.bond, 'created_at', c.created_at, 'portrait_status', c.portrait_status, 'portrait_path', c.portrait_path,
    'mine', c.owner_id = p_viewer, 'last_fed', c.last_fed, 'last_played', c.last_played)
    || private.inkborn_now(c)
    || case when c.owner_id = p_viewer then jsonb_build_object('drawing', c.drawing) else '{}'::jsonb end
$$;

create or replace function private.habitat_json(h public.habitats, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', h.id, 'kind', h.kind, 'biome', h.biome, 'seed', h.seed, 'layout', h.layout, 'layout_rev', h.layout_rev,
    'owner', private.profile_json(h.owner_id), 'is_owner', h.owner_id = p_viewer, 'group_id', h.group_id,
    'name', case when h.kind = 'starter' then 'Starter sanctuary' else coalesce((select name from public.canvas_groups where id = h.group_id), 'Habitat') end,
    'plots', private.habitat_plots(h), 'capacity', private.habitat_capacity(h),
    'active', h.kind = 'starter' or exists (select 1 from public.canvas_groups g where g.id = h.group_id and g.kind = 'habitat' and g.status = 'active'),
    -- the shape of a plot habitat, as cells relative to its corner (never where it is)
    'cells', case when h.kind = 'plot' then (
      select coalesce(jsonb_agg(jsonb_build_array(m.gx - g.min_gx, m.gy - g.min_gy)), '[]'::jsonb)
      from public.canvas_groups g join public.canvas_group_members m on m.group_id = g.id where g.id = h.group_id) else '[[0,0],[1,0],[0,1],[1,1]]'::jsonb end,
    'creatures', (select coalesce(jsonb_agg(private.inkborn_json(c, p_viewer) order by c.created_at), '[]'::jsonb) from public.inkborn c where c.habitat_id = h.id))
$$;

-- ===== plot kinds =====================================================================
create or replace function private.group_json(p_group uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'status', g.status, 'plot_count', g.plot_count, 'kind', g.kind,
    'habitat_id', (select h.id from public.habitats h where h.group_id = g.id),
    'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy,
    'project_id', g.project_id, 'created_at', g.created_at, 'updated_at', g.updated_at,
    'cells', (
      select coalesce(jsonb_agg(jsonb_build_array(m.gx, m.gy, wp.plot_type, wp.level, wp.art_rev is not null) order by m.gy, m.gx), '[]'::jsonb)
      from public.canvas_group_members m join public.world_plots wp on wp.gx = m.gx and wp.gy = m.gy
      where m.group_id = g.id),
    'project', (
      select jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description,
                                'current_version_id', p.current_version_id, 'version_count', p.version_count,
                                'tile_count', v.tile_count, 'layer_count', v.layer_count, 'updated_at', p.updated_at)
      from public.artwork_projects p left join public.artwork_versions v on v.id = p.current_version_id
      where p.id = g.project_id),
    'latest_publication', (
      select jsonb_build_object('id', a.id, 'status', a.status, 'title', a.title, 'created_at', a.created_at,
                                'published_at', a.published_at, 'decision_reason', a.decision_reason,
                                'thumb_path', a.thumb_path, 'plot_count', a.plot_count)
      from public.artwork_publications a
      where a.group_id = g.id and a.status not in ('cancelled')
      order by a.created_at desc limit 1),
    'adjacent_groups', (
      select coalesce(jsonb_agg(distinct m2.group_id), '[]'::jsonb)
      from public.canvas_group_members m1
      join private.neighbors(m1.gx, m1.gy) n on true
      join public.canvas_group_members m2 on m2.gx = n.gx and m2.gy = n.gy
      join public.canvas_groups g2 on g2.id = m2.group_id
      where m1.group_id = g.id and m2.group_id <> g.id and g2.owner_id = g.owner_id and g2.status = 'active'))
  from public.canvas_groups g where g.id = p_group
$$;

create or replace function public.plot_blocks(p_blocks jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 64 then
    raise exception 'too_many_blocks' using errcode = 'P0001';
  end if;
  with req as (
    select distinct (b ->> 0)::int as bx, (b ->> 1)::int as by
    from jsonb_array_elements(p_blocks) b
    where (b ->> 0)::int between 0 and 65535 and (b ->> 1)::int between 0 and 65535
  )
  select coalesce(jsonb_object_agg(r.bx || '_' || r.by, coalesce(rows, '[]'::jsonb)), '{}'::jsonb) into v_res
  from req r
  left join lateral (
    select jsonb_agg(jsonb_build_array(p.gx, p.gy, p.plot_type, p.level, p.owner_id = v_uid, m.group_id,
                                       p.art_rev is not null, pr.username, pr.accent_color, p.rarity, p.name, coalesce(g.kind, 'canvas'))) as rows
    from public.world_plots p
    left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
    left join public.canvas_groups g on g.id = m.group_id
    left join public.profiles pr on pr.id = p.owner_id
    where p.bx = r.bx and p.by = r.by and p.owner_id is not null
  ) x on true;
  return v_res;
end $$;

create or replace function public.set_group_kind(p_group_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups%rowtype; h public.habitats%rowtype; v_starter uuid;
begin
  perform private.rate_limit('set_group_kind', 60, 3600);
  select * into g from public.canvas_groups where id = p_group_id for update;
  if not found or g.owner_id <> v_uid or g.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_kinds where id = p_kind and enabled) then raise exception 'invalid_plot_kind' using errcode = 'P0001'; end if;
  if g.kind = p_kind then return private.group_json(g.id); end if;
  if exists (select 1 from public.artwork_publications where group_id = g.id and status in ('processing', 'pending_review', 'approved', 'uploading')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select * into h from public.habitats where group_id = g.id;
  if p_kind = 'habitat' then
    if h.id is null then insert into public.habitats (owner_id, group_id, kind) values (v_uid, g.id, 'plot') returning * into h; end if;
    -- creatures that lived here before come home
    update public.inkborn set habitat_id = h.id, prev_habitat_id = null where owner_id = v_uid and prev_habitat_id = h.id;
  elsif h.id is not null then
    -- the habitat (layout + who lived here) is kept; its creatures wait in the starter sanctuary
    v_starter := private.starter_habitat(v_uid);
    update public.inkborn set prev_habitat_id = h.id, habitat_id = v_starter where habitat_id = h.id;
  end if;
  update public.canvas_groups set kind = p_kind, updated_at = now() where id = g.id;
  perform private.audit('group.kind', 'group', g.id::text, jsonb_build_object('from', g.kind, 'to', p_kind));
  return private.group_json(g.id);
end $$;

-- a habitat can't publish art, and art plots don't get habitat edits
create or replace function private.no_art_on_habitat_trg() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.canvas_groups where id = new.group_id and kind = 'habitat') then
    raise exception 'habitat_plot' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists artwork_publications_no_habitat on public.artwork_publications;
create trigger artwork_publications_no_habitat before insert on public.artwork_publications for each row execute function private.no_art_on_habitat_trg();

-- after a merge: the surviving habitat takes in the creatures of the habitats merged into it
create or replace function private.habitat_after_fuse(p_group uuid) returns void
language plpgsql as $$
declare g public.canvas_groups%rowtype; v_h uuid;
begin
  select * into g from public.canvas_groups where id = p_group;
  if g.kind <> 'habitat' then return; end if;
  select id into v_h from public.habitats where group_id = g.id;
  if v_h is null then insert into public.habitats (owner_id, group_id, kind) values (g.owner_id, g.id, 'plot') returning id into v_h; end if;
  update public.inkborn i set habitat_id = v_h
   from public.habitats h join public.canvas_groups mg on mg.id = h.group_id
   where i.habitat_id = h.id and h.id <> v_h and mg.merged_into = g.id;
end $$;

create or replace function public.fuse_groups(p_group_ids jsonb, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_ids uuid[]; v_cost int; v_effort bigint; v_res jsonb; v_version uuid; v_have bigint;
begin
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p_group_ids) x;
  -- art canvases merge with art canvases, habitats with habitats
  if (select count(distinct kind) from public.canvas_groups where id = any(coalesce(v_ids, '{}'))) > 1 then
    raise exception 'mixed_plot_kinds' using errcode = 'P0001';
  end if;
  v_cost := private.fuse_added_plots((select array_agg(id) from public.canvas_groups where id = any(coalesce(v_ids, '{}')) and owner_id = v_uid))
            * coalesce((private.cfg('earn') -> 'merge' ->> 'ink_per_plot')::int, 0);
  if v_cost > 0 then
    select coalesce(amount, 0) into v_have from public.resource_balances where player_id = v_uid and resource = 'ink';
    if coalesce(v_have, 0) < v_cost then raise exception 'insufficient_funds' using errcode = 'P0001', detail = v_cost::text; end if;
  end if;
  -- painting time carries over: the merged canvas keeps the time spent on every part
  select coalesce(sum(private.version_effort_of(pr.current_version_id)), 0) into v_effort
    from public.canvas_groups g join public.artwork_projects pr on pr.id = g.project_id
   where g.id = any(coalesce(v_ids, '{}')) and g.owner_id = v_uid;
  v_res := private.fuse_groups_core(p_group_ids, p_name);
  select pr.current_version_id into v_version from public.canvas_groups g join public.artwork_projects pr on pr.id = g.project_id
   where g.id = (v_res ->> 'id')::uuid;
  if v_version is not null then
    update private.version_effort set effort_ms = greatest(effort_ms, v_effort) where version_id = v_version;
  end if;
  -- connected habitats become one sanctuary: creatures from the merged habitats move in
  perform private.habitat_after_fuse((v_res ->> 'id')::uuid);
  if v_cost > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'merge', 'group', v_res ->> 'id', 'merge:' || (v_res ->> 'id') || ':' || v_version);
  end if;
  return v_res || jsonb_build_object('ink_spent', v_cost, 'balances', private.balances(v_uid));
end $$;

-- ===== sanctuaries ====================================================================
create or replace function public.my_sanctuaries() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_starter uuid;
begin
  v_starter := private.starter_habitat(v_uid);
  return jsonb_build_object(
    'habitats', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'group_id', h.group_id, 'plots', private.habitat_plots(h),
                   'capacity', private.habitat_capacity(h), 'creatures', (select count(*) from public.inkborn c where c.habitat_id = h.id),
                   'name', case when h.kind = 'starter' then 'Starter sanctuary' else (select name from public.canvas_groups where id = h.group_id) end)
                   order by h.kind desc, h.created_at), '[]'::jsonb)
                 from public.habitats h left join public.canvas_groups g on g.id = h.group_id
                 where h.owner_id = v_uid and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))),
    'creatures', (select coalesce(jsonb_agg(private.inkborn_json(c, v_uid) order by c.created_at), '[]'::jsonb) from public.inkborn c where c.owner_id = v_uid),
    'starter_id', v_starter,
    'max_creatures', coalesce((private.ink_cfg() ->> 'max_creatures')::int, 60),
    'ai_portraits', coalesce((private.ink_cfg() ->> 'ai_portraits')::boolean, false));
end $$;

create or replace function public.habitat_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); h public.habitats%rowtype;
begin
  if p_id is null and v_uid is not null then p_id := private.starter_habitat(v_uid); end if;
  select * into h from public.habitats where id = p_id;
  if not found or not private.visible_to(h.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return private.habitat_json(h, v_uid);
end $$;

create or replace function public.habitat_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('habitat_id', h.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'creatures', (select count(*) from public.inkborn c where c.habitat_id = h.id))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'habitat'
  join public.habitats h on h.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$$;

-- layout: [{"id": "...", "k": "oak", "x": 12.5, "y": 7.25, "f": 0|1}] in world units (one plot = 16 units)
create or replace function public.habitat_save_layout(p_id uuid, p_layout jsonb, p_rev int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.habitats%rowtype; v_max int; v_w numeric; v_h numeric; c jsonb;
begin
  perform private.rate_limit('habitat_layout', 240, 3600);
  select * into h from public.habitats where id = p_id for update;
  if not found or h.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if h.layout_rev <> coalesce(p_rev, -1) then raise exception 'layout_conflict' using errcode = 'P0001'; end if;
  v_max := coalesce((private.ink_cfg() ->> 'decor_base')::int, 30) + coalesce((private.ink_cfg() ->> 'decor_per_plot')::int, 20) * (private.habitat_plots(h) - 1);
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > v_max then raise exception 'too_many_decorations' using errcode = 'P0001', detail = v_max::text; end if;
  select coalesce(max(x), 1) * 16 + 16, coalesce(max(y), 1) * 16 + 16 into v_w, v_h
    from (select (e ->> 0)::int x, (e ->> 1)::int y from jsonb_array_elements((private.habitat_json(h, v_uid)) -> 'cells') e) t;
  for c in select e from jsonb_array_elements(p_layout) e loop
    if jsonb_typeof(c) <> 'object' or coalesce(c ->> 'k', '') !~ '^[a-z_]{2,20}$' or coalesce(c ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,24}$'
       or coalesce((c ->> 'x')::numeric, -1) not between 0 and v_w or coalesce((c ->> 'y')::numeric, -1) not between 0 and v_h then
      raise exception 'invalid_layout' using errcode = 'P0001';
    end if;
  end loop;
  update public.habitats set layout = p_layout, layout_rev = layout_rev + 1, updated_at = now() where id = h.id returning * into h;
  return private.habitat_json(h, v_uid);
end $$;

-- ===== creatures ======================================================================
create or replace function private.check_genome(g jsonb) returns void
language plpgsql immutable as $$
declare k text; v jsonb;
begin
  if g is null or jsonb_typeof(g) <> 'object' or octet_length(g::text) > 4000 then raise exception 'invalid_genome' using errcode = 'P0001'; end if;
  for k, v in select * from jsonb_each(g) loop
    if k !~ '^[a-z]{2,12}$' or jsonb_typeof(v) not in ('string', 'number', 'boolean') or (jsonb_typeof(v) = 'string' and char_length(v #>> '{}') > 24) then
      raise exception 'invalid_genome' using errcode = 'P0001';
    end if;
  end loop;
end $$;

create or replace function public.inkborn_create(p_client_key text, p_name text, p_source text, p_genome jsonb, p_drawing jsonb, p_habitat_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; h public.habitats%rowtype; v_name text; v_pers text; v_starter uuid;
begin
  if not coalesce((private.ink_cfg() ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  -- the same save sent twice is one creature
  select * into c from public.inkborn where owner_id = v_uid and client_key = p_client_key;
  if found then return private.inkborn_json(c, v_uid); end if;
  perform private.rate_limit('inkborn_create', 40, 3600);
  if (select count(*) from public.inkborn where owner_id = v_uid) >= coalesce((private.ink_cfg() ->> 'max_creatures')::int, 60) then
    raise exception 'too_many_creatures' using errcode = 'P0001';
  end if;
  if p_source not in ('drawn', 'random', 'custom') then raise exception 'invalid_source' using errcode = 'P0001'; end if;
  perform private.check_genome(p_genome);
  if p_source = 'drawn' then perform private.check_strokes(p_drawing, 2); end if;
  v_name := private.chat_clean(p_name);
  if v_name is null or char_length(v_name) not between 1 and 24 or v_name <> btrim(p_name) then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  v_pers := coalesce(p_genome ->> 'mood', 'curious');
  if v_pers not in ('playful', 'sleepy', 'curious', 'shy', 'foodie', 'brave') then v_pers := 'curious'; end if;
  -- make sure the starter exists first (a row inserted inside the same query isn't visible to it)
  v_starter := private.starter_habitat(v_uid);
  select * into h from public.habitats where id = coalesce(p_habitat_id, v_starter);
  if not found or h.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if (select count(*) from public.inkborn where habitat_id = h.id) >= private.habitat_capacity(h) then
    -- full: the starter sanctuary takes them in, or they wait without a home
    select * into h from public.habitats where id = v_starter;
    if (select count(*) from public.inkborn where habitat_id = h.id) >= private.habitat_capacity(h) then h.id := null; end if;
  end if;
  insert into public.inkborn (owner_id, client_key, name, source, genome, drawing, personality, habitat_id, portrait_status)
  values (v_uid, p_client_key, v_name, p_source, p_genome, case when p_source = 'drawn' then p_drawing end, v_pers, h.id,
          case when p_source = 'drawn' then case when coalesce((private.ink_cfg() ->> 'ai_portraits')::boolean, false) then 'queued' else 'unconfigured' end else 'none' end)
  returning * into c;
  if c.portrait_status = 'queued' then insert into public.inkborn_portrait_jobs (inkborn_id, owner_id) values (c.id, v_uid); end if;
  return private.inkborn_json(c, v_uid);
end $$;

create or replace function public.inkborn_update(p_id uuid, p_name text, p_genome jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; v_name text;
begin
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_name is not null then
    v_name := private.chat_clean(p_name);
    if v_name is null or char_length(v_name) not between 1 and 24 or v_name <> btrim(p_name) then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  end if;
  if p_genome is not null then perform private.check_genome(p_genome); end if;
  update public.inkborn set name = coalesce(v_name, name), genome = coalesce(p_genome, genome), updated_at = now() where id = c.id returning * into c;
  return private.inkborn_json(c, v_uid);
end $$;

create or replace function public.inkborn_move(p_id uuid, p_habitat_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; h public.habitats%rowtype;
begin
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into h from public.habitats where id = p_habitat_id;
  if not found or h.owner_id <> v_uid or not (h.kind = 'starter' or exists (select 1 from public.canvas_groups g where g.id = h.group_id and g.kind = 'habitat' and g.status = 'active')) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if c.habitat_id is distinct from h.id and (select count(*) from public.inkborn where habitat_id = h.id) >= private.habitat_capacity(h) then
    raise exception 'habitat_full' using errcode = 'P0001';
  end if;
  update public.inkborn set habitat_id = h.id, prev_habitat_id = null, updated_at = now() where id = c.id returning * into c;
  return private.inkborn_json(c, v_uid);
end $$;

-- care: pet, feed and play. Bond grows (up to 40 a day per creature); nothing ever drops low.
create or replace function public.inkborn_care(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; v_now jsonb; v_hap int; v_en int; v_bond int := 0; v_msg text;
  v_day timestamptz := private.day_start(now());
begin
  perform private.rate_limit('inkborn_care', 600, 3600);
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  v_now := private.inkborn_now(c);
  v_hap := (v_now ->> 'happiness')::int; v_en := (v_now ->> 'energy')::int;
  if c.bond_day is distinct from v_day then c.bond_today := 0; end if;
  case p_action
    when 'pet' then v_hap := least(100, v_hap + 4); v_bond := 1; v_msg := 'purr';
    when 'feed' then
      if c.last_fed is not null and c.last_fed > now() - interval '45 minutes' then v_hap := least(100, v_hap + 1); v_msg := 'full';
      else v_hap := least(100, v_hap + 12); v_en := least(100, v_en + 15); v_bond := 3; v_msg := 'yum'; c.last_fed := now(); end if;
    when 'play' then
      if v_en < 15 then v_msg := 'tired';
      else v_hap := least(100, v_hap + 15); v_en := v_en - 15; v_bond := 5; v_msg := 'yay'; c.last_played := now(); end if;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  v_bond := least(v_bond, greatest(0, 40 - c.bond_today));
  update public.inkborn set happiness = v_hap, energy = v_en, stats_at = now(), bond = bond + v_bond, bond_today = c.bond_today + v_bond, bond_day = v_day,
         last_fed = c.last_fed, last_played = c.last_played, updated_at = now()
   where id = c.id returning * into c;
  return private.inkborn_json(c, v_uid) || jsonb_build_object('reaction', v_msg, 'bond_gain', v_bond);
end $$;

create or replace function public.inkborn_release(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.inkborn where id = p_id and owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.ink_cfg()', 'private.starter_habitat(uuid)', 'private.habitat_capacity(public.habitats)', 'private.habitat_plots(public.habitats)',
    'private.inkborn_now(public.inkborn)', 'private.inkborn_json(public.inkborn, uuid)', 'private.habitat_json(public.habitats, uuid)', 'private.no_art_on_habitat_trg()',
    'private.habitat_after_fuse(uuid)', 'private.check_genome(jsonb)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.set_group_kind(uuid, text)', 'public.my_sanctuaries()', 'public.habitat_save_layout(uuid, jsonb, int)',
    'public.inkborn_create(text, text, text, jsonb, jsonb, uuid)', 'public.inkborn_update(uuid, text, jsonb)', 'public.inkborn_move(uuid, uuid)',
    'public.inkborn_care(uuid, text)', 'public.inkborn_release(uuid)', 'public.fuse_groups(jsonb, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.habitat_get(uuid)', 'public.habitat_for_plot(int, int)', 'public.plot_blocks(jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;
