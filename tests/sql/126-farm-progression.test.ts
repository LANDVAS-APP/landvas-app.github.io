// v0.47 plot switch fee + v0.48 farm progression: levels, coins, upgrades, buildings, recipes, orders.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let flo: string, farmId: string, groupId: string;
const A = { gx: 3_200_000, gy: 1_950_000 };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const give = (item: string, n: number) => db.sql(`insert into farm_items (player_id, item, qty) values ($1, $2, $3) on conflict (player_id, item) do update set qty = farm_items.qty + excluded.qty`, [flo, item, n]);
const coins = (n: number) => db.sql(`update farm_progress set coins = $2 where player_id = $1`, [flo, n]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  flo = await db.newPlayer('flo_fields');
  await db.giveInk(flo, 300);
  await db.rpc(flo, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  groupId = (await db.rpc(flo, 'my_groups'))[0].id;
});
afterAll(() => db.close());

describe('Plot switch fee', () => {
  it('free right after claiming, a small Ink fee after that', async () => {
    const before = await ink(flo);
    const g = await db.rpc(flo, 'set_group_kind', { p_group_id: groupId, p_kind: 'farm' });
    expect(g.fee).toBe(0);
    expect(await ink(flo)).toBe(before);
    farmId = g.farm_id;
    const c = await db.rpc(flo, 'set_group_kind', { p_group_id: groupId, p_kind: 'canvas' });
    expect(c.fee).toBe(20);
    expect(await ink(flo)).toBe(before - 20);
    await db.rpc(flo, 'set_group_kind', { p_group_id: groupId, p_kind: 'farm' });
    expect(await ink(flo)).toBe(before - 40);
  });
});

