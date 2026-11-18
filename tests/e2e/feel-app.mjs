// The apps' new feel, in a simulated iPhone on iOS 16.1 (an older phone): Smooth mode switches itself on and the
// frame-rate meter works (Settings); the Treasure Map's sonar opens, reads the compass and pings in your hand; Pandora's
// lid is pried open by tipping the phone; the Storm Coil is cranked by swirling it; ink bombs are flicked at the
// Leviathan. A fake Haptics plugin records every hit, and motion/compass events are played in like a real phone's.
// Run: npm run build:artifact && node tests/e2e/feel-app.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-feel-app'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4371;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const PORTLAND = { lng: -122.68, lat: 45.52 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', userAgent: UA });
await ctx.addInitScript(([lat, lng]) => {
  // (with a custom platform, Capacitor runs the plugins' web versions: haptics come out as navigator.vibrate)
  window.__hap = [];
  Object.defineProperty(navigator, 'vibrate', { value: (p) => { window.__hap.push(p); return true; }, configurable: true });
  const pos = { coords: { latitude: lat, longitude: lng, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
  const Geolocation = {
    checkPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }), requestPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }),
    getCurrentPosition: async () => ({ ...pos, timestamp: Date.now() }),
    watchPosition: async (_o, cb) => { setTimeout(() => cb({ ...pos, timestamp: Date.now() }), 50); return 'w1'; },
    clearWatch: async () => {},
  };
  window.CapacitorCustomPlatform = { name: 'ios', plugins: { Geolocation } };
  // where you are, for the sonar (put back over the app's own GPS once it has started)
  window.__fakeGps = () => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok) => ok({ ...pos, timestamp: Date.now() }), watchPosition: (ok) => { setTimeout(() => ok({ ...pos, timestamp: Date.now() }), 50); return 1; }, clearWatch: () => {} } });
  // a phone's sensors, played in by the test
  window.__orient = (o) => { const e = new Event('deviceorientation'); Object.assign(e, o); window.dispatchEvent(e); };
  window.__motion = (o) => { const e = new Event('devicemotion'); Object.assign(e, o); window.dispatchEvent(e); };
}, [PORTLAND.lat, PORTLAND.lng]);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n));
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
const hapN = () => page.evaluate(() => window.__hap.length);
const orient = (o) => page.evaluate((o) => window.__orient(o), o);
const motion = (o) => page.evaluate((o) => window.__motion(o), o);

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'feel_app@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'feel_app'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:feel:ink')`);
  const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + (k % 5) * 3, ${by} + (k / 5) * 3, '${me}', (select id from plot_types limit 1), 'rare', now() - interval '2 days' from generate_series(0, 9) k on conflict (gx, gy) do nothing`);
  const give = async (kind, i) => (await api('admin.giveEnchantment', me, kind, 'e2e: feel', { gx: bx + 1 + i * 3, gy: by + 1 })).id;
  const ids = { map: await give('map', 0), pandora: await give('pandora', 1), stormcoil: await give('stormcoil', 2) };
  check('the owner gives a Treasure Map, a Pandora’s Box and a Storm Coil', Object.values(ids).every(Boolean));

  // ---- Smooth mode on an older iPhone, and the frame-rate meter ----
  const cls = () => page.evaluate(() => document.documentElement.className);
  check('iOS 16.1: Smooth mode is on by itself (html.lv-lite) and the old web engine is known', /\blv-lite\b/.test(await cls()) && /\blv-old-webkit\b/.test(await cls()), (await cls()).match(/lv-[\w-]+/g)?.join(' '));
  await nav('/settings');
  check('Settings has Smooth mode (Automatic / On / Off)', await waitFor('[data-testid=settings-smooth]'), (await text('[data-testid=settings-smooth]'))?.slice(0, 90));
  check('…and says this phone is one of them', /like this one/.test((await text('[data-testid=settings-smooth]')) ?? ''));
  await page.click('[data-testid=settings-smooth-off]'); await page.waitForTimeout(300);
  check('Smooth mode Off takes it away', !/\blv-lite\b/.test(await cls()));
  await page.click('[data-testid=settings-smooth-auto]'); await page.waitForTimeout(300);
  check('…Automatic brings it back', /\blv-lite\b/.test(await cls()));
  await page.locator('#fps').click(); await page.waitForTimeout(2300);
  check('Show frame rate puts a meter in the corner', /\d+ fps · worst \d+ ms/.test((await text('[data-testid=fps-meter]')) ?? ''), await text('[data-testid=fps-meter]'));
  await shot('01-settings');
  await page.locator('#fps').click(); await page.waitForTimeout(300);
  check('…and off again', (await page.locator('[data-testid=fps-meter]').count()) === 0);

  // ---- the Treasure Map's sonar ----
  await nav(`/grimoire/${ids.map}`);
  await waitFor('[data-testid=map-scene]');
  if (await page.locator('[data-testid=map-draw]').count()) { await page.click('[data-testid=map-draw]'); await page.waitForTimeout(1800); }
  const sonars = page.locator('[data-testid=map-pieces] [data-testid=sonar-open]');
  check('each missing map piece has a 🧭 sonar button', (await sonars.count()) > 0, `${await sonars.count()} pieces`);
  if (await sonars.count()) {
    await page.evaluate(() => window.__fakeGps());
    await sonars.first().click();
    check('the sonar opens', await waitFor('[data-testid=sonar]', 8000));
    await page.waitForTimeout(800);
    check('…finds you and how far it is', /\d/.test((await text('[data-testid=sonar-dist]')) ?? '') || (await page.locator('[data-testid=sonar-there]').count()) > 0, await text('[data-testid=sonar-dist]'));
    const before = await hapN();
    for (let i = 0; i < 8; i++) { await orient({ webkitCompassHeading: 40 + i, alpha: 0, beta: 5, gamma: 0 }); await page.waitForTimeout(250); }
    check('…reads the compass and says which way to turn', /Turn|Straight|Behind/.test((await text('[data-testid=sonar-turn]')) ?? ''), await text('[data-testid=sonar-turn]'));
    check('…and pings in your hand', (await hapN()) > before, `${(await hapN()) - before} hits`);
    await shot('02-sonar');
    await page.click('[data-testid=sonar-close]'); await page.waitForTimeout(400);
  }

  // ---- Pandora: pry the lid with the phone ----
  await nav(`/grimoire/${ids.pandora}`);
  check('Pandora’s Box offers “Pry it open with your phone”', await waitFor('[data-testid=pandora-pry]'));
  await page.click('[data-testid=pandora-pry]'); await page.waitForTimeout(300);
  const h0 = await hapN();
  await orient({ alpha: 0, beta: 40, gamma: 0 }); await page.waitForTimeout(150);
  for (const b of [46, 52, 57]) { await orient({ alpha: 0, beta: b, gamma: 0 }); await page.waitForTimeout(150); }
  check('tipping it lifts the lid notch by notch (a click you feel each time)', /notch/.test((await text('[data-testid=pandora-status]')) ?? '') && (await hapN()) > h0, await text('[data-testid=pandora-status]'));
  for (let i = 0; i < 12; i++) { await orient({ alpha: 0, beta: 57.5 + (i % 2) * 0.2, gamma: 0 }); await page.waitForTimeout(160); }
  check('holding still at a notch opens the box', await waitFor('[data-testid=pandora-out]', 8000));
  await shot('03-pandora');

  // ---- Storm Coil: swirl to crank ----
  await nav(`/grimoire/${ids.stormcoil}`);
  check('the Storm Coil offers “Swirl to crank”', await waitFor('[data-testid=storm-swirl]'));
  const charge0 = Number(((await text('[data-testid=storm-charge]')) ?? '').replace(/\D/g, ''));
  await page.click('[data-testid=storm-swirl]'); await page.waitForTimeout(200);
  for (let i = 0; i < 40; i++) { await motion({ rotationRate: { alpha: 900, beta: 0, gamma: 0 }, acceleration: { x: 0, y: 0, z: 0 } }); await page.waitForTimeout(40); }
  await page.waitForTimeout(1400); await motion({ rotationRate: { alpha: 0, beta: 0, gamma: 0 }, acceleration: { x: 0, y: 0, z: 0 } });
  await page.waitForTimeout(1500);
  const charge1 = Number(((await text('[data-testid=storm-charge]')) ?? '').replace(/\D/g, ''));
  check('swirling the phone cranks it (the charge goes up once you stop)', charge1 > charge0, `${charge0}% → ${charge1}%`);
  await shot('04-storm');

  // ---- the Leviathan: flick to throw ----
  await as(me, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
  await sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where status = 'warning'`);
  await api('leviathanState');
  await nav('/world'); await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__landvasLevOpen());
  // (the "it has risen" moment plays first: tap it away)
  for (let i = 0; i < 6; i++) { const m = page.locator('[data-testid^=lev-moment] button'); if (!(await m.count())) break; await m.last().click({ force: true }).catch(() => {}); await page.waitForTimeout(900); }
  if (await waitFor('[data-testid=lev-flick]', 12000)) {
    const bombs0 = Number(await text('[data-testid=lev-bombs]'));
    await page.locator('[data-testid=lev-flick]').click({ timeout: 8000 }).catch(async (e) => { console.log(String(e.message).split('\n').slice(0, 14).join('\n')); await page.locator('[data-testid=lev-flick]').click({ force: true }); }); await page.waitForTimeout(300);
    check('the fight offers “Flick to throw” and turns it on', /Flick on/.test((await text('[data-testid=lev-flick]')) ?? ''));
    await motion({ rotationRate: { alpha: 100, beta: 820, gamma: 60 }, acceleration: { x: 2, y: 9, z: -34 } });
    await page.waitForTimeout(1500);
    const bombs1 = Number(await text('[data-testid=lev-bombs]'));
    check('a hard flick throws a volley of bombs from the same bank', bombs1 < bombs0 && bombs0 - bombs1 <= 3, `${bombs0} → ${bombs1}`);
    await shot('05-leviathan-flick');
  } else check('the Leviathan fight offers “Flick to throw”', false, 'no fight screen');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('ran to the end', false, String(e?.message ?? e).slice(0, 300));
  await shot('zz-error');
}
await browser.close(); server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
