// LANDVAS PvP minigames: four head-to-head skill games, played over several rounds.
// Both players get the exact same boards (same seed); the server replays each run's
// move log. Each round goes to the higher score (a tie goes to the faster round),
// and the match goes to whoever wins more rounds. Entry is free; the operator sets
// the Ink a win pays. Rivals are anonymous and matched at random.
import { hexToRgb } from '../color';
import { roundSeed } from '../minigames/boards';
import { MURAL_COLORS } from '../minigames/memorymural';
import { mulberry32 } from '../minigames/rng';
import { checkTimes } from '../minigames/types';

export type PvpGame = 'turfwars' | 'paletteclash' | 'forgery' | 'pixelrecall' | 'copycat';
export const PVP_GAMES: PvpGame[] = ['copycat', 'turfwars', 'paletteclash', 'forgery', 'pixelrecall'];

/** One board's verdict. quality is 0-100: how close to a perfect round it was. */
export type BoardResult = { valid: boolean; score: number; time_ms: number; quality: number; summary: Record<string, unknown>; flags: string[]; reason?: string };
const bad = (reason: string): BoardResult => ({ valid: false, score: 0, time_ms: 0, quality: 0, summary: { reason }, flags: [reason], reason });
const pct = (x: number) => Math.max(0, Math.min(100, Math.round(x * 100)));
const seeded = (seed: number, salt: number) => mulberry32((Math.imul(seed ^ 0x2c1b3c6d, 2654435761) + salt * 97531) >>> 0);

export const PVP_INFO: Record<PvpGame, { name: string; tagline: string; howTo: string[]; color: string }> = {
  turfwars: {
    name: 'Turf Wars', tagline: 'Claim the most valuable land in 16 brush strokes.', color: '#3DDC97',
    howTo: ['You start on the glowing plot. Every tap paints a plot next to your land.', 'Each plot is worth its number. You get 16 strokes.', 'Plan a route through the rich plots. The higher land value wins the round.'],
  },
  paletteclash: {
    name: 'Palette Clash', tagline: 'Mix the exact colour, faster than them.', color: '#FF4D6D',
    howTo: ['Each swatch is an even mix of two pigments from the palette.', 'Tap the two pigments that make it. Exact mixes score 100.', '8 swatches a round. Accuracy first, then speed.'],
  },
  forgery: {
    name: 'Spot the Forgery', tagline: 'Find what the forger changed.', color: '#FFB23F',
    howTo: ['The original mural is on top; the forgery below has 6 changed pixels.', 'Tap the changed pixels on the forgery. Wrong taps cost points.', 'Find all 6 fast — time is the tiebreaker.'],
  },
  copycat: {
    name: 'Copy Cat', tagline: 'Paint the example. Closest copy wins.', color: '#FF4FD8',
    howTo: ['An example drawing appears beside your blank canvas.', 'Pick colours and paint it — drag to draw, or use Fill for big areas.', 'The copy closest to the example wins the round; speed breaks ties.'],
  },
  pixelrecall: {
    name: 'Pixel Recall', tagline: 'Remember it. Repaint it. Beat them.', color: '#34C3FF',
    howTo: ['A mural shows for 4 seconds, then hides.', 'Repaint it from memory with the palette.', 'Every correct pixel scores — finish sooner to win ties.'],
  },
};

