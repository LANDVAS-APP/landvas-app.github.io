// PROTO-0 — the Back Room's cabinet: a broken prototype that never shipped. It fires four-second microgames at you
// one after another (TAP! DODGE! CATCH! DON'T TOUCH!…), a little faster every five stages. Every 15th stage is a BOSS:
// the prototype glitches (the screen tears and left is right) and it lasts longer. Four lives.
// It "patches itself" as you get further: 8 microgames to start, 4 more at stage 25, 4 more at stage 50.
// Classic: ship it (clear 30 stages). Endless: forever. The best stage is remembered: the sticky notes in the back room.
import { useEffect, useRef } from 'react';
import { Hud, Lives, rng, tap, usePops, type ArenaProps } from '../games';
import { Led, Screen, Tip, glowCircle, run2d, sparks, useHud, type Engine, type Ptr } from '../games2';
import { sfx } from '../sfx';
import { setMeta } from './meta';

type Res = 'win' | 'lose' | null;
type Ctx = { W: number; H: number; r: () => number; tier: number; glitch: boolean };
type Micro = {
  cmd: string; color: string; dur: number; timeout: 'win' | 'lose';
  init(c: Ctx): any;
  update?(s: any, dt: number, c: Ctx): Res;
  draw(g: CanvasRenderingContext2D, s: any, c: Ctx, t: number): void;
  down?(s: any, p: Ptr, c: Ctx): Res;
  move?(s: any, p: Ptr, c: Ctx): Res;
  up?(s: any, p: Ptr, c: Ctx): Res;
};
const R2 = (x: number, y: number, a: number, b: number) => Math.hypot(x - a, y - b);
const word = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, c: string) => { g.font = `900 ${size}px ui-rounded, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = c; g.fillText(s, x, y); };
const blob = (g: CanvasRenderingContext2D, x: number, y: number, R: number, c: string) => {
  g.save(); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 14;
  g.beginPath(); g.moveTo(x, y - R * 1.2); g.bezierCurveTo(x + R, y - R * 0.1, x + R * 0.9, y + R * 0.9, x, y + R * 0.9); g.bezierCurveTo(x - R * 0.9, y + R * 0.9, x - R, y - R * 0.1, x, y - R * 1.2); g.fill(); g.restore();
};
const SHAPES = ['circle', 'square', 'triangle', 'star'] as const;
function shape(g: CanvasRenderingContext2D, k: string, x: number, y: number, R: number, c: string) {
  g.fillStyle = c; g.beginPath();
  if (k === 'circle') g.arc(x, y, R, 0, Math.PI * 2);
  else if (k === 'square') g.rect(x - R * 0.85, y - R * 0.85, R * 1.7, R * 1.7);
  else if (k === 'triangle') { g.moveTo(x, y - R); g.lineTo(x + R, y + R * 0.8); g.lineTo(x - R, y + R * 0.8); g.closePath(); }
  else for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.45 : R; i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.fill();
}

// ---- the microgames (the first 8, then 4 more at stage 25, 4 more at stage 50) ------------------------------------
const MICROS: Micro[] = [
  { cmd: 'TAP!', color: '#FFE14D', dur: 3, timeout: 'lose',
    init: (c) => ({ x: c.W * (0.2 + c.r() * 0.6), y: c.H * (0.3 + c.r() * 0.45), vx: (c.r() - 0.5) * 120 * c.tier }),
    update: (s, dt, c) => { s.x += s.vx * dt; if (s.x < 40 || s.x > c.W - 40) s.vx = -s.vx; return null; },
    draw: (g, s) => { glowCircle(g, s.x, s.y, 34, '#FF3D6E', 22); word(g, 'PUSH', s.x, s.y, 14, '#FFFFFF'); },
    down: (s, p) => (R2(p.x, p.y, s.x, s.y) < 46 ? 'win' : null) },
  { cmd: 'DODGE!', color: '#22E3FF', dur: 3.6, timeout: 'win',
    init: (c) => ({ x: c.W / 2, blocks: Array.from({ length: 3 + Math.floor(c.tier * 1.5) }, (_, i) => ({ x: c.r() * c.W, y: -40 - i * c.H * 0.22, w: 34 + c.r() * 30 })) }),
    update: (s, dt, c) => { for (const b of s.blocks) { b.y += c.H * 0.42 * c.tier * dt; if (b.y > c.H * 0.8 - 14 && b.y < c.H * 0.8 + 18 && Math.abs(b.x - s.x) < b.w / 2 + 14) return 'lose'; } return null; },
    draw: (g, s, c) => { g.fillStyle = '#FF3D6E'; for (const b of s.blocks) g.fillRect(b.x - b.w / 2, b.y - 12, b.w, 24); blob(g, s.x, c.H * 0.8, 16, '#22E3FF'); },
    down: (s, p) => { s.x = p.x; return null; }, move: (s, p) => { s.x = p.x; return null; } },
  { cmd: 'CATCH!', color: '#3DDC97', dur: 3.2, timeout: 'lose',
    init: (c) => ({ x: c.W / 2, dx: c.W * (0.15 + c.r() * 0.7), dy: 40, wob: c.r() * 6 }),
    update: (s, dt, c) => { s.dy += c.H * 0.36 * c.tier * dt; s.dx += Math.sin(s.dy / 40 + s.wob) * 60 * dt * c.tier; if (s.dy > c.H * 0.78 && s.dy < c.H * 0.84) return Math.abs(s.dx - s.x) < 40 ? 'win' : null; return s.dy > c.H * 0.86 ? 'lose' : null; },
    draw: (g, s, c) => { blob(g, s.dx, s.dy, 12, '#8B6BFF'); g.fillStyle = '#DDE8FF'; g.fillRect(s.x - 40, c.H * 0.8, 80, 8); g.fillRect(s.x - 40, c.H * 0.8 - 22, 6, 22); g.fillRect(s.x + 34, c.H * 0.8 - 22, 6, 22); },
    down: (s, p) => { s.x = p.x; return null; }, move: (s, p) => { s.x = p.x; return null; } },
  { cmd: 'DON’T TOUCH!', color: '#FF3D6E', dur: 3, timeout: 'win',
    init: () => ({}),
    draw: (g, _s, c, t) => { glowCircle(g, c.W / 2, c.H * 0.55, 44 + Math.sin(t * 9) * 4, '#FF3D6E', 30); word(g, 'TOUCH ME', c.W / 2, c.H * 0.55, 13, '#FFFFFF'); },
    down: () => 'lose' },
  { cmd: 'SWAT!', color: '#B6FF3D', dur: 3.6, timeout: 'lose',
    init: (c) => ({ bugs: Array.from({ length: 3 }, () => ({ x: c.W * (0.15 + c.r() * 0.7), y: c.H * (0.25 + c.r() * 0.55), a: c.r() * 6.3, dead: false })) }),
    update: (s, dt, c) => { for (const b of s.bugs) if (!b.dead) { b.a += (Math.random() - 0.5) * 6 * dt; b.x += Math.cos(b.a) * 90 * c.tier * dt; b.y += Math.sin(b.a) * 90 * c.tier * dt; if (b.x < 20 || b.x > c.W - 20) b.a = Math.PI - b.a; if (b.y < 60 || b.y > c.H - 30) b.a = -b.a; } return s.bugs.every((b: any) => b.dead) ? 'win' : null; },
    draw: (g, s) => { for (const b of s.bugs) { if (b.dead) { g.fillStyle = '#2A3A10'; g.beginPath(); g.arc(b.x, b.y, 10, 0, Math.PI * 2); g.fill(); continue; } g.fillStyle = '#B6FF3D'; g.beginPath(); g.ellipse(b.x, b.y, 12, 8, b.a, 0, Math.PI * 2); g.fill(); g.fillStyle = '#070B1C'; g.beginPath(); g.arc(b.x + Math.cos(b.a) * 7, b.y + Math.sin(b.a) * 7, 3, 0, Math.PI * 2); g.fill(); } },
    down: (s, p) => { for (const b of s.bugs) if (!b.dead && R2(p.x, p.y, b.x, b.y) < 28) { b.dead = true; sfx.bonk(); } return null; } },
  { cmd: 'STOP!', color: '#FF9F1C', dur: 3.4, timeout: 'lose',
    init: (c) => ({ k: 0, dir: 1, z0: 0.25 + c.r() * 0.45, zw: Math.max(0.1, 0.2 - c.tier * 0.025) }),
    update: (s, dt, c) => { s.k += s.dir * dt * 1.1 * c.tier; if (s.k > 1) { s.k = 1; s.dir = -1; } if (s.k < 0) { s.k = 0; s.dir = 1; } return null; },
    draw: (g, s, c) => { const x0 = c.W * 0.1, w = c.W * 0.8, y = c.H * 0.55; g.fillStyle = '#1E2650'; g.fillRect(x0, y - 16, w, 32); g.fillStyle = '#3DDC97'; g.fillRect(x0 + s.z0 * w, y - 16, s.zw * w, 32); g.fillStyle = '#FFFFFF'; g.fillRect(x0 + s.k * w - 3, y - 26, 6, 52); },
    down: (s) => (s.k >= s.z0 && s.k <= s.z0 + s.zw ? 'win' : 'lose') },
  { cmd: 'MASH!', color: '#FF7AC8', dur: 3.2, timeout: 'lose',
    init: (c) => ({ n: 0, need: 10 + Math.round(c.tier * 3) }),
    draw: (g, s, c) => { const k = Math.min(1, s.n / s.need); g.fillStyle = '#1E2650'; g.fillRect(c.W * 0.2, c.H * 0.3, c.W * 0.6, c.H * 0.4); g.fillStyle = '#FF7AC8'; g.fillRect(c.W * 0.2, c.H * 0.7 - c.H * 0.4 * k, c.W * 0.6, c.H * 0.4 * k); word(g, `${s.n}/${s.need}`, c.W / 2, c.H * 0.5, 26, '#FFFFFF'); },
    down: (s) => { s.n++; sfx.blip(4 + (s.n % 8)); return s.n >= s.need ? 'win' : null; } },
  { cmd: 'AIM!', color: '#34C3FF', dur: 3.2, timeout: 'lose',
    init: (c) => ({ a: c.r() * 6.3, cx: c.W / 2, cy: c.H * 0.52, rad: Math.min(c.W, c.H) * 0.26 }),
    update: (s, dt, c) => { s.a += dt * 2.2 * c.tier; return null; },
    draw: (g, s) => { const x = s.cx + Math.cos(s.a) * s.rad, y = s.cy + Math.sin(s.a * 1.3) * s.rad * 0.8; for (const [rr, cc] of [[26, '#FFFFFF'], [18, '#FF3D6E'], [9, '#FFFFFF']] as const) { g.fillStyle = cc; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); } },
    down: (s, p) => { const x = s.cx + Math.cos(s.a) * s.rad, y = s.cy + Math.sin(s.a * 1.3) * s.rad * 0.8; return R2(p.x, p.y, x, y) < 30 ? 'win' : 'lose'; } },
  // patch 1 (stage 25)
  { cmd: 'MATCH!', color: '#FFE14D', dur: 3, timeout: 'lose',
    init: (c) => { const opts = [...SHAPES].sort(() => c.r() - 0.5).slice(0, 3); return { want: opts[Math.floor(c.r() * 3)], opts }; },
    draw: (g, s, c) => { shape(g, s.want, c.W / 2, c.H * 0.32, 34, '#FFE14D'); s.opts.forEach((k: string, i: number) => shape(g, k, c.W * (0.2 + i * 0.3), c.H * 0.7, 30, '#DDE8FF')); },
    down: (s, p, c) => { const i = s.opts.findIndex((_: string, j: number) => R2(p.x, p.y, c.W * (0.2 + j * 0.3), c.H * 0.7) < 46); return i < 0 ? null : s.opts[i] === s.want ? 'win' : 'lose'; } },
  { cmd: 'COUNT!', color: '#3DDC97', dur: 4, timeout: 'lose',
    init: (c) => { const n = 3 + Math.floor(c.r() * 5); const opts = [n, n + (c.r() < 0.5 ? 1 : -1), n + 2].sort(() => c.r() - 0.5); return { n, opts, t: 0, dots: Array.from({ length: n }, () => [0.15 + c.r() * 0.7, 0.2 + c.r() * 0.4]) }; },
    update: (s, dt) => { s.t += dt; return null; },
    draw: (g, s, c) => { if (s.t < 1.4 / c.tier) for (const [x, y] of s.dots) glowCircle(g, x * c.W, y * c.H, 10, '#3DDC97', 10); else word(g, '?', c.W / 2, c.H * 0.4, 48, '#3DDC97'); s.opts.forEach((n: number, i: number) => { g.fillStyle = '#1E2650'; g.fillRect(c.W * (0.12 + i * 0.28), c.H * 0.68, c.W * 0.22, 54); word(g, String(n), c.W * (0.23 + i * 0.28), c.H * 0.68 + 27, 26, '#FFFFFF'); }); },
    down: (s, p, c) => { if (s.t < 1.4 / c.tier) return null; const i = s.opts.findIndex((_: number, j: number) => p.x > c.W * (0.12 + j * 0.28) && p.x < c.W * (0.34 + j * 0.28) && p.y > c.H * 0.68 && p.y < c.H * 0.68 + 54); return i < 0 ? null : s.opts[i] === s.n ? 'win' : 'lose'; } },
  { cmd: 'CUT!', color: '#FF3D6E', dur: 3, timeout: 'lose',
    init: () => ({ from: null as Ptr | null }),
    draw: (g, s, c, t) => { g.strokeStyle = '#C9A86B'; g.lineWidth = 6; g.beginPath(); g.moveTo(c.W / 2, 50); g.lineTo(c.W / 2 + Math.sin(t * 3) * 10, c.H * 0.85); g.stroke(); shape(g, 'circle', c.W / 2 + Math.sin(t * 3) * 10, c.H * 0.85, 16, '#FFD84D'); },
    down: (s, p) => { s.from = p; return null; },
    move: (s, p, c) => { if (s.from && (s.from.x - c.W / 2) * (p.x - c.W / 2) < 0 && p.y > 50 && p.y < c.H * 0.85) return 'win'; return null; },
    up: (s) => { s.from = null; return null; } },
  { cmd: 'PUMP!', color: '#FF7AC8', dur: 3.4, timeout: 'lose',
    init: (c) => ({ k: 0, lo: 0.62 + c.r() * 0.15 }),
    update: (s, dt) => { s.k = Math.max(0, s.k - dt * 0.05); return null; },
    draw: (g, s, c) => { const R = 20 + s.k * Math.min(c.W, c.H) * 0.3; glowCircle(g, c.W / 2, c.H * 0.55, R, s.k > s.lo + 0.2 ? '#FF3D6E' : '#FF7AC8', 12); g.strokeStyle = '#3DDC97'; g.lineWidth = 2; g.setLineDash([6, 6]); for (const k of [s.lo, s.lo + 0.2]) { g.beginPath(); g.arc(c.W / 2, c.H * 0.55, 20 + k * Math.min(c.W, c.H) * 0.3, 0, Math.PI * 2); g.stroke(); } g.setLineDash([]); },
    down: (s) => { s.k += 0.07; sfx.blip(6); if (s.k > s.lo + 0.32) return 'lose'; return null; } },
  // patch 2 (stage 50)
  { cmd: 'SORT!', color: '#8B6BFF', dur: 4, timeout: 'lose',
    init: (c) => ({ items: Array.from({ length: 3 }, () => (c.r() < 0.5 ? 'ink' : 'bomb')), i: 0 }),
    draw: (g, s, c) => { if (s.i >= 3) return; const k = s.items[s.i]; if (k === 'ink') blob(g, c.W / 2, c.H * 0.45, 28, '#8B6BFF'); else { glowCircle(g, c.W / 2, c.H * 0.45, 26, '#333', 0); word(g, '💣', c.W / 2, c.H * 0.45, 40, '#fff'); } word(g, '← INK', c.W * 0.2, c.H * 0.8, 15, '#8B6BFF'); word(g, 'BOMB →', c.W * 0.8, c.H * 0.8, 15, '#FF3D6E'); },
    down: (s, p, c) => { const left = p.x < c.W / 2, k = s.items[s.i]; if ((k === 'ink') !== left) return 'lose'; s.i++; sfx.blip(8); return s.i >= 3 ? 'win' : null; } },
  { cmd: 'BALANCE!', color: '#34C3FF', dur: 3.6, timeout: 'win',
    init: (c) => ({ a: (c.r() - 0.5) * 0.2, v: 0 }),
    update: (s, dt, c) => { s.v += Math.sin(s.a) * 3.2 * c.tier * dt; s.a += s.v * dt; return Math.abs(s.a) > 0.85 ? 'lose' : null; },
    draw: (g, s, c) => { g.save(); g.translate(c.W / 2, c.H * 0.8); g.rotate(s.a); g.fillStyle = '#DDE8FF'; g.fillRect(-4, -c.H * 0.45, 8, c.H * 0.45); glowCircle(g, 0, -c.H * 0.45, 14, '#34C3FF', 10); g.restore(); word(g, '◀ TAP', c.W * 0.15, c.H * 0.9, 12, '#9DE4FF'); word(g, 'TAP ▶', c.W * 0.85, c.H * 0.9, 12, '#9DE4FF'); },
    down: (s, p, c) => { s.v += p.x < c.W / 2 ? -0.9 : 0.9; return null; } },
  { cmd: 'PAINT!', color: '#3DDC97', dur: 3.6, timeout: 'lose',
    init: () => ({ on: new Uint8Array(36), drawing: false }),
    draw: (g, s, c) => { const sz = Math.min(c.W, c.H) * 0.5, x0 = (c.W - sz) / 2, y0 = c.H * 0.3, k = sz / 6; for (let i = 0; i < 36; i++) { g.fillStyle = s.on[i] ? '#3DDC97' : '#1E2650'; g.fillRect(x0 + (i % 6) * k + 1, y0 + Math.floor(i / 6) * k + 1, k - 2, k - 2); } },
    down: (s, p, c) => { s.drawing = true; return PAINT(s, p, c); }, move: (s, p, c) => (s.drawing ? PAINT(s, p, c) : null), up: (s) => { s.drawing = false; return null; } },
  { cmd: 'FIND THE INK!', color: '#FFB13D', dur: 5, timeout: 'lose',
    init: (c) => ({ under: Math.floor(c.r() * 3), pos: [0, 1, 2], t: 0, swaps: 4 + Math.floor(c.tier * 2), done: 0, sw: null as null | [number, number], k: 0 }),
    update: (s, dt, c) => {
      s.t += dt;
      if (s.t > 0.9 && s.done < s.swaps) { if (!s.sw) { const a = Math.floor(Math.random() * 3); s.sw = [a, (a + 1 + Math.floor(Math.random() * 2)) % 3]; s.k = 0; } s.k += dt * 3.4 * c.tier; if (s.k >= 1) { const [a, b] = s.sw; [s.pos[a], s.pos[b]] = [s.pos[b], s.pos[a]]; s.sw = null; s.done++; } }
      return null;
    },
    draw: (g, s, c) => { for (let cup = 0; cup < 3; cup++) { let x = c.W * (0.2 + s.pos[cup] * 0.3); if (s.sw && s.sw.includes(cup)) { const other = s.sw[0] === cup ? s.sw[1] : s.sw[0]; const ox = c.W * (0.2 + s.pos[other] * 0.3); x = x + (ox - x) * s.k; } const lift = s.t < 0.9 && cup === s.under ? 30 : 0; if (lift) blob(g, x, c.H * 0.62, 12, '#8B6BFF'); g.fillStyle = '#FFB13D'; g.beginPath(); g.moveTo(x - 30, c.H * 0.66 - lift); g.lineTo(x - 20, c.H * 0.5 - lift); g.lineTo(x + 20, c.H * 0.5 - lift); g.lineTo(x + 30, c.H * 0.66 - lift); g.fill(); } },
    down: (s, p, c) => { if (s.done < s.swaps) return null; const cup = [0, 1, 2].find((k) => Math.abs(p.x - c.W * (0.2 + s.pos[k] * 0.3)) < 36 && p.y > c.H * 0.45 && p.y < c.H * 0.7); return cup == null ? null : cup === s.under ? 'win' : 'lose'; } },
];
function PAINT(s: any, p: Ptr, c: Ctx): Res {
  const sz = Math.min(c.W, c.H) * 0.5, x0 = (c.W - sz) / 2, y0 = c.H * 0.3, k = sz / 6;
  const cx = Math.floor((p.x - x0) / k), cy = Math.floor((p.y - y0) / k);
  if (cx >= 0 && cy >= 0 && cx < 6 && cy < 6) s.on[cy * 6 + cx] = 1;
  let n = 0; for (const v of s.on) n += v;
  return n >= 22 ? 'win' : null;
}
export const PROTO_COUNT = MICROS.length;

/** lore on the sticky notes in the back room, one more at each of these stages */
export const NOTES: [number, string][] = [
  [5, 'PROTO-0 build 0.0.1 — “fun?? fix later”'],
  [10, 'The claw kept fishing coins out of the chute. Left it. Nobody looks there.'],
  [15, 'If the boss stage tears, that’s a feature now.'],
  [20, 'Ticket machine eats tokens. Don’t ask which tokens.'],
  [25, 'Patch 1: four more games. Still not shipping it.'],
  [30, 'SHIPPED?? no. Back in the box.'],
  [40, 'The jukebox has a B-side. You have to be rough with it.'],
  [50, 'Patch 2. It’s learning. I don’t like it.'],
  [75, 'Whoever reads this: the arcade was drawn as an L first. Five plots.'],
  [100, 'PROTO-0 build 1.0 — it was always fun. — the founder'],
];

export function Proto({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 4, stage: 1, speed: 1 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    let score = 0, lives = 4, stage = 0, over = false;
    let state: 'intro' | 'play' | 'result' | 'patch' = 'intro', st = 1.4, micro: Micro = MICROS[0], ms: any = null, won: Res = null, lastIdx = -1;
    let W = 0, H = 0;
    const patched = new Set<number>();
    const tier = () => 1 + Math.floor(stage / 5) * 0.12;
    const boss = () => stage > 0 && stage % 15 === 0;
    const ctx = (): Ctx => ({ W, H, r, tier: tier() * (boss() ? 0.9 : 1), glitch: boss() });
    const pool = () => (stage >= 50 ? 16 : stage >= 25 ? 12 : 8);
    const next = () => {
      const n = stage + 1;
      if ((n === 25 || n === 50) && !patched.has(n)) { patched.add(n); state = 'patch'; st = 1.8; sfx.jackpot(); pops.add(`PATCH ${n === 25 ? 1 : 2}: +4 GAMES`, '#3DDC97', 50, 30, true); return; }
      stage = n;
      let i = Math.floor(r() * pool()); if (i === lastIdx) i = (i + 1) % pool(); lastIdx = i;
      micro = MICROS[i]; ms = null; won = null; state = 'intro'; st = Math.max(0.45, 0.85 / tier());
      setHud({ stage, speed: Math.round(tier() * 100) / 100 });
      if (boss()) { sfx.fail(); pops.add('⚠ BOSS STAGE ⚠', '#FF3D6E', 50, 25, true); }
    };
    const finishMicro = (res: 'win' | 'lose') => {
      if (state !== 'play') return;
      won = res; state = 'result'; st = 0.6;
      if (res === 'win') {
        const pts = boss() ? 100 : Math.round(10 * tier()); score += pts; sfx.win(boss() ? 5 : 3); tap(haptics, boss() ? 'success' : 'light');
        fx.burst(W / 2, H / 2, [micro.color, '#FFFFFF'], reduce ? 6 : 22, 200); setHud({ score });
        setMeta({ stage });
        if (!endless && stage >= 30) { over = true; pops.add('SHIP IT!', '#FFE14D', 50, 40, true); sfx.jackpot(); setTimeout(() => onEnd(score), 1500); }
      } else {
        lives--; sfx.fail(); tap(haptics, 'heavy'); setHud({ lives });
        if (lives <= 0) { over = true; pops.add('SYSTEM CRASH', '#FF3D6E', 50, 40, true); setMeta({ stage: stage - 1 }); setTimeout(() => onEnd(score), 1500); }
      }
    };
    // a boss stage shows everything mirrored but your finger isn't: left is right
    const P = (p: Ptr): Ptr => p;
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        W = w; H = h;
        if (!over) {
          st -= dt;
          if (state === 'intro' && st <= 0) { state = 'play'; ms = micro.init(ctx()); st = micro.dur * (boss() ? 1.8 : 1) / tier(); sfx.blip(12); }
          else if (state === 'play') {
            const res = micro.update?.(ms, dt, ctx()); if (res) finishMicro(res);
            else if (st <= 0) finishMicro(micro.timeout);
          } else if ((state === 'result' || state === 'patch') && st <= 0) next();
        }
        // ---- draw: a dusty old screen
        g.fillStyle = '#0B0A08'; g.fillRect(0, 0, W, H);
        const tint = state === 'result' ? (won === 'win' ? 'rgba(61,220,151,0.12)' : 'rgba(255,61,110,0.16)') : 'rgba(255,177,61,0.04)';
        g.fillStyle = tint; g.fillRect(0, 0, W, H);
        if (state === 'play' && ms) {
          if (boss()) { g.save(); g.translate(W, 0); g.scale(-1, 1); }
          micro.draw(g, ms, ctx(), t);
          if (boss()) g.restore();
          // the timer fuse along the bottom
          const k = Math.max(0, st / (micro.dur * (boss() ? 1.8 : 1) / tier()));
          g.fillStyle = '#2A2418'; g.fillRect(16, H - 22, W - 32, 8); g.fillStyle = k > 0.3 ? '#FFB13D' : '#FF3D6E'; g.fillRect(16, H - 22, (W - 32) * k, 8);
          if (boss() && !reduce) { // the screen tears: bands of junk slide across it
            for (let i = 0; i < 3; i++) { const y = ((t * (210 + i * 90)) + i * 140) % H; g.fillStyle = ['rgba(255,61,110,0.22)', 'rgba(34,227,255,0.18)', 'rgba(255,225,77,0.15)'][i]; g.fillRect(Math.sin(t * 31 + i) * 18, y, W, 6 + i * 5); }
          }
          word(g, micro.cmd, W / 2, 74, 20, micro.color);
        } else if (state === 'intro' || state === 'patch') {
          word(g, state === 'patch' ? 'PATCHING…' : boss() ? 'BOSS: ' + micro.cmd : micro.cmd, W / 2, H * 0.45, state === 'patch' ? 30 : Math.min(54, W / Math.max(4, micro.cmd.length * 0.62)), state === 'patch' ? '#3DDC97' : micro.color);
          word(g, `STAGE ${stage}`, W / 2, H * 0.45 + 46, 13, '#A8936B');
        } else if (state === 'result') {
          word(g, won === 'win' ? 'OK!' : 'FAIL', W / 2, H * 0.45, 52, won === 'win' ? '#3DDC97' : '#FF3D6E');
        }
        // scan lines + a flicker, the prototype's broken screen
        g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
        if (!reduce && Math.sin(t * 17) > 0.985) { g.fillStyle = 'rgba(255,240,200,0.05)'; g.fillRect(0, 0, W, H); }
        fx.draw(g, dt);
      },
      down: (p) => { if (state === 'play' && micro.down) { const res = micro.down(ms, P(p), ctx()); if (res) finishMicro(res); } },
      move: (p) => { if (state === 'play' && micro.move) { const res = micro.move(ms, P(p), ctx()); if (res) finishMicro(res); } },
      up: (p) => { if (state === 'play' && micro.up) { const res = micro.up(ms, P(p), ctx()); if (res) finishMicro(res); } },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="proto" cv={cv}>
      <Hud score={hud.score} left={<Led label="STAGE" v={endless ? hud.stage : `${hud.stage}/30`} c="#FFB13D" />} right={<div className="flex gap-1.5"><Led label="SPEED" v={`×${hud.speed}`} c="#FF7AC8" /><Lives n={hud.lives} max={4} /></div>} />
      <Tip>DO WHAT IT SAYS · fast</Tip>
      {pops.el}
    </Screen>
  );
}
