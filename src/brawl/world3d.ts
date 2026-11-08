// 🏝️ The Paintbrawl board as one big connected world: a floating island with all eight lanes on it, four a side. Each
// lane's land (Meadow, Ember, Frost, Bog, Sugar, Neon) colours and shapes the ground of its column and blends softly into
// its neighbours; dirt paths run between the lanes, a glowing creek runs across the middle, stone plazas hold each hero,
// and layered earth shows round the island's edges. Ember lanes glow with lava cracks and Neon lanes with a light grid,
// right in the ground. When a land card is placed, its column morphs from bare stone into the new land and everything
// on it (trees, crystals, candy, pylons…) pops up.
import * as THREE from 'three';
import { TERRAIN_INFO, type Terrain } from '../shared/brawl/cards';
import { buildLand, type Emitter, type Land } from './lands3d';
import type { Side } from '../shared/brawl/engine';

export const LANE_W = 3.4, LANE_D = 4.4, ROW = 2.95, TOTEM = 6.45, HERO = 8.4;
export const BOARD_W = LANE_W * 4 + 1.6, BOARD_D = (HERO + 1.5) * 2;
export const laneX = (lane: number) => (lane - 1.5) * LANE_W;

const hash = (x: number, y: number, s: number) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 3) * 0.3 + vnoise(x * 4.5, y * 4.5, s + 7) * 0.15;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// each land's ground: colours low → high, how bumpy, and what glows in it
const LOOK: Record<Terrain | 'bare', { low: string; high: string; amp: number; glow?: string; sel?: number }> = {
  meadow: { low: '#3E8A3A', high: '#8FDA62', amp: 0.28 },
  ember: { low: '#1E100C', high: '#4A2A22', amp: 0.38, glow: '#FF6A10', sel: 0 },
  frost: { low: '#B8DDF2', high: '#FFFFFF', amp: 0.34 },
  bog: { low: '#251B2C', high: '#4E3E46', amp: 0.2 },
  sugar: { low: '#FF96CC', high: '#FFE4F2', amp: 0.22 },
  neon: { low: '#0C0A20', high: '#221A48', amp: 0.08, glow: '#22E3FF', sel: 1 },
  bare: { low: '#5E566A', high: '#857C90', amp: 0.06 },
};
const PLAZA = { low: '#6A5A4C', high: '#8A7A66' }, PATH = new THREE.Color('#9A7A58'), WET = new THREE.Color('#2A3A4A');

