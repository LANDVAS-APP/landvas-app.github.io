// The Pocket Sun, the Dowsing Rod and the Storm Coil — more Splice charges, the Traits you use, and the enchantment
// badges — in a real browser: buy and crack spare charges in the Splice; light a Pocket Sun, rub it white-hot, see it on
// the map and fire a Solar Flare; tune a Dowsing Rod on its dial and watch a roll get dowsed; crack a Golden Trait's egg;
// open the Grimoire's Badges; crank a Storm Coil, call the storm, catch a bolt, watch it on the map, and see the storm
// pass — on the website, then in the app's own premium skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/serpent-flask-storm.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-serpent-flask-storm'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4351;
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
    await page.fill('#email', `sfs_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `sfs_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    await page.evaluate(() => { const a = window.__landvasApi, f = a.enchantAct; window.__actLog = [];
      a.enchantAct = async (...x) => { try { const r = await f(...x); window.__actLog.push(['ok', x[1], JSON.stringify(r?.result ?? null).slice(0, 60)]); return r; } catch (e) { window.__actLog.push(['err', x[1], String(e?.message ?? e)]); throw e; } }; });
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:sfs:ink')`);
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    const pt = `(select id from plot_types limit 1)`;
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + (k % 4) * 3, ${by} + (k / 4) * 3, '${me}', ${pt}, 'rare', now() - interval '2 days' from generate_series(0, 11) k on conflict (gx, gy) do nothing`);
    const pia = (await sql(`insert into auth.users (email) values ('pia_sfs_${mode}@example.test') returning id`))[0].id;
    const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
    await as(pia, 'complete_onboarding', { p_username: `pia_sfs_${mode}`, p_accept_terms_version: terms });
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${pia}'`);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + 20 + k * 3, ${by} + 6, '${pia}', ${pt}, 'rare', now() - interval '2 days' from generate_series(0, 3) k on conflict (gx, gy) do nothing`);
    await sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}' where key = 'enchantments'`);
    await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
    const give = async (kind, dx, dy) => (await api('admin.giveEnchantment', me, kind, 'e2e: serpent flask storm', { gx: bx + dx, gy: by + dy })).id;
    const ids = {};
    for (const [i, k] of ['splice', 'goose', 'genie', 'clockwork', 'shard', 'map', 'sun', 'rod', 'stormcoil'].entries()) ids[k] = await give(k, 1 + (i % 4) * 3, 1 + Math.floor(i / 4) * 3);
    ok('the owner gives one of each new kind', ['sun', 'rod', 'stormcoil'].every((k) => !!ids[k]));
    const recharge = () => sql(`update enchantments set state = state || jsonb_build_object('charges', 2, 'charge_at', extract(epoch from now())) where id = '${ids.splice}'`);

    // ---- 🧪 the Splice: more charges ----
    await sql(`update enchantments set state = state || '{"charges": 0, "bonus": 0}' where id = '${ids.splice}'`);
    await sql(`insert into inkborn_eggs (owner_id, kind, shell, genome, parents, hatch_at) values ('${me}', 'starry', '{"a": "#fff"}', '{"mood": "playful"}', '[]', now())`);
    await nav(`/grimoire/${ids.splice}`);
    ok('Splice: the “More charges” panel is there', await waitFor('[data-testid=splice-more]'));
    await page.click('[data-testid=splice-more] > button'); await page.waitForTimeout(400);
    ok('…it explains the lab, the shop and the eggs', /Lab tier 1/.test(await text('[data-testid=splice-more]')) && await visible('[data-testid=splice-buy]') && await visible('[data-testid=splice-egg]'));
    await page.locator('[data-testid=splice-more]').scrollIntoViewIfNeeded(); await shot('01-splice-more');
    await page.click('[data-testid=splice-buy]'); await page.waitForTimeout(1200);
    ok('…buy a spare charge for 300 Ink', /\+ 1 spare/.test(await text('[data-testid=splice-charges]')), await text('[data-testid=splice-charges]'));
    await page.click('[data-testid=splice-egg]'); await page.waitForTimeout(1200);
    ok('…crack an egg for another', /\+ 2 spare/.test(await text('[data-testid=splice-charges]')), await text('[data-testid=splice-charges]'));
    await shot('02-splice-spares');

    // ---- ☀️ Pocket Sun ----
    await nav(`/grimoire/${ids.sun}`);
    ok('Pocket Sun: the orb renders, ready to light', await waitFor('[data-testid=sun-scene]') && /Ready to light/.test(await text('[data-testid=sun-status]')));
    await page.waitForTimeout(700); await shot('03-sun-ready');
    await page.click('[data-testid=sun-throw]');
    ok('…throw it: the map opens with its reach', await waitFor('[data-testid=pick-card]', 20000));
    const tapped = await tapCell(bx + 2, by + 2);
    ok('…tap a spot by your plots and come back', await waitFor('[data-testid=sun-scene]', 15000), tapped ? '' : '(the pick sheet was slow)');
    ok('…it lights: a Warm zone, burning', await waitFor('[data-testid=sun-heat]', 20000) && /Burning/.test(await text('[data-testid=sun-status]')), await text('[data-testid=sun-status]'));
    await page.waitForTimeout(1200); await shot('04-sun-lit');
    // rub the orb (a drag back and forth)
    await page.locator('[data-testid=sun-orb]').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const ob = await page.locator('[data-testid=sun-orb]').boundingBox();
    await sql(`update game_config set value = value || '{"sun": {"snuff_pct": 0}}' where key = 'enchantments'`);
    for (let round = 0; round < 3; round++) {
      await page.mouse.move(ob.x + ob.width * 0.25, ob.y + ob.height / 2); await page.mouse.down();
      for (let i = 0; i < 24; i++) { await page.mouse.move(ob.x + ob.width * (i % 2 ? 0.8 : 0.2), ob.y + ob.height * (0.4 + (i % 3) * 0.1), { steps: 3 }); }
      await page.mouse.up(); await page.waitForTimeout(1200);
    }
    const heat = (await sql(`select (state -> 'zones' -> 0 ->> 'heat')::numeric h from enchantments where id = '${ids.sun}'`))[0]?.h;
    ok('…rub it: it stokes hotter', Number(heat) >= 70, `heat ${heat}`);
    await shot('05-sun-stoked');
    // the Solar Flare: aim, then tap as the ring closes (1.6 s, the server keeps time)
    await page.click('[data-testid=sun-aim]');
    ok('…aim the flare: a ring closes in', await waitFor('[data-testid=sun-flare-tap]', 5000));
    await page.waitForTimeout(1450);
    await page.locator('[data-testid=sun-flare-tap]').dispatchEvent('click').catch(() => {});
    ok('…tap as it meets the corona: graded', await waitFor('[data-testid=sun-grade]', 6000), await text('[data-testid=sun-grade]'));
    await page.waitForTimeout(400); await shot('06-sun-flare');
    await page.waitForTimeout(2600);
    await page.click('[data-testid=sun-map]');
    ok('…“See it on the map”: your sun burns over the zone', await waitFor('[data-testid=map-sun]', 30000));
    await page.waitForTimeout(2500); await shot('07-sun-map');

    // ---- 🪄 Dowsing Rod ----
    await nav(`/grimoire/${ids.rod}`);
    ok('Dowsing Rod: the rod and the dial render', await waitFor('[data-testid=rod-scene]') && await waitFor('[data-testid=rod-dial]'));
    await page.locator('[data-testid=rod-pick][data-id=legendary]').click(); await page.waitForTimeout(200);
    await page.click('[data-testid=rod-tune]'); await page.waitForTimeout(1500);
    ok('…tune it to Legendary: the odds and the depth show', await waitFor('[data-testid=rod-depth]') && /Legendary/.test(await text('[data-testid=rod-target]')), await text('[data-testid=rod-target]'));
    await shot('08-rod-tuned');
    // one roll short of full depth, then a claim
    const need = (await sql(`select private.rod_need(e, 'rarity', 'legendary') n from enchantments e where id = '${ids.rod}'`))[0].n;
    await sql(`update enchantments set state = jsonb_set(state, '{targets,0,depth}', to_jsonb(${need - 1})) where id = '${ids.rod}'`);
    const claimed = await as(me, 'acquire_plot', { p_gx: bx + 40, p_gy: by + 40, p_idempotency_key: `e2e-rod-${mode}-0000001` });
    ok('…at full depth the roll IS the target', claimed?.rarity === 'legendary' && claimed?.dowsed?.[0]?.result === 'forced', `${claimed?.rarity} ${JSON.stringify(claimed?.dowsed)}`);
    await refresh(); await nav(`/grimoire/${ids.rod}`);
    ok('…and the rod says so', /Dowsed: Legendary/.test(await text('[data-testid=rod-last]')), await text('[data-testid=rod-last]'));
    await shot('09-rod-dowsed');

    // ---- 🪿 a Golden Trait: crack its egg ----
    await recharge();
    await api('enchantAct', ids.splice, 'splice', { mode: 'graft', a: ids.genie, b: ids.goose });
    await nav(`/grimoire/${ids.genie}?s=traits`);
    ok('Golden on a Genie: the golden egg sits on its page', await waitFor('[data-testid=ench-golden-egg]'));
    const w0 = (await sql(`select (private.genie_eval(e, now())) ->> 'wishes' w from enchantments e where id = '${ids.genie}'`))[0].w;
    // (the egg bobs: no waiting for it to hold still)
    await page.locator('[data-testid=ench-golden-egg]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.locator('[data-testid=ench-golden-egg]').dispatchEvent('click'); await page.waitForTimeout(1800);
    const w1 = (await sql(`select (private.genie_eval(e, now())) ->> 'wishes' w from enchantments e where id = '${ids.genie}'`))[0].w;
    ok('…crack it: a free wish', Number(w1) === Number(w0) + 1 && /a wish/.test(await text('[data-testid=ench-golden]')), `${w0} → ${w1}`);
    await shot('10-golden-egg');
    await api('enchantAct', ids.genie, 'separate', {}).catch(() => null);

    // ---- 🏅 the Grimoire's Badges ----
    await nav('/grimoire?tab=badges');
    ok('the Grimoire’s Badges: every enchantment badge, grouped', await waitFor('[data-testid=grimoire-badges]') && (await page.locator('[data-testid=grimoire-badge]').count()) >= 100);
    ok('…some are already yours', (await page.locator('[data-testid=grimoire-badge][data-got]').count()) >= 2);
    await shot('11-badges');

    // ---- ⚡ Storm Coil ----
    await recharge();
    await api('enchantAct', ids.splice, 'unsplice', {}).catch(() => null);
    await sql(`select private.ench_settle('${ids.goose}')`);
    await recharge();
    await api('enchantAct', ids.splice, 'splice', { mode: 'swap', a: ids.shard, b: ids.map });
    await nav(`/grimoire/${ids.stormcoil}`);
    ok('Storm Coil: the coil and the crank render', await waitFor('[data-testid=storm-crank]'));
    const before = Number((await text('[data-testid=storm-charge]')).replace(/\D/g, ''));
    await page.locator('[data-testid=storm-crank]').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const cb = await page.locator('[data-testid=storm-crank]').boundingBox();
    const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2, R = cb.width * 0.32;
    await page.mouse.move(cx + R, cy); await page.mouse.down();
    for (let a = 0; a <= 360 * 3 + 30; a += 15) { await page.mouse.move(cx + Math.cos((a * Math.PI) / 180) * R, cy + Math.sin((a * Math.PI) / 180) * R); await page.waitForTimeout(8); }
    await page.mouse.up(); await page.waitForTimeout(1200);
    const after = Number((await text('[data-testid=storm-charge]')).replace(/\D/g, ''));
    ok('…spin the crank: it charges', after >= before + 30, `${before}% → ${after}%`);
    await shot('11-storm-cranked');
    await sql(`update enchantments set state = state || '{"charge": 100}' where id = '${ids.stormcoil}'`);
    await refresh(); await page.waitForTimeout(800);
    await page.click('[data-testid=storm-call]'); await page.waitForTimeout(1200);
    ok('…CALL THE STORM: the sky goes black and the targets appear', await waitFor('[data-testid^=storm-tgt-]', 8000) && await visible('[data-testid=storm-left]'));
    // bring the first bolt on a hybrid in to land a moment from now
    const st = (await sql(`select state -> 'storm' s from enchantments where id = '${ids.stormcoil}'`))[0].s;
    const m = st.bolts.find((b) => b.kind === 'mutate');
    await sql(`update enchantments set state = jsonb_set(state, '{storm,at}', to_jsonb(extract(epoch from clock_timestamp()) - ${m.t - 0.9})) where id = '${ids.stormcoil}'`);
    await refresh();
    ok('…a ring gathers over a hybrid', await waitFor('.lv-storm-tgt.charging', 6000));
    await page.locator('.lv-storm-tgt.charging').first().dispatchEvent('pointerdown');
    ok('…tap it as it strikes: the hybrid mutates', await waitFor('.lv-storm-pop', 5000), await text('.lv-storm-pop'));
    await page.waitForTimeout(300); await shot('13-storm-caught');
    const muts = (await sql(`select state -> 'storm' -> 'mut' m from enchantments where id = '${ids.stormcoil}'`))[0].m;
    ok('…and the server mutated it', Array.isArray(muts) && muts.length === 1, JSON.stringify(muts)?.slice(0, 90));
    await page.click('[data-testid=storm-map]');
    const stormOk = await waitFor('[data-testid=map-storm]', 30000);
    ok('…“Watch it on the map”: the storm is over your plots', stormOk, stormOk ? '' : JSON.stringify(await page.evaluate(async (g) => {
      const z = window.__landvasUi.getState().view.zoom, b = window.__landvasUi.getState().bbox;
      const m = await window.__landvasApi.enchantMap2({ min_gx: b.min_gx, min_gy: b.min_gy, max_gx: b.max_gx, max_gy: b.max_gy });
      return { z, b, storms: m.storms.length, suns: m.suns.length, coil: g, n: document.querySelectorAll('[data-testid=map-storm]').length };
    }, [bx, by])));
    await page.waitForTimeout(2500); await shot('14-storm-map');
    // the storm passes
    await sql(`update enchantments set state = jsonb_set(jsonb_set(state, '{storm,until}', to_jsonb(extract(epoch from now()) - 6)), '{storm,at}', to_jsonb(extract(epoch from now()) - 190)) where id = '${ids.stormcoil}'`);
    await nav(`/grimoire/${ids.stormcoil}`); await refresh();
    ok('…it passes: what was caught is paid, and the summary shows', await waitFor('[data-testid=storm-summary]', 15000), (await text('[data-testid=storm-summary]'))?.replace(/\s+/g, ' ').slice(0, 90));
    await page.waitForTimeout(500); await shot('15-storm-summary');

    // ---- the Grimoire: the bestiary and the codex know all fifteen ----
    await nav('/grimoire?tab=bestiary');
    await page.waitForTimeout(1200);
    const bestiary = await page.evaluate(() => document.querySelector('[data-testid=grimoire-bestiary]')?.textContent ?? '');
    ok('the bestiary lists the two new kinds (and no Ouroboros or Homunculus)', /Pocket Sun/.test(bestiary) && /Dowsing Rod/.test(bestiary) && /Storm Coil/.test(bestiary) && !/Ouroboros|Homunculus/.test(bestiary));
    await shot('16-bestiary');
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    ok('nothing wider than the screen', wide <= 0, `${wide}px`);
    if (app) ok('the app wears its own skin (html.native)', await page.evaluate(() => document.documentElement.classList.contains('native')));
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check(tag('run completed'), false, e.message.split('\n')[0]);
    await shot('99-err');
  } finally {
    await ctx.close();
  }
}

try {
  for (const m of (process.env.E2E_ONLY ? [process.env.E2E_ONLY] : ['web', 'app'])) await run(m).catch((e) => check(`${m}: started`, false, String(e?.message ?? e).split('\n')[0]));
} finally {
  await browser.close(); server.close();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
