// Estate worlds, part 1: 🖼️ Grand Atelier · 🦌 Wildwood Reserve · 🐎 Harvest Valley Ranch · 🏙️ Skyline Exchange ·
// 🎡 Neon Boardwalk · 💎 Gemheart Caverns. Same layout as every realm; six completely different places.
import { motes } from '../../home/live3d/kit3d';
import type { RealmEnv } from '../realm3d';
import { BOUNDS, THREE, around, ball, box, cone, cyl, disc, floor, glow, keep, lamp, mesh, person, prodGroup, scatter, shadows, spots, zones, type Ctx, type Inst } from './envKit';

// ======================================================================================================================
// 🖼️ Grand Atelier — a sunlit painters' palace: parquet floors, white columns, giant easels
// ======================================================================================================================
export function atelier(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#C79A64'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#B5854F' : '#D4A874'; g.save(); g.translate(x * 64 + (y % 2) * 32, y * 32); g.fillRect(0, 0, 62, 30); g.restore(); } g.strokeStyle = 'rgba(80,50,20,0.25)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } }, 12);
  // a ring of white columns with gold capitals, and tall framed paintings between them
  const marble = ctx.std('#F2EEE6', { roughness: 0.35 }), gold = ctx.std('#D9B24A', { metalness: 0.8, roughness: 0.25 });
  around(ctx, 22, 20, 21, (x, z, a, i) => {
    cyl(ctx, ctx.root, 0.55, 0.65, 7, marble, x, 3.5, z); cyl(ctx, ctx.root, 0.9, 0.9, 0.35, gold, x, 7.1, z);
    if (i % 2) { const f = new THREE.Group(); f.position.set(x * 0.94, 3.2, z * 0.94); f.rotation.y = Math.atan2(-x, -z); void a; ctx.root.add(f); box(ctx, f, 3.2, 4, 0.25, gold); box(ctx, f, 2.8, 3.6, 0.3, ['#E85D75', '#3DA5D9', '#F2C14E', '#5FB49C', '#9B5DE5'][i % 5], 0, 0, 0.05); }
  });
  // sunbeams through the skylights
  for (let i = 0; i < 5; i++) { const b = mesh(ctx, new THREE.CylinderGeometry(0.8, 2.2, 14, 16, 1, true), ctx.std('#FFF4D6', { transparent: true, opacity: 0.08, emissive: '#FFF4D6', emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false }), -8 + i * 4, 7, -4 + (i % 2) * 6); b.rotation.z = 0.35; b.castShadow = false; }
  const S = spots({ play: '🎯 Hue Hunter', collect: '🧺 Paint cart', build: '📋 Studio board', make: '🗿 Atelier bench', market: '🖼️ Art dealer', book: '📖 Catalogue' });
  // the play station: a huge easel whose canvas cycles through colours
  const easel = new THREE.Group(); easel.position.set(S.play.x, 0, S.play.z - 0.6); ctx.root.add(easel);
  const wood = ctx.std('#7A4E2D');
  for (const s of [-1, 1]) { const leg = box(ctx, easel, 0.14, 4.2, 0.14, wood, s * 1, 2, 0); leg.rotation.z = -s * 0.12; }
  const back = box(ctx, easel, 0.12, 4, 0.12, wood, 0, 1.9, -0.7); back.rotation.x = 0.3;
  box(ctx, easel, 2.6, 0.12, 0.3, wood, 0, 1.1, 0.1);
  const canvasMat = ctx.std('#FF5A7A', { emissive: '#FF5A7A', emissiveIntensity: 0.35, roughness: 0.6 });
  const cv = mesh(ctx, new THREE.BoxGeometry(2.3, 2.3, 0.08), canvasMat, S.play.x, 2.4, S.play.z - 0.5, ctx.dyn);
  // paint cart, studio board, sculpting bench, dealer's desk, catalogue case
  box(ctx, ctx.root, 1.6, 0.7, 1, '#5A3A26', S.collect.x, 0.55, S.collect.z);
  ['#E85D75', '#3DA5D9', '#F2C14E', '#5FB49C', '#9B5DE5', '#FF8C42'].forEach((c, k) => cyl(ctx, ctx.root, 0.15, 0.15, 0.3, c, S.collect.x - 0.55 + (k % 3) * 0.55, 1.05, S.collect.z - 0.2 + Math.floor(k / 3) * 0.4));
  for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(ctx, ctx.root, 0.2, 0.2, 0.08, '#333', S.collect.x + s * 0.6, 0.2, S.collect.z + t * 0.5).rotation.x = Math.PI / 2;
  box(ctx, ctx.root, 0.12, 1.6, 0.12, wood, S.build.x, 0.8, S.build.z); box(ctx, ctx.root, 1.6, 1.1, 0.08, '#E8D9A8', S.build.x, 1.5, S.build.z);
  for (let k = 0; k < 4; k++) box(ctx, ctx.root, 0.4, 0.3, 0.02, ['#fff', '#FFE14D', '#BDE0FE', '#FFC8DD'][k], S.build.x - 0.45 + (k % 2) * 0.9, 1.7 - Math.floor(k / 2) * 0.45, S.build.z + 0.06);
  cyl(ctx, ctx.root, 0.5, 0.6, 1, marble, S.make.x, 0.5, S.make.z); ball(ctx, ctx.root, 0.4, marble, S.make.x, 1.4, S.make.z); cyl(ctx, ctx.root, 0.25, 0.32, 0.4, marble, S.make.x, 1.05, S.make.z);
  box(ctx, ctx.root, 2.2, 0.85, 0.9, '#3A2A1E', S.market.x, 0.43, S.market.z); person(ctx, ctx.root, S.market.x, S.market.z - 0.9, '#2B2D42', '#111');
  for (let k = 0; k < 3; k++) { box(ctx, ctx.root, 0.7, 0.9, 0.06, gold, S.market.x - 0.75 + k * 0.75, 1.35, S.market.z - 0.35); box(ctx, ctx.root, 0.58, 0.76, 0.07, ['#3DA5D9', '#E85D75', '#5FB49C'][k], S.market.x - 0.75 + k * 0.75, 1.35, S.market.z - 0.33); }
  box(ctx, ctx.root, 2.2, 1.3, 0.7, gold, S.book.x, 0.65, S.book.z); box(ctx, ctx.root, 2, 0.05, 0.6, ctx.std('#BFE3FF', { transparent: true, opacity: 0.4 }), S.book.x, 1.32, S.book.z);
  // zones
  const PAL = ['#E85D75', '#3DA5D9', '#F2C14E', '#5FB49C', '#9B5DE5', '#FF8C42'];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 4; k++) { const e = new THREE.Group(); e.position.set(-2.4 + k * 1.6, 0, 0); o.add(e); for (const s of [-1, 1]) box(ctx, e, 0.08, 2, 0.08, wood, s * 0.4, 1, 0).rotation.z = -s * 0.1; box(ctx, e, 1, 1, 0.05, PAL[k], 0, 1.4, 0.05); }
    if (i === 1) for (let k = 0; k < 24; k++) { cyl(ctx, o, 0.03, 0.03, 0.6, '#3E7D3A', -2.5 + (k % 8) * 0.7, 0.3, -1 + Math.floor(k / 8) * 0.9); ball(ctx, o, 0.18, PAL[k % 6], -2.5 + (k % 8) * 0.7, 0.68, -1 + Math.floor(k / 8) * 0.9); }
    if (i === 2) { disc(ctx, o, 2, ctx.std('#7FD4E8', { roughness: 0.1, metalness: 0.2 }), 0, 0.03, 0.5); for (const s of [-1, 1]) { cyl(ctx, o, 0.4, 0.5, 0.9, marble, s * 2.6, 0.45, 0); ball(ctx, o, 0.32, marble, s * 2.6, 1.6, 0); cyl(ctx, o, 0.22, 0.28, 0.5, marble, s * 2.6, 1.15, 0); } }
    if (i === 3) for (let k = 0; k < 5; k++) { box(ctx, o, 0.9, 2.6, 0.06, ctx.std(PAL[k], { transparent: true, opacity: 0.55, emissive: PAL[k], emissiveIntensity: 0.6 }), -2.4 + k * 1.2, 1.5, 0); box(ctx, o, 0.08, 2.8, 0.1, '#333', -1.8 + k * 1.2, 1.5, 0); }
    if (i === 4) { box(ctx, o, 6, 3.2, 0.3, '#5B2333', 0, 1.6, -0.4); for (let k = 0; k < 3; k++) { box(ctx, o, 1.4, 1.8, 0.1, gold, -1.8 + k * 1.8, 1.8, -0.2); box(ctx, o, 1.2, 1.6, 0.12, PAL[k + 2], -1.8 + k * 1.8, 1.8, -0.15); } }
    if (i === 5) { const arch = mesh(ctx, new THREE.TorusGeometry(2.4, 0.35, 10, 30, Math.PI), gold, 0, 0, -0.3, o); void arch; box(ctx, o, 3, 3.4, 0.1, '#1E1A2E', 0, 1.7, -0.4); ball(ctx, o, 0.6, ctx.std('#FFE14D', { emissive: '#FFE14D', emissiveIntensity: 1 }), 0, 2.1, -0.2); }
    // locked: the wing is under dust sheets
    const sheet = ctx.std('#EDE7DA', { roughness: 1 });
    for (let k = 0; k < 4; k++) { const m = cone(ctx, l, 0.9, 2 + (k % 2) * 0.6, sheet, -2.4 + k * 1.6, 1 + (k % 2) * 0.3, 0, 6); m.rotation.y = k; }
    box(ctx, l, 6.4, 0.08, 0.08, '#8B1E3F', 0, 1, 1.2); for (const s of [-1, 1]) cyl(ctx, l, 0.07, 0.07, 1.1, gold, s * 3.2, 0.55, 1.2);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['easel', 'mill', 'loom', 'kiln', 'gilder', 'fountain'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'easel') { for (const s of [-1, 1]) box(ctx, g, 0.06, 1.4, 0.06, wood, s * 0.3, 0.7, 0).rotation.z = -s * 0.1; box(ctx, g, 0.7, 0.7, 0.04, PAL[k % 6], 0, 1, 0.05); person(ctx, g, 0.6, 0.4, '#5FB49C', '#2B2D42'); }
    else if (id === 'mill') { cyl(ctx, g, 0.5, 0.5, 0.3, '#888', 0, 0.15, 0); const st = cyl(ctx, g, 0.42, 0.42, 0.25, '#AAA', 0, 0.45, 0); g.userData.spin = st; cyl(ctx, g, 0.2, 0.2, 0.05, '#E85D75', 0, 0.6, 0); }
    else if (id === 'loom') { box(ctx, g, 1.2, 1, 0.5, wood, 0, 0.5, 0); for (let j = 0; j < 6; j++) box(ctx, g, 0.02, 0.8, 0.02, '#F2EEE6', -0.45 + j * 0.18, 0.6, 0.26); }
    else if (id === 'kiln') { const d = mesh(ctx, new THREE.SphereGeometry(0.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#B5654A'), 0, 0, 0, g); void d; g.userData.orb = glow(ctx, g, 0, 0.25, 0.55, '#FF8C42', 0.18); }
    else if (id === 'gilder') { box(ctx, g, 1, 0.7, 0.6, wood, 0, 0.35, 0); const leaf = box(ctx, g, 0.5, 0.02, 0.35, gold, 0, 0.72, 0); g.userData.bob = leaf; }
    else { cyl(ctx, g, 0.6, 0.7, 0.4, marble, 0, 0.2, 0); cyl(ctx, g, 0.12, 0.15, 0.9, marble, 0, 0.8, 0); g.userData.orb = glow(ctx, g, 0, 1.4, 0, '#BDE0FE', 0.22, 1.2); }
    return shadows(g);
  };
  const dust = motes(ctx, 120, '#FFE9B0', 0.06);
  for (let i = 0; i < 120; i++) { dust.pos[i * 3] = (r() - 0.5) * 30; dust.pos[i * 3 + 1] = r() * 7; dust.pos[i * 3 + 2] = (r() - 0.5) * 24; } dust.done();
  const col = new THREE.Color();
  return {
    sky: '#F6E7CF', fog: ['#F6E7CF', 34, 80], light: ['#FFF6E8', '#C79A64', 2.6, '#FFF0D0', 2.2], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      col.setHSL((t * 0.06) % 1, 0.7, 0.58); canvasMat.color.copy(col); canvasMat.emissive.copy(col);
      dust.pts.rotation.y = t * 0.01;
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 3; if (g.userData.orb) (g.userData.orb as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 3 + i) * 0.15); if (g.userData.bob) (g.userData.bob as THREE.Object3D).position.y = 0.72 + Math.abs(Math.sin(t * 4 + i)) * 0.08; });
    },
  };
}