export type World = ReturnType<typeof buildWorld>;
export function buildWorld(o: { phone: boolean; me: Side }) {
  const group = new THREE.Group();
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const rowZ = (side: Side) => (side === o.me ? ROW : -ROW);
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rep?: [number, number]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!); const t = T(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };

  // ---- the ground: one big sculpted, vertex-coloured sheet ----
  const nx = o.phone ? 96 : 150, nz = Math.round(nx * BOARD_D / BOARD_W);
  const geo = T(new THREE.PlaneGeometry(BOARD_W, BOARD_D, nx, nz)); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute, N = pos.count;
  const col = new Float32Array(N * 3), glow = new Float32Array(N * 3), sel = new Float32Array(N);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 3)); geo.setAttribute('aSel', new THREE.BufferAttribute(sel, 1));
  // what each vertex belongs to (worked out once)
  const vx = new Float32Array(N), vz = new Float32Array(N), laneA = new Int8Array(N), laneB = new Int8Array(N), wA = new Float32Array(N), reg = new Float32Array(N),
    flat = new Float32Array(N), path = new Float32Array(N), creek = new Float32Array(N), edge = new Float32Array(N), nse = new Float32Array(N), sideOf = new Int8Array(N);
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i), z = pos.getZ(i); vx[i] = x; vz[i] = z;
    sideOf[i] = z > 0 ? o.me : (o.me === 0 ? 1 : 0); // which half (the rows at +z are mine)
    const f = (x + LANE_W * 2) / LANE_W - 0.5; // lane coordinate: 0..3 at the centres
    const a = Math.max(0, Math.min(3, Math.floor(f))), b = Math.min(3, a + 1), t = Math.max(0, Math.min(1, f - a));
    laneA[i] = a; laneB[i] = b; wA[i] = 1 - sstep(0.38, 0.62, t);
    const az = Math.abs(z);
    reg[i] = sstep(0.5, 0.95, az) * (1 - sstep(HERO - 1.6, HERO - 0.7, az)) * (1 - sstep(LANE_W * 2 - 0.1, LANE_W * 2 + 0.5, Math.abs(x)));
    // flat spots: where creatures stand and where totems sit
    const lc = Math.round(f), lx = x - laneX(Math.max(0, Math.min(3, lc)));
    const dSpot = Math.hypot(lx / 1.25, (az - ROW) / 1.35), dTot = Math.hypot(lx / 0.9, (az - TOTEM) / 0.9);
    flat[i] = Math.min(sstep(0.7, 1.05, dSpot), sstep(0.8, 1.2, dTot));
    // paths between lanes, the creek across the middle, the island's edges
    let db = 9; for (let l = 0; l < 3; l++) db = Math.min(db, Math.abs(x - (laneX(l) + LANE_W / 2)));
    path[i] = (1 - sstep(0.06, 0.16, db)) * reg[i];
    creek[i] = 1 - sstep(0.35, 0.62, az);
    edge[i] = Math.min(sstep(0, 0.7, BOARD_W / 2 - Math.abs(x)), sstep(0, 0.7, BOARD_D / 2 - az));
    nse[i] = fbm(x * 0.9, z * 0.9, 3);
  }
  // each lane: what it was, what it's becoming, how far along
  const lanes = [0, 1].map(() => [0, 1, 2, 3].map(() => ({ from: null as Terrain | null, to: null as Terrain | null, k: 1 })));
  const cache = new Map<string, { c: Float32Array; h: Float32Array }>();
  /** a land's colour and height at every vertex (as if the whole board were that land) */
  const field = (t: Terrain | null) => {
    const key = t ?? 'bare'; let f = cache.get(key); if (f) return f;
    const L = LOOK[key], lo = new THREE.Color(L.low), hi = new THREE.Color(L.high), cc = new THREE.Color(), c = new Float32Array(N * 3), h = new Float32Array(N), s = key.length * 7.3;
    for (let i = 0; i < N; i++) {
      const x = vx[i], z = vz[i];
      let hh = fbm(x * 1.1 + s, z * 1.1, s) * L.amp * 2.2 - L.amp * 0.6;
      if (key === 'frost') hh += Math.max(0, fbm(x * 0.6, z * 0.6 + s, s + 2) - 0.45) * 0.7;
      if (key === 'ember') hh += Math.pow(fbm(x * 1.8, z * 1.8, s + 5), 3) * 0.9;
      if (key === 'bog') hh -= Math.max(0, fbm(x * 0.8 + 3, z * 0.8, s + 9) - 0.55) * 0.6;
      if (key === 'bare') { const gx = Math.abs(((x / 0.8) % 1 + 1) % 1 - 0.5), gz = Math.abs(((z / 0.8) % 1 + 1) % 1 - 0.5); hh -= (gx > 0.46 || gz > 0.46) ? 0.03 : 0; }
      h[i] = hh;
      const k = Math.max(0, Math.min(1, (hh + L.amp * 0.5) / (L.amp * 2.2) * 0.8 + fbm(x * 3, z * 3, s + 1) * 0.4));
      cc.copy(lo).lerp(hi, k); c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    }
    f = { c, h }; cache.set(key, f); return f;
  };
  const plazaLo = new THREE.Color(PLAZA.low), plazaHi = new THREE.Color(PLAZA.high), tmp = new THREE.Color(), tmpB = new THREE.Color(), gc = new THREE.Color();
  const laneCol = (side: number, l: number, i: number, out: THREE.Color) => {
    const L = lanes[side][l], A = field(L.from), B = field(L.to);
    out.setRGB(A.c[i * 3] + (B.c[i * 3] - A.c[i * 3]) * L.k, A.c[i * 3 + 1] + (B.c[i * 3 + 1] - A.c[i * 3 + 1]) * L.k, A.c[i * 3 + 2] + (B.c[i * 3 + 2] - A.c[i * 3 + 2]) * L.k);
    return A.h[i] + (B.h[i] - A.h[i]) * L.k;
  };
  // what glows in each lane right now (worked out once per rebuild, not per vertex)
  type Glow = { ka: number; kb: number; ra: number; ga: number; ba: number; rb: number; gb: number; bb: number; sa: number; sb: number };
  const glows: Glow[][] = [0, 1].map(() => [0, 1, 2, 3].map(() => ({ ka: 0, kb: 0, ra: 0, ga: 0, ba: 0, rb: 0, gb: 0, bb: 0, sa: 0, sb: 0 })));
  const gcol = new THREE.Color();
  const updateGlows = () => {
    for (let sd = 0; sd < 2; sd++) for (let l = 0; l < 4; l++) {
      const L = lanes[sd][l], G = glows[sd][l], a = L.from && LOOK[L.from].glow, b = L.to && LOOK[L.to].glow;
      G.ka = a ? 1 - L.k : 0; G.kb = b ? L.k : 0;
      if (a) { gcol.set(a); G.ra = gcol.r; G.ga = gcol.g; G.ba = gcol.b; }
      if (b) { gcol.set(b); G.rb = gcol.r; G.gb = gcol.g; G.bb = gcol.b; }
      G.sa = L.from ? LOOK[L.from].sel ?? 0 : 0; G.sb = L.to ? LOOK[L.to].sel ?? 0 : 0;
    }
  };
  /** one vertex: its height, colour and glow from the lanes it's in */
  const vertex = (i: number, heightOnly = false) => {
    const sd = sideOf[i], a = laneA[i], b = laneB[i], w = wA[i];
    const ha = laneCol(sd, a, i, tmp), hb = laneCol(sd, b, i, tmpB);
    let h = ha * w + hb * (1 - w);
    const r = reg[i];
    // outside the lanes: the stone plaza; then paths, flat spots, the creek, the edges
    h = h * r + (nse[i] - 0.5) * 0.12 * (1 - r);
    h *= flat[i] * (1 - path[i] * 0.8);
    h -= creek[i] * 0.42;
    h = h * edge[i] + (edge[i] - 1) * 0.05;
    if (heightOnly) return h;
    tmp.lerp(tmpB, 1 - w);
    gc.copy(plazaLo).lerp(plazaHi, nse[i]); tmp.lerp(gc, 1 - r);
    tmp.lerp(PATH, path[i] * 0.7); tmp.lerp(WET, creek[i] * 0.85);
    pos.setY(i, h);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    // what glows (ember cracks, neon grid)
    const m0 = r * (1 - path[i]) * (1 - creek[i]);
    let gr = 0, gg = 0, gb = 0, s2 = 0, tot = 0;
    const GA = glows[sd][a], GB = glows[sd][b];
    for (let j = 0; j < 4; j++) {
      const G = j < 2 ? GA : GB, ww = j < 2 ? w : 1 - w, first = j % 2 === 0, k = first ? G.ka : G.kb;
      if (k <= 0) continue; const m = k * ww * m0; if (m <= 0) continue;
      gr += (first ? G.ra : G.rb) * m; gg += (first ? G.ga : G.gb) * m; gb += (first ? G.ba : G.bb) * m; s2 += (first ? G.sa : G.sb) * m; tot += m;
    }
    glow[i * 3] = gr; glow[i * 3 + 1] = gg; glow[i * 3 + 2] = gb; sel[i] = tot > 0 ? s2 / tot : 0;
    return h;
  };
  // which vertices each lane touches, so a morphing lane only redoes its own part of the sheet
  const touched: Int32Array[][] = [0, 1].map((sd) => [0, 1, 2, 3].map((l) => { const out: number[] = []; for (let i = 0; i < N; i++) if (sideOf[i] === sd && (laneA[i] === l || laneB[i] === l)) out.push(i); return Int32Array.from(out); }));
  let normalsDue = 0;
  const rebuild = (only?: [number, number][]) => {
    updateGlows();
    if (!only) for (let i = 0; i < N; i++) vertex(i);
    else { const seen = new Uint8Array(N); for (const [sd, l] of only) for (const i of touched[sd][l]) if (!seen[i]) { seen[i] = 1; vertex(i); } }
    pos.needsUpdate = true; (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true; (geo.attributes.aGlow as THREE.BufferAttribute).needsUpdate = true; (geo.attributes.aSel as THREE.BufferAttribute).needsUpdate = true;
    // normals are the slow part: while lanes morph, redo them every few frames (and always at the end)
    if (!only || ++normalsDue >= 3) { geo.computeVertexNormals(); normalsDue = 0; }
  };
  // the ground's material: vertex colours over a fine detail texture, plus glowing cracks / grid where the lands call for it
  const detail = canvasTex(256, 256, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { const v = 190 + Math.random() * 65; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3); } for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.lineWidth = 1; const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.random() * 6 - 3, y - 4 - Math.random() * 6); g.stroke(); } }, [BOARD_W / 1.6, BOARD_D / 1.6]);
  const cracks = canvasTex(256, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.lineCap = 'round'; for (let i = 0; i < 11; i++) { let x = Math.random() * 256, y = Math.random() * 256; const pts = [[x, y]]; for (let k = 0; k < 7; k++) { x += Math.random() * 50 - 25; y += Math.random() * 50 - 25; pts.push([x, y]); } for (const [w, c] of [[7, 'rgba(255,255,255,0.25)'], [3, 'rgba(255,255,255,0.8)'], [1.2, '#ffffff']] as const) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); } } }, [1, 1]);
  const grid = canvasTex(128, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); for (const [w, a] of [[6, 0.25], [2, 1]] as const) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = w; g.beginPath(); for (let i = 0; i <= 4; i++) { g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.moveTo(0, i * 32); g.lineTo(128, i * 32); } g.stroke(); } }, [1, 1]);
  const uTime = { value: 0 };
  const groundM = T(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: detail, roughness: 0.82, metalness: 0.02 }));
  groundM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uCrack: { value: cracks }, uGrid: { value: grid }, uTime, uRep: { value: new THREE.Vector2(BOARD_W / 2.4, BOARD_D / 2.4) } });
    sh.vertexShader = 'attribute vec3 aGlow; attribute float aSel; varying vec3 vGlow; varying float vSel; varying vec2 vGUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = aGlow; vSel = aSel; vGUv = uv;');
    sh.fragmentShader = 'uniform sampler2D uCrack; uniform sampler2D uGrid; uniform float uTime; uniform vec2 uRep; varying vec3 vGlow; varying float vSel; varying vec2 vGUv;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n vec3 gpat = mix(texture2D(uCrack, vGUv * uRep).rgb, texture2D(uGrid, vGUv * uRep * 1.6).rgb, vSel);\n totalEmissiveRadiance += vGlow * gpat * (1.1 + 0.35 * sin(uTime * 1.7 + vGUv.x * 9.0));');
  };
  const ground = new THREE.Mesh(geo, groundM); ground.receiveShadow = true; group.add(ground);
  // the island underneath: layered earth round the edges
  const sideTex = canvasTex(256, 64, (g) => { const L = ['#4FA552', '#6A4A2A', '#5A3A1E', '#7A6A58', '#4A3828', '#3A2A20']; let y = 0; const hs = [6, 12, 10, 14, 12, 10]; L.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * 0.15 + i) * 1.5); g.lineTo(256, y + hs[i] + 1); g.lineTo(0, y + hs[i] + 1); g.fill(); y += hs[i]; }); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`; g.fillRect(Math.random() * 256, 6 + Math.random() * 58, 3, 2); } }, [6, 1]);
  const sideM = T(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.95 }));
  const body = new THREE.Mesh(T(new THREE.BoxGeometry(BOARD_W, 1.6, BOARD_D)), [sideM, sideM, T(new THREE.MeshStandardMaterial({ color: '#4A3828' })), sideM, sideM, sideM]); body.position.y = -0.85; body.receiveShadow = true; group.add(body);
  // the creek across the middle
  const waterTex = canvasTex(128, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#3AC8F0'); gr.addColorStop(1, '#1A6AB0'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const y = Math.random() * 128; g.beginPath(); g.moveTo(Math.random() * 128, y); g.quadraticCurveTo(64, y + 6, Math.random() * 128 + 40, y + 2); g.stroke(); } }, [BOARD_W / 2, 0.6]);
  const water = new THREE.Mesh(T(new THREE.PlaneGeometry(BOARD_W - 0.2, 1.1)), T(new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.2, emissive: '#1A8AC0', emissiveIntensity: 0.45, depthWrite: false })));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.17; group.add(water);
  // little stepping-stone bridges where each lane crosses it
  const stoneM = T(new THREE.MeshStandardMaterial({ color: '#8A8296', roughness: 0.9, flatShading: true })), stoneG = T(new THREE.DodecahedronGeometry(0.2, 0));
  for (let l = 0; l < 4; l++) for (let k = -1; k <= 1; k++) { const st = new THREE.Mesh(stoneG, stoneM); st.position.set(laneX(l) + (k % 2 ? 0.35 : -0.25), -0.16, k * 0.36); st.scale.set(1.3, 0.45, 1.1); st.rotation.y = Math.random() * 3; st.castShadow = !o.phone; group.add(st); }

  // ---- the lands' props (trees, crystals, candy…) on top, one set per lane ----
  const props: (Land | null)[][] = [[null, null, null, null], [null, null, null, null]];
  // the ground's height at a point (read straight off the sheet)
  const heightAt = (x: number, z: number) => {
    const fx = (x + BOARD_W / 2) / BOARD_W * nx, fz = (z + BOARD_D / 2) / BOARD_D * nz;
    const ix = Math.max(0, Math.min(nx - 1, Math.floor(fx))), iz = Math.max(0, Math.min(nz - 1, Math.floor(fz)));
    const tx = fx - ix, tz = fz - iz, at = (a: number, b: number) => pos.getY(b * (nx + 1) + a);
    return (at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx) * (1 - tz) + (at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx) * tz;
  };
  /** the ground's height at a point once every lane has finished changing (for placing props), without touching the sheet */
  const finalHeightAt = (x: number, z: number) => {
    const fx = (x + BOARD_W / 2) / BOARD_W * nx, fz = (z + BOARD_D / 2) / BOARD_D * nz;
    const ix = Math.max(0, Math.min(nx - 1, Math.floor(fx))), iz = Math.max(0, Math.min(nz - 1, Math.floor(fz)));
    const tx = fx - ix, tz = fz - iz, at = (a: number, b: number) => vertex(b * (nx + 1) + a, true);
    return (at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx) * (1 - tz) + (at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx) * tz;
  };
  const growing = new Map<Land, number>();
  // props to build, one lane per frame (a cataclysm can change all eight lanes at once)
  const queue: { side: Side; lane: number; t: Terrain; grow: boolean }[] = [];
  const buildProps = (side: Side, lane: number, t: Terrain, grow: boolean) => {
    const L = lanes[side][lane], k0 = L.k; L.k = 1;
    const cx = laneX(lane), cz = rowZ(side);
    const land = buildLand(t, { phone: o.phone, seed: side * 10 + lane, w: LANE_W - 0.35, d: LANE_D, ground: (x, z) => finalHeightAt(cx + x, cz + z) });
    L.k = k0;
    land.group.position.set(cx, 0, cz); group.add(land.group); props[side][lane] = land;
    land.grow(grow ? 0 : 1); if (grow) growing.set(land, 0);
  };
  const setLane = (side: Side, lane: number, t: Terrain | null, grow: boolean) => {
    const L = lanes[side][lane];
    if (L.to === t && L.k >= 1) return false;
    L.from = grow ? (L.k >= 1 ? L.to : L.from) : t; L.to = t; L.k = grow ? 0 : 1;
    if (!grow) rebuild([[side, lane]]);
    // its props: the old ones go now, the new ones are built on the next free frame
    const old = props[side][lane];
    if (old) { growing.delete(old); group.remove(old.group); old.dispose(); props[side][lane] = null; }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].side === side && queue[i].lane === lane) queue.splice(i, 1);
    if (t) { if (grow) queue.push({ side, lane, t, grow }); else buildProps(side, lane, t, false); }
    return true;
  };
  for (let s = 0; s < 2; s++) for (let l = 0; l < 4; l++) setLane(s as Side, l, null, false);
  rebuild();
  return {
    group, heightAt, setLane,
    terrainOf: (side: Side, lane: number) => lanes[side][lane].to,
    tick(dt: number, t: number, emit: Emitter) {
      uTime.value = t;
      // lands morphing in
      const moving: [number, number][] = [];
      lanes.forEach((side, sd) => side.forEach((L, l) => { if (L.k < 1) { L.k = Math.min(1, L.k + dt / 1.1); moving.push([sd, l]); } }));
      if (moving.length) { rebuild(moving); if (moving.every(([sd, l]) => lanes[sd][l].k >= 1)) { geo.computeVertexNormals(); normalsDue = 0; } }
      const q = queue.shift(); if (q) buildProps(q.side, q.lane, q.t, q.grow);
      for (const [land, k] of growing) { const k2 = Math.min(1, k + dt / 1.5); growing.set(land, k2); land.grow(k2); if (k2 >= 1) growing.delete(land); }
      for (const side of props) for (const p of side) p?.tick(dt, t, emit);
      (water.material as THREE.MeshStandardMaterial).map!.offset.x = t * 0.05;
    },
    colorOf: (t: Terrain) => TERRAIN_INFO[t].color,
    dispose() { for (const side of props) for (const p of side) p?.dispose(); for (const x of bag) x.dispose(); },
  };
}
