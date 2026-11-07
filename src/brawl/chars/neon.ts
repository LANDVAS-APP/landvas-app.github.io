// ⚡ Neon: Volt Bug, Circuit Cat, Laser Lynx, the Mecha Mantis and the Grid Overlord.
import * as THREE from 'three';
import { alive, bump, every, hop, sparks, squash, strike, wob, type Builder } from './core';
import type { Kit } from './kit';

const NEON = ['#22E3FF', '#FF4FD8', '#FFFFFF'];
const circuits = (k: Kit, base: string, line: string) => k.paint(256, 128, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 256, 128); g.strokeStyle = line; g.lineWidth = 3; g.fillStyle = line;
  let s = 3; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 18; i++) { let x = r() * 256, y = r() * 128; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 3; j++) { if (r() < 0.5) x += (r() - 0.5) * 80; else y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
});

export const voltbug: Builder = (k) => {
  const seed = Math.random() * 9;
  const shell = k.mat('#2A3A8A', 'metal'), stripe = k.mat('#22E3FF', 'glow'), under = k.mat('#1A1A2A', 'shell'), wingM = k.mat('#BFF4FF', 'jelly', { opacity: 0.4 }), tip = k.mat('#FF4FD8', 'glow');
  const B = k.g(k.root), body = k.g(B, [0, 0.3, 0]);
  k.sphere(body, 0.2, under, [0, -0.04, 0], [1, 0.7, 1.25]);
  const shL = k.g(body, [0, 0.03, -0.02]), shR = k.g(body, [0, 0.03, -0.02]);
  k.mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI, 0, Math.PI / 2), shell, shL, [0, 0, 0], [0, -Math.PI / 2, 0], [1, 0.8, 1.2]);
  k.mesh(new THREE.SphereGeometry(0.22, 20, 12, Math.PI, Math.PI, 0, Math.PI / 2), shell, shR, [0, 0, 0], [0, -Math.PI / 2, 0], [1, 0.8, 1.2]);
  for (const [g, x] of [[shL, -1], [shR, 1]] as const) for (let i = 0; i < 2; i++) k.tube(g, [[x * 0.06 * (i + 1), 0.17 - i * 0.03, 0.18], [x * 0.09 * (i + 1), 0.18 - i * 0.04, 0], [x * 0.06 * (i + 1), 0.14 - i * 0.03, -0.2]], 0.012, 0.012, stripe);
  const wings = ([-1, 1] as const).map((x) => { const w = k.wing(body, 'bug', 0.5, wingM, [x * 0.05, 0.12, -0.05], x); w.rotation.y = -x * 1.4; w.visible = false; return w; });
  const head = k.g(body, [0, 0.02, 0.24]);
  k.sphere(head, 0.12, under, [0, 0, 0], [1.1, 0.95, 0.9]);
  const E = k.eyes(head, { y: 0.03, z: 0.07, spread: 0.06, r: 0.06, iris: '#22E3FF', lid: under, glow: true });
  const mouth = k.mouth(head, [0, -0.06, 0.09], 0.03);
  const ants = [-1, 1].map((x) => { const a = k.g(head, [x * 0.05, 0.08, 0.04]); k.tube(a, [[0, 0, 0], [x * 0.06, 0.12, 0.06], [x * 0.1, 0.2, 0.04]], 0.01, 0.008, under); k.sphere(a, 0.03, tip, [x * 0.1, 0.2, 0.04], undefined, 8); return a; });
  const legs = Array.from({ length: 6 }, (_, i) => { const x = i % 2 ? 1 : -1, z = (Math.floor(i / 2) - 1) * 0.12; const l = k.g(B, [x * 0.14, 0.24, z]); k.tube(l, [[0, 0, 0], [x * 0.1, 0.03, 0], [x * 0.14, -0.22, 0.02]], 0.018, 0.01, under); return l; });
  return {
    height: 0.75,
    anim(a) {
      const t = a.t;
      let open = 0, up = hop(a, 12, 0.12), fw = 0;
      if (a.act === 'ability' || a.act === 'play') { open = bump(a.k, 0, 1); up += open * 0.35; }
      if (a.act === 'attack') { const s = strike(a.k, 0.4); fw = Math.max(0, s) * 0.4; open = Math.max(0, -s) * 0.7; up += bump(a.k, 0.4, 0.8) * 0.15; }
      // buzzes its wings out in quick bursts
      const buzz = (t + seed) % 4 < 0.4 ? 0.5 : 0; open = Math.max(open, buzz);
      shL.rotation.z = open * 0.8; shR.rotation.z = -open * 0.8;
      wings.forEach((w) => { w.visible = open > 0.1; const x = w.userData.side as number; w.rotation.z = x * (0.3 + wob(t, 60, 0.4)); });
      B.position.set(0, up + open * wob(t, 40, 0.01), fw);
      ants.forEach((an, i) => { an.rotation.x = wob(t, 6, 0.2, i); an.rotation.z = wob(t, 4, 0.2, i * 2); });
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' ? wob(t, 22, 0.4, i * 1.3) : 0; });
      stripe.emissiveIntensity = 1.6 + wob(t, 5, 0.8) + open * 2;
      squash(body, wob(t, 3, 0.02)); mouth.scale.y = 0.3 + open * 0.4; alive(a, E, seed, 0);
    },
    ambient(c, a) { if (every(a, 2)) { const p = c.at(ants[(Math.random() * 2) | 0], [0, 0.2, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.4, color: NEON[(Math.random() * 2) | 0], size: 0.05, life: 0.4 }); } },
    moves: {
      ability: { dur: 1.1, hit: 0.55, fx: (c) => { const p = c.at(head, [0, 0.2, 0]); if (c.target) { c.fx.beam(p, c.target, '#22E3FF', 0.35, 0.06); sparks(c.fx, c.target, NEON, 18, 3); } } },
    },
  };
};

