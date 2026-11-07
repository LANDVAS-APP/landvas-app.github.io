// The five realm places in 3D. Every one has the same layout (so it's easy to find your way round): the minigame at
// the back, the stash and the build board either side of it, the maker and the market further forward, and the
// collection at the front; six zones wrap round the outside, opening one by one as the place levels up.
import * as THREE from 'three';
import { rng } from '../home/party/kit';
import { flat, grassTex, mesh, motes, scatter, type Ctx, type Inst } from '../home/live3d/kit3d';
import type { RealmKind } from '../backend/types';
import type { RealmEnv, Spot, Station } from './realm3d';

const B: [number, number] = [9.5, 7];
const SPOTS = (labels: Record<Station, string>): Record<Station, Spot> => ({
  play: { x: 0, z: -5.4, label: labels.play }, collect: { x: -6.8, z: -2.6, label: labels.collect }, build: { x: 6.8, z: -2.6, label: labels.build },
  make: { x: -6.8, z: 3.4, label: labels.make }, market: { x: 6.8, z: 3.4, label: labels.market }, book: { x: 0, z: 6, label: labels.book },
});
/** the six zones round the outside: two on the left, two at the back, two on the right */
const ZONES: [number, number][] = [[-13.5, -6], [-13.5, 4], [-5.5, -13], [5.5, -13], [13.5, -6], [13.5, 4]];
type Z = { open: THREE.Group; locked: THREE.Group; at: [number, number] };
const zones = (f: (i: number, open: THREE.Group, locked: THREE.Group, x: number, z: number) => void): Z[] =>
  ZONES.map(([x, z], i) => { const open = new THREE.Group(), locked = new THREE.Group(); f(i, open, locked, x, z); return { open, locked, at: [x, z] }; });
/** a producer's spot in its zone (the k-th copy along a little arc) */
const pspot = (i: number, k: number): [number, number] => { const [x, z] = ZONES[i]; const side = x < -1 ? 1 : x > 1 ? -1 : 0; return [x + side * 2.6 + (side ? 0 : (k - 1.5) * 1.6), z + (side ? (k - 1.5) * 1.5 : 2.6)]; };
const person = (ctx: Ctx, parent: THREE.Object3D, x: number, z: number, shirt: string, hat?: string) => {
  mesh(ctx, new THREE.CapsuleGeometry(0.22, 0.45, 4, 10), ctx.std(shirt), x, 0.55, z, parent);
  mesh(ctx, new THREE.SphereGeometry(0.2, 12, 10), ctx.std('#F2C9A0'), x, 1.15, z, parent);
  if (hat) mesh(ctx, new THREE.CylinderGeometry(0.22, 0.24, 0.14, 12), ctx.std(hat), x, 1.32, z, parent);
};
const lampGlow = (ctx: Ctx, parent: THREE.Object3D, x: number, y: number, z: number, c: string, s = 0.18) => mesh(ctx, new THREE.SphereGeometry(s, 12, 10), ctx.std(c, { emissive: c, emissiveIntensity: 1.8 }), x, y, z, parent);
const sign = (ctx: Ctx, parent: THREE.Object3D, x: number, z: number, wood = '#6B4A33') => { mesh(ctx, new THREE.BoxGeometry(0.1, 1.4, 0.1), ctx.std(wood), x, 0.7, z, parent); mesh(ctx, new THREE.BoxGeometry(1.2, 0.6, 0.08), ctx.std(wood), x, 1.3, z, parent); };
const counter = (ctx: Ctx, parent: THREE.Object3D, x: number, z: number, top: string, body: string) => { mesh(ctx, new THREE.BoxGeometry(2.2, 0.9, 0.8), ctx.std(body), x, 0.45, z, parent); mesh(ctx, new THREE.BoxGeometry(2.4, 0.1, 1), ctx.std(top), x, 0.95, z, parent); };
const awning = (ctx: Ctx, parent: THREE.Object3D, x: number, z: number, a: string, b: string) => {
  for (const s of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), ctx.std('#8B6B4A'), x + s * 1.1, 1.1, z - 0.4, parent);
  for (let k = 0; k < 6; k++) { const p = mesh(ctx, new THREE.BoxGeometry(0.4, 0.06, 1.2), ctx.std(k % 2 ? a : b), x - 1 + k * 0.4, 2.15, z - 0.1, parent); p.rotation.x = 0.25; }
};
const bookCase = (ctx: Ctx, parent: THREE.Object3D, x: number, z: number, wood: string, items: string[]) => {
  mesh(ctx, new THREE.BoxGeometry(2, 1.6, 0.6), ctx.std(wood), x, 0.8, z - 0.1, parent);
  mesh(ctx, new THREE.BoxGeometry(1.8, 1.3, 0.05), ctx.std('#BFE3FF', { transparent: true, opacity: 0.35, roughness: 0.05 }), x, 0.85, z + 0.22, parent);
  items.forEach((c, k) => mesh(ctx, new THREE.SphereGeometry(0.15, 10, 8), ctx.std(c, { emissive: c, emissiveIntensity: 0.3 }), x - 0.6 + (k % 4) * 0.4, k < 4 ? 1.2 : 0.6, z + 0.05, parent));
};

