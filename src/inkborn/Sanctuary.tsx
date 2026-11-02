// The living sanctuary (/habitat/:id): a 2.5D woodland you walk around as your explorer,
// where your Inkborn wander, nap in nests, snack at berry bushes, chase balls and come when
// called. Owners can decorate it. Rendering is one canvas: a pre-painted ground layer, then
// trees, decorations, creatures and the explorer depth-sorted, with only what's on screen drawn.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, FlipHorizontal2, Hand, Heart, Info, Megaphone, Minus, Paintbrush, Plus, Sparkles, Trash2, Utensils, X, Volleyball } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Decor, Habitat, Inkborn } from '../backend/types';
import { holdUpdates } from '../app/updates';
import { config } from '../env';
import { explorerSvg } from '../explorer/character';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { Button, Spinner } from '../ui';
import { REACTIONS, bondLevel } from './care';
import { CreatureView } from './CreatureView';
import { MOOD_INFO, cleanGenome, type Genome } from './genome';
import { CreatureProfile, Meter } from './Profile';
import { drawCreature, heart, type CreatureState } from './rig';
import { CELL, DECOR, DECOR_BY_K, TILT, canPlace, decorSprite, decorVariant, defaultLayout, makeTerrain, paintGround, rng, solidsOf, walkable, type Solid, type Terrain } from './world';

export default function Sanctuary() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['habitat', id ?? 'starter'], queryFn: () => api.habitatGet(id ?? null), staleTime: 30_000, refetchOnMount: 'always' });
  if (q.isLoading) return <div className="fixed inset-0 flex items-center justify-center bg-[#0f2a1a]"><Spinner /></div>;
  if (q.error || !q.data) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#0f2a1a] p-6 text-center text-white">
        <div className="text-4xl">🌲</div><p>This sanctuary couldn’t be found.</p>
        <Link to="/inkborn"><Button variant="secondary">Back to Inkborn</Button></Link>
      </div>
    );
  }
  // a habitat that grew (or shrank) gets a fresh world built from its new shape
  return <Game key={`${q.data.id}:${q.data.cells.map((c) => c.join(',')).join(';')}`} h={q.data} />;
}

// ---- simulation types ------------------------------------------------------------------
type Task = 'wander' | 'come' | 'food' | 'bed' | 'toy' | 'look' | 'flee';
type Sim = {
  c: Inkborn; g: Genome; x: number; y: number; dir: 1 | -1; st: CreatureState; until: number;
  tx: number; ty: number; task: Task | null; after: CreatureState | null; stuck: number; seed: number; speed: number; nextPet: number;
};
type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: 'heart' | 'spark' | 'text' | 'zz' | 'crumb' | 'ring'; text?: string; color?: string };
type Mode = 'play' | 'decor';

