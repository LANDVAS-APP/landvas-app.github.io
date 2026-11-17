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
/**
 * The ground as it really looks standing in it (the map's own colours are made for reading a map): grey asphalt,
 * concrete pavements, real grass, dark water. The neon look keeps its own colours.
 */
export function realPalette(p: Palette): Palette {
  return {
    ...p,
    land: '#8d9470', residential: '#8f9674', commercial: '#a9a59c', industrial: '#a19e97', civic: '#a8a396', cemetery: '#71904f', sport: '#5f9447',
    park: '#64913f', parkLine: '#4f7a33', wood: '#46692f', farm: '#a99d63', sand: '#d6c494', wetland: '#5f7d55', ice: '#eaf1f6', rock: '#958f84',
    water: '#33607a', waterLine: '#2c5469', waterway: '#3a6b84', casing: '#b4b0a7', motorway: '#3d3f44', trunk: '#404247', primary: '#45474c',
    secondary: '#47494e', tertiary: '#4c4e53', minor: '#505257', service: '#5c5d60', path: '#9d8a70', rail: '#5e564e', runway: '#55565a',
    bld: [[0, '#7d7a75'], [20, '#7d7a75'], [60, '#7d7a75'], [150, '#7d7a75']],
  } as Palette;
}
const AMERICAS = (lng: number) => lng < -30 && lng > -170;
// road widths in metres
const ROAD_W: Record<string, [number, keyof Palette]> = {
  motorway: [22, 'motorway'], trunk: [18, 'trunk'], primary: [15, 'primary'], secondary: [13, 'secondary'], tertiary: [11, 'tertiary'],
  minor: [8, 'minor'], service: [4.5, 'service'], track: [3, 'service'], raceway: [10, 'tertiary'], busway: [8, 'minor'],
};

const PAVED = new Set(['primary', 'secondary', 'tertiary', 'minor', 'busway']);
const CROSSABLE = new Set(['primary', 'secondary', 'tertiary', 'minor']);
/** real streets: pavements and kerbs, asphalt, the painted lines (double yellow in the Americas), zebra crossings */
function drawRealRoads(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, roads: MvtFeature[], bridge: (f: MvtFeature) => boolean, p: Palette, mw: (m: number) => number, detail: boolean, close: boolean, americas: boolean) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  const W = (ft: MvtFeature) => ROAD_W[String(ft.props.class)];
  for (const pass of [0, 1] as const) {
    const set = roads.filter((ft) => bridge(ft) === !!pass && W(ft) && (detail || W(ft)[0] >= 5));
    // the pavements (a parapet on a bridge)
    for (const ft of set) {
      const [w] = W(ft), cls = String(ft.props.class);
      g.strokeStyle = pass ? '#9c9890' : p.casing;
      g.lineWidth = mw(w + (pass ? 1.4 : PAVED.has(cls) ? 5.2 : cls === 'track' ? 0.6 : 1.4));
      traceLine(g, ft); g.stroke();
    }
    // the kerb
    if (detail) { g.strokeStyle = '#77746e'; for (const ft of set) { if (String(ft.props.class) === 'track') continue; g.lineWidth = mw(W(ft)[0] + 0.5); traceLine(g, ft); g.stroke(); } }
    // asphalt (a dirt track is dirt)
    for (const ft of set) { const [w, k] = W(ft); g.strokeStyle = ft.props.class === 'track' ? '#8c7a5c' : (p[k] as string); g.lineWidth = mw(w); traceLine(g, ft); g.stroke(); }
    if (!detail) continue;
    const white = 'rgba(238,238,232,0.88)', yellow = 'rgba(236,186,52,0.92)';
    for (const ft of set) {
      const [w, k] = W(ft), cls = String(ft.props.class);
      if (w < 6 || cls === 'track') continue;
      const asphalt = p[k] as string;
      const line = (width: number, color: string, dash?: number[]) => { g.strokeStyle = color; g.lineWidth = mw(width); g.setLineDash(dash ? dash.map(mw) : []); traceLine(g, ft); g.stroke(); };
      /** two thin lines at ± d from the middle (drawn outside-in: each pair clears what's inside it) */
      const pair = (d: number, color: string, dash?: number[]) => { line(2 * d + 0.16, color, dash); line(2 * d - 0.16, asphalt); };
      const big = cls === 'motorway' || cls === 'trunk' || cls === 'primary';
      const oneway = Number(ft.props.oneway ?? 0) !== 0;
      if (w >= 11) pair(w / 2 - 0.55, white);
      if (w >= 13 && big) pair(oneway ? w / 6 : w / 4, white, [3, 6]);
      if (oneway) { if (w >= 9) line(0.16, white, [3, 9]); }
      else if (w >= 11 && americas) pair(0.12, yellow);
      else line(0.16, americas && w >= 8 ? yellow : white, [3, 6]);
    }
    g.setLineDash([]);
    if (close) drawCrossings(g, set.filter((ft) => CROSSABLE.has(String(ft.props.class))), mw);
  }
}
/** zebra crossings on each arm of a junction, a few metres back from the middle, and a stop line behind each */
function drawCrossings(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, set: MvtFeature[], mw: (m: number) => number) {
  const arms = new Map<string, number>();
  const key = (x: number, y: number) => `${x},${y}`;
  for (const ft of set) for (const part of ft.parts) {
    const n = part.length / 2;
    for (let i = 0; i < n; i++) { const k = key(part[2 * i], part[2 * i + 1]); arms.set(k, (arms.get(k) ?? 0) + (i === 0 || i === n - 1 ? 1 : 2)); }
  }
  g.fillStyle = 'rgba(240,240,234,0.9)';
  for (const ft of set) {
    const w = ROAD_W[String(ft.props.class)][0];
    for (const part of ft.parts) {
      const n = part.length / 2;
      for (let i = 0; i < n; i++) {
        if ((arms.get(key(part[2 * i], part[2 * i + 1])) ?? 0) < 3) continue;
        for (const dir of [-1, 1]) {
          const j = i + dir;
          if (j < 0 || j >= n) continue;
          const ax = part[2 * i], ay = part[2 * i + 1], bx = part[2 * j], by = part[2 * j + 1];
          const len = Math.hypot(bx - ax, by - ay);
          const back = mw(w / 2 + 5.5);
          if (len < back + mw(4)) continue;
          const ux = (bx - ax) / len, uy = (by - ay) / len;
          g.save();
          g.translate(ax + ux * back, ay + uy * back);
          g.rotate(Math.atan2(uy, ux));
          for (let s = -w / 2 + 0.6; s <= w / 2 - 0.6; s += 1.1) g.fillRect(mw(-1.5), mw(s - 0.27), mw(3), mw(0.55));
          g.fillRect(mw(2.6), mw(0), mw(0.45), mw(w / 2 - 0.3)); // the stop line (one side)
          g.restore();
        }
      }
    }
  }
}

