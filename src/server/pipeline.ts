// LANDVAS publication & map-tile pipeline.
// ---------------------------------------------------------------------------
// Runs in the Node worker (production, images via sharp) and inside the browser
// for local mode (images via canvas). Steps for a publication:
//   process  : validate each submitted plot image (PNG, 256x256, size), decode,
//              re-encode (strips metadata), stitch a preview + thumbnail, count
//              colours, run safety screening, then hand the result to SQL which
//              decides: approved (auto/screened), pending_review, or rejected.
//   publish  : copy each plot image to its immutable z16 tile path, rebuild the
//              tile pyramid up to ART_MIN_ZOOM, publish previews, and mark the
//              publication live (which notifies map clients via map_updates).
//   unpublish: restore each plot's previous compliant art (or clear it) and
//              rebuild the pyramid.
// Tiles are immutable: tiles/<z>/<x>/<y>/<rev>.png, so a CDN can cache forever.
// ---------------------------------------------------------------------------
import { composeParent, countColors, fitWithin, isTransparent, readPngSize, stitch, type RGBA } from '../shared/art';
import { canvasLayout } from '../shared/fusion';
import { ART_MIN_ZOOM, GRID_LEVEL, PLOT_PX, cellKey, type CellTuple } from '../shared/grid';

export const BUCKETS = { drafts: 'drafts', submissions: 'submissions', processed: 'processed', public: 'public-art' } as const;
export const MAX_SUBMISSION_BYTES = 900 * 1024;

