// Away from the screen (src/lib/away.ts): on the map, with nobody touching anything, background calls to the server
// stop; the first touch brings everything back (stale screens refresh once), and a game screen never goes away.
// The away time is shortened to 8 s for the test.
// Run: npm run build:artifact && node tests/e2e/away.mjs
import { serve, launch } from './browser.mjs';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const server = await serve(DIST, 4191);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  window.__landvasAwayMs = 8000;
  const pos = { coords: { latitude: 40.7608, longitude: -111.8929, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
  const Geolocation = {
    checkPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }), requestPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }),
    getCurrentPosition: async () => ({ ...pos, timestamp: Date.now() }),
    watchPosition: async (_o, cb) => { setTimeout(() => cb({ ...pos, timestamp: Date.now() }), 50); return 'w1'; },
    clearWatch: async () => {},
  };
  window.CapacitorCustomPlatform = { name: 'android', plugins: { Geolocation } };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const fail = async (msg) => { console.error('FAIL:', msg); await page.screenshot({ path: 'test-results/away-fail.png' }).catch(() => {}); await browser.close(); server.close(); process.exit(1); };

await page.goto('http://localhost:4191/?e2e=1', { waitUntil: 'load' });
await page.waitForSelector('[data-testid=title-play], #email', { timeout: 60000 });
if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
await page.waitForSelector('#email', { timeout: 30000 });
await page.fill('#email', `away_${Date.now()}@example.test`);
await page.fill('#password', 'paint-the-world');
await page.click('button[type=submit]');
await page.waitForSelector('#username', { timeout: 30000 });
await page.fill('#username', `away${String(Date.now()).slice(-6)}`);
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
await page.click('[data-testid=place-gps]').catch(() => {});
await page.waitForTimeout(4000);
await page.keyboard.press('Escape').catch(() => {});
if (!/\/world/.test(page.url())) await page.goto('http://localhost:4191/world?e2e=1', { waitUntil: 'load' });
await page.waitForTimeout(3000);

const calls = () => page.evaluate(() => ({ ...(window.__landvasCalls || {}) }));
const diff = (a, b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v - (a[k] || 0)]).filter(([, v]) => v > 0));
const total = (d) => Object.values(d).reduce((s, v) => s + v, 0);
const wiggle = async (ms) => { const end = Date.now() + ms; let i = 0; while (Date.now() < end) { await page.mouse.move(100 + (i++ % 5) * 10, 300); await page.waitForTimeout(1000); } };

// 1. someone at the screen for 40 s (moving the mouse now and then): background refreshes run as usual
let c0 = await calls();
await wiggle(40_000);
let c1 = await calls();
const here = diff(c0, c1);
console.log('here   40 s:', total(here), 'calls', JSON.stringify(here));

// 2. nobody touches anything: after 8 s the map is away; over the next 40 s, almost nothing is asked
await page.waitForTimeout(9000);
c0 = await calls();
await page.waitForTimeout(40_000);
c1 = await calls();
const away = diff(c0, c1);
console.log('away   40 s:', total(away), 'calls', JSON.stringify(away));
if (total(here) < 3) await fail(`expected background calls while here, saw ${total(here)}`);
if (total(away) > Math.max(2, total(here) * 0.15)) await fail(`away should be quiet, saw ${total(away)} calls vs ${total(here)} while here`);

// 3. a touch brings it back: stale screens refresh straight away
c0 = await calls();
await page.mouse.move(200, 400);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(3000);
c1 = await calls();
const back = diff(c0, c1);
console.log('back    3 s:', total(back), 'calls', JSON.stringify(back));
if (total(back) < 1) await fail('coming back should refresh what went stale');

// 4. a game screen never goes away
await page.goto('http://localhost:4191/play/rockrun?e2e=1', { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(12_000);
const awayInGame = await page.evaluate(() => document.documentElement.classList.contains('lv-away'));
console.log('in a game after 12 s quiet: away =', awayInGame);
if (awayInGame) await fail('a game screen must never count as away');

const bad = errors.filter((e) => !/ResizeObserver|WebGL|context lost/i.test(e));
if (bad.length) await fail(`page errors: ${bad.slice(0, 3).join(' | ')}`);
console.log('PASS: away from the screen pauses background calls and a touch brings them back');
await browser.close();
server.close();
