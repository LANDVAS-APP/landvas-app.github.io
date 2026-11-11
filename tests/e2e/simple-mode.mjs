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
  // nothing on the page is wider than the phone (no sideways shift)
  const wide = () => page.evaluate(() => { const vw = innerWidth; const els = [document.scrollingElement, ...document.querySelectorAll('main')]; return Math.max(...els.map((e) => e.scrollWidth)) - vw; });
  check('the switch to the full game is at the top', await page.locator('[data-testid=simple-mode-off]').isVisible() && (await page.locator('[data-testid=simple-mode-off]').boundingBox()).y < 90);
  // the roll: ink drops onto a blank canvas, cycles through rarities, lands on one
  await page.click('[data-testid=simple-buy]'); await page.waitForTimeout(350); await shot('02-ink-drop');
  check('the roll is full screen', await page.evaluate(() => { const r = document.querySelector('[data-testid=ink-roll]')?.getBoundingClientRect(); return !!r && r.width >= innerWidth && r.height >= innerHeight; }));
  await page.waitForTimeout(1100); await shot('02b-spinning');
  check('…and doesn\'t shift the page sideways', (await wide()) <= 0, `${await wide()}px`);
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 15000 }); await page.waitForTimeout(1600);
  const rar = await page.textContent('[data-testid=roll-rarity]');
  check('the first plot is free and its rarity rolls', !!rar, rar);
  await shot('03-rolled');
  await page.click('[data-testid=roll-again]');
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 15000 }); await page.waitForTimeout(1600);
  await page.click('[data-testid=roll-done]'); await page.waitForTimeout(1200);
  const n = await page.locator('[data-testid=simple-plot]').count();
  check('"Roll again" buys a second plot; both are listed', n === 2, `${n}`);
  const groups = await api('myGroups');
  check('…both Base plots', groups.every((g) => g.kind === 'base'), groups.map((g) => g.kind).join(','));
  // scrolling the plot list keeps everything on screen, the switch stays at the top
  await page.mouse.wheel(0, 900); await page.waitForTimeout(600);
  check('scrolling the plots: nothing wider than the screen', (await wide()) <= 0, `${await wide()}px`);
  check('…and the switch stays on screen', await page.locator('[data-testid=simple-mode-off]').isVisible() && (await page.locator('[data-testid=simple-mode-off]').boundingBox()).y < 90);
  await page.mouse.wheel(0, -2000); await page.waitForTimeout(400);
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
  // the daily streak: claim day 1 from the strip under the money
  await page.click('[data-testid=streak-strip]'); await page.waitForSelector('[data-testid=streak-dialog]', { timeout: 10000 });
  await shot('06-streak');
  await page.click('[data-testid=streak-claim]', { force: true }); await page.waitForTimeout(1200); // (it pulses, so it's never "still")
  const st = await api('dailyStatus');
  check('daily streak: day 1 claimed', st.streak === 1 && st.claimed_today === true, JSON.stringify({ s: st.streak, c: st.claimed_today }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // a guaranteed roll (as if it were day 7)
  await page.evaluate(() => window.__landvasApi.dailyStatus()); // (warm)
  // the Hot Zone: roll a plot inside today's city
  const hz = await api('hotZone');
  check('a Hot Zone city today (and tomorrow)', !!hz.today?.name && !!hz.tomorrow?.name, `${hz.today?.name} → ${hz.tomorrow?.name}`);
  await page.click('[data-testid=hot-zone-roll]');
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 15000 }); await page.waitForTimeout(1600);
  check('…a Hot Zone roll says so', (await page.locator('text=Hot Zone roll').count()) === 1);
  await shot('07-hot-roll');
  await page.click('[data-testid=roll-done]'); await page.waitForTimeout(900);
  // the collection album
  await page.click('[data-testid=collection-card]'); await page.waitForSelector('[data-testid=collection-dialog]', { timeout: 10000 });
  const nRar = await page.locator('[data-testid^=collect-rarity-]').count(), types = await page.locator('[data-testid^=collect-type-]').count();
  check('the collection: every plot type and all 12 rarities', nRar === 12 && types >= 8, `${types} types, ${nRar} rarities`);
  await shot('08-collection');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check('the odds show all 12 rarities, ultras as "1 in …"', (await page.locator('[data-testid=simple-odds] > div').count()) === 12 && (await page.locator('[data-testid=simple-odds] >> text=/1 in /').count()) === 6);

  // the Play tab is just the plot minigames
  await page.locator('nav.lv-game a').filter({ hasText: 'Play' }).first().click();
  await page.waitForSelector('[data-testid=simple-play]', { timeout: 15000 }); await page.waitForTimeout(1200);
  const playable = await page.locator('[data-testid^=simple-game-]:not([disabled])').count(), all = await page.locator('[data-testid^=simple-game-]').count();
  check('simple Play: one card per plot minigame, the ones for your plots playable', all >= 6 && playable >= 1, `${playable}/${all}`);
  check('…nothing wider than the screen', (await wide()) <= 0, `${await wide()}px`);
  await shot('05-play');
  await page.locator('nav.lv-game a').filter({ hasText: 'Home' }).first().click(); await page.waitForTimeout(1500);
  // the full game is one tap away
  await page.click('[data-testid=simple-mode-off]'); await page.waitForTimeout(3000);
  check('switching to the full game brings the map back', (await page.locator('[data-testid=world-map]').count()) === 1);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run completed', false, e.message.split('\n')[0]); await shot('99-err'); }
await browser.close(); server.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
