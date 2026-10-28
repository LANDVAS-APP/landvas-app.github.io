// Map smoothness benchmark (local-mode build): a phone-sized screen with the CPU
// slowed down like a mid-range phone, a dense city of synthetic plots in view,
// then scripted drags, flings and zooms. Reports frame times and main-thread stalls.
// Run: npm run build:artifact && node tests/e2e/map-perf.mjs
import { serve, launch } from './browser.mjs';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4190;
const DENSITY = Number(process.env.DENSITY ?? 0.45); // share of plots owned in the busy area
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
await page.waitForSelector('#email', { timeout: 60000 });
await page.fill('#email', 'perf@example.test');
await page.fill('#password', 'paint-the-world');
await page.click('button[type=submit]');
await page.waitForSelector('#username', { timeout: 20000 });
await page.fill('#username', 'perf_runner');
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=world-map]', { timeout: 20000 });
await page.waitForFunction(() => !!window.__landvasMap?.getSource('lv-plots'), null, { timeout: 30000 });
// close any first-visit prompt so it doesn't sit over the map
await page.keyboard.press('Escape').catch(() => {});

// dense synthetic world: a deterministic ~45% of plots owned around Salt Lake City, many with names and canvases
await page.evaluate((DENSITY) => {
  const be = window.__landvasBackend;
  const orig = be.rpc.bind(be);
  const H = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const types = ['graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'clay', 'prism', 'glass'];
  const rar = ['common', 'common', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  window.__perfRows = 0;
  const rowsFor = (args) => {
      const out = [];
      for (let y = args.p_min_gy; y <= args.p_max_gy; y++)
        for (let x = args.p_min_gx; x <= args.p_max_gx; x++) {
          const h = H(x, y);
          if (h > DENSITY) continue;
          const g = ((x >> 3) * 7919 + (y >> 3)) % 997;
          out.push([x, y, types[(x + y) & 7], 1 + (g % 9), g === 3, `g${x >> 3}_${y >> 3}`, false, `p${g}`, ['#7B5CFF', '#22E3FF', '#FF4FA3', '#3DDC97'][g & 3], rar[Math.floor(h * 997) & 7], h < 0.01 ? `Plot ${g}` : null]);
        }
      return out;
  };
  be.rpc = async (fn, args) => {
    if (fn === 'plot_blocks') {
      const res = {};
      for (const [bx, by] of args.p_blocks) { const r = rowsFor({ p_min_gx: bx * 64, p_max_gx: bx * 64 + 63, p_min_gy: by * 64, p_max_gy: by * 64 + 63 }); res[`${bx}_${by}`] = r; window.__perfRows += r.length; }
      return res;
    }
    if (fn === 'plots_in_bbox') {
      const out = [];
      for (let y = args.p_min_gy; y <= args.p_max_gy; y++)
        for (let x = args.p_min_gx; x <= args.p_max_gx; x++) {
          const h = H(x, y);
          if (h > DENSITY) continue;
          const g = ((x >> 3) * 7919 + (y >> 3)) % 997;
          out.push([x, y, types[(x + y) & 7], 1 + (g % 9), g === 3, `g${x >> 3}_${y >> 3}`, false, `p${g}`, ['#7B5CFF', '#22E3FF', '#FF4FA3', '#3DDC97'][g & 3], rar[Math.floor(h * 997) & 7], h < 0.01 ? `Plot ${g}` : null]);
        }
      window.__perfRows = Math.max(window.__perfRows, out.length);
      return out;
    }
    if (fn === 'density_in_bbox') {
      const out = [];
      for (let y = args.p_y0; y <= args.p_y1 && out.length < 4096; y++) for (let x = args.p_x0; x <= args.p_x1 && out.length < 4096; x++) if (H(x, y) < 0.08) out.push([x, y, 1 + Math.floor(H(y, x) * 60)]);
      return out;
    }
    return orig(fn, args);
  };
}, DENSITY);

const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

const G = 4194304;
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * gy) / G); return [(gx / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]; };
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 };