// ---------------------------------------------------------------- Turf Wars
export type TurfLevel = { n: number; values: number[]; start: number; strokes: number; timeLimitMs: number };
export type TurfLog = { taps: { t: number; i: number }[]; done_t: number };
export function generateTurf(seed: number): TurfLevel {
  const rng = seeded(seed, 1);
  const n = 9;
  const values = Array.from({ length: n * n }, () => {
    const r = rng.next();
    return r < 0.12 ? 0 : r < 0.55 ? rng.int(1, 3) : r < 0.88 ? rng.int(4, 6) : rng.int(7, 9);
  });
  const start = Math.floor(n / 2) * n + Math.floor(n / 2);
  values[start] = 0;
  return { n, values, start, strokes: 16, timeLimitMs: 60_000 };
}
export const turfNeighbors = (n: number, i: number) => [i - n, i + n, i % n ? i - 1 : -1, i % n < n - 1 ? i + 1 : -1].filter((x) => x >= 0 && x < n * n);
export function validateTurf(seed: number, log: TurfLog): BoardResult {
  const L = generateTurf(seed);
  if (!log || !Array.isArray(log.taps) || log.taps.length > L.strokes) return bad('bad_taps');
  const t = checkTimes([...log.taps.map((x) => x.t), log.done_t], L.timeLimitMs + 2000);
  if (t) return bad(t);
  const owned = new Set([L.start]);
  let score = 0;
  for (const tap of log.taps) {
    if (!Number.isInteger(tap.i) || owned.has(tap.i) || !turfNeighbors(L.n, tap.i).some((x) => owned.has(x))) return bad('not_adjacent');
    owned.add(tap.i);
    score += L.values[tap.i];
  }
  const best = solveTurf(L).reduce((a, i) => a + L.values[i], 0);
  return { valid: true, score: score * 10, time_ms: log.done_t, quality: pct(score / Math.max(1, best)), summary: { land: score, best, strokes: log.taps.length }, flags: [] };
}
/** Greedy-plus-lookahead route (the e2e solver; also used to rate a board's best score). */
export function solveTurf(L: TurfLevel): number[] {
  const owned = new Set([L.start]);
  const out: number[] = [];
  for (let k = 0; k < L.strokes; k++) {
    let best = -1, bestV = -1;
    for (const o of owned) for (const nb of turfNeighbors(L.n, o)) {
      if (owned.has(nb)) continue;
      const look = Math.max(0, ...turfNeighbors(L.n, nb).filter((x) => !owned.has(x) && x !== nb).map((x) => L.values[x]));
      const v = L.values[nb] * 2 + look;
      if (v > bestV) { bestV = v; best = nb; }
    }
    if (best < 0) break;
    owned.add(best); out.push(best);
  }
  return out;
}

// ------------------------------------------------------------ Palette Clash
export type ClashLevel = { pigments: string[]; targets: { a: number; b: number; hex: string }[]; timeLimitMs: number };
export type ClashLog = { picks: { t: number; a: number; b: number }[]; done_t: number };
const PIGMENTS = ['#FF2E4D', '#FF8A00', '#FFE14D', '#2BD96B', '#14B8FF', '#5B3BFF', '#F5F4EF', '#1E1A2E', '#FF4FD8'];
export const mixHex = (a: string, b: string) => {
  const x = hexToRgb(a), y = hexToRgb(b);
  const m = (u: number, v: number) => Math.round((u + v) / 2).toString(16).padStart(2, '0');
  return `#${m(x[0], y[0])}${m(x[1], y[1])}${m(x[2], y[2])}`;
};
const dist = (a: string, b: string) => { const x = hexToRgb(a), y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
export function generateClash(seed: number): ClashLevel {
  const rng = seeded(seed, 2);
  const pigments = rng.shuffle(PIGMENTS.slice()).slice(0, 6);
  const pairs: [number, number][] = [];
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) pairs.push([a, b]);
  const pick = rng.shuffle(pairs).slice(0, 8);
  return { pigments, targets: pick.map(([a, b]) => ({ a, b, hex: mixHex(pigments[a], pigments[b]) })), timeLimitMs: 60_000 };
}
export function validateClash(seed: number, log: ClashLog): BoardResult {
  const L = generateClash(seed);
  if (!log || !Array.isArray(log.picks) || log.picks.length > L.targets.length) return bad('bad_picks');
  const t = checkTimes([...log.picks.map((x) => x.t), log.done_t], L.timeLimitMs + 2000);
  if (t) return bad(t);
  let score = 0, exact = 0;
  log.picks.forEach((p, k) => {
    if (![p.a, p.b].every((x) => Number.isInteger(x) && x >= 0 && x < 6)) { score -= 1000; return; }
    const d = dist(mixHex(L.pigments[p.a], L.pigments[p.b]), L.targets[k].hex);
    if (d < 1) exact++;
    score += Math.max(0, Math.round(100 - d * 0.9));
  });
  if (score < 0) return bad('bad_pigment');
  return { valid: true, score, time_ms: log.done_t, quality: pct(score / (100 * L.targets.length)), summary: { exact, swatches: log.picks.length }, flags: [] };
}

