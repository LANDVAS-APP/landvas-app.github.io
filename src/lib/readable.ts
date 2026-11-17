// Words in a colour have to be readable on the game's dark glass. Some colours are made for fills — a Primordial's
// deep violet, the Doubling Cube's near-black, a realm's navy — and vanish as text. readable(c) keeps the colour's hue
// and lightens it just enough to read on the dark (WCAG contrast ≥ 4.5 against the app's surface); colours that
// already read are returned untouched. Anything that isn't a hex colour (a CSS variable, a gradient) passes through.

const SURFACE = [0x10, 0x18, 0x3a]; // the app's dark surface (--surface)
const cache = new Map<string, string>();

const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const BG = lum(SURFACE[0], SURFACE[1], SURFACE[2]);

function parse(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** is the page dark right now? (the app always is; the website follows the theme setting / the system) */
function isDark() {
  if (typeof document === 'undefined') return true;
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches);
}

/** this colour, lightened only as much as it takes to read on the dark (min contrast 4.5 by default). On the light
 *  theme colours are left as they are (dark colours already read on white). */
export function readable(c: string | null | undefined, min = 4.5): string {
  if (!c) return c ?? '';
  if (!isDark()) return c;
  const key = `${c}|${min}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rgb = parse(c);
  let out = c;
  if (rgb && contrast(lum(...rgb), BG) < min) {
    // mix toward white in small steps until it reads (hue kept)
    for (let t = 0.08; t <= 1.0001; t += 0.04) {
      const mix = rgb.map((v) => v + (255 - v) * t) as [number, number, number];
      if (contrast(lum(...mix), BG) >= min || t >= 1) { out = `#${hex(mix[0])}${hex(mix[1])}${hex(mix[2])}`; break; }
    }
  }
  cache.set(key, out);
  return out;
}

/** how well a colour reads on the dark surface (WCAG contrast ratio) */
export function contrastOnDark(c: string): number {
  const rgb = parse(c);
  return rgb ? contrast(lum(...rgb), BG) : 21;
}

const LIGHT_BG = lum(0xff, 0xff, 0xff);
const cacheOn = new Map<string, string>();
/** this colour made readable on a panel that is always dark (the chat boxes over the map) or always light, whatever
 *  the page's theme: lightened toward white on the dark, darkened toward black on the light (hue kept). */
export function readableOn(c: string | null | undefined, bg: 'dark' | 'light', min = 4.5): string {
  if (!c) return c ?? '';
  const key = `${c}|${bg}|${min}`;
  const hit = cacheOn.get(key);
  if (hit) return hit;
  const rgb = parse(c);
  let out = c;
  const ground = bg === 'dark' ? BG : LIGHT_BG;
  if (rgb && contrast(lum(...rgb), ground) < min) {
    for (let t = 0.08; t <= 1.0001; t += 0.04) {
      const mix = rgb.map((v) => (bg === 'dark' ? v + (255 - v) * t : v * (1 - t))) as [number, number, number];
      if (contrast(lum(...mix), ground) >= min || t >= 1) { out = `#${hex(mix[0])}${hex(mix[1])}${hex(mix[2])}`; break; }
    }
  }
  cacheOn.set(key, out);
  return out;
}

/** is the page dark right now (the app always is) */
export const pageIsDark = () => isDark();
