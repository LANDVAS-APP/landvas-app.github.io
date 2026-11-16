// Real-browser check (local-mode build): Primordials are only rolled. A player whose Primordial was fused from three
// ultras gets those very three back by themselves — no picker: the plot is the first again, a released spot that's still
// free comes home as the second, and the third (its spot taken) waits for the next claim. One alert says so, and the
// Fusion Lab no longer offers three-ultra fusions or a refund banner. Phone size, website and app skin.
// Run: npm run build:artifact && node tests/e2e/primordial-refunds.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-primordial-refunds');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4271;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const server = await serve(DIST, PORT);
let browser;

async function run(mode) {
  browser = await launch();
  const app = mode === 'app';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::|crown_shares/.test(m.text())) errors.push(m.text()); });
  const ok = (n, v, x) => check(`${mode}: ${n}`, v, x);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${mode}-${n}.png`), timeout: 45000 }).catch(() => {});
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(1200); };
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid=title-play], #email, button, a', { timeout: 90000 });
  await page.waitForTimeout(1500);
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  else if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in|play free|get started/i }).first().click().catch(() => {});
  await page.waitForSelector('#email', { timeout: 30000 });
  const create = page.locator('button').filter({ hasText: /create (an )?account|sign up/i }).first();
  if (await create.isVisible().catch(() => false)) await create.click().catch(() => {});
  await page.fill('#email', `prim_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', `prim_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  // a Primordial fused the old way: the first plot became the Loom, the second and third plots were released
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  const T = `(select id from plot_types order by sort limit 1)`;
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at, name) values (1300000, 1500000, '${me}', ${T}, 'loom', now(), 'Big Loom')`);
  await sql(`insert into world_plots (gx, gy, plot_type, rarity) values (1300001, 1500000, ${T}, 'common')`);   // released, still free
  const other = (await sql(`select id from players where id <> '${me}' order by created_at limit 1`))[0]?.id;
  if (other) await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (1300002, 1500000, '${other}', ${T}, 'rare', now())`); // taken since
  await sql(`insert into private.fairplay_log (player_id, kind, gx, gy, data) values ('${me}', 'rx_fuse', 1300000, 1500000, '{"from": ["chaos", "kraken", "hive"], "to": "loom", "released": [[1300001, 1500000], [1300002, 1500000]]}')`);
  const n = (await sql(`select private.primordial_refunds_open() n`))[0].n;
  ok('the fused Primordial is refunded', n === 1);
  const cell = async (x) => (await sql(`select owner_id, rarity from world_plots where gx = ${x} and gy = 1500000`))[0];
  ok('…its plot is its first ultra again', (await cell(1300000)).rarity === 'chaos');
  ok('…the free released spot is theirs again, as the second ultra', (await cell(1300001))?.owner_id === me && (await cell(1300001))?.rarity === 'kraken', JSON.stringify(await cell(1300001)));
  const grants = (await sql(`select rarity from private.granted_rolls where player_id = '${me}' and used_at is null and cancelled_at is null`)).map((r) => r.rarity);
  ok(other ? '…and the third (its spot taken) comes on the next claim' : '…and the third came home too', other ? grants.join() === 'hive' : (await cell(1300002))?.rarity === 'hive', grants.join());
  // the alert pops up by itself; nothing to pick
  for (let k = 0; k < 3 && await page.locator('[role=dialog][data-state=open]').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['alerts'] }));
  const pop = page.locator('[data-testid=alert-popup][data-kind=power]').filter({ hasText: 'Your ultras are back' });
  const popped = await pop.first().waitFor({ timeout: 40000 }).then(() => true, () => false);
  const text = popped ? (await pop.first().textContent({ timeout: 3000 }).catch(() => '')) ?? '' : '';
  await shot('01-alert');
  ok('one alert says the three fused ultras are back', popped && /Chaos/.test(text) && /Kraken/.test(text) && /Hive/.test(text) && /Loom/.test(text), text);
  ok('…and says where the third comes', !other || /next claim/.test(text), text);
  await page.waitForTimeout(4000);
  ok('no picker anywhere', (await page.locator('[data-testid=refund-picker]').count()) === 0);
  // the bell's activity keeps it
  await page.locator('[data-testid=notification-bell]:visible').first().click();
  const listed = await page.locator('[data-testid=activity-list]').filter({ hasText: 'Your ultras are back' }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  await page.waitForTimeout(500); await shot('02-bell');
  ok('the bell lists it', listed);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  // the Fusion Lab: two ultras only, no refund banner
  await nav('/fusion');
  await page.waitForSelector('[data-testid=fusion-book]', { timeout: 20000 });
  ok('the Fusion Lab says Primordials are only rolled', (await page.locator('[data-testid=recipe-primordial]').count()) === 1 && (await page.locator('[data-testid=recipe-triple]').count()) === 0);
  ok('…and has no refund banner or picker', (await page.locator('[data-testid=refund-banner]').count()) === 0 && (await page.locator('[data-testid=refund-picker]').count()) === 0);
  await shot('03-fusion');
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close(); await browser.close(); browser = null;
}

try {
  for (const m of (process.env.E2E_MODES ?? 'web,app').split(',')) await run(m).catch(async (e) => { check(`${m}: ran to the end`, false, String(e?.message ?? e).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 3000)); await browser?.close().catch(() => {}); browser = null; });
} finally {
  await browser?.close(); server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
