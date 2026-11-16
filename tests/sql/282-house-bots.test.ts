// House party games with bots: bots fill empty seats so a table can start short of people (or with just you); a person
// can take a bot's seat; bots count in the places, never in the party bonus, and a game with bots pays half the Ink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const P: string[] = [];
const ink = async (u: string) => Number((await db.rpc(u, 'my_state')).balances.ink);
const age = (g: string) => db.sql(`update home_games set started_at = now() - interval '1 minute' where id = $1`, [g]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  for (let i = 0; i < 3; i++) P.push(await db.newPlayer(`bots_p${i}`));
  for (let i = 0; i < 3; i++) {
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [P[i]]);
    await db.rpc(P[i], 'claim_starter_plot', { p_gx: 62000 + i * 50, p_gy: 42000 });
  }
  await db.sql(`insert into homes (player_id, legacy) select id, true from players on conflict (player_id) do update set legacy = true`);
  for (const u of P) await db.rpc(u, 'home_live', { p_host: P[0] });
});
afterAll(() => db.close());

describe('house party games with bots', () => {
  it('on your own: add a bot and play', async () => {
    const g = await db.rpc(P[0], 'home_game_create', { p_home: P[0], p_game: 'fourrow' });
    expect(g.bots).toBe(0);
    await expectError(db.rpc(P[0], 'home_game_start', { p_game: g.id }), 'need_players');
    // only the host sets the bots, and only into empty seats
    await expectError(db.rpc(P[1], 'home_game_bots', { p_game: g.id, p_n: 1 }), 'not_host');
    expect((await db.rpc(P[0], 'home_game_bots', { p_game: g.id, p_n: 5 })).bots).toBe(1);
    const s = await db.rpc(P[0], 'home_game_start', { p_game: g.id });
    expect(s).toMatchObject({ status: 'playing', bots: 1 });
    await age(g.id);
    const before = await ink(P[0]);
    // the bot came second (bots aren't in the places the server checks, but places can go up to people + bots)
    const done = await db.rpc(P[0], 'home_game_report', { p_game: g.id, p_places: { [P[0]]: 1 } });
    expect(done.status).toBe('done');
    const won = (await ink(P[0])) - before;
    const full = (await db.sql(`select (private.hg_cfg() -> 'place_ink' ->> 0)::int v`))[0].v;
    expect(won).toBe(Math.floor(full * 0.5));
  });

  it('places count the bots: you can come behind one', async () => {
    const g = await db.rpc(P[0], 'home_game_create', { p_home: P[0], p_game: 'rush' });
    await db.rpc(P[0], 'home_game_bots', { p_game: g.id, p_n: 3 });
    await db.rpc(P[0], 'home_game_start', { p_game: g.id });
    await age(g.id);
    const done = await db.rpc(P[0], 'home_game_report', { p_game: g.id, p_places: { [P[0]]: 3 } });
    expect(done.players[0].place).toBe(3);
    await expectError(db.rpc(P[0], 'home_game_report', { p_game: (await db.rpc(P[0], 'home_game_create', { p_home: P[0], p_game: 'rush' })).id, p_places: { [P[0]]: 5 } }), 'match_closed');
  });

  it('a person takes a bot’s seat at a full table', async () => {
    const g = await db.rpc(P[0], 'home_game_create', { p_home: P[0], p_game: 'dots' });
    expect((await db.rpc(P[0], 'home_game_bots', { p_game: g.id, p_n: 3 })).bots).toBe(3);
    const j = await db.rpc(P[1], 'home_game_join', { p_game: g.id });
    expect(j.players).toHaveLength(2);
    expect(j.bots).toBe(2);
    // and the bots never fill a seat that's taken
    expect((await db.rpc(P[0], 'home_game_bots', { p_game: g.id, p_n: 7 })).bots).toBe(2);
  });

  it('bots don’t add to the party bonus', async () => {
    const g = await db.rpc(P[0], 'home_game_create', { p_home: P[0], p_game: 'rush' });
    await db.rpc(P[0], 'home_game_bots', { p_game: g.id, p_n: 4 });
    await db.rpc(P[0], 'home_game_start', { p_game: g.id });
    await age(g.id);
    const done = await db.rpc(P[0], 'home_game_report', { p_game: g.id, p_places: { [P[0]]: 1 } });
    expect(done.result).toMatchObject({ players: 1, bots: 4, boost: 1 });
  });
});
