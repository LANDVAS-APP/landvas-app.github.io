// Real-browser test of open play (local-mode build, a phone):
//  - someone waiting for players at an arcade machine shows up in "Looking for players" (in the Party sheet, and as a
//    pill on the map); Join takes you into that arcade, into their room, and sits you down in their match
//  - someone on their own: "Team up" and a party forms around them
//  - on your own you're open to team up, and can go private
// Run: npm run build:artifact && node tests/e2e/open-play.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-open-play'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4233, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
// someone else, made straight in the database (onboarded, online)
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
  await sql(`insert into player_activity (player_id, kind, detail, at) values ('${id}', 'map', '{}', now() + interval '10 minutes') on conflict (player_id) do update set at = excluded.at`);
  return id;
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'open@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'open_ana'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  // (place the explorer, as a new player does)
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]').catch(() => {});
  const p0 = ll(START.gx, START.gy);
  const r0 = await api('reportPosition', p0.longitude, p0.latitude, 8).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  // an arcade (gus's), with gus at a machine waiting for players
  const gus = await someone('open_gus');
  await as(gus, 'claim_starter_plot', { p_gx: START.gx + 4, p_gy: START.gy + 4 });
  const grp = (await as(gus, 'my_groups'))[0];
  const arcade = (await as(gus, 'set_group_kind', { p_group_id: grp.id, p_kind: 'arcade' })).arcade_id;
  await as(gus, 'arcade_live', { p_arcade: arcade });
  await sql(`update arcade_presence set seen_at = now() + interval '10 minutes' where player_id = '${gus}'`);
  const match = (await as(gus, 'arcade_match_create', { p_game: 'stacker', p_mode: 'versus' }).catch(() => null))?.id
    ?? (await sql(`insert into arcade_matches (arcade_id, shard, game, mode, host_id) values ('${arcade}', 0, 'stacker', 'versus', '${gus}') returning id`))[0].id;
  await sql(`insert into arcade_match_players (match_id, player_id) values ('${match}', '${gus}') on conflict do nothing`);
  // and someone on their own
  const ben = await someone('open_ben');

  // ---- the map: a pill says someone's looking for players ----
  await nav('/world'); await page.waitForTimeout(3500);
  check('the map says someone’s looking for players', await waitFor('[data-testid=lfg-pill]', 30000), await tid('lfg-pill').first().textContent().catch(() => ''));
  await shot('01-map-lfg');
  await tid('lfg-pill').first().click(); await page.waitForTimeout(1500);
  check('…tapping it opens the lobbies, with the game on top', await waitFor('[data-testid=lfg-item]'));
  check('…and people on their own to team up with', await waitFor('[data-testid=lobby-player][data-user=open_ben]'));
  await shot('02-lobbies');

  // ---- team up with ben: a party forms around him ----
  await page.locator('[data-testid=lobby-player][data-user=open_ben] [data-testid=lobby-player-join]').click(); await page.waitForTimeout(2000);
  const g = (await api('travelGroup')).group;
  check('“Team up” forms a party around them (they lead)', !!g && g.members.length === 2 && g.members.some((m) => m.username === 'open_ben' && m.leader), JSON.stringify(g?.members.map((m) => [m.username, m.leader])));
  check('…and they hear about it', (await sql(`select 1 from player_notifications where player_id = '${ben}' and kind = 'party_join'`)).length === 1);
  await api('travelGroupLeave'); await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ---- Join the arcade game: into the arcade, into gus's room, sat down ----
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['lfg'] }));
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['party-lobbies'] }));
  await nav('/party?tab=lobbies'); await page.waitForTimeout(2500);
  await page.locator('[data-testid=lfg-item][data-kind=arcade] [data-testid=lfg-join]').first().click();
  await page.waitForTimeout(9000);
  const inMatch = (await sql(`select 1 from arcade_match_players where match_id = '${match}' and player_id = '${me}'`)).length === 1;
  check('Join takes you into the arcade and sits you down at their game', inMatch);
  const room = await sql(`select (select shard from arcade_presence where player_id = '${me}') mine, (select shard from arcade_presence where player_id = '${gus}') theirs`);
  check('…in the same room as them', room[0]?.mine === room[0]?.theirs, JSON.stringify(room[0]));
  check('…teamed up with them too', ((await api('travelGroup')).group?.members ?? []).some((m) => m.username === 'open_gus'));
  await shot('03-joined-arcade-match');

  // ---- on your own: open to team up, or private ----
  await api('travelGroupLeave').catch(() => {});
  await nav('/party'); await page.waitForTimeout(2500);
  check('on your own you’re open to team up', /open to team up/.test((await tid('open-to-join').first().textContent().catch(() => '')) ?? ''));
  await tid('open-to-join-toggle').first().click(); await page.waitForTimeout(1500);
  check('…and can go private', (await api('myPrivacy')).joinable === false);
  await shot('04-private');
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
