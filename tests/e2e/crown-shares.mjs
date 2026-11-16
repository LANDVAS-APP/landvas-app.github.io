// Real-browser check (local-mode build): a Crown holder picks their Crown's share on the Royalty page — 1% of the
// kingdom's Ink or 1% of its rent — and the pick locks for a month. Phone size, website and app skin.
// Run: npm run build:artifact && node tests/e2e/crown-shares.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-crown-shares');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4281;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const server = await serve(DIST, PORT);
let browser;

async function run(mode) {
  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  if (mode === 'app') await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  const ok = (n, v, x) => check(`${mode}: ${n}`, v, x);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${mode}-${n}.png`), timeout: 45000 }).catch(() => {});
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid=title-play], #email, button, a', { timeout: 90000 });
  await page.waitForTimeout(1500);
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  else if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in|play free|get started/i }).first().click().catch(() => {});
  await page.waitForSelector('#email', { timeout: 30000 });
  const create = page.locator('button').filter({ hasText: /create (an )?account|sign up/i }).first();
  if (await create.isVisible().catch(() => false)) await create.click().catch(() => {});
  await page.fill('#email', `king_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', `king_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  for (let k = 0; k < 3 && await page.locator('[role=dialog][data-state=open]').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  // a City Crown in Tokyo, and two other players with land there
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  const [t] = await sql(`select id, gx, gy from world_cities where name = 'Tokyo'`);
  await sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (${t.gx + 10}, ${t.gy + 10}, 'graphite', 'crown', '${me}', now())`);
  for (const [i, r] of [[1, 'legendary'], [2, 'epic']]) {
    const u = (await sql(`insert into auth.users (email) values ('subject${i}_${mode}@example.test') returning id`))[0].id;
    await sql(`insert into players (id) values ('${u}') on conflict do nothing`).catch(() => {});
    await sql(`insert into profiles (id, username) values ('${u}', 'subject${i}_${mode}') on conflict do nothing`).catch(() => {});
    await sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (${t.gx + 20 + i}, ${t.gy + 20}, 'graphite', '${r}', '${u}', now())`).catch((e) => console.log('note', String(e)));
  }
  await page.evaluate(() => window.__landvasNav('/royalty'));
  const shown = await page.waitForSelector('[data-testid=my-crowns]', { timeout: 30000 }).then(() => true, () => false);
  ok('Royalty shows your Crowns', shown);
  ok('…on the Rent share until you pick', /Not picked yet/.test(await page.locator('[data-testid=crown-share-lock]').first().textContent() ?? ''));
  await page.locator('[data-testid=my-crowns]').scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  await shot('01-my-crowns');
  await page.locator('[data-testid=crown-share-ink]').first().click();
  await page.waitForTimeout(1500);
  const row = (await sql(`select choice, locked_until > now() + interval '29 days' locked from crown_shares where holder = '${me}'`))[0];
  ok('picking the Ink share saves it, locked for a month', row?.choice === 'ink' && row?.locked === true, JSON.stringify(row));
  ok('…and the card says it is locked', /Locked until/.test(await page.locator('[data-testid=crown-share-lock]').first().textContent() ?? ''));
  await shot('02-picked-ink');
  await page.locator('[data-testid=crown-share-rent]').first().click(); await page.waitForTimeout(1000);
  ok('switching inside the month is refused (stays Ink)', (await sql(`select choice from crown_shares where holder = '${me}'`))[0]?.choice === 'ink');
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close(); await browser.close(); browser = null;
}

try {
  for (const m of (process.env.E2E_MODES ?? 'web,app').split(',')) await run(m).catch(async (e) => { check(`${m}: ran to the end`, false, String(e?.message ?? e).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 800)); await browser?.close().catch(() => {}); browser = null; });
} finally {
  await browser?.close(); server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
