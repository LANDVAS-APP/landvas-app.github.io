// Ten more cabinets, all drawn in 2D neon on the cabinet's screen (light and quick on phones). Mostly skill,
// a little luck; each has a Classic round and an Endless mode, and its own bonus:
//  Air Hockey     drag your mallet, beat the CPU to 7. Every 3rd puck is GOLD (a goal with it is worth triple)
//  Pinball        tap left/right for the flippers. Light all three targets for MULTIBALL (bumpers pay double)
//  Coin Pusher    tap to drop coins in front of the pusher; push them off the front ledge. Gold coins cause a SHOWER
//  Ink Maze       swipe your ink blob round the maze slurping paint drops; a paint bucket lets you wash away the
//                 smudges chasing you. The GOLDEN BRUSH is worth 500
//  Space Blaster  drag to steer, it fires by itself, at waves of neon drones. Hit the PRISM DRONE for 150; grab TRIPLE SHOT
//  Rhythm Rush    tap the four lanes as the notes hit the line. A 30 combo starts FEVER (double points)
//  Peg Drop       aim and drop chips through the pegs. Touch the glowing GOLD PEG for double
//  Neon Racer     swipe between lanes, dodge the traffic, grab orbs. NITRO doubles points and makes you invincible
//  Fruit Slash    swipe through fruit, never the bombs. Slice 3+ at once for a COMBO; a golden fruit starts a FRENZY
//  Neon Snake     swipe to steer and eat. Golden apples are worth 50 and shrink your tail
import { useEffect, useRef, useState } from 'react';
import { Hud, Lives, clamp, rng, tap, usePops, type ArenaProps } from './games';
import { sfx } from './sfx';

// ---- a little 2D engine: a sized canvas, a loop and pointer input in CSS pixels ----------------------------------
type Ptr = { x: number; y: number; id: number };
type Engine = { frame(g: CanvasRenderingContext2D, W: number, H: number, dt: number, t: number): void; down?(p: Ptr): void; move?(p: Ptr): void; up?(p: Ptr): void; key?(k: string, down: boolean): void };
function run2d(cv: HTMLCanvasElement, e: Engine) {
  const g = cv.getContext('2d')!;
  let raf = 0, last = performance.now(), t = 0, W = 0, H = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.04, (now - last) / 1000); last = now; t += dt;
    const b = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (!b.width) return;
    if (cv.width !== Math.round(b.width * dpr) || cv.height !== Math.round(b.height * dpr)) { cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr); }
    W = b.width; H = b.height;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    e.frame(g, W, H, dt, t);
  };
  raf = requestAnimationFrame(loop);
  const at = (ev: PointerEvent): Ptr => { const b = cv.getBoundingClientRect(); return { x: ev.clientX - b.left, y: ev.clientY - b.top, id: ev.pointerId }; };
  const pd = (ev: PointerEvent) => { ev.preventDefault(); try { cv.setPointerCapture(ev.pointerId); } catch { /* fine */ } e.down?.(at(ev)); };
  const pm = (ev: PointerEvent) => e.move?.(at(ev));
  const pu = (ev: PointerEvent) => e.up?.(at(ev));
  const kd = (ev: KeyboardEvent) => { if (e.key) { e.key(ev.key, true); if (ev.key.startsWith('Arrow') || ev.key === ' ') ev.preventDefault(); } };
  const ku = (ev: KeyboardEvent) => e.key?.(ev.key, false);
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); cv.addEventListener('pointerup', pu); cv.addEventListener('pointercancel', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  return () => {
    cancelAnimationFrame(raf);
    cv.removeEventListener('pointerdown', pd); cv.removeEventListener('pointermove', pm); cv.removeEventListener('pointerup', pu); cv.removeEventListener('pointercancel', pu);
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
  };
}
/** sparks and confetti for 2D games */
function sparks() {
  const list: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number }[] = [];
  return {
    burst(x: number, y: number, c: string | string[], n = 14, sp = 160) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random()); list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.4 + Math.random() * 0.5, c: Array.isArray(c) ? c[i % c.length] : c, r: 1.5 + Math.random() * 2.5 }); }
    },
    draw(g: CanvasRenderingContext2D, dt: number, grav = 300) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.life += dt; if (p.life > p.max) { list.splice(i, 1); continue; }
        p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.c; g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      }
      g.globalAlpha = 1;
    },
  };
}
const RAINBOW = ['#FF3D9A', '#22E3FF', '#FFE14D', '#3DDC97', '#B57BFF'];
function bg(g: CanvasRenderingContext2D, W: number, H: number, a: string, b: string) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
function glowCircle(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, blur = 12) {
  g.shadowColor = c; g.shadowBlur = blur; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
}
/** keep a bit of HUD state in React without re-rendering every frame */
function useHud<T extends Record<string, unknown>>(init: T) {
  const [hud, setHud] = useState(init);
  const ref = useRef(init);
  const set = (p: Partial<T>) => { const n = { ...ref.current, ...p }; if (Object.keys(p).some((k) => ref.current[k] !== n[k])) { ref.current = n; setHud(n); } };
  return [hud, set] as const;
}
/** swipe directions (and arrow keys) for grid games */
function swipe(onDir: (d: 0 | 1 | 2 | 3) => void) {
  let st: Ptr | null = null;
  return {
    down: (p: Ptr) => { st = p; },
    move: (p: Ptr) => { if (!st) return; const dx = p.x - st.x, dy = p.y - st.y; if (Math.hypot(dx, dy) > 22) { onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0); st = p; } },
    up: () => { st = null; },
    key: (k: string, d: boolean) => { if (!d) return; const m: Record<string, 0 | 1 | 2 | 3> = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 }; if (k in m) onDir(m[k]); },
  };
}
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const Screen = ({ id, cv, children }: { id: string; cv: React.RefObject<HTMLCanvasElement | null>; children?: React.ReactNode }) => (
  <div className="relative h-full w-full touch-none select-none" data-testid={`arc-${id}`}>
    <canvas ref={cv} className="absolute inset-0 h-full w-full" />
    {children}
  </div>
);
const Tip = ({ children }: { children: React.ReactNode }) => <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center font-mono text-[11px] font-bold text-white/70">{children}</div>;
const Led = ({ label, v, c }: { label: string; v: React.ReactNode; c?: string }) => <div className="lv-arc-led" style={c ? { color: c } : undefined}><span className="text-[9px] opacity-70">{label}</span><b>{v}</b></div>;

// ======================================================================================================
// Air Hockey
// ======================================================================================================
export function AirHockey({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, you: 0, cpu: 0, lives: 3, gold: false });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    let W = 0, H = 0, score = 0, you = 0, cpu = 0, lives = 3, over = false, pucks = 0, wait = 1, hitCd = 0, cpuSpeed = 1, shake = 0;
    const P = { x: 0, y: 0, vx: 0, vy: 0, gold: false };
    const me = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    const ai = { x: 0, y: 0, vx: 0, vy: 0 };
    const geo = () => { const tw = Math.min(W * 0.94, H * 0.62), th = Math.min(H * 0.86, tw * 1.6); return { x0: (W - tw) / 2, y0: (H - th) / 2 + 14, tw, th, R: tw * 0.085, pr: tw * 0.045, goal: tw * 0.38 }; };
    const serve = (toward: number) => {
      const G = geo(); pucks++; P.gold = pucks % 3 === 0;
      P.x = G.x0 + G.tw / 2; P.y = G.y0 + G.th / 2 + toward * G.th * 0.12; P.vx = (r() - 0.5) * 40; P.vy = 0; wait = 0.8;
      setHud({ gold: P.gold });
      if (P.gold) pops.add('GOLD PUCK! ×3', '#FFD84D', 50, 45, true);
    };
    let first = true;
    const finish = () => { over = true; setTimeout(() => onEnd(score), 1300); };
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        W = w; H = h; const G = geo();
        if (first) { first = false; me.x = me.tx = G.x0 + G.tw / 2; me.y = me.ty = G.y0 + G.th * 0.82; ai.x = G.x0 + G.tw / 2; ai.y = G.y0 + G.th * 0.18; serve(-1); }
        // your mallet chases your finger (quick but not instant), the CPU tracks the puck
        me.px = me.x; me.py = me.y;
        me.x += (clamp(me.tx, G.x0 + G.R, G.x0 + G.tw - G.R) - me.x) * Math.min(1, dt * 22);
        me.y += (clamp(me.ty, G.y0 + G.th / 2 + G.R, G.y0 + G.th - G.R) - me.y) * Math.min(1, dt * 22);
        me.vx = (me.x - me.px) / Math.max(dt, 0.001); me.vy = (me.y - me.py) / Math.max(dt, 0.001);
        const cmax = G.tw * (1.1 + (cpuSpeed - 1) * 0.9), inMine = P.y < G.y0 + G.th / 2;
        const ttx = inMine ? P.x : G.x0 + G.tw / 2 + (P.x - (G.x0 + G.tw / 2)) * 0.4, tty = inMine && P.vy < 60 ? P.y - G.pr * 1.5 : G.y0 + G.th * 0.14;
        const dx = ttx - ai.x, dy = tty - ai.y, d = Math.hypot(dx, dy);
        ai.vx = d > 1 ? (dx / d) * Math.min(cmax, d * 8) : 0; ai.vy = d > 1 ? (dy / d) * Math.min(cmax, d * 8) : 0;
        ai.x = clamp(ai.x + ai.vx * dt, G.x0 + G.R, G.x0 + G.tw - G.R); ai.y = clamp(ai.y + ai.vy * dt, G.y0 + G.R, G.y0 + G.th / 2 - G.R);
        if (!over) {
          if (wait > 0) wait -= dt;
          else {
            for (let s = 0; s < 3; s++) {
              const sd = dt / 3;
              P.x += P.vx * sd; P.y += P.vy * sd;
              // walls (not the goal mouths)
              if (P.x < G.x0 + G.pr) { P.x = G.x0 + G.pr; P.vx = Math.abs(P.vx) * 0.92; sfx.tick(); }
              if (P.x > G.x0 + G.tw - G.pr) { P.x = G.x0 + G.tw - G.pr; P.vx = -Math.abs(P.vx) * 0.92; sfx.tick(); }
              const inMouth = Math.abs(P.x - (G.x0 + G.tw / 2)) < G.goal / 2;
              if (P.y < G.y0 + G.pr && !inMouth) { P.y = G.y0 + G.pr; P.vy = Math.abs(P.vy) * 0.92; sfx.tick(); }
              if (P.y > G.y0 + G.th - G.pr && !inMouth) { P.y = G.y0 + G.th - G.pr; P.vy = -Math.abs(P.vy) * 0.92; sfx.tick(); }
              for (const [m, mine] of [[me, true], [ai, false]] as const) {
                const ddx = P.x - m.x, ddy = P.y - m.y, dd = Math.hypot(ddx, ddy), min = G.R + G.pr;
                if (dd < min && dd > 0) {
                  const nx = ddx / dd, ny = ddy / dd;
                  P.x = m.x + nx * min; P.y = m.y + ny * min;
                  const rv = (P.vx - m.vx) * nx + (P.vy - m.vy) * ny;
                  if (rv < 0) { P.vx -= 1.9 * rv * nx; P.vy -= 1.9 * rv * ny; }
                  const sp = Math.hypot(P.vx, P.vy), cap = G.th * 2.6;
                  if (sp > cap) { P.vx *= cap / sp; P.vy *= cap / sp; }
                  if (mine && hitCd <= 0) { score += 2; hitCd = 0.3; sfx.bonk(); tap(haptics); fx.burst(P.x, P.y, '#22E3FF', 6, 90); setHud({ score }); }
                  else if (!mine && hitCd <= 0) { sfx.thud(); hitCd = 0.2; }
                }
              }
            }
            const f = Math.pow(0.55, dt); P.vx *= f; P.vy *= f;
            hitCd -= dt;
            // goals
            if (P.y < G.y0 - G.pr) {
              const pts = P.gold ? 300 : 100; score += pts; you++; shake = 0.35; cpuSpeed *= endless ? 1.08 : 1.04;
              sfx.jackpot(); tap(haptics, 'success'); pops.add(P.gold ? `GOLD GOAL! +${pts}` : `GOAL! +${pts}`, P.gold ? '#FFD84D' : '#3DDC97', 50, 30, true); fx.burst(P.x, G.y0, RAINBOW, 50, 260);
              setHud({ score, you });
              if (!endless && you >= 7) { pops.add('YOU WIN!', '#FFE14D', 50, 45, true); finish(); } else serve(-1);
            } else if (P.y > G.y0 + G.th + G.pr) {
              cpu++; shake = 0.25; sfx.fail(); tap(haptics, 'warning'); pops.add('CPU SCORES', '#FF3D6E', 50, 60, true);
              if (endless) { lives--; setHud({ cpu, lives }); if (lives <= 0) finish(); else serve(1); }
              else { setHud({ cpu }); if (cpu >= 7) { pops.add('GAME OVER', '#FF3D6E', 50, 45, true); finish(); } else serve(1); }
            }
          }
        }
        // draw
        shake = Math.max(0, shake - dt);
        g.save(); if (shake) g.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16);
        bg(g, W, H, '#05061A', '#0B0326');
        g.fillStyle = '#0D1A3A'; g.strokeStyle = '#22E3FF'; g.lineWidth = 3; g.shadowColor = '#22E3FF'; g.shadowBlur = 14;
        g.beginPath(); g.roundRect(G.x0, G.y0, G.tw, G.th, 18); g.fill(); g.stroke(); g.shadowBlur = 0;
        // air holes
        g.fillStyle = 'rgba(120,200,255,0.12)'; for (let yy = G.y0 + 14; yy < G.y0 + G.th; yy += 18) for (let xx = G.x0 + 14; xx < G.x0 + G.tw; xx += 18) g.fillRect(xx, yy, 2, 2);
        g.strokeStyle = 'rgba(255,61,154,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(G.x0, G.y0 + G.th / 2); g.lineTo(G.x0 + G.tw, G.y0 + G.th / 2); g.stroke();
        g.beginPath(); g.arc(G.x0 + G.tw / 2, G.y0 + G.th / 2, G.tw * 0.16, 0, Math.PI * 2); g.stroke();
        for (const [y, c] of [[G.y0, '#3DDC97'], [G.y0 + G.th, '#FF3D6E']] as const) { g.strokeStyle = c; g.lineWidth = 6; g.shadowColor = c; g.shadowBlur = 16; g.beginPath(); g.moveTo(G.x0 + G.tw / 2 - G.goal / 2, y); g.lineTo(G.x0 + G.tw / 2 + G.goal / 2, y); g.stroke(); g.shadowBlur = 0; }
        // the puck (with a trail) and mallets
        const pc = P.gold ? '#FFD84D' : '#FFFFFF';
        g.globalAlpha = 0.25; glowCircle(g, P.x - P.vx * 0.03, P.y - P.vy * 0.03, G.pr * 0.9, pc, 0); g.globalAlpha = 1;
        glowCircle(g, P.x, P.y, G.pr, pc, P.gold ? 24 + Math.sin(t * 10) * 8 : 12);
        for (const [m, c] of [[me, '#22E3FF'], [ai, '#FF3D6E']] as const) { glowCircle(g, m.x, m.y, G.R, c, 18); g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(m.x, m.y, G.R * 0.55, 0, Math.PI * 2); g.fill(); glowCircle(g, m.x, m.y, G.R * 0.3, '#fff', 0); }
        fx.draw(g, dt, 0);
        g.restore();
      },
      down: (p) => { me.tx = p.x; me.ty = p.y; },
      move: (p) => { me.tx = p.x; me.ty = p.y; },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="airhockey" cv={cv}>
      <Hud score={hud.score} left={<Led label="YOU · CPU" v={`${hud.you} · ${hud.cpu}`} />} right={endless ? <Lives n={hud.lives} max={3} /> : hud.gold ? <Led label="PUCK" v="GOLD" c="#FFD84D" /> : undefined} />
      <Tip>DRAG YOUR MALLET · {endless ? 'the CPU gets faster' : 'first to 7'}</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Pinball
