// Real-browser test of the Worlds button and the map's side rail (local-mode build, a phone):
//  - the website's map on a phone: one row of round buttons (cards open under it), Fly in the + tray
//  - the side rail: one tidy column of same-size buttons — Worlds (its own button), More, Move, Me
//  - Worlds shows your best place of each kind: two arcades → one Arcade, the higher-level one ("best of 2")
//  - the Worlds button lives on the map only: not in your arcade, your home or a game
//  - the app has it on the map's rail too
// Run: npm run build:artifact && node tests/e2e/worlds.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-worlds'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4235, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', process.argv[2] === 'app' ? PORT + 1 : PORT);
const PORT_ = process.argv[2] === 'app' ? PORT + 1 : PORT;

async function run(app) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  const tag = app ? 'app' : 'web';
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`), timeout: 45000 }).catch(() => {});
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
  const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  try {
    await page.goto(`http://localhost:${PORT_}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `worlds_${tag}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `worlds_${tag}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const p0 = ll(START.gx, START.gy);
    const r0 = await api('reportPosition', p0.longitude, p0.latitude, 8).catch(() => null);
    if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
    await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
    await api('claimStarter', START.gx, START.gy, 'Neon Alley').catch((e) => console.log('note  claim:', String(e?.message ?? e)));
    // two more places of their own: a second arcade (levelled up) and a farm
    await sql(`select private.ledger_apply(id, 'ink', 500000, 'admin_adjust', 'test', 'test', 'e2e:worlds:' || id) from profiles where username = 'worlds_${tag}'`);
    for (let i = 0; i < 2; i++) await api('quickBuyPlot').catch((e) => console.log('note  buy:', String(e?.message ?? e)));
    const gs = await api('myGroups');
    const kinds = ['arcade', 'arcade', 'farm'];
    const made = [];
    for (let i = 0; i < Math.min(gs.length, 3); i++) made.push(await api('setGroupKind', gs[i].id, kinds[i]).catch((e) => { console.log('note  kind:', String(e?.message ?? e)); return null; }));
    const arcs = made.filter((m) => m?.arcade_id).map((m) => m.arcade_id);
    // the second arcade is the better one
    if (arcs[1]) await sql(`update arcades set xp = 60000 where id = '${arcs[1]}'`);
    const arc = arcs[1] ?? arcs[0] ?? null;
    await page.evaluate(() => window.__landvasQc.invalidateQueries());
    await nav('/world'); await page.waitForTimeout(3000);
    await page.evaluate((h) => window.__landvasUi.getState().requestFly({ lng: h.longitude, lat: h.latitude, zoom: 16.5 }), p0);
    await page.waitForTimeout(3500);

    if (!app) {
      // ---- the tidier map ----
      check('web map: one row of round buttons under the HUD', (await page.locator('[data-testid=map-row] [data-testid=mode-button]').count()) === 1
        && (await page.locator('[data-testid=map-row] [data-testid=grimoire-button]').count()) === 1);
      const tops = await page.locator('[data-testid=map-row] > *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top)));
      check('…all on one line', tops.length >= 3 && new Set(tops).size === 1, JSON.stringify(tops));
      await shot('01-map');
      if (await page.locator('[data-testid=map-row] [data-testid=hot-zone-chip]').count()) {
        await page.click('[data-testid=map-row] [data-testid=hot-zone-chip]');
        check('…a button opens its card right under the row', await waitFor('[data-testid=hot-zone-sheet]', 8000));
        await page.click('[data-testid=map-row] [data-testid=hot-zone-chip]'); await page.waitForTimeout(500);
      }
      await tid('hud-more').first().click(); await page.waitForTimeout(600);
      check('Fly lives in the + tray', (await page.locator('[data-testid=hud-tray] [data-testid=fly-chip]').count()) === 1);
      await page.click('[data-testid=hud-tray] [data-testid=fly-chip]');
      check('…and drops a pin (with a Cancel)', await waitFor('[data-testid=pin-catcher]', 5000) && await waitFor('[data-testid=pin-cancel]', 3000));
      await page.click('[data-testid=pin-cancel]'); await page.waitForTimeout(500);
      check('…Cancel ends it', (await page.locator('[data-testid=pin-catcher]').count()) === 0);
    }

    // ---- the side rail and the Worlds button ----
    check(`${tag}: the Worlds button is on the map's side rail`, await waitFor('[data-testid=hud-rail] [data-testid=worlds-button]', 10000));
    const sizes = await page.locator('[data-testid=hud-rail] > .lv-gbtn').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    check(`${tag}: …the rail's buttons are all one size`, sizes.length >= 1 && new Set(sizes).size === 1, JSON.stringify(sizes));
    if (!app) {
      const order = await page.locator('[data-testid=hud-rail] > .lv-gbtn').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      check('…Worlds sits right above the + button', order.indexOf('worlds-button') >= 0 && order.indexOf('hud-more') === order.indexOf('worlds-button') + 1, JSON.stringify(order));
      const xs = await page.locator('[data-testid=hud-rail] > .lv-gbtn').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left + e.getBoundingClientRect().width / 2)));
      check('…in one straight column', new Set(xs).size === 1, JSON.stringify(xs));
    }
    await shot('01-rail');
    await tid('worlds-button').first().click();
    check('…a tap opens Worlds', await waitFor('[data-testid=worlds-sheet]', 8000));
    await page.waitForSelector('[data-testid=worlds-places]', { timeout: 10000 }).catch(() => {});
    const tiles = await page.locator('[data-testid=worlds-places] [data-testid=world-go]').evaluateAll((els) => els.map((e) => ({ route: e.getAttribute('data-route'), text: e.textContent })));
    const arcTiles = tiles.filter((t) => /^\/arcade\//.test(t.route ?? ''));
    check('…one Arcade for your two arcades: the higher-level one', arcs.length === 2 && arcTiles.length === 1 && arcTiles[0].route === `/arcade/${arc}` && /Lv \d+/.test(arcTiles[0].text) && /best of 2/.test(arcTiles[0].text), JSON.stringify(tiles));
    check('…and your farm', tiles.some((t) => /^\/farm\//.test(t.route ?? '')));
    await shot('02-sheet');
    await page.click(`[data-testid=world-go][data-route="/arcade/${arc}"]`);
    await page.waitForTimeout(3500);
    check('it takes you into the arcade', await waitFor('[data-testid=arcade-screen], [data-testid=arcade-hall], canvas', 25000));
    check('…where nothing floats over it: no Worlds button in the arcade', (await page.locator('[data-testid=worlds-button]').count()) === 0);
    await shot('03-arcade');
    await nav('/home'); await page.waitForTimeout(3500);
    check('…none at home either', (await page.locator('[data-testid=worlds-button]').count()) === 0);
    await nav('/play/tracecraft'); await page.waitForTimeout(3000);
    check('…nor in a game', (await page.locator('[data-testid=worlds-button]').count()) === 0);
    await nav('/world'); await page.waitForTimeout(2500);
    check('…and it is back on the map', (await page.locator('[data-testid=hud-rail] [data-testid=worlds-button]').count()) === 1);
    await tid('worlds-button').first().click();
    await waitFor('[data-testid=worlds-sheet]', 8000);
    await page.click('[data-testid=world-go][data-route="/home"]');
    await page.waitForTimeout(2500);
    check('Home is one tap away from the map', await page.evaluate(() => location.pathname === '/home' || !!document.querySelector('[data-testid=home-screen], canvas')));
  } catch (e) {
    check(`${tag}: no crash`, false, String(e?.stack ?? e).slice(0, 400));
    await shot('zz-crash');
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
  await browser.close();
}

// (one browser per process: the web pass, then the app pass)
if (process.argv[2]) {
  await run(process.argv[2] === 'app');
  server.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed (${process.argv[2]})`);
  process.exit(failed ? 1 : 0);
}
server.close();
let bad = 0;
for (const m of ['web', 'app']) bad += spawnSync(process.execPath, [fileURLToPath(import.meta.url), m], { stdio: 'inherit' }).status ? 1 : 0;
process.exit(bad ? 1 : 0);
