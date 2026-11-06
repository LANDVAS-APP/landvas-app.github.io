// 3D party games, the rules. Each one is a little physics world on the ground plane (x, z) with jumping (y):
// the host's device steps it 30 times a second and sends it to everyone; everyone draws it in 3D.
// Every map is made fresh from the game's seed (and grows with the number of players), so no two games are the
// same. Everything that never changes (walls, trees, hedges, pads) comes from the seed, so it isn't sent at all.
import { placesBy, rng } from '../party/kit';

export type In3 = { x: number; y: number; b: boolean };
export type P3 = { id: string; x: number; z: number; y: number; vx: number; vz: number; vy: number; on: boolean; face: number; alive: boolean; outAt: number; cd: number; dash: number; stun: number };
/** Things on the map:
 *  c: a circle (tree, fountain, bush), b: a box (hedge, bench, wall). tall ones block the view; soft ones can be walked into and hide you.
 *  z: a pad on the floor (boost, bounce, goo, ice). d: scenery only (nothing to bump into). */
export type Ob =
  | { k: 'c'; x: number; z: number; r: number; h: number; tall?: boolean; soft?: boolean; m: string; a?: number; v?: number }
  | { k: 'b'; x: number; z: number; w: number; d: number; h: number; tall?: boolean; soft?: boolean; m: string; a?: number; v?: number }
  | { k: 'z'; x: number; z: number; r: number; m: 'boost' | 'bounce' | 'goo' | 'ice'; a?: number; v?: number }
  | { k: 'd'; x: number; z: number; m: string; a?: number; v?: number; s?: number };
/** H: half the size of a square map; R: the radius of a round one */
export type W3 = { t: number; ps: P3[]; obs?: Ob[]; seed: number; over?: boolean; H?: number; R?: number };
export type Sim3<W extends W3 = W3> = {
  id: string; name: string; emoji: string; color: string; min: number; max: number; blurb: string; how: string; action: string; place: string;
  init(ids: string[], seed: number): W;
  step(w: W, inputs: Record<string, In3>, dt: number): void;
  /** how one player moves (and bumps into the scenery): the host uses it, and your own device uses it to move you
   *  straight away instead of waiting for the host */
  move(w: W, p: P3, i: In3 | undefined, dt: number): void;
  result(w: W): Record<string, number> | null;
};

const G = 24, RAD = 0.42;
const newP = (id: string, x: number, z: number): P3 => ({ id, x, z, y: 0, vx: 0, vz: 0, vy: 0, on: true, face: Math.PI, alive: true, outAt: 0, cd: 0, dash: 0, stun: 0 });
type Zone = Extract<Ob, { k: 'z' }>;
export const zoneAt = (obs: Ob[] | undefined, x: number, z: number) => (obs ?? []).find((o) => o.k === 'z' && Math.hypot(x - o.x, z - o.z) < o.r) as Zone | undefined;

