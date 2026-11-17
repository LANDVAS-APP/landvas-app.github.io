// The real sky over a place, right now: where the sun and moon are, how much of the moon is lit, the sidereal time
// that turns the star sphere, the brightest named stars and the bright planets. Pure functions, no three.js.
//
// Sun and moon: the low-precision formulas of the Astronomical Almanac (as popularised by SunCalc), good to a fraction
// of a degree — far finer than anyone can see on a phone. Planets: JPL's "approximate positions of the major
// planets" (Keplerian elements, valid 1800–2050), good to about a degree.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

export const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;

const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));

/** local sidereal time (radians) at a longitude */
export function siderealTime(ms: number, lng: number) {
  const d = toDays(ms);
  return RAD * (280.16 + 360.9856235 * d) + lng * RAD;
}

function sunCoords(d: number) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d: number) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

export type SkyPos = {
  /** height above the horizon, radians (negative: below it) */ alt: number;
  /** compass bearing, radians clockwise from north */ az: number;
};

/** right ascension / declination (radians) → altitude and compass bearing, at a place and moment */
export function horizontal(ra: number, dec: number, ms: number, lat: number, lng: number): SkyPos {
  const H = siderealTime(ms, lng) - ra;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // (measured from the south, westwards — turned into a compass bearing)
  const fromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { alt, az: wrap(fromSouth + Math.PI) };
}
const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

export function sunPosition(ms: number, lat: number, lng: number): SkyPos {
  const c = sunCoords(toDays(ms));
  return horizontal(c.ra, c.dec, ms, lat, lng);
}

/** where the moon is, and how it's lit: `fraction` of the disc lit (0 new … 1 full); `phase` 0 new, 0.25 first
 *  quarter, 0.5 full, 0.75 last quarter */
export function moonPosition(ms: number, lat: number, lng: number): SkyPos & { fraction: number; phase: number; distKm: number } {
  const d = toDays(ms);
  const m = moonCoords(d);
  const p = horizontal(m.ra, m.dec, ms, lat, lng);
  // a little refraction near the horizon
  const h = Math.max(p.alt, 0);
  const alt = p.alt + 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
  const s = sunCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { alt, az: p.az, fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI, distKm: m.dist };
}

export function moonPhaseName(phase: number) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return 'New moon';
  if (p < 0.22) return 'Waxing crescent';
  if (p < 0.28) return 'First quarter';
  if (p < 0.47) return 'Waxing gibbous';
  if (p < 0.53) return 'Full moon';
  if (p < 0.72) return 'Waning gibbous';
  if (p < 0.78) return 'Last quarter';
  return 'Waning crescent';
}

/** how dark the sky is: 1 in full day, 0 in full night (twilight in between, by the sun's height) */
export function daylight(sunAltRad: number) {
  const deg = sunAltRad / RAD;
  return Math.max(0, Math.min(1, (deg + 9) / 15));
}

// ---- the stars ----------------------------------------------------------------------------------------------------
/** [name, RA hours, Dec degrees, magnitude, colour, light-years] — the brightest stars and the ones that draw the
 *  famous shapes (Orion, the Big Dipper, Cassiopeia, the Southern Cross…) */
export type NamedStar = { name: string; ra: number; dec: number; mag: number; color: string; ly: number; group?: string };
const S = (name: string, raH: number, raM: number, dec: number, mag: number, color: string, ly: number, group?: string): NamedStar =>
  ({ name, ra: ((raH + raM / 60) / 24) * 2 * Math.PI, dec: dec * RAD, mag, color, ly, group });
