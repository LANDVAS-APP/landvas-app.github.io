// 🌋 Paintbrawl's big moments in 3D: a GPU particle system (thousands of sparks, flames, snowflakes and dust motes in one
// draw call), little tweens, and the scenes themselves — every cataclysm gets its own: a volcano that bursts up through
// the table and drowns it in lava, an avalanche, a tidal wave, an earthquake that cracks the board, a lightning storm,
// a candy tornado, vines, a rising swamp, a meteor shower, an eclipse and a black hole. Wonders get their own models
// too (a smoking volcano with a countdown, a beanstalk, a mirror-like lake, a toadstool hut, a gumball machine, a storm
// spire, a rift gate). Everything here is visual only — the rules already decided what happens.
import * as THREE from 'three';
import type { Fx, Terrain } from '../shared/brawl/cards';
import type { Side } from '../shared/brawl/engine';

// ---- particles -----------------------------------------------------------------------------------------------------------
type P = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; r: number; g: number; b: number; a: number; grav: number; drag: number; ax?: number; ay?: number; az?: number; ak?: number; sw?: number };
export type Emit = { x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; life?: number; size?: number; grow?: number; color: string | THREE.Color; alpha?: number; gravity?: number; drag?: number; attract?: { x: number; y: number; z: number; k: number; swirl?: number } };
export class Particles {
  readonly points: THREE.Points;
  private list: P[] = [];
  private pos: Float32Array; private col: Float32Array; private siz: Float32Array; private alp: Float32Array;
  private geo: THREE.BufferGeometry; readonly mat: THREE.ShaderMaterial;
  private c = new THREE.Color();
  constructor(private cap: number, tex: THREE.Texture, additive: boolean) {
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.siz = new Float32Array(cap); this.alp = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('tint', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 400 } },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 tint; varying vec3 vC; varying float vA; uniform float scale;\nvoid main(){ vC = tint; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA;\nvoid main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
  }
  get count() { return this.list.length; }
  emit(e: Emit) {
    if (this.list.length >= this.cap) this.list.shift();
    this.c.set(e.color as THREE.ColorRepresentation);
    const life = e.life ?? 1;
    this.list.push({ x: e.x, y: e.y, z: e.z, vx: e.vx ?? 0, vy: e.vy ?? 0, vz: e.vz ?? 0, life, max: life, size: e.size ?? 0.4, grow: e.grow ?? 0, r: this.c.r, g: this.c.g, b: this.c.b, a: e.alpha ?? 1, grav: e.gravity ?? 0, drag: e.drag ?? 0,
      ...(e.attract ? { ax: e.attract.x, ay: e.attract.y, az: e.attract.z, ak: e.attract.k, sw: e.attract.swirl ?? 0 } : {}) });
  }
  update(dt: number, scale: number) {
    this.mat.uniforms.scale.value = scale;
    const L = this.list; let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.life -= dt; if (p.life <= 0) continue;
      if (p.ak !== undefined) { const dx = p.ax! - p.x, dy = p.ay! - p.y, dz = p.az! - p.z; p.vx += dx * p.ak * dt - dz * p.sw! * dt; p.vy += dy * p.ak * dt; p.vz += dz * p.ak * dt + dx * p.sw! * dt; }
      p.vy -= p.grav * dt; if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size = Math.max(0.01, p.size + p.grow * dt);
      const k = p.life / p.max, fade = Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 12 + 0.2);
      L[n++] = p;
      const j = n - 1;
      this.pos[j * 3] = p.x; this.pos[j * 3 + 1] = p.y; this.pos[j * 3 + 2] = p.z;
      this.col[j * 3] = p.r; this.col[j * 3 + 1] = p.g; this.col[j * 3 + 2] = p.b;
      this.siz[j] = p.size; this.alp[j] = p.a * fade;
    }
    L.length = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'tint', 'size', 'alpha']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
  clear() { this.list.length = 0; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ---- what the scenes need from the board ------------------------------------------------------------------------------
export type Ctx = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; phone: boolean; reduce: boolean; me: Side;
  add: Particles; soft: Particles;
  /** get an object's shaders compiled in the background, keeping it hidden until they're ready (no freeze) */
  warm?(o: THREE.Object3D): void;
  tween(dur: number, fn: (k: number, dt: number) => void): Promise<void>;
  wait(ms: number): Promise<void>;
  every(fn: (dt: number, t: number) => boolean | void): void;
  LX(lane: number): number; rowZ(side: Side): number; totemZ(side: Side): number; heroZ(side: Side): number;
  tableW: number; tableD: number;
  shake(n: number): void; cheer(n: number): void;
  mood(m: { dim?: number; sky?: string; flash?: number }): void;
  /** creatures and totems that can be pulled around by a scene */
  unitGroups(side: Side, lane?: number): THREE.Group[];
  totemGroup(side: Side, lane: number): THREE.Group;
  laneTiles(side: Side): THREE.Object3D[];
  bigText(text: string, color: string, sub?: string): void;
  glowTex: THREE.Texture;
};

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  // no mipmaps: building them is most of the cost of putting a new texture on the GPU, and these are only seen briefly
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
};
const R = (a = 1) => (Math.random() - 0.5) * 2 * a;
const ease = (k: number) => 1 - Math.pow(1 - k, 3);
const easeIn = (k: number) => k * k * k;
const disposeTree = (o: THREE.Object3D) => o.traverse((x) => {
  const m = x as THREE.Mesh; if (m.geometry) m.geometry.dispose();
  const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
  for (const mm of mats) { for (const k of ['map', 'emissiveMap', 'alphaMap'] as const) (mm as THREE.MeshStandardMaterial)[k]?.dispose?.(); mm.dispose(); }
});

