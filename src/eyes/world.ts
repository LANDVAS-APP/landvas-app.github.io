// The real place around your explorer, built for the first-person view from the same open data as the map:
//  * streets, water, parks, land use and building footprints from the OpenMapTiles vector tiles (OpenFreeMap),
//    painted into ground textures (a sharp one at your feet, a softer one out to the edge of town);
//  * the buildings themselves, extruded to their real heights (towers on the skyline further out);
//  * trees scattered through woods and parks;
//  * real elevation (AWS Terrain Tiles) for the land out to the horizon, so mountains stand where they really are.
// Everything is plain data (typed arrays, canvases) — the scene turns it into meshes.
import { ShapeUtils, Vector2 } from 'three';
import { config } from '../env';
import { decodeTile, maybeGunzip, polygons, type MvtFeature, type MvtLayer } from './mvt';
import { curveDrop, worldToLocal, type Frame } from './geo';
import type { streetPalette } from '../map/basemap';

export type Palette = ReturnType<typeof streetPalette>;
export type Tile = { z: number; x: number; y: number; layers: Record<string, MvtLayer> };
export type Region = { x0: number; z0: number; size: number };

// ---- tiles ----------------------------------------------------------------------------------------------------------
type Source = { template: string; maxzoom: number };
let source: Promise<Source | null> | null = null;
/** the vector tiles' address template, from the TileJSON (OpenFreeMap versions its tiles) */
export function streetsSource(): Promise<Source | null> {
  if (!config.streets) return Promise.resolve(null);
  source ??= fetch(config.streets)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j?.tiles?.[0] ? { template: String(j.tiles[0]), maxzoom: Number(j.maxzoom ?? 14) } : null))
    .catch(() => { source = null; return null; });
  return source;
}

