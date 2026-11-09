-- v0.9.4 🏠 One place per plot type.
--
-- Every plot of a type now opens the same place: all your arcade plots walk into one arcade, all your farm plots into
-- one farm, all your habitat plots into one sanctuary, and the same for businesses, every realm type, every Estate and
-- every Domain. There are no separate instances to level up one by one any more.
--
--   • Each player has one place per type. It lives on their biggest piece of land of that type (its "area": the
--     merged group with the most plots, oldest on a tie), which decides its size, name and how many games are open.
--     The area follows your land automatically when you merge, detach or switch a plot's type.
--   • Places that already exist are joined into one. The most-progressed one (highest level; most harvests, tips or
--     creatures) becomes the place. From the others it keeps the best level of every cabinet, producer and upgrade,
--     all owned decor, the play count and play history (leaderboards); growing crops move into free beds and every
--     creature moves into the one sanctuary.
--   • A sanctuary's room for creatures counts all your habitat plots, so joining habitats never leaves anyone out.
--   • Switching a plot away from a type keeps the place; it waits for you while you still own any plot of that type,
--     and comes back exactly as it was when you make a plot that type again.

-- ---- which place types there are -------------------------------------------------------------------------------------
create or replace function private.is_realm_kind(p_kind text) returns boolean language sql stable as $$
  select p_kind in ('mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl') or private.estate_base(p_kind) is not null
$$;

/** A player's biggest active land of a type: that type's place lives there. */
create or replace function private.place_area(p_owner uuid, p_kind text) returns uuid language sql stable as $$
  select id from public.canvas_groups where owner_id = p_owner and kind = p_kind and status = 'active'
   order by plot_count desc, created_at, id limit 1
$$;

/** The player's one place of a type (its id in that type's table), or null. */
create or replace function private.place_id(p_owner uuid, p_kind text) returns uuid language sql stable as $$
  select case
    when p_kind = 'arcade' then (select id from public.arcades where owner_id = p_owner order by (group_id is not null) desc, xp desc, plays desc, created_at, id limit 1)
    when p_kind = 'farm' then (select id from public.farms where owner_id = p_owner order by (group_id is not null) desc, harvests desc, created_at, id limit 1)
    when p_kind = 'business' then (select id from public.businesses where owner_id = p_owner order by (group_id is not null) desc, tips desc, created_at, id limit 1)
    when p_kind = 'habitat' then (select h.id from public.habitats h where h.owner_id = p_owner and h.kind = 'plot'
                                   order by (h.group_id is not null) desc, (select count(*) from public.inkborn c where c.habitat_id = h.id) desc, h.created_at, h.id limit 1)
    when private.is_realm_kind(p_kind) then (select id from public.realms where owner_id = p_owner and kind = p_kind order by (group_id is not null) desc, xp desc, plays desc, created_at, id limit 1)
  end
$$;

/** Join all of a player's places of one type into one: the most-progressed is kept, the others fold into it and are
 *  unhooked from their land. Returns the kept place. */
