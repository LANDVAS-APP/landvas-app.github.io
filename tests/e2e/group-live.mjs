// Real-browser test of travelling together, live (local-mode build):
//  - lea and max are a travel group; at home nothing at all goes over the group's channel (no GPS, ever)
//  - flying to London together; there, lea sends her position live, and sees max as his own explorer, moving live
//  - emotes and "meet me here" pings, both ways
//  - group games where they are: Balloon Rush and Flag Race; a group photo
//  - the 3D things on the map
// "max" on the channel is a second tab (the local build's stand-in for realtime is BroadcastChannel).
// Run: npm run build:artifact && node tests/e2e/group-live.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-group-live');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4204, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 }; // downtown Salt Lake City
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
// HUD buttons that aren't happening right now sit in the map's "+" tray: open it first if needed
async function hud(id) {
  const el = page.locator(`[data-testid=${id}]`).first();
  if (!(await el.isVisible().catch(() => false))) { await page.click('[data-testid=hud-more]'); await page.waitForTimeout(450); }
  await el.click();
}
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const URL = `http://localhost:${PORT}/?e2e=1`;
const explorer = () => page.evaluate(() => window.__landvasExplorer.getState().state);
const syncExplorer = () => page.evaluate(async () => { const r = await window.__landvasApi.myExplorer(); window.__landvasExplorer.getState().set(r); return r; });
const refresh = () => page.evaluate(() => window.__landvasTravel.refresh());
const jump = (lng, lat, zoom) => page.evaluate(([lng, lat, zoom]) => { const m = window.__landvasMap; m.fire('dragstart'); m.jumpTo({ center: [lng, lat], zoom }); }, [lng, lat, zoom]);

