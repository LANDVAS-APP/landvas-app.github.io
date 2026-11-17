// 👓 Can you read it? A rendered-pixel audit of every screen on a phone: for every piece of text on screen, the page is
// photographed with the words and again with the words made invisible. Where the two photos differ is the ink; the
// contrast between the ink and what's behind it is how readable the words really are (gradients, glass, overlays and
// blends included). Words whose photos don't differ at all are covered by something (a block, a sticker, a bar) or
// clipped. Flags: "faint" (ink contrast under 2.2 — hard to read), "covered" (the words don't show) and "blocked" (a solid
// block from somewhere else — a floating button, a bar, a sticker — sits on part of them), and "squeezed" (a long run of
// words crammed into a column too narrow to read).
// Includes every enchantment's page and a Mirror Shard reflecting each kind it can reflect.
// Run: npm run build:artifact && node tests/e2e/readability.mjs   (E2E_ONLY=app|web, ONLY_ROUTES=substring)
import { serve, launch } from './browser.mjs';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-readability'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4359;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const FAINT = Number(process.env.FAINT || 2.2);
const report = [];
let failures = 0;

const KINDS = ['goose', 'genie', 'map', 'parasite', 'pandora', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle', 'splice', 'sun', 'rod', 'stormcoil',
  'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph'];
const NO_REFLECT = new Set(['splice', 'shard', 'wormhole', 'oracle', 'rod', 'stormcoil', 'origami', 'crucible', 'cuckoo']);
const ROUTES = ['/', '/world', '/hub', '/play', '/me', '/grimoire', '/social', '/inventory', '/achievements', '/leaderboards', '/events', '/settings', '/challenges',
  '/pvp', '/space', '/plots', '/inkborn', '/clips', '/guide', '/legend', '/explorer', '/canvases', '/gallery', '/royalty', '/fusion', '/primordials',
  '/rankings/rarities', '/players', '/party', '/invite', '/clans', '/support'];

