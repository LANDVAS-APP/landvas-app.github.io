// Screenshot tour of the app build's navigation pages at phone size (simulated Android shell).
// Not a pass/fail test — a quick visual sweep for pages that still look like the website.
// Run: npm run build:artifact && node tests/e2e/_app_tour.mjs [/route ...]
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/app-tour');
fs.mkdirSync(OUT, { recursive: true });
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['/hub', '/play', '/plots', '/canvases', '/sketch', '/doodle', '/duet', '/pvp', '/events', '/challenges',
  '/leaderboards', '/achievements', '/inventory', '/explorer', '/gallery', '/social', '/players', '/clans', '/invite', '/inkborn', '/space', '/me', '/settings', '/support'];
const server = await serve(DIST, 4193);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4193/?e2e=1', { waitUntil: 'load' });
await page.waitForSelector('[data-testid=title-play], #email', { timeout: 60000 });
if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
await page.waitForSelector('#email', { timeout: 30000 });
await page.fill('#email', 'tour_app@example.test');
await page.fill('#password', 'paint-the-world');
await page.click('button[type=submit]');
await page.waitForSelector('#username', { timeout: 30000 });
await page.fill('#username', 'tour_app');
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
await page.click('[data-testid=place-simple]').catch(() => {});
await page.waitForTimeout(2500);
// a few plots so the plot pages have something in them (SEED=1)
if (process.env.SEED) {
  const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
  const uid = (await sql(`select id from profiles where username = 'tour_app'`))[0]?.id;
  const kinds = [['lumina', 'common'], ['mosaic', 'rare'], ['pigment', 'epic'], ['graphite', 'phoenix'], ['lumina', 'phoenix'], ['mosaic', 'chaos'], ['pigment', 'legendary'], ['graphite', 'uncommon'], ['lumina', 'mythic']];
  let i = 0;
  for (const [t, r] of kinds) { await sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, $3, $4, $5, now()) on conflict (gx, gy) do nothing`, [3000011 + (i % 3), 1500001 + Math.floor(i / 3), t, r, uid]); i++; }
  console.log('seeded', i, 'plots for', uid);
  await page.evaluate(() => window.__landvasQc?.invalidateQueries());
}
for (const r of ROUTES) {
  await page.evaluate((x) => window.__landvasNav(x), r);
  await page.waitForTimeout(1800);
  const name = r.replace(/\//g, '_').replace(/^_/, '') || 'root';
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true, timeout: 60000 }).catch(() => console.log('skip', r));
  if (process.env.SCROLL) {
    for (let k = 1; k <= Number(process.env.SCROLL); k++) {
      const moved = await page.evaluate((k) => {
        const el = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
        const t = el ?? document.scrollingElement;
        const before = t.scrollTop; t.scrollTop = k * 700; return t.scrollTop !== before;
      }, k);
      if (!moved) break;
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `${name}-${k}.png`), timeout: 60000 }).catch(() => {});
    }
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${r}  overflow=${over}`);
}
console.log('errors:', errors.slice(0, 5));
await browser.close();
server.close();
