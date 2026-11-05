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
import type { PlotKind, PlotRow } from '../backend/types';
import type { MapMode } from '../lib/store';
import { GRID_LEVEL, GRID_SIZE, type PlotTypeId } from '../shared/grid';
import { RARITY_ORDER, rarityInfo, type RarityId } from '../shared/rarity';
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
  // a rarity rim round every plot that isn't common (thicker and glowing as it gets rarer), and the owner's
  // outline; plots merged into one canvas share one outline round the outside, with no seams between them
  const look2 = makeLookup(blocks, lists);
  const lw = (m: boolean) => lerp(z, PLOTS_MIN_ZOOM, 0.5, GRID_LEVEL - 1, m ? 2.4 : 1.6) * SCALE;
  for (const r of rows) {
    const mine = r[4] ? 0 : 1;
    const join = cs >= 4 ? joinOf(r, look2) : NO_JOIN;
    const px = (r[0] - gx0) * cs, py = (r[1] - gy0) * cs;
    const hidden = opts.hidden && opts.hidden.gx === r[0] && opts.hidden.gy === r[1]; // still rolling
    const tier = hidden || r[6] ? 0 : tierOf(r[9]);
    const c: KCell = { gx: r[0], gy: r[1], px, py, cs, rc: '', glow: '', tier, join };
    if (tier && look.glow > 0 && cs >= 4) {
      const info = rarityInfo(r[9]);
      const w = Math.max(1, lerp(z, GRID_LEVEL - 3, 2, GRID_LEVEL, 6) * SCALE * (0.35 + tier * 0.12));
      if (tier >= 2) { ctx.globalAlpha = look.glow * (0.25 + tier * 0.08); ctx.strokeStyle = info.glow; ctx.lineWidth = w * 2.2; outerEdges(ctx, c, w * 1.1); }
      ctx.globalAlpha = look.glow * (0.55 + tier * 0.1); ctx.strokeStyle = info.color; ctx.lineWidth = w; outerEdges(ctx, c, w / 2);
    }
    const a = look.line[mine];
    if (!a) continue;
    const w = Math.min(lw(!!r[4]), cs / 3);
    ctx.globalAlpha = a;
    ctx.strokeStyle = r[4] ? '#FFFFFF' : r[8] || '#7B5CFF';
    ctx.lineWidth = w;
    outerEdges(ctx, c, w / 2);
  }
  const bmp = snapshot(canvas!);
  const took = performance.now() - started;
  stats.tiles++; stats.ms += took; stats.worst = Math.max(stats.worst, took);
  return bmp;
}

// ---- habitat plots: a little woodland drawn over the plot (above any old artwork) ----------
const hash = (x: number, y: number, k: number) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// ---- the special plot types, drawn to match each plot's rarity and fused across merges -----------------
// Every plot is drawn with its own rarity's colours (and rarer plots get more: lights, gold, crystals), and
// plots merged into one group draw as one place: the seams between them disappear, buildings, beds and roofs
// run straight across, the outline goes only round the outside, and the group gets one big centrepiece.
type Sides = { n: boolean; e: boolean; s: boolean; w: boolean };
type KCell = { gx: number; gy: number; px: number; py: number; cs: number; rc: string; glow: string; tier: number; join: Sides };
const NO_JOIN: Sides = { n: false, e: false, s: false, w: false };
const tierOf = (r: string | null | undefined) => Math.max(0, RARITY_ORDER.indexOf((r ?? 'common') as RarityId));
const NEUTRAL = { color: '#B9B4D6', glow: '#E6E2FF' };

