// ⚪ Neutral: the Pebble Golem, the Wandering Bard and the Mimic Chest.
import * as THREE from 'three';
import { alive, bump, hop, motes, sparks, squash, strike, wob, type Builder } from './core';

export const pebblegolem: Builder = (k) => {
  const seed = Math.random() * 9;
  const greys = ['#8A8494', '#A8A0AE', '#6E6878', '#B8B0A8'].map((c) => k.mat(c, 'stone', { flatShading: false, roughness: 0.8 }));
  const moss = k.mat('#7AB85A', 'fur'), stick = k.mat('#7A5A3A', 'bark');
  const B = k.g(k.root);
  // a wobbly stack of pebbles; the extra ones it stacks on itself wait out of sight
  const stack = [0.27, 0.22, 0.2, 0.17, 0.15].map((r, i) => { const g = k.g(B, [0, 0, 0]); k.sphere(g, r, greys[i % 4], [0, 0, 0], [1.15, 0.62, 1.05], 16); g.userData.r = r; return g; });
  const head = k.g(B, [0, 0, 0]);
  k.sphere(head, 0.19, greys[1], [0, 0, 0], [1.05, 0.85, 1]);
  k.sphere(head, 0.12, moss, [0.02, 0.13, -0.02], [1.2, 0.35, 1.1], 12);
  for (let i = 0; i < 3; i++) k.leaf(head, 0.08, 0.035, moss, [-0.03 + i * 0.03, 0.16, 0], [-0.3, i, 0.4 * (i - 1)]);
  const E = k.eyes(head, { y: 0.02, z: 0.15, spread: 0.07, r: 0.05, iris: '#5A9AE0', lid: greys[1] });
  const mouth = k.mouth(head, [0, -0.07, 0.16], 0.04);
  const arms = [-1, 1].map((x) => { const a = k.g(B, [x * 0.26, 0.3, 0.02]); k.tube(a, [[0, 0, 0], [x * 0.12, -0.08, 0.03], [x * 0.18, -0.2, 0.06]], 0.018, 0.012, stick); k.sphere(a, 0.05, greys[2], [x * 0.19, -0.23, 0.06], undefined, 8); return a; });
  let shown = 3, add = 0;
  const layout = (t: number) => {
    let y = 0; stack.forEach((g, i) => { g.visible = i < shown || (i === shown && add > 0); const r = g.userData.r as number; const s = i === shown ? add : 1; g.scale.setScalar(Math.max(0.001, s)); if (!g.visible) return; y += r * 0.62 * s; g.position.set(wob(t, 1.3, 0.012 * i, i), y, 0); g.rotation.y = i * 1.7 + wob(t, 0.7, 0.04, i); y += r * 0.58 * s; });
    head.position.set(wob(t, 1.3, 0.02, 5), y + 0.14, 0);
  };
  return {
    height: 1.1,
    anim(a) {
      const t = a.t;
      let fw = 0;
      if (a.act === 'ability') { add = Math.min(1, a.k * 1.6); if (a.k >= 0.99 && shown < stack.length) { shown++; add = 0; } } else if (add > 0) { if (shown < stack.length) shown++; add = 0; }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.3; B.rotation.x = s * 0.3; } else B.rotation.x = wob(t, 0.9, 0.03, seed);
      layout(t); B.position.set(0, hop(a, 9, 0.1), fw); B.rotation.z = wob(t, 1.1, 0.035);
      arms.forEach((m, i) => { m.position.y = head.position.y * 0.55; m.rotation.z = (i ? -1 : 1) * (wob(t, 2, 0.15, i) + (a.pose === 'happy' ? 1 : 0) + (a.act === 'ability' ? bump(a.k, 0, 0.7) * 2 : 0)); });
      squash(head, wob(t, 2.6, 0.02)); mouth.scale.y = 0.25 + (a.act ? 0.5 : 0); alive(a, E, seed, 0, a.act === 'ability' ? [0, 0.8] : undefined);
    },
    moves: {
      ability: { dur: 1.3, hit: 0.65, fx: (c) => { const p = c.at(head, [0, -0.1, 0]); sparks(c.fx, p, ['#B8B0A8', '#8A8494', '#FFFFFF'], 14, 1.6, {}, true); motes(c.fx, c.self, ['#7BFFAE'], 10, 0.4); } },
    },
  };
};

