import { validateBoards, type BoardsLog } from './boards';
import { validateColorBurst, type ColorBurstLog } from './colorburst';
import { validateHueFlow } from './hueflow';
import { validateLightLines, type LightLinesLog } from './lightlines';
import { validateMemoryMural } from './memorymural';
import { validateMirrorline } from './mirrorline';
import { validatePatternShift, type PatternShiftLog } from './patternshift';
import { validateSculptor } from './sculptor';
import { validateTraceCraft, type TraceCraftLog } from './tracecraft';
import { invalid, type GameId, type ValidationResult } from './types';

export * from './types';

export type AnyLog = TraceCraftLog | ColorBurstLog | PatternShiftLog | LightLinesLog | BoardsLog;

/** Games whose level is a sequence of independent boards (one per round). */
export const BOARD_GAMES: GameId[] = ['patternshift', 'lightlines', 'memorymural', 'sculptor', 'hueflow', 'mirrorline'];
const ONE: Partial<Record<GameId, (seed: number, level: number, log: any) => ValidationResult>> = {
  patternshift: validatePatternShift, lightlines: validateLightLines, memorymural: validateMemoryMural,
  sculptor: validateSculptor, hueflow: validateHueFlow, mirrorline: validateMirrorline,
};

/**
 * Server-side entry point: regenerate the level from the session seed and replay the log.
 * `rounds` comes from the session (null for sessions started before rounds were configurable).
 */
export function validateMinigame(game: GameId, seed: number, level: number, log: unknown, rounds?: number | null): ValidationResult {
  try {
    const size = JSON.stringify(log ?? null).length;
    if (size > 600_000) return invalid('log_too_large');
    const r = rounds == null ? null : Math.max(1, Math.min(10, Math.floor(rounds)));
    switch (game) {
      case 'tracecraft': return validateTraceCraft(seed, level, log as TraceCraftLog, r ?? 3);
      case 'colorburst': return validateColorBurst(seed, level, log as ColorBurstLog, r ?? undefined);
    }
    const one = ONE[game];
    if (!one) return invalid('unknown_game');
    // legacy single-board sessions of the original puzzle games
    if (r == null && (game === 'patternshift' || game === 'lightlines')) return one(seed, level, log);
    return validateBoards(r ?? 5, seed, level, log as BoardsLog, one);
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
  memorymural: {
    name: 'Memory Mural', plotType: 'fresco', tagline: 'Look once. Paint it back.',
    howTo: [
      'A small pixel painting appears for a few seconds — study it.',
      'When it hides, pick colours and tap or drag across the grid to repaint it from memory.',
      'Get close enough to the original to clear the round. A perfect copy earns three stars.',
    ],
  },
  sculptor: {
    name: 'Sculptor', plotType: 'clay', tagline: 'Shape the clay to match.',
    howTo: [
      'Drag the handles around the clay in and out — neighbouring clay follows a little, just like the real thing.',
      'Match the glowing outline of the target sculpture as closely as you can.',
      'Press Done when it matches. The closer the overlap, the higher the score.',
    ],
  },
  hueflow: {
    name: 'HueFlow', plotType: 'prism', tagline: 'Put every shade in its place.',
    howTo: [
      'A smooth colour gradient has been shuffled. Tap two tiles to swap them.',
      'Tiles with a dot are pinned in the right place — use them as guides.',
      'Restore the whole gradient. Fewer swaps earn more stars.',
    ],
  },
  mirrorline: {
    name: 'Mirrorline', plotType: 'glass', tagline: 'Finish the reflection.',
    howTo: [
      'Half of a design is painted. Paint the other half as its perfect mirror image.',
      'Later levels mirror both ways — complete all four quarters.',
      'Beat the clock with an exact reflection for three stars.',
    ],
  },
};
