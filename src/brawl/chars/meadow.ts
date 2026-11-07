// 🌿 Meadow: Sproutling, Thornhare, Mossback Tortoise, Blossom Stag and Elder Oakheart.
import * as THREE from 'three';
import { alive, bump, hop, motes, sideOf, sparks, squash, strike, wob, type Builder } from './core';

export const sproutling: Builder = (k) => {
  const seed = Math.random() * 9;
  const skin = k.mat('#D9AE68', 'skin'), belly = k.mat('#F6E6BE', 'skin'), leafM = k.mat('#62D04E', 'leaf'), stemM = k.mat('#3F9A35', 'skin'), blush = k.mat('#FF9C8C', 'skin');
  const B = k.g(k.root), body = k.g(B, [0, 0.42, 0]);
  k.sphere(body, 0.38, skin, [0, 0, 0], [1, 1.08, 0.95]);
  k.sphere(body, 0.27, belly, [0, -0.1, 0.17], [1, 1.0, 0.6]);
  const E = k.eyes(body, { y: 0.1, z: 0.27, spread: 0.14, r: 0.11, iris: '#3E8A2C', lid: skin });
  const mouth = k.mouth(body, [0, -0.07, 0.34], 0.07, { tongue: true });
  k.sphere(body, 0.05, blush, [-0.23, -0.03, 0.27], [1, 0.6, 0.4]); k.sphere(body, 0.05, blush, [0.23, -0.03, 0.27], [1, 0.6, 0.4]);
  const sprout = k.g(body, [0, 0.38, 0]);
  k.tube(sprout, [[0, 0, 0], [0.02, 0.1, 0], [-0.01, 0.2, 0]], 0.028, 0.02, stemM);
  const lL = k.g(sprout, [0, 0.2, 0]), lR = k.g(sprout, [0, 0.2, 0]);
  k.leaf(lL, 0.32, 0.15, leafM, [0, 0, 0], [-0.35, 0, 1.0]); k.leaf(lR, 0.32, 0.15, leafM, [0, 0, 0], [-0.35, 0, -1.0]);
  const fL = k.g(B, [-0.17, 0.06, 0.04]), fR = k.g(B, [0.17, 0.06, 0.04]);
  k.sphere(fL, 0.09, stemM, [0, 0, 0.03], [1, 0.6, 1.35]); k.sphere(fR, 0.09, stemM, [0, 0, 0.03], [1, 0.6, 1.35]);
  const aL = k.g(body, [-0.35, -0.02, 0.06]), aR = k.g(body, [0.35, -0.02, 0.06]);
  k.leaf(aL, 0.2, 0.08, leafM, [0, 0, 0], [0, 0, 2.3]); k.leaf(aR, 0.2, 0.08, leafM, [0, 0, 0], [0, 0, -2.3]);
  let spin = 0;
  return {
    height: 1.05,
    anim(a) {
      const t = a.t, breathe = wob(t, 2.4, 0.035);
      let up = hop(a), lean = 0, sq = breathe, close = 0, open = 0.25 + Math.max(0, wob(t, 0.6, 0.2));
      spin += a.dt * (a.act === 'ability' ? 32 * bump(a.k, 0, 0.9) : 0);
      if (a.act === 'attack') { const s = strike(a.k); lean = s * 0.55; B.position.z = Math.max(0, s) * 0.3; sq -= Math.max(0, -s) * 0.15; }
      else B.position.z = 0;
      if (a.act === 'ability') { up += bump(a.k, 0.05, 0.95) * 0.4; close = 1; open = 0.8; }
      if (a.act === 'play') { const s = Math.min(1, a.k * 1.6); lL.scale.setScalar(s); lR.scale.setScalar(s); open = 0.9; } else { lL.scale.setScalar(1); lR.scale.setScalar(1); }
      B.position.y = up; body.rotation.x = lean; squash(body, sq);
      sprout.rotation.y = spin; sprout.rotation.z = wob(t, 1.7, 0.12, seed);
      lL.rotation.z = wob(t, 2.3, 0.1); lR.rotation.z = -wob(t, 2.3, 0.1);
      aL.rotation.z = wob(t, 3, 0.25) + (a.pose === 'happy' ? 0.8 : 0); aR.rotation.z = -wob(t, 3, 0.25) - (a.pose === 'happy' ? 0.8 : 0);
      fL.position.y = 0.06 + Math.max(0, wob(t, 8, 0.03)) * (a.pose === 'walk' ? 1 : 0);
      mouth.scale.y = open; alive(a, E, seed, close);
    },
    moves: {
      ability: { dur: 1.4, hit: 0.55, fx: (c) => { motes(c.fx, c.self, ['#7BFF9A', '#D4FF7A', '#FFFFFF'], 34, 0.6); c.fx.ring(c.self, '#7BFF9A', 1.6); } },
      play: { dur: 1.0, hit: 0.3, fx: (c) => sparks(c.fx, c.at(sprout, [0, 0.2, 0]), ['#7BFF9A', '#FFFFFF'], 16, 1.6) },
    },
  };
};

