-- v0.9.3 Merging never loses a place's progress.
--
-- Merging plots kept only the place (arcade, farm, business, realm, Estate, Domain) of the group that survived the
-- merge — the biggest, or the oldest on a tie. If your levelled-up arcade was on a newer plot, the merge quietly put
-- you in a fresh arcade, and you'd only notice after upgrading to the Estate and switching back down: "everything
-- reset". The progress was never deleted, just left behind on the merged-away groups.
--
-- Now every merge folds the places of all the merging groups into one, per type:
--   • the most-progressed place is the one kept (its world, layout, decor and per-place state);
--   • XP, plays, harvests and tips from the others are added on; cabinet / producer / upgrade levels take the best;
--     owned decor is combined; play history (leaderboards) moves over; growing crops move into free beds.
-- And the progress already left behind by past merges is folded back into each player's land now.

/** per key, the higher of two level maps ({"stacker": 3} + {"stacker": 5, "cyclone": 2} → {"stacker": 5, "cyclone": 2}) */
create or replace function private.jmax(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, greatest(coalesce((a ->> key)::numeric, 0), coalesce((b ->> key)::numeric, 0))), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) key union select jsonb_object_keys(coalesce(b, '{}'::jsonb))) s
$$;
/** two json arrays as one, without repeats */
create or replace function private.junion(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(distinct e), '[]'::jsonb) from jsonb_array_elements(coalesce(a, '[]'::jsonb) || coalesce(b, '[]'::jsonb)) e
$$;

/** Fold the places on p_groups (merged-away groups) into the survivor's land. Folded rows are unhooked from their
 *  old groups, so running this again changes nothing. */
