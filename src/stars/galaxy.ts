// ✨ Skywright: the galaxy. About 86 billion stars, every one of them made from one seed (nothing is stored until a
// star is claimed), plus the ~5,000 real stars you can see with your eyes, at their real places.
//
// The sky is cut into tiles on a cube wrapped round the sky (6 faces). Each zoom tier (naked eye, binoculars,
// telescope, deep field, ultra deep, the far galaxy) has its own finer tiling, and each tile holds a few stars of that
// tier: their number, place, brightness and kind all come from a hash of the tile, so the phone and the database work
// out exactly the same stars (the same hash is in SQL: private.sw_mix / private.sw_hash, migration "skywright_core").
//
// A star's id (a whole number under 2^44):
//   tier 0 (real stars):  its Hipparcos number
//   tiers 1–5:            ((tier·8 + face)·2^17 + i)·2^17 + j)·16 + k   — tile (face, i, j), the k-th star in it

export const SEED = 0x5ca1ab1e;
export const TWO17 = 131072;
const TILE_SPAN = TWO17 * TWO17 * 16; // ids per (tier, face)

/** one round of the integer hash (the same in SQL: private.sw_mix) */
export function mix(v: number): number {
  let x = v >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x68e31da5) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}
/** the hash of a few whole numbers (each 0 … 2^32−1) */
export function hash(...vals: number[]): number {
  let x = SEED >>> 0;
  for (const v of vals) x = mix((x ^ (v >>> 0)) >>> 0);
  return x;
}
/** …as a number in [0, 1) */
export const h01 = (...vals: number[]) => hash(...vals) / 4294967296;

// ---- the zoom tiers ---------------------------------------------------------------------------------------------------
export type Tier = { t: number; name: string; short: string; n: number; mean: number; magLo: number; magHi: number;
  /** the view's width (degrees) at which this tier's stars start to show (and are all there by half of it) */ fov: number;
  /** how far its stars are (light-years) */ ly: [number, number]; zoom: string };
export const TIERS: Tier[] = [
  { t: 0, name: 'Naked eye', short: 'Eye', n: 0, mean: 0, magLo: -1.5, magHi: 6.5, fov: 180, ly: [4, 2600], zoom: '×1' },
  { t: 1, name: 'Binoculars', short: 'Binoculars', n: 64, mean: 3.4, magLo: 6.5, magHi: 9, fov: 26, ly: [60, 900], zoom: '×7' },
  { t: 2, name: 'Telescope', short: 'Telescope', n: 256, mean: 5, magLo: 9, magHi: 12, fov: 6, ly: [400, 4000], zoom: '×30' },
  { t: 3, name: 'Deep field', short: 'Deep field', n: 2048, mean: 3.6, magLo: 12, magHi: 16, fov: 1.2, ly: [2500, 18000], zoom: '×150' },
  { t: 4, name: 'Ultra deep', short: 'Ultra deep', n: 16384, mean: 2, magLo: 16, magHi: 21, fov: 0.18, ly: [12000, 52000], zoom: '×1,000' },
  { t: 5, name: 'The far galaxy', short: 'Far galaxy', n: 131072, mean: 0.8, magLo: 21, magHi: 26, fov: 0.03, ly: [30000, 95000], zoom: '×6,000' },
];
/** how many stars there are in all (roughly: the generated tiers are counted by their mean) */
export const GALAXY_SIZE = 5044 + TIERS.slice(1).reduce((a, t) => a + 6 * t.n * t.n * t.mean, 0);
/** the most stars a tile can hold */
export const tileMax = (t: number) => Math.min(15, Math.floor(2 * TIERS[t].mean));
/** how many stars tile (face, i, j) of tier t holds (the same in SQL: private.sw_tile_count) */
export function tileCount(t: number, face: number, i: number, j: number): number {
  const T = TIERS[t];
  if (!T || t < 1) return 0;
  return Math.min(tileMax(t), Math.floor(h01(t * 8 + face, i, j, 7) * (2 * T.mean + 1)));
}

