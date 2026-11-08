// Every creature's own attack. Some walk up and hit (each with its own impact), others stay put and fire something
// across: the Jellyfright blows a stream of rainbow bubbles, the Snowpip throws a snowball, the Laser Lynx fires a beam…
import * as THREE from 'three';
import { sparks, stream, type FxCtx, type Move } from './core';

const FIRE = ['#FFF2A0', '#FFB020', '#FF6A10'], ICE = ['#FFFFFF', '#BFF4FF', '#6FD3FF'], SPORE = ['#C89BFF', '#9B6BFF', '#D8FF8A'];
const CANDY = ['#FF4FD8', '#FFE14D', '#5AE0FF', '#7BFF9A'], NEON = ['#22E3FF', '#FF4FD8', '#FFFFFF'];
const up = (p: THREE.Vector3, y: number) => p.clone().setY(p.y + y);
const from = (c: FxCtx, y = 0.6) => up(c.self, y).addScaledVector(c.fwd, 0.35);
const hitAt = (c: FxCtx) => c.target ?? up(c.self, 0.6).addScaledVector(c.fwd, 3);
/** a melee blow: the impact's burst (the lunge carries it there) */
const melee = (fx: (c: FxCtx, p: THREE.Vector3) => void, dur = 0.65, hit = 0.5): Move & { ranged?: false } => ({ dur, hit, fx: (c) => fx(c, hitAt(c)) });
/** a ranged attack: it stays in its lane and fires */
const ranged = (fx: (c: FxCtx) => Promise<void> | void, dur = 0.75, hit = 0.4): Move & { ranged: true } => ({ dur, hit, fx, ranged: true });
const water = (c: FxCtx, p: THREE.Vector3, cols: string[], n = 22) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.2; c.fx.soft({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 2, vz: Math.sin(a) * s, color: cols[i % cols.length], size: 0.12 + Math.random() * 0.1, gravity: 9, life: 0.8, alpha: 0.9 }); } };

