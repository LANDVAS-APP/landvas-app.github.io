// Live arcades: rooms of 10, walking together, and Versus / Team matches on any cabinet. Profiles: one place each.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, b: string, c: string, arcId: string;
const A = { gx: 3_320_000, gy: 2_020_000 };
const live = (u: string, x = 0, z = 5) => db.rpc(u, 'arcade_live', { p_arcade: arcId, p_x: x, p_z: z });
const finish = async (u: string, session: string, score: number) => {
  await db.sql(`update arcade_plays set started_at = now() - interval '2 minutes' where id = $1`, [session]);
  return db.rpc(u, 'arcade_finish', { p_session: session, p_score: score });
};

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('live_owner'); b = await db.newPlayer('live_bee'); c = await db.newPlayer('live_cee');
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const g = (await db.rpc(ow, 'my_groups'))[0];
  arcId = (await db.rpc(ow, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' })).arcade_id;
});
afterAll(() => db.close());

describe('Live arcades', () => {
  it('visitors share a room and see each other walking', async () => {
    const r1 = await live(ow, 1, 2);
    expect(r1).toMatchObject({ joined: true, room_size: 10, members: [], channel: expect.stringContaining(arcId) });
    const r2 = await live(b, -2, 4);
    expect(r2.shard).toBe(r1.shard);
    expect(r2.members.map((m: any) => m.id)).toEqual([ow]);
    expect(r2.members[0]).toMatchObject({ x: 1, z: 2 });
    expect(r2.in_arcade).toBe(2);
  });

  it('rooms hold ten; the eleventh visitor gets a new room', async () => {
    const extra: string[] = [];
    for (let i = 0; i < 9; i++) { const u = await db.newPlayer(`live_x${i}`); extra.push(u); await live(u); }
    const rooms = await db.sql(`select shard, count(*)::int n from arcade_presence where arcade_id = $1 group by shard order by shard`, [arcId]);
    expect(rooms[0].n).toBe(10);
    expect(rooms[1].n).toBe(1);
    await db.sql(`delete from arcade_presence where player_id = any($1)`, [extra]);
  });

  it('versus: same seed for everyone, the top score wins bonus tickets', async () => {
    await live(c, 0, 0);
    await expectError(db.rpc(ow, 'arcade_match_create', { p_arcade: arcId, p_game: 'nope', p_mode: 'versus' }), 'invalid_game');
    const m = await db.rpc(ow, 'arcade_match_create', { p_arcade: arcId, p_game: 'stacker', p_mode: 'versus' });
    expect(m).toMatchObject({ status: 'lobby', mode: 'versus', seed: null });
    expect((await live(b)).lobbies.map((x: any) => x.id)).toContain(m.id);
    await expectError(db.rpc(ow, 'arcade_match_start', { p_match: m.id }), 'need_players');
    await db.rpc(b, 'arcade_match_join', { p_match: m.id });
    await expectError(db.rpc(b, 'arcade_match_start', { p_match: m.id }), 'not_host');
    const s = await db.rpc(ow, 'arcade_match_start', { p_match: m.id });
    expect(s.status).toBe('playing');
    const mine = s.players.find((p: any) => p.id === ow);
    expect(mine.session).toBeTruthy();
    expect(s.players.find((p: any) => p.id === b).session).toBeNull(); // only your own session is shown to you
    const bm = (await live(b)).match;
    expect(bm).toMatchObject({ id: m.id, status: 'playing', seed: s.seed });
    const bSession = bm.players.find((p: any) => p.id === b).session;
    const seeds = await db.sql(`select distinct seed from arcade_plays where id = any($1)`, [[mine.session, bSession]]);
    expect(seeds.length).toBe(1);
    await finish(ow, mine.session, 50);
    expect((await db.rpc(ow, 'arcade_match_result', { p_match: m.id })).status).toBe('playing'); // waiting for b
    const before = Number((await db.sql(`select tickets from arcade_players where player_id = $1`, [b]))[0]?.tickets ?? 0);
    const fb = await finish(b, bSession, 80);
    const res = await db.rpc(b, 'arcade_match_result', { p_match: m.id });
    expect(res.status).toBe('done');
    const bRow = res.players.find((p: any) => p.id === b), oRow = res.players.find((p: any) => p.id === ow);
    expect(bRow).toMatchObject({ score: 80, finished: true });
    expect(bRow.bonus).toBeGreaterThanOrEqual(10);
    expect(oRow.bonus).toBe(0);
    const after = Number((await db.sql(`select tickets from arcade_players where player_id = $1`, [b]))[0].tickets);
    expect(after - before).toBe(fb.tickets + bRow.bonus);
    // settling again pays nothing more
    await db.rpc(b, 'arcade_match_result', { p_match: m.id });
    expect(Number((await db.sql(`select tickets from arcade_players where player_id = $1`, [b]))[0].tickets)).toBe(after);
  });

  it('team: scores add up toward a shared target; reach it and everyone gets the bonus', async () => {
    const m = await db.rpc(b, 'arcade_match_create', { p_arcade: arcId, p_game: 'stacker', p_mode: 'team' });
    await db.rpc(c, 'arcade_match_join', { p_match: m.id });
    await db.rpc(ow, 'arcade_match_join', { p_match: m.id });
    const t = (await live(b)).lobbies.find((x: any) => x.id === m.id).target;
    expect(t).toBe(80 * 3); // 160 points per Ink / 2, per player
    await db.rpc(ow, 'arcade_match_leave', { p_match: m.id });
    const s = await db.rpc(b, 'arcade_match_start', { p_match: m.id });
    expect(s.target).toBe(160);
    const sess = async (u: string) => (await live(u)).match.players.find((p: any) => p.id === u).session;
    await finish(b, await sess(b), 90);
    await finish(c, await sess(c), 80);
    const r = await db.rpc(c, 'arcade_match_result', { p_match: m.id });
    expect(r.status).toBe('done');
    expect(r.players.every((p: any) => p.bonus >= 10)).toBe(true);
  });

  it('you must be in the arcade (and its room) to join a match; leaving closes your lobby', async () => {
    const m = await db.rpc(ow, 'arcade_match_create', { p_arcade: arcId, p_game: 'cyclone', p_mode: 'versus' });
    await db.sql(`update arcade_presence set seen_at = now() - interval '1 minute' where player_id = $1`, [c]);
    await expectError(db.rpc(c, 'arcade_match_join', { p_match: m.id }), 'not_in_arcade');
    await db.rpc(ow, 'arcade_leave', {});
    expect((await db.sql(`select status from arcade_matches where id = $1`, [m.id]))[0].status).toBe('cancelled');
    await expectError(db.rpc(b, 'arcade_match_join', { p_match: m.id }), 'match_closed');
  });

  it('profiles show one place of each type, the most used', async () => {
    const un = (await db.sql(`select username from profiles where id = $1`, [ow]))[0].username;
    const pl = await db.rpc(b, 'player_places', { p_username: un });
    expect(pl.arcades.length).toBe(1);
    expect(pl.habitats.length).toBeLessThanOrEqual(1);
  });
});
