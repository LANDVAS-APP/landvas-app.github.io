// Real-browser test of the hidden Mirror Arcade (local-mode build): no 🪞 anywhere at first; play five cabinets in the
// logo's colour order (the last one in the 3D hall, like a person) and the glass cracks into the mirrored arcade with
// its welcome; walk to one of its own cabinets and play it, play a mirrored ordinary cabinet (flipped screen, its
// twist), check the 3x Ink and that nothing was posted, then step back through the glass and find the 🪞 button.
// Run: npm run build:artifact && node tests/e2e/mirror.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-mirror');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4199, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 20 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const hallOf = (name, expr) => page.evaluate(([n, e]) => { const h = window[n]; return new Function('h', `return (${e})`)(h); }, [name, expr]);

/** a round played straight through the API, a minute long */
async function round(arcadeId, game, score) {
  const s = await api('arcadeStart', arcadeId, game, 'classic');
  await sql(`update arcade_plays set started_at = now() - interval '60 seconds' where id = '${s.session}'`);
  await api('arcadeFinish', s.session, score);
}
async function walkToMachine(name, id) {
  await hallOf(name, `h.walkTo({ kind: 'machine', id: '${id}' })`);
  await page.waitForFunction(([n, id]) => window[n].debug().near === `m:${id}` || window[n].debug().near === id, [name, id], { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(900);
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'mira@example.test'); await page.fill('#password', 'through-the-glass'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'mira_mirror'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);

  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 5000) on conflict (player_id, resource) do update set amount = 5000`);
  await sql(`update game_config set value = jsonb_set(value, '{steps}', '[[1, 1]]') where key = 'plot_access'`);
  await api('claimStarter', START.gx, START.gy).catch(async () => { await api('acquirePlot', START.gx, START.gy); });
  const gid = (await api('myGroups'))[0].id;
  const arcadeId = (await api('setGroupKind', gid, 'arcade')).arcade_id;
  await sql(`update arcades set xp = 20000, machines = '{"stacker": 1, "cyclone": 1, "skeeball": 1, "pusher": 1, "bop": 1, "snake": 1, "airhockey": 1}' where id = '${arcadeId}'`);
  await page.evaluate((id) => window.__landvasNav(`/arcade/${id}`), arcadeId);
  await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 }); await page.waitForTimeout(2500);
  check('no mirror button before it’s found', (await page.locator('[data-testid=arcade-mirror-btn]').count()) === 0);
  check('nothing on the other side yet', JSON.stringify(await api('arcadeMirrorGet')) === '{"found":false}');
  await shot('01-arcade');

  // Rose, Amber, Sun, Mint… (through the API) then Sky in the hall
  for (const g of ['stacker', 'skeeball', 'pusher', 'bop']) await round(arcadeId, g, 40);
  const inkBefore = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0].amount);
  await walkToMachine('__landvasArcade', 'cyclone');
  await page.click('[data-testid=arcade-play]', { force: true }).catch(async () => { await page.locator('button:has-text("Play Prism Ring")').click({ force: true }); });
  await page.waitForSelector('[data-testid=arcade-start]', { timeout: 15000 });
  await page.click('[data-testid=arcade-start]');
  await page.waitForSelector('[data-testid=arc-stop]', { timeout: 15000 });
  for (let i = 0; i < 40 && !(await page.locator('[data-testid=arcade-done]').count()); i++) { await page.click('[data-testid=arc-stop]', { force: true }).catch(() => {}); await page.waitForTimeout(1600); }
  await page.waitForSelector('[data-testid=arcade-done]', { timeout: 30000 });
  const cracked = await page.waitForSelector('[data-testid=mirror-crack]', { timeout: 15000 }).then(() => true, () => false);
  check('the fifth colour cracks the glass', cracked);
  await page.waitForTimeout(500); await shot('02-crack');
  const inside = await page.waitForSelector('[data-testid=mirror-arcade]', { timeout: 20000 }).then(() => true, () => false);
  check('…and pulls you through into the Mirror Arcade', inside);
  await page.waitForTimeout(2500);
  check('a welcome with the finder’s bounty', /\+500 Ink/.test(await page.locator('[data-testid=mirror-welcome]').innerText().catch(() => '')));
  const inkAfter = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0].amount);
  check('the bounty was paid', inkAfter - inkBefore >= 500, `${inkBefore} → ${inkAfter}`);
  await shot('03-welcome');
  await page.click('[data-testid=mirror-welcome-ok]'); await page.waitForTimeout(1200);
  check('the hall canvas is flipped', (await page.locator('[data-testid=mirror-hall]').evaluate((el) => getComputedStyle(el).transform)).startsWith('matrix(-1'));
  const cabs = await hallOf('__landvasMirror', 'h.debug().cabs ?? null');
  console.log('note  cabinets', JSON.stringify(cabs)?.slice(0, 200));
  await shot('04-mirror-hall');

  // its own four, along the back wall
  for (const id of ['twin', 'glass', 'flip', 'sym']) {
    const errs0 = errors.length;
    await walkToMachine('__landvasMirror', id);
    const playBtn = page.locator('[data-testid=mirror-play]');
    const there = await playBtn.count();
    check(`walked up to ${id}`, there === 1, (await hallOf('__landvasMirror', 'JSON.stringify(h.debug().P ?? {})').catch(() => '')));
    if (!there) continue;
    if (id === 'twin') await shot('05-twin-near');
    await playBtn.click({ force: true });
    await page.waitForSelector('[data-testid=mirror-start]', { timeout: 15000 });
    if (id === 'twin') await shot('06-twin-attract');
    await page.click('[data-testid=mirror-mode-endless]');
    await page.click('[data-testid=mirror-start]');
    await page.waitForSelector(`[data-testid=arc-${id}]`, { timeout: 15000 });
    const box = await page.locator(`[data-testid=arc-${id}]`).boundingBox();
    // play a bit like a person would (badly)
    for (let k = 0; k < 18 && !(await page.locator('[data-testid=mirror-done]').count()); k++) {
      const x = box.x + box.width * (k % 2 ? 0.75 : 0.25), y = box.y + box.height * (id === 'sym' ? 0.62 + (k % 3) * 0.1 : 0.6);
      if (id === 'glass') { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(box.x + box.width * ((k * 37) % 100) / 100, y, { steps: 4 }); await page.mouse.up(); }
      else await page.mouse.click(x, y);
      await page.waitForTimeout(k === 4 ? 50 : 600);
      if (k === 4) await shot(`07-${id}-play`);
    }
    await page.waitForSelector('[data-testid=mirror-done]', { timeout: 90000 });
    await shot(`08-${id}-done`);
    check(`${id} runs and ends cleanly`, errors.length === errs0, errors.slice(errs0).join(' | '));
    await page.click('[data-testid=mirror-exit]'); await page.waitForTimeout(1500);
  }

  // a mirrored ordinary cabinet: Neon Snake (flipped left-right, the apples run away)
  await walkToMachine('__landvasMirror', 'snake');
  await page.locator('[data-testid=mirror-play]').click({ force: true });
  await page.waitForSelector('[data-testid=mirror-twist]', { timeout: 15000 });
  check('the mirrored cabinet shows its twist', /apples run away/i.test(await page.locator('[data-testid=mirror-twist]').innerText()));
  await page.click('[data-testid=mirror-start]');
  await page.waitForSelector('[data-testid=arc-snake]', { timeout: 15000 }); await page.waitForTimeout(1200);
  check('its screen is flipped', (await page.locator('[data-testid=mirror-screen] canvas').first().evaluate((el) => getComputedStyle(el).transform)).startsWith('matrix(-1'));
  await shot('09-snake-mirrored');
  await page.waitForSelector('[data-testid=mirror-done]', { timeout: 120000 });
  await shot('10-snake-done');
  await page.click('[data-testid=mirror-exit]'); await page.waitForTimeout(1200);

  const plays = await sql(`select game, mode, score, ink from arcade_mirror_plays where player_id = '${me}' order by started_at`);
  check('its rounds are kept on their own', plays.length >= 5, JSON.stringify(plays));
  const ledger = await sql(`select coalesce(sum(delta), 0)::int n from resource_ledger where player_id = '${me}' and ref_type = 'arcade_mirror'`).catch(() => [{ n: -1 }]);
  console.log('note  mirror ledger Ink', JSON.stringify(ledger));
  const feed = await sql(`select count(*)::int n from feed_events where data::text ilike '%twin%' or data::text ilike '%arcade_mirror%'`);
  check('nothing was posted to the feed', feed[0].n === 0);

  // back through the glass: the arcade now has the 🪞 button
  await page.click('[data-testid=mirror-back]');
  await page.waitForSelector('[data-testid=arcade]', { timeout: 20000 }); await page.waitForTimeout(2000);
  check('back in the arcade, a 🪞 button for the finder', (await page.locator('[data-testid=arcade-mirror-btn]').count()) === 1);
  await shot('11-back');
  await page.click('[data-testid=arcade-mirror-btn]');
  check('…which goes straight back through', await page.waitForSelector('[data-testid=mirror-arcade]', { timeout: 20000 }).then(() => true, () => false));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.log('FAIL  crashed:', e.message);
  results.push({ name: 'crashed', ok: false });
  await shot('99-crash');
} finally {
  await browser.close(); server.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
}
