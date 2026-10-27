// Generate the PWA / home-screen icons from the LANDVAS logo mark.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../public/icons');
fs.mkdirSync(OUT, { recursive: true });
const C = ['#3DDC97', '#2FB8FF', '#A45CFF', '#FFB31F', '#FF3D9A', '#3DDC97', '#A45CFF', '#2FB8FF', '#FFB31F'];
function svg(size, pad) {
  const inner = size - pad * 2;
  const gap = inner * 0.045;
  const cell = (inner - gap * 2) / 3;
  const r = cell * 0.22;
  const cells = C.map((c, i) => {
    const x = pad + (i % 3) * (cell + gap), y = pad + Math.floor(i / 3) * (cell + gap);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${r}" fill="${c}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><radialGradient id="g" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#2a1d63"/><stop offset="1" stop-color="#070b1c"/></radialGradient></defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>${cells}</svg>`;
}
for (const [name, size, pad] of [['icon-192.png', 192, 30], ['icon-512.png', 512, 80], ['icon-maskable-512.png', 512, 128], ['apple-touch-icon.png', 180, 28]]) {
  await sharp(Buffer.from(svg(size, pad))).png().toFile(path.join(OUT, name));
  console.log(name);
}