export const thornhare: Builder = (k) => {
  const seed = Math.random() * 9;
  const fur = k.mat('#B8A27E', 'fur'), cream = k.mat('#F3E7CF', 'fur'), thorn = k.mat('#3F7A2E', 'shell'), pink = k.mat('#F7A8B8', 'skin'), nose = k.mat('#E66A86', 'skin');
  const B = k.g(k.root), body = k.g(B, [0, 0.3, -0.05]);
  k.sphere(body, 0.3, fur, [0, 0, 0], [0.95, 0.9, 1.15]);
  k.sphere(body, 0.2, cream, [0, -0.06, 0.16], [1, 0.9, 0.7]);
  // thorns down its back
  for (let i = 0; i < 7; i++) { const q = -0.6 + i * 0.25; k.cone(body, 0.045, 0.2, thorn, [Math.sin(i * 2.1) * 0.08, Math.cos(q) * 0.27, -Math.sin(q) * 0.3 - 0.02], [-q - 0.3, 0, Math.sin(i * 2.1) * 0.4], 6); }
  const tail = k.sphere(body, 0.1, cream, [0, 0.02, -0.34]);
  const head = k.g(body, [0, 0.27, 0.24]);
  k.sphere(head, 0.21, fur, [0, 0, 0], [1, 0.95, 0.95]);
  k.sphere(head, 0.12, cream, [0, -0.07, 0.13], [1.15, 0.8, 0.7]);
  const E = k.eyes(head, { y: 0.04, z: 0.15, spread: 0.1, r: 0.075, iris: '#6B3A1E', lid: fur });
  const nz = k.sphere(head, 0.03, nose, [0, -0.02, 0.21], [1.3, 1, 1]);
  const mouth = k.mouth(head, [0, -0.1, 0.17], 0.045, { fangs: 2 });
  const ear = (x: number) => { const e = k.g(head, [x, 0.16, -0.02]); k.cap(e, 0.055, 0.32, fur, [0, 0.2, 0], [0, 0, 0]); k.cap(e, 0.03, 0.28, pink, [0, 0.2, 0.03]); k.cone(e, 0.025, 0.1, thorn, [0, 0.43, 0], undefined, 5); e.rotation.z = -x * 1.6; return e; };
  const eL = ear(-0.08), eR = ear(0.08);
  const legL = k.g(B, [-0.15, 0.12, -0.08]), legR = k.g(B, [0.15, 0.12, -0.08]);
  k.sphere(legL, 0.13, fur, [0, 0, 0], [0.8, 1, 1.1]); k.sphere(legL, 0.07, cream, [0, -0.09, 0.14], [1, 0.6, 1.8]);
  k.sphere(legR, 0.13, fur, [0, 0, 0], [0.8, 1, 1.1]); k.sphere(legR, 0.07, cream, [0, -0.09, 0.14], [1, 0.6, 1.8]);
  const pL = k.g(body, [-0.11, -0.12, 0.25]), pR = k.g(body, [0.11, -0.12, 0.25]);
  k.cap(pL, 0.04, 0.1, cream, [0, -0.04, 0]); k.cap(pR, 0.04, 0.1, cream, [0, -0.04, 0]);
  let thump = 0;
  return {
    height: 1.0,
    anim(a) {
      const t = a.t;
      // its foot thumps now and then; the nose never stops twitching
      const th = (t + seed) % 4.2; thump = th < 0.3 ? Math.abs(Math.sin(th * 30)) * 0.06 : 0;
      legR.position.y = 0.12 + thump; nz.position.x = wob(t, 22, 0.006);
      let curl = 0, up = hop(a, 10, 0.18), fw = 0;
      if (a.act === 'attack') { const s = strike(a.k, 0.4); fw = Math.max(0, s) * 0.35; up += bump(a.k, 0.35, 0.75) * 0.25; body.rotation.x = s * 0.4; }
      else if (a.act === 'ability') { curl = bump(a.k, 0, 1); body.rotation.x = -curl * 0.9 + (a.k > 0.45 && a.k < 0.7 ? 0.6 : 0); up += bump(a.k, 0.4, 0.7) * 0.25; }
      else body.rotation.x = wob(t, 2, 0.03);
      B.position.set(0, up, fw);
      head.rotation.x = curl * 0.6 + wob(t, 1.3, 0.05); head.rotation.y = wob(t, 0.7, 0.25, seed);
      eL.rotation.z = 0.13 + wob(t, 5, 0.05) - curl * 0.8 + ((t + seed) % 3 < 0.15 ? 0.3 : 0); eR.rotation.z = -0.13 - wob(t, 5.3, 0.05) + curl * 0.8;
      eL.rotation.x = eR.rotation.x = -curl * 0.6 + (a.act === 'attack' ? -0.4 : 0);
      tail.scale.setScalar(1 + wob(t, 9, 0.05));
      squash(body, wob(t, 2.6, 0.03) - curl * 0.12);
      mouth.scale.y = a.act ? 0.8 : 0.25; alive(a, E, seed, curl > 0.5 ? 1 : 0);
    },
    moves: {
      ability: { dur: 1.0, hit: 0.55, fx: async (c) => {
        const from = c.self.clone().setY(c.self.y + 0.5); sparks(c.fx, from, ['#5FCF4A', '#2E6B22'], 14, 2.5, { size: 0.09 }, true);
        if (c.target) await Promise.all([0, 1, 2].map((i) => new Promise<void>((r) => setTimeout(() => c.fx.shot(from, c.target!.clone().add(new THREE.Vector3((i - 1) * 0.3, 0.3, 0)), { kind: 'leaf', color: '#4FAE3A', dur: 0.35, arc: 0.6 }).then(r), i * 70))));
      } },
    },
  };
};