// --------------------------------------------------------- Spot the Forgery
export type ForgeryLevel = { n: number; original: number[]; forgery: number[]; changed: number[]; timeLimitMs: number };
export type ForgeryLog = { taps: { t: number; i: number }[]; done_t: number };
export function generateForgery(seed: number): ForgeryLevel {
  const rng = seeded(seed, 3);
  const n = 10;
  const pal = rng.shuffle(MURAL_COLORS.map((_, i) => i).slice(1, 8)).slice(0, 5);
  const original: number[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) original.push(pal[(Math.floor((x + rng.int(0, 1)) / 3) + Math.floor(y / 3) + (rng.chance(0.18) ? 1 : 0)) % pal.length]);
  const cells = rng.shuffle(Array.from({ length: n * n }, (_, i) => i)).slice(0, 6);
  const forgery = original.slice();
  for (const i of cells) forgery[i] = pal[(pal.indexOf(original[i]) + rng.int(1, pal.length - 1)) % pal.length];
  return { n, original, forgery, changed: cells.sort((a, b) => a - b), timeLimitMs: 45_000 };
}
export function validateForgery(seed: number, log: ForgeryLog): BoardResult {
  const L = generateForgery(seed);
  if (!log || !Array.isArray(log.taps) || log.taps.length > 40) return bad('bad_taps');
  const t = checkTimes([...log.taps.map((x) => x.t), log.done_t], L.timeLimitMs + 2000);
  if (t) return bad(t);
  const found = new Set<number>(); let wrong = 0;
  for (const tap of log.taps) {
    if (L.changed.includes(tap.i)) found.add(tap.i); else wrong++;
  }
  const score = Math.max(0, found.size * 100 - wrong * 40);
  return { valid: true, score, time_ms: log.done_t, quality: pct(score / (100 * L.changed.length)), summary: { found: found.size, of: L.changed.length, wrong }, flags: [] };
}

// ------------------------------------------------------------- Pixel Recall
export type RecallLevel = { n: number; colors: number[]; target: number[]; previewMs: number; timeLimitMs: number };
export type RecallLog = { paints: { t: number; i: number; c: number }[]; done_t: number };
export function generateRecall(seed: number): RecallLevel {
  const rng = seeded(seed, 4);
  const n = 6;
  const colors = [0, ...rng.shuffle(MURAL_COLORS.map((_, i) => i).slice(1)).slice(0, 3)];
  const target = new Array(n * n).fill(0);
  for (let s = 0; s < 7; s++) {
    const c = colors[rng.int(1, 3)];
    let x = rng.int(0, n - 1), y = rng.int(0, n - 1);
    for (let k = 0; k < rng.int(2, 5); k++) {
      target[y * n + x] = c;
      if (rng.chance(0.5)) x = Math.max(0, Math.min(n - 1, x + (rng.chance(0.5) ? 1 : -1)));
      else y = Math.max(0, Math.min(n - 1, y + (rng.chance(0.5) ? 1 : -1)));
    }
  }
  return { n, colors, target, previewMs: 4000, timeLimitMs: 40_000 };
}
export function validateRecall(seed: number, log: RecallLog): BoardResult {
  const L = generateRecall(seed);
  if (!log || !Array.isArray(log.paints) || log.paints.length > 400) return bad('bad_paints');
  const t = checkTimes([...log.paints.map((x) => x.t), log.done_t], L.previewMs + L.timeLimitMs + 2000);
  if (t) return bad(t);
  if (log.paints.some((p) => p.t < L.previewMs - 150)) return bad('painted_during_preview');
  const grid = new Array(L.n * L.n).fill(0);
  for (const p of log.paints) {
    if (!Number.isInteger(p.i) || p.i < 0 || p.i >= grid.length || !L.colors.includes(p.c)) return bad('illegal_paint');
    grid[p.i] = p.c;
  }
  // only the cells that matter count, so a blank canvas scores nothing
  const rel = grid.map((c, i) => (c !== 0 || L.target[i] !== 0 ? i : -1)).filter((i) => i >= 0);
  const correct = rel.filter((i) => grid[i] === L.target[i]).length;
  const wrong = rel.length - correct;
  const score = Math.max(0, correct * 20 - wrong * 10);
  const painted = L.target.filter((c) => c !== 0).length;
  return { valid: true, score, time_ms: log.done_t, quality: pct(score / (20 * Math.max(1, painted))), summary: { correct, cells: rel.length }, flags: [] };
}

