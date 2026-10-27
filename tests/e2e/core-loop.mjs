// Real-browser end-to-end test of the mandatory launch loop (local mode build):
// account → onboarding → map → starter plot → draw → save → publish → art on
// the map → adjacent plot → connect → one stroke across both plots → publish
// mural → minigame → reload persistence → a second account sees the art.
// Run: npm run build:artifact && node tests/e2e/core-loop.mjs
import { serve, launch } from './browser.mjs';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4181;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 90000 });
const URL = `http://localhost:${PORT}/?e2e=1`;

async function pixelAt(file, x, y) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}
const near = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function gotoPlot(gx, gy, zoom = 15.6) {
  await page.evaluate(([gx, gy, zoom]) => {
    const n = Math.PI * (1 - 2 * (gy + 0.5) / 65536);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
    const lng = ((gx + 0.5) / 65536) * 360 - 180;
    window.__landvasMap.jumpTo({ center: [lng, lat], zoom });
  }, [gx, gy, zoom]);
  await page.waitForTimeout(1200);
}
async function screenOf(gx, gy, fx = 0.5, fy = 0.5) {
  return page.evaluate(([gx, gy, fx, fy]) => {
    const m = window.__landvasMap;
    const n = Math.PI * (1 - 2 * (gy + fy) / 65536);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
    const lng = ((gx + fx) / 65536) * 360 - 180;
    const p = m.project([lng, lat]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [gx, gy, fx, fy]);
}
async function clickPlot(gx, gy) {
  const p = await screenOf(gx, gy);
  await page.mouse.click(p.x, p.y);
  await page.waitForSelector('[data-testid=plot-panel]', { timeout: 10000 });
  await page.waitForTimeout(600);
}
async function drawOnEditor(points) {
  const box = await page.locator('[data-testid=editor-canvas]').boundingBox();
  const map = await page.evaluate(() => { const e = window.__landvasEditor; return { ox: e.ox, oy: e.oy, s: e.scale }; });
  const sp = (p) => ({ x: box.x + map.ox + p.x * map.s, y: box.y + map.oy + p.y * map.s });
  const a = sp(points[0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (const pt of points.slice(1)) {
    const b = sp(pt);
    await page.mouse.move(b.x, b.y, { steps: 12 });
  }
  await page.mouse.up();
}
async function tilePixel(key, x, y) {
  return page.evaluate(([key, x, y]) => {
    const e = window.__landvasEditor;
    const c = e.doc.compositeOf(key);
    return Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
  }, [key, x, y]);
}

async function artDiag(gx, gy) {
  return page.evaluate(async ([gx, gy]) => {
    const api = window.__landvasApi, b = window.__landvasBackend;
    const out = {};
    for (const z of [15, 16]) {
      const x = gx >> (16 - z), y = gy >> (16 - z);
      const idx = await api.artTileIndex(z, [[x >> 4, y >> 4]]);
      const rows = idx[`${x >> 4}_${y >> 4}`] ?? [];
      const hit = rows.find((r) => r[0] === x && r[1] === y);
      const bytes = hit ? await b.artTile(z, x, y, hit[2]) : null;
      out[z] = { rows: rows.length, hit, bytes: bytes ? bytes.byteLength : null };
    }
    const m = window.__landvasMap;
    const c = m.getCenter();
    out.center = [c.lng.toFixed(5), c.lat.toFixed(5)];
    out.zoom = m.getZoom(); out.moving = m.isMoving(); out.loaded = m.loaded();
    out.tiles = m.getSource('lv-art')?.tiles; out.vis = m.getLayoutProperty('lv-art', 'visibility'); out.op = m.getPaintProperty('lv-art', 'raster-opacity');
    out.layers = m.getStyle().layers.filter((l) => l.id.startsWith('lv-')).map((l) => `${l.id}:${m.getLayoutProperty(l.id, 'visibility') ?? 'visible'}`).join(',');
    try {
      const tm = m.style.tileManagers['lv-art'];
      out.mlTiles = tm._inViewTiles.getAllIds().map((id) => { const t = tm._inViewTiles.getTileById(id); const c = t.tileID.canonical; return `${c.z}/${c.x}/${c.y}:${t.state}`; }).join(' ');
    } catch (e) { out.mlTiles = String(e); }
    out.log = (window.__lvartLog || []).slice(-60);
    return out;
  }, [gx, gy]);
}

const START = { gx: 12398, gy: 24628 }; // Salt Lake City
try {
  // 1-2: open, create account, onboarding
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await shot('01-welcome');
  await page.fill('#email', 'mira@example.test');
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', 'mira_murals');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 20000 });
  check('account created and onboarded', true);

  // 3: explore the map — search a city
  await page.fill('#place-search', 'Salt Lake City');
  await page.waitForTimeout(500);
  const hit = await page.locator('button:has-text("Salt Lake City")').count();
  check('city search finds Salt Lake City', hit > 0);
  await gotoPlot(START.gx, START.gy);
  await shot('02-map-city');

  // 4: claim the free starter plot
  await clickPlot(START.gx, START.gy);
  await shot('03-plot-panel');
  await page.click('[data-testid=claim-plot]');
  await page.waitForSelector('[data-testid=choose-draw]', { timeout: 15000 });
  check('starter plot claimed for free', true);
  await page.click('[data-testid=choose-draw]');
  await page.waitForSelector('[data-testid=editor-canvas]', { timeout: 20000 });
  await page.waitForFunction(() => !!window.__landvasEditor, null, { timeout: 20000 });
  await page.waitForTimeout(500);

  // 5: draw — fill the background and paint a stroke with real pointer events
  await page.evaluate(() => window.__landvasEditor.set({ tool: 'fill', color: '#0B1E5B' }));
  await drawOnEditor([{ x: 20, y: 20 }]);
  await page.evaluate(() => window.__landvasEditor.set({ tool: 'brush', brush: 'round', color: '#FFD23F', sizes: { round: 26 }, hardness: 1, smoothing: 0 }));
  await drawOnEditor([{ x: 40, y: 128 }, { x: 128, y: 100 }, { x: 220, y: 128 }]);
  await shot('04-editor-single');
  const px1 = await tilePixel(`${START.gx}_${START.gy}`, 128, 100);
  check('stroke rendered on the plot tile', near(px1.slice(0, 3), [255, 210, 63], 30), JSON.stringify(px1));

  // 6: save and publish
  await page.click('[data-testid=save-draft]');
  await page.waitForFunction(() => !window.__landvasEditor.dirty, null, { timeout: 15000 });
  check('draft saved', true);
  await page.click('[data-testid=open-publish]');
  await page.check('[data-testid=rights]');
  await page.click('[data-testid=publish]');
  await page.waitForSelector('[data-testid=view-on-map]', { timeout: 60000 });
  check('artwork published (local auto-moderation)', true);
  await shot('05-published');

  // 7: see it on the world map
  await page.click('[data-testid=view-on-map]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('[data-testid=plot-panel] button[aria-label="Close plot panel"]')?.click());
  await gotoPlot(START.gx, START.gy, 16);
  await page.waitForTimeout(2500);
  const f1 = path.join(OUT, '06-map-art.png');
  await page.screenshot({ path: f1, timeout: 90000 });
  const sp1 = await screenOf(START.gx, START.gy, 0.5, 100 / 256);
  const mp1 = await pixelAt(f1, sp1.x, sp1.y);
  const ok1 = near(mp1, [255, 210, 63], 60);
  check('published art visible on the map at the plot', ok1, JSON.stringify(mp1));
  if (!ok1 || process.env.E2E_DIAG) console.log('DIAG', JSON.stringify(await artDiag(START.gx, START.gy)));

  // 8: acquire the adjacent plot (east)
  const east = { gx: START.gx + 1, gy: START.gy };
  await clickPlot(east.gx, east.gy);
  await page.click('[data-testid=claim-plot]');
  await page.waitForSelector('[data-testid=connect-plots]', { timeout: 15000 });
  check('adjacent plot acquired with Ink and growth prompt shown', true);
  await shot('07-grow-prompt');

  // 9-10: connect both plots and open the larger canvas
  await page.click('[data-testid=connect-plots]');
  await page.waitForSelector('[data-testid=editor-canvas]', { timeout: 20000 });
  await page.waitForFunction(() => window.__landvasEditor && window.__landvasEditor.doc.cells.length === 2, null, { timeout: 20000 });
  check('canvases connected into one 2-plot document', true);
  const kept = await tilePixel(`${START.gx}_${START.gy}`, 128, 100);
  check('existing artwork kept its position after expansion', near(kept.slice(0, 3), [255, 210, 63], 30), JSON.stringify(kept));

  // 11: one continuous stroke across the plot boundary (x = 256 in document space)
  await page.evaluate(() => window.__landvasEditor.set({ tool: 'brush', brush: 'round', color: '#FF4D6D', sizes: { round: 30 }, hardness: 1, smoothing: 0 }));
  await drawOnEditor([{ x: 150, y: 200 }, { x: 256, y: 200 }, { x: 380, y: 200 }]);
  const left = await tilePixel(`${START.gx}_${START.gy}`, 250, 200);
  const right = await tilePixel(`${east.gx}_${east.gy}`, 6, 200);
  check('stroke crosses the plot boundary seamlessly', near(left.slice(0, 3), [255, 77, 109], 25) && near(right.slice(0, 3), [255, 77, 109], 25), `${left} | ${right}`);
  await shot('08-editor-mural');

  // 12: publish the mural
  await page.click('[data-testid=open-publish]');
  await page.check('[data-testid=rights]');
  await page.click('[data-testid=publish]');
  await page.waitForSelector('[data-testid=view-on-map]', { timeout: 60000 });
  await page.click('[data-testid=view-on-map]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 15000 });
  await gotoPlot(START.gx, START.gy, 15.5);
  await page.waitForTimeout(2500);
  if (process.env.E2E_DIAG) console.log('DIAG', JSON.stringify(await artDiag(START.gx, START.gy)));
  const f2 = path.join(OUT, '09-map-mural.png');
  await page.screenshot({ path: f2, timeout: 90000 });
  const a = await screenOf(START.gx, START.gy, 248 / 256, 200 / 256);
  const b = await screenOf(east.gx, east.gy, 8 / 256, 200 / 256);
  const ma = await pixelAt(f2, a.x, a.y), mb = await pixelAt(f2, b.x, b.y);
  const okMural = near(ma, [255, 77, 109], 70) && near(mb, [255, 77, 109], 70);
  check('mural renders continuously across both plots on the map', okMural, `${ma} | ${mb}`);
  if (!okMural) console.log('DIAG', JSON.stringify(await artDiag(east.gx, east.gy), null, 1));
  await page.evaluate(() => window.__landvasMap.jumpTo({ zoom: 11 }));
  await page.waitForTimeout(2000);
  await shot('10-map-lowzoom');

  // 13-14: play the plot minigame (validated server-side) and earn resources
  const plot = await page.evaluate(async ([gx, gy]) => {
    const r = await window.__landvasApi.plotDetails(gx, gy);
    return { game: r.type_info.minigame };
  }, [START.gx, START.gy]).catch(() => null);
  check('minigame type resolved', !!plot, plot?.game);
  if (plot) {
    await page.evaluate(([g, gx, gy]) => window.__landvasNav(`/play/${g}?gx=${gx}&gy=${gy}`), [plot.game, START.gx, START.gy]);
    await page.waitForSelector('[data-testid=game-start]', { timeout: 20000 });
    await shot('11-game-intro');
    const inkBefore = await page.evaluate(async () => (await window.__landvasApi.myState()).balances.ink);
    await page.click('[data-testid=game-start]');
    await page.waitForFunction(() => !!window.__landvasGame, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await shot('12-game-playing');
    await page.evaluate(() => window.__landvasGame.autoSolve());
    await page.waitForSelector('[data-testid=game-results]', { timeout: 60000 });
    await shot('13-game-results');
    const inkAfter = await page.evaluate(async () => (await window.__landvasApi.myState()).balances.ink);
    check('minigame won and rewards granted', Number(inkAfter) > Number(inkBefore), `${inkBefore} -> ${inkAfter}`);
  }

  // 15: reload: ownership, art and progress persist
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=world-map]', { timeout: 60000 });
  const persisted = await page.evaluate(async () => {
    const s = await window.__landvasApi.myState();
    const g = await window.__landvasApi.myGroups();
    return { plots: s.plot_count, groups: g.map((x) => x.plot_count), pubs: (await window.__landvasApi.myPublications()).map((p) => p.status) };
  });
  check('ownership, canvases and publications persist across reload', persisted.plots === 2 && persisted.groups.includes(2) && persisted.pubs.includes('published'), JSON.stringify(persisted));

  // 16: a different account sees the public artwork
  await page.evaluate(async () => { await window.__landvasBackend.signOut(); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'viewer@example.test');
  await page.fill('#password', 'just-looking-123');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', 'viewer_one');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 20000 });
  await gotoPlot(START.gx, START.gy, 15.5);
  await page.waitForTimeout(2500);
  const f3 = path.join(OUT, '14-other-account.png');
  await page.screenshot({ path: f3, timeout: 90000 });
  const c = await screenOf(START.gx, START.gy, 248 / 256, 200 / 256);
  const mc = await pixelAt(f3, c.x, c.y);
  check('another account sees the published mural', near(mc, [255, 77, 109], 70), JSON.stringify(mc));
} catch (e) {
  check('unexpected failure', false, String(e?.message ?? e).split('\n')[0]);
  await shot('zz-failure').catch(() => {});
} finally {
  const relevant = errors.filter((e) => !/ErrnoError/.test(e));
  check('no uncaught page errors', relevant.length === 0, relevant.slice(0, 5).join(' || '));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
