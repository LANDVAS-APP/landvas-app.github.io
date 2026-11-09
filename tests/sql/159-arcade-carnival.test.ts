// v0.9.4 the Arcade Estate is the same arcade, bigger: a carnival outside with booth games, treats, a fortune teller,
// rides and fireworks. The Estates' stand games are gone.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let cal: string, arc: string, gid: string;
const O = { gx: 3_100_000, gy: 2_000_000 };
let n = 0;
const me = async () => (await db.sql(`select * from arcade_players where player_id = $1`, [cal]))[0];

beforeAll(async () => {
  await db.init({ ungated: true });
  cal = await db.newPlayer('cal_carnival');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [cal]);
  await db.rpc(cal, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(cal, 100_000);
  for (const [x, y] of [[1, 0], [0, 1], [1, 1]]) await db.rpc(cal, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `carn-acq-${++n}-00000` });
  const merged = await db.rpc(cal, 'fuse_groups', { p_group_ids: (await db.rpc(cal, 'my_groups')).map((g: any) => g.id) });
  gid = merged.id;
  arc = (await db.rpc(cal, 'set_group_kind', { p_group_id: gid, p_kind: 'arcade' })).arcade_id;
});
afterAll(() => db.close());

describe('the arcade carnival', () => {
  it('a plain arcade has no carnival; the Estate is the same arcade with one', async () => {
    await db.sql(`update arcades set xp = 5000 where id = $1`, [arc]);
    expect((await db.rpc(cal, 'arcade_get', { p_id: arc })).carnival).toBeNull();
    await expectError(db.rpc(cal, 'carnival_start', { p_arcade: arc, p_game: 'ducks' }), 'no_carnival');
    await db.rpc(cal, 'set_group_kind', { p_group_id: gid, p_kind: 'boardwalk' });
    const v = await db.rpc(cal, 'arcade_get', { p_id: arc });
    expect(v.carnival).toBeTruthy();
    expect(Object.keys(v.carnival.games)).toHaveLength(6);
    expect(Number((await db.sql(`select xp from arcades where id = $1`, [arc]))[0].xp)).toBe(5000);
    expect((await db.sql(`select a.id from arcades a where a.group_id = $1`, [gid]))[0].id).toBe(arc);
    expect(await db.rpc(cal, 'arcade_for_group', { p_group: gid })).toBe(arc);
    expect((await db.rpc(cal, 'arcade_for_plot', { p_gx: O.gx, p_gy: O.gy })).arcade_id).toBe(arc);
  });

  it('booth games pay tickets through the usual arcade finish', async () => {
    const t0 = Number((await me()).tickets);
    const s = await db.rpc(cal, 'carnival_start', { p_arcade: arc, p_game: 'ducks' });
    await db.sql(`update arcade_plays set started_at = now() - interval '40 seconds' where id = $1`, [s.session]);
    const f = await db.rpc(cal, 'arcade_finish', { p_session: s.session, p_score: 300 });
    expect(f.score).toBe(300);
    expect(f.tickets).toBeGreaterThan(0);
    expect(Number((await me()).tickets)).toBe(t0 + f.tickets);
    const s2 = await db.rpc(cal, 'carnival_start', { p_arcade: arc, p_game: 'darts' });
    await db.sql(`update arcade_plays set started_at = now() - interval '40 seconds' where id = $1`, [s2.session]);
    expect((await db.rpc(cal, 'arcade_finish', { p_session: s2.session, p_score: 99999 })).score).toBeLessThanOrEqual(600);
  });

  it('a treat costs tickets and adds tickets at the booths', async () => {
    await db.sql(`update arcade_players set tickets = 1000 where player_id = $1`, [cal]);
    const before = await db.sql(`select private.carnival_mult($1, 'crabs') m`, [cal]);
    await db.rpc(cal, 'carnival_treat', { p_arcade: arc, p_treat: 'popcorn' });
    expect(Number((await me()).tickets)).toBe(910);
    const after = await db.sql(`select private.carnival_mult($1, 'crabs') m`, [cal]);
    expect(Number(after[0].m)).toBeGreaterThan(Number(before[0].m));
    await db.sql(`update arcade_players set tickets = 5 where player_id = $1`, [cal]);
    await expectError(db.rpc(cal, 'carnival_treat', { p_arcade: arc, p_treat: 'apple' }), 'not_enough_tickets');
  });

  it('the fortune teller reads once a day; rides pay the first go each day', async () => {
    const f = await db.rpc(cal, 'carnival_fortune', { p_arcade: arc });
    expect(f.fortune.tickets).toBeGreaterThanOrEqual(20);
    await expectError(db.rpc(cal, 'carnival_fortune', { p_arcade: arc }), 'fortune_told');
    const r1 = await db.rpc(cal, 'carnival_ride', { p_arcade: arc, p_ride: 'wheel' });
    expect(r1.tickets).toBe(25);
    expect((await db.rpc(cal, 'carnival_ride', { p_arcade: arc, p_ride: 'wheel' })).tickets).toBe(0);
    expect(r1.carnival.rides_today).toContain('wheel');
  });

  it('fireworks cost tickets and give the arcade XP', async () => {
    await db.sql(`update arcade_players set tickets = 500 where player_id = $1`, [cal]);
    const xp0 = Number((await db.sql(`select xp from arcades where id = $1`, [arc]))[0].xp);
    await db.rpc(cal, 'carnival_fireworks', { p_arcade: arc });
    expect(Number((await me()).tickets)).toBe(350);
    expect(Number((await db.sql(`select xp from arcades where id = $1`, [arc]))[0].xp)).toBe(xp0 + 60);
  });

  it('the Estates have no stand games any more', async () => {
    const rows = await db.sql(`select k, v -> 'games' g from game_config, jsonb_each(value -> 'kinds') e(k, v) where key = 'realms' and v ->> 'tier' = 'estate'`);
    for (const r of rows) expect(Object.keys(r.g)).toHaveLength(1);
  });
});