// ======================================================================================================================
// ⛏️ Crystal Mine
// ======================================================================================================================
function mine(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  const rockTex = ctx.tex(256, 256, (g) => { g.fillStyle = '#4E4656'; g.fillRect(0, 0, 256, 256); const rr = rng(3); for (let i = 0; i < 900; i++) { g.fillStyle = ['#433C4A', '#5C5466', '#4A4352'][i % 3]; g.beginPath(); g.arc(rr() * 256, rr() * 256, 2 + rr() * 6, 0, Math.PI * 2); g.fill(); } }, 10);
  flat(mesh(ctx, new THREE.PlaneGeometry(70, 70), ctx.std('#ffffff', { map: rockTex, roughness: 1 })));
  // the cave walls all round (jagged rock), stalagmites, glowing crystals in the walls
  const rock = ctx.std('#2B2530', { roughness: 1, flatShading: true });
  for (let i = 0; i < 46; i++) { const a = (i / 46) * Math.PI * 2, d = 19 + r() * 4; const m = mesh(ctx, new THREE.DodecahedronGeometry(3 + r() * 3, 0), rock, Math.cos(a) * d * 1.05, 1 + r() * 2, Math.sin(a) * d * 0.95); m.scale.y = 1.4 + r(); m.rotation.set(r(), r(), r()); }
  const stal: Inst[] = []; for (let i = 0; i < 26; i++) { const x = (r() * 2 - 1) * 16, z = (r() * 2 - 1) * 14; if (Math.abs(x) < 10 && Math.abs(z) < 8) continue; stal.push({ x, y: 0.7, z, s: 0.5 + r(), sy: 1 + r() * 1.5 }); }
  scatter(ctx, new THREE.ConeGeometry(0.5, 1.6, 6), rock, stal, true);
  const crys: Inst[] = []; for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 15 + r() * 4; crys.push({ x: Math.cos(a) * d, y: 0.6 + r() * 2.4, z: Math.sin(a) * d, s: 0.3 + r() * 0.4, sy: 1.5, ry: r() * 3, rx: (r() - 0.5) * 0.8, c: ['#8B5CFF', '#22E3FF', '#FF3D9A'][i % 3] }); }
  scatter(ctx, new THREE.OctahedronGeometry(0.6, 0), ctx.std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.2, transparent: true, opacity: 0.9 }), crys);
  // rails across the floor
  const railM = ctx.std('#8A8A99', { metalness: 0.7, roughness: 0.3 }), tie = ctx.std('#5A3A26');
  for (const s of [-0.45, 0.45]) mesh(ctx, new THREE.BoxGeometry(18, 0.08, 0.08), railM, 0, 0.06, -1 + s);
  const ties: Inst[] = []; for (let x = -9; x <= 9; x += 0.7) ties.push({ x, y: 0.03, z: -1 }); scatter(ctx, new THREE.BoxGeometry(0.2, 0.06, 1.3), tie, ties);
  // lanterns on posts
  const lights: THREE.PointLight[] = [];
  for (const [x, z] of [[-4, -4], [4, -4], [-9, 0.5], [9, 0.5], [-3.5, 5.5], [3.5, 5.5]]) {
    mesh(ctx, new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), tie, x, 1.1, z); lampGlow(ctx, ctx.root, x, 2.3, z, '#FFB84D', 0.2);
    if (!ctx.phone && lights.length < 4) { const l = new THREE.PointLight('#FFB84D', 12, 12, 1.4); l.position.set(x, 2.4, z); ctx.scene.add(l); lights.push(l); }
  }
  // stations
  const S = SPOTS({ play: '⛏️ Deep Dig', collect: '🛒 Ore cart', build: '📋 Crew board', make: '🔥 Smelter', market: '⚖️ Ore trader', book: '🦴 Fossil book' });
  // the shaft: a wooden headframe over a hole
  flat(mesh(ctx, new THREE.CircleGeometry(1.3, 20), ctx.std('#08060A'), S.play.x, 0.02, S.play.z - 0.6));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = mesh(ctx, new THREE.BoxGeometry(0.18, 3.4, 0.18), tie, S.play.x + sx * 1.2, 1.7, S.play.z - 0.6 + sz * 1.2); p.rotation.z = -sx * 0.08; }
  mesh(ctx, new THREE.BoxGeometry(2.8, 0.2, 0.2), tie, S.play.x, 3.3, S.play.z - 0.6);
  const wheel = mesh(ctx, new THREE.TorusGeometry(0.55, 0.07, 8, 20), railM, S.play.x, 3.6, S.play.z - 0.6, ctx.dyn);
  mesh(ctx, new THREE.BoxGeometry(0.5, 2.4, 0.06), tie, S.play.x + 0.9, 0.9, S.play.z + 0.2).rotation.x = -0.25;
  // the ore cart, piled high
  mesh(ctx, new THREE.BoxGeometry(1.6, 0.8, 1), ctx.std('#7A4E2D'), S.collect.x, 0.65, S.collect.z);
  for (const s of [-1, 1]) for (const t of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), railM, S.collect.x + s * 0.55, 0.22, S.collect.z + t * 0.52).rotation.x = Math.PI / 2;
  const ore: Inst[] = []; for (let k = 0; k < 12; k++) ore.push({ x: S.collect.x + (r() - 0.5) * 1.2, y: 1.05 + r() * 0.2, z: S.collect.z + (r() - 0.5) * 0.7, s: 0.18 + r() * 0.1, c: ['#B87333', '#C0C0C0', '#FFD23F', '#8B5CFF'][k % 4] });
  scatter(ctx, new THREE.DodecahedronGeometry(1, 0), ctx.std('#ffffff', { roughness: 0.4, metalness: 0.4 }), ore, true);
  sign(ctx, ctx.root, S.build.x, S.build.z); for (let k = 0; k < 3; k++) mesh(ctx, new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#FFD23F'), S.build.x - 0.4 + k * 0.4, 1.62, S.build.z + 0.06);
  // the smelter: a stone furnace with a glowing mouth and a chimney
  mesh(ctx, new THREE.CylinderGeometry(1, 1.2, 1.8, 10), ctx.std('#6B6470', { roughness: 1, flatShading: true }), S.make.x, 0.9, S.make.z);
  mesh(ctx, new THREE.CylinderGeometry(0.35, 0.4, 1.8, 8), ctx.std('#5A5360', { flatShading: true }), S.make.x, 2.6, S.make.z);
  const mouth = mesh(ctx, new THREE.CircleGeometry(0.45, 16), ctx.std('#FF6A00', { emissive: '#FF6A00', emissiveIntensity: 2 }), S.make.x, 0.65, S.make.z + 1.03, ctx.dyn);
  counter(ctx, ctx.root, S.market.x, S.market.z, '#8B6B4A', '#5A3A26'); awning(ctx, ctx.root, S.market.x, S.market.z, '#7C5CFF', '#FFE14D'); person(ctx, ctx.root, S.market.x, S.market.z - 0.9, '#3A6EA5', '#FFD23F');
  mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), railM, S.market.x + 0.7, 1.3, S.market.z); mesh(ctx, new THREE.BoxGeometry(0.8, 0.04, 0.04), railM, S.market.x + 0.7, 1.6, S.market.z);
  bookCase(ctx, ctx.root, S.book.x, S.book.z, '#5A3A26', ['#E8D9A8', '#C9A57A', '#8B5CFF', '#FFD23F', '#B87333', '#E8D9A8', '#22E3FF', '#FF3D9A']);
  // zones: tunnel mouths round the walls — boarded up until you reach them
  const Z = [['#6B4A33', '#8B6B4A'], ['#B87333', '#D9894A'], ['#22A6FF', '#7FE0FF'], ['#8B5CFF', '#C3A8FF'], ['#FF4D00', '#FFB13D'], ['#FFD23F', '#FFF2A0']];
  const zs = zones((i, open, locked, x, z) => {
    const [a, b] = Z[i];
    // the arch and a dark tunnel
    const toward = Math.atan2(-x, -z);
    const arch = new THREE.Group(); arch.position.set(x, 0, z); arch.rotation.y = toward; open.add(arch);
    mesh(ctx, new THREE.TorusGeometry(1.8, 0.3, 8, 20, Math.PI), ctx.std('#4A4050', { flatShading: true }), 0, 0, 0, arch);
    const hole = mesh(ctx, new THREE.CircleGeometry(1.6, 20, 0, Math.PI), ctx.std('#05040A'), 0, 0, -0.1, arch); void hole;
    for (let k = 0; k < 7; k++) { const c = mesh(ctx, new THREE.OctahedronGeometry(0.25 + r() * 0.2, 0), ctx.std(k % 2 ? a : b, { emissive: k % 2 ? a : b, emissiveIntensity: 0.7 }), (r() - 0.5) * 3.2, 0.3 + r() * 1.6, 0.3 + r() * 0.6, arch); c.rotation.set(r(), r(), r()); }
    if (i === 2) for (let k = 0; k < 3; k++) { mesh(ctx, new THREE.CylinderGeometry(0.1, 0.14, 1.4, 8), ctx.std('#E8F6FF'), -1.3 + k * 1.3, 0.7, 1.3, arch); mesh(ctx, new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#2EC4FF', { emissive: '#2EC4FF', emissiveIntensity: 0.8 }), -1.3 + k * 1.3, 1.3, 1.3, arch); }
    if (i === 4) { const lava = mesh(ctx, new THREE.CircleGeometry(1.4, 20), ctx.std('#FF4D00', { emissive: '#FF4D00', emissiveIntensity: 1.6 }), 0, 0.03, 1.6, arch); flat(lava); }
    if (i === 5) for (let k = 0; k < 9; k++) mesh(ctx, new THREE.OctahedronGeometry(0.2, 0), ctx.std(['#FFD23F', '#FF3D9A', '#22E3FF'][k % 3], { emissive: '#FFD23F', emissiveIntensity: 0.6, metalness: 0.6 }), (k % 3 - 1) * 0.6, 0.2, 1.4 + Math.floor(k / 3) * 0.4, arch);
    // boarded up
    const lk = new THREE.Group(); lk.position.set(x, 0, z); lk.rotation.y = toward; locked.add(lk);
    mesh(ctx, new THREE.TorusGeometry(1.8, 0.3, 8, 20, Math.PI), ctx.std('#4A4050', { flatShading: true }), 0, 0, 0, lk);
    mesh(ctx, new THREE.CircleGeometry(1.6, 20, 0, Math.PI), ctx.std('#05040A'), 0, 0, -0.1, lk);
    for (let k = 0; k < 4; k++) { const p = mesh(ctx, new THREE.BoxGeometry(3.4, 0.28, 0.1), ctx.std('#8B6B4A'), 0, 0.3 + k * 0.42, 0.05, lk); p.rotation.z = (k % 2 ? 1 : -1) * 0.08; }
  });
  const producer = (id: string, k: number) => {
    const i = ['miner', 'cart', 'drill', 'bore', 'harvester', 'laser'].indexOf(id); if (i < 0) return null;
    const g = new THREE.Group(); const [x, z] = pspot(i, k); g.position.set(x, 0, z);
    if (id === 'miner') { person(ctx, g, 0, 0, '#3A6EA5', '#FFD23F'); const p = mesh(ctx, new THREE.BoxGeometry(0.06, 0.7, 0.06), ctx.std('#6B4A33'), 0.35, 0.8, 0, g); p.rotation.z = 0.6; g.userData.swing = p; }
    else if (id === 'cart') { mesh(ctx, new THREE.BoxGeometry(1.1, 0.6, 0.7), ctx.std('#B87333', { metalness: 0.4 }), 0, 0.45, 0, g); for (let j = 0; j < 4; j++) mesh(ctx, new THREE.DodecahedronGeometry(0.16, 0), ctx.std('#D9894A'), (j - 1.5) * 0.22, 0.8, 0, g); }
    else if (id === 'drill') { mesh(ctx, new THREE.BoxGeometry(0.8, 0.8, 0.8), ctx.std('#FFB13D'), 0, 0.4, 0, g); const bit = mesh(ctx, new THREE.ConeGeometry(0.25, 0.9, 10), ctx.std('#9AA0B0', { metalness: 0.8 }), 0, 1.25, 0, g); bit.rotation.x = Math.PI; g.userData.spin = bit; }
    else if (id === 'bore') { const c = mesh(ctx, new THREE.CylinderGeometry(0.5, 0.5, 1.4, 14), ctx.std('#4A4A55', { metalness: 0.6 }), 0, 0.6, 0, g); c.rotation.z = Math.PI / 2; mesh(ctx, new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), ctx.std('#333'), 0.3, 1.3, 0, g); }
    else if (id === 'harvester') { mesh(ctx, new THREE.CylinderGeometry(0.4, 0.5, 0.5, 10), ctx.std('#C3A8FF'), 0, 0.25, 0, g); const c = mesh(ctx, new THREE.OctahedronGeometry(0.35, 0), ctx.std('#8B5CFF', { emissive: '#8B5CFF', emissiveIntensity: 0.9 }), 0, 0.9, 0, g); g.userData.spin = c; }
    else { mesh(ctx, new THREE.BoxGeometry(0.6, 0.9, 0.6), ctx.std('#222'), 0, 0.45, 0, g); const beam = mesh(ctx, new THREE.CylinderGeometry(0.04, 0.04, 2, 6), ctx.std('#FF2D55', { emissive: '#FF2D55', emissiveIntensity: 3 }), 0, 0.9, -1, g); beam.rotation.x = Math.PI / 2; }
    g.traverse((m) => { m.castShadow = true; }); mineUps.push(g); return g;
  };
  const mineUps: THREE.Object3D[] = [];
  return {
    sky: '#14101C', fog: ['#14101C', 30, 70], light: ['#C2B4F0', '#554A66', 2.4, '#FFE0B8', 1.7], bounds: B, stations: S, zones: zs, producer,
    update(t) {
      wheel.rotation.z = t * 0.8; (mouth.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(t * 7) * 0.4;
      lights.forEach((l, i) => { l.intensity = 11.5 + Math.sin(t * 9 + i * 2) * 0.8; });
      mineUps.forEach((g, i) => { if (g.userData.swing) (g.userData.swing as THREE.Object3D).rotation.z = 0.6 + Math.sin(t * 6 + i) * 0.6; if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 6; });
    },
  };
}

// ======================================================================================================================
// ☁️ Sky Island
// ======================================================================================================================
function sky(ctx: Ctx): Env2 {
  const r = ctx.r;
  // the island: a grassy top, a rocky underside tapering into the clouds
  const grass = grassTex(ctx, '#7ED957', '#6CC84A', '#94E86E', 5, 6);
  mesh(ctx, new THREE.CylinderGeometry(12.5, 12, 1, 40), ctx.std('#ffffff', { map: grass, roughness: 1 }), 0, -0.5, 0);
  mesh(ctx, new THREE.ConeGeometry(12, 12, 20), ctx.std('#8A6E55', { roughness: 1, flatShading: true }), 0, -7, 0).rotation.x = Math.PI;
  const path = ctx.std('#F2E3C0', { roughness: 1 });
  for (const [x, z, w, d] of [[0, 0, 2, 12], [0, 0.6, 15, 1.6]] as const) flat(mesh(ctx, new THREE.PlaneGeometry(w, d), path, x, 0.01, z));
  // clouds drifting below and around
  const cloudM = ctx.std('#FFFFFF', { roughness: 1 });
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 16; i++) { const g = new THREE.Group(); for (let k = 0; k < 5; k++) mesh(ctx, new THREE.SphereGeometry(1.5 + r() * 1.6, 12, 10), cloudM, (k - 2) * 1.6, (r() - 0.5), (r() - 0.5) * 1.4, g).castShadow = false; const a = r() * Math.PI * 2, d = 20 + r() * 25; g.position.set(Math.cos(a) * d, -4 - r() * 8, Math.sin(a) * d); g.userData.s = 0.2 + r() * 0.4; ctx.dyn.add(g); clouds.push(g); }
  // flowers and little trees on the island
  const fl: Inst[] = []; for (let i = 0; i < 240; i++) { const a = r() * Math.PI * 2, d = 3 + r() * 9; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(x) < 1.2 || Math.abs(z - 0.6) < 1) continue; fl.push({ x, y: 0.12, z, s: 0.7 + r() * 0.6, c: ['#FF9FD6', '#FFE14D', '#FFFFFF', '#9FE8FF'][i % 4] }); }
  scatter(ctx, new THREE.IcosahedronGeometry(0.1, 0), ctx.std('#ffffff'), fl);
  const S = SPOTS({ play: '🪂 Sky Glide', collect: '🧺 Cloud basket', build: '🪧 Island plans', make: '🧶 Cloud loom', market: '🎈 Wind trader', book: '🔭 Creature log' });
  // a launch ramp with flags
  const ramp = mesh(ctx, new THREE.BoxGeometry(2.2, 0.2, 3.2), ctx.std('#C9A57A'), S.play.x, 0.6, S.play.z - 0.4); ramp.rotation.x = -0.3;
  for (const s of [-1, 1]) { mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), ctx.std('#8B6B4A'), S.play.x + s * 1.2, 1.4, S.play.z - 1.8); const f = mesh(ctx, new THREE.PlaneGeometry(0.8, 0.5), ctx.std(s < 0 ? '#38BDF8' : '#FF9FD6', { side: THREE.DoubleSide }), S.play.x + s * 1.2 + 0.4, 2.55, S.play.z - 1.8, ctx.dyn); f.userData.flag = true; }
  const glider = mesh(ctx, new THREE.ConeGeometry(1, 0.3, 3), ctx.std('#FF9FD6', { side: THREE.DoubleSide }), S.play.x, 1.4, S.play.z - 0.4); glider.rotation.set(Math.PI / 2, 0, Math.PI);
  // a woven basket of fluff
  mesh(ctx, new THREE.CylinderGeometry(0.8, 0.6, 0.8, 16), ctx.std('#C9A57A', { roughness: 1 }), S.collect.x, 0.4, S.collect.z);
  for (let k = 0; k < 5; k++) mesh(ctx, new THREE.SphereGeometry(0.35, 10, 8), cloudM, S.collect.x + (r() - 0.5) * 0.8, 0.95, S.collect.z + (r() - 0.5) * 0.8);
  sign(ctx, ctx.root, S.build.x, S.build.z, '#C9A57A');
  // the loom: a wooden frame with a cloud being spun
  for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(0.12, 1.8, 0.12), ctx.std('#8B6B4A'), S.make.x + s * 0.9, 0.9, S.make.z);
  mesh(ctx, new THREE.BoxGeometry(2, 0.12, 0.12), ctx.std('#8B6B4A'), S.make.x, 1.8, S.make.z);
  for (let k = 0; k < 9; k++) mesh(ctx, new THREE.BoxGeometry(0.02, 1.4, 0.02), ctx.std(['#FF9FD6', '#9FE8FF', '#FFE14D'][k % 3]), S.make.x - 0.8 + k * 0.2, 1.05, S.make.z);
  // a hot-air balloon trader
  mesh(ctx, new THREE.BoxGeometry(1.1, 0.8, 1.1), ctx.std('#8B6B4A'), S.market.x, 0.4, S.market.z);
  const balloon = mesh(ctx, new THREE.SphereGeometry(1.3, 18, 14), ctx.std('#FF6B6B', { roughness: 0.6 }), S.market.x, 3.4, S.market.z, ctx.dyn); balloon.scale.y = 1.2;
  person(ctx, ctx.root, S.market.x, S.market.z, '#38BDF8');
  // a brass telescope on a tripod
  for (let k = 0; k < 3; k++) { const leg = mesh(ctx, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), ctx.std('#6B4A33'), S.book.x + Math.cos(k * 2.1) * 0.3, 0.65, S.book.z + Math.sin(k * 2.1) * 0.3); leg.rotation.set(Math.sin(k * 2.1) * 0.25, 0, -Math.cos(k * 2.1) * 0.25); }
  const scope = mesh(ctx, new THREE.CylinderGeometry(0.1, 0.16, 1.2, 12), ctx.std('#E9C46A', { metalness: 0.7, roughness: 0.3 }), S.book.x, 1.5, S.book.z); scope.rotation.z = 1.0;
  // zones: little islands round the main one, joined by rope bridges once they're yours (cloud-wrapped until then)
  const C = ['#C9F28C', '#FF9FD6', '#9FE8FF', '#B8B0C8', '#FFD23F', '#C3A8FF'];
  const falls: THREE.Mesh[] = [];
  const zs = zones((i, open, locked, x, z) => {
    const dx = x * 1.05, dz = z * 1.08;
    mesh(ctx, new THREE.CylinderGeometry(3.3, 3, 0.7, 24), ctx.std('#ffffff', { map: grass, roughness: 1 }), dx, -0.35, dz, open);
    mesh(ctx, new THREE.ConeGeometry(3, 4, 12), ctx.std('#8A6E55', { flatShading: true }), dx, -2.7, dz, open).rotation.x = Math.PI;
    // a rope bridge back to the main island
    const len = Math.hypot(dx, dz) - 15.3, ang = Math.atan2(dx, dz);
    const br = new THREE.Group(); br.position.set(dx * (1 - (len / 2 + 3) / Math.hypot(dx, dz)), 0.02, dz * (1 - (len / 2 + 3) / Math.hypot(dx, dz))); br.rotation.y = ang; open.add(br);
    for (let k = 0; k < Math.max(2, len * 2.5); k++) mesh(ctx, new THREE.BoxGeometry(1, 0.06, 0.25), ctx.std('#8B6B4A'), 0, 0, -len / 2 + k * 0.4, br);
    // its look
    if (i === 0) for (let k = 0; k < 12; k++) mesh(ctx, new THREE.SphereGeometry(0.18, 8, 6), ctx.std(C[k % 6]), dx + (r() - 0.5) * 4, 0.15, dz + (r() - 0.5) * 4, open);
    if (i === 1) for (let k = 0; k < 4; k++) mesh(ctx, new THREE.SphereGeometry(0.7, 12, 10), ctx.std('#FFE3F1'), dx + (k - 1.5) * 1.1, 0.4, dz + (k % 2) * 0.8, open);
    if (i === 2) { const w = mesh(ctx, new THREE.PlaneGeometry(1.6, 8), ctx.std('#9FE8FF', { transparent: true, opacity: 0.75, emissive: '#5FD3EA', emissiveIntensity: 0.3, side: THREE.DoubleSide }), dx, -4, dz + 3.05, open); falls.push(w); for (let k = 0; k < 6; k++) mesh(ctx, new THREE.TorusGeometry(2.4 - k * 0.12, 0.06, 6, 28, Math.PI), ctx.std(['#FF3D6E', '#FF8A3D', '#FFE14D', '#3DDC97', '#22B8CF', '#8B5CFF'][k], { emissive: '#ffffff', emissiveIntensity: 0.15 }), dx, 0, dz, open); }
    if (i === 3) { mesh(ctx, new THREE.ConeGeometry(1.1, 6, 7), ctx.std('#9A92AA', { flatShading: true }), dx, 3, dz, open); }
    if (i === 4) for (let k = 0; k < 3; k++) { mesh(ctx, new THREE.CylinderGeometry(0.12, 0.18, 1.6, 8), ctx.std('#8B6B4A'), dx + (k - 1) * 1.4, 0.8, dz, open); mesh(ctx, new THREE.SphereGeometry(0.8, 12, 10), ctx.std('#FFD23F', { emissive: '#FFB300', emissiveIntensity: 0.3 }), dx + (k - 1) * 1.4, 2, dz, open); }
    if (i === 5) { mesh(ctx, new THREE.ConeGeometry(2.4, 4.5, 8), ctx.std('#B8B0C8', { flatShading: true }), dx, 2.2, dz, open); mesh(ctx, new THREE.ConeGeometry(1, 1.2, 8), ctx.std('#FFFFFF'), dx, 4, dz, open); for (let k = 0; k < 6; k++) lampGlow(ctx, open, dx + (r() - 0.5) * 3, 3 + r() * 3, dz + (r() - 0.5) * 3, '#FFF6C8', 0.1); }
    // locked: a fat cloud sitting on it
    for (let k = 0; k < 6; k++) mesh(ctx, new THREE.SphereGeometry(1.4 + r(), 12, 10), ctx.std('#F2F6FF', { transparent: true, opacity: 0.92, roughness: 1 }), dx + (k - 2.5) * 0.9, 0.3 + (k % 2) * 0.6, dz + (r() - 0.5), locked);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['spinner', 'nest', 'windmill', 'fountain', 'mirror', 'bell'].indexOf(id); if (i < 0) return null;
    const g = new THREE.Group(); const [x, z] = pspot(i, k); g.position.set(x * 1.05 + (x < 0 ? 0.6 : x > 0 ? -0.6 : 0), 0, z * 1.08); ups.push(g);
    if (id === 'spinner') { mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), ctx.std('#8B6B4A'), 0, 0.7, 0, g); const c = mesh(ctx, new THREE.TorusGeometry(0.45, 0.18, 8, 16), cloudM, 0, 1.5, 0, g); g.userData.spin = c; }
    else if (id === 'nest') { mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), ctx.std('#8B6B4A'), 0, 0.8, 0, g); mesh(ctx, new THREE.TorusGeometry(0.35, 0.15, 6, 14), ctx.std('#A57A4A'), 0, 1.65, 0, g).rotation.x = Math.PI / 2; mesh(ctx, new THREE.SphereGeometry(0.18, 10, 8), ctx.std('#38BDF8'), 0, 1.8, 0, g); }
    else if (id === 'windmill') { mesh(ctx, new THREE.CylinderGeometry(0.3, 0.45, 2.2, 8), ctx.std('#F2E8D5'), 0, 1.1, 0, g); const b = new THREE.Group(); b.position.set(0, 2.1, 0.35); g.add(b); for (let j = 0; j < 4; j++) { const h = new THREE.Group(); h.rotation.z = (j / 4) * Math.PI * 2; b.add(h); mesh(ctx, new THREE.BoxGeometry(0.2, 1.1, 0.04), ctx.std('#FFFFFF'), 0, 0.55, 0, h); } g.userData.rotz = b; }
    else if (id === 'fountain') { mesh(ctx, new THREE.CylinderGeometry(0.6, 0.7, 0.4, 16), ctx.std('#E8E2D4'), 0, 0.2, 0, g); mesh(ctx, new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), ctx.std('#9FE8FF', { emissive: '#5FD3EA', emissiveIntensity: 0.4 }), 0, 0.42, 0, g); for (let j = 0; j < 3; j++) mesh(ctx, new THREE.TorusGeometry(0.4 - j * 0.06, 0.03, 6, 16, Math.PI), ctx.std(['#FF3D6E', '#FFE14D', '#22B8CF'][j], { emissive: '#ffffff', emissiveIntensity: 0.2 }), 0, 0.45, 0, g); }
    else if (id === 'mirror') { mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), ctx.std('#E9C46A'), 0, 0.6, 0, g); const m = mesh(ctx, new THREE.CircleGeometry(0.5, 20), ctx.std('#FFF2A0', { metalness: 0.9, roughness: 0.05, emissive: '#FFD23F', emissiveIntensity: 0.4, side: THREE.DoubleSide }), 0, 1.4, 0, g); m.rotation.x = -0.6; g.userData.spin = m; }
    else { for (const s of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), ctx.std('#C3A8FF'), s * 0.4, 0.8, 0, g); mesh(ctx, new THREE.BoxGeometry(1, 0.08, 0.08), ctx.std('#C3A8FF'), 0, 1.6, 0, g); const bell = mesh(ctx, new THREE.ConeGeometry(0.28, 0.4, 14, 1, true), ctx.std('#E0E6F5', { metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide }), 0, 1.35, 0, g); g.userData.bell = bell; }
    return g;
  };
  return {
    sky: '#8FD0FF', fog: ['#BDE4FF', 30, 90], light: ['#FFFFFF', '#6A8AB0', 1.15, '#FFF4E0', 2.0], bounds: B, stations: S, zones: zs, producer,
    update(t, dt) {
      clouds.forEach((c) => { c.position.x += dt * c.userData.s; if (c.position.x > 50) c.position.x = -50; });
      balloon.position.y = 3.4 + Math.sin(t * 1.2) * 0.15;
      ctx.dyn.children.forEach((m) => { if (m.userData.flag) m.rotation.y = Math.sin(t * 3) * 0.3; });
      falls.forEach((f) => { const mt = f.material as THREE.MeshStandardMaterial; mt.opacity = 0.65 + Math.sin(t * 6) * 0.08; });
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 2 + i; if (g.userData.rotz) (g.userData.rotz as THREE.Object3D).rotation.z = t * 2.5; if (g.userData.bell) (g.userData.bell as THREE.Object3D).rotation.z = Math.sin(t * 2 + i) * 0.3; });
    },
  };
}
type Env2 = RealmEnv;

