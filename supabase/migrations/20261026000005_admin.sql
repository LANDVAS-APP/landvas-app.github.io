-- LANDVAS administration & moderation console
-- Every function: require_admin(<roles>) -> do work -> private.audit(...).
-- Role model: owner/admin can do everything; moderator handles content and
-- players; economy edits config; support can read player data.

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support']);
begin
  return jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = v_uid),
    'players_total', (select count(*) from public.players),
    'players_active_24h', (select count(*) from public.players where last_active_at > now() - interval '1 day'),
    'signups_24h', (select count(*) from public.players where created_at > now() - interval '1 day'),
    'plots_owned', (select count(*) from public.world_plots where owner_id is not null),
    'groups_active', (select count(*) from public.canvas_groups where status = 'active'),
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
    'flagged_sessions', (select count(*) from public.minigame_sessions where review_status = 'flagged'),
    'ink_issued_24h', (select coalesce(sum(delta), 0) from public.resource_ledger where resource = 'ink' and delta > 0 and created_at > now() - interval '1 day'),
    'ink_spent_24h', (select coalesce(-sum(delta), 0) from public.resource_ledger where resource = 'ink' and delta < 0 and created_at > now() - interval '1 day'),
    'rent', jsonb_build_object(
      'settled_liability_usd', (select coalesce(sum(balance_usd + held_usd), 0) from public.rent_accounts),
      'lifetime_usd', (select coalesce(sum(lifetime_usd), 0) from public.rent_accounts),
      'paid_usd', (select coalesce(sum(paid_usd), 0) from public.rent_accounts),
      'rate_usd_per_second', (select coalesce(sum(r.usd_per_second * (1 + coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) * (p.level - 1))), 0)
                              from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id is not null),
      'boosted_players_now', (select count(*) from public.rent_accounts where boost_until > now())),
    'server_time', now());
end $$;

-- ===== Players ==============================================================

create or replace function public.admin_search_players(p_query text default '', p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']); v_q text := lower(trim(coalesce(p_query, '')));
begin
  return coalesce((
    select jsonb_agg(r order by (r ->> 'created_at') desc) from (
      select jsonb_build_object('id', pl.id, 'username', pr.username, 'display_name', pr.display_name, 'email', u.email,
                                'status', pl.status, 'strikes', pl.strikes, 'created_at', pl.created_at,
                                'last_active_at', pl.last_active_at, 'hidden', pr.is_hidden,
                                'plots', (select count(*) from public.world_plots where owner_id = pl.id),
                                'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = pl.id)) as r
      from public.players pl
      join public.profiles pr on pr.id = pl.id
      left join auth.users u on u.id = pl.id
      where v_q = '' or lower(pr.username) like '%' || v_q || '%' or lower(coalesce(u.email, '')) like '%' || v_q || '%'
         or pl.id::text = v_q
      order by pl.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)) s), '[]'::jsonb);
end $$;

create or replace function public.admin_player_detail(p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']);
begin
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'player', (select to_jsonb(p) from public.players p where p.id = p_player_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_player_id),
    'email', (select email from auth.users where id = p_player_id),
    'balances', private.balances(p_player_id),
    'rent', private.rent_json(p_player_id),
    -- coarse cell only: support needs to see whether claims were near the explorer,
    -- not the player's precise location
    'explorer', (select jsonb_build_object('mode', e.mode, 'gx', e.gx >> 4 << 4, 'gy', e.gy >> 4 << 4, 'traveling', e.traveling)
                 from private.explorer_now(p_player_id) e),
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = p_player_id),
    'plots', (select count(*) from public.world_plots where owner_id = p_player_id),
    'groups', (select count(*) from public.canvas_groups where owner_id = p_player_id and status = 'active'),
    'ledger', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]'::jsonb) from (
                 select * from public.resource_ledger where player_id = p_player_id order by id desc limit 40) l),
    'publications', (select coalesce(jsonb_agg(private.publication_json(a) order by a.created_at desc), '[]'::jsonb)
                     from public.artwork_publications a where a.owner_id = p_player_id and a.status <> 'cancelled'),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) - 'seed' order by s.started_at desc), '[]'::jsonb) from (
                   select * from public.minigame_sessions where player_id = p_player_id order by started_at desc limit 30) s),
    'cases', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.moderation_cases c
              where c.subject_player_id = p_player_id or c.reporter_id = p_player_id));
end $$;

