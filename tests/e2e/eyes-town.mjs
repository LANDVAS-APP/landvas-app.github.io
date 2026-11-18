// The made-up town (vector street tiles) and mountain ridge (elevation tiles) that first-person tests stand in, so the
// whole pipeline runs without the internet. (The same as tests/e2e/eyes.mjs and eyes-perf.mjs draw.)
import { encode } from 'fast-png';

const G = 2 ** 22;
export const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { lng: ((gx + 0.5) / G) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
let HERE = { lng: 0, lat: 0 };

// ---- a made-up town as vector tiles --------------------------------------------------------------------------------
class W {
  constructor() { this.b = []; }
  varint(n) { while (n > 127) { this.b.push((n & 127) | 128); n = Math.floor(n / 128); } this.b.push(n); return this; }
  tag(f, w) { return this.varint((f << 3) | w); }
  bytes(f, u) { this.tag(f, 2).varint(u.length); for (const x of u) this.b.push(x); return this; }
  str(f, s) { return this.bytes(f, [...new TextEncoder().encode(s)]); }
  packed(f, xs) { const w = new W(); xs.forEach((x) => w.varint(x)); return this.bytes(f, w.b); }
}
const zz = (n) => (n << 1) ^ (n >> 31);
function geom(rings, close) {
  const out = []; let x = 0, y = 0;
  for (const r of rings) {
    out.push(1 | (1 << 3), zz(r[0][0] - x), zz(r[0][1] - y)); x = r[0][0]; y = r[0][1];
    if (r.length === 1) continue; // (a point)
    out.push(2 | ((r.length - 1) << 3));
    for (const [px, py] of r.slice(1)) { out.push(zz(px - x), zz(py - y)); x = px; y = py; }
    if (close) out.push(7 | (1 << 3));
  }
  return out;
}
function mvt(layers) {
  const t = new W();
  for (const L of layers) {
    const keys = [], vals = [];
    const l = new W().tag(15, 0).varint(2).str(1, L.name);
    for (const f of L.features) {
      const tags = [];
      for (const [k, v] of Object.entries(f.props)) {
        let ki = keys.indexOf(k); if (ki < 0) { keys.push(k); ki = keys.length - 1; }
        let vi = vals.indexOf(v); if (vi < 0) { vals.push(v); vi = vals.length - 1; }
        tags.push(ki, vi);
      }
      l.bytes(2, new W().packed(2, tags).tag(3, 0).varint(f.type).packed(4, geom(f.rings, f.type === 3)).b);
    }
    for (const k of keys) l.str(3, k);
    for (const v of vals) l.bytes(4, (typeof v === 'string' ? new W().str(1, v) : new W().tag(5, 0).varint(v)).b);
    l.tag(5, 0).varint(4096);
    t.bytes(3, l.b);
  }
  return Buffer.from(t.b);
}
const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
// where you stand, in a tile's units (your block is a little square with trees: room to look around)
const hereIn = (z, x, y) => { const n = 2 ** z; const X = (HERE.lng + 180) / 360, r = (HERE.lat * Math.PI) / 180, Y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; return [(X * n - x) * 4096, (Y * n - y) * 4096]; };
function town(z, x, y) {
  const step = 512, roads = [], blds = [], parks = [], water = [], wood = [];
  const [hu, hv] = hereIn(z, x, y);
  for (let k = 0; k <= 4096; k += step) {
    const cls = (k / step) % 4 === 0 ? 'primary' : (k / step) % 2 === 0 ? 'secondary' : 'minor';
    roads.push({ type: 2, props: { class: cls }, rings: [[[k, -64], [k, 4160]]] }, { type: 2, props: { class: cls }, rings: [[[-64, k], [4160, k]]] });
  }
  let seed = (x * 73856093) ^ (y * 19349663) ^ z;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let bx = 0; bx < 4096; bx += step) for (let by = 0; by < 4096; by += step) {
    const pick = rnd();
    const mine = z >= 14 && Math.abs(bx + step / 2 - hu) < step * 0.75 && Math.abs(by + step / 2 - hv) < step * 0.75;
    if (mine || pick < 0.1) { parks.push({ type: 3, props: { class: 'park' }, rings: sq(bx + 40, by + 40, bx + step - 40, by + step - 40) }); continue; }
    if (pick < 0.14) { water.push({ type: 3, props: { class: 'lake' }, rings: sq(bx + 60, by + 60, bx + step - 60, by + step - 60) }); continue; }
    if (pick < 0.18) { wood.push({ type: 3, props: { class: 'wood' }, rings: sq(bx + 30, by + 30, bx + step - 30, by + step - 30) }); continue; }
    const tall = rnd() < 0.12;
    for (const [ox, oy] of [[60, 60], [270, 60], [60, 270], [270, 270]]) {
      const h = tall && ox === 60 && oy === 60 ? 60 + Math.floor(rnd() * 120) : 6 + Math.floor(rnd() * 24);
      blds.push({ type: 3, props: { render_height: h, render_min_height: 0 }, rings: sq(bx + ox, by + oy, bx + ox + 170, by + oy + 170) });
    }
  }
  // the town's name on the map (and the quarter you're in), where the map's labels are
  const labels = [];
  if (z <= 12 && hu >= -200 && hu <= 4296 && hv >= -200 && hv <= 4296) {
    labels.push({ type: 1, props: { class: 'city', name: 'Eyesville', capital: 4 }, rings: [[[Math.round(hu + 140), Math.round(hv - 90)]]] });
    labels.push({ type: 1, props: { class: 'suburb', name: 'Lantern Quarter' }, rings: [[[Math.round(hu - 30), Math.round(hv + 25)]]] });
  }
  return mvt([
    ...(labels.length ? [{ name: 'place', features: labels }] : []),
    { name: 'landuse', features: [{ type: 3, props: { class: 'residential' }, rings: sq(0, 0, 4096, 4096) }] },
    { name: 'landcover', features: wood },
    { name: 'park', features: parks },
    { name: 'water', features: water },
    { name: 'transportation', features: roads },
    { name: 'building', features: blds },
  ]);
}
// ---- a mountain ridge 30 km east, as terrarium elevation tiles --------------------------------------------------------
function dem(z, x, y) {
  const n = 2 ** z, size = 256, data = new Uint8Array(size * size * 4);
  const kmE = 111.32 * Math.cos((HERE.lat * Math.PI) / 180);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const lng = ((x + (i + 0.5) / size) / n) * 360 - 180;
    const yy = Math.PI * (1 - (2 * (y + (j + 0.5) / size)) / n);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(yy));
    const east = (lng - HERE.lng) * kmE, north = (lat - HERE.lat) * 111.32;
    const h = 1300 + 2400 * Math.exp(-(((east - 30) / 7) ** 2)) * (0.7 + 0.3 * Math.sin(north / 6)) + 500 * Math.exp(-(((north - 25) / 9) ** 2));
    const v = h + 32768;
    const k = (j * size + i) * 4;
    data[k] = Math.floor(v / 256); data[k + 1] = Math.floor(v) % 256; data[k + 2] = Math.floor((v - Math.floor(v)) * 256); data[k + 3] = 255;
  }
  return Buffer.from(encode({ width: size, height: size, data, channels: 4 }));
}


/** serve the town and the ridge round `here` ({lng, lat}) to a browser context */
export async function routeTown(ctx, here) {
  HERE = here;
  await ctx.route('https://tiles.openfreemap.org/**', (route) => {
    const u = route.request().url();
    if (/\/planet$/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
    const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(u);
    if (m) return route.fulfill({ status: 200, contentType: 'application/x-protobuf', headers: { 'access-control-allow-origin': '*' }, body: town(+m[1], +m[2], +m[3]) });
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://s3.amazonaws.com/elevation-tiles-prod/**', (route) => {
    const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(route.request().url());
    if (!m) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: dem(+m[1], +m[2], +m[3]) });
  });
}
