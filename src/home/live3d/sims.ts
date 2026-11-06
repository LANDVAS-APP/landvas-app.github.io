// 3D party games, the rules. Each one is a little physics world on the ground plane (x, z) with jumping (y):
// the host's device steps it 30 times a second and sends it to everyone; everyone draws it in 3D.
// Everything that never changes (the walls, trees and hedges) comes from the seed, so it isn't sent at all.
import { placesBy, rng } from '../party/kit';

export type In3 = { x: number; y: number; b: boolean };
export type P3 = { id: string; x: number; z: number; y: number; vx: number; vz: number; vy: number; on: boolean; face: number; alive: boolean; outAt: number; cd: number; dash: number; stun: number };
/** an obstacle: a circle (tree, fountain, bush) or a box (hedge, bench, slide). tall ones block the view; soft ones can be walked into (bushes) */
export type Ob = { k: 'c'; x: number; z: number; r: number; h: number; tall?: boolean; soft?: boolean; m: string } | { k: 'b'; x: number; z: number; w: number; d: number; h: number; tall?: boolean; m: string };
export type W3 = { t: number; ps: P3[]; obs?: Ob[]; seed: number; over?: boolean };
export type Sim3<W extends W3 = W3> = {
  id: string; name: string; emoji: string; color: string; min: number; max: number; blurb: string; how: string; action: string; place: string;
  init(ids: string[], seed: number): W;
  step(w: W, inputs: Record<string, In3>, dt: number): void;
  result(w: W): Record<string, number> | null;
};

const G = 24, RAD = 0.42;
const newP = (id: string, x: number, z: number): P3 => ({ id, x, z, y: 0, vx: 0, vz: 0, vy: 0, on: true, face: Math.PI, alive: true, outAt: 0, cd: 0, dash: 0, stun: 0 });

