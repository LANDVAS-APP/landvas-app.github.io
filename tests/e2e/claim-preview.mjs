// Real-browser check (local-mode build) of the claim preview: tap an empty plot and everything needed to claim it is on
// screen without scrolling — the plot, the type picker, the Claim button — with the rarity odds one tap away (not in
// the preview). On a phone (website), on a desktop, and in the app's own skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/claim-preview.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-claim-preview');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4251, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 26, gy: 24628 * 64 + 36 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

const server = await serve(DIST, PORT);
let browser;

async function run(mode, i) {
  browser = await launch();
  const phone = mode !== 'desktop', app = mode === 'app';
  const ctx = await browser.newContext({
    ...(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 860 } }),
    colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'],
  });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::|primordial_refund/.test(m.text())) errors.push(m.text()); });
  const ok = (n, v, x) => check(`${mode}: ${n}`, v, x);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${mode}-${n}.png`), timeout: 45000 }).catch(() => {});
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
  const tid = (id) => page.locator(`[data-testid=${id}]:visible`).first();
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'domcontentloaded' });
  // sign up (the app opens on its title screen)
  await page.waitForSelector('[data-testid=title-play], #email, button, a', { timeout: 90000 });
  await page.waitForTimeout(1500);
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  else if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in|play free|get started/i }).first().click().catch(() => {});
  await page.waitForSelector('#email', { timeout: 30000 });
  const create = page.locator('button').filter({ hasText: /create (an )?account|sign up/i }).first();
  if (await create.isVisible().catch(() => false)) await create.click().catch(() => {});
  await page.fill('#email', `claim${i}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', `claimer_${i}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const p = ll(START.gx, START.gy);
  const r = await api('reportPosition', p.longitude, p.latitude, 8).catch(() => null);
  if (r) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r);
  await page.evaluate(() => window.__landvasNav('/world'));
  await page.waitForTimeout(2500);
  // tap an empty plot (the preview opens for it)
  await page.evaluate(([gx, gy]) => window.__landvasUi.getState().select({ gx, gy }), [START.gx, START.gy]);
  const opened = await page.waitForSelector('[data-testid=claim-preview]', { timeout: 20000 }).then(() => true, () => false);
  ok('tapping an empty plot opens the claim preview', opened);
  await page.waitForTimeout(1200);
  await shot('01-preview');
  const vh = page.viewportSize().height;
  const btn = await tid('claim-plot').boundingBox().catch(() => null);
  ok('the Claim button is on screen without scrolling', !!btn && btn.y + btn.height <= vh - 4, btn ? `bottom ${Math.round(btn.y + btn.height)} of ${vh}` : 'no button');
  const scroll = await page.evaluate(() => { const a = document.querySelector('[data-testid=plot-panel]'); return a ? a.scrollHeight - a.clientHeight : -1; });
  ok('the preview needs no scrolling at all', scroll <= 2, `overflow ${scroll}px`);
  ok('the rarity odds are not crammed into the preview', (await page.locator('[data-testid=plot-panel] [data-testid^=odds-]').count()) === 0 && (await page.locator('[data-testid=plot-panel]').innerText()).match(/Mythic|Legendary|Uncommon/) === null);
  ok('every plot type is in one row', (await page.locator('[data-testid=plot-kind-choice] [role=radiogroup] >> nth=0').locator('[role=radio]').count()) >= 10);
  // pick a type with subplots, then back
  await tid('buy-as-residential').click(); await page.waitForTimeout(500);
  ok('Residential opens its two subplots', (await page.locator('[data-testid=buy-subplots] [role=radio]').count()) === 2);
  await shot('02-subplots');
  const btn2 = await tid('claim-plot').boundingBox().catch(() => null);
  ok('…and Claim is still on screen', !!btn2 && btn2.y + btn2.height <= vh - 4);
  await tid('buy-as-base').click(); await page.waitForTimeout(300);
  // the odds, one tap away
  await tid('claim-odds').click();
  const sheet = await page.waitForSelector('[data-testid=odds-sheet]', { timeout: 10000 }).then(() => true, () => false);
  ok('the Odds button opens the odds', sheet && (await page.locator('[data-testid^=odds-]').count()) >= 5);
  ok('…with a link to every rarity in the Guide', await page.locator('[data-testid=odds-guide]').isVisible());
  await shot('03-odds');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // claim it
  await tid('claim-plot').click();
  const claimed = await page.waitForFunction(() => !document.querySelector('[data-testid=claim-preview]'), null, { timeout: 30000 }).then(() => true, () => false);
  ok('Claim claims the plot', claimed);
  await page.waitForTimeout(1500); await shot('04-claimed');
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close(); await browser.close(); browser = null;
}

try {
  let i = 0;
  for (const m of (process.env.E2E_MODES ?? 'phone,desktop,app').split(',')) await run(m, ++i).catch(async (e) => { check(`${m}: ran to the end`, false, String(e?.message ?? e).slice(0, 300)); await browser?.close().catch(() => {}); browser = null; });
} finally {
  await browser?.close(); server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
