// Real-browser test of Skywright (the stars as land), in first person on a phone (local-mode build; then the app shell):
//  - at night, the real stars are in the sky; the telescope zooms past the eye, tier by tier, and its stars come in
//  - tap a star through it: its preview comes up — turning, what it is, how far, nobody's found it — and Go there
//  - the warp (fuel paid, light-years to go), arrive now: you stand inside its shell of plots, the star overhead
//  - claim a plot: it rolls, a beam lands, you're its Discoverer; someone else's plot pays you a cut
//  - paint your part of the star; staff approve it; back on Earth the star wears its halo, and up close its painting
//  - the star chart lists it
// Build: VITE_STREETS=https://tiles.openfreemap.org/planet npx vite build --mode artifact --outDir dist-eyes
// Run:   node tests/e2e/stars.mjs          (web, then app)
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { routeTown, ll } from './eyes-town.mjs';

const MODE = process.argv[2] || '';
if (!MODE) {
  let bad = 0;
  for (const m of ['web', 'app']) bad += spawnSync(process.execPath, [fileURLToPath(import.meta.url), m], { stdio: 'inherit' }).status ? 1 : 0;
  process.exit(bad ? 1 : 0);
}
const app = MODE === 'app';
const OUT = process.env.E2E_OUT || path.resolve(`test-results/e2e-stars-${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const PORT = app ? 4297 : 4296;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${MODE}] ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 }; // Salt Lake City
const HERE = ll(START.gx, START.gy);

const server = await serve(process.env.E2E_DIST || 'dist-eyes', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { latitude: HERE.lat, longitude: HERE.lng, accuracy: 8 }, permissions: ['geolocation'] });
await routeTown(ctx, HERE);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const eyes = (fn, ...a) => page.evaluate(([fn, a]) => { const e = window.__landvasEyes; return e ? e[fn](...a) : null; }, [fn, a]);
const star3 = (fn, ...a) => page.evaluate(([fn, a]) => { const e = window.__landvasStar; return e ? e[fn](...a) : null; }, [fn, a]);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
const waitFor = (sel, ms = 10000) => page.waitForSelector(sel, { timeout: ms }).then(() => true).catch(() => false);
const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
const ink = async (uid) => Number((await sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `stars-${MODE}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `stars_${MODE}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await sql(`update resource_balances set amount = 50000 where player_id = $1 and resource = 'ink'`, [me]);
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  const r0 = await api('reportPosition', HERE.lng, HERE.lat, 8).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  const vee = (await sql(`insert into auth.users (email) values ('vee-${MODE}@example.test') returning id`))[0].id;
  await as(vee, 'complete_onboarding', { p_username: `stars_vee_${MODE}`, p_accept_terms_version: terms });
  await sql(`update resource_balances set amount = 50000 where player_id = $1 and resource = 'ink'`, [vee]);

  // ---- into first person, at night ------------------------------------------------------------------------------------
  await nav('/eyes');
  const opened = await waitFor('[data-testid=eyes]', 30000);
  await page.waitForFunction(() => !document.querySelector('[data-testid=eyes-loading]'), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  check('first person opens', opened);
  await eyes('setClock', at(23)); await page.waitForTimeout(4000);
  await eyes('lookAt', 0, 0.9); await page.waitForTimeout(1500);
  const c0 = await eyes('skyCounts');
  check('the real stars are in the sky (~5,000 of them)', c0?.real > 4500, JSON.stringify(c0));
  await shot('01-night');

  // ---- the telescope ----------------------------------------------------------------------------------------------
  await page.click('[data-testid=eyes-telescope-btn]');
  check('the telescope comes up (a round view, the zoom)', await waitFor('[data-testid=eyes-telescope]', 4000) && await waitFor('[data-testid=eyes-telescope-zoom]', 2000));
  const tierA = await page.locator('[data-testid=eyes-telescope-tier]').textContent();
  await eyes('setFov', 4); await page.waitForTimeout(1800);
  const tierB = await page.locator('[data-testid=eyes-telescope-tier]').textContent();
  const c1 = await eyes('skyCounts');
  check('zooming in, the telescope’s own stars come in (a new tier)', c1?.gen > 50 && tierA !== tierB && /Telescope/.test(tierB ?? ''), `${tierA} → ${tierB} · ${JSON.stringify(c1)}`);
  await eyes('setFov', 0.5); await page.waitForTimeout(1800);
  const c2 = await eyes('skyCounts');
  check('…and deeper: the deep field', /Deep field/.test(await page.locator('[data-testid=eyes-telescope-tier]').textContent() ?? '') && c2?.gen > 20, JSON.stringify(c2));
  await shot('02-deep-field');
  // the slider: past the deep field takes an Observatory
  const hint = await page.locator('[data-testid=eyes-telescope]').locator('xpath=..').textContent().catch(() => '');
  check('past the deep field, it says what it takes (an Observatory)', /Observatory/.test(hint ?? ''), (hint ?? '').slice(0, 120));
  // the far end of the zoom stops at the deep field's finest
  // (the camera takes the new width on its next frame: wait for it, a slow software GPU can take a moment)
  await eyes('setFov', 0.0001);
  let f0 = null;
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(250); f0 = (await eyes('telescope'))?.fov; if (f0 < 0.2) break; }
  check('the zoom stops where your telescope’s reach ends', f0 > 0.05 && f0 < 0.2, String(f0));

  // ---- tap a star: its preview ----------------------------------------------------------------------------------------
  await eyes('setFov', 3); await page.waitForTimeout(1800);
  const ids = await eyes('skyIds');
  let tapped = null;
  for (const sid of ids ?? []) {
    const s = await eyes('skyStar', sid);
    if (!s || s.tier !== 2) continue;
    if (!(await eyes('aimAtStar', sid))) continue;
    await page.waitForTimeout(250);
    const p = await eyes('screenOf', { skystar: sid });
    if (!p) continue;
    const view = await page.evaluate(() => [innerWidth, innerHeight]);
    if (p.y < view[1] * 0.15 || p.y > view[1] * 0.7) continue;
    tapped = { id: sid, p, s };
    break;
  }
  check('a star from the telescope’s tier is in view', !!tapped, tapped ? `${tapped.s.code} (${tapped.s.cls}, ${tapped.s.cells} plots)` : '');
  if (tapped) {
    await page.mouse.click(tapped.p.x, tapped.p.y); await page.waitForTimeout(1500);
    const shown = await waitFor('[data-testid=star-preview]', 5000);
    const nm = await page.locator('[data-testid=star-preview-name]').textContent().catch(() => '');
    check('tap it: its preview comes up, turning (its own 3D view)', shown && await waitFor('[data-testid=star-globe]', 3000) && nm === tapped.s.code, nm);
    const disc = await page.locator('[data-testid=star-preview-disc]').textContent().catch(() => '');
    check('…nobody has found it yet: the first to claim a plot will be its Discoverer', /Nobody has claimed/.test(disc ?? ''), (disc ?? '').slice(0, 90));
    const go = await page.locator('[data-testid=star-go]').textContent().catch(() => '');
    check('…and Go there, with the fuel and the time it takes', /Go there · [\d,]+ Ink · \d+ s/.test(go ?? ''), go);
    await shot('03-preview');

    // ---- the warp --------------------------------------------------------------------------------------------------
    const ink0 = await ink(me);
    await page.click('[data-testid=star-go]');
    const warping = await waitFor('[data-testid=star-warp]', 6000);
    const ink1 = await ink(me);
    check('Go there: the warp (its fuel paid)', warping && ink1 < ink0, `${ink0} → ${ink1}`);
    await page.waitForTimeout(1200); await shot('04-warp');
    await page.click('[data-testid=star-warp-rush]');
    const arrived = await page.waitForFunction((id) => window.__landvasPath() === `/star/${id}`, tapped.id, { timeout: 15000 }).then(() => true).catch(() => false);
    check('arrive now: you’re at the star', arrived, await page.evaluate(() => window.__landvasPath()));
    const world = await waitFor('[data-testid=star-canvas]', 15000);
    await page.waitForTimeout(2500);
    const d0 = await star3('debug');
    check('you stand inside its shell of plots, the star overhead', world && d0?.cells === tapped.s.cells && d0?.calls >= 4 && d0?.tris > 100, JSON.stringify(d0));
    await shot('05-on-the-shell');

    // ---- claim a plot ------------------------------------------------------------------------------------------------
    const aim = await waitFor('[data-testid=star-aim]', 6000);
    const aimText = await page.locator('[data-testid=star-aim]').textContent().catch(() => '');
    check('the plot in the middle of the view says what it is (open, its price)', aim && /open (plot|Keystone)/i.test(aimText ?? ''), aimText);
    await page.click('[data-testid=star-aim]');
    check('tap it: its sheet opens (claim, with the plot types)', await waitFor('[data-testid=star-plot-sheet]', 4000) && await waitFor('[data-testid=star-claim]', 2000));
    const kinds = await page.locator('[data-testid^=star-kind-]').count();
    await page.click('[data-testid=star-claim]');
    const rolled = await waitFor('[data-testid=star-roll]', 8000);
    const sys = (await sql(`select discoverer_id, claimed from star_systems where star_id = $1`, [tapped.id]))[0];
    check('claim it: it rolls, and you’re the star’s Discoverer', rolled && sys?.discoverer_id === me && sys?.claimed === 1, `${kinds} kinds · ${JSON.stringify(sys)}`);
    await page.waitForTimeout(1200); await shot('06-claimed');
    await page.click('[data-testid=star-roll-ok]').catch(() => {});
    await page.waitForTimeout(1500);
    const d1 = await star3('debug');
    check('…and it stands on the shell as yours', d1?.claimed === 1, JSON.stringify(d1));

    // someone else claims here: the Discoverer's cut
    const before = await ink(me);
    await as(vee, 'star_warp', { p_id: tapped.id }); await as(vee, 'star_rush');
    const claimed = new Set((await sql(`select cell from star_plots where star_id = $1`, [tapped.id])).map((r) => r.cell));
    const free = [...Array(tapped.s.cells).keys()].find((c) => c >= 12 && !claimed.has(c));
    const vr = await as(vee, 'star_claim', { p_id: tapped.id, p_cell: free, p_kind: 'base' });
    const after = await ink(me);
    check('someone else claims a plot here: the Discoverer gets a cut', vr?.discoverer_cut > 0 && after === before + vr.discoverer_cut, `+${vr?.discoverer_cut}`);

    // ---- paint it --------------------------------------------------------------------------------------------------
    await page.click('[data-testid=star-paint-btn]');
    const painting = await page.waitForFunction((id) => window.__landvasPath() === `/star/${id}/paint`, tapped.id, { timeout: 8000 }).then(() => true).catch(() => false);
    check('Paint: your part of the star, flat', painting && await waitFor('[data-testid=star-paint-canvas]', 8000));
    await page.waitForTimeout(1500);
    // (it opens zoomed in on your plot, in the middle of the view: fill it, then a stroke of another colour across it)
    const zoomed = await page.locator('[data-testid=star-paint]').textContent().catch(() => '');
    check('…zoomed in on your own plots', /×(\d{2}|[2-9]\.)/.test(zoomed ?? ''), (zoomed ?? '').match(/×[\d.]+/)?.[0] ?? '');
    const cv = await page.locator('[data-testid=star-paint-canvas]').evaluate((el) => { const r = el.parentElement.parentElement.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.click('[data-testid=star-tool-fill]');
    await page.mouse.click(cv.x, cv.y);
    await page.click('[data-testid=star-tool-brush]');
    await page.click('[aria-label="#FFE14D"]').catch(() => {});
    await page.mouse.move(cv.x - 60, cv.y - 20); await page.mouse.down();
    for (let k = 0; k <= 20; k++) await page.mouse.move(cv.x - 60 + k * 6, cv.y - 20 + Math.sin(k / 3) * 25);
    await page.mouse.up();
    await page.waitForTimeout(700);
    await shot('07-paint');
    await page.click('[data-testid=star-paint-save]');
    await page.waitForTimeout(2500);
    const art = (await sql(`select status, rev, w, h, rect from star_art where star_id = $1 and owner_id = $2`, [tapped.id, me]))[0];
    // (a whole-star flat map — or, on a white star and up, the part round your plots)
    check('save: it waits for review', art?.status === 'pending' && (art.w === art.h * 2 || !!art.rect), JSON.stringify(art));
    // staff approve it (the portal's Star art page)
    const q = await api('adminStarArtQueue');
    check('it’s in the staff review queue', q?.some((x) => x.star === tapped.id && x.owner === me), String(q?.length));
    await api('adminStarArtReview', tapped.id, me, true);
    const card = await api('starCard', tapped.id);
    check('approved: the star wears its colour', !!card.color && card.art_rev > 0 && card.art.length === 1, `${card.color} rev ${card.art_rev}`);

    // ---- back on Earth: its halo, and its painting up close --------------------------------------------------------
    await as(me, 'star_home');
    await page.evaluate(() => { const a = window.__landvasApi; const f = a.starsSeen; window.__seenLog = []; a.starsSeen = async (ids) => { const t = Date.now(); try { const r = await f(ids); window.__seenLog.push([ids.length, ids[0], r.length, Date.now() - t]); return r; } catch (e) { window.__seenLog.push(['err', String(e).slice(0, 120)]); throw e; } }; });
    await nav('/eyes');
    await waitFor('[data-testid=eyes]', 30000);
    await page.waitForFunction(() => !document.querySelector('[data-testid=eyes-loading]'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await eyes('setClock', at(23)); await page.waitForTimeout(2500);
    if (!(await page.locator('[data-testid=eyes-telescope]').count())) await page.click('[data-testid=eyes-telescope-btn]');
    await page.waitForTimeout(400); // (the view turns up to the sky as the telescope comes up — and a tap that aims takes over from it)
    await eyes('setFov', 3); await page.waitForTimeout(500);
    const aimed = await eyes('aimAtStar', tapped.id);
    const tw = Date.now();
    await page.waitForFunction(() => window.__landvasEyes?.skyCounts().claims >= 1, null, { timeout: 40000 }).catch(() => {});
    console.log(`  (the halo after ${Date.now() - tw} ms; asked: ${JSON.stringify(await page.evaluate(() => window.__seenLog))})`);
    await page.waitForTimeout(800);
    const c3 = await eyes('skyCounts');
    check('back on Earth through the telescope: your star wears its halo', aimed && c3?.claims >= 1, JSON.stringify(c3));
    await shot('08-halo');
    // zoom right in on it: a disc, turning, wearing its plots and painting
    await eyes('setFov', 0.25); await eyes('aimAtStar', tapped.id); await page.waitForTimeout(7000);
    await eyes('aimAtStar', tapped.id); await page.waitForTimeout(1500);
    const c4 = await eyes('skyCounts');
    check('…and zoomed right in, it’s a disc: the star itself, its painting on it', c4?.discs >= 1, JSON.stringify(c4));
    await shot('09-disc');
    await page.click('[data-testid=eyes-telescope-btn]').catch(() => {});

    // ---- the star chart ------------------------------------------------------------------------------------------
    await nav('/stars');
    const chart = await waitFor('[data-testid=star-chart]', 10000);
    await page.waitForTimeout(1500);
    const rows = await page.locator('[data-testid=star-row]').allTextContents();
    check('the star chart: your star is on it', chart && rows.some((r) => r.includes(tapped.s.code)), rows.slice(0, 3).join(' | ').slice(0, 160));
    await shot('10-chart');
  }

  check('no errors in the page', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (e) {
  console.error(e);
  check('ran to the end', false, String(e).slice(0, 300));
  await shot('zz-error').catch(() => {});
} finally {
  await browser.close();
  server.close();
}
const ok = results.filter(Boolean).length;
console.log(`\n[${MODE}] ${ok}/${results.length} passed`);
process.exit(ok === results.length ? 0 : 1);
