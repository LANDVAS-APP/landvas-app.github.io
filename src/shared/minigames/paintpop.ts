// Paint Pop (Mosaic plots): a match-3 that paints a picture. Swap two neighbouring
// paint blobs to line up 3 or more of a colour; every popped blob splashes its colour
// onto a hidden painting. Collect the colours the painting needs before the moves run out.
//   4 in a line  → a Roller (clears its whole row, or column if the line was vertical)
//   L or T shape → a Spray (clears the 3×3 around it)
//   5 in a line  → a Colour Bomb (swap it with any blob to pop every blob of that colour)
// Everything is deterministic from the seed (new blobs come from a seeded stream), so the
// server replays the exact board the player saw.
import { MURAL_COLORS, muralPattern } from './memorymural';
import { levelSeed, mulberry32, type Rng } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export const POP_NONE = 0, POP_ROW = 1, POP_COL = 2, POP_SPRAY = 3, POP_BOMB = 4;
/** A board: colour index per cell (-1 = a colour bomb) and a power per cell. */
export type PopBoard = { n: number; k: number; color: number[]; power: number[] };
export type PaintPopLevel = {
  level: number; n: number; k: number; palette: string[]; moves: number; timeLimitMs: number;
  quota: number[]; // blobs of each colour the painting needs (0 = not needed)
  picture: number[]; pictureN: number; // the painting (colour index per pixel; -1 = canvas)
  start: PopBoard; spawnSeed: number;
};
export type PaintPopLog = { moves: { t: number; a: number; b: number }[]; done_t: number };
/** What one swap did, step by step (for animation). */
export type PopStep = { cleared: number[]; made: { i: number; power: number }[]; after: PopBoard };

const POP_COLORS = [1, 2, 3, 4, 5, 6, 7]; // indices into MURAL_COLORS (no white/black)

export function generatePaintPop(seed: number, level: number): PaintPopLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.paintpop));
  const n = level < 12 ? 7 : 8;
  const k = Math.min(6, 4 + Math.floor((level - 1) / 10));
  const palette = rng.shuffle(POP_COLORS.slice()).slice(0, k).map((i) => MURAL_COLORS[i]);
  const need = Math.min(k, 2 + Math.floor((level - 1) / 7));
  const which = rng.shuffle(Array.from({ length: k }, (_, i) => i)).slice(0, need);
  const per = Math.round(14 + Math.min(level, 60) * 0.4);
  const quota = Array.from({ length: k }, (_, i) => (which.includes(i) ? per + rng.int(0, 4) : 0));
  const total = quota.reduce((a, b) => a + b, 0);
  // a good player pops ~6 needed blobs a move; the slack shrinks as levels climb
  const slack = 1.9 - Math.min(level, 60) * 0.011;
  const moves = Math.max(8, Math.round((total / 6.8) * slack) + 2);
  const spawnSeed = (levelSeed(seed, level, GAME_SALT.paintpop + 1) ^ 0x51ed27) >>> 0;
  // the painting: a little mural in the needed colours on a pale canvas
  const pictureN = 10;
  const pic = muralPattern(rng, pictureN, [-1, ...which], rng.chance(0.6));
  const start = freshBoard(rng, n, k);
  return { level, n, k, palette, moves, timeLimitMs: 75_000 + moves * 2_500, quota, picture: pic, pictureN, start, spawnSeed };
}

function freshBoard(rng: Rng, n: number, k: number): PopBoard {
  for (let attempt = 0; attempt < 50; attempt++) {
    const color = new Array(n * n).fill(0);
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = Math.floor(i / n);
      let c = rng.int(0, k - 1);
      for (let g = 0; g < k; g++) {
        const h = x >= 2 && color[i - 1] === c && color[i - 2] === c;
        const v = y >= 2 && color[i - n] === c && color[i - 2 * n] === c;
        if (!h && !v) break;
        c = (c + 1) % k;
      }
      color[i] = c;
    }
    const b = { n, k, color, power: new Array(n * n).fill(POP_NONE) };
    if (hasMove(b)) return b;
  }
  // practically unreachable: a striped board always has moves
  return { n, k, color: Array.from({ length: n * n }, (_, i) => (i % n + Math.floor(i / n) * 2) % k), power: new Array(n * n).fill(POP_NONE) };
}

