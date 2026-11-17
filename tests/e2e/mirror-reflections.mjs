// 🪞 Mirror Shard reflections in a real browser: step into a Glyphcaster and draw a spiral on its circle — it's read and
// cast, and the shard is still reflecting afterwards; step into a Fated Deck and turn a card; into a Spyglass and look;
// into a Clockwork and see its Rewind. On the website, then in the app's own skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/mirror-reflections.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-mirror'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4361;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const PORTLAND = { lng: -122.68, lat: 45.52 };

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({
    ...(app ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 }),
    colorScheme: 'dark',
    ...(app ? {} : { geolocation: { latitude: PORTLAND.lat, longitude: PORTLAND.lng, accuracy: 8 }, permissions: ['geolocation'] }),
  });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const ok = (n, v, x) => check(`${mode}: ${n}`, v, x);
  const shot = (n) => (process.env.E2E_NOSHOTS ? Promise.resolve() : page.screenshot({ path: `${OUT}/${mode}-${n}.png`, timeout: 60000 }).catch(() => {}));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
  const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
  const tap = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); await page.locator(sel).first().click({ timeout: 10000, force: true }); };
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `mir_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `mir_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    const r = (45.52 * Math.PI) / 180;
    const bx = Math.floor(((PORTLAND.lng + 180) / 360) * GRID), by = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID);
    const shard = (await api('admin.giveEnchantment', me, 'shard', 'e2e: mirror', { gx: bx, gy: by })).id;
    const reflect = (kind) => sql(`update enchantments set state = state || jsonb_build_object('reflect', jsonb_build_object('kind', '${kind}', 'dream', true, 'from', extract(epoch from now()), 'until', extract(epoch from now()) + 86400),
      'r', private.ench_init('${kind}', now()), 'cracks', 1, 'options', '[]'::jsonb) where id = '${shard}'`);
    // (a fresh look at the shard: what the cache held was the last reflection)
    const open = async () => { await nav('/grimoire'); await page.evaluate(() => window.__landvasQc?.removeQueries?.({ queryKey: ['enchant'] })); await nav(`/grimoire/${shard}`); return waitFor('[data-testid=shard-reflecting]'); };

    // ✍️ a reflected Glyphcaster: draw
    await reflect('glyph');
    ok('the Shard reflects a Glyphcaster', await open() && await waitFor('[data-testid=glyph-scene]'));
    await page.locator('[data-testid=glyph-canvas]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const box = await page.locator('[data-testid=glyph-canvas]').boundingBox();
    const pts = Array.from({ length: 73 }, (_, i) => { const t = i / 72; return [0.5 + Math.cos(t * Math.PI * 4.5) * 0.45 * t, 0.5 + Math.sin(t * Math.PI * 4.5) * 0.45 * t]; });
    const S = Math.min(box.width, box.height) * 0.6, ox = box.x + (box.width - S) / 2, oy = box.y + (box.height - S) / 2;
    await page.mouse.move(ox + pts[0][0] * S, oy + pts[0][1] * S); await page.mouse.down();
    for (const [x, y] of pts) await page.mouse.move(ox + x * S, oy + y * S, { steps: 2 });
    await page.mouse.up();
    ok('…a spiral drawn on the reflection’s circle is read and cast', await waitFor('[data-testid=glyph-result]', 12000) && /Vortex|Ink/.test((await text('[data-testid=glyph-result]')) ?? ''), await text('[data-testid=glyph-result]'));
    await shot('1-glyph-cast');
    const st = (await sql(`select state from enchantments where id = '${shard}'`))[0].state;
    ok('…the mana came off the reflection, and the Shard still reflects', st.reflect?.kind === 'glyph' && Number(st.r?.mana) < 5 && st.mana === undefined && st.cracks === 1, `r.mana ${st.r?.mana}, cracks ${st.cracks}`);
    ok('…the study button is live', await waitFor('[data-testid=glyph-study]:not([disabled])', 5000));

    // 🃏 a reflected Fated Deck: turn a card
    await reflect('deck');
    ok('the Shard reflects a Fated Deck', await open() && await waitFor('[data-testid=deck-scene]'));
    if (!(await page.locator('[data-testid=deck-scene]').count())) await shot('deck-missing');
    await page.waitForTimeout(900);
    await tap('[data-testid=deck-card-1]');
    ok('…a card turns over', await waitFor('[data-testid=deck-pending]', 10000), await text('[data-testid=deck-pending]'));
    await tap('[data-testid=deck-accept]');
    ok('…and comes true', await waitFor('[data-testid=deck-result]', 10000), (await text('[data-testid=deck-result]'))?.slice(0, 80));
    await shot('2-deck');
    const sd = (await sql(`select state from enchantments where id = '${shard}'`))[0].state;
    ok('…on the reflection (the Shard still reflects)', sd.reflect?.kind === 'deck' && Number(sd.r?.picked) === 1 && sd.picked === undefined);

    // 🔭 a reflected Spyglass: the look button works
    await reflect('spyglass');
    ok('the Shard reflects a Spyglass, its look button live', await open() && await waitFor('[data-testid=spyglass-look]:not([disabled])', 10000));

    // ⚙️ a reflected Clockwork: the Rewind is there
    await reflect('clockwork');
    ok('the Shard reflects a Clockwork, with its Rewind', await open() && await waitFor('[data-testid=clock-rewind]', 10000));
    await shot('3-clockwork');

    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    ok('the run finished', false, String(e?.stack ?? e).slice(0, 600));
    await shot('error');
  } finally {
    await ctx.close();
  }
}

const only = process.env.E2E_ONLY;
for (const m of ['web', 'app']) if (!only || only === m) await run(m);
await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
