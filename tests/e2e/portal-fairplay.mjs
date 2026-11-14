// Real-browser check of admin.landvas.app → Fair play's egg loop and ultras scanners, against a local PostgreSQL with
// every migration (through scripts/portal-dev-bridge.mjs, as in portal/README.md). A player caught in the egg loop: staff
// find them, see the plots their Luck rolled, put two back to their own roll, take back what they earned (Ink, USD and a
// plot bought with it, the rest owed), then see everyone's ultras and rent boosted 24/7, and the panels on the profile.
// Phone and desktop sizes. Run: node tests/e2e/portal-fairplay.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-fairplay');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54392, BRIDGE = 8792, WEB = 5192;
const dataDir = path.resolve('.pgtmp', `portal-fairplay-${process.pid}`);
fs.mkdirSync(path.dirname(dataDir), { recursive: true });
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PGPORT, persistent: false, onLog: () => {}, onError: () => {} });
const kids = [];
let browser;
try {
  await db.initialise(); await db.start();
  const root = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'postgres' }); await root.connect();
  await root.query(`create database landvas template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`); await root.end();
  const c = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'landvas' }); await c.connect();
  await c.query(fs.readFileSync('supabase/local/shim.sql', 'utf8'));
  for (const f of fs.readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    const s = fs.readFileSync(path.join('supabase/migrations', f), 'utf8'); if (!s.startsWith('-- @supabase-only')) await c.query(s);
  }
  const terms = (await c.query(`select value->>'terms_version' as v from game_config where key = 'legal'`)).rows[0].v;
  const as = async (uid, fn, args) => { await c.query('begin'); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]); await c.query('set local role authenticated');
    const keys = Object.keys(args); const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))); await c.query('commit'); return r.rows[0].r; };
  const player = async (name) => { const id = (await c.query(`insert into auth.users (email) values ($1) returning id`, [`${name}@example.test`])).rows[0].id; await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms }); return id; };
  await c.query(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await c.query(`update game_config set value = value || '{"free_plots": 10}'::jsonb where key = 'economy'`);
  await c.query(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
  const boss = await player('boss_admin'); const cheat = await player('loop_larry'); const fair = await player('fair_fiona');
  await c.query(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [boss]);
  const buy = async (uid, n, tag) => {
    await c.query(`update players set created_at = now() - interval '3 days' where id = $1`, [uid]);
    await as(uid, 'report_position', { p_lng: -111.891, p_lat: 40.7608, p_accuracy_m: 10 });
    for (let i = 0; i < n; i++) await as(uid, 'quick_buy_plot', { p_idempotency_key: `${tag}-buy-${i}-xxxxxxxx` });
  };
  await buy(cheat, 3, 'loop'); await buy(fair, 2, 'fair');
  const [A, B, C] = (await c.query(`select w.gx, w.gy from world_plots w join plot_ownership o on o.gx = w.gx and o.gy = w.gy and o.player_id = w.owner_id and o.released_at is null
                                    where w.owner_id = $1 order by (o.method = 'starter') desc, o.acquired_at, o.gx`, [cheat])).rows;
  // the loop: one Inkborn made, one egg, twelve sacrificed
  await c.query(`insert into inkborn_keepers (owner_id, made) values ($1, 1) on conflict (owner_id) do update set made = 1`, [cheat]);
  await c.query(`insert into inkborn (owner_id, client_key, name, source, genome, personality) values ($1, 'loop-keep-0001', 'Keeper', 'random', '{}', 'playful')`, [cheat]);
  await c.query(`insert into inkborn_eggs (owner_id, kind, shell, genome, parents, hatch_at) values ($1, 'speckled', '{}', '{}', '[]', now())`, [cheat]);
  for (let i = 0; i < 12; i++) await c.query(`insert into feed_events (kind, player_id, data, created_at) values ('luck', $1, '{"sub": "sacrifice", "what": "inkborn", "gained": 12, "name": "Blob"}', now() - make_interval(hours => 3, mins => $2::int))`, [cheat, 60 - i]);
  await c.query(`insert into player_luck (player_id, luck, sacrificed) values ($1, 0, 12) on conflict (player_id) do update set sacrificed = 12`, [cheat]);
  await c.query(`insert into luck_choices (player_id, gx, gy, options, shinies, best, created_at) values
    ($1, $2, $3, '["common", "legendary", "solar"]', '[false, false, true]', 2, now() - interval '2 hours'),
    ($1, $4, $5, '["rare", "mythic"]', '[false, false]', 1, now() - interval '110 minutes'),
    ($1, $6, $7, '["common", "epic"]', '[false, false]', 1, now() - interval '20 days')`, [cheat, A.gx, A.gy, B.gx, B.gy, C.gx, C.gy]);
  await c.query(`update world_plots set rarity = 'solar', shiny = true where gx = $1 and gy = $2`, [A.gx, A.gy]);
  await c.query(`update world_plots set rarity = 'mythic' where gx = $1 and gy = $2`, [B.gx, B.gy]);
  await c.query(`update world_plots set rarity = 'epic' where gx = $1 and gy = $2`, [C.gx, C.gy]);
  // Ink from a game on the ultra, USD in the bank, 200 Ink left, and C bought with Ink since
  const s = (await c.query(`insert into minigame_sessions (player_id, game, level, seed, expires_at, gx, gy, status, started_at) values ($1, 'tracecraft', 1, 1, now() + interval '1 hour', $2, $3, 'validated', now() - interval '30 minutes') returning id`, [cheat, A.gx, A.gy])).rows[0];
  await c.query(`insert into minigame_rewards (session_id, player_id, ink, created_at) values ($1, $2, 500, now() - interval '30 minutes')`, [s.id, cheat]);
  await c.query(`insert into rent_accounts (player_id, balance_usd, settled_at) values ($1, 1000, now()) on conflict (player_id) do update set balance_usd = 1000, settled_at = now()`, [cheat]);
  await c.query(`update resource_balances set amount = 200 where player_id = $1 and resource = 'ink'`, [cheat]);
  await c.query(`alter table plot_ownership disable trigger plot_ownership_immutable`);
  await c.query(`update plot_ownership set cost = '{"ink": 250}' where player_id = $1 and gx = $2 and gy = $3 and released_at is null`, [cheat, C.gx, C.gy]);
  await c.query(`alter table plot_ownership enable trigger plot_ownership_immutable`);
  // a fair player with two ultras
  await c.query(`update world_plots set rarity = 'comet' where owner_id = $1`, [fair]);
  await c.end();

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@localhost:${PGPORT}/landvas`, PORT: String(BRIDGE) };
  kids.push(spawn('node', ['scripts/portal-dev-bridge.mjs'], { env, stdio: 'ignore' }));
  kids.push(spawn('npx', ['vite', '--config', 'portal/vite.config.ts', '--port', String(WEB), '--strictPort'], { env: { ...process.env, PORTAL_APP: 'admin', VITE_PORTAL_DEV_API: `http://localhost:${BRIDGE}` }, stdio: 'ignore' }));
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${WEB}/`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  const dbq = async (q, a = []) => { const v = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'landvas' }); await v.connect(); try { return (await v.query(q, a)).rows; } finally { await v.end(); } };

  for (const [label, vp] of [['desktop', { width: 1400, height: 1000 }], ['phone', { width: 400, height: 860 }]]) {
    browser = await launch();
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: label === 'desktop' }).catch(() => {});
    const ok = async (name) => { await page.getByRole('button', { name, exact: true }).last().click(); };
    await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', 'boss_admin@example.test');
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});
    if (label === 'desktop') {
      await page.goto(`http://localhost:${WEB}/tools/integrity`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid=fair-play]', { timeout: 30000 });
      await page.getByRole('button', { name: '🥚 Egg loop' }).click();
      const row = await page.waitForSelector('[data-testid=egg-row-loop_larry]', { timeout: 30000 }).then(() => true, () => false);
      check('the egg loop scanner lists the player caught', row && (await page.locator('[data-testid^=egg-row-]').count()) === 1);
      check('…with how many extra Inkborn', /\b11\b/.test(await page.locator('[data-testid=egg-loop] table').innerText()));
      await shot('01-egg-loop');
      await page.click('[data-testid=egg-row-loop_larry]');
      await page.waitForSelector('[data-testid=egg-loop-player]', { timeout: 20000 });
      await page.waitForTimeout(800);
      const picked = await page.locator('[data-testid^=egg-pick-]:checked').count();
      check('the plots Luck upgraded in the loop are picked to start with (not the one from before)', picked === 2, String(picked));
      await shot('02-player');
      await page.click('[data-testid=egg-downgrade]'); await ok('Put them back'); await page.waitForTimeout(1500);
      const [a, b] = await Promise.all([dbq(`select rarity, shiny from world_plots where gx = $1 and gy = $2`, [A.gx, A.gy]), dbq(`select rarity from world_plots where gx = $1 and gy = $2`, [B.gx, B.gy])]);
      check('put back to their own rolls (the shine Luck gave goes too)', a[0].rarity === 'common' && !a[0].shiny && b[0].rarity === 'rare', JSON.stringify([a[0], b[0]]));
      await shot('03-fixed');
      await page.click('[data-testid=egg-preview]');
      await page.waitForSelector('[data-testid=egg-preview-result]', { timeout: 15000 });
      const pv = (await page.locator('[data-testid=egg-preview-result]').innerText()).replace(/\n/g, ' ');
      check('works out what to take back: 500 Ink from games, 200 from the balance, the plot bought, 50 owed', /500/.test(pv) && /200 of 200/.test(pv) && /1 · 250 Ink/.test(pv) && /\b50\b/.test(pv), pv.slice(0, 200));
      await shot('04-preview');
      await page.click('[data-testid=egg-reverse]'); await ok('Take it back'); await page.waitForTimeout(1500);
      const [ink, owed, cplot] = await Promise.all([dbq(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [cheat]), dbq(`select owed from private.ink_debts where player_id = $1`, [cheat]),
        dbq(`select owner_id from world_plots where gx = $1 and gy = $2`, [C.gx, C.gy])]);
      check('taken back: Ink to 0, the plot bought with it gone, 50 owed', Number(ink[0].amount) === 0 && Number(owed[0]?.owed) === 50 && cplot[0].owner_id === null, JSON.stringify({ ink: ink[0], owed: owed[0], c: cplot[0] }));
      await shot('05-reversed');
      check('every fix is in the audit log', (await dbq(`select count(*)::int n from audit_logs where action like 'egg_loop.%'`))[0].n === 3);
      await page.getByRole('button', { name: '🌈 Ultras & rent' }).click();
      const ur = await page.waitForSelector('[data-testid=ultra-row-fair_fiona]', { timeout: 30000 }).then(() => true, () => false);
      check('the ultras scanner lists who owns ultras, with rent boosted 24/7', ur && /\$/.test(await page.locator('[data-testid=ultra-scan] table').innerText()));
      await shot('06-ultras');
      await page.goto(`http://localhost:${WEB}/players/${fair}`, { waitUntil: 'load' });
      const pu = await page.waitForSelector('[data-testid=player-ultras]', { timeout: 30000 }).then(() => true, () => false);
      check('a profile shows their ultras and rent boosted 24/7', pu && /Boosted 24\/7/.test(await page.locator('[data-testid=player-ultras]').innerText()));
      await shot('07-profile-ultras');
      await page.goto(`http://localhost:${WEB}/players/${cheat}/fairplay`, { waitUntil: 'load' });
      const fp = await page.waitForSelector('[data-testid=egg-loop-player]', { timeout: 30000 }).then(() => true, () => false);
      check('their Fair play tab shows the egg loop and what was done', fp && /Took back/.test(await page.locator('[data-testid=egg-loop-player]').innerText()));
      await shot('08-profile-fairplay');
    } else {
      await page.goto(`http://localhost:${WEB}/tools/integrity?view=eggloop&player=${cheat}`, { waitUntil: 'load' });
      const pl = await page.waitForSelector('[data-testid=egg-loop-player]', { timeout: 30000 }).then(() => true, () => false);
      check(`${label}: the player's egg loop opens from a link`, pl);
      await page.waitForTimeout(800); await shot('01-egg-player');
      await page.goto(`http://localhost:${WEB}/tools/integrity?view=ultras`, { waitUntil: 'load' });
      check(`${label}: ultras & rent`, await page.waitForSelector('[data-testid=ultra-row-fair_fiona]', { timeout: 30000 }).then(() => true, () => false));
      await shot('02-ultras');
      await page.goto(`http://localhost:${WEB}/players/${fair}`, { waitUntil: 'load' });
      check(`${label}: the profile panel`, await page.waitForSelector('[data-testid=player-ultras]', { timeout: 30000 }).then(() => true, () => false));
      await page.locator('[data-testid=player-ultras]').scrollIntoViewIfNeeded(); await shot('03-profile');
    }
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close(); await browser.close(); browser = null;
  }
} catch (e) {
  console.log('FAIL  crashed:', e.message);
  results.push({ name: 'crashed', ok: false });
} finally {
  await browser?.close();
  for (const k of kids) k.kill();
  await db.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
}
