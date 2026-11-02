// The woodland sanctuary's world: terrain made from the habitat's shape and seed (grass,
// a pond, a path, a forest edge), the decoration catalogue with its drawings and
// footprints, collision, and the starting layout. World units: one plot = 16 units.
import type { Decor } from '../backend/types';

export const CELL = 16;
/** vertical squash of the ground plane — the 2.5D look */
export const TILT = 0.72;

export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- decorations ----------------------------------------------------------------------
export type DecorTag = 'food' | 'bed' | 'toy' | 'light' | 'tree' | 'ink';
export type DecorDef = {
  k: string; label: string; r: number; flat?: boolean; tag?: DecorTag; turn?: boolean; /** animated every frame (everything else is drawn once into a cached sprite) */ live?: boolean; group: 'Trees' | 'Plants' | 'Rocks' | 'Cosy';
  /** drawn with its foot at (0,0); s = pixels per world unit */
  draw(g: CanvasRenderingContext2D, s: number, t: number, v: number): void;
};

const circ = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const ell = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: string) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); g.fill(); };
const shadow = (g: CanvasRenderingContext2D, s: number, rx: number) => ell(g, 0, 0, rx * s, rx * s * 0.42, 'rgba(10,30,15,0.28)');

function canopy(g: CanvasRenderingContext2D, s: number, t: number, v: number, c1: string, c2: string, c3: string, h: number, w: number) {
  const sway = Math.sin(t * 0.9 + v * 7) * 0.12 * s;
  const blobs: [number, number, number][] = [[0, -h, w], [-w * 0.62, -h + w * 0.35, w * 0.72], [w * 0.62, -h + w * 0.3, w * 0.7], [0, -h - w * 0.55, w * 0.68]];
  for (const [x, y, r] of blobs) circ(g, x * s + sway, y * s, r * s, c1);
  for (const [x, y, r] of blobs) circ(g, x * s + sway - r * s * 0.18, y * s - r * s * 0.2, r * s * 0.7, c2);
  circ(g, -w * 0.25 * s + sway, (-h - w * 0.55) * s, w * 0.3 * s, c3);
}

