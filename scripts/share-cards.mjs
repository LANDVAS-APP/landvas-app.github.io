// LANDVAS link-preview cards (Open Graph / Twitter, 1200×630): what a shared link looks like in Discord, iMessage,
// WhatsApp, X, Facebook, Slack… One family: the night-sky brand frame, Unbounded + Manrope, the L mark.
//  - brandCard(): the site itself (a tilted living map of painted plots beside the headline)
//  - sectionCard(): a page of the game (the Handbook, the Gallery, Parties…)
//  - artCard() / artistCard(): a shared painting, framed on a wall, with its title and artist; an artist's page
// Rendered with headless Chromium so the real typefaces are used: scripts/make-share-cards.mjs (the fixed cards,
// committed in public/og) and scripts/prerender-share.mjs (a card per artwork and artist, at each deploy).
import fs from 'node:fs';
import path from 'node:path';
import { markSvg } from './landvas-mark.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable', f)).toString('base64');
let fontsCss = null;
const fonts = () => (fontsCss ??= `
@font-face { font-family: Unbounded; src: url(${font('unbounded/files/unbounded-latin-wght-normal.woff2')}) format('woff2'); font-weight: 200 900; }
@font-face { font-family: Manrope; src: url(${font('manrope/files/manrope-latin-wght-normal.woff2')}) format('woff2'); font-weight: 200 800; }`);

export const W = 1200, H = 630;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PLOT = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF'];
const DEEP = { '#FF4D6D': '#C81E45', '#FF9F1C': '#D06A00', '#FFE14D': '#D9A900', '#3DDC97': '#14A36A', '#34C3FF': '#0B8AD1', '#8B6BFF': '#5A3BD6', '#FF4FD8': '#B5179E', '#22C7B5': '#0E8C7E' };
const ART = [...PLOT, '#8B6BFF', '#FF4FD8', '#22C7B5'];

const base = () => `${fonts()}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: ${W}px; height: ${H}px; overflow: hidden; background: #070B1C; font-family: Manrope, sans-serif; color: #EEF1FF; }
.card { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: radial-gradient(130% 120% at 18% 0%, #2B2070 0%, #101848 42%, #070B1C 100%); }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(140,160,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(140,160,255,.06) 1px, transparent 1px); background-size: 60px 60px; }
.word { font-family: Unbounded; font-weight: 800; letter-spacing: .06em; line-height: 1; color: #fff; }
.display { font-family: Unbounded; font-weight: 900; letter-spacing: -.01em; line-height: 1.04; color: #fff; }
.rain { background: linear-gradient(90deg,#FF4D6D,#FF9F1C,#FFE14D,#3DDC97,#34C3FF,#8B6BFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sub { font-weight: 600; color: #A1ABD6; line-height: 1.42; }
.kick { display: inline-flex; align-items: center; gap: 10px; font-family: Unbounded; font-weight: 700; font-size: 15px; letter-spacing: .16em; text-transform: uppercase; color: #C9D1FF; }
.kick i { display: block; width: 26px; height: 4px; border-radius: 2px; background: linear-gradient(90deg,#FF4D6D,#FFE14D,#34C3FF); }
.pill { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px; border-radius: 999px; font-weight: 800; font-size: 18px; color: #EEF1FF; background: #10183A; box-shadow: inset 0 0 0 1.5px #2A3A80; }
.pill.gold { color: #2A1A00; background: #FFC93D; box-shadow: none; }
.foot { position: absolute; left: 72px; right: 72px; bottom: 52px; display: flex; align-items: center; gap: 12px; }
.url { margin-left: auto; font-family: Unbounded; font-weight: 700; font-size: 18px; letter-spacing: .04em; color: #C9D1FF; }
.brand { position: absolute; left: 72px; top: 58px; display: flex; align-items: center; gap: 18px; }
.bars { display: flex; gap: 5px; margin-top: 10px; } .bars b { display: block; width: 30px; height: 5px; border-radius: 3px; }
`;

