// Real-browser test (the app's skin, a phone): enchantments as they run.
//  - a Golden Goose with a Clockwork swapped in shows "Time ×3", gears turning, and its egg growing live
//  - on the Goose's own page: "Use your enchantments on this one" — fast-forward it with the Clockwork right there
//  - the Crucible: plots melt, then on to the anvil; the bellows' ring meets the bright circle exactly where a
//    perfect pump scores (three PERFECTs on the beat), and the hammer falls
//  - picking plots on the map: a real tap on a crosshair picks it
// Run: npm run build:artifact && node tests/e2e/enchant-live.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-enchant-live'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4363;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n));
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(1200); };
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
// a real tap (no force): fails if anything covers it
const tap = async (sel) => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); try { await l.tap({ timeout: 6000 }); return true; } catch (e) { console.log('  tap failed', sel, e.message.split('\n')[0]); return false; } };

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'live@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'live_ench'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  const [bx, by] = cellAt(-122.68, 45.52);
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + (k % 5) * 3, ${by} + (k / 5) * 3, '${me}', (select id from plot_types order by sort limit 1), 'common', now() - interval '2 days' from generate_series(0, 19) k on conflict do nothing`);
  const give = async (kind, i) => (await api('admin.giveEnchantment', me, kind, 'e2e: enchantments live', { gx: bx + 1 + (i % 5) * 3, gy: by + 1 + Math.floor(i / 5) * 3 })).id;
  const goose = await give('goose', 0), clock = await give('clockwork', 1), splice = await give('splice', 2), crucible = await give('crucible', 3);
  check('the owner can give a Goose, a Clockwork, a Splice and a Crucible', [goose, clock, splice, crucible].every(Boolean));

  // ---- 🪿 a Clockwork Goose: ×3, as it runs ----
  await sql(`update enchantments set state = state || jsonb_build_object('charges', 3, 'bonus', 0, 'charge_at', extract(epoch from now())) where id = '${splice}'`);
  await sql(`update enchantments set state = state || jsonb_build_object('charge', 120) where id = '${clock}'`);
  await api('enchantAct', splice, 'splice', { mode: 'swap', a: goose, b: clock });
  await nav(`/grimoire/${goose}`);
  check('the Goose shows its time running ×3', await waitFor('[data-testid=tempo-badge]') && /×3/.test((await text('[data-testid=tempo-badge]')) ?? ''), await text('[data-testid=tempo-badge]'));
  check('…gears turn over the meadow', await waitFor('[data-testid=goose-tempo]'));
  const g1 = parseFloat((await text('[data-testid=goose-grow]')) ?? '0');
  await page.waitForTimeout(8000);
  const g2 = parseFloat((await text('[data-testid=goose-grow]')) ?? '0');
  check('…and the egg grows live while you watch', g2 > g1, `${g1}% → ${g2}%`);
  await shot('01-clockwork-goose');

  // ---- ✨ use the Clockwork right from the Goose's page ----
  check('the Goose’s page lists what can work on it', await waitFor('[data-testid=ench-use]'));
  check('…the Clockwork, with its stored time', await waitFor('[data-testid=use-clockwork]'));
  const skip0 = Number((await sql(`select clock_skip from enchantments where id = '${goose}'`))[0].clock_skip);
  check('…fast-forward it 15 minutes from here', await tap('[data-testid=use-clock-forward-15]'));
  await page.waitForTimeout(2000);
  const skip1 = Number((await sql(`select clock_skip from enchantments where id = '${goose}'`))[0].clock_skip);
  check('…and its clock really jumps', skip1 - skip0 >= 899, `${skip0} → ${skip1}`);
  await page.locator('[data-testid=ench-use]').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  await shot('02-use-on-this');

  // ---- 🔥 the Crucible: melt, then the anvil and the bellows ----
  await sql(`update game_config set value = value || '{"crucible": {"need_uncommon": 0.0001, "need_rare": 0.0001, "cap": 1}}'::jsonb where key = 'enchantments'`);
  await nav(`/grimoire/${crucible}`);
  await waitFor('[data-testid=crucible-melt-plot]');
  check('a plot to melt takes a real tap', await tap('[data-testid=crucible-melt-plot]'));
  check('…and so does Melt', await tap('[data-testid=crucible-melt]'));
  await page.waitForTimeout(2500);
  check('…the Heat goes in and the anvil comes up by itself', await waitFor('[data-testid=crucible-strikeable]', 8000));
  check('…a plot for the anvil takes a real tap', await tap('[data-testid=crucible-target]'));
  check('…and so does Strike', await tap('[data-testid=crucible-strike]'));
  check('the bellows come up', await waitFor('[data-testid=crucible-pump]', 6000));
  await page.waitForTimeout(150);
  await shot('03-bellows');
  // the ring meets the circle 0.68 of the way through its 1.3 s close: tap then, three times
  const box = await page.locator('[data-testid=crucible-pump]').boundingBox();
  const said = [];
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(i === 0 ? 888 - 150 : 888);
    await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.waitForTimeout(60);
    said.push(await page.evaluate(() => [...document.querySelectorAll('[data-testid=crucible-bellows] span')].map((s) => s.textContent).find((t) => /PERFECT|Good|early|late/i.test(t ?? '')) ?? ''));
  }
  check('tapping as the ring meets the bright circle is a hit', said.filter((s) => /PERFECT|Good/.test(s)).length >= 2, said.join(' / '));
  check('…and the hammer falls', await waitFor('[data-testid=crucible-verdict]', 12000), await text('[data-testid=crucible-verdict]'));
  await page.waitForTimeout(500); await shot('04-forged');

  // ---- 🗺️ picking a plot on the map: a real tap on a crosshair ----
  await nav(`/grimoire/${crucible}`);
  await tap('[data-testid=crucible-tab-melt]');
  if (await waitFor('[data-testid=crucible-melt-map]', 6000)) {
    await tap('[data-testid=crucible-melt-map]');
    await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 }).catch(() => {});
    const ok = await waitFor('[data-testid=pick-crosshair]', 30000);
    check('the map shows crosshairs on the plots you can melt', ok);
    if (ok) {
      await page.waitForTimeout(2500);
      // nudge the map a little, as a finger does, then tap the crosshair for real
      await page.evaluate(() => window.__landvasMap?.panBy([3, 2], { duration: 0 }));
      await page.waitForTimeout(400);
      const cross = page.locator('[data-testid=pick-crosshair]').first();
      const b = await cross.boundingBox();
      if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      check('…a real tap on one picks it', await waitFor('[data-testid=pick-use]', 6000));
      await shot('05-picked-on-map');
    }
  } else check('the Crucible has "pick on the map"', false);
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
