// v0.35 Digging: a shaft per world down through harder and harder layers, materials as you go,
// tools that dig faster (crafted from materials + Ink), energy, and Ink for reaching a layer first.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let dee: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const own = (uid: string, world: string, gx: number, gy: number) => db.sql(`insert into planet_plots (world, gx, gy, owner_id) values ($1, $2, $3, $4) on conflict do nothing`, [world, gx, gy, uid]);
const unthrottle = (uid: string) => db.sql(`update planet_miners set last_dig_at = now() - interval '1 hour' where player_id = $1`, [uid]);

beforeAll(async () => {
  await db.init({ ungated: true });
  dee = await db.newPlayer('dee_digger');
  await db.giveInk(dee, 1000);
});
afterAll(() => db.close());

describe('Digging', () => {
  it('you have to be on the world, and start with a shovel and full energy', async () => {
    await expectError(db.rpc(dee, 'planet_dig', { p_world: 'moon', p_gx: 10, p_gy: 10, p_taps: 5 }), 'land_first');
    await putOn(dee, 'moon'); await own(dee, 'moon', 10, 10);
    const s = await db.rpc(dee, 'planet_dig_state', { p_world: 'moon', p_gx: 10, p_gy: 10 });
    expect(s).toMatchObject({ depth: 0, tools: ['shovel'], power: 1, energy: 240 });
  });

  it('taps dig (no faster than a person), turn up materials and pay Ink for each new layer', async () => {
    const before = await ink(dee);
    const r = await db.rpc(dee, 'planet_dig', { p_world: 'moon', p_gx: 10, p_gy: 10, p_taps: 30, p_d: [0, 0, 1] });
    expect(r.dug).toBeLessThanOrEqual(12); // the first batch is capped
    expect(Number(r.depth)).toBeCloseTo(r.dug, 5); // regolith: 1 m a tap with a shovel
    expect(r.new_layers).toEqual(['regolith']);
    expect(r.layer_ink).toBe(10);
    expect(await ink(dee)).toBe(before + 10);
    // straight away again: hardly any taps allowed
    const again = await db.rpc(dee, 'planet_dig', { p_world: 'moon', p_gx: 10, p_gy: 10, p_taps: 30 });
    expect(again.dug).toBeLessThanOrEqual(4);
    // keep digging into bedrock (3x harder)
    for (let i = 0; i < 4; i++) { await unthrottle(dee); await db.rpc(dee, 'planet_dig', { p_world: 'moon', p_gx: 10, p_gy: 10, p_taps: 30 }); }
    const s = await db.rpc(dee, 'planet_dig_state', { p_world: 'moon', p_gx: 10, p_gy: 10 });
    expect(Number(s.depth)).toBeGreaterThan(12);
    expect(s.layers_reached).toBe(2);
    const found = Object.values(s.items as Record<string, number>).reduce((a, b) => a + Number(b), 0);
    expect(found).toBeGreaterThan(5);
    expect(s.energy).toBeLessThan(240 - 100);
  });

  it('energy runs out (and refills over time)', async () => {
    await db.sql(`update planet_miners set energy = 0, energy_at = now() where player_id = $1`, [dee]);
    await unthrottle(dee);
    await expectError(db.rpc(dee, 'planet_dig', { p_world: 'moon', p_gx: 10, p_gy: 10, p_taps: 5 }), 'no_energy');
    await db.sql(`update planet_miners set energy_at = now() - interval '10 minutes' where player_id = $1`, [dee]);
    expect((await db.rpc(dee, 'planet_dig_state', { p_world: 'moon', p_gx: 10, p_gy: 10 })).energy).toBe(20);
  });

  it('tools cost materials and Ink, and dig faster', async () => {
    await expectError(db.rpc(dee, 'planet_craft_tool', { p_tool: 'drill' }), 'not_enough_materials');
    await expectError(db.rpc(dee, 'planet_craft_tool', { p_tool: 'laser' }), 'invalid_tool');
    await db.sql(`insert into planet_items (player_id, item, qty) values ($1, 'stone', 100) on conflict (player_id, item) do update set qty = 100`, [dee]);
    const before = await ink(dee);
    const r = await db.rpc(dee, 'planet_craft_tool', { p_tool: 'pick' });
    expect(r).toMatchObject({ crafted: 'pick', power: 3 });
    expect(r.tools).toEqual(['shovel', 'pick']);
    expect(r.items.stone).toBe(70);
    expect(await ink(dee)).toBe(before - 40);
    // a second dig spot on another world is its own shaft
    await putOn(dee, 'mars'); await own(dee, 'mars', 20, 20);
    await db.sql(`update planet_miners set energy = 240 where player_id = $1`, [dee]);
    await unthrottle(dee);
    const m = await db.rpc(dee, 'planet_dig', { p_world: 'mars', p_gx: 20, p_gy: 20, p_taps: 3 });
    expect(Number(m.depth)).toBeCloseTo(m.dug * 3, 5); // pick: 3 m a tap in regolith
  });
});
