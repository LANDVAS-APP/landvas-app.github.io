// LANDVAS publication & map-tile pipeline.
// ---------------------------------------------------------------------------
// Runs in the Node worker (production, images via sharp) and inside the browser
// for local mode (images via canvas). Steps for a publication:
//   process  : validate each submitted plot image (PNG, 256x256, size), decode,
//              flatten onto white paper and re-encode (strips metadata; blank
//              plots become plain white), stitch a preview + thumbnail, count
//              colours, run safety screening, then hand the result to SQL which
//              decides: approved (auto/screened), pending_review, or rejected.
//   publish  : copy each plot image to its immutable z16 tile path, rebuild the
//              tile pyramid up to ART_MIN_ZOOM, publish previews, and mark the
//              publication live (which notifies map clients via map_updates).
//   unpublish: restore each plot's previous compliant art (or clear it) and
//              rebuild the pyramid.
// Tiles are immutable: tiles/<z>/<x>/<y>/<rev>.png, so a CDN can cache forever.
// ---------------------------------------------------------------------------
import { composeParent, countColors, fitWithin, flattenOnWhite, isTransparent, readPngSize, stitch, whitePaper, type RGBA } from '../shared/art';
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
  /** Image-work budget per run in ms (Edge Functions); the job saves its progress and resumes after it. */
  budgetMs?: number;
};

export type Job = { id: number; kind: string; payload: any; attempts: number };

export const tilePath = (z: number, x: number, y: number, rev: number | string) => `tiles/${z}/${x}/${y}/${rev}.png`;

/**
 * Hosted Edge Functions get ~2 s of CPU per request, and a big mural needs far more
 * than that. Jobs therefore work in steps: when a run's image work passes its budget
 * it saves its progress in the job and hands back (`svc_yield_job`); the next run
 * picks up exactly where it stopped. Self-hosted workers and local mode have no budget.
 */
export class PipelineYield extends Error {
  constructor(public progress: unknown) { super('yield'); }
}
type Meter = { used: number; limit: number };
type Checkpoint = (progress: unknown, need?: number) => void;

function metered(codec: ImageCodec, meter: Meter): ImageCodec {
  return {
    async decode(b) { const t = performance.now(); try { return await codec.decode(b); } finally { meter.used += performance.now() - t; } },
    async encodePng(i) { const t = performance.now(); try { return await codec.encodePng(i); } finally { meter.used += performance.now() - t; } },
  };
}

export async function runJob(deps: PipelineDeps, job: Job, meter: Meter = { used: 0, limit: deps.budgetMs ?? Infinity }): Promise<'done' | 'yielded' | 'failed'> {
  const log = deps.log ?? (() => {});
  const t0 = Date.now();
  const d: PipelineDeps = Number.isFinite(meter.limit) ? { ...deps, codec: metered(deps.codec, meter) } : deps;
  // yield when this run has used its budget — but always make *some* progress first
  const checkpoint: Checkpoint = (progress, need = 0) => {
    if (meter.used > 0 && meter.used + need > meter.limit) throw new PipelineYield(progress);
  };
  const progress = job.payload?.progress ?? null;
  try {
    switch (job.kind) {
      case 'process_publication':
        await processPublication(d, job.payload.publication_id, progress, checkpoint);
        break;
      case 'publish_publication':
        await publishPublication(d, job.payload.publication_id, progress, checkpoint);
        break;
      case 'unpublish_publication':
        await unpublishPublication(d, job.payload.publication_id, progress, checkpoint);
        break;
      case 'clear_cells':
        await clearCells(d, job.payload.cells, progress, checkpoint);
        break;
      default:
        throw new Error(`unknown job kind ${job.kind}`);
    }
    await deps.db.call('svc_complete_job', { p_job_id: job.id, p_ok: true });
    log('job.done', { id: job.id, kind: job.kind, ms: Date.now() - t0 });
    return 'done';
  } catch (e) {
    if (e instanceof PipelineYield) {
      await deps.db.call('svc_yield_job', { p_job_id: job.id, p_progress: e.progress });
      log('job.yield', { id: job.id, kind: job.kind, ms: Date.now() - t0, codec_ms: Math.round(meter.used) });
      return 'yielded';
    }
    const message = (e as Error)?.message ?? String(e);
    log('job.failed', { id: job.id, kind: job.kind, error: message });
    await deps.db.call('svc_complete_job', { p_job_id: job.id, p_ok: false, p_error: message });
    return 'failed';
  }
}

