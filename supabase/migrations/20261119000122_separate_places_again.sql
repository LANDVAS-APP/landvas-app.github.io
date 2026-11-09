-- v0.9.5 Places are separate again (undoes v0.9.4 "one place per plot type").
--
-- Every plot (or merged group of plots) has its own arcade, farm, business, sanctuary, realm, Estate and Domain again,
-- each levelled on its own, exactly as before v0.9.4. What stays from v0.9.3: merging folds the merged plots' places
-- together, and switching land between a type and its Estate/Domain keeps every tier's progress.
--
-- Undoing the join of v0.9.4 on existing data, without anyone losing anything:
--   • every place goes back to the plot it came from. The audit log's type-change entry for a plot and the place
--     row it created share one transaction timestamp, so each place is matched to its original plot exactly;
--     its cabinets, decor, producers, upgrades, seed and sanctuary layout were never touched and come back as they were;
--   • the join reset the split-off places' XP to 0, so each gets back the joined place's level (never less than it had);
--   • play counts, harvests, tips and play history stay with the joined place (they were added to it, not lost);
--     crops and creatures that moved stay where they are (creatures can be moved between sanctuaries as always);
--   • a plot whose own place can't be found gets a new one at the joined place's level.

create or replace function private.is_realm_kind(p_kind text) returns boolean language sql stable as $$
  select p_kind in ('mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl') or private.estate_base(p_kind) is not null
$$;
revoke all on function private.is_realm_kind(text) from public, anon, authenticated;

-- ---- stop sharing ---------------------------------------------------------------------------------------------------
drop trigger if exists place_home on public.canvas_groups;
drop function if exists private.place_home_trg();
drop index if exists public.arcades_one_per_owner, public.farms_one_per_owner, public.businesses_one_per_owner,
  public.habitats_one_plot_per_owner, public.realms_one_per_owner;

-- merging folds the merging groups' places together again (v0.9.3)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.fuse_groups(jsonb,text)'::regprocedure);
  if position('private.place_carry' in d) = 0 then
    n := replace(d, '  perform private.habitat_after_fuse((v_res ->> ''id'')::uuid);',
                    '  perform private.place_carry((v_res ->> ''id'')::uuid, v_ids);' || chr(10) || '  perform private.habitat_after_fuse((v_res ->> ''id'')::uuid);');
    if n = d then raise exception 'separate places: habitat_after_fuse call not found in fuse_groups'; end if;
    execute n;
  end if;
end $$;

