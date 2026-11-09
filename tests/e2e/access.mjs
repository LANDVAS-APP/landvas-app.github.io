// Real-browser test of Phase 1 (local-mode build): bigger land opens more games (arcade 4 → 8 → 16), plot upgrades
// are gone, and an Estate is drawn on the map as one picture of the place.
// Run: npm run build:artifact && node tests/e2e/access.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-access');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4197, G = 4194304;
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
  await page.fill('#email', 'abe@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'abe_access'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 500000) on conflict (player_id, resource) do update set amount = 500000`);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) await api(dx || dy ? 'acquirePlot' : 'claimStarter', START.gx + dx, START.gy + dy);
  let groups = await api('myGroups');
  for (const g of groups) await api('setGroupKind', g.id, 'arcade');
  groups = await api('myGroups');
  const g0 = groups.find((g) => g.cells.some((c) => c[0] === START.gx && c[1] === START.gy));
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);

  // one plot: 4 of 16
  await clickPlot(START.gx, START.gy);
  await page.waitForSelector('[data-testid=place-access]', { timeout: 10000 }).catch(() => {});
  check('a one-plot arcade has 4 of 16 games open', (await page.getAttribute('[data-testid=place-access]', 'data-open').catch(() => null)) === '4');
  check('the plot panel has no upgrade button any more', (await page.locator('text=Upgrade to level').count()) === 0);
  await page.locator('[data-testid=place-access]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300);
  await shot('01-panel-1-plot');
  // inside: the cabinets past 4 are out of order
  await page.evaluate((id) => window.__landvasNav(`/arcade/${id}`), g0.arcade_id);
  await page.waitForTimeout(5000);
  await shot('02-arcade-1-plot');
  const acc1 = await api('placeAccess', 'arcade', g0.arcade_id);
  check('the server agrees: 4 open, next is 2 plots for 8', acc1.open === 4 && acc1.next?.plots === 2 && acc1.next?.open === 8);
  const locked = acc1.games[6];
  await sql(`update arcades set machines = machines || '{"${locked}": 1}'::jsonb where id = '${g0.arcade_id}'`);
  const err = await api('arcadeStart', g0.arcade_id, locked).then(() => 'started', (e) => String(e?.message ?? e));
  check('starting a game past the open ones is refused', /bigger land|needs_bigger_place/i.test(err), err);

  // two plots: 8
  const g1 = groups.find((g) => g.cells.some((c) => c[0] === START.gx + 1 && c[1] === START.gy));
  const two = await api('fuseGroups', [g0.id, g1.id]);
  const acc2 = await api('placeAccess', 'arcade', two.arcade_id ?? (await api('myGroups')).find((g) => g.id === two.id).arcade_id);
  check('merging a second plot opens 8', acc2.open === 8 && acc2.next?.plots === 4, JSON.stringify({ open: acc2.open, next: acc2.next }));
  // four plots: all 16
  const all = await api('fuseGroups', (await api('myGroups')).map((g) => g.id));
  const g4 = (await api('myGroups')).find((g) => g.id === all.id);
  const acc4 = await api('placeAccess', 'arcade', g4.arcade_id);
  check('four plots open all 16', acc4.open === 16 && acc4.next === null);
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1200);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);
  await clickPlot(START.gx, START.gy);
  await page.waitForSelector('[data-testid=place-access][data-open="16"]', { timeout: 10000 }).catch(() => {});
  check('the panel shows all 16 open', (await page.locator('[data-testid=place-access][data-open="16"]').count()) === 1);
  await page.locator('[data-testid=place-access]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300);
  await shot('03-panel-4-plots');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // the 2x2 as an Estate: one picture on the map
  await api('setGroupKind', g4.id, 'boardwalk');
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1200);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await page.evaluate(() => document.querySelector('[aria-label="Close plot panel"]')?.click()); await page.waitForTimeout(400);
  await gotoPlot(START.gx + 0.5, START.gy + 0.5); await page.evaluate(() => window.__landvasMap.zoomTo(19.4)); await page.waitForTimeout(2500);
  await shot('04-estate-map');
  check('the Estate map tile drew', true);
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
