// 🍬 Sugar: Gumdrop Imp, Jellyfright, Taffy Twister, the Candied Knight and the Sugar Colossus.
import * as THREE from 'three';
import { alive, bump, every, hop, motes, sideOf, sparks, squash, strike, wob, type Builder } from './core';

const CANDY = ['#FF4FD8', '#FFE14D', '#5AE0FF', '#7BFF9A', '#FF7A5A'];

export const gumdropimp: Builder = (k) => {
  const seed = Math.random() * 9;
  const gum = k.mat('#FF3A6A', 'jelly'), sugarM = k.mat('#FFFFFF', 'candy'), horn = k.mat('#FFE14D', 'candy'), dark = k.mat('#7A0A2A', 'candy');
  const B = k.g(k.root), body = k.g(B, [0, 0, 0]);
  k.lathe(body, [[0.001, 0.0], [0.3, 0.0], [0.32, 0.06], [0.27, 0.3], [0.17, 0.5], [0.06, 0.58], [0.001, 0.59]], gum);
  // sugar crystals all over
  for (let i = 0; i < 26; i++) { const y = 0.05 + (i / 26) * 0.5, r = 0.31 - y * 0.42, q = i * 2.4; k.box(body, 0.025, 0.025, 0.025, sugarM, [Math.cos(q) * r, y, Math.sin(q) * r], [i, i * 2, 0]); }
  const face = k.g(body, [0, 0.27, 0.24]);
  const E = k.eyes(face, { y: 0.03, z: 0.0, spread: 0.09, r: 0.07, iris: '#FFE14D', lid: gum, tilt: -0.35 });
  const mouth = k.mouth(face, [0, -0.1, 0.02], 0.08, { fangs: 2, color: '#5A0A1A' });
  for (const x of [-1, 1]) k.cone(body, 0.04, 0.14, horn, [x * 0.1, 0.56, 0], [0, 0, -x * 0.4], 8);
  const tail = k.g(body, [0, 0.08, -0.28]); k.tube(tail, [[0, 0, 0], [0, 0.05, -0.15], [0, 0.2, -0.22], [0, 0.3, -0.15]], 0.025, 0.015, dark);
  const tip = k.g(tail, [0, 0.31, -0.14]); for (const x of [-1, 1]) k.sphere(tip, 0.04, dark, [x * 0.03, 0.02, 0], [1, 1, 0.6]); k.cone(tip, 0.05, 0.07, dark, [0, -0.03, 0], [Math.PI, 0, 0], 8);
  const arms = [-1, 1].map((x) => { const a = k.g(body, [x * 0.27, 0.2, 0.05]); k.sphere(a, 0.06, gum, [x * 0.06, 0, 0], [1.3, 0.8, 0.8]); return a; });
  let flip = 0;
  return {
    height: 0.8,
    anim(a) {
      const t = a.t;
      let sq = wob(t, 3.6, 0.06), up = hop(a, 10, 0.2), fw = 0, giggle = 0;
      if (a.act === 'ability' || a.act === 'play') { flip = Math.min(1, a.k / 0.7) * Math.PI * 2; up += bump(a.k, 0, 0.7) * 0.6; sq += bump(a.k, 0.7, 1) * -0.3; giggle = 1; } else flip = 0;
      if (a.act === 'attack') { const s = strike(a.k, 0.4); fw = Math.max(0, s) * 0.4; sq += -Math.max(0, -s) * 0.25; up += bump(a.k, 0.4, 0.8) * 0.25; }
      body.rotation.x = -flip; squash(body, sq); B.position.set(0, up, fw);
      tail.rotation.y = wob(t, 4, 0.5); tail.rotation.x = wob(t, 2.5, 0.2);
      arms.forEach((m, i) => { m.rotation.z = (i ? -1 : 1) * (0.3 + wob(t, 6, 0.3, i) + giggle * 0.6); });
      // a mischievous grin that keeps widening
      mouth.scale.y = 0.35 + giggle * wob(t, 20, 0.3) + giggle * 0.3; mouth.scale.x = 1.1;
      alive(a, E, seed, giggle * 0.5);
    },
    moves: {
      ability: { dur: 1.2, hit: 0.65, fx: (c) => { const p = c.self.clone().setY(c.self.y + 1.2); sparks(c.fx, p, CANDY, 26, 2.5); c.fx.emoji(p, '💧', 0.6); } },
    },
  };
};

