// Real-browser test of helping hands (local-mode build, a phone):
//  - someone's at their farm: the lobbies offer "🤝 Help", which takes you there
//  - visiting a farm: water the owner's growing crops for them (a few a day), with a little Ink for you
//  - being at a place is something others can follow you into
// Run: npm run build:artifact && node tests/e2e/farm-help.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-farm-help'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4241;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid=${id}]:visible`);
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

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'helper@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'help_hal'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  // fay has a farm with a row of crops growing, and she's there
  const fay = await someone('farm_fay');
  await as(fay, 'claim_starter_plot', { p_gx: START.gx + 6, p_gy: START.gy + 6 });
  const g = (await as(fay, 'my_groups'))[0];
  const farm = (await as(fay, 'set_group_kind', { p_group_id: g.id, p_kind: 'farm' })).farm_id;
  const crop = Object.keys((await as(fay, 'farm_get', { p_id: farm })).config.crops)[0];
  for (let i = 0; i < 4; i++) await sql(`insert into farm_beds (farm_id, idx, crop, ready_at) values ('${farm}', ${i}, '${crop}', now() + interval '1 hour')`);
  await sql(`insert into player_activity (player_id, kind, detail, at) values ('${fay}', 'place', '{"what": "farm", "route": "/farm/${farm}"}', now() + interval '10 minutes') on conflict (player_id) do update set kind = excluded.kind, detail = excluded.detail, at = excluded.at`);

  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['party-lobbies'] }));
  await nav('/party?tab=lobbies'); await page.waitForTimeout(3000);
  const row = page.locator('[data-testid=lobby-player][data-user=farm_fay]');
  check('someone at their farm: the lobbies say so, with “Help”', await waitFor('[data-testid=lobby-player][data-user=farm_fay]', 10000) && /farm/.test(await row.textContent()) && /Help/.test(await row.locator('[data-testid=lobby-player-go]').textContent().catch(() => '')), await row.textContent().catch(() => ''));
  await shot('01-lobbies');
  await row.locator('[data-testid=lobby-player-go]').click();
  check('Help takes you to their farm', await waitFor('[data-testid=farm-help-bar]', 20000));
  await page.waitForTimeout(2500);
  check('…where you can water their crops', await waitFor('[data-testid=farm-help-next]', 8000) && /8 left today/.test(await tid('farm-help-bar').first().textContent()));
  await shot('02-farm');
  const ink0 = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0]?.amount ?? 0);
  await tid('farm-help-next').first().click();
  await page.waitForTimeout(2000);
  const watered = Number((await sql(`select count(*) n from farm_beds where farm_id = '${farm}' and watered`))[0].n);
  const ink1 = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0]?.amount ?? 0);
  check('…one watered (it grows faster), +1 Ink for you', watered === 1 && ink1 === ink0 + 1, `${watered} watered, ink ${ink0} → ${ink1}`);
  check('…7 left today', /7 left today/.test(await tid('farm-help-bar').first().textContent()));
  check('…and fay hears you helped', (await sql(`select 1 from player_notifications where player_id = '${fay}' and data ->> 'help' = 'true'`)).length === 1);
  await shot('03-helped');
  await page.waitForTimeout(1500);
  check('being at a farm is something others can follow you into', (await sql(`select kind, detail from player_activity where player_id = '${me}'`))[0]?.kind === 'place');
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
