// Owned plots and the plot grid, drawn as map image tiles (custom protocols
// lvplots://, which draws the plot grid too) instead of GeoJSON.
//
// Why: GeoJSON had to be rebuilt and re-tiled for the whole viewport after every
// pan, which got slower with every plot in view and made phones stutter. Tiles
// are drawn once from small cached 64x64-plot blocks, MapLibre keeps them on the
// GPU, and panning only ever loads the edges it hasn't drawn yet. The cost of a
// frame no longer depends on how many plots or players exist.
import { hasTierScene, tierScene } from './tierScenes';
import { addProtocol } from 'maplibre-gl';
import { api } from '../backend/api';
import { config } from '../env';
import type { PlotKind, PlotRow } from '../backend/types';
import type { MapMode } from '../lib/store';
import { GRID_LEVEL, GRID_SIZE, type PlotTypeId } from '../shared/grid';
import { rarityInfo, rarityTier } from '../shared/rarity';
import { PLOT_TYPES, drawPlotDesign } from './plotStyle';
import { isPhone } from '../lib/gfx';

const BLOCK_SHIFT = 6; // 64x64 plots per block (matches world_plots.bx/by)
const BLOCKS = GRID_SIZE >> BLOCK_SHIFT;
/** Zoom where owned plots start to be drawn (each ~3 px). */
export const PLOTS_MIN_ZOOM = GRID_LEVEL - 6.5;
/** Every plot square appears (~18 px); faint grid lines a little before that. */
export const CELLS_MIN_ZOOM = GRID_LEVEL - 3.8;
export const GRIDLINES_MIN_ZOOM = GRID_LEVEL - 4.8;

// tiles are drawn at 2x on high-density screens so lines stay crisp
// canvas shadows are very slow in Safari: phones draw the glows as soft strokes instead
const SHADOW = !isPhone();
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

  /** What a plot is used as (from blocks already loaded): undefined when that block isn't loaded. */
  kindAt(gx: number, gy: number): PlotKind | null | undefined {
    const rows = this.blocks.get(`${gx >> BLOCK_SHIFT}_${gy >> BLOCK_SHIFT}`);
    if (!rows) return undefined;
    const r = rows.find((x) => x[0] === gx && x[1] === gy);
    return r ? (r[11] ?? 'canvas') : null;
  }

  /** The most recently used blocks, to keep between visits. */
  dump(max: number): [string, PlotRow[]][] { return [...this.blocks.entries()].slice(-max); }
  restore(entries: [string, PlotRow[]][]) { for (const [k, rows] of entries) if (!this.blocks.has(k)) this.blocks.set(k, rows); }

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
  // the plot grid is drawn into these same tiles (one image layer for the phone to fill, not two)
  const grid = opts.mode !== 'canvas' && z >= Math.floor(GRIDLINES_MIN_ZOOM) && shift <= 6;
  if (!rows.length && !grid) return null;
  const started = performance.now();
  const cs = PX / n; // canvas pixels per plot
  const look = LOOKS[opts.mode] ?? LOOKS.atlas;
  const ctx = ctx2d();
  if (grid) { drawGrid(ctx, z); ctx.globalAlpha = 1; }
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
type KCell = { gx: number; gy: number; px: number; py: number; cs: number; rc: string; glow: string; tier: number; join: Sides; rid?: string; shiny?: boolean };
const NO_JOIN: Sides = { n: false, e: false, s: false, w: false };
const tierOf = (r: string | null | undefined) => Math.min(4, rarityTier(r));
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
  if (c.tier === 4) { ctx.shadowColor = c.glow; ctx.shadowBlur = SHADOW ? cs * 0.12 : 0; }
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
  ctx.strokeStyle = neon; ctx.lineWidth = lw; ctx.shadowColor = neon; ctx.shadowBlur = SHADOW ? cs * (0.1 + c.tier * 0.04) : 0; ctx.lineCap = 'round';
  ctx.beginPath();
  if (!c.join.n) { ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y0); }
  if (!c.join.w) { ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x0, roofBottom); }
  if (!c.join.e) { ctx.moveTo(b.x1, b.y0); ctx.lineTo(b.x1, roofBottom); }
  if (!c.join.s) { ctx.moveTo(b.x0, roofBottom); ctx.lineTo(b.x1, roofBottom); }
  if (!SHADOW) { const a = ctx.globalAlpha; ctx.globalAlpha = a * 0.35; ctx.lineWidth = lw * 3.2; ctx.stroke(); ctx.globalAlpha = a; ctx.lineWidth = lw; }
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
// ---- the realm types: a mine, a sky island, a workshop, a restaurant and a dungeon ----
function mineCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#3A3340'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = c.tier ? c.rc : '#8B5CFF'; ctx.fillRect(px + cs * 0.3, py + cs * 0.3, cs * 0.4, cs * 0.4); return; }
  const b = inner(c, cs * 0.08);
  ctx.fillStyle = '#4A4252'; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  for (let i = 0; i < 6; i++) { const x = px + cs * (0.12 + hash(gx, gy, i) * 0.76), y = py + cs * (0.12 + hash(gx, gy, i + 9) * 0.76), r = cs * (0.035 + hash(gx, gy, i + 3) * 0.04); ctx.fillStyle = ['#8B5CFF', '#22E3FF', '#FF3D9A', c.rc][i % 4]; ctx.beginPath(); ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.6); ctx.lineTo(x - r, y); ctx.fill(); }
  if (cs >= 12 && !c.join.s) { ctx.fillStyle = '#0A080E'; ctx.beginPath(); ctx.arc(px + cs / 2, py + cs * 0.92, cs * 0.18, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#8B6B4A'; ctx.lineWidth = Math.max(1, cs * 0.04); ctx.stroke(); }
  rareBits(ctx, c);
}
function skyCell(ctx: CanvasRenderingContext2D, c: KCell, t = 0) {
  const { px, py, cs, gx, gy } = c;
  ctx.globalAlpha = 1; const gr = ctx.createLinearGradient(px, py, px, py + cs); gr.addColorStop(0, '#8FD0FF'); gr.addColorStop(1, '#CBE9FF'); ctx.fillStyle = gr; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#7ED957'; ctx.fillRect(px + cs * 0.2, py + cs * 0.4, cs * 0.6, cs * 0.25); return; }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(px + cs * (0.2 + hash(gx, gy, i) * 0.6), py + cs * (0.15 + i * 0.6), cs * 0.16, cs * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
  const cx = px + cs / 2, cy = py + cs * 0.5 + Math.sin(t * 1.5 + gx) * cs * 0.02;
  ctx.fillStyle = '#8A6E55'; ctx.beginPath(); ctx.moveTo(cx - cs * 0.3, cy); ctx.lineTo(cx, cy + cs * 0.3); ctx.lineTo(cx + cs * 0.3, cy); ctx.fill();
  ctx.fillStyle = c.tier >= 3 ? '#FFE14D' : '#7ED957'; ctx.beginPath(); ctx.ellipse(cx, cy, cs * 0.31, cs * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  if (cs >= 12) { ctx.fillStyle = '#2E8B57'; ctx.beginPath(); ctx.arc(cx + cs * 0.1, cy - cs * 0.07, cs * 0.06, 0, Math.PI * 2); ctx.fill(); }
  rareBits(ctx, c);
}
function workshopCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#6B4A33'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#F59E0B'; ctx.fillRect(px + cs * 0.25, py + cs * 0.25, cs * 0.5, cs * 0.5); return; }
  const b = inner(c, cs * 0.08);
  ctx.fillStyle = '#9C4A35'; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  if (cs >= 10) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; for (let y = b.y0; y < b.y1; y += cs * 0.12) { ctx.beginPath(); ctx.moveTo(b.x0, y); ctx.lineTo(b.x1, y); ctx.stroke(); } }
  // a big gear on the roof
  const cx = px + cs / 2, cy = py + cs / 2, r = cs * 0.2; ctx.fillStyle = c.tier ? c.rc : '#C9A04A';
  ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 1.3; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.fill();
  ctx.fillStyle = '#6B4A33'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2); ctx.fill();
  rareBits(ctx, c);
}
function dinerCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#F4F1EA'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#E8323C'; ctx.fillRect(px + cs * 0.2, py + cs * 0.2, cs * 0.6, cs * 0.6); return; }
  const n = cs >= 16 ? 6 : 3, q = cs / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) { ctx.fillStyle = '#E8323C'; ctx.fillRect(px + x * q, py + y * q, q, q); }
  const b = inner(c, cs * 0.12), roofB = c.join.s ? py + cs : py + cs * 0.68;
  ctx.fillStyle = '#FFE14D'; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, roofB - b.y0);
  if (!c.join.s && cs >= 10) { const k = 6, aw = (b.x1 - b.x0) / k; for (let i = 0; i < k; i++) { ctx.fillStyle = i % 2 ? '#FFFFFF' : c.tier ? c.rc : '#E8323C'; ctx.fillRect(b.x0 + i * aw, roofB, aw + 0.5, cs * 0.1); } }
  rareBits(ctx, c);
}
function dungeonCell(ctx: CanvasRenderingContext2D, c: KCell, t = 0) {
  const { px, py, cs, gx, gy } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#2A2630'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#A855F7'; ctx.fillRect(px + cs * 0.3, py + cs * 0.3, cs * 0.4, cs * 0.4); return; }
  const b = inner(c, cs * 0.08);
  ctx.fillStyle = '#4A4552'; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  if (cs >= 10) { ctx.strokeStyle = '#2A2630'; ctx.lineWidth = Math.max(1, cs * 0.02); for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) ctx.strokeRect(b.x0 + ((x + (y % 2) * 0.5) * (b.x1 - b.x0)) / 3, b.y0 + (y * (b.y1 - b.y0)) / 4, (b.x1 - b.x0) / 3, (b.y1 - b.y0) / 4); }
  // torches on the corners
  for (const [dx, dy] of [[0.18, 0.18], [0.82, 0.18]]) { ctx.fillStyle = hash(gx, gy, Math.floor(t * 6)) > 0.5 ? '#FFB13D' : '#FF6A00'; ctx.beginPath(); ctx.arc(px + cs * dx, py + cs * dy, Math.max(1, cs * 0.05), 0, Math.PI * 2); ctx.fill(); }
  if (cs >= 12 && !c.join.s) { ctx.fillStyle = '#0A080E'; ctx.beginPath(); ctx.arc(px + cs / 2, py + cs * 0.92, cs * 0.16, Math.PI, 0); ctx.fill(); ctx.strokeStyle = c.tier ? c.rc : '#A855F7'; ctx.lineWidth = Math.max(1, cs * 0.03); ctx.stroke(); }
  rareBits(ctx, c);
}
/** An Estate from above: a rich floor in the Estate's colour with a gold inlay grid, a corner crown and its emblem's
 *  colour pattern — so merged-up land reads as something grander than a single plot. */
