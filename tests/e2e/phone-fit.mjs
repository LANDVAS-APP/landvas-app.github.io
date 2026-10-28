// Phone layout check (local-mode build): every main screen at common phone sizes.
// Flags anything that sticks out past the screen edge or makes the page scroll sideways,
// and saves screenshots. Heights include Safari's toolbars where they apply.
// Run: npm run build:artifact && node tests/e2e/phone-fit.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/phone-fit');
fs.mkdirSync(OUT, { recursive: true });
const PHONES = [
  ['iPhone 14 Pro Max (Safari)', 430, 739],
  ['iPhone 14 Pro Max (home screen app)', 430, 932],
  ['iPhone 14 / 13', 390, 664],
  ['iPhone SE', 375, 553],
  ['iPhone mini', 360, 640],
  ['Small Android', 360, 640],
  ['Pixel 7', 412, 839],
  ['Galaxy fold (closed)', 320, 653],
];
const ROUTES = (process.env.ROUTES ?? '/world,/play,/social,/gallery,/me,/canvases,/players,/pvp,/events,/leaderboards,/achievements,/inventory,/support,/settings,/play/tracecraft').split(',');
const server = await serve(DIST, 4192);
const problems = [];
const only = process.env.PHONE;
for (const [name, w, h] of PHONES.filter((p) => !only || p[0].includes(only))) {
  const browser = await launch(); // one browser per phone: the bundled headless shell is single-process
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4192/?e2e=1', { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', `fit${w}x${h}@example.test`);
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', `fit_${w}_${h}`);
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  for (const route of ROUTES) {
    await page.evaluate((r) => window.__landvasNav(r), route);
    await page.waitForTimeout(route === '/world' ? 2500 : 1300);
    const res = await page.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const out = [];
      const doc = document.scrollingElement;
      if (doc.scrollWidth > W + 1) out.push(`page scrolls sideways (${doc.scrollWidth}px wide)`);
      // the scrolling main area must not scroll sideways either
      for (const el of document.querySelectorAll('main')) if (el.scrollWidth > el.clientWidth + 1) out.push(`main area scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
      const clipped = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll|hidden)/.test(cs.overflowX) && p.tagName !== 'MAIN' && p !== document.body && p.id !== 'root') return true;
        }
        return false;
      };
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.maplibregl-canvas-container, .maplibregl-marker, svg, canvas, [aria-hidden=true], .sr-only')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const fixed = cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky';
        const sideOut = r.right > W + 1 || r.left < -1;
        const bottomOut = fixed && (r.bottom > H + 1 || r.top < -1) && !el.closest('main.overflow-y-auto');
        if ((sideOut || bottomOut) && !clipped(el)) {
          const label = (el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
          out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''} "${label}" at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return [...new Set(out)].slice(0, 12);
    });
    const file = `${name.replace(/[^a-z0-9]+/gi, '-')}${route.replace(/\//g, '_')}.png`;
    await page.screenshot({ path: path.join(OUT, file), timeout: 30000 }).catch(() => {});
    if (res.length) problems.push({ phone: name, route, res });
    console.log(`${res.length ? 'FIX ' : 'ok  '} ${name.padEnd(36)} ${route.padEnd(18)} ${res.length ? res.join(' | ') : ''}`);
  }
  await browser.close();
}
console.log(`\n${problems.length} screen/phone combinations need fixing`);
server.close();
process.exit(problems.length ? 1 : 0);