create or replace function private.place_unify(p_owner uuid, p_kind text) returns uuid language plpgsql as $$
declare v_keep uuid; v_others uuid[]; r record;
begin
  if p_kind = 'arcade' then
    select id into v_keep from public.arcades where owner_id = p_owner order by xp desc, plays desc, (group_id is not null) desc, created_at, id limit 1;
    if v_keep is null then return null; end if;
    v_others := array(select id from public.arcades where owner_id = p_owner and id <> v_keep and (group_id is not null or xp > 0 or plays > 0));
    for r in select * from public.arcades where id = any(v_others) loop
      update public.arcades set plays = plays + r.plays, machines = private.jmax(machines, r.machines), decor_owned = private.junion(decor_owned, r.decor_owned) where id = v_keep;
    end loop;
    update public.arcade_plays set arcade_id = v_keep where arcade_id = any(v_others);
    update public.arcades set group_id = null, xp = 0, plays = 0 where id = any(v_others);
  elsif p_kind = 'farm' then
    select id into v_keep from public.farms where owner_id = p_owner order by harvests desc, (group_id is not null) desc, created_at, id limit 1;
    if v_keep is null then return null; end if;
    v_others := array(select id from public.farms where owner_id = p_owner and id <> v_keep);
    update public.farms set harvests = harvests + coalesce((select sum(harvests) from public.farms where id = any(v_others)), 0) where id = v_keep;
    update public.farm_games set farm_id = v_keep where farm_id = any(v_others);
    update public.farms set group_id = null, harvests = 0 where id = any(v_others);
  elsif p_kind = 'business' then
    select id into v_keep from public.businesses where owner_id = p_owner order by tips desc, (group_id is not null) desc, created_at, id limit 1;
    if v_keep is null then return null; end if;
    v_others := array(select id from public.businesses where owner_id = p_owner and id <> v_keep);
    update public.businesses set tips = tips + coalesce((select sum(tips) from public.businesses where id = any(v_others)), 0) where id = v_keep;
    update public.biz_games set business_id = v_keep where business_id = any(v_others);
    update public.businesses set group_id = null, tips = 0 where id = any(v_others);
  elsif p_kind = 'habitat' then
    select h.id into v_keep from public.habitats h where h.owner_id = p_owner and h.kind = 'plot'
     order by (select count(*) from public.inkborn c where c.habitat_id = h.id or c.prev_habitat_id = h.id) desc, (h.group_id is not null) desc, h.created_at, h.id limit 1;
    if v_keep is null then return null; end if;
    v_others := array(select id from public.habitats where owner_id = p_owner and kind = 'plot' and id <> v_keep);
    update public.inkborn set habitat_id = v_keep where habitat_id = any(v_others);
    update public.inkborn set prev_habitat_id = v_keep where prev_habitat_id = any(v_others);
    update public.habitats set group_id = null where id = any(v_others);
  elsif private.is_realm_kind(p_kind) then
    select id into v_keep from public.realms where owner_id = p_owner and kind = p_kind order by xp desc, plays desc, (group_id is not null) desc, created_at, id limit 1;
    if v_keep is null then return null; end if;
    v_others := array(select id from public.realms where owner_id = p_owner and kind = p_kind and id <> v_keep and (group_id is not null or xp > 0 or plays > 0));
    for r in select * from public.realms where id = any(v_others) loop
      update public.realms set plays = plays + r.plays, producers = private.jmax(producers, r.producers), upgrades = private.jmax(upgrades, r.upgrades) where id = v_keep;
    end loop;
    update public.realm_runs set realm_id = v_keep where realm_id = any(v_others);
    update public.realms set group_id = null, xp = 0, plays = 0 where id = any(v_others);
  end if;
  -- the kept place sits on the biggest land of its type (if there is any)
  perform private.place_home(p_owner, p_kind);
  return v_keep;
end $$;

/** Put a player's place of a type on its area (their biggest land of that type), creating it if they have none yet.
 *  p_group: land just becoming this type (its kind may not be set yet). */
