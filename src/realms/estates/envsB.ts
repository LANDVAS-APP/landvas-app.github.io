// Estate worlds, part 2: 🎈 Aurora Skyport · ⚙️ Clockwork Foundry · 🍱 Grand Food Hall · 🐉 Dragonspire Citadel ·
// 🏟️ Champions' Colosseum.
import { motes } from '../../home/live3d/kit3d';
import type { RealmEnv } from '../realm3d';
import { BOUNDS, THREE, around, ball, box, cone, cyl, disc, floor, glow, keep, lamp, mesh, person, prodGroup, scatter, shadows, spots, zones, type Ctx, type Inst } from './envKit';

// ======================================================================================================================
// 🎈 Aurora Skyport — wooden docks on a sea of cloud under the northern lights, airships circling
// ======================================================================================================================
export function skyport(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  // a sea of cloud below, then a big round deck of planks
  const cloud = ctx.std('#E8EEFF', { roughness: 1, emissive: '#3A3A80', emissiveIntensity: 0.25 });
  const puffs: Inst[] = []; for (let i = 0; i < 110; i++) { const a = r() * Math.PI * 2, d = 18 + r() * 30; puffs.push({ x: Math.cos(a) * d, y: -1.5 + r() * 1.2, z: Math.sin(a) * d, s: 2 + r() * 3.5, sy: 0.8 + r() * 0.6 }); }
  scatter(ctx, new THREE.SphereGeometry(1, 10, 8), cloud, puffs);
  const deck = floor(ctx, (g) => { g.fillStyle = '#5A4A6A'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#655478' : '#4E405E'; g.fillRect(i * 16, 0, 15, 256); } }, 6, 38);
  deck.scale.set(1, 0.85, 1);
  const brass = ctx.std('#D9A84A', { metalness: 0.85, roughness: 0.3 });
  for (let a = 0; a < 40; a++) { const ang = (a / 40) * Math.PI * 2; cyl(ctx, ctx.root, 0.08, 0.08, 1, brass, Math.cos(ang) * 18.5, 0.5, Math.sin(ang) * 15.7); }
  // the aurora: tall glowing ribbons
  const auroraMats: THREE.MeshStandardMaterial[] = [];
  for (let k = 0; k < 4; k++) { const c = ['#3DDC97', '#8A7CFF', '#22E3FF', '#FF7AC8'][k]; const m = ctx.std(c, { emissive: c, emissiveIntensity: 1.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }); auroraMats.push(m); const p = mesh(ctx, new THREE.PlaneGeometry(60, 9, 30, 1), m, (k - 1.5) * 4, 13 + k * 1.5, -30 - k * 3, ctx.dyn); p.castShadow = false; const pos = p.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.25 + k) * 3); pos.needsUpdate = true; }
  // airships slowly circling
  const fleet = keep(new THREE.Group()); ctx.dyn.add(fleet);
  for (let k = 0; k < 4; k++) { const s = new THREE.Group(); const a = (k / 4) * Math.PI * 2; s.position.set(Math.cos(a) * 26, 8 + k * 1.5, Math.sin(a) * 22); s.rotation.y = -a; fleet.add(s); const env = ball(ctx, s, 1.6, ['#FF7AC8', '#8A7CFF', '#F2C14E', '#3DDC97'][k], 0, 0, 0); env.scale.set(2.2, 1, 1); box(ctx, s, 1.6, 0.5, 0.7, '#6B4A33', 0, -1.4, 0); }
  const S = spots({ play: '⚓ Airship Docking', collect: '📦 Cargo dock', build: '🗺️ Harbour board', make: '⛵ Shipwright', market: '🧑‍✈️ Harbour master', book: '📖 Captain’s log' });
  // play: a mooring mast with a docking ring and a tethered balloon
  cyl(ctx, ctx.root, 0.15, 0.2, 4, brass, S.play.x, 2, S.play.z - 0.8); const ring = mesh(ctx, new THREE.TorusGeometry(1.1, 0.08, 8, 30), ctx.std('#FFE14D', { emissive: '#FFE14D', emissiveIntensity: 1.2 }), S.play.x, 0.08, S.play.z - 0.8); ring.rotation.x = Math.PI / 2;
  const tether = keep(new THREE.Group()); tether.position.set(S.play.x + 1.4, 0, S.play.z - 1.4); ctx.dyn.add(tether);
  const bal = ball(ctx, tether, 0.9, '#8A7CFF', 0, 3.8, 0); bal.scale.y = 1.2; box(ctx, tether, 0.6, 0.35, 0.6, '#6B4A33', 0, 2.5, 0); cyl(ctx, tether, 0.01, 0.01, 2.5, '#DDD', -0.7, 1.25, 0.7).rotation.z = 0.3;
  // cargo, harbour board, ship frame, harbour master's hut, the log
  for (let k = 0; k < 5; k++) box(ctx, ctx.root, 0.6, 0.6, 0.6, ['#8B5A2B', '#6B4A33', '#A0703A'][k % 3], S.collect.x - 0.6 + (k % 3) * 0.6, 0.3 + Math.floor(k / 3) * 0.6, S.collect.z);
  box(ctx, ctx.root, 0.1, 1.6, 0.1, '#6B4A33', S.build.x, 0.8, S.build.z); box(ctx, ctx.root, 1.5, 1, 0.06, '#E8D9A8', S.build.x, 1.5, S.build.z); mesh(ctx, new THREE.CircleGeometry(0.3, 16), ctx.std('#2E6BDB'), S.build.x, 1.5, S.build.z + 0.04);
  for (let k = 0; k < 6; k++) { const rib = mesh(ctx, new THREE.TorusGeometry(0.7 - Math.abs(k - 2.5) * 0.08, 0.05, 6, 16, Math.PI), ctx.std('#8B6B4A'), S.make.x - 1 + k * 0.4, 0.75, S.make.z); rib.rotation.set(Math.PI, Math.PI / 2, 0); }
  box(ctx, ctx.root, 2.6, 0.08, 0.1, '#6B4A33', S.make.x, 0.1, S.make.z);
  box(ctx, ctx.root, 2, 1.8, 1.4, '#3A2E5A', S.market.x, 0.9, S.market.z - 0.2); cone(ctx, ctx.root, 1.5, 1, '#D9A84A', S.market.x, 2.3, S.market.z - 0.2, 4); person(ctx, ctx.root, S.market.x, S.market.z + 0.8, '#1E2A5A', '#111');
  glow(ctx, ctx.root, S.market.x, 2.9, S.market.z - 0.2, '#FFE14D', 0.2, 2);
  cyl(ctx, ctx.root, 0.08, 0.12, 1, brass, S.book.x, 0.5, S.book.z); const lect = box(ctx, ctx.root, 0.8, 0.06, 0.6, '#6B4A33', S.book.x, 1.05, S.book.z); lect.rotation.x = -0.4; box(ctx, ctx.root, 0.6, 0.04, 0.45, '#E8D9A8', S.book.x, 1.1, S.book.z + 0.02).rotation.x = -0.4;
  const bobbers: THREE.Object3D[] = [], compass: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 3; k++) { const b = keep(new THREE.Group()); b.position.set(-2 + k * 2, 0, 0); o.add(b); const e = ball(ctx, b, 0.7, ['#FF7AC8', '#F2C14E', '#22E3FF'][k], 0, 2.8, 0); e.scale.y = 1.2; box(ctx, b, 0.4, 0.3, 0.4, '#6B4A33', 0, 1.8, 0); bobbers.push(b); cyl(ctx, o, 0.06, 0.06, 0.6, brass, -2 + k * 2, 0.3, 0); }
    if (i === 1) for (let k = 0; k < 3; k++) { const e = ball(ctx, o, 1, ['#8A7CFF', '#FF7AC8', '#3DDC97'][k], -2.2 + k * 2.2, 0.6, 0); e.scale.set(1, 0.5, 1.4); }
    if (i === 2) { cyl(ctx, o, 0.6, 0.9, 4.5, '#3A2E5A', 0, 2.25, -0.4); const c = keep(new THREE.Group()); c.position.set(0, 4.9, -0.4); o.add(c); mesh(ctx, new THREE.TorusGeometry(0.8, 0.06, 6, 24), brass, 0, 0, 0, c); box(ctx, c, 0.1, 1.6, 0.06, ctx.std('#FF5A5F', { emissive: '#FF5A5F', emissiveIntensity: 1 }), 0, 0, 0); compass.push(c); }
    if (i === 3) { box(ctx, o, 6, 0.2, 3, '#4E405E', 0, 0.1, 0); for (let k = 0; k < 4; k++) glow(ctx, o, -2.4 + k * 1.6, 0.6, 1.2, ['#3DDC97', '#8A7CFF', '#22E3FF', '#FF7AC8'][k], 0.2, 2); }
    if (i === 4) { box(ctx, o, 5, 0.15, 2, '#4E405E', 0, 0.08, 0); for (let k = 0; k < 7; k++) mesh(ctx, new THREE.OctahedronGeometry(0.25 + r() * 0.25, 0), ctx.std('#CFF4FF', { emissive: '#8AE8FF', emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }), -2.2 + r() * 4.4, 0.4, -0.6 + r() * 1.2, o); }
    if (i === 5) { box(ctx, o, 1.6, 0.2, 6, '#4E405E', 0, 0.1, 0); const portal = mesh(ctx, new THREE.TorusGeometry(1.4, 0.15, 10, 36), ctx.std('#FFFFFF', { emissive: '#B8A8FF', emissiveIntensity: 2 }), 0, 1.6, -2.6, o); void portal; disc(ctx, o, 1.2, ctx.std('#8A7CFF', { emissive: '#8A7CFF', emissiveIntensity: 1.2, transparent: true, opacity: 0.6 }), 0, 1.6, -2.6).rotation.x = 0; }
    // locked: a bank of storm cloud
    for (let k = 0; k < 8; k++) ball(ctx, l, 0.9 + r() * 0.5, ctx.std('#3A3A52', { roughness: 1 }), -3 + k * 0.85, 0.8 + r() * 0.6, 0.6);
    glow(ctx, l, 0, 1.6, 1.2, '#FFE14D', 0.08, 3);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['sailmaker', 'gasworks', 'foundry', 'observatory', 'loom', 'cometnet'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'sailmaker') { box(ctx, g, 0.08, 1.6, 0.08, '#6B4A33', 0, 0.8, 0); const sail = mesh(ctx, new THREE.PlaneGeometry(0.9, 1.1), ctx.std('#F2EEE6', { side: THREE.DoubleSide }), 0.45, 1, 0, g); g.userData.sail = sail; }
    else if (id === 'gasworks') { cyl(ctx, g, 0.4, 0.4, 1, '#C0C4CC', 0, 0.5, 0); ball(ctx, g, 0.4, '#C0C4CC', 0, 1, 0); const b = ball(ctx, g, 0.3, '#FF7AC8', 0, 1.8, 0); g.userData.float = b; }
    else if (id === 'foundry') { cyl(ctx, g, 0.35, 0.45, 0.6, '#3A3A4A', 0, 0.3, 0); mesh(ctx, new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, 0.8, 0, g).rotation.x = Math.PI; }
    else if (id === 'observatory') { mesh(ctx, new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#3A2E5A'), 0, 0.5, 0, g); cyl(ctx, g, 0.5, 0.5, 0.5, '#4E405E', 0, 0.25, 0); const sc = cyl(ctx, g, 0.08, 0.1, 0.8, brass, 0.2, 1, 0); sc.rotation.z = -0.8; g.userData.scope = sc; }
    else if (id === 'loom') { box(ctx, g, 1, 0.9, 0.3, '#6B4A33', 0, 0.45, 0); const silk = mesh(ctx, new THREE.PlaneGeometry(0.8, 0.7), ctx.std('#8A7CFF', { emissive: '#8A7CFF', emissiveIntensity: 0.9, side: THREE.DoubleSide }), 0, 0.55, 0.16, g); g.userData.silk = silk; }
    else { cyl(ctx, g, 0.04, 0.04, 1.6, brass, 0, 0.8, 0); mesh(ctx, new THREE.TorusGeometry(0.5, 0.03, 6, 20), ctx.std('#CFF4FF'), 0, 1.6, 0, g).rotation.x = Math.PI / 2; g.userData.ice = glow(ctx, g, 0, 1.55, 0, '#CFF4FF', 0.14, 1.4); }
    return shadows(g);
  };
  const stars = motes(ctx, 180, '#FFFFFF', 0.12); for (let i = 0; i < 180; i++) { stars.pos[i * 3] = (r() - 0.5) * 120; stars.pos[i * 3 + 1] = 10 + r() * 30; stars.pos[i * 3 + 2] = -20 - r() * 50; } stars.done();
  return {
    sky: '#080A24', fog: ['#151840', 34, 100], light: ['#B8A8FF', '#3A2E5A', 1.8, '#CFE4FF', 1.4], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      fleet.rotation.y = t * 0.05; tether.position.y = Math.sin(t * 1.3) * 0.15;
      auroraMats.forEach((m, k) => { m.opacity = 0.16 + Math.sin(t * 0.7 + k) * 0.08; });
      bobbers.forEach((b, k) => { b.position.y = Math.sin(t * 1.5 + k) * 0.15; }); compass.forEach((c) => { c.rotation.y = t * 0.8; });
      ups.forEach((g, i) => { if (g.userData.sail) (g.userData.sail as THREE.Object3D).rotation.y = Math.sin(t * 2 + i) * 0.3; if (g.userData.float) (g.userData.float as THREE.Object3D).position.y = 1.8 + Math.sin(t * 2 + i) * 0.12; if (g.userData.scope) (g.userData.scope as THREE.Object3D).rotation.y = t * 0.4; if (g.userData.ice) (g.userData.ice as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 3 + i) * 0.2); });
    },
  };
}