const brandRow = (px = 64, word = 34) => `<div class="brand"><div style="width:${px}px;height:${px}px">${markSvg(px, { bg: 'squircle' })}</div>
  <div><div class="word" style="font-size:${word}px">LANDVAS</div><div class="bars">${PLOT.map((c) => `<b style="background:${c}"></b>`).join('')}</div></div></div>`;

/** a seeded random number (the same picture every time) */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** the living map: a tilted field of plots — painted murals, plain claimed plots and empty ones */
function livingMap({ cols = 9, rows = 9, size = 78, seed = 5 } = {}) {
  const r = rng(seed);
  let tiles = '';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = r(), left = x * size, top = y * size, s = size - 8;
    if (v < 0.24) { // empty
      tiles += `<div style="position:absolute;left:${left}px;top:${top}px;width:${s}px;height:${s}px;border-radius:${s * 0.22}px;background:#1A2558;box-shadow:inset 0 0 0 2px #34458F"></div>`;
      continue;
    }
    if (v < 0.62) { // a painted plot: a little pixel mural
      const pal = [ART[Math.floor(r() * ART.length)], ART[Math.floor(r() * ART.length)], '#FFFFFF', '#101848'];
      let px = '';
      const n = 6, p = s / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = Math.floor(r() * 10); const c = k < 4 ? pal[0] : k < 7 ? pal[1] : k < 8 ? pal[2] : pal[3];
        px += `<i style="position:absolute;left:${i * p}px;top:${j * p}px;width:${p + 0.5}px;height:${p + 0.5}px;background:${c}"></i>`;
      }
      tiles += `<div style="position:absolute;left:${left}px;top:${top}px;width:${s}px;height:${s}px;border-radius:${s * 0.18}px;overflow:hidden;box-shadow:0 7px 0 #0B1230, 0 0 0 2px rgba(255,255,255,.12)">${px}</div>`;
      continue;
    }
    const c = PLOT[Math.floor(r() * PLOT.length)];
    tiles += `<div style="position:absolute;left:${left}px;top:${top}px;width:${s}px;height:${s}px;border-radius:${s * 0.24}px;background:linear-gradient(180deg, ${c}, ${DEEP[c]});box-shadow:0 7px 0 ${DEEP[c]}, inset 0 6px 0 rgba(255,255,255,.28)"></div>`;
  }
  return `<div style="position:relative;width:${cols * size}px;height:${rows * size}px">${tiles}</div>`;
}

const pin = (x, y, c, label) => `<div style="position:absolute;left:${x}px;top:${y}px;display:grid;justify-items:center;gap:6px">
  ${label ? `<div style="padding:7px 13px;border-radius:12px;background:#fff;color:#101848;font-weight:800;font-size:16px;box-shadow:0 8px 20px rgba(0,0,0,.35);white-space:nowrap">${esc(label)}</div>` : ''}
  <svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43C17 43 33 26 33 16A16 16 0 0 0 1 16C1 26 17 43 17 43Z" fill="${c}" stroke="#fff" stroke-width="3"/><circle cx="17" cy="16" r="6" fill="#fff"/></svg></div>`;

/** the site itself */
export function brandCard() {
  return `<style>${base()}</style><div class="card"><div class="grid"></div>
  <div style="position:absolute;left:520px;top:-150px;transform:perspective(1600px) rotateX(52deg) rotateZ(-34deg);transform-origin:50% 50%">${livingMap()}</div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#070B1C 0%,#070B1CF2 40%,#070B1C99 58%,transparent 78%)"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(0deg,#070B1C 0%,transparent 26%)"></div>
  ${pin(905, 150, '#FF4D6D', 'Your plot')}${pin(1050, 330, '#34C3FF', '')}${pin(780, 360, '#3DDC97', '')}
  ${brandRow()}
  <div style="position:absolute;left:72px;top:200px;width:720px">
    <div class="display" style="font-size:62px;white-space:nowrap">Own a piece.<br><span class="rain">Play it your way.</span></div>
    <div class="sub" style="font-size:24px;margin-top:22px;width:600px">A live world map you can own. Claim real plots, paint them, raise creatures and play together.</div>
  </div>
  <div class="foot"><span class="pill gold">Free to play</span><span class="pill">iPhone · Android · Web</span><span class="url">landvas.app</span></div></div>`;
}

