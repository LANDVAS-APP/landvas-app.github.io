// Render the LANDVAS brand kit (HD logos, social banner, link-preview image)
// with headless Chromium so the real Unbounded typeface is used.
//   node scripts/make-brand.mjs  ->  public/brand/*, public/og-image.png
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/brand');
fs.mkdirSync(OUT, { recursive: true });
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable', f)).toString('base64');
const UNBOUNDED = font('unbounded/files/unbounded-latin-wght-normal.woff2');
const MANROPE = font('manrope/files/manrope-latin-wght-normal.woff2');

// The mark: the official crisp L (scripts/landvas-mark.mjs), the same one as the app icons and favicons.
import { markSvg as crispMark } from './landvas-mark.mjs';
export const markSvg = ({ bg = true, size = 230 } = {}) => crispMark(size, { bg: bg ? 'squircle' : 'none' });

const css = `
@font-face { font-family: Unbounded; src: url(${UNBOUNDED}) format('woff2'); font-weight: 200 900; }
@font-face { font-family: Manrope; src: url(${MANROPE}) format('woff2'); font-weight: 200 800; }
* { margin: 0; box-sizing: border-box; }
html, body { background: transparent; }
.word { font-family: Unbounded; font-weight: 800; letter-spacing: 0.06em; color: #fff; line-height: 1; }
.rain { background: linear-gradient(90deg,#FF4D6D,#FF9F1C,#FFE14D,#3DDC97,#34C3FF,#A45CFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tag { font-family: Manrope; font-weight: 700; color: #B9C2EE; letter-spacing: 0.02em; }
.space { background: radial-gradient(120% 120% at 20% 0%, #2C1F6E 0%, #0E1438 45%, #070B1C 100%); }
.grid { position:absolute; inset:0; background-image: linear-gradient(rgba(140,160,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(140,160,255,.07) 1px, transparent 1px); background-size: 64px 64px; }
`;

const browser = await pw.launch({ executablePath: process.env.CHROME_PATH || await chromium.executablePath(), headless: true, args: process.env.CHROME_PATH ? ['--no-sandbox'] : chromium.args.filter((a) => !/single-process|no-zygote/.test(a)) });
async function render(name, w, h, scale, body, transparent = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="width:${w}px;height:${h}px;overflow:hidden">${body}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: name, omitBackground: transparent });
  await ctx.close();
  console.log(path.relative(ROOT, name));
}

// tiles of "art" for backgrounds
const ART = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#A45CFF', '#FF4FD8', '#22C7B5'];
function mosaic(cols, rows, size, seed = 7) {
  let s = seed, out = '';
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = r();
    if (v < 0.5) continue;
    const c = ART[Math.floor(r() * ART.length)];
    out += `<div style="position:absolute;left:${x * size}px;top:${y * size}px;width:${size - 6}px;height:${size - 6}px;border-radius:${size * 0.2}px;background:${c};opacity:${(0.12 + r() * 0.5).toFixed(2)};box-shadow:0 0 ${size * 0.4}px ${c}66"></div>`;
  }
  return out;
}

const mark = (px, bg = true) => `<div style="width:${px}px;height:${px}px">${markSvg({ bg, size: px })}</div>`;

// 1. the mark itself (landvas-mark.svg and its PNGs) comes from scripts/make-native-assets.mjs
// 2. horizontal logo (transparent) and on dark
const horiz = (dark) => `<div class="${dark ? 'space' : ''}" style="position:relative;width:1600px;height:480px;display:flex;align-items:center;justify-content:center;gap:56px">
  ${dark ? '<div class="grid"></div>' : ''}${mark(300)}
  <div style="position:relative"><div class="word" style="font-size:150px">LANDVAS</div>
  <div style="height:12px;margin-top:26px;border-radius:6px;background:linear-gradient(90deg,#FF4D6D,#FF9F1C,#FFE14D,#3DDC97,#34C3FF,#A45CFF)"></div></div></div>`;
await render(path.join(OUT, 'landvas-logo-horizontal.png'), 1600, 480, 2.5, horiz(false), true);
await render(path.join(OUT, 'landvas-logo-horizontal-dark.png'), 1600, 480, 2.5, horiz(true));
// 3. profile picture for socials (square, safe inside a circle)
await render(path.join(OUT, 'landvas-profile-2048.png'), 1024, 1024, 2, `<div class="space" style="position:relative;width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">
  <div class="grid"></div><div style="position:absolute;width:760px;height:760px;border-radius:50%;background:radial-gradient(closest-side,#7B5CFF55,transparent)"></div>${mark(560, false)}</div>`);
// 4. banner (X / Reddit / Discord), 3:1
const banner = (w, h) => `<div class="space" style="position:relative;width:${w}px;height:${h}px;overflow:hidden">
  <div class="grid"></div>${mosaic(Math.ceil(w / 64), Math.ceil(h / 64), 64, 11)}
  <div style="position:absolute;inset:0;background:radial-gradient(60% 80% at 50% 50%, #070B1Cee 0%, #070B1Caa 45%, transparent 80%)"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.05}px">
    <div style="display:flex;align-items:center;gap:${h * 0.07}px">${mark(h * 0.36)}<div class="word" style="font-size:${h * 0.2}px">LANDVAS</div></div>
    <div class="word rain" style="font-size:${h * 0.075}px;letter-spacing:0.02em;font-weight:700">Own a piece. Play it your way.</div>
  </div></div>`;
await render(path.join(OUT, 'landvas-banner-3000x1000.png'), 1500, 500, 2, banner(1500, 500));
// 5. link preview (Open Graph / Twitter card)
const og = `<div class="space" style="position:relative;width:1200px;height:630px;overflow:hidden">
  <div class="grid"></div>${mosaic(19, 10, 64, 3)}
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#070B1C 0%,#070B1Cf0 48%,#070B1C66 75%,transparent 100%)"></div>
  <div style="position:absolute;left:80px;top:78px;display:flex;align-items:center;gap:26px">${mark(104)}<div class="word" style="font-size:54px">LANDVAS</div></div>
  <div style="position:absolute;left:80px;top:220px;width:900px">
    <div class="word" style="font-size:64px;line-height:1.05;letter-spacing:0">Own a piece.<br><span class="rain">Play it your way.</span></div>
    <div class="tag" style="font-size:25px;margin-top:24px;line-height:1.4;width:700px">Claim real-world plots and make them yours — paint, raise creatures, explore, compete.</div>
  </div>
  <div style="position:absolute;left:80px;bottom:56px;display:flex;gap:14px" class="tag">
    ${['🎨 Create', '🐾 Raise', '🧭 Explore', '⚔️ Compete'].map((t) => `<span style="font-size:20px;padding:10px 18px;border-radius:999px;border:1.5px solid #3a4590;background:#10183acc;color:#E8ECFF">${t}</span>`).join('')}
  </div></div>`;
await render(path.join(ROOT, 'public/og-image.png'), 1200, 630, 1, og);
await render(path.join(OUT, 'landvas-og-2400x1260.png'), 1200, 630, 2, og);
await browser.close();
