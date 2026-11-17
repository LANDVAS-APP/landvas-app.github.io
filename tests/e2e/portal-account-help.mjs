// Real-browser check of admin.landvas.app → a player → Account: fixing a mistyped email (both ways), sending links,
// marking confirmed, a link to copy (owner), signing out everywhere, the history, and what support staff can't do.
// Against a local PostgreSQL with every migration, through scripts/portal-dev-bridge.mjs (which stands in for the
// account-help Edge Function; no emails are sent). Phone and desktop.
// Run: node tests/e2e/portal-account-help.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-account-help');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54396, BRIDGE = 8796, WEB = 5196;
const dataDir = path.resolve('.pgtmp', `portal-account-${process.pid}`);
fs.mkdirSync(path.dirname(dataDir), { recursive: true });
fs.chmodSync(path.dirname(dataDir), 0o777);
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PGPORT, persistent: false, onLog: () => {}, onError: () => {} });
const kids = [];
let browser;
const conn = () => new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'landvas' });

try {
  await db.initialise(); await db.start();
  const root = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'postgres' }); await root.connect();
  await root.query(`create database landvas template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`); await root.end();
  const c = conn(); await c.connect();
  await c.query(fs.readFileSync('supabase/local/shim.sql', 'utf8'));
  for (const f of fs.readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    const s = fs.readFileSync(path.join('supabase/migrations', f), 'utf8'); if (!s.startsWith('-- @supabase-only')) await c.query(s);
  }
  const terms = (await c.query(`select value->>'terms_version' as v from game_config where key = 'legal'`)).rows[0].v;
  const as = async (uid, fn, args) => { await c.query('begin'); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]); await c.query('set local role authenticated');
    const keys = Object.keys(args); const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))); await c.query('commit'); return r.rows[0].r; };
  const player = async (name, email = `${name}@example.test`) => { const id = (await c.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id; await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms }); return id; };
  const boss = await player('boss_admin'); const sam = await player('sam_support');
  // signed up with a typo and never got the email: Supabase never confirmed them
  const tina = await player('tina_typo', 'tina@gmial.com');
  await c.query(`update auth.users set email_confirmed_at = null, confirmation_sent_at = now() - interval '2 days', encrypted_password = 'x' where id = $1`, [tina]);
  const omar = await player('omar_ok');
  await c.query(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($2, 'support')`, [boss, sam]);
  await c.end();

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@localhost:${PGPORT}/landvas`, PORT: String(BRIDGE) };
  kids.push(spawn('node', ['scripts/portal-dev-bridge.mjs'], { env, stdio: 'ignore' }));
  kids.push(spawn('npx', ['vite', '--config', 'portal/vite.config.ts', '--port', String(WEB), '--strictPort'], { env: { ...process.env, PORTAL_APP: 'admin', VITE_PORTAL_DEV_API: `http://localhost:${BRIDGE}` }, stdio: 'ignore' }));
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${WEB}/`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

  for (const [label, vp, who] of [['desktop', { width: 1400, height: 1000 }, 'boss_admin'], ['phone', { width: 400, height: 860 }, 'sam_support']]) {
    browser = await launch();
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: true }).catch(() => {});
    const toast = async (re) => { const t = page.locator('[data-sonner-toast]').filter({ hasText: re }); return t.first().waitFor({ timeout: 8000 }).then(() => true, () => false); };
    const ask = async (reason) => { await page.waitForSelector('[data-testid=acct-ask-go]'); if (reason) await page.fill('[data-testid=acct-ask-reason]', reason); await page.click('[data-testid=acct-ask-go]'); };
    await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', `${who}@example.test`);
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});

    if (label === 'desktop') {
      await page.goto(`http://localhost:${WEB}/players/${tina}/overview`, { waitUntil: 'load' });
      await page.waitForSelector('text=Email confirmed', { timeout: 30000 });
      check('overview: Email confirmed shows LANDVAS’s own status', /Email confirmed\s*Not confirmed/.test((await page.locator('main').innerText()).replace(/\s+/g, ' ')));
      await page.getByRole('tab', { name: 'Account' }).click();
      await page.waitForSelector('[data-testid=acct-send-link]', { timeout: 30000 });
      check('account: a never-confirmed sign-up gets “Send it again” (their sign-up email)', (await page.locator('[data-testid=acct-send-link]').innerText()).includes('Send it again'));
      await shot('01-account');
      await page.click('[data-testid=acct-send-link]');
      check('account: sign-up confirmation sent', await toast(/Sign-up confirmation sent again/));
      // the typo fix: retyping catches a slip
      await page.fill('[data-testid=acct-new-email]', 'tina@gmail.com');
      await page.fill('[data-testid=acct-new-email-again]', 'tina@gmail.co');
      await page.fill('[data-testid=acct-change-reason]', 'typo at sign-up, asked on Discord');
      check('change: mismatched retype blocks the change', await page.locator('[data-testid=acct-change]').isDisabled() && (await page.locator('main').innerText()).includes('don’t match'));
      await page.fill('[data-testid=acct-new-email-again]', 'tina@gmail.com');
      await shot('02-change-form');
      await page.click('[data-testid=acct-change]');
      await page.waitForSelector('[data-testid=acct-change-go]');
      await shot('03-change-confirm');
      await page.click('[data-testid=acct-change-go]');
      check('change: done, link sent to the new address', await toast(/Email changed — link sent/));
      await page.waitForTimeout(800);
      const v = conn(); await v.connect();
      const u = (await v.query(`select email from auth.users where id = $1`, [tina])).rows[0];
      check('change: their account now has the new email', u.email === 'tina@gmail.com');
      check('change: they’re asked to confirm it', (await v.query(`select private.email_verified($1) v, (select email from private.email_rechecks where user_id = $1) e`, [tina])).rows[0].e === 'tina@gmail.com');
      check('page: shows they’re waiting to confirm the new address', (await page.locator('main').innerText()).includes('Waiting for them to confirm tina@gmail.com'));
      // they say it's definitely theirs: mark it confirmed
      await page.click('[data-testid=acct-confirm]');
      await ask('confirmed on a call');
      check('confirm: marked confirmed', await toast(/Email marked confirmed/));
      check('confirm: they can play', (await v.query(`select private.email_verified($1) v`, [tina])).rows[0].v === true);
      // owner: a link to copy
      await page.click('[data-testid=acct-link-signin]');
      await ask('their inbox blocks us');
      const linkShown = await page.waitForSelector('[data-testid=acct-link]', { timeout: 8000 }).then(() => true, () => false);
      check('link: the owner gets a one-time link to copy', linkShown && (await page.locator('[data-testid=acct-link]').innerText()).includes('/auth/confirm?token_hash='));
      await shot('04-link');
      await page.getByRole('button', { name: 'Done' }).click();
      await page.click('[data-testid=acct-signout]');
      await ask('');
      check('sign out: done', await toast(/Signed out of 0 sign-ins/));
      await page.waitForTimeout(600);
      const hist = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      check('history: every action listed with who and why', ['Changed their email: tina@gmial.com → tina@gmail.com', 'Sent their sign-up confirmation again', 'Marked their email confirmed', 'Made a one-time link to copy', 'Signed them out everywhere', 'typo at sign-up, asked on Discord', '@boss_admin'].every((s) => hist.includes(s)));
      check('audit log: five account-help lines', (await v.query(`select count(*)::int n from audit_logs where target_id = $1 and action like 'account_%'`, [tina])).rows[0].n === 5);
      check('audit log: the copied link itself is never stored', (await v.query(`select count(*)::int n from audit_logs where details::text like '%token_hash%'`)).rows[0].n === 0);
      // an address someone else already has
      await page.fill('[data-testid=acct-new-email]', 'omar_ok@example.test');
      await page.fill('[data-testid=acct-new-email-again]', 'omar_ok@example.test');
      await page.fill('[data-testid=acct-change-reason]', 'testing');
      await page.click('[data-testid=acct-change]'); await page.click('[data-testid=acct-change-go]');
      check('change: an address another account uses is refused, naming it', await toast(/Another account already uses that email \(@omar_ok\)/));
      await shot('05-after');
      await v.end();
    } else {
      // support staff: links and sign-out, no email changes
      await page.goto(`http://localhost:${WEB}/players/${omar}/account`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid=acct-send-reset]', { timeout: 30000 });
      check('support: can’t change emails', (await page.locator('main').innerText()).includes('Only admins and the owner can change a player’s email') && (await page.locator('[data-testid=acct-new-email]').count()) === 0);
      check('support: no link to copy', (await page.locator('[data-testid=acct-link-signin]').count()) === 0);
      check('support: confirmation buttons are the admins’', await page.locator('[data-testid=acct-confirm]').isDisabled());
      await page.click('[data-testid=acct-send-reset]');
      check('support: sends a password reset link', await toast(/Password reset link sent/));
      await shot('01-support');
      const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      check('phone: nothing sticks out sideways', sw);
    }
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close(); await browser.close(); browser = null;
  }
} catch (e) {
  console.log('FAIL  crashed:', e.message);
  results.push({ name: 'crashed', ok: false, extra: e.message });
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const k of kids) k.kill();
  await db.stop().catch(() => {});
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