// ======================================================================================================================
// ⚙️ Clockwork Foundry — riveted steel floors, roaring furnaces, giant turning gears, a rocket on its pad
// ======================================================================================================================
export function foundry(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#4A4A52'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#2E2E34'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); } g.fillStyle = '#6A6A74'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) for (const [a, b] of [[6, 6], [58, 6], [6, 58], [58, 58]]) { g.beginPath(); g.arc(x * 64 + a, y * 64 + b, 2.5, 0, Math.PI * 2); g.fill(); } for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(120,70,30,0.25)'; g.fillRect(r() * 256, r() * 256, 6, 3); } }, 10, 70, 0.6);
  const steel = ctx.std('#5A5A66', { metalness: 0.7, roughness: 0.4 }), copper = ctx.std('#C87533', { metalness: 0.85, roughness: 0.3 }), brass = ctx.std('#D9A84A', { metalness: 0.85, roughness: 0.3 });
  // chimneys and pipes round the walls
  around(ctx, 16, 20, 24, (x, z, a, i) => { const h = 8 + r() * 8; cyl(ctx, ctx.root, 0.9, 1.1, h, i % 2 ? '#6B3A2A' : steel, x, h / 2, z); cyl(ctx, ctx.root, 1.1, 1.1, 0.4, '#2A2A2A', x, h, z); });
  for (let a = 0; a < 3; a++) { const p = cyl(ctx, ctx.root, 0.35, 0.35, 34, copper, 0, 4 + a * 1.2, -17 + a * 0.2); p.rotation.z = Math.PI / 2; }
  // giant gears turning in the back wall
  const gears: THREE.Object3D[] = [];
  const gear = (parent: THREE.Object3D, R: number, teeth: number, mat: THREE.Material) => { const g = keep(new THREE.Group()); parent.add(g); cyl(ctx, g, R, R, 0.4, mat, 0, 0, 0, 24).rotation.x = Math.PI / 2; for (let k = 0; k < teeth; k++) { const a = (k / teeth) * Math.PI * 2; const tth = box(ctx, g, 0.4, R * 0.25, 0.4, mat, Math.cos(a) * R, Math.sin(a) * R, 0); tth.rotation.z = a - Math.PI / 2; } cyl(ctx, g, R * 0.25, R * 0.25, 0.5, '#2A2A2A', 0, 0, 0).rotation.x = Math.PI / 2; return g; };
  for (const [x, y, R, dir] of [[-8, 6, 3.2, 1], [-3.2, 8.2, 2, -1.6], [4, 6.5, 3.6, 0.9], [10, 9, 2.2, -1.4]] as const) { const g = gear(ctx.dyn, R, Math.round(R * 6), x % 2 ? brass : copper); g.position.set(x, y, -19); g.userData.dir = dir; gears.push(g); }
  const S = spots({ play: '🚀 Rocket Stages', collect: '📦 Parts bin', build: '📐 Blueprint board', make: '🦾 Assembly floor', market: '🔩 Parts exchange', book: '🗄️ Patent archive' });
  // play: a brass rocket on its launch pad
  cyl(ctx, ctx.root, 1.4, 1.6, 0.4, '#3A3A42', S.play.x, 0.2, S.play.z - 0.8);
  for (let k = 0; k < 3; k++) cyl(ctx, ctx.root, 0.45, 0.45, 0.9, k % 2 ? copper : brass, S.play.x, 0.85 + k * 0.9, S.play.z - 0.8);
  cone(ctx, ctx.root, 0.45, 0.9, '#E2783B', S.play.x, 3.5, S.play.z - 0.8, 14);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const f = box(ctx, ctx.root, 0.06, 0.7, 0.5, '#E2783B', S.play.x + Math.cos(a) * 0.5, 0.75, S.play.z - 0.8 + Math.sin(a) * 0.5); f.rotation.y = -a; }
  for (const s of [-1, 1]) box(ctx, ctx.root, 0.15, 4, 0.15, steel, S.play.x + s * 1.3, 2, S.play.z - 0.8);
  const exhaust = glow(ctx, ctx.dyn, S.play.x, 0.35, S.play.z - 0.8, '#FF8A3D', 0.35, 2);
  // parts bin, blueprint board, robot arm, parts counter, archive drawers
  box(ctx, ctx.root, 1.6, 0.8, 1, steel, S.collect.x, 0.4, S.collect.z); for (let k = 0; k < 10; k++) { const m = mesh(ctx, new THREE.TorusGeometry(0.1, 0.04, 6, 8), brass, S.collect.x + (r() - 0.5) * 1.2, 0.85, S.collect.z + (r() - 0.5) * 0.6); m.rotation.x = r() * 3; }
  box(ctx, ctx.root, 0.1, 1.6, 0.1, steel, S.build.x, 0.8, S.build.z); box(ctx, ctx.root, 1.6, 1.1, 0.06, '#1E4A8A', S.build.x, 1.5, S.build.z); for (let k = 0; k < 4; k++) box(ctx, ctx.root, 1.2, 0.02, 0.07, '#BDE0FE', S.build.x, 1.2 + k * 0.2, S.build.z);
  cyl(ctx, ctx.root, 0.4, 0.5, 0.4, steel, S.make.x, 0.2, S.make.z);
  const arm = keep(new THREE.Group()); arm.position.set(S.make.x, 0.4, S.make.z); ctx.dyn.add(arm); const a1 = box(ctx, arm, 0.2, 1.2, 0.2, '#E2783B', 0, 0.6, 0); void a1; const elbow = new THREE.Group(); elbow.position.set(0, 1.2, 0); arm.add(elbow); box(ctx, elbow, 0.16, 1, 0.16, '#E2783B', 0.4, 0.2, 0).rotation.z = -1.1; keep(elbow);
  box(ctx, ctx.root, 2.2, 0.9, 0.8, '#3A2A1E', S.market.x, 0.45, S.market.z); person(ctx, ctx.root, S.market.x, S.market.z - 0.8, '#5A3A26', '#2A2A2A');
  for (let k = 0; k < 3; k++) mesh(ctx, new THREE.TorusGeometry(0.16, 0.06, 6, 10), brass, S.market.x - 0.6 + k * 0.6, 1.05, S.market.z).rotation.x = Math.PI / 2;
  box(ctx, ctx.root, 2.2, 1.8, 0.7, '#5A4A3A', S.book.x, 0.9, S.book.z); for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) box(ctx, ctx.root, 0.55, 0.45, 0.05, '#7A6A5A', S.book.x - 0.65 + x * 0.65, 0.4 + y * 0.55, S.book.z + 0.36);
  const sparks: THREE.Object3D[] = [], spinners: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 6; k++) { const m = mesh(ctx, new THREE.DodecahedronGeometry(0.5 + r() * 0.4, 0), ctx.std(['#6A6A74', '#8A5A3A', '#4A4A52'][k % 3], { metalness: 0.5, flatShading: true }), -2.5 + r() * 5, 0.4, -1 + r() * 2, o); m.scale.y = 0.6; }
    if (i === 1) for (let k = 0; k < 3; k++) { const x = -2 + k * 2; cyl(ctx, o, 0.3, 0.5, 2.6, copper, x, 1.3, 0); ball(ctx, o, 0.45, '#AAAAB0', x, 2.8, 0); const sp = keep(glow(ctx, o, x, 3.3, 0, '#9AE6FF', 0.15, 3)); sparks.push(sp); }
    if (i === 2) for (let k = 0; k < 2; k++) { const g = gear(o, 1.4 - k * 0.4, 10 - k * 2, k ? copper : brass); g.position.set(-1 + k * 2.2, 1.6, 0); g.userData.dir = k ? -1.4 : 1; spinners.push(g); }
    if (i === 3) for (let k = 0; k < 3; k++) { const c = cyl(ctx, o, 0.7, 0.7, 2.4, copper, -2 + k * 2, 1.2, 0); c.rotation.z = Math.PI / 2 * 0; ball(ctx, o, 0.7, copper, -2 + k * 2, 2.4, 0); cyl(ctx, o, 0.1, 0.1, 1.4, steel, -2 + k * 2 + 0.5, 3, 0); }
    if (i === 4) for (let k = 0; k < 5; k++) { cyl(ctx, o, 0.3, 0.3, 0.9, ctx.std('#BFE3FF', { transparent: true, opacity: 0.35 }), -2.4 + k * 1.2, 0.95, 0); glow(ctx, o, -2.4 + k * 1.2, 0.9, 0, ['#B57BFF', '#3DDC97', '#22B8FF', '#FFE14D', '#FF5A7A'][k], 0.18, 1.6); box(ctx, o, 6.4, 0.5, 0.8, steel, 0, 0.25, 0); }
    if (i === 5) { const core = keep(new THREE.Group()); core.position.set(0, 2.2, -0.4); o.add(core); glow(ctx, core, 0, 0, 0, '#9AE6FF', 0.7, 2.4); for (let k = 0; k < 3; k++) { const ring = mesh(ctx, new THREE.TorusGeometry(1.2 + k * 0.4, 0.07, 8, 40), brass, 0, 0, 0, core); ring.rotation.set(k * 1.1, k * 0.7, 0); } spinners.push(core); cyl(ctx, o, 1.6, 1.8, 0.6, steel, 0, 0.3, -0.4); }
    // locked: a rolled-down corrugated shutter
    box(ctx, l, 6.4, 3, 0.15, '#6A6A74', 0, 1.5, 0.8); for (let k = 0; k < 12; k++) box(ctx, l, 6.4, 0.05, 0.2, '#4A4A52', 0, 0.12 + k * 0.25, 0.8);
    for (let k = 0; k < 6; k++) box(ctx, l, 0.5, 0.12, 0.21, k % 2 ? '#FFE14D' : '#222', -2.5 + k, 0.2, 0.82);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['magnet', 'winder', 'press', 'boiler', 'lens', 'reactor'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'magnet') { box(ctx, g, 0.1, 1.6, 0.1, steel, 0, 0.8, 0); box(ctx, g, 1, 0.1, 0.1, steel, 0.45, 1.6, 0); const m = mesh(ctx, new THREE.TorusGeometry(0.22, 0.08, 6, 12, Math.PI), ctx.std('#D93B3B'), 0.9, 1.25, 0, g); m.rotation.z = Math.PI; g.userData.swing = m; }
    else if (id === 'winder') { const c = cyl(ctx, g, 0.3, 0.3, 0.6, copper, 0, 0.6, 0); c.rotation.z = Math.PI / 2; g.userData.spinX = c; box(ctx, g, 0.8, 0.3, 0.5, steel, 0, 0.15, 0); }
    else if (id === 'press') { box(ctx, g, 0.8, 0.2, 0.6, steel, 0, 0.1, 0); for (const s of [-1, 1]) box(ctx, g, 0.1, 1.3, 0.1, steel, s * 0.35, 0.75, 0); const hd = box(ctx, g, 0.6, 0.2, 0.5, '#E2783B', 0, 1, 0); g.userData.stamp = hd; }
    else if (id === 'boiler') { cyl(ctx, g, 0.4, 0.4, 1, copper, 0, 0.5, 0); ball(ctx, g, 0.4, copper, 0, 1, 0); cyl(ctx, g, 0.06, 0.06, 0.5, steel, 0.2, 1.45, 0); g.userData.puff = glow(ctx, g, 0.2, 1.8, 0, '#EEEEEE', 0.15, 0.3); }
    else if (id === 'lens') { cyl(ctx, g, 0.25, 0.25, 0.7, ctx.std('#BFE3FF', { transparent: true, opacity: 0.35 }), 0, 0.55, 0); g.userData.orb = glow(ctx, g, 0, 0.55, 0, '#B57BFF', 0.15, 2); cyl(ctx, g, 0.3, 0.3, 0.15, brass, 0, 0.1, 0); }
    else { cyl(ctx, g, 0.4, 0.45, 0.5, steel, 0, 0.25, 0); const ring = mesh(ctx, new THREE.TorusGeometry(0.35, 0.05, 6, 20), brass, 0, 0.9, 0, g); g.userData.spin = ring; glow(ctx, g, 0, 0.9, 0, '#9AE6FF', 0.15, 2.4); }
    return shadows(g);
  };
  const steam = motes(ctx, 100, '#E8E8F0', 0.35); const seeds = Array.from({ length: 100 }, () => [(r() - 0.5) * 36, (r() - 0.5) * 30, r() * 10]);
  const lights: THREE.PointLight[] = []; lamp(ctx, lights, '#FF8A3D', 16, 14, 0, 2, -6); lamp(ctx, lights, '#9AE6FF', 10, 12, -8, 3, 4);
  return {
    sky: '#2A1E1A', fog: ['#3A2A22', 26, 70], light: ['#FFD8B0', '#3A3A42', 2, '#FFB070', 1.8], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      gears.forEach((g) => { g.rotation.z = t * 0.3 * (g.userData.dir as number); }); spinners.forEach((g) => { if (g.userData.dir) g.rotation.z = t * 0.6 * (g.userData.dir as number); else { g.rotation.y = t * 0.8; g.rotation.x = Math.sin(t * 0.5) * 0.3; } });
      exhaust.scale.setScalar(1 + Math.sin(t * 13) * 0.25); arm.rotation.y = Math.sin(t * 0.8) * 1.2; (arm.children[1] as THREE.Object3D).rotation.z = Math.sin(t * 1.6) * 0.5;
      sparks.forEach((s, i) => { s.visible = Math.sin(t * 17 + i * 3) > 0.2; });
      seeds.forEach(([x, z, p], i) => { const y = ((t * 0.6 + p) % 10); steam.pos[i * 3] = x + Math.sin(t + p) * 0.5; steam.pos[i * 3 + 1] = y; steam.pos[i * 3 + 2] = z; }); steam.done(); steam.m.opacity = 0.25;
      lights.forEach((l, i) => { l.intensity = (i ? 10 : 16) + Math.sin(t * 9 + i) * 2; });
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.x = t * 2; if (g.userData.spinX) (g.userData.spinX as THREE.Object3D).rotation.x = t * 5; if (g.userData.stamp) (g.userData.stamp as THREE.Object3D).position.y = 0.55 + Math.abs(Math.sin(t * 3 + i)) * 0.5; if (g.userData.swing) (g.userData.swing as THREE.Object3D).rotation.y = Math.sin(t + i); if (g.userData.orb) (g.userData.orb as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 4 + i) * 0.2); if (g.userData.puff) { const p = g.userData.puff as THREE.Object3D; p.position.y = 1.6 + ((t * 0.8 + i) % 1) * 0.8; } });
    },
  };
}

