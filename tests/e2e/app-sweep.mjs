// Every screen of the iOS / Android app at phone size, in a simulated iPhone app shell with the iPhone's real safe
// areas (notch / Dynamic Island on top, home bar below). One place of every kind is built first so the place screens
// open for real. For each screen it flags anything that sticks out past the screen edge, makes the page or the main
// area scroll sideways, or sits under the notch / home bar, and saves a screenshot (top, and scrolled to the bottom).
// Run: npm run build:artifact && node tests/e2e/app-sweep.mjs        (PHONE=SE for one phone, ROUTES=/a,/b for a few)
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/app-sweep');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 4351, G = 4194304;
// [name, width, height, safe top, safe bottom]
const PHONES = [
  ['iPhone 16', 393, 852, 59, 34],
  ['iPhone SE', 375, 667, 20, 0],
  ['iPhone 16 Pro Max', 440, 956, 62, 34],
];
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const KINDS = ['canvas', 'habitat', 'farm', 'business', 'arcade', 'mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl', 'home', 'landlord', 'train', 'plane'];

const server = await serve(DIST, PORT);
const problems = [];
const onlyPhone = process.env.PHONE;
const onlyRoutes = process.env.ROUTES?.split(',');

for (const [phone, W, H, top, bottom] of PHONES.filter((p) => !onlyPhone || p[0].includes(onlyPhone))) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF || 1), isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const here = ll(START.gx, START.gy);
  await ctx.addInitScript(([lat, lng]) => {
    const pos = { coords: { latitude: lat, longitude: lng, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    const Geolocation = {
      checkPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }), requestPermissions: async () => ({ location: 'granted', coarseLocation: 'granted' }),
      getCurrentPosition: async () => ({ ...pos, timestamp: Date.now() }),
      watchPosition: async (_o, cb) => { setTimeout(() => cb({ ...pos, timestamp: Date.now() }), 50); return 'w1'; },
      clearWatch: async () => {},
    };
    window.CapacitorCustomPlatform = { name: 'ios', plugins: { Geolocation } };
  }, [here.latitude, here.longitude]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  // the iPhone's safe areas (env(safe-area-inset-*)), so the screens are laid out as on a real phone
  const insets = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, topMax: top, bottom, bottomMax: bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 } }).then(() => true).catch((e) => { console.log('note: no safe-area emulation —', e.message); return false; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
  const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);

  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  // the signed-out screens first
  const tag = `sw${W}${H}`.slice(0, 12);
  const routes = [];
  routes.push(['/welcome (title)', null]);
  await measure('/welcome (title)');
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await measure('/welcome (account sheet)');
  await page.fill('#email', `${tag}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 });
  await measure('/onboarding');
  await page.fill('#username', tag); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await measure('/world (first location prompt)');
  await page.click('[data-testid=place-gps]').catch(() => {});
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape').catch(() => {});

  // a place of every kind, each its own plot (two apart so they stay separate)
  const me = (await sql(`select p.id, pr.username from players p join profiles pr on pr.id = p.id order by p.created_at desc limit 1`))[0];
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`).catch(() => {});
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me.id}', 'ink', 500000) on conflict (player_id, resource) do update set amount = 500000`).catch(() => {});
  await api('claimStarter', START.gx, START.gy).catch((e) => console.log('starter', String(e).slice(0, 120)));
  for (let i = 1; i < KINDS.length; i++) await api('acquirePlot', START.gx + i * 2, START.gy).catch((e) => console.log('plot', i, String(e).slice(0, 120)));
  let groups = await api('myGroups').catch(() => []);
  const byCell = (gx) => groups.find((g) => g.cells?.some((c) => c[0] === gx && c[1] === START.gy));
  for (let i = 0; i < KINDS.length; i++) { const g = byCell(START.gx + i * 2); if (g) await api('setGroupKind', g.id, KINDS[i]).catch((e) => console.log('kind', KINDS[i], String(e).slice(0, 120))); }
  groups = await api('myGroups').catch(() => []);
  const kind = (k) => groups.find((g) => (g.kind ?? g.plot_kind) === k) ?? byCell(START.gx + KINDS.indexOf(k) * 2);
  const clan = await api('clanFound', { name: `Sweep ${W}`, tag: `S${String(W).slice(-2)}`, emblem: 'shield', color: '#7B5CFF', motto: null, privacy: 'open' }).catch(() => null);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  const id = (k, f) => kind(k)?.[f] ?? kind(k)?.id ?? 'none';
  const art = (await sql(`select id from artwork_projects order by created_at desc limit 1`).catch(() => []))[0]?.id;
  const creature = (await sql(`select id from inkborn order by created_at desc limit 1`).catch(() => []))[0]?.id;

  const ALL = [
    '/world', '/hub', '/play', '/together', '/magic', '/ultras', '/new', '/canvases', '/me', '/plots', '/inkborn', '/inkborn/create', '/inkborn/visit', '/inkborn/keeper',
    '/social', '/party', '/clans', clan?.id ? `/clans/${clan.id}` : null, '/invite', '/players', `/u/${me.username}`, '/explorer', '/achievements', '/legend', '/grimoire', '/clips',
    '/guide', '/handbook', '/handbook/start', '/handbook/ink', '/handbook/enchant', '/royalty', '/fusion', '/primordials', '/rankings/rarities', '/leaderboards', '/inventory', '/events', '/settings', '/support',
    '/pvp', '/challenges', '/sketch', '/doodle', '/duet', '/space', '/gallery', art ? `/art/${art}` : null, `/powers/${START.gx}:${START.gy}`,
    '/legal/terms', '/legal/privacy', '/legal/content', '/legal/copyright', '/legal/rent', '/legal/delete-account',
    // full-screen places
    `/create/${id('canvas', 'id')}`, '/habitat', `/farm/${id('farm', 'farm_id')}`, `/business/${id('business', 'business_id')}`, `/arcade/${id('arcade', 'arcade_id')}`,
    ...['mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl'].map((k) => `/realm/${id(k, 'realm_id')}`), `/landlord/${id('landlord', 'id')}`,
    clan?.id ? '/clan/hall' : null, '/home', `/u/${me.username}/room`, '/eyes', '/space/surface', '/space/play/asteroids', '/space/play/lander',
    `/farm/${id('farm', 'farm_id')}/play/veggie_catch`, `/business/${id('business', 'business_id')}/play/stock_trader`,
    ...['lightlines', 'paintpop', 'colorburst', 'tracecraft', 'memorymural', 'blocksplash', 'rollermural', 'mirrorline'].map((g) => `/play/${g}`),
    creature ? `/inkborn/play/berrydash/${creature}` : null,
  ].filter(Boolean);
  for (const r of ALL.filter((r) => !onlyRoutes || onlyRoutes.some((o) => r.startsWith(o)))) {
    await nav(r);
    await page.waitForTimeout(/^\/(world|eyes|space|realm|farm|business|arcade|habitat|home|u\/.+\/room|landlord|clan\/hall)/.test(r) ? 3500 : 1600);
    await page.keyboard.press('Escape').catch(() => {}); // a first-visit explainer, if one opened
    await page.waitForTimeout(300);
    await measure(r);
  }
  // simple mode's two screens
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: true }));
  for (const r of ['/world', '/play']) { await nav(r); await page.waitForTimeout(1800); await measure(`${r} (simple mode)`); }
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  if (errors.length) console.log(`  page errors on ${phone}:`, [...new Set(errors)].slice(0, 8));
  await browser.close();

  async function measure(label) {
    const res = await page.evaluate(([top, bottom]) => {
      const W = innerWidth, H = innerHeight;
      const out = [];
      const doc = document.scrollingElement;
      if (doc.scrollWidth > W + 1) out.push(`page scrolls sideways (${doc.scrollWidth}px wide)`);
      for (const el of document.querySelectorAll('main, [data-scroll], .overflow-y-auto')) if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'hidden' && el.clientWidth > W * 0.8) out.push(`a scrolling area scrolls sideways (${el.scrollWidth} > ${el.clientWidth}) ${(el.getAttribute('data-testid') || el.className || '').toString().slice(0, 40)}`);
      const clipped = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          // inside something that clips or scrolls sideways and is itself on screen (a carousel, a card): fine
          if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p !== document.body && p.id !== 'root' && p !== document.documentElement && p.getBoundingClientRect().right <= W + 1 && p.getBoundingClientRect().left >= -1) return true;
        }
        return false;
      };
      const name = (el) => {
        const label = (el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36);
        return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 3).join('.') : ''} "${label}"`;
      };
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.maplibregl-canvas-container, .maplibregl-marker, .maplibregl-ctrl, svg, canvas, [aria-hidden=true], .sr-only, [data-sweep-ignore]')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const sideOut = r.right > W + 1 || r.left < -1;
        if (sideOut && !clipped(el)) out.push(`off the side: ${name(el)} at x ${Math.round(r.left)}…${Math.round(r.right)}`);
        // tappable things under the notch / status bar or the home bar
        const tappable = el.matches('button, a, [role=button], input, select, textarea');
        if (tappable && r.height > 0 && r.bottom > 0 && r.top < H) {
          if (top && r.top < top - 2 && r.bottom > 4) out.push(`under the status bar: ${name(el)} top ${Math.round(r.top)}`);
          if (bottom && r.bottom > H - bottom + 2 && r.top < H - 4 && cs.position === 'fixed') out.push(`under the home bar: ${name(el)} bottom ${Math.round(r.bottom)}`);
        }
      }
      // is this screen dressed as the app (the HUD, the tab bar, a game screen of its own)?
      const app = !!document.querySelector('.lv-hud, .lv-tabbar, [data-testid=game-hud], [data-testid=tabbar], nav.lv-tabs');
      return { out: [...new Set(out)].slice(0, 10), app, path: window.__landvasPath?.() };
    }, [insets ? top : 0, insets ? bottom : 0]);
    const file = `${phone.replace(/[^a-z0-9]+/gi, '-')}${label.replace(/[^a-z0-9]+/gi, '_')}`;
    await page.screenshot({ path: path.join(OUT, `${file}.png`), timeout: 60000, animations: 'disabled', caret: 'hide' }).catch((e) => console.log('  (no screenshot:', String(e).slice(0, 80), ')'));
    // the bottom of a long screen
    const scrolled = await page.evaluate(() => {
      const m = [...document.querySelectorAll('main, .overflow-y-auto')].filter((e) => e.scrollHeight > e.clientHeight + 40).sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!m) return false;
      m.scrollTop = m.scrollHeight; return true;
    });
    if (scrolled) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `${file}__bottom.png`), timeout: 30000 }).catch(() => {}); await page.evaluate(() => { for (const m of document.querySelectorAll('main, .overflow-y-auto')) m.scrollTop = 0; }); }
    if (res.out.length) problems.push({ phone, label, res: res.out });
    console.log(`${res.out.length ? 'FIX ' : 'ok  '} ${phone.padEnd(18)} ${label.padEnd(44).slice(0, 44)} ${res.path !== label.split(' ')[0] ? `[at ${res.path}] ` : ''}${res.out.join(' | ')}`);
  }
}
fs.writeFileSync(path.join(OUT, 'problems.json'), JSON.stringify(problems, null, 1));
console.log(`\n${problems.length} screen/phone combinations need fixing`);
server.close();
process.exit(problems.length ? 1 : 0);
