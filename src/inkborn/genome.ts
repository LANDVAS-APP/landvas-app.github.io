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
/** How a creature gets about: legs walk; legless ones roll, bounce, slither or hover. */
export const GAITS = ['walk', 'roll', 'bounce', 'slither', 'hover'] as const;
export const GAIT_INFO: Record<(typeof GAITS)[number], { label: string; emoji: string }> = {
  walk: { label: 'Walks', emoji: '🐾' }, roll: { label: 'Rolls', emoji: '🔵' }, bounce: { label: 'Bounces', emoji: '🦘' },
  slither: { label: 'Slithers', emoji: '🐍' }, hover: { label: 'Hovers', emoji: '🪽' },
};
export const MAX_EYES = 6;
export const MAX_LEGS = 8;

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
  legs: number; // 0 – 8
  /** how many eyes (0 – 6); the `eyes` style says what they look like */
  eyecount: number;
  gait: (typeof GAITS)[number];
  cheeks: boolean;
  size: number; // 0.8 – 1.25
  mood: (typeof MOODS)[number];
  /** arcade wear (won with tickets): on the head, over the eyes, round the neck, and a glow */
  whead?: string; wface?: string; wneck?: string; waura?: string;
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
  const g = {
    body: pick(BODIES), ...pal,
    pattern: rnd() < 0.35 ? 'none' : pick(PATTERNS.slice(1)),
    eyes: pick(EYES), ears: pick(EARS), horns: rnd() < 0.55 ? 'none' : pick(HORNS.slice(1)),
    tail: pick(TAILS), wings: rnd() < 0.7 ? 'none' : pick(WINGS.slice(1)),
    legs: rnd() < 0.5 ? 2 : 4, cheeks: rnd() < 0.6, size: Math.round((0.85 + rnd() * 0.35) * 100) / 100, mood: pick(MOODS),
  } as Omit<Genome, 'eyecount' | 'gait'>;
  // newer parts are rolled after the rest, so older seeds still give the same creatures
  const r1 = rnd(), r2 = rnd();
  const legs = r1 < 0.12 ? 0 : r1 < 0.18 ? 6 : g.legs;
  const eyecount = g.eyes === 'one' ? 1 : r2 < 0.1 ? 3 : 2;
  return { ...g, legs, eyecount, gait: legs > 0 ? 'walk' : defaultGait(g.body, g.wings) };
}

/** How a legless body would get about. */
export function defaultGait(body: Genome['body'], wings: Genome['wings']): Genome['gait'] {
  if (wings !== 'none') return 'hover';
  if (body === 'long' || body === 'bean') return 'slither';
  if (body === 'tall') return 'bounce';
  return 'roll';
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
  // drawn only in dark pencil: keep a cheerful palette rather than a black creature
  const body = light[0];
  if (!body && ranked.length) notes.push('Drawn in pencil — colours picked for you');
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

  // ---- parts, read stroke by stroke around the body ----
  const parts = readParts(strokes, N, ink, { x0, y0, x1, y1 });
  notes.push(...parts.notes);
  genome.eyecount = parts.eyes;
  if (parts.eyes === 1) genome.eyes = 'one'; else if (genome.eyes === 'one') genome.eyes = 'big';
  genome.legs = parts.legs;
  if (parts.ears) genome.ears = parts.ears;
  if (parts.horns) genome.horns = parts.horns;
  if (parts.topCount === 0) { genome.ears = 'none'; genome.horns = 'none'; }
  genome.tail = parts.tail ?? 'none';
  genome.wings = parts.wings ?? 'none';
  genome.gait = genome.legs > 0 ? 'walk' : defaultGait(genome.body, genome.wings);
  if (genome.legs === 0) notes.push(`It ${GAIT_INFO[genome.gait].label.toLowerCase()}`);

  // lots of small marks that aren't eyes: a pattern
  if (parts.spots >= 3) { genome.pattern = 'spots'; notes.push('Spots'); }
  else if (parts.stripes >= 3) { genome.pattern = 'stripes'; notes.push('Stripes'); }
  else genome.pattern = 'none';

  genome.size = Math.round(Math.max(0.85, Math.min(1.25, 0.85 + (total / (N * N)) * 1.6)) * 100) / 100;
  return { genome, notes };
}


