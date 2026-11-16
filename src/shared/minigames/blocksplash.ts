// Block Splash (Stencil plots): drop paint stencils onto an 8×8 canvas. Fill a whole row or column and it splashes
// away in a burst of colour. Stencils come three at a time; place all three to get three more. Clear the round's lines
// before the stencils won't fit any more (or the clock runs out). Clearing lines back to back builds a combo, two
// lines at once pays double, and gold paint on the canvas pays a bonus when its line splashes.
//
// Fair by construction: the stencil sequence is fixed by the seed, and the generator only keeps a tray if a careful
// player (the greedy solver below) can place all of it — so every round has a winning line. The server replays the
// move log against the same sequence.
import { levelSeed, mulberry32, type Rng } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export const N = 8;
export const GOLD = 99;
/** paint colours (indices into the board palette) */
export const SPLASH_COLORS = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#22C7FF', '#7B5CFF', '#FF4FD8'];
export type Cell = [number, number];
export type Stencil = { cells: Cell[]; w: number; h: number; color: number; name: string };
export type BlockSplashLevel = {
  level: number; n: number;
  /** -1 empty, 0..6 a colour, 99 gold paint */
  start: number[];
  pieces: Stencil[];
  goal: number;
  timeLimitMs: number;
};
export type SplashMove = { t: number; p: 0 | 1 | 2; x: number; y: number };
export type BlockSplashLog = { moves: SplashMove[]; done_t: number };

// ---- the stencils ---------------------------------------------------------------------------------------------------
const S = (name: string, rows: string[]): { name: string; cells: Cell[] } => {
  const cells: Cell[] = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') cells.push([x, y]); }));
  return { name, cells };
};
/** [stencil, from level, weight] */
const SHAPES: [{ name: string; cells: Cell[] }, number, number][] = [
  [S('dot', ['#']), 1, 5],
  [S('duo-h', ['##']), 1, 7], [S('duo-v', ['#', '#']), 1, 7],
  [S('trio-h', ['###']), 1, 7], [S('trio-v', ['#', '#', '#']), 1, 7],
  [S('square', ['##', '##']), 1, 8],
  [S('corner-a', ['##', '#.']), 1, 4], [S('corner-b', ['##', '.#']), 1, 4], [S('corner-c', ['#.', '##']), 1, 4], [S('corner-d', ['.#', '##']), 1, 4],
  [S('quad-h', ['####']), 2, 6], [S('quad-v', ['#', '#', '#', '#']), 2, 6],
  [S('ell-a', ['#.', '#.', '##']), 3, 3], [S('ell-b', ['.#', '.#', '##']), 3, 3], [S('ell-c', ['###', '#..']), 3, 3], [S('ell-d', ['###', '..#']), 3, 3],
  [S('ell-e', ['##', '#.', '#.']), 3, 3], [S('ell-f', ['##', '.#', '.#']), 3, 3], [S('ell-g', ['#..', '###']), 3, 3], [S('ell-h', ['..#', '###']), 3, 3],
  [S('tee-a', ['###', '.#.']), 4, 3], [S('tee-b', ['.#.', '###']), 4, 3], [S('tee-c', ['#.', '##', '#.']), 4, 3], [S('tee-d', ['.#', '##', '.#']), 4, 3],
  [S('zig-a', ['##.', '.##']), 5, 2], [S('zig-b', ['.##', '##.']), 5, 2], [S('zig-c', ['#.', '##', '.#']), 5, 2], [S('zig-d', ['.#', '##', '#.']), 5, 2],
  [S('slab-h', ['###', '###']), 4, 3], [S('slab-v', ['##', '##', '##']), 4, 3],
  [S('penta-h', ['#####']), 6, 3], [S('penta-v', ['#', '#', '#', '#', '#']), 6, 3],
  [S('big-ell-a', ['#..', '#..', '###']), 8, 2], [S('big-ell-b', ['..#', '..#', '###']), 8, 2], [S('big-ell-c', ['###', '#..', '#..']), 8, 2], [S('big-ell-d', ['###', '..#', '..#']), 8, 2],
  [S('block', ['###', '###', '###']), 10, 2],
];