// ======================================================================================================
type Seg = { ax: number; ay: number; bx: number; by: number; kick?: number; id?: string };
export function Pinball({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, balls: 3, multi: false });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    // table in units: x 0..1, y 0..1.6
    const TW = 1, TH = 1.6, BR = 0.022, GRAV = 1.5;
    const walls: Seg[] = [];
    const wall = (pts: [number, number][], kick?: number, id?: string) => { for (let i = 0; i < pts.length - 1; i++) walls.push({ ax: pts[i][0], ay: pts[i][1], bx: pts[i + 1][0], by: pts[i + 1][1], kick, id }); };
    const arc: [number, number][] = []; for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; arc.push([0.5 + Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.46]); }
    wall([[0.02, 1.3], [0.02, 0.5], ...arc, [0.98, 0.5], [0.98, 1.3]]);
    wall([[0.02, 1.3], [0.27, 1.45]]); wall([[0.98, 1.3], [0.73, 1.45]]); // inlanes into the flippers
    wall([[0.16, 1.1], [0.16, 1.24], [0.26, 1.3]], 1.1, 'sl'); wall([[0.26, 1.3], [0.16, 1.1]], 1.1, 'sl');
    wall([[0.84, 1.1], [0.84, 1.24], [0.74, 1.3]], 1.1, 'sr'); wall([[0.74, 1.3], [0.84, 1.1]], 1.1, 'sr');
    const bumpers = [{ x: 0.33, y: 0.42 }, { x: 0.67, y: 0.42 }, { x: 0.5, y: 0.6 }].map((b) => ({ ...b, r: 0.06, flash: 0 }));
    const targets = [0.36, 0.5, 0.64].map((x) => ({ x, y: 0.2, lit: false, flash: 0 }));
    const flip = [{ px: 0.27, py: 1.45, side: 1, a: 0.5, w: 0, up: false }, { px: 0.73, py: 1.45, side: -1, a: 0.5, w: 0, up: false }];
    const FL = 0.17, REST = 0.5, UP = -0.45;
    type Ball = { x: number; y: number; vx: number; vy: number };
    const balls: Ball[] = [];
    let left = 3, score = 0, over = false, multi = 0, nextExtra = 1500, serveT = 0.6;
    const serve = () => { balls.push({ x: 0.9, y: 0.55, vx: -0.4 - r() * 0.5, vy: -0.6 }); sfx.drop(); };
    const add = (n: number, x: number, y: number, c = '#fff') => { const p = n * (multi > 0 ? 2 : 1); score += p; if (endless && score >= nextExtra) { nextExtra += 1500; left++; pops.add('EXTRA BALL!', '#3DDC97', 50, 50, true); sfx.win(5); } setHud({ score, balls: left }); fx.burst(x, y, c, 8, 120); };
    const collideSeg = (b: Ball, s: Seg, restit = 0.45, vel?: (x: number, y: number) => [number, number]) => {
      const ex = s.bx - s.ax, ey = s.by - s.ay, l2 = ex * ex + ey * ey;
      const k = clamp(((b.x - s.ax) * ex + (b.y - s.ay) * ey) / l2, 0, 1);
      const cx = s.ax + ex * k, cy = s.ay + ey * k, dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if (d >= BR || d === 0) return false;
      const nx = dx / d, ny = dy / d;
      b.x = cx + nx * BR; b.y = cy + ny * BR;
      const [svx, svy] = vel ? vel(cx, cy) : [0, 0];
      const rv = (b.vx - svx) * nx + (b.vy - svy) * ny;
      if (rv < 0) { b.vx -= (1 + restit) * rv * nx; b.vy -= (1 + restit) * rv * ny; }
      if (s.kick) { b.vx += nx * s.kick; b.vy += ny * s.kick; }
      return true;
    };
    let scale = 1, ox = 0, oy = 0;
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        scale = Math.min(W / (TW + 0.06), (H - 60) / (TH + 0.04)); ox = (W - TW * scale) / 2; oy = Math.max(28, (H - TH * scale) / 2);
        if (!over) {
          if (!balls.length) { serveT -= dt; if (serveT <= 0) { serveT = 0.9; if (left > 0) serve(); } }
          const SUB = 6, sd = dt / SUB;
          for (let s = 0; s < SUB; s++) {
            for (const f of flip) { const target = f.up ? UP : REST, prev = f.a; f.a += clamp(target - f.a, -18 * sd, 18 * sd); f.w = (f.a - prev) / sd; }
            for (const b of balls) {
              b.vy += GRAV * sd; b.x += b.vx * sd; b.y += b.vy * sd;
              const sp = Math.hypot(b.vx, b.vy); if (sp > 3.4) { b.vx *= 3.4 / sp; b.vy *= 3.4 / sp; }
              for (const w of walls) if (collideSeg(b, w, w.kick ? 0.5 : 0.35) && w.kick) { add(5, b.x * scale + ox, b.y * scale + oy, '#22E3FF'); sfx.bonk(); }
              for (const bp of bumpers) {
                const dx = b.x - bp.x, dy = b.y - bp.y, d = Math.hypot(dx, dy);
                if (d < bp.r + BR) { const nx = dx / d, ny = dy / d; b.x = bp.x + nx * (bp.r + BR); b.y = bp.y + ny * (bp.r + BR); const v = Math.max(1.6, Math.hypot(b.vx, b.vy)); b.vx = nx * v; b.vy = ny * v; bp.flash = 0.2; add(10, bp.x * scale + ox, bp.y * scale + oy, '#FF3D9A'); sfx.blip(5 + Math.floor(r() * 5)); tap(haptics); }
              }
              for (const tg of targets) {
                if (!tg.lit && Math.abs(b.x - tg.x) < 0.05 && Math.abs(b.y - tg.y) < 0.03) {
                  tg.lit = true; tg.flash = 0.4; b.vy = Math.abs(b.vy) * 0.8 + 0.3; add(50, tg.x * scale + ox, tg.y * scale + oy, '#FFE14D'); sfx.win(3);
                  if (targets.every((x) => x.lit)) {
                    // MULTIBALL: two more balls, bumpers pay double for 15 seconds
                    multi = 15; targets.forEach((x) => (x.lit = false)); setHud({ multi: true });
                    pops.add('MULTIBALL!', '#FF3D9A', 50, 35, true); sfx.jackpot(); tap(haptics, 'success');
                    balls.push({ x: 0.5, y: 0.3, vx: -0.8, vy: 0.2 }, { x: 0.5, y: 0.3, vx: 0.8, vy: 0.2 });
                  }
                }
              }
              for (const f of flip) {
                const a = f.a * f.side, ex = Math.cos(a) * FL * f.side, ey = Math.sin(a) * FL;
                const seg: Seg = { ax: f.px, ay: f.py, bx: f.px + ex, by: f.py + ey };
                collideSeg(b, seg, 0.3, (x, y) => { const rx = x - f.px, ry = y - f.py, w = f.w * f.side; return [-w * ry, w * rx]; });
              }
            }
          }
          multi = Math.max(0, multi - dt); if (!multi) setHud({ multi: false });
          for (let i = balls.length - 1; i >= 0; i--) if (balls[i].y > TH + 0.05) { balls.splice(i, 1); if (!balls.length) { left--; setHud({ balls: left }); sfx.fail(); tap(haptics, 'warning'); pops.add(left > 0 ? 'BALL LOST' : 'GAME OVER', '#FF3D6E', 50, 50, true); if (left <= 0) { over = true; setTimeout(() => onEnd(score), 1300); } } }
        }
        // draw
        bg(g, W, H, '#100526', '#04020C');
        g.save(); g.translate(ox, oy); g.scale(scale, scale);
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = '#8B5CFF'; g.lineWidth = 0.012; g.shadowColor = '#8B5CFF'; g.shadowBlur = 10;
        for (const w of walls) { g.strokeStyle = w.id ? '#22E3FF' : '#8B5CFF'; g.beginPath(); g.moveTo(w.ax, w.ay); g.lineTo(w.bx, w.by); g.stroke(); }
        g.shadowBlur = 0;
        for (const b of bumpers) { b.flash = Math.max(0, b.flash - dt); glowCircle(g, b.x, b.y, b.r, b.flash > 0 ? '#FFFFFF' : multi ? '#FFD84D' : '#FF3D9A', 14); g.fillStyle = '#1A0B30'; g.beginPath(); g.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2); g.fill(); }
        for (const tg of targets) { tg.flash = Math.max(0, tg.flash - dt); g.fillStyle = tg.lit ? '#FFE14D' : '#3A2A10'; g.shadowColor = '#FFE14D'; g.shadowBlur = tg.lit ? 14 : 0; g.fillRect(tg.x - 0.04, tg.y - 0.012, 0.08, 0.024); g.shadowBlur = 0; }
        for (const f of flip) { const a = f.a * f.side; g.strokeStyle = '#FFE14D'; g.lineWidth = 0.03; g.shadowColor = '#FFB13D'; g.shadowBlur = 10; g.beginPath(); g.moveTo(f.px, f.py); g.lineTo(f.px + Math.cos(a) * FL * f.side, f.py + Math.sin(a) * FL); g.stroke(); g.shadowBlur = 0; }
        for (const b of balls) { const gr = g.createRadialGradient(b.x - BR * 0.4, b.y - BR * 0.4, BR * 0.1, b.x, b.y, BR); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#8D97B5'); g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, BR, 0, Math.PI * 2); g.fill(); }
        g.restore();
        g.font = `900 ${Math.round(scale * 0.04)}px ui-rounded, system-ui`; g.textAlign = 'center'; g.fillStyle = multi ? '#FF3D9A' : 'rgba(255,255,255,0.35)'; g.fillText(multi ? `MULTIBALL ${Math.ceil(multi)}` : 'LIGHT ALL 3 FOR MULTIBALL', ox + 0.5 * scale, oy + 0.3 * scale);
        fx.draw(g, dt, 200);
        void t;
      },
      down: (p) => { const side = p.x < (cv.current!.getBoundingClientRect().width / 2) ? 0 : 1; flip[side].up = true; sfx.tick(); held.set(p.id, side); },
      up: (p) => { const s = held.get(p.id); if (s != null) { flip[s].up = false; held.delete(p.id); } },
      key: (k, d) => { if (k === 'ArrowLeft' || k === 'z' || k === 'a') flip[0].up = d; if (k === 'ArrowRight' || k === 'm' || k === 'l') flip[1].up = d; },
    };
    const held = new Map<number, number>();
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="pinball" cv={cv}>
      <Hud score={hud.score} left={hud.multi ? <Led label="BUMPERS" v="×2" c="#FF3D9A" /> : undefined} right={<Led label="BALLS" v={hud.balls} />} />
      <Tip>TAP LEFT / RIGHT FOR THE FLIPPERS{endless ? ' · extra ball every 1,500' : ''}</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Coin Pusher
