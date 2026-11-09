// v0.9.3 every Estate is a hub of games: its signature game plus four stand games, each paying out like the first.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let eve: string, realm: string;
const O = { gx: 3_000_000, gy: 1_900_000 };
let n = 0;

beforeAll(async () => {
  await db.init({ ungated: true });
  eve = await db.newPlayer('eve_stands');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [eve]);
  await db.rpc(eve, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(eve, 100_000);
  for (const [x, y] of [[1, 0], [0, 1], [1, 1]]) await db.rpc(eve, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `stand-acq-${++n}-00000` });
  const groups = await db.rpc(eve, 'my_groups');
  const merged = await db.rpc(eve, 'fuse_groups', { p_group_ids: groups.map((g: any) => g.id) });
  await db.rpc(eve, 'set_group_kind', { p_group_id: merged.id, p_kind: 'arcade' });
  realm = (await db.rpc(eve, 'set_group_kind', { p_group_id: merged.id, p_kind: 'boardwalk' })).realm_id;
});
afterAll(() => db.close());

describe('Estate stand games', () => {
  it('every Estate has its signature game plus four stand games, in order 0–4, with unique ids', async () => {
    const rows = await db.sql(`select k, v -> 'games' as g from game_config, jsonb_each(value -> 'kinds') as e(k, v) where key = 'realms' and v ->> 'tier' = 'estate'`);
    expect(rows).toHaveLength(11);
    const all: string[] = [];
    for (const { g } of rows) {
      const ids = Object.keys(g);
      expect(ids).toHaveLength(5);
      expect(ids.map((i) => g[i].order ?? 0).sort()).toEqual([0, 1, 2, 3, 4]);
      for (const i of ids) { expect(g[i].drops.length).toBeGreaterThan(0); expect(g[i].name).toBeTruthy(); expect(g[i].emoji).toBeTruthy(); }
      all.push(...ids);
    }
    expect(new Set(all).size).toBe(55);
    // the app has a game for every one of them
    const src = fs.readFileSync('src/realms/estates/games.ts', 'utf8');
    for (const id of all) expect(src).toMatch(new RegExp(`\\b${id}: `));
  });

  it('a stand game pays out the Estate’s own resources', async () => {
    const s = await db.rpc(eve, 'realm_start', { p_id: realm, p_game: 'whack' });
    await db.sql(`update realm_runs set started_at = now() - interval '45 seconds' where id = $1`, [s.session]);
    const f = await db.rpc(eve, 'realm_finish', { p_session: s.session, p_score: 600 });
    expect(f.score).toBe(600);
    expect(Object.values(f.loot).reduce((a: number, b: any) => a + Number(b), 0)).toBeGreaterThan(0);
  });

  it('later stands open as the place levels up', async () => {
    await expectError(db.rpc(eve, 'realm_start', { p_id: realm, p_game: 'darts' }), 'level_too_low');
    await db.sql(`update realms set xp = 1000000 where id = $1`, [realm]);
    expect((await db.rpc(eve, 'realm_start', { p_id: realm, p_game: 'darts' })).session).toBeTruthy();
  });

  it('a score is still capped by the game’s own limits', async () => {
    const s = await db.rpc(eve, 'realm_start', { p_id: realm, p_game: 'striker' });
    await db.sql(`update realm_runs set started_at = now() - interval '20 seconds' where id = $1`, [s.session]);
    const f = await db.rpc(eve, 'realm_finish', { p_session: s.session, p_score: 99999 });
    expect(f.score).toBeLessThanOrEqual(1200);
  });
});
