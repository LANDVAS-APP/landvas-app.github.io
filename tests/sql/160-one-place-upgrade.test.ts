// v0.9.4 the one-place migration on existing data: players with several arcades, farms and sanctuaries end up with one
// of each, on their biggest land, the highest-levelled kept, with crops and creatures moved in.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TestDb } from '../helpers/db';

const MIG = '20261119000121_one_place_per_type.sql';
const db = new TestDb();
let u: string;
const O = { gx: 3_200_000, gy: 2_100_000 };
let n = 0;
const groupAt = async (gx: number, gy: number) =>
  (await db.rpc(u, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === gx && c[1] === gy));

beforeAll(async () => {
  await db.init({ ungated: true, skip: [MIG] });
  u = await db.newPlayer('legacy_places');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(u, 300_000);
  for (const x of [2, 4, 6, 8, 10]) await db.rpc(u, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy, p_idempotency_key: `legacy-acq-${++n}-00000` });
  await db.rpc(u, 'acquire_plot', { p_gx: O.gx + 5, p_gy: O.gy, p_idempotency_key: `legacy-acq-${++n}-00000` });
});
afterAll(() => db.close());

describe('joining existing places', () => {
  it('several of each become one', async () => {
    // old world: two arcades, two farms (one with crops), two sanctuaries with creatures
    const g = async (x: number) => (await groupAt(O.gx + x, O.gy)).id;
    const a1 = (await db.rpc(u, 'set_group_kind', { p_group_id: await g(0), p_kind: 'arcade' })).arcade_id;
    const a2 = (await db.rpc(u, 'set_group_kind', { p_group_id: await g(2), p_kind: 'arcade' })).arcade_id;
    expect(a2).not.toBe(a1);
    await db.sql(`update arcades set xp = 800, machines = '{"stacker": 5}' where id = $1`, [a1]);
    await db.sql(`update arcades set xp = 3000, plays = 9, machines = '{"stacker": 2, "cyclone": 3}' where id = $1`, [a2]);
    const f1 = (await db.rpc(u, 'set_group_kind', { p_group_id: await g(4), p_kind: 'farm' })).farm_id;
    // the second farm is the bigger land (2 plots)
    const f2g = (await db.rpc(u, 'set_group_kind', { p_group_id: await g(6), p_kind: 'farm' })).id;
    const f5g = (await db.rpc(u, 'set_group_kind', { p_group_id: await g(5), p_kind: 'farm' })).id;
    const big = (await db.rpc(u, 'fuse_groups', { p_group_ids: [f5g, f2g] })).id;
    await db.sql(`update farms set harvests = 50 where id = $1`, [f1]);
    await db.sql(`insert into farm_beds (farm_id, idx, crop, ready_at) values ($1, 0, 'wheat', now() + interval '1 hour'), ($1, 1, 'corn', now() + interval '2 hours')`, [f1]);
    const h1 = (await db.rpc(u, 'set_group_kind', { p_group_id: await g(8), p_kind: 'habitat' })).habitat_id;
    const h2 = (await db.rpc(u, 'set_group_kind', { p_group_id: await g(10), p_kind: 'habitat' })).habitat_id;
    expect(h2).not.toBe(h1);
    for (const [h, k] of [[h1, 'c1'], [h2, 'c2'], [h2, 'c3']]) {
      await db.sql(`insert into inkborn (owner_id, client_key, name, source, genome, personality, habitat_id) select $1, 'legacy-' || $3::text, $3, 'random', '{}'::jsonb, 'playful', $2`, [u, h, k]).catch(async (e) => {
        throw new Error('inkborn insert: ' + e.message);
      });
    }

    await db.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', MIG), 'utf8'));

    // one arcade: the higher level one, best cabinets of both
    const arcs = await db.sql(`select id, xp, plays, machines from arcades where owner_id = $1 and group_id is not null`, [u]);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].id).toBe(a2);
    expect(Number(arcs[0].xp)).toBe(3000);
    expect(arcs[0].machines).toEqual({ stacker: 5, cyclone: 3 });
    expect((await db.rpc(u, 'arcade_for_plot', { p_gx: O.gx, p_gy: O.gy })).arcade_id).toBe(a2);
    // one farm on the biggest farm land, with the crops moved in
    const farms = await db.sql(`select id, group_id, harvests from farms where owner_id = $1 and group_id is not null`, [u]);
    expect(farms).toHaveLength(1);
    expect(farms[0].id).toBe(f1);
    expect(farms[0].group_id).toBe(big);
    expect((await db.sql(`select count(*)::int c from farm_beds where farm_id = $1`, [f1]))[0].c).toBe(2);
    // one sanctuary holding every creature
    const habs = await db.sql(`select id from habitats where owner_id = $1 and kind = 'plot' and group_id is not null`, [u]);
    expect(habs).toHaveLength(1);
    expect(habs[0].id).toBe(h2);
    expect((await db.sql(`select count(*)::int c from inkborn where owner_id = $1 and habitat_id = $2`, [u, h2]))[0].c).toBe(3);
  });
});
