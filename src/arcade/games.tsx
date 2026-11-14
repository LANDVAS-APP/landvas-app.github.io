// The arcade cabinets. All free to play and won by skill and timing:
//  Ink Tower (3D)      a block slides back and forth; drop it on the tower. Whatever hangs over is sliced off, so
//                      the next block is smaller. Perfect drops keep it whole (and grow it back). Prize lines at
//                      10 (SILVER), 20 (GOLD) and 30 (PRISM)
//  Prism Ring (2D)     a light races round a ring of bulbs; stop it on the JACKPOT. Seven spins, each faster
//  Ring Roll (3D)      flick the ball up the lane: how hard decides how high it lands, the angle where. Rings
//                      score 10-50, the corner pockets 100. Nine balls
//  Hoop Shot (3D)      flick basketballs at the hoop, as fast as you like, for 40 seconds. Three in a row and
//                      you're ON FIRE (double points); after 20 seconds the hoop starts moving
//  Bop-a-Bot (3D)      bop the robots popping out of their holes; golden ones are worth 5; leave the kittens alone
//  Claw Crane (3D)     hold → to slide the claw across, then ↑ to send it back; let go and it drops. Line it up
//                      right over a prize to grab it. Five goes
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { framePacer, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { MIR, mirDX, mirDY, unflipText } from './mirror/mir';
import { buzz } from '../native/native';
import { sfx } from './sfx';
import { config } from '../env';

export type ArenaProps = { seed: number; level: number; onEnd(score: number): void; haptics?: boolean; reduce?: boolean;
  /** classic: the usual round (scores capped); endless: keep going until you run out of lives */ mode?: 'classic' | 'endless' };
export const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---- shared bits ---------------------------------------------------------------------------------------------
type Pop = { id: number; text: string; color: string; x: number; y: number; big?: boolean };
let popId = 0;
export function usePops() {
  const [pops, setPops] = useState<Pop[]>([]);
  const add = (text: string, color = '#fff', x = 50, y = 40, big = false) => {
    const id = ++popId; if (MIR.x) x = 100 - x; if (MIR.y) y = 100 - y; setPops((p) => [...p.slice(-6), { id, text, color, x, y, big }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), big ? 1400 : 900);
  };
  const el = (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pops.map((p) => (
        <div key={p.id} className={p.big ? 'lv-arc-pop-big' : 'lv-arc-pop'} style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}>{p.text}</div>
      ))}
    </div>
  );
  return { add, el };
}
/** Every game's score display reports here, so a multiplayer match can stream live scores for any game. */
const scoreListeners = new Set<(n: number) => void>();
export const scoreBus = { on(f: (n: number) => void) { scoreListeners.add(f); return () => { scoreListeners.delete(f); }; } };
export function Hud({ score, left, right }: { score: number; left?: React.ReactNode; right?: React.ReactNode }) {
  useEffect(() => { for (const f of scoreListeners) f(score); }, [score]);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2.5 font-mono text-white">
      <div className="lv-arc-led" data-testid="arc-score"><span className="text-[9px] opacity-70">SCORE</span><b>{String(score).padStart(4, '0')}</b></div>
      {left}
      {right}
    </div>
  );
}
/** Lives left in endless mode. */
export function Lives({ n, max }: { n: number; max: number }) {
  return <div className="lv-arc-led" data-testid="arc-lives"><span className="text-[9px] opacity-70">LIVES</span><b className="tracking-tighter">{Array.from({ length: max }, (_, i) => (i < n ? '❤' : '·')).join('')}</b></div>;
}
function three(canvas: HTMLCanvasElement, bg: string, fov = 50) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: sceneAntialias() });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 200);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const resize = () => { const r = canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  return { renderer, scene, camera, T, dispose: () => { ro.disconnect(); for (const x of bag) x.dispose(); renderer.dispose(); } };
}
export const tap = (h?: boolean, k: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light') => { if (h) buzz(k); };
function emojiTex(e: string) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.font = '100px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** A burst of glowing confetti in a 3D scene. */
function burster(scene: THREE.Scene, T: <X extends { dispose(): void }>(x: X) => X) {
  const geo = T(new THREE.BoxGeometry(0.08, 0.08, 0.02));
  const parts: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  const mats = ['#FF3D9A', '#22E3FF', '#FFE14D', '#3DDC97', '#B57BFF'].map((c) => T(new THREE.MeshBasicMaterial({ color: c })));
  return {
    burst(at: THREE.Vector3, n = 24, power = 4) {
      for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, mats[i % mats.length]); m.position.copy(at); scene.add(m); parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power, (Math.random() - 0.5) * power), life: 1.2 }); }
    },
    step(dt: number) {
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6; if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
    },
  };
}