/** walking, dashing, jumping and falling, for one player */
function drive(p: P3, i: In3 | undefined, dt: number, o: { speed: number; jump?: boolean; dash?: boolean; dashCd?: number; zone?: Zone }) {
  if (!p.alive) return;
  p.cd = Math.max(0, p.cd - dt); p.dash = Math.max(0, p.dash - dt);
  let ix = i?.x ?? 0, iz = i?.y ?? 0; const l = Math.hypot(ix, iz);
  if (l > 1) { ix /= l; iz /= l; }
  if (p.stun > 0) { p.stun -= dt; ix = 0; iz = 0; }
  const goo = p.on && o.zone?.m === 'goo', ice = p.on && o.zone?.m === 'ice';
  const speed = o.speed * (goo ? 0.45 : 1), ctl = p.on ? (ice ? 1.3 : 10) : 3;
  if (p.dash <= 0) { p.vx += (ix * speed - p.vx) * Math.min(1, dt * ctl); p.vz += (iz * speed - p.vz) * Math.min(1, dt * ctl); }
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
/** pads on the floor: boosts fling you along, bounce pads launch you over things */
function pads(p: P3, z: Zone | undefined) {
  if (!z || !p.on || !p.alive) return;
  if (z.m === 'boost' && p.dash <= 0) { const a = z.a ?? 0; p.dash = 0.4; p.vx = Math.sin(a) * 15; p.vz = Math.cos(a) * 15; p.face = a; }
  if (z.m === 'bounce') { p.vy = 11.5; p.on = false; p.vx *= 1.25; p.vz *= 1.25; }
}
/** bump into the scenery and the edge of the map */
function hitScenery(w: W3, p: P3) {
  if (!p.alive) return;
  for (const o of w.obs ?? []) {
    if (o.k === 'c') { if (o.soft || p.y > o.h) continue; const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + RAD; if (d < m && d > 0.0001) { p.x = o.x + (dx / d) * m; p.z = o.z + (dz / d) * m; } }
    else if (o.k === 'b') {
      if (o.soft || p.y > o.h) continue;
      const hx = o.w / 2 + RAD, hz = o.d / 2 + RAD, dx = p.x - o.x, dz = p.z - o.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) { const px = hx - Math.abs(dx), pz = hz - Math.abs(dz); if (px < pz) { p.x = o.x + Math.sign(dx || 1) * hx; p.vx = 0; } else { p.z = o.z + Math.sign(dz || 1) * hz; p.vz = 0; } }
    }
  }
  if (w.H) { p.x = Math.max(-w.H + RAD, Math.min(w.H - RAD, p.x)); p.z = Math.max(-w.H + RAD, Math.min(w.H - RAD, p.z)); }
  if (w.R) { const d = Math.hypot(p.x, p.z), m = w.R - RAD; if (d > m) { p.x *= m / d; p.z *= m / d; } }
}
/** bump into each other (a dash sends people flying) */
function bumpPlayers(w: W3) {
  const ps = w.ps.filter((p) => p.alive);
  for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
    const A = ps[a], B = ps[b]; if (Math.abs(A.y - B.y) > 1.2) continue;
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
    if (d < RAD * 2 && d > 0.0001) {
      const nx = dx / d, nz = dz / d, push = (RAD * 2 - d) / 2; A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
      for (const [P, Q, s] of [[A, B, 1], [B, A, -1]] as const) if (P.dash > 0 && Q.stun <= 0) { Q.vx += nx * s * 9; Q.vz += nz * s * 9; Q.vy = 4; Q.on = false; Q.stun = 0.5; }
    }
  }
}
/** can a see b? (no tall obstacle in the way) */
export function sees(obs: Ob[] | undefined, ax: number, az: number, bx: number, bz: number) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3);
  const tall = (obs ?? []).filter((o) => (o.k === 'c' || o.k === 'b') && o.tall && Math.min(ax, bx) - 4 < o.x && o.x < Math.max(ax, bx) + 4 && Math.min(az, bz) - 4 < o.z && o.z < Math.max(az, bz) + 4);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const o of tall) { if (o.k === 'c' ? Math.hypot(x - o.x, z - o.z) < o.r : o.k === 'b' && Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2) return false; }
  }
  return true;
}
/** the soft thing (bush, tall grass, haystack, hollow log) someone's tucked inside, if any */
export const softAt = (obs: Ob[] | undefined, x: number, z: number) => (obs ?? []).find((o) => o.k === 'c' ? o.soft && Math.hypot(x - o.x, z - o.z) < o.r - 0.15 : o.k === 'b' && o.soft && Math.abs(x - o.x) < o.w / 2 - 0.1 && Math.abs(z - o.z) < o.d / 2 - 0.1) as Extract<Ob, { k: 'c' | 'b' }> | undefined;
export const inBush = (obs: Ob[] | undefined, x: number, z: number) => !!softAt(obs, x, z);
/** how close the seeker has to be to spot you in each kind of hiding place */
export const SOFT_REVEAL: Record<string, number> = { bush: 1.6, grass: 2.4, cotton: 1.6, hay: 1.3, log: 1.3 };

const ring = (ids: string[], r: number, a0 = 0) => ids.map((id, i) => newP(id, Math.sin(a0 + (i / ids.length) * Math.PI * 2) * r, Math.cos(a0 + (i / ids.length) * Math.PI * 2) * r));
/** places for knock-out games: still standing = 1st, then whoever lasted longest */
// (two going out at the same moment: whoever was higher up lasted longer)
const byLasting = (w: W3) => placesBy(Object.fromEntries(w.ps.map((p) => [p.id, p.alive ? 1e9 : Math.round(p.outAt * 1000) * 100 + Math.round(Math.max(0, Math.min(99, p.y + 50)))])));

