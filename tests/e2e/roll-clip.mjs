// Roll clips (better than Rare): the clip replays the roll itself; snips; the Clips page (past rolls, moments, any plot);
// the classic rarity drum, each roll landing with its own minigame tag; and the reroll speed setting.
// Run: npm run build:artifact && node tests/e2e/roll-clip.mjs
import { serve } from './browser.mjs';
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-roll-clip'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4319);
// (the roll is one big canvas: software rendering — headless Chromium's emulated GPU starves a full-screen canvas)
const browser = await pw.launch({ executablePath: await chromium.executablePath(), headless: true, args: [...chromium.args.filter((a) => !/gl|gpu|angle/i.test(a)), '--disable-gpu'] });
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
  // (every minigame tag that drops onto the card, in order)
  // (and the phase of the roll each time it shows: it should come on while the drum is still in view)
  await page.evaluate(() => {
    window.__tags = []; window.__tagSeen = [];
    new MutationObserver(() => {
      const el = document.querySelector('[data-testid=roll-game]'), ty = el?.getAttribute('data-type');
      const ph = document.querySelector('[data-testid=ink-roll]')?.getAttribute('data-phase');
      if (ty && window.__tags[window.__tags.length - 1] !== ty) window.__tags.push(ty);
      const k = `${ph}:${ty}`;
      if (ty && window.__tagSeen[window.__tagSeen.length - 1] !== k) window.__tagSeen.push(k);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-type', 'data-phase'] });
  });
  const t0 = Date.now();
  await page.evaluate(() => window.__landvasRollDemo('kraken', true, ['rare', 'epic', 'kraken', 'legendary'], ['pigment', 'mosaic', 'lumina', 'clay'], [false, true, true, false]));
  await page.waitForSelector('[data-testid=ink-roll][data-phase=spin] .lv-rr-slot', { timeout: 15000 });
  check('the classic rarity drum spins', (await page.locator('.lv-rr-slot').count()) === 7);
  await page.waitForTimeout(500); await shot('00a-drum');
  await page.waitForSelector('[data-testid=roll-speed]', { timeout: 15000 });
  check('the speed switch shows during rerolls', /Quick/.test(await page.textContent('[data-testid=roll-speed]')));
  await page.waitForSelector('[data-testid=roll-pick]', { timeout: 30000 });
  const quickMs = Date.now() - t0;
  await page.waitForTimeout(900); await shot('00-pick');
  check('each roll lands with its own minigame', JSON.stringify(await page.evaluate(() => window.__tags)) === JSON.stringify(['pigment', 'mosaic', 'lumina', 'clay']), JSON.stringify(await page.evaluate(() => window.__tags)));
  check('rerolls show their minigame', /Lumina/.test(await page.textContent('[data-testid=roll-choice-type-2]')) && /Mosaic/.test(await page.textContent('[data-testid=roll-choice-type-1]')));
  check('…and which are shiny', (await page.locator('[data-testid^=roll-choice-shiny-]').count()) === 2 && (await page.locator('[data-testid=roll-choice-shiny-1]').count()) === 1);
  check('the best suggestion is the shiny Kraken', /BEST/.test(await page.textContent('[data-testid=roll-choice-2]')));
  await page.click('[data-testid=roll-choice-2]'); await page.click('[data-testid=roll-keep]');
  await page.waitForSelector('[data-testid=roll-clip]', { timeout: 20000 }); await page.waitForTimeout(1500);
  await shot('01-reveal-with-clip');
  check('the kept plot shows its minigame', (await page.getAttribute('[data-testid=roll-game]', 'data-type')) === 'lumina' && /LIGHTLINES/.test(await page.textContent('[data-testid=roll-game]')), await page.textContent('[data-testid=roll-game]'));
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
  // snip a frame
  await page.click('[data-testid=clip-snip]');
  await page.waitForSelector('[data-testid=clip-snip-canvas]', { timeout: 10000 }); await page.waitForTimeout(800);
  const dl2 = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await page.click('[data-testid=snip-save]');
  const d2 = await dl2;
  check('a frame can be snipped as a picture', !!d2 && /landvas-kraken-shiny-snip\.png/.test(d2.suggestedFilename()), d2?.suggestedFilename());
  if (d2) await d2.saveAs(`${OUT}/snip.png`);
  await page.locator('[data-testid=clip-snip-editor] button', { hasText: /Back to the clip/ }).click();
  await page.locator('[data-testid=clip-sheet] button', { hasText: 'Close' }).click();
  // a Rare: no clip
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.evaluate(() => { window.__tagSeen = []; window.__landvasRollDemo('rare', false, null); });
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 20000 }); await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => window.__tagSeen);
  check('a single roll: its minigame drops on as the drum lands, and stays for the reveal', seen[0] === 'spin:pigment' && seen.includes('reveal:pigment'), JSON.stringify(seen));
  await shot('01b-rare');
  const ink = await page.evaluate(() => { const r = [...document.querySelectorAll('[data-testid=ink-roll]')].pop(); return [...r.querySelectorAll('.lv-rr-ink')].map((x) => getComputedStyle(x).fill); });
  check('the ink floods in the rarity\'s colour', ink.length > 5 && ink.every((f) => f === 'rgb(47, 184, 255)'), [...new Set(ink)].join(' '));
  check('no clip for a Rare', (await page.locator('[data-testid=roll-clip]').count()) === 0);
  // normal speed takes longer
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.setItem('landvas.rerollSpeed', 'normal'));
  const t1 = Date.now();
  await page.evaluate(() => window.__landvasRollDemo('epic', false, ['rare', 'epic', 'common', 'legendary']));
  await page.waitForSelector('[data-testid=roll-pick]', { timeout: 40000 });
  const normalMs = Date.now() - t1;
  check('normal-speed rerolls take longer', normalMs > quickMs + 1500, `${quickMs} vs ${normalMs}ms`);
  // every roll is kept: the Clips page can cut them again
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.evaluate(() => window.__landvasNav('/clips'));
  await page.waitForSelector('[data-testid=clips-rolls]', { timeout: 15000 });
  const kept = await page.locator('[data-testid=clip-card]').count();
  check('past rolls are kept on the Clips page', kept >= 2, `${kept}`);
  await page.waitForTimeout(1500); await shot('06-clips-page');
  await page.locator('[data-testid=clip-card-video]').last().click();
  await page.waitForSelector('[data-testid=clip-video], [data-testid=clip-image]', { timeout: 90000 });
  check('…and an old roll can be clipped again', true);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); await shot('99-error'); }
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
