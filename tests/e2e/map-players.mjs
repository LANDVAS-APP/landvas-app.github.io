// Real-browser test of other players on the map (local-mode build, a phone):
//  - strangers' explorers never show, however far out in the game they are; only your party's do (out in the game,
//    never on GPS)
//  - the lobbies and profiles offer "Find" only for your party
//  - zooming in and out: your explorer, your party's and the ✈️ fly pin stay on their spots
//  - the ✈️ fly pin: the map pans and zooms while you choose; a tap drops it, another moves it
//  - Settings has "Show my explorer on the map"
// Run: npm run build:artifact && node tests/e2e/map-players.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-map-players'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4234, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
async function someone(name) {
  const id = (await sql(`insert into auth.users (email) values ('${name}@example.test') returning id`))[0].id;
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms });
  await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${id}'`);
  await sql(`insert into player_activity (player_id, kind, detail, at) values ('${id}', 'map', '{}', now() + interval '10 minutes') on conflict (player_id) do update set at = excluded.at`);
  return id;
}
/** put someone's explorer somewhere: mode, where, their real (GPS) spot, and optionally a trip leg heading to dest */
async function explorer(id, mode, at, gps, leg = null) {
  const trip = mode === 'travel' ? (await sql(`insert into travel_trips (player_id, mode, arrives_at) values ($1, 'train', now() + interval '2 hours') returning id`, [id]))[0].id : null;
  await sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at, trip_id, home_lng, home_lat, dest_lng, dest_lat, speed_mps, fixed_at)
             values ($1, $2, $3, $4, $5, $6, now(), $7, $5, $6, $8, $9, $10, now())
             on conflict (player_id) do update set mode = excluded.mode, lng = excluded.lng, lat = excluded.lat, gps_lng = excluded.gps_lng, gps_lat = excluded.gps_lat,
               trip_id = excluded.trip_id, home_lng = excluded.home_lng, home_lat = excluded.home_lat, dest_lng = excluded.dest_lng, dest_lat = excluded.dest_lat,
               speed_mps = excluded.speed_mps, fixed_at = excluded.fixed_at`,
    [id, mode, at.lng, at.lat, gps.lng, gps.lat, trip, leg?.lng ?? null, leg?.lat ?? null, leg ? 1 : null]);
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'mapp@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'map_ana'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]').catch(() => {});
  const p0 = ll(START.gx, START.gy);
  const r0 = await api('reportPosition', p0.longitude, p0.latitude, 8).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
  const here = { lng: p0.longitude, lat: p0.latitude };
  const far = { lng: here.lng - 1.2, lat: here.lat + 0.8 }; // their real homes: ~140 km away
  // tom: staying here on a trip; rae: riding past on a train; gil: right here, but on GPS
  const tom = await someone('map_tom'); await explorer(tom, 'travel', { lng: here.lng + 0.0006, lat: here.lat + 0.0004 }, far);
  const rae = await someone('map_rae'); await explorer(rae, 'travel', { lng: here.lng - 0.0007, lat: here.lat - 0.0003 }, { lng: far.lng + 0.3, lat: far.lat }, { lng: here.lng + 0.4, lat: here.lat - 0.0003 });
  const gil = await someone('map_gil'); await explorer(gil, 'gps', { lng: here.lng + 0.0003, lat: here.lat - 0.0005 }, { lng: here.lng + 0.0003, lat: here.lat - 0.0005 });

  await nav('/world'); await page.waitForTimeout(3000);
  await page.evaluate((h) => window.__landvasUi.getState().requestFly({ lng: h.lng, lat: h.lat, zoom: 16.5 }), here);
  await page.waitForTimeout(5000);
  check('strangers out in the game don’t show on the map', (await page.locator('[data-testid=map-player], [data-testid=group-mate]').count()) === 0);
  await shot('01-no-strangers');

  // tom and ana team up: now tom shows (the party layer), rae and gil don't
  const ana = (await sql(`select id from profiles where username = 'map_ana'`))[0].id;
  const grp = (await sql(`insert into travel_groups (leader_id, code) values ($1, 'MAPTST') returning id`, [ana]))[0].id;
  await sql(`insert into travel_group_members (group_id, player_id) values ($1, $2), ($1, $3)`, [grp, ana, tom]);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(4000);
  check('your party’s explorer shows', await waitFor('[data-testid=group-mate][data-user=map_tom]', 20000));
  check('…and only theirs', (await page.locator('[data-testid=group-mate][data-user=map_rae], [data-testid=map-player]').count()) === 0);
  await shot('02-party-mate');

  // zooming in and out: everyone stays on their spot
  const where = () => page.evaluate(() => {
    const m = window.__landvasMap, c = m.getContainer().getBoundingClientRect();
    const me = document.querySelector('.lv-explorer[data-me="1"]');
    const ex = window.__landvasExplorer.getState().state;
    const off = (el, ll) => { if (!el || !ll) return null; const r = el.getBoundingClientRect(), p = m.project(ll); return Math.round(Math.hypot(r.x + r.width / 2 - c.x - p.x, r.bottom - c.y - (p.y + 6))); };
    return { me: off(me, ex && [ex.lng, ex.lat]), z: m.getZoom() };
  });
  let worst = 0;
  for (const z of [14, 18.5, 12, 17]) {
    await page.evaluate((z) => { const m = window.__landvasMap; m.zoomTo(z, { around: m.unproject([330, 640]), duration: 500 }); }, z);
    for (let i = 0; i < 3; i++) { await page.waitForTimeout(220); const w = await where(); worst = Math.max(worst, w.me ?? 0); }
  }
  check('zooming in and out: your explorer stays on its spot', worst <= 2, `${worst}px off at worst`);
  const mateBox = async () => { const b = await page.locator('[data-testid=group-mate][data-user=map_tom]').boundingBox(); return b; };
  const tomAt = { lng: here.lng + 0.0006, lat: here.lat + 0.0004 };
  let mateWorst = 0;
  for (const z of [15, 18, 16.5]) {
    await page.evaluate((z) => window.__landvasMap.jumpTo({ zoom: z }), z); await page.waitForTimeout(900);
    const b = await mateBox(); const p = await page.evaluate((ll) => { const m = window.__landvasMap, c = m.getContainer().getBoundingClientRect(), q = m.project([ll.lng, ll.lat]); return { x: q.x + c.x, y: q.y + c.y + 6 }; }, tomAt);
    if (b) mateWorst = Math.max(mateWorst, Math.round(Math.hypot(b.x + b.width / 2 - p.x, b.y + b.height - p.y)));
  }
  check('…and so does your party’s', mateWorst <= 3, `${mateWorst}px off at worst`);

  // the ✈️ fly pin
  await page.evaluate(() => window.__landvasMap.jumpTo({ zoom: 9 })); await page.waitForTimeout(800);
  await page.evaluate(() => window.__landvasFly?.getState().setPinMode(true));
  if (!(await page.evaluate(() => !!window.__landvasFly))) await tid('fly-chip').first().click().catch(() => {});
  await page.waitForTimeout(600);
  const z0 = await page.evaluate(() => window.__landvasMap.getZoom());
  await page.mouse.move(215, 430); await page.mouse.wheel(0, -400); await page.waitForTimeout(1200);
  check('choosing where to fly, the map still zooms', (await page.evaluate(() => window.__landvasMap.getZoom())) > z0 + 0.2);
  await page.mouse.click(300, 560); await page.waitForTimeout(800);
  check('a tap drops the pin', await waitFor('[data-testid=fly-pin]', 5000) && await waitFor('[data-testid=pin-sheet]', 5000));
  const pinOff = () => page.evaluate(() => {
    const m = window.__landvasMap, c = m.getContainer().getBoundingClientRect(), pin = window.__landvasFly.getState().pin;
    const r = document.querySelector('[data-testid=fly-pin]').getBoundingClientRect(), p = m.project([pin.lng, pin.lat]);
    return Math.round(Math.hypot(r.x + r.width / 2 - c.x - p.x, r.bottom - c.y - p.y));
  });
  const pinLL = await page.evaluate(() => ({ ...window.__landvasFly.getState().pin }));
  let pinWorst = await pinOff();
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, i < 2 ? -300 : 500); await page.waitForTimeout(400); pinWorst = Math.max(pinWorst, await pinOff()); }
  check('zooming in and out, the pin stays on its spot', pinWorst <= 3, `${pinWorst}px off at worst`);
  const pinLL2 = await page.evaluate(() => ({ ...window.__landvasFly.getState().pin }));
  check('…the place it marks doesn’t change', Math.abs(pinLL.lng - pinLL2.lng) < 1e-9 && Math.abs(pinLL.lat - pinLL2.lat) < 1e-9);
  await shot('03-fly-pin');
  await page.mouse.click(160, 380); await page.waitForTimeout(600);
  const pinLL3 = await page.evaluate(() => ({ ...window.__landvasFly.getState().pin }));
  check('another tap moves it', Math.abs(pinLL3.lng - pinLL.lng) > 1e-6 && (await page.locator('[data-testid=fly-pin]').count()) === 1);
  await page.evaluate(() => window.__landvasFly.getState().setPinMode(false)); await page.waitForTimeout(400);
  check('cancelling takes the pin away', (await page.locator('[data-testid=fly-pin]').count()) === 0);

  // find: only your party
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['party-lobbies'] }));
  await nav('/party?tab=lobbies'); await page.waitForTimeout(2500);
  check('the lobbies don’t offer Find for strangers', (await page.locator('[data-testid=lobby-player-find]').count()) === 0);
  await nav('/u/map_rae'); await page.waitForTimeout(2500);
  check('a stranger’s profile has no “Find on map”', (await page.locator('[data-testid=profile-find-map]').count()) === 0);
  await nav('/u/map_tom'); await page.waitForTimeout(2500);
  check('your party-mate’s does', await waitFor('[data-testid=profile-find-map]', 8000));

  await nav('/settings'); await page.waitForTimeout(2500);
  check('Settings has “Show my explorer on the map”', (await page.locator('#pv-on_map').count()) === 1);
  check('…and “Anyone online can join me”', (await page.locator('#pv-joinable').count()) === 1);
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