export const jellyfright: Builder = (k) => {
  const seed = Math.random() * 9;
  const bell = k.mat('#FF8AD8', 'jelly'), inner = k.mat('#FFD0F0', 'jelly'), tent = k.mat('#C86AFF', 'jelly'), glow = k.mat('#FFF0FF', 'glow', { emissiveIntensity: 0.8 });
  const B = k.g(k.root), float = k.g(B, [0, 0.75, 0]);
  const top = k.g(float);
  k.mesh(new THREE.SphereGeometry(0.34, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), bell, top, [0, -0.05, 0], undefined, [1, 0.95, 1]);
  k.sphere(top, 0.2, inner, [0, 0.06, 0], [1, 0.8, 1]);
  for (let i = 0; i < 6; i++) { const q = (i / 6) * Math.PI * 2; k.sphere(top, 0.03, glow, [Math.cos(q) * 0.3, -0.03, Math.sin(q) * 0.3], undefined, 8); }
  const E = k.eyes(top, { y: 0.06, z: 0.27, spread: 0.11, r: 0.085, iris: '#3A0A5A', lid: bell, tilt: 0.3 });
  const mouth = k.mouth(top, [0, -0.07, 0.3], 0.07, { color: '#5A0A4A' });
  // wavy tentacles, each a chain of little beads that ripples
  const T = k.phone ? 5 : 7;
  const tents = Array.from({ length: 6 }, (_, j) => { const q = (j / 6) * Math.PI * 2 + 0.3; const root = k.g(float, [Math.cos(q) * 0.2, -0.1, Math.sin(q) * 0.2]); const beads = Array.from({ length: T }, (_, i) => k.sphere(root, 0.04 * (1 - i / T * 0.6), i % 2 ? tent : bell, [0, -i * 0.08, 0], undefined, 8)); return { root, beads, q }; });
  return {
    height: 1.2,
    anim(a) {
      const t = a.t;
      let phase = 0, fw = 0, spin = 0;
      if (a.act === 'ability' || a.act === 'play') { phase = bump(a.k, 0, 1); spin = a.k * Math.PI * 4; }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.5; }
      // it pulses through the air like a jellyfish, and swells when it spooks
      const pulse = Math.max(0, Math.sin(t * 2.6 + seed));
      top.scale.set(1 + pulse * 0.08 - (a.act === 'attack' ? Math.min(0, strike(a.k)) * 0.3 : 0), 1 - pulse * 0.08, 1 + pulse * 0.08);
      float.position.y = 0.75 + pulse * 0.08 + wob(t, 0.9, 0.05) + phase * 0.3; float.rotation.y = spin; B.position.z = fw;
      tents.forEach(({ beads, q }, j) => beads.forEach((b, i) => { b.position.x = Math.sin(t * 3 - i * 0.7 + j) * 0.025 * i; b.position.z = Math.cos(t * 2.4 - i * 0.6 + j) * 0.02 * i; b.position.y = -i * (0.08 - pulse * 0.012); void q; }));
      bell.opacity = 0.72 - phase * 0.45; inner.opacity = 0.72 - phase * 0.45; tent.opacity = 0.72 - phase * 0.45;
      mouth.scale.y = 0.4 + (a.act === 'attack' ? 0.8 : phase * 0.6) + wob(t, 1.3, 0.1); alive(a, E, seed, 0);
    },
    moves: {
      ability: { dur: 1.4, hit: 0.5, fx: (c) => { const p = c.self.clone().setY(c.self.y + 0.8); sparks(c.fx, p, ['#FF8AD8', '#C86AFF', '#FFFFFF'], 28, 2, { gravity: -0.4, life: 1.2 }); c.fx.ring(c.self, '#FF8AD8', 1.8); } },
      attack: { dur: 0.7, hit: 0.5, fx: (c) => { if (c.target) sparks(c.fx, c.target, ['#FFFFFF', '#C86AFF'], 14, 2.5); } },
    },
  };
};

