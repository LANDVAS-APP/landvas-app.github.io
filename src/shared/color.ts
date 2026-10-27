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
  studio: {
    name: 'Studio',
    colors: ['#0B1026', '#FFFFFF', '#F2F2F2', '#9AA3C7', '#5C6680', '#1F2A55', '#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#22C7B5', '#34C3FF', '#2F6BFF', '#7B5CFF', '#FF4FD8', '#8B4A2B'],
  },
  graphite: { name: 'Graphite', colors: ['#111111', '#2A2A2E', '#45464D', '#63656E', '#868892', '#A9ABB3', '#CBCDD3', '#EDEEF1'] },
  neon: { name: 'Neon', unlock: 'palette.neon', colors: ['#00F0FF', '#22E3FF', '#8B5CFF', '#B026FF', '#FF2BD6', '#FF3D7F', '#FFEA00', '#B6FF00', '#39FF14', '#00FFA3', '#FF6B00', '#FFFFFF'] },
  earth: { name: 'Earth & Mineral', unlock: 'palette.earth', colors: ['#3B2416', '#6B4226', '#8C5A3C', '#B07D4F', '#C9A26B', '#D9C3A0', '#5A6B4E', '#7D8F69', '#40514E', '#6E7F80', '#A35C3F', '#2E3B4E'] },
  pastel: { name: 'Pastel Bloom', unlock: 'palette.pastel', colors: ['#FFD6E0', '#FFC2D1', '#FFE5B4', '#FFF3B0', '#D8F3DC', '#B7E4C7', '#CDE7FF', '#BDE0FE', '#E2D4F7', '#CDB4DB', '#F6E7D8', '#FFFFFF'] },
};
