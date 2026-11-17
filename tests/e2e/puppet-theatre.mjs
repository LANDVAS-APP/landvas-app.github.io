// 🎭 The Puppeteer's theatre and the Origami carry in a real browser: put your own plot on the playlist, start the show,
// watch the curtain rise and the real game play on strings, the bow with "+1 level complete · +N Ink", the curtain calls
// and the little stage that follows you round the app; add someone else's plot from the map. Then fold a Kraken into an
// Origami pocket, carry it on GPS, and see it working where you stand (on the enchantment's page and on the map) — on the
// website, then in the app's own premium skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/puppet-theatre.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-puppet-theatre'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4357;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const lngOf = (gx) => ((gx + 0.5) / GRID) * 360 - 180;
const latOf = (gy) => { const n = Math.PI - (2 * Math.PI * (gy + 0.5)) / GRID; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
const PORTLAND = { lng: -122.68, lat: 45.52 };

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
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
  const attr = (sel, a) => page.locator(sel).first().getAttribute(a).catch(() => null);
  const tap = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); await page.locator(sel).first().click({ timeout: 10000 }); };
  const cellCenter = (gx, gy) => [lngOf(gx), latOf(gy)];
  /** on the map (picking): zoom right in on a cell, tap it, then "use" it */
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
    await page.fill('#email', `pup_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `pup_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:pup:ink')`);
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    // my plot with a game on it (Block Splash), and a neighbour's
    const gameType = (await sql(`select id from plot_types where minigame = 'blocksplash' limit 1`))[0].id;
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at, name) values (${bx}, ${by}, '${me}', '${gameType}', 'rare', now() - interval '2 days', 'Clay Corner') on conflict (gx, gy) do nothing`);
    const pia = (await sql(`insert into auth.users (email) values ('pia_pup_${mode}@example.test') returning id`))[0].id;
    const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
    await as(pia, 'complete_onboarding', { p_username: `pia_pup_${mode}`, p_accept_terms_version: terms });
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${pia}'`);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (${bx + 6}, ${by}, '${pia}', '${gameType}', 'epic', now() - interval '2 days') on conflict (gx, gy) do nothing`);
    await sql(`update players set last_active_at = now() where id = '${me}'`);
    const give = async (kind, dx) => (await api('admin.giveEnchantment', me, kind, 'e2e: theatre', { gx: bx + dx, gy: by + 3 })).id;
    const pup = await give('puppeteer', 0);
    const ori = await give('origami', 3);
    ok('the owner gives a Puppeteer and an Origami Pocket', !!pup && !!ori);

    // ---- 🎭 the theatre ----
    await nav(`/grimoire/${pup}`);
    ok('the Puppeteer’s page has the theatre', await waitFor('[data-testid=puppet-theatre]'));
    await tap('[data-testid=puppet-add-own]');
    ok('…your plots with a game are listed', await waitFor('[data-testid=puppet-add-pick]'), (await page.locator('[data-testid=puppet-add-pick]').allTextContents()).join(' | '));
    await tap('[data-testid=puppet-add-pick]:has-text("Clay Corner")');
    ok('…one goes on the playlist', (await page.locator('[data-testid=puppet-playlist-item]').count()) === 1, await text('[data-testid=puppet-playlist-item]'));
    await shot('1-playlist');
    await tap('[data-testid=puppet-show-go]');
    ok('the show starts — LIVE', await waitFor('[data-testid=puppet-on]'));
    // (acts are quick: note every bow as it happens)
    await page.evaluate(() => {
      window.__bows = [];
      const look = () => {
        const b = document.querySelector('[data-testid=puppet-bow]');
        if (!b) return;
        const id = b.closest('[data-testid=puppet-stage]')?.getAttribute('data-run');
        let rec = window.__bows.find((x) => x.id === id);
        if (!rec) window.__bows.push((rec = { id, passed: b.getAttribute('data-passed'), text: '', ink: '' }));
        rec.text = b.textContent ?? '';
        const ink = b.querySelector('[data-testid=puppet-bow-ink]')?.textContent ?? '';
        if (/\+\d+ Ink/.test(ink)) rec.ink = ink;
      };
      new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    ok('…the curtain rises on the stage', await waitFor('[data-testid=puppet-stage]'), await attr('[data-testid=puppet-stage]', 'data-phase'));
    const runRow = (await sql(`select * from puppet_runs where enchant_id = '${pup}' and finished_at is null`))[0];
    ok('…a run on the server: your plot, level 1', !!runRow && runRow.level === 1 && runRow.own === true, runRow ? `${runRow.game} level ${runRow.level}, ${runRow.rounds} rounds` : 'none');
    ok('…the puppet plays the real game', await waitFor('[data-testid=puppet-stage][data-phase=playing]', 8000));
    await page.waitForTimeout(app ? 2500 : 3500);
    await shot('2-playing');
    // (the act takes as long as it takes to play; the server finishes it on its own clock)
    const bowed = await page.waitForFunction(() => window.__bows?.some((b) => b.ink || /tangled/.test(b.text)), null, { timeout: 120000 }).then(() => true, () => false);
    const bow = (await page.evaluate(() => window.__bows ?? [])).find((b) => b.ink || /tangled/.test(b.text)) ?? {};
    ok('the bow: +1 level complete (or the strings tangled)', bowed && (bow.passed === 'true' ? /\+1 level complete/.test(bow.text) : /tangled/.test(bow.text)), String(bow.text).slice(0, 90));
    if (bow.passed === 'true') ok('…with the Ink it earned', /\+\d+ Ink/.test(bow.ink), bow.ink);
    if (await waitFor('[data-testid=puppet-bow]', 15000)) await shot('3-bow');
    ok('…and a curtain call is listed', await waitFor('[data-testid=puppet-call]', 30000), await text('[data-testid=puppet-call]'));
    const fin = (await sql(`select result from puppet_runs where enchant_id = '${pup}' and finished_at is not null order by finished_at limit 1`))[0];
    ok('…the server paid it (or not) as planned', !!fin && (fin.result.passed ? Number(fin.result.ink) > 0 : Number(fin.result.ink) === 0), JSON.stringify(fin?.result ?? {}).slice(0, 120));
    if (fin?.result?.passed) {
      const lvl = (await sql(`select coalesce(max(highest_level), 0) n from plot_game_progress where gx = ${bx} and gy = ${by} and player_id = '${me}'`))[0].n;
      ok('…your plot climbed a level', Number(lvl) >= 1, `highest ${lvl}`);
    }
    const open = (await sql(`select count(*)::int n from puppet_runs where enchant_id = '${pup}' and finished_at is null`))[0].n;
    const str = (await sql(`select state->'show'->'str'->0 s from enchantments where id = '${pup}'`))[0].s;
    const acts = (await sql(`select count(*)::int n from puppet_runs where enchant_id = '${pup}'`))[0].n;
    ok('…the string plays on by itself: the next level is on stage, on the same string', open === 1 && acts >= 2 && Number(str?.n) === acts, `${acts} acts on string #1 (${str?.clears ?? 0} cleared)`);
    ok('…the theatre shows the string’s ten levels filling in', await waitFor('[data-testid=puppet-string-progress]', 8000), await attr('[data-testid=puppet-string-progress]', 'data-clears'));
    const ev = (await sql(`select kind from enchant_events where enchant_id = '${pup}'`)).map((x) => x.kind);
    ok('…the chronicle has the show and its curtain call', ev.includes('show_on') && ev.includes('auto_show'), ev.join(','));

    // the little stage follows you round the app (with a string to spare, so an act is on)
    await sql(`update enchantments set state = state || '{"strings": 2}'::jsonb where id = '${pup}'`);
    await api('enchantAct', pup, 'tick', {});
    await nav('/');
    await page.evaluate(() => window.dispatchEvent(new Event('landvas:puppet-show')));
    ok('the little stage follows you (on the hub)', await waitFor('[data-testid=puppet-mini]', 20000), await text('[data-testid=puppet-mini]'));
    // (a sheet or dialog that opened on the hub: the little stage steps aside for it — close it first)
    const dialog = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.textContent?.slice(0, 60)).join(' | '));
    if (dialog) { console.log('  (a dialog on the hub:', dialog, ')'); await shot('4-hub-dialog'); await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
    await page.locator('[data-testid=puppet-mini]').first().screenshot({ path: `${OUT}/${mode}-4-mini.png`, timeout: 5000 }).catch(() => {});
    const cover = await page.evaluate(() => { const m = document.querySelector('[data-testid=puppet-mini]'); if (!m) return 'gone'; const r = m.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return m.contains(e) ? 'clear' : `${e?.tagName}.${String(e?.className).slice(0, 120)} @ ${JSON.stringify(r)}`; });
    ok('…nothing covers it', cover === 'clear', cover);
    await tap('[data-testid=puppet-mini]');
    ok('…a tap goes back to the theatre', await waitFor('[data-testid=puppet-theatre]'));
    ok('…and it hides while you watch there', await page.waitForSelector('[data-testid=puppet-mini]', { state: 'detached', timeout: 4000 }).then(() => true, () => false));

    // someone else's plot, from the map
    await tap('[data-testid=puppet-add-map]');
    ok('“On the map”: the map picks', await waitFor('[data-testid=pick-card]'), await text('[data-testid=pick-card]'));
    ok('…the neighbour’s plot can be tapped', await tapCell(bx + 6, by));
    ok('…back in the theatre', await waitFor('[data-testid=puppet-theatre]'));
    const added = await page.waitForFunction((n) => document.querySelectorAll('[data-testid=puppet-playlist-item]').length === n, 2, { timeout: 15000 }).then(() => true, () => false);
    ok('…the neighbour’s plot joins the playlist (checked by the server)', added, (await page.locator('[data-testid=puppet-playlist-item]').allTextContents()).join(' | ').slice(0, 140));
    await shot('5-playlist-2');
    await tap('[data-testid=puppet-show-go]');
    await page.waitForTimeout(1500);
    const sh = (await sql(`select state->'show' s from enchantments where id = '${pup}'`))[0].s;
    ok('…“Update the show”: both plots on it', Array.isArray(sh?.plots) && sh.plots.length === 2, JSON.stringify(sh?.plots));
    await tap('[data-testid=puppet-show-stop]');
    await page.waitForTimeout(1200);
    ok('Stop: the curtain comes down', (await sql(`select (state->'show'->>'on')::boolean b from enchantments where id = '${pup}'`))[0].b === false);

    // ---- 🦢 the Origami carry ----
    const kr = [bx + 12, by + 6];
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (${kr[0]}, ${kr[1]}, '${me}', (select id from plot_types limit 1), 'kraken', now() - interval '2 days') on conflict (gx, gy) do nothing`);
    await sql(`update enchantments set level = 10, state = state || '{"folds": 3}'::jsonb where id = '${ori}'`);
    const f = await api('enchantAct', ori, 'fold', { gx: kr[0], gy: kr[1] }).then(() => true, (e) => String(e?.message ?? e));
    ok('a Kraken folds into the pocket', f === true, String(f));
    // out walking on real GPS, half a kilometre away
    const at = [bx + 160, by + 40];
    if (!app) await ctx.setGeolocation({ latitude: latOf(at[1]), longitude: lngOf(at[0]), accuracy: 8 });
    await sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at, fixed_at) values ('${me}', 'gps', ${lngOf(at[0])}, ${latOf(at[1])}, ${lngOf(at[0])}, ${latOf(at[1])}, now(), now())
               on conflict (player_id) do update set mode = 'gps', lng = excluded.lng, lat = excluded.lat, gps_lng = excluded.gps_lng, gps_lat = excluded.gps_lat, gps_at = now(), fixed_at = now()`);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${at[0]} + k, ${at[1]} + 1, '${pia}', (select id from plot_types limit 1), 'common', now() - interval '2 days' from generate_series(-2, 2) k on conflict (gx, gy) do nothing`);
    await nav(`/grimoire/${ori}`);
    ok('the Origami page shows the carry', await waitFor('[data-testid=origami-carry]'));
    ok('…live on GPS', (await attr('[data-testid=origami-carry]', 'data-live')) === 'true', await text('[data-testid=origami-carry]'));
    ok('…the Kraken counts the neighbours where you stand', /Kraken ×\d/.test((await text('[data-testid=origami-carry-plot]')) ?? ''), await text('[data-testid=origami-carry-plot]'));
    const km = Number((await sql(`select private.kraken_mult(w) x from world_plots w where gx = ${kr[0]} and gy = ${kr[1]}`))[0].x);
    ok('…and the server agrees (more than ×1 with neighbours round you)', km > 1, `×${km}`);
    await shot('6-carry');
    // on the map: the crane over where you are
    await nav('/world');
    await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 }).catch(() => {});
    let seen = false;
    for (let i = 0; i < 4 && !seen; i++) {
      await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; m?.stop(); m?.jumpTo({ center: [lng, lat], zoom: 16.5 }); }, cellCenter(at[0], at[1]));
      seen = await waitFor('[data-testid=map-carried]', 8000);
    }
    ok('the map shows the plot carried where you stand', seen, await text('[data-testid=map-carried]'));
    await page.waitForTimeout(1500);
    await shot('7-map-carried');
    // off GPS, it rests where it was folded
    await sql(`update explorers set mode = 'manual' where player_id = '${me}'`);
    await nav(`/grimoire/${ori}`);
    await refresh(); await page.waitForTimeout(1200);
    ok('off GPS, it rests', (await attr('[data-testid=origami-carry]', 'data-live')) === 'false', await text('[data-testid=origami-carry]'));

    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    ok('the run finished', false, String(e?.stack ?? e).slice(0, 600));
    await shot('error');
  } finally {
    await ctx.close();
  }
}

const only = process.env.E2E_ONLY;
for (const m of ['web', 'app']) if (!only || only === m) await run(m);
await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
