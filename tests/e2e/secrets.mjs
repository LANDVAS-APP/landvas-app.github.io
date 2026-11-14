// Real-browser test of the arcade's hidden secrets (local-mode build), phone-sized. Nothing shows at first. Then, like
// a player: the Founder's Code (the last round of the shape played in the hall -> lights down, the L on the floor,
// LAND GRAB rises), the Back Room (a Claw Crane round without moving the claw -> a rusty token -> the ticket machine ->
// ADMIT ONE -> the panel opens -> the back room -> PROTO-0), the B-Side (songs on the jukebox, three thumps -> Track 00
// -> the record sleeve -> a chart played on the cabinets). The recipes are shortened here through the local database.
// Run: npm run build:artifact && node tests/e2e/secrets.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-secrets');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4198, G = 4194304;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 30, gy: 24628 * 64 + 30 };
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
const hall = (expr) => page.evaluate((e) => new Function('h', `return (${e})`)(window.__landvasArcade), expr);
const ink = async (me) => Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0].amount);
async function round(arcadeId, game, score) {
  const s = await api('arcadeStart', arcadeId, game, 'classic');
  await sql(`update arcade_plays set started_at = now() - interval '60 seconds' where id = '${s.session}'`);
  await api('arcadeFinish', s.session, score);
}
async function walkTo(spot, nearKey) {
  await hall(`h.walkTo(${JSON.stringify(spot)})`);
  await page.waitForFunction((k) => window.__landvasArcade.debug().near === k, nearKey, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(900);
}
const closeDialogs = async () => { for (let i = 0; i < 3; i++) { if (!(await page.locator('[role=dialog]').count())) return; await page.keyboard.press('Escape'); await page.waitForTimeout(400); } };

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'sec@example.test'); await page.fill('#password', 'hidden-things'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'secret_seeker'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 }); await page.waitForTimeout(1500);

  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${me}', 'ink', 5000) on conflict (player_id, resource) do update set amount = 5000`);
  await sql(`update game_config set value = jsonb_set(value, '{steps}', '[[1, 1]]') where key = 'plot_access'`);
  // shorter recipes for the test: a three-cabinet shape, two claw goes, two songs of a second
  await sql(`update private.arcade_secrets set cfg = cfg || '{"shape": [[0, 0], [0, 1], [1, 1]]}'::jsonb where id = 'founder'`);
  await sql(`update private.arcade_secrets set cfg = cfg || '{"goes": 2}'::jsonb where id = 'backroom'`);
  await sql(`update private.arcade_secrets set cfg = cfg || '{"songs": ["chill", "neon"], "min_seconds": 1}'::jsonb where id = 'bside'`);
  await api('claimStarter', START.gx, START.gy).catch(async () => { await api('acquirePlot', START.gx, START.gy); });
  const gid = (await api('myGroups'))[0].id;
  const arcadeId = (await api('setGroupKind', gid, 'arcade')).arcade_id;
  await sql(`update arcades set xp = 20000, machines = '{"stacker": 1, "cyclone": 1, "snake": 1, "claw": 1, "bop": 1, "airhockey": 1}' where id = '${arcadeId}'`);
  await page.evaluate((id) => window.__landvasNav(`/arcade/${id}`), arcadeId);
  await page.waitForSelector('[data-testid=arcade]', { timeout: 30000 }); await page.waitForTimeout(2500);

  // ---- nothing shows
  check('nothing found yet', JSON.stringify((await api('arcadeSecretsMe')).found) === '[]');
  check('no secret cabinet in the hall', !(await hall('h.debug().cabs')).includes('landgrab'));
  await walkTo({ kind: 'jukebox' }, 'jukebox');
  check('no B-Side at the jukebox', (await page.locator('[data-testid=bside-open]').count()) === 0);

  // ---- the Founder's Code: two rounds through the API, the last one in the hall
  const ink0 = await ink(me);
  await round(arcadeId, 'snake', 30); await round(arcadeId, 'stacker', 30);
  await walkTo({ kind: 'machine', id: 'cyclone' }, 'm:cyclone');
  await page.click('[data-testid=arcade-play]', { force: true });
  await page.waitForSelector('[data-testid=arcade-start]', { timeout: 15000 }); await page.click('[data-testid=arcade-start]');
  await page.waitForSelector('[data-testid=arc-stop]', { timeout: 15000 });
  for (let i = 0; i < 40 && (await page.locator('[data-testid=arc-stop]').count()) && !(await page.locator('[data-testid=arcade-done]').count()); i++) { await page.click('[data-testid=arc-stop]', { force: true, timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1600); }
  // the cabinet closes by itself, the lights drop and the L lights up on the floor
  await page.waitForFunction(() => window.__landvasArcade.debug().cabs.includes('landgrab'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200); await shot('01-founder-L');
  check('the cabinet rises into the hall', (await hall('h.debug().cabs')).includes('landgrab'));
  const fr = await page.waitForSelector('[data-testid=reveal-founder]', { timeout: 15000 }).then(() => true, () => false);
  check('THE FOUNDER’S CODE reveal, with its bounty', fr && /\+1000 Ink/.test(await page.locator('[data-testid=reveal-founder]').innerText()));
  check('the bounty was paid', (await ink(me)) - ink0 >= 1000);
  await shot('02-founder-reveal');
  await page.click('[data-testid=reveal-ok]');
  await page.waitForFunction(() => window.__landvasArcade.debug().near === 'm:landgrab', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(900);
  check('walked to LAND GRAB by the door', (await page.locator('[data-testid=landgrab-play]').count()) === 1);
  await shot('03-landgrab-near');
  await page.click('[data-testid=landgrab-play]', { force: true });
  await page.waitForSelector('[data-testid=secret-start]', { timeout: 15000 }); await shot('04-landgrab-attract');
  await page.click('[data-testid=secret-start]');
  await page.waitForSelector('[data-testid=arc-landgrab]', { timeout: 15000 }); await page.waitForTimeout(1800);
  const box = await page.locator('[data-testid=arc-landgrab]').boundingBox();
  const swipe = async (dx, dy) => { const x = box.x + box.width / 2, y = box.y + box.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up(); };
  // straight up off the home plot: reaching the top edge (yours) closes the loop and claims (a headless browser is slow, so poll)
  const lgText = async () => (await page.locator('[data-testid=arc-landgrab]').innerText()).replace(/\n/g, ' ');
  for (let k = 0; k < 60 && !/SCORE\s*0*[1-9]/.test(await lgText()); k++) { if (k % 8 === 0) await swipe(0, -80); await page.waitForTimeout(1000); }
  await shot('05-landgrab-play');
  const lgScore = await lgText();
  check('LAND GRAB plays (a claim scored)', /SCORE\s*0*[1-9]/.test(lgScore.replace(/\n/g, ' ')), lgScore.replace(/\n/g, ' ').slice(0, 80));
  await page.click('[data-testid=secret-exit]'); await page.waitForTimeout(1200);
  const s1 = await api('arcadeSecretStart', 'founder', 'landgrab', 'classic');
  await sql(`update arcade_secret_plays set started_at = now() - interval '90 seconds' where id = '${s1.session}'`);
  const f1 = await api('arcadeSecretFinish', s1.session, 5000, { level: 2 });
  check('LAND GRAB pays 3x Ink', f1.paid === 6, JSON.stringify({ paid: f1.paid }));

  // ---- the Back Room: a Claw Crane round without moving the claw
  await walkTo({ kind: 'machine', id: 'claw' }, 'm:claw');
  await page.click('[data-testid=arcade-play]', { force: true });
  await page.waitForSelector('[data-testid=arcade-start]', { timeout: 15000 }); await page.click('[data-testid=arcade-start]');
  await page.waitForSelector('[data-testid=arc-claw-x]', { timeout: 15000 });
  // let go of both buttons at once on every go: the claw drops straight down where it starts, over the prize chute
  for (let k = 0; k < 400 && !(await page.locator('[data-testid=arcade-done]').count()); k++) {
    for (const ax of ['x', 'z']) if (await page.locator(`[data-testid=arc-claw-${ax}]:not([disabled])`).count()) await page.click(`[data-testid=arc-claw-${ax}]`, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.waitForSelector('[data-testid=arcade-done]', { timeout: 60000 });
  const tok = await page.waitForSelector('[data-testid=token-chip]', { timeout: 15000 }).then(() => true, () => false);
  check('the claw fished out a rusty token', tok);
  await shot('06-token');
  await page.click('[data-testid=arcade-exit]', { timeout: 5000 }).catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(1200);
  await walkTo({ kind: 'bonus' }, 'bonus');
  check('the ticket machine takes the token', (await page.locator('[data-testid=feed-token]').count()) === 1);
  await shot('07-feed');
  await page.click('[data-testid=feed-token]');
  const br = await page.waitForSelector('[data-testid=reveal-backroom]', { timeout: 15000 }).then(() => true, () => false);
  check('ADMIT ONE', br && (await page.locator('[data-testid=admit-one]').count()) === 1);
  await page.waitForTimeout(1500); await shot('08-admit-one');
  await page.click('[data-testid=reveal-ok]');
  await page.waitForFunction(() => window.__landvasArcade.debug().near === 'backroom', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200); await shot('09-panel-open');
  check('walked to the open panel by the jukebox', (await page.locator('[data-testid=backroom-enter]').count()) === 1);
  await page.click('[data-testid=backroom-enter]');
  await page.waitForSelector('[data-testid=backroom]', { timeout: 10000 }); await page.waitForTimeout(800);
  await shot('10-backroom');
  await page.click('[data-testid=backroom-play]');
  await page.waitForSelector('[data-testid=secret-start]', { timeout: 15000 }); await page.click('[data-testid=secret-start]');
  await page.waitForSelector('[data-testid=arc-proto]', { timeout: 15000 }); await page.waitForTimeout(2600);
  await shot('11-proto-play');
  const pbox = await page.locator('[data-testid=arc-proto]').boundingBox();
  for (let k = 0; k < 120 && !(await page.locator('[data-testid=secret-done]').count()); k++) {
    await page.mouse.click(pbox.x + pbox.width * (0.2 + ((k * 37) % 60) / 100), pbox.y + pbox.height * (0.3 + ((k * 23) % 50) / 100)); await page.waitForTimeout(400);
  }
  check('PROTO-0 runs to a finish', await page.waitForSelector('[data-testid=secret-done]', { timeout: 60000 }).then(() => true, () => false));
  await shot('12-proto-done');
  await page.click('[data-testid=secret-exit]'); await page.waitForTimeout(800);
  await page.click('[data-testid=backroom-back]'); await page.waitForTimeout(1200);

  // ---- the B-Side: two songs on the jukebox, then three thumps
  await walkTo({ kind: 'jukebox' }, 'jukebox');
  await page.click('[data-testid=arcade-jukebox]');
  await page.waitForSelector('[data-testid=track-chill]', { timeout: 10000 });
  await page.click('[data-testid=track-chill]'); await page.waitForTimeout(1600);
  await page.click('[data-testid=track-neon]'); await page.waitForTimeout(1600);
  await closeDialogs();
  const jp = await hall(`h.screenOf('jukebox')`);
  for (let i = 0; i < 3; i++) { await page.mouse.click(jp.x, jp.y); await page.waitForTimeout(140); }
  const bs = await page.waitForSelector('[data-testid=reveal-bside]', { timeout: 15000 }).then(() => true, () => false);
  check('three thumps flip the record: TRACK 00', bs, JSON.stringify(jp));
  await page.waitForTimeout(800); await shot('13-bside-reveal');
  if (bs) {
    await page.click('[data-testid=reveal-ok]');
    await page.waitForSelector('[data-testid=bside-menu]', { timeout: 10000 });
    check('the next song’s chart is locked until the first is cleared', (await page.locator('[data-testid=bside-neon-easy]').count()) === 0);
    await shot('14-bside-menu');
    await page.click('[data-testid=bside-chill-easy]');
    await page.waitForSelector('[data-testid=secret-start]', { timeout: 15000 }); await page.click('[data-testid=secret-start]');
    const bb = await (await page.waitForSelector('[data-testid=arc-bside]', { timeout: 15000 })).boundingBox();
    // tap round the pads (no aim: a miss costs health, so the chart may well end with the record skipping — that's a finish too)
    for (let k = 0; k < 200 && !(await page.locator('[data-testid=secret-done]').count()); k++) {
      if (k === 12) await shot('15-bside-play');
      await page.mouse.click(bb.x + bb.width * (0.2 + (k % 4) * 0.2), bb.y + bb.height * (0.35 + ((k >> 2) % 4) * 0.13)).catch(() => {}); await page.waitForTimeout(300);
    }
    check('a B-side chart runs to a finish', await page.waitForSelector('[data-testid=secret-done]', { timeout: 120000 }).then(() => true, () => false));
    check('…with its result', (await page.locator('[data-testid=bside-result]').count()) === 1, await page.locator('[data-testid=bside-result]').innerText().catch(() => ''));
    await shot('16-bside-done');
  }
  const meFound = await api('arcadeSecretsMe');
  check('all three found', JSON.stringify([...meFound.found].sort()) === JSON.stringify(['backroom', 'bside', 'founder']), JSON.stringify(meFound.found));
  const feed = await sql(`select count(*)::int n from feed_events where data::text ilike '%landgrab%' or data::text ilike '%proto%' or data::text ilike '%bside%'`);
  check('nothing was posted to the feed', feed[0].n === 0);
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
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