export const wanderingbard: Builder = (k) => {
  const seed = Math.random() * 9;
  const skin = k.mat('#F2C9A0', 'skin'), tunic = k.mat('#3A7AC8', 'cloth'), cape = k.mat('#C83A4A', 'cloth'), hat = k.mat('#2E6A3A', 'cloth'), feather = k.mat('#FFE14D', 'leaf'), wood = k.mat('#B8783A', 'shell'), boot = k.mat('#5A3A22', 'shell'), hair = k.mat('#8A4A22', 'fur');
  const B = k.g(k.root), body = k.g(B, [0, 0.3, 0]);
  k.lathe(body, [[0.001, 0], [0.17, 0.0], [0.19, 0.08], [0.16, 0.26], [0.11, 0.34], [0.001, 0.35]], tunic);
  k.torus(body, 0.165, 0.02, k.mat('#5A3A22', 'shell'), [0, 0.1, 0], [Math.PI / 2, 0, 0]);
  const capeG = k.g(body, [0, 0.32, -0.08]); k.mesh(new THREE.PlaneGeometry(0.36, 0.48, 4, 6), cape, capeG, [0, -0.24, -0.04]);
  const head = k.g(body, [0, 0.5, 0.02]);
  k.sphere(head, 0.17, skin, [0, 0, 0]);
  k.sphere(head, 0.035, skin, [0, -0.02, 0.17], [1, 1.1, 1]);
  for (const x of [-1, 1]) k.sphere(head, 0.035, k.mat('#FF9A8A', 'skin'), [x * 0.1, -0.05, 0.13], [1, 0.6, 0.4]);
  k.sphere(head, 0.17, hair, [0, 0.03, -0.04], [1.05, 0.9, 0.95]);
  const E = k.eyes(head, { y: 0.02, z: 0.13, spread: 0.065, r: 0.045, iris: '#3A8A4A', lid: skin });
  const mouth = k.mouth(head, [0, -0.08, 0.15], 0.04);
  // a floppy feathered hat
  const hg = k.g(head, [0, 0.13, -0.01], [0, 0, 0.15]);
  k.cyl(hg, 0.25, 0.25, 0.02, hat, [0, 0, 0], undefined, 20); k.cone(hg, 0.14, 0.24, hat, [0, 0.12, 0], [-0.3, 0, 0], 14);
  const fe = k.g(hg, [0.12, 0.08, -0.04]); k.leaf(fe, 0.32, 0.06, feather, [0, 0, 0], [-0.4, 0.4, -0.5]);
  // the lute
  const aL = k.g(body, [-0.16, 0.28, 0.04]), aR = k.g(body, [0.16, 0.28, 0.04]);
  k.cap(aL, 0.035, 0.14, tunic, [-0.02, -0.08, 0.05], [0.9, 0, 0.3]); k.cap(aR, 0.035, 0.14, tunic, [0.02, -0.08, 0.06], [1.1, 0, -0.5]);
  const lute = k.g(body, [0.02, 0.16, 0.18], [0, 0, 0.9]);
  k.sphere(lute, 0.11, wood, [0, -0.04, 0], [1, 1.2, 0.45]); k.cyl(lute, 0.03, 0.03, 0.005, k.mat('#2A1A0A', 'dark'), [0, -0.02, 0.05], [Math.PI / 2, 0, 0]);
  k.box(lute, 0.04, 0.26, 0.025, k.mat('#6A3A1A', 'shell'), [0, 0.18, 0]); k.box(lute, 0.06, 0.06, 0.03, k.mat('#6A3A1A', 'shell'), [0, 0.32, 0], [0.4, 0, 0]);
  const strum = k.g(aR, [0.02, -0.15, 0.12]); k.sphere(strum, 0.04, skin);
  const legs = [-1, 1].map((x) => { const l = k.g(B, [x * 0.07, 0.3, 0]); k.cap(l, 0.04, 0.16, k.mat('#6A5A3A', 'cloth'), [0, -0.12, 0]); k.sphere(l, 0.055, boot, [0, -0.27, 0.03], [1, 0.7, 1.5]); return l; });
  return {
    height: 1.2,
    anim(a) {
      const t = a.t;
      let play = 0, fw = 0, sway = wob(t, 2, 0.06);
      if (a.act === 'ability' || a.act === 'play' || a.pose === 'happy') { play = a.act ? bump(a.k, 0, 1) : 1; sway = wob(t, 6, 0.12); }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.3; lute.rotation.z = 0.9 + Math.max(0, -s) * 1.5 - Math.max(0, s) * 0.6; } else lute.rotation.z = 0.9;
      // it hums along to its own little tune: tapping a foot and bobbing its head
      body.rotation.z = sway; head.rotation.z = wob(t, 3, 0.1) * (0.4 + play); head.rotation.x = wob(t, 4, 0.05);
      aR.rotation.x = wob(t, play ? 24 : 4, play ? 0.4 : 0.06); strum.position.y = -0.15 + wob(t, play ? 24 : 4, 0.03);
      legs[0].rotation.x = Math.max(0, wob(t, 4, 0.25)); legs[1].rotation.x = a.pose === 'walk' ? wob(t, 10, 0.5) : 0;
      capeG.rotation.x = 0.1 + wob(t, 1.7, 0.08) + play * 0.2; fe.rotation.z = wob(t, 3, 0.15);
      B.position.set(0, hop(a, 7, 0.1) + play * Math.abs(Math.sin(t * 8)) * 0.05, fw);
      mouth.scale.y = 0.3 + play * (0.4 + wob(t, 6, 0.3)); alive(a, E, seed, play * 0.85);
    },
    moves: {
      ability: { dur: 1.8, hit: 0.45, fx: async (c) => {
        const p = c.at(lute, [0, 0, 0.1]);
        for (let i = 0; i < 5; i++) setTimeout(() => c.fx.emoji(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2, 0)), i % 2 ? '🎵' : '🎶', 0.45), i * 150);
        sparks(c.fx, p, ['#FFE14D', '#FFFFFF', '#7BFFAE'], 18, 1.5, { gravity: -0.5 });
        if (c.target) await c.fx.shot(p, c.target, { kind: 'note', color: '#7BFFAE', dur: 0.8, arc: 1.5, size: 0.3 });
      } },
    },
  };
};

