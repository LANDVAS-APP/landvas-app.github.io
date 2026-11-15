// The Ultra Expansion, in a real browser: the Legend's new sections, the Primordials page and the Fusion Lab; a
// Primordial living on the map (for everyone) and a Volcano's obsidian (for its owner); shooting stars you catch on the
// map; the shockwave when someone gets a Primordial; a plot's power page (a Throne's rule, a Sunspot placed on the
// map, an 11:11 wish and its banner); a Solar and a Lunar fused into an Eclipse; someone else's Void Gate stepped
// through from its plot panel. On the website, then in the app's own skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/ultra-expansion.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-ultra-expansion'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4361;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
let browser = null;
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const cellCenter = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / GRID); return [((gx + 0.5) / GRID) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]; };
const DENVER = { lng: -104.99, lat: 39.74 };
const PARTS = process.env.E2E_PART ? process.env.E2E_PART.split(',') : null;
const part = (n) => !PARTS || PARTS.includes(n);

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({
    ...(app ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 }),
    colorScheme: 'dark', timezoneId: 'UTC',
    ...(app ? {} : { geolocation: { latitude: DENVER.lat, longitude: DENVER.lng, accuracy: 8 }, permissions: ['geolocation'] }),
  });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  const ok = (n, v, x) => check(`${mode}: ${n}`, v, x);
  const shot = (n) => (process.env.E2E_NOSHOTS ? Promise.resolve() : page.screenshot({ path: `${OUT}/${mode}-${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n)));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
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
  const fresh = (key) => page.evaluate((k) => window.__landvasQc.invalidateQueries({ queryKey: k }), key);
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
  const tap = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); await page.locator(sel).first().click({ force: true }); };
  const seeOnMap = async (gx, gy, sel, zoom = 18.5) => {
    await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 });
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(1200);
      await page.evaluate(([lng, lat, z]) => { const m = window.__landvasMap; m.stop(); m.jumpTo({ center: [lng, lat], zoom: z }); }, [...cellCenter(gx, gy), zoom - i * 0.4]);
      if (await waitFor(sel, 10000)) return true;
    }
    return false;
  };
  const tapCell = async (gx, gy) => {
    await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 });
    const [lng, lat] = cellCenter(gx, gy);
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(1200);
      await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; m.stop(); m.jumpTo({ center: [lng, lat], zoom: 19.5 }); }, [lng, lat]);
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
    await page.fill('#email', `ux_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `ux_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
    await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
    const [bx, by] = cellAt(DENVER.lng, DENVER.lat);
    const pt = `(select id from plot_types order by sort limit 1)`;
    const put = (dx, dy, r, uid = me) => sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (${bx + dx}, ${by + dy}, '${uid}', ${pt}, '${r}', now() - interval '2 days')
      on conflict (gx, gy) do update set owner_id = excluded.owner_id, rarity = excluded.rarity, claimed_at = excluded.claimed_at`);
    const groups = async (uid = me) => { await sql(`select private.create_group_with_cells('${uid}', jsonb_build_array(jsonb_build_array(w.gx, w.gy)), private.empty_manifest(), null, 'initial') from world_plots w where w.owner_id = '${uid}' and not exists (select 1 from canvas_group_members m where m.gx = w.gx and m.gy = w.gy)`); };
    // someone else
    const pia = (await sql(`insert into auth.users (email) values ('pia_ux_${mode}@example.test') returning id`))[0].id;
    const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
    await as(pia, 'complete_onboarding', { p_username: `pia_ux_${mode}`, p_accept_terms_version: terms });
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${pia}'`);
    for (const [dx, dy, r] of [[0, 0, 'common'], [4, 0, 'volcano'], [8, 0, 'throne_ink'], [12, 0, 'sunspot'], [16, 0, 'eleven'], [20, 0, 'fallen_star'], [24, 0, 'solar'], [28, 0, 'lunar'], [2, 6, 'rare']]) await put(dx, dy, r);
    await put(30, 30, 'void_gate', pia);
    await groups(); await groups(pia);
    for (const [dx, dy] of [[4, 0], [8, 0], [12, 0], [16, 0], [20, 0], [30, 30]]) await sql(`select private.rx_sync(${bx + dx}, ${by + dy})`);
    await fresh(['my-plots']); await fresh(['my-powers']);

    // ---- the Legend, the Primordials, the Fusion Lab ----
    if (part('pages')) {
      await nav('/legend');
      ok('the Legend has the fusions and the Primordials', await waitFor('[data-testid=legend-primordials]') && (await page.locator('[data-testid=legend-fusions] [data-testid^=legend-]').count()) >= 7);
      await nav('/primordials');
      ok('the Primordials page lists all nineteen, with their odds', await waitFor('[data-testid=prim-list]') && await page.waitForFunction(() => document.querySelectorAll('[data-testid=prim-list] > article').length === 19, null, { timeout: 15000 }).then(() => true, () => false)
        && /1 in [\d,]{9,}/.test((await text('[data-testid=prim-loom]')) ?? ''));
      ok('…and yours, with what’s ready', await waitFor('[data-testid=prim-mine-row]') && (await page.locator('[data-testid=prim-ready]').count()) >= 1);
      await shot('01-primordials');
      await nav('/fusion');
      ok('the Fusion Lab: the recipe book (two secrets) and your ultras', await waitFor('[data-testid=recipe-eclipse]') && (await page.locator('[data-testid=recipe-secret]').count()) === 2 && (await page.locator('[data-testid=fusion-ultra]').count()) >= 3);
    }

    // ---- a Primordial on the map (for everyone), a Volcano's obsidian (for its owner), shooting stars ----
    if (part('map')) {
      await sql(`update rarity_powers set next_at = now() - interval '1 second' where gx = ${bx + 4} and gy = ${by}`);
      await sql(`select private.rx_tick()`);
      const lava = (await sql(`select count(*)::int n from rarity_spots where kind = 'obsidian' and owner_id = '${me}'`))[0].n;
      await nav('/world');
      ok('a Primordial lives on its plot on the map', await seeOnMap(bx + 8, by, '[data-testid=map-primordial][data-rarity=throne_ink]', 18));
      await fresh(['rarity-map']); await page.waitForTimeout(2500);
      const feats = await page.evaluate(() => { const s = window.__landvasMap.getSource('lvrx-src'); const d = s?.serialize?.().data; return d?.features?.length ?? 0; });
      ok('your Volcano’s obsidian is drawn on your map', lava > 0 && feats >= lava, `${feats} features, ${lava} spots`);
      await shot('02-map');
      await as(me, 'rarity_act', { p_gx: bx + 20, p_gy: by, p_action: 'shower', p_args: {} });
      await fresh(['rarity-map']);
      const star = (await sql(`select gx, gy from rarity_spots where kind = 'star' order by id limit 1`))[0];
      ok('shooting stars fall on the map', await seeOnMap(star.gx, star.gy, '[data-testid=map-star]', 16.5));
      const before = (await sql(`select count(*)::int n from rarity_visits where kind = 'star'`))[0].n;
      // (the one in view: the shower is spread over a couple of km)
      await page.evaluate(() => { const els = [...document.querySelectorAll('[data-testid=map-star]')]; const v = els.find((e) => { const b = e.getBoundingClientRect(); return b.top > 0 && b.left > 0 && b.bottom < innerHeight && b.right < innerWidth; }) ?? els[0]; v.click(); });
      ok('…and you catch one', await page.waitForFunction(() => /Caught/.test(document.body.textContent ?? ''), null, { timeout: 8000 }).then(() => true, () => false)
        && (await sql(`select count(*)::int n from rarity_visits where kind = 'star'`))[0].n === before + 1);
      // someone gets a Primordial: the shockwave
      await sql(`update world_plots set rarity = 'loom' where gx = ${bx + 30} and gy = ${by + 30}`);
      const shocked = await page.waitForFunction(() => !!document.querySelector('.lvrx-shock'), null, { timeout: 20000, polling: 200 }).then(() => true, () => false);
      ok('a Primordial comes into the world: every map feels the shockwave', shocked);
      ok('…and hears who and where', await page.waitForFunction(() => /just rolled a Primordial/.test(document.body.textContent ?? ''), null, { timeout: 5000, polling: 200 }).then(() => true, () => false));
      await shot('03-shockwave');
      await sql(`update world_plots set rarity = 'void_gate' where gx = ${bx + 30} and gy = ${by + 30}`);
      await sql(`select private.rx_sync(${bx + 30}, ${by + 30})`);
    }

    // ---- a power page: a Throne's rule, a Sunspot on the map, an 11:11 wish ----
    if (part('powers')) {
      await nav(`/powers/${bx + 8}_${by}`);
      ok('a Primordial’s power page', await waitFor('[data-testid=powers-hero]') && /Primordial/i.test((await text('[data-testid=powers-tier]')) ?? ''));
      await tap('[data-testid=powers-act-decree]');
      await tap('[data-testid=rule-minigames]');
      ok('…a Throne sets the week’s rule', await waitFor('[data-testid=powers-result]', 8000) && /golden week/i.test((await text('[data-testid=powers-result]')) ?? '')
        && (await sql(`select state->>'rule' r from rarity_powers where gx = ${bx + 8} and gy = ${by}`))[0].r === 'minigames');
      await shot('04-throne');
      await nav(`/powers/${bx + 12}_${by}`);
      await waitFor('[data-testid=powers-act-place]');
      await tap('[data-testid=powers-act-place]');
      const placed = await tapCell(bx + 200, by + 40);
      ok('a Sunspot is placed by tapping anywhere on the map', placed && await waitFor('[data-testid=powers-result]', 10000)
        && (await sql(`select (state->'zone'->>'gx')::int gx from rarity_powers where gx = ${bx + 12} and gy = ${by}`))[0].gx === bx + 200);
      await nav(`/powers/${bx + 16}_${by}`);
      await waitFor('[data-testid=powers-act-tz]');
      await tap('[data-testid=powers-act-tz]'); await tap('[data-testid=tz-set]');
      ok('Eleven-Eleven: your time zone is set, and the clock counts to 11:11', await waitFor('[data-testid=eleven-next]', 8000));
      const off = (await sql(`select extract(epoch from (date_trunc('day', now() at time zone 'UTC') + time '11:11:03') - (now() at time zone 'UTC'))::float8 s`))[0].s;
      await sql(`update game_config set value = value || jsonb_build_object('clock_shift_s', ${off}) where key = 'rarity_powers'`);
      await nav('/primordials'); await fresh(['my-powers']); await fresh(['my-plots']);
      ok('at 11:11 a banner says it’s time to wish, anywhere in the game', await waitFor('[data-testid=eleven-banner]', 15000));
      await shot('05-eleven-banner');
      await nav(`/powers/${bx + 16}_${by}`); await fresh(['rarity-power']);
      ok('…the clock lights up', await page.waitForSelector('[data-testid=powers-eleven][data-open=true]', { timeout: 10000 }).then(() => true, () => false));
      await tap('[data-testid=powers-act-wish]'); await tap('[data-testid=wish-ink]');
      ok('…and the wish is granted', await waitFor('[data-testid=powers-result]', 8000) && /Wish granted/.test((await text('[data-testid=powers-result]')) ?? ''));
      await shot('06-wish');
      await sql(`update game_config set value = value || '{"clock_shift_s": 0}' where key = 'rarity_powers'`);
    }

    // ---- a Solar and a Lunar become an Eclipse ----
    if (part('fusion')) {
      await nav('/fusion'); await fresh(['fusion-book']);
      await waitFor('[data-testid=fusion-ultra][data-rarity=solar]');
      await tap('[data-testid=fusion-ultra][data-rarity=solar]'); await tap('[data-testid=fusion-ultra][data-rarity=lunar]');
      ok('the Lab previews the recipe: an Eclipse', await waitFor('[data-testid=fusion-preview]') && /Eclipse/.test((await text('[data-testid=fusion-preview]')) ?? ''));
      await tap('[data-testid=fusion-go]'); await tap('[data-testid=fusion-confirm-go]');
      ok('…fused', await waitFor('[data-testid=fusion-made]', 10000) && /Eclipse/.test((await text('[data-testid=fusion-made-name]')) ?? '')
        && (await sql(`select rarity from world_plots where gx = ${bx + 24} and gy = ${by}`))[0].rarity === 'eclipse'
        && (await sql(`select owner_id from world_plots where gx = ${bx + 28} and gy = ${by}`))[0].owner_id === null);
      await shot('07-fused');
      await page.mouse.click(8, 8); await page.waitForTimeout(400);
    }

    // ---- someone else's Void Gate, from its plot panel ----
    if (part('gate')) {
      const h = (await sql(`select private.rx_solar_h(${bx + 30}) h`))[0].h;
      await sql(`update game_config set value = jsonb_set(value, '{void_gate,open_h}', to_jsonb(floor(${h})::int)) where key = 'rarity_powers'`);
      await nav('/world');
      await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 });
      await page.evaluate(([gx, gy]) => window.__landvasUi.getState().select({ gx, gy }), [bx + 30, by + 30]);
      ok('someone else’s Void Gate shows its power in the plot panel', await waitFor('[data-testid=plot-power][data-rarity=void_gate]', 15000));
      await page.evaluate(() => document.querySelector('[data-testid=plot-power-step]')?.click());
      ok('…and you step through for a roll ticket', await page.waitForFunction(() => /Through the gate/.test(document.body.textContent ?? ''), null, { timeout: 8000 }).then(() => true, () => false)
        && (await sql(`select count(*)::int n from roll_tickets where player_id = '${me}' and source = 'void_gate'`))[0].n === 1);
      await shot('08-gate');
    }

    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    ok('nothing wider than the screen', wide <= 0, `${wide}px`);
    if (app) ok('the app wears its own skin (html.native)', await page.evaluate(() => document.documentElement.classList.contains('native')));
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check(`${mode}: run completed`, false, e.message.split('\n')[0]);
    await shot('99-err');
  } finally {
    await ctx.close();
  }
}

try {
  for (const m of (process.env.E2E_ONLY ? [process.env.E2E_ONLY] : ['web', 'app'])) {
    browser = await launch().catch(async (e) => { console.log(`(launch failed: ${String(e?.message ?? e).split('\n')[0]} — once more)`); await new Promise((r) => setTimeout(r, 3000)); return launch(); })
      .catch((e) => { check(`${m}: browser launched`, false, String(e?.message ?? e).split('\n')[0]); return null; });
    if (!browser) continue;
    await run(m).catch((e) => check(`${m}: started`, false, String(e?.message ?? e).split('\n')[0]));
    await browser.close().catch(() => {}); browser = null;
  }
} finally {
  await browser?.close().catch(() => {}); server.close();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