/** walking, dashing, jumping and falling, for one player */
function drive(p: P3, i: In3 | undefined, dt: number, o: { speed: number; jump?: boolean; dash?: boolean; dashCd?: number }) {
  if (!p.alive) return;
  p.cd = Math.max(0, p.cd - dt); p.dash = Math.max(0, p.dash - dt);
  let ix = i?.x ?? 0, iz = i?.y ?? 0; const l = Math.hypot(ix, iz);
  if (l > 1) { ix /= l; iz /= l; }
  if (p.stun > 0) { p.stun -= dt; ix = 0; iz = 0; }
  const ctl = p.on ? 10 : 3;
  if (p.dash <= 0) { p.vx += (ix * o.speed - p.vx) * Math.min(1, dt * ctl); p.vz += (iz * o.speed - p.vz) * Math.min(1, dt * ctl); }
  if (l > 0.15) p.face = Math.atan2(ix, iz);
  if (i?.b && p.stun <= 0) {
    if (o.jump && p.on) { p.vy = 8; p.on = false; }
    else if (o.dash && p.cd <= 0) { p.dash = 0.22; p.cd = o.dashCd ?? 2.5; p.vx = Math.sin(p.face) * 14; p.vz = Math.cos(p.face) * 14; }
  }
  p.x += p.vx * dt; p.z += p.vz * dt;
  p.vy -= G * dt; p.y += p.vy * dt;
}
/** land on whatever's below (or keep falling if it's a hole) */
function land(p: P3, ground: number | null, prevY = p.y) {
  if (ground != null && p.y <= ground && (prevY >= ground - 0.05 || p.y > ground - 0.8) && p.vy <= 0) { p.y = ground; p.vy = 0; p.on = true; } else p.on = false;
}
/** bump into things and each other */
function collide(w: W3, bounds: { sq?: number; circle?: number; walls: boolean }) {
  for (const p of w.ps) {
    if (!p.alive) continue;
    for (const o of w.obs ?? []) {
      if (o.k === 'c') { if (o.soft || p.y > o.h) continue; const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + RAD; if (d < m && d > 0.0001) { p.x = o.x + (dx / d) * m; p.z = o.z + (dz / d) * m; } }
      else {
        if (p.y > o.h) continue;
        const hx = o.w / 2 + RAD, hz = o.d / 2 + RAD, dx = p.x - o.x, dz = p.z - o.z;
        if (Math.abs(dx) < hx && Math.abs(dz) < hz) { const px = hx - Math.abs(dx), pz = hz - Math.abs(dz); if (px < pz) { p.x = o.x + Math.sign(dx || 1) * hx; p.vx = 0; } else { p.z = o.z + Math.sign(dz || 1) * hz; p.vz = 0; } }
      }
    }
    if (bounds.walls && bounds.sq) { p.x = Math.max(-bounds.sq + RAD, Math.min(bounds.sq - RAD, p.x)); p.z = Math.max(-bounds.sq + RAD, Math.min(bounds.sq - RAD, p.z)); }
    if (bounds.walls && bounds.circle) { const d = Math.hypot(p.x, p.z), m = bounds.circle - RAD; if (d > m) { p.x *= m / d; p.z *= m / d; } }
  }
  const ps = w.ps.filter((p) => p.alive);
  for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
    const A = ps[a], B = ps[b]; if (Math.abs(A.y - B.y) > 1.2) continue;
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
    if (d < RAD * 2 && d > 0.0001) {
      const nx = dx / d, nz = dz / d, push = (RAD * 2 - d) / 2; A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
      // a dash sends people flying
      for (const [P, Q, s] of [[A, B, 1], [B, A, -1]] as const) if (P.dash > 0 && Q.stun <= 0) { Q.vx += nx * s * 9; Q.vz += nz * s * 9; Q.vy = 4; Q.on = false; Q.stun = 0.5; }
    }
  }
}
/** can a see b? (no tall obstacle in the way) */
export function sees(obs: Ob[] | undefined, ax: number, az: number, bx: number, bz: number) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const o of obs ?? []) { if (!o.tall) continue; if (o.k === 'c' ? Math.hypot(x - o.x, z - o.z) < o.r : Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2) return false; }
  }
  return true;
}
const ring = (ids: string[], r: number, a0 = 0) => ids.map((id, i) => newP(id, Math.sin(a0 + (i / ids.length) * Math.PI * 2) * r, Math.cos(a0 + (i / ids.length) * Math.PI * 2) * r));
/** places for knock-out games: still standing = 1st, then whoever lasted longest */
// (two going out at the same moment: whoever was higher up lasted longer)
const byLasting = (w: W3) => placesBy(Object.fromEntries(w.ps.map((p) => [p.id, p.alive ? 1e9 : Math.round(p.outAt * 1000) * 100 + Math.round(Math.max(0, Math.min(99, p.y + 50)))])));

