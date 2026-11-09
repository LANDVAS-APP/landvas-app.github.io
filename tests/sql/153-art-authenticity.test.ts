// Art authenticity: every artwork card says whether it was drawn on LANDVAS or has an
// uploaded image in it — and merging or detaching canvases can't wash the upload flag away.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
const H = (n: number) => n.toString(16).padStart(64, '0');
let owner: string, ana: string;
let n = 0;
const A = { gx: 2_600_000, gy: 1_500_000 }, B = { gx: 2_600_001, gy: 1_500_000 }, C = { gx: 2_600_010, gy: 1_500_000 };

const groupAt = async (uid: string, at: { gx: number; gy: number }) =>
  (await db.rpc(uid, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === at.gx && c[1] === at.gy));

/** Save a draft on the canvas at `at` (optionally with an uploaded image placed in it). */
async function draft(uid: string, at: { gx: number; gy: number }, imported: boolean) {
  const g = await groupAt(uid, at);
  const p = await db.rpc(uid, 'get_project', { p_project_id: g.project_id });
  const tiles = Object.fromEntries(g.cells.map((c: number[]) => [`${c[0]}_${c[1]}`, H(++n)]));
  const manifest = { layers: [{ id: 'layer-1', name: 'L', tiles }], ...(imported ? { imported: true } : {}) };
  const s = await db.rpc(uid, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: manifest });
  return { g, version: s.version_id as string };
}

async function publish(uid: string, at: { gx: number; gy: number }, title: string, imported: boolean) {
  const { g, version } = await draft(uid, at, imported);
  const req = await db.rpc(uid, 'request_publication', { p_project_id: g.project_id, p_version_id: version, p_title: title, p_rights_affirmed: true });
  await db.rpc(uid, 'submit_publication', { p_publication_id: req.publication_id });
  await db.rpc(svc, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
  await db.rpc(svc, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: Object.fromEntries(g.cells.map((c: number[]) => [`${c[0]}_${c[1]}`, ++n])) });
  return req.publication_id as string;
}

const made = async (viewer: string, id: string) => (await db.rpc(viewer, 'artwork_detail', { p_publication_id: id })).made;

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('authowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  const mod = (await db.rpc(owner, 'admin_config_get')).config.moderation.value;
  await db.rpc(owner, 'admin_config_set', { p_key: 'moderation', p_value: { ...mod, mode: 'auto' } });
  ana = await db.newPlayer('ana_authentic');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [ana]);
  await db.rpc(ana, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  await db.giveInk(ana, 5000);
  await db.rpc(ana, 'acquire_plot', { p_gx: B.gx, p_gy: B.gy, p_idempotency_key: 'auth-acquire-b-0001' });
  await db.rpc(ana, 'acquire_plot', { p_gx: C.gx, p_gy: C.gy, p_idempotency_key: 'auth-acquire-c-0001' });
});
afterAll(() => db.close());

describe('art authenticity', () => {
  it('art painted in the editor is marked drawn, for everyone who sees it', async () => {
    const id = await publish(ana, C, 'All mine', false);
    expect(await made(ana, id)).toBe('drawn');
    expect(await made(owner, id)).toBe('drawn');
    const card = (await db.rpc(owner, 'gallery_feed', { p_section: 'new', p_limit: 20 }).catch(() => null)) as any;
    if (Array.isArray(card?.items ?? card)) expect((card.items ?? card).find((c: any) => c.id === id)?.made).toBe('drawn');
  });

  it('art with an uploaded image placed in it is marked upload', async () => {
    const id = await publish(ana, A, 'Photo', true);
    expect(await made(owner, id)).toBe('upload');
  });

  it('merging an uploaded canvas into a drawn one keeps the upload flag', async () => {
    await draft(ana, B, false);
    const ga = await groupAt(ana, A), gb = await groupAt(ana, B);
    const g = await db.rpc(ana, 'fuse_groups', { p_group_ids: [ga.id, gb.id] });
    const v = (await db.sql(`select v.manifest from canvas_groups cg join artwork_projects p on p.id = cg.project_id
                              join artwork_versions v on v.id = p.current_version_id where cg.id = $1`, [g.id]))[0].manifest;
    expect(v.imported).toBe(true);
  });

  it('the manifest helpers carry the flag through detach and compact', async () => {
    const m = { layers: [{ id: 'l', name: 'L', tiles: { '1_1': H(1), '2_2': H(2) } }, { id: 'e', name: 'E', tiles: {} }], imported: true };
    const [r] = await db.sql(`select private.manifest_restrict($1::jsonb, '[[1,1]]'::jsonb) as a, private.manifest_compact($1::jsonb) as b,
                                     private.manifest_merge('{"layers":[]}'::jsonb, $1::jsonb) as c,
                                     private.manifest_merge('{"layers":[]}'::jsonb, '{"layers":[]}'::jsonb) as d`, [JSON.stringify(m)]);
    expect([r.a.imported, r.b.imported, r.c.imported]).toEqual([true, true, true]);
    expect(r.d.imported).toBeUndefined();
  });

  it('art published before uploads were tracked is left unmarked', async () => {
    const id = await publish(ana, C, 'Old one', false);
    await db.sql(`update artwork_publications set published_at = '2026-10-27' where id = $1`, [id]);
    expect(await made(owner, id)).toBeNull();
  });
});
