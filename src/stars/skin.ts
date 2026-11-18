// A star's skin: a flat map (longitude across, latitude up) of the star — its claimed plots in their owners' colours,
// and every painting on it laid over them. A painting is a flat map of the whole star (each owner's only covers their
// own plots), or of just a part of it round their plots (`rect`: a big star's plots are too small on the whole map to
// paint). The same picture wraps round the star in the sky disc, the preview, and the shell you walk on; up close on a
// big star the shell wears a sharper skin of just the part round you (`region`).
import { cellAngle, cellCenter, dirToUv, patch, type Cell, type V3 } from './goldberg';

export type StarPlotRow = [cell: number, rarity: string, shiny: boolean, kind: string, mine: boolean, username: string | null, accent: string | null, name: string | null, keystone: boolean];
/** a part of the flat map: from longitude u0 across du, latitude v0 up dv (all 0…1; u0 + du may pass 1: it wraps) */
export type UvRect = { u0: number; v0: number; du: number; dv: number };
export type ArtLayer = { owner: string; rev: number; w: number; h: number; img?: string; color?: string | null; status?: string; mine?: boolean; rect?: UvRect | null };
export const WHOLE: UvRect = { u0: 0, v0: 0, du: 1, dv: 1 };
/** the whole map (not just all the way round) */
export const isWhole = (r: UvRect) => r.du >= 1 && r.v0 <= 0 && r.dv >= 1;

const cellCache = new Map<number, Cell[]>();
/** every plot of a shell (for shells small enough to hold in full: up to 10,242 plots) */
export function shellCells(m: number): Cell[] | null {
  if (m > 32) return null;
  let c = cellCache.get(m);
  if (!c) { c = patch(m, [0, 0, 1], Math.PI); cellCache.set(m, c); }
  return c;
}
/** a plot's outline on the flat map (corners as [u, v] in 0…1; split where it crosses the map's seam) */
export function cellUv(cell: Cell): [number, number][][] {
  const pts = cell.corners.map((c) => dirToUv(c));
  const us = pts.map((p) => p[0]);
  if (Math.max(...us) - Math.min(...us) > 0.5) {
    const a = pts.map(([u, v]) => [u < 0.5 ? u + 1 : u, v] as [number, number]);
    return [a, a.map(([u, v]) => [u - 1, v] as [number, number])];
  }
  return [pts];
}
const imgCache = new Map<string, HTMLImageElement>();
export function loadImage(src: string): Promise<HTMLImageElement> {
  const had = imgCache.get(src);
  if (had && had.complete) return Promise.resolve(had);
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { imgCache.set(src, im); if (imgCache.size > 80) imgCache.delete(imgCache.keys().next().value!); res(im); };
    im.onerror = rej;
    im.src = src;
  });
}

