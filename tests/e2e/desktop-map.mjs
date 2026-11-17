// The website's map on a desktop, tidied like the phone: one centred row of round buttons under the HUD (Hot Zone,
// Luck, Grimoire, Streak, Daily spin, View), each opening its card centred right under the row; no loose chips or
// stacked buttons down the left; Fly in the + tray. And the player's switch to the Classic buttons (from the View
// panel or Settings): the original chips in one toolbar and the big buttons in one even dock, on desktop and phone.
// Run: npm run build:artifact && node tests/e2e/desktop-map.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-desktop-map'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4321);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', geolocation: { latitude: 39.7392, longitude: -104.9903, accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|wikipedia/i.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const api = (f, ...a) => page.evaluate(([f, a]) => { const parts = f.split('.'); let o = window.__landvasApi; for (const p of parts.slice(0, -1)) o = o[p]; return o[parts.at(-1)](...a); }, [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const refresh = () => page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await page.waitForTimeout(250); } return false; };
try {
  await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: false })); } catch {} });
  await page.goto('http://localhost:4321/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'desk@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'desk_dan'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasNav('/world'));
  await page.waitForSelector('[data-testid=map-row]', { timeout: 30000 }); await page.waitForTimeout(1500);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`select private.ledger_apply('${me}', 'ink', 200000, 'admin_adjust', 'test', 'test', 'e2e:gifts:ink')`);
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  await refresh(); await page.waitForTimeout(800);

  // drop into the world (GPS), so the explorer's buttons (Fly and friends) are there too
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3 && (await page.locator('[data-state=open][aria-hidden=true]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await shot('01-desktop-map');
  const row = await page.locator('[data-testid=map-row]').boundingBox();
  const area = await page.evaluate(() => { const p = document.querySelector('[data-testid=map-row]').parentElement.getBoundingClientRect(); return { x: p.x, w: p.width }; });
  check('one row of round buttons, centred over the map', !!row && Math.abs(row.x + row.width / 2 - (area.x + area.w / 2)) < 4, JSON.stringify(row));
  const discs = await page.$$eval('[data-testid=map-row] > *', (els) => els.map((e) => e.querySelector('[data-testid]')?.getAttribute('data-testid') ?? e.getAttribute('data-testid')));
  check('…with the Hot Zone, Luck, Grimoire, Streak, Daily spin and View in it', ['hot-zone-chip', 'luck-chip', 'grimoire-button', 'mode-button'].every((t) => discs.includes(t)), discs.join(','));
  check('no loose chips or stacked big buttons on the left any more', (await page.locator('[data-testid=fly-chip]:visible').count()) === 0 && (await page.locator('.lv-gbtn.round[data-testid=mode-button]').count()) === 0);
  for (const [disc, card, name] of [['hot-zone-chip', 'hot-zone-sheet', 'hot'], ['luck-chip', 'luck-card', 'luck'], ['grimoire-button', 'grimoire-card', 'grimoire'], ['mode-button', 'mode-panel', 'view']]) {
    await page.click(`[data-testid=map-row] [data-testid=${disc}]`); await page.waitForTimeout(700);
    const c = await page.locator(`[data-testid=${card}]`).first().boundingBox().catch(() => null);
    const r = await page.locator('[data-testid=map-row]').boundingBox();
    check(`${name}: its card opens right under the row, centred, not too wide`, !!c && c.y >= r.y + r.height - 2 && c.width <= 440 && Math.abs(c.x + c.width / 2 - (area.x + area.w / 2)) < (name === 'view' ? 260 : 6), JSON.stringify(c));
    await shot(`02-${name}`);
    await page.click(`[data-testid=map-row] [data-testid=${disc}]`); await page.waitForTimeout(500);
  }
  await page.click('[data-testid=hud-more]'); await page.waitForTimeout(600);
  check('Fly is in the + tray', (await page.locator('[data-testid=hud-tray] [data-testid=fly-chip]').count()) === 1);
  await shot('03-tray');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ---- Classic, from the View panel ---------------------------------------------------------------------------------
  await page.click('[data-testid=map-row] [data-testid=mode-button]'); await page.waitForSelector('[data-testid=map-buttons-picker]');
  await page.click('[data-testid=map-buttons-classic]'); await page.waitForTimeout(900);
  check('the View panel switches to the Classic buttons', (await page.locator('[data-testid=classic-bar]').count()) === 1 && (await page.locator('[data-testid=classic-dock]').count()) === 1 && (await page.locator('[data-testid=map-row]').count()) === 0);
  check('…and it sticks', await page.evaluate(() => JSON.parse(localStorage.getItem('landvas.settings') || '{}').mapHud) === 'classic');
  await page.keyboard.press('Escape'); await page.mouse.click(700, 600); await page.waitForTimeout(500);
  const bar = await page.$$eval('[data-testid=classic-bar] > *', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.getAttribute('data-testid'), y: Math.round(r.y + r.height / 2), h: Math.round(r.height) }; }));
  check('Classic: the chips sit in one toolbar, lined up', bar.length >= 3 && new Set(bar.map((b) => b.y)).size === 1, JSON.stringify(bar));
  check('…with Fly on it (and not twice in the + tray)', (await page.locator('[data-testid=classic-bar] [data-testid=fly-chip]').count()) === 1);
  const dock = await page.$$eval('[data-testid=classic-dock] > *', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y), h: Math.round(r.height) }; }));
  const gaps = dock.slice(1).map((d, i) => d.y - (dock[i].y + dock[i].h));
  check('Classic: the big buttons sit in one dock, centred and evenly spaced', dock.length >= 3 && new Set(dock.map((d) => d.x)).size === 1 && Math.max(...gaps) - Math.min(...gaps) <= 1, JSON.stringify({ dock, gaps }));
  await shot('04-classic-desktop');
  await page.click('[data-testid=hud-more]'); await page.waitForTimeout(500);
  check('…and the + tray has no second Fly', (await page.locator('[data-testid=hud-tray] [data-testid=fly-chip]').count()) === 0);
  await page.click('[data-testid=hud-more]'); await page.waitForTimeout(400);
  // the classic View panel still opens beside its button
  await page.click('[data-testid=classic-dock] [data-testid=mode-button]'); await page.waitForTimeout(600);
  check('Classic: View opens its panel', (await page.locator('[data-testid=mode-panel]').count()) === 1);
  await shot('05-classic-view');
  await page.click('[data-testid=classic-dock] [data-testid=mode-button]'); await page.waitForTimeout(400);

  // ---- Classic on a phone-size screen -------------------------------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(900);
  check('Classic on a phone: nothing runs off the side', await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1) && (await page.locator('[data-testid=classic-dock]').isVisible()));
  check('…and the whole toolbar fits on screen', await page.evaluate(() => { const b = document.querySelector('[data-testid=classic-bar]'); return b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= innerWidth; }));
  await shot('06-classic-phone');

  // ---- back to Tidy, from Settings ----------------------------------------------------------------------------------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.__landvasNav('/settings')); await page.waitForSelector('[data-testid=settings-map-buttons]', { timeout: 15000 });
  await page.click('[data-testid=settings-map-buttons-tidy]'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForSelector('[data-testid=map-row]', { timeout: 20000 });
  check('Settings switches back to the Tidy row', (await page.locator('[data-testid=classic-dock]').count()) === 0);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  crashed:', e.message); results.push(false); await shot('99-crash');
} finally {
  await browser.close(); server.close?.();
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
}
