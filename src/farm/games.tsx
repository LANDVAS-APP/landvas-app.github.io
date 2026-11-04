// The farm minigames. Each one is quick (35-60 s), easy to pick up, and gets a little harder as it goes.
//  2D: Veggie Catch (move the basket, catch what falls, dodge rocks and bugs)
//      Pest Pop (bonk the pests popping out of the garden, leave the ladybugs and bees alone)
//  3D: Tractor Rush (swipe between lanes, collect crop crates, dodge hay bales)
//      Sheep Round-up (you're the sheepdog: herd the flock into the pen)
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buzz } from '../native/native';

export type ArenaProps = { seed: number; seconds: number; onEnd(score: number): void; haptics?: boolean; reduce?: boolean };
const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const dpr = () => Math.min(2, devicePixelRatio || 1);

/** Score and time along the top. */
function Hud({ score, left, extra }: { score: number; left: number; extra?: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))] text-white">
      <div className="rounded-2xl bg-black/45 px-3 py-1.5 font-display text-2xl font-black tnum backdrop-blur" data-testid="farm-game-score">{score}</div>
      {extra}
      <div className={`rounded-2xl px-3 py-1.5 font-display text-xl font-black tnum backdrop-blur ${left <= 5 ? 'bg-[#FF4D6D]/80' : 'bg-black/45'}`}>{Math.ceil(left)}s</div>
    </div>
  );
}
/** A timer that ends the game once. */
function useClock(seconds: number, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(false);
  useEffect(() => {
    const t0 = performance.now();
    const t = setInterval(() => {
      const l = Math.max(0, seconds - (performance.now() - t0) / 1000);
      setLeft(l);
      if (l <= 0 && !done.current) { done.current = true; clearInterval(t); onEnd(); }
    }, 100);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return left;
}
type Float = { x: number; y: number; text: string; life: number; color: string };
const drawFloats = (g: CanvasRenderingContext2D, fl: Float[], dt: number) => {
  for (let i = fl.length - 1; i >= 0; i--) {
    const f = fl[i]; f.life -= dt; f.y -= 40 * dt; if (f.life <= 0) { fl.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, f.life * 2); g.font = '900 22px ui-rounded, system-ui'; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.strokeText(f.text, f.x, f.y); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y); g.globalAlpha = 1;
  }
};
const emoji = (g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number) => { g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y); };
function sceneryBg(g: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#7FD1FF'); sky.addColorStop(0.7, '#CFF0FF'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 4; i++) { const x = ((t * 12 + i * 260) % (W + 200)) - 100, y = 60 + i * 38; g.beginPath(); g.ellipse(x, y, 46, 16, 0, 0, Math.PI * 2); g.ellipse(x + 30, y - 8, 30, 14, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#8BD16A'; g.beginPath(); g.moveTo(0, H * 0.72); for (let x = 0; x <= W; x += 20) g.lineTo(x, H * 0.72 - Math.sin(x / 90) * 18); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  g.fillStyle = '#6CB84A'; g.fillRect(0, H * 0.82, W, H * 0.18);
}

