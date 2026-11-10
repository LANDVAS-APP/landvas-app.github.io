// Real-browser test of the map styles (local-mode build):
//  - View → Map style offers Neon, Terrain and Atlas; Terrain is the default
//  - Terrain colours the land by height and shades the relief; Atlas has bright countries and shading; Neon has neither
//  - switching restyles the map in place (no reload), and the choice is remembered
// The real elevation tiles (AWS Terrain Tiles) aren't reachable from the test machine, so this serves synthetic ones
// in their place: a few mountain ranges (Rockies, Alps, Himalaya) in the same "terrarium" encoding.
// Run: npm run build:artifact && node tests/e2e/map-themes.mjs
import { serve, launch } from './browser.mjs';
import sharp from 'sharp';
import { feature } from 'topojson-client';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-map-themes');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4202;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

// ---- synthetic elevation: mountain ranges as gaussian ridges, ocean below sea level away from land-ish areas ----
const RANGES = [
  { lng: -107.5, lat: 39.5, rx: 4.5, ry: 8, h: 3600 }, { lng: -112.5, lat: 40.5, rx: 2.5, ry: 4, h: 2600 },
  { lng: 9.5, lat: 46.3, rx: 4, ry: 1.3, h: 3300 }, { lng: 85, lat: 29, rx: 12, ry: 3, h: 6500 }, { lng: -70, lat: -25, rx: 2, ry: 18, h: 4800 },
];
// a land mask from the app's own country shapes, so the seas are below sea level
const MW = 2048, MH = 1024;
const topo = JSON.parse(fs.readFileSync(path.resolve('src/data/countries-50m.json'), 'utf8'));
const geo = feature(topo, topo.objects.countries);
const ring = (r) => 'M' + r.map(([x, y]) => `${(((x + 180) / 360) * MW).toFixed(1)},${(((90 - y) / 180) * MH).toFixed(1)}`).join('L') + 'Z';
const d = geo.features.flatMap((f) => (f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [])).flatMap((p) => p.map(ring)).join('');
const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${MW}" height="${MH}"><rect width="100%" height="100%" fill="#000"/><path d="${d}" fill="#fff" fill-rule="evenodd"/></svg>`)).greyscale().raw().toBuffer();
const isLand = (lng, lat) => mask[Math.min(MH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MH))) * MW + Math.min(MW - 1, Math.max(0, Math.floor(((lng + 180) / 360) * MW)))] > 127;
function elevation(lng, lat) {
  if (!isLand(lng, lat)) return -2000;
  let h = 120 + 80 * Math.sin(lng * 0.9) * Math.cos(lat * 1.3) + 250 * Math.max(0, Math.sin(lng * 0.23 + lat * 0.17));
  for (const r of RANGES) h += r.h * Math.exp(-(((lng - r.lng) / r.rx) ** 2 + ((lat - r.lat) / r.ry) ** 2));
  return h;
}
const cache = new Map();
async function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (cache.has(k)) return cache.get(k);
  const N = 256, buf = Buffer.alloc(N * N * 3), n = 2 ** z;
  for (let j = 0; j < N; j++) {
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (j + 0.5) / N)) / n)));
    for (let i = 0; i < N; i++) {
      const lng = ((x + (i + 0.5) / N) / n) * 360 - 180;
      const v = elevation(lng, lat) + 32768;
      const o = (j * N + i) * 3;
      buf[o] = Math.floor(v / 256); buf[o + 1] = Math.floor(v) % 256; buf[o + 2] = Math.floor((v % 1) * 256);
    }
  }
  const png = await sharp(buf, { raw: { width: N, height: N, channels: 3 } }).png().toBuffer();
  cache.set(k, png);
  return png;
}

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
let demHits = 0;
await ctx.route(/elevation-tiles-prod\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/, async (route) => {
  const [, z, x, y] = route.request().url().match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/);
  demHits++;
  await route.fulfill({ status: 200, contentType: 'image/png', body: await tile(+z, +x, +y) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const vis = (id) => page.evaluate((id) => window.__landvasMap.getLayer(id) ? window.__landvasMap.getLayoutProperty(id, 'visibility') ?? 'visible' : 'missing', id);
const land = () => page.evaluate(() => JSON.stringify(window.__landvasMap.getPaintProperty('lv-land', 'fill-color')));
const jump = (lng, lat, zoom) => page.evaluate(([lng, lat, zoom]) => { const m = window.__landvasMap; m.fire('dragstart'); m.jumpTo({ center: [lng, lat], zoom }); }, [lng, lat, zoom]);
const idle = () => page.evaluate(() => new Promise((r) => { const m = window.__landvasMap; if (m.loaded() && m.areTilesLoaded()) return setTimeout(r, 400); m.once('idle', () => setTimeout(r, 400)); setTimeout(r, 8000); }));

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'mae@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'mae_maps'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 30000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!window.__landvasMap && window.__landvasMap.isStyleLoaded(), null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  // ---- Terrain is the default ------------------------------------------------------------------------------------
  check('Terrain is the default: relief colour and shading on', (await vis('lv-relief')) === 'visible' && (await vis('lv-hillshade')) === 'visible');
  await jump(-40, 30, 1.6); await idle(); await shot('01-terrain-world');
  await jump(-109, 40, 5.2); await idle(); await page.waitForTimeout(800); await shot('02-terrain-rockies');
  check('the relief is drawn from elevation tiles', demHits > 0, `${demHits} tiles`);
  await jump(9.5, 46.4, 6.5); await idle(); await shot('03-terrain-alps');

  // ---- the picker -------------------------------------------------------------------------------------------------
  await page.click('[data-testid=mode-button]'); await page.waitForTimeout(500);
  const names = await page.locator('[data-testid=map-theme-picker] [role=radio]').allInnerTexts();
  check('View offers three map styles', names.join('|') === 'Neon|Terrain|Atlas', names.join('|'));
  check('…with Terrain picked', (await page.getAttribute('[data-testid=map-theme-terrain]', 'aria-checked')) === 'true');
  await shot('04-picker');

  // ---- Atlas ------------------------------------------------------------------------------------------------------
  await page.click('[data-testid=map-theme-atlas]'); await page.waitForTimeout(800);
  await page.click('[data-testid=mode-button]'); await page.waitForTimeout(300);
  check('Atlas: colourful countries, shading, no height colours', (await vis('lv-relief')) === 'none' && (await vis('lv-hillshade')) === 'visible' && /#ffe39a/.test(await land()));
  await jump(10, 48, 3.4); await idle(); await shot('05-atlas-europe');

  // ---- Neon -------------------------------------------------------------------------------------------------------
  await page.click('[data-testid=mode-button]'); await page.waitForTimeout(400);
  await page.click('[data-testid=map-theme-neon]'); await page.waitForTimeout(800);
  await page.click('[data-testid=mode-button]'); await page.waitForTimeout(300);
  check('Neon: the original look, no relief', (await vis('lv-relief')) === 'none' && (await vis('lv-hillshade')) === 'none' && /#6b318a/.test(await land()));
  await idle(); await shot('06-neon-europe');
  check('the choice is remembered', await page.evaluate(() => JSON.parse(localStorage.getItem('landvas.settings') || '{}').mapTheme === 'neon'));

  // back to Terrain: same map, restyled in place
  await page.click('[data-testid=mode-button]'); await page.waitForTimeout(400);
  await page.click('[data-testid=map-theme-terrain]'); await page.waitForTimeout(800);
  check('back to Terrain without a reload', (await vis('lv-relief')) === 'visible' && /#e4ecd0/.test(await land()));
  await page.click('[data-testid=mode-button]'); await page.waitForTimeout(300);
  await jump(86, 28.5, 4.6); await idle(); await shot('07-terrain-himalaya');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run completed', false, e.message.split('\n')[0]);
  await shot('99-error');
} finally {
  await browser.close(); server.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
}