function stencil(rng: Rng, level: number): Stencil {
  const pool = SHAPES.filter(([, from]) => from <= level);
  const total = pool.reduce((s, [, , w]) => s + w, 0);
  let x = rng.next() * total;
  let shape = pool[0][0];
  for (const [s, , w] of pool) { x -= w; if (x < 0) { shape = s; break; } }
  const w = Math.max(...shape.cells.map((c) => c[0])) + 1, h = Math.max(...shape.cells.map((c) => c[1])) + 1;
  return { cells: shape.cells, w, h, color: rng.int(0, SPLASH_COLORS.length - 1), name: shape.name };
}

// ---- the rules (shared by the game, the server and the solver) -------------------------------------------------------
export const fits = (b: number[], s: Stencil, x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + s.w <= N && y + s.h <= N && s.cells.every(([cx, cy]) => b[(y + cy) * N + x + cx] < 0);
export const fitsAnywhere = (b: number[], s: Stencil) => { for (let y = 0; y <= N - s.h; y++) for (let x = 0; x <= N - s.w; x++) if (fits(b, s, x, y)) return true; return false; };

export type Placed = { board: number[]; rows: number[]; cols: number[]; cleared: number[]; gold: number; lines: number };
/** place a stencil (it must fit): the full rows and columns splash away */
export function place(b: number[], s: Stencil, x: number, y: number): Placed {
  const board = b.slice();
  for (const [cx, cy] of s.cells) board[(y + cy) * N + x + cx] = s.color;
  const rows: number[] = [], cols: number[] = [];
  for (let r = 0; r < N; r++) { let full = true; for (let c = 0; c < N; c++) if (board[r * N + c] < 0) { full = false; break; } if (full) rows.push(r); }
  for (let c = 0; c < N; c++) { let full = true; for (let r = 0; r < N; r++) if (board[r * N + c] < 0) { full = false; break; } if (full) cols.push(c); }
  const cleared = new Set<number>();
  for (const r of rows) for (let c = 0; c < N; c++) cleared.add(r * N + c);
  for (const c of cols) for (let r = 0; r < N; r++) cleared.add(r * N + c);
  let gold = 0;
  for (const i of cleared) { if (board[i] === GOLD) gold++; board[i] = -1; }
  return { board, rows, cols, cleared: [...cleared], gold, lines: rows.length + cols.length };
}

/** points for one placement: every cell placed, then the splash (more lines at once and a combo pay more) */
export const placePoints = (cells: number, lines: number, combo: number, gold: number) =>
  cells + (lines ? lines * lines * 10 * (1 + combo * 0.5) : 0) + gold * 25;

/** the play state after any number of moves (the tray, the combo…) — the one place the rules live */
export type PlayState = { board: number[]; next: number; tray: (number | null)[]; lines: number; score: number; combo: number; best: number; since: number; multi: number; gold: number; moves: number };
export function initialState(L: BlockSplashLevel): PlayState {
  return { board: L.start.slice(), next: 3, tray: [0, 1, 2], lines: 0, score: 0, combo: 0, best: 0, since: 0, multi: 0, gold: 0, moves: 0 };
}
export function step(L: BlockSplashLevel, st: PlayState, p: number, x: number, y: number): (PlayState & { placed: Placed }) | null {
  const idx = st.tray[p];
  if (idx == null || idx >= L.pieces.length) return null;
  const s = L.pieces[idx];
  if (!fits(st.board, s, x, y)) return null;
  const placed = place(st.board, s, x, y);
  let combo = st.combo, since = st.since + 1;
  if (placed.lines) { combo = st.since <= 3 || st.lines === 0 ? combo + 1 : 1; since = 0; } else if (since > 3) combo = 0;
  const tray: (number | null)[] = st.tray.slice();
  tray[p] = null;
  let next = st.next;
  if (!tray.some((t) => t != null)) { for (let k = 0; k < 3; k++) tray[k] = next + k < L.pieces.length ? next + k : null; next += 3; }
  return {
    board: placed.board, next, tray, lines: st.lines + placed.lines, combo, best: Math.max(st.best, combo), since,
    multi: st.multi + (placed.lines >= 2 ? 1 : 0), gold: st.gold + placed.gold, moves: st.moves + 1,
    score: st.score + placePoints(s.cells.length, placed.lines, placed.lines ? combo - 1 : 0, placed.gold), placed,
  };
}
/** none of the stencils in the tray fits anywhere */
export const stuck = (L: BlockSplashLevel, st: PlayState) => st.tray.every((t) => t == null || !fitsAnywhere(st.board, L.pieces[t]));

// ---- the careful player: places the tray to clear lines and keep the board open -------------------------------------
function rate(b: number[], pl: Placed): number {
  // lines are king; then rows/columns nearly full; then fewer lonely holes
  let s = pl.lines * 1000;
  for (let r = 0; r < N; r++) { let f = 0; for (let c = 0; c < N; c++) if (pl.board[r * N + c] >= 0) f++; s += f * f; }
  for (let c = 0; c < N; c++) { let f = 0; for (let r = 0; r < N; r++) if (pl.board[r * N + c] >= 0) f++; s += f * f; }
  let holes = 0;
  for (let i = 0; i < N * N; i++) {
    if (pl.board[i] >= 0) continue;
    const x = i % N, y = Math.floor(i / N);
    const shut = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= N || ny >= N || pl.board[ny * N + nx] >= 0; });
    if (shut) holes++;
  }
  void b;
  return s - holes * 40;
}
function bestSpot(b: number[], s: Stencil): { x: number; y: number; v: number; pl: Placed } | null {
  let best: { x: number; y: number; v: number; pl: Placed } | null = null;
  for (let y = 0; y <= N - s.h; y++) for (let x = 0; x <= N - s.w; x++) {
    if (!fits(b, s, x, y)) continue;
    const pl = place(b, s, x, y), v = rate(b, pl);
    if (!best || v > best.v) best = { x, y, v, pl };
  }
  return best;
}
const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
/** place a whole tray (of stencils) as well as possible: the moves (tray slots) and the board after, or null if stuck */
function planTray(b: number[], tray: Stencil[]): { moves: { p: number; x: number; y: number }[]; board: number[]; lines: number; v: number } | null {
  let best: { moves: { p: number; x: number; y: number }[]; board: number[]; lines: number; v: number } | null = null;
  for (const ord of ORDERS) {
    if (ord.some((p) => p >= tray.length)) continue;
    let cur = b, lines = 0, v = 0;
    const moves: { p: number; x: number; y: number }[] = [];
    let ok = true;
    for (const p of ord) {
      const spot = bestSpot(cur, tray[p]);
      if (!spot) { ok = false; break; }
      moves.push({ p, x: spot.x, y: spot.y }); lines += spot.pl.lines; v += spot.v; cur = spot.pl.board;
    }
    if (!ok) continue;
    const total = v + lines * 500;
    if (!best || total > best.v) best = { moves, board: cur, lines, v: total };
  }
  return best;
}