// ======================================================================================================================
// 🦌 Wildwood Reserve — a moonlit forest of pines and fireflies
// ======================================================================================================================
export function reserve(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#1F3D24'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 1200; i++) { g.fillStyle = ['#244A2A', '#1A3320', '#2E5A33', '#3B6B3A'][i % 4]; g.fillRect(r() * 256, r() * 256, 2, 3 + r() * 4); } }, 10);
  const pine = ctx.std('#14361F', { flatShading: true }), trunk = ctx.std('#4A3020');
  const trees: Inst[] = [], trunks: Inst[] = [];
  around(ctx, 70, 17, 26, (x, z) => { const s = 1 + r() * 1.4; trees.push({ x, y: 2.6 * s, z, s, sy: s * 1.3, c: ['#14361F', '#1B4527', '#10301A'][Math.floor(r() * 3)] }); trunks.push({ x, y: 0.6, z, s: 0.8 }); });
  scatter(ctx, new THREE.ConeGeometry(1.6, 4.4, 7), pine, trees, true); scatter(ctx, new THREE.CylinderGeometry(0.25, 0.32, 1.2, 6), trunk, trunks);
  const shrooms: Inst[] = []; for (let i = 0; i < 40; i++) { const x = (r() - 0.5) * 30, z = (r() - 0.5) * 24; if (Math.abs(x) < 9 && Math.abs(z) < 7) continue; shrooms.push({ x, y: 0.15, z, s: 0.25 + r() * 0.2, c: r() < 0.5 ? '#E04E4E' : '#F2C14E' }); }
  scatter(ctx, new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#ffffff', { emissive: '#552222', emissiveIntensity: 0.2 }), shrooms);
  const moon = glow(ctx, ctx.root, -14, 18, -30, '#F4F1D0', 2.6, 1.1); void moon;
  const S = spots({ play: '🏮 Firefly Lantern', collect: '🌰 Acorn stash', build: '📋 Ranger board', make: '🧺 Forager’s table', market: '🛖 Trading post', book: '📖 Field guide' });
  const lights: THREE.PointLight[] = [];
  // play: a tall lantern post with a hanging lantern that sways
  cyl(ctx, ctx.root, 0.1, 0.14, 3.2, trunk, S.play.x, 1.6, S.play.z - 0.6); box(ctx, ctx.root, 1, 0.1, 0.1, trunk, S.play.x + 0.45, 3.1, S.play.z - 0.6);
  const lantern = new THREE.Group(); lantern.position.set(S.play.x + 0.85, 3.05, S.play.z - 0.6); ctx.dyn.add(lantern);
  box(ctx, lantern, 0.4, 0.5, 0.4, ctx.std('#FFB84D', { emissive: '#FFB84D', emissiveIntensity: 1.6, transparent: true, opacity: 0.9 }), 0, -0.4, 0);
  lamp(ctx, lights, '#FFB84D', 14, 12, S.play.x + 0.85, 2.6, S.play.z - 0.6);
  // a hollow stump full of acorns
  cyl(ctx, ctx.root, 0.9, 1.1, 1, trunk, S.collect.x, 0.5, S.collect.z); disc(ctx, ctx.root, 0.75, '#2A1A10', S.collect.x, 1.02, S.collect.z);
  const ac: Inst[] = []; for (let k = 0; k < 14; k++) ac.push({ x: S.collect.x + (r() - 0.5) * 1.1, y: 1.08, z: S.collect.z + (r() - 0.5) * 1.1, s: 0.12 }); scatter(ctx, new THREE.SphereGeometry(1, 8, 6), ctx.std('#9C6B3A'), ac);
  box(ctx, ctx.root, 0.12, 1.6, 0.12, trunk, S.build.x, 0.8, S.build.z); box(ctx, ctx.root, 1.5, 0.9, 0.08, '#6B4A2A', S.build.x, 1.5, S.build.z);
  box(ctx, ctx.root, 2, 0.15, 1, '#6B4A2A', S.make.x, 0.8, S.make.z); for (const s of [-1, 1]) for (const t2 of [-1, 1]) cyl(ctx, ctx.root, 0.06, 0.06, 0.8, trunk, S.make.x + s * 0.85, 0.4, S.make.z + t2 * 0.4);
  ['#4C2C7A', '#C2185B', '#F2C14E'].forEach((c, k) => { cyl(ctx, ctx.root, 0.28, 0.22, 0.25, '#8B6B4A', S.make.x - 0.6 + k * 0.6, 1, S.make.z); ball(ctx, ctx.root, 0.18, c, S.make.x - 0.6 + k * 0.6, 1.15, S.make.z); });
  // a log cabin trading post
  box(ctx, ctx.root, 2.4, 1.8, 1.6, '#6B4A2A', S.market.x, 0.9, S.market.z - 0.2);
  const roof = mesh(ctx, new THREE.ConeGeometry(1.9, 1.2, 4), ctx.std('#2F4A2A'), S.market.x, 2.4, S.market.z - 0.2); roof.rotation.y = Math.PI / 4;
  glow(ctx, ctx.root, S.market.x, 1, S.market.z + 0.61, '#FFC870', 0.3, 1.2);
  cyl(ctx, ctx.root, 0.7, 0.9, 0.8, trunk, S.book.x, 0.4, S.book.z); box(ctx, ctx.root, 0.9, 0.1, 0.6, '#E8D9A8', S.book.x, 0.85, S.book.z);
  // zones
  const spiritOrbs: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 10; k++) { const m = ball(ctx, o, 0.5 + r() * 0.4, '#4C8C3A', -2.5 + r() * 5, 0.15, -1 + r() * 2.4); m.scale.y = 0.4; }
    if (i === 1) for (let k = 0; k < 8; k++) { const x = -2.5 + (k % 4) * 1.6, z = -0.6 + Math.floor(k / 4) * 1.4; ball(ctx, o, 0.6, '#2E5A2A', x, 0.5, z); for (let j = 0; j < 6; j++) ball(ctx, o, 0.08, '#3B2A8A', x + (r() - 0.5) * 0.9, 0.5 + (r() - 0.5) * 0.8, z + 0.45); }
    if (i === 2) { const w = mesh(ctx, new THREE.PlaneGeometry(1.8, 7), ctx.std('#2E7DAA', { roughness: 0.1, emissive: '#0E3A55', emissiveIntensity: 0.6 }), 0, 0.04, 0, o); w.rotation.x = -Math.PI / 2; w.rotation.z = Math.PI / 2; for (let k = 0; k < 7; k++) box(ctx, o, 0.25, 0.3, 1.8, '#6B4A2A', 2 + (k % 2) * 0.1, 0.15 + k * 0.05, 0).rotation.z = 0.2; ball(ctx, o, 0.35, '#7A7A7A', -1.4, 0.2, 1.2); }
    if (i === 3) { const fl = new THREE.Group(); o.add(fl); for (let k = 0; k < 30; k++) { cyl(ctx, fl, 0.02, 0.02, 0.5, '#3E7D3A', -2.6 + r() * 5.2, 0.25, -1 + r() * 2.4); } for (let k = 0; k < 30; k++) glow(ctx, fl, -2.6 + r() * 5.2, 0.55, -1 + r() * 2.4, ['#FF8AD8', '#B8A8FF', '#8AF0FF'][k % 3], 0.1, 1.6); }
    if (i === 4) for (let k = 0; k < 5; k++) { const x = -2.6 + k * 1.3; cyl(ctx, o, 0.2, 0.28, 2.4, trunk, x, 1.2, 0); cone(ctx, o, 1, 3.4, pine, x, 3.6, 0, 7); glow(ctx, o, x + 0.2, 1.3, 0.22, '#FFB13D', 0.12, 1.4); }
    if (i === 5) { cyl(ctx, o, 0.9, 1.4, 5, trunk, 0, 2.5, -0.4); ball(ctx, o, 2.6, ctx.std('#1E5A3A', { flatShading: true }), 0, 5.8, -0.4); const orbs = keep(new THREE.Group()); o.add(orbs); for (let k = 0; k < 7; k++) glow(ctx, orbs, Math.cos(k) * 2.2, 2 + (k % 3) * 0.8, Math.sin(k) * 1.4, '#8AF0FF', 0.16, 2.2); orbs.userData.spinY = 1; spiritOrbs.push(orbs); }
    // locked: a wall of thorny brambles
    for (let k = 0; k < 9; k++) ball(ctx, l, 0.7 + r() * 0.3, '#1A2A14', -3 + k * 0.75, 0.6 + r() * 0.4, 0.6 + r() * 0.3);
    for (let k = 0; k < 14; k++) cone(ctx, l, 0.06, 0.3, '#3A2A14', -3 + r() * 6, 0.4 + r() * 1.2, 1.2, 4).rotation.x = 1.4;
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['bower', 'thicket', 'hive', 'glade', 'pines', 'spring'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'bower') { const m = ball(ctx, g, 0.5, '#5CA03A', 0, 0.2, 0); m.scale.y = 0.5; ball(ctx, g, 0.25, '#7AC04A', 0.3, 0.3, 0.2); }
    else if (id === 'thicket') { ball(ctx, g, 0.55, '#2E5A2A', 0, 0.5, 0); for (let j = 0; j < 8; j++) ball(ctx, g, 0.07, '#3B2A8A', (r() - 0.5) * 0.8, 0.5 + (r() - 0.5) * 0.7, 0.45); }
    else if (id === 'hive') { cyl(ctx, g, 0.3, 0.4, 1.6, trunk, 0, 0.8, 0); const h = ball(ctx, g, 0.32, '#F2B83A', 0.3, 1.2, 0); h.scale.y = 1.3; g.userData.bee = glow(ctx, g, 0.5, 1.3, 0.3, '#FFE14D', 0.05, 2); }
    else if (id === 'glade') { for (let j = 0; j < 5; j++) { cyl(ctx, g, 0.02, 0.02, 0.5, '#3E7D3A', (j - 2) * 0.22, 0.25, 0); glow(ctx, g, (j - 2) * 0.22, 0.55, 0, '#FF8AD8', 0.1, 1.5); } g.userData.pulse = 1; }
    else if (id === 'pines') { cyl(ctx, g, 0.15, 0.2, 1.4, trunk, 0, 0.7, 0); cone(ctx, g, 0.7, 2, pine, 0, 2.2, 0, 7); glow(ctx, g, 0.15, 0.9, 0.18, '#FFB13D', 0.1, 1.5); }
    else { disc(ctx, g, 0.6, ctx.std('#8AF0FF', { emissive: '#8AF0FF', emissiveIntensity: 1.2 }), 0, 0.04, 0); for (let j = 0; j < 6; j++) ball(ctx, g, 0.14, '#6A6A72', Math.cos(j) * 0.7, 0.1, Math.sin(j) * 0.7); g.userData.pulse = 1; }
    return shadows(g);
  };
  const flies = motes(ctx, 160, '#C7FF8A', 0.14);
  const seeds = Array.from({ length: 160 }, () => [(r() - 0.5) * 34, 0.5 + r() * 3.5, (r() - 0.5) * 28, r() * 6]);
  return {
    sky: '#07101E', fog: ['#07101E', 24, 64], light: ['#9FB8F0', '#2A4A30', 2.1, '#D0DEFF', 1.5], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      lantern.rotation.z = Math.sin(t * 1.4) * 0.12;
      seeds.forEach(([x, y, z, p], i) => { flies.pos[i * 3] = x + Math.sin(t * 0.5 + p) * 1.4; flies.pos[i * 3 + 1] = y + Math.sin(t * 0.9 + p * 2) * 0.5; flies.pos[i * 3 + 2] = z + Math.cos(t * 0.4 + p) * 1.4; });
      flies.done(); flies.m.opacity = 0.6 + Math.sin(t * 3) * 0.3;
      spiritOrbs.forEach((o) => { o.rotation.y = t * 0.4; o.position.y = Math.sin(t * 1.2) * 0.2; });
      lights.forEach((l, i) => { l.intensity = 13 + Math.sin(t * 7 + i) * 1.2; });
      ups.forEach((g, i) => { if (g.userData.bee) { const b = g.userData.bee as THREE.Object3D; b.position.set(0.3 + Math.cos(t * 6 + i) * 0.4, 1.3 + Math.sin(t * 9) * 0.1, Math.sin(t * 6 + i) * 0.4); } if (g.userData.pulse) g.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.04); });
    },
  };
}

