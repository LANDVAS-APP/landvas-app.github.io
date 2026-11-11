// Real-browser test of Travel plots (local-mode build):
//  - the purchase screen has Travel as one square that opens its two subplots (Train, Plane)
//  - a Train plot: search Denver, see the ride (board at Salt Lake City, stops on the way), board
//  - riding: the explorer is in a train, the bar shows the next stop and time left; GPS doesn't pull it back
//  - arriving: a souvenir stamp, the explorer stands at Denver Station; the station has a building on the map
//  - the passport lists the stamp; heading home hands the explorer back to GPS
// Run: npm run build:artifact && node tests/e2e/travel.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-travel');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4201, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 }; // downtown Salt Lake City
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
// HUD buttons that aren't happening right now sit in the map's "+" tray: open it first if needed
async function hud(id) {
  const el = page.locator(`[data-testid=${id}]`).first();
  if (!(await el.isVisible().catch(() => false))) { await page.click('[data-testid=hud-more]'); await page.waitForTimeout(450); }
  await el.click();
}
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const URL = `http://localhost:${PORT}/?e2e=1`;
const explorer = () => page.evaluate(() => window.__landvasExplorer.getState().state);
const refresh = () => page.evaluate(() => window.__landvasTravel.refresh());

async function clickPlot(gx, gy) {
  await page.evaluate(() => document.querySelector('[aria-label="Close plot panel"]')?.click()); await page.waitForTimeout(300);
  await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; m.fire('dragstart'); const n = Math.PI * (1 - 2 * (gy + 0.5) / G); m.jumpTo({ center: [((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))], zoom: 20.4 }); }, [gx, gy, G]);
  await page.waitForTimeout(1200);
  const s = await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; const n = Math.PI * (1 - 2 * (gy + 0.5) / G); const pt = m.project([((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + pt.x, y: r.top + pt.y }; }, [gx, gy, G]);
  await page.mouse.click(s.x, s.y); await page.waitForSelector('[data-testid=plot-panel]', { timeout: 10000 }); await page.waitForTimeout(1000);
}
async function signUp(email, username) {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) { await page.locator('button,a').filter({ hasText: /sign in/i }).first().click(); }
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
}
/** sign out and back to the sign-in screen, without reloading (the local database lives in this page) */
async function switchUser() {
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1500);
}
/** fast-forward the trip under way to its arrival, and let the game check in */
async function arrive() {
  await sql(`update travel_trips set arrives_at = now() - interval '1 second' where not arrived`);
  await sql(`update explorers set fixed_at = fixed_at - interval '1 hour'`);
  await refresh(); await page.waitForTimeout(2500);
}