// ======================================================================================================
// Veggie Catch (2D)
// ======================================================================================================
export function VeggieCatch({ seed, seconds, onEnd, haptics, reduce }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const S = useRef({ score: 0, combo: 0, x: 0.5, keys: 0 });
  const left = useClock(seconds, () => onEnd(S.current.score));
  useEffect(() => {
    const c = cv.current!; const g = c.getContext('2d')!; const r = rng(seed);
    type Item = { x: number; y: number; vy: number; e: string; kind: 'veg' | 'gold' | 'bad'; spin: number };
    const items: Item[] = []; const floats: Float[] = [];
    const VEG = ['🥕', '🍅', '🌽', '🥬', '🍓', '🎃', '🥔', '🍆'], BAD = ['🪨', '🐛', '🥾'];
    let raf = 0, last = performance.now(), t = 0, spawn = 0, shake = 0;
    const move = (e: PointerEvent) => { const b = c.getBoundingClientRect(); S.current.x = Math.max(0.06, Math.min(0.94, (e.clientX - b.left) / b.width)); };
    const kd = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'a') S.current.keys = -1; if (e.key === 'ArrowRight' || e.key === 'd') S.current.keys = 1; };
    const ku = () => { S.current.keys = 0; };
    c.addEventListener('pointermove', move); c.addEventListener('pointerdown', move); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const b = c.getBoundingClientRect(), W = b.width, H = b.height;
      if (c.width !== Math.round(W * dpr())) { c.width = Math.round(W * dpr()); c.height = Math.round(H * dpr()); }
      g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
      S.current.x = Math.max(0.06, Math.min(0.94, S.current.x + S.current.keys * dt * 1.2));
      const level = Math.min(1, t / seconds);
      spawn -= dt;
      if (spawn <= 0) {
        spawn = 0.75 - level * 0.4;
        const roll = r();
        items.push({ x: 0.08 + r() * 0.84, y: -30, vy: 140 + level * 170 + r() * 50, e: roll < 0.07 ? '✨' : roll < 0.27 ? BAD[Math.floor(r() * BAD.length)] : VEG[Math.floor(r() * VEG.length)], kind: roll < 0.07 ? 'gold' : roll < 0.27 ? 'bad' : 'veg', spin: (r() - 0.5) * 4 });
      }
      sceneryBg(g, W, H, t);
      shake = Math.max(0, shake - dt * 4);
      const sx = reduce ? 0 : (Math.random() - 0.5) * shake * 10;
      const bx = S.current.x * W + sx, by = H * 0.86, bw = Math.min(120, W * 0.26);
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.y += it.vy * dt;
        const ix = it.x * W;
        g.save(); g.translate(ix, it.y); g.rotate(t * it.spin); emoji(g, it.kind === 'gold' ? '🌟' : it.e, 0, 0, it.kind === 'gold' ? 44 : 38); g.restore();
        if (it.y > by - 26 && it.y < by + 10 && Math.abs(ix - bx) < bw / 2) {
          items.splice(i, 1);
          if (it.kind === 'bad') { S.current.combo = 0; S.current.score = Math.max(0, S.current.score - 10); floats.push({ x: ix, y: by - 40, text: '−10', life: 0.9, color: '#FF6B6B' }); shake = 1; if (haptics) buzz('warning'); }
          else {
            S.current.combo++;
            const pts = (it.kind === 'gold' ? 25 : 10) + Math.min(10, Math.floor(S.current.combo / 5) * 2);
            S.current.score += pts; floats.push({ x: ix, y: by - 40, text: `+${pts}`, life: 0.9, color: it.kind === 'gold' ? '#FFE36B' : '#ffffff' }); if (haptics) buzz('light');
          }
          setScore(S.current.score); setCombo(S.current.combo);
        } else if (it.y > H + 40) { items.splice(i, 1); if (it.kind !== 'bad') { S.current.combo = 0; setCombo(0); } }
      }
      // the basket
      g.fillStyle = '#B07A47'; g.beginPath(); g.moveTo(bx - bw / 2, by - 18); g.lineTo(bx + bw / 2, by - 18); g.lineTo(bx + bw * 0.4, by + 22); g.lineTo(bx - bw * 0.4, by + 22); g.closePath(); g.fill();
      g.strokeStyle = '#7A5233'; g.lineWidth = 3; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(bx + k * bw * 0.16, by - 18); g.lineTo(bx + k * bw * 0.13, by + 22); g.stroke(); }
      g.strokeStyle = '#7A5233'; g.lineWidth = 5; g.beginPath(); g.ellipse(bx, by - 18, bw / 2, 8, 0, 0, Math.PI * 2); g.stroke();
      drawFloats(g, floats, dt);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointermove', move); c.removeEventListener('pointerdown', move); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 select-none" data-testid="farm-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" />
      <Hud score={score} left={left} extra={combo >= 5 ? <div className="rounded-full bg-[#FFC93D] px-3 py-1 text-sm font-black text-black">🔥 {combo} in a row</div> : null} />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-bold text-white/90 drop-shadow">Slide to move the basket · catch veggies, dodge rocks and bugs</div>
    </div>
  );
}

