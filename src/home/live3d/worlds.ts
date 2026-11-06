// 3D party games, the worlds you're whisked away to. Everyone's explorer runs about in a proper 3D place:
// Candy Park (tag), a Moonlit Garden (hide & seek), a Volcano Lake (floor is lava) and a Grand Ballroom
// (musical chairs). The host's snapshots are smoothed between, and the camera follows you.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../../lib/gfx';
import { rng } from '../party/kit';
import { LAVA, inBush, sees, type ChairW, type HSW, type LavaW, type Ob, type P3, type TagW, type W3 } from './sims';

export type Seat3 = { id: string; name: string; color: string; url: string };
type Ctx = { scene: THREE.Scene; T: <X extends { dispose(): void }>(x: X) => X; std: (c: string, p?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial; tex: (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep?: number) => THREE.CanvasTexture; obs: Ob[]; phone: boolean };
type Env = { update(w: W3, t: number, dt: number): void; sky: string; fog: [string, number, number]; light: 'day' | 'night' | 'lava' | 'ball'; hidden?(w: W3, viewer: P3 | undefined, other: P3): number };
const mesh = (ctx: Ctx, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = ctx.scene) => { const o = new THREE.Mesh(ctx.T(g), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

function tree(ctx: Ctx, x: number, z: number, h: number, leaf: string, round = true) {
  mesh(ctx, new THREE.CylinderGeometry(0.18, 0.26, h * 0.45, 8), ctx.std('#7A4B2A'), x, h * 0.22, z);
  if (round) { for (const [dx, dy, dz, r] of [[0, 0.62, 0, 0.95], [0.4, 0.5, 0.2, 0.6], [-0.35, 0.55, -0.25, 0.65], [0, 0.85, 0.1, 0.55]]) mesh(ctx, new THREE.SphereGeometry(r * h * 0.32, 14, 10), ctx.std(leaf, { roughness: 0.9 }), x + dx * h * 0.3, h * dy, z + dz * h * 0.3); }
  else for (let k = 0; k < 3; k++) mesh(ctx, new THREE.ConeGeometry(h * (0.3 - k * 0.07), h * 0.38, 10), ctx.std(leaf, { roughness: 0.9 }), x, h * (0.45 + k * 0.2), z);
}

// ---- Candy Park (tag) ------------------------------------------------------------------------------------------------
function candyPark(ctx: Ctx): Env {
  const H = 11;
  const grass = ctx.tex(512, 512, (g) => { g.fillStyle = '#7ED957'; g.fillRect(0, 0, 512, 512); const r = rng(3); for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? '#6CC84A' : '#94E86E'; g.fillRect(r() * 512, r() * 512, 2, 4); } }, 6);
  const ground = mesh(ctx, new THREE.PlaneGeometry(60, 60), ctx.std('#ffffff', { map: grass, roughness: 1 }), 0, 0, 0); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  // a pastel path round the fountain
  const path = mesh(ctx, new THREE.RingGeometry(2.4, 3.6, 48), ctx.std('#F7D9A8', { roughness: 0.95 }), 0, 0.01, 0); path.rotation.x = -Math.PI / 2; path.castShadow = false;
  // a picket fence
  const fence = ctx.std('#FFFFFF', { roughness: 0.6 });
  for (const s of [-1, 1]) for (let k = -H; k <= H; k += 0.8) { mesh(ctx, new THREE.BoxGeometry(0.12, 0.9, 0.1), fence, k, 0.45, s * H); mesh(ctx, new THREE.BoxGeometry(0.1, 0.9, 0.12), fence, s * H, 0.45, k); }
  for (const s of [-1, 1]) { mesh(ctx, new THREE.BoxGeometry(2 * H, 0.08, 0.06), fence, 0, 0.65, s * H); mesh(ctx, new THREE.BoxGeometry(0.06, 0.08, 2 * H), fence, s * H, 0.65, 0); }
  const water: THREE.Mesh[] = [];
  for (const o of ctx.obs) {
    if (o.m === 'tree') tree(ctx, o.x, o.z, 3.6, ['#FF9FD6', '#9FE8FF', '#C9F28C', '#FFD59F'][Math.floor(Math.abs(o.x * 7 + o.z)) % 4]);
    if (o.m === 'fountain') {
      mesh(ctx, new THREE.CylinderGeometry(1.7, 1.8, 0.7, 32), ctx.std('#F2EFE8', { roughness: 0.8 }), 0, 0.35, 0);
      water.push(mesh(ctx, new THREE.CylinderGeometry(1.5, 1.5, 0.05, 32), ctx.std('#7FD3FF', { roughness: 0.1, emissive: '#3FA9E8', emissiveIntensity: 0.3 }), 0, 0.68, 0));
      mesh(ctx, new THREE.CylinderGeometry(0.18, 0.25, 1.6, 12), ctx.std('#F2EFE8'), 0, 1.1, 0);
      mesh(ctx, new THREE.CylinderGeometry(0.7, 0.4, 0.2, 24), ctx.std('#F2EFE8'), 0, 1.9, 0);
      for (let i = 0; i < 8; i++) water.push(mesh(ctx, new THREE.SphereGeometry(0.07, 6, 6), ctx.std('#BFEFFF', { transparent: true, opacity: 0.8 }), 0, 2, 0));
    }
    if (o.m === 'slide' && o.k === 'b') {
      mesh(ctx, new THREE.BoxGeometry(1.2, 2.2, 1.2), ctx.std('#FF6B9E'), o.x, 1.1, o.z - 1.2);
      const sl = mesh(ctx, new THREE.BoxGeometry(1.0, 0.1, 3.0), ctx.std('#FFD23F', { roughness: 0.3 }), o.x, 1.1, o.z + 0.4); sl.rotation.x = 0.62;
      mesh(ctx, new THREE.ConeGeometry(0.95, 0.8, 4), ctx.std('#7C5CFF'), o.x, 2.6, o.z - 1.2).rotation.y = Math.PI / 4;
    }
    if (o.m === 'climber' && o.k === 'b') { const m = ctx.std('#22B8CF', { metalness: 0.3, roughness: 0.4 }); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), m, o.x - 1.5 + i, 0.8, o.z + s * 0.5); for (let j = 0; j < 4; j++) mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), m, o.x, 0.3 + j * 0.42, o.z + (j % 2 ? 0.5 : -0.5)).rotation.z = Math.PI / 2; }
    if (o.m === 'bench' && o.k === 'b') { mesh(ctx, new THREE.BoxGeometry(o.w, 0.12, o.d), ctx.std('#B5733A'), o.x, 0.45, o.z); for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(o.w > o.d ? 0.1 : o.w, 0.45, o.w > o.d ? o.d : 0.1), ctx.std('#555'), o.x + (o.w > o.d ? s * (o.w / 2 - 0.2) : 0), 0.22, o.z + (o.w > o.d ? 0 : s * (o.d / 2 - 0.2))); }
  }
  // balloons tied to the fence
  const balloons: THREE.Mesh[] = [];
  const r = rng(11); for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2; const b = mesh(ctx, new THREE.SphereGeometry(0.32, 14, 12), ctx.std(['#FF3D6E', '#FFD23F', '#22B8CF', '#8B5CFF', '#3DDC97'][i % 5], { roughness: 0.25 }), Math.sin(a) * H * 0.98, 3, Math.cos(a) * H * 0.98); b.scale.y = 1.2; balloons.push(b); }
  return {
    sky: '#9FD8FF', fog: ['#BFE6FF', 25, 70], light: 'day',
    update(_w, t) {
      water.slice(1).forEach((d, i) => { const p = (t * 0.9 + i / 8) % 1, a = (i / 8) * Math.PI * 2; d.position.set(Math.sin(a) * p * 1.2, 2 + Math.sin(p * Math.PI) * 0.5 - p * 1.3, Math.cos(a) * p * 1.2); });
      balloons.forEach((b, i) => { b.position.y = 3 + Math.sin(t * 1.3 + i) * 0.2; });
    },
  };
}