const LAYERS = new Set(['water', 'waterway', 'landcover', 'landuse', 'park', 'transportation', 'building', 'aeroway']);
const tileCache = new Map<string, Promise<Tile | null>>();
export function fetchTile(src: Source, z: number, x: number, y: number): Promise<Tile | null> {
  const n = 2 ** z;
  const wx = ((x % n) + n) % n;
  const key = `${z}/${wx}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit.then((t) => (t ? { ...t, x } : null));
  const p = fetch(src.template.replace('{z}', String(z)).replace('{x}', String(wx)).replace('{y}', String(y)))
    .then(async (r) => (r.ok ? { z, x: wx, y, layers: decodeTile(await maybeGunzip(await r.arrayBuffer()), LAYERS) } : null))
    .catch(() => null);
  tileCache.set(key, p);
  if (tileCache.size > 40) tileCache.delete(tileCache.keys().next().value!);
  p.then((t) => { if (!t) tileCache.delete(key); });
  return p.then((t) => (t ? { ...t, x } : null));
}

/** the tiles (x may run past the antimeridian) at a zoom covering a local square */
export function tilesFor(f: Frame, z: number, r: Region): { x: number; y: number }[] {
  const n = 2 ** z;
  const X0 = f.X0 + r.x0 / f.S, X1 = f.X0 + (r.x0 + r.size) / f.S;
  const Y0 = f.Y0 + r.z0 / f.S, Y1 = f.Y0 + (r.z0 + r.size) / f.S;
  const out: { x: number; y: number }[] = [];
  for (let y = Math.max(0, Math.floor(Y0 * n)); y <= Math.min(n - 1, Math.floor(Y1 * n)); y++)
    for (let x = Math.floor(X0 * n); x <= Math.floor(X1 * n); x++) out.push({ x, y });
  return out;
}

/** tile units → local metres for one tile */
function tileXf(f: Frame, t: { z: number; x: number; y: number }, extent: number) {
  const n = 2 ** t.z;
  const [lx, lz] = worldToLocal(f, t.x / n, t.y / n);
  return { lx, lz, k: f.S / n / extent };
}

// ---- the ground: streets, water, parks, land use -------------------------------------------------------------------
const LANDCOVER: Record<string, keyof Palette> = { wood: 'wood', grass: 'park', farmland: 'farm', sand: 'sand', wetland: 'wetland', ice: 'ice', rock: 'rock' };
function landuseColor(p: Palette, c: string): string {
  if (['commercial', 'retail'].includes(c)) return p.commercial;
  if (['industrial', 'railway', 'garages', 'quarry', 'dam', 'military'].includes(c)) return p.industrial;
  if (['school', 'university', 'college', 'kindergarten', 'library', 'hospital'].includes(c)) return p.civic;
  if (c === 'cemetery') return p.cemetery;
  if (['stadium', 'pitch', 'playground', 'track', 'theme_park', 'zoo'].includes(c)) return p.sport;
  return p.residential;
}
// road widths in metres
const ROAD_W: Record<string, [number, keyof Palette]> = {
  motorway: [22, 'motorway'], trunk: [18, 'trunk'], primary: [15, 'primary'], secondary: [13, 'secondary'], tertiary: [11, 'tertiary'],
  minor: [8, 'minor'], service: [4.5, 'service'], track: [3, 'service'], raceway: [10, 'tertiary'], busway: [8, 'minor'],
};

function tracePoly(g: CanvasRenderingContext2D, f: MvtFeature) {
  g.beginPath();
  for (const ring of f.parts) {
    if (ring.length < 4) continue;
    g.moveTo(ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) g.lineTo(ring[i], ring[i + 1]);
    g.closePath();
  }
}
function traceLine(g: CanvasRenderingContext2D, f: MvtFeature) {
  g.beginPath();
  for (const part of f.parts) {
    if (part.length < 4) continue;
    g.moveTo(part[0], part[1]);
    for (let i = 2; i < part.length; i += 2) g.lineTo(part[i], part[i + 1]);
  }
}

/** Paint the ground of a local square from vector tiles (`px` pixels across). Plain land where there's no data. */
export function drawGround(f: Frame, tiles: Tile[], r: Region, px: number, p: Palette, opts: { buildings?: boolean; detail?: boolean } = {}): HTMLCanvasElement {
  const c = Object.assign(document.createElement('canvas'), { width: px, height: px });
  const g = c.getContext('2d')!;
  g.fillStyle = p.land;
  g.fillRect(0, 0, px, px);
  const s = px / r.size; // canvas px per metre
  for (const t of tiles) {
    const ext = Object.values(t.layers)[0]?.extent ?? 4096;
    const { lx, lz, k } = tileXf(f, t, ext);
    const m = k * s; // canvas px per tile unit
    g.save();
    g.setTransform(m, 0, 0, m, (lx - r.x0) * s, (lz - r.z0) * s);
    // keep each tile to its own square (tiles overlap a little at the edges)
    g.beginPath(); g.rect(0, 0, ext, ext); g.clip();
    const L = t.layers;
    const mw = (metres: number) => metres / k; // metres → tile units
    for (const ft of L.landcover?.features ?? []) { if (ft.type !== 3) continue; g.fillStyle = p[LANDCOVER[String(ft.props.class)] ?? 'park'] as string; tracePoly(g, ft); g.fill('evenodd'); }
    for (const ft of L.landuse?.features ?? []) { if (ft.type !== 3) continue; g.fillStyle = landuseColor(p, String(ft.props.class ?? '')); tracePoly(g, ft); g.fill('evenodd'); }
    g.fillStyle = p.park;
    for (const ft of L.park?.features ?? []) { if (ft.type !== 3) continue; tracePoly(g, ft); g.fill('evenodd'); }
    g.fillStyle = p.water;
    for (const ft of L.water?.features ?? []) { if (ft.type !== 3 || ft.props.brunnel === 'tunnel') continue; tracePoly(g, ft); g.fill('evenodd'); }
    g.strokeStyle = p.waterway; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const ft of L.waterway?.features ?? []) {
      if (ft.type !== 2 || ft.props.brunnel === 'tunnel') continue;
      g.lineWidth = mw(ft.props.class === 'river' ? 14 : ft.props.class === 'canal' ? 9 : 2.5); traceLine(g, ft); g.stroke();
    }
    g.strokeStyle = p.runway;
    for (const ft of L.aeroway?.features ?? []) {
      if (ft.type === 3) { g.fillStyle = p.runway; tracePoly(g, ft); g.fill('evenodd'); }
      else if (ft.type === 2) { g.lineWidth = mw(ft.props.class === 'runway' ? 45 : 20); traceLine(g, ft); g.stroke(); }
    }
    // roads: casings, then the roads, the bridges on top; paths and rails
    const roads = (L.transportation?.features ?? []).filter((ft) => ft.type === 2 && ft.props.brunnel !== 'tunnel');
    const bridge = (ft: MvtFeature) => ft.props.brunnel === 'bridge';
    for (const pass of [0, 1] as const) {
      const set = roads.filter((ft) => bridge(ft) === !!pass);
      g.strokeStyle = p.casing;
      for (const ft of set) { const w = ROAD_W[String(ft.props.class)]; if (!w || (!opts.detail && w[0] < 5)) continue; g.lineWidth = mw(w[0] + 2.4); traceLine(g, ft); g.stroke(); }
      for (const ft of set) { const w = ROAD_W[String(ft.props.class)]; if (!w || (!opts.detail && w[0] < 5)) continue; g.strokeStyle = p[w[1]] as string; g.lineWidth = mw(w[0]); traceLine(g, ft); g.stroke(); }
      if (opts.detail) {
        // lane markings on the bigger roads
        g.setLineDash([mw(3), mw(6)]); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = mw(0.35);
        for (const ft of set) { const w = ROAD_W[String(ft.props.class)]; if (!w || w[0] < 11) continue; traceLine(g, ft); g.stroke(); }
        g.setLineDash([]);
      }
    }
    if (opts.detail) {
      g.strokeStyle = p.path; g.lineWidth = mw(1.8); g.setLineDash([mw(2), mw(1.5)]);
      for (const ft of roads) { if (ft.props.class !== 'path') continue; traceLine(g, ft); g.stroke(); }
      g.strokeStyle = p.rail; g.lineWidth = mw(2.2); g.setLineDash([mw(4), mw(3)]);
      for (const ft of roads) { if (ft.props.class !== 'rail' && ft.props.class !== 'transit') continue; traceLine(g, ft); g.stroke(); }
      g.setLineDash([]);
    }
    // footprints (the walls stand on them; further out, they're the town seen from afar)
    if (opts.buildings !== false) {
      g.fillStyle = p.bld[0][1];
      for (const ft of L.building?.features ?? []) { if (ft.type !== 3) continue; tracePoly(g, ft); g.fill('evenodd'); }
    }
    g.restore();
  }
  return c;
}

// ---- buildings ------------------------------------------------------------------------------------------------------
export type BuildingMesh = {
  position: Float32Array; normal: Float32Array; color: Float32Array;
  /** walls: metres along the wall and up it (for the windows); roofs: −1 */ wuv: Float32Array;
  index: Uint32Array; count: number;
};
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function heightColor(p: Palette, h: number): [number, number, number] {
  const stops = p.bld;
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (h >= stops[i][0] && h <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  const t = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
  const ca = hex(a[1]), cb = hex(b[1]);
  return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
}
export function hex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  // sRGB → linear, as three.js expects vertex colours
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/**
 * Extrude every building within `near` metres, and the tall ones (`skylineMin` m or more) out to `far`, to their real
 * heights. Caps the triangle count (`budget`) nearest-first, so a downtown can't sink a phone.
 */
export function buildBuildings(f: Frame, tiles: Tile[], p: Palette, o: { near: number; far: number; skylineMin: number; budget: number; at?: [number, number] }): BuildingMesh {
  type B = { d: number; rings: number[][]; h: number; base: number; seed: number };
  const list: B[] = [];
  const seen = new Set<string>();
  const [ax, az] = o.at ?? [0, 0];
  for (const t of tiles) {
    const L = t.layers.building;
    if (!L) continue;
    const { lx, lz, k } = tileXf(f, t, L.extent);
    for (const ft of L.features) {
      if (ft.type !== 3 || ft.props.hide_3d === true) continue;
      const h = Number(ft.props.render_height ?? 0) || 6 + Math.round(hash(ft.parts[0]?.[0] ?? 0) * 6);
      const base = Number(ft.props.render_min_height ?? 0) || 0;
      if (h - base < 1) continue;
      for (const poly of polygons(ft)) {
        const rings = poly.map((ring) => {
          const out: number[] = [];
          for (let i = 0; i < ring.length; i += 2) out.push(lx + ring[i] * k, lz + ring[i + 1] * k);
          return out;
        });
        const o0 = rings[0];
        let cx = 0, cz = 0;
        for (let i = 0; i < o0.length; i += 2) { cx += o0[i]; cz += o0[i + 1]; }
        cx /= o0.length / 2; cz /= o0.length / 2;
        const d = Math.hypot(cx - ax, cz - az);
        if (d > o.far || (d > o.near && h < o.skylineMin)) continue;
        // the same building is in two tiles' buffers: keep one
        const key = `${Math.round(cx * 2)}_${Math.round(cz * 2)}_${Math.round(h)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ d, rings, h, base, seed: hash(cx * 0.37 + cz * 1.91) });
      }
    }
  }
  list.sort((a, b) => a.d - b.d);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], wuv: number[] = [], idx: number[] = [];
  let tris = 0;
  for (const b of list) {
    if (tris > o.budget) break;
    const c = heightColor(p, b.h);
    const tint = 0.88 + b.seed * 0.24;
    const wall: [number, number, number] = [c[0] * tint, c[1] * tint, c[2] * tint];
    const roof: [number, number, number] = [Math.min(1, c[0] * 1.25), Math.min(1, c[1] * 1.25), Math.min(1, c[2] * 1.25)];
    // walls
    for (const ring of b.rings) {
      let run = b.seed * 50; // where the windows start along this wall
      for (let i = 0; i + 3 < ring.length; i += 2) {
        const x1 = ring[i], z1 = ring[i + 1], x2 = ring[i + 2], z2 = ring[i + 3];
        const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const nx = dz / len, nz = -dx / len;
        const v = pos.length / 3;
        pos.push(x1, b.base, z1, x2, b.base, z2, x2, b.h, z2, x1, b.h, z1);
        for (let q = 0; q < 4; q++) { nor.push(nx, 0, nz); col.push(...wall); }
        wuv.push(run, b.base, run + len, b.base, run + len, b.h, run, b.h);
        run += len;
        // (a, c, b) and (a, d, c) face outwards
        idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        tris += 2;
      }
    }
    // the roof
    const contour = toVec(b.rings[0]);
    const holes = b.rings.slice(1).map(toVec);
    if (contour.length >= 3) {
      let faces: number[][] = [];
      try { faces = ShapeUtils.triangulateShape(contour, holes); } catch { faces = []; }
      const all = [contour, ...holes].flat();
      const v0 = pos.length / 3;
      for (const pt of all) { pos.push(pt.x, b.h, pt.y); nor.push(0, 1, 0); col.push(...roof); wuv.push(-1, -1); }
      for (const [a, bb, cc] of faces) {
        // facing up
        const A = all[a], Bv = all[bb], C = all[cc];
        const up = (Bv.y - A.y) * (C.x - A.x) - (Bv.x - A.x) * (C.y - A.y);
        if (up >= 0) idx.push(v0 + a, v0 + bb, v0 + cc); else idx.push(v0 + a, v0 + cc, v0 + bb);
        tris++;
      }
    }
  }
  return { position: new Float32Array(pos), normal: new Float32Array(nor), color: new Float32Array(col), wuv: new Float32Array(wuv), index: new Uint32Array(idx), count: list.length };
}
function toVec(ring: number[]): Vector2[] {
  const out: Vector2[] = [];
  // (the ring is closed: its last point repeats the first)
  for (let i = 0; i + 1 < ring.length - 2; i += 2) out.push(new Vector2(ring[i], ring[i + 1]));
  return out;
}

