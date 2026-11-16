// Godrolls, Ascend and roll tickets in a real browser (phone size), on the full in-browser backend:
// a roll offers Ascend and Ascend only goes up; a Godroll lined up by staff shows its banner and pick screen; tickets
// sent through the admin API (exact rarity + shiny + free rerolls, and an Enchanted one with its recipe) show on the
// home and roll; the Settings screen has the new Minigames and Notifications sections; the plot list searches kinds.
// Run: npm run build:artifact && node tests/e2e/rolls-gifts.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-rolls-gifts'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4318);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
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
  await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: true })); } catch {} });
  await page.goto('http://localhost:4318/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'gifts@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'gift_gal'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasNav('/world'));
  await page.waitForSelector('[data-testid=simple-home]', { timeout: 20000 }); await page.waitForTimeout(1000);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`select private.ledger_apply('${me}', 'ink', 200000, 'admin_adjust', 'test', 'test', 'e2e:gifts:ink')`);
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  await refresh(); await page.waitForTimeout(800);

  // ---- ⬆️ Ascend: a fresh roll offers it; it only goes up -------------------------------------------------------
  // (Ascend's own odds are tested in SQL; here: the offer, the sheet, a try, and the floor)
  await sql(`update game_config set value = value || '{"pity": 50}'::jsonb where key = 'ascend'`);
  await page.click('[data-testid=simple-buy]');
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 25000 });
  const offer = await until(async () => (await page.locator('[data-testid=ascend-offer]').count()) === 1, 12000);
  const plot = (await sql(`select gx, gy, rarity from world_plots where owner_id = '${me}' order by claimed_at desc limit 1`))[0];
  check('a fresh roll offers Ascend (below Mythic)', offer || ['mythic'].includes(plot.rarity), plot.rarity);
  await shot('01-roll-ascend-offer');
  if (offer) {
    await page.click('[data-testid=ascend-offer]');
    await page.waitForSelector('[data-testid=ascend-sheet]', { timeout: 15000 }); await page.waitForTimeout(500);
    check('the Ascend sheet shows the odds', (await page.locator('[data-testid=ascend-odds]').count()) === 1);
    await shot('02-ascend-sheet');
    const order = (await sql(`select id, sort from plot_rarities where weight > 0 order by sort`));
    const sortOf = (r) => order.find((x) => x.id === r)?.sort ?? -1;
    let now = plot.rarity, ok = true, tries = 0;
    for (let i = 0; i < 4 && (await page.locator('[data-testid=ascend-go]').count()); i++) {
      await page.click('[data-testid=ascend-go]');
      await page.waitForSelector('[data-testid=ascend-result]', { timeout: 15000 }); await page.waitForTimeout(700); tries++;
      const r = (await sql(`select rarity from world_plots where gx = ${plot.gx} and gy = ${plot.gy}`))[0].rarity;
      if (sortOf(r) < sortOf(now)) ok = false;
      now = r;
    }
    const a = (await sql(`select tries, from_rarity from plot_ascents where gx = ${plot.gx} and gy = ${plot.gy}`))[0];
    check('Ascend tries are charged and recorded', !!a && a.tries === tries && a.from_rarity === plot.rarity, JSON.stringify(a));
    check('…and the rarity never went down', ok, `${plot.rarity} → ${now}`);
    await shot('03-ascend-after');
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  }
  if (await page.locator('[data-testid=roll-done]').count()) { await page.click('[data-testid=roll-done]'); await page.waitForTimeout(800); }

  // ---- ⚡ a Godroll lined up by staff (through the admin API) -------------------------------------------------
  await api('admin.grantGodroll', me, 'echo', 4, 'solar', false, 'e2e');
  await page.click('[data-testid=simple-buy]');
  const banner = await page.waitForSelector('[data-testid=roll-godroll]', { timeout: 25000 }).then(() => true, () => false);
  check('the Godroll banner shows while it rolls', banner);
  await page.waitForTimeout(600); await shot('04-godroll-spin');
  await page.waitForSelector('[data-testid=roll-pick]', { timeout: 60000 });
  check('the pick screen says Echo Godroll', /Echo Godroll/.test(await page.textContent('[data-testid=roll-godroll-pick]')));
  const types = await page.$$eval('[data-testid^=roll-choice-type-]', (els) => els.map((e) => e.textContent));
  check('Echo: 4 rolls, the same ultra, each a different minigame', types.length === 4 && new Set(types).size === 4, types.join(' | '));
  await shot('05-godroll-pick');
  await page.click('[data-testid=roll-choice-2]'); await page.click('[data-testid=roll-keep]'); await page.waitForTimeout(2500);
  const log = (await sql(`select kind, how, kept, rarities from private.godroll_log where player_id = '${me}' order by id desc limit 1`))[0];
  check('the Godroll is logged with the kept roll', log?.kind === 'echo' && log?.how === 'staff' && log?.kept === 'solar', JSON.stringify(log));
  if (await page.locator('[data-testid=roll-done]').count()) { await page.click('[data-testid=roll-done]'); await page.waitForTimeout(800); }

  // ---- 🎟️ tickets sent through the admin API ---------------------------------------------------------------------
  await api('admin.grantTicket', me, { rarity: 'mythic', exact: true, shiny: true, rerolls: 2, label: 'Birthday' }, 1);
  await api('admin.grantTicket', me, { rarity: 'enchanted', enchant: { kind: 'goose', stars: 2, level: 3, nickname: 'Goldie' }, label: 'Winner' }, 1);
  await refresh();
  const chip = await page.waitForSelector('[data-testid=tickets-chip]', { timeout: 15000 }).then(() => true, () => false);
  check('the home shows the tickets waiting', chip);
  await shot('06-home-tickets');
  await page.click('[data-testid=tickets-chip]');
  await page.waitForSelector('[data-testid=tickets-sheet]', { timeout: 10000 }); await page.waitForTimeout(400);
  const sheet = await page.textContent('[data-testid=tickets-sheet]');
  check('the tickets say what is on them', /Birthday · Mythic/.test(sheet) && /Shiny/.test(sheet) && /\+2 free rerolls/.test(sheet) && /Winner · Enchanted: Golden Goose/.test(sheet), sheet.slice(0, 200));
  await shot('07-tickets-sheet');
  await page.locator('[data-testid=use-ticket]').filter({ hasText: 'Birthday' }).click();
  await page.waitForSelector('[data-testid=roll-pick]', { timeout: 60000 });
  const n = await page.locator('[data-testid^=roll-choice-]').filter({ has: page.locator('span') }).count();
  const first = await page.getAttribute('[data-testid=roll-choice-0]', 'data-shiny');
  check('the ticket’s free rerolls show (3 rolls), its own roll Shiny', (await page.locator('[data-testid=roll-choice-2]').count()) === 1 && first === 'true', `${n} ${first}`);
  await page.click('[data-testid=roll-choice-0]'); await page.click('[data-testid=roll-keep]'); await page.waitForTimeout(2500);
  const kept = (await sql(`select rarity, shiny from world_plots where owner_id = '${me}' order by claimed_at desc limit 1`))[0];
  check('…and lands exactly Mythic, Shiny', kept.rarity === 'mythic' && kept.shiny === true, JSON.stringify(kept));
  if (await page.locator('[data-testid=roll-done]').count()) { await page.click('[data-testid=roll-done]'); await page.waitForTimeout(800); }
  await page.click('[data-testid=tickets-chip]'); await page.waitForSelector('[data-testid=tickets-sheet]');
  await page.locator('[data-testid=use-ticket]').filter({ hasText: 'Winner' }).click();
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 60000 }); await page.waitForTimeout(4000);
  const e = (await sql(`select kind, stars, level, nickname from enchantments where owner_id = '${me}' order by born_at desc limit 1`))[0];
  check('the Enchanted ticket births exactly that enchantment', e?.kind === 'goose' && e?.stars === 2 && e?.level === 3 && e?.nickname === 'Goldie', JSON.stringify(e));
  await shot('08-enchanted-ticket');
  if (await page.locator('[data-testid=roll-done]').count()) { await page.click('[data-testid=roll-done]'); await page.waitForTimeout(800); }
  check('used tickets are gone', (await sql(`select count(*)::int n from roll_tickets where player_id = '${me}' and used_at is null`))[0].n === 0);

  // ---- 💧 Ink earnings off for one player, through the admin API ---------------------------------------------
  const m = await api('admin.setPlayerInkMode', me, 'off', 'e2e');
  check('Ink earnings can be switched off for one player', m.mode === 'off');
  await api('admin.setPlayerInkMode', me, 'default', null);

  // ---- ⚙️ Settings: Minigames and Notifications ---------------------------------------------------------------------
  await page.evaluate(() => window.__landvasNav('/settings')); await page.waitForTimeout(1500);
  const body = await page.textContent('body');
  check('Settings has the Minigames section (bold colours, symbols, bigger boards)', /Bold, easy-to-tell-apart/i.test(body) && /symbol/i.test(body) && /bigger/i.test(body));
  check('Settings has the Notifications section, off until you switch it on', /Reminders/.test(body) && !(await page.locator('[data-testid=notify-kinds]').count()));
  await page.locator('#notify').scrollIntoViewIfNeeded(); await page.click('#notify');
  const kinds = await page.waitForSelector('[data-testid=notify-kinds]', { timeout: 8000 }).then(() => true, () => false);
  check('…switched on, each kind of reminder has its own switch', kinds && /Digging energy/i.test(await page.textContent('[data-testid=notify-kinds]')));
  await page.waitForTimeout(400); await shot('09-settings');

  // ---- 🔎 My Plots: search by kind / rarity name ------------------------------------------------------------------
  await page.evaluate(() => window.__landvasNav('/plots')); await page.waitForSelector('[data-testid=plots-search]', { timeout: 20000 });
  await page.fill('[data-testid=plots-search]', 'mythic'); await page.waitForTimeout(500);
  check('searching a rarity name finds the plot', (await page.locator('[data-testid=plot-row]').count()) >= 1);
  await page.fill('[data-testid=plots-search]', 'landlord'); await page.waitForTimeout(500);
  check('searching "landlord" with none finds nothing', (await page.locator('[data-testid=plot-row]').count()) === 0);
  await page.fill('[data-testid=plots-search]', ''); await shot('10-plots');

  // ---- 🔥 Hot Zone: the badge on a plot inside today's zone, and the city trivia --------------------------------
  // (the e2e world lives in memory: switch to the full game without reloading)
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(3000);
  const hz = await api('hotZone');
  if (hz?.today) {
    const free = (await sql(`select ${hz.today.gx} + dx as gx, ${hz.today.gy} as gy from generate_series(0, 3) dx where not exists (select 1 from world_plots w where w.gx = ${hz.today.gx} + dx and w.gy = ${hz.today.gy} and w.owner_id is not null) limit 1`))[0];
    await page.evaluate((c) => window.__landvasUi.getState().select(c), { gx: free.gx, gy: free.gy });
    const badge = await page.waitForSelector('[data-testid=hot-zone-badge]', { timeout: 15000 }).then(() => true, () => false);
    check('a plot inside today’s Hot Zone shows the 🔥 badge', badge, `${hz.today.name}`);
    await shot('11-hot-zone-plot');
    await page.evaluate(() => window.__landvasUi.getState().select(null)); await page.waitForTimeout(600);
    // (close the "drop into the world" sheet a new full-game player gets)
    for (let i = 0; i < 3 && (await page.locator('[data-state=open][aria-hidden=true]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
    await page.click('[data-testid=hot-zone-chip]');
    const trivia = await page.waitForSelector('[data-testid=hot-zone-trivia], [data-testid=hot-zone-trivia-open]', { timeout: 10000 }).then(() => true, () => false);
    if (await page.locator('[data-testid=hot-zone-trivia-open]').count()) await page.click('[data-testid=hot-zone-trivia-open]');
    await page.waitForTimeout(800);
    const t = trivia ? await page.textContent('[data-testid=hot-zone-trivia]') : '';
    check('the Hot Zone card has trivia about the city', trivia && /About/.test(t) && /Paint ideas/.test(t), t.slice(0, 160));
    await shot('12-hot-zone-trivia');
  } else check('a Hot Zone today', false);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  crashed:', e.message); results.push(false); await shot('99-crash');
} finally {
  await browser.close(); server.close?.();
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
}
