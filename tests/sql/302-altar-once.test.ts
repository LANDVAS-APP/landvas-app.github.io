// The Altar of Luck takes a plot's rarity for good: buying the same cell back can't bring the same ultra back to
// sacrifice again (the loop players found on Nov 17).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let u: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const ink = (who: string, n: number) => db.sql(`select private.ledger_apply($1, 'ink', $2, 'admin_adjust', 'test', 'test', $3)`, [who, n, `t:altar:${Math.random()}`]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10, basePlots: true });
  u = await db.newPlayer('loop_lou');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
});
afterAll(() => db.close());

describe('the altar keeps what it’s given', () => {
  it('a sacrificed ultra comes back to the world Common, and buying it back gives a Common plot', async () => {
    for (let i = 0; i < 3; i++) await db.rpc(u, 'quick_buy_plot', { p_idempotency_key: `altar-buy-${i}-xxxxxxxx` });
    const [p] = await db.sql(`select gx, gy from world_plots where owner_id = $1 order by gx, gy limit 1`, [u]);
    await db.sql(`update world_plots set rarity = 'gemini' where gx = $1 and gy = $2`, [p.gx, p.gy]);
    const r = await db.rpc(u, 'luck_sacrifice_plot', { p_gx: p.gx, p_gy: p.gy });
    expect(r.rarity).toBe('gemini');
    expect(r.gained).toBeGreaterThan(1); // an ultra's worth of Luck, once
    const [w] = await db.sql(`select owner_id, rarity, shiny from world_plots where gx = $1 and gy = $2`, [p.gx, p.gy]);
    expect(w).toMatchObject({ owner_id: null, rarity: 'common', shiny: false });
    expect((await db.sql(`select rarity from private.altar_cells where gx = $1 and gy = $2`, [p.gx, p.gy]))[0].rarity).toBe('gemini');
    expect((await db.sql(`select private.plot_rarity_for($1, $2) r`, [p.gx, p.gy]))[0].r).toBe('common');
    // buy it back (no Luck to spend): it's Common now, and laying it on the altar again gives a Common plot's Luck
    await db.sql(`update player_luck set luck = 0 where player_id = $1`, [u]);
    await ink(u, 100000);
    const a = await db.rpc(u, 'acquire_plot', { p_gx: p.gx, p_gy: p.gy, p_idempotency_key: 'altar-back-xxxxxxxxxx' });
    expect(a.rarity).toBe('common');
    const again = await db.rpc(u, 'luck_sacrifice_plot', { p_gx: p.gx, p_gy: p.gy });
    expect(again.rarity).toBe('common');
    expect(again.gained).toBeLessThan(r.gained);
  });

  it('even with the plot row gone (an account deleted while holding it), the cell stays Common', async () => {
    const [p] = await db.sql(`select gx, gy from private.altar_cells limit 1`);
    await db.sql(`delete from world_plots where gx = $1 and gy = $2`, [p.gx, p.gy]);
    expect((await db.sql(`select private.plot_rarity_for($1, $2) r`, [p.gx, p.gy]))[0].r).toBe('common');
  });
});