// ======================================================================================================================
// Ink Tag: whoever's "it" glows red. Touch someone to pass it on. Points for every second you're NOT it.
// ======================================================================================================================
export type TagW = W3 & { it: string; immune: string; immuneT: number; pts: Record<string, number>; dur: number };
const TAG_H = 11;
function playground(seed: number): Ob[] {
  const r = rng(seed), obs: Ob[] = [
    { k: 'c', x: 0, z: 0, r: 1.7, h: 0.9, m: 'fountain' },
    { k: 'b', x: -6.5, z: -6, w: 1.2, d: 3.6, h: 2.2, tall: true, m: 'slide' },
    { k: 'b', x: 6, z: 6.5, w: 3.4, d: 1.2, h: 1.6, tall: true, m: 'climber' },
    { k: 'b', x: 6.5, z: -5.5, w: 2.4, d: 0.6, h: 0.5, m: 'bench' }, { k: 'b', x: -6, z: 6.5, w: 0.6, d: 2.4, h: 0.5, m: 'bench' },
  ];
  for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, d = 4 + r() * 5.5, x = Math.sin(a) * d, z = Math.cos(a) * d; if (obs.some((o) => Math.hypot(o.x - x, o.z - z) < 3)) continue; obs.push({ k: 'c', x, z, r: 0.45 + r() * 0.2, h: 4, tall: true, m: 'tree' }); }
  return obs;
}
export const tag: Sim3<TagW> = {
  id: 'tag', name: 'Ink Tag', emoji: '🏃', color: '#FF3D6E', min: 2, max: 8, action: '💨 Dash', place: 'Candy Park',
  blurb: 'One of you is “it”. Tag someone to pass it on — don’t be it when it counts!', how: 'Run with the stick. If you’re it (glowing red), touch someone to tag them. Every second you’re not it scores a point. 💨 Dash for a burst of speed.',
  init(ids, seed) { const r = rng(seed); return { t: 0, ps: ring(ids, 5, r() * 6), obs: playground(seed), seed, it: ids[Math.floor(r() * ids.length)], immune: '', immuneT: 0, pts: Object.fromEntries(ids.map((id) => [id, 0])), dur: 80 }; },
  step(w, inputs, dt) {
    if (w.over) return;
    w.t += dt; w.immuneT = Math.max(0, w.immuneT - dt);
    for (const p of w.ps) {
      drive(p, inputs[p.id], dt, { speed: p.id === w.it ? 6.4 : 6, dash: true, dashCd: 3 });
      land(p, 0); if (p.id !== w.it) w.pts[p.id] += dt;
    }
    collide(w, { sq: TAG_H, walls: true });
    const it = w.ps.find((p) => p.id === w.it)!;
    if (it.stun <= 0) for (const p of w.ps) {
      if (p.id === w.it || (p.id === w.immune && w.immuneT > 0)) continue;
      if (Math.hypot(p.x - it.x, p.z - it.z) < 1.0 && Math.abs(p.y - it.y) < 1.4) { w.immune = w.it; w.immuneT = 1.5; w.it = p.id; p.stun = 1.0; p.vx = p.vz = 0; break; }
    }
    if (w.t >= w.dur) w.over = true;
  },
  result: (w) => (w.over ? placesBy(Object.fromEntries(Object.entries(w.pts).map(([k, v]) => [k, Math.round(v)]))) : null),
};

