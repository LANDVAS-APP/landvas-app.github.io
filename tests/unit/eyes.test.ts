// Explorer's Eyes: the real sky (sun, moon, stars, planets) and the vector-tile reader behind the streets and
// buildings.
import { describe, expect, it } from 'vitest';
import { NAMED_STARS, equatorial, horizontal, moonPhaseName, moonPosition, planets, skyDir, skyMatrix, sunPosition, daylight } from '../../src/eyes/astro';
import { decodeTile, polygons, ringArea } from '../../src/eyes/mvt';
import { bearingDistance, cellToLocal, localToCell, makeFrame, plotSize } from '../../src/eyes/geo';
import { buildBuildings, tilesFor, treePoints, type Tile } from '../../src/eyes/world';
import { lngLatToCell } from '../../src/shared/grid';

const RAD = Math.PI / 180;
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);
const angle = (a: [number, number, number], b: [number, number, number]) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

describe('the real sky', () => {
  // reference values from the Astronomical Almanac's low-precision formulas (as in SunCalc's own tests)
  const t = Date.UTC(2013, 2, 5);
  it('puts the sun where it is', () => {
    const s = sunPosition(t, 50.5, 30.5);
    near(s.alt, -0.7000406838781611, 1e-9);
    near(s.az, -2.5003175907168385 + Math.PI, 1e-9); // (SunCalc measures from the south)
  });
  it('puts the moon where it is, lit as it is', () => {
    const m = moonPosition(t, 50.5, 30.5);
    near(m.alt, 0.014551482243892251, 1e-9);
    near(m.az, -0.9783999522438226 + Math.PI, 1e-9);
    near(m.fraction, 0.4848068202456373, 1e-9);
    near(m.phase, 0.7548368838538762, 1e-9);
    expect(moonPhaseName(m.phase)).toBe('Last quarter');
  });
  it('day and night follow the sun', () => {
    expect(daylight(30 * RAD)).toBe(1);
    expect(daylight(-20 * RAD)).toBe(0);
    expect(daylight(-2 * RAD)).toBeGreaterThan(0);
  });
  it('the Pole Star stands over the north at your latitude', () => {
    const polaris = NAMED_STARS.find((s) => s.name === 'Polaris')!;
    for (const lat of [40, 51.5, 10]) {
      const p = horizontal(polaris.ra, polaris.dec, Date.UTC(2026, 10, 16, 4), lat, -105);
      near(p.alt / RAD, lat, 1.2);
      const az = ((p.az / RAD + 180) % 360) - 180;
      near(az, 0, 2.5);
    }
  });
  it('the star sphere matrix agrees with the formulas for every star', () => {
    const ms = Date.UTC(2026, 10, 17, 3, 20), lat = 39.74, lng = -104.99;
    const m = skyMatrix(ms, lat, lng);
    for (const s of NAMED_STARS) {
      const e = equatorial(s.ra, s.dec);
      const v: [number, number, number] = [m[0] * e[0] + m[4] * e[1] + m[8] * e[2], m[1] * e[0] + m[5] * e[1] + m[9] * e[2], m[2] * e[0] + m[6] * e[1] + m[10] * e[2]];
      expect(angle(v, skyDir(horizontal(s.ra, s.dec, ms, lat, lng)))).toBeLessThan(1e-6);
    }
  });
  it('Jupiter is opposite the sun at its opposition (7 Dec 2024), in Taurus', () => {
    const ms = Date.UTC(2024, 11, 7, 12);
    const j = planets(ms).find((p) => p.name === 'Jupiter')!;
    near((j.ra / RAD / 15 + 24) % 24, 4.9, 0.35);
    near(j.dec / RAD, 22, 3);
    const sun = sunPosition(ms, 0, 0), jh = horizontal(j.ra, j.dec, ms, 0, 0);
    near(angle(skyDir(sun), skyDir(jh)) / RAD, 180, 3);
  });
  it('Venus never strays far from the sun', () => {
    for (let d = 0; d < 600; d += 37) {
      const ms = Date.UTC(2025, 0, 1) + d * 86400_000;
      const v = planets(ms).find((p) => p.name === 'Venus')!;
      expect(angle(skyDir(sunPosition(ms, 0, 0)), skyDir(horizontal(v.ra, v.dec, ms, 0, 0))) / RAD).toBeLessThan(48);
    }
  });
});

