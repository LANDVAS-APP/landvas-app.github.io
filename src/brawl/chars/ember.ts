// 🔥 Ember: Cinderpup, Lavaling, Blaze Fox, Pyre Drake and the Volcano Titan.
import * as THREE from 'three';
import type { Kit } from './kit';
import { alive, bump, every, hop, sparks, squash, stream, strike, wob, type Builder } from './core';

const FIRE = ['#FFF2A0', '#FFB020', '#FF6A10', '#FF3A00'];
/** a flickering flame: nested glowing cones, white-hot inside */
function flame(k: Kit, parent: THREE.Object3D, p: [number, number, number], s: number) {
  const g = k.g(parent, p);
  const cols = ['#FF4A0A', '#FF9A1A', '#FFE27A'];
  // a teardrop that licks upward, with a little curl at the tip
  const prof = [[0.001, 0], [0.32, 0.12], [0.42, 0.3], [0.36, 0.52], [0.22, 0.75], [0.1, 0.95], [0.001, 1.15]].map(([r, y]) => new THREE.Vector2(r, y));
  cols.forEach((c, i) => { const m = k.mat(c, 'glow', { transparent: true, opacity: 0.85 - i * 0.1, depthWrite: false }); const me = k.mesh(new THREE.LatheGeometry(prof, 10), m, g, [0, -i * 0.03 * s, 0], [0, 0, 0.12], [s * (1 - i * 0.28), s * (1 - i * 0.22), s * (1 - i * 0.28)]); me.castShadow = false; me.renderOrder = 3 + i; });
  return g;
}

export const cinderpup: Builder = (k) => {
  const seed = Math.random() * 9;
  const fur = k.mat('#3E3438', 'fur'), furL = k.mat('#6A5A5E', 'fur'), ember = k.mat('#FF8A2A', 'glow'), nose = k.mat('#1A1214', 'shell');
  const B = k.g(k.root), body = k.g(B, [0, 0.3, -0.04]);
  k.sphere(body, 0.24, fur, [0, 0, 0], [0.9, 0.85, 1.25]);
  k.sphere(body, 0.15, furL, [0, -0.08, 0.12], [1, 0.75, 1.1]);
  // glowing ember speckles in its coat
  for (let i = 0; i < 7; i++) { const q = i * 1.9; k.sphere(body, 0.022, ember, [Math.cos(q) * 0.2, 0.08 + Math.sin(i) * 0.06, Math.sin(q) * 0.26], undefined, 6); }
  const head = k.g(body, [0, 0.2, 0.24]);
  k.sphere(head, 0.21, fur, [0, 0, 0], [1.05, 0.95, 0.95]);
  k.sphere(head, 0.11, furL, [0, -0.07, 0.15], [1.1, 0.75, 0.9]);
  k.sphere(head, 0.04, nose, [0, -0.02, 0.24], [1.3, 1, 1]);
  const E = k.eyes(head, { y: 0.05, z: 0.15, spread: 0.095, r: 0.075, iris: '#FFA01A', lid: fur });
  const mouth = k.mouth(head, [0, -0.11, 0.17], 0.06, { tongue: true });
  const ears = [-1, 1].map((x) => { const e = k.g(head, [x * 0.15, 0.12, -0.02]); k.leaf(e, 0.2, 0.09, fur, [0, 0, 0], [0.2, 0, -x * 2.4]); k.sphere(e, 0.03, ember, [x * 0.12, -0.12, 0.02], undefined, 6); return e; });
  const paws = [[-0.12, 0.17], [0.12, 0.17], [-0.12, -0.17], [0.12, -0.17]].map(([x, z], i) => { const l = k.leg(B, [x, 0.2, z - 0.04], 0.2, 0.045, fur, ember, i * Math.PI); return l.pivot; });
  const tail = k.g(body, [0, 0.08, -0.3]); k.tube(tail, [[0, 0, 0], [0, 0.08, -0.08], [0, 0.18, -0.1]], 0.04, 0.03, fur);
  const fl = flame(k, tail, [0, 0.17, -0.1], 0.2);
  return {
    height: 0.95,
    anim(a) {
      const t = a.t;
      let fw = 0, up = hop(a, 11, 0.16), bark = 0;
      if (a.act === 'attack') { const s = strike(a.k, 0.4); fw = Math.max(0, s) * 0.4; up += bump(a.k, 0.4, 0.8) * 0.2; body.rotation.x = s * 0.3; }
      else if (a.act === 'ability') { bark = bump(a.k, 0.35, 0.75); body.rotation.x = -bump(a.k, 0, 0.45) * 0.4 + bark * 0.3; }
      else body.rotation.x = 0;
      B.position.set(0, up, fw);
      tail.rotation.y = wob(t, a.pose === 'happy' ? 22 : 12, 0.6); fl.scale.set(1 + wob(t, 19, 0.15), 1 + wob(t, 13, 0.25), 1);
      head.rotation.z = wob(t, 0.6, 0.18, seed); head.rotation.x = -bark * 0.3;
      ears.forEach((e, i) => { e.rotation.x = wob(t, 3, 0.12, i) - bark * 0.6; });
      paws.forEach((p, i) => { p.rotation.x = a.pose === 'walk' || a.act === 'attack' ? wob(t, 14, 0.6, i * Math.PI) : 0; });
      squash(body, wob(t, 6, 0.03));
      mouth.scale.y = 0.45 + wob(t, 9, 0.15) + bark * 0.6; alive(a, E, seed, bark);
    },
    ambient(c, a) { if (every(a, 6)) { const p = c.at(fl, [0, 0.08, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.8, color: FIRE[(Math.random() * 3) | 0], size: 0.06, life: 0.8 }); } },
    moves: {
      ability: { dur: 1.0, hit: 0.5, fx: async (c) => { const m = c.at(mouth); sparks(c.fx, m, FIRE, 12, 1.5); if (c.target) await c.fx.shot(m, c.target, { kind: 'fire', color: '#FF7A1A', dur: 0.45, size: 0.3, arc: 0.5 }); } },
    },
  };
};