// ======================================================================================================================
// 🐎 Harvest Valley Ranch — golden hour on a ranch: red barn, white fences, hay bales, a fair on the hill
// ======================================================================================================================
export function ranch(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#7DBB4A'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 1400; i++) { g.fillStyle = ['#88C653', '#6FAE40', '#94CF5C'][i % 3]; g.fillRect(r() * 256, r() * 256, 2, 4); } }, 10);
  // a dirt path cross
  for (const [w, d] of [[22, 2.4], [2.4, 18]] as const) { const p = mesh(ctx, new THREE.PlaneGeometry(w, d), ctx.std('#C9A06A', { roughness: 1 }), 0, 0.02, 0.4); p.rotation.x = -Math.PI / 2; p.castShadow = false; }
  // rolling hills and white fences round the outside
  around(ctx, 18, 22, 28, (x, z) => { const m = ball(ctx, ctx.root, 5 + r() * 4, ['#6FAE40', '#7DBB4A', '#5E9A36'][Math.floor(r() * 3)], x, -2, z); m.scale.y = 0.45; });
  const white = ctx.std('#F8F8F2');
  for (let a = 0; a < 64; a++) { const ang = (a / 64) * Math.PI * 2, x = Math.cos(ang) * 17, z = Math.sin(ang) * 15; box(ctx, ctx.root, 0.14, 1, 0.14, white, x, 0.5, z); const nx = Math.cos(ang + Math.PI / 32) * 17, nz = Math.sin(ang + Math.PI / 32) * 15, rail = box(ctx, ctx.root, Math.hypot(nx - x, nz - z) + 0.1, 0.08, 0.06, white, (x + nx) / 2, 0.75, (z + nz) / 2); rail.rotation.y = -Math.atan2(nz - z, nx - x); }
  const bales: Inst[] = []; for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 12 + r() * 3; bales.push({ x: Math.cos(a) * d, y: 0.6, z: Math.sin(a) * d * 0.85, s: 0.6, rx: Math.PI / 2, ry: r() * 3 }); }
  scatter(ctx, new THREE.CylinderGeometry(1, 1, 1.4, 16), ctx.std('#E8C35A'), bales, true);
  // the big red barn and a windmill behind the play pen
  const red = ctx.std('#B23A2E'), barn = new THREE.Group(); barn.position.set(-9, 0, -12); ctx.root.add(barn);
  box(ctx, barn, 5, 3.4, 4, red, 0, 1.7, 0); const br = mesh(ctx, new THREE.CylinderGeometry(0.01, 3.2, 2, 4, 1), ctx.std('#5A2A22'), 0, 4.4, 0, barn); br.rotation.y = Math.PI / 4; br.scale.z = 0.9;
  box(ctx, barn, 1.8, 2.2, 0.1, white, 0, 1.1, 2.03); cyl(ctx, ctx.root, 1, 1, 6, '#C9C9C9', -5.8, 3, -12.5); mesh(ctx, new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#8A8A8A', { metalness: 0.6 }), -5.8, 6, -12.5);
  cyl(ctx, ctx.root, 0.25, 0.4, 7, white, 9, 3.5, -12);
  const blades = new THREE.Group(); blades.position.set(9, 6.8, -11.6); ctx.dyn.add(blades); for (let k = 0; k < 4; k++) { const b = box(ctx, blades, 0.35, 3, 0.05, white, 0, 1.5, 0); b.position.set(Math.sin((k * Math.PI) / 2) * 1.5, Math.cos((k * Math.PI) / 2) * 1.5, 0); b.rotation.z = -(k * Math.PI) / 2; }
  const S = spots({ play: '🐕 Sheepdog Roundup', collect: '🛒 Hay wagon', build: '📋 Barn board', make: '🏡 Farmhouse kitchen', market: '🏪 Feed store', book: '🎀 Ribbon board' });
  // play: a little pen with a gate and a dog
  for (let k = 0; k < 8; k++) { const ang = (k / 8) * Math.PI * 2; box(ctx, ctx.root, 0.12, 0.9, 0.12, '#8B6B4A', S.play.x + Math.cos(ang) * 1.6, 0.45, S.play.z - 0.6 + Math.sin(ang) * 1.1); }
  for (const s of [-0.3, 0.4]) { const m = ball(ctx, ctx.root, 0.35, '#F8F8F2', S.play.x + s, 0.4, S.play.z - 0.6); m.scale.set(1.2, 0.9, 0.9); ball(ctx, ctx.root, 0.15, '#333', S.play.x + s + 0.38, 0.5, S.play.z - 0.6); }
  // hay wagon
  box(ctx, ctx.root, 1.8, 0.4, 1.1, '#8B5A2B', S.collect.x, 0.6, S.collect.z); for (const s of [-1, 1]) for (const t2 of [-1, 1]) cyl(ctx, ctx.root, 0.32, 0.32, 0.1, '#5A3A1E', S.collect.x + s * 0.65, 0.35, S.collect.z + t2 * 0.6).rotation.x = Math.PI / 2;
  ball(ctx, ctx.root, 0.75, '#E8C35A', S.collect.x, 1.1, S.collect.z).scale.y = 0.6;
  box(ctx, ctx.root, 0.12, 1.6, 0.12, '#8B6B4A', S.build.x, 0.8, S.build.z); box(ctx, ctx.root, 1.5, 1, 0.08, red, S.build.x, 1.5, S.build.z);
  // farmhouse with a smoking chimney
  box(ctx, ctx.root, 2.4, 1.8, 1.8, '#F2E3C6', S.make.x, 0.9, S.make.z - 0.3); const fr = mesh(ctx, new THREE.ConeGeometry(1.9, 1.2, 4), ctx.std('#6B3A2A'), S.make.x, 2.4, S.make.z - 0.3); fr.rotation.y = Math.PI / 4;
  box(ctx, ctx.root, 0.35, 1, 0.35, '#8B4A3A', S.make.x + 0.6, 2.7, S.make.z - 0.5);
  const smoke = keep(new THREE.Group()); smoke.position.set(S.make.x + 0.6, 3.3, S.make.z - 0.5); ctx.dyn.add(smoke); for (let k = 0; k < 4; k++) ball(ctx, smoke, 0.22 + k * 0.08, ctx.std('#DDDDDD', { transparent: true, opacity: 0.6 }), 0, k * 0.45, 0);
  box(ctx, ctx.root, 2.2, 0.9, 0.8, '#6B4A2A', S.market.x, 0.45, S.market.z); person(ctx, ctx.root, S.market.x, S.market.z - 0.8, '#3A6EA5', '#C9A06A');
  for (let k = 0; k < 3; k++) box(ctx, ctx.root, 0.5, 0.6, 0.4, '#D9C29A', S.market.x - 0.7 + k * 0.7, 1.2, S.market.z);
  box(ctx, ctx.root, 2, 1.3, 0.1, '#F8F8F2', S.book.x, 1.1, S.book.z); for (const s of [-1, 1]) box(ctx, ctx.root, 0.1, 1.8, 0.1, '#8B6B4A', S.book.x + s, 0.9, S.book.z);
  ['#2E6BDB', '#D93B3B', '#F2C14E', '#3DDC97'].forEach((c, k) => { ball(ctx, ctx.root, 0.18, c, S.book.x - 0.6 + k * 0.4, 1.3, S.book.z + 0.08).scale.z = 0.3; });
  const ferris: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) { box(ctx, o, 3, 2, 2.4, red, 0, 1, -0.4); cyl(ctx, o, 0.6, 0.6, 3.6, '#C9C9C9', 2.2, 1.8, -0.4); }
    if (i === 1) { for (let k = 0; k < 3; k++) { const m = ball(ctx, o, 1.6, '#6FAE40', -2 + k * 2, -0.5, 0); m.scale.y = 0.5; } for (let k = 0; k < 6; k++) { const s2 = ball(ctx, o, 0.3, '#FFFFFF', -2.4 + k * 0.9, 0.55 + (k % 2) * 0.1, (k % 2) * 0.6); s2.scale.set(1.2, 0.9, 0.9); } }
    if (i === 2) for (let k = 0; k < 3; k++) { const cow = new THREE.Group(); cow.position.set(-2 + k * 2, 0, 0); o.add(cow); box(ctx, cow, 1.1, 0.6, 0.5, '#FFFFFF', 0, 0.75, 0); box(ctx, cow, 0.4, 0.3, 0.45, '#222', -0.2, 0.85, 0.03); box(ctx, cow, 0.35, 0.35, 0.35, '#FFFFFF', 0.65, 0.9, 0); for (const s of [-1, 1]) for (const t2 of [-1, 1]) box(ctx, cow, 0.12, 0.45, 0.12, '#FFFFFF', s * 0.4, 0.22, t2 * 0.18); }
    if (i === 3) for (let k = 0; k < 6; k++) { const x = -2.5 + (k % 3) * 2.5, z = -0.8 + Math.floor(k / 3) * 1.8; cyl(ctx, o, 0.14, 0.18, 1.2, '#6B4A2A', x, 0.6, z); ball(ctx, o, 0.9, '#3E8E3A', x, 1.6, z); for (let j = 0; j < 4; j++) ball(ctx, o, 0.11, '#E03A3A', x + Math.cos(j * 1.6) * 0.75, 1.5, z + Math.sin(j * 1.6) * 0.75); }
    if (i === 4) for (let k = 0; k < 9; k++) { const p = ball(ctx, o, 0.3 + r() * 0.35, '#F28C28', -2.6 + (k % 3) * 2.2 + r() * 0.5, 0.25, -1 + Math.floor(k / 3) * 1 + r() * 0.3); p.scale.y = 0.75; }
    if (i === 5) { const fw = keep(new THREE.Group()); fw.position.set(0, 2.8, -0.6); o.add(fw); mesh(ctx, new THREE.TorusGeometry(2.2, 0.08, 6, 24), ctx.std('#E03A3A'), 0, 0, 0, fw); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; box(ctx, fw, 0.06, 2.2, 0.06, '#F8F8F2', Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0).rotation.z = a + Math.PI / 2; ball(ctx, fw, 0.2, ['#F2C14E', '#2E6BDB', '#3DDC97', '#E03A3A'][k % 4], Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0); } ferris.push(fw); for (const s of [-1, 1]) box(ctx, o, 0.12, 3, 0.12, '#F8F8F2', s * 0.8, 1.4, -0.6).rotation.z = -s * 0.3; for (const s of [-2.6, 2.6]) { cone(ctx, o, 0.9, 1.4, s < 0 ? '#E03A3A' : '#2E6BDB', s, 1.4, 0.6, 8); cyl(ctx, o, 0.9, 0.9, 0.8, '#F8F8F2', s, 0.4, 0.6, 8); } }
    // locked: a closed wooden gate across the lane
    for (const s of [-3, 3]) box(ctx, l, 0.2, 1.4, 0.2, '#6B4A2A', s, 0.7, 0.8);
    for (let k = 0; k < 3; k++) box(ctx, l, 6, 0.16, 0.08, '#8B6B4A', 0, 0.35 + k * 0.4, 0.8);
    const brace = box(ctx, l, 6.3, 0.14, 0.08, '#8B6B4A', 0, 0.75, 0.82); brace.rotation.z = 0.22;
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['baler', 'fold', 'dairy', 'orchard', 'patch', 'pigs'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'baler') { box(ctx, g, 0.9, 0.6, 0.6, '#2E8B3A', 0, 0.55, 0); box(ctx, g, 0.4, 0.4, 0.5, '#2E8B3A', 0.2, 1, 0); for (const s of [-1, 1]) cyl(ctx, g, 0.35, 0.35, 0.15, '#222', -0.25, 0.35, s * 0.35).rotation.x = Math.PI / 2; g.userData.bob = 1; }
    else if (id === 'fold') { const s2 = ball(ctx, g, 0.35, '#FFFFFF', 0, 0.45, 0); s2.scale.set(1.2, 0.9, 0.9); ball(ctx, g, 0.15, '#333', 0.4, 0.55, 0); g.userData.bob = 1; }
    else if (id === 'dairy') { box(ctx, g, 1, 0.8, 0.8, red, 0, 0.4, 0); const rf = mesh(ctx, new THREE.ConeGeometry(0.8, 0.5, 4), ctx.std('#5A2A22'), 0, 1.05, 0, g); rf.rotation.y = Math.PI / 4; }
    else if (id === 'orchard') { cyl(ctx, g, 0.1, 0.14, 0.9, '#6B4A2A', 0, 0.45, 0); ball(ctx, g, 0.6, '#3E8E3A', 0, 1.2, 0); for (let j = 0; j < 4; j++) ball(ctx, g, 0.08, '#E03A3A', Math.cos(j * 1.6) * 0.5, 1.15, Math.sin(j * 1.6) * 0.5); }
    else if (id === 'patch') { const p = ball(ctx, g, 0.45, '#F28C28', 0, 0.35, 0); p.scale.y = 0.75; cyl(ctx, g, 0.04, 0.05, 0.2, '#3E7D3A', 0, 0.75, 0); }
    else { box(ctx, g, 0.6, 0.4, 0.35, '#F2A0B0', 0, 0.4, 0); ball(ctx, g, 0.18, '#F2A0B0', 0.38, 0.45, 0); cyl(ctx, g, 0.07, 0.07, 0.05, '#E08090', 0.55, 0.43, 0).rotation.z = Math.PI / 2; g.userData.bob = 1; }
    return shadows(g);
  };
  return {
    sky: '#9FD3F2', fog: ['#F2D9A8', 34, 85], light: ['#FFF0D0', '#7DBB4A', 2.4, '#FFE0A8', 2.3], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      blades.rotation.z = t * 0.9; ferris.forEach((f) => { f.rotation.z = t * 0.35; });
      smoke.children.forEach((c, k) => { c.position.y = ((t * 0.5 + k * 0.45) % 1.8); (c as THREE.Mesh).scale.setScalar(0.8 + c.position.y * 0.5); });
      ups.forEach((g, i) => { if (g.userData.bob) g.position.y = Math.abs(Math.sin(t * 3 + i)) * 0.06; });
    },
  };
}

