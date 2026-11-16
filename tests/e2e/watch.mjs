// Real-browser test of watching someone play (local-mode build, a phone). The other side of the channel is played
// from inside the page (the local backend's live channels are this browser's BroadcastChannels):
//  - being watched: on your farm a watcher says hi → "👀 1 watching", pictures of the screen go out (the page and a
//    JPEG of the 3D farm), their reactions float up; on the map nothing is sent
//  - the pictures can't do anything on the watcher's side (scripts, handlers, redirects, outside loads are gone)
//  - watching: "Live now" in the lobbies → their screen live, a LIVE badge with the count, reactions go to them,
//    "stepped away" when they leave the game; switched off → "isn't letting people watch"
// Run: npm run build:artifact && node tests/e2e/watch.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-watch'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4243;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::|Content Security Policy/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
async function someone(name) {
  const id = (await sql(`insert into auth.users (email) values ('${name}@example.test') returning id`))[0].id;
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms });
  await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${id}'`);
  return id;
}
/** play the other end of a channel from inside the page */
const tap = (channel) => page.evaluate((channel) => {
  const bc = new BroadcastChannel(`landvas-live:${channel}`);
  window.__tap = { bc, got: [] };
  bc.onmessage = (e) => window.__tap.got.push(e.data);
}, channel);
const post = (m) => page.evaluate((m) => window.__tap.bc.postMessage(m), m);
const got = (t) => page.evaluate((t) => window.__tap.got.filter((m) => m.t === t), t);
const clearGot = () => page.evaluate(() => { window.__tap.got = []; });

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'watcher@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'watch_wes'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  // my farm
  await as(me, 'claim_starter_plot', { p_gx: START.gx, p_gy: START.gy });
  const g = (await as(me, 'my_groups'))[0];
  const farm = (await as(me, 'set_group_kind', { p_group_id: g.id, p_kind: 'farm' })).farm_id;

  // ---- being watched ------------------------------------------------------------------------------------------
  await nav(`/farm/${farm}`);
  await page.waitForTimeout(6000);
  const mine = await page.evaluate(() => window.__landvasApi.watchMe());
  check('your own channel: a secret key, on by default', mine.on === true && /^watch:[0-9a-f-]{36}$/.test(mine.channel), mine.channel);
  await tap(mine.channel);
  const fan = 'fan-0000-0000';
  const hi = () => post({ t: 'hi', id: fan, u: 'star_sia' });
  await hi(); const hiTimer = setInterval(() => void hi().catch(() => {}), 3000);
  check('a watcher comes in: “👀 1 watching” on your screen', await waitFor('[data-testid=watch-chip]', 10000) && /1 watching/.test(await page.textContent('[data-testid=watch-chip]')));
  await page.waitForTimeout(5500);
  const frames = await got('f'), stats = await got('s');
  const f = frames.at(-1);
  // (a couple a second; a picture the same as the last one only goes out every few seconds)
  check('…pictures of your screen go out, a couple a second', frames.length >= 1 && (frames.at(-1)?.seq ?? 0) >= 3 && stats.some((s) => s.on && s.n === 1), `${frames.length} sent, ${frames.at(-1)?.seq} taken, ${stats.length} status`);
  check('…the page (HTML, packed small) and a JPEG of the 3D farm', !!f && f.html.length > 200 && f.gz === true && /^data:image\/jpeg;base64,/.test(f.cv?.[0] ?? '') && f.w === 430,
    f ? `html ${Math.round(f.html.length / 1024)} KB, cv ${f.cv.map((c) => (c ? Math.round(c.length / 1024) + ' KB' : '–')).join('/')}` : 'none');
  const html = f ? await page.evaluate(async (f) => new Response(new Blob([Uint8Array.from(atob(f.html), (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text(), f) : '';
  check('…without the watching chip, toasts or the Worlds button', !!html && /farm/i.test(html) && !/watch-chip|data-sonner-toaster|lv-worlds/.test(html) && /data-lvcv="0"/.test(html));
  fs.writeFileSync(path.join(OUT, 'frame.json'), JSON.stringify(f ?? null));
  await post({ t: 'r', id: fan, u: 'star_sia', e: '🔥' });
  check('their reaction floats up on your screen', await waitFor('.lv-watch-float', 4000) && /star_sia/.test(await page.textContent('.lv-watch-host')));
  await shot('01-watched');
  await page.click('[data-testid=watch-chip]');
  check('tap it: who’s watching, and a way to stop', await waitFor('[data-testid=watch-pop]', 3000) && /@star_sia/.test(await page.textContent('[data-testid=watch-pop]')) && await page.locator('[data-testid=watch-stop]').isVisible());
  await shot('02-who');
  // on the map: nothing
  await nav('/world');
  await page.waitForTimeout(1500);
  await clearGot();
  await page.waitForTimeout(3500);
  check('on the map nothing is sent (and nothing shows)', (await got('f')).length === 0 && !(await page.locator('[data-testid=watch-chip]').count()));
  clearInterval(hiTimer);

  // ---- the pictures can't act -----------------------------------------------------------------------------------
  const star = await someone('star_sia');
  await sql(`insert into player_activity (player_id, kind, detail, at) values ('${star}', 'game', '{"game": "tracecraft"}', now() + interval '10 minutes') on conflict (player_id) do update set kind = excluded.kind, detail = excluded.detail, at = excluded.at`);
  await nav('/party?tab=lobbies'); await page.waitForTimeout(2500);
  check('Live now: someone playing, to watch', await waitFor('[data-testid=live-now-card][data-user=star_sia]', 12000) && /TraceCraft|tracecraft/.test(await page.textContent('[data-testid=live-now-card][data-user=star_sia]')));
  await shot('03-live-now');
  await page.click('[data-testid=live-now-card][data-user=star_sia]');
  check('…tap: their watch screen', await waitFor('[data-testid=watch-screen]', 15000));
  await page.waitForFunction(() => !!window.__landvasWatch, null, { timeout: 15000 });
  const evil = await page.evaluate(() => {
    const d = new DOMParser().parseFromString(`<body><div class="p-2" onclick="alert(1)" style="background:url(https://evil.test/x.png);color:red">hi
      <img src="https://evil.test/p.gif" onerror="window.__pwned=1"><img src="data:image/png;base64,iVBORw0KGgo=">
      <script>window.__pwned=1</script><meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test/">
      <a href="javascript:alert(1)">x</a><form action="https://evil.test"><input name="pw"></form><iframe src="https://evil.test"></iframe>
      <svg><use href="#ok"/><use href="https://evil.test/s.svg#x"/><animate attributeName="href" to="javascript:alert(1)"/><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>
      <style>@import url(https://evil.test/a.css); .x{background:url(https://evil.test/b.png)}</style></div></body>`, 'text/html');
    window.__landvasWatch.sanitize(d.body);
    return d.body.innerHTML;
  });
  check('a picture is cleaned: no scripts, handlers, redirects, forms, frames or outside loads', !/script|onerror|onclick|http-equiv|<base|javascript:|<form|<iframe|evil\.test|<animate|foreignobject/i.test(evil)
    && /data:image\/png/.test(evil) && /href="#ok"/.test(evil) && /color:\s*red/.test(evil), evil.replace(/\s+/g, ' ').slice(0, 300));
  check('…and shown in a frame that can’t run anything', await page.evaluate(() => { const f = document.querySelector('[data-testid=watch-frame]'); return f?.getAttribute('sandbox') === 'allow-same-origin' && /script-src 'none'/.test(f.getAttribute('srcdoc') ?? ''); }));

  // ---- watching -------------------------------------------------------------------------------------------------
  const key = (await sql(`select key from watch_keys where player_id = '${star}'`))[0]?.key;
  check('watching gets you their (secret) channel', !!key);
  await tap(`watch:${key}`);
  await page.waitForTimeout(4500);
  const his = await got('hi');
  check('…and you say hi there (so their game knows you’re watching)', his.some((m) => m.u === 'watch_wes' && m.id === me));
  const frame = JSON.parse(fs.readFileSync(path.join(OUT, 'frame.json'), 'utf8'));
  await post({ t: 's', on: true, label: '🎮 playing TraceCraft', n: 2, names: ['watch_wes', 'other'] });
  await post({ ...frame, seq: 1 });
  check('their screen, live, with the count', await waitFor('[data-testid=watch-live]', 6000) && /2/.test(await page.textContent('[data-testid=watch-live]')) && /TraceCraft/.test(await page.textContent('[data-testid=watch-what]')));
  await page.waitForTimeout(1200);
  const inside = await page.evaluate(() => {
    const d = document.querySelector('[data-testid=watch-frame]').contentDocument;
    const img = d.querySelector('img[data-lvcv="0"]');
    return { n: d.body.querySelectorAll('*').length, img: !!img && /^data:image\/jpeg/.test(img.getAttribute('src') ?? ''), w: img?.naturalWidth ?? 0, text: d.body.textContent.slice(0, 200), scripts: d.querySelectorAll('script').length };
  });
  check('…their page and their 3D farm, drawn in the frame', inside.n > 10 && inside.img && inside.w > 50 && inside.scripts === 0 && /farm/i.test(inside.text), JSON.stringify(inside).slice(0, 200));
  await post({ ...frame, seq: 2 }); // the same picture again: patched in place, not rebuilt
  await shot('04-watching');
  await clearGot();
  await page.locator('[data-testid=watch-react]').nth(1).click();
  await page.waitForTimeout(500);
  check('react: they get it (and you see it float up)', (await got('r')).some((m) => m.e === '🔥' && m.u === 'watch_wes') && await page.locator('.lv-watch-float').count() > 0);
  check('ways to join in: team up, profile', await page.locator('[data-testid=watch-teamup]').isVisible());
  await post({ t: 's', on: false, label: '🗺️ on the map', n: 0, names: [] });
  check('they step away from the game: “stepped away”', await waitFor('[data-testid=watch-empty]', 5000) && /stepped away|isn’t playing/.test(await page.textContent('[data-testid=watch-empty]')));
  await shot('05-away');
  // switched off
  await sql(`update profiles set privacy = privacy || '{"spectate": false}' where id = '${star}'`);
  await page.evaluate(() => window.__landvasQc.removeQueries({ queryKey: ['watch'] }));
  await nav('/party'); await page.waitForTimeout(800); await nav('/watch/star_sia');
  check('they switch it off: “isn’t letting people watch”', await waitFor('[data-testid=watch-empty]', 10000) && /isn’t letting people watch/.test(await page.textContent('[data-testid=watch-empty]')));
  check('…and the old key no longer works', (await sql(`select key from watch_keys where player_id = '${star}'`))[0]?.key !== key);
  await nav('/settings'); await page.waitForTimeout(2500);
  const priv = page.locator('#pv-spectate');
  if (!(await priv.count())) { await page.locator('text=Privacy').first().click().catch(() => {}); await page.waitForTimeout(1500); }
  check('Settings: “Let people watch me play”', await page.locator('#pv-spectate').count() > 0);
  check('no sneaky loads from the test pictures', !(await page.evaluate(() => window.__pwned)));
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
