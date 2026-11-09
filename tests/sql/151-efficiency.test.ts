// v0.7.5 Efficiency fixes from the main server's load report: the daily sketch no longer sorts finished drawings,
// check-ins don't touch their room index, and stale presence / old one-off rows are tidied.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
const strokes = (n = 4) => Array.from({ length: n }, (_, k) => ({ c: (k % 5) + 1, w: 12, p: [100 + k * 50, 200, k * 100, 300 + k * 40, 500, k * 100 + 60] }));
const artists: string[] = [];
let viewer: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  for (let i = 0; i < 5; i++) artists.push(await db.newPlayer(`eff_art_${i}`));
  viewer = await db.newPlayer('eff_viewer');
  await db.sql(`update players set created_at = now() - interval '5 days'`);
});
afterAll(() => db.close());

describe('Efficiency', () => {
  it("today's sketches come back complete, in the viewer's own shuffled order", async () => {
    for (const a of artists) { await db.rpc(a, 'sketch_start'); await db.rpc(a, 'sketch_submit', { p_strokes: strokes() }); }
    const t = await db.rpc(viewer, 'sketch_today');
    expect(t.entries).toHaveLength(5);
    expect(t.entries.every((e: any) => Array.isArray(e.strokes) && e.strokes.length === 4)).toBe(true);
    const want = (await db.sql(`select id from sketches where day = private.day_start(now()) and submitted_at is not null order by md5(id::text || $1)`, [viewer])).map((r: any) => r.id);
    expect(t.entries.map((e: any) => e.id)).toEqual(want);
    // and again: the same order (it's settled per viewer)
    expect((await db.rpc(viewer, 'sketch_today')).entries.map((e: any) => e.id)).toEqual(want);
  });

  it('check-in indexes no longer hold the last-seen time', async () => {
    const defs = (await db.sql(`select indexdef from pg_indexes where tablename in ('planet_presence','arcade_presence','arena_presence','home_presence')`)).map((r: any) => r.indexdef as string);
    expect(defs.some((d) => d.includes('seen_at'))).toBe(false);
    expect((await db.sql(`select count(*)::int n from pg_indexes where indexname = 'minigame_sessions_bests_idx'`))[0].n).toBe(1);
  });

  it('tidying clears stale presence and old one-off rows, and nothing current', async () => {
    const [a, b] = artists;
    await db.sql(`insert into arena_presence (player_id, shard, x, z, joined_at, seen_at) values ($1, 0, 0, 0, now(), now() - interval '2 hours'), ($2, 0, 0, 0, now(), now())`, [a, b]);
    await db.sql(`insert into private.client_errors (player_id, message, created_at) values ($1, 'old', now() - interval '40 days'), ($1, 'new', now())`, [a]);
    const r = (await db.sql(`select private.tidy(true) r`))[0].r;
    expect(r.arena_presence).toBe(1);
    expect(r.client_errors).toBe(1);
    expect((await db.sql(`select player_id from arena_presence`)).map((x: any) => x.player_id)).toEqual([b]);
    expect((await db.sql(`select message from private.client_errors`)).map((x: any) => x.message)).toEqual(['new']);
  });
});