export const mossback: Builder = (k) => {
  const seed = Math.random() * 9;
  const skin = k.mat('#8FAE6A', 'skin'), shellM = k.mat('#6C5233', 'shell'), moss = k.mat('#4E9A3A', 'fur'), rim = k.mat('#C9B27A', 'shell'), flower = k.mat('#FFE36A', 'skin'), petal = k.mat('#FF9AD0', 'leaf');
  const B = k.g(k.root), shell = k.g(B, [0, 0.28, -0.05]);
  k.lathe(shell, [[0.001, 0.42], [0.25, 0.38], [0.42, 0.22], [0.5, 0.04], [0.5, -0.02], [0.001, -0.02]], shellM, [0, 0, 0]);
  k.torus(shell, 0.5, 0.05, rim, [0, 0.0, 0], [Math.PI / 2, 0, 0]);
  // moss and little flowers and a sapling growing on its shell
  for (let i = 0; i < 9; i++) { const q = i * 2.4, r = 0.12 + (i % 3) * 0.1; k.sphere(shell, 0.1 + (i % 2) * 0.05, moss, [Math.cos(q) * r, 0.36 - r * 0.45, Math.sin(q) * r], [1, 0.45, 1], 12); }
  for (let i = 0; i < 4; i++) { const q = i * 1.7 + 0.4, f = k.g(shell, [Math.cos(q) * 0.3, 0.32, Math.sin(q) * 0.3]); k.sphere(f, 0.03, flower, [0, 0.03, 0]); for (let j = 0; j < 5; j++) k.leaf(f, 0.06, 0.03, petal, [0, 0.03, 0], [-Math.PI / 2, 0, (j / 5) * Math.PI * 2]); }
  const sap = k.g(shell, [0.05, 0.4, -0.05]);
  k.tube(sap, [[0, 0, 0], [0.03, 0.15, 0], [-0.02, 0.3, 0]], 0.025, 0.012, k.mat('#6B4A2A', 'bark'));
  const crown = k.g(sap, [-0.02, 0.32, 0]); k.sphere(crown, 0.11, moss, [0, 0, 0]); k.sphere(crown, 0.08, moss, [0.08, -0.03, 0.02]); k.sphere(crown, 0.08, moss, [-0.07, -0.02, 0.03]);
  const neck = k.g(B, [0, 0.24, 0.42]), head = k.g(neck, [0, 0.06, 0.12]);
  k.cap(neck, 0.09, 0.12, skin, [0, 0, 0.04], [Math.PI / 2.4, 0, 0]);
  k.sphere(head, 0.17, skin, [0, 0, 0], [1, 0.85, 1.1]);
  const E = k.eyes(head, { y: 0.05, z: 0.12, spread: 0.09, r: 0.06, iris: '#4A3A1A', lid: skin, tilt: 0.15 });
  const mouth = k.mouth(head, [0, -0.06, 0.16], 0.07);
  const legs = [[-0.32, 0.3], [0.32, 0.3], [-0.32, -0.3], [0.32, -0.3]].map(([x, z]) => { const l = k.g(B, [x, 0.14, z]); k.cyl(l, 0.09, 0.1, 0.2, skin, [0, -0.04, 0]); k.sphere(l, 0.1, skin, [0, -0.13, 0.02], [1, 0.5, 1.1]); return l; });
  return {
    height: 0.95,
    anim(a) {
      const t = a.t;
      // a sleepy old tortoise: half-closed eyes, a slow nod, and it pulls its head in when it does its thing
      let tuck = 0, nod = wob(t, 0.9, 0.08), glow = 0, fw = 0;
      if (a.act === 'ability') { tuck = bump(a.k, 0, 0.7); glow = bump(a.k, 0.2, 1); }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.2; neck.rotation.x = -s * 0.3; nod = 0; } else neck.rotation.x = 0;
      if (a.act === 'play') tuck = 1 - Math.min(1, a.k * 1.5);
      neck.position.z = 0.42 - tuck * 0.3; neck.scale.setScalar(1 - tuck * 0.4);
      head.rotation.x = nod; head.rotation.y = wob(t, 0.4, 0.3, seed);
      B.position.set(0, hop(a, 6, 0.05), fw);
      shell.rotation.z = wob(t, 1.1, 0.02); crown.rotation.z = wob(t, 1.6, 0.15);
      for (const m of [moss] as THREE.MeshStandardMaterial[]) m.emissive.set('#3DFF7A').multiplyScalar(glow * 0.8);
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' ? wob(t, 8, 0.4, i * Math.PI) : 0; });
      mouth.scale.y = 0.2 + bump(a.k, 0.3, 0.6) * (a.act === 'attack' ? 0.8 : 0);
      alive(a, E, seed, Math.max(0.45, tuck));
    },
    moves: {
      ability: { dur: 1.5, hit: 0.6, fx: async (c) => {
        const top = c.self.clone().setY(c.self.y + 0.8);
        motes(c.fx, c.self, ['#7BFF9A', '#FFE36A'], 30, 0.7);
        if (c.target) { await c.fx.shot(top, c.target, { kind: 'heart', color: '#7BFFAE', dur: 0.6, arc: 1.4 }); }
      } },
    },
  };
};