// ======================================================================================================
export function CoinPusher({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, coins: endless ? 20 : 30 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    // field units: x 0..1 across, y 0..1 from the back wall to the front ledge
    type Coin = { x: number; y: number; vx: number; vy: number; gold?: boolean; gem?: boolean; falling: number; side?: boolean };
    const CR = 0.045, coins: Coin[] = [];
    for (let i = 0; i < 46; i++) coins.push({ x: 0.1 + r() * 0.8, y: 0.42 + r() * 0.5, vx: 0, vy: 0, falling: 0, gem: i % 15 === 7 });
    let tray = endless ? 20 : 30, score = 0, drops = 0, idle = 0, over = false, P = 0.2, t0 = 0;
    const drop = (x: number) => {
      if (over || tray <= 0) return;
      tray--; drops++; idle = 0;
      const gold = drops % 10 === 0;
      coins.push({ x: clamp(x, 0.08, 0.92), y: Math.max(0.4, P + CR + 0.01), vx: 0, vy: 0, gold, falling: 0.25 });
      sfx.coin(); tap(haptics); setHud({ coins: tray });
      if (gold) pops.add('GOLD COIN!', '#FFD84D', 50, 40);
    };
    let fw = 0, fh = 0, fx0 = 0, fy0 = 0;
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        fw = Math.min(W * 0.92, H * 0.7); fh = Math.min(H * 0.78, fw * 1.25); fx0 = (W - fw) / 2; fy0 = (H - fh) / 2 + 10;
        t0 += dt;
        // the pusher slides back and forth; anything in its way is shoved forward
        P = 0.2 + (0.5 - 0.5 * Math.cos(t0 * 1.6)) * 0.17;
        if (!over) {
          for (const c of coins) { if (c.falling > 0) { c.falling -= dt; continue; } if (c.y < P + CR) c.y = P + CR; }
          // coins nudge each other (a few relaxation passes)
          for (let it = 0; it < 3; it++) for (let i = 0; i < coins.length; i++) for (let j = i + 1; j < coins.length; j++) {
            const a = coins[i], b = coins[j]; if (a.falling > 0 || b.falling > 0) continue;
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d < CR * 2 && d > 0) {
              const push = (CR * 2 - d) / 2, nx = dx / d, ny = dy / d;
              // the back one can't go backwards into the pusher, so the front one takes the shove
              const aBlocked = a.y <= P + CR + 0.002, bBlocked = b.y <= P + CR + 0.002;
              if (!aBlocked) { a.x -= nx * push; a.y -= ny * push; } else { b.x += nx * push; b.y += ny * push; }
              if (!bBlocked) { b.x += nx * push; b.y += ny * push; } else { a.x -= nx * push; a.y -= ny * push; }
            }
          }
          let won = 0;
          for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i]; c.x = clamp(c.x, CR * 0.3, 1 - CR * 0.3);
            if (c.y > 1.0) {
              coins.splice(i, 1);
              const pts = c.gem ? 50 : c.gold ? 100 : 10; score += pts; won++;
              fx.burst(fx0 + c.x * fw, fy0 + fh, c.gold || c.gem ? '#FFD84D' : '#E8C55A', c.gold ? 30 : 8, 160);
              pops.add(c.gem ? `💎 +${pts}` : `+${pts}`, c.gold || c.gem ? '#FFD84D' : '#fff', 15 + c.x * 70, 82, c.gold || c.gem);
              if (endless) tray++;
              if (c.gold) {
                // COIN SHOWER: a rain of coins all over the field
                pops.add('COIN SHOWER!', '#FFE14D', 50, 30, true); sfx.jackpot(); tap(haptics, 'success');
                for (let k = 0; k < 10; k++) coins.push({ x: 0.1 + r() * 0.8, y: 0.45 + r() * 0.4, vx: 0, vy: 0, falling: 0.2 + k * 0.05 });
              }
            } else if ((c.x < CR * 0.6 || c.x > 1 - CR * 0.6) && c.y > 0.6) { coins.splice(i, 1); }
          }
          if (won) { sfx.tickets(won * 2); setHud({ score, coins: tray }); }
          if (tray <= 0) { idle += dt; if (idle > 4) { over = true; pops.add(`TOTAL ${score}`, '#FFE14D', 50, 40, true); setTimeout(() => onEnd(score), 1200); } }
        }
        // draw: the cabinet from above-ish
        bg(g, W, H, '#1A0A2E', '#06020F');
        g.fillStyle = '#2A1650'; g.fillRect(fx0, fy0, fw, fh);
        g.strokeStyle = '#B57BFF'; g.lineWidth = 3; g.shadowColor = '#B57BFF'; g.shadowBlur = 12; g.strokeRect(fx0, fy0, fw, fh); g.shadowBlur = 0;
        // the pusher
        const pg = g.createLinearGradient(0, fy0, 0, fy0 + P * fh); pg.addColorStop(0, '#5A4A8A'); pg.addColorStop(1, '#C9BEFF');
        g.fillStyle = pg; g.fillRect(fx0, fy0, fw, P * fh);
        g.fillStyle = '#FF3D9A'; g.fillRect(fx0, fy0 + P * fh - 3, fw, 3);
        // drop line
        g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(fx0, fy0 + 0.4 * fh); g.lineTo(fx0 + fw, fy0 + 0.4 * fh); g.stroke(); g.setLineDash([]);
        // the front ledge glows
        g.fillStyle = '#FFE14D'; g.shadowColor = '#FFE14D'; g.shadowBlur = 16; g.fillRect(fx0, fy0 + fh - 3, fw, 4); g.shadowBlur = 0;
        const sorted = [...coins].sort((a, b) => a.y - b.y);
        for (const c of sorted) {
          const x = fx0 + c.x * fw, y = fy0 + c.y * fh - (c.falling > 0 ? c.falling * 120 : 0), rr = CR * fw;
          if (c.gem) { g.font = `${rr * 2.2}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('💎', x, y); continue; }
          const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr);
          gr.addColorStop(0, c.gold ? '#FFF6C2' : '#FFF0B0'); gr.addColorStop(1, c.gold ? '#E0A800' : '#B8862E');
          g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rr, rr * 0.8, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = c.gold ? '#FFF' : 'rgba(90,60,10,0.6)'; g.lineWidth = 1; g.stroke();
          if (c.gold) { g.shadowColor = '#FFE14D'; g.shadowBlur = 10 + Math.sin(t * 8) * 5; g.stroke(); g.shadowBlur = 0; }
        }
        fx.draw(g, dt);
      },
      down: (p) => drop((p.x - fx0) / fw),
      key: (k, d) => { if (d && k === ' ') drop(0.2 + r() * 0.6); },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="pusher" cv={cv}>
      <Hud score={hud.score} right={<Led label="COINS" v={hud.coins} c="#FFE14D" />} />
      <Tip>TAP TO DROP A COIN · push them off the front{endless ? ' · every coin won comes back' : ''}</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Ink Maze (an ink blob slurping paint drops, chased by smudges)
// ======================================================================================================
const MAZE = [
  '###############',
  '#o.....#.....o#',
  '#.##.#.#.#.##.#',
  '#.............#',
  '#.##.#####.##.#',
  '#....#...#....#',
  '####.#.#.#.####',
  '   #...G...#   ',
  '####.##-##.####',
  '#......P......#',
  '#.##.#####.##.#',
  '#o.#.......#.o#',
  '##.#.#.#.#.#.##',
  '#....#.#.#....#',
  '#.####.#.####.#',
  '#.............#',
  '###############',
];
export function InkMaze({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, lvl: 1 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    const H0 = MAZE.length, W0 = MAZE[0].length;
    let grid: string[][] = [], dots = 0, eaten = 0, score = 0, lives = 3, lvl = 1, over = false, power = 0, chain = 0, fruitT = 0, fruits = 0, fruit: { x: number; y: number; gold: boolean } | null = null, pause = 1;
    const wallAt = (x: number, y: number) => { const yy = ((y % H0) + H0) % H0, xx = ((x % W0) + W0) % W0; return grid[yy][xx] === '#'; };
    type Mover = { x: number; y: number; fx: number; fy: number; dir: number; want: number; speed: number; home: [number, number]; mode?: 'chase' | 'scared' | 'eaten'; col?: string };
    let blob: Mover, smudges: Mover[] = [];
    const load = () => {
      grid = MAZE.map((row) => row.split('')); dots = 0;
      let ps: [number, number] = [7, 9]; const gs: [number, number] = [7, 7];
      for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) { const c = grid[y][x]; if (c === '.' || c === 'o') dots++; if (c === 'P') { ps = [x, y]; grid[y][x] = ' '; } if (c === 'G') grid[y][x] = ' '; }
      blob = { x: ps[0], y: ps[1], fx: ps[0], fy: ps[1], dir: 3, want: 3, speed: 5.2, home: ps };
      const sp = 3.6 + (lvl - 1) * 0.45;
      smudges = ['#3DDC97', '#FFB13D', '#B6FF3D', '#FF3D6E'].slice(0, lvl > 1 ? 4 : 3).map((col, i) => ({ x: gs[0] + (i - 1), y: gs[1], fx: gs[0] + (i - 1), fy: gs[1], dir: 0, want: 0, speed: sp, home: [gs[0], gs[1]] as [number, number], mode: 'chase', col }));
      eaten = 0; fruit = null; fruits = 0; pause = 1.2;
    };
    load();
    const reset = () => { blob.x = blob.fx = blob.home[0]; blob.y = blob.fy = blob.home[1]; blob.dir = blob.want = 3; smudges.forEach((g2, i) => { g2.x = g2.fx = g2.home[0] + (i - 1); g2.y = g2.fy = g2.home[1]; g2.mode = 'chase'; }); power = 0; pause = 1.2; };
    const canGo = (m: Mover, d: number, smudge = false) => { const [dx, dy] = DIRS[d]; const nx = m.x + dx, ny = m.y + dy; if (ny < 0 || ny >= H0) return false; const c = grid[ny][((nx % W0) + W0) % W0]; return c !== '#' && (smudge || c !== '-'); };
    const step = (m: Mover, dt: number, choose: () => void) => {
      // moves cell to cell; picks the next direction at each cell centre
      const [dx, dy] = DIRS[m.dir];
      const tx = m.x + dx, ty = m.y + dy;
      const sp = m.speed * dt;
      const ddx = tx - m.fx, ddy = ty - m.fy, d = Math.hypot(ddx, ddy);
      if (!wallAtMover(m, m.dir)) {
        if (d <= sp) { m.x = ((tx % W0) + W0) % W0; m.y = ty; m.fx = m.x; m.fy = m.y; choose(); }
        else { m.fx += (ddx / d) * sp; m.fy += (ddy / d) * sp; }
      } else choose();
    };
    const wallAtMover = (m: Mover, d: number) => !canGo(m, d, m !== blob);
    const blobChoose = () => { if (canGo(blob, blob.want)) blob.dir = blob.want; eatAt(blob.x, blob.y); };
    const smudgeChoose = (gh: Mover, i: number) => () => {
      if (gh.mode === 'eaten' && gh.x === gh.home[0] && gh.y === gh.home[1]) gh.mode = 'chase';
      const opts = [0, 1, 2, 3].filter((d) => d !== (gh.dir + 2) % 4 && canGo(gh, d, true));
      const choices = opts.length ? opts : [(gh.dir + 2) % 4];
      let target: [number, number] = [blob.x, blob.y];
      if (i === 1) target = [blob.x + DIRS[blob.dir][0] * 3, blob.y + DIRS[blob.dir][1] * 3];
      if (i === 2 && r() < 0.5) target = [Math.floor(r() * W0), Math.floor(r() * H0)];
      if (gh.mode === 'eaten') target = gh.home;
      if (gh.mode === 'scared') { gh.dir = choices[Math.floor(r() * choices.length)]; return; }
      gh.dir = choices.sort((a, b) => Math.hypot(gh.x + DIRS[a][0] - target[0], gh.y + DIRS[a][1] - target[1]) - Math.hypot(gh.x + DIRS[b][0] - target[0], gh.y + DIRS[b][1] - target[1]))[0];
    };
    const eatAt = (x: number, y: number) => {
      const c = grid[y]?.[x];
      if (c === '.') { grid[y][x] = ' '; score += 2; eaten++; if (eaten % 4 === 0) sfx.tick(); }
      else if (c === 'o') { grid[y][x] = ' '; score += 10; eaten++; power = Math.max(4, 8 - lvl); chain = 0; smudges.forEach((g2) => { if (g2.mode !== 'eaten') { g2.mode = 'scared'; g2.dir = (g2.dir + 2) % 4; } }); sfx.win(3); }
      else return;
      if (eaten === 40 || eaten === 100) { fruits++; fruit = { x: 7, y: 9, gold: fruits % 2 === 0 || (lvl > 1 && r() < 0.3) }; fruitT = 9; }
      setHud({ score });
      if (eaten >= dots) {
        score += 500; sfx.jackpot(); tap(haptics, 'success'); pops.add('MAZE CLEAR! +500', '#FFE14D', 50, 40, true); setHud({ score });
        if (endless) { lvl++; setHud({ lvl }); load(); } else { over = true; setTimeout(() => onEnd(score), 1300); }
      }
    };
    const dir = swipe((d) => { blob.want = d; if (canGo(blob, d) && (d + 2) % 4 === blob.dir) blob.dir = d; });
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        const cs = Math.min(W / W0, (H - 60) / H0), ox = (W - cs * W0) / 2, oy = Math.max(30, (H - cs * H0) / 2);
        if (!over) {
          if (pause > 0) pause -= dt;
          else {
            step(blob, dt, blobChoose);
            power = Math.max(0, power - dt); if (!power) smudges.forEach((g2) => { if (g2.mode === 'scared') g2.mode = 'chase'; });
            smudges.forEach((gh, i) => { const sp = gh.speed; if (gh.mode === 'scared') gh.speed = sp * 0.55; if (gh.mode === 'eaten') gh.speed = sp * 2.2; step(gh, dt, smudgeChoose(gh, i)); gh.speed = sp; });
            if (fruit) { fruitT -= dt; if (fruitT <= 0) fruit = null; else if (Math.hypot(blob.fx - fruit.x, blob.fy - fruit.y) < 0.6) { const pts = fruit.gold ? 500 : 100; score += pts; setHud({ score }); pops.add(fruit.gold ? `GOLDEN BRUSH +${pts}` : `PALETTE +${pts}`, fruit.gold ? '#FFD84D' : '#22E3FF', 50, 50, fruit.gold); fx.burst(ox + (fruit.x + 0.5) * cs, oy + (fruit.y + 0.5) * cs, fruit.gold ? '#FFD84D' : RAINBOW, 24); sfx.win(fruit.gold ? 5 : 3); fruit = null; } }
            for (const gh of smudges) {
              if (Math.hypot(gh.fx - blob.fx, gh.fy - blob.fy) > 0.6) continue;
              if (gh.mode === 'scared') { chain++; const pts = 50 * Math.pow(2, Math.min(3, chain - 1)); score += pts; gh.mode = 'eaten'; setHud({ score }); pops.add(`+${pts}`, '#22E3FF', 50, 45, true); sfx.perfect(chain * 3); tap(haptics, 'medium'); }
              else if (gh.mode === 'chase') {
                lives--; setHud({ lives }); sfx.fail(); tap(haptics, 'heavy');
                fx.burst(ox + (blob.fx + 0.5) * cs, oy + (blob.fy + 0.5) * cs, '#FFE14D', 30, 200);
                if (lives <= 0) { over = true; pops.add('GAME OVER', '#FF3D6E', 50, 45, true); setTimeout(() => onEnd(score), 1300); } else { pops.add('OUCH!', '#FF3D6E', 50, 45, true); reset(); }
                break;
              }
            }
          }
        }
        bg(g, W, H, '#14081F', '#0A0412');
        // walls: thick strokes of paint (one connected stroke per run of wall), with a lighter highlight
        const wallPath = new Path2D();
        for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
          if (grid[y][x] !== '#') continue;
          const X = ox + (x + 0.5) * cs, Y = oy + (y + 0.5) * cs;
          wallPath.moveTo(X, Y); wallPath.lineTo(X + 0.01, Y);
          if (x + 1 < W0 && grid[y][x + 1] === '#') { wallPath.moveTo(X, Y); wallPath.lineTo(X + cs, Y); }
          if (y + 1 < H0 && grid[y + 1][x] === '#') { wallPath.moveTo(X, Y); wallPath.lineTo(X, Y + cs); }
        }
        const wg = g.createLinearGradient(ox, oy, ox + cs * W0, oy + cs * H0); wg.addColorStop(0, '#22C7B5'); wg.addColorStop(0.5, '#7B5CFF'); wg.addColorStop(1, '#FF4D9A');
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = wg; g.lineWidth = cs * 0.62; g.stroke(wallPath);
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = cs * 0.16; g.stroke(wallPath);
        const DROP = ['#FF4D6D', '#FFB13D', '#FFE14D', '#3DDC97', '#22E3FF', '#B57BFF'];
        for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
          const c = grid[y][x], X = ox + (x + 0.5) * cs, Y = oy + (y + 0.5) * cs;
          if (c === '.') {
            // a little paint drop
            const r0 = cs * 0.1; g.fillStyle = DROP[(x * 7 + y * 3) % DROP.length];
            g.beginPath(); g.moveTo(X, Y - r0 * 1.9); g.quadraticCurveTo(X + r0 * 1.1, Y - r0 * 0.2, X, Y + r0); g.quadraticCurveTo(X - r0 * 1.1, Y - r0 * 0.2, X, Y - r0 * 1.9); g.fill();
          }
          if (c === 'o') {
            // a paint bucket, sloshing
            const k = reduce ? 0 : Math.sin(t * 6 + x) * 0.06, bw = cs * 0.56, bh = cs * 0.5;
            g.fillStyle = '#E6ECF5'; g.beginPath(); g.moveTo(X - bw / 2, Y - bh / 2); g.lineTo(X + bw / 2, Y - bh / 2); g.lineTo(X + bw * 0.38, Y + bh / 2); g.lineTo(X - bw * 0.38, Y + bh / 2); g.closePath(); g.fill();
            g.fillStyle = DROP[(x + y) % DROP.length]; g.shadowColor = g.fillStyle; g.shadowBlur = 10;
            g.beginPath(); g.ellipse(X, Y - bh / 2, bw / 2, bh * (0.18 + k), 0, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
            g.strokeStyle = '#9AA8BE'; g.lineWidth = 1.5; g.beginPath(); g.arc(X, Y - bh * 0.4, bw * 0.45, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
          }
          if (c === '-') { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(X - cs / 2, Y - 1, cs, 2); }
        }
        // you: a wobbly purple ink blob with big eyes, squashing as it moves and leaving a few drips
        {
          const px = ox + (blob.fx + 0.5) * cs, py = oy + (blob.fy + 0.5) * cs, rr = cs * 0.4, [ddx, ddy] = DIRS[blob.dir];
          const sq = reduce ? 0 : Math.sin(t * 14) * 0.08;
          g.save(); g.translate(px, py);
          g.fillStyle = '#7B5CFF'; g.shadowColor = '#B57BFF'; g.shadowBlur = 14;
          g.beginPath();
          for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2, wob = 1 + (reduce ? 0 : Math.sin(a * 3 + t * 9) * 0.07); const sx = 1 + (ddx ? sq : -sq), sy = 1 + (ddy ? sq : -sq); g.lineTo(Math.cos(a) * rr * wob * sx, Math.sin(a) * rr * wob * sy); }
          g.closePath(); g.fill(); g.shadowBlur = 0;
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-rr * 0.35, -rr * 0.4, rr * 0.22, rr * 0.13, -0.6, 0, Math.PI * 2); g.fill();
          for (const sgn of [-1, 1]) {
            const ex = ddy ? sgn * rr * 0.32 : ddx * rr * 0.18, ey = ddx ? sgn * rr * 0.32 - rr * 0.1 : ddy * rr * 0.18 - rr * 0.1;
            g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + (ddy ? 0 : 0), ey, rr * 0.2, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#140A26'; g.beginPath(); g.arc(ex + ddx * rr * 0.07, ey + ddy * rr * 0.07, rr * 0.1, 0, Math.PI * 2); g.fill();
          }
          g.restore();
        }
        // the smudges: spiky scribbles with cross little eyes; a paint bucket turns them pale and wobbly
        smudges.forEach((gh, gi) => {
          const X = ox + (gh.fx + 0.5) * cs, Y = oy + (gh.fy + 0.5) * cs, rr = cs * 0.42;
          if (gh.mode !== 'eaten') {
            const scared = gh.mode === 'scared';
            g.fillStyle = scared ? (power < 2 && Math.sin(t * 20) > 0 ? '#FFFFFF' : '#C9D3E6') : gh.col!;
            g.globalAlpha = scared ? 0.75 : 1;
            g.beginPath();
            const spikes = 9;
            for (let i = 0; i <= spikes * 2; i++) {
              const a = (i / (spikes * 2)) * Math.PI * 2 + (reduce ? 0 : t * (scared ? 0.6 : 2) + gi), rad = i % 2 ? rr * (scared ? 0.78 : 0.62) : rr * (1 + (reduce ? 0 : Math.sin(t * 7 + i + gi) * 0.08));
              g.lineTo(X + Math.cos(a) * rad, Y + Math.sin(a) * rad);
            }
            g.closePath(); g.fill(); g.globalAlpha = 1;
            if (!scared) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 3; i++) { g.moveTo(X - rr * 0.5, Y + rr * (0.1 + i * 0.12)); g.lineTo(X + rr * 0.5, Y + rr * (0.05 + i * 0.12)); } g.stroke(); }
          }
          // eyes: angry slants when hunting, little worried dots when washed out
          for (const sg of [-1, 1]) {
            const ex = X + sg * rr * 0.28, ey = Y - rr * 0.12;
            g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, rr * 0.18, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#140A26'; g.beginPath(); g.arc(ex + DIRS[gh.dir][0] * rr * 0.07, ey + DIRS[gh.dir][1] * rr * 0.07, rr * 0.09, 0, Math.PI * 2); g.fill();
            if (gh.mode === 'chase') { g.strokeStyle = '#140A26'; g.lineWidth = 2; g.beginPath(); g.moveTo(ex - sg * rr * 0.2, ey - rr * 0.3); g.lineTo(ex + sg * rr * 0.12, ey - rr * 0.18); g.stroke(); }
          }
        });
        fx.draw(g, dt, 0);
        if (pause > 0 && !over) { g.font = '900 22px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillStyle = '#B57BFF'; g.fillText(lvl > 1 ? `MAZE ${lvl}` : 'GO!', W / 2, oy + 9.6 * cs); }
      },
      ...dir,
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="maze" cv={cv}>
      <Hud score={hud.score} left={endless ? <Led label="MAZE" v={hud.lvl} /> : undefined} right={<Lives n={hud.lives} max={3} />} />
      <Tip>SWIPE TO STEER · grab a paint bucket, then wash the smudges away</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Space Blaster
// ======================================================================================================
export function SpaceBlaster({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, wave: 1, triple: false });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    let W = 0, H = 0, score = 0, lives = 3, wave = 1, over = false, fire = 0, triple = 0, inv = 1.5, ufoT = 12, between = 1.2, shake = 0, march = 0, mdir = 1;
    const ship = { x: 0.5, tx: 0.5 };
    type Al = { x: number; y: number; row: number; hp: number; hit: number };
    let aliens: Al[] = [];
    const shots: { x: number; y: number; vx: number }[] = [], bombs: { x: number; y: number }[] = [], drops: { x: number; y: number }[] = [];
    let ufo: { x: number; dir: number } | null = null;
    const stars = Array.from({ length: 60 }, () => ({ x: r(), y: r(), s: 0.3 + r() }));
    const spawn = () => { aliens = []; for (let row = 0; row < 4; row++) for (let c = 0; c < 6; c++) aliens.push({ x: 0.17 + c * 0.13, y: 0.12 + row * 0.075, row, hp: row === 0 && wave > 2 ? 2 : 1, hit: 0 }); march = 0; mdir = 1; };
    spawn();
    const die = () => {
      lives--; inv = 2; shake = 0.4; setHud({ lives }); sfx.fail(); tap(haptics, 'heavy'); fx.burst(ship.x * W, H * 0.88, ['#FF3D6E', '#FFB13D', '#fff'], 40, 260);
      if (lives <= 0) { over = true; pops.add('GAME OVER', '#FF3D6E', 50, 45, true); setTimeout(() => onEnd(score), 1400); }
    };
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        W = w; H = h;
        const speedK = 1 + (wave - 1) * (endless ? 0.12 : 0.15);
        if (!over) {
          ship.x += (clamp(ship.tx, 0.06, 0.94) - ship.x) * Math.min(1, dt * 14);
          inv = Math.max(0, inv - dt); triple = Math.max(0, triple - dt); if (!triple) setHud({ triple: false });
          if (between > 0) { between -= dt; }
          else {
            fire -= dt;
            if (fire <= 0) { fire = 0.26; shots.push({ x: ship.x, y: 0.86, vx: 0 }); if (triple) shots.push({ x: ship.x, y: 0.86, vx: -0.18 }, { x: ship.x, y: 0.86, vx: 0.18 }); sfx.blip(-14); }
            // the fleet marches side to side and steps down at the edges
            const sp = 0.09 * speedK * (1 + (24 - aliens.length) * 0.03);
            march += sp * dt * mdir;
            const xs = aliens.map((a) => a.x + march);
            if (xs.length && (Math.max(...xs) > 0.95 || Math.min(...xs) < 0.05)) { mdir *= -1; march += sp * dt * mdir * 2; aliens.forEach((a) => (a.y += 0.025)); }
            if (aliens.some((a) => a.y > 0.8)) { die(); aliens.forEach((a) => (a.y -= 0.2)); }
            if (r() < dt * (0.8 + wave * 0.25) && aliens.length) { const a = aliens[Math.floor(r() * aliens.length)]; bombs.push({ x: a.x + march, y: a.y + 0.03 }); }
            ufoT -= dt; if (ufoT <= 0 && !ufo) { ufo = { x: r() < 0.5 ? -0.1 : 1.1, dir: 0 }; ufo.dir = ufo.x < 0 ? 1 : -1; ufoT = 14 + r() * 6; sfx.swish(); }
            if (ufo) { ufo.x += ufo.dir * 0.22 * dt; if (ufo.x < -0.15 || ufo.x > 1.15) ufo = null; }
          }
          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i]; s.y -= 1.4 * dt; s.x += s.vx * dt; if (s.y < -0.05) { shots.splice(i, 1); continue; }
            if (ufo && Math.abs(s.x - ufo.x) < 0.06 && Math.abs(s.y - 0.06) < 0.03) { score += 150; setHud({ score }); pops.add('PRISM DRONE +150!', '#FF3D9A', ufo.x * 100, 10, true); fx.burst(ufo.x * W, 0.06 * H, RAINBOW, 40, 240); sfx.jackpot(); tap(haptics, 'success'); ufo = null; shots.splice(i, 1); continue; }
            const hit = aliens.find((a) => Math.abs(a.x + march - s.x) < 0.045 && Math.abs(a.y - s.y) < 0.03);
            if (hit) {
              shots.splice(i, 1); hit.hp--; hit.hit = 0.1;
              if (hit.hp <= 0) {
                const pts = [30, 20, 20, 10][hit.row]; score += pts; aliens.splice(aliens.indexOf(hit), 1); setHud({ score }); sfx.cut(); tap(haptics);
                fx.burst((hit.x + march) * W, hit.y * H, ['#3DDC97', '#22E3FF', '#B6FF3D'][hit.row % 3], 14, 150);
                if (r() < 0.06) drops.push({ x: hit.x + march, y: hit.y });
                if (!aliens.length) {
                  score += 100 * wave; setHud({ score }); pops.add(`WAVE ${wave} CLEAR! +${100 * wave}`, '#FFE14D', 50, 40, true); sfx.win(5);
                  if (!endless && wave >= 5) { over = true; setTimeout(() => onEnd(score), 1400); }
                  else { wave++; setHud({ wave }); spawn(); between = 1.4; bombs.length = 0; }
                }
              } else sfx.thud();
            }
          }
          for (let i = bombs.length - 1; i >= 0; i--) { const b = bombs[i]; b.y += (0.42 + wave * 0.03) * dt; if (b.y > 1.02) bombs.splice(i, 1); else if (!inv && Math.abs(b.x - ship.x) < 0.04 && Math.abs(b.y - 0.88) < 0.03) { bombs.splice(i, 1); die(); } }
          for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.y += 0.3 * dt; if (d.y > 1.02) drops.splice(i, 1); else if (Math.abs(d.x - ship.x) < 0.06 && Math.abs(d.y - 0.88) < 0.04) { drops.splice(i, 1); triple = 8; setHud({ triple: true }); pops.add('TRIPLE SHOT!', '#22E3FF', 50, 60, true); sfx.win(4); } }
        }
        shake = Math.max(0, shake - dt);
        g.save(); if (shake) g.translate((Math.random() - 0.5) * shake * 20, (Math.random() - 0.5) * shake * 20);
        bg(g, W, H, '#02010A', '#0A0420');
        for (const s of stars) { s.y = (s.y + dt * 0.05 * s.s) % 1; g.fillStyle = `rgba(255,255,255,${0.3 + s.s * 0.4})`; g.fillRect(s.x * W, s.y * H, s.s * 2, s.s * 2); }
        const AW = Math.min(W * 0.085, 34);
        // neon drones: a different shape for each row, each with one eye that watches your ship
        for (const a of aliens) {
          const x = (a.x + march) * W, y = a.y * H + (reduce ? 0 : Math.sin(t * 3 + a.x * 20) * 2), c = a.hit > 0 ? '#fff' : ['#FF3D9A', '#B6FF3D', '#22E3FF', '#B57BFF'][a.row];
          a.hit = Math.max(0, a.hit - dt);
          const R = AW * 0.42, sides = [4, 6, 3, 0][a.row], spin = reduce ? 0 : t * (a.row % 2 ? 0.8 : -0.8);
          g.strokeStyle = c; g.lineWidth = 2.2; g.shadowColor = c; g.shadowBlur = 10; g.fillStyle = 'rgba(10,4,32,0.85)';
          g.beginPath();
          if (sides) for (let k = 0; k <= sides; k++) { const an = spin + (k / sides) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(an) * R, y + Math.sin(an) * R); }
          else g.arc(x, y, R * 0.8, 0, Math.PI * 2);
          g.closePath(); g.fill(); g.stroke();
          if (!sides) { g.beginPath(); g.ellipse(x, y, R * 1.2, R * 0.35, spin, 0, Math.PI * 2); g.stroke(); }
          if (a.hp > 1) { g.beginPath(); g.arc(x, y, R * 0.62, 0, Math.PI * 2); g.stroke(); }
          g.shadowBlur = 0;
          const lx = clamp((ship.x * W - x) / W, -0.5, 0.5) * R * 0.5;
          g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, R * 0.3, 0, Math.PI * 2); g.fill();
          g.fillStyle = c; g.beginPath(); g.arc(x + lx, y + R * 0.08, R * 0.15, 0, Math.PI * 2); g.fill();
        }
        // the prism drone: a spinning rainbow crystal
        if (ufo) {
          const x = ufo.x * W, y = 0.06 * H, R = AW * 0.6;
          for (let k = 0; k < 6; k++) {
            const a0 = t * 3 + (k / 6) * Math.PI * 2, a1 = a0 + Math.PI / 3;
            g.fillStyle = RAINBOW[k % RAINBOW.length]; g.shadowColor = g.fillStyle; g.shadowBlur = 12;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a0) * R * 1.4, y + Math.sin(a0) * R * 0.7); g.lineTo(x + Math.cos(a1) * R * 1.4, y + Math.sin(a1) * R * 0.7); g.closePath(); g.fill();
          }
          g.shadowBlur = 0; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, R * 0.25, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#FFE14D'; for (const s of shots) g.fillRect(s.x * W - 1.5, s.y * H - 8, 3, 12);
        g.fillStyle = '#FF3D6E'; for (const b of bombs) { g.beginPath(); g.arc(b.x * W, b.y * H, 3.5, 0, Math.PI * 2); g.fill(); }
        for (const d of drops) { g.font = '18px system-ui, "Apple Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔱', d.x * W, d.y * H); }
        if (!over && (inv === 0 || Math.floor(t * 12) % 2)) {
          const x = ship.x * W, y = 0.9 * H;
          g.fillStyle = triple ? '#22E3FF' : '#3DDC97'; g.shadowColor = g.fillStyle; g.shadowBlur = 14;
          g.beginPath(); g.moveTo(x, y - AW * 0.7); g.lineTo(x + AW * 0.55, y + AW * 0.3); g.lineTo(x, y + AW * 0.1); g.lineTo(x - AW * 0.55, y + AW * 0.3); g.closePath(); g.fill();
          g.fillStyle = '#FFB13D'; g.fillRect(x - 3, y + AW * 0.15, 6, 4 + Math.random() * 8); g.shadowBlur = 0;
        }
        if (between > 0 && !over) { g.font = '900 24px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillStyle = '#FFE14D'; g.fillText(`WAVE ${wave}`, W / 2, H * 0.45); }
        fx.draw(g, dt, 0);
        g.restore();
      },
      down: (p) => { ship.tx = p.x / W; },
      move: (p) => { ship.tx = p.x / W; },
      key: (k, d) => { if (!d) return; if (k === 'ArrowLeft' || k === 'a') ship.tx = ship.x - 0.12; if (k === 'ArrowRight' || k === 'd') ship.tx = ship.x + 0.12; },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="blaster" cv={cv}>
      <Hud score={hud.score} left={<Led label="WAVE" v={endless ? hud.wave : `${hud.wave}/5`} c={hud.triple ? '#22E3FF' : undefined} />} right={<Lives n={hud.lives} max={3} />} />
      <Tip>DRAG TO STEER · it fires by itself · hit the prism drone!</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Rhythm Rush
// ======================================================================================================
const LANE_COL = ['#FF3D9A', '#22E3FF', '#B6FF3D', '#FFB13D'];
let rctx: AudioContext | null = null;
function beatSound(kind: 'kick' | 'hat' | 'note', lane = 0) {
  try {
    rctx ??= new AudioContext(); if (rctx.state === 'suspended') void rctx.resume();
    const c = rctx, t0 = c.currentTime, os = c.createOscillator(), g = c.createGain();
    if (kind === 'kick') { os.type = 'sine'; os.frequency.setValueAtTime(150, t0); os.frequency.exponentialRampToValueAtTime(45, t0 + 0.15); g.gain.setValueAtTime(0.35, t0); }
    else if (kind === 'hat') { os.type = 'square'; os.frequency.setValueAtTime(6000, t0); g.gain.setValueAtTime(0.012, t0); }
    else { os.type = 'square'; os.frequency.setValueAtTime(440 * Math.pow(2, [0, 3, 7, 10][lane] / 12), t0); g.gain.setValueAtTime(0.05, t0); }
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + (kind === 'hat' ? 0.04 : 0.16));
    os.connect(g).connect(c.destination); os.start(t0); os.stop(t0 + 0.2);
  } catch { /* no audio */ }
}
export function RhythmRush({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, combo: 0, fever: 0, lives: 5, left: 60 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    type Note = { lane: number; at: number; hit: boolean; miss: boolean };
    const notes: Note[] = [];
    let bpm = 118, chartTo = 0, songT = -2, score = 0, combo = 0, fever = 0, lives = 5, over = false, lastBeat = -1;
    const SONG = 60, FALL = 1.35;
    const chart = (until: number) => {
      // notes on the beat and off-beats, with the odd double; busier as the song goes on
      const beat = 60 / bpm;
      for (let b = Math.ceil(chartTo / (beat / 2)); b * (beat / 2) < until; b++) {
        const at = b * (beat / 2); if (at < 1) continue;
        const busy = Math.min(0.75, 0.42 + at / 300);
        if (b % 2 === 0 ? r() < busy + 0.2 : r() < busy * 0.55) {
          const lane = Math.floor(r() * 4); notes.push({ lane, at, hit: false, miss: false });
          if (r() < 0.12 + at / 600) notes.push({ lane: (lane + 1 + Math.floor(r() * 3)) % 4, at, hit: false, miss: false });
        }
      }
      chartTo = until;
    };
    chart(endless ? 30 : SONG);
    const flashes = [0, 0, 0, 0];
    const mult = () => (1 + Math.min(3, Math.floor(combo / 10))) * (fever > 0 ? 2 : 1);
    const miss = () => {
      combo = 0; setHud({ combo }); sfx.thud();
      if (endless) { lives--; setHud({ lives }); if (lives <= 0 && !over) { over = true; pops.add('GAME OVER', '#FF3D6E', 50, 40, true); setTimeout(() => onEnd(score), 1300); } }
    };
    const hit = (lane: number) => {
      if (over || songT < 0) return;
      flashes[lane] = 0.15;
      const n = notes.filter((x) => x.lane === lane && !x.hit && !x.miss).sort((a, b) => Math.abs(a.at - songT) - Math.abs(b.at - songT))[0];
      const d = n ? Math.abs(n.at - songT) : 9;
      if (!n || d > 0.15) { pops.add('MISS', '#888', 12 + lane * 25, 70); miss(); return; }
      n.hit = true; combo++;
      const perfect = d < 0.06, pts = (perfect ? 10 : 5) * mult();
      score += pts; beatSound('note', lane); tap(haptics);
      pops.add(perfect ? 'PERFECT' : 'GOOD', perfect ? LANE_COL[lane] : '#fff', 12 + lane * 25, 70);
      if (combo === 30 || (combo > 30 && combo % 50 === 0)) { fever = 8; pops.add('FEVER! ×2', '#FF3D9A', 50, 35, true); sfx.jackpot(); tap(haptics, 'success'); }
      setHud({ score, combo });
      fxBurst(lane);
    };
    let fxBurst = (_l: number) => {};
    const lanesDown = new Map<number, number>();
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        const LW = Math.min(W * 0.22, 90), x0 = (W - LW * 4) / 2, hitY = H * 0.84;
        fxBurst = (l) => fx.burst(x0 + (l + 0.5) * LW, hitY, LANE_COL[l], 16, 180);
        if (!over) {
          songT += dt * (endless ? 1 + Math.floor(Math.max(0, songT) / 30) * 0.08 : 1);
          fever = Math.max(0, fever - dt); setHud({ fever: Math.ceil(fever), left: endless ? 0 : Math.max(0, Math.ceil(SONG - songT)) });
          const beat = 60 / bpm, bi = Math.floor(songT / (beat / 2));
          if (bi !== lastBeat && songT > 0) { lastBeat = bi; beatSound(bi % 2 === 0 ? 'kick' : 'hat'); }
          if (endless && songT + 10 > chartTo) { bpm = Math.min(170, bpm + 4); chart(chartTo + 30); }
          for (const n of notes) if (!n.hit && !n.miss && songT - n.at > 0.16) { n.miss = true; miss(); }
          if (!endless && songT > SONG + 1 && !over) { over = true; pops.add('SONG CLEAR!', '#FFE14D', 50, 40, true); sfx.win(5); setTimeout(() => onEnd(score), 1300); }
        }
        bg(g, W, H, fever > 0 ? '#2A0530' : '#0A0420', '#02010A');
        // lanes running down a neon highway
        for (let l = 0; l < 4; l++) {
          flashes[l] = Math.max(0, flashes[l] - dt);
          g.fillStyle = `rgba(255,255,255,${0.03 + flashes[l] * 2})`; g.fillRect(x0 + l * LW + 2, 0, LW - 4, H);
          g.strokeStyle = LANE_COL[l]; g.globalAlpha = 0.35; g.lineWidth = 1; g.strokeRect(x0 + l * LW + 2, 0, LW - 4, H); g.globalAlpha = 1;
        }
        // beat lines
        const beat = 60 / bpm;
        for (let k = Math.floor(songT / beat); k < songT / beat + FALL / beat + 1; k++) { const y = hitY - ((k * beat - songT) / FALL) * hitY; g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x0, y, LW * 4, 1); }
        // the hit line with its four buttons
        for (let l = 0; l < 4; l++) {
          const held = [...lanesDown.values()].includes(l);
          g.strokeStyle = LANE_COL[l]; g.lineWidth = 3; g.shadowColor = LANE_COL[l]; g.shadowBlur = held || flashes[l] ? 22 : 8;
          g.beginPath(); g.arc(x0 + (l + 0.5) * LW, hitY, LW * 0.32, 0, Math.PI * 2); g.stroke();
          if (held) { g.fillStyle = LANE_COL[l]; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; }
          g.shadowBlur = 0;
        }
        for (const n of notes) {
          if (n.hit || n.at - songT > FALL || songT - n.at > 0.3) continue;
          const y = hitY - ((n.at - songT) / FALL) * hitY, x = x0 + (n.lane + 0.5) * LW;
          g.globalAlpha = n.miss ? 0.3 : 1;
          g.fillStyle = LANE_COL[n.lane]; g.shadowColor = LANE_COL[n.lane]; g.shadowBlur = 14;
          g.beginPath(); g.roundRect(x - LW * 0.36, y - 9, LW * 0.72, 18, 9); g.fill(); g.shadowBlur = 0;
          g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - LW * 0.25, y - 4, LW * 0.5, 3);
          g.globalAlpha = 1;
        }
        if (combo >= 10) { g.font = `900 ${20 + Math.min(16, combo / 5)}px ui-rounded, system-ui`; g.textAlign = 'center'; g.fillStyle = fever > 0 ? '#FF3D9A' : '#FFE14D'; g.fillText(`${combo} COMBO ×${mult()}`, W / 2, H * 0.4); }
        if (songT < 0) { g.font = '900 40px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(String(Math.ceil(-songT)), W / 2, H * 0.45); }
        fx.draw(g, dt);
        void t;
      },
      down: (p) => { const b = cv.current!.getBoundingClientRect(); const LW = Math.min(b.width * 0.22, 90), x0 = (b.width - LW * 4) / 2; const l = clamp(Math.floor((p.x - x0) / LW), 0, 3); lanesDown.set(p.id, l); hit(l); },
      up: (p) => { lanesDown.delete(p.id); },
      key: (k, d) => { const l = ['d', 'f', 'j', 'k'].indexOf(k.toLowerCase()); if (l >= 0 && d) { hit(l); lanesDown.set(-1 - l, l); } if (l >= 0 && !d) lanesDown.delete(-1 - l); },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="rhythm" cv={cv}>
      <Hud score={hud.score} left={hud.fever ? <Led label="FEVER" v={`×2 ${hud.fever}`} c="#FF3D9A" /> : undefined} right={endless ? <Lives n={hud.lives} max={5} /> : <Led label="TIME" v={hud.left} />} />
      <Tip>TAP THE LANES AS THE NOTES HIT THE CIRCLES</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Peg Drop
// ======================================================================================================
const PLINKO_SLOTS = [100, 10, 50, 25, 250, 25, 50, 10, 100];
export function PegDrop({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, chips: 10 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    // board units: x 0..1, y 0..1.3
    const pegs: { x: number; y: number; flash: number }[] = [];
    for (let row = 0; row < 11; row++) { const n = row % 2 ? 8 : 9; for (let i = 0; i < n; i++) pegs.push({ x: (row % 2 ? 0.15 : 0.1) + i * 0.1, y: 0.22 + row * 0.08, flash: 0 }); }
    let goldPeg = Math.floor(r() * pegs.length);
    type Chip = { x: number; y: number; vx: number; vy: number; gold: boolean; done: boolean };
    const chips: Chip[] = [];
    let left = 10, score = 0, aim = 0.5, over = false, idle = 0;
    const PR = 0.012, CR = 0.03;
    const drop = () => {
      if (over || left <= 0 || chips.some((c) => !c.done && c.y < 0.2)) return;
      left--; idle = 0; chips.push({ x: aim + (r() - 0.5) * 0.004, y: 0.1, vx: 0, vy: 0, gold: false, done: false }); sfx.drop(); tap(haptics); setHud({ chips: left });
    };
    let sc = 1, ox = 0, oy = 0;
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        sc = Math.min(W * 0.96, (H - 70) / 1.32); ox = (W - sc) / 2; oy = Math.max(34, (H - 1.32 * sc) / 2);
        if (!over) {
          const SUB = 4, sd = dt / SUB;
          for (let s = 0; s < SUB; s++) for (const c of chips) {
            if (c.done) continue;
            c.vy += 1.6 * sd; c.x += c.vx * sd; c.y += c.vy * sd; c.vx *= 0.999;
            if (c.x < CR) { c.x = CR; c.vx = Math.abs(c.vx) * 0.5; } if (c.x > 1 - CR) { c.x = 1 - CR; c.vx = -Math.abs(c.vx) * 0.5; }
            pegs.forEach((p, i) => {
              const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy);
              if (d < PR + CR && d > 0) {
                const nx = dx / d, ny = dy / d; c.x = p.x + nx * (PR + CR); c.y = p.y + ny * (PR + CR);
                const rv = c.vx * nx + c.vy * ny; if (rv < 0) { c.vx -= 1.45 * rv * nx; c.vy -= 1.45 * rv * ny; }
                c.vx += (r() - 0.5) * 0.06; if (Math.abs(c.vx) < 0.03) c.vx += (r() < 0.5 ? -1 : 1) * 0.05;
                if (p.flash <= 0) { sfx.tick(); p.flash = 0.15; }
                if (i === goldPeg && !c.gold) { c.gold = true; pops.add('GOLD PEG ×2!', '#FFD84D', 50, 30, true); sfx.win(4); goldPeg = Math.floor(r() * pegs.length); }
              }
            });
            // slot dividers
            if (c.y > 1.12) { const k = Math.round(c.x * 9); const wx = k / 9; if (Math.abs(c.x - wx) < CR && k > 0 && k < 9) { c.x = wx + Math.sign(c.x - wx || 1) * CR; c.vx = -c.vx * 0.4; } }
            if (c.y > 1.25) {
              c.done = true; const slot = clamp(Math.floor(c.x * 9), 0, 8), base = PLINKO_SLOTS[slot], pts = base * (c.gold ? 2 : 1);
              score += pts; setHud({ score });
              const big = base >= 100;
              pops.add(`${c.gold ? '★ ' : ''}+${pts}`, big ? '#FFE14D' : '#fff', 6 + slot * 11, 82, big || c.gold);
              fx.burst(ox + (slot + 0.5) / 9 * sc, oy + 1.25 * sc, big ? RAINBOW : '#22E3FF', big ? 40 : 10, big ? 260 : 120);
              if (big) { sfx.jackpot(); tap(haptics, 'success'); } else sfx.win(2);
              if (endless && base >= 100) { left++; setHud({ chips: left }); pops.add('+1 CHIP', '#3DDC97', 6 + slot * 11, 70); }
            }
          }
          if (left <= 0 && chips.every((c) => c.done)) { idle += dt; if (idle > 0.8) { over = true; setTimeout(() => onEnd(score), 1000); } }
        }
        bg(g, W, H, '#140A33', '#05020F');
        g.save(); g.translate(ox, oy); g.scale(sc, sc);
        // the aim marker
        if (!over && left > 0) { g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(aim - 0.002, 0.04, 0.004, 0.14); glowCircle(g, aim, 0.1, CR, '#FFE14D', 12); }
        pegs.forEach((p, i) => { p.flash = Math.max(0, p.flash - dt); const gold = i === goldPeg; glowCircle(g, p.x, p.y, PR * (gold ? 1.6 + Math.sin(t * 8) * 0.3 : 1), gold ? '#FFD84D' : p.flash > 0 ? '#FFFFFF' : '#B57BFF', gold ? 14 : 6); });
        // slots
        for (let k = 0; k < 9; k++) {
          const v = PLINKO_SLOTS[k], c = v >= 250 ? '#FF3D9A' : v >= 100 ? '#FFE14D' : v >= 50 ? '#22E3FF' : '#3DDC97';
          g.fillStyle = c; g.globalAlpha = 0.22; g.fillRect(k / 9 + 0.004, 1.13, 1 / 9 - 0.008, 0.15); g.globalAlpha = 1;
          g.fillStyle = '#fff'; g.fillRect(k / 9 - 0.002, 1.12, 0.004, 0.16);
        }
        g.restore();
        // slot values, drawn at screen size so the text stays crisp
        g.font = `900 ${Math.round(sc * 0.04)}px ui-rounded, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let k = 0; k < 9; k++) { const v = PLINKO_SLOTS[k]; g.fillStyle = v >= 250 ? '#FF3D9A' : v >= 100 ? '#FFE14D' : v >= 50 ? '#22E3FF' : '#3DDC97'; g.fillText(String(v), ox + ((k + 0.5) / 9) * sc, oy + 1.21 * sc); }
        g.save(); g.translate(ox, oy); g.scale(sc, sc);
        for (const c of chips) if (!c.done) { const gr = g.createRadialGradient(c.x - CR * 0.3, c.y - CR * 0.3, CR * 0.1, c.x, c.y, CR); gr.addColorStop(0, '#fff'); gr.addColorStop(1, c.gold ? '#E0A800' : '#FF3D9A'); g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, CR, 0, Math.PI * 2); g.fill(); }
        g.restore();
        fx.draw(g, dt);
      },
      down: (p) => { aim = clamp((p.x - ox) / sc, 0.05, 0.95); },
      move: (p) => { aim = clamp((p.x - ox) / sc, 0.05, 0.95); },
      up: () => drop(),
      key: (k, d) => { if (!d) return; if (k === 'ArrowLeft') aim = clamp(aim - 0.03, 0.05, 0.95); if (k === 'ArrowRight') aim = clamp(aim + 0.03, 0.05, 0.95); if (k === ' ' || k === 'Enter') drop(); },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="plinko" cv={cv}>
      <Hud score={hud.score} right={<Led label="CHIPS" v={hud.chips} c="#FF3D9A" />} />
      <Tip>DRAG TO AIM · LET GO TO DROP{endless ? ' · 100+ slots give a chip back' : ''}</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Neon Racer
