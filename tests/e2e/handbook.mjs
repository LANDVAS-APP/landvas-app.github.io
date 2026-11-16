// The Handbook: the index (search, start-here path, every chapter), every chapter page with its topics and pictures,
// links to topics (#topic), live numbers from the server, and phone + desktop fit. Readable signed out.
// Run: npm run build:artifact && node tests/e2e/handbook.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-handbook'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4318);
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const CHAPTERS = ['start', 'world', 'roll', 'rent', 'ink', 'luck', 'places', 'inkborn', 'space', 'enchant', 'ultra', 'social', 'progress', 'strategy', 'faq'];

async function run(label, viewport, signIn) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
  const shot = (n, full = false) => page.screenshot({ path: `${OUT}/${label}-${n}.png`, fullPage: full, timeout: 60000 }).catch(() => console.log('skip', n));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const wide = () => page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  await page.goto('http://localhost:4318/?e2e=1', { waitUntil: 'load' });
  if (signIn) {
    await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
    if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
    await page.waitForSelector('#email'); await page.fill('#email', `hb-${label}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', `hb_${label}`.slice(0, 20)); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
  } else {
    await page.waitForFunction(() => typeof window.__landvasNav === 'function', null, { timeout: 60000 });
  }
  // a fresh update (published by staff): the handbook shows it right at the top
  await sql(`insert into announcements (title, body, kind, status, published_at, popup) values ('Chat pops up over everyone', 'What anyone says pops up over their head, everywhere people walk about together.', 'update', 'published', now(), false)`);
  if (signIn) {
    // the map's View panel opens with the Handbook as its first button
    await page.evaluate(() => window.__landvasNav('/world'));
    await page.waitForSelector('[data-testid=mode-button]', { timeout: 30000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.click('[data-testid=mode-button]'); await page.waitForSelector('[data-testid=mode-panel]'); await page.waitForTimeout(500);
    const first = await page.evaluate(() => document.querySelector('[data-testid=mode-panel]')?.firstElementChild?.getAttribute('data-testid'));
    const box = await page.locator('[data-testid=open-handbook]').boundingBox();
    const panel = await page.locator('[data-testid=mode-panel]').boundingBox();
    check(`${label}: View opens with the Handbook button first, at the top`, first === 'open-handbook' && !!box && !!panel && box.y - panel.y < 20, `${first}`);
    check(`${label}: …and only once`, (await page.locator('[data-testid=open-handbook]').count()) === 1);
    await shot('view-panel');
    await page.click('[data-testid=open-handbook]');
  } else {
    await page.evaluate(() => window.__landvasNav('/handbook'));
  }
  await page.waitForSelector('[data-testid=handbook]', { timeout: 30000 });
  await page.waitForFunction(() => /Live/.test(document.querySelector('.hb-hero .stats')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('[data-testid=hb-updates]', { timeout: 15000 }).catch(() => {});
  const firstBlock = await page.evaluate(() => document.querySelector('[data-testid=handbook]')?.firstElementChild?.getAttribute('data-testid'));
  check(`${label}: What’s new, right at the top, with the newest update`, firstBlock === 'hb-updates' && /Chat pops up over everyone/.test(await page.locator('[data-testid=hb-updates]').innerText()), `${firstBlock}`);
  if (signIn) check(`${label}: …marked new for you`, /NEW/.test(await page.locator('[data-testid=hb-updates] [data-testid=announcement-card]').first().innerText()));
  check(`${label}: index shows every chapter`, (await page.locator('[data-testid^=hb-chapter-]').count()) === CHAPTERS.length);
  check(`${label}: numbers are live`, /Live/.test(await page.locator('.hb-hero .stats').innerText()));
  check(`${label}: start-here path has 5 steps`, (await page.locator('[data-testid^=hb-start-]').count()) === 5);
  await shot('00-index');
  // search
  await page.fill('[data-testid=hb-search]', 'hot zone');
  await page.waitForTimeout(250);
  const hits = await page.locator('[data-testid=hb-results] a').count();
  check(`${label}: search finds the Hot Zone`, hits > 0 && /Hot Zone/.test(await page.locator('[data-testid=hb-results]').innerText()), `${hits} hits`);
  await shot('01-search');
  await page.locator('[data-testid=hb-results] a').filter({ hasText: 'The Hot Zone' }).first().click();
  await page.waitForSelector('[data-testid=hb-chapter-page-luck]', { timeout: 20000 }); await page.waitForTimeout(900);
  const top = await page.evaluate(() => document.getElementById('hb-hot')?.getBoundingClientRect().top ?? 9999);
  check(`${label}: a search hit opens its chapter at the topic`, top < 200 && top > -50, `${Math.round(top)}px`);
  await shot('02-hot-zone');
  // every chapter renders, fits, and has its topics
  for (const ch of CHAPTERS) {
    await page.evaluate((c) => window.__landvasNav(`/handbook/${c}`), ch);
    await page.waitForSelector(`[data-testid=hb-chapter-page-${ch}]`, { timeout: 20000 }); await page.waitForTimeout(500);
    const n = await page.locator('[data-testid^=hb-topic-]').count();
    const w = await wide();
    check(`${label}: chapter ${ch}`, n >= 2 && w <= 0, `${n} topics, ${w}px too wide`);
    await shot(`ch-${ch}`, label === 'phone');
  }
  // live numbers: change a setting in the game and the page follows
  await sql(`update game_config set value = jsonb_set(value, '{boost,multiplier}', '25') where key = 'rent'`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['game-guide'] }));
  await page.evaluate(() => window.__landvasNav('/handbook/rent#boost'));
  await page.waitForSelector('[data-testid=hb-topic-boost]', { timeout: 20000 }); await page.waitForTimeout(1500);
  check(`${label}: a changed boost shows up (×25)`, /×25/.test(await page.locator('[data-testid=hb-topic-boost]').innerText()));
  await sql(`update game_config set value = jsonb_set(value, '{boost,multiplier}', '20') where key = 'rent'`);
  // the checklist remembers today's ticks
  await page.evaluate(() => window.__landvasNav('/handbook/strategy#daily'));
  await page.waitForSelector('[data-testid=hb-checklist]', { timeout: 20000 });
  await page.locator('[data-testid=hb-checklist] input').first().check();
  check(`${label}: checklist ticks`, await page.locator('[data-testid=hb-checklist] label.done').count() === 1);
  // the Luck calculator answers
  await page.evaluate(() => window.__landvasNav('/handbook/luck#rerolls'));
  await page.waitForSelector('[data-testid=hb-luck-0]', { timeout: 20000 });
  await page.click('[data-testid=hb-luck-0]'); const none = await page.locator('[data-testid=hb-topic-rerolls]').innerText();
  await page.click('[data-testid=hb-luck-5]'); const all = await page.locator('[data-testid=hb-topic-rerolls]').innerText();
  check(`${label}: Luck calculator changes with rerolls`, none !== all && /×11/.test(all));
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close(); await browser.close();
}

try {
  await run('phone', { width: 390, height: 844 }, true);
  await run('desktop', { width: 1280, height: 900 }, false);
} catch (e) { check('run', false, e.message); }
server.close();
process.exit(results.every(Boolean) ? 0 : 1);
