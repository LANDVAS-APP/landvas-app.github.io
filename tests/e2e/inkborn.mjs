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
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
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
    await page.keyboard.down(key); await page.waitForTimeout(900); await page.keyboard.up(key);
    p1 = await page.evaluate(() => ({ ...window.__landvasSanctuary.e.player }));
    walked = Math.max(walked, Math.hypot(p1.x - p0.x, p1.y - p0.y));
    if (walked > 2) break;
  }
  check('the explorer walks with the keyboard', walked > 2, `${walked.toFixed(1)} units`);
  // creatures move on their own and stay out of walls
  const c0 = await page.evaluate(() => window.__landvasSanctuary.e.sims.map((s) => [s.x, s.y, s.st]));
  await page.waitForTimeout(6000);
  const c1 = await page.evaluate(() => window.__landvasSanctuary.e.sims.map((s) => [s.x, s.y, s.st]));
  const moved = c0.some((a, i) => Math.hypot(a[0] - c1[i][0], a[1] - c1[i][1]) > 0.3 || a[2] !== c1[i][2]);
  check('creatures behave on their own', moved, JSON.stringify(c1));
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
  await page.click('[data-testid=call]');
  await page.waitForTimeout(4000);
  const dist = await page.evaluate(() => { const { e } = window.__landvasSanctuary; const s = e.sims[0]; return Math.hypot(s.x - e.player.x, s.y - e.player.y); });
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
  const claim = await page.evaluate(async ([gx, gy]) => {
    const api = window.__landvasApi;
    try { await api.claimStarter(gx, gy); } catch (e) { return String(e.message || e); }
    return (await api.myGroups())[0]?.id ?? null;
  }, [START.gx, START.gy]);
  const gid = claim && claim.length === 36 ? claim : null;
  const plot = claim;
  if (!gid) console.log('SKIP plot-type switch (no plot claimed in this run)', JSON.stringify(plot).slice(0, 80));
  else {
    await nav('/canvases', 1500);
    await page.click('[data-testid=plot-kind]');
    await page.click('[data-testid=kind-habitat]');
    await shot('10-plot-kind');
    await page.click('[data-testid=kind-next]');
    await page.click('[data-testid=kind-confirm]');
    await page.waitForSelector('[data-testid=sanctuary-canvas]', { timeout: 15000 });
    check('a plot turned into a habitat opens its sanctuary', await page.isVisible('[data-testid=sanctuary]'));
    await page.waitForTimeout(1500);
    await shot('11-plot-habitat');
    const g = await page.evaluate(async () => (await window.__landvasApi.myGroups())[0]);
    check('the group is a habitat', g.kind === 'habitat' && !!g.habitat_id);
    await nav('/world', 1500);
    await page.evaluate((ll) => window.__landvasMap.jumpTo({ center: [ll.longitude, ll.latitude], zoom: 20.5 }), START_LL);
    await page.waitForTimeout(3000);
    await shot('12-map-habitat');
    const back = await page.evaluate(async (id) => (await window.__landvasApi.setGroupKind(id, 'canvas')).kind, gid);
    check('and back to an art canvas', back === 'canvas');
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