export const DECOR: DecorDef[] = [
  { k: 'oak', label: 'Oak tree', r: 1.3, tag: 'tree', group: 'Trees', draw(g, s, t, v) {
    shadow(g, s, 2.4);
    g.fillStyle = '#6B4A2E'; g.beginPath(); g.moveTo(-0.45 * s, 0); g.lineTo(-0.3 * s, -3.4 * s); g.lineTo(0.3 * s, -3.4 * s); g.lineTo(0.45 * s, 0); g.fill();
    canopy(g, s, t, v, '#2F7D3A', '#3FA34D', '#7BD47F', 5, 2.2);
  } },
  { k: 'pine', label: 'Pine', r: 1.1, tag: 'tree', group: 'Trees', draw(g, s, t, v) {
    shadow(g, s, 1.9);
    g.fillStyle = '#5A3D25'; g.fillRect(-0.3 * s, -1.4 * s, 0.6 * s, 1.4 * s);
    const sway = Math.sin(t * 0.8 + v * 5) * 0.1 * s;
    [['#1F5E3A', 2.1, 1.2], ['#26704A', 1.7, 3.0], ['#2F8556', 1.25, 4.6]].forEach(([c, w, y]) => {
      g.fillStyle = c as string; g.beginPath(); g.moveTo(-(w as number) * s, -(y as number) * s); g.lineTo(sway, -((y as number) + 2.6) * s); g.lineTo((w as number) * s, -(y as number) * s); g.fill();
    });
  } },
  { k: 'birch', label: 'Silver birch', r: 0.9, tag: 'tree', group: 'Trees', draw(g, s, t, v) {
    shadow(g, s, 1.8);
    g.fillStyle = '#EDE8DD'; g.fillRect(-0.28 * s, -4 * s, 0.56 * s, 4 * s);
    g.fillStyle = '#3A3530'; for (let i = 0; i < 5; i++) g.fillRect((i % 2 ? -0.28 : 0) * s, -(0.6 + i * 0.7) * s, 0.28 * s, 0.12 * s);
    canopy(g, s, t, v, '#7FB13B', '#A3CF52', '#D8F08A', 5.2, 1.6);
  } },
  { k: 'blossom', label: 'Blossom tree', r: 1.1, tag: 'tree', group: 'Trees', draw(g, s, t, v) {
    shadow(g, s, 2.1);
    g.fillStyle = '#5E4030'; g.beginPath(); g.moveTo(-0.4 * s, 0); g.lineTo(-0.25 * s, -3 * s); g.lineTo(0.25 * s, -3 * s); g.lineTo(0.4 * s, 0); g.fill();
    canopy(g, s, t, v, '#E879A8', '#F7A8C8', '#FFE0EE', 4.5, 1.9);
  } },
  { k: 'bush', label: 'Bush', r: 0.8, group: 'Plants', draw(g, s) {
    shadow(g, s, 1.3);
    circ(g, -0.6 * s, -0.7 * s, 0.75 * s, '#2E7A3B'); circ(g, 0.6 * s, -0.7 * s, 0.75 * s, '#2E7A3B'); circ(g, 0, -1.1 * s, 0.9 * s, '#3C9748');
    circ(g, -0.2 * s, -1.4 * s, 0.4 * s, '#64C06A');
  } },
  { k: 'berry', live: true, label: 'Berry bush', r: 0.8, tag: 'food', group: 'Plants', draw(g, s, t) {
    shadow(g, s, 1.3);
    circ(g, -0.6 * s, -0.7 * s, 0.75 * s, '#2B6E3A'); circ(g, 0.6 * s, -0.7 * s, 0.75 * s, '#2B6E3A'); circ(g, 0, -1.1 * s, 0.9 * s, '#358A45');
    const pts = [[-0.7, -0.8], [0.5, -1.2], [0.1, -0.6], [-0.2, -1.5], [0.8, -0.6], [-0.9, -1.2]];
    pts.forEach(([x, y], i) => circ(g, x * s, y * s, (0.17 + 0.02 * Math.sin(t * 2 + i)) * s, i % 2 ? '#E8344E' : '#7B4BD9'));
  } },
  { k: 'flowers', live: true, label: 'Wildflowers', r: 0, flat: true, group: 'Plants', draw(g, s, t, v) {
    const cols = ['#FFD84D', '#FF7AB8', '#FFFFFF', '#9C7CFF', '#FF9F4D'];
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39 + v * 11, d = 0.35 + (i % 3) * 0.35, x = Math.cos(a) * d * s, y = Math.sin(a) * d * 0.5 * s;
      const sway = Math.sin(t * 1.6 + i) * 0.08 * s;
      g.strokeStyle = '#3E8E45'; g.lineWidth = Math.max(1, 0.08 * s); g.beginPath(); g.moveTo(x, y); g.lineTo(x + sway, y - 0.55 * s); g.stroke();
      circ(g, x + sway, y - 0.6 * s, 0.18 * s, cols[(i + Math.floor(v * 10)) % cols.length]);
      circ(g, x + sway, y - 0.6 * s, 0.07 * s, '#FFF3B0');
    }
  } },
  { k: 'mushrooms', label: 'Mushrooms', r: 0, flat: true, group: 'Plants', draw(g, s) {
    [[-0.4, 0, 0.55], [0.35, -0.1, 0.4], [0.05, 0.25, 0.32]].forEach(([x, y, r]) => {
      g.fillStyle = '#F4EBDD'; g.fillRect((x - r * 0.25) * s, (y - r * 1.1) * s, r * 0.5 * s, r * 1.1 * s);
      g.fillStyle = '#E2453B'; g.beginPath(); g.ellipse(x * s, (y - r * 1.05) * s, r * s, r * 0.62 * s, 0, Math.PI, 0); g.fill();
      circ(g, (x - r * 0.35) * s, (y - r * 1.3) * s, r * 0.14 * s, '#FFF'); circ(g, (x + r * 0.3) * s, (y - r * 1.2) * s, r * 0.11 * s, '#FFF');
    });
  } },
  { k: 'fern', live: true, label: 'Fern', r: 0, flat: true, group: 'Plants', draw(g, s, t, v) {
    g.strokeStyle = '#3B9150'; g.lineCap = 'round'; g.lineWidth = Math.max(1, 0.16 * s);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42 + Math.sin(t * 1.1 + v * 3 + i) * 0.05;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a) * 0.9 * s, Math.sin(a) * 1.1 * s - 0.3 * s, Math.cos(a) * 1.5 * s, Math.sin(a) * 1.1 * s + 0.2 * s); g.stroke();
    }
  } },
  { k: 'reeds', live: true, label: 'Reeds', r: 0, flat: true, group: 'Plants', draw(g, s, t, v) {
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.25 * s, sw = Math.sin(t * 1.4 + i + v * 4) * 0.12 * s;
      g.strokeStyle = '#5C8F3C'; g.lineWidth = Math.max(1, 0.1 * s); g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x, -0.9 * s, x + sw, -1.8 * s); g.stroke();
      if (i % 2) ell(g, x + sw, -1.7 * s, 0.1 * s, 0.32 * s, '#7A5230');
    }
  } },
  { k: 'rock', label: 'Rock', r: 0.7, group: 'Rocks', draw(g, s) {
    shadow(g, s, 1.1);
    g.fillStyle = '#8A8F9C'; g.beginPath(); g.moveTo(-0.9 * s, 0); g.lineTo(-0.7 * s, -0.7 * s); g.lineTo(0, -1 * s); g.lineTo(0.8 * s, -0.6 * s); g.lineTo(0.95 * s, 0); g.closePath(); g.fill();
    g.fillStyle = '#B4B9C4'; g.beginPath(); g.moveTo(-0.6 * s, -0.65 * s); g.lineTo(0, -0.95 * s); g.lineTo(0.3 * s, -0.55 * s); g.lineTo(-0.3 * s, -0.4 * s); g.fill();
  } },
  { k: 'boulder', label: 'Mossy boulder', r: 1.3, group: 'Rocks', draw(g, s) {
    shadow(g, s, 1.9);
    ell(g, 0, -0.9 * s, 1.7 * s, 1.15 * s, '#7C8190');
    ell(g, -0.3 * s, -1.3 * s, 1.1 * s, 0.7 * s, '#9DA2AF');
    ell(g, -0.1 * s, -1.85 * s, 1.0 * s, 0.4 * s, '#5FA34C');
  } },
  { k: 'stones', label: 'Stepping stones', r: 0, flat: true, group: 'Rocks', draw(g, s) {
    [[-1, 0.2], [0, -0.2], [1, 0.15]].forEach(([x, y]) => { ell(g, x * s, y * s, 0.5 * s, 0.3 * s, '#A9AEB8'); ell(g, x * s, (y - 0.06) * s, 0.42 * s, 0.22 * s, '#C6CAD2'); });
  } },
  { k: 'log', label: 'Fallen log', r: 1.0, turn: true, group: 'Cosy', draw(g, s) {
    shadow(g, s, 1.8);
    g.fillStyle = '#7A5230'; g.fillRect(-1.6 * s, -1.1 * s, 3.0 * s, 0.9 * s);
    ell(g, 1.4 * s, -0.65 * s, 0.32 * s, 0.46 * s, '#C79A63'); ell(g, 1.4 * s, -0.65 * s, 0.16 * s, 0.24 * s, '#9C7444');
    ell(g, -0.4 * s, -1.1 * s, 0.6 * s, 0.16 * s, '#5FA34C');
  } },
  { k: 'stump', label: 'Tree stump', r: 0.7, group: 'Cosy', draw(g, s) {
    shadow(g, s, 1.1);
    g.fillStyle = '#6B4A2E'; g.fillRect(-0.7 * s, -1.0 * s, 1.4 * s, 1.0 * s);
    ell(g, 0, -1.0 * s, 0.7 * s, 0.32 * s, '#C79A63'); ell(g, 0, -1.0 * s, 0.4 * s, 0.17 * s, '#A8804F');
  } },
  { k: 'nest', label: 'Cosy nest', r: 0, flat: true, tag: 'bed', group: 'Cosy', draw(g, s) {
    ell(g, 0, 0, 1.6 * s, 0.8 * s, '#8C6239');
    ell(g, 0, -0.08 * s, 1.15 * s, 0.52 * s, '#F2D9A6');
    g.strokeStyle = '#B98A55'; g.lineWidth = Math.max(1, 0.12 * s);
    for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(0, 0, 1.45 * s, 0.7 * s, 0, i * 0.9, i * 0.9 + 0.6); g.stroke(); }
  } },
  { k: 'bowl', label: 'Food bowl', r: 0.4, tag: 'food', group: 'Cosy', draw(g, s) {
    shadow(g, s, 0.8);
    g.fillStyle = '#4FA9E8'; g.beginPath(); g.ellipse(0, -0.35 * s, 0.75 * s, 0.35 * s, 0, 0, Math.PI); g.fill();
    ell(g, 0, -0.35 * s, 0.75 * s, 0.25 * s, '#79C4F2');
    ell(g, 0, -0.42 * s, 0.55 * s, 0.15 * s, '#E9A04C');
    circ(g, -0.2 * s, -0.48 * s, 0.1 * s, '#E8344E'); circ(g, 0.2 * s, -0.46 * s, 0.1 * s, '#7B4BD9');
  } },
  { k: 'lantern', live: true, label: 'Firefly lantern', r: 0.35, tag: 'light', group: 'Cosy', draw(g, s, t) {
    shadow(g, s, 0.6);
    g.fillStyle = '#4A3B2C'; g.fillRect(-0.09 * s, -2.6 * s, 0.18 * s, 2.6 * s);
    const glow = 0.75 + 0.25 * Math.sin(t * 2.2);
    const gr = g.createRadialGradient(0, -2.8 * s, 0, 0, -2.8 * s, 1.4 * s);
    gr.addColorStop(0, `rgba(255,220,120,${0.55 * glow})`); gr.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, -2.8 * s, 1.4 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FFE38A'; g.fillRect(-0.3 * s, -3.15 * s, 0.6 * s, 0.7 * s);
    g.fillStyle = '#4A3B2C'; g.fillRect(-0.36 * s, -3.3 * s, 0.72 * s, 0.16 * s);
  } },
  { k: 'ball', live: true, label: 'Play ball', r: 0, tag: 'toy', group: 'Cosy', draw(g, s, t) {
    shadow(g, s, 0.55);
    const b = Math.abs(Math.sin(t * 1.7)) * 0.15 * s;
    circ(g, 0, -0.5 * s - b, 0.5 * s, '#FF5A6E');
    g.fillStyle = '#FFE14D'; g.beginPath(); g.arc(0, -0.5 * s - b, 0.5 * s, -0.5, 0.5); g.lineTo(0, -0.5 * s - b); g.fill();
    circ(g, -0.18 * s, -0.68 * s - b, 0.12 * s, 'rgba(255,255,255,0.7)');
  } },
  { k: 'inkspring', live: true, label: 'Ink Spring', r: 0.9, tag: 'ink', group: 'Cosy', draw(g, s, t) {
    shadow(g, s, 1.5);
    // a mossy stone basin of glowing ink; happy creatures nearby make it fill faster
    ell(g, 0, -0.45 * s, 1.35 * s, 0.75 * s, '#6E7484');
    ell(g, 0, -0.6 * s, 1.3 * s, 0.6 * s, '#8D93A3');
    ell(g, -0.5 * s, -0.95 * s, 0.5 * s, 0.16 * s, '#5FA34C');
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    const gr = g.createRadialGradient(0, -0.65 * s, 0, 0, -0.65 * s, 1.1 * s);
    gr.addColorStop(0, '#B79CFF'); gr.addColorStop(0.6, '#6A4CFF'); gr.addColorStop(1, '#3B2BB0');
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, -0.65 * s, 1.0 * s, 0.42 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(200,180,255,${0.25 + 0.3 * pulse})`; g.beginPath(); g.ellipse(-0.25 * s, -0.75 * s, 0.4 * s, 0.12 * s, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.7 + i / 3) % 1;
      circ(g, (i - 1) * 0.35 * s, (-0.8 - k * 1.4) * s, (0.12 - k * 0.08) * s, `rgba(150,120,255,${1 - k})`);
    }
  } },
  { k: 'signpost', label: 'Sign post', r: 0.3, turn: true, group: 'Cosy', draw(g, s) {
    shadow(g, s, 0.5);
    g.fillStyle = '#6B4A2E'; g.fillRect(-0.1 * s, -2.2 * s, 0.2 * s, 2.2 * s);
    g.fillStyle = '#C79A63'; g.beginPath(); g.moveTo(-0.9 * s, -2.2 * s); g.lineTo(0.7 * s, -2.2 * s); g.lineTo(1.0 * s, -1.9 * s); g.lineTo(0.7 * s, -1.6 * s); g.lineTo(-0.9 * s, -1.6 * s); g.fill();
  } },
];
export const DECOR_BY_K = Object.fromEntries(DECOR.map((d) => [d.k, d])) as Record<string, DecorDef>;
const variant = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return (h % 1000) / 1000; };
export const decorVariant = variant;

// ---- terrain --------------------------------------------------------------------------
export type Terrain = {
  cols: number; rows: number; W: number; H: number; member: Set<string>; cells: [number, number][];
  pond: { x: number; y: number; rx: number; ry: number } | null;
  path: [number, number][];
  forest: { x: number; y: number; k: string; v: number }[];
  /** walk/placement margin from the forest edge */
  edge: number;
};

export function makeTerrain(cells: [number, number][], seed: number): Terrain {
  const list = cells.length ? cells : [[0, 0]] as [number, number][];
  const minX = Math.min(...list.map((c) => c[0])), minY = Math.min(...list.map((c) => c[1]));
  const norm = list.map(([x, y]) => [x - minX, y - minY] as [number, number]);
  const cols = Math.max(...norm.map((c) => c[0])) + 1, rows = Math.max(...norm.map((c) => c[1])) + 1;
  const member = new Set(norm.map(([x, y]) => `${x},${y}`));
  const r = rng(seed);
  // the pond sits in the member cell with the most member neighbours
  let best = norm[0], bestN = -1;
  for (const [x, y] of norm) {
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].filter(([dx, dy]) => member.has(`${x + dx},${y + dy}`)).length + r() * 0.5;
    if (n > bestN) { bestN = n; best = [x, y]; }
  }
  const big = norm.length >= 4;
  const pond = { x: best[0] * CELL + CELL * (big ? 1 : 0.68), y: best[1] * CELL + CELL * (big ? 0.95 : 0.68), rx: big ? 4.4 + r() * 1.2 : 2.6, ry: big ? 3.0 + r() * 0.8 : 1.8 };
  if (big) { pond.x = Math.min(pond.x, cols * CELL - 7); pond.y = Math.min(pond.y, rows * CELL - 6); }
  // a winding path between two far-apart member cells
  const a = norm[0], b = norm.reduce((m, c) => ((c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2 > (m[0] - a[0]) ** 2 + (m[1] - a[1]) ** 2 ? c : m), norm[0]);
  const path: [number, number][] = [];
  const p0: [number, number] = [a[0] * CELL + 3 + r() * 4, a[1] * CELL + CELL - 2];
  const p1: [number, number] = [b[0] * CELL + CELL - 3 - r() * 4, b[1] * CELL + 3];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    path.push([p0[0] + (p1[0] - p0[0]) * t + Math.sin(t * Math.PI * 2 + seed) * 3, p0[1] + (p1[1] - p0[1]) * t + Math.cos(t * Math.PI * 1.5 + seed) * 2.5]);
  }
  // forest on every non-member cell next to the sanctuary (and a ring around it)
  const forest: Terrain['forest'] = [];
  const kinds = ['pine', 'pine', 'oak', 'birch', 'pine', 'oak'];
  for (let y = -1; y <= rows; y++) {
    for (let x = -1; x <= cols; x++) {
      if (member.has(`${x},${y}`)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (member.has(`${x + dx},${y + dy}`)) { near = true; break; }
      if (!near) continue;
      const rr = rng(seed ^ ((x + 7) * 73856093) ^ ((y + 7) * 19349663));
      const above = member.has(`${x},${y - 1}`);
      for (let i = 0; i < 7; i++) {
        // trees just south of the meadow stand back a little so they don't hide it
        const ly = above ? 3.5 + rr() * (CELL - 3.5) : rr() * CELL;
        forest.push({ x: x * CELL + rr() * CELL, y: y * CELL + ly, k: kinds[Math.floor(rr() * kinds.length)], v: rr() });
      }
    }
  }
  forest.sort((p, q) => p.y - q.y);
  return { cols, rows, W: cols * CELL, H: rows * CELL, member, cells: norm, pond, path, forest, edge: 1.2 };
}

/** inside the sanctuary (not in the forest) with `m` units to spare */
export function inside(T: Terrain, x: number, y: number, m = T.edge) {
  const has = (px: number, py: number) => T.member.has(`${Math.floor(px / CELL)},${Math.floor(py / CELL)}`);
  return has(x, y) && has(x - m, y) && has(x + m, y) && has(x, y - m) && has(x, y + m);
}
export function inPond(T: Terrain, x: number, y: number, m = 0) {
  const p = T.pond;
  if (!p) return false;
  return ((x - p.x) / (p.rx + m)) ** 2 + ((y - p.y) / (p.ry + m)) ** 2 < 1;
}

export type Solid = { x: number; y: number; r: number };
export function solidsOf(layout: Decor[]): Solid[] {
  const out: Solid[] = [];
  for (const d of layout) { const def = DECOR_BY_K[d.k]; if (def && def.r > 0) out.push({ x: d.x, y: d.y, r: def.r }); }
  return out;
}
/** can a body of radius `r` stand here? */
export function walkable(T: Terrain, solids: Solid[], x: number, y: number, r = 0.6) {
  if (!inside(T, x, y, T.edge * 0.5 + r * 0.5) || inPond(T, x, y, r * 0.6)) return false;
  for (const s of solids) if ((s.x - x) ** 2 + ((s.y - y) * 1.6) ** 2 < (s.r + r) ** 2) return false;
  return true;
}
/** can this decoration go here? (ignoring the item with id `skip`) */
export function canPlace(T: Terrain, layout: Decor[], k: string, x: number, y: number, skip?: string) {
  const def = DECOR_BY_K[k];
  if (!def || !inside(T, x, y, T.edge + Math.max(0.4, def.r * 0.6))) return false;
  if (inPond(T, x, y, def.flat ? 0.2 : def.r + 0.3) && k !== 'reeds' && k !== 'stones') return false;
  for (const d of layout) {
    if (d.id === skip) continue;
    const o = DECOR_BY_K[d.k];
    if (!o) continue;
    const min = def.r > 0 && o.r > 0 ? def.r + o.r + 0.2 : def.flat && o.flat ? 0.9 : Math.max(def.r, o.r) + 0.5;
    if ((d.x - x) ** 2 + ((d.y - y) * 1.4) ** 2 < min * min) return false;
  }
  return true;
}

/** a cosy starting layout, the same for everyone who visits before the owner decorates;
 *  it uses at most ~70% of the decoration allowance so there's room to add more */
export function defaultLayout(T: Terrain, seed: number, max = 30 + 20 * Math.max(0, T.cells.length / 2 - 1)): Decor[] {
  const r = rng(seed * 7 + 3);
  const out: Decor[] = [];
  const cap = Math.max(12, Math.floor(max * 0.7));
  let n = 0;
  const tryPut = (k: string, x: number, y: number) => {
    if (out.length >= cap) return true;
    x = Math.round(x * 4) / 4; y = Math.round(y * 4) / 4;
    if (canPlace(T, out, k, x, y)) { out.push({ id: `d${n++}`, k, x, y, f: r() < 0.5 ? 1 : 0 }); return true; }
    return false;
  };
  const around = (k: string, cx: number, cy: number, spread: number, tries = 20) => { for (let i = 0; i < tries; i++) if (tryPut(k, cx + (r() - 0.5) * spread, cy + (r() - 0.5) * spread)) return true; return false; };
  // the essentials first: somewhere to sleep, eat and play, a light and a sign
  const c0 = T.cells[0];
  const big = T.cells.length >= 4;
  const hx = c0[0] * CELL + CELL * (big ? 1 : 0.5), hy = c0[1] * CELL + CELL * (big ? 1 : 0.5);
  around('nest', hx - 5, hy + 3, 4, 40); around('bowl', hx - 1, hy + 5, 4, 40); around('ball', hx + 4, hy + 4, 4, 40); around('lantern', hx + 2, hy - 2, 5, 40); around('inkspring', hx + 1, hy + 1, 6, 40);
  around('berry', hx + 6, hy - 4, 5, 40); around('log', hx + 6, hy + 2, 6, 40); around('signpost', T.path[0][0] + 1.5, T.path[0][1] - 1.5, 3, 40);
  const p = T.pond;
  if (p) { around('reeds', p.x + p.rx, p.y - 0.3, 1.2); around('reeds', p.x - p.rx + 0.2, p.y + 0.5, 1.2); around('boulder', p.x - p.rx - 2, p.y - p.ry - 1, 2.5); }
  // then a scattering of woodland across every plot
  const rounds = [['oak', 'pine', 'flowers', 'bush', 'mushrooms'], ['blossom', 'flowers', 'rock', 'fern'], ['birch', 'flowers', 'stump', 'bush']];
  for (const round of rounds) {
    for (const [cx, cy] of T.cells) {
      const x0 = cx * CELL, y0 = cy * CELL;
      for (const k of round) {
        const tree = DECOR_BY_K[k].tag === 'tree';
        around(k, tree ? x0 + (r() < 0.5 ? 3.5 : CELL - 3.5) : x0 + CELL / 2, tree ? y0 + 3 + r() * (CELL - 6) : y0 + CELL / 2, tree ? 3 : CELL - 4);
      }
    }
  }
  return out;
}

/** paint the ground (grass, flowers, path, forest floor) once into an offscreen canvas */
export function paintGround(T: Terrain, seed: number, ppu: number) {
  const pad = CELL;
  const c = document.createElement('canvas');
  c.width = Math.ceil((T.W + pad * 2) * ppu); c.height = Math.ceil((T.H + pad * 2) * ppu);
  const g = c.getContext('2d')!;
  g.scale(ppu, ppu); g.translate(pad, pad);
  g.fillStyle = '#163D25'; g.fillRect(-pad, -pad, T.W + pad * 2, T.H + pad * 2);
  const r = rng(seed + 11);
  for (const [cx, cy] of T.cells) {
    const x0 = cx * CELL, y0 = cy * CELL;
    const gr = g.createLinearGradient(x0, y0, x0 + CELL, y0 + CELL);
    gr.addColorStop(0, '#5FB85A'); gr.addColorStop(1, '#4CA552');
    g.fillStyle = gr; g.fillRect(x0 - 0.02, y0 - 0.02, CELL + 0.04, CELL + 0.04);
    for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? 'rgba(130,210,110,0.35)' : 'rgba(40,120,60,0.22)'; g.beginPath(); g.ellipse(x0 + r() * CELL, y0 + r() * CELL, 0.6 + r() * 1.8, 0.4 + r() * 1.2, 0, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 70; i++) { const x = x0 + r() * CELL, y = y0 + r() * CELL; g.strokeStyle = 'rgba(30,100,45,0.45)'; g.lineWidth = 0.08; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 0.4, y - 0.5); g.stroke(); }
    for (let i = 0; i < 10; i++) { g.fillStyle = ['#FFF6C9', '#FFD1E6', '#FFFFFF', '#D9CCFF'][i % 4]; g.beginPath(); g.arc(x0 + r() * CELL, y0 + r() * CELL, 0.13, 0, Math.PI * 2); g.fill(); }
  }
  // soft dark fringe where meadow meets forest
  for (const [cx, cy] of T.cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (T.member.has(`${cx + dx},${cy + dy}`)) continue;
      const x0 = cx * CELL, y0 = cy * CELL;
      const ex = dx === 1 ? x0 + CELL : x0, ey = dy === 1 ? y0 + CELL : y0;
      const gr = dx ? g.createLinearGradient(ex, 0, ex - dx * 3, 0) : g.createLinearGradient(0, ey, 0, ey - dy * 3);
      gr.addColorStop(0, 'rgba(15,50,25,0.55)'); gr.addColorStop(1, 'rgba(15,50,25,0)');
      g.fillStyle = gr;
      if (dx) g.fillRect(dx === 1 ? ex - 3 : ex, y0, 3, CELL); else g.fillRect(x0, dy === 1 ? ey - 3 : ey, CELL, 3);
    }
  }
  // the path
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save();
  g.beginPath(); for (const [cx, cy] of T.cells) g.rect(cx * CELL + 0.6, cy * CELL + 0.6, CELL - 1.2, CELL - 1.2); g.clip();
  g.strokeStyle = '#C9A46B'; g.lineWidth = 2.4; g.beginPath(); T.path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.strokeStyle = '#DDBB82'; g.lineWidth = 1.5; g.stroke();
  for (let i = 0; i < T.path.length; i += 2) { const [x, y] = T.path[i]; g.fillStyle = 'rgba(150,115,70,0.5)'; g.beginPath(); g.arc(x + (r() - 0.5) * 1.2, y + (r() - 0.5) * 1.2, 0.2, 0, Math.PI * 2); g.fill(); }
  // pond bank
  const p = T.pond;
  if (p) {
    g.fillStyle = '#8C7A54'; g.beginPath(); g.ellipse(p.x, p.y, p.rx + 0.7, p.ry + 0.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#B9A675'; g.beginPath(); g.ellipse(p.x, p.y, p.rx + 0.35, p.ry + 0.3, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  return { canvas: c, pad, ppu };
}

// ---- sprite cache: still things are drawn once per zoom level and reused every frame ----
const sprites = new Map<string, { c: HTMLCanvasElement; ox: number; oy: number }>();
/** a cached picture of a decoration at `px` pixels per unit (feet at ox, oy) */
export function decorSprite(def: DecorDef, px: number) {
  const q = Math.max(2, 2 ** (Math.round(Math.log2(px) * 10) / 10)); // ~7% zoom steps
  const key = `${def.k}|${q}`;
  let sp = sprites.get(key);
  if (sp) return sp;
  if (sprites.size > 90) sprites.delete(sprites.keys().next().value!);
  const tree = def.tag === 'tree';
  const [hw, top, bot] = tree ? [4.6, 8.6, 1.4] : [2.8, 4, 1.2];
  const c = document.createElement('canvas');
  c.width = Math.ceil(hw * 2 * q); c.height = Math.ceil((top + bot) * q);
  const g = c.getContext('2d')!;
  g.translate(hw * q, top * q);
  def.draw(g, q, 0, 0);
  sp = { c, ox: hw * q, oy: top * q };
  sprites.set(key, sp);
  return sp;
}
