// 🏞️ Paintbrawl's lands in 3D: every lane is a little diorama that rises out of the table when its land card is
// placed — sculpted ground (a clear spot in the middle where the creature stands), layered earth showing on the sides
// like a cut-away cake, and a world on top:
//   🌿 Meadow  swaying grass, wildflowers, bushes, a little tree, pebbles
//   🔥 Ember   black basalt with glowing lava cracks, a bubbling lava pool, obsidian spikes, smoking vents
//   ❄️ Frost   snow drifts, ice crystal clusters, a frozen pond, a snowy pine
//   🍄 Bog     murky water with lily pads, reeds, glowing mushrooms, an old stump
//   🍭 Sugar   frosting ground, gumdrops, lollipop trees, candy canes, sprinkles, chocolate rocks
//   ⚡ Neon    a glowing grid floor, light pylons, floating data cubes and a holo ring
// An unplaced lane is a carved stone slab waiting for its land.
import * as THREE from 'three';
import { TERRAIN_INFO, type Terrain } from '../shared/brawl/cards';

export const LAND_W = 2.86, LAND_D = 3.9, LAND_TOP = 0.32;
export type Land = { group: THREE.Group; terrain: Terrain | null; tick(dt: number, t: number, emit: Emitter): void; grow(k: number): void; dispose(): void };
export type Emitter = (kind: 'smoke' | 'ember' | 'snow' | 'bubble' | 'spark' | 'firefly', x: number, y: number, z: number) => void;

// ---- a little noise -------------------------------------------------------------------------------------------------------
const hash = (x: number, y: number, s: number) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 3) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 7) * 0.1;
const R = (a = 1) => (Math.random() - 0.5) * 2 * a;
const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
};

// how each land looks: ground colours (low → high), the earth layers on the sides, how bumpy, how shiny
const LOOK: Record<Terrain, { low: string; high: string; layers: string[]; amp: number; rough: number; glow?: string }> = {
  meadow: { low: '#3E8A3A', high: '#8AD860', layers: ['#4FA552', '#6A4A2A', '#5A3A1E', '#4A3020', '#7A7068'], amp: 0.16, rough: 0.9 },
  ember: { low: '#1A0E0C', high: '#3A2420', layers: ['#2A1A16', '#FF6A10', '#3A1A10', '#1A0A08', '#5A2A1A'], amp: 0.22, rough: 0.85, glow: '#FF6A10' },
  frost: { low: '#BFE4F8', high: '#FFFFFF', layers: ['#F4FBFF', '#BFE8FF', '#8AC8F0', '#5A9AD0', '#4A6A8A'], amp: 0.2, rough: 0.55 },
  bog: { low: '#241A2A', high: '#4A3A40', layers: ['#3A2A40', '#2A1E24', '#4A3A2A', '#2A2018', '#1A1410'], amp: 0.12, rough: 0.7 },
  sugar: { low: '#FF9AD0', high: '#FFE0F0', layers: ['#FFFFFF', '#FF8AC2', '#F0C890', '#8A4A2A', '#F0C890'], amp: 0.13, rough: 0.35 },
  neon: { low: '#0E0A22', high: '#1E1640', layers: ['#2A2A40', '#22E3FF', '#1A1A2E', '#FF4FD8', '#12121E'], amp: 0.05, rough: 0.4, glow: '#22E3FF' },
};

/** The layered earth on the sides of a land (like a slice of cake). */
function sideTex(t: Terrain) {
  const L = LOOK[t].layers;
  return tex(128, 64, (g) => {
    const hs = [8, 12, 14, 16, 14];
    let y = 0;
    L.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x * 0.2 + i) * 1.5); g.lineTo(128, y + hs[i] + 1); g.lineTo(0, y + hs[i] + 1); g.fill(); y += hs[i]; });
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.fillRect(Math.random() * 128, 6 + Math.random() * 58, 2, 2); }
    if (t === 'meadow') { g.strokeStyle = '#3A2A18'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { const x = Math.random() * 128; g.beginPath(); g.moveTo(x, 10); g.quadraticCurveTo(x + 6, 22, x - 3, 34); g.stroke(); } }
  }, [2, 1]);
}

