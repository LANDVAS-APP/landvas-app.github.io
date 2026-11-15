// 🦢 The Origami Pocket's paper, in 3D: a square sheet printed with the plot (its rarity's colours, its kind, its name)
// folds itself up crease by crease — corner to corner, in half again, the wings rise, the head bows — into a paper crane
// (a boat, a frog or a lotus as the enchantment grows), flaps, and flies down into the pocket. Unfolding plays it all
// backwards and the sheet lands flat with its creases still glowing. Every fold is a real rotation of the paper's
// vertices about its crease, so the layers stack and catch the light like paper. Paced (CLAUDE.md): it only draws
// while something moves, at most 60 fps, and rests when the page is hidden.
import * as THREE from 'three';
import { framePacer, sceneAntialias, sceneDpr } from '../lib/gfx';

export type FoldShape = 'crane' | 'boat' | 'frog' | 'lotus';
export type FoldOpts = { canvas: HTMLCanvasElement; color: string; color2: string; label: string; emoji: string; shape: FoldShape; shiny?: boolean; reduceMotion?: boolean;
  /** the plot's real drawing, printed on the paper when it loads */ image?: string | null; onImage?: () => void };
export type FoldScene = {
  /** flat → folded (resolves when the figure is made) */
  fold(): Promise<void>;
  /** folded → flat */
  unfold(): Promise<void>;
  /** the folded figure flies to a point on the canvas (CSS px) and shrinks away — into the pocket */
  flyTo(x: number, y: number): Promise<void>;
  /** the folded figure flies in from a point on the canvas (out of the pocket) */
  flyFrom(x: number, y: number): Promise<void>;
  /** jump straight to folded or flat, no animation */
  set(folded: boolean): void;
  resize(): void;
  destroy(): void;
};

type Fold = { a: THREE.Vector3; d: THREE.Vector3; angle: number; side: (p: THREE.Vector3) => boolean; lift: number };
const N = 26;
/** a sheet of paper: N×N squares, each cut into four triangles round its centre, so both diagonals of the sheet run
 *  along triangle edges and the diagonal folds are clean straight creases (a plain plane's triangles would zig-zag) */
function paperGeometry(n: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const corner = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = i / n - 0.5, y = 0.5 - j / n; pos.push(x, y, 0); uv.push(x + 0.5, y + 0.5); }
  const c0 = (n + 1) * (n + 1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n - 0.5, y = 0.5 - (j + 0.5) / n; pos.push(x, y, 0); uv.push(x + 0.5, y + 0.5);
    const c = c0 + j * n + i, tl = corner(i, j), tr = corner(i + 1, j), bl = corner(i, j + 1), br = corner(i + 1, j + 1);
    idx.push(tl, bl, c, bl, br, c, br, tr, c, tr, tl, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function paperTexture(o: FoldOpts, back: boolean) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (back) {
    g.fillStyle = '#FBF5EA'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(150,120,90,0.08)'; g.lineWidth = 1;
    for (let i = 0; i < 260; i++) { const x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 18, y + (rnd() - 0.5) * 18); g.stroke(); }
    g.strokeStyle = 'rgba(170,130,100,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
  } else {
    const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, o.color); gr.addColorStop(1, o.color2);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // a pattern that reads as "a plot": a soft grid and a frame
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo((i * S) / 8, 0); g.lineTo((i * S) / 8, S); g.moveTo(0, (i * S) / 8); g.lineTo(S, (i * S) / 8); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 10; g.strokeRect(18, 18, S - 36, S - 36);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.strokeRect(30, 30, S - 60, S - 60);
    // paper fibres
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    for (let i = 0; i < 400; i++) { const x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 14); g.stroke(); }
    g.font = '200px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(o.emoji, S / 2, S / 2 - 20);
    g.font = '900 38px system-ui'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 8;
    g.fillText(o.label.slice(0, 22), S / 2, S - 92);
    g.shadowBlur = 0;
    if (o.shiny) { g.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 26; i++) { const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 4; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // the plot's own drawing, printed on the front (a frame of paper round it, its name under it)
  if (!back && o.image) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const m = 44;
        g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 14; g.fillStyle = '#fff'; g.fillRect(m - 6, m - 6, S - 2 * m + 12, S - 2 * m + 12); g.restore();
        g.imageSmoothingEnabled = false;
        g.drawImage(img, m, m, S - 2 * m, S - 2 * m);
        g.font = '900 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 10;
        g.fillText(o.label.slice(0, 22), S / 2, S - 70); g.shadowBlur = 0;
        t.needsUpdate = true;
        o.onImage?.();
      } catch { /* a drawing that can't be read stays plain paper */ }
    };
    img.src = o.image;
  }
  t.anisotropy = 4;
  return t;
}