const clone = (b: PopBoard): PopBoard => ({ n: b.n, k: b.k, color: b.color.slice(), power: b.power.slice() });
export const adjacent = (n: number, a: number, b: number) => a >= 0 && b >= 0 && a < n * n && b < n * n && ((Math.abs(a - b) === 1 && Math.floor(a / n) === Math.floor(b / n)) || Math.abs(a - b) === n);

type Run = { cells: number[]; dir: 'h' | 'v'; c: number };
function runs(b: PopBoard): Run[] {
  const { n, color } = b;
  const out: Run[] = [];
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      const c = color[y * n + x];
      let e = x + 1;
      while (e < n && c >= 0 && color[y * n + e] === c) e++;
      if (c >= 0 && e - x >= 3) out.push({ cells: Array.from({ length: e - x }, (_, k) => y * n + x + k), dir: 'h', c });
      x = e;
    }
  }
  for (let x = 0; x < n; x++) {
    let y = 0;
    while (y < n) {
      const c = color[y * n + x];
      let e = y + 1;
      while (e < n && c >= 0 && color[e * n + x] === c) e++;
      if (c >= 0 && e - y >= 3) out.push({ cells: Array.from({ length: e - y }, (_, k) => (y + k) * n + x), dir: 'v', c });
      y = e;
    }
  }
  return out;
}

/** Would swapping a and b do anything? (a match, or a colour bomb) */
function swapWorks(b: PopBoard, a: number, c: number) {
  if (b.color[a] === -1 || b.color[c] === -1) return true;
  const t = clone(b);
  [t.color[a], t.color[c]] = [t.color[c], t.color[a]];
  return runs(t).length > 0;
}
export function hasMove(b: PopBoard) {
  const { n } = b;
  for (let i = 0; i < n * n; i++) {
    if (i % n < n - 1 && swapWorks(b, i, i + 1)) return true;
    if (i + n < n * n && swapWorks(b, i, i + n)) return true;
  }
  return false;
}
export function legalMoves(b: PopBoard): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < b.n * b.n; i++) {
    if (i % b.n < b.n - 1 && swapWorks(b, i, i + 1)) out.push([i, i + 1]);
    if (i + b.n < b.n * b.n && swapWorks(b, i, i + b.n)) out.push([i, i + b.n]);
  }
  return out;
}

/** Spawns new blobs in a fixed order: the same moves always give the same board. */
export class Spawner {
  private rng: Rng;
  constructor(seed: number, private k: number) { this.rng = mulberry32(seed); }
  next() { return this.rng.int(0, this.k - 1); }
  shuffle<T>(a: T[]) { return this.rng.shuffle(a); }
}

const mostCommon = (b: PopBoard) => {
  const cnt = new Array(b.k).fill(0);
  b.color.forEach((c) => { if (c >= 0) cnt[c]++; });
  return cnt.indexOf(Math.max(...cnt));
};

/**
 * Apply one swap. Returns null if it's not a legal move; otherwise every cascade step,
 * the final board and how many blobs of each colour popped.
 */