// ======================================================================================================================
// 🏙️ Skyline Exchange — a marble rooftop at dusk among glowing towers
// ======================================================================================================================
export function exchange(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#E8E4DC'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#DAD5CC' : '#EFEBE4'; g.fillRect(x * 64, y * 64, 64, 64); } g.strokeStyle = 'rgba(160,150,140,0.16)'; g.lineWidth = 1; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(r() * 256, r() * 256); g.bezierCurveTo(r() * 256, r() * 256, r() * 256, r() * 256, r() * 256, r() * 256); g.stroke(); } }, 8, 70, 0.3);
  // towers all round with lit windows
  const winTex = ctx.tex(64, 128, (g) => { g.fillStyle = '#1E2A44'; g.fillRect(0, 0, 64, 128); for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) { g.fillStyle = Math.random() < 0.55 ? '#FFD98A' : '#2A3858'; g.fillRect(4 + x * 15, 4 + y * 8, 10, 5); } });
  const lit = ctx.std('#ffffff', { map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.9 });
  around(ctx, 26, 24, 36, (x, z) => { const h = 10 + r() * 22, w = 3 + r() * 3; const m = mesh(ctx, new THREE.BoxGeometry(w, h, w), lit, x, h / 2 - 4, z); m.castShadow = false; });
  // glass balustrade round the roof
  const glass = ctx.std('#9FD3F2', { transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2 });
  for (let a = 0; a < 40; a++) { const ang = (a / 40) * Math.PI * 2; const p = box(ctx, ctx.root, 2.8, 1.1, 0.06, glass, Math.cos(ang) * 17, 0.55, Math.sin(ang) * 15); p.rotation.y = -ang + Math.PI / 2; p.castShadow = false; }
  const S = spots({ play: '📈 Market Maker', collect: '🏦 Vault', build: '📋 Floor plans', make: '🤝 Deal room', market: '💼 Broker', book: '🏆 Trophy case' });
  // the play station: a giant ticker wall whose chart scrolls
  const tick = ctx.tex(512, 128, (g) => { g.fillStyle = '#071226'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#3DDC97'; g.lineWidth = 5; g.beginPath(); let y = 64; for (let x = 0; x <= 512; x += 8) { y = Math.max(16, Math.min(112, y + (Math.random() - 0.48) * 22)); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); });
  tick.wrapS = THREE.RepeatWrapping; tick.repeat.set(1, 1);
  box(ctx, ctx.root, 4.6, 2.4, 0.3, '#111827', S.play.x, 2, S.play.z - 0.8);
  mesh(ctx, new THREE.PlaneGeometry(4.3, 2.1), ctx.std('#ffffff', { map: tick, emissive: '#ffffff', emissiveMap: tick, emissiveIntensity: 1 }), S.play.x, 2, S.play.z - 0.64, ctx.dyn);
  for (const s of [-1, 1]) box(ctx, ctx.root, 0.2, 0.9, 0.2, '#333', S.play.x + s * 1.6, 0.45, S.play.z - 0.8);
  // vault door
  cyl(ctx, ctx.root, 1, 1, 0.4, ctx.std('#9AA0B0', { metalness: 0.9, roughness: 0.25 }), S.collect.x, 1.1, S.collect.z).rotation.x = Math.PI / 2;
  const wheel = mesh(ctx, new THREE.TorusGeometry(0.45, 0.06, 6, 20), ctx.std('#D9B24A', { metalness: 0.9 }), S.collect.x, 1.1, S.collect.z + 0.25, ctx.dyn);
  box(ctx, ctx.root, 2.4, 2.4, 0.3, '#5A6070', S.collect.x, 1.2, S.collect.z - 0.3);
  // desks, glass deal table, broker booth, trophy case
  for (const s of [-0.6, 0.6]) { box(ctx, ctx.root, 1, 0.75, 0.6, '#2B2D42', S.build.x + s, 0.38, S.build.z); box(ctx, ctx.root, 0.6, 0.4, 0.05, ctx.std('#3DA5D9', { emissive: '#3DA5D9', emissiveIntensity: 0.8 }), S.build.x + s, 1, S.build.z - 0.15); }
  box(ctx, ctx.root, 2.4, 0.06, 1.2, glass, S.make.x, 0.8, S.make.z); for (const s of [-1, 1]) box(ctx, ctx.root, 0.08, 0.8, 1, '#AAB', S.make.x + s * 1.1, 0.4, S.make.z);
  for (const s of [-1, 1]) for (const t2 of [-1, 1]) box(ctx, ctx.root, 0.45, 0.9, 0.45, '#1E1E28', S.make.x + s * 0.7, 0.45, S.make.z + t2 * 0.9);
  box(ctx, ctx.root, 2, 1.1, 0.7, '#14532D', S.market.x, 0.55, S.market.z); person(ctx, ctx.root, S.market.x, S.market.z - 0.7, '#1E1E28', undefined);
  box(ctx, ctx.root, 1.8, 0.12, 0.8, '#D9B24A', S.market.x, 1.15, S.market.z);
  box(ctx, ctx.root, 2.2, 1.8, 0.7, '#3A2A1E', S.book.x, 0.9, S.book.z); for (let k = 0; k < 3; k++) cone(ctx, ctx.root, 0.18, 0.5, ctx.std('#D9B24A', { metalness: 0.9, roughness: 0.2 }), S.book.x - 0.6 + k * 0.6, 1.4, S.book.z + 0.2, 8);
  const rotors: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) { cyl(ctx, o, 1.4, 1.6, 0.5, '#E8E4DC', 0, 0.25, 0); disc(ctx, o, 1.25, ctx.std('#7FD4E8', { roughness: 0.05, emissive: '#2A6A80', emissiveIntensity: 0.4 }), 0, 0.52, 0); cyl(ctx, o, 0.15, 0.2, 1.4, '#D9B24A', 0, 0.9, 0); }
    if (i === 1) for (let k = 0; k < 6; k++) { box(ctx, o, 1, 0.75, 0.6, '#F2F2F2', -2 + (k % 3) * 2, 0.38, -0.6 + Math.floor(k / 3) * 1.4); box(ctx, o, 0.5, 0.35, 0.05, ctx.std('#22B8FF', { emissive: '#22B8FF', emissiveIntensity: 0.7 }), -2 + (k % 3) * 2, 0.95, -0.75 + Math.floor(k / 3) * 1.4); cyl(ctx, o, 0.15, 0.1, 0.4, '#3E7D3A', -1.5 + (k % 3) * 2, 0.95, -0.6 + Math.floor(k / 3) * 1.4); }
    if (i === 2) { for (let k = 0; k < 4; k++) box(ctx, o, 1.3, 0.8, 0.08, ctx.std(k % 2 ? '#3DDC97' : '#FF5A5F', { emissive: k % 2 ? '#3DDC97' : '#FF5A5F', emissiveIntensity: 0.9 }), -2.1 + k * 1.4, 2, -0.6); box(ctx, o, 6, 0.9, 1, '#2B2D42', 0, 0.45, 0.4); }
    if (i === 3) { box(ctx, o, 5, 2.6, 3, glass, 0, 1.3, 0); box(ctx, o, 2, 0.5, 0.9, '#8B1E3F', 0, 0.25, 0); box(ctx, o, 2, 0.5, 0.2, '#8B1E3F', 0, 0.6, -0.4); }
    if (i === 4) { box(ctx, o, 1.4, 0.15, 6, '#C0C4CC', 0, 2.4, 0); for (const s of [-1, 1]) box(ctx, o, 0.06, 0.8, 6, glass, s * 0.7, 2.85, 0); for (const z of [-2.8, 2.8]) box(ctx, o, 0.4, 2.4, 0.4, '#5A6070', 0, 1.2, z); }
    if (i === 5) { disc(ctx, o, 2.2, '#2B2D42', 0, 0.03, 0); disc(ctx, o, 1.6, '#FFE14D', 0, 0.04, 0); disc(ctx, o, 1.4, '#2B2D42', 0, 0.05, 0); box(ctx, o, 0.3, 0.02, 1.2, '#FFE14D', -0.4, 0.06, 0); box(ctx, o, 0.3, 0.02, 1.2, '#FFE14D', 0.4, 0.06, 0); box(ctx, o, 0.8, 0.02, 0.3, '#FFE14D', 0, 0.06, 0);
      const heli = keep(new THREE.Group()); heli.position.set(0, 0, 0); o.add(heli); const body = ball(ctx, heli, 0.6, '#C0392B', 0, 0.8, 0); body.scale.set(1.5, 1, 1); box(ctx, heli, 1.6, 0.15, 0.15, '#C0392B', -1.2, 0.95, 0); const rot = box(ctx, heli, 3.6, 0.04, 0.2, '#222', 0, 1.5, 0); rotors.push(rot); }
    // locked: construction barriers and scaffolding
    for (let k = 0; k < 4; k++) { const b = box(ctx, l, 1.4, 0.5, 0.1, '#F28C28', -2.4 + k * 1.6, 0.6, 0.9); void b; for (let j = 0; j < 3; j++) box(ctx, l, 0.18, 0.5, 0.11, '#FFFFFF', -2.8 + k * 1.6 + j * 0.45, 0.6, 0.9).rotation.z = 0.5; }
    for (const s of [-2.5, 0, 2.5]) box(ctx, l, 0.08, 3.4, 0.08, '#888', s, 1.7, -0.5); for (const y of [1, 2.2, 3.3]) box(ctx, l, 5.2, 0.08, 0.08, '#888', 0, y, -0.5);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['interns', 'legal', 'lab', 'desk', 'vault', 'bourse'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'interns') { box(ctx, g, 0.9, 0.7, 0.5, '#F2F2F2', 0, 0.35, 0); box(ctx, g, 0.45, 0.3, 0.04, ctx.std('#22B8FF', { emissive: '#22B8FF', emissiveIntensity: 0.8 }), 0, 0.9, -0.1); person(ctx, g, 0, 0.55, '#3A6EA5'); }
    else if (id === 'legal') { cyl(ctx, g, 0.05, 0.05, 1.2, '#D9B24A', 0, 0.6, 0); box(ctx, g, 1, 0.04, 0.04, '#D9B24A', 0, 1.2, 0); for (const s of [-1, 1]) cyl(ctx, g, 0.2, 0.15, 0.06, '#D9B24A', s * 0.45, 0.9, 0); g.userData.tilt = g.children[1]; }
    else if (id === 'lab') { cyl(ctx, g, 0.1, 0.35, 0.6, ctx.std('#9FD3F2', { transparent: true, opacity: 0.5 }), 0, 0.3, 0); g.userData.orb = glow(ctx, g, 0, 0.18, 0, '#3DDC97', 0.22, 1.4); }
    else if (id === 'desk') { box(ctx, g, 1, 0.9, 0.08, ctx.std('#3DDC97', { emissive: '#3DDC97', emissiveIntensity: 0.9 }), 0, 0.9, 0); cyl(ctx, g, 0.05, 0.05, 0.5, '#333', 0, 0.25, 0); }
    else if (id === 'vault') { box(ctx, g, 0.9, 0.9, 0.9, ctx.std('#7A808E', { metalness: 0.8 }), 0, 0.45, 0); for (let j = 0; j < 3; j++) box(ctx, g, 0.35, 0.12, 0.18, ctx.std('#D9B24A', { metalness: 0.9, roughness: 0.2 }), -0.2 + j * 0.2, 0.96 + (j % 2) * 0.12, 0); }
    else { cyl(ctx, g, 0.25, 0.35, 0.8, '#1E1E28', 0, 0.4, 0); const d = mesh(ctx, new THREE.OctahedronGeometry(0.25, 0), ctx.std('#BDF0FF', { emissive: '#8AE8FF', emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.05 }), 0, 1.15, 0, g); g.userData.spin = d; }
    return shadows(g);
  };
  return {
    sky: '#3A2A5A', fog: ['#E8906A', 30, 90], light: ['#FFC8A0', '#3A2A5A', 2.2, '#FFB070', 2.1], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      tick.offset.x = t * 0.08; wheel.rotation.z = Math.sin(t * 0.6) * 1.2;
      rotors.forEach((m) => { m.rotation.y = t * 9; });
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 2; if (g.userData.orb) (g.userData.orb as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 4 + i) * 0.15); if (g.userData.tilt) (g.userData.tilt as THREE.Object3D).rotation.z = Math.sin(t * 1.5 + i) * 0.15; });
    },
  };
}

