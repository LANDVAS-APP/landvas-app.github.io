// Real-browser check (local-mode build): Primordials are only rolled. A player whose Primordial was fused from three
// ultras gets the picker by itself, picks any three ultras (the plot becomes the first, the next two claims the others),
// and the Fusion Lab no longer offers three-ultra fusions. Phone size, website and app skin.
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
  // a Primordial fused the old way
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at, name) values (1300000, 1500000, '${me}', (select id from plot_types order by sort limit 1), 'loom', now(), 'Big Loom')`);
  await sql(`insert into private.fairplay_log (player_id, kind, gx, gy, data) values ('${me}', 'rx_fuse', 1300000, 1500000, '{"from": ["chaos", "kraken", "hive"], "to": "loom"}')`);
  const n = (await sql(`select private.primordial_refunds_open() n`))[0].n;
  ok('the fused Primordial opens a refund', n === 1);
  ok('…and its plot is its first ultra again', (await sql(`select rarity from world_plots where gx = 1300000 and gy = 1500000`))[0].rarity === 'chaos');
  // the app shows the picker by itself (as it would on the next app start), once any other pop-up is dealt with
  for (let k = 0; k < 3 && await page.locator('[role=dialog][data-state=open]').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['primordial-refunds'] }));
  const opened = await page.waitForSelector('[data-testid=refund-picker]', { timeout: 40000 }).then(() => true, () => false);
  if (!opened) await shot('00-no-picker');
  ok('the picker opens by itself', opened);
  await page.waitForTimeout(800); await shot('01-picker');
  const choices = await page.locator('[data-testid^=refund-choice-]').count();
  ok('it offers the ultras to pick from (no Crowns, no Primordials)', choices >= 15 && (await page.locator('[data-testid=refund-choice-crown]').count()) === 0 && (await page.locator('[data-testid=refund-choice-loom]').count()) === 0, `${choices}`);
  const pick = async (id) => { const l = page.locator(`[data-testid=refund-choice-${id}]`); await l.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await l.click(); await page.waitForTimeout(250); };
  ok('Volcano is one of the choices', (await page.locator('[data-testid=refund-choice-volcano]').count()) === 1);
  await pick('volcano'); await pick('hive'); await pick('hive');
  ok('three slots filled', (await page.locator('[data-testid=refund-confirm]').textContent())?.includes('Bring my ultras back'), await page.locator('[data-testid=refund-confirm]').textContent());
  ok('the confirm button stays on screen', await page.locator('[data-testid=refund-confirm]').isVisible() && ((await page.locator('[data-testid=refund-confirm]').boundingBox())?.y ?? 9999) < 844);
  await shot('02-picked');
  await page.locator('[data-testid=refund-confirm]').click();
  ok('done', await page.waitForSelector('[data-testid=refund-done]', { timeout: 20000 }).then(() => true, () => false));
  await page.waitForTimeout(800); await shot('03-done');
  ok('the plot is the first pick', (await sql(`select rarity from world_plots where gx = 1300000 and gy = 1500000`))[0].rarity === 'volcano');
  ok('…and the next two claims will roll the others', (await sql(`select count(*)::int n from private.granted_rolls where player_id = '${me}' and rarity = 'hive' and used_at is null`))[0].n === 2);
  await page.locator('[data-testid=refund-close]').click({ force: true });
  // the Fusion Lab: two ultras only
  await nav('/fusion');
  await page.waitForSelector('[data-testid=fusion-book]', { timeout: 20000 });
  ok('the Fusion Lab says Primordials are only rolled', (await page.locator('[data-testid=recipe-primordial]').count()) === 1 && (await page.locator('[data-testid=recipe-triple]').count()) === 0);
  ok('…and the refund is done (no banner)', (await page.locator('[data-testid=refund-banner]').count()) === 0);
  await shot('04-fusion');
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
