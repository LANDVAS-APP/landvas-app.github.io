// The app's sheets and pop-ups at phone size (simulated iPhone app shell with the iPhone's safe areas), the new
// "Report player" flow, and the warm World map (leaving the World tab parks the map; coming back reuses it).
// For each sheet: nothing off the side of the screen, nothing tappable under the status bar or the home bar.
// Run: npm run build:artifact && node tests/e2e/app-sheets.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4361, G = 4194304;
const OUT = process.env.E2E_OUT || path.resolve('test-results/app-sheets');
fs.mkdirSync(OUT, { recursive: true });
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const [W, H, TOP, BOTTOM] = [393, 852, 59, 34];
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };

const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const here = ll(START.gx, START.gy);
await ctx.addInitScript(([lat, lng]) => {
  const pos = { coords: { latitude: lat, longitude: lng, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
  const Geolocation = {
    checkPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }), requestPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }),
    getCurrentPosition: async () => ({ ...pos, timestamp: Date.now() }),
    watchPosition: async (_o, cb) => { setTimeout(() => cb({ ...pos, timestamp: Date.now() }), 50); return 'w1'; }, clearWatch: async () => {},
  };
  window.CapacitorCustomPlatform = { name: 'ios', plugins: { Geolocation } };
}, [here.latitude, here.longitude]);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: TOP, topMax: TOP, bottom: BOTTOM, bottomMax: BOTTOM, left: 0, leftMax: 0, right: 0, rightMax: 0 } }).catch(() => {});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const nav = async (p, wait = 1500) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(wait); };
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 60000, animations: 'disabled' }).catch(() => {});
const tid = (id) => page.locator(`[data-testid=${id}]:visible`).first();

/** anything sticking out of the screen, or tappable under the status bar / home bar */
const fit = () => page.evaluate(([top, bottom]) => {
  const W = innerWidth, H = innerHeight, out = [];
  if (document.scrollingElement.scrollWidth > W + 1) out.push('page scrolls sideways');
  const inClip = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { const r = p.getBoundingClientRect(); if (r.left >= -1 && r.right <= W + 1) return true; } } return false; };
  for (const el of document.querySelectorAll('[role=dialog] *, [data-radix-popper-content-wrapper] *, .lv-dialog *, [data-sheet] *')) {
    if (el.closest('svg, canvas, [aria-hidden=true]')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const label = (el.getAttribute('data-testid') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if ((r.right > W + 1 || r.left < -1) && !inClip(el)) out.push(`off the side: ${el.tagName.toLowerCase()} "${label}"`);
    if (el.matches('button, a, input, textarea, [role=button], [role=radio]') && r.bottom > 0 && r.top < H) {
      if (r.top < top - 2) out.push(`under the status bar: "${label}"`);
      if (r.bottom > H - bottom + 2 && r.top < H - 4) out.push(`under the home bar: "${label}"`);
    }
  }
  return [...new Set(out)].slice(0, 6);
}, [TOP, BOTTOM]);
async function sheet(name, open, close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }) {
  try { await open(); } catch (e) { check(`${name}: opens`, false, String(e).slice(0, 90)); return; }
  await page.waitForTimeout(900);
  const bad = await fit();
  await shot(`sheet-${name.replace(/[^a-z0-9]+/gi, '-')}`);
  check(`${name}: fits the phone (safe areas, nothing off the side)`, bad.length === 0, bad.join(' | '));
  await close();
}

