-- ✨ Stars you can find, see and paint (Nov 17, 2026)
--
-- Players couldn't find their stars or their plots on them, and on the bigger stars couldn't see or paint them at all:
--  * a star's claimed plots came back in full only for stars of up to 3,242 plots, so on a blue or red giant (10,242)
--    nobody's plots loaded: invisible on the shell, missing from the paint map ("claim a plot here first");
--  * a painting was a flat map of the whole star at most 2,048 px wide: a supergiant's plot got 3 pixels of it, a
--    hypergiant's less than one.
-- Now the full list goes by how many plots are claimed (stars.plots_full), your own plots on a star come in full on
-- their own (star_my_plots), my_stars says where your latest plot is, and a painting can cover just the part of the
-- star round your plots (star_art.rect: u0, v0, du, dv on the flat map) at a size you can paint. Staff see every
-- painting (waiting, on the stars, turned down), approve everything waiting at once, and turn review on or off; every
-- star setting, the sky's sizes and the telescope's reach included, is in admin → Stars.

-- ---- the new settings (whatever's already set is kept) -------------------------------------------------------------
update public.game_config set value =
    jsonb_build_object(
      'plots_full', 6000,
      -- how big stars look: angular diameter = size_k° × the class's size ÷ light-years (max_deg at most); a claimed star
      -- shows its shell (shell_x × bigger) as a disc once it's disc_px across; unclaimed ones draw at point_k of their size
      'sky', jsonb_build_object('size_k', 10, 'shell_x', 2.6, 'point_k', 0.7, 'disc_px', 5, 'max_deg', 3),
      -- the telescope's reach (tiers): everyone, with one Observatory among the stars, with two (or one of `level`)
      'reach', jsonb_build_object('base', 3, 'one', 4, 'two', 5, 'level', 3))
    || value
    || jsonb_build_object('art', jsonb_build_object('region_px', 40) || coalesce(value -> 'art', '{}'::jsonb))
  where key = 'stars';

-- ---- a star's plots: in full by how many are claimed, and yours on their own --------------------------------------------
select private.fn_patch('public.star_plots_of(bigint,integer[])',
  $a$if p_cells is null and sys.cells > 3242 then$a$,
  $b$if p_cells is null and sys.claimed > private.stars_n('plots_full', 6000) then$b$);

create index if not exists star_plots_star_owner on public.star_plots (star_id, owner_id);

/** your plots on a star, all of them (the same rows as star_plots_of), latest first */
create or replace function public.star_my_plots(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_array(sp.cell, sp.rarity, sp.shiny, sp.kind, true, pr.username, pr.accent_color, sp.name, sp.keystone) order by sp.claimed_at desc), '[]'::jsonb)
    from (select * from public.star_plots where star_id = p_id and owner_id = v_uid order by claimed_at desc limit 20000) sp
    left join public.profiles pr on pr.id = sp.owner_id);
end $$;

