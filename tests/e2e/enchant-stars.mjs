// ⭐ Stars in a real browser: pour a copy into an enchantment of the same kind (the ritual), see its first star and
// power light up, pour three other kinds in as Essence for the second, use the new powers (a Genie's gift, a
// Clockwork's Toll of Hours, a ★3 Splice's Quad), and see the stars on the Grimoire card and on the map — on the website,
// then in the app's own premium skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/enchant-stars.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-enchant-stars'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4353;
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
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `str_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `str_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:stars:ink')`);
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    const pt = `(select id from plot_types limit 1)`;
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + (k % 5) * 3, ${by} + (k / 5) * 3, '${me}', ${pt}, 'rare', now() - interval '2 days' from generate_series(0, 19) k on conflict (gx, gy) do nothing`);
    const pia = (await sql(`insert into auth.users (email) values ('pia_str_${mode}@example.test') returning id`))[0].id;
    const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
    await as(pia, 'complete_onboarding', { p_username: `pia_str_${mode}`, p_accept_terms_version: terms });
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${pia}'`);
    await sql(`insert into friendships (requester_id, addressee_id, status) values ('${me}', '${pia}', 'accepted') on conflict do nothing`);
    await sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}' where key = 'enchantments'`);
    const give = async (kind, i) => (await api('admin.giveEnchantment', me, kind, 'e2e: stars', { gx: bx + 1 + (i % 5) * 3, gy: by + 1 + Math.floor(i / 5) * 3 })).id;
    const ids = {};
    const kinds = ['genie', 'genie2', 'goose', 'cuckoo', 'parasite', 'clockwork', 'splice', 'map', 'pandora', 'sizeray'];
    for (const [i, k] of kinds.entries()) ids[k] = await give(k.replace(/\d$/, ''), i);
    ok('the owner gives the enchantments (two Genies)', kinds.every((k) => !!ids[k]));

    // ---- the Stars panel: no stars yet, three powers to earn ----
    await nav(`/grimoire/${ids.genie}`);
    ok('an enchantment’s page shows its Stars and three powers', await waitFor('[data-testid=ench-stars]'), (await text('[data-testid=ench-powers]'))?.slice(0, 80));
    ok('…all three still locked', (await page.locator('[data-testid^=ench-power-][data-on=false]').count()) === 3);
    ok('…and it counts the copy you could pour', /1 Genie/.test((await text('[data-testid=ench-merge-open]')) ?? ''), await text('[data-testid=ench-merge-open]'));
    await page.locator('[data-testid=ench-stars]').scrollIntoViewIfNeeded();
    await shot('01-stars-panel');

    // ---- the ritual: pour the other Genie in ----
    await page.click('[data-testid=ench-merge-open]');
    ok('the pouring opens: copies of the same kind first, others as Essence', await waitFor('[data-testid=merge-pick]') && (await page.locator('[data-testid=merge-pick-genie]').count()) === 1
      && (await page.locator('[data-testid=merge-pick-goose]').count()) === 1);
    await shot('02-merge-pick');
    await page.click('[data-testid=merge-pick-genie]');
    ok('…it asks first, and says what happens to the copy and its plot', await waitFor('[data-testid=merge-confirm]') && /plot stays yours/.test((await text('[data-testid=merge-confirm]')) ?? ''));
    await page.click('[data-testid=merge-go]');
    ok('…the copy pours in', await waitFor('[data-testid=merge-pouring]', 5000));
    ok('…★1: a new power', await waitFor('[data-testid=merge-power]', 15000) && /Fourth Wish/.test((await text('[data-testid=merge-power]')) ?? ''), await text('[data-testid=merge-power]'));
    ok('…and the moment can be clipped', await waitFor('[data-testid=merge-clip]', 5000));
    await page.waitForTimeout(700); await shot('03-merge-star');
    // the star moment films (a frame of it, snipped at the payoff)
    await page.click('[data-testid=merge-clip]');
    await waitFor('[data-testid=clip-sheet]', 10000);
    await page.click('[data-testid=clip-snip]');
    const snipOk = await waitFor('[data-testid=clip-snip-canvas]', 15000);
    if (snipOk) { await page.evaluate(() => { const r = document.querySelector('[data-testid=clip-snip-scrub]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '3597'); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(800); }
    const lit = snipOk && await page.evaluate(() => { const c = document.querySelector('[data-testid=clip-snip-canvas]'); const d = c.getContext('2d').getImageData(c.width / 2 - 40, c.height / 2 - 40, 80, 80).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2]; return n > 0; });
    ok('…the star moment draws a frame', !!lit);
    await shot('03b-star-moment');
    await page.mouse.click(4, 4); await page.waitForTimeout(500);
    if (await page.locator('[data-testid=clip-sheet]').count()) { await page.keyboard.press('Escape'); await page.mouse.click(4, 4); await page.waitForTimeout(400); }
    const copy = (await sql(`select status, gx, gy from enchantments where id = '${ids.genie2}'`))[0];
    const plot = (await sql(`select owner_id, rarity from world_plots where gx = ${copy.gx} and gy = ${copy.gy}`))[0];
    ok('the copy is gone; its plot is still yours and no longer enchanted', copy.status === 'gone' && plot.owner_id === me && plot.rarity !== 'enchanted', `${copy.status} ${plot.rarity}`);
    await page.click('[data-testid=merge-finish]');
    await page.waitForTimeout(600);
    ok('the page wears its star: the pips, the aura, the first power lit', (await attr('[data-testid=ench-header-stars]', 'data-stars')) === '1'
      && (await page.locator('[data-testid=star-aura]').count()) >= 1 && (await attr('[data-testid=ench-power-1]', 'data-on')) === 'true');
    ok('…and a title', /Starlit/.test((await text('[data-testid=ench-titles]')) ?? ''));
    ok('the Genie holds four wishes now', (await sql(`select private.genie_eval(e, now()) ->> 'max' m from enchantments e where id = '${ids.genie}'`))[0].m === '4');

    // ---- Essence: three other kinds make a copy ----
    await page.click('[data-testid=ench-merge-open]');
    await waitFor('[data-testid=merge-pick]');
    await page.click('[data-testid=merge-pick-goose]');
    await waitFor('[data-testid=merge-confirm]');
    await page.click('[data-testid=merge-go]');
    ok('another kind pours in as Essence', await waitFor('[data-testid=merge-essence-got]', 15000), await text('[data-testid=merge-essence-got]'));
    await page.click('[data-testid=merge-finish]');
    await api('enchantMerge', ids.genie, ids.cuckoo);
    const r2 = await api('enchantMerge', ids.genie, ids.parasite);
    ok('three Essence pour in as a copy: ★2', r2.result.essence_used && r2.result.stars === 2 && r2.result.power?.name === 'Gift of Wishes', JSON.stringify(r2.result).slice(0, 90));
    await refresh(); await page.waitForTimeout(1200);
    ok('the Genie’s scene offers a wish for a friend', await waitFor('[data-testid=genie-stars]', 10000));
    await sql(`update enchantments set state = state || jsonb_build_object('wishes', 2, 'charge_at', extract(epoch from now())) where id = '${ids.genie}'`);
    await refresh(); await page.waitForTimeout(900);
    await page.fill('[data-testid=genie-gift-to]', `pia_str_${mode}`);
    await page.click('[data-testid=genie-gift]');
    ok('…a wish given to a friend', await waitFor('[data-testid=genie-star-said]', 10000), await text('[data-testid=genie-star-said]'));
    const got = await sql(`select count(*)::int n from player_notifications where player_id = '${pia}' and data ->> 'sub' = 'wish_gift'`);
    ok('…and the friend hears of it', got[0].n === 1);
    await page.locator('[data-testid=genie-stars]').scrollIntoViewIfNeeded(); await shot('04-genie-gift');

    // ---- ★3 Clockwork: the Toll of Hours ----
    await sql(`update enchantments set stars = 3 where id = '${ids.clockwork}'`);
    const skip0 = Number((await sql(`select clock_skip from enchantments where id = '${ids.map}'`))[0].clock_skip);
    await nav(`/grimoire/${ids.clockwork}`);
    ok('a ★3 Clockwork can ring the Toll of Hours', await waitFor('[data-testid=clock-toll-go]'));
    await page.click('[data-testid=clock-toll-go]');
    await page.waitForTimeout(1500);
    const skip1 = Number((await sql(`select clock_skip from enchantments where id = '${ids.map}'`))[0].clock_skip);
    ok('…and every other enchantment jumps 30 minutes ahead', skip1 - skip0 === 1800, `${skip0} → ${skip1}`);
    await page.locator('[data-testid=clock-toll]').scrollIntoViewIfNeeded(); await shot('05-clock-toll');

    // ---- ★3 Splice: the Quad ----
    await sql(`update enchantments set state = state || jsonb_build_object('charges', 0, 'bonus', 4, 'charge_at', extract(epoch from now())) where id = '${ids.splice}'`);
    await nav(`/grimoire/${ids.splice}`);
    await page.click('[data-testid=splice-mode-quad]');
    ok('the Quad is locked until the Splice has ★3', await waitFor('[data-testid=splice-quad-locked]', 8000));
    await sql(`update enchantments set stars = 3 where id = '${ids.splice}'`);
    await refresh(); await page.waitForTimeout(1200);
    ok('…then it opens', !(await page.locator('[data-testid=splice-quad-locked]').count()));
    for (const k of ['genie', 'clockwork', 'map', 'pandora']) { await page.click(`[data-testid=splice-pick-${k}]`); await page.waitForTimeout(150); }
    ok('…four vials fill', (await page.locator('[data-testid=splice-vial]').count()) === 4);
    await shot('06-quad-ready');
    await page.click('[data-testid=splice-go]');
    ok('…four spliced at once', await waitFor('[data-testid=splice-made]', 15000) && /^The /.test(((await text('[data-testid=splice-made] .font-display')) ?? '').trim()), await text('[data-testid=splice-made] .font-display'));
    const bonds = await sql(`select count(*)::int n from enchant_splices where splice_id = '${ids.splice}' and ends_at > now()`);
    ok('…six bonds, one group', bonds[0].n === 6);
    await page.waitForTimeout(900); await shot('07-quad-made');

    // ---- the stars on the Grimoire and the map ----
    await nav('/grimoire');
    await page.waitForTimeout(1200);
    ok('the Grimoire card shows the stars', (await page.locator('[data-testid=grimoire-card][data-kind=genie] [data-stars="2"]').count()) >= 1);
    await shot('08-grimoire');
    const [gx, gy] = (await sql(`select gx, gy from enchantments where id = '${ids.genie}'`)).map((r) => [r.gx, r.gy])[0];
    await nav(`/world?fly=${gx},${gy}&z=19`);
    ok('the creature on the map wears its stars', await waitFor('.lv-cr-stars', 30000), await page.evaluate(() => document.querySelector('.lv-cr-stars')?.textContent ?? ''));
    await page.waitForTimeout(1500); await shot('09-map');

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