const ESTATE_LOOK: Partial<Record<PlotKind, { a: string; b: string; trim: string; dots: string[]; big?: boolean }>> = {
  atelier: { a: '#E9DCC4', b: '#C9A06A', trim: '#A66BFF', dots: ['#E85D75', '#3DA5D9', '#F2C14E', '#5FB49C'] },
  reserve: { a: '#1F3D24', b: '#2E5A33', trim: '#2FBF71', dots: ['#C7FF8A', '#FF8AD8', '#8AF0FF'] },
  ranch: { a: '#7DBB4A', b: '#C9A06A', trim: '#B23A2E', dots: ['#F8F8F2', '#E8C35A', '#F28C28'] },
  exchange: { a: '#1E2A44', b: '#2B3A5A', trim: '#F2C230', dots: ['#FFD98A', '#3DDC97', '#FFD98A'] },
  boardwalk: { a: '#3A2A1E', b: '#5E402C', trim: '#00E5FF', dots: ['#FF3D9A', '#00E5FF', '#FFE14D'] },
  gemheart: { a: '#141826', b: '#1C2230', trim: '#19D3C5', dots: ['#19D3C5', '#B57BFF', '#22B8FF', '#FF5A7A'] },
  skyport: { a: '#2A2052', b: '#4E405E', trim: '#8A7CFF', dots: ['#3DDC97', '#FF7AC8', '#F2C14E'] },
  foundry: { a: '#3A3A42', b: '#4A4A52', trim: '#E2783B', dots: ['#D9A84A', '#C87533', '#9AE6FF'] },
  foodhall: { a: '#E8DCC8', b: '#D9CBB4', trim: '#FF6B3D', dots: ['#FF3B2F', '#F2C14E', '#3DDC97'] },
  citadel: { a: '#1E1A24', b: '#3A3542', trim: '#B23CFF', dots: ['#B57BFF', '#FFD23F', '#FF3D9A'] },
  colosseum: { a: '#E2C38A', b: '#D9B98A', trim: '#FF5A5F', dots: ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97'] },
  // the Domains (3x3): a diamond-inlaid floor, a double gilded border and more lights
  museum: { a: '#0E1028', b: '#1A1D3A', trim: '#6C7BFF', dots: ['#FFFFFF', '#C3D0FF', '#FFE14D', '#FF8AD8', '#8AF0FF'], big: true },
  sanctuary: { a: '#3B7EA1', b: '#9C7A55', trim: '#3FA7D6', dots: ['#FFFFFF', '#FF8AD8', '#8AF0FF', '#C8FFFF'], big: true },
  kingdom: { a: '#C9B89A', b: '#E0B84A', trim: '#D99A2B', dots: ['#2A4A9A', '#B23A2E', '#FFD23F', '#9B5DE5'], big: true },
  megacorp: { a: '#E8ECEF', b: '#C8D0D6', trim: '#2EC4B6', dots: ['#2EC4B6', '#3DDC97', '#FFE14D', '#2EC4B6'], big: true },
  galaxypark: { a: '#2A0A40', b: '#12052A', trim: '#FF2E88', dots: ['#FF2E88', '#00E5FF', '#FFE14D', '#3DDC97', '#FFFFFF'], big: true },
  core: { a: '#1A1210', b: '#2A1E1A', trim: '#FF5A1F', dots: ['#FF5A1F', '#FFE14D', '#FF8A2A', '#FF3A6A'], big: true },
  observatory: { a: '#1C2A5A', b: '#2A3A8A', trim: '#4F6BFF', dots: ['#FFFFFF', '#C9A64A', '#9AE6FF', '#C9A6FF'], big: true },
  automaton: { a: '#16120C', b: '#2E2414', trim: '#F5B83D', dots: ['#FFD84D', '#F5B83D', '#D0D4DC', '#FFD84D'], big: true },
  banquet: { a: '#FFF4F8', b: '#FFD6E6', trim: '#FF6FA8', dots: ['#E04E6E', '#B8E8FF', '#FFF0A8', '#D8C8FF'], big: true },
  abyss: { a: '#0A0612', b: '#14101C', trim: '#7A2CFF', dots: ['#7A2CFF', '#FF2E88', '#B36BFF', '#FFE14D'], big: true },
  titans: { a: '#E8E2D4', b: '#D8D0BC', trim: '#FFB020', dots: ['#FF5A1F', '#3FA7FF', '#3DDC97', '#C8E0FF'], big: true },
};
function estateCell(kind: PlotKind) {
  return (ctx: CanvasRenderingContext2D, c: KCell, t = 0) => {
    const L = ESTATE_LOOK[kind]!, { px, py, cs, gx, gy } = c;
    ctx.globalAlpha = 1; ctx.fillStyle = L.a; ctx.fillRect(px, py, cs, cs);
    if (cs < 6) { ctx.fillStyle = L.trim; ctx.fillRect(px + cs * 0.3, py + cs * 0.3, cs * 0.4, cs * 0.4); return; }
    // a checkerboard of the two floor tones with a gold inlay grid (Domains: a big inlaid diamond per plot)
    const n = cs >= 40 ? 4 : 2, q = cs / n;
    if (L.big) {
      ctx.fillStyle = L.b; ctx.beginPath(); ctx.moveTo(px + cs / 2, py + cs * 0.06); ctx.lineTo(px + cs * 0.94, py + cs / 2); ctx.lineTo(px + cs / 2, py + cs * 0.94); ctx.lineTo(px + cs * 0.06, py + cs / 2); ctx.closePath(); ctx.fill();
      if (cs >= 12) { ctx.strokeStyle = 'rgba(255,214,90,0.75)'; ctx.lineWidth = Math.max(1, cs * 0.018); ctx.stroke(); ctx.beginPath(); ctx.arc(px + cs / 2, py + cs / 2, cs * 0.14, 0, Math.PI * 2); ctx.fillStyle = L.trim; ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 1.5 + gx + gy); ctx.fill(); ctx.globalAlpha = 1; }
    } else for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y + gx + gy) % 2) { ctx.fillStyle = L.b; ctx.fillRect(px + x * q, py + y * q, q, q); }
    if (cs >= 12 && !L.big) { ctx.strokeStyle = 'rgba(217,178,74,0.55)'; ctx.lineWidth = Math.max(1, cs * 0.012); for (let k = 1; k < n; k++) { ctx.beginPath(); ctx.moveTo(px + k * q, py); ctx.lineTo(px + k * q, py + cs); ctx.moveTo(px, py + k * q); ctx.lineTo(px + cs, py + k * q); ctx.stroke(); } }
    // little lights in the Estate's colours, twinkling
    if (cs >= 14) L.dots.forEach((d, i) => { const hx = hash(gx, gy, i * 7 + 1), hy = hash(gy, gx, i * 5 + 3); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2 + i + gx); ctx.fillStyle = d; ctx.beginPath(); ctx.arc(px + cs * (0.15 + hx * 0.7), py + cs * (0.15 + hy * 0.7), Math.max(1, cs * 0.035), 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    // the gilded trim on the outside edges
    ctx.strokeStyle = L.trim; ctx.lineWidth = Math.max(1, cs * 0.05);
    const w = ctx.lineWidth / 2;
    ctx.beginPath(); if (!c.join.n) { ctx.moveTo(px, py + w); ctx.lineTo(px + cs, py + w); } if (!c.join.s) { ctx.moveTo(px, py + cs - w); ctx.lineTo(px + cs, py + cs - w); } if (!c.join.w) { ctx.moveTo(px + w, py); ctx.lineTo(px + w, py + cs); } if (!c.join.e) { ctx.moveTo(px + cs - w, py); ctx.lineTo(px + cs - w, py + cs); } ctx.stroke();
    if (L.big && cs >= 10) {
      // a second, gold border just inside the first
      const o = cs * 0.1; ctx.strokeStyle = '#FFD65A'; ctx.lineWidth = Math.max(1, cs * 0.02);
      ctx.beginPath(); if (!c.join.n) { ctx.moveTo(px, py + o); ctx.lineTo(px + cs, py + o); } if (!c.join.s) { ctx.moveTo(px, py + cs - o); ctx.lineTo(px + cs, py + cs - o); } if (!c.join.w) { ctx.moveTo(px + o, py); ctx.lineTo(px + o, py + cs); } if (!c.join.e) { ctx.moveTo(px + cs - o, py); ctx.lineTo(px + cs - o, py + cs); } ctx.stroke();
    }
    rareBits(ctx, c);
  };
}
/** A Home plot from above: lawn, a path, and a pitched roof (one big roof across a merged house) with a chimney. */
function homeCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#86C96A'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#C8553D'; ctx.fillRect(px + cs * 0.2, py + cs * 0.2, cs * 0.6, cs * 0.6); return; }
  const b = inner(c, cs * 0.12), w = b.x1 - b.x0, h = b.y1 - b.y0;
  const roof = c.tier >= 4 ? c.rc : c.tier === 3 ? '#D9A43A' : ['#C8553D', '#B8473A', '#9C4A3A', '#3E6E9C'][(gx * 7 + gy * 3) & 3];
  ctx.fillStyle = roof; ctx.fillRect(b.x0, b.y0, w, h);
  if (cs >= 10) {
    // tiles in rows, and the ridge along the middle
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(0.6, cs * 0.012);
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(b.x0, b.y0 + (h * k) / 6); ctx.lineTo(b.x1, b.y0 + (h * k) / 6); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(b.x0, b.y0 + h * 0.47, w, Math.max(1, h * 0.06));
    if (hash(gx, gy, 7) > 0.55) { ctx.fillStyle = '#6B4A3A'; ctx.fillRect(b.x0 + w * 0.7, b.y0 + h * 0.12, w * 0.12, h * 0.16); }
  }
  if (!c.join.s && cs >= 12) { ctx.fillStyle = '#E8D9B8'; ctx.fillRect(px + cs * 0.44, b.y1, cs * 0.12, py + cs - b.y1); }
  rareBits(ctx, c);
}
/** A Landlord plot from above: a little street of rented houses, each roof its own colour. */
function landlordCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#9AA3AE'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#3E6E9C'; ctx.fillRect(px + cs * 0.2, py + cs * 0.2, cs * 0.6, cs * 0.6); return; }
  const cols = c.tier >= 3 ? [c.rc, '#D9A43A', '#FFFFFF', c.rc] : ['#3E6E9C', '#C8553D', '#5FA05A', '#D98E3A', '#7A5CC8'];
  const n = 2, q = cs / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const hx = px + x * q + q * 0.14, hy = py + y * q + q * 0.14, s = q * 0.72;
    ctx.fillStyle = '#7DBB5A'; ctx.fillRect(px + x * q + q * 0.06, py + y * q + q * 0.06, q * 0.88, q * 0.88);
    ctx.fillStyle = cols[Math.floor(hash(gx * 2 + x, gy * 2 + y, 3) * cols.length)]; ctx.fillRect(hx, hy, s, s);
    if (cs >= 14) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(hx, hy + s * 0.46, s, Math.max(1, s * 0.08)); }
  }
  rareBits(ctx, c);
}
/** A Train plot from above: gravel, two tracks with sleepers running through, and a platform canopy. */
function trainCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#B9AE9C'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#2FA4D9'; ctx.fillRect(px, py + cs * 0.4, cs, cs * 0.2); return; }
  for (const t of [0.3, 0.62]) {
    const y = py + cs * t, g = cs * 0.1;
    if (cs >= 10) { ctx.fillStyle = '#7A5A3E'; for (let x = 0; x < 6; x++) ctx.fillRect(px + (x + 0.2) * cs / 6, y - g * 0.3, cs / 14, g * 1.6); }
    ctx.fillStyle = '#5A5F66'; ctx.fillRect(px, y, cs, Math.max(1, cs * 0.025)); ctx.fillRect(px, y + g, cs, Math.max(1, cs * 0.025));
  }
  if (!c.join.s) { ctx.fillStyle = '#D8CFC0'; ctx.fillRect(px, py + cs * 0.82, cs, cs * 0.18); ctx.fillStyle = c.tier ? c.rc : '#2FA4D9'; ctx.fillRect(px + cs * 0.08, py + cs * 0.84, cs * 0.84, cs * 0.08); }
  rareBits(ctx, c);
}
/** A Plane plot from above: grass, a runway with its centre line, and a terminal. */
function planeCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#8CC36E'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#5A5F66'; ctx.fillRect(px, py + cs * 0.35, cs, cs * 0.3); return; }
  ctx.fillStyle = '#4E545C'; ctx.fillRect(px, py + cs * 0.32, cs, cs * 0.36);
  if (cs >= 10) { ctx.fillStyle = '#F4F1E8'; for (let x = 0; x < 4; x++) ctx.fillRect(px + (x + 0.15) * cs / 4, py + cs * 0.49, cs / 8, Math.max(1, cs * 0.025)); }
  if (!c.join.n) { ctx.fillStyle = '#B9C6D6'; ctx.fillRect(px + cs * 0.12, py + cs * 0.06, cs * 0.5, cs * 0.18); ctx.fillStyle = c.tier ? c.rc : '#2FA4D9'; ctx.fillRect(px + cs * 0.7, py + cs * 0.04, cs * 0.1, cs * 0.22); }
  rareBits(ctx, c);
}
/** The Paintbrawl Arena from above: a round arena floor with four lanes a side in terrain colours. */
function brawlCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs } = c;
  ctx.globalAlpha = 1; ctx.fillStyle = '#2A1240'; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) { ctx.fillStyle = '#FF4FD8'; ctx.fillRect(px + cs * 0.25, py + cs * 0.25, cs * 0.5, cs * 0.5); return; }
  const b = inner(c, cs * 0.1), w = b.x1 - b.x0, h = b.y1 - b.y0;
  ctx.fillStyle = '#4A2A30'; ctx.fillRect(b.x0, b.y0, w, h);
  if (cs >= 10) {
    const T = ['#5FCB6A', '#FF7A3D', '#6FD3FF', '#FF6FB5', '#9B6BFF', '#F5E14A'];
    const lw = w / 4.6, gap = (w - lw * 4) / 5;
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { ctx.fillStyle = T[(i + r * 2 + c.gx + c.gy) % 6]; ctx.fillRect(b.x0 + gap + i * (lw + gap), b.y0 + h * (r ? 0.56 : 0.12), lw, h * 0.32); }
    ctx.fillStyle = '#FFE14D'; ctx.fillRect(b.x0, b.y0 + h * 0.48, w, Math.max(1, cs * 0.02));
  }
  ctx.strokeStyle = c.tier ? c.rc : '#FF4FD8'; ctx.lineWidth = Math.max(1, cs * 0.035); ctx.strokeRect(b.x0, b.y0, w, h);
  rareBits(ctx, c);
}
// ---- Base plots: plain land, a stone slab whose finish is its rarity ------------------------------------------------
// common: bare slate · uncommon: teal with a clover · rare: blue stone with brass studs · epic: purple with a diamond
// inlay · legendary: gold with a sunburst · mythic: iridescent crystal · the ultras: sun, moon, comet, temple, prism,
// galaxy (see ultraMotif). A little claim stake in the middle of the everyday ones.
const BASE_SLAB: Record<string, [string, string]> = {
  common: ['#5E6A78', '#3D4653'], uncommon: ['#2AA39A', '#17675F'], rare: ['#3D7FC4', '#22508A'], epic: ['#7A4FD8', '#4A2A9A'],
  legendary: ['#E8A928', '#A86A0E'], mythic: ['#FF5FB4', '#6E3BFF'], solar: ['#FFB43A', '#E0521B'], lunar: ['#1E2A6B', '#0B1033'],
  comet: ['#0E2A4A', '#05101E'], ancient: ['#D9B77A', '#8E6B37'], prismatic: ['#FF7AE0', '#5FD3FF'], genesis: ['#1A0838', '#000004'],
  chaos: ['#FF2E63', '#3A0CA3'], phoenix: ['#FF8A1F', '#8E1B00'], crown: ['#5B2A9E', '#24104A'],
  dragon: ['#16A34A', '#052E16'], eclipse: ['#1E1B4B', '#020617'], vampire: ['#7F1D1D', '#1C0505'], mirror: ['#BAE6FD', '#475569'],
  singularity: ['#111827', '#000000'], crown_state: ['#6D28D9', '#2E1065'], crown_country: ['#9F1239', '#3B0012'],
};
/** The ultra rarities' (and Uncommon's) emblem, drawn into a box. */
function ultraMotif(ctx: CanvasRenderingContext2D, rid: string, x: number, y: number, w: number, h: number, seed: number) {
  const cx = x + w / 2, cy = y + h / 2, m = Math.min(w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); // (rays and facets stay inside the plot)
  if (rid === 'uncommon') {
    ctx.fillStyle = '#7CF0B9'; ctx.globalAlpha = 0.9;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { ctx.beginPath(); ctx.arc(x + w * 0.74 + dx * m * 0.08, y + h * 0.26 + dy * m * 0.08, m * 0.07, 0, Math.PI * 2); ctx.fill(); }
  } else if (rid === 'solar') {
    ctx.globalAlpha = 0.4; ctx.fillStyle = '#FFF1A8';
    for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, m * 0.7, t, t + 0.1); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#FFE14D'; ctx.beginPath(); ctx.arc(cx, cy, m * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF6C9'; ctx.beginPath(); ctx.arc(cx, cy, m * 0.17, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'lunar') {
    ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + w * hash(seed, i, 1), y + h * hash(seed, i, 2), m * 0.015, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#E8EEFF'; ctx.beginPath(); ctx.arc(cx + m * 0.02, cy, m * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BASE_SLAB.lunar[1]; ctx.beginPath(); ctx.arc(cx + m * 0.14, cy - m * 0.08, m * 0.23, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'comet') {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#22E3FF'; ctx.globalAlpha = 0.35; ctx.lineWidth = m * 0.14;
    ctx.beginPath(); ctx.moveTo(x + w * 0.14, y + h * 0.86); ctx.lineTo(x + w * 0.62, y + h * 0.38); ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#C9F8FF'; ctx.lineWidth = m * 0.06;
    ctx.beginPath(); ctx.moveTo(x + w * 0.22, y + h * 0.78); ctx.lineTo(x + w * 0.62, y + h * 0.38); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w * 0.66, y + h * 0.34, m * 0.11, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'ancient') {
    ctx.fillStyle = '#F4E2B8';
    ctx.beginPath(); ctx.moveTo(x + w * 0.22, y + h * 0.34); ctx.lineTo(cx, y + h * 0.18); ctx.lineTo(x + w * 0.78, y + h * 0.34); ctx.closePath(); ctx.fill();
    for (const u of [0.28, 0.42, 0.56, 0.7]) ctx.fillRect(x + w * (u - 0.03), y + h * 0.4, w * 0.06, h * 0.34);
    ctx.fillRect(x + w * 0.18, y + h * 0.74, w * 0.64, h * 0.06);
  } else if (rid === 'prismatic') {
    const C = ['#FF3D9A', '#FF9F1C', '#FFE14D', '#3DDC97', '#22E3FF', '#2F7BFF', '#A45CFF', '#FF7AE0'];
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; ctx.fillStyle = C[i]; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, m * 0.75, t, t + Math.PI / 4); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - m * 0.24); ctx.lineTo(cx + m * 0.2, cy); ctx.lineTo(cx, cy + m * 0.24); ctx.lineTo(cx - m * 0.2, cy); ctx.closePath(); ctx.fill();
  } else if (rid === 'chaos') {
    // a tilted die over jagged colour
    ['#FFE14D', '#22E3FF', '#3DDC97', '#FF7AE0'].forEach((col, i) => { ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fillRect(x + (i % 2) * w / 2, y + Math.floor(i / 2) * h / 2, w / 2, h / 2); });
    ctx.globalAlpha = 1; ctx.translate(cx, cy + m * 0.02); ctx.rotate(-0.25);
    const d = m * 0.46; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-d / 2, -d / 2, d, d, d * 0.2); ctx.fill();
    ctx.fillStyle = '#FF2E63'; for (const [u, v] of [[-0.25, -0.25], [0.25, -0.25], [0, 0], [-0.25, 0.25], [0.25, 0.25]]) { ctx.beginPath(); ctx.arc(u * d, v * d, d * 0.09, 0, Math.PI * 2); ctx.fill(); }
  } else if (rid === 'phoenix') {
    // a firebird: wings and a flame body
    ctx.fillStyle = '#FF5A1F';
    ctx.beginPath(); ctx.moveTo(cx - m * 0.1, cy + m * 0.02); ctx.quadraticCurveTo(cx - m * 0.3, cy - m * 0.1, cx - m * 0.42, cy + m * 0.06); ctx.quadraticCurveTo(cx - m * 0.26, cy + m * 0.06, cx - m * 0.14, cy + m * 0.12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + m * 0.1, cy + m * 0.02); ctx.quadraticCurveTo(cx + m * 0.3, cy - m * 0.1, cx + m * 0.42, cy + m * 0.06); ctx.quadraticCurveTo(cx + m * 0.26, cy + m * 0.06, cx + m * 0.14, cy + m * 0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFD166';
    ctx.beginPath(); ctx.moveTo(cx, cy + m * 0.38); ctx.quadraticCurveTo(cx - m * 0.22, cy + m * 0.14, cx - m * 0.06, cy - m * 0.08); ctx.quadraticCurveTo(cx - m * 0.02, cy - m * 0.24, cx, cy - m * 0.38);
    ctx.quadraticCurveTo(cx + m * 0.14, cy - m * 0.14, cx + m * 0.08, cy - m * 0.02); ctx.quadraticCurveTo(cx + m * 0.22, cy + m * 0.16, cx, cy + m * 0.38); ctx.fill();
    ctx.fillStyle = '#FFF4D6'; ctx.beginPath(); ctx.ellipse(cx, cy + m * 0.14, m * 0.06, m * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'dragon') {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4ADE80'; ctx.lineWidth = m * 0.13;
    ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h * 0.74); ctx.bezierCurveTo(x + w * 0.3, y + h * 0.92, x + w * 0.56, y + h * 0.84, x + w * 0.52, y + h * 0.66);
    ctx.bezierCurveTo(x + w * 0.48, y + h * 0.5, x + w * 0.22, y + h * 0.54, x + w * 0.28, y + h * 0.38); ctx.bezierCurveTo(x + w * 0.34, y + h * 0.24, x + w * 0.58, y + h * 0.24, x + w * 0.66, y + h * 0.34); ctx.stroke();
    ctx.fillStyle = '#22C55E'; ctx.beginPath(); ctx.moveTo(x + w * 0.6, y + h * 0.26); ctx.lineTo(x + w * 0.8, y + h * 0.22); ctx.lineTo(x + w * 0.84, y + h * 0.34); ctx.lineTo(x + w * 0.7, y + h * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.arc(x + w * 0.75, y + h * 0.29, m * 0.026, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'eclipse') {
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#FDE68A';
    for (let i = 0; i < 18; i++) { const t = (i / 18) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(t) * m * 0.26, cy + Math.sin(t) * m * 0.26); ctx.lineTo(cx + Math.cos(t + 0.09) * m * 0.44, cy + Math.sin(t + 0.09) * m * 0.44); ctx.lineTo(cx + Math.cos(t + 0.18) * m * 0.26, cy + Math.sin(t + 0.18) * m * 0.26); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#FFF7D6'; ctx.beginPath(); ctx.arc(cx, cy, m * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#0B0A1F'; ctx.beginPath(); ctx.arc(cx, cy, m * 0.25, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'vampire') {
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(x + w * 0.66, y + h * 0.3, m * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#0A0A0A';
    ctx.beginPath(); ctx.moveTo(cx, y + h * 0.52); ctx.quadraticCurveTo(x + w * 0.34, y + h * 0.4, x + w * 0.22, y + h * 0.46); ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.56, x + w * 0.24, y + h * 0.6);
    ctx.quadraticCurveTo(x + w * 0.38, y + h * 0.58, x + w * 0.42, y + h * 0.66); ctx.lineTo(cx, y + h * 0.6); ctx.lineTo(x + w * 0.58, y + h * 0.66);
    ctx.quadraticCurveTo(x + w * 0.62, y + h * 0.58, x + w * 0.76, y + h * 0.6); ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.56, x + w * 0.78, y + h * 0.46); ctx.quadraticCurveTo(x + w * 0.66, y + h * 0.4, cx, y + h * 0.52); ctx.fill();
  } else if (rid === 'mirror') {
    ctx.fillStyle = '#D4AF37'; ctx.beginPath(); ctx.ellipse(cx, cy, m * 0.27, m * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E0F2FE'; ctx.beginPath(); ctx.ellipse(cx, cy, m * 0.22, m * 0.29, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.lineWidth = m * 0.04; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + w * 0.36, y + h * 0.4); ctx.lineTo(x + w * 0.58, y + h * 0.24); ctx.moveTo(x + w * 0.38, y + h * 0.56); ctx.lineTo(x + w * 0.64, y + h * 0.36); ctx.stroke();
  } else if (rid === 'singularity') {
    ctx.fillStyle = '#fff'; for (let i = 0; i < 16; i++) { ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(x + w * hash(seed, i, 5), y + h * hash(seed, i, 6), m * 0.01, 0, Math.PI * 2); ctx.fill(); }
    ctx.translate(cx, cy); ctx.rotate(-0.32);
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#B4FF39'; ctx.lineWidth = m * 0.05; ctx.beginPath(); ctx.ellipse(0, 0, m * 0.44, m * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#FDE047'; ctx.lineWidth = m * 0.04; ctx.beginPath(); ctx.ellipse(0, 0, m * 0.36, m * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.rotate(0.32); ctx.globalAlpha = 1; ctx.strokeStyle = '#F2FFD6'; ctx.lineWidth = m * 0.025; ctx.beginPath(); ctx.arc(0, 0, m * 0.19, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, m * 0.16, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'crown_state' || rid === 'crown_country') {
    const st = rid === 'crown_state';
    ctx.globalAlpha = 0.2; ctx.fillStyle = st ? '#F5D0FE' : '#FFE4E6';
    for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, m * 0.7, t, t + 0.1); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = st ? '#E5E7EB' : '#FFD23F'; ctx.strokeStyle = st ? '#6B7280' : '#B8860B'; ctx.lineWidth = Math.max(1, m * 0.025);
    ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h * 0.72); ctx.lineTo(x + w * 0.14, y + h * 0.32); ctx.lineTo(x + w * 0.32, y + h * 0.46); ctx.lineTo(x + w * 0.42, y + h * 0.22); ctx.lineTo(cx, y + h * 0.38);
    ctx.lineTo(x + w * 0.58, y + h * 0.22); ctx.lineTo(x + w * 0.68, y + h * 0.46); ctx.lineTo(x + w * 0.86, y + h * 0.32); ctx.lineTo(x + w * 0.82, y + h * 0.72); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = st ? '#7C3AED' : '#BE123C'; ctx.fillRect(x + w * 0.2, y + h * 0.62, w * 0.6, h * 0.1);
    ctx.fillStyle = st ? '#D1D5DB' : '#E8B923'; ctx.fillRect(x + w * 0.18, y + h * 0.72, w * 0.64, h * 0.1);
    if (!st) { ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.arc(cx, y + h * 0.14, m * 0.06, 0, Math.PI * 2); ctx.fill(); }
  } else if (rid === 'crown') {
    // a gold crown with gems
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#FFD23F';
    for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, m * 0.7, t, t + 0.12); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#FFD23F'; ctx.strokeStyle = '#B8860B'; ctx.lineWidth = Math.max(1, m * 0.025);
    ctx.beginPath(); ctx.moveTo(x + w * 0.22, y + h * 0.7); ctx.lineTo(x + w * 0.18, y + h * 0.34); ctx.lineTo(x + w * 0.36, y + h * 0.5); ctx.lineTo(cx, y + h * 0.26);
    ctx.lineTo(x + w * 0.64, y + h * 0.5); ctx.lineTo(x + w * 0.82, y + h * 0.34); ctx.lineTo(x + w * 0.78, y + h * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#E8B923'; ctx.fillRect(x + w * 0.22, y + h * 0.7, w * 0.56, h * 0.09);
    ctx.fillStyle = '#FF3D7F'; ctx.beginPath(); ctx.arc(cx, y + h * 0.56, m * 0.05, 0, Math.PI * 2); ctx.fill();
  } else if (rid === 'genesis') {
    ctx.fillStyle = '#fff'; for (let i = 0; i < 14; i++) { ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(x + w * hash(seed, i, 3), y + h * hash(seed, i, 4), m * 0.012, 0, Math.PI * 2); ctx.fill(); }
    ctx.translate(cx, cy); ctx.rotate(-0.45);
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#A45CFF'; ctx.beginPath(); ctx.ellipse(0, 0, m * 0.4, m * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#FF7AE0'; ctx.beginPath(); ctx.ellipse(0, 0, m * 0.26, m * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, m * 0.13); g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#FFD6FF'); g.addColorStop(1, 'rgba(164,92,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, m * 0.13, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
const ULTRA_IDS = new Set(['solar', 'lunar', 'comet', 'ancient', 'prismatic', 'genesis', 'chaos', 'phoenix', 'crown', 'dragon', 'eclipse', 'vampire', 'mirror', 'singularity', 'crown_state', 'crown_country']);
function baseCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy, tier } = c;
  const rid = c.rid ?? 'common';
  const [a, b] = BASE_SLAB[rid] ?? BASE_SLAB.common;
  const gr = ctx.createLinearGradient(px, py, px + cs, py + cs);
  gr.addColorStop(0, a); gr.addColorStop(1, b);
  if (rid === 'mythic') gr.addColorStop(0.5, '#3FE0FF');
  ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(px, py, cs, cs);
  if (cs < 6) return;
  const m = inner(c, cs * 0.08);
  // bevel: light top-left, shade bottom-right
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#fff'; ctx.fillRect(m.x0, m.y0, m.x1 - m.x0, cs * 0.05);
  ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.fillRect(m.x0, m.y1 - cs * 0.05, m.x1 - m.x0, cs * 0.05);
  ctx.globalAlpha = 1;
  if (cs < 12) return;
  if (ULTRA_IDS.has(rid) || rid === 'uncommon') ultraMotif(ctx, rid, px, py, cs, cs, gx * 31 + gy);
  if (rid === 'common') {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = Math.max(1, cs * 0.02);
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + cs * (i / 4), py + cs * 0.1); ctx.lineTo(px + cs * (i / 4 - 0.12), py + cs * 0.9); ctx.stroke(); }
  } else if (rid === 'rare') {
    ctx.fillStyle = '#E8C46A';
    for (const [u, v] of [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]]) { ctx.beginPath(); ctx.arc(px + cs * u, py + cs * v, cs * 0.045, 0, Math.PI * 2); ctx.fill(); }
  } else if (rid === 'epic') {
    const cx = px + cs / 2, cy = py + cs / 2, d = cs * 0.3;
    ctx.strokeStyle = c.glow; ctx.lineWidth = Math.max(1, cs * 0.035); ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (rid === 'legendary') {
    const cx = px + cs / 2, cy = py + cs / 2;
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#FFF4C2';
    for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, cs * 0.46, t, t + Math.PI / 24); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else if (rid === 'mythic') {
    const cx = px + cs / 2, cy = py + cs / 2, r0 = cs * 0.22;
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r0 * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95; ctx.fillStyle = '#C9F6FF';
    ctx.beginPath(); ctx.moveTo(cx, cy - r0 * 1.3); ctx.lineTo(cx + r0 * 0.7, cy); ctx.lineTo(cx, cy + r0); ctx.lineTo(cx - r0 * 0.7, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.rc; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(cx, cy - r0 * 1.3); ctx.lineTo(cx + r0 * 0.7, cy); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // the claim stake on the everyday rarities
  if (tier < 4 && !ULTRA_IDS.has(rid) && cs >= 18 && hash(gx, gy, 41) < 0.9) {
    const sx = px + cs * 0.5, sy = py + cs * 0.62;
    ctx.strokeStyle = '#2A1C10'; ctx.lineWidth = Math.max(1, cs * 0.035); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - cs * 0.3); ctx.stroke();
    ctx.fillStyle = rid === 'common' ? '#E9EEF5' : c.rc; ctx.beginPath(); ctx.moveTo(sx, sy - cs * 0.3); ctx.lineTo(sx + cs * 0.18, sy - cs * 0.24); ctx.lineTo(sx, sy - cs * 0.18); ctx.closePath(); ctx.fill();
  }
  rareBits(ctx, c);
}
/** A shiny plot (1 in 1,000): a sheen across it and twinkling sparkles, whatever kind of plot it is. */
function shinyOver(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy } = c;
  if (cs < 6) return;
  ctx.save();
  const g = ctx.createLinearGradient(px, py, px + cs, py + cs);
  g.addColorStop(0.3, 'rgba(255,255,255,0)'); g.addColorStop(0.47, 'rgba(255,255,255,0.45)'); g.addColorStop(0.5, 'rgba(255,214,255,0.6)'); g.addColorStop(0.53, 'rgba(201,248,255,0.45)'); g.addColorStop(0.7, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(px, py, cs, cs);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) { const x = px + cs * (0.12 + hash(gx, gy, 500 + i) * 0.76), y = py + cs * (0.12 + hash(gx, gy, 520 + i) * 0.76); star(ctx, x, y, cs * 0.07, cs * 0.02, 4); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, cs * 0.03); outerEdges(ctx, c, cs * 0.015);
  ctx.restore();
}