export interface PipelineDb {
  /** Call public.<fn> with named arguments using service privileges. */
  call<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
}
export interface BlobStore {
  get(bucket: string, path: string): Promise<Uint8Array | null>;
  put(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
}
export interface ImageCodec {
  decode(bytes: Uint8Array): Promise<RGBA>;
  encodePng(img: RGBA): Promise<Uint8Array>;
}
export type ScreeningResult = { provider: string; flagged: boolean; categories: string[]; score?: number };
export interface Screener {
  readonly name: string;
  screen(img: RGBA, png: Uint8Array): Promise<ScreeningResult>;
}
export const noScreening: Screener = { name: 'none', screen: async () => ({ provider: 'none', flagged: false, categories: [] }) };

export type PipelineDeps = {
  db: PipelineDb;
  store: BlobStore;
  codec: ImageCodec;
  screener?: Screener;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  /** Serialise pyramid rebuilds (production: Postgres advisory lock). */
  withPyramidLock?: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type Job = { id: number; kind: string; payload: any; attempts: number };

export const tilePath = (z: number, x: number, y: number, rev: number | string) => `tiles/${z}/${x}/${y}/${rev}.png`;

export async function runJob(deps: PipelineDeps, job: Job): Promise<void> {
  const log = deps.log ?? (() => {});
  const t0 = Date.now();
  try {
    switch (job.kind) {
      case 'process_publication':
        await processPublication(deps, job.payload.publication_id);
        break;
      case 'publish_publication':
        await publishPublication(deps, job.payload.publication_id);
        break;
      case 'unpublish_publication':
        await unpublishPublication(deps, job.payload.publication_id);
        break;
      case 'clear_cells':
        await clearCells(deps, job.payload.cells);
        break;
      default:
        throw new Error(`unknown job kind ${job.kind}`);
    }
    await deps.db.call('svc_complete_job', { p_job_id: job.id, p_ok: true });
    log('job.done', { id: job.id, kind: job.kind, ms: Date.now() - t0 });
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    log('job.failed', { id: job.id, kind: job.kind, error: message });
    await deps.db.call('svc_complete_job', { p_job_id: job.id, p_ok: false, p_error: message });
  }
}

/** Process queued jobs until the queue is empty (or `max` jobs ran). */
export async function drainQueue(deps: PipelineDeps, workerId: string, max = 100): Promise<number> {
  let n = 0;
  while (n < max) {
    const job = await deps.db.call<Job | null>('svc_claim_job', { p_worker: workerId });
    if (!job) break;
    await runJob(deps, job);
    n++;
  }
  return n;
}

// ---- process ----------------------------------------------------------------

export async function processPublication(deps: PipelineDeps, publicationId: string) {
  const ctx = await deps.db.call<any>('svc_publication_context', { p_publication_id: publicationId });
  if (!ctx || ctx.status !== 'processing') return;
  const fail = (error: string) =>
    deps.db.call('svc_publication_processed', { p_publication_id: publicationId, p_result: { ok: false, error } });
  if (!ctx.cells_owned) return fail('Plot ownership changed before the artwork could be processed.');

  const cells = ctx.cells as CellTuple[];
  const layout = canvasLayout(cells);
  const images: { col: number; row: number; img: RGBA | null }[] = [];
  let nonEmpty = 0;
  for (const [gx, gy] of cells) {
    const key = cellKey(gx, gy);
    const bytes = await deps.store.get(BUCKETS.submissions, `${ctx.owner_id}/${publicationId}/${key}.png`);
    const pos = layout.byKey.get(key)!;
    if (!bytes) {
      images.push({ col: pos.col, row: pos.row, img: null });
      continue;
    }
    if (bytes.byteLength > MAX_SUBMISSION_BYTES) return fail(`Plot ${key}: image is larger than ${MAX_SUBMISSION_BYTES / 1024} KB.`);
    const head = readPngSize(bytes);
    if (!head) return fail(`Plot ${key}: not a valid PNG image.`);
    if (head.width !== PLOT_PX || head.height !== PLOT_PX) return fail(`Plot ${key}: expected ${PLOT_PX}x${PLOT_PX} pixels.`);
    let img: RGBA;
    try {
      img = await deps.codec.decode(bytes);
    } catch {
      return fail(`Plot ${key}: the image data is corrupt.`);
    }
    if (img.width !== PLOT_PX || img.height !== PLOT_PX) return fail(`Plot ${key}: unexpected decoded size.`);
    if (isTransparent(img)) {
      images.push({ col: pos.col, row: pos.row, img: null });
      continue;
    }
    // re-encode from raw pixels: drops every ancillary chunk / metadata
    const clean = await deps.codec.encodePng(img);
    await deps.store.put(BUCKETS.processed, `${publicationId}/${key}.png`, clean, 'image/png');
    images.push({ col: pos.col, row: pos.row, img });
    nonEmpty++;
  }
  if (nonEmpty === 0) return fail('The artwork is empty — draw or place something first.');

  const full = stitch(images, layout.cols, layout.rows, PLOT_PX);
  const preview = fitWithin(full, 1024);
  const thumb = fitWithin(full, 320);
  const previewPng = await deps.codec.encodePng(preview);
  const thumbPng = await deps.codec.encodePng(thumb);
  await deps.store.put(BUCKETS.processed, `${publicationId}/preview.png`, previewPng, 'image/png');
  await deps.store.put(BUCKETS.processed, `${publicationId}/thumb.png`, thumbPng, 'image/png');
  const screening = await (deps.screener ?? noScreening).screen(preview, previewPng);
  await deps.db.call('svc_publication_processed', {
    p_publication_id: publicationId,
    p_result: {
      ok: true,
      preview_path: `${BUCKETS.processed}/${publicationId}/preview.png`,
      thumb_path: `${BUCKETS.processed}/${publicationId}/thumb.png`,
      preview_width: preview.width,
      preview_height: preview.height,
      color_count: countColors(full),
      screening,
    },
  });
}

// ---- publish --------------------------------------------------------------------

export async function publishPublication(deps: PipelineDeps, publicationId: string) {
  const ctx = await deps.db.call<any>('svc_publication_context', { p_publication_id: publicationId });
  if (!ctx || ctx.status !== 'approved') return;
  const cells = ctx.cells as CellTuple[];
  const lock = deps.withPyramidLock ?? ((fn) => fn());
  await lock(async () => {
    const present: { gx: number; gy: number; bytes: Uint8Array }[] = [];
    for (const [gx, gy] of cells) {
      const bytes = await deps.store.get(BUCKETS.processed, `${publicationId}/${cellKey(gx, gy)}.png`);
      if (bytes) present.push({ gx, gy, bytes });
    }
    const revs = await deps.db.call<number[]>('svc_reserve_revs', { p_count: present.length });
    const cellRevs: Record<string, number | null> = {};
    const entries: unknown[][] = [];
    for (const [gx, gy] of cells) cellRevs[cellKey(gx, gy)] = null;
    const cache = new Map<string, RGBA | null>();
    for (let i = 0; i < present.length; i++) {
      const { gx, gy, bytes } = present[i];
      const rev = Number(revs[i]);
      await deps.store.put(BUCKETS.public, tilePath(GRID_LEVEL, gx, gy, rev), bytes, 'image/png');
      cellRevs[cellKey(gx, gy)] = rev;
      entries.push([GRID_LEVEL, gx, gy, rev, bytes.byteLength]);
      cache.set(`${GRID_LEVEL}/${gx}/${gy}`, await deps.codec.decode(bytes));
    }
    for (const [gx, gy] of cells) {
      if (cellRevs[cellKey(gx, gy)] === null) {
        entries.push([GRID_LEVEL, gx, gy, null]);
        cache.set(`${GRID_LEVEL}/${gx}/${gy}`, null);
      }
    }
    await deps.db.call('svc_set_art_tiles', { p_tiles: entries });
    await rebuildPyramid(deps, cells, cache);
    const preview = await deps.store.get(BUCKETS.processed, `${publicationId}/preview.png`);
    const thumb = await deps.store.get(BUCKETS.processed, `${publicationId}/thumb.png`);
    if (preview) await deps.store.put(BUCKETS.public, `previews/${publicationId}.png`, preview, 'image/png');
    if (thumb) await deps.store.put(BUCKETS.public, `thumbs/${publicationId}.png`, thumb, 'image/png');
    await deps.db.call('svc_mark_published', {
      p_publication_id: publicationId,
      p_cell_revs: cellRevs,
      p_preview_public: { preview_path: `previews/${publicationId}.png`, thumb_path: `thumbs/${publicationId}.png` },
    });
    await deps.db.call('svc_record_assets', {
      p_assets: present.map((p) => ({
        owner_id: ctx.owner_id, publication_id: publicationId, kind: 'art_tile', bucket: BUCKETS.public,
        path: tilePath(GRID_LEVEL, p.gx, p.gy, cellRevs[cellKey(p.gx, p.gy)]!), bytes: p.bytes.byteLength,
        width: PLOT_PX, height: PLOT_PX, content_type: 'image/png',
      })),
    });
  });
}

// ---- unpublish / clear ---------------------------------------------------------

export async function unpublishPublication(deps: PipelineDeps, publicationId: string) {
  const plan = await deps.db.call<any[]>('svc_unpublish_plan', { p_publication_id: publicationId });
  if (!plan.length) return;
  const lock = deps.withPyramidLock ?? ((fn) => fn());
  await lock(async () => {
    await deps.db.call('svc_set_art_tiles', {
      p_tiles: plan.map((c) => (c.restore_rev ? [GRID_LEVEL, c.gx, c.gy, Number(c.restore_rev), null] : [GRID_LEVEL, c.gx, c.gy, null])),
    });
    await rebuildPyramid(deps, plan.map((c) => [c.gx, c.gy] as CellTuple), new Map());
    await deps.db.call('svc_mark_unpublished', { p_publication_id: publicationId, p_cells: plan });
  });
}

export async function clearCells(deps: PipelineDeps, cells: CellTuple[]) {
  const lock = deps.withPyramidLock ?? ((fn) => fn());
  await lock(async () => {
    await deps.db.call('svc_set_art_tiles', { p_tiles: cells.map(([gx, gy]) => [GRID_LEVEL, gx, gy, null]) });
    const cache = new Map<string, RGBA | null>(cells.map(([gx, gy]) => [`${GRID_LEVEL}/${gx}/${gy}`, null] as const));
    await rebuildPyramid(deps, cells, cache);
    await deps.db.call('svc_cells_cleared', { p_cells: cells });
  });
}

// ---- pyramid ------------------------------------------------------------------------

/**
 * Rebuild every ancestor tile (z15 … ART_MIN_ZOOM) of the changed z16 cells.
 * Each parent is the 2x box-filtered composite of its four children, so murals
 * stay continuous at every zoom level and a mobile client only ever downloads
 * ~one 256px image per screen tile, however large the artwork is.
 */
export async function rebuildPyramid(deps: PipelineDeps, cells: CellTuple[], cache: Map<string, RGBA | null>) {
  let changed = new Map<string, [number, number]>();
  for (const [gx, gy] of cells) changed.set(`${gx}/${gy}`, [gx, gy]);
  for (let z = GRID_LEVEL - 1; z >= ART_MIN_ZOOM; z--) {
    const parents = new Map<string, [number, number]>();
    for (const [x, y] of changed.values()) parents.set(`${x >> 1}/${y >> 1}`, [x >> 1, y >> 1]);
    const childKeys: [number, number, number][] = [];
    for (const [px, py] of parents.values())
      for (let k = 0; k < 4; k++) childKeys.push([z + 1, px * 2 + (k & 1), py * 2 + (k >> 1)]);
    const missing = childKeys.filter(([cz, cx, cy]) => !cache.has(`${cz}/${cx}/${cy}`));
    const existing = missing.length ? await deps.db.call<number[][]>('svc_get_art_tiles', { p_tiles: missing }) : [];
    const revOf = new Map(existing.map((r) => [`${r[0]}/${r[1]}/${r[2]}`, Number(r[3])]));
    const loadChild = async (cz: number, cx: number, cy: number): Promise<RGBA | null> => {
      const key = `${cz}/${cx}/${cy}`;
      if (cache.has(key)) return cache.get(key)!;
      const rev = revOf.get(key);
      let img: RGBA | null = null;
      if (rev) {
        const bytes = await deps.store.get(BUCKETS.public, tilePath(cz, cx, cy, rev));
        if (bytes) img = await deps.codec.decode(bytes);
      }
      cache.set(key, img);
      return img;
    };
    const results: { x: number; y: number; img: RGBA | null }[] = [];
    for (const [px, py] of parents.values()) {
      const kids = await Promise.all([0, 1, 2, 3].map((k) => loadChild(z + 1, px * 2 + (k & 1), py * 2 + (k >> 1))));
      const img = kids.every((k) => !k) ? null : composeParent(kids);
      results.push({ x: px, y: py, img: img && !isTransparent(img) ? img : null });
    }
    const nonEmpty = results.filter((r) => r.img);
    const revs = nonEmpty.length ? await deps.db.call<number[]>('svc_reserve_revs', { p_count: nonEmpty.length }) : [];
    const entries: unknown[][] = [];
    let ri = 0;
    for (const r of results) {
      cache.set(`${z}/${r.x}/${r.y}`, r.img);
      if (!r.img) {
        entries.push([z, r.x, r.y, null]);
        continue;
      }
      const rev = Number(revs[ri++]);
      const png = await deps.codec.encodePng(r.img);
      await deps.store.put(BUCKETS.public, tilePath(z, r.x, r.y, rev), png, 'image/png');
      entries.push([z, r.x, r.y, rev, png.byteLength]);
    }
    await deps.db.call('svc_set_art_tiles', { p_tiles: entries });
    changed = parents;
  }
}
