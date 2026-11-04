// v0.42 Shafts in your own planet plots, down through the mantle to the core.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ava: string, bo: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const own = (uid: string, world: string, gx: number, gy: number) => db.sql(`insert into planet_plots (world, gx, gy, owner_id) values ($1, $2, $3, $4)`, [world, gx, gy, uid]);
const ready = (uid: string) => db.sql(`update planet_miners set energy = 240, last_dig_at = now() - interval '1 hour' where player_id = $1`, [uid]);

beforeAll(async () => {
  await db.init({ ungated: true });
  ava = await db.newPlayer('ava_core'); bo = await db.newPlayer('bo_core');
  for (const p of [ava, bo]) { await db.giveInk(p, 100); await putOn(p, 'moon'); }
  await own(ava, 'moon', 300, 400); await own(ava, 'moon', 301, 400); await own(bo, 'moon', 302, 400);
});
afterAll(() => db.close());

describe('plot shafts', () => {
  it('only you dig into your own plots', async () => {
    await expectError(db.rpc(ava, 'planet_dig', { p_world: 'moon', p_taps: 5 }), 'dig_own_plot');
    await expectError(db.rpc(ava, 'planet_dig', { p_world: 'moon', p_taps: 5, p_gx: 302, p_gy: 400 }), 'dig_own_plot');
    await expectError(db.rpc(ava, 'planet_dig', { p_world: 'moon', p_taps: 5, p_gx: 999, p_gy: 400 }), 'dig_own_plot');
    const r = await db.rpc(ava, 'planet_dig', { p_world: 'moon', p_taps: 5, p_gx: 300, p_gy: 400 });
    expect(r).toMatchObject({ gx: 300, gy: 400, dug: 5 });
    expect(Number(r.depth)).toBeCloseTo(5, 5);
  });

  it('each plot has its own shaft, and everyone sees it', async () => {
    await ready(ava);
    const r = await db.rpc(ava, 'planet_dig', { p_world: 'moon', p_taps: 3, p_gx: 301, p_gy: 400 });
    expect(Number(r.depth)).toBeCloseTo(3, 5);
    expect(r.my_shafts.map((s: any) => [s.gx, Number(s.depth)])).toEqual([[300, 5], [301, 3]]);
    const near = await db.rpc(bo, 'planet_plots_near', { p_world: 'moon', p_gx0: 295, p_gx1: 305, p_gy0: 395, p_gy1: 405 });
    const items = near.plots ?? near;
    expect(items.find((p: any) => p.gx === 300).shaft).toMatchObject({ depth: 5, cored: false });
    expect(items.find((p: any) => p.gx === 302).shaft).toBeNull();
  });

  it('the old world shaft carries over into your first plot shaft', async () => {
    await putOn(bo, 'mars');
    await db.sql(`insert into planet_shafts (player_id, world, depth, layers_reached) values ($1, 'mars', 70, 3)`, [bo]);
    await own(bo, 'mars', 50, 50);
    await db.rpc(bo, 'planet_dig_state', { p_world: 'mars' }); await ready(bo);
    const r = await db.rpc(bo, 'planet_dig', { p_world: 'mars', p_taps: 1, p_gx: 50, p_gy: 50 });
    expect(Number(r.depth)).toBeGreaterThan(70);
    expect(r.layers_reached).toBe(3);
  });

  it('reaching the core: a Core heart, Ink past the daily cap, and Core rarity', async () => {
    await ready(ava);
    await db.sql(`update planet_plot_shafts set depth = 19999.99, layers_reached = 6 where world = 'moon' and gx = 300 and gy = 400`);
    const before = await ink(ava);
    const r = await db.rpc(ava, 'planet_dig', { p_world: 'moon', p_taps: 5, p_gx: 300, p_gy: 400 });
    expect(r).toMatchObject({ reached_core: true, core_ink: 2500, cored: true });
    expect(Number(r.depth)).toBe(20000);
    expect(r.items.core_heart).toBe(1);
    expect(await ink(ava)).toBeGreaterThanOrEqual(before + 2500);
    expect((await db.sql(`select rarity from planet_plots where world = 'moon' and gx = 300 and gy = 400`))[0].rarity).toBe('core');
    expect((await db.sql(`select count(*)::int n from feed_events where kind = 'core'`))[0].n).toBe(1);
    // only once
    await ready(ava);
    const again = await db.rpc(ava, 'planet_dig', { p_world: 'moon', p_taps: 5, p_gx: 300, p_gy: 400 });
    expect(again).toMatchObject({ reached_core: false, dug: 5 });
    expect(again.items.core_heart).toBe(1);
  });

  it('nobody can roll Core rarity by claiming', async () => {
    const w = await db.sql(`select v ->> 'weight' w from jsonb_array_elements((select value -> 'rarities' from game_config where key = 'planets')) v where v ->> 'id' = 'core'`);
    expect(Number(w[0].w)).toBe(0);
  });
});
