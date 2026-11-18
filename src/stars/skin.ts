// A star's skin: one flat map (longitude across, latitude up) of the whole star — its claimed plots in their owners'
// colours, and every painting on it laid over them. Paintings are flat maps of the whole star already (each owner's
// only covers their own plots), so the skin is just them stacked. The same picture wraps round the star in the sky
// disc, the preview, and the shell you walk on.
import { cellAngle, cellCenter, dirToUv, patch, type Cell, type V3 } from './goldberg';

export type StarPlotRow = [cell: number, rarity: string, shiny: boolean, kind: string, mine: boolean, username: string | null, accent: string | null, name: string | null, keystone: boolean];
export type ArtLayer = { owner: string; rev: number; w: number; h: number; img?: string; color?: string | null; status?: string; mine?: boolean };

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

/** draw one plot (its outline, filled) onto a flat map */
export function fillCell(g: CanvasRenderingContext2D, cell: Cell, W: number, H: number) {
  for (const poly of cellUv(cell)) {
    g.beginPath();
    poly.forEach(([u, v], i) => { const x = u * W, y = (1 - v) * H; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath();
    g.fill();
  }
}
/** a plot drawn as a round blot (for the biggest stars, whose plots aren't all built) */
export function blotCell(g: CanvasRenderingContext2D, m: number, id: number, W: number, H: number) {
  const c = cellCenter(m, id) as V3;
  const [u, v] = dirToUv(c);
  const r = (cellAngle(m) / Math.PI) * H * 0.55;
  for (const du of [0, -1, 1]) { g.beginPath(); g.ellipse((u + du) * W, (1 - v) * H, r / Math.max(0.2, Math.cos((v - 0.5) * Math.PI)), r, 0, 0, Math.PI * 2); g.fill(); }
}

/** the skin, from the claimed plots and the paintings (each painting's image already loaded, or a data URL) */
export async function starSkin(m: number, plots: StarPlotRow[], layers: ArtLayer[], W = 1024): Promise<HTMLCanvasElement> {
  const H = W / 2;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d')!;
  const cells = shellCells(m);
  const byId = cells ? new Map(cells.map((x) => [x.id, x])) : null;
  // claimed plots: their owner's colour (paintings go over them)
  for (const p of plots) {
    g.fillStyle = p[6] || '#8B6BFF';
    g.globalAlpha = 0.92;
    const cell = byId?.get(p[0]);
    if (cell) fillCell(g, cell, W, H); else blotCell(g, m, p[0], W, H);
  }
  g.globalAlpha = 1;
  for (const L of layers) {
    if (!L.img) continue;
    try { const im = await loadImage(L.img); g.drawImage(im, 0, 0, W, H); } catch { /* a painting that won't load: its plots keep their colour */ }
  }
  // the seams between plots, faintly (so it reads as a shell of plots, not a ball of paint)
  if (cells && cells.length <= 3242) {
    g.strokeStyle = 'rgba(10,12,30,0.35)';
    g.lineWidth = Math.max(1, W / 900);
    for (const p of plots) {
      const cell = byId!.get(p[0]);
      if (!cell) continue;
      for (const poly of cellUv(cell)) { g.beginPath(); poly.forEach(([u, v], i) => { const x = u * W, y = (1 - v) * H; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke(); }
    }
  }
  return c;
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