// ----------------------------------------------------------------- Copy Cat
// A little generated drawing (a house, tree, fish, rocket…) on a 12×12 grid; both players
// paint it as closely as they can. Colours that are close but not exact get partial credit.
export type CopyLevel = { n: number; colors: number[]; target: number[]; motif: string; timeLimitMs: number };
export type CopyLog = { paints: { t: number; i: number; c: number; f?: 1 }[]; done_t: number };
type Painter = { set(x: number, y: number, c: number): void; rect(x0: number, y0: number, x1: number, y1: number, c: number): void; disc(cx: number, cy: number, r: number, c: number): void };
// colour roles: 1 main, 2 accent, 3 dark, 4 light
const MOTIFS: { name: string; draw(p: Painter, rng: ReturnType<typeof mulberry32>, c: number[]): void }[] = [
  { name: 'House', draw: (p, rng, c) => { p.rect(2, 6, 9, 11, c[1]); for (let k = 0; k < 4; k++) p.rect(1 + k, 5 - k, 10 - k, 5 - k, c[2]); p.rect(5, 8, 6, 11, c[3]); p.rect(3, 7, 3, 8, c[4]); p.rect(8, 7, 8, 8, c[4]); if (rng.chance(0.5)) p.disc(10, 1, 1, c[4]); } },
  { name: 'Tree', draw: (p, _r, c) => { p.rect(5, 7, 6, 11, c[3]); p.disc(5.5, 4.5, 3.6, c[1]); p.disc(4, 3.5, 1, c[4]); p.rect(2, 11, 9, 11, c[2]); } },
  { name: 'Flower', draw: (p, _r, c) => { p.rect(5, 6, 6, 11, c[2]); p.rect(3, 9, 4, 9, c[2]); p.rect(7, 8, 8, 8, c[2]); for (const [dx, dy] of [[0, -2], [2, 0], [0, 2], [-2, 0]]) p.disc(5.5 + dx, 3.5 + dy, 1.3, c[1]); p.disc(5.5, 3.5, 1.1, c[4]); } },
  { name: 'Fish', draw: (p, _r, c) => { p.disc(5, 6, 3.4, c[1]); for (let k = 0; k < 3; k++) p.rect(8 + k, 5 - k, 8 + k, 7 + k, c[2]); p.set(3, 5, c[3]); p.rect(4, 7, 6, 7, c[4]); } },
  { name: 'Mushroom', draw: (p, _r, c) => { p.rect(4, 7, 7, 11, c[4]); p.disc(5.5, 5, 4.2, c[1]); p.rect(1, 6, 10, 7, c[1]); p.disc(3.5, 3.8, 0.9, c[4]); p.disc(7.5, 4, 0.9, c[4]); p.rect(5, 8, 6, 9, c[3]); } },
  { name: 'Rocket', draw: (p, _r, c) => { p.rect(4, 3, 7, 9, c[4]); p.rect(5, 1, 6, 2, c[1]); p.disc(5.5, 5, 1, c[2]); p.rect(2, 7, 3, 10, c[1]); p.rect(8, 7, 9, 10, c[1]); p.rect(5, 10, 6, 11, c[2]); } },
  { name: 'Heart', draw: (p, _r, c) => { p.disc(3.8, 4, 2.4, c[1]); p.disc(7.2, 4, 2.4, c[1]); for (let k = 0; k < 5; k++) p.rect(1 + k, 5 + k, 10 - k, 5 + k, c[1]); p.set(3, 3, c[4]); p.set(4, 3, c[4]); } },
  { name: 'Sailboat', draw: (p, _r, c) => { for (let k = 0; k < 6; k++) p.rect(6 - Math.floor(k / 1.4), 1 + k, 6, 1 + k, c[4]); p.rect(7, 2, 7, 7, c[3]); p.rect(2, 8, 10, 9, c[1]); p.rect(3, 10, 9, 10, c[1]); p.rect(0, 11, 11, 11, c[2]); } },
  { name: 'Ice cream', draw: (p, _r, c) => { p.disc(5.5, 3.5, 2.8, c[1]); p.disc(4.5, 2.5, 0.8, c[4]); for (let k = 0; k < 6; k++) p.rect(3 + Math.floor(k / 2), 6 + k, 8 - Math.floor(k / 2), 6 + k, c[2]); p.set(6, 1, c[3]); } },
  { name: 'Cat', draw: (p, _r, c) => { p.disc(5.5, 6.5, 4, c[1]); p.rect(2, 1, 3, 3, c[1]); p.rect(8, 1, 9, 3, c[1]); p.set(4, 5, c[3]); p.set(7, 5, c[3]); p.set(5, 7, c[2]); p.set(6, 7, c[2]); p.rect(4, 8, 7, 8, c[3]); } },
];
export function generateCopycat(seed: number): CopyLevel {
  const rng = seeded(seed, 5);
  const n = 12;
  const pal = rng.shuffle(MURAL_COLORS.map((_, i) => i).slice(1, 8)).slice(0, 3);
  const colors = [0, pal[0], pal[1], 8, pal[2]]; // blank, main, accent, dark, light
  const target = new Array(n * n).fill(0);
  const m = rng.pick(MOTIFS);
  const ox = 0, oy = 0;
  const set = (x: number, y: number, c: number) => { x = Math.round(x) + ox; y = Math.round(y) + oy; if (x >= 0 && y >= 0 && x < n && y < n) target[y * n + x] = c; };
  const flip = rng.chance(0.5);
  const P: Painter = {
    set: (x, y, c) => set(flip ? n - 1 - x : x, y, c),
    rect: (x0, y0, x1, y1, c) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) P.set(x, y, c); },
    disc: (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3) P.set(x, y, c); },
  };
  m.draw(P, rng, colors);
  return { n, colors, target, motif: m.name, timeLimitMs: 75_000 };
}
/** Flood fill from i with colour c (4-neighbour, same colour region) — shared by the board and the validator. */
export function copyFill(grid: number[], n: number, i: number, c: number) {
  const from = grid[i];
  if (from === c) return grid;
  const out = grid.slice();
  const st = [i];
  while (st.length) {
    const k = st.pop()!;
    if (out[k] !== from) continue;
    out[k] = c;
    const x = k % n;
    if (x > 0) st.push(k - 1);
    if (x < n - 1) st.push(k + 1);
    if (k >= n) st.push(k - n);
    if (k < n * n - n) st.push(k + n);
  }
  return out;
}
/** How close a painting is to the example, 0-1 (exact colours 1, near colours partial, blank-on-blank ignored). */
export function copyCloseness(grid: number[], target: number[]) {
  let sum = 0, rel = 0;
  for (let i = 0; i < target.length; i++) {
    if (grid[i] === 0 && target[i] === 0) continue;
    rel++;
    if (grid[i] === target[i]) { sum += 1; continue; }
    if (grid[i] === 0 || target[i] === 0) continue;
    const d = dist(MURAL_COLORS[grid[i]], MURAL_COLORS[target[i]]);
    sum += Math.max(0, 0.5 - d / 400);
  }
  return rel ? sum / rel : 0;
}
export function validateCopycat(seed: number, log: CopyLog): BoardResult {
  const L = generateCopycat(seed);
  if (!log || !Array.isArray(log.paints) || log.paints.length > 800) return bad('bad_paints');
  const t = checkTimes([...log.paints.map((x) => x.t), log.done_t], L.timeLimitMs + 2000);
  if (t) return bad(t);
  let grid = new Array(L.n * L.n).fill(0);
  for (const p of log.paints) {
    if (!Number.isInteger(p.i) || p.i < 0 || p.i >= grid.length || !L.colors.includes(p.c)) return bad('illegal_paint');
    if (p.f) grid = copyFill(grid, L.n, p.i, p.c); else grid[p.i] = p.c;
  }
  const close = copyCloseness(grid, L.target);
  return { valid: true, score: Math.round(close * 1000), time_ms: log.done_t, quality: pct(close), summary: { closeness: pct(close), motif: L.motif }, flags: [] };
}