// ======================================================================================================================
// 🎡 Neon Boardwalk — a seaside pier at night, all neon and sea
// ======================================================================================================================
export function boardwalk(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  // the sea all round, then the planks of the pier
  const sea = mesh(ctx, new THREE.PlaneGeometry(160, 160), ctx.std('#0A2A4A', { roughness: 0.15, metalness: 0.3, emissive: '#06213A', emissiveIntensity: 0.6 }), 0, -0.6, 0); sea.rotation.x = -Math.PI / 2; sea.castShadow = false;
  const deck = floor(ctx, (g) => { g.fillStyle = '#6B4A33'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#7A553A' : '#5E402C'; g.fillRect(0, i * 16, 256, 15); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect((i * 53) % 256, i * 16, 2, 15); } }, 8, 40);
  deck.scale.set(1, 0.85, 1);
  // pier posts round the edge
  for (let a = 0; a < 36; a++) { const ang = (a / 36) * Math.PI * 2; cyl(ctx, ctx.root, 0.18, 0.18, 2.2, '#3A2A1E', Math.cos(ang) * 19.5, -0.4, Math.sin(ang) * 16.5); }
  // the big Ferris wheel out on the end of the pier
  const wheel = keep(new THREE.Group()); wheel.position.set(0, 9.5, -22); ctx.dyn.add(wheel);
  const neonP = ctx.std('#FF3D9A', { emissive: '#FF3D9A', emissiveIntensity: 2 }), neonC = ctx.std('#00E5FF', { emissive: '#00E5FF', emissiveIntensity: 2 }), neonY = ctx.std('#FFE14D', { emissive: '#FFE14D', emissiveIntensity: 2 });
  mesh(ctx, new THREE.TorusGeometry(8, 0.15, 8, 64), neonP, 0, 0, 0, wheel); mesh(ctx, new THREE.TorusGeometry(5, 0.1, 8, 48), neonC, 0, 0, 0, wheel);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const s = box(ctx, wheel, 0.08, 8, 0.08, neonY, Math.cos(a) * 4, Math.sin(a) * 4, 0); s.rotation.z = a + Math.PI / 2; ball(ctx, wheel, 0.45, ['#FF3D9A', '#00E5FF', '#FFE14D', '#3DDC97'][k % 4], Math.cos(a) * 8, Math.sin(a) * 8, 0); }
  for (const s of [-1, 1]) box(ctx, ctx.root, 0.4, 10, 0.4, '#2A2A3A', s * 3, 4.5, -22).rotation.z = -s * 0.3;
  // neon arches along the boardwalk
  for (const x of [-10, 10]) { const a = mesh(ctx, new THREE.TorusGeometry(2.6, 0.12, 8, 30, Math.PI), x < 0 ? neonC : neonP, x, 0, 9); a.rotation.y = Math.PI / 2; }
  const S = spots({ play: '🎯 Pinball Wizard', collect: '💰 Token chest', build: '📣 Barker stand', make: '🎁 Prize workshop', market: '🎟️ Token booth', book: '🧸 Prize shelf' });
  const lights: THREE.PointLight[] = [];
  // a pinball cabinet with a glowing backglass
  box(ctx, ctx.root, 1.6, 1, 2.4, '#2A0F3A', S.play.x, 0.9, S.play.z - 0.8); const top = box(ctx, ctx.root, 1.5, 0.05, 2.3, ctx.std('#00E5FF', { emissive: '#00E5FF', emissiveIntensity: 0.6, transparent: true, opacity: 0.7 }), S.play.x, 1.42, S.play.z - 0.8); top.rotation.x = -0.12;
  const backglass = box(ctx, ctx.root, 1.6, 1.4, 0.2, '#2A0F3A', S.play.x, 2.2, S.play.z - 2); void backglass;
  const bgMat = ctx.std('#FF3D9A', { emissive: '#FF3D9A', emissiveIntensity: 1.6 }); mesh(ctx, new THREE.PlaneGeometry(1.4, 1.2), bgMat, S.play.x, 2.2, S.play.z - 1.89, ctx.dyn);
  for (const s of [-1, 1]) for (const t2 of [-1, 1]) box(ctx, ctx.root, 0.1, 0.5, 0.1, '#111', S.play.x + s * 0.7, 0.25, S.play.z - 0.8 + t2 * 1.1);
  lamp(ctx, lights, '#FF3D9A', 16, 12, S.play.x, 3, S.play.z - 1);
  // token chest, barker stand, prize booth, token booth, prize shelf
  box(ctx, ctx.root, 1.4, 0.8, 0.9, '#8B5A2B', S.collect.x, 0.4, S.collect.z); const lid = box(ctx, ctx.root, 1.45, 0.15, 0.95, '#D9B24A', S.collect.x, 0.9, S.collect.z - 0.2); lid.rotation.x = -0.5;
  for (let k = 0; k < 10; k++) cyl(ctx, ctx.root, 0.12, 0.12, 0.04, ctx.std('#FFE14D', { metalness: 0.9, roughness: 0.2 }), S.collect.x + (r() - 0.5) * 1, 0.84, S.collect.z + (r() - 0.5) * 0.6);
  cyl(ctx, ctx.root, 0.5, 0.6, 0.6, '#C0392B', S.build.x, 0.3, S.build.z); person(ctx, ctx.root, S.build.x, S.build.z, '#C0392B', '#F2C14E'); box(ctx, ctx.root, 0.08, 0.6, 0.08, '#111', S.build.x + 0.35, 1.3, S.build.z);
  const stall = (x: number, z: number, a: string, b: string) => { box(ctx, ctx.root, 2.2, 0.9, 0.8, '#F8F8F2', x, 0.45, z); for (let k = 0; k < 6; k++) { const p = box(ctx, ctx.root, 0.4, 0.06, 1.1, k % 2 ? a : b, x - 1 + k * 0.4, 2.2, z - 0.1); p.rotation.x = 0.25; } for (const s of [-1, 1]) cyl(ctx, ctx.root, 0.05, 0.05, 2.2, '#DDD', x + s * 1.1, 1.1, z - 0.4); };
  stall(S.make.x, S.make.z, '#FF3D9A', '#FFFFFF'); stall(S.market.x, S.market.z, '#00E5FF', '#FFFFFF');
  for (let k = 0; k < 3; k++) ball(ctx, ctx.root, 0.22, ['#F2A0B0', '#BDE0FE', '#FFE14D'][k], S.make.x - 0.6 + k * 0.6, 1.12, S.make.z);
  box(ctx, ctx.root, 2.4, 1.6, 0.5, '#5A3A26', S.book.x, 0.8, S.book.z); for (let k = 0; k < 8; k++) ball(ctx, ctx.root, 0.18, ['#F2A0B0', '#BDE0FE', '#FFE14D', '#3DDC97'][k % 4], S.book.x - 0.9 + (k % 4) * 0.6, k < 4 ? 1.3 : 0.75, S.book.z + 0.15);
  const spinners: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 4; k++) { cyl(ctx, o, 0.08, 0.1, 2.6, '#2A2A3A', -2.4 + k * 1.6, 1.3, 0); glow(ctx, o, -2.4 + k * 1.6, 2.7, 0, k % 2 ? '#FFE14D' : '#00E5FF', 0.22, 1.8); }
    if (i === 1) for (let k = 0; k < 3; k++) { const x = -2.2 + k * 2.2; box(ctx, o, 1.6, 0.9, 0.8, '#F8F8F2', x, 0.45, 0); for (let j = 0; j < 4; j++) box(ctx, o, 0.4, 0.06, 1, j % 2 ? '#F2A0B0' : '#BDE0FE', x - 0.6 + j * 0.4, 1.9, 0).rotation.x = 0.25; ball(ctx, o, 0.3, '#F2A0B0', x, 1.25, 0); }
    if (i === 2) for (let k = 0; k < 3; k++) { const x = -2.2 + k * 2.2; box(ctx, o, 1.6, 2, 0.2, '#2A0F3A', x, 1, -0.4); for (let j = 0; j < 3; j++) ball(ctx, o, 0.15, ['#FF3D9A', '#00E5FF', '#FFE14D'][j], x - 0.4 + j * 0.4, 1.4, -0.25); }
    if (i === 3) { const car = keep(new THREE.Group()); o.add(car); cyl(ctx, car, 2.4, 2.4, 0.2, '#F8F8F2', 0, 0.1, 0, 20); cone(ctx, car, 2.6, 1.2, '#FF3D9A', 0, 3, 0, 12); cyl(ctx, car, 0.2, 0.2, 2.8, '#D9B24A', 0, 1.5, 0); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; cyl(ctx, car, 0.04, 0.04, 2.4, '#D9B24A', Math.cos(a) * 1.7, 1.3, Math.sin(a) * 1.7); const h = box(ctx, car, 0.25, 0.5, 0.7, ['#FFFFFF', '#F2C14E', '#BDE0FE'][k % 3], Math.cos(a) * 1.7, 0.9, Math.sin(a) * 1.7); h.rotation.y = -a; } spinners.push(car); }
    if (i === 4) { const loop = mesh(ctx, new THREE.TorusGeometry(2, 0.12, 8, 40), neonC, 0, 2.3, -0.4, o); void loop; for (const s of [-1, 1]) box(ctx, o, 0.15, 2.3, 0.15, '#DDD', s * 1.6, 1.15, -0.4); box(ctx, o, 6, 0.1, 0.5, neonP, 0, 0.3, 0.6); }
    if (i === 5) for (let k = 0; k < 5; k++) { cyl(ctx, o, 0.15, 0.15, 1, ['#FF3D9A', '#00E5FF', '#FFE14D', '#3DDC97', '#B57BFF'][k], -2.4 + k * 1.2, 0.5, 0); cone(ctx, o, 0.15, 0.3, '#FFFFFF', -2.4 + k * 1.2, 1.15, 0, 8); }
    // locked: shuttered booths
    for (let k = 0; k < 3; k++) { box(ctx, l, 1.8, 1.8, 0.15, '#4A4A5A', -2.2 + k * 2.2, 0.9, 0.6); for (let j = 0; j < 7; j++) box(ctx, l, 1.8, 0.04, 0.17, '#2A2A3A', -2.2 + k * 2.2, 0.2 + j * 0.24, 0.6); }
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['cart', 'booth', 'crane', 'signshop', 'pyro', 'wheel'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'cart') { box(ctx, g, 0.8, 0.6, 0.5, '#F2A0B0', 0, 0.5, 0); ball(ctx, g, 0.32, '#FFD1E8', 0, 1.1, 0); g.userData.orb = g.children[1]; }
    else if (id === 'booth') { for (let j = 0; j < 5; j++) { cyl(ctx, g, 0.01, 0.01, 1, '#DDD', (j - 2) * 0.15, 0.8, 0); ball(ctx, g, 0.18, ['#FF3D9A', '#00E5FF', '#FFE14D', '#3DDC97', '#B57BFF'][j], (j - 2) * 0.15, 1.35, 0); } g.userData.bob = 1; }
    else if (id === 'crane') { box(ctx, g, 0.8, 1.6, 0.8, '#FF3D9A', 0, 0.8, 0); box(ctx, g, 0.7, 0.7, 0.05, ctx.std('#BDE0FE', { transparent: true, opacity: 0.4 }), 0, 1.15, 0.41); }
    else if (id === 'signshop') { box(ctx, g, 1, 0.5, 0.08, ctx.std('#00E5FF', { emissive: '#00E5FF', emissiveIntensity: 1.6 }), 0, 1.1, 0); cyl(ctx, g, 0.04, 0.04, 0.9, '#333', 0, 0.45, 0); g.userData.flick = g.children[0]; }
    else if (id === 'pyro') { box(ctx, g, 0.8, 0.5, 0.6, '#C0392B', 0, 0.25, 0); for (let j = 0; j < 3; j++) cyl(ctx, g, 0.08, 0.08, 0.5, '#FFE14D', -0.25 + j * 0.25, 0.75, 0); }
    else { const w = keep(new THREE.Group()); w.position.y = 1; g.add(w); cyl(ctx, w, 0.6, 0.6, 0.08, '#F8F8F2', 0, 0, 0).rotation.x = Math.PI / 2; for (let j = 0; j < 8; j++) box(ctx, w, 0.04, 1.1, 0.1, ['#FF3D9A', '#FFE14D'][j % 2], 0, 0, 0.05).rotation.z = (j / 8) * Math.PI; g.userData.spin = w; cyl(ctx, g, 0.05, 0.05, 1, '#333', 0, 0.5, -0.1); }
    return shadows(g);
  };
  const fw = motes(ctx, 90, '#FFFFFF', 0.25); let fwT = 0, fwC = [0, 8, -20];
  const fwSeeds = Array.from({ length: 90 }, () => [Math.random() * Math.PI * 2, Math.random() * Math.PI, 2 + Math.random() * 2]);
  return {
    sky: '#06061A', fog: ['#0A0A28', 30, 90], light: ['#8A8AFF', '#2A1A3A', 1.6, '#FFC8F0', 1.3], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t, dt) {
      wheel.rotation.z = t * 0.12; spinners.forEach((s) => { s.rotation.y = t * 0.6; });
      neonP.emissiveIntensity = 1.6 + Math.sin(t * 4) * 0.5; neonC.emissiveIntensity = 1.6 + Math.cos(t * 3) * 0.5;
      bgMat.emissive.setHSL((t * 0.1) % 1, 0.9, 0.5);
      (sea.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(t * 0.8) * 0.15;
      // a firework every few seconds over the water
      fwT -= dt; if (fwT <= 0) { fwT = 2.5 + Math.random() * 2; fwC = [(Math.random() - 0.5) * 30, 8 + Math.random() * 6, -18 - Math.random() * 8]; fw.m.color.setHSL(Math.random(), 1, 0.6); }
      const age = 2.5 - fwT, rad = Math.min(1, age * 1.6);
      fwSeeds.forEach(([a, b, s], i) => { fw.pos[i * 3] = fwC[0] + Math.cos(a) * Math.sin(b) * s * rad * 2; fw.pos[i * 3 + 1] = fwC[1] + Math.cos(b) * s * rad * 2 - age * age * 0.8; fw.pos[i * 3 + 2] = fwC[2] + Math.sin(a) * Math.sin(b) * s * rad * 2; });
      fw.done(); fw.m.opacity = Math.max(0, 1 - age * 0.55);
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.z = t * 3; if (g.userData.bob) g.position.y = Math.sin(t * 2 + i) * 0.08; if (g.userData.flick) ((g.userData.flick as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = Math.random() < 0.03 ? 0.2 : 1.6; });
    },
  };
}

