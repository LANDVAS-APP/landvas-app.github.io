// The app's launch and its crash nets, in a simulated Android app shell (the splash's hide is seen as the
// 'landvas:splash-hide' event).
//  1. The splash stays up until the first real screen is on the page — never over a blank page, the website's text,
//     the boot logo or a loading skeleton — and never longer than a few seconds. First launch (the title screen) and
//     launching again (straight onto the World map, which waits for the map's style).
//  2. A map layer that breaks on a bad answer from the server steps aside: the map, its buttons and the tab bar stay
//     up (no "hit a snag" screen, no developer error page), and tapping around still works.
// Run: npm run build:artifact && node tests/e2e/launch.mjs
import { serve, launch } from './browser.mjs';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4371, G = 4194304;
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { lng: ((gx + 0.5) / G) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const here = ll(START.gx, START.gy);
await ctx.addInitScript(([lat, lng]) => {
  const pos = { coords: { latitude: lat, longitude: lng, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
  const Geolocation = {
    checkPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }), requestPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }),
    getCurrentPosition: async () => ({ ...pos, timestamp: Date.now() }),
    watchPosition: async (_o, cb) => { setTimeout(() => cb({ ...pos, timestamp: Date.now() }), 50); return 'w1'; },
    clearWatch: async () => {},
  };
  // what was on the page the moment the splash went
  const seen = () => {
    const root = document.getElementById('root');
    if (!root || !root.children.length) return 'blank';
    if (document.querySelector('[data-testid=game-boot]')) return 'boot logo';
    if (root.querySelector(':scope > main h1')?.textContent?.includes('Own a piece')) return 'website text';
    if (document.querySelector('[data-testid=screen-skeleton]')) return 'skeleton';
    if (document.querySelector('[data-testid=route-error], [data-testid=app-crash]')) return 'error screen';
    if (document.querySelector('[data-testid=world-map] canvas')) return 'map';
    if (document.querySelector('[data-testid=title-play], #email')) return 'title';
    return `other: ${root.innerText.slice(0, 60).replace(/\s+/g, ' ')}`;
  };
  window.__splash = { hides: [], screen: null };
  window.addEventListener('landvas:splash-hide', () => window.__splash.hides.push({ at: Math.round(performance.now()), saw: seen() }));
  // when the first real screen (title or map) showed up, to time the splash against
  const watch = () => { const s = seen(); if (!window.__splash.screen && (s === 'title' || s === 'map')) window.__splash.screen = Math.round(performance.now()); };
  new MutationObserver(watch).observe(document, { childList: true, subtree: true });
  window.CapacitorCustomPlatform = { name: 'android', plugins: { Geolocation } };
}, [here.lat, here.lng]);
const page = await ctx.newPage();
const fails = [];
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) fails.push(what); };
const guarded = [];
page.on('console', (m) => { if (/\[guard\]/.test(m.text())) guarded.push(m.text().slice(0, 120)); });
const splash = () => page.evaluate(() => window.__splash.hides);
const shown = () => page.evaluate(() => window.__splash.screen);

// 1a. first launch: the title screen
await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
await page.waitForSelector('[data-testid=title-play], #email', { timeout: 120000 });
await page.waitForTimeout(1500);
let h = await splash();
ok(h.length >= 1, `first launch: the splash went (${h.length} hide call(s))`);
ok(h[0] && ['title'].includes(h[0].saw), `first launch: it went over the title screen (saw: ${h[0]?.saw})`);

// sign up and onboard
if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
await page.waitForSelector('#email', { timeout: 30000 });
await page.fill('#email', `launch${Date.now() % 100000}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
await page.waitForSelector('#username', { timeout: 30000 });
await page.fill('#username', `launch${Date.now() % 100000}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
await page.click('[data-testid=place-gps]').catch(() => {});
await page.waitForTimeout(2500);
await page.keyboard.press('Escape').catch(() => {});

// 2. a map layer gets an answer it can't read: it steps aside, the map stays
await page.evaluate(() => window.__landvasBackend.db.query(`create or replace function public.enchant_map2(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb language sql as $$ select '{"suns": 5, "storms": 7, "echoes": 3, "carried": 1, "server_now": 1}'::jsonb $$`));
for (const z of [14, 16, 18]) {
  await page.evaluate(([c, z]) => window.__landvasMap.jumpTo({ center: [c.lng, c.lat], zoom: z }), [here, z]);
  await page.waitForTimeout(3000);
}
const state = await page.evaluate(() => ({
  map: !!document.querySelector('[data-testid=world-map] canvas'),
  snag: !!document.querySelector('[data-testid=route-error], [data-testid=app-crash]'),
  dev: /Unexpected Application Error|Hey developer/.test(document.body.innerText),
  hud: !!document.querySelector('[data-testid=map-row], .lv-tabbar, [data-testid=tabbar]'),
}));
ok(guarded.some((g) => /map:/.test(g)), `a bad answer was caught by the map layer's own guard (${guarded[0] ?? 'no guard message'})`);
ok(state.map && !state.snag && !state.dev, `the map stays up, no error screen (map ${state.map}, snag ${state.snag}, dev page ${state.dev})`);
ok(state.hud, 'the map\'s buttons and the tab bar are still there');
// and the rest of the game still answers taps
await page.evaluate(() => window.__landvasNav('/me'));
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ snag: !!document.querySelector('[data-testid=route-error]'), path: window.__landvasPath() }));
ok(!after.snag && after.path === '/me', `another tab still opens (at ${after.path}${after.snag ? ', error screen' : ''})`);


// 1b. launching again: straight onto the map (the test build's database lives in memory, so this comes back as a
// returning visitor, signed out — the map screen, its loaders and the splash's wait for the map are the same)
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('[data-testid=world-map] canvas', { timeout: 120000 });
await page.waitForTimeout(2000);
h = await splash();
ok(h.length >= 1, 'launching again: the splash went');
ok(h[0]?.saw === 'map', `launching again: it went over the World map (saw: ${h[0]?.saw})`);
const t0 = await shown();
ok(h[0] && t0 && h[0].at - t0 < 2500, `launching again: it went soon after the map showed (${h[0] && t0 ? h[0].at - t0 : '?'} ms after)`);

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall good');
process.exit(fails.length ? 1 : 0);
