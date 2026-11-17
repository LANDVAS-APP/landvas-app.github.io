// Real-browser test of the chats' faces, names and replies (local-mode build):
//  - every chat line has a small profile picture; names wear the colour of their rarest plot (a Primordial's is a band
//    of colour), or the rarity their player chose to show off
//  - the global chat takes replies: tap a line → Reply → the bar over the box → the reply carries a quote; an answer to
//    you stands out, pops up "replied to you" and leaves an alert; tapping a quote finds the line it answers
//  - tap a name (or a face): a peek at the player pops out of it — their rarest plot, stats, Reply / Profile / Friend /
//    Party / Report / Block — and your own peek picks your name's colour; the peek's show plays once and holds still
//  - the same in the Social page's chat and the Party page's
// E2E_VIEW=desktop runs the peek on a big screen (a card by the name, not a sheet).
// Run: npm run build:artifact && node tests/e2e/chat-faces.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DESK = process.env.E2E_VIEW === 'desktop';
const OUT = process.env.E2E_OUT || path.resolve(`test-results/e2e-chat-faces${DESK ? '-desktop' : ''}`); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4259;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const G = 4194304;
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext(DESK
  ? { viewport: { width: 1280, height: 860 }, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] }
  : { viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::|tile|maplibre/i.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const text = (sel) => page.locator(sel).first().textContent({ timeout: 5000 }).catch(() => '');
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(300); } return false; };
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
let gx = 812_000;
const plot = (uid, rarity) => sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (${gx++}, 1571000, 'graphite', '${rarity}', '${uid}', now())`);
const unburst = () => sql(`delete from private.rate_limits where action like '%chat%' or action = 'name_color'`);
/** someone says something in the global chat (locally the test nudges the topic the server would) */
async function globalSay(uid, body, reply) {
  await unburst();
  const m = await as(uid, 'send_chat_message', reply ? { p_body: body, p_reply_to: reply } : { p_body: body });
  await page.evaluate(() => { const bc = new BroadcastChannel('landvas-live:global-chat'); bc.postMessage({ t: 'chat' }); setTimeout(() => bc.close(), 500); });
  return m;
}
/** a chat line in a dock, by what it says (its own words, not a quote of them) */
const line = (dock, body) => page.locator(`[data-testid=${dock}-log] [data-testid=chat-line]`).filter({ has: page.locator(':scope > div > span', { hasText: body }) }).last();
/** endless animations still running inside the peek (there should be none once it has opened) */
const peekLoops = () => page.evaluate(() => document.getAnimations().filter((a) => {
  const t = a.effect?.target; const peek = document.querySelector('[data-testid=player-peek]');
  return peek && t && peek.contains(t) && a.playState === 'running' && a.effect.getComputedTiming().iterations === Infinity;
}).length);

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'faces@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'face_ivy'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  const sam = await someone('face_sam'), bea = await someone('face_bea');
  await plot(sam, 'common'); await plot(sam, 'volcano'); await plot(sam, 'volcano');
  await plot(bea, 'rare'); await plot(bea, 'loom');
  await plot(me, 'common'); await plot(me, 'mythic');

  // ---- the map's chat box ----
  await nav('/world'); await page.waitForTimeout(2500);
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]').catch(() => {});
  const p0 = ll(START.gx, START.gy);
  const r0 = await page.evaluate(([a, b]) => window.__landvasApi.reportPosition(a, b, 8), [p0.longitude, p0.latitude]).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape').catch(() => {});
  check('the map: the chat', await waitFor('[data-testid=map-party-chat-open]', 20000));
  await tid('map-party-chat-open').first().click();
  await tid('map-party-chat-tab-global').first().click().catch(() => {});
  const hello = await globalSay(sam, 'hello from sam 👋');
  await globalSay(bea, 'bea here, with a loom');
  check('lines come in', await until(async () => (await line('map-party-chat', 'bea here').count()) > 0), await text('[data-testid=map-party-chat-log]'));
  const samLine = line('map-party-chat', 'hello from sam');
  check('…with a small profile picture each', await samLine.locator('[data-testid=chat-avatar] svg, [data-testid=chat-avatar] img, [data-testid=chat-avatar] div').count() > 0
    && (await samLine.locator('[data-testid=chat-avatar]').boundingBox())?.width <= 22);
  const samName = samLine.locator('[data-testid=chat-name]');
  const samColor = await samName.evaluate((e) => getComputedStyle(e).color);
  check('…and names wear their rarest plot (an ultra: Volcano)', await samName.getAttribute('data-name-rarity') === 'volcano' && /rgb\(2[0-9]{2}, 1[0-9]{2}, /.test(samColor), samColor);
  const beaName = line('map-party-chat', 'bea here').locator('[data-testid=chat-name]');
  const beaCss = await beaName.evaluate((e) => ({ fill: getComputedStyle(e).webkitTextFillColor, bg: getComputedStyle(e).backgroundImage }));
  check('…a Primordial’s name is a band of its colours', await beaName.getAttribute('data-name-rarity') === 'loom' && /gradient/.test(beaCss.bg) && /rgba\(0, 0, 0, 0\)|transparent/.test(beaCss.fill), JSON.stringify(beaCss));
  await shot('01-faces-names');

  // reply from the line's menu
  await samLine.locator('xpath=ancestor::*[@data-testid="map-party-chat-line"][1]').click({ position: { x: 200, y: 8 } });
  check('tap a stranger’s line: Reply, Report, Block', await waitFor('[data-testid=map-party-chat-reply]', 4000) && await tid('map-party-chat-report').count() > 0);
  await tid('map-party-chat-reply').first().click();
  check('…Reply: the bar over the box says who you answer', await waitFor('[data-testid=map-party-chat-replying]', 4000) && /face_sam/.test(await text('[data-testid=map-party-chat-replying]'))
    && /Reply to @face_sam/.test(await tid('map-party-chat-input').first().getAttribute('placeholder')));
  await unburst();
  await tid('map-party-chat-input').first().fill('hi sam, love the volcano');
  await tid('map-party-chat-send').first().click();
  check('…sent as a reply', await until(async () => (await sql(`select reply_to from chat_messages where body = 'hi sam, love the volcano'`))[0]?.reply_to == hello.id));
  const mine = line('map-party-chat', 'love the volcano');
  check('…the line carries a quote of what it answers', await until(async () => /face_sam/.test(await mine.locator('[data-testid=chat-reply-quote]').textContent()) && /hello from sam/.test(await mine.locator('[data-testid=chat-reply-quote]').textContent())));
  check('…and the bar is gone', !(await tid('map-party-chat-replying').count()));
  check('sam is told: an alert', (await sql(`select count(*)::int n from player_notifications where player_id = '${sam}' and kind = 'chat_reply' and actor_id = '${me}'`))[0].n === 1);
  await mine.locator('[data-testid=chat-reply-quote]').click();
  check('…tap the quote: the line it answers glows', await until(async () => (await samLine.evaluate((e) => e.classList.contains('lv-chat-flash'))), 3000));
  await shot('02-reply');

  // an answer to you: it stands out, and pops up "replied to you" while the chat is closed
  await tid('map-party-chat-close').first().click(); await page.waitForTimeout(1200);
  const myMsg = (await sql(`select id from chat_messages where body = 'hi sam, love the volcano'`))[0].id;
  await globalSay(sam, 'thanks ivy! it erupts daily', myMsg);
  check('an answer to you pops up: “replied to you”', await waitFor('[data-testid=chat-popup-reply]', 15000) && /erupts daily/.test(await text('[data-testid=chat-popup]')));
  // (tap it straight away: a screenshot can outlast the pop-up)
  if (!(await tid('chat-popup').first().click({ timeout: 4000 }).then(() => true, () => false))) await tid('map-party-chat-open').first().click();
  await shot('03-replied-open');
  check('…and stands out in the chat', await until(async () => (await page.locator('[data-testid=map-party-chat-log] [data-testid=chat-line][data-to-me]', { hasText: 'erupts daily' }).count()) > 0));
  check('…its quote says “you”', /you/.test(await line('map-party-chat', 'erupts daily').locator('[data-testid=chat-reply-quote]').textContent()));

  // ---- a peek at a player ----
  await samName.click();
  check('tap a name: a peek at the player pops out', await waitFor('[data-testid=player-peek][data-player=face_sam]', 6000));
  await page.waitForTimeout(1400);
  check('…their rarest plot (Volcano ×2)', /Volcano/.test(await text('[data-testid=player-peek-rarest]')) && /×2/.test(await text('[data-testid=player-peek-rarest]')), await text('[data-testid=player-peek-rarest]'));
  check('…a few numbers', /Plots/.test(await text('[data-testid=player-peek-stats]')) && /3/.test(await text('[data-testid=player-peek-stats]')));
  check('…Reply, Profile, Friend, Party, Report, Block', await tid('player-peek-reply').count() > 0 && await tid('player-peek-profile').count() > 0 && await tid('friend-button').count() + await page.locator('[data-testid=player-peek] button', { hasText: /Add friend|Friend/ }).count() > 0
    && await page.locator('[data-testid=player-peek] [data-testid=invite-party]').count() > 0 && await tid('player-peek-report').count() > 0 && await tid('player-peek-block').count() > 0);
  check('…its show played once and holds still (no endless loops in it)', (await peekLoops()) === 0);
  const box = await page.locator('[data-testid=player-peek]').boundingBox();
  const vp = page.viewportSize();
  check(DESK ? '…a card by the name (big screen)' : '…a sheet from the bottom (phone)', DESK ? box.width <= 330 && box.y > 20 && box.y + box.height < vp.height - 8 : box.y + box.height > vp.height - 40 && box.width >= vp.width - 24, JSON.stringify(box));
  await shot('04-peek');
  await tid('player-peek-reply').first().click();
  check('…Reply from the peek: it closes and the box answers them', !(await page.locator('[data-testid=player-peek]').count()) && await waitFor('[data-testid=map-party-chat-replying]', 3000));
  await page.keyboard.press('Escape').catch(() => {});
  if (await tid('map-party-chat-reply-cancel').count()) await tid('map-party-chat-reply-cancel').first().click();
  check('…Esc / × stops replying', !(await tid('map-party-chat-replying').count()));
  // a peek from a face, then Profile
  await line('map-party-chat', 'bea here').locator('[data-testid=chat-avatar]').click();
  check('tap a face: their peek', await waitFor('[data-testid=player-peek][data-player=face_bea]', 6000) && /Loom/.test(await text('[data-testid=player-peek-rarest]')));
  await tid('player-peek-profile').first().click();
  check('…Profile opens their profile', await until(async () => !(await page.locator('[data-testid=player-peek]').count()) && /face_bea/.test(await text('[data-testid=profile-hero]')), 10000));

  // ---- your own name's colour ----
  await nav('/world'); await page.waitForTimeout(2500);
  if (await tid('map-party-chat-open').count()) await tid('map-party-chat-open').first().click();
  await tid('map-party-chat-tab-global').first().click().catch(() => {});
  await until(async () => (await line('map-party-chat', 'love the volcano').count()) > 0);
  const myName = line('map-party-chat', 'love the volcano').locator('[data-testid=chat-name]');
  check('your name wears your rarest plot too (Mythic)', await myName.getAttribute('data-name-rarity') === 'mythic');
  await myName.click();
  check('your own peek: pick your name’s colour', await waitFor('[data-testid=player-peek] [data-testid=name-color-picker]', 6000) && await waitFor('[data-testid=name-color-common]', 6000));
  await tid('name-color-common').first().click();
  check('…show off another rarity you own', await until(async () => (await sql(`select name_rarity from profiles where id = '${me}'`))[0].name_rarity === 'common'));
  await shot('05-own-peek');
  await page.keyboard.press('Escape');
  await unburst();
  await tid('map-party-chat-input').first().fill('now in green');
  await tid('map-party-chat-send').first().click();
  check('…your next line wears it', await until(async () => await line('map-party-chat', 'now in green').locator('[data-testid=chat-name]').getAttribute('data-name-rarity') === 'common'));
  await tid('map-party-chat-close').first().click().catch(() => {});

  // ---- the Social page's chat ----
  await nav('/social?tab=chat'); await page.waitForTimeout(3000);
  check('the Social page chat: names in colour', await waitFor('[data-testid=chat-message] [data-testid=chat-name][data-name-rarity=volcano]', 15000));
  const sMsg = page.locator('[data-testid=chat-message]', { hasText: 'bea here' }).last();
  await sMsg.hover().catch(() => {});
  await sMsg.locator('[data-testid=chat-reply]').click({ force: true });
  check('…Reply there too', await waitFor('[data-testid=chat-replying]', 4000) && /face_bea/.test(await text('[data-testid=chat-replying]')));
  await unburst();
  await tid('chat-input').first().fill('the loom is wild');
  await tid('chat-send').first().click();
  const beaMsg = (await sql(`select id from chat_messages where body = 'bea here, with a loom'`))[0].id;
  check('…sent as a reply, with its quote', await until(async () => (await sql(`select reply_to from chat_messages where body = 'the loom is wild'`))[0]?.reply_to == beaMsg)
    && await until(async () => /face_bea/.test(await page.locator('[data-testid=chat-message]', { hasText: 'the loom is wild' }).last().locator('[data-testid=chat-reply-quote]').textContent())));
  check('…an answer to you stands out', await page.locator('[data-testid=chat-message][data-to-me]', { hasText: 'erupts daily' }).count() > 0);
  await page.locator('[data-testid=chat-message]', { hasText: 'hello from sam' }).first().locator('[data-testid=chat-name]').click();
  check('…tap a name: the peek', await waitFor('[data-testid=player-peek][data-player=face_sam]', 6000),
    await page.evaluate(() => { const e = document.querySelector('[data-testid=player-peek]'); return e ? `${e.getAttribute('data-player')} ${e.getAttribute('style')}` : `none; scrims ${document.querySelectorAll('[data-testid=player-peek-scrim]').length}`; }));
  await shot('06-social-chat');
  await page.keyboard.press('Escape');

  // ---- the Party page's chat (you're in a party) ----
  await as(me, 'party_create', { p_name: null, p_visibility: 'public', p_activity: 'hangout' });
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await nav('/party'); await page.waitForTimeout(2500);
  if (await waitFor('[data-testid=party-chat-tab-global]', 10000)) {
    await tid('party-chat-tab-global').first().click();
    await page.waitForTimeout(800);
    const pl = page.locator('[data-testid=party-chat-line]', { hasText: 'hello from sam' }).first();
    await pl.click({ position: { x: 220, y: 8 } });
    await tid('party-chat-reply').first().click().catch(() => {});
    check('the Party page chat: Reply there too', await waitFor('[data-testid=party-chat-replying]', 4000));
    check('…names in colour on the light panel too', await page.locator('[data-testid=party-chat-log] [data-testid=chat-name][data-name-rarity=volcano]').count() > 0);
    await shot('07-party-chat');
  } else check('the Party page chat', false, 'no chat there');

  // ---- your profile: the name colour picker ----
  await nav('/u/face_ivy'); await page.waitForTimeout(2500);
  check('your profile: pick your name’s colour there', await waitFor('[data-testid=profile-hero]', 15000) && await waitFor('[data-testid=name-color-picker]', 8000));
  await tid('name-color-auto').first().click();
  check('…back to your rarest', await until(async () => (await sql(`select name_rarity from profiles where id = '${me}'`))[0].name_rarity === null));
  await shot('08-profile-picker');

  check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (e) {
  console.error(e);
  check('the run finished', false, e.message);
  await shot('99-crash');
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
