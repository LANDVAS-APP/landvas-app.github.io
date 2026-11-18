// Real-browser test: finding your stars and your plots, seeing them and painting them (local-mode build, a phone; then
// the app shell):
//  - a blue giant (10,242 plots): every claimed plot loads (none did before), yours wear pins; you land beside your
//    latest plot, ‹ › and "Your plots" take you to each one
//  - painting it: the part round your plot, up close; the bucket fills the plot you tap; a picture laid over your plots;
//    saved as a part of the star (its rect)
//  - the sky: stars grow as you zoom (nearer ones bigger); a near claimed star is a disc to the naked eye; your stars wear
//    their name; "Your stars" → Show me turns the telescope to it
//  - the star chart: your stars, with Go to your plots, In the sky and Paint
// Build: VITE_STREETS=https://tiles.openfreemap.org/planet npx vite build --mode artifact --outDir dist-eyes
// Run:   node tests/e2e/stars-find.mjs          (web, then app)
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
const OUT = process.env.E2E_OUT || path.resolve(`test-results/e2e-stars-find-${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const PORT = app ? 4306 : 4305;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${MODE}] ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const HERE = ll(START.gx, START.gy);

/** a small striped picture to bring into the painter (a real PNG) */
function stripesPng(w = 64, h = 64) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; const on = ((x >> 3) + (y >> 3)) % 2; raw[o] = on ? 255 : 30; raw[o + 1] = on ? 60 : 200; raw[o + 2] = on ? 120 : 255; raw[o + 3] = 255; }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const server = await serve(process.env.E2E_DIST || 'dist-eyes', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { latitude: HERE.lat, longitude: HERE.lng, accuracy: 8 }, permissions: ['geolocation'] });
await routeTown(ctx, HERE);
if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
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
const aimText = () => page.locator('[data-testid=star-aim]').textContent({ timeout: 3000 }).catch(() => '');

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `find-${MODE}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `find_${MODE}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update resource_balances set amount = 900000 where player_id = $1 and resource = 'ink'`, [me]);
  const r0 = await api('reportPosition', HERE.lng, HERE.lat, 8).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  const vee = (await sql(`insert into auth.users (email) values ('vee-find-${MODE}@example.test') returning id`))[0].id;
  await as(vee, 'complete_onboarding', { p_username: `find_vee_${MODE}`, p_accept_terms_version: terms });
  await sql(`update resource_balances set amount = 900000 where player_id = $1 and resource = 'ink'`, [vee]);

  // ---- a blue giant: its plots load, yours are easy to find ------------------------------------------------------------
  const BLUE = Number((await sql(`select x.id from (select ((2 * 8 + f)::bigint * 131072 + i) * 131072 * 16 + j * 16 + k as id from generate_series(0, 5) f, generate_series(0, 40) i, generate_series(0, 40) j, generate_series(0, 6) k) x
                             where (private.sw_star(x.id) ->> 'cls') in ('blue', 'red_giant') limit 1`))[0].id);
  await as(vee, 'star_warp', { p_id: BLUE }); await as(vee, 'star_rush');
  await as(vee, 'star_claim', { p_id: BLUE, p_cell: 200, p_kind: 'base' });
  await api('starWarp', BLUE); await api('starRush');
  for (const cell of [100, 5000]) await api('starClaim', BLUE, cell, 'base', `find-${MODE}-${cell}-${Date.now()}`);
  await nav(`/star/${BLUE}`);
  check('at a blue giant (10,242 plots), on its shell', await waitFor('[data-testid=star-canvas]', 20000));
  await page.waitForTimeout(3500);
  const d0 = await star3('debug');
  check('every claimed plot is there (yours and others’)', d0?.claimed === 3 && d0?.mineShown === 2, JSON.stringify({ claimed: d0?.claimed, mine: d0?.mineShown }));
  check('your plots wear pins you can see from anywhere on the shell', d0?.pins === 2, String(d0?.pins));
  const a0 = await aimText();
  check('you land beside your latest plot, looking at it', /^Your/.test(a0), a0.slice(0, 60));
  check('“★ Your plots” and ‹ › are there', await waitFor('[data-testid=star-mine-chip]', 3000) && await waitFor('[data-testid=star-mine-btn]', 1000));
  await shot('01-landed');
  await page.click('[data-testid=star-mine-next]'); await page.waitForTimeout(1500);
  const d1 = await star3('debug');
  const a1 = await aimText();
  check('› takes you to your other plot (across the star)', d1.at !== d0.at && /^Your/.test(a1), `${d0.at} → ${d1.at} · ${a1.slice(0, 40)}`);
  await page.click('[data-testid=star-mine-open]');
  check('the list of your plots', await waitFor('[data-testid=star-mine-sheet]', 3000) && (await page.locator('[data-testid=star-mine-row]').count()) === 2);
  await shot('02-list');
  await page.locator('[data-testid=star-mine-row]').nth(0).click(); await page.waitForTimeout(1500);
  const d2 = await star3('debug');
  check('tap one: you’re beside it', d2.at !== d1.at && /^Your/.test(await aimText()), `${d1.at} → ${d2.at}`);
  check('the part round you wears a sharper skin', !!d2.near && d2.near.du < 1, JSON.stringify(d2.near));

  // ---- painting it: up close, a plot at a time, a picture ---------------------------------------------------------------
  await page.click('[data-testid=star-paint-btn]');
  check('the painter opens', await waitFor('[data-testid=star-paint]', 8000));
  await page.waitForFunction(() => !/Laying the star/.test(document.querySelector('[data-testid=star-paint]')?.textContent ?? 'Laying the star'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const count = await page.locator('[data-testid=star-paint-count]').textContent();
  check('a big star: the part round your plot, up close', /up close/.test(count), count);
  const dims = await page.evaluate(() => { const c = document.querySelector('[data-testid=star-paint-canvas]'); return c ? [c.width, c.height] : null; });
  check('…big enough to paint each plot (a part of the star, not the whole map)', !!dims && dims[0] <= 2048 && dims[1] <= 2048 && dims[0] !== dims[1] * 2, JSON.stringify(dims));
  // (› puts one of your plots big in the middle; the bucket fills it)
  await page.click('[data-testid=star-paint-next]'); await page.waitForTimeout(500);
  await page.click('[data-testid=star-tool-fill]');
  const vb = await page.evaluate(() => { const r = document.querySelector('[data-testid=star-paint] .relative.min-h-0')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
  await page.mouse.click(vb.x, vb.y); await page.waitForTimeout(400);
  const filled = await page.evaluate(([x, y]) => { const c = document.querySelector('[data-testid=star-paint-canvas]'); const r = c.getBoundingClientRect(); const px = Math.floor(((x - r.left) / r.width) * c.width), py = Math.floor(((y - r.top) / r.height) * c.height); const d = c.getContext('2d').getImageData(px, py, 1, 1).data; return [d[0], d[1], d[2]]; }, [vb.x, vb.y]);
  check('the bucket fills the plot you tap', filled[0] > 200 && filled[1] < 120, JSON.stringify(filled));
  await shot('03-filled');
  await page.setInputFiles('[data-testid=star-paint-file]', { name: 'stripes.png', mimeType: 'image/png', buffer: stripesPng() });
  check('bring in a picture: it lies over your plots to move and size', await waitFor('[data-testid=star-paint-placing]', 5000));
  await shot('04-placing');
  await page.click('[data-testid=star-paint-apply]'); await page.waitForTimeout(500);
  check('apply it: it’s painted in (only over your plots)', !(await page.locator('[data-testid=star-paint-placing]').count()));
  await page.click('[data-testid=star-paint-save]'); await page.waitForTimeout(2500);
  const art = (await sql(`select w, h, rect from star_art where star_id = $1 and owner_id = $2`, [BLUE, me]))[0];
  check('saved as a part of the star (its rect), at a size you can paint', !!art?.rect && art.w <= 2048 && art.h <= 2048, JSON.stringify(art));
  await shot('05-saved');

  // ---- the sky: sizes that follow zoom and distance; your stars, marked; Show me ------------------------------------------
  // (a near real star, high in the sky tonight: claim a plot on it)
  await api('starHome');
  await nav('/eyes');
  await waitFor('[data-testid=eyes]', 30000);
  await page.waitForFunction(() => !document.querySelector('[data-testid=eyes-loading]'), null, { timeout: 60000 }).catch(() => {});
  await eyes('setClock', at(23)); await page.waitForTimeout(3500);
  const near = (await sql(`select hip from real_stars where ly < 60 order by ly limit 40`)).map((r) => Number(r.hip));
  let NEAR = 0, FAR = 0;
  for (const h of near) { const p = await eyes('starPlace', h); if (p && p.alt > 0.45) { if (!NEAR) NEAR = h; else if (!FAR) FAR = h; } if (NEAR && FAR) break; }
  check('a near real star high in the sky tonight', NEAR > 0, String(NEAR));
  await api('starWarp', NEAR); await api('starRush');
  await api('starClaim', NEAR, 30, 'base', `find-${MODE}-near-${Date.now()}`);
  await api('starHome');
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['my-stars'] }));
  await page.waitForTimeout(2500);
  await eyes('setClock', at(23));
  const look = await eyes('starLook', NEAR);
  await eyes('lookAt', look.yaw, look.pitch); await eyes('setFov', 60); await page.waitForTimeout(3500);
  const s60 = await eyes('starSize', NEAR);
  const c1 = await eyes('skyCounts');
  check('your star wears its name in the sky', c1.mine >= 1 && c1.labels >= 1, JSON.stringify(c1));
  check('a near claimed star is a disc even to the naked eye', !!s60?.discShown, JSON.stringify(s60));
  await shot('06-naked-eye');
  // (an unclaimed star grows as you zoom: twice the zoom, twice the size)
  await page.click('[data-testid=eyes-telescope-btn]'); await page.waitForTimeout(800);
  const lk2 = await eyes('starLook', FAR || NEAR);
  await eyes('lookAt', lk2.yaw, lk2.pitch);
  await eyes('setFov', 20); await page.waitForTimeout(1200);
  const z1 = (await eyes('starSize', FAR || NEAR)).ball;
  await eyes('setFov', 2); await page.waitForTimeout(1200);
  const z2 = (await eyes('starSize', FAR || NEAR)).ball;
  check('zooming in magnifies a star (10× the zoom, ~10× the size)', z2 / z1 > 8, `${z1.toFixed(1)} → ${z2.toFixed(1)} px`);
  await shot('07-zoomed');
  await page.click('[data-testid=eyes-telescope-btn]'); await page.waitForTimeout(600);
  await eyes('lookAt', 0, 0.05); await page.waitForTimeout(800);
  check('“Your stars” in first person', await waitFor('[data-testid=eyes-mystars-btn]', 5000));
  await page.click('[data-testid=eyes-mystars-btn]');
  check('…lists them, with where each is in your sky', await waitFor('[data-testid=eyes-mystar-row]', 4000) && /up now|rises|below/.test(await page.locator('[data-testid=eyes-mystars]').textContent()));
  await shot('08-mystars');
  const row = page.locator('[data-testid=eyes-mystar-row]').filter({ hasText: (await sql(`select coalesce(s.name, '') n from star_systems s where star_id = $1`, [NEAR]))[0]?.n || '' }).first();
  await (await row.count() ? row : page.locator('[data-testid=eyes-mystar-row]').first()).locator('[data-testid=eyes-mystar-show]').click();
  await page.waitForTimeout(2500);
  const tel = await eyes('telescope');
  const sp = await eyes('screenOf', { skystar: NEAR });
  check('Show me: the telescope turns to it and zooms in', tel?.on && tel.fov < 26 && !!sp && Math.abs(sp.x - 215) < 120 && Math.abs(sp.y - 430) < 200, JSON.stringify({ fov: tel?.fov, sp }));
  await shot('09-show-me');

  // ---- the star chart --------------------------------------------------------------------------------------------------
  await nav('/stars');
  await waitFor('[data-testid=star-chart]', 8000); await page.waitForTimeout(1500);
  check('the star chart: your stars, with Go to your plots, In the sky and Paint', (await page.locator('[data-testid=star-row-go]').count()) >= 2 && (await page.locator('[data-testid=star-row-sky]').count()) >= 2 && (await page.locator('[data-testid=star-row-paint]').count()) >= 2);
  await shot('10-chart');
  await page.locator('[data-testid=star-row-go]').first().click();
  await page.waitForTimeout(1500); await api('starRush').catch(() => {});
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['star-where'] }));
  check('Go to your plots: on the star, the list of them open', await waitFor('[data-testid=star-mine-sheet]', 20000));
  await shot('11-arrived');

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
