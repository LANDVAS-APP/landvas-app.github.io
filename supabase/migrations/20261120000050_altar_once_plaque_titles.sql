-- Fixes from players (Nov 17):
--  * The Altar of Luck loop: a sacrificed plot went back to the world with its rarity, so buying the same cell again
--    (100 Ink) brought the same ultra back, to sacrifice again for full Luck, forever. A plot laid on the altar now
--    gives its rarity up for good: the cell comes back to the world Common, and stays Common however it's claimed
--    (quick buy, a ticket, an account deleted while holding it). Luck spent on a later claim can still roll it higher,
--    as on any Common cell. Cells sacrificed before this fix are marked the same way.
--  * Plaques: a plaque with no title of its own shows the piece's title, so it counts as titled for a show's score
--    (only the story is up to you).

-- ---- the altar keeps what's offered -----------------------------------------------------------------------------------
create table if not exists private.altar_cells (
  gx int not null,
  gy int not null,
  rarity text not null,            -- what it was when it was laid on the altar
  player_id uuid,                  -- who offered it (kept after they're gone: no reference)
  sacrificed_at timestamptz not null default now(),
  primary key (gx, gy)
);
revoke all on private.altar_cells from public, anon, authenticated;

-- every cell already sacrificed (the release log says so), and the rarity those still waiting in the world come back at
insert into private.altar_cells (gx, gy, rarity, player_id, sacrificed_at)
select distinct on (o.gx, o.gy) o.gx, o.gy, coalesce(w.rarity, 'common'), o.player_id, o.released_at
  from public.plot_ownership o left join public.world_plots w on w.gx = o.gx and w.gy = o.gy
 where o.release_reason = 'sacrificed for luck'
 order by o.gx, o.gy, o.released_at desc
on conflict (gx, gy) do nothing;
update public.world_plots w set rarity = 'common', shiny = false, updated_at = now()
  from private.altar_cells a where a.gx = w.gx and a.gy = w.gy and w.owner_id is null and w.rarity <> 'common';

-- a cell that went to the altar is Common from now on, whatever its own roll
select private.fn_patch('private.plot_rarity_for(integer, integer)',
  'begin',
  'begin
  if exists (select 1 from private.altar_cells a where a.gx = p_gx and a.gy = p_gy) then return ''common''; end if;');

-- laying a plot on the altar gives its rarity up
select private.fn_patch('public.luck_sacrifice_plot(integer, integer)',
  'update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, updated_at = now()',
  'insert into private.altar_cells (gx, gy, rarity, player_id) values (p_gx, p_gy, p.rarity, v_uid)
    on conflict (gx, gy) do update set rarity = excluded.rarity, player_id = excluded.player_id, sacrificed_at = now();
  update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, rarity = ''common'', shiny = false, updated_at = now()');

-- ---- plaques: the title is the piece's own unless you give it another ---------------------------------------------------
select private.fn_patch('private.gallery_score(uuid)',
  'count(*) filter (where coalesce(plaque_title, '''') <> '''' and coalesce(plaque_story, '''') <> '''')',
  'count(*) filter (where coalesce(plaque_story, '''') <> '''')');
select private.fn_patch('private.gallery_score(uuid)',
  'Write a title and a story on %s more plaque%s',
  'Write the story on %s more plaque%s');