/** your stars: where you have plots, and the ones you discovered — with where your latest plot is, how far, your painting */
create or replace function public.my_stars() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_uid uuid := private.require_active_player(); v jsonb;
begin
  with mine as (
    select sp.star_id, count(*) n, count(*) filter (where sp.keystone) k, max(sp.claimed_at) last, sum(private.sw_plot_rate(sp.rarity, sp.shiny)) rate
      from public.star_plots sp where sp.owner_id = v_uid group by sp.star_id),
  ids as (select star_id from mine union select s.star_id from public.star_systems s where s.discoverer_id = v_uid)
  select coalesce(jsonb_agg(x order by x ->> 'last' desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', s.star_id, 'name', coalesce(s.name, z.st ->> 'catalog_name'), 'cls', s.cls, 'cells', s.cells, 'claimed', s.claimed,
      'painted', s.painted, 'color', s.color, 'art_rev', s.art_rev, 'discoverer', s.discoverer_id = v_uid, 'mine', coalesce(m.n, 0), 'keystones', coalesce(m.k, 0),
      'kinds', coalesce((select jsonb_object_agg(q.kind, q.c) from (select kind, count(*) c from public.star_plots where star_id = s.star_id and owner_id = v_uid group by kind) q), '{}'::jsonb),
      'usd_per_second', coalesce(m.rate, 0), 'last', coalesce(m.last, s.discovered_at),
      'tier', s.tier, 'ly', (z.st ->> 'ly')::numeric, 'code', z.st ->> 'code',
      'last_cell', (select sp.cell from public.star_plots sp where sp.star_id = s.star_id and sp.owner_id = v_uid order by sp.claimed_at desc limit 1),
      'art', (select a.status from public.star_art a where a.star_id = s.star_id and a.owner_id = v_uid)) x
      from ids join public.star_systems s on s.star_id = ids.star_id
      left join mine m on m.star_id = s.star_id
      cross join lateral (select private.sw_star(s.star_id) as st) z) q;
  return jsonb_build_object('stars', v, 'plots', (select count(*) from public.star_plots where owner_id = v_uid),
    'usd_per_second', private.sw_rent_rate(v_uid) * private.rent_mult(v_uid), 'where', private.sw_pilot_json(private.sw_pilot(v_uid)));
end $$;

-- ---- the telescope's reach, and the sky's sizes (from the settings) ---------------------------------------------------
create or replace function private.sw_reach(p_uid uuid) returns int
language plpgsql stable as $$
declare r jsonb := coalesce(private.stars_cfg() -> 'reach', '{}'::jsonb); n int := 0; lv int := 0;
begin
  if p_uid is not null then
    select count(*), coalesce(max(level), 0) into n, lv from public.star_plots where owner_id = p_uid and kind = 'observatory';
  end if;
  return least(5, greatest(1, case
    when n >= 2 or (n >= 1 and lv >= coalesce((r ->> 'level')::int, 3)) then coalesce((r ->> 'two')::int, 5)
    when n >= 1 then coalesce((r ->> 'one')::int, 4)
    else coalesce((r ->> 'base')::int, 3) end));
end $$;
create or replace function public.star_reach() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object('reach', private.sw_reach(auth.uid()), 'sky', coalesce(private.stars_cfg() -> 'sky', '{}'::jsonb),
    'paint', jsonb_build_object('region_px', private.stars_cfg() -> 'art' -> 'region_px', 'max_w', private.stars_cfg() -> 'art' -> 'max_w'));
end $$;

-- ---- paintings of part of a star ---------------------------------------------------------------------------------------
alter table public.star_art add column if not exists rect jsonb;
create index if not exists star_art_status on public.star_art (status, updated_at);

drop function if exists public.star_art_save(bigint, text, int, int, text);
/** save your painting of a star: a flat map of the whole star (p_rect null: twice as wide as tall), or of just the part of
 *  it in p_rect ({u0, v0, du, dv}: from longitude u0 across du, latitude v0 up dv, all 0…1). Only your own plots show of it. */
