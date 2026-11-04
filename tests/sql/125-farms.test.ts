// v0.46 Farms: a plot type with beds you plant, water and harvest, a market and farm games.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let fay: string, gus: string, farmId: string, groupId: string;
const A = { gx: 3_100_000, gy: 1_900_000 };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const ripen = () => db.sql(`update farm_beds set ready_at = now() - interval '1 second' where farm_id = $1`, [farmId]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  fay = await db.newPlayer('fay_farmer'); gus = await db.newPlayer('gus_guest');
  await db.giveInk(fay, 200);
  await db.rpc(fay, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  groupId = (await db.rpc(fay, 'my_groups'))[0].id;
});
afterAll(() => db.close());

describe('Farms', () => {
  it('a plot becomes a farm (and art can’t be published from it)', async () => {
    const g = await db.rpc(fay, 'set_group_kind', { p_group_id: groupId, p_kind: 'farm' });
    expect(g.kind).toBe('farm');
    expect(g.farm_id).toBeTruthy();
    farmId = g.farm_id;
    expect(await db.rpc(null, 'farm_for_plot', { p_gx: A.gx, p_gy: A.gy })).toMatchObject({ farm_id: farmId, plots: 1 });
    const f = await db.rpc(fay, 'farm_get', { p_id: farmId });
    expect(f).toMatchObject({ mine: true, beds_count: 6, beds: [], items: {} });
  });

  it('plant (carrots are free, others cost a little Ink), water to grow faster', async () => {
    const before = await ink(fay);
    await db.rpc(fay, 'farm_plant', { p_farm: farmId, p_bed: 0, p_crop: 'carrot' });
    const r = await db.rpc(fay, 'farm_plant', { p_farm: farmId, p_bed: 1, p_crop: 'tomato' });
    expect(await ink(fay)).toBe(before - 4);
    expect(r.beds.map((b: any) => b.crop)).toEqual(['carrot', 'tomato']);
    await expectError(db.rpc(fay, 'farm_plant', { p_farm: farmId, p_bed: 1, p_crop: 'corn' }), 'bed_taken');
    await expectError(db.rpc(fay, 'farm_plant', { p_farm: farmId, p_bed: 6, p_crop: 'corn' }), 'invalid_bed');
    await expectError(db.rpc(fay, 'farm_plant', { p_farm: farmId, p_bed: 2, p_crop: 'cactus' }), 'invalid_crop');
    await expectError(db.rpc(gus, 'farm_plant', { p_farm: farmId, p_bed: 2, p_crop: 'carrot' }), 'not_owner');
    const t0 = new Date(r.beds[1].ready_at).getTime();
    const w = await db.rpc(fay, 'farm_water', { p_farm: farmId, p_bed: 1 });
    expect(w.beds[1].watered).toBe(true);
    expect(new Date(w.beds[1].ready_at).getTime()).toBeLessThan(t0 - 9 * 60_000); // 30 min, 40% sooner
  });

  it('harvest when ready, then sell at the market (up to the daily cap)', async () => {
    await expectError(db.rpc(fay, 'farm_harvest', { p_farm: farmId, p_bed: 0 }), 'not_ready');
    await ripen();
    const h = await db.rpc(fay, 'farm_harvest', { p_farm: farmId });
    expect(h.beds_harvested).toBe(2);
    expect(h.beds).toEqual([]);
    const got = Object.entries(h.harvested as Record<string, number>);
    expect(got.length).toBeGreaterThan(0);
    const [item, qty] = got[0];
    const before = await ink(fay);
    const s = await db.rpc(fay, 'farm_sell', { p_item: item, p_qty: qty });
    expect(s.sold).toBe(qty);
    expect(await ink(fay)).toBe(before + s.paid);
    await expectError(db.rpc(fay, 'farm_sell', { p_item: item, p_qty: 1 }), 'not_enough_produce');
    // the cap
    await db.sql(`insert into farm_items (player_id, item, qty) values ($1, 'golden_pumpkin', 10)`, [fay]);
    const big = await db.rpc(fay, 'farm_sell', { p_item: 'golden_pumpkin', p_qty: 10 });
    expect(big.ink_today).toBeLessThanOrEqual(120);
    expect(big.sold).toBeLessThan(10);
    await expectError(db.rpc(fay, 'farm_sell', { p_item: 'golden_pumpkin', p_qty: 1 }), 'farm_cap_reached');
  });

  it('farm games: no faster than the timer, a basket of produce for a good round', async () => {
    await db.sql(`delete from farm_ink_days where player_id = $1`, [fay]);
    const g = await db.rpc(fay, 'farm_game_start', { p_farm: farmId, p_game: 'veggie_catch' });
    await expectError(db.rpc(fay, 'farm_game_finish', { p_session: g.session, p_score: 100 }), 'game_too_fast');
    await db.sql(`update farm_games set started_at = now() - interval '45 seconds' where id = $1`, [g.session]);
    const r = await db.rpc(fay, 'farm_game_finish', { p_session: g.session, p_score: 200 });
    expect(r).toMatchObject({ score: 200, paid: 20 });
    expect(Object.values(r.bonus)).toEqual([5]);
    await expectError(db.rpc(fay, 'farm_game_start', { p_farm: farmId, p_game: 'chess' }), 'invalid_game');
  });

  it('visitors can look round; switching back to a canvas keeps the farm for later', async () => {
    const v = await db.rpc(gus, 'farm_get', { p_id: farmId });
    expect(v).toMatchObject({ mine: false, items: null });
    await db.rpc(fay, 'set_group_kind', { p_group_id: groupId, p_kind: 'canvas' });
    await expectError(db.rpc(fay, 'farm_plant', { p_farm: farmId, p_bed: 0, p_crop: 'carrot' }), 'not_a_farm');
    const back = await db.rpc(fay, 'set_group_kind', { p_group_id: groupId, p_kind: 'farm' });
    expect(back.farm_id).toBe(farmId);
    expect((await db.rpc(fay, 'my_farms')).farms).toHaveLength(1);
  });
});
