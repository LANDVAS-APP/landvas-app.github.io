// ❄️ Frost: Snowpip, Icicle Ram, Glacier Owl, Frostmaw Yeti and the Aurora Wyrm.
import * as THREE from 'three';
import { alive, bump, every, hop, motes, sparks, squash, stream, strike, wob, type Builder } from './core';

const ICE = ['#FFFFFF', '#BFF4FF', '#6FD3FF'];

export const snowpip: Builder = (k) => {
  const seed = Math.random() * 9;
  const snow = k.mat('#F4FAFF', 'fur'), blue = k.mat('#9AD8FF', 'fur'), cheek = k.mat('#8FC8FF', 'skin'), crystal = k.mat('#BFF4FF', 'glow', { emissiveIntensity: 0.8 }), mitt = k.mat('#4A8AE0', 'cloth');
  const B = k.g(k.root), body = k.g(B, [0, 0.36, 0]);
  k.sphere(body, 0.34, snow, [0, 0, 0], [1, 0.95, 0.95]);
  // fluffy tufts
  for (let i = 0; i < 10; i++) { const q = i * 2.4, y = -0.2 + (i % 4) * 0.12; k.sphere(body, 0.09, snow, [Math.cos(q) * 0.31, y, Math.sin(q) * 0.29], undefined, 10); }
  k.sphere(body, 0.2, blue, [0, -0.12, 0.18], [1, 0.8, 0.5]);
  const E = k.eyes(body, { y: 0.08, z: 0.26, spread: 0.12, r: 0.1, iris: '#2A7AE0', lid: snow });
  const cheeks = [-1, 1].map((x) => k.sphere(body, 0.07, cheek, [x * 0.2, -0.04, 0.24], [1, 0.75, 0.6]));
  const mouth = k.mouth(body, [0, -0.06, 0.32], 0.05);
  const ant = k.g(body, [0, 0.32, 0]); k.cyl(ant, 0.012, 0.012, 0.12, blue, [0, 0.06, 0]); k.ico(ant, 0.06, crystal, [0, 0.15, 0], 0, [0.7, 1.4, 0.7]);
  const arms = [-1, 1].map((x) => { const a = k.g(body, [x * 0.32, -0.05, 0.05]); k.sphere(a, 0.075, mitt, [x * 0.05, -0.03, 0], [1, 0.9, 0.9]); return a; });
  for (const x of [-1, 1]) k.sphere(B, 0.08, blue, [x * 0.15, 0.04, 0.06], [1, 0.5, 1.3]);
  return {
    height: 0.95,
    anim(a) {
      const t = a.t;
      let puff = 0, fw = 0, up = hop(a, 10, 0.18), sq = wob(t, 2.8, 0.04), roll = 0;
      if (a.act === 'ability') { puff = bump(a.k, 0, 0.5); sq -= puff * 0.06; }
      if (a.act === 'attack') { const s = strike(a.k, 0.4); roll = Math.max(0, a.k - 0.4) * 6.3; fw = Math.max(0, s) * 0.35; up += bump(a.k, 0.4, 0.8) * 0.15; }
      body.rotation.x = roll; B.position.set(0, up, fw); squash(body, sq);
      cheeks.forEach((c) => c.scale.set(1 + puff * 0.8, 0.75 + puff * 0.6, 0.6 + puff * 0.6));
      ant.rotation.z = wob(t, 2.2, 0.2, seed); ant.rotation.x = wob(t, 1.7, 0.15);
      arms.forEach((m, i) => { m.rotation.z = (i ? -1 : 1) * (wob(t, 3, 0.2, i) + (a.pose === 'happy' ? 1.2 : 0)); });
      mouth.scale.y = a.act === 'ability' ? 0.2 + bump(a.k, 0.45, 0.9) * 0.9 : 0.3 + Math.max(0, wob(t, 0.7, 0.15)); alive(a, E, seed, puff);
    },
    ambient(c, a) { if (every(a, 1.5)) { const p = c.at(ant, [0, 0.16, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.3, color: '#DFF8FF', size: 0.06, life: 1 }); } },
    moves: {
      ability: { dur: 1.1, hit: 0.5, fx: async (c) => { const m = c.at(mouth, [0, 0, 0.05]); if (c.target) await stream(c, m, c.target, 12, 30, { kind: 'ice', color: '#BFF4FF', dur: 0.4, size: 0.22, arc: 0.1 }, 0.4); } },
    },
  };
};

