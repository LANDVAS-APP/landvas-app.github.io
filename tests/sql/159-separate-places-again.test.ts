// v0.9.5 places are separate again. On data that went through the v0.9.4 join, every place goes back to its own
// plot with its own cabinets and decor, and no place ends up below the level it had.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TestDb } from '../helpers/db';

const JOIN = '20261119000121_one_place_per_type.sql', SPLIT = '20261119000122_separate_places_again.sql';
const run = (f: string) => db.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', f), 'utf8'));
const db = new TestDb();
let u: string;
const O = { gx: 3_300_000, gy: 2_200_000 };
let n = 0;
const groupAt = async (x: number) => (await db.rpc(u, 'my_groups')).find((g: any) => g.cells.some((c: number[]) => c[0] === O.gx + x && c[1] === O.gy));
const ids: Record<string, string> = {};

beforeAll(async () => {
  await db.init({ ungated: true, skip: [JOIN, SPLIT] });
  u = await db.newPlayer('split_again');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(u, 300_000);
  for (const x of [2, 4, 6, 8, 10]) await db.rpc(u, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy, p_idempotency_key: `split-acq-${++n}-00000` });
  // the old world: two arcades, a mine that's waiting on land that's a farm now, two sanctuaries
  const kind = async (x: number, k: string) => db.rpc(u, 'set_group_kind', { p_group_id: (await groupAt(x)).id, p_kind: k });
  ids.a1 = (await kind(0, 'arcade')).arcade_id;
  ids.a2 = (await kind(2, 'arcade')).arcade_id;
  await db.sql(`update arcades set xp = 800, plays = 4, machines = '{"stacker": 5}', decor_owned = decor_owned || '["neon:gold"]' where id = $1`, [ids.a1]);
  await db.sql(`update arcades set xp = 3000, plays = 9, machines = '{"stacker": 2, "cyclone": 3}' where id = $1`, [ids.a2]);
  ids.m1 = (await kind(4, 'mine')).realm_id;
  ids.m2 = (await kind(6, 'mine')).realm_id;
  await db.sql(`update realms set xp = 500, producers = '{"drill": 4}' where id = $1`, [ids.m1]);
  await db.sql(`update realms set xp = 50 where id = $1`, [ids.m2]);
  await kind(6, 'farm'); // m2 now waits on farm land
  ids.h1 = (await kind(8, 'habitat')).habitat_id;
  ids.h2 = (await kind(10, 'habitat')).habitat_id;
  await db.sql(`update habitats set layout = '[{"k": "pond"}]' where id = $1`, [ids.h1]);
  await run(JOIN);
});
afterAll(() => db.close());

describe('separate places again', () => {
  it('the join really joined them (the state we start from)', async () => {
    expect((await groupAt(0)).arcade_id).toBe((await groupAt(2)).arcade_id);
  });

  it('every place goes back to its own plot, at no lower level', async () => {
    await run(SPLIT);
    const g0 = await groupAt(0), g2 = await groupAt(2);
    expect(g0.arcade_id).toBe(ids.a1);
    expect(g2.arcade_id).toBe(ids.a2);
    const [a1] = await db.sql(`select xp, machines, decor_owned from arcades where id = $1`, [ids.a1]);
    const [a2] = await db.sql(`select xp, machines from arcades where id = $1`, [ids.a2]);
    expect(a1.machines).toEqual({ stacker: 5 });        // its own cabinets
    expect(a1.decor_owned).toContain('neon:gold');      // its own decor
    expect(Number(a1.xp)).toBeGreaterThanOrEqual(800);  // the join zeroed it; it gets the joined level back
    expect(Number(a2.xp)).toBe(3000);
    expect(a2.machines).toEqual({ stacker: 5, cyclone: 3 }); // the joined place kept the best of both
    // the mine: m1 on its plot, and m2 waiting again on its (now farm) land
    expect((await groupAt(4)).realm_id).toBe(ids.m1);
    expect((await db.sql(`select group_id from realms where id = $1`, [ids.m2]))[0].group_id).toBe((await groupAt(6)).id);
    // the sanctuaries
    expect((await groupAt(8)).habitat_id).toBe(ids.h1);
    expect((await groupAt(10)).habitat_id).toBe(ids.h2);
    expect((await db.sql(`select layout from habitats where id = $1`, [ids.h1]))[0].layout).toEqual([{ k: 'pond' }]);
  });

  it('places are separate from now on', async () => {
    await db.rpc(u, 'acquire_plot', { p_gx: O.gx + 12, p_gy: O.gy, p_idempotency_key: `split-acq-${++n}-00000` });
    const a3 = (await db.rpc(u, 'set_group_kind', { p_group_id: (await groupAt(12)).id, p_kind: 'arcade' })).arcade_id;
    expect(a3).toBeTruthy();
    expect([ids.a1, ids.a2]).not.toContain(a3);
    expect(Number((await db.sql(`select xp from arcades where id = $1`, [a3]))[0].xp)).toBe(0);
    // switching the mine plot back brings m2 back as it was
    const back = await db.rpc(u, 'set_group_kind', { p_group_id: (await groupAt(6)).id, p_kind: 'mine' });
    expect(back.realm_id).toBe(ids.m2);
  });

  it('running it again changes nothing', async () => {
    const before = await db.sql(`select id, group_id, xp from arcades order by id`);
    await db.sql(`select private.place_split($1, 'arcade')`, [u]);
    expect(await db.sql(`select id, group_id, xp from arcades order by id`)).toEqual(before);
  });
});