create or replace function private.place_carry(p_survivor uuid, p_groups uuid[]) returns void language plpgsql as $$
declare v_owner uuid; v_all uuid[]; v_keep uuid; v_others uuid[]; r record; v_kind text; v_free int[]; v_cap int; b record; i int;
begin
  select owner_id into v_owner from public.canvas_groups where id = p_survivor;
  if v_owner is null then return; end if;
  v_all := array(select distinct x from unnest(coalesce(p_groups, '{}') || p_survivor) x where x is not null);

  -- ---- arcades ----
  select id into v_keep from public.arcades where group_id = any(v_all) and owner_id = v_owner
   order by xp desc, plays desc, (group_id = p_survivor) desc, created_at, id limit 1;
  if v_keep is not null then
    v_others := array(select id from public.arcades where group_id = any(v_all) and owner_id = v_owner and id <> v_keep);
    for r in select * from public.arcades where id = any(v_others) loop
      update public.arcades set xp = xp + r.xp, plays = plays + r.plays, machines = private.jmax(machines, r.machines),
             decor_owned = private.junion(decor_owned, r.decor_owned)
       where id = v_keep;
    end loop;
    update public.arcade_plays set arcade_id = v_keep where arcade_id = any(v_others);
    update public.arcades set group_id = null, xp = 0, plays = 0 where id = any(v_others);
    update public.arcades set group_id = p_survivor where id = v_keep and group_id is distinct from p_survivor;
  end if;

  -- ---- realms, Estates and Domains: one place per kind ----
  for v_kind in select distinct kind from public.realms where group_id = any(v_all) and owner_id = v_owner loop
    select id into v_keep from public.realms where group_id = any(v_all) and owner_id = v_owner and kind = v_kind
     order by xp desc, plays desc, (group_id = p_survivor) desc, created_at, id limit 1;
    v_others := array(select id from public.realms where group_id = any(v_all) and owner_id = v_owner and kind = v_kind and id <> v_keep);
    for r in select * from public.realms where id = any(v_others) loop
      update public.realms set xp = xp + r.xp, plays = plays + r.plays, producers = private.jmax(producers, r.producers),
             upgrades = private.jmax(upgrades, r.upgrades)
       where id = v_keep;
    end loop;
    update public.realm_runs set realm_id = v_keep where realm_id = any(v_others);
    update public.realms set group_id = null, xp = 0, plays = 0 where id = any(v_others);
    update public.realms set group_id = p_survivor where id = v_keep and group_id is distinct from p_survivor;
  end loop;

  -- ---- farms ----
  select id into v_keep from public.farms where group_id = any(v_all) and owner_id = v_owner
   order by harvests desc, (group_id = p_survivor) desc, created_at, id limit 1;
  if v_keep is not null then
    v_others := array(select id from public.farms where group_id = any(v_all) and owner_id = v_owner and id <> v_keep);
    update public.farms set harvests = harvests + coalesce((select sum(harvests) from public.farms where id = any(v_others)), 0) where id = v_keep;
    update public.farms set group_id = null, harvests = 0 where id = any(v_others);
    update public.farms set group_id = p_survivor where id = v_keep and group_id is distinct from p_survivor;
    -- crops still growing move into the kept farm's free beds (the merged farm is bigger, so it has more)
    v_cap := coalesce(private.farm_beds_count(v_keep), 0);
    v_free := array(select g from generate_series(0, greatest(v_cap - 1, -1)) g
                     where not exists (select 1 from public.farm_beds where farm_id = v_keep and idx = g) order by g);
    i := 1;
    for b in select * from public.farm_beds where farm_id = any(v_others) order by ready_at, farm_id, idx loop
      exit when i > coalesce(array_length(v_free, 1), 0);
      update public.farm_beds set farm_id = v_keep, idx = v_free[i] where farm_id = b.farm_id and idx = b.idx;
      i := i + 1;
    end loop;
    update public.farm_games set farm_id = v_keep where farm_id = any(v_others);
  end if;

  -- ---- businesses ----
  select id into v_keep from public.businesses where group_id = any(v_all) and owner_id = v_owner
   order by tips desc, (group_id = p_survivor) desc, created_at, id limit 1;
  if v_keep is not null then
    v_others := array(select id from public.businesses where group_id = any(v_all) and owner_id = v_owner and id <> v_keep);
    update public.businesses set tips = tips + coalesce((select sum(tips) from public.businesses where id = any(v_others)), 0) where id = v_keep;
    update public.biz_games set business_id = v_keep where business_id = any(v_others);
    update public.businesses set group_id = null, tips = 0 where id = any(v_others);
    update public.businesses set group_id = p_survivor where id = v_keep and group_id is distinct from p_survivor;
  end if;
end $$;

-- every merge folds the merging groups' places together (before habitats join up, after the tier is settled)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.fuse_groups(jsonb,text)'::regprocedure);
  n := replace(d, '  perform private.habitat_after_fuse((v_res ->> ''id'')::uuid);',
                  '  perform private.place_carry((v_res ->> ''id'')::uuid, v_ids);' || chr(10) || '  perform private.habitat_after_fuse((v_res ->> ''id'')::uuid);');
  if n = d then raise exception 'merge keeps progress: habitat_after_fuse call not found in fuse_groups'; end if;
  execute n;
end $$;

-- bring back the progress past merges left behind: every live group gets the places of every group merged into it
do $$
declare g record; v_from uuid[];
begin
  for g in select id from public.canvas_groups where status = 'active' and exists (select 1 from public.canvas_groups c where c.merged_into = canvas_groups.id) loop
    with recursive m(id) as (
      select c.id from public.canvas_groups c where c.merged_into = g.id and c.status = 'merged'
      union
      select c.id from public.canvas_groups c join m on c.merged_into = m.id where c.status = 'merged'
    ) select array_agg(id) into v_from from m;
    if v_from is not null then perform private.place_carry(g.id, v_from); end if;
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.jmax(jsonb, jsonb)', 'private.junion(jsonb, jsonb)', 'private.place_carry(uuid, uuid[])'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
end $$;
