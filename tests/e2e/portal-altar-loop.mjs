// Real-browser check of admin.landvas.app → Fair play → Altar loop, against a local PostgreSQL with every migration
// (through scripts/portal-dev-bridge.mjs, as in portal/README.md). A player laid the same Gemini on the altar three times
// and a clan mate sacrificed a cell after them: staff find both, open the first, take back part of the Luck they hold,
// put the plot that Luck rolled back to its own roll, and take back half of what it earned; the profile shows it all.
// Phone and desktop sizes. Run: node tests/e2e/portal-altar-loop.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-altar-loop');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54397, BRIDGE = 8797, WEB = 5197;
const dataDir = path.resolve('.pgtmp', `portal-altar-${process.pid}`);
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
  const boss = await player('boss_admin'); const lou = await player('loop_lou'); const cam = await player('clan_cam');
  await c.query(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [boss]);
  await c.query(`update players set created_at = now() - interval '3 days' where id = $1`, [lou]);
  await as(lou, 'report_position', { p_lng: -111.891, p_lat: 40.7608, p_accuracy_m: 10 });
  for (let i = 0; i < 2; i++) await as(lou, 'quick_buy_plot', { p_idempotency_key: `altar-buy-${i}-xxxxxxxx` });
  const [A] = (await c.query(`select gx, gy from world_plots where owner_id = $1 order by gx, gy limit 1`, [lou])).rows;
  // before the fix: the same Gemini laid on the altar three times; Cam sacrificed a cell Lou had laid there first
  const X = { gx: 3170001, gy: 6300001 }, Y = { gx: 3170003, gy: 6300003 };
  const sac = async (who, cell, mins, rarity = 'gemini', gained = 100) => {
    const at = (await c.query(`select private.altar_fix_at() - make_interval(mins => $1::int) t`, [mins])).rows[0].t;
    await c.query(`insert into plot_ownership (gx, gy, player_id, method, cost, acquired_at, released_at, release_reason) values ($1, $2, $3, 'acquire', '{"ink": 100}', $4::timestamptz - interval '5 minutes', $4, 'sacrificed for luck')`, [cell.gx, cell.gy, who, at]);
    await c.query(`insert into feed_events (kind, player_id, data, created_at) values ('luck', $1, jsonb_build_object('sub', 'sacrifice', 'what', 'plot', 'gained', $2::int, 'rarity', $3::text, 'shiny', false), $4)`, [who, gained, rarity, at]);
  };
  await sac(lou, X, 300); await sac(lou, Y, 280, 'mythic', 60); await sac(lou, X, 240); await sac(lou, X, 180); await sac(cam, Y, 120, 'mythic', 60);
  await c.query(`insert into player_luck (player_id, luck, sacrificed) values ($1, 60, 4) on conflict (player_id) do update set luck = 60`, [lou]);
  await c.query(`insert into luck_choices (player_id, gx, gy, options, shinies, best, created_at) values ($1, $2, $3, '["common", "epic", "solar"]', '[false, false, false]', 2, private.altar_fix_at() - interval '230 minutes')`, [lou, A.gx, A.gy]);
  await c.query(`update world_plots set rarity = 'solar' where gx = $1 and gy = $2`, [A.gx, A.gy]);
  const s = (await c.query(`insert into minigame_sessions (player_id, game, level, seed, expires_at, gx, gy, status, started_at) values ($1, 'tracecraft', 1, 1, now() + interval '1 hour', $2, $3, 'validated', now() - interval '30 minutes') returning id`, [lou, A.gx, A.gy])).rows[0];
  await c.query(`insert into minigame_rewards (session_id, player_id, ink, created_at) values ($1, $2, 800, now() - interval '30 minutes')`, [s.id, lou]);
  await c.query(`update resource_balances set amount = 1000 where player_id = $1 and resource = 'ink'`, [lou]);
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
      await page.getByRole('button', { name: '🔁 Altar loop' }).click();
      const row = await page.waitForSelector('[data-testid=altar-row-loop_lou]', { timeout: 30000 }).then(() => true, () => false);
      check('the altar loop scanner lists both players, worst first', row && (await page.locator('[data-testid^=altar-row-]').count()) === 2);
      check('…with their repeats and the Luck they gave', /\b200\b/.test(await page.locator('[data-testid=altar-loop] table').innerText()));
      await shot('01-scan');
      await page.click('[data-testid=altar-row-loop_lou]');
      await page.waitForSelector('[data-testid=altar-loop-player]', { timeout: 20000 });
      await page.waitForTimeout(800);
      check('the plot rolled right after a repeat is picked to start with', (await page.locator('[data-testid^=altar-pick-]:checked').count()) === 1);
      await shot('02-player');
      await page.fill('[data-testid=altar-luck-amount]', '35');
      await page.click('[data-testid=altar-luck-take]'); await ok('Take it back'); await page.waitForTimeout(1500);
      check('takes back the Luck asked for (35 of the 60 they hold)', Number((await dbq(`select luck from player_luck where player_id = $1`, [lou]))[0].luck) === 25);
      await page.click('[data-testid=altar-downgrade]'); await ok('Put them back'); await page.waitForTimeout(1500);
      check('the Luck plot goes back to its own roll', (await dbq(`select rarity from world_plots where gx = $1 and gy = $2`, [A.gx, A.gy]))[0].rarity === 'common');
      await page.fill('[data-testid=altar-share]', '50');
      await page.click('[data-testid=altar-preview]');
      await page.waitForSelector('[data-testid=altar-preview-result]', { timeout: 15000 });
      const pv = (await page.locator('[data-testid=altar-preview-result]').innerText()).replace(/\n/g, ' ');
      check('works out half of what it earned: 400 of the 800 Ink from games', /50% is 400/.test(pv), pv.slice(0, 160));
      await shot('03-preview');
      await page.click('[data-testid=altar-reverse]'); await ok('Take it back'); await page.waitForTimeout(1500);
      const ink = Number((await dbq(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [lou]))[0].amount);
      check('half is taken back from their Ink', ink <= 600 && ink >= 0, String(ink));
      check('every action is in the audit log', (await dbq(`select count(*)::int n from audit_logs where action like 'altar_loop.%'`))[0].n === 3);
      await shot('04-done');
      await page.goto(`http://localhost:${WEB}/players/${lou}/fairplay`, { waitUntil: 'load' });
      const fp = await page.waitForSelector('[data-testid=altar-loop-player]', { timeout: 30000 }).then(() => true, () => false);
      check('their Fair play tab shows the altar loop and what was done', fp && /Took back 35 Luck/.test(await page.locator('[data-testid=altar-loop-player]').innerText()));
      await shot('05-profile');
    } else {
      await page.goto(`http://localhost:${WEB}/tools/integrity?view=altarloop&player=${cam}`, { waitUntil: 'load' });
      const pl = await page.waitForSelector('[data-testid=altar-loop-player]', { timeout: 30000 }).then(() => true, () => false);
      check(`${label}: a player's altar loop opens from a link, showing whose cell it was`, pl && /after @loop_lou/.test(await page.locator('[data-testid=altar-loop-player]').innerText()));
      await page.waitForTimeout(800); await shot('01-player');
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
