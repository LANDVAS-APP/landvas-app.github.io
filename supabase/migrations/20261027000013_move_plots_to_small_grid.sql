-- v0.4: move every plot from the old zoom-16 grid onto the new zoom-22 grid.
-- Each old plot becomes the small plot at its centre with the same owner,
-- level, type, rarity and name. Published art and connected canvases are
-- retired (they were painted for squares 64x wider); every plot starts a fresh
-- single-plot canvas. Balances, USD rent earned and achievements are untouched.
-- Runs once (marker in private.secrets); on a new database it does nothing.
do $$
declare r record;
begin
  if exists (select 1 from private.secrets where key = 'grid_level' and value = 22) then return; end if;

  -- bank everyone's rent at the old rates first
  perform private.rent_settle(player_id) from public.rent_accounts;

  -- minigame runs in progress were started on old-grid plots
  update public.minigame_sessions set status = 'expired', finished_at = now() where status = 'active';
  update public.minigame_sessions set gx = gx * 64 + 32, gy = gy * 64 + 32 where gx is not null and gx < 65536 and gy < 65536;

  -- retire art painted for the old, much larger squares
  update public.artwork_publications set status = 'superseded', updated_at = now(),
         decision_reason = 'Retired when plots became house-sized. Paint your new plot!'
   where status in ('published', 'approved');
  update public.artwork_publications set status = 'cancelled', updated_at = now(),
         decision_reason = 'Cancelled when plots became house-sized. Paint your new plot and publish again.'
   where status in ('uploading', 'processing', 'pending_review');
  update public.moderation_cases set status = 'resolved', resolution = 'grid resized: artwork retired', resolved_at = now()
   where status = 'open' and kind in ('review', 'auto_flag', 'appeal');
  update private.render_jobs set status = 'done', last_error = 'grid resized', updated_at = now() where status in ('queued', 'running');
  update public.profiles set featured_publication_id = null, favorite_publication_ids = '{}'
   where featured_publication_id is not null or cardinality(favorite_publication_ids) > 0;
  delete from public.art_tiles;
  delete from public.plot_art_history;
  delete from public.map_updates;

  -- dissolve canvases; each plot gets its own again below
  delete from public.canvas_group_members;
  update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where status = 'active';
  update public.artwork_projects set status = 'archived', updated_at = now() where status = 'active';

  -- move the plots (through a temp copy, so old and new coordinates never collide)
  create temp table _old_plots on commit drop as
    select gx, gy, plot_type, rarity, owner_id, level, claimed_at, locked, lock_reason, name
    from public.world_plots where (owner_id is not null or locked) and gx < 65536 and gy < 65536;
  alter table public.world_plots disable trigger world_plots_density;
  delete from public.world_plots;
  insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, level, claimed_at, locked, lock_reason, name, updated_at)
  select gx * 64 + 32, gy * 64 + 32, plot_type, rarity, owner_id, level, claimed_at, locked, lock_reason, name, now()
  from _old_plots;
  alter table public.world_plots enable trigger world_plots_density;
  delete from public.world_density;
  perform private.density_bump(gx, gy, 1) from public.world_plots where owner_id is not null;

  -- ownership history: close each old-grid record and continue it on the new cell
  create temp table _open_owners on commit drop as
    select gx, gy, player_id, method, cost, acquired_at from public.plot_ownership
    where released_at is null and gx < 65536 and gy < 65536;
  update public.plot_ownership set released_at = now(), release_reason = 'moved to the small-plot grid'
   where released_at is null and gx < 65536 and gy < 65536;
  insert into public.plot_ownership (gx, gy, player_id, method, cost, acquired_at)
  select o.gx * 64 + 32, o.gy * 64 + 32, o.player_id, o.method, o.cost, o.acquired_at
  from _open_owners o
  join public.world_plots w on w.gx = o.gx * 64 + 32 and w.gy = o.gy * 64 + 32 and w.owner_id = o.player_id;

  -- a fresh single-plot canvas for every plot
  for r in select gx, gy, owner_id from public.world_plots where owner_id is not null order by claimed_at loop
    perform private.create_group_with_cells(r.owner_id, jsonb_build_array(jsonb_build_array(r.gx, r.gy)),
                                            private.empty_manifest(), null, 'initial');
  end loop;

  insert into private.secrets (key, value) values ('grid_level', 22)
  on conflict (key) do update set value = excluded.value;
end $$;
