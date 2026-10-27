import { describe, it, expect, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();

describe('migrations', () => {
  afterAll(() => db.close());
  it('apply cleanly on PostgreSQL', async () => {
    await db.init();
    const r = await db.sql(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    expect(r[0].n).toBeGreaterThan(60);
  });
  it('world_config is readable anonymously', async () => {
    const cfg = await db.rpc(null, 'world_config');
    expect(cfg.grid.level).toBe(16);
    expect(cfg.plot_types).toHaveLength(4);
  });
});