create or replace function public.admin_set_player_status(p_player_id uuid, p_status text, p_until timestamptz default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  if p_status not in ('active', 'suspended', 'banned') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if p_player_id = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
  if private.has_role(p_player_id, array['owner']) and not private.has_role(v_uid, array['owner']) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update public.players
     set status = p_status,
         suspended_until = case when p_status = 'suspended' then p_until end,
         suspension_reason = case when p_status = 'active' then null else p_reason end
   where id = p_player_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('player.set_status', 'player', p_player_id::text,
                        jsonb_build_object('status', p_status, 'until', p_until, 'reason', p_reason));
  return public.admin_player_detail(p_player_id);
end $$;

create or replace function public.admin_adjust_balance(p_player_id uuid, p_resource text, p_delta bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']);
begin
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if abs(p_delta) > 1000000 then raise exception 'adjustment_too_large' using errcode = 'P0001'; end if;
  perform private.ledger_apply(p_player_id, p_resource, p_delta, 'admin_adjustment', 'admin', v_uid::text, null, v_uid);
  perform private.audit('economy.adjust_balance', 'player', p_player_id::text,
                        jsonb_build_object('resource', p_resource, 'delta', p_delta, 'reason', p_reason));
  return private.balances(p_player_id);
end $$;

create or replace function public.admin_set_role(p_player_id uuid, p_role text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin();
begin
  if p_role = 'owner' and not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_role = 'owner' and not exists (select 1 from public.admin_roles where player_id = v_uid and role = 'owner') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_on then
    insert into public.admin_roles (player_id, role, granted_by) values (p_player_id, p_role, v_uid) on conflict do nothing;
  else
    if p_player_id = v_uid and p_role in ('owner', 'admin') then raise exception 'cannot_revoke_own_admin' using errcode = 'P0001'; end if;
    delete from public.admin_roles where player_id = p_player_id and role = p_role;
  end if;
  perform private.audit(case when p_on then 'role.grant' else 'role.revoke' end, 'player', p_player_id::text, jsonb_build_object('role', p_role));
  return (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = p_player_id);
end $$;

create or replace function public.admin_hide_profile(p_player_id uuid, p_hidden boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  update public.profiles set is_hidden = p_hidden, updated_at = now() where id = p_player_id;
  perform private.audit('player.hide_profile', 'player', p_player_id::text, jsonb_build_object('hidden', p_hidden, 'reason', p_reason));
  return jsonb_build_object('hidden', p_hidden);
end $$;

-- Local development convenience. Only works while the local_dev_mode flag is
-- enabled (it is seeded ONLY by supabase/local/local_overrides.sql).
create or replace function public.dev_grant_self_admin() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  if not private.flag('local_dev_mode') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  insert into public.admin_roles (player_id, role) values (v_uid, 'owner') on conflict do nothing;
  perform private.audit('role.dev_self_grant', 'player', v_uid::text, '{}'::jsonb);
  return public.my_state();
end $$;

-- ===== Plots ================================================================

create or replace function public.admin_plot_lookup(p_gx int, p_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']);
begin
  return jsonb_build_object(
    'plot', (select to_jsonb(p) from public.world_plots p where p.gx = p_gx and p.gy = p_gy),
    'computed_type', private.plot_type_for(p_gx, p_gy),
    'owner', (select private.profile_json(owner_id) from public.world_plots where gx = p_gx and gy = p_gy),
    'group', (select private.group_json(group_id) from public.canvas_group_members where gx = p_gx and gy = p_gy),
    'ownership_history', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(o.player_id), 'method', o.method,
                                                                     'cost', o.cost, 'acquired_at', o.acquired_at, 'released_at', o.released_at,
                                                                     'release_reason', o.release_reason) order by o.id desc), '[]'::jsonb)
                          from public.plot_ownership o where o.gx = p_gx and o.gy = p_gy),
    'art_history', (select coalesce(jsonb_agg(jsonb_build_object('publication_id', h.publication_id, 'rev', h.rev, 'set_at', h.set_at,
                                                               'title', a.title, 'status', a.status) order by h.id desc), '[]'::jsonb)
                    from public.plot_art_history h left join public.artwork_publications a on a.id = h.publication_id
                    where h.gx = p_gx and h.gy = p_gy));
end $$;

create or replace function public.admin_set_plot_lock(p_gx int, p_gy int, p_locked boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  insert into public.world_plots (gx, gy, plot_type, rarity, locked, lock_reason)
  values (p_gx, p_gy, private.plot_type_for(p_gx, p_gy), private.plot_rarity_for(p_gx, p_gy), p_locked, p_reason)
  on conflict (gx, gy) do update set locked = p_locked, lock_reason = p_reason, updated_at = now();
  perform private.audit('plot.lock', 'plot', private.cell_key(p_gx, p_gy), jsonb_build_object('locked', p_locked, 'reason', p_reason));
  return public.admin_plot_lookup(p_gx, p_gy);
end $$;

-- Release a plot back to the world (dispute resolution / abuse). The previous
-- owner keeps every artwork version; the remaining canvas is re-split if needed.
create or replace function public.admin_release_plot(p_gx int, p_gy int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_admin(array['moderator']);
  v_owner uuid; v_group uuid; v_proj uuid; v_manifest jsonb; v_remaining jsonb; v_comp jsonb; v_first boolean := true; v_title text; v_name text;
begin
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select owner_id into v_owner from public.world_plots where gx = p_gx and gy = p_gy for update;
  if v_owner is null then raise exception 'not_owned' using errcode = 'P0001'; end if;
  perform private.rent_settle(v_owner);  -- pay rent up to the moment of release
  select group_id into v_group from public.canvas_group_members where gx = p_gx and gy = p_gy;
  if v_group is not null then
    perform 1 from public.canvas_groups where id = v_group for update;
    select g.project_id, g.name, p.title, v.manifest into v_proj, v_name, v_title, v_manifest
    from public.canvas_groups g join public.artwork_projects p on p.id = g.project_id
    join public.artwork_versions v on v.id = p.current_version_id where g.id = v_group;
    delete from public.canvas_group_members where gx = p_gx and gy = p_gy;
    select jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx) into v_remaining from public.canvas_group_members where group_id = v_group;
    if v_remaining is null then
      update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = v_group;
      update public.artwork_projects set status = 'archived', updated_at = now() where id = v_proj;
    else
      for v_comp in select c from private.components(v_remaining) c order by jsonb_array_length(c) desc loop
        if v_first then
          perform private.create_version(v_proj, v_owner, 'split', private.manifest_restrict(v_manifest, v_comp), v_comp, 'Plot released by moderation');
          v_first := false;
        else
          delete from public.canvas_group_members m using jsonb_array_elements(v_comp) c
          where m.group_id = v_group and m.gx = (c ->> 0)::int and m.gy = (c ->> 1)::int;
          perform private.create_group_with_cells(v_owner, v_comp, private.manifest_restrict(v_manifest, v_comp),
                                                  left(v_name, 50) || ' (part)', 'split', v_title);
        end if;
      end loop;
      perform private.refresh_group(v_group);
    end if;
  end if;
  update public.world_plots
     set owner_id = null, claimed_at = null, level = 1,
         art_publication_id = null, art_rev = null, updated_at = now()
   where gx = p_gx and gy = p_gy;
  update public.plot_ownership set released_at = now(), release_reason = p_reason
  where gx = p_gx and gy = p_gy and released_at is null;
  insert into public.plot_art_history (gx, gy, publication_id, rev) values (p_gx, p_gy, null, null);
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  perform private.enqueue_job('clear_cells', jsonb_build_object('cells', jsonb_build_array(jsonb_build_array(p_gx, p_gy))));
  perform private.audit('plot.release', 'plot', private.cell_key(p_gx, p_gy), jsonb_build_object('owner', v_owner, 'reason', p_reason));
  return public.admin_plot_lookup(p_gx, p_gy);
end $$;

create or replace function public.admin_update_plot_type(p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']);
begin
  update public.plot_types set
    weight = coalesce((p_patch ->> 'weight')::int, weight),
    acquire_multiplier = coalesce((p_patch ->> 'acquire_multiplier')::numeric, acquire_multiplier),
    tagline = coalesce(p_patch ->> 'tagline', tagline)
  where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('plot_type.update', 'plot_type', p_id, p_patch);
  return (select to_jsonb(t) from public.plot_types t where t.id = p_id);
end $$;

-- Tune a rarity. A rent-rate change first banks every affected owner's rent at
-- the old rate, so it never applies retroactively. Weight changes re-roll
-- UNCLAIMED plots only.
create or replace function public.admin_update_rarity(p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_old public.plot_rarities%rowtype; o record;
begin
  select * into v_old from public.plot_rarities where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_patch ? 'usd_per_second' then
    if (p_patch ->> 'usd_per_second')::numeric not between 0 and 0.001 then
      raise exception 'invalid_rate' using errcode = 'P0001';
    end if;
    for o in select distinct owner_id from public.world_plots where rarity = p_id and owner_id is not null loop
      perform private.rent_settle(o.owner_id);
    end loop;
  end if;
  update public.plot_rarities set
    name = coalesce(p_patch ->> 'name', name),
    weight = coalesce((p_patch ->> 'weight')::int, weight),
    usd_per_second = coalesce((p_patch ->> 'usd_per_second')::numeric, usd_per_second),
    ink_reward_multiplier = coalesce((p_patch ->> 'ink_reward_multiplier')::numeric, ink_reward_multiplier),
    price_multiplier = coalesce((p_patch ->> 'price_multiplier')::numeric, price_multiplier),
    color = coalesce(p_patch ->> 'color', color),
    glow = coalesce(p_patch ->> 'glow', glow)
  where id = p_id;
  perform private.audit('rarity.update', 'rarity', p_id, jsonb_build_object('old', to_jsonb(v_old), 'patch', p_patch));
  return (select to_jsonb(r) from public.plot_rarities r where r.id = p_id);
end $$;

-- ===== Artwork moderation ===================================================

create or replace function public.admin_moderation_queue(p_status text default 'open', p_kind text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  return jsonb_build_object(
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'status', c.status, 'priority', c.priority, 'reason', c.reason, 'details', c.details,
        'created_at', c.created_at, 'resolution', c.resolution, 'resolved_at', c.resolved_at,
        'subject', private.profile_json(c.subject_player_id), 'reporter', private.profile_json(c.reporter_id),
        'subject_strikes', (select strikes from public.players where id = c.subject_player_id),
        'session_id', c.session_id,
        'publication', (select private.publication_json(a) from public.artwork_publications a where a.id = c.publication_id))
        order by c.priority, c.created_at)
      from (select * from public.moderation_cases
            where status = coalesce(p_status, 'open') and (p_kind is null or kind = p_kind)
            order by priority, created_at limit 200) c), '[]'::jsonb),
    'pending_publications', (select count(*) from public.artwork_publications where status = 'pending_review'));
end $$;

create or replace function public.admin_review_publication(p_publication_id uuid, p_decision text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_pub public.artwork_publications%rowtype;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_pub.status not in ('pending_review', 'rejected') then raise exception 'invalid_publication_state' using errcode = 'P0001'; end if;
  if v_pub.owner_id = v_uid then raise exception 'cannot_review_own' using errcode = 'P0001'; end if;
  if p_decision = 'approve' then
    update public.artwork_publications set status = 'approved', reviewed_by = v_uid, reviewed_at = now(),
           decision_reason = null, updated_at = now() where id = p_publication_id;
    perform private.enqueue_job('publish_publication', jsonb_build_object('publication_id', p_publication_id));
  elsif p_decision = 'reject' then
    if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    update public.artwork_publications set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(),
           decision_reason = p_reason, updated_at = now() where id = p_publication_id;
  else
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  update public.moderation_cases set status = 'resolved', resolution = p_decision || coalesce(': ' || p_reason, ''),
         resolved_by = v_uid, resolved_at = now()
  where publication_id = p_publication_id and kind in ('review', 'auto_flag', 'appeal') and status = 'open';
  perform private.audit('artwork.review', 'publication', p_publication_id::text, jsonb_build_object('decision', p_decision, 'reason', p_reason));
  return private.publication_json((select a from public.artwork_publications a where a.id = p_publication_id));
end $$;

-- Remove published artwork from the map (content violation / copyright). The
-- pipeline restores each plot's previous compliant artwork where one exists.
create or replace function public.admin_remove_publication(p_publication_id uuid, p_reason text, p_strike boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_admin(array['moderator']); v_pub public.artwork_publications%rowtype;
  v_strikes int; v_mod jsonb := private.cfg('moderation');
begin
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_pub.status not in ('published', 'superseded', 'approved', 'pending_review') then
    raise exception 'invalid_publication_state' using errcode = 'P0001';
  end if;
  update public.artwork_publications set status = 'removed', removed_at = now(), decision_reason = p_reason,
         reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  where id = p_publication_id;
  if exists (select 1 from public.world_plots where art_publication_id = p_publication_id) then
    perform private.enqueue_job('unpublish_publication', jsonb_build_object('publication_id', p_publication_id));
  end if;
  update public.moderation_cases set status = 'resolved', resolution = 'removed: ' || p_reason, resolved_by = v_uid, resolved_at = now()
  where publication_id = p_publication_id and status = 'open' and kind in ('report', 'copyright', 'review', 'auto_flag');
  delete from public.featured_artwork where publication_id = p_publication_id;
  if p_strike then
    update public.players set strikes = strikes + 1 where id = v_pub.owner_id returning strikes into v_strikes;
    if v_strikes >= coalesce((v_mod ->> 'ban_threshold')::int, 5) then
      update public.players set status = 'banned', suspension_reason = 'Repeated violations' where id = v_pub.owner_id;
    elsif v_strikes >= coalesce((v_mod ->> 'suspend_threshold')::int, 3) then
      update public.players set status = 'suspended', suspended_until = now() + interval '30 days',
             suspension_reason = 'Repeated violations' where id = v_pub.owner_id and status = 'active';
    end if;
  end if;
  perform private.audit('artwork.remove', 'publication', p_publication_id::text,
                        jsonb_build_object('reason', p_reason, 'strike', p_strike, 'owner', v_pub.owner_id, 'strikes', v_strikes));
  return private.publication_json((select a from public.artwork_publications a where a.id = p_publication_id));
end $$;

create or replace function public.admin_restore_publication(p_publication_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_pub public.artwork_publications%rowtype;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found or v_pub.status not in ('removed', 'rejected') then raise exception 'invalid_publication_state' using errcode = 'P0001'; end if;
  if v_pub.processed_at is null then raise exception 'not_processed' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(v_pub.cells) c left join public.world_plots p on p.gx = (c ->> 0)::int and p.gy = (c ->> 1)::int
             where p.owner_id is distinct from v_pub.owner_id) then
    raise exception 'ownership_changed' using errcode = 'P0001';
  end if;
  update public.artwork_publications set status = 'approved', removed_at = null, decision_reason = null,
         reviewed_by = v_uid, reviewed_at = now(), updated_at = now() where id = p_publication_id;
  perform private.enqueue_job('publish_publication', jsonb_build_object('publication_id', p_publication_id));
  update public.moderation_cases set status = 'resolved', resolution = 'restored: ' || coalesce(p_reason, ''), resolved_by = v_uid, resolved_at = now()
  where publication_id = p_publication_id and kind = 'appeal' and status = 'open';
  perform private.audit('artwork.restore', 'publication', p_publication_id::text, jsonb_build_object('reason', p_reason));
  return private.publication_json((select a from public.artwork_publications a where a.id = p_publication_id));
end $$;

create or replace function public.admin_resolve_case(p_case_id uuid, p_status text, p_resolution text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  if p_status not in ('resolved', 'dismissed', 'open') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.moderation_cases set status = p_status, resolution = p_resolution,
         resolved_by = case when p_status = 'open' then null else v_uid end,
         resolved_at = case when p_status = 'open' then null else now() end
  where id = p_case_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('case.resolve', 'case', p_case_id::text, jsonb_build_object('status', p_status, 'resolution', p_resolution));
  return (select to_jsonb(c) from public.moderation_cases c where c.id = p_case_id);
end $$;

-- ===== Economy, configuration & flags =======================================

create or replace function public.admin_config_get() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy', 'moderator']);
begin
  return jsonb_build_object(
    'config', (select coalesce(jsonb_object_agg(key, jsonb_build_object('value', value, 'description', description, 'updated_at', updated_at)), '{}'::jsonb) from public.game_config),
    'flags', (select coalesce(jsonb_agg(to_jsonb(f) order by f.key), '[]'::jsonb) from public.feature_flags f),
    'plot_types', (select jsonb_agg(to_jsonb(t) order by t.sort) from public.plot_types t),
    'rarities', (select jsonb_agg(to_jsonb(r) order by r.sort) from public.plot_rarities r));
end $$;

create or replace function public.admin_config_set(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_old jsonb;
begin
  select value into v_old from public.game_config where key = p_key for update;
  if not found then raise exception 'unknown_config_key' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_value) is distinct from jsonb_typeof(v_old) then raise exception 'config_type_mismatch' using errcode = 'P0001'; end if;
  -- guard the keys every server function depends on
  if p_key = 'economy' and not (p_value ? 'acquire' and p_value ? 'upgrade' and p_value ? 'starter_bonus' and p_value ? 'publish_reward') then
    raise exception 'config_missing_required_keys' using errcode = 'P0001';
  end if;
  if p_key = 'economy' and ((p_value -> 'starter_bonus') ? 'ink' or (p_value -> 'publish_reward') ? 'ink') then
    raise exception 'ink_minigame_only' using errcode = 'P0001';
  end if;
  if p_key = 'rent' and (
       coalesce((p_value -> 'boost' ->> 'multiplier')::numeric, 0) not between 1 and 100
    or coalesce((p_value -> 'boost' ->> 'minutes_per_boost')::int, 0) not between 1 and 1440
    or coalesce((p_value -> 'boost' ->> 'max_stack_hours')::numeric, 0) not between 0.5 and 72
    or coalesce((p_value -> 'boost' ->> 'free_per_day')::int, -1) not between 0 and 96
    or coalesce((p_value -> 'boost' ->> 'reset_hour_utc')::int, -1) not between 0 and 23
    or coalesce((p_value ->> 'level_bonus')::numeric, -1) not between 0 and 1
    or coalesce((p_value ->> 'max_offline_days')::int, 0) not between 1 and 3650) then
    raise exception 'invalid_rent_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' then
    -- bank everyone's rent under the old multiplier/bonus before switching
    perform private.rent_settle(player_id) from public.rent_accounts;
  end if;
  if p_key = 'explorer' and (
       coalesce((p_value ->> 'claim_reach')::int, -1) not between 0 and 25
    or coalesce((p_value ->> 'max_speed_kmh')::numeric, 0) not between 10 and 5000
    or coalesce((p_value ->> 'travel_speed_kmh')::numeric, 0) not between 1 and 2000
    or coalesce((p_value ->> 'jump_cooldown_hours')::int, -1) not between 0 and 8760) then
    raise exception 'invalid_explorer_config' using errcode = 'P0001';
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

create or replace function public.admin_set_flag(p_key text, p_enabled boolean, p_config jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(); v_flag public.feature_flags%rowtype;
begin
  select * into v_flag from public.feature_flags where key = p_key for update;
  if not found then raise exception 'unknown_flag' using errcode = 'P0001'; end if;
  -- legally gated modules can never be enabled from the console; they require a
  -- reviewed migration that sets config.legal_signoff (see docs/COMPLIANCE.md).
  if p_enabled and coalesce((v_flag.config ->> 'legally_gated')::boolean, false)
     and coalesce(v_flag.config ->> 'legal_signoff', '') = '' then
    raise exception 'legal_signoff_required' using errcode = 'P0001';
  end if;
  update public.feature_flags set enabled = p_enabled, config = coalesce(p_config, config), updated_at = now(), updated_by = v_uid
  where key = p_key;
  perform private.audit('flag.set', 'flag', p_key, jsonb_build_object('enabled', p_enabled, 'config', p_config));
  return (select to_jsonb(f) from public.feature_flags f where f.key = p_key);
end $$;

-- ===== Minigame oversight ===================================================

create or replace function public.admin_minigame_sessions(p_filter text default 'flagged', p_game text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy']);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'player', private.profile_json(s.player_id), 'game', s.game, 'level', s.level, 'status', s.status,
      'score', s.score, 'passed', s.passed, 'stars', s.stars, 'flags', to_jsonb(s.flags), 'review_status', s.review_status,
      'started_at', s.started_at, 'finished_at', s.finished_at, 'summary', s.summary,
      'duration_ms', floor(extract(epoch from (s.finished_at - s.started_at)) * 1000),
      'reward', (select to_jsonb(r) - 'player_id' from public.minigame_rewards r where r.session_id = s.id)) order by s.started_at desc)
    from (select * from public.minigame_sessions
          where ((p_filter = 'flagged' and review_status = 'flagged')
                 or (p_filter = 'rejected' and status = 'rejected')
                 or (p_filter = 'recent'))
            and (p_game is null or game = p_game)
          order by started_at desc limit 200) s), '[]'::jsonb);
end $$;

create or replace function public.admin_review_session(p_session_id uuid, p_decision text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy']); v_r public.minigame_rewards%rowtype; v_s public.minigame_sessions%rowtype;
begin
  select * into v_s from public.minigame_sessions where id = p_session_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_r from public.minigame_rewards where session_id = p_session_id for update;
  if p_decision = 'clear' then
    if v_s.review_status <> 'flagged' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    update public.minigame_sessions set review_status = 'cleared' where id = p_session_id;
    if v_r.id is not null and v_r.held then
      update public.minigame_rewards set held = false where id = v_r.id;
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_r.ink, 'pigments', v_r.pigments, 'brush_points', v_r.brush_points),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
    end if;
  elsif p_decision = 'void' then
    update public.minigame_sessions set review_status = 'voided', score = 0, passed = false where id = p_session_id;
    if v_r.id is not null and not v_r.held then
      -- claw back what is still available; never drive a balance negative
      perform private.ledger_apply(v_s.player_id, 'ink', -least(v_r.ink, (private.balances(v_s.player_id) ->> 'ink')::bigint), 'minigame_void', 'minigame_session', p_session_id::text, null, v_uid);
      perform private.ledger_apply(v_s.player_id, 'pigments', -least(v_r.pigments, (private.balances(v_s.player_id) ->> 'pigments')::bigint), 'minigame_void', 'minigame_session', p_session_id::text, null, v_uid);
    end if;
    update public.minigame_rewards set held = true where session_id = p_session_id;
  else
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  update public.moderation_cases set status = 'resolved', resolution = p_decision || ': ' || coalesce(p_reason, ''), resolved_by = v_uid, resolved_at = now()
  where session_id = p_session_id and status = 'open';
  perform private.audit('minigame.review', 'minigame_session', p_session_id::text, jsonb_build_object('decision', p_decision, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- ===== Events ===============================================================

create or replace function public.admin_events() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy']);
begin
  return coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('participants', (select count(*) from public.event_progress p where p.event_id = e.id))
                                    order by e.created_at desc) from public.event_definitions e), '[]'::jsonb);
end $$;

create or replace function public.admin_upsert_event(p_event jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_id uuid := nullif(p_event ->> 'id', '')::uuid;
begin
  if coalesce(p_event -> 'config' -> 'rewards' ->> 'cash', '') <> '' then
    raise exception 'cash_rewards_not_permitted' using errcode = 'P0001';
  end if;
  if coalesce(p_event -> 'config' -> 'rewards', '{}'::jsonb)::text ~ '"ink"' then
    raise exception 'ink_minigame_only' using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into public.event_definitions (key, name, kind, description, starts_at, ends_at, region, config, created_by)
    values (p_event ->> 'key', p_event ->> 'name', p_event ->> 'kind', coalesce(p_event ->> 'description', ''),
            (p_event ->> 'starts_at')::timestamptz, (p_event ->> 'ends_at')::timestamptz,
            nullif(p_event -> 'region', 'null'::jsonb), coalesce(p_event -> 'config', '{}'::jsonb), v_uid)
    returning id into v_id;
  else
    update public.event_definitions set
      name = coalesce(p_event ->> 'name', name), kind = coalesce(p_event ->> 'kind', kind),
      description = coalesce(p_event ->> 'description', description),
      starts_at = coalesce((p_event ->> 'starts_at')::timestamptz, starts_at),
      ends_at = coalesce((p_event ->> 'ends_at')::timestamptz, ends_at),
      region = case when p_event ? 'region' then nullif(p_event -> 'region', 'null'::jsonb) else region end,
      config = coalesce(p_event -> 'config', config), updated_at = now()
    where id = v_id;
  end if;
  perform private.audit('event.upsert', 'event', v_id::text, p_event);
  return (select to_jsonb(e) from public.event_definitions e where e.id = v_id);
end $$;

create or replace function public.admin_set_event_status(p_event_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy', 'moderator']);
begin
  update public.event_definitions set status = p_status, updated_at = now() where id = p_event_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('event.status', 'event', p_event_id::text, jsonb_build_object('status', p_status));
  return (select to_jsonb(e) from public.event_definitions e where e.id = p_event_id);
end $$;

-- Grant event rewards (resources only — no cash) per config:
-- {"rewards": {"participation": {...}, "goal": {"metric": "plots_painted", "threshold": 9, "reward": {...}},
--              "top": [{"rank_max": 3, "reward": {...}}]}}
create or replace function public.admin_finalize_event(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_e public.event_definitions%rowtype; r record; v_reward jsonb; t jsonb; v_n int := 0;
begin
  select * into v_e from public.event_definitions where id = p_event_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_e.finalized_at is not null then raise exception 'already_finalized' using errcode = 'P0001'; end if;
  for r in select p.*, rank() over (order by p.score desc) as rk from public.event_progress p where p.event_id = p_event_id loop
    v_reward := coalesce(v_e.config -> 'rewards' -> 'participation', '{}'::jsonb);
    if v_e.config -> 'rewards' -> 'goal' is not null and
       coalesce((r.progress ->> (v_e.config -> 'rewards' -> 'goal' ->> 'metric'))::int, 0) >= (v_e.config -> 'rewards' -> 'goal' ->> 'threshold')::int then
      v_reward := private.merge_rewards(v_reward, v_e.config -> 'rewards' -> 'goal' -> 'reward');
    end if;
    for t in select * from jsonb_array_elements(coalesce(v_e.config -> 'rewards' -> 'top', '[]'::jsonb)) loop
      if r.rk <= (t ->> 'rank_max')::int then v_reward := private.merge_rewards(v_reward, t -> 'reward'); exit; end if;
    end loop;
    perform private.grant(r.player_id, v_reward, 'event_reward', 'event', p_event_id::text, 'event:' || p_event_id::text);
    update public.event_progress set rewarded = true where event_id = p_event_id and player_id = r.player_id;
    v_n := v_n + 1;
  end loop;
  update public.event_definitions set finalized_at = now(), status = 'ended', updated_at = now() where id = p_event_id;
  perform private.audit('event.finalize', 'event', p_event_id::text, jsonb_build_object('participants_rewarded', v_n));
  return jsonb_build_object('rewarded', v_n);
end $$;

create or replace function private.merge_rewards(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select key as k, sum(value::numeric)::bigint as v
    from (select * from jsonb_each_text(coalesce(a, '{}'::jsonb)) union all select * from jsonb_each_text(coalesce(b, '{}'::jsonb))) x
    group by key) s
$$;

-- ===== Gallery curation =====================================================

create or replace function public.admin_feature(p_publication_id uuid, p_section text, p_on boolean, p_note text default null,
                                                p_criteria text default null, p_ends_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  if p_on then
    if not exists (select 1 from public.artwork_publications where id = p_publication_id and status = 'published') then
      raise exception 'not_published' using errcode = 'P0001';
    end if;
    insert into public.featured_artwork (publication_id, section, note, criteria, featured_by, ends_at)
    values (p_publication_id, p_section, p_note, p_criteria, v_uid, p_ends_at)
    on conflict (publication_id, section) do update set note = excluded.note, criteria = excluded.criteria,
      ends_at = excluded.ends_at, featured_by = v_uid, starts_at = now();
  else
    delete from public.featured_artwork where publication_id = p_publication_id and section = p_section;
  end if;
  perform private.audit(case when p_on then 'gallery.feature' else 'gallery.unfeature' end, 'publication', p_publication_id::text,
                        jsonb_build_object('section', p_section, 'note', p_note, 'criteria', p_criteria));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_gallery_candidates() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  -- transparent recommendation signal: appreciations in the last 7 days per plot of canvas
  return coalesce((select jsonb_agg(s.card || jsonb_build_object('recent', s.recent, 'featured_in', s.sections) order by s.recent desc) from (
    select private.artwork_card(a, v_uid) as card,
           (select count(*) from public.gallery_reactions r where r.publication_id = a.id and r.created_at > now() - interval '7 days') as recent,
           (select coalesce(jsonb_agg(section), '[]'::jsonb) from public.featured_artwork f where f.publication_id = a.id) as sections
    from public.artwork_publications a where a.status = 'published'
    order by a.published_at desc limit 100) s), '[]'::jsonb);
end $$;

-- ===== Operations ===========================================================

create or replace function public.admin_jobs(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']);
begin
  return coalesce((select jsonb_agg(to_jsonb(j) order by j.id desc) from (
    select * from private.render_jobs where p_status is null or status = p_status order by id desc limit 100) j), '[]'::jsonb);
end $$;

create or replace function public.admin_retry_job(p_job_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']); v_kind text; v_payload jsonb;
begin
  update private.render_jobs set status = 'queued', attempts = 0, run_after = now(), last_error = null, locked_at = null, updated_at = now()
  where id = p_job_id and status = 'failed' returning kind, payload into v_kind, v_payload;
  if not found then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if v_kind in ('process_publication', 'publish_publication') then
    update public.artwork_publications set status = case when v_kind = 'process_publication' then 'processing' else 'approved' end
    where id = (v_payload ->> 'publication_id')::uuid and status = 'failed';
  end if;
  perform private.audit('job.retry', 'job', p_job_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_audit_log(p_limit int default 100, p_before_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support']);
begin
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('actor', private.profile_json(a.actor_id)) order by a.id desc) from (
    select * from public.audit_logs where p_before_id is null or id < p_before_id order by id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)) a), '[]'::jsonb);
end $$;

create or replace function public.admin_client_errors(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']);
begin
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (
    select * from private.client_errors order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) e), '[]'::jsonb);
end $$;
