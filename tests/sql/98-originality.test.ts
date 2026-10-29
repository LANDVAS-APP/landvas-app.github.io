// v0.16: repeats earn little — the craft bonus scales with how new a piece is, and
// near-copies can't enter challenges. Reworking the same canvas isn't a repeat.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
const H = (n: number) => n.toString(16).padStart(64, '0');
let owner: string, ana: string;
let n = 0;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const A = { gx: 2_400_000, gy: 1_300_000 }, B = { gx: 2_400_010, gy: 1_300_000 };

/** Publish a canvas (by its plot) with a craft score, a fingerprint and how similar it is to earlier art. */
async function publish(uid: string, at: { gx: number; gy: number }, title: string, craft: Record<string, unknown>) {
  const g = (await db.rpc(uid, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === at.gx && c[1] === at.gy));
  const p = await db.rpc(uid, 'get_project', { p_project_id: g.project_id });
  const s = await db.rpc(uid, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { [`${at.gx}_${at.gy}`]: H(++n) } }] } });
  await db.sql(`update private.version_effort set effort_ms = 3600000 where version_id = $1`, [s.version_id]); // an hour of painting
  const req = await db.rpc(uid, 'request_publication', { p_project_id: g.project_id, p_version_id: s.version_id, p_title: title, p_rights_affirmed: true });
  await db.rpc(uid, 'submit_publication', { p_publication_id: req.publication_id });
  await db.rpc(svc, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
  await db.rpc(svc, 'svc_record_craft', { p_publication_id: req.publication_id, p_craft: craft });
  await db.rpc(svc, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { [`${at.gx}_${at.gy}`]: ++n } });
  return req.publication_id as string;
}

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('origowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  const mod = (await db.rpc(owner, 'admin_config_get')).config.moderation.value;
  await db.rpc(owner, 'admin_config_set', { p_key: 'moderation', p_value: { ...mod, mode: 'auto' } });
  ana = await db.newPlayer('ana_repeats');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [ana]);
  await db.rpc(ana, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  await db.giveInk(ana, 500);
  await db.rpc(ana, 'acquire_plot', { p_gx: B.gx, p_gy: B.gy, p_idempotency_key: 'orig-acquire-b-0001' });
});
afterAll(() => db.close());

describe('originality', () => {
  let first: string;
  it('the pipeline gets the artist’s other canvases to compare with (never the same canvas)', async () => {
    first = await publish(ana, A, 'Smiley', { score: 85, fingerprint: 'AAAA' });
    const refs = await db.rpc(svc, 'svc_art_fingerprints', { p_publication_id: first });
    expect(refs.filter((r: any) => r.own)).toHaveLength(0); // its own canvas isn't a reference
    expect((await db.sql(`select fingerprint from artwork_publications where id = $1`, [first]))[0].fingerprint).toBe('AAAA');
    const mine = await db.rpc(ana, 'my_art_fingerprints');
    expect(mine[0].title).toBe('Smiley');
  });

  it('a near-copy on another canvas earns only a small share of the craft bonus', async () => {
    const before = await ink(ana);
    const copy = await publish(ana, B, 'Smiley again', { score: 85, fingerprint: 'AAAB', similar: { sim: 0.96, id: first, title: 'Smiley', own: true } });
    // the 80+ tier pays 25; a 96% repeat earns 5% of it
    expect(await ink(ana)).toBe(before + Math.floor(25 * 0.05));
    const c = (await db.sql(`select craft from artwork_publications where id = $1`, [copy]))[0].craft;
    expect(c.originality).toBe(5);
    expect(c.fingerprint).toBeUndefined(); // the fingerprint lives in its own column
  });

  it('something genuinely new on that canvas earns the rest', async () => {
    const before = await ink(ana);
    await publish(ana, B, 'A lighthouse', { score: 86, fingerprint: 'CCCC', similar: { sim: 0.42, id: first, title: 'Smiley', own: true } });
    expect(await ink(ana)).toBe(before + 25 - Math.floor(25 * 0.05));
  });

  it('a near-copy can’t enter a challenge; the bands are adjustable', async () => {
    const list = await db.rpc(owner, 'admin_challenge_save', { p_id: null, p_title: 'Faces', p_theme: '', p_starts_at: new Date(Date.now() - 60_000).toISOString(), p_ends_at: new Date(Date.now() + 864e5).toISOString(), p_prizes: [10], p_entry_ink: 0 });
    const copy = await publish(ana, A, 'Smiley three', { score: 70, fingerprint: 'AAAC', similar: { sim: 0.9, id: first, title: 'Smiley', own: true } });
    await expectError(db.rpc(ana, 'challenge_enter', { p_challenge_id: list[0].id, p_publication_id: copy }), 'too_similar');
    const v = (await db.rpc(owner, 'admin_config_get')).config.earn.value;
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'earn', p_value: { ...v, craft: { ...v.craft, originality: [{ sim: 2, factor: 0.5 }] } } }), 'invalid_earn_config');
    await db.rpc(owner, 'admin_config_set', { p_key: 'earn', p_value: { ...v, craft: { ...v.craft, originality: [{ sim: 0.99, factor: 0 }] } } });
  });
});
