// The first-person view's local frame: metres east (x) and south (z) of a starting point, y up (three.js looks down
// −z, so −z is north). It is the Web Mercator plane scaled to true metres at the start, so plots are exact squares
// and the map's vector tiles line up with them. Far things (a Leviathan 80 km off, a Primordial in another city) use
// great-circle bearing and distance instead.
import { GRID_SIZE, latToY, lngToX, xToLng, yToLat } from '../shared/grid';

export type Frame = { X0: number; Y0: number; S: number; lng0: number; lat0: number };
const EARTH = 40075016.686;

export function makeFrame(lng: number, lat: number): Frame {
  return { X0: lngToX(lng), Y0: latToY(lat), S: EARTH * Math.cos((lat * Math.PI) / 180), lng0: lng, lat0: lat };
}
/** a world fraction (0…1, the map's mercator x and y) → local metres */
export function worldToLocal(f: Frame, X: number, Y: number): [number, number] {
  let dx = X - f.X0;
  if (dx > 0.5) dx -= 1;
  else if (dx < -0.5) dx += 1;
  return [dx * f.S, (Y - f.Y0) * f.S];
}
export const lngLatToLocal = (f: Frame, lng: number, lat: number) => worldToLocal(f, lngToX(lng), latToY(lat));
export function localToLngLat(f: Frame, x: number, z: number): { lng: number; lat: number } {
  let X = f.X0 + x / f.S;
  X -= Math.floor(X);
  return { lng: xToLng(X), lat: yToLat(f.Y0 + z / f.S) };
}
/** a plot's north-west corner in local metres */
export const cellToLocal = (f: Frame, gx: number, gy: number) => worldToLocal(f, gx / GRID_SIZE, gy / GRID_SIZE);
/** the plot under a local point */
export function localToCell(f: Frame, x: number, z: number): { gx: number; gy: number } {
  let X = f.X0 + x / f.S;
  X -= Math.floor(X);
  const Y = f.Y0 + z / f.S;
  return { gx: Math.min(GRID_SIZE - 1, Math.floor(X * GRID_SIZE)), gy: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(Y * GRID_SIZE))) };
}
/** a plot's edge in local metres */
export const plotSize = (f: Frame) => f.S / GRID_SIZE;

const R_EARTH = 6371008.8;
/** great-circle distance (m) and initial compass bearing (radians clockwise from north) */
export function bearingDistance(lng0: number, lat0: number, lng: number, lat: number): { m: number; bearing: number } {
  const r = Math.PI / 180;
  const p1 = lat0 * r, p2 = lat * r, dl = (lng - lng0) * r;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const m = 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const b = Math.atan2(y, x);
  return { m, bearing: (b + 2 * Math.PI) % (2 * Math.PI) };
}
/** how far a point that far away has dropped below a flat horizon, from the Earth's curve (m) */
export const curveDrop = (m: number) => (m * m) / (2 * R_EARTH);

export const fmtDistance = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : m < 9500 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000).toLocaleString()} km`);