export const icicleram: Builder = (k) => {
  const seed = Math.random() * 9;
  const wool = k.mat('#EEF4FA', 'fur'), face = k.mat('#3E4E66', 'skin'), horn = k.mat('#9FE6FF', 'jelly', { emissiveIntensity: 0.35 }), hoof = k.mat('#2A3040', 'shell');
  const B = k.g(k.root), body = k.g(B, [0, 0.46, -0.05]);
  for (let i = 0; i < 14; i++) { const q = i * 2.39, y = Math.sin(i * 1.3) * 0.14, r = 0.24; k.sphere(body, 0.15, wool, [Math.cos(q) * r * 0.8, y, Math.sin(q) * r * 1.2], undefined, 12); }
  k.sphere(body, 0.26, wool, [0, 0, 0], [0.95, 0.85, 1.25]);
  const head = k.g(body, [0, 0.12, 0.34]);
  k.sphere(head, 0.15, face, [0, 0, 0], [0.9, 1, 1.1]);
  k.sphere(head, 0.09, face, [0, -0.08, 0.1], [1, 0.8, 1]);
  for (let i = 0; i < 4; i++) k.sphere(head, 0.07, wool, [(i - 1.5) * 0.06, 0.13, -0.02], undefined, 10);
  const E = k.eyes(head, { y: 0.03, z: 0.1, spread: 0.08, r: 0.055, iris: '#9FE6FF', lid: face, tilt: -0.3, glow: true });
  const mouth = k.mouth(head, [0, -0.12, 0.15], 0.04);
  // big curled ice horns
  const horns = [-1, 1].map((x) => { const h = k.g(head, [x * 0.1, 0.08, -0.02]); const pts: [number, number, number][] = []; for (let i = 0; i <= 8; i++) { const q = (i / 8) * Math.PI * 1.6; pts.push([x * (0.05 + Math.sin(q) * 0.1 + i * 0.012), Math.cos(q) * 0.1 - 0.02, -Math.sin(q * 0.5) * 0.08 + (1 - Math.cos(q)) * 0.03]); } k.tube(h, pts, 0.055, 0.015, horn); return h; });
  const legs = [[-0.12, 0.17], [0.12, 0.17], [-0.12, -0.2], [0.12, -0.2]].map(([x, z], i) => { const l = k.g(B, [x, 0.34, z - 0.05]); k.cyl(l, 0.04, 0.035, 0.3, face, [0, -0.15, 0]); k.cyl(l, 0.045, 0.045, 0.05, hoof, [0, -0.31, 0]); l.userData.ph = i; return l; });
  return {
    height: 1.0,
    anim(a) {
      const t = a.t;
      let fw = 0, dip = 0, scrape = 0;
      if (a.act === 'attack' || a.act === 'ability') { const s = strike(a.k, 0.5); dip = Math.max(0, -s) * 0.3 + Math.max(0, s) * 0.6; fw = Math.max(0, s) * 0.5; scrape = a.k < 0.45 ? 1 : 0; }
      head.rotation.x = dip + wob(t, 0.9, 0.05); head.rotation.y = wob(t, 0.5, 0.2, seed);
      B.position.set(0, hop(a, 8, 0.12), fw); squash(body, wob(t, 2.2, 0.025));
      legs.forEach((l, i) => { l.rotation.x = scrape && i === 1 ? wob(t, 18, 0.5) : a.pose === 'walk' ? wob(t, 12, 0.5, i * Math.PI) : 0; });
      horn.emissiveIntensity = 0.35 + dip * 1.5;
      horns.forEach((h, i) => { h.rotation.z = wob(t, 1, 0.02, i); });
      mouth.scale.y = 0.25 + ((t + seed) % 5 < 0.6 ? 0.5 : 0); alive(a, E, seed, dip * 0.6);
    },
    moves: {
      ability: { dur: 0.7, hit: 0.5, fx: (c) => { const p = c.target ?? c.at(head, [0, 0, 0.3]); sparks(c.fx, p, ICE, 26, 3.5, { size: 0.12, gravity: 5 }); c.fx.ring(p, '#9FE6FF', 1.4); } },
    },
  };
};