// ======================================================================================================================
// Hide & Seek: a moonlit garden. One seeker counts while everyone hides (in the hedges, behind trees, inside bushes),
// then hunts with a lantern. Turns rotate.
// ======================================================================================================================
export type HSW = W3 & { round: number; rounds: number; seeker: string; phase: 'hide' | 'seek' | 'between' | 'done'; ends: number; found: Record<string, number>; pts: Record<string, number> };
const HS_H = 12, HS_HIDE = 15, HS_SEEK = 60, HS_BETWEEN = 5;
function garden(seed: number): Ob[] {
  const r = rng(seed + 5), obs: Ob[] = [];
  // hedge rows with gaps, like a little maze
  const rows = [-8, -3.5, 3.5, 8];
  rows.forEach((z, k) => { let x = -11; while (x < 11) { const len = 2.5 + r() * 3.5; const gap = 1.8 + r() * 1.2; if (Math.abs(z) > 2 || Math.abs(x + len / 2) > 2.5) obs.push({ k: 'b', x: x + len / 2, z: z + (k % 2 ? 0.6 : -0.6), w: len, d: 1, h: 2.4, tall: true, m: 'hedge' }); x += len + gap; } });
  for (const [x, z] of [[-9, 0], [9, 0], [0, -11], [0, 11]]) obs.push({ k: 'b', x, z, w: Math.abs(x) ? 1 : 4, d: Math.abs(x) ? 4 : 1, h: 2.4, tall: true, m: 'hedge' });
  // trees, a gazebo, a well, bushes you can hide inside
  for (let i = 0; i < 10; i++) { const x = (r() - 0.5) * 21, z = (r() - 0.5) * 21; if (Math.hypot(x, z) < 3 || obs.some((o) => Math.hypot(o.x - x, o.z - z) < 2.4)) continue; obs.push({ k: 'c', x, z, r: 0.5, h: 5, tall: true, m: 'tree' }); }
  obs.push({ k: 'c', x: 6.5, z: -6, r: 1.1, h: 1.0, m: 'well' });
  for (let i = 0; i < 12; i++) { const x = (r() - 0.5) * 20, z = (r() - 0.5) * 20; if (Math.hypot(x, z) < 3 || obs.some((o) => Math.hypot(o.x - x, o.z - z) < 1.9)) continue; obs.push({ k: 'c', x, z, r: 0.85, h: 1.2, soft: true, m: 'bush' }); }
  return obs;
}
/** a hider tucked inside a bush */
export const inBush = (obs: Ob[] | undefined, x: number, z: number) => (obs ?? []).some((o) => o.k === 'c' && o.soft && Math.hypot(x - o.x, z - o.z) < o.r - 0.15);
function hsStart(w: HSW) {
  w.seeker = w.ps[w.round % w.ps.length].id; w.phase = 'hide'; w.ends = w.t + HS_HIDE; w.found = {};
  w.ps.forEach((p, i) => { const a = (i / w.ps.length) * Math.PI * 2; Object.assign(p, { x: p.id === w.seeker ? 0 : Math.sin(a) * 2.2, z: p.id === w.seeker ? 0 : Math.cos(a) * 2.2, vx: 0, vz: 0, y: 0, vy: 0, alive: true, stun: 0 }); });
}
export const hide: Sim3<HSW> = {
  id: 'hide', name: 'Hide & Seek', emoji: '🙈', color: '#8B5CFF', min: 3, max: 8, action: '💨 Sprint', place: 'Moonlit Garden',
  blurb: 'Hide in the moonlit garden — behind hedges, up by the trees, inside the bushes. One of you seeks.', how: 'Hiders: you have 15 seconds to hide. Duck behind hedges and trees, or squeeze into a bush. Seeker: your lantern only shows what’s in front of you — touch a hider to find them. Everyone takes a turn seeking.',
  init(ids, seed) { const w: HSW = { t: 0, ps: ids.map((id) => newP(id, 0, 0)), obs: garden(seed), seed, round: 0, rounds: Math.min(ids.length, 3), seeker: ids[0], phase: 'hide', ends: 0, found: {}, pts: Object.fromEntries(ids.map((id) => [id, 0])) }; hsStart(w); return w; },
  step(w, inputs, dt) {
    if (w.phase === 'done') return;
    w.t += dt;
    for (const p of w.ps) {
      const frozen = (w.phase === 'hide' && p.id === w.seeker) || w.found[p.id] != null || w.phase === 'between';
      drive(p, frozen ? undefined : inputs[p.id], dt, { speed: p.id === w.seeker ? 6.3 : 5.8, dash: true, dashCd: 4 });
      land(p, 0);
    }
    collide(w, { sq: HS_H, walls: true });
    if (w.phase === 'hide' && w.t >= w.ends) { w.phase = 'seek'; w.ends = w.t + HS_SEEK; }
    else if (w.phase === 'seek') {
      const s = w.ps.find((p) => p.id === w.seeker)!;
      for (const p of w.ps) if (p.id !== w.seeker && w.found[p.id] == null && Math.hypot(p.x - s.x, p.z - s.z) < 1.05) { w.found[p.id] = w.t; w.pts[w.seeker] += 3; p.vx = p.vz = 0; }
      const hiders = w.ps.filter((p) => p.id !== w.seeker);
      if (w.t >= w.ends || hiders.every((p) => w.found[p.id] != null)) {
        // hiders score for how long they lasted (up to 10)
        for (const p of hiders) w.pts[p.id] += Math.min(10, Math.round(((w.found[p.id] ?? w.ends) - (w.ends - HS_SEEK)) / 6));
        w.phase = 'between'; w.ends = w.t + HS_BETWEEN;
      }
    } else if (w.phase === 'between' && w.t >= w.ends) { w.round++; if (w.round >= w.rounds) { w.phase = 'done'; w.over = true; } else hsStart(w); }
  },
  result: (w) => (w.phase === 'done' ? placesBy(w.pts) : null),
};