/** a page of the game: a kicker, a big line, a sub, and its own picture on the right */
export function sectionCard({ kicker, title, sub, accent = '#8B6BFF', art, seed = 11 }) {
  return `<style>${base()}</style><div class="card"><div class="grid"></div>
  <div style="position:absolute;left:600px;top:-120px;opacity:.55;transform:perspective(1600px) rotateX(52deg) rotateZ(-34deg)">${livingMap({ seed })}</div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#070B1C 0%,#070B1CF2 46%,#070B1C88 70%,#070B1C55 100%)"></div>
  <div style="position:absolute;right:86px;top:118px;width:340px;height:340px;border-radius:84px;display:grid;place-items:center;
    background:radial-gradient(120% 120% at 30% 20%, ${accent}, ${accent}55 60%, #10183A);box-shadow:0 30px 80px ${accent}55, inset 0 0 0 3px rgba(255,255,255,.22)">${art}</div>
  ${brandRow(56, 30)}
  <div style="position:absolute;left:72px;top:184px;width:660px">
    <div class="kick"><i></i>${esc(kicker)}</div>
    <div class="display" style="font-size:62px;margin-top:20px">${title}</div>
    <div class="sub" style="font-size:23px;margin-top:20px;width:620px">${esc(sub)}</div>
  </div>
  <div class="foot"><span class="pill gold">Free to play</span><span class="pill">iPhone · Android · Web</span><span class="url">landvas.app</span></div></div>`;
}

/** a shared painting: on a gallery wall, lit, with its title and artist */
export function artCard({ img, title, artist, plots = 1, inspired = 0 }) {
  const meta = [plots > 1 ? `${plots}-plot mural` : 'Plot painting', inspired ? `Inspired ${inspired} artist${inspired === 1 ? '' : 's'}` : null].filter(Boolean);
  return `<style>${base()}
  .wall { position:absolute; left:0; top:0; width:600px; height:${H}px; background: radial-gradient(70% 60% at 50% 30%, #2A2F5E 0%, #141A3D 60%, #0A0F26 100%); }
  .frame { position:absolute; left:50%; top:52%; transform:translate(-50%,-50%); padding:18px; border-radius:10px; background:linear-gradient(145deg,#3A2A18,#1E140A); box-shadow:0 30px 60px rgba(0,0,0,.55), inset 0 0 0 3px #6B4E2A; }
  .mat { padding:14px; background:#F4EFE6; border-radius:3px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
  .mat img { display:block; width:400px; height:400px; object-fit:contain; image-rendering:pixelated; }
  </style><div class="card">
  <div class="wall">
    <div style="position:absolute;left:300px;top:-40px;width:460px;height:320px;transform:translateX(-50%);background:radial-gradient(closest-side, rgba(255,240,200,.22), transparent)"></div>
    <div class="frame"><div class="mat"><img src="${esc(img)}" alt=""></div></div>
  </div>
  <div style="position:absolute;left:600px;top:0;width:3px;height:${H}px;background:linear-gradient(180deg,#FF4D6D,#FFE14D,#34C3FF)"></div>
  <div style="position:absolute;left:660px;top:64px;display:flex;align-items:center;gap:14px"><div style="width:48px;height:48px">${markSvg(48, { bg: 'squircle' })}</div><div class="word" style="font-size:24px">LANDVAS</div></div>
  <div style="position:absolute;left:660px;top:178px;width:480px">
    <div class="kick"><i></i>On the live world map</div>
    <div class="display" id="t" style="font-size:52px;margin-top:18px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(title || 'Untitled')}</div>
    <div style="margin-top:18px;font-weight:800;font-size:26px;color:#fff">by <span style="color:#FFC93D">${esc(artist)}</span></div>
    <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">${meta.map((m) => `<span class="pill" style="height:38px;font-size:16px">${esc(m)}</span>`).join('')}</div>
  </div>
  <div style="position:absolute;left:660px;bottom:52px;right:60px;display:flex;align-items:center"><span class="sub" style="font-size:18px">Claim a free plot and paint your own</span><span class="url">landvas.app</span></div>
  </div>`;
}