// ---- shared textures (made once, lazily) --------------------------------------------------------------------------------
let lavaTexs: { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } | null = null;
function lava() {
  if (lavaTexs) return lavaTexs;
  // crust plates (a jittered grid of rounded polygons) with bright molten cracks between them
  const N = 5, cell = 256 / N;
  const plates = Array.from({ length: N * N }, (_, i) => ({ x: (i % N + 0.5 + R(0.3)) * cell, y: (Math.floor(i / N) + 0.5 + R(0.3)) * cell, r: cell * (0.6 + Math.random() * 0.1), rot: Math.random() * 6, k: 6 + Math.floor(Math.random() * 4) }));
  const paint = (g: CanvasRenderingContext2D, glow: boolean) => {
    const bg = g.createLinearGradient(0, 0, 256, 256); bg.addColorStop(0, '#FFB020'); bg.addColorStop(0.5, '#FF5A00'); bg.addColorStop(1, '#FF9A10');
    g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
    for (const pl of plates) for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const gr = g.createRadialGradient(pl.x + dx, pl.y + dy, 2, pl.x + dx, pl.y + dy, pl.r);
      if (glow) { gr.addColorStop(0, '#000000'); gr.addColorStop(0.8, '#000000'); gr.addColorStop(1, '#3A1000'); }
      else { gr.addColorStop(0, '#5A1A08'); gr.addColorStop(0.6, '#3A0C04'); gr.addColorStop(0.92, '#7A1E04'); gr.addColorStop(1, '#E04A08'); }
      g.fillStyle = gr; g.beginPath();
      for (let i = 0; i <= pl.k; i++) { const a = pl.rot + (i / pl.k) * Math.PI * 2, rr = pl.r * (0.8 + Math.abs(Math.sin(i * 7.3 + pl.x)) * 0.25); g.lineTo(pl.x + dx + Math.cos(a) * rr, pl.y + dy + Math.sin(a) * rr); }
      g.fill();
    }
  };
  lavaTexs = { map: canvasTex(256, 256, (g) => paint(g, false), [1.4, 2]), glow: canvasTex(256, 256, (g) => paint(g, true), [1.4, 2]) };
  return lavaTexs;
}
let cloudTex: THREE.CanvasTexture | null = null;
const cloud = () => (cloudTex ??= canvasTex(256, 160, (g) => {
  for (let i = 0; i < 14; i++) { const x = 50 + Math.random() * 156, y = 70 + Math.random() * 40, r = 30 + Math.random() * 34; const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(235,235,245,0.6)'); gr.addColorStop(1, 'rgba(220,220,235,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
}));
let stripeTex: THREE.CanvasTexture | null = null;
const stripes = () => (stripeTex ??= canvasTex(256, 256, (g) => {
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
  const cols = ['#FF4FA8', '#FF9AD0', '#8AE0FF', '#FFE14D'];
  for (let i = -8; i < 16; i++) { g.fillStyle = cols[((i % 4) + 4) % 4]; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 18, 0); g.lineTo(i * 32 + 18 + 120, 256); g.lineTo(i * 32 + 120, 256); g.fill(); }
}, [3, 1]));

// ---- the wonders' models ---------------------------------------------------------------------------------------------------
export type WonderModel = THREE.Group & { userData: { tick?(dt: number, t: number): void; label?: THREE.Sprite; top: number; crater?: THREE.Vector3 } };
export function buildWonder(id: string, labelTex: (s: string) => THREE.Texture, glowTex: THREE.Texture): WonderModel | null {
  const g = new THREE.Group() as WonderModel; g.userData.top = 2;
  const M = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const S = (c: string, p: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...p });
  const glow = (c: string, s: number, y: number) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(s, s, 1); sp.position.y = y; g.add(sp); return sp; };
  switch (id) {
    case 'smolderpeak': {
      const lv = lava();
      const pts = [[1.15, 0], [1.0, 0.35], [0.75, 0.9], [0.5, 1.45], [0.38, 1.7], [0.3, 1.62]].map(([x, y]) => new THREE.Vector2(x, y));
      const rockTex = canvasTex(256, 128, (c) => { c.fillStyle = '#2A1A16'; c.fillRect(0, 0, 256, 128); for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`; c.fillRect(Math.random() * 256, Math.random() * 128, 4, 4); } c.strokeStyle = '#FF6A10'; c.lineWidth = 3; for (let i = 0; i < 9; i++) { c.beginPath(); let x = Math.random() * 256, y = 0; c.moveTo(x, y); while (y < 70 + Math.random() * 50) { x += R(8); y += 6; c.lineTo(x, y); } c.stroke(); } });
      const glowMap = canvasTex(256, 128, (c) => { c.drawImage(rockTex.image as HTMLCanvasElement, 0, 0); const d = c.getImageData(0, 0, 256, 128); for (let i = 0; i < d.data.length; i += 4) if (d.data[i] < 200) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; } c.putImageData(d, 0, 0); });
      M(new THREE.LatheGeometry(pts, 28), S('#ffffff', { map: rockTex, emissiveMap: glowMap, emissive: '#FFFFFF', emissiveIntensity: 1.4, roughness: 0.95, flatShading: true }));
      const pool = M(new THREE.CircleGeometry(0.3, 20), S('#ffffff', { map: lv.map, emissiveMap: lv.glow, emissive: '#ffffff', emissiveIntensity: 1.6 }), 0, 1.6, 0); pool.rotation.x = -Math.PI / 2;
      const gl = glow('#FF7A20', 1.6, 1.75);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('3'), transparent: true, depthWrite: false })); lab.scale.set(1.1, 0.42, 1); lab.position.y = 2.55; g.add(lab); g.userData.label = lab;
      g.userData.top = 1.7; g.userData.crater = new THREE.Vector3(0, 1.7, 0);
      g.userData.tick = (_dt, t) => { gl.material.opacity = 0.6 + Math.sin(t * 5) * 0.25; lv.map.offset.y = t * 0.03; lv.glow.offset.y = t * 0.03; };
      break;
    }
    case 'beanstalk': {
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 14; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.9) * 0.28, i * 0.2, Math.cos(i * 0.9) * 0.28));
      const stalk = M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.11, 7), S('#3FAE4A', { roughness: 0.6 }));
      const leafG = new THREE.SphereGeometry(0.22, 10, 6); const leafM = S('#62D66E', { roughness: 0.5 });
      const leaves: THREE.Mesh[] = [];
      for (let i = 2; i <= 13; i += 2) { const p = pts[i]; const l = M(leafG, leafM, p.x * 2.1, p.y, p.z * 2.1); l.scale.set(1, 0.18, 0.55); l.rotation.y = i; l.rotation.z = 0.4; leaves.push(l); }
      const pod = M(new THREE.SphereGeometry(0.2, 12, 8), S('#FFE14D', { emissive: '#FFB13D', emissiveIntensity: 0.4 }), pts[14].x, 2.85, pts[14].z); pod.scale.y = 1.3;
      g.userData.top = 3;
      g.userData.tick = (_dt, t) => { g.rotation.z = Math.sin(t * 0.9) * 0.05; g.rotation.x = Math.cos(t * 0.7) * 0.04; leaves.forEach((l, i) => { l.rotation.z = 0.4 + Math.sin(t * 2 + i) * 0.15; }); void stalk; };
      break;
    }
    case 'mirrorlake': {
      const water = canvasTex(256, 256, (c) => { const gr = c.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#E8FBFF'); gr.addColorStop(0.5, '#7FD4FF'); gr.addColorStop(1, '#2A7FC0'); c.fillStyle = gr; c.fillRect(0, 0, 256, 256); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(128, 128, 30 + i * 18, 20 + i * 14, 0, 0, Math.PI * 2); c.stroke(); } });
      water.wrapS = water.wrapT = THREE.RepeatWrapping;
      const disc = M(new THREE.CylinderGeometry(1.0, 1.05, 0.08, 36), S('#ffffff', { map: water, emissiveMap: water, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.05, metalness: 0.3 }), 0, 0.04, 0);
      M(new THREE.TorusGeometry(1.03, 0.09, 8, 40), S('#F4FBFF', { roughness: 0.3 }), 0, 0.08, 0).rotation.x = Math.PI / 2;
      const crystalG = new THREE.OctahedronGeometry(0.16, 0), crystalM = S('#BFF4FF', { transparent: true, opacity: 0.85, roughness: 0.05, emissive: '#6FD3FF', emissiveIntensity: 0.6 });
      const cr: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = M(crystalG, crystalM, Math.cos(a) * 1.05, 0.25, Math.sin(a) * 1.05); c.scale.y = 1.8 + (i % 2); cr.push(c); }
      const gl = glow('#9FE6FF', 2.4, 0.3);
      g.userData.top = 0.8;
      g.userData.tick = (_dt, t) => { water.offset.set(Math.sin(t * 0.4) * 0.05, Math.cos(t * 0.3) * 0.05); gl.material.opacity = 0.4 + Math.sin(t * 1.5) * 0.2; disc.rotation.y = t * 0.05; cr.forEach((c, i) => { c.position.y = 0.25 + Math.sin(t * 1.6 + i) * 0.05; }); };
      break;
    }
    case 'toadstoolhut': {
      M(new THREE.CylinderGeometry(0.42, 0.52, 0.95, 18), S('#F0E2C8'), 0, 0.48, 0);
      const spots = canvasTex(256, 128, (c) => { c.fillStyle = '#D0284A'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#FFF4E8'; for (let i = 0; i < 16; i++) { c.beginPath(); c.arc(Math.random() * 256, Math.random() * 100, 6 + Math.random() * 10, 0, Math.PI * 2); c.fill(); } });
      M(new THREE.SphereGeometry(0.95, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), S('#ffffff', { map: spots, roughness: 0.55 }), 0, 0.88, 0).scale.y = 0.75;
      const door = M(new THREE.BoxGeometry(0.28, 0.42, 0.06), S('#5A3A1A'), 0, 0.22, 0.5); door.rotation.y = 0;
      const win = M(new THREE.CircleGeometry(0.1, 14), S('#FFE48A', { emissive: '#FFC040', emissiveIntensity: 1.6 }), 0.24, 0.6, 0.46); win.rotation.y = 0.45;
      const gl = glow('#FFC040', 0.9, 0.6); gl.position.set(0.26, 0.6, 0.55);
      g.userData.top = 1.6;
      g.userData.tick = (_dt, t) => { gl.material.opacity = 0.5 + Math.sin(t * 3) * 0.2 + (Math.random() < 0.02 ? -0.3 : 0); };
      break;
    }
    case 'gumballmachine': {
      M(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 18), S('#E8323C', { roughness: 0.35, metalness: 0.2 }), 0, 0.35, 0);
      M(new THREE.BoxGeometry(0.22, 0.14, 0.06), S('#E8B83A', { metalness: 0.9, roughness: 0.25 }), 0, 0.42, 0.45);
      const glass = M(new THREE.SphereGeometry(0.62, 28, 18), new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.28, roughness: 0.02, metalness: 0, clearcoat: 1 }), 0, 1.25, 0); glass.castShadow = false;
      const ballG = new THREE.SphereGeometry(0.13, 10, 8); const cols = ['#FF4D6D', '#FFE14D', '#3DDC97', '#22B8FF', '#B57BFF', '#FF9F1C'];
      const balls: THREE.Mesh[] = [];
      for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 0.4, y = 0.85 + Math.random() * 0.45; balls.push(M(ballG, S(cols[i % cols.length], { roughness: 0.25 }), Math.cos(a) * r, y, Math.sin(a) * r)); }
      M(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 12), S('#E8323C'), 0, 1.92, 0);
      g.userData.top = 2;
      g.userData.tick = (_dt, t) => { balls.forEach((b, i) => { b.position.y += Math.sin(t * 3 + i) * 0.0008; }); };
      break;
    }
    case 'stormspire': {
      M(new THREE.CylinderGeometry(0.08, 0.38, 2.3, 8), S('#6A6A90', { metalness: 0.7, roughness: 0.35, emissive: '#22E3FF', emissiveIntensity: 0.15 }), 0, 1.15, 0);
      const orb = M(new THREE.SphereGeometry(0.22, 16, 12), S('#BFF8FF', { emissive: '#22E3FF', emissiveIntensity: 2.2 }), 0, 2.45, 0);
      const rings = [0.55, 0.38].map((r, i) => { const m = M(new THREE.TorusGeometry(r, 0.035, 6, 32), S('#22E3FF', { emissive: '#22E3FF', emissiveIntensity: 1.8 }), 0, 1.3 + i * 0.6, 0); m.rotation.x = Math.PI / 2; return m; });
      const gl = glow('#22E3FF', 1.8, 2.45);
      g.userData.top = 2.45; g.userData.crater = new THREE.Vector3(0, 2.45, 0);
      g.userData.tick = (_dt, t) => { rings.forEach((r, i) => { r.rotation.z = t * (i ? -2 : 1.5); r.position.y = (1.3 + i * 0.6) + Math.sin(t * 2 + i) * 0.08; }); gl.material.opacity = 0.5 + (Math.random() < 0.08 ? 0.5 : Math.sin(t * 9) * 0.15); orb.scale.setScalar(1 + Math.sin(t * 6) * 0.08); };
      break;
    }
    case 'riftgate': {
      const ring = M(new THREE.TorusGeometry(0.85, 0.16, 10, 36), S('#7A7290', { roughness: 0.9, flatShading: true }), 0, 1.15, 0); ring.rotation.x = -0.75;
      const swirl = canvasTex(256, 256, (c) => { c.translate(128, 128); for (let i = 0; i < 120; i++) { const a = i * 0.35, r = i * 1.05; c.fillStyle = `hsla(${270 + Math.sin(i) * 40}, 90%, ${50 + (i % 3) * 12}%, 0.85)`; c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, 14 - i * 0.08, 0, Math.PI * 2); c.fill(); } });
      const portal = M(new THREE.CircleGeometry(0.72, 32), new THREE.MeshBasicMaterial({ map: swirl, transparent: true, side: THREE.DoubleSide }), 0, 1.15, 0.01); portal.castShadow = false; portal.rotation.x = -0.75;
      M(new THREE.BoxGeometry(1.9, 0.2, 0.5), S('#5A5268', { flatShading: true }), 0, 0.1, 0);
      const gl = glow('#B57BFF', 2.6, 1.15);
      g.userData.top = 2.1; g.userData.crater = new THREE.Vector3(0, 1.15, 0);
      g.userData.tick = (_dt, t) => { portal.rotation.set(-0.75, 0, -t * 1.6); gl.material.opacity = 0.45 + Math.sin(t * 2.5) * 0.2; void ring; };
      break;
    }
    default: return null;
  }
  return g;
}

// ---- the scenes ---------------------------------------------------------------------------------------------------------
export function makeScenes(c: Ctx) {
  const { scene, add, soft } = c;
  const n = (k: number) => Math.ceil(c.phone ? k * 0.5 : k);
  const other = (s: Side): Side => (s === 0 ? 1 : 0);
  const temp: THREE.Object3D[] = [];
  const put = <O extends THREE.Object3D>(o: O) => { scene.add(o); temp.push(o); if (!(o as unknown as THREE.Light).isLight) c.warm?.(o); return o; };
  const drop = (o: THREE.Object3D) => { scene.remove(o); disposeTree(o); const i = temp.indexOf(o); if (i >= 0) temp.splice(i, 1); };
  // bits of a scene that stay until the end of the move (clouds, cracks, scorch marks), then fade out
  const lingering: { o: THREE.Object3D; fade?: (k: number) => void }[] = [];
  const linger = (o: THREE.Object3D, fade?: (k: number) => void) => { if (!temp.includes(o)) temp.push(o); lingering.push({ o, fade }); };
  const burst = (x: number, y: number, z: number, colors: string[], count: number, speed: number, o: { size?: number; gravity?: number; life?: number; up?: number } = {}) => {
    for (let i = 0; i < n(count); i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7); add.emit({ x, y, z, vx: Math.cos(a) * s, vy: (o.up ?? 0.6) * speed * (0.4 + Math.random()), vz: Math.sin(a) * s, color: colors[i % colors.length], size: (o.size ?? 0.35) * (0.6 + Math.random() * 0.8), gravity: o.gravity ?? 8, life: (o.life ?? 0.8) * (0.6 + Math.random() * 0.6), drag: 0.6 }); }
  };
  const smoke = (x: number, y: number, z: number, count: number, o: { color?: string; size?: number; rise?: number; spread?: number; life?: number } = {}) => {
    for (let i = 0; i < n(count); i++) soft.emit({ x: x + R(o.spread ?? 0.4), y, z: z + R(o.spread ?? 0.4), vx: R(0.6), vy: (o.rise ?? 1.2) * (0.5 + Math.random()), vz: R(0.6), color: o.color ?? '#3A3036', size: (o.size ?? 1.4) * (0.6 + Math.random() * 0.6), grow: 0.9, life: (o.life ?? 2) * (0.7 + Math.random() * 0.5), alpha: 0.55, drag: 0.4 });
  };
  const shockwave = (x: number, y: number, z: number, color: string, to = 5, dur = 0.6) => {
    const m = put(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    void c.tween(dur, (k) => { m.scale.setScalar(0.3 + ease(k) * to * 0.7); (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k) * (1 - k); }).then(() => drop(m));
  };
  // A few lights that are always in the scene (dark until borrowed). Adding or removing a light changes the
  // light count, which makes three.js recompile every material on screen — a long freeze — so scenes borrow these.
  const pool = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight('#ffffff', 0, 30, 1.4); scene.add(l); return { l, busy: false }; });
  const borrowLight = (color: string, distance = 30, decay = 1.4) => {
    const p = pool.find((x) => !x.busy); if (!p) return { l: new THREE.PointLight(color, 0, distance, decay), done() {} };
    p.busy = true; p.l.color.set(color); p.l.distance = distance; p.l.decay = decay; p.l.intensity = 0;
    return { l: p.l, done() { p.l.intensity = 0; p.busy = false; } };
  };
  const flashLight = (x: number, y: number, z: number, color: string, power: number, dur: number) => {
    const b = borrowLight(color); b.l.position.set(x, y, z);
    void c.tween(dur, (k) => { b.l.intensity = power * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.3); }).then(() => b.done());
  };
  const lob = (from: THREE.Vector3, to: THREE.Vector3, dur: number, h: number, mesh: THREE.Object3D, trail: (p: THREE.Vector3) => void) =>
    c.tween(dur, (k) => { mesh.position.lerpVectors(from, to, k); mesh.position.y += Math.sin(k * Math.PI) * h; mesh.rotation.x += 0.2; mesh.rotation.z += 0.13; trail(mesh.position); });
  const sides = (s: Side) => [s, other(s)] as Side[];
  const halfZ = (s: Side) => Math.sign(c.rowZ(s));

  // the projectiles / impacts used inside scenes and by strike events
  const fireball = (r = 0.28) => put(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: '#4A1A08', emissive: '#FF6A10', emissiveIntensity: 2.2, roughness: 0.6, flatShading: true })));
  const fireTrail = (p: THREE.Vector3) => { add.emit({ x: p.x + R(0.1), y: p.y, z: p.z + R(0.1), vx: R(0.4), vy: 0.3, vz: R(0.4), color: Math.random() < 0.5 ? '#FFB020' : '#FF5A10', size: 0.5, grow: -0.4, life: 0.45 }); if (Math.random() < 0.35) soft.emit({ x: p.x, y: p.y, z: p.z, vy: 0.4, color: '#2A2228', size: 0.6, grow: 1, life: 0.9, alpha: 0.5 }); };
  const boom = (x: number, y: number, z: number, big = 1) => {
    burst(x, y, z, ['#FFF0A0', '#FFB020', '#FF5A10', '#FF2A00'], 50 * big, 6 * big, { size: 0.5, gravity: 6, life: 0.7 });
    smoke(x, y, z, 12 * big, { size: 1.6 * big, rise: 1.6 });
    shockwave(x, 0.3, z, '#FF8A30', 4 * big);
    flashLight(x, y + 1, z, '#FF8A30', 60 * big, 0.6);
    c.shake(0.35 * big);
  };

  /** One lightning bolt from the sky (or a spire) to a point: a white-hot core in a blue glow, with forks. */
  async function bolt(from: THREE.Vector3, to: THREE.Vector3) {
    const make = (a: THREE.Vector3, b: THREE.Vector3, segs: number, jag: number) => { const pts = [a.clone()]; for (let i = 1; i < segs; i++) { const p = a.clone().lerp(b, i / segs); p.x += R(jag); p.z += R(jag); p.y += R(jag * 0.3); pts.push(p); } pts.push(b.clone()); return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05); };
    const g = put(new THREE.Group());
    const main = make(from, to, 12, 0.7);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(main, 48, 0.05, 4), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(main, 48, 0.2, 5), new THREE.MeshBasicMaterial({ color: '#7FD8FF', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
    for (let f = 0; f < 2; f++) { const at = main.getPoint(0.3 + Math.random() * 0.4); const end = at.clone().add(new THREE.Vector3(R(2), -1.5 - Math.random() * 1.5, R(2))); g.add(new THREE.Mesh(new THREE.TubeGeometry(make(at, end, 6, 0.4), 20, 0.03, 4), new THREE.MeshBasicMaterial({ color: '#CFF4FF' }))); }
    c.mood({ flash: 1 });
    flashLight(to.x, to.y + 1.5, to.z, '#9FE6FF', 90, 0.45);
    burst(to.x, to.y, to.z, ['#FFFFFF', '#9FE6FF', '#22E3FF'], 36, 5, { size: 0.3, gravity: 9 });
    shockwave(to.x, 0.3, to.z, '#9FE6FF', 3);
    c.shake(0.3);
    await c.tween(0.38, (k) => { g.visible = k > 0.85 ? Math.random() < 0.5 : Math.random() < 0.85; });
    drop(g);
  }
  /** A meteor: a burning rock dropping out of the sky at an angle, then the explosion and a scorch mark. */
  async function meteor(to: THREE.Vector3) {
    const m = fireball(0.42);
    const from = to.clone().add(new THREE.Vector3(R(5) + 4, 13, -5));
    await c.tween(0.55, (k) => { m.position.lerpVectors(from, to, easeIn(k) * 0.4 + k * 0.6); m.rotation.x += 0.3; fireTrail(m.position); fireTrail(m.position); });
    drop(m);
    boom(to.x, 0.6, to.z, 1);
    const scorch = put(new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.55, depthWrite: false })));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(to.x, 0.25, to.z);
    linger(scorch, (k) => { (scorch.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k); });
  }

  // ---- 🌋 Eruption: a volcano bursts up through the middle of the table and drowns the board in lava ----
  async function eruption() {
    c.bigText('ERUPTION!', '#FF7A20', 'The volcano wakes up…');
    const lv = lava();
    // the rumble
    c.mood({ sky: '#3A0A08', dim: 0.8 });
    const tiles = [...c.laneTiles(0), ...c.laneTiles(1)];
    await c.tween(1.0, (k) => { c.shake(0.15 + k * 0.25); tiles.forEach((t, i) => { t.position.y = Math.abs(Math.sin(k * 40 + i)) * 0.06 * k; }); if (Math.random() < 0.5) smoke(R(4), 0.3, R(1.5), 1, { color: '#5A4A40', size: 1 }); });
    // the mountain rises through the midline
    const rockTex = canvasTex(512, 256, (g) => { g.fillStyle = '#2A1814'; g.fillRect(0, 0, 512, 256); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '90,60,50'},${Math.random() * 0.35})`; g.fillRect(Math.random() * 512, Math.random() * 256, 5, 5); } });
    const rivers = canvasTex(512, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#FF7A20'; g.lineCap = 'round'; for (let i = 0; i < 16; i++) { g.lineWidth = 3 + Math.random() * 5; g.beginPath(); let x = Math.random() * 512, y = 0; g.moveTo(x, y); while (y < 120 + Math.random() * 130) { x += R(10); y += 8; g.lineTo(x, y); } g.stroke(); } });
    const prof = [[3.6, 0], [3.1, 0.6], [2.3, 1.5], [1.55, 2.5], [1.1, 3.2], [1.0, 3.45], [0.8, 3.3], [0.5, 2.9]].map(([x, y]) => new THREE.Vector2(x, y));
    const vmat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: rockTex, emissiveMap: rivers, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95, flatShading: true });
    const volcano = put(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), vmat)); volcano.castShadow = true; volcano.position.set(0, -3.8, 0);
    const crater = put(new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshStandardMaterial({ map: lv.map, emissiveMap: lv.glow, emissive: '#ffffff', emissiveIntensity: 2 }))); crater.rotation.x = -Math.PI / 2;
    const cglow = put(new THREE.Sprite(new THREE.SpriteMaterial({ map: c.glowTex, color: '#FF6A10', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))); cglow.scale.set(5, 5, 1);
    const heatL = borrowLight('#FF5A10', 40, 1.2), heat = heatL.l;
    c.cheer(2);
    await c.tween(1.3, (k) => {
      const e = ease(k); volcano.position.y = -3.8 + e * 3.6; crater.position.y = volcano.position.y + 3.25; cglow.position.y = crater.position.y + 0.4; heat.position.y = crater.position.y + 1.5;
      vmat.emissiveIntensity = e * 1.6; heat.intensity = e * 50; c.shake(0.45);
      for (let i = 0; i < 3; i++) soft.emit({ x: R(3.4), y: 0.2, z: R(3.4), vy: 2 + Math.random() * 2, color: '#4A3A34', size: 1.2, grow: 1.2, life: 1.4, alpha: 0.6, drag: 0.3 });
      if (Math.random() < 0.5) add.emit({ x: R(2.5), y: 0.3, z: R(2.5), vx: R(3), vy: 4 + Math.random() * 3, vz: R(3), color: '#7A5A4A', size: 0.3, gravity: 12, life: 1 });
    });
    // KABOOM: the fountain, the smoke column, the lava bombs
    const top = new THREE.Vector3(0, crater.position.y + 0.2, 0);
    boom(0, top.y + 0.5, 0, 1.6);
    c.mood({ flash: 1, sky: '#5A1408' });
    c.cheer(3);
    const bombs: Promise<void>[] = [];
    for (const s of [0, 1] as Side[]) for (let l = 0; l < 4; l++) {
      const to = new THREE.Vector3(c.LX(l) + R(0.4), 0.5, c.rowZ(s) + R(0.5));
      bombs.push(c.wait(100 + Math.random() * 900).then(async () => { const b = fireball(0.3); await lob(top, to, 0.75, 4 + Math.random() * 2, b, fireTrail); drop(b); boom(to.x, 0.5, to.z, 0.6); }));
    }
    await c.tween(1.8, (k) => {
      heat.intensity = 70 + Math.random() * 30; c.shake(0.3);
      for (let i = 0; i < n(9); i++) { const a = Math.random() * Math.PI * 2, s = Math.random() * 2.4; add.emit({ x: top.x + R(0.3), y: top.y, z: top.z + R(0.3), vx: Math.cos(a) * s, vy: 8 + Math.random() * 6, vz: Math.sin(a) * s, color: ['#FFF0A0', '#FFB020', '#FF6A10', '#FF3A00'][i % 4], size: 0.35 + Math.random() * 0.45, gravity: 9, life: 1.6, drag: 0.1 }); }
      if (k < 0.9) smoke(top.x, top.y + 1, top.z, 2, { color: '#2A2028', size: 2.4, rise: 4, spread: 0.6, life: 3 });
    });
    await Promise.all(bombs);
    // the lava floods the table, the creatures sink
    const lavaPlane = put(new THREE.Mesh(new THREE.PlaneGeometry(c.tableW, c.tableD), new THREE.MeshStandardMaterial({ map: lv.map, emissiveMap: lv.glow, emissive: '#ffffff', emissiveIntensity: 1.5, roughness: 0.6 })));
    lavaPlane.rotation.x = -Math.PI / 2; lavaPlane.position.y = -0.2;
    const sinking = [...c.unitGroups(0), ...c.unitGroups(1)], totems = [0, 1, 2, 3].flatMap((l) => [c.totemGroup(0, l), c.totemGroup(1, l)]);
    const y0 = sinking.map((g) => g.position.y);
    let flow = 0;
    const spin = c.every((dt) => { flow += dt; lv.map.offset.set(flow * 0.04, flow * 0.07); lv.glow.offset.copy(lv.map.offset); return temp.includes(lavaPlane); });
    void spin;
    await c.tween(1.4, (k) => {
      lavaPlane.position.y = -0.2 + ease(k) * 1.05;
      sinking.forEach((g, i) => { g.position.y = y0[i] - easeIn(k) * 2.4; g.rotation.z = Math.sin(k * 20 + i) * 0.1 * k; });
      totems.forEach((g) => { g.position.y = 0.36 - easeIn(k) * 2; });
      if (Math.random() < 0.7) add.emit({ x: R(c.tableW / 2), y: lavaPlane.position.y + 0.1, z: R(c.tableD / 2), vy: 1.5 + Math.random(), color: '#FFB020', size: 0.3, gravity: 3, life: 0.8 });
      for (let i = 0; i < 2; i++) smoke(R(c.tableW / 2), lavaPlane.position.y + 0.2, R(c.tableD / 2), 1, { color: '#E8DCD0', size: 1.2, rise: 1.6, life: 1.6 });
      c.shake(0.15);
    });
    // it cools: the mountain sinks back, the lava crusts over and drains, steam everywhere
    c.mood({ sky: '#2A0E0C', dim: 0.9 });
    const lm = lavaPlane.material as THREE.MeshStandardMaterial;
    await c.tween(1.5, (k) => {
      volcano.position.y = -0.2 - easeIn(k) * 3.8; crater.position.y = volcano.position.y + 3.25; cglow.position.y = crater.position.y + 0.4; cglow.material.opacity = 1 - k; vmat.emissiveIntensity = 1.6 * (1 - k); heat.intensity = 70 * (1 - k);
      lm.emissiveIntensity = 1.5 * (1 - k * 0.9); lm.color.setScalar(1 - k * 0.75);
      if (k > 0.5) { lavaPlane.position.y = 0.85 - (k - 0.5) * 2 * 1.1; }
      for (let i = 0; i < n(3); i++) soft.emit({ x: R(c.tableW / 2), y: 0.6, z: R(c.tableD / 2), vy: 1.4 + Math.random(), color: '#F4F0EC', size: 1.4, grow: 1.4, life: 1.6, alpha: 0.4, drag: 0.4 });
    });
    for (const o of [volcano, crater, cglow, lavaPlane]) drop(o); heatL.done();
    totems.forEach((g) => { g.position.y = 0.36; });
    c.mood({});
  }

  // ---- 🏔️ Avalanche: a wall of snow and boulders thunders down the enemy side ----
  async function avalanche(side: Side) {
    const o = other(side), dir = -halfZ(o), far = c.heroZ(o) + halfZ(o) * 2.5;
    c.bigText('AVALANCHE!', '#BFF4FF', 'Snow thunders down…');
    c.mood({ dim: 0.85, sky: '#2A3A5A' });
    const balls: { m: THREE.Mesh; lane: number; spd: number }[] = [];
    const geo = new THREE.IcosahedronGeometry(1, 1); const pos = geo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (1 + R(0.12)), pos.getY(i) * (1 + R(0.12)), pos.getZ(i) * (1 + R(0.12))); geo.computeVertexNormals();
    const snowM = new THREE.MeshStandardMaterial({ color: '#F4FBFF', roughness: 0.9, flatShading: true });
    for (let l = 0; l < 4; l++) for (let k = 0; k < 2; k++) { const m = put(new THREE.Mesh(geo, snowM)); m.castShadow = true; const r = 0.45 + Math.random() * 0.35; m.scale.setScalar(r); m.position.set(c.LX(l) + R(0.5), r, far + halfZ(o) * k * 2.5); balls.push({ m, lane: l, spd: 9 + Math.random() * 3 }); }
    await c.tween(1.9, (k, dt) => {
      c.shake(0.3);
      for (let i = 0; i < n(14); i++) soft.emit({ x: R(c.tableW / 2 + 1), y: 0.3 + Math.random() * 2.5, z: far + R(1), vx: R(1.5), vy: Math.random(), vz: dir * (7 + Math.random() * 5), color: '#FFFFFF', size: 0.5 + Math.random() * 1.1, grow: 0.8, life: 1.3, alpha: 0.85, drag: 0.5 });
      for (const b of balls) {
        if (Math.sign(b.m.position.z) !== halfZ(o) && Math.abs(b.m.position.z) > 0.6) { b.m.visible = false; continue; }
        b.m.position.z += dir * b.spd * dt; b.m.rotation.x += dir * b.spd * dt / b.m.scale.x; b.m.position.y = b.m.scale.x + Math.abs(Math.sin(k * 30 + b.lane)) * 0.15;
        if (Math.abs(b.m.position.z - c.rowZ(o)) < 0.3 && !b.m.userData.hit) { b.m.userData.hit = 1; burst(b.m.position.x, 1, b.m.position.z, ['#FFFFFF', '#BFF4FF'], 30, 4, { size: 0.4, gravity: 6 }); }
      }
    });
    for (const b of balls) drop(b.m);
    // a white-out that settles into frost
    for (let l = 0; l < 4; l++) burst(c.LX(l), 0.6, c.rowZ(o), ['#FFFFFF', '#DDF6FF'], 24, 2.4, { size: 0.5, gravity: 2, life: 1.2 });
    c.mood({});
  }

  // ---- 🌊 Tidal Wave: a curling wall of water crosses the whole board ----
  async function tidalwave(side: Side) {
    c.bigText('TIDAL WAVE!', '#7FD8FF', 'Surf’s up…');
    const water = canvasTex(64, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.1, '#C8F4FF'); gr.addColorStop(0.3, '#4FC8F0'); gr.addColorStop(1, '#0A4A8A'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 64, Math.random() * 40, 3, 2); } });
    const W = c.tableW + 3, H = 4.6;
    const geo = new THREE.PlaneGeometry(W, H, 40, 24); const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), v = (y + H / 2) / H; p.setZ(i, -Math.pow(v, 2.4) * 2.6 - Math.sin(x * 1.1) * 0.2 * v); p.setY(i, y + Math.sin(x * 0.8) * 0.2 * v); }
    geo.computeVertexNormals();
    const wave = put(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: water, transparent: true, opacity: 0.9, side: THREE.DoubleSide, roughness: 0.15, metalness: 0.1, emissive: '#1A6AA0', emissiveIntensity: 0.35, depthWrite: false })));
    const from = c.heroZ(side) + halfZ(side) * 3.5, to = c.heroZ(other(side)) - halfZ(side) * 3.5, dirz = Math.sign(to - from);
    wave.rotation.y = dirz > 0 ? Math.PI : 0;
    const sheet = put(new THREE.Mesh(new THREE.PlaneGeometry(c.tableW, c.tableD), new THREE.MeshStandardMaterial({ color: '#3AA8E0', transparent: true, opacity: 0, roughness: 0.1, emissive: '#1A6AA0', emissiveIntensity: 0.3, depthWrite: false })));
    sheet.rotation.x = -Math.PI / 2; sheet.position.y = 0.3;
    const lifted = new Set<THREE.Group>();
    const all = [...c.unitGroups(0), ...c.unitGroups(1)];
    c.cheer(2);
    await c.tween(2.2, (k) => {
      const z = from + (to - from) * k; wave.position.set(0, H / 2 - 0.3, z);
      const sc = Math.sin(Math.min(1, k * 1.3) * Math.PI * 0.5) * (k > 0.85 ? 1 - (k - 0.85) * 4 : 1); wave.scale.set(1, Math.max(0.05, sc), 1);
      c.shake(0.18);
      for (let i = 0; i < n(10); i++) add.emit({ x: R(W / 2), y: H * sc - 0.4, z: z + dirz * 1.6, vx: R(1), vy: 1.5 + Math.random() * 2, vz: dirz * (2 + Math.random() * 2), color: '#FFFFFF', size: 0.35, gravity: 6, life: 0.8 });
      (sheet.material as THREE.MeshStandardMaterial).opacity = Math.min(0.55, k * 1.2);
      for (const g of all) if ((z - g.position.z) * dirz > 0 && !lifted.has(g)) lifted.add(g);
      for (const g of lifted) { g.position.y += 0.06; g.rotation.y += 0.15; g.position.z += dirz * 0.08; }
    });
    drop(wave);
    await c.tween(0.6, (k) => { (sheet.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - k); });
    drop(sheet);
  }

  // ---- 🪨 Earthquake: the table cracks open, boulders jump, dust everywhere ----
  async function earthquake() {
    c.bigText('EARTHQUAKE!', '#E8C08A', 'The table splits…');
    const cv = document.createElement('canvas'); cv.width = cv.height = c.phone ? 512 : 1024; const g = cv.getContext('2d')!; const S = cv.width;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const cracks: { x: number; y: number }[][] = [];
    const crack = (x: number, y: number, a: number, steps: number, len: number, depth: number) => {
      const pts = [{ x, y }];
      for (let k = 0; k < steps; k++) { const d = a + R(0.9); x += Math.cos(d) * len * (0.6 + Math.random() * 0.8); y += Math.sin(d) * len * (0.6 + Math.random() * 0.8); pts.push({ x, y }); if (depth > 0 && Math.random() < 0.18) crack(x, y, a + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6), Math.ceil(steps * 0.4), len * 0.8, depth - 1); }
      cracks.push(pts);
    };
    for (let i = 0; i < 7; i++) crack(S / 2 + R(S * 0.06), S / 2 + R(S * 0.06), (i / 7) * Math.PI * 2 + R(0.3), 16, S * 0.026, 2);
    const crackM = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const plane = put(new THREE.Mesh(new THREE.PlaneGeometry(c.tableW, c.tableD), crackM)); plane.rotation.x = -Math.PI / 2; plane.position.y = 0.245; plane.renderOrder = 3;
    const draw = (k: number) => {
      g.clearRect(0, 0, S, S); g.lineCap = 'butt'; g.lineJoin = 'miter';
      for (const pts of cracks) { const m = Math.max(1, Math.floor(pts.length * k)); for (const [w, col] of [[S * 0.026, 'rgba(255,110,30,0.3)'], [S * 0.014, 'rgba(14,6,2,0.98)'], [S * 0.004, '#FF9A40']] as const) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < m; i++) g.lineTo(pts[i].x, pts[i].y); g.stroke(); } }
      tex.needsUpdate = true;
    };
    const tiles = [...c.laneTiles(0), ...c.laneTiles(1)];
    const rocks: THREE.Mesh[] = [];
    const rockG = new THREE.DodecahedronGeometry(0.3, 0), rockM = new THREE.MeshStandardMaterial({ color: '#6A5A4A', roughness: 1, flatShading: true });
    let last = 0;
    c.mood({ dim: 0.85 });
    await c.tween(2.2, (k, dt) => {
      c.shake(0.7 * (1 - k * 0.5));
      tiles.forEach((t, i) => { t.position.y = Math.sin(k * 60 + i * 1.7) * 0.12 * (1 - k); t.rotation.z = Math.sin(k * 45 + i) * 0.04 * (1 - k); });
      if (k - last > 0.04) { last = k; draw(Math.min(1, k * 1.5)); }
      if (Math.random() < 0.35 && rocks.length < n(14)) { const r = put(new THREE.Mesh(rockG, rockM)); r.position.set(R(c.tableW / 2 - 0.5), 0.2, R(c.tableD / 2 - 0.5)); r.userData.v = new THREE.Vector3(R(1.5), 5 + Math.random() * 4, R(1.5)); r.scale.setScalar(0.6 + Math.random()); rocks.push(r); smoke(r.position.x, 0.3, r.position.z, 4, { color: '#8A7A64', size: 1.4, rise: 1 }); }
      for (const r of rocks) { const v = r.userData.v as THREE.Vector3; v.y -= 14 * dt; r.position.addScaledVector(v, dt); r.rotation.x += dt * 5; if (r.position.y < 0.25) { r.position.y = 0.25; v.y = Math.abs(v.y) * 0.3; v.x *= 0.6; v.z *= 0.6; } }
      if (Math.random() < 0.6) smoke(R(c.tableW / 2), 0.3, R(c.tableD / 2), 1, { color: '#9A8A74', size: 1.6, rise: 0.8, life: 1.6 });
    });
    tiles.forEach((t) => { t.position.y = 0; t.rotation.z = 0; });
    for (const r of rocks) drop(r);
    linger(plane, (k) => { crackM.opacity = 1 - k; });
    c.mood({});
  }

  // ---- 🌩️ Thunderstorm: clouds gather, the lights go down, rain (the bolts arrive as strike events) ----
  let storm: { clouds: THREE.Sprite[] } | null = null;
  async function thunderstorm() {
    c.bigText('THUNDERSTORM!', '#9FE6FF', 'The sky turns black…');
    c.mood({ dim: 0.35, sky: '#0A0A18' });
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < n(11); i++) { const s = put(new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud(), color: i % 3 ? '#6A6A84' : '#8A8AA4', transparent: true, depthWrite: false, opacity: 0 }))); const w = 3.2 + Math.random() * 2.6; s.scale.set(w, w * 0.6, 1); s.position.set((i % 2 ? 1 : -1) * (12 + Math.random() * 4), 6.5 + Math.random() * 1.5, -7 + (i / 16) * 12 + R(1)); s.userData.x = R(6.5); clouds.push(s); }
    storm = { clouds };
    await c.tween(1.0, (k) => { clouds.forEach((s) => { s.position.x += (s.userData.x - s.position.x) * 0.08; s.material.opacity = Math.min(0.8, k * 1.4); }); });
    c.every((dt) => { if (!storm) return false; for (let i = 0; i < n(6); i++) soft.emit({ x: R(c.tableW / 2 + 2), y: 7, z: R(c.tableD / 2), vy: -16, vx: -1, color: '#9FB8D8', size: 0.12, life: 0.45, alpha: 0.7 }); storm.clouds.forEach((s, i) => { s.position.x += Math.sin(i + performance.now() / 1500) * dt * 0.3; }); return true; });
    linger(new THREE.Group(), (k) => { if (!storm) return; storm.clouds.forEach((s) => { s.material.opacity = 0.95 * (1 - k); }); if (k >= 1) { storm.clouds.forEach(drop); storm = null; } });
  }

  // ---- 🌪️ Candy Cyclone: a striped funnel crosses the enemy row and scoops everything up ----
  async function cyclone(side: Side) {
    const o = other(side);
    c.bigText('CANDY CYCLONE!', '#FF8AC2', 'Hold onto something sweet…');
    const prof: THREE.Vector2[] = []; for (let i = 0; i <= 18; i++) { const y = (i / 18) * 5.5; prof.push(new THREE.Vector2(0.18 + Math.pow(y / 5.5, 1.7) * 2.1, y)); }
    const tex = stripes();
    const mk = (s: number, op: number) => { const m = put(new THREE.Mesh(new THREE.LatheGeometry(prof, 36), new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, emissive: '#FF4FA8', emissiveIntensity: 0.25, roughness: 0.4 }))); m.scale.setScalar(s); return m; };
    const outer = mk(1, 0.72), inner = mk(0.7, 0.85);
    const z = c.rowZ(o);
    const units = c.unitGroups(o);
    const lifted = new Map<THREE.Group, number>();
    c.cheer(2);
    let x = -c.tableW / 2 - 1;
    await c.tween(2.4, (k, dt) => {
      x = -c.tableW / 2 - 1 + k * (c.tableW + 2);
      for (const m of [outer, inner]) { m.position.set(x + Math.sin(k * 20) * 0.3, 0, z); }
      outer.rotation.y += dt * 9; inner.rotation.y -= dt * 12; tex.offset.x -= dt * 0.8;
      c.shake(0.12);
      for (let i = 0; i < n(6); i++) { const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 1.5, y = Math.random() * 5; add.emit({ x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r, vy: 1, color: ['#FF4FA8', '#FFE14D', '#8AE0FF', '#FFFFFF', '#3DDC97'][i % 5], size: 0.28, life: 1, attract: { x, y: y + 1, z, k: 0.5, swirl: 9 } }); }
      for (const g of units) { if (Math.abs(g.position.x - x) < 1.4 && !lifted.has(g)) lifted.set(g, g.position.y); }
      for (const [g] of lifted) { g.position.x += (x - g.position.x) * 0.15; g.position.y = Math.min(4.5, g.position.y + dt * 4); g.rotation.y += dt * 14; }
    });
    drop(outer); drop(inner);
  }

  // ---- 🌿 Overgrowth: vines burst out of the table, flowers open, enemies get tangled ----
  async function overgrowth(side: Side) {
    const o = other(side);
    c.bigText('OVERGROWTH!', '#7BFF8A', 'Nature finds a way…');
    c.mood({ sky: '#0E2A14' });
    const vines: { m: THREE.Mesh; total: number }[] = [];
    const vineM = new THREE.MeshStandardMaterial({ color: '#2F8A3A', roughness: 0.6 });
    const leafG = new THREE.SphereGeometry(0.28, 8, 5), leafM = new THREE.MeshStandardMaterial({ color: '#5FD26A', roughness: 0.5 });
    const leaves: { m: THREE.Mesh; at: number }[] = [];
    const vine = (base: THREE.Vector3, curve: THREE.Curve<THREE.Vector3>, r: number) => {
      const geo = new THREE.TubeGeometry(curve, 80, r, 6); const m = put(new THREE.Mesh(geo, vineM)); m.castShadow = true; m.position.copy(base); geo.setDrawRange(0, 0); vines.push({ m, total: geo.index!.count });
      for (let i = 1; i < 8; i++) { const p = curve.getPoint(i / 8); const l = put(new THREE.Mesh(leafG, leafM)); l.position.copy(base).add(p).add(new THREE.Vector3(R(0.15), 0, R(0.15))); l.scale.set(0.01, 0.01, 0.01); l.rotation.set(Math.random(), Math.random() * 6, 0.6); leaves.push({ m: l, at: i / 8 }); }
    };
    for (let l = 0; l < 4; l++) for (const dx of [-0.95, 0.95]) {
      const pts: THREE.Vector3[] = []; const h = 2.8 + Math.random() * 1.6, ph = Math.random() * 6;
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(Math.sin(t * 7 + ph) * 0.3 * t, t * h, Math.cos(t * 7 + ph) * 0.3 * t + t * t * -halfZ(side) * 0.6)); }
      vine(new THREE.Vector3(c.LX(l) + dx, 0.2, c.rowZ(side) + halfZ(side) * 1.3), new THREE.CatmullRomCurve3(pts), 0.14);
    }
    for (const g of c.unitGroups(o)) {
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 8; pts.push(new THREE.Vector3(Math.cos(a) * 0.75, t * 2.2, Math.sin(a) * 0.75)); }
      vine(g.position.clone().setY(0.25), new THREE.CatmullRomCurve3(pts), 0.1);
    }
    const flowers: THREE.Sprite[] = [];
    await c.tween(1.8, (k) => {
      const e = ease(k);
      for (const v of vines) v.m.geometry.setDrawRange(0, Math.floor((v.total * e) / 18) * 18);
      for (const l of leaves) { const s = Math.max(0, Math.min(1, (e - l.at) * 6)); l.m.scale.set(s, s * 0.2, s * 0.6); }
      if (Math.random() < 0.6) { const l = Math.floor(Math.random() * 4); add.emit({ x: c.LX(l) + R(1), y: 0.4, z: c.rowZ(side) + R(1.2), vx: R(1), vy: 2 + Math.random() * 2, vz: R(1), color: Math.random() < 0.5 ? '#7BFF8A' : '#FFE14D', size: 0.25, gravity: 3, life: 1 }); }
      if (k > 0.6 && flowers.length < n(10) && Math.random() < 0.4) { const fs = put(new THREE.Sprite(new THREE.SpriteMaterial({ map: c.glowTex, color: ['#FF8AC2', '#FFE14D', '#FFFFFF'][flowers.length % 3], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))); const v = vines[Math.floor(Math.random() * vines.length)]; fs.position.copy(v.m.position).add(new THREE.Vector3(R(0.3), 1.5 + Math.random(), R(0.3))); fs.scale.setScalar(0.01); flowers.push(fs); }
      flowers.forEach((f) => { f.scale.setScalar(Math.min(0.9, f.scale.x + 0.05)); });
    });
    await c.wait(500);
    for (const o2 of [...vines.map((v) => v.m), ...leaves.map((l) => l.m), ...flowers]) linger(o2, (k) => { o2.scale.multiplyScalar(k >= 1 ? 0 : 0.96); });
    c.mood({});
  }

  // ---- 🫧 Rising Bog: a purple swamp floods the enemy half, bubbling and steaming ----
  async function bogrise(side: Side) {
    const o = other(side);
    c.bigText('RISING BOG!', '#C89BFF', 'It came up through the drains…');
    const ooze = canvasTex(256, 256, (g) => { g.fillStyle = '#3A1A5A'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${60 + Math.random() * 40},${180 + Math.random() * 60},0.5)`; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 30, 6 + Math.random() * 18, Math.random() * 3, 0, Math.PI * 2); g.fill(); } }, [2, 2]);
    const D = Math.abs(c.heroZ(o)) + 1.6;
    const pool = put(new THREE.Mesh(new THREE.PlaneGeometry(c.tableW, D), new THREE.MeshStandardMaterial({ map: ooze, transparent: true, opacity: 0.92, roughness: 0.2, emissive: '#5A2A8A', emissiveIntensity: 0.5, depthWrite: false })));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, -0.1, halfZ(o) * D / 2);
    const bubG = new THREE.SphereGeometry(1, 14, 10), bubM = new THREE.MeshStandardMaterial({ color: '#9B6BFF', transparent: true, opacity: 0.7, roughness: 0.05, emissive: '#6A3ACF', emissiveIntensity: 0.6 });
    const bubbles: { m: THREE.Mesh; t: number; max: number }[] = [];
    c.mood({ sky: '#1A0A2A', dim: 0.85 });
    await c.tween(2.2, (k, dt) => {
      pool.position.y = -0.1 + Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * 0.62 - (k > 0.75 ? (k - 0.75) * 1.6 : 0);
      ooze.offset.x += dt * 0.05; ooze.offset.y += dt * 0.03;
      if (Math.random() < 0.5 && bubbles.length < n(26)) { const m = put(new THREE.Mesh(bubG, bubM)); m.position.set(R(c.tableW / 2 - 0.4), pool.position.y, halfZ(o) * Math.random() * D); m.scale.setScalar(0.01); bubbles.push({ m, t: 0, max: 0.15 + Math.random() * 0.35 }); }
      for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.t += dt; b.m.scale.setScalar(Math.min(b.max, b.t * 0.6)); b.m.position.y = pool.position.y + b.m.scale.x * 0.5; if (b.t > 0.8 + b.max * 2) { burst(b.m.position.x, b.m.position.y, b.m.position.z, ['#C89BFF', '#9B6BFF'], 10, 2, { size: 0.2, gravity: 5 }); drop(b.m); bubbles.splice(i, 1); } }
      if (Math.random() < 0.6) smoke(R(c.tableW / 2), pool.position.y + 0.2, halfZ(o) * Math.random() * D, 1, { color: '#7A4AAA', size: 1.2, rise: 0.8, life: 1.6 });
    });
    for (const b of bubbles) drop(b.m);
    linger(pool, (k) => { (pool.material as THREE.MeshStandardMaterial).opacity = 0.92 * (1 - k); });
    c.mood({});
  }

  // ---- ☄️ Meteor Shower: the sky catches fire (the rocks arrive as strike events) ----
  async function meteors() {
    c.bigText('METEOR SHOWER!', '#FFB13D', 'Make a wish. Then duck.');
    c.mood({ sky: '#3A1408', dim: 0.75 });
    await c.tween(1.0, () => { for (let i = 0; i < n(2); i++) add.emit({ x: R(20), y: 16, z: -14 + R(6), vx: 10 + Math.random() * 5, vy: -9, vz: 3, color: '#FFD08A', size: 0.4, life: 1.1 }); });
    linger(new THREE.Group(), (k) => { if (k >= 1) c.mood({}); });
  }

  // ---- 🌑 Eclipse: the moon slides over the sun and the arena goes dark ----
  async function eclipse() {
    c.bigText('ECLIPSE!', '#FFE9A8', 'Everything flips in the dark…');
    const g = new THREE.Group(); c.camera.add(g); if (!c.camera.parent) scene.add(c.camera); temp.push(g);
    const top = Math.tan((c.camera.fov * Math.PI) / 360) * 14;
    g.position.set(0, top * 0.62, -14);
    const R0 = 0.34;
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: c.glowTex, color: '#FFE9A8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); sun.scale.set(R0 * 5, R0 * 5, 1); sun.renderOrder = 20; g.add(sun);
    const core = new THREE.Mesh(new THREE.CircleGeometry(R0, 40), new THREE.MeshBasicMaterial({ color: '#FFF6D8', depthTest: false, toneMapped: false })); core.renderOrder = 21; g.add(core);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(R0 * 1.03, 40), new THREE.MeshBasicMaterial({ color: '#000000', depthTest: false, toneMapped: false })); moon.renderOrder = 22; g.add(moon);
    const corona = new THREE.Mesh(new THREE.RingGeometry(R0, R0 * 1.7, 48), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false })); corona.renderOrder = 23; g.add(corona);
    await c.tween(2.0, (k) => {
      const e = ease(k); moon.position.x = (-3.2 + e * 3.2) * R0; moon.position.y = (0.6 - e * 0.6) * R0;
      c.mood({ dim: 1 - e * 0.85, sky: '#020208' }); (corona.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (e - 0.85) * 6); sun.material.opacity = 1 - e * 0.6;
    });
    await c.wait(400);
    linger(g, (k) => { moon.position.x = k * 3.2 * R0; (corona.material as THREE.MeshBasicMaterial).opacity = 1 - k; sun.material.opacity = 0.4 + k * 0.6; if (k >= 1) { c.camera.remove(g); c.mood({}); } });
  }

  // ---- 🕳️ Black Hole: a hole in space opens over one lane and swallows it ----
  async function blackhole(lane: number) {
    c.bigText('BLACK HOLE!', '#B57BFF', 'Don’t look at it…');
    const at = new THREE.Vector3(c.LX(lane), 1.6, 0);
    const disk = canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128); gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.3, 'rgba(255,110,40,0.9)'); gr.addColorStop(0.6, 'rgba(160,60,255,0.7)'); gr.addColorStop(1, 'rgba(60,20,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.6})`; g.lineWidth = 2 + Math.random() * 4; g.beginPath(); g.arc(128, 128, 50 + Math.random() * 70, Math.random() * 6, Math.random() * 6 + 1.5); g.stroke(); } });
    const ring = put(new THREE.Mesh(new THREE.RingGeometry(0.85, 2.5, 64), new THREE.MeshBasicMaterial({ map: disk, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    ring.position.copy(at); ring.rotation.x = -Math.PI / 2 + 0.35; ring.scale.setScalar(0.01);
    const hole = put(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: '#000000' }))); hole.position.copy(at); hole.scale.setScalar(0.01);
    const halo = put(new THREE.Sprite(new THREE.SpriteMaterial({ map: c.glowTex, color: '#B57BFF', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))); halo.position.copy(at); halo.scale.setScalar(0.01);
    const victims = [...c.unitGroups(0, lane), ...c.unitGroups(1, lane), c.totemGroup(0, lane), c.totemGroup(1, lane)];
    const start = victims.map((v) => v.position.clone());
    c.mood({ dim: 0.6, sky: '#08020F' });
    await c.tween(2.4, (k, dt) => {
      const e = ease(Math.min(1, k * 1.6));
      hole.scale.setScalar(e * 0.95); ring.scale.setScalar(e); halo.scale.setScalar(e * 5); ring.rotation.z += dt * 2.5;
      c.shake(0.15 + k * 0.2);
      for (let i = 0; i < n(8); i++) { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3; add.emit({ x: at.x + Math.cos(a) * r, y: at.y + R(1.5), z: at.z + Math.sin(a) * r, color: ['#B57BFF', '#FF9A50', '#FFFFFF'][i % 3], size: 0.2, life: 1.2, attract: { x: at.x, y: at.y, z: at.z, k: 3, swirl: 5 } }); }
      const pull = easeIn(Math.max(0, (k - 0.2) / 0.7));
      victims.forEach((v, i) => { v.position.lerpVectors(start[i], at, Math.min(1, pull)); v.rotation.y += dt * (4 + pull * 20); v.scale.setScalar(Math.max(0.01, 1 - pull)); });
    });
    // collapse: a flash and a ring of light
    burst(at.x, at.y, at.z, ['#FFFFFF', '#B57BFF', '#FF9A50'], 70, 7, { size: 0.35, gravity: 0, life: 0.9 });
    shockwave(at.x, at.y, at.z, '#D8B8FF', 5, 0.8); flashLight(at.x, at.y, at.z, '#D8B8FF', 80, 0.5); c.shake(0.6);
    await c.tween(0.35, (k) => { hole.scale.setScalar(0.95 * (1 - k)); ring.scale.setScalar(1 - k); halo.scale.setScalar(5 * (1 - k)); });
    for (const x of [ring, hole, halo]) drop(x);
    victims.forEach((v, i) => { v.position.copy(start[i]); v.scale.setScalar(1); v.rotation.y = 0; });
    c.mood({});
  }

  /** A wonder going off: the Smoldering Peak's eruption (bombs at every enemy creature and the enemy hero). */
  async function peakblast(side: Side, lane: number, model: WonderModel | null) {
    const o = other(side);
    c.bigText('THE PEAK ERUPTS!', '#FF7A20');
    const top = new THREE.Vector3(c.LX(lane), (model?.userData.top ?? 1.7) + 0.2, c.totemZ(side));
    await c.tween(0.6, () => { c.shake(0.25); smoke(top.x, top.y, top.z, 1, { color: '#2A2028', size: 1.4, rise: 3 }); });
    boom(top.x, top.y, top.z, 0.9);
    const shots = [0, 1, 2, 3, -1].map((l) => new THREE.Vector3(l < 0 ? 0 : c.LX(l), 0.5, l < 0 ? c.heroZ(o) : c.rowZ(o)));
    await Promise.all(shots.map((to, i) => c.wait(i * 120).then(async () => { const b = fireball(0.26); await lob(top, to, 0.7, 3.5, b, fireTrail); drop(b); boom(to.x, 0.5, to.z, 0.6); })));
    await c.tween(0.8, () => { for (let i = 0; i < n(4); i++) add.emit({ x: top.x + R(0.2), y: top.y, z: top.z + R(0.2), vx: R(1.5), vy: 6 + Math.random() * 4, vz: R(1.5), color: ['#FFF0A0', '#FFB020', '#FF5A10'][i % 3], size: 0.35, gravity: 9, life: 1.2 }); });
  }
  async function rift(side: Side, lane: number) {
    const at = new THREE.Vector3(c.LX(lane), 1.2, c.totemZ(side));
    burst(at.x, at.y, at.z, ['#B57BFF', '#FFFFFF', '#22E3FF'], 40, 4, { size: 0.3, gravity: 1, life: 0.9 });
    shockwave(at.x, 0.3, at.z, '#B57BFF', 3); flashLight(at.x, at.y, at.z, '#B57BFF', 40, 0.6);
    await c.wait(250);
  }

  return {
    /** Play a cataclysm's (or wonder's) scene. */
    async play(fx: Fx, side: Side, lane: number | undefined, model: WonderModel | null) {
      switch (fx) {
        case 'eruption': return eruption();
        case 'avalanche': return avalanche(side);
        case 'tidalwave': return tidalwave(side);
        case 'earthquake': return earthquake();
        case 'thunderstorm': return thunderstorm();
        case 'cyclone': return cyclone(side);
        case 'overgrowth': return overgrowth(side);
        case 'bogrise': return bogrise(side);
        case 'meteors': return meteors();
        case 'eclipse': return eclipse();
        case 'blackhole': return blackhole(lane ?? 1);
        case 'peakblast': return peakblast(side, lane ?? 0, model);
        case 'rift': return rift(side, lane ?? 0);
      }
    },
    /** A bolt or a meteor hitting a spot (lane -1 = the hero). `from` = a storm spire's tip, if it came from one. */
    async strike(kind: 'bolt' | 'meteor', to: THREE.Vector3, from?: THREE.Vector3) {
      if (kind === 'meteor') return meteor(to);
      const src = from ?? (storm ? storm.clouds[Math.floor(Math.random() * storm.clouds.length)].position.clone() : new THREE.Vector3(to.x + R(2), 10, to.z + R(2)));
      return bolt(src, to);
    },
    boom, burst, smoke, shockwave,
    /** At the end of a move, the lingering bits of its scenes (clouds, cracks, scorch marks) fade away. */
    async settle() {
      if (!lingering.length) return;
      const L = lingering.splice(0);
      await c.tween(0.9, (k) => L.forEach((x) => x.fade?.(k)));
      L.forEach((x) => { x.fade?.(1); x.o.parent?.remove(x.o); drop(x.o); });
    },
    clear() { lingering.length = 0; for (const o of [...temp]) { o.parent?.remove(o); drop(o); } for (const p of pool) { p.l.intensity = 0; p.busy = false; } storm = null; },
    get busy() { return temp.length; },
  };
}
export type Scenes = ReturnType<typeof makeScenes>;
export type { Terrain };
