// Store-readiness check (local-mode build): the pages App Store / Google Play reviewers open, at phone size.
//  * signed out: /support shows a way to reach the team (no sign-in wall) and /legal/delete-account explains deletion
//  * a new player without GPS can still play (Simple mode from the "Drop into the world" prompt)
//  * offline shows a clear banner
//  * the app build (simulated iOS shell): no ad buttons or "coming with the app" placeholders, a Notifications
//    section in Settings, and phone-settings wording for location
// Run: npm run build:artifact && node tests/e2e/store-ready.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/store-ready');
fs.mkdirSync(OUT, { recursive: true });
const server = await serve(DIST, 4197);
const BASE = 'http://localhost:4197';
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what); };
const go = (page, to) => page.evaluate((t) => window.__landvasNav(t), to);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

async function signUp(page, tag) {
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 60000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `${tag}@example.test`);
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 });
  await page.fill('#username', tag);
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
}

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' };

// ---- the website, as a reviewer or a player without the app sees it ----
{
  const browser = await launch();
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__landvasNav, null, { timeout: 60000 });
  await go(page, '/support');
  await page.waitForSelector('[data-testid=public-support]', { timeout: 60000 }).catch(() => {});
  check(await page.locator('[data-testid=public-support]').count() > 0, 'signed out: /support shows contact options');
  check(/@landvas\.app/.test(await page.locator('[data-testid=support-email]').innerText().catch(() => '')), 'signed out: /support shows the support email');
  await shot(page, 'support-signed-out');

  await go(page, '/legal/delete-account');
  await page.waitForSelector('[data-testid=delete-account-doc]', { timeout: 30000 }).catch(() => {});
  const doc = await page.locator('[data-testid=delete-account-doc]').innerText().catch(() => '');
  check(/Delete my account/.test(doc) && /@landvas\.app/.test(doc), 'signed out: /legal/delete-account explains in-game and by-request deletion');
  await shot(page, 'delete-account');

  await signUp(page, 'store_ready_web');
  await page.waitForSelector('[data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
  check(await page.locator('[data-testid=place-simple]').count() > 0, 'new player: "Play without location" is offered');
  await shot(page, 'placement-prompt');
  await page.click('[data-testid=place-simple]').catch(() => {});
  await page.waitForSelector('[data-testid=simple-mode-off]', { timeout: 30000 }).catch(() => {});
  check(await page.locator('[data-testid=simple-mode-off]').count() > 0, 'without location: Simple mode opens');
  await shot(page, 'simple-mode');

  await go(page, '/settings');
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await page.waitForSelector('[data-testid=offline]', { timeout: 10000 }).catch(() => {});
  check(await page.locator('[data-testid=offline]').count() > 0, 'offline: banner shows');
  await shot(page, 'offline');
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await page.waitForTimeout(300);
  check(await page.locator('[data-testid=offline]').count() === 0, 'back online: banner goes');
  await browser.close();
}

// ---- the app build, in a simulated iOS shell (Capacitor custom platform with no native plugins) ----
{
  const browser = await launch();
  const ctx = await browser.newContext(phone);
  await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await signUp(page, 'store_ready_app');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 30000 }).catch(() => {});
  await shot(page, 'app-placement');
  await page.click('[data-testid=place-simple]').catch(() => {});
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  check(!/coming with the app|Refill with an ad/i.test(body), 'app: no ad placeholders on the home screen');
  await go(page, '/settings');
  await page.waitForSelector('#reminders', { timeout: 30000 }).catch(() => {});
  check(await page.locator('#reminders').count() > 0, 'app: Settings has streak reminders');
  await shot(page, 'app-settings');
  // (the simulated shell has no native plugins, so their calls fail — but a plugin must never be awaited as a promise)
  check(!errors.some((e) => /\.then\(\)/.test(e) || !/not implemented/i.test(e)), `app: no page errors${errors.length ? ` (${errors.join(' | ').slice(0, 300)})` : ''}`);
  await browser.close();
}

server.close();
console.log(fails.length ? `\n${fails.length} problem(s)` : '\nStore-ready checks passed');
process.exit(fails.length ? 1 : 0);
