// Simple mode: one screen, no map downloaded; buy plots (Base plots) and roll their rarity; a steady money ticker.
// Run: npm run build:artifact && node tests/e2e/simple-mode.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-simple'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4302);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const reqs = []; page.on('request', (r) => reqs.push(r.url()));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
try {
  // simple mode chosen before anything loads
  await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: true })); } catch {} });
  await page.goto('http://localhost:4302/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 's@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'simple_sam'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasNav('/world')); 
  await page.waitForSelector('[data-testid=simple-home]', { timeout: 20000 }); await page.waitForTimeout(1500);
  check('simple mode shows the one-screen home', true);
  check('no map was loaded', !reqs.some((u) => /maplibre|MapScreen/.test(u)) && !(await page.locator('[data-testid=world-map]').count()), reqs.filter((u) => /maplibre|MapScreen/.test(u)).join(','));
  await shot('01-home');
  await page.click('[data-testid=simple-buy]'); await page.waitForTimeout(500); await shot('02-rolling');
  await page.waitForSelector('[data-testid=celebration-close]', { timeout: 15000 }); await page.waitForTimeout(2500);
  const rar = await page.textContent('[data-testid=claim-rarity]');
  check('the first plot is free and its rarity rolls', !!rar, rar);
  check('…a Base plot: no paint buttons', (await page.locator('[data-testid=choose-draw]').count()) === 0);
  await shot('03-rolled');
  await page.click('[data-testid=buy-again]'); await page.waitForTimeout(500);
  await page.waitForSelector('[data-testid=celebration-close]', { timeout: 15000 }); await page.waitForTimeout(2500);
  await page.click('[data-testid=celebration-close]'); await page.waitForTimeout(1500);
  const n = await page.locator('[data-testid=simple-plot]').count();
  check('"Roll another" buys a second plot; both are listed', n === 2, `${n}`);
  const groups = await api('myGroups');
  check('…both Base plots', groups.every((g) => g.kind === 'base'), groups.map((g) => g.kind).join(','));
  // the ticker keeps its dimmed zeros through re-renders (no blinking)
  const samples = [];
  for (let i = 0; i < 14; i++) { samples.push(await page.evaluate(() => { const e = document.querySelector('[data-testid=simple-money] [data-testid=usd-live]'); return e ? `${e.children.length}:${e.textContent}` : 'none'; })); await page.waitForTimeout(150); }
  check('the money ticker keeps its shape every frame (no blink)', samples.every((s) => s.startsWith('1:$0.')), samples.slice(0, 3).join(' '));
  const t1 = samples[0].split(':')[1], t2 = samples.at(-1).split(':')[1];
  check('…and ticks up', t2 > t1, `${t1} → ${t2}`);
  await shot('04-two-plots');
  // the tab bar is just Home, Play, Me
  const tabs = await page.locator('nav.lv-game a').allTextContents();
  check('simple tab bar', tabs.join('|') === 'Home|Play|Me', tabs.join('|'));
  // the full game is one tap away
  await page.click('[data-testid=simple-mode-off]'); await page.waitForTimeout(3000);
  check('switching to the full game brings the map back', (await page.locator('[data-testid=world-map]').count()) === 1);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run completed', false, e.message.split('\n')[0]); await shot('99-err'); }
await browser.close(); server.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
