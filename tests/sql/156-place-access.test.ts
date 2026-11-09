// v0.9.2 games open up with the size of the place; plot rent upgrades are gone (levels reset, spend refunded).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let cy: string;
const O = { gx: 2_900_000, gy: 1_800_000 };
let n = 0;
const groupAt = async (uid: string, gx: number, gy: number) =>
  (await db.rpc(uid, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === gx && c[1] === gy));

beforeAll(async () => {
  await db.init({ ungated: true });
  cy = await db.newPlayer('cy_access');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [cy]);
  await db.rpc(cy, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(cy, 200_000);
  for (const [x, y] of [[1, 0], [0, 1], [1, 1]]) await db.rpc(cy, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `access-acq-${++n}-00000` });
});
afterAll(() => db.close());

describe('games open with the size of the place', () => {
  it('the open share steps from a quarter to half to all', async () => {
    const rows = await db.sql(`select private.place_open(16, 1) a, private.place_open(16, 2) b, private.place_open(16, 3) c, private.place_open(16, 4) d, private.place_open(16, 9) e, private.place_open(2, 1) f, private.place_open(6, 1) g`);
    expect(rows[0]).toEqual({ a: 4, b: 8, c: 8, d: 16, e: 16, f: 1, g: 2 });
  });

  it('an arcade on one plot has 4 cabinets, on two 8, on four all 16', async () => {
    const g0 = await groupAt(cy, O.gx, O.gy);
    const arc = (await db.rpc(cy, 'set_group_kind', { p_group_id: g0.id, p_kind: 'arcade' })).arcade_id;
    let a = await db.rpc(cy, 'place_access', { p_kind: 'arcade', p_id: arc });
    expect(a.plots).toBe(1); expect(a.total).toBe(16); expect(a.open).toBe(4); expect(a.next).toEqual({ plots: 2, open: 8 });
    // open every cabinet so only the plot rule decides
    const all: string[] = a.games;
    await db.sql(`update arcades set machines = (select jsonb_object_agg(k, 1) from unnest($2::text[]) k) where id = $1`, [arc, all]);
    const locked = all[5];
    await expectError(db.rpc(cy, 'arcade_start', { p_arcade: arc, p_game: locked }), 'needs_bigger_place');
    expect((await db.rpc(cy, 'arcade_start', { p_arcade: arc, p_game: all[0] })).session).toBeTruthy();
    // merge a second plot in (same type) → 8 open
    const g1 = await groupAt(cy, O.gx + 1, O.gy);
    await db.rpc(cy, 'set_group_kind', { p_group_id: g1.id, p_kind: 'arcade' });
    await db.rpc(cy, 'fuse_groups', { p_group_ids: [g0.id, g1.id] });
    const arc2 = (await db.sql(`select a.id from arcades a join canvas_group_members m on m.group_id = a.group_id where m.gx = $1 and m.gy = $2`, [O.gx, O.gy]))[0].id;
    a = await db.rpc(cy, 'place_access', { p_kind: 'arcade', p_id: arc2 });
    expect(a.plots).toBe(2); expect(a.open).toBe(8); expect(a.next).toEqual({ plots: 4, open: 16 });
    await db.sql(`update arcades set machines = (select jsonb_object_agg(k, 1) from unnest($2::text[]) k) where id = $1`, [arc2, all]);
    expect((await db.rpc(cy, 'arcade_start', { p_arcade: arc2, p_game: locked })).session).toBeTruthy();
    await expectError(db.rpc(cy, 'arcade_start', { p_arcade: arc2, p_game: all[12] }), 'needs_bigger_place');
    // and all four
    for (const [x, y] of [[0, 1], [1, 1]]) { const g = await groupAt(cy, O.gx + x, O.gy + y); await db.rpc(cy, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' }); }
    const ids = [...new Set(await Promise.all([[0, 0], [0, 1], [1, 1]].map(async ([x, y]) => (await groupAt(cy, O.gx + x, O.gy + y)).id)))];
    await db.rpc(cy, 'fuse_groups', { p_group_ids: ids });
    const arc4 = (await db.sql(`select a.id from arcades a join canvas_group_members m on m.group_id = a.group_id where m.gx = $1 and m.gy = $2`, [O.gx, O.gy]))[0].id;
    a = await db.rpc(cy, 'place_access', { p_kind: 'arcade', p_id: arc4 });
    expect(a.plots).toBe(4); expect(a.open).toBe(16); expect(a.next).toBeNull();
    await db.sql(`update arcades set machines = (select jsonb_object_agg(k, 1) from unnest($2::text[]) k) where id = $1`, [arc4, all]);
    expect((await db.rpc(cy, 'arcade_start', { p_arcade: arc4, p_game: all[15] })).session).toBeTruthy();
  });

  it('the arcade opens its lowest-level cabinets first', async () => {
    const order = (await db.sql(`select private.place_games('arcade') g`))[0].g as string[];
    const lv = (await db.sql(`select value -> 'games' g from game_config where key = 'arcade'`))[0].g;
    const levels = order.map((k) => Number(lv[k].level ?? 1));
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('farms, businesses and realm types have their own lists', async () => {
    const r = await db.sql(`select private.place_games('farm') f, private.place_games('business') b, private.place_games('mine') m, private.place_games('brawl') w`);
    expect(r[0].f).toHaveLength(6); expect(r[0].f[0]).toBe('tractor');
    expect(r[0].b).toEqual(['lemon_pour', 'delivery_dash', 'haggle', 'stock_trader']);
    expect(r[0].m).toHaveLength(2); expect(r[0].w).toEqual([]);
  });
});

describe('no more plot rent upgrades', () => {
  it('upgrading a plot is refused', async () => {
    await expectError(db.rpc(cy, 'upgrade_plot', { p_gx: O.gx, p_gy: O.gy, p_idempotency_key: 'upg-0000000001' }), 'upgrades_removed');
  });
  it('the upgrade achievement is retired and every plot is level 1', async () => {
    expect((await db.sql(`select count(*)::int c from achievements where metric = 'upgrades' and is_active`))[0].c).toBe(0);
    expect((await db.sql(`select count(*)::int c from world_plots where level > 1`))[0].c).toBe(0);
  });
});
