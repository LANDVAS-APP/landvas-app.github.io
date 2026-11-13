// Draws the art for LANDVAS's emails and sender identity, in the crisp brand:
//
//   public/email/*.png        every word of the auth emails, set in the brand fonts (Unbounded titles, Manrope text)
//                             as crisp transparent images. Gmail, Outlook and most phone mail apps ignore web fonts,
//                             so this is the only way the emails read in LANDVAS's own type everywhere. The words
//                             stay in each image's alt text. File names carry a content hash (mail apps cache images
//                             by address), listed in scripts/email-art.json for scripts/auth-emails.mjs.
//   public/brand/landvas-avatar-1024.png   the sender picture: the crisp L on the night background, padded so a
//                             round crop never clips a plot (for the Google Account behind no-reply@landvas.app,
//                             and anywhere else a round profile picture is needed)
//   public/bimi/landvas.svg   the same logo as SVG Tiny PS, the format inboxes require for BIMI sender logos
//
// Run after changing any email words:   node scripts/make-email-art.mjs
// (needs Chrome: CHROME_PATH, /usr/bin/google-chrome, or the bundled @sparticuz/chromium)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium as pw } from 'playwright-core';
import { markSvg } from './landvas-mark.mjs';
import { COPY, SHARED, ART_WIDTH } from './auth-emails.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/email');
const SCALE = 3; // crisp on 3× phone screens
const font = (pkg) => fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable', pkg, 'files', `${pkg}-latin-wght-normal.woff2`)).toString('base64');

// ---- the sender picture and the BIMI logo --------------------------------------------------------------------------------
const AVATAR_PAD = 0.24; // the L's corner plots sit well inside a circle
fs.mkdirSync(path.join(ROOT, 'public/bimi'), { recursive: true });
await sharp(Buffer.from(markSvg(1024, { bg: 'full', pad: AVATAR_PAD }))).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'public/brand/landvas-avatar-1024.png'));
fs.writeFileSync(path.join(ROOT, 'public/bimi/landvas.svg'), bimiSvg());
console.log('sender picture: public/brand/landvas-avatar-1024.png, BIMI logo: public/bimi/landvas.svg');

/** SVG Tiny Portable/Secure (BIMI): version 1.2 tiny-ps, a title, square viewBox, no width/height/x/y on the root,
 *  no group opacity, gradient positions as fractions */
function bimiSvg() {
  let s = markSvg(512, { bg: 'full', pad: AVATAR_PAD });
  s = s.replace(/<svg [^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 512 512"><title>LANDVAS</title>');
  s = s.replace('cx="28%" cy="16%" r="100%"', 'cx="0.28" cy="0.16" r="1"');
  s = s.replace(/ opacity="([\d.]+)"/g, ' fill-opacity="$1"');
  if (/<(script|image|foreignObject|a |animate)|xlink:href|filter=|opacity="/.test(s.replace(/fill-opacity="/g, ''))) throw new Error('BIMI SVG has something SVG Tiny PS forbids');
  if (Buffer.byteLength(s) > 32 * 1024) throw new Error('BIMI SVG over 32 KB');
  return s;
}

// ---- the words, in the brand fonts ---------------------------------------------------------------------------------------
const STYLE = {
  title: 'font-family:U;font-weight:900;font-size:25px;line-height:1.25;letter-spacing:-0.005em;color:#EEF1FF;',
  text: 'font-family:M;font-weight:500;font-size:15px;line-height:1.6;color:#A1ABD6;',
  button: 'font-family:M;font-weight:800;font-size:16px;line-height:1.25;letter-spacing:0.01em;color:#FFFFFF;',
  small: 'font-family:M;font-weight:500;font-size:12px;line-height:1.55;color:#6F7AAE;',
};
const pieces = [];
for (const [id, c] of Object.entries(COPY)) {
  pieces.push({ key: `${id}-title`, kind: 'title', text: c.title });
  pieces.push({ key: `${id}-text`, kind: 'text', text: c.text });
  pieces.push({ key: `${id}-button`, kind: 'button', text: c.button });
}
for (const [id, text] of Object.entries(SHARED)) pieces.push({ key: id, kind: 'small', text });

const exe = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : await (await import('@sparticuz/chromium')).default.executablePath());
const browser = await pw.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
const page = await browser.newPage({ deviceScaleFactor: SCALE, viewport: { width: 800, height: 600 } });
const mark = markSvg(192, { bg: 'squircle' }).replace(/width="192" height="192"/, 'width="64" height="64"');
await page.setContent(`<!doctype html><html><head><style>
@font-face{font-family:U;src:url(data:font/woff2;base64,${font('unbounded')}) format('woff2');font-weight:100 900}
@font-face{font-family:M;src:url(data:font/woff2;base64,${font('manrope')}) format('woff2');font-weight:200 800}
html,body{margin:0;background:transparent}
#t{display:inline-block;text-align:center;padding:2px 3px;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
#h{display:inline-flex;flex-direction:column;align-items:center;padding:2px 6px}
#h b{display:block;margin-top:16px;font-family:U;font-weight:900;font-size:20px;line-height:1;letter-spacing:0.16em;color:#fff;padding-left:0.16em}
#h i{display:flex;gap:4px;margin-top:10px}#h i span{display:block;width:18px;height:4px;border-radius:2px}
</style></head><body><div id="t"></div><div id="h" style="display:none">${mark}<b>LANDVAS</b><i>${['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF'].map((c) => `<span style="background:${c}"></span>`).join('')}</i></div></body></html>`);
await page.evaluate(() => document.fonts.ready);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
async function save(key, png, el, text, kind) {
  const box = await el.boundingBox();
  const small = await sharp(png).png({ palette: true, quality: 95, effort: 10, compressionLevel: 9 }).toBuffer();
  const best = small.length < png.length ? small : png;
  const file = `email/${key}-${crypto.createHash('sha1').update(best).digest('hex').slice(0, 10)}.png`;
  fs.writeFileSync(path.join(ROOT, 'public', file), best);
  manifest[key] = { file, width: Math.round(box.width), height: Math.round(box.height), text, kind };
}
// the header: the crisp mark, the wordmark and the five plot bars, as one picture
await page.evaluate(() => { document.getElementById('t').style.display = 'none'; document.getElementById('h').style.display = 'inline-flex'; });
const h = await page.$('#h');
await save('header', await h.screenshot({ omitBackground: true }), h, 'LANDVAS', 'header');
await page.evaluate(() => { document.getElementById('h').style.display = 'none'; document.getElementById('t').style.display = 'inline-block'; });
for (const p of pieces) {
  await page.evaluate(({ text, style, max }) => {
    const el = document.getElementById('t');
    el.setAttribute('style', style + `max-width:${max}px`);
    el.textContent = text;
  }, { text: p.text, style: STYLE[p.kind], max: p.kind === 'small' ? ART_WIDTH + 40 : ART_WIDTH });
  const el = await page.$('#t');
  await save(p.key, await el.screenshot({ omitBackground: true }), el, p.text, p.kind);
}
await browser.close();
fs.writeFileSync(path.join(ROOT, 'scripts/email-art.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`email art: ${Object.keys(manifest).length} images in public/email, listed in scripts/email-art.json`);
