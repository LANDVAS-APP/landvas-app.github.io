// v0.7.4 Check-ins don't queue behind the whole room: only joining takes the room's lock, and room upkeep is
// skipped (not waited for) while another check-in is doing it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, type Conn } from '../helpers/db';

const db = new TestDb();
const ids: string[] = [];
let holder: Conn, caller: Conn;
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const settled = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p.then(() => 'done' as const), new Promise<'waiting'>((r) => setTimeout(() => r('waiting'), ms))]);
const hold = async (key: string) => { await holder.query('begin'); await holder.query(`select pg_advisory_xact_lock(hashtext($1))`, [key]); };
const release = () => holder.query('commit');

beforeAll(async () => {
  await db.init({ ungated: true });
  for (let i = 0; i < 3; i++) ids.push(await db.newPlayer(`lock_${i}`));
  holder = await db.connect();
  caller = await db.connect();
});
afterAll(() => db.close());

describe('Live check-ins and room locks', () => {
  it('a check-in from someone already in a group does not wait for the world lock', async () => {
    await putOn(ids[0], 'moon');
    expect(await db.rpc(ids[0], 'planet_live', { p_world: 'moon' })).toMatchObject({ joined: true, shard: 0 });
    await hold('planet-live:moon');
    try {
      const beat = db.rpc(ids[0], 'planet_live', { p_world: 'moon', p_d: [1, 0, 0] }, caller);
      expect(await settled(beat, 3000)).toBe('done');
      expect(await beat).toMatchObject({ joined: false, shard: 0 });
    } finally { await release(); }
  });

  it('joining still waits for the lock, so two arrivals cannot both take a last spot', async () => {
    await putOn(ids[1], 'moon');
    await hold('planet-live:moon');
    const join = db.rpc(ids[1], 'planet_live', { p_world: 'moon' }, caller);
    try { expect(await settled(join, 700)).toBe('waiting'); } finally { await release(); }
    expect(await join).toMatchObject({ joined: true, shard: 0 });
  });

  it('arena check-ins no longer share one lock for every arena', async () => {
    expect(await db.rpc(ids[2], 'arena_live', {})).toMatchObject({ joined: true });
    await hold('arena-live');
    try { expect(await settled(db.rpc(ids[2], 'arena_live', {}, caller), 3000)).toBe('done'); } finally { await release(); }
  });

  it('room upkeep is skipped, not waited for, while someone else is doing it', async () => {
    await db.sql(`insert into arena_matches (host_id, shard, game, mode, status, created_at)
                  select $1, 0, g, 'ffa', 'lobby', now() - interval '1 hour' from jsonb_object_keys(private.arena_cfg() -> 'games') g limit 1`, [ids[2]]);
    await hold('arena-tidy');
    try {
      expect(await settled(db.rpc(ids[2], 'arena_live', {}, caller), 3000)).toBe('done');
      expect((await db.sql(`select status from arena_matches`))[0].status).toBe('lobby');
    } finally { await release(); }
    await db.rpc(ids[2], 'arena_live', {});
    expect((await db.sql(`select status from arena_matches`))[0].status).toBe('cancelled');
  });

  it('members the phone already has come back as just their position', async () => {
    // ids[0] and ids[1] are both on the moon by now
    const full = await db.rpc(ids[1], 'planet_live', { p_world: 'moon' });
    const other = full.members.find((m: any) => m.id === ids[0]);
    expect(other).toMatchObject({ id: ids[0], username: 'lock_0' });
    const slim = await db.rpc(ids[1], 'planet_live', { p_world: 'moon', p_known: [ids[0]] });
    const m = slim.members.find((x: any) => x.id === ids[0]);
    expect(m).toMatchObject({ id: ids[0], known: true });
    expect(m.username).toBeUndefined();
    expect(m.d).toBeTruthy();
  });
});
