// v1.0 Simple mode & Base plots: buy a plot from the home screen (no map), its rarity a roll; new plots start as Base plots.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let sam: string, tia: string;
const plots = (u: string) => db.sql(`select gx, gy, rarity from world_plots where owner_id = $1`, [u]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 2 });
  sam = await db.newPlayer('sam_simple'); tia = await db.newPlayer('tia_near');
});
afterAll(() => db.close());

describe('quick buy', () => {
  it('the first plot is the free starter plot, bought without a map or an explorer', async () => {
    const q = await db.rpc(sam, 'quick_buy_quote');
    expect(q).toMatchObject({ starter: true, ink: 0, enabled: true });
    const r = await db.rpc(sam, 'quick_buy_plot', { p_idempotency_key: 'quickbuy-1' });
    expect(r.starter).toBe(true);
    expect(r.rarity).toBeTruthy();
    expect(Number(r.usd_per_second)).toBeGreaterThan(0);
    expect(await plots(sam)).toHaveLength(1);
    const [{ starter_plot_claimed }] = await db.sql(`select starter_plot_claimed from players where id = $1`, [sam]);
    expect(starter_plot_claimed).toBe(true);
  });

  it('the same key buys once', async () => {
    const again = await db.rpc(sam, 'quick_buy_plot', { p_idempotency_key: 'quickbuy-1' });
    expect(again.starter).toBe(true);
    expect(await plots(sam)).toHaveLength(1);
  });

  it('new plots are Base plots, and each lands somewhere new', async () => {
    const r = await db.rpc(sam, 'quick_buy_plot', { p_idempotency_key: 'quickbuy-2' });
    expect(r.starter).toBe(false);
    const groups = await db.rpc(sam, 'my_groups');
    expect(groups.map((g: any) => g.kind)).toEqual(['base', 'base']);
    const p = await plots(sam);
    expect(new Set(p.map((x: any) => `${x.gx}_${x.gy}`)).size).toBe(2);
    // the second one lands near the first
    expect(Math.abs(p[0].gx - p[1].gx)).toBeLessThan(200);
  });

  it('after the free plots, it costs Ink like any plot', async () => {
    const q = await db.rpc(sam, 'quick_buy_quote');
    expect(q.ink).toBeGreaterThan(0);
    await expectError(db.rpc(sam, 'quick_buy_plot', { p_idempotency_key: 'quickbuy-3' }), 'insufficient_funds');
    await db.sql(`select private.ledger_apply($1, 'ink', $2, 'admin_adjust', 'test', 'test', 'quickbuy-ink')`, [sam, q.ink]);
    const r = await db.rpc(sam, 'quick_buy_plot', { p_idempotency_key: 'quickbuy-4' });
    expect(Number(r.cost.ink)).toBe(q.ink);
    expect(Number(r.balances.ink)).toBe(0);
  });

  it('with an explorer, the plot lands near it', async () => {
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [tia]);
    await db.rpc(tia, 'report_position', { p_lng: -111.891, p_lat: 40.7608, p_accuracy_m: 10 });
    const r = await db.rpc(tia, 'quick_buy_plot', { p_idempotency_key: 'quickbuy-t1' });
    const ex = await db.rpc(tia, 'my_explorer');
    const [{ gx, gy }] = await db.sql(`select gx, gy from private.explorer_now($1)`, [tia]);
    expect(ex).toBeTruthy();
    expect(Math.abs(r.gx - gx)).toBeLessThanOrEqual(24);
    expect(Math.abs(r.gy - gy)).toBeLessThanOrEqual(24);
  });
});

describe('Base plots', () => {
  it('giving a Base plot a type is free, even long after it was bought', async () => {
    const [g] = await db.rpc(tia, 'my_groups');
    expect(g.kind).toBe('base');
    await db.sql(`update canvas_groups set created_at = now() - interval '2 days' where id = $1`, [g.id]);
    const r = await db.rpc(tia, 'set_group_kind', { p_group_id: g.id, p_kind: 'farm' });
    expect(r.kind).toBe('farm');
    expect(Number(r.fee)).toBe(0);
  });
});
