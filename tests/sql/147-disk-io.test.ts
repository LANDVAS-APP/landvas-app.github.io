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
