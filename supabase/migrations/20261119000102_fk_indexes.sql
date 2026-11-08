-- v0.7.2 Ready to scale: every foreign key gets an index.
--
-- A foreign key without an index is fine with a few hundred players and painful with hundreds of thousands: looking
-- rows up by that column, and deleting or changing the row it points at (an account deletion, a plot changing hands),
-- has to read the whole table. This adds the missing ones (90 of them) in one go. Keys that point at small fixed lists
-- (plot types, rarities, kinds, achievements, shop items) are left out: those rows never go away, so nothing gains.
do $$
declare
  r record;
  v_name text;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, n.nspname, t.relname,
           array_agg(a.attname order by k.ord) as cols
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join lateral unnest(c.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and n.nspname in ('public', 'private')
      and c.confrelid::regclass::text not in ('public.plot_types', 'public.plot_rarities', 'public.achievements',
                                               'public.plot_kinds', 'public.realm_kinds', 'private.shop_skus', 'public.shop_skus')
      and c.conname not in ('canvas_groups_kind_fkey', 'realms_kind_fkey', 'world_plots_plot_type_fkey',
                            'world_plots_rarity_fkey', 'player_achievements_achievement_key_fkey', 'purchase_orders_sku_fkey')
      -- no index already starts with these columns
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey::int2[])
    group by c.conname, c.conrelid, n.nspname, t.relname
  loop
    v_name := left(r.relname || '_' || array_to_string(r.cols, '_') || '_fkx', 63);
    execute format('create index if not exists %I on %s (%s)', v_name, r.tbl,
                   (select string_agg(quote_ident(x), ', ') from unnest(r.cols) x));
  end loop;
end $$;
