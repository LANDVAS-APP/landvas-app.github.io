// Real-browser check of the plot sheet's place cards (local-mode build): your farm, arcade and business plots offer
// "Enter", and another player tapping them sees the visit card — each sheet asks about its places in ONE call
// (places_for_plot), never the five old per-kind lookups.
// Run: npm run build:artifact && node tests/e2e/plot-places.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-plot-places');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4198, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 20 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

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
  await page.mouse.click(s.x, s.y); await page.waitForSelector('[data-testid=plot-panel]', { timeout: 10000 }); await page.waitForTimeout(1500);
}
/** count the calls the app makes (by name) while fn runs */
async function callsDuring(fn) {
  await page.evaluate(() => {
    const b = window.__landvasBackend;
    if (!b.__counted) { const orig = b.rpc.bind(b); b.rpc = (name, args) => { (window.__calls ??= []).push(name); return orig(name, args); }; b.__counted = true; }
    window.__calls = [];
  });
  await fn();
  return page.evaluate(() => window.__calls.slice());
}
async function authForm() {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) { await page.locator('button,a').filter({ hasText: /sign in/i }).first().click(); }
  await page.waitForSelector('#email', { timeout: 30000 });
}
async function signUp(email, username) {
  await authForm();
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  // the first account is asked where to start; after that GPS is already allowed
  await page.waitForFunction(() => !!document.querySelector('[data-testid=place-gps]') || !!document.querySelector('.lv-explorer'), null, { timeout: 12000 }).catch(() => {});
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]');
  else if (!(await page.locator('.lv-explorer').count())) {
    await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 20000 });
    const p = ll(START.gx, START.gy);
    const r = await api('reportPosition', p.longitude, p.latitude, 8);
    await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r);
  }
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);
}
const PLOTS = [['farm', 0], ['arcade', 2], ['business', 4]];

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await signUp('olive@example.test', 'olive_owner');
  for (const [, dx] of PLOTS) {
    for (let tries = 0; tries < 3; tries++) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await clickPlot(START.gx + dx, START.gy).catch(() => {});
      if (await page.locator('[data-testid=claim-plot]').count()) break;
    }
    await page.click('[data-testid=claim-plot]');
    await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 }); await page.waitForTimeout(2200);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  const groups = await api('myGroups');
  for (const [kind, dx] of PLOTS) {
    const g = groups.find((x) => x.cells.some((c) => c[0] === START.gx + dx && c[1] === START.gy));
    await api('setGroupKind', g.id, kind);
  }
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1500);

  // your own places: one call asks about them, and the sheet offers the way in
  for (const [kind, dx] of PLOTS) {
    const calls = await callsDuring(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); await clickPlot(START.gx + dx, START.gy); });
    const old = calls.filter((c) => /^(habitat|farm|biz|arcade|realm)_for_plot$/.test(c));
    check(`your ${kind}: one places call, no per-kind lookups`, calls.filter((c) => c === 'places_for_plot').length <= 1 && old.length === 0, JSON.stringify(calls.filter((c) => /for_plot/.test(c))));
    const btn = `[data-testid=open-${kind}]`;
    check(`your ${kind}: the sheet offers Enter`, await page.locator(btn).count() > 0);
    await shot(`own-${kind}`);
  }

  // someone else tapping them: the visit card for each place
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1500);
  await signUp('vic@example.test', 'vic_visitor');
  for (const [kind, dx] of PLOTS) {
    const calls = await callsDuring(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); await clickPlot(START.gx + dx, START.gy); });
    const old = calls.filter((c) => /^(habitat|farm|biz|arcade|realm)_for_plot$/.test(c));
    check(`visiting the ${kind}: no per-kind lookups`, old.length === 0, JSON.stringify(calls.filter((c) => /for_plot/.test(c))));
    const card = await page.locator(`[data-testid=visit-${kind}]`).count();
    const text = card ? await page.locator(`[data-testid=visit-${kind}]`).innerText() : '';
    check(`visiting the ${kind}: the visit card shows`, card > 0 && (kind === 'farm' ? /growing/ : /olive_owner/).test(text), text.replace(/\s+/g, ' ').slice(0, 80));
    await shot(`visit-${kind}`);
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('run', false, String(e?.stack ?? e).slice(0, 400));
  await shot('failure');
} finally {
  await browser.close(); server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
