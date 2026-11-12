// The Altar of Luck (sacrifice a plot, offer Ink, the next roll spends it) and a Landlord estate in 3D (the monthly
// checklist: repairs, a tenant's letter, the garden).
// Run: npm run build:artifact && node tests/e2e/luck-estate.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-luck-estate'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4306);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const roll = async () => {
  await page.click('[data-testid=simple-buy]');
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 25000 }); await page.waitForTimeout(1200);
  const lucky = (await page.locator('[data-testid=roll-lucky]').count()) === 1;
  await page.click('[data-testid=roll-done]'); await page.waitForTimeout(900);
  return lucky;
};
try {
  await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: true })); } catch {} });
  await page.goto('http://localhost:4306/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'luck@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'lucky_lu'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasNav('/world'));
  await page.waitForSelector('[data-testid=simple-home]', { timeout: 20000 }); await page.waitForTimeout(1200);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`select private.ledger_apply('${me}', 'ink', 20000, 'admin_adjust', 'test', 'test', 'e2e:luck:ink')`);
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  for (let i = 0; i < 3; i++) await roll();
  check('three plots rolled', (await api('myGroups')).length === 3);

  // ---- the altar ----
  await page.click('[data-testid=luck-chip]'); await page.waitForSelector('[data-testid=altar]', { timeout: 10000 }); await page.waitForTimeout(600);
  check('the altar opens with 0 Luck', (await page.textContent('[data-testid=luck-value]')) === '0');
  const offerings = await page.locator('[data-testid=luck-plot]').count();
  check('your Base plots are offerings', offerings === 3, `${offerings}`);
  await shot('01-altar');
  await page.locator('[data-testid=luck-sacrifice]').first().click(); await page.click('[data-testid=luck-confirm]'); await page.waitForTimeout(1500);
  const afterPlot = Number(await page.textContent('[data-testid=luck-value]'));
  check('sacrificing a plot charges Luck (and the plot is gone)', afterPlot > 0 && (await api('myGroups')).length === 2, `${afterPlot}`);
  await page.click('[data-testid=luck-ink-20]'); await page.waitForTimeout(1200);
  const afterInk = Number(await page.textContent('[data-testid=luck-value]'));
  check('offering Ink adds 20 more (no daily limit any more)', afterInk === afterPlot + 20, `${afterPlot} → ${afterInk}`);
  await shot('02-altar-charged');
  // fill it up and roll
  await sql(`update player_luck set luck = 100 where player_id = '${me}'`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['luck'] })); await page.waitForTimeout(1000);
  check('Luck is saved until you choose to use it', (await page.getAttribute('[data-testid=luck-arm-0]', 'aria-pressed')) === 'true');
  check('…a reroll can’t be armed beyond what you have', !(await page.isDisabled('[data-testid=luck-arm-5]')));
  await page.click('[data-testid=luck-arm-5]'); await page.waitForTimeout(1000);
  check('arming all 5 rerolls', (await sql(`select armed from player_luck where player_id = '${me}'`))[0].armed === 5);
  await page.locator('[data-testid=luck-arm]').scrollIntoViewIfNeeded(); await shot('02b-armed');
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  await page.click('[data-testid=simple-buy]');
  await page.waitForSelector('[data-testid=roll-luck]', { timeout: 20000 });
  check('with Luck, the roll shows the meter', /6 rolls/.test(await page.textContent('[data-testid=roll-luck]')));
  await page.waitForTimeout(2500); await shot('03-lucky-rerolls');
  await page.waitForSelector('[data-testid=roll-pick]', { timeout: 60000 }); await page.waitForTimeout(900);
  const n = await page.locator('[data-testid^=roll-choice-]').count();
  check('6 rolls to choose from', n === 6, `${n}`);
  await shot('03b-pick');
  await page.click('[data-testid=roll-choice-0]'); await page.click('[data-testid=roll-keep]');
  await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 20000 }); await page.waitForTimeout(1200);
  await page.click('[data-testid=roll-done]'); await page.waitForTimeout(900);
  const st = await api('luckStatus');
  const kept = await sql(`select options, picked from luck_choices where player_id = '${me}'`);
  check('the Luck is spent and the first roll was kept', st.luck === 0 && kept[0]?.picked === 0, JSON.stringify({ luck: st.luck, picked: kept[0]?.picked }));

  // ---- a Landlord estate ----
  const g = (await api('myGroups'))[0];
  await api('setGroupKind', g.id, 'landlord');
  await page.evaluate((id) => window.__landvasNav(`/landlord/${id}?e2e=1`), g.id);
  await page.waitForSelector('[data-testid=estate-checklist]', { timeout: 20000 }); await page.waitForTimeout(2500);
  check('the estate opens in 3D, and walking in counts as today’s inspection', /1\/3/.test(await page.textContent('[data-testid=estate-task-inspect]')));
  await shot('03-estate');
  // tap the 3D bits (through the scene's action hook: the pins move)
  for (const i of [0, 1, 2]) { await page.evaluate((i) => window.__landvasEstate.act({ kind: 'repair', idx: i }), i); await page.waitForTimeout(700); }
  check('three repairs done', /3\/6/.test(await page.textContent('[data-testid=estate-task-repairs]')));
  await page.evaluate(() => window.__landvasEstate.act({ kind: 'mailbox' })); await page.waitForSelector('[data-testid=estate-request]', { timeout: 5000 });
  await shot('04-tenant-letter');
  await page.click('[data-testid=estate-help]'); await page.waitForTimeout(900);
  check('a tenant helped', /1\/3/.test(await page.textContent('[data-testid=estate-task-requests]')));
  await page.evaluate(() => window.__landvasEstate.act({ kind: 'garden' })); await page.waitForTimeout(1000);
  check('the garden watered', /1\/2/.test(await page.textContent('[data-testid=estate-task-garden]')));
  check('not eligible yet (it takes the month)', /done|Rent day in/.test(await page.textContent('[data-testid=estate-status]')));
  await shot('05-estate-progress');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('run completed', false, e.message.split('\n')[0]);
  await shot('99-err');
} finally {
  await browser.close(); server.close();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