export const glacierowl: Builder = (k) => {
  const seed = Math.random() * 9;
  const fea = k.mat('#CFE6F5', 'fur'), white = k.mat('#FFFFFF', 'fur'), dark = k.mat('#5A7A9A', 'fur'), beak = k.mat('#F2B83A', 'shell'), ice = k.mat('#BFF4FF', 'jelly', { emissiveIntensity: 0.4 }), talon = k.mat('#4A4A5A', 'shell');
  const B = k.g(k.root), body = k.g(B, [0, 0.45, 0]);
  k.sphere(body, 0.3, fea, [0, 0, 0], [0.95, 1.15, 0.9]);
  k.sphere(body, 0.22, white, [0, -0.08, 0.13], [0.95, 1.05, 0.6]);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) k.sphere(body, 0.03, dark, [(i - 1.5) * 0.08 + (r % 2) * 0.04, -0.2 + r * 0.09, 0.26], [1, 0.5, 0.4], 6);
  const head = k.g(body, [0, 0.34, 0.02]);
  k.sphere(head, 0.25, fea, [0, 0, 0], [1.1, 0.9, 0.9]);
  // the facial disc and huge eyes
  k.sphere(head, 0.12, white, [-0.1, 0, 0.13], [1, 1, 0.5]); k.sphere(head, 0.12, white, [0.1, 0, 0.13], [1, 1, 0.5]);
  const E = k.eyes(head, { y: 0.0, z: 0.17, spread: 0.1, r: 0.09, iris: '#FFC21A', lid: fea });
  const bk = k.g(head, [0, -0.07, 0.22]); k.cone(bk, 0.035, 0.1, beak, [0, -0.02, 0], [Math.PI, 0, 0], 8);
  for (const x of [-1, 1]) k.ico(head, 0.07, ice, [x * 0.17, 0.2, -0.02], 0, [0.6, 1.6, 0.6]).rotation.z = -x * 0.4;
  const wings = ([-1, 1] as const).map((x) => { const w = k.g(body, [x * 0.27, 0.12, -0.02]); for (let i = 0; i < 4; i++) k.leaf(w, 0.42 - i * 0.05, 0.09, i % 2 ? fea : dark, [0, 0, -0.01 * i], [0, 0, Math.PI + x * (0.15 + i * 0.12)]); k.ico(w, 0.05, ice, [x * 0.05, -0.35, 0.02], 0, [0.6, 1.4, 0.6]); return w; });
  for (const x of [-1, 1]) { const f = k.g(B, [x * 0.1, 0.12, 0.08]); for (let i = 0; i < 3; i++) k.cone(f, 0.018, 0.08, talon, [(i - 1) * 0.03, -0.06, 0.03], [1.2, 0, 0], 5); k.cyl(f, 0.03, 0.03, 0.1, beak, [0, 0, 0]); }
  let tilt = 0;
  return {
    height: 1.15,
    anim(a) {
      const t = a.t;
      // the owl's head tilts and swivels in jerky little steps
      const step = Math.floor((t + seed) / 1.6); const goal = Math.sin(step * 12.9) * 0.6; tilt += (goal - tilt) * Math.min(1, a.dt * 10);
      let spread = 0, up = hop(a, 7, 0.12), fw = 0;
      if (a.act === 'ability' || a.act === 'play') { spread = bump(a.k, 0, 1); up += spread * 0.4; }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.4; spread = Math.max(0, -s) * 0.5; body.rotation.x = Math.max(0, s) * 0.5; } else body.rotation.x = 0;
      head.rotation.y = tilt; head.rotation.z = Math.sin(step * 7.1) * 0.2;
      wings.forEach((w, i) => { const x = i ? 1 : -1; w.rotation.z = x * (spread * 1.6 + (spread > 0.1 ? wob(t, 14, 0.3) : 0)); });
      B.position.set(0, up, fw); squash(body, wob(t, 2.3, 0.025));
      alive(a, E, seed, 0, [0, wob(t, 0.4, 0.15)]);
    },
    moves: {
      ability: { dur: 1.5, hit: 0.55, fx: (c) => { const p = c.self.clone().setY(c.self.y + 1.4); sparks(c.fx, p, ICE, 30, 2.5, { gravity: -0.3, life: 1.3 }); c.fx.emoji(p, '🃏', 0.7); for (let i = 0; i < 18; i++) c.fx.soft({ x: p.x + (Math.random() - 0.5) * 1.2, y: p.y, z: p.z + (Math.random() - 0.5) * 1.2, vy: -0.5, color: '#FFFFFF', size: 0.08, life: 2 }); } },
    },
  };
};