// ---- Moonlit Garden (hide & seek) ------------------------------------------------------------------------------------
function moonGarden(ctx: Ctx): Env {
  const grass = ctx.tex(512, 512, (g) => { g.fillStyle = '#25483A'; g.fillRect(0, 0, 512, 512); const r = rng(7); for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? '#1E3D31' : '#2E5646'; g.fillRect(r() * 512, r() * 512, 2, 4); } }, 6);
  const ground = mesh(ctx, new THREE.PlaneGeometry(60, 60), ctx.std('#ffffff', { map: grass, roughness: 1 }), 0, 0, 0); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  const hedgeTex = ctx.tex(256, 256, (g) => { g.fillStyle = '#2F6B3A'; g.fillRect(0, 0, 256, 256); const r = rng(9); for (let i = 0; i < 1400; i++) { g.fillStyle = ['#255C31', '#3E8E41', '#2A6236'][i % 3]; g.beginPath(); g.arc(r() * 256, r() * 256, 3 + r() * 5, 0, Math.PI * 2); g.fill(); } }, 1);
  const hedgeM = ctx.std('#ffffff', { map: hedgeTex, roughness: 1 });
  for (const o of ctx.obs) {
    if (o.m === 'hedge' && o.k === 'b') { const h = mesh(ctx, new THREE.BoxGeometry(o.w, o.h, o.d), hedgeM, o.x, o.h / 2, o.z); h.material = hedgeM; }
    if (o.m === 'tree' && o.k === 'c') tree(ctx, o.x, o.z, 5, '#1F4D3A', false);
    if (o.m === 'bush' && o.k === 'c') for (const [dx, dz, r] of [[0, 0, 0.75], [0.4, 0.3, 0.5], [-0.4, 0.25, 0.55], [0.1, -0.4, 0.5]]) { const b = mesh(ctx, new THREE.SphereGeometry(r, 12, 10), ctx.std('#2E7D4A', { roughness: 1, transparent: true, opacity: 0.96 }), o.x + dx, r * 0.75, o.z + dz); b.userData.bush = true; }
    if (o.m === 'well' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(1.1, 1.1, 0.9, 20, 1, true), ctx.std('#8C8C99', { side: THREE.DoubleSide }), o.x, 0.45, o.z); for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(0.12, 2, 0.12), ctx.std('#6B4226'), o.x + s * 1, 1, o.z); mesh(ctx, new THREE.ConeGeometry(1.5, 0.7, 4), ctx.std('#7A3B2E'), o.x, 2.3, o.z).rotation.y = Math.PI / 4; }
  }
  // lanterns on posts, a big moon, fireflies
  const lamps: THREE.PointLight[] = [];
  for (const [x, z] of [[-10, -10], [10, 10], [10, -10], [-10, 10]]) { mesh(ctx, new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), ctx.std('#222'), x, 1.1, z); mesh(ctx, new THREE.SphereGeometry(0.22, 12, 10), ctx.std('#FFE6A0', { emissive: '#FFC857', emissiveIntensity: 2 }), x, 2.3, z); if (!ctx.phone) { const l = new THREE.PointLight('#FFC857', 6, 9, 1.8); l.position.set(x, 2.3, z); ctx.scene.add(l); lamps.push(l); } }
  const moon = mesh(ctx, new THREE.SphereGeometry(3, 24, 18), new THREE.MeshBasicMaterial({ color: '#F4F1DE' }), -18, 22, -40); moon.castShadow = false;
  const flies = Array.from({ length: 30 }, (_, i) => mesh(ctx, new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: '#E8FF8A' }), 0, 1, 0)).map((m, i) => ({ m, a: i * 1.7, r: 2 + (i % 7) * 1.4 }));
  return {
    sky: '#0B1430', fog: ['#0B1430', 10, 34], light: 'night',
    update(_w, t) { flies.forEach((f, i) => { f.m.position.set(Math.sin(t * 0.3 + f.a) * f.r, 0.6 + Math.sin(t * 2 + i) * 0.4, Math.cos(t * 0.27 + f.a * 1.3) * f.r); (f.m.material as THREE.MeshBasicMaterial).color.setScalar(0.5 + 0.5 * Math.max(0, Math.sin(t * 3 + i))); }); lamps.forEach((l, i) => { l.intensity = 5 + Math.sin(t * 4 + i) * 0.6; }); },
    // the seeker only sees what their lantern lights, and never what's tucked in a bush (unless right next to it)
    hidden(w, viewer, other) {
      const hs = w as HSW;
      if (!viewer || viewer.id !== hs.seeker || other.id === viewer.id || hs.phase === 'between' || hs.phase === 'done') return 1;
      if (hs.found[other.id] != null) return 1;
      const d = Math.hypot(other.x - viewer.x, other.z - viewer.z);
      if (d < 1.6) return 1;
      if (inBush(ctx.obs, other.x, other.z)) return 0;
      if (d > 9 || !sees(ctx.obs, viewer.x, viewer.z, other.x, other.z)) return 0;
      // in front of you (a wide lantern beam)
      const ang = Math.atan2(other.x - viewer.x, other.z - viewer.z); let da = ang - viewer.face; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) < 1.1 || d < 3 ? 1 : 0;
    },
  };
}

