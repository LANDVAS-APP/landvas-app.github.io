// Domain worlds, part 1: 🌌 Starlight Museum · 🦢 Spirit Lake Sanctuary · 🏰 Harvest Kingdom · 🏢 Megacorp Spire ·
// 🛸 Neon Galaxy Park · 🌋 World's Core. Same realm layout; each a grand place unlike any Estate.
import { motes } from '../../home/live3d/kit3d';
import type { RealmEnv } from '../realm3d';
import { BOUNDS, THREE, around, ball, box, cone, cyl, disc, floor, glow, keep, lamp, mesh, person, prodGroup, scatter, shadows, spots, zones, type Ctx, type Inst } from './envKit';

/** the shared little animations producers use: spin, pulse, bob, sway */
export function animate(ups: THREE.Object3D[], t: number) {
  ups.forEach((g, i) => {
    const u = g.userData;
    if (u.spin) (u.spin as THREE.Object3D).rotation.y = t * (u.spinSpeed ?? 2);
    if (u.spinZ) (u.spinZ as THREE.Object3D).rotation.z = t * 2;
    if (u.orb) (u.orb as THREE.Object3D).scale.setScalar(1 + Math.sin(t * 3 + i) * 0.18);
    if (u.bob) (u.bob as THREE.Object3D).position.y = (u.bobY ?? 0.5) + Math.sin(t * 2.4 + i) * 0.12;
    if (u.sway) (u.sway as THREE.Object3D).rotation.z = Math.sin(t * 1.6 + i) * 0.15;
  });
}