// ======================================================================================================================
// 💎 Gemheart Caverns — a vast singing cave of giant crystals and a glowing lake
// ======================================================================================================================
export function gemheart(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#1C2230'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 700; i++) { g.fillStyle = ['#232A3A', '#171C28', '#2A3244'][i % 3]; g.beginPath(); g.arc(r() * 256, r() * 256, 1 + r() * 5, 0, Math.PI * 2); g.fill(); } for (let i = 0; i < 60; i++) { g.fillStyle = ['#19D3C5', '#B57BFF', '#22B8FF'][i % 3]; g.globalAlpha = 0.5; g.fillRect(r() * 256, r() * 256, 2, 2); g.globalAlpha = 1; } }, 10);
  // the cavern wall: jagged rock and enormous crystal clusters
  const rock = ctx.std('#141826', { flatShading: true, roughness: 1 });
  around(ctx, 40, 20, 24, (x, z) => { const m = mesh(ctx, new THREE.DodecahedronGeometry(3 + r() * 3, 0), rock, x, 1.5 + r() * 3, z); m.scale.y = 1.6 + r(); m.rotation.set(r(), r(), r()); });
  const COLS = ['#19D3C5', '#B57BFF', '#22B8FF', '#3DDC97', '#FF5A7A'];
  const big: Inst[] = []; around(ctx, 26, 15, 18, (x, z, a, i) => { for (let k = 0; k < 3; k++) big.push({ x: x + (r() - 0.5) * 2, y: 1.2 + r() * 1.5, z: z + (r() - 0.5) * 2, s: 0.5 + r() * 0.8, sy: 2 + r() * 2.5, rx: (r() - 0.5) * 0.7, ry: r() * 3, c: COLS[(i + k) % 5] }); });
  scatter(ctx, new THREE.OctahedronGeometry(1, 0), ctx.std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }), big, true);
  // stalactites from the dark above
  const stal: Inst[] = []; for (let i = 0; i < 40; i++) stal.push({ x: (r() - 0.5) * 40, y: 12 - r() * 2, z: (r() - 0.5) * 34, s: 0.5 + r() * 0.6, sy: 2 + r() * 3, rx: Math.PI }); scatter(ctx, new THREE.ConeGeometry(0.6, 2, 6), rock, stal);
  const S = spots({ play: '🔔 Crystal Echo', collect: '🛒 Gem cart', build: '🔷 Crystal tablet', make: '💍 Gem bench', market: '💎 Jeweller', book: '📖 Bestiary' });
  // play: six tall crystal pillars in a ring that pulse in turn
  const pillars: THREE.MeshStandardMaterial[] = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, c = ['#B57BFF', '#22B8FF', '#3DDC97', '#FFE14D', '#FF5A7A', '#19D3C5'][k]; const m = ctx.std(c, { emissive: c, emissiveIntensity: 0.4, roughness: 0.1, transparent: true, opacity: 0.9 }); pillars.push(m); const p = mesh(ctx, new THREE.CylinderGeometry(0.01, 0.35, 2.4, 6), m, S.play.x + Math.cos(a) * 1.5, 1.2, S.play.z - 0.6 + Math.sin(a) * 1.1, ctx.dyn); void p; }
  disc(ctx, ctx.root, 1.9, ctx.std('#0E1420'), S.play.x, 0.02, S.play.z - 0.6);
  // gem cart, tablet, cutting wheel, jeweller's case, geode shelf
  box(ctx, ctx.root, 1.5, 0.7, 0.9, '#5A4A3A', S.collect.x, 0.6, S.collect.z); for (const s of [-1, 1]) for (const t2 of [-1, 1]) cyl(ctx, ctx.root, 0.2, 0.2, 0.1, '#888', S.collect.x + s * 0.5, 0.2, S.collect.z + t2 * 0.45).rotation.x = Math.PI / 2;
  const gems: Inst[] = []; for (let k = 0; k < 12; k++) gems.push({ x: S.collect.x + (r() - 0.5) * 1.1, y: 1.05, z: S.collect.z + (r() - 0.5) * 0.6, s: 0.14, c: COLS[k % 5] }); scatter(ctx, new THREE.OctahedronGeometry(1, 0), ctx.std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), gems);
  const tab = mesh(ctx, new THREE.OctahedronGeometry(0.8, 0), ctx.std('#22B8FF', { emissive: '#22B8FF', emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }), S.build.x, 1.5, S.build.z, ctx.dyn); tab.scale.set(1, 1.4, 0.3);
  cyl(ctx, ctx.root, 0.4, 0.6, 0.9, '#3A3A4A', S.make.x, 0.45, S.make.z); const cut = cyl(ctx, ctx.dyn, 0.5, 0.5, 0.08, ctx.std('#C0C4CC', { metalness: 0.9 }), S.make.x, 1.0, S.make.z); void cut;
  box(ctx, ctx.root, 2.2, 0.9, 0.8, '#2A2438', S.market.x, 0.45, S.market.z); box(ctx, ctx.root, 2.1, 0.4, 0.7, ctx.std('#BFE3FF', { transparent: true, opacity: 0.3 }), S.market.x, 1.1, S.market.z); person(ctx, ctx.root, S.market.x, S.market.z - 0.8, '#5A3A8A', '#19D3C5');
  for (let k = 0; k < 4; k++) mesh(ctx, new THREE.OctahedronGeometry(0.12, 0), ctx.std(COLS[k], { emissive: COLS[k], emissiveIntensity: 1 }), S.market.x - 0.6 + k * 0.4, 1.05, S.market.z);
  box(ctx, ctx.root, 2.2, 1.6, 0.5, '#2A2438', S.book.x, 0.8, S.book.z); for (let k = 0; k < 6; k++) { const geo = ball(ctx, ctx.root, 0.2, '#6A6A72', S.book.x - 0.75 + (k % 3) * 0.75, k < 3 ? 1.3 : 0.7, S.book.z + 0.1); void geo; glow(ctx, ctx.root, S.book.x - 0.75 + (k % 3) * 0.75, k < 3 ? 1.3 : 0.7, S.book.z + 0.25, COLS[k % 5], 0.11, 1.5); }
  const lights: THREE.PointLight[] = [];
  lamp(ctx, lights, '#19D3C5', 18, 14, 0, 4, -5); lamp(ctx, lights, '#B57BFF', 14, 12, -8, 3, 3); lamp(ctx, lights, '#22B8FF', 14, 12, 8, 3, 3);
  const hearts: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 3; k++) mesh(ctx, new THREE.TorusGeometry(1.8, 0.35, 8, 20, Math.PI), rock, 0, 0, -0.6 + k * 0.9, o);
    if (i === 1) for (let k = 0; k < 12; k++) { const c = mesh(ctx, new THREE.OctahedronGeometry(0.3 + r() * 0.4, 0), ctx.std('#B57BFF', { emissive: '#B57BFF', emissiveIntensity: 0.8 }), -2.5 + r() * 5, 0.4 + r(), -1 + r() * 2, o); c.scale.y = 2; c.rotation.z = (r() - 0.5) * 0.6; }
    if (i === 2) { disc(ctx, o, 2.6, ctx.std('#1E7AFF', { emissive: '#1E7AFF', emissiveIntensity: 1.1, roughness: 0.05, metalness: 0.4 }), 0, 0.03, 0); for (let k = 0; k < 6; k++) mesh(ctx, new THREE.OctahedronGeometry(0.22, 0), ctx.std('#BDE0FE', { emissive: '#BDE0FE', emissiveIntensity: 0.6 }), Math.cos(k) * 2.8, 0.25, Math.sin(k) * 2.8, o); }
    if (i === 3) { box(ctx, o, 4, 4, 0.8, rock, 0, 2, -1); const fall = mesh(ctx, new THREE.PlaneGeometry(1.4, 3.8), ctx.std('#3DDC97', { emissive: '#3DDC97', emissiveIntensity: 1, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 0, 1.9, -0.55, o); void fall; disc(ctx, o, 1.4, ctx.std('#3DDC97', { emissive: '#1E8A4A', emissiveIntensity: 0.8 }), 0, 0.03, 0.4); }
    if (i === 4) { disc(ctx, o, 1.8, ctx.std('#FF4D00', { emissive: '#FF4D00', emissiveIntensity: 1.8 }), 0, 0.03, 0); for (let k = 0; k < 8; k++) { const m = mesh(ctx, new THREE.DodecahedronGeometry(0.4, 0), rock, Math.cos(k * 0.8) * 2.2, 0.2, Math.sin(k * 0.8) * 2.2, o); void m; } for (let k = 0; k < 4; k++) mesh(ctx, new THREE.OctahedronGeometry(0.3, 0), ctx.std('#FF2D55', { emissive: '#FF2D55', emissiveIntensity: 1.2 }), -1 + k * 0.7, 0.5, -1.6, o); }
    if (i === 5) { const h = keep(new THREE.Group()); h.position.set(0, 2.4, -0.4); o.add(h); mesh(ctx, new THREE.IcosahedronGeometry(0.9, 0), ctx.std('#FFFFFF', { emissive: '#FFE14D', emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.1 }), 0, 0, 0, h); for (let k = 0; k < 3; k++) { const ring = mesh(ctx, new THREE.TorusGeometry(1.4 + k * 0.35, 0.04, 6, 40), ctx.std(COLS[k], { emissive: COLS[k], emissiveIntensity: 1.5 }), 0, 0, 0, h); ring.rotation.set(k, k * 2, 0); } hearts.push(h); }
    // locked: a cave-in of rubble studded with dull crystals
    for (let k = 0; k < 10; k++) { const m = mesh(ctx, new THREE.DodecahedronGeometry(0.6 + r() * 0.5, 0), rock, -3 + k * 0.65, 0.5 + r() * 0.8, 0.6 + r() * 0.4, l); m.rotation.set(r(), r(), r()); }
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['cracker', 'harp', 'lakepump', 'vines', 'forge', 'core'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'cracker') { ball(ctx, g, 0.35, '#6A6A72', 0, 0.3, 0); mesh(ctx, new THREE.OctahedronGeometry(0.15, 0), ctx.std('#B57BFF', { emissive: '#B57BFF', emissiveIntensity: 1 }), 0, 0.4, 0.3, g); const hm = box(ctx, g, 0.08, 0.6, 0.08, '#6B4A33', 0.4, 0.7, 0); g.userData.swing = hm; }
    else if (id === 'harp') { mesh(ctx, new THREE.TorusGeometry(0.5, 0.05, 6, 20, Math.PI), ctx.std('#C9A04A', { metalness: 0.8 }), 0, 0.5, 0, g); for (let j = 0; j < 5; j++) box(ctx, g, 0.02, 0.4 + j * 0.06, 0.02, ctx.std('#B57BFF', { emissive: '#B57BFF', emissiveIntensity: 1.2 }), -0.3 + j * 0.15, 0.55 + j * 0.03, 0); g.userData.pulse = 1; }
    else if (id === 'lakepump') { cyl(ctx, g, 0.3, 0.35, 0.8, '#4A5060', 0, 0.4, 0); cyl(ctx, g, 0.06, 0.06, 0.9, '#22B8FF', 0.4, 0.45, 0).rotation.z = 0.8; g.userData.orb = glow(ctx, g, 0, 0.9, 0, '#22B8FF', 0.15); }
    else if (id === 'vines') { for (let j = 0; j < 4; j++) { cyl(ctx, g, 0.03, 0.03, 1 + j * 0.2, '#2E7D4A', (j - 1.5) * 0.2, 0.5 + j * 0.1, 0).rotation.z = (j - 1.5) * 0.2; mesh(ctx, new THREE.OctahedronGeometry(0.1, 0), ctx.std('#3DDC97', { emissive: '#3DDC97', emissiveIntensity: 1.2 }), (j - 1.5) * 0.3, 1.1 + j * 0.1, 0, g); } }
    else if (id === 'forge') { cyl(ctx, g, 0.45, 0.55, 0.7, '#3A3A4A', 0, 0.35, 0); g.userData.orb = glow(ctx, g, 0, 0.72, 0, '#FF4D00', 0.3, 2); }
    else { const c = mesh(ctx, new THREE.IcosahedronGeometry(0.3, 0), ctx.std('#19D3C5', { emissive: '#19D3C5', emissiveIntensity: 1.5 }), 0, 1, 0, g); g.userData.spin = c; cyl(ctx, g, 0.3, 0.4, 0.5, '#2A2438', 0, 0.25, 0); }
    return shadows(g);
  };
  const sparkle = motes(ctx, 140, '#BDF0FF', 0.08);
  for (let i = 0; i < 140; i++) { sparkle.pos[i * 3] = (r() - 0.5) * 34; sparkle.pos[i * 3 + 1] = r() * 8; sparkle.pos[i * 3 + 2] = (r() - 0.5) * 28; } sparkle.done();
  return {
    sky: '#05070D', fog: ['#05070D', 24, 64], light: ['#7FE8FF', '#1C2230', 1.7, '#BDF0FF', 1.2], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      // the pillars chime one after another
      pillars.forEach((m, k) => { m.emissiveIntensity = 0.3 + Math.max(0, Math.sin(t * 2.2 - k * 1.05)) * 1.6; });
      tab.rotation.y = t * 0.6; hearts.forEach((h) => { h.rotation.y = t * 0.5; h.position.y = 2.4 + Math.sin(t * 1.3) * 0.2; });
      sparkle.m.opacity = 0.5 + Math.sin(t * 2) * 0.3; sparkle.pts.rotation.y = t * 0.02;
      lights.forEach((l, i) => { l.intensity = 14 + Math.sin(t * 1.4 + i * 2) * 3; });
      ups.forEach((g, i) => { if (g.userData.spin) (g.userData.spin as THREE.Object3D).rotation.y = t * 2; if (g.userData.swing) (g.userData.swing as THREE.Object3D).rotation.z = Math.sin(t * 7 + i) * 0.8; if (g.userData.orb) (g.userData.orb as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 5 + i) * 0.2); if (g.userData.pulse) g.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.03); });
    },
  };
}
