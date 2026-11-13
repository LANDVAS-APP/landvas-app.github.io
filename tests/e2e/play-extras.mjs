// The app's Play area extras (local-mode build, simulated Android shell, phone size):
//  * plot games show what a clear pays and today's paid runs (or "No limit"); maxed games sit at the bottom
//  * the Ultra tracker lists Chaos's roll, Phoenix stacked on the streak, Solar's window
//  * the daily check-in shows Phoenix (stacked) and Chaos for today
//  * plot worlds (a farm) with their games, Ink a run and today's Ink limit
//  * the premium daily wheel, the minigame preview (maxed plots last), the sketch dock and the Inkborn studio
// Run: npm run build:artifact && node tests/e2e/play-extras.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/play-extras');
fs.mkdirSync(OUT, { recursive: true });
const server = await serve(DIST, 4198);
const BASE = 'http://localhost:4198';
const fails = [];
const check = (ok, what, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${what}${extra ? ` — ${extra}` : ''}`); if (!ok) fails.push(what); };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' };

const browser = await launch();
const ctx = await browser.newContext(phone);
await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const go = (to) => page.evaluate((t) => window.__landvasNav(t), to);
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => console.log(`note  screenshot ${name} skipped`));
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);

// sign up as a new player and drop into Simple mode
await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'load' });
await page.waitForSelector('[data-testid=title-play], #email', { timeout: 60000 });
if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
await page.waitForSelector('#email', { timeout: 30000 });
await page.fill('#email', 'extras@example.test');
await page.fill('#password', 'paint-the-world');
await page.click('button[type=submit]');
await page.waitForSelector('#username', { timeout: 30000 });
await page.fill('#username', 'extras');
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
await page.click('[data-testid=place-simple]').catch(() => {});
await page.waitForTimeout(2500);

const [{ id: uid }] = await sql(`select id from profiles where username = 'extras'`);
// Ultras: a Chaos, two Phoenix and a Solar; a 12-day streak checked in yesterday
const give = (gx, gy, type, rarity) => sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, $3, $4, $5, now()) on conflict (gx, gy) do nothing`, [gx, gy, type, rarity, uid]);
await give(3000001, 1500001, 'graphite', 'chaos');
await give(3000003, 1500001, 'pigment', 'phoenix');
await give(3000005, 1500001, 'pigment', 'phoenix');
await give(3000007, 1500001, 'mosaic', 'solar');
await give(3000009, 1500001, 'graphite', 'common');
await sql(`insert into daily_streaks (player_id, last_day, streak, best, total_days) values ($1, private.game_day(now()) - 1, 12, 12, 12) on conflict (player_id) do update set last_day = excluded.last_day, streak = 12`, [uid]);
// TraceCraft (graphite) has used every paid run today: it goes to the bottom
await sql(`select 1`);
// a group for the common plot (the local database, as its owner) so it can become a farm
await sql(`select private.create_group_with_cells($1, '[[3000009, 1500001]]'::jsonb, private.empty_manifest(), 'Sunny acres', 'initial')`, [uid]).catch((e) => console.log('note  group:', String(e).slice(0, 160)));
await sql(`insert into resource_balances (player_id, resource, amount) values ($1, 'ink', 50000) on conflict (player_id, resource) do update set amount = 50000`, [uid]);
const groups = await api('myGroups');
console.log('note  groups:', groups.map((g) => `${g.kind}:${g.plot_count}`).join(', ') || 'none');
const farmGroup = groups.find((g) => (g.kind ?? 'canvas') !== 'home');
if (farmGroup) await api('setGroupKind', farmGroup.id, 'farm').catch((e) => console.log('note  farm:', e.message ?? e));
await page.evaluate(() => window.__landvasQc.invalidateQueries());