const SPEED: Record<Genome['mood'], number> = { playful: 3.6, sleepy: 2.2, curious: 3.0, shy: 3.2, foodie: 2.7, brave: 3.4 };
const PLAYER_SPEED = 7;
/** connected habitat plots make a bigger place */
export const sizeName = (plots: number) => (plots >= 16 ? 'grand sanctuary' : plots >= 9 ? 'forest' : plots >= 4 ? 'woodland' : plots >= 2 ? 'meadow' : 'small glade');
const LABEL_SCALE = 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function Game({ h }: { h: Habitat }) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const owner = h.is_owner;
  const T = useMemo(() => makeTerrain(h.cells, h.seed), [h.cells, h.seed]);
  // a fresh habitat starts decorated; when it grows, the newly joined plots get their own trees and flowers
  const grownInto = useRef(false);
  const startLayout = useMemo(() => {
    const full = defaultLayout(T, h.seed, 30 + 20 * Math.max(0, h.plots - 1));
    if (!h.layout.length && h.layout_rev === 0) return full;
    const used = new Set(h.layout.map((d) => `${Math.floor(d.x / CELL)},${Math.floor(d.y / CELL)}`));
    const bare = new Set(T.cells.map(([x, y]) => `${x},${y}`).filter((k) => !used.has(k)));
    if (!bare.size || !h.is_owner) return h.layout;
    const add = full.filter((d) => bare.has(`${Math.floor(d.x / CELL)},${Math.floor(d.y / CELL)}`) && canPlace(T, h.layout, d.k, d.x, d.y))
      .map((d, i) => ({ ...d, id: `g${h.layout_rev}x${i}` }));
    if (!add.length) return h.layout;
    grownInto.current = true;
    return [...h.layout, ...add].slice(0, 30 + 20 * Math.max(0, h.plots - 1));
  }, [h.layout, h.layout_rev, h.is_owner, T, h.seed, h.plots]);
  const maxDecor = 30 + 20 * Math.max(0, h.plots - 1);

  const cv = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('play');
  const [sel, setSel] = useState<string | null>(null); // selected creature
  const [profile, setProfile] = useState<Inkborn | null>(null);
  const [, bump] = useState(0);
  const [place, setPlace] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null); // selected decoration (decorate mode)
  const [layout, setLayout] = useState<Decor[]>(startLayout);
  const [rev, setRev] = useState(h.layout_rev);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState(() => !safeStorage<boolean>('landvas.sanctuary.hinted', false));
  const [group, setGroup] = useState<(typeof DECOR)[number]['group']>('Trees');

  // ---- the engine's mutable state (read by the loop every frame) ----
  const E = useRef<{
    T: Terrain; layout: Decor[]; solids: Solid[]; sims: Sim[]; parts: Part[];
    player: { x: number; y: number; dir: 1 | -1; walking: boolean; tx: number | null; ty: number | null; bob: number };
    cam: { x: number; y: number; z: number; ox: number; oy: number }; joy: { x: number; y: number }; keys: Set<string>;
    mode: Mode; place: string | null; pick: string | null; ghost: { x: number; y: number; ok: boolean } | null; sel: string | null;
    W: number; H: number; dpr: number; maxDpr: number;
  } | null>(null);

  if (!E.current) {
    const solids = solidsOf(startLayout);
    const r = rng(h.seed + 99);
    const randPt = (): [number, number] => {
      for (let i = 0; i < 200; i++) { const x = r() * T.W, y = r() * T.H; if (walkable(T, solids, x, y, 0.8)) return [x, y]; }
      return [T.cells[0][0] * CELL + CELL / 2, T.cells[0][1] * CELL + CELL / 2];
    };
    let [px, py] = T.path[Math.floor(T.path.length / 2)];
    if (!walkable(T, solids, px, py, 0.8)) [px, py] = randPt();
    const sims: Sim[] = h.creatures.map((c, i) => {
      const [x, y] = randPt();
      const g = cleanGenome(c.genome);
      return { c, g, x, y, dir: r() < 0.5 ? 1 : -1, st: 'idle', until: performance.now() + 400 + i * 300, tx: x, ty: y, task: null, after: null, stuck: 0, seed: r() * 100, speed: SPEED[g.mood] ?? 3, nextPet: 0 };
    });
    E.current = {
      T, layout: startLayout, solids, sims, parts: [],
      player: { x: px, y: py, dir: 1, walking: false, tx: null, ty: null, bob: 0 },
      cam: { x: px, y: py, z: 24, ox: 0, oy: 0 }, joy: { x: 0, y: 0 }, keys: new Set(),
      mode: 'play', place: null, pick: null, ghost: null, sel: null, W: 0, H: 0, dpr: 1, maxDpr: Math.min(2, devicePixelRatio || 1),
    };
  }
  const e = E.current;
  e.mode = mode; e.place = place; e.pick = pick; e.sel = sel;

  // the owner's first visit keeps the starting layout for good
  useEffect(() => {
    if (owner && ((h.layout_rev === 0 && h.layout.length === 0) || grownInto.current)) {
      api.habitatSaveLayout(h.id, startLayout, h.layout_rev).then((r) => setRev(r.layout_rev)).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the residents in step with the server (a creature made, moved or released elsewhere)
  useEffect(() => {
    const ids = new Set(h.creatures.map((c) => c.id));
    e.sims = e.sims.filter((s) => ids.has(s.c.id));
    for (const c of h.creatures) {
      const s = e.sims.find((x) => x.c.id === c.id);
      if (s) { s.c = c; s.g = cleanGenome(c.genome); continue; }
      const g = cleanGenome(c.genome);
      let x = e.player.x + 2, y = e.player.y + 0.5;
      for (let i = 0; i < 60 && !walkable(e.T, e.solids, x, y, 0.5); i++) { x = e.player.x + (Math.random() - 0.5) * 8; y = e.player.y + (Math.random() - 0.5) * 6; }
      e.sims.push({ c, g, x, y, dir: 1, st: 'idle', until: performance.now() + 800, tx: x, ty: y, task: null, after: null, stuck: 0, seed: Math.random() * 100, speed: SPEED[g.mood] ?? 3, nextPet: 0 });
    }
    bump((v) => v + 1);
  }, [h.creatures]); // eslint-disable-line react-hooks/exhaustive-deps

  // a newly released creature arrives with a burst of sparkles next to you
  const welcomed = useRef(false);
  useEffect(() => {
    const nid = sp.get('new');
    if (!nid || welcomed.current) return;
    const s = e.sims.find((x) => x.c.id === nid);
    if (!s) return; // fresh data is still on its way
    welcomed.current = true;
    s.x = e.player.x + 2; s.y = e.player.y + 0.5;
    if (!walkable(e.T, e.solids, s.x, s.y, 0.5)) { s.x = e.player.x; s.y = e.player.y; }
    s.st = 'happy'; s.until = performance.now() + 3000; s.task = null;
    burst(e.parts, s.x, s.y, 'spark', 24);
    for (let i = 0; i < 4; i++) e.parts.push({ x: s.x + (Math.random() - 0.5), y: s.y, vx: 0, vy: -1.6, life: 0, max: 1.4 + i * 0.2, kind: 'heart' });
    setSel(s.c.id);
    toast.success(`Say hello to ${s.c.name}!`, { description: 'Tap them to pet them, or try Feed and Play.' });
    sp.delete('new'); setSp(sp, { replace: true });
  }, [h.creatures]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => (mode === 'decor' ? holdUpdates() : undefined), [mode]);

  // ---- the explorer sprite ----
  const explorerImg = useMemo(() => {
    const img = new Image();
    const svg = explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 46).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return img;
  }, [me?.profile.explorer_style, me?.profile.accent_color]);

  // ---- the main loop ----
  useEffect(() => {
    const c = cv.current!;
    const g = c.getContext('2d')!;
    const ppu = clamp(Math.floor(2400 / (Math.max(T.W, T.H) + CELL * 2)), 2, 16);
    const ground = paintGround(T, h.seed, ppu);
    const flies = Array.from({ length: Math.min(36, 8 + T.cells.length * 6) }, (_, i) => ({ x: Math.random() * T.W, y: Math.random() * T.H, p: i * 1.7, s: 0.4 + Math.random() * 0.8 }));
    const hour = new Date().getHours();
    const night = hour >= 20 || hour < 6, dusk = !night && hour >= 17;
    let raf = 0, last = performance.now(), slow = 0, fast = 0;

    const resize = () => {
      const r = c.getBoundingClientRect();
      e.W = r.width; e.H = r.height;
      c.width = Math.round(r.width * e.dpr); c.height = Math.round(r.height * e.dpr);
    };
    e.dpr = e.maxDpr;
    resize();
    e.cam.z = clamp(Math.min(e.W, e.H * 1.3) / 27, 10, 30);
    const ro = new ResizeObserver(resize); ro.observe(c);

    const toScreen = (x: number, y: number): [number, number] => [(x - e.cam.x) * e.cam.z + e.W / 2, (y - e.cam.y) * e.cam.z * TILT + e.H / 2];

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // adaptive resolution: drop the pixel ratio on slow devices, restore it when there's headroom
      if (dt > 0.026) { slow += dt; fast = 0; } else if (dt < 0.015) { fast += dt; slow = Math.max(0, slow - dt); }
      // on a struggling device, draw fewer pixels (down to 60% resolution) and drop the extras
      if (slow > 1.5 && e.dpr > 0.6) { e.dpr = Math.max(0.6, e.dpr - (e.dpr > 1 ? 0.5 : 0.2)); slow = 0; resize(); }
      if (fast > 6 && e.dpr < e.maxDpr) { e.dpr = Math.min(e.maxDpr, e.dpr + 0.25); fast = 0; resize(); }
      step(dt, now);
      render(now);
      raf = requestAnimationFrame(frame);
    };

    // ---- simulation ----
    /** a step towards (ux, uy), turning up to ~100° either way to slip around trees and rocks */
    const ANGLES = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.75, -1.75];
    const steer = (x: number, y: number, ux: number, uy: number, len: number, r: number, bias: number): [number, number, boolean] | null => {
      const flip = Math.floor(bias) % 2 ? -1 : 1;
      for (const a0 of ANGLES) {
        const a = a0 * flip, c = Math.cos(a), sn = Math.sin(a);
        const vx = ux * c - uy * sn, vy = ux * sn + uy * c;
        const nx = x + vx * len, ny = y + vy * len;
        if (walkable(e.T, e.solids, nx, ny, r)) return [nx, ny, a0 !== 0];
      }
      return null;
    };
    const step = (dt: number, now: number) => {
      const P = e.player;
      if (e.mode === 'play') {
        let mx = e.joy.x, my = e.joy.y;
        const k = e.keys;
        if (k.has('a') || k.has('arrowleft')) mx -= 1;
        if (k.has('d') || k.has('arrowright')) mx += 1;
        if (k.has('w') || k.has('arrowup')) my -= 1;
        if (k.has('s') || k.has('arrowdown')) my += 1;
        if (mx || my) { P.tx = P.ty = null; }
        else if (P.tx !== null && P.ty !== null) {
          const dx = P.tx - P.x, dy = P.ty - P.y, d = Math.hypot(dx, dy);
          if (d < 0.25) { P.tx = P.ty = null; } else { mx = dx / d; my = dy / d; }
        }
        const m = Math.hypot(mx, my);
        P.walking = m > 0.05;
        if (P.walking) {
          const sp = (PLAYER_SPEED * Math.min(1, m)) / Math.max(1, m);
          const nx = P.x + mx * sp * dt, ny = P.y + my * sp * dt;
          if (!walkable(e.T, e.solids, P.x, P.y, 0.5)) { P.x = nx; P.y = ny; } // unstick (e.g. a tree was planted on you)
          else {
            const m = steer(P.x, P.y, mx / Math.max(1e-6, Math.hypot(mx, my)), my / Math.max(1e-6, Math.hypot(mx, my)), sp * Math.hypot(mx, my) * dt, 0.5, 0);
            if (m) { P.x = m[0]; P.y = m[1]; } else if (P.tx !== null) { P.tx = P.ty = null; }
          }
          if (Math.abs(mx) > 0.1) P.dir = mx > 0 ? 1 : -1;
          P.bob += dt * 10;
          e.cam.ox *= 0.9; e.cam.oy *= 0.9;
        }
        e.cam.x += (P.x + e.cam.ox - e.cam.x) * Math.min(1, dt * 5);
        e.cam.y += (P.y + e.cam.oy - e.cam.y) * Math.min(1, dt * 5);
      }
      e.cam.x = clamp(e.cam.x, -CELL / 2, e.T.W + CELL / 2); e.cam.y = clamp(e.cam.y, -CELL / 2, e.T.H + CELL / 2);
      for (const s of e.sims) think(s, dt, now);
      // gentle separation so creatures don't stack
      for (let i = 0; i < e.sims.length; i++) for (let j = i + 1; j < e.sims.length; j++) {
        const a = e.sims[i], b = e.sims[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 1.3) {
          const push = (1.3 - d) * 0.5 * dt * 4, ux = dx / d, uy = dy / d;
          if (walkable(e.T, e.solids, a.x - ux * push, a.y - uy * push, 0.4)) { a.x -= ux * push; a.y -= uy * push; }
          if (walkable(e.T, e.solids, b.x + ux * push, b.y + uy * push, 0.4)) { b.x += ux * push; b.y += uy * push; }
        }
      }
      for (let i = e.parts.length - 1; i >= 0; i--) {
        const p = e.parts[i];
        p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'crumb') p.vy += 9 * dt;
        if (p.life >= p.max) e.parts.splice(i, 1);
      }
    };

    const pickTarget = (s: Sim, task: Task): boolean => {
      const L = e.layout;
      const tagged = (tag: string) => L.filter((d) => DECOR_BY_K[d.k]?.tag === tag);
      const r = Math.random;
      const nearDecor = (d: Decor) => {
        const def = DECOR_BY_K[d.k];
        const side = r() < 0.5 ? -1 : 1;
        for (let i = 0; i < 8; i++) {
          const x = def.r > 0 ? d.x + side * (def.r + 0.9) : d.x + (r() - 0.5) * 0.6, y = def.r > 0 ? d.y + 0.5 + (r() - 0.5) : d.y + (r() - 0.5) * 0.3;
          if (walkable(e.T, e.solids, x, y, 0.4)) return [x, y] as const;
        }
        return null;
      };
      let pt: readonly [number, number] | null = null;
      if (task === 'food' || task === 'bed' || task === 'toy') {
        const opts = tagged(task);
        if (opts.length) pt = nearDecor(opts[Math.floor(r() * opts.length)]);
      } else if (task === 'look') {
        if (L.length) pt = nearDecor(L[Math.floor(r() * L.length)]);
      } else if (task === 'come') {
        for (let i = 0; i < 10 && !pt; i++) { const a = r() * Math.PI * 2, x = e.player.x + Math.cos(a) * 1.4, y = e.player.y + Math.sin(a) * 0.9 + 0.3; if (walkable(e.T, e.solids, x, y, 0.4)) pt = [x, y]; }
        if (!pt) pt = [e.player.x, e.player.y];
      } else if (task === 'flee') {
        const dx = s.x - e.player.x, dy = s.y - e.player.y, d = Math.hypot(dx, dy) || 1;
        for (let i = 0; i < 10 && !pt; i++) { const x = s.x + (dx / d) * (4 + r() * 3) + (r() - 0.5) * 3, y = s.y + (dy / d) * (4 + r() * 3) + (r() - 0.5) * 3; if (walkable(e.T, e.solids, x, y, 0.4)) pt = [x, y]; }
      }
      if (!pt) {
        const far = s.g.mood === 'brave' ? 14 : 8;
        for (let i = 0; i < 25 && !pt; i++) { const x = s.x + (r() - 0.5) * far * 2, y = s.y + (r() - 0.5) * far * 2; if (walkable(e.T, e.solids, x, y, 0.4)) pt = [x, y]; }
        if (task !== 'wander' && task !== 'come') task = 'wander';
      }
      if (!pt) return false;
      s.tx = pt[0]; s.ty = pt[1]; s.task = task; s.st = 'walk'; s.stuck = 0;
      return true;
    };

    const arrive = (s: Sim, now: number) => {
      const r = Math.random;
      const t = s.task;
      s.task = null;
      if (s.after) { s.st = s.after; s.after = null; s.until = now + (s.st === 'eat' ? 3200 : 2200); if (s.st === 'happy') hearts(s, 3); return; }
      if (t === 'food') { s.st = 'eat'; s.until = now + 2800 + r() * 2000; }
      else if (t === 'bed') { s.st = 'sleep'; s.until = now + 7000 + r() * 9000 * (s.g.mood === 'sleepy' ? 2 : 1); }
      else if (t === 'toy') { s.st = 'happy'; s.until = now + 2400; }
      else if (t === 'look') { s.st = 'look'; s.until = now + 2000 + r() * 1800; }
      else if (t === 'come') { s.st = 'happy'; s.until = now + 1600; hearts(s, 2); s.dir = e.player.x > s.x ? 1 : -1; }
      else { s.st = r() < 0.4 ? 'look' : 'idle'; s.until = now + 1200 + r() * 2800; }
    };

    const decide = (s: Sim, now: number) => {
      const r = Math.random;
      const m = s.g.mood;
      const dP = Math.hypot(s.x - e.player.x, s.y - e.player.y);
      if (s.c.energy < 20 && r() < 0.6 && pickTarget(s, 'bed')) return;
      const w: [Task | 'idle', number][] = [
        ['wander', 3], ['idle', 1.6], ['look', m === 'curious' ? 4 : 1.2], ['food', m === 'foodie' ? 4 : 0.9], ['bed', m === 'sleepy' ? 3.5 : 0.5],
        ['toy', m === 'playful' ? 3.5 : 0.8], ['come', dP < 12 ? (m === 'playful' || m === 'brave' ? 1.6 : m === 'shy' ? 0.1 : 0.7) : 0],
      ];
      let tot = w.reduce((a, [, v]) => a + v, 0), pickN = r() * tot;
      let task: Task | 'idle' = 'wander';
      for (const [k, v] of w) { pickN -= v; if (pickN <= 0) { task = k; break; } }
      if (task === 'idle') { s.st = 'idle'; s.until = now + 1500 + r() * 2500; return; }
      if (!pickTarget(s, task)) { s.st = 'idle'; s.until = now + 1500; }
    };

    const think = (s: Sim, dt: number, now: number) => {
      const dP = Math.hypot(s.x - e.player.x, s.y - e.player.y);
      if (s.st === 'walk') {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        if (d < 0.2) { arrive(s, now); return; }
        const sp = s.speed * (s.task === 'come' || s.task === 'flee' ? 1.6 : 1) * dt;
        const ux = dx / d, uy = dy / d;
        const step = Math.min(sp, d);
        if (!walkable(e.T, e.solids, s.x, s.y, 0.4)) { s.x += ux * step; s.y += uy * step; s.stuck = 0; }
        else {
          const m = steer(s.x, s.y, ux, uy, step, 0.4, s.seed);
          if (m) { s.x = m[0]; s.y = m[1]; s.stuck = m[2] ? s.stuck + dt * 0.25 : 0; } else s.stuck += dt;
        }
        if (Math.abs(ux) > 0.15) s.dir = ux > 0 ? 1 : -1;
        if (s.stuck > 1.2) { if (s.task === 'come') arrive(s, now); else { s.st = 'idle'; s.task = null; s.until = now + 600; } }
        return;
      }
      // react to the explorer walking up
      if (s.st !== 'sleep' && dP < 3.2 && e.mode === 'play') {
        if (s.g.mood === 'shy' && dP < 2.2 && s.st !== 'happy' && Math.random() < dt * 1.5) { pickTarget(s, 'flee'); return; }
        if (s.st === 'idle' || s.st === 'look') s.dir = e.player.x > s.x ? 1 : -1;
        if (s.g.mood === 'playful' && s.st === 'idle' && Math.random() < dt * 0.5) { s.st = 'happy'; s.until = now + 1200; }
      }
      if (s.st === 'eat' && Math.random() < dt * 3) e.parts.push({ x: s.x + s.dir * 0.6, y: s.y, vx: (Math.random() - 0.5) * 1.5, vy: -2.2, life: 0, max: 0.5, kind: 'crumb', color: '#E9A04C' });
      if (s.st === 'sleep' && Math.random() < dt * 0.7) e.parts.push({ x: s.x + 0.4, y: s.y, vx: 0.3, vy: -0.9, life: 0, max: 2.2, kind: 'zz' });
      if (now >= s.until) decide(s, now);
    };

    const hearts = (s: Sim, n: number) => { for (let i = 0; i < n; i++) e.parts.push({ x: s.x + (Math.random() - 0.5) * 1.2, y: s.y, vx: (Math.random() - 0.5) * 0.4, vy: -1.4 - Math.random() * 0.6, life: -i * 0.12, max: 1.4, kind: 'heart' }); };
    engine.current = { hearts, pickTarget, toScreen };
    if (config.e2e || import.meta.env.DEV) (window as any).__landvasSanctuary = { e, toScreen, fps: () => 1 / Math.max(0.001, (performance.now() - last) / 1000) };

    // ---- rendering ----
    // still things come from cached sprites (drawn at the device's pixel ratio); trees sway by a gentle skew
    const blit = (def: (typeof DECOR)[number], sx: number, sy: number, px: number, skew: number, flip: boolean) => {
      const sp = decorSprite(def, px * e.dpr);
      g.save(); g.translate(sx, sy);
      g.transform(flip ? -1 : 1, 0, skew, 1, 0, 0);
      g.scale(1 / e.dpr, 1 / e.dpr);
      g.drawImage(sp.c, -sp.ox, -sp.oy);
      g.restore();
    };
    const glow = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const gg = c.getContext('2d')!;
      const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(230,255,140,1)'); gr.addColorStop(0.35, 'rgba(230,255,140,0.35)'); gr.addColorStop(1, 'rgba(230,255,140,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
      return c;
    })();
    // name tags are drawn once and reused (text is slow to draw every frame on some phones)
    const labels = new Map<string, HTMLCanvasElement>();
    const label = (name: string) => {
      let c = labels.get(name);
      if (c) return c;
      c = document.createElement('canvas');
      const gg = c.getContext('2d')!;
      const font = `700 ${12 * LABEL_SCALE}px ui-rounded, system-ui, sans-serif`;
      gg.font = font;
      const w = Math.ceil(gg.measureText(name).width + 12 * LABEL_SCALE);
      c.width = w; c.height = 18 * LABEL_SCALE;
      gg.fillStyle = 'rgba(10,20,15,0.6)'; gg.beginPath(); gg.roundRect(0, 0, w, c.height, 9 * LABEL_SCALE); gg.fill();
      gg.font = font; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillStyle = '#fff'; gg.fillText(name, w / 2, c.height / 2 + LABEL_SCALE);
      labels.set(name, c);
      return c;
    };
    // one sunbeam, drawn once and stretched over the screen
    const beam = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const gg = c.getContext('2d')!;
      const bg = gg.createLinearGradient(0, 0, 40, 128);
      bg.addColorStop(0, 'rgba(255,245,200,0.07)'); bg.addColorStop(1, 'rgba(255,245,200,0)');
      gg.fillStyle = bg; gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(19, 0); gg.lineTo(64, 128); gg.lineTo(32, 128); gg.fill();
      return c;
    })();
    let vignette: { c: HTMLCanvasElement; w: number; h: number } | null = null;
    const vignetteFor = (W: number, H: number) => {
      if (vignette && vignette.w === W && vignette.h === H) return vignette.c;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W / 4)); c.height = Math.max(1, Math.round(H / 4));
      const gg = c.getContext('2d')!;
      const vw = c.width, vh = c.height;
      const vg = gg.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,20,10,0.5)');
      gg.fillStyle = vg; gg.fillRect(0, 0, vw, vh);
      vignette = { c, w: W, h: H };
      return c;
    };
    const render = (now: number) => {
      const t = reduce ? 0 : now / 1000;
      const { W, H } = e, z = e.cam.z;
      g.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
      g.fillStyle = '#0F2A1A'; g.fillRect(0, 0, W, H);
      // ground
      const [gx, gy] = toScreen(-ground.pad, -ground.pad);
      g.imageSmoothingEnabled = true;
      g.drawImage(ground.canvas, gx, gy, (ground.canvas.width / ground.ppu) * z, (ground.canvas.height / ground.ppu) * z * TILT);
      // pond
      const p = e.T.pond;
      if (p) {
        const [px, py] = toScreen(p.x, p.y);
        const wg = g.createRadialGradient(px - p.rx * z * 0.3, py - p.ry * z * TILT * 0.4, 0, px, py, p.rx * z);
        wg.addColorStop(0, '#7FD3F5'); wg.addColorStop(0.6, '#3E9FD8'); wg.addColorStop(1, '#2A78B8');
        g.fillStyle = wg; g.beginPath(); g.ellipse(px, py, p.rx * z, p.ry * z * TILT, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.clip();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, z * 0.06);
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.35 + i / 3) % 1);
          g.globalAlpha = 1 - k;
          g.beginPath(); g.ellipse(px + Math.sin(i * 2.1) * p.rx * z * 0.35, py + Math.cos(i * 1.7) * p.ry * z * TILT * 0.3, k * z * 1.6, k * z * 1.6 * TILT, 0, 0, Math.PI * 2); g.stroke();
        }
        g.globalAlpha = 1;
        // lily pads
        [[-0.45, 0.2], [0.35, -0.3], [0.1, 0.45]].forEach(([lx, ly], i) => {
          const x = px + lx * p.rx * z, y = py + ly * p.ry * z * TILT + Math.sin(t + i) * z * 0.05;
          g.fillStyle = '#3F9D4F'; g.beginPath(); g.ellipse(x, y, z * 0.7, z * 0.7 * TILT, 0, 0.4, Math.PI * 2 - 0.1); g.lineTo(x, y); g.fill();
          if (i === 1) { g.fillStyle = '#FF9FCB'; g.beginPath(); g.arc(x + z * 0.1, y - z * 0.15, z * 0.22, 0, Math.PI * 2); g.fill(); }
        });
        g.restore();
      }
      // depth-sorted things, only those on screen
      const items: { y: number; flat: boolean; draw(): void }[] = [];
      const vis = (sx: number, sy: number, mw: number, mh: number) => sx > -mw && sx < W + mw && sy > -mh * 0.3 && sy < H + mh;
      for (const f of e.T.forest) {
        const [sx, sy] = toScreen(f.x, f.y);
        if (!vis(sx, sy, 3 * z, 8 * z)) continue;
        const def = DECOR_BY_K[f.k];
        const sc = 0.8 + (Math.round(f.v * 3) / 3) * 0.25;
        items.push({ y: f.y, flat: false, draw: () => blit(def, sx, sy, z * sc, Math.sin(t * 0.9 + f.v * 7) * 0.025, false) });
      }
      for (const d of e.layout) {
        const def = DECOR_BY_K[d.k];
        if (!def) continue;
        const [sx, sy] = toScreen(d.x, d.y);
        if (!vis(sx, sy, 3 * z, 8 * z)) continue;
        const picked = e.mode === 'decor' && e.pick === d.id;
        items.push({ y: d.y, flat: !!def.flat, draw: () => {
          g.save(); g.translate(sx, sy);
          if (picked) { g.strokeStyle = '#FFE14D'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.ellipse(0, 0, Math.max(1.2, def.r + 0.6) * z, Math.max(1.2, def.r + 0.6) * z * TILT, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
          g.restore();
          if (def.live) { g.save(); g.translate(sx, sy); if (d.f) g.scale(-1, 1); def.draw(g, z, t, decorVariant(d.id)); g.restore(); }
          else blit(def, sx, sy, z, def.tag === 'tree' ? Math.sin(t * 0.9 + decorVariant(d.id) * 7) * 0.025 : 0, !!d.f);
        } });
      }
      for (const s of e.sims) {
        const [sx, sy] = toScreen(s.x, s.y);
        const px = 2.3 * z;
        if (!vis(sx, sy, px, px * 2)) continue;
        items.push({ y: s.y, flat: false, draw: () => {
          if (e.sel === s.c.id) {
            g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
            g.beginPath(); g.ellipse(sx, sy, px * 0.62, px * 0.62 * TILT * 0.6, 0, 0, Math.PI * 2); g.stroke();
          }
          drawCreature(g, s.g, sx, sy, px, { t: t + s.seed, state: s.st, dir: s.dir, look: s.st === 'look' ? Math.sin(t * 1.3 + s.seed) : 0, seed: s.seed });
          const near = Math.hypot(s.x - e.player.x, s.y - e.player.y) < 4;
          if (e.sel === s.c.id || near) {
            const lb = label(s.c.name);
            g.drawImage(lb, sx - lb.width / (2 * LABEL_SCALE), sy - px * s.g.size * 1.25 - 14, lb.width / LABEL_SCALE, lb.height / LABEL_SCALE);
          }
        } });
      }
      if (e.mode === 'play' && explorerImg.complete && explorerImg.naturalWidth) {
        const P = e.player;
        const [sx, sy] = toScreen(P.x, P.y);
        const hgt = 3.3 * z, wid = (hgt * 46) / 68;
        items.push({ y: P.y, flat: false, draw: () => {
          g.fillStyle = 'rgba(10,30,15,0.3)'; g.beginPath(); g.ellipse(sx, sy, wid * 0.36, wid * 0.14, 0, 0, Math.PI * 2); g.fill();
          const bob = P.walking ? Math.abs(Math.sin(P.bob)) * z * 0.18 : Math.sin(t * 2) * z * 0.03;
          g.save(); g.translate(sx, sy - bob); if (P.dir < 0) g.scale(-1, 1);
          g.drawImage(explorerImg, -wid / 2, -hgt, wid, hgt); g.restore();
        } });
      }
      items.sort((a, b) => (a.flat === b.flat ? a.y - b.y : a.flat ? -1 : 1));
      for (const it of items) it.draw();
      // placement ghost
      if (e.mode === 'decor' && e.ghost && e.place) {
        const def = DECOR_BY_K[e.place];
        const [sx, sy] = toScreen(e.ghost.x, e.ghost.y);
        g.save(); g.globalAlpha = 0.6; g.translate(sx, sy); def.draw(g, z, t, 0.5); g.restore();
        g.strokeStyle = e.ghost.ok ? '#3DDC97' : '#FF4D6D'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(sx, sy, Math.max(1, def.r + 0.5) * z, Math.max(1, def.r + 0.5) * z * TILT, 0, 0, Math.PI * 2); g.stroke();
      }
      // particles
      for (const p of e.parts) {
        if (p.life < 0) continue;
        const [sx, sy] = toScreen(p.x, p.y);
        const k = p.life / p.max, lift = p.life * z * 1.2;
        g.globalAlpha = Math.max(0, 1 - k);
        if (p.kind === 'heart') heart(g, sx, sy - z * 2.4 - lift, z * 0.32 * (1 + k * 0.4));
        else if (p.kind === 'zz') { g.fillStyle = '#E6ECFF'; g.font = `800 ${z * (0.45 + k * 0.4)}px ui-rounded, system-ui`; g.fillText('z', sx, sy - z * 2 - lift); }
        else if (p.kind === 'text') { g.font = `800 ${clamp(z * 0.6, 12, 18)}px ui-rounded, system-ui`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.strokeText(p.text!, sx, sy - z * 3.2 - lift); g.fillStyle = p.color ?? '#fff'; g.fillText(p.text!, sx, sy - z * 3.2 - lift); }
        else if (p.kind === 'crumb') { g.fillStyle = p.color!; g.fillRect(sx - 2, sy - z * 0.6, 3, 3); }
        else if (p.kind === 'ring') { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, k * z * 1.4, k * z * 1.4 * TILT, 0, 0, Math.PI * 2); g.stroke(); }
        else { g.fillStyle = p.color ?? '#FFE58A'; g.beginPath(); g.arc(sx, sy - z * 1.2, z * 0.14 * (1 - k), 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
      // light: time-of-day tint, sunbeams by day, glowing lanterns and fireflies by night
      if (night) { g.fillStyle = 'rgba(16,24,70,0.42)'; g.fillRect(0, 0, W, H); }
      else if (dusk) { g.fillStyle = 'rgba(255,130,60,0.10)'; g.fillRect(0, 0, W, H); }
      else if (!reduce && e.dpr >= 1) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const x = ((i * 0.37 + t * 0.012) % 1.3) * W * 1.2 - W * 0.2;
          g.drawImage(beam, x, 0, W * 0.4, H);
        }
        g.restore();
      }
      g.save(); g.globalCompositeOperation = 'lighter';
      if (night || dusk) for (const d of e.layout) {
        if (DECOR_BY_K[d.k]?.tag !== 'light') continue;
        const [sx, sy] = toScreen(d.x, d.y);
        const lg = g.createRadialGradient(sx, sy - z * 2.8, 0, sx, sy - z * 2.8, z * 6);
        lg.addColorStop(0, `rgba(255,200,110,${night ? 0.35 : 0.15})`); lg.addColorStop(1, 'rgba(255,200,110,0)');
        g.fillStyle = lg; g.fillRect(sx - z * 6, sy - z * 9, z * 12, z * 12);
      }
      const fa = e.dpr < 1 && !night ? 0 : night ? 0.9 : dusk ? 0.6 : 0.3;
      if (fa > 0) for (const f of flies) {
        const fx = f.x + Math.sin(t * 0.5 * f.s + f.p) * 2, fy = f.y + Math.cos(t * 0.4 * f.s + f.p * 1.3) * 1.5;
        const [sx, sy] = toScreen(fx, fy);
        if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
        g.globalAlpha = fa * (0.5 + 0.5 * Math.sin(t * 2.5 * f.s + f.p));
        g.drawImage(glow, sx - z * 0.6, sy - z * 2.4, z * 1.2, z * 1.2);
      }
      g.globalAlpha = 1;
      g.restore();
      g.drawImage(vignetteFor(W, H), 0, 0, W, H);
    };

    raf = requestAnimationFrame(frame);
    const vis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const engine = useRef<{ hearts(s: Sim, n: number): void; pickTarget(s: Sim, t: Task): boolean; toScreen(x: number, y: number): [number, number] } | null>(null);

  // ---- input ----
  const toWorld = useCallback((sx: number, sy: number): [number, number] => [(sx - e.W / 2) / e.cam.z + e.cam.x, (sy - e.H / 2) / (e.cam.z * TILT) + e.cam.y], [e]);
  const hitCreature = (sx: number, sy: number) => {
    let best: Sim | null = null, bd = Infinity;
    for (const s of e.sims) {
      const [cx, cy] = engine.current!.toScreen(s.x, s.y);
      const px = 2.3 * e.cam.z * s.g.size;
      const d = Math.hypot(sx - cx, sy - (cy - px * 0.45));
      if (d < Math.max(28, px * 0.7) && d < bd) { bd = d; best = s; }
    }
    return best;
  };
  const hitDecor = (sx: number, sy: number) => {
    let best: Decor | null = null;
    for (const d of e.layout) {
      const def = DECOR_BY_K[d.k];
      if (!def) continue;
      const [cx, cy] = engine.current!.toScreen(d.x, d.y);
      const w = Math.max(1.2, def.r + 0.6) * e.cam.z, hh = (def.tag === 'tree' ? 6.5 : d.k === 'lantern' || d.k === 'signpost' ? 3 : 1.8) * e.cam.z;
      if (sx > cx - w && sx < cx + w && sy > cy - hh && sy < cy + e.cam.z * 0.5 && (!best || d.y > best.y)) best = d;
    }
    return best;
  };

  const pointers = useRef(new Map<number, { x: number; y: number; sx: number; sy: number }>());
  const gesture = useRef<{ pinch?: { d: number; z: number }; moved: boolean; drag?: { id: string; ox: number; oy: number; x0: number; y0: number } } | null>(null);

  const onDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    pointers.current.set(ev.pointerId, { x, y, sx: x, sy: y });
    if (hint) { setHint(false); saveStorage('landvas.sanctuary.hinted', true); }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), z: e.cam.z }, moved: true };
      return;
    }
    gesture.current = { moved: false };
    if (e.mode === 'decor' && !e.place && e.pick) {
      const d = hitDecor(x, y);
      if (d && d.id === e.pick) { const [wx, wy] = toWorld(x, y); gesture.current.drag = { id: d.id, ox: d.x - wx, oy: d.y - wy, x0: d.x, y0: d.y }; }
    }
  };
  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (e.mode === 'decor' && e.place) { const [wx, wy] = toWorld(x, y); e.ghost = { x: wx, y: wy, ok: canPlace(e.T, e.layout, e.place, wx, wy) && e.layout.length < maxDecor }; }
    const p = pointers.current.get(ev.pointerId);
    if (!p) return;
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    const gs = gesture.current;
    if (!gs) return;
    if (gs.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      e.cam.z = clamp(gs.pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gs.pinch.d)), 8, 44);
      return;
    }
    if (!gs.moved && Math.hypot(x - p.sx, y - p.sy) > 8) gs.moved = true;
    if (!gs.moved) return;
    if (gs.drag) {
      const [wx, wy] = toWorld(x, y);
      const d = e.layout.find((q) => q.id === gs.drag!.id);
      if (d) { d.x = Math.round((wx + gs.drag.ox) * 4) / 4; d.y = Math.round((wy + gs.drag.oy) * 4) / 4; }
      return;
    }
    // drag to look around (play) or pan (decorate)
    if (e.mode === 'decor') { e.cam.x -= dx / e.cam.z; e.cam.y -= dy / (e.cam.z * TILT); }
    else { e.cam.ox = clamp(e.cam.ox - dx / e.cam.z, -20, 20); e.cam.oy = clamp(e.cam.oy - dy / (e.cam.z * TILT), -20, 20); }
  };
  const onUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    pointers.current.delete(ev.pointerId);
    const gs = gesture.current;
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!gs) return;
    if (gs.drag) {
      const d = e.layout.find((q) => q.id === gs.drag!.id);
      if (d && gs.moved) {
        if (canPlace(e.T, e.layout, d.k, d.x, d.y, d.id)) commitLayout([...e.layout]);
        else { d.x = gs.drag.x0; d.y = gs.drag.y0; toast('Not enough room there'); }
      }
      if (gs.moved) return;
    }
    if (gs.moved || gs.pinch) return;
    tap(x, y);
  };
  const onWheel = (ev: React.WheelEvent) => { e.cam.z = clamp(e.cam.z * (ev.deltaY > 0 ? 0.9 : 1.1), 8, 44); };

  const commitLayout = (l: Decor[]) => { e.layout = l; e.solids = solidsOf(l); setLayout(l); setDirty(true); };

  const tap = (x: number, y: number) => {
    const [wx, wy] = toWorld(x, y);
    if (e.mode === 'decor') {
      if (e.place) {
        if (e.layout.length >= maxDecor) { toast(`This sanctuary holds ${maxDecor} decorations — connect more habitat plots for more.`); return; }
        const qx = Math.round(wx * 4) / 4, qy = Math.round(wy * 4) / 4;
        if (!canPlace(e.T, e.layout, e.place, qx, qy)) { toast('Not enough room there'); return; }
        const d: Decor = { id: `u${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, k: e.place, x: qx, y: qy, f: 0 };
        // keep creatures from being trapped inside a new tree or rock
        commitLayout([...e.layout, d]);
        e.parts.push({ x: d.x, y: d.y, vx: 0, vy: 0, life: 0, max: 0.5, kind: 'ring' });
        return;
      }
      const d = hitDecor(x, y);
      setPick(d ? d.id : null);
      return;
    }
    const s = hitCreature(x, y);
    if (s) {
      setSel(s.c.id);
      if (s.st === 'sleep') { s.st = 'look'; s.until = performance.now() + 1500; }
      if (owner) void care(s, 'pet');
      else { engine.current?.hearts(s, 1); s.dir = e.player.x > s.x ? 1 : -1; }
      return;
    }
    e.player.tx = wx; e.player.ty = wy;
    e.parts.push({ x: wx, y: wy, vx: 0, vy: 0, life: 0, max: 0.6, kind: 'ring' });
  };

  // ---- keyboard ----
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.closest('input,textarea,select')) return;
      const k = ev.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.keys.add(k); ev.preventDefault(); if (hint) { setHint(false); saveStorage('landvas.sanctuary.hinted', true); } }
      if (k === '+' || k === '=') e.cam.z = clamp(e.cam.z * 1.15, 8, 44);
      if (k === '-') e.cam.z = clamp(e.cam.z / 1.15, 8, 44);
      if (k === 'escape') { setSel(null); setPlace(null); setPick(null); }
    };
    const up = (ev: KeyboardEvent) => e.keys.delete(ev.key.toLowerCase());
    const blur = () => e.keys.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [e, hint]);

  // ---- care ----
  const say = (s: Sim, text: string, color?: string) => e.parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0, max: 1.6, kind: 'text', text, color });
  const care = async (s: Sim, action: 'pet' | 'feed' | 'play') => {
    const now = performance.now();
    if (action === 'pet') {
      if (now < s.nextPet) { engine.current?.hearts(s, 1); return; }
      s.nextPet = now + 1500;
      s.st = 'happy'; s.until = now + 1500; s.task = null; s.dir = e.player.x > s.x ? 1 : -1;
      engine.current?.hearts(s, 3);
    } else {
      s.after = action === 'feed' ? 'eat' : 'happy';
      engine.current?.pickTarget(s, 'come');
    }
    try {
      const r = await api.inkbornCare(s.c.id, action);
      s.c = { ...s.c, ...r };
      if (action !== 'pet' || r.bond_gain) say(s, r.bond_gain ? `${REACTIONS[r.reaction] ?? '♥'} +${r.bond_gain} bond` : REACTIONS[r.reaction] ?? '♥', r.reaction === 'tired' || r.reaction === 'full' ? '#FFE58A' : '#FFFFFF');
      if (r.reaction === 'tired') { s.after = null; s.st = 'sleep'; s.until = performance.now() + 5000; }
      if (r.reaction === 'yay') burst(e.parts, s.x, s.y, 'spark', 14);
      bump((v) => v + 1);
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
    } catch (err) {
      toast.error(toGameError(err).message);
    }
  };
  const call = (s: Sim) => { s.after = null; engine.current?.pickTarget(s, 'come'); say(s, '!', '#FFE14D'); };

  // ---- decorating ----
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.habitatSaveLayout(h.id, e.layout, rev);
      setRev(r.layout_rev); setDirty(false); setMode('play'); setPlace(null); setPick(null);
      void qc.invalidateQueries({ queryKey: ['habitat'] });
      toast.success('Sanctuary saved');
    } catch (err) {
      const ge = toGameError(err);
      toast.error(ge.message);
      if (ge.code === 'layout_conflict') void qc.invalidateQueries({ queryKey: ['habitat'] });
    } finally { setSaving(false); }
  };
  const cancelDecor = () => { commitLayout(layoutAtStart.current); setDirty(false); setMode('play'); setPlace(null); setPick(null); e.ghost = null; };
  const layoutAtStart = useRef<Decor[]>(layout);
  const startDecor = () => { layoutAtStart.current = e.layout.map((d) => ({ ...d })); e.layout = layoutAtStart.current.map((d) => ({ ...d })); setLayout(e.layout); setMode('decor'); setSel(null); };
  const picked = pick ? layout.find((d) => d.id === pick) ?? null : null;

  const selSim = sel ? e.sims.find((s) => s.c.id === sel) ?? null : null;
  const joyRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#0f2a1a] text-white" data-testid="sanctuary">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} data-testid="sanctuary-canvas"
        role="application" aria-label={`${h.name} — use WASD or the arrow keys to walk, tap creatures to pet them`} />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))] pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))]">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl bg-black/55 p-1.5 pr-3">
          <button onClick={() => (dirty && mode === 'decor' ? toast('Save or cancel your decorating first') : (window.history.length > 1 ? nav(-1) : nav('/inkborn')))} className="rounded-xl p-2 hover:bg-white/10" aria-label="Leave the sanctuary"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-bold">{h.name}</div>
            <div className="truncate text-[11px] text-white/70">{owner ? 'Your sanctuary' : `@${h.owner.username}’s sanctuary`} · 🐾 {h.creatures.length}/{h.capacity} · {h.kind === 'starter' ? 'starter' : `${sizeName(h.plots)}, ${h.plots} plot${h.plots === 1 ? '' : 's'}`}</div>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          {mode === 'play' && owner && <Button size="sm" variant="secondary" className="bg-black/55" onClick={startDecor} data-testid="decorate"><Paintbrush className="h-4 w-4" /> Decorate</Button>}
          <div className="flex rounded-xl bg-black/55">
            <button className="p-2" onClick={() => (e.cam.z = clamp(e.cam.z / 1.2, 8, 44))} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
            <button className="p-2" onClick={() => (e.cam.z = clamp(e.cam.z * 1.2, 8, 44))} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {!h.active && <div className="absolute inset-x-4 top-20 mx-auto max-w-md rounded-2xl bg-[#0d1f14]/90 p-3 text-center text-sm">This habitat plot has been turned back into an art canvas. Its creatures are safe in the starter sanctuary.</div>}

      <AnimatePresence>
        {hint && mode === 'play' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-20 mx-auto w-fit max-w-[calc(100%-32px)] rounded-2xl bg-black/65 px-4 py-2.5 text-center text-xs" data-testid="sanctuary-hint">
            <b>Walk</b> with the joystick, WASD or by tapping the ground · <b>tap a creature</b> to {owner ? 'pet it' : 'say hi'} · <b>pinch</b> or scroll to zoom
          </motion.div>
        )}
      </AnimatePresence>

      {/* creature roster */}
      {mode === 'play' && e.sims.length > 0 && (
        <div className="absolute right-[max(12px,env(safe-area-inset-right,0px))] top-1/2 grid max-h-[50vh] -translate-y-1/2 gap-1.5 overflow-y-auto rounded-2xl bg-black/50 p-1.5 no-scrollbar" data-testid="roster">
          {e.sims.map((s) => (
            <button key={s.c.id} onClick={() => { setSel(s.c.id); e.cam.ox = s.x - e.player.x; e.cam.oy = s.y - e.player.y; }} className={cn('rounded-xl', sel === s.c.id ? 'bg-white/25' : 'hover:bg-white/10')} aria-label={s.c.name} title={s.c.name}>
              <CreatureView genome={s.g} size={42} ground={false} state={s.st === 'sleep' ? 'sleep' : 'idle'} />
            </button>
          ))}
        </div>
      )}

      {/* the joystick */}
      {mode === 'play' && (
        <div ref={joyRef} className="absolute bottom-[max(20px,env(safe-area-inset-bottom,0px))] left-[max(20px,env(safe-area-inset-left,0px))] h-32 w-32 touch-none rounded-full border border-white/20 bg-black/40" data-testid="joystick"
          onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); joyMove(ev); }} onPointerMove={(ev) => ev.buttons && joyMove(ev)}
          onPointerUp={() => { e.joy.x = e.joy.y = 0; setKnob({ x: 0, y: 0 }); }} onPointerCancel={() => { e.joy.x = e.joy.y = 0; setKnob({ x: 0, y: 0 }); }}>
          <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-white/40 bg-white/30 shadow-lg" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
        </div>
      )}

      {/* the selected creature */}
      <AnimatePresence>
        {mode === 'play' && selSim && (
          <motion.div key={selSim.c.id} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="absolute bottom-[max(16px,env(safe-area-inset-bottom,0px))] left-1/2 w-[min(400px,calc(100%-180px))] min-w-[260px] -translate-x-1/2 rounded-3xl bg-[#0d1f14]/90 p-3 max-sm:bottom-[calc(160px+env(safe-area-inset-bottom,0px))] max-sm:w-[calc(100%-24px)] max-sm:min-w-0"
            data-testid="creature-card">
            <div className="flex items-center gap-2">
              <CreatureView genome={selSim.g} size={52} ground={false} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display font-bold">{selSim.c.name}</div>
                <div className="text-[11px] text-white/70">{MOOD_INFO[selSim.g.mood].emoji} {MOOD_INFO[selSim.g.mood].label} · {bondLevel(selSim.c.bond).name}</div>
              </div>
              <button onClick={() => setSel(null)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Meter icon={<Heart className="h-3 w-3 text-[#FF4D6D]" />} label="Happy" value={selSim.c.happiness} color="#FF4D6D" />
              <Meter icon={<span className="text-[10px]">⚡</span>} label="Energy" value={selSim.c.energy} color="#FFC93D" />
            </div>
            <div className="mt-2.5 grid grid-cols-5 gap-1.5">
              {owner ? (
                <>
                  <CareBtn icon={<Hand className="h-4 w-4" />} label="Pet" onClick={() => void care(selSim, 'pet')} />
                  <CareBtn icon={<Utensils className="h-4 w-4" />} label="Feed" onClick={() => void care(selSim, 'feed')} testid="feed" />
                  <CareBtn icon={<Volleyball className="h-4 w-4" />} label="Play" onClick={() => void care(selSim, 'play')} testid="play" />
                </>
              ) : (
                <div className="col-span-3 flex items-center text-[11px] text-white/70">Only @{h.owner.username} can feed and play with {selSim.c.name} — but you can call them over to say hi.</div>
              )}
              <CareBtn icon={<Megaphone className="h-4 w-4" />} label="Call" onClick={() => call(selSim)} testid="call" />
              <CareBtn icon={<Info className="h-4 w-4" />} label="Info" onClick={() => setProfile(selSim.c)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* empty sanctuary / create */}
      {mode === 'play' && owner && (
        <div className="absolute bottom-[max(20px,env(safe-area-inset-bottom,0px))] right-[max(16px,env(safe-area-inset-right,0px))] max-sm:bottom-[max(20px,env(safe-area-inset-bottom,0px))]">
          {h.creatures.length < h.capacity && <Link to="/inkborn/create"><Button variant="rainbow" className={cn(h.creatures.length === 0 && 'animate-pulse')} data-testid="sanctuary-create"><Sparkles className="h-4 w-4" /> {h.creatures.length === 0 ? 'Create your first Inkborn' : 'New Inkborn'}</Button></Link>}
        </div>
      )}

      {/* decorate mode */}
      {mode === 'decor' && (
        <>
          <div className="absolute inset-x-0 top-[84px] mx-auto flex w-fit items-center gap-2 rounded-2xl bg-black/65 p-1.5 pl-3 text-xs" data-testid="decor-bar">
            <span><b>Decorating</b> · {layout.length}/{maxDecor}</span>
            <Button size="sm" variant="ghost" onClick={cancelDecor}>Cancel</Button>
            <Button size="sm" variant="primary" loading={saving} onClick={save} data-testid="decor-save"><Check className="h-4 w-4" /> Save</Button>
          </div>
          {picked && !place && (
            <div className="absolute inset-x-0 top-[136px] mx-auto flex w-fit max-w-[calc(100%-24px)] flex-wrap justify-center items-center gap-1.5 rounded-2xl bg-black/65 p-1.5 text-xs">
              <span className="px-2 font-bold">{DECOR_BY_K[picked.k]?.label}</span>
              <span className="text-white/60">drag to move</span>
              <Button size="sm" variant="secondary" onClick={() => commitLayout(e.layout.map((d) => (d.id === picked.id ? { ...d, f: d.f ? 0 : 1 } : d)))}><FlipHorizontal2 className="h-4 w-4" /> Turn</Button>
              <Button size="sm" variant="danger" onClick={() => { commitLayout(e.layout.filter((d) => d.id !== picked.id)); setPick(null); }} data-testid="decor-remove"><Trash2 className="h-4 w-4" /> Remove</Button>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-[#0d1f14]/92 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-2" data-testid="decor-palette">
            <div className="flex gap-1 px-3 pb-2 text-xs">
              {(['Trees', 'Plants', 'Rocks', 'Cosy'] as const).map((gname) => (
                <button key={gname} onClick={() => setGroup(gname)} className={cn('rounded-full px-3 py-1 font-bold', group === gname ? 'bg-white text-black' : 'bg-white/10')}>{gname}</button>
              ))}
              <span className="ml-auto self-center text-white/60">{place ? 'Tap the meadow to place' : 'Pick something, or tap an item to move it'}</span>
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-3">
              {DECOR.filter((d) => d.group === group).map((d) => (
                <button key={d.k} onClick={() => { setPlace(place === d.k ? null : d.k); setPick(null); e.ghost = null; }} aria-pressed={place === d.k} data-testid={`decor-${d.k}`}
                  className={cn('grid shrink-0 justify-items-center rounded-2xl border p-1.5 text-[10px] font-bold', place === d.k ? 'border-[#FFE14D] bg-white/15' : 'border-white/15 bg-white/5')}>
                  <DecorThumb k={d.k} /><span className="w-16 truncate text-center">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <CreatureProfile c={profile} open={!!profile} onOpenChange={(v) => !v && setProfile(null)} sanct={null} />
    </div>
  );

  function joyMove(ev: React.PointerEvent<HTMLDivElement>) {
    const r = joyRef.current!.getBoundingClientRect();
    let dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
    const R = r.width / 2 - 14, d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    e.joy.x = dx / R; e.joy.y = dy / R;
    setKnob({ x: dx, y: dy });
    if (hint) { setHint(false); saveStorage('landvas.sanctuary.hinted', true); }
  }
}

function burst(parts: Part[], x: number, y: number, kind: 'spark', n: number) {
  const cols = ['#FFE14D', '#FF4FD8', '#34C3FF', '#3DDC97', '#FFFFFF'];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push({ x, y, vx: Math.cos(a) * (2 + Math.random() * 2), vy: Math.sin(a) * (1.4 + Math.random()), life: 0, max: 0.9 + Math.random() * 0.5, kind, color: cols[i % cols.length] });
  }
}

function CareBtn({ icon, label, onClick, testid }: { icon: React.ReactNode; label: string; onClick(): void; testid?: string }) {
  return (
    <motion.button whileTap={{ scale: 0.88 }} onClick={onClick} data-testid={testid} className="grid justify-items-center gap-0.5 rounded-2xl bg-white/10 py-2 text-[11px] font-bold hover:bg-white/20">
      {icon}{label}
    </motion.button>
  );
}

function DecorThumb({ k }: { k: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = 56 * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const def = DECOR_BY_K[k];
    const tall = def.tag === 'tree' ? 7.5 : k === 'lantern' || k === 'signpost' ? 3.6 : 2.4;
    const s = Math.min(46 / tall, 11);
    g.translate(28, 50);
    def.draw(g, s, 1, 0.5);
  }, [k]);
  return <canvas ref={ref} style={{ width: 56, height: 56 }} />;
}