// ======================================================================================================
// Ink Tower
// ======================================================================================================
export function TowerStacker({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, level: 0, combo: 0, size: 100 });
  const press = useRef<() => void>(() => {});
  const pops = usePops();
  useEffect(() => {
    const { renderer, scene, camera, T, dispose } = three(cv.current!, '#0A0620', 42);
    scene.fog = new THREE.Fog('#0A0620', 20, 60);
    scene.add(new THREE.HemisphereLight('#B9A8FF', '#1A1030', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(6, 12, 8); scene.add(sun);
    const fx = burster(scene, T);
    const H = 0.5, START = 3;
    const geo = T(new THREE.BoxGeometry(1, 1, 1));
    const goldMat = T(new THREE.MeshStandardMaterial({ color: '#FFD84D', metalness: 0.7, roughness: 0.2, emissive: '#7A5A00', emissiveIntensity: 0.6 }));
    const GOLD = 7; // every 7th block is gold: land it perfectly for a bonus
    const mat = (lv: number) => lv > 0 && lv % GOLD === 0 ? goldMat : T(new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((lv * 0.045) + seed % 100 / 100) % 1, 0.8, 0.58), roughness: 0.35, emissive: new THREE.Color().setHSL(((lv * 0.045) + seed % 100 / 100) % 1, 0.9, 0.2) }));
    const block = (w: number, d: number, x: number, y: number, z: number, lv: number) => { const m = new THREE.Mesh(geo, mat(lv)); m.scale.set(w, H, d); m.position.set(x, y, z); scene.add(m); return m; };
    // pedestal and prize lines
    const ped = new THREE.Mesh(T(new THREE.BoxGeometry(START + 0.6, 4, START + 0.6)), T(new THREE.MeshStandardMaterial({ color: '#1C1640', roughness: 0.5 }))); ped.position.y = -2 - H / 2; scene.add(ped);
    const LINES = [{ lv: 10, name: 'SILVER', bonus: 25, c: '#C9D3E6' }, { lv: 20, name: 'GOLD', bonus: 60, c: '#FFE14D' }, { lv: 30, name: 'PRISM', bonus: 150, c: '#FF3D9A' }];
    for (const L of LINES) {
      const frame = new THREE.LineSegments(T(new THREE.EdgesGeometry(T(new THREE.BoxGeometry(START + 1.6, 0.02, START + 1.6)))), T(new THREE.LineBasicMaterial({ color: L.c })));
      frame.position.y = L.lv * H; scene.add(frame);
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d')!; g.font = '900 40px ui-rounded, system-ui'; g.fillStyle = L.c; g.shadowColor = L.c; g.shadowBlur = 16; g.textAlign = 'center'; g.fillText(`${L.name} PRIZE`, 128, 46);
      const tex = T(new THREE.CanvasTexture(c)); const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: tex, transparent: true }))); s.scale.set(2.2, 0.55, 1); s.position.set(-(START / 2 + 0.5), L.lv * H + 0.45, -(START / 2 + 0.5)); scene.add(s);
    }
    type Blk = { x: number; z: number; w: number; d: number; m: THREE.Mesh };
    const stack: Blk[] = [{ x: 0, z: 0, w: START, d: START, m: block(START, START, 0, 0, 0, 0) }];
    const debris: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3; life: number }[] = [];
    let cur: { axis: 'x' | 'z'; pos: number; dir: number; m: THREE.Mesh; w: number; d: number } | null = null;
    let score = 0, combo = 0, over = false, camY = 3, shake = 0, t = 0, idle = 0;
    const spawn = () => {
      const top = stack[stack.length - 1], lv = stack.length;
      const axis = lv % 2 ? 'x' : 'z';
      const from = lv % 4 < 2 ? -5 : 5;
      const m = block(top.w, top.d, axis === 'x' ? from : top.x, lv * H, axis === 'z' ? from : top.z, lv);
      cur = { axis, pos: from, dir: -Math.sign(from), m, w: top.w, d: top.d };
    };
    spawn();
    const speed = () => Math.min(9, 3.2 + stack.length * 0.2);
    const drop = () => {
      if (!cur || over) return;
      idle = 0;
      const top = stack[stack.length - 1], c = cur; cur = null;
      const lv = stack.length;
      const delta = c.pos - (c.axis === 'x' ? top.x : top.z);
      const size = c.axis === 'x' ? top.w : top.d;
      if (Math.abs(delta) < 0.12) {
        // perfect: snap on, keep the size (and grow it back after a few in a row)
        combo++;
        let w = top.w, d = top.d;
        if (combo >= 4) { if (c.axis === 'x') w = Math.min(START, w + 0.15); else d = Math.min(START, d + 0.15); }
        c.m.scale.set(w, H, d); c.m.position.set(top.x, lv * H, top.z);
        stack.push({ x: top.x, z: top.z, w, d, m: c.m });
        score += 2 + Math.min(5, combo - 1);
        sfx.perfect(combo); tap(haptics, 'medium');
        pops.add(combo > 1 ? `PERFECT ×${combo}` : 'PERFECT!', '#FFE14D', 50, 30);
        if (lv % GOLD === 0) { score += 15; sfx.jackpot(); pops.add('GOLD BLOCK +15', '#FFD84D', 50, 48, true); }
        fx.burst(new THREE.Vector3(top.x, lv * H + 0.3, top.z), reduce ? 6 : 18, 3);
      } else {
        const overlap = size - Math.abs(delta);
        combo = 0;
        if (overlap <= 0) {
          // missed it completely: the block falls, game over
          over = true; sfx.fail(); tap(haptics, 'heavy');
          debris.push({ m: c.m, v: new THREE.Vector3(0, 0, 0), r: new THREE.Vector3(Math.random(), 0, Math.random()), life: 3 });
          pops.add('GAME OVER', '#FF3D6E', 50, 40, true);
          setTimeout(() => onEnd(score), 1500);
          return;
        }
        const mid = (c.axis === 'x' ? top.x : top.z) + delta / 2;
        const cutLen = size - overlap, cutMid = mid + Math.sign(delta) * (overlap / 2 + cutLen / 2);
        const w = c.axis === 'x' ? overlap : top.w, d = c.axis === 'z' ? overlap : top.d;
        const x = c.axis === 'x' ? mid : top.x, z = c.axis === 'z' ? mid : top.z;
        c.m.scale.set(w, H, d); c.m.position.set(x, lv * H, z);
        stack.push({ x, z, w, d, m: c.m });
        const piece = block(c.axis === 'x' ? cutLen : top.w, c.axis === 'z' ? cutLen : top.d, c.axis === 'x' ? cutMid : top.x, lv * H, c.axis === 'z' ? cutMid : top.z, lv);
        debris.push({ m: piece, v: new THREE.Vector3(c.axis === 'x' ? Math.sign(delta) * 1.5 : 0, 1, c.axis === 'z' ? Math.sign(delta) * 1.5 : 0), r: new THREE.Vector3(Math.random() * 3, 0, Math.random() * 3), life: 2.5 });
        score += 1; shake = 0.25; sfx.cut(); tap(haptics, 'light');
      }
      const reached = stack.length - 1;
      // endless: past PRISM, every 10 levels is another (bigger) ULTRA prize
      const L = LINES.find((l) => l.lv === reached) ?? (endless && reached > 30 && reached % 10 === 0 ? { lv: reached, name: 'ULTRA', bonus: 150 + (reached - 30) * 5, c: '#B6FF3D' } : undefined);
      if (L) { score += L.bonus; sfx.jackpot(); tap(haptics, 'success'); pops.add(`${L.name} PRIZE! +${L.bonus}`, L.c, 50, 22, true); fx.burst(new THREE.Vector3(0, L.lv * H, 0), reduce ? 10 : 60, 6); }
      setHud({ score, level: stack.length - 1, combo, size: Math.round((stack[stack.length - 1].w * stack[stack.length - 1].d) / (START * START) * 100) });
      if (!endless && stack.length > 40) { over = true; pops.add('TOP OF THE TOWER!', '#FFE14D', 50, 30, true); sfx.jackpot(); setTimeout(() => onEnd(score), 1500); return; }
      spawn();
    };
    press.current = drop;
    if (config.e2e) (window as unknown as { __arcStacker: () => number | null }).__arcStacker = () => (cur ? cur.pos - (cur.axis === 'x' ? stack[stack.length - 1].x : stack[stack.length - 1].z) : null);
    const kd = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); drop(); } };
    window.addEventListener('keydown', kd);
    let raf = 0, last = performance.now();
    const fps = framePacer();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!fps.ready(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000) * MIR.speed; last = now; t += dt;
      if (cur) {
        // like the real machines: leave it too long and it drops by itself
        idle += dt; if (idle > 9) { drop(); return; }
        cur.pos += cur.dir * speed() * dt;
        if (cur.pos > 5.2) { cur.pos = 5.2; cur.dir = -1; } else if (cur.pos < -5.2) { cur.pos = -5.2; cur.dir = 1; }
        if (cur.axis === 'x') cur.m.position.x = cur.pos; else cur.m.position.z = cur.pos;
      }
      for (let i = debris.length - 1; i >= 0; i--) { const d = debris[i]; d.life -= dt; d.v.y -= 14 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.r.x * dt; d.m.rotation.z += d.r.z * dt; if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); } }
      fx.step(dt);
      camY += ((stack.length * H + 2.5) - camY) * Math.min(1, dt * 3);
      shake = Math.max(0, shake - dt);
      const sx = reduce ? 0 : (Math.random() - 0.5) * shake * 0.4;
      const orbit = reduce ? 0.7 : 0.7 + Math.sin(t * 0.15) * 0.15;
      const far = 12 + (camera.aspect < 1 ? (1 / camera.aspect - 1) * 7 : 0); // pull back on a tall phone screen
      camera.position.set(Math.sin(orbit) * far + sx, camY + far * 0.42, Math.cos(orbit) * far);
      camera.lookAt(0, camY - 0.6, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative h-full w-full select-none" onPointerDown={(e) => { e.preventDefault(); press.current(); }} data-testid="arc-stacker">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <Hud score={hud.score} left={endless ? <div className="lv-arc-led !text-[#B6FF3D]"><b>∞</b></div> : undefined} right={<div className="lv-arc-led"><span className="text-[9px] opacity-70">LEVEL</span><b>{hud.level}</b></div>} />
      {hud.combo > 1 && <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-full bg-[#FFE14D] px-3 py-0.5 text-xs font-black text-black">COMBO ×{hud.combo}</div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[11px] font-bold text-white/70">TAP ANYWHERE TO DROP · block {hud.size}%</div>
      {pops.el}
    </div>
  );
}

// ======================================================================================================
// Prism Ring
// ======================================================================================================
export function Cyclone({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, spin: 1, lives: 3, sup: false });
  const press = useRef<() => void>(() => {});
  const pops = usePops();
  useEffect(() => {
    const c = cv.current!; const g = c.getContext('2d')!; const r = rng(seed); unflipText(g);
    const N = 36, SPINS = 7;
    let dir = 1; // mirror twist: the light reverses at random
    // a JACKPOT earns a SUPER spin straight after (a free extra go, the jackpot worth double)
    let pos = r() * N, speed = 13, stopped = -1, hold = 0, spin = 1, score = 0, raf = 0, last = performance.now(), t = 0, flash = 0, over = false, sup = false, nextSup = false, lives = 3;
    const value = (i: number) => (i === 0 ? (sup ? 300 : 150) : i === 1 || i === N - 1 ? 40 : i === N / 4 || i === (3 * N) / 4 ? 25 : i === N / 2 ? 60 : 5);
    const stop = () => {
      if (stopped >= 0 || over) return;
      stopped = Math.round(pos) % N; hold = 1.3;
      const v = value(stopped); score += v;
      if (v >= 150) { sfx.jackpot(); tap(haptics, 'success'); pops.add(sup ? 'SUPER JACKPOT! +300' : 'JACKPOT! +150', '#FFE14D', 50, 45, true); flash = 1.2; if (!sup) { nextSup = true; pops.add('BONUS SPIN!', '#FF3D9A', 50, 62, true); } }
      else if (v >= 25) { sfx.win(4); tap(haptics, 'medium'); pops.add(`+${v}`, '#22E3FF', 50, 45, true); }
      else { sfx.blip(-5); tap(haptics); pops.add(`+${v}`, '#fff', 50, 45); if (endless && !sup) { lives--; pops.add(lives > 0 ? '−1 LIFE' : 'OUT OF LIVES', '#FF3D6E', 50, 62, true); sfx.fail(); } }
      setHud({ score, spin, lives, sup });
    };
    press.current = stop;
    const kd = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } };
    window.addEventListener('keydown', kd);
    let lastLit = -1;
    const fps = framePacer();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!fps.ready(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000) * MIR.speed; last = now; t += dt;
      const b = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
      if (c.width !== Math.round(b.width * dpr)) { c.width = Math.round(b.width * dpr); c.height = Math.round(b.height * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = b.width, H = b.height, cx = W / 2, cy = H * 0.48, R = Math.min(W, H) * 0.38;
      if (stopped < 0) { if (MIR.on && Math.random() < dt * 0.75) dir = -dir; pos = (((pos + dir * speed * dt) % N) + N) % N; const lit = Math.floor(pos) % N; if (lit !== lastLit) { lastLit = lit; if (!reduce || lit % 3 === 0) sfx.tick(); } }
      else {
        hold -= dt;
        if (hold <= 0) {
          stopped = -1;
          if (nextSup) { nextSup = false; sup = true; pos = r() * N; setHud({ score, spin, lives, sup }); }
          else if (endless ? lives <= 0 : spin >= SPINS) { over = true; setTimeout(() => onEnd(score), 600); }
          else { sup = false; spin++; speed = Math.min(endless ? 52 : 40, 13 + spin * (endless ? 1.6 : 3.4)); pos = r() * N; setHud({ score, spin, lives, sup }); }
        }
      }
      flash = Math.max(0, flash - dt);
      // cabinet glass
      const bg = g.createRadialGradient(cx, cy, 10, cx, cy, R * 1.6); bg.addColorStop(0, flash > 0 && Math.sin(t * 30) > 0 ? '#5A3A00' : sup ? '#3A0B2A' : '#1A0B3A'); bg.addColorStop(1, '#05030E'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const lit = stopped >= 0 ? stopped : Math.floor(pos) % N;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        const v = value(i), on = i === lit, blink = stopped >= 0 && on && Math.sin(t * 24) > 0;
        const col = v >= 150 ? '#FFD84D' : v >= 40 ? '#FF3D9A' : v >= 25 ? '#22E3FF' : `hsl(${(i * 10 + t * 40) % 360} 85% 55%)`;
        const rad = (v >= 150 ? 15 : 9) * (on ? 1.35 : 1);
        g.shadowColor = col; g.shadowBlur = on ? 30 : 8;
        g.fillStyle = on ? (blink ? col : '#ffffff') : col; g.globalAlpha = on ? 1 : 0.55;
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1; g.shadowBlur = 0;
        if (v >= 25 && v !== 40) { g.font = `900 ${v >= 150 ? 13 : 10}px ui-rounded, system-ui`; g.textAlign = 'center'; g.fillStyle = v >= 150 ? '#FFE14D' : '#fff'; const off = v >= 150 ? 34 : 30; const lx = cx + Math.cos(a) * (R - off), ly = cy + Math.sin(a) * (R - off); g.fillText(v >= 150 ? (sup ? 'SUPER' : 'JACKPOT') : String(v), lx, ly + 4); }
      }
      // the centre: the big score and spins left
      g.textAlign = 'center'; g.fillStyle = '#FFE14D'; g.shadowColor = '#FFB13D'; g.shadowBlur = 20; g.font = '900 48px ui-rounded, system-ui'; g.fillText(String(score), cx, cy + 10); g.shadowBlur = 0;
      g.font = '800 13px ui-monospace, monospace'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText(sup ? '★ BONUS SPIN ★' : endless ? `SPIN ${spin}` : `SPIN ${Math.min(spin, SPINS)} / ${SPINS}`, cx, cy + 34);
      g.font = '800 11px ui-monospace, monospace'; g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText('BESIDE THE JACKPOT = 40', cx, cy + R + 34);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative h-full w-full select-none" data-testid="arc-cyclone">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" onPointerDown={(e) => { e.preventDefault(); press.current(); }} />
      <Hud score={hud.score} left={hud.sup ? <div className="lv-arc-led !text-[#FF3D9A]"><b>SUPER!</b></div> : undefined}
        right={endless ? <Lives n={hud.lives} max={3} /> : <div className="lv-arc-led"><span className="text-[9px] opacity-70">SPIN</span><b>{hud.spin}/7</b></div>} />
      <button onPointerDown={(e) => { e.preventDefault(); press.current(); }} className="lv-arc-bigbtn absolute bottom-4 left-1/2 -translate-x-1/2" data-testid="arc-stop">STOP</button>
      {pops.el}
    </div>
  );
}

// ======================================================================================================
// Ring Roll
// ======================================================================================================
const SKEE_CENTER = 1.55;
/** Where a ball lands on the target board (x across, y up it) decides its score. */
export function skeeScore(x: number, y: number) {
  for (const s of [-1, 1]) if (Math.hypot(x - s * 0.95, y - 2.55) < 0.2) return 100;
  if (y > 2.85 || Math.abs(x) > 1.25) return 0;
  const d = Math.hypot(x, y - SKEE_CENTER);
  if (d < 0.2) return 50; if (d < 0.42) return 40; if (d < 0.64) return 30; if (d < 0.88) return 20;
  return 10;
}
export function SkeeBall({ onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, balls: 9, lives: 3, gold: false });
  const [meter, setMeter] = useState<number | null>(null);
  const pops = usePops();
  useEffect(() => {
    const el = cv.current!;
    const { renderer, scene, camera, T, dispose } = three(el, '#120822', 48);
    scene.add(new THREE.HemisphereLight('#FFE9C9', '#2A1A3A', 1.2));
    const key = new THREE.PointLight('#FFB13D', 30, 20); key.position.set(0, 4, -6); scene.add(key);
    const fx = burster(scene, T);
    // the lane (z from 1 to -7), the ramp, and the target board tilted up behind it
    const lane = new THREE.Mesh(T(new THREE.BoxGeometry(2.6, 0.1, 8)), T(new THREE.MeshStandardMaterial({ color: '#C98A4E', roughness: 0.4 }))); lane.position.set(0, 0, -3); scene.add(lane);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(T(new THREE.BoxGeometry(0.12, 0.4, 8)), T(new THREE.MeshStandardMaterial({ color: '#FF3D9A', emissive: '#FF3D9A', emissiveIntensity: 1.4 }))); rail.position.set(s * 1.36, 0.2, -3); scene.add(rail); }
    const ramp = new THREE.Mesh(T(new THREE.BoxGeometry(2.6, 0.1, 0.8)), T(new THREE.MeshStandardMaterial({ color: '#8A5A2E' }))); ramp.position.set(0, 0.18, -6.9); ramp.rotation.x = 0.45; scene.add(ramp);
    const c = document.createElement('canvas'); c.width = 512; c.height = 600; const g = c.getContext('2d')!;
    g.fillStyle = '#1B0F33'; g.fillRect(0, 0, 512, 600);
    const px = (x: number) => 256 + x * 190, py = (y: number) => 600 - y * 200;
    const rings = [[0.88, '#3DDC97', '20'], [0.64, '#22E3FF', '30'], [0.42, '#B57BFF', '40'], [0.2, '#FF3D9A', '50']] as const;
    g.fillStyle = '#2E1F55'; g.beginPath(); g.arc(px(0), py(SKEE_CENTER), 1.0 * 190, 0, Math.PI * 2); g.fill();
    for (const [rr, col, lab] of rings) { g.strokeStyle = col; g.lineWidth = 12; g.shadowColor = col; g.shadowBlur = 14; g.beginPath(); g.arc(px(0), py(SKEE_CENTER), rr * 190, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0; g.fillStyle = col; g.font = '900 30px ui-rounded'; g.textAlign = 'center'; g.fillText(lab, px(0), py(SKEE_CENTER) - rr * 190 + 34); }
    g.fillStyle = '#05030C'; g.beginPath(); g.arc(px(0), py(SKEE_CENTER), 0.14 * 190, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.fillStyle = '#FFD84D'; g.shadowColor = '#FFD84D'; g.shadowBlur = 20; g.beginPath(); g.arc(px(s * 0.95), py(2.55), 0.2 * 190, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#000'; g.font = '900 30px ui-rounded'; g.fillText('100', px(s * 0.95), py(2.55) + 11); }
    g.fillStyle = '#FFE14D'; g.font = '900 34px ui-rounded'; g.fillText('10', px(0), 585);
    const boardTex = T(new THREE.CanvasTexture(c)); boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(T(new THREE.PlaneGeometry(512 / 190, 3)), T(new THREE.MeshStandardMaterial({ map: boardTex, emissive: '#ffffff', emissiveMap: boardTex, emissiveIntensity: 0.55 })));
    const tilt = 0.75; board.rotation.x = -tilt; board.position.set(0, 0.35 + Math.sin(tilt) * 1.5, -7.6 - Math.cos(tilt) * 1.5); scene.add(board);
    const boardPoint = (x: number, y: number) => new THREE.Vector3(x, 0.35 + Math.sin(tilt) * y, -7.6 - Math.cos(tilt) * y);
    const ballGeo = T(new THREE.SphereGeometry(0.16, 20, 14)), ballMat = T(new THREE.MeshStandardMaterial({ color: '#F4E6D0', roughness: 0.35 }));
    const goldMat = T(new THREE.MeshStandardMaterial({ color: '#FFD84D', metalness: 0.7, roughness: 0.2, emissive: '#7A5A00', emissiveIntensity: 0.7 }));
    camera.position.set(0, 2.6, 2.6); camera.lookAt(0, 0.6, -5.5);
    // every third ball is a golden BONUS BALL: double points. Endless: roll for as long as you like; a score under
    // 20 costs a life (three lives)
    type Ball = { m: THREE.Mesh; t: number; x: number; y: number; pts: number; done: boolean; dur: number; gold: boolean };
    const balls: Ball[] = [];
    let left = 9, score = 0, over = false, rolled = 0, lives = 3;
    const isGold = () => (rolled + 1) % 3 === 0;
    const roll = (aim: number, power: number) => {
      if (over || (!endless && left <= 0) || (endless && lives <= 0)) return;
      if (!endless) left--;
      const gold = isGold(); rolled++;
      // where it lands: power sets how high up the board, the flick's angle where across
      const y = clamp(power, 0, 1.1) * 3.0, x = clamp(aim, -1.4, 1.4);
      const pts = skeeScore(x, y) * (gold ? 2 : 1);
      const m = new THREE.Mesh(ballGeo, gold ? goldMat : ballMat); m.position.set(0, 0.25, 0.6); scene.add(m);
      balls.push({ m, t: 0, x, y, pts, done: false, dur: 0.9 + power * 0.25, gold });
      sfx.roll(); tap(haptics);
      setHud({ score, balls: left, lives, gold: isGold() });
    };
    let raf = 0, last = performance.now();
    const fps = framePacer();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!fps.ready(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000) * MIR.speed; last = now;
      for (const b of balls) {
        if (b.done) continue;
        b.t += dt;
        const k = b.t / b.dur;
        const land = boardPoint(b.x, b.y);
        if (k < 0.62) { const q = k / 0.62; b.m.position.set(b.x * 0.35 * q, 0.22, 0.6 + (-6.6 - 0.6) * q); b.m.rotation.x -= dt * 20; }
        else if (k < 1) { const q = (k - 0.62) / 0.38; const from = new THREE.Vector3(b.x * 0.35, 0.3, -6.6); b.m.position.lerpVectors(from, land, q); b.m.position.y += Math.sin(q * Math.PI) * 0.9; }
        else if (k < 1.35) { b.m.position.copy(land); b.m.scale.setScalar(Math.max(0.01, 1 - (k - 1) / 0.35)); }
        else {
          b.done = true; scene.remove(b.m);
          score += b.pts;
          if (b.gold && b.pts > 0) pops.add('BONUS BALL ×2', '#FFD84D', 50, 48, true);
          if (endless && b.pts < (b.gold ? 40 : 20)) { lives--; pops.add(lives > 0 ? '−1 LIFE' : 'OUT OF LIVES', '#FF3D6E', 50, 60, true); }
          if (b.pts >= 100) { sfx.jackpot(); tap(haptics, 'success'); pops.add('+100!!', '#FFD84D', 50, 30, true); fx.burst(land, reduce ? 8 : 40, 4); }
          else if (b.pts >= 40) { sfx.win(4); tap(haptics, 'medium'); pops.add(`+${b.pts}`, '#FF3D9A', 50, 30, true); fx.burst(land, reduce ? 6 : 20, 3); }
          else if (b.pts > 0) { sfx.win(2); pops.add(`+${b.pts}`, '#22E3FF', 50, 32); }
          else { sfx.thud(); pops.add('MISS', '#888', 50, 32); }
          setHud({ score, balls: left, lives, gold: isGold() });
          if ((endless ? lives <= 0 : left <= 0) && balls.every((x) => x.done) && !over) { over = true; setTimeout(() => onEnd(score), 900); }
        }
      }
      fx.step(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    // flick: drag up from the bottom of the screen
    let st: { x: number; y: number; t: number } | null = null;
    const pd = (e: PointerEvent) => { st = { x: mirDX(e.clientX), y: mirDY(e.clientY), t: performance.now() }; setMeter(0); };
    const pm = (e: PointerEvent) => { if (!st) return; const r = el.getBoundingClientRect(); setMeter(clamp((st.y - mirDY(e.clientY)) / (r.height * 0.6), 0, 1.1)); };
    const pu = (e: PointerEvent) => {
      if (!st) return; const r = el.getBoundingClientRect();
      const dy = st.y - mirDY(e.clientY), dx = mirDX(e.clientX) - st.x; st = null; setMeter(null);
      if (dy < 20) return;
      roll((dx / dy) * 2.2, dy / (r.height * 0.6));
    };
    el.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
    (el as unknown as { __roll: typeof roll }).__roll = roll;
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative h-full w-full touch-none select-none" data-testid="arc-skeeball">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <Hud score={hud.score} left={hud.gold ? <div className="lv-arc-led !text-[#FFD84D]"><b>★ ×2 BALL</b></div> : undefined}
        right={endless ? <Lives n={hud.lives} max={3} /> : <div className="lv-arc-led"><span className="text-[9px] opacity-70">BALLS</span><b>{hud.balls}</b></div>} />
      {meter != null && <div className="pointer-events-none absolute bottom-6 right-3 h-40 w-3 overflow-hidden rounded-full bg-white/15"><div className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: `${Math.min(100, meter * 91)}%`, background: 'linear-gradient(#FF3D9A,#FFE14D,#3DDC97)' }} /></div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[11px] font-bold text-white/70">FLICK UP TO ROLL · harder = higher</div>
      {pops.el}
    </div>
  );
}

// ======================================================================================================
// Hoop Shot
// ======================================================================================================
export function HoopShot({ onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, left: endless ? 30 : 40, streak: 0, money: false });
  const pops = usePops();
  useEffect(() => {
    const el = cv.current!;
    const { renderer, scene, camera, T, dispose } = three(el, '#0B0A1E', 55);
    scene.add(new THREE.HemisphereLight('#ffffff', '#2A1A3A', 1.1));
    const spot = new THREE.PointLight('#FF7A3D', 25, 14); spot.position.set(0, 5, -4); scene.add(spot);
    const fx = burster(scene, T);
    const RIM_Y = 3.05, RIM_Z = -6, RIM_R = 0.3, BALL_R = 0.13;
    const backboard = new THREE.Mesh(T(new THREE.BoxGeometry(1.9, 1.2, 0.06)), T(new THREE.MeshStandardMaterial({ color: '#E8F4FF', transparent: true, opacity: 0.85, roughness: 0.1 }))); backboard.position.set(0, RIM_Y + 0.45, RIM_Z - 0.38); scene.add(backboard);
    const square = new THREE.LineSegments(T(new THREE.EdgesGeometry(T(new THREE.PlaneGeometry(0.6, 0.45)))), T(new THREE.LineBasicMaterial({ color: '#FF3D3D' }))); square.position.set(0, RIM_Y + 0.25, RIM_Z - 0.34); scene.add(square);
    const hoop = new THREE.Group(); scene.add(hoop);
    const rim = new THREE.Mesh(T(new THREE.TorusGeometry(RIM_R, 0.025, 8, 28)), T(new THREE.MeshStandardMaterial({ color: '#FF5A1F', emissive: '#FF5A1F', emissiveIntensity: 0.7 }))); rim.rotation.x = Math.PI / 2; hoop.add(rim);
    const net = new THREE.Mesh(T(new THREE.CylinderGeometry(RIM_R, RIM_R * 0.6, 0.45, 14, 3, true)), T(new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.7 }))); net.position.y = -0.23; hoop.add(net);
    hoop.position.set(0, RIM_Y, RIM_Z);
    const floor = new THREE.Mesh(T(new THREE.PlaneGeometry(6, 12)), T(new THREE.MeshStandardMaterial({ color: '#3A2412', roughness: 0.6 }))); floor.rotation.x = -Math.PI / 2; floor.position.z = -4; scene.add(floor);
    const lineMat = T(new THREE.MeshBasicMaterial({ color: '#FFE14D' }));
    const arc3 = new THREE.Mesh(T(new THREE.RingGeometry(3.3, 3.36, 40, 1, Math.PI * 0.15, Math.PI * 0.7)), lineMat); arc3.rotation.x = -Math.PI / 2; arc3.position.set(0, 0.01, RIM_Z); scene.add(arc3);
    for (const s of [-1, 1]) { const net2 = new THREE.Mesh(T(new THREE.BoxGeometry(0.05, 3, 12)), T(new THREE.MeshStandardMaterial({ color: '#22E3FF', emissive: '#22E3FF', emissiveIntensity: 1.2 }))); net2.position.set(s * 2.4, 1.5, -4); scene.add(net2); }
    camera.position.set(0, 2.3, 2.2); camera.lookAt(0, 2.2, -6);
    const ballGeo = T(new THREE.SphereGeometry(BALL_R, 18, 12));
    const moneyMat = T(new THREE.MeshStandardMaterial({ color: '#3DDC97', roughness: 0.4, emissive: '#0A6A3A', emissiveIntensity: 0.8 }));
    const ballMat = T(new THREE.MeshStandardMaterial({ color: '#FF7A1F', roughness: 0.6 })), fireMat = T(new THREE.MeshStandardMaterial({ color: '#FFB13D', emissive: '#FF3D00', emissiveIntensity: 1.5 }));
    // every fifth ball is a green MONEY BALL (worth double); endless starts with 30 seconds and every basket adds 2
    type Ball = { m: THREE.Mesh; v: THREE.Vector3; checked: boolean; life: number; made?: boolean; money: boolean };
    const balls: Ball[] = [];
    let score = 0, streak = 0, over = false, t = 0, shots = 0, extra = 0;
    const T0 = performance.now(), DUR = endless ? 30 : 40;
    const shoot = (dx: number, dy: number, W: number, H: number) => {
      if (over) return;
      // the flick picks where the ball comes down: length → how far, sideways → where across
      const dist = 2.5 + clamp(dy / (H * 0.55), 0, 1.3) * 5.2, x = clamp((dx / W) * 3.2, -2, 2);
      const TF = 0.9, from = new THREE.Vector3(0, 1.0, 0.4);
      const v = new THREE.Vector3(x / TF, (RIM_Y - from.y + 4.9 * TF * TF) / TF, (-dist - from.z) / TF);
      shots++; const money = shots % 5 === 0;
      const m = new THREE.Mesh(ballGeo, money ? moneyMat : streak >= 3 ? fireMat : ballMat); m.position.copy(from); scene.add(m);
      balls.push({ m, v, checked: false, life: 3, money });
      setHud((h) => ({ ...h, money: (shots + 1) % 5 === 0 }));
      sfx.blip(-12); tap(haptics);
    };
    let raf = 0, last = performance.now();
    const fps = framePacer();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!fps.ready(now)) return;
      const dt = Math.min(0.033, (now - last) / 1000) * MIR.speed; last = now; t += dt;
      const played = (now - T0) / 1000, left = Math.max(0, DUR + extra - played);
      if (left <= 0 && !over) { over = true; pops.add('TIME!', '#FFE14D', 50, 40, true); sfx.fail(); setTimeout(() => onEnd(score), 1200); }
      if (left > 0) setHud((h) => (Math.ceil(left) !== h.left ? { ...h, left: Math.ceil(left) } : h));
      // after 20 seconds the hoop starts moving (in endless it gets faster and wider the longer you last)
      const moving = MIR.on || played > 20; // mirror twist: it moves from the first ball, and quicker
      if (moving) { const pp = MIR.on ? played + 6 : played - 20; const k = (endless ? Math.min(2.2, 1 + Math.max(0, pp) / 60) : 1) * (MIR.on ? 1.3 : 1); hoop.position.x = Math.sin(pp * 1.1 * k) * Math.min(1.6, 1.1 * k); }
      backboard.position.x = square.position.x = hoop.position.x;
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i]; b.life -= dt;
        const prevY = b.m.position.y;
        b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x -= dt * 10;
        // backboard
        if (b.m.position.z < RIM_Z - 0.32 && b.v.z < 0 && Math.abs(b.m.position.x - hoop.position.x) < 0.95 && b.m.position.y > RIM_Y - 0.2 && b.m.position.y < RIM_Y + 1.1) { b.v.z = -b.v.z * 0.5; b.v.x *= 0.6; sfx.thud(); }
        // through the rim (coming down)?
        if (!b.checked && b.v.y < 0 && prevY >= RIM_Y && b.m.position.y < RIM_Y) {
          b.checked = true;
          const d = Math.hypot(b.m.position.x - hoop.position.x, b.m.position.z - RIM_Z);
          if (d < RIM_R - BALL_R * 0.55) {
            b.made = true; streak++;
            const pts = (moving ? 3 : 2) * (streak >= 3 ? 2 : 1) * (b.money ? 2 : 1); // a moving hoop is worth 3
            score += pts; b.v.set(0, -2, 0);
            if (endless) { extra += 2; pops.add('+2s', '#22E3FF', 80, 14); }
            sfx.swish(); tap(haptics, 'medium');
            pops.add(b.money ? `💵 MONEY BALL +${pts}` : streak >= 3 ? `🔥 +${pts}` : `+${pts}`, b.money ? '#3DDC97' : streak >= 3 ? '#FFB13D' : '#fff', 50, 30, streak === 3 || b.money);
            if (streak === 3) { sfx.jackpot(); pops.add('ON FIRE!', '#FF3D00', 50, 22, true); }
            fx.burst(new THREE.Vector3(hoop.position.x, RIM_Y, RIM_Z), reduce ? 4 : 14, 2.5);
            net.scale.y = 1.5;
          } else if (d < RIM_R + BALL_R + 0.06) {
            // off the rim
            b.v.set((b.m.position.x - hoop.position.x) * 6, 2.2, 1.2); sfx.bonk(); streak = 0;
          } else streak = 0;
          setHud((h) => ({ ...h, score, streak }));
        }
        if (b.m.position.y < 0.13) { b.m.position.y = 0.13; b.v.y = -b.v.y * 0.5; b.v.x *= 0.8; b.v.z *= 0.8; }
        if (b.life <= 0) { scene.remove(b.m); balls.splice(i, 1); }
      }
      net.scale.y += (1 - net.scale.y) * Math.min(1, dt * 6);
      fx.step(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    let st: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => { st = { x: mirDX(e.clientX), y: mirDY(e.clientY) }; };
    const pu = (e: PointerEvent) => { if (!st) return; const r = el.getBoundingClientRect(); const dy = st.y - mirDY(e.clientY), dx = mirDX(e.clientX) - st.x; st = null; if (dy > 25) shoot(dx, dy, r.width, r.height); };
    el.addEventListener('pointerdown', pd); window.addEventListener('pointerup', pu);
    (el as unknown as { __shoot: typeof shoot }).__shoot = shoot;
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', pd); window.removeEventListener('pointerup', pu); dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative h-full w-full touch-none select-none" data-testid="arc-hoops">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <Hud score={hud.score} left={hud.streak >= 3 ? <div className="lv-arc-led !text-[#FFB13D]"><b>🔥 ×2</b></div> : hud.money ? <div className="lv-arc-led !text-[#3DDC97]"><b>💵 NEXT</b></div> : undefined}
        right={<div className={`lv-arc-led ${hud.left <= 10 ? '!text-[#FF3D6E]' : ''}`}><span className="text-[9px] opacity-70">TIME</span><b>{hud.left}</b></div>} />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[11px] font-bold text-white/70">FLICK UP TO SHOOT · {endless ? 'every basket +2s' : 'as fast as you can'} · 💵 every 5th ball ×2</div>
      {pops.el}
    </div>
  );
}

// ======================================================================================================
// Bop-a-Bot
// ======================================================================================================
export function BopABot({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, left: 40, combo: 0, lives: 5, frenzy: 0 });
  const pops = usePops();
  useEffect(() => {
    const el = cv.current!; const r = rng(seed);
    const { renderer, scene, camera, T, dispose } = three(el, '#06140E', 45);
    scene.add(new THREE.HemisphereLight('#D9FFE9', '#08140C', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 1.4); key.position.set(2, 8, 4); scene.add(key);
    const fx = burster(scene, T);
    const table = new THREE.Mesh(T(new THREE.BoxGeometry(5, 0.6, 5)), T(new THREE.MeshStandardMaterial({ color: '#1F7A4D', roughness: 0.5 }))); table.position.y = -0.3; scene.add(table);
    const edge = new THREE.Mesh(T(new THREE.BoxGeometry(5.1, 0.1, 5.1)), T(new THREE.MeshStandardMaterial({ color: '#3DDC97', emissive: '#3DDC97', emissiveIntensity: 1.2 }))); edge.position.y = 0.01; scene.add(edge);
    camera.position.set(0, 6.2, 4.4); camera.lookAt(0, 0, 0.2);
    const holeGeo = T(new THREE.CircleGeometry(0.55, 24)), holeMat = T(new THREE.MeshBasicMaterial({ color: '#020604' }));
    const bodyGeo = T(new THREE.CylinderGeometry(0.42, 0.46, 0.9, 18)), headGeo = T(new THREE.SphereGeometry(0.42, 18, 12)), eyeGeo = T(new THREE.SphereGeometry(0.09, 10, 8));
    const mats = { bot: T(new THREE.MeshStandardMaterial({ color: '#9AA8BE', metalness: 0.6, roughness: 0.3 })), gold: T(new THREE.MeshStandardMaterial({ color: '#FFD84D', metalness: 0.8, roughness: 0.2, emissive: '#7A5A00', emissiveIntensity: 0.4 })), kitty: T(new THREE.MeshStandardMaterial({ color: '#FFB3D1', roughness: 0.8 })) };
    const eyeMat = { bot: T(new THREE.MeshBasicMaterial({ color: '#FF3D3D' })), gold: T(new THREE.MeshBasicMaterial({ color: '#22E3FF' })), kitty: T(new THREE.MeshBasicMaterial({ color: '#111' })) };
    const earGeo = T(new THREE.ConeGeometry(0.13, 0.28, 8)), antGeo = T(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6)), antTip = T(new THREE.SphereGeometry(0.06, 8, 6));
    type Kind = 'bot' | 'gold' | 'kitty';
    type Hole = { g: THREE.Group; kind: Kind; up: number; target: number; timer: number; hit: boolean; x: number; z: number; parts: Record<Kind, THREE.Group> };
    const holes: Hole[] = [];
    for (let i = 0; i < 9; i++) {
      const x = ((i % 3) - 1) * 1.55, z = (Math.floor(i / 3) - 1) * 1.45;
      const h = new THREE.Mesh(holeGeo, holeMat); h.rotation.x = -Math.PI / 2; h.position.set(x, 0.07, z); scene.add(h);
      const g = new THREE.Group(); g.position.set(x, -1.95, z); scene.add(g);
      const parts = {} as Record<Kind, THREE.Group>;
      for (const k of ['bot', 'gold', 'kitty'] as Kind[]) {
        const p = new THREE.Group();
        const b = new THREE.Mesh(bodyGeo, mats[k]); b.position.y = 0.45; p.add(b);
        const hd = new THREE.Mesh(headGeo, mats[k]); hd.position.y = 1.0; p.add(hd);
        for (const s of [-1, 1]) {
          const e = new THREE.Mesh(eyeGeo, eyeMat[k]); e.position.set(s * 0.15, 1.05, 0.36); p.add(e);
          if (k === 'kitty') { const ear = new THREE.Mesh(earGeo, mats[k]); ear.position.set(s * 0.25, 1.38, 0); ear.rotation.z = -s * 0.3; p.add(ear); }
          else if (s > 0) { const a = new THREE.Mesh(antGeo, mats[k]); a.position.set(0, 1.5, 0); p.add(a); const tip = new THREE.Mesh(antTip, eyeMat[k]); tip.position.set(0, 1.66, 0); p.add(tip); }
        }
        p.visible = k === 'bot'; g.add(p); parts[k] = p;
      }
      holes.push({ g, kind: 'bot', up: 0, target: 0, timer: 0.4 + r() * 1.5, hit: false, x, z, parts });
    }
    // a 15-bop combo starts a FRENZY: 5 seconds of bots everywhere, every bop worth double, no kitties.
    // Endless: no clock, but every bot that gets away (or kitty you bop) costs one of five lives
    let score = 0, combo = 0, over = false, frenzy = 0, lives = 5;
    const T0 = performance.now(), DUR = 40;
    const lose = (why: string) => {
      if (!endless || over) return;
      lives--; setHud((x) => ({ ...x, lives })); pops.add(lives > 0 ? why : 'OUT OF LIVES', '#FF3D6E', 50, 55, true);
      if (lives <= 0) { over = true; sfx.fail(); setTimeout(() => onEnd(score), 1200); }
    };
    const bop = (h: Hole) => {
      if (over || h.up < 0.4 || h.hit) return;
      h.hit = true; h.target = 0; h.timer = 0.5 + r() * 0.6;
      const at = new THREE.Vector3(h.x, 1, h.z);
      if (h.kind === 'kitty') { score = Math.max(0, score - 3); combo = 0; sfx.fail(); tap(haptics, 'warning'); pops.add('NOT THE KITTY! −3', '#FF7AB8', 50, 35, true); lose('−1 LIFE'); }
      else {
        combo++;
        if (combo % 15 === 0 && frenzy <= 0) { frenzy = 5; sfx.jackpot(); pops.add('FRENZY! ×2', '#FF3D9A', 50, 20, true); for (const q of holes) if (!q.target) q.timer = Math.random() * 0.3; }
        const pts = ((h.kind === 'gold' ? 5 : 1) + Math.min(4, Math.floor(combo / 5))) * (frenzy > 0 ? 2 : 1);
        score += pts; sfx.bonk(); tap(haptics, 'medium');
        pops.add(h.kind === 'gold' ? `GOLD +${pts}` : `+${pts}`, h.kind === 'gold' ? '#FFD84D' : '#fff', 50, 35, h.kind === 'gold');
        fx.burst(at, reduce ? 4 : h.kind === 'gold' ? 26 : 10, 3);
        if (combo % 10 === 0) { sfx.win(5); pops.add(`COMBO ${combo}!`, '#3DDC97', 50, 22, true); }
      }
      setHud((x) => ({ ...x, score, combo }));
    };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pd = (e: PointerEvent) => {
      const b = el.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      if (MIR.x) ndc.x = -ndc.x; if (MIR.y) ndc.y = -ndc.y;
      ray.setFromCamera(ndc, camera);
      const hit = holes.find((h) => ray.intersectObject(h.g, true).length);
      if (hit) bop(hit);
      else {
        // a tap near a hole counts (fingers are big)
        const p = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6), p);
        const h = holes.filter((q) => q.up > 0.4 && !q.hit).sort((a, b2) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b2.x - p.x, b2.z - p.z))[0];
        if (h && Math.hypot(h.x - p.x, h.z - p.z) < 0.75) bop(h); else if (combo) { combo = 0; setHud((x) => ({ ...x, combo })); }
      }
    };
    el.addEventListener('pointerdown', pd);
    let raf = 0, last = performance.now(), t = 0;
    const fps = framePacer();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!fps.ready(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000) * MIR.speed; last = now; t += dt;
      const played = (now - T0) / 1000, left = endless ? 0 : Math.max(0, DUR - played);
      if (!endless && left <= 0 && !over) { over = true; pops.add('TIME!', '#FFE14D', 50, 40, true); sfx.fail(); setTimeout(() => onEnd(score), 1200); }
      if (frenzy > 0) { frenzy = Math.max(0, frenzy - dt); setHud((h) => (Math.ceil(frenzy) !== h.frenzy ? { ...h, frenzy: Math.ceil(frenzy) } : h)); }
      if (!endless) setHud((h) => (Math.ceil(left) !== h.left ? { ...h, left: Math.ceil(left) } : h));
      const kf = camera.aspect < 1 ? Math.min(2.1, 0.82 / camera.aspect) : 1; // fit a tall phone screen
      camera.position.set(0, 6.2 * kf, 4.4 * kf); camera.lookAt(0, 0, 0.25);
      const pace = (endless ? 1 + Math.min(2.2, played / 50) : 1 + (DUR - left) / DUR * 1.4) * (frenzy > 0 ? 2 : 1); // faster as it goes
      for (const h of holes) {
        h.timer -= dt * pace;
        if (h.timer <= 0 && !over) {
          if (h.target === 0 && h.up < 0.05) {
            const roll = r(); h.kind = roll < 0.12 ? 'gold' : roll < 0.3 && frenzy <= 0 ? 'kitty' : 'bot';
            for (const k of Object.keys(h.parts) as Kind[]) h.parts[k].visible = k === h.kind;
            h.target = 1; h.hit = false; h.timer = 0.7 + r() * 0.9;
          } else {
            if (h.target === 1 && !h.hit && h.kind !== 'kitty') { if (combo) { combo = 0; setHud((x) => ({ ...x, combo })); } if (frenzy <= 0) lose('ONE GOT AWAY! −1'); }
            h.target = 0; h.timer = 0.3 + r() * 1.4;
          }
        }
        // mirror twist: shapeshifters — a bot can turn into a kitty while it's up (and back again)
        if (MIR.on && h.target === 1 && !h.hit && h.up > 0.6 && h.kind !== 'gold' && frenzy <= 0 && Math.random() < dt * 0.7) {
          h.kind = h.kind === 'kitty' ? 'bot' : 'kitty'; for (const k of Object.keys(h.parts) as Kind[]) h.parts[k].visible = k === h.kind;
        }
        h.up += (h.target - h.up) * Math.min(1, dt * (h.hit ? 16 : 11));
        h.g.position.y = -1.95 + h.up * 1.85;
        h.g.scale.y = h.hit ? 0.55 : 1;
        h.g.rotation.y = h.kind === 'kitty' ? Math.sin(t * 6) * 0.25 : 0;
      }
      fx.step(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', pd); dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative h-full w-full touch-none select-none" data-testid="arc-bop">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <Hud score={hud.score} left={hud.frenzy > 0 ? <div className="lv-arc-led !text-[#FF3D9A]"><b>FRENZY {hud.frenzy}</b></div> : hud.combo >= 5 ? <div className="lv-arc-led !text-[#3DDC97]"><b>×{hud.combo}</b></div> : undefined}
        right={endless ? <Lives n={hud.lives} max={5} /> : <div className={`lv-arc-led ${hud.left <= 10 ? '!text-[#FF3D6E]' : ''}`}><span className="text-[9px] opacity-70">TIME</span><b>{hud.left}</b></div>} />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[11px] font-bold text-white/70">BOP THE BOTS · GOLD = 5 · LEAVE THE KITTIES 🐱</div>
      {pops.el}
    </div>
  );
}

