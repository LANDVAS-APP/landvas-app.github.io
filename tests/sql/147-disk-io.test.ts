// v0.7.1: the database writes as little as it can (the free plan's Disk IO budget).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
beforeAll(async () => { await db.init(); });
afterAll(async () => { await db.close(); });

describe('disk use', () => {
  it('keeps map updates out of the realtime change feed', async () => {
    const r = await db.sql(`select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'map_updates'`);
    expect(r[0].n).toBe(0);
  });
  it('keeps short-lived bookkeeping in unlogged tables', async () => {
    const r = await db.sql(`select c.relname t, c.relpersistence p from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where (n.nspname, c.relname) in (('private', 'rate_limits'), ('public', 'arcade_presence'), ('public', 'planet_presence')) and c.relkind = 'r' order by 1`);
    expect(r.map((x: { t: string; p: string }) => `${x.t}:${x.p}`)).toEqual(['arcade_presence:u', 'planet_presence:u', 'rate_limits:u']);
  });
});

describe('ready to scale', () => {
  it('has an index for every foreign key (except the fixed lists)', async () => {
    const r = await db.sql(`select c.conname from pg_constraint c join pg_namespace n on n.oid = (select relnamespace from pg_class where oid = c.conrelid)
      where c.contype = 'f' and n.nspname in ('public', 'private')
        and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey::int2[])
      order by 1`);
    const left = r.map((x: { conname: string }) => x.conname);
    expect(left.every((n: string) => /kind_fkey|plot_type_fkey|rarity_fkey|achievement_key_fkey|sku_fkey/.test(n) || /^(plot_|realm_|achiev)/.test(n))).toBe(true);
    expect(left.length).toBeLessThan(12);
  });
});

describe('presence without constant check-ins', () => {
  it('a check-in holds your place for a lease past its own time', async () => {
    const r = await db.sql(`select extract(epoch from private.presence_lease())::int s`);
    expect(r[0].s).toBe(35);
    const src = await db.sql(`select string_agg(pg_get_functiondef(p.oid), ' ') d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('arcade_live', 'arena_live', 'home_live', 'planet_live')`);
    expect((src[0].d.match(/now\(\) \+ private\.presence_lease\(\)/g) ?? []).length).toBe(8);
  });
});