// ---- the level --------------------------------------------------------------------------------------------------
export function generateBlockSplash(seed: number, level: number): BlockSplashLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.blocksplash));
  const start = Array(N * N).fill(-1) as number[];
  // dried paint already on the canvas (more on later levels) — never a full row or column
  const dried = level < 4 ? 0 : Math.min(14, 2 + Math.floor((level - 4) * 0.6));
  for (let k = 0, tries = 0; k < dried && tries < 400; tries++) {
    const i = rng.int(0, N * N - 1);
    if (start[i] >= 0) continue;
    start[i] = rng.int(0, SPLASH_COLORS.length - 1);
    const r = Math.floor(i / N), c = i % N;
    if ([...Array(N).keys()].every((q) => start[r * N + q] >= 0) || [...Array(N).keys()].every((q) => start[q * N + c] >= 0)) { start[i] = -1; continue; }
    k++;
  }
  // gold paint: a bonus when its line splashes
  const golds = level < 2 ? 0 : Math.min(3, 1 + Math.floor(level / 10));
  for (let k = 0, tries = 0; k < golds && tries < 200; tries++) {
    const i = rng.int(0, N * N - 1);
    if (start[i] >= 0) continue;
    start[i] = GOLD; k++;
  }
  const goal = Math.min(10, 3 + Math.floor((level - 1) / 5));
  // the stencils, three at a time; a tray is kept only if a careful player could place all of it
  const pieces: Stencil[] = [];
  let board = start.slice(), lines = 0;
  for (let t = 0; t < 40 && pieces.length < 120; t++) {
    let tray: Stencil[] = [], plan = null;
    for (let tries = 0; tries < 24 && !plan; tries++) {
      tray = [stencil(rng, tries < 16 ? level : 1), stencil(rng, tries < 16 ? level : 1), stencil(rng, tries < 20 ? level : 1)];
      plan = planTray(board, tray);
    }
    if (!plan) { tray = [0, 1, 2].map(() => ({ cells: [[0, 0]] as Cell[], w: 1, h: 1, color: rng.int(0, SPLASH_COLORS.length - 1), name: 'dot' })); plan = planTray(board, tray); }
    pieces.push(...tray);
    if (plan) { board = plan.board; lines += plan.lines; }
    if (lines >= goal + 4 && pieces.length >= 30) break;
  }
  return { level, n: N, start, pieces, goal, timeLimitMs: Math.max(60_000, 120_000 - level * 900) };
}