// ======================================================================================================
// Pest Pop (2D)
// ======================================================================================================
export function PestPop({ seed, seconds, onEnd, haptics, reduce }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const S = useRef({ score: 0, combo: 0 });
  const left = useClock(seconds, () => onEnd(S.current.score));
  useEffect(() => {
    const c = cv.current!; const g = c.getContext('2d')!; const r = rng(seed);
    type Hole = { up: number; e: string; kind: 'pest' | 'gold' | 'friend'; t: number; hit: number };
    const holes: Hole[] = Array.from({ length: 9 }, () => ({ up: 0, e: '', kind: 'pest', t: 0, hit: 0 }));
    const floats: Float[] = []; const PESTS = ['🐛', '🐌', '🐀', '🦗'], FRIENDS = ['🐞', '🐝'];
    let raf = 0, last = performance.now(), t = 0, spawn = 0;
    const layout = () => { const b = c.getBoundingClientRect(); const W = b.width, H = b.height; const size = Math.min(W * 0.3, (H - 220) / 3.2); const x0 = W / 2 - size * 1.5, y0 = H * 0.32; return { W, H, size, x0, y0 }; };
    const down = (e: PointerEvent) => {
      const b = c.getBoundingClientRect(); const { size, x0, y0 } = layout(); const px = e.clientX - b.left, py = e.clientY - b.top;
      const i = Math.floor((px - x0) / size), j = Math.floor((py - y0) / size); if (i < 0 || i > 2 || j < 0 || j > 2) return;
      const h = holes[j * 3 + i]; if (h.up <= 0.3 || h.hit) return;
      h.hit = 0.35;
      const cx = x0 + (i + 0.5) * size, cy = y0 + (j + 0.4) * size;
      if (h.kind === 'friend') { S.current.combo = 0; S.current.score = Math.max(0, S.current.score - 15); floats.push({ x: cx, y: cy, text: 'Oops! −15', life: 1, color: '#FF6B6B' }); if (haptics) buzz('warning'); }
      else { S.current.combo++; const pts = (h.kind === 'gold' ? 30 : 10) + Math.min(10, S.current.combo); S.current.score += pts; floats.push({ x: cx, y: cy, text: `+${pts}`, life: 0.9, color: h.kind === 'gold' ? '#FFE36B' : '#fff' }); if (haptics) buzz('light'); }
      setScore(S.current.score);
    };
    c.addEventListener('pointerdown', down);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const { W, H, size, x0, y0 } = layout();
      if (c.width !== Math.round(W * dpr())) { c.width = Math.round(W * dpr()); c.height = Math.round(H * dpr()); }
      g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
      const level = Math.min(1, t / seconds);
      spawn -= dt;
      if (spawn <= 0) {
        spawn = 0.7 - level * 0.38;
        const free = holes.filter((h) => h.up <= 0 && h.t <= 0);
        if (free.length) { const h = free[Math.floor(r() * free.length)]; const roll = r(); h.kind = roll < 0.08 ? 'gold' : roll < 0.3 ? 'friend' : 'pest'; h.e = h.kind === 'gold' ? '🪲' : h.kind === 'friend' ? FRIENDS[Math.floor(r() * 2)] : PESTS[Math.floor(r() * PESTS.length)]; h.t = 1.3 - level * 0.55; h.hit = 0; }
      }
      // the garden
      g.fillStyle = '#7CC95A'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 40; k++) { g.fillRect((k * 97) % W, (k * 53) % H, 3, 9); }
      g.fillStyle = '#5DA344'; g.beginPath(); g.roundRect(x0 - 14, y0 - 14, size * 3 + 28, size * 3 + 28, 28); g.fill();
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const h = holes[j * 3 + i]; const cx = x0 + (i + 0.5) * size, cy = y0 + (j + 0.62) * size;
        if (h.t > 0) { h.t -= dt; h.up = Math.min(1, h.up + dt * 8); } else h.up = Math.max(0, h.up - dt * 7);
        if (h.hit) { h.hit = Math.max(0, h.hit - dt); if (!h.hit) h.t = 0; }
        // soil hole
        g.fillStyle = '#5A3A22'; g.beginPath(); g.ellipse(cx, cy, size * 0.36, size * 0.14, 0, 0, Math.PI * 2); g.fill();
        if (h.up > 0) {
          g.save(); g.beginPath(); g.rect(cx - size / 2, cy - size, size, size); g.clip();
          const y = cy + (1 - h.up) * size * 0.5 - size * 0.16 + (h.hit && !reduce ? Math.sin(h.hit * 40) * 4 : 0);
          emoji(g, h.hit ? (h.kind === 'friend' ? '😵' : '💥') : h.e, cx, y, size * 0.52); g.restore();
        }
        g.fillStyle = '#3E2716'; g.beginPath(); g.ellipse(cx, cy + size * 0.03, size * 0.37, size * 0.08, 0, 0, Math.PI); g.fill();
        emoji(g, '🥬', cx - size * 0.4, cy - size * 0.1, size * 0.22);
      }
      drawFloats(g, floats, dt);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointerdown', down); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 select-none" data-testid="farm-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" />
      <Hud score={score} left={left} />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm font-bold text-white drop-shadow">Tap the pests 🐛🐌 · leave the friends alone 🐞🐝 · 🪲 is a golden bonus</div>
    </div>
  );
}

