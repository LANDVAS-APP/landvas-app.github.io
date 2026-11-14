// Performance probe of the app build (simulated Android shell, phone size, 4× CPU throttle like a mid-range phone).
// For each screen, while idle for a few seconds and (on the map) while panning: main-thread time by kind, frames drawn,
// running animations (and which are endless), timers firing, network requests. Prints a table and writes JSON.
// Not a pass/fail test — the numbers to compare before and after a change.
// Run: npm run build:artifact && node tests/e2e/perf-app.mjs [label]
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const LABEL = process.argv[2] || 'run';
const OUT = path.resolve('test-results/perf');
fs.mkdirSync(OUT, { recursive: true });
const IDLE_MS = Number(process.env.IDLE_MS || 5000);
const ROUTES = (process.env.ROUTES || '/world,/hub,/play,/me,/plots,/inkborn,/space').split(',');
const server = await serve(DIST, 4188);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  // a stand-in for the phone's GPS (Salt Lake City), so the real map with the explorer is what's measured
  const pos = { coords: { latitude: 40.7608, longitude: -111.8929, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
  const Geolocation = {
    checkPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }), requestPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }),
    getCurrentPosition: async () => ({ ...pos, timestamp: Date.now() }),
    watchPosition: async (_o, cb) => { setTimeout(() => cb({ ...pos, timestamp: Date.now() }), 50); window.__gpsWatches = (window.__gpsWatches || 0) + 1; return 'w' + window.__gpsWatches; },
    clearWatch: async () => { window.__gpsCleared = (window.__gpsCleared || 0) + 1; },
  };
  window.CapacitorCustomPlatform = { name: 'android', plugins: { Geolocation } };
  // count timers and frames from the start
  const st = window.__perf = { timeouts: 0, intervals: 0, intervalFires: 0, raf: 0 };
  const si = window.setInterval, so = window.setTimeout, raf = window.requestAnimationFrame;
  window.setInterval = (f, ms, ...a) => { st.intervals++; return si((...x) => { st.intervalFires++; typeof f === 'function' ? f(...x) : 0; }, ms, ...a); };
  window.setTimeout = (f, ms, ...a) => { st.timeouts++; return so(f, ms, ...a); };
  window.requestAnimationFrame = (f) => { st.raf++; return raf(f); };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