const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = Math.max(a, b), y = Math.min(a, b); return (x + 0.05) / (y + 0.05); };
const raw = async (buf) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'no-preference',
    ...(app ? {} : { geolocation: { latitude: 45.52, longitude: -122.68, accuracy: 8 }, permissions: ['geolocation'] }) });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
  const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); };
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `read_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `read_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:read:ink')`);
  const GRID = 4194304; const r = (45.52 * Math.PI) / 180;
  const bx = Math.floor(((-122.68 + 180) / 360) * GRID), by = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID);
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at, name) select ${bx} + k, ${by}, '${me}', (select id from plot_types where minigame is not null limit 1), (array['common','rare','epic','legendary','mythic','kraken'])[1 + k % 6], now() - interval '2 days', 'Plot ' || k from generate_series(0, 5) k on conflict (gx, gy) do nothing`);
  const ids = {};
  for (const [i, k] of KINDS.entries()) ids[k] = (await api('admin.giveEnchantment', me, k, 'e2e: readability', { gx: bx + (i % 5) * 3, gy: by + 4 + Math.floor(i / 5) * 3 }).catch(() => ({}))).id;

  /** photograph the screen with and without its words; measure every piece of text */
  const measure = async (where) => {
    // (toasts come and go over anything: they're not the screen)
    await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}[data-sonner-toaster]{display:none!important}' }).catch(() => {});
    // (READ_PROBE=1: a solid block on purpose, to see the audit catch it)
    if (process.env.READ_PROBE) await page.evaluate(() => { if (!document.getElementById('read-probe')) document.body.insertAdjacentHTML('beforeend', '<div id="read-probe" style="position:fixed;right:0;top:40%;width:60px;height:70px;background:#5b3fd6;z-index:9999"></div>'); });
    await page.waitForTimeout(250);
    const items = await page.evaluate(() => {
      const out = [];
      const vw = innerWidth, vh = innerHeight;
      const clipOf = (el) => {
        let c = { l: 0, t: 0, r: vw, b: vh };
        for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (/(hidden|auto|scroll|clip)/.test(s.overflow + s.overflowX + s.overflowY)) {
            const q = a.getBoundingClientRect();
            c = { l: Math.max(c.l, q.left), t: Math.max(c.t, q.top), r: Math.min(c.r, q.right), b: Math.min(c.b, q.bottom) };
          }
        }
        return c;
      };
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        const t = n.textContent.replace(/\s+/g, ' ').trim();
        if (t.length < 2 || !/[A-Za-z0-9]/.test(t)) continue;
        const el = n.parentElement;
        if (!el || el.closest('svg, canvas, script, style, [aria-hidden=true], .sr-only')) continue;
        if (!el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) continue;
        const s = getComputedStyle(el);
        if (parseFloat(s.fontSize) < 7) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        const c = clipOf(el);
        const rects = [...range.getClientRects()].map((q) => ({ l: Math.max(q.left, c.l), t: Math.max(q.top, c.t), r: Math.min(q.right, c.r), b: Math.min(q.bottom, c.b), full: q.width * q.height }))
          .filter((q) => q.r - q.l >= 6 && q.b - q.t >= 6 && (q.r - q.l) * (q.b - q.t) >= q.full * 0.6);
        if (!rects.length) continue;
        const tid = el.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
        // what's on top of the words: a solid block over any part of them (a floating button, a sticker, a bar)?
        const solid = (x) => {
          if (/^(img|canvas|video|svg|picture)$/i.test(x.tagName)) return true;
          const st = getComputedStyle(x);
          if (st.backgroundImage && st.backgroundImage !== 'none') return true;
          const m = st.backgroundColor.match(/rgba?\(([^)]+)\)/);
          const a = m ? (m[1].split(',')[3] !== undefined ? parseFloat(m[1].split(',')[3]) : 1) : 0;
          return a >= 0.5 && Number(st.opacity) >= 0.5;
        };
        // (the points where something solid is on top; the photos decide whether it really hides the words there —
        //  a label that floats above with pointer-events off would otherwise look "under" what it sits on)
        let over = ''; const overPts = [];
        for (const q of rects) {
          for (let i = 0; i < 5; i++) {
            const x = q.l + ((q.r - q.l) * (i + 0.5)) / 5, y = (q.t + q.b) / 2;
            const top = document.elementFromPoint(x, y);
            if (!top || el.contains(top) || top.contains(el)) continue;
            // (a block that's part of the same card, drawn under the words, isn't over them)
            for (let b = top; b && b !== document.body && !b.contains(el); b = b.parentElement) {
              if (solid(b)) { over ||= `${b.closest('[data-testid]')?.getAttribute('data-testid') ?? ''} ${b.tagName.toLowerCase()}.${String(b.className).slice(0, 60)}`; overPts.push([x, q.t, q.b, (q.r - q.l) / 5]); break; }
            }
          }
        }
        // squeezed: a long run of words crammed into a narrow column (a row that left them no room)
        const lineW = Math.max(...rects.map((q) => q.r - q.l));
        const words = t.split(' ').length;
        // (a name cut down to a few letters by a row that gave it no room: "Golde…")
        const cut = s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth < 84 && t.length > 6;
        const squeezed = cut || (t.length > 60 && rects.length >= 6 && lineW < 130) || (words >= 4 && rects.length >= 3 && lineW < 100);
        out.push({ text: t.slice(0, 70), over, overPts, squeezed, tid, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 90), size: parseFloat(s.fontSize), weight: s.fontWeight, rects });
      }
      return out;
    });
    if (!items.length) return;
    const A = await raw(await page.screenshot({ timeout: 30000 }));
    const hide = await page.addStyleTag({ content: '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}' });
    await page.waitForTimeout(120);
    const B = await raw(await page.screenshot({ timeout: 30000 }));
    await hide.evaluate((e) => e.remove());
    const dpr = A.w / 390;
    for (const it of items) {
      let ink = 0, area = 0; const cs = [];
      // (and segment by segment, ~40 px at a time: words that run from a dark patch onto a bright one are only as
      //  readable as their worst stretch)
      let worst = Infinity;
      for (const q of it.rects) {
        const x0 = Math.floor(q.l * dpr), x1 = Math.ceil(q.r * dpr), y0 = Math.floor(q.t * dpr), y1 = Math.ceil(q.b * dpr);
        const seg = Math.round(40 * dpr);
        for (let sx = x0; sx < x1; sx += seg) {
          const sc = []; let sa = 0;
          for (let y = Math.max(0, y0); y < Math.min(A.h, y1); y++) for (let x = Math.max(0, sx); x < Math.min(A.w, x1, sx + seg); x++) {
            const i = (y * A.w + x) * 4; area++; sa++;
            const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
            if (d > 18) { ink++; const c = ratio(lum(A.data[i], A.data[i + 1], A.data[i + 2]), lum(B.data[i], B.data[i + 1], B.data[i + 2])); cs.push(c); sc.push(c); }
          }
          if (sc.length >= Math.max(12, sa * 0.04)) { sc.sort((a, b) => a - b); worst = Math.min(worst, sc[Math.floor(sc.length * 0.9)]); }
        }
      }
      if (!area) continue;
      cs.sort((a, b) => a - b);
      const legible = Math.min(cs.length ? cs[Math.floor(cs.length * 0.9)] : 1, worst);
      const frac = ink / area;
      // blocked: at the points where something solid is on top, the words left no ink (they really are hidden there)
      let hidden = 0;
      for (const [x, t, b, w] of it.overPts ?? []) {
        let k = 0;
        for (let y = Math.floor(t * dpr); y < Math.ceil(b * dpr); y++) for (let xx = Math.floor((x - w / 2) * dpr); xx < Math.ceil((x + w / 2) * dpr); xx++) {
          if (xx < 0 || y < 0 || xx >= A.w || y >= A.h) continue;
          const i = (y * A.w + xx) * 4;
          if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 18) k++;
        }
        if (k < 3) hidden++;
      }
      const flag = frac < 0.012 ? 'covered' : hidden >= 2 ? 'blocked' : legible < FAINT ? 'faint' : it.squeezed ? 'squeezed' : null;
      if (!flag) continue;
      const q = it.rects[0];
      const rec = { mode, where, flag, legible: Number(legible.toFixed(2)), ink: Number(frac.toFixed(3)), ...it, rects: undefined, overPts: undefined, at: [Math.round(q.l), Math.round(q.t)] };
      if (report.some((x) => x.mode === mode && x.where === where && x.text === rec.text && x.flag === flag)) continue;
      report.push(rec);
      failures++;
      // a crop to look at
      const name = `${mode}-${String(report.length).padStart(3, '0')}-${flag}.png`;
      const pad = 24;
      const L = Math.max(0, Math.floor((q.l - pad) * dpr)), T = Math.max(0, Math.floor((q.t - pad) * dpr));
      const W = Math.min(A.w - L, Math.ceil((q.r - q.l + pad * 2) * dpr)), H = Math.min(A.h - T, Math.ceil((q.b - q.t + pad * 2) * dpr));
      if (W > 4 && H > 4) await sharp(A.data, { raw: { width: A.w, height: A.h, channels: 4 } }).extract({ left: L, top: T, width: W, height: H }).png().toFile(path.join(OUT, name)).catch(() => {});
      rec.crop = name;
    }
  };

  /** a screen top to bottom: whichever thing scrolls (the page, or the app's own scroller) */
  const audit = async (where, prep) => {
    try {
      if (prep) await prep();
      await page.waitForTimeout(1500);
      // (wait for the screen to settle: its words stop changing, no skeletons left — up to 10 s)
      await page.waitForFunction(() => {
        const n = document.body.innerText.length, sk = document.querySelectorAll('.lv-skel, .animate-pulse').length;
        const w = window.__readSettle ?? (window.__readSettle = { n: -1, at: 0 });
        if (n !== w.n || sk) { w.n = n; w.at = performance.now(); return false; }
        return performance.now() - w.at > 700;
      }, null, { timeout: 10000, polling: 200 }).catch(() => {});
      await page.evaluate(() => { window.__readSettle = undefined; });
      // close anything that popped up on its own (a sheet, a prompt)
      for (let i = 0; i < 2 && (await page.locator('[role=dialog]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      const steps = await page.evaluate(() => {
        const cands = [document.scrollingElement, ...document.querySelectorAll('main, [data-scroll], div')].filter((e) => e && e.scrollHeight > e.clientHeight + 60 && (e === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(e).overflowY)) && e.clientHeight > innerHeight * 0.45);
        cands.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
        const s = cands[0];
        window.__readScroller = s ?? null;
        return s ? Math.min(7, Math.ceil((s.scrollHeight - s.clientHeight) / (s.clientHeight * 0.85))) : 0;
      });
      for (let k = 0; k <= steps; k++) {
        if (k) { await page.evaluate((k) => { const s = window.__readScroller; if (s) s.scrollTop = k * s.clientHeight * 0.85; }, k); await page.waitForTimeout(700); }
        await measure(`${where}${k ? ` ↓${k}` : ''}`);
      }
      await page.evaluate(() => { const s = window.__readScroller; if (s) s.scrollTop = 0; });
      console.log(`  checked ${where}${steps ? ` (${steps + 1} screens)` : ''}`);
    } catch (e) { console.log(`  (skipped ${where}: ${String(e?.message ?? e).slice(0, 120)})`); }
  };

  const only = process.env.ONLY_ROUTES;
  const want = (w) => !only || only.split(',').some((o) => w.includes(o));
  for (const rt of ROUTES) if (want(rt)) await audit(rt, () => nav(rt));
  for (const k of KINDS) if (ids[k] && want(`/grimoire/${k}`)) await audit(`/grimoire/${k}`, () => nav(`/grimoire/${ids[k]}`));
  // a Mirror Shard reflecting each kind it can reflect
  if (ids.shard) for (const k of KINDS.filter((k) => !NO_REFLECT.has(k))) {
    if (!want(`mirror:${k}`)) continue;
    await sql(`update enchantments set state = state || jsonb_build_object('reflect', jsonb_build_object('kind', '${k}', 'dream', true, 'from', extract(epoch from now()), 'until', extract(epoch from now()) + 86400), 'r', private.ench_init('${k}', now())) where id = '${ids.shard}'`);
    await audit(`mirror:${k}`, async () => { await nav('/grimoire'); await page.waitForTimeout(300); await nav(`/grimoire/${ids.shard}`); });
  }
  await ctx.close();
}

const onlyMode = process.env.E2E_ONLY;
for (const m of ['app', 'web']) if (!onlyMode || onlyMode === m) await run(m);
await browser.close(); server.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const by = {};
for (const r of report) (by[`${r.mode} ${r.where}`] ??= []).push(r);
for (const [w, rs] of Object.entries(by)) {
  console.log(`\n${w}`);
  for (const r of rs) console.log(`  ${r.flag === 'covered' ? '⬛ covered' : r.flag === 'blocked' ? '🧱 blocked' : r.flag === 'squeezed' ? '🗜️ squeezed' : '👓 faint  '} ${String(r.legible).padEnd(5)} ${JSON.stringify(r.text)}  [${r.tid || r.tag}] ${r.cls.slice(0, 60)}${r.over ? ` UNDER ${r.over}` : ''} → ${r.crop}`);
}
console.log(`\n${failures} hard-to-read or covered texts`);
process.exit(failures ? 1 : 0);
