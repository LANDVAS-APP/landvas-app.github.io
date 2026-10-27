-- LANDVAS Canvas Fusion, artwork drafts/versions, publication pipeline
-- ---------------------------------------------------------------------------
-- Invariants
--  * Every owned plot belongs to exactly one active canvas group (PK on
--    canvas_group_members(gx, gy)). A single plot is a group of one.
--  * A group has exactly one active artwork project; its versions are
--    immutable snapshots of a layer manifest keyed by absolute plot cells, so
--    expanding a canvas never moves existing pixels.
--  * Saving a draft never touches the public map. Only the pipeline, after
--    validation and moderation, changes art_tiles / world_plots.art_*.
-- ---------------------------------------------------------------------------

-- ===== Manifest helpers =====================================================

create or replace function private.manifest_restrict(p_manifest jsonb, p_cells jsonb) returns jsonb
language plpgsql immutable as $$
declare v_res jsonb;
begin
  with keys as (
    select private.cell_key((c ->> 0)::int, (c ->> 1)::int) as k from jsonb_array_elements(p_cells) c
  ), layers as (
    select l.v, l.i,
      coalesce((select jsonb_object_agg(t.key, t.value) from jsonb_each(coalesce(l.v -> 'tiles', '{}'::jsonb)) t
                where t.key in (select k from keys)), '{}'::jsonb) as tiles
    from jsonb_array_elements(coalesce(p_manifest -> 'layers', '[]'::jsonb)) with ordinality l(v, i)
  ), kept as (
    select * from layers where tiles <> '{}'::jsonb
  )
  select case
    when exists (select 1 from kept) then
      jsonb_build_object('layers', (select jsonb_agg(jsonb_set(v, '{tiles}', tiles) order by i) from kept))
    when exists (select 1 from layers) then
      jsonb_build_object('layers', jsonb_build_array(jsonb_set((select v from layers order by i limit 1), '{tiles}', '{}'::jsonb)))
    else private.empty_manifest()
  end into v_res;
  return v_res;
end $$;

-- Append the non-empty layers of p_b to p_a, de-duplicating layer ids.
create or replace function private.manifest_merge(p_a jsonb, p_b jsonb) returns jsonb
language plpgsql immutable as $$
declare v_layers jsonb := coalesce(p_a -> 'layers', '[]'::jsonb); v_ids text[]; v_l jsonb; v_id text; v_n int;
begin
  select coalesce(array_agg(l ->> 'id'), '{}') into v_ids from jsonb_array_elements(v_layers) l;
  for v_l in
    select l.v from jsonb_array_elements(coalesce(p_b -> 'layers', '[]'::jsonb)) with ordinality l(v, i)
    where coalesce(l.v -> 'tiles', '{}'::jsonb) <> '{}'::jsonb order by l.i
  loop
    v_id := v_l ->> 'id'; v_n := 2;
    while v_id = any(v_ids) loop
      v_id := left(v_l ->> 'id', 34) || '-m' || v_n;
      v_n := v_n + 1;
    end loop;
    v_ids := array_append(v_ids, v_id);
    v_layers := v_layers || jsonb_build_array(jsonb_set(v_l, '{id}', to_jsonb(v_id)));
  end loop;
  return jsonb_build_object('layers', v_layers);
end $$;

-- Drop empty layers when at least one layer has art.
create or replace function private.manifest_compact(p_manifest jsonb) returns jsonb
language plpgsql immutable as $$
declare v_kept jsonb;
begin
  select jsonb_agg(l.v order by l.i) into v_kept
  from jsonb_array_elements(p_manifest -> 'layers') with ordinality l(v, i)
  where coalesce(l.v -> 'tiles', '{}'::jsonb) <> '{}'::jsonb;
  if v_kept is null then return p_manifest; end if;
  return jsonb_build_object('layers', v_kept);
end $$;