// ---- reading the parts of a drawing ----------------------------------------------------------
type Box = { x0: number; y0: number; x1: number; y1: number };
type Mark = { s: Stroke; b: Box; cx: number; cy: number; w: number; h: number; closed: boolean };
const DARK = new Set([1, 2, 12]); // the dark ink colours (outline, grey, brown)

/**
 * Find the body (the biggest outline) and sort every other stroke by where it sits around it:
 * small marks in the upper body are eyes (a pupil inside an eye counts once), anything hanging
 * off the bottom is a leg, bumps above are ears or horns, things reaching out at the sides are a
 * tail or wings. A body drawn in one stroke (legs and all) is read from the picture instead.
 */
export function readParts(strokes: Stroke[], N: number, ink: Uint8Array, all: Box) {
  const notes: string[] = [];
  const marks: Mark[] = strokes.filter((s) => s.c !== 0 && s.p.length >= 3).map((s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < s.p.length; i += 3) { x0 = Math.min(x0, s.p[i]); x1 = Math.max(x1, s.p[i]); y0 = Math.min(y0, s.p[i + 1]); y1 = Math.max(y1, s.p[i + 1]); }
    const pad = s.w / 2;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const w = x1 - x0, h = y1 - y0;
    const closed = s.p.length > 9 && Math.hypot(s.p[0] - s.p[s.p.length - 3], s.p[1] - s.p[s.p.length - 2]) < Math.max(w, h) * 0.3;
    return { s, b: { x0, y0, x1, y1 }, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h, closed };
  });
  const out = { eyes: 2, legs: 2, ears: null as Genome['ears'] | null, horns: null as Genome['horns'] | null, topCount: -1, tail: null as Genome['tail'] | null, wings: null as Genome['wings'] | null, spots: 0, stripes: 0, notes };
  if (!marks.length) return out;
  // the body: the biggest stroke, plus any other big strokes over it (a body drawn in pieces)
  const big = marks.reduce((a, m) => (m.w * m.h > a.w * a.h ? m : a));
  const bodyMarks = marks.filter((m) => m === big || (m.w * m.h > big.w * big.h * 0.3 && m.cx > big.b.x0 && m.cx < big.b.x1 && m.cy > big.b.y0 && m.cy < big.b.y1));
  const B: Box = { x0: Math.min(...bodyMarks.map((m) => m.b.x0)), y0: Math.min(...bodyMarks.map((m) => m.b.y0)), x1: Math.max(...bodyMarks.map((m) => m.b.x1)), y1: Math.max(...bodyMarks.map((m) => m.b.y1)) };
  const BW = B.x1 - B.x0, BH = B.y1 - B.y0, small = Math.min(BW, BH) * 0.3;
  const rest = marks.filter((m) => !bodyMarks.includes(m));
  const inside = (m: Mark, k = 0.02) => m.cx > B.x0 + BW * k && m.cx < B.x1 - BW * k && m.cy > B.y0 + BH * k && m.cy < B.y1 - BH * k;
  const isSmall = (m: Mark) => Math.hypot(m.w, m.h) < small * 1.4 && m.w < BW * 0.35 && m.h < BH * 0.35;

  // eyes: small marks inside the upper body, merged when one sits inside another (a pupil)
  const faceMarks = rest.filter((m) => isSmall(m) && inside(m) && m.cy < B.y0 + BH * 0.62);
  const clusters: Mark[][] = [];
  for (const m of faceMarks.sort((a, b) => b.w * b.h - a.w * a.h)) {
    const c = clusters.find((cl) => cl.some((o) => (m.cx > o.b.x0 - 4 && m.cx < o.b.x1 + 4 && m.cy > o.b.y0 - 4 && m.cy < o.b.y1 + 4) || Math.hypot(m.cx - o.cx, m.cy - o.cy) < BW * 0.06));
    if (c) c.push(m); else clusters.push([m]);
  }
  // a wide, flat mark below the others is a mouth, not an eye
  const boxOf = (cl: Mark[]) => ({ x0: Math.min(...cl.map((m) => m.b.x0)), x1: Math.max(...cl.map((m) => m.b.x1)), y0: Math.min(...cl.map((m) => m.b.y0)), y1: Math.max(...cl.map((m) => m.b.y1)) });
  const eyeY = clusters.length ? Math.min(...clusters.map((cl) => (boxOf(cl).y0 + boxOf(cl).y1) / 2)) : 0;
  const eyeClusters = clusters.filter((cl) => { const bx = boxOf(cl); const w = bx.x1 - bx.x0, h = bx.y1 - bx.y0; return !(w > h * 2.2 && (bx.y0 + bx.y1) / 2 > eyeY + BH * 0.05); });
  const lowerSmall = rest.filter((m) => isSmall(m) && inside(m) && !faceMarks.includes(m));
  if (eyeClusters.length > MAX_EYES) { out.eyes = 2; out.spots = eyeClusters.length + lowerSmall.length; notes.push('Lots of little marks — spots'); }
  else { out.eyes = eyeClusters.length; notes.push(out.eyes === 0 ? 'No eyes' : `${out.eyes} eye${out.eyes === 1 ? '' : 's'}`); }
  out.spots = Math.max(out.spots, lowerSmall.filter((m) => m.w < BW * 0.15 && m.h < BH * 0.15).length);
  out.stripes = lowerSmall.filter((m) => m.w > m.h * 2.5 || m.h > m.w * 2.5).length;

  // legs: strokes hanging off the bottom of the body
  const legMarks = rest.filter((m) => m.b.y1 > B.y1 - BH * 0.04 && m.b.y0 > B.y0 + BH * 0.45 && m.cx > B.x0 - BW * 0.05 && m.cx < B.x1 + BW * 0.05 && m.w < BW * 0.45 && m.h > BH * 0.06);
  if (legMarks.length) out.legs = Math.min(MAX_LEGS, legMarks.length);
  else {
    // one-stroke bodies: narrow stubs along the bottom of the picture are legs; a rounded bottom is none.
    // Read the filled silhouette (an outline's inside counts), or a hollow outline looks like two legs.
    const k = N / 1000;
    const solid = new Uint8Array(N * N).fill(1);
    const stack: number[] = [];
    for (let i = 0; i < N; i++) stack.push(i, (N - 1) * N + i, i * N, i * N + N - 1);
    while (stack.length) {
      const q = stack.pop()!;
      if (!solid[q] || ink[q]) continue;
      solid[q] = 0;
      const qx = q % N, qy = (q - qx) / N;
      if (qx > 0) stack.push(q - 1); if (qx < N - 1) stack.push(q + 1); if (qy > 0) stack.push(q - N); if (qy < N - 1) stack.push(q + N);
    }
    const runs = (yy: number) => {
      const y = Math.max(0, Math.min(N - 1, Math.round(yy * k)));
      const r: [number, number][] = [];
      let st = -1;
      for (let x = Math.floor(all.x0); x <= all.x1 + 1; x++) {
        const on = x <= all.x1 && solid[y * N + x];
        if (on && st < 0) st = x;
        if (!on && st >= 0) { r.push([st, x - 1]); st = -1; }
      }
      return r;
    };
    const bw = (all.x1 - all.x0) / k;
    const feet = runs(B.y1 - BH * 0.06).filter(([a, b]) => (b - a) / k < bw * 0.3);
    const legsAbove = runs(B.y1 - BH * 0.18);
    if (feet.length >= 2) out.legs = Math.min(MAX_LEGS, feet.length);
    else if (feet.length === 1 && legsAbove.some(([a, b]) => (b - a) / k < bw * 0.35 && a <= feet[0][1] && b >= feet[0][0]) && legsAbove.length >= 1 && runs(B.y1 - BH * 0.06).length === 1 && (feet[0][1] - feet[0][0]) / k < bw * 0.2) out.legs = 1;
    else out.legs = 0;
  }
  notes.push(out.legs === 0 ? 'No legs' : `${out.legs} leg${out.legs === 1 ? '' : 's'}`);

  // on top: ears (two), a horn (one, in the middle), antlers (more)
  const top = rest.filter((m) => !faceMarks.includes(m) && m.b.y0 < B.y0 + BH * 0.08 && m.cy < B.y0 + BH * 0.3 && m.cx > B.x0 - BW * 0.1 && m.cx < B.x1 + BW * 0.1);
  out.topCount = top.length;
  if (top.length === 1) {
    const m = top[0];
    if (Math.abs(m.cx - (B.x0 + B.x1) / 2) < BW * 0.2 && m.h > m.w) { out.horns = 'unicorn'; notes.push('A horn'); }
    else { out.ears = 'round'; out.topCount = 2; notes.push('An ear'); }
  } else if (top.length === 2) {
    const narrow = top.every((m) => m.w < BW * 0.22), tall = top.every((m) => m.h > m.w * 1.6);
    out.ears = tall ? 'bunny' : narrow ? 'cat' : 'round';
    notes.push(`${out.ears === 'bunny' ? 'Bunny' : out.ears === 'cat' ? 'Pointy' : 'Round'} ears`);
  } else if (top.length >= 3) { out.horns = 'antlers'; out.ears = 'none'; notes.push('Antlers'); }
  else if (legMarks.length || faceMarks.length) out.topCount = 0; // a separately drawn creature with nothing on top

  // at the sides: wings up high (both sides), a tail lower down (one side)
  const sides = rest.filter((m) => !legMarks.includes(m) && !top.includes(m) && !faceMarks.includes(m) && (m.cx < B.x0 + BW * 0.05 || m.cx > B.x1 - BW * 0.05));
  const high = sides.filter((m) => m.cy < B.y0 + BH * 0.5), low = sides.filter((m) => m.cy >= B.y0 + BH * 0.5);
  if (high.length >= 2 || (high.length === 1 && high[0].w > BW * 0.25)) { out.wings = 'leaf'; notes.push('Wings'); }
  if (low.length >= 1) { out.tail = low[0].closed ? 'fluffy' : 'long'; notes.push('A tail'); }
  return out;
}