// ---- Volcano Lake (floor is lava) ---------------------------------------------------------------------------------------
function volcano(ctx: Ctx): Env {
  const lavaTex = ctx.tex(256, 256, (g) => { const r = rng(4); g.fillStyle = '#FF4D00'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 90; i++) { g.fillStyle = ['#FF8A00', '#FFD23F', '#C21D00'][i % 3]; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(r() * 256, r() * 256, 8 + r() * 26, 5 + r() * 14, r() * 3, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }, 6);
  const lavaM = ctx.std('#ffffff', { map: lavaTex, emissive: '#ffffff', emissiveMap: lavaTex, emissiveIntensity: 1.1, roughness: 0.6 });
  const lake = mesh(ctx, new THREE.PlaneGeometry(90, 90), lavaM, 0, LAVA.LAVA + 0.5, 0); lake.rotation.x = -Math.PI / 2; lake.castShadow = false;
  const glow = new THREE.PointLight('#FF6A00', 60, 40, 1.4); glow.position.set(0, LAVA.LAVA + 3, 0); ctx.scene.add(glow);
  // the crater walls
  const rock = ctx.std('#3B2A26', { roughness: 1, flatShading: true });
  const r = rng(6);
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, d = 17 + r() * 4; const m = mesh(ctx, new THREE.ConeGeometry(3 + r() * 3, 14 + r() * 16, 6), rock, Math.sin(a) * d, LAVA.LAVA + 5, Math.cos(a) * d); m.rotation.y = r() * 3; }
  // two floors of tiles
  const N = LAVA.N, S = LAVA.S;
  const layers = LAVA.Y.map((y, L) => Array.from({ length: N * N }, (_, i) => {
    const x = (i % N - (N - 1) / 2) * S, z = (Math.floor(i / N) - (N - 1) / 2) * S;
    const col = L === 0 ? ((i % N) + Math.floor(i / N)) % 2 ? '#FF7AC8' : '#3FD0FF' : ((i % N) + Math.floor(i / N)) % 2 ? '#FFD23F' : '#B6E33D';
    const m = mesh(ctx, new THREE.BoxGeometry(S - 0.08, 0.45, S - 0.08), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.18 }), x, y - 0.225, z);
    ctx.T(m.material as THREE.Material);
    return { m, base: col, x, z, y, fall: 0 };
  }));
  const embers = Array.from({ length: ctx.phone ? 25 : 50 }, (_, i) => ({ m: mesh(ctx, new THREE.SphereGeometry(0.06, 5, 5), new THREE.MeshBasicMaterial({ color: '#FFB13D' }), 0, 0, 0), a: i * 2.3, r: 2 + (i % 9) * 1.6, s: 0.5 + (i % 5) * 0.2 }));
  return {
    sky: '#2A0A06', fog: ['#4A1408', 18, 60], light: 'lava',
    update(w, t, dt) {
      const lw = w as LavaW;
      lavaTex.offset.set(t * 0.02, t * 0.013);
      glow.intensity = 55 + Math.sin(t * 2) * 8;
      layers.forEach((L, li) => L.forEach((tile, i) => {
        const st = lw.tiles?.[li]?.[i] ?? '1';
        if (st === '0') { if (tile.m.visible) { tile.fall += dt; tile.m.position.y = tile.y - 0.225 - tile.fall * tile.fall * 12; tile.m.rotation.x += dt * 2; if (tile.fall > 1.2) tile.m.visible = false; } }
        else { tile.fall = 0; tile.m.visible = true; tile.m.rotation.x = 0; tile.m.position.y = tile.y - 0.225 + (st === '2' ? Math.sin(t * 60 + i) * 0.03 : 0); (tile.m.material as THREE.MeshStandardMaterial).color.set(st === '2' ? '#FF5A3D' : tile.base); }
      }));
      embers.forEach((e) => { const p = (t * e.s * 0.2 + e.a) % 1; e.m.position.set(Math.sin(e.a * 3) * e.r, LAVA.LAVA + p * 16, Math.cos(e.a * 5) * e.r); });
    },
  };
}

