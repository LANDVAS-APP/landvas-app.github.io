// A Parasite wrapped around the whole plot it feeds on — the real outline, a merged plot of any shape included. The body
// coils and pulses along the edge, thicker with every feed (a thin tendril at 1, a smothering coil by 9), veins creep in
// towards the middle, and an eye watches from one corner. At 10 feeds it's a Symbiote: iridescent, looser, flowering.
// Your own parasite trails a glowing feeding tube back to its home plot; a harvest sends a pulse of Ink down it. When
// the host is peeling it off, it thrashes. One canvas over the map, redrawn only while one is on screen.
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { EnchantMap } from '../backend/api';
import { mapHandle } from '../map/mapHandle';
import { outlineEdges } from '../shared/fusion';
import { GRID_SIZE, cellCenter, xToLng, yToLat } from '../shared/grid';

type Att = EnchantMap['attached'][number];
/** who's being peeled right now (the PeelOff gesture), and a harvest pulse to send down a tether */
export const useWrapFx = create<{ peel: Record<string, number>; pulse: Record<string, number>; setPeel(id: string, p: number): void; pulseAt(id: string): void }>((set) => ({
  peel: {}, pulse: {},
  setPeel: (id, p) => set((s) => ({ peel: { ...s.peel, [id]: p } })),
  pulseAt: (id) => set((s) => ({ pulse: { ...s.pulse, [id]: performance.now() } })),
}));

/** chain a plot's outline edges into closed loops of cell-corner points */
function loops(cells: [number, number][]): [number, number][][] {
  const edges = outlineEdges(cells);
  const key = (p: [number, number]) => `${p[0]},${p[1]}`;
  const adj = new Map<string, [number, number][]>();
  for (const [a, b] of edges) { adj.set(key(a), [...(adj.get(key(a)) ?? []), b]); adj.set(key(b), [...(adj.get(key(b)) ?? []), a]); }
  const used = new Set<string>();
  const out: [number, number][][] = [];
  for (const [a, b] of edges) {
    const ek = `${key(a)}|${key(b)}`;
    if (used.has(ek)) continue;
    const loop: [number, number][] = [a];
    let prev = a, cur = b; used.add(ek); used.add(`${key(b)}|${key(a)}`);
    for (let guard = 0; guard < 2000 && key(cur) !== key(a); guard++) {
      loop.push(cur);
      const next = (adj.get(key(cur)) ?? []).find((n) => key(n) !== key(prev) && !used.has(`${key(cur)}|${key(n)}`));
      if (!next) break;
      used.add(`${key(cur)}|${key(next)}`); used.add(`${key(next)}|${key(cur)}`);
      prev = cur; cur = next;
    }
    if (loop.length > 2) out.push(loop);
  }
  return out;
}

