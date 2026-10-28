// Roller Mural (Prism plots): a mural was painted with paint rollers — every stroke
// rolls one whole row or column in a single colour, covering what was under it.
// Work out which strokes (and in which order) recreate the mural. The last stroke
// always sits on top, so the trick is to peel the mural apart from the top down.
import { MURAL_COLORS } from './memorymural';
import { levelSeed, mulberry32 } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export { MURAL_COLORS as ROLLER_COLORS };
export type RollerStroke = { t: number; axis: 'r' | 'c'; i: number; c: number };
export type RollerLog = { strokes: RollerStroke[]; done_t: number };
export type RollerLevel = { level: number; n: number; colors: number[]; base: number; target: number[]; par: number; maxStrokes: number; timeLimitMs: number };

export function rollGrid(n: number, base: number, strokes: { axis: 'r' | 'c'; i: number; c: number }[]): number[] {
  const g = new Array(n * n).fill(base);
  for (const s of strokes) {
    for (let k = 0; k < n; k++) g[s.axis === 'r' ? s.i * n + k : k * n + s.i] = s.c;
  }
  return g;
}

export function generateRollerMural(seed: number, level: number): RollerLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.rollermural));
  const n = Math.min(8, 4 + Math.floor((level - 1) / 6));
  const k = Math.min(6, 2 + Math.floor((level + 2) / 5));
  const colors = rng.shuffle(MURAL_COLORS.map((_, i) => i).slice(1)).slice(0, k);
  const base = 0;
  const want = Math.min(n * 2 + 2, 3 + Math.floor(level / 2) + Math.floor(n / 2));
  // build a stroke sequence where every stroke still shows somewhere in the end
  for (let attempt = 0; ; attempt++) {
    const seq: { axis: 'r' | 'c'; i: number; c: number }[] = [];
    let prev = '';
    while (seq.length < want) {
      const s = { axis: rng.chance(0.5) ? 'r' as const : 'c' as const, i: rng.int(0, n - 1), c: rng.pick(colors) };
      const key = `${s.axis}${s.i}`;
      if (key === prev) continue;
      prev = key;
      seq.push(s);
    }
    const target = rollGrid(n, base, seq);
    const visible = seq.every((s, j) => {
      const later = seq.slice(j + 1);
      for (let q = 0; q < n; q++) {
        const r = s.axis === 'r' ? s.i : q, c = s.axis === 'r' ? q : s.i;
        if (!later.some((l) => (l.axis === 'r' ? l.i === r : l.i === c))) return true;
      }
      return false;
    });
    if (visible || attempt >= 12) {
      return { level, n, colors, base, target, par: seq.length, maxStrokes: seq.length * 3 + 6, timeLimitMs: 60_000 + n * n * 900 };
    }
  }
}

export function validateRollerMural(seed: number, levelNo: number, log: RollerLog): ValidationResult {
  const L = generateRollerMural(seed, levelNo);
  if (!log || !Array.isArray(log.strokes) || log.strokes.length > L.maxStrokes) return invalid('bad_strokes');
  const bad = checkTimes([...log.strokes.map((s) => s.t), log.done_t]);
  if (bad) return invalid(bad);
  for (const s of log.strokes) {
    if ((s.axis !== 'r' && s.axis !== 'c') || !Number.isInteger(s.i) || s.i < 0 || s.i >= L.n || !L.colors.includes(s.c)) return invalid('illegal_stroke');
  }
  const grid = rollGrid(L.n, L.base, log.strokes);
  const correct = grid.filter((c, i) => c === L.target[i]).length;
  const solved = correct === grid.length;
  const inTime = log.done_t <= L.timeLimitMs + 1500;
  const flags: string[] = [];
  if (log.strokes.length >= 6) {
    const gaps = log.strokes.slice(1).map((s, k) => s.t - log.strokes[k].t);
    if (gaps.reduce((a, g) => a + g, 0) / gaps.length < 80) flags.push('superhuman_speed');
  }
  const passed = solved && inTime;
  const efficiency = clamp01(L.par / Math.max(1, log.strokes.length));
  const speed = clamp01(1 - log.done_t / L.timeLimitMs);
  const score = Math.round((correct / grid.length) * 400 + (passed ? 200 + efficiency * 250 + speed * 150 + levelNo * 15 : 0));
  const stars = !passed ? 0 : log.strokes.length <= L.par ? 3 : log.strokes.length <= L.par + 2 ? 2 : 1;
  return { valid: true, passed, score, stars: stars as 0 | 1 | 2 | 3, quality: Math.round(passed ? efficiency * 100 : (correct / grid.length) * 60), summary: { strokes: log.strokes.length, par: L.par, correct, cells: grid.length },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}

/** Works the mural out from the top stroke down (what a player does in their head). */
export function solveRoller(n: number, base: number, target: number[]): { axis: 'r' | 'c'; i: number; c: number }[] {
  const done = new Array(n * n).fill(false);
  const used = new Set<string>();
  const peel: { axis: 'r' | 'c'; i: number; c: number }[] = [];
  for (let guard = 0; guard < n * 4 && done.some((d, i) => !d && target[i] !== base); guard++) {
    let found = false;
    for (const axis of ['r', 'c'] as const) {
      for (let i = 0; i < n && !found; i++) {
        if (used.has(`${axis}${i}`)) continue;
        const cells = Array.from({ length: n }, (_, k) => (axis === 'r' ? i * n + k : k * n + i));
        const open = cells.filter((x) => !done[x]);
        if (!open.length) continue;
        const c = target[open[0]];
        if (c === base) continue; // untouched cells were never rolled
        if (open.every((x) => target[x] === c)) {
          peel.push({ axis, i, c }); used.add(`${axis}${i}`); cells.forEach((x) => { done[x] = true; }); found = true;
        }
      }
    }
    if (!found) break;
  }
  return peel.reverse();
}

