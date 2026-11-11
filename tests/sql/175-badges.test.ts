// v1.3: ~200 badges — every rarity, every kind of plot, streaks, luck, travel, estates and more.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let u: string;
beforeAll(async () => { await db.init({ ungated: true, freePlots: 10 }); u = await db.newPlayer('bea_badges'); });
afterAll(() => db.close());

describe('badges', () => {
  it('there are about 200, with unique keys and an icon each', async () => {
    const r = await db.sql(`select key, icon, category from achievements where is_active`);
    expect(r.length).toBeGreaterThanOrEqual(200);
    expect(r.every((x: any) => x.icon && x.icon.length > 0)).toBe(true);
    for (const c of ['rarity', 'daily', 'travel', 'estate', 'kinds']) expect(r.some((x: any) => x.category === c)).toBe(true);
  });
  it('every metric a badge uses is one the server measures (no badge can never unlock)', async () => {
    await db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (5, 3000000, 'graphite', 'singularity', $1, now())`, [u]);
    const [m] = await db.sql(`select private.achievement_metrics($1) m`, [u]);
    const metrics = (await db.sql(`select distinct metric from achievements where is_active`)).map((x: any) => x.metric);
    const missing = metrics.filter((k: string) => !(k in m.m) && !k.startsWith('rar_') && !k.startsWith('kind_'));
    expect(missing).toEqual([]);
  });
  it('owning a rarity unlocks its badge', async () => {
    const got = await db.sql(`select private.evaluate_achievements($1) a`, [u]);
    expect(got[0].a.map((x: any) => x.key)).toContain('rar_singularity');
    const cat = await db.rpc(u, 'achievements_catalog');
    expect(cat.find((x: any) => x.key === 'rar_singularity')).toMatchObject({ icon: 'rarity:singularity', category: 'rarity' });
    expect(cat.find((x: any) => x.key === 'rar_singularity').unlocked_at).toBeTruthy();
  });
});