export const blossomstag: Builder = (k) => {
  const seed = Math.random() * 9;
  const fur = k.mat('#C98B5A', 'fur'), cream = k.mat('#F6E8D4', 'fur'), dark = k.mat('#4A2E1E', 'skin'), antler = k.mat('#E8D7B8', 'bark'), bloom = k.mat('#FFB0D8', 'leaf'), bloom2 = k.mat('#FFFFFF', 'leaf'), hoof = k.mat('#3A2A20', 'shell');
  const B = k.g(k.root), body = k.g(B, [0, 0.62, -0.05]);
  k.sphere(body, 0.26, fur, [0, 0, 0], [0.85, 0.85, 1.45]);
  k.sphere(body, 0.17, cream, [0, -0.1, 0.12], [1, 0.7, 1.4]);
  for (let i = 0; i < 6; i++) k.sphere(body, 0.03, cream, [(i % 2 ? 1 : -1) * 0.14, 0.12 + (i % 3) * 0.02, -0.2 + i * 0.08], [1, 0.5, 1], 8);
  const tail = k.g(body, [0, 0.08, -0.36]); k.sphere(tail, 0.07, cream, [0, 0.03, -0.02], [1, 1.3, 0.8]);
  const neck = k.g(body, [0, 0.12, 0.3]);
  k.tube(neck, [[0, 0, 0], [0, 0.18, 0.06], [0, 0.32, 0.08]], 0.1, 0.075, fur);
  const head = k.g(neck, [0, 0.36, 0.1]);
  k.sphere(head, 0.15, fur, [0, 0, 0], [0.95, 0.95, 1.05]);
  k.sphere(head, 0.09, cream, [0, -0.06, 0.14], [1, 0.8, 1.1]);
  k.sphere(head, 0.03, dark, [0, -0.03, 0.24], [1.3, 1, 1]);
  const E = k.eyes(head, { y: 0.03, z: 0.09, spread: 0.085, r: 0.065, iris: '#3A2414', lid: fur, tilt: -0.1 });
  for (const x of [-1, 1]) { const ea = k.g(head, [x * 0.12, 0.08, -0.02], [0, 0, -x * 1.1]); k.leaf(ea, 0.16, 0.06, fur, [0, 0, 0], [0.3, 0, 0]); }
  // antlers covered in blossoms
  const ants: THREE.Group[] = [];
  for (const x of [-1, 1]) {
    const an = k.g(head, [x * 0.07, 0.12, -0.03]); ants.push(an);
    k.tube(an, [[0, 0, 0], [x * 0.08, 0.15, 0], [x * 0.18, 0.28, -0.03], [x * 0.2, 0.4, -0.02]], 0.025, 0.012, antler);
    k.tube(an, [[x * 0.08, 0.15, 0], [x * 0.02, 0.27, 0.04], [x * 0.0, 0.34, 0.03]], 0.016, 0.01, antler);
    k.tube(an, [[x * 0.18, 0.28, -0.03], [x * 0.28, 0.33, -0.03]], 0.014, 0.008, antler);
    for (const [px, py, pz] of [[0.2, 0.4, -0.02], [0, 0.34, 0.03], [0.28, 0.33, -0.03], [0.14, 0.24, 0.0]] as const) {
      const f = k.g(an, [x * px, py, pz]); for (let j = 0; j < 5; j++) k.leaf(f, 0.05, 0.03, j % 2 ? bloom : bloom2, [0, 0, 0], [Math.random() - 0.5, Math.random() * 6, (j / 5) * Math.PI * 2]);
    }
  }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.24], [0.1, -0.24]]) { const l = k.g(B, [x, 0.55, z - 0.05]); k.tube(l, [[0, 0, 0], [0, -0.25, 0.02], [0, -0.48, 0]], 0.045, 0.028, fur); k.cyl(l, 0.03, 0.035, 0.06, hoof, [0, -0.52, 0]); legs.push(l); }
  return {
    height: 1.35,
    anim(a) {
      const t = a.t;
      let rear = 0, toss = 0, fw = 0;
      if (a.act === 'ability') { rear = bump(a.k, 0, 0.7); toss = a.k > 0.4 && a.k < 0.8 ? wob(a.k, 50, 0.25) : 0; }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.35; neck.rotation.x = 0.4 * Math.max(0, s) + 0.5 * Math.max(0, -s); } else neck.rotation.x = wob(t, 0.8, 0.05) + (Math.sin(t * 0.3 + seed) > 0.85 ? 0.5 : 0); // it grazes now and then
      body.rotation.x = -rear * 0.6; body.position.y = 0.62 + rear * 0.12 + hop(a, 7, 0.1);
      legs[0].rotation.x = legs[1].rotation.x = -rear * 1.1 + (a.pose === 'walk' ? wob(t, 10, 0.5) : 0); legs[2].rotation.x = legs[3].rotation.x = a.pose === 'walk' ? wob(t, 10, 0.5, Math.PI) : 0;
      B.position.z = fw;
      head.rotation.z = toss + wob(t, 0.6, 0.06, seed); head.rotation.y = wob(t, 0.5, 0.25, seed);
      tail.rotation.x = wob(t, 7, 0.3); ants.forEach((an, i) => { an.rotation.z = toss * (i ? -0.3 : 0.3); });
      alive(a, E, seed, rear > 0.3 ? 0.6 : 0);
    },
    moves: {
      ability: { dur: 1.4, hit: 0.55, fx: async (c) => {
        const top = c.self.clone().setY(c.self.y + 1.3), sd = sideOf(c.fwd);
        sparks(c.fx, top, ['#FFB0D8', '#FFFFFF', '#FFE36A'], 30, 2.2, { gravity: 0.6, life: 1.4, size: 0.11 });
        const goals = c.targets.length ? c.targets : [c.self.clone().addScaledVector(sd, 3.4), c.self.clone().addScaledVector(sd, -3.4)];
        await Promise.all(goals.map((g) => c.fx.shot(top, g.clone().setY(g.y + 0.6), { kind: 'petal', color: '#FFB0D8', dur: 0.6, arc: 1 })));
        for (const g of goals) motes(c.fx, g, ['#FFB0D8', '#7BFF9A'], 14, 0.5);
      } },
    },
  };
};

