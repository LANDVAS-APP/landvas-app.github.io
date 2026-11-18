// 🫙 Déjà Vu (local-mode build, a phone and the web):
//  - its page shows the jar; what's happening near you floats above it (a Golden Hour, a falling star, the Hot Zone)
//  - catch one: "Catch it", then twist the lid shut (taps round the rim) — it drifts inside the jar
//  - uncork: a Golden Hour starts again; a falling star pays; an uncorked Hot Zone is placed on the map and burns there
//  - the Grimoire, the Magic hub and the Handbook know it (21 kinds)
// Run: npm run build:artifact && node tests/e2e/dejavu.mjs [app|web]
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-dejavu'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4371;
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
  const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
  const refresh = () => page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
  const count = (sel) => page.locator(sel).count();
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
  /** catch a live moment of this kind: "Catch it", then twist the lid (four taps round the rim) */
  const catchIt = async (t) => {
    const row = page.locator('[data-testid=dv-live] .lv-dv-item', { hasText: t }).first();
    await row.locator('[data-testid=dv-catch]').click();
    if (!(await waitFor('[data-testid=dv-twist]', 8000))) return false;
    // (badge toasts can sit over the top of the screen: bring the rim to the middle first)
    await page.locator('[data-testid=dv-twist]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    for (let i = 0; i < 4; i++) { await page.locator('[data-testid=dv-twist]').click({ force: true }); await page.waitForTimeout(160); }
    return page.waitForSelector('[data-testid=dv-twist]', { state: 'detached', timeout: 10000 }).then(() => true, () => false);
  };
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `dv_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `dv_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    const pt = `(select id from plot_types limit 1)`;
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + k * 3, ${by}, '${me}', ${pt}, 'rare', now() - interval '2 days' from generate_series(0, 3) k on conflict (gx, gy) do nothing`);
    const jar = (await api('admin.giveEnchantment', me, 'dejavu', 'e2e: déjà vu', { gx: bx + 1, gy: by })).id;
    const ex = cellCenter(bx, by + 2);
    await sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at) values ('${me}', 'manual', ${ex[0]}, ${ex[1]}, ${ex[0]}, ${ex[1]}, now()) on conflict (player_id) do update set mode = 'manual', lng = excluded.lng, lat = excluded.lat`);
    // happening near you: your Golden Hour and a falling star
    await sql(`insert into enchant_buffs (player_id, kind, mult, uses, data, expires_at) values ('${me}', 'golden_hour', 2, 3, '{}'::jsonb, now() + interval '1 day')`);
    await sql(`insert into rarity_spots (kind, gx, gy, data, expires_at) values ('star', ${bx + 20}, ${by + 20}, '{"shower": "e2e"}'::jsonb, now() + interval '30 minutes')`);
    await refresh();
    await nav(`/grimoire/${jar}`);
    ok('its page shows the jar', await waitFor('[data-testid=dejavu-scene]') && await waitFor('[data-testid=dv-jar]'));
    ok('…what’s happening near you floats above it, ready to catch', await waitFor('[data-testid=dv-wisp]') && (await count('[data-testid=dv-live] [data-testid=dv-catch]')) === 2,
      `${await count('[data-testid=dv-wisp]')} wisps`);
    await page.locator('[data-testid=dejavu-scene]').scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await shot('01-jar-and-wisps');
    ok('catch the Golden Hour: twist the lid shut', await catchIt('Golden Hour'));
    ok('…it drifts inside the jar, and the Golden Hour stops for now', await waitFor('[data-testid=dv-mote]', 10000)
      && (await sql(`select count(*)::int n from enchant_buffs where player_id = '${me}' and kind = 'golden_hour'`))[0].n === 0);
    await page.waitForTimeout(700); await shot('02-caught');
    ok('catch the falling star too', await catchIt('falling star'));
    ok('…two moments in the jar (2/3)', (await count('[data-testid=dv-moment]')) === 2 && /2\/3/.test(await text('[data-testid=dv-count]')), await text('[data-testid=dv-count]'));
    await page.locator('[data-testid=dv-shelf]').scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await shot('03-shelf');
    // uncork the Golden Hour
    const flashed = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid=dv-flash]')?.textContent ?? ''), re.source, { timeout: 12000 }).then(() => true, () => false);
    await page.waitForTimeout(2400); // (the last catch's line fades first)
    await page.locator('[data-testid=dv-moment][data-t=golden] [data-testid=dv-uncork]').click();
    ok('uncork the Golden Hour: it starts again', await flashed(/Golden Hour again/)
      && (await sql(`select uses from enchant_buffs where player_id = '${me}' and kind = 'golden_hour'`))[0]?.uses === 3, await text('[data-testid=dv-flash]'));
    await page.waitForTimeout(400); await shot('04-golden-again');
    await page.waitForTimeout(3400);
    await page.locator('[data-testid=dv-moment][data-t=star] [data-testid=dv-uncork]').click();
    ok('uncork the star: stars fall into your hand', await flashed(/stars fell/), await text('[data-testid=dv-flash]'));
    // a Hot Zone moment, placed on the map
    await sql(`update enchantments set state = state || jsonb_build_object('jar', jsonb_build_array(jsonb_build_object('i', 50, 't', 'hotzone', 'src', 'e2e-hot', 'from', 'Portland', 'd', '{}'::jsonb, 'at', extract(epoch from now()) - 86400, 's0', 1))) where id = '${jar}'`);
    await refresh(); await page.waitForTimeout(1500);
    ok('a Hot Zone in the jar shows how strong it still is', /\d+% strength/.test(await text('[data-testid=dv-moment][data-t=hotzone]')), (await text('[data-testid=dv-moment][data-t=hotzone]')).slice(0, 80));
    await page.locator('[data-testid=dv-moment][data-t=hotzone] [data-testid=dv-uncork]').click();
    ok('…uncork it: the map opens to place it', await waitFor('[data-testid=pick-card]', 20000), (await text('[data-testid=pick-card]')).slice(0, 100));
    await page.waitForTimeout(800); await shot('05-place-on-map');
    const tapped = await tapCell(bx + 6, by + 30);
    ok('…tap a spot near you and come back', await waitFor('[data-testid=dejavu-scene]', 15000), tapped ? '' : '(the pick sheet was slow)');
    ok('…it burns there as a Déjà Vu zone', await waitFor('[data-testid=dv-zones]', 15000) && /Déjà Vu zone — ultras ×/.test(await text('[data-testid=dv-zones]')), await text('[data-testid=dv-zones]'));
    const z = (await sql(`select state -> 'zones' -> 0 z from enchantments where id = '${jar}'`))[0]?.z;
    ok('…where you tapped', z && Math.abs(z.gx - (bx + 6)) <= 1 && Math.abs(z.gy - (by + 30)) <= 1, JSON.stringify(z && { gx: z.gx - bx, gy: z.gy - by, um: z.um }));
    await page.locator('[data-testid=dv-zones]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await shot('06-zone');
    // on the map
    const [zl, zt] = cellCenter(bx + 6, by + 30);
    await nav('/world'); await page.waitForTimeout(1500);
    await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; m?.stop(); m?.jumpTo({ center: [lng, lat], zoom: 16 }); }, [zl, zt]);
    ok('the map shows it', await waitFor('[data-testid=map-echo]', 25000));
    await page.waitForTimeout(2500);
    await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; m?.stop(); m?.jumpTo({ center: [lng, lat], zoom: 15.6 }); }, [zl, zt]);
    await page.waitForTimeout(1500);
    const ring = await page.evaluate(() => { const m = window.__landvasMap; const s = m?.getSource('lv-echoes'); return { layer: !!m?.getLayer('lv-echoes-line'), n: s?._data?.features?.length ?? (s?.serialize?.().data?.features?.length ?? -1), styled: m?.isStyleLoaded(), suns: !!m?.getLayer('lv-suns-fill'), layers: m?.getStyle()?.layers?.length }; });
    ok('…as a ring on the map', ring.layer && ring.n === 1, JSON.stringify(ring));
    await shot('07-map-echo');
    // the rest of the game knows it
    // (the Magic hub is the app's own page; the website has the Grimoire)
    await nav(app ? '/magic' : '/grimoire'); await page.waitForTimeout(1500);
    ok(app ? 'the Magic hub lists it' : 'the Grimoire lists it', /Déjà Vu/.test(await page.locator('body').textContent()));
    await nav('/handbook/enchant'); await page.waitForTimeout(1500);
    ok('the Handbook lists it', /Déjà Vu/.test(await page.locator('body').textContent()));
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check(tag('run completed'), false, e.message.split('\n')[0]);
    await shot('99-err');
  } finally {
    await ctx.close();
  }
}
for (const m of process.argv[2] ? [process.argv[2]] : ['app', 'web']) await run(m);
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