export function applySwap(board: PopBoard, a: number, c: number, spawn: Spawner): { steps: PopStep[]; board: PopBoard; popped: number[] } | null {
  if (!adjacent(board.n, a, c) || !swapWorks(board, a, c)) return null;
  const b = clone(board);
  const { n } = b;
  const popped = new Array(b.k).fill(0);
  const steps: PopStep[] = [];
  [b.color[a], b.color[c]] = [b.color[c], b.color[a]];
  [b.power[a], b.power[c]] = [b.power[c], b.power[a]];
  let first = true;
  for (let iter = 0; iter < 60; iter++) {
    const clear = new Set<number>();
    const made: { i: number; power: number }[] = [];
    if (first && (b.color[a] === -1 || b.color[c] === -1)) {
      // a colour bomb: pop every blob of the colour it was swapped with (two bombs: everything)
      const bomb = b.color[a] === -1 ? a : c, other = bomb === a ? c : a;
      const target = b.color[other];
      clear.add(bomb);
      for (let i = 0; i < n * n; i++) if (target === -1 || b.color[i] === target) clear.add(i);
    } else {
      const rs = runs(b);
      if (!rs.length) break;
      const where = new Map<number, number>();
      rs.forEach((r) => r.cells.forEach((i) => where.set(i, (where.get(i) ?? 0) + 1)));
      for (const r of rs) r.cells.forEach((i) => clear.add(i));
      // power-ups: a line of 5 → bomb (beats everything), two lines crossing (L/T) → spray, a line of 4 → roller
      const used = new Set<number>(), inBomb = new Set<number>();
      const spot = (r: Run) => (first && r.cells.includes(a) ? a : first && r.cells.includes(c) ? c : r.cells[Math.floor(r.cells.length / 2)]);
      for (const r of rs) {
        if (r.cells.length < 5) continue;
        const at = spot(r);
        if (used.has(at)) continue;
        made.push({ i: at, power: POP_BOMB });
        used.add(at);
        r.cells.forEach((i) => inBomb.add(i));
      }
      for (const [i, k] of where) if (k > 1 && !used.has(i) && !inBomb.has(i)) { made.push({ i, power: POP_SPRAY }); used.add(i); }
      for (const r of rs) {
        if (r.cells.length !== 4 || r.cells.some((i) => used.has(i))) continue;
        const at = spot(r);
        made.push({ i: at, power: r.dir === 'h' ? POP_ROW : POP_COL });
        used.add(at);
      }
    }
    // power-ups caught in a pop go off too (and can set each other off)
    const queue = [...clear];
    while (queue.length) {
      const i = queue.pop()!;
      const p = b.power[i];
      if (!p) continue;
      const x = i % n, y = Math.floor(i / n);
      const hit: number[] = [];
      if (p === POP_ROW) for (let k = 0; k < n; k++) hit.push(y * n + k);
      else if (p === POP_COL) for (let k = 0; k < n; k++) hit.push(k * n + x);
      else if (p === POP_SPRAY) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < n && y + dy >= 0 && y + dy < n) hit.push((y + dy) * n + x + dx); }
      else if (p === POP_BOMB && b.color[i] === -1 && !(first && (i === a || i === c))) { const t = mostCommon(b); for (let k = 0; k < n * n; k++) if (b.color[k] === t) hit.push(k); }
      b.power[i] = POP_NONE;
      for (const h of hit) if (!clear.has(h)) { clear.add(h); queue.push(h); }
    }
    for (const m of made) clear.delete(m.i);
    for (const i of clear) if (b.color[i] >= 0) popped[b.color[i]]++;
    for (const i of clear) { b.color[i] = -2; b.power[i] = POP_NONE; }
    for (const m of made) { b.power[m.i] = m.power; if (m.power === POP_BOMB) b.color[m.i] = -1; }
    // gravity, then new blobs from the top
    for (let x = 0; x < n; x++) {
      const col: { c: number; p: number }[] = [];
      for (let y = n - 1; y >= 0; y--) if (b.color[y * n + x] !== -2) col.push({ c: b.color[y * n + x], p: b.power[y * n + x] });
      for (let y = n - 1, k = 0; y >= 0; y--, k++) {
        const v = col[k] ?? { c: spawn.next(), p: POP_NONE };
        b.color[y * n + x] = v.c;
        b.power[y * n + x] = v.p;
      }
    }
    steps.push({ cleared: [...clear], made, after: clone(b) });
    first = false;
  }
  // no moves left: reshuffle the plain blobs (deterministically) until there are
  if (!hasMove(b)) {
    const plain = b.color.map((col, i) => (col >= 0 && !b.power[i] ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < 30; k++) {
      const cs = spawn.shuffle(plain.map((i) => b.color[i]));
      plain.forEach((i, j) => { b.color[i] = cs[j]; });
      if (!runs(b).length && hasMove(b)) break;
    }
    if (!hasMove(b) || runs(b).length) for (const i of plain) b.color[i] = spawn.next();
    steps.push({ cleared: [], made: [], after: clone(b) });
  }
  return { steps, board: b, popped };
}