create or replace function private.place_home(p_owner uuid, p_kind text, p_group uuid default null) returns uuid language plpgsql as $$
declare v_area uuid; v_id uuid; v_cur uuid; v_cap int; v_free int[]; b record; i int := 1;
begin
  if p_owner is null or p_kind is null then return null; end if;
  if not (p_kind in ('arcade', 'farm', 'business', 'habitat') or private.is_realm_kind(p_kind)) then return null; end if;
  v_area := coalesce(private.place_area(p_owner, p_kind), p_group);
  v_id := private.place_id(p_owner, p_kind);
  if v_area is null then return v_id; end if;
  if p_kind = 'arcade' then
    if v_id is null then insert into public.arcades (owner_id, group_id) values (p_owner, v_area) returning id into v_id;
    else select group_id into v_cur from public.arcades where id = v_id;
      if v_cur is distinct from v_area then update public.arcades set group_id = v_area where id = v_id; end if;
    end if;
    perform private.arc_player(p_owner);
  elsif p_kind = 'farm' then
    if v_id is null then insert into public.farms (owner_id, group_id) values (p_owner, v_area) returning id into v_id;
    else select group_id into v_cur from public.farms where id = v_id;
      if v_cur is distinct from v_area then update public.farms set group_id = v_area where id = v_id; end if;
    end if;
  elsif p_kind = 'business' then
    if v_id is null then insert into public.businesses (owner_id, group_id) values (p_owner, v_area) returning id into v_id;
    else select group_id into v_cur from public.businesses where id = v_id;
      if v_cur is distinct from v_area then update public.businesses set group_id = v_area where id = v_id; end if;
    end if;
  elsif p_kind = 'habitat' then
    if v_id is null then insert into public.habitats (owner_id, group_id, kind) values (p_owner, v_area, 'plot') returning id into v_id;
    else select group_id into v_cur from public.habitats where id = v_id;
      if v_cur is distinct from v_area then update public.habitats set group_id = v_area where id = v_id; end if;
    end if;
  else
    if v_id is null then insert into public.realms (owner_id, group_id, kind) values (p_owner, v_area, p_kind) returning id into v_id;
    else select group_id into v_cur from public.realms where id = v_id;
      if v_cur is distinct from v_area then update public.realms set group_id = v_area where id = v_id; end if;
    end if;
  end if;
  return v_id;
end $$;

-- ---- making a plot a type: the player's one place --------------------------------------------------------------------
create or replace function private.ensure_kind_row(p_group uuid, p_owner uuid, p_kind text) returns void language plpgsql as $$
declare v_new boolean;
begin
  -- an Estate's charter: a head start of its currency, the first time a player opens that kind of Estate
  v_new := private.estate_base(p_kind) is not null and not exists (select 1 from public.realm_players where player_id = p_owner and kind = p_kind);
  perform private.place_home(p_owner, p_kind, p_group);
  if private.is_realm_kind(p_kind) then
    perform private.rlm_player(p_owner, p_kind);
    if v_new then
      update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object(private.rlm_cfg(p_kind) ->> 'currency', coalesce((private.rlm_cfg(p_kind) ->> 'charter')::int, 0)))
       where player_id = p_owner and kind = p_kind;
    end if;
  end if;
end $$;

-- the place follows the land: when land changes type, size, status or owner, re-home the places involved
create or replace function private.place_home_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform private.place_home(old.owner_id, old.kind); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform private.place_home(new.owner_id, new.kind); end if;
  return null;
end $$;
drop trigger if exists place_home on public.canvas_groups;
create constraint trigger place_home after insert or update of kind, plot_count, status, owner_id or delete on public.canvas_groups
  deferrable initially deferred for each row execute function private.place_home_trg();

