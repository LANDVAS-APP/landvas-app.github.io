// Splice Traits you can see and use, and picking plots on the map: Seeking buries real chests (in the Grimoire, on the
// Treasure Map's page and on the world map) that you dig up with three taps; every spliced enchantment shows its Traits at
// work — what each does on that kind, whether it needs you, what it's done; the Clockwork's chime; and the Wormhole's far
// end and a plot to Splice into, picked on the map instead of the radar.
// Run: npm run build:artifact && node tests/e2e/trait-chests.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-trait-chests'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4337);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
const refresh = () => page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
const give = (me, kind, near = null) => page.evaluate(([me, k, near]) => window.__landvasApi.admin.giveEnchantment(me, k, 'e2e: traits', near), [me, kind, near]);
const act = (id, action, args = {}) => page.evaluate(([id, a, x]) => window.__landvasApi.enchantAct(id, a, x), [id, action, args]);
const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
try {
  await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: false })); } catch {} });
  await page.goto('http://localhost:4337/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'traits@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'trait_tess'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  await sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}' where key = 'enchantments'`);
  const ids = {};
  ids.goose = (await give(me, 'goose')).id;
  const home = (await sql(`select gx, gy from enchantments where id = '${ids.goose}'`))[0];
  for (const k of ['map', 'splice', 'clockwork', 'wormhole']) ids[k] = (await give(me, k, { gx: home.gx, gy: home.gy })).id;
  // a few plain plots of yours nearby (to pick on the map)
  for (let i = 1; i <= 4; i++) await sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (${home.gx + 6 + i * 2}, ${home.gy + 3}, 'clay', 'rare', '${me}', now()) on conflict (gx, gy) do update set owner_id = excluded.owner_id, rarity = 'rare', claimed_at = now()`);

  // ---- 🗺️ Seeking: a Goose wearing the Map's Trait buries real chests ----
  await sql(`update enchantments set state = state || jsonb_build_object('charges', 2, 'charge_at', extract(epoch from now())) where id = '${ids.splice}'`);
  await act(ids.splice, 'splice', { mode: 'graft', a: ids.goose, b: ids.map });
  let buried = 0;
  for (let i = 0; i < 16 && buried < 2; i++) buried += Number((await sql(`select private.ench_pay('${ids.goose}', 100, 'e2e') r`))[0].r.chests);
  check('Seeking buried chests with the Goose’s rewards', buried >= 1, `${buried}`);
  await refresh();
  await nav('/grimoire'); await page.waitForSelector('[data-testid=seek-chests]', { timeout: 20000 }); await page.waitForTimeout(800);
  check('the Grimoire lists the buried chests waiting', /Buried chests waiting · \d/i.test(await text('[data-testid=seek-chests]')));
  await shot('01-grimoire-chests');
  await nav(`/grimoire/${ids.goose}`); await page.waitForSelector('[data-testid=ench-traits]', { timeout: 20000 }); await page.waitForTimeout(1200);
  const tr = await text('[data-testid=ench-trait]');
  check('the Goose’s page shows the Seeking Trait at work, in plain words', /Seeking/.test(tr) && /bury a chest by its plot/.test(tr) && /Needs you/.test(tr) && /chests? buried since the splice/.test(tr), tr.slice(0, 200));
  check('…and its buried chests, with Dig and 📍', (await page.locator('[data-testid=seek-chest]').count()) === buried);
  await shot('02-goose-traits');
  const ink0 = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0].amount);
  const dig = page.locator('[data-testid=seek-chest-dig]').first();
  await dig.scrollIntoViewIfNeeded();
  for (let i = 0; i < 3; i++) { await dig.click(); await page.waitForTimeout(450); }
  await page.waitForTimeout(1500);
  const ink1 = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0].amount);
  check('three swings dig a chest up: +50 Ink', ink1 === ink0 + 50, `${ink0} → ${ink1}`);
  check('…and it leaves the list', (await page.locator('[data-testid=seek-chest]').count()) === buried - 1);
  await shot('03-dug');
  await nav(`/grimoire/${ids.map}`); await page.waitForSelector('[data-testid=map-scene]', { timeout: 20000 }); await page.waitForTimeout(1000);
  if (buried > 1) check('the Treasure Map’s page shows the chests its Seeking Trait buried', /Chests your Seeking Trait buried/i.test(await text('[data-testid=seek-chests]')));
  await shot('04-treasure-map');
  await act(ids.splice, 'unsplice');

  // ---- ⚙️ an Ink Trait on the Clockwork works on its chime ----
  await sql(`update enchantments set state = state || jsonb_build_object('charges', 2, 'charge_at', extract(epoch from now())) where id = '${ids.splice}'`);
  await act(ids.splice, 'splice', { mode: 'graft', a: ids.clockwork, b: ids.goose });
  await refresh();
  await nav(`/grimoire/${ids.clockwork}`); await page.waitForSelector('[data-testid=clock-scene]', { timeout: 20000 }); await page.waitForTimeout(1200);
  const ct = await text('[data-testid=ench-trait]');
  check('a Golden Trait on the Clockwork says it works on the daily chime, by itself', /Golden/.test(ct) && /daily chime/.test(ct) && /Works by itself/.test(ct), ct.slice(0, 160));
  check('the Clockwork says its last turn chimes', /last turn chimes/.test(await text('[data-testid=clock-chime]')));
  await shot('05-clockwork');
  await act(ids.splice, 'unsplice');

  // ---- 🌀 the Wormhole's far end, picked on the map ----
  await refresh();
  await nav(`/grimoire/${ids.wormhole}`); await page.waitForSelector('[data-testid=wormhole-pick-map]', { timeout: 20000 }); await page.waitForTimeout(800);
  await shot('06-wormhole');
  await page.click('[data-testid=wormhole-pick-map]');
  await page.waitForSelector('[data-testid=pick-card]', { timeout: 20000 });
  check('“Pick the far end on the map” opens the map, picking', /far end/.test(await text('[data-testid=pick-card]')));
  check('…without the quest bar over the pick sheet', (await page.locator('[data-testid=quest-pill]').count()) === 0);
  await page.keyboard.press('Escape'); // (the first-visit sheet)
  const hairs = await page.waitForSelector('[data-testid=pick-crosshair]', { timeout: 30000 }).then(() => true, () => false);
  await page.waitForTimeout(2500);
  check('…with your reachable plots in crosshairs', hairs && (await page.locator('[data-testid=pick-crosshair]').count()) >= 1);
  await shot('07-pick-map');
  await page.locator('[data-testid=pick-crosshair]').first().click({ force: true });
  await page.waitForSelector('[data-testid=pick-use]', { timeout: 10000 });
  check('tapping one offers “Use this plot”, with how far it is', /(km|m) away/.test(await text("[data-testid=pick-sheet]")));
  await shot('08-pick-sheet');
  await page.click('[data-testid=pick-use]');
  await page.waitForSelector('[data-testid=wormhole-scene]', { timeout: 20000 }); await page.waitForTimeout(1200);
  const wo = await text('[data-testid=wormhole-open]');
  check('back on the Wormhole with the far end chosen', /Trace the spiral/.test(wo) && /(km|m) away/.test(await text('[data-testid=wormhole-far]')), wo);
  await shot('09-wormhole-picked');

  // ---- 🧪 Splice with a plot: the plot picked on the map ----
  await nav(`/grimoire/${ids.splice}`); await page.waitForSelector('[data-testid=splice-mode-plot]', { timeout: 20000 }); await page.waitForTimeout(600);
  await page.click('[data-testid=splice-mode-plot]'); await page.waitForTimeout(300);
  await page.click('[data-testid=splice-pick-goose]'); await page.waitForTimeout(500);
  await page.click('[data-testid=splice-pick-map]');
  await page.waitForSelector('[data-testid=pick-crosshair]', { timeout: 30000 }); await page.waitForTimeout(2000);
  await page.locator('[data-testid=pick-crosshair]').first().click({ force: true });
  await page.waitForSelector('[data-testid=pick-use]', { timeout: 10000 });
  await page.click('[data-testid=pick-use]');
  await page.waitForSelector('[data-testid=splice-scene]', { timeout: 20000 }); await page.waitForTimeout(1500);
  check('back in the Splice lab: with a plot, the Goose and the plot picked, the hybrid card shown', (await page.locator('[data-testid=hybrid-card]').count()) === 1 && /Pull the lever/.test(await text('[data-testid=splice-go]')));
  await shot('10-splice-picked');

  // ---- 🧰 a chest on the world map: tap to dig ----
  await sql(`insert into seek_chests (player_id, enchant_id, finder_kind, gx, gy, ink) values ('${me}', '${ids.goose}', 'goose', ${home.gx + 2}, ${home.gy + 2}, 50)`);
  await refresh();
  await page.evaluate(([gx, gy]) => window.__landvasNav(`/world?fly=${gx},${gy}&z=19`), [home.gx + 2, home.gy + 2]);
  const mk = await page.waitForSelector('[data-testid=map-chest]', { timeout: 40000 }).then(() => true, () => false);
  await page.waitForTimeout(1500);
  check('your buried chest shows on the map', mk);
  await shot('11-map-chest');
  const before = Number((await sql(`select count(*) n from seek_chests where player_id = '${me}' and dug_at is null`))[0].n);
  // (the test's first-visit sheets sit over the map: tap the chest itself)
  await page.locator('[data-testid=map-chest] button').first().evaluate((b) => b.click()); await page.waitForTimeout(1800);
  const after = Number((await sql(`select count(*) n from seek_chests where player_id = '${me}' and dug_at is null`))[0].n);
  check('…and a tap digs it up', after === before - 1, `${before} → ${after}`);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('run completed', false, e.message.split('\n')[0]);
  await shot('99-err');
} finally {
  await browser.close(); server.close();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
