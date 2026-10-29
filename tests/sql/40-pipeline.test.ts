// End-to-end pipeline test on real PostgreSQL + real image codec (sharp):
// submission validation, moderation gate, z16 tiles, pyramid, seamless murals,
// removal/restoration — plus the worker's minigame validation API.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pg from 'pg';
import sharp from 'sharp';
import { TestDb } from '../helpers/db';
import { solveMinigame } from '../helpers/solve';
import { ART_MIN_ZOOM, GRID_LEVEL as L } from '../../src/shared/grid';
import { drainQueue, tilePath, type PipelineDb } from '../../src/server/pipeline';
import { sharpCodec } from '../../worker/codec-sharp';
import { fsStore } from '../../worker/storage-fs';
import { createApi } from '../../worker/http';

const db = new TestDb();
let store: ReturnType<typeof fsStore>;
let deps: Parameters<typeof drainQueue>[0];
let painter: string;
let mod: string;

async function png(w: number, h: number, draw: (x: number, y: number) => [number, number, number, number]) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = draw(x, y);
      data.set([r, g, b, a], (y * w + x) * 4);
    }
  return new Uint8Array(await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer());
}
async function decode(bytes: Uint8Array) {
  return sharpCodec.decode(bytes);
}
const svcDb = (): PipelineDb => ({
  call: async (fn, args = {}) => {
    const keys = Object.keys(args);
    const r = await db.admin.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
      keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])) as any[]);
    return r.rows[0]?.r;
  },
});

async function publishMural(title: string, cells: [number, number][], images: Uint8Array[]) {
  const group = (await db.rpc(painter, 'my_groups')).find((g: any) => g.plot_count === cells.length);
  const proj = await db.rpc(painter, 'get_project', { p_project_id: group.project_id });
  const saved = await db.rpc(painter, 'save_draft', {
    p_project_id: group.project_id, p_base_version_id: proj.version.id,
    p_manifest: { layers: [{ id: 'layer-1', name: 'Paint', tiles: Object.fromEntries(cells.map(([x, y], i) => [`${x}_${y}`, String(i).padStart(64, '0')])) }] },
  });
  const req = await db.rpc(painter, 'request_publication', { p_project_id: group.project_id, p_version_id: saved.version_id, p_title: title, p_rights_affirmed: true });
  for (let i = 0; i < cells.length; i++)
    await store.put('submissions', `${painter}/${req.publication_id}/${cells[i][0]}_${cells[i][1]}.png`, images[i], 'image/png');
  await db.rpc(painter, 'submit_publication', { p_publication_id: req.publication_id });
  await drainQueue(deps, 'test');
  return req.publication_id as string;
}

afterAll(async () => {
  if (store) fs.rmSync(store.root, { recursive: true, force: true });
  await db.close();
});

