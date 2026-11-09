// Real-browser test (local-mode build): one place per plot type. Separate arcade plots all open the same arcade,
// and the arcade keeps its level when its land becomes the Estate and back.
// Run: npm run build:artifact && node tests/e2e/one-place.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-one-place');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4198, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const DOMAINS = [['canvas', 'museum'], ['habitat', 'sanctuary'], ['farm', 'kingdom'], ['business', 'megacorp'], ['arcade', 'galaxypark'], ['mine', 'core'], ['sky', 'observatory'], ['workshop', 'automaton'], ['diner', 'banquet'], ['dungeon', 'abyss'], ['brawl', 'titans']];

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);

async function gotoPlot(gx, gy) {
  await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; m.fire('dragstart'); const n = Math.PI * (1 - 2 * (gy + 0.5) / G); m.jumpTo({ center: [((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))], zoom: 20.4 }); }, [gx, gy, G]);
  await page.waitForTimeout(1200);
}
async function clickPlot(gx, gy) {
  await page.evaluate(() => document.querySelector('[aria-label="Close plot panel"]')?.click()); await page.waitForTimeout(300);
  await gotoPlot(gx, gy);
  const s = await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; const n = Math.PI * (1 - 2 * (gy + 0.5) / G); const pt = m.project([((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + pt.x, y: r.top + pt.y }; }, [gx, gy, G]);
  await page.mouse.click(s.x, s.y); await page.waitForSelector('[data-testid=plot-panel]', { timeout: 10000 }); await page.waitForTimeout(1000);
}
/** play the open minigame like a (frantic) person: taps, drags and holds all over the screen */
async function playFor(seconds) {
  const end = Date.now() + seconds * 1000, box = await page.locator('[data-testid=realm-game-canvas]').boundingBox();
  let i = 0;
  while (Date.now() < end) {
    i++;
    if (i % 4 === 0 && !(await page.locator('[data-testid=realm-game]').count())) return; // the game ended itself
    const x = box.x + box.width * (0.1 + ((i * 37) % 80) / 100), y = box.y + box.height * (0.25 + ((i * 53) % 65) / 100);
    if (i % 5 === 0) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y - 40, { steps: 6 }); await page.mouse.up(); }
    else if (i % 7 === 0) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up(); }
    else await page.mouse.click(x, y);
    await page.waitForTimeout(120);
  }
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'oli@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'oli_oneplace'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 500000) on conflict (player_id, resource) do update set amount = 500000`);
  // a 2x2 and a lone plot two cells away
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) await api(dx || dy ? 'acquirePlot' : 'claimStarter', START.gx + dx, START.gy + dy);
  await api('acquirePlot', START.gx + 3, START.gy);
  for (const g of await api('myGroups')) await api('setGroupKind', g.id, 'arcade');
  const at = async (x, y) => (await api('myGroups')).find((g) => g.cells.some((c) => c[0] === x && c[1] === y));
  const lone = await at(START.gx + 3, START.gy);
  const square = [];
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) square.push((await at(START.gx + x, START.gy + y)).id);
  const big = await api('fuseGroups', square);
  const arc = (await at(START.gx, START.gy)).arcade_id;
  check('the lone arcade plot and the 2x2 share one arcade', !!arc && lone.arcade_id === arc && (await at(START.gx + 3, START.gy)).arcade_id === arc);
  await sql(`update arcades set xp = 4000, plays = 30 where id = '${arc}'`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);

  // walk in from the lone plot: it's the big arcade, all 16 cabinets
  await clickPlot(START.gx + 3, START.gy);
  await shot('01-panel-lone-plot');
  await page.waitForSelector('[data-testid=open-arcade]', { timeout: 15000 });
  await page.evaluate(() => { const a = window.__landvasApi; window.__seen = []; if (!a.__wrapped) { const f = a.arcadeGet; a.arcadeGet = (id) => { window.__seen.push(id); return f(id); }; a.__wrapped = true; } document.querySelector('[data-testid=open-arcade]').click(); });
  await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 });
  await page.waitForFunction(() => window.__seen.length > 0, null, { timeout: 30000 });
  const seen1 = await page.evaluate(() => window.__seen);
  check('entering from the lone plot opens the shared arcade', seen1.length > 0 && seen1.every((x) => x === arc), JSON.stringify(seen1));
  await page.waitForTimeout(5000);
  await shot('02-arcade-from-lone-plot');
  const acc = await api('placeAccess', 'arcade', arc);
  check('it has the big land: all 16 open', acc.open === 16, JSON.stringify({ open: acc.open, plots: acc.plots }));

  // Estate and back: same arcade, same level
  await api('setGroupKind', big.id, 'boardwalk');
  check('while the 2x2 is the Estate, the lone plot still opens the same arcade', (await at(START.gx + 3, START.gy)).arcade_id === arc);
  await api('setGroupKind', big.id, 'arcade');
  const view = await api('arcadeGet', arc);
  check('back from the Estate the arcade kept its level and plays', view.plays === 30 && view.level.level > 1, JSON.stringify({ plays: view.plays, level: view.level.level }));
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1200);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);
  await clickPlot(START.gx, START.gy);
  await page.waitForSelector('[data-testid=open-arcade]', { timeout: 15000 });
  await page.evaluate(() => { const a = window.__landvasApi; window.__seen = []; if (!a.__wrapped) { const f = a.arcadeGet; a.arcadeGet = (id) => { window.__seen.push(id); return f(id); }; a.__wrapped = true; } document.querySelector('[data-testid=open-arcade]').click(); });
  await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 });
  await page.waitForFunction(() => window.__seen.length > 0, null, { timeout: 30000 });
  const seen2 = await page.evaluate(() => window.__seen);
  check('the 2x2 opens the same arcade', seen2.length > 0 && seen2.every((x) => x === arc), JSON.stringify(seen2));
  await page.waitForTimeout(4000);
  await shot('03-arcade-from-2x2');
} catch (e) {
  check('unexpected failure', false, String(e?.message ?? e).split('\n')[0]);
  await shot('zz-failure');
} finally {
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 4).join(' || '));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close(); server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
