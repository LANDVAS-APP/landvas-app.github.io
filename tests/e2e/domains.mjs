// Real-browser test of the 3x3 merge tier (local-mode build):
// nine plots → merge into a 3x3 → the plot panel offers the Domain → keep it, then upgrade → the Domain's world opens →
// every one of the 11 Domains: switch to it, walk its world, play its signature minigame and bank the score →
// switch down to the Estate and back → break the square and watch it step down a tier at a time.
// Run: npm run build:artifact && node tests/e2e/domains.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-domains');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4195, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const DOMAINS = [['canvas', 'museum'], ['habitat', 'sanctuary'], ['farm', 'kingdom'], ['business', 'megacorp'], ['arcade', 'galaxypark'], ['mine', 'core'], ['sky', 'observatory'], ['workshop', 'automaton'], ['diner', 'banquet'], ['dungeon', 'abyss'], ['brawl', 'titans']];

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
  await page.fill('#email', 'dora@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'dora_domains'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);

  // test only (the local database, as its owner): Ink for the plots, the merge and the switches
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 500000) on conflict (player_id, resource) do update set amount = 500000`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  // nine plots in a 3x3 square
  const fails = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const r = await api(dx || dy ? 'acquirePlot' : 'claimStarter', START.gx + dx, START.gy + dy).then(() => null, (e) => String(e?.message ?? e));
    if (r) fails.push(`${dx},${dy}: ${r}`);
  }
  let groups = await api('myGroups');
  check('nine plots claimed', groups.reduce((n, g) => n + g.plot_count, 0) === 9, `${groups.length} groups ${fails.join(' | ')}`);
  // new plots start as Base plots (no tiers): these are art canvases, whose Estate is the Atelier
  for (const g of groups) await api('setGroupKind', g.id, 'canvas');
  groups = await api('myGroups');
  await page.evaluate(() => window.__landvasQc.invalidateQueries());

  // merge four first: the panel offers the Estate and shows the way to the Domain
  const four = groups.filter((g) => { const c = g.cells[0]; return c[0] - START.gx < 2 && c[1] - START.gy < 2; }).map((g) => g.id);
  const m4 = await api('fuseGroups', four);
  check('four of them merge into a 2x2', m4.plot_count === 4);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);
  await clickPlot(START.gx, START.gy);
  await page.waitForSelector('[data-testid=estate-card][data-state=offer][data-tier=estate]', { timeout: 10000 }).catch(() => {});
  check('a 2x2 offers its Estate', (await page.locator('[data-testid=estate-card][data-state=offer][data-tier=estate]').count()) === 1);
  // upgrade to the Estate: then the card points on to the Domain
  await page.click('[data-testid=estate-upgrade]');
  await page.waitForSelector('[data-testid=realm][data-kind=atelier]', { timeout: 20000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1500);
  await clickPlot(START.gx, START.gy);
  await page.waitForSelector('[data-testid=estate-card][data-state=progress][data-tier=domain]', { timeout: 10000 }).catch(() => {});
  check('an Estate shows its progress toward the Domain (4/9)', (await page.locator('[data-testid=estate-card][data-state=progress][data-tier=domain]').innerText().catch(() => '')).includes('4/9'));
  await page.locator('[data-testid=tier-cards]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(400);
  await shot('01-estate-progress');

  // merge the other five in
  groups = await api('myGroups');
  const merged = await api('fuseGroups', groups.map((g) => g.id));
  check('all nine merge into one 3x3, still the Estate', merged.plot_count === 9 && merged.kind === 'atelier', `${merged.plot_count} ${merged.kind}`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);
  await clickPlot(START.gx + 1, START.gy + 1);
  await page.waitForSelector('[data-testid=estate-card][data-state=offer][data-tier=domain]', { timeout: 10000 }).catch(() => {});
  check('the 3x3 offers its Domain', (await page.locator('[data-testid=estate-card][data-state=offer][data-tier=domain]').count()) === 1);
  await page.locator('[data-testid=estate-card][data-state=offer]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(500);
  await shot('02-domain-offer');
  await page.click('[data-testid=estate-keep]'); await page.waitForTimeout(400);
  check('keeping the Estate folds the offer away', (await page.locator('[data-testid=estate-card][data-state=kept][data-tier=domain]').count()) === 1);
  check('…and the land is still the Estate', (await api('myGroups'))[0].kind === 'atelier');
  await page.click('[data-testid=estate-card][data-state=kept] button'); await page.waitForTimeout(300);
  await page.click('[data-testid=estate-upgrade]');
  await page.waitForSelector('[data-testid=realm][data-kind=museum]', { timeout: 20000 }); await page.waitForTimeout(2500);
  check('upgrading opens the Starlight Museum', true);
  const w = (await sql(`select wallet from realm_players where player_id = '${me}' and kind = 'museum'`))[0]?.wallet;
  check('the first Domain comes with its charter', Number(w?.renown) === 600, JSON.stringify(w));

  // the map draws the Domain
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1200);
  await gotoPlot(START.gx + 1, START.gy + 1); await page.evaluate(() => window.__landvasMap.zoomTo(19.2)); await page.waitForTimeout(1500);
  await shot('03-map');
  await clickPlot(START.gx + 1, START.gy + 1);
  check('a Domain shows its tier and can step down to the Estate', (await page.locator('[data-testid=estate-card][data-state=estate][data-tier=domain]').count()) === 1 && (await page.locator('[data-testid=estate-keep-estate]').count()) === 1);
  await page.locator('[data-testid=tier-cards]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300);
  await shot('04-domain-card');
  await page.click('[data-testid=estate-keep-estate]'); await page.waitForTimeout(1200);
  check('stepping down makes it the Estate again', (await api('myGroups'))[0].kind === 'atelier');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  const gid = (await api('myGroups'))[0].id;
  for (const [base, dom] of DOMAINS) {
    if (dom === 'galaxypark') continue; // the Arcade's Domain is the arcade itself, grown a carnival (see carnival.mjs)
    const g0 = (await api('myGroups'))[0];
    if (g0.kind !== base && dom !== 'museum') await api('setGroupKind', gid, base);
    const r = await api('setGroupKind', gid, dom);
    await page.evaluate((id) => window.__landvasNav(`/realm/${id}`), r.realm_id);
    await page.waitForSelector(`[data-testid=realm][data-kind=${dom}]`, { timeout: 20000 }); await page.waitForTimeout(2500);
    const errs0 = errors.length;
    await page.click('[data-testid=realm-go-market]'); await page.waitForTimeout(1200); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await shot(`10-${dom}-world`);
    await page.click('[data-testid=realm-go-play]'); await page.waitForSelector('[data-testid=realm-play]', { timeout: 10000 });
    await page.click('[data-testid=realm-play]'); await page.waitForSelector('[data-testid=realm-game-canvas]', { timeout: 10000 });
    await shot(`12-${dom}-intro`);
    await page.waitForTimeout(3400);
    await playFor(13).catch(() => {});
    await shot(`11-${dom}-game`);
    const live = await page.locator('[data-testid=realm-score]').innerText().catch(() => '?');
    if (await page.locator('[data-testid=realm-game] button[aria-label=Stop]').count()) await page.click('[data-testid=realm-game] button[aria-label=Stop]').catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('[data-testid=realm-result]') || !document.querySelector('[data-testid=realm-game]'), null, { timeout: 60000 });
    await page.waitForSelector('[data-testid=realm-result]', { timeout: 30000 }).catch(() => {});
    const runs = await sql(`select score from realm_runs where player_id = '${me}' and kind = '${dom}' and finished_at is not null`);
    check(`${dom}: the world opens, the game plays and the score is banked`, runs.length === 1 && errors.length === errs0, `live ${live} → banked ${runs[0]?.score}${errors.length > errs0 ? ' · ' + errors.slice(errs0).join(' | ') : ''}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }

  // breaking the 3x3 steps it down to the Estate, breaking the 2x2 to the base type
  await api('detachPlots', gid, [[START.gx + 2, START.gy + 2]]);
  let after = (await api('myGroups')).find((g) => g.id === gid);
  check('detaching a corner of the 3x3 turns the Domain into its Estate', after.kind === 'colosseum', after.kind);
  await api('detachPlots', gid, [[START.gx + 1, START.gy + 1]]);
  after = (await api('myGroups')).find((g) => g.id === gid);
  check('…and breaking the last 2x2 turns it back into the base type', after.kind === 'brawl', after.kind);
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