async function scenario(name, zoom, run) {
  await page.evaluate(([c, z]) => { window.__landvasMap.fire('dragstart'); window.__landvasMap.jumpTo({ center: c, zoom: z }); }, [ll(START.gx, START.gy), zoom]);
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    window.__perf = { frames: [], long: [], t0: performance.now() }; window.__perfRows = 0;
    let last = performance.now();
    const tick = (t) => { window.__perf.frames.push(t - last); last = t; if (window.__perf.on) requestAnimationFrame(tick); };
    window.__perf.on = true;
    requestAnimationFrame(tick);
    window.__perf.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push(e.duration); });
    window.__perf.obs.observe({ type: 'longtask' });
  });
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await run();
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = new Map();
    for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
    for (const [id, t] of dt) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + t / 1000); }
    console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `   ${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n'));
  }
  const busy = Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), script = Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000);
  const wall = Math.round((m1.Timestamp - m0.Timestamp) * 1000);
  const r0 = await page.evaluate(() => {
    window.__perf.on = false; window.__perf.obs.disconnect();
    const f = window.__perf.frames.slice(2).sort((a, b) => a - b);
    const pct = (p) => f[Math.min(f.length - 1, Math.floor(f.length * p))] ?? 0;
    const dur = performance.now() - window.__perf.t0;
    return { frames: f.length, fps: +(f.length / (dur / 1000)).toFixed(1), p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), max: +(f.at(-1) ?? 0).toFixed(0),
      janky: f.filter((x) => x > 50).length, longTasks: window.__perf.long.length, longMs: Math.round(window.__perf.long.reduce((a, b) => a + b, 0)), worst: Math.round(Math.max(0, ...window.__perf.long)), rows: window.__perfRows };
  });
  const r = { ...r0, busy, script, wall };
  const pt = await page.evaluate(() => { const s = { ...window.__lvPlotTiles }; Object.assign(window.__lvPlotTiles, { tiles: 0, ms: 0, worst: 0 }); return s; });
  if (pt.tiles != null) console.log(`   plot tiles drawn: ${pt.tiles}, ${Math.round(pt.ms)} ms total, worst ${Math.round(pt.worst)} ms`);
  console.log(`${name.padEnd(28)} main thread busy ${String(Math.round((100 * busy) / wall)).padStart(3)}% (${busy} ms, JS ${script} ms)  fps ${String(r.fps).padStart(5)}  p50 ${String(r.p50).padStart(5)}ms  p95 ${String(r.p95).padStart(6)}ms  max ${String(r.max).padStart(5)}ms  >50ms ${String(r.janky).padStart(3)}  long tasks ${r.longTasks} (${r.longMs} ms, worst ${r.worst})  plots ${r.rows}`);
  return r;
}

async function drag(dx, dy, steps = 24, pause = 16) {
  const box = await page.locator('[data-testid=world-map]').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps); await page.waitForTimeout(pause); }
  await page.mouse.up();
}
const pans = async () => { for (const [dx, dy] of [[-260, 0], [0, -300], [260, 120], [-200, 260], [180, -200], [-150, -150]]) { await drag(dx, dy); await page.waitForTimeout(250); } await page.waitForTimeout(1200); };
const zooms = async () => {
  for (const d of [1.2, 1.2, -1.6, 1.0, -1.8]) { await page.evaluate((d) => window.__landvasMap.easeTo({ zoom: window.__landvasMap.getZoom() + d, duration: 700 }), d); await page.waitForTimeout(950); }
  await page.waitForTimeout(1000);
};

const idle = async () => page.waitForTimeout(4000);
await page.evaluate(() => { window.__renders = 0; window.__landvasMap.on('render', () => window.__renders++); });
const countRenders = async (name, zoom) => {
  await page.evaluate(([c, z]) => { window.__landvasMap.jumpTo({ center: c, zoom: z }); }, [ll(START.gx, START.gy), zoom]);
  await page.waitForTimeout(4000);
  const a = await page.evaluate(() => window.__renders);
  await page.waitForTimeout(4000);
  const b = await page.evaluate(() => window.__renders);
  console.log(`${name.padEnd(28)} map redraws while idle: ${((b - a) / 4).toFixed(1)}/s`);
};
const all = {};
if (process.env.ONLY !== 'pan') { await countRenders('idle @ z18.7', 18.7); await countRenders('idle @ z4', 4); }
all['plots, street level pan'] = await scenario('pan @ z18.7 (plots ~26px)', 18.7, pans);
all['plots, zoomed out pan'] = await scenario('pan @ z17 (plots ~8px)', 17, pans);
all['far pan'] = await scenario('pan @ z16 (plots ~4px)', 16, pans);
all['zooming'] = await scenario('zoom in/out around z17.5', 17.5, zooms);
all['world'] = await scenario('pan @ z4 (world)', 4, pans);
console.log(JSON.stringify({ throttle: THROTTLE, density: DENSITY, errors: errors.slice(0, 5) }));
await browser.close();
server.close();