// ======================================================================================================
// 3D helpers
// ======================================================================================================
function three(c: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: !/Mobi|Android/i.test(navigator.userAgent) });
  renderer.setPixelRatio(dpr()); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#8FD3FF'); scene.fog = new THREE.Fog('#8FD3FF', 40, 120);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight('#ffffff', '#4E7A33', 0.9));
  const sun = new THREE.DirectionalLight('#FFF2D6', 1.4); sun.position.set(10, 20, 8); scene.add(sun);
  const disposables: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { disposables.push(x); return x; };
  const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o }));
  const resize = () => { const b = c.getBoundingClientRect(); renderer.setSize(Math.max(1, b.width), Math.max(1, b.height), false); camera.aspect = Math.max(1, b.width) / Math.max(1, b.height); camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(c); resize();
  const sprite = (e: string, size: number) => {
    const cc = document.createElement('canvas'); cc.width = cc.height = 128; const g = cc.getContext('2d')!; emoji(g, e, 64, 70, 100);
    const t = T(new THREE.CanvasTexture(cc)); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true }))); s.scale.setScalar(size); return s;
  };
  return { renderer, scene, camera, T, mat, sprite, dispose() { ro.disconnect(); for (const d of disposables) d.dispose(); renderer.dispose(); } };
}

