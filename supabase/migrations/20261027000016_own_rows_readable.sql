-- LANDVAS v0.5.1
-- v0.5 stopped anyone reading the plot, canvas and artwork tables directly (so
-- nobody can look up where another player's land is). But Supabase Storage's
-- upload and download rules look up *your own* publications as you, so every
-- upload (profile pictures, drafts, artwork) failed with "permission denied for
-- table artwork_publications". Players may now read their own rows again;
-- everyone else's stay private, and anonymous visitors read none of them.

grant select on public.artwork_publications, public.world_plots, public.canvas_groups, public.canvas_group_members to authenticated;
revoke select on public.artwork_publications, public.world_plots, public.canvas_groups, public.canvas_group_members from anon;

drop policy if exists publications_read_own on public.artwork_publications;
create policy publications_read_own on public.artwork_publications for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists world_plots_read_own on public.world_plots;
create policy world_plots_read_own on public.world_plots for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists canvas_groups_read_own on public.canvas_groups;
create policy canvas_groups_read_own on public.canvas_groups for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists canvas_group_members_read_own on public.canvas_group_members;
create policy canvas_group_members_read_own on public.canvas_group_members for select to authenticated
  using (exists (select 1 from public.canvas_groups g where g.id = group_id and g.owner_id = auth.uid()));
