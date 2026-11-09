// v0.9.4 one place per plot type: every plot of a type opens the player's one place, which lives on their biggest
// land of that type; existing separate places are joined, the highest-levelled one becoming the place.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let u: string;
const O = { gx: 3_100_000, gy: 2_000_000 };
let n = 0;
const groupAt = async (gx: number, gy: number) =>
  (await db.rpc(u, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === gx && c[1] === gy));
const at = (x: number, y: number) => groupAt(O.gx + x, O.gy + y);
const kind = async (x: number, y: number, k: string) => db.rpc(u, 'set_group_kind', { p_group_id: (await at(x, y)).id, p_kind: k });

beforeAll(async () => {
  await db.init({ ungated: true });
  u = await db.newPlayer('one_place');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(u, 300_000);
  for (const [x, y] of [[1, 0], [0, 1], [1, 1], [4, 0], [6, 0], [8, 0], [10, 0], [12, 0]])
    await db.rpc(u, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `one-acq-${++n}-00000` });
});
afterAll(() => db.close());

describe('one place per plot type', () => {
  it('separate arcade plots all open the same arcade', async () => {
    const a = (await kind(4, 0, 'arcade')).arcade_id;
    const b = (await kind(6, 0, 'arcade')).arcade_id;
    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect((await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx + 6, p_gy: O.gy })).arcade_id).toBe(a);
    expect((await db.sql(`select count(*)::int c from arcades where owner_id = $1`, [u]))[0].c).toBe(1);
  });

  it('the arcade lives on the biggest arcade land, and leaves it when that land changes type', async () => {
    const ids = [];
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ids.push((await kind(x, y, 'arcade')).id);
    const big = (await db.rpc(u, 'fuse_groups', { p_group_ids: ids })).id;
    const arc = (await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx + 4, p_gy: O.gy }));
    expect(arc.plots).toBe(4); // entered from a single plot, it's the 4-plot arcade with every cabinet
    await db.sql(`update arcades set xp = 5000, plays = 42 where id = $1`, [arc.arcade_id]);
    expect((await db.rpc(u, 'place_access', { p_kind: 'arcade', p_id: arc.arcade_id })).open).toBe(16);
    // upgrade the big land to the Estate: the arcade (same progress) moves to the next biggest arcade land
    await db.rpc(u, 'set_group_kind', { p_group_id: big, p_kind: 'boardwalk' });
    const after = await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx + 6, p_gy: O.gy });
    expect(after.arcade_id).toBe(arc.arcade_id);
    expect(after.plots).toBe(1);
    expect(after.level).toBeGreaterThan(1);
    // and back
    const down = await db.rpc(u, 'set_group_kind', { p_group_id: big, p_kind: 'arcade' });
    expect(down.arcade_id).toBe(arc.arcade_id);
    const [row] = await db.sql(`select xp, plays, group_id from arcades where id = $1`, [arc.arcade_id]);
    expect(Number(row.xp)).toBe(5000);
    expect(row.group_id).toBe(big);
  });

  it('the last arcade plot switching away keeps the arcade waiting, unchanged', async () => {
    const arc = (await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx, p_gy: O.gy })).arcade_id;
    for (const [x, y] of [[4, 0], [6, 0]]) await kind(x, y, 'farm');
    await db.rpc(u, 'set_group_kind', { p_group_id: (await at(0, 0)).id, p_kind: 'boardwalk' });
    expect(await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx + 4, p_gy: O.gy })).toBeNull();
    const back = await kind(8, 0, 'arcade');
    expect(back.arcade_id).toBe(arc);
    expect(Number((await db.sql(`select xp from arcades where id = $1`, [arc]))[0].xp)).toBe(5000);
  });

  it('farms, businesses, realms and habitats are one place each too', async () => {
    expect((await at(4, 0)).farm_id).toBe((await at(6, 0)).farm_id);
    const m1 = (await kind(10, 0, 'mine')).realm_id, m2 = (await kind(12, 0, 'mine')).realm_id;
    expect(m2).toBe(m1);
    const h1 = (await kind(10, 0, 'habitat')).habitat_id, h2 = (await kind(12, 0, 'habitat')).habitat_id;
    expect(h2).toBe(h1);
    expect((await db.rpc(u, 'habitat_for_plot', { p_gx: O.gx + 10, p_gy: O.gy })).habitat_id).toBe(h1);
    // room for creatures counts every habitat plot
    const [{ cap }] = await db.sql(`select private.habitat_capacity(h) cap from habitats h where id = $1`, [h1]);
    expect(cap).toBe(5);
  });

  it('joining old separate places: the highest-levelled becomes the place and nothing is lost', async () => {
    const arc = (await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx + 8, p_gy: O.gy })).arcade_id;
    // a second, older-style arcade (as before this change): higher level, its own cabinets, decor and plays
    const [{ id: old }] = await db.sql(`insert into arcades (owner_id, xp, plays, machines, decor_owned) values ($1, 9000, 10, '{"stacker": 6, "pinball": 2}', '["neon:gold"]') returning id`, [u]);
    await db.sql(`update arcades set machines = '{"stacker": 2, "cyclone": 4}' where id = $1`, [arc]);
    const [{ keep }] = await db.sql(`select private.place_unify($1, 'arcade') keep`, [u]);
    expect(keep).toBe(old);
    const [k] = await db.sql(`select xp, plays, machines, decor_owned, group_id from arcades where id = $1`, [old]);
    expect(Number(k.xp)).toBe(9000);
    expect(Number(k.plays)).toBe(52);
    expect(k.machines).toEqual({ stacker: 6, pinball: 2, cyclone: 4 });
    expect(k.decor_owned).toContain('neon:gold');
    expect(k.group_id).toBeTruthy();
    expect((await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx + 8, p_gy: O.gy })).arcade_id).toBe(old);
  });
});
