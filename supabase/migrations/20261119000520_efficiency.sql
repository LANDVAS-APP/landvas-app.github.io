-- v1.0 efficiency pass: the same game, a lighter load on the database. Every change here gives exactly the answers it
-- gave before (the tests compare old and new side by side); only the work to reach them is less.

-- 1. hot_zone_today: the same answer for everyone, now found by the city's id (an index lookup, once) instead of
-- comparing every city's id as text against a freshly computed hot zone (all ~2,900 cities, the hot zone worked out
-- again for each one).
create or replace function public.hot_zone_today() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('today', z.t, 'tomorrow', private.hot_zone(private.today() + 1),
    'roll_ink', coalesce((z.c ->> 'roll_ink')::int, 150), 'ends_at', private.day_start(now()) + interval '1 day', 'crown_free', not private.crown_held(z.t ->> 'id'),
    'about', (select jsonb_build_object('pop', k.pop, 'state', k.state, 'country', k.country, 'country_name', k.country_name,
                      'plots', (select count(*) from public.world_plots p where p.city_id = k.id and p.owner_id is not null),
                      'crown_holder', (select pr.username from public.world_plots p join public.profiles pr on pr.id = p.owner_id where p.city_id = k.id and p.rarity = 'crown' limit 1),
                      'pop_rank', (select count(*) + 1 from public.world_cities k2 where k2.country = k.country and k2.pop > k.pop))
               from public.world_cities k where k.id = (z.t ->> 'id')::int),
    'ultra_mult', coalesce((z.c ->> 'ultra_mult')::numeric, 5), 'shiny_mult', coalesce((z.c ->> 'shiny_mult')::numeric, 2))
  from (select private.hot_zone(private.today()) t, private.cfg('hot_zones') c) z
$$;

-- 2. An enchantment’s splice traits: its partners are read once (they were read again for each gene, and on
--    PostgreSQL 17 every read planned the partners query afresh); with no partners there are no traits to show.
--    The current trait_view is patched in place (every gene other migrations added stays), not replaced.
create or replace function private.gene_k(p_parts jsonb, p_gene text) returns int language sql immutable as $$
  select coalesce(max((p ->> 'strength')::int), 0) from jsonb_array_elements(p_parts) p where p ->> 'gene' = p_gene
$$;
do $$
declare d text := pg_get_functiondef('private.trait_view(public.enchantments)'::regprocedure); v text;
begin
  v := replace(d, 'private.ench_has_gene(e.id, ''', 'private.gene_k(v_parts, ''');
  v := replace(v, 'o jsonb := ''{}''::jsonb; w jsonb;', 'o jsonb := ''{}''::jsonb; w jsonb; v_parts jsonb := private.ench_partners(e.id);');
  v := regexp_replace(v, E'\nbegin\n', E'\nbegin\n  -- no splice partners: no traits (every gene below would be 0)\n  if jsonb_array_length(v_parts) = 0 then return o; end if;\n');
  if v = d or position('v_parts jsonb := private.ench_partners(e.id)' in v) = 0 or position('private.ench_has_gene(e.id' in v) > 0
     or position('if jsonb_array_length(v_parts) = 0 then return o; end if;' in v) = 0 then
    raise notice 'trait_view left as it was (its shape changed)';
    return;
  end if;
  execute v;
end $$;

-- 3. A plot sheet asked "is there a habitat / farm / business / arcade / realm here?" as five calls; now one call
--    answers the kinds it's asked about, each exactly as its own *_for_plot call does.
create or replace function public.places_for_plot(p_gx int, p_gy int, p_kinds text[] default array['habitat', 'farm', 'business', 'arcade', 'realm'])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'habitat', case when 'habitat' = any (p_kinds) then public.habitat_for_plot(p_gx, p_gy) end,
    'farm', case when 'farm' = any (p_kinds) then public.farm_for_plot(p_gx, p_gy) end,
    'business', case when 'business' = any (p_kinds) then public.biz_for_plot(p_gx, p_gy) end,
    'arcade', case when 'arcade' = any (p_kinds) then public.arcade_for_plot(p_gx, p_gy) end,
    'realm', case when 'realm' = any (p_kinds) then public.realm_for_plot(p_gx, p_gy) end)
$$;
revoke all on function public.places_for_plot(int, int, text[]) from public;
grant execute on function public.places_for_plot(int, int, text[]) to anon, authenticated;