export const circuitcat: Builder = (k) => {
  const seed = Math.random() * 9;
  const plate = k.mat('#E8F0F8', 'metal', { metalness: 0.4, roughness: 0.25, map: circuits(k, '#E8F0F8', '#7AD8E8') }), dark = k.mat('#2A3040', 'metal'), glow = k.mat('#22E3FF', 'glow'), pink = k.mat('#FF4FD8', 'glow');
  const B = k.g(k.root), body = k.g(B, [0, 0.32, -0.04]);
  k.sphere(body, 0.22, plate, [0, 0, 0], [0.85, 0.85, 1.3]);
  k.torus(body, 0.19, 0.012, glow, [0, 0, 0.12], [0, 0, 0]);
  const head = k.g(body, [0, 0.22, 0.24]);
  k.sphere(head, 0.2, plate, [0, 0, 0], [1.1, 0.95, 0.95]);
  k.sphere(head, 0.15, dark, [0, -0.01, 0.07], [1.05, 0.75, 0.65]);
  const E = k.eyes(head, { y: 0.01, z: 0.14, spread: 0.075, r: 0.055, iris: '#22E3FF', lid: dark, glow: true, sclera: '#0A1A2A' });
  const mouth = k.mouth(head, [0, -0.08, 0.16], 0.04, { color: '#22E3FF' });
  for (const x of [-1, 1]) for (let i = 0; i < 2; i++) k.box(head, 0.1, 0.006, 0.006, glow, [x * 0.17, -0.04 - i * 0.025, 0.12], [0, -x * 0.4, x * 0.1 * (i ? -1 : 1)]);
  const ears = [-1, 1].map((x) => { const e = k.g(head, [x * 0.11, 0.15, -0.02], [0, 0, -x * 0.25]); k.cone(e, 0.07, 0.16, plate, [0, 0.07, 0], undefined, 4); k.cone(e, 0.04, 0.1, pink, [0, 0.06, 0.02], undefined, 4); return e; });
  const legs = [[-0.1, 0.17], [0.1, 0.17], [-0.1, -0.17], [0.1, -0.17]].map(([x, z], i) => k.leg(B, [x, 0.24, z - 0.04], 0.24, 0.04, dark, plate, i * Math.PI).pivot);
  // a cable tail with a plug on the end
  const tail = k.g(body, [0, 0.04, -0.28]);
  k.tube(tail, [[0, 0, 0], [0, 0.1, -0.12], [0, 0.28, -0.12], [0, 0.38, 0.0]], 0.025, 0.02, dark);
  const plug = k.g(tail, [0, 0.4, 0.02]); k.box(plug, 0.07, 0.08, 0.06, plate, [0, 0, 0]); for (const x of [-1, 1]) k.box(plug, 0.012, 0.05, 0.012, k.mat('#FFD24A', 'metal'), [x * 0.02, 0.06, 0]);
  return {
    height: 0.95,
    anim(a) {
      const t = a.t;
      let fw = 0, up = hop(a, 9, 0.15), zap = 0;
      if (a.act === 'attack') { const s = strike(a.k, 0.4); fw = Math.max(0, s) * 0.4; up += bump(a.k, 0.4, 0.8) * 0.2; body.rotation.x = s * 0.25; } else body.rotation.x = 0;
      if (a.act === 'ability') zap = bump(a.k, 0, 1);
      B.position.set(0, up, fw);
      // the tail swishes like a cat's; it straightens up when it zaps
      tail.rotation.x = -zap * 0.6 + wob(t, 1.5, 0.15); tail.rotation.y = wob(t, 1.1, 0.5) * (1 - zap);
      head.rotation.z = wob(t, 0.7, 0.15, seed) + ((t + seed) % 5 < 0.6 ? 0.3 : 0); // a curious head tilt
      ears.forEach((e, i) => { e.rotation.x = wob(t, 4, 0.08, i) + ((t + seed + i * 0.15) % 3 < 0.1 ? -0.4 : 0); });
      legs.forEach((p, i) => { p.rotation.x = a.pose === 'walk' || a.act === 'attack' ? wob(t, 14, 0.5, i * Math.PI) : 0; });
      glow.emissiveIntensity = 1.8 + wob(t, 2.5, 0.6) + zap * 3;
      squash(body, wob(t, 2.4, 0.025)); mouth.scale.y = 0.25 + zap * 0.5; alive(a, E, seed, 0);
    },
    moves: {
      ability: { dur: 0.9, hit: 0.5, fx: async (c) => { const p = c.at(plug, [0, 0.08, 0]); sparks(c.fx, p, NEON, 14, 2); if (c.target) { await c.fx.shot(p, c.target, { kind: 'bolt', color: '#22E3FF', dur: 0.3, size: 0.25, arc: 0.5 }); sparks(c.fx, c.target, NEON, 16, 3); } } },
    },
  };
};