describe('Farm progression', () => {
  it('starts at level 1; planting and harvesting earn XP, level-ups pay coins', async () => {
    const f = await db.rpc(flo, 'farm_get', { p_id: farmId });
    expect(f.progress).toMatchObject({ level: 1, coins: 0 });
    expect(f.progress.orders).toHaveLength(3);
    await db.rpc(flo, 'farm_plant', { p_farm: farmId, p_bed: 0, p_crop: 'carrot' });
    await db.sql(`update farm_beds set ready_at = now() - interval '1 second' where farm_id = $1`, [farmId]);
    const h = await db.rpc(flo, 'farm_harvest', { p_farm: farmId });
    expect(h.progress.xp).toBeGreaterThan(1);
    await db.sql(`update farm_progress set xp = 49 where player_id = $1`, [flo]);
    await db.rpc(flo, 'farm_plant', { p_farm: farmId, p_bed: 1, p_crop: 'carrot' }); // +1 xp → level 2
    const p = (await db.rpc(flo, 'farm_get', { p_id: farmId })).progress;
    expect(p.level).toBe(2);
    expect(p.coins).toBe(50);
  });

  it('the level curve starts slow and scales', async () => {
    const xs = await db.sql(`select private.farm_level_xp(n) x from generate_series(1, 20) n order by n`);
    const steps = xs.slice(1).map((r: any, i: number) => Number(r.x) - Number(xs[i].x));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it('upgrades cost coins, need a level, and get dearer', async () => {
    await expectError(db.rpc(flo, 'farm_upgrade', { p_key: 'fertilizer' }), 'farm_level_needed');
    await coins(10);
    await expectError(db.rpc(flo, 'farm_upgrade', { p_key: 'sprinkler' }), 'not_enough_coins');
    await coins(1000);
    const a = await db.rpc(flo, 'farm_upgrade', { p_key: 'sprinkler' });
    const b = await db.rpc(flo, 'farm_upgrade', { p_key: 'sprinkler' });
    expect(a).toMatchObject({ to: 1, spent: 40 });
    expect(b.spent).toBeGreaterThan(a.spent);
    expect(b.upgrades.sprinkler).toBe(2);
  });

  it('the coop lays eggs over time; collecting keeps the part-made one', async () => {
    await coins(1000);
    const b = await db.rpc(flo, 'farm_build', { p_key: 'coop' });
    expect(b.buildings.coop).toMatchObject({ lvl: 1, ready: 0 });
    await db.sql(`update farm_progress set buildings = jsonb_set(buildings, '{coop,at}', to_jsonb(now() - interval '40 minutes')) where player_id = $1`, [flo]);
    const c = await db.rpc(flo, 'farm_collect', { p_key: 'coop' });
    expect(c.collected.egg).toBe(2);
    expect(c.items.egg).toBe(2);
    expect(c.buildings.coop.ready).toBe(0);
    await expectError(db.rpc(flo, 'farm_collect', { p_key: 'hive' }), 'not_built');
  });

  it('kitchens turn produce into dishes worth more', async () => {
    await db.sql(`update farm_progress set xp = 2000, coins = 5000 where player_id = $1`, [flo]);
    await expectError(db.rpc(flo, 'farm_craft', { p_recipe: 'salad', p_times: 1 }), 'not_built');
    await db.rpc(flo, 'farm_build', { p_key: 'kitchen' });
    await expectError(db.rpc(flo, 'farm_craft', { p_recipe: 'salad', p_times: 1 }), 'not_enough_produce');
    await give('lettuce', 4); await give('tomato', 2);
    const r = await db.rpc(flo, 'farm_craft', { p_recipe: 'salad', p_times: 2 });
    expect(r.items.salad).toBe(2);
    expect(r.items.lettuce ?? 0).toBe(0);
    const s = await db.rpc(flo, 'farm_sell', { p_item: 'salad', p_qty: 2 });
    expect(s.coins).toBeGreaterThan(32); // 16 each, plus level and stall bonuses
  });

  it('orders: fill with what they want for coins, XP and Ink; a new one turns up later', async () => {
    const o = (await db.rpc(flo, 'farm_get', { p_id: farmId })).progress.orders[0];
    for (const [item, n] of Object.entries(o.wants as Record<string, number>)) await give(item, n);
    const before = (await db.rpc(flo, 'farm_get', { p_id: farmId })).progress.coins;
    const r = await db.rpc(flo, 'farm_order_fill', { p_slot: 0 });
    expect(r.filled.coins).toBe(o.coins);
    expect(r.coins).toBeGreaterThanOrEqual(before + o.coins);
    expect(r.orders[0].ready).toBe(false);
    await expectError(db.rpc(flo, 'farm_order_fill', { p_slot: 0 }), 'not_found');
    const sk = await db.rpc(flo, 'farm_order_skip', { p_slot: 2 });
    expect(sk.orders[2].ready).toBe(false);
  });

  it('a bigger barn adds beds; crops unlock by level', async () => {
    const before = (await db.rpc(flo, 'farm_get', { p_id: farmId })).beds_count;
    await db.rpc(flo, 'farm_upgrade', { p_key: 'barn' });
    expect((await db.rpc(flo, 'farm_get', { p_id: farmId })).beds_count).toBe(before + 2);
    await db.sql(`update farm_progress set xp = 0 where player_id = $1`, [flo]);
    await expectError(db.rpc(flo, 'farm_plant', { p_farm: farmId, p_bed: 3, p_crop: 'melon' }), 'farm_level_needed');
  });

  it('the new farm games pay coins and their own extras', async () => {
    const g = await db.rpc(flo, 'farm_game_start', { p_farm: farmId, p_game: 'pollinator' });
    await db.sql(`update farm_games set started_at = now() - interval '50 seconds' where id = $1`, [g.session]);
    const r = await db.rpc(flo, 'farm_game_finish', { p_session: g.session, p_score: 180 });
    expect(r.coins).toBe(45);
    expect(r.bonus.honey).toBe(3);
  });

  it('daily chores: calm tap chores and farming ones, a little Ink each and a bonus for the lot', async () => {
    const p = (await db.rpc(flo, 'farm_get', { p_id: farmId })).progress;
    const list = p.chores.list as any[];
    expect(list).toHaveLength(5);
    expect(list.filter((c) => c.kind === 'tap')).toHaveLength(3);
    const count = list.find((c) => c.kind === 'count');
    await expectError(db.rpc(flo, 'farm_chore_claim', { p_key: count.key }), 'not_done_yet');
    const before = await ink(flo);
    let last: any;
    for (const c of list.filter((x) => x.kind === 'tap')) last = await db.rpc(flo, 'farm_chore_claim', { p_key: c.key });
    expect(await ink(flo)).toBeGreaterThan(before);
    await expectError(db.rpc(flo, 'farm_chore_claim', { p_key: list[0].key }), 'already_done');
    expect(last.all_done).toBe(false);
    // finish the farming ones (as if you'd done the work)
    await db.sql(`update farm_chores set progress = 99 where player_id = $1`, [flo]);
    for (const c of list.filter((x) => x.kind === 'count')) last = await db.rpc(flo, 'farm_chore_claim', { p_key: c.key });
    expect(last.all_done).toBe(true);
  });

  it('farming counts towards the chores (tractor tally too)', async () => {
    await db.sql(`delete from farm_chores where player_id = $1`, [flo]);
    await db.sql(`insert into farm_chores (player_id, day, key) values ($1, private.day_start(now()), 'tractor'), ($1, private.day_start(now()), 'plant')`, [flo]);
    const t = await db.rpc(flo, 'farm_tractor_tally', { p_beds: 5 });
    expect(t.list.find((c: any) => c.key === 'tractor')).toMatchObject({ progress: 5, ready: true });
    await db.sql(`update farm_progress set xp = 0 where player_id = $1`, [flo]);
    await db.sql(`delete from farm_beds where farm_id = $1`, [farmId]);
    await db.rpc(flo, 'farm_plant', { p_farm: farmId, p_bed: 4, p_crop: 'carrot' });
    const ch = (await db.rpc(flo, 'farm_get', { p_id: farmId })).progress.chores.list;
    expect(ch.find((c: any) => c.key === 'plant').progress).toBe(1);
  });
});