export const lavaling: Builder = (k) => {
  const seed = Math.random() * 9;
  const lava = k.mat('#FF6A1A', 'skin', { emissive: '#FF4A00', emissiveIntensity: 0.9, roughness: 0.35, clearcoat: 0.6 }), crust = k.mat('#3A2A28', 'stone'), hot = k.mat('#FFD04A', 'glow');
  const B = k.g(k.root), body = k.g(B, [0, 0, 0]);
  k.lathe(body, [[0.001, 0], [0.36, 0.03], [0.42, 0.18], [0.36, 0.42], [0.2, 0.62], [0.05, 0.72], [0.001, 0.74]], lava);
  // cooled crust plates riding on the molten body
  const plates = Array.from({ length: 7 }, (_, i) => { const q = i * 2.3 + 0.4, y = 0.15 + (i % 3) * 0.17, r = 0.4 - (i % 3) * 0.08; const p = k.ico(body, 0.09 + (i % 2) * 0.03, crust, [Math.cos(q) * r, y, Math.sin(q) * r], 0, [1.3, 0.5, 1.3]); p.lookAt(new THREE.Vector3(Math.cos(q) * 2, y, Math.sin(q) * 2)); if (Math.sin(q) > 0.6) p.visible = false; return p; });
  const face = k.g(body, [0, 0.34, 0.37]);
  const E = k.eyes(face, { y: 0.04, z: 0.02, spread: 0.11, r: 0.085, iris: '#FF3A00', lid: lava });
  const mouth = k.mouth(face, [0, -0.11, 0.03], 0.09, { color: '#5A1200', fangs: 2 });
  const drips = [0, 1, 2].map((i) => k.sphere(body, 0.04, hot, [Math.cos(i * 2.1) * 0.37, 0.3, Math.sin(i * 2.1) * 0.37], [1, 1.4, 1], 8));
  const arms = [-1, 1].map((x) => { const a = k.g(body, [x * 0.38, 0.22, 0.05]); k.sphere(a, 0.08, lava, [x * 0.06, 0, 0], [1.3, 0.8, 0.8]); return a; });
  return {
    height: 0.85,
    anim(a) {
      const t = a.t;
      let sq = wob(t, 3.1, 0.05) + wob(t, 7.3, 0.02), fw = 0, swell = 0, up = hop(a, 8, 0.12);
      if (a.act === 'attack') { const s = strike(a.k); sq += -Math.max(0, -s) * 0.25 + Math.max(0, s) * 0.2; fw = Math.max(0, s) * 0.35; up += bump(a.k, 0.45, 0.85) * 0.25; }
      if (a.act === 'ability' || a.act === 'play') { swell = bump(a.k, 0, 0.6); sq += swell * 0.25 - bump(a.k, 0.55, 0.8) * 0.3; }
      squash(body, sq); body.scale.multiplyScalar(1 + swell * 0.15); B.position.set(0, up, fw);
      body.rotation.y = wob(t, 0.5, 0.15, seed);
      plates.forEach((p, i) => { p.position.y += wob(t, 1.5, 0.0008, i); });
      drips.forEach((d, i) => { const f = ((t * 0.5 + i / 3) % 1); d.position.y = 0.32 - f * 0.3; d.scale.setScalar(f < 0.9 ? 1 : (1 - f) * 10); });
      arms.forEach((m, i) => { m.rotation.z = wob(t, 4, 0.3, i) + (a.pose === 'happy' ? (i ? -1 : 1) : 0); });
      lava.emissiveIntensity = 0.75 + wob(t, 2.5, 0.25) + swell * 0.8;
      mouth.scale.y = 0.35 + swell * 0.7 + Math.max(0, wob(t, 0.9, 0.2)); alive(a, E, seed, swell);
    },
    ambient(c, a) { if (every(a, 2.5)) { const p = c.self.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.7, (Math.random() - 0.5) * 0.4)); c.fx.soft({ x: p.x, y: p.y, z: p.z, vy: 0.5, color: '#3A3036', size: 0.18, grow: 0.4, life: 1.4, alpha: 0.4 }); } },
    moves: {
      ability: { dur: 0.9, hit: 0.6, fx: async (c) => { const m = c.at(mouth); sparks(c.fx, m, FIRE, 16, 2); if (c.target) await c.fx.shot(m, c.target, { kind: 'goo', color: '#FF6A1A', dur: 0.5, size: 0.35, arc: 1.2 }); } },
    },
  };
};

