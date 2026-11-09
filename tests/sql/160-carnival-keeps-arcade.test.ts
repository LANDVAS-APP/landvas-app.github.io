// The Arcade Carnival is the same arcade: a one-plot arcade with progress, merged up to a 2x2 and upgraded, keeps its
// level, cabinets, decor and shelf — and switching back and forth never resets it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let cal: string;
const O = { gx: 3_200_000, gy: 2_100_000 };
let n = 0;
beforeAll(async () => {
  await db.init({ ungated: true });
  cal = await db.newPlayer('cal_keeps');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [cal]);
  await db.rpc(cal, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(cal, 100_000);
});
afterAll(() => db.close());

describe('upgrading an arcade to its carnival', () => {
  it('keeps everything', async () => {
    const g0 = (await db.rpc(cal, 'my_groups'))[0];
    const arc = (await db.rpc(cal, 'set_group_kind', { p_group_id: g0.id, p_kind: 'arcade' })).arcade_id;
    await db.sql(`update arcades set xp = 4321, plays = 77, machines = machines || '{"claw": 2}'::jsonb where id = $1`, [arc]);
    const before = await db.rpc(cal, 'arcade_get', { p_id: arc });
    for (const [x, y] of [[1, 0], [0, 1], [1, 1]]) await db.rpc(cal, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `keep-acq-${++n}-00000` });
    for (const g of await db.rpc(cal, 'my_groups')) if (g.kind !== 'arcade') await db.rpc(cal, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' });
    const merged = await db.rpc(cal, 'fuse_groups', { p_group_ids: (await db.rpc(cal, 'my_groups')).map((g: any) => g.id) });
    if (merged.kind !== 'arcade') await db.rpc(cal, 'set_group_kind', { p_group_id: merged.id, p_kind: 'arcade' });
    const up = await db.rpc(cal, 'set_group_kind', { p_group_id: merged.id, p_kind: 'boardwalk' });
    expect(up.arcade_id).toBe(arc);
    const after = await db.rpc(cal, 'arcade_get', { p_id: arc });
    expect(after.level).toEqual(before.level);
    expect(after.plays).toBe(77);
    expect(after.machines.claw).toBe(2);
    expect(after.carnival).toBeTruthy();
    // and back down and up again
    await db.rpc(cal, 'set_group_kind', { p_group_id: merged.id, p_kind: 'arcade' });
    expect((await db.rpc(cal, 'set_group_kind', { p_group_id: merged.id, p_kind: 'boardwalk' })).arcade_id).toBe(arc);
    expect((await db.rpc(cal, 'arcade_get', { p_id: arc })).level).toEqual(before.level);
  });
});
