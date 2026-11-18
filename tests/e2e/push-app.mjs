// Push notifications in a simulated iPhone app (a fake PushNotifications plugin; the database is the real migrations,
// in the browser). Turning notifications on registers this phone's address with the default switches; changing a
// switch tells the server; "Send a test push" queues one; a friend request queues a push; a push that arrives while the
// game is open pops up in it, and tapping one opens where it belongs; signing out takes the address back. An app
// without the plugin (built before push) just says pushes come with the next update.
// Run: npm run build:artifact && node tests/e2e/push-app.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-push-app'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4373;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
let browser = null;
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const TOKEN = 'f00d'.repeat(16);

/** a phone; withPush: the app has the push plugin (false: an app built before it) */
async function phone(withPush) {
  // a browser of its own for each phone (two big game tabs in one browser are too much for small test machines)
  if (browser) await browser.close().catch(() => {});
  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', userAgent: UA });
  await ctx.addInitScript(([withPush, token]) => {
    // a fake native bridge: the plugins the app binary has (PluginHeaders) answer through nativePromise / nativeCallback
    window.__push = { calls: [], listeners: {} };
    const local = {
      checkPermissions: async () => { window.__push.calls.push(['ln.check']); return { display: window.__allowed ? 'granted' : 'prompt' }; },
      requestPermissions: async () => { window.__push.calls.push(['ln.request']); window.__allowed = true; return { display: 'granted' }; },
      getPending: async () => ({ notifications: [] }), cancel: async () => ({}), schedule: async () => ({ notifications: [] }), removeAllListeners: async () => ({}), removeListener: async () => ({}),
    };
    const push = {
      checkPermissions: async () => ({ receive: window.__allowed ? 'granted' : 'prompt' }),
      requestPermissions: async () => { window.__allowed = true; return { receive: 'granted' }; },
      createChannel: async (c) => { window.__push.calls.push(['createChannel', c.id]); return {}; },
      register: async () => { window.__push.calls.push(['register']); setTimeout(() => window.__push.emit('registration', { value: token }), 30); return {}; },
      removeAllListeners: async () => ({}), removeListener: async () => ({}),
    };
    const plugins = { LocalNotifications: local, ...(withPush ? { PushNotifications: push } : {}) };
    const header = (name) => ({ name, methods: [...Object.keys(plugins[name]).map((m) => ({ name: m, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }] });
    let cb = 0;
    window.__push.emit = (ev, data) => (window.__push.listeners[ev] ?? []).forEach((f) => f(data));
    window.CapacitorCustomPlatform = { name: 'ios', plugins: {} };
    window.Capacitor = {
      PluginHeaders: Object.keys(plugins).map(header),
      nativePromise: (plugin, method, options) => plugins[plugin][method](options),
      nativeCallback: (plugin, method, options, callback) => {
        if (method === 'addListener' && plugin === 'PushNotifications') (window.__push.listeners[options.eventName] ??= []).push(callback);
        return String(++cb);
      },
    };
  }, [withPush, TOKEN]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const helpers = (page) => ({
  sql: (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q),
  nav: async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); },
  path: () => page.evaluate(() => window.__landvasPath()), // the test build routes by hash
  shot: (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n)),
});
async function signUp(page, name) {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `${name}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', name); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
}

try {
  // ---- an app built before push ----
  const old = await phone(false);
  await signUp(old.page, 'push_old');
  const h = helpers(old.page);
  await h.nav('/settings');
  await old.page.locator('#notify').scrollIntoViewIfNeeded();
  await old.page.click('#notify');
  check('an app without the plugin says pushes come with the next update', await old.page.waitForSelector('[data-testid=push-later]', { timeout: 10000 }).then(() => true, () => false));
  check('…and registers nothing', (await h.sql(`select count(*)::int n from private.push_devices`))[0].n === 0);
  check('no errors (app without push)', old.errors.length === 0, old.errors.slice(0, 3).join(' | '));

  // ---- an app with push ----
  const { page, errors } = await phone(true);
  const { sql, nav, path: where, shot } = helpers(page);
  await signUp(page, 'push_app');
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await nav('/settings');
  check('nothing is registered before the player turns notifications on', (await sql(`select count(*)::int n from private.push_devices`))[0].n === 0);
  await page.locator('#notify').scrollIntoViewIfNeeded();
  await page.click('#notify');
  await page.waitForTimeout(1500);
  await page.waitForSelector('[data-testid=push-settings]', { timeout: 15000 });
  await page.waitForFunction(() => window.__push.calls.some((c) => c[0] === 'register'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const dev = (await sql(`select * from private.push_devices`))[0];
  check('turning notifications on registers this phone with the default switches', dev?.token === TOKEN && dev?.player_id === me && dev?.platform === 'ios'
    && JSON.stringify([...(dev?.kinds ?? [])].sort()) === JSON.stringify(['fox', 'friends', 'land', 'leviathan']), JSON.stringify(dev?.kinds));
  check('the app version goes with it', /\(/.test(dev?.app ?? '') || dev?.app === null, String(dev?.app));
  const status = await page.locator('[data-testid=push-settings]').textContent();
  check('Settings says this phone gets pushes, one switch per kind', /This phone gets these/.test(status) && (await page.locator('[data-testid=push-settings] button[role=switch]').count()) === 5);
  await page.locator('[data-testid=push-settings]').scrollIntoViewIfNeeded();
  await shot('settings-push');

  await page.click('#push-visits');
  await page.waitForTimeout(1800);
  check('a switch tells the server', JSON.stringify((await sql(`select kinds from private.push_devices`))[0].kinds) === JSON.stringify(['fox', 'friends', 'land', 'leviathan', 'visits']));

  await page.click('[data-testid=push-test]');
  await page.waitForTimeout(1200);
  check('"Send a test push" queues one for this player', (await sql(`select count(*)::int n from private.push_outbox where player_id = '${me}' and kind = 'test'`))[0].n === 1);

  await sql(`select private.notify('${me}', 'friend_request', null, '{}'::jsonb)`);
  check('a friend request queues a push', (await sql(`select count(*)::int n from private.push_outbox where player_id = '${me}' and kind = 'friends'`))[0].n === 1);

  // a push while LANDVAS is open: a pop-up in the game
  await page.evaluate(() => window.__push.emit('pushNotificationReceived', { title: '🎉 Party invite', body: '@pal invited you to their party', data: { to: '/party' } }));
  check('a push that arrives while the game is open pops up in it', await page.getByText('@pal invited you to their party').first().waitFor({ timeout: 5000 }).then(() => true, () => false));
  await shot('push-popup');
  // tapped on the lock screen
  await nav('/world');
  await page.evaluate(() => window.__push.emit('pushNotificationActionPerformed', { actionId: 'tap', notification: { id: '1', data: { to: '/settings' } } }));
  await page.waitForFunction(() => window.__landvasPath() === '/settings', null, { timeout: 8000 }).catch(() => {});
  check('tapping a push opens where it belongs', (await where()) === '/settings', await where());
  await page.evaluate(() => window.__push.emit('pushNotificationActionPerformed', { actionId: 'tap', notification: { id: '2', data: { to: 'https://evil.example/' } } }));
  await page.waitForTimeout(800);
  check('…and never leaves the game', (await page.evaluate(() => location.host)) === `localhost:${PORT}`);

  // turning notifications off takes the address back
  await nav('/settings');
  await page.locator('#notify').scrollIntoViewIfNeeded();
  await page.click('#notify');
  await page.waitForTimeout(1500);
  check('turning notifications off takes the address back', (await sql(`select count(*)::int n from private.push_devices`))[0].n === 0);
  await page.click('#notify');
  await page.waitForTimeout(1800);
  check('…and on again brings it back', (await sql(`select count(*)::int n from private.push_devices`))[0].n === 1);
  await nav('/settings');
  await page.click('[data-testid=sign-out]');
  await page.waitForTimeout(2500);
  check('signing out takes it back too', (await sql(`select count(*)::int n from private.push_devices`))[0].n === 0);
  check('no errors (app with push)', errors.length === 0, errors.slice(0, 3).join(' | '));

} catch (e) {
  console.error(e);
  results.push(false);
} finally {
  await browser?.close();
  server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
