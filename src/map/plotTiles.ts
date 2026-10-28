// Owned plots and the plot grid, drawn as map image tiles (custom protocols
// lvplots:// and lvgrid://) instead of GeoJSON.
//
// Why: GeoJSON had to be rebuilt and re-tiled for the whole viewport after every
// pan, which got slower with every plot in view and made phones stutter. Tiles
// are drawn once from small cached 64x64-plot blocks, MapLibre keeps them on the
// GPU, and panning only ever loads the edges it hasn't drawn yet. The cost of a
// frame no longer depends on how many plots or players exist.
import { addProtocol } from 'maplibre-gl';
import { api } from '../backend/api';
import { config } from '../env';
import type { PlotRow } from '../backend/types';
import type { MapMode } from '../lib/store';
import { GRID_LEVEL, GRID_SIZE, type PlotTypeId } from '../shared/grid';
import { rarities } from '../shared/rarity';
import { PLOT_TYPES, drawPlotDesign } from './plotStyle';

const BLOCK_SHIFT = 6; // 64x64 plots per block (matches world_plots.bx/by)
const BLOCKS = GRID_SIZE >> BLOCK_SHIFT;
/** Zoom where owned plots start to be drawn (each ~3 px). */
export const PLOTS_MIN_ZOOM = GRID_LEVEL - 6.5;
/** Every plot square appears (~18 px); faint grid lines a little before that. */
export const CELLS_MIN_ZOOM = GRID_LEVEL - 3.8;
export const GRIDLINES_MIN_ZOOM = GRID_LEVEL - 4.8;

// tiles are drawn at 2x on high-density screens so lines stay crisp
const SCALE = typeof devicePixelRatio === 'number' && devicePixelRatio >= 1.5 ? 2 : 1;
const PX = 256 * SCALE;

// ---- block cache -------------------------------------------------------------------