const W = '#F4F7FF', B = '#CFE0FF', Y = '#FFF4D6', O = '#FFD2A1', R = '#FFB08A';
export const NAMED_STARS: NamedStar[] = [
  S('Sirius', 6, 45.1, -16.72, -1.46, B, 8.6), S('Canopus', 6, 24.0, -52.7, -0.74, W, 310), S('Arcturus', 14, 15.7, 19.18, -0.05, O, 37),
  S('Vega', 18, 36.9, 38.78, 0.03, B, 25), S('Capella', 5, 16.7, 46.0, 0.08, Y, 43), S('Rigel', 5, 14.5, -8.2, 0.13, B, 860, 'Orion'),
  S('Procyon', 7, 39.3, 5.22, 0.34, W, 11.5), S('Betelgeuse', 5, 55.2, 7.41, 0.5, R, 550, 'Orion'), S('Achernar', 1, 37.7, -57.24, 0.46, B, 139),
  S('Hadar', 14, 3.8, -60.37, 0.61, B, 390), S('Altair', 19, 50.8, 8.87, 0.77, W, 16.7), S('Acrux', 12, 26.6, -63.1, 0.77, B, 320, 'Southern Cross'),
  S('Aldebaran', 4, 35.9, 16.51, 0.86, O, 65), S('Antares', 16, 29.4, -26.43, 1.06, R, 550), S('Spica', 13, 25.2, -11.16, 0.97, B, 250),
  S('Pollux', 7, 45.3, 28.03, 1.14, O, 34), S('Fomalhaut', 22, 57.6, -29.62, 1.16, W, 25), S('Deneb', 20, 41.4, 45.28, 1.25, W, 2600),
  S('Mimosa', 12, 47.7, -59.69, 1.25, B, 280, 'Southern Cross'), S('Regulus', 10, 8.4, 11.97, 1.35, B, 79), S('Adhara', 6, 58.6, -28.97, 1.5, B, 430),
  S('Castor', 7, 34.6, 31.89, 1.58, W, 51), S('Shaula', 17, 33.6, -37.1, 1.62, B, 570), S('Gacrux', 12, 31.2, -57.11, 1.63, R, 88, 'Southern Cross'),
  S('Bellatrix', 5, 25.1, 6.35, 1.64, B, 250, 'Orion'), S('Elnath', 5, 26.3, 28.61, 1.65, B, 130), S('Alnilam', 5, 36.2, -1.2, 1.69, B, 2000, 'Orion'),
  S('Alnitak', 5, 40.8, -1.94, 1.77, B, 1260, 'Orion'), S('Mintaka', 5, 32.0, -0.3, 2.23, B, 1200, 'Orion'), S('Saiph', 5, 47.8, -9.67, 2.09, B, 650, 'Orion'),
  S('Alioth', 12, 54.0, 55.96, 1.77, W, 81, 'Big Dipper'), S('Dubhe', 11, 3.7, 61.75, 1.79, O, 123, 'Big Dipper'), S('Alkaid', 13, 47.5, 49.31, 1.86, B, 104, 'Big Dipper'),
  S('Mizar', 13, 23.9, 54.93, 2.23, W, 83, 'Big Dipper'), S('Merak', 11, 1.8, 56.38, 2.37, W, 79, 'Big Dipper'), S('Phecda', 11, 53.8, 53.69, 2.44, W, 84, 'Big Dipper'),
  S('Megrez', 12, 15.4, 57.03, 3.31, W, 81, 'Big Dipper'), S('Mirfak', 3, 24.3, 49.86, 1.79, Y, 510), S('Wezen', 7, 8.4, -26.39, 1.83, Y, 1600),
  S('Kaus Australis', 18, 24.2, -34.38, 1.85, B, 143), S('Alhena', 6, 37.7, 16.4, 1.93, W, 109), S('Peacock', 20, 25.6, -56.74, 1.94, B, 180),
  S('Polaris', 2, 31.8, 89.26, 1.98, Y, 433), S('Mirzam', 6, 22.7, -17.96, 1.98, B, 500), S('Alphard', 9, 27.6, -8.66, 1.99, O, 177),
  S('Hamal', 2, 7.2, 23.46, 2.0, O, 66), S('Alnair', 22, 8.2, -46.96, 1.74, B, 101), S('Menkent', 14, 6.7, -36.37, 2.06, O, 59),
  S('Alpheratz', 0, 8.4, 29.09, 2.06, B, 97), S('Mirach', 1, 9.7, 35.62, 2.05, R, 197), S('Rasalhague', 17, 34.9, 12.56, 2.07, W, 49),
  S('Kochab', 14, 50.7, 74.16, 2.08, O, 131), S('Algol', 3, 8.2, 40.96, 2.12, B, 90), S('Denebola', 11, 49.1, 14.57, 2.13, W, 36),
  S('Schedar', 0, 40.5, 56.54, 2.24, O, 228, 'Cassiopeia'), S('Caph', 0, 9.2, 59.15, 2.28, W, 55, 'Cassiopeia'), S('Navi', 0, 56.7, 60.72, 2.15, B, 550, 'Cassiopeia'),
  S('Ruchbah', 1, 25.8, 60.24, 2.68, W, 99, 'Cassiopeia'), S('Segin', 1, 54.4, 63.67, 3.37, B, 410, 'Cassiopeia'), S('Atria', 16, 48.7, -69.03, 1.91, O, 391),
  S('Imai', 12, 15.1, -58.75, 2.79, B, 345, 'Southern Cross'),
];