/** how a part of the flat map lands on a canvas W×H: x across from u0 (wrapping), y down from the top (v0 + dv) */
export function uvToXY(r: UvRect, W: number, H: number) {
  return (u: number, v: number): [number, number] => {
    let du = u - r.u0;
    if (r.du < 1) { du -= Math.floor(du); if (du > r.du + (1 - r.du) / 2) du -= 1; }
    return [(du / r.du) * W, (1 - (v - r.v0) / r.dv) * H];
  };
}
/** the outline of a plot on a canvas showing part `r` of the map */
function cellPath(g: CanvasRenderingContext2D, cell: Cell, r: UvRect, W: number, H: number) {
  const xy = uvToXY(r, W, H);
  for (const poly of cellUv(cell)) {
    // (on the whole map, a plot across the seam is drawn on both sides; on a part, its corners are taken round to it)
    const pts = r.du >= 1 ? poly.map(([u, v]) => [u * W, (1 - (v - r.v0) / r.dv) * H] as [number, number]) : (() => {
      const c0 = xy(poly[0][0], poly[0][1]);
      return poly.map(([u, v]) => { const p = xy(u, v); const span = W / r.du; while (p[0] - c0[0] > span / 2) p[0] -= span; while (c0[0] - p[0] > span / 2) p[0] += span; return p; });
    })();
    g.beginPath();
    pts.forEach(([x, y], i) => { if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath();
    if (r.du < 1) return; // (one copy is enough on a part)
  }
}
/** draw one plot (its outline, filled) onto a flat map (or a part of one) */
export function fillCell(g: CanvasRenderingContext2D, cell: Cell, W: number, H: number, r: UvRect = WHOLE) {
  if (r.du >= 1) { for (const poly of cellUv(cell)) { g.beginPath(); poly.forEach(([u, v], i) => { const x = u * W, y = (1 - (v - r.v0) / r.dv) * H; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.fill(); } return; }
  cellPath(g, cell, r, W, H); g.fill();
}
export function strokeCell(g: CanvasRenderingContext2D, cell: Cell, W: number, H: number, r: UvRect = WHOLE) {
  if (r.du >= 1) { for (const poly of cellUv(cell)) { g.beginPath(); poly.forEach(([u, v], i) => { const x = u * W, y = (1 - (v - r.v0) / r.dv) * H; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke(); } return; }
  cellPath(g, cell, r, W, H); g.stroke();
}
/** a plot drawn as a round blot (for the biggest stars, whose plots aren't all built) */
export function blotCell(g: CanvasRenderingContext2D, m: number, id: number, W: number, H: number, r: UvRect = WHOLE) {
  const c = cellCenter(m, id) as V3;
  const [u, v] = dirToUv(c);
  const ry = (cellAngle(m) / Math.PI) * (H / r.dv) * 0.55;
  const rx = ry / Math.max(0.2, Math.cos((v - 0.5) * Math.PI)) * (W / r.du) / (2 * H / r.dv);
  const [x, y] = uvToXY(r, W, H)(u, v);
  for (const du of r.du >= 1 ? [0, -1, 1] : [0]) { g.beginPath(); g.ellipse(x + du * W, y, Math.max(0.6, rx), Math.max(0.6, ry), 0, 0, Math.PI * 2); g.fill(); }
}
/** a picture of part `src` of the map, drawn onto a canvas showing part `dst` (wrapping round the seam) */
export function drawPart(g: CanvasRenderingContext2D, im: CanvasImageSource, src: UvRect, dst: UvRect, W: number, H: number) {
  const sx = W / dst.du, sy = H / dst.dv; // (px per unit of u, of v)
  const y = (1 - (src.v0 + src.dv - dst.v0) / dst.dv) * H;
  for (const k of [-1, 0, 1]) {
    const x = (src.u0 + k - dst.u0) * sx;
    const w = src.du * sx;
    if (x + w < 0 || x > W) continue;
    g.drawImage(im, x, y, w, src.dv * sy);
  }
}

/**
 * The skin, from the claimed plots and the paintings (each painting's image already loaded, or a data URL), as a flat
 * map W wide — of the whole star, or of `region` (then H is given: the region's own proportions).
 */
export async function starSkin(m: number, plots: StarPlotRow[], layers: ArtLayer[], W = 1024, region: UvRect = WHOLE, H0?: number): Promise<HTMLCanvasElement> {
  const H = H0 ?? (region.du >= 1 ? W / 2 : Math.round(W * (region.dv / (2 * region.du))));
  const c = Object.assign(document.createElement('canvas'), { width: W, height: Math.max(1, H) });
  const g = c.getContext('2d')!;
  const cells = region.du >= 1 ? shellCells(m) : null;
  const byId = cells ? new Map(cells.map((x) => [x.id, x])) : null;
  // (a part of a big star: its plots as they are, made just for the part)
  const near = !byId && plots.length ? partCells(m, region, plots.map((p) => p[0])) : null;
  // claimed plots: their owner's colour (paintings go over them)
  g.globalAlpha = 0.92;
  for (const p of plots) {
    g.fillStyle = p[6] || '#8B6BFF';
    const cell = byId?.get(p[0]) ?? near?.get(p[0]);
    if (cell) fillCell(g, cell, W, H, region); else blotCell(g, m, p[0], W, H, region);
  }
  g.globalAlpha = 1;
  for (const L of layers) {
    if (!L.img) continue;
    try { const im = await loadImage(L.img); drawPart(g, im, L.rect ?? WHOLE, region, W, H); } catch { /* a painting that won't load: its plots keep their colour */ }
  }
  // the seams between plots, faintly (so it reads as a shell of plots, not a ball of paint)
  const seams = byId ? (cells!.length <= 3242 ? byId : null) : near;
  if (seams) {
    g.strokeStyle = 'rgba(10,12,30,0.35)';
    g.lineWidth = Math.max(1, W / 900);
    for (const p of plots) { const cell = seams.get(p[0]); if (cell) strokeCell(g, cell, W, H, region); }
  }
  return c;
}
/** the plots of a part of a big star (only those asked for), built from the star's own geometry */
export function partCells(m: number, r: UvRect, want: number[] | null): Map<number, Cell> {
  let mid: V3 = uvDir(r.u0 + r.du / 2, r.v0 + r.dv / 2), reach: number;
  if (r.du >= 1 && r.v0 + r.dv >= 0.999) { mid = [0, 1, 0]; reach = (1 - r.v0) * Math.PI; } // (a cap round the north pole)
  else if (r.du >= 1 && r.v0 <= 0.001) { mid = [0, -1, 0]; reach = (r.v0 + r.dv) * Math.PI; } // (…the south pole)
  else {
    // (as far as the part's farthest corner or edge)
    reach = 0;
    for (const fu of [0, 0.5, 1]) for (const fv of [0, 0.5, 1]) { const d = uvDir(r.u0 + r.du * fu, r.v0 + r.dv * fv); reach = Math.max(reach, Math.acos(Math.max(-1, Math.min(1, d[0] * mid[0] + d[1] * mid[1] + d[2] * mid[2])))); }
  }
  reach = Math.min(Math.PI, reach + cellAngle(m) * 2);
  const out = new Map<number, Cell>();
  const set = want ? new Set(want) : null;
  for (const c of patch(m, mid, reach)) if (!set || set.has(c.id)) out.set(c.id, c);
  return out;
}
const uvDir = (u: number, v: number): V3 => { const lon = (u - 0.5) * 2 * Math.PI, lat = (v - 0.5) * Math.PI; return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]; };

/** the part of the map round some plots (and a margin of `pad` plots), never across a pole's wrap */
export function rectAround(m: number, cells: number[], pad = 1.5): UvRect {
  const uvs = cells.map((id) => dirToUv(cellCenter(m, id)));
  const u0 = uvs[0]?.[0] ?? 0.5;
  // (longitudes measured from the first plot, so a group across the seam stays together)
  const us = uvs.map(([u]) => { let d = u - u0; d -= Math.round(d); return u0 + d; });
  const a = cellAngle(m);
  const dv = (a / Math.PI) * pad;
  let v0 = Math.min(...uvs.map((x) => x[1])) - dv, v1 = Math.max(...uvs.map((x) => x[1])) + dv;
  v0 = Math.max(0, v0); v1 = Math.min(1, v1);
  // (near the poles a plot spans more longitude)
  const lat = Math.max(Math.abs(v0 - 0.5), Math.abs(v1 - 0.5)) * Math.PI;
  const duPad = (a / (2 * Math.PI)) * pad / Math.max(0.15, Math.cos(Math.min(lat, 1.45)));
  let lo = Math.min(...us) - duPad, hi = Math.max(...us) + duPad;
  if (v1 - v0 >= 0.98) return WHOLE;
  // (round a pole, all the way round: a band of latitude, out to the pole)
  if (hi - lo >= 0.98) return v1 > 0.5 ? { u0: 0, v0, du: 1, dv: 1 - v0 } : { u0: 0, v0: 0, du: 1, dv: v1 };
  lo -= Math.floor(lo);
  return { u0: lo, v0, du: Math.min(1, hi - Math.min(...us) + duPad), dv: v1 - v0 };
}
/** a canvas size for part `r` of a star of frequency m, so each plot is about `px` across (at most `max` either way) */
export function sizeForRect(m: number, r: UvRect, px = 24, max = 2048): [number, number] {
  const perRad = px / cellAngle(m);
  let W = r.du * 2 * Math.PI * perRad * Math.max(0.3, Math.cos(Math.min(1.3, Math.abs(r.v0 + r.dv / 2 - 0.5) * Math.PI))), H = r.dv * Math.PI * perRad;
  const k = Math.min(1, max / Math.max(W, H));
  W = Math.round(Math.max(64, W * k)); H = Math.round(Math.max(64, H * k));
  return [Math.min(max, W), Math.min(max, H)];
}

/** the average colour of a painting where it's painted (what the star looks like to the naked eye) */
export function averageColor(c: HTMLCanvasElement): string | null {
  const s = 256;
  const t = Object.assign(document.createElement('canvas'), { width: s, height: s / 2 });
  const g = t.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(c, 0, 0, s, s / 2);
  const d = g.getImageData(0, 0, s, s / 2).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; if (a < 0.2) continue; r += d[i] * a; gg += d[i + 1] * a; b += d[i + 2] * a; n += a; }
  if (n < 1) return null;
  const hx = (x: number) => Math.round(x / n).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(gg)}${hx(b)}`;
}