export const laserlynx: Builder = (k) => {
  const seed = Math.random() * 9;
  const stripesT = k.paint(256, 128, (g) => { g.fillStyle = '#3A3450'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#FF4FD8'; g.lineWidth = 5; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(i * 26, 0); g.lineTo(i * 26 + 8, 40); g.lineTo(i * 26 - 2, 80); g.stroke(); } });
  const fur = k.mat('#FFFFFF', 'fur', { map: stripesT, emissive: '#FF4FD8', emissiveIntensity: 0.08 }), furL = k.mat('#8A84A8', 'fur'), visorM = k.mat('#FF4FD8', 'glow', { emissiveIntensity: 1.6 }), metal = k.mat('#C8C8D8', 'metal'), dark = k.mat('#1A1626', 'fur');
  const B = k.g(k.root), body = k.g(B, [0, 0.44, -0.04]);
  k.sphere(body, 0.24, fur, [0, 0, 0], [0.85, 0.85, 1.4]);
  k.sphere(body, 0.15, furL, [0, -0.07, 0.15], [1, 0.8, 1]);
  const head = k.g(body, [0, 0.22, 0.32]);
  k.sphere(head, 0.19, fur, [0, 0, 0], [1.15, 0.95, 0.95]);
  k.sphere(head, 0.1, furL, [0, -0.07, 0.12], [1.3, 0.75, 0.9]);
  for (const x of [-1, 1]) k.cone(head, 0.07, 0.15, furL, [x * 0.17, -0.07, 0.02], [0, 0, x * 2.2], 8); // cheek ruff
  k.sphere(head, 0.028, dark, [0, -0.04, 0.21], [1.3, 1, 1]);
  const E = k.eyes(head, { y: 0.04, z: 0.13, spread: 0.08, r: 0.058, iris: '#FFD21A', lid: fur, tilt: -0.25 });
  const mouth = k.mouth(head, [0, -0.1, 0.16], 0.045, { fangs: 2 });
  // the visor slides down over its eyes when it fires
  const visor = k.g(head, [0, 0.05, 0.02]); k.mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 24, Math.PI * 0.9), visorM, visor, [0, 0, 0], [0, 0, Math.PI * 0.05]); k.box(visor, 0.04, 0.04, 0.04, metal, [0.17, 0.02, 0]); k.box(visor, 0.04, 0.04, 0.04, metal, [-0.17, 0.02, 0]);
  const ears = [-1, 1].map((x) => { const e = k.g(head, [x * 0.11, 0.15, -0.03], [0, 0, -x * 0.15]); k.cone(e, 0.06, 0.18, fur, [0, 0.08, 0], undefined, 6); k.cone(e, 0.015, 0.1, dark, [0, 0.2, 0], undefined, 4); return e; });
  const legs = [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]].map(([x, z], i) => k.leg(B, [x, 0.36, z - 0.04], 0.36, 0.05, fur, dark, i * Math.PI).pivot);
  const tail = k.g(body, [0, 0.08, -0.33]); k.tube(tail, [[0, 0, 0], [0, 0.05, -0.08], [0, 0.04, -0.14]], 0.05, 0.04, fur); k.sphere(tail, 0.045, dark, [0, 0.04, -0.15]);
  return {
    height: 1.1,
    anim(a) {
      const t = a.t;
      let aim = 0, fw = 0, crouch = 0;
      if (a.act === 'ability') aim = bump(a.k, 0, 1);
      if (a.act === 'attack') { const s = strike(a.k, 0.5); crouch = Math.max(0, -s); fw = Math.max(0, s) * 0.55; } else if ((t + seed) % 7 < 1.2) crouch = 0.35 * bump(((t + seed) % 7) / 1.2); // a stalking crouch now and then
      visor.rotation.x = 1.6 - Math.max(aim, crouch > 0.3 ? 0.5 : 0) * 1.6; visor.visible = visor.rotation.x < 1.55;
      body.position.y = 0.44 - crouch * 0.1; body.rotation.x = crouch * 0.15;
      B.position.set(0, hop(a, 8, 0.12), fw);
      head.rotation.y = wob(t, 0.5, 0.3, seed) * (1 - aim); head.rotation.x = -crouch * 0.2;
      tail.rotation.x = wob(t, 2, 0.4); ears.forEach((e, i) => { e.rotation.x = -crouch * 0.4 + wob(t, 3, 0.06, i); });
      legs.forEach((p, i) => { p.rotation.x = a.pose === 'walk' || a.act === 'attack' ? wob(t, 14, 0.5, i * Math.PI) : 0; });
      mouth.scale.y = 0.25 + crouch * 0.4; alive(a, E, seed, 0);
    },
    moves: {
      ability: { dur: 1.0, hit: 0.55, fx: (c) => {
        const p = c.at(visor, [0, 0, 0.18]);
        for (const g of c.targets.length ? c.targets : c.target ? [c.target] : []) { c.fx.beam(p, g, '#FF4FD8', 0.4, 0.07); sparks(c.fx, g, ['#FF4FD8', '#FFFFFF'], 18, 3); c.fx.ring(g, '#FF4FD8', 1.2); }
      } },
    },
  };
};

