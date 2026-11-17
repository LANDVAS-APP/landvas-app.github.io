// Real-browser test of parties (local-mode build):
//  - ana starts a public party from the Party button on the map (name, Public, what they're up to) and gets her link
//  - ben finds it in the lobbies (busiest first) and joins; party chat works on the Party page and on the map
//  - ben invites cal from "Online now"; cal gets the invite as a pop-up and joins from it
//  - a brand-new player opens the party link signed out, signs up, and lands right in the party
//  - the arcade: a Party button and a chat with Arcade and Party tabs
//  - privacy: the two new switches are in Settings
// Run: npm run build:artifact && node tests/e2e/parties.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-parties');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4231, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 }; // downtown Salt Lake City
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const refetchParty = () => page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['travel-group'] }));
const URL = `http://localhost:${PORT}/?e2e=1`;
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
const visible = (id) => tid(id).first().isVisible().catch(() => false);

async function authForm() {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in|play free|get started/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) { await page.locator('button,a').filter({ hasText: /sign in/i }).first().click().catch(() => {}); }
  await page.waitForSelector('#email', { timeout: 30000 });
}
async function signUp(email, username, { place = true } = {}) {
  await authForm();
  // (the form may open on "Sign in": switch to creating an account)
  const create = page.locator('button').filter({ hasText: /create (an )?account|sign up/i }).first();
  if (await create.isVisible().catch(() => false)) await create.click().catch(() => {});
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#username'), null, { timeout: 20000 }).catch(() => {});
  if (!place) return;
  await page.waitForTimeout(1200);
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]').catch(() => {});
  const p = ll(START.gx, START.gy);
  const r = await api('reportPosition', p.longitude, p.latitude, 8).catch(() => null);
  if (r) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r);
  await page.waitForTimeout(1200);
}
async function signOut() {
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(800);
}
async function signIn(email) {
  await signOut();
  await nav('/world'); await page.waitForTimeout(1200);
  await authForm();
  await page.locator('button').filter({ hasText: /^Sign in$/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi && !document.querySelector('#email'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
}
// someone is "online": their app said what it's on within the last few minutes
const online = (username) => sql(`insert into player_activity (player_id, kind, detail, at) select id, 'map', '{}', now() from profiles where username = '${username}'
  on conflict (player_id) do update set at = now()`);
async function openSheet() {
  await tid('party-nav').first().click(); await page.waitForTimeout(900);
  return visible('party-panels');
}
async function sheetTab(name) { await page.locator('[role=dialog] [role=tab]').filter({ hasText: name }).first().click(); await page.waitForTimeout(900); }

try {
  await page.goto(URL, { waitUntil: 'load' });
  // ---- ana starts a public party from the map -------------------------------------------------------------------------
  await signUp('ana@example.test', 'ana_party');
  await nav('/world'); await page.waitForTimeout(2500);
  check('the map has a Party button', await visible('party-nav'));
  check('it opens the Party sheet', await openSheet());
  check('…on the lobbies when you’re not in a party', await visible('party-lobbies'));
  await shot('01-lobbies-empty');
  await sheetTab('Party');
  await tid('party-name-input').fill('Night owls');
  await tid('party-vis-public').click();
  await tid('party-activity-arcade').click();
  await shot('02-start-party');
  await tid('party-create').click(); await page.waitForTimeout(1500);
  check('starting a party goes on to inviting', await visible('party-invite-panel'));
  const link = (await tid('party-link-url').first().textContent()) ?? '';
  const g0 = (await api('travelGroup')).group;
  check('the party link carries the code and ana’s invite code', link.includes(`/party/join?c=${g0.code}`) && /&ref=/.test(link), link);
  check('the party is public, named, and up to the arcade', g0.name === 'Night owls' && g0.visibility === 'public' && g0.activity === 'arcade');
  await shot('03-invite-panel');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ---- ben finds it in the lobbies and joins ------------------------------------------------------------------------
  await signOut(); await nav('/world'); await page.waitForTimeout(1200);
  await signUp('ben@example.test', 'ben_party');
  await online('ana_party');
  await nav('/party?tab=lobbies'); await page.waitForTimeout(2500);
  const lobby = page.locator('[data-testid=lobby][data-name="Night owls"]');
  await lobby.first().waitFor({ timeout: 20000 }).catch(() => {});
  check('ben sees ana’s party in the lobbies', (await lobby.count()) === 1);
  check('…with who’s online', /1 online/.test((await lobby.locator('[data-testid=lobby-online]').textContent()) ?? ''));
  await shot('04-lobbies');
  await lobby.locator('[data-testid=lobby-join]').click(); await page.waitForTimeout(2000);
  check('ben joins with one tap', await visible('my-party'));
  check('…and both are listed', (await page.locator('[data-testid=party-member]').count()) === 2);
  await tid('party-chat-tab-party').click(); await page.waitForTimeout(300);
  await tid('party-chat-input').fill('hi from ben 👋');
  await tid('party-chat-send').click(); await page.waitForTimeout(1200);
  const log = (await tid('party-chat-log').textContent()) ?? '';
  check('party chat: ben’s message shows', log.includes('hi from ben'));
  check('…after the "joined" line', /joined the party/.test(log));
  await shot('05-my-party');

  // ---- the party chat on the map ------------------------------------------------------------------------------------
  await nav('/world'); await page.waitForTimeout(2500);
  check('the map shows the party chat', await visible('map-party-chat-open'));
  await tid('map-party-chat-open').click(); await page.waitForTimeout(600);
  await tid('map-party-chat-tab-party').click(); await page.waitForTimeout(300);
  await tid('map-party-chat-input').fill('meet at the arcade');
  await tid('map-party-chat-send').click(); await page.waitForTimeout(1200);
  check('…and sends from there', ((await tid('map-party-chat-log').textContent()) ?? '').includes('meet at the arcade'));
  await shot('06-map-chat');
  await tid('map-party-chat-close').click(); await page.waitForTimeout(300);

  // ---- ben invites cal from Online now -----------------------------------------------------------------------------
  await signOut(); await nav('/world'); await page.waitForTimeout(1200);
  await signUp('cal@example.test', 'cal_party', { place: false });
  await signIn('ben@example.test');
  await online('cal_party');
  await nav('/party?tab=invite'); await page.waitForTimeout(2500);
  const calRow = page.locator('[data-testid=party-targets-online] [data-testid=party-target][data-user=cal_party]');
  await calRow.first().waitFor({ timeout: 20000 }).catch(() => {});
  check('cal is in “Online now”', (await calRow.count()) === 1);
  await calRow.locator('[data-testid=party-target-invite]').click(); await page.waitForTimeout(1500);
  check('…and gets invited', /Invited/.test((await calRow.textContent()) ?? ''));
  await shot('07-invited');
  await signIn('cal@example.test');
  await refetchParty();
  await page.waitForSelector('[data-testid=party-invite-toast]', { timeout: 15000 }).catch(() => {});
  check('cal gets the invite as a pop-up', await visible('party-invite-toast'));
  await shot('08-invite-toast');
  await tid('party-invite-toast-join').first().click(); await page.waitForTimeout(2000);
  const g1 = (await api('travelGroup')).group;
  check('cal joins from the pop-up', g1?.name === 'Night owls' && g1.members.length === 3, `${g1?.members.length}`);

  // ---- the link, for someone who isn't on LANDVAS yet ---------------------------------------------------------------
  await signOut();
  await nav(`/party/join?c=${g0.code}`); await page.waitForTimeout(2500);
  check('signed out, the link shows the party', ((await tid('party-link-name').textContent()) ?? '') === 'Night owls');
  await shot('09-link-signed-out');
  await tid('party-link-signup').click(); await page.waitForTimeout(1500);
  await signUp('dee@example.test', 'dee_party', { place: false });
  await page.waitForTimeout(4000);
  const g2 = (await api('travelGroup')).group;
  check('the new player lands right in the party', g2?.name === 'Night owls' && g2.members.some((m) => m.username === 'dee_party'), JSON.stringify(g2?.members.map((m) => m.username)));
  await shot('10-new-player-in');

  // ---- the arcade: party button and chat ----------------------------------------------------------------------------
  const here = ll(START.gx, START.gy);
  await api('reportPosition', here.longitude, here.latitude, 8).catch(() => null);
  const p = await api('claimStarter', START.gx, START.gy, 'Dee arcade').catch((e) => { console.log('note  claim:', String(e?.message ?? e)); return null; });
  if (p?.group_id) {
    const a = await api('setGroupKind', p.group_id, 'arcade');
    await nav(`/arcade/${a.arcade_id}`); await page.waitForTimeout(6000);
    check('the arcade has a Party button', await visible('arcade-party-btn'));
    check('the arcade has a chat', await visible('arcade-chat-open'));
    await tid('arcade-chat-open').click(); await page.waitForTimeout(500);
    check('…with Global, Arcade and Party tabs', (await visible('arcade-chat-tab-global')) && (await visible('arcade-chat-tab-arcade')) && (await visible('arcade-chat-tab-party')));
    await tid('arcade-chat-tab-arcade').click(); await page.waitForTimeout(300);
    await tid('arcade-chat-input').fill('anyone up for skeeball?');
    await tid('arcade-chat-send').click(); await page.waitForTimeout(1500);
    check('…and the room chat sends', ((await tid('arcade-chat-log').textContent()) ?? '').includes('skeeball'));
    await shot('11-arcade-chat');
    await page.keyboard.press('Escape');
  } else check('dee could claim a plot for the arcade check', false);

  // ---- privacy switches ---------------------------------------------------------------------------------------------
  await nav('/settings'); await page.waitForTimeout(2500);
  check('Settings has “Show me in Online now”', (await page.locator('#pv-online').count()) === 1);
  check('Settings has “Anyone can invite me to a party”', (await page.locator('#pv-party_invites').count()) === 1);
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