// ======================================================================================================================
// 🍱 Grand Food Hall — a warm night market: tiles, red lanterns, stalls all round, a sushi belt
// ======================================================================================================================
export function foodhall(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#E8DCC8'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#D9CBB4' : '#EFE5D4'; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } }, 10);
  const wood = ctx.std('#7A4E2D'), redLac = ctx.std('#B22222', { roughness: 0.4 });
  // stalls round the hall, each with its own awning colour
  around(ctx, 16, 17, 18, (x, z, a, i) => { const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = Math.atan2(-x, -z); ctx.root.add(s); box(ctx, s, 2.6, 1, 1, wood, 0, 0.5, 0); const c = ['#B22222', '#2E6BDB', '#F2C14E', '#3DDC97', '#FF7AC8'][i % 5]; for (let k = 0; k < 6; k++) { const p = box(ctx, s, 0.45, 0.06, 1.4, k % 2 ? c : '#FFFFFF', -1.12 + k * 0.45, 2.4, -0.1); p.rotation.x = 0.3; } for (const q of [-1, 1]) cyl(ctx, s, 0.06, 0.06, 2.4, wood, q * 1.25, 1.2, -0.5); ball(ctx, s, 0.18, ['#F28C28', '#FFE14D', '#E03A3A'][i % 3], 0, 1.15, 0.1); });
  // strings of red lanterns overhead
  const lanterns: THREE.Object3D[] = [];
  const lantMat = ctx.std('#FF3B2F', { emissive: '#FF3B2F', emissiveIntensity: 1.3 });
  for (let row = 0; row < 2; row++) for (let k = 0; k < 9; k++) { const l = keep(new THREE.Group()); l.position.set(-14 + k * 3.5, 9, -10 + row * 6); ctx.dyn.add(l); const b = ball(ctx, l, 0.4, lantMat, 0, -0.5, 0); b.scale.y = 1.25; cyl(ctx, l, 0.25, 0.25, 0.1, '#222', 0, 0, 0); lanterns.push(l); }
  const S = spots({ play: '🍣 Sushi Train', collect: '🍚 Rice sacks', build: '📜 Menu board', make: '🔥 Head chef’s wok', market: '🧺 Food market', book: '📖 Recipe scrolls' });
  // play: a counter with a sushi belt going round and plates riding it
  const beltPath = (u: number): [number, number] => { const a = u * Math.PI * 2; return [S.play.x + Math.cos(a) * 1.9, S.play.z - 0.8 + Math.sin(a) * 1]; };
  const beltTrack = mesh(ctx, new THREE.TorusGeometry(1.45, 0.18, 6, 48), ctx.std('#C0C4CC', { metalness: 0.6 }), S.play.x, 0.9, S.play.z - 0.8); beltTrack.rotation.x = Math.PI / 2; beltTrack.scale.set(1.3, 0.7, 1);
  box(ctx, ctx.root, 3.2, 0.8, 1.6, wood, S.play.x, 0.4, S.play.z - 0.8);
  const plates: THREE.Object3D[] = [];
  for (let k = 0; k < 8; k++) { const p = keep(new THREE.Group()); ctx.dyn.add(p); cyl(ctx, p, 0.22, 0.18, 0.05, ['#FFFFFF', '#E03A3A', '#2E6BDB', '#F2C14E'][k % 4], 0, 0, 0); ball(ctx, p, 0.11, ['#FF8A6A', '#FFFFFF', '#3DDC97', '#F28C28'][k % 4], 0, 0.08, 0).scale.y = 0.6; plates.push(p); }
  // rice sacks, menu board, wok station, market baskets, recipe shelf
  for (let k = 0; k < 4; k++) { const sk = ball(ctx, ctx.root, 0.45, '#E8D9A8', S.collect.x - 0.6 + (k % 2) * 1.1, 0.45 + Math.floor(k / 2) * 0.6, S.collect.z + (k % 2) * 0.2); sk.scale.y = 1.2; }
  box(ctx, ctx.root, 0.1, 1.8, 0.1, wood, S.build.x, 0.9, S.build.z); box(ctx, ctx.root, 1.4, 1.2, 0.06, '#222', S.build.x, 1.6, S.build.z); for (let k = 0; k < 4; k++) box(ctx, ctx.root, 1, 0.04, 0.07, '#FFE14D', S.build.x, 1.25 + k * 0.22, S.build.z);
  box(ctx, ctx.root, 1.8, 0.9, 1, '#5A5A66', S.make.x, 0.45, S.make.z); const wok = mesh(ctx, new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ctx.std('#2A2A2A', { metalness: 0.7 }), S.make.x, 1.4, S.make.z, ctx.dyn);
  const flame = glow(ctx, ctx.dyn, S.make.x, 1.0, S.make.z, '#FF8A3D', 0.35, 2.4); person(ctx, ctx.root, S.make.x + 0.9, S.make.z - 0.4, '#FFFFFF', '#FFFFFF');
  box(ctx, ctx.root, 2.2, 0.8, 0.9, wood, S.market.x, 0.4, S.market.z); ['#E03A3A', '#3DDC97', '#F2C14E', '#B57BFF'].forEach((c, k) => { cyl(ctx, ctx.root, 0.24, 0.18, 0.2, '#C9A06A', S.market.x - 0.75 + k * 0.5, 0.9, S.market.z); cone(ctx, ctx.root, 0.2, 0.25, c, S.market.x - 0.75 + k * 0.5, 1.1, S.market.z, 8); });
  box(ctx, ctx.root, 2, 1.6, 0.5, wood, S.book.x, 0.8, S.book.z); for (let k = 0; k < 6; k++) { const sc = cyl(ctx, ctx.root, 0.08, 0.08, 0.5, '#E8D9A8', S.book.x - 0.6 + (k % 3) * 0.6, k < 3 ? 1.3 : 0.7, S.book.z + 0.15); sc.rotation.z = Math.PI / 2; }
  const steamPuffs: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) { box(ctx, o, 2, 0.9, 1, wood, 0, 0.45, 0); cyl(ctx, o, 0.45, 0.4, 0.5, '#5A5A66', -0.4, 1.15, 0); const st = keep(glow(ctx, o, -0.4, 1.7, 0, '#FFFFFF', 0.3, 0.2)); steamPuffs.push(st); box(ctx, o, 2.4, 1.6, 0.05, redLac, 0, 2.6, -0.5); }
    if (i === 1) { box(ctx, o, 5, 0.9, 1, wood, 0, 0.45, 0); for (let k = 0; k < 5; k++) { box(ctx, o, 0.4, 0.5, 0.4, '#3A2A1E', -2 + k, 0.25, 1); cyl(ctx, o, 0.18, 0.15, 0.04, '#FFFFFF', -2 + k, 0.92, 0); } }
    if (i === 2) for (let k = 0; k < 6; k++) { const c = ['#E03A3A', '#F28C28', '#F2C14E', '#8B5A2B', '#3DDC97', '#B57BFF'][k]; cyl(ctx, o, 0.45, 0.4, 0.3, '#C9A06A', -2.5 + k, 0.15, 0); cone(ctx, o, 0.42, 0.55, c, -2.5 + k, 0.55, 0, 10); }
    if (i === 3) { box(ctx, o, 3, 0.8, 1.2, '#3A3A42', 0, 0.4, 0); box(ctx, o, 2.8, 0.04, 1, ctx.std('#FF4D00', { emissive: '#FF4D00', emissiveIntensity: 1.4 }), 0, 0.82, 0); for (let k = 0; k < 5; k++) box(ctx, o, 0.6, 0.08, 0.2, '#8B3A2A', -1 + k * 0.5, 0.9, (k % 2) * 0.3 - 0.15); }
    if (i === 4) for (let k = 0; k < 4; k++) { const x = -2.4 + k * 1.6; cyl(ctx, o, 0.1, 0.14, 1.4, '#5A3A26', x, 0.7, 0); ball(ctx, o, 0.8, '#FFB7D5', x, 1.8, 0); ball(ctx, o, 0.6, '#FFC8DD', x + 0.4, 2.1, 0.2); }
    if (i === 5) { box(ctx, o, 6, 0.75, 1.4, redLac, 0, 0.38, 0); for (let k = 0; k < 6; k++) { cyl(ctx, o, 0.2, 0.18, 0.04, '#FFFFFF', -2.5 + k, 0.78, 0); ball(ctx, o, 0.14, ['#F28C28', '#E03A3A', '#3DDC97'][k % 3], -2.5 + k, 0.86, 0).scale.y = 0.6; } for (const s of [-1, 1]) for (let k = 0; k < 5; k++) box(ctx, o, 0.5, 0.5, 0.5, '#5A3A26', -2.4 + k * 1.2, 0.25, s * 1.1); }
    // locked: noren curtains hanging across the way
    box(ctx, l, 6.4, 0.12, 0.12, wood, 0, 2.6, 0.8);
    for (let k = 0; k < 5; k++) box(ctx, l, 1.2, 1.6, 0.04, k % 2 ? '#1E2A5A' : '#B22222', -2.56 + k * 1.28, 1.8, 0.8);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['paddy', 'fishmonger', 'noodlebar', 'spicerack', 'grill', 'crocus'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'paddy') { disc(ctx, g, 0.6, ctx.std('#5AA0C8', { roughness: 0.1 }), 0, 0.03, 0); for (let j = 0; j < 9; j++) cyl(ctx, g, 0.02, 0.02, 0.5, '#7AC04A', (j % 3 - 1) * 0.3, 0.25, (Math.floor(j / 3) - 1) * 0.3); }
    else if (id === 'fishmonger') { box(ctx, g, 1, 0.5, 0.6, '#BDE0FE', 0, 0.25, 0); for (let j = 0; j < 3; j++) { const f = ball(ctx, g, 0.15, '#8AA0B8', -0.3 + j * 0.3, 0.55, 0); f.scale.set(1.8, 0.6, 0.7); } }
    else if (id === 'noodlebar') { cyl(ctx, g, 0.4, 0.35, 0.5, '#5A5A66', 0, 0.25, 0); g.userData.puff = glow(ctx, g, 0, 0.8, 0, '#FFFFFF', 0.2, 0.2); }
    else if (id === 'spicerack') { for (let j = 0; j < 3; j++) { cyl(ctx, g, 0.25, 0.2, 0.2, '#C9A06A', -0.5 + j * 0.5, 0.1, 0); cone(ctx, g, 0.22, 0.3, ['#E03A3A', '#F2C14E', '#F28C28'][j], -0.5 + j * 0.5, 0.35, 0, 8); } }
    else if (id === 'grill') { box(ctx, g, 0.9, 0.6, 0.5, '#3A3A42', 0, 0.3, 0); g.userData.orb = glow(ctx, g, 0, 0.65, 0, '#FF4D00', 0.2, 1.8); }
    else { for (let j = 0; j < 5; j++) { cyl(ctx, g, 0.02, 0.02, 0.4, '#3E7D3A', (j - 2) * 0.2, 0.2, 0); ball(ctx, g, 0.09, '#B57BFF', (j - 2) * 0.2, 0.44, 0); } }
    return shadows(g);
  };
  const lights: THREE.PointLight[] = []; lamp(ctx, lights, '#FF8A5A', 12, 14, -6, 5, -2); lamp(ctx, lights, '#FF8A5A', 12, 14, 6, 5, -2); lamp(ctx, lights, '#FFB070', 10, 12, 0, 4, 5);
  return {
    sky: '#1A0E10', fog: ['#2A1414', 26, 70], light: ['#FFD8B8', '#5A3A2A', 1.9, '#FFC890', 1.5], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      plates.forEach((p, k) => { const [x, z] = beltPath(k / plates.length + t * 0.06); p.position.set(x, 1.02, z); });
      lanterns.forEach((l, k) => { l.rotation.z = Math.sin(t * 1.2 + k) * 0.08; }); lantMat.emissiveIntensity = 1.1 + Math.sin(t * 2) * 0.2;
      flame.scale.setScalar(1 + Math.sin(t * 15) * 0.3); wok.rotation.z = Math.sin(t * 3) * 0.15; wok.position.y = 1.4 + Math.abs(Math.sin(t * 3)) * 0.1;
      steamPuffs.forEach((s, k) => { s.position.y = 1.7 + ((t * 0.5 + k) % 1) * 0.8; s.scale.setScalar(1 + ((t * 0.5 + k) % 1)); });
      lights.forEach((l, i) => { l.intensity = 11 + Math.sin(t * 3 + i) * 1; });
      ups.forEach((g, i) => { if (g.userData.puff) { const p = g.userData.puff as THREE.Object3D; p.position.y = 0.7 + ((t * 0.6 + i) % 1) * 0.6; } if (g.userData.orb) (g.userData.orb as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 9 + i) * 0.2); });
    },
  };
}