/** Process queued jobs until the queue is empty (or `max` jobs ran). A yielded job ends the run. */
export async function drainQueue(deps: PipelineDeps, workerId: string, max = 100): Promise<number> {
  let n = 0;
  const meter: Meter = { used: 0, limit: deps.budgetMs ?? Infinity }; // shared by every job in this run
  while (n < max && meter.used < meter.limit * 0.7) {
    const job = await deps.db.call<Job | null>('svc_claim_job', { p_worker: workerId });
    if (!job) break;
    const r = await runJob(deps, job, meter);
    n++;
    if (r === 'yielded') break;
  }
  return n;
}

// ---- process ----------------------------------------------------------------

type ProcessProgress = { stage: 'plots' | 'preview'; done: string[]; painted: number };

/** Size each plot takes in the stitched preview (so the preview never needs full-size plots). */
const previewCell = (cols: number, rows: number) => Math.max(4, Math.min(PLOT_PX, Math.floor(1024 / Math.max(cols, rows))));

export async function processPublication(deps: PipelineDeps, publicationId: string, saved?: ProcessProgress | null, checkpoint: Checkpoint = () => {}) {
  const ctx = await deps.db.call<any>('svc_publication_context', { p_publication_id: publicationId });
  if (!ctx || ctx.status !== 'processing') return;
  const fail = (error: string) =>
    deps.db.call('svc_publication_processed', { p_publication_id: publicationId, p_result: { ok: false, error } });
  if (!ctx.cells_owned) return fail('Plot ownership changed before the artwork could be processed.');

  const cells = ctx.cells as CellTuple[];
  const layout = canvasLayout(cells);
  const cell = previewCell(layout.cols, layout.rows);
  const pr: ProcessProgress = saved?.stage ? { ...saved, done: [...saved.done] } : { stage: 'plots', done: [], painted: 0 };
  const doneSet = new Set(pr.done);

  // Every plot of the canvas is published as the editor shows it: the artwork on
  // white paper (untouched plots are plain white). Re-encoding from raw pixels
  // also drops every ancillary chunk / metadata. Each plot is checked and stored
  // on its own, so a big mural can be processed over several runs.
  if (pr.stage === 'plots') {
    let paperPng: Uint8Array | null = null;
    for (const [gx, gy] of cells) {
      const key = cellKey(gx, gy);
      if (doneSet.has(key)) continue;
      const bytes = await deps.store.get(BUCKETS.submissions, `${ctx.owner_id}/${publicationId}/${key}.png`);
      let img: RGBA | null = null;
      if (bytes) {
        if (bytes.byteLength > MAX_SUBMISSION_BYTES) return fail(`Plot ${key}: image is larger than ${MAX_SUBMISSION_BYTES / 1024} KB.`);
        const head = readPngSize(bytes);
        if (!head) return fail(`Plot ${key}: not a valid PNG image.`);
        if (head.width !== PLOT_PX || head.height !== PLOT_PX) return fail(`Plot ${key}: expected ${PLOT_PX}x${PLOT_PX} pixels.`);
        try {
          img = await deps.codec.decode(bytes);
        } catch {
          return fail(`Plot ${key}: the image data is corrupt.`);
        }
        if (img.width !== PLOT_PX || img.height !== PLOT_PX) return fail(`Plot ${key}: unexpected decoded size.`);
        if (isTransparent(img)) img = null;
      }
      if (img) pr.painted++;
      const flat = img ? flattenOnWhite(img) : whitePaper(PLOT_PX);
      const clean = img ? await deps.codec.encodePng(flat) : (paperPng ??= await deps.codec.encodePng(flat));
      await deps.store.put(BUCKETS.processed, `${publicationId}/${key}.png`, clean, 'image/png');
      await deps.store.put(BUCKETS.processed, `${publicationId}/mini/${key}.png`, await deps.codec.encodePng(fitWithin(flat, cell)), 'image/png');
      pr.done.push(key);
      doneSet.add(key);
      checkpoint(pr);
    }
    if (pr.painted === 0) return fail('The artwork is empty — draw or place something first.');
    pr.stage = 'preview';
    checkpoint(pr, Number.POSITIVE_INFINITY); // start the preview with a fresh budget
  }

  // preview + thumbnail, stitched from the small per-plot copies
  const minis: { col: number; row: number; img: RGBA | null }[] = [];
  for (const [gx, gy] of cells) {
    const key = cellKey(gx, gy);
    const pos = layout.byKey.get(key)!;
    const b = await deps.store.get(BUCKETS.processed, `${publicationId}/mini/${key}.png`);
    minis.push({ col: pos.col, row: pos.row, img: b ? await deps.codec.decode(b) : null });
  }
  const full = stitch(minis, layout.cols, layout.rows, cell);
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

type PublishProgress = { stage: 'tiles' | 'pyramid' | 'finish'; revs: Record<string, number | null>; copied: string[]; sizes: Record<string, number>; pyramid?: PyramidProgress };

export async function publishPublication(deps: PipelineDeps, publicationId: string, saved?: PublishProgress | null, checkpoint: Checkpoint = () => {}) {
  const ctx = await deps.db.call<any>('svc_publication_context', { p_publication_id: publicationId });
  if (!ctx || ctx.status !== 'approved') return;
  const cells = ctx.cells as CellTuple[];
  const lock = deps.withPyramidLock ?? ((fn) => fn());
  await lock(async () => {
    let pr: PublishProgress;
    if (saved?.stage) pr = { ...saved, copied: [...saved.copied] };
    else {
      // which plots have art, and a fresh immutable revision for each
      const present: string[] = [];
      for (const [gx, gy] of cells) {
        const key = cellKey(gx, gy);
        if (await deps.store.get(BUCKETS.processed, `${publicationId}/${key}.png`)) present.push(key);
      }
      const revs = await deps.db.call<number[]>('svc_reserve_revs', { p_count: present.length });
      const map: Record<string, number | null> = {};
      for (const [gx, gy] of cells) map[cellKey(gx, gy)] = null;
      present.forEach((k, i) => { map[k] = Number(revs[i]); });
      pr = { stage: 'tiles', revs: map, copied: [], sizes: {} };
    }
    if (pr.stage === 'tiles') {
      const copied = new Set(pr.copied);
      for (const [gx, gy] of cells) {
        const key = cellKey(gx, gy);
        const rev = pr.revs[key];
        if (rev == null || copied.has(key)) continue;
        const bytes = await deps.store.get(BUCKETS.processed, `${publicationId}/${key}.png`);
        if (!bytes) throw new Error(`processed image missing for ${key}`);
        await deps.store.put(BUCKETS.public, tilePath(GRID_LEVEL, gx, gy, rev), bytes, 'image/png');
        pr.sizes[key] = bytes.byteLength;
        pr.copied.push(key);
        copied.add(key);
      }
      await deps.db.call('svc_set_art_tiles', {
        p_tiles: cells.map(([gx, gy]) => {
          const rev = pr.revs[cellKey(gx, gy)];
          return rev == null ? [GRID_LEVEL, gx, gy, null] : [GRID_LEVEL, gx, gy, rev, pr.sizes[cellKey(gx, gy)] ?? 0];
        }),
      });
      pr.stage = 'pyramid';
    }
    if (pr.stage === 'pyramid') {
      await pyramidSteps(deps, cells, pr.pyramid ?? null, (py, need) => { pr.pyramid = py; checkpoint(pr, need); });
      pr.stage = 'finish';
    }
    const preview = await deps.store.get(BUCKETS.processed, `${publicationId}/preview.png`);
    const thumb = await deps.store.get(BUCKETS.processed, `${publicationId}/thumb.png`);
    if (preview) await deps.store.put(BUCKETS.public, `previews/${publicationId}.png`, preview, 'image/png');
    if (thumb) await deps.store.put(BUCKETS.public, `thumbs/${publicationId}.png`, thumb, 'image/png');
    await deps.db.call('svc_mark_published', {
      p_publication_id: publicationId,
      p_cell_revs: pr.revs,
      p_preview_public: { preview_path: `previews/${publicationId}.png`, thumb_path: `thumbs/${publicationId}.png` },
    });
    await deps.db.call('svc_record_assets', {
      p_assets: cells.filter(([gx, gy]) => pr.revs[cellKey(gx, gy)] != null).map(([gx, gy]) => ({
        owner_id: ctx.owner_id, publication_id: publicationId, kind: 'art_tile', bucket: BUCKETS.public,
        path: tilePath(GRID_LEVEL, gx, gy, pr.revs[cellKey(gx, gy)]!), bytes: pr.sizes[cellKey(gx, gy)] ?? 0,
        width: PLOT_PX, height: PLOT_PX, content_type: 'image/png',
      })),
    });
  });
}

// ---- unpublish / clear ---------------------------------------------------------

type CellsProgress = { stage: 'pyramid'; pyramid?: PyramidProgress };

export async function unpublishPublication(deps: PipelineDeps, publicationId: string, saved?: (CellsProgress & { plan: any[] }) | null, checkpoint: Checkpoint = () => {}) {
  const plan = saved?.plan ?? await deps.db.call<any[]>('svc_unpublish_plan', { p_publication_id: publicationId });
  if (!plan.length) return;
  const lock = deps.withPyramidLock ?? ((fn) => fn());
  await lock(async () => {
    if (!saved) {
      await deps.db.call('svc_set_art_tiles', {
        p_tiles: plan.map((c) => (c.restore_rev ? [GRID_LEVEL, c.gx, c.gy, Number(c.restore_rev), null] : [GRID_LEVEL, c.gx, c.gy, null])),
      });
    }
    await pyramidSteps(deps, plan.map((c) => [c.gx, c.gy] as CellTuple), saved?.pyramid ?? null, (py, need) => checkpoint({ stage: 'pyramid', plan, pyramid: py }, need));
    await deps.db.call('svc_mark_unpublished', { p_publication_id: publicationId, p_cells: plan });
  });
}

export async function clearCells(deps: PipelineDeps, cells: CellTuple[], saved?: CellsProgress | null, checkpoint: Checkpoint = () => {}) {
  const lock = deps.withPyramidLock ?? ((fn) => fn());
  await lock(async () => {
    if (!saved) await deps.db.call('svc_set_art_tiles', { p_tiles: cells.map(([gx, gy]) => [GRID_LEVEL, gx, gy, null]) });
    await pyramidSteps(deps, cells, saved?.pyramid ?? null, (py, need) => checkpoint({ stage: 'pyramid', pyramid: py }, need));
    await deps.db.call('svc_cells_cleared', { p_cells: cells });
  });
}

// ---- pyramid ------------------------------------------------------------------------

type PyramidProgress = { z: number; done: string[] };

/**
 * Rebuild every ancestor tile (z21 … ART_MIN_ZOOM) of the changed plots, one parent
 * at a time so the work can stop and resume between any two parents. Each parent is
 * the 2x box-filtered composite of its four children, read back from storage, so
 * murals stay continuous at every zoom and a phone only ever downloads ~one 256px
 * image per screen tile however large the artwork is.
 */
export async function pyramidSteps(deps: PipelineDeps, cells: CellTuple[], saved: PyramidProgress | null, checkpoint: (p: PyramidProgress, need?: number) => void) {
  const decoded = new Map<string, RGBA | null>();
  for (let z = saved?.z ?? GRID_LEVEL - 1; z >= ART_MIN_ZOOM; z--) {
    const shift = GRID_LEVEL - z;
    const parents = new Map<string, [number, number]>();
    for (const [gx, gy] of cells) parents.set(`${gx >> shift}/${gy >> shift}`, [gx >> shift, gy >> shift]);
    const done = new Set(saved && saved.z === z ? saved.done : []);
    const todo = [...parents.entries()].filter(([k]) => !done.has(k));
    if (!todo.length) continue;
    const childKeys: [number, number, number][] = [];
    for (const [, [px, py]] of todo) for (let k = 0; k < 4; k++) childKeys.push([z + 1, px * 2 + (k & 1), py * 2 + (k >> 1)]);
    const existing = await deps.db.call<number[][]>('svc_get_art_tiles', { p_tiles: childKeys });
    const revOf = new Map(existing.map((r) => [`${r[0]}/${r[1]}/${r[2]}`, Number(r[3])]));
    const loadChild = async (cz: number, cx: number, cy: number): Promise<RGBA | null> => {
      const key = `${cz}/${cx}/${cy}`;
      if (decoded.has(key)) return decoded.get(key)!;
      const rev = revOf.get(key);
      let img: RGBA | null = null;
      if (rev) {
        const bytes = await deps.store.get(BUCKETS.public, tilePath(cz, cx, cy, rev));
        if (bytes) img = await deps.codec.decode(bytes);
      }
      return img;
    };
    for (const [key, [px, py]] of todo) {
      const kids = await Promise.all([0, 1, 2, 3].map((k) => loadChild(z + 1, px * 2 + (k & 1), py * 2 + (k >> 1))));
      let img = kids.every((k) => !k) ? null : composeParent(kids);
      if (img && isTransparent(img)) img = null;
      if (img) {
        const [rev] = await deps.db.call<number[]>('svc_reserve_revs', { p_count: 1 });
        const png = await deps.codec.encodePng(img);
        await deps.store.put(BUCKETS.public, tilePath(z, px, py, Number(rev)), png, 'image/png');
        await deps.db.call('svc_set_art_tiles', { p_tiles: [[z, px, py, Number(rev), png.byteLength]] });
      } else {
        await deps.db.call('svc_set_art_tiles', { p_tiles: [[z, px, py, null]] });
      }
      decoded.set(`${z}/${px}/${py}`, img);
      done.add(key);
      checkpoint({ z, done: [...done] });
    }
  }
}

/** Rebuild the whole pyramid for some plots in one go (no budget). */
export async function rebuildPyramid(deps: PipelineDeps, cells: CellTuple[], _cache?: Map<string, RGBA | null>) {
  await pyramidSteps(deps, cells, null, () => {});
}