/** The ground's detail texture and (for ember and neon) what glows. */
function groundTex(t: Terrain) {
  const R2 = (k: number) => Math.random() * k;
  const map = tex(256, 256, (g) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) { const v = 200 + R2(55); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(R2(256), R2(256), 2 + R2(3), 2 + R2(3)); }
    if (t === 'meadow') for (let i = 0; i < 500; i++) { g.strokeStyle = `rgba(40,90,30,${0.25 + R2(0.3)})`; g.lineWidth = 1.5; const x = R2(256), y = R2(256); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R2(4) - 2, y - 5 - R2(5)); g.stroke(); }
    if (t === 'frost') { g.strokeStyle = 'rgba(140,200,240,0.6)'; for (let i = 0; i < 26; i++) { g.lineWidth = 0.6 + R2(1.5); g.beginPath(); let x = R2(256), y = R2(256); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += R2(40) - 20; y += R2(40) - 20; g.lineTo(x, y); } g.stroke(); } }
    if (t === 'bog') for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(90,70,110,${0.2 + R2(0.3)})`; g.beginPath(); g.ellipse(R2(256), R2(256), 10 + R2(26), 6 + R2(14), R2(3), 0, Math.PI * 2); g.fill(); }
    if (t === 'sugar') for (let i = 0; i < 220; i++) { g.fillStyle = ['#FF4D6D', '#3DDC97', '#FFE14D', '#22B8FF', '#FFFFFF', '#B57BFF'][i % 6]; g.save(); g.translate(R2(256), R2(256)); g.rotate(R2(6)); g.fillRect(-4, -1.2, 8, 2.4); g.restore(); }
    if (t === 'ember') for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${R2(0.4)})`; g.beginPath(); g.arc(R2(256), R2(256), 3 + R2(10), 0, Math.PI * 2); g.fill(); }
    if (t === 'neon') { g.fillStyle = '#C8C8E0'; g.fillRect(0, 0, 256, 256); }
  }, [1.5, 2]);
  let glow: THREE.CanvasTexture | null = null;
  if (t === 'ember') glow = tex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.lineCap = 'round';
    for (let i = 0; i < 9; i++) { let x = R2(256), y = R2(256); const pts = [[x, y]]; for (let k = 0; k < 7; k++) { x += R2(50) - 25; y += R2(50) - 25; pts.push([x, y]); }
      for (const [w, c] of [[7, 'rgba(255,90,10,0.35)'], [3, '#FF7A20'], [1.2, '#FFE080']] as const) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); } }
  }, [1.5, 2]);
  if (t === 'neon') glow = tex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i <= 8; i++) { for (const [w, a] of [[6, 0.25], [2, 1]] as const) { g.strokeStyle = `rgba(34,227,255,${a})`; g.lineWidth = w; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,79,216,0.8)'; g.fillRect(Math.floor(R2(8)) * 32 + 2, Math.floor(R2(8)) * 32 + 2, 28, 28); }
  }, [1.5, 2]);
  return { map, glow };
}

