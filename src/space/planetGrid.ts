// A world's plot grid wrapped round its globe: `rows` bands of latitude between ±LAT_MAX and 2.5x as
// many columns of longitude, so plots are square (PLOT_M metres, like Earth's) at the equator. The
// poles are wild land (no plots). A world's size follows from its rows: 1000 rows = 2.5 million
// plots on a globe 20 km round. Pure maths, shared by the 3D planet and the server's numbers.

export const LAT_MAX = 72; // degrees
export const PLOT_M = 8; // metres across, at the equator
export const colsFor = (rows: number) => Math.round((rows * 360) / (2 * LAT_MAX));
export type Vec3 = [number, number, number];
export type Cell = { gx: number; gy: number };

const D = Math.PI / 180;

/** Unit vector for a latitude / longitude (degrees). +Y is north. */
export function dirOf(lat: number, lon: number): Vec3 {
  const c = Math.cos(lat * D);
  return [c * Math.sin(lon * D), Math.sin(lat * D), c * Math.cos(lon * D)];
}
export function latLonOf(v: Vec3): { lat: number; lon: number } {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lat: Math.asin(Math.max(-1, Math.min(1, v[1] / l))) / D, lon: Math.atan2(v[0], v[2]) / D };
}
/** The plot cell under a point on the globe, or null in the polar wilds. */
export function cellAt(v: Vec3, rows: number): Cell | null {
  const { lat, lon } = latLonOf(v);
  if (Math.abs(lat) >= LAT_MAX) return null;
  const cols = colsFor(rows);
  const gy = Math.min(rows - 1, Math.floor(((lat + LAT_MAX) / (2 * LAT_MAX)) * rows));
  const gx = Math.min(cols - 1, Math.floor((((lon + 180) % 360 + 360) % 360 / 360) * cols));
  return { gx, gy };
}
/** A cell's corner latitudes and longitudes (degrees). */
export function cellBounds(c: Cell, rows: number) {
  const cols = colsFor(rows), h = (2 * LAT_MAX) / rows, w = 360 / cols;
  const lat0 = -LAT_MAX + c.gy * h, lon0 = -180 + c.gx * w;
  return { lat0, lat1: lat0 + h, lon0, lon1: lon0 + w };
}
export function cellCenterDir(c: Cell, rows: number): Vec3 {
  const b = cellBounds(c, rows);
  return dirOf((b.lat0 + b.lat1) / 2, (b.lon0 + b.lon1) / 2);
}
export const cellKey = (c: Cell) => `${c.gx}:${c.gy}`;
/** "N12 · E40" style coordinates for a cell's middle. */
export function cellLabel(c: Cell, rows: number) {
  const b = cellBounds(c, rows);
  const lat = Math.round((b.lat0 + b.lat1) / 2), lon = Math.round((b.lon0 + b.lon1) / 2);
  return `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat)}° · ${lon >= 0 ? 'E' : 'W'}${Math.abs(lon)}°`;
}
/** Globe radius in metres for a map with this many rows (matches the server's planet_radius). */
export const radiusFor = (rows: number) => (rows * PLOT_M * 180) / (2 * LAT_MAX * Math.PI);
/** The cell index at a latitude/longitude (fractional), for windows round a point. */
export function cellFloat(v: Vec3, rows: number) {
  const { lat, lon } = latLonOf(v);
  return { gx: ((((lon + 180) % 360) + 360) % 360 / 360) * colsFor(rows), gy: ((lat + LAT_MAX) / (2 * LAT_MAX)) * rows };
}