create or replace function private.validate_manifest(p_manifest jsonb, p_member_keys text[], p_max_layers int) returns void
language plpgsql immutable as $$
declare v_layer jsonb; v_ids text[] := '{}'; v_key text; v_val text; v_count int; v_op numeric;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' or jsonb_typeof(p_manifest -> 'layers') is distinct from 'array' then
    raise exception 'invalid_manifest' using errcode = 'P0001';
  end if;
  if octet_length(p_manifest::text) > 2000000 then
    raise exception 'manifest_too_large' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_manifest -> 'layers');
  if v_count < 1 or v_count > p_max_layers then
    raise exception 'invalid_layer_count' using errcode = 'P0001', detail = v_count::text;
  end if;
  for v_layer in select * from jsonb_array_elements(p_manifest -> 'layers') loop
    if jsonb_typeof(v_layer) <> 'object' or coalesce(v_layer ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or (v_layer ->> 'id') = any(v_ids) then
      raise exception 'invalid_layer' using errcode = 'P0001';
    end if;
    v_ids := array_append(v_ids, v_layer ->> 'id');
    if char_length(coalesce(v_layer ->> 'name', '')) not between 1 and 40 then
      raise exception 'invalid_layer_name' using errcode = 'P0001';
    end if;
    if v_layer ? 'opacity' then
      if jsonb_typeof(v_layer -> 'opacity') <> 'number' then raise exception 'invalid_opacity' using errcode = 'P0001'; end if;
      v_op := (v_layer ->> 'opacity')::numeric;
      if v_op < 0 or v_op > 1 then raise exception 'invalid_opacity' using errcode = 'P0001'; end if;
    end if;
    if v_layer ? 'visible' and jsonb_typeof(v_layer -> 'visible') <> 'boolean' then
      raise exception 'invalid_layer' using errcode = 'P0001';
    end if;
    if jsonb_typeof(coalesce(v_layer -> 'tiles', '{}'::jsonb)) <> 'object' then
      raise exception 'invalid_tiles' using errcode = 'P0001';
    end if;
    for v_key, v_val in select t.key, t.value from jsonb_each_text(coalesce(v_layer -> 'tiles', '{}'::jsonb)) t loop
      if not (v_key = any(p_member_keys)) then
        raise exception 'tile_outside_canvas' using errcode = 'P0001', detail = v_key;
      end if;
      if v_val !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid_tile_hash' using errcode = 'P0001';
      end if;
    end loop;
  end loop;
end $$;

create or replace function private.manifest_normalize(p_manifest jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('layers', (
    select jsonb_agg(jsonb_build_object(
      'id', l.v ->> 'id',
      'name', l.v ->> 'name',
      'opacity', coalesce((l.v ->> 'opacity')::numeric, 1),
      'visible', coalesce((l.v ->> 'visible')::boolean, true),
      'tiles', coalesce(l.v -> 'tiles', '{}'::jsonb)) order by l.i)
    from jsonb_array_elements(p_manifest -> 'layers') with ordinality l(v, i)))
$$;

-- Split a cell list into connected components (cardinal adjacency with x-wrap).
create or replace function private.components(p_cells jsonb) returns setof jsonb
language plpgsql immutable as $$
declare v_left jsonb := p_cells; v_comp jsonb;
begin
  while v_left is not null and jsonb_array_length(v_left) > 0 loop
    with recursive cells as (
      select distinct (c ->> 0)::int as gx, (c ->> 1)::int as gy from jsonb_array_elements(v_left) c
    ), walk(gx, gy) as (
      (select gx, gy from cells order by gy, gx limit 1)
      union
      select c.gx, c.gy from walk w join cells c on private.cells_adjacent(w.gx, w.gy, c.gx, c.gy)
    )
    select jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx) into v_comp from walk;
    return next v_comp;
    select jsonb_agg(c order by (c ->> 1)::int, (c ->> 0)::int) into v_left
    from jsonb_array_elements(v_left) c
    where not exists (
      select 1 from jsonb_array_elements(v_comp) k
      where (k ->> 0)::int = (c ->> 0)::int and (k ->> 1)::int = (c ->> 1)::int);
  end loop;
end $$;

-- ===== Group JSON ===========================================================

create or replace function private.group_json(p_group uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'status', g.status, 'plot_count', g.plot_count,
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

-- ===== Canvas Fusion RPCs ===================================================

create or replace function public.my_groups() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(private.group_json(g.id) order by g.updated_at desc), '[]'::jsonb)
  from public.canvas_groups g where g.owner_id = auth.uid() and g.status = 'active'
$$;

create or replace function public.get_group(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  if not exists (select 1 from public.canvas_groups where id = p_group_id and owner_id = v_uid) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  return private.group_json(p_group_id);
end $$;

create or replace function public.rename_group(p_group_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if p_name is null or char_length(trim(p_name)) not between 1 and 60 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  update public.canvas_groups set name = trim(p_name), updated_at = now()
  where id = p_group_id and owner_id = v_uid and status = 'active';
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return private.group_json(p_group_id);
end $$;

-- Fuse two or more of the caller's canvas groups into one continuous canvas.
-- Verifies ownership of every plot, cardinal connectivity of the union, size
-- limits, and that no publication is mid-pipeline. Rows are locked in id order
-- so concurrent fusions cannot deadlock or interleave.
create or replace function public.fuse_groups(p_group_ids jsonb, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_ids uuid[]; v_cells jsonb; v_u jsonb; v_survivor uuid; v_project uuid; v_manifest jsonb; r record;
  v_limits jsonb := private.cfg('limits');
begin
  perform private.rate_limit('fuse', 120, 3600);
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p_group_ids) x;
  if coalesce(cardinality(v_ids), 0) < 2 then raise exception 'need_two_groups' using errcode = 'P0001'; end if;
  if cardinality(v_ids) > 100 then raise exception 'too_many_groups' using errcode = 'P0001'; end if;
  perform 1 from public.canvas_groups where id = any(v_ids) order by id for update;
  if (select count(*) from public.canvas_groups where id = any(v_ids) and owner_id = v_uid and status = 'active') <> cardinality(v_ids) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.canvas_group_members m join public.world_plots p on p.gx = m.gx and p.gy = m.gy
             where m.group_id = any(v_ids) and (p.owner_id is distinct from v_uid or p.locked)) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.artwork_publications where group_id = any(v_ids) and status in ('processing', 'pending_review', 'approved')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx) into v_cells from public.canvas_group_members where group_id = any(v_ids);
  if not private.cells_connected(v_cells) then
    raise exception 'not_connected' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_cells) > (v_limits ->> 'max_canvas_plots')::int then
    raise exception 'canvas_too_large' using errcode = 'P0001';
  end if;
  v_u := private.cells_unwrap(v_cells);
  if (v_u ->> 'max_gx')::int - (v_u ->> 'min_gx')::int + 1 > (v_limits ->> 'max_canvas_side')::int
     or (v_u ->> 'max_gy')::int - (v_u ->> 'min_gy')::int + 1 > (v_limits ->> 'max_canvas_side')::int then
    raise exception 'canvas_too_large' using errcode = 'P0001';
  end if;

  select id, project_id into v_survivor, v_project from public.canvas_groups
  where id = any(v_ids) order by plot_count desc, created_at, id limit 1;
  select v.manifest into v_manifest from public.artwork_projects p
  join public.artwork_versions v on v.id = p.current_version_id where p.id = v_project;
  for r in
    select g.id, v.manifest from public.canvas_groups g
    join public.artwork_projects p on p.id = g.project_id
    join public.artwork_versions v on v.id = p.current_version_id
    where g.id = any(v_ids) and g.id <> v_survivor
    order by g.plot_count desc, g.created_at, g.id
  loop
    v_manifest := private.manifest_merge(v_manifest, r.manifest);
  end loop;
  v_manifest := private.manifest_compact(v_manifest);
  if jsonb_array_length(v_manifest -> 'layers') > coalesce((v_limits ->> 'max_layers_hard')::int, 32) then
    raise exception 'too_many_layers' using errcode = 'P0001';
  end if;

  update public.canvas_group_members set group_id = v_survivor, added_at = now()
  where group_id = any(v_ids) and group_id <> v_survivor;
  update public.artwork_projects set status = 'archived', updated_at = now()
  where group_id = any(v_ids) and group_id <> v_survivor and status = 'active';
  update public.canvas_groups set status = 'merged', merged_into = v_survivor, plot_count = 0, updated_at = now()
  where id = any(v_ids) and id <> v_survivor;
  if p_name is not null and char_length(trim(p_name)) between 1 and 60 then
    update public.canvas_groups set name = trim(p_name) where id = v_survivor;
  end if;
  perform private.create_version(v_project, v_uid, 'merge', v_manifest, v_cells,
                                 'Fused ' || cardinality(v_ids) || ' canvases');
  perform private.refresh_group(v_survivor);
  perform private.grant(v_uid, jsonb_build_object('brush_points', 10), 'fusion', 'group', v_survivor::text, null);
  return private.group_json(v_survivor) || jsonb_build_object('achievements', private.evaluate_achievements(v_uid));
