import { validateColorBurst, type ColorBurstLog } from './colorburst';
import { validateLightLines, type LightLinesLog } from './lightlines';
import { validatePatternShift, type PatternShiftLog } from './patternshift';
import { validateTraceCraft, type TraceCraftLog } from './tracecraft';
import { invalid, type GameId, type ValidationResult } from './types';

export * from './types';

export type AnyLog = TraceCraftLog | ColorBurstLog | PatternShiftLog | LightLinesLog;

/** Server-side entry point: regenerate the level from the session seed and replay the log. */
export function validateMinigame(game: GameId, seed: number, level: number, log: unknown): ValidationResult {
  try {
    const size = JSON.stringify(log ?? null).length;
    if (size > 400_000) return invalid('log_too_large');
    switch (game) {
      case 'tracecraft': return validateTraceCraft(seed, level, log as TraceCraftLog);
      case 'colorburst': return validateColorBurst(seed, level, log as ColorBurstLog);
      case 'patternshift': return validatePatternShift(seed, level, log as PatternShiftLog);
      case 'lightlines': return validateLightLines(seed, level, log as LightLinesLog);
      default: return invalid('unknown_game');
    }
  } catch (e) {
    return invalid('validation_error', [String((e as Error)?.message ?? e).slice(0, 80)]);
  }
}

export const GAME_INFO: Record<GameId, { name: string; plotType: string; tagline: string; howTo: string[] }> = {
  tracecraft: {
    name: 'TraceCraft', plotType: 'graphite', tagline: 'Steady hand, silver line.',
    howTo: [
      'Trace each glowing guide in a single stroke — press, draw, release.',
      'Accuracy counts most, then how much of the guide you covered, then smooth, confident movement.',
      'Clear at least 2 of 3 shapes to pass. Later levels shrink the tolerance and add spirals, stars and roses.',
    ],
  },
  colorburst: {
    name: 'ColorBurst', plotType: 'pigment', tagline: 'Mix the impossible hue.',
    howTo: [
      'Tap pigment tubes to add drops to the mixing well, then press Mix to submit.',
      'Paint mixes like real pigment: blue and yellow make green, white lightens, black deepens.',
      'Match the target within the ΔE threshold before the timer ends. Exact recipes and speed earn bonus points.',
    ],
  },
  patternshift: {
    name: 'PatternShift', plotType: 'mosaic', tagline: 'Slide the world into order.',
    howTo: [
      'Drag a row sideways or a column up/down (or use the arrows) to shift its tiles; tiles wrap around the edge.',
      'Rebuild the target mosaic shown in the corner.',
      'Finish at or under par for three stars.',
    ],
  },
  lightlines: {
    name: 'LightLines', plotType: 'lumina', tagline: 'Bend the light home.',
    howTo: [
      'Tap a mirror to flip it between / and \\. Mirrors with a lock cannot move.',
      'Guide each coloured beam from its emitter into the target of the same colour. Beams pass through each other.',
      'Blocks absorb light. Solve with as few flips as possible for three stars.',
    ],
  },
};