/** The part of a plot a building fills: inset from its edges, except where it joins the next plot of its group. */
function inner(c: KCell, m: number) {
  const x0 = c.px + (c.join.w ? 0 : m), y0 = c.py + (c.join.n ? 0 : m);
  return { x0, y0, x1: c.px + c.cs - (c.join.e ? 0 : m), y1: c.py + c.cs - (c.join.s ? 0 : m) };
}
/** Stroke only the outside edges of a plot (inset by `i`). */
function outerEdges(ctx: CanvasRenderingContext2D, c: KCell, i: number) {
  const { px, py, cs, join } = c;
  ctx.beginPath();
  if (!join.n) { ctx.moveTo(px + (join.w ? 0 : i), py + i); ctx.lineTo(px + cs - (join.e ? 0 : i), py + i); }
  if (!join.s) { ctx.moveTo(px + (join.w ? 0 : i), py + cs - i); ctx.lineTo(px + cs - (join.e ? 0 : i), py + cs - i); }
  if (!join.w) { ctx.moveTo(px + i, py + (join.n ? 0 : i)); ctx.lineTo(px + i, py + cs - (join.s ? 0 : i)); }
  if (!join.e) { ctx.moveTo(px + cs - i, py + (join.n ? 0 : i)); ctx.lineTo(px + cs - i, py + cs - (join.s ? 0 : i)); }
  ctx.stroke();
}
/** The rarity rim round the outside of a plot (or a whole merged group): brighter and glowing as rarity goes up. */
function rarityRim(ctx: CanvasRenderingContext2D, c: KCell, base: string) {
  const w = Math.max(1, c.cs * (0.025 + c.tier * 0.006));
  ctx.lineCap = 'square';
  if (c.tier >= 2 && c.cs >= 8) { ctx.globalAlpha = 0.35 + c.tier * 0.1; ctx.strokeStyle = c.glow; ctx.lineWidth = w * 2.6; outerEdges(ctx, c, w * 1.3); }
  ctx.globalAlpha = 1; ctx.strokeStyle = c.tier ? c.rc : base; ctx.lineWidth = w; outerEdges(ctx, c, w / 2);
}
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r1: number, r2: number, pts = 5) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) { const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  ctx.closePath();
}
/** Sparkles on legendary plots, little crystals on mythic ones. */
function rareBits(ctx: CanvasRenderingContext2D, c: KCell) {
  if (c.tier < 3 || c.cs < 12) return;
  for (let i = 0; i < (c.tier === 4 ? 4 : 3); i++) {
    const x = c.px + c.cs * (0.12 + hash(c.gx, c.gy, 300 + i) * 0.76), y = c.py + c.cs * (0.12 + hash(c.gx, c.gy, 320 + i) * 0.76), r = c.cs * (0.03 + hash(c.gx, c.gy, 340 + i) * 0.025);
    ctx.globalAlpha = 0.9;
    if (c.tier === 4) { ctx.fillStyle = c.glow; ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = c.rc; ctx.globalAlpha = 0.6; ctx.fill(); }
    else { ctx.fillStyle = '#FFF4C2'; star(ctx, x, y, r * 1.6, r * 0.5, 4); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function habitatCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy } = c;
  const gr = ctx.createLinearGradient(px, py, px + cs, py + cs);
  gr.addColorStop(0, c.tier === 4 ? '#7BD6A0' : '#6CC463'); gr.addColorStop(1, c.tier >= 3 ? '#4AA35A' : '#3E9A4C');
  ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = c.rc; ctx.globalAlpha = 0.5; ctx.fillRect(px + cs * 0.35, py + cs * 0.35, cs * 0.3, cs * 0.3); ctx.globalAlpha = 1; return; }
  if (hash(gx, gy, 1) < 0.45 && cs >= 10) {
    const cx = px + cs * (0.3 + hash(gx, gy, 2) * 0.4), cy = py + cs * (0.35 + hash(gx, gy, 3) * 0.3);
    ctx.fillStyle = '#B9A675'; ctx.beginPath(); ctx.ellipse(cx, cy, cs * 0.2, cs * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.tier === 4 ? '#7FE0FF' : '#3EA0DA'; ctx.beginPath(); ctx.ellipse(cx, cy, cs * 0.17, cs * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(cx - cs * 0.05, cy - cs * 0.03, cs * 0.05, cs * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  }
  // flowers in the plot's rarity colours
  if (cs >= 16) for (let i = 0; i < 8 + c.tier * 2; i++) {
    ctx.fillStyle = i % 3 === 0 ? c.rc : ['#FFE14D', '#FFFFFF', c.glow][i % 3];
    ctx.beginPath(); ctx.arc(px + hash(gx, gy, 20 + i) * cs, py + hash(gx, gy, 40 + i) * cs, Math.max(0.8, cs * 0.018), 0, Math.PI * 2); ctx.fill();
  }
  const n = cs >= 24 ? 6 : 3;
  const trees = Array.from({ length: n }, (_, i) => ({ x: px + cs * (0.08 + hash(gx, gy, 60 + i) * 0.84), y: py + cs * (0.14 + hash(gx, gy, 80 + i) * 0.8), r: cs * (0.07 + hash(gx, gy, 100 + i) * 0.05), k: hash(gx, gy, 120 + i) }))
    .sort((a, b) => a.y - b.y);
  trees.forEach((t, i) => {
    ctx.fillStyle = 'rgba(10,40,20,0.3)'; ctx.beginPath(); ctx.ellipse(t.x, t.y + t.r * 0.9, t.r, t.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // legendary habitats have a golden tree, mythic ones a blossom tree in the rarity colour
    const special = c.tier >= 3 && i === n - 1;
    if (t.k < 0.5 && !special) { ctx.fillStyle = '#1F6B3C'; ctx.beginPath(); ctx.moveTo(t.x - t.r, t.y + t.r * 0.8); ctx.lineTo(t.x, t.y - t.r * 1.6); ctx.lineTo(t.x + t.r, t.y + t.r * 0.8); ctx.fill(); }
    else {
      ctx.fillStyle = special ? (c.tier === 4 ? c.rc : '#E0A82E') : '#2C7A3A'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * (special ? 1.25 : 1), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = special ? c.glow : '#4FA552'; ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  });
  rareBits(ctx, c);
}
function farmCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#7CC95A'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#8A5A34'; ctx.fillRect(px + cs * 0.15, py + cs * 0.15, cs * 0.7, cs * 0.7); return; }
  // golden crops on legendary farms, glowing ones in the rarity colour on mythic farms
  const crops = c.tier >= 4 ? [c.rc, c.glow, '#FFFFFF'] : c.tier === 3 ? ['#FFD84D', '#F5C842', '#FFE9A8'] : ['#FF8A3D', '#E8433A', '#F5C842', '#7BD957', '#FF4D6D', '#F08A24'];
  const m = cs * 0.1, b = inner(c, m);
  const rows = cs >= 24 ? 4 : 3, rh = (cs - m * 2) / rows;
  for (let r = 0; r < rows; r++) {
    const y = py + m + r * rh;
    // beds run right across into the next plot of the same farm
    ctx.fillStyle = '#8A5A34'; ctx.fillRect(b.x0, y + rh * 0.12, b.x1 - b.x0, rh * 0.76);
    ctx.fillStyle = '#6E4426'; ctx.fillRect(b.x0, y + rh * 0.45, b.x1 - b.x0, Math.max(0.6, rh * 0.08));
    if (cs >= 10) {
      const col = crops[Math.floor(hash(gx, gy, 10 + r) * crops.length)];
      const w = b.x1 - b.x0, n = Math.max(3, Math.floor(w / Math.max(3, cs * 0.09)));
      for (let i = 0; i < n; i++) { ctx.fillStyle = i % 3 === 0 ? '#3E9A44' : col; ctx.beginPath(); ctx.arc(b.x0 + (i + 0.5) * (w / n), y + rh * 0.42, Math.max(0.8, rh * 0.18), 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // the gaps between the rows of two merged plots get a path
  if (c.join.s && cs >= 10) { ctx.fillStyle = '#C9A46A'; ctx.fillRect(b.x0, py + cs - m, b.x1 - b.x0, m * 2); }
  // a fence in the rarity colour round the outside
  ctx.strokeStyle = c.tier ? c.rc : 'rgba(176,122,71,0.95)'; ctx.lineWidth = Math.max(1, cs * 0.025);
  outerEdges(ctx, c, cs * 0.035);
  if (cs >= 16) {
    ctx.fillStyle = c.tier ? c.rc : '#B07A47';
    const post = Math.max(1, cs * 0.04);
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      if (!c.join.n) ctx.fillRect(px + k * (cs - post), py + cs * 0.035 - post / 2, post, post);
      if (!c.join.s) ctx.fillRect(px + k * (cs - post), py + cs - cs * 0.035 - post / 2, post, post);
      if (!c.join.w) ctx.fillRect(px + cs * 0.035 - post / 2, py + k * (cs - post), post, post);
      if (!c.join.e) ctx.fillRect(px + cs - cs * 0.035 - post / 2, py + k * (cs - post), post, post);
    }
  }
  rareBits(ctx, c);
}
function businessCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#D9D2C4'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = c.tier ? c.rc : '#FFE14D'; ctx.fillRect(px + cs * 0.2, py + cs * 0.2, cs * 0.6, cs * 0.6); return; }
  const m = cs * 0.1, tower = c.tier >= 2 || (hash(gx, gy, 3) < 0.35 && cs >= 14);
  // one long building across the whole merged business (its roof runs over the seams)
  const b = inner(c, m), roofH = cs * (tower ? 0.62 : 0.5);
  const y1 = c.join.s ? py + cs : py + m + roofH;
  ctx.fillStyle = c.tier >= 3 ? '#F4E3B0' : tower ? '#5FB8FF' : '#ECE6DA';
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, y1 - b.y0);
  if (tower) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; for (let i = 1; i < 4; i++) ctx.fillRect(b.x0, py + m + (roofH * i) / 4, b.x1 - b.x0, Math.max(0.6, cs * 0.02)); }
  // roof trim in the rarity colour (gold on legendary, glowing on mythic)
  ctx.strokeStyle = c.tier >= 3 ? (c.tier === 4 ? c.rc : '#E0A82E') : c.rc; ctx.lineWidth = Math.max(1, cs * (0.02 + c.tier * 0.006));
  if (c.tier === 4) { ctx.shadowColor = c.glow; ctx.shadowBlur = cs * 0.12; }
  ctx.beginPath();
  if (!c.join.n) { ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y0); }
  if (!c.join.w) { ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x0, y1); }
  if (!c.join.e) { ctx.moveTo(b.x1, b.y0); ctx.lineTo(b.x1, y1); }
  if (!c.join.s) { ctx.moveTo(b.x0, y1); ctx.lineTo(b.x1, y1); }
  ctx.stroke(); ctx.shadowBlur = 0;
  // a striped awning (the rarity colour and white) along the front
  if (cs >= 10 && !c.join.s) {
    const n = 6, aw = (b.x1 - b.x0) / n;
    for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#FFFFFF' : c.tier ? c.rc : '#E8433A'; ctx.fillRect(b.x0 + i * aw, y1, aw + 0.5, cs * 0.1); }
    if (!tower) { ctx.fillStyle = '#E2B46B'; ctx.fillRect(px + cs * 0.38, py + cs * 0.76, cs * 0.24, cs * 0.12); ctx.fillStyle = '#FFE14D'; ctx.beginPath(); ctx.arc(px + cs * 0.5, py + cs * 0.74, Math.max(1, cs * 0.05), 0, Math.PI * 2); ctx.fill(); }
  }
  rareBits(ctx, c);
}
function arcadeCell(ctx: CanvasRenderingContext2D, c: KCell, t = 0) {
  const { px, py, cs } = c, neon = c.rc;
  ctx.globalAlpha = 1; ctx.fillStyle = '#140F2A'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = neon; ctx.fillRect(px + cs * 0.25, py + cs * 0.25, cs * 0.5, cs * 0.5); return; }
  const m = cs * 0.1, b = inner(c, m);
  const roofBottom = c.join.s ? py + cs : py + m + cs * 0.62;
  // one big roof across the whole merged arcade
  const gr = ctx.createLinearGradient(b.x0, b.y0, b.x1, roofBottom);
  gr.addColorStop(0, '#2A2058'); gr.addColorStop(1, '#1A1440');
  ctx.fillStyle = gr; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, roofBottom - b.y0);
  // roof vents / tiles, plus neon in the rarity colour round the outside of the roof
  if (cs >= 14) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 3; i++) ctx.fillRect(b.x0, py + m + cs * (0.12 + i * 0.18), b.x1 - b.x0, Math.max(0.6, cs * 0.015)); }
  const lw = Math.max(1, cs * (0.035 + c.tier * 0.006));
  ctx.strokeStyle = neon; ctx.lineWidth = lw; ctx.shadowColor = neon; ctx.shadowBlur = cs * (0.1 + c.tier * 0.04); ctx.lineCap = 'round';
  ctx.beginPath();
  if (!c.join.n) { ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y0); }
  if (!c.join.w) { ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x0, roofBottom); }
  if (!c.join.e) { ctx.moveTo(b.x1, b.y0); ctx.lineTo(b.x1, roofBottom); }
  if (!c.join.s) { ctx.moveTo(b.x0, roofBottom); ctx.lineTo(b.x1, roofBottom); }
  ctx.stroke();
  // epic and up: a second inner neon line in the rarity's glow colour
  if (c.tier >= 2 && cs >= 12) { ctx.strokeStyle = c.glow; ctx.lineWidth = lw * 0.5; ctx.shadowBlur = 0; ctx.globalAlpha = 0.8;
    const i2 = lw * 2.2; ctx.beginPath();
    if (!c.join.n) { ctx.moveTo(b.x0 + (c.join.w ? 0 : i2), b.y0 + i2); ctx.lineTo(b.x1 - (c.join.e ? 0 : i2), b.y0 + i2); }
    if (!c.join.w) { ctx.moveTo(b.x0 + i2, b.y0 + (c.join.n ? 0 : i2)); ctx.lineTo(b.x0 + i2, roofBottom - (c.join.s ? 0 : i2)); }
    if (!c.join.e) { ctx.moveTo(b.x1 - i2, b.y0 + (c.join.n ? 0 : i2)); ctx.lineTo(b.x1 - i2, roofBottom - (c.join.s ? 0 : i2)); }
    ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.shadowBlur = 0;
  // the front of the building: a marquee in the rarity colour and a row of bulbs (more bulbs, more rare)
  if (cs >= 10 && !c.join.s) {
    // one long marquee along the whole front of a merged arcade
    const mx0 = c.join.w ? px : b.x0 + (b.x1 - b.x0) * 0.12, mx1 = c.join.e ? px + cs : b.x1 - (b.x1 - b.x0) * 0.12;
    ctx.fillStyle = neon; ctx.fillRect(mx0, roofBottom, mx1 - mx0, cs * 0.1);
    const nb = 5 + c.tier;
    for (let i = 0; i < nb; i++) {
      ctx.fillStyle = (i + Math.floor(t)) % 2 && c.tier >= 1 ? c.glow : '#FFE9A8';
      ctx.beginPath(); ctx.arc(b.x0 + (b.x1 - b.x0) * (0.14 + (i / (nb - 1)) * 0.72), roofBottom + cs * 0.16, Math.max(0.6, cs * 0.02), 0, Math.PI * 2); ctx.fill();
    }
  }
  rareBits(ctx, c);
}
const CELL_DRAW: Partial<Record<PlotKind, (ctx: CanvasRenderingContext2D, c: KCell) => void>> = { habitat: habitatCell, farm: farmCell, business: businessCell, arcade: arcadeCell };
const RIM_BASE: Partial<Record<PlotKind, string>> = { habitat: 'rgba(255,255,255,0.45)', farm: 'rgba(176,122,71,0.9)', business: 'rgba(212,165,0,0.9)', arcade: 'rgba(255,61,154,0.9)' };

