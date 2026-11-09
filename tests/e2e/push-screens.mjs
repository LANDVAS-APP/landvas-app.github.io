// Screens that now listen for pushes instead of asking on a timer (local-mode build: there are no live channels
// there, so each falls back to its old timer). Opens each one, checks it renders without errors, waits through a
// couple of refresh cycles, and saves screenshots.
// Run: npm run build:artifact && node tests/e2e/push-screens.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/push-screens');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 4193;
const ROUTES = (process.env.ROUTES ?? '/social,/pvp,/support,/clans,/inkborn,/challenges,/sketch,/doodle,/duet,/invite,/space,/me,/u/push_check/room,/u/push_check/home').split(',');

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|WebGL|GPU/.test(m.text())) errors.push(`${page.url()}: ${m.text()}`); });
const results = [];
let failed = false;
try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'push@example.test');
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', 'push_check');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 20000 });
  for (const route of ROUTES) {
    const before = errors.length;
    await page.evaluate((r) => window.__landvasNav(r), route);
    await page.waitForTimeout(2500);
    // hide and show the app, as switching away and back does (the refresh-on-return path)
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await page.waitForTimeout(1500);
    const text = (await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText || document.body.innerText)).trim(); // 3D rooms are full-screen, outside <main>
    const blank = text.length < 20, boundary = /something went wrong|unexpected application error/i.test(text);
    const ok = !blank && !boundary && errors.length === before;
    results.push({ route, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${route}${blank ? ' — blank' : ''}${boundary ? ' — error screen' : ''}${errors.length > before ? ' — ' + errors.slice(before).join(' | ').slice(0, 300) : ''}`);
    await page.screenshot({ path: path.join(OUT, `${route.replace(/\W+/g, '_') || 'root'}.png`) });
    if (!ok) failed = true;
  }
  // home chat: a message sent shows in the box (the chat list loop that now waits for nudges)
  await page.evaluate(() => window.__landvasNav('/u/push_check/home'));
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /^Chat/ }).first().click();
  await page.waitForTimeout(500);
  const box = page.locator('input[placeholder], textarea[placeholder]').last();
  await box.fill('hello from the push check');
  await box.press('Enter');
  await page.waitForTimeout(2500);
  const shown = await page.evaluate(() => document.body.innerText.includes('hello from the push check'));
  console.log(`${shown ? 'PASS' : 'FAIL'}  home chat message shows`);
  await page.screenshot({ path: path.join(OUT, 'home_chat.png') });
  results.push({ route: 'home chat', ok: shown }); if (!shown) failed = true;
} catch (e) {
  console.log('FAIL  run —', e.message); failed = true;
} finally {
  await browser.close(); server.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length} screens OK`);
process.exit(failed ? 1 : 0);
