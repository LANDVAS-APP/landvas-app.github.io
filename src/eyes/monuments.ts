// The ultras, standing in first person: each ultra, fusion and Primordial plot raises its own monument over its plot —
// a sun that turns, a crescent moon, a comet streaking past its plinth, a ruined temple, a prism throwing a rainbow, a
// volcano with a glowing crater, a world tree, a ghost, a magnet with iron bits orbiting it, a hive with its bees,
// a crown on a cushion… The Primordials are bigger still: a globe with a beating heart over it, the Throne of Ink, the
// Serpent's Egg on its nest, an eye that watches, a gate into the void.
//
// They're built from the same coloured shapes as the places (builds.ts), with their moving parts turned and bobbed by
// the graphics chip, so a skyline of them costs no more per frame than one.
import * as THREE from 'three';
import type { BuildSite, Kit, PartFn } from './builds';

const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const Y = () => new THREE.Vector3(0, 1, 0);
const Z = () => new THREE.Vector3(0, 0, 1);
const X = () => new THREE.Vector3(1, 0, 0);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const RAINBOW = ['#ff4d6d', '#ff9f1c', '#ffe14d', '#3ddc97', '#22c7ff', '#5b6cff', '#b46bff'];
const GOLD = '#f2c33a', GOLD2 = '#d4a500', STONE = '#b9b2a6', STONE2 = '#8e877c', DARK = '#1b1838';

/** a stepped stone plinth; returns the height of its top */
function plinth(k: Kit, R: number, y: number, c = STONE, c2 = STONE2, seg = 8) {
  k.cyl(R * 0.98, R, 0.35, 0, y, 0, c2, { seg }).cyl(R * 0.74, R * 0.8, 0.32, 0, y + 0.35, 0, c, { seg });
  return y + 0.67;
}
/** an eight-sided crystal standing on y */
function crystal(k: Kit, r: number, h: number, x: number, y: number, z: number, c: string, glow = true, tilt = 0) {
  k.cone(r, h * 0.7, x, y + h * 0.3, z, c, { glow, seg: 6, rz: tilt }).cone(r, h * 0.3, x, y + h * 0.3, z, c, { glow, seg: 6, rx: Math.PI, rz: tilt });
}
/** an arc of a ring (a TorusGeometry slice), standing up facing +z */
function arc(k: Kit, r: number, tube: number, a: number, x: number, y: number, z: number, c: string, o: { glow?: boolean; rz?: number; ry?: number; rx?: number } = {}) {
  k.add(new THREE.TorusGeometry(r, tube, 8, 28, a), c, x, y, z, o);
}
/** a little cloud of glowing motes, bobbing */
function motes(part: PartFn, R: number, y: number, n: number, colors: string[], seed: number) {
  part(v(0, y, 0), 'spin', 0.25 + hash(seed) * 0.2, (w) => {
    for (let i = 0; i < n; i++) {
      const a = hash(seed + i * 1.7) * Math.PI * 2, d = R * (0.5 + hash(seed + i * 2.3) * 0.7), h = (hash(seed + i * 3.1) - 0.3) * R * 1.6;
      w.ball(0.09 + hash(seed + i) * 0.1, Math.cos(a) * d, h, Math.sin(a) * d, colors[i % colors.length], { glow: true, seg: 5 });
    }
  }, Y());
}
/** a tree: trunk, a few boughs of leaves (and maybe glowing fruit) */
function tree(k: Kit, x: number, y: number, z: number, h: number, leaf: string[], trunk = '#6b4a33', fruit?: string, seed = 1) {
  k.cyl(h * 0.09, h * 0.05, h * 0.55, x, y, z, trunk, { seg: 7 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + seed; k.cyl(h * 0.035, h * 0.02, h * 0.3, x + Math.cos(a) * h * 0.06, y + h * 0.35, z + Math.sin(a) * h * 0.06, trunk, { seg: 5, rz: Math.cos(a) * 0.8, rx: -Math.sin(a) * 0.8 }); }
  for (let i = 0; i < 6; i++) { const a = hash(seed + i) * 6.28, d = h * (0.12 + hash(seed + i * 3) * 0.16); k.ball(h * (0.18 + hash(seed + i * 5) * 0.08), x + Math.cos(a) * d, y + h * (0.62 + hash(seed + i * 7) * 0.22), z + Math.sin(a) * d, leaf[i % leaf.length], { seg: 9 }); }
  k.ball(h * 0.24, x, y + h * 0.82, z, leaf[0], { seg: 10 });
  if (fruit) for (let i = 0; i < 9; i++) { const a = hash(seed + i * 9) * 6.28, d = h * (0.2 + hash(seed + i * 4) * 0.12); k.ball(h * 0.035, x + Math.cos(a) * d, y + h * (0.58 + hash(seed + i * 6) * 0.3), z + Math.sin(a) * d, fruit, { glow: true, seg: 6 }); }
}
/** a big die (with its pips) */
function die(k: Kit, s: number, x: number, y: number, z: number, body = '#f5f2ea', pip = '#1b1838') {
  k.box(s, s, s, x, y, z, body);
  const p = s * 0.09, o = s * 0.27;
  const face = (n: number, put: (u: number, w: number) => void) => {
    const spots: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    for (const [u, w] of spots[n]) put(u * o, w * o);
  };
  face(1, (u, w) => k.ball(p, x + u, y + s / 2 + w, z + s / 2, pip, { seg: 6, sz: 0.4 }));
  face(6, (u, w) => k.ball(p, x + u, y + s / 2 + w, z - s / 2, pip, { seg: 6, sz: 0.4 }));
  face(3, (u, w) => k.ball(p, x + s / 2, y + s / 2 + w, z + u, pip, { seg: 6, sx: 0.4 }));
  face(4, (u, w) => k.ball(p, x - s / 2, y + s / 2 + w, z + u, pip, { seg: 6, sx: 0.4 }));
  face(5, (u, w) => k.ball(p, x + u, y + s, z + w, pip, { seg: 6, sy: 0.4 }));
}
/** a flame: tongues of glowing cones, the hottest inside */
function flame(k: Kit, r: number, h: number, x: number, y: number, z: number, cols = ['#ff5a1f', '#ff9f1c', '#ffe14d']) {
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, d = r * 0.45; k.cone(r * 0.5, h * (0.55 + hash(i + x) * 0.3), x + Math.cos(a) * d, y, z + Math.sin(a) * d, cols[0], { glow: true, seg: 6, rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25 }); }
  k.cone(r * 0.75, h, x, y, z, cols[1], { glow: true, seg: 7 }).cone(r * 0.4, h * 0.7, x, y, z, cols[2], { glow: true, seg: 6 });
}

/**
 * The monument of an ultra (or fusion, or Primordial) plot, in the plot's own frame (its middle at 0, its ground at
 * y0), about `R` metres in radius. `s.kind` is the rarity; `s.color` its colour; `glow` its light.
 */