function tracePoly(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, f: MvtFeature) {
  g.beginPath();
  for (const ring of f.parts) {
    if (ring.length < 4) continue;
    g.moveTo(ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) g.lineTo(ring[i], ring[i + 1]);
    g.closePath();
  }
}
function traceLine(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, f: MvtFeature) {
  g.beginPath();
  for (const part of f.parts) {
    if (part.length < 4) continue;
    g.moveTo(part[0], part[1]);
    for (let i = 2; i < part.length; i += 2) g.lineTo(part[i], part[i + 1]);
  }
}

/** a feature's bounds in its tile's units (worked out once) */
const bounds = new WeakMap<MvtFeature, [number, number, number, number]>();
function boundsOf(ft: MvtFeature) {
  let b = bounds.get(ft);
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const part of ft.parts) for (let i = 0; i < part.length; i += 2) { const x = part[i], y = part[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    b = [x0, y0, x1, y1];
    bounds.set(ft, b);
  }
  return b;
}

export type GroundOpts = { buildings?: boolean; detail?: boolean; real?: boolean; close?: boolean };
/** Paint the ground of a local square from vector tiles (`px` pixels across). Plain land where there's no data. */
export function drawGround(f: Frame, tiles: Tile[], r: Region, px: number, p: Palette, opts: GroundOpts = {}): HTMLCanvasElement {
  const c = Object.assign(document.createElement('canvas'), { width: px, height: px });
  paintGround(c.getContext('2d')!, f, tiles, r, px, p, opts);
  return c;
}
/**
 * The same, into a canvas of your own. With `cull`, only what reaches the square (or comes within `cull` metres of
 * it) is traced, so painting a small square of a big town costs about what's in that square.
 */