// ======================================================================================================
// Tractor Rush (3D)
// ======================================================================================================
export function TractorRush({ seed, seconds, onEnd, haptics, reduce }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const S = useRef({ score: 0, lane: 0 });
  const left = useClock(seconds, () => onEnd(S.current.score));
  useEffect(() => {
    const c = cv.current!; const k = three(c); const r = rng(seed);
    const { scene, camera, mat, T } = k;
    const LANE = 2.6;
    // the road through the fields
    const ground = new THREE.Mesh(T(new THREE.PlaneGeometry(200, 400)), mat('#6CB84A')); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const road = new THREE.Mesh(T(new THREE.PlaneGeometry(LANE * 3 + 1, 400)), mat('#B8936A')); road.rotation.x = -Math.PI / 2; road.position.y = 0.01; scene.add(road);
    const stripeGeo = T(new THREE.PlaneGeometry(0.12, 2)), stripeMat = mat('#E9D9B6');
    const stripes: THREE.Mesh[] = [];
    for (let z = 0; z < 60; z++) for (const x of [-LANE / 2, LANE / 2]) { const s = new THREE.Mesh(stripeGeo, stripeMat); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, -z * 4); scene.add(s); stripes.push(s); }
    // crop rows either side
    const rowGeo = T(new THREE.ConeGeometry(0.5, 1.4, 5)), rowMat = mat('#3E9A44'), cornGeo = T(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 5)), cornMat = mat('#C9D64A');
    const side = new THREE.InstancedMesh(rowGeo, rowMat, 400), corn = new THREE.InstancedMesh(cornGeo, cornMat, 200); scene.add(side, corn);
    const o3 = new THREE.Object3D();
    for (let i = 0; i < 400; i++) { const sgn = i % 2 ? 1 : -1; o3.position.set(sgn * (6 + (i % 8) * 1.4), 0.7, -Math.floor(i / 2) * 1.6); o3.updateMatrix(); side.setMatrixAt(i, o3.matrix); }
    for (let i = 0; i < 200; i++) { const sgn = i % 2 ? 1 : -1; o3.position.set(sgn * (5.2), 1.1, -i * 2); o3.updateMatrix(); corn.setMatrixAt(i, o3.matrix); }
    // the tractor
    const tractor = new THREE.Group();
    const body = new THREE.Mesh(T(new THREE.BoxGeometry(1.4, 0.9, 2.2)), mat('#2E9E4E')); body.position.y = 1; tractor.add(body);
    const cab = new THREE.Mesh(T(new THREE.BoxGeometry(1.2, 1, 1)), mat('#2E9E4E')); cab.position.set(0, 1.9, 0.5); tractor.add(cab);
    const glass = new THREE.Mesh(T(new THREE.BoxGeometry(1.25, 0.6, 0.9)), mat('#9FE3FF', { roughness: 0.2 })); glass.position.set(0, 2, 0.5); tractor.add(glass);
    const wheelG = T(new THREE.CylinderGeometry(0.65, 0.65, 0.4, 14)), tyre = mat('#2A2E38');
    const wheels: THREE.Mesh[] = [];
    for (const [x, z, s] of [[-0.85, 0.6, 1.2], [0.85, 0.6, 1.2], [-0.8, -0.8, 0.75], [0.8, -0.8, 0.75]] as const) { const w = new THREE.Mesh(wheelG, tyre); w.rotation.z = Math.PI / 2; w.scale.set(s, 1, s); w.position.set(x, 0.65 * s, z); tractor.add(w); wheels.push(w); }
    const pipe = new THREE.Mesh(T(new THREE.CylinderGeometry(0.08, 0.08, 0.8)), mat('#555')); pipe.position.set(0.4, 1.8, -0.7); tractor.add(pipe);
    scene.add(tractor);
    // things on the road
    type Thing = { g: THREE.Object3D; lane: number; z: number; kind: 'crate' | 'gold' | 'bale' | 'rock' };
    const things: Thing[] = [];
    const crateG = T(new THREE.BoxGeometry(1.1, 0.8, 1.1)), crateM = mat('#C99A5B'), baleG = T(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 14)), baleM = mat('#E8C55A'), rockG = T(new THREE.DodecahedronGeometry(0.8)), rockM = mat('#8E877B');
    const CROPS = ['🥕', '🌽', '🍅', '🥬', '🍓', '🎃'];
    const spawn = (z: number) => {
      const roll = r(), lane = Math.floor(r() * 3) - 1;
      const kind: Thing['kind'] = roll < 0.08 ? 'gold' : roll < 0.58 ? 'crate' : roll < 0.82 ? 'bale' : 'rock';
      const g = new THREE.Group();
      if (kind === 'crate' || kind === 'gold') { const b = new THREE.Mesh(crateG, kind === 'gold' ? mat('#FFD23F', { emissive: '#FFB020', emissiveIntensity: 0.6 }) : crateM); b.position.y = 0.4; g.add(b); const s = k.sprite(kind === 'gold' ? '🌟' : CROPS[Math.floor(r() * CROPS.length)], 1.1); s.position.y = 1.4; g.add(s); }
      else if (kind === 'bale') { const b = new THREE.Mesh(baleG, baleM); b.rotation.z = Math.PI / 2; b.position.y = 0.9; g.add(b); }
      else { const b = new THREE.Mesh(rockG, rockM); b.position.y = 0.5; g.add(b); }
      g.position.set(lane * LANE, 0, z); scene.add(g); things.push({ g, lane, z, kind });
    };
    for (let z = -30; z > -110; z -= 9) spawn(z);
    let raf = 0, last = performance.now(), t = 0, speed = 14, dist = 0, nextSpawn = -110, slow = 0, x = 0, tilt = 0;
    const floats: { s: THREE.Sprite; life: number }[] = [];
    const go = (d: number) => { S.current.lane = Math.max(-1, Math.min(1, S.current.lane + d)); };
    const kd = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'a') go(-1); if (e.key === 'ArrowRight' || e.key === 'd') go(1); };
    let sx0: number | null = null;
    const pd = (e: PointerEvent) => { sx0 = e.clientX; };
    const pu = (e: PointerEvent) => {
      if (sx0 == null) return; const dx = e.clientX - sx0; sx0 = null;
      if (Math.abs(dx) > 25) go(dx > 0 ? 1 : -1);
      else { const b = c.getBoundingClientRect(); go(e.clientX - b.left < b.width / 2 ? -1 : 1); }
    };
    window.addEventListener('keydown', kd); c.addEventListener('pointerdown', pd); c.addEventListener('pointerup', pu);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const level = Math.min(1, t / seconds);
      slow = Math.max(0, slow - dt);
      const v = (14 + level * 16) * (slow > 0 ? 0.45 : 1); speed = v;
      dist += v * dt;
      // you
      const want = S.current.lane * LANE; const px = x; x += (want - x) * Math.min(1, dt * 10); tilt = (x - px) * -3;
      tractor.position.set(x, reduce ? 0 : Math.abs(Math.sin(t * 18)) * 0.05, -dist); tractor.rotation.z = tilt; tractor.rotation.y = 0;
      wheels.forEach((w) => { w.rotation.x += v * dt; });
      camera.position.set(x * 0.5, 7.5, -dist + 13); camera.lookAt(x * 0.7, 0.5, -dist - 10);
      // the road keeps coming
      while (nextSpawn > -dist - 110) { spawn(nextSpawn); nextSpawn -= Math.max(5, 9 - level * 4) * (0.8 + r() * 0.5); }
      stripes.forEach((s) => { if (s.position.z > -dist + 12) s.position.z -= 240; });
      if (side.position.z > -dist + 30 - 320) { /* rows repeat */ }
      side.position.z = Math.floor(dist / 320) * -320; corn.position.z = Math.floor(dist / 400) * -400;
      for (let i = things.length - 1; i >= 0; i--) {
        const th = things[i];
        if (th.kind === 'crate' || th.kind === 'gold') th.g.rotation.y += dt * 1.5;
        const dz = th.z - -dist;
        if (Math.abs(dz) < 1.4 && Math.abs(th.lane * LANE - x) < 1.3) {
          scene.remove(th.g); things.splice(i, 1);
          const good = th.kind === 'crate' || th.kind === 'gold';
          const pts = th.kind === 'gold' ? 30 : good ? 10 : -15;
          S.current.score = Math.max(0, S.current.score + pts); setScore(S.current.score);
          const s = k.sprite(good ? (th.kind === 'gold' ? '🌟' : '+10') : '💥', 1.4); s.position.set(x, 3, -dist); scene.add(s); floats.push({ s, life: 0.8 });
          if (!good) { slow = 0.9; if (haptics) buzz('warning'); } else if (haptics) buzz('light');
        } else if (dz > 8) { scene.remove(th.g); things.splice(i, 1); }
      }
      for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.life -= dt; f.s.position.y += dt * 3; f.s.position.z = -dist; if (f.life <= 0) { scene.remove(f.s); floats.splice(i, 1); } }
      void speed;
      k.renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); c.removeEventListener('pointerdown', pd); c.removeEventListener('pointerup', pu); side.dispose(); corn.dispose(); k.dispose(); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 select-none" data-testid="farm-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" />
      <Hud score={score} left={left} />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm font-bold text-white drop-shadow">Swipe or tap left/right to change lanes · grab crates, dodge bales</div>
    </div>
  );
}