// ---- Grand Ballroom (musical chairs) ------------------------------------------------------------------------------------
function ballroom(ctx: Ctx): Env {
  const R = 8.5;
  const floorTex = ctx.tex(1024, 1024, (g) => {
    g.fillStyle = '#8B5A3C'; g.fillRect(0, 0, 1024, 1024);
    for (let ring = 0; ring < 9; ring++) { g.strokeStyle = ring % 2 ? '#A0693F' : '#6E4429'; g.lineWidth = 56; g.beginPath(); g.arc(512, 512, 60 + ring * 56, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#E9C46A'; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(512, 512); g.arc(512, 512, 120, a, a + 0.1); g.fill(); }
  }, 1);
  const fl = mesh(ctx, new THREE.CircleGeometry(R + 0.6, 64), ctx.std('#ffffff', { map: floorTex, roughness: 0.35, metalness: 0.05 }), 0, 0, 0); fl.rotation.x = -Math.PI / 2; fl.castShadow = false;
  const outer = mesh(ctx, new THREE.PlaneGeometry(60, 60), ctx.std('#2A1A2E', { roughness: 1 }), 0, -0.01, 0); outer.rotation.x = -Math.PI / 2;
  // pillars and curtains round the edge
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, x = Math.sin(a) * (R + 1.2), z = Math.cos(a) * (R + 1.2);
    mesh(ctx, new THREE.CylinderGeometry(0.35, 0.4, 6, 14), ctx.std('#F2E8D5', { roughness: 0.5 }), x, 3, z);
    mesh(ctx, new THREE.BoxGeometry(0.9, 0.3, 0.9), ctx.std('#E9C46A', { metalness: 0.6, roughness: 0.3 }), x, 6, z);
    const c = mesh(ctx, new THREE.PlaneGeometry(2.6, 5.4), ctx.std('#8B1E3F', { roughness: 1, side: THREE.DoubleSide }), Math.sin(a + 0.2) * (R + 1.6), 2.9, Math.cos(a + 0.2) * (R + 1.6)); c.lookAt(0, 2.9, 0);
  }
  // the gramophone in the middle, a disco ball and chandeliers above
  mesh(ctx, new THREE.CylinderGeometry(1.3, 1.4, 1.1, 32), ctx.std('#5A3A26', { roughness: 0.4 }), 0, 0.55, 0);
  mesh(ctx, new THREE.BoxGeometry(0.7, 0.3, 0.7), ctx.std('#6B4226'), 0, 1.25, 0);
  const horn = mesh(ctx, new THREE.ConeGeometry(0.7, 1.4, 24, 1, true), ctx.std('#E9C46A', { metalness: 0.8, roughness: 0.25, side: THREE.DoubleSide }), 0.3, 2.1, 0.3); horn.rotation.set(-0.9, 0, -0.5);
  const disco = mesh(ctx, new THREE.IcosahedronGeometry(1.1, 2), ctx.std('#E0E6F5', { metalness: 0.35, roughness: 0.2, flatShading: true, emissive: '#8890B0', emissiveIntensity: 0.35 }), 0, 7.5, 0);
  const spots: THREE.SpotLight[] = [];
  if (!ctx.phone) for (let i = 0; i < 3; i++) { const s = new THREE.SpotLight(['#FF3D9A', '#22E3FF', '#FFE14D'][i], 40, 30, 0.35, 0.6); s.position.set(0, 8, 0); ctx.scene.add(s, s.target); spots.push(s); }
  // chairs: a pool of them, shown as the music stops
  const chairM = ctx.std('#E9C46A', { metalness: 0.5, roughness: 0.3 }), seatM = ctx.std('#B5485D', { roughness: 0.8 });
  const chairsG = Array.from({ length: 8 }, () => {
    const g = new THREE.Group(); g.visible = false; ctx.scene.add(g);
    mesh(ctx, new THREE.BoxGeometry(0.7, 0.12, 0.7), seatM, 0, 0.5, 0, g);
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) mesh(ctx, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), chairM, x, 0.25, z, g);
    mesh(ctx, new THREE.BoxGeometry(0.7, 0.8, 0.08), chairM, 0, 0.95, -0.32, g);
    const halo = mesh(ctx, new THREE.RingGeometry(0.6, 0.78, 32), new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0, 0.02, 0, g); halo.rotation.x = -Math.PI / 2; halo.castShadow = false;
    return { g, halo, k: 0 };
  });
  return {
    sky: '#1A0E24', fog: ['#1A0E24', 18, 50], light: 'ball',
    update(w, t, dt) {
      const cw = w as ChairW, playing = cw.phase === 'music';
      disco.rotation.y += dt * (playing ? 1.2 : 0.1);
      spots.forEach((s, i) => { s.target.position.set(Math.sin(t * (playing ? 1.1 : 0.2) + i * 2.1) * 5, 0, Math.cos(t * (playing ? 0.9 : 0.2) + i * 2.1) * 5); s.intensity = playing ? 40 : (Math.floor(t * 6) % 2 ? 60 : 10); });
      chairsG.forEach((c, i) => {
        const ch = cw.chairs?.[i];
        if (!ch) { c.g.visible = false; c.k = 0; return; }
        c.g.visible = true; c.k = Math.min(1, c.k + dt * 4);
        c.g.position.set(ch.x, 0, ch.z); c.g.scale.setScalar(c.k < 1 ? c.k * (1.2 - 0.2 * c.k) : 1); c.g.lookAt(0, 0, 0);
        (c.halo.material as THREE.MeshBasicMaterial).opacity = ch.by ? 0 : 0.5 + 0.4 * Math.sin(t * 8);
      });
    },
  };
}

