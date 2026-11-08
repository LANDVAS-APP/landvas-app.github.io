// Paintbrawl's characters: every creature card is its own hand-built 3D character with a personality idle (they
// breathe, blink, look around and fidget in their own way), an attack and a signature ability with its own animation
// and effects. This file holds the shared pieces: the animation state the builders see, the effects API the board
// gives them, a few easing helpers, and the wrapper that turns a builder into a character the board can drive.
import * as THREE from 'three';
import type { Card } from '../../shared/brawl/cards';
import type { Emit } from '../fx3d';
import { Kit, type V } from './kit';

export type Pose = 'idle' | 'walk' | 'happy' | 'attack';
export type ActKind = 'attack' | 'ability' | 'play';
/** What a character's animation sees each frame. `k` is how far (0..1) it is through its current move. */
export type Anim = { t: number; dt: number; pose: Pose; act: ActKind | null; k: number; hurt: number };
export type ShotKind = 'fire' | 'ice' | 'spore' | 'spark' | 'note' | 'leaf' | 'candy' | 'goo' | 'rock' | 'bolt' | 'petal' | 'heart' | 'bubble' | 'pebble';
/** The effects a character can call on, provided by the board. Positions are in world space. */
export type CharFx = {
  add(e: Emit): void;
  soft(e: Emit): void;
  ring(at: THREE.Vector3, color: string, size?: number, dur?: number): void;
  shot(from: THREE.Vector3, to: THREE.Vector3, o: { kind: ShotKind; color: string; dur?: number; size?: number; arc?: number }): Promise<void>;
  beam(from: THREE.Vector3, to: THREE.Vector3, color: string, dur?: number, width?: number): void;
  emoji(at: THREE.Vector3, e: string, size?: number): void;
  shake(k: number): void;
};
/** Handed to a move's effect: the effects API, where things are, and what it's aimed at. */
export type FxCtx = {
  fx: CharFx;
  /** a point on one of the character's parts, in world space */
  at(o: THREE.Object3D, local?: V): THREE.Vector3;
  /** what the move is aimed at (a creature or a hero), if anything */
  target: THREE.Vector3 | null;
  /** every point the move is aimed at (all enemies for a sweep, the neighbours for a blessing…) */
  targets: THREE.Vector3[];
  /** the character's feet, in world space */
  self: THREE.Vector3;
  /** which way is forward (towards the other side), in world space */
  fwd: THREE.Vector3;
};
export type Move = { dur: number; hit: number; fx?: (c: FxCtx) => void | Promise<void>; /** an attack fired from where it stands (no lunge) */ ranged?: boolean };
export type Spec = { height: number; anim(a: Anim): void; moves?: Partial<Record<ActKind, Move>>;
  /** little effects it gives off all the time (smoke from its nostrils, embers, snow, spores, sparks…) */
  ambient?(c: FxCtx, a: Anim): void };
export type Builder = (k: Kit, card: Card) => Spec;

export type Char = {
  root: THREE.Group;
  height: number;
  /** it attacks from where it stands (fires something) rather than lunging */
  ranged: boolean;
  update(dt: number, t: number, pose: Pose): void;
  /** play a move; resolves when its blow lands (and its effect has played) */
  act(kind: ActKind, fx: CharFx, aim?: THREE.Vector3[]): Promise<void>;
  busy(): boolean;
  /** how long after starting a move its blow lands (seconds) */
  hitIn(kind: ActKind): number;
  /** give it the board's effects, so it can smoke, sparkle and drip on its own */
  bind(fx: CharFx | null): void;
  hurt(k: number): void;
  fade(k: number): void;
  dispose(): void;
};

