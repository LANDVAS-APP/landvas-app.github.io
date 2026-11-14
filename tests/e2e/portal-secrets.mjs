// Real-browser check of admin.landvas.app → Arcade secrets, against a local PostgreSQL with every migration (through
// scripts/portal-dev-bridge.mjs, as in portal/README.md). Staff sign in, see the four secrets in their own colours,
// edit each recipe visually (the Founder's floor plan, the claw's drop zone, the B-Side's song order, the Mirror's
// steps), change a payout, save, and give a player a secret. Phone and desktop sizes.
// Run: node tests/e2e/portal-secrets.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-secrets');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54391, BRIDGE = 8791, WEB = 5191;
const dataDir = path.resolve('.pgtmp', `portal-secrets-${process.pid}`);
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
  const boss = await player('boss_admin'); const a = await player('ava_finder'); const b = await player('ben_finder'); await player('cleo_player');
  await c.query(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [boss]);
  // a few finds and plays so the cards have numbers on them
  await c.query(`insert into arcade_secret_state (player_id, secret, found_at, bounty_paid) values ($1, 'founder', now() - interval '2 days', 1000), ($2, 'founder', now(), 1000), ($1, 'bside', now(), 750)`, [a, b]);
  await c.query(`insert into arcade_mirror_found (player_id, bounty_paid) values ($1, 500)`, [a]);
  await c.query(`insert into arcade_secret_plays (player_id, secret, game, seed, started_at, finished_at, score, tickets, ink) values ($1, 'founder', 'landgrab', 1, now() - interval '5 minutes', now(), 5000, 100, 6), ($1, 'bside', 'bside.chill.easy', 2, now() - interval '3 minutes', now(), 900, 45, 3)`, [a]);
  await c.end();

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@localhost:${PGPORT}/landvas`, PORT: String(BRIDGE) };
  kids.push(spawn('node', ['scripts/portal-dev-bridge.mjs'], { env, stdio: 'ignore' }));
  kids.push(spawn('npx', ['vite', '--config', 'portal/vite.config.ts', '--port', String(WEB), '--strictPort'], { env: { ...process.env, PORTAL_APP: 'admin', VITE_PORTAL_DEV_API: `http://localhost:${BRIDGE}` }, stdio: 'ignore' }));
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${WEB}/`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

  for (const [label, vp] of [['phone', { width: 400, height: 860 }], ['desktop', { width: 1400, height: 1000 }]]) {
    browser = await launch();
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: label === 'desktop' }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', 'boss_admin@example.test');
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/secrets`, { waitUntil: 'load' });
    const cards = await page.waitForSelector('[data-testid=secret-cards]', { timeout: 30000 }).then(() => true, () => false);
    check(`${label}: four secret cards`, cards && (await page.locator('[data-testid^=secret-card-]').count()) === 4);
    check(`${label}: the founder card counts its finders`, /Finders\s*2/.test((await page.locator('[data-testid=secret-card-founder]').innerText()).replace(/\n/g, ' ')));
    await shot('01-cards');
    if (label === 'desktop') {
      // the Mirror: take a cabinet out of step 1
      await page.locator('[data-testid=mirror-recipe] button[title="Ink Tower"]').first().click();
      await page.fill('[data-testid=secret-mult]', '4');
      await shot('02-mirror');
      await page.click('[data-testid=secret-save]'); await page.waitForTimeout(1200);
      // the Founder's Code: draw a different shape on the floor plan
      await page.click('[data-testid=secret-card-founder]'); await page.waitForSelector('[data-testid=founder-recipe]');
      await shot('03-founder');
      await page.locator('[data-testid=founder-recipe] button', { hasText: 'Clear' }).click();
      for (const [x, y] of [[3, 0], [3, 1], [3, 2], [2, 2], [1, 2]]) await page.click(`[data-testid=founder-cell-${x}-${y}]`);
      await page.fill('[data-testid=secret-bounty]', '1200');
      await page.click('[data-testid=secret-save]'); await page.waitForTimeout(1200);
      await shot('04-founder-saved');
      // the Back Room: move the drop zone to the middle
      await page.click('[data-testid=secret-card-backroom]'); await page.waitForSelector('[data-testid=backroom-recipe]');
      await page.click('[data-testid=zone-center]');
      await shot('05-backroom');
      await page.click('[data-testid=secret-save]'); await page.waitForTimeout(1200);
      // the B-Side: re-roll the song order, then give it to a player
      await page.click('[data-testid=secret-card-bside]'); await page.waitForSelector('[data-testid=bside-recipe]');
      await page.click('[data-testid=secret-reroll]');
      await page.click('[data-testid=secret-save]'); await page.waitForTimeout(1200);
      await page.fill('[data-testid=secret-finder-search]', 'cleo');
      await page.locator('button', { hasText: 'Give' }).first().click({ timeout: 10000 }); await page.waitForTimeout(1200);
      await shot('06-bside');
      // what the database now says
      const v = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'landvas' }); await v.connect();
      const rows = Object.fromEntries((await v.query(`select id, cfg from private.arcade_secrets`)).rows.map((r) => [r.id, r.cfg]));
      check('saved: the Mirror without Ink Tower in step 1, at ×4', !rows.mirror.recipe[0].includes('stacker') && rows.mirror.ink_mult === 4);
      check('saved: the Founder’s new shape and bounty', JSON.stringify(rows.founder.shape) === '[[3,0],[3,1],[3,2],[2,2],[1,2]]' && rows.founder.bounty === 1200);
      check('saved: the Back Room’s middle drop zone', rows.backroom.zone === 'center');
      check('saved: the B-Side’s songs, re-rolled (still the same five)', [...rows.bside.songs].sort().join() === 'boss,chill,funk,neon,pixel');
      check('given: cleo has the B-Side', (await v.query(`select count(*)::int n from arcade_secret_state s join profiles p on p.id = s.player_id where p.username = 'cleo_player' and s.secret = 'bside' and s.found_at is not null`)).rows[0].n === 1);
      check('every save is in the audit log', (await v.query(`select count(*)::int n from audit_logs where action like 'arcade_secret.%'`)).rows[0].n >= 5);
      await v.end();
    } else {
      await page.click('[data-testid=secret-card-backroom]'); await page.waitForSelector('[data-testid=backroom-recipe]'); await page.waitForTimeout(400);
      await shot('02-backroom');
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