// ---- building maps -------------------------------------------------------------------------------------------------
/** how far a point is from the edge of a thing (0 inside) */
function gap(o: Ob, x: number, z: number) {
  if (o.k === 'b') return Math.hypot(Math.max(0, Math.abs(x - o.x) - o.w / 2), Math.max(0, Math.abs(z - o.z) - o.d / 2));
  if (o.k === 'd') return Math.hypot(x - o.x, z - o.z) - 0.6;
  return Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r);
}
/** a free spot at least `clear` from everything, away from the middle (where everyone starts) */
function spot(r: () => number, obs: Ob[], H: number, clear: number, mid = 5, edge = 1.5): [number, number] | null {
  for (let k = 0; k < 40; k++) {
    const x = (r() * 2 - 1) * (H - edge), z = (r() * 2 - 1) * (H - edge);
    if (Math.hypot(x, z) < mid) continue;
    if (obs.some((o) => gap(o, x, z) < clear)) continue;
    return [x, z];
  }
  return null;
}
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

// ======================================================================================================================
// Ink Tag in Candy Park: whoever's "it" glows red. Touch someone to pass it on. Points for every second you're NOT it.
// The park is new every game: playsets, candy walls, trees, cotton-candy bushes, boost strips, trampolines and taffy.
// ======================================================================================================================
export type TagW = W3 & { it: string; immune: string; immuneT: number; pts: Record<string, number>; dur: number };
export function candyMap(seed: number, n: number) {
  const r = rng(seed * 7 + 3), H = Math.round(13 + n * 1.1), obs: Ob[] = [];
  const at = (clear: number, mid = 6) => spot(r, obs, H, clear, mid);
  let s = at(2.6, 7); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 1.7, h: 0.9, m: 'fountain' });
  // playsets
  for (let i = 0; i < 2 + Math.floor(H / 7); i++) {
    const m = pick(r, ['slide', 'climber', 'swings', 'slide', 'tower']), turn = r() < 0.5;
    s = at(2.2); if (!s) continue;
    const [w, d, h] = m === 'slide' ? [1.2, 3.6, 2.2] : m === 'climber' ? [3.4, 1.2, 1.6] : m === 'tower' ? [2.2, 2.2, 3.2] : [3.8, 0.5, 2.3];
    obs.push({ k: 'b', x: s[0], z: s[1], w: turn ? d : w, d: turn ? w : d, h, tall: m !== 'swings', m, a: turn ? 1 : 0 });
  }
  // candy walls (low: bounce over them)
  for (let i = 0; i < Math.floor(H / 2.5); i++) { s = at(1.6); if (!s) continue; const len = 3 + r() * 4, along = r() < 0.5; obs.push({ k: 'b', x: s[0], z: s[1], w: along ? len : 0.7, d: along ? 0.7 : len, h: 1.0, m: 'candywall', v: Math.floor(r() * 4) }); }
  // trees, lollipops, cotton-candy bushes (soft: you can duck into them), benches, gumdrop rocks
  for (let i = 0; i < Math.round(H * 0.9); i++) { s = at(1.4); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 0.5, h: 4, tall: true, m: 'tree', v: Math.floor(r() * 4) }); }
  for (let i = 0; i < Math.round(H / 3); i++) { s = at(1); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 0.28, h: 3, m: 'lolly', v: Math.floor(r() * 4) }); }
  for (let i = 0; i < Math.round(H / 2.5); i++) { s = at(1.2); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 1.05, h: 1.4, soft: true, m: 'cotton', v: Math.floor(r() * 3) }); }
  for (let i = 0; i < Math.round(H / 4); i++) { s = at(1.2); if (!s) continue; const along = r() < 0.5; obs.push({ k: 'b', x: s[0], z: s[1], w: along ? 2.4 : 0.6, d: along ? 0.6 : 2.4, h: 0.5, m: 'bench' }); }
  for (let i = 0; i < Math.round(H / 3); i++) { s = at(0.8); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 0.4 + r() * 0.3, h: 0.7, m: 'gumdrop', v: Math.floor(r() * 5) }); }
  // the fun bits on the floor
  for (let i = 0; i < 3 + Math.round(H / 4); i++) { s = at(1.5, 3); if (s) obs.push({ k: 'z', x: s[0], z: s[1], r: 0.95, m: 'boost', a: Math.floor(r() * 8) * (Math.PI / 4) }); }
  for (let i = 0; i < 2 + Math.round(H / 6); i++) { s = at(1.5, 3); if (s) obs.push({ k: 'z', x: s[0], z: s[1], r: 0.9, m: 'bounce' }); }
  for (let i = 0; i < 2; i++) { s = at(1.5, 4); if (s) obs.push({ k: 'z', x: s[0], z: s[1], r: 1.3 + r() * 0.5, m: 'goo' }); }
  // scenery: an ice-cream cart, lamp posts
  s = at(1.5); if (s) obs.push({ k: 'b', x: s[0], z: s[1], w: 1.8, d: 1, h: 1.6, m: 'cart' });
  for (let i = 0; i < Math.round(H / 3); i++) { s = at(1); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 0.15, h: 3, m: 'lamp' }); }
  return { H, obs };
}
export const tag: Sim3<TagW> = {
  id: 'tag', name: 'Ink Tag', emoji: '🏃', color: '#FF3D6E', min: 2, max: 8, action: '💨 Dash', place: 'Candy Park',
  blurb: 'One of you is “it”. Tag someone to pass it on — don’t be it when it counts!', how: 'Run with the stick. If you’re it (glowing red), touch someone to tag them. Every second you’re not it scores a point. 💨 Dash, ride the boost strips, bounce on trampolines over walls, and dodge the sticky taffy.',
  init(ids, seed) { const r = rng(seed), m = candyMap(seed, ids.length); return { t: 0, ps: ring(ids, 4, r() * 6), obs: m.obs, H: m.H, seed, it: ids[Math.floor(r() * ids.length)], immune: '', immuneT: 0, pts: Object.fromEntries(ids.map((id) => [id, 0])), dur: 80 + ids.length * 5 }; },
  move(w, p, i, dt) {
    const z = zoneAt(w.obs, p.x, p.z);
    drive(p, i, dt, { speed: p.id === w.it ? 6.5 : 6, dash: true, dashCd: 3, zone: z });
    land(p, 0); pads(p, z); hitScenery(w, p);
  },
  step(w, inputs, dt) {
    if (w.over) return;
    w.t += dt; w.immuneT = Math.max(0, w.immuneT - dt);
    for (const p of w.ps) { tag.move(w, p, inputs[p.id], dt); if (p.id !== w.it) w.pts[p.id] += dt; }
    bumpPlayers(w);
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
// Hide & Seek in a Moonlit Garden: a hedge maze that's different every game, with bushes, tall grass, haystacks,
// hollow logs and garden sheds to hide in. One seeker counts while everyone hides, then hunts with a lantern.
// ======================================================================================================================
export type HSW = W3 & { round: number; rounds: number; seeker: string; phase: 'hide' | 'seek' | 'between' | 'done'; ends: number; found: Record<string, number>; pts: Record<string, number> };
const HS_HIDE = 15, HS_BETWEEN = 5;
const hsSeek = (n: number) => 55 + n * 5;
export function gardenMap(seed: number, n: number) {
  const r = rng(seed * 13 + 5), H = 14 + n, C = 4.6, N = Math.floor((2 * H) / C), off = -(N * C) / 2, obs: Ob[] = [];
  // a maze: every cell starts walled in, then a random walk knocks walls down, then a few more go for loops
  const east = Array.from({ length: N }, () => Array(N).fill(true) as boolean[]), south = Array.from({ length: N }, () => Array(N).fill(true) as boolean[]);
  const seen = Array.from({ length: N }, () => Array(N).fill(false) as boolean[]), stack: [number, number][] = [[Math.floor(r() * N), Math.floor(r() * N)]];
  seen[stack[0][0]][stack[0][1]] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([a, b]) => [i + a, j + b] as [number, number]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen[a][b]);
    if (!next.length) { stack.pop(); continue; }
    const [a, b] = pick(r, next); seen[a][b] = true;
    if (a !== i) east[Math.min(a, i)][j] = false; else south[i][Math.min(b, j)] = false;
    stack.push([a, b]);
  }
  const cx = (i: number) => off + (i + 0.5) * C;
  const middle = (i: number, j: number) => Math.hypot(cx(i), cx(j)) < 6;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (r() < 0.3 || middle(i, j) || (i + 1 < N && middle(i + 1, j))) east[i][j] = false;
    if (r() < 0.3 || middle(i, j) || (j + 1 < N && middle(i, j + 1))) south[i][j] = false;
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const low = r() < 0.15; // a few low hedges you can see over
    if (east[i][j] && i < N - 1) obs.push({ k: 'b', x: off + (i + 1) * C, z: cx(j), w: 0.9, d: C + 0.9, h: low ? 1.1 : 2.4, tall: !low, m: 'hedge' });
    if (south[i][j] && j < N - 1) obs.push({ k: 'b', x: cx(i), z: off + (j + 1) * C, w: C + 0.9, d: 0.9, h: low ? 1.1 : 2.4, tall: !low, m: 'hedge' });
  }
  // a gazebo in the middle
  obs.push({ k: 'd', x: 0, z: 0, m: 'gazebo' });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26; obs.push({ k: 'c', x: Math.sin(a) * 2.6, z: Math.cos(a) * 2.6, r: 0.14, h: 2.8, m: 'post' }); }
  // fill the cells: places to hide, and things to hide behind
  const hedgeGap = (x: number, z: number, c: number) => obs.every((o) => gap(o, x, z) >= c);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (middle(i, j)) continue;
    const roll = r(), x = cx(i) + (r() - 0.5) * (C - 2.6), z = cx(j) + (r() - 0.5) * (C - 2.6);
    if (roll < 0.06) {
      // a garden shed: walls on three sides and a door on the fourth
      const dir = Math.floor(r() * 4), S = 2.6, t = 0.2, x0 = cx(i), z0 = cx(j);
      if (!hedgeGap(x0, z0, S / 2 + 0.3)) continue;
      const walls: [number, number, number, number][] = [[0, -S / 2, S, t], [0, S / 2, S, t], [-S / 2, 0, t, S], [S / 2, 0, t, S]];
      walls.forEach(([dx, dz, w, d], k) => {
        if (k !== dir) { obs.push({ k: 'b', x: x0 + dx, z: z0 + dz, w, d, h: 2.4, tall: true, m: 'shedwall' }); return; }
        // the door side: two short bits either side of a doorway
        const side = (S - 1.2) / 2;
        for (const s of [-1, 1]) obs.push(w > d ? { k: 'b', x: x0 + dx + s * (S / 2 - side / 2), z: z0 + dz, w: side, d, h: 2.4, tall: true, m: 'shedwall' } : { k: 'b', x: x0 + dx, z: z0 + dz + s * (S / 2 - side / 2), w, d: side, h: 2.4, tall: true, m: 'shedwall' });
      });
      obs.push({ k: 'd', x: x0, z: z0, m: 'shed', a: dir, s: S });
      continue;
    }
    const thing: Ob | null =
      roll < 0.26 ? { k: 'c', x, z, r: 0.85, h: 1.2, soft: true, m: 'bush' }
      : roll < 0.38 ? { k: 'c', x, z, r: 1.45, h: 0.9, soft: true, m: 'grass' }
      : roll < 0.44 ? { k: 'c', x, z, r: 0.95, h: 1.3, soft: true, m: 'hay' }
      : roll < 0.49 ? (r() < 0.5 ? { k: 'b', x, z, w: 2.4, d: 0.9, h: 0.9, soft: true, m: 'log' } : { k: 'b', x, z, w: 0.9, d: 2.4, h: 0.9, soft: true, m: 'log', a: 1 })
      : roll < 0.57 ? { k: 'c', x, z, r: 0.5, h: 5, tall: true, m: 'tree' }
      : roll < 0.62 ? { k: 'c', x, z, r: 0.55, h: 2.4, tall: true, m: 'statue', v: Math.floor(r() * 3) }
      : roll < 0.66 ? { k: 'c', x, z, r: 1.5, h: 0.3, m: 'pond' }
      : roll < 0.71 ? { k: 'c', x, z, r: 0.45, h: 1.0, m: 'barrel' }
      : roll < 0.74 ? { k: 'c', x, z, r: 1.1, h: 1.0, m: 'well' }
      : roll < 0.78 ? { k: 'd', x, z, m: 'flowers', v: Math.floor(r() * 4) }
      : roll < 0.81 ? { k: 'c', x, z, r: 0.14, h: 2.4, m: 'lamp' }
      : null;
    if (!thing) continue;
    const size = thing.k === 'c' ? thing.r : thing.k === 'b' ? Math.max(thing.w, thing.d) / 2 : 0.5;
    if (hedgeGap(x, z, size + 0.5)) obs.push(thing);
  }
  return { H: (N * C) / 2, obs };
}
function hsStart(w: HSW) {
  w.seeker = w.ps[w.round % w.ps.length].id; w.phase = 'hide'; w.ends = w.t + HS_HIDE; w.found = {};
  w.ps.forEach((p, i) => { const a = (i / w.ps.length) * Math.PI * 2; Object.assign(p, { x: p.id === w.seeker ? 0 : Math.sin(a) * 1.7, z: p.id === w.seeker ? 0 : Math.cos(a) * 1.7, vx: 0, vz: 0, y: 0, vy: 0, alive: true, stun: 0 }); });
}
export const hide: Sim3<HSW> = {
  id: 'hide', name: 'Hide & Seek', emoji: '🙈', color: '#8B5CFF', min: 3, max: 8, action: '💨 Sprint', place: 'Moonlit Garden',
  blurb: 'A hedge maze that’s new every game — bushes, tall grass, haystacks, hollow logs and sheds to hide in. One of you seeks.', how: 'Hiders: 15 seconds to hide. Squeeze into a bush, the tall grass, a haystack or a hollow log, or duck into a shed. Keep still — moving rustles the leaves! Seeker: your lantern only shows what’s in front of you. Touch a hider to find them. Everyone takes a turn seeking.',
  init(ids, seed) { const m = gardenMap(seed, ids.length); const w: HSW = { t: 0, ps: ids.map((id) => newP(id, 0, 0)), obs: m.obs, H: m.H, seed, round: 0, rounds: Math.min(ids.length, 3), seeker: ids[0], phase: 'hide', ends: 0, found: {}, pts: Object.fromEntries(ids.map((id) => [id, 0])) }; hsStart(w); return w; },
  move(w, p, i, dt) {
    const frozen = (w.phase === 'hide' && p.id === w.seeker) || w.found[p.id] != null || w.phase === 'between' || w.phase === 'done';
    drive(p, frozen ? undefined : i, dt, { speed: p.id === w.seeker ? 6.4 : 5.8, dash: true, dashCd: 4 });
    land(p, 0); hitScenery(w, p);
  },
  step(w, inputs, dt) {
    if (w.phase === 'done') return;
    w.t += dt;
    for (const p of w.ps) hide.move(w, p, inputs[p.id], dt);
    bumpPlayers(w);
    if (w.phase === 'hide' && w.t >= w.ends) { w.phase = 'seek'; w.ends = w.t + hsSeek(w.ps.length); }
    else if (w.phase === 'seek') {
      const s = w.ps.find((p) => p.id === w.seeker)!;
      for (const p of w.ps) if (p.id !== w.seeker && w.found[p.id] == null && Math.hypot(p.x - s.x, p.z - s.z) < 1.05) { w.found[p.id] = w.t; w.pts[w.seeker] += 3; p.vx = p.vz = 0; }
      const hiders = w.ps.filter((p) => p.id !== w.seeker);
      if (w.t >= w.ends || hiders.every((p) => w.found[p.id] != null)) {
        // hiders score for how long they lasted (up to 10)
        const len = hsSeek(w.ps.length);
        for (const p of hiders) w.pts[p.id] += Math.min(10, Math.round((((w.found[p.id] ?? w.ends) - (w.ends - len)) / len) * 10));
        w.phase = 'between'; w.ends = w.t + HS_BETWEEN;
      }
    } else if (w.phase === 'between' && w.t >= w.ends) { w.round++; if (w.round >= w.rounds) { w.phase = 'done'; w.over = true; } else hsStart(w); }
  },
  result: (w) => (w.phase === 'done' ? placesBy(w.pts) : null),
};