end $$;

-- Detach plots from a canvas. Detached plots become single-plot canvases that
-- carry their portion of the artwork; if the remainder splits into several
-- pieces, the largest keeps the canvas and the rest become new canvases. All
-- previous versions remain intact and restorable.
create or replace function public.detach_plots(p_group_id uuid, p_cells jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_group public.canvas_groups%rowtype; v_manifest jsonb; v_members int; v_detach jsonb; v_remaining jsonb;
  v_comp jsonb; v_new uuid[] := '{}'; v_first boolean := true; v_cell jsonb; v_title text;
begin
  perform private.rate_limit('detach', 120, 3600);
  select * into v_group from public.canvas_groups where id = p_group_id for update;
  if not found or v_group.owner_id <> v_uid or v_group.status <> 'active' then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.artwork_publications where group_id = p_group_id and status in ('processing', 'pending_review', 'approved')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select count(*) into v_members from public.canvas_group_members where group_id = p_group_id;
  select jsonb_agg(jsonb_build_array(d.gx, d.gy)) into v_detach
  from (select distinct (c ->> 0)::int as gx, (c ->> 1)::int as gy from jsonb_array_elements(p_cells) c) d
  where exists (select 1 from public.canvas_group_members m where m.group_id = p_group_id and m.gx = d.gx and m.gy = d.gy);
  if v_detach is null or jsonb_array_length(v_detach) <> (select count(distinct c) from jsonb_array_elements(p_cells) c) then
    raise exception 'cells_not_in_group' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_detach) >= v_members then
    raise exception 'cannot_detach_all' using errcode = 'P0001';
  end if;
  select v.manifest, p.title into v_manifest, v_title from public.artwork_projects p
  join public.artwork_versions v on v.id = p.current_version_id where p.id = v_group.project_id;

  delete from public.canvas_group_members m
  using jsonb_array_elements(v_detach) c
  where m.group_id = p_group_id and m.gx = (c ->> 0)::int and m.gy = (c ->> 1)::int;

  for v_cell in select * from jsonb_array_elements(v_detach) loop
    v_new := v_new || private.create_group_with_cells(v_uid, jsonb_build_array(v_cell),
      private.manifest_restrict(v_manifest, jsonb_build_array(v_cell)), null, 'split', v_title);
  end loop;

  select jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx) into v_remaining
  from public.canvas_group_members where group_id = p_group_id;
  for v_comp in select c from private.components(v_remaining) c order by jsonb_array_length(c) desc loop
    if v_first then
      perform private.create_version(v_group.project_id, v_uid, 'split',
        private.manifest_restrict(v_manifest, v_comp), v_comp, 'Detached ' || jsonb_array_length(v_detach) || ' plot(s)');
      v_first := false;
    else
      delete from public.canvas_group_members m
      using jsonb_array_elements(v_comp) c
      where m.group_id = p_group_id and m.gx = (c ->> 0)::int and m.gy = (c ->> 1)::int;
      v_new := v_new || private.create_group_with_cells(v_uid, v_comp, private.manifest_restrict(v_manifest, v_comp),
                                                        left(v_group.name, 50) || ' (part)', 'split', v_title);
    end if;
  end loop;
  perform private.refresh_group(p_group_id);
  return jsonb_build_object('group', private.group_json(p_group_id),
                            'new_groups', (select jsonb_agg(private.group_json(x)) from unnest(v_new) x));
end $$;

-- ===== Projects, drafts and versions ========================================

