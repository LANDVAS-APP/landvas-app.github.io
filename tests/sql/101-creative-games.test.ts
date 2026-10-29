// v0.18: Sketch of the Day, painting streaks, Draw & Guess, Duets and Stamps.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
const H = (n: number) => n.toString(16).padStart(64, '0');
let owner: string, ann: string, ben: string, cy: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const strokes = (n = 4) => Array.from({ length: n }, (_, k) => ({ c: (k % 5) + 1, w: 12, p: [100 + k * 50, 200, k * 100, 300 + k * 40, 500, k * 100 + 60] }));

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('cgowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  const mod = (await db.rpc(owner, 'admin_config_get')).config.moderation.value;
  await db.rpc(owner, 'admin_config_set', { p_key: 'moderation', p_value: { ...mod, mode: 'auto' } });
  ann = await db.newPlayer('ann_sketches');
  ben = await db.newPlayer('ben_guesses');
  cy = await db.newPlayer('cy_collects');
  await db.sql(`update players set created_at = now() - interval '5 days' where id = any($1)`, [[ann, ben, cy]]);
});
afterAll(() => db.close());

describe('painting streaks', () => {
  it('counts days in a row with enough painting and boosts the craft bonus', async () => {
    await db.sql(`insert into painting_days (player_id, day, effort_ms)
                  select $1, private.day_start(now()) - make_interval(days => d), 600000 from generate_series(0, 2) d`, [ann]);
    const s = await db.rpc(ann, 'my_streak');
    expect(s).toMatchObject({ days: 3, today: true, bonus_pct: 10 });
    await db.sql(`delete from painting_days where player_id = $1 and day = private.day_start(now())`, [ann]);
    expect((await db.rpc(ann, 'my_streak')).days).toBe(2); // today not painted yet: the streak still stands
  });
});

describe('Sketch of the Day', () => {
  it('one word a day, a timed sketch, votes, and the top sketches are paid when the day ends', async () => {
    const t = await db.rpc(ann, 'sketch_start');
    expect(t.word).toBeTruthy();
    await expectError(db.rpc(ann, 'sketch_submit', { p_strokes: [] }), 'invalid_drawing');
    await db.rpc(ann, 'sketch_submit', { p_strokes: strokes() });
    await db.rpc(ben, 'sketch_start');
    await db.rpc(ben, 'sketch_submit', { p_strokes: strokes(5) });
    const list = (await db.rpc(cy, 'sketch_today')).entries;
    expect(list).toHaveLength(2);
    expect(list[0].artist).toBeNull(); // anonymous while voting
    const annSketch = (await db.rpc(ann, 'sketch_today')).mine.id;
    await expectError(db.rpc(ann, 'sketch_vote', { p_sketch_id: annSketch, p_on: true }), 'own_sketch');
    await db.rpc(cy, 'sketch_vote', { p_sketch_id: annSketch, p_on: true });
    await db.rpc(ben, 'sketch_vote', { p_sketch_id: annSketch, p_on: true });
    // the day ends
    await db.sql(`update sketches set day = day - interval '1 day'`);
    await db.sql(`update sketch_votes set day = day - interval '1 day'`);
    const before = await ink(ann);
    const next = await db.rpc(cy, 'sketch_today');
    expect(await ink(ann)).toBe(before + 100);
    expect(next.yesterday[0]).toMatchObject({ place: 1, prize: 100 });
    expect(next.yesterday[0].artist.username).toBe('ann_sketches');
  });
});

