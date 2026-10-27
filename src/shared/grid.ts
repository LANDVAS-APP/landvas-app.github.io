// LANDVAS world grid — the single spatial cell identification system.
// ---------------------------------------------------------------------------
// Plots are the Web Mercator (EPSG:3857) XYZ tiles at zoom 22 — about 9.5 m
// at the equator and ~7 m at 40°N (Atlas Earth-sized parcels, 6-8 per house):
//   gx = floor((lng + 180) / 360 * 2^22)
//   gy = floor((1 - ln(tan(lat) + sec(lat)) / π) / 2 * 2^22)
// so a plot ID (gx, gy) is stable across zoom levels and devices, a plot is a
// square on screen at every latitude, and published plot art IS the z22 map
// tile for that cell. x wraps at the antimeridian; y does not.
// MUST stay in sync with private.mix / private.plot_type_for (SQL).
// ---------------------------------------------------------------------------

export const GRID_LEVEL = 22;
export const GRID_SIZE = 2 ** GRID_LEVEL; // 4,194,304
export const PLOT_PX = 256; // art pixels per plot edge
export const ART_MIN_ZOOM = GRID_LEVEL - 8;
export const ART_MAX_ZOOM = GRID_LEVEL;
/** Map zooms that frame one plot / a few houses / a neighbourhood / a town. */
export const Z_PLOT = GRID_LEVEL - 1.6;
export const Z_HOUSE = GRID_LEVEL - 2.4;
export const Z_STREET = GRID_LEVEL - 4;
export const Z_TOWN = GRID_LEVEL - 8;
/** Approximate edge length of a plot in metres at a latitude. */
export const plotMetres = (lat: number) => (40075016.7 / GRID_SIZE) * Math.cos((lat * Math.PI) / 180);
export const MAX_LAT = 85.0511287798066;

export type Cell = { gx: number; gy: number };
export type CellTuple = [number, number];
export type PlotTypeId = 'graphite' | 'pigment' | 'mosaic' | 'lumina';

export const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
export const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
export const wrapGx = (gx: number) => ((gx % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;

/** Fractional world coordinate in [0, 1). */
export function lngToX(lng: number): number {
  return (wrapLng(lng) + 180) / 360;
}
export function latToY(lat: number): number {
  const r = (clampLat(lat) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
}
export function xToLng(x: number): number {
  return x * 360 - 180;
}
export function yToLat(y: number): number {
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function lngLatToCell(lng: number, lat: number): Cell {
  const gx = Math.min(GRID_SIZE - 1, Math.floor(lngToX(lng) * GRID_SIZE));
  const gy = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(latToY(lat) * GRID_SIZE)));
  return { gx: wrapGx(gx), gy };
}

/** Bounds of a plot; gx may be unwrapped (outside 0..65535) for drawing across the seam. */
export function cellBounds(gx: number, gy: number) {
  const west = xToLng(gx / GRID_SIZE);
  const east = xToLng((gx + 1) / GRID_SIZE);
  const north = yToLat(gy / GRID_SIZE);
  const south = yToLat((gy + 1) / GRID_SIZE);
  return { west, east, north, south };
}

export function cellCenter(gx: number, gy: number): [number, number] {
  return [wrapLng(xToLng((gx + 0.5) / GRID_SIZE)), yToLat((gy + 0.5) / GRID_SIZE)];
}

export function cellPolygon(gx: number, gy: number): [number, number][] {
  const b = cellBounds(gx, gy);
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
    [b.west, b.north],
  ];
}

export const cellKey = (gx: number, gy: number) => `${wrapGx(gx)}_${gy}`;
export function parseCellKey(k: string): Cell {
  const [a, b] = k.split('_');
  return { gx: Number(a), gy: Number(b) };
}

export function neighbors(gx: number, gy: number): (Cell & { dir: 'n' | 's' | 'e' | 'w' })[] {
  const out: (Cell & { dir: 'n' | 's' | 'e' | 'w' })[] = [
    { gx: wrapGx(gx + 1), gy, dir: 'e' },
    { gx: wrapGx(gx - 1), gy, dir: 'w' },
  ];
  if (gy > 0) out.push({ gx, gy: gy - 1, dir: 'n' });
  if (gy < GRID_SIZE - 1) out.push({ gx, gy: gy + 1, dir: 's' });
  return out;
}

/** Cardinal adjacency, with x wrapping across the antimeridian. */
export function adjacent(a: Cell, b: Cell): boolean {
  if (a.gy === b.gy) {
    const d = Math.abs(a.gx - b.gx);
    return d === 1 || d === GRID_SIZE - 1;
  }
  return a.gx === b.gx && Math.abs(a.gy - b.gy) === 1;
}

// ---- Hashing ------------------------------------------------------------------
// Plot types and rarities are decided on the server with secret salts, so the
// client can't predict them; this hash is kept for deterministic visuals.

/** Park–Miller style hash; every intermediate stays below 2^53. */
export function mix(a: number, b: number): number {
  let h = (a * 92821 + b * 68917 + 12345) % 2147483647;
  h = (h * 48271) % 2147483647;
  h = (h * 48271) % 2147483647;
  return h;
}

// ---- Tiles ------------------------------------------------------------------

/** The z-level tile containing a plot. */
export function tileOfCell(gx: number, gy: number, z: number) {
  const s = GRID_LEVEL - z;
  return { z, x: gx >> s, y: gy >> s };
}

/** Plot range covered by a tile (inclusive). */
export function cellsOfTile(z: number, x: number, y: number) {
  const s = GRID_LEVEL - z;
  return { minGx: x << s, minGy: y << s, maxGx: ((x + 1) << s) - 1, maxGy: ((y + 1) << s) - 1 };
}

/** Fractional map coordinates (MapLibre "mercator") → unwrapped cell range of a viewport. */
export function viewportCells(west: number, south: number, east: number, north: number) {
  const x0 = Math.floor(((west + 180) / 360) * GRID_SIZE);
  const x1 = Math.floor(((east + 180) / 360) * GRID_SIZE);
  const y0 = Math.max(0, Math.floor(latToY(north) * GRID_SIZE));
  const y1 = Math.min(GRID_SIZE - 1, Math.floor(latToY(south) * GRID_SIZE));
  return { minGx: x0, maxGx: x1, minGy: y0, maxGy: y1 };
}

// ---- Cell sets ----------------------------------------------------------------

/** Unwrap cells that straddle the antimeridian into a contiguous x range (mirrors private.cells_unwrap). */
export function unwrapCells(cells: CellTuple[]) {
  let min = Infinity;
  let max = -Infinity;
  for (const [x] of cells) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  const wrapped = max - min > GRID_SIZE / 2;
  const out: CellTuple[] = cells.map(([x, y]) => [wrapped && x > GRID_SIZE / 2 - 1 ? x - GRID_SIZE : x, y]);
  let minGx = Infinity, maxGx = -Infinity, minGy = Infinity, maxGy = -Infinity;
  for (const [x, y] of out) {
    minGx = Math.min(minGx, x); maxGx = Math.max(maxGx, x);
    minGy = Math.min(minGy, y); maxGy = Math.max(maxGy, y);
  }
  return { cells: out, minGx, maxGx, minGy, maxGy, wrapped, width: maxGx - minGx + 1, height: maxGy - minGy + 1 };
}