let requests = 0;
page.on('request', () => requests++);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:4188/?e2e=1', { waitUntil: 'load' });
await page.waitForSelector('[data-testid=title-play], #email', { timeout: 60000 });
if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
await page.waitForSelector('#email', { timeout: 30000 });
await page.fill('#email', `perf_${Date.now()}@example.test`);
await page.fill('#password', 'paint-the-world');
await page.click('button[type=submit]');
await page.waitForSelector('#username', { timeout: 30000 });
await page.fill('#username', `perf${String(Date.now()).slice(-6)}`);
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
await page.click(process.env.SIMPLE ? '[data-testid=place-simple]' : '[data-testid=place-gps]').catch(() => {});
await page.waitForTimeout(5000);
console.log('explorer on map:', await page.locator('.lv-explorer').count(), 'gps watches', await page.evaluate(() => window.__gpsWatches || 0));
await page.keyboard.press('Escape').catch(() => {});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
async function sample(name, act) {
  await page.evaluate(() => document.querySelectorAll('[data-sonner-toast]').forEach((t) => t.remove()));
  const m0 = await metrics();
  const p0 = await page.evaluate(() => ({ ...window.__perf }));
  const r0 = requests;
  // frames actually drawn
  await page.evaluate(() => { window.__frames = 0; const tick = () => { window.__frames++; window.__fr = requestAnimationFrame(tick); }; window.__fr = requestAnimationFrame(tick); });
  const t0 = Date.now();
  if (act) await act(); else await page.waitForTimeout(IDLE_MS);
  const secs = (Date.now() - t0) / 1000;
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__fr); return window.__frames; });
  const m1 = await metrics();
  const p1 = await page.evaluate(() => ({ ...window.__perf }));
  const anims = await page.evaluate(() => {
    const all = document.getAnimations().filter((a) => a.playState === 'running');
    const endless = all.filter((a) => a.effect?.getTiming?.().iterations === Infinity);
    const names = {};
    for (const a of endless) { const n = a.animationName || a.constructor.name; const t = a.effect?.target; const k = `${n}@${t?.getAttribute?.('data-testid') || (typeof t?.className === 'string' ? t.className.split(' ').slice(0, 2).join('.') : t?.tagName)}`; names[k] = (names[k] || 0) + 1; }
    return { running: all.length, endless: endless.length, names };
  });
  const dom = await page.evaluate(() => document.getElementsByTagName('*').length);
  // what changes the page while it should be still: DOM mutations by element and kind, over one second
  if (process.env.MUT) {
    const muts = await page.evaluate(() => new Promise((res) => {
      const seen = {};
      const desc = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '?'; const id = e.closest('[data-testid]')?.getAttribute('data-testid'); return `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').split(' ').slice(0, 2).join('.')}${id ? ' in ' + id : ''}`; };
      const mo = new MutationObserver((list) => { for (const m of list) { const k = `${m.type}${m.attributeName ? ':' + m.attributeName : ''} ${desc(m.target)}`; seen[k] = (seen[k] || 0) + 1; } });
      mo.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
      setTimeout(() => { mo.disconnect(); res(Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 8)); }, 1000);
    }));
    console.log('   mutations/s:', JSON.stringify(muts));
  }
  const heap = (m1.JSHeapUsedSize / 1048576).toFixed(1);
  const d = (k) => +(((m1[k] - m0[k]) / secs) * 1000).toFixed(0); // ms of work per second of wall time
  const row = {
    screen: name, secs: +secs.toFixed(1),
    task_ms_s: d('TaskDuration'), script_ms_s: d('ScriptDuration'), style_ms_s: d('RecalcStyleDuration'), layout_ms_s: d('LayoutDuration'),
    styleRecalcs_s: +((m1.RecalcStyleCount - m0.RecalcStyleCount) / secs).toFixed(1), layouts_s: +((m1.LayoutCount - m0.LayoutCount) / secs).toFixed(1),
    fps: +(frames / secs).toFixed(0), raf_s: +((p1.raf - p0.raf - frames) / secs).toFixed(1), intervalFires_s: +((p1.intervalFires - p0.intervalFires) / secs).toFixed(1), timeouts_s: +((p1.timeouts - p0.timeouts) / secs).toFixed(1),
    req_s: +((requests - r0) / secs).toFixed(2), anims: anims.running, endless: anims.endless, dom, heapMB: +heap,
  };
  console.log(JSON.stringify(row));
  if (anims.endless) console.log('   endless:', JSON.stringify(anims.names));
  return row;
}

const rows = [];
for (const r of ROUTES) {
  await page.evaluate((x) => window.__landvasNav(x), r);
  await page.waitForTimeout(2500);
  rows.push(await sample(`${r} idle`));
  if (r === '/world') {
    const box = { x: 195, y: 470 };
    rows.push(await sample('/world pan', async () => {
      for (let k = 0; k < 4; k++) {
        await page.mouse.move(box.x, box.y); await page.mouse.down();
        await page.mouse.move(box.x + (k % 2 ? -140 : 140), box.y + (k % 2 ? 90 : -90), { steps: 25 });
        await page.mouse.up(); await page.waitForTimeout(400);
      }
    }));
  }
}
// in the background: what still runs while the app is hidden
await page.evaluate((x) => window.__landvasNav(x), '/world');
await page.waitForTimeout(2000);
await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
rows.push(await sample('/world hidden'));
fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ rows, errors }, null, 1));
console.log('errors:', errors.slice(0, 3));
await browser.close();
server.close();