export const oakheart: Builder = (k) => {
  const seed = Math.random() * 9;
  const bark = k.mat('#7A5434', 'bark'), barkD = k.mat('#4E321E', 'bark'), moss = k.mat('#5DA544', 'fur'), leaf = k.mat('#4FBF4A', 'leaf'), leaf2 = k.mat('#8EDB5A', 'leaf'), amber = '#FFC83D';
  const glowM = k.mat('#7BFF9A', 'glow');
  const B = k.g(k.root), trunk = k.g(B, [0, 0, 0]);
  k.lathe(trunk, [[0.42, 0], [0.34, 0.12], [0.3, 0.4], [0.32, 0.75], [0.36, 1.0], [0.3, 1.15], [0.001, 1.2]], bark, [0, 0, 0], 10);
  // grooves in the bark
  for (let i = 0; i < 7; i++) { const q = (i / 7) * Math.PI * 2; k.box(trunk, 0.04, 0.8, 0.04, barkD, [Math.cos(q) * 0.31, 0.55, Math.sin(q) * 0.31], [0, -q, 0.05]); }
  // a face in the bark: a heavy brow, glowing eyes deep in it, and a mossy beard
  const face = k.g(trunk, [0, 0.82, 0.26]);
  k.box(face, 0.42, 0.08, 0.14, barkD, [0, 0.11, 0.03], [0.25, 0, 0]);
  const E = k.eyes(face, { y: 0.02, z: 0.04, spread: 0.11, r: 0.07, iris: amber, lid: barkD, glow: true, sclera: '#2A1A10' });
  const mouth = k.mouth(face, [0, -0.16, 0.06], 0.1, { color: '#1A0E06' });
  k.cone(face, 0.05, 0.12, bark, [0, -0.04, 0.1], [Math.PI / 2, 0, 0], 6);
  const beard = k.g(face, [0, -0.25, 0.04]); for (let i = 0; i < 6; i++) k.sphere(beard, 0.07, moss, [(i - 2.5) * 0.07, -Math.abs(i - 2.5) * 0.02, 0], [1, 1.6, 0.6], 10);
  // branch arms with leafy hands
  const arm = (x: number) => {
    const sh = k.g(trunk, [x * 0.3, 0.85, 0]);
    k.tube(sh, [[0, 0, 0], [x * 0.25, -0.05, 0.05], [x * 0.42, -0.25, 0.12], [x * 0.48, -0.45, 0.15]], 0.09, 0.05, bark);
    const hand = k.g(sh, [x * 0.48, -0.47, 0.15]);
    for (let i = 0; i < 3; i++) k.tube(hand, [[0, 0, 0], [x * (0.04 + i * 0.03), -0.1, (i - 1) * 0.06], [x * (0.02 + i * 0.05), -0.18, (i - 1) * 0.09]], 0.03, 0.012, barkD);
    for (let i = 0; i < 4; i++) k.leaf(sh, 0.14, 0.07, i % 2 ? leaf : leaf2, [x * (0.2 + i * 0.07), -0.05 - i * 0.07, 0.05], [0, 0, x * (1.5 + i * 0.3)]);
    return sh;
  };
  const aL = arm(-1), aR = arm(1);
  // the canopy crown
  const crown = k.g(trunk, [0, 1.25, -0.05]);
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) { const q = i * 2.1, r = i === 0 ? 0 : 0.28; puffs.push(k.ico(crown, 0.22 + (i % 3) * 0.04, i % 2 ? leaf : moss, [Math.cos(q) * r, (i === 0 ? 0.12 : 0) + (i % 2) * 0.06, Math.sin(q) * r], 1)); }
  for (let i = 0; i < 3; i++) k.sphere(crown, 0.035, k.mat('#FF5A6A', 'candy'), [Math.cos(i * 2) * 0.32, 0.1, Math.sin(i * 2) * 0.32 + 0.1]);
  // roots for feet, with glowing veins
  const roots: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const q = (i / 6) * Math.PI * 2 + 0.3; roots.push(k.tube(trunk, [[Math.cos(q) * 0.3, 0.12, Math.sin(q) * 0.3], [Math.cos(q) * 0.5, 0.04, Math.sin(q) * 0.5], [Math.cos(q) * 0.68, 0.0, Math.sin(q) * 0.68]], 0.07, 0.02, bark)); }
  const veins = k.g(trunk); for (let i = 0; i < 6; i++) { const q = (i / 6) * Math.PI * 2 + 0.3; k.tube(veins, [[Math.cos(q) * 0.33, 0.1, Math.sin(q) * 0.33], [Math.cos(q) * 0.66, 0.015, Math.sin(q) * 0.66]], 0.018, 0.008, glowM); }
  veins.visible = false;
  return {
    height: 1.75,
    anim(a) {
      const t = a.t;
      let raise = 0, slam = 0;
      if (a.act === 'ability' || a.act === 'play') raise = bump(a.k, 0, 1);
      if (a.act === 'attack') { const s = strike(a.k, 0.5); slam = s; }
      trunk.rotation.z = wob(t, 0.5, 0.025, seed); trunk.rotation.x = slam * 0.25;
      aL.rotation.z = -raise * 1.9 + wob(t, 0.9, 0.06); aR.rotation.z = raise * 1.9 - wob(t, 0.9, 0.06, 1);
      aL.rotation.x = aR.rotation.x = -Math.max(0, -slam) * 1.4 + Math.max(0, slam) * 0.6;
      crown.rotation.y = wob(t, 0.3, 0.1); puffs.forEach((p, i) => p.scale.setScalar(1 + wob(t, 1.3, 0.04, i)));
      beard.rotation.x = wob(t, 1.2, 0.08);
      veins.visible = raise > 0.05;
      B.position.y = raise * 0.08;
      mouth.scale.y = 0.2 + raise * 0.6 + Math.max(0, slam) * 0.5;
      alive(a, E, seed, 0, [wob(t, 0.3, 0.4, seed), 0]);
    },
    moves: {
      ability: { dur: 1.8, hit: 0.5, fx: (c) => {
        c.fx.ring(c.self, '#7BFF9A', 5, 1.0); c.fx.shake(0.15);
        for (const p of [c.self, ...c.targets]) motes(c.fx, p, ['#7BFF9A', '#D4FF7A', '#FFFFFF'], 20, 0.7);
        for (let i = 0; i < 24; i++) c.fx.soft({ x: c.self.x + (Math.random() - 0.5) * 6, y: c.self.y + 3 + Math.random(), z: c.self.z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 0.5, vy: -0.8, color: i % 2 ? '#5DBF4A' : '#9EE05A', size: 0.14, life: 3, alpha: 0.95 });
      } },
      attack: { dur: 0.8, hit: 0.55, fx: (c) => { c.fx.shake(0.2); c.fx.ring(c.target ?? c.self, '#A0764A', 1.5); } },
    },
  };
};
