// Builds src/data/places.json (country bounding boxes + major cities) for
// offline search and map labels. Sources: Natural Earth via world-atlas
// (public domain) and GeoNames via all-the-cities (CC BY 4.0 — credited in-app).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
const cities = require('all-the-cities');

const fc = feature(topo, topo.objects.countries);
const countries = [];
for (const f of fc.features) {
  const name = f.properties?.name;
  if (!name) continue;
  // bbox of the largest polygon (avoids far-flung territories stretching the box)
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = null, bestArea = -1;
  for (const p of polys) {
    let w = 180, s = 90, e = -180, n = -90;
    for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    const area = (e - w) * (n - s);
    if (area > bestArea) { bestArea = area; best = [w, s, e, n]; }
  }
  const r = (v) => Math.round(v * 100) / 100;
  countries.push([name, ...best.map(r)]);
}
const big = cities
  .filter((c) => c.population >= 150000)
  .sort((a, b) => b.population - a.population)
  .map((c) => [c.name, c.country, Math.round(c.loc.coordinates[0] * 1e4) / 1e4, Math.round(c.loc.coordinates[1] * 1e4) / 1e4, c.population]);
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/places.json', JSON.stringify({ countries, cities: big }));
console.log(`countries ${countries.length}, cities ${big.length}, bytes ${fs.statSync('src/data/places.json').size}`);