export function paintGround(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, f: Frame, tiles: Tile[], r: Region, px: number, p: Palette, opts: GroundOpts & { cull?: number } = {}) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = p.land;
  g.fillRect(0, 0, px, px);
  const s = px / r.size; // canvas px per metre
  for (const t of tiles) {
    const ext = Object.values(t.layers)[0]?.extent ?? 4096;
    const { lx, lz, k } = tileXf(f, t, ext);
    const m = k * s; // canvas px per tile unit
    let L = t.layers;
    if (opts.cull != null) {
      // the square (and a margin) in this tile's units
      const u0 = (r.x0 - opts.cull - lx) / k, u1 = (r.x0 + r.size + opts.cull - lx) / k, v0 = (r.z0 - opts.cull - lz) / k, v1 = (r.z0 + r.size + opts.cull - lz) / k;
      if (u1 < 0 || v1 < 0 || u0 > ext || v0 > ext) continue;
      const near: Record<string, MvtLayer> = {};
      for (const [name, layer] of Object.entries(L)) near[name] = { ...layer, features: layer.features.filter((ft) => { const b = boundsOf(ft); return b[2] >= u0 && b[0] <= u1 && b[3] >= v0 && b[1] <= v1; }) };
      L = near;
    }
    g.save();
    g.setTransform(m, 0, 0, m, (lx - r.x0) * s, (lz - r.z0) * s);
    // keep each tile to its own square (tiles overlap a little at the edges)
    g.beginPath(); g.rect(0, 0, ext, ext); g.clip();
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
    if (opts.real) {
      drawRealRoads(g, roads, bridge, p, mw, !!opts.detail, !!opts.close, AMERICAS(f.lng0));
    } else for (const pass of [0, 1] as const) {
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
      g.strokeStyle = p.path; g.lineWidth = mw(1.8); g.setLineDash(opts.real ? [] : [mw(2), mw(1.5)]);
      for (const ft of roads) { if (ft.props.class !== 'path') continue; traceLine(g, ft); g.stroke(); }
      if (opts.real) {
        // rails: a gravel bed, the sleepers, two steel lines
        const rails = roads.filter((ft) => ft.props.class === 'rail' || ft.props.class === 'transit');
        g.strokeStyle = '#7d756b'; g.lineWidth = mw(3.6); for (const ft of rails) { traceLine(g, ft); g.stroke(); }
        if (opts.close) { g.strokeStyle = '#5a4636'; g.lineWidth = mw(2.6); g.setLineDash([mw(0.25), mw(0.4)]); for (const ft of rails) { traceLine(g, ft); g.stroke(); } g.setLineDash([]); }
        g.strokeStyle = '#b9bcc2'; g.lineWidth = mw(1.6); for (const ft of rails) { traceLine(g, ft); g.stroke(); }
        g.strokeStyle = '#6f6253'; g.lineWidth = mw(1.35); for (const ft of rails) { traceLine(g, ft); g.stroke(); }
      } else {
        g.strokeStyle = p.rail; g.lineWidth = mw(2.2); g.setLineDash([mw(4), mw(3)]);
        for (const ft of roads) { if (ft.props.class !== 'rail' && ft.props.class !== 'transit') continue; traceLine(g, ft); g.stroke(); }
      }
      g.setLineDash([]);
    }
    // a soft shade on the ground where it meets a wall (the street feels lived-in, the buildings feel planted)
    if (opts.real && opts.buildings !== false && opts.detail) {
      const blds = (L.building?.features ?? []).filter((ft) => ft.type === 3);
      g.lineJoin = 'round';
      for (const [w, a] of [[3.2, 0.07], [1.8, 0.08], [0.8, 0.1]] as const) {
        g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = mw(w);
        for (const ft of blds) { tracePoly(g, ft); g.stroke(); }
      }
    }
    // footprints (the walls stand on them; further out, they're the town seen from afar)
    if (opts.buildings !== false) {
      g.fillStyle = p.bld[0][1];
      for (const ft of L.building?.features ?? []) { if (ft.type !== 3) continue; tracePoly(g, ft); g.fill('evenodd'); }
    }
    g.restore();
  }
}

