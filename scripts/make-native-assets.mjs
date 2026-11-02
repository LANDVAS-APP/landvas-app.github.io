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
// The app icon: a colourful multiverse. Five claimed plots in the LANDVAS "L", each a different
// world (a painted canvas, a forest, an ocean, a desert sunset, a galaxy), floating in a nebula
// beside four still-unclaimed plots.
function multiverse(size, pad, { bg = true, plots = true } = {}) {
  const S = size, inner = S - pad * 2, gap = inner * 0.06, c = (inner - gap * 2) / 3, r = c * 0.24;
  const at = (i, j) => [pad + i * (c + gap), pad + j * (c + gap)];
  const u = c / 100; // scene units: each plot is 100 × 100
  const plot = (i, j, id, body, glow) => {
    const [x, y] = at(i, j);
    return `<g transform="translate(${x} ${y})">
      <rect x="-${u * 3}" y="-${u * 3}" width="${c + u * 6}" height="${c + u * 6}" rx="${r + u * 3}" fill="${glow}" opacity="0.55" filter="url(#bl)"/>
      <clipPath id="${id}"><rect width="${c}" height="${c}" rx="${r}"/></clipPath>
      <g clip-path="url(#${id})"><g transform="scale(${u})">${body}</g></g>
      <rect width="${c}" height="${c}" rx="${r}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="${u * 2.4}"/>
      <rect x="${c * 0.1}" y="${c * 0.07}" width="${c * 0.8}" height="${c * 0.16}" rx="${c * 0.08}" fill="#fff" opacity="0.22"/>
    </g>`;
  };
  const empty = (i, j) => { const [x, y] = at(i, j); return `<rect x="${x}" y="${y}" width="${c}" height="${c}" rx="${r}" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${u * 2}"/>`; };
  // a painted canvas: bold brush strokes
  const art = `<rect width="100" height="100" fill="#FFF4E6"/>
    <path d="M-5 30 C20 10 40 45 65 25 S100 20 110 30" stroke="#FF3D7F" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M-5 58 C25 40 45 75 70 55 S100 50 110 62" stroke="#FFB31F" stroke-width="15" fill="none" stroke-linecap="round"/>
    <path d="M-5 86 C30 70 55 100 110 82" stroke="#2FB8FF" stroke-width="14" fill="none" stroke-linecap="round"/>
    <circle cx="78" cy="40" r="9" fill="#A45CFF"/>`;
  // a forest habitat with a pond
  const forest = `<rect width="100" height="100" fill="#4CC25A"/><rect y="0" width="100" height="40" fill="#7ED957"/>
    <ellipse cx="62" cy="70" rx="26" ry="15" fill="#2FA3E8"/><ellipse cx="55" cy="66" rx="9" ry="3" fill="#fff" opacity="0.6"/>
    <path d="M15 62 L27 22 L39 62Z" fill="#1F7A43"/><path d="M5 80 L17 44 L29 80Z" fill="#26914F"/><circle cx="84" cy="30" r="14" fill="#2E8B3E"/><circle cx="78" cy="24" r="8" fill="#5CC86A"/>
    <circle cx="40" cy="88" r="4" fill="#FF7AB8"/><circle cx="50" cy="92" r="3" fill="#FFE14D"/>`;
  // an ocean world at sunrise
  const ocean = `<rect width="100" height="100" fill="#7FDBFF"/><rect y="0" width="100" height="45" fill="#B8EBFF"/>
    <circle cx="70" cy="34" r="14" fill="#FFE14D"/>
    <rect y="45" width="100" height="60" fill="#1E90E0"/>
    <path d="M0 55 Q12 48 25 55 T50 55 T75 55 T100 55 V62 H0Z" fill="#59C1FF"/>
    <path d="M0 75 Q12 68 25 75 T50 75 T75 75 T100 75 V82 H0Z" fill="#1673C4"/>
    <path d="M22 60 q6 -8 12 0" stroke="#fff" stroke-width="3" fill="none"/>`;
  // a desert at sunset
  const desert = `<rect width="100" height="100" fill="#FF7A45"/><rect y="0" width="100" height="50" fill="#FF4F7B"/>
    <circle cx="35" cy="48" r="17" fill="#FFE14D"/>
    <path d="M-5 70 Q25 45 55 70 T110 66 V105 H-5Z" fill="#FFB31F"/><path d="M-5 88 Q35 68 70 88 T110 86 V105 H-5Z" fill="#E8892B"/>
    <path d="M78 74 v-14 m0 6 h-5 v-5 m5 3 h5 v-6" stroke="#2E7A3B" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  // a galaxy with a ringed planet
  const galaxy = `<rect width="100" height="100" fill="#1B0B4D"/>
    <ellipse cx="45" cy="55" rx="55" ry="22" transform="rotate(-25 45 55)" fill="#A45CFF" opacity="0.55"/>
    <ellipse cx="45" cy="55" rx="30" ry="10" transform="rotate(-25 45 55)" fill="#FF7AE0" opacity="0.6"/>
    <circle cx="70" cy="32" r="13" fill="#34C3FF"/><ellipse cx="70" cy="32" rx="24" ry="6" transform="rotate(-20 70 32)" fill="none" stroke="#FFE14D" stroke-width="3.5"/>
    ${[[12, 18], [28, 82], [88, 70], [20, 45], [92, 12], [55, 90], [8, 70]].map(([a, b], k) => `<circle cx="${a}" cy="${b}" r="${1.6 + (k % 3)}" fill="#fff"/>`).join('')}`;
  const stars = Array.from({ length: 70 }, (_, k) => { const a = (k * 137.508) % 360, d = ((k * 53) % 100) / 100; return `<circle cx="${(S / 2 + Math.cos(a) * d * S * 0.7).toFixed(1)}" cy="${(S / 2 + Math.sin(a) * d * S * 0.7).toFixed(1)}" r="${(S / 1024) * (1 + (k % 3))}" fill="#fff" opacity="${0.3 + (k % 5) * 0.12}"/>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <radialGradient id="n1" cx="20%" cy="15%" r="70%"><stop offset="0" stop-color="#FF3D9A" stop-opacity="0.85"/><stop offset="1" stop-color="#FF3D9A" stop-opacity="0"/></radialGradient>
      <radialGradient id="n2" cx="85%" cy="85%" r="70%"><stop offset="0" stop-color="#22E3FF" stop-opacity="0.8"/><stop offset="1" stop-color="#22E3FF" stop-opacity="0"/></radialGradient>
      <radialGradient id="n3" cx="85%" cy="20%" r="55%"><stop offset="0" stop-color="#FFB31F" stop-opacity="0.55"/><stop offset="1" stop-color="#FFB31F" stop-opacity="0"/></radialGradient>
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B1A8F"/><stop offset="1" stop-color="#0A0B2E"/></linearGradient>
      <filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${S / 90}"/></filter>
    </defs>
    ${bg ? `<rect width="${S}" height="${S}" fill="url(#base)"/><rect width="${S}" height="${S}" fill="url(#n1)"/><rect width="${S}" height="${S}" fill="url(#n2)"/><rect width="${S}" height="${S}" fill="url(#n3)"/>${stars}` : ''}
    ${plots ? `${empty(1, 0)}${empty(2, 0)}${empty(1, 1)}${empty(2, 1)}
    ${plot(0, 0, 'p1', art, '#FF3D7F')}${plot(0, 1, 'p2', forest, '#3DDC97')}${plot(0, 2, 'p3', desert, '#FFB31F')}${plot(1, 2, 'p4', ocean, '#2FB8FF')}${plot(2, 2, 'p5', galaxy, '#A45CFF')}` : ''}
  </svg>`;
}

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