export function ParasiteWraps({ ready, attached }: { ready: boolean; attached: Att[] }) {
  const cv = useRef<HTMLCanvasElement | null>(null);
  const shapes = useRef<{ a: Att; loops: [number, number][][]; centre: [number, number] }[]>([]);
  useEffect(() => {
    shapes.current = attached.map((a) => {
      const cells = (a.cells?.length ? a.cells : [[a.gx, a.gy]]) as [number, number][];
      const ls = loops(cells);
      const cx = cells.reduce((s, c) => s + c[0] + 0.5, 0) / cells.length, cy = cells.reduce((s, c) => s + c[1] + 0.5, 0) / cells.length;
      return { a, loops: ls, centre: [cx, cy] };
    });
  }, [attached]);
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const host = map.getCanvasContainer();
    const c = document.createElement('canvas');
    c.className = 'lv-wraps'; c.setAttribute('aria-hidden', 'true'); c.dataset.testid = 'parasite-wraps';
    host.insertBefore(c, map.getCanvas().nextSibling); cv.current = c;
    const dpr = Math.min(2, devicePixelRatio || 1);
    let raf = 0, last = 0;
    const toPx = (x: number, y: number) => map.project([xToLng(x / GRID_SIZE), yToLat(y / GRID_SIZE)]);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; last = t;
      const W = host.clientWidth, H = host.clientHeight;
      if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`; }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      if (c.dataset.wraps !== String(shapes.current.length)) c.dataset.wraps = String(shapes.current.length);
      if (map.getZoom() < 15.5 || !shapes.current.length) return;
      const fx = useWrapFx.getState();
      const time = t / 1000;
      for (const s of shapes.current) {
        const feeds = Math.min(10, s.a.feeds || 1), sym = s.a.stage >= 2;
        const cellPx = Math.max(2, toPx(s.centre[0] + 1, s.centre[1]).x - toPx(s.centre[0], s.centre[1]).x);
        const width = Math.max(2, cellPx * (0.05 + feeds * 0.028) * (sym ? 0.8 : 1));
        const peel = fx.peel[s.a.id] ?? 0;
        const amp = cellPx * (0.03 + peel * 0.22) * (sym ? 0.6 : 1);
        const ctr = toPx(s.centre[0], s.centre[1]);
        for (const loop of s.loops) {
          // walk the outline, with a slow coil along it
          const pts = loop.map(([x, y]) => toPx(x, y));
          const path: { x: number; y: number; n: number }[] = [];
          let dist = 0;
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i], q = pts[(i + 1) % pts.length];
            const len = Math.hypot(q.x - p.x, q.y - p.y), steps = Math.max(2, Math.ceil(len / 6));
            const nx = -(q.y - p.y) / (len || 1), ny = (q.x - p.x) / (len || 1);
            for (let k = 0; k < steps; k++) {
              const f = k / steps, d = dist + len * f;
              const wob = Math.sin(d * 0.07 - time * (sym ? 1.4 : 3.2)) * amp + (peel ? Math.sin(d * 0.3 + time * 18) * amp * 0.6 : 0);
              path.push({ x: p.x + (q.x - p.x) * f + nx * wob, y: p.y + (q.y - p.y) * f + ny * wob, n: d });
            }
            dist += len;
          }
          if (path.length < 3) continue;
          // veins creeping in toward the middle
          g.lineCap = 'round';
          const veins = Math.min(14, 2 + feeds);
          for (let v = 0; v < veins; v++) {
            const p = path[Math.floor((v / veins) * path.length)];
            const reach = 0.12 + (feeds / 10) * 0.32;
            g.strokeStyle = sym ? 'rgba(61,220,151,0.45)' : 'rgba(176,38,255,0.45)'; g.lineWidth = Math.max(1, width * 0.22);
            g.beginPath(); g.moveTo(p.x, p.y);
            const mx = p.x + (ctr.x - p.x) * reach * 0.5 + Math.sin(v + time) * width, my = p.y + (ctr.y - p.y) * reach * 0.5 + Math.cos(v + time) * width;
            g.quadraticCurveTo(mx, my, p.x + (ctr.x - p.x) * reach, p.y + (ctr.y - p.y) * reach); g.stroke();
          }
          // the body
          const grad = g.createLinearGradient(ctr.x - cellPx, ctr.y - cellPx, ctr.x + cellPx, ctr.y + cellPx);
          if (sym) { const h = (time * 40) % 360; grad.addColorStop(0, `hsl(${h},90%,65%)`); grad.addColorStop(0.5, `hsl(${(h + 120) % 360},90%,62%)`); grad.addColorStop(1, `hsl(${(h + 240) % 360},90%,65%)`); }
          else { grad.addColorStop(0, '#7CFF6B'); grad.addColorStop(1, '#B026FF'); }
          g.shadowColor = sym ? '#3DDC97' : '#7CFF6B'; g.shadowBlur = 10;
          g.strokeStyle = grad; g.lineWidth = width; g.lineJoin = 'round';
          g.beginPath(); path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke();
          g.shadowBlur = 0;
          // its segments / suckers (a Symbiote flowers instead)
          for (let i = 0; i < path.length; i += Math.max(3, Math.round(20 / Math.max(1, width / 4)))) {
            const p = path[i];
            if (sym) {
              if (i % 4 === 0) for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + time; g.fillStyle = '#FF8FD0'; g.beginPath(); g.arc(p.x + Math.cos(a) * width * 0.5, p.y + Math.sin(a) * width * 0.5, width * 0.28, 0, 7); g.fill(); }
              g.fillStyle = '#FFE14D'; g.beginPath(); g.arc(p.x, p.y, Math.max(1, width * 0.18), 0, 7); g.fill();
            } else { g.fillStyle = 'rgba(11,31,8,0.55)'; g.beginPath(); g.arc(p.x, p.y, Math.max(0.8, width * 0.22), 0, 7); g.fill(); }
          }
          // the head: an eye that blinks
          const h = path[0], blink = Math.sin(time * 1.3) > 0.97;
          g.fillStyle = sym ? '#3DDC97' : '#7CFF6B'; g.beginPath(); g.arc(h.x, h.y, width * 1.15, 0, 7); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.ellipse(h.x, h.y, width * 0.62, blink ? 0.6 : width * 0.62, 0, 0, 7); g.fill();
          if (!blink) { g.fillStyle = '#0B1F08'; g.beginPath(); g.arc(h.x + Math.cos(time) * width * 0.2, h.y, width * 0.3, 0, 7); g.fill(); }
        }
        // the feeding tube back to its home (your own parasites)
        if (s.a.home) {
          const [hl, ht] = cellCenter(s.a.home[0], s.a.home[1]);
          const hp = map.project([hl, ht]);
          g.save();
          g.strokeStyle = sym ? 'rgba(61,220,151,0.7)' : 'rgba(124,255,107,0.7)'; g.lineWidth = 3; g.setLineDash([6, 8]); g.lineDashOffset = -time * 30;
          g.shadowColor = '#7CFF6B'; g.shadowBlur = 8;
          g.beginPath(); g.moveTo(ctr.x, ctr.y); g.quadraticCurveTo((ctr.x + hp.x) / 2, Math.min(ctr.y, hp.y) - 60, hp.x, hp.y); g.stroke();
          const since = (performance.now() - (fx.pulse[s.a.id] ?? -1e9)) / 1000;
          if (since < 2) {
            const f = since / 2, u = 1 - f, qx = (ctr.x + hp.x) / 2, qy = Math.min(ctr.y, hp.y) - 60;
            const px = u * u * ctr.x + 2 * u * f * qx + f * f * hp.x, py = u * u * ctr.y + 2 * u * f * qy + f * f * hp.y;
            g.setLineDash([]); g.fillStyle = '#B79CFF'; g.shadowColor = '#B79CFF'; g.shadowBlur = 20; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill();
          }
          g.restore();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.remove(); cv.current = null; };
  }, [ready]);
  return null;
}
