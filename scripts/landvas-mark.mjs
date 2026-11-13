// The LANDVAS mark, drawn crisp: five claimed plots forming the "L" in a 3×3 grid, four empty plots.
// No blur or glow filters — every edge is a clean vector edge, so it stays sharp at any size.
// Used by scripts/make-native-assets.mjs (app icons, splash screens, store icon and the public/brand marks).

export const PLOTS = {
  rose: { base: '#FF4D6D', light: '#FF9DB0', deep: '#C81E45' },
  amber: { base: '#FF9F1C', light: '#FFCB78', deep: '#D06A00' },
  sun: { base: '#FFE14D', light: '#FFF3A6', deep: '#D9A900' },
  mint: { base: '#3DDC97', light: '#9BF2CB', deep: '#14A36A' },
  sky: { base: '#34C3FF', light: '#9DE4FF', deep: '#0B8AD1' },
};
// grid position [column, row] of each claimed plot — the L
const L = [['rose', 0, 0], ['amber', 0, 1], ['sun', 0, 2], ['mint', 1, 2], ['sky', 2, 2]];
const EMPTY = [[1, 0], [2, 0], [1, 1], [2, 1]];

const f = (n) => Number(n.toFixed(2));

/**
 * @param {number} size  output size in px (square)
 * @param {object} o
 * @param {'squircle'|'full'|'none'} [o.bg]  squircle = the logo tile with its rainbow rim; full = edge-to-edge (app icons); none = transparent
 * @param {number} [o.pad]      grid inset as a fraction of size
 * @param {boolean} [o.empty]   draw the four empty plots
 * @param {boolean} [o.plots]   draw the plots at all (false = background only)
 * @param {boolean} [o.mono]    plain white L only (Android themed / monochrome icon)
 */
export function markSvg(size, { bg = 'squircle', pad = 0.115, empty = true, plots = true, mono = false } = {}) {
  const S = size;
  const inset = S * pad, inner = S - inset * 2, gap = inner * 0.075, c = (inner - gap * 2) / 3, r = c * 0.26;
  const lip = c * 0.075; // the darker "thickness" under each claimed plot
  const at = (i, j) => [inset + i * (c + gap), inset + j * (c + gap)];
  const defs = [];
  let body = '';

  if (bg !== 'none' && !mono) {
    defs.push(`<radialGradient id="lv-bg" cx="28%" cy="16%" r="100%"><stop offset="0" stop-color="#2B2070"/><stop offset="0.55" stop-color="#101848"/><stop offset="1" stop-color="#070B1C"/></radialGradient>`);
    if (bg === 'squircle') {
      const rr = S * 0.235, sw = S * 0.012;
      defs.push(`<linearGradient id="lv-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4D6D"/><stop offset="0.22" stop-color="#FF9F1C"/><stop offset="0.42" stop-color="#FFE14D"/><stop offset="0.62" stop-color="#3DDC97"/><stop offset="0.82" stop-color="#34C3FF"/><stop offset="1" stop-color="#8B6BFF"/></linearGradient>`);
      body += `<rect x="0" y="0" width="${S}" height="${S}" rx="${f(rr)}" fill="url(#lv-bg)"/>`;
      body += `<rect x="${f(sw / 2)}" y="${f(sw / 2)}" width="${f(S - sw)}" height="${f(S - sw)}" rx="${f(rr - sw / 2)}" fill="none" stroke="url(#lv-rim)" stroke-width="${f(sw)}"/>`;
    } else {
      body += `<rect width="${S}" height="${S}" fill="url(#lv-bg)"/>`;
    }
  }

  if (plots && empty && !mono) {
    defs.push(`<linearGradient id="lv-empty" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26346F"/><stop offset="1" stop-color="#1A2558"/></linearGradient>`);
    for (const [i, j] of EMPTY) {
      const [x, y] = at(i, j);
      body += `<rect x="${f(x)}" y="${f(y)}" width="${f(c)}" height="${f(c)}" rx="${f(r)}" fill="url(#lv-empty)" stroke="#34458F" stroke-width="${f(c * 0.03)}"/>`;
    }
  }

  for (const [name, i, j] of plots ? L : []) {
    const p = PLOTS[name];
    const [x, y] = at(i, j);
    if (mono) {
      body += `<rect x="${f(x)}" y="${f(y)}" width="${f(c)}" height="${f(c)}" rx="${f(r)}" fill="#FFFFFF"/>`;
      continue;
    }
    defs.push(`<linearGradient id="lv-${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.light}"/><stop offset="0.5" stop-color="${p.base}"/><stop offset="1" stop-color="${p.base}"/></linearGradient>`);
    // lip (full tile in the deep colour), then the face sitting on top of it
    body += `<rect x="${f(x)}" y="${f(y)}" width="${f(c)}" height="${f(c)}" rx="${f(r)}" fill="${p.deep}"/>`;
    body += `<rect x="${f(x)}" y="${f(y)}" width="${f(c)}" height="${f(c - lip)}" rx="${f(r)}" fill="url(#lv-${name})"/>`;
    // glass highlight
    body += `<rect x="${f(x + c * 0.13)}" y="${f(y + c * 0.09)}" width="${f(c * 0.74)}" height="${f(c * 0.15)}" rx="${f(c * 0.075)}" fill="#FFFFFF" opacity="0.42"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs>${defs.join('')}</defs>${body}</svg>`;
}