const ENVS: Record<string, (ctx: Ctx) => Env> = { tag: candyPark, hide: moonGarden, lava: volcano, chairs: ballroom };

export function createWorld3D(o: { canvas: HTMLCanvasElement; game: string; seats: Seat3[]; me: string; obs: Ob[] | undefined; reduceMotion?: boolean }) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const std = (c: string, p: THREE.MeshStandardMaterialParameters = {}) => { const k = c + JSON.stringify(p, (kk, v) => (v instanceof THREE.Texture ? v.uuid : v)); let m = mats.get(k); if (!m) { m = T(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...p })); mats.set(k, m); } return m; };
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d')!); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; return t; };
  const ctx: Ctx = { scene, T, std, tex, obs: o.obs ?? [], phone };
  const env = ENVS[o.game](ctx);
  scene.background = new THREE.Color(env.sky); scene.fog = new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]);
  // light by mood
  const L = env.light;
  scene.add(new THREE.HemisphereLight(L === 'night' ? '#4A5FA8' : L === 'lava' ? '#FF9A6B' : L === 'ball' ? '#C9A0FF' : '#FFFFFF', L === 'night' ? '#0B1430' : '#3A2A20', L === 'night' ? 0.6 : L === 'ball' ? 1.15 : 1.1));
  const sun = new THREE.DirectionalLight(L === 'night' ? '#9FB4FF' : L === 'lava' ? '#FFB27A' : '#FFF4E0', L === 'night' ? 0.8 : L === 'ball' ? 0.9 : 2.2);
  sun.position.set(8, 18, 10); sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 }); sun.shadow.bias = -0.0005;
  scene.add(sun);
  // the seeker's lantern
  const lantern = new THREE.SpotLight('#FFE6A0', o.game === 'hide' ? 50 : 0, 14, 0.75, 0.5, 1.4); scene.add(lantern, lantern.target);

  // things that can stand between the camera and you fade out while they do
  const occ: THREE.Mesh[] = [];
  if (o.game !== 'lava') scene.traverse((x) => { if (x instanceof THREE.Mesh && !Array.isArray(x.material)) { x.geometry.computeBoundingSphere(); if ((x.geometry.boundingSphere?.radius ?? 99) < 6) occ.push(x); } });
  const ray = new THREE.Raycaster(), faded = new Set<THREE.Mesh>();
  const fadeMat = (m: THREE.Mesh) => (m.userData.fade ??= (() => { const f = T((m.material as THREE.Material).clone()); f.transparent = true; f.opacity = 0.28; f.depthWrite = false; return f; })()) as THREE.Material;

  // ---- everyone's explorer ----
  const tagTex = (text: string, bg = 'rgba(20,12,30,0.75)') => { const c = document.createElement('canvas'); c.width = 256; c.height = 56; const g = c.getContext('2d')!; g.font = '800 26px ui-rounded, system-ui, sans-serif'; const w = Math.min(250, g.measureText(text).width + 24); g.fillStyle = bg; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 42, 21); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 28); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return T(t); };
  const avs = new Map(o.seats.map((s) => {
    const tx = T(new THREE.TextureLoader().load(s.url)); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = THREE.RepeatWrapping;
    const sp = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.05 }))); sp.center.set(0.5, 0); sp.scale.set(1.35 * (46 / 68), 1.35, 1); scene.add(sp);
    const ringM = T(new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85, depthWrite: false }));
    const ring = new THREE.Mesh(T(new THREE.RingGeometry(0.34, 0.46, 28)), ringM); ring.rotation.x = -Math.PI / 2; scene.add(ring);
    const shadow = new THREE.Mesh(T(new THREE.CircleGeometry(0.34, 18)), T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }))); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const tag = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: tagTex(s.id === o.me ? 'You' : s.name), transparent: true, depthWrite: false, depthTest: false }))); tag.scale.set(1.4, 0.31, 1); tag.renderOrder = 5; scene.add(tag);
    const it = new THREE.Mesh(T(new THREE.SphereGeometry(0.75, 18, 14)), T(new THREE.MeshBasicMaterial({ color: '#FF2D55', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }))); it.visible = false; scene.add(it);
    return [s.id, { sp, tx, ring, ringM, shadow, tag, it, walk: 0, lastX: 0, lastZ: 0 }];
  }));
  const itTag = tagTex('IT!', '#FF2D55');

  // ---- camera ----
  const camPos = new THREE.Vector3(0, 30, 30), camLook = new THREE.Vector3(0, 0, 0);
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let last = performance.now();
  const lerpP = (a: P3 | undefined, b: P3, k: number) => (a ? { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.y + (b.y - a.y) * k } : b);

  return {
    /** draw: w is the latest world, prev the one before, a how far between them (0..1), t the time */
    frame(w: W3, prev: W3 | null, a: number, t: number, intro: number) {
      const now = performance.now(), raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now; tune(raw);
      env.update(w, t, dt);
      const meP = w.ps.find((p) => p.id === o.me);
      for (const p of w.ps) {
        const av = avs.get(p.id); if (!av) continue;
        const q = lerpP(prev?.ps.find((x) => x.id === p.id), p, a);
        const vis = env.hidden ? env.hidden(w, meP, p) : 1;
        const hs = o.game === 'hide' ? (w as HSW) : null;
        const ghost = (hs && hs.found[p.id] != null) || (!p.alive && o.game !== 'lava');
        const seen = vis > 0 && !(o.game === 'lava' && !p.alive && q.y < LAVA.LAVA - 1);
        const moved = Math.hypot(q.x - av.lastX, q.z - av.lastZ); av.lastX = q.x; av.lastZ = q.z;
        if (moved > 0.005) av.walk += moved * 3;
        const bob = p.on && moved > 0.01 && !o.reduceMotion ? Math.abs(Math.sin(av.walk)) * 0.1 : 0;
        av.sp.visible = av.tag.visible = seen; av.ring.visible = av.shadow.visible = seen && p.alive;
        av.sp.position.set(q.x, q.y + bob, q.z); av.sp.material.opacity = ghost ? 0.35 : hs && inBush(ctx.obs, q.x, q.z) && meP?.id !== hs.seeker ? 0.55 : 1;
        // face the way you're going
        const fx = Math.sin(p.face) >= 0 ? 1 : -1; av.tx.repeat.x = fx; av.tx.offset.x = fx < 0 ? 1 : 0;
        av.ring.position.set(q.x, Math.max(q.y, -20) + 0.03, q.z); av.shadow.position.set(q.x, (o.game === 'lava' ? groundBelow(w as LavaW, q.x, q.z, q.y) : 0) + 0.02, q.z);
        av.tag.position.set(q.x, q.y + 1.7, q.z);
        const isIt = o.game === 'tag' && (w as TagW).it === p.id;
        av.it.visible = isIt; if (isIt) { av.it.position.set(q.x, q.y + 0.7, q.z); av.it.scale.setScalar(1 + Math.sin(t * 8) * 0.1); }
        av.tag.material.map = isIt ? itTag : av.tag.material.map === itTag ? tagTex(p.id === o.me ? 'You' : o.seats.find((s) => s.id === p.id)?.name ?? '') : av.tag.material.map;
        av.ringM.color.set(isIt ? '#FF2D55' : o.seats.find((s) => s.id === p.id)?.color ?? '#fff');
      }
      // the lantern follows the seeker
      if (o.game === 'hide') {
        const hs = w as HSW, s = w.ps.find((p) => p.id === hs.seeker);
        if (s) { lantern.position.set(s.x, 2.2, s.z); lantern.target.position.set(s.x + Math.sin(s.face) * 6, 0, s.z + Math.cos(s.face) * 6); lantern.intensity = hs.phase === 'seek' ? 50 : 0; }
      }
      // the camera: a big swoop in at the start, then behind and above you (or over everything once you're out)
      const tall = camera.aspect < 1, back = tall ? 1.35 : 1;
      const follow = meP && (meP.alive || o.game === 'hide') ? meP : null;
      const tx = follow ? follow.x * 0.85 : 0, tz = follow ? follow.z * 0.85 : 0, ty = follow ? Math.max(follow.y, o.game === 'lava' ? -5 : 0) : 0;
      // steep enough that hedges and pillars don't hide you
      const want = follow ? new THREE.Vector3(tx, ty + 10.5 * back, tz + 6 * back) : new THREE.Vector3(0, 22 * back, 13 * back);
      if (intro > 0) want.lerp(new THREE.Vector3(0, 34, 30), Math.min(1, intro));
      camPos.lerp(want, Math.min(1, dt * (intro > 0 ? 2 : 4)));
      camLook.lerp(new THREE.Vector3(tx, ty, tz - (follow ? 1.5 : 0)), Math.min(1, dt * 5));
      camera.position.copy(camPos); camera.lookAt(camLook);
      if (occ.length && meP) {
        const to = new THREE.Vector3(meP.x, meP.y + 0.7, meP.z), d = to.clone().sub(camPos), len = d.length();
        ray.set(camPos, d.normalize()); ray.far = len - 0.3;
        const hit = new Set(ray.intersectObjects(occ, false).map((h) => h.object as THREE.Mesh));
        for (const m of faded) if (!hit.has(m)) { m.material = m.userData.orig; faded.delete(m); }
        for (const m of hit) if (!faded.has(m)) { m.userData.orig = m.material; m.material = fadeMat(m); faded.add(m); }
      }
      renderer.render(scene, camera);
    },
    dispose() { ro.disconnect(); for (const x of bag) x.dispose(); renderer.dispose(); },
  };
}
function groundBelow(w: LavaW, x: number, z: number, y: number) {
  const N = LAVA.N, S = LAVA.S, i = Math.round(x / S + (N - 1) / 2), j = Math.round(z / S + (N - 1) / 2);
  if (i < 0 || j < 0 || i >= N || j >= N) return LAVA.LAVA + 0.5;
  for (let L = 0; L < LAVA.Y.length; L++) if (w.tiles?.[L]?.[j * N + i] !== '0' && y >= LAVA.Y[L] - 0.05) return LAVA.Y[L];
  return LAVA.LAVA + 0.5;
}
export type World3D = ReturnType<typeof createWorld3D>;
