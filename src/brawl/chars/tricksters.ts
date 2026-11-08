// ✨ The tricksters: the Hypno Toad (its spiral eyes win enemies over), the Pickpocket Raccoon (masked, with a loot
// sack) and the Doppel Goo (a wobbly blob that becomes whatever it looks at).
import * as THREE from 'three';
import { alive, bump, every, hop, sparks, squash, strike, wob, type Builder } from './core';

export const hypnotoad: Builder = (k) => {
  const seed = Math.random() * 9;
  const skin = k.mat('#6AC85A', 'skin', { clearcoat: 0.8, clearcoatRoughness: 0.15 }), belly = k.mat('#E8F8C8', 'skin'), spot = k.mat('#3A8A3A', 'skin'), sac = k.mat('#C89BFF', 'jelly', { opacity: 0.85 }), gold = k.mat('#FFD24A', 'metal');
  const spiralT = k.paint(128, 128, (g) => { g.fillStyle = '#FFF4FF'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#9B3AFF'; g.lineWidth = 9; g.beginPath(); for (let i = 0; i < 220; i++) { const q = i * 0.13, r = i * 0.27; g.lineTo(64 + Math.cos(q) * r, 64 + Math.sin(q) * r); } g.stroke(); });
  const spiral = k.mat('#FFFFFF', 'glow', { map: spiralT, emissive: '#FFFFFF', emissiveMap: spiralT, emissiveIntensity: 0.9 });
  const B = k.g(k.root), body = k.g(B, [0, 0.3, 0]);
  k.sphere(body, 0.36, skin, [0, 0, 0], [1.15, 0.78, 1.05]);
  k.sphere(body, 0.28, belly, [0, -0.08, 0.14], [1.1, 0.7, 0.8]);
  for (let i = 0; i < 6; i++) { const q = i * 2.1; k.sphere(body, 0.05, spot, [Math.cos(q) * 0.28, 0.16, Math.sin(q) * 0.25 - 0.05], [1, 0.4, 1], 8); }
  const head = k.g(body, [0, 0.16, 0.16]);
  // the bulging spiral eyes on top of its head
  const eyes = [-1, 1].map((x) => { const e = k.g(head, [x * 0.17, 0.14, 0.02]); k.sphere(e, 0.13, skin, [0, 0, 0]); const disc = k.mesh(new THREE.CircleGeometry(0.1, 28), spiral, e, [0, 0.01, 0.125]); disc.castShadow = false; return { e, disc }; });
  const lidM = skin;
  const lids = eyes.map(({ e }) => { const l = k.g(e); k.mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidM, l); l.rotation.x = -1.5; return l; });
  const mouth = k.g(head, [0, -0.05, 0.2]); k.torus(mouth, 0.2, 0.018, k.mat('#2A4A2A', 'dark'), [0, 0, 0], [0, 0, Math.PI], Math.PI);
  const throat = k.sphere(body, 0.17, sac, [0, -0.12, 0.3], [1.1, 0.9, 0.9]);
  const crown = k.g(head, [0, 0.28, 0]); k.cyl(crown, 0.09, 0.1, 0.06, gold, [0, 0, 0], undefined, 8); for (let i = 0; i < 5; i++) { const q = (i / 5) * Math.PI * 2; k.cone(crown, 0.02, 0.06, gold, [Math.cos(q) * 0.09, 0.05, Math.sin(q) * 0.09], undefined, 4); }
  const legs = [-1, 1].map((x) => { const l = k.g(B, [x * 0.3, 0.12, -0.05]); k.sphere(l, 0.15, skin, [0, 0, 0], [0.8, 0.7, 1.3]); k.sphere(l, 0.08, skin, [x * 0.04, -0.09, 0.2], [1.6, 0.4, 1.2]); return l; });
  for (const x of [-1, 1]) k.sphere(B, 0.06, skin, [x * 0.18, 0.04, 0.32], [1.4, 0.4, 1.2]);
  const tongue = k.g(head, [0, -0.05, 0.22]); const tm = k.cap(tongue, 0.035, 0.6, k.mat('#FF5A8A', 'skin'), [0, 0, 0.3], [Math.PI / 2, 0, 0]); tongue.scale.set(1, 1, 0.01); void tm;
  let spin = 0;
  return {
    height: 1.0,
    anim(a) {
      const t = a.t;
      let stare = 0, lash = 0, up = hop(a, 6, 0.2);
      if (a.act === 'ability' || a.act === 'play') stare = bump(a.k, 0, 1);
      if (a.act === 'attack') { lash = bump(a.k, 0.3, 0.75); up += bump(a.k, 0, 0.35) * 0.1; }
      spin += a.dt * (1.5 + stare * 14);
      eyes.forEach(({ disc }, i) => { disc.rotation.z = spin * (i ? -1 : 1); });
      // it blinks slowly, sideways-lidded, like a sleepy frog
      const bl = (t + seed) % 4.5 < 0.25 ? Math.sin(((t + seed) % 4.5) / 0.25 * Math.PI) : 0;
      lids.forEach((l) => { l.rotation.x = -1.5 + Math.max(bl, a.hurt * 0.8) * 1.5 + (stare ? -0.2 : 0); });
      throat.scale.setScalar(1 + Math.max(0, Math.sin(t * 3)) * 0.25 + stare * 0.4);
      tongue.scale.z = Math.max(0.01, lash * 2.2);
      spiral.emissiveIntensity = 0.9 + stare * 2.5;
      B.position.y = up; squash(body, wob(t, 1.8, 0.03) - bump(a.k, 0, 0.3) * (a.act === 'attack' ? 0.15 : 0));
      head.rotation.y = wob(t, 0.4, 0.2, seed);
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' ? wob(t, 8, 0.4, i * Math.PI) : 0; });
      crown.rotation.y = t * 0.6;
    },
    moves: {
      ability: { dur: 1.6, hit: 0.55, fx: async (c) => {
        const from = c.at(head, [0, 0.14, 0.15]);
        if (c.target) for (let i = 0; i < 5; i++) setTimeout(() => void c.fx.shot(from, c.target!, { kind: 'spark', color: i % 2 ? '#C89BFF' : '#FF4FD8', dur: 0.5, arc: 0.4, size: 0.3 }), i * 90);
        sparks(c.fx, from, ['#C89BFF', '#FF4FD8', '#FFFFFF'], 24, 2, { gravity: -0.5, life: 1.2 });
        c.fx.emoji(from.clone().setY(from.y + 0.5), '🌀', 0.6);
      } },
    },
  };
};

export const pickpocket: Builder = (k) => {
  const seed = Math.random() * 9;
  const fur = k.mat('#8A8A9A', 'fur'), light = k.mat('#E8E4F0', 'fur'), dark = k.mat('#2A2A36', 'fur'), nose = k.mat('#140C14', 'shell'), sack = k.mat('#B8864A', 'cloth'), coin = k.mat('#FFD24A', 'metal');
  const B = k.g(k.root), body = k.g(B, [0, 0.38, 0]);
  k.sphere(body, 0.22, fur, [0, 0, 0], [0.95, 1.1, 0.9]);
  k.sphere(body, 0.15, light, [0, -0.05, 0.12], [1, 1.1, 0.6]);
  const head = k.g(body, [0, 0.3, 0.04]);
  k.sphere(head, 0.2, fur, [0, 0, 0], [1.15, 0.95, 0.95]);
  k.sphere(head, 0.11, light, [0, -0.06, 0.13], [1.2, 0.8, 1]); k.cone(head, 0.06, 0.14, light, [0, -0.06, 0.24], [Math.PI / 2, 0, 0], 10); k.sphere(head, 0.028, nose, [0, -0.05, 0.31]);
  // the bandit mask
  k.mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 24, Math.PI), dark, head, [0, 0.03, 0.12], [0, 0, 0], [1.25, 0.6, 1]);
  const E = k.eyes(head, { y: 0.03, z: 0.15, spread: 0.08, r: 0.055, iris: '#3A2A1A', lid: dark, tilt: -0.2 });
  const ears = [-1, 1].map((x) => { const e = k.g(head, [x * 0.13, 0.15, -0.02], [0, 0, -x * 0.3]); k.cone(e, 0.06, 0.12, fur, [0, 0.05, 0], undefined, 8); k.cone(e, 0.035, 0.07, light, [0, 0.04, 0.02], undefined, 8); return e; });
  const tail = k.g(body, [0, -0.08, -0.2]);
  for (let i = 0; i < 6; i++) k.sphere(tail, 0.085 - i * 0.004, i % 2 ? dark : fur, [0, 0.04 + i * 0.07, -0.08 - Math.sin(i * 0.4) * 0.06], [1, 0.75, 1], 10);
  const arms = [-1, 1].map((x) => { const a2 = k.g(body, [x * 0.18, 0.08, 0.08]); k.cap(a2, 0.04, 0.12, dark, [x * 0.03, -0.08, 0.03], [0.4, 0, x * 0.3]); return a2; });
  // the loot sack over its shoulder, a coin peeking out
  const bag = k.g(body, [0.2, 0.12, -0.12]); k.sphere(bag, 0.13, sack, [0, 0, 0], [1, 1.1, 1]); k.cyl(bag, 0.04, 0.06, 0.06, sack, [0, 0.14, 0]); k.cyl(bag, 0.04, 0.04, 0.01, coin, [0.05, 0.1, 0.08], [1, 0, 0.3]);
  const legs = [-1, 1].map((x) => { const l = k.g(B, [x * 0.1, 0.2, 0]); k.cap(l, 0.05, 0.1, dark, [0, -0.09, 0]); k.sphere(l, 0.06, dark, [0, -0.18, 0.04], [1, 0.6, 1.4]); return l; });
  return {
    height: 1.0,
    anim(a) {
      const t = a.t;
      let sneak = 0, grab = 0, fw = 0;
      if (a.act === 'ability' || a.act === 'play') { sneak = bump(a.k, 0, 0.5); grab = bump(a.k, 0.4, 1); }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.4; grab = Math.max(0, s); }
      // shifty: it looks left and right, rubbing its little hands together
      const look = Math.sin(t * 0.9 + seed) > 0.4 ? 0.5 : Math.sin(t * 0.9 + seed) < -0.4 ? -0.5 : 0;
      head.rotation.y += (look - head.rotation.y) * Math.min(1, a.dt * 8);
      arms[0].rotation.x = -0.6 + wob(t, 9, 0.12) - grab * 1.2; arms[1].rotation.x = -0.6 - wob(t, 9, 0.12) - grab * 0.4;
      body.position.y = 0.38 - sneak * 0.12; body.rotation.x = sneak * 0.3;
      B.position.set(0, hop(a, 9, 0.14), fw);
      tail.rotation.y = wob(t, 2.2, 0.4); tail.rotation.x = wob(t, 1.4, 0.15);
      ears.forEach((e, i) => { e.rotation.x = wob(t, 3, 0.1, i); });
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' || sneak > 0.2 ? wob(t, 14, 0.4, i * Math.PI) : 0; });
      bag.rotation.z = wob(t, 2, 0.08);
      squash(body, wob(t, 2.5, 0.02)); alive(a, E, seed, sneak * 0.5, [look * 1.4, 0]);
    },
    ambient(c, a) { if (every(a, 0.6)) { const p = c.at(bag, [0, 0.15, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vy: 0.4, color: '#FFE14D', size: 0.06, life: 0.8 }); } },
    moves: {
      ability: { dur: 1.3, hit: 0.5, fx: (c) => { const p = c.at(bag, [0, 0.2, 0]); sparks(c.fx, p, ['#FFD24A', '#FFFFFF'], 20, 2); c.fx.emoji(p.clone().setY(p.y + 0.5), '👀', 0.55); } },
    },
  };
};

