// House party games: tables in a home's live room, seats in join order, places paid in tickets (bigger party,
// bigger pay, capped per day); the record player's record saves with the home.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const P: string[] = [];
const ink = async (u: string) => Number((await db.rpc(u, 'my_state')).balances.ink);
// paid players: a day old, with land
const seasoned = async (u: string, gx: number) => { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.rpc(u, 'claim_starter_plot', { p_gx: gx, p_gy: 41000 }); };
const age = (g: string) => db.sql(`update home_games set started_at = now() - interval '1 minute' where id = $1`, [g]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  for (let i = 0; i < 4; i++) P.push(await db.newPlayer(`party_p${i}`));
  for (let i = 0; i < 3; i++) await seasoned(P[i], 61000 + i * 50);
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
    const t = await Promise.all(P.map(ink));
    const r = await db.rpc(P[1], 'home_game_report', { p_game: g.id, p_places: { [P[1]]: 2, [P[2]]: 1, [P[3]]: 3, [P[0]]: 4 } });
    expect(r.status).toBe('done');
    // party of 4: x1.3 Ink by place
    expect((await ink(P[2])) - t[2]).toBe(Math.floor(10 * 1.3));
    expect((await ink(P[1])) - t[1]).toBe(Math.floor(6 * 1.3));
    expect((await ink(P[0])) - t[0]).toBe(Math.floor(3 * 1.3));
    // a brand-new account with no land isn't paid (no farming with spare accounts)
    expect((await ink(P[3])) - t[3]).toBe(0);
    expect(r.players.find((p: any) => p.id === P[2]).ink).toBe(13);
    await db.rpc(P[1], 'home_game_report', { p_game: g.id, p_places: { [P[1]]: 1, [P[2]]: 2, [P[3]]: 3, [P[0]]: 4 } });
    expect((await ink(P[2])) - t[2]).toBe(13);
  });

  it('two-player games take two', async () => {
    const g = await db.rpc(P[0], 'home_game_create', { p_home: P[0], p_game: 'fourrow' });
    await db.rpc(P[1], 'home_game_join', { p_game: g.id });
    await expectError(db.rpc(P[2], 'home_game_join', { p_game: g.id }), 'match_full');
    await db.rpc(P[0], 'home_game_leave', { p_game: g.id });
    await expectError(db.rpc(P[1], 'home_game_start', { p_game: g.id }), 'match_closed');
  });

  it('house games stop paying at 100 Ink a day', async () => {
    await db.sql(`insert into home_game_days (player_id, day, ink) values ($1, private.day_start(now()), 95) on conflict (player_id, day) do update set ink = 95`, [P[2]]);
    const g = await db.rpc(P[2], 'home_game_create', { p_home: P[0], p_game: 'rush' });
    await db.rpc(P[1], 'home_game_join', { p_game: g.id });
    await db.rpc(P[2], 'home_game_start', { p_game: g.id });
    await age(g.id);
    const t0 = await ink(P[2]);
    await db.rpc(P[2], 'home_game_report', { p_game: g.id, p_places: { [P[2]]: 1, [P[1]]: 2 } });
    expect((await ink(P[2])) - t0).toBe(5);
    expect(Number((await db.sql(`select ink from home_game_days where player_id = $1`, [P[2]]))[0].ink)).toBe(100);
  });

  it('the record player saves its record with the home', async () => {
    const h = await db.rpc(P[0], 'home_save', { p_name: null, p_style: { music: 'jazz' }, p_layout: [{ i: 'game_table', x: 0, z: 0, r: 0 }] });
    expect(h.style.music).toBe('jazz');
    await expectError(db.rpc(P[0], 'home_save', { p_name: null, p_style: { music: '<script>' }, p_layout: [] }), 'invalid_style');
  });
});

describe('House chat', () => {
  it('everyone in the room can talk; outsiders can’t; filters apply', async () => {
    await db.sql(`insert into feature_flags (key, enabled) values ('global_chat', true) on conflict (key) do update set enabled = true`);
    for (const u of [P[0], P[1]]) await db.rpc(u, 'home_live', { p_host: P[0] });
    const m = await db.rpc(P[1], 'home_chat_send', { p_home: P[0], p_body: 'hello house 👋' });
    expect(m).toMatchObject({ body: 'hello house 👋', player: { id: P[1] } });
    const l = await db.rpc(P[0], 'home_chat_list', { p_home: P[0], p_after: 0 });
    expect(l.items.map((x: any) => x.body)).toContain('hello house 👋');
    await db.rpc(P[2], 'home_leave', {});
    await expectError(db.rpc(P[2], 'home_chat_send', { p_home: P[0], p_body: 'hi?' }), 'not_in_home');
    expect((await db.rpc(P[2], 'home_chat_list', { p_home: P[0], p_after: 0 })).items).toEqual([]);
  });
});