// ======================================================================================================================
// 🐉 Dragonspire Citadel — black stone walls, purple fire, a dragon coiled on the spire
// ======================================================================================================================
export function citadel(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#2A2630'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) { g.fillStyle = ['#34303C', '#2E2A36', '#3A3542'][(x + y * 3) % 3]; g.fillRect(x * 44 + (y % 2) * 22 - 4, y * 32 + 2, 40, 28); } }, 10);
  const stone = ctx.std('#3A3542', { roughness: 1, flatShading: true }), dark = ctx.std('#1E1A24', { roughness: 1 });
  // the curtain wall with towers and battlements all round
  for (let a = 0; a < 48; a++) { const ang = (a / 48) * Math.PI * 2, x = Math.cos(ang) * 19, z = Math.sin(ang) * 16; const w = box(ctx, ctx.root, 2.8, 5, 1.2, stone, x, 2.5, z); w.rotation.y = -ang + Math.PI / 2; if (a % 2) { const m = box(ctx, ctx.root, 0.8, 0.8, 1.2, stone, x * 1.0, 5.4, z * 1.0); m.rotation.y = -ang + Math.PI / 2; } }
  for (let k = 0; k < 8; k++) { const ang = (k / 8) * Math.PI * 2; cyl(ctx, ctx.root, 1.6, 1.8, 8, stone, Math.cos(ang) * 19.5, 4, Math.sin(ang) * 16.5, 10); cone(ctx, ctx.root, 2, 3, '#2A1440', Math.cos(ang) * 19.5, 9.5, Math.sin(ang) * 16.5, 10); }
  // the great spire at the back, with a dragon curled round its top
  cyl(ctx, ctx.root, 2.2, 3.4, 16, stone, 0, 8, -22, 10); cone(ctx, ctx.root, 2.6, 5, '#2A1440', 0, 18.5, -22, 10);
  const dragon = keep(new THREE.Group()); dragon.position.set(0, 15.2, -22); ctx.dyn.add(dragon);
  const scale = ctx.std('#5A1E7A', { roughness: 0.5, metalness: 0.3 });
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 1.7; ball(ctx, dragon, 0.75 - k * 0.03, scale, Math.cos(a) * 2.8, Math.sin(k * 0.5) * 0.4 - k * 0.12, Math.sin(a) * 2.8); }
  const head = ball(ctx, dragon, 0.9, scale, 2.8, 0.4, 0); head.scale.set(1.4, 0.9, 0.9); glow(ctx, dragon, 3.6, 0.6, 0.35, '#FFE14D', 0.12, 3); glow(ctx, dragon, 3.6, 0.6, -0.35, '#FFE14D', 0.12, 3);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) { const w = keep(new THREE.Group()); w.position.set(1.4, 0.8, s * 0.6); dragon.add(w); const m = mesh(ctx, new THREE.ConeGeometry(2.2, 3.6, 3), ctx.std('#7A2A9A', { side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), 0, 0, s * 1.6, w); m.rotation.x = s * Math.PI / 2; m.scale.z = 0.08; wings.push(w); }
  const S = spots({ play: '🐲 Boss Rush', collect: '💰 Treasure hoard', build: '🗺️ War table', make: '⚒️ War forge', market: '🕯️ Black market', book: '📖 Hoard ledger' });
  const torches: THREE.Object3D[] = [], lights: THREE.PointLight[] = [];
  for (const [x, z] of [[-4, -4], [4, -4], [-9, 0.5], [9, 0.5], [-3.5, 5.5], [3.5, 5.5]]) { cyl(ctx, ctx.root, 0.08, 0.1, 2.2, '#4A3020', x, 1.1, z); const f = keep(glow(ctx, ctx.dyn, x, 2.35, z, '#B57BFF', 0.22, 2.4)); torches.push(f); lamp(ctx, lights, '#B57BFF', 10, 11, x, 2.6, z); }
  // play: an arena ring with a boss statue
  disc(ctx, ctx.root, 2, '#1E1A24', S.play.x, 0.03, S.play.z - 0.8); mesh(ctx, new THREE.TorusGeometry(2, 0.12, 6, 40), ctx.std('#B23CFF', { emissive: '#B23CFF', emissiveIntensity: 1.2 }), S.play.x, 0.05, S.play.z - 0.8).rotation.x = Math.PI / 2;
  cyl(ctx, ctx.root, 0.6, 0.7, 0.6, stone, S.play.x, 0.3, S.play.z - 1.4); const bust = ball(ctx, ctx.root, 0.55, dark, S.play.x, 1.3, S.play.z - 1.4); bust.scale.y = 1.2; for (const s of [-1, 1]) cone(ctx, ctx.root, 0.12, 0.6, '#E8E2D4', S.play.x + s * 0.4, 1.9, S.play.z - 1.4, 6).rotation.z = -s * 0.5;
  // gold hoard, war table, anvil & forge, black-market tent, ledger
  const coins: Inst[] = []; for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2, d = r() * 0.9; coins.push({ x: S.collect.x + Math.cos(a) * d, y: 0.05 + (0.9 - d) * 0.5 * r(), z: S.collect.z + Math.sin(a) * d, s: 0.12, rx: r() * 3, ry: r() * 3 }); }
  scatter(ctx, new THREE.CylinderGeometry(1, 1, 0.25, 10), ctx.std('#FFD23F', { metalness: 0.9, roughness: 0.25 }), coins);
  box(ctx, ctx.root, 1.2, 0.7, 0.8, '#5A3A26', S.collect.x + 0.8, 0.35, S.collect.z - 0.6); box(ctx, ctx.root, 1.25, 0.15, 0.85, '#D9B24A', S.collect.x + 0.8, 0.78, S.collect.z - 0.6);
  box(ctx, ctx.root, 2, 0.12, 1.3, '#5A3A26', S.build.x, 0.85, S.build.z); for (const s of [-1, 1]) for (const t2 of [-1, 1]) box(ctx, ctx.root, 0.1, 0.85, 0.1, '#3A2416', S.build.x + s * 0.85, 0.42, S.build.z + t2 * 0.5); box(ctx, ctx.root, 1.6, 0.02, 1, '#E8D9A8', S.build.x, 0.92, S.build.z);
  box(ctx, ctx.root, 1, 0.5, 0.45, dark, S.make.x, 0.8, S.make.z); box(ctx, ctx.root, 0.5, 0.6, 0.35, dark, S.make.x, 0.3, S.make.z); const coals = glow(ctx, ctx.dyn, S.make.x - 1, 0.5, S.make.z, '#FF4D00', 0.4, 2); box(ctx, ctx.root, 0.9, 0.4, 0.9, stone, S.make.x - 1, 0.2, S.make.z);
  cone(ctx, ctx.root, 1.6, 2.2, '#2A1440', S.market.x, 1.1, S.market.z, 6); glow(ctx, ctx.root, S.market.x, 0.6, S.market.z + 1, '#FFB84D', 0.12, 2);
  cyl(ctx, ctx.root, 0.35, 0.45, 1, stone, S.book.x, 0.5, S.book.z); box(ctx, ctx.root, 0.9, 0.12, 0.6, '#5A1E2A', S.book.x, 1.06, S.book.z);
  const portals: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) { for (const s of [-1, 1]) { cyl(ctx, o, 0.9, 1, 4, stone, s * 2.2, 2, 0, 8); cone(ctx, o, 1.1, 1.6, '#2A1440', s * 2.2, 4.8, 0, 8); } box(ctx, o, 3.4, 1, 1, stone, 0, 3.6, 0); for (let k = 0; k < 6; k++) box(ctx, o, 0.08, 2.8, 0.08, '#555', -1.4 + k * 0.56, 1.6, 0.2); }
    if (i === 1) { const sk: Inst[] = []; for (let k = 0; k < 30; k++) sk.push({ x: -2.5 + (k % 10) * 0.55, y: 0.2 + Math.floor(k / 10) * 0.38, z: -0.6, s: 0.2 }); for (const it of sk) { ball(ctx, o, 0.2, '#E8E2D4', it.x, it.y, it.z); } box(ctx, o, 6, 1.6, 0.4, dark, 0, 0.8, -0.95); }
    if (i === 2) for (let k = 0; k < 3; k++) { box(ctx, o, 1.6, 2.6, 0.5, '#4A2A1E', -2 + k * 2, 1.3, -0.3); for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) box(ctx, o, 0.18, 0.45, 0.4, ['#8B1E3F', '#2E6BDB', '#3DDC97', '#F2C14E', '#B57BFF'][(x + y + k) % 5], -2.6 + k * 2 + x * 0.22, 0.4 + y * 0.6, -0.1); }
    if (i === 3) { box(ctx, o, 1.6, 0.6, 1.4, dark, 0, 0.3, 0); box(ctx, o, 1.4, 2.6, 0.3, dark, 0, 1.6, -0.6); for (let k = 0; k < 5; k++) cone(ctx, o, 0.12, 0.6, '#5A5462', -0.6 + k * 0.3, 3.1, -0.6, 4); glow(ctx, o, 0, 2.2, -0.4, '#FF4D00', 0.18, 2); }
    if (i === 4) { const nest = mesh(ctx, new THREE.TorusGeometry(1.6, 0.5, 8, 20), ctx.std('#4A3020'), 0, 0.3, 0, o); nest.rotation.x = Math.PI / 2; const egg = ball(ctx, o, 0.7, ctx.std('#7A2A9A', { emissive: '#B23CFF', emissiveIntensity: 0.4 }), 0, 0.8, 0); egg.scale.y = 1.3; for (let k = 0; k < 10; k++) cyl(ctx, o, 0.12, 0.12, 0.05, ctx.std('#FFD23F', { metalness: 0.9 }), Math.cos(k) * 1.2, 0.6, Math.sin(k) * 1.2); }
    if (i === 5) { const p = keep(new THREE.Group()); p.position.set(0, 2, -0.4); o.add(p); for (let k = 0; k < 3; k++) mesh(ctx, new THREE.TorusGeometry(1.4 - k * 0.3, 0.12, 8, 40), ctx.std(['#B23CFF', '#5A1E7A', '#FF3D9A'][k], { emissive: ['#B23CFF', '#5A1E7A', '#FF3D9A'][k], emissiveIntensity: 1.8 }), 0, 0, k * 0.05, p); disc(ctx, p, 1.1, ctx.std('#0A0012', { emissive: '#2A0040', emissiveIntensity: 1 }), 0, 0, 0).rotation.x = 0; portals.push(p); for (const s of [-1, 1]) cyl(ctx, o, 0.4, 0.5, 3.6, stone, s * 1.9, 1.8, -0.4, 8); }
    // locked: an iron portcullis across the arch
    for (const s of [-1, 1]) cyl(ctx, l, 0.6, 0.7, 3.4, stone, s * 3, 1.7, 0.6, 8);
    box(ctx, l, 6.4, 0.5, 0.5, stone, 0, 3.3, 0.6);
    for (let k = 0; k < 9; k++) box(ctx, l, 0.09, 3, 0.09, '#3A3A3A', -2.4 + k * 0.6, 1.5, 0.6); for (let k = 0; k < 4; k++) box(ctx, l, 5.4, 0.09, 0.1, '#3A3A3A', 0, 0.5 + k * 0.75, 0.6);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['crypt', 'shaft', 'scribes', 'aerie', 'roost', 'voidgate'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'crypt') { box(ctx, g, 1, 0.5, 0.5, dark, 0, 0.25, 0); const lid = box(ctx, g, 1.05, 0.1, 0.55, stone, 0, 0.55, 0); g.userData.lid = lid; }
    else if (id === 'shaft') { disc(ctx, g, 0.5, '#05040A', 0, 0.03, 0); for (const s of [-1, 1]) box(ctx, g, 0.1, 1.2, 0.1, '#4A3020', s * 0.5, 0.6, 0); box(ctx, g, 1.1, 0.1, 0.1, '#4A3020', 0, 1.2, 0); }
    else if (id === 'scribes') { box(ctx, g, 0.8, 0.6, 0.5, '#4A2A1E', 0, 0.3, 0); person(ctx, g, 0, 0.5, '#2A1440', '#2A1440'); g.userData.orb = glow(ctx, g, 0.3, 0.7, 0, '#B57BFF', 0.06, 2.4); }
    else if (id === 'aerie') { const n = mesh(ctx, new THREE.TorusGeometry(0.4, 0.15, 6, 14), ctx.std('#4A3020'), 0, 0.6, 0, g); n.rotation.x = Math.PI / 2; cyl(ctx, g, 0.08, 0.1, 0.6, '#4A3020', 0, 0.3, 0); g.userData.orb = glow(ctx, g, 0, 0.8, 0, '#FF8A3D', 0.22, 2.2); }
    else if (id === 'roost') { const e = ball(ctx, g, 0.35, ctx.std('#5A1E7A', { emissive: '#B23CFF', emissiveIntensity: 0.3 }), 0, 0.4, 0); e.scale.y = 1.3; g.userData.pulse = 1; }
    else { const c = mesh(ctx, new THREE.OctahedronGeometry(0.35, 0), ctx.std('#2A0040', { emissive: '#B23CFF', emissiveIntensity: 1.4 }), 0, 1, 0, g); g.userData.spin = c; cyl(ctx, g, 0.3, 0.35, 0.4, stone, 0, 0.2, 0, 6); }
    return shadows(g);
  };
  const embers = motes(ctx, 120, '#C78AFF', 0.1); const es = Array.from({ length: 120 }, () => [(r() - 0.5) * 34, (r() - 0.5) * 28, r() * 8]);
  return {
    sky: '#0C0814', fog: ['#120A1E', 26, 70], light: ['#B8A0E0', '#2A2630', 1.6, '#D8C0FF', 1.1], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      dragon.rotation.y = Math.sin(t * 0.2) * 0.3; dragon.position.y = 15.2 + Math.sin(t * 0.6) * 0.2; wings.forEach((w, k) => { w.rotation.x = (k ? 1 : -1) * (0.2 + Math.sin(t * 1.6) * 0.35); });
      torches.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 13 + i) * 0.15, 1 + Math.sin(t * 17 + i * 2) * 0.25, 1); }); lights.forEach((l, i) => { l.intensity = 9.5 + Math.sin(t * 11 + i * 3) * 1.3; });
      coals.scale.setScalar(1 + Math.sin(t * 5) * 0.15); portals.forEach((p) => { p.rotation.z = t * 1.2; p.children.forEach((c, k) => { c.rotation.z = t * (k % 2 ? -1 : 1) * 0.8; }); });
      es.forEach(([x, z, p], i) => { embers.pos[i * 3] = x + Math.sin(t * 0.7 + p) * 0.6; embers.pos[i * 3 + 1] = (t * 0.4 + p) % 8; embers.pos[i * 3 + 2] = z; }); embers.done();
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 2; if (g.userData.orb) (g.userData.orb as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 6 + i) * 0.25); if (g.userData.pulse) g.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.05); if (g.userData.lid) (g.userData.lid as THREE.Object3D).rotation.z = Math.max(0, Math.sin(t * 0.8 + i)) * 0.25; });
    },
  };
}