create or replace function public.star_art_save(p_id bigint, p_img text, p_w int, p_h int, p_color text, p_rect jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a jsonb := coalesce(private.stars_cfg() -> 'art', '{}'::jsonb);
  v_review boolean := coalesce((a ->> 'review')::boolean, true); v_rev int; v_status text; v_max int := coalesce((a ->> 'max_w')::int, 2048);
  v_rect jsonb; u0 numeric; v0 numeric; du numeric; dv numeric;
begin
  perform private.rate_limit('star_art', 60, 3600);
  if not exists (select 1 from public.star_plots where star_id = p_id and owner_id = v_uid) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_img is null or p_img !~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$' then raise exception 'invalid_image' using errcode = 'P0001'; end if;
  if octet_length(p_img) > coalesce((a ->> 'max_kb')::int, 900) * 1024 * 4 / 3 + 64 then raise exception 'image_too_big' using errcode = 'P0001'; end if;
  if p_rect is not null and jsonb_typeof(p_rect) <> 'null' then
    if jsonb_typeof(p_rect) <> 'object' or jsonb_typeof(p_rect -> 'u0') is distinct from 'number' or jsonb_typeof(p_rect -> 'v0') is distinct from 'number'
       or jsonb_typeof(p_rect -> 'du') is distinct from 'number' or jsonb_typeof(p_rect -> 'dv') is distinct from 'number' then
      raise exception 'invalid_rect' using errcode = 'P0001';
    end if;
    u0 := (p_rect ->> 'u0')::numeric; v0 := (p_rect ->> 'v0')::numeric; du := (p_rect ->> 'du')::numeric; dv := (p_rect ->> 'dv')::numeric;
    if u0 < 0 or u0 >= 1 or du <= 0 or du > 1 or v0 < 0 or v0 >= 1 or dv <= 0 or v0 + dv > 1.000001 then raise exception 'invalid_rect' using errcode = 'P0001'; end if;
    if p_w is null or p_h is null or p_w < 32 or p_h < 32 or p_w > v_max or p_h > v_max then raise exception 'invalid_image' using errcode = 'P0001'; end if;
    v_rect := jsonb_build_object('u0', round(u0, 6), 'v0', round(v0, 6), 'du', round(du, 6), 'dv', round(least(dv, 1 - v0), 6));
  else
    if p_w is null or p_h is null or p_w < 64 or p_w > v_max or p_h * 2 <> p_w then raise exception 'invalid_image' using errcode = 'P0001'; end if;
  end if;
  if p_color is not null and p_color !~ '^#[0-9A-Fa-f]{6}$' then p_color := null; end if;
  v_status := case when v_review then 'pending' else 'approved' end;
  insert into public.star_art (star_id, owner_id, w, h, img, color, status, rect) values (p_id, v_uid, p_w, p_h, p_img, p_color, v_status, v_rect)
  on conflict (star_id, owner_id) do update set rev = public.star_art.rev + 1, w = excluded.w, h = excluded.h, img = excluded.img, color = excluded.color,
    rect = excluded.rect, status = excluded.status, reviewed_by = null, reviewed_at = null, reason = null, updated_at = now()
  returning rev into v_rev;
  if not v_review then perform private.sw_art_changed(p_id); end if;
  perform private.sw_event(p_id, v_uid, 'painted', jsonb_build_object('rev', v_rev, 'status', v_status));
  return jsonb_build_object('rev', v_rev, 'status', v_status, 'achievements', private.sw_badges(v_uid));
end $$;

/** one painting (approved ones for anyone; your own whatever its state), with the part of the star it covers */
create or replace function public.star_art_layer(p_id bigint, p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  return (select jsonb_build_object('owner', a.owner_id, 'rev', a.rev, 'w', a.w, 'h', a.h, 'img', a.img, 'color', a.color, 'status', a.status, 'rect', a.rect)
    from public.star_art a where a.star_id = p_id and a.owner_id = p_owner
     and (a.status = 'approved' or a.owner_id = auth.uid() or not coalesce((private.stars_cfg() -> 'art' ->> 'review')::boolean, true)) limit 1);
end $$;
select private.fn_patch('public.star_card(bigint)', $a$'status', a.status, 'mine', a.owner_id = v_uid)$a$, $b$'status', a.status, 'mine', a.owner_id = v_uid, 'rect', a.rect)$b$);
select private.fn_patch('public.admin_star_art_queue()', $a$'img', a.img,$a$, $b$'img', a.img, 'rect', a.rect,$b$);

