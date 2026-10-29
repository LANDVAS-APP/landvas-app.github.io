-- v0.16: the craft score weighs how long a piece took (the biggest factor; never shown to
-- players), and merging plots into a bigger mural costs Ink (bigger murals earn bigger
-- craft bonuses).
--
-- Painting time: the editor counts time spent actually painting (marks on the canvas, with
-- short pauses to think) and sends the running total with each draft save. The server only
-- believes as much new time as really passed since the previous save, and at most 5 minutes
-- per save (the editor autosaves every 90 s while you paint). The verified total lives in a
-- private table, so players can't read it.
--   earn.craft.effort = {"full_minutes": 40, "per_plot_pct": 35, "floor": 0.15}
--   score = picture score × (floor + (1 - floor) × √(minutes / full time)), full time growing
--   per_plot_pct with each extra plot in the canvas.
-- Merging: earn.merge = {"ink_per_plot": 15} — Ink for every plot that joins the largest canvas.

-- drafts keep the painting-time counter (and the imported-image flag)
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
  || case when coalesce((p_manifest ->> 'imported')::boolean, false) then '{"imported": true}'::jsonb else '{}'::jsonb end
  || case when jsonb_typeof(p_manifest -> 'active_ms') = 'number'
          then jsonb_build_object('active_ms', least(greatest(floor((p_manifest ->> 'active_ms')::numeric), 0), 1e12)::bigint)
          else '{}'::jsonb end
$$;

create table if not exists private.version_effort (
  version_id uuid primary key references public.artwork_versions(id) on delete cascade,
  effort_ms bigint not null default 0
);
revoke all on private.version_effort from public;

create or replace function private.version_effort_of(p_version uuid) returns bigint
language sql stable as $$ select coalesce((select effort_ms from private.version_effort where version_id = p_version), 0) $$;

create or replace function private.version_effort_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare pv public.artwork_versions%rowtype; v_rep bigint; v_prev bigint; v_delta bigint := 0; v_base bigint := 0;
begin
  if new.parent_version_id is not null then
    select * into pv from public.artwork_versions where id = new.parent_version_id;
  end if;
  if pv.id is not null then
    v_base := private.version_effort_of(pv.id);
    if new.kind = 'save' then
      v_rep := coalesce((new.manifest ->> 'active_ms')::bigint, 0);
      v_prev := coalesce((pv.manifest ->> 'active_ms')::bigint, 0);
      v_delta := case when v_rep >= v_prev then v_rep - v_prev else v_rep end;
      v_delta := greatest(least(v_delta, floor(extract(epoch from (now() - pv.created_at)) * 1000)::bigint, 300000), 0);
    end if;
  end if;
  insert into private.version_effort (version_id, effort_ms) values (new.id, v_base + v_delta)
  on conflict (version_id) do update set effort_ms = excluded.effort_ms;
  return new;
end $$;
drop trigger if exists artwork_versions_effort on public.artwork_versions;
create trigger artwork_versions_effort after insert on public.artwork_versions for each row execute function private.version_effort_trg();

update public.game_config
   set value = jsonb_set(value, '{craft,effort}', coalesce(value -> 'craft' -> 'effort', '{"full_minutes": 40, "per_plot_pct": 35, "floor": 0.15}'::jsonb), true)
 where key = 'earn';
update public.game_config
   set value = jsonb_set(value, '{merge}', coalesce(value -> 'merge', '{"ink_per_plot": 15}'::jsonb), true)
 where key = 'earn';

create or replace function private.check_effort_trg() returns trigger
language plpgsql as $$
declare e jsonb;
begin
  if new.key <> 'earn' then return new; end if;
  e := new.value -> 'craft' -> 'effort';
  if e is not null and (coalesce((e ->> 'full_minutes')::numeric, 40) not between 1 and 1440
     or coalesce((e ->> 'per_plot_pct')::numeric, 35) not between 0 and 500
     or coalesce((e ->> 'floor')::numeric, 0.15) not between 0 and 1) then
    raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'effort';
  end if;
  if coalesce((new.value -> 'merge' ->> 'ink_per_plot')::numeric, 0) not between 0 and 100000 then
    raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'merge';
  end if;
  return new;
end $$;
drop trigger if exists game_config_effort_check on public.game_config;
create trigger game_config_effort_check before insert or update on public.game_config for each row execute function private.check_effort_trg();