// ---- a tiny MVT writer, to test the reader ----------------------------------------------------------------------------
class W {
  b: number[] = [];
  varint(n: number) { while (n > 127) { this.b.push((n & 127) | 128); n = Math.floor(n / 128); } this.b.push(n); return this; }
  tag(f: number, w: number) { return this.varint((f << 3) | w); }
  bytes(f: number, u: number[]) { this.tag(f, 2).varint(u.length); this.b.push(...u); return this; }
  str(f: number, s: string) { return this.bytes(f, [...new TextEncoder().encode(s)]); }
  packed(f: number, xs: number[]) { const w = new W(); xs.forEach((x) => w.varint(x)); return this.bytes(f, w.b); }
}
const zz = (n: number) => (n << 1) ^ (n >> 31);
function geom(rings: [number, number][][], close: boolean) {
  const out: number[] = [];
  let x = 0, y = 0;
  for (const r of rings) {
    out.push((1 & 7) | (1 << 3), zz(r[0][0] - x), zz(r[0][1] - y));
    x = r[0][0]; y = r[0][1];
    out.push((2 & 7) | ((r.length - 1) << 3));
    for (const [px, py] of r.slice(1)) { out.push(zz(px - x), zz(py - y)); x = px; y = py; }
    if (close) out.push(7 | (1 << 3));
  }
  return out;
}
export function mvtTile(layers: { name: string; features: { type: 1 | 2 | 3; props: Record<string, string | number>; rings: [number, number][][] }[] }[]) {
  const t = new W();
  for (const L of layers) {
    const keys: string[] = [], vals: (string | number)[] = [];
    const l = new W().varint((15 << 3) | 0).varint(2).str(1, L.name);
    for (const f of L.features) {
      const tags: number[] = [];
      for (const [k, v] of Object.entries(f.props)) {
        let ki = keys.indexOf(k); if (ki < 0) { keys.push(k); ki = keys.length - 1; }
        let vi = vals.indexOf(v); if (vi < 0) { vals.push(v); vi = vals.length - 1; }
        tags.push(ki, vi);
      }
      const fw = new W().packed(2, tags).tag(3, 0).varint(f.type).packed(4, geom(f.rings, f.type === 3));
      l.bytes(2, fw.b);
    }
    for (const k of keys) l.str(3, k);
    for (const v of vals) { const vw = typeof v === 'string' ? new W().str(1, v) : new W().tag(5, 0).varint(v); l.bytes(4, vw.b); }
    l.tag(5, 0).varint(4096);
    t.bytes(3, l.b);
  }
  return new Uint8Array(t.b);
}

