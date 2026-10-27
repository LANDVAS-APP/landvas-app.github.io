import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ana: string;
let ben: string;
const H = (n: number) => n.toString(16).padStart(64, '0');
const key = (gx: number, gy: number) => `${gx}_${gy}`;

async function ownBlock(uid: string, x0: number, y0: number, w: number, h: number) {
  await db.sql(`update resource_balances set amount = 1000000 where player_id = $1 and resource = 'ink'`, [uid]);
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const exists = await db.sql(`select 1 from world_plots where gx = $1 and gy = $2 and owner_id = $3`, [x, y, uid]);
      if (!exists.length) await db.rpc(uid, 'acquire_plot', { p_gx: x, p_gy: y, p_idempotency_key: `own-${uid.slice(0, 8)}-${x}-${y}` });
    }
}
async function groupOf(gx: number, gy: number) {
  return (await db.sql(`select group_id from canvas_group_members where gx = $1 and gy = $2`, [gx, gy]))[0]?.group_id as string;
}

describe('Canvas Fusion and artwork versions', () => {
  beforeAll(async () => {
    await db.init({ ungated: true });
    ana = await db.newPlayer('ana');
    ben = await db.newPlayer('ben');
    await db.rpc(ana, 'claim_starter_plot', { p_gx: 1000, p_gy: 1000 });
    await db.rpc(ben, 'claim_starter_plot', { p_gx: 1003, p_gy: 1000 });
  });
  afterAll(() => db.close());

  it('every claimed plot starts as its own canvas with an empty project', async () => {
    const groups = await db.rpc(ana, 'my_groups');
    expect(groups).toHaveLength(1);
    expect(groups[0].plot_count).toBe(1);
    expect(groups[0].project.current_version_id).toBeTruthy();
  });

  it('saves drafts as immutable versions with optimistic concurrency', async () => {
    const g = (await db.rpc(ana, 'my_groups'))[0];
    const proj = await db.rpc(ana, 'get_project', { p_project_id: g.project_id });
    const manifest = { layers: [{ id: 'layer-1', name: 'Sky', opacity: 1, visible: true, tiles: { [key(1000, 1000)]: H(1) } }] };
    const s1 = await db.rpc(ana, 'save_draft', { p_project_id: g.project_id, p_base_version_id: proj.version.id, p_manifest: manifest, p_title: 'Dawn' });
    expect(s1.version_no).toBe(2);
    expect(s1.achievements.map((a: any) => a.key)).toContain('first_stroke');
    // stale base version is rejected
    await expectError(
      db.rpc(ana, 'save_draft', { p_project_id: g.project_id, p_base_version_id: proj.version.id, p_manifest: manifest }),
      'version_conflict',
    );
    await expectError(db.sql(`update artwork_versions set manifest = '{}' where id = $1`, [s1.version_id]), 'immutable_record');
    // saving a draft never touches the public map
    const plot = await db.sql(`select art_rev from world_plots where gx = 1000 and gy = 1000`);
    expect(plot[0].art_rev).toBeNull();
  });

  it('rejects tiles outside the canvas and invalid manifests', async () => {
    const g = (await db.rpc(ana, 'my_groups'))[0];
    const proj = await db.rpc(ana, 'get_project', { p_project_id: g.project_id });
    const bad = { layers: [{ id: 'l1', name: 'x', tiles: { [key(1003, 1000)]: H(2) } }] };
    await expectError(db.rpc(ana, 'save_draft', { p_project_id: g.project_id, p_base_version_id: proj.version.id, p_manifest: bad }), 'tile_outside_canvas');
    await expectError(db.rpc(ana, 'save_draft', { p_project_id: g.project_id, p_base_version_id: proj.version.id, p_manifest: { layers: [] } }), 'invalid_layer_count');
    await expectError(
      db.rpc(ana, 'save_draft', { p_project_id: g.project_id, p_base_version_id: proj.version.id, p_manifest: { layers: [{ id: 'a', name: 'a', tiles: { [key(1000, 1000)]: 'nothex' } }] } }),
      'invalid_tile_hash',
    );
  });

  it('other players cannot read or edit someone else\'s artwork', async () => {
    const g = (await db.rpc(ana, 'my_groups'))[0];
    await expectError(db.rpc(ben, 'get_project', { p_project_id: g.project_id }), 'not_owner');
    await expectError(
      db.rpc(ben, 'save_draft', { p_project_id: g.project_id, p_base_version_id: null, p_manifest: { layers: [{ id: 'a', name: 'a', tiles: {} }] }, p_force: true }),
      'not_owner',
    );
    await expectError(db.rpc(ben, 'fuse_groups', { p_group_ids: [g.id, await groupOf(1003, 1000)] }), 'not_owner');
  });

  it('cannot fuse non-adjacent canvases', async () => {
    await ownBlock(ana, 1005, 1000, 1, 1);
    await expectError(db.rpc(ana, 'fuse_groups', { p_group_ids: [await groupOf(1000, 1000), await groupOf(1005, 1000)] }), 'not_connected');
  });

  it('cannot fuse with another player\'s plot even if adjacent', async () => {
    await ownBlock(ana, 1002, 1000, 1, 1); // next to ben's 1003
    await expectError(db.rpc(ana, 'fuse_groups', { p_group_ids: [await groupOf(1002, 1000), await groupOf(1003, 1000)] }), 'not_owner');
  });

  it('fuses horizontally adjacent plots and keeps existing art in place', async () => {
    await ownBlock(ana, 1001, 1000, 1, 1);
    const gA = await groupOf(1000, 1000);
    const gB = await groupOf(1001, 1000);
    // give the new plot some art of its own
    const pB = (await db.rpc(ana, 'get_group', { p_group_id: gB })).project_id;
    const projB = await db.rpc(ana, 'get_project', { p_project_id: pB });
    await db.rpc(ana, 'save_draft', { p_project_id: pB, p_base_version_id: projB.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'Grass', tiles: { [key(1001, 1000)]: H(3) } }] } });
    const fused = await db.rpc(ana, 'fuse_groups', { p_group_ids: [gA, gB], p_name: 'Sunrise mural' });
    expect(fused.plot_count).toBe(2);
    expect(fused.name).toBe('Sunrise mural');
    const proj = await db.rpc(ana, 'get_project', { p_project_id: fused.project_id });
    const tiles = proj.version.manifest.layers.flatMap((l: any) => Object.entries(l.tiles));
    expect(tiles).toContainEqual([key(1000, 1000), H(1)]);
    expect(tiles).toContainEqual([key(1001, 1000), H(3)]);
    expect(proj.version.kind).toBe('merge');
    expect(fused.achievements.map((a: any) => a.key)).toContain('canvas_connector');
  });

  it('expands a canvas with vertical, square and irregular shapes', async () => {
    await ownBlock(ana, 1000, 1001, 3, 2); // makes an L/rect with existing row
    const groups = new Set<string>();
    for (const [x, y] of [[1000, 1000], [1001, 1000], [1002, 1000], [1000, 1001], [1001, 1001], [1002, 1001], [1000, 1002], [1001, 1002], [1002, 1002]])
      groups.add(await groupOf(x, y));
    const fused = await db.rpc(ana, 'fuse_groups', { p_group_ids: [...groups] });
    expect(fused.plot_count).toBe(9);
    expect([fused.min_gx, fused.min_gy, fused.max_gx, fused.max_gy]).toEqual([1000, 1000, 1002, 1002]);
    const proj = await db.rpc(ana, 'get_project', { p_project_id: fused.project_id });
    const tiles = Object.fromEntries(proj.version.manifest.layers.flatMap((l: any) => Object.entries(l.tiles)));
    expect(tiles[key(1000, 1000)]).toBe(H(1)); // spatial alignment preserved after expansion
    expect(tiles[key(1001, 1000)]).toBe(H(3));
  });

  it('enforces canvas size limits', async () => {
    await db.sql(`update game_config set value = jsonb_set(value, '{max_canvas_side}', '3') where key = 'limits'`);
    await ownBlock(ana, 1003 + 1, 1001, 1, 1); // 1004,1001 (1003 row 1000 is ben's)
    await ownBlock(ana, 1003, 1001, 1, 1);
    const g9 = await groupOf(1000, 1000);
    await expectError(db.rpc(ana, 'fuse_groups', { p_group_ids: [g9, await groupOf(1003, 1001)] }), 'canvas_too_large');
    await db.sql(`update game_config set value = jsonb_set(value, '{max_canvas_side}', '10') where key = 'limits'`);
  });

  it('detaching splits disconnected remainders and never loses art', async () => {
    const g = await groupOf(1000, 1000);
    // detach the middle column -> left column and right column become separate canvases
    const r = await db.rpc(ana, 'detach_plots', { p_group_id: g, p_cells: [[1001, 1000], [1001, 1001], [1001, 1002]] });
    expect(r.group.plot_count).toBe(3);
    const newCounts = r.new_groups.map((x: any) => x.plot_count).sort();
    expect(newCounts).toEqual([1, 1, 1, 3]);
    // the detached 1001,1000 plot carries its art
    const detached = r.new_groups.find((x: any) => x.cells.some((c: any) => c[0] === 1001 && c[1] === 1000));
    const proj = await db.rpc(ana, 'get_project', { p_project_id: detached.project_id });
    const tiles = Object.fromEntries(proj.version.manifest.layers.flatMap((l: any) => Object.entries(l.tiles)));
    expect(tiles[key(1001, 1000)]).toBe(H(3));
    // history of the original project still has the full mural
    const versions = await db.rpc(ana, 'project_versions', { p_project_id: r.group.project_id });
    expect(versions.some((v: any) => v.kind === 'merge' && v.plot_count === 9)).toBe(true);
  });

  it('restores an older version, clipped to the current canvas shape', async () => {
    const g = await db.rpc(ana, 'get_group', { p_group_id: await groupOf(1000, 1000) });
    const versions = await db.rpc(ana, 'project_versions', { p_project_id: g.project_id });
    const mergeV = versions.find((v: any) => v.kind === 'merge' && v.plot_count === 9);
    const restored = await db.rpc(ana, 'restore_version', { p_project_id: g.project_id, p_version_id: mergeV.id });
    expect(restored.version.kind).toBe('restore');
    for (const l of restored.version.manifest.layers)
      for (const k of Object.keys(l.tiles)) expect(k.startsWith('1000_')).toBe(true);
  });

  it('a fused canvas across the antimeridian is contiguous', async () => {
    const w = await db.newPlayer('wrapper');
    await db.rpc(w, 'claim_starter_plot', { p_gx: 4194303, p_gy: 5000 });
    await ownBlock(w, 0, 5000, 1, 1);
    const f = await db.rpc(w, 'fuse_groups', { p_group_ids: [await groupOf(4194303, 5000), await groupOf(0, 5000)] });
    expect(f.plot_count).toBe(2);
    expect(f.min_gx).toBe(-1);
    expect(f.max_gx).toBe(0);
  });
});