export function validatePaintPop(seed: number, levelNo: number, log: PaintPopLog): ValidationResult {
  const L = generatePaintPop(seed, levelNo);
  if (!log || !Array.isArray(log.moves) || log.moves.length > L.moves) return invalid('bad_moves');
  const bad = checkTimes([...log.moves.map((m) => m.t), log.done_t], L.timeLimitMs + 5000);
  if (bad) return invalid(bad);
  const spawn = new Spawner(L.spawnSeed, L.k);
  let board = L.start;
  const got = new Array(L.k).fill(0);
  let doneAt = -1;
  for (let m = 0; m < log.moves.length; m++) {
    const mv = log.moves[m];
    if (!Number.isInteger(mv.a) || !Number.isInteger(mv.b)) return invalid('illegal_move');
    const r = applySwap(board, mv.a, mv.b, spawn);
    if (!r) return invalid('illegal_move');
    board = r.board;
    r.popped.forEach((p, i) => { got[i] += p; });
    if (doneAt < 0 && L.quota.every((q, i) => got[i] >= q)) doneAt = m + 1;
  }
  const flags: string[] = [];
  if (log.moves.length >= 4) {
    const gaps = log.moves.slice(1).map((m, k) => m.t - log.moves[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 120) flags.push('superhuman_speed');
  }
  const need = L.quota.reduce((a, b) => a + b, 0);
  const progress = L.quota.reduce((s, q, i) => s + Math.min(q, got[i]), 0) / Math.max(1, need);
  const inTime = log.done_t <= L.timeLimitMs + 1000;
  const passed = doneAt > 0 && inTime;
  const left = passed ? L.moves - doneAt : 0;
  const spare = clamp01(left / Math.max(1, L.moves * 0.45));
  const score = Math.round(progress * 500 + (passed ? 250 + spare * 300 + levelNo * 15 : 0));
  const stars = !passed ? 0 : spare >= 0.6 ? 3 : spare >= 0.25 ? 2 : 1;
  return {
    valid: true, passed, score, stars: stars as 0 | 1 | 2 | 3,
    quality: Math.round(passed ? 60 + 40 * spare : 55 * progress),
    summary: { moves: log.moves.length, of: L.moves, spare: left, progress: Math.round(progress * 100), popped: got },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t,
  };
}

/** Greedy auto-player (the e2e solver; also used to check every level can be cleared). */
export function solvePaintPop(seed: number, levelNo: number): { a: number; b: number }[] {
  const L = generatePaintPop(seed, levelNo);
  const spawn = new Spawner(L.spawnSeed, L.k);
  let board = L.start;
  const got = new Array(L.k).fill(0);
  const out: { a: number; b: number }[] = [];
  while (out.length < L.moves && !L.quota.every((q, i) => got[i] >= q)) {
    let best: [number, number] | null = null, bestV = -1;
    for (const [a, c] of legalMoves(board)) {
      // score a move on a throwaway spawner copy so the real stream isn't consumed
      const probe = new Spawner(0, L.k);
      const r = applySwap(board, a, c, probe);
      if (!r) continue;
      const v = r.popped.reduce((s, p, i) => s + (got[i] < L.quota[i] ? Math.min(p, L.quota[i] - got[i]) * 10 : 0) + p, 0)
        + r.steps.reduce((s, st) => s + st.made.length * 6, 0);
      if (v > bestV) { bestV = v; best = [a, c]; }
    }
    if (!best) break;
    const r = applySwap(board, best[0], best[1], spawn)!;
    board = r.board;
    r.popped.forEach((p, i) => { got[i] += p; });
    out.push({ a: best[0], b: best[1] });
  }
  return out;
}
