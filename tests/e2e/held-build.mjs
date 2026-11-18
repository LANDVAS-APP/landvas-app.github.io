// The app build a store is reviewing, against TODAY's server. A build under review stays on the code inside it (Live
// control's review hold), while the server keeps changing with every deploy: when a migration drops or renames
// something that build reads, the reviewer's app breaks (Nov 2026: `enchant_map2` stopped returning `walkers`, the
// held 1.0.0 crashed on the World map with "l.walkers is not iterable", and Google Play rejected it).
//
// Opens the build in a simulated Android app shell, signs up, makes a plot of every kind, flies the World map in and
// out (where the map's live layers load) and opens every screen the build has. Fails on any crash: an uncaught error, a
// screen's "hit a snag" page, React Router's developer error page, or a known crash message in the console.
//
// Today's build:   npm run build:artifact && node tests/e2e/held-build.mjs
// A held build:    git worktree add ../held <commit> && cp -r supabase/migrations ../held/supabase/ (today's server)
//                  && (cd ../held && npm run build:artifact) && E2E_DIST=../held/dist-artifact node tests/e2e/held-build.mjs
//                  (scripts/held-build-check.mjs does all of that for every version on Live control's review hold)
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/held-build');
const PLATFORM = process.env.E2E_PLATFORM || 'android';
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.E2E_PORT || 4361), G = 4194304;
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { lng: ((gx + 0.5) / G) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const KINDS = ['canvas', 'habitat', 'farm', 'business', 'arcade', 'mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl', 'home', 'landlord', 'train', 'plane'];
// what a crash looks like in the console (React logs every error a boundary caught)
const CRASH = /is not iterable|Cannot read propert(y|ies) of (undefined|null)|undefined is not an object|null is not an object|is not a function|Cannot convert undefined or null|Unexpected Application Error|Minified React error/i;

const server = await serve(DIST, PORT);
// (exit 3: no browser on this machine — the check couldn't run, which isn't the build's fault)
const browser = await launch().catch((e) => { console.log(`::warning::no browser for the held-build check: ${String(e).slice(0, 200)}`); server.close(); process.exit(3); });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const here = ll(START.gx, START.gy);
await ctx.addInitScript(([lat, lng, platform]) => {
  const pos = { coords: { latitude: lat, longitude: lng, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
  const Geolocation = {
    checkPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }), requestPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }),
    getCurrentPosition: async () => ({ ...pos, timestamp: Date.now() }),
    watchPosition: async (_o, cb) => { setTimeout(() => cb({ ...pos, timestamp: Date.now() }), 50); return 'w1'; },
    clearWatch: async () => {},
  };
  window.CapacitorCustomPlatform = { name: platform, plugins: { Geolocation } };
}, [here.lat, here.lng, PLATFORM]);
const page = await ctx.newPage();
const crashes = [];
let where = '(start)';
page.on('pageerror', (e) => crashes.push({ where, what: `uncaught: ${e.message}` }));
page.on('console', (m) => { if (m.type() === 'error' && CRASH.test(m.text())) crashes.push({ where, what: `console: ${m.text().split('\n')[0].slice(0, 200)}` }); });
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const api = (f, ...a) => page.evaluate(([f, a]) => (window.__landvasApi[f] ? window.__landvasApi[f](...a) : Promise.reject(new Error(`no api.${f} in this build`))), [f, a]);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const fly = (gx, gy, zoom) => page.evaluate(([c, zoom]) => window.__landvasMap?.jumpTo({ center: [c.lng, c.lat], zoom }), [ll(gx, gy), zoom]);
/** the screen on show is an error screen (ours, or React Router's developer page) */
const errorScreen = () => page.evaluate(() => {
  if (document.querySelector('[data-testid=route-error]')) return `"${document.querySelector('[data-testid=route-error]').textContent.trim().slice(0, 80)}"`;
  const t = document.body.innerText;
  if (/Unexpected Application Error|Hey developer|errorElement/.test(t)) return `React Router error page: ${t.split('\n').slice(0, 2).join(' ').slice(0, 160)}`;
  return null;
});
const check = async (label) => {
  where = label;
  const e = await errorScreen().catch(() => null);
  if (e && !crashes.some((c) => c.where === label && c.what.startsWith('screen'))) {
    crashes.push({ where: label, what: `screen: ${e}` });
    await page.screenshot({ path: path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, '_')}.png`) }).catch(() => {});
  }
  console.log(`${e ? 'CRASH' : 'ok   '} ${label}${e ? `  ${e}` : ''}`);
};

where = 'start';
await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
await page.waitForSelector('[data-testid=title-play], #email', { timeout: 120000 });
if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
await page.waitForSelector('#email', { timeout: 30000 });
await page.fill('#email', `held${Date.now() % 100000}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
await page.waitForSelector('#username', { timeout: 30000 });
await page.fill('#username', `held${Date.now() % 100000}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
await page.click('[data-testid=place-gps]').catch(() => {});
await page.waitForTimeout(3000);
await page.keyboard.press('Escape').catch(() => {});
await check('/world (first open)');

// a plot of every kind, plenty of Ink, a clan
const me = (await sql(`select p.id, pr.username from players p join profiles pr on pr.id = p.id order by p.created_at desc limit 1`))[0];
await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`).catch(() => {});
await sql(`insert into resource_balances (player_id, resource, amount) values ('${me.id}', 'ink', 500000) on conflict (player_id, resource) do update set amount = 500000`).catch(() => {});
await api('claimStarter', START.gx, START.gy).catch((e) => console.log('  (starter:', String(e).slice(0, 100), ')'));
for (let i = 1; i < KINDS.length; i++) await api('acquirePlot', START.gx + i * 2, START.gy).catch(() => {});
let groups = await api('myGroups').catch(() => []);
const byCell = (gx) => groups.find((g) => g.cells?.some((c) => c[0] === gx && c[1] === START.gy));
for (let i = 0; i < KINDS.length; i++) { const g = byCell(START.gx + i * 2); if (g) await api('setGroupKind', g.id, KINDS[i]).catch(() => {}); }
groups = await api('myGroups').catch(() => []);
const kind = (k) => groups.find((g) => (g.kind ?? g.plot_kind) === k) ?? byCell(START.gx + KINDS.indexOf(k) * 2);
const clan = await api('clanFound', { name: 'Held check', tag: 'HLD', emblem: 'shield', color: '#7B5CFF', motto: null, privacy: 'open' }).catch(() => null);
await page.evaluate(() => window.__landvasQc.invalidateQueries());
const id = (k, f) => kind(k)?.[f] ?? kind(k)?.id ?? 'none';

// the World map at every distance: its live layers (enchantments, storms, suns, rarities, the Leviathan…) load as you zoom in
await nav('/world');
await page.waitForTimeout(2500);
for (const z of [3, 8, 11, 13, 15, 17, 18.5, 20]) {
  await fly(START.gx + 8, START.gy, z);
  await page.waitForTimeout(z >= 12 ? 3500 : 1500);
  await check(`/world zoom ${z}`);
}
// tap the middle of the map and a plot (a plot sheet opens)
await page.mouse.click(196, 430).catch(() => {});
await page.waitForTimeout(1500);
await check('/world (tapped a plot)');
await page.keyboard.press('Escape').catch(() => {});

const ROUTES = [
  '/world', '/hub', '/play', '/together', '/magic', '/ultras', '/new', '/outside', '/canvases', '/me', '/plots', '/inkborn', '/inkborn/create', '/inkborn/visit', '/inkborn/keeper',
  '/social', '/party', '/clans', clan?.id ? `/clans/${clan.id}` : null, '/invite', '/players', `/u/${me.username}`, '/explorer', '/achievements', '/legend', '/grimoire', '/stars', '/clips',
  '/guide', '/handbook', '/handbook/start', '/royalty', '/fusion', '/primordials', '/rankings/rarities', '/leaderboards', '/inventory', '/events', '/settings', '/support',
  '/pvp', '/challenges', '/sketch', '/doodle', '/duet', '/space', '/gallery', `/powers/${START.gx}:${START.gy}`,
  '/legal/terms', '/legal/privacy', '/legal/delete-account',
  `/create/${id('canvas', 'id')}`, '/habitat', `/farm/${id('farm', 'farm_id')}`, `/business/${id('business', 'business_id')}`, `/arcade/${id('arcade', 'arcade_id')}`,
  ...['mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl'].map((k) => `/realm/${id(k, 'realm_id')}`), `/landlord/${id('landlord', 'id')}`,
  clan?.id ? '/clan/hall' : null, '/home', `/u/${me.username}/room`, '/space/surface',
  ...['lightlines', 'paintpop', 'colorburst', 'tracecraft'].map((g) => `/play/${g}`),
  '/world',
].filter(Boolean);
for (const r of ROUTES) {
  where = r;
  await nav(r).catch(() => {});
  await page.waitForTimeout(/^\/(world|space|realm|farm|business|arcade|habitat|home|u\/.+\/room|landlord|clan\/hall)/.test(r) ? 3000 : 1500);
  await page.keyboard.press('Escape').catch(() => {});
  await check(r);
}
// simple mode too
await page.evaluate(() => window.__landvasUi?.getState().updateSettings({ simpleMode: true })).catch(() => {});
for (const r of ['/world', '/play']) { where = `${r} (simple)`; await nav(r); await page.waitForTimeout(1800); await check(`${r} (simple mode)`); }

await browser.close();
server.close();
const seen = new Set();
const unique = crashes.filter((c) => { const k = c.what.replace(/at .*/, ''); if (seen.has(k)) return false; seen.add(k); return true; });
fs.writeFileSync(path.join(OUT, 'crashes.json'), JSON.stringify(crashes, null, 1));
if (unique.length) {
  console.log(`\n${unique.length} crash(es) in ${DIST}:`);
  for (const c of unique) console.log(`  ${c.where}: ${c.what}`);
  process.exit(1);
}
console.log(`\nno crashes in ${DIST} (${ROUTES.length} screens, the map at 8 zoom levels)`);