describe('publication state machine', () => {
  const pdb = new TestDb();
  let u: string;
  let mod: string;
  beforeAll(async () => {
    await pdb.init({ ungated: true });
    u = await pdb.newPlayer('painter');
    mod = await pdb.newPlayer('moderator1');
    await pdb.sql(`insert into admin_roles (player_id, role) values ($1, 'moderator')`, [mod]);
    await pdb.rpc(u, 'claim_starter_plot', { p_gx: 2000, p_gy: 2000 });
  });
  afterAll(() => pdb.close());

  async function draft() {
    const g = (await pdb.rpc(u, 'my_groups'))[0];
    const p = await pdb.rpc(u, 'get_project', { p_project_id: g.project_id });
    const s = await pdb.rpc(u, 'save_draft', {
      p_project_id: g.project_id, p_base_version_id: p.version.id,
      p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { '2000_2000': H(9) } }] },
    });
    return { g, versionId: s.version_id as string };
  }

  it('requires rights affirmation and the current version', async () => {
    const { g, versionId } = await draft();
    await expectError(pdb.rpc(u, 'request_publication', { p_project_id: g.project_id, p_version_id: versionId, p_title: 'Hi', p_rights_affirmed: false }), 'rights_affirmation_required');
    const p = await pdb.rpc(u, 'get_project', { p_project_id: g.project_id });
    await expectError(pdb.rpc(u, 'request_publication', { p_project_id: g.project_id, p_version_id: p.version.id === versionId ? '00000000-0000-0000-0000-000000000000' : versionId, p_title: 'Hi', p_rights_affirmed: true }), 'version_not_found');
  });

  it('manual moderation keeps unapproved art off the map until a moderator approves', async () => {
    const { g, versionId } = await draft();
    const req = await pdb.rpc(u, 'request_publication', { p_project_id: g.project_id, p_version_id: versionId, p_title: 'First light', p_rights_affirmed: true });
    expect(req.upload_prefix).toBe(`${u}/${req.publication_id}`);
    await pdb.rpc(u, 'submit_publication', { p_publication_id: req.publication_id });
    const job = await pdb.rpc({ role: 'service_role' }, 'svc_claim_job', { p_worker: 'test' });
    expect(job.kind).toBe('process_publication');
    const processed = await pdb.rpc({ role: 'service_role' }, 'svc_publication_processed', {
      p_publication_id: req.publication_id,
      p_result: { ok: true, preview_path: 'previews/x.png', thumb_path: 'thumbs/x.png', color_count: 30, screening: { provider: 'none', flagged: false } },
    });
    expect(processed.status).toBe('pending_review');
    // invisible to the public while pending
    await expectError(pdb.rpc(null, 'artwork_detail', { p_publication_id: req.publication_id }), 'not_found');
    const gallery = await pdb.rpc(null, 'gallery_list', { p_section: 'new' });
    expect(gallery).toHaveLength(0);
    // the author cannot approve their own work, the moderator can
    await expectError(pdb.rpc(u, 'admin_review_publication', { p_publication_id: req.publication_id, p_decision: 'approve' }), 'forbidden');
    await pdb.rpc(mod, 'admin_review_publication', { p_publication_id: req.publication_id, p_decision: 'approve' });
    const pub = await pdb.rpc({ role: 'service_role' }, 'svc_claim_job', { p_worker: 'test' });
    await pdb.rpc({ role: 'service_role' }, 'svc_complete_job', { p_job_id: job.id, p_ok: true });
    expect(pub.kind).toBe('publish_publication');
    await pdb.rpc({ role: 'service_role' }, 'svc_set_art_tiles', { p_tiles: [[16, 2000, 2000, 77, 1234]] });
    const done = await pdb.rpc({ role: 'service_role' }, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { '2000_2000': 77 } });
    expect(done.status).toBe('published');
    expect(done.achievements.map((a: any) => a.key)).toContain('first_masterpiece');
    const detail = await pdb.rpc(null, 'artwork_detail', { p_publication_id: req.publication_id });
    expect(detail.title).toBe('First light');
    const idx = await pdb.rpc(null, 'art_tile_index', { p_z: 16, p_blocks: [[2000 >> 4, 2000 >> 4]] });
    expect(idx[`${2000 >> 4}_${2000 >> 4}`]).toEqual([[2000, 2000, 77]]);
    const audit = await pdb.sql(`select action from audit_logs where action = 'artwork.review'`);
    expect(audit).toHaveLength(1);
  });

  it('removal by a moderator restores the previous artwork and records a strike', async () => {
    const { g, versionId } = await draft();
    const req = await pdb.rpc(u, 'request_publication', { p_project_id: g.project_id, p_version_id: versionId, p_title: 'Second', p_rights_affirmed: true });
    await pdb.rpc(u, 'submit_publication', { p_publication_id: req.publication_id });
    await pdb.rpc({ role: 'service_role' }, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
    await pdb.rpc(mod, 'admin_review_publication', { p_publication_id: req.publication_id, p_decision: 'approve' });
    await pdb.rpc({ role: 'service_role' }, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { '2000_2000': 88 } });
    const first = (await pdb.sql(`select id from artwork_publications where title = 'First light'`))[0].id;
    expect((await pdb.sql(`select status from artwork_publications where id = $1`, [first]))[0].status).toBe('superseded');
    await pdb.rpc(mod, 'admin_remove_publication', { p_publication_id: req.publication_id, p_reason: 'copyright claim upheld', p_strike: true });
    const plan = await pdb.rpc({ role: 'service_role' }, 'svc_unpublish_plan', { p_publication_id: req.publication_id });
    expect(plan).toEqual([{ gx: 2000, gy: 2000, restore_publication_id: first, restore_rev: 77 }]);
    await pdb.rpc({ role: 'service_role' }, 'svc_mark_unpublished', { p_publication_id: req.publication_id, p_cells: plan });
    const plot = (await pdb.sql(`select art_publication_id, art_rev from world_plots where gx = 2000 and gy = 2000`))[0];
    expect(plot.art_publication_id).toBe(first);
    expect(Number(plot.art_rev)).toBe(77);
    expect((await pdb.sql(`select status from artwork_publications where id = $1`, [first]))[0].status).toBe('published');
    expect((await pdb.sql(`select strikes from players where id = $1`, [u]))[0].strikes).toBe(1);
  });

  it('automated screening flags are rejected and appealable', async () => {
    const { g, versionId } = await draft();
    const req = await pdb.rpc(u, 'request_publication', { p_project_id: g.project_id, p_version_id: versionId, p_title: 'Flagged', p_rights_affirmed: true });
    await pdb.rpc(u, 'submit_publication', { p_publication_id: req.publication_id });
    const r = await pdb.rpc({ role: 'service_role' }, 'svc_publication_processed', {
      p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'test', flagged: true, categories: ['sexual'] } } });
    expect(r.status).toBe('rejected');
    await pdb.rpc(u, 'submit_appeal', { p_publication_id: req.publication_id, p_message: 'This is an abstract landscape, please re-review.' });
    const q = await pdb.rpc(mod, 'admin_moderation_queue', { p_status: 'open' });
    expect(q.cases.some((c: any) => c.kind === 'appeal')).toBe(true);
  });

  it('reports are rate limited and deduplicated per reporter', async () => {
    const pubId = (await pdb.sql(`select id from artwork_publications where title = 'First light'`))[0].id;
    const reporter = await pdb.newPlayer('reporter');
    await pdb.rpc(reporter, 'report_artwork', { p_publication_id: pubId, p_reason: 'spam' });
    const dup = await pdb.rpc(reporter, 'report_artwork', { p_publication_id: pubId, p_reason: 'spam' });
    expect(dup.duplicate).toBe(true);
  });

  it('appreciations: one per player, never on your own art, requires a plot', async () => {
    const pubId = (await pdb.sql(`select id from artwork_publications where title = 'First light'`))[0].id;
    const fan = await pdb.newPlayer('fan');
    await expectError(pdb.rpc(fan, 'appreciate', { p_publication_id: pubId }), 'claim_a_plot_first');
    await pdb.rpc(fan, 'claim_starter_plot', { p_gx: 2100, p_gy: 2100 });
    await pdb.rpc(fan, 'appreciate', { p_publication_id: pubId });
    const again = await pdb.rpc(fan, 'appreciate', { p_publication_id: pubId });
    expect(again.appreciation_count).toBe(1);
    await expectError(pdb.rpc(u, 'appreciate', { p_publication_id: pubId }), 'cannot_appreciate_own');
  });
});
