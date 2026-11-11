// The Guide: live rates, Ink sources, real averages, the grind calculator and LANDVAS vs Atlas Earth & TerraMine.
// Run: npm run build:artifact && node tests/e2e/guide.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-guide'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4312);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = (n, full = false) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const text = (sel) => page.locator(sel).first().innerText();
try {
  await page.goto('http://localhost:4312/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'g@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'guide_gwen'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasNav('/guide'));
  await page.waitForSelector('[data-testid=guide-rates]', { timeout: 20000 }); await page.waitForTimeout(800);
  await shot('01-top');
  for (const s of ['facts', 'rates', 'ink', 'real', 'calc', 'compare', 'how']) check(`section ${s}`, (await page.locator(`[data-testid=guide-${s}]`).count()) === 1);
  check('rates table lists Common with its live rate', /0\.0000000011/.test(await text('[data-testid=guide-rate-common]')), await text('[data-testid=guide-rate-common]'));
  check('Ink sources listed', (await page.locator('[data-testid=guide-ink-sources] > *').count()) >= 10);
  const lead = await page.locator('[data-testid=compare-lead]').count() ? await text('[data-testid=compare-lead]') : '';
  check('the comparison shows LANDVAS ahead at 1 h a day', /LANDVAS: [\d.]+× the plots/.test(lead), lead);
  await page.locator('[data-testid=guide-compare]').scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await shot('02-compare');
  const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check('nothing wider than the phone', wide <= 0, `${wide}px`);
  // change a rate in the game: the page follows it
  await sql(`update plot_rarities set usd_per_second = 0.0000000022 where id = 'common'`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['game-guide'] })); await page.waitForTimeout(1500);
  check('a rate change shows up on the page', /0\.0000000022/.test(await text('[data-testid=guide-rate-common]')), await text('[data-testid=guide-rate-common]'));
  await page.locator('[data-testid=guide-how-list] details').first().click(); await page.waitForTimeout(300);
  for (const sec of ['facts', 'rates', 'ink', 'real', 'calc', 'compare', 'how']) { await page.locator(`[data-testid=guide-${sec}]`).scrollIntoViewIfNeeded(); await page.evaluate((s) => document.querySelector(`[data-testid=guide-${s}]`).scrollIntoView({ block: 'start' }), sec); await page.waitForTimeout(300); await shot(`s-${sec}`); }
  // the Rarities page is live too: change the game's settings and it follows
  await sql(`update game_config set value = jsonb_set(value, '{one_in}', '500') where key = 'shiny'`);
  await sql(`update game_config set value = jsonb_set(value, '{comet,mult}', '40') where key = 'rarity_abilities'`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['game-guide'] }));
  await page.evaluate(() => window.__landvasNav('/legend')); await page.waitForSelector('[data-testid=legend-basics]', { timeout: 20000 }); await page.waitForTimeout(1500);
  const leg = await page.locator('main, body').first().innerText();
  check('Rarities page: Shiny odds are live (1 in 500)', /1 in 500 claims/.test(leg));
  check('Rarities page: Comet multiplier is live (×40)', /×40 rent/.test(leg));
  check('Rarities page: no stale hard-coded Luck cap', !/30 points a day/.test(leg));
  await page.locator('[data-testid=legend-luck]').scrollIntoViewIfNeeded(); await shot('04-legend-luck');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); await shot('99-error'); }
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
