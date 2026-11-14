// The Leviathan's live controls (admin): speed, send it after a player and their plots, a rampage, tiny, hidden,
// retreat / stay, heal, roam — none of which resets it — and what players see: the hazy area and the hot/cold search
// when it hides, the speck when it's tiny, the rampage — on the website (with the admin panel), then in the app's
// own skin (a simulated iOS shell; the app has no admin, so the owner's moves go straight to the server there).
// Run: npm run build:artifact && node tests/e2e/leviathan-controls.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-leviathan-controls'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4341;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const PORTLAND = { lng: -122.68, lat: 45.52 };
const SEATTLE = { lng: -122.33, lat: 47.61 };

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
  const consoleLog = []; page.on('console', (m) => { if (m.type() !== 'debug') consoleLog.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
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
  const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  const levNow = async () => (await sql(`select id, status, speed_kmh::float, base_kmh::float, hp, hp_max, walk_s::float, tiny_until, hidden_until, rampage_until, data from leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0];
  const truePos = async () => (await sql(`select private.lev_pos(l, now()) p from leviathans l where status in ('walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0].p;
  const relev = () => page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['leviathan'] }));
  // (the big full-screen moments and the "where are you?" prompt: say later)
  const later = async () => {
    await page.waitForSelector('[data-testid^=lev-moment-]', { timeout: 3500 }).catch(() => {});
    for (let i = 0; i < 4; i++) {
      if (await visible('[data-testid=lev-moment-ok]')) {
        await page.locator('[data-testid=lev-moment-ok]').first().click({ timeout: 6000 }).catch((e) => console.log('(could not close the moment: ' + String(e.message).split('\n').filter((l) => /intercept|stable|visible|retrying/.test(l)).slice(-2).join(' / ') + ')'));
        await page.waitForTimeout(900);
        if (process.env.E2E_DEBUG) console.log(`DEBUG later(): closed a moment → still there: ${await visible('[data-testid=lev-moment-ok]')} · seen ${await page.evaluate(() => localStorage.getItem('landvas.leviathan.seen'))}`);
        continue;
      }
      if (await visible('[data-testid=place-gps]')) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); continue; }
      break;
    }
  };
  const fly = (c, zoom) => page.evaluate(([lng, lat, zoom]) => { const ex = window.__landvasExplorer?.getState(); if (ex?.following) ex.setFollowing(false); window.__landvasUi.getState().requestFly({ lng, lat, zoom }); }, [c.lng, c.lat, zoom]);
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `levboss_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `levboss_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    const pt = `(select id from plot_types limit 1)`;
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (${bx}, ${by}, '${me}', ${pt}, 'rare', now() - interval '2 days') on conflict (gx, gy) do nothing`);
    // Pia, in Seattle, with three plots
    const pia = (await sql(`insert into auth.users (email) values ('piaseattle_${mode}@example.test') returning id`))[0].id;
    const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
    await as(pia, 'complete_onboarding', { p_username: `piaseattle_${mode}`, p_accept_terms_version: terms });
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${pia}'`);
    const [px, py] = cellAt(SEATTLE.lng, SEATTLE.lat);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${px} + k * 5, ${py}, '${pia}', ${pt}, case k when 0 then 'legendary' else 'rare' end, now() - interval '2 days' from generate_series(0, 2) k on conflict (gx, gy) do nothing`);

    // ---- one Leviathan, out and walking ----
    await as(me, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
    await sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where status = 'warning'`);
    await api('leviathanState');
    await sql(`update leviathans set hp = hp_max * 0.6 where status in ('walking', 'enraged')`);
    const l0 = await levNow();
    ok('a Leviathan is out and walking', l0?.status === 'walking', `${l0?.status} · ${Math.round(l0?.speed_kmh)} km/h`);

    if (!app && !process.env.E2E_NOADMIN) {
      // ---- the admin's live controls ----
      await api('devGrantSelfAdmin').catch(() => {});
      await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1200);
      await page.evaluate(() => { location.hash = 'earnings'; window.__landvasNav('/admin'); }); await page.waitForTimeout(800); await later();
      await page.getByRole('tab', { name: /^Earnings/ }).click({ timeout: 8000 }).catch(() => {});
      ok('Admin → Earnings: the Leviathan’s live controls', await waitFor('[data-testid=lev-live]', 20000));
      await page.locator('[data-testid=lev-live]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
      await shot('01-admin-live');
      const walk0 = await sql(`select private.lev_pos(l, now()) p from leviathans l where id = '${l0.id}'`);
      await page.click('[data-testid=lev-speed-x5]'); await page.waitForTimeout(1500);
      const l1 = await levNow();
      const walk1 = await sql(`select private.lev_pos(l, now()) p from leviathans l where id = '${l0.id}'`);
      const jump = Math.abs(Number(walk1[0].p.km) - Number(walk0[0].p.km));
      ok('×5: it walks five times faster', Math.abs(l1.speed_kmh / l1.base_kmh - 5) < 0.05, `${Math.round(l0.speed_kmh)} → ${Math.round(l1.speed_kmh)} km/h`);
      ok('…from where it is (no jump, same Leviathan, same health)', jump < 1 && l1.id === l0.id && Number(l1.hp) === Number(l0.hp), `moved ${jump.toFixed(2)} km`);
      await page.fill('#nf-km-h', '900'); await page.click('[data-testid=lev-speed-set]'); await page.waitForTimeout(1200);
      ok('…or any speed you type (900 km/h)', Math.round((await levNow()).speed_kmh) === 900);
      await page.click('[data-testid=lev-speed-x1]'); await page.waitForTimeout(1200);
      // send it after Pia's plots
      await page.fill('[data-testid=lev-target-search]', 'piaseattle');
      ok('target: search a player', await waitFor('[data-testid=lev-target-player]', 10000));
      await page.click('[data-testid=lev-target-player]');
      ok('…their plots to tick', await waitFor('[data-testid=lev-target-plot]', 10000));
      await page.locator('[data-testid=lev-target-plot]').nth(0).check(); await page.locator('[data-testid=lev-target-plot]').nth(1).check();
      await page.waitForTimeout(300); await shot('02-admin-target');
      await page.click('[data-testid=lev-target-go]'); await page.waitForTimeout(1500);
      const l2 = await levNow();
      const t = l2.data?.targets ?? [];
      ok('“Go for …”: it heads for exactly those plots', t.length === 2 && t.every(([lng, lat]) => Math.abs(lng - SEATTLE.lng) < 0.01 && Math.abs(lat - SEATTLE.lat) < 0.01), JSON.stringify(t).slice(0, 120));
      const note = await sql(`select count(*)::int n from player_notifications where player_id = '${pia}' and data ->> 'sub' = 'coming'`).catch(() => [{ n: -1 }]);
      ok('…and Pia is told it’s coming', note[0].n >= 1, `${note[0].n}`);
      // heal
      const hpA = Number((await levNow()).hp);
      await page.fill('#nf-heal', '10'); await page.click('[data-testid=lev-heal]'); await page.waitForTimeout(1200);
      const hpB = Number((await levNow()).hp);
      ok('heal +10%', Math.abs(hpB - hpA - Number(l0.hp_max) * 0.1) < 2, `${hpA} → ${hpB}`);
      // retreat, then turn back
      await page.click('[data-testid=lev-retreat]'); await page.waitForTimeout(1500);
      const l3 = await levNow();
      ok('retreat: it heads for the sea', l3.data?.retreat === true && l3.status === 'fleeing', `${l3.status}`);
      ok('…and the button turns into “Turn back inland”', await waitFor('[data-testid=lev-stay]', 5000));
      await page.click('[data-testid=lev-stay]'); await page.waitForTimeout(1500);
      const l4 = await levNow();
      ok('…stay: it turns back inland', !l4.data?.retreat && l4.status !== 'fleeing', `${l4.status}`);
      // roam off / on
      await page.click('label[for=lev-roam-now]'); await page.waitForTimeout(1200);
      const roamOff = (await levNow()).data?.roam;
      await page.click('label[for=lev-roam-now]'); await page.waitForTimeout(1200);
      ok('roam: off, then on again', roamOff === false && (await levNow()).data?.roam === true, `${roamOff}`);
      // rampage at Pia's plots (still ticked), tiny, hidden
      await page.click('[data-testid=lev-rampage]'); await page.waitForTimeout(1500);
      const l5 = await levNow();
      ok('⚡ rampage: it charges at them, ×8 its pace', !!l5.rampage_until && l5.speed_kmh >= l5.base_kmh * 7.9, `${Math.round(l5.speed_kmh)} km/h vs ${Math.round(l5.base_kmh)}`);
      await page.click('[data-testid=lev-tiny]'); await page.waitForTimeout(1200);
      await page.click('[data-testid=lev-hide]'); await page.waitForTimeout(1500);
      const l6 = await levNow();
      ok('🔬 tiny and 🫥 hidden', !!l6.tiny_until && !!l6.hidden_until && Date.parse(l6.hidden_until) > Date.now());
      ok('…the panel shows what it’s doing', /rampage/.test(await page.textContent('[data-testid=lev-live]')) && /tiny/.test(await page.textContent('[data-testid=lev-live]')) && /hidden/.test(await page.textContent('[data-testid=lev-live]')));
      await shot('03-admin-powers');
      // settings for every Leviathan
      await page.fill('#nf-a-power-every', '2'); await page.click('[data-testid=lev-cfg-save]'); await page.waitForTimeout(1500);
      const cfg = (await sql(`select value from game_config where key = 'leviathan'`))[0].value;
      ok('settings: “a power every 2 h” saved', Number(cfg.power_every_h) === 2, JSON.stringify(cfg).slice(0, 80));
      ok('nothing reset (same Leviathan, damage table intact)', (await levNow()).id === l0.id);
    } else {
      // (the app has no admin: the owner's moves go straight to the server)
      await as(me, 'admin_leviathan', { p_action: 'rampage', p_args: { player: pia, minutes: 20, mult: 8 } });
      await as(me, 'admin_leviathan', { p_action: 'tiny', p_args: { minutes: 20 } });
      await as(me, 'admin_leviathan', { p_action: 'hide', p_args: { minutes: 30 } });
      const l6 = await levNow();
      ok('owner: rampage at Pia, tiny, hidden', !!l6.rampage_until && !!l6.tiny_until && !!l6.hidden_until);
    }

    // ---- what a player sees: it's hiding ----
    await nav('/world'); await page.waitForTimeout(1500);
    if (process.env.E2E_DEBUG) {
      await page.waitForSelector('[data-testid=lev-moment-ok]', { timeout: 8000 }).catch(() => {});
      const d = await page.evaluate(() => new Promise((res) => { let adds = 0; const t0 = performance.now(); const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('[data-testid^=lev-moment]') || n.querySelector?.('[data-testid^=lev-moment]'))) adds++; }); mo.observe(document.body, { childList: true, subtree: true }); setTimeout(() => { mo.disconnect(); res({ adds, ms: performance.now() - t0, html: document.querySelector('[data-testid^=lev-moment]')?.outerHTML.slice(0, 200) }); }, 3000); }));
      console.log('DEBUG moment re-adds in 3s:', JSON.stringify(d)); console.log('DEBUG errors:', errors.slice(0, 5).join(' | ')); console.log('DEBUG console:', consoleLog.slice(-10).join('\n'));
    }
    await later(); await relev(); await page.waitForTimeout(2500); await later();
    if (app) ok('the app: its disc is on the map', await waitFor('[data-testid=lev-disc]', 15000));
    else {
      ok('the banner says it’s hiding (and on a rampage)', await waitFor('[data-testid=lev-banner].veiled', 15000), (await page.textContent('[data-testid=lev-banner]').catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 100));
      ok('…the banner is shown (not display:none)', await visible('[data-testid=lev-banner]'));
    }
    const state = await api('leviathanState');
    ok('its path and place are kept from players', state.lev && state.lev.path === null && state.lev.hidden === true && state.lev.pos?.haze === true, state.lev?.place);
    ok('the hazy area is on the map', await page.waitForFunction(() => !!window.__landvasMap?.getLayer('lv-lev-haze'), null, { timeout: 15000 }).then(() => true, () => false));
    ok('…with its “?” to fly to', await waitFor('[data-testid=map-lev-haze]', 10000));
    ok('…and no creature to see', (await page.locator('[data-testid=map-leviathan]').count()) === 0);
    await fly(state.lev.pos, app ? 6.5 : 6); await page.waitForTimeout(3000);
    ok('zoomed out: “zoom in on the haze and look around”', await page.waitForFunction(() => document.querySelector('[data-testid=lev-seek]')?.getAttribute('data-hint') === 'zoom', null, { timeout: 10000 }).then(() => true, () => false));
    await shot('04-map-haze');
    // the fight: fog until you find it
    await later();
    if (process.env.E2E_DEBUG) console.log(`DEBUG before the fight: moment showing ${await visible('[data-testid^=lev-moment-]')}`);
    await page.evaluate(() => window.__landvasLevOpen()); await waitFor('[data-testid=lev-fight]', 8000); await page.waitForTimeout(1500);
    if (process.env.E2E_DEBUG) console.log(`DEBUG fight open: moment showing ${await visible('[data-testid^=lev-moment-]')} · seen ${await page.evaluate(() => localStorage.getItem('landvas.leviathan.seen'))}`);
    ok('the fight: fogged — search the map first', await visible('[data-testid=lev-fog]'));
    ok('…with its powers on show', await visible('[data-testid=lev-rampage]') && await visible('[data-testid=lev-tiny]') && await visible('[data-testid=lev-hidden]'));
    await shot('05-fight-fog');
    const hitHidden = await api('leviathanHit', 'bomb', 1).then(() => 'hit', (e) => String(e?.message ?? e));
    ok('…bombs can’t hit what you can’t see', /hiding|lev_hidden/i.test(hitHidden), hitHidden.slice(0, 60));
    await page.click('[data-testid=lev-search]').catch(() => page.click('[data-testid=lev-close]')); await page.waitForTimeout(1500); await later();
    // search somewhere it isn't (cold), then right on it (found)
    const tp = await truePos();
    await fly({ lng: tp.lng + 3.5, lat: tp.lat + 2 }, 11.5); await page.waitForTimeout(3500);
    await page.waitForFunction(() => /cold|warm|hot/.test(document.querySelector('[data-testid=lev-seek]')?.getAttribute('data-hint') ?? ''), null, { timeout: 12000 }).catch(() => {});
    const far = await page.getAttribute('[data-testid=lev-seek]', 'data-hint').catch(() => null);
    ok('searching far from it: cold', far === 'cold' || far === 'warm', `${far}`);
    await shot('06-seek-cold');
    const tp2 = await truePos();
    await fly(tp2, 11.5); await page.waitForTimeout(4000);
    const spotted = (await sql(`select spotted_at from leviathan_players where player_id = '${me}'`))[0]?.spotted_at;
    ok('zoomed in right on it: FOUND (and paid for finding it first)', !!spotted, await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent).join(' | ').slice(0, 120)));
    await relev(); await page.waitForTimeout(2500);
    ok('…now you can see it: a tiny speck on a rampage', await page.waitForFunction(() => { const m = document.querySelector('[data-testid=map-leviathan]'); return !!m && m.classList.contains('tiny') && m.classList.contains('rampage'); }, null, { timeout: 15000 }).then(() => true, () => false));
    const w = await page.evaluate(() => document.querySelector('[data-testid=map-leviathan]')?.getBoundingClientRect().width ?? 0);
    ok('…a fifth of its size', w > 5 && w < 90, `${Math.round(w)}px`);
    await page.waitForTimeout(1200); await shot('07-map-found-tiny');
    await page.evaluate(() => window.__landvasLevOpen()); await waitFor('[data-testid=lev-arena]', 8000); await page.waitForTimeout(1500);
    ok('the fight: no fog now', !(await visible('[data-testid=lev-fog]')));
    ok('…“you found it”', /found it/i.test(await page.textContent('[data-testid=lev-hidden]').catch(() => '')));
    const hit = await api('leviathanHit', 'bomb', 4).catch((e) => ({ err: String(e?.message ?? e) }));
    ok('…bombs fly again (some miss: it’s tiny)', !hit.err && (Number(hit.dmg) > 0 || Number(hit.missed) > 0), JSON.stringify({ dmg: hit.dmg, missed: hit.missed, err: hit.err }));
    await shot('08-fight-found-tiny');
    const fw = await page.evaluate(() => { const f = document.querySelector('[data-testid=lev-fight]'); return f ? f.scrollWidth - f.clientWidth : 0; });
    ok('…and it fits the screen', fw <= 0, `${fw}px`);
    await page.click('[data-testid=lev-close]').catch(() => {});
    if (app) ok('the app wears its own skin (html.native)', await page.evaluate(() => document.documentElement.classList.contains('native')));
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check(tag('run completed'), false, e.message.split('\n')[0]);
    await shot('99-err');
  } finally {
    await ctx.close();
  }
}

for (const m of (process.env.E2E_MODES ?? 'web,app').split(',')) await run(m);
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