// ---- buildings ------------------------------------------------------------------------------------------------------
export type BuildingMesh = {
  position: Float32Array; normal: Float32Array; color: Float32Array;
  /**
   * per vertex: x = metres along the wall (windowed walls), −1 a flat roof, −2 a pitched roof, −3 a plain wall (a
   * gable); y = metres up the wall (or up the roof's slope); z = the building's height; w = its own random number
   */
  wuv: Float32Array;
  index: Uint32Array; count: number;
  /** air-con units, water tanks and stair huts on the flat roofs near you */
  roofBits: { x: number; z: number; y: number; kind: number; rot: number }[];
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
// what real buildings are made of: brick, render, stone, siding for the low ones, concrete and stone further up,
// glass and steel for the towers; tiles, slate and shingles on the pitched roofs, tar and gravel on the flat ones
const WALLS_LOW = ['#b5715a', '#a35f49', '#d8cdb8', '#cdc4b2', '#e4ddce', '#c8b699', '#bea489', '#d3c3a6', '#9c8f81', '#e9e3d7', '#c7a98f', '#b9b3a6'].map(hex);
const WALLS_MID = ['#b8b1a5', '#a7a299', '#c3b7a1', '#8f5b49', '#cfc7b9', '#99938b', '#b4a389', '#d6cfc2'].map(hex);
const WALLS_TALL = ['#7e8e9b', '#6b7985', '#99a2a7', '#b2b0a9', '#5e6e7c', '#8c99a2', '#a9a59c'].map(hex);
const ROOFS_PITCHED = ['#9b4e35', '#894531', '#4c5159', '#595c62', '#6a4e3e', '#3e434b', '#79594a', '#a0603f'].map(hex);
const ROOFS_FLAT = ['#8d8a85', '#7c7a77', '#a09d97', '#6e6d6b', '#99948b'].map(hex);
const pick = <X,>(list: X[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** a simple rectangle-ish footprint's four corners (in order), or null */
function quad(ring: number[]): number[][] | null {
  const pts: number[][] = [];
  for (let i = 0; i + 1 < ring.length - 2; i += 2) pts.push([ring[i], ring[i + 1]]);
  // drop points on a straight run
  const keep = pts.filter((pt, i) => {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    const ux = pt[0] - a[0], uz = pt[1] - a[1], vx = b[0] - pt[0], vz = b[1] - pt[1];
    const cross = Math.abs(ux * vz - uz * vx) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1);
    return cross > 0.26;
  });
  if (keep.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = keep[i], b = keep[(i + 1) % 4], c = keep[(i + 2) % 4];
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
    const cos = Math.abs(ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1);
    if (cos > 0.34) return null; // not near a right angle
  }
  return keep;
}

/**
 * Extrude every building within `near` metres, and the tall ones (`skylineMin` m or more) out to `far`, to their real
 * heights. Caps the triangle count (`budget`) nearest-first, so a downtown can't sink a phone. `real`: houses get
 * pitched roofs (gabled or hipped), walls and roofs take real materials' colours, and flat roofs near you get their
 * clutter.
 */
export function buildBuildings(f: Frame, tiles: Tile[], p: Palette, o: { near: number; far: number; skylineMin: number; budget: number; at?: [number, number]; real?: boolean }): BuildingMesh {
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
  const roofBits: BuildingMesh['roofBits'] = [];
  let tris = 0;
  const vert = (x: number, y: number, z: number, n: number[], c: number[], u: number, v: number, b: B, top = b.h) => {
    pos.push(x, y, z); nor.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]); wuv.push(u, v, top, b.seed);
    return pos.length / 3 - 1;
  };
  /** a triangle facing `n` */
  const tri = (a: number, b: number, c: number, n: number[]) => {
    const P = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const A = P(a), Bv = P(b), C = P(c);
    const ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * n[0] + fy * n[1] + fz * n[2] >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    tris++;
  };
  for (const b of list) {
    if (tris > o.budget) break;
    let wall: number[], roof: number[];
    if (o.real) {
      const r2 = hash(b.seed * 91.3), tint = 0.92 + hash(b.seed * 7.7) * 0.16;
      wall = (b.h > 40 ? pick(WALLS_TALL, r2) : b.h > 14 ? pick(WALLS_MID, r2) : pick(WALLS_LOW, r2)).map((v) => v * tint);
      roof = pick(ROOFS_FLAT, hash(b.seed * 13.1));
    } else {
      const c = heightColor(p, b.h);
      const tint = 0.88 + b.seed * 0.24;
      wall = [c[0] * tint, c[1] * tint, c[2] * tint];
      roof = [Math.min(1, c[0] * 1.25), Math.min(1, c[1] * 1.25), Math.min(1, c[2] * 1.25)];
    }
    // a house: a pitched roof (gabled or hipped) on a simple footprint
    const q = o.real && b.h <= 14 && b.base === 0 && b.rings.length === 1 && b.seed < 0.88 ? quad(b.rings[0]) : null;
    let area = 0;
    { const r = b.rings[0]; for (let i = 0; i + 3 < r.length; i += 2) area += r[i] * r[i + 3] - r[i + 2] * r[i + 1]; area = Math.abs(area) / 2; }
    const pitched = !!q && area > 25 && area < 480;
    let top = b.h;
    let gable: { ridge: number[][]; corners: number[][]; hip: boolean; eave: number; peak: number } | null = null;
    if (pitched && q) {
      let [A, B, C, D] = q;
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) < Math.hypot(C[0] - B[0], C[1] - B[1])) [A, B, C, D] = [B, C, D, A];
      const short = Math.hypot(C[0] - B[0], C[1] - B[1]);
      const rise = Math.max(1.4, Math.min(4.5, short * (0.32 + hash(b.seed * 3.3) * 0.14)));
      const eave = Math.max(2.8, b.h - rise);
      const R1 = [(A[0] + D[0]) / 2, (A[1] + D[1]) / 2], R2 = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
      const hip = hash(b.seed * 5.9) > 0.55;
      if (hip) {
        const len = Math.hypot(R2[0] - R1[0], R2[1] - R1[1]);
        const inset = Math.min(short / 2, len / 2 - 0.01);
        const ux = (R2[0] - R1[0]) / len, uz = (R2[1] - R1[1]) / len;
        R1[0] += ux * inset; R1[1] += uz * inset; R2[0] -= ux * inset; R2[1] -= uz * inset;
      }
      gable = { ridge: [R1, R2], corners: [A, B, C, D], hip, eave, peak: eave + rise };
      top = eave;
      roof = pick(ROOFS_PITCHED, hash(b.seed * 17.7));
    }
    // walls
    for (const ring of b.rings) {
      let run = b.seed * 50; // where the windows start along this wall
      for (let i = 0; i + 3 < ring.length; i += 2) {
        const x1 = ring[i], z1 = ring[i + 1], x2 = ring[i + 2], z2 = ring[i + 3];
        const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const n = [dz / len, 0, -dx / len];
        const v0 = vert(x1, b.base, z1, n, wall, run, b.base, b, top), v1 = vert(x2, b.base, z2, n, wall, run + len, b.base, b, top);
        const v2 = vert(x2, top, z2, n, wall, run + len, top, b, top), v3 = vert(x1, top, z1, n, wall, run, top, b, top);
        run += len;
        // (a, c, b) and (a, d, c) face outwards
        idx.push(v0, v2, v1, v0, v3, v2);
        tris += 2;
      }
    }
    if (gable) {
      const { ridge: [R1, R2], corners: [A, B, C, D], eave, peak } = gable;
      const mid = [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2];
      const rr = (pt: number[]) => [pt[0], peak, pt[1]];
      const ee = (pt: number[]) => [pt[0], eave, pt[1]];
      /** a roof face: its corners (x, y, z); slope coordinate measured from the eave */
      const face = (pts: number[][]) => {
        const [a, b2, c] = pts;
        const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const L = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / L);
        if (n[1] < 0) n = n.map((v) => -v);
        const slopeK = 1 / Math.max(0.2, Math.sqrt(1 - n[1] * n[1]) || 1);
        const ids = pts.map((pt) => vert(pt[0], pt[1], pt[2], n, roof, -2, (pt[1] - eave) * slopeK, b));
        for (let i = 1; i + 1 < ids.length; i++) tri(ids[0], ids[i], ids[i + 1], n);
      };
      face([ee(A), ee(B), rr(R2), rr(R1)]);
      face([ee(C), ee(D), rr(R1), rr(R2)]);
      if (gable.hip) { face([ee(B), ee(C), rr(R2)]); face([ee(D), ee(A), rr(R1)]); }
      else {
        // the gable ends: plain wall triangles up to the ridge
        for (const [P1, P2, R] of [[B, C, R2], [D, A, R1]]) {
          const ox = (P1[0] + P2[0]) / 2 - mid[0], oz = (P1[1] + P2[1]) / 2 - mid[1], L = Math.hypot(ox, oz) || 1;
          const n = [ox / L, 0, oz / L];
          const a1 = vert(P1[0], eave, P1[1], n, wall, -3, eave, b), a2 = vert(P2[0], eave, P2[1], n, wall, -3, eave, b), a3 = vert(R[0], peak, R[1], n, wall, -3, peak, b);
          tri(a1, a2, a3, n);
        }
        // a little overhang shadow line: the roof sits a touch wider than the walls (done by the shader's eave band)
      }
      continue;
    }
    // the flat roof
    const contour = toVec(b.rings[0]);
    const holes = b.rings.slice(1).map(toVec);
    if (contour.length >= 3) {
      let faces: number[][] = [];
      try { faces = ShapeUtils.triangulateShape(contour, holes); } catch { faces = []; }
      const all = [contour, ...holes].flat();
      const v0 = pos.length / 3;
      for (const pt of all) { pos.push(pt.x, b.h, pt.y); nor.push(0, 1, 0); col.push(...roof); wuv.push(-1, -1, b.h, b.seed); }
      for (const [a, bb, cc] of faces) {
        // facing up
        const A = all[a], Bv = all[bb], C = all[cc];
        const up = (Bv.y - A.y) * (C.x - A.x) - (Bv.x - A.x) * (C.y - A.y);
        if (up >= 0) idx.push(v0 + a, v0 + bb, v0 + cc); else idx.push(v0 + a, v0 + cc, v0 + bb);
        tris++;
      }
      // the clutter on a flat roof near you: air-con boxes, a stair hut, a water tank on the taller ones
      if (o.real && b.d < 420 && area > 120) {
        const r0 = b.rings[0];
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < r0.length; i += 2) { minX = Math.min(minX, r0[i]); maxX = Math.max(maxX, r0[i]); minZ = Math.min(minZ, r0[i + 1]); maxZ = Math.max(maxZ, r0[i + 1]); }
        const want = Math.min(5, 1 + Math.floor(area / 500));
        let got = 0;
        for (let tries = 0; tries < want * 6 && got < want; tries++) {
          const x = minX + hash(b.seed * 31 + tries * 7.3) * (maxX - minX), z = minZ + hash(b.seed * 47 + tries * 3.1) * (maxZ - minZ);
          if (!inPoly([r0], x, z)) continue;
          const r = hash(b.seed * 11 + tries);
          const kind = got === 0 && area > 400 ? 2 : b.h > 18 && r > 0.82 ? 1 : 0;
          roofBits.push({ x, z, y: b.h, kind, rot: hash(b.seed * 3 + tries) * Math.PI });
          got++;
        }
      }
    }
  }
  return { position: new Float32Array(pos), normal: new Float32Array(nor), color: new Float32Array(col), wuv: new Float32Array(wuv), index: new Uint32Array(idx), count: list.length, roofBits };
}
function toVec(ring: number[]): Vector2[] {
  const out: Vector2[] = [];
  // (the ring is closed: its last point repeats the first)
  for (let i = 0; i + 1 < ring.length - 2; i += 2) out.push(new Vector2(ring[i], ring[i + 1]));
  return out;
}

