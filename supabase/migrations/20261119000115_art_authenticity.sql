-- Art authenticity: every artwork says how it was made.
--   made = 'drawn'   painted in the LANDVAS editor, no uploaded image ever placed in it
--   made = 'upload'  an uploaded image was placed into it (the editor sets manifest.imported)
--   made = null      published before the editor recorded uploads (v0.16, 2026-10-29), so unknown
-- Merging, detaching and compacting canvases used to rebuild the manifest from its layers only,
-- which dropped the upload flag; they now carry it over, so a merge can't turn an upload "drawn".

/** {"imported": true} when either manifest had an uploaded image placed in it, else {}. */
create or replace function private.manifest_imported_tag(p_a jsonb, p_b jsonb default null) returns jsonb
language sql immutable as $$
  select case when coalesce((p_a ->> 'imported')::boolean, false) or coalesce((p_b ->> 'imported')::boolean, false)
              then '{"imported": true}'::jsonb else '{}'::jsonb end
$$;

-- Keep only the tiles of p_cells (detach). The piece keeps the whole canvas's upload flag.
create or replace function private.manifest_restrict(p_manifest jsonb, p_cells jsonb) returns jsonb
language plpgsql immutable as $$
declare v_res jsonb;
begin
  with keys as (
    select private.cell_key((c ->> 0)::int, (c ->> 1)::int) as k from jsonb_array_elements(p_cells) c
  ), layers as (
    select l.v, l.i,
      coalesce((select jsonb_object_agg(t.key, t.value) from jsonb_each(coalesce(l.v -> 'tiles', '{}'::jsonb)) t
                where t.key in (select k from keys)), '{}'::jsonb) as tiles
    from jsonb_array_elements(coalesce(p_manifest -> 'layers', '[]'::jsonb)) with ordinality l(v, i)
  ), kept as (
    select * from layers where tiles <> '{}'::jsonb
  )
  select case
    when exists (select 1 from kept) then
      jsonb_build_object('layers', (select jsonb_agg(jsonb_set(v, '{tiles}', tiles) order by i) from kept))
    when exists (select 1 from layers) then
      jsonb_build_object('layers', jsonb_build_array(jsonb_set((select v from layers order by i limit 1), '{tiles}', '{}'::jsonb)))
    else private.empty_manifest()
  end into v_res;
  return v_res || private.manifest_imported_tag(p_manifest);
end $$;

-- Append the non-empty layers of p_b to p_a, de-duplicating layer ids. Uploaded in either → uploaded.
create or replace function private.manifest_merge(p_a jsonb, p_b jsonb) returns jsonb
language plpgsql immutable as $$
declare v_layers jsonb := coalesce(p_a -> 'layers', '[]'::jsonb); v_ids text[]; v_l jsonb; v_id text; v_n int;
begin
  select coalesce(array_agg(l ->> 'id'), '{}') into v_ids from jsonb_array_elements(v_layers) l;
  for v_l in
    select l.v from jsonb_array_elements(coalesce(p_b -> 'layers', '[]'::jsonb)) with ordinality l(v, i)
    where coalesce(l.v -> 'tiles', '{}'::jsonb) <> '{}'::jsonb order by l.i
  loop
    v_id := v_l ->> 'id'; v_n := 2;
    while v_id = any(v_ids) loop
      v_id := left(v_l ->> 'id', 34) || '-m' || v_n;
      v_n := v_n + 1;
    end loop;
    v_ids := array_append(v_ids, v_id);
    v_layers := v_layers || jsonb_build_array(jsonb_set(v_l, '{id}', to_jsonb(v_id)));
  end loop;
  return jsonb_build_object('layers', v_layers) || private.manifest_imported_tag(p_a, p_b);
end $$;

-- Drop empty layers; the upload flag stays.
create or replace function private.manifest_compact(p_manifest jsonb) returns jsonb
language plpgsql immutable as $$
declare v_kept jsonb;
begin
  select jsonb_agg(l.v order by l.i) into v_kept
  from jsonb_array_elements(p_manifest -> 'layers') with ordinality l(v, i)
  where coalesce(l.v -> 'tiles', '{}'::jsonb) <> '{}'::jsonb;
  if v_kept is null then return p_manifest; end if;
  return jsonb_build_object('layers', v_kept) || private.manifest_imported_tag(p_manifest);