// ======================================================================================================================
// Floor is Lava: three floors of tiles over a lava lake, a different shape every game. Every tile you stand on
// crumbles; mushroom tiles bounce you back up. After a while the lava starts rising. Last one standing wins.
// ======================================================================================================================
export type LavaW = W3 & { tiles: string[]; crack: Record<string, number>; done: boolean; N: number; lava: number };
export const LAVA = { S: 1.9, Y: [0, -4.5, -9], LAVA: -15, RISE_AT: 50 };
export const tileAt = (N: number, x: number, z: number) => { const i = Math.round(x / LAVA.S + (N - 1) / 2), j = Math.round(z / LAVA.S + (N - 1) / 2); return i >= 0 && j >= 0 && i < N && j < N ? j * N + i : -1; };
export function lavaMap(seed: number, n: number) {
  const r = rng(seed * 17 + 9), N = n <= 3 ? 10 : n <= 6 ? 11 : 12, c = (N - 1) / 2;
  const blobs = (count: number, rMin: number, rMax: number, base: number) => {
    const t = Array(N * N).fill('0') as string[];
    for (let i = 0; i < N * N; i++) if (r() < base) t[i] = '1';
    for (let k = 0; k < count; k++) { const bx = r() * (N - 1), bz = r() * (N - 1), br = rMin + r() * (rMax - rMin); for (let i = 0; i < N * N; i++) if (Math.hypot((i % N) - bx, Math.floor(i / N) - bz) <= br) t[i] = '1'; }
    return t;
  };
  // the top floor: nearly whole, with a few holes and a bitten corner
  const top = Array(N * N).fill('1') as string[];
  for (let k = 0; k < Math.round(N * N * 0.06); k++) { const i = Math.floor(r() * N * N); if (Math.hypot((i % N) - c, Math.floor(i / N) - c) > 3) top[i] = '0'; }
  const cx = r() < 0.5 ? 0 : N - 1, cz = r() < 0.5 ? 0 : N - 1, bite = 1 + Math.floor(r() * 3);
  for (let i = 0; i < N * N; i++) if (Math.abs((i % N) - cx) + Math.abs(Math.floor(i / N) - cz) < bite) top[i] = '0';
  const mid = blobs(5 + Math.floor(r() * 3), 1.5, 3, 0.12), low = blobs(6 + Math.floor(r() * 3), 1.2, 2.4, 0.06);
  // mushrooms: they never crumble and bounce you up a floor
  for (const t of [mid, low]) for (let k = 0, tries = 0; k < 3 && tries < 60; tries++) { const i = Math.floor(r() * N * N); if (t[i] === '1') { t[i] = 'b'; k++; } }
  return { N, tiles: [top.join(''), mid.join(''), low.join('')] };
}
/** the highest floor below you (where you were a moment ago) that still has a tile here */
function lavaGround(w: LavaW, p: P3, py: number) {
  const ti = tileAt(w.N, p.x, p.z);
  if (ti < 0) return { ground: null, ti, L: -1 };
  for (let L = 0; L < LAVA.Y.length; L++) if (w.tiles[L][ti] !== '0' && py >= LAVA.Y[L] - 0.05) return { ground: LAVA.Y[L], ti, L };
  return { ground: null, ti, L: -1 };
}
const setTile = (w: LavaW, L: number, i: number, c: string) => { const s = w.tiles[L]; w.tiles[L] = s.slice(0, i) + c + s.slice(i + 1); };
export const lava: Sim3<LavaW> = {
  id: 'lava', name: 'Floor is Lava', emoji: '🌋', color: '#FF7A3D', min: 2, max: 8, action: '⬆ Jump', place: 'Volcano Lake',
  blurb: 'Every tile you touch crumbles into the lava. Keep moving — last one standing wins!', how: 'Run and jump across the tiles. Each one cracks and falls a moment after you step on it. Drop through and you land on the floor below — red mushrooms bounce you back up. Then the lava starts rising…',
  init(ids, seed) { const m = lavaMap(seed, ids.length); return { t: 0, ps: ring(ids, 3.6, rng(seed)() * 6), seed, tiles: m.tiles, N: m.N, crack: {}, done: false, lava: LAVA.LAVA }; },
  move(w, p, i, dt) {
    if (!p.alive) return;
    const py = p.y;
    drive(p, i, dt, { speed: 6, jump: true });
    const g = lavaGround(w, p, py);
    land(p, g.ground, py);
    if (p.on && g.L >= 0 && w.tiles[g.L][g.ti] === 'b') { p.vy = 15.5; p.on = false; }
  },
  step(w, inputs, dt) {
    if (w.over) return;
    w.t += dt;
    w.lava = LAVA.LAVA + Math.max(0, w.t - LAVA.RISE_AT) * 0.09;
    for (const [k, v] of Object.entries(w.crack)) { const left = v - dt; if (left <= 0) { const [L, i] = k.split(':').map(Number); setTile(w, L, i, '0'); delete w.crack[k]; } else w.crack[k] = left; }
    for (const p of w.ps) {
      if (!p.alive) continue;
      lava.move(w, p, inputs[p.id], dt);
      // a couple of seconds' grace at the start to get moving
      if (p.on && w.t > 2.5) { const ti = tileAt(w.N, p.x, p.z), L = LAVA.Y.indexOf(p.y); if (L >= 0 && ti >= 0 && w.tiles[L][ti] === '1') { setTile(w, L, ti, '2'); w.crack[`${L}:${ti}`] = 0.55; } }
      if (p.y < w.lava + 0.3) { p.alive = false; p.outAt = w.t; }
    }
    bumpPlayers(w);
    const alive = w.ps.filter((p) => p.alive).length;
    if (alive <= (w.ps.length > 1 ? 1 : 0) || w.t > 200) w.over = true;
  },
  result: (w) => (w.over ? byLasting(w) : null),
};