-- the share of the picture score a piece keeps, from how long it took (0 … 1)
create or replace function private.effort_factor(p_effort_ms bigint, p_plots int) returns numeric
language sql stable as $$
  with e as (select coalesce(private.earn('craft') -> 'effort', '{}'::jsonb) e)
  select coalesce((e ->> 'floor')::numeric, 0.15)
         + (1 - coalesce((e ->> 'floor')::numeric, 0.15))
         * sqrt(least(greatest(coalesce(p_effort_ms, 0), 0) / 60000.0
                      / (coalesce((e ->> 'full_minutes')::numeric, 40)
                         * (1 + coalesce((e ->> 'per_plot_pct')::numeric, 35) / 100 * greatest(coalesce(p_plots, 1) - 1, 0))), 1))
  from e
$$;

-- the pipeline sends the picture score; the stored craft score also weighs painting time
create or replace function public.svc_record_craft(p_publication_id uuid, p_craft jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pic int := least(greatest(coalesce((p_craft ->> 'score')::int, 0), 0), 100);
  v_score int; p public.artwork_publications%rowtype;
begin
  select * into p from public.artwork_publications where id = p_publication_id;
  if not found then return jsonb_build_object('craft_score', null); end if;
  v_score := round(v_pic * private.effort_factor(private.version_effort_of(p.version_id), greatest(p.plot_count, 1)));
  update public.artwork_publications
     set craft = (p_craft - 'score' - 'fingerprint') || jsonb_build_object('score', v_score, 'picture', v_pic),
         craft_score = v_score,
         fingerprint = coalesce(nullif(p_craft ->> 'fingerprint', ''), fingerprint)
   where id = p_publication_id;
  -- already live (staff art goes straight through): pay now
  perform private.craft_pay(p_publication_id);
  return jsonb_build_object('craft_score', v_score);
end $$;

-- ---- merging costs Ink ---------------------------------------------------------------
-- plots that join the largest of the canvases being merged
create or replace function private.fuse_added_plots(p_ids uuid[]) returns int
language sql stable as $$
  select coalesce(sum(plot_count) - max(plot_count), 0)::int from public.canvas_groups where id = any(p_ids) and status = 'active'
$$;

create or replace function public.fuse_cost(p_group_ids jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_ids uuid[]; v_added int;
begin
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p_group_ids) x;
  select private.fuse_added_plots(array_agg(id)) into v_added from public.canvas_groups where id = any(v_ids) and owner_id = v_uid;
  return jsonb_build_object('added_plots', coalesce(v_added, 0),
                            'ink', coalesce(v_added, 0) * coalesce((private.cfg('earn') -> 'merge' ->> 'ink_per_plot')::int, 0),
                            'balance', coalesce((select amount from public.resource_balances where player_id = v_uid and resource = 'ink'), 0));
end $$;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fuse_groups')
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'fuse_groups_core') then
    alter function public.fuse_groups(jsonb, text) rename to fuse_groups_core;
    alter function public.fuse_groups_core(jsonb, text) set schema private;
  end if;
end $$;

create or replace function public.fuse_groups(p_group_ids jsonb, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_ids uuid[]; v_cost int; v_effort bigint; v_res jsonb; v_version uuid; v_have bigint;
begin
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p_group_ids) x;
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
  if v_cost > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'merge', 'group', v_res ->> 'id', 'merge:' || (v_res ->> 'id') || ':' || v_version);
  end if;
  return v_res || jsonb_build_object('ink_spent', v_cost, 'balances', private.balances(v_uid));
end $$;

do $$
begin
  execute 'revoke all on function private.fuse_groups_core(jsonb, text) from public, anon, authenticated';
  execute 'revoke all on function private.version_effort_trg() from public';
  execute 'revoke all on function private.check_effort_trg() from public';
  execute 'revoke all on function private.effort_factor(bigint, int) from public';
  execute 'revoke all on function private.version_effort_of(uuid) from public';
  execute 'revoke all on function private.fuse_added_plots(uuid[]) from public';
  execute 'revoke all on function public.fuse_groups(jsonb, text) from public, anon';
  execute 'grant execute on function public.fuse_groups(jsonb, text) to authenticated, service_role';
  execute 'revoke all on function public.fuse_cost(jsonb) from public, anon';
  execute 'grant execute on function public.fuse_cost(jsonb) to authenticated, service_role';
end $$;