export const blazefox: Builder = (k) => {
  const seed = Math.random() * 9;
  const fur = k.mat('#E8582A', 'fur'), white = k.mat('#FFF3E6', 'fur'), black = k.mat('#2A1A1A', 'fur'), nose = k.mat('#140C0C', 'shell');
  const B = k.g(k.root), body = k.g(B, [0, 0.42, -0.04]);
  k.sphere(body, 0.22, fur, [0, 0, 0], [0.85, 0.85, 1.45]);
  k.sphere(body, 0.15, white, [0, -0.06, 0.18], [0.9, 0.9, 0.9]);
  const head = k.g(body, [0, 0.24, 0.3]);
  k.sphere(head, 0.18, fur, [0, 0, 0], [1.1, 0.95, 0.95]);
  k.cone(head, 0.1, 0.22, fur, [0, -0.05, 0.2], [Math.PI / 2, 0, 0], 12);
  k.sphere(head, 0.09, white, [0, -0.08, 0.12], [1.3, 0.7, 1.3]);
  k.sphere(head, 0.03, nose, [0, -0.04, 0.31]);
  for (const x of [-1, 1]) k.sphere(head, 0.07, white, [x * 0.12, -0.05, 0.08], [1, 0.8, 0.8]);
  const E = k.eyes(head, { y: 0.04, z: 0.12, spread: 0.085, r: 0.065, iris: '#FFC21A', lid: fur, tilt: -0.25 });
  const mouth = k.mouth(head, [0, -0.1, 0.2], 0.05, { fangs: 2 });
  const ears = [-1, 1].map((x) => { const e = k.g(head, [x * 0.1, 0.14, -0.03], [0, 0, -x * 0.3]); k.cone(e, 0.07, 0.2, fur, [0, 0.09, 0], undefined, 8); k.cone(e, 0.04, 0.08, black, [0, 0.17, 0.005], undefined, 8); k.cone(e, 0.04, 0.12, white, [0, 0.07, 0.03], undefined, 8); return e; });
  const legs = [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]].map(([x, z], i) => k.leg(B, [x, 0.36, z - 0.04], 0.34, 0.04, fur, black, i * Math.PI).pivot);
  // three flaming tails fanned out behind
  const tails = [-1, 0, 1].map((i) => {
    const tg = k.g(body, [0, 0.04, -0.3], [0, i * 0.5, 0]);
    k.tube(tg, [[0, 0, 0], [0, 0.12, -0.12], [0, 0.32, -0.16], [0, 0.48, -0.08]], 0.07, 0.05, fur);
    k.sphere(tg, 0.07, white, [0, 0.48, -0.08], [1, 1.2, 1]);
    const f = flame(k, tg, [0, 0.5, -0.07], 0.26); tg.userData.f = f; return tg;
  });
  let spin = 0;
  return {
    height: 1.25,
    anim(a) {
      const t = a.t;
      let fw = 0, up = hop(a, 9, 0.16), sp = 0;
      if (a.act === 'attack') { const s = strike(a.k, 0.4); fw = Math.max(0, s) * 0.45; up += bump(a.k, 0.4, 0.8) * 0.3; body.rotation.x = s * 0.35; } else body.rotation.x = 0;
      if (a.act === 'ability' || a.act === 'play') { sp = bump(a.k, 0, 0.7); up += sp * 0.3; }
      spin = a.act === 'ability' ? Math.min(1, a.k / 0.6) * Math.PI * 2 : 0;
      B.position.set(0, up, fw); B.rotation.y = spin;
      tails.forEach((tg, i) => { tg.rotation.y = (i - 1) * (0.5 + sp * 0.5) + wob(t, 3, 0.15, i); tg.rotation.x = wob(t, 2.2, 0.1, i) - sp * 0.4; const f = tg.userData.f as THREE.Group; f.scale.set(1 + wob(t, 17, 0.15, i) + sp, 1 + wob(t, 11, 0.3, i) + sp * 1.5, 1 + sp); });
      head.rotation.y = wob(t, 0.6, 0.3, seed); head.rotation.z = wob(t, 0.45, 0.12, seed);
      ears.forEach((e, i) => { e.rotation.x = (t + seed + i * 0.1) % 3.5 < 0.12 ? -0.4 : 0; });
      legs.forEach((p, i) => { p.rotation.x = a.pose === 'walk' || a.act === 'attack' ? wob(t, 14, 0.6, i * Math.PI) : 0; });
      squash(body, wob(t, 2.5, 0.03));
      mouth.scale.y = a.act ? 0.9 : 0.25; alive(a, E, seed, 0);
    },
    ambient(c, a) { if (every(a, 9)) { const tg = tails[(Math.random() * 3) | 0]; const p = c.at(tg.userData.f as THREE.Group, [0, 0.15, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.9, color: FIRE[(Math.random() * 3) | 0], size: 0.07, life: 0.7 }); } },
    moves: {
      ability: { dur: 1.2, hit: 0.62, fx: async (c) => { const p = c.self.clone().setY(c.self.y + 1); sparks(c.fx, p, FIRE, 30, 3); c.fx.ring(c.self, '#FF8A30', 1.8); if (c.target) await c.fx.shot(p, c.target, { kind: 'fire', color: '#FF5A10', dur: 0.55, size: 0.5, arc: 2 }); } },
    },
  };
};