export const mimicchest: Builder = (k) => {
  const seed = Math.random() * 9;
  const wood = k.mat('#8A5A2E', 'shell', { map: k.paint(128, 64, (g) => { g.fillStyle = '#8A5A2E'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#6A4020'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 8 + 4); g.bezierCurveTo(40, i * 8 + 2, 80, i * 8 + 7, 128, i * 8 + 4); g.stroke(); } }) });
  const gold = k.mat('#FFC83A', 'metal'), inside = k.mat('#6A0A2A', 'dark'), tongue = k.mat('#FF4A7A', 'skin'), teeth = k.mat('#FFF8E8', 'eye'), gem = k.mat('#22E3FF', 'glow');
  const B = k.g(k.root), box = k.g(B, [0, 0.12, 0]);
  k.box(box, 0.62, 0.3, 0.44, wood, [0, 0.15, 0]);
  k.box(box, 0.56, 0.02, 0.38, inside, [0, 0.31, 0]);
  for (const x of [-0.27, 0.27]) k.box(box, 0.05, 0.32, 0.46, gold, [x, 0.15, 0]);
  for (let i = 0; i < 7; i++) k.cone(box, 0.025, 0.07, teeth, [-0.24 + i * 0.08, 0.33, 0.2], undefined, 5);
  const tg = k.g(box, [0, 0.3, 0.05]); k.tube(tg, [[0, 0, -0.1], [0, 0.03, 0.05], [0, 0.0, 0.18], [0, -0.06, 0.26]], 0.07, 0.04, tongue);
  for (let i = 0; i < 6; i++) k.sphere(box, 0.035, gold, [(i - 2.5) * 0.08, 0.32 + Math.random() * 0.02, -0.08 + (i % 2) * 0.06], [1, 0.3, 1], 8);
  const lid = k.g(box, [0, 0.3, -0.22]);
  k.mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.62, 16, 1, false, 0, Math.PI), wood, lid, [0, 0, 0.22], [0, 0, Math.PI / 2], [1, 0.55, 1]);
  k.box(lid, 0.05, 0.13, 0.46, gold, [-0.27, 0.06, 0.22]); k.box(lid, 0.05, 0.13, 0.46, gold, [0.27, 0.06, 0.22]);
  for (let i = 0; i < 7; i++) k.cone(lid, 0.025, 0.07, teeth, [-0.24 + i * 0.08, -0.03, 0.42], [Math.PI, 0, 0], 5);
  k.box(lid, 0.1, 0.1, 0.04, gold, [0, -0.0, 0.45]); k.sphere(lid, 0.025, gem, [0, -0.0, 0.47]);
  const E = k.eyes(lid, { y: 0.14, z: 0.32, spread: 0.12, r: 0.07, iris: '#E8203A', lid: wood, tilt: -0.35 });
  const legs = [[-0.22, 0.14], [0.22, 0.14], [-0.22, -0.14], [0.22, -0.14]].map(([x, z]) => { const l = k.g(B, [x, 0.14, z]); k.tube(l, [[0, 0, 0], [x * 0.3, -0.05, 0], [x * 0.35, -0.13, 0.02]], 0.03, 0.02, wood); return l; });
  return {
    height: 0.95,
    anim(a) {
      const t = a.t;
      // it pretends to be an ordinary chest, then peeks… and snaps
      const peek = ((t + seed) % 5) / 5;
      let open = peek > 0.7 ? bump(peek, 0.7, 1) * 0.35 : 0.05, fw = 0, up = hop(a, 9, 0.15);
      if (a.act === 'attack') { const s = strike(a.k, 0.45); open = Math.max(0, -s) * 1.1 + 0.05; fw = Math.max(0, s) * 0.5; up += bump(a.k, 0.4, 0.75) * 0.2; }
      if (a.act === 'ability' || a.act === 'play') { open = bump(a.k, 0, 1) * 1.3; up += bump(a.k, 0.2, 0.6) * 0.25; }
      lid.rotation.x = -open; tg.rotation.x = -open * 0.4 + wob(t, 6, 0.1); tg.visible = open > 0.15;
      B.position.set(0, up, fw); box.rotation.z = wob(t, 1.1, 0.02) + (a.act === 'ability' ? wob(t, 18, 0.06) : 0);
      squash(box, wob(t, 2, 0.02) - Math.max(0, -open + 0.3) * 0);
      legs.forEach((l, i) => { l.rotation.z = a.pose === 'walk' || a.act === 'attack' ? wob(t, 18, 0.4, i * Math.PI) : wob(t, 1, 0.05, i); });
      gem.emissiveIntensity = 2 + wob(t, 4, 0.8);
      alive(a, E, seed, open < 0.1 ? 0.6 : 0, [wob(t, 0.8, 0.6, seed), 0]);
    },
    moves: {
      ability: { dur: 1.5, hit: 0.5, fx: (c) => { const p = c.at(box, [0, 0.4, 0]); sparks(c.fx, p, ['#FFC83A', '#FFFFFF', '#22E3FF'], 30, 2.5, { gravity: 3 }); c.fx.emoji(p.clone().setY(p.y + 0.5), '🃏', 0.7); } },
    },
  };
};