-- ---- admin: every painting, and review on or off -----------------------------------------------------------------------
/** paintings by state: 'pending' (oldest first), 'approved' or 'rejected' (newest first) */
create or replace function public.admin_star_art_list(p_status text default 'pending', p_limit int default 40) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  perform private.require_admin(array['moderator']);
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then raise exception 'invalid_value' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('star', a.star_id, 'owner', a.owner_id, 'username', p.username, 'rev', a.rev, 'w', a.w, 'h', a.h, 'img', a.img,
      'rect', a.rect, 'color', a.color, 'status', a.status, 'reason', a.reason, 'updated_at', a.updated_at, 'reviewed_at', a.reviewed_at,
      'star_name', coalesce(s.name, (private.sw_star(a.star_id)) ->> 'catalog_name'), 'cls', s.cls, 'm', s.m, 'cells', s.cells, 'claimed', s.claimed,
      'plots', (select count(*) from public.star_plots sp where sp.star_id = a.star_id and sp.owner_id = a.owner_id)) order by a.k), '[]'::jsonb)
    from (select x.*, case when p_status = 'pending' then extract(epoch from x.updated_at) else -extract(epoch from x.updated_at) end k
            from public.star_art x where x.status = p_status
           order by case when p_status = 'pending' then extract(epoch from x.updated_at) else -extract(epoch from x.updated_at) end
           limit least(greatest(coalesce(p_limit, 40), 1), 100)) a
    left join public.profiles p on p.id = a.owner_id left join public.star_systems s on s.star_id = a.star_id);
end $$;
/** approve every painting that's waiting (when review is turned off, or a batch looks fine) */
create or replace function public.admin_star_art_approve_all() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  perform private.require_admin(array['moderator']);
  for r in select star_id, owner_id from public.star_art where status = 'pending' order by updated_at limit 500 loop
    perform public.admin_star_art_review(r.star_id, r.owner_id, true, null);
    n := n + 1;
  end loop;
  return jsonb_build_object('approved', n, 'left', (select count(*) from public.star_art where status = 'pending'));
end $$;

-- the settings page may set the new ones too
select private.fn_patch('public.admin_set_star_settings(jsonb)',
  $a$nums text[] := array['rent_mult', 'price_k', 'keystone_mult', 'discoverer_pct', 'max_star_plots'];$a$,
  $b$nums text[] := array['rent_mult', 'price_k', 'keystone_mult', 'discoverer_pct', 'max_star_plots', 'plots_full'];$b$);
select private.fn_patch('public.admin_set_star_settings(jsonb)',
  $a$'art', jsonb_build_array('review', 'max_kb', 'max_w'));$a$,
  $b$'art', jsonb_build_array('review', 'max_kb', 'max_w', 'region_px'),
    'sky', jsonb_build_array('size_k', 'shell_x', 'point_k', 'disc_px', 'max_deg'),
    'reach', jsonb_build_array('base', 'one', 'two', 'level'));$b$);
select private.fn_patch('public.admin_set_star_settings(jsonb)',
  $a$  select value into v from public.game_config where key = 'stars';$a$,
  $b$  -- (the telescope's reach is a tier, 1–5; the art can't be wider than 4,096 px; a star at most 30° across)
  if exists (select 1 from jsonb_each(case when jsonb_typeof(p_value -> 'reach') = 'object' then p_value -> 'reach' else '{}'::jsonb end) r
              where (r.value::text)::numeric < 1 or (r.value::text)::numeric > 5)
     or coalesce((p_value -> 'art' ->> 'max_w')::numeric, 2048) > 4096 or coalesce((p_value -> 'art' ->> 'max_w')::numeric, 2048) < 256
     or coalesce((p_value -> 'sky' ->> 'max_deg')::numeric, 3) > 30 or coalesce((p_value ->> 'plots_full')::numeric, 6000) > 50000 then
    raise exception 'invalid_value' using errcode = 'P0001', detail = 'range';
  end if;
  select value into v from public.game_config where key = 'stars';$b$);

-- ---- who may call what ------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.star_my_plots(bigint)', 'public.star_art_save(bigint, text, int, int, text, jsonb)', 'public.admin_star_art_list(text, int)',
    'public.admin_star_art_approve_all()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function private.sw_reach(uuid) from public';
end $$;