/** One board of a PvP game, by its own seed. */
export function validateBoard(game: PvpGame, seed: number, log: unknown): BoardResult {
  try {
    switch (game) {
      case 'turfwars': return validateTurf(seed, log as TurfLog);
      case 'paletteclash': return validateClash(seed, log as ClashLog);
      case 'forgery': return validateForgery(seed, log as ForgeryLog);
      case 'pixelrecall': return validateRecall(seed, log as RecallLog);
      case 'copycat': return validateCopycat(seed, log as CopyLog);
      default: return bad('unknown_game');
    }
  } catch {
    return bad('malformed_log');
  }
}

/** Round r of a match is generated from its own sub-seed. */
export const pvpRoundSeed = (seed: number, round: number) => roundSeed(seed, round);

export type PvpLog = { boards: { t0: number; log: unknown }[] };
export type PvpRound = { score: number; time_ms: number; quality: number; summary: Record<string, unknown> };
export type PvpResult = { valid: boolean; rounds: PvpRound[]; total_score: number; total_ms: number; avg_quality: number; flags: string[]; reason?: string };

/** Replay a whole PvP run (every round). The server stores the rounds and compares them with the rival's. */
export function validatePvp(game: PvpGame, seed: number, rounds: number, log: unknown): PvpResult {
  const fail = (reason: string): PvpResult => ({ valid: false, rounds: [], total_score: 0, total_ms: 0, avg_quality: 0, flags: [reason], reason });
  try {
    if (JSON.stringify(log ?? null).length > 400_000) return fail('log_too_large');
    const l = log as PvpLog;
    if (!l || !Array.isArray(l.boards) || l.boards.length !== rounds) return fail('round_count_mismatch');
    let end = 0;
    const out: PvpRound[] = [];
    for (let r = 0; r < rounds; r++) {
      const b = l.boards[r];
      if (!b || typeof b.t0 !== 'number' || !Number.isFinite(b.t0) || b.t0 < 0 || b.t0 + 250 < end) return fail('overlapping_rounds');
      const v = validateBoard(game, pvpRoundSeed(seed, r), b.log);
      if (!v.valid) return fail(`${v.reason ?? 'invalid'}_round_${r + 1}`);
      end = b.t0 + v.time_ms;
      out.push({ score: v.score, time_ms: Math.round(v.time_ms), quality: v.quality, summary: v.summary });
    }
    return {
      valid: true, rounds: out, flags: [],
      total_score: out.reduce((a, x) => a + x.score, 0), total_ms: out.reduce((a, x) => a + x.time_ms, 0),
      avg_quality: Math.round(out.reduce((a, x) => a + x.quality, 0) / Math.max(1, out.length)),
    };
  } catch {
    return fail('malformed_log');
  }
}

/** Who takes each round and the match (mirrors the server: higher score, then the faster round). */
export function decide(a: PvpRound[], b: PvpRound[]) {
  const per = a.map((x, i) => {
    const y = b[i];
    if (!y) return 'a';
    if (x.score !== y.score) return x.score > y.score ? 'a' : 'b';
    if (x.time_ms !== y.time_ms) return x.time_ms < y.time_ms ? 'a' : 'b';
    return 'tie';
  });
  const wa = per.filter((w) => w === 'a').length, wb = per.filter((w) => w === 'b').length;
  const ta = a.reduce((s, x) => s + x.score, 0), tb = b.reduce((s, x) => s + x.score, 0);
  const ma = a.reduce((s, x) => s + x.time_ms, 0), mb = b.reduce((s, x) => s + x.time_ms, 0);
  const winner = wa !== wb ? (wa > wb ? 'a' : 'b') : ta !== tb ? (ta > tb ? 'a' : 'b') : ma !== mb ? (ma < mb ? 'a' : 'b') : 'draw';
  return { per, wa, wb, winner };
}