async function signUp(email, username) {
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  const create = page.locator('button').filter({ hasText: /^Create account$/ }).first();
  if (await create.isVisible().catch(() => false)) await create.click().catch(() => {});
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2000);
  await page.click('[data-testid=place-gps]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape').catch(() => {});
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  // someone to report
  await signUp('bo@example.test', 'bo_reported');
  const bo = (await sql(`select id from profiles where username = 'bo_reported'`))[0].id;
  await page.evaluate(async () => { await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(800);
  await nav('/welcome', 1200);
  await signUp('ria@example.test', 'ria_sheets');
  const me = (await sql(`select id from profiles where username = 'ria_sheets'`))[0].id;
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`).catch(() => {});
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 50000) on conflict (player_id, resource) do update set amount = 50000`);
  await api('claimStarter', START.gx, START.gy).catch(() => {});
  await page.evaluate(() => window.__landvasQc.invalidateQueries());

  // ---- report a player ----
  await nav(`/u/bo_reported`, 2200);
  check('a profile has a Report button', await tid('report-player').count() === 1);
  await sheet('Report player sheet', async () => { await tid('report-player').click(); await page.waitForSelector('[data-testid=report-player-sheet]', { timeout: 5000 }); }, async () => {});
  check('…Send is off until a reason is picked', await tid('report-player-send').isDisabled());
  await tid('report-reason-name').click();
  await tid('report-player-details').fill('rude username');
  await tid('report-player-send').click();
  await page.waitForTimeout(1200);
  const cases = await sql(`select reason, subject_player_id, details->>'details' as d from moderation_cases where reporter_id = '${me}' and kind = 'report'`);
  check('…the report reaches the moderation queue', cases.length === 1 && cases[0].reason === 'player_name' && cases[0].subject_player_id === bo && cases[0].d === 'rude username', JSON.stringify(cases));
  check('…and the sheet closes', await page.locator('[data-testid=report-player-sheet]').count() === 0);
  const again = await api('reportPlayer', bo, 'name').catch((e) => ({ err: String(e) }));
  check('…reporting the same thing twice adds nothing', again?.duplicate === true, JSON.stringify(again));
  const self = await api('reportPlayer', me, 'spam').then(() => 'ok').catch((e) => String(e));
  check('…you can’t report yourself', /report yourself|cannot_report_self/.test(self), self.slice(0, 80));

  // ---- the World tab's sheets ----
  await nav('/world', 4000);
  await page.keyboard.press('Escape').catch(() => {});
  await sheet('Plot panel (your plot)', async () => { await page.evaluate((c) => window.__landvasUi.getState().select(c), { gx: START.gx, gy: START.gy }); await page.waitForSelector('[data-testid=plot-panel]', { timeout: 8000 }); },
    async () => { await page.evaluate(() => window.__landvasUi.getState().select(null)); await page.waitForTimeout(500); });
  await sheet('Plot panel (free plot)', async () => { await page.evaluate((c) => window.__landvasUi.getState().select(c), { gx: START.gx + 3, gy: START.gy + 3 }); await page.waitForSelector('[data-testid=plot-panel]', { timeout: 8000 }); },
    async () => { await page.evaluate(() => window.__landvasUi.getState().select(null)); await page.waitForTimeout(500); });
  await sheet('Notifications', async () => { await tid('notification-bell').click(); });
  await sheet('Profile menu', async () => { await tid('hud-avatar').click(); });
  await sheet('Grimoire', async () => { await tid('grimoire-button').click(); });

  // ---- the warm map: leave the World tab and come back ----
  // (your explorer out on the map, so its marker is part of what must come back exactly once)
  const pos = await api('reportPosition', here.longitude, here.latitude, 8).catch(() => null);
  if (pos) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), pos);
  await page.waitForTimeout(1500);
  const explorers = () => page.evaluate(() => document.querySelectorAll('[data-testid=world-map] .lv-explorer').length);
  const ex0 = await explorers();
  const tag = await page.evaluate(() => { const m = window.__landvasMap; m.__sweepTag = Math.random(); return m.__sweepTag; });
  const count = () => page.evaluate(() => ({ markers: document.querySelectorAll('.maplibregl-marker:not(.lv-explorer)').length, explorers: document.querySelectorAll('.lv-explorer').length, layers: window.__landvasMap?.getStyle()?.layers?.length ?? 0, sources: Object.keys(window.__landvasMap?.getStyle()?.sources ?? {}).length, canvases: document.querySelectorAll('.maplibregl-canvas').length }));
  let before = await count();
  const times = [];
  for (let i = 0; i < 3; i++) {
    if (i === 1) before = await count(); // (after one round trip: overlays that load late are in by now)
    await nav('/hub', 1500);
    const parked = await page.evaluate(() => [...document.querySelectorAll('.maplibregl-canvas')].map((c) => getComputedStyle(c).visibility + (c.closest('[data-testid=world-map]') ? ':on-screen' : ':parked')).join(','));
    if (i === 0) check('off the World tab the map waits off screen (parked, hidden, drawing nothing)', parked === 'hidden:parked', parked);
    const t0 = Date.now();
    await page.evaluate(() => window.__landvasNav('/world'));
    await page.waitForFunction(() => !!document.querySelector('.maplibregl-canvas') && window.__landvasMap?.loaded(), null, { timeout: 30000 });
    times.push(Date.now() - t0);
    await page.waitForTimeout(1200);
  }
  const ex1 = await explorers();
  const hasState = await page.evaluate(() => !!window.__landvasExplorer?.getState().state);
  // (in local mode the test GPS can let the explorer go meanwhile; when it's out, it's on the map exactly once)
  check('…your explorer is back on the map, once', ex1 === (hasState ? 1 : 0), `${ex0} → ${ex1} (explorer out: ${hasState})`);
  const same = await page.evaluate((tag) => window.__landvasMap?.__sweepTag === tag, tag);
  check('coming back to the World tab reuses the same map (no rebuild)', same);
  const after = await count();
  // (layer and source ids can't repeat — MapLibre refuses — so markers are what could pile up; overlays may still arrive late)
  check('…nothing piles up after three round trips (markers, map canvases)', after.markers <= before.markers && after.explorers <= 1 && after.canvases === 1, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  console.log(`      back on the map in ${times.join(', ')} ms (local mode: the in-browser database adds its own time)`);
  // a plot claimed while away shows up on the way back
  await nav('/hub', 1200);
  await api('acquirePlot', START.gx + 1, START.gy).catch(() => {});
  await nav('/world', 2500);
  check('the map still works after coming back (a plot can be opened)', await (async () => { await page.evaluate((c) => window.__landvasUi.getState().select(c), { gx: START.gx + 1, gy: START.gy }); return page.waitForSelector('[data-testid=plot-panel]', { timeout: 8000 }).then(() => true).catch(() => false); })());
  await page.evaluate(() => window.__landvasUi.getState().select(null));

  // ---- other screens' sheets ----
  await nav('/players', 1800);
  await sheet('A screen’s (i) explainer', async () => { await tid('page-info').click(); });
  await nav('/hub', 1800);
  await sheet('Daily streak', async () => { await tid('hub-streak').click({ timeout: 5000 }); });
  await sheet('Daily wheel', async () => { await page.locator('[data-testid=hub-spin]').first().click({ timeout: 4000 }); });
  // the roll reveal from simple mode
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: true }));
  await nav('/world', 2000);
  await sheet('Plot roll', async () => { await page.locator('button').filter({ hasText: /Buy a plot/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(4500); }, async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(800); });
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
} catch (e) {
  check('ran to the end', false, String(e).slice(0, 300));
  await shot('error');
}
const errs = [...new Set(errors)].filter((e) => !/WebGL|ResizeObserver/.test(e));
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
