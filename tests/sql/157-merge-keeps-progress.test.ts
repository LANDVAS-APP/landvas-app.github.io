// v0.9.3 merging never loses a place's progress: the most-progressed place is kept and the others fold into it,
// so upgrading to an Estate/Domain and switching back down finds everything where it was.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let u: string;
const O = { gx: 3_000_000, gy: 1_900_000 };
let n = 0;
const groupAt = async (gx: number, gy: number) =>
  (await db.rpc(u, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === gx && c[1] === gy));

beforeAll(async () => {
  await db.init({ ungated: true });
  u = await db.newPlayer('keeps_progress');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(u, 200_000);
  for (const [x, y] of [[1, 0], [0, 1], [1, 1], [3, 0], [4, 0], [3, 1], [4, 1]])
    await db.rpc(u, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `keep-acq-${++n}-00000` });
});
afterAll(() => db.close());

describe('merging keeps progress', () => {
  it('a levelled arcade on a newer plot survives the merge, the Estate and switching back', async () => {
    const ids: string[] = [];
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const g = await groupAt(O.gx + x, O.gy + y);
      await db.rpc(u, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' });
      ids.push(g.id);
    }
    // the progress lives on the newest plot (not the one the merge keeps)
    await db.sql(`update arcades set xp = 5000, plays = 42, machines = '{"stacker": 4, "cyclone": 2, "pinball": 3}', decor_owned = decor_owned || '["neon:gold"]' where group_id = $1`, [ids[3]]);
    await db.sql(`update arcades set xp = 100, plays = 3, machines = '{"stacker": 5, "cyclone": 1}' where group_id = $1`, [ids[1]]);
    const m = await db.rpc(u, 'fuse_groups', { p_group_ids: ids });
    await db.rpc(u, 'set_group_kind', { p_group_id: m.id, p_kind: 'boardwalk' });
    const down = await db.rpc(u, 'set_group_kind', { p_group_id: m.id, p_kind: 'arcade' });
    const [a] = await db.sql(`select xp, plays, machines, decor_owned from arcades where id = $1`, [down.arcade_id]);
    expect(Number(a.xp)).toBe(5100);
    expect(Number(a.plays)).toBe(45);
    expect(a.machines).toEqual({ stacker: 5, cyclone: 2, pinball: 3 });
    expect(a.decor_owned).toContain('neon:gold');
    // exactly one arcade on the land, and nothing left to count twice
    expect((await db.sql(`select count(*)::int c from arcades where group_id = $1`, [m.id]))[0].c).toBe(1);
    expect(Number((await db.sql(`select coalesce(sum(xp), 0) s from arcades where owner_id = $1`, [u]))[0].s)).toBe(5100);
  });

  it('two Estates merged into one keep both Estates’ progress', async () => {
    const one = [[3, 0], [4, 0]], two = [[3, 1], [4, 1]];
    const make = async (cells: number[][]) => {
      const gs = [];
      for (const [x, y] of cells) { const g = await groupAt(O.gx + x, O.gy + y); await db.rpc(u, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' }); gs.push(g.id); }
      return (await db.rpc(u, 'fuse_groups', { p_group_ids: gs })).id;
    };
    const g1 = await make(one), g2 = await make(two);
    // each half gets its own Neon Boardwalk progress (as if each had been an Estate before)
    for (const [g, xp] of [[g1, 300], [g2, 900]] as const) {
      await db.sql(`insert into realms (owner_id, group_id, kind, xp, plays, producers) values ($1, $2, 'boardwalk', $3, 7, $4)`, [u, g, xp, JSON.stringify({ a: xp / 100 })]);
    }
    const m = await db.rpc(u, 'fuse_groups', { p_group_ids: [g1, g2] });
    const rows = await db.sql(`select xp, plays, producers from realms where group_id = $1 and kind = 'boardwalk'`, [m.id]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].xp)).toBe(1200);
    expect(Number(rows[0].plays)).toBe(14);
    expect(rows[0].producers).toEqual({ a: 9 });
  });

  it('folding again changes nothing', async () => {
    const before = await db.sql(`select id, group_id, xp from arcades where owner_id = $1 order by id`, [u]);
    const groups = await db.sql(`select id from canvas_groups where owner_id = $1 and status = 'active'`, [u]);
    for (const g of groups) {
      const from = (await db.sql(`select id from canvas_groups where merged_into = $1`, [g.id])).map((r: any) => r.id);
      await db.sql(`select private.place_carry($1, $2::uuid[])`, [g.id, from]);
    }
    expect(await db.sql(`select id, group_id, xp from arcades where owner_id = $1 order by id`, [u])).toEqual(before);
  });
});