// ---- Art plots waiting for art: a blank canvas in a frame that gets fancier with rarity -----------------------------
// common: linen in a wood frame · rare: a blue paint splash · epic: a gallery frame and two strokes · legendary: an
// ornate gold frame · mythic: a holographic frame and a rainbow swirl.
const FRAME = ['#8A5A34', '#2B6CB0', '#5B34B5', '#D9A11E', '#FF3D9A'];
const FRAME_BY: Record<string, string> = { uncommon: '#1E8C82', solar: '#E86A1B', lunar: '#26347E', comet: '#0E3A63', ancient: '#9C7A44', prismatic: '#FF7AE0', genesis: '#1A0838', chaos: '#3A0CA3', phoenix: '#8E1B00', crown: '#D9A11E' };
function canvasCell(ctx: CanvasRenderingContext2D, c: KCell) {
  const { px, py, cs, gx, gy, tier } = c;
  ctx.globalAlpha = 1;
  const rid = c.rid ?? 'common';
  if (FRAME_BY[rid]) ctx.fillStyle = FRAME_BY[rid];
  else if (tier === 4) { const g = ctx.createLinearGradient(px, py, px + cs, py + cs); g.addColorStop(0, '#FF3D9A'); g.addColorStop(0.35, '#FFD84D'); g.addColorStop(0.65, '#3DDC97'); g.addColorStop(1, '#22E3FF'); ctx.fillStyle = g; }
  else ctx.fillStyle = FRAME[tier];
  ctx.fillRect(px, py, cs, cs);
  if (cs < 6) return;
  const f = cs * (tier >= 3 ? 0.13 : 0.1), m = inner(c, f);
  ctx.fillStyle = '#FBF6EC'; ctx.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
  if (cs < 12) return;
  // linen weave
  ctx.globalAlpha = 0.06; ctx.fillStyle = '#7A5A30';
  for (let i = 0; i < 6; i++) ctx.fillRect(m.x0, m.y0 + (m.y1 - m.y0) * (i / 6), m.x1 - m.x0, Math.max(1, cs * 0.008));
  ctx.globalAlpha = 1;
  const W = m.x1 - m.x0, H = m.y1 - m.y0;
  const stroke = (col: string, y: number, wv: number) => { ctx.strokeStyle = col; ctx.lineWidth = cs * 0.09; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(m.x0 + W * 0.15, m.y0 + H * y); ctx.bezierCurveTo(m.x0 + W * 0.4, m.y0 + H * (y - wv), m.x0 + W * 0.6, m.y0 + H * (y + wv), m.x0 + W * 0.85, m.y0 + H * y); ctx.stroke(); };
  if (tier === 1) { ctx.fillStyle = '#2FB8FF'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(m.x0 + W * 0.72, m.y0 + H * 0.3, W * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(m.x0 + W * 0.55, m.y0 + H * 0.42, W * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  if (tier === 2) { stroke('#A45CFF', 0.4, 0.18); stroke('#FF6FA5', 0.66, 0.14); }
  if (tier === 3) { stroke('#FFB31F', 0.36, 0.16); stroke('#FF3D7F', 0.62, 0.16); ctx.fillStyle = '#FFE3A1';
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(px + f / 2 + u * (cs - f), py + f / 2 + v * (cs - f), f * 0.45, 0, Math.PI * 2); ctx.fill(); } }
  if (ULTRA_IDS.has(rid)) { const pg = ctx.createLinearGradient(m.x0, m.y0, m.x1, m.y1); pg.addColorStop(0, BASE_SLAB[rid][0]); pg.addColorStop(1, BASE_SLAB[rid][1]); ctx.fillStyle = pg; ctx.globalAlpha = 0.85; ctx.fillRect(m.x0, m.y0, W, H); ctx.globalAlpha = 1; ultraMotif(ctx, rid, m.x0, m.y0, W, H, gx * 31 + gy); rareBits(ctx, c); return; }
  if (rid === 'uncommon') ultraMotif(ctx, 'uncommon', m.x0, m.y0, W, H, 0);
  if (tier === 4) { const cx = m.x0 + W / 2, cy = m.y0 + H / 2; ['#FF3D9A', '#FFB31F', '#3DDC97', '#2FB8FF', '#A45CFF'].forEach((col, i) => { ctx.strokeStyle = col; ctx.lineWidth = cs * 0.045; ctx.beginPath(); ctx.arc(cx, cy, W * (0.1 + i * 0.075), i, i + Math.PI * 1.3); ctx.stroke(); }); }
  // a tiny easel brush on common & rare, so a blank canvas reads as "paint me"
  if (tier <= 1 && cs >= 18 && hash(gx, gy, 43) < 0.8) {
    ctx.strokeStyle = '#6B4423'; ctx.lineWidth = Math.max(1, cs * 0.03); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(m.x0 + W * 0.2, m.y1 - H * 0.15); ctx.lineTo(m.x0 + W * 0.45, m.y1 - H * 0.38); ctx.stroke();
    ctx.fillStyle = tier ? '#2FB8FF' : '#FF3D7F'; ctx.beginPath(); ctx.arc(m.x0 + W * 0.47, m.y1 - H * 0.4, cs * 0.035, 0, Math.PI * 2); ctx.fill();
  }
  rareBits(ctx, c);
}

const CELL_DRAW: Partial<Record<PlotKind, (ctx: CanvasRenderingContext2D, c: KCell) => void>> = { ...Object.fromEntries(Object.keys(ESTATE_LOOK).map((k) => [k, estateCell(k as PlotKind)])), brawl: brawlCell, home: homeCell, landlord: landlordCell, train: trainCell, plane: planeCell, base: baseCell, canvas: canvasCell, habitat: habitatCell, farm: farmCell, business: businessCell, arcade: arcadeCell, mine: mineCell, sky: skyCell, workshop: workshopCell, diner: dinerCell, dungeon: dungeonCell };
const RIM_BASE: Partial<Record<PlotKind, string>> = { ...Object.fromEntries(Object.entries(ESTATE_LOOK).map(([k, v]) => [k, v!.trim])), base: 'rgba(255,255,255,0.35)', canvas: 'rgba(255,255,255,0.55)', habitat: 'rgba(255,255,255,0.45)', farm: 'rgba(176,122,71,0.9)', business: 'rgba(212,165,0,0.9)', arcade: 'rgba(255,61,154,0.9)', mine: 'rgba(124,92,255,0.9)', sky: 'rgba(56,189,248,0.9)', workshop: 'rgba(245,158,11,0.9)', diner: 'rgba(239,68,68,0.9)', dungeon: 'rgba(168,85,247,0.9)', brawl: 'rgba(255,79,216,0.9)', home: 'rgba(200,85,61,0.9)', landlord: 'rgba(62,110,156,0.9)' };
const REALM_SIGN: Partial<Record<PlotKind, string>> = { home: '🏠', landlord: '🏘️', train: '🚆', plane: '✈️', mine: '⛏️', sky: '☁️', workshop: '🛠️', diner: '🍳', dungeon: '⚔️', brawl: '🎨', atelier: '🖼️', reserve: '🦌', ranch: '🐎', exchange: '🏙️', boardwalk: '🎡', gemheart: '💎', skyport: '🎈', foundry: '⚙️', foodhall: '🍱', citadel: '🐉', colosseum: '🏟️', museum: '🌌', sanctuary: '🦢', kingdom: '🏰', megacorp: '🏢', galaxypark: '🛸', core: '🌋', observatory: '🔭', automaton: '🤖', banquet: '🎂', abyss: '👁️', titans: '⚡' };

/** One centrepiece for a whole plot or merged group (drawn in every tile it reaches, so it spans them). */
function centrepiece(ctx: CanvasRenderingContext2D, kind: PlotKind, x0: number, y0: number, x1: number, y1: number, rc: string, glow: string, tier: number, seed: number) {
  const w = x1 - x0, h = y1 - y0, s = Math.min(w, h), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (s < 10) return;
  ctx.save(); ctx.globalAlpha = 1;
  if (kind === 'arcade') {
    // a big joystick star on the roof, in gold (rarity colour on mythic), with the rarity's glow
    const r1 = s * 0.14, my = y0 + h * 0.38;
    ctx.shadowColor = glow; ctx.shadowBlur = SHADOW ? s * (0.08 + tier * 0.04) : 0;
    ctx.fillStyle = tier === 4 ? rc : '#FFE14D'; star(ctx, cx, my, r1, r1 * 0.42); ctx.fill();
    ctx.shadowBlur = 0;
    if (s >= 60) { ctx.font = `900 ${Math.round(s * 0.11)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = rc; ctx.shadowColor = rc; ctx.shadowBlur = SHADOW ? s * 0.08 : 0; ctx.fillText('ARCADE', cx, my + r1 * 1.75); ctx.shadowBlur = 0; }
  } else if (REALM_SIGN[kind]) {
    // a round sign with the place's emblem, ringed in the rarity colour
    const r = s * 0.13, my = y0 + h * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(cx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.2); ctx.strokeStyle = tier ? rc : '#FFFFFF'; ctx.shadowColor = glow; ctx.shadowBlur = SHADOW ? s * 0.04 * tier : 0; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = `${Math.round(r * 1.15)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(REALM_SIGN[kind]!, cx, my + r * 0.08);
    if (ESTATE_LOOK[kind]) { ctx.font = `${Math.round(r * 0.9)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; if (ESTATE_LOOK[kind]!.big) { ctx.fillText('👑', cx - r * 0.55, my - r * 1.25); ctx.fillText('👑', cx + r * 0.55, my - r * 1.25); } else ctx.fillText('👑', cx, my - r * 1.25); }
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
  const rows = lists.flat().filter((r) => r[11] && CELL_DRAW[r[11]] && !(r[11] === 'canvas' && r[6]) && r[0] >= gx0 && r[0] < gx0 + n && r[1] >= gy0 && r[1] < gy0 + n);
  if (!rows.length) return null;
  const cs = PX / n;
  const ctx = ctx2d();
  const look = makeLookup(blocks, lists);
  const cells: { r: PlotRow; c: KCell }[] = [];
  for (const r of rows) {
    const hidden = opts?.hidden && opts.hidden.gx === r[0] && opts.hidden.gy === r[1]; // still rolling: no rarity yet
    const info = hidden ? NEUTRAL : rarityInfo(r[9]);
    const c: KCell = { gx: r[0], gy: r[1], px: (r[0] - gx0) * cs, py: (r[1] - gy0) * cs, cs, rc: info.color, glow: info.glow, tier: hidden ? 0 : tierOf(r[9]), join: cs >= 6 ? joinOf(r, look) : NO_JOIN, rid: hidden ? 'common' : r[9] ?? 'common', shiny: !hidden && !!r[12] };
    CELL_DRAW[r[11]!]!(ctx, c);
    if (c.shiny) shinyOver(ctx, c);
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
      if (r[11] === 'base' || r[11] === 'canvas') continue; // their look is all in the cells
      const hidden = opts?.hidden && seenHidden(opts.hidden, x0, y0, x1, y1);
      const info = hidden ? NEUTRAL : rarityInfo(best[9]);
      if (hasTierScene(r[11])) {
        // an Estate or Domain: one picture of the whole place across its land, with a small crest in the corner
        const clip = cells.filter((o) => (r[5] ? o.r[5] === r[5] : o.r === r)).map((o) => [o.c.px, o.c.py, cs] as [number, number, number]);
        const L = ESTATE_LOOK[r[11]!]!, X0 = (x0 - gx0) * cs, Y0 = (y0 - gy0) * cs, X1 = (x1 + 1 - gx0) * cs, Y1 = (y1 + 1 - gy0) * cs;
        tierScene(ctx, r[11]!, X0, Y0, X1, Y1, clip, hash(x0, y0, 17) * 1e9, !!L.big, L.trim);
        const sz = Math.min(X1 - X0, Y1 - Y0);
        if (sz >= 40) {
          const bx = X0 + sz * 0.1, by = Y0 + sz * 0.1, br = sz * 0.07;
          ctx.save(); ctx.beginPath(); for (const [px, py] of clip) ctx.rect(px, py, cs, cs); ctx.clip();
          ctx.fillStyle = 'rgba(10,8,24,0.75)'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = L.big ? '#FFD65A' : L.trim; ctx.lineWidth = Math.max(1, br * 0.14); ctx.stroke();
          ctx.font = `${Math.round(br * 1.1)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(REALM_SIGN[r[11]!] ?? '👑', bx, by + br * 0.05);
          ctx.font = `${Math.round(br * 0.75)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; ctx.fillText(L.big ? '👑👑' : '👑', bx, by - br * 1.25);
          ctx.restore();
        }
        continue;
      }
      centrepiece(ctx, r[11]!, (x0 - gx0) * cs, (y0 - gy0) * cs, (x1 + 1 - gx0) * cs, (y1 + 1 - gy0) * cs, info.color, info.glow, hidden ? 0 : tierOf(best[9]), hash(x0, y0, 9));
    }
  }
  // the rarity rim round the outside of every plot / merged group
  for (const { r, c } of cells) rarityRim(ctx, c, RIM_BASE[r[11]!] ?? '#fff');
  return snapshot(canvas!);
}
const seenHidden = (h: { gx: number; gy: number }, x0: number, y0: number, x1: number, y1: number) => h.gx >= x0 && h.gx <= x1 && h.gy >= y0 && h.gy <= y1;

/** The plot grid for a tile at zoom z: every tile at a zoom looks the same (plots line up with tiles). */
function drawGrid(ctx: CanvasRenderingContext2D, z: number) {
  const shift = GRID_LEVEL - z;
  const n = 1 << shift, cs = PX / n;
  const cells = z + 0.5 >= CELLS_MIN_ZOOM;
  ctx.save();
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
  ctx.restore();
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

}