describe('Draw & Guess', () => {
  it('the drawer draws, a guesser races to guess, both earn', async () => {
    const d = await db.rpc(ann, 'doodle_draw_start');
    expect(d.choices).toHaveLength(3);
    const sub = await db.rpc(ann, 'doodle_draw_submit', { p_doodle_id: d.doodle_id, p_choice: 1, p_strokes: strokes() });
    const g = await db.rpc(ben, 'doodle_guess_start');
    expect(g.doodle_id).toBe(d.doodle_id);
    expect(g.word).toBeUndefined();
    const wrong = await db.rpc(ben, 'doodle_guess', { p_doodle_id: d.doodle_id, p_guess: 'zzz' });
    expect(wrong.correct).toBe(false);
    const a0 = await ink(ann), b0 = await ink(ben);
    const right = await db.rpc(ben, 'doodle_guess', { p_doodle_id: d.doodle_id, p_guess: sub.word.toUpperCase() + 's' });
    expect(right.correct).toBe(true);
    expect(await ink(ben)).toBeGreaterThan(b0);
    expect(await ink(ann)).toBe(a0 + 4);
    await expectError(db.rpc(ben, 'doodle_guess_start'), 'no_doodles_yet');
  });
});

describe('Duets', () => {
  it('two halves, painted blind, revealed to both', async () => {
    const top = await db.rpc(ann, 'duet_start');
    expect(top.half).toBe('top');
    await db.rpc(ann, 'duet_submit', { p_duet_id: top.id, p_strokes: strokes() });
    const bottom = await db.rpc(ben, 'duet_start');
    expect(bottom).toMatchObject({ id: top.id, half: 'bottom', top: null });
    expect(bottom.edge).toBeTruthy();
    const a0 = await ink(ann), b0 = await ink(ben);
    const done = await db.rpc(ben, 'duet_submit', { p_duet_id: top.id, p_strokes: strokes(3) });
    expect(done.status).toBe('done');
    expect(done.top).toBeTruthy();
    expect(await ink(ann)).toBe(a0 + 8);
    expect(await ink(ben)).toBe(b0 + 8);
    const pub = await db.rpc({ role: 'anon' }, 'duet_public', { p_duet_id: top.id });
    expect(pub.painters).toHaveLength(2);
  });
});

describe('Stamps', () => {
  it('collecting a numbered stamp pays the artist; limited supply', async () => {
    await db.rpc(ann, 'claim_starter_plot', { p_gx: 2_700_000, p_gy: 1_600_000 });
    const g = (await db.rpc(ann, 'my_groups'))[0];
    const p = await db.rpc(ann, 'get_project', { p_project_id: g.project_id });
    const sv = await db.rpc(ann, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { '2700000_1600000': H(1) } }] } });
    const req = await db.rpc(ann, 'request_publication', { p_project_id: g.project_id, p_version_id: sv.version_id, p_title: 'Night owl', p_rights_affirmed: true });
    await db.rpc(ann, 'submit_publication', { p_publication_id: req.publication_id });
    await db.rpc(svc, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
    await db.rpc(svc, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { '2700000_1600000': 1 } });
    await db.giveInk(cy, 50);
    await db.giveInk(ben, 50);
    await expectError(db.rpc(ann, 'stamp_collect', { p_publication_id: req.publication_id, p_idempotency_key: 'stamp-own-0001' }), 'own_artwork');
    const a0 = await ink(ann), c0 = await ink(cy);
    const r = await db.rpc(cy, 'stamp_collect', { p_publication_id: req.publication_id, p_idempotency_key: 'stamp-cy-00001' });
    expect(r).toMatchObject({ serial: 1, collected: 1, mine: 1 });
    expect(await ink(cy)).toBe(c0 - 10);
    expect(await ink(ann)).toBe(a0 + 8);
    expect((await db.rpc({ role: 'anon' }, 'stamp_book', { p_username: 'cy_collects' }))[0].serial).toBe(1);
    const v = (await db.rpc(owner, 'admin_config_get')).config.creative.value;
    await db.rpc(owner, 'admin_config_set', { p_key: 'creative', p_value: { ...v, stamps: { ...v.stamps, supply: 1 } } });
    await expectError(db.rpc(ben, 'stamp_collect', { p_publication_id: req.publication_id, p_idempotency_key: 'stamp-ben-0001' }), 'sold_out');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'creative', p_value: { ...v, stamps: { ...v.stamps, artist_pct: 300 } } }), 'invalid_creative_config');
  });
});