// ======================================================================================================================
// Floor is Lava: two floors of tiles over a lava lake. Every tile you stand on crumbles. Last one standing wins.
// ======================================================================================================================
export type LavaW = W3 & { tiles: string[]; crack: Record<string, number>; done: boolean };
export const LAVA = { N: 9, S: 1.9, Y: [0, -5], LAVA: -11 };
const tileAt = (x: number, z: number) => { const i = Math.round(x / LAVA.S + (LAVA.N - 1) / 2), j = Math.round(z / LAVA.S + (LAVA.N - 1) / 2); return i >= 0 && j >= 0 && i < LAVA.N && j < LAVA.N ? j * LAVA.N + i : -1; };
export const lava: Sim3<LavaW> = {
  id: 'lava', name: 'Floor is Lava', emoji: '🌋', color: '#FF7A3D', min: 2, max: 8, action: '⬆ Jump', place: 'Volcano Lake',
  blurb: 'Every tile you touch crumbles into the lava. Keep moving — last one standing wins!', how: 'Run and jump across the tiles. Each one cracks and falls a moment after you step on it. Drop through and you land on the floor below… fall through that and it’s the lava.',
  init(ids, seed) { return { t: 0, ps: ring(ids, 4.5, rng(seed)() * 6), seed, tiles: LAVA.Y.map(() => '1'.repeat(LAVA.N * LAVA.N)), crack: {}, done: false }; },
  step(w, inputs, dt) {
    if (w.over) return;
    w.t += dt;
    const tiles = w.tiles.map((s) => s.split(''));
    for (const [k, v] of Object.entries(w.crack)) { const left = v - dt; if (left <= 0) { const [L, i] = k.split(':').map(Number); tiles[L][i] = '0'; delete w.crack[k]; } else w.crack[k] = left; }
    for (const p of w.ps) {
      if (!p.alive) continue;
      const py = p.y;
      drive(p, inputs[p.id], dt, { speed: 6, jump: true });
      // the highest floor below you (where you were a moment ago) that still has a tile here
      const ti = tileAt(p.x, p.z); let ground: number | null = null;
      for (let L = 0; L < LAVA.Y.length; L++) if (ti >= 0 && tiles[L][ti] !== '0' && py >= LAVA.Y[L] - 0.05) { ground = LAVA.Y[L]; break; }
      land(p, ground, py);
      // a couple of seconds' grace at the start to get moving
      if (p.on && ti >= 0 && w.t > 2.5) { const L = LAVA.Y.indexOf(p.y); const key = `${L}:${ti}`; if (L >= 0 && tiles[L][ti] === '1') { tiles[L][ti] = '2'; w.crack[key] = 0.55; } }
      if (p.y < LAVA.LAVA) { p.alive = false; p.outAt = w.t; }
    }
    collide(w, { walls: false });
    w.tiles = tiles.map((t) => t.join(''));
    const alive = w.ps.filter((p) => p.alive).length;
    if (alive <= (w.ps.length > 1 ? 1 : 0) || w.t > 180) w.over = true;
  },
  result: (w) => (w.over ? byLasting(w) : null),
};

