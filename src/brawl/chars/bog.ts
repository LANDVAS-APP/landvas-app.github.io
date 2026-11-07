// 🍄 Bog: Spore Mite, Mudslug, Fungal Shaman, Swamp Lurker and the Rot Queen.
import * as THREE from 'three';
import { alive, bump, every, hop, motes, sparks, squash, stream, strike, wob, type Builder } from './core';

const SPORE = ['#C89BFF', '#9B6BFF', '#D8FF8A'];

export const sporemite: Builder = (k) => {
  const seed = Math.random() * 9;
  const cap = k.mat('#B03A8A', 'candy'), dots = k.mat('#FFF0D8', 'skin'), gill = k.mat('#E8C8B8', 'skin'), body = k.mat('#7A9A4A', 'shell'), leg = k.mat('#4A5A2A', 'shell'), tip = k.mat('#D8FF8A', 'glow');
  const B = k.g(k.root), bod = k.g(B, [0, 0.24, 0]);
  k.sphere(bod, 0.18, body, [0, 0, 0], [1, 0.75, 1.2]);
  const capG = k.g(bod, [0, 0.08, -0.03]);
  k.mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap, capG, [0, 0, 0], undefined, [1, 0.8, 1]);
  k.cyl(capG, 0.3, 0.22, 0.03, gill, [0, -0.005, 0], undefined, 24);
  for (let i = 0; i < 7; i++) { const q = i * 2.4, r = 0.08 + (i % 3) * 0.07; k.sphere(capG, 0.035 + (i % 2) * 0.015, dots, [Math.cos(q) * r, Math.sqrt(Math.max(0, 0.09 - r * r)) * 0.8 - 0.005, Math.sin(q) * r], [1, 0.4, 1], 8); }
  const head = k.g(bod, [0, 0.02, 0.2]);
  k.sphere(head, 0.11, body, [0, 0, 0]);
  const E = k.eyes(head, { y: 0.02, z: 0.08, spread: 0, r: 0.075, iris: '#9B6BFF', lid: body, one: true });
  const mouth = k.mouth(head, [0, -0.06, 0.08], 0.035);
  const ants = [-1, 1].map((x) => { const a = k.g(head, [x * 0.05, 0.08, 0.02]); k.tube(a, [[0, 0, 0], [x * 0.05, 0.1, 0.04], [x * 0.09, 0.15, 0.1]], 0.01, 0.007, leg); k.sphere(a, 0.025, tip, [x * 0.09, 0.15, 0.1], undefined, 8); return a; });
  const legs = Array.from({ length: 6 }, (_, i) => { const x = i % 2 ? 1 : -1, z = (Math.floor(i / 2) - 1) * 0.12; const l = k.g(B, [x * 0.12, 0.22, z]); k.tube(l, [[0, 0, 0], [x * 0.12, 0.04, 0], [x * 0.18, -0.2, 0]], 0.022, 0.012, leg); return l; });
  return {
    height: 0.75,
    anim(a) {
      const t = a.t;
      let puff = 0, fw = 0;
      if (a.act === 'ability' || a.act === 'play') puff = bump(a.k, 0, 0.6);
      if (a.act === 'attack') { const s = strike(a.k, 0.4); fw = Math.max(0, s) * 0.35; bod.rotation.x = s * 0.4; } else bod.rotation.x = 0;
      capG.scale.set(1 + puff * 0.35, 1 - puff * 0.3 + bump(a.k, 0.55, 0.8) * 0.5, 1 + puff * 0.35);
      B.position.set(0, hop(a, 12, 0.12), fw);
      // its legs scuttle in little bursts
      const scuttle = a.pose === 'walk' || ((t + seed) % 3.5 < 0.5) ? 1 : 0;
      legs.forEach((l, i) => { l.rotation.x = scuttle * wob(t, 24, 0.4, i * 1.3); l.rotation.z = wob(t, 2, 0.05, i); });
      ants.forEach((an, i) => { an.rotation.x = wob(t, 4, 0.25, i * 2); an.rotation.z = wob(t, 3, 0.15, i); });
      squash(bod, wob(t, 3, 0.03));
      mouth.scale.y = 0.3 + puff * 0.5; alive(a, E, seed, puff);
    },
    ambient(c, a) { if (every(a, 1.2)) { const p = c.at(capG, [0, 0.2, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.3, color: SPORE[(Math.random() * 3) | 0], size: 0.06, life: 1.4, drag: 0.6 }); } },
    moves: {
      ability: { dur: 1.0, hit: 0.5, fx: async (c) => { const p = c.at(capG, [0, 0.2, 0]); for (let i = 0; i < 16; i++) c.fx.soft({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 1.2, color: '#9B6BFF', size: 0.3, grow: 0.8, life: 1.4, alpha: 0.45 }); if (c.target) await c.fx.shot(p, c.target, { kind: 'spore', color: '#B88BFF', dur: 0.6, size: 0.35, arc: 1 }); } },
    },
  };
};

