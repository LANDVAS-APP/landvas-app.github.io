// Every page, every way in: opened from inside the game, then reloaded on its own address. A page fails if it
// throws, shows an error screen, never stops loading (a spinner or skeleton still up after 15 s), comes up blank, or —
// after a reload — lands somewhere else (signed out, back on the welcome screen). Phone size, website and app shell.
// Run: VITE_ROUTER=browser npx vite build --mode artifact --base / --outDir dist-crawl && node tests/e2e/crawl-pages.mjs
//   (served from the site root so a reload works on any address, as on landvas.app; APP=1 for the app shell; ONLY=/a,/b)
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const APP = !!process.env.APP;
const OUT = process.env.E2E_OUT || path.resolve(`test-results/e2e-crawl${APP ? '-app' : ''}`);
fs.mkdirSync(OUT, { recursive: true });
const PORT = APP ? 4318 : 4317;
const server = await serve(process.env.E2E_DIST || 'dist-crawl', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
if (APP) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; });
await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: false })); } catch {} });
const page = await ctx.newPage();
let errs = [];
const IGNORE = /ERR_TUNNEL|ERR_NAME|Failed to load resource|fonts\.g|WebGL|net::|AudioContext|tile|glyphs|sprite|style\.json|NotAllowedError|play\(\) request/i;
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push(`console: ${m.text().slice(0, 300)}`); });
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const BASE = `http://localhost:${PORT}`;
const results = [];

/** wait until the page stops loading; report what it looks like */
async function settle(limit = 15000) {
  const t0 = Date.now(); let calm = 0; let last = null;
  while (Date.now() - t0 < limit) {
    last = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05; };
      const loading = [...document.querySelectorAll('.lv-loader, .lv-skel, .animate-spin, [aria-busy=true]')].filter(vis).filter((el) => !el.closest('button, [data-crawl-ignore]'));
      const text = document.body.innerText || '';
      return {
        path: location.pathname + location.search,
        loading: loading.length, loadingWhat: loading.slice(0, 3).map((el) => (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 60) + ' in ' + (el.parentElement?.closest('[data-testid]')?.getAttribute('data-testid') ?? el.parentElement?.className?.toString().slice(0, 40) ?? '')),
        crash: /Unexpected Application Error|Something went wrong|Hit a snag|Application error/i.test(text),
        text: text.replace(/\s+/g, ' ').trim().slice(0, 160), len: text.trim().length,
      };
    });
    if (last.crash) break;
    if (last.loading === 0) { calm += 250; if (calm >= 1500) break; } else calm = 0;
    await page.waitForTimeout(250);
  }
  return { ...last, ms: Date.now() - t0, stuck: last.loading > 0 };
}