/** Accept only known values (the server stores whatever the rig understands). */
export function cleanGenome(g: Partial<Genome>): Genome {
  const d = randomGenome(7);
  const one = <T extends string>(v: unknown, xs: readonly T[], f: T): T => (xs.includes(v as T) ? (v as T) : f);
  const col = (v: unknown, f: string) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : f);
  const int = (v: unknown, lo: number, hi: number, f: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : f);
  const out: Genome = {
    body: one(g.body, BODIES, d.body), color: col(g.color, d.color), belly: col(g.belly, d.belly), accent: col(g.accent, d.accent),
    pattern: one(g.pattern, PATTERNS, 'none'), eyes: one(g.eyes, EYES, 'big'), ears: one(g.ears, EARS, 'none'), horns: one(g.horns, HORNS, 'none'),
    tail: one(g.tail, TAILS, 'none'), wings: one(g.wings, WINGS, 'none'), legs: int(g.legs, 0, MAX_LEGS, 2), cheeks: !!g.cheeks,
    size: typeof g.size === 'number' ? Math.max(0.8, Math.min(1.25, g.size)) : 1, mood: one(g.mood, MOODS, 'curious'),
    // creatures made before eye counts existed: one eye if it had the 'one' style, else two
    eyecount: int(g.eyecount, 0, MAX_EYES, g.eyes === 'one' ? 1 : 2),
    gait: 'walk',
  };
  out.gait = out.legs > 0 ? 'walk' : one(g.gait, GAITS, defaultGait(out.body, out.wings));
  for (const k of ['whead', 'wface', 'wneck', 'waura'] as const) if (typeof g[k] === 'string' && /^[a-z]{2,12}$/.test(g[k]!)) out[k] = g[k];
  if (out.gait === 'walk' && out.legs === 0) out.gait = defaultGait(out.body, out.wings);
  return out;
}
