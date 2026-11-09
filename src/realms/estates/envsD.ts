// Domain worlds, part 2: 🔭 Celestial Observatory · 🤖 Automaton Works · 🎂 Sky Banquet Palace · 👁️ Abyssal Throne ·
// ⚡ Hall of Titans.
import { motes } from '../../home/live3d/kit3d';
import type { RealmEnv } from '../realm3d';
import { BOUNDS, THREE, around, ball, box, cone, cyl, disc, floor, glow, keep, lamp, mesh, person, prodGroup, scatter, shadows, spots, zones, type Ctx, type Inst } from './envKit';
import { animate } from './envsC';

// ======================================================================================================================
// 🔭 Celestial Observatory — a brass-and-cobalt observatory on a peak above a sea of clouds
// ======================================================================================================================
export function observatory(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#1C2A5A'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#C9A64A'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(128, 128, 70, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); g.stroke(); } g.fillStyle = '#C9A64A'; g.font = 'bold 18px serif'; ['N', 'E', 'S', 'W'].forEach((c, k) => g.fillText(c, 122 + Math.cos(k * Math.PI / 2 - Math.PI / 2) * 92, 134 + Math.sin(k * Math.PI / 2 - Math.PI / 2) * 92)); }, 3, 70, 0.4);
  // a sea of clouds below the peak
  const clouds: Inst[] = []; around(ctx, 70, 24, 40, (x, z) => clouds.push({ x, y: -1 + r() * 1.5, z, s: 2.5 + r() * 3, sy: 0.6, c: ['#F4F0FF', '#E0DAF0', '#D0C8E8'][Math.floor(r() * 3)] }));
  scatter(ctx, new THREE.SphereGeometry(1, 10, 8), ctx.std('#ffffff', { roughness: 1 }), clouds);
  const brass = ctx.std('#C9A64A', { metalness: 0.85, roughness: 0.25 }), cobalt = ctx.std('#2A3A8A', { roughness: 0.4 });
  // a low balustrade
  around(ctx, 40, 19.5, 19.5, (x, z) => { cyl(ctx, ctx.root, 0.15, 0.2, 1.1, '#E8E4DC', x, 0.55, z); });
  const ring = mesh(ctx, new THREE.TorusGeometry(19.5, 0.12, 6, 80), brass, 0, 1.15, 0); ring.rotation.x = Math.PI / 2;
  // the great dome sits behind, with its slit open
  const dome = mesh(ctx, new THREE.SphereGeometry(7, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#E8E4DC', { metalness: 0.3, roughness: 0.4 }), 0, 4, -21); void dome; cyl(ctx, ctx.root, 7, 7, 4, '#D0C8BC', 0, 2, -21, 28);
  const big = cyl(ctx, ctx.root, 0.9, 1.4, 9, brass, 0, 9, -19); big.rotation.x = -0.7;
  const S = spots({ play: '☄️ Orbit Slingshot', collect: '🧺 Star sack', build: '🗺️ Star chart room', make: '📐 Lens bench', market: '🏦 Celestial bourse', book: '📖 Star atlas' });
  const lights: THREE.PointLight[] = [];
  // play: a grand orrery whose planets wheel round a brass sun
  const orr = new THREE.Group(); orr.position.set(S.play.x, 1.8, S.play.z - 0.8); ctx.dyn.add(orr);
  cyl(ctx, ctx.root, 0.6, 0.8, 1.2, cobalt, S.play.x, 0.6, S.play.z - 0.8);
  ball(ctx, orr, 0.45, ctx.std('#FFB020', { emissive: '#FFB020', emissiveIntensity: 1.6 }));
  const arms: THREE.Group[] = [];
  for (let k = 0; k < 5; k++) { const a = new THREE.Group(); orr.add(a); const d = 0.9 + k * 0.42; box(ctx, a, d, 0.03, 0.03, brass, d / 2, 0, 0); ball(ctx, a, 0.1 + (k % 3) * 0.05, ['#6C9BFF', '#FF8AD8', '#7CE0B0', '#C9A6FF', '#FF8A2A'][k], d, 0, 0); arms.push(a); }
  lamp(ctx, lights, '#FFC870', 12, 12, S.play.x, 2.4, S.play.z - 0.4);
  box(ctx, ctx.root, 0.9, 0.9, 0.9, '#5A3A6A', S.collect.x, 0.45, S.collect.z); glow(ctx, ctx.root, S.collect.x, 1.1, S.collect.z, '#FFFFFF', 0.15, 2);
  box(ctx, ctx.root, 2, 0.08, 1.2, '#E8D9A8', S.build.x, 1, S.build.z).rotation.x = -0.4; for (const s of [-1, 1]) cyl(ctx, ctx.root, 0.06, 0.06, 1, brass, S.build.x + s * 0.9, 0.5, S.build.z);
  box(ctx, ctx.root, 1.6, 0.9, 0.8, '#5A3A20', S.make.x, 0.45, S.make.z); for (let k = 0; k < 3; k++) { const ln = cyl(ctx, ctx.root, 0.18 + k * 0.05, 0.18 + k * 0.05, 0.04, ctx.std('#BFE3FF', { transparent: true, opacity: 0.6, metalness: 0.2 }), S.make.x - 0.5 + k * 0.5, 1.2, S.make.z); ln.rotation.x = Math.PI / 2; }
  for (let k = 0; k < 4; k++) cyl(ctx, ctx.root, 0.18, 0.22, 2.2, '#E8E4DC', S.market.x - 0.9 + k * 0.6, 1.1, S.market.z - 0.4); box(ctx, ctx.root, 2.4, 0.3, 0.8, '#E8E4DC', S.market.x, 2.3, S.market.z - 0.4);
  const globe = ball(ctx, ctx.dyn, 0.5, ctx.std('#2A3A8A', { emissive: '#1A2A6A', emissiveIntensity: 0.5 }), S.book.x, 1.4, S.book.z); cyl(ctx, ctx.root, 0.3, 0.4, 0.9, brass, S.book.x, 0.45, S.book.z); mesh(ctx, new THREE.TorusGeometry(0.6, 0.03, 6, 30), brass, S.book.x, 1.4, S.book.z).rotation.y = Math.PI / 2;
  const spinning: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) { const d2 = mesh(ctx, new THREE.SphereGeometry(2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#E8E4DC', { metalness: 0.3 }), 0, 1, 0, o); void d2; cyl(ctx, o, 2, 2, 1, '#D0C8BC', 0, 0.5, 0, 20); const t = cyl(ctx, o, 0.25, 0.35, 2.4, brass, 0, 2.6, 0.6); t.rotation.x = -0.8; }
    if (i === 1) for (let k = 0; k < 4; k++) { cyl(ctx, o, 0.05, 0.05, 1.4, brass, -2.2 + k * 1.5, 0.7, 0); const p = keep(new THREE.Group()); p.position.set(-2.2 + k * 1.5, 1.5, 0); o.add(p); ball(ctx, p, 0.3, ['#6C9BFF', '#FF8AD8', '#7CE0B0', '#C9A6FF'][k]); mesh(ctx, new THREE.TorusGeometry(0.5, 0.03, 6, 24), brass, 0, 0, 0, p).rotation.x = 1.2; spinning.push(p); }
    if (i === 2) for (let k = 0; k < 5; k++) { const c = ['#B36BFF', '#FF6FA8', '#4F6BFF', '#00E5FF', '#B36BFF'][k]; const m = ball(ctx, o, 0.8 + r() * 0.5, ctx.std(c, { transparent: true, opacity: 0.35, emissive: c, emissiveIntensity: 1.2, depthWrite: false }), -2.4 + k * 1.2, 1.6 + r(), (r() - 0.5)); m.castShadow = false; }
    if (i === 3) { box(ctx, o, 5, 0.3, 1.4, '#5A3A20', 0, 0.15, 0.6); const c = keep(new THREE.Group()); c.position.set(0, 3, -0.4); o.add(c); ball(ctx, c, 0.4, ctx.std('#9AE6FF', { emissive: '#9AE6FF', emissiveIntensity: 2 })); cone(ctx, c, 0.35, 2.4, ctx.std('#C3D0FF', { transparent: true, opacity: 0.4, emissive: '#C3D0FF', emissiveIntensity: 1 }), 1.2, 0, 0).rotation.z = Math.PI / 2; spinning.push(c); c.userData.float = 1; }
    if (i === 4) { cyl(ctx, o, 0.5, 0.8, 5, '#E8E4DC', 0, 2.5, -0.4); const b = keep(new THREE.Group()); b.position.set(0, 5.4, -0.4); o.add(b); glow(ctx, b, 0, 0, 0, '#FFFFFF', 0.4, 3); for (const s of [-1, 1]) { const beam = box(ctx, b, 0.12, 6, 0.12, ctx.std('#C3D0FF', { transparent: true, opacity: 0.5, emissive: '#C3D0FF', emissiveIntensity: 2 }), 0, s * 3, 0); beam.castShadow = false; } spinning.push(b); b.userData.pulsar = 1; }
    if (i === 5) { const win = mesh(ctx, new THREE.TorusGeometry(2.2, 0.25, 10, 40), brass, 0, 2.6, -0.4, o); void win; const v = mesh(ctx, new THREE.CircleGeometry(2, 40), ctx.std('#000008', { emissive: '#1A0A3A', emissiveIntensity: 0.6, side: THREE.DoubleSide }), 0, 2.6, -0.42, o); void v; for (let k = 0; k < 16; k++) glow(ctx, o, (r() - 0.5) * 3, 2.6 + (r() - 0.5) * 3, -0.35, '#FFFFFF', 0.04, 2.6); }
    // locked: a canvas cover tied over brass instruments
    for (let k = 0; k < 3; k++) cone(ctx, l, 1.1, 2.2, ctx.std('#6A6A7A', { roughness: 1 }), -2 + k * 2, 1.1, 0, 7); box(ctx, l, 6, 0.05, 0.05, brass, 0, 0.9, 1.2);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['mirror', 'sieve', 'collector', 'harpoon', 'coil', 'void'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'mirror') { cyl(ctx, g, 0.06, 0.06, 0.8, brass, 0, 0.4, 0); const m = cyl(ctx, g, 0.45, 0.45, 0.05, ctx.std('#E8F4FF', { metalness: 1, roughness: 0.05 }), 0, 1, 0); m.rotation.x = 1; g.userData.spin = m; g.userData.spinSpeed = 0.5; }
    else if (id === 'sieve') { cyl(ctx, g, 0.5, 0.3, 0.4, brass, 0, 0.6, 0); g.userData.bob = glow(ctx, g, 0, 0.3, 0, '#FFE6A8', 0.06, 2); g.userData.bobY = 0.3; }
    else if (id === 'collector') { const b = ball(ctx, g, 0.45, ctx.std('#B36BFF', { transparent: true, opacity: 0.5, emissive: '#B36BFF', emissiveIntensity: 1 }), 0, 0.8, 0); g.userData.orb = b; cyl(ctx, g, 0.2, 0.3, 0.4, brass, 0, 0.2, 0); }
    else if (id === 'harpoon') { box(ctx, g, 0.6, 0.4, 0.6, '#5A3A20', 0, 0.2, 0); const h = cyl(ctx, g, 0.05, 0.05, 1.4, brass, 0, 0.9, 0); h.rotation.z = -0.6; g.userData.sway = h; }
    else if (id === 'coil') { for (let j = 0; j < 5; j++) mesh(ctx, new THREE.TorusGeometry(0.3, 0.05, 6, 20), brass, 0, 0.2 + j * 0.2, 0, g).rotation.x = Math.PI / 2; g.userData.orb = glow(ctx, g, 0, 1.3, 0, '#C3D0FF', 0.12, 2.4); }
    else { mesh(ctx, new THREE.TorusGeometry(0.45, 0.08, 8, 24), brass, 0, 0.9, 0, g); g.userData.orb = mesh(ctx, new THREE.CircleGeometry(0.4, 24), ctx.std('#000008', { emissive: '#3A1A6A', emissiveIntensity: 1, side: THREE.DoubleSide }), 0, 0.9, 0, g); cyl(ctx, g, 0.05, 0.05, 0.5, brass, 0, 0.25, 0); }
    return shadows(g);
  };
  const stars = motes(ctx, 260, '#FFFFFF', 0.12);
  for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, e = 0.3 + r() * 1.2, d = 45; stars.pos[i * 3] = Math.cos(a) * Math.cos(e) * d; stars.pos[i * 3 + 1] = Math.sin(e) * d; stars.pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * d; } stars.done();
  return {
    sky: '#141A48', fog: ['#2A2A6A', 34, 90], light: ['#D8DCFF', '#5A4A8A', 2, '#FFE6C8', 1.6], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      arms.forEach((a, k) => { a.rotation.y = t * (1.2 / (k + 1)); }); orr.rotation.y = t * 0.1;
      globe.rotation.y = t * 0.5; stars.pts.rotation.y = t * 0.006;
      spinning.forEach((s) => { if (s.userData.pulsar) s.rotation.z = t * 2.5; else if (s.userData.float) s.position.y = 3 + Math.sin(t) * 0.25; else s.rotation.y = t; });
      animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 🤖 Automaton Works — a gold-and-black art deco factory floor, conveyor belts and walking robots
// ======================================================================================================================
export function automaton(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#16120C'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#F5B83D'; g.lineWidth = 2; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 64 + 32, y = j * 64 + 32; for (let k = 1; k <= 3; k++) { g.beginPath(); g.moveTo(x - k * 9, y); g.lineTo(x, y - k * 9); g.lineTo(x + k * 9, y); g.lineTo(x, y + k * 9); g.closePath(); g.stroke(); } } }, 8, 70, 0.4);
  const gold = ctx.std('#F5B83D', { metalness: 0.9, roughness: 0.25 }), black = ctx.std('#1A1612', { metalness: 0.5, roughness: 0.4 }), chrome = ctx.std('#D0D4DC', { metalness: 1, roughness: 0.15 });
  // tall deco pillars with fan tops
  around(ctx, 16, 20.5, 20.5, (x, z) => { box(ctx, ctx.root, 1.4, 11, 1.4, black, x, 5.5, z); for (let k = 0; k < 3; k++) box(ctx, ctx.root, 1.5, 0.15, 1.5, gold, x, 3 + k * 3, z); cone(ctx, ctx.root, 1.1, 1.2, gold, x, 11.6, z, 4).rotation.y = Math.PI / 4; });
  const S = spots({ play: '🔌 Circuit Connect', collect: '📦 Parts bin', build: '📐 Blueprint wall', make: '🦾 Assembly hall', market: '🏷️ Robot exchange', book: '📇 Automaton registry' });
  const lights: THREE.PointLight[] = [];
  // play: a huge switchboard of glowing tiles
  box(ctx, ctx.root, 4.4, 3.4, 0.4, black, S.play.x, 1.9, S.play.z - 1.2);
  const tiles: THREE.Mesh[] = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) tiles.push(box(ctx, ctx.dyn, 0.55, 0.55, 0.08, ctx.std('#3A2E1A', { emissive: '#FFD84D', emissiveIntensity: 0 }), S.play.x - 1.65 + x * 0.66, 0.95 + y * 0.66, S.play.z - 0.98));
  lamp(ctx, lights, '#FFD84D', 12, 12, S.play.x, 2.4, S.play.z + 0.5);
  // a looping conveyor through the middle, with boxes riding it
  box(ctx, ctx.root, 12, 0.5, 0.9, black, 0, 0.25, 2.4); box(ctx, ctx.root, 12, 0.04, 0.92, '#3A3A3A', 0, 0.52, 2.4);
  const parcels: THREE.Mesh[] = []; for (let k = 0; k < 6; k++) parcels.push(box(ctx, ctx.dyn, 0.4, 0.35, 0.4, ['#C9A06A', '#F5B83D', '#D0D4DC'][k % 3], -6 + k * 2, 0.72, 2.4));
  // walking robots
  const bots: THREE.Group[] = [];
  for (let k = 0; k < 3; k++) { const b = new THREE.Group(); ctx.dyn.add(b); box(ctx, b, 0.5, 0.6, 0.35, chrome, 0, 0.95, 0); box(ctx, b, 0.36, 0.3, 0.3, chrome, 0, 1.45, 0); glow(ctx, b, 0.08, 1.48, 0.16, '#FFD84D', 0.04, 2.4); glow(ctx, b, -0.08, 1.48, 0.16, '#FFD84D', 0.04, 2.4); for (const s of [-1, 1]) box(ctx, b, 0.12, 0.6, 0.12, chrome, s * 0.13, 0.35, 0); cyl(ctx, b, 0.02, 0.02, 0.3, gold, 0, 1.75, 0); bots.push(b); }
  box(ctx, ctx.root, 1.4, 0.8, 1, black, S.collect.x, 0.4, S.collect.z); for (let k = 0; k < 8; k++) mesh(ctx, new THREE.TorusGeometry(0.12, 0.04, 6, 12), gold, S.collect.x + (r() - 0.5) * 1, 0.85, S.collect.z + (r() - 0.5) * 0.7).rotation.x = Math.PI / 2;
  box(ctx, ctx.root, 2, 1.4, 0.06, ctx.std('#1A3A6A', { emissive: '#0A1A3A' }), S.build.x, 1.6, S.build.z); for (let k = 0; k < 4; k++) box(ctx, ctx.root, 1.6, 0.02, 0.02, '#BFE3FF', S.build.x, 1.1 + k * 0.33, S.build.z + 0.04);
  box(ctx, ctx.root, 1.2, 0.2, 1.2, black, S.make.x, 0.1, S.make.z); const arm1 = new THREE.Group(); arm1.position.set(S.make.x, 0.2, S.make.z); ctx.dyn.add(arm1); cyl(ctx, arm1, 0.15, 0.2, 1.2, gold, 0, 0.6, 0); const fore = new THREE.Group(); fore.position.set(0, 1.2, 0); arm1.add(fore); box(ctx, fore, 0.15, 0.15, 1, chrome, 0, 0, 0.5); cone(ctx, fore, 0.12, 0.2, gold, 0, 0, 1.05).rotation.x = Math.PI / 2;
  box(ctx, ctx.root, 2, 1, 0.8, black, S.market.x, 0.5, S.market.z); box(ctx, ctx.root, 2.02, 0.08, 0.82, gold, S.market.x, 1.02, S.market.z); for (let k = 0; k < 3; k++) { box(ctx, ctx.root, 0.3, 0.4, 0.3, chrome, S.market.x - 0.6 + k * 0.6, 1.26, S.market.z); glow(ctx, ctx.root, S.market.x - 0.6 + k * 0.6, 1.36, S.market.z + 0.16, '#FFD84D', 0.03, 2); }
  box(ctx, ctx.root, 2.2, 1.6, 0.5, black, S.book.x, 0.8, S.book.z); for (let k = 0; k < 12; k++) box(ctx, ctx.root, 0.28, 0.2, 0.02, gold, S.book.x - 0.85 + (k % 6) * 0.34, 0.6 + Math.floor(k / 6) * 0.5, S.book.z + 0.26);
  const gears: THREE.Object3D[] = [];
  const gearGeo = (rad: number) => new THREE.CylinderGeometry(rad, rad, 0.15, 14);
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 10; k++) { const p = box(ctx, o, 0.4 + r() * 0.5, 0.3 + r() * 0.4, 0.4 + r() * 0.4, [black, chrome, gold][k % 3], -2.6 + r() * 5.2, 0.25, -0.8 + r() * 1.6); p.rotation.y = r() * 3; }
    if (i === 1) for (let k = 0; k < 4; k++) { const sp = cyl(ctx, o, 0.5, 0.5, 0.8, '#B87333', -2.2 + k * 1.5, 0.6, 0); sp.rotation.z = Math.PI / 2; cyl(ctx, o, 0.6, 0.6, 0.06, gold, -2.2 + k * 1.5 - 0.42, 0.6, 0).rotation.z = Math.PI / 2; }
    if (i === 2) { box(ctx, o, 5.6, 3, 0.15, ctx.std('#0A3A2A', { emissive: '#0A2A1A' }), 0, 1.6, -0.3); for (let k = 0; k < 14; k++) box(ctx, o, 0.6 + r() * 1.4, 0.04, 0.02, ctx.std('#F5B83D', { emissive: '#F5B83D', emissiveIntensity: 0.8 }), -2.4 + r() * 4.8, 0.4 + r() * 2.4, -0.2); }
    if (i === 3) for (let k = 0; k < 4; k++) { cyl(ctx, o, 0.06, 0.06, 1.2, chrome, -2.2 + k * 1.5, 0.6, 0); ball(ctx, o, 0.3, ctx.std('#BFE3FF', { transparent: true, opacity: 0.6, metalness: 0.3 }), -2.2 + k * 1.5, 1.4, 0); glow(ctx, o, -2.2 + k * 1.5, 1.4, 0.2, '#FFD84D', 0.08, 2); }
    if (i === 4) { const gg = keep(new THREE.Group()); gg.position.set(0, 2, -0.3); o.add(gg); for (let k = 0; k < 3; k++) { const m = mesh(ctx, gearGeo(0.8 + k * 0.3), gold, -1.6 + k * 1.6, 0, 0, gg); m.rotation.x = Math.PI / 2; m.userData.dir = k % 2 ? -1 : 1; gears.push(m); } box(ctx, o, 5, 3, 0.2, black, 0, 1.6, -0.6); }
    if (i === 5) { const brain = keep(new THREE.Group()); brain.position.set(0, 2.4, -0.4); o.add(brain); ball(ctx, brain, 0.9, ctx.std('#FFD84D', { emissive: '#F5B83D', emissiveIntensity: 1.6, transparent: true, opacity: 0.8 })); mesh(ctx, new THREE.TorusGeometry(1.3, 0.07, 6, 30), chrome, 0, 0, 0, brain).rotation.x = 1.2; mesh(ctx, new THREE.TorusGeometry(1.5, 0.07, 6, 30), chrome, 0, 0, 0, brain).rotation.y = 1.2; cyl(ctx, o, 1, 1.4, 1.2, black, 0, 0.6, -0.4); gears.push(brain); brain.userData.dir = 0.3; }
    // locked: a gold-and-black shutter
    box(ctx, l, 6, 3, 0.2, black, 0, 1.5, 0); for (let k = 0; k < 7; k++) box(ctx, l, 6.02, 0.06, 0.22, gold, 0, 0.3 + k * 0.42, 0);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['spool', 'lathe', 'etcher', 'glassblower', 'dynamo', 'thinker'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'spool') { const s = cyl(ctx, g, 0.35, 0.35, 0.5, '#B87333', 0, 0.5, 0); s.rotation.z = Math.PI / 2; const holder = new THREE.Group(); holder.position.set(0, 0.5, 0); g.add(holder); holder.add(s); s.position.set(0, 0, 0); g.userData.spin = holder; }
    else if (id === 'lathe') { box(ctx, g, 1, 0.5, 0.4, black, 0, 0.5, 0); const c = cyl(ctx, g, 0.08, 0.08, 0.6, chrome, 0, 0.85, 0); c.rotation.z = Math.PI / 2; g.userData.spin = c; g.userData.spinSpeed = 10; }
    else if (id === 'etcher') { box(ctx, g, 0.8, 0.8, 0.6, black, 0, 0.4, 0); box(ctx, g, 0.6, 0.02, 0.4, ctx.std('#0A3A2A', { emissive: '#0A5A3A', emissiveIntensity: 0.8 }), 0, 0.81, 0); g.userData.orb = glow(ctx, g, 0, 1, 0, '#3DDC97', 0.05, 2.6); }
    else if (id === 'glassblower') { cyl(ctx, g, 0.3, 0.4, 0.6, '#5A3A20', 0, 0.3, 0); g.userData.orb = ball(ctx, g, 0.22, ctx.std('#BFE3FF', { transparent: true, opacity: 0.6, emissive: '#FF8C42', emissiveIntensity: 0.5 }), 0, 0.85, 0); }
    else if (id === 'dynamo') { box(ctx, g, 0.8, 0.5, 0.5, black, 0, 0.25, 0); const wh = mesh(ctx, gearGeo(0.4), gold, 0, 0.9, 0, g); wh.rotation.x = Math.PI / 2; const piv = new THREE.Group(); piv.position.set(0, 0.9, 0); g.add(piv); piv.add(wh); wh.position.set(0, 0, 0); g.userData.spinZ = piv; }
    else { cyl(ctx, g, 0.4, 0.5, 0.9, black, 0, 0.45, 0); g.userData.orb = glow(ctx, g, 0, 1.15, 0, '#FFD84D', 0.22, 2.4); }
    return shadows(g);
  };
  const sparksM = motes(ctx, 90, '#FFD84D', 0.07);
  for (let i = 0; i < 90; i++) { sparksM.pos[i * 3] = (r() - 0.5) * 30; sparksM.pos[i * 3 + 1] = r() * 8; sparksM.pos[i * 3 + 2] = (r() - 0.5) * 24; } sparksM.done();
  return {
    sky: '#0E0A06', fog: ['#1A140A', 26, 70], light: ['#FFE8C0', '#2A1E0A', 2.2, '#FFD8A0', 1.8], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      tiles.forEach((m, k) => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = (Math.floor(t * 1.5) + k * 7) % 5 < 2 ? 1.4 : 0.05; });
      parcels.forEach((p, k) => { p.position.x = ((t * 1.2 + k * 2 + 6) % 12) - 6; });
      bots.forEach((b, k) => { const a = t * 0.25 + (k * Math.PI * 2) / 3, d = 6 + k * 0.6; b.position.set(Math.cos(a) * d, Math.abs(Math.sin(t * 6 + k)) * 0.05, Math.sin(a) * d * 0.7 - 1); b.rotation.y = -a; });
      arm1.rotation.y = Math.sin(t * 0.8) * 1.2; fore.rotation.x = -0.3 + Math.sin(t * 1.6) * 0.35;
      gears.forEach((gm) => { gm.rotation.y = t * (gm.userData.dir ?? 1); });
      sparksM.pts.rotation.y = t * 0.03; animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 🎂 Sky Banquet Palace — a pastel palace on clouds; tiered-cake towers and a chocolate waterfall
// ======================================================================================================================
export function banquet(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#FFF4F8'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) { g.fillStyle = '#FFD6E6'; g.fillRect(x * 32, y * 32, 32, 32); } g.strokeStyle = '#F2C14E'; g.lineWidth = 1.5; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } }, 10, 70, 0.5);
  const cloudsI: Inst[] = []; around(ctx, 80, 22, 40, (x, z) => cloudsI.push({ x, y: -0.5 + r() * 1.2, z, s: 2 + r() * 3, sy: 0.6, c: ['#FFFFFF', '#FFF0F6', '#F6EEFF'][Math.floor(r() * 3)] }));
  scatter(ctx, new THREE.SphereGeometry(1, 10, 8), ctx.std('#ffffff', { roughness: 1 }), cloudsI);
  const icing = ['#FFB8D8', '#B8E8FF', '#FFF0A8', '#D8C8FF', '#C8FFD8'];
  // tiered-cake towers ring the terrace
  around(ctx, 12, 20, 21, (x, z, a, i) => { for (let k = 0; k < 4; k++) { cyl(ctx, ctx.root, 1.6 - k * 0.32, 1.6 - k * 0.32, 1.6, icing[(i + k) % 5], x, 0.8 + k * 1.6, z, 20); mesh(ctx, new THREE.TorusGeometry(1.6 - k * 0.32, 0.1, 6, 24), ctx.std('#FFFFFF'), x, 1.6 + k * 1.6, z).rotation.x = Math.PI / 2; } ball(ctx, ctx.root, 0.35, '#E04E6E', x, 7, z); void a; });
  const S = spots({ play: '🔪 Perfect Slice', collect: '🧺 Pantry basket', build: '📜 Menu board', make: '🧁 Pastry hall', market: '🛍️ Palace market', book: '📖 Royal cookbook' });
  const lights: THREE.PointLight[] = [];
  // play: a giant cake on a stand that turns, with a silver knife hovering over it
  cyl(ctx, ctx.root, 0.2, 0.5, 1, '#E8E4DC', S.play.x, 0.5, S.play.z - 0.8); cyl(ctx, ctx.root, 1.6, 1.6, 0.1, '#E8E4DC', S.play.x, 1.05, S.play.z - 0.8, 24);
  const cake = new THREE.Group(); cake.position.set(S.play.x, 1.1, S.play.z - 0.8); ctx.dyn.add(cake);
  cyl(ctx, cake, 1.3, 1.3, 0.9, '#FFB8D8', 0, 0.45, 0, 28); cyl(ctx, cake, 0.9, 0.9, 0.7, '#FFFFFF', 0, 1.25, 0, 24); for (let k = 0; k < 10; k++) ball(ctx, cake, 0.12, '#E04E6E', Math.cos(k * 0.63) * 1.1, 0.95, Math.sin(k * 0.63) * 1.1); glow(ctx, cake, 0, 1.9, 0, '#FFE14D', 0.08, 2);
  const knife = new THREE.Group(); ctx.dyn.add(knife); box(ctx, knife, 1.4, 0.3, 0.03, ctx.std('#E0E4EC', { metalness: 1, roughness: 0.1 }), 0, 0, 0); box(ctx, knife, 0.5, 0.18, 0.1, '#6B3A1E', -0.9, 0, 0);
  lamp(ctx, lights, '#FFD0E0', 10, 12, S.play.x, 3, S.play.z);
  // a chocolate waterfall behind the market
  const fallTex = ctx.tex(64, 128, (g) => { g.fillStyle = '#5A2E14'; g.fillRect(0, 0, 64, 128); g.strokeStyle = '#8A4E24'; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(i * 7, 0); g.lineTo(i * 7 + 3, 128); g.stroke(); } }, 1);
  const fall = mesh(ctx, new THREE.PlaneGeometry(3, 6), ctx.std('#ffffff', { map: fallTex, roughness: 0.2 }), 12, 3, -10); fall.rotation.y = -0.6; fall.castShadow = false; disc(ctx, ctx.root, 2, ctx.std('#5A2E14', { roughness: 0.15 }), 11.2, 0.04, -8.8);
  box(ctx, ctx.root, 1.2, 0.8, 0.8, '#C9A06A', S.collect.x, 0.4, S.collect.z); for (let k = 0; k < 6; k++) ball(ctx, ctx.root, 0.14, ['#E04E6E', '#5A2E14', '#FFF0A8'][k % 3], S.collect.x - 0.35 + (k % 3) * 0.35, 0.92, S.collect.z - 0.15 + Math.floor(k / 3) * 0.3);
  box(ctx, ctx.root, 1.4, 1.8, 0.1, '#5A3A2A', S.build.x, 1.2, S.build.z); box(ctx, ctx.root, 1.2, 1.6, 0.04, '#2A1A14', S.build.x, 1.2, S.build.z + 0.06); for (let k = 0; k < 5; k++) box(ctx, ctx.root, 0.8, 0.04, 0.01, '#FFFFFF', S.build.x, 0.7 + k * 0.25, S.build.z + 0.09);
  box(ctx, ctx.root, 2, 0.9, 0.9, '#FFFFFF', S.make.x, 0.45, S.make.z); for (let k = 0; k < 4; k++) { cyl(ctx, ctx.root, 0.14, 0.11, 0.2, '#E8C35A', S.make.x - 0.6 + k * 0.4, 1, S.make.z); ball(ctx, ctx.root, 0.15, icing[k], S.make.x - 0.6 + k * 0.4, 1.16, S.make.z); }
  for (const s of [-1, 1]) cyl(ctx, ctx.root, 0.06, 0.06, 2.2, '#F2C14E', S.market.x + s * 1, 1.1, S.market.z); const aw = box(ctx, ctx.root, 2.4, 0.08, 1.2, '#FF6FA8', S.market.x, 2.2, S.market.z + 0.2); aw.rotation.x = 0.2; box(ctx, ctx.root, 2, 0.8, 0.7, '#FFFFFF', S.market.x, 0.4, S.market.z);
  box(ctx, ctx.root, 1.4, 1, 0.8, '#FFD6E6', S.book.x, 0.5, S.book.z); const bk = box(ctx, ctx.root, 1, 0.12, 0.7, '#E04E6E', S.book.x, 1.07, S.book.z); bk.rotation.y = 0.2;
  const anim: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 5; k++) { const b = ball(ctx, o, 0.45, '#E8C35A', -2.4 + k * 1.2, 0.3, 0); b.scale.set(1.4, 0.6, 0.8); }
    if (i === 1) for (let k = 0; k < 4; k++) { cyl(ctx, o, 0.4, 0.45, 1.2, '#E8E4DC', -2.2 + k * 1.5, 0.6, 0); ball(ctx, o, 0.42, '#FFFFFF', -2.2 + k * 1.5, 1.3, 0).scale.y = 0.6; }
    if (i === 2) for (let row = 0; row < 3; row++) { box(ctx, o, 5.6, 0.3 + row * 0.4, 0.8, '#7AB84A', 0, (0.3 + row * 0.4) / 2, -0.8 + row * 0.8); for (let k = 0; k < 8; k++) ball(ctx, o, 0.1, ['#E04E6E', '#5A3AA0', '#FFFFFF'][row], -2.4 + k * 0.7, 0.4 + row * 0.4, -0.8 + row * 0.8); }
    if (i === 3) { const ft = mesh(ctx, new THREE.PlaneGeometry(2.4, 3.4), ctx.std('#ffffff', { map: fallTex, roughness: 0.2 }), 0, 1.7, -0.6, o); ft.castShadow = false; disc(ctx, o, 1.6, ctx.std('#5A2E14', { roughness: 0.15 }), 0, 0.04, 0.6); anim.push(ft); ft.userData.tex = 1; }
    if (i === 4) for (let k = 0; k < 6; k++) { cyl(ctx, o, 0.03, 0.03, 1.4, '#3E7D3A', -2.5 + k, 0.7, 0); for (let j = 0; j < 3; j++) ball(ctx, o, 0.12, '#FFF6D8', -2.5 + k + (j - 1) * 0.12, 1.3 + j * 0.08, 0.05); }
    if (i === 5) { for (let k = 0; k < 3; k++) cyl(ctx, o, 1.8 - k * 0.45, 1.8 - k * 0.45, 1.3, ['#FFFFFF', '#FFB8D8', '#FFF0A8'][k], 0, 0.65 + k * 1.3, -0.4, 24); const top = keep(new THREE.Group()); top.position.set(0, 4.3, -0.4); o.add(top); ball(ctx, top, 0.35, ctx.std('#FFD23F', { metalness: 0.9, roughness: 0.2, emissive: '#806010', emissiveIntensity: 0.6 })); anim.push(top); }
    // locked: a ribbon tied across, a cloche
    const cl = mesh(ctx, new THREE.SphereGeometry(1.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#E0E4EC', { metalness: 0.9, roughness: 0.15 }), 0, 0, 0, l); void cl; ball(ctx, l, 0.2, '#E0E4EC', 0, 1.9, 0); box(ctx, l, 6, 0.3, 0.05, '#FF6FA8', 0, 1, 2);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['mill', 'dairy', 'patch', 'cocoa', 'orchid', 'gilder'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'mill') { cyl(ctx, g, 0.4, 0.45, 0.3, '#E8E4DC', 0, 0.15, 0); const st = cyl(ctx, g, 0.38, 0.38, 0.2, '#C0B8A8', 0, 0.4, 0); g.userData.spin = st; }
    else if (id === 'dairy') { cyl(ctx, g, 0.3, 0.35, 0.8, '#E0E4EC', 0, 0.4, 0); g.userData.bob = ball(ctx, g, 0.3, '#FFFFFF', 0, 0.9, 0); g.userData.bobY = 0.95; }
    else if (id === 'patch') for (let j = 0; j < 5; j++) { ball(ctx, g, 0.2, '#7AB84A', (j - 2) * 0.25, 0.2, 0); ball(ctx, g, 0.07, '#E04E6E', (j - 2) * 0.25, 0.35, 0.1); }
    else if (id === 'cocoa') { box(ctx, g, 0.8, 0.6, 0.6, '#8A4E24', 0, 0.3, 0); cone(ctx, g, 0.6, 0.5, '#5A2E14', 0, 0.85, 0, 4).rotation.y = Math.PI / 4; g.userData.orb = glow(ctx, g, 0, 0.3, 0.32, '#FFB84D', 0.08, 1.6); }
    else if (id === 'orchid') { cyl(ctx, g, 0.2, 0.15, 0.3, '#FFFFFF', 0, 0.15, 0); const st = cyl(ctx, g, 0.02, 0.02, 0.8, '#3E7D3A', 0, 0.7, 0); g.userData.sway = st; for (let j = 0; j < 3; j++) ball(ctx, g, 0.1, '#FFF6D8', 0.1 * j - 0.1, 1.05, 0.05); }
    else { box(ctx, g, 0.8, 0.7, 0.6, '#FFFFFF', 0, 0.35, 0); g.userData.orb = glow(ctx, g, 0, 0.9, 0, '#FFD23F', 0.16, 2); }
    return shadows(g);
  };
  const sprinkles = motes(ctx, 140, '#FFB8D8', 0.09);
  for (let i = 0; i < 140; i++) { sprinkles.pos[i * 3] = (r() - 0.5) * 36; sprinkles.pos[i * 3 + 1] = 0.5 + r() * 6; sprinkles.pos[i * 3 + 2] = (r() - 0.5) * 30; } sprinkles.done();
  return {
    sky: '#FFD8EC', fog: ['#FFE6F2', 30, 80], light: ['#FFF4FA', '#E8B8D8', 2.6, '#FFF0F6', 2.2], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      cake.rotation.y = t * 0.3; const k2 = (t * 0.6) % 2, cut = k2 < 1 ? k2 : 0;
      knife.position.set(S.play.x + (cut - 0.5) * 2.6, 3.4 - (k2 < 1 ? Math.sin(cut * Math.PI) * 0.9 : 0), S.play.z - 0.8); knife.rotation.set(0, Math.PI / 2 * 0, -0.1);
      fallTex.offset.y = -t * 0.6;
      anim.forEach((a) => { if (!a.userData.tex) { a.rotation.y = t; a.position.y = 4.3 + Math.sin(t * 2) * 0.1; } });
      sprinkles.pts.rotation.y = t * 0.02; animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 👁️ Abyssal Throne — an obsidian hall in a violet void, floating rune stones and a giant watching eye
// ======================================================================================================================
export function abyss(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#0A0612'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(122,44,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2, b = ((k + 2) / 5) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); g.lineTo(128 + Math.cos(b) * 100, 128 + Math.sin(b) * 100); g.stroke(); } }, 3, 70, 0.25);
  const obs = ctx.std('#14101C', { roughness: 0.15, metalness: 0.4 }), violet = ctx.std('#7A2CFF', { emissive: '#7A2CFF', emissiveIntensity: 1.6 });
  // jagged obsidian pillars, leaning in
  around(ctx, 20, 20, 23, (x, z, a) => { const h = 8 + r() * 6; const p = cone(ctx, ctx.root, 1 + r() * 0.6, h, obs, x, h / 2, z, 5); p.rotation.z = Math.cos(a) * 0.12; p.rotation.x = -Math.sin(a) * 0.12; });
  // floating rune stones circle overhead
  const stones: THREE.Mesh[] = []; for (let k = 0; k < 10; k++) stones.push(box(ctx, ctx.dyn, 0.9, 1.4, 0.3, ctx.std('#2A2036', { emissive: '#4A1A8A', emissiveIntensity: 0.6 }), 0, 6, 0));
  // a giant eye in the void behind the throne
  const eye = new THREE.Group(); eye.position.set(0, 9, -26); ctx.dyn.add(eye); const white = ball(ctx, eye, 4, ctx.std('#E8E0F0', { emissive: '#3A2A50', emissiveIntensity: 0.6 })); white.scale.z = 0.4; const iris = ball(ctx, eye, 1.8, ctx.std('#7A2CFF', { emissive: '#7A2CFF', emissiveIntensity: 2 }), 0, 0, 1.4); iris.scale.z = 0.3; ball(ctx, eye, 0.8, '#000000', 0, 0, 1.9).scale.z = 0.3;
  const S = spots({ play: '✨ Rune Duel', collect: '⚱️ Soul urns', build: '📜 War table', make: '⚒️ Void forge', market: '🕯️ Shadow bazaar', book: '📕 Dark codex' });
  const lights: THREE.PointLight[] = [];
  // play: the throne itself on a dais of steps, a crackling sigil before it
  for (let k = 0; k < 3; k++) box(ctx, ctx.root, 4 - k * 0.8, 0.3, 2.4 - k * 0.4, obs, S.play.x, 0.15 + k * 0.3, S.play.z - 1.2);
  box(ctx, ctx.root, 1.4, 0.5, 1, obs, S.play.x, 1.15, S.play.z - 1.5); box(ctx, ctx.root, 1.4, 3, 0.3, obs, S.play.x, 2.4, S.play.z - 2); for (const s of [-1, 0, 1]) cone(ctx, ctx.root, 0.15, 0.9, violet, S.play.x + s * 0.5, 4.3 - Math.abs(s) * 0.3, S.play.z - 2, 4);
  const sigil = disc(ctx, ctx.dyn, 1.2, ctx.std('#7A2CFF', { emissive: '#7A2CFF', emissiveIntensity: 2, transparent: true, opacity: 0.6 }), S.play.x, 0.06, S.play.z + 0.4);
  lamp(ctx, lights, '#9A4CFF', 16, 14, S.play.x, 2, S.play.z);
  for (let k = 0; k < 3; k++) { cyl(ctx, ctx.root, 0.25, 0.35, 0.8, '#2A2036', S.collect.x - 0.6 + k * 0.6, 0.4, S.collect.z); glow(ctx, ctx.root, S.collect.x - 0.6 + k * 0.6, 0.95, S.collect.z, '#C8A8FF', 0.1, 2); }
  box(ctx, ctx.root, 1.8, 0.8, 1.2, obs, S.build.x, 0.4, S.build.z); for (let k = 0; k < 5; k++) cone(ctx, ctx.root, 0.08, 0.25, ['#7A2CFF', '#FF2E88'][k % 2], S.build.x - 0.6 + k * 0.3, 0.92, S.build.z + (r() - 0.5) * 0.6, 4);
  box(ctx, ctx.root, 1.2, 0.9, 0.8, obs, S.make.x, 0.45, S.make.z); const anvilGlow = glow(ctx, ctx.dyn, S.make.x, 1, S.make.z, '#B36BFF', 0.18, 2);
  for (let k = 0; k < 7; k++) { cyl(ctx, ctx.root, 0.05, 0.05, 0.3 + r() * 0.3, '#E8E0D0', S.market.x - 0.8 + k * 0.27, 0.95, S.market.z); glow(ctx, ctx.root, S.market.x - 0.8 + k * 0.27, 1.25, S.market.z, '#B36BFF', 0.04, 2.2); } box(ctx, ctx.root, 2.2, 0.8, 0.8, '#2A2036', S.market.x, 0.4, S.market.z);
  cyl(ctx, ctx.root, 0.4, 0.5, 1, obs, S.book.x, 0.5, S.book.z); const book = box(ctx, ctx.dyn, 0.8, 0.12, 0.6, '#3A0A2A', S.book.x, 1.4, S.book.z);
  const zAnim: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 6; k++) box(ctx, o, 1.6, 0.3, 1, obs, -2.4 + k * 0.9, 0.15 + k * 0.4, -0.6 + k * 0.2);
    if (i === 1) for (let k = 0; k < 8; k++) { const th = box(ctx, o, 0.02, 3.4, 0.02, ctx.std('#C8C0D8', { transparent: true, opacity: 0.6 }), -2.5 + k * 0.7, 1.7, 0); th.rotation.z = (k % 2 ? 1 : -1) * 0.5; }
    if (i === 2) { box(ctx, o, 2.4, 1, 1.2, obs, 0, 0.5, 0); disc(ctx, o, 0.8, ctx.std('#A0103A', { emissive: '#A0103A', emissiveIntensity: 1.4 }), 0, 1.02, 0); for (const s of [-1, 1]) { cyl(ctx, o, 0.06, 0.06, 1.6, '#E8E0D0', s * 1.6, 0.8, 0); glow(ctx, o, s * 1.6, 1.7, 0, '#FF3A5A', 0.1, 2.4); } }
    if (i === 3) { cyl(ctx, o, 1, 1.4, 1.6, obs, 0, 0.8, 0); disc(ctx, o, 0.8, violet, 0, 1.62, 0); const v = keep(new THREE.Group()); v.position.set(0, 2.4, 0); o.add(v); for (let k = 0; k < 5; k++) box(ctx, v, 0.12, 0.6, 0.12, violet, Math.cos(k * 1.25) * 0.6, 0, Math.sin(k * 1.25) * 0.6); zAnim.push(v); }
    if (i === 4) { const st = keep(new THREE.Group()); st.position.set(0, 2, -0.4); o.add(st); ball(ctx, st, 0.7, ctx.std('#FFE14D', { emissive: '#FFB020', emissiveIntensity: 2.4 })); for (let k = 0; k < 8; k++) { const ray = cone(ctx, st, 0.12, 0.8, ctx.std('#FFE14D', { emissive: '#FFB020', emissiveIntensity: 2 }), Math.cos(k * 0.79) * 0.9, Math.sin(k * 0.79) * 0.9, 0, 4); ray.rotation.z = k * 0.79 - Math.PI / 2; } const crater = mesh(ctx, new THREE.TorusGeometry(1.6, 0.4, 6, 20), obs, 0, 0.1, -0.4, o); crater.rotation.x = Math.PI / 2; zAnim.push(st); }
    if (i === 5) { const hg = keep(new THREE.Group()); hg.position.set(0, 2.2, -0.4); o.add(hg); cone(ctx, hg, 0.8, 1.6, ctx.std('#C8A8FF', { transparent: true, opacity: 0.5 }), 0, 0.8, 0, 12).rotation.x = Math.PI; cone(ctx, hg, 0.8, 1.6, ctx.std('#C8A8FF', { transparent: true, opacity: 0.5 }), 0, -0.8, 0, 12); for (const s of [-1, 1]) box(ctx, hg, 2, 0.15, 2, obs, 0, s * 1.65, 0); glow(ctx, hg, 0, -1.2, 0, '#FFE14D', 0.3, 2); zAnim.push(hg); hg.userData.flip = 1; }
    // locked: a sealed gate of chains
    box(ctx, l, 5, 3.4, 0.3, obs, 0, 1.7, 0); for (let k = 0; k < 6; k++) { const ch = box(ctx, l, 7, 0.08, 0.08, '#6A6070', 0, 0.5 + k * 0.5, 0.2); ch.rotation.z = (k % 2 ? 1 : -1) * 0.35; } glow(ctx, l, 0, 1.7, 0.2, '#FF2E88', 0.3, 1.6);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['pyre', 'spinner', 'altar', 'forge', 'starwell', 'hourglass'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'pyre') { for (let j = 0; j < 4; j++) box(ctx, g, 0.8, 0.1, 0.1, '#2A2036', 0, 0.1 + j * 0.1, 0).rotation.y = j * 0.8; g.userData.orb = cone(ctx, g, 0.3, 0.8, ctx.std('#B36BFF', { emissive: '#7A2CFF', emissiveIntensity: 2, transparent: true, opacity: 0.8 }), 0, 0.8, 0, 6); }
    else if (id === 'spinner') { const w = mesh(ctx, new THREE.TorusGeometry(0.4, 0.03, 6, 20), ctx.std('#C8C0D8'), 0, 0.8, 0, g); const piv = new THREE.Group(); g.add(piv); piv.position.set(0, 0.8, 0); piv.add(w); w.position.set(0, 0, 0); g.userData.spinZ = piv; cyl(ctx, g, 0.04, 0.04, 0.8, '#2A2036', 0, 0.4, 0); }
    else if (id === 'altar') { box(ctx, g, 0.8, 0.6, 0.5, obs, 0, 0.3, 0); g.userData.orb = glow(ctx, g, 0, 0.75, 0, '#FF3A5A', 0.12, 2.2); }
    else if (id === 'forge') { cyl(ctx, g, 0.4, 0.5, 0.7, obs, 0, 0.35, 0); g.userData.orb = disc(ctx, g, 0.32, violet, 0, 0.71, 0); }
    else if (id === 'starwell') { cyl(ctx, g, 0.45, 0.5, 0.4, '#2A2036', 0, 0.2, 0); g.userData.bob = glow(ctx, g, 0, 0.9, 0, '#FFE14D', 0.14, 2.6); g.userData.bobY = 0.9; }
    else { const hg = new THREE.Group(); hg.position.set(0, 0.7, 0); g.add(hg); cone(ctx, hg, 0.3, 0.6, ctx.std('#C8A8FF', { transparent: true, opacity: 0.5 }), 0, 0.3, 0, 10).rotation.x = Math.PI; cone(ctx, hg, 0.3, 0.6, ctx.std('#C8A8FF', { transparent: true, opacity: 0.5 }), 0, -0.3, 0, 10); g.userData.spinZ = hg; }
    return shadows(g);
  };
  const motesV = motes(ctx, 180, '#B36BFF', 0.1);
  for (let i = 0; i < 180; i++) { motesV.pos[i * 3] = (r() - 0.5) * 40; motesV.pos[i * 3 + 1] = r() * 10; motesV.pos[i * 3 + 2] = (r() - 0.5) * 34; } motesV.done();
  return {
    sky: '#06020E', fog: ['#120624', 20, 64], light: ['#C8A8FF', '#1A0A2A', 1.6, '#B8A0E8', 1.3], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      stones.forEach((s, k) => { const a = t * 0.12 + (k / stones.length) * Math.PI * 2; s.position.set(Math.cos(a) * 13, 6 + Math.sin(t + k) * 0.6, Math.sin(a) * 11); s.rotation.y = -a; });
      iris.position.x = Math.sin(t * 0.4) * 1.2; iris.position.y = Math.cos(t * 0.3) * 0.6; eye.scale.y = Math.sin(t * 0.2) > 0.97 ? 0.15 : 1;
      sigil.rotation.z = t * 0.8; anvilGlow.scale.setScalar(1 + Math.sin(t * 6) * 0.2); book.position.y = 1.4 + Math.sin(t * 1.5) * 0.08;
      zAnim.forEach((z) => { if (z.userData.flip) z.rotation.z = Math.floor(t / 6) % 2 ? Math.PI : 0; else z.rotation.y = t * 0.7; });
      motesV.pts.rotation.y = -t * 0.01; animate(ups, t);
    },
  };
}

