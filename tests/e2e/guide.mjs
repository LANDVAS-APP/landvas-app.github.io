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
  // sample measured stats (the local game has no history): a cache entry the guide reads like the real one
  const stats = { days: 14, players: 40, active_hours: 900, ink: 250000, ink_per_active_hour: 260, ink_per_active_hour_median: 120, ink_per_active_hour_p90: 900, ink_per_active_day_median: 450, ink_per_active_day_p90: 3200, hours_per_active_day_avg: 2.1,
    player_days: { count: 300, p50: 450, p75: 1300, p90: 3200, p95: 4800, p99: 7600, max: 8240, hours_p50: 1, hours_p75: 3, ge_1000: 90, ge_3000: 32, ge_5000: 12, ge_8000: 2 },
    top_days: [{ ink: 8240, hours: 7, span_hours: 9.5, rewards: 900, sources: { arcade: 5100, minigame: 1800, business: 900 } }, { ink: 8010, hours: 6, span_hours: 8, rewards: 800, sources: { arcade: 4000, realm: 2500 } }],
    grinders: { days: 40, avg_ink: 4100, avg_hours: 4.6, ink_per_active_hour: 890, p50: 3600, p90: 7100 }, top10pct: { days: 30, avg_ink: 5200, avg_hours: 5.1, ink_per_active_hour: 1020 },
    minigame_rarity: { all: { wins: 5000, avg_mult: 1.31, avg_plot_level: 2.4 }, top: { wins: 2100, avg_mult: 1.86, avg_plot_level: 4.1, players: 4 } },
    by_source: { arcade: { ink: 120000, times: 20000, players: 30, avg: 6, per_hour: 610, p90_hour: 1100, max_hour: 1500 }, minigame: { ink: 60000, times: 5000, players: 38, avg: 12, per_hour: 180, p90_hour: 400, max_hour: 700 } },
    top_days_sources: { arcade: 90000, minigame: 30000, business: 12000, realm: 9000 },
    plots: { owners: 40, avg: 60, median: 20, total: 2400, p90: 200, max: 900 }, claims_per_day: { player_days: 200, avg: 8, p50: 3, p90: 25, max: 82 }, minigames: { plays: 9000, win_rate: 0.8, median_seconds: 35 } };
  await sql(`insert into private.guide_cache (id, at, data) values (1, now(), '${JSON.stringify(stats).replace(/'/g, "''")}'::jsonb) on conflict (id) do update set at = now(), data = excluded.data`);
  await page.evaluate(() => window.__landvasNav('/guide'));
  await page.waitForSelector('[data-testid=guide-rates]', { timeout: 20000 }); await page.waitForTimeout(800);
  await shot('01-top');
  for (const s of ['facts', 'rates', 'minigames', 'score', 'ink', 'real', 'grind', 'progress', 'calc', 'compare', 'how']) check(`section ${s}`, (await page.locator(`[data-testid=guide-${s}]`).count()) === 1);
  check('rates table lists Common with its live rate', /0\.0000000011/.test(await text('[data-testid=guide-rate-common]')), await text('[data-testid=guide-rate-common]'));
  check('minigame Ink by rarity: Mythic pays more than Common at level 1', await page.evaluate(() => { const c = +document.querySelector('[data-testid=guide-mg-common] td:nth-child(2)').textContent; const m = +document.querySelector('[data-testid=guide-mg-mythic] td:nth-child(2)').textContent; return m > c && c > 0; }));
  check('arcade cabinets say they have no daily cap', /no daily cap/.test(await text('[data-testid="guide-score-Arcade cabinets"]')));
  check('grinders: best day shown', /8,240 Ink/.test(await text('[data-testid=guide-grind-tiles]')));
  check('top days listed with sources, no names', (await page.locator('[data-testid=guide-top-days] > *').count()) === 2 && !/@/.test(await text('[data-testid=guide-top-days]')));
  await page.click('[data-testid=progress-grinder]'); await page.waitForTimeout(300);
  const ot = await text('[data-testid=progress-overtake]');
  check('progression race: grinder overtakes both', /passes TerraMine|out-earns TerraMine/.test(ot) && /passes Atlas Earth|out-earns Atlas Earth/.test(ot), ot);
  check('compare defaults to top players (every source)', /5,200 Ink a day/.test(await text('[data-testid=compare-top-note]')), await text('[data-testid=compare-top-note]'));
  await page.click('[data-testid=compare-mode-rates]'); await page.waitForTimeout(300);
  check('game-rates mode offers the plot-rarity bonus picker', (await page.locator('[data-testid=guide-compare] [data-testid=rarity-picker] button').count()) >= 3);
  await page.click('[data-testid=compare-mode-top]');
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
  for (const sec of ['minigames', 'score', 'grind', 'progress']) { await page.locator(`[data-testid=guide-${sec}]`).scrollIntoViewIfNeeded(); await page.evaluate((s) => document.querySelector(`[data-testid=guide-${s}]`).scrollIntoView({ block: 'start' }), sec); await page.waitForTimeout(300); await shot(`s-${sec}`); }
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
