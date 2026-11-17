// ☄️ Meteorites pick up at once, however fast you got there. The server checks a pickup against where your last
// check-in put you; someone who walked (or drove, or flew zoomed out) a long way since then used to be told "too far"
// and wait 8 s before the app tried again. Now, on "too far", the app checks in from right where you stand and tries
// again straight away. Here: land on the Moon, check in, then jump far across the surface onto a meteorite — it must be
// picked up within a few seconds — and the planet quests count it at once.
// Run: npm run build:artifact && node tests/e2e/meteor-pickup.mjs
import { serve, launch } from './browser.mjs';
const PORT = 4363;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'meteor@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'meteorman'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into space_pilots (player_id, location) values ('${me}', 'moon') on conflict (player_id) do update set location = 'moon', dest = null, depart_at = null, arrive_at = null`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await nav('/space/surface');
  const ready = await page.waitForFunction(() => !!window.__landvasPlanet?.P, null, { timeout: 90000 }).then(() => true, () => false);
  check('landed on the Moon, walking', ready);
  // the first check-in puts you on the map
  const until = async (fn, ms, every = 250) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await page.waitForTimeout(every); } return false; };
  const checked = await until(async () => (await sql(`select count(*)::int n from planet_presence where world = 'moon' and player_id = '${me}'`))[0].n > 0, 30000, 500);
  check('…checked in', checked);
  await page.waitForTimeout(1500);
  // a meteorite far from where the check-in put you
  const pick = await page.evaluate(async () => {
    const pl = window.__landvasPlanet; const R = pl.R;
    const s = await window.__landvasApi.planetMeteors('moon');
    const here = [pl.P.d.x, pl.P.d.y, pl.P.d.z];
    const far = s.meteors.filter((m) => !m.taken).map((m) => ({ ...m, m: Math.acos(Math.min(1, Math.max(-1, m.d[0] * here[0] + m.d[1] * here[1] + m.d[2] * here[2]))) * R }))
      .sort((a, b) => b.m - a.m)[0];
    return far ? { i: far.i, d: far.d, m: Math.round(far.m), R } : null;
  });
  check('…a meteorite out there', !!pick, pick ? `#${pick.i}, ${pick.m} m away (the Moon is ${Math.round(pick.R)} m round)` : 'none');
  if (pick) {
    // (every pickup attempt, and how it went)
    await page.evaluate(() => {
      const a = window.__landvasApi; const orig = a.planetMeteorGrab; window.__grabs = [];
      a.planetMeteorGrab = async (...x) => { const rec = { at: Date.now(), ok: false, err: null }; window.__grabs.push(rec); try { const r = await orig(...x); rec.ok = true; return r; } catch (e) { rec.err = String(e?.code ?? e?.message ?? e); throw e; } };
    });
    // a check-in happens (a step away makes one), and right after it you're somewhere else entirely: the check-in put
    // you on the far side of the Moon from the meteorite (so the server allows hardly any walking since)
    const seen0 = (await sql(`select seen_at from planet_presence where world = 'moon' and player_id = '${me}'`))[0]?.seen_at;
    await page.waitForTimeout(10500);
    await page.evaluate(() => { const pl = window.__landvasPlanet; pl.P.d.applyAxisAngle(new pl.P.d.constructor(0, 1, 0).cross(pl.P.d).normalize(), 0.05).normalize(); });
    await until(async () => String((await sql(`select seen_at from planet_presence where world = 'moon' and player_id = '${me}'`))[0]?.seen_at) !== String(seen0), 8000, 100);
    await sql(`update planet_presence set d = array[${-pick.d[0]}, ${-pick.d[1]}, ${-pick.d[2]}]::float8[], seen_at = now() + private.presence_lease() where world = 'moon' and player_id = '${me}'`);
    const before = (await sql(`select count(*)::int n from planet_meteors where world = 'moon' and idx = ${pick.i}`))[0].n;
    check('…not taken yet', before === 0);
    // jump straight onto it (as if you'd raced there between check-ins)
    const t0 = Date.now();
    await page.evaluate((d) => { const pl = window.__landvasPlanet; pl.P.d.set(d[0], d[1], d[2]).normalize(); }, pick.d);
    const got = await until(async () => (await sql(`select count(*)::int n from planet_meteors where world = 'moon' and idx = ${pick.i}`))[0].n > 0, 20000, 200);
    const took = (Date.now() - t0) / 1000;
    const grabs = await page.evaluate(() => window.__grabs.map((g) => g.ok ? 'ok' : g.err));
    check('…picked up within a few seconds of arriving — told "too far", it checks in from there and tries again at once (not 8–10 s later)', got && took < 5.5 && grabs[0] === 'too_far' && grabs.at(-1) === 'ok', `${took.toFixed(1)} s · attempts: ${grabs.join(', ')}`);
    const who = (await sql(`select player_id from planet_meteors where world = 'moon' and idx = ${pick.i}`))[0]?.player_id;
    check('…by you', who === me, `${who} vs ${me} · ${JSON.stringify(await sql(`select * from planet_meteors where world = 'moon' order by 1 limit 5`))}`.slice(0, 400));
    // the quests know at once
    const q = await page.waitForFunction(() => {
      const d = window.__landvasQc.getQueryData(['planet-quests', 'moon']);
      const all = [...(d?.solo ?? []), ...(d?.crew ? [d.crew] : [])];
      const m = all.find((x) => /meteor/i.test(`${x.metric ?? ''} ${x.title ?? ''} ${x.text ?? ''}`));
      return !m || Number(m.progress ?? m.have ?? 0) > 0;
    }, null, { timeout: 6000, polling: 250 }).then(() => true, () => false);
    check('…and the planet quests count it straight away', q);
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run finished', false, String(e?.stack ?? e).slice(0, 500));
}
await browser.close(); server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
