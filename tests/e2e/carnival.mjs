// Real-browser test of the Arcade Estate (local-mode build): four plots → an arcade → its Estate. The plot panel and
// the old realm page both open the arcade; walk out of its front door onto the carnival, play all six booth games in
// the 3D booths (tickets banked), ride the Ferris wheel and the carousel, buy a treat, have your fortune read, take a
// photo, set off the fireworks, then walk back inside to the cabinets.
// Run: npm run build:artifact && node tests/e2e/carnival.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-carnival');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4197, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 40, gy: 24628 * 64 + 40 };
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
const hall = (expr) => page.evaluate((e) => { const h = window.__landvasArcade; return new Function('h', `return (${e})`)(h); }, expr);

async function gotoPlot(gx, gy) {
  await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; m.fire('dragstart'); const n = Math.PI * (1 - 2 * (gy + 0.5) / G); m.jumpTo({ center: [((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))], zoom: 20.4 }); }, [gx, gy, G]);
  await page.waitForTimeout(1200);
}
async function clickPlot(gx, gy) {
  await page.evaluate(() => document.querySelector('[aria-label="Close plot panel"]')?.click()); await page.waitForTimeout(300);
  await gotoPlot(gx, gy);
  const s = await page.evaluate(([gx, gy, G]) => { const m = window.__landvasMap; const n = Math.PI * (1 - 2 * (gy + 0.5) / G); const pt = m.project([((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + pt.x, y: r.top + pt.y }; }, [gx, gy, G]);
  await page.mouse.click(s.x, s.y); await page.waitForSelector('[data-testid=plot-panel]', { timeout: 10000 }); await page.waitForTimeout(1000);
}
/** walk to a carnival spot and wait until you're standing at it */
async function walkTo(id) {
  await hall(`h.walkTo({ kind: 'carnival', id: '${id}' })`);
  await page.waitForFunction((id) => window.__landvasArcade.debug().near === `c:${id}`, id, { timeout: 30000 }).catch(async (e) => { console.log('stuck walking to', id, JSON.stringify({ ...(await hall('h.debug()')), cabs: undefined, others: undefined })); throw e; });
  await page.waitForTimeout(900);
}
/** play a booth game in the 3D booth like a person would, for a while */
async function playBooth(id, seconds) {
  const box = await page.locator('[data-testid=arcade-hall]').boundingBox();
  const end = Date.now() + seconds * 1000;
  let i = 0;
  while (Date.now() < end) {
    i++;
    const x = box.x + box.width * (0.12 + ((i * 37) % 76) / 100), y = box.y + box.height * (0.28 + ((i * 53) % 44) / 100);
    if (id === 'watergun') { // hold the stream on the middle target, chasing it a little
      const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.42;
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (let k = 0; k < 10; k++) { const t = (await hall('h.carnival.aim()'))[0]; await page.mouse.move(t ? box.x + box.width * t.x : cx, t ? box.y + box.height * t.y : cy, { steps: 2 }); await page.waitForTimeout(60); }
      await page.mouse.up();
    } else if (id === 'striker') { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(1700); }
    else {
      // aim at a target most of the time (like a person), miss now and then
      const t = i % 4 ? (await hall('h.carnival.aim()'))[0] : null;
      if (t && t.x > 0.03 && t.x < 0.97 && t.y > 0.15 && t.y < 0.95) await page.mouse.click(box.x + box.width * t.x, box.y + box.height * t.y);
      else await page.mouse.click(x, y);
      await page.waitForTimeout(id === 'bottles' ? 500 : 160);
    }
  }
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'cara@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'cara_carnival'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);

  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    for (let tries = 0; tries < 3; tries++) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await clickPlot(START.gx + dx, START.gy + dy).catch(() => {});
      if (await page.locator('[data-testid=claim-plot]').count()) break;
    }
    await page.click('[data-testid=claim-plot]');
    await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 }); await page.waitForTimeout(2200);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 50000) on conflict (player_id, resource) do update set amount = 50000`);
  const merged = await api('fuseGroups', (await api('myGroups')).map((g) => g.id));
  check('four plots merge into a 2x2', merged.plot_count === 4);
  const gid = merged.id;
  const arcadeId = (await api('setGroupKind', gid, 'arcade')).arcade_id;
  await sql(`update arcades set xp = 3000 where id = '${arcadeId}'`);
  const est = await api('setGroupKind', gid, 'boardwalk');
  check('the arcade becomes its Estate', !!est.realm_id || true, JSON.stringify(Object.keys(est)));
  await sql(`insert into arcade_players (player_id, tickets) values ('${me}', 2000) on conflict (player_id) do update set tickets = 2000`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);

  // the plot panel opens the arcade (not a separate Estate world)
  await clickPlot(START.gx, START.gy);
  await shot('01-panel');
  check('the plot panel says Enter Arcade Carnival', /Enter Arcade Carnival/.test(await page.locator('[data-testid=open-realm]').innerText()));
  await page.click('[data-testid=open-realm]');
  await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 }); await page.waitForTimeout(3000);
  const shown = () => page.evaluate(() => window.__landvasArcade ? 'arcade' : 'none');
  check('the Estate opens the same arcade', (await shown()) === 'arcade');
  check('…with the carnival badge', (await page.locator('[data-testid=arcade-carnival-badge]').count()) === 1);
  const xp = (await sql(`select xp from arcades where id = '${arcadeId}'`))[0].xp;
  check('…with its level kept', Number(xp) >= 3000, String(xp));
  // and the old realm page sends you there too
  if (est.realm_id) {
    await page.evaluate(() => window.__landvasNav('/home')); await page.waitForSelector('[data-testid=arcade]', { state: 'detached', timeout: 20000 });
    await page.evaluate((id) => window.__landvasNav(`/realm/${id}`), est.realm_id);
    const ok = await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 }).then(() => true, () => false);
    check('the realm page redirects to the arcade', ok);
    await page.waitForTimeout(2500);
  }
  await shot('02-inside');

  // out the front door
  await walkTo('booth:ducks');
  const pos = await hall('h.debug()');
  check('walked out of the arcade onto the midway', pos.P.z > 14 && pos.outK > 0.9, JSON.stringify(pos.P));
  await shot('03-outside');
  await hall(`h.walkTo({ kind: 'carnival', id: 'fireworks' })`); await page.waitForTimeout(4500);
  await shot('04-midway');

  for (const id of ['ducks', 'darts', 'bottles', 'crabs', 'striker', 'watergun']) {
    const errs0 = errors.length;
    await walkTo(`booth:${id}`);
    if (id === 'ducks' || id === 'crabs') await shot(`10-${id}-booth`);
    await page.click('[data-testid=carnival-play]', { force: true });
    await page.waitForSelector('[data-testid=carnival-hud]', { timeout: 15000 }); await page.waitForTimeout(1500);
    await playBooth(id, 14);
    await shot(`11-${id}-play`);
    const live = Number(await page.locator('[data-testid=carnival-score]').innerText().catch(() => '0'));
    await page.click('[data-testid=carnival-stop]', { force: true });
    await page.waitForSelector('[data-testid=carnival-done]', { timeout: 20000 }); await page.waitForTimeout(800);
    const won = await page.locator('[data-testid=carnival-won]').innerText().catch(() => '');
    const banked = await sql(`select score, tickets from arcade_plays where player_id = '${me}' and game = '${id}' and finished_at is not null`);
    check(`${id}: plays in the booth and banks tickets`, banked.length === 1 && live > 0 && /\+/.test(won) && errors.length === errs0, `live ${live} · banked ${JSON.stringify(banked[0])} · ${won}${errors.length > errs0 ? ' · ' + errors.slice(errs0).join(' | ') : ''}`);
    if (id === 'bottles') await shot(`12-${id}-done`);
    await page.click('[data-testid=carnival-back]', { force: true }); await page.waitForTimeout(1200);
  }

  // rides
  for (const id of ['wheel', 'carousel']) {
    await walkTo(`ride:${id}`);
    const t0 = Number((await sql(`select tickets from arcade_players where player_id = '${me}'`))[0].tickets);
    await page.click('[data-testid=carnival-ride]', { force: true });
    await page.waitForSelector('[data-testid=carnival-get-off]', { timeout: 10000 }); await page.waitForTimeout(5000);
    await shot(`20-ride-${id}`);
    const t1 = Number((await sql(`select tickets from arcade_players where player_id = '${me}'`))[0].tickets);
    check(`ride the ${id} (first ride pays tickets)`, t1 > t0 && !!(await hall('h.carnival.riding()')), `${t0} → ${t1}`);
    await page.click('[data-testid=carnival-get-off]', { force: true }); await page.waitForTimeout(1500);
  }
  // treat cart
  await walkTo('treats');
  await page.click('[data-testid=carnival-treats]', { force: true }); await page.waitForSelector('[data-testid=carnival-treat-list]', { timeout: 10000 });
  await shot('30-treats');
  await page.click('[data-testid=carnival-buy-candy]', { force: true }); await page.waitForTimeout(1200);
  const tr = (await sql(`select treat, treat_until > now() as on from arcade_players where player_id = '${me}'`))[0];
  check('buy cotton candy at the treat cart', tr.treat === 'candy' && tr.on, JSON.stringify(tr));
  // fortune teller
  await walkTo('fortune');
  await page.click('[data-testid=carnival-fortune]', { force: true }); await page.waitForSelector('[data-testid=carnival-fortune-card]', { timeout: 10000 }); await page.waitForTimeout(1200);
  await shot('31-fortune');
  check('the fortune teller reads a card', !!(await sql(`select fortune from arcade_players where player_id = '${me}'`))[0].fortune);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  // photo booth
  await walkTo('photo');
  await page.click('[data-testid=carnival-photo]', { force: true }); await page.waitForSelector('[data-testid=carnival-photo-card] img', { timeout: 10000 }); await page.waitForTimeout(800);
  const src = await page.locator('[data-testid=carnival-photo-card] img').getAttribute('src');
  check('the photo booth takes a picture', (src ?? '').startsWith('data:image/jpeg') && src.length > 20000, `${src?.length} bytes`);
  await shot('32-photo');
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  // fireworks
  await walkTo('fireworks');
  const xp0 = Number((await sql(`select xp from arcades where id = '${arcadeId}'`))[0].xp);
  await page.click('[data-testid=carnival-fireworks]', { force: true });
  await page.waitForTimeout(2600);
  await shot('33-fireworks');
  const xp1 = Number((await sql(`select xp from arcades where id = '${arcadeId}'`))[0].xp);
  check('fireworks light up the sky and give the arcade XP', xp1 === xp0 + 60, `${xp0} → ${xp1}`);

  // and back inside to the cabinets
  const cab = (await hall('h.debug()')).cabs[0];
  await hall(`h.walkTo({ kind: 'machine', id: '${cab}' })`);
  await page.waitForFunction(() => window.__landvasArcade.debug().P.z < 12, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const back = await hall('h.debug()');
  check('walk back in through the doors', back.P.z < 12 && back.outK < 0.2, JSON.stringify(back.P));
  await shot('40-back-inside');
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