-- 4. Your plot list (my_groups) in one query: the realm settings are read once for the whole list instead of once per
--    plot, and each plot's details are joined in rather than looked up by a helper call per plot. Same list, same order,
--    same fields as private.group_json gives for each plot. (If group_json gains a field, add it here too:
--    tests/sql/520-efficiency-pass checks the two agree.)
create or replace function public.my_groups() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_kinds jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  v_kinds := private.cfg('realms') -> 'kinds';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'status', g.status, 'plot_count', g.plot_count, 'kind', g.kind,
      'habitat_id', h.id, 'farm_id', f.id, 'business_id', b.id, 'arcade_id', a.id, 'realm_id', r.id,
      'place_level', case when g.kind = 'arcade' or v_kinds -> g.kind ->> 'base' = 'arcade'
                          then case when a.id is not null then (private.arc_level(a.xp) ->> 'level')::int end
                          else case when r.id is not null then (private.rlm_level(r.xp) ->> 'level')::int end end,
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
        select jsonb_build_object('id', ap.id, 'status', ap.status, 'title', ap.title, 'created_at', ap.created_at,
                                  'published_at', ap.published_at, 'decision_reason', ap.decision_reason,
                                  'thumb_path', ap.thumb_path, 'plot_count', ap.plot_count)
        from public.artwork_publications ap
        where ap.group_id = g.id and ap.status not in ('cancelled')
        order by ap.created_at desc limit 1),
      'adjacent_groups', (
        select coalesce(jsonb_agg(distinct m2.group_id), '[]'::jsonb)
        from public.canvas_group_members m1
        join private.neighbors(m1.gx, m1.gy) n on true
        join public.canvas_group_members m2 on m2.gx = n.gx and m2.gy = n.gy
        join public.canvas_groups g2 on g2.id = m2.group_id
        where m1.group_id = g.id and m2.group_id <> g.id and g2.owner_id = g.owner_id and g2.status = 'active'))
      order by g.updated_at desc)
    from public.canvas_groups g
    left join public.habitats h on h.group_id = g.id
    left join public.farms f on f.group_id = g.id
    left join public.businesses b on b.group_id = g.id
    left join public.arcades a on a.group_id = g.id
    left join public.realms r on r.group_id = g.id and r.kind = g.kind
    where g.owner_id = v_uid and g.status = 'active'), '[]'::jsonb);
end $$;

-- 5. Helpers that remember their plans. On PostgreSQL 17 (the server's version) a SQL-language helper that reads a
--    table is planned from scratch every time a statement calls it — for the busiest helpers that planning costs far
--    more than the work itself (the splice-partner lookup: ~1 ms to plan, ~0.01 ms to run). The same helpers written
--    in PL/pgSQL keep their plans for the life of the connection. Each one below is rewritten mechanically from its
--    current definition — same arguments, same result, same settings — as `return (its query, first row)`, which is
--    exactly what a SQL function returns. Helpers simple enough to be folded into the query that calls them are left
--    alone (folding is better still).
do $$
declare
  f record; d text; hdr text; body text; n int := 0; v_sql oid := (select oid from pg_language where lanname = 'sql');
begin
  for f in
    select p.oid, p.prosrc from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname in ('public', 'private') and p.prolang = v_sql and not p.proretset and p.prokind = 'f'
       and p.provolatile in ('s', 'i')
       and p.prorettype not in ('void'::regtype, 'record'::regtype, 'trigger'::regtype)
       and (select t.typtype from pg_type t where t.oid = p.prorettype) in ('b', 'd', 'e', 'r', 'm')
       and p.prosrc ~* '\mfrom\M'
       and p.proowner = (select r.oid from pg_roles r where r.rolname = current_user)
       and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
       and not exists (select 1 from pg_depend dp where dp.refobjid = p.oid and dp.classid in ('pg_class'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass, 'pg_rewrite'::regclass))
  loop
    body := regexp_replace(f.prosrc, '[\s;]+$', '');
    body := regexp_replace(body, '^\s+', '');
    -- one query, a plain read: select … / with … select … / (select …)
    continue when body ~ ';' or body !~* '^(\(?\s*select|with)\M' or body ~* '\m(insert|update|delete)\M';
    d := pg_get_functiondef(f.oid);
    hdr := substring(d from '^(.*?)\nAS \$');
    continue when hdr is null or hdr !~ '\n LANGUAGE sql\n';
    hdr := replace(hdr, E'\n LANGUAGE sql\n', E'\n LANGUAGE plpgsql\n');
    begin
      execute hdr || E'\nAS $lv_fn$\n#variable_conflict use_column\nbegin\n  return (select lv_q.lv_x from (\n' || body || E'\n  ) lv_q(lv_x) limit 1);\nend $lv_fn$';
      n := n + 1;
    exception when others then
      raise notice 'kept % as SQL (%)', f.oid::regprocedure, sqlerrm;
    end;
  end loop;
  raise notice 'plan-cached helpers: %', n;
end $$;

-- 6. Game settings are read on almost every call — the realm settings (~180 kB of text) many times a call. Stored
--    compressed, every read unpacked the whole thing again (~1.4 ms on the server, 75x a small setting). Kept
--    unpacked instead (the toast table holds a few hundred kB more), a read is a plain copy.
-- (last, so the settings table is locked only for the moment before this commits)
set local lock_timeout = '10s';
alter table public.game_config alter column value set storage external;
do $$
declare r record;
begin
  for r in select key from public.game_config where pg_column_compression(value) is not null loop
    begin
      update public.game_config set value = (value::text)::jsonb where key = r.key;
    exception when others then
      raise notice 'game_config %: left as it was (%)', r.key, sqlerrm;
    end;
  end loop;
end $$;