export const mechamantis: Builder = (k) => {
  const seed = Math.random() * 9;
  const armor = k.mat('#3ADC8A', 'metal', { metalness: 0.6 }), dark = k.mat('#1A2A22', 'metal'), blade = k.mat('#E8FFF4', 'metal', { metalness: 0.9, roughness: 0.12 }), glow = k.mat('#9BFF7A', 'glow'), eyeG = k.mat('#FF4FD8', 'glow');
  const B = k.g(k.root), body = k.g(B, [0, 0.42, -0.1]);
  k.cap(body, 0.12, 0.35, armor, [0, 0, -0.1], [Math.PI / 2.2, 0, 0]);
  for (let i = 0; i < 3; i++) k.torus(body, 0.12 - i * 0.015, 0.012, glow, [0, -0.02 - i * 0.05, -0.18 - i * 0.1], [Math.PI / 2.2, 0, 0]);
  const thorax = k.g(body, [0, 0.12, 0.1], [-0.7, 0, 0]);
  k.cap(thorax, 0.08, 0.22, armor, [0, 0.12, 0]);
  const head = k.g(thorax, [0, 0.3, 0.02]);
  const hm = k.mesh(new THREE.ConeGeometry(0.15, 0.22, 3), armor, head, [0, 0, 0], [Math.PI / 2 + 0.7, 0, Math.PI]);
  hm.scale.set(1.3, 1, 0.7);
  const E = k.eyes(head, { y: 0.03, z: 0.04, spread: 0.11, r: 0.06, iris: '#FF4FD8', lid: armor, glow: true, sclera: '#1A0A1A' });
  void eyeG;
  for (const x of [-1, 1]) k.tube(head, [[x * 0.04, 0.06, 0], [x * 0.08, 0.2, 0.04], [x * 0.14, 0.28, 0.12]], 0.008, 0.006, dark);
  // the twin scythe arms
  const arm = (x: number) => { const sh = k.g(thorax, [x * 0.09, 0.22, 0.04]); k.cap(sh, 0.035, 0.18, armor, [0, -0.1, 0.04], [0.4, 0, 0]); const fore = k.g(sh, [0, -0.2, 0.1]); k.cap(fore, 0.03, 0.16, dark, [0, 0.08, 0.04], [-0.5, 0, 0]); const bl = k.g(fore, [0, 0.16, 0.08]); const sh2 = new THREE.Shape(); sh2.moveTo(0, 0); sh2.quadraticCurveTo(0.08, -0.1, 0.02, -0.34); sh2.quadraticCurveTo(-0.01, -0.15, -0.03, 0); sh2.lineTo(0, 0); k.mesh(new THREE.ExtrudeGeometry(sh2, { depth: 0.012, bevelEnabled: false }), blade, bl, [0, 0, 0], [0, Math.PI / 2, 0]); sh.userData.fore = fore; return sh; };
  const aL = arm(-1), aR = arm(1);
  const legs = Array.from({ length: 4 }, (_, i) => { const x = i % 2 ? 1 : -1, z = Math.floor(i / 2) ? -0.25 : -0.02; const l = k.g(B, [x * 0.08, 0.38, z - 0.1]); k.tube(l, [[0, 0, 0], [x * 0.16, 0.12, 0], [x * 0.24, -0.36, 0.02]], 0.02, 0.01, dark); return l; });
  const wings = ([-1, 1] as const).map((x) => { const w = k.wing(body, 'bug', 0.55, k.mat('#9BFF7A', 'jelly', { opacity: 0.35 }), [x * 0.03, 0.08, -0.05], x); w.rotation.y = -x * 1.7; w.rotation.x = 0.5; return w; });
  return {
    height: 1.2,
    anim(a) {
      const t = a.t;
      // twin strike: two slashes, left then right
      let sL = 0, sR = 0, fw = 0, flare = 0;
      if (a.act === 'attack' || a.act === 'ability') { sL = strike(Math.min(1, a.k * 1.8), 0.4); sR = strike(Math.max(0, a.k * 1.8 - 0.8), 0.4); fw = Math.max(0, Math.max(sL, sR)) * (a.act === 'attack' ? 0.4 : 0.15); flare = 1; }
      if (a.act === 'play') flare = bump(a.k, 0, 1);
      // the praying pose: arms folded, swaying like a mantis
      aL.rotation.x = -0.3 + wob(t, 1.4, 0.05) - Math.max(0, -sL) * 1.2 + Math.max(0, sL) * 1.4; aR.rotation.x = -0.3 + wob(t, 1.4, 0.05, 1) - Math.max(0, -sR) * 1.2 + Math.max(0, sR) * 1.4;
      (aL.userData.fore as THREE.Group).rotation.x = -1.6 + Math.max(0, sL) * 1.5; (aR.userData.fore as THREE.Group).rotation.x = -1.6 + Math.max(0, sR) * 1.5;
      thorax.rotation.z = wob(t, 0.9, 0.1, seed); head.rotation.z = wob(t, 0.7, 0.3, seed); head.rotation.y = wob(t, 0.45, 0.4, seed);
      wings.forEach((w) => { const x = w.userData.side as number; w.rotation.z = x * (0.1 + flare * (0.4 + wob(t, 40, 0.3))); });
      B.position.set(0, hop(a, 8, 0.1), fw);
      legs.forEach((l, i) => { l.rotation.x = a.pose === 'walk' ? wob(t, 14, 0.4, i * 1.6) : 0; });
      glow.emissiveIntensity = 1.6 + wob(t, 3, 0.6) + flare * 2;
      alive(a, E, seed, 0);
    },
    moves: {
      attack: { dur: 0.8, hit: 0.35, fx: (c) => { const g = c.target ?? c.self; sparks(c.fx, g.clone().setY(g.y + 0.8), ['#E8FFF4', '#9BFF7A'], 12, 3, { size: 0.08 }); } },
      ability: { dur: 0.8, hit: 0.75, fx: (c) => { const g = c.target ?? c.self; sparks(c.fx, g.clone().setY(g.y + 0.8), ['#E8FFF4', '#9BFF7A', '#FF4FD8'], 20, 3.5, { size: 0.08 }); c.fx.emoji(g.clone().setY(g.y + 1.3), '✖️', 0.6); } },
    },
  };
};

