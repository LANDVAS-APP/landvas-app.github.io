// Real-browser test of chat everywhere, popping up over whoever said it (local-mode build, a phone):
//  - a house: the chat has House and Party tabs; what you say, and what your party says, pops up over you both;
//    "Who's here" invites anyone in the house to your party and shows your party (here, or where they are)
//  - a game at the house table: the chat comes along, and what you say pops up under your seat
//  - the party page: where your party is, to join them
//  - an arcade, its Mirror Arcade and the Live Arena: a room chat each, popping up over you in the hall
//  - the map: your party's chat pops up over your explorer
//  - the global chat everywhere: a Global tab first (and picked) in every chat box, then Party, then the place's own;
//    something new in it pops up as a notification (which can be turned off), and a line can be reported
//  - a clan hall and a planet: the same chat box
// Run: npm run build:artifact && node tests/e2e/chat-bubbles.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-chat-bubbles'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4247;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const G = 4194304;
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const text = (sel) => page.locator(sel).first().textContent({ timeout: 5000 }).catch(() => '');
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
const unburst = () => sql(`delete from private.rate_limits where action like '%chat_burst%'`);
/** open a chat dock, pick a tab, say something */
async function say(dock, tab, body) {
  if (await page.locator(`[data-testid=${dock}-open]:visible`).count()) await tid(`${dock}-open`).first().click();
  if (tab) await tid(`${dock}-tab-${tab}`).first().click().catch(() => {});
  await unburst();
  await tid(`${dock}-input`).first().fill(body);
  await tid(`${dock}-send`).first().click();
  await page.waitForTimeout(900);
}
const closeDock = (dock) => tid(`${dock}-close`).first().click().catch(() => {});
/** the tabs of an open chat box, in order, and the one picked (by its placeholder) */
const tabsOf = (dock) => page.locator(`[data-testid^=${dock}-tab-]:visible`).evaluateAll((els, d) => els.map((e) => e.dataset.testid.slice(d.length + 5)), dock);
const picked = (dock) => tid(`${dock}-input`).first().getAttribute('placeholder').catch(() => '');
/** someone says something in the global chat (locally the test nudges the topic the server would) */
async function globalSay(uid, body) {
  await sql(`delete from private.rate_limits where action like '%chat%'`);
  await as(uid, 'send_chat_message', { p_body: body });
  await page.evaluate(() => { const bc = new BroadcastChannel('landvas-live:global-chat'); bc.postMessage({ t: 'chat' }); setTimeout(() => bc.close(), 500); });
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'talker@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'talk_tia'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await sql(`insert into homes (player_id, legacy) values ('${me}', true) on conflict (player_id) do update set legacy = true`);

  // hal is in my party and comes round; sam just walks in
  const hal = await someone('talk_hal'), sam = await someone('talk_sam');
  await as(me, 'party_create', { p_name: null, p_visibility: 'public', p_activity: 'hangout' });
  const code = (await sql(`select g.code from travel_groups g join travel_group_members m on m.group_id = g.id where m.player_id = '${me}'`))[0].code;
  await as(hal, 'party_join_code', { p_code: code, p_switch: false });
  for (const u of [hal, sam]) await as(u, 'home_live', { p_host: me, p_x: 1, p_z: 2 });

  // ---- the house ----
  await nav('/home'); await waitFor('[data-testid=home]', 30000); await page.waitForTimeout(3500);
  for (const u of [hal, sam]) await as(u, 'home_live', { p_host: me, p_x: 1, p_z: 2 });
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['travel-group'] }));
  await page.waitForTimeout(1500);
  await tid('home-chat-open').first().click();
  await waitFor('[data-testid=home-chat-tab-house]', 8000);
  const homeTabs = await tabsOf('home-chat');
  check('the house chat: Global first (and picked), then Party, then House', JSON.stringify(homeTabs) === '["global","party","house"]' && await picked('home-chat') === 'Message everyone…', `${JSON.stringify(homeTabs)} ${await picked('home-chat')}`);
  await say('home-chat', 'house', 'hello house!');
  const t1 = await page.evaluate(() => window.__landvasHome?.talking?.() ?? []);
  check('what you say pops up over you', t1.includes('me'), JSON.stringify(t1));
  await shot('01-house-say');
  await unburst();
  await as(hal, 'party_chat_send', { p_body: 'on my way up!' });
  // (the server nudges the party's topic when someone says something; locally, the test does)
  const ptopic = (await as(me, 'party_chat_list', { p_after: 0 })).topic;
  await page.evaluate((t) => { const bc = new BroadcastChannel(`landvas-live:${t}`); bc.postMessage({ t: 'chat' }); setTimeout(() => bc.close(), 500); }, ptopic);
  const halSaid = await page.waitForFunction((hal) => (window.__landvasHome?.talking?.() ?? []).includes(hal), hal, { timeout: 15000 }).then(() => true, () => false);
  check('your party’s chat pops up over them in the house too', halSaid);
  await tid('home-chat-tab-party').first().click();
  check('…and is in the Party tab', /on my way up/.test(await text('[data-testid=home-chat-log]')));
  await shot('02-party-say');
  await closeDock('home-chat');
  // who's here
  await tid('home-people').first().click();
  check('“Who’s here”: everyone in the house', await waitFor('[data-testid=home-people-sheet]', 6000) && await page.locator('[data-testid=home-person]').count() === 2);
  check('…your party marked, and the rest of your party listed', await page.locator('[data-testid=home-person][data-user=talk_hal] [data-testid=home-person-mate]').count() === 1
    && /here with you/.test(await text('[data-testid=home-party-member][data-user=talk_hal]')));
  await page.locator('[data-testid=home-person][data-user=talk_sam] [data-testid=home-person-invite]').click();
  await page.waitForTimeout(1200);
  check('invite someone in the house to your party with a tap', /Invited/.test(await text('[data-testid=home-person][data-user=talk_sam]')), await text('[data-testid=home-person][data-user=talk_sam]'));
  check('…or anyone at all', await page.locator('[data-testid=home-invite-anyone]').isVisible());
  await shot('03-whos-here');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ---- a game at the table: the chat comes along ----
  await tid('home-games').first().click();
  await waitFor('[data-testid=party-picker]', 8000);
  await tid('party-new-fourrow').first().click();
  await waitFor('[data-testid=party-lobby]', 10000);
  await tid('party-fill-bots').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await tid('party-start').first().click();
  check('a game at the table', await waitFor('[data-testid=party-game]', 15000));
  await page.waitForTimeout(4500);
  check('…has the chat', await waitFor('[data-testid=game-chat-open]', 5000));
  check('…with the global chat too', /^Global · Party · House/.test((await text('[data-testid=game-chat-open]')).trim()), await text('[data-testid=game-chat-open]'));
  await say('game-chat', 'house', 'good luck bot');
  check('…and what you say pops up under your seat', await waitFor('[data-testid=party-seat-say]', 5000) && /good luck/.test(await text('[data-testid=party-seat-say]')));
  await shot('04-game-say');
  await closeDock('game-chat');
  await tid('party-leave').first().click().catch(() => {});
  await sql(`update home_games set status = 'cancelled' where host_id = '${me}' and status in ('lobby', 'playing')`);
  await page.waitForTimeout(800);

  // ---- the party page: where your party is ----
  await sql(`insert into player_activity (player_id, kind, detail, at) values ('${hal}', 'home', '{"username": "talk_tia", "host": "${me}"}', now() + interval '10 minutes') on conflict (player_id) do update set kind = excluded.kind, detail = excluded.detail, at = excluded.at`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['travel-group'] }));
  await nav('/party'); await page.waitForTimeout(2500);
  check('the party page: where your party is, with a way to join them', await waitFor('[data-testid=party-place]', 8000) && /talk_hal/.test(await text('[data-testid=party-place]')) && await page.locator('[data-testid=party-place-join]').count() > 0, await text('[data-testid=party-place]'));
  await shot('05-party-places');

  // ---- the arcade, its mirror and the arena ----
  await as(me, 'claim_starter_plot', { p_gx: START.gx, p_gy: START.gy });
  const g = (await as(me, 'my_groups'))[0];
  const arc = (await as(me, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' })).arcade_id;
  await nav(`/arcade/${arc}`);
  check('the arcade', await waitFor('[data-testid=arcade-chat-open]', 30000));
  check('…its chat: Global, Party, Arcade', /^Global · Party · Arcade/.test((await text('[data-testid=arcade-chat-open]')).trim()), await text('[data-testid=arcade-chat-open]'));
  await page.waitForTimeout(3500);
  await say('arcade-chat', 'arcade', 'anyone up for a round?');
  const ta = await page.evaluate(() => window.__landvasArcade?.talking?.() ?? []);
  check('…what you say pops up over you in the hall', ta.includes('me'), JSON.stringify(ta));
  await shot('06-arcade-say');
  await closeDock('arcade-chat');
  await sql(`insert into arcade_players (player_id, tickets) values ('${me}', 30000) on conflict (player_id) do update set tickets = 30000`);
  await as(me, 'arcade_mirror_buy', {});
  await nav('/world'); await page.waitForTimeout(800);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await nav(`/arcade/${arc}?room=mirror`);
  await page.waitForTimeout(2500);
  // (a buyer is welcomed through the glass first)
  await page.keyboard.press('Escape').catch(() => {});
  check('the Mirror Arcade has its own room chat', await waitFor('[data-testid=arcade-chat-open]', 30000) && /Mirror/.test(await text('[data-testid=arcade-chat-open]')));
  await page.waitForTimeout(3500);
  await say('arcade-chat', 'arcade', 'backwards hello');
  check('…popping up over you through the glass', (await page.evaluate(() => window.__landvasMirror?.talking?.() ?? [])).includes('me')
    && /backwards hello/.test(await text('[data-testid=arcade-chat-log]')));
  await shot('07-mirror-say');
  await closeDock('arcade-chat');
  await nav('/world'); await page.waitForTimeout(800); await nav(`/arcade/${arc}?room=arena`);
  check('the Live Arena has a room chat', await waitFor('[data-testid=arcade-chat-open]', 30000) && /Arena/.test(await text('[data-testid=arcade-chat-open]')));
  await page.waitForTimeout(3500);
  await say('arcade-chat', 'arcade', 'gg in advance');
  check('…popping up over you', (await page.evaluate(() => window.__landvasArcade?.talking?.() ?? [])).includes('me') && /gg in advance/.test(await text('[data-testid=arcade-chat-log]')));
  await shot('08-arena-say');
  await closeDock('arcade-chat');

  // ---- the map ----
  await nav('/world'); await page.waitForTimeout(2500);
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]').catch(() => {});
  const p0 = ll(START.gx, START.gy);
  const r0 = await page.evaluate(([a, b]) => window.__landvasApi.reportPosition(a, b, 8), [p0.longitude, p0.latitude]).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
  await page.waitForTimeout(5000);
  check('the map: the chat', await waitFor('[data-testid=map-party-chat-open]', 15000));
  await tid('map-party-chat-open').first().click();
  const mapTabs = await tabsOf('map-party-chat');
  check('…Global first (and picked), then your party', JSON.stringify(mapTabs) === '["global","party"]' && await picked('map-party-chat') === 'Message everyone…', `${JSON.stringify(mapTabs)} ${await picked('map-party-chat')}`);
  await say('map-party-chat', null, 'hello everyone!');
  check('…saying something there goes to everyone', (await sql(`select count(*)::int n from chat_messages where room = 'global' and player_id = '${me}' and body = 'hello everyone!'`))[0].n === 1);
  check('…and pops up over your explorer', await waitFor('.lv-explorer[data-me] [data-testid=map-say]', 5000) && /hello everyone/.test(await text('.lv-explorer[data-me] [data-testid=map-say]')));
  await say('map-party-chat', 'party', 'meet at the fountain');
  check('…the Party tab is just your party', (await sql(`select count(*)::int n from party_chat where body = 'meet at the fountain'`).catch(() => [{ n: -1 }]))[0].n !== 0 && /fountain/.test(await text('[data-testid=map-party-chat-log]')));
  await shot('09-map-say');
  await closeDock('map-party-chat');
  // someone says something in the global chat: it pops up
  await globalSay(sam, 'hi from sam, anyone up for a duel?');
  check('a new global message pops up as a notification', await waitFor('[data-testid=chat-popup]', 15000) && /anyone up for a duel/.test(await text('[data-testid=chat-popup]')), await text('[data-testid=chat-popup]'));
  await shot('10-global-popup');
  // (the shot can outlast the pop-up: another message, tapped straight away)
  await globalSay(sam, 'still there?');
  await page.waitForSelector('[data-testid=chat-popup]:has-text("still there")', { timeout: 15000 });
  await tid('chat-popup').first().click();
  check('…tap it: the chat opens on Global', await waitFor('[data-testid=map-party-chat-log]', 5000) && /anyone up for a duel/.test(await text('[data-testid=map-party-chat-log]')) && await picked('map-party-chat') === 'Message everyone…');
  // report a line
  await page.locator('[data-testid=map-party-chat-line]:visible', { hasText: 'anyone up for a duel' }).first().click();
  await tid('map-party-chat-report').first().click(); await page.waitForTimeout(1200);
  check('…a line can be reported', (await sql(`select count(*)::int n from moderation_cases where reporter_id = '${me}'`))[0].n >= 1);
  await shot('11-global-open');
  // pop-ups off
  await tid('map-party-chat-popups').first().click(); await page.waitForTimeout(400);
  await closeDock('map-party-chat'); await page.waitForTimeout(4800);
  await globalSay(sam, 'second message from sam');
  await page.waitForTimeout(8000);
  check('…pop-ups can be turned off', !(await page.locator('[data-testid=chat-popup]', { hasText: 'second message' }).count()) && await page.evaluate(() => localStorage.getItem('landvas.chatPopups')) === 'off');
  await page.evaluate(() => localStorage.setItem('landvas.chatPopups', 'on'));

  // ---- the Party page: Global first there too ----
  await nav('/party'); await page.waitForTimeout(2500);
  check('the Party page chat: Global first (and picked), then Party', await waitFor('[data-testid=party-chat-tab-global]', 8000)
    && JSON.stringify(await tabsOf('party-chat')) === '["global","party"]' && await picked('party-chat') === 'Message everyone…', JSON.stringify(await tabsOf('party-chat')));
  check('…showing the global chat', /anyone up for a duel/.test(await text('[data-testid=party-chat-log]')));
  await tid('party-chat-tab-party').first().click(); await page.waitForTimeout(500);
  check('…and the party’s', /fountain/.test(await text('[data-testid=party-chat-log]')));
  await shot('12-party-page-chat');

  // ---- a clan hall ----
  await sql(`update resource_balances set amount = amount + 5000 where player_id = '${me}' and resource = 'ink'`);
  await as(me, 'clan_found', { p_name: 'Chatters', p_tag: 'CHAT', p_emblem: '🏰', p_color: '#7B5CFF' });
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await nav('/clan/hall');
  check('a clan hall: Global, Party, Clan', await waitFor('[data-testid=clan-chat-open]', 30000) && /^Global · Party · Clan/.test((await text('[data-testid=clan-chat-open]')).trim()), await text('[data-testid=clan-chat-open]'));
  await page.waitForTimeout(2500);
  await say('clan-chat', 'clan', 'clan hello');
  check('…the clan tab still works', /clan hello/.test(await text('[data-testid=clan-chat-log]')));
  await shot('13-clan-chat');
  await closeDock('clan-chat');

  // ---- a planet ----
  await sql(`insert into space_pilots (player_id, location) values ('${me}', 'moon') on conflict (player_id) do update set location = 'moon', dest = null, depart_at = null, arrive_at = null`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await nav('/space/surface');
  check('a planet: Global, Party, Group', await waitFor('[data-testid=planet-chat-open]', 60000) && /^Global · Party · Group/.test((await text('[data-testid=planet-chat-open]')).trim()), await text('[data-testid=planet-chat-open]'));
  await page.waitForTimeout(6000);
  await say('planet-chat', 'group', 'moon hello');
  check('…the group tab still works', /moon hello/.test(await text('[data-testid=planet-chat-log]')), await text('[data-testid=planet-chat-log]'));
  await shot('14-planet-chat');
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