// ---- easing helpers -----------------------------------------------------------------------------------------------------
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** a bump that rises and falls between a and b (0 outside) */
export const bump = (k: number, a = 0, b = 1) => (k <= a || k >= b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));
/** wind-up then strike: pulls back to -1, snaps forward to +1 around `at`, then settles to 0 */
export const strike = (k: number, at = 0.45) => {
  if (k <= 0 || k >= 1) return 0;
  if (k < at) return -Math.sin((k / at) * Math.PI * 0.5);
  const s = (k - at) / (1 - at);
  if (s < 0.15) return -1 + (s / 0.15) * 2;
  return Math.cos(((s - 0.15) / 0.85) * Math.PI * 0.5);
};
export const smooth = (k: number) => { k = clamp01(k); return k * k * (3 - 2 * k); };
/** 0..1 eyelid closure: a blink every few seconds (and a double blink now and then) */
export const blinkAt = (t: number, seed: number) => {
  const p = 3.1 + (seed % 1.7), x = (t + seed * 3.3) % p;
  const one = (d: number) => (d > 0 && d < 0.16 ? Math.sin((d / 0.16) * Math.PI) : 0);
  return Math.max(one(x), Math.floor((t + seed) / p) % 3 === 0 ? one(x - 0.24) : 0);
};
/** a slow wander of the gaze */
export const gaze = (t: number, seed: number): [number, number] => [Math.sin(t * 0.7 + seed) * 0.6 + Math.sin(t * 1.9 + seed * 2) * 0.2, Math.sin(t * 0.5 + seed * 1.3) * 0.3];
export const wob = (t: number, f: number, a = 1, ph = 0) => Math.sin(t * f + ph) * a;

const RED = new THREE.Color('#FF2A2A');
const v3 = () => new THREE.Vector3();

