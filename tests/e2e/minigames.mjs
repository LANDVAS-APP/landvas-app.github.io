// Plays every minigame in the e2e sandbox (all rounds, real UI + auto-solver)
// and checks the result with the server's validator.
// Run: npm run build:artifact && node tests/e2e/minigames.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-minigames');
fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4183);
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, colorScheme: 'dark' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const CASES = [['tracecraft', 1], ['colorburst', 1], ['paintpop', 1], ['lightlines', 1], ['memorymural', 1], ['sculptor', 1], ['rollermural', 1], ['mirrorline', 1],
  ['memorymural', 10], ['sculptor', 10], ['rollermural', 10], ['mirrorline', 10], ['sculptor', 30], ['mirrorline', 20]];
// the artifact build uses relative asset paths, so boot at / and navigate in-app
await page.goto('http://localhost:4183/?e2e=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__landvasNav, null, { timeout: 60000 });
for (const [g, lv] of CASES.filter(([g]) => !process.env.ONLY || process.env.ONLY.includes(g))) {
  await page.evaluate(([g, lv]) => window.__landvasNav(`/play-sandbox/${g}?level=${lv}&rounds=5`), [g, lv]);
  await page.waitForFunction(() => !!window.__landvasGame && !document.querySelector('[data-testid=sandbox-result]'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  if (lv === 1) await page.screenshot({ path: path.join(OUT, `${g}.png`) });
  await page.evaluate(() => window.__landvasGame.autoSolve());
  await page.waitForSelector(`[data-testid=sandbox-result][data-game=${g}]`, { timeout: 200000 });
  const res = JSON.parse(await page.textContent('[data-testid=sandbox-result]'));
  const ok = res.valid && res.passed;
  if (!ok) fails++;
  const s = res.summary ?? {};
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${g} L${lv} — rounds ${s.passed_rounds ?? s.passed_shapes ?? '?'}/${s.of ?? 5} score ${res.score} flags ${JSON.stringify(res.flags)} ${res.reason ?? ''}`);
}
for (const g of ['turfwars', 'paletteclash', 'forgery', 'pixelrecall'].filter((x) => !process.env.ONLY || process.env.ONLY.includes(x))) {
  // a PvP match: every round on its own board, solved round after round
  await page.evaluate((g) => window.__landvasNav(`/pvp-sandbox/${g}?rounds=3`), g);
  await page.waitForFunction(() => !!window.__landvasGame && !document.querySelector('[data-testid=sandbox-result]'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `pvp-${g}.png`) });
  await page.evaluate(() => window.__landvasGame.autoSolve());
  await page.waitForSelector(`[data-testid=sandbox-result][data-game=${g}]`, { timeout: 240000 });
  const res = JSON.parse(await page.textContent('[data-testid=sandbox-result]'));
  const ok = res.valid && res.rounds.length === 3 && res.rounds.every((r) => r.score > 0) && res.avg_quality > 0;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  pvp ${g} — rounds ${res.rounds?.map((r) => `${r.score} (${r.quality}%)`).join(', ')} ${res.reason ?? ''}`);
}
const relevant = errors.filter((e) => !/ErrnoError/.test(e));
if (relevant.length) { fails++; console.log('FAIL  page errors:', relevant.slice(0, 3).join(' | ')); }
await browser.close(); server.close?.();
console.log(fails ? `${fails} failed` : 'all minigames passed');
process.exit(fails ? 1 : 0);
