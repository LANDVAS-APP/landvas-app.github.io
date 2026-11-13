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

  for (const d of ['terms', 'privacy']) {
    await go(page, `/legal/${d}`);
    await page.waitForSelector('[data-testid=legal-updated]', { timeout: 30000 }).catch(() => {});
    const t = await page.locator('[data-testid=legal-doc]').innerText().catch(() => '');
    check(/LANDVAS LLC/.test(t) && /contact@landvas\.app/.test(t) && !/draft/i.test(t), `/legal/${d}: final (LANDVAS LLC, contact@landvas.app, no draft banner)`);
  }

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
  // screens are full screen: no top bar on them (the HUD lives on the map and in the Play hub)
  await go(page, '/me');
  await page.waitForSelector('[data-testid=page-header], [data-testid=me-tiles]', { timeout: 30000 }).catch(() => {});
  check(await page.locator('[data-testid=game-hud]').count() === 0 && await page.locator('[data-testid=screen-bar]').count() > 0, 'app: screens have no top bar');
  check(await page.locator('[data-testid=hud-menu]').count() === 0, 'app: no menu button (the Play tab is the menu)');
  // the Play hub: the game's main menu — rewards, the world, every part of the game
  await go(page, '/hub');
  await page.waitForSelector('[data-testid=game-hub]', { timeout: 30000 }).catch(() => {});
  check(await page.locator('[data-testid="hub-/play"]').count() > 0 && await page.locator('[data-testid=hub-world]').count() > 0, 'app: the Play hub shows the world and every section');
  check(await page.locator('[data-testid="hub-all-/achievements"]').count() > 0 && await page.locator('[data-testid="hub-all-/settings"]').count() > 0, 'app: the hub lists every place');
  check(await page.locator('[data-testid=hub-daily]').count() > 0, "app: the hub shows today's rewards");
  check(await page.locator('[data-testid=game-hub] [data-testid=game-hud]').count() > 0, 'app: the hub has the HUD (you, rent, Ink, the bell)');
  await shot(page, 'app-hub');
  await page.click('[data-testid="hub-all-/achievements"]').catch(() => {});
  await page.waitForTimeout(1200);
  check(await page.locator('[data-testid=game-hub]').count() === 0 && /Badges/.test(await page.locator('main').innerText()), 'app: a hub tile opens its place');
  // full game: the Play tab is the hub, lit up for anywhere without its own tab
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  await go(page, '/events');
  await page.waitForSelector('[data-testid="tab-/hub"]', { timeout: 30000 }).catch(() => {});
  check(await page.locator('[data-testid="tab-/hub"][aria-current=page]').count() > 0, 'app: the Play tab is the hub and lights up for its places');
  check(await page.locator('[data-testid="tab-/play"]').count() === 0, 'app: no separate Play & Earn tab');
  const order = await page.locator('[data-testid=game-tabbar] a').evaluateAll((as) => as.map((a) => a.getAttribute('data-testid')));
  check(order.join(',') === 'tab-/hub,tab-/social,tab-/world,tab-/inkborn,tab-/canvases', 'app: tabs are Play, Community, World, Inkborn, Create', order.join(','));
  // the map: the HUD (boost next to Ink), one row under the avatar: Hot Zone, Luck, View, Grimoire
  await go(page, '/world');
  await page.waitForSelector('[data-testid=map-row]', { timeout: 60000 }).catch(() => {});
  check(await page.locator('[data-testid=game-hud] [data-testid=boost]').count() > 0, 'app map: the boost sits in the HUD next to Ink');
  check(await page.locator('[data-testid=map-row] [data-testid=mode-button]').count() > 0 && await page.locator('[data-testid=map-row] [data-testid=grimoire-button]').count() > 0, 'app map: View and the Grimoire are in the row under the avatar');
  check(await page.locator('[data-testid=streak-chip]').count() === 0, 'app map: the daily check-in stays in the Play hub');
  check(await page.locator('[data-testid=hud-pigments]').count() === 0, 'app map: one HUD, not two');
  // (a new player is first asked where to drop their explorer: close that)
  await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(800);
  if (await page.locator('[data-testid=hot-zone-chip]').count()) {
    await page.click('[data-testid=hot-zone-chip]', { timeout: 10000 }).catch((e) => console.log('  (hot zone tap:', String(e).split('\n')[0].slice(0, 120), ')'));
    await page.waitForSelector('[data-testid=hot-zone-crowd]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    check(/here now/.test(await page.locator('[data-testid=hot-zone-sheet]').innerText().catch(() => '')) && await page.locator('[data-testid=hot-zone-fly]').count() > 0, 'app map: the Hot Zone opens with who’s there and Fly there');
    await page.click('[data-testid=hot-zone-chip]').catch(() => {});
  }
  // hold the World button: the map's actions fan out around it
  const wb = await page.locator('[data-testid="tab-/world"]').boundingBox();
  await page.mouse.move(wb.x + wb.width / 2, wb.y + 20); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await page.waitForSelector('[data-testid=world-radial]', { timeout: 10000 }).catch(() => {});
  check(await page.locator('[data-testid=world-radial] [data-testid=fly-chip]').count() > 0, 'app map: holding World fans out the map actions');
  await shot(page, 'app-map-radial');
  await page.click('.lv-radial-scrim', { position: { x: 30, y: 200 } }).catch(() => {});
  await page.waitForSelector('[data-testid=world-radial]', { state: 'detached', timeout: 5000 }).catch(() => {});
  check(await page.locator('[data-testid=world-radial]').count() === 0, 'app map: a tap outside closes them');
  await shot(page, 'app-map');
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: true }));
  // a player who accepted older terms is asked once to accept the new ones
  await page.evaluate(async () => { await window.__landvasBackend.db.query("update public.players set terms_version = 'old'"); await window.__landvasQc.invalidateQueries({ queryKey: ['me'] }); });
  await page.waitForSelector('[data-testid=terms-update]', { timeout: 15000 }).catch(() => {});
  check(await page.locator('[data-testid=terms-update]').count() > 0, 'updated terms: existing players are asked to accept');
  await page.click('[data-testid=terms-accept]').catch(() => {});
  await page.waitForTimeout(1500);
  check(await page.locator('[data-testid=terms-update]').count() === 0, 'updated terms: accepting closes the prompt');
  // phone navigation: the floating tab bar, back from a deeper screen (button and edge swipe), pull to refresh
  await go(page, '/play');
  await page.waitForSelector('[data-testid=game-tabbar]', { timeout: 30000 }).catch(() => {});
  // (this player chose Simple mode above, so the bar is Play · Home · Me)
  await page.click('[data-testid="tab-/me"]', { timeout: 10000 }).catch((e) => console.log('  (tab tap:', String(e).split('\n')[0].slice(0, 160), ')'));
  await page.waitForTimeout(1200);
  await shot(page, 'app-tabs');
  check(await page.locator('[data-testid="tab-/me"][aria-current=page]').count() > 0, 'app: tab bar switches tabs');
  await go(page, '/guide');
  await page.waitForSelector('[data-testid=hud-back]', { timeout: 30000 }).catch(() => {});
  check(await page.locator('[data-testid=hud-back]').count() > 0, 'app: deeper screens get a back button');
  check(await page.locator('[data-testid=game-tabbar].away').count() > 0, 'app: deeper screens are full screen (the tab bar steps aside)');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 6, y: 420 }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 6 + i * 22, y: 422 }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(2000);
  check(await page.locator('[data-testid=hud-back]').count() === 0, 'app: swiping in from the left edge goes back');
  await go(page, '/me');
  await page.waitForSelector('[data-testid=me-tiles]', { timeout: 30000 }).catch(() => {});
  const touch = (type, y) => page.evaluate(([type, y]) => {
    const el = document.elementFromPoint(200, 300);
    const t = new Touch({ identifier: 1, target: el, clientX: 200, clientY: y });
    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
  }, [type, y]);
  await touch('touchstart', 300);
  for (let i = 1; i <= 10; i++) { await touch('touchmove', 300 + i * 20); await page.waitForTimeout(16); }
  await touch('touchend', 500);
  await page.waitForTimeout(150);
  check(await page.locator('main [role=status]').count() > 0, 'app: pulling down refreshes the screen');
  await page.waitForTimeout(1500);
  await go(page, '/settings');
  await page.waitForSelector('#reminders', { timeout: 30000 }).catch(() => {});
  check(await page.locator('#reminders').count() > 0 && await page.locator('#sfx').count() > 0, 'app: Settings has sound effects and streak reminders');
  await shot(page, 'app-settings');
  // (the simulated shell has no native plugins, so their calls fail — but a plugin must never be awaited as a promise)
  check(!errors.some((e) => /\.then\(\)/.test(e) || !/not implemented/i.test(e)), `app: no page errors${errors.length ? ` (${errors.join(' | ').slice(0, 300)})` : ''}`);
  await browser.close();
}

server.close();
console.log(fails.length ? `\n${fails.length} problem(s)` : '\nStore-ready checks passed');
process.exit(fails.length ? 1 : 0);