export const ATTACKS: Record<string, Move & { ranged?: boolean }> = {
  // 🌿 Meadow
  sproutling: melee((c, p) => { sparks(c.fx, p, ['#7BFF9A', '#3DBF4A', '#D4FF7A'], 18, 2.4, { size: 0.12 }); c.fx.emoji(p, '🍃', 0.4); }),
  thornhare: ranged(async (c) => { await stream(c, from(c, 0.5), hitAt(c), 5, 70, { kind: 'leaf', color: '#4FAE3A', dur: 0.32, arc: 0.5, size: 0.2 }, 0.4); }),
  mossback: melee((c, p) => { c.fx.ring(p, '#7BC85A', 1.4); sparks(c.fx, p, ['#8A7A5A', '#5DA544'], 16, 2, {}, true); c.fx.shake(0.1); }, 0.8),
  blossomstag: melee((c, p) => { sparks(c.fx, p, ['#FFB0D8', '#FFFFFF', '#FFE36A'], 30, 3, { gravity: 1, life: 1.2 }); c.fx.emoji(p, '🌸', 0.5); }),
  oakheart: melee((c, p) => { c.fx.ring(p, '#A0764A', 2); c.fx.shake(0.22); sparks(c.fx, p, ['#5DBF4A', '#9EE05A', '#6A4A2A'], 26, 3, { gravity: 6 }); }, 0.85, 0.55),
  // 🔥 Ember
  cinderpup: melee((c, p) => { sparks(c.fx, p, FIRE, 20, 2.6, { size: 0.1 }); c.fx.ring(p, '#FF8A30', 1); }),
  lavaling: ranged(async (c) => { const p = hitAt(c); await c.fx.shot(from(c, 0.5), p, { kind: 'goo', color: '#FF6A1A', dur: 0.5, arc: 1.3, size: 0.32 }); sparks(c.fx, p, FIRE, 20, 2.5); }),
  blazefox: melee((c, p) => { c.fx.ring(p, '#FF5A10', 1.6); sparks(c.fx, p, FIRE, 26, 3.2); }),
  pyredrake: ranged(async (c) => { await stream(c, from(c, 1.1), hitAt(c), 10, 30, { kind: 'fire', color: '#FF6A10', dur: 0.3, size: 0.28, arc: 0.1 }, 0.5); }, 0.9),
  volcanotitan: melee((c, p) => { c.fx.shake(0.3); c.fx.ring(p, '#FF6A10', 2); sparks(c.fx, p, FIRE, 30, 3.4, { gravity: 6 }); }, 0.9, 0.55),
  // ❄️ Frost
  snowpip: ranged(async (c) => { const p = hitAt(c); await c.fx.shot(from(c, 0.5), p, { kind: 'ice', color: '#FFFFFF', dur: 0.45, arc: 1, size: 0.3 }); sparks(c.fx, p, ICE, 22, 2.6, {}, true); }),
  icicleram: melee((c, p) => { sparks(c.fx, p, ICE, 26, 3.4, { gravity: 6, size: 0.12 }); c.fx.ring(p, '#9FE6FF', 1.4); }),
  glacierowl: ranged(async (c) => { await stream(c, from(c, 0.9), hitAt(c), 4, 90, { kind: 'ice', color: '#BFF4FF', dur: 0.35, arc: 0.6, size: 0.2 }, 0.5); }),
  frostmaw: melee((c, p) => { c.fx.shake(0.18); sparks(c.fx, p, ICE, 24, 3, {}, true); c.fx.ring(p, '#BFF4FF', 1.6); }, 0.75, 0.55),
  aurorawyrm: ranged((c) => { const p = hitAt(c), a = from(c, 1.3); c.fx.beam(a, p, '#9FFFE0', 0.5, 0.08); c.fx.beam(a, p, '#C89BFF', 0.5, 0.04); sparks(c.fx, p, ['#9FFFE0', '#C89BFF', '#FFFFFF'], 22, 2.8); }),
  // 🍄 Bog
  sporemite: melee((c, p) => { for (let i = 0; i < 8; i++) c.fx.soft({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 2, vy: 0.6, vz: (Math.random() - 0.5) * 2, color: '#9B6BFF', size: 0.3, grow: 0.8, life: 1, alpha: 0.5 }); }),
  mudslug: ranged(async (c) => { const p = hitAt(c); await c.fx.shot(from(c, 0.3), p, { kind: 'goo', color: '#7A5A2A', dur: 0.4, arc: 0.6, size: 0.25 }); water(c, p, ['#7A5A2A', '#5A4428'], 14); }),
  fungalshaman: ranged(async (c) => { const p = hitAt(c); await c.fx.shot(from(c, 1.0), p, { kind: 'spore', color: '#C89BFF', dur: 0.55, arc: 0.9, size: 0.32 }); sparks(c.fx, p, SPORE, 20, 2.4); }),
  swamplurker: melee((c, p) => { water(c, p, ['#4A8A5A', '#7AC8A0', '#2A5A3A'], 26); c.fx.ring(p, '#3A6A4A', 1.4); }),
  rotqueen: ranged(async (c) => { await stream(c, from(c, 1.2), hitAt(c), 8, 50, { kind: 'spore', color: '#9B6BFF', dur: 0.5, arc: 0.7, size: 0.22 }, 0.6); }, 0.9),
  // 🍬 Sugar
  gumdropimp: ranged(async (c) => { const p = hitAt(c); await c.fx.shot(from(c, 0.5), p, { kind: 'candy', color: '#FF3A6A', dur: 0.45, arc: 1.1, size: 0.3 }); sparks(c.fx, p, CANDY, 20, 2.6); }),
  // the jellyfish ghost blows a stream of rainbow bubbles that pop in a splash
  jellyfright: ranged(async (c) => {
    const p = hitAt(c); await stream(c, from(c, 0.8), p, 14, 40, { kind: 'bubble', color: '#FF8AD8', dur: 0.55, arc: 0.4, size: 0.24 }, 0.6);
    water(c, p, ['#FF8AD8', '#8AD8FF', '#C8A8FF', '#FFFFFF'], 30);
  }, 1.0),
  taffytwister: melee((c, p) => { sparks(c.fx, p, ['#FF4F9A', '#FFFFFF', '#FF8AC2'], 24, 3); c.fx.ring(p, '#FF8AC2', 1.3); }),
  candiedknight: melee((c, p) => { sparks(c.fx, p, ['#FF8AC2', '#FFFFFF', '#FFE14D'], 22, 3.4, { size: 0.09 }); c.fx.emoji(p, '🍭', 0.45); }),
  sugarcolossus: melee((c, p) => { c.fx.shake(0.25); sparks(c.fx, p, CANDY, 40, 3.6, { gravity: 6, size: 0.09 }); }, 0.85, 0.55),
  // ⚡ Neon
  voltbug: ranged((c) => { const p = hitAt(c); c.fx.beam(from(c, 0.5), p, '#22E3FF', 0.3, 0.05); sparks(c.fx, p, NEON, 16, 3); }, 0.6),
  circuitcat: melee((c, p) => { sparks(c.fx, p, NEON, 22, 3.4, { size: 0.08 }); c.fx.ring(p, '#22E3FF', 1.1); }),
  laserlynx: ranged((c) => { const p = hitAt(c); c.fx.beam(from(c, 0.75), p, '#FF4FD8', 0.45, 0.07); sparks(c.fx, p, ['#FF4FD8', '#FFFFFF'], 20, 3); c.fx.ring(p, '#FF4FD8', 1); }),
  gridoverlord: ranged((c) => { const p = hitAt(c), a = from(c, 1.6); for (const dx of [-0.25, 0, 0.25]) c.fx.beam(a, p.clone().setX(p.x + dx), dx ? '#FF4FD8' : '#22E3FF', 0.5, 0.04); sparks(c.fx, p, NEON, 24, 3.2); c.fx.shake(0.12); }, 0.8),
  // ⚪ Neutral
  pebblegolem: ranged(async (c) => { const p = hitAt(c); await c.fx.shot(from(c, 0.8), p, { kind: 'pebble', color: '#A8A0AE', dur: 0.5, arc: 1.2, size: 0.22 }); sparks(c.fx, p, ['#A8A0AE', '#6E6878'], 14, 2, {}, true); }),
  wanderingbard: ranged(async (c) => { await stream(c, from(c, 0.8), hitAt(c), 3, 120, { kind: 'note', color: '#FFE14D', dur: 0.55, arc: 0.8, size: 0.26 }, 0.4); }, 0.9),
  mimicchest: melee((c, p) => { sparks(c.fx, p, ['#FFC83A', '#FFF0A0', '#FFFFFF'], 26, 3.2, { gravity: 7 }); c.fx.emoji(p, '🪙', 0.45); }),
};