try {
  await page.goto(URL, { waitUntil: 'load' });
  // ---- another traveller: pip flies Salt Lake City → London ---------------------------------------------------------
  await signUp('pip@example.test', 'pip_pilot');
  await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 30000 }); await page.waitForTimeout(2500);
  const here = ll(START.gx, START.gy);
  await api('reportPosition', here.longitude, here.latitude, 8);
  const pipStart = await api('claimStarter', START.gx + 4, START.gy + 3, 'Pip field');
  await api('setGroupKind', pipStart.group_id, 'plane');
  await api('travelDepart', 'plane', 'ap:LHR');
  await switchUser();
  await signUp('tess@example.test', 'tess_travel');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);

  // ---- buy a plot as Travel · Train ---------------------------------------------------------------------------------
  for (let tries = 0; tries < 3; tries++) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await clickPlot(START.gx, START.gy).catch(() => {});
    if (await page.locator('[data-testid=claim-plot]').count()) break;
  }
  await page.click('[data-testid=buy-as-travel]'); await page.waitForTimeout(500);
  const subs = await page.locator('[data-testid=buy-subplots] [role=radio]').allInnerTexts();
  check('Travel opens its two subplots: Train and Plane', subs.length === 2 && /Train/.test(subs[0]) && /Plane/.test(subs[1]), subs.join(' / ').replace(/\n/g, ' '));
  check('…Train first', (await page.locator('[data-testid=buy-as-train]').getAttribute('aria-checked')) === 'true');
  await page.click('[data-testid=buy-details-toggle]'); await page.waitForTimeout(400);
  check('details include the Train and Plane subplots', (await page.locator('[data-testid=buy-detail-train]').count()) === 1 && (await page.locator('[data-testid=buy-detail-plane]').count()) === 1);
  await page.click('[data-testid=buy-details-toggle]'); await page.waitForTimeout(300);
  await page.locator('[data-testid=plot-kind-choice]').scrollIntoViewIfNeeded(); await shot('00-buy-travel');
  check('the claim button says Travel · Train', /Travel · Train/i.test(await page.locator('[data-testid=claim-plot]').innerText()));
  await page.click('[data-testid=claim-plot]');
  await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 }); await page.waitForTimeout(2200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const groups = await api('myGroups');
  check('the plot is a Train plot', groups[0]?.kind === 'train', groups[0]?.kind);

  // the plot panel: a Travel card and a ride button
  await clickPlot(START.gx, START.gy);
  check('the plot panel has the Travel card', (await page.locator('[data-testid=travel-plot-card]').count()) === 1);
  await shot('01-plot-panel');
  await page.click('[data-testid=open-travel]'); await page.waitForTimeout(800);

  // ---- search and plan ----------------------------------------------------------------------------------------------
  await page.waitForSelector('[data-testid=travel-pane-train]', { timeout: 10000 });
  check('2 trips left today', /2 trips left/.test(await page.locator('[data-testid=travel-trips-left]').innerText()));
  await page.fill('[data-testid=travel-search]', 'denver'); await page.waitForTimeout(1500);
  await page.waitForSelector('[data-testid=travel-stop][data-stop="us:DEN"]', { timeout: 10000 });
  check('searching finds Denver Station', true);
  check('…and the city of Denver too', (await page.locator('[data-testid=travel-place]').count()) >= 1);
  await shot('02-search');
  await page.click('[data-testid=travel-stop][data-stop="us:DEN"]');
  await page.waitForSelector('[data-testid=plan-from]', { timeout: 15000 });
  check('the ride boards at Salt Lake City', /Salt Lake City/.test(await page.locator('[data-testid=plan-from]').innerText()));
  const plan = await api('travelPlan', 'train', 'us:DEN');
  check('the train stops at the real stations on the way', plan.stops.some((s) => /Grand Junction/.test(s.name)) && (await page.locator('[data-testid=plan-stops] li').count()) === plan.stops.length);
  check('the ride is a real distance', plan.km > 590 && plan.km < 800, `${plan.km} km, ${plan.seconds}s, ${plan.stops.length} stops: ${plan.stops.map((s) => s.name).join(', ')}`);
  await shot('03-plan');
  await page.click('[data-testid=travel-board]'); await page.waitForTimeout(2500);
  // the test takes longer than the 2-minute ride: slow this train down 30× so it only arrives when the test says so
  await sql(`update explorers set speed_mps = speed_mps / 30 where trip_id = (select id from travel_trips where mode = 'train' and not arrived)`);
  await sql(`update travel_trips set arrives_at = departs_at + (arrives_at - departs_at) * 30 where mode = 'train' and not arrived`);
  await refresh(); await page.waitForTimeout(1200);

  // ---- riding -------------------------------------------------------------------------------------------------------
  await page.waitForSelector('[data-testid=travel-bar]', { timeout: 10000 });
  check('the bar says where you are going', /Denver/.test(await page.locator('[data-testid=travel-bar-title]').innerText()));
  check('the bar shows the next stop', /Provo/.test(await page.locator('[data-testid=travel-next-stop]').innerText().catch(() => '')));
  check('your explorer rides the train', await page.evaluate(() => document.querySelector('.lv-explorer')?.classList.contains('ride-train')));
  const ex = await explorer();
  check('the explorer is travelling', ex?.mode === 'travel' && ex.traveling && ex.trip?.to?.id === 'us:DEN');
  // other travellers show while you're away: pip's plane, with their name
  await page.evaluate(() => { const m = window.__landvasMap; m.jumpTo({ center: [-60, 52], zoom: 2.2 }); }); await page.waitForTimeout(3500);
  check('pip’s flight shows on the map, with their name', (await page.locator('[data-testid=traveller][data-user=pip_pilot]').count()) === 1
    && /@pip_pilot/.test(await page.locator('[data-testid=traveller][data-user=pip_pilot]').innerText()));
  await shot('04b-travellers-map');
  await hud('travel-button'); await page.waitForTimeout(700);
  await page.locator('[role=tab]').filter({ hasText: /Travellers/ }).first().click(); await page.waitForTimeout(1500);
  const row = await page.locator('[data-testid=traveller-row]').first().innerText().catch(() => '');
  check('the Travellers list has pip flying to London', /pip_pilot/.test(row) && /London Heathrow/.test(row) && /lands in/.test(row), row.replace(/\n/g, ' '));
  await shot('04c-travellers-list');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.evaluate(() => { const m = window.__landvasMap; m.jumpTo({ center: [-109.5, 39.5], zoom: 6.4 }); }); await page.waitForTimeout(1000);
  // halfway: past a few stations, on the line between them
  await sql(`update explorers set fixed_at = fixed_at - make_interval(secs => ${Math.round(plan.seconds * 30 * 0.5)})`);
  await refresh(); await page.waitForTimeout(2000);
  const half = await explorer();
  check('halfway it has moved on past the first stations', half.trip?.leg >= 2 && half.traveling, `leg ${half.trip?.leg}, next ${plan.stops[half.trip?.leg]?.name}`);
  await page.evaluate(() => { const m = window.__landvasMap; m.jumpTo({ center: [-109.5, 39.5], zoom: 6.4 }); }); await page.waitForTimeout(2500);
  await shot('04-riding');
  const gps = await api('reportPosition', ll(START.gx, START.gy).longitude, ll(START.gx, START.gy).latitude, 8);
  check('GPS doesn’t pull you back while away', gps.accepted === false && gps.away === true);

  // ---- arriving -----------------------------------------------------------------------------------------------------
  await arrive();
  await page.waitForSelector('[data-testid=travel-arrival]', { timeout: 15000 }).catch(async (e) => {
    console.log('DEBUG trips', JSON.stringify(await sql(`select mode, arrived, leg, arrival is not null has_arrival, arrival_seen, arrives_at < now() due from travel_trips order by departs_at`)));
    console.log('DEBUG explorers', JSON.stringify(await sql(`select mode, trip_id is not null trip, dest_lng, fixed_at from explorers`)));
    console.log('DEBUG ui', JSON.stringify(await page.evaluate(() => window.__landvasTravel.ui.getState().arrival)));
    throw e;
  });
  check('arriving gives a new stamp', (await page.locator('[data-testid=arrival-new-stamp]').count()) === 1);
  await shot('05-arrival');
  await page.click('[data-testid=arrival-close]'); await page.waitForTimeout(800);
  const there = await explorer();
  check('you’re really at Denver Station', Math.abs(there.lng + 104.99961) < 0.001 && !there.traveling, `${there.lng},${there.lat}`);
  check('the bar says you’re in Denver', /You’re in Denver/.test(await page.locator('[data-testid=travel-bar-title]').innerText()));
  await page.evaluate(() => { const m = window.__landvasMap; m.jumpTo({ center: [-104.9996, 39.7532], zoom: 15 }); }); await page.waitForTimeout(3000);
  await page.waitForSelector('[data-testid=travel-building][data-stop="us:DEN"]', { timeout: 15000 }).catch(() => {});
  check('Denver Station has a building on the map', (await page.locator('[data-testid=travel-building][data-stop="us:DEN"]').count()) === 1);
  await shot('06-denver');
  // really there: the plot panel next to the station is in reach
  const dc = await page.evaluate(() => { const G = 4194304, lng = -104.9996, lat = 39.7532; const r = lat * Math.PI / 180; return { gx: Math.floor((lng + 180) / 360 * G), gy: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * G) }; });
  const pd = await api('plotDetails', dc.gx + 1, dc.gy).catch((e) => ({ err: e.message }));
  check('plots by the station are in reach', pd?.reach?.in_reach === true, JSON.stringify(pd?.reach ?? pd));
  await page.click('[data-testid=travel-building][data-stop="us:DEN"]'); await page.waitForTimeout(1500);
  await page.waitForSelector('[data-testid=stop-info]', { timeout: 10000 });
  check('the building shows who has been', /1 traveller has been here/.test(await page.locator('[data-testid=stop-info]').innerText()));
  await shot('07-stop-info');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ---- passport, then home ------------------------------------------------------------------------------------------
  await hud('travel-button'); await page.waitForTimeout(700);
  await page.locator('[role=tab]').filter({ hasText: /Passport/ }).first().click().catch(async () => { await page.locator('button').filter({ hasText: /Passport/ }).first().click(); });
  await page.waitForSelector('[data-testid=passport-stamp]', { timeout: 10000 });
  check('the passport has the Denver stamp', (await page.locator('[data-testid=passport-stamp]').count()) === 1);
  await shot('08-passport');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.click('[data-testid=travel-home]'); await page.waitForTimeout(1500);
  check('heading home rides back', (await explorer())?.trip?.mode === 'home');
  await arrive();
  await page.click('[data-testid=arrival-close]').catch(() => {}); await page.waitForTimeout(800);
  const back = await explorer();
  check('home again: GPS has the explorer', back?.mode === 'gps' && Math.abs(back.lng - ll(START.gx, START.gy).longitude) < 0.001, `${back?.mode} ${back?.lng}`);
  check('the bar is gone', (await page.locator('[data-testid=travel-bar]').count()) === 0);
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
