// 📱 Outside, in a simulated iPhone app: the hub; a Bump with a friend (their knock is put in, ours comes from the screen)
// and a gift of Ink; a Lasso walk fed a loop of GPS fixes, closed into a Footprint, shown on the map and making a plot
// inside it claimable from afar; the sky card with the Moon and an ISS pass overhead, and its capsule caught.
// Run: npm run build:artifact && node tests/e2e/outside-app.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-outside'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4373;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const HERE = { lng: -122.68, lat: 45.52 };
const K = 111_320 * Math.cos((HERE.lat * Math.PI) / 180);
const at = (east, north) => ({ lng: HERE.lng + east / K, lat: HERE.lat + north / 111_320 });

const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
await ctx.addInitScript(([lat, lng]) => {
  window.__hap = [];
  Object.defineProperty(navigator, 'vibrate', { value: (p) => { window.__hap.push(p); return true; }, configurable: true });
  window.CapacitorCustomPlatform = { name: 'ios', plugins: {} };
  // a GPS we can walk: watchers get every fix we feed in
  window.__fakeGps = () => {
    const watchers = new Map(); let n = 0;
    window.__feed = (pts) => { for (const p of pts) for (const cb of watchers.values()) cb({ coords: { longitude: p[0], latitude: p[1], accuracy: p[3] ?? 6 }, timestamp: p[2] }); };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition: (ok) => ok({ coords: { latitude: lat, longitude: lng, accuracy: 6 }, timestamp: Date.now() }),
      watchPosition: (ok) => { const id = ++n; watchers.set(id, ok); return id; },
      clearWatch: (id) => watchers.delete(id) } });
  };
}, [HERE.lat, HERE.lng]);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n));
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(1200); };
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
const ink = async (uid) => Number((await sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const gpsAt = (uid, p) => sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at, fixed_at, accuracy_m) values ($1, 'gps', $2, $3, $2, $3, now(), now(), 6)
  on conflict (player_id) do update set mode = 'gps', lng = $2, lat = $3, gps_lng = $2, gps_lat = $3, gps_at = now(), fixed_at = now()`, [uid, p.lng, p.lat]);

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'out_app@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'out_app'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__landvasUi.getState().updateSettings({ simpleMode: false }); window.__fakeGps(); });
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`select private.ledger_apply($1, 'ink', 5000, 'admin_adjust', 'test', 'test', 'e2e:outside:ink')`, [me]);
  const pal = (await sql(`insert into auth.users (email) values ('out_pal@example.test') returning id`))[0].id;
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  await as(pal, 'complete_onboarding', { p_username: 'out_pal', p_accept_terms_version: terms });
  await sql(`update players set created_at = now() - interval '10 days', last_active_at = now()`);
  await sql(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [me, pal]);
  await gpsAt(me, at(0, 0)); await gpsAt(pal, at(15, 5));
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());

  // ---- the hub ----
  await nav('/outside');
  check('the Outside hub opens (Bump, the Lasso walk, the real sky, Feel it)', await waitFor('[data-testid=outside-hub]') && await waitFor('[data-testid=bump-card]') && await waitFor('[data-testid=outside-feels]'));
  await shot('01-hub');

  // ---- Bump ----
  await page.click('[data-testid=bump-ready]'); await page.waitForTimeout(300);
  check('“Get ready to bump” arms it', (await page.locator('[data-testid=bump-stage][data-phase=armed]').count()) === 1);
  await sql(`insert into bump_knocks (player_id, lng, lat) values ($1, $2, $3)`, [pal, at(15, 5).lng, at(15, 5).lat]);
  const i0 = await ink(me), j0 = await ink(pal);
  await page.click('[data-testid=bump-tap]');
  check('a bump at the same moment as your friend’s pairs you', await waitFor('[data-testid=bump-with]', 8000), await text('[data-testid=bump-with]'));
  await shot('02-bumped');
  await page.click('[data-testid=bump-gift-50]'); await page.waitForTimeout(1200);
  check('…and a gift of 50 Ink moves from you to them', (await ink(me)) === i0 - 50 && (await ink(pal)) === j0 + 50, `${i0}→${await ink(me)}, ${j0}→${await ink(pal)}`);

  // ---- the sky: the Moon, and the ISS right overhead ----
  await sql(`insert into sky_iss (at, lat, lng, alt_km) select date_trunc('minute', now()) + make_interval(secs => k * 30), $1 + k * 0.6, $2, 420 from generate_series(-12, 12) k on conflict (at) do nothing`, [HERE.lat, HERE.lng]);
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.()); await page.waitForTimeout(1800);
  check('the sky card shows the Moon', /moon|quarter|crescent|gibbous/i.test((await text('[data-testid=sky-moon]')) ?? ''), await text('[data-testid=sky-moon]'));
  check('…an ISS pass over you, up now', /Up now/.test((await text('[data-testid=sky-passes]')) ?? ''), await text('[data-testid=sky-passes]'));
  check('…and its capsule to catch', await waitFor('[data-testid=sky-capsule-catch]', 6000));
  await page.waitForTimeout(2400);
  await shot('03-capsule');
  await page.click('[data-testid=sky-capsule-catch]', { force: true });
  check('catching it pays out', await waitFor('[data-testid=sky-capsule-got]', 8000), (await text('[data-testid=sky-capsule-got]')) || (await page.locator('[data-sonner-toast]').allTextContents()).join(' | '));

  // ---- the Lasso walk ----
  await sql(`update game_config set value = jsonb_set(value, '{lasso,min_minutes}', '0') where key = 'outside'`);
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  await nav('/lasso');
  check('the Lasso walk screen opens', await waitFor('[data-testid=lasso-start]'));
  await page.click('[data-testid=lasso-start]'); await page.waitForTimeout(300);
  // a 140 m square walked over 8 minutes, back to the start
  const now = Date.now(), pts = [];
  const corners = [[0, 0], [140, 0], [140, 140], [0, 140], [0, 0]];
  for (let c = 0; c < 4; c++) for (let i = 0; i < 12; i++) { const f = i / 12, [x0, y0] = corners[c], [x1, y1] = corners[c + 1]; pts.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]); }
  pts.push([2, 1]);
  const fixes = pts.map(([x, y], i) => { const p = at(x, y); return [p.lng, p.lat, now - 8 * 60_000 + (i / (pts.length - 1)) * 8 * 60_000, 6]; });
  await page.evaluate((f) => window.__feed(f), fixes);
  await page.waitForTimeout(1300);
  check('the walk is drawn as you go (walked, area, back to start)', /m/.test((await text('[data-testid=lasso-stats]')) ?? ''), (await text('[data-testid=lasso-stats]'))?.replace(/\s+/g, ' '));
  await shot('04-walking');
  check('back at the start, “Close the loop” lights up', await page.locator('[data-testid=lasso-close]').isEnabled());
  await page.click('[data-testid=lasso-close]');
  check('closing it makes your Footprint', await waitFor('[data-testid=lasso-footprint]', 8000), (await text('[data-testid=lasso-footprint]'))?.slice(0, 60));
  await shot('05-footprint');
  const inside = cellAt(at(70, 70).lng, at(70, 70).lat);
  const d = await as(me, 'plot_details', { p_gx: inside[0], p_gy: inside[1] });
  check('a plot inside it is claimable from where you stand', d?.reach?.in_reach === true && d?.reach?.footprint === true, JSON.stringify(d?.reach));
  await nav('/world'); await page.waitForTimeout(3500);
  const feats = await page.evaluate(async () => { const m = window.__landvasMap; const s = m?.getSource?.('lv-lasso'); if (!s) return null; const d = s.getData ? await s.getData() : s._data; return d?.features?.length ?? -1; });
  check('your Footprint is drawn on the map', feats === 1, String(feats));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('ran to the end', false, String(e?.message ?? e).slice(0, 400));
  await shot('zz-error');
}
await browser.close(); server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
