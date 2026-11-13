// Real-browser test of the merge tier (local-mode build):
// four plots → merge into a 2x2 → the plot panel offers the Estate → keep it, then upgrade → the Estate's world opens →
// then every Estate (the Arcade's, its carnival, has its own test: carnival.mjs): switch to it, walk its world, play its signature minigame and bank the score.
// Run: npm run build:artifact && node tests/e2e/estates.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-estates');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4193, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const ESTATES = [['canvas', 'atelier'], ['habitat', 'reserve'], ['farm', 'ranch'], ['business', 'exchange'], ['mine', 'gemheart'], ['sky', 'skyport'], ['workshop', 'foundry'], ['diner', 'foodhall'], ['dungeon', 'citadel'], ['brawl', 'colosseum']];

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

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'esme@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'esme_estates'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);

  // four free plots in a square
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    for (let tries = 0; tries < 3; tries++) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await clickPlot(START.gx + dx, START.gy + dy).catch(() => {});
      if (await page.locator('[data-testid=claim-plot]').count()) break;
    }
    await page.click('[data-testid=claim-plot]');
    await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 }); await page.waitForTimeout(2200);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  let groups = await api('myGroups');
  check('four plots claimed', groups.reduce((n, g) => n + g.plot_count, 0) === 4, `${groups.length} groups`);
  // new plots start as Base plots (no tiers): make them art canvases, whose Estate is the Atelier
  for (const g of groups) if ((g.kind ?? 'canvas') !== 'canvas') await api('setGroupKind', g.id, 'canvas');
  groups = await api('myGroups');
  // Ink for the merge and the switches (test only: the local database, as its owner)
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 50000) on conflict (player_id, resource) do update set amount = 50000`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());

  // before the merge, the panel shows how close the land is to a square
  await clickPlot(START.gx, START.gy);
  const before = await page.locator('[data-testid=estate-card]').getAttribute('data-state').catch(() => null);
  check('a single plot shows its progress toward an Estate', before === 'progress', String(before));
  await shot('01-progress');

  const merged = await api('fuseGroups', groups.map((g) => g.id));
  check('the four plots merge into one 2x2', merged.plot_count === 4);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);
  await clickPlot(START.gx, START.gy);
  await page.waitForSelector('[data-testid=estate-card][data-state=offer]', { timeout: 10000 });
  check('the merged square offers its Estate', true);
  await page.locator('[data-testid=estate-card]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  await shot('02-offer');
  // keep it as it is first: the card folds away and nothing changes
  await page.click('[data-testid=estate-keep]'); await page.waitForTimeout(400);
  check('keeping the type folds the offer away', (await page.locator('[data-testid=estate-card][data-state=kept]').count()) === 1);
  check('…and the land is still an art canvas', (await api('myGroups'))[0].kind === 'canvas');
  await page.click('[data-testid=estate-card][data-state=kept] button'); await page.waitForTimeout(300);
  await page.click('[data-testid=estate-upgrade]');
  await page.waitForSelector('[data-testid=realm][data-kind=atelier]', { timeout: 20000 }); await page.waitForTimeout(2500);
  check('upgrading opens the Grand Atelier', true);
  const w = (await sql(`select wallet from realm_players where player_id = '${me}' and kind = 'atelier'`))[0]?.wallet;
  check('the first Estate comes with its charter', Number(w?.acclaim) === 250, JSON.stringify(w));

  const gid = (await api('myGroups'))[0].id;
  for (const [base, estate] of ESTATES) {
    if (estate !== 'atelier') {
      const g0 = (await api('myGroups'))[0];
      if (g0.kind !== base) await api('setGroupKind', gid, base);
      const r = await api('setGroupKind', gid, estate);
      await page.evaluate((id) => window.__landvasNav(`/realm/${id}`), r.realm_id);
      await page.waitForSelector(`[data-testid=realm][data-kind=${estate}]`, { timeout: 20000 }); await page.waitForTimeout(2500);
    }
    const errs0 = errors.length;
    // walk round a little, then shoot the world
    await page.click('[data-testid=realm-go-market]'); await page.waitForTimeout(1200); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await shot(`10-${estate}-world`);
    // play the signature game for real, then bank the score
    await page.click('[data-testid=realm-go-play]'); await page.waitForSelector('[data-testid=realm-play]', { timeout: 10000 });
    await page.click('[data-testid=realm-play]'); await page.waitForSelector('[data-testid=realm-game-canvas]', { timeout: 10000 });
    await page.waitForTimeout(3400); // past the how-to card
    await shot(`12-${estate}-start`);
    await playFor(13).catch(() => {}); // the game may end (and close) before the time is up
    await shot(`11-${estate}-game`);
    const live = await page.locator('[data-testid=realm-score]').innerText().catch(() => '?');
    // some games end themselves (out of lives); otherwise stop and bank what we have
    if (await page.locator('[data-testid=realm-game] button[aria-label=Stop]').count()) await page.click('[data-testid=realm-game] button[aria-label=Stop]').catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('[data-testid=realm-result]') || !document.querySelector('[data-testid=realm-game]'), null, { timeout: 60000 });
    await page.waitForSelector('[data-testid=realm-result]', { timeout: 30000 }).catch(() => {});
    const runs = await sql(`select score from realm_runs where player_id = '${me}' and kind = '${estate}' and finished_at is not null`);
    check(`${estate}: the world opens, the game plays and the score is banked`, runs.length === 1 && errors.length === errs0, `live ${live} → banked ${runs[0]?.score}${errors.length > errs0 ? ' · ' + errors.slice(errs0).join(' | ') : ''}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }

  // breaking the square sends it back to its base type
  await api('detachPlots', gid, [[START.gx + 1, START.gy + 1]]);
  const after = (await api('myGroups')).find((g) => g.id === gid);
  check('detaching a corner turns the Estate back into its base type', after.kind === 'brawl', after.kind);
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