export const mudslug: Builder = (k) => {
  const seed = Math.random() * 9;
  const skin = k.mat('#7A6A3A', 'skin', { clearcoat: 0.9, clearcoatRoughness: 0.1 }), belly = k.mat('#B8A26A', 'skin'), spot = k.mat('#5A4A22', 'skin'), mud = k.mat('#5A4428', 'skin', { clearcoat: 0.6 });
  const B = k.g(k.root), body = k.g(B, [0, 0, 0]);
  const segs = [0, 1, 2, 3, 4].map((i) => { const s = k.g(body, [0, 0.13 + (i === 0 ? 0.08 : 0), 0.22 - i * 0.14]); k.sphere(s, 0.17 - i * 0.022, skin, [0, 0, 0], [1, 0.85, 1.2], 16); k.sphere(s, 0.15 - i * 0.02, belly, [0, -0.07, 0], [1.05, 0.4, 1.2], 12); if (i > 0) k.sphere(s, 0.04, spot, [0.06 * (i % 2 ? 1 : -1), 0.12 - i * 0.015, 0], [1, 0.4, 1], 8); return s; });
  const head = k.g(segs[0], [0, 0.08, 0.1]);
  k.sphere(head, 0.15, skin, [0, 0, 0], [1, 0.9, 1]);
  const stalks = [-1, 1].map((x) => { const s = k.g(head, [x * 0.06, 0.1, 0]); k.tube(s, [[0, 0, 0], [x * 0.03, 0.12, 0.02], [x * 0.05, 0.22, 0.03]], 0.025, 0.018, skin); return s; });
  const eyeL = k.eyes(stalks[0], { y: 0.24, z: 0.04, spread: 0, r: 0.055, iris: '#C8A020', lid: skin, one: true });
  const eyeR = k.eyes(stalks[1], { y: 0.24, z: 0.04, spread: 0, r: 0.055, iris: '#C8A020', lid: skin, one: true });
  stalks[0].children.at(-1)!.position.x = -0.05; stalks[1].children.at(-1)!.position.x = 0.05;
  const mouth = k.mouth(head, [0, -0.04, 0.13], 0.06, { tongue: true });
  const drips = [0, 1].map((i) => k.sphere(body, 0.03, mud, [i ? 0.1 : -0.12, 0.05, -0.2 * i], [1, 1.5, 1], 8));
  return {
    height: 0.7,
    anim(a) {
      const t = a.t;
      let spit = 0, fw = 0, crawl = a.pose === 'walk' ? 1 : 0.3;
      if (a.act === 'ability') spit = bump(a.k, 0.2, 0.7);
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.3; crawl = 1; }
      segs.forEach((s, i) => { s.scale.set(1, 1 + wob(t, 4 * crawl + 1, 0.08, -i * 0.9), 1 - wob(t, 4 * crawl + 1, 0.06, -i * 0.9)); s.position.x = wob(t, 1.2, 0.02, i); });
      head.rotation.x = -spit * 0.5 + bump(a.k, 0.5, 0.8) * 0.6; head.rotation.y = wob(t, 0.6, 0.2, seed);
      stalks.forEach((s, i) => { s.rotation.z = wob(t, 1.7, 0.25, i * 1.5 + seed); s.rotation.x = wob(t, 1.1, 0.15, i); });
      B.position.set(0, hop(a, 6, 0.06), fw);
      drips.forEach((d, i) => { const f = (t * 0.4 + i * 0.5) % 1; d.scale.set(1, 1 + f, 1); d.position.y = 0.05 - f * 0.04; });
      mouth.scale.y = 0.25 + spit * 0.9;
      alive(a, eyeL, seed, spit * 0.5, [0, 0]); alive(a, eyeR, seed + 0.3, spit * 0.5, [0, 0]);
      squash(body, 0);
    },
    moves: {
      ability: { dur: 0.8, hit: 0.55, fx: async (c) => { const m = c.at(mouth, [0, 0, 0.05]); if (c.target) { await c.fx.shot(m, c.target, { kind: 'goo', color: '#7A5A2A', dur: 0.4, size: 0.25, arc: 0.6 }); sparks(c.fx, c.target, SPORE, 10, 1.5); } } },
    },
  };
};