create or replace function public.get_project(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_proj public.artwork_projects%rowtype; v_ver public.artwork_versions%rowtype;
begin
  select * into v_proj from public.artwork_projects where id = p_project_id;
  if not found or v_proj.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into v_ver from public.artwork_versions where id = v_proj.current_version_id;
  return jsonb_build_object(
    'project', jsonb_build_object('id', v_proj.id, 'title', v_proj.title, 'description', v_proj.description,
                                  'status', v_proj.status, 'group_id', v_proj.group_id, 'owner_id', v_proj.owner_id,
                                  'current_version_id', v_proj.current_version_id, 'version_count', v_proj.version_count,
                                  'updated_at', v_proj.updated_at),
    'version', jsonb_build_object('id', v_ver.id, 'version_no', v_ver.version_no, 'kind', v_ver.kind,
                                  'manifest', v_ver.manifest, 'cells', v_ver.cells, 'created_at', v_ver.created_at),
    'group', private.group_json(v_proj.group_id),
    'published', (
      select coalesce(jsonb_agg(jsonb_build_array(m.gx, m.gy, wp.art_rev)), '[]'::jsonb)
      from public.canvas_group_members m join public.world_plots wp on wp.gx = m.gx and wp.gy = m.gy
      where m.group_id = v_proj.group_id and wp.art_rev is not null),
    'limits', private.cfg('limits'));
end $$;

create or replace function public.project_versions(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  if not exists (select 1 from public.artwork_projects where id = p_project_id and owner_id = v_uid) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', v.id, 'version_no', v.version_no, 'kind', v.kind, 'note', v.note,
                                        'tile_count', v.tile_count, 'layer_count', v.layer_count,
                                        'plot_count', jsonb_array_length(v.cells), 'created_at', v.created_at,
                                        'published', exists (select 1 from public.artwork_publications a
                                                             where a.version_id = v.id and a.status in ('published', 'superseded')))
                     order by v.version_no desc)
    from (select * from public.artwork_versions where project_id = p_project_id order by version_no desc limit 200) v), '[]'::jsonb);
end $$;

create or replace function public.get_version(p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v public.artwork_versions%rowtype;
begin
  select * into v from public.artwork_versions where id = p_version_id;
  if not found or (v.owner_id <> v_uid and not private.has_role(v_uid, array['moderator'])) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', v.id, 'project_id', v.project_id, 'owner_id', v.owner_id, 'version_no', v.version_no,
                            'kind', v.kind, 'manifest', v.manifest, 'cells', v.cells, 'created_at', v.created_at);
end $$;

-- Save a draft as a new immutable version. Optimistic concurrency: the caller
-- passes the version it edited; a mismatch means another device saved first.
create or replace function public.save_draft(
  p_project_id uuid, p_base_version_id uuid, p_manifest jsonb,
  p_title text default null, p_description text default null, p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_proj public.artwork_projects%rowtype; v_keys text[]; v_cells jsonb; v_manifest jsonb; v_version uuid; v_no int;
begin
  perform private.rate_limit('save_draft', 240, 3600);
  select * into v_proj from public.artwork_projects where id = p_project_id for update;
  if not found or v_proj.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if v_proj.status <> 'active' then raise exception 'project_archived' using errcode = 'P0001'; end if;
  if not coalesce(p_force, false) and p_base_version_id is distinct from v_proj.current_version_id then
    raise exception 'version_conflict' using errcode = 'P0001', detail = v_proj.current_version_id::text;
  end if;
  select array_agg(private.cell_key(gx, gy)), jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx)
    into v_keys, v_cells
  from public.canvas_group_members where group_id = v_proj.group_id;
  perform private.validate_manifest(p_manifest, v_keys, coalesce((private.cfg('limits') ->> 'max_layers_hard')::int, 32));
  v_manifest := private.manifest_normalize(p_manifest);
  if p_title is not null and char_length(trim(p_title)) not between 1 and 80 then
    raise exception 'invalid_title' using errcode = 'P0001';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'invalid_description' using errcode = 'P0001';
  end if;
  v_version := private.create_version(p_project_id, v_uid, 'save', v_manifest, v_cells, null);
  update public.artwork_projects
     set title = coalesce(nullif(trim(p_title), ''), title),
         description = case when p_description is null then description else nullif(trim(p_description), '') end
   where id = p_project_id;
  select version_no into v_no from public.artwork_versions where id = v_version;
  return jsonb_build_object('version_id', v_version, 'version_no', v_no, 'saved_at', now(),
                            'achievements', private.evaluate_achievements(v_uid));
end $$;

create or replace function public.restore_version(p_project_id uuid, p_version_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_proj public.artwork_projects%rowtype; v_ver public.artwork_versions%rowtype; v_cells jsonb; v_new uuid;
begin
  select * into v_proj from public.artwork_projects where id = p_project_id for update;
  if not found or v_proj.owner_id <> v_uid or v_proj.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into v_ver from public.artwork_versions where id = p_version_id and project_id = p_project_id;
  if not found then raise exception 'version_not_found' using errcode = 'P0001'; end if;
  select jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx) into v_cells from public.canvas_group_members where group_id = v_proj.group_id;
  v_new := private.create_version(p_project_id, v_uid, 'restore', private.manifest_restrict(v_ver.manifest, v_cells), v_cells,
                                  'Restored version ' || v_ver.version_no);
  return public.get_project(p_project_id) || jsonb_build_object('restored_version_id', v_new);
end $$;