// ======================================================================================================================
// ⚡ Hall of Titans — a marble mountaintop temple in a thunderstorm, giant statues and lightning
// ======================================================================================================================
export function titans(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#E8E2D4'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#C9A64A'; g.lineWidth = 3; for (let k = 0; k < 4; k++) { g.strokeRect(16 + k * 28, 16 + k * 28, 224 - k * 56, 224 - k * 56); } g.fillStyle = 'rgba(160,150,130,0.2)'; for (let i = 0; i < 40; i++) g.fillRect(r() * 256, r() * 256, 30, 1); }, 6, 70, 0.4);
  const marble = ctx.std('#F2EEE6', { roughness: 0.35 }), gold = ctx.std('#FFB020', { metalness: 0.9, roughness: 0.2 });
  // a colonnade with a pediment, all round
  around(ctx, 24, 20, 20, (x, z) => { cyl(ctx, ctx.root, 0.55, 0.65, 8, marble, x, 4, z, 16); box(ctx, ctx.root, 1.5, 0.4, 1.5, marble, x, 8.2, z); });
  const lintel = mesh(ctx, new THREE.TorusGeometry(20, 0.5, 4, 48), marble, 0, 8.6, 0); lintel.rotation.x = Math.PI / 2;
  // four colossal titan statues looking in
  for (const [x, z] of [[-14, -14], [14, -14], [-16, 10], [16, 10]]) { const st = new THREE.Group(); st.position.set(x, 0, z); st.rotation.y = Math.atan2(-x, -z); ctx.root.add(st); box(ctx, st, 3, 1.4, 3, marble, 0, 0.7, 0); cyl(ctx, st, 0.9, 1.3, 5, marble, 0, 3.9, 0); ball(ctx, st, 0.8, marble, 0, 7, 0); for (const s of [-1, 1]) { const arm = cyl(ctx, st, 0.35, 0.3, 3.2, marble, s * 1.4, 5, 0); arm.rotation.z = s * 0.4; } cone(ctx, st, 0.15, 1.6, gold, 1.9, 6.6, 0, 4); }
  const S = spots({ play: '🔥 Elemental Clash', collect: '🏺 Offering urns', build: '📜 Council scroll', make: '⚒️ Myth forge', market: '🏛️ Olympus exchange', book: '🃏 Pantheon cards' });
  const lights: THREE.PointLight[] = [];
  // play: three element braziers round a duel circle
  disc(ctx, ctx.root, 2.4, ctx.std('#C9A64A', { metalness: 0.6, roughness: 0.3 }), S.play.x, 0.03, S.play.z - 0.8);
  const flames: THREE.Mesh[] = [];
  [['#FF5A1F', -1.6], ['#3FA7FF', 0], ['#3DDC97', 1.6]].forEach(([c, dx]) => { cyl(ctx, ctx.root, 0.35, 0.2, 1.2, gold, S.play.x + (dx as number), 0.6, S.play.z - 1.8); flames.push(cone(ctx, ctx.dyn, 0.3, 0.8, ctx.std(c as string, { emissive: c as string, emissiveIntensity: 2.2, transparent: true, opacity: 0.85 }), S.play.x + (dx as number), 1.6, S.play.z - 1.8, 8)); });
  lamp(ctx, lights, '#FFD08A', 14, 12, S.play.x, 2.2, S.play.z - 1);
  for (let k = 0; k < 3; k++) { const u = cyl(ctx, ctx.root, 0.2, 0.32, 0.8, '#C46A3A', S.collect.x - 0.6 + k * 0.6, 0.4, S.collect.z); void u; cyl(ctx, ctx.root, 0.15, 0.2, 0.15, '#C46A3A', S.collect.x - 0.6 + k * 0.6, 0.88, S.collect.z); }
  cyl(ctx, ctx.root, 0.08, 0.08, 1.4, gold, S.build.x - 0.5, 0.9, S.build.z); cyl(ctx, ctx.root, 0.08, 0.08, 1.4, gold, S.build.x + 0.5, 0.9, S.build.z); box(ctx, ctx.root, 0.9, 1.2, 0.02, '#F2E6C8', S.build.x, 0.95, S.build.z);
  box(ctx, ctx.root, 1, 0.6, 0.6, '#3A3A42', S.make.x, 0.3, S.make.z); box(ctx, ctx.root, 1.4, 0.3, 0.5, '#3A3A42', S.make.x, 0.75, S.make.z); const hammer = new THREE.Group(); hammer.position.set(S.make.x + 0.4, 1.4, S.make.z); ctx.dyn.add(hammer); cyl(ctx, hammer, 0.04, 0.04, 0.8, '#6B4A2A', 0, -0.2, 0); box(ctx, hammer, 0.4, 0.2, 0.2, gold, 0, 0.2, 0);
  for (let k = 0; k < 3; k++) cyl(ctx, ctx.root, 0.2, 0.25, 2, marble, S.market.x - 0.7 + k * 0.7, 1, S.market.z - 0.3); const pd = cone(ctx, ctx.root, 1.6, 0.6, marble, S.market.x, 2.3, S.market.z - 0.3, 3); pd.rotation.set(Math.PI / 2, 0, 0); pd.scale.z = 0.4;
  box(ctx, ctx.root, 2, 1.2, 0.4, marble, S.book.x, 0.6, S.book.z); for (let k = 0; k < 5; k++) box(ctx, ctx.root, 0.3, 0.45, 0.02, ['#FF5A1F', '#3FA7FF', '#3DDC97', '#FFB020', '#B36BFF'][k], S.book.x - 0.7 + k * 0.35, 0.75, S.book.z + 0.21);
  const zAnim: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 5; k++) box(ctx, o, 5.4 - k * 0.8, 0.35, 0.8, marble, 0, 0.17 + k * 0.35, -0.8 + k * 0.4);
    if (i === 1) { box(ctx, o, 1.6, 1, 1, '#3A3A42', 0, 0.5, 0); const fg = glow(ctx, o, 0, 1.1, 0, '#FF8A2A', 0.4, 2.4); void fg; for (let k = 0; k < 4; k++) box(ctx, o, 0.5, 0.7, 0.02, gold, -2.4 + k * 0.5 + (k > 1 ? 3 : 0), 0.9, 0.3); }
    if (i === 2) { const ar = mesh(ctx, new THREE.TorusGeometry(2.4, 0.3, 6, 30), marble, 0, 0.15, 0, o); ar.rotation.x = Math.PI / 2; const bolt = keep(new THREE.Group()); o.add(bolt); for (let k = 0; k < 4; k++) { const seg = box(ctx, bolt, 0.12, 0.9, 0.12, ctx.std('#FFFFFF', { emissive: '#C8E0FF', emissiveIntensity: 3 }), (k % 2 ? 0.25 : -0.1), 3.4 - k * 0.8, 0); seg.rotation.z = k % 2 ? 0.5 : -0.5; } zAnim.push(bolt); bolt.userData.flash = 1; }
    if (i === 3) for (let k = 0; k < 4; k++) { box(ctx, o, 0.9, 1.4, 0.06, gold, -2.2 + k * 1.5, 1.6, 0); box(ctx, o, 0.78, 1.28, 0.07, ['#FF5A1F', '#3FA7FF', '#3DDC97', '#B36BFF'][k], -2.2 + k * 1.5, 1.6, 0.01); cyl(ctx, o, 0.2, 0.25, 0.9, marble, -2.2 + k * 1.5, 0.45, 0); }
    if (i === 4) { box(ctx, o, 6, 0.3, 1.4, marble, 0, 2, 0); for (const s of [-1, 1]) cyl(ctx, o, 0.4, 0.5, 2, marble, s * 2.6, 1, 0); for (let k = 0; k < 6; k++) { const c = ball(ctx, o, 0.6, ctx.std('#9AA0B8', { transparent: true, opacity: 0.6, depthWrite: false }), -2.5 + k, 1, (r() - 0.5) * 2); c.castShadow = false; } }
    if (i === 5) { for (let k = 0; k < 4; k++) box(ctx, o, 3 - k * 0.5, 0.4, 2 - k * 0.3, marble, 0, 0.2 + k * 0.4, -0.4); box(ctx, o, 1.2, 2.2, 0.4, gold, 0, 2.7, -1); box(ctx, o, 1.4, 0.3, 0.9, gold, 0, 1.75, -0.6); const orb = keep(new THREE.Group()); orb.position.set(0, 4.2, -0.6); o.add(orb); glow(ctx, orb, 0, 0, 0, '#C8E0FF', 0.4, 3); zAnim.push(orb); }
    // locked: a fallen column across the way
    const col = cyl(ctx, l, 0.6, 0.6, 6, marble, 0, 0.6, 0.6, 16); col.rotation.z = Math.PI / 2; for (let k = 0; k < 5; k++) box(ctx, l, 0.5 + r() * 0.4, 0.4, 0.5, marble, -2.4 + k * 1.2, 0.2, -0.6).rotation.y = r();
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['archive', 'mixer', 'foundry', 'lens', 'council', 'stormspire'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'archive') { box(ctx, g, 0.9, 1.1, 0.4, marble, 0, 0.55, 0); for (let j = 0; j < 6; j++) cyl(ctx, g, 0.05, 0.05, 0.35, '#F2E6C8', -0.3 + (j % 3) * 0.3, 0.35 + Math.floor(j / 3) * 0.45, 0.2).rotation.z = Math.PI / 2; }
    else if (id === 'mixer') { cyl(ctx, g, 0.4, 0.3, 0.4, gold, 0, 0.2, 0); const sp = new THREE.Group(); sp.position.set(0, 0.45, 0); g.add(sp); for (let j = 0; j < 3; j++) ball(ctx, sp, 0.08, ['#FF5A1F', '#3FA7FF', '#3DDC97'][j], Math.cos(j * 2.1) * 0.22, 0, Math.sin(j * 2.1) * 0.22); g.userData.spin = sp; g.userData.spinSpeed = 4; }
    else if (id === 'foundry') { box(ctx, g, 0.8, 0.6, 0.6, '#3A3A42', 0, 0.3, 0); g.userData.orb = glow(ctx, g, 0, 0.35, 0.32, '#FFB020', 0.1, 2.4); }
    else if (id === 'lens') { cyl(ctx, g, 0.05, 0.05, 0.9, gold, 0, 0.45, 0); const p = cone(ctx, g, 0.3, 0.6, ctx.std('#E8F4FF', { transparent: true, opacity: 0.7, emissive: '#C8A8FF', emissiveIntensity: 0.6 }), 0, 1.1, 0, 3); g.userData.spin = p; }
    else if (id === 'council') { for (let j = 0; j < 3; j++) { cyl(ctx, g, 0.15, 0.2, 0.9, marble, -0.35 + j * 0.35, 0.45, 0); ball(ctx, g, 0.13, marble, -0.35 + j * 0.35, 1.02, 0); } }
    else { cone(ctx, g, 0.3, 1.8, marble, 0, 0.9, 0, 6); g.userData.orb = glow(ctx, g, 0, 1.9, 0, '#C8E0FF', 0.14, 3); }
    return shadows(g);
  };
  const rain = motes(ctx, 220, '#C8D8F0', 0.06);
  const rs = Array.from({ length: 220 }, () => [(r() - 0.5) * 50, r() * 20, (r() - 0.5) * 44]);
  const flashLight = new THREE.PointLight('#D8E8FF', 0, 80, 1); flashLight.position.set(0, 18, -10); ctx.scene.add(flashLight);
  return {
    sky: '#3A4058', fog: ['#4A5068', 30, 90], light: ['#E8ECFF', '#4A4A5A', 2.2, '#FFF4E0', 1.8], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t, dt) {
      flames.forEach((f, k) => f.scale.set(1 + Math.sin(t * 11 + k) * 0.12, 1 + Math.sin(t * 15 + k * 2) * 0.22, 1));
      hammer.rotation.z = -Math.abs(Math.sin(t * 3)) * 1.1;
      // a lightning flash every few seconds
      const ph = t % 7, flash = ph < 0.12 || (ph > 0.22 && ph < 0.3) ? 1 : 0; flashLight.intensity = flash * 140;
      zAnim.forEach((z) => { if (z.userData.flash) z.visible = (t % 3) < 0.25; else z.scale.setScalar(1 + Math.sin(t * 3) * 0.15); });
      for (let i = 0; i < rs.length; i++) { const e = rs[i]; e[1] -= (dt || 0.016) * 18; if (e[1] < 0) e[1] = 20; rain.pos[i * 3] = e[0]; rain.pos[i * 3 + 1] = e[1]; rain.pos[i * 3 + 2] = e[2]; } rain.done();
      animate(ups, t);
    },
  };
}
void person;
