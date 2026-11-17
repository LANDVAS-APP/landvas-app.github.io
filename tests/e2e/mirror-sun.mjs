// A Mirror Shard reflecting a ☀️ Pocket Sun (local-mode build, a phone and the web):
//  - the reflected scene sits on solid glass: its words and buttons read
//  - "Throw it onto the map" works: the map opens around your explorer ("anywhere within … of your explorer"), a tap
//    lights it there — far from any of your plots — and back in the shard it burns, stokes and flares like a real one
//  - staff: the invite cards switch (Admin → Social)
// Run: npm run build:artifact && node tests/e2e/mirror-sun.mjs [app|web]
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-mirror-sun'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4357;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const PORTLAND = { lng: -122.68, lat: 45.52 };
const cellCenter = (gx, gy) => { const lng = ((gx + 0.5) / GRID) * 360 - 180; const n = Math.PI - (2 * Math.PI * (gy + 0.5)) / GRID; return [lng, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))]; };

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({
    ...(app ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 }),
    colorScheme: 'dark',
    ...(app ? {} : { geolocation: { latitude: PORTLAND.lat, longitude: PORTLAND.lng, accuracy: 8 }, permissions: ['geolocation'] }),
  });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  const tag = (n) => `${mode}: ${n}`;
  const ok = (n, v, x) => check(tag(n), v, x);
  const shot = (n) => (process.env.E2E_NOSHOTS ? Promise.resolve() : page.screenshot({ path: `${OUT}/${mode}-${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n)));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
  const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
    const keys = Object.keys(args);
    return window.__landvasBackend.db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await tx.query('set local role authenticated');
      const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      return r.rows[0]?.r;
    });
  }, [uid, fn, args]);
  const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
  const refresh = () => page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
  /** on the map (picking a spot): zoom right in on a cell and tap it, then "use" it */
  const tapCell = async (gx, gy) => {
    await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 });
    const [lng, lat] = cellCenter(gx, gy);
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(1200);
      await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; m.stop(); m.jumpTo({ center: [lng, lat], zoom: 20.5 }); }, [lng, lat]);
      await page.waitForTimeout(900);
      const pt = await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; const p = m.project([lng, lat]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, [lng, lat]);
      await page.mouse.click(pt.x, pt.y);
      if (await waitFor('[data-testid=pick-use]', 5000)) {
        await page.waitForTimeout(500);
        for (let k = 0; k < 3; k++) {
          await page.click('[data-testid=pick-use]', { force: true }).catch(() => {});
          if (await page.waitForSelector('[data-testid=pick-card]', { state: 'detached', timeout: 3000 }).then(() => true, () => false)) break;
        }
        await page.waitForTimeout(1200);
        return true;
      }
    }
    return false;
  };
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `msun_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `msun_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    const pt = `(select id from plot_types limit 1)`;
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + k * 3, ${by}, '${me}', ${pt}, 'rare', now() - interval '2 days' from generate_series(0, 3) k on conflict (gx, gy) do nothing`);
    const shard = (await api('admin.giveEnchantment', me, 'shard', 'e2e: mirror sun', { gx: bx + 1, gy: by })).id;
    // the shard reflects a Pocket Sun
    await sql(`update enchantments set state = state || jsonb_build_object('reflect', jsonb_build_object('kind', 'sun', 'dream', true, 'from', extract(epoch from now()), 'until', extract(epoch from now()) + 86400), 'r', private.ench_init('sun', now())) where id = '${shard}'`);
    // the explorer is out ~1.2 km east, far from every plot (the reach is 2 km)
    const ex = cellCenter(bx + 260, by);
    await sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at) values ('${me}', 'manual', ${ex[0]}, ${ex[1]}, ${ex[0]}, ${ex[1]}, now()) on conflict (player_id) do update set mode = 'manual', lng = excluded.lng, lat = excluded.lat`);
    await refresh();
    await nav(`/grimoire/${shard}`);
    ok('the shard shows the reflected Pocket Sun', await waitFor('[data-testid=shard-reflecting]') && await waitFor('[data-testid=sun-scene]'));
    const bg = await page.locator('[data-testid=shard-inside]').evaluate((e) => getComputedStyle(e).backgroundImage).catch(() => '');
    ok('…on solid dark glass (its words read)', /radial-gradient/.test(bg), bg.slice(0, 60));
    const btn = page.locator('[data-testid=sun-throw]');
    ok('…“Throw it onto the map” can be pressed', (await btn.isEnabled().catch(() => false)) && /Throw it onto the map/.test(await text('[data-testid=sun-throw]')));
    await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await shot('01-mirrored-sun');
    await btn.click();
    ok('…throw it: the map opens around your explorer', await waitFor('[data-testid=pick-card]', 20000) && /of your explorer/.test(await text('[data-testid=pick-card]')), (await text('[data-testid=pick-card]')).slice(0, 120));
    await page.waitForTimeout(800); await shot('02-throw-map');
    const tapped = await tapCell(bx + 270, by + 4);
    ok('…tap a spot by your explorer (no plots near) and come back', await waitFor('[data-testid=sun-scene]', 15000), tapped ? '' : '(the pick sheet was slow)');
    ok('…it lights there, burning', await waitFor('[data-testid=sun-heat]', 20000) && /Burning/.test(await text('[data-testid=sun-status]')), await text('[data-testid=sun-status]'));
    const z = (await sql(`select state -> 'r' -> 'zones' -> 0 z from enchantments where id = '${shard}'`))[0]?.z;
    ok('…the zone is where you tapped (on the shard)', z && Math.abs(z.gx - (bx + 270)) <= 1 && Math.abs(z.gy - (by + 4)) <= 1, JSON.stringify(z && { gx: z.gx - bx, gy: z.gy - by }));
    await page.waitForTimeout(1200); await shot('03-mirrored-sun-lit');
    ok('…and its other buttons work too (Solar Flare, switch, douse)', (await page.locator('[data-testid=sun-aim]').isEnabled()) && (await page.locator('[data-testid=sun-switch]').isEnabled()) && (await page.locator('[data-testid=sun-douse]').isEnabled()));
    await page.click('[data-testid=sun-switch]'); await page.waitForTimeout(1200);
    ok('…switch it to orbit', (await sql(`select state -> 'r' -> 'zones' -> 0 ->> 'mode' m from enchantments where id = '${shard}'`))[0]?.m === 'orbit');

    if (!app) {
      // ---- staff: invite cards on/off ----
      await page.evaluate(() => { location.hash = 'social'; window.__landvasNav('/admin'); }); await page.waitForTimeout(1500);
      await page.getByRole('tab', { name: /^Social/ }).click().catch(() => {});
      ok('Admin → Social: an “Invite cards” switch', await waitFor('[data-testid=ref-cards-admin]', 20000));
      await page.click('#ref-cards'); await page.waitForTimeout(300);
      await page.click('[data-testid=save-referrals]'); await page.waitForTimeout(1500);
      const v = (await sql(`select value -> 'cards' ->> 'enabled' v from game_config where key = 'referrals'`))[0].v;
      ok('…switching it off saves', v === 'false', String(v));
      await page.locator('[data-testid=ref-cards-admin]').scrollIntoViewIfNeeded(); await shot('04-admin-cards');
      await nav('/invite'); await page.waitForTimeout(2500);
      ok('…the Invite page loses its card editor', (await page.locator('[data-testid=invite-card-editor]').count()) === 0 && await waitFor('[data-testid=invite-share]', 10000));
      await sql(`update game_config set value = value - 'cards' where key = 'referrals'`); await refresh(); await page.waitForTimeout(2500);
      ok('…and back on, it’s back', await waitFor('[data-testid=invite-card-editor]', 15000));
    }
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check(tag('run completed'), false, e.message.split('\n')[0]);
    await shot('99-err');
  } finally {
    await ctx.close();
  }
}
// (node tests/e2e/mirror-sun.mjs app|web runs one)
for (const m of process.argv[2] ? [process.argv[2]] : ['app', 'web']) await run(m);
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
