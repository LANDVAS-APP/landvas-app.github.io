// Real-browser test of the Mirror Arcade for everyone, and co-op on its side of the glass (local-mode build, a phone):
//  - with 25,000 tickets the door's button lights up; tapping it takes you through (the glass cracks, a welcome)
//  - in the mirror you see who else is through the glass, their Co-op round shows up to join, and when the host
//    starts it, you're stepped up to the cabinet together (countdown, live scores strip)
//  - at a mirror cabinet you can start your own Versus or Co-op round
// Run: npm run build:artifact && node tests/e2e/mirror-coop.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-mirror-coop'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4237, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
  await page.fill('#email', 'glass@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'glass_gia'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update game_config set value = jsonb_set(value, '{steps}', '[[1, 1]]') where key = 'plot_access'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await api('claimStarter', START.gx, START.gy).catch(() => {});
  const gid = (await api('myGroups'))[0].id;
  const arcadeId = (await api('setGroupKind', gid, 'arcade')).arcade_id;
  await sql(`update arcades set xp = 20000, machines = '{"stacker": 1, "cyclone": 1, "skeeball": 1, "pusher": 1, "bop": 1, "snake": 1, "airhockey": 1}' where id = '${arcadeId}'`);
  await sql(`insert into arcade_players (player_id, tickets) values ('${me}', 25500) on conflict (player_id) do update set tickets = 25500`);
  // ben is already through the glass, waiting at Twin Drops for a Co-op round
  const ben = await someone('glass_ben');
  await sql(`insert into arcade_mirror_found (player_id, how) values ('${ben}', 'bought')`);
  await as(ben, 'arcade_mirror_live', { p_arcade: arcadeId });
  await sql(`update arcade_presence set seen_at = now() + interval '10 minutes' where player_id = '${ben}'`);
  const match = await as(ben, 'arcade_mirror_match_create', { p_arcade: arcadeId, p_game: 'twin', p_mode: 'team' });

  await page.evaluate((id) => window.__landvasNav(`/arcade/${id}`), arcadeId);
  await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 }); await page.waitForTimeout(2500);
  check('front hall: rounds with others are called Co-op now', true);
  await page.click('[data-testid=arcade-mirror-btn]');
  await waitFor('[data-testid=mirror-door-screen]', 15000);
  check('with 25,000 tickets, the door’s button lights up', await page.locator('[data-testid=mirror-buy]').isEnabled());
  await shot('01-door');
  await page.click('[data-testid=mirror-buy]');
  check('…the glass cracks and you’re through', await waitFor('[data-testid=mirror-crack]', 8000) && await waitFor('[data-testid=mirror-arcade]', 15000));
  check('…a welcome for walking through', await waitFor('[data-testid=mirror-welcome]', 8000));
  check('…25,000 tickets spent', Number((await sql(`select tickets from arcade_players where player_id = '${me}'`))[0].tickets) === 500);
  await page.click('[data-testid=mirror-welcome-ok]').catch(() => {});
  await page.waitForTimeout(3500);
  check('you see who else is through the glass', await waitFor('[data-testid=mirror-room-count]', 15000), await tid('mirror-room-count').first().textContent().catch(() => ''));
  check('…and their Co-op round, to join', await waitFor('[data-testid=match-invite]', 15000), await tid('match-invite').first().textContent().catch(() => ''));
  await shot('02-mirror-room');
  await tid('match-join').first().click();
  check('Join: you’re in their lobby', await waitFor('[data-testid=match-lobby]', 10000));
  const inLobby = await as(ben, 'arcade_match_result', { p_match: match.id }).catch(() => null);
  check('…both of you', inLobby?.players?.length === 2, JSON.stringify(inLobby?.players?.map((p) => p.username)));
  await shot('03-lobby');
  // ben starts it
  await sql(`update arcade_presence set seen_at = now() + interval '10 minutes' where player_id = '${ben}'`);
  await as(ben, 'arcade_mirror_match_start', { p_match: match.id });
  check('the host starts: you’re stepped up to the cabinet together', await waitFor('[data-testid=mirror-cabinet]', 20000));
  check('…a shared countdown (or straight into the round)', await waitFor('[data-testid=match-countdown], [data-testid=mirror-screen]', 10000));
  check('…with the live scores strip', await waitFor('[data-testid=match-strip]', 8000));
  await shot('04-match');
  await page.waitForTimeout(6000);
  check('…then the round itself (mirror rules)', await waitFor('[data-testid=mirror-screen]', 10000));
  await shot('05-playing');
  await tid('mirror-exit').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  // start your own at a cabinet
  await page.evaluate(() => window.__landvasMirror?.walkTo?.({ kind: 'machine', id: 'glass' }));
  await page.waitForTimeout(4500);
  check('at a mirror cabinet: Versus or Co-op with others', await waitFor('[data-testid=match-new-team]', 10000) && /Co-op/.test(await tid('match-new-team').first().textContent().catch(() => '')));
  await shot('06-cabinet-buttons');
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