// ======================================================================================================
// Claw Crane
// ======================================================================================================
const CLAW_PRIZES = [['🧸', 60, '#C98A4E'], ['🦄', 120, '#FFB3E6'], ['🐙', 80, '#FF7AB8'], ['👾', 150, '#8B5CFF'], ['🦖', 100, '#3DDC97'], ['🦆', 30, '#FFE14D'], ['🐻‍❄️', 70, '#E9F4FF'], ['🐸', 50, '#4FD18B']] as const;
export function ClawCrane({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, tries: 5, phase: 'x' as 'x' | 'z' | 'busy', left: 15 });
  const hold = useRef<{ x: boolean; z: boolean }>({ x: false, z: false });
  const pops = usePops();
  const ctl = useRef<{ release(axis: 'x' | 'z'): void }>({ release: () => {} });
  useEffect(() => {
    const el = cv.current!; const r = rng(seed);
    const { renderer, scene, camera, T, dispose } = three(el, '#140A26', 46);
    scene.add(new THREE.HemisphereLight('#E9DFFF', '#1A0F2A', 1.2));
    const top = new THREE.PointLight('#ffffff', 22, 10); top.position.set(0, 3.2, 0); scene.add(top);
    const fx = burster(scene, T);
    const AX = 1.35, AZ = 1.2, FLOOR = 0;
    const floor = new THREE.Mesh(T(new THREE.BoxGeometry(AX * 2 + 0.4, 0.2, AZ * 2 + 0.4)), T(new THREE.MeshStandardMaterial({ color: '#2A1F4A' }))); floor.position.y = -0.1; scene.add(floor);
    const chute = new THREE.Mesh(T(new THREE.BoxGeometry(0.7, 0.05, 0.7)), T(new THREE.MeshBasicMaterial({ color: '#000' }))); chute.position.set(-AX + 0.25, 0.01, AZ - 0.25); scene.add(chute);
    const chuteWall = new THREE.Mesh(T(new THREE.BoxGeometry(0.75, 0.45, 0.04)), T(new THREE.MeshStandardMaterial({ color: '#B57BFF', emissive: '#B57BFF', emissiveIntensity: 0.8, transparent: true, opacity: 0.7 }))); chuteWall.position.set(-AX + 0.25, 0.22, AZ - 0.62); scene.add(chuteWall);
    const glassMat = T(new THREE.MeshStandardMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.08 }));
    for (const [w, d, x, z] of [[AX * 2 + 0.4, 0.04, 0, -AZ - 0.2], [0.04, AZ * 2 + 0.4, -AX - 0.2, 0], [0.04, AZ * 2 + 0.4, AX + 0.2, 0]] as const) { const g = new THREE.Mesh(T(new THREE.BoxGeometry(w, 3, d)), glassMat); g.position.set(x, 1.5, z); scene.add(g); }
    const frameMat = T(new THREE.MeshStandardMaterial({ color: '#B57BFF', emissive: '#B57BFF', emissiveIntensity: 1.3 }));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(T(new THREE.BoxGeometry(0.07, 3.2, 0.07)), frameMat); p.position.set(x * (AX + 0.2), 1.6, z * (AZ + 0.2)); scene.add(p); }
    camera.position.set(0, 2.6, 4.1); camera.lookAt(0, 0.7, -0.1);
    // prizes: a squishy ball each, with its face on top
    type Prize = { g: THREE.Group; e: string; pts: number; x: number; z: number; r: number; held: boolean; gone: boolean; vy: number; golden: boolean };
    const prizes: Prize[] = [];
    const ballGeo = T(new THREE.SphereGeometry(1, 18, 12));
    // one GOLDEN prize in every machine: smaller and slippery (line it up dead centre) but worth 250
    const goldBody = T(new THREE.MeshStandardMaterial({ color: '#FFD84D', metalness: 0.8, roughness: 0.2, emissive: '#7A5A00', emissiveIntensity: 0.7 }));
    const addPrize = (golden: boolean) => {
      const [e, pts, col] = golden ? ['⭐', 250, '#FFD84D'] as const : CLAW_PRIZES[Math.floor(r() * CLAW_PRIZES.length)];
      let x = 0, z = 0, ok = false;
      for (let k = 0; k < 30 && !ok; k++) { x = -AX + 0.3 + r() * (AX * 2 - 0.6); z = -AZ + 0.3 + r() * (AZ * 2 - 0.6); ok = Math.hypot(x - (-AX + 0.25), z - (AZ - 0.25)) > 0.75 && prizes.every((p) => p.gone || Math.hypot(p.x - x, p.z - z) > 0.48); }
      if (!ok) return;
      const rad = golden ? 0.19 : 0.22 + (pts / 150) * 0.05;
      const g = new THREE.Group(); g.position.set(x, rad, z);
      const body = new THREE.Mesh(ballGeo, golden ? goldBody : T(new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }))); body.scale.set(rad, rad * 0.9, rad); g.add(body);
      const face = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: T(emojiTex(e)), transparent: true, depthWrite: false }))); face.scale.setScalar(rad * 2.4); face.position.y = rad * 0.2; g.add(face);
      if (golden) { const glowS = new THREE.PointLight('#FFD84D', 2, 1.2); glowS.position.y = 0.3; g.add(glowS); }
      scene.add(g); prizes.push({ g, e, pts, x, z, r: rad, held: false, gone: false, vy: 0, golden });
    };
    addPrize(true);
    for (let i = 0; i < 13; i++) addPrize(false);
    // the claw: a gantry rail, a cable, a hub and three fingers
    const claw = new THREE.Group(); scene.add(claw);
    const metal = T(new THREE.MeshStandardMaterial({ color: '#D7DCE6', metalness: 0.9, roughness: 0.25 }));
    const cable = new THREE.Mesh(T(new THREE.CylinderGeometry(0.012, 0.012, 1, 6)), metal); scene.add(cable);
    const hub = new THREE.Mesh(T(new THREE.CylinderGeometry(0.12, 0.09, 0.14, 12)), metal); claw.add(hub);
    const fingers: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) { const f = new THREE.Group(); f.rotation.y = (i / 3) * Math.PI * 2; const seg = new THREE.Mesh(T(new THREE.BoxGeometry(0.03, 0.32, 0.03)), metal); seg.position.set(0, -0.16, 0.1); f.add(seg); claw.add(f); fingers.push(f); }
    const shadow = new THREE.Mesh(T(new THREE.CircleGeometry(0.12, 16)), T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.5 }))); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; scene.add(shadow);
    const TOP = 2.4;
    const C = { x: -AX + 0.25, z: AZ - 0.25, y: TOP, open: 1 };
    type Phase = 'x' | 'z' | 'drop' | 'grab' | 'lift' | 'home' | 'release' | 'over';
    // endless: three lives, and only a miss costs one; the machine restocks when it runs low
    let phase: Phase = 'x', held: Prize | null = null, tries = endless ? 3 : 5, score = 0, wait = 0, tryT = 0, grabbed = false;
    const startTry = () => { phase = 'x'; tryT = 15; C.x = -AX + 0.25; C.z = AZ - 0.25; setHud({ score, tries, phase: 'x', left: 15 }); };
    const release = (axis: 'x' | 'z') => {
      if (phase === 'x' && axis === 'x') { phase = 'z'; setHud((h) => ({ ...h, phase: 'z' })); sfx.blip(2); }
      else if (phase === 'z' && axis === 'z') { phase = 'drop'; setHud((h) => ({ ...h, phase: 'busy' })); sfx.drop(); }
    };
    ctl.current.release = release;
    let raf = 0, last = performance.now(), t = 0;
    const fps = framePacer();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!fps.ready(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000) * MIR.speed; last = now; t += dt;
      if (phase === 'x' || phase === 'z') {
        tryT -= dt;
        if (Math.ceil(tryT) !== Math.ceil(tryT + dt)) setHud((h) => ({ ...h, left: Math.max(0, Math.ceil(tryT)) }));
        if (tryT <= 0) { phase = 'drop'; setHud((h) => ({ ...h, phase: 'busy' })); sfx.drop(); }
        const sp = 0.9;
        if (phase === 'x' && hold.current.x) { C.x = Math.min(AX - 0.15, C.x + sp * dt); if (Math.floor(t * 8) !== Math.floor((t - dt) * 8)) sfx.tick(); }
        if (phase === 'z' && hold.current.z) { C.z = Math.max(-AZ + 0.15, C.z - sp * dt); if (Math.floor(t * 8) !== Math.floor((t - dt) * 8)) sfx.tick(); }
      } else if (phase === 'drop') {
        // down until it touches a prize or the floor
        const under = prizes.filter((p) => !p.gone && Math.hypot(p.x - C.x, p.z - C.z) < p.r + 0.1).sort((a, b) => b.r - a.r)[0];
        const stopY = under ? under.r * 2 + 0.25 : 0.35;
        C.y -= 1.6 * dt; C.open = Math.min(1, C.open + dt * 3);
        if (C.y <= stopY) { C.y = stopY; phase = 'grab'; wait = 0.5; }
      } else if (phase === 'grab') {
        C.open = Math.max(0, C.open - dt * 2.4); wait -= dt;
        if (wait <= 0) {
          // a grab works when the claw is lined up over the prize's middle
          const tgt = prizes.filter((p) => !p.gone).map((p) => ({ p, d: Math.hypot(p.x - C.x, p.z - C.z) })).sort((a, b) => a.d - b.d)[0];
          grabbed = false;
          if (tgt && tgt.d < tgt.p.r * (tgt.p.golden ? 0.5 : 0.75)) { held = tgt.p; held.held = true; grabbed = true; sfx.blip(5); tap(haptics, 'medium'); }
          else { sfx.thud(); }
          phase = 'lift';
        }
      } else if (phase === 'lift') {
        C.y += 1.4 * dt;
        if (C.y >= TOP) { C.y = TOP; phase = 'home'; }
      } else if (phase === 'home') {
        const hx = -AX + 0.25, hz = AZ - 0.25; const d = Math.hypot(hx - C.x, hz - C.z);
        if (d < 0.02) { phase = 'release'; wait = 0.6; }
        else { const s = Math.min(d, 1.2 * dt); C.x += ((hx - C.x) / d) * s; C.z += ((hz - C.z) / d) * s; }
      } else if (phase === 'release') {
        C.open = Math.min(1, C.open + dt * 3); wait -= dt;
        if (held && C.open > 0.5) { held.held = false; held.vy = 0; const p = held; held = null; p.gone = true; setTimeout(() => {
          score += p.pts; if (p.golden) { sfx.jackpot(); pops.add('GOLDEN PRIZE!', '#FFD84D', 50, 18, true); } else sfx.win(5); tap(haptics, 'success'); pops.add(`${p.e} +${p.pts}`, '#FFE14D', 50, 30, true); fx.burst(new THREE.Vector3(C.x, 0.4, C.z), reduce ? 8 : 34, 3.5); setHud((h) => ({ ...h, score }));
        }, 450); }
        if (wait <= 0) {
          if (!endless || !grabbed) tries--;
          if (endless && tries > 0) {
            const left = prizes.filter((p) => !p.gone);
            if (left.length < 6) { for (let i = 0; i < 6; i++) addPrize(false); pops.add('RESTOCKED!', '#22E3FF', 50, 40, true); }
            if (!left.some((p) => p.golden) && grabbed) addPrize(true);
          }
          if (tries <= 0) { phase = 'over'; setHud((h) => ({ ...h, tries: 0, phase: 'busy' })); setTimeout(() => onEnd(score), 1400); }
          else startTry();
        }
      }
      // draw (pulled back to fit a tall phone screen)
      const kf = camera.aspect < 1 ? Math.min(2, 0.78 / camera.aspect) : 1;
      camera.position.set(0, 2.2 + 0.9 * kf, 4.1 * kf); camera.lookAt(0, 0.8, -0.1);
      claw.position.set(C.x, C.y, C.z);
      fingers.forEach((f) => { f.rotation.x = -0.15 - C.open * 0.55; });
      cable.position.set(C.x, (C.y + 3.1) / 2, C.z); cable.scale.y = Math.max(0.05, 3.1 - C.y);
      shadow.position.set(C.x, 0.012, C.z);
      for (const p of prizes) {
        if (p.held) { p.x = C.x; p.z = C.z; p.g.position.set(C.x, C.y - 0.15 - p.r, C.z); if (phase === 'home' && !reduce) p.g.rotation.z = Math.sin(t * 9) * 0.15; }
        else if (p.gone) { p.vy -= 9 * dt; p.g.position.y += p.vy * dt; if (p.g.position.y < -1.5) p.g.visible = false; }
      }
      fx.step(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    startTry();
    return () => { cancelAnimationFrame(raf); dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const btn = (axis: 'x' | 'z', label: string, on: boolean) => (
    <button disabled={!on} data-testid={`arc-claw-${axis}`}
      onPointerDown={(e) => { e.preventDefault(); hold.current[axis] = true; }}
      onPointerUp={() => { if (hold.current[axis]) { hold.current[axis] = false; ctl.current.release(axis); } }}
      onPointerLeave={() => { if (hold.current[axis]) { hold.current[axis] = false; ctl.current.release(axis); } }}
      className={`lv-arc-bigbtn !h-16 !w-16 !text-2xl ${on ? '' : 'opacity-30'}`}>{label}</button>
  );
  return (
    <div className="relative h-full w-full touch-none select-none" data-testid="arc-claw">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <Hud score={hud.score} left={<div className="lv-arc-led"><span className="text-[9px] opacity-70">TIME</span><b>{hud.phase === 'busy' ? '--' : hud.left}</b></div>}
        right={endless ? <Lives n={hud.tries} max={3} /> : <div className="lv-arc-led"><span className="text-[9px] opacity-70">TRIES</span><b>{hud.tries}</b></div>} />
      <div className="absolute inset-x-0 bottom-3 flex items-end justify-center gap-6">
        {btn('x', MIR.x ? '←' : '→', hud.phase === 'x')}
        {btn('z', MIR.y ? '↓' : '↑', hud.phase === 'z')}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-[88px] text-center font-mono text-[11px] font-bold text-white/70">{hud.phase === 'x' ? 'HOLD → TO SLIDE ACROSS' : hud.phase === 'z' ? 'HOLD ↑ TO SEND IT BACK · LET GO TO DROP' : 'GRABBING…'}</div>
      {pops.el}
    </div>
  );
}

export const ARENAS: Record<string, (p: ArenaProps) => React.ReactElement> = { stacker: TowerStacker, cyclone: Cyclone, skeeball: SkeeBall, hoops: HoopShot, bop: BopABot, claw: ClawCrane };
/** Each machine's special bonus, shown on its attract screen. */
export const BONUS: Record<string, string> = {
  stacker: '🟨 Every 7th block is GOLD — land it perfectly for +15. Endless: ULTRA prizes every 10 levels past 30.',
  cyclone: '★ Hit the JACKPOT and win a BONUS SPIN where the jackpot pays double (300)!',
  skeeball: '★ Every third ball is a golden BONUS BALL — double points.',
  hoops: '💵 Every fifth ball is a MONEY BALL worth double. Three in a row and you’re ON FIRE.',
  bop: '⚡ Bop 15 in a row for a FRENZY: 5 seconds of bots everywhere at double points.',
  claw: '⭐ One GOLDEN prize hides in the pile — trickier to grab, worth 250.',
};
/** How endless mode works on each machine. */
export const ENDLESS: Record<string, string> = {
  stacker: 'No top to the tower — keep stacking until you miss.',
  cyclone: 'Spin forever: every 5 you land on costs a life. Three lives.',
  skeeball: 'Roll forever: anything under 20 costs a life. Three lives.',
  hoops: '30 seconds on the clock, +2 for every basket. The hoop speeds up.',
  bop: 'No clock — every bot that gets away (or kitty you bop) costs a life. Five lives.',
  claw: 'Three lives — only a miss costs one. The machine restocks.',
};
export const HOW: Record<string, string> = {
  stacker: 'Tap to drop the sliding block on the tower. Whatever hangs over gets sliced off — land it perfectly to keep it whole. Prize lines at 10, 20 and 30!',
  cyclone: 'A light races round the ring. Hit STOP to land it on the JACKPOT. Seven spins, each one faster.',
  skeeball: 'Flick up to roll. A harder flick lands higher up the board; aim with the angle. The corner pockets are worth 100!',
  hoops: 'Flick basketballs at the hoop — as many as you can in 40 seconds. Three in a row and you’re ON FIRE (double points). The hoop starts moving halfway.',
  bop: 'Bop the robots as they pop up. Golden bots are worth 5. Leave the kittens alone!',
  claw: 'Hold → to slide the claw across, then hold ↑ to send it back. Let go and it drops — line it up right over a prize to grab it. Five goes.',
};
export const PHONE = isPhone();