export const taffytwister: Builder = (k) => {
  const seed = Math.random() * 9;
  const stripes = k.paint(128, 32, (g) => { g.fillStyle = '#FFF4FA'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#FF4F9A'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 8, 0); g.lineTo(i * 16 + 18, 32); g.lineTo(i * 16 + 10, 32); g.fill(); } }, [6, 1]);
  const taffy = k.mat('#FFFFFF', 'candy', { map: stripes }), head = k.mat('#FF6AAA', 'candy'), wrap = k.mat('#7BE0FF', 'candy', { transparent: true, opacity: 0.85 });
  const B = k.g(k.root);
  const coilG = k.g(B, [0, 0, 0]);
  const coil = (s: number) => { const pts: [number, number, number][] = []; for (let i = 0; i <= 26; i++) { const u = i / 26, q = u * Math.PI * 4.2; const r = 0.32 - u * 0.12; pts.push([Math.cos(q) * r, 0.08 + u * 0.32 * s, Math.sin(q) * r]); } pts.push([0.08, 0.5 * s, 0.1], [0.02, 0.62 * s, 0.18]); return pts; };
  k.tube(coilG, coil(1), 0.09, 0.07, taffy);
  const H = k.g(B, [0.02, 0.62, 0.2]);
  k.sphere(H, 0.15, head, [0, 0, 0], [1, 0.85, 1.15]);
  const E = k.eyes(H, { y: 0.06, z: 0.1, spread: 0.08, r: 0.06, iris: '#3A0A3A', lid: head, tilt: -0.2 });
  const mouth = k.mouth(H, [0, -0.06, 0.15], 0.07, { tongue: true });
  const tongue = k.g(H, [0, -0.06, 0.18]); k.tube(tongue, [[0, 0, 0], [0, 0, 0.1], [0.03, 0, 0.16]], 0.012, 0.01, k.mat('#FF2A5A', 'skin')); tongue.visible = false;
  // wrapper twists at its tail end
  const tailEnd = k.g(B, [0.32, 0.08, 0]); k.cone(tailEnd, 0.08, 0.14, wrap, [0.06, 0, 0], [0, 0, -Math.PI / 2], 8); k.cone(tailEnd, 0.08, 0.14, wrap, [0.06, 0, 0], [0, 0, -Math.PI / 2 + 0.6], 8);
  return {
    height: 0.95,
    anim(a) {
      const t = a.t;
      let s = 1 + wob(t, 2.2, 0.06), fw = 0, whip = 0;
      if (a.act === 'ability' || a.act === 'attack' || a.act === 'play') { const st = strike(a.k, 0.45); s += Math.max(0, -st) * -0.35 + Math.max(0, st) * 0.9; fw = Math.max(0, st) * (a.act === 'attack' ? 0.45 : 0.15); whip = Math.max(0, st); }
      // the coil stretches like a spring
      coilG.scale.set(1 - (s - 1) * 0.25, s, 1 - (s - 1) * 0.25); const lastS = s;
      coilG.rotation.y = wob(t, 0.6, 0.2);
      H.position.set(0.02 + wob(t, 1.3, 0.04, seed), 0.62 * lastS + hop(a, 9, 0.12), 0.2 + fw);
      H.rotation.z = wob(t, 1.1, 0.25, seed); H.rotation.x = -whip * 0.3;
      tongue.visible = (t + seed) % 2.6 < 0.3; tongue.rotation.y = wob(t, 30, 0.3);
      tailEnd.rotation.x = wob(t, 3, 0.4); stripes.offset.x = t * 0.15;
      mouth.scale.y = 0.3 + whip * 0.7; alive(a, E, seed, 0);
    },
    moves: {
      ability: { dur: 1.0, hit: 0.5, fx: async (c) => { const p = c.at(H); if (c.target) { await c.fx.shot(p, c.target, { kind: 'candy', color: '#FF6AAA', dur: 0.35, size: 0.3, arc: 0.4 }); sparks(c.fx, c.target, CANDY, 22, 3); c.fx.ring(c.target, '#FF8AC2', 1.4); } } },
    },
  };
};

export const candiedknight: Builder = (k) => {
  const seed = Math.random() * 9;
  const armor = k.mat('#FF8AC2', 'candy'), armor2 = k.mat('#FFFFFF', 'candy'), visor = k.mat('#2A0A2A', 'dark'), plume = k.mat('#9AE8FF', 'fur'), gold = k.mat('#FFD24A', 'metal');
  const caneTex = k.paint(64, 64, (g) => { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#E8203A'; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 8, 0); g.lineTo(i * 16 + 24, 64); g.lineTo(i * 16 + 16, 64); g.fill(); } }, [1, 6]);
  const cane = k.mat('#FFFFFF', 'candy', { map: caneTex });
  const swirl = k.paint(128, 128, (g) => { g.fillStyle = '#FFE14D'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#FF4F9A'; g.lineWidth = 10; g.beginPath(); for (let i = 0; i < 200; i++) { const q = i * 0.12, r = i * 0.32; g.lineTo(64 + Math.cos(q) * r, 64 + Math.sin(q) * r); } g.stroke(); });
  const lolly = k.mat('#FFFFFF', 'candy', { map: swirl });
  const B = k.g(k.root), body = k.g(B, [0, 0.42, 0]);
  k.cyl(body, 0.2, 0.24, 0.36, armor, [0, 0, 0], undefined, 14);
  k.torus(body, 0.22, 0.035, armor2, [0, 0.13, 0], [Math.PI / 2, 0, 0]); k.torus(body, 0.24, 0.035, armor2, [0, -0.15, 0], [Math.PI / 2, 0, 0]);
  k.sphere(body, 0.04, gold, [0, 0.0, 0.22]);
  const head = k.g(body, [0, 0.34, 0]);
  k.sphere(head, 0.19, armor, [0, 0, 0], [1, 1.05, 1]);
  k.box(head, 0.24, 0.07, 0.06, visor, [0, 0.0, 0.17]);
  const E = k.eyes(head, { y: 0.0, z: 0.15, spread: 0.065, r: 0.04, iris: '#9AE8FF', lid: armor, glow: true, sclera: '#2A0A2A' });
  k.box(head, 0.03, 0.26, 0.04, armor2, [0, 0.03, 0.18]);
  const pl = k.g(head, [0, 0.18, -0.02]); for (let i = 0; i < 5; i++) k.sphere(pl, 0.07, plume, [0, i * 0.04, -i * 0.05], [0.7, 1, 1], 10);
  const shoulder = [-1, 1].map((x) => k.sphere(body, 0.1, armor2, [x * 0.24, 0.15, 0], [1, 0.8, 1]));
  void shoulder;
  // the candy-cane lance
  const aR = k.g(body, [0.26, 0.08, 0.04]); k.cap(aR, 0.05, 0.12, armor, [0.03, -0.1, 0.04]);
  const lance = k.g(aR, [0.05, -0.18, 0.1]); k.tube(lance, [[0, -0.15, -0.1], [0, 0, 0.1], [0, 0.15, 0.4], [0, 0.32, 0.5], [0, 0.4, 0.42]], 0.03, 0.025, cane);
  // the lollipop shield
  const aL = k.g(body, [-0.26, 0.08, 0.04]); k.cap(aL, 0.05, 0.12, armor, [-0.03, -0.1, 0.04]);
  const shield = k.g(aL, [-0.06, -0.1, 0.14]); k.cyl(shield, 0.2, 0.2, 0.05, lolly, [0, 0, 0], [Math.PI / 2, 0, 0], 24); k.cyl(shield, 0.012, 0.012, 0.3, armor2, [0, -0.3, -0.02]);
  const legs = [-1, 1].map((x) => { const l = k.g(B, [x * 0.1, 0.25, 0]); k.cap(l, 0.06, 0.1, armor2, [0, -0.09, 0]); k.sphere(l, 0.08, armor, [0, -0.2, 0.03], [1, 0.6, 1.3]); return l; });
  return {
    height: 1.25,
    anim(a) {
      const t = a.t;
      let raise = 0, thrust = 0, fw = 0;
      if (a.act === 'ability' || a.act === 'play') raise = bump(a.k, 0, 1);
      if (a.act === 'attack') { const s = strike(a.k, 0.45); thrust = s; fw = Math.max(0, s) * 0.5; }
      aR.rotation.x = -Math.max(0, -thrust) * 0.8 + Math.max(0, thrust) * 0.9 + wob(t, 1.1, 0.05);
      aL.rotation.x = -raise * 1.5; aL.rotation.z = -raise * 0.4 + wob(t, 1, 0.04); shield.rotation.z = raise * Math.PI * 2;
      body.rotation.y = wob(t, 0.4, 0.1, seed); body.rotation.z = wob(t, 0.8, 0.03);
      B.position.set(0, hop(a, 8, 0.12), fw);
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' || a.act === 'attack' ? wob(t, 12, 0.5, i * Math.PI) : 0; });
      pl.rotation.x = wob(t, 2, 0.15);
      alive(a, E, seed, 0);
    },
    moves: {
      ability: { dur: 1.4, hit: 0.5, fx: async (c) => {
        const p = c.at(shield), sd = sideOf(c.fwd); sparks(c.fx, p, ['#FFE14D', '#FF4F9A', '#FFFFFF'], 20, 2);
        const goal = c.target ?? c.self.clone().addScaledVector(sd, 3.4);
        await c.fx.shot(p, goal.clone().setY(goal.y + 0.8), { kind: 'candy', color: '#FFE14D', dur: 0.5, size: 0.3, arc: 1.2 });
        c.fx.ring(goal, '#9AD8FF', 1.6); motes(c.fx, goal, ['#9AD8FF', '#FFFFFF'], 16, 0.6);
      } },
    },
  };
};

export const sugarcolossus: Builder = (k) => {
  const seed = Math.random() * 9;
  const sponge = k.mat('#F2C88A', 'skin'), pink = k.mat('#FF9AC8', 'candy'), cream = k.mat('#FFF8F0', 'candy'), choc = k.mat('#6A3A22', 'candy'), cherry = k.mat('#E8203A', 'candy'), wax = k.mat('#7BE0FF', 'candy'), flameM = k.mat('#FFD04A', 'glow');
  const B = k.g(k.root), body = k.g(B, [0, 0, 0]);
  // a three-tier cake
  const tiers = [[0.5, 0.36, choc], [0.4, 0.32, pink], [0.3, 0.28, cream]] as const;
  let y = 0.3;
  const tierG: THREE.Group[] = [];
  tiers.forEach(([r, h, m], i) => { const g = k.g(body, [0, y + h / 2, 0]); k.cyl(g, r, r, h, sponge, [0, 0, 0], undefined, 24); k.cyl(g, r + 0.01, r + 0.01, h * 0.35, m, [0, h * 0.33, 0], undefined, 24); for (let j = 0; j < 10; j++) { const q = (j / 10) * Math.PI * 2; k.sphere(g, 0.05, m, [Math.cos(q) * (r + 0.005), h * 0.12, Math.sin(q) * (r + 0.005)], [1, 1.8, 1], 8); } y += h; tierG.push(g); void i; });
  for (let i = 0; i < 18; i++) { const q = i * 2.4, tg = tierG[i % 3], r = tiers[i % 3][0]; k.box(tg, 0.05, 0.015, 0.015, k.mat(CANDY[i % 5], 'candy'), [Math.cos(q) * (r + 0.01), -0.06 + (i % 3) * 0.04, Math.sin(q) * (r + 0.01)], [0, -q, i]); }
  const topG = k.g(body, [0, y, 0]);
  k.sphere(topG, 0.11, cream, [0, 0.03, 0], [1, 0.6, 1]); k.sphere(topG, 0.09, cherry, [0, 0.13, 0]); k.tube(topG, [[0, 0.2, 0], [0.04, 0.28, -0.02]], 0.01, 0.008, k.mat('#3A8A2A', 'skin'));
  const flames = [0, 1, 2, 3].map((i) => { const q = (i / 4) * Math.PI * 2 + 0.4; k.cyl(topG, 0.025, 0.025, 0.16, wax, [Math.cos(q) * 0.2, 0.08, Math.sin(q) * 0.2]); return k.sphere(topG, 0.04, flameM, [Math.cos(q) * 0.2, 0.2, Math.sin(q) * 0.2], [0.8, 1.5, 0.8], 8); });
  // the face on the middle tier
  const face = k.g(tierG[1], [0, 0.02, 0.38]);
  const E = k.eyes(face, { y: 0.03, z: 0.0, spread: 0.12, r: 0.075, iris: '#6A3A22', lid: pink });
  const mouth = k.mouth(face, [0, -0.09, 0.02], 0.09, { tongue: true });
  // wafer-roll arms with donut fists, and cupcake feet
  const arm = (x: number) => { const sh = k.g(tierG[0], [x * 0.5, 0.05, 0]); k.cap(sh, 0.07, 0.3, sponge, [x * 0.1, -0.15, 0], [0, 0, x * 0.4]); const d = k.torus(sh, 0.11, 0.06, pink, [x * 0.2, -0.38, 0.05], [0, Math.PI / 2, 0]); k.torus(sh, 0.11, 0.035, cream, [x * 0.2 + x * 0.03, -0.38, 0.05], [0, Math.PI / 2, 0]); sh.userData.d = d; return sh; };
  const aL = arm(-1), aR = arm(1);
  const legs = [-1, 1].map((x) => { const l = k.g(B, [x * 0.22, 0.3, 0]); k.cyl(l, 0.13, 0.1, 0.18, k.mat('#FFB0C8', 'cloth'), [0, -0.18, 0], undefined, 12); k.sphere(l, 0.12, cream, [0, -0.06, 0], [1, 0.6, 1]); return l; });
  return {
    height: 1.7,
    anim(a) {
      const t = a.t;
      let cheer = 0, fw = 0, smash = 0;
      if (a.act === 'ability' || a.act === 'play') cheer = bump(a.k, 0, 1);
      if (a.act === 'attack') { smash = strike(a.k, 0.5); fw = Math.max(0, smash) * 0.35; }
      tierG.forEach((g, i) => { g.rotation.y = wob(t, 0.8, 0.06, i * 1.3) + cheer * wob(t, 9, 0.15, i); g.position.x = wob(t, 1.6, 0.012, i); });
      aL.rotation.z = -cheer * 1.8 + wob(t, 1.2, 0.08); aR.rotation.z = cheer * 1.8 - wob(t, 1.2, 0.08, 1);
      aR.rotation.x = aL.rotation.x = -Math.max(0, -smash) * 2 + Math.max(0, smash) * 0.6;
      flames.forEach((f, i) => f.scale.set(0.8, 1.5 + wob(t, 14, 0.3, i) + cheer * 1.5, 0.8));
      topG.position.y = y + cheer * 0.15 * Math.abs(Math.sin(t * 10));
      B.position.set(0, hop(a, 6, 0.08), fw);
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' ? wob(t, 8, 0.4, i * Math.PI) : 0; });
      mouth.scale.y = 0.3 + cheer * 0.8; alive(a, E, seed, cheer * 0.5);
    },
    ambient(c, a) { if (every(a, 3)) { const p = c.at(flames[(Math.random() * 4) | 0], [0, 0.05, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vy: 0.5, color: '#FFD04A', size: 0.05, life: 0.6 }); } },
    moves: {
      ability: { dur: 1.7, hit: 0.55, fx: (c) => { const p = c.at(topG, [0, 0.3, 0]); sparks(c.fx, p, CANDY, 60, 4, { gravity: 5, size: 0.1, life: 1.3 }); c.fx.emoji(p.clone().setY(p.y + 0.4), '🃏', 0.6); c.fx.emoji(p.clone().setY(p.y + 0.7), '🃏', 0.6); c.fx.shake(0.15); } },
      attack: { dur: 0.85, hit: 0.55, fx: (c) => { c.fx.shake(0.2); if (c.target) sparks(c.fx, c.target, CANDY, 22, 3); } },
    },
  };
};