// ---- trees ----------------------------------------------------------------------------------------------------------
/** 0 a broadleaf, 1 a conifer, 2 a palm */
export type TreeKind = 0 | 1 | 2;
export type TreePt = { x: number; z: number; s: number; kind: TreeKind };
/** what grows where: conifers further from the equator (and in woods more than parks), palms in the tropics */
export function treeMix(lat: number) {
  const a = Math.abs(lat);
  return { conifer: a > 52 ? 0.75 : a > 42 ? 0.45 : a > 30 ? 0.22 : 0.08, palm: a < 24 ? 0.45 : a < 31 ? 0.12 : 0 };
}
/**
 * points scattered through woods (dense) and parks (sparser) within `radius`, nearest first, at most `max`;
 * `free` says whether a spot is open ground (so no tree stands on a path or in a pond)
 */
export function treePoints(f: Frame, tiles: Tile[], o: { radius: number; max: number; at?: [number, number]; free?: (x: number, z: number) => boolean }): TreePt[] {
  const out: (TreePt & { d: number })[] = [];
  const [ax, az] = o.at ?? [0, 0];
  const mix = treeMix(f.lat0);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (const t of tiles) {
    const sets: [MvtFeature[], number, number][] = [
      [(t.layers.landcover?.features ?? []).filter((x) => x.type === 3 && x.props.class === 'wood'), 90, 1],
      [(t.layers.park?.features ?? []).filter((x) => x.type === 3), 420, 0.5],
      [(t.layers.landcover?.features ?? []).filter((x) => x.type === 3 && x.props.class === 'grass'), 900, 0.5],
    ];
    const ext = t.layers.landcover?.extent ?? t.layers.park?.extent ?? 4096;
    const { lx, lz, k } = tileXf(f, t, ext);
    for (const [feats, perTree, wild] of sets) {
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
            const sz = 0.7 + rnd() * 0.7, r = rnd();
            const u = (x - lx) / k, v = (z - lz) / k;
            if (u < 0 || v < 0 || u > ext || v > ext) continue; // this tile's own part only
            if (!inPoly(poly, u, v)) continue;
            const d = Math.hypot(x - ax, z - az);
            if (d > o.radius) continue;
            if (o.free && !o.free(x, z)) continue;
            const kind: TreeKind = r < mix.palm * (wild < 1 ? 1 : 0.35) ? 2 : r < mix.palm + mix.conifer * wild ? 1 : 0;
            out.push({ x, z, s: sz, kind, d });
          }
        }
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, o.max);
}