export function buildLand(t: Terrain | null, o: { phone?: boolean; seed?: number } = {}): Land {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const D = <X extends { dispose(): void }>(x: X) => { disposables.push(x); return x; };
  const shadows = !o.phone;
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(D(geo), mat); m.position.set(x, y, z); m.castShadow = shadows; m.receiveShadow = true; parent.add(m); return m; };
  const S = (c: string, p: THREE.MeshStandardMaterialParameters = {}) => D(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...p }));
  const W = LAND_W, Dp = LAND_D, seed = o.seed ?? Math.random() * 100;

  // ---- an empty lane: a carved stone slab ----
  if (!t) {
    const stone = tex(128, 160, (g) => { g.fillStyle = '#6A6078'; g.fillRect(0, 0, 128, 160); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; g.fillRect(Math.random() * 128, Math.random() * 160, 3, 3); } g.strokeStyle = 'rgba(30,20,40,0.6)'; g.lineWidth = 4; g.strokeRect(10, 10, 108, 140); g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; g.strokeRect(14, 14, 100, 132); g.font = '900 48px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(30,20,40,0.45)'; g.fillText('?', 64, 82); });
    D(stone);
    mesh(new THREE.BoxGeometry(W, 0.14, Dp), [S('#4A4058'), S('#4A4058'), S('#ffffff', { map: stone, roughness: 0.95 }), S('#4A4058'), S('#4A4058'), S('#4A4058')] as unknown as THREE.Material, group, 0, 0.07, 0);
    return { group, terrain: null, tick() {}, grow() {}, dispose() { for (const x of disposables) x.dispose(); } };
  }

  const look = LOOK[t], info = TERRAIN_INFO[t];
  const base = new THREE.Group(); group.add(base);
  // ---- the slab with its layered earth ----
  const side = D(sideTex(t));
  const sideM = S('#ffffff', { map: side, roughness: 0.9, ...(look.glow ? { emissiveMap: side, emissive: '#ffffff', emissiveIntensity: t === 'neon' ? 0.5 : 0.25 } : {}) });
  mesh(new THREE.BoxGeometry(W, 0.5, Dp), [sideM, sideM, S(look.low), S('#1A1418'), sideM, sideM] as unknown as THREE.Material, base, 0, LAND_TOP - 0.27, 0);
  // ---- the sculpted ground ----
  const seg = o.phone ? 22 : 34;
  const geo = new THREE.PlaneGeometry(W, Dp, seg, Math.round(seg * Dp / W)); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute, colors: number[] = [];
  const lo = new THREE.Color(look.low), hi = new THREE.Color(look.high), cc = new THREE.Color();
  const heightAt = (x: number, z: number) => {
    const edge = Math.min(1, Math.min(W / 2 - Math.abs(x), Dp / 2 - Math.abs(z)) / 0.35);
    const centre = Math.min(1, Math.hypot(x / 1.0, z / 1.15) / 1);
    let h = fbm(x * 1.4 + seed, z * 1.4, seed) * look.amp * 2;
    if (t === 'frost') h += Math.max(0, fbm(x * 0.8, z * 0.8 + seed, seed + 2) - 0.5) * 0.5; // drifts
    if (t === 'ember') h += Math.pow(fbm(x * 2.2, z * 2.2, seed + 5), 3) * 0.4;
    return h * edge * (0.25 + 0.75 * centre);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    const k = Math.min(1, Math.max(0, h / (look.amp * 1.6) + fbm(x * 3, z * 3, seed + 9) * 0.35));
    cc.copy(lo).lerp(hi, k); colors.push(cc.r, cc.g, cc.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const gt = groundTex(t); D(gt.map); if (gt.glow) D(gt.glow);
  const groundM = S('#ffffff', { vertexColors: true, map: gt.map, roughness: look.rough, metalness: t === 'neon' ? 0.4 : 0, ...(gt.glow ? { emissiveMap: gt.glow, emissive: '#ffffff', emissiveIntensity: 1.2 } : {}) });
  const ground = mesh(geo, groundM, base, 0, LAND_TOP, 0); ground.castShadow = false;

  // ---- what stands on it ----
  const props = new THREE.Group(); props.position.y = LAND_TOP; group.add(props);
  type Pop = { o: THREE.Object3D; at: number; s: THREE.Vector3 };
  const pops: Pop[] = [];
  const keepClear = (x: number, z: number) => Math.hypot(x / 1.05, z / 1.25) < 1;
  /** a spot away from the middle (where the creature stands), on the ground */
  const spot = (minEdge = 0.15) => { for (let i = 0; i < 40; i++) { const x = R(W / 2 - minEdge), z = R(Dp / 2 - minEdge); if (!keepClear(x, z)) return new THREE.Vector3(x, heightAt(x, z), z); } return new THREE.Vector3(W / 2 - 0.3, 0, Dp / 2 - 0.3); };
  const corner = (sx: number, sz: number, inset = 0.45) => { const x = sx * (W / 2 - inset), z = sz * (Dp / 2 - inset); return new THREE.Vector3(x, heightAt(x, z), z); };
  const add = (o2: THREE.Object3D, at = Math.random() * 0.6) => { props.add(o2); pops.push({ o: o2, at, s: o2.scale.clone() }); return o2; };
  const ticks: ((dt: number, t: number, emit: Emitter) => void)[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  /** many small things in one draw call */
  const scatter = (geo2: THREE.BufferGeometry, mat: THREE.Material, n: number, place: (i: number) => { p: THREE.Vector3; s: number; r?: THREE.Euler; c?: string }) => {
    const im = new THREE.InstancedMesh(D(geo2), mat, n); im.castShadow = false; im.receiveShadow = true;
    for (let i = 0; i < n; i++) { const r = place(i); q.setFromEuler(r.r ?? e.set(0, Math.random() * 6, 0)); m4.compose(r.p, q, sc.setScalar(r.s)); im.setMatrixAt(i, m4); if (r.c) im.setColorAt(i, new THREE.Color(r.c)); }
    add(im, 0.1); return im;
  };
  const windUniform = { value: 0 };
  const sway = (m: THREE.MeshStandardMaterial, amt: number) => { m.onBeforeCompile = (sh) => { sh.uniforms.uWind = windUniform; sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n#ifdef USE_INSTANCING\n float ph = instanceMatrix[3].x * 2.1 + instanceMatrix[3].z * 1.3;\n#else\n float ph = 0.0;\n#endif\n transformed.x += sin(uWind * 2.0 + ph) * ${amt.toFixed(3)} * max(0.0, position.y);\n transformed.z += cos(uWind * 1.6 + ph) * ${(amt * 0.6).toFixed(3)} * max(0.0, position.y);`); }; };
  const P = o.phone ? 0.45 : 1;

  switch (t) {
    case 'meadow': {
      const grassM = S('#ffffff', { roughness: 0.8, side: THREE.DoubleSide }); sway(grassM, 0.35);
      const blade = new THREE.ConeGeometry(0.03, 0.26, 3); blade.translate(0, 0.13, 0);
      scatter(blade, grassM, Math.round(320 * P), () => { const p = spot(0.08); return { p, s: 0.7 + Math.random() * 0.9, c: ['#3E9A44', '#5FBF4A', '#7BD957', '#4FA552'][Math.floor(Math.random() * 4)], r: new THREE.Euler(R(0.25), Math.random() * 6, R(0.25)) }; });
      const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4); stem.translate(0, 0.1, 0);
      const fl: THREE.Vector3[] = []; for (let i = 0; i < Math.round(26 * P + 6); i++) fl.push(spot(0.15));
      const stemM = S('#3E8A3A'); sway(stemM, 0.3);
      scatter(stem, stemM, fl.length, (i) => ({ p: fl[i], s: 1 }));
      const petal = new THREE.SphereGeometry(0.045, 8, 6); petal.translate(0, 0.21, 0);
      const petalM = S('#ffffff', { roughness: 0.5, emissive: '#221100', emissiveIntensity: 0.2 }); sway(petalM, 0.3);
      scatter(petal, petalM, fl.length, (i) => ({ p: fl[i], s: 1, c: ['#FFE14D', '#FF8AC2', '#FFFFFF', '#B57BFF', '#FF9F1C'][i % 5] }));
      // bushes and a tree
      const leafM = S('#4FA552', { roughness: 0.75 }), leafM2 = S('#6BC25A', { roughness: 0.75 });
      for (const [sx, sz] of [[-1, 1], [1, -1]] as const) { const c = corner(sx, sz, 0.38); const b = new THREE.Group(); b.position.copy(c); for (let k = 0; k < 4; k++) mesh(new THREE.IcosahedronGeometry(0.17 + Math.random() * 0.08, 1), k % 2 ? leafM : leafM2, b, R(0.15), 0.12 + Math.random() * 0.08, R(0.15)); add(b); }
      { const c = corner(1, 1, 0.42); const tr = new THREE.Group(); tr.position.copy(c); mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.9, 7), S('#6A4428', { roughness: 0.95 }), tr, 0, 0.45, 0); for (let k = 0; k < 5; k++) mesh(new THREE.IcosahedronGeometry(0.28 + Math.random() * 0.1, 1), k % 2 ? leafM : leafM2, tr, R(0.25), 0.95 + Math.random() * 0.35, R(0.25)); add(tr, 0.3);
        ticks.push((_dt, tt) => { tr.rotation.z = Math.sin(tt * 0.8) * 0.03; }); }
      for (let k = 0; k < 4; k++) { const p = spot(0.2); const r = mesh(new THREE.DodecahedronGeometry(0.07 + Math.random() * 0.07, 0), S('#9A9AA8', { flatShading: true }), props, p.x, p.y + 0.03, p.z); add(r); }
      ticks.push((dt, tt, emit) => { if (Math.random() < dt * 0.8) { const p = spot(0.2); emit('firefly', p.x + group.position.x, LAND_TOP + 0.3 + Math.random() * 0.5, p.z + group.position.z); } void tt; });
      break;
    }
    case 'ember': {
      const obs = S('#140A10', { roughness: 0.15, metalness: 0.3, flatShading: true });
      for (let k = 0; k < 6; k++) { const p = spot(0.15); const s = mesh(new THREE.ConeGeometry(0.08 + Math.random() * 0.08, 0.35 + Math.random() * 0.5, 5), obs, props, p.x, p.y + 0.15, p.z); s.rotation.set(R(0.3), Math.random() * 6, R(0.3)); add(s); }
      // a lava pool
      const lavaTex = tex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, '#FFF0A0'); gr.addColorStop(0.5, '#FF8A10'); gr.addColorStop(1, '#C02A00'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(60,10,0,0.55)'; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 12, 4 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2); g.fill(); } }); D(lavaTex);
      lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
      const pc = corner(-1, -1, 0.6);
      const pool = mesh(new THREE.CircleGeometry(0.42, 24), S('#ffffff', { map: lavaTex, emissiveMap: lavaTex, emissive: '#ffffff', emissiveIntensity: 1.6 }), props, pc.x, pc.y + 0.03, pc.z); pool.rotation.x = -Math.PI / 2; pool.castShadow = false; add(pool);
      const rim = mesh(new THREE.TorusGeometry(0.44, 0.06, 6, 24), S('#2A1A16', { roughness: 0.9, flatShading: true }), props, pc.x, pc.y + 0.04, pc.z); rim.rotation.x = Math.PI / 2; add(rim);
      // smoking vents
      const vents = [corner(1, 1, 0.4), corner(1, -1, 0.35)].map((v) => { const c = mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.18, 8), S('#2A1A16', { flatShading: true }), props, v.x, v.y + 0.09, v.z); add(c); return v; });
      ticks.push((dt, tt, emit) => {
        lavaTex.offset.set(tt * 0.03, tt * 0.02); groundM.emissiveIntensity = 1.0 + Math.sin(tt * 1.7 + seed) * 0.35;
        for (const v of vents) if (Math.random() < dt * 3) emit('smoke', v.x + group.position.x, LAND_TOP + v.y + 0.2, v.z + group.position.z);
        if (Math.random() < dt * 2.5) { const p = spot(0.1); emit('ember', p.x + group.position.x, LAND_TOP + 0.1, p.z + group.position.z); }
        if (Math.random() < dt * 1.2) emit('ember', pc.x + group.position.x + R(0.25), LAND_TOP + 0.08, pc.z + group.position.z + R(0.25));
      });
      break;
    }
    case 'frost': {
      const snowM = S('#FFFFFF', { roughness: 0.6 });
      for (let k = 0; k < 4; k++) { const p = spot(0.25); const d = mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 14, 8), snowM, props, p.x, p.y - 0.05, p.z); d.scale.set(1.4, 0.35, 1); d.rotation.y = Math.random() * 3; add(d); }
      const iceM = S('#CFF6FF', { transparent: true, opacity: 0.82, roughness: 0.05, metalness: 0.1, emissive: '#6FD3FF', emissiveIntensity: 0.35 });
      const clusters: THREE.Group[] = [];
      for (let k = 0; k < 3; k++) { const p = spot(0.2); const cl = new THREE.Group(); cl.position.copy(p); for (let j = 0; j < 4; j++) { const c = mesh(new THREE.OctahedronGeometry(0.09 + Math.random() * 0.06, 0), iceM, cl, R(0.12), 0.15, R(0.12)); c.scale.y = 2.4 + Math.random() * 1.5; c.rotation.set(R(0.4), Math.random() * 3, R(0.4)); } add(cl); clusters.push(cl); }
      // a frozen pond
      const pc = corner(-1, -1, 0.65);
      const pond = mesh(new THREE.CircleGeometry(0.5, 28), S('#9FDCFF', { roughness: 0.02, metalness: 0.5, emissive: '#3A8AC0', emissiveIntensity: 0.35 }), props, pc.x, pc.y + 0.02, pc.z); pond.rotation.x = -Math.PI / 2; pond.castShadow = false; add(pond);
      // a snowy pine
      { const c = corner(1, 1, 0.45); const tr = new THREE.Group(); tr.position.copy(c); mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), S('#5A3A28'), tr, 0, 0.15, 0); for (let k = 0; k < 3; k++) { mesh(new THREE.ConeGeometry(0.42 - k * 0.11, 0.5, 8), S('#2A5A4A', { roughness: 0.8 }), tr, 0, 0.45 + k * 0.32, 0); mesh(new THREE.ConeGeometry(0.36 - k * 0.1, 0.18, 8), snowM, tr, 0, 0.6 + k * 0.32, 0); } add(tr, 0.3); }
      ticks.push((dt, tt, emit) => { clusters.forEach((cl, i) => { cl.children.forEach((ch) => { ((ch as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + Math.sin(tt * 2 + i) * 0.15; }); }); if (Math.random() < dt * 3) emit('snow', group.position.x + R(W / 2), LAND_TOP + 2.2, group.position.z + R(Dp / 2)); });
      break;
    }
    case 'bog': {
      const pc = corner(1, -1, 0.7);
      const water = mesh(new THREE.CircleGeometry(0.62, 28), S('#2A4A3A', { roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.88, emissive: '#1A3A2A', emissiveIntensity: 0.4 }), props, pc.x, pc.y + 0.025, pc.z); water.rotation.x = -Math.PI / 2; water.castShadow = false; water.scale.set(1.2, 0.85, 1); add(water);
      const padM = S('#4A9A4A', { roughness: 0.5, side: THREE.DoubleSide });
      for (let k = 0; k < 3; k++) { const pad = mesh(new THREE.CircleGeometry(0.11, 12, 0.3, Math.PI * 1.85), padM, props, pc.x + R(0.4), pc.y + 0.04, pc.z + R(0.3)); pad.rotation.x = -Math.PI / 2; pad.rotation.z = Math.random() * 6; add(pad); }
      const reed = new THREE.CylinderGeometry(0.012, 0.016, 0.5, 4); reed.translate(0, 0.25, 0);
      const reedM = S('#6A7A3A', { roughness: 0.8 }); sway(reedM, 0.18);
      scatter(reed, reedM, Math.round(26 * P + 8), () => { const a = Math.random() * 6; return { p: new THREE.Vector3(pc.x + Math.cos(a) * 0.75, pc.y, pc.z + Math.sin(a) * 0.6), s: 0.7 + Math.random() * 0.8, r: new THREE.Euler(R(0.15), 0, R(0.15)) }; });
      const glowCaps: THREE.MeshStandardMaterial[] = [];
      for (let k = 0; k < 5; k++) { const p = spot(0.2); const cols = ['#FF6FB5', '#9B6BFF', '#3DDC97']; const c = cols[k % 3]; const mg = new THREE.Group(); mg.position.copy(p); const h = 0.12 + Math.random() * 0.2; mesh(new THREE.CylinderGeometry(0.025, 0.035, h, 6), S('#E8D8C8'), mg, 0, h / 2, 0); const capM = S(c, { emissive: c, emissiveIntensity: 0.9, roughness: 0.4 }); glowCaps.push(capM); mesh(new THREE.SphereGeometry(0.09 + Math.random() * 0.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), capM, mg, 0, h, 0); add(mg); }
      { const c = corner(-1, 1, 0.45); const st = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.3, 8), S('#4A3A2A', { roughness: 1, flatShading: true }), props, c.x, c.y + 0.15, c.z); add(st); }
      ticks.push((dt, tt, emit) => { glowCaps.forEach((m, i) => { m.emissiveIntensity = 0.7 + Math.sin(tt * 2 + i * 1.3) * 0.35; }); if (Math.random() < dt * 1.5) emit('bubble', pc.x + group.position.x + R(0.4), LAND_TOP + 0.05, pc.z + group.position.z + R(0.3)); if (Math.random() < dt * 0.7) { const p = spot(0.2); emit('firefly', p.x + group.position.x, LAND_TOP + 0.3, p.z + group.position.z); } });
      break;
    }
    case 'sugar': {
      const gumG = new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      for (let k = 0; k < 7; k++) { const p = spot(0.15); add(mesh(gumG, S(['#FF4D6D', '#3DDC97', '#FFE14D', '#22B8FF', '#B57BFF'][k % 5], { roughness: 0.25, transparent: true, opacity: 0.92 }), props, p.x, p.y, p.z)); }
      const swirl = tex(128, 128, (g) => { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 128); g.translate(64, 64); for (let i = 0; i < 140; i++) { const a = i * 0.22, r = i * 0.45; g.fillStyle = ['#FF4D6D', '#FFFFFF', '#22B8FF', '#FFE14D'][Math.floor(i / 6) % 4]; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 5, 0, Math.PI * 2); g.fill(); } }); D(swirl);
      const lollis: THREE.Mesh[] = [];
      for (const [sx, sz] of [[1, 1], [-1, -1]] as const) { const c = corner(sx, sz, 0.42); const lg = new THREE.Group(); lg.position.copy(c); mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), S('#FFFFFF'), lg, 0, 0.45, 0); const disc = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.07, 28), [S('#FF4D6D'), S('#ffffff', { map: swirl, roughness: 0.25 }), S('#ffffff', { map: swirl, roughness: 0.25 })] as unknown as THREE.Material, lg, 0, 1.05, 0); disc.rotation.x = Math.PI / 2; lollis.push(disc); add(lg, 0.3); }
      // candy canes
      const stripe = tex(64, 16, (g) => { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#FF2A4A'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8 + 4, 0); g.lineTo(i * 8 + 8, 16); g.lineTo(i * 8 + 4, 16); g.fill(); } }, [8, 1]); D(stripe);
      for (const [sx, sz] of [[-1, 1], [1, -1]] as const) { const c = corner(sx, sz, 0.38); const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0.06, 0.72, 0), new THREE.Vector3(0.18, 0.74, 0), new THREE.Vector3(0.24, 0.62, 0)]; const cane = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 8), S('#ffffff', { map: stripe, roughness: 0.25 }), props, c.x, c.y, c.z); cane.rotation.y = Math.random() * 6; add(cane, 0.2); }
      const spr = new THREE.CapsuleGeometry(0.012, 0.05, 2, 4);
      scatter(spr, S('#ffffff', { roughness: 0.3 }), Math.round(90 * P), () => ({ p: spot(0.05).add(new THREE.Vector3(0, 0.015, 0)), s: 1, r: new THREE.Euler(Math.PI / 2, Math.random() * 6, 0), c: ['#FF4D6D', '#3DDC97', '#FFE14D', '#22B8FF', '#FFFFFF', '#B57BFF'][Math.floor(Math.random() * 6)] }));
      for (let k = 0; k < 2; k++) { const p = spot(0.25); const ch = mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), S('#6A3A1E', { roughness: 0.45 }), props, p.x, p.y + 0.06, p.z); ch.rotation.y = Math.random() * 3; add(ch); }
      ticks.push((_dt, tt) => { lollis.forEach((l, i) => { l.rotation.y = tt * (i ? 0.6 : -0.5); }); });
      break;
    }
    case 'neon': {
      const pyl = (c: THREE.Vector3, col: string) => { const g2 = new THREE.Group(); g2.position.copy(c); mesh(new THREE.CylinderGeometry(0.05, 0.08, 1, 6), S('#1A1A30', { metalness: 0.8, roughness: 0.3 }), g2, 0, 0.5, 0); const tip = mesh(new THREE.SphereGeometry(0.07, 10, 8), S('#ffffff', { emissive: col, emissiveIntensity: 3 }), g2, 0, 1.04, 0); add(g2, 0.3); return tip; };
      const tips = [pyl(corner(-1, 1, 0.35), '#22E3FF'), pyl(corner(1, -1, 0.35), '#FF4FD8')];
      const cubes: THREE.Mesh[] = [];
      for (let k = 0; k < 4; k++) { const p = spot(0.25); const cm = S('#1A1A40', { emissive: k % 2 ? '#FF4FD8' : '#22E3FF', emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.2, transparent: true, opacity: 0.85 }); const cu = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), cm, props, p.x, 0.5 + Math.random() * 0.4, p.z); const edges = new THREE.LineSegments(D(new THREE.EdgesGeometry(cu.geometry)), D(new THREE.LineBasicMaterial({ color: k % 2 ? '#FF4FD8' : '#22E3FF' }))); cu.add(edges); cu.userData.y = cu.position.y; add(cu); cubes.push(cu); }
      const ringC = corner(1, 1, 0.55);
      const ring = mesh(new THREE.TorusGeometry(0.32, 0.025, 8, 40), S('#ffffff', { emissive: '#22E3FF', emissiveIntensity: 2.5 }), props, ringC.x, 0.55, ringC.z); add(ring, 0.4);
      const beam = mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 20, 1, true), D(new THREE.MeshBasicMaterial({ color: '#22E3FF', transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })), props, ringC.x, 0.5, ringC.z); beam.castShadow = false; add(beam, 0.4);
      ticks.push((dt, tt, emit) => { cubes.forEach((c, i) => { c.rotation.set(tt * (0.6 + i * 0.1), tt * 0.8, 0); c.position.y = (c.userData.y as number) + Math.sin(tt * 1.5 + i) * 0.08; }); ring.rotation.set(Math.PI / 2 + Math.sin(tt) * 0.3, tt * 1.2, 0); tips.forEach((m, i) => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(tt * 6 + i * 3) * 1.2; }); groundM.emissiveIntensity = 1 + Math.sin(tt * 1.2 + seed) * 0.25; if (Math.random() < dt * 2) { const p = spot(0.1); emit('spark', p.x + group.position.x, LAND_TOP + 0.05, p.z + group.position.z); } });
      break;
    }
  }
  // the land's colour glows softly round its rim
  const rimGlow = mesh(new THREE.BoxGeometry(W + 0.04, 0.03, Dp + 0.04), D(new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.55 })), group, 0, LAND_TOP - 0.02, 0); rimGlow.castShadow = false;
  void v3;

  let grown = 1;
  return {
    group, terrain: t,
    tick(dt, tt, emit) { windUniform.value = tt; if (grown < 1) return; for (const f of ticks) f(dt, tt, emit); },
    /** 0..1: the land rising out of the table, then everything on it popping up */
    grow(k) {
      grown = k;
      const b = Math.min(1, k * 1.8), e2 = 1 - Math.pow(1 - b, 3);
      base.scale.set(1, Math.max(0.01, e2), 1); base.position.y = (e2 - 1) * 0.3;
      rimGlow.visible = b >= 1;
      for (const p of pops) { const x = Math.max(0, Math.min(1, (k - 0.35 - p.at * 0.4) / 0.25)); const over = x < 1 ? 1 + Math.sin(x * Math.PI) * 0.25 : 1; p.o.scale.set(p.s.x * x * over, p.s.y * x * over, p.s.z * x * over); p.o.visible = x > 0; }
      props.position.y = LAND_TOP + (e2 - 1) * 0.3;
    },
    dispose() { for (const x of disposables) x.dispose(); },
  };
}