export const fungalshaman: Builder = (k) => {
  const seed = Math.random() * 9;
  const cap = k.mat('#6A3A9A', 'candy'), capDot = k.mat('#E8FF9A', 'glow', { emissiveIntensity: 0.8 }), skin = k.mat('#E8D2B0', 'skin'), robe = k.mat('#3A5A3A', 'cloth'), robe2 = k.mat('#5A7A3A', 'cloth'), beard = k.mat('#8AB86A', 'fur'), wood = k.mat('#6A4A2A', 'bark'), orb = k.mat('#C89BFF', 'glow');
  const B = k.g(k.root), body = k.g(B, [0, 0, 0]);
  k.lathe(body, [[0.001, 0], [0.3, 0.0], [0.27, 0.15], [0.2, 0.42], [0.12, 0.55], [0.001, 0.57]], robe);
  k.torus(body, 0.28, 0.03, robe2, [0, 0.04, 0], [Math.PI / 2, 0, 0]);
  const head = k.g(body, [0, 0.66, 0.02]);
  k.sphere(head, 0.15, skin, [0, 0, 0], [1, 0.95, 0.95]);
  const E = k.eyes(head, { y: 0.0, z: 0.11, spread: 0.065, r: 0.05, iris: '#9B6BFF', lid: skin, glow: true });
  k.sphere(head, 0.035, skin, [0, -0.04, 0.14], [1, 1.2, 1]);
  const bd = k.g(head, [0, -0.08, 0.08]); for (let i = 0; i < 7; i++) k.sphere(bd, 0.05, beard, [(i - 3) * 0.035, -Math.abs(i - 3) * -0.01 - 0.04, 0], [1, 1.8, 0.7], 8); k.sphere(bd, 0.07, beard, [0, -0.15, 0.01], [1, 1.5, 0.7], 10);
  // a big mushroom hat
  const hat = k.g(head, [0, 0.11, -0.01]);
  k.mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap, hat, [0, 0, 0], undefined, [1, 0.75, 1]);
  k.cyl(hat, 0.3, 0.25, 0.025, k.mat('#E8C8B8', 'skin'), [0, 0, 0], undefined, 24);
  for (let i = 0; i < 8; i++) { const q = i * 2.4, r = 0.07 + (i % 3) * 0.07; k.sphere(hat, 0.03, capDot, [Math.cos(q) * r, Math.sqrt(Math.max(0, 0.09 - r * r)) * 0.75, Math.sin(q) * r], [1, 0.4, 1], 8); }
  const arm = (x: number) => { const sh = k.g(body, [x * 0.17, 0.45, 0.02]); k.cap(sh, 0.05, 0.2, robe, [x * 0.04, -0.12, 0.04], [0.3, 0, x * 0.3]); k.sphere(sh, 0.045, skin, [x * 0.08, -0.24, 0.1]); return sh; };
  const aL = arm(-1), aR = arm(1);
  const staff = k.g(aR, [0.09, -0.24, 0.1]);
  k.tube(staff, [[0, -0.35, 0], [0.01, 0, 0], [-0.02, 0.3, 0], [0.04, 0.4, 0], [0.0, 0.48, 0]], 0.02, 0.014, wood);
  const orbM = k.sphere(staff, 0.07, orb, [0, 0.42, 0]);
  for (let i = 0; i < 3; i++) k.mesh(new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, staff, [Math.cos(i * 2.1) * 0.03, -0.05 + i * 0.12, Math.sin(i * 2.1) * 0.03 + 0.02], undefined, [1, 0.5, 1]);
  const motesG = k.g(B, [0, 0.8, 0]); const orbits = [0, 1, 2].map((i) => k.sphere(motesG, 0.025, capDot, [Math.cos(i * 2.1) * 0.35, 0, Math.sin(i * 2.1) * 0.35], undefined, 8));
  return {
    height: 1.2,
    anim(a) {
      const t = a.t;
      let raise = 0, fw = 0, chant = 0;
      if (a.act === 'ability' || a.act === 'play') { raise = bump(a.k, 0, 1); chant = raise; }
      if (a.act === 'attack') { const s = strike(a.k); aR.rotation.x = -Math.max(0, -s) * 1.6 + Math.max(0, s) * 0.8; fw = Math.max(0, s) * 0.25; } else aR.rotation.x = -raise * 1.8 + wob(t, 1.2, 0.08);
      aL.rotation.x = -raise * 1.2 + wob(t, 1.3, 0.1, 2); aL.rotation.z = -raise * 0.5;
      body.rotation.z = wob(t, 0.9, 0.04, seed) + chant * wob(t, 8, 0.06);
      head.rotation.y = wob(t, 0.5, 0.25, seed); hat.rotation.z = wob(t, 1.4, 0.05);
      B.position.set(0, hop(a, 6, 0.08) + raise * 0.1, fw);
      motesG.rotation.y = t * (1.2 + raise * 6); orbits.forEach((o2, i) => { o2.position.y = wob(t, 2, 0.08, i * 2); });
      orb.emissiveIntensity = 1.6 + wob(t, 3, 0.6) + raise * 3; orbM.scale.setScalar(1 + raise * 0.5);
      alive(a, E, seed, chant * 0.8);
    },
    moves: {
      ability: { dur: 1.8, hit: 0.6, fx: (c) => {
        const p = c.at(orbM); motes(c.fx, c.self, SPORE, 36, 0.8);
        // a ghostly wisp spirals up out of the bog and down into the hand
        for (let i = 0; i < 24; i++) c.fx.add({ x: p.x, y: p.y - 1, z: p.z, vx: Math.cos(i) * 0.4, vy: 1.6, vz: Math.sin(i) * 0.4, color: i % 2 ? '#C89BFF' : '#FFFFFF', size: 0.14, life: 1.1, attract: { x: p.x, y: p.y + 0.6, z: p.z, k: 3, swirl: 4 } });
        c.fx.emoji(p.clone().setY(p.y + 0.6), '👻', 0.6);
      } },
    },
  };
};