/** a winning move log (tests and the e2e solver): the careful player, tray by tray, until the goal */
export function solveBlockSplash(L: BlockSplashLevel): { p: 0 | 1 | 2; x: number; y: number }[] {
  let st = initialState(L);
  const out: { p: 0 | 1 | 2; x: number; y: number }[] = [];
  for (let guard = 0; guard < 200 && st.lines < L.goal; guard++) {
    const slots = st.tray.map((t, p) => ({ t, p })).filter((x) => x.t != null) as { t: number; p: number }[];
    if (!slots.length) break;
    const plan = planTray(st.board, slots.map((s) => L.pieces[s.t]));
    if (!plan) break;
    for (const m of plan.moves) {
      const p = slots[m.p].p as 0 | 1 | 2;
      const nx = step(L, st, p, m.x, m.y);
      if (!nx) return out;
      out.push({ p, x: m.x, y: m.y });
      st = nx;
      if (st.lines >= L.goal) return out;
    }
  }
  return out;
}

export function validateBlockSplash(seed: number, levelNo: number, log: BlockSplashLog): ValidationResult {
  const L = generateBlockSplash(seed, levelNo);
  if (!log || !Array.isArray(log.moves) || log.moves.length > 400) return invalid('bad_moves');
  const bad = checkTimes([...log.moves.map((m) => m?.t), log.done_t]);
  if (bad) return invalid(bad);
  let st = initialState(L);
  for (const m of log.moves) {
    if (!m || ![0, 1, 2].includes(m.p)) return invalid('illegal_move');
    const nx = step(L, st, m.p, m.x, m.y);
    if (!nx) return invalid('illegal_move');
    st = nx;
    if (st.lines >= L.goal) break;
  }
  const flags: string[] = [];
  if (log.moves.length >= 10) {
    const gaps = log.moves.slice(1).map((m, k) => m.t - log.moves[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 150) flags.push('superhuman_speed');
  }
  const inTime = log.done_t <= L.timeLimitMs + 1500;
  const passed = inTime && st.lines >= L.goal;
  const speed = clamp01(1 - log.done_t / L.timeLimitMs);
  const score = Math.round(st.score + (passed ? 120 + speed * 100 + levelNo * 12 : 0));
  const stars = !passed ? 0 : st.best >= 3 || st.multi >= 2 ? 3 : st.best >= 2 || st.multi >= 1 ? 2 : 1;
  const quality = passed ? Math.round(55 + clamp01(st.best / 4) * 25 + clamp01(st.multi / 3) * 10 + speed * 10) : Math.round(clamp01(st.lines / L.goal) * 50);
  return { valid: true, passed, score, stars: stars as 0 | 1 | 2 | 3, quality, summary: { lines: st.lines, goal: L.goal, combo: st.best, multi: st.multi, gold: st.gold, moves: st.moves },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