// ======================================================================================================================
// Musical Chairs: dance round the ballroom; when the music stops, grab a chair. One fewer chair than players.
// ======================================================================================================================
export type ChairW = W3 & { phase: 'music' | 'grab' | 'out' | 'done'; ends: number; round: number; chairs: { x: number; z: number; by: string | null }[]; lost: string[] };
const CH_R = 8.5;
function chairsDeal(w: ChairW) {
  const r = rng(w.seed + w.round * 97); w.phase = 'music'; w.ends = w.t + 6 + r() * 6; w.chairs = []; w.lost = [];
}
export const chairs: Sim3<ChairW> = {
  id: 'chairs', name: 'Musical Chairs', emoji: '🪑', color: '#FFB13D', min: 3, max: 8, action: '💨 Shove', place: 'Grand Ballroom',
  blurb: 'Dance while the music plays. When it stops — grab a chair! There’s always one too few.', how: 'Move round the ballroom while the music plays. The moment it stops, chairs appear: run and sit on one. Whoever’s left standing is out. 💨 Shove to bump people out of the way.',
  init(ids, seed) { const w: ChairW = { t: 0, ps: ring(ids, 4, rng(seed)() * 6), obs: [{ k: 'c', x: 0, z: 0, r: 1.3, h: 1.1, m: 'pedestal' }], seed, phase: 'music', ends: 0, round: 0, chairs: [], lost: [] }; chairsDeal(w); return w; },
  step(w, inputs, dt) {
    if (w.over) return;
    w.t += dt;
    const sitting = new Set(w.chairs.map((c) => c.by).filter(Boolean) as string[]);
    for (const p of w.ps) {
      if (!p.alive) continue;
      if (sitting.has(p.id)) { const c = w.chairs.find((x) => x.by === p.id)!; p.x = c.x; p.z = c.z; p.vx = p.vz = 0; continue; }
      drive(p, w.phase === 'out' ? undefined : inputs[p.id], dt, { speed: 6.2, dash: true, dashCd: 2.2 });
      land(p, 0);
    }
    collide(w, { circle: CH_R, walls: true });
    if (w.phase === 'music' && w.t >= w.ends) {
      // the music stops: chairs pop up round the room
      const alive = w.ps.filter((p) => p.alive), n = alive.length - 1, r = rng(w.seed + w.round * 131);
      for (let k = 0; k < n; k++) { let x = 0, z = 0; for (let tries = 0; tries < 40; tries++) { const a = r() * Math.PI * 2, d = 2.4 + r() * (CH_R - 3.4); x = Math.sin(a) * d; z = Math.cos(a) * d; if (w.chairs.every((c) => Math.hypot(c.x - x, c.z - z) > 2.2)) break; } w.chairs.push({ x, z, by: null }); }
      w.phase = 'grab'; w.ends = w.t + 6;
    } else if (w.phase === 'grab') {
      for (const c of w.chairs) if (!c.by) {
        const p = w.ps.find((q) => q.alive && q.on && !sitting.has(q.id) && Math.hypot(q.x - c.x, q.z - c.z) < 0.75);
        if (p) { c.by = p.id; sitting.add(p.id); }
      }
      if (w.t >= w.ends || w.chairs.every((c) => c.by)) {
        w.lost = w.ps.filter((p) => p.alive && !sitting.has(p.id)).map((p) => p.id);
        for (const id of w.lost) { const p = w.ps.find((q) => q.id === id)!; p.alive = false; p.outAt = w.t; }
        w.phase = 'out'; w.ends = w.t + 2.5;
      }
    } else if (w.phase === 'out' && w.t >= w.ends) {
      if (w.ps.filter((p) => p.alive).length <= 1) { w.phase = 'done'; w.over = true; }
      else { w.round++; chairsDeal(w); }
    }
  },
  result: (w) => (w.over ? byLasting(w) : null),
};

export const SIMS3: Record<string, Sim3<any>> = { tag, hide, lava, chairs }; // eslint-disable-line @typescript-eslint/no-explicit-any
/** what goes over the wire: everything but the fixed scenery */
export const snap3 = (w: W3) => { const { obs, ...rest } = w; void obs; return rest; };