/** an artist's page: a few of their paintings, and their name */
export function artistCard({ imgs, name, display }) {
  const pics = imgs.slice(0, 3);
  const pos = [[150, 150, -6], [330, 120, 4], [235, 300, -2]];
  return `<style>${base()} .p { position:absolute; padding:10px; background:#F4EFE6; border-radius:6px; box-shadow:0 22px 44px rgba(0,0,0,.5); } .p img { display:block; width:210px; height:210px; object-fit:cover; image-rendering:pixelated; }</style>
  <div class="card"><div class="grid"></div>
  <div style="position:absolute;left:0;top:0;width:640px;height:${H}px;background:radial-gradient(70% 60% at 45% 40%, #2A2F5E 0%, #141A3D 60%, #070B1C 100%)"></div>
  ${pics.map((u, i) => `<div class="p" style="left:${pos[i][0] - 40}px;top:${pos[i][1] - 60}px;transform:rotate(${pos[i][2]}deg)"><img src="${esc(u)}" alt=""></div>`).join('')}
  <div style="position:absolute;left:680px;top:64px;display:flex;align-items:center;gap:14px"><div style="width:48px;height:48px">${markSvg(48, { bg: 'squircle' })}</div><div class="word" style="font-size:24px">LANDVAS</div></div>
  <div style="position:absolute;left:680px;top:190px;width:460px">
    <div class="kick"><i></i>Artist</div>
    <div class="display" style="font-size:54px;margin-top:18px;overflow-wrap:anywhere">${esc(display || `@${name}`)}</div>
    ${display ? `<div style="margin-top:12px;font-weight:800;font-size:24px;color:#FFC93D">@${esc(name)}</div>` : ''}
    <div class="sub" style="font-size:21px;margin-top:18px">Murals and paintings on the LANDVAS live world map. Visit their room and play together.</div>
  </div>
  <div style="position:absolute;left:680px;bottom:52px;right:60px;display:flex"><span class="url">landvas.app</span></div></div>`;
}

/** a headless browser to draw the cards with (Chrome on the build machine, else the bundled Chromium) */
export async function cardBrowser() {
  const { chromium: pw } = await import('playwright-core');
  const sys = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
  if (sys) return pw.launch({ executablePath: sys, headless: true, args: ['--no-sandbox'] });
  const chromium = (await import('@sparticuz/chromium')).default;
  return pw.launch({ executablePath: await chromium.executablePath(), headless: true, args: chromium.args.filter((a) => !/single-process|no-zygote/.test(a)) });
}

/** draw one card to a file (.png or .jpg) */
export async function renderCard(browser, html, file, { scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  try {
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, { waitUntil: 'load', timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    // every picture loaded (a painting that won't load fails the card: the plain picture is used instead)
    const ok = await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? i.naturalWidth > 0 : new Promise((r) => { i.onload = () => r(true); i.onerror = () => r(false); })))).then((x) => x.every(Boolean)));
    if (!ok) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: file.endsWith('.jpg') ? 'jpeg' : 'png', ...(file.endsWith('.jpg') ? { quality: 86 } : {}) });
    return true;
  } finally { await ctx.close(); }
}