// ---- what's on the street: street lamps, trees along the pavements, parked cars ------------------------------------
export type StreetThings = {
  lights: { x: number; z: number; rot: number; tall: number }[];
  cars: { x: number; z: number; rot: number; color: string; kind: number }[];
  trees: TreePt[];
};
const CAR_COLOURS = ['#f2f2ef', '#f2f2ef', '#1d1f24', '#1d1f24', '#a8adb4', '#a8adb4', '#5d636b', '#24324f', '#7d1a1f', '#b8b2a4', '#2f4a3a', '#c2421d', '#1f5e9e'];
/**
 * Along the real streets within `radius`: a lamp every 30 m or so (both sides on the big roads), trees spaced along
 * the pavements of the smaller streets, and cars parked at the kerb. `ground` says what a spot is (see `occupancy`).
 */
export function streetThings(f: Frame, tiles: Tile[], o: { radius: number; at?: [number, number]; ground?: (x: number, z: number) => number; max?: number }): StreetThings {
  const [ax, az] = o.at ?? [0, 0];
  const out: StreetThings = { lights: [], cars: [], trees: [] };
  const mix = treeMix(f.lat0);
  const seen = new Set<string>();
  const max = o.max ?? 400;
  for (const t of tiles) {
    const L = t.layers.transportation;
    if (!L) continue;
    const { lx, lz, k } = tileXf(f, t, L.extent);
    for (const ft of L.features) {
      const cls = String(ft.props.class);
      if (ft.type !== 2 || !PAVED.has(cls) || ft.props.brunnel === 'tunnel' || ft.props.brunnel === 'bridge') continue;
      const w = ROAD_W[cls][0];
      const big = cls === 'primary' || cls === 'secondary';
      for (const part of ft.parts) {
        const pts: number[][] = [];
        for (let i = 0; i < part.length; i += 2) pts.push([lx + part[i] * k, lz + part[i + 1] * k, part[i], part[i + 1]]);
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        let along = 0;
        for (let i = 1; i < pts.length; i++) {
          const [x1, z1] = pts[i - 1], [x2, z2] = pts[i];
          const len = Math.hypot(x2 - x1, z2 - z1);
          if (len < 0.5) continue;
          const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
          const nx = -uz, nz = ux;
          // every 1.5 m along the street, decide what stands here
          for (let s = (Math.ceil(along / 1.5) * 1.5) - along; s < len; s += 1.5) {
            const at = along + s;
            const x = x1 + ux * s, z = z1 + uz * s;
            if (Math.hypot(x - ax, z - az) > o.radius) continue;
            // (this tile's own stretch only: tiles overlap at their edges)
            const u = (x - lx) / k, v = (z - lz) / k;
            if (u < 0 || v < 0 || u > L.extent || v > L.extent) continue;
            const slot = Math.round(at / 1.5);
            const h = hash(x * 0.71 + z * 1.37);
            const rot = Math.atan2(ux, uz);
            const nearEnd = at < 9 || total - at < 9;
            for (const side of [-1, 1]) {
              // lamps
              if (slot % 20 === (side > 0 ? 0 : 10) && (big || side > 0) && out.lights.length < max) {
                const lx2 = x + nx * side * (w / 2 + 0.8), lz2 = z + nz * side * (w / 2 + 0.8);
                const g = o.ground?.(lx2, lz2) ?? 0;
                const key = `${Math.round(lx2 / 4)}_${Math.round(lz2 / 4)}`;
                if (g !== 4 && g !== 3 && !seen.has(key)) { seen.add(key); out.lights.push({ x: lx2, z: lz2, rot: rot + (side > 0 ? Math.PI / 2 : -Math.PI / 2), tall: big ? 9 : 6.5 }); }
              }
              // trees along the pavement
              if (!big && slot % 7 === (side > 0 ? 3 : 0) && hash(h * 9 + side) < 0.7 && out.trees.length < max) {
                const tx = x + nx * side * (w / 2 + 2.3), tz = z + nz * side * (w / 2 + 2.3);
                const g = o.ground?.(tx, tz) ?? 0;
                if (g === 0 || g === 1) out.trees.push({ x: tx, z: tz, s: 0.55 + hash(h * 3 + side) * 0.35, kind: mix.palm > 0.3 && hash(h * 5) < 0.5 ? 2 : 0 });
              }
              // cars parked at the kerb
              if (!big && !nearEnd && slot % 4 === (side > 0 ? 1 : 3) && hash(h * 13 + side * 3) < 0.48 && out.cars.length < max) {
                const cx = x + nx * side * (w / 2 - 1.15), cz = z + nz * side * (w / 2 - 1.15);
                if ((o.ground?.(cx, cz) ?? 2) === 2) {
                  const r = hash(h * 17 + side);
                  out.cars.push({ x: cx, z: cz, rot: rot + (side > 0 ? 0 : Math.PI), color: pick(CAR_COLOURS, r), kind: hash(h * 23 + side) < 0.25 ? 1 : 0 });
                }
              }
            }
          }
          along += len;
        }
      }
    }
  }
  return out;
}