export function buildMonument(s: BuildSite, k: Kit, part: PartFn, glowC: string, primordial: boolean) {
  const R = Math.min(s.w, s.d) * (primordial ? 0.44 : 0.38), A = s.color, G = glowC || '#ffffff';
  const y0 = 0.3, seed = s.gx * 0.37 + s.gy * 1.13;
  const up = (y: number) => y0 + y;
  switch (s.kind) {
    case 'solar': {
      const t = plinth(k, R * 0.7, y0, '#f4e3b0', '#d9c38a');
      k.cyl(0.12, 0.12, R * 1.4, 0, t, 0, GOLD2, { seg: 6 });
      part(v(0, t + R * 2, 0), 'spin', 0.5, (w) => {
        w.ball(R * 0.42, 0, 0, 0, '#ffd34d', { glow: true, seg: 14 });
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; w.cone(R * 0.12, R * (i % 2 ? 0.45 : 0.7), Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48, 0, i % 2 ? '#ffb31f' : '#ffe14d', { glow: true, seg: 4, rz: a - Math.PI / 2 }); }
      }, Z());
      motes(part, R, t + R * 2, 10, ['#ffe14d', '#fff2b0'], seed);
      break;
    }
    case 'lunar': {
      const t = plinth(k, R * 0.7, y0, '#c9d3e8', '#8e9bb8');
      part(v(0, t + R * 1.7, 0), 'spin', 0.25, (w) => { arc(w, R * 0.75, R * 0.24, Math.PI * 1.15, 0, 0, 0, '#e8eeff', { glow: true, rz: Math.PI * 0.43 }); }, Y());
      motes(part, R * 1.2, t + R * 1.8, 14, ['#ffffff', '#c9d3ff'], seed);
      break;
    }
    case 'comet': {
      const t = plinth(k, R * 0.6, y0, '#3a3f5c', '#262a3d');
      part(v(0, t + R * 1.6, 0), 'bob', 0.8, (w) => {
        w.ball(R * 0.32, 0, 0, 0, '#dff6ff', { glow: true, seg: 12 });
        for (let i = 0; i < 6; i++) w.cone(R * (0.3 - i * 0.04), R * (1.4 - i * 0.12), -R * 0.1 - i * 0.05, 0, 0, i % 2 ? '#7dd3fc' : '#b3e5ff', { glow: true, seg: 7, rz: Math.PI / 2 + 0.15 + i * 0.03 });
      });
      for (let i = 0; i < 5; i++) k.rock(R * 0.12, Math.cos(i * 1.3) * R * 0.9, up(0.15), Math.sin(i * 1.3) * R * 0.9, '#6a645c', seed + i);
      break;
    }
    case 'ancient': {
      // a ruined temple: columns, some broken, a fallen lintel, rubble and creepers
      k.box(R * 2, 0.4, R * 1.5, 0, y0, 0, STONE2).box(R * 1.8, 0.3, R * 1.3, 0, y0 + 0.4, 0, STONE);
      const tops: number[] = [];
      for (let i = 0; i < 6; i++) {
        const x = (i % 3 - 1) * R * 0.7, z = (i < 3 ? -1 : 1) * R * 0.5, h = R * (i === 4 ? 0.8 : i === 1 ? 1.4 : 2.2);
        k.cyl(R * 0.13, R * 0.12, h, x, y0 + 0.7, z, '#e6dccb', { seg: 10 }).box(R * 0.34, 0.2, R * 0.34, x, y0 + 0.7 + h, z, STONE);
        tops.push(h);
      }
      k.box(R * 1.8, R * 0.22, R * 0.3, -R * 0.05, y0 + 0.7 + R * 2.2 + 0.2, R * 0.5, '#ddd2c0').box(R * 1.2, R * 0.2, R * 0.28, R * 0.4, y0 + 0.8, -R * 0.95, '#d4c8b4', { ry: 0.3 });
      for (let i = 0; i < 8; i++) k.rock(R * (0.08 + hash(seed + i) * 0.08), (hash(seed + i * 2) - 0.5) * R * 2.2, up(0.5), (hash(seed + i * 3) - 0.5) * R * 1.8, STONE2, seed + i);
      for (let i = 0; i < 10; i++) k.ball(R * 0.08, (hash(seed + i * 5) - 0.5) * R * 1.6, y0 + 0.8 + hash(seed + i * 7) * R * 1.8, (i % 2 ? 1 : -1) * R * 0.5, '#4f8f2f', { seg: 6 });
      break;
    }
    case 'prismatic': case 'kaleidoscope': {
      const t = plinth(k, R * 0.65, y0, '#e8ecff', '#b8c2e0');
      part(v(0, t + R * 1.3, 0), 'spin', 0.35, (w) => { w.cone(R * 0.5, R * 1.1, 0, -R * 0.55, 0, '#e6f6ff', { glow: true, seg: 3 }).cone(R * 0.5, R * 0.5, 0, -R * 0.55, 0, '#c8e4ff', { glow: true, seg: 3, rx: Math.PI }); }, Y());
      // the spectrum it throws
      for (let i = 0; i < 7; i++) k.box(R * 1.6, 0.08, R * 0.12, R * 0.9, t + R * (1.0 - i * 0.07), (i - 3) * R * 0.11, RAINBOW[i], { glow: true, rz: -0.35 - i * 0.03 });
      if (s.kind === 'kaleidoscope') part(v(-R * 0.9, t + R * 1.3, 0), 'spin', 1.1, (w) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; w.cone(R * 0.16, R * 0.6, Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15, 0, RAINBOW[i % 7], { glow: true, seg: 3, rz: a - Math.PI / 2 }); } }, X());
      break;
    }
    case 'genesis': case 'genesis_well': {
      if (s.kind === 'genesis_well') {
        k.cyl(R * 0.8, R * 0.85, R * 0.6, 0, y0, 0, STONE, { seg: 14, open: true }).ring(R * 0.82, 0.18, 0, up(R * 0.6), 0, STONE2, { rx: Math.PI / 2, seg: 20 });
        part(v(0, up(R * 0.45), 0), 'spin', 1.6, (w) => { for (let i = 0; i < 3; i++) w.cone(R * (0.75 - i * 0.2), R * 0.3, 0, -i * R * 0.12, 0, ['#10b981', '#5eead4', '#fef08a'][i], { glow: true, seg: 9, rx: Math.PI }); }, Y());
        for (const sx of [-1, 1]) k.box(0.16, R * 1.4, 0.16, sx * R * 0.8, y0, 0, '#6b4a33');
        k.roof(R * 2, R * 0.9, R * 0.5, 0, y0 + R * 1.4, 0, '#8a5a2e');
      } else {
        const t = plinth(k, R * 0.6, y0, '#3b2a6b', '#251a45');
        part(v(0, t + R * 1.7, 0), 'spin', 0.6, (w) => { w.ring(R * 0.9, 0.08, 0, 0, 0, '#c4b5ff', { glow: true, rx: 1.2, seg: 40 }).ring(R * 0.7, 0.07, 0, 0, 0, '#22e3ff', { glow: true, rx: 0.4, rz: 0.8, seg: 36 }); }, Y());
        part(v(0, t + R * 1.7, 0), 'spin', -0.9, (w) => { w.ring(R * 1.1, 0.06, 0, 0, 0, '#ff9be0', { glow: true, rx: -0.9, rz: 0.3, seg: 44 }); }, Y());
        k.ball(R * 0.3, 0, t + R * 1.7, 0, '#fff7d6', { glow: true, seg: 12 });
      }
      motes(part, R * 1.1, up(R * 1.6), 16, ['#ffffff', '#c4b5ff', '#5eead4'], seed);
      break;
    }
    case 'chaos': case 'doubling_cube': {
      const t = plinth(k, R * 0.7, y0, '#2a2f42', '#1b1e2c');
      if (s.kind === 'chaos') { die(k, R * 0.7, -R * 0.35, t, R * 0.1, '#ffffff', '#e11d48'); die(k, R * 0.55, R * 0.4, t, -R * 0.2, '#ffe14d'); }
      part(v(0, t + R * (s.kind === 'chaos' ? 1.9 : 1.4), 0), 'spin', 0.9, (w) => die(w, R * (s.kind === 'chaos' ? 0.6 : 1.0), 0, -R * (s.kind === 'chaos' ? 0.3 : 0.5), 0, s.kind === 'chaos' ? '#a45cff' : '#0f172a', s.kind === 'chaos' ? '#ffffff' : '#fde047'), v(1, 1, 0.4).normalize());
      break;
    }
    case 'phoenix': case 'eternal_flame': {
      if (s.kind === 'eternal_flame') {
        k.cyl(R * 0.3, R * 0.5, R * 0.9, 0, y0, 0, STONE2, { seg: 10 }).cyl(R * 0.7, R * 0.45, R * 0.35, 0, up(R * 0.9), 0, '#5a4a3e', { seg: 12 });
        part(v(0, up(R * 1.25), 0), 'bob', 2.2, (w) => flame(w, R * 0.6, R * 1.8, 0, 0, 0));
        break;
      }
      k.cyl(R * 0.6, R * 0.75, 0.4, 0, y0, 0, '#3a2f2a', { seg: 10 });
      flame(k, R * 0.45, R * 0.8, 0, up(0.4), 0);
      part(v(0, up(R * 1.9), 0), 'bob', 0.9, (w) => {
        w.ball(R * 0.28, 0, 0, 0, '#ff6a1f', { glow: true, seg: 10, sy: 1.2 }).ball(R * 0.16, 0, R * 0.38, R * 0.1, '#ff9f1c', { glow: true, seg: 8 }).cone(R * 0.06, R * 0.2, 0, R * 0.38, R * 0.28, '#ffe14d', { glow: true, seg: 5, rx: Math.PI / 2 });
        for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) w.cone(R * 0.2, R * (1.1 - i * 0.15), sx * R * 0.2, R * 0.1 + i * R * 0.05, -i * R * 0.12, ['#ff3d1f', '#ff6a1f', '#ff9f1c', '#ffe14d'][i], { glow: true, seg: 4, rz: -sx * (1.2 - i * 0.12), sz: 0.35 });
        for (let i = 0; i < 4; i++) w.cone(R * 0.12, R * 0.9, (i - 1.5) * R * 0.08, -R * 0.15, -R * 0.2, ['#ff9f1c', '#ff5a1f'][i % 2], { glow: true, seg: 4, rx: -2.2 + i * 0.12 });
      });
      break;
    }
    case 'crown': case 'crown_state': case 'crown_country': {
      const big = s.kind === 'crown' ? 1 : s.kind === 'crown_state' ? 1.25 : 1.5, r = R * 0.62 * big;
      const t = plinth(k, R * 0.85, y0, '#efe7d6', '#c9bda4');
      k.box(r * 2.1, r * 0.35, r * 2.1, 0, t, 0, '#9b1c31').ball(r * 0.18, r, t + r * 0.35, r, GOLD, { seg: 6 }).ball(r * 0.18, -r, t + r * 0.35, -r, GOLD, { seg: 6 });
      part(v(0, t + r * 0.4, 0), 'spin', 0.3, (w) => {
        w.cyl(r, r, r * 0.55, 0, 0, 0, GOLD, { open: true, seg: 24 }).cyl(r * 0.98, r * 0.98, r * 0.55, 0, 0, 0, GOLD2, { open: true, seg: 24 });
        const n = s.kind === 'crown' ? 5 : s.kind === 'crown_state' ? 7 : 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          w.cone(r * 0.2, r * 0.7, Math.cos(a) * r, r * 0.55, Math.sin(a) * r, GOLD, { seg: 4 }).ball(r * 0.1, Math.cos(a) * r, r * 1.3, Math.sin(a) * r, RAINBOW[i % 7], { glow: true, seg: 6 });
          w.ball(r * 0.09, Math.cos(a + Math.PI / n) * r * 1.02, r * 0.28, Math.sin(a + Math.PI / n) * r * 1.02, i % 2 ? '#e11d48' : '#2fb8ff', { glow: true, seg: 6 });
        }
        if (s.kind !== 'crown') w.ball(r * 0.25, 0, r * 1.2, 0, GOLD, { seg: 10 }).box(r * 0.08, r * 0.5, r * 0.08, 0, r * 1.35, 0, GOLD).box(r * 0.3, r * 0.08, r * 0.08, 0, r * 1.62, 0, GOLD);
      }, Y());
      break;
    }
    case 'kraken': case 'krakatoa': {
      k.cyl(R * 1.05, R * 1.05, 0.12, 0, y0, 0, '#0f3d4a', { seg: 24 }).ring(R * 1.05, 0.08, 0, up(0.12), 0, '#5eead4', { glow: true, rx: Math.PI / 2, seg: 32 });
      if (s.kind === 'krakatoa') {
        k.cone(R * 0.75, R * 1.3, 0, y0, 0, '#4a3a33', { seg: 10 }).cone(R * 0.25, R * 0.35, 0, up(R * 1.05), 0, '#ff5a1f', { glow: true, seg: 8, rx: Math.PI });
        for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.4; k.box(0.12, R * 1.0, 0.12, Math.cos(a) * R * 0.35, up(R * 0.2), Math.sin(a) * R * 0.35, '#ff7a2a', { glow: true, rz: Math.cos(a) * 0.55, rx: -Math.sin(a) * 0.55 }); }
        part(v(0, up(R * 1.8), 0), 'bob', 0.5, (w) => { for (let i = 0; i < 5; i++) w.ball(R * (0.25 + i * 0.05), (hash(i) - 0.5) * R * 0.4, i * R * 0.25, (hash(i + 3) - 0.5) * R * 0.4, '#9aa0a6', { seg: 7 }); });
      }
      const n = s.kind === 'kraken' ? 6 : 3;
      for (let t2 = 0; t2 < n; t2++) {
        const a0 = (t2 / n) * Math.PI * 2 + 0.3, d0 = R * (s.kind === 'kraken' ? 0.55 : 0.9);
        part(v(Math.cos(a0) * d0, y0, Math.sin(a0) * d0), 'spin', 0.35 + t2 * 0.07, (w) => {
          for (let i = 0; i < 12; i++) {
            const f = i / 11, sw = Math.sin(f * 3.2 + t2) * R * 0.35 * f;
            w.ball(R * (0.2 - f * 0.15), Math.cos(a0) * sw, f * R * 2.2, Math.sin(a0) * sw, i % 3 ? '#b02a6b' : '#d9468a', { seg: 7 });
            if (i % 2) w.ball(R * 0.035, Math.cos(a0) * sw + Math.cos(a0 + 1.6) * R * (0.18 - f * 0.13), f * R * 2.2, Math.sin(a0) * sw + Math.sin(a0 + 1.6) * R * (0.18 - f * 0.13), '#ffd6e8', { seg: 5 });
          }
        }, Y());
      }
      break;
    }
    case 'gemini': case 'constellation': case 'doppelganger': {
      const t = plinth(k, R * 0.75, y0, '#f9e0ef', '#e0b8cf');
      if (s.kind === 'doppelganger') {
        for (const sx of [-1, 1]) {
          part(v(sx * R * 0.35, t, 0), 'spin', sx * 0.4, (w) => { w.cyl(R * 0.22, R * 0.28, R * 1.2, 0, 0, 0, '#94a3b8', { seg: 10 }).ball(R * 0.22, 0, R * 1.42, 0, '#cbd5e1', { seg: 10 }).ball(R * 0.04, R * 0.1, R * 1.48, R * 0.18, '#0f172a', { seg: 5 }).ball(R * 0.04, -R * 0.1, R * 1.48, R * 0.18, '#0f172a', { seg: 5 }); }, Y());
        }
        break;
      }
      for (const sx of [-1, 1]) k.cyl(R * 0.12, R * 0.15, R * 1.8, sx * R * 0.5, t, 0, '#e8ecff', { seg: 8 }).ball(R * 0.18, sx * R * 0.5, t + R * 1.9, 0, A, { glow: true, seg: 8 });
      part(v(0, t + R * 2.3, 0), 'spin', 1.1, (w) => { w.ball(R * 0.22, R * 0.45, 0, 0, '#fbcfe8', { glow: true, seg: 10 }).ball(R * 0.22, -R * 0.45, 0, 0, '#a5f3fc', { glow: true, seg: 10 }).ring(R * 0.45, 0.04, 0, 0, 0, '#ffffff', { glow: true, rx: Math.PI / 2, seg: 32 }); }, Y());
      if (s.kind === 'constellation') {
        part(v(0, t + R * 2.3, 0), 'spin', 0.2, (w) => {
          const pts = Array.from({ length: 7 }, (_, i) => v(Math.cos(i * 0.9) * R * (0.6 + hash(i) * 0.5), (hash(i * 3) - 0.5) * R * 1.2, Math.sin(i * 0.9) * R * (0.6 + hash(i) * 0.5)));
          pts.forEach((p, i) => { w.ball(R * 0.08, p.x, p.y, p.z, '#ffffff', { glow: true, seg: 6 }); if (i) { const q = pts[i - 1], m = p.clone().add(q).multiplyScalar(0.5), d = p.distanceTo(q); const g = new THREE.CylinderGeometry(0.025, 0.025, d, 4).rotateX(Math.PI / 2); g.lookAt(p.clone().sub(q)); w.add(g, '#f9a8d4', m.x, m.y, m.z, { glow: true }); } });
        }, Y());
      }
      break;
    }
    case 'mirror': {
      const t = plinth(k, R * 0.6, y0);
      for (const sx of [-1, 1]) k.box(0.18, R * 2.2, 0.18, sx * R * 0.65, t, 0, GOLD2);
      part(v(0, t + R * 1.15, 0), 'spin', 0.3, (w) => {
        w.box(R * 1.1, R * 1.9, 0.08, 0, -R * 0.95, 0, '#bfe9ff', { glow: true }).box(R * 1.22, 0.1, 0.12, 0, R * 0.95, 0, GOLD).box(R * 1.22, 0.1, 0.12, 0, -R * 0.95, 0, GOLD);
        w.box(R * 0.2, R * 1.6, 0.1, -R * 0.25, -R * 0.8, 0.03, '#ffffff', { glow: true, rz: 0.4 });
      }, Y());
      break;
    }
    case 'singularity': case 'void_gate': case 'rift': {
      const t = plinth(k, R * 0.7, y0, '#2e2440', '#1a1426');
      const c = t + R * 1.6;
      if (s.kind === 'singularity') {
        k.ball(R * 0.42, 0, c, 0, '#050208', { seg: 16 });
        part(v(0, c, 0), 'spin', 1.4, (w) => { for (let i = 0; i < 4; i++) w.ring(R * (0.6 + i * 0.18), 0.06 + i * 0.02, 0, 0, 0, ['#fff2b0', '#ff9f1c', '#ff4fd8', '#5b6cff'][i], { glow: true, rx: Math.PI / 2 + 0.25, seg: 40 }); }, v(0, 1, 0.25).normalize());
        part(v(0, c, 0), 'spin', -0.6, (w) => w.ring(R * 0.5, 0.04, 0, 0, 0, '#ffffff', { glow: true, seg: 32 }), Y());
      } else if (s.kind === 'void_gate') {
        k.ring(R * 1.1, R * 0.16, 0, c, 0, '#4c1d95', { seg: 36 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.box(R * 0.14, R * 0.3, R * 0.36, Math.cos(a) * R * 1.12, c + Math.sin(a) * R * 1.12, 0, '#2e1065', { rz: a }); }
        part(v(0, c, 0), 'spin', 1.2, (w) => { for (let i = 0; i < 6; i++) w.cone(R * (1.0 - i * 0.14), 0.05, 0, 0, i * 0.02, ['#2e1065', '#5b21b6', '#7c3aed', '#a78bfa', '#c4b5fd', '#ede9fe'][i], { glow: true, seg: 7 + i, rx: Math.PI / 2 }); }, Z());
      } else {
        for (let i = 0; i < 6; i++) arc(k, R * 1.0, R * 0.12, Math.PI * 0.22, 0, c, 0, '#6366f1', { rz: i * 1.07 + hash(seed + i) * 0.3 });
        part(v(0, c, 0), 'spin', 0.8, (w) => { for (let i = 0; i < 9; i++) w.cone(R * 0.08, R * (0.5 + hash(i) * 0.6), (hash(i * 2) - 0.5) * R * 0.5, (hash(i * 3) - 0.5) * R * 1.2, 0, i % 2 ? '#e0e7ff' : '#a5b4fc', { glow: true, seg: 3, rz: hash(i * 5) * 6 }); }, Z());
      }
      motes(part, R, c, 12, ['#c4b5fd', '#ffffff'], seed);
      break;
    }
    case 'volcano': {
      k.cone(R * 1.05, R * 1.5, 0, y0, 0, '#4a3a33', { seg: 11 }).cone(R * 0.38, R * 0.4, 0, up(R * 1.18), 0, '#ff5a1f', { glow: true, seg: 9, rx: Math.PI });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + 0.4; k.box(0.14, R * 1.2, 0.14, Math.cos(a) * R * 0.42, up(R * 0.25), Math.sin(a) * R * 0.42, i % 2 ? '#ff7a2a' : '#ffb347', { glow: true, rz: Math.cos(a) * 0.62, rx: -Math.sin(a) * 0.62 }); }
      for (let i = 0; i < 6; i++) k.rock(R * 0.14, Math.cos(i * 1.1) * R * 1.0, up(0.1), Math.sin(i * 1.1) * R * 1.0, '#1f1a18', seed + i);
      part(v(0, up(R * 1.9), 0), 'bob', 0.45, (w) => { for (let i = 0; i < 6; i++) w.ball(R * (0.22 + i * 0.07), (hash(i) - 0.5) * R * 0.5, i * R * 0.3, (hash(i + 5) - 0.5) * R * 0.5, i < 2 ? '#5a5f66' : '#9aa0a6', { seg: 7 }); });
      part(v(0, up(R * 1.3), 0), 'spin', 2.5, (w) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; w.ball(R * 0.06, Math.cos(a) * R * 0.25, R * (0.2 + hash(i) * 0.5), Math.sin(a) * R * 0.25, '#ffd34d', { glow: true, seg: 5 }); } }, Y());
      break;
    }
    case 'world_tree': case 'elder_tree': {
      const elder = s.kind === 'elder_tree';
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + 0.3; k.cyl(R * 0.14, R * 0.05, R * 0.9, Math.cos(a) * R * 0.45, y0, Math.sin(a) * R * 0.45, '#5a3d2a', { seg: 6, rz: Math.cos(a) * 1.1, rx: -Math.sin(a) * 1.1 }); }
      tree(k, 0, y0, 0, R * (elder ? 3.4 : 3.0), elder ? ['#15803d', '#166534', '#1f7a3a'] : ['#3d8a4a', '#4fa356', '#2f7a43'], elder ? '#4a3424' : '#6b4a33', elder ? '#d9f99d' : '#fff2b0', seed);
      if (elder) for (let i = 0; i < 10; i++) { const a = hash(seed + i) * 6.28, d = R * (0.5 + hash(i) * 0.4); k.box(0.06, R * (0.5 + hash(i * 2) * 0.6), 0.06, Math.cos(a) * d, up(R * 1.6), Math.sin(a) * d, '#8aa36b'); }
      motes(part, R * 1.3, up(R * 2.3), 14, ['#c8ffd8', '#fff2b0'], seed);
      break;
    }
    case 'phantom': {
      k.cyl(R * 0.7, R * 0.7, 0.08, 0, y0, 0, '#c7d2fe', { glow: true, seg: 20 });
      part(v(0, up(R * 0.4), 0), 'bob', 0.7, (w) => {
        w.cone(R * 0.55, R * 1.6, 0, 0, 0, '#e0e7ff', { glow: true, seg: 12 }).ball(R * 0.42, 0, R * 1.5, 0, '#eef2ff', { glow: true, seg: 12 });
        w.ball(R * 0.08, -R * 0.15, R * 1.55, R * 0.36, '#1b1838', { seg: 6, sy: 1.4 }).ball(R * 0.08, R * 0.15, R * 1.55, R * 0.36, '#1b1838', { seg: 6, sy: 1.4 }).ball(R * 0.07, 0, R * 1.36, R * 0.38, '#1b1838', { seg: 6 });
        for (const sx of [-1, 1]) w.cone(R * 0.13, R * 0.6, sx * R * 0.48, R * 0.9, 0, '#e0e7ff', { glow: true, seg: 6, rz: sx * 1.9 });
      });
      break;
    }
    case 'wanderer': case 'shooting_star': {
      const t = y0;
      for (let i = 0; i < 7; i++) arc(k, R * (1.15 - i * 0.08), R * 0.045, Math.PI, 0, t, -R * 0.3, RAINBOW[i], { glow: true });
      if (s.kind === 'wanderer') {
        part(v(0, t + R * 1.2, R * 0.2), 'spin', 0.6, (w) => { for (let i = 0; i < 5; i++) w.cyl(R * (0.18 - i * 0.03), R * (0.15 - i * 0.03), R * 0.22, 0, i * R * 0.2, 0, i % 2 ? '#f0abfc' : '#fae8ff', { glow: true, seg: 8 }); w.cone(R * 0.05, R * 0.3, 0, R, 0, '#ffffff', { glow: true, seg: 6 }); }, Y());
      } else {
        part(v(0, t + R * 1.5, R * 0.2), 'bob', 1.0, (w) => {
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; w.cone(R * 0.16, R * 0.5, Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15, 0, '#fde047', { glow: true, seg: 4, rz: a - Math.PI / 2 }); }
          w.ball(R * 0.2, 0, 0, 0, '#fff7cc', { glow: true, seg: 10 });
          for (let i = 0; i < 5; i++) w.cone(R * (0.14 - i * 0.02), R * 1.2, R * 0.2 + i * R * 0.05, -R * 0.1 - i * 0.08, 0, i % 2 ? '#c084fc' : '#e0f2fe', { glow: true, seg: 6, rz: Math.PI / 2 + 0.5 });
        });
      }
      break;
    }
    case 'lodestone': case 'compass_rose': case 'leyline': {
      if (s.kind === 'compass_rose') {
        k.cyl(R * 1.0, R * 1.0, 0.18, 0, y0, 0, '#f5efe0', { seg: 32 }).ring(R * 1.0, 0.07, 0, up(0.18), 0, GOLD2, { rx: Math.PI / 2, seg: 40 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.cone(R * (i % 2 ? 0.1 : 0.16), R * (i % 2 ? 0.6 : 0.95), 0, up(0.2), 0, i === 0 ? '#e11d48' : i % 2 ? '#bae6fd' : '#1e3a5f', { seg: 4, rx: Math.PI / 2, ry: -a, sy: 0.25 }); }
        part(v(0, up(R * 0.9), 0), 'spin', 0.5, (w) => { w.cone(R * 0.1, R * 0.8, 0, 0, 0, '#e11d48', { glow: true, seg: 4, rz: -Math.PI / 2 }).cone(R * 0.1, R * 0.8, 0, 0, 0, '#e8ecff', { seg: 4, rz: Math.PI / 2 }).ball(R * 0.08, 0, 0, 0, GOLD, { seg: 8 }); }, Y());
        k.cyl(0.06, 0.06, R * 0.9, 0, y0, 0, GOLD2, { seg: 6 });
        break;
      }
      if (s.kind === 'leyline') {
        const t = plinth(k, R * 0.6, y0, '#1e3a5f', '#132840', 4);
        k.cyl(R * 0.32, R * 0.18, R * 2.6, 0, t, 0, '#0b2540', { seg: 4 }).cone(R * 0.18, R * 0.4, 0, t + R * 2.6, 0, '#38bdf8', { glow: true, seg: 4 });
        for (let i = 0; i < 6; i++) k.box(R * 0.2, 0.08, 0.04, 0, t + R * (0.4 + i * 0.35), R * (0.29 - i * 0.02), '#7dd3fc', { glow: true });
        k.cyl(0.12, 0.12, R * 14, 0, t + R * 3, 0, '#bfefff', { glow: true, seg: 6 });
        motes(part, R * 0.8, t + R * 1.5, 12, ['#38bdf8', '#e0f2fe'], seed);
        break;
      }
      const t = plinth(k, R * 0.6, y0, '#3a3f4a', '#262a33');
      arc(k, R * 0.7, R * 0.24, Math.PI, 0, t + R * 1.0, 0, '#ef4444', { rz: Math.PI });
      for (const sx of [-1, 1]) k.box(R * 0.5, R * 0.6, R * 0.5, sx * R * 0.7, t + R * 0.1, 0, '#d8dee8');
      part(v(0, t + R * 0.9, 0), 'spin', 0.9, (w) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; w.box(R * 0.12, R * 0.05, R * 0.05, Math.cos(a) * R * 1.3, (hash(i) - 0.5) * R * 0.6, Math.sin(a) * R * 1.3, '#9aa0a8', { ry: a }); } }, Y());
      break;
    }
    case 'glacier': {
      k.dome(R * 0.95, 0, y0, 0, '#f0f9ff');
      for (let i = 0; i < 9; i++) { const a = hash(seed + i) * 6.28, d = R * hash(seed + i * 2) * 0.6; crystal(k, R * (0.18 + hash(i) * 0.12), R * (1.2 + hash(i * 3) * 1.4), Math.cos(a) * d, y0 + R * 0.2, Math.sin(a) * d, i % 3 ? '#a5f3fc' : '#e0f7ff', true, (hash(i * 7) - 0.5) * 0.7); }
      motes(part, R, up(R * 1.6), 14, ['#ffffff', '#cffafe'], seed);
      break;
    }
    case 'mycelium': {
      k.cyl(R, R, 0.1, 0, y0, 0, '#3f2d22', { seg: 20 });
      const shroom = (w: Kit, x: number, z: number, h: number, c: string) => { w.cyl(h * 0.12, h * 0.15, h, x, y0, z, '#f5efe0', { seg: 8 }).dome(h * 0.5, x, y0 + h, z, c); for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; w.ball(h * 0.07, x + Math.cos(a) * h * 0.3, y0 + h + h * 0.28, z + Math.sin(a) * h * 0.3, '#ffffff', { seg: 5 }); } };
      shroom(k, 0, 0, R * 1.8, '#a3e635'); shroom(k, R * 0.6, R * 0.3, R * 1.1, '#84cc16'); shroom(k, -R * 0.55, -R * 0.35, R * 0.8, '#bef264');
      for (let i = 0; i < 12; i++) { const a = hash(seed + i) * 6.28, d = R * (0.4 + hash(i) * 0.5); k.cyl(0.03, 0.04, 0.3, Math.cos(a) * d, y0, Math.sin(a) * d, '#ecfccb', { seg: 4 }).dome(0.12, Math.cos(a) * d, y0 + 0.3, Math.sin(a) * d, '#d9f99d', { glow: true }); }
      motes(part, R, up(R * 1.2), 12, ['#ecfccb', '#bef264'], seed);
      break;
    }
    case 'hive': {
      const t = plinth(k, R * 0.6, y0, '#8a5a2e', '#6b4a33');
      for (let i = 0; i < 4; i++) k.cyl(R * (0.6 - i * 0.08), R * (0.6 - i * 0.08), R * 0.42, 0, t + i * R * 0.42, 0, i % 2 ? '#facc15' : '#eab308', { seg: 6 });
      k.cone(R * 0.36, R * 0.4, 0, t + R * 1.68, 0, '#facc15', { seg: 6 }).box(R * 0.18, R * 0.16, 0.1, 0, t + R * 0.1, R * 0.55, '#3a2a10');
      for (let o = 0; o < 2; o++) part(v(0, t + R * (0.9 + o * 0.5), 0), 'spin', o ? -1.3 : 1.7, (w) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28, d = R * (0.95 + o * 0.25); w.ball(R * 0.07, Math.cos(a) * d, (hash(i + o) - 0.5) * R * 0.4, Math.sin(a) * d, '#1b1b1b', { seg: 5, sx: 1.4 }).ball(R * 0.05, Math.cos(a) * d + 0.05, (hash(i + o) - 0.5) * R * 0.4 + 0.04, Math.sin(a) * d, '#facc15', { seg: 5 }); } }, Y());
      break;
    }
    case 'eclipse': {
      const t = plinth(k, R * 0.6, y0, '#2a2140', '#1b1530');
      k.cyl(0.12, 0.12, R * 1.2, 0, t, 0, '#3a3f5c', { seg: 6 });
      part(v(0, t + R * 1.9, 0), 'spin', 0.3, (w) => {
        w.ring(R * 0.62, R * 0.12, 0, 0, -0.1, '#fde68a', { glow: true, seg: 32 });
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; w.cone(R * 0.06, R * (0.25 + (i % 2) * 0.2), Math.cos(a) * R * 0.74, Math.sin(a) * R * 0.74, -0.1, '#fff2b0', { glow: true, seg: 4, rz: a - Math.PI / 2 }); }
        w.cyl(R * 0.6, R * 0.6, 0.12, 0, 0, 0.05, '#0b0816', { seg: 28, rx: Math.PI / 2 });
      }, Y());
      break;
    }
    case 'heart_world': {
      const t = plinth(k, R * 0.75, y0, '#efe7d6', '#c9bda4');
      k.cyl(R * 0.1, R * 0.16, R * 0.7, 0, t, 0, GOLD2, { seg: 8 });
      part(v(0, t + R * 1.4, 0), 'spin', 0.3, (w) => {
        w.ball(R * 0.7, 0, 0, 0, '#2563eb', { seg: 18 });
        for (let i = 0; i < 9; i++) { const a = hash(seed + i) * 6.28, b = (hash(seed + i * 3) - 0.5) * 2.2; w.ball(R * (0.16 + hash(i) * 0.14), Math.cos(a) * Math.cos(b) * R * 0.62, Math.sin(b) * R * 0.62, Math.sin(a) * Math.cos(b) * R * 0.62, '#22c55e', { seg: 7, sy: 0.6 }); }
        w.ring(R * 0.85, 0.05, 0, 0, 0, GOLD, { rx: Math.PI / 2 + 0.4, seg: 36 });
      }, v(0.2, 1, 0).normalize());
      part(v(0, t + R * 2.6, 0), 'bob', 2.4, (w) => { w.ball(R * 0.26, -R * 0.17, 0, 0, '#e11d48', { glow: true, seg: 10 }).ball(R * 0.26, R * 0.17, 0, 0, '#e11d48', { glow: true, seg: 10 }).cone(R * 0.36, R * 0.5, 0, -R * 0.08, 0, '#e11d48', { glow: true, seg: 10, rx: Math.PI }); });
      break;
    }
    case 'throne_ink': {
      const t = plinth(k, R * 0.9, y0, '#2e1a4f', '#1f1238');
      k.box(R * 1.2, R * 0.6, R * 1.0, 0, t, 0, '#5b21b6').box(R * 1.3, R * 0.12, R * 1.1, 0, t + R * 0.6, 0, GOLD);
      k.box(R * 1.2, R * 2.2, R * 0.2, 0, t + R * 0.6, -R * 0.45, '#4c1d95').box(R * 1.36, R * 0.14, R * 0.26, 0, t + R * 2.8, -R * 0.45, GOLD);
      for (let i = 0; i < 3; i++) k.cone(R * 0.12, R * 0.5, (i - 1) * R * 0.45, t + R * 2.94, -R * 0.45, GOLD, { seg: 4 });
      for (const sx of [-1, 1]) k.box(R * 0.16, R * 0.5, R * 1.0, sx * R * 0.62, t + R * 0.6, 0, '#4c1d95').ball(R * 0.12, sx * R * 0.62, t + R * 1.15, R * 0.45, GOLD, { seg: 8 });
      k.cyl(R * 0.9, R * 0.9, 0.05, 0, up(0.02), R * 1.0, '#1b0b33', { seg: 20 });
      part(v(0, t + R * 3.4, -R * 0.45), 'bob', 1.1, (w) => { w.cone(R * 0.12, R * 0.5, 0, 0, 0, '#a78bfa', { glow: true, seg: 6, rx: Math.PI }).ball(R * 0.12, 0, 0, 0, '#ede9fe', { glow: true, seg: 8 }); });
      break;
    }
    case 'serpent_egg': {
      k.ring(R * 0.85, R * 0.3, 0, up(R * 0.25), 0, '#7a5432', { rx: Math.PI / 2, seg: 24 });
      for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.28; k.box(R * 0.6, 0.08, 0.08, Math.cos(a) * R * 0.85, up(R * 0.35), Math.sin(a) * R * 0.85, '#5a3d2a', { ry: a + 0.8 }); }
      part(v(0, up(R * 1.25), 0), 'bob', 0.6, (w) => {
        w.ball(R * 0.75, 0, 0, 0, '#059669', { seg: 16, sy: 1.3 });
        for (let i = 0; i < 26; i++) { const a = hash(seed + i) * 6.28, b = (hash(seed + i * 2) - 0.5) * 2.4; w.ball(R * 0.12, Math.cos(a) * Math.cos(b) * R * 0.72, Math.sin(b) * R * 0.95, Math.sin(a) * Math.cos(b) * R * 0.72, i % 3 ? '#34d399' : '#a7f3d0', { seg: 5, sz: 0.5 }); }
        w.box(0.08, R * 0.8, 0.08, R * 0.3, -R * 0.1, R * 0.62, '#a7f3d0', { glow: true, rz: 0.5 });
      });
      break;
    }
    case 'world_eye': {
      const t = plinth(k, R * 0.7, y0, '#0c4a6e', '#082f49');
      part(v(0, t + R * 1.7, 0), 'spin', 0.35, (w) => {
        w.ball(R * 0.85, 0, 0, 0, '#f8fafc', { seg: 18 });
        w.cyl(R * 0.42, R * 0.42, 0.1, 0, 0, R * 0.8, '#0ea5e9', { seg: 24, rx: Math.PI / 2, glow: true }).cyl(R * 0.2, R * 0.2, 0.12, 0, 0, R * 0.84, '#020617', { seg: 18, rx: Math.PI / 2 }).ball(R * 0.06, R * 0.1, R * 0.1, R * 0.9, '#ffffff', { glow: true, seg: 6 });
        for (let i = 0; i < 6; i++) w.box(0.04, R * 0.3, 0.04, (i - 2.5) * R * 0.18, R * 0.9, R * 0.2, '#38bdf8', { rx: -0.3 });
      }, Y());
      k.ring(R * 1.15, 0.06, 0, t + R * 1.7, 0, '#e0f2fe', { glow: true, rx: Math.PI / 2, seg: 40 });
      break;
    }
    case 'first_light': case 'sunspot': {
      const t = y0;
      k.box(R * 2.2, 0.3, R * 0.8, 0, t, 0, '#3a2f2a');
      if (s.kind === 'first_light') {
        arc(k, R * 1.0, R * 0.12, Math.PI, 0, t + 0.3, 0, GOLD);
        k.dome(R * 0.65, 0, t + 0.3, 0, '#f59e0b', { sz: 0.3 });
        for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI; k.box(0.1, R * 1.2, 0.06, Math.cos(a) * R * 1.3, t + 0.3 + Math.sin(a) * R * 1.3, 0, '#fffbeb', { glow: true, rz: a - Math.PI / 2 }); }
      } else {
        part(v(0, t + R * 1.8, 0), 'spin', 0.5, (w) => {
          w.ball(R * 0.75, 0, 0, 0, '#fb923c', { glow: true, seg: 16 });
          for (let i = 0; i < 7; i++) { const a = hash(seed + i) * 6.28, b = (hash(i * 2) - 0.5) * 2; w.ball(R * 0.14, Math.cos(a) * Math.cos(b) * R * 0.72, Math.sin(b) * R * 0.72, Math.sin(a) * Math.cos(b) * R * 0.72, '#7c2d12', { seg: 6, sy: 0.5 }); }
          for (let i = 0; i < 4; i++) arc(w, R * 0.3, 0.06, Math.PI, Math.cos(i * 1.6) * R * 0.7, Math.sin(i * 1.6) * R * 0.7, 0, '#ffedd5', { glow: true, rz: i * 1.6 });
        }, Y());
      }
      break;
    }
    case 'fallen_star': case 'eleven': {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; k.rock(R * 0.2, Math.cos(a) * R * 0.95, up(0.1), Math.sin(a) * R * 0.95, '#57534e', seed + i); }
      k.cyl(R * 0.85, R * 0.6, 0.15, 0, y0, 0, '#1c1917', { seg: 16 });
      part(v(0, up(R * 1.0), 0), 'spin', 0.6, (w) => {
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; w.cone(R * 0.24, R * 0.8, Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2, 0, s.kind === 'eleven' ? '#f472b6' : '#fde047', { glow: true, seg: 4, rz: a - Math.PI / 2, sz: 0.5 }); }
        w.ball(R * 0.3, 0, 0, 0, '#ffffff', { glow: true, seg: 10 });
      }, Z());
      if (s.kind === 'eleven') for (const sx of [-1, 1]) k.box(R * 0.12, R * 1.6, R * 0.12, sx * R * 0.3 - R * 0.9, y0, R * 0.6, '#fdf2f8', { glow: true }).box(R * 0.12, R * 1.6, R * 0.12, sx * R * 0.3 + R * 0.9, y0, R * 0.6, '#fdf2f8', { glow: true });
      motes(part, R, up(R), 12, ['#ffffff', '#fde047'], seed);
      break;
    }
    case 'chrysalis': {
      for (const sx of [-1, 1]) k.cyl(R * 0.1, R * 0.08, R * 2.6, sx * R * 0.8, y0, 0, '#6b4a33', { seg: 6 });
      arc(k, R * 0.8, R * 0.08, Math.PI, 0, up(R * 2.6), 0, '#6b4a33');
      part(v(0, up(R * 2.9), 0), 'spin', 0.5, (w) => {
        w.box(0.04, R * 0.5, 0.04, 0, -R * 0.5, 0, '#a78bfa');
        w.ball(R * 0.36, 0, -R * 1.25, 0, '#c4b5fd', { glow: true, seg: 12, sy: 1.8 });
        for (let i = 0; i < 6; i++) w.ring(R * 0.33, 0.03, 0, -R * (0.85 + i * 0.13), 0, '#fce7f3', { rx: Math.PI / 2, seg: 18 });
      }, Y());
      part(v(R * 0.9, up(R * 1.2), R * 0.5), 'bob', 1.6, (w) => { for (const sx of [-1, 1]) w.ball(R * 0.2, sx * R * 0.18, 0, 0, sx > 0 ? '#f9a8d4' : '#a78bfa', { glow: true, seg: 8, sz: 0.15, sy: 1.3 }); });
      break;
    }
    case 'hourglass': {
      const t = plinth(k, R * 0.7, y0, '#78350f', '#451a03');
      for (const sy of [0, 1]) k.cyl(R * 0.8, R * 0.8, R * 0.18, 0, t + sy * R * 2.4, 0, '#92400e', { seg: 16 });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.28; k.cyl(R * 0.07, R * 0.07, R * 2.4, Math.cos(a) * R * 0.68, t, Math.sin(a) * R * 0.68, GOLD2, { seg: 6 }); }
      part(v(0, t + R * 1.29, 0), 'spin', 0.25, (w) => {
        w.cone(R * 0.55, R * 1.1, 0, 0, 0, '#fef3c7', { glow: true, seg: 14, rx: Math.PI }).cone(R * 0.55, R * 1.1, 0, 0, 0, '#fef3c7', { glow: true, seg: 14 });
        w.cone(R * 0.4, R * 0.5, 0, -R * 1.0, 0, '#d97706', { glow: true, seg: 12 }).cyl(0.04, 0.04, R * 0.9, 0, -R * 0.95, 0, '#fbbf24', { glow: true, seg: 4 });
      }, Y());
      break;
    }
    case 'loom': {
      for (const sx of [-1, 1]) k.box(R * 0.16, R * 2.4, R * 0.16, sx * R * 0.9, y0, 0, '#7a5432');
      k.box(R * 2, R * 0.16, R * 0.2, 0, up(R * 2.3), 0, '#7a5432').box(R * 2, R * 0.16, R * 0.2, 0, up(R * 0.3), 0, '#7a5432');
      for (let i = 0; i < 13; i++) k.box(0.03, R * 1.9, 0.03, -R * 0.8 + i * R * 0.133, up(R * 0.4), 0, ['#ec4899', '#f9a8d4', '#fce7f3', '#a78bfa'][i % 4], { glow: true });
      part(v(0, up(R * 1.3), 0.12), 'bob', 1.4, (w) => { w.box(R * 1.7, 0.1, 0.1, 0, 0, 0, '#5a3d2a').ball(R * 0.12, R * 0.9, 0, 0, '#ec4899', { seg: 8, sx: 2 }); });
      break;
    }
    case 'upside_down': {
      k.cyl(R * 0.9, R * 0.9, 0.12, 0, y0, 0, '#134e4a', { seg: 20 });
      part(v(0, up(R * 2.2), 0), 'spin', 0.35, (w) => { w.cone(R * 0.95, R * 1.9, 0, R * 0.2, 0, '#14b8a6', { seg: 4, rx: Math.PI }); w.cone(R * 0.4, R * 0.5, 0, R * 0.2, 0, '#ccfbf1', { glow: true, seg: 4 }); }, Y());
      part(v(0, up(R * 0.4), 0), 'bob', 2, (w) => w.ball(R * 0.12, 0, 0, 0, '#ccfbf1', { glow: true, seg: 8 }));
      break;
    }
    case 'midas': {
      const t = plinth(k, R * 0.8, y0, '#fef9c3', '#d6c98a');
      k.box(R * 1.0, R * 1.0, R * 0.45, 0, t, 0, GOLD).cyl(R * 0.3, R * 0.34, R * 0.7, 0, t - 0.2, 0, GOLD2, { seg: 10 });
      for (let i = 0; i < 4; i++) { const x = -R * 0.36 + i * R * 0.24; k.cyl(R * 0.1, R * 0.09, R * (0.8 + (i === 1 || i === 2 ? 0.2 : 0)), x, t + R * 1.0, 0, GOLD, { seg: 8 }).ball(R * 0.095, x, t + R * (1.8 + (i === 1 || i === 2 ? 0.2 : 0)), 0, GOLD, { seg: 8 }); }
      k.cyl(R * 0.11, R * 0.1, R * 0.6, R * 0.55, t + R * 0.4, 0, GOLD, { seg: 8, rz: -0.8 });
      motes(part, R, t + R * 1.4, 14, ['#fde047', '#fef9c3'], seed);
      break;
    }
    case 'chain': {
      for (const sx of [-1, 1]) k.box(R * 0.2, R * 2.6, R * 0.2, sx * R * 1.0, y0, 0, '#3a3f4a');
      for (let i = 0; i < 7; i++) { const f = i / 6, x = -R * 0.9 + f * R * 1.8, y = up(R * 2.3 - Math.sin(f * Math.PI) * R * 0.9); k.ring(R * 0.16, R * 0.05, x, y, 0, i % 2 ? '#f43f5e' : '#9aa0a8', { seg: 12, ry: i % 2 ? Math.PI / 2 : 0 }); }
      part(v(0, up(R * 0.9), 0), 'bob', 1.2, (w) => w.ring(R * 0.26, R * 0.07, 0, 0, 0, '#f43f5e', { glow: true, seg: 14 }));
      break;
    }
    case 'transmuter': {
      const t = plinth(k, R * 0.65, y0, '#2e1065', '#1e0b47');
      k.ball(R * 0.65, 0, t + R * 0.65, 0, '#ddd6fe', { glow: true, seg: 14 }).cyl(R * 0.18, R * 0.2, R * 0.9, 0, t + R * 1.2, 0, '#ede9fe', { seg: 10 }).cyl(R * 0.26, R * 0.26, R * 0.12, 0, t + R * 2.05, 0, '#8b5cf6', { seg: 10 });
      part(v(0, t + R * 2.2, 0), 'spin', 0.8, (w) => { for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; w.ball(R * (0.07 + hash(i) * 0.06), Math.cos(a) * R * 0.25, R * (0.2 + hash(i * 3) * 1.2), Math.sin(a) * R * 0.25, i % 2 ? '#a78bfa' : '#f0abfc', { glow: true, seg: 6 }); } }, Y());
      break;
    }
    case 'enchanted': {
      const t = plinth(k, R * 0.6, y0, '#3b2a6b', '#251a45');
      part(v(0, t + R * 1.4, 0), 'spin', 0.7, (w) => { w.ring(R * 0.7, 0.06, 0, 0, 0, '#c4b5ff', { glow: true, rx: Math.PI / 2, seg: 36 }); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; w.box(R * 0.14, R * 0.14, 0.03, Math.cos(a) * R * 0.7, 0.05, Math.sin(a) * R * 0.7, '#ffe14d', { glow: true, ry: a, rz: 0.78 }); } }, Y());
      crystal(k, R * 0.3, R * 1.2, 0, t + R * 0.8, 0, '#b46bff');
      motes(part, R, t + R * 1.4, 12, ['#ffe14d', '#c4b5ff'], seed);
      break;
    }
    default: {
      // any other ultra: a crystal of its colour floating over a plinth, rings turning round it
      const t = plinth(k, R * 0.65, y0);
      part(v(0, t + R * 1.5, 0), 'bob', 0.8, (w) => crystal(w, R * 0.32, R * 1.3, 0, -R * 0.65, 0, A));
      part(v(0, t + R * 1.5, 0), 'spin', 0.6, (w) => { w.ring(R * 0.75, 0.06, 0, 0, 0, G, { glow: true, rx: Math.PI / 2 + 0.3, seg: 36 }).ring(R * 0.95, 0.05, 0, 0, 0, A, { glow: true, rx: Math.PI / 2 - 0.4, seg: 40 }); }, Y());
      motes(part, R, t + R * 1.4, 10, [A, G], seed);
    }
  }
}