async function authForm() {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) { await page.locator('button,a').filter({ hasText: /sign in/i }).first().click(); }
  await page.waitForSelector('#email', { timeout: 30000 });
}
async function signUp(email, username) {
  await authForm();
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  // the first account is asked where to start; after that GPS is already allowed
  await page.waitForFunction(() => !!document.querySelector('[data-testid=place-gps]') || !!document.querySelector('.lv-explorer'), null, { timeout: 12000 }).catch(() => {});
  if (await page.locator('[data-testid=place-gps]').count()) await page.click('[data-testid=place-gps]');
  else if (!(await page.locator('.lv-explorer').count())) {
    // GPS is already on from the last account: report where we are
    await page.waitForFunction(() => !!window.__landvasApi, null, { timeout: 20000 });
    const p = ll(START.gx, START.gy);
    const r = await api('reportPosition', p.longitude, p.latitude, 8);
    await page.evaluate((r) => window.__landvasExplorer.getState().set(r), r);
  }
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);
}
async function switchUser() {
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(800);
  await nav('/world'); await page.waitForTimeout(1500);
}
async function signIn(email) {
  await switchUser();
  await authForm();
  await page.locator('button').filter({ hasText: /^Sign in$/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForFunction(() => !!window.__landvasApi && !document.querySelector('#email'), null, { timeout: 30000 });
  await page.waitForTimeout(3000);
}
async function openTravel(tab) {
  await hud('travel-button'); await page.waitForTimeout(800);
  if (tab) { await page.locator('[role=tab]').filter({ hasText: tab }).first().click(); await page.waitForTimeout(1000); }
}

try {
  await page.goto(URL, { waitUntil: 'load' });
  await signUp('lea@example.test', 'lea_lead');
  const s0 = await api('claimStarter', START.gx, START.gy, 'Lea air');
  await api('setGroupKind', s0.group_id, 'plane');
  const code = (await api('travelGroupCreate')).group.code;
  await switchUser();
  await signUp('max@example.test', 'max_mate');
  await api('claimStarter', START.gx + 3, START.gy + 3, 'Max place');
  await api('travelGroupJoin', code);
  const maxId = (await api('myState')).user_id;
  await signIn('lea@example.test');
  const leaId = (await api('myState')).user_id;
  const g0 = await api('travelGroup');
  const chan = g0.group.channel;
  check('the group has a private channel', /^tg-[0-9a-f]{32}$/.test(chan));
  await page.evaluate(() => window.__landvasTravel.qc.invalidateQueries({ queryKey: ['travel-group'] })); await page.waitForTimeout(1500);

  // "max" (another tab), listening on the group's channel
  const tab = await ctx.newPage();
  await tab.goto(`http://localhost:${PORT}/favicon-48.png`);
  await tab.evaluate((chan) => { window.heard = []; window.bc = new BroadcastChannel(`landvas-live:${chan}`); window.bc.onmessage = (e) => window.heard.push(e.data); }, chan);
  const say = (m) => tab.evaluate((m) => window.bc.postMessage(m), m);
  const heard = () => tab.evaluate(() => window.heard);

  // ---- at home: nothing goes out ----------------------------------------------------------------------------------
  await page.waitForTimeout(4500);
  const home = (await heard()).filter((m) => m.t === 'pos' || m.t === 'ping');
  check('at home, nothing about where lea is goes over the channel', home.length === 0, JSON.stringify(home).slice(0, 120));

  // ---- fly to London together ------------------------------------------------------------------------------------
  await api('travelDepart', 'plane', 'ap:LHR');
  await sql(`update travel_trips set arrives_at = now() - interval '1 second' where not arrived`);
  await sql(`update explorers set fixed_at = fixed_at - interval '3 hours' where mode = 'travel'`);
  await refresh(); await page.waitForTimeout(2500);
  await page.click('[data-testid=arrival-close]').catch(() => {}); await page.waitForTimeout(500);
  const at = await syncExplorer();
  check('lea is at Heathrow', Math.abs(at.lat - 51.47) < 0.05 && at.mode === 'travel');
  await page.evaluate(() => window.__landvasTravel.qc.invalidateQueries({ queryKey: ['travel-group'] })); await page.waitForTimeout(4000);
  const mine = (await heard()).filter((m) => m.t === 'pos' && m.id === leaId);
  check('away, lea’s position goes out live to her group', mine.length > 0 && Math.abs(mine.at(-1).lat - 51.47) < 0.05, `${mine.length} updates`);

  // ---- max, live, as his own explorer ----------------------------------------------------------------------------
  await jump(at.lng, at.lat, 17.2); await page.waitForTimeout(1500);
  const R = 111320 * Math.cos((at.lat * Math.PI) / 180);
  for (let i = 0; i <= 10; i++) { await say({ t: 'pos', id: maxId, lng: at.lng + (20 + i * 4) / R, lat: at.lat + 10 / 110574, v: 'bike' }); await page.waitForTimeout(250); }
  await page.waitForTimeout(800);
  const mate = page.locator('[data-testid=group-mate][data-user=max_mate]');
  check('max shows as his own explorer', (await mate.count()) === 1 && (await mate.getAttribute('class')).includes('lv-explorer'));
  check('…on his bike', (await mate.getAttribute('class')).includes('veh-bike'));
  const x1 = (await mate.boundingBox()).x;
  for (let i = 0; i <= 8; i++) { await say({ t: 'pos', id: maxId, lng: at.lng + (60 + i * 5) / R, lat: at.lat + 10 / 110574, v: 'bike' }); await page.waitForTimeout(250); }
  await page.waitForTimeout(700);
  const x2 = (await mate.boundingBox()).x;
  check('…moving live as he rides', x2 - x1 > 20, `${Math.round(x1)} → ${Math.round(x2)} px`);
  await shot('01-max-live');

  // ---- emotes and pings ------------------------------------------------------------------------------------------
  await say({ t: 'emote', id: maxId, e: 'wave' }); await page.waitForTimeout(500);
  check('max waves: 👋 over his explorer', (await page.locator('[data-testid=group-mate][data-user=max_mate] .lv-emote').innerText().catch(() => '')) === '👋');
  await shot('02-max-waves');
  await say({ t: 'ping', id: maxId, lng: at.lng + 80 / R, lat: at.lat - 40 / 110574 }); await page.waitForTimeout(700);
  check('max pings “meet me here”', (await page.locator('[data-testid=group-ping]').count()) === 1 && (await page.locator('[data-sonner-toast]').filter({ hasText: /meet me here/ }).count()) >= 1);
  await say({ t: 'pos', id: maxId, lng: at.lng + 100 / R, lat: at.lat + 10 / 110574, v: 'bike' }); await page.waitForTimeout(300);
  await hud('group-button'); await page.waitForTimeout(800);
  check('the group panel: max is here, live', /live/.test(await page.locator('[data-testid=play-member]').filter({ hasText: 'max_mate' }).innerText()));
  await shot('03-group-panel');
  await page.click('[data-testid=emote-dance]'); await page.waitForTimeout(600);
  check('lea dances: over her own explorer…', await page.evaluate(() => { const e = document.querySelector('.lv-explorer:not(.lv-mate)'); return !!e?.classList.contains('dancing') && e.querySelector('.lv-emote')?.textContent === '💃'; }));
  check('…and max hears it', (await heard()).some((m) => m.t === 'emote' && m.id === leaId && m.e === 'dance'));

  // ---- Balloon Rush ---------------------------------------------------------------------------------------------
  // max is really there too (the server's view), so the group can play
  await sql(`update explorers set lng = ${at.lng + 60 / R}, lat = ${at.lat} where player_id = '${maxId}'`);
  await hud('group-button'); await page.waitForTimeout(700);
  await page.click('[data-testid=start-balloons]'); await page.waitForTimeout(1200);
  check('Balloon Rush: a countdown', (await page.locator('[data-testid=game-countdown]').count()) === 1);
  await jump(at.lng, at.lat, 15.4); await page.waitForTimeout(1500);
  check('…and the balloons fill the streets around', (await page.locator('[data-testid=game-item]').count()) === 22);
  const onScreen = await page.locator('[data-testid=game-item]').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }).length);
  check('…and they’re all right there on screen (not stacked off it)', onScreen >= 11, `${onScreen}/22`);
  await shot('04-balloon-rush');
  check('…heard by max, so his map picks it up at once', (await heard()).some((m) => m.t === 'game' && m.id === leaId));
  const game = await api('groupGameStatus');
  await page.waitForTimeout(4500);
  const b = game.items[3];
  await sql(`update explorers set lng = ${b.lng + 0.00005}, lat = ${b.lat} where player_id = '${leaId}'`);
  await syncExplorer(); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-testid=game-item][data-i="3"]')?.click()); await page.waitForTimeout(1800);
  check('lea pops a balloon: “You 1”', /You 1/.test(await page.locator('[data-testid=game-scores]').innerText().catch(() => '')));
  await sql(`update group_games set ends_at = now() - interval '1 second' where id = '${game.id}'`);
  await page.waitForSelector('[data-testid=game-result]', { timeout: 10000 }).catch(() => {});
  check('time’s up: lea won', /you won/.test(await page.locator('[role=dialog]').filter({ has: page.locator('[data-testid=game-result]') }).innerText().catch(() => '')));
  await shot('05-balloons-result');
  await page.click('[data-testid=game-result-close]').catch(() => {}); await page.waitForTimeout(600);

  // ---- Flag Race ------------------------------------------------------------------------------------------------
  await hud('group-button'); await page.waitForTimeout(700);
  await page.click('[data-testid=start-race]'); await page.waitForTimeout(1200);
  const race = await api('groupGameStatus');
  check('Flag Race: a flag goes up', race.kind === 'race' && (await page.locator('[data-testid=game-item]').count()) === 1);
  await jump(race.items[0].lng, race.items[0].lat, 16.8); await page.waitForTimeout(5000);
  await shot('06-flag');
  // the flag stands where it is (map markers must not fall out of place)
  const fb = await page.locator('[data-testid=game-item]').boundingBox();
  check('the flag stands right where it is on the map', !!fb && Math.abs(fb.x + fb.width / 2 - 215) < 30 && Math.abs(fb.y + fb.height - 430) < 40, fb ? `${Math.round(fb.x)},${Math.round(fb.y)}` : 'none');
  await sql(`update explorers set lng = ${race.items[0].lng + 0.00003}, lat = ${race.items[0].lat} where player_id = '${leaId}'`);
  await syncExplorer(); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-testid=game-item]')?.click()); await page.waitForTimeout(2500);
  check('lea reaches it first: she wins', /you won/.test(await page.locator('[role=dialog]').filter({ has: page.locator('[data-testid=game-result]') }).innerText().catch(() => '')));
  await page.click('[data-testid=game-result-close]').catch(() => {}); await page.waitForTimeout(600);

  // ---- group photo ----------------------------------------------------------------------------------------------
  await sql(`update explorers set lng = ${at.lng}, lat = ${at.lat} where player_id = '${leaId}'`);
  await sql(`update explorers set lng = ${at.lng + 30 / R}, lat = ${at.lat} where player_id = '${maxId}'`);
  await syncExplorer();
  await hud('group-button'); await page.waitForTimeout(700);
  await page.click('[data-testid=group-photo]'); await page.waitForTimeout(1500);
  const pol = await page.locator('[data-testid=polaroid]').innerText().catch(() => '');
  check('a group photo at Heathrow with lea and max', /Heathrow/.test(pol) && /@lea_lead/.test(pol) && /@max_mate/.test(pol), pol.replace(/\n/g, ' '));
  await shot('07-group-photo');
  await page.click('[data-testid=photo-close]'); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // ---- the map stays clean: no collectables -----------------------------------------------------------------------
  await jump(at.lng, at.lat, 15.6); await page.waitForTimeout(3000);
  check('no collectables on the map', (await page.locator('[data-testid=map-find]:not(.game)').count()) === 0);

  // ---- heading home: lea drops off the channel -------------------------------------------------------------------
  await tab.evaluate(() => { window.heard = []; });
  await api('travelHome'); await refresh(); await page.waitForTimeout(3500);
  const out = await heard();
  check('heading home, lea says bye and sends nothing more', out.some((m) => m.t === 'bye' && m.id === leaId) && !out.some((m) => m.t === 'pos' && m.id === leaId && out.findIndex((x) => x.t === 'bye') < out.indexOf(m)), JSON.stringify(out.map((m) => m.t)));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run completed', false, e.message.split('\n')[0]);
  await shot('99-error');
} finally {
  await browser.close(); server.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
}