// ======================================================================================================================
// 🛠️ Inventor's Workshop
// ======================================================================================================================
function workshop(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  const wood = ctx.tex(256, 256, (g) => { g.fillStyle = '#9A6B43'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 32) { g.fillStyle = y % 64 ? '#8E6240' : '#A37450'; g.fillRect(0, y, 256, 30); g.fillStyle = '#5A3A26'; g.fillRect(0, y + 30, 256, 2); } }, 8);
  flat(mesh(ctx, new THREE.PlaneGeometry(60, 60), ctx.std('#ffffff', { map: wood, roughness: 0.85 })));
  const brick = ctx.tex(256, 128, (g) => { g.fillStyle = '#9C4A35'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#6E3326'; g.lineWidth = 3; for (let y = 0; y < 128; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 21) % 2 ? 0 : 21; x < 256; x += 42) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 21); g.stroke(); } } }, 1);
  const brickM = ctx.std('#ffffff', { map: brick, roughness: 1 });
  // a low brick wall round the shop, pipes along it, gears turning on the walls, hanging bulbs
  for (const [x, z, w, d] of [[0, -17.5, 40, 1], [-19, 0, 1, 36], [19, 0, 1, 36]] as const) mesh(ctx, new THREE.BoxGeometry(w, 3, d), brickM, x, 1.5, z);
  const pipe = ctx.std('#B87333', { metalness: 0.8, roughness: 0.3 });
  mesh(ctx, new THREE.CylinderGeometry(0.15, 0.15, 38, 10), pipe, 0, 2.6, -16.9).rotation.z = Math.PI / 2;
  const gears: THREE.Mesh[] = [];
  for (const [x, s] of [[-12, 1.2], [-9.8, 0.8], [9, 1.4], [11.6, 0.9], [0, 1]] as const) { const gr = mesh(ctx, new THREE.CylinderGeometry(s, s, 0.2, 12), ctx.std('#C9A04A', { metalness: 0.7, roughness: 0.35, flatShading: true }), x, 1.6 + s * 0.3, -16.8, ctx.dyn); gr.rotation.x = Math.PI / 2; gr.userData.s = (gears.length % 2 ? -1 : 1) / s; gears.push(gr); }
  const bulbs: THREE.Mesh[] = [];
  for (const [x, z] of [[-4, -2], [4, -2], [-4, 4], [4, 4]]) { mesh(ctx, new THREE.CylinderGeometry(0.01, 0.01, 2, 4), ctx.std('#222'), x, 5, z); bulbs.push(lampGlow(ctx, ctx.dyn, x, 4, z, '#FFE38A', 0.22)); }
  const lights: THREE.PointLight[] = []; if (!ctx.phone) for (const [x, z] of [[-4, 0], [4, 0]]) { const l = new THREE.PointLight('#FFD98A', 10, 14, 1.5); l.position.set(x, 4, z); ctx.scene.add(l); lights.push(l); }
  // junk and crates
  const junk: Inst[] = []; for (let i = 0; i < 40; i++) { const x = (r() * 2 - 1) * 17, z = -16 + r() * 4; junk.push({ x, y: 0.3, z, s: 0.3 + r() * 0.4, ry: r() * 3, c: ['#8A8A99', '#B87333', '#6B4A33', '#4A6B8A'][i % 4] }); }
  scatter(ctx, new THREE.BoxGeometry(1, 1, 1), ctx.std('#ffffff', { roughness: 0.6, metalness: 0.3 }), junk, true);
  const S = SPOTS({ play: '🏭 Assembly Line', collect: '📦 Parts bins', build: '📐 Blueprint wall', make: '🔧 Invention bench', market: '💱 Parts dealer', book: '🗄️ Blueprint archive' });
  // a conveyor belt
  const beltTex = ctx.tex(64, 64, (g) => { g.fillStyle = '#2A2A33'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3E3E4A'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 8, 64); }, 1); beltTex.repeat.set(6, 1);
  mesh(ctx, new THREE.BoxGeometry(6, 0.8, 1.2), ctx.std('#4A4A55', { metalness: 0.5 }), S.play.x, 0.4, S.play.z);
  const belt = mesh(ctx, new THREE.PlaneGeometry(6, 1), ctx.std('#ffffff', { map: beltTex, roughness: 0.6 }), S.play.x, 0.82, S.play.z, ctx.dyn); flat(belt);
  const parts: THREE.Mesh[] = []; for (let k = 0; k < 5; k++) { const p = mesh(ctx, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), ctx.std(['#C9A04A', '#22B8CF', '#3DDC97'][k % 3], { metalness: 0.6 }), 0, 0.92, S.play.z, ctx.dyn); parts.push(p); }
  for (let k = 0; k < 4; k++) mesh(ctx, new THREE.BoxGeometry(0.7, 0.5, 0.6), ctx.std(['#FF3D6E', '#FFB13D', '#3DDC97', '#22B8CF'][k]), S.collect.x - 1.1 + (k % 2) * 0.8, 0.25 + Math.floor(k / 2) * 0.5, S.collect.z);
  // the blueprint wall
  mesh(ctx, new THREE.BoxGeometry(2.4, 1.6, 0.08), ctx.std('#1E4E8A', { emissive: '#1E4E8A', emissiveIntensity: 0.2 }), S.build.x, 1.4, S.build.z - 0.2);
  for (let k = 0; k < 4; k++) mesh(ctx, new THREE.BoxGeometry(1.8 - k * 0.3, 0.03, 0.02), ctx.std('#BFE3FF'), S.build.x, 1.1 + k * 0.2, S.build.z - 0.15);
  for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(0.1, 2.2, 0.1), ctx.std('#6B4A33'), S.build.x + s * 1.2, 1.1, S.build.z - 0.2);
  // the bench with a vise and a half-built robot
  counter(ctx, ctx.root, S.make.x, S.make.z, '#B5844A', '#6B4A33');
  mesh(ctx, new THREE.BoxGeometry(0.4, 0.3, 0.3), ctx.std('#4A6B8A', { metalness: 0.6 }), S.make.x - 0.6, 1.15, S.make.z);
  mesh(ctx, new THREE.BoxGeometry(0.5, 0.5, 0.4), ctx.std('#9AA0B0', { metalness: 0.6 }), S.make.x + 0.4, 1.25, S.make.z); lampGlow(ctx, ctx.root, S.make.x + 0.3, 1.35, S.make.z + 0.21, '#22E3FF', 0.06); lampGlow(ctx, ctx.root, S.make.x + 0.5, 1.35, S.make.z + 0.21, '#22E3FF', 0.06);
  counter(ctx, ctx.root, S.market.x, S.market.z, '#4A4A55', '#2A2A33'); person(ctx, ctx.root, S.market.x, S.market.z - 0.9, '#F59E0B'); mesh(ctx, new THREE.BoxGeometry(0.5, 0.3, 0.4), ctx.std('#C9A04A'), S.market.x + 0.6, 1.15, S.market.z);
  // the archive: tall drawers
  for (let k = 0; k < 3; k++) { mesh(ctx, new THREE.BoxGeometry(0.8, 2, 0.8), ctx.std('#5A3A26'), S.book.x - 0.9 + k * 0.9, 1, S.book.z); for (let j = 0; j < 4; j++) mesh(ctx, new THREE.BoxGeometry(0.15, 0.06, 0.05), ctx.std('#E9C46A', { metalness: 0.7 }), S.book.x - 0.9 + k * 0.9, 0.35 + j * 0.45, S.book.z + 0.42); }
  // zones: rooms through the walls (behind roller shutters until they're open)
  const ZC = ['#7A6A5A', '#B5844A', '#4A4A55', '#22B8CF', '#8B5CFF', '#3DDC97'];
  const sparks: THREE.Mesh[] = [];
  const zs = zones((i, open, locked, x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); open.add(g);
    mesh(ctx, new THREE.BoxGeometry(4.4, 0.05, 3.4), ctx.std(ZC[i], { roughness: 0.8 }), 0, 0.03, 0, g);
    if (i === 0) { mesh(ctx, new THREE.BoxGeometry(1.8, 0.9, 3), ctx.std('#C0392B', { metalness: 0.4 }), 0, 0.6, 0, g); for (const s of [-1, 1]) for (const t of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), ctx.std('#222'), s * 0.9, 0.3, t * 1, g).rotation.z = Math.PI / 2; }
    if (i === 1) { counter(ctx, g, 0, 0, '#B5844A', '#6B4A33'); for (let k = 0; k < 5; k++) mesh(ctx, new THREE.BoxGeometry(0.06, 0.4, 0.06), ctx.std('#9AA0B0', { metalness: 0.7 }), -0.8 + k * 0.4, 1.2, -0.3, g); }
    if (i === 2) for (let k = 0; k < 2; k++) { mesh(ctx, new THREE.BoxGeometry(4, 0.6, 0.8), ctx.std('#4A4A55'), 0, 0.3, -0.8 + k * 1.6, g); }
    if (i === 3) for (let k = 0; k < 2; k++) { mesh(ctx, new THREE.CylinderGeometry(0.3, 0.4, 0.6, 12), ctx.std('#9AA0B0', { metalness: 0.6 }), -1 + k * 2, 0.3, 0, g); const arm = mesh(ctx, new THREE.BoxGeometry(0.15, 1.6, 0.15), ctx.std('#FFB13D'), -1 + k * 2, 1.2, 0, g); arm.rotation.z = 0.5 - k; }
    if (i === 4) { mesh(ctx, new THREE.CylinderGeometry(0.3, 0.6, 4, 10), ctx.std('#6B6470', { metalness: 0.6 }), 0, 2, 0, g); mesh(ctx, new THREE.TorusGeometry(0.8, 0.25, 10, 20), ctx.std('#B87333', { metalness: 0.8 }), 0, 4.1, 0, g).rotation.x = Math.PI / 2; sparks.push(lampGlow(ctx, g, 0, 4.4, 0, '#C3A8FF', 0.4)); }
    if (i === 5) { mesh(ctx, new THREE.CylinderGeometry(1.2, 1.2, 0.4, 20), ctx.std('#2A2A33', { metalness: 0.6 }), 0, 0.2, 0, g); sparks.push(lampGlow(ctx, g, 0, 1.3, 0, '#3DDC97', 0.8)); for (let k = 0; k < 3; k++) mesh(ctx, new THREE.TorusGeometry(1.1, 0.06, 6, 30), ctx.std('#3DDC97', { emissive: '#3DDC97', emissiveIntensity: 1 }), 0, 1.3, 0, g).rotation.set(k, k * 0.7, 0); }
    // a roller shutter
    const lk = new THREE.Group(); lk.position.set(x, 0, z); lk.rotation.y = Math.atan2(-x, -z); locked.add(lk);
    for (let k = 0; k < 10; k++) mesh(ctx, new THREE.BoxGeometry(4.4, 0.3, 0.12), ctx.std(k % 2 ? '#8A8A99' : '#7A7A88', { metalness: 0.5 }), 0, 0.15 + k * 0.3, 1.7, lk);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['collector', 'press', 'coiler', 'spool', 'printer', 'reactor'].indexOf(id); if (i < 0) return null;
    const g = new THREE.Group(); const [x, z] = pspot(i, k); g.position.set(x, 0, z); ups.push(g);
    const metal = ctx.std('#9AA0B0', { metalness: 0.6, roughness: 0.35 });
    if (id === 'collector') { mesh(ctx, new THREE.BoxGeometry(0.1, 2, 0.1), metal, 0, 1, 0, g); const m = mesh(ctx, new THREE.TorusGeometry(0.3, 0.1, 8, 14, Math.PI), ctx.std('#E8323C'), 0, 1.6, 0.3, g); m.rotation.z = Math.PI; g.userData.swing = m; }
    else if (id === 'press') { mesh(ctx, new THREE.BoxGeometry(0.9, 0.5, 0.9), metal, 0, 0.25, 0, g); const p = mesh(ctx, new THREE.BoxGeometry(0.6, 0.4, 0.6), ctx.std('#FFB13D'), 0, 1.1, 0, g); g.userData.press = p; for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(0.1, 1.5, 0.1), metal, s * 0.4, 0.75, 0, g); }
    else if (id === 'coiler') { mesh(ctx, new THREE.CylinderGeometry(0.4, 0.4, 0.6, 14), metal, 0, 0.3, 0, g); const c = mesh(ctx, new THREE.TorusKnotGeometry(0.25, 0.05, 40, 6), ctx.std('#22B8CF', { metalness: 0.7 }), 0, 0.95, 0, g); g.userData.spin = c; }
    else if (id === 'spool') { const s = mesh(ctx, new THREE.CylinderGeometry(0.45, 0.45, 0.6, 16), ctx.std('#B87333', { metalness: 0.8 }), 0, 0.6, 0, g); s.rotation.z = Math.PI / 2; g.userData.spinx = s; }
    else if (id === 'printer') { mesh(ctx, new THREE.BoxGeometry(1, 0.7, 0.8), ctx.std('#E0E6F5'), 0, 0.35, 0, g); lampGlow(ctx, g, 0.35, 0.72, 0.3, '#3DDC97', 0.06); mesh(ctx, new THREE.BoxGeometry(0.6, 0.02, 0.5), ctx.std('#2E8B57'), 0, 0.72, 0.1, g); }
    else { mesh(ctx, new THREE.CylinderGeometry(0.45, 0.5, 0.9, 14), ctx.std('#2A2A33', { metalness: 0.6 }), 0, 0.45, 0, g); g.userData.glow = lampGlow(ctx, g, 0, 1.1, 0, '#3DDC97', 0.28); }
    return g;
  };
  return {
    sky: '#2A1E16', fog: ['#2A1E16', 30, 70], light: ['#FFE3C2', '#3A2A20', 1.0, '#FFE8C2', 1.3], bounds: B, stations: S, zones: zs, producer,
    update(t) {
      gears.forEach((g) => { g.rotation.y = t * g.userData.s; });
      beltTex.offset.x = -t * 0.6;
      parts.forEach((p, k) => { p.position.x = S.play.x - 2.8 + ((t * 0.6 + k * 1.2) % 5.6); });
      sparks.forEach((s, k) => s.scale.setScalar(0.8 + Math.abs(Math.sin(t * 12 + k)) * 0.5));
      ups.forEach((g, i) => { if (g.userData.swing) (g.userData.swing as THREE.Object3D).rotation.y = Math.sin(t * 2 + i); if (g.userData.press) (g.userData.press as THREE.Object3D).position.y = 0.75 + Math.abs(Math.sin(t * 3 + i)) * 0.4; if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 3; if (g.userData.spinx) (g.userData.spinx as THREE.Object3D).rotation.x = t * 3; if (g.userData.glow) (g.userData.glow as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 4) * 0.15); });
      bulbs.forEach((b, i) => { b.position.x += Math.sin(t * 1.2 + i) * 0.0015; });
    },
  };
}