export const swamplurker: Builder = (k) => {
  const seed = Math.random() * 9;
  const skin = k.mat('#4A7A3A', 'shell'), dark = k.mat('#2E4A26', 'shell'), belly = k.mat('#C8C88A', 'skin'), moss = k.mat('#6A9A3A', 'fur'), weed = k.mat('#5A8A2A', 'leaf');
  const B = k.g(k.root), body = k.g(B, [0, 0.24, -0.1]);
  k.sphere(body, 0.3, skin, [0, 0, 0], [1.05, 0.62, 1.55]);
  k.sphere(body, 0.26, belly, [0, -0.06, 0], [1, 0.4, 1.45]);
  for (let i = 0; i < 8; i++) for (const x of [-1, 1]) k.cone(body, 0.04, 0.08, dark, [x * 0.09, 0.17, 0.32 - i * 0.1], undefined, 4);
  for (let i = 0; i < 3; i++) k.sphere(body, 0.07, moss, [Math.sin(i * 3) * 0.12, 0.17, 0.1 - i * 0.15], [1.2, 0.4, 1], 8);
  k.leaf(body, 0.3, 0.06, weed, [0.1, 0.16, -0.1], [0.5, 0.2, -0.8]);
  const head = k.g(body, [0, 0.05, 0.45]);
  const upper = k.g(head, [0, 0.03, 0]), lower = k.g(head, [0, -0.04, 0]);
  k.sphere(upper, 0.17, skin, [0, 0.02, 0], [1, 0.6, 1]);
  k.box(upper, 0.2, 0.08, 0.34, skin, [0, 0.0, 0.2]); k.sphere(upper, 0.1, skin, [0, 0.0, 0.36], [1, 0.4, 1]);
  for (let i = 0; i < 6; i++) for (const x of [-1, 1]) k.cone(upper, 0.016, 0.06, k.mat('#FFFDF0', 'eye'), [x * 0.09, -0.05, 0.08 + i * 0.055], [Math.PI, 0, 0], 4);
  k.box(lower, 0.18, 0.05, 0.32, belly, [0, -0.01, 0.18]);
  for (let i = 0; i < 5; i++) for (const x of [-1, 1]) k.cone(lower, 0.014, 0.05, k.mat('#FFFDF0', 'eye'), [x * 0.08, 0.03, 0.1 + i * 0.055], undefined, 4);
  // eyes up on top, peeking above the "waterline"
  const E = k.eyes(upper, { y: 0.11, z: 0.02, spread: 0.08, r: 0.06, iris: '#E8C820', lid: skin, tilt: 0.2 });
  for (const x of [-1, 1]) k.sphere(upper, 0.025, dark, [x * 0.04, 0.04, 0.38]);
  const tail = k.g(body, [0, 0, -0.45]); k.tube(tail, [[0, 0, 0], [0, -0.03, -0.2], [0, -0.06, -0.4], [0, -0.07, -0.55]], 0.15, 0.02, skin);
  const legs = [[-0.27, 0.2], [0.27, 0.2], [-0.27, -0.2], [0.27, -0.2]].map(([x, z]) => { const l = k.g(B, [x, 0.18, z - 0.1]); k.cap(l, 0.06, 0.08, skin, [x * 0.1, -0.07, 0], [0, 0, (x > 0 ? 1 : -1) * 0.8]); k.sphere(l, 0.07, skin, [x * 0.28, -0.14, 0.03], [1, 0.4, 1.3]); return l; });
  return {
    height: 0.75,
    anim(a) {
      const t = a.t;
      let snap = 0, fw = 0, rear = 0, gulp = 0;
      if (a.act === 'attack') { const s = strike(a.k, 0.5); fw = Math.max(0, s) * 0.5; snap = a.k < 0.5 ? bump(a.k, 0, 0.5) : 0; rear = Math.max(0, -s) * 0.3; }
      if (a.act === 'ability') { gulp = bump(a.k, 0, 1); snap = a.k < 0.5 ? bump(a.k, 0, 0.5) : 0; rear = gulp * 0.4; }
      // the jaws hang a little open; it snaps them shut now and then
      const idleJaw = (t + seed) % 6 < 0.25 ? 0 : 0.12 + wob(t, 0.8, 0.04);
      lower.rotation.x = idleJaw + snap * 0.8; upper.rotation.x = -snap * 0.3;
      body.rotation.x = -rear; body.scale.setScalar(1 + gulp * 0.12);
      B.position.set(0, hop(a, 5, 0.05), fw);
      tail.rotation.y = wob(t, 1.2, 0.4); head.rotation.y = wob(t, 0.4, 0.15, seed);
      legs.forEach((l, i) => { l.rotation.y = a.pose === 'walk' ? wob(t, 10, 0.5, i * Math.PI) : 0; });
      alive(a, E, seed, 0, [wob(t, 0.3, 0.3, seed), -0.2]);
    },
    moves: {
      ability: { dur: 1.2, hit: 0.5, fx: (c) => { motes(c.fx, c.self, ['#C89BFF', '#9BFF7A'], 24, 0.7); c.fx.ring(c.self, '#9B6BFF', 1.6); } },
    },
  };
};

