// The owner's hand on the live Leviathan (admin, website): add health, pick any players and plots (by name, by plot
// number, by place, or a tap on the map), send it after them, ENRAGE it to hunt nonstop and call it off, and summon your
// own (health, pace, hunting from the start) — and what players see: "😡 HUNTING", "it's hunting you!", the feed —
// on the website and in the app's own skin (where the owner's moves go straight to the server).
// Run: npm run build:artifact && node tests/e2e/leviathan-hunt.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-leviathan-hunt'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4345;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const PORTLAND = { lng: -122.68, lat: 45.52 };
const SEATTLE = { lng: -122.33, lat: 47.61 };
const DENVER = { lng: -104.99, lat: 39.74 };

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({
    ...(app ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }),
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
  const shotEl = (sel, n) => (process.env.E2E_NOSHOTS ? Promise.resolve() : page.locator(sel).first().screenshot({ path: `${OUT}/${mode}-${n}.png`, timeout: 30000 }).catch(() => console.log('skip', n)));
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
  const levNow = async () => (await sql(`select id, status, speed_kmh::float, base_kmh::float, hp::float, hp_max::float, data from leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0];
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
  const toAdmin = async () => {
    await page.evaluate(() => { location.hash = 'earnings'; window.__landvasNav('/admin'); }); await page.waitForTimeout(900); await later();
    await page.getByRole('tab', { name: /^Earnings/ }).click({ timeout: 8000 }).catch(() => {});
  };
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `levhunt_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `levhunt_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${me}'`);
    const pt = `(select id from plot_types limit 1)`;
    const [mx, my] = cellAt(PORTLAND.lng, PORTLAND.lat);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (${mx}, ${my}, '${me}', ${pt}, 'rare', now() - interval '2 days') on conflict (gx, gy) do nothing`);
    // Pia in Seattle (out exploring), Dan in Denver (plots only)
    const mk = async (name, at, rarity, explorer) => {
      const id = (await sql(`insert into auth.users (email) values ('${name}@example.test') returning id`))[0].id;
      const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
      await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms });
      await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${id}'`);
      const [x, y] = cellAt(at.lng, at.lat);
      await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${x} + k * 5, ${y}, '${id}', ${pt}, case k when 0 then '${rarity}' else 'rare' end, now() - interval '2 days' from generate_series(0, 1) k on conflict (gx, gy) do nothing`);
      if (explorer) await sql(`insert into explorers (player_id, mode, lng, lat) values ('${id}', 'gps', ${at.lng}, ${at.lat + 0.03}) on conflict (player_id) do update set lng = excluded.lng, lat = excluded.lat`);
      return { id, gx: x, gy: y };
    };
    const pia = await mk(`piahunt_${mode}`, SEATTLE, 'legendary', true);
    const dan = await mk(`danhunt_${mode}`, DENVER, 'epic', false);

    await as(me, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
    await sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where status = 'warning'`);
    await api('leviathanState');
    const l0 = await levNow();
    ok('a Leviathan is out and walking', l0?.status === 'walking');

    if (!app) {
      await api('devGrantSelfAdmin').catch(() => {});
      await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1200);
      await toAdmin();
      ok('Admin → Earnings: live controls with targets and the hunt', await waitFor('[data-testid=lev-targets]', 20000) && await waitFor('[data-testid=lev-hunt]', 5000));
      // more health
      await page.locator('[data-testid=lev-hp-add]').scrollIntoViewIfNeeded();
      await page.fill('#nf-add-health', '2000000'); await page.click('[data-testid=lev-hp-add]'); await page.waitForTimeout(1300);
      const l1 = await levNow();
      ok('💪 add health: +2,000,000 to its health and its bar', l1.hp_max === l0.hp_max + 2_000_000 && l1.hp === l0.hp + 2_000_000, `${l0.hp_max} → ${l1.hp_max}`);
      await page.click('[data-testid=lev-hp-add-100]'); await page.waitForTimeout(1300);
      ok('…×2 in a tap', (await levNow()).hp_max === l1.hp_max * 2);
      // slower
      await page.click('[data-testid="lev-speed-x0.5"]'); await page.waitForTimeout(1200);
      const ls = await levNow();
      ok('speed: ×½ its pace', Math.abs(ls.speed_kmh / ls.base_kmh - 0.5) < 0.02, `${Math.round(ls.speed_kmh)} km/h`);
      await page.click('[data-testid=lev-speed-x1]'); await page.waitForTimeout(1000);
      // targets: a player, a plot by place, a plot by number
      await page.locator('[data-testid=lev-targets]').scrollIntoViewIfNeeded();
      await page.fill('[data-testid=lev-target-search]', `piahunt`);
      await waitFor('[data-testid=lev-target-player]', 10000); await page.click('[data-testid=lev-target-player]');
      await waitFor('[data-testid=lev-target-add-player]', 8000); await page.click('[data-testid=lev-target-add-player]');
      await page.fill('[data-testid=lev-find-q]', 'Denver'); await page.click('[data-testid=lev-find-go]');
      ok('find plots by place (Denver)', await waitFor('[data-testid=lev-find-plot]', 10000));
      await page.locator('[data-testid=lev-find-plot]').first().check(); await page.waitForTimeout(300);
      await page.fill('[data-testid=lev-find-q]', `${mx.toLocaleString('en-US').replace(/,/g, ' ')} · ${my.toLocaleString('en-US').replace(/,/g, ' ')}`); await page.click('[data-testid=lev-find-go]');
      await page.waitForTimeout(1200);
      await page.locator('[data-testid=lev-find-plot]').first().check(); await page.waitForTimeout(300);
      const chips = await page.locator('[data-testid=lev-target-list] > span').count();
      ok('…and by its number: three targets lined up (a player, two plots)', chips === 3, `${chips}`);
      await shotEl('[data-testid=lev-targets]', '01-admin-targets');
      await page.click('[data-testid=lev-target-go]'); await page.waitForTimeout(1500);
      const l2 = await levNow();
      const near = (p, c, d = 0.08) => Math.abs(Number(p[0]) - c.lng) < d && Math.abs(Number(p[1]) - c.lat) < d;
      const tp = l2.data?.targets ?? [];
      ok('“Go for 3 targets”: Pia where she is, then a Denver plot, then the plot by number', near(tp[0], { lng: SEATTLE.lng, lat: SEATTLE.lat + 0.03 }) && tp.some((p) => near(p, DENVER)) && near(tp.at(-1), PORTLAND), JSON.stringify(tp).slice(0, 160));
      const told = (await sql(`select count(*)::int n from player_notifications where player_id in ('${pia.id}', '${dan.id}') and data ->> 'sub' = 'coming'`))[0].n;
      ok('…both owners are told', told >= 2, `${told}`);
      // a tap on the map
      await page.click('[data-testid=lev-pick-map]');
      ok('📍 pick on the map: the map opens to pick', await waitFor('[data-testid=pick-card]', 10000));
      // a real tap on a plot of Dan's in Denver
      let sheet = false;
      await later();
      await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 }).catch(() => {});
      const lng = ((dan.gx + 5 + 0.5) / GRID) * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (dan.gy + 0.5)) / GRID))) * 180) / Math.PI;
      for (let i = 0; i < 3 && !sheet; i++) {
        await page.waitForTimeout(1200);
        await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; m.stop(); m.jumpTo({ center: [lng, lat], zoom: 20.5 }); }, [lng, lat]);
        await page.waitForTimeout(900);
        const at = await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; const p = m.project([lng, lat]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, [lng, lat]);
        await page.mouse.click(at.x, at.y);
        sheet = await waitFor('[data-testid=pick-use]', 5000);
      }
      await shot('02-pick-on-map');
      if (sheet) { await page.waitForTimeout(500); await page.click('[data-testid=pick-use]', { force: true }).catch(() => {}); await page.waitForTimeout(1800); await later(); }
      await waitFor('[data-testid=lev-target-list]', 15000);
      const chips2 = await page.locator('[data-testid=lev-target-list] > span').count();
      ok('…tap a plot and you’re back with it added to the list', sheet && chips2 === 4, `sheet ${sheet} · ${chips2} targets`);
      // ENRAGE: hunt the list nonstop
      await page.locator('[data-testid=lev-hunt]').scrollIntoViewIfNeeded();
      await page.fill('#nf-hunt-at', '3'); await page.click('[data-testid=lev-hunt-go]'); await page.waitForTimeout(1600);
      const l3 = await levNow();
      ok('😡 Enrage: it hunts your list, ×3 its pace', l3.status === 'enraged' && l3.data?.hunt?.on === true && l3.data.hunt.targets.length === 4 && Math.abs(l3.speed_kmh / l3.base_kmh - 3) < 0.05, `${l3.status} · ${l3.data?.hunt?.targets?.length} · ×${(l3.speed_kmh / l3.base_kmh).toFixed(2)}`);
      await reAdmin(); await page.waitForTimeout(1200);
      ok('…the panel says it’s hunting', await waitFor('[data-testid=lev-hunting]', 8000));
      await shotEl('[data-testid=lev-hunt]', '02b-admin-hunting');
      // on to the next one at the end of the road
      const first = l3.data.target;
      await sql(`update leviathans set walk_s = 10000000, pause_until = null where id = '${l3.id}'`); await sql(`select private.leviathan_tick()`);
      const l4 = await levNow();
      ok('…reaching one, it turns on the next', l4.status === 'enraged' && JSON.stringify(l4.data.target) !== JSON.stringify(first), `${first?.owner_name} → ${l4.data.target?.owner_name}`);
      // what players see
      await nav('/world'); await relev(); await page.waitForTimeout(1500); await later();
      await page.evaluate(() => window.__landvasLevOpen()); await waitFor('[data-testid=lev-fight]', 8000); await page.waitForTimeout(1500);
      ok('players: “😡 HUNTING” on the fight', await waitFor('[data-testid=lev-fight] [data-testid=lev-hunting]', 8000));
      ok('…and the feed says who it’s hunting', /hunting|going for/i.test(await page.textContent('[data-testid=lev-feed]').catch(() => '')));
      await shot('03-fight-hunting');
      await page.click('[data-testid=lev-close]').catch(() => {});
      // call it off
      await toAdmin(); await waitFor('[data-testid=lev-hunt-off]', 15000);
      await page.locator('[data-testid=lev-hunt-off]').scrollIntoViewIfNeeded(); await page.click('[data-testid=lev-hunt-off]'); await page.waitForTimeout(1500);
      const l5 = await levNow();
      ok('call it off: it calms down and roams', l5.data?.hunt?.on === false && l5.status !== 'enraged', l5.status);
      // summon your own
      await page.click('[data-testid=lev-dismiss]'); await page.waitForTimeout(1500); await reAdmin();
      ok('…ended; the summon panel', await waitFor('[data-testid=lev-summon-panel]', 10000));
      await page.locator('[data-testid=lev-summon-panel]').scrollIntoViewIfNeeded();
      await page.fill('#nf-warning-before-it-rises', '0'); await page.fill('#nf-its-health-blank-by-the-settings-', '4000000'); await page.fill('#nf-walks-at', '2');
      await page.click('label[for=lev-summon-hunt]'); await page.waitForTimeout(200);
      await shotEl('[data-testid=lev-summon-panel]', '04-admin-summon');
      await page.click('[data-testid=lev-summon]'); await page.waitForTimeout(1500);
      const s0 = await levNow();
      ok('summon your own: 4,000,000 health, ×2 pace, hunting from the start', s0.hp_max === 4_000_000 && Math.abs(s0.speed_kmh / s0.base_kmh - 2) < 0.05 && s0.data?.hunt?.on === true, `${s0.hp_max} · ×${(s0.speed_kmh / s0.base_kmh).toFixed(2)}`);
      await sql(`select private.leviathan_tick()`);
      const s1 = await levNow();
      ok('…the moment it rises, it hunts', s1.status === 'enraged' && !!s1.data?.target, `${s1.status} · @${s1.data?.target?.owner_name}`);
    } else {
      // (the app has no admin: the owner's moves go straight to the server)
      await as(me, 'admin_leviathan', { p_action: 'hunt', p_args: { on: true, targets: [{ t: 'player', id: me }] } });
      await nav('/world'); await relev(); await page.waitForTimeout(2000);
      ok('players: “it’s hunting you!”', ((await sql(`select count(*)::int n from player_notifications where player_id = '${me}' and data ->> 'sub' = 'coming' and (data ->> 'hunt')::boolean`))[0].n) >= 1);
      await later();
      await page.evaluate(() => window.__landvasLevOpen()); await waitFor('[data-testid=lev-fight]', 8000); await page.waitForTimeout(1500);
      ok('…“😡 HUNTING” on the fight', await waitFor('[data-testid=lev-fight] [data-testid=lev-hunting]', 8000));
      await shot('03-fight-hunting');
      const fw = await page.evaluate(() => { const f = document.querySelector('[data-testid=lev-fight]'); return f ? f.scrollWidth - f.clientWidth : 0; });
      ok('…it fits the screen', fw <= 0, `${fw}px`);
      await page.click('[data-testid=lev-close]').catch(() => {});
      ok('the app wears its own skin (html.native)', await page.evaluate(() => document.documentElement.classList.contains('native')));
    }
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