export const frostmaw: Builder = (k) => {
  const seed = Math.random() * 9;
  const fur = k.mat('#F2F6FA', 'fur'), furB = k.mat('#C8DCEA', 'fur'), skin = k.mat('#6A9AC8', 'skin'), horn = k.mat('#E8E4D8', 'shell'), ice = k.mat('#9FE6FF', 'jelly');
  const B = k.g(k.root), body = k.g(B, [0, 0.62, 0]);
  k.sphere(body, 0.42, fur, [0, 0, 0], [1.05, 1.05, 0.9]);
  for (let i = 0; i < 16; i++) { const q = i * 2.39, y = -0.3 + (i % 5) * 0.14; k.sphere(body, 0.13, i % 3 ? fur : furB, [Math.cos(q) * 0.38, y, Math.sin(q) * 0.33], [1, 1.3, 1], 10); }
  k.sphere(body, 0.26, skin, [0, -0.05, 0.24], [1, 1.1, 0.5]);
  const head = k.g(body, [0, 0.38, 0.12]);
  k.sphere(head, 0.25, fur, [0, 0.03, -0.03], [1.1, 0.9, 1]);
  k.sphere(head, 0.17, skin, [0, -0.03, 0.12], [1.1, 0.95, 0.65]);
  k.box(head, 0.34, 0.06, 0.1, furB, [0, 0.09, 0.16], [0.2, 0, 0]);
  const E = k.eyes(head, { y: 0.03, z: 0.2, spread: 0.075, r: 0.055, iris: '#2A6AC8', lid: skin, tilt: -0.3 });
  const jaw = k.mouth(head, [0, -0.1, 0.21], 0.1, { fangs: 2, teeth: true, color: '#2A1A3A' });
  for (const x of [-1, 1]) k.tube(head, [[x * 0.18, 0.12, -0.02], [x * 0.3, 0.2, -0.04], [x * 0.32, 0.34, 0.0]], 0.045, 0.01, horn);
  const arm = (x: number) => { const sh = k.g(body, [x * 0.42, 0.15, 0.02]); k.cap(sh, 0.12, 0.35, fur, [x * 0.08, -0.25, 0.02], [0, 0, x * 0.15]); const hand = k.g(sh, [x * 0.14, -0.52, 0.06]); k.sphere(hand, 0.12, skin, [0, 0, 0], [1, 0.9, 1.1]); for (let i = 0; i < 3; i++) k.cone(hand, 0.025, 0.08, horn, [(i - 1) * 0.06, -0.08, 0.08], [1.8, 0, 0], 5); return sh; };
  const aL = arm(-1), aR = arm(1);
  const legs = [-1, 1].map((x) => { const l = k.g(B, [x * 0.2, 0.32, 0]); k.cap(l, 0.12, 0.15, fur, [0, -0.12, 0]); k.sphere(l, 0.13, skin, [0, -0.28, 0.06], [1, 0.5, 1.4]); return l; });
  const crystals = [0, 1, 2].map((i) => k.ico(body, 0.07, ice, [(i - 1) * 0.15, 0.32, -0.3], 0, [0.6, 1.5, 0.6]));
  return {
    height: 1.55,
    anim(a) {
      const t = a.t;
      let roar = 0, beat = 0, fw = 0, smash = 0;
      if (a.act === 'ability' || a.act === 'play') { beat = a.k < 0.4 ? Math.abs(Math.sin(a.k * 40)) : 0; roar = bump(a.k, 0.4, 1); }
      if (a.act === 'attack') { const s = strike(a.k, 0.5); smash = s; fw = Math.max(0, s) * 0.35; }
      aL.rotation.x = -beat * 1.2 - Math.max(0, -smash) * 2.4 + Math.max(0, smash) * 0.6 + wob(t, 1.2, 0.08); aR.rotation.x = -(a.k < 0.4 && a.act === 'ability' ? Math.abs(Math.sin(a.k * 40 + 1.5)) : 0) * 1.2 - Math.max(0, -smash) * 2.4 + Math.max(0, smash) * 0.6 + wob(t, 1.2, 0.08, 1);
      aL.rotation.z = -roar * 0.7; aR.rotation.z = roar * 0.7;
      body.rotation.x = -roar * 0.25 + Math.max(0, smash) * 0.3; body.rotation.z = wob(t, 1.1, 0.04, seed);
      head.rotation.x = -roar * 0.4; head.rotation.y = wob(t, 0.4, 0.25, seed);
      B.position.set(0, hop(a, 6, 0.1), fw);
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' ? wob(t, 8, 0.4, i * Math.PI) : 0; });
      crystals.forEach((c, i) => { c.scale.y = 1.5 + wob(t, 2, 0.1, i) + roar; });
      jaw.scale.y = 0.3 + roar * 1.0 + (a.act === 'attack' ? 0.5 : 0); alive(a, E, seed, roar > 0.3 ? 0.4 : 0);
    },
    moves: {
      ability: { dur: 1.7, hit: 0.55, fx: async (c) => { const m = c.at(jaw, [0, 0, 0.1]); c.fx.ring(c.self, '#BFF4FF', 2.5); c.fx.shake(0.3); if (c.target) await stream(c, m, c.target, 18, 28, { kind: 'ice', color: '#BFF4FF', dur: 0.35, size: 0.3, arc: 0 }, 0.8); } },
      attack: { dur: 0.75, hit: 0.55, fx: (c) => { c.fx.shake(0.18); if (c.target) sparks(c.fx, c.target, ICE, 18, 3); } },
    },
  };
};

