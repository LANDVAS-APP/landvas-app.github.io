// Color utilities shared by the editor, ColorBurst and the pipeline.
export type RGB = [number, number, number]; // 0..255 sRGB

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
export const linearToSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, c * 255));
};

export function rgbToLab([r, g, b]: RGB): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 colour difference (Euclidean in L*a*b*). */
export function deltaE(a: RGB, b: RGB): number {
  const A = rgbToLab(a), B = rgbToLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

export function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * Paint-like subtractive mixing: weighted geometric mean of linear
 * reflectance. Blue + yellow pigments give green, unlike an RGB average.
 */
export function mixPigments(colors: RGB[], weights: number[]): RGB {
  const total = weights.reduce((s, w) => s + w, 0);
  if (!total) return [255, 255, 255];
  const out = [0, 0, 0].map((_, ch) => {
    let acc = 0;
    colors.forEach((c, i) => {
      if (weights[i] > 0) acc += (weights[i] / total) * Math.log(Math.max(srgbToLinear(c[ch]), 0.0005));
    });
    return linearToSrgb(Math.exp(acc));
  });
  return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])] as RGB;
}

export const BRAND_RAINBOW = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF', '#FF4FD8'];

export const PALETTES: Record<string, { name: string; colors: string[]; unlock?: string }> = {
  // everyone's starter colours; every other palette is bought in the Studio
  starter: {
    name: 'Starter',
    colors: ['#0B1026', '#FFFFFF', '#9AA3C7', '#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#2F6BFF', '#7B5CFF', '#FF4FD8', '#8B4A2B'],
  },
  graphite: { name: 'Graphite Greys', unlock: 'palette.graphite', colors: ['#111111', '#2A2A2E', '#45464D', '#63656E', '#868892', '#A9ABB3', '#CBCDD3', '#EDEEF1'] },
  earth: { name: 'Earth & Mineral', unlock: 'palette.earth', colors: ['#3B2416', '#6B4226', '#8C5A3C', '#B07D4F', '#C9A26B', '#D9C3A0', '#5A6B4E', '#7D8F69', '#40514E', '#6E7F80', '#A35C3F', '#2E3B4E'] },
  pastel: { name: 'Pastel Bloom', unlock: 'palette.pastel', colors: ['#FFD6E0', '#FFC2D1', '#FFE5B4', '#FFF3B0', '#D8F3DC', '#B7E4C7', '#CDE7FF', '#BDE0FE', '#E2D4F7', '#CDB4DB', '#F6E7D8', '#FFFFFF'] },
  ocean: { name: 'Ocean Deep', unlock: 'palette.ocean', colors: ['#03045E', '#023E8A', '#0077B6', '#0096C7', '#00B4D8', '#48CAE4', '#90E0EF', '#ADE8F4', '#CAF0F8', '#006D77', '#83C5BE', '#EDF6F9'] },
  sunset: { name: 'Sunset Blaze', unlock: 'palette.sunset', colors: ['#3D0C45', '#6A0F49', '#9D174D', '#E11D48', '#FB7185', '#FF6B35', '#F7931E', '#FFB627', '#FFD166', '#FFE8A3', '#FF8FAB', '#C77DFF'] },
  skin: { name: 'Skin Tones', unlock: 'palette.skin', colors: ['#FFE0CC', '#F9D3B4', '#F1C27D', '#E0AC69', '#D1A07A', '#C68642', '#A86B3C', '#8D5524', '#6F4225', '#5A3420', '#3E2316', '#2B1810'] },
  neon: { name: 'Neon', unlock: 'palette.neon', colors: ['#00F0FF', '#22E3FF', '#8B5CFF', '#B026FF', '#FF2BD6', '#FF3D7F', '#FFEA00', '#B6FF00', '#39FF14', '#00FFA3', '#FF6B00', '#FFFFFF'] },
  retro: { name: 'Retro Arcade', unlock: 'palette.retro', colors: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'] },
  metal: { name: 'Metallics', unlock: 'palette.metal', colors: ['#7A5C12', '#B8860B', '#D4AF37', '#FFD700', '#F7E7A1', '#5E5E5E', '#9E9E9E', '#C0C0C0', '#E5E4E2', '#8C4A2F', '#B87333', '#DA8A67'] },
};