// ---- ids ------------------------------------------------------------------------------------------------------------
export type StarRef = { id: number; tier: number; face: number; i: number; j: number; k: number };
export function starId(tier: number, face: number, i: number, j: number, k: number): number {
  return ((tier * 8 + face) * TWO17 + i) * TWO17 * 16 + j * 16 + k;
}
export function decodeId(id: number): StarRef {
  const tf = Math.floor(id / TILE_SPAN);
  const tier = Math.floor(tf / 8);
  if (tier === 0) return { id, tier: 0, face: 0, i: 0, j: 0, k: 0 };
  const rest = id - tf * TILE_SPAN;
  const i = Math.floor(rest / (TWO17 * 16));
  const r2 = rest - i * TWO17 * 16;
  return { id, tier, face: tf % 8, i, j: Math.floor(r2 / 16), k: r2 % 16 };
}
export const tierOf = (id: number) => Math.floor(Math.floor(id / TILE_SPAN) / 8);
/** a star's catalogue code: LV-<tier><letters> (base 36), e.g. LV-3K9F2QX */
export function starCode(id: number): string {
  if (tierOf(id) === 0) return `HIP ${id}`;
  return `LV-${id.toString(36).toUpperCase()}`;
}

// ---- the cube on the sky ------------------------------------------------------------------------------------------------
type V3 = [number, number, number];
const Q = Math.PI / 4;
/** a point (u, v in −1…1, already warped) on a face, as a direction (equatorial frame, unit length) */
function faceDir(face: number, u: number, v: number): V3 {
  let x: number, y: number, z: number;
  switch (face) {
    case 0: x = 1; y = v; z = -u; break;
    case 1: x = -1; y = v; z = u; break;
    case 2: x = u; y = 1; z = -v; break;
    case 3: x = u; y = -1; z = v; break;
    case 4: x = u; y = v; z = 1; break;
    default: x = -u; y = v; z = -1;
  }
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
/** the direction at (s, t) in 0…1 across a face (the tangent warp keeps tiles near the same size) */
export function cubeDir(face: number, s: number, t: number): V3 {
  return faceDir(face, Math.tan((s * 2 - 1) * Q), Math.tan((t * 2 - 1) * Q));
}
/** which face a direction falls on, and where across it (s, t in 0…1) */
export function dirToCube(d: V3): { face: number; s: number; t: number } {
  const [x, y, z] = d, ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let face: number, u: number, v: number;
  if (ax >= ay && ax >= az) { if (x > 0) { face = 0; u = -z / x; v = y / x; } else { face = 1; u = z / -x; v = y / -x; } }
  else if (ay >= az) { if (y > 0) { face = 2; u = x / y; v = -z / y; } else { face = 3; u = x / -y; v = z / -y; } }
  else if (z > 0) { face = 4; u = x / z; v = y / z; }
  else { face = 5; u = -x / -z; v = y / -z; }
  return { face, s: (Math.atan(u) / Q + 1) / 2, t: (Math.atan(v) / Q + 1) / 2 };
}

// ---- the kinds of star --------------------------------------------------------------------------------------------------
export type StarClassId = 'neutron' | 'white_dwarf' | 'red_dwarf' | 'orange' | 'yellow' | 'white' | 'blue' | 'red_giant' | 'supergiant' | 'hypergiant' | 'black_hole';
export type StarClass = {
  id: StarClassId; name: string; emoji: string;
  /** the shell's frequency: it holds 10·m² + 2 plots (12 of them Keystones) */ m: number;
  /** out of 100,000 generated stars */ weight: number;
  color: string; glow: string;
  /** how bright it really is (absolute magnitude), for its distance from its brightness */ absMag: number;
  /** light colour (for the Lumen Grove): red, orange, yellow, white, blue */ light: 'red' | 'orange' | 'yellow' | 'white' | 'blue';
  /** what's special about it */ blurb: string;
  /** how far up the element ladder its core can fuse (0 hydrogen … 5 iron) */ fuse: number;
};
export const CLASSES: StarClass[] = [
  { id: 'neutron', name: 'Neutron star', emoji: '💫', m: 1, weight: 300, color: '#CFEFFF', glow: '#7FD8FF', absMag: 8, light: 'blue', fuse: 5,
    blurb: 'A city-sized cinder spinning hundreds of times a second. Its beam sweeps past like a lighthouse: just 12 plots, every one a Keystone.' },
  { id: 'white_dwarf', name: 'White dwarf', emoji: '🤍', m: 2, weight: 760, color: '#EEF4FF', glow: '#C9DBFF', absMag: 11, light: 'white', fuse: 2,
    blurb: 'The glowing core a sun-like star leaves behind: Earth-sized, white-hot, and slowly cooling.' },
  { id: 'red_dwarf', name: 'Red dwarf', emoji: '🔴', m: 3, weight: 70200, color: '#FF8A5C', glow: '#FFB08A', absMag: 10, light: 'red', fuse: 1,
    blurb: 'The commonest star there is: small, cool and long-lived — and it flares.' },
  { id: 'orange', name: 'Orange dwarf', emoji: '🟠', m: 5, weight: 12000, color: '#FFB46B', glow: '#FFD2A1', absMag: 6.5, light: 'orange', fuse: 1,
    blurb: 'A calm, steady star a little smaller than the Sun.' },
  { id: 'yellow', name: 'Sun-like star', emoji: '🌞', m: 10, weight: 8000, color: '#FFE7A0', glow: '#FFF4D6', absMag: 4.8, light: 'yellow', fuse: 2,
    blurb: 'A star like our own Sun.' },
  { id: 'white', name: 'White star', emoji: '⚪', m: 18, weight: 5000, color: '#F4F7FF', glow: '#FFFFFF', absMag: 1.5, light: 'white', fuse: 3,
    blurb: 'Hotter and bigger than the Sun, burning bright white.' },
  { id: 'blue', name: 'Blue giant', emoji: '🔵', m: 32, weight: 2200, color: '#9DC4FF', glow: '#CFE0FF', absMag: -2, light: 'blue', fuse: 4,
    blurb: 'Huge, scorching and short-lived: a blue giant burns through its fuel in a few million years.' },
  { id: 'red_giant', name: 'Red giant', emoji: '🟥', m: 32, weight: 1300, color: '#FF7A4D', glow: '#FFB08A', absMag: -0.5, light: 'red', fuse: 3,
    blurb: 'An old star swollen to a hundred times its size, fusing heavier elements in its core.' },
  { id: 'supergiant', name: 'Supergiant', emoji: '🌟', m: 100, weight: 180, color: '#FFD9A8', glow: '#FFF0D0', absMag: -6, light: 'orange', fuse: 5,
    blurb: 'One of the biggest stars there is. One day it will go supernova.' },
  { id: 'hypergiant', name: 'Hypergiant', emoji: '☀️', m: 1000, weight: 20, color: '#FFF0E0', glow: '#FFFFFF', absMag: -8.5, light: 'white', fuse: 5,
    blurb: 'Vast beyond belief: ten million plots wrapped round a single star.' },
  { id: 'black_hole', name: 'Black hole', emoji: '🕳️', m: 10, weight: 40, color: '#1A1030', glow: '#FFB45C', absMag: 30, light: 'blue', fuse: 0,
    blurb: 'Invisible: you find one by the way it bends the stars behind it. Time runs fast near it — your enchantments feel it.' },
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<StarClassId, StarClass>;
/** how many plots a shell of frequency m holds */
export const shellCells = (m: number) => 10 * m * m + 2;

/** a generated star's kind (the same in SQL: private.sw_class) */
export function genClass(id: number): StarClassId {
  const r = decodeId(id);
  const roll = Math.floor(h01(r.tier * 8 + r.face, r.i, r.j, r.k, 11) * 100000);
  let acc = 0;
  for (const c of CLASSES) { acc += c.weight; if (roll < acc) return c.id; }
  return 'red_dwarf';
}

// ---- the real stars -----------------------------------------------------------------------------------------------------
/** [hip, ra (millidegrees), dec (millidegrees), mag (×100), B−V (×1000), constellation index, name] */
export type RealRow = [number, number, number, number, number, number, string];
export type RealCatalog = { cons: [string, string][]; stars: RealRow[] };
/** the real stars a few names are known for (their kind, and how far they are) */
const KNOWN: Record<string, { cls?: StarClassId; ly?: number }> = {
  Sirius: { cls: 'white', ly: 8.6 }, Canopus: { cls: 'supergiant', ly: 310 }, Arcturus: { cls: 'red_giant', ly: 37 }, 'Rigil Kentaurus': { cls: 'yellow', ly: 4.4 },
  Vega: { cls: 'white', ly: 25 }, Capella: { cls: 'red_giant', ly: 43 }, Rigel: { cls: 'supergiant', ly: 860 }, Procyon: { cls: 'white', ly: 11.5 },
  Achernar: { cls: 'blue', ly: 139 }, Betelgeuse: { cls: 'supergiant', ly: 550 }, Hadar: { cls: 'blue', ly: 390 }, Altair: { cls: 'white', ly: 16.7 },
  Acrux: { cls: 'blue', ly: 320 }, Aldebaran: { cls: 'red_giant', ly: 65 }, Antares: { cls: 'supergiant', ly: 550 }, Spica: { cls: 'blue', ly: 250 },
  Pollux: { cls: 'red_giant', ly: 34 }, Fomalhaut: { cls: 'white', ly: 25 }, Deneb: { cls: 'supergiant', ly: 2600 }, Mimosa: { cls: 'blue', ly: 280 },
  Regulus: { cls: 'blue', ly: 79 }, Adhara: { cls: 'blue', ly: 430 }, Castor: { cls: 'white', ly: 51 }, Gacrux: { cls: 'red_giant', ly: 88 },
  Shaula: { cls: 'blue', ly: 570 }, Bellatrix: { cls: 'blue', ly: 250 }, Elnath: { cls: 'blue', ly: 130 }, Alnilam: { cls: 'supergiant', ly: 2000 },
  Alnitak: { cls: 'supergiant', ly: 1260 }, Mintaka: { cls: 'supergiant', ly: 1200 }, Saiph: { cls: 'supergiant', ly: 650 }, Polaris: { cls: 'supergiant', ly: 430 },
  Mirfak: { cls: 'supergiant', ly: 510 }, Wezen: { cls: 'supergiant', ly: 1600 }, Aludra: { cls: 'supergiant', ly: 2000 }, Enif: { cls: 'supergiant', ly: 690 },
  Sadr: { cls: 'supergiant', ly: 1800 }, 'Proxima Centauri': { cls: 'red_dwarf', ly: 4.24 }, 'ρ Cas': { cls: 'hypergiant', ly: 3400 },
};
/** a real star's kind from its colour (and a few known ones), the same in SQL (private.sw_real_class) */
export function realClass(name: string, bvMilli: number): StarClassId {
  const k = KNOWN[name]?.cls;
  if (k) return k;
  if (bvMilli < 0) return 'blue';
  if (bvMilli < 300) return 'white';
  if (bvMilli < 650) return 'yellow';
  if (bvMilli < 1000) return 'orange';
  return 'red_giant';
}

// ---- a star, all of it --------------------------------------------------------------------------------------------------
export type Star = {
  id: number; tier: number; code: string; name: string;
  /** direction in the equatorial frame (unit) */ dir: V3; ra: number; dec: number;
  mag: number; cls: StarClassId; m: number; cells: number; ly: number;
  /** its own spin: one turn in this many hours */ spinH: number;
  /** the constellation it's in (real stars) */ con: string | null;
  binary: boolean;
};
const RAD = Math.PI / 180;
const lyFrom = (mag: number, abs: number) => Math.max(4, Math.round(10 ** ((mag - abs + 5) / 5) * 3.2616));

/** a generated star (tile (face, i, j) of tier t, k-th in it) — or null if the tile holds fewer */
export function genStar(t: number, face: number, i: number, j: number, k: number): Star | null {
  if (t < 1 || t > 5 || face < 0 || face > 5 || i < 0 || j < 0 || i >= TIERS[t].n || j >= TIERS[t].n) return null;
  if (k < 0 || k >= tileCount(t, face, i, j)) return null;
  const T = TIERS[t], N = T.n;
  const id = starId(t, face, i, j, k);
  const fx = h01(t * 8 + face, i, j, k, 1), fy = h01(t * 8 + face, i, j, k, 2);
  const dir = cubeDir(face, (i + fx) / N, (j + fy) / N);
  const cls = genClass(id);
  const C = CLASS_BY_ID[cls];
  const b = h01(t * 8 + face, i, j, k, 3);
  const mag = T.magHi - (T.magHi - T.magLo) * b * b;
  const ly = Math.round(T.ly[0] + (T.ly[1] - T.ly[0]) * h01(t * 8 + face, i, j, k, 4));
  return {
    id, tier: t, code: starCode(id), name: starCode(id), dir, ra: Math.atan2(dir[1], dir[0]), dec: Math.asin(dir[2]),
    mag, cls, m: C.m, cells: shellCells(C.m), ly, spinH: 18 + Math.floor(h01(t * 8 + face, i, j, k, 5) * 30), con: null,
    binary: cls !== 'black_hole' && cls !== 'neutron' && h01(t * 8 + face, i, j, k, 6) < 0.08,
  };
}
/** a real star from its catalogue row */
export function realStar(r: RealRow, cat: RealCatalog): Star {
  const [hip, raM, decM, magC, bv, con, name] = r;
  const ra = (raM / 1000) * RAD, dec = (decM / 1000) * RAD;
  const cls = realClass(name, bv);
  const C = CLASS_BY_ID[cls];
  const mag = magC / 100;
  return {
    id: hip, tier: 0, code: `HIP ${hip}`, name: name || `HIP ${hip}`, dir: [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)], ra, dec,
    mag, cls, m: C.m, cells: shellCells(C.m), ly: KNOWN[name]?.ly ?? lyFrom(mag, C.absMag), spinH: 18 + (hip % 30), con: con >= 0 ? cat.cons[con]?.[1] ?? null : null,
    binary: false,
  };
}
/** every star in a tile */
export function tileStars(t: number, face: number, i: number, j: number): Star[] {
  const out: Star[] = [];
  const n = tileCount(t, face, i, j);
  for (let k = 0; k < n; k++) { const s = genStar(t, face, i, j, k); if (s) out.push(s); }
  return out;
}
/** any star by its id (real stars need the catalogue) */
export function starById(id: number, cat?: RealCatalog | null): Star | null {
  const r = decodeId(id);
  if (r.tier === 0) {
    const row = cat?.stars.find((x) => x[0] === id);
    return row && cat ? realStar(row, cat) : null;
  }
  return genStar(r.tier, r.face, r.i, r.j, r.k);
}

/**
 * The tiles of tier t that a view cone (centre direction, half-angle in radians) touches: [face, i, j] each.
 * (Worked out by projecting points round the cone's edge onto the cube; capped, so a huge view of a fine tier
 * doesn't list millions.)
 */
export function tilesInCone(t: number, c: V3, half: number, cap = 2500): [number, number, number][] {
  const N = TIERS[t].n;
  if (!N) return [];
  // a frame round the centre
  const up: V3 = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(up, c)), e2 = cross(c, e1);
  const per = new Map<number, { s0: number; s1: number; t0: number; t1: number }>();
  const add = (d: V3) => {
    const p = dirToCube(d);
    const b = per.get(p.face) ?? { s0: 1, s1: 0, t0: 1, t1: 0 };
    b.s0 = Math.min(b.s0, p.s); b.s1 = Math.max(b.s1, p.s); b.t0 = Math.min(b.t0, p.t); b.t1 = Math.max(b.t1, p.t);
    per.set(p.face, b);
  };
  add(c);
  for (const r of [half * 0.5, half]) for (let a = 0; a < 24; a++) {
    const th = (a / 24) * Math.PI * 2, sr = Math.sin(r), cr = Math.cos(r);
    add(norm([c[0] * cr + (e1[0] * Math.cos(th) + e2[0] * Math.sin(th)) * sr, c[1] * cr + (e1[1] * Math.cos(th) + e2[1] * Math.sin(th)) * sr, c[2] * cr + (e1[2] * Math.cos(th) + e2[2] * Math.sin(th)) * sr]));
  }
  const out: [number, number, number][] = [];
  const cosLim = Math.cos(half + (Math.PI / 2 / N) * 1.6);
  for (const [face, b] of per) {
    const i0 = Math.max(0, Math.floor(b.s0 * N) - 1), i1 = Math.min(N - 1, Math.floor(b.s1 * N) + 1);
    const j0 = Math.max(0, Math.floor(b.t0 * N) - 1), j1 = Math.min(N - 1, Math.floor(b.t1 * N) + 1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const d = cubeDir(face, (i + 0.5) / N, (j + 0.5) / N);
      if (d[0] * c[0] + d[1] * c[1] + d[2] * c[2] < cosLim) continue;
      out.push([face, i, j]);
      if (out.length >= cap) return out;
    }
  }
  return out;
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- the real catalogue (loaded when the sky's first looked at) -----------------------------------------------------------
let catP: Promise<RealCatalog> | null = null;
export function loadCatalog(): Promise<RealCatalog> {
  catP ??= import('./realStars.json').then((m) => (m.default ?? m) as unknown as RealCatalog);
  return catP;
}

/** which tier a view this wide (degrees) has reached */
export function tierForFov(fovDeg: number): number {
  let t = 0;
  for (const T of TIERS) if (fovDeg <= T.fov) t = T.t;
  return t;
}
/** how much of a tier's stars show at this width (0 … 1): they fade in as you zoom from its fov to half of it */
export function tierFade(t: number, fovDeg: number): number {
  if (t === 0) return 1;
  const f = TIERS[t].fov;
  return Math.max(0, Math.min(1, (f - fovDeg) / (f * 0.5)));
}