export const aurorawyrm: Builder = (k) => {
  const seed = Math.random() * 9;
  const scale = k.mat('#5AA8E8', 'shell'), belly = k.mat('#E8F6FF', 'shell'), mane = k.mat('#9FFFE0', 'glow', { emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }), mane2 = k.mat('#C89BFF', 'glow', { emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }), horn = k.mat('#F4FAFF', 'shell');
  const B = k.g(k.root), spine = k.g(B, [0, 0.9, 0]);
  const N = k.phone ? 10 : 14;
  const segs = Array.from({ length: N }, (_, i) => {
    const s = k.g(spine); const r = 0.17 * (1 - (i / N) * 0.75);
    k.sphere(s, r, scale, [0, 0, 0], [1, 0.95, 1.2], 14); k.sphere(s, r * 0.75, belly, [0, -r * 0.35, 0.02], [1, 0.7, 1.1], 10);
    if (i % 2 === 0 && i > 0) k.leaf(s, 0.25 * (1 - i / N) + 0.08, 0.08, i % 4 ? mane : mane2, [0, r * 0.8, 0], [0, Math.PI / 2, 0]);
    return s;
  });
  const head = k.g(spine);
  k.sphere(head, 0.2, scale, [0, 0, 0], [1, 0.85, 1.15]);
  k.sphere(head, 0.12, scale, [0, -0.05, 0.17], [1, 0.7, 1.1]);
  const E = k.eyes(head, { y: 0.06, z: 0.12, spread: 0.1, r: 0.06, iris: '#9FFFE0', lid: scale, tilt: -0.25, glow: true });
  const jaw = k.mouth(head, [0, -0.1, 0.2], 0.08, { fangs: 2 });
  for (const x of [-1, 1]) { k.tube(head, [[x * 0.08, 0.12, -0.05], [x * 0.12, 0.25, -0.15], [x * 0.1, 0.35, -0.3]], 0.03, 0.006, horn); k.leaf(head, 0.28, 0.1, x > 0 ? mane : mane2, [x * 0.14, 0.02, -0.08], [0, x * 1.2, x * -1.4]); }
  for (const x of [-1, 1]) k.tube(head, [[x * 0.08, -0.06, 0.22], [x * 0.2, -0.1, 0.26], [x * 0.3, -0.2, 0.2]], 0.012, 0.004, mane);
  const P = new THREE.Vector3();
  const place = (t: number, amp: number, rise: number) => {
    // the body drifts in a lazy S through the air, the head leading
    for (let i = 0; i < N; i++) {
      const u = i / N, s = segs[i];
      P.set(Math.sin(t * 1.6 - u * 5 + seed) * 0.3 * amp * (0.4 + u), Math.sin(t * 1.2 - u * 5.5) * 0.2 * amp - u * 0.45 + rise * (1 - u) * 0.5, -u * 1.15 + 0.15);
      s.position.copy(P); s.rotation.y = Math.cos(t * 1.6 - u * 5 + seed) * 0.5 * amp;
    }
    head.position.set(Math.sin(t * 1.6 + seed) * 0.12 * amp, 0.22 + Math.sin(t * 1.2 + 0.6) * 0.14 * amp + rise * 0.6, 0.34 + rise * 0.1);
  };
  return {
    height: 1.6,
    anim(a) {
      const t = a.t;
      let rise = 0, fw = 0, roar = 0;
      if (a.act === 'ability' || a.act === 'play') { rise = bump(a.k, 0, 1); roar = bump(a.k, 0.35, 0.9); }
      if (a.act === 'attack') { const s = strike(a.k); fw = Math.max(0, s) * 0.6; roar = Math.max(0, s); }
      place(t, 1 + rise * 0.6, rise); head.rotation.x = -roar * 0.4 + wob(t, 1.2, 0.08); head.rotation.y = wob(t, 0.7, 0.2, seed);
      B.position.set(0, wob(t, 1.3, 0.06) + hop(a, 5, 0.1), fw);
      mane.emissiveIntensity = 1 + wob(t, 2, 0.4) + rise; mane2.emissiveIntensity = 1 + wob(t, 2, 0.4, 2) + rise;
      jaw.scale.y = 0.25 + roar * 0.9; alive(a, E, seed, 0);
    },
    ambient(c, a) { if (every(a, 5)) { const s = segs[(Math.random() * N) | 0]; const p = c.at(s); c.fx.add({ x: p.x, y: p.y + 0.1, z: p.z, vy: 0.2, vx: (Math.random() - 0.5) * 0.2, color: Math.random() < 0.5 ? '#9FFFE0' : '#C89BFF', size: 0.07, life: 1.4 }); } },
    moves: {
      ability: { dur: 2.0, hit: 0.5, fx: async (c) => {
        const m = c.at(head, [0, 0, 0.25]); motes(c.fx, c.self.clone().setY(c.self.y + 1), ['#9FFFE0', '#C89BFF', '#FFFFFF'], 40, 1.2);
        c.fx.ring(c.self, '#9FFFE0', 4, 1);
        await Promise.all(c.targets.map((g, i) => new Promise<void>((r) => setTimeout(() => void c.fx.shot(m, g, { kind: 'ice', color: i % 2 ? '#C89BFF' : '#9FFFE0', dur: 0.5, size: 0.4, arc: 1.2 }).then(() => { sparks(c.fx, g, ICE, 14, 2.5); r(); }), i * 90))));
      } },
    },
  };
};
