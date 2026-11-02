// Inkborn genome: every creature is described by a small set of parts on one standard rig
// (body, belly, pattern, eyes, ears, horns, tail, legs, wings), so any creature — drawn,
// randomised or customised — can be animated the same way.
import { mulberry32 } from '../shared/minigames/rng';
import { SKETCH_COLORS, drawStrokes, type Stroke } from '../shared/strokes';

export const BODIES = ['round', 'bean', 'tall', 'long', 'pear', 'blob'] as const;
export const PATTERNS = ['none', 'spots', 'stripes', 'patches', 'stars'] as const;
export const EYES = ['round', 'big', 'sleepy', 'happy', 'star', 'one'] as const;
export const EARS = ['none', 'cat', 'bunny', 'round', 'floppy', 'fins'] as const;
export const HORNS = ['none', 'nubs', 'curly', 'antlers', 'unicorn'] as const;
export const TAILS = ['none', 'fluffy', 'long', 'fin', 'curl', 'flame'] as const;
export const WINGS = ['none', 'tiny', 'leaf'] as const;
export const MOODS = ['playful', 'sleepy', 'curious', 'shy', 'foodie', 'brave'] as const;

export type Genome = {
  body: (typeof BODIES)[number];
  color: string;
  belly: string;
  accent: string;
  pattern: (typeof PATTERNS)[number];
  eyes: (typeof EYES)[number];
  ears: (typeof EARS)[number];
  horns: (typeof HORNS)[number];
  tail: (typeof TAILS)[number];
  wings: (typeof WINGS)[number];
  legs: number; // 2 or 4
  cheeks: boolean;
  size: number; // 0.8 – 1.25
  mood: (typeof MOODS)[number];
};

export const MOOD_INFO: Record<Genome['mood'], { label: string; text: string; emoji: string }> = {
  playful: { label: 'Playful', text: 'Always up for a game and loves bouncing around.', emoji: '🎈' },
  sleepy: { label: 'Sleepy', text: 'Naps often and loves a cosy nest.', emoji: '💤' },
  curious: { label: 'Curious', text: 'Investigates every rock, flower and visitor.', emoji: '🔍' },
  shy: { label: 'Shy', text: 'Keeps a little distance until you’ve bonded.', emoji: '🌸' },
  foodie: { label: 'Foodie', text: 'Thinks about snacks. Mostly snacks.', emoji: '🍓' },
  brave: { label: 'Brave', text: 'Explores the far corners of the habitat.', emoji: '⭐' },
};

// ---- colour helpers ----------------------------------------------------------------------
export function hsl(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}
export function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 50];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}
export const shade = (hex: string, dl: number) => { const [h, s, l] = hexToHsl(hex); return hsl(h, s, Math.max(4, Math.min(96, l + dl))); };

/** A harmonious set of colours from one hue. */
function palette(h: number, rng: () => number) {
  const s = 55 + rng() * 30, l = 58 + rng() * 14;
  const color = hsl(h, s, l);
  const belly = hsl((h + 15) % 360, Math.max(30, s - 25), Math.min(92, l + 22));
  const accent = hsl((h + 150 + rng() * 60) % 360, 70, 60);
  return { color, belly, accent };
}

// ---- random creatures -------------------------------------------------------------------
export function randomGenome(seed = Math.floor(Math.random() * 2 ** 31)): Genome {
  const r = mulberry32(seed);
  const rnd = () => r.next();
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const pal = palette(Math.floor(rnd() * 360), rnd);
  return {
    body: pick(BODIES), ...pal,
    pattern: rnd() < 0.35 ? 'none' : pick(PATTERNS.slice(1)),
    eyes: pick(EYES), ears: pick(EARS), horns: rnd() < 0.55 ? 'none' : pick(HORNS.slice(1)),
    tail: pick(TAILS), wings: rnd() < 0.7 ? 'none' : pick(WINGS.slice(1)),
    legs: rnd() < 0.5 ? 2 : 4, cheeks: rnd() < 0.6, size: Math.round((0.85 + rnd() * 0.35) * 100) / 100, mood: pick(MOODS),
  };
}