export const pyredrake: Builder = (k) => {
  const seed = Math.random() * 9;
  const scale = k.mat('#C8322A', 'shell'), belly = k.mat('#F2C27A', 'shell'), horn = k.mat('#F4E6C8', 'shell'), memb = k.mat('#FF8A4A', 'cloth', { transparent: true, opacity: 0.92 }), dark = k.mat('#5A1410', 'shell');
  const B = k.g(k.root), body = k.g(B, [0, 0.55, -0.1]);
  k.sphere(body, 0.3, scale, [0, 0, 0], [0.9, 0.9, 1.3]);
  k.sphere(body, 0.22, belly, [0, -0.08, 0.14], [0.9, 0.95, 1.05]);
  for (let i = 0; i < 6; i++) k.cone(body, 0.05, 0.14, dark, [0, 0.27 - Math.abs(i - 1.5) * 0.02, 0.22 - i * 0.1], [-0.4, 0, 0], 5);
  const neck = k.g(body, [0, 0.18, 0.3]);
  k.tube(neck, [[0, 0, 0], [0, 0.18, 0.05], [0, 0.3, 0.12]], 0.13, 0.1, scale);
  const head = k.g(neck, [0, 0.34, 0.16]);
  k.sphere(head, 0.19, scale, [0, 0, 0], [1, 0.9, 1.05]);
  k.sphere(head, 0.12, scale, [0, -0.05, 0.16], [1, 0.75, 1.2]);
  for (const x of [-1, 1]) k.sphere(head, 0.025, dark, [x * 0.05, -0.02, 0.3]);
  const E = k.eyes(head, { y: 0.06, z: 0.12, spread: 0.1, r: 0.065, iris: '#FFD21A', lid: scale, tilt: -0.3 });
  const jaw = k.mouth(head, [0, -0.11, 0.18], 0.08, { fangs: 4, tongue: true });
  for (const x of [-1, 1]) { k.tube(head, [[x * 0.09, 0.12, -0.04], [x * 0.16, 0.22, -0.12], [x * 0.14, 0.3, -0.24]], 0.035, 0.008, horn); }
  const wings = ([-1, 1] as const).map((x) => { const w = k.wing(body, 'bat', 0.7, memb, [x * 0.18, 0.18, -0.02], x); w.rotation.y = -x * 0.3; return w; });
  const tail = k.g(body, [0, -0.02, -0.38]);
  k.tube(tail, [[0, 0, 0], [0, -0.1, -0.2], [0, -0.12, -0.42], [0, -0.04, -0.6]], 0.11, 0.03, scale);
  const tf = flame(k, tail, [0, -0.02, -0.62], 0.22);
  const legs = [[-0.17, 0.18], [0.17, 0.18], [-0.18, -0.16], [0.18, -0.16]].map(([x, z], i) => k.leg(B, [x, 0.42, z - 0.1], 0.42, 0.07, scale, dark, i * Math.PI).pivot);
  return {
    height: 1.45,
    anim(a) {
      const t = a.t;
      let rear = 0, breath = 0, fw = 0, flap = wob(t, 1.6, 0.2);
      if (a.act === 'ability') { rear = bump(a.k, 0, 0.55); breath = a.k > 0.45 && a.k < 0.95 ? 1 : 0; flap = wob(t, 9, 0.6); }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.4; neck.rotation.x = Math.max(0, s) * 0.7 - Math.max(0, -s) * 0.4; flap = wob(t, 10, 0.4); } else neck.rotation.x = -rear * 0.6 + breath * 0.5 + wob(t, 1, 0.05);
      if (a.act === 'play') flap = wob(t, 12, 0.7);
      body.rotation.x = -rear * 0.35; B.position.set(0, hop(a, 6, 0.12) + rear * 0.1, fw);
      wings.forEach((w) => { const x = w.userData.side as number; w.rotation.z = x * (0.35 + flap + rear * 0.5); });
      head.rotation.y = wob(t, 0.5, 0.25, seed);
      tail.rotation.y = wob(t, 1.4, 0.35); tf.scale.setScalar(1 + wob(t, 16, 0.15));
      legs.forEach((p, i) => { p.rotation.x = a.pose === 'walk' ? wob(t, 10, 0.5, i * Math.PI) : 0; });
      jaw.scale.y = 0.25 + breath * 0.85 + Math.max(0, strike(a.act === 'attack' ? a.k : 0)) * 0.6;
      alive(a, E, seed, rear > 0.4 ? 0.5 : 0);
    },
    ambient(c, a) { if (every(a, 1.8)) { const p = c.at(head, [0, 0.02, 0.32]); c.fx.soft({ x: p.x, y: p.y, z: p.z, vy: 0.4, vx: (Math.random() - 0.5) * 0.2, color: '#5A5058', size: 0.1, grow: 0.5, life: 1.2, alpha: 0.5 }); } },
    moves: {
      ability: { dur: 1.6, hit: 0.5, fx: async (c) => { const m = c.at(jaw, [0, 0, 0.05]); if (c.target) await stream(c, m, c.target, 16, 35, { kind: 'fire', color: '#FF6A10', dur: 0.32, size: 0.3, arc: 0.15 }, 0.5); } },
    },
  };
};

