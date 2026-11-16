// Real-browser test of house party games with AI players (local-mode build, a phone):
//  - on your own at home: open Four in a Row, fill the empty seat with a bot, start, and the bot plays its turns
//  - a 3D game (Ink Tag) with bots: the bots run about the map
// Run: npm run build:artifact && node tests/e2e/house-bots.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-house-bots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4239;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'botty@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'botty_bea'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await api('claimStarter', START.gx, START.gy).catch(() => {});
  await sql(`insert into homes (player_id, legacy) values ('${me}', true) on conflict (player_id) do update set legacy = true`);
  await nav('/home'); await waitFor('[data-testid=home]', 30000); await page.waitForTimeout(3000);

  // ---- Four in a Row against a bot ----
  await tid('home-games').first().click();
  check('the picker says you can play with AI players', await waitFor('[data-testid=party-picker]', 8000) && /AI players/.test(await tid('party-picker').first().textContent()));
  await tid('party-new-fourrow').first().click();
  check('a table opens', await waitFor('[data-testid=party-lobby]', 10000));
  check('on your own: fill the seat with a bot', await waitFor('[data-testid=party-fill-bots]', 5000));
  await shot('01-table');
  await tid('party-fill-bots').first().click();
  check('…a bot sits down', await waitFor('[data-testid=party-bot-seat]', 8000));
  check('…and the table can start', await waitFor('[data-testid=party-start]', 5000));
  await shot('02-bot-seat');
  await tid('party-start').first().click();
  check('the game starts', await waitFor('[data-testid=party-game]', 15000));
  await page.waitForFunction(() => window.__party?.s && window.__party.host, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4500);
  // my turn first (the host sits first): drop a disc, then the bot answers
  await page.click('[data-testid=fr-3]').catch(() => {});
  const answered = await page.waitForFunction(() => window.__party?.s?.moves >= 2, null, { timeout: 12000 }).then(() => true, () => false);
  check('you play, then the bot plays its turn (after a moment to think)', answered, JSON.stringify(await page.evaluate(() => ({ moves: window.__party?.s?.moves, turn: window.__party?.s?.turn }))));
  await shot('03-playing');
  await tid('party-leave').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  // (that game's over: a game you leave half way through otherwise carries on without you)
  await sql(`update home_games set status = 'cancelled' where host_id = '${me}' and status in ('lobby', 'playing')`);

  // ---- a 3D game with bots ----
  await nav('/world'); await page.waitForTimeout(1200); await nav('/home'); await waitFor('[data-testid=home]', 30000); await page.waitForTimeout(2500);
  await tid('home-games').first().click(); await waitFor('[data-testid=party-picker]', 8000);
  await tid('party-new-tag').first().click();
  await waitFor('[data-testid=party-lobby]', 10000);
  await tid('party-bot-plus').first().click(); await page.waitForTimeout(800);
  await tid('party-bot-plus').first().click(); await page.waitForTimeout(800);
  check('more bots: + adds a seat', (await page.locator('[data-testid=party-bot-seat]:visible').count()) === 2, await tid('party-bot-count').first().textContent().catch(() => ''));
  await tid('party-start').first().click();
  check('Ink Tag with bots', await waitFor('[data-testid=live3d]', 20000));
  await page.waitForTimeout(9000);
  const moved = await page.evaluate(() => { const w = window.__live3d?.w; return w ? w.ps.filter((p) => p.id.startsWith('bot:')).map((p) => Math.round(Math.hypot(p.x, p.z) * 10) / 10) : null; });
  check('…the bots run about', !!moved && moved.length === 2 && moved.some((d) => d > 1), JSON.stringify(moved));
  check('…and nothing floats over the play (the Worlds button lives on the map)', (await page.locator('[data-testid=worlds-button]').count()) === 0);
  await shot('04-tag');
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