const SYL_A = ['Mo', 'Pi', 'Lu', 'Bo', 'Ki', 'Nu', 'Ta', 'Zu', 'Fi', 'Ru', 'Po', 'Su', 'Ni', 'Ba', 'Ko', 'Mi', 'Wi', 'Da', 'Gu', 'Yo'];
const SYL_B = ['chi', 'po', 'mo', 'lu', 'bo', 'ri', 'nko', 'ffy', 'zzle', 'mble', 'pip', 'doo', 'na', 'rka', 'ki', 'sh', 'tto', 'mmy', 'bbit', 'lly'];
export function randomName(seed = Math.floor(Math.random() * 2 ** 31)) {
  const r = mulberry32(seed);
  return SYL_A[Math.floor(r.next() * SYL_A.length)] + SYL_B[Math.floor(r.next() * SYL_B.length)];
}

// ---- from a drawing ----------------------------------------------------------------------
/**
 * Read a creature drawing and turn it into a genome on the standard rig. What's read:
 * colours (by painted area), overall shape (aspect, fill, where the mass sits), bumps on
 * top (ears or horns), what reaches out to one side low down (a tail), separate stubs at
 * the bottom (legs), wide bits at the shoulders (wings) and many small marks (a pattern).
 */
export function genomeFromDrawing(strokes: Stroke[], seed = 1): { genome: Genome; notes: string[] } {
  const N = 96;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, N, N);
  drawStrokes(g, strokes, N);
  const data = g.getImageData(0, 0, N, N).data;
  const ink = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) { const p = i * 4; if (765 - (data[p] + data[p + 1] + data[p + 2]) > 40) ink[i] = 1; }
  let x0 = N, y0 = N, x1 = -1, y1 = -1, total = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (ink[y * N + x]) { total++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const notes: string[] = [];
  const base = randomGenome(seed);
  if (!total) return { genome: base, notes: ['No drawing found — made a surprise creature instead.'] };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const aspect = w / h;

  // colours by how much of the drawing they cover (dark outline colours set the body only if alone)
  const area = new Map<number, number>();
  for (const s of strokes) {
    let len = 0;
    for (let i = 3; i < s.p.length; i += 3) len += Math.hypot(s.p[i] - s.p[i - 3], s.p[i + 1] - s.p[i - 2]);
    area.set(s.c, (area.get(s.c) ?? 0) + (len + s.w) * s.w);
  }
  area.delete(0);
  const ranked = [...area.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => SKETCH_COLORS[k]).filter(Boolean);
  const light = ranked.filter((x) => hexToHsl(x)[2] > 22 && !(hexToHsl(x)[1] < 8 && hexToHsl(x)[2] < 50));
  const genome: Genome = { ...base };
  const body = light[0] ?? ranked[0];
  if (body) {
    genome.color = body;
    const [hh, ss, ll] = hexToHsl(body);
    genome.belly = light[1] && hexToHsl(light[1])[2] > ll ? light[1] : hsl((hh + 12) % 360, Math.max(25, ss - 25), Math.min(93, ll + 22));
    genome.accent = light[1] ?? light[2] ?? hsl((hh + 170) % 360, 70, 60);
    notes.push('Colours from your drawing');
  }

  // body shape: proportions, how full the outline is, and where the weight sits
  let lower = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (ink[y * N + x] && y > y0 + h / 2) lower++;
  const fill = total / (w * h);
  genome.body = aspect > 1.45 ? 'long' : aspect < 0.72 ? 'tall' : lower / total > 0.62 ? 'pear' : fill > 0.5 ? 'round' : aspect > 1.1 ? 'bean' : 'blob';
  notes.push(`A ${genome.body} body like your drawing`);

  // separate bumps in the top fifth: two = ears, one tall central spike = a horn
  const runs = (y: number, xa = x0, xb = x1) => {
    const out: [number, number][] = [];
    let s = -1;
    for (let x = xa; x <= xb + 1; x++) {
      const on = x <= xb && ink[y * N + x];
      if (on && s < 0) s = x;
      if (!on && s >= 0) { out.push([s, x - 1]); s = -1; }
    }
    return out;
  };
  const topRow = Math.round(y0 + h * 0.08), midTop = Math.round(y0 + h * 0.22);
  const top = runs(topRow), top2 = runs(midTop);
  if (top.length >= 2) {
    const narrow = top.every(([a, b]) => b - a < w * 0.18);
    genome.ears = narrow ? (h > w ? 'bunny' : 'cat') : 'round';
    genome.horns = 'none';
    notes.push('Ears from the bumps on top');
  } else if (top.length === 1 && top2.length >= 1 && top[0][1] - top[0][0] < w * 0.14) {
    const cx = (top[0][0] + top[0][1]) / 2;
    if (Math.abs(cx - (x0 + w / 2)) < w * 0.2) { genome.horns = 'unicorn'; notes.push('A horn from the spike on top'); }
  } else if (top.length === 0 || top[0][1] - top[0][0] > w * 0.5) {
    genome.ears = 'none';
  }

  // separate stubs along the bottom: legs
  const feet = runs(Math.round(y1 - h * 0.04));
  genome.legs = feet.length >= 3 ? 4 : 2;
  if (feet.length >= 2) notes.push(`${genome.legs} legs`);

  // something reaching out to one side in the lower half: a tail
  const midY = Math.round(y0 + h * 0.6);
  const side = runs(midY);
  if (side.length >= 2) {
    const first = side[0], last = side[side.length - 1];
    const thin = (r: [number, number]) => r[1] - r[0] < w * 0.16;
    if (thin(first) || thin(last)) {
      genome.tail = lower / total > 0.55 ? 'fluffy' : 'long';
      notes.push('A tail from the line at the side');
    }
  }

  // wide bits at the shoulders (wider than the middle): wings
  const shoulders = runs(Math.round(y0 + h * 0.35));
  if (shoulders.length >= 3 && aspect > 0.9) { genome.wings = 'leaf'; notes.push('Wings'); }

  // lots of small marks: a pattern
  const dots = strokes.filter((s) => s.p.length <= 9 && s.c !== 0).length;
  const lines = strokes.filter((s) => s.p.length > 9 && s.c !== 0).length;
  if (dots >= 4) { genome.pattern = 'spots'; notes.push('Spots'); }
  else if (lines >= 6 && aspect > 0.8) { genome.pattern = 'stripes'; notes.push('Stripes'); }
  else genome.pattern = 'none';

  genome.size = Math.round(Math.max(0.85, Math.min(1.25, 0.85 + (total / (N * N)) * 1.6)) * 100) / 100;
  return { genome, notes };
}

/** Accept only known values (the server stores whatever the rig understands). */
export function cleanGenome(g: Partial<Genome>): Genome {
  const d = randomGenome(7);
  const one = <T extends string>(v: unknown, xs: readonly T[], f: T): T => (xs.includes(v as T) ? (v as T) : f);
  const col = (v: unknown, f: string) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : f);
  return {
    body: one(g.body, BODIES, d.body), color: col(g.color, d.color), belly: col(g.belly, d.belly), accent: col(g.accent, d.accent),
    pattern: one(g.pattern, PATTERNS, 'none'), eyes: one(g.eyes, EYES, 'big'), ears: one(g.ears, EARS, 'none'), horns: one(g.horns, HORNS, 'none'),
    tail: one(g.tail, TAILS, 'none'), wings: one(g.wings, WINGS, 'none'), legs: g.legs === 4 ? 4 : 2, cheeks: !!g.cheeks,
    size: typeof g.size === 'number' ? Math.max(0.8, Math.min(1.25, g.size)) : 1, mood: one(g.mood, MOODS, 'curious'),
  };
}