export function makeChar(build: Builder, card: Card, o: { phone?: boolean; toon?: boolean; attack?: Move } = {}): Char {
  const kit = new Kit(o.phone, o.toon);
  const spec = build(kit, card);
  // only the bigger parts cast shadows (eyes, teeth and sparkles don't need to): half the shadow-pass draw calls
  kit.root.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  kit.root.traverse((m) => { const me = m as THREE.Mesh; if (!me.isMesh || !me.castShadow) return; me.geometry.computeBoundingSphere(); me.getWorldScale(ws); if ((me.geometry.boundingSphere?.radius ?? 0) * Math.max(ws.x, ws.y, ws.z) < 0.13) me.castShadow = false; });
  const moves: Record<ActKind, Move> = { attack: { dur: 0.6, hit: 0.45 }, ability: { dur: 0.9, hit: 0.5 }, play: { dur: 1.0, hit: 0.5 }, ...spec.moves, ...(o.attack ? { attack: o.attack } : {}) };
  let cur: { kind: ActKind; t: number; m: Move; fired: boolean; fx: CharFx; aim: THREE.Vector3[]; res: () => void } | null = null;
  let hurtK = 0, fadeK = 1, bound: CharFx | null = null;
  const at = (ob: THREE.Object3D, local: V = [0, 0, 0]) => { ob.updateWorldMatrix(true, false); return ob.localToWorld(new THREE.Vector3(...local)); };
  const ctx = (fx: CharFx, aim: THREE.Vector3[]): FxCtx => {
    const self = at(kit.root), fwd = v3().set(0, 0, 1).applyQuaternion(kit.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    return { fx, at, target: aim[0] ?? null, targets: aim, self, fwd };
  };
  const fire = (c: NonNullable<typeof cur>) => {
    c.fired = true;
    let p: void | Promise<void> = undefined;
    try { p = c.m.fx?.(ctx(c.fx, c.aim)); } catch { /* an effect must never break the match */ }
    Promise.resolve(p).catch(() => undefined).then(c.res);
  };
  return {
    root: kit.root,
    height: spec.height,
    ranged: !!moves.attack.ranged,
    update(dt, t, pose) {
      if (cur) {
        cur.t += dt;
        if (!cur.fired && cur.t >= cur.m.dur * cur.m.hit) fire(cur);
        if (cur.t >= cur.m.dur) { if (!cur.fired) fire(cur); cur = null; }
      }
      const a: Anim = { t, dt, pose, act: cur?.kind ?? null, k: cur ? clamp01(cur.t / cur.m.dur) : 0, hurt: hurtK };
      try { spec.anim(a); if (bound && spec.ambient && fadeK > 0.95) spec.ambient(ctx(bound, []), a); } catch { /* keep going */ }
    },
    act(kind, fx, aim = []) {
      if (cur && !cur.fired) fire(cur);
      return new Promise<void>((res) => { cur = { kind, t: 0, m: moves[kind], fired: false, fx, aim, res }; });
    },
    busy: () => !!cur,
    hitIn: (kind) => moves[kind].dur * moves[kind].hit,
    bind(fx) { bound = fx; },
    hurt(k) {
      hurtK = k;
      for (const m of kit.tint) { const e0 = m.userData.e0 as THREE.Color | undefined; if (!e0 || !(m as THREE.MeshStandardMaterial).emissive) continue; m.emissive.copy(e0).lerp(RED, k); m.emissiveIntensity = k > 0 ? Math.max(m.userData.ei0 as number, 1.1) : (m.userData.ei0 as number); }
    },
    fade(k) {
      fadeK = k;
      for (const m of kit.mats) { const was = m.transparent; m.transparent = k < 1 || (m.userData.tr0 as boolean); m.opacity = (m.userData.op0 as number) * k; m.depthWrite = k >= 1 && !(m.userData.tr0 as boolean); if (was !== m.transparent) m.needsUpdate = true; }
    },
    dispose() { kit.dispose(); },
  };
}

/** the eyes' everyday life: blinking, glancing around, wincing when hit; `close` squeezes them shut */
export function alive(a: Anim, E: import('./kit').Eyes, seed: number, close = 0, look?: [number, number]) {
  E.blink(Math.max(blinkAt(a.t, seed), a.hurt * 0.75, close));
  const [x, y] = look ?? gaze(a.t, seed); E.look(x, y);
}
/** a happy hop height (when it's cheering or just arrived) */
export const hop = (a: Anim, f = 9, h = 0.14) => (a.pose === 'happy' ? Math.abs(Math.sin(a.t * f)) * h : 0);
/** squash & stretch: s > 0 stretches tall, s < 0 squashes flat */
export const squash = (o: THREE.Object3D, s: number) => o.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
/** points in a ring, for sparkles */
export const around = (c: THREE.Vector3, r: number, n: number, y = 0) => Array.from({ length: n }, (_, i) => { const q = (i / n) * Math.PI * 2; return new THREE.Vector3(c.x + Math.cos(q) * r, c.y + y, c.z + Math.sin(q) * r); });
/** a burst of glowing sparks from a point */
export function sparks(fx: CharFx, p: THREE.Vector3, colors: string[], n: number, spd = 2, o: Partial<Emit> = {}, soft = false) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = spd * (0.5 + Math.random() * 0.7);
    (soft ? fx.soft : fx.add)({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * r * s, vy: u * s + spd * 0.3, vz: Math.sin(a) * r * s, color: colors[i % colors.length], size: 0.12, life: 0.8, gravity: 2, drag: 0.8, ...o });
  }
}
/** motes rising and swirling up around a point (healing, blessings, growth) */
export function motes(fx: CharFx, p: THREE.Vector3, colors: string[], n: number, r = 0.6, o: Partial<Emit> = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, rr = r * (0.5 + Math.random() * 0.6);
    fx.add({ x: p.x + Math.cos(a) * rr, y: p.y + Math.random() * 0.3, z: p.z + Math.sin(a) * rr, vx: -Math.sin(a) * 0.8, vy: 0.9 + Math.random() * 1.2, vz: Math.cos(a) * 0.8, color: colors[i % colors.length], size: 0.13, life: 1.2 + Math.random() * 0.5, drag: 0.6, ...o });
  }
}
/** a sideways vector (to the character's right, in world space) */
export const sideOf = (fwd: THREE.Vector3) => new THREE.Vector3(-fwd.z, 0, fwd.x);
/** true about `rate` times a second (for ambient effects) */
export const every = (a: Anim, rate: number) => Math.random() < a.dt * rate;
/** a stream of shots, one after another (fire breath, frost breath, spore clouds…); resolves when the first lands */
export function stream(c: FxCtx, from: THREE.Vector3, to: THREE.Vector3, n: number, gap: number, o: Parameters<CharFx['shot']>[2], spread = 0.25) {
  return new Promise<void>((res) => {
    let first = true;
    for (let i = 0; i < n; i++) setTimeout(() => {
      const j = new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
      void c.fx.shot(from, to.clone().add(j), o).then(() => { if (first) { first = false; res(); } });
    }, i * gap);
  });
}
