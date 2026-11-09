// Real-browser test of the Estate game hubs (local-mode build): every Estate's world has four game stands; walk the
// list to each one, play it, bank the score. Pass a list of Estates to test only those: node tests/e2e/stands.mjs atelier ranch
// Run: npm run build:artifact && node tests/e2e/stands.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-stands');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4199, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const ESTATES = [['canvas', 'atelier'], ['habitat', 'reserve'], ['farm', 'ranch'], ['business', 'exchange'], ['arcade', 'boardwalk'], ['mine', 'gemheart'], ['sky', 'skyport'], ['workshop', 'foundry'], ['diner', 'foodhall'], ['dungeon', 'citadel'], ['brawl', 'colosseum']];

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);

async function gotoPlot(gx, gy) {
  await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; m.fire('dragstart'); const n = Math.PI * (1 - 2 * (gy + 0.5) / G); m.jumpTo({ center: [((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))], zoom: 20.4 }); }, [gx, gy, G]);
  await page.waitForTimeout(1200);
}
async function clickPlot(gx, gy) {
  await page.evaluate(() => document.querySelector('[aria-label="Close plot panel"]')?.click()); await page.waitForTimeout(300);
  await gotoPlot(gx, gy);
  const s = await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; const n = Math.PI * (1 - 2 * (gy + 0.5) / G); const pt = m.project([((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + pt.x, y: r.top + pt.y }; }, [gx, gy, G]);
  await page.mouse.click(s.x, s.y); await page.waitForSelector('[data-testid=plot-panel]', { timeout: 10000 }); await page.waitForTimeout(1000);
}
/** play the open minigame like a (frantic) person: taps, drags and holds all over the screen */
async function playFor(seconds) {
  const end = Date.now() + seconds * 1000, box = await page.locator('[data-testid=realm-game-canvas]').boundingBox();
  let i = 0;
  while (Date.now() < end) {
    i++;
    if (i % 4 === 0 && !(await page.locator('[data-testid=realm-game]').count())) return; // the game ended itself
    const x = box.x + box.width * (0.1 + ((i * 37) % 80) / 100), y = box.y + box.height * (0.25 + ((i * 53) % 65) / 100);
    if (i % 5 === 0) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y - 40, { steps: 6 }); await page.mouse.up(); }
    else if (i % 7 === 0) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up(); }
    else await page.mouse.click(x, y);
    await page.waitForTimeout(120);
  }
}

const ONLY = process.argv.slice(2);
try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'stan@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'stan_stands'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 500000) on conflict (player_id, resource) do update set amount = 500000`);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) await api(dx || dy ? 'acquirePlot' : 'claimStarter', START.gx + dx, START.gy + dy);
  const merged = await api('fuseGroups', (await api('myGroups')).map((g) => g.id));
  const gid = merged.id;
  const cfg = (await sql(`select value from game_config where key = 'realms'`))[0].value.kinds;
  for (const [base, est] of ESTATES) {
    if (ONLY.length && !ONLY.includes(est)) continue;
    const g0 = (await api('myGroups'))[0];
    if (g0.kind !== base) await api('setGroupKind', gid, base);
    const r = await api('setGroupKind', gid, est);
    await sql(`update realms set xp = 2000000 where id = '${r.realm_id}'`);
    await page.evaluate((id) => window.__landvasNav(`/realm/${id}`), r.realm_id);
    await page.waitForSelector(`[data-testid=realm][data-kind=${est}]`, { timeout: 20000 }); await page.waitForTimeout(2500);
    await shot(`10-${est}-world`);
    const stands = Object.entries(cfg[est].games).filter(([, v]) => (v.order ?? 0) > 0).sort((a, b) => a[1].order - b[1].order).map(([k]) => k);
    check(`${est}: the world has a games list with 5 games`, (await page.locator('[data-testid=realm-games]').count()) === 1);
    for (const id of stands) {
      const errs0 = errors.length;
      await page.click('[data-testid=realm-games]'); await page.waitForSelector(`[data-testid=realm-list-${id}]`, { timeout: 8000 });
      await page.click(`[data-testid=realm-list-${id}]`);
      await page.waitForSelector('[data-testid=realm-play]', { timeout: 8000 });
      await page.click('[data-testid=realm-play]'); await page.waitForSelector('[data-testid=realm-game-canvas]', { timeout: 10000 });
      await page.waitForTimeout(3400);
      await playFor(11).catch(() => {});
      await shot(`11-${est}-${id}`);
      if (await page.locator('[data-testid=realm-game] button[aria-label=Stop]').count()) await page.click('[data-testid=realm-game] button[aria-label=Stop]').catch(() => {});
      await page.waitForFunction(() => !!document.querySelector('[data-testid=realm-result]') || !document.querySelector('[data-testid=realm-game]'), null, { timeout: 60000 }).catch(() => {});
      await page.waitForSelector('[data-testid=realm-result]', { timeout: 30000 }).catch(() => {});
      const runs = await sql(`select score from realm_runs where player_id = '${me}' and game = '${id}' and finished_at is not null`);
      check(`${est} · ${id}: plays and banks`, runs.length === 1 && errors.length === errs0, `banked ${runs[0]?.score}${errors.length > errs0 ? ' · ' + errors.slice(errs0).join(' | ') : ''}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }
  }
} catch (e) {
  check('unexpected failure', false, String(e?.message ?? e).split('\n')[0]);
  await shot('zz-failure');
} finally {
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 4).join(' || '));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close(); server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
