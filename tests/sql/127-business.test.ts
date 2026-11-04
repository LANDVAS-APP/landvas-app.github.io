// v0.49 Business plots: tapping, ventures, milestones, upgrades, golden customers, going public, dividends, tips, games.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let bo: string, vi: string, bizId: string, groupId: string;
const A = { gx: 3_300_000, gy: 2_000_000 };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const setState = (sql: string, args: unknown[] = []) => db.sql(`update biz_state set ${sql} where player_id = $1`, [bo, ...args]);
const back = (secs: number) => setState(`synced_at = now() - make_interval(secs => $2)`, [secs]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  bo = await db.newPlayer('biz_owner'); vi = await db.newPlayer('biz_visitor');
  await db.giveInk(bo, 100);
  await db.rpc(bo, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  groupId = (await db.rpc(bo, 'my_groups'))[0].id;
});
afterAll(() => db.close());

describe('Business plots', () => {
  it('a plot becomes a business with a lemonade stand', async () => {
    const g = await db.rpc(bo, 'set_group_kind', { p_group_id: groupId, p_kind: 'business' });
    expect(g.kind).toBe('business');
    bizId = g.business_id;
    expect(bizId).toBeTruthy();
    const b = await db.rpc(bo, 'biz_get', { p_id: bizId });
    expect(b.mine).toBe(true);
    expect(b.state).toMatchObject({ cash: 0, income: 0, tap_value: 1 });
    expect(b.state.ventures).toHaveLength(10);
    expect(b.state.ventures[0]).toMatchObject({ key: 'lemonade', owned: 0, revealed: true });
    expect(b.state.ventures[0].cost).toBeCloseTo(15, 6);
    expect(await db.rpc(null, 'biz_for_plot', { p_gx: A.gx, p_gy: A.gy })).toMatchObject({ business_id: bizId });
  });

  it('taps are banked on sync, but no faster than fingers can go', async () => {
    await back(2);
    const s = await db.rpc(bo, 'biz_sync', { p_taps: 20 });
    expect(s.tapped).toBe(20);
    expect(s.cash).toBe(20);
    await back(1);
    const t = await db.rpc(bo, 'biz_sync', { p_taps: 100000 });
    expect(t.tapped).toBeLessThan(60);
  });

  it('ventures cost 15% more each and earn every second', async () => {
    await setState('cash = 1000');
    const r = await db.rpc(bo, 'biz_buy', { p_key: 'lemonade', p_qty: 1 });
    expect(r.spent).toBeCloseTo(15, 5);
    expect(r.ventures[0].cost).toBeCloseTo(15 * 1.15, 5);
    const c = await db.rpc(bo, 'biz_buy', { p_key: 'cookies', p_qty: 1 });
    expect(c.income).toBeCloseTo(1.1, 5);
    await back(100);
    const s = await db.rpc(bo, 'biz_sync', { p_taps: 0 });
    expect(s.cash).toBeGreaterThan(c.cash + 100);
    await expectError(db.rpc(bo, 'biz_buy', { p_key: 'space', p_qty: 1 }), 'not_enough_cash');
    await expectError(db.rpc(bo, 'biz_buy', { p_key: 'casino', p_qty: 1 }), 'invalid_venture');
  });

  it('buy max, and owning 25 doubles a venture (and pays a little Ink once)', async () => {
    await setState('cash = 1e6');
    const before = await ink(bo);
    const r = await db.rpc(bo, 'biz_buy', { p_key: 'lemonade', p_qty: 24 });
    expect(r.milestones).toEqual([25]);
    expect(r.ink).toBe(3);
    expect(await ink(bo)).toBe(before + 3);
    const lem = r.ventures.find((v: any) => v.key === 'lemonade');
    expect(lem.owned).toBe(25);
    // 25 × 0.1 × 2 (milestone) × 2 (the "own 1" upgrade isn't bought yet → ×1)
    expect(lem.rate).toBeCloseTo(25 * 0.1 * 2, 5);
    const m = await db.rpc(bo, 'biz_buy', { p_key: 'cookies', p_qty: 0 });
    expect(m.qty).toBeGreaterThan(20);
  });

  it('upgrades unlock as you go and double things', async () => {
    const s = await db.rpc(bo, 'biz_sync', { p_taps: 0 });
    const keys = s.upgrades.map((u: any) => u.key);
    expect(keys).toContain('v:lemonade:1');
    expect(keys).toContain('t1');
    await expectError(db.rpc(bo, 'biz_upgrade', { p_key: 'v:space:1' }), 'upgrade_locked');
    const before = s.ventures.find((v: any) => v.key === 'lemonade').rate;
    const u = await db.rpc(bo, 'biz_upgrade', { p_key: 'v:lemonade:1' });
    expect(u.ventures.find((v: any) => v.key === 'lemonade').rate).toBeCloseTo(before * 2, 5);
    const t = await db.rpc(bo, 'biz_upgrade', { p_key: 't1' });
    expect(t.tap_value).toBeCloseTo(2, 5);
    await expectError(db.rpc(bo, 'biz_upgrade', { p_key: 't1' }), 'already_owned');
  });

  it('golden customers: only while they are there', async () => {
    await setState(`golden_at = now() + interval '1 hour'`);
    await expectError(db.rpc(bo, 'biz_golden'), 'no_customer');
    await setState(`golden_at = now() - interval '2 seconds'`);
    const g = await db.rpc(bo, 'biz_golden');
    expect(['lucky', 'frenzy', 'storm']).toContain(g.golden.kind);
    expect(new Date(g.golden_at).getTime()).toBeGreaterThan(Date.now() + 60_000);
    await expectError(db.rpc(bo, 'biz_golden'), 'no_customer');
  });

  it('a Frenzy makes the company earn 7x while it lasts', async () => {
    const base = (await db.rpc(bo, 'biz_sync', { p_taps: 0 })).income;
    await setState(`buff = 'frenzy', buff_mult = 7, buff_from = now() - interval '30 seconds', buff_until = now() + interval '30 seconds', synced_at = now() - interval '20 seconds', cash = 0`);
    const s = await db.rpc(bo, 'biz_sync', { p_taps: 0 });
    expect(s.cash).toBeGreaterThan(base * 20 * 6.5);
    expect(s.buff.kind).toBe('frenzy');
    await setState(`buff = null, buff_mult = 1, buff_from = null, buff_until = null`);
  });

  it('going public resets the run but keeps shares, which boost everything', async () => {
    await expectError(db.rpc(bo, 'biz_ipo'), 'not_ready_for_ipo');
    await setState('alltime = 8e9');
    const r = await db.rpc(bo, 'biz_ipo');
    expect(r.ipo.new_shares).toBe(2);
    expect(r).toMatchObject({ cash: 0, shares: 2, ipos: 1, income: 0, upgrades_owned: 0 });
    expect(r.ventures[0].owned).toBe(0);
    expect(r.tap_value).toBeCloseTo(1.04, 5);
    await expectError(db.rpc(bo, 'biz_ipo'), 'not_ready_for_ipo');
  });

  it('a dividend once a day', async () => {
    const before = await ink(bo);
    const d = await db.rpc(bo, 'biz_dividend');
    expect(d.dividend.ink).toBeGreaterThan(3);
    expect(await ink(bo)).toBe(before + d.dividend.ink);
    await expectError(db.rpc(bo, 'biz_dividend'), 'already_done');
  });

  it('visitors look round and can buy a lemonade once a day', async () => {
    const v = await db.rpc(vi, 'biz_get', { p_id: bizId });
    expect(v).toMatchObject({ mine: false, tipped_today: false });
    expect(v.state).toBeUndefined();
    expect(v.public.shares).toBe(2);
    const cash0 = Number((await db.sql(`select cash from biz_state where player_id = $1`, [bo]))[0].cash);
    const t = await db.rpc(vi, 'biz_tip', { p_biz: bizId });
    expect(t.paid).toBe(2);
    const cash1 = Number((await db.sql(`select cash from biz_state where player_id = $1`, [bo]))[0].cash);
    expect(cash1).toBeGreaterThanOrEqual(cash0 + 100);
    await expectError(db.rpc(vi, 'biz_tip', { p_biz: bizId }), 'already_done');
    await expectError(db.rpc(bo, 'biz_tip', { p_biz: bizId }), 'own_business');
  });

  it('business games pay Ink and cash, no faster than the timer', async () => {
    const g = await db.rpc(bo, 'biz_game_start', { p_biz: bizId, p_game: 'stock_trader' });
    await expectError(db.rpc(bo, 'biz_game_finish', { p_session: g.session, p_score: 100 }), 'game_too_fast');
    await db.sql(`update biz_games set started_at = now() - interval '50 seconds' where id = $1`, [g.session]);
    const r = await db.rpc(bo, 'biz_game_finish', { p_session: g.session, p_score: 240 });
    expect(r).toMatchObject({ score: 240, paid: 20 });
    expect(r.cash).toBeGreaterThanOrEqual(480);
    await expectError(db.rpc(vi, 'biz_game_start', { p_biz: bizId, p_game: 'haggle' }), 'not_owner');
  });

  it('a second business plot boosts all income by 10%', async () => {
    await setState(`ventures = '{"cookies": 10}'::jsonb, upgrades = '[]'::jsonb, shares = 0`);
    const one = (await db.rpc(bo, 'biz_sync', { p_taps: 0 })).income;
    await db.sql(`update canvas_groups set plot_count = 2 where id = $1`, [groupId]);
    const two = (await db.rpc(bo, 'biz_sync', { p_taps: 0 })).income;
    expect(two / one).toBeCloseTo(1.1, 5);
    await db.sql(`update canvas_groups set plot_count = 1 where id = $1`, [groupId]);
  });
});
