// Every minigame scores each round 0-100% (bonus rules and the admin stats use it).
import { describe, expect, it } from 'vitest';
import { GAME_IDS, validateMinigame } from '../../src/shared/minigames';
import { solveMinigame } from '../helpers/solve';

describe('round quality', () => {
  for (const game of GAME_IDS) {
    it(`${game}: a solved level reports a quality for every round`, () => {
      const rounds = 3;
      const v = validateMinigame(game, 424242, 2, solveMinigame(game, 424242, 2, rounds), rounds);
      expect(v.valid).toBe(true);
      expect(v.rounds_quality).toHaveLength(rounds);
      for (const q of v.rounds_quality!) {
        expect(Number.isInteger(q)).toBe(true);
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(100);
      }
      if (v.passed) expect(Math.min(...v.rounds_quality!)).toBeGreaterThan(30);
    });
  }
});
