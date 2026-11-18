// Real-browser test of Skywright's star-only plot types and each star's own rules (local-mode build, a phone; then the
// app shell): on a star's shell, claim a Fusion Forge (collect hydrogen, fuse it), a Lumen Grove (plant, harvest), a
// Comet Ranch (catch one), a Starsong (write a loop, save it — the preview plays it), an Observatory (survey: an
// exoplanet), a Plasma Hatchery (an egg), a Starbeam Lens on a Keystone (focus it: first person shows the beam and says
// claims there roll higher); light the star; the star chart lists your elements and finds.
// Build: VITE_STREETS=https://tiles.openfreemap.org/planet npx vite build --mode artifact --outDir dist-eyes
// Run:   node tests/e2e/star-kinds.mjs          (web, then app)
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
const OUT = process.env.E2E_OUT || path.resolve(`test-results/e2e-star-kinds-${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const PORT = app ? 4302 : 4301;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${MODE}] ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const HERE = ll(START.gx, START.gy);

const server = await serve(process.env.E2E_DIST || 'dist-eyes', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { latitude: HERE.lat, longitude: HERE.lng, accuracy: 8 }, permissions: ['geolocation'] });
await routeTown(ctx, HERE);
if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const waitFor = (sel, ms = 10000) => page.waitForSelector(sel, { timeout: ms }).then(() => true).catch(() => false);
const star3 = (fn, ...a) => page.evaluate(([fn, a]) => { const e = window.__landvasStar; return e ? e[fn](...a) : null; }, [fn, a]);

/** open a plot's sheet on the shell (walk toward it, then open it by its number) */
async function openCell(cell) {
  if (await page.locator('[data-testid=star-plot-sheet]').count()) { await page.click('[aria-label=Close]').catch(() => {}); await page.waitForTimeout(400); }
  await star3('open', cell);
  return waitFor('[data-testid=star-plot-sheet]', 5000);
}
async function claimAs(cell, kind) {
  await openCell(cell);
  await page.waitForSelector(`[data-testid=star-kind-${kind}]`, { timeout: 8000 });
  await page.click(`[data-testid=star-kind-${kind}]`);
  await page.click('[data-testid=star-claim]');
  await waitFor('[data-testid=star-roll]', 8000);
  await page.waitForTimeout(1500);
  await page.click('[data-testid=star-roll-ok]').catch(() => {});
  await page.waitForTimeout(800);
  return (await sql(`select kind from star_plots where star_id = $1 and cell = $2`, [STAR, cell]))[0]?.kind;
}
let STAR = 0;

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `kinds-${MODE}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `kinds_${MODE}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update resource_balances set amount = 500000 where player_id = $1 and resource = 'ink'`, [me]);
  const r0 = await api('reportPosition', HERE.lng, HERE.lat, 8).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);

  // a red dwarf (it flares; 92 plots), found in the sky by the game's own code
  // (searched with the database's own copy of the galaxy: the same stars as the game's code)
  STAR = Number((await sql(`select x.id from (select ((2 * 8 + f)::bigint * 131072 + i) * 131072 * 16 + j * 16 + k as id from generate_series(0, 5) f, generate_series(0, 30) i, generate_series(0, 30) j, generate_series(0, 6) k) x
                             where (private.sw_star(x.id) ->> 'cls') = 'red_dwarf' limit 1`))[0].id);
  await api('starWarp', STAR); await api('starRush');
  await nav(`/star/${STAR}`);
  check('at a red dwarf, on its shell', await waitFor('[data-testid=star-canvas]', 20000));
  await page.waitForTimeout(2500);

  // ---- 🔥 the Forge -------------------------------------------------------------------------------------------------
  check('claim a Fusion Forge', (await claimAs(20, 'forge')) === 'forge');
  await sql(`update star_plots set state = state || jsonb_build_object('at', now() - interval '3 hours') where star_id = $1 and cell = 20`, [STAR]);
  await openCell(20);
  check('its panel: hydrogen to collect, the ladder (a red dwarf stops at helium)', await waitFor('[data-testid=kind-forge]', 6000) && /Helium/.test(await page.locator('[data-testid=kind-forge]').textContent()));
  await page.click('[data-testid=forge-collect]'); await page.waitForTimeout(1200);
  const h = Number((await sql(`select amount from star_elements where player_id = $1 and element = 'h'`, [me]))[0]?.amount ?? 0);
  check('collect: hydrogen', h >= 18, `${h} H`);
  await page.click('[data-testid=forge-fuse-h]'); await page.waitForTimeout(1200);
  const he = Number((await sql(`select amount from star_elements where player_id = $1 and element = 'he'`, [me]))[0]?.amount ?? 0);
  check('fuse it: 4 hydrogen → 1 helium', he === 1, `${he} He`);
  check('the star’s own rules: it flares (a red dwarf)', /flare/i.test(await page.locator('[data-testid=star-nature]').textContent().catch(() => '')));
  await shot('01-forge');
  await page.click('[aria-label=Close]');

  // ---- 🌱 the Grove ------------------------------------------------------------------------------------------------
  check('claim a Lumen Grove', (await claimAs(21, 'grove')) === 'grove');
  await openCell(21);
  await waitFor('[data-testid=kind-grove]', 6000);
  await page.click('[data-testid=grove-plant]'); await page.waitForTimeout(1000);
  await sql(`update star_plots set state = state || jsonb_build_object('planted_at', now() - interval '7 hours') where star_id = $1 and cell = 21`, [STAR]);
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['star-plot'] })); await page.waitForTimeout(1200);
  check('plant it; when it’s ripe, harvest: ember moss (a red star’s light)', await waitFor('[data-testid=grove-harvest]', 5000));
  await page.click('[data-testid=grove-harvest]'); await page.waitForTimeout(1200);
  check('…a page in the codex', (await sql(`select species from star_codex where player_id = $1`, [me]))[0]?.species === 'ember_moss');
  await shot('02-grove');
  await page.click('[aria-label=Close]');

  // ---- ☄️ the Ranch, 🎵 Starsong -------------------------------------------------------------------------------------
  await sql(`update game_config set value = jsonb_set(value, '{kinds,ranch,window_min}', '180') where key = 'stars'`);
  check('claim a Comet Ranch', (await claimAs(22, 'ranch')) === 'ranch');
  await openCell(22);
  await waitFor('[data-testid=ranch-catch]', 6000);
  await page.click('[data-testid=ranch-catch]'); await page.waitForTimeout(1200);
  check('a comet passing: catch it', /C\/\d{4}/.test(await page.locator('[data-testid=kind-ranch]').textContent()));
  await shot('03-ranch');
  await page.click('[aria-label=Close]');
  check('claim a Starsong', (await claimAs(23, 'song')) === 'song');
  await openCell(23);
  await waitFor('[data-testid=kind-song]', 6000);
  for (const [i, n] of [[0, 2], [2, 4], [4, 7], [6, 4], [8, 2]]) await page.click(`[aria-label="step ${i + 1} note ${n + 1}"]`);
  await page.click('[data-testid=song-play]'); await page.waitForTimeout(500);
  await page.click('[data-testid=song-save]'); await page.waitForTimeout(1200);
  const loop = (await sql(`select state->>'loop' l from star_plots where star_id = $1 and cell = 23`, [STAR]))[0]?.l;
  check('write a loop of the star’s notes and save it', loop?.startsWith('2.4.7.4.2'), loop);
  await shot('04-song');
  await page.click('[aria-label=Close]');

  // ---- 🔭 Observatory, 🐣 Hatchery, 🔦 Lens --------------------------------------------------------------------------
  check('claim an Observatory', (await claimAs(24, 'observatory')) === 'observatory');
  await openCell(24);
  await waitFor('[data-testid=obs-survey]', 6000);
  let exo = null;
  for (let k = 0; k < 12 && !exo; k++) {
    await page.click('[data-testid=obs-survey]'); await page.waitForTimeout(900);
    exo = (await sql(`select seed, name from star_exoplanets where player_id = $1`, [me]))[0] ?? null;
    if (!exo) { await sql(`update star_plots set state = state - 'last' where star_id = $1 and cell = 24`, [STAR]); await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['star-plot'] })); await page.waitForTimeout(700); }
  }
  check('survey: an exoplanet — a world of yours to land on', !!exo, exo?.name ?? '');
  check('your telescope from Earth reaches ultra deep now', (await api('starReach')).reach === 4);
  await shot('05-observatory');
  await page.click('[aria-label=Close]');
  check('claim a Plasma Hatchery', (await claimAs(25, 'hatchery')) === 'hatchery');
  await openCell(25);
  await waitFor('[data-testid=hatch-collect]', 6000);
  await page.click('[data-testid=hatch-collect]'); await page.waitForTimeout(1200);
  check('collect a plasma egg (with your Inkborn eggs)', (await sql(`select kind from inkborn_eggs where owner_id = $1`, [me]))[0]?.kind === 'cosmic');
  await page.click('[aria-label=Close]');
  check('a Keystone: claim a Starbeam Lens', (await claimAs(3, 'lens')) === 'lens');
  await openCell(3);
  await waitFor('[data-testid=lens-focus]', 6000);
  await page.click('[data-testid=lens-focus]'); await page.waitForTimeout(1200);
  const beam = (await sql(`select gx, gy from star_beams where owner_id = $1`, [me]))[0];
  check('focus it where your explorer stands', !!beam, JSON.stringify(beam));
  await shot('06-lens');
  // light the star (from the nature panel)
  await sql(`update star_elements set amount = 100 where player_id = $1 and element in ('he')`, [me]);
  await sql(`insert into star_elements (player_id, element, amount) values ($1, 'c', 100) on conflict (player_id, element) do update set amount = 100`, [me]);
  await page.click('[data-testid=nature-light]'); await page.waitForTimeout(1200);
  check('light the star with your elements', (await sql(`select lit from star_systems where star_id = $1`, [STAR]))[0]?.lit === 1);
  await page.click('[aria-label=Close]');

  // ---- the preview plays the Starsong; first person shows the beam ---------------------------------------------------
  await nav('/stars'); await waitFor('[data-testid=star-chart]', 10000); await page.waitForTimeout(1500);
  check('the star chart: your elements, your exoplanet', await waitFor('[data-testid=star-things]', 5000) && /He|H/.test(await page.locator('[data-testid=star-things]').textContent()) && (await page.locator('[data-testid=star-things]').textContent()).includes(exo?.name ?? '@@'));
  await page.locator('[data-testid=star-row]').first().click();
  check('its preview: lit, flaring, and its Starsong to listen to', await waitFor('[data-testid=star-listen]', 6000) && await waitFor('[data-testid=star-nature-chips]', 2000));
  await page.click('[data-testid=star-listen]'); await page.waitForTimeout(600);
  await shot('07-preview');
  await page.click('[data-testid=star-preview-close]');
  await api('starHome');
  await nav('/eyes');
  await waitFor('[data-testid=eyes]', 30000);
  await page.waitForFunction(() => !document.querySelector('[data-testid=eyes-loading]'), null, { timeout: 60000 }).catch(() => {});
  check('first person under the beam: it says claims here roll a tier higher', await waitFor('[data-testid=eyes-beam-chip]', 15000));
  await shot('08-beam');

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
