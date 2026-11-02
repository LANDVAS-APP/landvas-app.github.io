// Inkborn end to end (local-mode build): draw a creature → Bring to Life → name → release it
// into the starter sanctuary → walk, pet, feed, call → decorate and save → reload and check
// everything persisted → roll a random one → turn a plot into a habitat and back.
// Run: npm run build:artifact && node tests/e2e/inkborn.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/inkborn');
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 390), H = Number(process.env.H || 780);
const server = await serve(DIST, 4195);
const browser = await launch();
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 };
const START_LL = (() => { const G = 4194304; const n = Math.PI * (1 - (2 * (START.gy + 0.5)) / G); return { longitude: ((START.gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; })();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700, colorScheme: 'dark', geolocation: { ...START_LL, accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 90000 }).catch(() => console.log('(screenshot skipped:', n + ')'));
const nav = async (r, wait = 1200) => { await page.evaluate((x) => window.__landvasNav(x), r); await page.waitForTimeout(wait); };

try {
  await page.goto('http://localhost:4195/?e2e=1', { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'keeper@example.test');
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', 'creature_keeper');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 20000 });
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 15000 });
  await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 });
  await page.waitForTimeout(4000); // let the post-onboarding hand-off to the map finish

  // the hub, before any creatures
  await nav('/inkborn', 1500);
  check('hub shows the empty state', !!(await page.waitForSelector('[data-testid=inkborn-empty]', { timeout: 8000 }).catch(() => null)));
  await shot('1-hub-empty');

  // draw a creature
  await nav('/inkborn/create', 1500);
  const pad = await page.$('[data-testid=inkborn-pad]');
  const b = await pad.boundingBox();
  const at = (fx, fy) => [b.x + b.width * fx, b.y + b.height * fy];
  const stroke = async (pts) => { await page.mouse.move(...at(...pts[0])); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(...at(...p), { steps: 4 }); await page.mouse.up(); };
  // body: a big circle
  const circle = []; for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; circle.push([0.5 + Math.cos(a) * 0.25, 0.58 + Math.sin(a) * 0.22]); }
  await stroke(circle);
  await stroke([[0.36, 0.38], [0.32, 0.18], [0.44, 0.34]]); // left ear
  await stroke([[0.56, 0.34], [0.68, 0.18], [0.64, 0.38]]); // right ear
  await stroke([[0.75, 0.62], [0.88, 0.55], [0.9, 0.42]]); // tail
  await stroke([[0.43, 0.55], [0.44, 0.56]]); await stroke([[0.57, 0.55], [0.58, 0.56]]); // eyes
  await shot('2-drawing');
  await page.click('[data-testid=bring-to-life]');
  await page.waitForSelector('[data-testid=life-reveal]', { timeout: 3000 });
  check('bring to life shows the reveal', true);
  await page.waitForSelector('[data-testid=life-reveal]', { state: 'detached', timeout: 6000 });
  const notes = await page.$$eval('[data-testid=studio-draw] li', (els) => els.map((e) => e.textContent));
  check('the drawing was read into features', notes.length >= 2, notes.join(' | '));
  await page.fill('[data-testid=inkborn-name]', 'Mochi');
  await shot('3-alive');
  await page.click('[data-testid=save-inkborn]');
  await page.waitForSelector('[data-testid=sanctuary-canvas]', { timeout: 15000 });
  await page.waitForTimeout(2500);
  check('released into the sanctuary', await page.isVisible('[data-testid=sanctuary]'));
  check('the new creature card is open', await page.isVisible('[data-testid=creature-card]'));
  await shot('4-sanctuary-arrival');

  // the world: walk with the keyboard
  const fps = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(Math.round(n / 1.5)); }; requestAnimationFrame(f); }));
  console.log('fps on arrival', await fps());
  let walked = 0, p0, p1;
  for (const key of ['d', 'a', 's', 'w']) {
    p0 = await page.evaluate(() => ({ ...window.__landvasSanctuary.e.player }));
    await page.keyboard.down(key); await page.waitForTimeout(1600); await page.keyboard.up(key);
    p1 = await page.evaluate(() => ({ ...window.__landvasSanctuary.e.player }));
    walked = Math.max(walked, Math.hypot(p1.x - p0.x, p1.y - p0.y));
    if (walked > 2) break;
  }
  check('the explorer walks with the keyboard', walked > 2, `${walked.toFixed(1)} units`);
  // creatures move on their own and stay out of walls
  const seen = new Set();
  let c0 = null, moved = false, c1 = null;
  for (let i = 0; i < 14 && !(moved && seen.size > 1); i++) {
    c1 = await page.evaluate(() => window.__landvasSanctuary.e.sims.map((s) => [s.x, s.y, s.st]));
    c0 ??= c1;
    c1.forEach((s) => seen.add(s[2]));
    if (c0.some((a, k) => Math.hypot(a[0] - c1[k][0], a[1] - c1[k][1]) > 0.3)) moved = true;
    await page.waitForTimeout(1000);
  }
  check('creatures behave on their own', moved || seen.size > 1, `states seen: ${[...seen].join(', ')}`);
  const insideOk = await page.evaluate(() => { const { e } = window.__landvasSanctuary; return e.sims.every((s) => s.x > 0 && s.y > 0 && s.x < e.T.W && s.y < e.T.H); });
  check('creatures stay inside the sanctuary', insideOk);

  // care: tap to pet, feed, call
  const before = await page.evaluate(() => ({ ...window.__landvasSanctuary.e.sims[0].c }));
  const pos = await page.evaluate(() => { const { e, toScreen } = window.__landvasSanctuary; const s = e.sims[0]; const [x, y] = toScreen(s.x, s.y); return [x, y - 2.3 * e.cam.z * 0.45]; });
  await page.mouse.click(pos[0], pos[1]);
  await page.waitForTimeout(800);
  await page.click('[data-testid=feed]');
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ ...window.__landvasSanctuary.e.sims[0].c }));
  check('petting and feeding raise bond on the server', after.bond > before.bond, `${before.bond} → ${after.bond}, happiness ${before.happiness} → ${after.happiness}`);
  await shot('5-care');
  // headless runs here are slow (software graphics + the in-browser database), so give it time
  await page.click('[data-testid=call]');
  let dist = 99;
  for (let i = 0; i < 16 && dist >= 4; i++) {
    await page.waitForTimeout(500);
    dist = await page.evaluate(() => { const { e } = window.__landvasSanctuary; const s = e.sims[0]; return Math.min(...[0, 1].map(() => Math.hypot(s.x - e.player.x, s.y - e.player.y))); });
  }
  check('calling brings the creature over', dist < 4, dist.toFixed(2));

  // decorate
  const n0 = await page.evaluate(() => window.__landvasSanctuary.e.layout.length);
  await page.click('[data-testid=decorate]');
  await page.click('button:has-text("Cosy")');
  await page.click('[data-testid=decor-lantern]');
  let placed = false;
  for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55], [0.3, 0.6], [0.7, 0.4], [0.5, 0.35]]) {
    await page.mouse.click(W * fx, H * fy);
    await page.waitForTimeout(150);
    if (await page.evaluate((n) => window.__landvasSanctuary.e.layout.length > n, n0)) { placed = true; break; }
  }
  check('placed a decoration', placed);
  await shot('6-decorate');
  await page.click('[data-testid=decor-save]');
  await page.waitForTimeout(1500);
  const starterId = await page.evaluate(async () => (await window.__landvasApi.mySanctuaries()).starter_id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid=world-map]', { timeout: 90000 }); // the local database reloads from browser storage
  await page.waitForTimeout(3000);
  await nav(`/habitat/${starterId}`, 500);
  await page.waitForSelector('[data-testid=sanctuary-canvas]', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const n1 = await page.evaluate(() => window.__landvasSanctuary.e.layout.length);
  const kept = await page.evaluate(() => window.__landvasSanctuary.e.sims.map((s) => [s.c.name, s.c.bond]));
  check('decorations persist after reload', n1 === n0 + 1, `${n0} → ${n1}`);
  check('the creature and its bond persist after reload', kept.length === 1 && kept[0][0] === 'Mochi' && kept[0][1] > 0, JSON.stringify(kept));
  await shot('7-after-reload');

  // randomize a second creature
  await nav('/inkborn/create', 1500);
  await page.click('[data-testid=studio-random]');
  await page.click('[data-testid=roll]'); await page.click('[data-testid=roll]');
  await page.waitForTimeout(500);
  await shot('8-random');
  await page.click('[data-testid=save-inkborn]');
  await page.waitForSelector('[data-testid=sanctuary-canvas]', { timeout: 15000 });
  await page.waitForTimeout(1200);
  check('a random creature joins too', (await page.evaluate(() => window.__landvasSanctuary.e.sims.length)) === 2);
  await nav('/inkborn', 1500);
  check('the hub lists both creatures', (await page.$$('[data-testid=inkborn-list] > button')).length === 2);
  await page.click('[data-testid=inkborn-list] > button');
  await page.waitForSelector('[data-testid=creature-profile]');
  await shot('9-profile');
  await page.keyboard.press('Escape');

  // plot type: claim the free plot, make it a habitat, then back to a canvas
  // buy a plot as an Inkborn Habitat straight from the plot panel
  await nav('/world', 2500);
  await page.evaluate((ll) => window.__landvasMap.jumpTo({ center: [ll.longitude, ll.latitude], zoom: 20.5 }), START_LL);
  await page.waitForTimeout(2500);
  const pt = await page.evaluate((ll) => { const m = window.__landvasMap; const p = m.project([ll.longitude, ll.latitude]); const r = m.getCanvas().getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, START_LL);
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForSelector('[data-testid=plot-kind-choice]', { timeout: 15000 });
  await page.click('[data-testid=buy-as-habitat]');
  await shot('10-buy-as-habitat');
  await page.click('[data-testid=claim-plot]');
  await page.waitForSelector('[data-testid=enter-habitat]', { timeout: 20000 });
  check('the claim celebration offers the sanctuary', true);
  await page.waitForTimeout(1500);
  await page.click('[data-testid=enter-habitat]');
  await page.waitForSelector('[data-testid=sanctuary-canvas]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const size1 = await page.evaluate(() => ({ w: window.__landvasSanctuary.e.T.W, cells: window.__landvasSanctuary.e.T.cells.length }));
  check('a 1-plot habitat is a small glade', size1.cells === 1 && size1.w === 16, JSON.stringify(size1));
  await shot('10b-small-habitat');
  // grow it: buy the neighbour as a habitat too and merge (server side, like the Connect button)
  const grown = await page.evaluate(async ([gx, gy]) => {
    const api = window.__landvasApi;
    const st = await api.myState(); await api.devGrantSelfAdmin(); await api.admin.adjustBalance(st.user_id, 'ink', 500, 'e2e habitat growth');
    const r = await api.acquirePlot(gx + 1, gy, '');
    await api.setGroupKind(r.group_id, 'habitat');
    const gs = (await api.myGroups()).filter((g) => g.kind === 'habitat');
    const g = await api.fuseGroups(gs.map((x) => x.id));
    const h = await api.habitatGet(g.habitat_id);
    return { id: g.habitat_id, plots: g.plot_count, hcells: h.cells, hplots: h.plots };
  }, [START.gx, START.gy]);
  await nav("/inkborn", 1200);
  await nav(`/habitat/${grown.id}`, 2500);
  const size2 = await page.evaluate(() => ({ w: window.__landvasSanctuary.e.T.W, cells: window.__landvasSanctuary.e.T.cells.length }));
  check('merging habitat plots makes the sanctuary bigger', grown.plots === 2 && size2.cells === 2 && size2.w === 32, JSON.stringify({ grown, size2 }));
  await shot('10c-merged-habitat');
  const gid = (await page.evaluate(async () => (await window.__landvasApi.myGroups()).find((g) => g.kind === 'habitat')?.id)) ?? null;
  const plot = null;
  if (!gid) console.log('SKIP plot-type switch (no plot claimed in this run)', JSON.stringify(plot).slice(0, 80));
  else {
    await nav('/canvases', 1500);
    await page.click('[data-testid=plot-kind]');
    await page.click('[data-testid=kind-canvas]');
    await shot('11-plot-kind');
    await page.click('[data-testid=kind-next]');
    await page.click('[data-testid=kind-confirm]');
    await page.waitForTimeout(2000);
    const g = await page.evaluate(async (id) => (await window.__landvasApi.myGroups()).find((x) => x.id === id), gid);
    check('switching a habitat back to an Art Canvas', g?.kind === 'canvas', JSON.stringify(g && { kind: g.kind }));
    const s2 = await page.evaluate(async () => (await window.__landvasApi.mySanctuaries()).creatures.length);
    check('creatures are kept when a habitat becomes a canvas', s2 === 2);
  }
  const real = errors.filter((x) => !/ErrnoError/.test(x)); // PGlite's local storage noise in headless runs
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL crashed:', e.message);
  failed++;
  await shot('crash').catch(() => {});
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all inkborn checks passed');
process.exit(failed ? 1 : 0);