// ======================================================================================================
export function NeonRacer({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, left: 60, nitro: 0 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    let lane = 1, lx = 1, speed = 0.5, dist = 0, score = 0, lives = 3, over = false, timeLeft = 60, nitro = 0, inv = 0, spawnT = 1, shake = 0, scoreF = 0;
    type Thing = { lane: number; z: number; kind: 'car' | 'orb' | 'nitro'; col: string };
    const things: Thing[] = [];
    const crash = () => {
      shake = 0.5; inv = 1.6; sfx.fail(); tap(haptics, 'heavy'); speed *= 0.55;
      if (endless) { lives--; setHud({ lives }); if (lives <= 0) { over = true; pops.add('WRECKED!', '#FF3D6E', 50, 40, true); setTimeout(() => onEnd(score), 1400); } }
      else { timeLeft -= 3; pops.add('CRASH −3s', '#FF3D6E', 50, 45, true); }
    };
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        if (!over) {
          speed = Math.min(endless ? 2.4 : 1.9, speed + dt * 0.03 * (nitro > 0 ? 3 : 1));
          const v = speed * (nitro > 0 ? 1.5 : 1);
          dist += v * dt; scoreF += v * dt * 12 * (nitro > 0 ? 2 : 1);
          if (Math.floor(scoreF) > score) { score = Math.floor(scoreF); setHud({ score }); }
          lx += (lane - lx) * Math.min(1, dt * 14);
          nitro = Math.max(0, nitro - dt); inv = Math.max(0, inv - dt); setHud({ nitro: Math.ceil(nitro) });
          if (!endless) { timeLeft -= dt; setHud({ left: Math.max(0, Math.ceil(timeLeft)) }); if (timeLeft <= 0) { over = true; pops.add('FINISH!', '#FFE14D', 50, 40, true); sfx.win(5); setTimeout(() => onEnd(score), 1300); } }
          spawnT -= dt * v;
          if (spawnT <= 0) {
            spawnT = 0.5 + r() * 0.5;
            const blocked = Math.floor(r() * 3), roll = r();
            things.push({ lane: blocked, z: 1, kind: 'car', col: ['#FF3D6E', '#22E3FF', '#B57BFF', '#FFB13D'][Math.floor(r() * 4)] });
            if (r() < 0.35) things.push({ lane: (blocked + 1 + Math.floor(r() * 2)) % 3, z: 1, kind: 'car', col: '#FF3D9A' });
            if (roll < 0.45) things.push({ lane: (blocked + 1) % 3, z: 1.15, kind: roll < 0.06 ? 'nitro' : 'orb', col: '#FFE14D' });
          }
          for (let i = things.length - 1; i >= 0; i--) {
            const th = things[i]; th.z -= v * dt * 0.9;
            if (th.z < 0.06 && th.z > -0.02 && Math.abs(th.lane - lx) < 0.5) {
              if (th.kind === 'car') { if (!inv && !nitro) { things.splice(i, 1); crash(); continue; } else if (nitro) { score += 20; scoreF += 20; fx.burst(W / 2, H * 0.8, th.col, 20, 200); sfx.bonk(); things.splice(i, 1); continue; } }
              else if (th.kind === 'orb') { scoreF += 25; sfx.coin(); pops.add('+25', '#FFE14D', 30 + th.lane * 20, 70); things.splice(i, 1); continue; }
              else { nitro = 5; pops.add('NITRO! ×2', '#22E3FF', 50, 40, true); sfx.jackpot(); tap(haptics, 'success'); things.splice(i, 1); continue; }
            }
            if (th.z < -0.1) things.splice(i, 1);
          }
        }
        // draw: a neon road into the distance
        shake = Math.max(0, shake - dt);
        g.save(); if (shake) g.translate((Math.random() - 0.5) * shake * 18, 0);
        bg(g, W, H, '#1A0533', '#05020F');
        const hy = H * 0.3, cx = W / 2;
        // a synthwave sun and mountains
        const sg = g.createLinearGradient(0, hy - 90, 0, hy); sg.addColorStop(0, '#FFE14D'); sg.addColorStop(1, '#FF3D9A');
        g.fillStyle = sg; g.beginPath(); g.arc(cx, hy, Math.min(W, H) * 0.18, Math.PI, 0); g.fill();
        g.fillStyle = '#1A0533'; for (let i = 0; i < 5; i++) g.fillRect(cx - W * 0.2, hy - 8 - i * 9, W * 0.4, 2 + i * 0.6);
        g.fillStyle = '#2A0F55'; g.beginPath(); g.moveTo(0, hy); for (let i = 0; i <= 10; i++) g.lineTo((i / 10) * W, hy - 18 - Math.abs(Math.sin(i * 1.7)) * 30); g.lineTo(W, hy); g.fill();
        g.fillStyle = '#0B0322'; g.fillRect(0, hy, W, H - hy);
        const proj = (laneX: number, z: number) => { const k = 1 / (z * 3.2 + 0.35); return { x: cx + (laneX - 1) * W * 0.22 * k * 0.35, y: hy + (H - hy) * (k - 0.27) / 2.6, s: k }; };
        // road edges and grid lines scrolling toward you
        g.strokeStyle = '#FF3D9A'; g.lineWidth = 2; g.shadowColor = '#FF3D9A'; g.shadowBlur = 10;
        for (const e of [-0.5, 2.5]) { const a = proj(e, 1.4), b = proj(e, -0.05); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        g.shadowBlur = 0; g.strokeStyle = 'rgba(34,227,255,0.5)'; g.lineWidth = 1;
        for (const e of [0.5, 1.5]) { const a = proj(e, 1.4), b = proj(e, -0.05); g.setLineDash([10, 14]); g.lineDashOffset = -dist * 120; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        g.setLineDash([]);
        for (let k = 0; k < 12; k++) { const z = ((k / 12 - dist * 0.8) % 1 + 1) % 1 * 1.4; const a = proj(-0.5, z), b = proj(2.5, z); g.strokeStyle = `rgba(139,92,255,${0.4 * (1 - z / 1.4)})`; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        // things on the road, far to near
        for (const th of [...things].sort((a, b) => b.z - a.z)) {
          const p = proj(th.lane, th.z); if (th.z > 1.3) continue;
          const sz = W * 0.07 * p.s * 0.6;
          if (th.kind === 'car') { g.fillStyle = th.col; g.shadowColor = th.col; g.shadowBlur = 10; g.beginPath(); g.roundRect(p.x - sz, p.y - sz * 1.2, sz * 2, sz * 1.4, sz * 0.3); g.fill(); g.fillStyle = '#FF2020'; g.fillRect(p.x - sz * 0.9, p.y - sz * 0.05, sz * 0.4, sz * 0.15); g.fillRect(p.x + sz * 0.5, p.y - sz * 0.05, sz * 0.4, sz * 0.15); g.shadowBlur = 0; }
          else { glowCircle(g, p.x, p.y - sz * 0.6, sz * 0.5, th.kind === 'nitro' ? '#22E3FF' : '#FFE14D', 16); if (th.kind === 'nitro') { g.font = `${sz}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⚡', p.x, p.y - sz * 0.6); } }
        }
        // your car
        const me = proj(lx, 0.02), sz = W * 0.07 * me.s * 0.6;
        if (!inv || Math.floor(t * 14) % 2) {
          g.fillStyle = nitro ? '#22E3FF' : '#3DDC97'; g.shadowColor = g.fillStyle; g.shadowBlur = 18;
          g.beginPath(); g.moveTo(me.x, me.y - sz * 1.6); g.lineTo(me.x + sz, me.y); g.lineTo(me.x - sz, me.y); g.closePath(); g.fill(); g.shadowBlur = 0;
          if (nitro) { g.fillStyle = '#FFB13D'; g.fillRect(me.x - sz * 0.3, me.y, sz * 0.6, 6 + Math.random() * 14); }
        }
        g.restore();
        fx.draw(g, dt);
      },
      down: (p) => { const W = cv.current!.getBoundingClientRect().width; lane = clamp(lane + (p.x < W / 2 ? -1 : 1), 0, 2); sfx.blip(2); },
      key: (k, d) => { if (!d) return; if (k === 'ArrowLeft' || k === 'a') lane = Math.max(0, lane - 1); if (k === 'ArrowRight' || k === 'd') lane = Math.min(2, lane + 1); },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="racer" cv={cv}>
      <Hud score={hud.score} left={hud.nitro ? <Led label="NITRO" v={`×2 ${hud.nitro}`} c="#22E3FF" /> : undefined} right={endless ? <Lives n={hud.lives} max={3} /> : <Led label="TIME" v={hud.left} />} />
      <Tip>TAP LEFT / RIGHT TO CHANGE LANE · grab orbs and ⚡ nitro</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Fruit Slash
// ======================================================================================================
const FRUITS = ['🍉', '🍊', '🍎', '🍋', '🍇', '🥝', '🍑', '🍍', '🥥'];
export function FruitSlash({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, left: 60, frenzy: 0 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    type F = { x: number; y: number; vx: number; vy: number; e: string; bomb: boolean; gold: boolean; rot: number; vr: number; cut: boolean; halves?: { dx: number; dy: number; a: number } };
    const fs: F[] = [];
    const trail: { x: number; y: number; t: number }[] = [];
    let W = 0, H = 0, score = 0, lives = 3, timeLeft = 60, over = false, wave = 0.8, frenzy = 0, T = 0, swipeCuts = 0, down = false, last: Ptr | null = null;
    const R = () => Math.min(W, H) * 0.075;
    const toss = () => {
      const n = frenzy > 0 ? 3 : 1 + Math.floor(r() * (2 + Math.min(3, T / 20)));
      for (let i = 0; i < n; i++) {
        const bomb = frenzy <= 0 && r() < Math.min(0.28, 0.1 + T / 200), gold = !bomb && r() < 0.04;
        fs.push({ x: W * (0.15 + r() * 0.7), y: H + R(), vx: (r() - 0.5) * W * 0.4, vy: -H * (1.05 + r() * 0.3), e: bomb ? '💣' : gold ? '🌟' : FRUITS[Math.floor(r() * FRUITS.length)], bomb, gold, rot: 0, vr: (r() - 0.5) * 6, cut: false });
      }
      sfx.swish();
    };
    const lose = (why: string) => {
      if (!endless || over) return;
      lives--; setHud({ lives }); pops.add(why, '#FF3D6E', 50, 50, true);
      if (lives <= 0) { over = true; setTimeout(() => onEnd(score), 1300); }
    };
    const slice = (a: Ptr, b: Ptr) => {
      for (const f of fs) {
        if (f.cut) continue;
        // does the swipe segment pass through the fruit?
        const ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey || 1, k = clamp(((f.x - a.x) * ex + (f.y - a.y) * ey) / l2, 0, 1);
        if (Math.hypot(a.x + ex * k - f.x, a.y + ey * k - f.y) > R()) continue;
        f.cut = true; f.halves = { dx: 0, dy: 0, a: Math.atan2(ey, ex) };
        if (f.bomb) {
          sfx.fail(); tap(haptics, 'heavy'); fx.burst(f.x, f.y, ['#FF3D3D', '#FFB13D', '#333'], 40, 300);
          if (endless) lose('BOOM! −1 LIFE'); else { score = Math.max(0, score - 30); timeLeft -= 2; setHud({ score }); pops.add('BOOM! −30', '#FF3D6E', 50, 45, true); }
          continue;
        }
        swipeCuts++;
        const pts = (f.gold ? 50 : 10) * (frenzy > 0 ? 2 : 1); score += pts; setHud({ score });
        sfx.cut(); tap(haptics);
        fx.burst(f.x, f.y, f.gold ? '#FFD84D' : ['#FF3D6E', '#FFB13D', '#B6FF3D', '#FFE14D'][Math.floor(r() * 4)], 18, 200);
        if (f.gold) { frenzy = 4; pops.add('FRENZY! ×2', '#FFD84D', 50, 30, true); sfx.jackpot(); tap(haptics, 'success'); }
        if (swipeCuts >= 3) { const bonus = swipeCuts * 10; score += bonus; setHud({ score }); pops.add(`${swipeCuts}× COMBO +${bonus}`, '#22E3FF', 50, 38, true); sfx.win(swipeCuts); }
      }
    };
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        W = w; H = h; T += dt;
        if (!over) {
          frenzy = Math.max(0, frenzy - dt); setHud({ frenzy: Math.ceil(frenzy) });
          wave -= dt; if (wave <= 0) { toss(); wave = frenzy > 0 ? 0.35 : Math.max(0.55, 1.3 - T / 80); }
          if (!endless) { timeLeft -= dt; setHud({ left: Math.max(0, Math.ceil(timeLeft)) }); if (timeLeft <= 0) { over = true; pops.add('TIME!', '#FFE14D', 50, 40, true); setTimeout(() => onEnd(score), 1300); } }
        }
        for (let i = fs.length - 1; i >= 0; i--) {
          const f = fs[i]; f.vy += H * 1.25 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
          if (f.halves) { f.halves.dx += W * 0.25 * dt; }
          if (f.y > H + R() * 2 && f.vy > 0) { if (!f.cut && !f.bomb && !over) { lose('DROPPED! −1'); } fs.splice(i, 1); }
        }
        // draw: a wooden dojo board
        bg(g, W, H, '#3A2312', '#1E1008');
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 10, H); g.stroke(); }
        if (frenzy > 0) { g.fillStyle = `rgba(255,216,77,${0.08 + Math.sin(t * 10) * 0.04})`; g.fillRect(0, 0, W, H); }
        const size = R() * 2;
        g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const f of fs) {
          if (!f.cut) { g.save(); g.translate(f.x, f.y); g.rotate(f.rot); if (f.gold) { g.shadowColor = '#FFD84D'; g.shadowBlur = 20; } g.fillText(f.e, 0, 0); g.restore(); continue; }
          if (f.bomb) continue;
          // two halves sliding apart along the cut
          for (const s of [-1, 1]) {
            g.save(); g.translate(f.x + Math.cos(f.halves!.a + Math.PI / 2) * f.halves!.dx * s, f.y + Math.sin(f.halves!.a + Math.PI / 2) * f.halves!.dx * s); g.rotate(f.halves!.a);
            g.beginPath(); g.rect(-size, s < 0 ? -size : 0, size * 2, size); g.clip();
            g.rotate(f.rot - f.halves!.a); g.fillText(f.e, 0, 0); g.restore();
          }
        }
        // the blade trail
        const now = performance.now();
        while (trail.length && now - trail[0].t > 160) trail.shift();
        if (trail.length > 1) {
          g.lineCap = 'round'; g.lineJoin = 'round';
          for (let i = 1; i < trail.length; i++) { const k = i / trail.length; g.strokeStyle = `rgba(255,255,255,${k})`; g.lineWidth = 2 + k * 7; g.shadowColor = '#22E3FF'; g.shadowBlur = 12; g.beginPath(); g.moveTo(trail[i - 1].x, trail[i - 1].y); g.lineTo(trail[i].x, trail[i].y); g.stroke(); }
          g.shadowBlur = 0;
        }
        fx.draw(g, dt, 500);
      },
      down: (p) => { down = true; last = p; swipeCuts = 0; trail.length = 0; trail.push({ x: p.x, y: p.y, t: performance.now() }); },
      move: (p) => { if (!down || !last) return; if (Math.hypot(p.x - last.x, p.y - last.y) > 3) { slice(last, p); trail.push({ x: p.x, y: p.y, t: performance.now() }); last = p; } },
      up: () => { down = false; last = null; swipeCuts = 0; },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="fruit" cv={cv}>
      <Hud score={hud.score} left={hud.frenzy ? <Led label="FRENZY" v={`×2 ${hud.frenzy}`} c="#FFD84D" /> : undefined} right={endless ? <Lives n={hud.lives} max={3} /> : <Led label="TIME" v={hud.left} />} />
      <Tip>SWIPE THROUGH THE FRUIT · never the 💣</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Neon Snake
// ======================================================================================================
export function NeonSnake({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, len: 4, left: 90 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    const GW = 16, GH = 22;
    let snake: [number, number][] = [[8, 14], [8, 15], [8, 16], [8, 17]], dir = 0, queue: number[] = [], acc = 0, rate = 7, score = 0, over = false, timeLeft = 90, eatenN = 0, wait = 0.8;
    let food: [number, number] = [8, 6], gold: { x: number; y: number; t: number } | null = null;
    const free = (): [number, number] => { for (let k = 0; k < 200; k++) { const p: [number, number] = [Math.floor(r() * GW), Math.floor(r() * GH)]; if (!snake.some(([x, y]) => x === p[0] && y === p[1]) && !(food[0] === p[0] && food[1] === p[1])) return p; } return [0, 0]; };
    const die = () => { over = true; sfx.fail(); tap(haptics, 'heavy'); pops.add('CRASH!', '#FF3D6E', 50, 40, true); setTimeout(() => onEnd(score), 1300); };
    const tick = (ox: number, oy: number, cs: number) => {
      if (queue.length) { const d = queue.shift()!; if ((d + 2) % 4 !== dir) dir = d; }
      let [hx, hy] = snake[0]; hx += DIRS[dir][0]; hy += DIRS[dir][1];
      // Classic has walls; in Endless the edges wrap round
      if (endless) { hx = (hx + GW) % GW; hy = (hy + GH) % GH; }
      else if (hx < 0 || hy < 0 || hx >= GW || hy >= GH) return die();
      if (snake.slice(0, -1).some(([x, y]) => x === hx && y === hy)) return die();
      snake.unshift([hx, hy]);
      if (hx === food[0] && hy === food[1]) {
        eatenN++; score += 10; rate = Math.min(16, rate + 0.25); setHud({ score, len: snake.length }); sfx.blip(4 + (eatenN % 8)); tap(haptics);
        fx.burst(ox + (hx + 0.5) * cs, oy + (hy + 0.5) * cs, '#B6FF3D', 12, 120);
        food = free();
        if (eatenN % 5 === 0) { const p = free(); gold = { x: p[0], y: p[1], t: 6 }; }
      } else snake.pop();
      if (gold && hx === gold.x && hy === gold.y) {
        score += 50; setHud({ score }); pops.add('GOLDEN APPLE +50', '#FFD84D', 50, 40, true); sfx.jackpot(); tap(haptics, 'success');
        fx.burst(ox + (hx + 0.5) * cs, oy + (hy + 0.5) * cs, RAINBOW, 30, 200);
        for (let k = 0; k < 3 && snake.length > 4; k++) snake.pop(); // and your tail shrinks
        gold = null; setHud({ len: snake.length });
      }
    };
    const sw = swipe((d) => { if (queue.length < 3) queue.push(d); });
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        const cs = Math.floor(Math.min(W / GW, (H - 40) / GH)), ox = (W - cs * GW) / 2, oy = 32;
        if (!over) {
          if (wait > 0) wait -= dt;
          else {
            acc += dt * rate; while (acc >= 1 && !over) { acc -= 1; tick(ox, oy, cs); }
            if (gold) { gold.t -= dt; if (gold.t <= 0) gold = null; }
            if (!endless) { timeLeft -= dt; setHud({ left: Math.max(0, Math.ceil(timeLeft)) }); if (timeLeft <= 0 && !over) { over = true; pops.add('TIME!', '#FFE14D', 50, 40, true); sfx.win(4); setTimeout(() => onEnd(score), 1200); } }
          }
        }
        bg(g, W, H, '#020A08', '#000');
        g.fillStyle = '#04140F'; g.fillRect(ox, oy, cs * GW, cs * GH);
        g.strokeStyle = 'rgba(61,220,151,0.07)'; g.lineWidth = 1; g.beginPath();
        for (let x = 0; x <= GW; x++) { g.moveTo(ox + x * cs, oy); g.lineTo(ox + x * cs, oy + GH * cs); }
        for (let y = 0; y <= GH; y++) { g.moveTo(ox, oy + y * cs); g.lineTo(ox + GW * cs, oy + y * cs); }
        g.stroke();
        g.strokeStyle = endless ? 'rgba(34,227,255,0.5)' : '#3DDC97'; g.lineWidth = 2; g.setLineDash(endless ? [6, 6] : []); g.strokeRect(ox, oy, cs * GW, cs * GH); g.setLineDash([]);
        glowCircle(g, ox + (food[0] + 0.5) * cs, oy + (food[1] + 0.5) * cs, cs * (0.32 + (reduce ? 0 : Math.sin(t * 8) * 0.05)), '#FF3D9A', 14);
        if (gold) { g.font = `${cs * 0.95}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#FFD84D'; g.shadowBlur = 16; g.globalAlpha = gold.t < 2 && Math.sin(t * 20) > 0 ? 0.4 : 1; g.fillText('🍏', ox + (gold.x + 0.5) * cs, oy + (gold.y + 0.5) * cs); g.shadowBlur = 0; g.globalAlpha = 1; }
        snake.forEach(([x, y], i) => {
          const k = 1 - i / snake.length, c = `hsl(${(140 + i * 6 + t * 40) % 360} 90% ${45 + k * 20}%)`;
          g.fillStyle = c; g.shadowColor = c; g.shadowBlur = i === 0 ? 16 : 6;
          const pad = i === 0 ? 1 : 2; g.beginPath(); g.roundRect(ox + x * cs + pad, oy + y * cs + pad, cs - pad * 2, cs - pad * 2, cs * 0.3); g.fill();
        });
        g.shadowBlur = 0;
        const [hx, hy] = snake[0]; g.fillStyle = '#000'; for (const s of [-1, 1]) { const ex = ox + (hx + 0.5) * cs + (DIRS[dir][1] * s * 0.22 + DIRS[dir][0] * 0.15) * cs, ey = oy + (hy + 0.5) * cs + (DIRS[dir][0] * s * 0.22 + DIRS[dir][1] * 0.15) * cs; g.beginPath(); g.arc(ex, ey, cs * 0.09, 0, Math.PI * 2); g.fill(); }
        fx.draw(g, dt, 0);
        if (wait > 0 && !over) { g.font = '900 24px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillStyle = '#B6FF3D'; g.fillText('GO!', W / 2, H * 0.4); }
      },
      ...sw,
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="snake" cv={cv}>
      <Hud score={hud.score} left={<Led label="LENGTH" v={hud.len} />} right={endless ? <Led label="WALLS" v="WRAP" c="#22E3FF" /> : <Led label="TIME" v={hud.left} />} />
      <Tip>SWIPE TO STEER · eat, grow, don’t bite yourself</Tip>
      {pops.el}
    </Screen>
  );
}

export const ARENAS2: Record<string, (p: ArenaProps) => React.ReactElement> = {
  airhockey: AirHockey, pinball: Pinball, pusher: CoinPusher, maze: InkMaze, blaster: SpaceBlaster,
  rhythm: RhythmRush, plinko: PegDrop, racer: NeonRacer, fruit: FruitSlash, snake: NeonSnake,
};
export const HOW2: Record<string, string> = {
  airhockey: 'Drag your mallet to smash the puck into the CPU’s goal. First to 7 wins.',
  pinball: 'Tap the left or right side to flip. Bumpers, slingshots and targets all score. Three balls.',
  pusher: 'Tap to drop a coin in front of the pusher. Coins shoved off the front ledge score. 30 coins.',
  maze: 'Swipe your ink blob round the maze and slurp up every paint drop. Dodge the smudges — or grab a paint bucket and wash them away! Three lives.',
  blaster: 'Drag to steer your ship; it fires by itself. Clear five waves of neon drones. Three lives.',
  rhythm: 'Tap each lane as its note hits the circle. Perfect timing scores double, and combos multiply.',
  plinko: 'Drag to aim, let go to drop. Chips bounce down the pegs into the slots. Ten chips.',
  racer: 'Tap left or right to change lanes. Dodge the traffic and grab the orbs. 60 seconds.',
  fruit: 'Swipe through the fruit as it flies up — but never the bombs. 60 seconds.',
  snake: 'Swipe to steer. Eat to grow (and speed up) — don’t hit the walls or yourself. 90 seconds.',
};
export const BONUS2: Record<string, string> = {
  airhockey: '🥇 Every 3rd puck is GOLD — a goal with it is worth 300!',
  pinball: '🎯 Light all three targets for MULTIBALL: two more balls, bumpers pay double.',
  pusher: '🪙 Every 10th coin is GOLD — push it off for a COIN SHOWER. 💎 gems are worth 50.',
  maze: '🖌️ Palettes pop up as you eat — every other one is a GOLDEN BRUSH worth 500.',
  blaster: '💎 Hit the spinning PRISM DRONE for 150. Catch 🔱 for TRIPLE SHOT.',
  rhythm: '🔥 Hit a 30 combo for FEVER: double points for 8 seconds.',
  plinko: '✨ Bounce off the glowing GOLD PEG and that chip pays double.',
  racer: '⚡ Grab NITRO: double points, extra speed and you smash straight through traffic.',
  fruit: '🌟 Slice a golden star for a fruit FRENZY at double points. 3+ in one swipe is a COMBO.',
  snake: '🍏 Golden apples are worth 50 and shrink your tail by three.',
};
export const ENDLESS2: Record<string, string> = {
  airhockey: 'No score limit — every CPU goal costs a life, and the CPU gets faster each time you score.',
  pinball: 'Earn an extra ball every 1,500 points and keep going.',
  pusher: 'Every coin you win drops back into your tray — keep pushing until you run dry.',
  maze: 'Clear a maze and the next one starts, with faster smudges (and a fourth one).',
  blaster: 'Wave after wave, faster and tougher, until you’re out of lives.',
  rhythm: 'The song never ends — it speeds up every 30 seconds. Five misses and you’re out.',
  plinko: 'Land in a 100 or 250 slot and you get the chip back.',
  racer: 'No clock — race until you’ve crashed three times. It keeps getting faster.',
  fruit: 'No clock — drop a fruit or hit a bomb and you lose a life.',
  snake: 'No clock and no walls — the edges wrap round. Grow as long as you can.',
};