describe('the vector-tile reader', () => {
  const bytes = mvtTile([
    { name: 'building', features: [
      { type: 3, props: { render_height: 30, render_min_height: 0 }, rings: [[[100, 100], [300, 100], [300, 300], [100, 300]]] },
      // a courtyard building: an outer ring and a hole (the hole winds the other way)
      { type: 3, props: { render_height: 12 }, rings: [[[1000, 1000], [1600, 1000], [1600, 1600], [1000, 1600]], [[1200, 1200], [1200, 1400], [1400, 1400], [1400, 1200]]] },
    ] },
    { name: 'transportation', features: [{ type: 2, props: { class: 'primary' }, rings: [[[0, 2048], [4096, 2048]]] }] },
    { name: 'poi', features: [{ type: 1, props: { name: 'Café' }, rings: [[[5, 5]]] }] },
  ]);
  it('reads layers, properties and geometry', () => {
    const t = decodeTile(bytes);
    expect(Object.keys(t).sort()).toEqual(['building', 'poi', 'transportation']);
    expect(t.building.extent).toBe(4096);
    expect(t.building.features[0].props.render_height).toBe(30);
    expect(t.building.features[0].parts[0]).toEqual([100, 100, 300, 100, 300, 300, 100, 300, 100, 100]);
    expect(t.transportation.features[0].props.class).toBe('primary');
    expect(t.transportation.features[0].parts[0]).toEqual([0, 2048, 4096, 2048]);
    expect(t.poi.features[0].props.name).toBe('Café');
  });
  it('skips layers it wasn’t asked for', () => {
    expect(Object.keys(decodeTile(bytes, new Set(['building'])))).toEqual(['building']);
  });
  it('tells outer rings from holes', () => {
    const f = decodeTile(bytes).building.features[1];
    expect(ringArea(f.parts[0])).toBeGreaterThan(0);
    expect(ringArea(f.parts[1])).toBeLessThan(0);
    const p = polygons(f);
    expect(p.length).toBe(1);
    expect(p[0].length).toBe(2);
  });
  it('extrudes buildings to their real heights, walls facing out', () => {
    const f = makeFrame(-104.99, 39.74);
    const z = 14, n = 2 ** z;
    const tx = Math.floor(f.X0 * n), ty = Math.floor(f.Y0 * n);
    const tile: Tile = { z, x: tx, y: ty, layers: decodeTile(bytes) };
    const pal = { bld: [[0, '#3b2a72'], [40, '#7f48d8']] } as never;
    const b = buildBuildings(f, [tile], pal, { near: 1e6, far: 1e6, skylineMin: 0, budget: 1e6, at: [0, 0] });
    expect(b.count).toBe(2);
    let maxY = 0;
    for (let i = 1; i < b.position.length; i += 3) maxY = Math.max(maxY, b.position[i]);
    expect(maxY).toBe(30);
    // the tower's walls (30 m) face away from its middle
    const P = b.position, N = b.normal, V = P.length / 3;
    let cx = 0, cz = 0, k = 0;
    for (let i = 0; i < V; i++) if (b.wuv[i * 2] < 0 && P[i * 3 + 1] === 30) { cx += P[i * 3]; cz += P[i * 3 + 2]; k++; }
    cx /= k; cz /= k;
    let walls = 0;
    for (let i = 0; i < V; i += 1) {
      if (b.wuv[i * 2] < 0 || P[i * 3 + 1] !== 30 || i % 4 !== 2) continue;
      const mx = (P[(i - 1) * 3] + P[i * 3]) / 2, mz = (P[(i - 1) * 3 + 2] + P[i * 3 + 2]) / 2;
      expect(N[i * 3] * (mx - cx) + N[i * 3 + 2] * (mz - cz)).toBeGreaterThan(0);
      walls++;
    }
    expect(walls).toBe(4);
    // and each wall's triangles wind so their front faces outward
    for (let t = 0; t < b.index.length; t += 3) {
      const [a1, b1, c1] = [b.index[t], b.index[t + 1], b.index[t + 2]];
      if (N[a1 * 3 + 1] !== 0) continue;
      const ux = P[b1 * 3] - P[a1 * 3], uy = P[b1 * 3 + 1] - P[a1 * 3 + 1], uz = P[b1 * 3 + 2] - P[a1 * 3 + 2];
      const vx = P[c1 * 3] - P[a1 * 3], vy = P[c1 * 3 + 1] - P[a1 * 3 + 1], vz = P[c1 * 3 + 2] - P[a1 * 3 + 2];
      const fx = uy * vz - uz * vy, fz = ux * vy - uy * vx;
      expect(fx * N[a1 * 3] + fz * N[a1 * 3 + 2]).toBeGreaterThan(0);
    }
    // roofs face up
    for (let t = 0; t < b.index.length; t += 3) {
      const [a1, b1, c1] = [b.index[t], b.index[t + 1], b.index[t + 2]];
      if (N[a1 * 3 + 1] !== 1) continue;
      const ux = P[b1 * 3] - P[a1 * 3], uz = P[b1 * 3 + 2] - P[a1 * 3 + 2], vx = P[c1 * 3] - P[a1 * 3], vz = P[c1 * 3 + 2] - P[a1 * 3 + 2];
      expect(uz * vx - ux * vz).toBeGreaterThanOrEqual(0);
    }
    const tri = b.index.length / 3;
    expect(tri).toBeGreaterThan(20);
  });
});

