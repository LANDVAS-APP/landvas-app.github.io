// v0.37 Bases: modules on your planet plot, paid with materials (+ Ink), half back when removed, seen by all.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let kai: string, lou: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const items = async (uid: string) => Object.fromEntries((await db.sql(`select item, qty from planet_items where player_id = $1`, [uid])).map((r: any) => [r.item, Number(r.qty)]));

beforeAll(async () => {
  await db.init({ ungated: true });
  kai = await db.newPlayer('kai_builder'); lou = await db.newPlayer('lou_looker');
  await db.giveInk(kai, 2000);
  await db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', 'moon')`, [kai]);
  await db.rpc(kai, 'planet_claim', { p_world: 'moon', p_gx: 5, p_gy: 500 });
  await db.sql(`insert into planet_items (player_id, item, qty) values ($1, 'stone', 100), ($1, 'iron', 20), ($1, 'copper', 10), ($1, 'crystal', 5)`, [kai]);
});
afterAll(() => db.close());

describe('Bases', () => {
  it('only on your own plot, inside it, from the catalogue', async () => {
    const lay = [{ id: 'a', k: 'dome', x: 4, y: 4, r: 0, c: '#F2F5FB' }];
    await expectError(db.rpc(lou, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: lay, p_rev: 0 }), 'not_owner');
    await expectError(db.rpc(kai, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: [{ id: 'a', k: 'castle', x: 4, y: 4 }], p_rev: 0 }), 'invalid_layout');
    await expectError(db.rpc(kai, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: [{ id: 'a', k: 'dome', x: 7, y: 4 }], p_rev: 0 }), 'invalid_layout'); // hangs off the edge
    await expectError(db.rpc(kai, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: [{ id: 'a', k: 'lamp', x: 1, y: 1, c: 'red' }], p_rev: 0 }), 'invalid_layout'); // colours are #rrggbb
  });

  it('new modules cost materials and Ink; everyone sees the base', async () => {
    const before = await ink(kai);
    const lay = [{ id: 'a', k: 'dome', x: 2, y: 2, r: 0, c: '#F2F5FB' }, { id: 'b', k: 'solar', x: 6.5, y: 2, r: 1, c: '#4FA8FF' }, { id: 'c', k: 'lamp', x: 5, y: 6 }];
    const r = await db.rpc(kai, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: lay, p_rev: 0 });
    expect(r.rev).toBe(1);
    expect(r.spent).toEqual({ ink: 30, stone: 20, iron: 6, copper: 6, crystal: 3 });
    expect(await ink(kai)).toBe(before - 30);
    expect(await items(kai)).toMatchObject({ stone: 80, iron: 14, copper: 4, crystal: 2 });
    await expectError(db.rpc(kai, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: lay, p_rev: 0 }), 'layout_conflict');
    await db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', 'moon')`, [lou]);
    const near = await db.rpc(lou, 'planet_plots_near', { p_world: 'moon', p_gx0: 0, p_gx1: 10, p_gy0: 495, p_gy1: 505 });
    expect(near[0].base.layout.map((m: any) => m.k)).toEqual(['dome', 'solar', 'lamp']);
  });

  it('moving a module is free; removing one gives half its materials back; not enough materials stops you', async () => {
    const lay = [{ id: 'a', k: 'dome', x: 4, y: 4, r: 0, c: '#FF5C8A' }, { id: 'c', k: 'lamp', x: 5, y: 7 }];
    const r = await db.rpc(kai, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: lay, p_rev: 1 });
    expect(r.spent).toEqual({});
    expect(r.refunded).toEqual({ copper: 3, crystal: 1 });
    await expectError(db.rpc(kai, 'planet_base_save', { p_world: 'moon', p_gx: 5, p_gy: 500, p_layout: [...lay, { id: 'z', k: 'rig', x: 1.5, y: 1.5 }], p_rev: 2 }), 'not_enough_materials');
  });
});