// ======================================================================================================================
// 🏟️ Champions' Colosseum — a sunlit sand arena ringed by tiers of arches, banners and floating cards
// ======================================================================================================================
export function colosseum(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#E2C38A'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 1600; i++) { g.fillStyle = ['#D9B87A', '#EBCF98', '#CFAE70'][i % 3]; g.fillRect(r() * 256, r() * 256, 2, 2); } }, 10);
  const sandstone = ctx.std('#D9B98A', { roughness: 0.9 }), shade = ctx.std('#8A6A4A', { roughness: 1 });
  // three tiers of arches all round
  for (let tier = 0; tier < 3; tier++) {
    const R = 19 + tier * 1.6, n = 40;
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * Math.PI * 2, x = Math.cos(ang) * R, z = Math.sin(ang) * R * 0.85, y = 1.6 + tier * 3.2;
      const p = box(ctx, ctx.root, 0.7, 3.2, 1.2, sandstone, x, y, z); p.rotation.y = -ang;
      const a2 = mesh(ctx, new THREE.TorusGeometry(1.05, 0.25, 6, 12, Math.PI), sandstone, Math.cos(ang + Math.PI / n) * R, y + 0.9, Math.sin(ang + Math.PI / n) * R * 0.85); a2.rotation.y = -ang - Math.PI / n + Math.PI / 2;
      box(ctx, ctx.root, 1.8, 2, 0.2, shade, Math.cos(ang + Math.PI / n) * (R + 0.4), y - 0.3, Math.sin(ang + Math.PI / n) * (R + 0.4) * 0.85).rotation.y = -ang - Math.PI / n + Math.PI / 2;
    }
  }
  // the crowd: lots of little coloured heads in the stands
  const crowd: Inst[] = []; for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, tier = Math.floor(r() * 3), R = 20 + tier * 1.6 + 0.6; crowd.push({ x: Math.cos(a) * R, y: 2.6 + tier * 3.2, z: Math.sin(a) * R * 0.85, s: 0.22, c: ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97', '#B57BFF', '#F28C28'][Math.floor(r() * 6)] }); }
  const crowdMesh = scatter(ctx, new THREE.SphereGeometry(1, 8, 6), ctx.std('#ffffff'), crowd);
  // tall banners round the arena floor
  const banners: THREE.Object3D[] = [];
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, x = Math.cos(a) * 16.5, z = Math.sin(a) * 14; cyl(ctx, ctx.root, 0.06, 0.06, 5, '#D9B24A', x, 2.5, z); const b = keep(new THREE.Group()); b.position.set(x, 4.2, z); b.rotation.y = -a; ctx.dyn.add(b); box(ctx, b, 0.04, 1.8, 0.9, ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97'][k % 4], 0, 0, 0.47); banners.push(b); }
  const S = spots({ play: '🃏 Card Clash', collect: '🏆 Trophy chest', build: '📜 Fight card', make: '🖨️ Card studio', market: '💱 Card trader', book: '🖼️ Champion cards' });
  // play: a card table with giant cards floating above it
  box(ctx, ctx.root, 2.6, 0.8, 1.6, '#1E5A3A', S.play.x, 0.4, S.play.z - 0.8); box(ctx, ctx.root, 2.8, 0.1, 1.8, '#D9B24A', S.play.x, 0.82, S.play.z - 0.8);
  const floaty: THREE.Object3D[] = [];
  for (let k = 0; k < 4; k++) { const c = keep(new THREE.Group()); c.position.set(S.play.x - 1.2 + k * 0.8, 2.2, S.play.z - 0.8); ctx.dyn.add(c); box(ctx, c, 0.6, 0.85, 0.04, k % 2 ? '#FFF6E8' : '#FF5A5F', 0, 0, 0); box(ctx, c, 0.5, 0.75, 0.05, k % 2 ? '#FF5A5F' : '#FFE14D', 0, 0, 0); floaty.push(c); }
  // trophy chest, fight card, card press, trader stall, gallery of champion cards
  box(ctx, ctx.root, 1.4, 0.8, 0.9, '#5A3A26', S.collect.x, 0.4, S.collect.z); cone(ctx, ctx.root, 0.25, 0.6, ctx.std('#D9B24A', { metalness: 0.9, roughness: 0.2 }), S.collect.x, 1.1, S.collect.z, 10); cyl(ctx, ctx.root, 0.15, 0.2, 0.2, '#D9B24A', S.collect.x, 0.88, S.collect.z);
  box(ctx, ctx.root, 0.1, 1.8, 0.1, '#5A3A26', S.build.x, 0.9, S.build.z); box(ctx, ctx.root, 1.2, 1.5, 0.05, '#E8D9A8', S.build.x, 1.6, S.build.z); box(ctx, ctx.root, 1, 0.3, 0.06, '#FF5A5F', S.build.x, 2.1, S.build.z);
  box(ctx, ctx.root, 1.6, 1, 1, '#4A4A52', S.make.x, 0.5, S.make.z); const press = box(ctx, ctx.dyn, 1.2, 0.2, 0.8, '#D9B24A', S.make.x, 1.3, S.make.z);
  box(ctx, ctx.root, 2.2, 0.85, 0.8, '#5A3A26', S.market.x, 0.43, S.market.z); person(ctx, ctx.root, S.market.x, S.market.z - 0.8, '#FF5A5F', '#FFE14D'); for (let k = 0; k < 5; k++) box(ctx, ctx.root, 0.3, 0.42, 0.02, ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97', '#B57BFF'][k], S.market.x - 0.8 + k * 0.4, 1.1, S.market.z - 0.2).rotation.x = -0.4;
  box(ctx, ctx.root, 2.6, 2, 0.3, sandstone, S.book.x, 1, S.book.z); for (let k = 0; k < 3; k++) { box(ctx, ctx.root, 0.6, 0.85, 0.05, '#D9B24A', S.book.x - 0.8 + k * 0.8, 1.3, S.book.z + 0.17); box(ctx, ctx.root, 0.5, 0.75, 0.06, ['#22B8FF', '#FF5A5F', '#3DDC97'][k], S.book.x - 0.8 + k * 0.8, 1.3, S.book.z + 0.18); }
  const holos: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 3; k++) { const x = -2 + k * 2; cyl(ctx, o, 0.08, 0.08, 1.6, '#6B4A33', x, 0.8, 0); ball(ctx, o, 0.3, '#C9A06A', x, 1.8, 0); box(ctx, o, 0.9, 0.08, 0.08, '#6B4A33', x, 1.3, 0); }
    if (i === 1) for (let k = 0; k < 5; k++) { cyl(ctx, o, 0.05, 0.05, 3.6, '#D9B24A', -2.4 + k * 1.2, 1.8, 0); box(ctx, o, 0.04, 1.6, 0.8, ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97', '#B57BFF'][k], -2.4 + k * 1.2, 2.6, 0.42); }
    if (i === 2) for (let k = 0; k < 3; k++) { box(ctx, o, 1.2, 1, 0.8, '#5A3A26', -2 + k * 2, 0.5, 0); box(ctx, o, 1.1, 0.8, 0.7, ctx.std('#BFE3FF', { transparent: true, opacity: 0.3 }), -2 + k * 2, 1.4, 0); box(ctx, o, 0.35, 0.5, 0.03, ['#FFE14D', '#B57BFF', '#22B8FF'][k], -2 + k * 2, 1.4, 0); }
    if (i === 3) { disc(ctx, o, 2.4, '#1E1A2E', 0, 0.03, 0); const h = keep(new THREE.Group()); h.position.y = 0.6; o.add(h); for (let k = 0; k < 2; k++) mesh(ctx, new THREE.TorusGeometry(2.2 - k * 0.5, 0.06, 6, 50), ctx.std(k ? '#22E3FF' : '#FF4FD8', { emissive: k ? '#22E3FF' : '#FF4FD8', emissiveIntensity: 2 }), 0, k * 0.3, 0, h).rotation.x = Math.PI / 2; holos.push(h); }
    if (i === 4) for (let k = 0; k < 3; k++) { const x = -2 + k * 2; box(ctx, o, 0.9, 0.6, 0.9, sandstone, x, 0.3, 0); ball(ctx, o, 0.3, ctx.std('#D9B24A', { metalness: 0.8, roughness: 0.3 }), x, 1.9, 0); cyl(ctx, o, 0.25, 0.32, 1, ctx.std('#D9B24A', { metalness: 0.8, roughness: 0.3 }), x, 1.1, 0); }
    if (i === 5) { mesh(ctx, new THREE.TorusGeometry(2.2, 0.3, 8, 30, Math.PI), sandstone, 0, 0, -0.3, o); const laurel = mesh(ctx, new THREE.TorusGeometry(1, 0.12, 6, 30, Math.PI * 1.6), ctx.std('#3DDC97', { emissive: '#1E8A4A', emissiveIntensity: 0.5 }), 0, 2.4, -0.2, o); laurel.rotation.z = -Math.PI * 0.3; glow(ctx, o, 0, 2.3, -0.2, '#FFE14D', 0.3, 1.6); }
    // locked: velvet ropes and a "closed" stand
    for (let k = 0; k < 5; k++) { cyl(ctx, l, 0.08, 0.1, 1, '#D9B24A', -2.4 + k * 1.2, 0.5, 0.9); ball(ctx, l, 0.1, '#D9B24A', -2.4 + k * 1.2, 1.05, 0.9); }
    for (let k = 0; k < 4; k++) { const rope = mesh(ctx, new THREE.TorusGeometry(0.6, 0.05, 6, 16, Math.PI), ctx.std('#8B1E3F'), -1.8 + k * 1.2, 0.95, 0.9, l); rope.rotation.z = Math.PI; }
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['press', 'inkworks', 'foiler', 'prism', 'hall', 'atelier'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'press') { box(ctx, g, 0.8, 0.5, 0.6, '#4A4A52', 0, 0.25, 0); const p = box(ctx, g, 0.6, 0.15, 0.45, '#D9B24A', 0, 0.8, 0); g.userData.stamp = p; }
    else if (id === 'inkworks') { for (let j = 0; j < 3; j++) cyl(ctx, g, 0.14, 0.18, 0.4, ['#1E2A5A', '#8B1E3F', '#1E5A3A'][j], -0.35 + j * 0.35, 0.2, 0); }
    else if (id === 'foiler') { const c = cyl(ctx, g, 0.25, 0.25, 0.9, ctx.std('#C0C4CC', { metalness: 1, roughness: 0.1 }), 0, 0.5, 0); c.rotation.z = Math.PI / 2; g.userData.roll = c; }
    else if (id === 'prism') { const p = mesh(ctx, new THREE.TetrahedronGeometry(0.4, 0), ctx.std('#BDF0FF', { emissive: '#22E3FF', emissiveIntensity: 0.8, transparent: true, opacity: 0.8 }), 0, 0.8, 0, g); g.userData.spin = p; cyl(ctx, g, 0.2, 0.25, 0.4, sandstone, 0, 0.2, 0); }
    else if (id === 'hall') { box(ctx, g, 1, 0.2, 0.7, sandstone, 0, 0.1, 0); for (const s of [-1, 1]) cyl(ctx, g, 0.08, 0.1, 1, sandstone, s * 0.35, 0.6, 0); box(ctx, g, 1, 0.15, 0.7, sandstone, 0, 1.15, 0); }
    else { for (const s of [-1, 1]) box(ctx, g, 0.05, 1.1, 0.05, '#6B4A33', s * 0.25, 0.55, 0).rotation.z = -s * 0.1; box(ctx, g, 0.55, 0.7, 0.04, ctx.std('#FF4FD8', { emissive: '#FF4FD8', emissiveIntensity: 0.6 }), 0, 0.8, 0.04); }
    return shadows(g);
  };
  const confetti = motes(ctx, 140, '#FFFFFF', 0.12); const cs = Array.from({ length: 140 }, () => [(r() - 0.5) * 30, (r() - 0.5) * 24, r() * 10]);
  return {
    sky: '#7EC8F2', fog: ['#F2E2C0', 40, 100], light: ['#FFF6E0', '#D9B98A', 2.4, '#FFF0C8', 2.4], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      banners.forEach((b, k) => { b.rotation.y = -((k / 12) * Math.PI * 2) + Math.sin(t * 2 + k) * 0.25; });
      floaty.forEach((c, k) => { c.position.y = 2.2 + Math.sin(t * 1.5 + k) * 0.25; c.rotation.y = t * 0.8 + k; });
      holos.forEach((h) => { h.rotation.y = t; }); press.position.y = 1.15 + Math.abs(Math.sin(t * 2)) * 0.25;
      crowdMesh.position.y = Math.abs(Math.sin(t * 6)) * 0.05;
      cs.forEach(([x, z, p], i) => { confetti.pos[i * 3] = x + Math.sin(t + p) * 0.8; confetti.pos[i * 3 + 1] = 10 - ((t * 0.8 + p) % 10); confetti.pos[i * 3 + 2] = z; }); confetti.done(); confetti.m.color.setHSL((t * 0.2) % 1, 0.9, 0.6);
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 2; if (g.userData.roll) (g.userData.roll as THREE.Object3D).rotation.x = t * 4; if (g.userData.stamp) (g.userData.stamp as THREE.Object3D).position.y = 0.55 + Math.abs(Math.sin(t * 3 + i)) * 0.3; });
    },
  };
}