-- ---- every plot finds its own place again (the definitions from before v0.9.4) -------------------------------------
CREATE OR REPLACE FUNCTION private.group_json(p_group uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'status', g.status, 'plot_count', g.plot_count, 'kind', g.kind,
    'habitat_id', (select h.id from public.habitats h where h.group_id = g.id),
    'farm_id', (select f.id from public.farms f where f.group_id = g.id),
    'business_id', (select b.id from public.businesses b where b.group_id = g.id),
    'arcade_id', (select a.id from public.arcades a where a.group_id = g.id),
    'realm_id', (select r.id from public.realms r where r.group_id = g.id and r.kind = g.kind),
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
$function$;

CREATE OR REPLACE FUNCTION public.arcade_for_plot(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('arcade_id', a.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'level', (private.arc_level(a.xp) ->> 'level')::int, 'plays', a.plays, 'machines', (select count(*) from jsonb_object_keys(a.machines)))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'arcade'
  join public.arcades a on a.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$function$;

CREATE OR REPLACE FUNCTION public.farm_for_plot(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('farm_id', f.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'growing', (select count(*) from public.farm_beds b where b.farm_id = f.id))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'farm'
  join public.farms f on f.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$function$;

CREATE OR REPLACE FUNCTION public.biz_for_plot(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('business_id', b.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'alltime', coalesce((select alltime from public.biz_state s where s.player_id = g.owner_id), 0))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'business'
  join public.businesses b on b.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$function$;

CREATE OR REPLACE FUNCTION public.realm_for_plot(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('realm_id', r.id, 'kind', r.kind, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'level', private.rlm_lv(r.xp), 'plays', r.plays)
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id
  join public.realms r on r.group_id = g.id and r.kind = g.kind
  where m.gx = p_gx and m.gy = p_gy
$function$;

CREATE OR REPLACE FUNCTION public.habitat_for_plot(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('habitat_id', h.id, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'creatures', (select count(*) from public.inkborn c where c.habitat_id = h.id))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'habitat'
  join public.habitats h on h.group_id = g.id
  where m.gx = p_gx and m.gy = p_gy
$function$;

CREATE OR REPLACE FUNCTION public.habitat_residents(p_groups jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_ids uuid[];
begin
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 64 then
    raise exception 'too_many_groups' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_ids from jsonb_array_elements_text(p_groups) x
   where x ~ '^[0-9a-fA-F-]{36}$';
  return (
    select coalesce(jsonb_object_agg(g.id::text, coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'genome', c.genome, 'personality', c.personality,
               'mine', c.owner_id is not distinct from v_uid) || private.inkborn_now(c) order by c.created_at)
        from (select * from public.inkborn c where c.habitat_id = h.id and c.job is null order by c.created_at limit 8) c
    ), '[]'::jsonb)), '{}'::jsonb)
    from public.canvas_groups g
    join public.habitats h on h.group_id = g.id
    where g.id = any(v_ids) and g.kind = 'habitat' and g.status = 'active' and private.visible_to(g.owner_id, v_uid));
end $function$;

CREATE OR REPLACE FUNCTION private.habitat_capacity(h habitats)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select case when h.kind = 'starter' then coalesce((private.ink_cfg() ->> 'starter_capacity')::int, 4)
    else coalesce((private.ink_cfg() ->> 'capacity_base')::int, 3)
         + coalesce((private.ink_cfg() ->> 'capacity_per_plot')::int, 2) * greatest(coalesce((select plot_count from public.canvas_groups where id = h.group_id), 1) - 1, 0) end
$function$;

CREATE OR REPLACE FUNCTION private.ensure_kind_row(p_group uuid, p_owner uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare v_new boolean;
begin
  if p_kind = 'farm' then insert into public.farms (owner_id, group_id) values (p_owner, p_group) on conflict (group_id) do update set owner_id = excluded.owner_id; end if;
  if p_kind = 'business' then insert into public.businesses (owner_id, group_id) values (p_owner, p_group) on conflict (group_id) do update set owner_id = excluded.owner_id; end if;
  if p_kind = 'arcade' then insert into public.arcades (owner_id, group_id) values (p_owner, p_group) on conflict (group_id) do update set owner_id = excluded.owner_id; perform private.arc_player(p_owner); end if;
  if p_kind = 'habitat' and not exists (select 1 from public.habitats where group_id = p_group) then
    insert into public.habitats (owner_id, group_id, kind) values (p_owner, p_group, 'plot');
  end if;
  if p_kind in ('mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl') or private.estate_base(p_kind) is not null then
    -- an Estate's charter: a head start of its currency, the first time a player opens that kind of Estate
    v_new := private.estate_base(p_kind) is not null and not exists (select 1 from public.realm_players where player_id = p_owner and kind = p_kind);
    insert into public.realms (owner_id, group_id, kind) values (p_owner, p_group, p_kind) on conflict (group_id, kind) do update set owner_id = excluded.owner_id;
    perform private.rlm_player(p_owner, p_kind);
    if v_new then
      update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object(private.rlm_cfg(p_kind) ->> 'currency', coalesce((private.rlm_cfg(p_kind) ->> 'charter')::int, 0)))
       where player_id = p_owner and kind = p_kind;
    end if;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.set_group_kind(p_group_id uuid, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups%rowtype; h public.habitats%rowtype; v_starter uuid; v_fee int := 0; v_base text;
begin
  perform private.rate_limit('set_group_kind', 60, 3600);
  select * into g from public.canvas_groups where id = p_group_id for update;
  if not found or g.owner_id <> v_uid or g.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_kinds where id = p_kind and enabled) then raise exception 'invalid_plot_kind' using errcode = 'P0001'; end if;
  if g.kind = p_kind then return private.group_json(g.id); end if;
  -- an Estate is an upgrade of its base type, for land holding a full 2x2 square
  v_base := private.estate_base(p_kind);
  if v_base is not null then
    if private.kind_family(g.kind) <> v_base then raise exception 'estate_wrong_type' using errcode = 'P0001', detail = v_base; end if;
    if not private.group_has_square(g.id, private.tier_square(p_kind)) then
      raise exception '%', case when private.tier_square(p_kind) = 3 then 'domain_needs_square' else 'estate_needs_square' end using errcode = 'P0001';
    end if;
  end if;
  -- choosing what a brand-new plot becomes is free, and so is moving between a type and its Estate; otherwise a little Ink
  if private.kind_family(g.kind) <> private.kind_family(p_kind)
     and (g.kind_changed_at is not null or g.created_at < now() - make_interval(mins => coalesce((private.cfg('plot_switch') ->> 'free_minutes')::int, 15))) then
    v_fee := coalesce((private.cfg('plot_switch') ->> 'fee')::int, 20);
    if v_fee > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_fee), 'plot_switch', 'group', g.id::text, 'plot-switch:' || g.id || ':' || gen_random_uuid()); end if;
  end if;
  if exists (select 1 from public.artwork_publications where group_id = g.id and status in ('processing', 'pending_review', 'approved', 'uploading')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select * into h from public.habitats where group_id = g.id;
  if p_kind = 'business' then perform private.ensure_kind_row(g.id, v_uid, p_kind); perform private.biz_lock(v_uid);
  elsif p_kind <> 'habitat' then perform private.ensure_kind_row(g.id, v_uid, p_kind);
  end if;
  if p_kind = 'habitat' then
    if h.id is null then insert into public.habitats (owner_id, group_id, kind) values (v_uid, g.id, 'plot') returning * into h; end if;
    -- creatures that lived here before come home
    update public.inkborn set habitat_id = h.id, prev_habitat_id = null where owner_id = v_uid and prev_habitat_id = h.id;
  elsif h.id is not null then
    -- the habitat (layout + who lived here) is kept; its creatures wait in the starter sanctuary
    v_starter := private.starter_habitat(v_uid);
    update public.inkborn set prev_habitat_id = h.id, habitat_id = v_starter where habitat_id = h.id;
  end if;
  update public.canvas_groups set kind = p_kind, kind_changed_at = now(), updated_at = now() where id = g.id;
  perform private.audit('group.kind', 'group', g.id::text, jsonb_build_object('from', g.kind, 'to', p_kind));
  return private.group_json(g.id) || jsonb_build_object('fee', v_fee, 'balances', private.balances(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION private.habitat_after_fuse(p_group uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare g public.canvas_groups%rowtype; v_h uuid;
begin
  select * into g from public.canvas_groups where id = p_group;
  if g.kind <> 'habitat' then return; end if;
  select id into v_h from public.habitats where group_id = g.id;
  if v_h is null then insert into public.habitats (owner_id, group_id, kind) values (g.owner_id, g.id, 'plot') returning id into v_h; end if;
  update public.inkborn i set habitat_id = v_h
   from public.habitats h join public.canvas_groups mg on mg.id = h.group_id
   where i.habitat_id = h.id and h.id <> v_h and mg.merged_into = g.id;
end $function$;

-- ---- give every place back to its own plot -------------------------------------------------------------------------
/** Split one player's places of one type back onto their own plots (see the header). */
create or replace function private.place_split(p_owner uuid, p_kind text) returns void language plpgsql as $$
declare
  v_tbl text; v_filter text; v_ins text; v_xp boolean; v_kept bigint; v_groups uuid[]; g uuid; v_r uuid; r record; v_same boolean;
begin
  v_tbl := case when p_kind = 'arcade' then 'arcades' when p_kind = 'farm' then 'farms' when p_kind = 'business' then 'businesses'
                when p_kind = 'habitat' then 'habitats' else 'realms' end;
  v_filter := format('owner_id = %L', p_owner) || case v_tbl when 'habitats' then ' and kind = ''plot''' when 'realms' then format(' and kind = %L', p_kind) else '' end;
  v_xp := v_tbl in ('arcades', 'realms');
  if v_xp then execute format('select max(xp) from public.%I where %s', v_tbl, v_filter) into v_kept; end if;
  create temp table if not exists _place_split (row_id uuid primary key, grp uuid not null unique, moved boolean not null default true) on commit drop;
  truncate _place_split;
  v_groups := array(select id from public.canvas_groups where owner_id = p_owner and kind = p_kind and status = 'active' order by plot_count desc, created_at, id);

  -- 1) the place each plot itself created (same transaction as its type-change audit entry)
  foreach g in array v_groups loop
    execute format('select r.id from public.%I r where %s and r.id not in (select row_id from _place_split)
                      and exists (select 1 from public.audit_logs a where a.action = ''group.kind'' and a.target_id = %L and a.details ->> ''to'' = %L and a.created_at = r.created_at)
                    order by r.created_at desc limit 1', v_tbl, v_filter, g::text, p_kind) into v_r;
    if v_r is not null then insert into _place_split (row_id, grp) values (v_r, g); end if;
  end loop;
  -- 2) a plot still holding a place keeps it
  foreach g in array v_groups loop
    continue when exists (select 1 from _place_split where grp = g);
    execute format('select id from public.%I where %s and group_id = %L and id not in (select row_id from _place_split) limit 1', v_tbl, v_filter, g) into v_r;
    if v_r is not null then insert into _place_split (row_id, grp) values (v_r, g); end if;
  end loop;
  -- 3) places waiting on land that's another type now go back to that land
  for r in execute format('select id, created_at from public.%I where %s and id not in (select row_id from _place_split) order by created_at', v_tbl, v_filter) loop
    g := null;
    select cg.id into g from public.audit_logs a join public.canvas_groups cg on cg.id::text = a.target_id and cg.owner_id = p_owner
     where a.action = 'group.kind' and a.details ->> 'to' = p_kind and a.created_at = r.created_at
       and not (cg.id = any(v_groups)) and not exists (select 1 from _place_split s where s.grp = cg.id)
     order by a.id desc limit 1;
    if g is not null then insert into _place_split (row_id, grp) values (r.id, g); end if;
  end loop;

  -- places already on their own plot weren't touched by the join
  for r in select * from _place_split loop
    execute format('select exists (select 1 from public.%I where id = %L and group_id = %L)', v_tbl, r.row_id, r.grp) into v_same;
    if v_same then update _place_split set moved = false where row_id = r.row_id; end if;
  end loop;
  execute format('update public.%I set group_id = null where %s and (group_id = any(%L::uuid[]) or id in (select row_id from _place_split) or group_id in (select grp from _place_split))', v_tbl, v_filter, v_groups);
  for r in select * from _place_split loop
    execute format('update public.%I set group_id = %L where id = %L', v_tbl, r.grp, r.row_id);
  end loop;
  -- 4) a plot whose place can't be found gets a new one
  foreach g in array v_groups loop
    continue when exists (select 1 from _place_split where grp = g);
    v_ins := case v_tbl when 'habitats' then format('insert into public.habitats (owner_id, group_id, kind) values (%L, %L, ''plot'') returning id', p_owner, g)
                        when 'realms' then format('insert into public.realms (owner_id, group_id, kind) values (%L, %L, %L) returning id', p_owner, g, p_kind)
                        else format('insert into public.%I (owner_id, group_id) values (%L, %L) returning id', v_tbl, p_owner, g) end;
    execute v_ins into v_r;
    insert into _place_split (row_id, grp) values (v_r, g);
  end loop;
  -- the join reset the split-off places' XP: they get the joined place's level back
  if v_xp and coalesce(v_kept, 0) > 0 then
    execute format('update public.%I set xp = %s where xp = 0 and id in (select row_id from _place_split where moved and grp = any(%L::uuid[]))', v_tbl, v_kept, v_groups);
  end if;
end $$;
revoke all on function private.place_split(uuid, text) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in
    select owner_id, 'arcade' as kind from public.arcades union select owner_id, 'farm' from public.farms
    union select owner_id, 'business' from public.businesses union select owner_id, 'habitat' from public.habitats where kind = 'plot'
    union select owner_id, kind from public.realms
    union select owner_id, kind from public.canvas_groups where status = 'active' and (kind in ('arcade', 'farm', 'business', 'habitat') or private.is_realm_kind(kind))
  loop
    perform private.place_split(r.owner_id, r.kind);
  end loop;
end $$;
