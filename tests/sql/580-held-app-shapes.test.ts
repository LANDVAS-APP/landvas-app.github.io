// Answers that app versions already in players' (and store reviewers') hands read. An app under store review runs the
// code inside it while the server keeps changing: a key it reads has to stay in the answer, even when it's always
// empty (app 1.0.0 iterates `walkers` and `coils` on the World map; without them it crashed, and Google Play rejected it).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ana: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  ana = await db.newPlayer('held_ana');
});
afterAll(() => db.close());

describe('enchant_map2 (the World map’s live layer)', () => {
  const box = { p_min_gx: 793000, p_min_gy: 1576000, p_max_gx: 794000, p_max_gy: 1577000 };
  it('always has the lists app 1.0.0 walks through: walkers, coils, storms', async () => {
    for (const uid of [ana, null]) {
      const r = await db.rpc(uid, 'enchant_map2', box);
      for (const k of ['walkers', 'coils', 'storms']) expect(Array.isArray(r[k]), `${k} for ${uid ? 'a player' : 'nobody'}`).toBe(true);
      expect(typeof r.server_now).toBe('number');
    }
  });
  it('the same when the box is too big to look at (the early answer)', async () => {
    const r = await db.rpc(ana, 'enchant_map2', { p_min_gx: 0, p_min_gy: 0, p_max_gx: 4000000, p_max_gy: 4000000 });
    expect(r.walkers).toEqual([]);
    expect(r.coils).toEqual([]);
    expect(Array.isArray(r.storms)).toBe(true);
  });
});
