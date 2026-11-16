// Real-browser check (local-mode build): Classic or Endless for arcade matches, and big scores.
//  - at a cabinet, the match buttons come with a Classic / ∞ Endless pick
//  - a Versus lobby made in Endless says so, and its host can switch it back and forth
//  - a second player sees the invite as Endless
// Run: npm run build:artifact && node tests/e2e/arcade-play-styles.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-arcade-play');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4241, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 30, gy: 24628 * 64 + 40 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const hall = (expr) => page.evaluate((e) => { const h = window.__landvasArcade; return new Function('h', `return (${e})`)(h); }, expr);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const visible = (id) => tid(id).first().isVisible().catch(() => false);
const URL = `http://localhost:${PORT}/?e2e=1`;

async function signUp(email, username) {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in|play free|get started/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click().catch(() => {});
  await page.waitForSelector('#email', { timeout: 30000 });
  const create = page.locator('button').filter({ hasText: /create (an )?account|sign up/i }).first();
  if (await create.isVisible().catch(() => false)) await create.click().catch(() => {});
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#username'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const p = ll(START.gx, START.gy);
  const r = await api('reportPosition', p.longitude, p.latitude, 8).catch(() => null);
  if (r) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r);
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await signUp('ada.arcade@example.test', 'ada_arcade');
  const p = await api('claimStarter', START.gx, START.gy, 'Ada arcade');
  const a = await api('setGroupKind', p.group_id, 'arcade');
  await nav(`/arcade/${a.arcade_id}`);
  await page.waitForFunction(() => !!window.__landvasArcade, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await hall(`h.walkTo({ kind: 'machine', id: 'stacker' })`);
  await page.waitForFunction(() => window.__landvasArcade.debug().near === 'm:stacker', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  check('the match buttons come with a Classic / Endless pick', (await visible('match-play')) && (await visible('match-play-endless')) && (await visible('match-new-versus')));
  await shot('01-match-buttons');
  await tid('match-play-endless').click();
  check('Endless can be picked', (await tid('match-play-endless').getAttribute('aria-checked')) === 'true');
  await tid('match-new-versus').click();
  await page.waitForSelector('[data-testid=match-lobby]', { timeout: 20000 });
  await page.waitForTimeout(800);
  const lobbyText = (await tid('match-lobby').textContent()) ?? '';
  check('the lobby says Endless', /until everyone runs out of lives/.test(lobbyText) && (await tid('lobby-play-endless').getAttribute('aria-checked')) === 'true', lobbyText.slice(0, 120));
  const m = (await sql(`select play from arcade_matches order by created_at desc limit 1`))[0];
  check('…and the match is Endless on the server', m?.play === 'endless');
  await shot('02-lobby-endless');
  await tid('lobby-play-classic').click(); await page.waitForTimeout(1500);
  check('the host can switch it back to Classic', (await sql(`select play from arcade_matches order by created_at desc limit 1`))[0]?.play === 'classic');
  await tid('lobby-play-endless').click(); await page.waitForTimeout(1500);
  check('…and to Endless again', (await sql(`select play from arcade_matches order by created_at desc limit 1`))[0]?.play === 'endless');
  check('page has no errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('ran to the end', false, String(e?.message ?? e).slice(0, 300));
  await shot('99-error');
}

await browser.close(); server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