// ---- trees ----------------------------------------------------------------------------------------------------------
/** points scattered through woods (dense) and parks (sparser) within `radius`, nearest first, at most `max` */
export function treePoints(f: Frame, tiles: Tile[], o: { radius: number; max: number; at?: [number, number] }): { x: number; z: number; s: number }[] {
  const out: { x: number; z: number; s: number; d: number }[] = [];
  const [ax, az] = o.at ?? [0, 0];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (const t of tiles) {
    const sets: [MvtFeature[], number][] = [
      [(t.layers.landcover?.features ?? []).filter((x) => x.type === 3 && x.props.class === 'wood'), 90],
      [(t.layers.park?.features ?? []).filter((x) => x.type === 3), 420],
      [(t.layers.landcover?.features ?? []).filter((x) => x.type === 3 && x.props.class === 'grass'), 900],
    ];
    const ext = t.layers.landcover?.extent ?? t.layers.park?.extent ?? 4096;
    const { lx, lz, k } = tileXf(f, t, ext);
    for (const [feats, perTree] of sets) {
      for (const ft of feats) {
        for (const poly of polygons(ft)) {
          const ring = poly[0];
          let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
          for (let i = 0; i < ring.length; i += 2) { const x = lx + ring[i] * k, z = lz + ring[i + 1] * k; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
          // clip the box to the radius
          minX = Math.max(minX, ax - o.radius); maxX = Math.min(maxX, ax + o.radius); minZ = Math.max(minZ, az - o.radius); maxZ = Math.min(maxZ, az + o.radius);
          if (minX >= maxX || minZ >= maxZ) continue;
          const n = Math.min(600, Math.floor(((maxX - minX) * (maxZ - minZ)) / perTree));
          seed = (Math.abs(Math.floor(minX * 13 + minZ * 7)) % 2147483646) + 1;
          for (let i = 0; i < n; i++) {
            const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
            const u = (x - lx) / k, v = (z - lz) / k;
            if (u < 0 || v < 0 || u > ext || v > ext) continue; // this tile's own part only
            if (!inPoly(poly, u, v)) continue;
            const d = Math.hypot(x - ax, z - az);
            if (d > o.radius) continue;
            out.push({ x, z, s: 0.7 + rnd() * 0.7, d });
          }
        }
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, o.max);
}
function inPoly(poly: number[][], x: number, y: number) {
  let inside = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// ---- elevation ------------------------------------------------------------------------------------------------------
export const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
type DemTile = { z: number; x: number; y: number; h: Float32Array };
const demCache = new Map<string, Promise<DemTile | null>>();
function fetchDem(z: number, x: number, y: number): Promise<DemTile | null> {
  const n = 2 ** z, wx = ((x % n) + n) % n;
  const key = `${z}/${wx}/${y}`;
  let p = demCache.get(key);
  if (!p) {
    p = fetch(DEM_URL.replace('{z}', String(z)).replace('{x}', String(wx)).replace('{y}', String(y)))
      .then((r) => (r.ok ? r.blob() : null))
      .then(async (b) => {
        if (!b) return null;
        const bmp = await createImageBitmap(b);
        const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(bmp, 0, 0);
        bmp.close?.();
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const h = new Float32Array(c.width * c.height);
        for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
        return { z, x: wx, y, h };
      })
      .catch(() => null);
    demCache.set(key, p);
    if (demCache.size > 30) demCache.delete(demCache.keys().next().value!);
    p.then((t) => { if (!t) demCache.delete(key); });
  }
  return p.then((t) => (t ? { ...t, x } : null));
}

export type Terrain = {
  /** vertices across (and down) */ n: number; extent: number;
  /** height of each vertex above the start point's ground (m), the Earth's curve already taken off */ y: Float32Array;
  /** height above sea level of each vertex (m), for colouring */ abs: Float32Array;
  /** the ground under the start point, above sea level */ h0: number;
};

/** Real elevation around the start, `extent` metres each way, as an n×n grid. Null when the tiles can't be reached. */
export async function loadTerrain(f: Frame, o: { extent: number; n: number; z: number; flatten: [number, number] }): Promise<Terrain | null> {
  const r: Region = { x0: -o.extent, z0: -o.extent, size: o.extent * 2 };
  const want = tilesFor(f, o.z, r);
  // the ground right under you, from a fine tile
  const zFine = Math.min(13, o.z + 4);
  const nF = 2 ** zFine;
  const fine = fetchDem(zFine, Math.floor(f.X0 * nF), Math.floor(f.Y0 * nF));
  const tiles = (await Promise.all(want.map((t) => fetchDem(o.z, t.x, t.y)))).filter((t): t is DemTile => !!t);
  if (!tiles.length) return null;
  const sample = (tl: DemTile[], zz: number, X: number, Y: number) => {
    const nz = 2 ** zz;
    const tx = Math.floor(X * nz), ty = Math.floor(Y * nz);
    const t = tl.find((d) => d.y === ty && (((d.x - tx) % nz) + nz) % nz === 0);
    if (!t) return null;
    const size = Math.round(Math.sqrt(t.h.length));
    const u = (X * nz - tx) * size - 0.5, v = (Y * nz - ty) * size - 0.5;
    const i0 = Math.max(0, Math.min(size - 1, Math.floor(u))), j0 = Math.max(0, Math.min(size - 1, Math.floor(v)));
    const i1 = Math.min(size - 1, i0 + 1), j1 = Math.min(size - 1, j0 + 1);
    const fu = Math.max(0, Math.min(1, u - i0)), fv = Math.max(0, Math.min(1, v - j0));
    const h = (i: number, j: number) => t.h[j * size + i];
    return (h(i0, j0) * (1 - fu) + h(i1, j0) * fu) * (1 - fv) + (h(i0, j1) * (1 - fu) + h(i1, j1) * fu) * fv;
  };
  const fineT = await fine;
  const h0 = (fineT ? sample([fineT], zFine, f.X0, f.Y0) : null) ?? sample(tiles, o.z, f.X0, f.Y0) ?? 0;
  const y = new Float32Array(o.n * o.n), abs = new Float32Array(o.n * o.n);
  const [f0, f1] = o.flatten;
  for (let j = 0; j < o.n; j++) {
    for (let i = 0; i < o.n; i++) {
      const x = -o.extent + (i / (o.n - 1)) * o.extent * 2, z = -o.extent + (j / (o.n - 1)) * o.extent * 2;
      let X = f.X0 + x / f.S;
      X -= Math.floor(X);
      const h = sample(tiles, o.z, X, f.Y0 + z / f.S) ?? h0;
      const d = Math.hypot(x, z);
      const k = d <= f0 ? 0 : d >= f1 ? 1 : (1 - Math.cos(((d - f0) / (f1 - f0)) * Math.PI)) / 2;
      abs[j * o.n + i] = h;
      // the sea stays at sea level (its floor is in the data too)
      // (a touch taller than life far out, so a range 40 km off still reads as mountains on a phone)
      y[j * o.n + i] = (Math.max(h, 0) - Math.max(h0, 0)) * k * (1 + 0.25 * k) - curveDrop(d);
    }
  }
  return { n: o.n, extent: o.extent, y, abs, h0 };
}
