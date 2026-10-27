-- LANDVAS security model
-- ---------------------------------------------------------------------------
-- 1. API roles (anon, authenticated) get SELECT on a safe subset of tables,
--    filtered by row-level security. They get NO insert/update/delete on any
--    table: every write goes through a SECURITY DEFINER function that checks
--    auth.uid(), ownership, limits and rate limits.
-- 2. The private schema is invisible to API roles.
-- 3. svc_* functions are callable only by service_role (the worker).
-- 4. Admin functions check admin_roles internally and write audit_logs.
-- NOTE: when adding functions in later migrations, add explicit grants —
-- Supabase's default privileges otherwise grant EXECUTE to anon/authenticated.
-- ---------------------------------------------------------------------------

revoke all on schema private from public;
revoke all on all tables in schema private from public;
revoke all on all sequences in schema private from public;
revoke all on all functions in schema private from public;
do $$
begin
  execute 'revoke all on schema private from anon, authenticated';
  execute 'revoke all on all tables in schema private from anon, authenticated';
  execute 'revoke all on all functions in schema private from anon, authenticated';
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---- Row level security on every public table ------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Public, non-sensitive game world data
grant select on public.profiles, public.plot_types, public.plot_rarities, public.world_plots, public.canvas_groups,
  public.canvas_group_members, public.world_density, public.artwork_publications,
  public.art_tiles, public.map_updates, public.achievements, public.player_achievements,
  public.featured_artwork, public.event_definitions, public.game_config, public.feature_flags,
  public.minigame_records
to anon, authenticated;

create policy profiles_read on public.profiles for select to anon, authenticated
  using (not is_hidden or id = auth.uid());
create policy plot_types_read on public.plot_types for select to anon, authenticated using (true);
create policy plot_rarities_read on public.plot_rarities for select to anon, authenticated using (true);
create policy world_plots_read on public.world_plots for select to anon, authenticated using (true);
create policy canvas_groups_read on public.canvas_groups for select to anon, authenticated
  using (status = 'active' or owner_id = auth.uid());
create policy canvas_group_members_read on public.canvas_group_members for select to anon, authenticated using (true);
create policy world_density_read on public.world_density for select to anon, authenticated using (true);
create policy publications_read on public.artwork_publications for select to anon, authenticated
  using (status in ('published', 'superseded') or owner_id = auth.uid());
create policy art_tiles_read on public.art_tiles for select to anon, authenticated using (true);
create policy map_updates_read on public.map_updates for select to anon, authenticated using (true);
create policy achievements_read on public.achievements for select to anon, authenticated using (is_active);
create policy player_achievements_read on public.player_achievements for select to anon, authenticated using (true);
create policy featured_read on public.featured_artwork for select to anon, authenticated
  using (starts_at <= now() and (ends_at is null or ends_at > now()));
create policy events_read on public.event_definitions for select to anon, authenticated using (status <> 'draft');
create policy config_read on public.game_config for select to anon, authenticated using (true);
create policy flags_read on public.feature_flags for select to anon, authenticated using (is_public);
create policy minigame_records_read on public.minigame_records for select to anon, authenticated using (true);

-- Private per-player data: owner may read its own rows
grant select on public.players, public.resource_balances, public.resource_ledger, public.player_unlocks,
  public.player_palettes, public.minigame_sessions, public.minigame_rewards, public.artwork_projects,
  public.artwork_versions, public.artwork_layers, public.event_progress, public.moderation_cases,
  public.player_blocks, public.admin_roles, public.plot_ownership, public.gallery_reactions,
  public.rent_accounts, public.rent_ledger, public.boost_activations, public.explorers
to authenticated;

create policy players_own on public.players for select to authenticated using (id = auth.uid());
create policy balances_own on public.resource_balances for select to authenticated using (player_id = auth.uid());
create policy ledger_own on public.resource_ledger for select to authenticated using (player_id = auth.uid());
create policy unlocks_own on public.player_unlocks for select to authenticated using (player_id = auth.uid());
create policy palettes_own on public.player_palettes for select to authenticated using (player_id = auth.uid());
create policy sessions_own on public.minigame_sessions for select to authenticated using (player_id = auth.uid());
create policy rewards_own on public.minigame_rewards for select to authenticated using (player_id = auth.uid());
create policy projects_own on public.artwork_projects for select to authenticated using (owner_id = auth.uid());
create policy versions_own on public.artwork_versions for select to authenticated using (owner_id = auth.uid());
create policy layers_own on public.artwork_layers for select to authenticated
  using (exists (select 1 from public.artwork_projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy event_progress_own on public.event_progress for select to authenticated using (player_id = auth.uid());
create policy cases_own on public.moderation_cases for select to authenticated using (reporter_id = auth.uid());
create policy blocks_own on public.player_blocks for select to authenticated using (blocker_id = auth.uid());
create policy roles_own on public.admin_roles for select to authenticated using (player_id = auth.uid());
create policy ownership_own on public.plot_ownership for select to authenticated using (player_id = auth.uid());
create policy reactions_own on public.gallery_reactions for select to authenticated using (player_id = auth.uid());
create policy rent_accounts_own on public.rent_accounts for select to authenticated using (player_id = auth.uid());
create policy rent_ledger_own on public.rent_ledger for select to authenticated using (player_id = auth.uid());
create policy boosts_own on public.boost_activations for select to authenticated using (player_id = auth.uid());
-- explorer positions are private to their player (never shown to others)
create policy explorers_own on public.explorers for select to authenticated using (player_id = auth.uid());

-- asset_metadata, audit_logs, plot_art_history: no API access at all (RLS on, no policy, no grant).

-- ---- Function privileges ----------------------------------------------------
do $$
declare
  f record;
  v_public_reads text[] := array[
    'world_config', 'plots_in_bbox', 'density_in_bbox', 'art_tile_index', 'map_updates_since', 'plot_details',
    'gallery_list', 'trending_artists', 'artwork_detail', 'profile_by_username', 'leaderboard', 'events_list',
    'achievements_catalog'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon, authenticated', f.sig);
    if f.proname like 'svc\_%' then
      execute format('grant execute on function %s to service_role', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
      if f.proname = any(v_public_reads) then
        execute format('grant execute on function %s to anon', f.sig);
      end if;
    end if;
  end loop;
end $$;

-- ---- Realtime (Supabase only) ----------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.map_updates';
  end if;
end $$;
