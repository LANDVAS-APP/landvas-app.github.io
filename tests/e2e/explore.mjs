// Real-browser test of "out and about" (local-mode build):
//  - travel groups: lea starts one (she has a Travel · Plane plot), max joins with the code; when lea boards a flight,
//    max rides too and lea sees him on the map — and nobody's location shows while at home
//  - the joystick, planet style: a thumb-stick; buy a Bike in the garage and ride it (faster)
//  - no collectables on the map
//  - "Hide plots": the plot layers go away
// Run: npm run build:artifact && node tests/e2e/explore.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-explore');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4203, G = 4194304;
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
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const URL = `http://localhost:${PORT}/?e2e=1`;
const explorer = () => page.evaluate(() => window.__landvasExplorer.getState().state);
const syncExplorer = () => page.evaluate(async () => { const r = await window.__landvasApi.myExplorer(); window.__landvasExplorer.getState().set(r); return r; });
const refresh = () => page.evaluate(() => window.__landvasTravel.refresh());
const jump = (lng, lat, zoom) => page.evaluate(([lng, lat, zoom]) => { const m = window.__landvasMap; m.fire('dragstart'); m.jumpTo({ center: [lng, lat], zoom }); }, [lng, lat, zoom]);

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
    // GPS is already on from the last account: report where we are
    await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 20000 });
    const p = ll(START.gx, START.gy);
    const r = await api('reportPosition', p.longitude, p.latitude, 8);
    await page.evaluate((r) => window.__landvasExplorer.getState().set(r), r);
  }
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);
}
async function switchUser() {
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(800);
  await nav('/world'); await page.waitForTimeout(1500);
}
async function signIn(email) {
  await switchUser();
  await authForm();
  await page.locator('button').filter({ hasText: /^Sign in$/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi && !document.querySelector('#email'), null, { timeout: 30000 });
  await page.waitForTimeout(3000);
}
async function openTravel(tab) {
  await hud('travel-button'); await page.waitForTimeout(800);
  if (tab) { await page.locator('[role=tab]').filter({ hasText: tab }).first().click(); await page.waitForTimeout(1000); }
}

try {
  await page.goto(URL, { waitUntil: 'load' });
  // ---- lea: a Travel · Plane plot, and a group ------------------------------------------------------------------
  await signUp('lea@example.test', 'lea_lead');
  const here = ll(START.gx, START.gy);
  const s0 = await api('claimStarter', START.gx, START.gy, 'Lea air');
  await api('setGroupKind', s0.group_id, 'plane');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await openTravel(/Group/);
  await page.click('[data-testid=group-create]'); await page.waitForTimeout(1200);
  const code = (await page.locator('[data-testid=group-code]').innerText()).trim();
  check('lea starts a group and gets a code', /^[A-Z0-9]{6}$/.test(code), code);
  await shot('01-group-created');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // ---- max joins with the code ----------------------------------------------------------------------------------
  await switchUser();
  await signUp('max@example.test', 'max_mate');
  await api('claimStarter', START.gx + 3, START.gy + 3, 'Max place');
  await openTravel(/Group/);
  await page.fill('[data-testid=group-code-input]', code);
  await page.click('[data-testid=group-join]'); await page.waitForTimeout(1500);
  const names = await page.locator('[data-testid=group-member]').evaluateAll((els) => els.map((e) => e.dataset.user));
  check('max joins: the group is lea and max', names.join(',') === 'lea_lead,max_mate', names.join(','));
  const wh = await page.locator('[data-testid=member-where]').allInnerTexts();
  check('at home nobody has a location — just "At home"', wh.every((w) => /At home/.test(w)), wh.join(' | '));
  const g0 = await api('travelGroup');
  check('…and the server sends none', g0.group.members.every((m) => m.lng === undefined && m.lat === undefined));
  await shot('02-group-joined');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // ---- lea boards a flight to London: max rides along -----------------------------------------------------------
  await signIn('lea@example.test');
  await openTravel(/Plane/);
  await page.fill('[data-testid=travel-search]', 'heathrow'); await page.waitForTimeout(1500);
  await page.click('[data-testid=travel-stop][data-stop="ap:LHR"]');
  await page.waitForSelector('[data-testid=plan-group]', { timeout: 15000 });
  check('the plan says the group rides along', /Your group rides with you: 1 traveller/.test(await page.locator('[data-testid=plan-group]').innerText()));
  await shot('03-plan-group');
  await page.click('[data-testid=travel-board]'); await page.waitForTimeout(2500);
  const mt = await sql(`select t.mode, t.to_stop, t.with_leader from travel_trips t join profiles p on p.id = t.player_id where p.username = 'max_mate' and not t.arrived`);
  check('max is riding along to London', mt.length === 1 && mt[0].to_stop === 'ap:LHR' && mt[0].with_leader === true, JSON.stringify(mt));
  // slow both flights 30× so they only land when the test says so
  await sql(`update explorers set speed_mps = speed_mps / 30 where mode = 'travel'`);
  await sql(`update travel_trips set arrives_at = departs_at + (arrives_at - departs_at) * 30 where not arrived`);
  await sql(`update explorers set fixed_at = fixed_at - interval '200 seconds' where mode = 'travel'`);
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  await refresh();
  await page.evaluate(() => window.__landvasTravel.qc?.invalidateQueries({ queryKey: ['travel-group'] }));
  await jump(-60, 50, 2.6); await page.waitForTimeout(9000);
  check('lea sees max flying on the map', (await page.locator('[data-testid=group-mate][data-user=max_mate]').count()) === 1);
  await shot('04-group-flying');

  // ---- landing together -----------------------------------------------------------------------------------------
  await sql(`update travel_trips set arrives_at = now() - interval '1 second' where not arrived`);
  await sql(`update explorers set fixed_at = fixed_at - interval '3 hours' where mode = 'travel'`);
  await refresh(); await page.waitForTimeout(2500);
  await page.click('[data-testid=arrival-close]').catch(() => {}); await page.waitForTimeout(800);
  const at = await explorer();
  check('lea landed at Heathrow', Math.abs(at.lat - 51.47) < 0.05 && !at.traveling, `${at.lng},${at.lat}`);
  const g1 = await api('travelGroup');
  const mx = g1.group.members.find((m) => m.username === 'max_mate');
  check('max landed there too (and shows there, not at home)', mx.away && Math.abs(mx.lat - 51.47) < 0.05, JSON.stringify({ away: mx.away, lat: mx.lat }));

  // ---- the joystick: a stick, and a bike ------------------------------------------------------------------------
  await sql(`select private.ledger_apply(id, 'ink', 2000, 'admin_adjust', 'test', 'test', 'e2e:ink:lea') from profiles where username = 'lea_lead'`);
  await page.click('[data-testid=joystick-toggle]'); await page.waitForTimeout(1000);
  check('the joystick is a planet-style stick', (await page.getAttribute('[data-testid=joystick]', 'data-layout')) === 'stick');
  check('walking: 6 km/h, free (no fuel)', /6 km\/h/.test(await page.locator('[data-testid=joystick-speed]').innerText()) && (await page.locator('[data-testid=joystick-tank]').count()) === 0);
  await page.click('[data-testid=open-garage]'); await page.waitForTimeout(700);
  await shot('05-garage');
  await page.click('[data-testid=buy-bike]'); await page.waitForTimeout(1500);
  check('bought a Bike: riding it', (await page.locator('[data-testid=garage-bike]').innerText()).includes('Riding'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  check('the bike: 20 km/h', /20 km\/h/.test(await page.locator('[data-testid=joystick-speed]').innerText()));
  await jump(at.lng, at.lat, 17); await page.waitForTimeout(1500);
  const before = await explorer();
  const pad = await page.locator('[data-testid=joystick-pad]').boundingBox();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
  await page.mouse.down(); await page.mouse.move(pad.x + pad.width / 2 + 60, pad.y + pad.height / 2, { steps: 4 });
  await page.waitForTimeout(3000);
  check('steering, the explorer rides the bike', await page.evaluate(() => document.querySelector('.lv-explorer')?.classList.contains('veh-bike')));
  await shot('06-biking');
  await page.mouse.up(); await page.waitForTimeout(1800);
  const srv = await syncExplorer();
  const east = (srv.lng - before.lng) * 111320 * Math.cos((before.lat * Math.PI) / 180);
  check('…and moved east at bike speed (the server agrees)', east > 10 && east < 45, `${east.toFixed(1)} m (~5 s at 20 km/h)`);

  // ---- the joystick spot sticks: no GPS snap-back, even after a refresh, until you pick GPS or Home -------------------
  await page.click('[data-testid=joystick-close]'); await page.waitForTimeout(800);
  // home from London (skip the flight), then steer away from your real spot at home
  await api('travelHome');
  await sql(`update travel_trips set arrives_at = now() - interval '1 second' where player_id = (select id from profiles where username = 'lea_lead') and not arrived`);
  await sql(`update explorers set fixed_at = fixed_at - interval '30 hours' where player_id = (select id from profiles where username = 'lea_lead')`);
  await api('travelStatus'); await syncExplorer(); await page.waitForTimeout(1500);
  await page.click('[data-testid=arrival-close]').catch(() => {}); await page.waitForTimeout(500);
  await page.click('[data-testid=joystick-toggle]'); await page.waitForTimeout(1200);
  const hx = await syncExplorer();
  await jump(hx.lng, hx.lat, 17); await page.waitForTimeout(800);
  const pad2 = await page.locator('[data-testid=joystick-pad]').boundingBox();
  await page.mouse.move(pad2.x + pad2.width / 2, pad2.y + pad2.height / 2);
  await page.mouse.down(); await page.mouse.move(pad2.x + pad2.width / 2, pad2.y + pad2.height / 2 - 60, { steps: 4 });
  await page.waitForTimeout(2500); await page.mouse.up(); await page.waitForTimeout(1500);
  const spot = await syncExplorer();
  await page.click('[data-testid=joystick-close]'); await page.waitForTimeout(1500);
  check('steered at home: closing the joystick keeps you at the joystick spot (a "Joystick spot" pill)', spot.mode === 'manual' && (await page.locator('[data-testid=joystick-spot]').count()) === 1, `${hx.mode} → ${spot.mode}`);
  // (the local test build keeps its database in memory, so a real reload would wipe it — instead: GPS is on and
  //  permitted here, and must not pull the explorer back; the server side of a refresh is tests/sql/169)
  await page.waitForTimeout(6000);
  const kept = await syncExplorer();
  check('…the spot stays put: GPS doesn’t pull you back', Math.abs(kept.lng - spot.lng) < 1e-6 && Math.abs(kept.lat - spot.lat) < 1e-6 && kept.mode === 'manual', `${kept.mode} ${kept.lng},${kept.lat}`);
  check('…and no "no GPS" popup', (await page.locator('text=/GPS (is )?(required|needed)|no GPS/i').count()) === 0);
  await shot('06b-joystick-spot');
  await page.click('[data-testid=spot-home]'); await page.waitForTimeout(2500);
  const home = await syncExplorer();
  check('🏠 Home: back to your last real location, the pill goes away', home.mode === 'gps' && (await page.locator('[data-testid=joystick-spot]').count()) === 0, `${home.mode} ${home.lng},${home.lat}`);

  // ---- the Hot Zone chip: a sheet with "Fly there" -------------------------------------------------------------------
  const hz = await api('hotZone');
  await page.click('[data-testid=hot-zone-chip]'); await page.waitForSelector('[data-testid=hot-zone-sheet]', { timeout: 10000 });
  check('the Hot Zone chip opens a sheet: fly there, or roll a plot there', (await page.locator('[data-testid=hot-zone-fly]').count()) === 1 && (await page.locator('[data-testid=hot-zone-roll-map]').count()) === 1);
  await shot('06c-hot-zone-sheet');
  await page.click('[data-testid=hot-zone-fly]'); await page.waitForTimeout(6000);
  const c = await page.evaluate(() => { const m = window.__landvasMap; const x = m.getCenter(); return { lng: x.lng, lat: x.lat, z: m.getZoom() }; });
  const hc = ll(hz.today.gx, hz.today.gy);
  check('🗺️ Fly there: the map flies to today’s city (and stays)', Math.abs(c.lng - hc.longitude) < 0.05 && Math.abs(c.lat - hc.latitude) < 0.05, `${hz.today.name}: ${c.lng.toFixed(3)},${c.lat.toFixed(3)} z${c.z.toFixed(1)}`);
  await shot('06d-hot-zone');

  // ---- no collectables on the map (finds were retired) -------------------------------------------------------------
  await jump(srv.lng, srv.lat, 15.6); await page.waitForTimeout(3000);
  check('no collectables on the map', (await page.locator('[data-testid=map-find]').count()) === 0);
  await shot('07-no-finds');

  // ---- lite map ("Hide plots"): plots, art and their effects aren't loaded at all ----------------------------------
  await jump(here.longitude, here.latitude, 18.5); await page.waitForTimeout(2000);
  const has = () => page.evaluate(() => { const m = window.__landvasMap; return { layers: ['lv-plots', 'lv-art', 'lv-groups-line', 'lv-habitats'].filter((id) => !!m.getLayer(id)), sources: ['lv-plots', 'lv-art', 'lv-groups'].filter((id) => !!m.getSource(id)) }; });
  await shot('09-plots-shown');
  check('full map: plot layers loaded', (await has()).layers.length === 4);
  await page.click('[data-testid=mode-button]'); await page.waitForTimeout(500);
  await page.click('[data-testid=hide-plots]'); await page.waitForTimeout(3500);
  const lite = await has();
  check('Lite map: plot layers and their sources are gone, not just hidden', lite.layers.length === 0 && lite.sources.length === 0, JSON.stringify(lite));
  check('…and nothing plot-related is drawn over it', (await page.locator('.lv-bubble, .lv-plot-name, [data-testid=plot-bubble]').count()) === 0);
  await shot('10-lite-map');
  // (the View menu is still open)
  await page.click('[data-testid=hide-plots]'); await page.waitForTimeout(3500);
  check('…and back on, they load again', (await has()).layers.length === 4);
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