// ======================================================================================================
// Sheep Round-up (3D)
// ======================================================================================================
export function SheepRoundup({ seed, seconds, onEnd, haptics }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [penned, setPenned] = useState(0);
  const S = useRef({ score: 0, penned: 0, aim: null as THREE.Vector3 | null, keys: { x: 0, z: 0 } });
  const left = useClock(seconds, () => onEnd(S.current.score));
  useEffect(() => {
    const c = cv.current!; const k = three(c); const r = rng(seed);
    const { scene, camera, mat, T } = k;
    const FIELD = 16; // half-size
    const ground = new THREE.Mesh(T(new THREE.PlaneGeometry(120, 120)), mat('#7CC95A', { flatShading: false })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    // the pen in the top-left corner, gate facing the field
    const PEN = new THREE.Vector3(-FIELD + 4.5, 0, -FIELD + 4.5), PR = 4;
    const wood = mat('#B07A47'), postG = T(new THREE.BoxGeometry(0.2, 1.1, 0.2)), railG = T(new THREE.BoxGeometry(1, 0.1, 0.1));
    const penFloor = new THREE.Mesh(T(new THREE.PlaneGeometry(PR * 2, PR * 2)), mat('#D9C27A')); penFloor.rotation.x = -Math.PI / 2; penFloor.position.set(PEN.x, 0.02, PEN.z); scene.add(penFloor);
    const fenceLine = (x0: number, z0: number, x1: number, z1: number) => {
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0));
      for (let i = 0; i <= n; i++) { const p = new THREE.Mesh(postG, wood); p.position.set(x0 + ((x1 - x0) * i) / n, 0.55, z0 + ((z1 - z0) * i) / n); scene.add(p); }
      for (const y of [0.45, 0.85]) { const rr = new THREE.Mesh(railG, wood); rr.scale.x = Math.hypot(x1 - x0, z1 - z0); rr.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); rr.rotation.y = -Math.atan2(z1 - z0, x1 - x0); scene.add(rr); }
    };
    fenceLine(PEN.x - PR, PEN.z - PR, PEN.x + PR, PEN.z - PR); fenceLine(PEN.x - PR, PEN.z - PR, PEN.x - PR, PEN.z + PR);
    fenceLine(PEN.x + PR, PEN.z - PR, PEN.x + PR, PEN.z - 0.8); fenceLine(PEN.x - PR, PEN.z + PR, PEN.x - 0.8, PEN.z + PR); // gaps: the gates
    const flag = k.sprite('🏁', 1.6); flag.position.set(PEN.x + PR * 0.2, 2.4, PEN.z + PR * 0.2); scene.add(flag);
    // trees round the edge
    const crown = T(new THREE.IcosahedronGeometry(1.5, 0)), leaf = mat('#3E9A44');
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; const t = new THREE.Mesh(crown, leaf); t.position.set(Math.cos(a) * (FIELD + 5 + r() * 6), 2, Math.sin(a) * (FIELD + 5 + r() * 6)); scene.add(t); }
    // the dog (you)
    const dog = new THREE.Group();
    const fur = mat('#8D5A34'), white = mat('#F5EFE6');
    const db = new THREE.Mesh(T(new THREE.CapsuleGeometry(0.35, 0.8, 4, 8)), fur); db.rotation.x = Math.PI / 2; db.position.y = 0.55; dog.add(db);
    const dh = new THREE.Mesh(T(new THREE.SphereGeometry(0.32, 10, 8)), fur); dh.position.set(0, 0.85, 0.6); dog.add(dh);
    const sn = new THREE.Mesh(T(new THREE.SphereGeometry(0.15, 8, 6)), white); sn.position.set(0, 0.8, 0.88); dog.add(sn);
    for (const sx of [-0.18, 0.18]) { const ear = new THREE.Mesh(T(new THREE.ConeGeometry(0.1, 0.25, 4)), fur); ear.position.set(sx, 1.1, 0.55); dog.add(ear); }
    dog.position.set(FIELD - 3, 0, FIELD - 3); scene.add(dog);
    // the flock
    type Sheep = { g: THREE.Group; v: THREE.Vector3; penned: boolean; wander: number };
    const sheep: Sheep[] = [];
    const wool = mat('#F6F3EA'), face = mat('#3B3B3B');
    const woolG = T(new THREE.IcosahedronGeometry(0.6, 1)), faceG = T(new THREE.SphereGeometry(0.25, 8, 6)), legG = T(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 5));
    const flock = (n: number) => {
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group(); const b = new THREE.Mesh(woolG, wool); b.position.y = 0.75; g.add(b); const f = new THREE.Mesh(faceG, face); f.position.set(0, 0.8, 0.55); g.add(f);
        for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const l = new THREE.Mesh(legG, face); l.position.set(x, 0.2, z); g.add(l); }
        g.position.set((r() - 0.2) * FIELD, 0, (r() - 0.2) * FIELD); scene.add(g); sheep.push({ g, v: new THREE.Vector3(), penned: false, wander: r() * 3 });
      }
    };
    flock(6);
    // controls: hold anywhere on the field and the dog runs there; or keys
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    let holding = false;
    const aim = (e: PointerEvent) => { const b = c.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (ray.ray.intersectPlane(plane, hit)) S.current.aim = hit.clone(); };
    const pd = (e: PointerEvent) => { holding = true; c.setPointerCapture(e.pointerId); aim(e); };
    const pm = (e: PointerEvent) => { if (holding) aim(e); };
    const pu = () => { holding = false; S.current.aim = null; };
    const keys = (e: KeyboardEvent, on: boolean) => { const v = on ? 1 : 0; if (e.key === 'ArrowLeft' || e.key === 'a') S.current.keys.x = -v; if (e.key === 'ArrowRight' || e.key === 'd') S.current.keys.x = v; if (e.key === 'ArrowUp' || e.key === 'w') S.current.keys.z = -v; if (e.key === 'ArrowDown' || e.key === 's') S.current.keys.z = v; };
    const kd = (e: KeyboardEvent) => keys(e, true), ku = (e: KeyboardEvent) => keys(e, false);
    c.addEventListener('pointerdown', pd); c.addEventListener('pointermove', pm); c.addEventListener('pointerup', pu); c.addEventListener('pointercancel', pu); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const pops: { s: THREE.Sprite; life: number }[] = [];
    let raf = 0, last = performance.now(), t = 0, run = 0;
    const tmp = new THREE.Vector3();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      // the dog runs where you point
      const want = new THREE.Vector3();
      if (S.current.aim) want.copy(S.current.aim).sub(dog.position).setY(0);
      else want.set(S.current.keys.x, 0, S.current.keys.z).multiplyScalar(10);
      if (want.length() > 0.3) { const sp = Math.min(want.length() * 3, 9); want.normalize(); dog.position.addScaledVector(want, sp * dt); dog.rotation.y = Math.atan2(want.x, want.z); run += dt * 16; dog.position.y = Math.abs(Math.sin(run)) * 0.15; }
      dog.position.x = Math.max(-FIELD, Math.min(FIELD, dog.position.x)); dog.position.z = Math.max(-FIELD, Math.min(FIELD, dog.position.z));
      // sheep: wander, flee the dog, bunch up a little, stay in the field
      for (const s of sheep) {
        if (s.penned) { s.g.rotation.y += dt * 0.3; continue; }
        const away = tmp.copy(s.g.position).sub(dog.position).setY(0); const d = away.length();
        const steer = new THREE.Vector3();
        if (d < 5.5) steer.add(away.normalize().multiplyScalar((5.5 - d) * 2.4));
        s.wander -= dt; if (s.wander <= 0) { s.wander = 1 + r() * 2.5; s.v.add(new THREE.Vector3((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2)); }
        // gently drawn towards the pen's open gates when the dog is pushing (keeps it easy)
        if (d < 5.5) steer.add(tmp.copy(PEN).sub(s.g.position).setY(0).normalize().multiplyScalar(0.8));
        s.v.add(steer.multiplyScalar(dt)); s.v.multiplyScalar(0.94); if (s.v.length() > 6) s.v.setLength(6);
        s.g.position.addScaledVector(s.v, dt);
        s.g.position.x = Math.max(-FIELD, Math.min(FIELD, s.g.position.x)); s.g.position.z = Math.max(-FIELD, Math.min(FIELD, s.g.position.z));
        if (s.v.length() > 0.3) { s.g.rotation.y = Math.atan2(s.v.x, s.v.z); s.g.position.y = Math.abs(Math.sin(t * 12 + s.wander)) * 0.08; }
        // in the pen?
        if (Math.abs(s.g.position.x - PEN.x) < PR - 0.6 && Math.abs(s.g.position.z - PEN.z) < PR - 0.6) {
          s.penned = true; s.v.set(0, 0, 0); S.current.penned++; S.current.score += 25; setScore(S.current.score); setPenned(S.current.penned);
          const p = k.sprite('+25', 1.6); p.position.copy(s.g.position).setY(2.5); scene.add(p); pops.push({ s: p, life: 1 }); if (haptics) buzz('success');
          if (sheep.every((x) => x.penned)) {
            S.current.score += 30; setScore(S.current.score);
            const b = k.sprite('🎉', 2.4); b.position.copy(PEN).setY(3.5); scene.add(b); pops.push({ s: b, life: 1.5 });
            for (const x of sheep) scene.remove(x.g); sheep.length = 0; flock(6 + Math.min(4, Math.floor(t / 15)));
          }
        }
      }
      for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.s.position.y += dt * 1.5; if (p.life <= 0) { scene.remove(p.s); pops.splice(i, 1); } }
      flag.position.y = 2.4 + Math.sin(t * 3) * 0.1;
      const up = Math.min(70, 30 / Math.min(1, camera.aspect * 1.3)); camera.position.set(dog.position.x * 0.15 - 3, up, dog.position.z * 0.15 + up * 0.55); camera.lookAt(dog.position.x * 0.15 - 3, 0, dog.position.z * 0.15 - 2);
      k.renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointerdown', pd); c.removeEventListener('pointermove', pm); c.removeEventListener('pointerup', pu); c.removeEventListener('pointercancel', pu); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); k.dispose(); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 select-none" data-testid="farm-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" />
      <Hud score={score} left={left} extra={<div className="rounded-full bg-black/45 px-3 py-1 text-sm font-bold text-white backdrop-blur">🐑 {penned} penned</div>} />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm font-bold text-white drop-shadow">Hold where the dog should run · chase the sheep into the pen 🏁</div>
    </div>
  );
}

export const FARM_ARENAS: Record<string, (p: ArenaProps) => React.ReactElement> = {
  veggie_catch: VeggieCatch, pest_pop: PestPop, tractor: TractorRush, sheep: SheepRoundup,
};
export const FARM_HOW: Record<string, string> = {
  veggie_catch: 'Slide your finger to move the basket. Catch the falling veggies — stars are worth extra — and dodge the rocks, bugs and boots. Catch lots in a row for a bonus.',
  pest_pop: 'Pests keep popping out of the garden: tap them to bonk them away. Don’t tap the ladybugs or bees — they’re helping! The golden beetle is a big bonus.',
  tractor: 'Your tractor drives itself. Swipe (or tap left or right) to change lanes: collect crop crates and golden crates, and dodge the hay bales and rocks.',
  sheep: 'You’re the sheepdog! Hold your finger where you want to run: sheep run away from you, so get behind them and steer them into the pen. Pen the whole flock for a bonus.',
};
