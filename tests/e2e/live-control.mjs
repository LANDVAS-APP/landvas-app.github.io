// Live control (game_config 'app'), in a real browser on the local build: a page switched off loses every link to it
// and its address goes back to the map; planned maintenance shows the "back soon" screen.
// Run: npm run build:artifact && node tests/e2e/live-control.mjs
import { serve, launch } from './browser.mjs';

const PORT = 4187;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'dark' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const setApp = (patch) => page.evaluate(async (patch) => {
  const b = window.__landvasBackend;
  await b.db.query(`update game_config set value = value || $1::jsonb where key = 'app'`, [JSON.stringify(patch)]);
  await window.__landvasQc.invalidateQueries({ queryKey: ['app-config'] });
}, patch);
const spaceLinks = () => page.evaluate(() => [...document.querySelectorAll('a[href="/space"], a[href^="/space/"]')].filter((a) => a.getClientRects().length > 0).length);

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 90000 });
  // the help page reads its links live (signed out it shows the public page)
  await page.evaluate(() => window.__landvasNav('/support'));
  const mail = await page.waitForSelector('[data-testid=support-email]', { timeout: 20000 }).then((e) => e.textContent()).catch(() => null);
  check('the help page shows the live support email', mail === 'contact@landvas.app', String(mail));
  await page.evaluate(() => window.__landvasNav('/welcome'));
  await page.waitForSelector('#email', { timeout: 20000 });
  await page.fill('#email', 'live@example.test');
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 });
  await page.fill('#username', 'live_control');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const before = await spaceLinks();
  check('links to Space show while it is on', before > 0, `${before} visible`);

  await setApp({ hidden_pages: ['/space'] });
  await page.waitForTimeout(1200);
  check('switching Space off hides every link to it', (await spaceLinks()) === 0);
  await page.evaluate(() => window.__landvasNav('/space'));
  // give the switch a moment to send it back, then wait for the map to be up again
  await page.waitForTimeout(1000);
  await page.waitForSelector('[data-testid=world-map]', { timeout: 15000 }).catch(() => {});
  // (the local build keeps its address in memory, so check what's on screen)
  check('its address goes back to the map', await page.locator('[data-testid=world-map]').isVisible());

  await setApp({ hidden_pages: [] });
  await page.waitForTimeout(1200);
  check('switching it back on shows the links again', (await spaceLinks()) > 0);

  await setApp({ maintenance: { on: true, title: 'Back soon', message: 'Testing maintenance', until: null } });
  await page.waitForTimeout(1200);
  const shown = await page.locator('[data-testid=maintenance-planned]').isVisible().catch(() => false);
  check('planned maintenance shows the back-soon screen', shown);
  await page.screenshot({ path: '/tmp/live-maintenance.png' });
  await setApp({ maintenance: { on: false } });
  await page.waitForTimeout(1200);
  check('and it goes away when turned off', !(await page.locator('[data-testid=maintenance-planned]').isVisible().catch(() => false)));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  failed++;
  console.log('FAIL  ', e.message.split('\n')[0]);
  await page.screenshot({ path: '/tmp/live-control-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