// ======================================================================================================================
// 🌌 Starlight Museum — a black-marble museum under an open night sky
// ======================================================================================================================
export function museum(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#0E1028'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#14183A' : '#0A0C20'; g.fillRect(x * 64, y * 64, 64, 64); } g.strokeStyle = 'rgba(200,210,255,0.25)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); } for (let i = 0; i < 80; i++) { g.fillStyle = '#C3D0FF'; g.fillRect(r() * 256, r() * 256, 1, 1); } }, 10, 70, 0.3);
  const marble = ctx.std('#1A1D3A', { roughness: 0.2, metalness: 0.3 }), silver = ctx.std('#C3D0FF', { metalness: 0.9, roughness: 0.2 });
  // a ring of tall obsidian pillars, each topped by a glowing star
  around(ctx, 18, 20, 21, (x, z) => { box(ctx, ctx.root, 1.2, 9, 1.2, marble, x, 4.5, z); glow(ctx, ctx.root, x, 9.5, z, '#C3D0FF', 0.4, 2); });
  // a huge glass dome rib overhead
  for (let i = 0; i < 8; i++) { const rib = mesh(ctx, new THREE.TorusGeometry(22, 0.12, 6, 48, Math.PI), silver, 0, 0, 0); rib.rotation.y = (i / 8) * Math.PI; rib.castShadow = false; }
  const S = spots({ play: '✴️ Constellation', collect: '🔭 Star cart', build: '📋 Curator’s board', make: '🖌️ Star studio', market: '🍷 Patron’s salon', book: '📖 Night catalogue' });
  const lights: THREE.PointLight[] = [];
  // play: a giant floating armillary sphere of rings
  const arm = new THREE.Group(); arm.position.set(S.play.x, 2.8, S.play.z - 0.6); ctx.dyn.add(arm);
  const rings: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) { const m = mesh(ctx, new THREE.TorusGeometry(1.4 - k * 0.25, 0.06, 8, 40), ctx.std(['#FFE14D', '#C3D0FF', '#6C7BFF'][k], { metalness: 0.8, roughness: 0.2, emissive: ['#806010', '#303060', '#202060'][k], emissiveIntensity: 0.6 }), 0, 0, 0, arm); rings.push(m); }
  glow(ctx, arm, 0, 0, 0, '#FFFFFF', 0.3, 2.4);
  cyl(ctx, ctx.root, 0.5, 0.7, 1, marble, S.play.x, 0.5, S.play.z - 0.6);
  lamp(ctx, lights, '#9AAEFF', 14, 14, S.play.x, 3, S.play.z);
  // a brass telescope cart, a curator's lectern, a star easel, a velvet salon, a glass case
  box(ctx, ctx.root, 1.4, 0.6, 0.9, '#3A2A50', S.collect.x, 0.5, S.collect.z); const tel = cyl(ctx, ctx.root, 0.12, 0.2, 1.6, silver, S.collect.x, 1.4, S.collect.z); tel.rotation.z = 0.8;
  box(ctx, ctx.root, 0.9, 1.2, 0.5, marble, S.build.x, 0.6, S.build.z); box(ctx, ctx.root, 1.1, 0.06, 0.7, '#C3D0FF', S.build.x, 1.25, S.build.z).rotation.x = -0.3;
  for (const s of [-1, 1]) box(ctx, ctx.root, 0.07, 2.2, 0.07, silver, S.make.x + s * 0.5, 1.1, S.make.z).rotation.z = -s * 0.1;
  box(ctx, ctx.root, 1.2, 1.2, 0.06, ctx.std('#1A1450', { emissive: '#4A3AA0', emissiveIntensity: 0.6 }), S.make.x, 1.5, S.make.z + 0.05);
  box(ctx, ctx.root, 2, 0.5, 0.9, '#6B1A3A', S.market.x, 0.25, S.market.z); box(ctx, ctx.root, 2, 0.8, 0.2, '#6B1A3A', S.market.x, 0.7, S.market.z - 0.4); person(ctx, ctx.root, S.market.x + 1.3, S.market.z, '#1A1D3A', '#C3D0FF');
  box(ctx, ctx.root, 1.8, 1, 0.8, marble, S.book.x, 0.5, S.book.z); box(ctx, ctx.root, 1.7, 0.7, 0.7, ctx.std('#BFE3FF', { transparent: true, opacity: 0.25 }), S.book.x, 1.35, S.book.z);
  const comets: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 5; k++) { box(ctx, o, 0.9, 1.1, 0.9, marble, -2.4 + k * 1.2, 0.55, 0); glow(ctx, o, -2.4 + k * 1.2, 1.4, 0, ['#FFE14D', '#C3D0FF', '#FF8AD8', '#8AF0FF', '#B8A8FF'][k], 0.22, 2); }
    if (i === 1) { const orr = keep(new THREE.Group()); orr.position.set(0, 1.4, 0); o.add(orr); ball(ctx, orr, 0.5, ctx.std('#FFB020', { emissive: '#FFB020', emissiveIntensity: 1.5 })); for (let k = 0; k < 4; k++) { const arm2 = new THREE.Group(); orr.add(arm2); arm2.rotation.y = k * 1.7; box(ctx, arm2, 0.9 + k * 0.6, 0.03, 0.03, silver, (0.9 + k * 0.6) / 2); ball(ctx, arm2, 0.14 + k * 0.03, ['#6C9BFF', '#FF8AD8', '#7CE0B0', '#C9A6FF'][k], 0.9 + k * 0.6); } orr.userData.spinY = 0.6; comets.push(orr); }
    if (i === 2) for (let k = 0; k < 6; k++) { const c = ['#3DDC97', '#00E5FF', '#B36BFF', '#FF6FA8', '#3DDC97', '#00E5FF'][k]; const m = box(ctx, o, 0.8, 3.4, 0.04, ctx.std(c, { transparent: true, opacity: 0.4, emissive: c, emissiveIntensity: 1.2, side: THREE.DoubleSide }), -2.5 + k, 2.2, Math.sin(k) * 0.4); m.rotation.y = k * 0.3; m.castShadow = false; }
    if (i === 3) for (let k = 0; k < 3; k++) { cyl(ctx, o, 0.5, 0.6, 1.1, marble, -2 + k * 2, 0.55, 0); ball(ctx, o, 0.55, ctx.std('#E8E6F0', { roughness: 0.9 }), -2 + k * 2, 1.7, 0); }
    if (i === 4) { const c = keep(new THREE.Group()); c.position.set(0, 2.6, 0); o.add(c); ball(ctx, c, 0.45, ctx.std('#9AE6FF', { emissive: '#9AE6FF', emissiveIntensity: 1.8 })); cone(ctx, c, 0.4, 2.6, ctx.std('#C3D0FF', { transparent: true, opacity: 0.4, emissive: '#C3D0FF', emissiveIntensity: 1 }), 1.3, 0, 0).rotation.z = Math.PI / 2; c.userData.bob = 1; comets.push(c); }
    if (i === 5) { const dome = mesh(ctx, new THREE.SphereGeometry(2.6, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#1A1450', { transparent: true, opacity: 0.55, emissive: '#3A2AA0', emissiveIntensity: 0.8, side: THREE.DoubleSide }), 0, 0, -0.4, o); dome.castShadow = false; for (let k = 0; k < 14; k++) glow(ctx, o, (r() - 0.5) * 4, 0.5 + r() * 2, -0.4 + (r() - 0.5) * 3, '#FFFFFF', 0.06, 2.4); }
    // locked: velvet ropes and a "closed for the night" screen
    box(ctx, l, 6, 2.6, 0.12, '#14183A', 0, 1.3, 0); for (let k = 0; k < 6; k++) glow(ctx, l, -2.5 + k, 2.3, 0.08, '#C3D0FF', 0.05, 1);
    for (const s of [-1, 0, 1]) cyl(ctx, l, 0.06, 0.08, 1, silver, s * 2.6, 0.5, 1.1); box(ctx, l, 5.2, 0.06, 0.06, '#8B1E3F', 0, 0.9, 1.1);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['telescope', 'inkwell', 'prism', 'quarry', 'catcher', 'vault'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'telescope') { for (const a of [0, 2.1, 4.2]) box(ctx, g, 0.04, 0.9, 0.04, silver, Math.cos(a) * 0.2, 0.45, Math.sin(a) * 0.2).rotation.z = Math.cos(a) * 0.2; const t = cyl(ctx, g, 0.1, 0.16, 1.1, '#C9A64A', 0, 1, 0); t.rotation.z = 0.9; g.userData.sway = t; }
    else if (id === 'inkwell') { cyl(ctx, g, 0.35, 0.45, 0.5, '#0A0C20', 0, 0.25, 0); disc(ctx, g, 0.3, ctx.std('#1A1450', { emissive: '#4A3AA0', emissiveIntensity: 1.2 }), 0, 0.51, 0); g.userData.orb = glow(ctx, g, 0, 0.7, 0, '#B8A8FF', 0.1, 2); }
    else if (id === 'prism') { const p = cone(ctx, g, 0.4, 1, ctx.std('#E8F4FF', { transparent: true, opacity: 0.7, emissive: '#B36BFF', emissiveIntensity: 0.6 }), 0, 0.8, 0, 3); g.userData.spin = p; cyl(ctx, g, 0.3, 0.35, 0.3, marble, 0, 0.15, 0); }
    else if (id === 'quarry') { for (let j = 0; j < 4; j++) ball(ctx, g, 0.25 + j * 0.05, '#E8E6F0', (j - 1.5) * 0.35, 0.2, (j % 2) * 0.3); }
    else if (id === 'catcher') { cyl(ctx, g, 0.05, 0.05, 1.6, silver, 0, 0.8, 0); const n = mesh(ctx, new THREE.TorusGeometry(0.4, 0.04, 6, 20), silver, 0, 1.7, 0, g); g.userData.spin = n; g.userData.orb = glow(ctx, g, 0, 1.7, 0, '#9AE6FF', 0.12, 2); }
    else { box(ctx, g, 0.9, 1, 0.9, marble, 0, 0.5, 0); g.userData.orb = glow(ctx, g, 0, 1.3, 0, '#FF8AD8', 0.2, 2.2); }
    return shadows(g);
  };
  const stars = motes(ctx, 300, '#FFFFFF', 0.1);
  for (let i = 0; i < 300; i++) { const a = r() * Math.PI * 2, e = r() * 1.2 + 0.2, d = 40; stars.pos[i * 3] = Math.cos(a) * Math.cos(e) * d; stars.pos[i * 3 + 1] = Math.sin(e) * d; stars.pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * d; } stars.done();
  return {
    sky: '#03041A', fog: ['#03041A', 30, 80], light: ['#B8C4FF', '#1A1450', 1.7, '#D0D8FF', 1.3], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      rings.forEach((m, k) => { m.rotation.x = t * (0.4 + k * 0.3); m.rotation.y = t * (0.3 + k * 0.2); });
      arm.position.y = 2.8 + Math.sin(t * 1.2) * 0.15; stars.pts.rotation.y = t * 0.004;
      comets.forEach((c) => { if (c.userData.spinY) c.rotation.y = t * c.userData.spinY; if (c.userData.bob) c.position.y = 2.6 + Math.sin(t * 1.5) * 0.3; });
      animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 🦢 Spirit Lake Sanctuary — a misty lake at dawn, the walk is a jetty over the water
// ======================================================================================================================
export function sanctuary(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  // the whole place is a lake; the middle is a wide wooden deck
  const water = mesh(ctx, new THREE.PlaneGeometry(90, 90), ctx.std('#3B7EA1', { roughness: 0.08, metalness: 0.3, emissive: '#0E2A40', emissiveIntensity: 0.4 }), 0, -0.05, 0); water.rotation.x = -Math.PI / 2; water.castShadow = false;
  const deck = ctx.tex(256, 256, (g) => { g.fillStyle = '#9C7A55'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#8E6E4A' : '#A9865E'; g.fillRect(0, i * 16, 256, 15); } }, 6);
  const dk = mesh(ctx, new THREE.BoxGeometry(22, 0.3, 17), ctx.std('#ffffff', { map: deck }), 0, 0, 0); dk.receiveShadow = true;
  for (let x = -10; x <= 10; x += 4) for (const z of [-8.2, 8.2]) cyl(ctx, ctx.root, 0.18, 0.18, 1.6, '#6B4A2A', x, 0, z);
  // reeds and lily pads round the edge, misty hills far off
  const reeds: Inst[] = []; around(ctx, 160, 13, 22, (x, z) => reeds.push({ x, y: 0.7, z, s: 0.5 + r() * 0.4, sy: 1 + r(), c: ['#5E8A3A', '#7AA04A', '#4A6E2A'][Math.floor(r() * 3)] }));
  scatter(ctx, new THREE.CylinderGeometry(0.03, 0.05, 1.6, 4), ctx.std('#ffffff'), reeds);
  const pads: Inst[] = []; for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = 12 + r() * 10; pads.push({ x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d * 0.9, s: 0.4 + r() * 0.4, c: '#3E8A4A' }); }
  scatter(ctx, new THREE.CylinderGeometry(1, 1, 0.04, 12), ctx.std('#ffffff'), pads);
  around(ctx, 9, 34, 38, (x, z) => { const h = ball(ctx, ctx.root, 7 + r() * 4, ctx.std('#7A9AB8', { roughness: 1 }), x, -2, z); h.scale.y = 0.5; h.castShadow = false; });
  const S = spots({ play: '🎣 Spirit Angler', collect: '🧺 Creel basket', build: '📋 Warden’s board', make: '🛶 Boathouse', market: '🏮 Lakeside market', book: '📖 Spirit bestiary' });
  const lights: THREE.PointLight[] = [];
  // play: a fishing pier end with a rod and a bobbing float
  box(ctx, ctx.root, 2.4, 0.3, 2.4, '#7A5A3A', S.play.x, 0.1, S.play.z - 1.2);
  const rod = cyl(ctx, ctx.root, 0.03, 0.05, 3, '#5A3A20', S.play.x + 0.4, 1.4, S.play.z - 1.4); rod.rotation.x = -0.9;
  const float = ball(ctx, ctx.dyn, 0.12, ctx.std('#FF3B3B', { emissive: '#FF3B3B', emissiveIntensity: 0.6 }), S.play.x + 0.4, 0.05, S.play.z - 4);
  // the swans glide round the deck
  const swans: THREE.Group[] = [];
  for (let k = 0; k < 4; k++) { const s = new THREE.Group(); ctx.dyn.add(s); const b = ball(ctx, s, 0.4, '#FFFFFF', 0, 0.2, 0); b.scale.set(1.4, 0.7, 0.8); const n = cyl(ctx, s, 0.06, 0.09, 0.7, '#FFFFFF', 0.4, 0.55, 0); n.rotation.z = -0.3; ball(ctx, s, 0.13, '#FFFFFF', 0.5, 0.92, 0); cone(ctx, s, 0.05, 0.18, '#FF8A2A', 0.62, 0.9, 0).rotation.z = -Math.PI / 2; swans.push(s); }
  cyl(ctx, ctx.root, 0.5, 0.4, 0.6, '#B08A55', S.collect.x, 0.45, S.collect.z);
  box(ctx, ctx.root, 0.1, 1.6, 0.1, '#6B4A2A', S.build.x, 0.95, S.build.z); box(ctx, ctx.root, 1.3, 0.8, 0.06, '#D8E8F0', S.build.x, 1.6, S.build.z);
  const boat = ball(ctx, ctx.root, 0.6, '#8B5A2B', S.make.x, 0.3, S.make.z); boat.scale.set(2.2, 0.5, 0.9); box(ctx, ctx.root, 2, 1.6, 0.1, '#5A3A20', S.make.x, 1, S.make.z - 0.8);
  box(ctx, ctx.root, 1.8, 0.9, 0.8, '#7A5A3A', S.market.x, 0.6, S.market.z); for (let k = 0; k < 3; k++) { glow(ctx, ctx.root, S.market.x - 0.7 + k * 0.7, 2.2, S.market.z, '#FFB84D', 0.16, 1.6); } lamp(ctx, lights, '#FFB84D', 8, 10, S.market.x, 2.2, S.market.z);
  box(ctx, ctx.root, 1.4, 0.4, 0.8, '#5A3A20', S.book.x, 0.35, S.book.z); box(ctx, ctx.root, 1.2, 0.06, 0.6, '#E8D9A8', S.book.x, 0.6, S.book.z);
  const spirits: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 30; k++) cyl(ctx, o, 0.03, 0.05, 1.4 + r(), '#7AA04A', -2.6 + r() * 5.2, 0.7, -1 + r() * 2);
    if (i === 1) for (let k = 0; k < 10; k++) { const x = -2.6 + r() * 5.2, z = -1 + r() * 2; cyl(ctx, o, 0.4, 0.4, 0.04, '#3E8A4A', x, 0.02, z); ball(ctx, o, 0.14, ['#FF8AD8', '#FFFFFF', '#FFE14D'][k % 3], x, 0.14, z); }
    if (i === 2) { const isle = ball(ctx, o, 2, '#5E8A3A', 0, -1.2, 0); isle.scale.y = 0.6; cyl(ctx, o, 0.15, 0.2, 2, '#6B4A2A', 0.6, 0.8, 0); ball(ctx, o, 0.9, '#3E7D3A', 0.6, 2.2, 0); const heron = new THREE.Group(); heron.position.set(-0.6, 0, 0.4); o.add(heron); cyl(ctx, heron, 0.02, 0.02, 0.8, '#E8C35A', 0, 0.4, 0); ball(ctx, heron, 0.25, '#9AA0B0', 0, 0.95, 0).scale.set(1.4, 0.8, 0.7); cyl(ctx, heron, 0.04, 0.04, 0.6, '#9AA0B0', 0.25, 1.3, 0).rotation.z = -0.3; }
    if (i === 3) for (let k = 0; k < 6; k++) { const m = ball(ctx, o, 1 + r() * 0.6, ctx.std('#E8F0F8', { transparent: true, opacity: 0.35, roughness: 1, depthWrite: false }), -2.4 + k, 0.8 + r(), (r() - 0.5) * 2); m.castShadow = false; }
    if (i === 4) for (let k = 0; k < 5; k++) { const sh = ball(ctx, o, 0.35, '#B0A8A0', -2.2 + k * 1.1, 0.15, 0); sh.scale.y = 0.4; glow(ctx, o, -2.2 + k * 1.1, 0.3, 0, '#FFF4E8', 0.1, 1.8); }
    if (i === 5) { disc(ctx, o, 2.2, ctx.std('#8AF0FF', { emissive: '#8AF0FF', emissiveIntensity: 1.4, transparent: true, opacity: 0.8 }), 0, 0.06, 0); const sp = keep(new THREE.Group()); o.add(sp); for (let k = 0; k < 8; k++) glow(ctx, sp, Math.cos(k) * 1.6, 1 + (k % 3) * 0.6, Math.sin(k) * 1.6, '#C8FFFF', 0.14, 2.4); spirits.push(sp); }
    // locked: a thick bank of fog and a rope
    for (let k = 0; k < 5; k++) { const m = ball(ctx, l, 1.4, ctx.std('#DDE6EE', { transparent: true, opacity: 0.6, roughness: 1, depthWrite: false }), -2.6 + k * 1.3, 1, 0); m.castShadow = false; }
    for (const s of [-1, 1]) cyl(ctx, l, 0.1, 0.1, 1.4, '#6B4A2A', s * 3, 0.7, 1.4); box(ctx, l, 6, 0.05, 0.05, '#C9A06A', 0, 1.1, 1.4);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['reedbed', 'lilypond', 'shoal', 'fogbank', 'oysterbed', 'wellspring'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'reedbed') for (let j = 0; j < 8; j++) cyl(ctx, g, 0.02, 0.04, 1.2, '#7AA04A', (r() - 0.5) * 0.8, 0.6, (r() - 0.5) * 0.8);
    else if (id === 'lilypond') { cyl(ctx, g, 0.6, 0.6, 0.04, '#3E8A4A', 0, 0.03, 0); g.userData.bob = ball(ctx, g, 0.16, '#FF8AD8', 0, 0.2, 0); g.userData.bobY = 0.2; }
    else if (id === 'shoal') { const s = new THREE.Group(); g.add(s); for (let j = 0; j < 5; j++) { const f = ball(ctx, s, 0.1, '#C0D8E8', Math.cos(j * 1.2) * 0.5, 0.1, Math.sin(j * 1.2) * 0.5); f.scale.set(1.8, 0.6, 0.6); } g.userData.spin = s; }
    else if (id === 'fogbank') { const m = ball(ctx, g, 0.6, ctx.std('#E8F0F8', { transparent: true, opacity: 0.5, depthWrite: false }), 0, 0.6, 0); g.userData.orb = m; }
    else if (id === 'oysterbed') { const sh = ball(ctx, g, 0.4, '#B0A8A0', 0, 0.15, 0); sh.scale.y = 0.4; g.userData.orb = glow(ctx, g, 0, 0.3, 0.1, '#FFF4E8', 0.1, 2); }
    else { disc(ctx, g, 0.55, ctx.std('#8AF0FF', { emissive: '#8AF0FF', emissiveIntensity: 1.6 }), 0, 0.05, 0); g.userData.bob = glow(ctx, g, 0, 0.6, 0, '#C8FFFF', 0.14, 2.4); g.userData.bobY = 0.6; }
    return shadows(g);
  };
  const mist = motes(ctx, 140, '#DDF4FF', 0.22);
  for (let i = 0; i < 140; i++) { mist.pos[i * 3] = (r() - 0.5) * 40; mist.pos[i * 3 + 1] = 0.3 + r() * 2; mist.pos[i * 3 + 2] = (r() - 0.5) * 34; } mist.done();
  return {
    sky: '#CFE0EA', fog: ['#CFE0EA', 22, 70], light: ['#FFF2E0', '#5A8AA8', 2.2, '#FFE8CF', 1.8], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      float.position.y = 0.05 + Math.sin(t * 2.5) * 0.06;
      swans.forEach((s, k) => { const a = t * 0.08 + k * (Math.PI / 2), d = 11.5 + (k % 2); s.position.set(Math.cos(a) * d, 0, Math.sin(a) * d * 0.85); s.rotation.y = -a - Math.PI / 2 * 0; s.rotation.y = Math.atan2(-Math.cos(a), Math.sin(a) * 0.85) + Math.PI / 2; });
      spirits.forEach((s) => { s.rotation.y = t * 0.5; s.position.y = Math.sin(t) * 0.2; });
      mist.pts.rotation.y = t * 0.01; (water.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.sin(t * 0.5) * 0.08;
      animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 🏰 Harvest Kingdom — a sunny walled kingdom with a castle on the hill
// ======================================================================================================================
export function kingdom(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#A89070'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { g.fillStyle = ['#B09878', '#9C8466', '#B8A080'][(x * 7 + y * 3) % 3]; g.beginPath(); g.roundRect(x * 32 + (y % 2) * 16 + 1, y * 16 + 1, 30, 14, 4); g.fill(); } }, 10, 70, 1);
  // golden fields beyond the walls
  const field = mesh(ctx, new THREE.RingGeometry(26, 60, 48), ctx.std('#E0B84A'), 0, 0.01, 0); field.rotation.x = -Math.PI / 2; field.castShadow = false;
  const stone = ctx.std('#C9B89A', { roughness: 1 }), roofMat = ctx.std('#2A4A9A'), banner = ctx.std('#D99A2B');
  // crenellated walls with round towers
  around(ctx, 16, 22, 22, (x, z, a) => { const w = box(ctx, ctx.root, 8.4, 3.4, 1, stone, x, 1.7, z); w.rotation.y = -a + Math.PI / 2; for (let k = -3; k <= 3; k++) { const m = box(ctx, ctx.root, 0.6, 0.6, 1, stone, x + Math.cos(a + Math.PI / 2) * k * 1.2, 3.7, z + Math.sin(a + Math.PI / 2) * k * 1.2); m.rotation.y = -a + Math.PI / 2; } });
  around(ctx, 8, 23, 23, (x, z) => { cyl(ctx, ctx.root, 1.6, 1.8, 6, stone, x, 3, z); cone(ctx, ctx.root, 2, 3, roofMat, x, 7.5, z, 12); box(ctx, ctx.root, 0.04, 1.2, 0.9, banner, x, 9.6, z + 0.45); });
  // the castle keep, far behind the play spot
  box(ctx, ctx.root, 8, 9, 4, stone, 0, 4.5, -19); for (const s of [-1, 1]) { cyl(ctx, ctx.root, 1.6, 1.6, 12, stone, s * 4.5, 6, -19); cone(ctx, ctx.root, 2, 4, roofMat, s * 4.5, 14, -19, 12); } cone(ctx, ctx.root, 3, 5, roofMat, 0, 11.5, -19, 4).rotation.y = Math.PI / 4;
  const S = spots({ play: '🚜 Plough Run', collect: '🧺 Harvest cart', build: '📜 Royal decrees', make: '🍞 Royal kitchens', market: '🎪 Kingdom fair', book: '👑 Royal treasury' });
  // play: a red tractor beside a ploughed patch
  const patch = ctx.tex(128, 128, (g) => { g.fillStyle = '#6B4426'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#7A4E2D'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 16, 128, 8); }, 1);
  const p = mesh(ctx, new THREE.PlaneGeometry(4, 2.4), ctx.std('#ffffff', { map: patch }), S.play.x, 0.03, S.play.z - 0.8); p.rotation.x = -Math.PI / 2; p.castShadow = false;
  const tractor = new THREE.Group(); tractor.position.set(S.play.x, 0, S.play.z - 0.8); ctx.dyn.add(tractor);
  box(ctx, tractor, 1.2, 0.6, 0.8, '#D93A2A', 0, 0.7, 0); box(ctx, tractor, 0.6, 0.6, 0.7, '#D93A2A', -0.3, 1.25, 0); cyl(ctx, tractor, 0.08, 0.08, 0.5, '#333', 0.4, 1.2, 0);
  for (const [x, rr] of [[-0.4, 0.5], [0.5, 0.3]]) for (const s of [-1, 1]) cyl(ctx, tractor, rr, rr, 0.25, '#222', x, rr, s * 0.5).rotation.x = Math.PI / 2;
  // a wooden cart, a decree post, a bread oven, a fair tent, a crown on a cushion
  box(ctx, ctx.root, 1.6, 0.5, 1, '#8B5A2B', S.collect.x, 0.6, S.collect.z); const wheat: Inst[] = []; for (let k = 0; k < 20; k++) wheat.push({ x: S.collect.x + (r() - 0.5) * 1.3, y: 1.05, z: S.collect.z + (r() - 0.5) * 0.8, s: 0.12, sy: 0.4, c: '#E8C35A' }); scatter(ctx, new THREE.CylinderGeometry(0.4, 0.4, 2, 5), ctx.std('#ffffff'), wheat);
  for (const s of [-1, 1]) cyl(ctx, ctx.root, 0.2, 0.2, 0.8, '#222', S.collect.x + s * 0.7, 0.3, S.collect.z + 0.55).rotation.x = Math.PI / 2;
  cyl(ctx, ctx.root, 0.08, 0.08, 2, '#6B4A2A', S.build.x, 1, S.build.z); box(ctx, ctx.root, 1, 1.2, 0.04, '#F2E6C8', S.build.x, 1.4, S.build.z + 0.06);
  const oven = mesh(ctx, new THREE.SphereGeometry(0.9, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#B5654A'), S.make.x, 0, S.make.z); void oven; const fire = glow(ctx, ctx.dyn, S.make.x, 0.3, S.make.z + 0.8, '#FF8C42', 0.25, 2);
  const tent = cone(ctx, ctx.root, 1.4, 2, ctx.std('#E85D75'), S.market.x, 1, S.market.z, 8); void tent; cone(ctx, ctx.root, 1.45, 0.4, ctx.std('#FFFFFF'), S.market.x, 0.2, S.market.z, 8);
  cyl(ctx, ctx.root, 0.5, 0.6, 1, '#6B1A3A', S.book.x, 0.5, S.book.z); const crown = new THREE.Group(); crown.position.set(S.book.x, 1.2, S.book.z); ctx.dyn.add(crown);
  const gold = ctx.std('#FFD23F', { metalness: 0.9, roughness: 0.2 }); cyl(ctx, crown, 0.3, 0.3, 0.2, gold); for (let k = 0; k < 6; k++) cone(ctx, crown, 0.06, 0.2, gold, Math.cos(k) * 0.28, 0.18, Math.sin(k) * 0.28, 4);
  const mills: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 4; k++) { const x = -2.4 + k * 1.6; box(ctx, o, 1.1, 1.2, 1, '#F2E6C8', x, 0.6, 0); const rf = cone(ctx, o, 0.9, 0.8, ['#B23A2E', '#2A4A9A', '#3E7D3A', '#D99A2B'][k], x, 1.6, 0, 4); rf.rotation.y = Math.PI / 4; }
    if (i === 1) for (let k = 0; k < 4; k++) for (let j = 0; j < 5; j++) { cyl(ctx, o, 0.04, 0.04, 1, '#6B4A2A', -2.4 + j * 1.2, 0.5, -1 + k * 0.7); ball(ctx, o, 0.2, '#6A2A8A', -2.4 + j * 1.2, 0.9, -1 + k * 0.7); }
    if (i === 2) for (let k = 0; k < 5; k++) { cyl(ctx, o, 0.25, 0.3, 0.6, '#E8C35A', -2.4 + k * 1.2, 0.3, 0); const sk = ball(ctx, o, 0.3, '#D9A84A', -2.4 + k * 1.2, 0.75, 0); sk.scale.y = 1.2; }
    if (i === 3) for (let k = 0; k < 6; k++) { cyl(ctx, o, 0.12, 0.15, 1.2, '#6B4A2A', -2.5 + k, 0.6, 0); ball(ctx, o, 0.6, '#5E8A3A', -2.5 + k, 1.5, 0); box(ctx, o, 0.6, 0.02, 0.3, '#F8F8F2', -2.5 + k, 1.1, 0.4); }
    if (i === 4) for (let k = 0; k < 40; k++) { const x = -2.6 + r() * 5.2, z = -1 + r() * 2; cyl(ctx, o, 0.015, 0.015, 0.4, '#3E7D3A', x, 0.2, z); ball(ctx, o, 0.08, '#9B5DE5', x, 0.42, z); }
    if (i === 5) { const m = new THREE.Group(); o.add(m); cyl(ctx, m, 0.8, 1, 4, '#F2E6C8', 0, 2, 0); cone(ctx, m, 1.1, 1.4, '#B23A2E', 0, 4.7, 0, 10); const sails = keep(new THREE.Group()); sails.position.set(0, 3.6, 0.95); m.add(sails); for (let k = 0; k < 4; k++) { const s = box(ctx, sails, 0.3, 2.2, 0.04, '#F8F8F2', 0, 1.1, 0); s.parent!.remove(s); const arm = new THREE.Group(); arm.rotation.z = (k * Math.PI) / 2; sails.add(arm); arm.add(s); } mills.push(sails); for (let k = 0; k < 3; k++) { box(ctx, o, 0.6, 0.6, 0.6, '#FFD23F', -2 + k * 0.7, 0.3, 1.4); } }
    // locked: a raised drawbridge and a moat
    disc(ctx, l, 3, ctx.std('#3B6E8A', { roughness: 0.1 }), 0, 0.03, 0.4); box(ctx, l, 3, 3, 0.25, '#7A4E2D', 0, 1.6, -0.6); for (const s of [-1, 1]) box(ctx, l, 0.05, 3.2, 0.05, '#444', s * 1.3, 2.4, -0.2).rotation.x = 0.5;
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['mill', 'vineyard', 'apiary', 'mulberry', 'crocus', 'grove'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'mill') { cyl(ctx, g, 0.3, 0.38, 1.4, '#F2E6C8', 0, 0.7, 0); cone(ctx, g, 0.45, 0.5, '#B23A2E', 0, 1.65, 0, 8); const s = new THREE.Group(); s.position.set(0, 1.3, 0.4); g.add(s); for (let j = 0; j < 4; j++) box(ctx, s, 0.12, 0.9, 0.02, '#F8F8F2', 0, 0, 0).rotation.z = (j * Math.PI) / 2; g.userData.spinZ = s; }
    else if (id === 'vineyard') for (let j = 0; j < 3; j++) { cyl(ctx, g, 0.03, 0.03, 0.9, '#6B4A2A', (j - 1) * 0.4, 0.45, 0); ball(ctx, g, 0.14, '#6A2A8A', (j - 1) * 0.4, 0.75, 0.1); }
    else if (id === 'apiary') { const h = ball(ctx, g, 0.35, '#E8C35A', 0, 0.45, 0); h.scale.y = 1.3; g.userData.bob = glow(ctx, g, 0.4, 0.8, 0.2, '#FFE14D', 0.05, 2); g.userData.bobY = 0.8; }
    else if (id === 'mulberry') { cyl(ctx, g, 0.08, 0.1, 0.8, '#6B4A2A', 0, 0.4, 0); ball(ctx, g, 0.45, '#5E8A3A', 0, 1, 0); box(ctx, g, 0.4, 0.02, 0.2, '#F8F8F2', 0, 0.7, 0.35); }
    else if (id === 'crocus') for (let j = 0; j < 7; j++) { cyl(ctx, g, 0.015, 0.015, 0.4, '#3E7D3A', (r() - 0.5) * 0.7, 0.2, (r() - 0.5) * 0.7); ball(ctx, g, 0.07, '#9B5DE5', (r() - 0.5) * 0.7, 0.42, (r() - 0.5) * 0.7); }
    else { cyl(ctx, g, 0.12, 0.15, 0.9, '#6B4A2A', 0, 0.45, 0); ball(ctx, g, 0.55, '#3E7D3A', 0, 1.2, 0); for (let j = 0; j < 4; j++) glow(ctx, g, Math.cos(j * 1.6) * 0.45, 1.1, Math.sin(j * 1.6) * 0.45, '#FFD23F', 0.09, 1.4); }
    return shadows(g);
  };
  const petals = motes(ctx, 100, '#FFE6A8', 0.08);
  for (let i = 0; i < 100; i++) { petals.pos[i * 3] = (r() - 0.5) * 36; petals.pos[i * 3 + 1] = 0.5 + r() * 5; petals.pos[i * 3 + 2] = (r() - 0.5) * 30; } petals.done();
  return {
    sky: '#9ED2FF', fog: ['#BFE0FF', 40, 90], light: ['#FFF4D8', '#8A9A60', 2.8, '#FFF0C8', 2.4], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      tractor.position.x = S.play.x + Math.sin(t * 0.6) * 1.2; tractor.rotation.y = Math.cos(t * 0.6) > 0 ? 0 : Math.PI;
      fire.scale.setScalar(1 + Math.sin(t * 9) * 0.2); crown.rotation.y = t * 0.8; mills.forEach((m) => { m.rotation.z = t * 0.8; });
      petals.pts.rotation.y = t * 0.02; animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 🏢 Megacorp Spire — the glass lobby of a supertall tower, teal light and holograms
// ======================================================================================================================
export function megacorp(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#E8ECEF'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#C8D0D6'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); } }, 10, 70, 0.15);
  const glass = ctx.std('#9FE8E0', { transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.4, depthWrite: false }), steel = ctx.std('#B8C0C8', { metalness: 0.8, roughness: 0.3 }), teal = ctx.std('#2EC4B6', { emissive: '#2EC4B6', emissiveIntensity: 1.2 });
  // a curved curtain wall of glass and steel mullions
  around(ctx, 30, 21, 21, (x, z, a) => { const p = box(ctx, ctx.root, 4.4, 16, 0.1, glass, x, 8, z); p.rotation.y = -a + Math.PI / 2; p.castShadow = false; box(ctx, ctx.root, 0.2, 16, 0.2, steel, x * 1.01, 8, z * 1.01); });
  // other towers seen through the glass
  around(ctx, 14, 34, 44, (x, z) => { const h = 20 + r() * 30; box(ctx, ctx.root, 4 + r() * 3, h, 4 + r() * 3, ctx.std(['#3A4A5A', '#2A3A4A', '#4A5A6A'][Math.floor(r() * 3)], { emissive: '#1A2A3A', emissiveIntensity: 0.4 }), x, h / 2, z).castShadow = false; });
  const S = spots({ play: '🛗 Lift Rush', collect: '📥 Mail room', build: '📊 Strategy wall', make: '🧪 R&D floor', market: '📈 Stock exchange', book: '🏆 Hall of patents' });
  const lights: THREE.PointLight[] = [];
  // play: a glass lift shaft going up out of sight with a car that rides up and down
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) box(ctx, ctx.root, 0.12, 18, 0.12, steel, S.play.x + dx, 9, S.play.z - 0.6 + dz);
  const shaft = box(ctx, ctx.root, 1.8, 18, 1.8, glass, S.play.x, 9, S.play.z - 0.6); shaft.castShadow = false;
  const car = new THREE.Group(); ctx.dyn.add(car); box(ctx, car, 1.5, 1.8, 1.5, ctx.std('#E8E4DC', { metalness: 0.5, roughness: 0.3 }), 0, 0.9, 0); box(ctx, car, 1.52, 0.08, 1.52, teal, 0, 1.8, 0);
  lamp(ctx, lights, '#2EC4B6', 10, 12, S.play.x, 2, S.play.z + 1);
  // a hologram globe over the reception
  const holo = mesh(ctx, new THREE.SphereGeometry(1, 16, 12), ctx.std('#2EC4B6', { wireframe: true, emissive: '#2EC4B6', emissiveIntensity: 1.5, transparent: true, opacity: 0.6 }), 0, 3.4, 1.6, ctx.dyn);
  box(ctx, ctx.root, 3, 1, 1, '#F8F8F8', 0, 0.5, 1.6); box(ctx, ctx.root, 3.02, 0.06, 1.02, teal, 0, 1.02, 1.6);
  box(ctx, ctx.root, 1.4, 1, 0.8, steel, S.collect.x, 0.5, S.collect.z); for (let k = 0; k < 6; k++) box(ctx, ctx.root, 0.35, 0.25, 0.04, '#F2E6C8', S.collect.x - 0.45 + (k % 3) * 0.45, 1.2 + Math.floor(k / 3) * 0.3, S.collect.z + 0.42);
  box(ctx, ctx.root, 2, 1.4, 0.08, ctx.std('#0E2A33', { emissive: '#0E2A33' }), S.build.x, 1.5, S.build.z); for (let k = 0; k < 5; k++) box(ctx, ctx.root, 0.2, 0.2 + k * 0.18, 0.02, teal, S.build.x - 0.7 + k * 0.35, 1 + (0.2 + k * 0.18) / 2, S.build.z + 0.06);
  box(ctx, ctx.root, 1.8, 0.9, 0.8, '#F8F8F8', S.make.x, 0.45, S.make.z); ['#2EC4B6', '#FF6FA8', '#FFE14D'].forEach((c, k) => cyl(ctx, ctx.root, 0.08, 0.08, 0.4, ctx.std(c, { transparent: true, opacity: 0.7, emissive: c, emissiveIntensity: 0.6 }), S.make.x - 0.5 + k * 0.5, 1.1, S.make.z));
  const ticker = ctx.std('#0A1A1E', { emissive: '#3DDC97', emissiveIntensity: 0.2 }); box(ctx, ctx.root, 2.4, 1.2, 0.12, ticker, S.market.x, 1.8, S.market.z - 0.3); const bars: THREE.Mesh[] = []; for (let k = 0; k < 8; k++) bars.push(box(ctx, ctx.dyn, 0.18, 0.5, 0.04, ctx.std(k % 3 ? '#3DDC97' : '#FF5A5F', { emissive: k % 3 ? '#3DDC97' : '#FF5A5F', emissiveIntensity: 1 }), S.market.x - 0.95 + k * 0.27, 1.8, S.market.z - 0.22));
  person(ctx, ctx.root, S.market.x, S.market.z + 0.5, '#1E2A44', undefined);
  for (let k = 0; k < 3; k++) { cyl(ctx, ctx.root, 0.25, 0.3, 1, '#F8F8F8', S.book.x - 0.8 + k * 0.8, 0.5, S.book.z); glow(ctx, ctx.root, S.book.x - 0.8 + k * 0.8, 1.25, S.book.z, ['#FFD23F', '#C3D0FF', '#FF8C42'][k], 0.15, 1.6); }
  const servers: THREE.Mesh[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) { for (let k = 0; k < 4; k++) { cone(ctx, o, 0.5, 1.6, '#3E8A4A', -2.2 + k * 1.5, 1.5, 0, 6); cyl(ctx, o, 0.4, 0.4, 0.6, '#F8F8F8', -2.2 + k * 1.5, 0.3, 0); } box(ctx, o, 6, 0.04, 2, ctx.std('#9FE8E0', { roughness: 0.05 }), 0, 0.02, 1.2); }
    if (i === 1) for (let k = 0; k < 6; k++) { const x = -2.5 + (k % 3) * 2.2, z = -0.6 + Math.floor(k / 3) * 1.4; box(ctx, o, 1.4, 0.06, 0.7, '#F8F8F8', x, 0.75, z); box(ctx, o, 0.5, 0.35, 0.04, ctx.std('#0E2A33', { emissive: '#2EC4B6', emissiveIntensity: 0.5 }), x, 1, z - 0.2); box(ctx, o, 0.06, 0.75, 0.06, steel, x, 0.37, z); }
    if (i === 2) for (let k = 0; k < 5; k++) { box(ctx, o, 0.8, 2.4, 0.8, '#1A2228', -2.4 + k * 1.2, 1.2, 0); const led = box(ctx, o, 0.6, 0.06, 0.02, ctx.std('#2EC4B6', { emissive: '#2EC4B6', emissiveIntensity: 2 }), -2.4 + k * 1.2, 1.6, 0.41); servers.push(led); }
    if (i === 3) { box(ctx, o, 6, 3, 2.4, ctx.std('#F8F8F8', { transparent: true, opacity: 0.4 }), 0, 1.5, 0); for (let k = 0; k < 3; k++) person(ctx, o, -1.6 + k * 1.6, 0, '#FFFFFF', '#FFFFFF', '#FFFFFF'); }
    if (i === 4) { for (let k = 0; k < 3; k++) { box(ctx, o, 1.4, 0.4, 0.7, '#2A3A4A', -2 + k * 2, 0.2, 0); box(ctx, o, 1.4, 0.5, 0.2, '#2A3A4A', -2 + k * 2, 0.55, -0.25); } cyl(ctx, o, 0.6, 0.6, 0.8, '#F8F8F8', 0, 0.4, 1.4); glow(ctx, o, 0, 1, 1.4, '#FFB84D', 0.18, 1.4); }
    if (i === 5) { box(ctx, o, 2.6, 5, 2.6, ctx.std('#1E2A44', { metalness: 0.6, roughness: 0.2 }), 0, 2.5, -0.4); cone(ctx, o, 1.8, 2, ctx.std('#2EC4B6', { emissive: '#2EC4B6', emissiveIntensity: 1.2 }), 0, 6, -0.4, 4).rotation.y = Math.PI / 4; }
    // locked: a security gate with a red laser line
    box(ctx, l, 6, 2.4, 0.1, glass, 0, 1.2, 0); for (const s of [-1, 1]) box(ctx, l, 0.3, 1.1, 0.4, steel, s * 0.8, 0.55, 0.6); box(ctx, l, 1.3, 0.04, 0.04, ctx.std('#FF3B3B', { emissive: '#FF3B3B', emissiveIntensity: 2 }), 0, 0.8, 0.6);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['inbox', 'boardroom', 'lab', 'fab', 'legal', 'qc'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'inbox') { box(ctx, g, 0.8, 0.06, 0.5, '#F8F8F8', 0, 0.7, 0); box(ctx, g, 0.4, 0.3, 0.03, ctx.std('#0E2A33', { emissive: '#2EC4B6', emissiveIntensity: 0.8 }), 0, 0.9, -0.1); g.userData.bob = box(ctx, g, 0.2, 0.14, 0.02, '#F2E6C8', 0.25, 1.1, 0); g.userData.bobY = 1.1; }
    else if (id === 'boardroom') { box(ctx, g, 1.2, 0.06, 0.6, '#3A2A1E', 0, 0.7, 0); for (let j = 0; j < 4; j++) box(ctx, g, 0.2, 0.5, 0.2, '#1E1E1E', -0.45 + j * 0.3, 0.25, 0.45); }
    else if (id === 'lab') { box(ctx, g, 0.6, 1.2, 0.6, '#1A2228', 0, 0.6, 0); g.userData.orb = glow(ctx, g, 0, 1.4, 0, '#2EC4B6', 0.16, 2.2); }
    else if (id === 'fab') { box(ctx, g, 0.9, 0.6, 0.6, '#F8F8F8', 0, 0.3, 0); const w = cyl(ctx, g, 0.25, 0.25, 0.02, ctx.std('#C3D0FF', { metalness: 0.9, roughness: 0.1 }), 0, 0.65, 0); g.userData.spin = w; }
    else if (id === 'legal') { box(ctx, g, 0.5, 1.6, 0.5, '#2A3A4A', 0, 0.8, 0); for (let j = 0; j < 5; j++) box(ctx, g, 0.52, 0.04, 0.52, teal, 0, 0.3 + j * 0.3, 0); }
    else { const q = keep(new THREE.Group()); q.position.y = 0.9; g.add(q); mesh(ctx, new THREE.TorusGeometry(0.35, 0.04, 8, 24), teal, 0, 0, 0, q); mesh(ctx, new THREE.TorusGeometry(0.35, 0.04, 8, 24), teal, 0, 0, 0, q).rotation.y = Math.PI / 2; glow(ctx, q, 0, 0, 0, '#FFFFFF', 0.12, 2.6); g.userData.spin = q; g.userData.spinSpeed = 3; }
    return shadows(g);
  };
  return {
    sky: '#BFE4F0', fog: ['#BFE4F0', 40, 100], light: ['#F4FFFF', '#7A9AA8', 2.6, '#FFFFFF', 2], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      const ph = (t * 0.15) % 2, y = ph < 1 ? ph : 2 - ph; car.position.set(S.play.x, Math.max(0, (y * 2 - 0.15)) * 6, S.play.z - 0.6);
      holo.rotation.y = t * 0.4; bars.forEach((b, k) => { b.scale.y = 0.6 + Math.abs(Math.sin(t * 1.5 + k)) * 1.2; });
      servers.forEach((s, k) => { (s.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.floor(t * 4 + k) % 3 ? 2 : 0.3; });
      animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 🛸 Neon Galaxy Park — a theme park on the moon's surface, lit in pink and cyan neon
// ======================================================================================================================
export function galaxypark(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#8C8A98'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 40; i++) { const x = r() * 256, y = r() * 256, rr = 4 + r() * 14; g.fillStyle = '#7A7886'; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#A09EAC'; g.lineWidth = 2; g.stroke(); } }, 8, 70, 1);
  // neon walkways in a star pattern
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; const s = box(ctx, ctx.root, 0.16, 0.04, 30, ctx.std(k % 2 ? '#FF2E88' : '#00E5FF', { emissive: k % 2 ? '#FF2E88' : '#00E5FF', emissiveIntensity: 1.6 }), 0, 0.03, 0); s.rotation.y = a; s.castShadow = false; }
  const earth = glow(ctx, ctx.root, 18, 22, -40, '#3F8FFF', 6, 0.7); void earth;
  // craters and ride towers round the edge
  around(ctx, 12, 22, 30, (x, z) => { const c = mesh(ctx, new THREE.TorusGeometry(2 + r() * 2, 0.6, 6, 20), ctx.std('#7A7886', { roughness: 1 }), x, 0, z); c.rotation.x = Math.PI / 2; c.castShadow = false; });
  const neonP = ctx.std('#FF2E88', { emissive: '#FF2E88', emissiveIntensity: 1.6 }), neonC = ctx.std('#00E5FF', { emissive: '#00E5FF', emissiveIntensity: 1.6 }), white = ctx.std('#F0F0F8', { metalness: 0.4, roughness: 0.3 });
  around(ctx, 6, 20, 20, (x, z, a, i) => { cyl(ctx, ctx.root, 0.4, 0.6, 10, white, x, 5, z); mesh(ctx, new THREE.TorusGeometry(1.2, 0.1, 8, 30), i % 2 ? neonP : neonC, x, 10, z).rotation.x = Math.PI / 2; void a; });
  const S = spots({ play: '⭕ Ring Toss', collect: '🎒 Space locker', build: '🗺️ Park map', make: '🧸 Prize factory', market: '⭐ Star exchange', book: '🏆 Prize wall' });
  const lights: THREE.PointLight[] = [];
  // play: a ring toss booth with bottles and a flashing sign
  box(ctx, ctx.root, 3.6, 0.9, 1.4, '#2A0A40', S.play.x, 0.45, S.play.z - 0.8);
  const bottles: Inst[] = []; for (let row = 0; row < 3; row++) for (let k = 0; k < 5 - row; k++) bottles.push({ x: S.play.x + (k - (4 - row) / 2) * 0.5, y: 1.15 + row * 0.12, z: S.play.z - 1.2 + row * 0.35, s: 0.12, sy: 0.4, c: ['#00E5FF', '#3DDC97', '#FF2E88'][row] });
  scatter(ctx, new THREE.CylinderGeometry(0.8, 1, 1.2, 8), ctx.std('#ffffff', { transparent: true, opacity: 0.85, emissive: '#333', emissiveIntensity: 0.3 }), bottles);
  for (const s of [-1, 1]) cyl(ctx, ctx.root, 0.08, 0.08, 3, white, S.play.x + s * 1.7, 1.5, S.play.z - 1.4);
  const sign = box(ctx, ctx.dyn, 3.6, 0.6, 0.1, neonP, S.play.x, 3, S.play.z - 1.4);
  lamp(ctx, lights, '#FF2E88', 12, 12, S.play.x, 2.5, S.play.z);
  // a flying saucer hovers and spins over the middle
  const ufo = new THREE.Group(); ufo.position.set(0, 6, 0); ctx.dyn.add(ufo); const disk = ball(ctx, ufo, 1.6, white); disk.scale.y = 0.25; ball(ctx, ufo, 0.7, ctx.std('#9AE6FF', { transparent: true, opacity: 0.6 }), 0, 0.3, 0);
  const ufoLights: THREE.Mesh[] = []; for (let k = 0; k < 8; k++) ufoLights.push(glow(ctx, ufo, Math.cos((k / 8) * Math.PI * 2) * 1.5, -0.05, Math.sin((k / 8) * Math.PI * 2) * 1.5, k % 2 ? '#FF2E88' : '#00E5FF', 0.1, 2));
  box(ctx, ctx.root, 1.2, 1.8, 0.6, white, S.collect.x, 0.9, S.collect.z); box(ctx, ctx.root, 0.04, 1.6, 0.02, neonC, S.collect.x, 0.9, S.collect.z + 0.31);
  box(ctx, ctx.root, 1.8, 1.2, 0.08, ctx.std('#12052A', { emissive: '#2A0A40' }), S.build.x, 1.4, S.build.z); for (let k = 0; k < 5; k++) glow(ctx, ctx.root, S.build.x - 0.7 + k * 0.35, 1.3 + Math.sin(k) * 0.3, S.build.z + 0.06, k % 2 ? '#FF2E88' : '#00E5FF', 0.06, 2);
  box(ctx, ctx.root, 1.6, 1.4, 1, '#3A1A5A', S.make.x, 0.7, S.make.z); const plush = ball(ctx, ctx.dyn, 0.35, '#FFB8E0', S.make.x, 1.75, S.make.z); glow(ctx, ctx.root, S.make.x, 1.45, S.make.z + 0.51, '#FFE14D', 0.12, 1.6);
  cyl(ctx, ctx.root, 0.9, 0.9, 1.1, white, S.market.x, 0.55, S.market.z); mesh(ctx, new THREE.TorusGeometry(0.9, 0.06, 8, 28), neonC, S.market.x, 1.1, S.market.z).rotation.x = Math.PI / 2; cone(ctx, ctx.root, 1.1, 0.8, neonP, S.market.x, 2.4, S.market.z, 10);
  box(ctx, ctx.root, 2.4, 1.6, 0.4, '#2A0A40', S.book.x, 0.8, S.book.z); for (let k = 0; k < 6; k++) ball(ctx, ctx.root, 0.18, ['#FFB8E0', '#9AE6FF', '#FFE14D'][k % 3], S.book.x - 0.8 + (k % 3) * 0.8, 0.8 + Math.floor(k / 3) * 0.6, S.book.z + 0.3);
  const rides: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) { const arch = mesh(ctx, new THREE.TorusGeometry(2.4, 0.2, 8, 30, Math.PI), neonC, 0, 0, 0, o); void arch; for (let k = 0; k < 5; k++) glow(ctx, o, -2 + k, 2.6 + Math.sin((k / 4) * Math.PI) * 0.1, 0, '#FFE14D', 0.12, 2); }
    if (i === 1) for (let k = 0; k < 4; k++) { box(ctx, o, 1, 1.2, 0.8, ['#FF2E88', '#00E5FF', '#FFE14D', '#3DDC97'][k], -2.4 + k * 1.6, 0.6, 0); cone(ctx, o, 0.8, 0.6, white, -2.4 + k * 1.6, 1.5, 0, 4).rotation.y = Math.PI / 4; }
    if (i === 2) for (let k = 0; k < 3; k++) { box(ctx, o, 1.4, 0.8, 0.8, '#2A0A40', -2 + k * 2, 0.4, 0); for (let j = 0; j < 3; j++) cyl(ctx, o, 0.06, 0.08, 0.3, '#3DDC97', -2.4 + k * 2 + j * 0.4, 0.95, 0); }
    if (i === 3) { const arm = keep(new THREE.Group()); arm.position.set(0, 2.4, 0); o.add(arm); cyl(ctx, o, 0.2, 0.3, 2.4, white, 0, 1.2, 0); for (let k = 0; k < 4; k++) { const rk = new THREE.Group(); rk.rotation.y = (k * Math.PI) / 2; arm.add(rk); box(ctx, rk, 2, 0.08, 0.08, white, 1, 0, 0); const body = cyl(ctx, rk, 0.25, 0.25, 0.8, k % 2 ? '#FF2E88' : '#00E5FF', 2, -0.3, 0); body.rotation.z = Math.PI / 2; cone(ctx, rk, 0.25, 0.4, white, 2.6, -0.3, 0).rotation.z = -Math.PI / 2; } rides.push(arm); }
    if (i === 4) { const loop = mesh(ctx, new THREE.TorusGeometry(2, 0.12, 8, 40), neonP, 0, 2.4, 0, o); void loop; for (const s of [-1, 1]) cyl(ctx, o, 0.1, 0.1, 2.4, white, s * 2, 1.2, 0); const cart = keep(new THREE.Group()); cart.position.set(0, 2.4, 0); o.add(cart); box(ctx, cart, 0.5, 0.3, 0.4, '#FFE14D', 0, -2, 0); rides.push(cart); cart.userData.loop = 1; }
    if (i === 5) { const st = cyl(ctx, o, 2.4, 2.6, 0.6, '#2A0A40', 0, 0.3, -0.3); void st; const nova = glow(ctx, o, 0, 3.2, -0.6, '#FFE14D', 0.8, 2.6); const nv = keep(new THREE.Group()); o.add(nv); nv.add(nova); for (let k = 0; k < 10; k++) { const ray = box(ctx, nv, 0.08, 1.6, 0.08, k % 2 ? neonP : neonC, Math.cos(k * 0.63) * 1.4, 3.2 + Math.sin(k * 0.63) * 1.4, -0.6); ray.rotation.z = k * 0.63 - Math.PI / 2; } rides.push(nv); nv.userData.pulse = 1; }
    // locked: a force-field dome
    const ff = mesh(ctx, new THREE.SphereGeometry(3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#00E5FF', { transparent: true, opacity: 0.18, emissive: '#00E5FF', emissiveIntensity: 0.8, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, l); ff.castShadow = false;
    box(ctx, l, 1.4, 0.5, 0.06, neonP, 0, 0.6, 3);
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['glowcart', 'popper', 'tossbooth', 'fuelpump', 'plushfactory', 'crater'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'glowcart') { box(ctx, g, 0.8, 0.5, 0.5, white, 0, 0.45, 0); for (let j = 0; j < 5; j++) box(ctx, g, 0.03, 0.5, 0.03, j % 2 ? neonP : neonC, -0.3 + j * 0.15, 0.95, 0); }
    else if (id === 'popper') { cyl(ctx, g, 0.3, 0.25, 0.8, '#FF2E88', 0, 0.4, 0); box(ctx, g, 0.45, 0.4, 0.45, ctx.std('#FFFFFF', { transparent: true, opacity: 0.5 }), 0, 1, 0); g.userData.bob = ball(ctx, g, 0.08, '#FFF4C8', 0, 1, 0); g.userData.bobY = 1; }
    else if (id === 'tossbooth') { box(ctx, g, 0.9, 0.6, 0.5, '#2A0A40', 0, 0.3, 0); for (let j = 0; j < 3; j++) cyl(ctx, g, 0.05, 0.07, 0.25, '#3DDC97', -0.25 + j * 0.25, 0.73, 0); }
    else if (id === 'fuelpump') { box(ctx, g, 0.5, 1.1, 0.4, '#FF5A1F', 0, 0.55, 0); g.userData.orb = glow(ctx, g, 0, 1.2, 0.2, '#FFE14D', 0.08, 2); }
    else if (id === 'plushfactory') { box(ctx, g, 0.9, 0.8, 0.7, '#3A1A5A', 0, 0.4, 0); g.userData.bob = ball(ctx, g, 0.2, '#FFB8E0', 0, 1, 0); g.userData.bobY = 1; }
    else { const c = mesh(ctx, new THREE.TorusGeometry(0.5, 0.15, 6, 16), ctx.std('#7A7886'), 0, 0.1, 0, g); c.rotation.x = Math.PI / 2; g.userData.orb = glow(ctx, g, 0, 0.25, 0, '#FF5A1F', 0.2, 2.2); }
    return shadows(g);
  };
  const stars = motes(ctx, 260, '#FFFFFF', 0.12);
  for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, e = r() * 1.3 + 0.15, d = 45; stars.pos[i * 3] = Math.cos(a) * Math.cos(e) * d; stars.pos[i * 3 + 1] = Math.sin(e) * d; stars.pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * d; } stars.done();
  return {
    sky: '#05021A', fog: ['#05021A', 34, 90], light: ['#E0D8FF', '#3A1A5A', 1.9, '#D8E0FF', 1.5], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t) {
      ufo.rotation.y = t * 0.8; ufo.position.set(Math.cos(t * 0.15) * 3, 6 + Math.sin(t) * 0.4, Math.sin(t * 0.15) * 2);
      ufoLights.forEach((m, k) => m.scale.setScalar(Math.floor(t * 6 + k) % 2 ? 1.3 : 0.6));
      (sign.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.floor(t * 2) % 2 ? 2 : 0.8;
      plush.position.y = 1.75 + Math.abs(Math.sin(t * 3)) * 0.2;
      rides.forEach((rd) => { if (rd.userData.loop) rd.rotation.z = t * 2; else if (rd.userData.pulse) rd.scale.setScalar(1 + Math.sin(t * 2) * 0.08); else rd.rotation.y = t * 1.2; });
      stars.pts.rotation.y = t * 0.003; animate(ups, t);
    },
  };
}

// ======================================================================================================================
// 🌋 World's Core — a cavern of black rock over rivers of lava
// ======================================================================================================================
export function core(ctx: Ctx): RealmEnv {
  const r = ctx.r;
  floor(ctx, (g) => { g.fillStyle = '#1A1210'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#FF5A1F'; g.lineWidth = 2; g.shadowColor = '#FF8A2A'; g.shadowBlur = 6; for (let i = 0; i < 18; i++) { g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); } }, 8, 70, 0.95);
  // a lava river ring round the platform
  const lavaMat = ctx.std('#FF5A1F', { emissive: '#FF3A00', emissiveIntensity: 1.6, roughness: 0.4 });
  const lava = mesh(ctx, new THREE.RingGeometry(16, 20, 48), lavaMat, 0, 0.04, 0); lava.rotation.x = -Math.PI / 2; lava.castShadow = false;
  const rock = ctx.std('#2A1E1A', { flatShading: true, roughness: 1 });
  // jagged rock spires and stalactites
  const spires: Inst[] = []; around(ctx, 40, 21, 32, (x, z) => spires.push({ x, y: 3, z, s: 1 + r() * 1.5, sy: 2 + r() * 3, c: ['#2A1E1A', '#3A2A22', '#1E1612'][Math.floor(r() * 3)] }));
  scatter(ctx, new THREE.ConeGeometry(1.6, 4, 6), ctx.std('#ffffff', { flatShading: true }), spires, true);
  const tites: Inst[] = []; for (let i = 0; i < 50; i++) tites.push({ x: (r() - 0.5) * 50, y: 16, z: (r() - 0.5) * 44, s: 0.5 + r(), sy: -(1 + r() * 2), c: '#2A1E1A' });
  scatter(ctx, new THREE.ConeGeometry(1, 3, 5), ctx.std('#ffffff', { flatShading: true }), tites);
  const S = spots({ play: '🪛 Drill Dive', collect: '🛒 Ore cart', build: '📋 Shaft board', make: '🔥 Magma forge', market: '⚖️ Deep exchange', book: '🧪 Core samples' });
  const lights: THREE.PointLight[] = [];
  // play: a huge drill rig pointed into a glowing borehole
  disc(ctx, ctx.root, 1.2, ctx.std('#FF8A2A', { emissive: '#FF5A1F', emissiveIntensity: 2 }), S.play.x, 0.05, S.play.z - 0.8);
  for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [0, 1.4]]) { const leg = cyl(ctx, ctx.root, 0.1, 0.12, 5, '#555', S.play.x + dx * 0.7, 2.4, S.play.z - 0.8 + dz * 0.7); leg.rotation.set(dz * 0.18, 0, -dx * 0.18); }
  const bit = new THREE.Group(); bit.position.set(S.play.x, 2.6, S.play.z - 0.8); ctx.dyn.add(bit); cone(ctx, bit, 0.5, 1.6, ctx.std('#C0C4CC', { metalness: 0.9, roughness: 0.3 }), 0, -0.6, 0, 8).rotation.x = Math.PI; cyl(ctx, bit, 0.3, 0.3, 1.6, '#FF5A1F', 0, 0.8, 0);
  lamp(ctx, lights, '#FF6A2A', 18, 14, S.play.x, 1, S.play.z - 0.8);
  // mine cart, a board on a rock, the forge, the exchange scales, sample tubes
  box(ctx, ctx.root, 1.4, 0.7, 0.9, '#4A4A52', S.collect.x, 0.55, S.collect.z); for (let k = 0; k < 6; k++) ball(ctx, ctx.root, 0.2, ['#1A1A1A', '#FFE14D', '#FF5A1F'][k % 3], S.collect.x - 0.4 + (k % 3) * 0.4, 1, S.collect.z - 0.2 + Math.floor(k / 3) * 0.4);
  cone(ctx, ctx.root, 0.8, 1.4, rock, S.build.x, 0.7, S.build.z, 6); box(ctx, ctx.root, 1.2, 0.8, 0.06, '#C9A06A', S.build.x, 1.4, S.build.z + 0.3);
  cyl(ctx, ctx.root, 0.9, 1.1, 1.2, '#3A2A22', S.make.x, 0.6, S.make.z); const forge = disc(ctx, ctx.dyn, 0.7, lavaMat, S.make.x, 1.22, S.make.z);
  cyl(ctx, ctx.root, 0.08, 0.1, 1.8, '#C9A64A', S.market.x, 0.9, S.market.z); box(ctx, ctx.root, 1.8, 0.06, 0.06, '#C9A64A', S.market.x, 1.8, S.market.z); for (const s of [-1, 1]) cyl(ctx, ctx.root, 0.35, 0.3, 0.1, '#C9A64A', S.market.x + s * 0.85, 1.4, S.market.z);
  for (let k = 0; k < 5; k++) { cyl(ctx, ctx.root, 0.12, 0.12, 0.8, ctx.std('#FFFFFF', { transparent: true, opacity: 0.4 }), S.book.x - 0.8 + k * 0.4, 0.9, S.book.z); cyl(ctx, ctx.root, 0.1, 0.1, 0.4 + k * 0.08, ctx.std(['#1A1A1A', '#FFE14D', '#FF5A1F', '#C0C4CC', '#FF3BB0'][k], { emissive: ['#000', '#806010', '#FF3A00', '#333', '#801060'][k], emissiveIntensity: 0.8 }), S.book.x - 0.8 + k * 0.4, 0.7 + (0.4 + k * 0.08) / 2 - 0.2, S.book.z); }
  box(ctx, ctx.root, 2.2, 0.5, 0.6, '#3A2A22', S.book.x, 0.25, S.book.z);
  const vents: THREE.Object3D[] = [];
  const zs = zones((i, o, l) => {
    if (i === 0) for (let k = 0; k < 6; k++) { const s = box(ctx, o, 1.2, 0.3 + r() * 0.4, 1, rock, -2.5 + k, 0.2, (r() - 0.5)); s.rotation.y = r(); }
    if (i === 1) for (let k = 0; k < 3; k++) { cone(ctx, o, 0.7, 1.2, '#C9B83A', -2 + k * 2, 0.6, 0, 7); const v = keep(new THREE.Group()); v.position.set(-2 + k * 2, 1.4, 0); o.add(v); for (let j = 0; j < 4; j++) ball(ctx, v, 0.25, ctx.std('#E8E080', { transparent: true, opacity: 0.4, depthWrite: false }), 0, j * 0.5, 0); vents.push(v); }
    if (i === 2) for (let k = 0; k < 5; k++) { const sh = cone(ctx, o, 0.3, 1.2, ctx.std(['#FF8A2A', '#FFE14D', '#FF3A6A'][k % 3], { transparent: true, opacity: 0.7, emissive: ['#FF5A1F', '#806010', '#801030'][k % 3], emissiveIntensity: 1 }), -2.4 + k * 1.2, 0.6, 0, 5); sh.rotation.z = (r() - 0.5) * 0.4; }
    if (i === 3) for (let k = 0; k < 3; k++) { for (const s of [-1, 1]) cyl(ctx, o, 0.08, 0.08, 3, '#888', -2 + k * 2 + s * 0.5, 1.5, 0); box(ctx, o, 1.2, 0.1, 0.4, '#888', -2 + k * 2, 3, 0); box(ctx, o, 0.6, 0.5, 0.5, '#4A4A52', -2 + k * 2, 1.5 + k * 0.4, 0); }
    if (i === 4) { disc(ctx, o, 2.6, lavaMat, 0, 0.06, 0.4); for (let k = 0; k < 5; k++) { const isl = ball(ctx, o, 0.4, rock, -1.8 + k * 0.9, 0.05, 0.4 + Math.sin(k) * 0.8); isl.scale.y = 0.3; } }
    if (i === 5) { const heart = keep(new THREE.Group()); heart.position.set(0, 2.2, -0.4); o.add(heart); ball(ctx, heart, 1, ctx.std('#FFE14D', { emissive: '#FF8A2A', emissiveIntensity: 2.6 })); for (let k = 0; k < 3; k++) mesh(ctx, new THREE.TorusGeometry(1.5 + k * 0.3, 0.06, 6, 30), ctx.std('#3A2A22', { metalness: 0.6 }), 0, 0, 0, heart).rotation.set(k, k * 0.7, 0); vents.push(heart); heart.userData.spin = 1; }
    // locked: a wall of cooled obsidian
    for (let k = 0; k < 7; k++) { const b = box(ctx, l, 1, 1.6 + r() * 1.2, 0.8, ctx.std('#0E0A0E', { roughness: 0.2, metalness: 0.3 }), -3 + k, 1, 0.4); b.rotation.y = r() * 0.4; }
  });
  const ups: THREE.Object3D[] = [];
  const producer = (id: string, k: number) => {
    const i = ['cooler', 'vent', 'kiln', 'borer', 'magmapump', 'heartcage'].indexOf(id); if (i < 0) return null;
    const g = prodGroup(i, k, ups);
    if (id === 'cooler') { box(ctx, g, 0.8, 0.6, 0.6, '#4A5A6A', 0, 0.3, 0); box(ctx, g, 0.5, 0.25, 0.3, '#0E0A0E', 0, 0.72, 0); }
    else if (id === 'vent') { cone(ctx, g, 0.4, 0.7, '#C9B83A', 0, 0.35, 0, 7); g.userData.bob = ball(ctx, g, 0.2, ctx.std('#E8E080', { transparent: true, opacity: 0.5, depthWrite: false }), 0, 1, 0); g.userData.bobY = 1; }
    else if (id === 'kiln') { const d = mesh(ctx, new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#3A2A22'), 0, 0, 0, g); void d; g.userData.orb = glow(ctx, g, 0, 0.2, 0.45, '#FF8A2A', 0.15, 2.2); }
    else if (id === 'borer') { cyl(ctx, g, 0.3, 0.3, 0.8, '#FF5A1F', 0, 0.8, 0); const b2 = cone(ctx, g, 0.3, 0.6, '#C0C4CC', 0, 0.25, 0, 8); b2.rotation.x = Math.PI; g.userData.spin = b2; g.userData.spinSpeed = 8; }
    else if (id === 'magmapump') { box(ctx, g, 0.6, 1, 0.6, '#4A4A52', 0, 0.5, 0); const arm = box(ctx, g, 1.2, 0.1, 0.1, '#888', 0, 1.1, 0); g.userData.sway = arm; disc(ctx, g, 0.4, lavaMat, 0.6, 0.05, 0.5); }
    else { for (let j = 0; j < 6; j++) cyl(ctx, g, 0.03, 0.03, 1.2, '#888', Math.cos(j) * 0.35, 0.6, Math.sin(j) * 0.35); g.userData.orb = glow(ctx, g, 0, 0.6, 0, '#FFE14D', 0.2, 2.6); }
    return shadows(g);
  };
  const embers = motes(ctx, 200, '#FF8A2A', 0.1);
  const es = Array.from({ length: 200 }, () => [(r() - 0.5) * 40, r() * 12, (r() - 0.5) * 34, 0.3 + r() * 0.8]);
  return {
    sky: '#140604', fog: ['#2A0A04', 18, 60], light: ['#FFB08A', '#3A0A04', 1.8, '#FF9A6A', 1.6], bounds: BOUNDS, stations: S, zones: zs, producer,
    update(t, dt) {
      bit.rotation.y = t * 6; bit.position.y = 2.6 + Math.sin(t * 1.5) * 0.4;
      lavaMat.emissiveIntensity = 1.5 + Math.sin(t * 1.3) * 0.35; forge.scale.setScalar(1 + Math.sin(t * 4) * 0.05);
      lights.forEach((l, k) => { l.intensity = 17 + Math.sin(t * 9 + k) * 2; });
      vents.forEach((v) => { if (v.userData.spin) v.rotation.y = t * 0.4; else v.children.forEach((c, j) => { c.position.y = ((t * 0.8 + j * 0.5) % 2); }); });
      for (let i = 0; i < es.length; i++) { const e = es[i]; e[1] += e[3] * (dt || 0.016) * 2; if (e[1] > 12) e[1] = 0; embers.pos[i * 3] = e[0] + Math.sin(t + i) * 0.3; embers.pos[i * 3 + 1] = e[1]; embers.pos[i * 3 + 2] = e[2]; } embers.done();
      animate(ups, t);
    },
  };
}
