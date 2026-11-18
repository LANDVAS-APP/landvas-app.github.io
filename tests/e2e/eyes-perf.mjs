// Explorer's Eyes performance: driving, flying on the jetpack and buying a plot, in a busy part of town (hundreds of
// plots round you, merged groups, places, yours with cards). For each: the frames, the main thread's long tasks, its
// busy time and where it went. The test browser draws in software, so frame times there say little about a phone's GPU;
// the main-thread numbers (what stalls a frame on any device) and the draw calls / triangles are what to compare.
// Build: VITE_STREETS=https://tiles.openfreemap.org/planet npx vite build --mode artifact --outDir dist-eyes --minify false
// Run:   node tests/e2e/eyes-perf.mjs [drive,fly,claim]   (E2E_SECONDS=10 each)
import { serve, launch } from './browser.mjs';
import { encode } from 'fast-png';

const ONLY = (process.argv[2] || 'drive,fly,claim').split(',');
const SECS = Number(process.env.E2E_SECONDS || 10);
const PORT = 4295;
const G = 2 ** 22;
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { lng: ((gx + 0.5) / G) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const HERE = ll(START.gx, START.gy);

// ---- a made-up town as vector tiles --------------------------------------------------------------------------------
class W {
  constructor() { this.b = []; }
  varint(n) { while (n > 127) { this.b.push((n & 127) | 128); n = Math.floor(n / 128); } this.b.push(n); return this; }
  tag(f, w) { return this.varint((f << 3) | w); }
  bytes(f, u) { this.tag(f, 2).varint(u.length); for (const x of u) this.b.push(x); return this; }
  str(f, s) { return this.bytes(f, [...new TextEncoder().encode(s)]); }
  packed(f, xs) { const w = new W(); xs.forEach((x) => w.varint(x)); return this.bytes(f, w.b); }
}
const zz = (n) => (n << 1) ^ (n >> 31);
function geom(rings, close) {
  const out = []; let x = 0, y = 0;
  for (const r of rings) {
    out.push(1 | (1 << 3), zz(r[0][0] - x), zz(r[0][1] - y)); x = r[0][0]; y = r[0][1];
    if (r.length === 1) continue; // (a point)
    out.push(2 | ((r.length - 1) << 3));
    for (const [px, py] of r.slice(1)) { out.push(zz(px - x), zz(py - y)); x = px; y = py; }
    if (close) out.push(7 | (1 << 3));
  }
  return out;
}
function mvt(layers) {
  const t = new W();
  for (const L of layers) {
    const keys = [], vals = [];
    const l = new W().tag(15, 0).varint(2).str(1, L.name);
    for (const f of L.features) {
      const tags = [];
      for (const [k, v] of Object.entries(f.props)) {
        let ki = keys.indexOf(k); if (ki < 0) { keys.push(k); ki = keys.length - 1; }
        let vi = vals.indexOf(v); if (vi < 0) { vals.push(v); vi = vals.length - 1; }
        tags.push(ki, vi);
      }
      l.bytes(2, new W().packed(2, tags).tag(3, 0).varint(f.type).packed(4, geom(f.rings, f.type === 3)).b);
    }
    for (const k of keys) l.str(3, k);
    for (const v of vals) l.bytes(4, (typeof v === 'string' ? new W().str(1, v) : new W().tag(5, 0).varint(v)).b);
    l.tag(5, 0).varint(4096);
    t.bytes(3, l.b);
  }
  return Buffer.from(t.b);
}
const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
// where you stand, in a tile's units (your block is a little square with trees: room to look around)
const hereIn = (z, x, y) => { const n = 2 ** z; const X = (HERE.lng + 180) / 360, r = (HERE.lat * Math.PI) / 180, Y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; return [(X * n - x) * 4096, (Y * n - y) * 4096]; };
function town(z, x, y) {
  const step = 512, roads = [], blds = [], parks = [], water = [], wood = [];
  const [hu, hv] = hereIn(z, x, y);
  for (let k = 0; k <= 4096; k += step) {
    const cls = (k / step) % 4 === 0 ? 'primary' : (k / step) % 2 === 0 ? 'secondary' : 'minor';
    roads.push({ type: 2, props: { class: cls }, rings: [[[k, -64], [k, 4160]]] }, { type: 2, props: { class: cls }, rings: [[[-64, k], [4160, k]]] });
  }
  let seed = (x * 73856093) ^ (y * 19349663) ^ z;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let bx = 0; bx < 4096; bx += step) for (let by = 0; by < 4096; by += step) {
    const pick = rnd();
    const mine = z >= 14 && Math.abs(bx + step / 2 - hu) < step * 0.75 && Math.abs(by + step / 2 - hv) < step * 0.75;
    if (mine || pick < 0.1) { parks.push({ type: 3, props: { class: 'park' }, rings: sq(bx + 40, by + 40, bx + step - 40, by + step - 40) }); continue; }
    if (pick < 0.14) { water.push({ type: 3, props: { class: 'lake' }, rings: sq(bx + 60, by + 60, bx + step - 60, by + step - 60) }); continue; }
    if (pick < 0.18) { wood.push({ type: 3, props: { class: 'wood' }, rings: sq(bx + 30, by + 30, bx + step - 30, by + step - 30) }); continue; }
    const tall = rnd() < 0.12;
    for (const [ox, oy] of [[60, 60], [270, 60], [60, 270], [270, 270]]) {
      const h = tall && ox === 60 && oy === 60 ? 60 + Math.floor(rnd() * 120) : 6 + Math.floor(rnd() * 24);
      blds.push({ type: 3, props: { render_height: h, render_min_height: 0 }, rings: sq(bx + ox, by + oy, bx + ox + 170, by + oy + 170) });
    }
  }
  // the town's name on the map (and the quarter you're in), where the map's labels are
  const labels = [];
  if (z <= 12 && hu >= -200 && hu <= 4296 && hv >= -200 && hv <= 4296) {
    labels.push({ type: 1, props: { class: 'city', name: 'Eyesville', capital: 4 }, rings: [[[Math.round(hu + 140), Math.round(hv - 90)]]] });
    labels.push({ type: 1, props: { class: 'suburb', name: 'Lantern Quarter' }, rings: [[[Math.round(hu - 30), Math.round(hv + 25)]]] });
  }
  return mvt([
    ...(labels.length ? [{ name: 'place', features: labels }] : []),
    { name: 'landuse', features: [{ type: 3, props: { class: 'residential' }, rings: sq(0, 0, 4096, 4096) }] },
    { name: 'landcover', features: wood },
    { name: 'park', features: parks },
    { name: 'water', features: water },
    { name: 'transportation', features: roads },
    { name: 'building', features: blds },
  ]);
}
// ---- a mountain ridge 30 km east, as terrarium elevation tiles --------------------------------------------------------
function dem(z, x, y) {
  const n = 2 ** z, size = 256, data = new Uint8Array(size * size * 4);
  const kmE = 111.32 * Math.cos((HERE.lat * Math.PI) / 180);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const lng = ((x + (i + 0.5) / size) / n) * 360 - 180;
    const yy = Math.PI * (1 - (2 * (y + (j + 0.5) / size)) / n);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(yy));
    const east = (lng - HERE.lng) * kmE, north = (lat - HERE.lat) * 111.32;
    const h = 1300 + 2400 * Math.exp(-(((east - 30) / 7) ** 2)) * (0.7 + 0.3 * Math.sin(north / 6)) + 500 * Math.exp(-(((north - 25) / 9) ** 2));
    const v = h + 32768;
    const k = (j * size + i) * 4;
    data[k] = Math.floor(v / 256); data[k + 1] = Math.floor(v) % 256; data[k + 2] = Math.floor((v - Math.floor(v)) * 256); data[k + 3] = 255;
  }
  return Buffer.from(encode({ width: size, height: size, data, channels: 4 }));
}

