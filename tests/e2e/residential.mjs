// Real-browser test of Residential plots (local-mode build):
//  - a visitor can't walk into a house until its owner has a Residential · Home plot (and the profile says so)
//  - the owner picks Residential · Home in the plot-type picker; four Home plots merged into a 2x2 make a bigger house
//  - in the house: a staircase to the upstairs floor (and, in a big house, balconies, a lift and a roof terrace with a pool)
//  - a Landlord plot shows its rent day (50x on the 1st) in the plot panel and the wallet
//  - a visitor checks in by drawing in the check-in book; the drawing shows in the book
// Run: npm run build:artifact && node tests/e2e/residential.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-residential');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4199, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|no_home|built their home/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (to) => page.evaluate((to) => window.__landvasNav(to), to);
const home = (expr) => page.evaluate((e) => new Function('h', `return (${e})`)(window.__landvasHome), expr);
const URL = `http://localhost:${PORT}/?e2e=1`;

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
/** the sign-in form (from the map, tap "Sign in" first) */
async function authForm() {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) { await page.locator('button,a').filter({ hasText: /sign in/i }).first().click(); }
  await page.waitForSelector('#email', { timeout: 30000 });
}
async function signUp(email, username) {
  await authForm();
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
}
/** sign out and back to the sign-in screen, without reloading (the local database lives in this page) */
async function switchUser() {
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(800);
  await nav('/world'); await page.waitForTimeout(1500);
}
async function signIn(email) {
  await switchUser();
  await authForm();
  await page.locator('button').filter({ hasText: /^Sign in$/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi && !document.querySelector('#email'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
}
async function walkTo(spot) {
  await home(`h.walkTo(${JSON.stringify(spot)})`);
  await page.waitForFunction((k) => { const n = window.__landvasHome.debug().near; return !!n && n.startsWith(k); }, spot.kind, { timeout: 20000 });
  await page.waitForTimeout(700);
}

try {
  // ---- the owner: four plots ------------------------------------------------------------------------------------
  await page.goto(URL, { waitUntil: 'load' });
  await signUp('hana@example.test', 'hana_home');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    for (let tries = 0; tries < 3; tries++) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await clickPlot(START.gx + dx, START.gy + dy).catch(() => {});
      if (await page.locator('[data-testid=claim-plot]').count()) break;
    }
    if (!dx && !dy) {
      // the purchase screen: every type as a tiny square; Residential opens its subplots; details for all
      const squares = await page.locator('[data-testid=plot-kind-choice] [role=radiogroup] >> nth=0').locator('[role=radio]').count();
      check('every plot type shows as a square', squares === 13, `${squares}`);
      await page.click('[data-testid=buy-as-residential]'); await page.waitForTimeout(500);
      check('Residential opens its two subplots', (await page.locator('[data-testid=buy-subplots] [role=radio]').count()) === 2);
      await page.click('[data-testid=buy-as-landlord]'); await page.waitForTimeout(300);
      check('…and the claim button says which', /Residential · Landlord/i.test(await page.locator('[data-testid=claim-plot]').innerText()));
      await page.locator('[data-testid=plot-kind-choice]').scrollIntoViewIfNeeded(); await shot('00-buy-residential');
      await page.click('[data-testid=buy-details-toggle]'); await page.waitForTimeout(500);
      check('details for every type, with the subplots', (await page.locator('[data-testid=buy-details] > div').count()) === 13 && (await page.locator('[data-testid=buy-detail-home]').count()) === 1);
      await page.locator('[data-testid=buy-detail-home]').scrollIntoViewIfNeeded(); await shot('00b-buy-details');
      await page.click('[data-testid=buy-details-toggle]');
      await page.click('[data-testid=buy-as-canvas]'); await page.waitForTimeout(300);
    }
    await page.click('[data-testid=claim-plot]');
    await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 }); await page.waitForTimeout(2200);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  const hana = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${hana}', 'ink', 50000) on conflict (player_id, resource) do update set amount = 50000`);
  check('four plots claimed', (await api('myGroups')).reduce((n, g) => n + g.plot_count, 0) === 4);

  // ---- a visitor before the owner has a Home: no way in -------------------------------------------------------------
  await switchUser();
  await signUp('vic@example.test', 'vic_visit');
  await page.waitForTimeout(3000);
  const vic = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${vic}'`);
  console.log('profiles', JSON.stringify(await sql(`select username, is_hidden from profiles`)));
  await nav('/u/hana_home');
  await page.waitForSelector('[data-testid=profile-no-home]', { timeout: 20000 });
  check('the profile says there is no home yet', true);
  await shot('01-profile-no-home');
  await nav('/u/hana_home/home');
  await page.waitForSelector('[data-testid=home-not-built]', { timeout: 20000 });
  check('walking in is refused until they build a home', true);
  await shot('02-not-built');

  // ---- the owner makes a Residential · Home ---------------------------------------------------------------------------
  await signIn('hana@example.test');
  await nav('/world'); await page.waitForTimeout(2000);
  await clickPlot(START.gx, START.gy);
  await page.click('[data-testid=plot-kind]'); await page.waitForSelector('[data-testid=plot-kind-dialog]', { timeout: 10000 });
  await page.locator('[data-testid=kind-residential]').scrollIntoViewIfNeeded(); await page.waitForTimeout(1200);
  await shot('03-picker');
  await page.click('[data-testid=kind-residential]'); await page.waitForSelector('[data-testid=kind-subplots]', { timeout: 5000 });
  await page.click('[data-testid=kind-landlord]'); await page.click('[data-testid=kind-home]');
  await page.locator('[data-testid=kind-subplots]').scrollIntoViewIfNeeded(); await shot('03b-picker-subplots');
  await page.click('[data-testid=kind-next]');
  await page.waitForSelector('[data-testid=plot-kind-confirm]', { timeout: 10000 }); await shot('04-confirm');
  await page.click('[data-testid=kind-confirm]');
  await page.waitForSelector('[data-testid=home]', { timeout: 30000 }); await page.waitForTimeout(2500);
  let house = (await api('homeGet', 'hana_home')).house;
  check('Residential · Home: the house is open to visitors', house.allowed && house.has_home && house.size === 1, JSON.stringify({ size: house.size, allowed: house.allowed }));
  // the other three become Home too, and merge into a 2x2
  for (const g of await api('myGroups')) if (g.kind !== 'home') await api('setGroupKind', g.id, 'home');
  const merged = await api('fuseGroups', (await api('myGroups')).map((g) => g.id));
  check('four Home plots merge into one', merged.plot_count === 4 && merged.kind === 'home', merged.kind);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await nav('/world'); await page.waitForTimeout(1500);
  await clickPlot(START.gx, START.gy);
  await page.waitForSelector('[data-testid=house-card][data-size="2"]', { timeout: 10000 });
  check('the plot panel shows a 2x2 Two-Storey House and what 3x3 adds', (await page.locator('[data-testid=house-next]').innerText()).includes('3×3'));
  await page.locator('[data-testid=house-card]').scrollIntoViewIfNeeded(); await shot('05-house-card');
  await shot('05b-map');

  // ---- in the house: the stairs, upstairs -----------------------------------------------------------------------------
  await page.click('[data-testid=open-house]');
  await page.waitForSelector('[data-testid=home]', { timeout: 30000 }); await page.waitForTimeout(3000);
  check('the house knows its size', (await page.locator('[data-testid=home-house]').innerText()).includes('Two-Storey House'));
  await walkTo({ kind: 'stairs' });
  await shot('10-at-the-stairs');
  await page.click('[data-testid=home-upstairs]'); await page.waitForTimeout(1500);
  check('upstairs: the first floor', (await home('h.floor()')) === 1 && (await page.locator('[data-testid=home-house]').innerText()).includes('First floor'));
  await home(`h.walkTo({ kind: 'art', i: 0 })`).catch(() => {}); await page.waitForTimeout(1500);
  await shot('11-upstairs');
  // furniture upstairs is saved on that floor
  await page.click('[data-testid=home-decorate]'); await page.waitForTimeout(1500);
  const before = (await home('h.layout()')).length;
  await home(`h.addItem('bed')`); await page.waitForTimeout(500);
  const upBed = (await home('h.layout()')).filter((p) => p.f === 1 && p.i === 'bed').length;
  check('a piece added upstairs belongs to that floor', upBed >= 1 && (await home('h.layout()')).length === before + 1, `beds upstairs ${upBed}`);
  await page.click('[data-testid=home-save]');
  await page.waitForTimeout(2500);
  const saved = (await api('homeGet', 'hana_home')).layout.filter((p) => p.f === 1).length;
  check('…and saved there', saved >= 1, `${saved} upstairs`);

  // a big house (test only: make the 2x2 size a big one) — balconies, a lift, a roof terrace with a pool
  await sql(`update game_config set value = jsonb_set(value, '{sizes,1}', '{"size":2,"name":"Test Tower","floors":3,"balcony":true,"roof":true,"elevator":true,"pool":true,"unlock":"x"}'::jsonb) where key = 'residential'`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await nav('/world'); await page.waitForTimeout(800); await nav('/home');
  await page.waitForSelector('[data-testid=home]', { timeout: 30000 }); await page.waitForTimeout(3000);
  house = (await api('homeGet', 'hana_home')).house;
  check('a big house: 3 floors, balconies, a lift, a roof terrace, a pool', house.levels === 4 && house.elevator && house.pool, JSON.stringify({ levels: house.levels }));
  await walkTo({ kind: 'lift' });
  await page.waitForSelector('[data-testid=home-lift]', { timeout: 10000 });
  await shot('12-lift');
  await page.click('[data-testid=home-lift-2]'); await page.waitForTimeout(1500);
  await home(`h.walkTo({ kind: 'item', id: 'nothing' })`).catch(() => {});
  await page.evaluate(() => { const h = window.__landvasHome; h.walkTo({ kind: 'stairs' }); }); await page.waitForTimeout(400);
  await page.evaluate(() => window.__landvasHome.walkTo({ kind: 'art', i: 0 })); await page.waitForTimeout(400);
  // out onto the balcony
  await page.evaluate(() => { const h = window.__landvasHome; h.walkTo({ kind: 'lift' }); }); await page.waitForTimeout(300);
  check('the lift goes straight to the second floor', (await home('h.floor()')) === 2);
  await page.keyboard.down('s'); await page.waitForTimeout(2600); await page.keyboard.up('s'); await page.waitForTimeout(500);
  const bz = (await home('h.debug()')).P.z;
  check('the upper floors have a balcony out the front', bz > 6.2, `z ${bz.toFixed(2)}`);
  await shot('13-balcony');
  await walkTo({ kind: 'lift' });
  await page.click('[data-testid=home-lift-3]'); await page.waitForTimeout(1500);
  check('the lift goes up to the roof terrace', (await home('h.floor()')) === 3 && (await page.locator('[data-testid=home-house]').innerText()).includes('Roof terrace'));
  await page.keyboard.down('a'); await page.waitForTimeout(900); await page.keyboard.up('a'); await page.waitForTimeout(800);
  await shot('14-roof-pool');
  await walkTo({ kind: 'stairs' });
  await page.click('[data-testid=home-downstairs]'); await page.waitForTimeout(1500);
  check('and back down the stairs', (await home('h.floor()')) === 2);
  // back to the real 2x2
  await sql(`update game_config set value = jsonb_set(value, '{sizes,1}', '{"size":2,"name":"Two-Storey House","floors":2,"balcony":false,"roof":false,"elevator":false,"pool":false,"unlock":"An upstairs floor and a staircase"}'::jsonb) where key = 'residential'`);

  // ---- a Landlord plot -----------------------------------------------------------------------------------------------------
  await nav('/world'); await page.waitForTimeout(1500);
  const lgx = START.gx + 3, lgy = START.gy;
  const acq = await api('acquirePlot', lgx, lgy).catch((e) => ({ error: e.message }));
  check('a fifth plot', !acq.error, JSON.stringify(acq).slice(0, 120));
  const lg = (await api('myGroups')).find((g) => g.plot_count === 1);
  await api('setGroupKind', lg.id, 'landlord');
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1500);
  await clickPlot(lgx, lgy);
  await page.waitForSelector('[data-testid=landlord-card]', { timeout: 10000 });
  check('the Landlord plot shows its rent day', /rent day/i.test(await page.locator('[data-testid=landlord-card]').innerText()));
  await page.locator('[data-testid=landlord-card]').scrollIntoViewIfNeeded(); await shot('20-landlord');
  await page.click('[data-testid=open-rentals]');
  await page.waitForSelector('[data-testid=wallet-landlord]', { timeout: 10000 });
  check('the wallet shows the Landlord plots and their 50x', /50×/.test(await page.locator('[data-testid=wallet-landlord]').innerText()));
  await page.locator('[data-testid=wallet-landlord]').scrollIntoViewIfNeeded(); await shot('21-wallet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const st = await api('myState');
  check('rent knows the Landlord rate', Number(st.rent.landlord?.rate) > 0 && st.rent.landlord.multiplier === 50, JSON.stringify(st.rent.landlord));

  // ---- the visitor checks in with a drawing ------------------------------------------------------------------------------
  await signIn('vic@example.test');
  await nav('/u/hana_home');
  await page.waitForSelector('[data-testid=profile-visit]', { timeout: 20000 });
  check('the profile now offers a visit', (await page.locator('[data-testid=profile-visit]').innerText()).includes('Visit'));
  await page.click('[data-testid=profile-visit]');
  await page.waitForSelector('[data-testid=home]', { timeout: 30000 });
  await page.waitForFunction(() => { const b = document.querySelector('[data-testid=room-checkin]'); return b && !b.disabled; }, null, { timeout: 30000 });
  await page.click('[data-testid=room-checkin]');
  await page.waitForSelector('[data-testid=sign-book]', { timeout: 10000 });
  await page.click('[data-testid=sign-mode-draw]');
  const box = await page.locator('[data-testid=draw-canvas]').boundingBox();
  // a little house and a sun
  const P = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  for (const stroke of [[[0.3, 0.75], [0.3, 0.45], [0.5, 0.25], [0.7, 0.45], [0.7, 0.75], [0.3, 0.75]], [[0.45, 0.75], [0.45, 0.58], [0.55, 0.58], [0.55, 0.75]], [[0.82, 0.15], [0.88, 0.2], [0.85, 0.27], [0.79, 0.25], [0.78, 0.18], [0.82, 0.15]]]) {
    const [x0, y0] = P(...stroke[0]); await page.mouse.move(x0, y0); await page.mouse.down();
    for (const pt of stroke.slice(1)) { const [x, y] = P(...pt); await page.mouse.move(x, y, { steps: 8 }); }
    await page.mouse.up();
  }
  await shot('30-drawing');
  await page.click('[data-testid=guestbook-sign]');
  await page.waitForSelector('[data-testid=room-checked-in]', { timeout: 15000 });
  check('drawing in the book checks you in', true);
  const notes = (await api('roomSocial', 'hana_home')).notes;
  check('the drawing is in their book', notes[0]?.drawing?.s?.length === 3, JSON.stringify(notes[0]?.drawing?.s?.map((s) => s.p.length)));
  await page.click('[data-testid=home-guestbook]'); await page.waitForTimeout(1500);
  for (let i = 0; i < 2; i++) { await page.click('[data-testid=guestbook-next]'); await page.waitForTimeout(800); }
  await page.waitForSelector('[data-testid=book-drawing]', { timeout: 10000 }).catch(() => {});
  check('the book shows the drawing', (await page.locator('[data-testid=book-drawing]').count()) >= 1);
  await shot('31-book');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run completed', false, e.message.split('\n')[0]);
  await shot('99-error');
} finally {
  await browser.close(); server.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
}