async function visit(label, url, expect) {
  const out = { route: label, url };
  // (the offline test build keeps its world in memory, so a reload starts a fresh, signed-out world: reloads are
  // checked separately, signed out — RELOAD=1)
  for (const mode of process.env.RELOAD ? ['reload'] : ['open']) {
    errs = [];
    try {
      if (mode === 'open') { await page.evaluate((u) => window.__landvasNav(u), url); await page.waitForTimeout(300); }
      else { await page.waitForTimeout(1500); await page.goto(BASE + url + (url.includes('?') ? '&' : '?') + 'e2e=1', { waitUntil: 'load', timeout: 45000 }); await page.waitForFunction(() => !!window.__landvasNav, null, { timeout: 20000 }).catch(() => {}); }
      const s = await settle();
      const wrongPlace = expect && !expect.test(s.path);
      const problems = [s.crash && 'error screen', s.stuck && `still loading after ${Math.round(s.ms / 1000)}s (${s.loadingWhat.join('; ')})`, s.len < 15 && 'blank',
        wrongPlace && `ended up on ${s.path}`, ...errs.slice(0, 3)].filter(Boolean);
      out[mode] = { ms: s.ms, path: s.path, problems };
      if (problems.length) await page.screenshot({ path: path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, '_')}-${mode}.png`) }).catch(() => {});
    } catch (e) { out[mode] = { problems: [`crashed: ${String(e.message).slice(0, 200)}`] }; }
  }
  const bad = [...(out.open?.problems ?? []).map((p) => `open: ${p}`), ...(out.reload?.problems ?? []).map((p) => `reload: ${p}`)];
  results.push({ ...out, bad });
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${label}${bad.length ? ' — ' + bad.join(' | ') : ` (${(out.open ?? out.reload).ms}ms)`}`);
}

try {
  await page.goto(`${BASE}/welcome?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 60000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'crawler@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'crawler_cy'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(2500);
  // a world to look at: Ink, plots of every kind, a friend with a home, an artwork, a clan, a party, an Inkborn
  const me = (await sql(`select id from profiles where username = 'crawler_cy'`))[0].id;
  await sql(`select private.ledger_apply($1, 'ink', 500000, 'admin_adjust', 'test', 'test', 'e2e:crawl:ink')`, [me]);
  for (let i = 0; i < 8; i++) await api('quickBuyPlot').catch(() => {});
  const groups = await api('myGroups');
  const kinds = ['farm', 'business', 'arcade', 'landlord', 'habitat', 'mine'];
  const placed = {};
  for (let i = 0; i < groups.length && i < kinds.length; i++) { try { await api('setGroupKind', groups[i].id, kinds[i]); placed[kinds[i]] = groups[i].id; } catch (e) { console.log(`(no ${kinds[i]}: ${String(e.message).slice(0, 80)})`); } }
  const realm = (await sql(`select id from realms where owner_id = $1 limit 1`, [me]).catch(() => []))[0]?.id;
  const cell = (await sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [me]))[0];
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());

  const R = [
    ['/hub'], ['/world'], ['/play'], ['/canvases'], ['/gallery'], ['/social'], ['/clans'], ['/party'], ['/invite'], ['/explorer'], ['/players'], ['/me'],
    ['/achievements'], ['/legend'], ['/grimoire'], ['/clips'], ['/guide'], ['/royalty'], ['/fusion'], ['/primordials'], ['/rankings/rarities'], ['/leaderboards'],
    ['/inventory'], ['/events'], ['/settings'], ['/support'], ['/pvp'], ['/challenges'], ['/sketch'], ['/doodle'], ['/duet'], ['/space'], ['/plots'],
    ['/inkborn'], ['/inkborn/create'], ['/inkborn/visit'], ['/inkborn/keeper'], ['/duels'], ['/legal/terms'], ['/legal/privacy'], ['/habitat'], ['/home'],
    ['/clan/hall'], ['/space/surface'], ['/u/crawler_cy'], ['/u/crawler_cy/home'], ['/u/crawler_cy/room'],
    ...(cell ? [[`/powers/${cell.gx}_${cell.gy}`]] : []),
    // (a plot turned into a farm, an arcade… opens as that place, not the painter: paint one that's still a canvas)
    ...(groups[kinds.length] ? [[`/create/${groups[kinds.length].id}`]] : []),
    ...Object.entries(placed).filter(([k]) => ['farm', 'business', 'arcade', 'landlord', 'habitat'].includes(k)).map(([k, id]) => [`/${k}/${id}`]),
    ...(realm ? [[`/realm/${realm}`]] : []),
    ['/play-sandbox/tracecraft'], ['/brawl-demo'],
  ];
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const [u] of R) {
    if (process.env.ERRCHECK || (only && !only.some((o) => u.startsWith(o)))) continue;
    // (a few addresses are other names for a page: /duels is PvP, /home and /habitat open your own)
    // (/clan/hall without a clan shows the clans; the brawl demo opens a brawl realm of its own)
    const alias = { '/duels': '/pvp', '/hub': '/(hub)?', '/clan/hall': '/clan/hall|/clans', '/brawl-demo': '/brawl-demo|/realm/[0-9a-f-]+' }[u];
    // (signed out after a reload: a page for players sends you to sign in first, and back there afterwards)
    const signIn = process.env.RELOAD ? '|/welcome\\?next=' : '';
    await visit(u, u, new RegExp('^(' + (alias ?? u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + signIn + ')([/?&]|$)'));
  }
  // a screen that can't load (here: its code blocked, as when the game was updated while open) shows its own error
  // screen inside the game — the tab bar stays, nothing needs a reload — and a retry works once it can load again
  if (!only) {
    await page.goto(`${BASE}/world?e2e=1`, { waitUntil: 'load' }); await page.waitForFunction(() => !!window.__landvasNav, null, { timeout: 30000 });
    await page.route(/\/assets\/Royalty-[^/]+\.js$/, (r) => r.abort());
    errs = [];
    await page.evaluate(() => window.__landvasNav('/royalty'));
    const shown = await page.waitForSelector('[data-testid=route-error]', { timeout: 15000 }).then(() => true, () => false);
    const tabs = await page.locator('nav').count();
    const dead = /Unexpected Application Error/.test(await page.evaluate(() => document.body.innerText));
    await page.screenshot({ path: path.join(OUT, 'route-error.png') }).catch(() => {});
    const ok = shown && tabs > 0 && !dead;
    results.push({ route: 'a screen that fails to load', bad: ok ? [] : [`error screen ${shown}, tab bar ${tabs}, dead page ${dead}`] });
    console.log(`${ok ? 'PASS' : 'FAIL'}  a screen that fails to load shows its own error screen, the tab bar stays`);
    await page.unroute(/\/assets\/Royalty-[^/]+\.js$/);
    // (the player's way out: the button on the error screen — no reload)
    await page.locator('[data-testid=route-error] button', { hasText: 'Go to the map' }).click({ timeout: 10000 }).catch(() => {});
    const away = await page.waitForFunction(() => location.pathname === '/world' && !document.querySelector('[data-testid=route-error]'), null, { timeout: 15000 }).then(() => true, () => false);
    results.push({ route: 'leaving the error screen', bad: away ? [] : ['stuck on the error screen'] });
    console.log(`${away ? 'PASS' : 'FAIL'}  …and the rest of the game still opens from there`);
  }
} catch (e) {
  console.log('FAIL  crashed:', e.message);
  results.push({ route: 'crashed', bad: [e.message] });
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const bad = results.filter((r) => r.bad.length);
  console.log(`\n${results.length - bad.length}/${results.length} pages load cleanly, opened and reloaded`);
  await browser.close(); server.close();
  process.exit(bad.length ? 1 : 0);
}