export const rotqueen: Builder = (k) => {
  const seed = Math.random() * 9;
  const fuzz = k.mat('#4A2A5A', 'fur'), fuzzL = k.mat('#C8B8E8', 'fur'), crown = k.mat('#E8C84A', 'metal'), gem = k.mat('#9BFF7A', 'glow');
  const wingTex = k.paint(256, 256, (g) => {
    const gr = g.createRadialGradient(40, 128, 10, 40, 128, 240); gr.addColorStop(0, '#2A1A3A'); gr.addColorStop(0.4, '#6A3A9A'); gr.addColorStop(0.8, '#3A8A5A'); gr.addColorStop(1, '#1A1A2A');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (const [x, y, r] of [[150, 90, 30], [170, 170, 24], [100, 210, 16]]) { g.fillStyle = '#D8FF8A'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#2A1A3A'; g.beginPath(); g.arc(x, y, r * 0.55, 0, 7); g.fill(); g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.15, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 128); g.quadraticCurveTo(120, 128 - 100 + i * 40, 256, i * 50); g.stroke(); }
  });
  const wingM = k.mat('#FFFFFF', 'cloth', { map: wingTex, emissive: '#3A2A4A', emissiveIntensity: 0.3 });
  const B = k.g(k.root), body = k.g(B, [0, 0.95, 0]);
  k.sphere(body, 0.16, fuzz, [0, 0, 0], [1, 1.1, 1]);
  const abd = k.g(body, [0, -0.15, -0.08]); for (let i = 0; i < 4; i++) k.sphere(abd, 0.14 - i * 0.022, i % 2 ? fuzzL : fuzz, [0, -i * 0.1, -i * 0.04], [1, 0.8, 1], 14);
  k.sphere(body, 0.12, fuzzL, [0, 0.12, 0.02], [1.4, 0.7, 1.1]);
  const head = k.g(body, [0, 0.22, 0.06]);
  k.sphere(head, 0.13, fuzz, [0, 0, 0], [1.1, 1, 1]);
  const E = k.eyes(head, { y: 0.0, z: 0.08, spread: 0.07, r: 0.06, iris: '#9BFF7A', lid: fuzz, glow: true, tilt: -0.2 });
  // feathery antennae and a little crown
  for (const x of [-1, 1]) { const an = k.g(head, [x * 0.05, 0.1, 0.03]); k.tube(an, [[0, 0, 0], [x * 0.08, 0.15, 0.05], [x * 0.2, 0.22, 0.0]], 0.01, 0.006, fuzzL); for (let i = 0; i < 5; i++) k.leaf(an, 0.07, 0.025, fuzzL, [x * (0.04 + i * 0.035), 0.08 + i * 0.03, 0.03], [0, 0, x * -1.2]); }
  const cr = k.g(head, [0, 0.11, 0]); k.cyl(cr, 0.07, 0.08, 0.04, crown, [0, 0, 0], undefined, 10); for (let i = 0; i < 5; i++) { const q = (i / 5) * Math.PI * 2; k.cone(cr, 0.015, 0.06, crown, [Math.cos(q) * 0.07, 0.04, Math.sin(q) * 0.07], undefined, 5); } k.sphere(cr, 0.02, gem, [0, 0.03, 0.07]);
  const wings = ([-1, 1] as const).map((x) => { const w = k.wing(body, 'moth', 0.62, wingM, [x * 0.08, 0.05, -0.04], x); return w; });
  const hind = ([-1, 1] as const).map((x) => { const w = k.wing(body, 'moth', 0.36, wingM, [x * 0.06, -0.12, -0.06], x); w.rotation.z = -x * 0.9; return w; });
  const legs = Array.from({ length: 4 }, (_, i) => { const x = i % 2 ? 1 : -1; const l = k.g(body, [x * 0.08, -0.08, 0.05 - Math.floor(i / 2) * 0.06]); k.tube(l, [[0, 0, 0], [x * 0.08, -0.08, 0.04], [x * 0.1, -0.22, 0.06]], 0.012, 0.006, fuzz); return l; });
  return {
    height: 1.6,
    anim(a) {
      const t = a.t;
      let beat = 0, fw = 0;
      if (a.act === 'ability' || a.act === 'play') beat = bump(a.k, 0, 1);
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.45; body.rotation.x = s * 0.3; } else body.rotation.x = 0;
      const f = wob(t, 3 + beat * 10, 0.35 + beat * 0.5);
      wings.forEach((w) => { const x = w.userData.side as number; w.rotation.y = -x * (0.3 + f); w.rotation.z = x * 0.15; });
      hind.forEach((w) => { const x = w.userData.side as number; w.rotation.y = -x * (0.3 + f * 0.8); });
      body.position.y = 0.95 + wob(t, 3, 0.06) + beat * 0.25; B.position.z = fw;
      abd.rotation.x = wob(t, 1.5, 0.1); head.rotation.y = wob(t, 0.5, 0.2, seed);
      legs.forEach((l, i) => { l.rotation.x = wob(t, 2, 0.15, i); });
      gem.emissiveIntensity = 2 + wob(t, 2, 0.8) + beat * 2;
      alive(a, E, seed, 0);
    },
    ambient(c, a) { if (every(a, 4)) { const p = c.at(wings[(Math.random() * 2) | 0], [0.5, 0.3, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vy: -0.3, vx: (Math.random() - 0.5) * 0.3, color: SPORE[(Math.random() * 3) | 0], size: 0.05, life: 1.5 }); } },
    moves: {
      ability: { dur: 1.7, hit: 0.5, fx: async (c) => {
        const p = c.self.clone().setY(c.self.y + 1.1); c.fx.ring(c.self, '#9B6BFF', 3);
        for (let i = 0; i < 30; i++) c.fx.soft({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 0.5, vz: c.fwd.z * (1 + Math.random() * 2), color: i % 2 ? '#9B6BFF' : '#5A8A3A', size: 0.35, grow: 0.8, life: 1.6, alpha: 0.35 });
        await Promise.all(c.targets.map((g, i) => new Promise<void>((r) => setTimeout(() => void stream(c, p, g, 4, 60, { kind: 'spore', color: '#B88BFF', dur: 0.6, size: 0.25, arc: 0.6 }).then(r), i * 80))));
      } },
    },
  };
};