// ======================================================================================================================
// 🍳 Restaurant
// ======================================================================================================================
function diner(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  const tiles = ctx.tex(256, 256, (g) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#F4F1EA' : '#E8323C'; g.fillRect(x * 32, y * 32, 32, 32); } }, 10);
  flat(mesh(ctx, new THREE.PlaneGeometry(26, 20), ctx.std('#ffffff', { map: tiles, roughness: 0.5 }), 0, 0, 0));
  const side = ctx.tex(256, 256, (g) => { g.fillStyle = '#C9C2B6'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#A8A094'; g.lineWidth = 3; for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(256, x); g.stroke(); } }, 10);
  flat(mesh(ctx, new THREE.PlaneGeometry(80, 80), ctx.std('#ffffff', { map: side, roughness: 1 }), 0, -0.01, 0));
  // a city street all round: building fronts with lit windows, lamp posts, string lights over the floor
  const winTex = ctx.tex(128, 256, (g) => { g.fillStyle = '#E8B07A'; g.fillRect(0, 0, 128, 256); const rr = rng(4); for (let y = 10; y < 256; y += 40) for (let x = 10; x < 128; x += 40) { g.fillStyle = rr() < 0.6 ? '#FFE38A' : '#4A3A5A'; g.fillRect(x, y, 24, 28); } }, 1);
  const fronts: Inst[] = []; for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, d = 24 + r() * 4, h = 6 + r() * 8; fronts.push({ x: Math.cos(a) * d, y: h / 2, z: Math.sin(a) * d, s: 5, sy: h, ry: -a }); }
  scatter(ctx, new THREE.BoxGeometry(1, 1, 1), ctx.std('#ffffff', { map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.3, roughness: 0.9 }), fronts, true);
  const fairy: Inst[] = []; for (let x = -12; x <= 12; x += 0.8) for (const z of [-3, 2]) fairy.push({ x, y: 4 + Math.cos(x * 0.6) * 0.3, z, c: ['#FFE38A', '#FF9FD6', '#9FE8FF'][Math.abs(Math.round(x * 2)) % 3] });
  scatter(ctx, new THREE.SphereGeometry(0.08, 6, 4), ctx.std('#ffffff', { emissive: '#FFE38A', emissiveIntensity: 1.6 }), fairy);
  const S = SPOTS({ play: '🧑‍🍳 Order Up!', collect: '🥫 Pantry', build: '📝 Supplier board', make: '🍳 Kitchen', market: '🧺 Market stall', book: '🏆 Awards shelf' });
  // the pass: a counter with a bell and a hatch
  counter(ctx, ctx.root, S.play.x, S.play.z, '#C9C2B6', '#E8323C');
  mesh(ctx, new THREE.CylinderGeometry(0.12, 0.16, 0.12, 14), ctx.std('#E9C46A', { metalness: 0.8 }), S.play.x + 0.6, 1.06, S.play.z);
  mesh(ctx, new THREE.BoxGeometry(3, 2, 0.2), ctx.std('#F4F1EA'), S.play.x, 2, S.play.z - 0.9); mesh(ctx, new THREE.BoxGeometry(2, 0.8, 0.22), ctx.std('#2A2A33'), S.play.x, 2, S.play.z - 0.9);
  const steam = motes(ctx, 30, '#FFFFFF', 0.25); steam.m.blending = THREE.NormalBlending; steam.m.opacity = 0.5;
  // pantry shelves with jars and sacks
  for (let k = 0; k < 3; k++) mesh(ctx, new THREE.BoxGeometry(2, 0.06, 0.6), ctx.std('#8B6B4A'), S.collect.x, 0.4 + k * 0.6, S.collect.z);
  const jars: Inst[] = []; for (let k = 0; k < 15; k++) jars.push({ x: S.collect.x - 0.8 + (k % 5) * 0.4, y: 0.6 + Math.floor(k / 5) * 0.6, z: S.collect.z, c: ['#FFD23F', '#E8323C', '#3DDC97', '#F4F1EA', '#8B5A2B'][k % 5] });
  scatter(ctx, new THREE.CylinderGeometry(0.13, 0.13, 0.32, 10), ctx.std('#ffffff', { roughness: 0.3 }), jars);
  // a chalkboard menu
  mesh(ctx, new THREE.BoxGeometry(1.6, 1.8, 0.06), ctx.std('#2A3A2E'), S.build.x, 1.2, S.build.z); for (let k = 0; k < 4; k++) mesh(ctx, new THREE.BoxGeometry(1.1 - (k % 2) * 0.3, 0.04, 0.02), ctx.std('#F4F1EA'), S.build.x, 0.8 + k * 0.3, S.build.z + 0.04);
  for (const s of [-1, 1]) { const l = mesh(ctx, new THREE.BoxGeometry(0.08, 2.2, 0.08), ctx.std('#6B4A33'), S.build.x + s * 0.7, 1, S.build.z - 0.25); l.rotation.x = 0.15; }
  // the kitchen: a range with pans and a hood
  mesh(ctx, new THREE.BoxGeometry(2.2, 0.9, 0.9), ctx.std('#C0C4CC', { metalness: 0.7, roughness: 0.3 }), S.make.x, 0.45, S.make.z);
  for (let k = 0; k < 2; k++) { const p = mesh(ctx, new THREE.CylinderGeometry(0.3, 0.26, 0.12, 16), ctx.std('#2A2A33', { metalness: 0.5 }), S.make.x - 0.5 + k, 1, S.make.z, ctx.dyn); p.userData.pan = k; }
  mesh(ctx, new THREE.BoxGeometry(2.2, 0.4, 1), ctx.std('#9AA0B0', { metalness: 0.7 }), S.make.x, 2.7, S.make.z);
  const flames = [0, 1].map((k) => mesh(ctx, new THREE.ConeGeometry(0.18, 0.2, 10), ctx.std('#3FA9FF', { emissive: '#3FA9FF', emissiveIntensity: 2 }), S.make.x - 0.5 + k, 0.95, S.make.z, ctx.dyn));
  counter(ctx, ctx.root, S.market.x, S.market.z, '#8B6B4A', '#5A3A26'); awning(ctx, ctx.root, S.market.x, S.market.z, '#3DDC97', '#F4F1EA');
  for (let k = 0; k < 5; k++) mesh(ctx, new THREE.SphereGeometry(0.16, 10, 8), ctx.std(['#E8323C', '#FFB13D', '#3DDC97', '#8B5CFF', '#FFD23F'][k]), S.market.x - 0.8 + k * 0.4, 1.12, S.market.z);
  person(ctx, ctx.root, S.market.x, S.market.z - 0.9, '#3DDC97');
  // awards: a shelf of trophies
  mesh(ctx, new THREE.BoxGeometry(2, 1.6, 0.4), ctx.std('#5A3A26'), S.book.x, 0.8, S.book.z - 0.1);
  for (let k = 0; k < 3; k++) { mesh(ctx, new THREE.CylinderGeometry(0.12, 0.06, 0.3, 10), ctx.std('#E9C46A', { metalness: 0.9, roughness: 0.2 }), S.book.x - 0.6 + k * 0.6, 1.75, S.book.z); }
  // diners at tables round the floor (more as it grows — they're the producers' customers)
  const tableAt = (parent: THREE.Object3D, x: number, z: number, cloth: string, guests: number) => {
    mesh(ctx, new THREE.CylinderGeometry(0.6, 0.6, 0.75, 16), ctx.std(cloth), x, 0.38, z, parent);
    for (let k = 0; k < guests; k++) { const a = (k / guests) * Math.PI * 2; person(ctx, parent, x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, ['#7B5CFF', '#FF4D6D', '#22C7B5', '#FF9F1C'][k % 4]); }
  };
  tableAt(ctx.root, -3, 1.5, '#F4F1EA', 2); tableAt(ctx.root, 3, 1.5, '#F4F1EA', 2);
  // zones: each a new part of the restaurant round the outside
  const zs = zones((i, open, locked, x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); open.add(g);
    const floor = ['#B5844A', '#E8323C', '#C9F28C', '#8B1E3F', '#E9C46A', '#2A2A55'][i];
    mesh(ctx, new THREE.BoxGeometry(4.6, 0.06, 3.6), ctx.std(floor, { roughness: 0.6 }), 0, 0.03, 0, g);
    if (i === 0) { mesh(ctx, new THREE.BoxGeometry(2, 1.4, 1.2), ctx.std('#FFE14D'), 0, 0.9, 0, g); awning(ctx, g, 0, 0.2, '#E8323C', '#F4F1EA'); for (const s of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12), ctx.std('#222'), s * 0.8, 0.3, 0.62, g).rotation.x = Math.PI / 2; }
    if (i === 1) for (let k = 0; k < 2; k++) { mesh(ctx, new THREE.BoxGeometry(1.6, 0.9, 0.5), ctx.std('#E8323C'), -1 + k * 2, 0.45, -0.6, g); tableAt(g, -1 + k * 2, 0.3, '#F4F1EA', 2); }
    if (i === 2) for (let k = 0; k < 2; k++) { tableAt(g, -1 + k * 2, 0, '#FFFFFF', 3); mesh(ctx, new THREE.ConeGeometry(1, 0.5, 8), ctx.std(k ? '#3DDC97' : '#FF9FD6'), -1 + k * 2, 2.3, 0, g); mesh(ctx, new THREE.CylinderGeometry(0.03, 0.03, 2, 6), ctx.std('#ccc'), -1 + k * 2, 1.2, 0, g); }
    if (i === 3) { for (let k = 0; k < 2; k++) tableAt(g, -1 + k * 2, 0, '#E8E2D4', 2); mesh(ctx, new THREE.BoxGeometry(2.4, 1.6, 0.4), ctx.std('#5A3A26'), 0, 0.8, -1.4, g); for (let k = 0; k < 12; k++) mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), ctx.std('#3A1A2A'), -1 + (k % 6) * 0.4, 0.5 + Math.floor(k / 6) * 0.5, -1.2, g).rotation.x = Math.PI / 2; }
    if (i === 4) { for (let k = 0; k < 2; k++) tableAt(g, -1 + k * 2, 0.2, '#FFFFFF', 4); mesh(ctx, new THREE.TorusGeometry(0.7, 0.05, 6, 20), ctx.std('#E9C46A', { metalness: 0.8 }), 0, 3, 0, g).rotation.x = Math.PI / 2; for (let k = 0; k < 6; k++) lampGlow(ctx, g, Math.cos(k) * 0.7, 3.05, Math.sin(k) * 0.7, '#FFF2C8', 0.08); }
    if (i === 5) { for (let k = 0; k < 2; k++) tableAt(g, -1 + k * 2, 0, '#2A2A55', 2); mesh(ctx, new THREE.BoxGeometry(4.6, 0.6, 0.1), ctx.std('#BFE3FF', { transparent: true, opacity: 0.4 }), 0, 0.4, 1.8, g); for (let k = 0; k < 10; k++) lampGlow(ctx, g, -2 + k * 0.45, 2.5, -1.6, '#FFE38A', 0.06); }
    // locked: a "coming soon" hoarding
    const lk = new THREE.Group(); lk.position.set(x, 0, z); lk.rotation.y = Math.atan2(-x, -z); locked.add(lk);
    mesh(ctx, new THREE.BoxGeometry(4.6, 2.2, 0.12), ctx.std('#D9C29A'), 0, 1.1, 1.8, lk);
    for (let k = 0; k < 3; k++) mesh(ctx, new THREE.BoxGeometry(4.6, 0.12, 0.14), ctx.std('#FFB13D'), 0, 0.4 + k * 0.7, 1.86, lk);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['mill', 'coop', 'dairy', 'boat', 'garden', 'pig'].indexOf(id); if (i < 0) return null;
    const g = new THREE.Group(); const [x, z] = pspot(i, k); g.position.set(x, 0, z); ups.push(g);
    if (id === 'mill') { mesh(ctx, new THREE.CylinderGeometry(0.4, 0.5, 1.4, 8), ctx.std('#F2E8D5'), 0, 0.7, 0, g); const b = new THREE.Group(); b.position.set(0, 1.3, 0.45); g.add(b); for (let j = 0; j < 4; j++) { const h = new THREE.Group(); h.rotation.z = (j / 4) * Math.PI * 2; b.add(h); mesh(ctx, new THREE.BoxGeometry(0.15, 0.8, 0.03), ctx.std('#8B6B4A'), 0, 0.4, 0, h); } g.userData.rotz = b; }
    else if (id === 'coop') { mesh(ctx, new THREE.BoxGeometry(1, 0.7, 0.8), ctx.std('#C0392B'), 0, 0.45, 0, g); mesh(ctx, new THREE.ConeGeometry(0.8, 0.5, 4), ctx.std('#6B4A33'), 0, 1.05, 0, g).rotation.y = Math.PI / 4; mesh(ctx, new THREE.SphereGeometry(0.16, 10, 8), ctx.std('#FFFFFF'), 0.6, 0.18, 0.3, g); }
    else if (id === 'dairy') for (let j = 0; j < 3; j++) mesh(ctx, new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), ctx.std('#FFD23F'), (j - 1) * 0.35, 0.1 + (j === 1 ? 0.2 : 0), 0, g);
    else if (id === 'boat') { const b = mesh(ctx, new THREE.CylinderGeometry(0.4, 0.25, 1.4, 10, 1, false, 0, Math.PI), ctx.std('#8B5A2B', { side: THREE.DoubleSide }), 0, 0.3, 0, g); b.rotation.set(0, 0, Math.PI / 2); mesh(ctx, new THREE.SphereGeometry(0.12, 8, 6), ctx.std('#A8C8FF'), 0.3, 0.35, 0, g); }
    else if (id === 'garden') for (let j = 0; j < 3; j++) { mesh(ctx, new THREE.SphereGeometry(0.3, 10, 8), ctx.std('#2E8B57'), (j - 1) * 0.5, 0.3, 0, g); for (let q = 0; q < 3; q++) mesh(ctx, new THREE.SphereGeometry(0.06, 6, 4), ctx.std('#E8323C'), (j - 1) * 0.5 + (q - 1) * 0.12, 0.45, 0.25, g); }
    else { mesh(ctx, new THREE.CapsuleGeometry(0.25, 0.4, 4, 10), ctx.std('#FFB3C8'), 0, 0.3, 0, g).rotation.z = Math.PI / 2; mesh(ctx, new THREE.SphereGeometry(0.12, 8, 6), ctx.std('#FF9FB8'), 0.42, 0.3, 0, g); }
    return g;
  };
  return {
    sky: '#2A2440', fog: ['#3A2E50', 34, 80], light: ['#FFE3C2', '#3A2A40', 1.15, '#FFD9B0', 1.4], bounds: B, stations: S, zones: zs, producer,
    update(t) {
      for (let i = 0; i < 30; i++) { const k = (t * 0.3 + i / 30) % 1; steam.pos.set([S.make.x - 0.5 + (i % 2) + Math.sin(t + i) * 0.1, 1.1 + k * 1.4, S.make.z], i * 3); } steam.done();
      flames.forEach((f, i) => f.scale.setScalar(0.9 + Math.sin(t * 14 + i) * 0.15));
      ctx.dyn.children.forEach((m) => { if (m.userData.pan != null) m.position.y = 1 + Math.max(0, Math.sin(t * 4 + m.userData.pan * 2)) * 0.12; });
      ups.forEach((g) => { if (g.userData.rotz) (g.userData.rotz as THREE.Object3D).rotation.z = t * 1.5; });
    },
  };
}