-- ===== Publication ==========================================================

create or replace function private.enqueue_job(p_kind text, p_payload jsonb, p_delay_seconds int default 0) returns bigint
language sql as $$
  insert into private.render_jobs (kind, payload, run_after)
  values (p_kind, p_payload, now() + make_interval(secs => p_delay_seconds))
  returning id
$$;

create or replace function private.publication_json(p_pub public.artwork_publications) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p_pub.id, 'owner_id', p_pub.owner_id, 'project_id', p_pub.project_id, 'version_id', p_pub.version_id,
    'group_id', p_pub.group_id, 'title', p_pub.title, 'description', p_pub.description, 'cells', p_pub.cells,
    'plot_count', p_pub.plot_count, 'min_gx', p_pub.min_gx, 'min_gy', p_pub.min_gy, 'max_gx', p_pub.max_gx,
    'max_gy', p_pub.max_gy, 'center_lng', p_pub.center_lng, 'center_lat', p_pub.center_lat, 'status', p_pub.status,
    'submitted_at', p_pub.submitted_at, 'published_at', p_pub.published_at, 'decision_reason', p_pub.decision_reason,
    'preview_path', p_pub.preview_path, 'thumb_path', p_pub.thumb_path, 'preview_width', p_pub.preview_width,
    'preview_height', p_pub.preview_height, 'color_count', p_pub.color_count,
    'appreciation_count', p_pub.appreciation_count, 'created_at', p_pub.created_at)
$$;

create or replace function public.request_publication(
  p_project_id uuid, p_version_id uuid, p_title text, p_description text default null, p_rights_affirmed boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_terms text := private.cfg('legal') ->> 'terms_version';
  v_proj public.artwork_projects%rowtype; v_group public.canvas_groups%rowtype; v_ver public.artwork_versions%rowtype;
  v_cells jsonb; v_u jsonb; v_pub uuid;
begin
  perform private.rate_limit('publish', 40, 86400);
  if (select terms_version from public.players where id = v_uid) is distinct from v_terms then
    raise exception 'terms_required' using errcode = 'P0001', detail = v_terms;
  end if;
  if not coalesce(p_rights_affirmed, false) then
    raise exception 'rights_affirmation_required' using errcode = 'P0001';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 80 then
    raise exception 'invalid_title' using errcode = 'P0001';
  end if;
  select * into v_proj from public.artwork_projects where id = p_project_id for update;
  if not found or v_proj.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into v_group from public.canvas_groups where id = v_proj.group_id for update;
  if v_group.status <> 'active' or v_group.project_id is distinct from v_proj.id or v_proj.status <> 'active' then
    raise exception 'project_archived' using errcode = 'P0001';
  end if;
  select * into v_ver from public.artwork_versions where id = p_version_id and project_id = p_project_id;
  if not found then raise exception 'version_not_found' using errcode = 'P0001'; end if;
  if v_ver.id <> v_proj.current_version_id then raise exception 'version_out_of_date' using errcode = 'P0001'; end if;
  select jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx) into v_cells from public.canvas_group_members where group_id = v_group.id;
  if jsonb_array_length(v_ver.cells) <> jsonb_array_length(v_cells) or exists (
       select 1 from jsonb_array_elements(v_ver.cells) c
       where not exists (select 1 from public.canvas_group_members m
                         where m.group_id = v_group.id and m.gx = (c ->> 0)::int and m.gy = (c ->> 1)::int)) then
    raise exception 'version_out_of_date' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.canvas_group_members m join public.world_plots p on p.gx = m.gx and p.gy = m.gy
             where m.group_id = v_group.id and (p.owner_id is distinct from v_uid or p.locked)) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  update public.artwork_publications set status = 'cancelled', updated_at = now()
  where group_id = v_group.id and status = 'uploading';
  if exists (select 1 from public.artwork_publications where group_id = v_group.id and status in ('processing', 'pending_review', 'approved')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  v_u := private.cells_unwrap(v_cells);
  insert into public.artwork_publications (
    owner_id, project_id, version_id, group_id, title, description, cells, plot_count,
    min_gx, min_gy, max_gx, max_gy, center_lng, center_lat, rights_affirmed_at, terms_version)
  values (
    v_uid, v_proj.id, v_ver.id, v_group.id, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), v_cells,
    jsonb_array_length(v_cells), (v_u ->> 'min_gx')::int, (v_u ->> 'min_gy')::int, (v_u ->> 'max_gx')::int, (v_u ->> 'max_gy')::int,
    private.lng_of(((v_u ->> 'min_gx')::int + (v_u ->> 'max_gx')::int + 1) / 2.0),
    private.lat_of(((v_u ->> 'min_gy')::int + (v_u ->> 'max_gy')::int + 1) / 2.0),
    now(), v_terms)
  returning id into v_pub;
  update public.artwork_projects set title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), '') where id = v_proj.id;
  return jsonb_build_object('publication_id', v_pub, 'cells', v_cells, 'unwrapped', v_u,
                            'upload_prefix', v_uid::text || '/' || v_pub::text);
end $$;

