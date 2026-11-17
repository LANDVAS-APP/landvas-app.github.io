// The Leviathan sent back to the ocean and brought back — the same one, stronger — and its health (scaled with the
// enchantments out, a set amount, or "last N more hours"): the admin panel on the website, and what players see (the
// one waiting under the sea, "it's coming back ×N stronger") on the website and in the app's own skin.
// Run: npm run build:artifact && node tests/e2e/leviathan-deep.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-leviathan-deep'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4343;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const PORTLAND = { lng: -122.68, lat: 45.52 };

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({
    ...(app ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 }),
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
  const shotEl = (sel, n) => page.locator(sel).first().screenshot({ path: `${OUT}/${mode}-${n}.png`, timeout: 30000 }).catch(() => console.log('skip', n));
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
  const lev = async (id) => (await sql(`select id, status, strength::float, hp::float, hp_max::float, data from leviathans where id = '${id}'`))[0];
  const relev = () => page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['leviathan'] }));
  const reAdmin = () => page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['admin-leviathan'] }));
  const later = async () => {
    await page.waitForSelector('[data-testid^=lev-moment-]', { timeout: 3500 }).catch(() => {});
    for (let i = 0; i < 4; i++) {
      if (await visible('[data-testid=lev-moment-ok]')) { await page.locator('[data-testid=lev-moment-ok]').first().click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(900); continue; }
      if (await visible('[data-testid=place-gps]')) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); continue; }
      break;
    }
  };
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `levdeep_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `levdeep_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${me}'`);
    const pt = `(select id from plot_types limit 1)`;
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (${bx}, ${by}, '${me}', ${pt}, 'rare', now() - interval '2 days') on conflict (gx, gy) do nothing`);
    // a few enchantments out (for its health to scale with)
    for (const kind of ['goose', 'deck', 'stormcoil']) await as(me, 'admin_give_enchantment', { p_player: me, p_kind: kind, p_reason: 'end-to-end check of the Leviathan' });

    // ---- one out, walking, hit ----
    const s0 = await as(me, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
    const id = s0.lev.id;
    await sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where id = '${id}'`);
    await api('leviathanState');
    await api('leviathanHit', 'bomb', 10);
    const myDmg = Number((await sql(`select dmg from leviathan_players where lev_id = '${id}' and player_id = '${me}'`))[0]?.dmg ?? 0);
    ok('a Leviathan is out, scaled with the enchantments out, and you hit it', (await lev(id)).status === 'walking' && myDmg > 0 && s0.hp_calc?.mode === 'enchant', `${Math.round(s0.lev.hp_max).toLocaleString()} HP · ${s0.hp_calc?.enchantments} enchantments · ${myDmg} dmg`);

    if (!app) {
      await api('devGrantSelfAdmin').catch(() => {});
      await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1200);
      await page.evaluate(() => { location.hash = 'earnings'; window.__landvasNav('/admin'); }); await page.waitForTimeout(800); await later();
      await page.getByRole('tab', { name: /^Earnings/ }).click({ timeout: 8000 }).catch(() => {});
      ok('Admin → Earnings: health of the one that’s out', await waitFor('[data-testid=lev-live-health]', 20000));
      // its health: "make it last 10 more hours"
      await page.locator('[data-testid=lev-live-health]').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      const before = await lev(id);
      await page.fill('#nf-last-another', '10'); await page.click('[data-testid=lev-hp-hours]'); await page.waitForTimeout(1500);
      const after = await lev(id);
      const st = await as(me, 'admin_leviathan', { p_action: 'status', p_args: {} });
      ok('“last another 10 h”: its health set to the pace it’s being hit × 10 (keeping its wounds)', after.hp > before.hp && Math.abs(st.pace.eta_h - 10) < 1.5 && Math.abs(after.hp / after.hp_max - before.hp / before.hp_max) < 0.02, `${Math.round(before.hp).toLocaleString()} → ${Math.round(after.hp).toLocaleString()} HP · falls in ~${st.pace.eta_h} h`);
      await reAdmin(); await page.waitForTimeout(1200);
      await shotEl('[data-testid=lev-live-health]', '01-admin-live-health');
      // a set amount
      await page.fill('#nf-its-health', '3000000'); await page.click('[data-testid=lev-hp-set]'); await page.waitForTimeout(1500);
      ok('…or a set amount (3,000,000)', (await lev(id)).hp_max === 3_000_000);
      // the health settings for new ones
      await page.locator('[data-testid=lev-health]').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      ok('health settings: scales with enchantments (the default), with a preview', /HP/.test(await page.textContent('[data-testid=lev-hp-preview]').catch(() => '')) && (await page.locator('[data-testid=lev-hp-enchant]').getAttribute('class'))?.length > 0);
      await shotEl('[data-testid=lev-health]', '02-admin-health-settings');
      await page.click('[data-testid=lev-hp-fixed]'); await page.waitForTimeout(300);
      await page.fill('#nf-health', '2500000'); await page.click('[data-testid=lev-cfg-save]'); await page.waitForTimeout(1500);
      const cfg = (await sql(`select value from game_config where key = 'leviathan'`))[0].value;
      ok('…switch to a set amount and save', cfg.hp_mode === 'fixed' && Number(cfg.hp_fixed) === 2_500_000, JSON.stringify({ mode: cfg.hp_mode, hp: cfg.hp_fixed }));
      await page.click('[data-testid=lev-hp-enchant]'); await page.waitForTimeout(300); await page.click('[data-testid=lev-cfg-save]'); await page.waitForTimeout(1200);
      // back to the ocean
      await page.locator('[data-testid=lev-submerge]').scrollIntoViewIfNeeded();
      await page.click('[data-testid=lev-submerge]'); await page.waitForTimeout(1800);
      ok('🌊 Send it back to the ocean: it dives in and waits (no loot)', (await lev(id)).status === 'submerged' && (await sql(`select loot from leviathan_players where lev_id = '${id}' and player_id = '${me}'`))[0].loot === null);
      ok('…the panel shows it under the sea, and how to bring it back', await waitFor('[data-testid=lev-resurface]', 8000));
      await page.locator('[data-testid=lev-cfg]').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
      await shotEl('[data-testid=lev-cfg]', '03-admin-under-the-sea');
    } else {
      // (the app has no admin: the owner's moves go straight to the server)
      await as(me, 'admin_leviathan', { p_action: 'submerge', p_args: { return_h: 12 } });
    }

    // ---- what players see while it waits ----
    await nav('/world'); await page.waitForTimeout(1200); await later();
    await relev(); await page.waitForTimeout(1500);
    await page.evaluate(() => window.__landvasLevOpen()); await waitFor('[data-testid=lev-fight]', 8000); await page.waitForTimeout(1200);
    ok('players: “waiting under the sea — ×1.5 stronger when it comes back”, and their damage still counts', await waitFor('[data-testid=lev-deep]', 8000) && /1\.5/.test(await page.textContent('[data-testid=lev-deep]').catch(() => '')) && /still counts/.test(await page.textContent('[data-testid=lev-deep]').catch(() => '')));
    await shot('04-player-deep');
    const fw = await page.evaluate(() => { const f = document.querySelector('[data-testid=lev-fight]'); return f ? f.scrollWidth - f.clientWidth : 0; });
    ok('…it fits the screen', fw <= 0, `${fw}px`);
    await page.click('[data-testid=lev-close]').catch(() => {}); await page.waitForTimeout(600);

    // ---- bring it back ----
    const pre = await lev(id);
    if (!app) {
      await page.evaluate(() => { location.hash = 'earnings'; window.__landvasNav('/admin'); }); await page.waitForTimeout(1000); await later();
      await page.getByRole('tab', { name: /^Earnings/ }).click({ timeout: 8000 }).catch(() => {});
      await waitFor('[data-testid=lev-resurface]', 15000);
      await page.locator('[data-testid=lev-resurface]').scrollIntoViewIfNeeded();
      await page.fill('#nf-stronger-by', '1'); await page.fill('#nf-rises-after-a-warning-of', '30'); await page.waitForTimeout(300);
      await page.click('[data-testid=lev-resurface-go]'); await page.waitForTimeout(1800);
    } else {
      await as(me, 'admin_leviathan', { p_action: 'resurface', p_args: { step: 1, warn_min: 30 } });
    }
    const back = await lev(id);
    ok('🐉 Bring it back: the same one (same number, same damage) — ×2 stronger, more health', back.status === 'warning' && Math.abs(back.strength - 2) < 0.01 && back.hp_max >= pre.hp_max * 2 - 1 &&
      Number((await sql(`select dmg from leviathan_players where lev_id = '${id}' and player_id = '${me}'`))[0].dmg) === myDmg, `×${back.strength} · ${Math.round(pre.hp_max).toLocaleString()} → ${Math.round(back.hp_max).toLocaleString()} HP`);
    await nav('/world'); await relev();
    ok('players: “It’s coming back — ×2 stronger”', await waitFor('[data-testid=lev-moment-warning]', 15000) && /coming back/i.test(await page.textContent('[data-testid=lev-moment-warning]').catch(() => '')));
    await page.waitForTimeout(1200); await shot('05-player-coming-back');
    await page.click('[data-testid=lev-moment-ok]').catch(() => {}); await page.waitForTimeout(800);
    await sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where id = '${id}'`);
    await sql(`select private.leviathan_tick()`); await relev();
    ok('…and when it rises: “IT’S BACK — ×2 STRONGER”', await waitFor('[data-testid=lev-moment-risen]', 15000) && /BACK/.test(await page.textContent('[data-testid=lev-moment-risen]').catch(() => '')));
    await page.waitForTimeout(1200); await shot('06-player-its-back');
    await later();
    await page.evaluate(() => window.__landvasLevOpen()); await waitFor('[data-testid=lev-arena]', 8000); await page.waitForTimeout(1500);
    ok('the fight feed says it came back from the deep', /came back from the deep/i.test(await page.textContent('[data-testid=lev-feed]').catch(() => '')));
    await shot('07-fight-back');
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
