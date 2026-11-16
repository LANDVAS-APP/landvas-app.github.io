// LAND GRAB live: an arena game for 2-4 players (ffa / 1v1 / 2v2 / co-op), but still a secret — only players who
// found the Founder's Code can open, see or join its lobbies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, ben: string, cat: string, dee: string;
const find = (u: string) => db.sql(`insert into arcade_secret_state (player_id, secret, found_at) values ($1, 'founder', now()) on conflict (player_id, secret) do update set found_at = now()`, [u]);
const room = (u: string) => db.rpc(u, 'arena_live', {});

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('lg_ann'); ben = await db.newPlayer('lg_ben'); cat = await db.newPlayer('lg_cat'); dee = await db.newPlayer('lg_dee');
  await find(ann); await find(ben); await find(dee);
  for (const u of [ann, ben, cat, dee]) await room(u);
});
afterAll(() => db.close());

describe('LAND GRAB live', () => {
  it('isn’t in game_config (it’s a secret)', async () => {
    expect(JSON.stringify(await db.sql(`select value from game_config where key = 'arcade'`))).not.toMatch(/landgrab|LAND GRAB/);
  });

  it('only a finder can open a lobby — in any of the four modes', async () => {
    await expectError(db.rpc(cat, 'arena_create', { p_game: 'landgrab', p_mode: 'ffa' }), 'invalid_game');
    for (const mode of ['duel', 'teams', 'coop']) {
      const m = await db.rpc(ann, 'arena_create', { p_game: 'landgrab', p_mode: mode });
      expect(m).toMatchObject({ game: 'landgrab', mode });
    }
  });

  it('its lobbies show only for finders, and only finders can join', async () => {
    const m = await db.rpc(ann, 'arena_create', { p_game: 'landgrab', p_mode: 'ffa' });
    expect((await room(ben)).lobbies.map((x: any) => x.id)).toContain(m.id);
    expect((await room(cat)).lobbies.map((x: any) => x.id)).not.toContain(m.id);
    await expectError(db.rpc(cat, 'arena_join', { p_match: m.id }), 'match_closed');
    const lfg = async (u: string) => (await db.rpc(u, 'lfg_list', {})).items.filter((i: any) => i.id === m.id);
    expect(await lfg(cat)).toHaveLength(0);
  });

  it('plays like any arena game: places pay tickets', async () => {
    const m = await db.rpc(ann, 'arena_create', { p_game: 'landgrab', p_mode: 'ffa' });
    await db.rpc(ben, 'arena_join', { p_match: m.id });
    await db.rpc(dee, 'arena_join', { p_match: m.id });
    const s = await db.rpc(ann, 'arena_start', { p_match: m.id });
    expect(s.status).toBe('playing');
    await db.sql(`update arena_matches set started_at = now() - interval '2 minutes' where id = $1`, [m.id]);
    const done = await db.rpc(ann, 'arena_report', { p_match: m.id, p_result: { places: { [ann]: 2, [ben]: 1, [dee]: 3 } } });
    expect(done.status).toBe('done');
    const t = await db.sql(`select player_id, tickets from arena_match_players where match_id = $1`, [m.id]);
    expect(t.every((r: any) => r.tickets > 0)).toBe(true);
  });

  it('co-op: maps cleared pay as waves', async () => {
    const m = await db.rpc(ann, 'arena_create', { p_game: 'landgrab', p_mode: 'coop' });
    await db.rpc(ben, 'arena_join', { p_match: m.id });
    await db.rpc(ann, 'arena_start', { p_match: m.id });
    await db.sql(`update arena_matches set started_at = now() - interval '3 minutes' where id = $1`, [m.id]);
    const done = await db.rpc(ann, 'arena_report', { p_match: m.id, p_result: { waves: 6 } });
    expect(done.status).toBe('done');
  });
});