export const doppelgoo: Builder = (k) => {
  const seed = Math.random() * 9;
  const goo = k.mat('#FF9AE0', 'jelly', { opacity: 0.8 }), core = k.mat('#C86AFF', 'glow', { emissiveIntensity: 0.8 }), shine = k.mat('#FFFFFF', 'glow');
  const B = k.g(k.root), body = k.g(B, [0, 0, 0]);
  k.lathe(body, [[0.001, 0], [0.34, 0.02], [0.36, 0.14], [0.3, 0.34], [0.18, 0.5], [0.06, 0.58], [0.001, 0.6]], goo);
  const heart = k.sphere(body, 0.1, core, [0, 0.22, 0]);
  const E = k.eyes(body, { y: 0.36, z: 0.24, spread: 0.11, r: 0.09, iris: '#7A2AB0', lid: goo });
  const mouth = k.mouth(body, [0, 0.22, 0.31], 0.06, { color: '#7A2A6A' });
  k.sphere(body, 0.05, shine, [-0.15, 0.45, 0.16], [1, 0.6, 0.5]);
  // little drips and a few bubbles floating inside
  const bubbles = [0, 1, 2, 3].map((i) => k.sphere(body, 0.03 + (i % 2) * 0.015, shine, [Math.cos(i * 2) * 0.15, 0.1 + i * 0.08, Math.sin(i * 2) * 0.12], undefined, 8));
  return {
    height: 0.75,
    anim(a) {
      const t = a.t;
      let stretch = 0, fw = 0;
      if (a.act === 'ability' || a.act === 'play') stretch = bump(a.k, 0, 0.8);
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.35; stretch = Math.max(0, s) * 0.5 - Math.max(0, -s) * 0.3; }
      squash(body, wob(t, 3.5, 0.07) + wob(t, 7.7, 0.03) + stretch * 0.5);
      body.rotation.z = wob(t, 1.3, 0.08, seed); B.position.set(0, hop(a, 7, 0.16), fw);
      // its colour keeps shifting, like it can't decide what to be
      goo.color.setHSL((0.88 + Math.sin(t * 0.5 + seed) * 0.08 + stretch * 0.3) % 1, 0.95, 0.7);
      heart.scale.setScalar(1 + Math.max(0, Math.sin(t * 4)) * 0.3);
      bubbles.forEach((b, i) => { b.position.y = 0.1 + ((t * 0.15 + i * 0.25) % 0.45); });
      mouth.scale.y = 0.3 + stretch * 0.8; alive(a, E, seed, 0);
    },
    moves: {
      ability: { dur: 1.3, hit: 0.6, fx: (c) => { sparks(c.fx, c.self.clone().setY(c.self.y + 0.5), ['#FF9AE0', '#C86AFF', '#FFFFFF', '#8AD8FF'], 40, 2.6); c.fx.ring(c.self, '#FF9AE0', 1.8); } },
    },
  };
};