/** where each shape's last folds end, and how it moves once made */
const POSE: Record<FoldShape, { wing: number; head: number }> = {
  crane: { wing: 1.75, head: 1.25 }, boat: { wing: 1.57, head: 0 }, frog: { wing: 2.5, head: 2.1 }, lotus: { wing: 1.0, head: -1.0 },
};

export function createFold(o: FoldOpts): FoldScene {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(sceneDpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, -1.15, 2.6); camera.lookAt(0, -0.08, 0);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2a1420, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1.4, 1.2, 2.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9ec2, 0.9); rim.position.set(1.5, -0.6, -1.4); scene.add(rim);

  const geo = paperGeometry(N);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  const front = paperTexture({ ...o, onImage: () => { if (alive) renderOnce(); } }, false), backTex = paperTexture(o, true);
  const mFront = new THREE.MeshStandardMaterial({ map: front, roughness: 0.82, metalness: 0.02, side: THREE.FrontSide });
  const mBack = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9, metalness: 0, side: THREE.BackSide });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mFront), new THREE.Mesh(geo, mBack));
  group.rotation.x = -0.35;
  scene.add(group);
  // a soft shadow under the paper
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.set(0, -0.12, -0.22); shadow.rotation.x = -0.35; scene.add(shadow);

  const pose = POSE[o.shape];
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const s2 = Math.SQRT1_2;
  const folds: Fold[] = [
    // corner to corner (the main diagonal), then in half along the other diagonal
    { a: V(0, 0), d: V(s2, s2), angle: Math.PI * 0.985, side: (p) => p.y > p.x + 1e-6, lift: 0.006 },
    { a: V(0, 0), d: V(s2, -s2), angle: -Math.PI * 0.985, side: (p) => p.x + p.y > 1e-6, lift: 0.012 },
    // the wings rise
    { a: V(-0.16, 0), d: V(0, 1), angle: pose.wing, side: (p) => p.x < -0.16, lift: 0 },
    { a: V(0.16, 0), d: V(0, 1), angle: -pose.wing, side: (p) => p.x > 0.16, lift: 0 },
    // the head bows
    { a: V(0, -0.15), d: V(1, 0), angle: pose.head, side: (p) => p.y > -0.15 && Math.abs(p.x) < 0.16, lift: 0 },
  ];
  // which vertices each fold moves, decided in the paper as it is when that fold comes
  const count = pos.count;
  const masks = folds.map(() => new Uint8Array(count));
  {
    const p = new THREE.Vector3();
    const cur = Float32Array.from(base);
    folds.forEach((f, j) => {
      for (let i = 0; i < count; i++) { p.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]); masks[j][i] = f.side(p) ? 1 : 0; }
      for (let i = 0; i < count; i++) if (masks[j][i]) { p.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]); rot(p, f, f.angle, 1); cur[i * 3] = p.x; cur[i * 3 + 1] = p.y; cur[i * 3 + 2] = p.z; }
    });
  }
  function rot(p: THREE.Vector3, f: Fold, ang: number, k: number) {
    const vx = p.x - f.a.x, vy = p.y - f.a.y, vz = p.z - f.a.z, d = f.d, c = Math.cos(ang), s = Math.sin(ang);
    const dot = d.x * vx + d.y * vy + d.z * vz;
    const cx = d.y * vz - d.z * vy, cy = d.z * vx - d.x * vz, cz = d.x * vy - d.y * vx;
    p.set(f.a.x + vx * c + cx * s + d.x * dot * (1 - c), f.a.y + vy * c + cy * s + d.y * dot * (1 - c), f.a.z + vz * c + cz * s + d.z * dot * (1 - c) + f.lift * k);
  }

  // the fold state: how far each fold has gone (0..1), and an idle wiggle once it's made
  const prog = folds.map(() => 0);
  let flap = 0, made = false, alive = true;
  const tmp = new THREE.Vector3();
  function apply() {
    const arr = pos.array as Float32Array;
    for (let i = 0; i < count; i++) {
      tmp.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      for (let j = 0; j < folds.length; j++) {
        if (!masks[j][i] || prog[j] <= 0) continue;
        const f = folds[j];
        let ang = f.angle * ease(prog[j]);
        if (made && (j === 2 || j === 3)) ang += Math.sign(f.angle) * flap;
        rot(tmp, f, ang, ease(prog[j]));
      }
      arr[i * 3] = tmp.x; arr[i * 3 + 1] = tmp.y; arr[i * 3 + 2] = tmp.z;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  const size = () => {
    const w = o.canvas.clientWidth || 300, h = o.canvas.clientHeight || 225;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  size();

  // ---- the loop: only while something moves ----
  const pace = framePacer();
  type Tween = { from: number; to: number; dur: number; t0: number; set: (v: number) => void; done: () => void };
  let tweens: Tween[] = [];
  let raf = 0, idleOn = false, idleT0 = 0;
  const tick = (now: number) => {
    raf = 0;
    if (!alive) return;
    if (!document.hidden && pace.ready(now)) {
      tweens = tweens.filter((tw) => {
        const k = clamp01((now - tw.t0) / tw.dur);
        tw.set(tw.from + (tw.to - tw.from) * k);
        if (k >= 1) { tw.done(); return false; }
        return true;
      });
      if (idleOn && made && !o.reduceMotion) {
        const t = (now - idleT0) / 1000;
        flap = o.shape === 'crane' ? Math.sin(t * 5) * 0.32 : o.shape === 'frog' ? 0 : Math.sin(t * 2) * 0.1;
        if (o.shape === 'frog') group.position.y = Math.max(0, Math.sin(t * 3.2)) * 0.12;
        if (o.shape === 'boat') group.rotation.z = Math.sin(t * 1.6) * 0.08;
        if (o.shape === 'lotus') group.rotation.z = t * 0.4;
        if (o.shape === 'crane') group.position.y = Math.sin(t * 2.2) * 0.03;
      }
      apply();
      renderer.render(scene, camera);
    }
    if (tweens.length || idleOn) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(tick); };
  const tween = (from: number, to: number, dur: number, set: (v: number) => void, delay = 0) => new Promise<void>((res) => {
    const d = o.reduceMotion ? 1 : dur;
    setTimeout(() => { tweens.push({ from, to, dur: d, t0: performance.now(), set, done: res }); kick(); }, o.reduceMotion ? 0 : delay);
  });
  const renderOnce = () => { apply(); renderer.render(scene, camera); };

  const toScreen = (x: number, y: number) => {
    // a CSS point on the canvas → where it is on the paper's plane
    const r = o.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - 0) / (r.width || 1)) * 2 - 1, -(((y - 0) / (r.height || 1)) * 2 - 1));
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit);
    return hit;
  };

  return {
    async fold() {
      made = false; idleOn = false; flap = 0;
      group.position.set(0, 0, 0); group.rotation.z = 0; group.scale.setScalar(1);
      await tween(0, 1, 620, (v) => { prog[0] = v; });
      await tween(0, 1, 560, (v) => { prog[1] = v; });
      await Promise.all([tween(0, 1, 520, (v) => { prog[2] = v; }), tween(0, 1, 520, (v) => { prog[3] = v; }, 60)]);
      await tween(0, 1, 380, (v) => { prog[4] = v; });
      made = true; idleOn = true; idleT0 = performance.now(); kick();
    },
    async unfold() {
      idleOn = false; made = false; flap = 0; group.position.y = 0; group.rotation.z = 0;
      await tween(1, 0, 340, (v) => { prog[4] = v; });
      await Promise.all([tween(1, 0, 500, (v) => { prog[2] = v; }), tween(1, 0, 500, (v) => { prog[3] = v; }, 50)]);
      await tween(1, 0, 560, (v) => { prog[1] = v; });
      await tween(1, 0, 680, (v) => { prog[0] = v; });
      renderOnce();
    },
    async flyTo(x, y) {
      const to = toScreen(x, y), from = group.position.clone();
      await tween(0, 1, 760, (v) => {
        const e = ease(v);
        group.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e + Math.sin(e * Math.PI) * 0.35, from.z + (to.z - from.z) * e);
        group.scale.setScalar(1 - 0.78 * e); group.rotation.z = -0.6 * e;
      });
      idleOn = false; group.visible = false; renderer.render(scene, camera);
    },
    async flyFrom(x, y) {
      const from = toScreen(x, y);
      group.visible = true; made = true; prog.fill(1); idleOn = true; idleT0 = performance.now();
      await tween(0, 1, 760, (v) => {
        const e = ease(v);
        group.position.set(from.x * (1 - e), from.y * (1 - e) + Math.sin(e * Math.PI) * 0.35, 0);
        group.scale.setScalar(0.22 + 0.78 * e); group.rotation.z = -0.6 * (1 - e);
      });
    },
    set(folded) {
      prog.fill(folded ? 1 : 0); made = folded; group.visible = true; group.position.set(0, 0, 0); group.scale.setScalar(1); group.rotation.z = 0;
      idleOn = folded && !o.reduceMotion; idleT0 = performance.now();
      renderOnce(); if (idleOn) kick();
    },
    resize() { size(); renderOnce(); },
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf);
      geo.dispose(); front.dispose(); backTex.dispose(); mFront.dispose(); mBack.dispose(); shadowTex.dispose(); (shadow.material as THREE.Material).dispose(); shadow.geometry.dispose();
      renderer.dispose();
    },
  };
}