/** One centrepiece for a whole plot or merged group (drawn in every tile it reaches, so it spans them). */
function centrepiece(ctx: CanvasRenderingContext2D, kind: PlotKind, x0: number, y0: number, x1: number, y1: number, rc: string, glow: string, tier: number, seed: number) {
  const w = x1 - x0, h = y1 - y0, s = Math.min(w, h), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (s < 10) return;
  ctx.save(); ctx.globalAlpha = 1;
  if (kind === 'arcade') {
    // a big joystick star on the roof, in gold (rarity colour on mythic), with the rarity's glow
    const r1 = s * 0.14, my = y0 + h * 0.38;
    ctx.shadowColor = glow; ctx.shadowBlur = s * (0.08 + tier * 0.04);
    ctx.fillStyle = tier === 4 ? rc : '#FFE14D'; star(ctx, cx, my, r1, r1 * 0.42); ctx.fill();
    ctx.shadowBlur = 0;
    if (s >= 60) { ctx.font = `900 ${Math.round(s * 0.11)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = rc; ctx.shadowColor = rc; ctx.shadowBlur = s * 0.08; ctx.fillText('ARCADE', cx, my + r1 * 1.75); ctx.shadowBlur = 0; }
  } else if (kind === 'business') {
    // a rooftop sign with the rarity colour round it
    const r = s * 0.13, my = y0 + h * 0.3;
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(cx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.25); ctx.strokeStyle = tier >= 3 ? '#E0A82E' : rc; ctx.stroke();
    ctx.font = `${Math.round(r * 1.2)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tier >= 3 ? '🏦' : tier >= 2 ? '🏢' : '🍋', cx, my + r * 0.08);
  } else if (kind === 'farm') {
    // a barn and silo, with a rarity-coloured weathervane
    const bw = s * 0.28, bh = s * 0.22, bx = cx - bw / 2, by = y0 + h * 0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(bx + bw * 0.08, by + bh * 0.4, bw, bh * 0.7);
    ctx.fillStyle = '#C8352C'; ctx.fillRect(bx, by + bh * 0.3, bw, bh * 0.7);
    ctx.fillStyle = '#6B2A22'; ctx.beginPath(); ctx.moveTo(bx - bw * 0.08, by + bh * 0.32); ctx.lineTo(bx + bw / 2, by); ctx.lineTo(bx + bw * 1.08, by + bh * 0.32); ctx.fill();
    ctx.fillStyle = '#F5EEDC'; ctx.fillRect(bx + bw * 0.38, by + bh * 0.62, bw * 0.24, bh * 0.38);
    ctx.fillStyle = '#C9CED8'; ctx.beginPath(); ctx.arc(bx + bw * 1.25, by + bh * 0.45, bw * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tier ? rc : '#FFE14D'; star(ctx, bx + bw / 2, by - bh * 0.05, bw * 0.09, bw * 0.04, 4); ctx.fill();
  } else if (kind === 'habitat') {
    // a lake in the middle of a big sanctuary (a crystal spring on mythic ones)
    const rx = w * 0.22, ry = h * 0.16;
    ctx.fillStyle = '#B9A675'; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.12, ry * 1.18, 0, 0, Math.PI * 2); ctx.fill();
    const lg = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
    lg.addColorStop(0, tier === 4 ? glow : '#7FD3FF'); lg.addColorStop(1, tier === 4 ? rc : '#2F8FD0');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = glow; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, s * 0.01); ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.6, ry * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    if (tier >= 3) { ctx.fillStyle = tier === 4 ? glow : '#FFE14D'; star(ctx, cx + rx * 0.2, cy - ry * 0.2, s * 0.04, s * 0.015, 4); ctx.fill(); }
  }
  void seed;
  ctx.restore();
}

