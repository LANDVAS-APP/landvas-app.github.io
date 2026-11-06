// Animated things drawn over the map on one canvas (it sits under the map's markers, so the
// explorer and labels stay on top, and never takes a tap):
//  * the merge animation — picked plots pull together, the seams between them dissolve into
//    sparkles, and a rainbow outline traces the new, single canvas
//  * Inkborn living on habitat plots — the real creatures (their own genomes, drawn by the same
//    rig as the sanctuary) wandering, napping and hopping about their home plots
// Everything is kept in grid coordinates and projected every frame, so it moves with the map
// (pans, zooms and 3D tilt included). The loop sleeps when there's nothing to draw.
import type { Map as MLMap } from 'maplibre-gl';
import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../backend/api';
import { config } from '../env';
import type { Resident } from '../backend/types';
import { drawCreature, heart, type CreatureState } from '../inkborn/rig';
import { cleanGenome, type Genome } from '../inkborn/genome';
import { useUi } from '../lib/store';
import { sfx } from '../arcade/sfx';
import { buzz } from '../native/native';
import { outlineEdges } from '../shared/fusion';
import { GRID_LEVEL, GRID_SIZE, type CellTuple, xToLng, yToLat } from '../shared/grid';
import type { PlotBlocks } from './plotTiles';
import { isPhone } from '../lib/gfx';

// canvas shadows (glows) are very slow in Safari: phones get the same strokes without the blur
const PHONE = isPhone();
const SHADOW = !PHONE;

/** Inkborn show on the map from this zoom (a plot is ~22 px across). */
export const RESIDENTS_MIN_ZOOM = GRID_LEVEL - 3.5;
const MAX_DRAWN = 48;

// ---- merge animation ----------------------------------------------------------------------
type MergeFx = { id: number; groups: CellTuple[][]; start: number; dur: number };
export const useMapFx = create<{ merges: MergeFx[]; playMerge(groups: CellTuple[][]): void; done(id: number): void }>((set, get) => ({
  merges: [],
  playMerge: (groups) => {
    const reduce = useUi.getState().settings.reduceMotion;
    set({ merges: [...get().merges, { id: Date.now() + Math.random(), groups: groups.filter((g) => g.length), start: performance.now(), dur: reduce ? 900 : 3200 }] });
    if (!reduce) sfx.fuse();
    kick();
  },
  done: (id) => set({ merges: get().merges.filter((m) => m.id !== id) }),
}));

/** The plots of these canvases, piece by piece, for the merge animation (taken before they merge). */
export async function mergePieces(cached: { id: string; cells: [number, number, ...unknown[]][] }[] | undefined, ids: string[]): Promise<CellTuple[][]> {
  let list = cached ?? [];
  if (ids.some((id) => !list.find((g) => g.id === id))) list = await api.myGroups().catch(() => list);
  return ids.map((id) => (list.find((g) => g.id === id)?.cells ?? []).map((c) => [c[0], c[1]] as CellTuple)).filter((c) => c.length);
}

const GROUP_COLORS = ['#22E3FF', '#FF3D9A', '#FFC93D', '#3DDC97', '#8B5CFF', '#FF8A3D'];
const RAINBOW = ['#22E3FF', '#8B5CFF', '#FF3D9A', '#FFC93D', '#3DDC97', '#22E3FF'];
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number; shape: 0 | 1 };

// ---- residents ----------------------------------------------------------------------------
type Sim = {
  id: string; group: string; name: string; g: Genome; mine: boolean; energy: number;
  x: number; y: number; tx: number; ty: number; dir: 1 | -1; st: CreatureState; until: number; speed: number; seed: number; hop: number;
};
const residents = new Map<string, { at: number; list: Resident[] }>();
const sims = new Map<string, Sim>();
let homes = new Map<string, CellTuple[]>(); // habitat group -> its plots in view

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const SPEED: Record<string, number> = { playful: 0.34, sleepy: 0.16, curious: 0.26, shy: 0.22, foodie: 0.2, brave: 0.3 };