/** the famous shapes, drawn between the named stars above */
export const CONSTELLATIONS: { name: string; lines: [string, string][] }[] = [
  { name: 'Orion', lines: [['Betelgeuse', 'Bellatrix'], ['Betelgeuse', 'Alnitak'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel']] },
  { name: 'Big Dipper', lines: [['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid']] },
  { name: 'Cassiopeia', lines: [['Caph', 'Schedar'], ['Schedar', 'Navi'], ['Navi', 'Ruchbah'], ['Ruchbah', 'Segin']] },
  { name: 'Southern Cross', lines: [['Acrux', 'Gacrux'], ['Mimosa', 'Imai']] },
];

/** a unit vector in the equatorial frame (x → RA 0h, z → the north celestial pole) */
export function equatorial(ra: number, dec: number): [number, number, number] {
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/**
 * The matrix (column-major, 4×4, for three.js) that turns the equatorial frame into the local sky: x east, y up,
 * z south (so −z is north). Put the star sphere under it and every star stands where it really is.
 */
export function skyMatrix(ms: number, lat: number, lng: number): number[] {
  const lst = siderealTime(ms, lng);
  const phi = lat * RAD;
  const c = Math.cos(-lst), s = Math.sin(-lst);
  // B: the meridian's equator point Q = (0, cos φ, sin φ), east E = (1, 0, 0), the pole P = (0, sin φ, −cos φ)
  const Q = [0, Math.cos(phi), Math.sin(phi)], E = [1, 0, 0], P = [0, Math.sin(phi), -Math.cos(phi)];
  // M = B · Rz(−lst): columns are B·(c, s, 0), B·(−s, c, 0), B·(0, 0, 1)
  const col = (x: number, y: number, z: number) => [Q[0] * x + E[0] * y + P[0] * z, Q[1] * x + E[1] * y + P[1] * z, Q[2] * x + E[2] * y + P[2] * z];
  const a = col(c, s, 0), b = col(-s, c, 0), d = col(0, 0, 1);
  return [a[0], a[1], a[2], 0, b[0], b[1], b[2], 0, d[0], d[1], d[2], 0, 0, 0, 0, 1];
}

/** a direction in the local sky (x east, y up, z south) from altitude and compass bearing */
export function skyDir(p: SkyPos): [number, number, number] {
  const ca = Math.cos(p.alt);
  return [ca * Math.sin(p.az), Math.sin(p.alt), -ca * Math.cos(p.az)];
}

// ---- the Milky Way: faint stars crowding the galactic plane -----------------------------------------------------------
// the galactic frame in equatorial coordinates (J2000): the north galactic pole and the galactic centre
const NGP = equatorial(192.85948 * RAD, 27.12825 * RAD);
const GC0 = equatorial(266.40499 * RAD, -28.93617 * RAD);
export function galactic(l: number, b: number): [number, number, number] {
  // make the centre direction exactly perpendicular to the pole
  const dot = GC0[0] * NGP[0] + GC0[1] * NGP[1] + GC0[2] * NGP[2];
  const gx = [GC0[0] - dot * NGP[0], GC0[1] - dot * NGP[1], GC0[2] - dot * NGP[2]];
  const n = Math.hypot(gx[0], gx[1], gx[2]);
  gx[0] /= n; gx[1] /= n; gx[2] /= n;
  const gy = [NGP[1] * gx[2] - NGP[2] * gx[1], NGP[2] * gx[0] - NGP[0] * gx[2], NGP[0] * gx[1] - NGP[1] * gx[0]];
  const cb = Math.cos(b);
  return [0, 1, 2].map((i) => cb * Math.cos(l) * gx[i] + cb * Math.sin(l) * gy[i] + Math.sin(b) * NGP[i]) as [number, number, number];
}

// ---- the planets ------------------------------------------------------------------------------------------------------
type Elements = [number, number, number, number, number, number]; // a (au), e, I, L, long. of perihelion, long. of node (deg)
const PLANET_EL: Record<string, [Elements, Elements]> = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};
function helio(name: string, T: number): [number, number, number] {
  const [el0, rate] = PLANET_EL[name];
  const [a, e, I, L, wbar, node] = el0.map((v, i) => v + rate[i] * T);
  const w = (wbar - node) * RAD;
  const M = ((L - wbar) % 360) * RAD;
  // Kepler's equation
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const O = node * RAD, i = I * RAD;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}
export type Planet = { name: string; ra: number; dec: number; mag: number; color: string };
const PLANET_LOOK: Record<string, { name: string; mag: number; color: string }> = {
  mercury: { name: 'Mercury', mag: 0, color: '#E8DCCB' }, venus: { name: 'Venus', mag: -4.2, color: '#FFF8E6' },
  mars: { name: 'Mars', mag: 0.6, color: '#FF9C6B' }, jupiter: { name: 'Jupiter', mag: -2.4, color: '#FFF0D6' }, saturn: { name: 'Saturn', mag: 0.6, color: '#FFE7B0' },
};
/** where the bright planets are on the sky (RA/Dec, radians) */
export function planets(ms: number): Planet[] {
  const T = (toDays(ms)) / 36525; // centuries from J2000
  const earth = helio('earth', T);
  const eps = 23.43928 * RAD;
  return Object.keys(PLANET_LOOK).map((k) => {
    const p = helio(k, T);
    const x = p[0] - earth[0], y = p[1] - earth[1], z = p[2] - earth[2];
    // ecliptic → equatorial
    const xe = x, ye = y * Math.cos(eps) - z * Math.sin(eps), ze = y * Math.sin(eps) + z * Math.cos(eps);
    return { ...PLANET_LOOK[k], ra: Math.atan2(ye, xe), dec: Math.atan2(ze, Math.hypot(xe, ye)) };
  });
}

/** a compass bearing as words: N, NE, E… */
export function bearingName(rad: number) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(wrap(rad) / (Math.PI / 4)) % 8];
}
