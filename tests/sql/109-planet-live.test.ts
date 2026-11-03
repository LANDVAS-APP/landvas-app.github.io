// v0.28 Live worlds: groups of at most 10 per world, filled fullest-first; you spawn next to someone.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const ids: string[] = [];
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);

beforeAll(async () => {
  await db.init({ ungated: true });
  for (let i = 0; i < 22; i++) ids.push(await db.newPlayer(`live_${i}`));
});
afterAll(() => db.close());

describe('Live worlds', () => {
  it('needs you landed there', async () => {
    await expectError(db.rpc(ids[0], 'planet_live', { p_world: 'moon' }), 'land_first');
  });

  it('the Moon is big now', async () => {
    await putOn(ids[0], 'moon');
    expect(await db.rpc(ids[0], 'planet_map', { p_world: 'moon' })).toMatchObject({ rows: 60, cols: 120 });
  });

  it('newcomers join the live group and spawn next to someone', async () => {
    const a = await db.rpc(ids[0], 'planet_live', { p_world: 'moon', p_d: [0, 0.2, 1], p_face: [0, 1, 0] });
    expect(a).toMatchObject({ shard: 0, joined: true, spawn: null, members: [] });
    await putOn(ids[1], 'moon');
    const b = await db.rpc(ids[1], 'planet_live', { p_world: 'moon' });
    expect(b).toMatchObject({ shard: 0, joined: true, channel: 'planet:moon:0' });
    expect(b.spawn.player).toBe(ids[0]);
    expect(b.spawn.d[2]).toBeCloseTo(1 / Math.hypot(0.2, 1));
    expect(b.members.map((m: any) => m.username)).toEqual(['live_0']);
    // a heartbeat keeps your group and moves you
    const a2 = await db.rpc(ids[0], 'planet_live', { p_world: 'moon', p_d: [1, 0, 0] });
    expect(a2).toMatchObject({ shard: 0, joined: false });
    expect(a2.members[0].username).toBe('live_1');
    expect((await db.rpc(ids[1], 'planet_live', { p_world: 'moon' })).members[0].d).toEqual([1, 0, 0]);
  });

  it('groups hold 10; 20 explorers make two groups of 10', async () => {
    for (let i = 2; i < 20; i++) { await putOn(ids[i], 'moon'); await db.rpc(ids[i], 'planet_live', { p_world: 'moon' }); }
    const rows = await db.sql(`select shard, count(*)::int n from planet_presence where world = 'moon' group by shard order by shard`);
    expect(rows).toEqual([{ shard: 0, n: 10 }, { shard: 1, n: 10 }]);
    const last = await db.rpc(ids[19], 'planet_live', { p_world: 'moon' });
    expect(last.members).toHaveLength(9);
    expect(last.on_world).toBe(20);
    await putOn(ids[20], 'moon');
    expect((await db.rpc(ids[20], 'planet_live', { p_world: 'moon' })).shard).toBe(2);
  });

  it('leaving (or going quiet) frees your place', async () => {
    await db.rpc(ids[3], 'planet_leave');
    await putOn(ids[21], 'moon');
    expect((await db.rpc(ids[21], 'planet_live', { p_world: 'moon' })).shard).toBe(0);
    await db.sql(`update planet_presence set seen_at = now() - interval '1 minute' where shard = 1`);
    expect((await db.rpc(ids[12], 'planet_live', { p_world: 'moon' }))).toMatchObject({ joined: true, shard: 2 });
  });
});