function spotIn(cells: CellTuple[], r = Math.random): [number, number] {
  const [gx, gy] = cells[Math.floor(r() * cells.length)];
  return [gx + 0.18 + r() * 0.64, gy + 0.3 + r() * 0.6];
}

let pending: Promise<void> | null = null;
/** Look up who lives on the habitat plots now in view (cached for a minute). */
async function loadResidents(blocks: PlotBlocks, map: MLMap) {
  if (pending) return pending;
  pending = (async () => {
    try {
      if (map.getZoom() < RESIDENTS_MIN_ZOOM || useUi.getState().mode === 'canvas') { homes = new Map(); return; }
      const b = map.getBounds();
      const x0 = Math.floor(((b.getWest() + 180) / 360) * GRID_SIZE) - 1, x1 = Math.floor(((b.getEast() + 180) / 360) * GRID_SIZE) + 1;
      const yOf = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID_SIZE); };
      const y0 = yOf(b.getNorth()) - 1, y1 = yOf(b.getSouth()) + 1;
      const rows = await blocks.rowsIn(x0, y0, x1, y1, 16);
      const next = new Map<string, CellTuple[]>();
      for (const r of rows) {
        if (r[11] !== 'habitat' || !r[5]) continue;
        // keep x unwrapped next to the view so creatures near the antimeridian draw in place
        let gx = r[0];
        while (gx < x0 - 1) gx += GRID_SIZE;
        while (gx > x1 + 1) gx -= GRID_SIZE;
        const list = next.get(r[5]) ?? [];
        list.push([gx, r[1]]);
        next.set(r[5], list);
      }
      homes = next;
      const now = Date.now();
      const want = [...next.keys()].filter((id) => { const c = residents.get(id); return !c || now - c.at > 60_000; }).slice(0, 64);
      if (want.length) {
        const got = await api.habitatResidents(want);
        for (const id of want) residents.set(id, { at: now, list: got[id] ?? [] });
      }
      syncSims();
      kick();
    } catch {
      /* the map just shows the habitats without their residents for now */
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Forget cached residents (after you made, moved or released a creature). */
export function invalidateResidents() { residents.clear(); }

function syncSims() {
  const live = new Set<string>();
  let n = 0;
  for (const [group, cells] of homes) {
    for (const c of residents.get(group)?.list ?? []) {
      if (n >= MAX_DRAWN) break;
      n++;
      live.add(c.id);
      const s = sims.get(c.id);
      const g = cleanGenome(c.genome);
      if (s) {
        Object.assign(s, { g, name: c.name, energy: c.energy, group, mine: c.mine });
        // the habitat changed shape or moved out of view: start again inside it
        if (!cells.some(([x, y]) => Math.floor(s.x) === x && Math.floor(s.y) === y)) { [s.x, s.y] = spotIn(cells); s.tx = s.x; s.ty = s.y; }
        continue;
      }
      const r = (() => { let k = hash(c.id) * 1e9; return () => { k = (k * 16807) % 2147483647; return k / 2147483647; }; })();
      const [x, y] = spotIn(cells, r);
      sims.set(c.id, { id: c.id, group, name: c.name, g, mine: c.mine, energy: c.energy, x, y, tx: x, ty: y, dir: r() < 0.5 ? 1 : -1, st: c.energy < 20 ? 'sleep' : 'idle', until: performance.now() + r() * 2000, speed: SPEED[g.mood] ?? 0.25, seed: r() * 100, hop: 0 });
    }
  }
  for (const id of [...sims.keys()]) if (!live.has(id)) sims.delete(id);
}

function think(s: Sim, dt: number, now: number) {
  const cells = homes.get(s.group);
  if (!cells?.length) return;
  if (s.st === 'walk') {
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
    if (d < 0.02) { s.st = Math.random() < 0.35 ? 'look' : 'idle'; s.until = now + 1200 + Math.random() * 3200; return; }
    const step = Math.min(d, s.speed * dt);
    s.x += (dx / d) * step; s.y += (dy / d) * step;
    if (Math.abs(dx) > 0.004) s.dir = dx > 0 ? 1 : -1;
    return;
  }
  if (now < s.until) return;
  const roll = Math.random();
  if (s.energy < 20 && roll < 0.7) { s.st = 'sleep'; s.until = now + 8000 + Math.random() * 8000; return; }
  if (roll < 0.55) { [s.tx, s.ty] = spotIn(cells); s.st = 'walk'; }
  else if (roll < 0.7) { s.st = 'happy'; s.hop = now; s.until = now + 1300; }
  else if (roll < 0.8 && (s.g.mood === 'foodie' || Math.random() < 0.3)) { s.st = 'eat'; s.until = now + 2500; }
  else if (roll < 0.86) { s.st = 'sleep'; s.until = now + 5000 + Math.random() * 6000; }
  else { s.st = 'look'; s.until = now + 1500 + Math.random() * 2000; }
}

// ---- the overlay ----------------------------------------------------------------------------
let kick: () => void = () => {};
if (typeof window !== 'undefined' && (config.e2e || import.meta.env.DEV)) (window as any).__landvasMapFx = { store: useMapFx, kick: () => kick() };

export function MapFx({ map, blocks }: { map: MLMap | null; blocks: PlotBlocks }) {
  useEffect(() => {
    if (!map) return;
    const cv = document.createElement('canvas');
    cv.className = 'lv-mapfx';
    Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
    cv.setAttribute('aria-hidden', 'true');
    cv.dataset.testid = 'map-fx';
    // right after the map's own canvas: above the map, below every marker
    const host = map.getCanvasContainer();
    host.insertBefore(cv, map.getCanvas().nextSibling);
    const g = cv.getContext('2d')!;
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      const c = map.getCanvas();
      W = c.clientWidth; H = c.clientHeight; dpr = Math.min(PHONE ? 1.5 : 2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    };
    resize();
    map.on('resize', resize);

    const sparks: Spark[] = [];
    const burst = new Set<number>(); // merges that have thrown their confetti
    const seams = new Map<number, { x: number; y: number }[]>(); // per merge: seam midpoints, for sparkles
    const shook = new Set<number>();
    const shake = () => {
      const el = map.getContainer();
      if (useUi.getState().settings.reduceMotion) return;
      el.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,3px)' }, { transform: 'translate(4px,-4px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 280, easing: 'ease-out' });
    };
    const P = (gx: number, gy: number) => { const p = map.project([xToLng(gx / GRID_SIZE), yToLat(gy / GRID_SIZE)]); return [p.x, p.y] as const; };
    const quad = (gx: number, gy: number, k = 1, cx = 0, cy = 0) => {
      // a plot, optionally pulled toward (cx, cy) by factor k
      const pts = [[gx, gy], [gx + 1, gy], [gx + 1, gy + 1], [gx, gy + 1]].map(([x, y]) => P(cx + (x - cx) * k, cy + (y - cy) * k));
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath();
    };

    const drawMerge = (m: MergeFx, now: number) => {
      const t = (now - m.start) / m.dur;
      if (t >= 1) { useMapFx.getState().done(m.id); seams.delete(m.id); burst.delete(m.id); shook.delete(m.id); return; }
      const all = m.groups.flat();
      if (!all.length) return;
      const quick = m.dur < 1500;
      // the merged canvas' middle, in grid units
      let cx = 0, cy = 0;
      for (const [x, y] of all) { cx += x + 0.5; cy += y + 0.5; }
      cx /= all.length; cy /= all.length;
      const fadeOut = 1 - seg(t, 0.78, 1);
      // A. pull together: every piece squeezes in toward the middle, then settles
      // pieces lean in, then snap together hard (with a little overshoot) as they weld
      const pull = quick ? 0 : t < 0.46 ? ease(seg(t, 0, 0.46)) * 0.16 : 0.16 * (1 - ease(seg(t, 0.46, 0.6))) * Math.cos(seg(t, 0.46, 0.6) * Math.PI * 3);
      const unify = quick ? 1 : ease(seg(t, 0.32, 0.6));
      g.save();
      m.groups.forEach((cells, i) => {
        const col = GROUP_COLORS[i % GROUP_COLORS.length];
        let gx = 0, gy = 0;
        for (const [x, y] of cells) { gx += x + 0.5; gy += y + 0.5; }
        gx /= cells.length; gy /= cells.length;
        // each piece slides a little toward the middle of the whole
        const ox = (cx - gx) * pull, oy = (cy - gy) * pull;
        const pulse = 0.5 + 0.5 * Math.sin(now / 90 + i);
        for (const [x, y] of cells) {
          quad(x + ox, y + oy);
          g.globalAlpha = (0.42 + 0.25 * pulse) * (1 - unify * 0.75) * fadeOut;
          g.fillStyle = col; g.fill();
          if (unify > 0) { g.globalAlpha = 0.3 * unify * fadeOut; g.fillStyle = '#FFFFFF'; g.fill(); }
        }
        // each piece glows in its own colour until they become one
        if (unify < 1) {
          g.globalAlpha = (1 - unify) * fadeOut; g.strokeStyle = col; g.lineWidth = 3; g.shadowColor = col; g.shadowBlur = SHADOW ? 12 : 0;
          g.beginPath();
          for (const [[x1, y1], [x2, y2]] of outlineEdges(cells)) { const a = P(x1 + ox, y1 + oy), b = P(x2 + ox, y2 + oy); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
          g.stroke(); g.shadowBlur = 0;
        }
      });
      // B. the seams between the pieces glow, shrink to their middle and burst into sparkles
      const owner = new Map<string, number>();
      m.groups.forEach((cells, i) => cells.forEach(([x, y]) => owner.set(`${x},${y}`, i)));
      if (!seams.has(m.id)) {
        const mids: { x: number; y: number }[] = [];
        for (const [k, i] of owner) {
          const [x, y] = k.split(',').map(Number);
          const r = owner.get(`${x + 1},${y}`), d = owner.get(`${x},${y + 1}`);
          if (r !== undefined && r !== i) mids.push({ x: x + 1, y: y + 0.5 });
          if (d !== undefined && d !== i) mids.push({ x: x + 0.5, y: y + 1 });
        }
        seams.set(m.id, mids);
      }
      const mids = seams.get(m.id)!;
      const sk = quick ? 1 : seg(t, 0.2, 0.55);
      if (sk < 1) {
        g.lineCap = 'round';
        g.strokeStyle = '#FFFFFF'; g.shadowColor = '#FFFFFF'; g.shadowBlur = SHADOW ? 14 : 0;
        g.lineWidth = Math.max(2, 5 * (1 - sk));
        g.globalAlpha = 0.95 * (1 - sk * 0.4);
        g.beginPath();
        for (const s of mids) {
          const half = 0.5 * (1 - ease(sk));
          const horiz = s.x % 1 !== 0; // a seam along the bottom of a plot runs left-right
          const [ax, ay] = P(horiz ? s.x - half : s.x, horiz ? s.y : s.y - half), [bx, by] = P(horiz ? s.x + half : s.x, horiz ? s.y : s.y + half);
          g.moveTo(ax, ay); g.lineTo(bx, by);
        }
        g.stroke();
        g.shadowBlur = 0;
      }
      if (!burst.has(m.id) && t > (quick ? 0 : 0.48)) {
        burst.add(m.id);
        if (!quick) {
          for (const s of mids.slice(0, 40)) {
            const [x, y] = P(s.x, s.y);
            for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0, max: 0.7 + Math.random() * 0.5, c: RAINBOW[i % 5], r: 2 + Math.random() * 2.5, shape: 0 }); }
          }
          const [x, y] = P(cx, cy);
          for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: 0, max: 1 + Math.random() * 0.8, c: RAINBOW[i % 5], r: 3 + Math.random() * 3, shape: 1 }); }
        }
      }
      // B2. molten bridges grow across every seam from both sides and weld the pieces together, with
      // energy arcs crackling over them; then the whole thing flashes white-hot as one
      if (!quick) {
        const bk = seg(t, 0.12, 0.5), fade = 1 - seg(t, 0.55, 0.72);
        if (bk > 0 && fade > 0) {
          const [ax0] = P(0, 0), [ax1] = P(1, 0);
          const plotPx = Math.max(4, Math.hypot(ax1 - ax0, P(1, 0)[1] - P(0, 0)[1]));
          g.lineCap = 'round';
          // three welds per seam, growing in from both sides until they meet: one path, one glow (cheap on phones)
          const reach = 0.5 * ease(bk);
          const welds = new Path2D();
          for (const s of mids.slice(0, 160)) {
            const horiz = s.x % 1 !== 0;
            for (const o of [-0.28, 0, 0.28]) {
              const r = reach * (o ? 0.8 : 1);
              const [ax, ay] = P(horiz ? s.x + o : s.x - r, horiz ? s.y - r : s.y + o), [bx, by] = P(horiz ? s.x + o : s.x + r, horiz ? s.y + r : s.y + o);
              welds.moveTo(ax, ay); welds.lineTo(bx, by);
            }
          }
          const [mx0, my0] = P(cx - 3, cy), [mx1, my1] = P(cx + 3, cy);
          const wg = g.createLinearGradient(mx0, my0, mx1, my1); RAINBOW.forEach((c, i) => wg.addColorStop(i / (RAINBOW.length - 1), c));
          g.globalAlpha = 0.7 * fade; g.strokeStyle = wg; g.shadowColor = '#FFC93D'; g.shadowBlur = SHADOW ? 16 : 0; g.lineWidth = plotPx * 0.2 * ease(bk);
          g.stroke(welds);
          g.shadowBlur = 0; g.globalAlpha = 0.95 * fade; g.strokeStyle = '#FFF6D8'; g.lineWidth = plotPx * 0.07 * ease(bk);
          g.stroke(welds);
          // electric arcs jumping across the seams
          if (bk < 1 || t < 0.55) {
            g.strokeStyle = '#CFF8FF'; g.lineWidth = 1.6; g.globalAlpha = 0.9 * fade; g.shadowColor = '#22E3FF'; g.shadowBlur = SHADOW ? 10 : 0;
            g.beginPath();
            for (const s of mids.slice(0, 60)) {
              if (Math.random() < 0.45) continue;
              const horiz = s.x % 1 !== 0, along = (Math.random() - 0.5) * 0.8;
              let [x, y] = P(horiz ? s.x + along : s.x - 0.45, horiz ? s.y - 0.45 : s.y + along);
              const [ex, ey] = P(horiz ? s.x + along + (Math.random() - 0.5) * 0.3 : s.x + 0.45, horiz ? s.y + 0.45 : s.y + along + (Math.random() - 0.5) * 0.3);
              g.moveTo(x, y);
              for (let k = 1; k <= 5; k++) { const q = k / 5; x = x + (ex - x) / (6 - k) + (Math.random() - 0.5) * plotPx * 0.15; y = y + (ey - y) / (6 - k) + (Math.random() - 0.5) * plotPx * 0.15; g.lineTo(q === 1 ? ex : x, q === 1 ? ey : y); }
            }
            g.stroke(); g.shadowBlur = 0;
          }
        }
        // the flash: the whole new shape glows white-hot and cools into its own colours
        const fl = seg(t, 0.46, 0.5) * (1 - seg(t, 0.5, 0.8));
        if (fl > 0) {
          const shape = new Path2D();
          for (const [x, y] of all) { const pts = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]; shape.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) shape.lineTo(pts[i][0], pts[i][1]); shape.closePath(); }
          g.globalAlpha = 0.85 * fl; g.fillStyle = '#FFFFFF'; g.shadowColor = '#FFF1B8'; g.shadowBlur = SHADOW ? all.length > 60 ? 0 : 24 : 0;
          g.fill(shape);
          g.shadowBlur = 0;
        }
        // a little shake as they weld
        if (t > 0.46 && t < 0.56 && !shook.has(m.id)) { shook.add(m.id); shake(); if (useUi.getState().settings.haptics) buzz('heavy'); }
        // "FUSED!" over the middle, popping in and floating up
        const lt = seg(t, 0.5, 1);
        if (lt > 0) {
          const [mx, my] = P(cx, cy);
          const pop = lt < 0.15 ? 0.4 + (lt / 0.15) * 0.8 : lt < 0.25 ? 1.2 - ((lt - 0.15) / 0.1) * 0.2 : 1;
          g.save(); g.translate(mx, my - 30 - lt * 40); g.scale(pop, pop);
          g.globalAlpha = Math.min(1, (1 - lt) * 3);
          g.font = '900 30px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = 6; g.strokeStyle = 'rgba(20,10,40,0.85)'; g.strokeText('FUSED!', 0, 0);
          const tg = g.createLinearGradient(-60, 0, 60, 0); RAINBOW.forEach((c, i) => tg.addColorStop(i / (RAINBOW.length - 1), c));
          g.fillStyle = tg; g.fillText('FUSED!', 0, 0);
          g.font = '800 14px ui-rounded, system-ui, sans-serif'; g.lineWidth = 4; g.strokeText(`${all.length} plots · one place`, 0, 26); g.fillStyle = '#fff'; g.fillText(`${all.length} plots · one place`, 0, 26);
          g.restore();
        }
      }
      // C. one rainbow outline traces itself around the new canvas, with a shockwave from the middle
      const edges = outlineEdges(all);
      const tr = quick ? 1 : ease(seg(t, 0.45, 0.85));
      if (tr > 0) {
        const [mx, my] = P(cx, cy);
        const ang = (e: [[number, number], [number, number]]) => { const [x, y] = P((e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2); return (Math.atan2(y - my, x - mx) + Math.PI * 2.5) % (Math.PI * 2); };
        const lim = tr * Math.PI * 2;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const segs = edges.map((e) => { const a = P(e[0][0], e[0][1]), b = P(e[1][0], e[1][1]); minX = Math.min(minX, a[0], b[0]); maxX = Math.max(maxX, a[0], b[0]); minY = Math.min(minY, a[1], b[1]); maxY = Math.max(maxY, a[1], b[1]); return { a, b, ang: ang(e) }; });
        const gr = g.createLinearGradient(minX, minY, maxX, maxY);
        RAINBOW.forEach((c, i) => gr.addColorStop(i / (RAINBOW.length - 1), c));
        g.globalAlpha = fadeOut;
        g.lineCap = 'round';
        for (const [w, blur, a] of [[9, 18, 0.45], [3.5, 0, 1]] as const) {
          g.strokeStyle = gr; g.lineWidth = w; g.shadowColor = '#8B5CFF'; g.shadowBlur = SHADOW ? blur : 0; g.globalAlpha = a * fadeOut;
          g.beginPath();
          for (const s of segs) if (s.ang <= lim) { g.moveTo(s.a[0], s.a[1]); g.lineTo(s.b[0], s.b[1]); }
          g.stroke();
        }
        g.shadowBlur = 0;
        if (!quick) {
          const k = seg(t, 0.5, 0.95);
          if (k > 0 && k < 1) {
            const rad = Math.max(maxX - minX, maxY - minY) * (0.3 + k * 0.9);
            g.globalAlpha = (1 - k) * 0.8; g.strokeStyle = '#FFFFFF'; g.lineWidth = 3 + 6 * (1 - k);
            g.beginPath(); g.ellipse(mx, my, rad, rad * Math.max(0.4, (maxY - minY) / Math.max(1, maxX - minX) || 1), 0, 0, Math.PI * 2); g.stroke();
          }
        }
      }
      g.restore();
    };

    const drawSparks = (dt: number) => {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.vx *= 0.985;
        if (p.life >= p.max) { sparks.splice(i, 1); continue; }
        g.globalAlpha = 1 - p.life / p.max;
        g.fillStyle = p.c;
        if (p.shape) { g.save(); g.translate(p.x, p.y); g.rotate(p.life * 8 + p.r); g.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); g.restore(); }
        else { g.beginPath(); g.arc(p.x, p.y, p.r * (1 - p.life / p.max), 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
    };

    const labels = new Map<string, HTMLCanvasElement>();
    const label = (name: string) => {
      let c = labels.get(name);
      if (c) return c;
      c = document.createElement('canvas');
      const x = c.getContext('2d')!;
      const font = '700 22px ui-rounded, system-ui, sans-serif';
      x.font = font;
      const w = Math.ceil(x.measureText(name).width + 20);
      c.width = w; c.height = 32;
      x.fillStyle = 'rgba(10,20,15,0.62)'; x.beginPath(); x.roundRect(0, 0, w, 32, 16); x.fill();
      x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText(name, w / 2, 17);
      labels.set(name, c);
      return c;
    };

    const drawResidents = (dt: number, now: number) => {
      if (!sims.size || map.getZoom() < RESIDENTS_MIN_ZOOM || useUi.getState().mode === 'canvas') return false;
      const t = useUi.getState().settings.reduceMotion ? 0 : now / 1000;
      const items: { s: Sim; x: number; y: number; px: number }[] = [];
      for (const s of sims.values()) {
        think(s, dt, now);
        const [x, y] = P(s.x, s.y);
        const [x2] = P(s.x + 1, s.y);
        const plotPx = Math.abs(x2 - x);
        const px = Math.max(12, Math.min(110, plotPx * 0.36)) * (0.85 + 0.15 * (s.g.size ?? 1));
        if (x < -px || x > W + px || y < -px || y > H + px * 2) continue;
        items.push({ s, x, y, px });
      }
      items.sort((a, b) => a.y - b.y);
      for (const { s, x, y, px } of items) {
        const hopY = s.st === 'happy' ? Math.abs(Math.sin(((now - s.hop) / 1000) * 7)) * px * 0.18 : 0;
        drawCreature(g, s.g, x, y - hopY, px, { t: t + s.seed, state: s.st, dir: s.dir, look: s.st === 'look' ? Math.sin(t * 1.3 + s.seed) : 0, seed: s.seed });
        if (s.st === 'sleep' && px > 20) { g.fillStyle = '#E6ECFF'; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.seed); g.font = `800 ${Math.round(px * 0.35)}px ui-rounded, system-ui`; g.fillText('z', x + px * 0.35, y - px * (1.1 + 0.1 * Math.sin(t))); g.globalAlpha = 1; }
        if (s.st === 'happy' && s.mine && px > 24) heart(g, x + px * 0.4, y - px * 1.25 - hopY, px * 0.12);
        if (px >= 40) {
          const lb = label(s.name);
          g.drawImage(lb, x - lb.width / 4, y - px * 1.25 - 20 - hopY, lb.width / 2, lb.height / 2);
        }
      }
      return items.length > 0;
    };

    let raf = 0, last = performance.now(), running = false, moving = false;
    const frame = (now: number) => {
      // phones: creatures wandering about need only 30 fps (the map moving still gets every frame)
      if (PHONE && !moving && now - last < 30 && !useMapFx.getState().merges.length) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const merges = useMapFx.getState().merges;
      const any = drawResidents(dt, now);
      for (const m of merges) drawMerge(m, now);
      drawSparks(dt);
      if (any || merges.length || sparks.length) raf = requestAnimationFrame(frame);
      else { running = false; g.clearRect(0, 0, W, H); }
    };
    const wake = () => { if (!running && !document.hidden) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
    kick = wake;

    const load = () => void loadResidents(blocks, map).then(wake);
    map.on('moveend', load);
    map.on('move', wake);
    const ms = () => { moving = true; }, me = () => { moving = false; };
    map.on('movestart', ms); map.on('moveend', me);
    const timer = setInterval(load, 30_000);
    const unsubMode = useUi.subscribe((s, p) => { if (s.mode !== p.mode) load(); });
    const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); running = false; } else wake(); };
    document.addEventListener('visibilitychange', vis);
    if (map.loaded()) load(); else map.once('load', load);
    return () => {
      cancelAnimationFrame(raf); running = false; kick = () => {};
      map.off('resize', resize); map.off('moveend', load); map.off('move', wake); map.off('movestart', ms); map.off('moveend', me);
      clearInterval(timer); unsubMode();
      document.removeEventListener('visibilitychange', vis);
      cv.remove();
    };
  }, [map, blocks]);
  return null;
}
