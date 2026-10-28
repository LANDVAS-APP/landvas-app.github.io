export type GameId = 'tracecraft' | 'colorburst' | 'patternshift' | 'lightlines' | 'memorymural' | 'sculptor' | 'hueflow' | 'mirrorline';
export const GAME_IDS: GameId[] = ['tracecraft', 'colorburst', 'patternshift', 'lightlines', 'memorymural', 'sculptor', 'hueflow', 'mirrorline'];

export const GAME_SALT: Record<GameId, number> = { tracecraft: 11, colorburst: 23, patternshift: 37, lightlines: 53, memorymural: 67, sculptor: 79, hueflow: 97, mirrorline: 113 };

/** Rounds per level when a session doesn't say (sessions started before rounds became configurable). */
export const DEFAULT_ROUNDS = 5;
/** Rounds a player must clear to pass a level. */
/** Every round must be cleared to beat a level (each cleared round still pays its share of Ink). */
export const roundsToPass = (rounds: number) => Math.max(1, rounds);

/** Result of replaying a move log on the server (also used client-side for instant feedback). */
export type ValidationResult = {
  valid: boolean; // log is well-formed and consistent with the generated level
  passed: boolean; // level cleared
  score: number;
  stars: 0 | 1 | 2 | 3;
  summary: Record<string, unknown>;
  flags: string[];
  suspicious: boolean; // valid but implausible for a human: rewards are held for review
  min_duration_ms: number; // the server rejects logs claiming more elapsed time than really passed
  reason?: string;
  rounds_passed?: number; // rounds cleared — the server pays Ink per cleared round
  rounds_total?: number;
};

export const invalid = (reason: string, flags: string[] = []): ValidationResult => ({
  valid: false, passed: false, score: 0, stars: 0, summary: { reason }, flags: [reason, ...flags], suspicious: false, min_duration_ms: 0, reason,
});

/** Shared timestamp sanity checks: monotonic, non-negative, bounded. */
export function checkTimes(times: number[], maxMs = 30 * 60 * 1000): string | null {
  let prev = 0;
  for (const t of times) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > maxMs) return 'bad_timestamp';
    if (t < prev) return 'non_monotonic_time';
    prev = t;
  }
  return null;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
