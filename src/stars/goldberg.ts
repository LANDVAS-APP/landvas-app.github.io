// A star's shell: a Goldberg polyhedron GP(m, 0) — a ball of hexagons with exactly 12 pentagons, whatever its size
// (that's geometry, not a game rule). It's the dual of an icosahedron whose 20 faces are each cut into m² triangles:
// every corner of that mesh is one plot. It holds 10·m² + 2 plots:
//   ids 0–11                the 12 pentagons (the icosahedron's own corners): the Keystones
//   12 … 12 + 30(m−1) − 1    the corners along the icosahedron's 30 edges
//   the rest                the corners inside its 20 faces
// Only the plots near you are ever built (a hypergiant has ten million): `patch` makes the cells within reach of a
// direction, `cellAt` finds the plot under a direction, `cellCenter` where a plot is.
export type V3 = [number, number, number];

const PHI = (1 + Math.sqrt(5)) / 2;
const nrm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const ICO_V: V3[] = ([
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
] as V3[]).map(nrm);
export const ICO_F: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];
const EDGES: [number, number][] = (() => {
  const s = new Set<string>(), out: [number, number][] = [];
  for (const f of ICO_F) for (let e = 0; e < 3; e++) {
    const a = Math.min(f[e], f[(e + 1) % 3]), b = Math.max(f[e], f[(e + 1) % 3]);
    if (!s.has(`${a}_${b}`)) { s.add(`${a}_${b}`); out.push([a, b]); }
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
})();
const EDGE_AT = new Map(EDGES.map(([a, b], i) => [a * 12 + b, i]));
const FACE_C: V3[] = ICO_F.map(([a, b, c]) => nrm([ICO_V[a][0] + ICO_V[b][0] + ICO_V[c][0], ICO_V[a][1] + ICO_V[b][1] + ICO_V[c][1], ICO_V[a][2] + ICO_V[b][2] + ICO_V[c][2]]));
/** the angle across one icosahedron edge */
export const ICO_EDGE_ANGLE = Math.acos(dot(ICO_V[0], ICO_V[11]));

export const cellCount = (m: number) => 10 * m * m + 2;
export const isKeystone = (cell: number) => cell >= 0 && cell < 12;
/** the angle between two neighbouring plots' centres (roughly) */
export const cellAngle = (m: number) => ICO_EDGE_ANGLE / m;

/** the canonical id of lattice point (a, b) on face f: P = ((m−a−b)·A + a·B + b·C) / m */
export function latticeId(m: number, f: number, a: number, b: number): number {
  const [A, B, C] = ICO_F[f];
  const i = m - a - b, j = a, k = b;
  if (i === m) return A;
  if (j === m) return B;
  if (k === m) return C;
  const edge = (p: number, q: number, s: number) => {
    const lo = Math.min(p, q), hi = Math.max(p, q), t = p < q ? s : m - s;
    return 12 + EDGE_AT.get(lo * 12 + hi)! * (m - 1) + (t - 1);
  };
  if (k === 0) return edge(A, B, j);
  if (i === 0) return edge(B, C, k);
  if (j === 0) return edge(C, A, i);
  // inside the face: rows by a (1 … m−2), each row's b (1 … m−1−a)
  const T = ((m - 1) * (m - 2)) / 2;
  const before = (a - 1) * (m - 2) - ((a - 1) * (a - 2)) / 2;
  return 12 + 30 * (m - 1) + f * T + before + (b - 1);
}
/** the point (unit vector) of lattice (a, b) on face f */
export function latticeDir(m: number, f: number, a: number, b: number): V3 {
  const [A, B, C] = ICO_F[f].map((x) => ICO_V[x]);
  const i = m - a - b;
  return nrm([i * A[0] + a * B[0] + b * C[0], i * A[1] + a * B[1] + b * C[1], i * A[2] + a * B[2] + b * C[2]]);
}
/** where a plot is (unit vector from the star's centre) */
export function cellCenter(m: number, id: number): V3 {
  if (id < 12) return ICO_V[id];
  const E = 30 * (m - 1);
  if (id < 12 + E) {
    const e = Math.floor((id - 12) / (m - 1)), t = (id - 12) % (m - 1) + 1;
    const [a, b] = EDGES[e];
    const A = ICO_V[a], B = ICO_V[b];
    return nrm([(m - t) * A[0] + t * B[0], (m - t) * A[1] + t * B[1], (m - t) * A[2] + t * B[2]]);
  }
  const T = ((m - 1) * (m - 2)) / 2;
  const r = id - 12 - E, f = Math.floor(r / T);
  let idx = r - f * T, a = 1;
  while (idx >= m - 1 - a) { idx -= m - 1 - a; a++; }
  return latticeDir(m, f, a, idx + 1);
}
/** a direction's barycentric spot on a face (its gnomonic projection), or null when it's behind it */
function faceBary(f: number, d: V3): [number, number, number] | null {
  const [A, B, C] = ICO_F[f].map((x) => ICO_V[x]);
  // solve d = x A + y B + z C (Cramer's rule)
  const det = dot(A, cross(B, C));
  const x = dot(d, cross(B, C)) / det, y = dot(A, cross(d, C)) / det, z = dot(A, cross(B, d)) / det;
  const s = x + y + z;
  if (s <= 0) return null;
  return [x / s, y / s, z / s];
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** the plot under a direction (the one whose centre is nearest it) */
export function cellAt(m: number, d0: V3): number {
  const d = nrm(d0);
  let best = -1, bestDot = -2;
  for (let f = 0; f < 20; f++) {
    if (dot(d, FACE_C[f]) < 0.55) continue;
    const bc = faceBary(f, d);
    if (!bc || bc[0] < -0.08 || bc[1] < -0.08 || bc[2] < -0.08) continue;
    const ga = bc[1] * m, gb = bc[2] * m;
    const a0 = Math.floor(ga), b0 = Math.floor(gb);
    for (let da = -1; da <= 2; da++) for (let db = -1; db <= 2; db++) {
      const a = a0 + da, b = b0 + db;
      if (a < 0 || b < 0 || a + b > m) continue;
      const p = latticeDir(m, f, a, b), k = dot(p, d);
      if (k > bestDot) { bestDot = k; best = latticeId(m, f, a, b); }
    }
  }
  return best;
}

export type Cell = { id: number; c: V3; corners: V3[]; nbrs: number[]; keystone: boolean };
/**
 * The plots within `reach` radians of direction d (all of them when the shell is small enough), each with its
 * corners (in order round it) and its neighbours. Corners are the centres of the triangles round the plot.
 */
export function patch(m: number, d0: V3, reach = Math.PI): Cell[] {
  const d = nrm(d0);
  const all = reach >= Math.PI - 1e-6;
  const cosR = Math.cos(Math.min(Math.PI, reach + cellAngle(m) * 2));
  const tris = new Map<number, { corners: { at: V3; ang?: number }[]; nb: Set<number> }>();
  const touch = (id: number) => { let t = tris.get(id); if (!t) { t = { corners: [], nb: new Set() }; tris.set(id, t); } return t; };
  const steps = all ? m : Math.ceil(reach / cellAngle(m)) + 3;
  for (let f = 0; f < 20; f++) {
    if (!all && dot(d, FACE_C[f]) < Math.cos(Math.min(Math.PI, reach + ICO_EDGE_ANGLE * 0.75))) continue;
    let a0 = 0, a1 = m, b0 = 0, b1 = m;
    if (!all) {
      const bc = faceBary(f, d);
      if (!bc) continue;
      const ga = bc[1] * m, gb = bc[2] * m;
      a0 = Math.max(0, Math.floor(ga) - steps); a1 = Math.min(m, Math.ceil(ga) + steps);
      b0 = Math.max(0, Math.floor(gb) - steps); b1 = Math.min(m, Math.ceil(gb) + steps);
    }
    const tri = (p: [number, number][]) => {
      const ids = p.map(([a, b]) => latticeId(m, f, a, b));
      const ps = p.map(([a, b]) => latticeDir(m, f, a, b));
      const c = nrm([ps[0][0] + ps[1][0] + ps[2][0], ps[0][1] + ps[1][1] + ps[2][1], ps[0][2] + ps[1][2] + ps[2][2]]);
      if (!all && dot(c, d) < cosR) return;
      for (let q = 0; q < 3; q++) {
        const t = touch(ids[q]);
        t.corners.push({ at: c });
        t.nb.add(ids[(q + 1) % 3]); t.nb.add(ids[(q + 2) % 3]);
      }
    };
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
      if (a + b <= m - 1 && a + 1 <= a1 + 1 && b + 1 <= b1 + 1) tri([[a, b], [a + 1, b], [a, b + 1]]);
      if (a + b <= m - 2) tri([[a + 1, b], [a + 1, b + 1], [a, b + 1]]);
    }
  }
  const out: Cell[] = [];
  for (const [id, t] of tris) {
    const keystone = id < 12;
    const need = keystone ? 5 : 6;
    // (a plot at the patch's edge is missing some of its triangles: it isn't built till it's whole)
    const uniq: V3[] = [];
    for (const c of t.corners) if (!uniq.some((u) => Math.abs(u[0] - c.at[0]) + Math.abs(u[1] - c.at[1]) + Math.abs(u[2] - c.at[2]) < 1e-9)) uniq.push(c.at);
    if (uniq.length < need) continue;
    const c = cellCenter(m, id);
    if (!all && dot(c, d) < Math.cos(reach)) continue;
    // corners in order round the plot
    const up: V3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = nrm(cross(up, c)), e2 = cross(c, e1);
    uniq.sort((p, q) => Math.atan2(dot(p, e2), dot(p, e1)) - Math.atan2(dot(q, e2), dot(q, e1)));
    out.push({ id, c, corners: uniq, nbrs: [...t.nb], keystone });
  }
  return out;
}

/** a plot's place as the star's own latitude and longitude (for its art: the star's painting is a flat map of it) */
export function dirToUv(d: V3): [number, number] {
  const lon = Math.atan2(d[0], d[2]), lat = Math.asin(Math.max(-1, Math.min(1, d[1])));
  return [lon / (2 * Math.PI) + 0.5, lat / Math.PI + 0.5];
}
export function uvToDir(u: number, v: number): V3 {
  const lon = (u - 0.5) * 2 * Math.PI, lat = (v - 0.5) * Math.PI;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}
/** how big the shell is (m from the star's centre): its plots are about 16 m across, like a small square of Earth plots */
export const shellRadius = (m: number) => (16 * m) / ICO_EDGE_ANGLE;
