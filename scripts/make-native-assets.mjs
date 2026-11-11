// App icons and splash screens for the iOS and Android apps, drawn from the LANDVAS mark.
// Run: node scripts/make-native-assets.mjs  (after `npx cap add`)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BG = '#0B0820';
const C = ['#FF4D6D', '#2FB8FF', '#A45CFF', '#FFB31F', '#3DDC97', '#FF3D9A', '#FFE14D', '#3DDC97', '#34C3FF'];
function cells(size, pad, glow = true) {
  const inner = size - pad * 2, gap = inner * 0.06, cell = (inner - gap * 2) / 3, r = cell * 0.26;
  return C.map((c, i) => {
    const x = pad + (i % 3) * (cell + gap), y = pad + Math.floor(i / 3) * (cell + gap);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${r}" fill="${c}"${glow ? ' filter="url(#gl)"' : ''}/>
      <rect x="${x + cell * 0.1}" y="${y + cell * 0.09}" width="${cell * 0.8}" height="${cell * 0.22}" rx="${cell * 0.11}" fill="#fff" opacity="0.28"/>`;
  }).join('');
}
const defs = `<defs><radialGradient id="g" cx="30%" cy="18%" r="95%"><stop offset="0" stop-color="#2a1d63"/><stop offset="1" stop-color="#070b1c"/></radialGradient>
  <filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
import { multiverse } from './brand-art.mjs';

const full = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${defs}<rect width="${size}" height="${size}" fill="url(#g)"/>${cells(size, pad)}</svg>`;
const fg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${defs}${cells(size, pad)}</svg>`;
const png = (svg, out, flatten = false) => { fs.mkdirSync(path.dirname(out), { recursive: true }); let s = sharp(Buffer.from(svg)); if (flatten) s = s.flatten({ background: BG }); return s.png().toFile(out); };

// iOS: one 1024 icon (no transparency allowed) + splash
const ios = path.join(ROOT, 'ios/App/App/Assets.xcassets');
if (fs.existsSync(ios)) {
  await png(multiverse(1024, 120), path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'), true);
  await png(multiverse(1024, 120), path.join(ROOT, 'docs/store/app-icon-1024.png'), true);
  const mark = await sharp(path.join(ROOT, 'public/brand/landvas-mark-1024.png')).resize(560, 560).png().toBuffer();
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG } }).composite([{ input: mark, gravity: 'center' }]).png().toFile(path.join(ios, 'Splash.imageset', f));
  }
  console.log('ios icons + splash');
}

// Android: legacy + round + adaptive foreground per density, and splash drawables
const res = path.join(ROOT, 'android/app/src/main/res');
if (fs.existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const icon = Math.round(48 * k), fore = Math.round(108 * k);
    await png(multiverse(icon, icon * 0.12), path.join(res, `mipmap-${d}/ic_launcher.png`), true);
    const roundMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${icon}" height="${icon}"><circle cx="${icon / 2}" cy="${icon / 2}" r="${icon / 2}"/></svg>`);
    const roundSrc = await sharp(Buffer.from(multiverse(icon, icon * 0.2))).png().toBuffer();
    await sharp(roundSrc).composite([{ input: roundMask, blend: 'dest-in' }]).png().toFile(path.join(res, `mipmap-${d}/ic_launcher_round.png`));
    // adaptive icons keep the art inside the middle 66 of 108 dp
    await png(multiverse(fore, fore * 0.25, { bg: false }), path.join(res, `mipmap-${d}/ic_launcher_foreground.png`));
    // the adaptive icon's backdrop: the nebula itself
    await png(multiverse(fore, fore * 0.25, { plots: false }), path.join(res, `mipmap-${d}/ic_launcher_background.png`));
  }
  fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', f), `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`);
  }
  const mark = path.join(ROOT, 'public/brand/landvas-mark-1024.png');
  for (const dir of fs.readdirSync(res).filter((x) => x.startsWith('drawable'))) {
    const f = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const { width, height } = await sharp(f).metadata();
    const m = await sharp(mark).resize(Math.round(Math.min(width, height) * 0.32)).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: BG } }).composite([{ input: m, gravity: 'center' }]).png().toFile(f + '.tmp');
    fs.renameSync(f + '.tmp', f);
  }
  console.log('android icons + splash');
}