/**
 * What the ground is, metre by metre, around you: 0 open ground, 1 grass or woods, 2 road, 3 water, 4 a building.
 * Painted once into a small canvas and read back, so asking is just an array lookup.
 */
export function occupancy(f: Frame, tiles: Tile[], r: Region, cell = 1): (x: number, z: number) => number {
  const N = Math.min(1400, Math.ceil(r.size / cell));
  const c = Object.assign(document.createElement('canvas'), { width: N, height: N });
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const s = N / r.size;
  for (const pass of [1, 2, 3, 4]) {
    g.fillStyle = g.strokeStyle = `rgb(${pass * 60},0,0)`;
    for (const t of tiles) {
      const ext = Object.values(t.layers)[0]?.extent ?? 4096;
      const { lx, lz, k } = tileXf(f, t, ext);
      const m = k * s;
      g.save();
      g.setTransform(m, 0, 0, m, (lx - r.x0) * s, (lz - r.z0) * s);
      g.beginPath(); g.rect(0, 0, ext, ext); g.clip();
      const L = t.layers;
      const mw = (metres: number) => metres / k;
      if (pass === 1) {
        for (const ft of [...(L.park?.features ?? []), ...(L.landcover?.features ?? []).filter((x) => ['wood', 'grass', 'wetland'].includes(String(x.props.class))), ...(L.landuse?.features ?? []).filter((x) => ['cemetery', 'pitch', 'park', 'grass'].includes(String(x.props.class)))]) {
          if (ft.type !== 3) continue; tracePoly(g, ft); g.fill('evenodd');
        }
      } else if (pass === 2) {
        g.lineCap = 'round';
        for (const ft of L.transportation?.features ?? []) {
          if (ft.type !== 2 || ft.props.brunnel === 'tunnel') continue;
          const w = ROAD_W[String(ft.props.class)]?.[0] ?? (ft.props.class === 'path' ? 1.8 : ft.props.class === 'rail' ? 3.4 : 0);
          if (!w) continue;
          g.lineWidth = mw(w); traceLine(g, ft); g.stroke();
        }
      } else if (pass === 3) {
        for (const ft of L.water?.features ?? []) { if (ft.type !== 3) continue; tracePoly(g, ft); g.fill('evenodd'); }
        for (const ft of L.waterway?.features ?? []) { if (ft.type !== 2) continue; g.lineWidth = mw(ft.props.class === 'river' ? 14 : 4); traceLine(g, ft); g.stroke(); }
      } else {
        for (const ft of L.building?.features ?? []) { if (ft.type !== 3) continue; tracePoly(g, ft); g.fill('evenodd'); }
      }
      g.restore();
    }
  }
  const data = g.getImageData(0, 0, N, N).data;
  const grid = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) grid[i] = Math.min(4, Math.round(data[i * 4] / 60));
  c.width = c.height = 1;
  return (x, z) => {
    const u = Math.floor((x - r.x0) * s), v = Math.floor((z - r.z0) * s);
    if (u < 0 || v < 0 || u >= N || v >= N) return 0;
    return grid[v * N + u];
  };
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