// ======================================================================================================================
// ⚔️ Dungeon
// ======================================================================================================================
function dungeon(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  const flags = ctx.tex(256, 256, (g) => { g.fillStyle = '#5A5464'; g.fillRect(0, 0, 256, 256); const rr = rng(8); for (let y = 0; y < 256; y += 42) for (let x = (y / 42) % 2 ? -32 : 0; x < 256; x += 64) { g.fillStyle = ['#6A6474', '#545060', '#625C6C'][Math.floor(rr() * 3)]; g.fillRect(x + 2, y + 2, 60, 38); } }, 8);
  flat(mesh(ctx, new THREE.PlaneGeometry(60, 60), ctx.std('#ffffff', { map: flags, roughness: 0.95 })));
  // stone walls, pillars, chains, banners
  const stone = ctx.std('#3F3A47', { roughness: 1, flatShading: true });
  for (const [x, z, w, d] of [[0, -18, 40, 2], [-19, 0, 2, 36], [19, 0, 2, 36]] as const) mesh(ctx, new THREE.BoxGeometry(w, 5, d), stone, x, 2.5, z);
  const pil: Inst[] = []; for (const x of [-10, -3.3, 3.3, 10]) for (const z of [-9.5]) pil.push({ x, y: 2.5, z }); for (const z of [-8, 0, 8]) for (const x of [-17, 17]) pil.push({ x, y: 2.5, z });
  scatter(ctx, new THREE.CylinderGeometry(0.6, 0.7, 5, 8), ctx.std('#5A5462', { flatShading: true }), pil, true);
  for (let k = 0; k < 4; k++) { const b = mesh(ctx, new THREE.PlaneGeometry(1.2, 2.6), ctx.std(['#6B1E8A', '#8B1E3F'][k % 2], { side: THREE.DoubleSide }), -10 + k * 6.6, 3, -16.9); void b; }
  const torches: THREE.Mesh[] = [], lights: THREE.PointLight[] = [];
  for (const [x, z] of [[-6.6, -16.8], [0, -16.8], [6.6, -16.8], [-17.8, -4], [17.8, -4], [-17.8, 4], [17.8, 4]]) {
    mesh(ctx, new THREE.CylinderGeometry(0.06, 0.04, 0.6, 6), ctx.std('#5A3A26'), x, 2.6, z);
    torches.push(mesh(ctx, new THREE.ConeGeometry(0.16, 0.4, 8), ctx.std('#FF8A00', { emissive: '#FF6A00', emissiveIntensity: 2.5 }), x, 3.05, z, ctx.dyn));
    if (!ctx.phone && lights.length < 4) { const l = new THREE.PointLight('#FF9A4D', 14, 15, 1.4); l.position.set(x, 3.2, z * 0.92); ctx.scene.add(l); lights.push(l); }
  }
  const bones: Inst[] = []; for (let i = 0; i < 30; i++) bones.push({ x: (r() * 2 - 1) * 17, y: 0.06, z: -16 + r() * 3 + (i % 2 ? 0 : 26), s: 0.6 + r() * 0.5, ry: r() * 3, rx: Math.PI / 2 });
  scatter(ctx, new THREE.CapsuleGeometry(0.05, 0.4, 2, 6), ctx.std('#E8E2D4'), bones);
  const S = SPOTS({ play: '🗡️ Dungeon Dash', collect: '💰 Treasure chest', build: '🗺️ War table', make: '⚒️ Forge', market: '🧥 Shady merchant', book: '👑 Loot pedestal' });
  // stairs down into the dark, through an iron gate
  for (let k = 0; k < 5; k++) mesh(ctx, new THREE.BoxGeometry(2.6, 0.2, 0.5), ctx.std('#2A2630'), S.play.x, -0.1 - k * 0.2, S.play.z - 0.6 - k * 0.45);
  for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(0.5, 3, 0.5), stone, S.play.x + s * 1.6, 1.5, S.play.z - 0.4);
  mesh(ctx, new THREE.BoxGeometry(3.7, 0.5, 0.6), stone, S.play.x, 3.1, S.play.z - 0.4);
  const gate = new THREE.Group(); gate.position.set(S.play.x, 0, S.play.z - 0.4); ctx.dyn.add(gate);
  for (let k = 0; k < 6; k++) mesh(ctx, new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), ctx.std('#2A2A33', { metalness: 0.7 }), -1.1 + k * 0.44, 1.4, 0, gate);
  // the treasure chest
  mesh(ctx, new THREE.BoxGeometry(1.4, 0.8, 0.9), ctx.std('#8B5A2B'), S.collect.x, 0.4, S.collect.z);
  mesh(ctx, new THREE.BoxGeometry(1.3, 0.15, 0.8), ctx.std('#FFD23F', { emissive: '#FFB300', emissiveIntensity: 0.6, metalness: 0.6 }), S.collect.x, 0.82, S.collect.z);
  const coins: Inst[] = []; for (let k = 0; k < 18; k++) coins.push({ x: S.collect.x + (r() - 0.5) * 2.2, y: 0.03, z: S.collect.z + 0.6 + r() * 0.8, ry: r() * 3 });
  scatter(ctx, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), ctx.std('#FFD23F', { metalness: 0.8, roughness: 0.3 }), coins);
  // the war table with a map
  mesh(ctx, new THREE.BoxGeometry(2.2, 0.85, 1.4), ctx.std('#5A3A26'), S.build.x, 0.42, S.build.z);
  mesh(ctx, new THREE.PlaneGeometry(1.9, 1.1), ctx.std('#E8D9A8'), S.build.x, 0.86, S.build.z).rotation.x = -Math.PI / 2;
  for (let k = 0; k < 4; k++) mesh(ctx, new THREE.ConeGeometry(0.06, 0.2, 6), ctx.std(['#E8323C', '#3DDC97', '#22B8CF', '#FFD23F'][k]), S.build.x - 0.6 + k * 0.4, 0.97, S.build.z + (k % 2 ? 0.2 : -0.2));
  // the forge: anvil, glowing coals, a bellows
  mesh(ctx, new THREE.BoxGeometry(1.2, 0.8, 1.2), stone, S.make.x - 0.6, 0.4, S.make.z);
  const coals = mesh(ctx, new THREE.BoxGeometry(1, 0.1, 1), ctx.std('#FF4D00', { emissive: '#FF4D00', emissiveIntensity: 2 }), S.make.x - 0.6, 0.85, S.make.z, ctx.dyn);
  mesh(ctx, new THREE.BoxGeometry(0.4, 0.5, 0.3), ctx.std('#333'), S.make.x + 0.8, 0.25, S.make.z); mesh(ctx, new THREE.BoxGeometry(0.9, 0.25, 0.4), ctx.std('#2A2A33', { metalness: 0.7 }), S.make.x + 0.8, 0.6, S.make.z);
  // a hooded merchant behind a cloth-covered crate
  mesh(ctx, new THREE.BoxGeometry(1.6, 0.8, 0.9), ctx.std('#4A2A5A'), S.market.x, 0.4, S.market.z);
  mesh(ctx, new THREE.ConeGeometry(0.4, 1.2, 10), ctx.std('#2A1A3A'), S.market.x, 1.2, S.market.z - 0.9); lampGlow(ctx, ctx.root, S.market.x - 0.08, 1.5, S.market.z - 0.6, '#C3A8FF', 0.04); lampGlow(ctx, ctx.root, S.market.x + 0.08, 1.5, S.market.z - 0.6, '#C3A8FF', 0.04);
  mesh(ctx, new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10), ctx.std('#22E3FF', { emissive: '#22E3FF', emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }), S.market.x + 0.5, 0.95, S.market.z);
  // a pedestal with a glowing crown
  mesh(ctx, new THREE.CylinderGeometry(0.5, 0.6, 1, 8), ctx.std('#5A5462'), S.book.x, 0.5, S.book.z);
  const crown = mesh(ctx, new THREE.CylinderGeometry(0.3, 0.25, 0.25, 8, 1, true), ctx.std('#FFD23F', { metalness: 0.9, roughness: 0.2, emissive: '#FFB300', emissiveIntensity: 0.5, side: THREE.DoubleSide }), S.book.x, 1.3, S.book.z, ctx.dyn);
  // zones: deeper floors behind portcullises
  const ZF = ['#2A2630', '#3A3A22', '#1E3A22', '#2A2A44', '#3A1A12', '#3A2A12'];
  const zs = zones((i, open, locked, x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); open.add(g);
    mesh(ctx, new THREE.BoxGeometry(4.6, 0.06, 3.6), ctx.std(ZF[i]), 0, 0.03, 0, g);
    if (i === 0) for (let k = 0; k < 2; k++) mesh(ctx, new THREE.BoxGeometry(0.8, 0.6, 2), ctx.std('#5A5462'), -1 + k * 2, 0.3, 0, g);
    if (i === 1) for (let k = 0; k < 3; k++) mesh(ctx, new THREE.ConeGeometry(0.7, 1.4, 6), ctx.std(['#8B6B4A', '#6B4A33', '#A57A4A'][k]), -1.4 + k * 1.4, 0.7, 0, g);
    if (i === 2) flat(mesh(ctx, new THREE.PlaneGeometry(4.4, 1.2), ctx.std('#3DDC97', { emissive: '#1E8A4A', emissiveIntensity: 0.8, roughness: 0.1 }), 0, 0.07, 0, g));
    if (i === 3) for (let k = 0; k < 2; k++) { mesh(ctx, new THREE.BoxGeometry(0.5, 1.4, 0.4), ctx.std('#9AA0B0', { metalness: 0.7 }), -1 + k * 2, 0.7, -0.5, g); mesh(ctx, new THREE.SphereGeometry(0.28, 10, 8), ctx.std('#BFE3FF', { transparent: true, opacity: 0.4, emissive: '#BFE3FF', emissiveIntensity: 0.5 }), -1 + k * 2, 1.7, -0.5, g); }
    if (i === 4) { flat(mesh(ctx, new THREE.CircleGeometry(1.2, 20), ctx.std('#FF4D00', { emissive: '#FF4D00', emissiveIntensity: 1.8 }), -0.8, 0.07, 0, g)); mesh(ctx, new THREE.BoxGeometry(0.9, 0.5, 0.5), ctx.std('#2A2A33', { metalness: 0.8 }), 1.2, 0.5, 0, g); }
    if (i === 5) { const pile = mesh(ctx, new THREE.SphereGeometry(1.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#FFD23F', { metalness: 0.8, roughness: 0.3, emissive: '#FFB300', emissiveIntensity: 0.3 }), 0, 0, 0, g); pile.scale.y = 0.5; const drag = mesh(ctx, new THREE.CapsuleGeometry(0.6, 1.6, 6, 12), ctx.std('#8B1E3F', { roughness: 0.5 }), 0, 1.1, 0, g); drag.rotation.z = Math.PI / 2; mesh(ctx, new THREE.ConeGeometry(0.4, 0.8, 8), ctx.std('#8B1E3F'), 1.4, 1.3, 0, g).rotation.z = -Math.PI / 2; }
    // a portcullis
    const lk = new THREE.Group(); lk.position.set(x, 0, z); lk.rotation.y = Math.atan2(-x, -z); locked.add(lk);
    for (let k = 0; k < 9; k++) mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 3, 6), ctx.std('#2A2A33', { metalness: 0.7 }), -2 + k * 0.5, 1.5, 1.7, lk);
    for (let k = 0; k < 3; k++) mesh(ctx, new THREE.BoxGeometry(4.4, 0.1, 0.12), ctx.std('#2A2A33', { metalness: 0.7 }), 0, 0.6 + k * 0.9, 1.7, lk);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['skeleton', 'pit', 'goblins', 'tower', 'altar', 'nest'].indexOf(id); if (i < 0) return null;
    const g = new THREE.Group(); const [x, z] = pspot(i, k); g.position.set(x, 0, z); ups.push(g);
    if (id === 'skeleton') { const b = ctx.std('#E8E2D4'); mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), b, 0, 0.6, 0, g); for (let j = 0; j < 4; j++) mesh(ctx, new THREE.TorusGeometry(0.18, 0.025, 4, 12, Math.PI), b, 0, 0.75 + j * 0.1, 0, g).rotation.y = Math.PI / 2; mesh(ctx, new THREE.SphereGeometry(0.2, 10, 8), b, 0, 1.2, 0, g); g.userData.bob = 1; }
    else if (id === 'pit') { flat(mesh(ctx, new THREE.CircleGeometry(0.6, 16), ctx.std('#3DDC97', { emissive: '#1E8A4A', emissiveIntensity: 0.8 }), 0, 0.05, 0, g)); const s = mesh(ctx, new THREE.SphereGeometry(0.3, 12, 10), ctx.std('#7BE0A8', { transparent: true, opacity: 0.85 }), 0, 0.2, 0, g); g.userData.squish = s; }
    else if (id === 'goblins') { mesh(ctx, new THREE.CapsuleGeometry(0.18, 0.3, 4, 8), ctx.std('#5A8A3A'), 0, 0.4, 0, g); mesh(ctx, new THREE.SphereGeometry(0.18, 10, 8), ctx.std('#7AAA4A'), 0, 0.8, 0, g); for (const s of [-1, 1]) mesh(ctx, new THREE.ConeGeometry(0.06, 0.25, 6), ctx.std('#7AAA4A'), s * 0.2, 0.85, 0, g).rotation.z = -s * 1.2; g.userData.bob = 2; }
    else if (id === 'tower') { mesh(ctx, new THREE.CylinderGeometry(0.45, 0.55, 2, 10), ctx.std('#5A5462'), 0, 1, 0, g); mesh(ctx, new THREE.ConeGeometry(0.6, 1, 10), ctx.std('#3A2A6A'), 0, 2.5, 0, g); g.userData.orb = lampGlow(ctx, g, 0, 3.2, 0, '#C3A8FF', 0.15); }
    else if (id === 'altar') { mesh(ctx, new THREE.BoxGeometry(1, 0.6, 0.6), ctx.std('#2A2630'), 0, 0.3, 0, g); g.userData.orb = lampGlow(ctx, g, 0, 1, 0, '#22B8FF', 0.2); for (const s of [-1, 1]) lampGlow(ctx, g, s * 0.4, 0.75, 0, '#FFB84D', 0.06); }
    else { mesh(ctx, new THREE.TorusGeometry(0.5, 0.2, 8, 16), ctx.std('#6B4A33'), 0, 0.2, 0, g).rotation.x = Math.PI / 2; for (let j = 0; j < 3; j++) mesh(ctx, new THREE.SphereGeometry(0.18, 10, 8), ctx.std(['#8B1E3F', '#FFB13D', '#3DDC97'][j]), (j - 1) * 0.25, 0.3, 0, g).scale.y = 1.3; }
    return g;
  };
  return {
    sky: '#16101E', fog: ['#16101E', 30, 70], light: ['#C0B2E8', '#554A66', 2.3, '#FFD4AA', 1.5], bounds: B, stations: S, zones: zs, producer,
    update(t) {
      torches.forEach((f, i) => f.scale.set(1 + Math.sin(t * 13 + i) * 0.12, 1 + Math.sin(t * 17 + i * 2) * 0.2, 1));
      lights.forEach((l, i) => { l.intensity = 13 + Math.sin(t * 11 + i * 3) * 1.4; });
      (coals.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(t * 5) * 0.5;
      crown.rotation.y = t; crown.position.y = 1.3 + Math.sin(t * 2) * 0.08;
      gate.position.y = Math.max(0, Math.sin(t * 0.5)) * 0.15;
      ups.forEach((g, i) => { if (g.userData.bob) g.position.y = Math.abs(Math.sin(t * 3 + i)) * 0.08; if (g.userData.squish) (g.userData.squish as THREE.Object3D).scale.set(1 + Math.sin(t * 4 + i) * 0.15, 1 - Math.sin(t * 4 + i) * 0.15, 1); if (g.userData.orb) (g.userData.orb as THREE.Object3D).position.y = (g.userData.orb as THREE.Object3D).position.y + Math.sin(t * 2 + i) * 0.003; });
    },
  };
}

// (the arena has its own screen; it never uses the shared realm world)
export const REALM_ENVS: Record<RealmKind, (ctx: Ctx) => RealmEnv> = { mine, sky, workshop, diner, dungeon, brawl: dungeon };
