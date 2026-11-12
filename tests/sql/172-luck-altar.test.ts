// v1.3: the Altar of Luck — sacrifice Base plots or offer Ink for Luck, and the next claim spends it on extra rolls
// and likelier ultras.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let u: string, v: string;
const ink = (who: string, n: number) => db.sql(`select private.ledger_apply($1, 'ink', $2, 'admin_adjust', 'test', 'test', $3)`, [who, n, `t:luck:${Math.random()}`]);
const SLC = { lng: -111.891, lat: 40.7608 };

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10, basePlots: true });
  u = await db.newPlayer('lucky_lou'); v = await db.newPlayer('plain_pat');
  for (const w of [u, v]) {
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [w]);
    await db.rpc(w, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  }
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
});
afterAll(() => db.close());

describe('the Altar of Luck', () => {
  it('starts at 0 and lists your single Base plots as offerings', async () => {
    for (let i = 0; i < 3; i++) await db.rpc(u, 'quick_buy_plot', { p_idempotency_key: `luck-buy-${i}-xxxxxxxx` });
    const s = await db.rpc(u, 'luck_status');
    expect(s).toMatchObject({ luck: 0, max: 100, rolls: 1, ultra_x: 1 });
    expect(s.plots.length).toBe(3);
    expect(s.plots[0].luck).toBeGreaterThan(0);
  });
  it('sacrificing a plot gives Luck by its rarity, and the plot goes back to the world', async () => {
    const s = await db.rpc(u, 'luck_status');
    const p = s.plots[0];
    const r = await db.rpc(u, 'luck_sacrifice_plot', { p_gx: p.gx, p_gy: p.gy });
    expect(r.luck).toBe(p.luck); expect(r.gained).toBe(p.luck);
    const [w] = await db.sql(`select owner_id from world_plots where gx = $1 and gy = $2`, [p.gx, p.gy]);
    expect(w.owner_id).toBeNull();
    await expectError(db.rpc(v, 'luck_sacrifice_plot', { p_gx: s.plots[1].gx, p_gy: s.plots[1].gy }), 'not_owned');
  });
  it('Ink buys Luck too (50 a point, no daily limit — up to full)', async () => {
    await ink(u, 10000);
    const before = (await db.rpc(u, 'luck_status')).luck;
    const r = await db.rpc(u, 'luck_offer_ink', { p_points: 20 });
    expect(r.luck).toBe(before + 20); expect(r.cost).toBe(1000);
    const r2 = await db.rpc(u, 'luck_offer_ink', { p_points: 100 });
    expect(r2.luck).toBe(100); expect(r2.gained).toBe(100 - before - 20);
    await expectError(db.rpc(u, 'luck_offer_ink', { p_points: 1 }), 'luck_full');
  });
  it('the next claim spends it on rerolls: 6 rolls at 100 Luck, and you pick the one you keep', async () => {
    await db.sql(`update player_luck set luck = 100, armed = 0 where player_id = $1`, [u]);
    // saved, not spent, until you arm it
    expect((await db.rpc(u, 'luck_status'))).toMatchObject({ rolls: 1, armed: 0, can_reroll: 5 });
    await expectError(db.rpc(u, 'luck_arm', { p_rerolls: 6 }), 'invalid_amount');
    await db.rpc(u, 'luck_arm', { p_rerolls: 5 });
    expect((await db.rpc(u, 'luck_status'))).toMatchObject({ rolls: 6, ultra_x: 11, armed: 5 });
    const r = await db.rpc(u, 'quick_buy_plot', { p_idempotency_key: 'luck-roll-1-xxxxxxxxx' });
    expect((await db.rpc(u, 'luck_status'))).toMatchObject({ luck: 0, armed: 0 });
    expect(r.choices.length).toBe(6);
    // the plot holds the best until you choose; choose the first (the cell's own roll)
    const p = await db.rpc(u, 'luck_pick', { p_gx: r.gx, p_gy: r.gy, p_idx: 0 });
    expect(p.rarity).toBe(r.choices[0]);
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [r.gx, r.gy]))[0].rarity).toBe(r.choices[0]);
    await expectError(db.rpc(u, 'luck_pick', { p_gx: r.gx, p_gy: r.gy, p_idx: 1 }), 'nothing_to_pick');
    const feed = await db.sql(`select data from feed_events where kind = 'luck' and player_id = $1 order by id desc limit 1`, [u]);
    expect(feed[0].data).toMatchObject({ sub: 'pick', of: 6 });
  });
  it('one reroll costs 20; the rest is saved', async () => {
    await db.sql(`update player_luck set luck = 70 where player_id = $1`, [u]);
    await db.rpc(u, 'luck_arm', { p_rerolls: 1 });
    const r = await db.rpc(u, 'quick_buy_plot', { p_idempotency_key: 'luck-roll-1b-xxxxxxxx' });
    expect(r.choices.length).toBe(2);
    expect((await db.rpc(u, 'luck_status'))).toMatchObject({ luck: 50, armed: 0 });
    await db.rpc(u, 'luck_pick', { p_gx: r.gx, p_gy: r.gy, p_idx: 0 });
  });
  it('unarmed Luck waits', async () => {
    await db.sql(`update player_luck set luck = 60, armed = 0 where player_id = $1`, [u]);
    const r = await db.rpc(u, 'quick_buy_plot', { p_idempotency_key: 'luck-roll-1c-xxxxxxxx' });
    expect(r.choices ?? null).toBeNull();
    expect((await db.rpc(u, 'luck_status')).luck).toBe(60);
  });
  it('under 20 Luck waits for the next claim', async () => {
    await db.sql(`update player_luck set luck = 15, armed = 3 where player_id = $1`, [u]);
    const r = await db.rpc(u, 'quick_buy_plot', { p_idempotency_key: 'luck-roll-2-xxxxxxxxx' });
    expect(r.choices ?? null).toBeNull();
    expect((await db.rpc(u, 'luck_status')).luck).toBe(15);
  });
  it('100 Luck makes rolls much better on average', async () => {
    // (luck is spent by the first call, so measure directly with a fresh 100 each time)
    let better = 0;
    for (let i = 0; i < 120; i++) {
      await db.sql(`insert into player_luck (player_id, luck) values ($1, 100) on conflict (player_id) do update set luck = 100`, [v]);
      const [r] = await db.sql(`select private.luck_apply($1, 'common') r`, [v]);
      if (r.r !== 'common') better++;
    }
    expect(better).toBeGreaterThan(100); // best of 6: P(all six common) ≈ 0.35^5 ≈ 0.5%
  });
  it('can’t sacrifice your last plot', async () => {
    const w = await db.newPlayer('one_plot_olly');
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [w]);
    await db.rpc(w, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
    const r = await db.rpc(w, 'quick_buy_plot', { p_idempotency_key: 'olly-1-xxxxxxxxxxxx' });
    await expectError(db.rpc(w, 'luck_sacrifice_plot', { p_gx: r.gx, p_gy: r.gy }), 'last_plot');
  });
});