describe('publication pipeline', () => {
  beforeAll(async () => {
    await db.init({ ungated: true });
    store = fsStore(fs.mkdtempSync(path.join(os.tmpdir(), 'landvas-store-')));
    deps = { db: svcDb(), store, codec: sharpCodec };
    painter = await db.newPlayer('muralist');
    mod = await db.newPlayer('curator1');
    await db.sql(`insert into admin_roles (player_id, role) values ($1, 'moderator')`, [mod]);
    await db.rpc(painter, 'claim_starter_plot', { p_gx: 3000, p_gy: 3000 });
    await db.giveInk(painter, 1000);
    await db.rpc(painter, 'acquire_plot', { p_gx: 3001, p_gy: 3000, p_idempotency_key: 'pipeline-acq-1' });
    const gs = await db.rpc(painter, 'my_groups');
    await db.rpc(painter, 'fuse_groups', { p_group_ids: gs.map((g: any) => g.id) });
  });

  it('rejects malformed submissions with a clear reason', async () => {
    const wrongSize = await png(128, 128, () => [255, 0, 0, 255]);
    const ok = await png(256, 256, () => [255, 0, 0, 255]);
    const id = await publishMural('Wrong size', [[3000, 3000], [3001, 3000]], [wrongSize, ok]);
    const st = await db.rpc(painter, 'publication_status', { p_publication_id: id });
    expect(st.status).toBe('rejected');
    expect(st.decision_reason).toMatch(/256x256/);
    const junk = new TextEncoder().encode('GIF89a not a png at all, definitely not');
    const id2 = await publishMural('Junk', [[3000, 3000], [3001, 3000]], [junk, ok]);
    expect((await db.rpc(painter, 'publication_status', { p_publication_id: id2 })).decision_reason).toMatch(/valid PNG/);
  });

  it('a brush stroke across the plot boundary renders seamlessly on the map after approval', async () => {
    // left plot: deep blue sky with a yellow line from x=40 to the right edge at rows 120..135
    const left = await png(256, 256, (x, y) => (y >= 120 && y < 136 && x >= 40 ? [255, 214, 0, 255] : [20, 30, 120, 255]));
    // right plot: transparent except the line continuing from x=0 to x=200
    const right = await png(256, 256, (x, y) => (y >= 120 && y < 136 && x < 200 ? [255, 214, 0, 255] : [0, 0, 0, 0]));
    const id = await publishMural('Golden horizon', [[3000, 3000], [3001, 3000]], [left, right]);
    const st = await db.rpc(painter, 'publication_status', { p_publication_id: id });
    expect(st.status).toBe('pending_review');
    // unapproved: nothing on the public map, nothing in the public bucket
    expect(await db.sql(`select * from art_tiles`)).toHaveLength(0);
    expect(fs.existsSync(path.join(store.root, 'public-art'))).toBe(false);

    await db.rpc(mod, 'admin_review_publication', { p_publication_id: id, p_decision: 'approve' });
    await drainQueue(deps, 'test');
    expect((await db.rpc(painter, 'publication_status', { p_publication_id: id })).status).toBe('published');
    // the pipeline scored its craft (palette, shading, detail) for the craft bonus
    const craft = (await db.sql(`select craft_score, craft from artwork_publications where id = $1`, [id]))[0];
    expect(craft.craft_score).toBeGreaterThanOrEqual(0);
    expect(craft.craft.colors).toBeGreaterThanOrEqual(1);

    const tiles = await db.sql<{ z: number; x: number; y: number; rev: string }>(`select z, x, y, rev from art_tiles order by z desc, x`);
    // two plot tiles at the grid zoom + one tile per zoom level above it, down to ART_MIN_ZOOM
    expect(tiles.filter((t) => t.z === L).map((t) => t.x)).toEqual([3000, 3001]);
    for (let z = L - 1; z >= ART_MIN_ZOOM; z--) expect(tiles.filter((t) => t.z === z)).toHaveLength(1);

    // the plot tile == processed submission pixels (map thumbnails match the artwork)
    const t16 = tiles.find((t) => t.z === L && t.x === 3000)!;
    const z16 = await decode((await store.get('public-art', tilePath(L, 3000, 3000, t16.rev)))!);
    const src = await decode(left);
    expect(Buffer.from(z16.data).equals(Buffer.from(src.data))).toBe(true);

    // parent tile: both plots side by side in the top half; the line is continuous across x=127|128
    const t15 = tiles.find((t) => t.z === L - 1)!;
    expect([t15.x, t15.y]).toEqual([1500, 1500]);
    const z15 = await decode((await store.get('public-art', tilePath(L - 1, t15.x, t15.y, t15.rev)))!);
    const px = (img: typeof z15, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
    expect(px(z15, 127, 64)).toEqual([255, 214, 0, 255]);
    expect(px(z15, 128, 64)).toEqual([255, 214, 0, 255]);
    expect(px(z15, 10, 20)).toEqual([20, 30, 120, 255]);
    expect(px(z15, 200, 20)).toEqual([255, 255, 255, 255]); // the right plot's unpainted paper is white, as in the editor
    expect(px(z15, 10, 200)[3]).toBe(0); // bottom half (no plots) transparent

    // published plot tiles are fully opaque: the true artwork on white, nothing shows through
    const t16r = tiles.find((t) => t.z === L && t.x === 3001)!;
    const right16 = await decode((await store.get('public-art', tilePath(L, 3001, 3000, t16r.rev)))!);
    let minAlpha = 255;
    for (let i = 3; i < right16.data.length; i += 4) minAlpha = Math.min(minAlpha, right16.data[i]);
    expect(minAlpha).toBe(255);
    expect(Array.from(right16.data.subarray((128 * 256 + 100) * 4, (128 * 256 + 100) * 4 + 4))).toEqual([255, 214, 0, 255]);
    expect(Array.from(right16.data.subarray((10 * 256 + 240) * 4, (10 * 256 + 240) * 4 + 4))).toEqual([255, 255, 255, 255]);

    // previews are public only now, and the gallery lists the mural
    const detail = await db.rpc(null, 'artwork_detail', { p_publication_id: id });
    expect(detail.preview_path).toBe(`previews/${id}.png`);
    expect([detail.preview_width, detail.preview_height]).toEqual([512, 256]);
    expect(await store.get('public-art', `previews/${id}.png`)).not.toBeNull();
    expect(detail.color_count).toBeGreaterThanOrEqual(2);
  });

  it('a canvas with only some plots painted publishes the untouched plots as white paper', async () => {
    const half = await png(256, 256, (x, y) => (x < 128 ? [200, 40, 90, 128] : [0, 0, 0, 0]));
    const empty = await png(256, 256, () => [0, 0, 0, 0]);
    const id = await publishMural('Half painted', [[3000, 3000], [3001, 3000]], [half, empty]);
    await db.rpc(mod, 'admin_review_publication', { p_publication_id: id, p_decision: 'approve' });
    await drainQueue(deps, 'test');
    expect((await db.rpc(painter, 'publication_status', { p_publication_id: id })).status).toBe('published');
    const rows = await db.sql<{ x: number; rev: string }>(`select x, rev from art_tiles where z = $1 order by x`, [L]);
    expect(rows.map((r) => r.x)).toEqual([3000, 3001]);
    const left = await decode((await store.get('public-art', tilePath(L, 3000, 3000, rows[0].rev)))!);
    const right = await decode((await store.get('public-art', tilePath(L, 3001, 3000, rows[1].rev)))!);
    const at = (img: typeof left, x: number, y: number) => Array.from(img.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
    // alpha 128 paint composited onto white: c * a + 255 * (1 - a), a = 128/255
    expect(at(left, 10, 10)).toEqual([227, 147, 172, 255]);
    expect(at(left, 200, 10)).toEqual([255, 255, 255, 255]);
    expect(at(right, 128, 128)).toEqual([255, 255, 255, 255]);
    // an entirely blank canvas is still refused
    const id2 = await publishMural('Nothing', [[3000, 3000], [3001, 3000]], [empty, empty]);
    const st2 = await db.rpc(painter, 'publication_status', { p_publication_id: id2 });
    expect(st2.status).toBe('rejected');
    expect(st2.decision_reason).toMatch(/empty/);
  });

  it('expanding the canvas and republishing keeps alignment and updates the pyramid', async () => {
    await db.rpc(painter, 'acquire_plot', { p_gx: 3000, p_gy: 3001, p_idempotency_key: 'pipeline-acq-2' });
    const gs = await db.rpc(painter, 'my_groups');
    await db.rpc(painter, 'fuse_groups', { p_group_ids: gs.map((g: any) => g.id) });
    const fill = (c: [number, number, number]) => png(256, 256, () => [...c, 255] as [number, number, number, number]);
    const id = await publishMural('L-shaped mural', [[3000, 3000], [3001, 3000], [3000, 3001]],
      [await fill([255, 0, 0]), await fill([0, 255, 0]), await fill([0, 0, 255])]);
    await db.rpc(mod, 'admin_review_publication', { p_publication_id: id, p_decision: 'approve' });
    await drainQueue(deps, 'test');
    const z15 = (await db.sql(`select rev from art_tiles where z = $1`, [L - 1]))[0];
    const img = await decode((await store.get('public-art', tilePath(L - 1, 1500, 1500, z15.rev)))!);
    const at = (x: number, y: number) => Array.from(img.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
    expect(at(60, 60)).toEqual([255, 0, 0, 255]); // NW = 3000,3000
    expect(at(190, 60)).toEqual([0, 255, 0, 255]); // NE = 3001,3000
    expect(at(60, 190)).toEqual([0, 0, 255, 255]); // SW = 3000,3001
    expect(at(190, 190)[3]).toBe(0); // SE empty (irregular canvas)
    const old = (await db.sql(`select status from artwork_publications where title = 'Golden horizon'`))[0];
    expect(old.status).toBe('superseded');
  });

  it('moderator removal restores the previous compliant artwork on the map', async () => {
    const live = (await db.sql(`select id from artwork_publications where title = 'L-shaped mural'`))[0].id;
    await db.rpc(mod, 'admin_remove_publication', { p_publication_id: live, p_reason: 'test removal', p_strike: false });
    await drainQueue(deps, 'test');
    const cell = (await db.sql(`select a.title from world_plots p join artwork_publications a on a.id = p.art_publication_id where p.gx = 3001 and p.gy = 3000`))[0];
    expect(cell.title).toBe('Half painted');
    const z16 = await db.sql(`select x, y from art_tiles where z = $1 order by y, x`, [L]);
    expect(z16).toEqual([{ x: 3000, y: 3000 }, { x: 3001, y: 3000 }]); // 3000,3001 had no earlier art
  });
  it('under a tiny CPU budget, a job pauses and resumes step by step until the art is live', async () => {
    const tight = { ...deps, budgetMs: 1 };
    const a = await png(256, 256, (x, y) => ((x >> 4) % 2 === (y >> 4) % 2 ? [200, 30, 60, 255] : [20, 30, 120, 255]));
    const b = await png(256, 256, (x) => (x < 128 ? [255, 214, 0, 255] : [0, 0, 0, 0]));
    const group = (await db.rpc(painter, 'my_groups')).find((g: any) => g.cells.some((c: number[]) => c[0] === 3000 && c[1] === 3000));
    const cells: [number, number][] = group.cells.map((c: number[]) => [c[0], c[1]]);
    const proj = await db.rpc(painter, 'get_project', { p_project_id: group.project_id });
    const saved = await db.rpc(painter, 'save_draft', { p_project_id: group.project_id, p_base_version_id: proj.version.id,
      p_manifest: { layers: [{ id: 'layer-1', name: 'Paint', tiles: Object.fromEntries(cells.map(([x, y], i) => [`${x}_${y}`, String(i + 7).padStart(64, 'c')])) }] } });
    const req = await db.rpc(painter, 'request_publication', { p_project_id: group.project_id, p_version_id: saved.version_id, p_title: 'Stepwise', p_rights_affirmed: true });
    for (const [i, [x, y]] of cells.entries()) await store.put('submissions', `${painter}/${req.publication_id}/${x}_${y}.png`, i === 0 ? a : b, 'image/png');
    await db.rpc(painter, 'submit_publication', { p_publication_id: req.publication_id });
    let runs = 0;
    for (; runs < 200; runs++) {
      const st = (await db.rpc(painter, 'publication_status', { p_publication_id: req.publication_id })).status;
      if (st === 'pending_review') await db.rpc(mod, 'admin_review_publication', { p_publication_id: req.publication_id, p_decision: 'approve' });
      if (st === 'published' || st === 'rejected' || st === 'failed') break;
      await drainQueue(tight, 'tight');
    }
    expect((await db.rpc(painter, 'publication_status', { p_publication_id: req.publication_id })).status).toBe('published');
    expect(runs).toBeGreaterThan(4); // it really did stop and resume
    const yields = await db.sql(`select count(*)::int n from private.render_jobs where payload ? 'progress'`);
    expect(yields[0].n).toBeGreaterThan(0);
    // every zoom level got its tile
    const levels = await db.sql<{ z: number }>(`select distinct z from art_tiles where x = 3000 >> (${L} - z) and y = 3000 >> (${L} - z) and rev is not null order by z`);
    expect(levels.length).toBe(L - ART_MIN_ZOOM + 1);
  });

});

describe('worker minigame API', () => {
  let server: ReturnType<typeof createApi>;
  let base = '';
  let player: string;
  let plot: { gx: number; gy: number; game: string };
  beforeAll(async () => {
    player = await db.newPlayer('gamer');
    // find a starter plot for each test run near 6000,6000
    await db.rpc(player, 'claim_starter_plot', { p_gx: 6000, p_gy: 6000 });
    const d = await db.rpc(player, 'plot_details', { p_gx: 6000, p_gy: 6000 });
    plot = { gx: 6000, gy: 6000, game: d.type_info.minigame };
    server = createApi({ db: svcDb(), verify: async (t) => (t === 'good-token' ? player : null), allowedOrigins: ['*'], health: async () => ({ ok: true }) });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  function solve(game: string, seed: number, level: number, rounds: number | null = 5): unknown {
    return solveMinigame(game, seed, level, rounds);
  }
  const post = (body: unknown, token = 'good-token') =>
    fetch(`${base}/v1/minigames/finish`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('rejects unauthenticated calls', async () => {
    expect((await post({ session_id: 'x' }, 'bad')).status).toBe(401);
  });

  it('validates a genuine run server-side and grants rewards exactly once', async () => {
    const s = await db.rpc(player, 'start_minigame', { p_game: plot.game, p_level: await db.nextLevel(player, plot.gx, plot.gy), p_gx: plot.gx, p_gy: plot.gy });
    // the client-claimed duration is checked against the server clock: backdate the session start
    await db.sql(`update minigame_sessions set started_at = now() - interval '5 minutes' where id = $1`, [s.session_id]);
    const before = (await db.rpc(player, 'my_state')).balances.ink;
    const res = await post({ session_id: s.session_id, log: solve(plot.game, Number(s.seed), 1, s.rounds) });
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.passed).toBe(true);
    expect(body.rewards.ink).toBeGreaterThan(0);
    expect(Number(body.balances.ink)).toBe(Number(before) + body.rewards.ink);
    const replay = await post({ session_id: s.session_id, log: solve(plot.game, Number(s.seed), 1, s.rounds) });
    expect(replay.status).toBe(409);
  });

  it('a forged or impossible log earns nothing', async () => {
    const s = await db.rpc(player, 'start_minigame', { p_game: plot.game, p_level: await db.nextLevel(player, plot.gx, plot.gy), p_gx: plot.gx, p_gy: plot.gy });
    await db.sql(`update minigame_sessions set started_at = now() - interval '5 minutes' where id = $1`, [s.session_id]);
    const real = solve(plot.game, Number(s.seed), 1, s.rounds) as any;
    // forge: TraceCraft strokes shifted off the guides; other games claim a win with no moves at all
    // (replaying another seed's solution can coincidentally solve a small level, so it is not a reliable forgery)
    const forged = plot.game === 'tracecraft'
      ? { strokes: real.strokes.map((st: any) => ({ points: st.points.map(([x, y, t]: number[]) => [x + 0.35, y, t]) })) }
      : Object.fromEntries(Object.entries(real).map(([k, v]) => [k, Array.isArray(v) ? [] : v]));
    const body: any = await (await post({ session_id: s.session_id, log: forged })).json();
    expect(body.passed).toBe(false);
    expect(body.rewards.ink).toBe(0);
  });

  it('a log claiming more time than really passed is rejected', async () => {
    const s = await db.rpc(player, 'start_minigame', { p_game: plot.game, p_level: await db.nextLevel(player, plot.gx, plot.gy), p_gx: plot.gx, p_gy: plot.gy });
    const log = solve(plot.game, Number(s.seed), 1, s.rounds);
    // on the server clock the run "started" in the future, so any claimed duration is longer than real time
    await db.sql(`update minigame_sessions set started_at = now() + interval '30 seconds' where id = $1`, [s.session_id]);
    const body: any = await (await post({ session_id: s.session_id, log })).json();
    expect(body.valid).toBe(false);
    expect(body.flags).toContain('faster_than_server_clock');
  });

  it('cannot start a minigame on a plot you do not own or above your unlocked level', async () => {
    const other = await db.newPlayer('other');
    await expectReject(db.rpc(other, 'start_minigame', { p_game: plot.game, p_level: 1, p_gx: plot.gx, p_gy: plot.gy }), 'not_owner');
    await expectReject(db.rpc(player, 'start_minigame', { p_game: plot.game, p_level: 40, p_gx: plot.gx, p_gy: plot.gy }), 'level_locked');
  });
});

async function expectReject(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toThrow(code);
}
void pg;
