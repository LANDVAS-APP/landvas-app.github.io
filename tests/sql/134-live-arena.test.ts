// The Live Arena: one lobby for everyone (rooms of 10 from any arcade), live games in 1v1, 2v2, free-for-all and
// co-op, paid by place with a squad boost and a daily Ink cap.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const P: string[] = [];
const tickets = async (u: string) => Number((await db.sql(`select tickets from arcade_players where player_id = $1`, [u]))[0]?.tickets ?? 0);
const inkDay = async (u: string) => Number((await db.sql(`select coalesce(sum(ink), 0) s from arena_ink_days where player_id = $1`, [u]))[0].s);
const age = (m: string) => db.sql(`update arena_matches set started_at = now() - interval '1 minute' where id = $1`, [m]);

beforeAll(async () => {
  await db.init({ ungated: true });
  for (let i = 0; i < 5; i++) P.push(await db.newPlayer(`arena_p${i}`));
});
afterAll(() => db.close());

describe('Live Arena', () => {
  it('everyone shares rooms of ten, whatever arcade they came from', async () => {
    const r0 = await db.rpc(P[0], 'arena_live', { p_x: 0, p_z: 5 });
    const r1 = await db.rpc(P[1], 'arena_live', { p_x: 1, p_z: 4 });
    expect(r1.shard).toBe(r0.shard);
    expect(r1.members.map((m: any) => m.id)).toEqual([P[0]]);
    expect(r1).toMatchObject({ room_size: 10, channel: `arena:${r0.shard}` });
    for (const u of P.slice(2)) await db.rpc(u, 'arena_live', {});
  });

  it('1v1: only two can join; the winner gets the most, and both get a little Ink', async () => {
    await expectError(db.rpc(P[0], 'arena_create', { p_game: 'meteor', p_mode: 'duel' }), 'invalid_game');
    const m = await db.rpc(P[0], 'arena_create', { p_game: 'bumper', p_mode: 'duel' });
    await db.rpc(P[1], 'arena_join', { p_match: m.id });
    await expectError(db.rpc(P[2], 'arena_join', { p_match: m.id }), 'match_full');
    const s = await db.rpc(P[0], 'arena_start', { p_match: m.id });
    expect(s.players.map((p: any) => p.slot)).toEqual([0, 1]);
    await expectError(db.rpc(P[0], 'arena_report', { p_match: m.id, p_result: { places: { [P[0]]: 1, [P[1]]: 2 } } }), 'game_too_fast');
    await age(m.id);
    await expectError(db.rpc(P[1], 'arena_report', { p_match: m.id, p_result: { places: { [P[0]]: 2, [P[1]]: 1 } } }), 'not_host');
    await expectError(db.rpc(P[0], 'arena_report', { p_match: m.id, p_result: { places: { [P[0]]: 1 } } }), 'invalid_result');
    const t0 = await tickets(P[0]), t1 = await tickets(P[1]);
    const r = await db.rpc(P[0], 'arena_report', { p_match: m.id, p_result: { places: { [P[0]]: 2, [P[1]]: 1 } } });
    expect(r.status).toBe('done');
    // 2 players: squad boost x1.05
    expect((await tickets(P[1])) - t1).toBe(Math.floor(40 * 1.05));
    expect((await tickets(P[0])) - t0).toBe(Math.floor(25 * 1.05));
    expect(await inkDay(P[1])).toBeCloseTo(1.05, 2);
    expect(await inkDay(P[0])).toBeCloseTo(0.525, 2);
    // reporting again changes nothing
    await db.rpc(P[0], 'arena_report', { p_match: m.id, p_result: { places: { [P[0]]: 1, [P[1]]: 2 } } });
    expect((await tickets(P[1])) - t1).toBe(42);
  });

  it('2v2 needs exactly four, teams alternate, the bigger squad pays more', async () => {
    const m = await db.rpc(P[1], 'arena_create', { p_game: 'volley', p_mode: 'teams' });
    for (const u of [P[2], P[3]]) await db.rpc(u, 'arena_join', { p_match: m.id });
    await expectError(db.rpc(P[1], 'arena_start', { p_match: m.id }), 'need_players');
    await db.rpc(P[4], 'arena_join', { p_match: m.id });
    const s = await db.rpc(P[1], 'arena_start', { p_match: m.id });
    expect(s.players.map((p: any) => p.team)).toEqual([0, 1, 0, 1]);
    await age(m.id);
    const before = await tickets(P[2]);
    const r = await db.rpc(P[1], 'arena_report', { p_match: m.id, p_result: { winner: 1 } });
    // joined P1, P2, P3, P4 -> teams 0, 1, 0, 1: P2 and P4 win
    const win = r.players.find((p: any) => p.id === P[2]), lose = r.players.find((p: any) => p.id === P[3]);
    expect(win.tickets).toBe(Math.floor(40 * 1.15)); // 4 players: x1.15
    expect(lose.tickets).toBe(Math.floor(20 * 1.15));
    expect((await tickets(P[2])) - before).toBe(win.tickets);
  });

  it('co-op pays by waves (no more than the time allows), and arena Ink stops at the daily cap', async () => {
    const m = await db.rpc(P[2], 'arena_create', { p_game: 'meteor', p_mode: 'coop' });
    await db.rpc(P[4], 'arena_join', { p_match: m.id });
    await db.rpc(P[2], 'arena_start', { p_match: m.id });
    await age(m.id);
    const r = await db.rpc(P[2], 'arena_report', { p_match: m.id, p_result: { waves: 99 } });
    expect(r.result.waves).toBe(10); // a minute of play: at most 10 waves
    expect(r.players[0].tickets).toBe(Math.floor(Math.min(140, 10 + 8 * 10) * 1.05));
    await db.sql(`update arena_ink_days set ink = 19.9 where player_id = $1`, [P[4]]);
    const m2 = await db.rpc(P[2], 'arena_create', { p_game: 'trails', p_mode: 'ffa' });
    await db.rpc(P[4], 'arena_join', { p_match: m2.id });
    await db.rpc(P[2], 'arena_start', { p_match: m2.id });
    await age(m2.id);
    await db.rpc(P[2], 'arena_report', { p_match: m2.id, p_result: { places: { [P[2]]: 2, [P[4]]: 1 } } });
    expect(await inkDay(P[4])).toBeCloseTo(20, 3);
  });
});