create or replace function public.submit_publication(p_publication_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  update public.artwork_publications set status = 'processing', submitted_at = now(), updated_at = now()
  where id = p_publication_id and owner_id = v_uid and status = 'uploading';
  if not found then raise exception 'invalid_publication_state' using errcode = 'P0001'; end if;
  perform private.enqueue_job('process_publication', jsonb_build_object('publication_id', p_publication_id));
  return jsonb_build_object('publication_id', p_publication_id, 'status', 'processing');
end $$;

create or replace function public.cancel_publication(p_publication_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  update public.artwork_publications set status = 'cancelled', updated_at = now()
  where id = p_publication_id and owner_id = v_uid and status in ('uploading', 'pending_review');
  if not found then raise exception 'invalid_publication_state' using errcode = 'P0001'; end if;
  update public.moderation_cases set status = 'dismissed', resolution = 'withdrawn by artist', resolved_at = now()
  where publication_id = p_publication_id and kind = 'review' and status = 'open';
  return jsonb_build_object('publication_id', p_publication_id, 'status', 'cancelled');
end $$;

create or replace function public.publication_status(p_publication_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_pub public.artwork_publications%rowtype;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id;
  if not found or (v_pub.owner_id <> v_uid and not private.has_role(v_uid, array['moderator'])) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.publication_json(v_pub);
end $$;

create or replace function public.my_publications(p_limit int default 60) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(s.j order by s.created_at desc), '[]'::jsonb)
  from (select private.publication_json(a) as j, a.created_at from public.artwork_publications a
        where a.owner_id = auth.uid() and a.status <> 'cancelled'
        order by a.created_at desc limit least(greatest(p_limit, 1), 200)) s
$$;

-- ===== Pipeline service functions (worker / local pipeline only) ===========

create or replace function public.svc_claim_job(p_worker text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job private.render_jobs%rowtype;
begin
  update private.render_jobs set status = 'queued', locked_at = null, locked_by = null, updated_at = now()
  where status = 'running' and locked_at < now() - interval '10 minutes';
  select * into v_job from private.render_jobs
  where status = 'queued' and run_after <= now()
  order by id for update skip locked limit 1;
  if not found then return null; end if;
  update private.render_jobs
     set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = p_worker, updated_at = now()
   where id = v_job.id;
  return jsonb_build_object('id', v_job.id, 'kind', v_job.kind, 'payload', v_job.payload, 'attempts', v_job.attempts + 1);
end $$;

create or replace function public.svc_complete_job(p_job_id bigint, p_ok boolean, p_error text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job private.render_jobs%rowtype;
begin
  select * into v_job from private.render_jobs where id = p_job_id for update;
  if not found then return null; end if;
  if p_ok then
    update private.render_jobs set status = 'done', last_error = null, locked_at = null, updated_at = now() where id = p_job_id;
  elsif v_job.attempts < v_job.max_attempts then
    update private.render_jobs set status = 'queued', last_error = left(p_error, 2000), locked_at = null, locked_by = null,
           run_after = now() + make_interval(secs => least(power(2, v_job.attempts) * 10, 900)), updated_at = now()
     where id = p_job_id;
  else
    update private.render_jobs set status = 'failed', last_error = left(p_error, 2000), locked_at = null, updated_at = now() where id = p_job_id;
    if v_job.kind in ('process_publication', 'publish_publication') then
      update public.artwork_publications set status = 'failed', decision_reason = 'Processing failed. Please try publishing again.', updated_at = now()
      where id = (v_job.payload ->> 'publication_id')::uuid and status in ('processing', 'approved');
    end if;
  end if;
  return jsonb_build_object('id', p_job_id, 'ok', p_ok);
end $$;

create or replace function public.svc_publication_context(p_publication_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_pub public.artwork_publications%rowtype; v_owned boolean;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id;
  if not found then return null; end if;
  select not exists (
    select 1 from jsonb_array_elements(v_pub.cells) c
    left join public.world_plots p on p.gx = (c ->> 0)::int and p.gy = (c ->> 1)::int
    where p.owner_id is distinct from v_pub.owner_id or p.locked) into v_owned;
  return private.publication_json(v_pub) || jsonb_build_object(
    'cells_owned', v_owned, 'unwrapped', private.cells_unwrap(v_pub.cells),
    'moderation', private.cfg('moderation'), 'limits', private.cfg('limits'));
end $$;

-- p_result: {ok, error, preview_path, thumb_path, preview_width, preview_height, color_count, screening:{provider, flagged, categories}}
create or replace function public.svc_publication_processed(p_publication_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pub public.artwork_publications%rowtype; v_mode text := coalesce(private.cfg('moderation') ->> 'mode', 'manual'); v_status text;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found then return null; end if;
  if v_pub.status <> 'processing' then return jsonb_build_object('status', v_pub.status, 'skipped', true); end if;
  if not coalesce((p_result ->> 'ok')::boolean, false) then
    update public.artwork_publications set status = 'rejected', processed_at = now(), updated_at = now(),
           decision_reason = coalesce(p_result ->> 'error', 'The artwork failed validation.')
     where id = p_publication_id;
    return jsonb_build_object('status', 'rejected');
  end if;
  update public.artwork_publications
     set preview_path = p_result ->> 'preview_path', thumb_path = p_result ->> 'thumb_path',
         preview_width = (p_result ->> 'preview_width')::int, preview_height = (p_result ->> 'preview_height')::int,
         color_count = (p_result ->> 'color_count')::int, screening = p_result -> 'screening',
         processed_at = now(), updated_at = now()
   where id = p_publication_id;
  if coalesce((p_result -> 'screening' ->> 'flagged')::boolean, false) then
    v_status := 'rejected';
    update public.artwork_publications set status = v_status,
           decision_reason = 'Automated safety screening flagged this artwork. You can appeal this decision.'
     where id = p_publication_id;
    insert into public.moderation_cases (kind, priority, publication_id, subject_player_id, reason, details)
    values ('auto_flag', 1, p_publication_id, v_pub.owner_id, 'automated_screening', coalesce(p_result -> 'screening', '{}'::jsonb));
  elsif v_mode = 'auto' or (v_mode = 'screened' and coalesce(p_result -> 'screening' ->> 'provider', 'none') <> 'none') then
    v_status := 'approved';
    update public.artwork_publications set status = v_status, reviewed_at = now() where id = p_publication_id;
    perform private.enqueue_job('publish_publication', jsonb_build_object('publication_id', p_publication_id));
  else
    v_status := 'pending_review';
    update public.artwork_publications set status = v_status where id = p_publication_id;
    insert into public.moderation_cases (kind, priority, publication_id, subject_player_id, reason)
    values ('review', 2, p_publication_id, v_pub.owner_id, 'new_publication');
  end if;
  return jsonb_build_object('status', v_status);
end $$;

create or replace function public.svc_reserve_revs(p_count int) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(nextval('private.art_tile_rev_seq')), '[]'::jsonb) from generate_series(1, greatest(p_count, 0))
$$;

-- p_tiles: [[z, x, y], ...] -> [[z, x, y, rev], ...] for those that exist
create or replace function public.svc_get_art_tiles(p_tiles jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_array(t.z, t.x, t.y, t.rev)), '[]'::jsonb)
  from jsonb_array_elements(p_tiles) r
  join public.art_tiles t on t.z = (r ->> 0)::int and t.x = (r ->> 1)::int and t.y = (r ->> 2)::int
$$;

-- p_tiles: [[z, x, y, rev_or_null, bytes], ...]; null rev deletes the index entry.
create or replace function public.svc_set_art_tiles(p_tiles jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; n int := 0;
begin
  for r in select * from jsonb_array_elements(p_tiles) loop
    if r -> 3 is null or jsonb_typeof(r -> 3) = 'null' then
      delete from public.art_tiles where z = (r ->> 0)::int and x = (r ->> 1)::int and y = (r ->> 2)::int;
    else
      insert into public.art_tiles (z, x, y, rev, bytes, updated_at)
      values ((r ->> 0)::int, (r ->> 1)::int, (r ->> 2)::int, (r ->> 3)::bigint, (r ->> 4)::int, now())
      on conflict (z, x, y) do update set rev = excluded.rev, bytes = excluded.bytes, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.svc_record_assets(p_assets jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.asset_metadata (owner_id, publication_id, kind, bucket, path, bytes, width, height, sha256, content_type)
  select (a ->> 'owner_id')::uuid, (a ->> 'publication_id')::uuid, a ->> 'kind', a ->> 'bucket', a ->> 'path',
         (a ->> 'bytes')::int, (a ->> 'width')::int, (a ->> 'height')::int, a ->> 'sha256', a ->> 'content_type'
  from jsonb_array_elements(p_assets) a
  on conflict (bucket, path) do nothing
$$;

-- Final step of publishing. p_cell_revs: {"gx_gy": rev | null}
create or replace function public.svc_mark_published(p_publication_id uuid, p_cell_revs jsonb, p_preview_public jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pub public.artwork_publications%rowtype; v_prev uuid[]; v_cell jsonb; v_gx int; v_gy int; v_rev bigint;
  v_reward jsonb := private.cfg('economy') -> 'publish_reward'; v_tokens_today int; e record;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found then return null; end if;
  if v_pub.status <> 'approved' then return jsonb_build_object('status', v_pub.status, 'skipped', true); end if;

  select coalesce(array_agg(distinct wp.art_publication_id), '{}') into v_prev
  from jsonb_array_elements(v_pub.cells) c
  join public.world_plots wp on wp.gx = (c ->> 0)::int and wp.gy = (c ->> 1)::int
  where wp.art_publication_id is not null and wp.art_publication_id <> p_publication_id;

  for v_cell in select * from jsonb_array_elements(v_pub.cells) loop
    v_gx := (v_cell ->> 0)::int; v_gy := (v_cell ->> 1)::int;
    v_rev := (p_cell_revs ->> private.cell_key(v_gx, v_gy))::bigint;
    update public.world_plots set art_publication_id = p_publication_id, art_rev = v_rev, updated_at = now()
    where gx = v_gx and gy = v_gy and owner_id = v_pub.owner_id;
    if found then
      insert into public.plot_art_history (gx, gy, publication_id, rev) values (v_gx, v_gy, p_publication_id, v_rev);
    end if;
  end loop;

  update public.artwork_publications
     set status = 'published', published_at = now(), updated_at = now(),
         preview_path = coalesce(p_preview_public ->> 'preview_path', preview_path),
         thumb_path = coalesce(p_preview_public ->> 'thumb_path', thumb_path)
   where id = p_publication_id;
  update public.artwork_publications a set status = 'superseded', updated_at = now()
  where a.id = any(v_prev) and a.status = 'published'
    and not exists (select 1 from public.world_plots wp where wp.art_publication_id = a.id);
  update public.moderation_cases set status = 'resolved', resolution = 'approved', resolved_at = now()
  where publication_id = p_publication_id and kind = 'review' and status = 'open';

  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy, publication_id)
  values ('art', v_pub.min_gx, v_pub.min_gy, v_pub.max_gx, v_pub.max_gy, p_publication_id);

  -- rewards for approved participation (tokens are capped per day)
  select count(*) into v_tokens_today from public.resource_ledger
  where player_id = v_pub.owner_id and resource = 'gallery_tokens' and reason = 'publish_reward' and created_at > now() - interval '1 day';
  perform private.grant(v_pub.owner_id, jsonb_build_object(
      'brush_points', coalesce((v_reward ->> 'brush_points')::int, 0) + v_pub.plot_count * coalesce((v_reward ->> 'brush_points_per_plot')::int, 0),
      'ink', coalesce((v_reward ->> 'ink')::int, 0),
      'gallery_tokens', case when v_tokens_today < coalesce((v_reward ->> 'daily_token_cap')::int, 3)
                             then coalesce((v_reward ->> 'gallery_tokens')::int, 0) else 0 end),
    'publish_reward', 'publication', p_publication_id::text, 'publish:' || p_publication_id::text);

  -- event participation
  for e in
    select id, region from public.event_definitions
    where status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
      and kind in ('color_the_world', 'city_canvas', 'great_mural', 'custom')
  loop
    if e.region is null or (
      v_pub.max_gx >= (e.region ->> 'min_gx')::int and v_pub.min_gx <= (e.region ->> 'max_gx')::int and
      v_pub.max_gy >= (e.region ->> 'min_gy')::int and v_pub.min_gy <= (e.region ->> 'max_gy')::int) then
      insert into public.event_progress (event_id, player_id, progress, score)
      values (e.id, v_pub.owner_id, jsonb_build_object('publications', 1, 'plots_painted', v_pub.plot_count,
                                                       'largest', v_pub.plot_count), v_pub.plot_count)
      on conflict (event_id, player_id) do update set
        progress = jsonb_build_object(
          'publications', coalesce((public.event_progress.progress ->> 'publications')::int, 0) + 1,
          'plots_painted', coalesce((public.event_progress.progress ->> 'plots_painted')::int, 0) + v_pub.plot_count,
          'largest', greatest(coalesce((public.event_progress.progress ->> 'largest')::int, 0), v_pub.plot_count)),
        score = public.event_progress.score + v_pub.plot_count,
        updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('status', 'published', 'superseded', to_jsonb(v_prev),
                            'achievements', private.evaluate_achievements(v_pub.owner_id));
end $$;

-- Which cells currently show this publication, and what to restore there.
create or replace function public.svc_unpublish_plan(p_publication_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'gx', wp.gx, 'gy', wp.gy,
    'restore_publication_id', r.publication_id, 'restore_rev', r.rev)), '[]'::jsonb)
  from public.world_plots wp
  left join lateral (
    select h.publication_id, h.rev from public.plot_art_history h
    join public.artwork_publications a on a.id = h.publication_id
    where h.gx = wp.gx and h.gy = wp.gy and h.publication_id <> p_publication_id and h.rev is not null
      and a.status in ('published', 'superseded') and a.owner_id = wp.owner_id
    order by h.id desc limit 1
  ) r on true
  where wp.art_publication_id = p_publication_id
$$;

-- p_cells: [{gx, gy, restore_publication_id, restore_rev}]
create or replace function public.svc_mark_unpublished(p_publication_id uuid, p_cells jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cell jsonb; v_pub public.artwork_publications%rowtype; v_restored uuid[] := '{}';
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id;
  for v_cell in select * from jsonb_array_elements(p_cells) loop
    update public.world_plots
       set art_publication_id = nullif(v_cell ->> 'restore_publication_id', '')::uuid,
           art_rev = (v_cell ->> 'restore_rev')::bigint, updated_at = now()
     where gx = (v_cell ->> 'gx')::int and gy = (v_cell ->> 'gy')::int and art_publication_id = p_publication_id;
    if found then
      insert into public.plot_art_history (gx, gy, publication_id, rev)
      values ((v_cell ->> 'gx')::int, (v_cell ->> 'gy')::int, nullif(v_cell ->> 'restore_publication_id', '')::uuid, (v_cell ->> 'restore_rev')::bigint);
      if nullif(v_cell ->> 'restore_publication_id', '') is not null then
        v_restored := array_append(v_restored, (v_cell ->> 'restore_publication_id')::uuid);
      end if;
    end if;
  end loop;
  update public.artwork_publications set status = 'published', updated_at = now()
  where id = any(v_restored) and status = 'superseded';
  if v_pub.id is not null then
    insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy, publication_id)
    values ('art', v_pub.min_gx, v_pub.min_gy, v_pub.max_gx, v_pub.max_gy, p_publication_id);
  end if;
  return jsonb_build_object('restored', to_jsonb(v_restored));
end $$;

create or replace function public.svc_cells_cleared(p_cells jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cell jsonb;
begin
  for v_cell in select * from jsonb_array_elements(p_cells) loop
    insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy)
    values ('art', (v_cell ->> 0)::int, (v_cell ->> 1)::int, (v_cell ->> 0)::int, (v_cell ->> 1)::int);
  end loop;
end $$;

create or replace function public.svc_housekeeping() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sessions int; v_limits int; v_updates int;
begin
  update public.minigame_sessions set status = 'expired' where status = 'active' and expires_at < now() - interval '5 minutes';
  get diagnostics v_sessions = row_count;
  delete from private.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_limits = row_count;
  delete from public.map_updates where created_at < now() - interval '7 days';
  get diagnostics v_updates = row_count;
  delete from private.idempotent_ops where created_at < now() - interval '30 days';
  return jsonb_build_object('expired_sessions', v_sessions, 'rate_limit_rows', v_limits, 'map_updates', v_updates);
end $$;