// ======================================================================================================================
// Musical Chairs in the Grand Ballroom: dance while the music plays; when it stops, grab a chair. One fewer chair than
// players. Tables, potted palms and slippery polished patches are in different places every game.
// ======================================================================================================================
export type ChairW = W3 & { phase: 'music' | 'grab' | 'out' | 'done'; ends: number; round: number; chairs: { x: number; z: number; by: string | null }[]; lost: string[] };
export function ballMap(seed: number, n: number) {
  const r = rng(seed * 19 + 1), R = 9 + n * 0.5, obs: Ob[] = [{ k: 'c', x: 0, z: 0, r: 1.3, h: 1.1, m: 'gramophone' }];
  const at = (clear: number) => { for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2, d = 3.2 + r() * (R - 4.6), x = Math.sin(a) * d, z = Math.cos(a) * d; if (obs.every((o) => gap(o, x, z) >= clear)) return [x, z] as const; } return null; };
  for (let i = 0; i < n + 2; i++) { const s = at(2); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 0.75, h: 0.9, m: 'table', v: Math.floor(r() * 3) }); }
  for (let i = 0; i < 3 + Math.floor(n / 2); i++) { const s = at(1.6); if (s) obs.push({ k: 'c', x: s[0], z: s[1], r: 0.45, h: 1.8, m: 'palm' }); }
  for (let i = 0; i < 2 + Math.floor(n / 3); i++) { const s = at(1.2); if (s) obs.push({ k: 'z', x: s[0], z: s[1], r: 1.4 + r() * 0.6, m: 'ice' }); }
  return { R, obs };
}
function chairsDeal(w: ChairW) {
  const r = rng(w.seed + w.round * 97); w.phase = 'music'; w.ends = w.t + 6 + r() * 7; w.chairs = []; w.lost = [];
}
export const chairs: Sim3<ChairW> = {
  id: 'chairs', name: 'Musical Chairs', emoji: '🪑', color: '#FFB13D', min: 3, max: 8, action: '💨 Shove', place: 'Grand Ballroom',
  blurb: 'Dance while the music plays. When it stops — grab a chair! There’s always one too few.', how: 'Move round the ballroom while the music plays. The moment it stops, chairs appear: run and sit on one. Whoever’s left standing is out. Watch out for the polished floor — it’s slippery! 💨 Shove to bump people out of the way.',
  init(ids, seed) { const m = ballMap(seed, ids.length); const w: ChairW = { t: 0, ps: ring(ids, 2.4, rng(seed)() * 6), obs: m.obs, R: m.R, seed, phase: 'music', ends: 0, round: 0, chairs: [], lost: [] }; chairsDeal(w); return w; },
  move(w, p, i, dt) {
    if (!p.alive) return;
    const c = w.chairs.find((x) => x.by === p.id);
    if (c) { p.x = c.x; p.z = c.z; p.vx = p.vz = 0; return; }
    const z = zoneAt(w.obs, p.x, p.z);
    drive(p, w.phase === 'out' ? undefined : i, dt, { speed: 6.2, dash: true, dashCd: 2.2, zone: z });
    land(p, 0); hitScenery(w, p);
  },
  step(w, inputs, dt) {
    if (w.over) return;
    w.t += dt;
    for (const p of w.ps) chairs.move(w, p, inputs[p.id], dt);
    bumpPlayers(w);
    const sitting = new Set(w.chairs.map((c) => c.by).filter(Boolean) as string[]);
    if (w.phase === 'music' && w.t >= w.ends) {
      // the music stops: chairs pop up round the room
      const alive = w.ps.filter((p) => p.alive), n = alive.length - 1, r = rng(w.seed + w.round * 131), R = w.R ?? 9;
      for (let k = 0; k < n; k++) {
        let x = 0, z = 0;
        for (let tries = 0; tries < 60; tries++) { const a = r() * Math.PI * 2, d = 2.4 + r() * (R - 3.4); x = Math.sin(a) * d; z = Math.cos(a) * d; if (w.chairs.every((c) => Math.hypot(c.x - x, c.z - z) > 2.2) && (w.obs ?? []).every((o) => o.k === 'z' || o.k === 'd' || gap(o, x, z) > 0.9)) break; }
        w.chairs.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, by: null });
      }
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
const r2 = (x: number) => Math.round(x * 100) / 100;
/** what goes over the wire: everything but the fixed scenery, with positions rounded */
export const snap3 = (w: W3) => {
  const { obs, ...rest } = w; void obs;
  return { ...rest, t: Math.round(w.t * 1000) / 1000, ps: w.ps.map((p) => ({ ...p, x: r2(p.x), z: r2(p.z), y: r2(p.y), vx: r2(p.vx), vz: r2(p.vz), vy: r2(p.vy), face: r2(p.face), cd: r2(p.cd), dash: r2(p.dash), stun: r2(p.stun), outAt: r2(p.outAt) })) };
};
