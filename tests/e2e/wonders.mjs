// Wonders: the Size Ray picking a plot on the map (one giant, one a speck), a Parasite wrapped round a plot (peeled off,
// and "show me the plot it's on"), the Wormhole (trace the spiral, fly through), the Oracle Eye, every way to splice,
// and the Leviathan (the warning, the rising, the fight, the fall and its bones) — on the website, then again in the
// app's own premium skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/wonders.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-wonders'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4339;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
// E2E_MEM=1 notes the browser's memory at every check (for hunting leaks)
const mem = () => { if (!process.env.E2E_MEM) return ''; try { return ` [${Math.round(Number(execSync("ps -eo rss,args | grep -i chromium | grep -v grep | awk '{s+=$1} END {print s}'").toString()) / 1024)} MB]`; } catch { return ''; } };
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}${mem()}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const PORTLAND = { lng: -122.68, lat: 45.52 };
// E2E_PART=sizeray stops after a section (for quick runs while working on one thing)
class Stop extends Error {}
const stopAfter = (part) => { if (process.env.E2E_PART === part) throw new Stop(part); };
// E2E_SKIP=sizeray,parasite skips sections
const skip = (part) => (process.env.E2E_SKIP ?? '').split(',').includes(part);
const SALEM = { lng: -123.03, lat: 44.94 }; // ~75 km away: in a young wormhole's reach

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({
    ...(app ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 }),
    colorScheme: 'dark',
    // (the website places the explorer by GPS; the simulated app shell has no location plugin, and headless Chrome's
    // software renderer runs out of memory following a GPS explorer on a phone-sized screen)
    ...(app ? {} : { geolocation: { latitude: PORTLAND.lat, longitude: PORTLAND.lng, accuracy: 8 }, permissions: ['geolocation'] }),
  });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  const consoleLog = []; page.on('console', (m) => { if (m.type() !== 'debug') consoleLog.push(`${m.type()}: ${m.text().slice(0, 140)}`); });
  const tag = (n) => `${mode}: ${n}`;
  const ok = (n, v, x) => check(tag(n), v, x);
  const shot = (n) => (process.env.E2E_NOSHOTS ? Promise.resolve() : page.screenshot({ path: `${OUT}/${mode}-${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n)));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
  // another player acts (a second account in the same local world)
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
  // (the app has no location here, so the map asks where you are each time it opens: say "not now")
  const notNow = async () => { if (await visible('[data-testid=place-gps]')) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); } };
  const refresh = () => page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  // (like "show me on the map": stop following the explorer, then fly)
  const fly = (c, zoom) => page.evaluate(([lng, lat, zoom]) => { const ex = window.__landvasExplorer?.getState(); if (ex?.following) ex.setFollowing(false); window.__landvasUi.getState().requestFly({ lng, lat, zoom }); }, [c.lng, c.lat, zoom]);
  const centerOf = (gx, gy) => ({ lng: ((gx + 0.5) / GRID) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * (gy + 0.5)) / GRID))) });
  try {
    // ---- a new player, standing in Portland ----
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `wonder_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `wonder_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    await nav('/world');
    if (await waitFor('[data-testid=place-gps]', 15000)) { if (app) await page.keyboard.press('Escape'); else await page.click('[data-testid=place-gps]'); }
    await page.waitForTimeout(2500);
    // (every enchantment action the page makes, for the log if something goes wrong)
    await page.evaluate(() => { const a = window.__landvasApi, f = a.enchantAct; window.__actLog = [];
      a.enchantAct = async (...x) => { try { const r = await f(...x); window.__actLog.push(['ok', x[1], JSON.stringify(r?.result ?? null).slice(0, 60)]); return r; } catch (e) { window.__actLog.push(['err', x[1], String(e?.message ?? e)]); throw e; } }; });
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:wonders:ink')`);
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    const [sx, sy] = cellAt(SALEM.lng, SALEM.lat);
    const pt = `(select id from plot_types limit 1)`;
    const mine = [[0, 0, 'rare'], [4, 0, 'common'], [8, 0, 'epic'], [0, 4, 'uncommon'], [4, 4, 'common'], [12, 0, 'legendary'], [13, 0, 'legendary'], [12, 1, 'legendary'], [13, 1, 'legendary']];
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values ${mine.map(([dx, dy, r]) => `(${bx + dx}, ${by + dy}, '${me}', ${pt}, '${r}', now() - interval '2 days')`).join(', ')},
      (${sx}, ${sy}, '${me}', ${pt}, 'mythic', now() - interval '2 days') on conflict (gx, gy) do nothing`);
    // a friend next door: Pia
    const pia = (await sql(`insert into auth.users (email) values ('pia_${mode}@example.test') returning id`))[0].id;
    const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
    await as(pia, 'complete_onboarding', { p_username: `pia_${mode}`, p_accept_terms_version: terms });
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${pia}'`);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + 40 + k * 3, ${by} + 10, '${pia}', ${pt}, 'rare', now() - interval '2 days' from generate_series(0, 3) k on conflict (gx, gy) do nothing`);
    await sql(`insert into friendships (requester_id, addressee_id, status, responded_at) values ('${me}', '${pia}', 'accepted', now()) on conflict do nothing`);
    const give = async (who, kind, dx = 0, dy = 0) => (await api('admin.giveEnchantment', who, kind, 'e2e: wonders', { gx: bx + dx, gy: by + dy })).id;
    const ids = {};
    for (const k of ['sizeray', 'wormhole', 'oracle', 'splice', 'parasite', 'goose']) ids[k] = await give(me, k, 2, 8);
    const piaGoose = await give(pia, 'goose', 44, 14), piaParasite = await give(pia, 'parasite', 50, 14);
    ok('the owner gives one of each new kind', Object.values(ids).every(Boolean) && !!piaGoose && !!piaParasite);
    await sql(`update enchantments set level = 3, xp = 40 where owner_id = '${me}'`);
    // Pia's parasite leaps onto one of our plots; ours leaps onto hers
    const leapt = await as(pia, 'enchant_act', { p_id: piaParasite, p_action: 'release', p_args: {} });
    const host = leapt?.result?.host ?? (await sql(`select state -> 'host' h from enchantments where id = '${piaParasite}'`))[0].h;
    ok('Pia’s Parasite latches onto one of our plots', host?.owner === me, JSON.stringify(host)?.slice(0, 80));
    await api('enchantAct', ids.parasite, 'release', {}).catch(() => null);
    const ourHost = (await sql(`select state -> 'host' h from enchantments where id = '${ids.parasite}'`))[0].h;
    ok('…and ours latches onto one of Pia’s', ourHost?.owner === pia);
    await refresh();

    if (!skip('sizeray')) {
    // ---- 📡 Size Ray: pick a plot on the map, GROW it ----
    await sql(`update enchantments set state = state || '{"shots": 3}' where id = '${ids.sizeray}'`);
    await nav(`/grimoire/${ids.sizeray}`);
    ok('Size Ray: the scene renders', await waitFor('[data-testid=ray-scene]'));
    await page.waitForTimeout(800); await shot('01-sizeray-scene');
    ok('…with “Pick a plot on the map”', await visible('[data-testid=ray-pick-map]'));
    await page.click('[data-testid=ray-pick-map]');
    ok('…which opens the map in targeting mode', await waitFor('[data-testid=ray-targeting]'));
    ok('…your plots wear crosshairs', await waitFor('[data-testid=ray-crosshair]', 30000));
    await page.waitForTimeout(2500); await shot('02-sizeray-targeting');
    ok('…and the rest of the map is dimmed', await page.evaluate(() => document.documentElement.classList.contains('lv-targeting')));
    const fireAtPeak = () => page.evaluate(() => new Promise((res) => {
      const m = document.querySelector('[data-testid=ray-meter] > div'); let prev = 0; const t0 = performance.now();
      const f = () => {
        const x = parseFloat(((m?.style.transform || '').match(/translateX\(([\d.]+)%/) || [])[1] || '0');
        if ((x > 90 && x >= prev) || performance.now() - t0 > 5000) { const b = document.querySelector('[data-testid=ray-fire]'); const d = b?.disabled; b?.click(); res(`${x}${d ? ' (button disabled)' : ''}${b ? '' : ' (no button)'}`); return; }
        prev = x; requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }));
    const zap = async (nth, label) => {
      // (the nth crosshair that's on screen — on a phone some of your plots are off the edge)
      const onScreen = await page.evaluate(() => [...document.querySelectorAll('[data-testid=ray-crosshair]')].map((e, i) => { const r = e.getBoundingClientRect(); return { i, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })
        .filter((p) => p.x > 20 && p.x < innerWidth - 20 && p.y > 300 && p.y < innerHeight - 220));
      const pick = onScreen[Math.min(nth, onScreen.length - 1)];
      if (pick) {
        const top = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${String(e.className).slice(0, 60)} ${e.getAttribute('data-testid') ?? ''}` : 'none'; }, [pick.x, pick.y]);
        if (!/ray-crosshair|lv-crosshair/.test(top)) console.log(`(on top of the crosshair: ${top})`);
        await page.mouse.click(pick.x, pick.y);
      }
      const sheet = await waitFor('[data-testid=ray-fire-sheet]', 8000);
      await page.waitForTimeout(500); if (nth === 0) await shot(`03-sizeray-locked`);
      await page.click('[data-testid=ray-fire-sheet] [data-testid=ray-aim]');
      await waitFor('[data-testid=ray-fire-sheet] [data-testid=ray-fire]', 8000); await waitFor('[data-testid=ray-meter]', 4000);
      // (no screenshot here: the server only holds an aim for 12 seconds, and a WebGL screenshot can take longer than that)
      const x = await fireAtPeak();
      const graded = await waitFor('[data-testid=ray-grade]', 10000);
      const toasts = await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent).join(' | '));
      const log = graded ? '' : JSON.stringify(await sql(`select state -> 'aim' aim, state -> 'shots' shots, (select json_agg(json_build_array(kind, data)) from (select kind, data from enchant_events where enchant_id = '${ids.sizeray}' order by id desc limit 3) q) ev from enchantments where id = '${ids.sizeray}'`)) + ' · console: ' + consoleLog.slice(-6).join(' | ');
      if (!graded) fs.writeFileSync(`${OUT}/${mode}-diag-${label}.txt`, `needle ${x}%\ntoasts: ${toasts}\n${log}\n\n${consoleLog.join('\n')}`);
      return { sheet, graded, text: graded ? await page.textContent('[data-testid=ray-grade]') : `needle ${x}% · ${toasts} · ${log}` };
    };
    const g1 = await zap(0, 'grow');
    ok('Size Ray: tapping a crosshair locks on and opens the fire sheet', g1.sheet);
    ok('…aim, fire at the peak — graded by the server', g1.graded, g1.text?.replace(/\s+/g, ' ').slice(0, 110));
    await page.waitForTimeout(700); await shot('05-sizeray-grow-graded');
    const giant = (await sql(`select kind, gx, gy, mult, data ->> 'scale' scale from enchant_buffs where kind in ('plot_giant', 'plot_tiny') and player_id = '${me}' and expires_at > now() order by id desc limit 1`))[0];
    ok('…the plot is now 100× its size (saved)', !!giant && Number(giant.scale) === (giant.kind === 'plot_giant' ? 100 : 0.01), JSON.stringify(giant));
    await page.waitForTimeout(2600);
    const z1 = await page.evaluate(() => window.__landvasMap.getZoom());
    ok('…the camera pulls right back to show the whole giant', z1 < 17, `zoom ${z1.toFixed(1)}`);
    await page.click('[data-testid=ray-grade]').catch(() => {}); await page.waitForTimeout(500);
    await page.click('[data-testid=ray-cancel]').catch(() => {}); await page.waitForTimeout(400);
    await refresh(); await page.waitForTimeout(3500);
    const art = () => page.evaluate(() => (window.__landvasMap?.getStyle()?.layers ?? []).filter((l) => l.id.startsWith('lv-sz-')).map((l) => l.id));
    const a1 = await art();
    ok('…its own plot drawing is laid over the map, a hundred plots across', a1.some((id) => id.endsWith('_g-plots')) && a1.some((id) => id.endsWith('_g-art')), a1.join(' '));
    ok('…with its GIANT tag (or, zoomed right out on a phone, its beacon)', await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=map-giant], [data-testid=map-beacon].lv-near')].some((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none'), null, { timeout: 15000 }).then(() => true, () => false));
    await shot('06-map-giant-100x');
    // ---- SHRINK another one 100× ----
    await nav(`/grimoire/${ids.sizeray}`); await waitFor('[data-testid=ray-dial]');
    await page.locator('[data-testid=ray-dial] button').nth(1).click();
    await page.waitForTimeout(300);
    ok('the dial flips to SHRINK', (await page.getAttribute('[data-testid=ray-dial]', 'data-mode')) === 'shrink');
    await page.click('[data-testid=ray-pick-map]'); await waitFor('[data-testid=ray-crosshair]', 30000); await page.waitForTimeout(1500);
    ok('…the targeting sheet is in SHRINK too', /SHRINK|smaller|tiny/i.test(await page.textContent('[data-testid=ray-targeting]')));
    const g2 = await zap(2, 'shrink');
    ok('SHRINK: fired and graded', g2.graded, g2.text?.replace(/\s+/g, ' ').slice(0, 110));
    await page.waitForTimeout(700); await shot('07-sizeray-shrink-graded');
    await page.waitForTimeout(2600);
    await page.click('[data-testid=ray-grade]').catch(() => {}); await page.click('[data-testid=ray-cancel]').catch(() => {}); await page.waitForTimeout(500);
    const sizes = await sql(`select kind, gx, gy from enchant_buffs where kind in ('plot_giant', 'plot_tiny') and player_id = '${me}' and expires_at > now()`);
    ok('two of your plots are a different size now', sizes.length >= 2, sizes.map((s) => s.kind).join(', '));
    const tiny = sizes.find((s) => s.kind === 'plot_tiny');
    await refresh();
    if (tiny) {
      ok('…the camera dives in to find the speck', (await page.evaluate(() => window.__landvasMap.getZoom())) > 21);
      const tw = await waitFor('[data-testid=map-tiny] .lv-speck-plot', 20000) ? await page.evaluate(() => document.querySelector('[data-testid=map-tiny] .lv-speck-plot').getBoundingClientRect().width) : 0;
      const cellPx = await page.evaluate(() => 512 * 2 ** (window.__landvasMap.getZoom() - 22));
      ok('the speck shows on the map: the plot itself, a hundredth of the size', tw > 0 && Math.abs(tw - cellPx / 100) < 1.5, `${tw.toFixed(1)}px in a ${cellPx.toFixed(0)}px plot`);
      await page.waitForTimeout(2000); await shot('08-map-tiny-100x');
      await page.evaluate(([gx, gy]) => window.__landvasUi.getState().select({ gx, gy }), [tiny.gx, tiny.gy]);
      ok('…tap it: the plot panel shows it under a magnifying glass', await waitFor('[data-testid=plot-tiny] .lv-magnifier', 15000));
      await page.locator('[data-testid=plot-tiny]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await shot('08b-plot-tiny-magnifier');
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }
    // ---- 🤡 a prank: zap Pia's plot ----
    await sql(`update enchantments set state = state || jsonb_build_object('shots', 3, 'shot_at', extract(epoch from now())) where id = '${ids.sizeray}'`);
    await nav(`/grimoire/${ids.sizeray}`); await waitFor('[data-testid=ray-dial]');
    await page.click('[data-testid=ray-pick-map]'); await waitFor('[data-testid=ray-targeting]', 30000); await page.waitForTimeout(2500);
    const [px, py] = [bx + 43, by + 10];
    // (fly there, wait for the map to settle, then tap the plot itself)
    const tapPlot = async (gx, gy) => {
      await fly(centerOf(gx, gy), 19); await page.waitForTimeout(2000);
      await page.waitForFunction(() => !window.__landvasMap.isMoving(), null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(400);
      const pp = await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; const r = m.getContainer().getBoundingClientRect(); const p = m.project([lng, lat]); return { x: r.left + p.x, y: r.top + p.y }; }, [centerOf(gx, gy).lng, centerOf(gx, gy).lat]);
      await page.mouse.click(pp.x, pp.y);
    };
    await tapPlot(px, py);
    if (!(await waitFor('[data-testid=ray-prank]', 6000))) await tapPlot(px, py);
    ok('Prank: tap any plot — Pia’s says “Prank @pia!”', await waitFor('[data-testid=ray-prank]', 10000), (await page.textContent('[data-testid=ray-prank]').catch(() => ''))?.slice(0, 60));
    await page.waitForTimeout(600); await shot('09a-prank-locked');
    await page.click('[data-testid=ray-fire-sheet] [data-testid=ray-aim]');
    await waitFor('[data-testid=ray-fire-sheet] [data-testid=ray-fire]', 8000); await waitFor('[data-testid=ray-meter]', 4000);
    await fireAtPeak();
    ok('…fired: “Pranked @pia!”', await waitFor('[data-testid=ray-grade]', 10000) && /Pranked|bounced/i.test(await page.textContent('[data-testid=ray-grade]')), (await page.textContent('[data-testid=ray-grade]').catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 110));
    await page.waitForTimeout(700); await shot('09b-prank-graded');
    const pr = (await sql(`select player_id, mult, data from enchant_buffs where (data ->> 'by') = '${me}' and expires_at > now() order by id desc limit 1`))[0];
    ok('…their plot is 100× on everyone’s map, just for show (×1, they’re told)', !pr || (pr.player_id === pia && Number(pr.mult) === 1 && pr.data.prank === true), JSON.stringify(pr)?.slice(0, 120));
    await page.waitForTimeout(2600); await page.click('[data-testid=ray-grade]').catch(() => {}); await page.click('[data-testid=ray-cancel]').catch(() => {});
    await refresh(); await page.waitForTimeout(3000); await shot('09c-prank-on-map');
    // ---- …and Pia pranks us back ----
    const piaRay = await give(pia, 'sizeray', 56, 14);
    await sql(`update enchantments set state = state || jsonb_build_object('shots', 3, 'shot_at', extract(epoch from now())) where id = '${piaRay}'`);
    const victim = [bx + 4, by + 4];
    await as(pia, 'enchant_act', { p_id: piaRay, p_action: 'aim', p_args: { target: { type: 'plot', gx: victim[0], gy: victim[1], mode: 'grow' } } });
    await page.waitForTimeout(820);
    const back = await as(pia, 'enchant_act', { p_id: piaRay, p_action: 'fire', p_args: {} });
    ok('Pia zaps our plot GIANT (a prank on us)', back?.result?.prank === true || back?.result?.bounced === true, JSON.stringify(back?.result)?.slice(0, 100));
    if (back?.result?.prank) {
      await refresh();
      await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['notifications'] }));
      await notNow();
      await fly(centerOf(victim[0], victim[1]), 15.4); await page.waitForTimeout(3500); await shot('10a-pranked-by-pia-map');
      await page.evaluate(([gx, gy]) => window.__landvasUi.getState().select({ gx, gy }), victim);
      ok('…our plot panel says who pranked us, with Undo', await waitFor('[data-testid=plot-pranked] [data-testid=plot-prank-undo]', 15000));
      await page.locator('[data-testid=plot-pranked]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await shot('10b-pranked-panel');
      await page.click('[data-testid=plot-prank-undo]'); await page.waitForTimeout(1500);
      ok('…Undo puts it back to normal', Number((await sql(`select count(*) n from enchant_buffs where gx = ${victim[0]} and gy = ${victim[1]} and expires_at > now()`))[0].n) === 0);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }
    // the Grimoire lists them with time left (and a revert)
    await nav(`/grimoire/${ids.sizeray}`);
    ok('the Size Ray lists your sizes with time left', await waitFor('[data-testid=ray-sizes]'));
    await page.locator('[data-testid=ray-sizes]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await shot('09d-sizeray-sizes');

    }
    stopAfter('sizeray');
    if (!skip('parasite')) {
    // ---- 🦠 a Parasite wrapped right round one of our plots ----
    await refresh();
    await fly(centerOf(host.gx, host.gy), 19.3); await nav('/world'); await page.waitForTimeout(4000); await notNow();
    const wraps = Number(await page.getAttribute('[data-testid=parasite-wraps]', 'data-wraps').catch(() => '0'));
    ok('Parasite: it is drawn wrapped round the plot it’s on', wraps >= 1, `${wraps} wrap(s)`);
    await shot('10-map-parasite-wrap');
    await page.evaluate(([gx, gy]) => window.__landvasUi.getState().select({ gx, gy }), [host.gx, host.gy]);
    ok('…tap the plot: it says what’s wrapped round it', await waitFor('[data-testid=plot-wonders] [data-testid=peel-off]', 15000));
    await page.locator('[data-testid=peel-off]').scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await shot('11-plot-peel');
    // grab the head and drag it off, three times
    for (let i = 0; i < 3; i++) {
      const b = await page.locator('[data-testid=peel-off] .lv-peel').boundingBox();
      await page.mouse.move(b.x + b.width - 40, b.y + 34); await page.mouse.down();
      for (let s = 1; s <= 8; s++) await page.mouse.move(b.x + b.width - 40 - s * 20, b.y + 34 + s * 4);
      await page.mouse.up(); await page.waitForTimeout(350);
    }
    await page.waitForTimeout(1200);
    const freed = (await sql(`select state -> 'host' h from enchantments where id = '${piaParasite}'`))[0].h;
    ok('…peel it off: three pulls and the plot is free', freed == null || freed === null || JSON.stringify(freed) === 'null', JSON.stringify(freed)?.slice(0, 60));
    await shot('12-plot-peeled');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    // our parasite: "show me the plot it's on"
    await nav(`/grimoire/${ids.parasite}`);
    ok('our Parasite names the plot it’s feeding on', await waitFor('[data-testid=parasite-host]'));
    await page.waitForTimeout(700); await shot('13-parasite-host');
    await page.click('[data-testid=parasite-show]'); await page.waitForTimeout(4500); await notNow();
    const onMap = await visible('[data-testid=world-map]');
    const seen = await page.evaluate(([gx, gy]) => { const m = window.__landvasMap; if (!m) return -1; const c = m.getCenter(); const GRID = 4194304; const x = ((c.lng + 180) / 360) * GRID; return Math.round(Math.abs(x - gx - 0.5)); }, [ourHost.gx, ourHost.gy]);
    const wraps2 = Number(await page.getAttribute('[data-testid=parasite-wraps]', 'data-wraps').catch(() => '0'));
    ok('…“Show on map” flies there, and it’s wrapped round Pia’s plot', onMap && seen >= 0 && seen < 6 && wraps2 >= 1, `map ${onMap} · ${seen} cells off · ${wraps2} wraps`);
    await shot('14-map-our-parasite');

    }
    if (!skip('wormhole')) {
    // ---- 🌀 Wormhole: pick the far end, trace the spiral, fly through ----
    await nav(`/grimoire/${ids.wormhole}`);
    ok('Wormhole: the scene renders', await waitFor('[data-testid=wormhole-scene]'));
    await page.waitForTimeout(900); await shot('15-wormhole-shut');
    // the far end: Salem, on the radar (the blip that's tens of km away)
    const blips = page.locator('[data-testid=ray-radar] [data-testid=ray-blip]');
    const nb = await blips.count(); let km = 0;
    for (let i = 0; i < nb && km < 20; i++) {
      await blips.nth(i).click({ force: true }); await page.waitForTimeout(250);
      km = Number(((await page.textContent('[data-testid=wormhole-scene] ~ *')).match(/([\d,]+) km away/) || [])[1]?.replace(/,/g, '') ?? 0);
    }
    ok('…the far end is picked on the radar, 75-odd km away', km > 50 && km < 161, `${km} km`);
    await page.locator('[data-testid=wormhole-scene] ~ *').first().screenshot({ path: `${OUT}/${mode}-15b-wormhole-far.png` }).catch(() => {});
    await page.click('[data-testid=wormhole-open]');
    ok('…“Trace the spiral” opens the tracer', await waitFor('[data-testid=wormhole-trace]', 8000));
    await page.evaluate(() => document.querySelector('[data-testid=wormhole-trace]')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    const tb = await page.locator('[data-testid=wormhole-trace] > div').boundingBox();
    const P = (p) => { const th = p * 2.25 * Math.PI * 2, r = 46 * (1 - p) + 2; return { x: tb.x + ((50 + Math.cos(th - Math.PI / 2) * r) / 100) * tb.width, y: tb.y + ((50 + Math.sin(th - Math.PI / 2) * r) / 100) * tb.height }; };
    let p0 = P(0); await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    const traceT0 = Date.now();
    for (let i = 1; i <= 60; i++) { const p = P(i / 60); await page.mouse.move(p.x, p.y); if (i === 36) await shot('16-wormhole-tracing'); }
    console.log(`(traced in ${((Date.now() - traceT0) / 1000).toFixed(1)} s)`);
    await page.mouse.up();
    const opened = await waitFor('[data-testid=wormhole-opened]', 8000);
    ok('…traced: it OPENS', opened, opened ? (await page.textContent('[data-testid=wormhole-opened]').catch(() => ''))?.slice(0, 60) : consoleLog.filter((l) => l.includes('[enchant]')).slice(-2).join(' | '));
    await page.waitForTimeout(700); await shot('17-wormhole-open');
    ok('…and lists both ends', await waitFor('[data-testid=wormhole-ends]', 8000));
    await page.waitForTimeout(3500);
    await page.click('[data-testid=wormhole-travel]');
    ok('“Fly through”: the warp tunnel', await waitFor('[data-testid=warp-tunnel]', 4000));
    await page.waitForTimeout(700); await shot('18-warp-tunnel');
    await page.waitForTimeout(2500);
    await notNow();
    ok('…comes out on the map at the far end', await visible('[data-testid=world-map]'));
    ok('…where the wormhole’s mouth swirls on the plot', await waitFor('[data-testid=map-wormhole]', 20000));
    await page.waitForTimeout(2500); await shot('19-map-wormhole-far-end');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // the world view: an arc between the two ends
    await fly({ lng: (PORTLAND.lng + SALEM.lng) / 2, lat: (PORTLAND.lat + SALEM.lat) / 2 }, 7.6); await page.waitForTimeout(3500);
    ok('zoomed out, the wormhole is an arc across the map', await page.evaluate(() => !!window.__landvasMap?.getLayer?.('lv-worm-arc') || !!window.__landvasMap?.getStyle?.().layers.some((l) => /lv-worm/.test(l.id))));
    await shot('20-map-wormhole-arc');

    }
    stopAfter('wormhole');
    if (!skip('oracle')) {
    // ---- 👁️ Oracle Eye: gaze, flip the cards ----
    await nav(`/grimoire/${ids.oracle}`);
    ok('Oracle: the scene renders', await waitFor('[data-testid=oracle-scene]'));
    const sc = await page.locator('[data-testid=oracle-scene]').boundingBox();
    await page.mouse.move(sc.x + sc.width * 0.85, sc.y + sc.height * 0.25); await page.waitForTimeout(300); await shot('21-oracle-eye');
    await page.click('[data-testid=oracle-gaze]');
    ok('…a gaze lays out the cards of your next rolls', await waitFor('[data-testid=oracle-card]', 8000));
    await page.waitForTimeout(800);
    const cards = page.locator('[data-testid=oracle-card]'); const nc = await cards.count();
    for (let i = 0; i < nc; i++) { await cards.nth(i).click(); await page.waitForTimeout(350); }
    await page.waitForTimeout(800); await shot('22-oracle-cards');
    ok('…three cards, flipped', nc >= 3, `${nc}`);
    ok('…and the fates are saved for your real rolls', Number((await sql(`select count(*) n from private.oracle_fates where player_id = '${me}'`))[0].n) >= 1);

    }
    if (!skip('splice')) {
    // ---- 🧬 Splice: every mode, in plain words ----
    await nav(`/grimoire/${ids.splice}`);
    ok('Splice: the lab renders, with every mode', await waitFor('[data-testid=splice-modes]') && (await page.locator('[data-testid^=splice-mode-]').count()) >= 6);
    const pickK = async (k) => { await page.click(`[data-testid=splice-pick-${k}]`); await page.waitForTimeout(250); };
    const clearVials = async () => { for (const v of await page.locator('[data-testid=splice-vial]').all()) await v.click().catch(() => {}); await page.waitForTimeout(200); };
    for (const [m, picks, n] of [['chimera', ['goose', 'oracle'], '23'], ['graft', ['wormhole', 'goose'], '24'], ['trinity', ['goose', 'oracle', 'wormhole'], '25']]) {
      await page.click(`[data-testid=splice-mode-${m}]`); await page.waitForTimeout(300); await clearVials();
      for (const k of picks) await pickK(k);
      const card = await waitFor('[data-testid=hybrid-card]', 5000);
      const txt = card ? (await page.textContent('[data-testid=hybrid-card]')).replace(/\s+/g, ' ') : '';
      ok(`Splice ${m}: the card says what each side gets, in plain words`, card && /gets/i.test(txt), txt.slice(0, 110));
      await page.locator('[data-testid=hybrid-card]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300); await shot(`${n}-splice-${m}`);
    }
    await page.click('[data-testid=splice-mode-friend]'); await page.waitForTimeout(300); await clearVials();
    await pickK('goose');
    ok('Splice with a friend: Pia’s enchantments are there to pick', await waitFor('[data-testid=splice-friend-pick]', 8000));
    await page.click('[data-testid=splice-friend-pick]'); await page.waitForTimeout(300);
    ok('…and the card previews it', await waitFor('[data-testid=hybrid-card]', 5000));
    await shot('26-splice-friend');
    await page.click('[data-testid=splice-mode-plot]'); await page.waitForTimeout(300); await clearVials();
    await pickK('oracle');
    await page.locator('[data-testid=ray-blip]').first().click({ force: true }); await page.waitForTimeout(300);
    ok('Splice with a plot: the plot hybrid card', await waitFor('[data-testid=hybrid-card]', 5000), (await page.textContent('[data-testid=hybrid-card]').catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 80));
    await shot('27-splice-plot');
    // pull the lever on a Chimera
    await page.click('[data-testid=splice-mode-chimera]'); await page.waitForTimeout(300); await clearVials();
    await pickK('goose'); await pickK('wormhole');
    await page.click('[data-testid=splice-go]');
    ok('…pull the lever: the Chimera is made', await waitFor('[data-testid=splice-made], [data-testid=splice-active]', 12000));
    await page.waitForTimeout(1800); await shot('28-splice-made');
    await page.waitForTimeout(3500);
    ok('…it’s in the lab, and can ROAR', await waitFor('[data-testid=splice-roar]', 8000));

    }
    stopAfter('splice');
    // ---- 🐉 the Leviathan ----
    await api('admin.leviathan', 'summon', { warn_min: 2 });
    await nav('/world'); await page.waitForTimeout(1500); await notNow();
    await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['leviathan'] }));
    ok('Leviathan: the warning comes, full screen', await waitFor('[data-testid=lev-moment-warning]', 30000));
    await page.waitForTimeout(1600); await shot('29-lev-warning');
    await page.click('[data-testid=lev-moment-ok]'); await page.waitForTimeout(700);
    if (app) {
      ok('…the app has the Leviathan disc on the map', await waitFor('[data-testid=lev-disc]', 10000));
      await shot('30-lev-disc');
      await page.click('[data-testid=lev-disc]');
      ok('…which opens its premium card', await waitFor('[data-testid=lev-card]', 8000));
      await page.waitForTimeout(700); await shot('31-lev-card');
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    } else {
      ok('…the website shows the banner with the countdown', await waitFor('[data-testid=lev-banner]', 10000), (await page.textContent('[data-testid=lev-banner]').catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 80));
      await shot('30-lev-banner');
    }
    // it rises
    await sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where status = 'warning'`);
    let risen = false;
    for (let i = 0; i < 12 && !risen; i++) { await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['leviathan'] })); risen = await waitFor('[data-testid=lev-moment-risen]', 5000); }
    ok('…it RISES', risen);
    await page.waitForTimeout(1600); await shot('32-lev-risen');
    await page.click('[data-testid=lev-moment-go]');
    ok('“Fight it” opens the fight', await waitFor('[data-testid=lev-fight]', 8000));
    await page.waitForTimeout(1200); await shot('33-lev-fight');
    const bombs0 = Number(await page.textContent('[data-testid=lev-bombs]'));
    const ar = await page.locator('[data-testid=lev-arena]').boundingBox();
    for (let i = 0; i < 12; i++) { await page.mouse.click(ar.x + ar.width * (0.3 + Math.random() * 0.4), ar.y + ar.height * (0.3 + Math.random() * 0.4)); await page.waitForTimeout(70); }
    await page.waitForTimeout(400); await shot('34-lev-bombs');
    await page.waitForTimeout(2600);
    const dmg = (await sql(`select dmg, hits from leviathan_players where player_id = '${me}'`))[0];
    ok('tap the beast: ink bombs fly and land (server-counted)', Number(dmg?.dmg) > 0 && Number(dmg?.hits) >= 1, `${dmg?.dmg} dmg · ${dmg?.hits} hits · bombs ${bombs0} → ${await page.textContent('[data-testid=lev-bombs]')}`);
    const moves = page.locator('[data-testid=lev-move]:not([disabled])');
    ok('…your enchantments each have a move', (await moves.count()) >= 3, `${await moves.count()} ready`);
    await moves.first().click(); await page.waitForTimeout(1500);
    await shot('35-lev-move');
    const dmg2 = (await sql(`select dmg from leviathan_players where player_id = '${me}'`))[0];
    ok('…a move lands a big hit', Number(dmg2.dmg) > Number(dmg.dmg), `${dmg.dmg} → ${dmg2.dmg}`);
    ok('…the fight has the live feed and the top fighters', (await page.locator('[data-testid=lev-feed]').count()) === 1 && (await page.locator('[data-testid=lev-top]').count()) === 1);
    const fw = await page.evaluate(() => { const f = document.querySelector('[data-testid=lev-fight]'); return f.scrollWidth - f.clientWidth; });
    ok('…and it fits the screen', fw <= 0, `${fw}px`);
    await page.locator('[data-testid=lev-fly]').scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await shot('36-lev-fight-bottom');
    await page.click('[data-testid=lev-fly]'); await page.waitForTimeout(1500); await notNow();
    ok('“Show me where it is”: it walks the map', await waitFor('[data-testid=map-leviathan]', 20000));
    await page.waitForTimeout(4000); await shot('37-map-leviathan');
    // the last blow
    await sql(`update leviathans set hp = 40 where status in ('walking', 'enraged', 'fleeing')`);
    await page.evaluate(() => window.__landvasLevOpen?.());
    await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['leviathan'] }));
    if (!(await visible('[data-testid=lev-fight]'))) await page.evaluate(() => window.__landvasLevOpen());
    await waitFor('[data-testid=lev-arena]', 8000); await page.waitForTimeout(1500); // (the sheet slides up)
    await sql(`update leviathan_players set bombs = 60 where player_id = '${me}'`);
    const ar2 = await page.locator('[data-testid=lev-arena]').boundingBox();
    const onTop = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('[data-testid=lev-arena]') ? 'arena' : `${e?.tagName}.${String(e?.className).slice(0, 80)}`; }, [ar2.x + ar2.width / 2, ar2.y + ar2.height / 2]);
    if (onTop !== 'arena') console.log(`(over the arena: ${onTop})`);
    for (let i = 0; i < 4; i++) { await page.mouse.click(ar2.x + ar2.width / 2, ar2.y + ar2.height / 2); await page.waitForTimeout(80); }
    await page.waitForTimeout(2500);
    const fell = (await sql(`select status from leviathans order by spawned_at desc limit 1`))[0].status;
    ok('the last blow fells it', fell === 'fallen', `${fell} · ${consoleLog.filter((l) => /warn|error/.test(l) && !/ERR_TUNNEL/.test(l)).slice(-3).join(' | ')} · ${await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent).join(' | '))}`);
    await page.click('[data-testid=lev-close]').catch(() => {});
    await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['leviathan'] }));
    ok('…THE LEVIATHAN HAS FALLEN, with your loot', await waitFor('[data-testid=lev-moment-fallen] [data-testid=lev-loot]', 30000), (await page.textContent('[data-testid=lev-loot]').catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 90));
    await page.waitForTimeout(1500); await shot('38-lev-fallen');
    await page.click('[data-testid=lev-moment-ok]'); await page.waitForTimeout(800);
    const loot = (await sql(`select loot, loot_seen from leviathan_players where player_id = '${me}'`))[0];
    ok('…the loot is paid (Ink, a ticket for the top fighter) and marked seen', Number(loot.loot?.ink) > 0 && loot.loot?.ticket === 'legendary' && loot.loot_seen === true, JSON.stringify(loot.loot));
    ok('…and its bones lie on the map', await waitFor('[data-testid=map-bones]', 20000));
    await page.waitForTimeout(2500); await shot('39-map-bones');
    // the feed tells everyone
    await nav('/social');
    ok('the feed tells the world it fell', await page.waitForFunction(() => /Leviathan/i.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 20000 }).then(() => true, () => false));
    await page.waitForTimeout(800);
    await shot('40-feed');
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    ok('nothing wider than the screen', wide <= 0, `${wide}px`);
    if (app) ok('the app wears its own skin (html.native)', await page.evaluate(() => document.documentElement.classList.contains('native')));
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    if (e instanceof Stop) return;
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