const server = await serve(process.env.E2E_DIST || 'dist-eyes', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { latitude: HERE.lat, longitude: HERE.lng, accuracy: 8 }, permissions: ['geolocation'] });
await ctx.route('https://tiles.openfreemap.org/**', (route) => {
  const u = route.request().url();
  if (/\/planet$/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
  const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(u);
  if (m) return route.fulfill({ status: 200, contentType: 'application/x-protobuf', headers: { 'access-control-allow-origin': '*' }, body: town(+m[1], +m[2], +m[3]) });
  return route.fulfill({ status: 404, body: '' });
});
await ctx.route('https://s3.amazonaws.com/elevation-tiles-prod/**', (route) => {
  const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(route.request().url());
  if (!m) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: dem(+m[1], +m[2], +m[3]) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const eyes = (fn, ...a) => page.evaluate(([fn, a]) => { const e = window.__landvasEyes; return e ? e[fn](...a) : null; }, [fn, a]);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };

/** record a stretch: frames, long tasks, the main thread's busy time and its hot spots */
async function measure(name, run) {
  await page.evaluate(() => {
    const w = window; w.__frames = []; let last = performance.now();
    const loop = (t) => { w.__frames.push(t - last); last = t; if (!w.__stopFrames) requestAnimationFrame(loop); };
    w.__stopFrames = false; requestAnimationFrame(loop);
    w.__long = []; try { w.__lo?.disconnect(); w.__lo = new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(Math.round(e.duration)); }); w.__lo.observe({ type: 'longtask', buffered: false }); } catch { /* */ }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 400 }); await cdp.send('Profiler.start');
  const progs0 = new Set((await eyes('programs')) ?? []);
  const t0 = Date.now();
  await run();
  const wall = Date.now() - t0;
  const { profile } = await cdp.send('Profiler.stop');
  const fr = await page.evaluate(() => { window.__stopFrames = true; const f = window.__frames.slice(3); return { n: f.length, over50: f.filter((x) => x > 50).length, over100: f.filter((x) => x > 100).length, max: Math.round(Math.max(...f)), avg: Math.round(f.reduce((a, b) => a + b, 0) / Math.max(1, f.length)), long: window.__long }; });
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map(); let busy = 0;
  profile.samples.forEach((id, i) => { const n = byId.get(id); const dt = profile.timeDeltas[i] || 0; const cf = n.callFrame; if (cf.functionName === '(idle)') return; busy += dt; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt); });
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  // the main thread's long stretches of work (runs of samples with no idle between), and what each was mostly doing
  {
    const runs = []; let cur = null;
    const name = (id) => { const n = byId.get(id); return `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; };
    const chain = (id) => { const out = []; let c = id; while (c != null) { const n = byId.get(c); if (n.callFrame.functionName === '(root)') break; out.push(name(c)); c = parent.get(c); } return out; };
    profile.samples.forEach((id, i) => {
      const dt = (profile.timeDeltas[i] || 0) / 1000;
      const idle = byId.get(id).callFrame.functionName === '(idle)';
      if (idle) { if (cur && cur.ms > 0) runs.push(cur); cur = null; return; }
      if (!cur) cur = { ms: 0, top: new Map() };
      cur.ms += dt;
      for (const k of new Set(chain(id))) cur.top.set(k, (cur.top.get(k) || 0) + dt);
    });
    if (cur) runs.push(cur);
    const big = runs.filter((r) => r.ms > 40).sort((a, b) => b.ms - a.ms).slice(0, 6);
    for (const r of big) {
      console.log(`  a ${Math.round(r.ms)} ms stretch:`);
      for (const [k, v] of [...r.top.entries()].filter(([k]) => !/^\(program\)|wasm|js-to-wasm|wasm-to-js/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('      ', String(Math.round(v)).padStart(5), k);
    }
  }
  const incl = new Map();
  profile.samples.forEach((id, i) => { const dt = profile.timeDeltas[i] || 0; const seen = new Set(); let cur = id; while (cur != null) { const n = byId.get(cur); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; if (n.callFrame.functionName === '(idle)' || n.callFrame.functionName === '(root)') break; if (!seen.has(k)) { incl.set(k, (incl.get(k) || 0) + dt); seen.add(k); } cur = parent.get(cur); } });
  const dbg = await eyes('debug');
  const longSum = fr.long.reduce((a, b) => a + b, 0);
  console.log(`\n==== ${name}: ${Math.round(wall / 1000)} s · main thread busy ${Math.round(busy / 1000)} ms (${Math.round((busy / 1000 / wall) * 100)}%) · long tasks ${fr.long.length} (${longSum} ms, max ${fr.long.length ? Math.max(...fr.long) : 0}) · frames ${fr.n} avg ${fr.avg} ms max ${fr.max} · calls ${dbg?.calls} tris ${dbg?.tris} dpr ${dbg?.dpr}`);
  console.log('RESULT', JSON.stringify({ name, busy: Math.round(busy / 1000), wall, long: fr.long, frames: fr, calls: dbg?.calls, tris: dbg?.tris }));
  const fresh = ((await eyes('programs')) ?? []).filter((x) => !progs0.has(x));
  console.log(`  shader programs made during it: ${fresh.length}`);
  for (const x of fresh) console.log('     ', x);
  console.log('  self (ms):');
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.E2E_TOP || 22))) console.log(String(Math.round(v / 1000)).padStart(8), k);
  console.log('  inclusive (ms):');
  for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.E2E_TOP || 30))) console.log(String(Math.round(v / 1000)).padStart(8), k);
  await cdp.detach();
}

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `perf@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `perf_eyes`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await sql(`update resource_balances set amount = 200000 where player_id = $1 and resource = 'ink'`, [me]);
  const r0 = await api('reportPosition', HERE.lng, HERE.lat, 8).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);
  await as(me, 'claim_starter_plot', { p_gx: START.gx + 3, p_gy: START.gy - 4 });
  // a busy part of town: a third of the plots for ~80 plots each way are someone's (and 40 are mine), all along the
  // street east of here (where the drive goes)
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  const ned = (await sql(`insert into auth.users (email) values ('ned@example.test') returning id`))[0].id;
  await as(ned, 'complete_onboarding', { p_username: 'perf_ned', p_accept_terms_version: terms });
  const rar = ['common', 'common', 'common', 'uncommon', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const types = ['graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'stencil', 'prism', 'glass'];
  const rows = [];
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let dx = -60; dx <= 360; dx++) for (let dy = -60; dy <= 60; dy++) {
    if (rnd() > 0.33) continue;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
    rows.push([START.gx + dx, START.gy + dy, rnd() < 0.03 ? me : ned, rar[Math.floor(rnd() * rar.length)], types[Math.floor(rnd() * types.length)]]);
  }
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000);
    await sql(`insert into world_plots (gx, gy, owner_id, claimed_at, rarity, plot_type) select x.gx, x.gy, x.o::uuid, now(), x.r, x.t from jsonb_to_recordset($1::jsonb) as x(gx int, gy int, o text, r text, t text) on conflict (gx, gy) do nothing`, [JSON.stringify(chunk.map(([gx, gy, o, r, t]) => ({ gx, gy, o, r, t })))]).catch((e) => console.log('plots:', String(e).slice(0, 200)));
  }
  console.log('plots around:', rows.length);
  await sql(`insert into vehicles_owned (player_id, kind) select $1, k from unnest(array['bike','car','jet']) k on conflict do nothing`, [me]).catch(() => {});

  await nav('/world'); await page.waitForTimeout(3000);
  for (let i = 0; i < 3 && (await page.locator('[data-state=open][aria-hidden=true]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await page.click('[data-testid=eyes-rail]', { timeout: 15000 }).catch(() => page.click('[data-testid=eyes-rail]', { force: true }));
  await page.waitForSelector('[data-testid=eyes]', { timeout: 40000 });
  await page.waitForSelector('[data-testid=eyes-loading]', { state: 'detached', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.click('[data-testid=eyes-hint-ok]').catch(() => {});
  await eyes('setClock', at(12));
  const refresh = async () => { const st = await api('myExplorer'); if (st) await page.evaluate((x) => window.__landvasExplorer.getState().set(x), st); await page.waitForTimeout(600); };
  await refresh();
  const home = async (veh) => {
    await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await refresh(); await page.waitForTimeout(2500);
    if (veh) { await page.click(`[data-testid=eyes] [data-testid=vehicle-${veh}]`).catch(() => {}); await page.waitForTimeout(2000); }
    await page.click('[data-testid=eyes-steer]').catch(() => {});
    await page.waitForTimeout(500);
  };

  if (ONLY.includes('layers')) {
    // standing in the street looking along it: the frame time and the draw calls / triangles with each layer hidden
    await home(null);
    await eyes('lookAt', Math.PI / 2, -0.02);
    await page.waitForTimeout(2500);
    const still = async () => {
      const r = await page.evaluate(() => new Promise((res) => { const f = []; let last = performance.now(); const loop = (t) => { f.push(t - last); last = t; if (f.length < 14) requestAnimationFrame(loop); else res(f.slice(3)); }; requestAnimationFrame(loop); }));
      const d = await eyes('debug');
      return { ms: Math.round(r.reduce((a, b) => a + b, 0) / r.length), calls: d?.calls, tris: d?.tris };
    };
    console.log('layers: all', JSON.stringify(await still()));
    for (const l of ['shadows', 'nature', 'street', 'buildings', 'terrain', 'plots', 'builds', 'ground', 'grid', 'body']) {
      await page.evaluate((x) => window.__landvasEyes.debugShow(x, false), l); await page.waitForTimeout(300);
      console.log(`layers: without ${l}`, JSON.stringify(await still()));
      await page.evaluate((x) => window.__landvasEyes.debugShow(x, true), l); await page.waitForTimeout(300);
    }
  }
  if (ONLY.includes('drive')) {
    await home('car');
    await eyes('lookAt', Math.PI / 2, -0.02);
    await page.waitForTimeout(1500);
    await measure('drive (car, east along the street)', async () => { await page.keyboard.down('w'); await page.waitForTimeout(SECS * 1000); await page.keyboard.up('w'); });
  }
  if (ONLY.includes('fly')) {
    await home('jet');
    const rb = await page.locator('[data-testid=eyes-rise]').boundingBox();
    if (rb) { await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await page.mouse.down(); await page.waitForTimeout(4000); await page.mouse.up(); }
    await eyes('lookAt', Math.PI / 2, -0.25);
    await page.waitForTimeout(1500);
    await measure('fly (jetpack, ~50 m up, east)', async () => { await page.keyboard.down('w'); await page.waitForTimeout(SECS * 1000); await page.keyboard.up('w'); });
  }
  if (ONLY.includes('claim')) {
    await home(null);
    // a free plot just in front of you
    let spot = null;
    for (let dy = 1; dy < 6 && !spot; dy++) for (let dx = -2; dx <= 2 && !spot; dx++) {
      const gx = START.gx + dx, gy = START.gy - dy;
      if (!(await sql(`select 1 from world_plots where gx = $1 and gy = $2`, [gx, gy])).length) spot = { gx, gy };
    }
    await eyes('lookAt', 0, -0.3);
    await page.waitForTimeout(1500);
    await page.evaluate((c) => window.__landvasUi.getState().select(c), spot);
    await page.waitForTimeout(2000);
    if (await page.locator('[data-testid=buy-as-canvas]').count()) await page.click('[data-testid=buy-as-canvas]').catch(() => {});
    await page.waitForTimeout(500);
    await measure('claim (buy a plot in first person: the roll, the landing, closing it)', async () => {
      await page.click('[data-testid=claim-plot]', { timeout: 8000 }).catch((e) => console.log('claim:', String(e).slice(0, 160)));
      await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(() => /Incredible|solid start|Nice|Wow|Lucky|Rare|Epic/.test(document.querySelector('[data-testid=claim-celebration]')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.keyboard.press('Escape'); await page.waitForTimeout(900);
      await page.evaluate(() => window.__landvasUi.getState().select(null));
      await page.waitForTimeout(4000);
    });
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
} catch (e) { console.log('FAILED', e); }
await browser.close(); server.close(); process.exit(0);