-- ---- switching type: the sanctuary waits while you have no habitat land --------------------------------------------
create or replace function public.set_group_kind(p_group_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups%rowtype; v_h uuid; v_starter uuid; v_fee int := 0; v_base text;
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
  perform private.ensure_kind_row(g.id, v_uid, p_kind);
  if p_kind = 'business' then perform private.biz_lock(v_uid); end if;
  if p_kind = 'habitat' then
    -- creatures that lived in the sanctuary come home
    v_h := private.place_id(v_uid, 'habitat');
    update public.inkborn set habitat_id = v_h, prev_habitat_id = null where owner_id = v_uid and prev_habitat_id = v_h;
  elsif g.kind = 'habitat' and not exists (select 1 from public.canvas_groups where owner_id = v_uid and kind = 'habitat' and status = 'active' and id <> g.id) then
    -- the last habitat land: the sanctuary (layout + who lived here) is kept; its creatures wait in the starter sanctuary
    v_h := private.place_id(v_uid, 'habitat');
    if v_h is not null then
      v_starter := private.starter_habitat(v_uid);
      update public.inkborn set prev_habitat_id = v_h, habitat_id = v_starter where habitat_id = v_h;
    end if;
  end if;
  update public.canvas_groups set kind = p_kind, kind_changed_at = now(), updated_at = now() where id = g.id;
  perform private.audit('group.kind', 'group', g.id::text, jsonb_build_object('from', g.kind, 'to', p_kind));
  return private.group_json(g.id) || jsonb_build_object('fee', v_fee, 'balances', private.balances(v_uid));
end $$;

-- merging habitats: there's only one sanctuary, so nothing to move — just keep it on the biggest land
create or replace function private.habitat_after_fuse(p_group uuid) returns void language plpgsql as $$
declare g public.canvas_groups%rowtype;
begin
  select * into g from public.canvas_groups where id = p_group;
  if g.kind = 'habitat' then perform private.place_home(g.owner_id, 'habitat', g.id); end if;
end $$;

-- merging no longer folds places together (there's only one of each); the trigger re-homes it
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.fuse_groups(jsonb,text)'::regprocedure);
  n := replace(d, '  perform private.place_carry((v_res ->> ''id'')::uuid, v_ids);' || chr(10), '');
  if n = d then raise exception 'one place per type: place_carry call not found in fuse_groups'; end if;
  execute n;
end $$;

-- ---- every plot of a type opens the player's one place --------------------------------------------------------------
create or replace function private.group_json(p_group uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'status', g.status, 'plot_count', g.plot_count, 'kind', g.kind,
    'habitat_id', case when g.kind = 'habitat' then private.place_id(g.owner_id, 'habitat') end,
    'farm_id', case when g.kind = 'farm' then private.place_id(g.owner_id, 'farm') end,
    'business_id', case when g.kind = 'business' then private.place_id(g.owner_id, 'business') end,
    'arcade_id', case when g.kind = 'arcade' then private.place_id(g.owner_id, 'arcade') end,
    'realm_id', case when private.is_realm_kind(g.kind) then private.place_id(g.owner_id, g.kind) end,
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

-- the place behind a plot: the owner's one place of that type, shown with its area's size
create or replace function public.arcade_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('arcade_id', a.id, 'name', coalesce(ag.name, g.name), 'owner', private.profile_json(g.owner_id), 'plots', coalesce(ag.plot_count, g.plot_count),
           'level', (private.arc_level(a.xp) ->> 'level')::int, 'plays', a.plays, 'machines', (select count(*) from jsonb_object_keys(a.machines)))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'arcade'
  join public.arcades a on a.id = private.place_id(g.owner_id, 'arcade')
  left join public.canvas_groups ag on ag.id = a.group_id
  where m.gx = p_gx and m.gy = p_gy
$$;

create or replace function public.farm_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('farm_id', f.id, 'name', coalesce(ag.name, g.name), 'owner', private.profile_json(g.owner_id), 'plots', coalesce(ag.plot_count, g.plot_count),
           'growing', (select count(*) from public.farm_beds b where b.farm_id = f.id))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'farm'
  join public.farms f on f.id = private.place_id(g.owner_id, 'farm')
  left join public.canvas_groups ag on ag.id = f.group_id
  where m.gx = p_gx and m.gy = p_gy
$$;

create or replace function public.biz_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('business_id', b.id, 'name', coalesce(ag.name, g.name), 'owner', private.profile_json(g.owner_id), 'plots', coalesce(ag.plot_count, g.plot_count),
           'alltime', coalesce((select alltime from public.biz_state s where s.player_id = g.owner_id), 0))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'business'
  join public.businesses b on b.id = private.place_id(g.owner_id, 'business')
  left join public.canvas_groups ag on ag.id = b.group_id
  where m.gx = p_gx and m.gy = p_gy
$$;

create or replace function public.realm_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('realm_id', r.id, 'kind', r.kind, 'name', coalesce(ag.name, g.name), 'owner', private.profile_json(g.owner_id), 'plots', coalesce(ag.plot_count, g.plot_count),
           'level', private.rlm_lv(r.xp), 'plays', r.plays)
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and private.is_realm_kind(g.kind)
  join public.realms r on r.id = private.place_id(g.owner_id, g.kind)
  left join public.canvas_groups ag on ag.id = r.group_id
  where m.gx = p_gx and m.gy = p_gy
$$;

create or replace function public.habitat_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('habitat_id', h.id, 'name', coalesce(ag.name, g.name), 'owner', private.profile_json(g.owner_id), 'plots', coalesce(ag.plot_count, g.plot_count),
           'creatures', (select count(*) from public.inkborn c where c.habitat_id = h.id))
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id and g.kind = 'habitat'
  join public.habitats h on h.id = private.place_id(g.owner_id, 'habitat')
  left join public.canvas_groups ag on ag.id = h.group_id
  where m.gx = p_gx and m.gy = p_gy
$$;

-- every habitat plot on the map shows the sanctuary's residents
create or replace function public.habitat_residents(p_groups jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
    join public.habitats h on h.id = private.place_id(g.owner_id, 'habitat')
    where g.id = any(v_ids) and g.kind = 'habitat' and g.status = 'active' and private.visible_to(g.owner_id, v_uid));
end $$;

-- the sanctuary has room for creatures on every habitat plot you own (its shape is still its area's)
create or replace function private.habitat_capacity(h public.habitats) returns int language sql stable as $$
  select case when h.kind = 'starter' then coalesce((private.ink_cfg() ->> 'starter_capacity')::int, 4)
    else coalesce((private.ink_cfg() ->> 'capacity_base')::int, 3)
         + coalesce((private.ink_cfg() ->> 'capacity_per_plot')::int, 2) * greatest(coalesce(
             (select sum(plot_count)::int from public.canvas_groups where owner_id = h.owner_id and kind = 'habitat' and status = 'active'),
             (select plot_count from public.canvas_groups where id = h.group_id), 1) - 1, 0) end
$$;

-- ---- join everyone's existing places into one per type -------------------------------------------------------------
do $$
declare r record; v_keep uuid; v_others uuid[]; v_cap int; v_free int[]; b record; i int;
begin
  for r in
    select distinct owner_id, 'arcade' as kind from public.arcades
    union select distinct owner_id, 'farm' from public.farms
    union select distinct owner_id, 'business' from public.businesses
    union select distinct owner_id, 'habitat' from public.habitats where kind = 'plot'
    union select distinct owner_id, kind from public.realms
  loop
    if r.kind = 'farm' then
      -- crops growing on the other farms move over once the kept farm is on its (biggest) land
      select id into v_keep from public.farms where owner_id = r.owner_id order by harvests desc, (group_id is not null) desc, created_at, id limit 1;
      v_others := array(select id from public.farms where owner_id = r.owner_id and id <> v_keep);
      perform private.place_unify(r.owner_id, 'farm');
      perform private.place_home(r.owner_id, 'farm');
      v_cap := coalesce(private.farm_beds_count(v_keep), 0);
      v_free := array(select s from generate_series(0, greatest(v_cap - 1, -1)) s
                       where not exists (select 1 from public.farm_beds where farm_id = v_keep and idx = s) order by s);
      i := 1;
      for b in select * from public.farm_beds where farm_id = any(v_others) order by ready_at, farm_id, idx loop
        exit when i > coalesce(array_length(v_free, 1), 0);
        update public.farm_beds set farm_id = v_keep, idx = v_free[i] where farm_id = b.farm_id and idx = b.idx;
        i := i + 1;
      end loop;
    else
      perform private.place_unify(r.owner_id, r.kind);
      perform private.place_home(r.owner_id, r.kind);
    end if;
  end loop;
end $$;

create unique index if not exists arcades_one_per_owner on public.arcades (owner_id) where group_id is not null;
create unique index if not exists farms_one_per_owner on public.farms (owner_id) where group_id is not null;
create unique index if not exists businesses_one_per_owner on public.businesses (owner_id) where group_id is not null;
create unique index if not exists habitats_one_plot_per_owner on public.habitats (owner_id) where kind = 'plot' and group_id is not null;
create unique index if not exists realms_one_per_owner on public.realms (owner_id, kind) where group_id is not null;

do $$
declare f text;
begin
  foreach f in array array['private.is_realm_kind(text)', 'private.place_area(uuid, text)', 'private.place_id(uuid, text)',
    'private.place_unify(uuid, text)', 'private.place_home(uuid, text, uuid)', 'private.place_home_trg()'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
end $$;