export const volcanotitan: Builder = (k) => {
  const seed = Math.random() * 9;
  const rock = k.mat('#4A3C3A', 'stone'), rockL = k.mat('#6A5A54', 'stone'), lava = k.mat('#FF6A10', 'glow'), crater = k.mat('#FFC23A', 'glow');
  const B = k.g(k.root), torso = k.g(B, [0, 0.75, 0]);
  k.ico(torso, 0.48, rock, [0, 0, 0], 1, [1.1, 0.95, 0.85]);
  k.ico(torso, 0.3, rockL, [0, -0.1, 0.25], 1, [1.1, 0.9, 0.6]);
  // glowing lava cracks over its body
  for (let i = 0; i < 6; i++) { const q = i * 1.1 - 2.5; k.tube(torso, [[Math.sin(q) * 0.3, 0.3, Math.cos(q) * 0.38], [Math.sin(q + 0.2) * 0.38, 0.0, Math.cos(q + 0.2) * 0.42], [Math.sin(q - 0.1) * 0.3, -0.3, Math.cos(q - 0.1) * 0.38]], 0.022, 0.012, lava); }
  // the volcano on its back
  const volc = k.g(torso, [0, 0.38, -0.2]);
  k.cyl(volc, 0.16, 0.38, 0.5, rock, [0, 0.2, 0], undefined, 9);
  k.cyl(volc, 0.14, 0.14, 0.04, crater, [0, 0.46, 0], undefined, 9);
  const lavaDrips = [0, 1, 2].map((i) => k.tube(volc, [[Math.cos(i * 2.1) * 0.16, 0.44, Math.sin(i * 2.1) * 0.16], [Math.cos(i * 2.1) * 0.27, 0.2, Math.sin(i * 2.1) * 0.27], [Math.cos(i * 2.1) * 0.36, 0.0, Math.sin(i * 2.1) * 0.36]], 0.04, 0.02, lava));
  const head = k.g(torso, [0, 0.28, 0.34]);
  k.ico(head, 0.2, rockL, [0, 0, 0], 1, [1.2, 0.85, 0.9]);
  k.box(head, 0.34, 0.06, 0.1, rock, [0, 0.08, 0.13], [0.3, 0, 0]);
  const E = k.eyes(head, { y: 0.0, z: 0.14, spread: 0.08, r: 0.05, iris: '#FFB020', lid: rock, glow: true, sclera: '#1A0A06' });
  const mouth = k.mouth(head, [0, -0.11, 0.14], 0.09, { color: '#FF5A10' });
  const arm = (x: number) => {
    const sh = k.g(torso, [x * 0.5, 0.15, 0]);
    k.ico(sh, 0.2, rock, [x * 0.05, 0, 0], 0);
    k.ico(sh, 0.16, rockL, [x * 0.12, -0.3, 0.05], 0);
    const fist = k.ico(sh, 0.22, rock, [x * 0.14, -0.6, 0.1], 1, [1, 0.9, 1]);
    k.tube(sh, [[x * 0.1, -0.5, 0.25], [x * 0.18, -0.65, 0.28]], 0.02, 0.012, lava);
    sh.userData.fist = fist; return sh;
  };
  const aL = arm(-1), aR = arm(1);
  const legs = [-1, 1].map((x) => { const l = k.g(B, [x * 0.24, 0.4, 0]); k.ico(l, 0.17, rockL, [0, -0.12, 0], 0); k.ico(l, 0.2, rock, [0, -0.32, 0.05], 0, [1, 0.6, 1.2]); return l; });
  return {
    height: 2.0,
    anim(a) {
      const t = a.t;
      let raise = 0, slam = 0, erupt = 0;
      if (a.act === 'ability' || a.act === 'play') { raise = bump(a.k, 0, 0.5); slam = a.k > 0.45 ? bump(a.k, 0.45, 1) : 0; erupt = a.k > 0.45 ? 1 - a.k : 0; }
      if (a.act === 'attack') { const s = strike(a.k, 0.5); aR.rotation.x = -Math.max(0, -s) * 2.2 + Math.max(0, s) * 0.4; torso.rotation.y = s * 0.25; } else { aR.rotation.x = -raise * 2.6 + slam * 1.2; torso.rotation.y = wob(t, 0.4, 0.06, seed); }
      aL.rotation.x = -raise * 2.6 + slam * 1.2 + (a.act === 'attack' ? 0 : wob(t, 1, 0.06));
      torso.position.y = 0.75 + wob(t, 1.4, 0.02) - slam * 0.1; torso.rotation.x = slam * 0.25;
      volc.scale.set(1, 1 + erupt * 0.25, 1);
      lavaDrips.forEach((d, i) => { d.scale.y = 1 + wob(t, 2, 0.08, i); });
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' ? wob(t, 6, 0.3, i * Math.PI) : 0; });
      crater.emissiveIntensity = 2 + wob(t, 3, 0.8) + erupt * 4;
      mouth.scale.y = 0.25 + raise * 0.6; alive(a, E, seed, slam * 0.6);
    },
    ambient(c, a) { if (every(a, 4)) { const p = c.at(volc, [0, 0.5, 0]); c.fx.soft({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.2, vy: 0.7, color: '#3A3036', size: 0.25, grow: 0.8, life: 2, alpha: 0.5 }); if (Math.random() < 0.3) c.fx.add({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5), vy: 1.5, color: '#FFB020', size: 0.07, gravity: 4, life: 0.8 }); } },
    moves: {
      ability: { dur: 1.9, hit: 0.5, fx: async (c) => {
        c.fx.shake(0.45); c.fx.ring(c.self, '#FF8A30', 4, 0.8);
        const top = c.at(volc, [0, 0.55, 0]);
        sparks(c.fx, top, FIRE, 40, 4, { gravity: 5, size: 0.15 });
        for (let i = 0; i < 10; i++) c.fx.soft({ x: top.x, y: top.y, z: top.z, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), color: '#2A2028', size: 0.5, grow: 1.2, life: 2.2, alpha: 0.55 });
        await Promise.all(c.targets.map((g, i) => new Promise<void>((r) => setTimeout(() => void c.fx.shot(top, g, { kind: 'rock', color: '#FF6A10', dur: 0.7, size: 0.35, arc: 3 }).then(r), i * 110))));
      } },
      attack: { dur: 0.85, hit: 0.55, fx: (c) => { c.fx.shake(0.25); if (c.target) sparks(c.fx, c.target, FIRE, 14, 2.5); } },
    },
  };
};
