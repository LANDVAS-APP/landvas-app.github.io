// Multi-round levels for single-board games (PatternShift, LightLines and the
// four art games): a level is `rounds` independent boards, each generated from
// its own sub-seed. Each board's log uses times relative to that board's start;
// t0 is the board's start, in ms since the session started.
import { checkTimes, invalid, roundsToPass, type ValidationResult } from './types';

export type BoardsLog<L = unknown> = { boards: { t0: number; log: L }[] };

export const roundSeed = (seed: number, round: number) => (Math.imul((seed ^ 0x2545f491) >>> 0, 0x9e3779b1) + round * 0x7f4a7c15) >>> 0;

/** A board's quality 0-100 (falls back to its stars when a game doesn't report one). */
const q = (v: ValidationResult) => Math.max(0, Math.min(100, Math.round(v.quality ?? (v.passed ? 40 + v.stars * 20 : 0))));

export function validateBoards<L>(
  rounds: number, seed: number, level: number, log: BoardsLog<L>,
  one: (seed: number, level: number, log: L) => ValidationResult,
): ValidationResult {
  if (!log || !Array.isArray(log.boards) || log.boards.length !== rounds) return invalid('round_count_mismatch');
  const bad = checkTimes(log.boards.map((b) => b?.t0));
  if (bad) return invalid(bad);
  let passedN = 0, score = 0, starSum = 0, end = 0;
  const flags = new Set<string>();
  const per: Record<string, unknown>[] = [];
  for (let r = 0; r < rounds; r++) {
    const b = log.boards[r];
    if (b.t0 + 250 < end) return invalid('overlapping_rounds');
    const v = one(roundSeed(seed, r), level, b.log);
    if (!v.valid) return { ...v, flags: [...v.flags, `round_${r + 1}`] };
    if (v.passed) passedN++;
    score += v.score;
    starSum += v.passed ? v.stars : 0;
    v.flags.forEach((f) => flags.add(f));
    end = b.t0 + v.min_duration_ms;
    per.push({ round: r + 1, passed: v.passed, score: v.score, stars: v.stars, quality: q(v), ...v.summary });
  }
  const passed = passedN >= roundsToPass(rounds);
  const stars = !passed ? 0 : Math.max(1, Math.min(3, Math.round(starSum / rounds))) as 1 | 2 | 3;
  return {
    valid: true, passed, score, stars, rounds_passed: passedN, rounds_total: rounds, rounds_mask: per.map((p) => !!p.passed), rounds_quality: per.map((p) => p.quality as number), summary: { rounds: per, passed_rounds: passedN, of: rounds },
    flags: [...flags], suspicious: flags.size > 0, min_duration_ms: end,
  };
}
