// House party games: tables in a home's live room, seats in join order, places paid in tickets (bigger party,
// bigger pay, capped per day); the record player's record saves with the home.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const P: string[] = [];
const tickets = async (u: string) => Number((await db.sql(`select tickets from arcade_players where player_id = $1`, [u]))[0]?.tickets ?? 0);
const age = (g: string) => db.sql(`update home_games set started_at = now() - interval '1 minute' where id = $1`, [g]);

beforeAll(async () => {
  await db.init({ ungated: true });
  for (let i = 0; i < 4; i++) P.push(await db.newPlayer(`party_p${i}`));
});
afterAll(() => db.close());

describe('House party games', () => {
  it('you have to be in the home to open or join a table', async () => {
    await expectError(db.rpc(P[1], 'home_game_create', { p_home: P[0], p_game: 'dots' }), 'not_in_home');
    for (const u of P) await db.rpc(u, 'home_live', { p_host: P[0] });
    await expectError(db.rpc(P[1], 'home_game_create', { p_home: P[0], p_game: 'chess960' }), 'invalid_game');
  });

  it('a table fills, starts in seat order and pays by place', async () => {
    const g = await db.rpc(P[1], 'home_game_create', { p_home: P[0], p_game: 'dots' });
    const live = await db.rpc(P[2], 'home_live', { p_host: P[0] });
    expect(live.tables.map((t: any) => t.id)).toContain(g.id);
    await expectError(db.rpc(P[1], 'home_game_start', { p_game: g.id }), 'need_players');
    for (const u of [P[2], P[3], P[0]]) await db.rpc(u, 'home_game_join', { p_game: g.id });
    await expectError(db.rpc(P[2], 'home_game_start', { p_game: g.id }), 'not_host');
    const s = await db.rpc(P[1], 'home_game_start', { p_game: g.id });
    expect(s.players.map((p: any) => [p.id, p.slot])).toEqual([[P[1], 0], [P[2], 1], [P[3], 2], [P[0], 3]]);
    expect((await db.rpc(P[3], 'home_live', { p_host: P[0] })).game.status).toBe('playing');
    await expectError(db.rpc(P[1], 'home_game_report', { p_game: g.id, p_places: { [P[1]]: 1 } }), 'game_too_fast');
    await age(g.id);
    await expectError(db.rpc(P[1], 'home_game_report', { p_game: g.id, p_places: { [P[1]]: 1 } }), 'invalid_result');
    const t = await Promise.all(P.map(tickets));
    const r = await db.rpc(P[1], 'home_game_report', { p_game: g.id, p_places: { [P[1]]: 2, [P[2]]: 1, [P[3]]: 3, [P[0]]: 4 } });
    expect(r.status).toBe('done');
    // party of 4: x1.3
    expect((await tickets(P[2])) - t[2]).toBe(Math.floor(15 * 1.3));
    expect((await tickets(P[1])) - t[1]).toBe(Math.floor(9 * 1.3));
    expect((await tickets(P[0])) - t[0]).toBe(Math.floor(4 * 1.3));
    await db.rpc(P[1], 'home_game_report', { p_game: g.id, p_places: { [P[1]]: 1, [P[2]]: 2, [P[3]]: 3, [P[0]]: 4 } });
    expect((await tickets(P[2])) - t[2]).toBe(19);
  });

  it('two-player games take two', async () => {
    const g = await db.rpc(P[0], 'home_game_create', { p_home: P[0], p_game: 'fourrow' });
    await db.rpc(P[1], 'home_game_join', { p_game: g.id });
    await expectError(db.rpc(P[2], 'home_game_join', { p_game: g.id }), 'match_full');
    await db.rpc(P[0], 'home_game_leave', { p_game: g.id });
    await expectError(db.rpc(P[1], 'home_game_start', { p_game: g.id }), 'match_closed');
  });

  it('home game tickets stop at the daily cap', async () => {
    await db.sql(`insert into home_game_days (player_id, day, tickets) values ($1, private.day_start(now()), 115) on conflict (player_id, day) do update set tickets = 115`, [P[3]]);
    const g = await db.rpc(P[3], 'home_game_create', { p_home: P[0], p_game: 'rush' });
    await db.rpc(P[2], 'home_game_join', { p_game: g.id });
    await db.rpc(P[3], 'home_game_start', { p_game: g.id });
    await age(g.id);
    const t0 = await tickets(P[3]);
    await db.rpc(P[3], 'home_game_report', { p_game: g.id, p_places: { [P[3]]: 1, [P[2]]: 2 } });
    expect((await tickets(P[3])) - t0).toBe(5);
  });

  it('the record player saves its record with the home', async () => {
    const h = await db.rpc(P[0], 'home_save', { p_name: null, p_style: { music: 'jazz' }, p_layout: [{ i: 'game_table', x: 0, z: 0, r: 0 }] });
    expect(h.style.music).toBe('jazz');
    await expectError(db.rpc(P[0], 'home_save', { p_name: null, p_style: { music: '<script>' }, p_layout: [] }), 'invalid_style');
  });
});
