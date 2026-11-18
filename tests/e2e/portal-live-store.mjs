// Real-browser check of admin.landvas.app → Live control → the store buttons on landvas.app, against a local PostgreSQL
// with every migration (through scripts/portal-dev-bridge.mjs, as in portal/README.md): both switches start off
// ("coming soon"), turning the Google Play one on and saving stores store.on_website.android = true and keeps the link.
// Run: node tests/e2e/portal-live-store.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-live-store');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54397, BRIDGE = 8797, WEB = 5197;
const dataDir = path.resolve('.pgtmp', `portal-live-store-${process.pid}`);
fs.mkdirSync(path.dirname(dataDir), { recursive: true });
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PGPORT, persistent: false, onLog: () => {}, onError: () => {} });
const kids = [];
let browser;
try {
  await db.initialise(); await db.start();
  const root = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'postgres' }); await root.connect();
  await root.query(`create database landvas template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`); await root.end();
  const c = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'landvas' }); c.on('error', () => {}); await c.connect();
  await c.query(fs.readFileSync('supabase/local/shim.sql', 'utf8'));
  for (const f of fs.readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    const s = fs.readFileSync(path.join('supabase/migrations', f), 'utf8'); if (!s.startsWith('-- @supabase-only')) await c.query(s);
  }
  const terms = (await c.query(`select value->>'terms_version' as v from game_config where key = 'legal'`)).rows[0].v;
  const as = async (uid, fn, args) => { await c.query('begin'); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]); await c.query('set local role authenticated');
    const keys = Object.keys(args); const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))); await c.query('commit'); return r.rows[0].r; };
  const boss = (await c.query(`insert into auth.users (email) values ('boss_admin@example.test') returning id`)).rows[0].id;
  await as(boss, 'complete_onboarding', { p_username: 'boss_admin', p_accept_terms_version: terms });
  await c.query(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [boss]);
  const store = async () => (await c.query(`select value->'store' as s from game_config where key = 'app'`)).rows[0].s;

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@localhost:${PGPORT}/landvas`, PORT: String(BRIDGE) };
  kids.push(spawn('node', ['scripts/portal-dev-bridge.mjs'], { env, stdio: 'ignore' }));
  kids.push(spawn('npx', ['vite', '--config', 'portal/vite.config.ts', '--port', String(WEB), '--strictPort'], { env: { ...process.env, PORTAL_APP: 'admin', VITE_PORTAL_DEV_API: `http://localhost:${BRIDGE}` }, stdio: 'ignore' }));
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${WEB}/`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
  await page.waitForSelector('input', { timeout: 60000 });
  await page.fill('input[type=email], input', 'boss_admin@example.test');
  await page.locator('button[type=submit]').first().click();
  await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});
  await page.goto(`http://localhost:${WEB}/live`, { waitUntil: 'load' });
  const play = page.getByRole('switch', { name: 'Google Play button on landvas.app' });
  const apple = page.getByRole('switch', { name: 'App Store button on landvas.app' });
  check('Live control shows a landvas.app switch for each store', await play.waitFor({ timeout: 30000 }).then(() => true, () => false) && (await apple.count()) === 1);
  check('both start off (coming soon)', (await play.getAttribute('aria-checked')) === 'false' && (await apple.getAttribute('aria-checked')) === 'false');
  const section = page.locator('text=App versions').first();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, '01-off.png') });
  await play.click();
  await page.click('[data-testid=live-save]');
  await page.waitForTimeout(1500);
  const s = await store();
  check('saving stores the Google Play switch and keeps the link', s?.on_website?.android === true && /play\.google\.com/.test(s?.android ?? ''), JSON.stringify(s));
  check('the App Store one stays off', !s?.on_website?.ios);
  await page.screenshot({ path: path.join(OUT, '02-play-on.png') });
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