export const gridoverlord: Builder = (k) => {
  const seed = Math.random() * 9;
  const frame = k.mat('#2A2A3A', 'metal'), trim = k.mat('#FF4FD8', 'glow'), arm = k.mat('#5A5A7A', 'metal'), thruster = k.mat('#22E3FF', 'glow');
  // its screen face: drawn eyes and a grin that change with its mood
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192; const sg = cv.getContext('2d')!;
  const screenT = new THREE.CanvasTexture(cv); screenT.colorSpace = THREE.SRGBColorSpace; k.texs.push(screenT);
  let mood = '';
  const drawFace = (m: 'calm' | 'angry' | 'blink' | 'laugh') => {
    if (m === mood) return; mood = m;
    sg.fillStyle = '#0A0A2A'; sg.fillRect(0, 0, 256, 192);
    sg.strokeStyle = 'rgba(34,227,255,0.15)'; sg.lineWidth = 1; for (let i = 0; i < 192; i += 6) { sg.beginPath(); sg.moveTo(0, i); sg.lineTo(256, i); sg.stroke(); }
    sg.fillStyle = '#22E3FF'; sg.shadowColor = '#22E3FF'; sg.shadowBlur = 16;
    for (const x of [80, 176]) { if (m === 'blink') sg.fillRect(x - 26, 76, 52, 8); else if (m === 'laugh') { sg.beginPath(); sg.moveTo(x - 26, 86); sg.lineTo(x, 60); sg.lineTo(x + 26, 86); sg.lineWidth = 10; sg.strokeStyle = '#22E3FF'; sg.stroke(); } else { sg.beginPath(); sg.arc(x, 76, 22, 0, 7); sg.fill(); if (m === 'angry') { sg.fillStyle = '#0A0A2A'; sg.beginPath(); sg.moveTo(x - 30, 46); sg.lineTo(x + 30, x < 128 ? 70 : 46); sg.lineTo(x + 30, 40); sg.lineTo(x - 30, 40); sg.fill(); if (x > 128) { sg.beginPath(); sg.moveTo(x - 30, 70); sg.lineTo(x + 30, 46); sg.lineTo(x + 30, 40); sg.lineTo(x - 30, 40); sg.fill(); } sg.fillStyle = '#22E3FF'; } } }
    sg.fillStyle = m === 'angry' ? '#FF4FD8' : '#22E3FF'; sg.shadowColor = sg.fillStyle;
    if (m === 'laugh') { sg.beginPath(); sg.arc(128, 128, 40, 0, Math.PI); sg.fill(); } else for (let i = 0; i < 7; i++) sg.fillRect(76 + i * 15, 134 + (m === 'angry' ? -Math.abs(i - 3) * 3 : Math.abs(i - 3) * -3 + 9), 10, 10);
    sg.shadowBlur = 0; screenT.needsUpdate = true;
  };
  drawFace('calm');
  const screen = k.mat('#FFFFFF', 'glow', { map: screenT, emissive: '#FFFFFF', emissiveMap: screenT, emissiveIntensity: 1.4 });
  const B = k.g(k.root), hover = k.g(B, [0, 1.0, 0]);
  const mon = k.g(hover);
  k.box(mon, 0.78, 0.6, 0.3, frame, [0, 0, -0.05]);
  k.box(mon, 0.68, 0.5, 0.02, screen, [0, 0, 0.105]);
  k.box(mon, 0.8, 0.03, 0.04, trim, [0, 0.31, 0.1]); k.box(mon, 0.8, 0.03, 0.04, trim, [0, -0.31, 0.1]);
  k.box(mon, 0.5, 0.4, 0.2, frame, [0, 0, -0.28]);
  for (const x of [-1, 1]) { const an = k.g(mon, [x * 0.28, 0.3, -0.05]); k.cyl(an, 0.012, 0.012, 0.25, arm, [0, 0.12, 0]); k.sphere(an, 0.035, trim, [0, 0.26, 0], undefined, 8); }
  const arms = [-1, 1].map((x) => {
    const sh = k.g(mon, [x * 0.42, -0.12, -0.05]); k.sphere(sh, 0.07, arm, [0, 0, 0]);
    k.cap(sh, 0.045, 0.24, arm, [x * 0.08, -0.15, 0.05], [0.3, 0, x * 0.3]); const hand = k.g(sh, [x * 0.14, -0.32, 0.12]);
    k.sphere(hand, 0.07, frame, [0, 0, 0]); for (let i = 0; i < 3; i++) k.cone(hand, 0.02, 0.09, trim, [(i - 1) * 0.04, -0.07, 0.03], [Math.PI + 0.3, 0, 0], 5);
    sh.userData.hand = hand; return sh;
  });
  const thr = [-1, 1].map((x) => { const th = k.g(mon, [x * 0.2, -0.35, -0.1]); k.cyl(th, 0.06, 0.08, 0.1, arm, [0, 0, 0], undefined, 10); const f = k.cone(th, 0.07, 0.3, thruster, [0, -0.2, 0], [Math.PI, 0, 0], 10); f.castShadow = false; return f; });
  return {
    height: 1.8,
    anim(a) {
      const t = a.t;
      let raise = 0, fw = 0, smash = 0;
      if (a.act === 'ability' || a.act === 'play') raise = bump(a.k, 0, 1);
      if (a.act === 'attack') { smash = strike(a.k, 0.45); fw = Math.max(0, smash) * 0.45; }
      hover.position.y = 1.0 + wob(t, 1.6, 0.07) + raise * 0.25; hover.rotation.z = wob(t, 0.8, 0.04, seed); hover.rotation.x = Math.max(0, smash) * 0.25;
      mon.rotation.y = wob(t, 0.35, 0.2, seed);
      arms[0].rotation.z = -raise * 1.6 + wob(t, 1.3, 0.1); arms[1].rotation.z = raise * 1.6 - wob(t, 1.3, 0.1, 1);
      arms[0].rotation.x = arms[1].rotation.x = -Math.max(0, -smash) * 1.6 + Math.max(0, smash) * 0.9;
      thr.forEach((f, i) => f.scale.set(1, 1 + wob(t, 20, 0.2, i) + raise, 1));
      B.position.z = fw;
      const bl = (t + seed) % 4.3 < 0.12;
      drawFace(a.act === 'attack' ? 'angry' : raise > 0.2 || a.pose === 'happy' ? 'laugh' : a.hurt > 0.3 ? 'angry' : bl ? 'blink' : 'calm');
      screen.emissiveIntensity = 1.3 + wob(t, 30, 0.05) + raise * 0.6;
    },
    ambient(c, a) { if (every(a, 10)) { const p = c.at(thr[(Math.random() * 2) | 0], [0, -0.3, 0]); c.fx.add({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.3, vy: -0.8, color: '#22E3FF', size: 0.08, life: 0.4 }); } },
    moves: {
      ability: { dur: 1.6, hit: 0.5, fx: (c) => { c.fx.ring(c.self, '#22E3FF', 5, 1); c.fx.ring(c.self, '#FF4FD8', 3.5, 0.8); for (const g of c.targets) { c.fx.beam(c.at(mon), g.clone().setY(g.y + 0.5), '#22E3FF', 0.6, 0.03); sparks(c.fx, g.clone().setY(g.y + 0.5), NEON, 10, 2); } } },
      attack: { dur: 0.8, hit: 0.5, fx: (c) => { if (c.target) { sparks(c.fx, c.target, NEON, 20, 3); c.fx.shake(0.15); } } },
    },
  };
};