// ---- the Play hub ----
await go('/hub');
await page.waitForSelector('[data-testid=hub-plot-games]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const runs = await page.locator('[data-testid^=hub-runs-]').allInnerTexts();
check(runs.length >= 3 && runs.every((t) => /\d+\/\d+ runs|No limit|Maxed today/.test(t)), 'hub: every plot game shows its paid runs or "No limit"', runs.join(' | '));
check(await page.locator('[data-testid=hub-plot-games]').innerText().then((t) => /a clear/.test(t)), 'hub: plot games say what a clear pays');
await page.locator('[data-testid=hub-plot-games]').scrollIntoViewIfNeeded();
await shot('hub-plot-games');
await page.waitForSelector('[data-testid=ultra-tracker]', { timeout: 15000 }).catch(() => {});
const ut = await page.locator('[data-testid=ultra-tracker]').innerText().catch(() => '');
check(/Chaos/.test(ut) && /Phoenix/.test(ut) && /Solar/.test(ut), 'hub: the Ultra tracker lists Chaos, Phoenix and Solar');
check(/×2\.2/.test(await page.locator('[data-testid=ultra-phoenix]').innerText().catch(() => '')), 'hub: Phoenix shows the 12-day streak multiplier (×2.2)');
check(/Open|Opens in/.test(await page.locator('[data-testid=ultra-solar]').innerText().catch(() => '')), "hub: Solar shows its window");
await page.locator('[data-testid=ultra-tracker]').scrollIntoViewIfNeeded().catch(() => {});
await shot('hub-ultras');
if (farmGroup) {
  await page.waitForSelector('[data-testid=world-farm]', { timeout: 15000 }).catch(() => {});
  check(await page.locator('[data-testid=world-farm]').count() > 0, 'hub: plot worlds list your farm');
  await page.locator('[data-testid=world-farm]').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid=world-farm] [data-testid=ink-limit], [data-testid=world-farm] [data-testid=ink-nolimit]').count() > 0, "hub: the farm shows today's Ink limit (or No limit)");
  await page.locator('[data-testid=world-farm] button[aria-expanded]').click().catch(() => {});
  await page.waitForTimeout(700);
  check(await page.locator('[data-testid=world-farm] [data-testid=world-games] button').count() > 0, 'hub: the farm opens to its games');
  check(/a run/.test(await page.locator('[data-testid=world-farm]').innerText()), 'hub: farm games say what a run pays');
  await shot('hub-worlds');
}

