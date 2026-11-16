// Real-browser check of admin.landvas.app → Fair play's integrity engine v2, against a local PostgreSQL with every
// migration (through scripts/portal-dev-bridge.mjs, as in portal/README.md): a referral farm (throwaway, random-letter
// and look-alike emails, never confirmed, never played, one on the farmer's own phone), a whale taking almost all of
// today's minigame Ink, a payout paid three times, and honest players. Staff see the farmer severe with proof and his
// kinds of evidence, every invited account's evidence in Referral fraud, and the radar: the source that spiked (with the
// player taking most of it) stopped on the spot from there, payouts paid twice. Phone and desktop sizes.
// Run: node tests/e2e/portal-integrity.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-integrity');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54394, BRIDGE = 8794, WEB = 5194;
const dataDir = path.resolve('.pgtmp', `portal-integrity-${process.pid}`);
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
  const player = async (name, email) => { const id = (await c.query(`insert into auth.users (email) values ($1) returning id`, [email ?? `${name}@example.test`])).rows[0].id; await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms }); return id; };
  const earn = (uid, n, reason = 'minigame', refType = null, refId = null) => c.query(`select private.ledger_apply($1, 'ink', $2, $3, $4, $5)`, [uid, n, reason, refType, refId]);
  const seen = (uid, device, ip) => c.query(`insert into private.sightings (player_id, device_id, fp_hash, ip_hash, net_hash) values ($1, $2, md5($2), md5($3), md5($3 || '/24'))`, [uid, device, ip]);

  const boss = await player('boss_admin');
  await c.query(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [boss]);
  // the referral farm
  const farmer = await player('farmer_joe', 'farmer.joe@gmail.com');
  await seen(farmer, 'dev-joe', '203.0.113.80');
  const mails = ['farmer.joe7@gmail.com', 'xk7q2m9z@gmail.com', 'bob@mailinator.com', 'jane@tempmail.plus'];
  for (let i = 0; i < mails.length; i++) {
    const u = await player(`joe_fake_${i}`, mails[i]);
    await c.query(`update players set created_at = now() - interval '10 days' where id = $1`, [u]);
    await c.query(`insert into referrals (referee_id, referrer_id, code, status, reward_ink, created_at, qualified_at) values ($1, $2, 'JOE', 'rewarded', 500, now() - interval '10 days' + $3 * interval '7 minutes', now() - interval '9 days')`, [u, farmer, i]);
    await c.query(`update auth.users set email_confirmed_at = null where id = $1`, [u]); // never confirmed
    if (i === 0) await seen(u, 'dev-joe', '203.0.113.80');
  }
  await earn(farmer, 2000, 'referral');
  // honest players, a whale on today's minigames, a payout paid three times
  for (const n of ['olivia_r', 'marcus_o', 'priya_s', 'tomasz_n', 'keiko_t', 'diego_s']) { const u = await player(n); await earn(u, 90 + n.length * 3); }
  const whale = await player('whale_wes'); await earn(whale, 25000);
  const dee = await player('double_dee');
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) await earn(dee, 40, 'minigame', 'minigame_session', `00000000-0000-4000-8000-00000000000${k}`);
  await c.query(`select private.integrity_auto_scan()`);
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
    const fits = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', 'boss_admin@example.test');
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});

    // risk scores: the farmer is severe, with proof and his kinds of evidence; honest players aren't flagged
    await page.goto(`http://localhost:${WEB}/tools/integrity`, { waitUntil: 'load' });
    const row = await page.waitForSelector('[data-testid=integrity-row-farmer_joe]', { timeout: 30000 }).then(() => true, () => false);
    const rowText = row ? await page.locator('[data-testid=integrity-row-farmer_joe]').innerText() : '';
    check(`${label}: the farmer is flagged severe, with proof and "Referral" evidence`, /Severe/i.test(rowText) && /proof/i.test(rowText) && /Referral \d+%/.test(rowText), rowText.replace(/\n/g, ' ').slice(0, 160));
    check(`${label}: honest players aren't flagged`, (await page.locator('[data-testid=integrity-row-olivia_r]').count()) === 0);
    await shot('01-risk');
    await page.click('[data-testid=integrity-row-farmer_joe]');
    await page.waitForSelector('[data-testid=integrity-player]', { timeout: 20000 });
    const pat = await page.locator('[data-testid=signal-self_referral_device]').innerText().catch(() => '');
    check(`${label}: the evidence: accounts on his own phone collecting the bonus, marked as proof`, /proof/i.test(pat) && /own app install/.test(pat), pat.replace(/\n/g, ' ').slice(0, 160));
    check(`${label}: each invited account shows why`, /throwaway email/.test(await page.locator('[data-testid=integrity-referrals]').innerText()));
    check(`${label}: the dialog fits the screen`, await fits());
    await shot('02-farmer');
    await page.keyboard.press('Escape');

    // referral fraud
    await page.goto(`http://localhost:${WEB}/tools/integrity?view=referrals`, { waitUntil: 'load' });
    const rf = await page.waitForSelector('[data-testid=ref-row-farmer_joe]', { timeout: 30000 }).then(() => true, () => false);
    const rft = rf ? await page.locator('[data-testid=ref-row-farmer_joe]').innerText() : '';
    check(`${label}: Referral fraud lists the farmer: his invited accounts fake, unconfirmed, never played, throwaway`, /4 of 4 fake/.test(rft) && /4 unconfirmed/.test(rft) && /4 never played/.test(rft) && /2 throwaway/.test(rft), rft.replace(/\n/g, ' ').slice(0, 200));
    await page.locator('[data-testid=ref-row-farmer_joe] button').first().click();
    await page.waitForSelector('[data-testid=ref-detail-farmer_joe]', { timeout: 10000 });
    const card = await page.locator('[data-testid=referee-card-joe_fake_0]').innerText();
    check(`${label}: …and each invited account's evidence (on his phone, a copy of his email)`, /same device/.test(card) && /copy of inviter/.test(card), card.replace(/\n/g, ' ').slice(0, 200));
    check(`${label}: honest players aren't on the referral list`, (await page.locator('[data-testid=ref-row-olivia_r]').count()) === 0);
    check(`${label}: the referral list fits the screen`, await fits());
    await shot('03-referrals');

    // the radar
    await page.goto(`http://localhost:${WEB}/tools/integrity?view=radar`, { waitUntil: 'load' });
    const rs = await page.waitForSelector('[data-testid=radar-src-minigame]', { timeout: 30000 }).then(() => true, () => false);
    const table = rs ? await page.locator('[data-testid=exploit-radar]').innerText() : ''; // (a table on desktop, cards on phones)
    check(`${label}: the radar shows today's minigame Ink and who takes most of it`, /@whale_wes/.test(table), table.replace(/\n/g, ' ').slice(0, 200));
    check(`${label}: payouts paid more than once`, /minigame session/.test(await page.locator('[data-testid=radar-double]').innerText().catch(() => '')));
    check(`${label}: the radar fits the screen`, await fits());
    await shot('04-radar');
    if (label === 'desktop') {
      await page.click('[data-testid=radar-stop-minigame]');
      await page.getByRole('button', { name: 'Stop it', exact: true }).last().click();
      await page.waitForTimeout(1500);
      check('stopping a source from the radar flips its Earning switch, live', (await dbq(`select count(*)::int n from private.earn_switches where key = 'reason:minigame'`))[0].n === 1);
      check('…and the radar shows it stopped', /stopped/.test(await page.locator('[data-testid=radar-src-minigame]').innerText()));
      await shot('05-stopped');
      await page.locator('[data-testid=exploit-radar] table').last().locator('tbody tr').first().click();
      check('a risky player opens straight from the radar', await page.waitForSelector('[data-testid=integrity-player]', { timeout: 20000 }).then(() => true, () => false));
      await page.keyboard.press('Escape');
      await page.goto(`http://localhost:${WEB}/earning?find=reason:minigame`, { waitUntil: 'load' });
      check('the Earning switches page opens with the switch found', await page.waitForSelector('[data-testid="switch-row-reason:minigame"]', { timeout: 20000 }).then(() => true, () => false));
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
