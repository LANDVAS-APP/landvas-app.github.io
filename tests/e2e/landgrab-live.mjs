// Real-browser test of LAND GRAB live (local-mode build, a phone):
//  - a Founder's Code finder standing at the LAND GRAB cabinet gets "Play it live", which walks them to its pod in
//    the Live Arena (free for all / 1v1 / 2v2 / co-op)
//  - they open a lobby, someone joins, the host starts: the live map runs on the host and the drop steers
// Run: npm run build:artifact && node tests/e2e/landgrab-live.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-landgrab-live'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4238;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(process.env.E2E_STACK ? String(e.stack).slice(0, 600) : e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
async function someone(name) {
  const id = (await sql(`insert into auth.users (email) values ('${name}@example.test') returning id`))[0].id;
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms });
  await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${id}'`);
  return id;
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'grab@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'grab_gus'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update game_config set value = jsonb_set(value, '{steps}', '[[1, 1]]') where key = 'plot_access'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await api('claimStarter', START.gx, START.gy).catch(() => {});
  const gid = (await api('myGroups'))[0].id;
  const arcadeId = (await api('setGroupKind', gid, 'arcade')).arcade_id;
  // you found the Founder's Code (LAND GRAB rose out of the floor)
  await sql(`insert into arcade_secret_state (player_id, secret, found_at) values ('${me}', 'founder', now())`);
  const ben = await someone('grab_ben');
  await sql(`insert into arcade_secret_state (player_id, secret, found_at) values ('${ben}', 'founder', now())`);

  await page.evaluate((id) => window.__landvasNav(`/arcade/${id}`), arcadeId);
  await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 }); await page.waitForTimeout(3000);
  await page.evaluate(() => window.__landvasArcade?.walkTo?.({ kind: 'machine', id: 'landgrab' }));
  check('at the LAND GRAB cabinet: Play it live', await waitFor('[data-testid=landgrab-live]', 15000));
  await shot('01-cabinet');
  await tid('landgrab-live').first().click();
  check('…into the Live Arena', await waitFor('[data-testid=arena]', 15000));
  check('…walked to the LAND GRAB pod (free for all, 1v1, 2v2, co-op)', await waitFor('[data-testid=arena-pod]', 15000) && /LAND GRAB/.test(await tid('arena-pod').first().textContent().catch(() => ''))
    && (await page.locator('[data-testid=arena-new-coop]:visible').count()) === 1 && (await page.locator('[data-testid=arena-new-teams]:visible').count()) === 1);
  await shot('02-pod');
  await tid('arena-new-ffa').first().click();
  check('a lobby opens', await waitFor('[data-testid=arena-lobby]', 10000));
  const lob = (await api('arenaLive', null, null, null, null)).match;
  await as(ben, 'arena_live', {});
  await sql(`update arena_presence set seen_at = now() + interval '10 minutes', shard = ${lob.shard ?? 0} where player_id = '${ben}'`);
  await as(ben, 'arena_join', { p_match: lob.id });
  await page.waitForTimeout(2500);
  check('…someone joins', /2 players/.test(await tid('arena-start').first().textContent().catch(() => '')), await tid('arena-start').first().textContent().catch(() => ''));
  await tid('arena-start').first().click();
  check('start: the live map', await page.waitForFunction(() => window.__arenaGame?.phase === 'play', null, { timeout: 15000 }).then(() => true, () => false));
  const g0 = await page.evaluate(() => ({ len: window.__arenaGame.w.g.length, host: window.__arenaGame.host }));
  check('…the host runs it (22×30 map)', g0.host && g0.len === 660, JSON.stringify(g0));
  const p0 = await page.evaluate((id) => ({ x: window.__arenaGame.w.ps[id].x, y: window.__arenaGame.w.ps[id].y }), me);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(700); await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(400);
  const p1 = await page.evaluate((id) => ({ x: window.__arenaGame.w.ps[id].x, y: window.__arenaGame.w.ps[id].y, trail: window.__arenaGame.w.ps[id].trail.length }), me);
  check('…your drop steers off your land, leaving a wet trail', p1.x !== p0.x && p1.trail > 0, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);
  check('…nothing floats over the play (the Worlds button lives on the map)', (await page.locator('[data-testid=worlds-button]').count()) === 0);
  await shot('03-live');
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