end $$;

/** How a publication was made: 'drawn', 'upload', or null when it predates upload tracking. */
create or replace function private.art_made(p_pub public.artwork_publications) returns text
language sql stable as $$
  select case
    when p_pub.published_at is not null and p_pub.published_at < timestamptz '2026-10-29 02:00:00+00' then null
    when coalesce((select (v.manifest ->> 'imported')::boolean from public.artwork_versions v where v.id = p_pub.version_id), false)
      or coalesce((p_pub.craft ->> 'imported')::boolean, false) then 'upload'
    else 'drawn'
  end
$$;

-- the card everyone sees, now with `made`
create or replace function private.artwork_card(p_pub public.artwork_publications, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p_pub.id, 'title', p_pub.title, 'plot_count', p_pub.plot_count, 'published_at', p_pub.published_at,
    'thumb_path', p_pub.thumb_path, 'preview_path', p_pub.preview_path,
    'preview_width', p_pub.preview_width, 'preview_height', p_pub.preview_height,
    'appreciation_count', p_pub.appreciation_count, 'status', p_pub.status,
    'craft_score', p_pub.craft_score,
    'featured', exists (select 1 from public.featured_artwork f where f.publication_id = p_pub.id and (f.ends_at is null or f.ends_at > now())),
    'made', private.art_made(p_pub),
    'artist', private.profile_json(p_pub.owner_id),
    'appreciated', p_viewer is not null and exists (
      select 1 from public.gallery_reactions r where r.publication_id = p_pub.id and r.player_id = p_viewer))
  || case when p_viewer = p_pub.owner_id then jsonb_build_object('craft', p_pub.craft) else '{}'::jsonb end
  || case when private.can_see_location(p_pub.owner_id, p_viewer) then jsonb_build_object(
       'center_lng', p_pub.center_lng, 'center_lat', p_pub.center_lat,
       'min_gx', p_pub.min_gx, 'min_gy', p_pub.min_gy, 'max_gx', p_pub.max_gx, 'max_gy', p_pub.max_gy)
     else '{}'::jsonb end
$$;

do $$
begin
  execute 'revoke all on function private.manifest_imported_tag(jsonb, jsonb) from public';
  execute 'revoke all on function private.art_made(public.artwork_publications) from public';
end $$;


-- Featured today: community spots now need at least one Inspire. Before, every new publish of the
-- day filled an empty Featured today (and the first one was shown as Painting of the Day).
create or replace function public.featured_today(p_limit int default 12) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_limit int := least(greatest(coalesce(p_limit, 12), 1), 30); v_res jsonb;
begin
  with potd as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'potd', 'note', f.note) as card, -1 as grp, 0 as s1, -extract(epoch from f.starts_at) as s2
      from public.featured_artwork f join public.artwork_publications a on a.id = f.publication_id
     where f.section = 'spotlight' and a.status = 'published' and f.starts_at <= now() and (f.ends_at is null or f.ends_at > now())
       and private.visible_to(a.owner_id, v_uid)
     order by f.starts_at desc limit 1
  ), staff as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'staff', 'note', f.note) as card, 0 as grp, f.sort as s1, -extract(epoch from f.starts_at) as s2
      from public.featured_artwork f join public.artwork_publications a on a.id = f.publication_id
     where f.section <> 'spotlight' and a.id not in (select id from potd) and a.status = 'published' and f.starts_at >= private.day_start(now()) - interval '1 day'
       and (f.ends_at is null or f.ends_at > now()) and private.visible_to(a.owner_id, v_uid)
  ), community as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'community') as card, 1 as grp, -a.appreciation_count as s1, -extract(epoch from a.published_at) as s2
      from public.artwork_publications a
     where a.status = 'published' and a.published_at > now() - interval '1 day' and private.visible_to(a.owner_id, v_uid)
       and a.appreciation_count >= 1 -- a community pick has to have inspired someone; publishing alone isn't featuring
       and a.id not in (select id from staff) and a.id not in (select id from potd)
     order by a.appreciation_count desc, a.published_at desc limit v_limit
  ), both_ as (select * from potd union all select * from staff union all select * from community)
  select coalesce(jsonb_agg(card order by grp, s1, s2), '[]'::jsonb) into v_res
    from (select * from both_ order by grp, s1, s2 limit v_limit) x;
  return v_res;
end $$;