describe('trees', () => {
  it('scatters trees through a park and a wood, not outside them', () => {
    const f = makeFrame(-111.89, 40.77);
    const z = 14, n = 2 ** z;
    const tx = Math.floor(f.X0 * n), ty = Math.floor(f.Y0 * n);
    // the start point, in this tile's units
    const u = (f.X0 * n - tx) * 4096, v = (f.Y0 * n - ty) * 4096;
    const sqr = (x0: number, y0: number, x1: number, y1: number): [number, number][][] => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
    const bytes = mvtTile([
      { name: 'park', features: [{ type: 3, props: { class: 'park' }, rings: sqr(Math.round(u) - 300, Math.round(v) - 300, Math.round(u) + 300, Math.round(v) + 300) }] },
      { name: 'landcover', features: [{ type: 3, props: { class: 'wood' }, rings: sqr(Math.round(u) + 400, Math.round(v) - 200, Math.round(u) + 700, Math.round(v) + 200) }] },
    ]);
    const tile: Tile = { z, x: tx, y: ty, layers: decodeTile(bytes) };
    const trees = treePoints(f, [tile], { radius: 600, max: 5000 });
    expect(trees.length).toBeGreaterThan(50);
    const k = f.S / n / 4096;
    for (const t of trees) {
      const tu = (t.x / k) + u, tv = (t.z / k) + v;
      const inPark = Math.abs(tu - Math.round(u)) <= 301 && Math.abs(tv - Math.round(v)) <= 301;
      const inWood = tu >= Math.round(u) + 399 && tu <= Math.round(u) + 701 && Math.abs(tv - Math.round(v)) <= 201;
      expect(inPark || inWood).toBe(true);
    }
  });
});

describe('the local frame', () => {
  it('plots are exact squares that line up with the map’s grid', () => {
    const f = makeFrame(-104.99, 39.74);
    const c = lngLatToCell(-104.99, 39.74);
    const [x, z] = cellToLocal(f, c.gx, c.gy);
    const ps = plotSize(f);
    expect(ps).toBeGreaterThan(7);
    expect(ps).toBeLessThan(8);
    expect(localToCell(f, x + ps / 2, z + ps / 2)).toEqual(c);
    expect(localToCell(f, x + ps * 1.5, z + ps / 2)).toEqual({ gx: c.gx + 1, gy: c.gy });
    // south is +z
    expect(localToCell(f, x + ps / 2, z + ps * 1.5)).toEqual({ gx: c.gx, gy: c.gy + 1 });
  });
  it('bearings and distances on the globe', () => {
    const d = bearingDistance(-104.99, 39.74, -105.27, 40.01); // Denver → Boulder
    near(d.m / 1000, 38, 3);
    near(d.bearing / RAD, 322, 6);
  });
  it('finds the tiles around a place', () => {
    const f = makeFrame(139.69, 35.68);
    const ts = tilesFor(f, 14, { x0: -600, z0: -600, size: 1200 });
    expect(ts.length).toBeGreaterThanOrEqual(1);
    expect(ts.length).toBeLessThanOrEqual(4);
  });
});