export class PlotBlocks {
  private blocks = new Map<string, PlotRow[]>();
  private inflight = new Map<string, Promise<PlotRow[]>>();
  private queue = new Map<string, { resolve(r: PlotRow[]): void; reject(e: unknown): void }[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private max = 1500;

  get(bx: number, by: number): Promise<PlotRow[]> {
    const k = `${bx}_${by}`;
    const hit = this.blocks.get(k);
    if (hit) {
      this.blocks.delete(k); // keep recently used blocks last
      this.blocks.set(k, hit);
      return Promise.resolve(hit);
    }
    const existing = this.inflight.get(k);
    if (existing) return existing;
    const p = new Promise<PlotRow[]>((resolve, reject) => {
      const list = this.queue.get(k) ?? [];
      list.push({ resolve, reject });
      this.queue.set(k, list);
      this.timer ??= setTimeout(() => void this.flush(), 16);
    });
    this.inflight.set(k, p);
    return p;
  }

  /** The cached rows of a block, if it has been loaded. */
  peek(bx: number, by: number) {
    return this.blocks.get(`${bx}_${by}`);
  }

  private async flush() {
    this.timer = null;
    const pending = [...this.queue.entries()];
    this.queue.clear();
    for (let i = 0; i < pending.length; i += 64) {
      const chunk = pending.slice(i, i + 64);
      try {
        const res = await api.plotBlocks(chunk.map(([k]) => k.split('_').map(Number) as [number, number]));
        for (const [k, waiters] of chunk) {
          const rows = res[k] ?? [];
          this.blocks.set(k, rows);
          this.inflight.delete(k);
          waiters.forEach((w) => w.resolve(rows));
        }
        while (this.blocks.size > this.max) this.blocks.delete(this.blocks.keys().next().value!);
      } catch (e) {
        for (const [k, waiters] of chunk) {
          this.inflight.delete(k);
          waiters.forEach((w) => w.reject(e));
        }
      }
    }
  }

  /** Forget blocks touching a plot range (unwrapped gx allowed). */
  invalidate(minGx: number, minGy: number, maxGx: number, maxGy: number) {
    if (maxGx - minGx >= GRID_SIZE - 1) return this.reset();
    for (let by = Math.max(0, minGy) >> BLOCK_SHIFT; by <= Math.min(GRID_SIZE - 1, maxGy) >> BLOCK_SHIFT; by++)
      for (let bx = minGx >> BLOCK_SHIFT; bx <= maxGx >> BLOCK_SHIFT; bx++) {
        const k = `${((bx % BLOCKS) + BLOCKS) % BLOCKS}_${by}`;
        this.blocks.delete(k);
      }
  }

  reset() {
    this.blocks.clear();
  }

  /** Owned plots in a range (loads missing blocks; at most `maxBlocks` of them). */
  async rowsIn(minGx: number, minGy: number, maxGx: number, maxGy: number, maxBlocks = 64): Promise<PlotRow[]> {
    const want: [number, number][] = [];
    for (let by = Math.max(0, minGy) >> BLOCK_SHIFT; by <= Math.min(GRID_SIZE - 1, maxGy) >> BLOCK_SHIFT; by++)
      for (let bx = minGx >> BLOCK_SHIFT; bx <= maxGx >> BLOCK_SHIFT; bx++) want.push([((bx % BLOCKS) + BLOCKS) % BLOCKS, by]);
    if (want.length > maxBlocks) return [];
    const wrap = (x: number) => ((x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
    const x0 = wrap(minGx), span = maxGx - minGx;
    const lists = await Promise.all(want.map(([bx, by]) => this.get(bx, by)));
    return lists.flat().filter((r) => r[1] >= minGy && r[1] <= maxGy && wrap(r[0] - x0) <= span);
  }
}

// ---- drawing ------------------------------------------------------------------------

type Look = { fill: [number, number]; pattern: [number, number]; line: [number, number]; glow: number };
// [mine, others] opacities per map mode (the same looks the GeoJSON layers had)
const LOOKS: Record<MapMode, Look> = {
  atlas: { fill: [0.55, 0.38], pattern: [0.55, 0.55], line: [0.9, 0.9], glow: 0.6 },
  canvas: { fill: [0.15, 0.15], pattern: [0.2, 0.2], line: [0, 0], glow: 0 },
  discovery: { fill: [0.5, 0.5], pattern: [0.7, 0.7], line: [1, 1], glow: 0.6 },
  land: { fill: [0.7, 0.1], pattern: [0.8, 0.1], line: [1, 0.15], glow: 0.6 },
};

let patterns: Map<string, CanvasPattern> | null = null;
function patternFor(ctx: CanvasRenderingContext2D, type: string) {
  if (!patterns) {
    patterns = new Map();
    for (const t of Object.keys(PLOT_TYPES) as PlotTypeId[]) {
      // 64 px art repeating every 32 css px, like the old fill-pattern at pixelRatio 2
      const size = 32 * SCALE;
      const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
      drawPlotDesign(c.getContext('2d')!, t, size, 11, 1);
      const p = ctx.createPattern(c, 'repeat');
      if (p) patterns.set(t, p);
    }
  }
  return patterns.get(type) ?? null;
}

const lerp = (z: number, z0: number, v0: number, z1: number, v1: number) => (z <= z0 ? v0 : z >= z1 ? v1 : v0 + ((v1 - v0) * (z - z0)) / (z1 - z0));

let canvas: HTMLCanvasElement | null = null;
/** The canvas as something MapLibre can upload: an ImageBitmap, or PNG bytes on browsers without one. */
function snapshot(c: HTMLCanvasElement): Promise<ImageBitmap | ArrayBuffer> {
  // both calls copy the pixels right away, so the shared canvas can be reused at once
  if (typeof createImageBitmap === 'function') return createImageBitmap(c);
  return new Promise<Blob | null>((res) => c.toBlob(res, 'image/png')).then((b) => (b ? b.arrayBuffer() : new ArrayBuffer(0)));
}
function ctx2d() {
  canvas ??= Object.assign(document.createElement('canvas'), { width: PX, height: PX }); // plain canvas: OffscreenCanvas 2D needs Safari 16.4+
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, PX, PX);
  ctx.globalAlpha = 1;
  return ctx;
}

export type PlotTileOpts = { mode: MapMode; hidden: { gx: number; gy: number } | null };

const stats = { tiles: 0, ms: 0, worst: 0 };
if (config.e2e) (window as any).__lvPlotTiles = stats; // benchmark readout (tests only)

async function drawPlotTile(blocks: PlotBlocks, z: number, x: number, y: number, opts: PlotTileOpts, _t0 = 0): Promise<ImageBitmap | ArrayBuffer | null> {
  const shift = GRID_LEVEL - z; // plots per tile edge = 2^shift
  if (shift < 0) return null;
  const gx0 = x << shift, gy0 = y << shift, n = 1 << shift;
  const bx0 = gx0 >> BLOCK_SHIFT, by0 = gy0 >> BLOCK_SHIFT, bn = Math.max(1, n >> BLOCK_SHIFT);
  const lists: PlotRow[][] = [];
  for (let by = by0; by < by0 + bn; by++) for (let bx = bx0; bx < bx0 + bn; bx++) lists.push(await blocks.get(bx, by));
  const rows = lists.flat().filter((r) => r[0] >= gx0 && r[0] < gx0 + n && r[1] >= gy0 && r[1] < gy0 + n);
  if (!rows.length) return null;
  const started = performance.now();
  const cs = PX / n; // canvas pixels per plot
  const look = LOOKS[opts.mode] ?? LOOKS.atlas;
  const ctx = ctx2d();
  const pat = cs >= 12 * SCALE;
  for (const r of rows) {
    if (r[6]) continue; // plots with art show only their art
    const px = (r[0] - gx0) * cs, py = (r[1] - gy0) * cs, mine = r[4] ? 0 : 1;
    ctx.globalAlpha = look.fill[mine];
    ctx.fillStyle = r[8] || '#7B5CFF';
    ctx.fillRect(px, py, cs, cs);
    if (pat) {
      const p = patternFor(ctx, r[2]);
      if (p) {
        ctx.globalAlpha = look.pattern[mine];
        ctx.fillStyle = p;
        ctx.fillRect(px, py, cs, cs);
      }
    }
  }
  // the rare ones glow
  if (look.glow > 0 && cs >= 4) {
    const glow = new Map(rarities().map((r) => [r.id, r.glow]));
    const w = Math.max(1.5, lerp(z, GRID_LEVEL - 3, 3, GRID_LEVEL, 9) * SCALE * 0.6);
    for (const r of rows) {
      if (r[6] || (r[9] !== 'legendary' && r[9] !== 'mythic')) continue;
      if (opts.hidden && opts.hidden.gx === r[0] && opts.hidden.gy === r[1]) continue; // still rolling
      const px = (r[0] - gx0) * cs, py = (r[1] - gy0) * cs;
      ctx.strokeStyle = glow.get(r[9]) ?? '#fff';
      ctx.globalAlpha = look.glow * 0.45;
      ctx.lineWidth = w;
      ctx.strokeRect(px + w / 2, py + w / 2, cs - w, cs - w);
      ctx.globalAlpha = look.glow * 0.7;
      ctx.lineWidth = w / 2.5;
      ctx.strokeRect(px + w / 2, py + w / 2, cs - w, cs - w);
    }
  }
  // outlines (owner colour; white for your own)
  const lw = (m: boolean) => lerp(z, PLOTS_MIN_ZOOM, 0.5, GRID_LEVEL - 1, m ? 2.4 : 1.6) * SCALE;
  for (const r of rows) {
    const mine = r[4] ? 0 : 1;
    const a = look.line[mine];
    if (!a) continue;
    const w = Math.min(lw(!!r[4]), cs / 3);
    const px = (r[0] - gx0) * cs, py = (r[1] - gy0) * cs;
    ctx.globalAlpha = a;
    ctx.strokeStyle = r[4] ? '#FFFFFF' : r[8] || '#7B5CFF';
    ctx.lineWidth = w;
    ctx.strokeRect(px + w / 2, py + w / 2, cs - w, cs - w);
  }
  const bmp = snapshot(canvas!);
  const took = performance.now() - started;
  stats.tiles++; stats.ms += took; stats.worst = Math.max(stats.worst, took);
  return bmp;
}

// every grid tile at a zoom looks the same (plots line up with tiles), so draw it once per zoom
const gridImages = new Map<number, Promise<ImageBitmap | ArrayBuffer>>();
function gridTile(z: number): Promise<ImageBitmap | ArrayBuffer> | null {
  const shift = GRID_LEVEL - z;
  if (shift < 0 || shift > 6) return null;
  let p = gridImages.get(z);
  if (!p) {
    const ctx = ctx2d();
    const n = 1 << shift, cs = PX / n;
    const cells = z + 0.5 >= CELLS_MIN_ZOOM;
    if (cells) {
      // unclaimed plots: a faint, identical square each — what's inside is a surprise until claimed
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(0, 0, PX, PX);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = lerp(z, CELLS_MIN_ZOOM, 0.12, GRID_LEVEL - 2, 0.3);
      ctx.lineWidth = Math.max(1, lerp(z, CELLS_MIN_ZOOM, 0.5, GRID_LEVEL, 1.4) * SCALE);
    } else {
      ctx.strokeStyle = '#c7b8ff';
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = Math.max(1, 0.6 * SCALE);
    }
    ctx.beginPath();
    // each tile draws its top and left edges; neighbours supply the rest
    for (let i = 0; i < n; i++) {
      const o = i * cs + ctx.lineWidth / 2;
      ctx.moveTo(o, 0); ctx.lineTo(o, PX);
      ctx.moveTo(0, o); ctx.lineTo(PX, o);
    }
    ctx.stroke();
    p = snapshot(canvas!);
    gridImages.set(z, p);
  }
  return p;
}

// ---- protocols ------------------------------------------------------------------------

let registered = false;
export function registerPlotProtocols(blocks: PlotBlocks, opts: () => PlotTileOpts) {
  if (registered) return;
  registered = true;
  addProtocol('lvplots', async (params) => {
    const m = /^lvplots:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return { data: new ArrayBuffer(0) };
    try {
      const t0 = performance.now();
      const img = await drawPlotTile(blocks, Number(m[1]), Number(m[2]), Number(m[3]), opts(), t0);
      return { data: (img ?? new ArrayBuffer(0)) as any };
    } catch {
      return { data: new ArrayBuffer(0) };
    }
  });
  addProtocol('lvgrid', async (params) => {
    const m = /^lvgrid:\/\/(\d+)\//.exec(params.url);
    const img = m ? gridTile(Number(m[1])) : null;
    const data = img ? await img : new ArrayBuffer(0);
    return { data: (data instanceof ArrayBuffer ? data.slice(0) : data) as any };
  });
}
