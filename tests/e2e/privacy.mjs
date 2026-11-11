// Privacy: every feed activity has its own switch (e.g. hide sacrificing an egg but not Ink).
// Run: npm run build:artifact && node tests/e2e/privacy.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-privacy'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4311);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
try {
  await page.goto('http://localhost:4311/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'p@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'private_pat'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasNav('/settings'));
  await page.waitForSelector('[data-testid=privacy-settings]', { timeout: 20000 });
  await page.locator('[data-testid=privacy-settings]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  await shot('01-privacy');
  await page.click('[data-testid=pv-more-feed_luck]'); await page.waitForTimeout(300);
  for (const k of ['fa_luck_ink', 'fa_luck_inkborn', 'fa_luck_egg', 'fa_luck_plot', 'fa_luck_pick']) check(`Luck lists ${k}`, await page.locator(`#pv-${k}`).isVisible());
  await page.click('#pv-fa_luck_egg'); await page.waitForTimeout(800);
  await page.locator('[data-testid=pv-group-feed_luck]').scrollIntoViewIfNeeded(); await shot('02-luck-open');
  const p = await api('myPrivacy');
  check('turning off "Sacrificing an egg" saves just that', p.fa_luck_egg === false && p.fa_luck_ink === true && p.feed_luck === true, JSON.stringify({ e: p.fa_luck_egg, i: p.fa_luck_ink }));
  check('…and the row says 1 hidden', /1 hidden/.test(await page.textContent('[data-testid=pv-more-feed_luck]')));
  await page.click('[data-testid=pv-more-feed_games]'); await page.waitForTimeout(300);
  check('every arcade moment has a switch', await page.locator('#pv-fa_arcade_prize').isVisible() && await page.locator('#pv-fa_arcade_playing').isVisible());
  const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check('nothing wider than the phone', wide <= 0, `${wide}px`);
  await shot('03-games-open');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); await shot('99-error'); }
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