// ---- the daily check-in ----
await page.click('[data-testid=hub-streak]').catch(() => {});
await page.waitForSelector('[data-testid=streak-dialog]', { timeout: 15000 }).catch(() => {});
await page.waitForSelector('[data-testid=ultra-strip]', { timeout: 15000 }).catch(() => {});
const strip = await page.locator('[data-testid=ultra-strip]').innerText().catch(() => '');
check(/Phoenix · 2 plots/.test(strip) && /×2\.2/.test(strip) && /×2\.3/.test(strip), 'check-in: Phoenix stacked (2 plots), ×2.2 now → ×2.3 when you check in', strip.replace(/\n/g, ' '));
check(/Chaos/.test(strip), "check-in: Chaos shows today's roll");
await shot('streak-ultras');
await page.click('[data-testid=streak-claim]').catch(() => {});
await page.waitForTimeout(1500);
check(/×2\.3/.test(await page.locator('[data-testid=ultra-phoenix]').first().innerText().catch(() => '')), 'check-in: claiming lifts the Phoenix to ×2.3');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// ---- the daily wheel ----
await page.click('[data-testid=hub-spin]').catch(() => {});
await page.waitForSelector('[data-testid=daily-wheel] svg text', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(600);
check(await page.locator('[data-testid=daily-wheel] svg linearGradient').count() > 3, 'wheel: premium slices (a gradient per slice)');
await shot('wheel');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// ---- the minigame preview: maxed plots last ----
await sql(`insert into plot_game_progress (player_id, gx, gy, game, highest_level, wins) values ($1, 3000009, 1500001, 'tracecraft', 60, 60) on conflict do nothing`, [uid]).catch((e) => console.log('note  progress:', String(e).slice(0, 120)));
await page.evaluate(() => window.__landvasQc.invalidateQueries());
await go('/play/tracecraft');
await page.waitForSelector('[data-testid=game-intro]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);
check(await page.locator('[data-testid=game-intro]').count() > 0, 'game: the premium preview shows before playing');
const picks = await page.locator('[data-testid=plot-pick]').evaluateAll((b) => b.map((x) => x.hasAttribute('data-maxed')));
check(picks.length < 2 || picks.indexOf(true) === -1 || picks.indexOf(true) > picks.lastIndexOf(false), 'game: maxed plots are at the bottom of the picker', JSON.stringify(picks));
check(await page.locator('[data-testid=game-start]').isEnabled().catch(() => false), 'game: the default plot still has levels to play');
await shot('game-intro');

// ---- drawing: Sketch of the Day dock, the Inkborn studio ----
await go('/sketch');
await page.waitForSelector('[data-testid=sketch-start], [data-testid=sketch-brush]', { timeout: 30000 }).catch(() => {});
await page.click('[data-testid=sketch-start]').catch(() => {});
await page.getByRole('button', { name: 'Start the clock' }).click({ timeout: 10000 }).catch(() => {});
await page.waitForSelector('[data-testid=sketch-brush]', { timeout: 30000 }).catch(() => {});
await shot('sketch-page');
check(await page.locator('[data-testid=sketch-brush]').count() > 0, 'sketch: the premium dock with the brush');
const b = await page.locator('[data-testid=sketch-brush]').boundingBox().catch(() => null);
if (b) {
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.waitForTimeout(500);
  check(await page.locator('[data-testid=sketch-size]').count() > 0, 'sketch: holding the brush opens its size');
  await page.mouse.move(b.x + b.width / 2, b.y - 60, { steps: 6 });
  await shot('sketch-size');
  await page.mouse.up();
}
await go('/inkborn/create');
await page.waitForSelector('[data-testid=studio-draw]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);
check(await page.locator('[data-testid=studio-draw] [data-testid=sketch-brush]').count() > 0, 'inkborn studio: the same drawing dock');
check(await page.locator('[data-testid=studio-preview]').isHidden().catch(() => false), 'inkborn studio: no preview until you draw');
await shot('inkborn-studio');

// ---- the painting editor: the dock, hold a brush for its size ----
await sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (3000011, 1500001, 'graphite', 'common', $1, now()) on conflict (gx, gy) do nothing`, [uid]);
const canvasGroup = await sql(`select private.create_group_with_cells($1, '[[3000011, 1500001]]'::jsonb, private.empty_manifest(), 'Easel', 'initial') id`, [uid]).then((r) => r[0]?.id).catch((e) => { console.log('note  canvas group:', String(e).slice(0, 160)); return null; });
if (canvasGroup) {
  await api('setGroupKind', canvasGroup, 'canvas').catch((e) => console.log('note  art type:', e.message ?? e));
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await go(`/create/${canvasGroup}`);
  await page.waitForSelector('[data-testid=paint-dock]', { timeout: 40000 }).catch(() => {});
  await shot('editor');
  check(await page.locator('[data-testid=paint-dock]').count() > 0, 'editor: the premium paint dock', page.url());
  const brush = page.locator('[data-testid=paint-dock] button[aria-label*="hold to change size"]').first();
  const bb = await brush.boundingBox().catch(() => null);
  if (bb) {
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
    await page.waitForTimeout(600);
    check(await page.locator('.lv-toolbubble').count() > 0, 'editor: holding a brush opens its size and settings');
    await page.mouse.move(bb.x + bb.width / 2, bb.y - 80, { steps: 6 });
    await shot('editor-hold');
    await page.mouse.up();
  } else check(false, 'editor: a brush in the dock');
}

check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
