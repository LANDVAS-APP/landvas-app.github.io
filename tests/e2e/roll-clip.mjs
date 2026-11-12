// Roll clips (better than Rare) and the reroll speed setting.
// Run: npm run build:artifact && node tests/e2e/roll-clip.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-roll-clip'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4319);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 90000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
try {
  await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: true })); } catch {} });
  await page.goto('http://localhost:4319/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'clip@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'clip_queen'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasNav('/world'));
  await page.waitForSelector('[data-testid=simple-home]', { timeout: 20000 }); await page.waitForTimeout(1200);
  await page.waitForFunction(() => typeof window.__landvasRollDemo === 'function', null, { timeout: 30000 });
  // quick rerolls: 4 rolls should be over fast
  await page.evaluate(() => localStorage.setItem('landvas.rerollSpeed', 'quick'));
  const t0 = Date.now();
  await page.evaluate(() => window.__landvasRollDemo('kraken', true, ['rare', 'epic', 'kraken', 'legendary'], ['pigment', 'mosaic', 'lumina', 'clay'], [false, true, true, false]));
  await page.waitForSelector('[data-testid=roll-speed]', { timeout: 15000 });
  check('the speed switch shows during rerolls', /Quick/.test(await page.textContent('[data-testid=roll-speed]')));
  await page.waitForSelector('[data-testid=roll-pick]', { timeout: 30000 });
  const quickMs = Date.now() - t0;
  await page.waitForTimeout(900); await shot('00-pick');
  check('rerolls show their minigame', /Lumina/.test(await page.textContent('[data-testid=roll-choice-type-2]')) && /Mosaic/.test(await page.textContent('[data-testid=roll-choice-type-1]')));
  check('…and which are shiny', (await page.locator('[data-testid^=roll-choice-shiny-]').count()) === 2 && (await page.locator('[data-testid=roll-choice-shiny-1]').count()) === 1);
  check('the best suggestion is the shiny Kraken', /BEST/.test(await page.textContent('[data-testid=roll-choice-2]')));
  await page.click('[data-testid=roll-choice-2]'); await page.click('[data-testid=roll-keep]');
  await page.waitForSelector('[data-testid=roll-clip]', { timeout: 20000 }); await page.waitForTimeout(1500);
  await shot('01-reveal-with-clip');
  check('quick rerolls are quick', quickMs < 9000, `${quickMs}ms`);
  if (process.env.DEBUG_CLIP) { console.log(JSON.stringify(await page.evaluate(() => window.__landvasClip({ rolls: ['epic', 'kraken'], kept: 1, shiny: true, username: 'x', accent: '#f0f' })))); }
  await page.click('[data-testid=roll-clip]');
  await page.waitForSelector('[data-testid=clip-sheet]', { timeout: 5000 });
  await page.waitForTimeout(3500); await shot('02-clip-recording');
  await page.waitForSelector('[data-testid=clip-video], [data-testid=clip-image]', { timeout: 60000 });
  await page.waitForTimeout(800);
  const v = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid=clip-video]');
    if (!el) return { kind: 'image' };
    const b = await fetch(el.src).then((r) => r.blob());
    return { kind: 'video', type: b.type, size: b.size };
  });
  check('a video clip is made', v.kind === 'video' && v.size > 50_000, JSON.stringify(v));
  for (const [ms, n] of [[1500, '03-clip-a'], [2500, '04-clip-b'], [3000, '05-clip-c']]) { await page.waitForTimeout(ms); await shot(n); }
  const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await page.click('[data-testid=clip-save]');
  const d = await dl;
  check('…and can be saved', !!d && /landvas-kraken-shiny\.(webm|mp4)/.test(d.suggestedFilename()), d?.suggestedFilename());
  if (d) await d.saveAs(`${OUT}/clip.${d.suggestedFilename().split('.').pop()}`);
  await page.locator('[data-testid=clip-sheet] button', { hasText: 'Close' }).click();
  // a Rare: no clip
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.evaluate(() => window.__landvasRollDemo('rare', false, null));
  await page.waitForTimeout(6000);
  check('no clip for a Rare', (await page.locator('[data-testid=roll-clip]').count()) === 0);
  // normal speed takes longer
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.setItem('landvas.rerollSpeed', 'normal'));
  const t1 = Date.now();
  await page.evaluate(() => window.__landvasRollDemo('epic', false, ['rare', 'epic', 'common', 'legendary']));
  await page.waitForSelector('[data-testid=roll-pick]', { timeout: 40000 });
  const normalMs = Date.now() - t1;
  check('normal-speed rerolls take longer', normalMs > quickMs + 1500, `${quickMs} vs ${normalMs}ms`);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); await shot('99-error'); }
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