/** Look up which group a plot belongs to (from the loaded blocks; null if unknown or unowned). */
function makeLookup(blocks: PlotBlocks, lists: PlotRow[][]) {
  const at = new Map<number, PlotRow>();
  const key = (x: number, y: number) => (((x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE) * GRID_SIZE + y;
  for (const l of lists) for (const r of l) at.set(key(r[0], r[1]), r);
  const peeked = new Set<string>();
  return (x: number, y: number): PlotRow | undefined => {
    const k = key(x, y);
    const hit = at.get(k);
    if (hit || y < 0 || y >= GRID_SIZE) return hit;
    const wx = ((x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE, bk = `${wx >> BLOCK_SHIFT}_${y >> BLOCK_SHIFT}`;
    if (peeked.has(bk)) return undefined;
    peeked.add(bk);
    for (const r of blocks.peek(wx >> BLOCK_SHIFT, y >> BLOCK_SHIFT) ?? []) at.set(key(r[0], r[1]), r);
    return at.get(k);
  };
}
const joinOf = (r: PlotRow, look: (x: number, y: number) => PlotRow | undefined): Sides => {
  if (!r[5]) return NO_JOIN;
  const same = (x: number, y: number) => look(x, y)?.[5] === r[5];
  return { n: same(r[0], r[1] - 1), e: same(r[0] + 1, r[1]), s: same(r[0], r[1] + 1), w: same(r[0] - 1, r[1]) };
};

/** Draw one habitat plot on its own (used by the plot-type picker's preview). */
export function drawHabitatPlot(ctx: CanvasRenderingContext2D, gx: number, gy: number, px: number, py: number, cs: number, _accent: string) {
  const c: KCell = { gx, gy, px, py, cs, rc: '#3DDC97', glow: '#A6FFD6', tier: 0, join: NO_JOIN };
  habitatCell(ctx, c); rarityRim(ctx, c, 'rgba(255,255,255,0.35)');
}

async function drawHabitatTile(blocks: PlotBlocks, z: number, x: number, y: number, opts?: PlotTileOpts): Promise<ImageBitmap | ArrayBuffer | null> {
  const shift = GRID_LEVEL - z;
  if (shift < 0) return null;
  const gx0 = x << shift, gy0 = y << shift, n = 1 << shift;
  const bx0 = gx0 >> BLOCK_SHIFT, by0 = gy0 >> BLOCK_SHIFT, bn = Math.max(1, n >> BLOCK_SHIFT);
  const lists: PlotRow[][] = [];
  for (let by = by0; by < by0 + bn; by++) for (let bx = bx0; bx < bx0 + bn; bx++) lists.push(await blocks.get(bx, by));
  const rows = lists.flat().filter((r) => r[11] && r[11] !== 'canvas' && CELL_DRAW[r[11]] && r[0] >= gx0 && r[0] < gx0 + n && r[1] >= gy0 && r[1] < gy0 + n);
  if (!rows.length) return null;
  const cs = PX / n;
  const ctx = ctx2d();
  const look = makeLookup(blocks, lists);
  const cells: { r: PlotRow; c: KCell }[] = [];
  for (const r of rows) {
    const hidden = opts?.hidden && opts.hidden.gx === r[0] && opts.hidden.gy === r[1]; // still rolling: no rarity yet
    const info = hidden ? NEUTRAL : rarityInfo(r[9]);
    const c: KCell = { gx: r[0], gy: r[1], px: (r[0] - gx0) * cs, py: (r[1] - gy0) * cs, cs, rc: info.color, glow: info.glow, tier: hidden ? 0 : tierOf(r[9]), join: cs >= 6 ? joinOf(r, look) : NO_JOIN };
    CELL_DRAW[r[11]!]!(ctx, c);
    cells.push({ r, c });
  }
  // one centrepiece per plot or merged group, centred on the whole group (it may reach over several tiles)
  if (cs >= 6) {
    const done = new Set<string>();
    for (const { r } of cells) {
      const id = r[5] ?? `${r[0]},${r[1]}`;
      if (done.has(id)) continue;
      done.add(id);
      // the group's extent and its rarest plot, from what's loaded around here
      let x0 = r[0], y0 = r[1], x1 = r[0], y1 = r[1], best = r;
      if (r[5]) {
        const seen = new Set<string>([`${r[0]},${r[1]}`]), queue: [number, number][] = [[r[0], r[1]]];
        while (queue.length && seen.size < 400) {
          const [qx, qy] = queue.pop()!;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = qx + dx, ny = qy + dy, k = `${nx},${ny}`;
            if (seen.has(k)) continue;
            const nr = look(nx, ny);
            if (nr?.[5] !== r[5]) continue;
            seen.add(k); queue.push([nx, ny]);
            x0 = Math.min(x0, nx); y0 = Math.min(y0, ny); x1 = Math.max(x1, nx); y1 = Math.max(y1, ny);
            if (tierOf(nr[9]) > tierOf(best[9])) best = nr;
          }
        }
      }
      const hidden = opts?.hidden && seenHidden(opts.hidden, x0, y0, x1, y1);
      const info = hidden ? NEUTRAL : rarityInfo(best[9]);
      centrepiece(ctx, r[11]!, (x0 - gx0) * cs, (y0 - gy0) * cs, (x1 + 1 - gx0) * cs, (y1 + 1 - gy0) * cs, info.color, info.glow, hidden ? 0 : tierOf(best[9]), hash(x0, y0, 9));
    }
  }
  // the rarity rim round the outside of every plot / merged group
  for (const { r, c } of cells) rarityRim(ctx, c, RIM_BASE[r[11]!] ?? '#fff');
  return snapshot(canvas!);
}
const seenHidden = (h: { gx: number; gy: number }, x0: number, y0: number, x1: number, y1: number) => h.gx >= x0 && h.gx <= x1 && h.gy >= y0 && h.gy <= y1;

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
  addProtocol('lvhab', async (params) => {
    const m = /^lvhab:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return { data: new ArrayBuffer(0) };
    try {
      const img = await drawHabitatTile(blocks, Number(m[1]), Number(m[2]), Number(m[3]), opts());
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
