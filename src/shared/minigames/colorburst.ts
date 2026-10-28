// ColorBurst (Pigment plots): mix paint drops to hit target colours before time runs out.
import { deltaE, hexToRgb, mixPigments, rgbToHex, type RGB } from '../color';
import { levelSeed, mulberry32 } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, roundsToPass, type ValidationResult } from './types';

export type Pigment = { id: string; name: string; hex: string };

export const PIGMENTS: Pigment[] = [
  { id: 'white', name: 'Titanium White', hex: '#F5F4EF' },
  { id: 'yellow', name: 'Cadmium Yellow', hex: '#FFCE1F' },
  { id: 'red', name: 'Cadmium Red', hex: '#E0283A' },
  { id: 'blue', name: 'Ultramarine', hex: '#2A3FB3' },
  { id: 'black', name: 'Ivory Black', hex: '#23232A' },
  { id: 'magenta', name: 'Quinacridone', hex: '#C2185B' },
  { id: 'cyan', name: 'Phthalo Turquoise', hex: '#00A3B4' },
  { id: 'orange', name: 'Pyrrole Orange', hex: '#FF7A1A' },
  { id: 'green', name: 'Phthalo Green', hex: '#0A7A55' },
  { id: 'umber', name: 'Burnt Umber', hex: '#6B3E26' },
  { id: 'violet', name: 'Dioxazine Violet', hex: '#5B2A86' },
  { id: 'ochre', name: 'Yellow Ochre', hex: '#C98E2B' },
];

export type ColorBurstRound = { target: string; recipe: number[]; parDrops: number; timeLimitMs: number };
export type ColorBurstLevel = {
  level: number;
  pigments: Pigment[];
  rounds: ColorBurstRound[];
  maxDrops: number;
  threshold: number; // ΔE needed for a match
  passRounds: number;
};
export type ColorBurstAction = { t: number; a: 'add' | 'undo' | 'clear'; p?: number };
export type ColorBurstLog = { rounds: { actions: ColorBurstAction[]; submit_t: number }[] };

const POOLS = [
  ['red', 'yellow', 'white'],
  ['red', 'yellow', 'blue'],
  ['red', 'yellow', 'blue', 'white'],
  ['red', 'yellow', 'blue', 'white', 'black'],
  ['magenta', 'yellow', 'cyan', 'white', 'black'],
  ['red', 'yellow', 'blue', 'white', 'umber', 'green'],
  ['magenta', 'orange', 'cyan', 'violet', 'white', 'ochre'],
];

export function generateColorBurst(seed: number, level: number, roundsWanted?: number): ColorBurstLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.colorburst));
  const tier = Math.min(POOLS.length - 1, Math.floor((level - 1) / 3));
  const pigments = POOLS[tier].map((id) => PIGMENTS.find((p) => p.id === id)!);
  const maxRecipe = Math.min(3 + Math.floor(level / 3), 9);
  const roundsN = roundsWanted ?? (level <= 4 ? 3 : level <= 14 ? 4 : 5);
  const timeLimitMs = Math.max(16000, 42000 - level * 1100);
  const threshold = Math.max(4, 11 - level * 0.35);
  const rgbs = pigments.map((p) => hexToRgb(p.hex));
  const rounds: ColorBurstRound[] = [];
  let guard = 0;
  while (rounds.length < roundsN && guard++ < 500) {
    const recipe = pigments.map(() => 0);
    const distinct = Math.min(pigments.length, 2 + (rng.chance(Math.min(0.15 * tier, 0.7)) ? 1 : 0) + (level > 12 && rng.chance(0.4) ? 1 : 0));
    const chosen = rng.shuffle(pigments.map((_, i) => i)).slice(0, distinct);
    let total = 0;
    for (const i of chosen) {
      recipe[i] = 1;
      total++;
    }
    const extra = rng.int(0, Math.max(0, maxRecipe - total));
    for (let k = 0; k < extra; k++) {
      recipe[rng.pick(chosen)]++;
      total++;
    }
    const target = mixPigments(rgbs, recipe);
    // reject targets indistinguishable from a single tube or from earlier rounds
    if (rgbs.some((c) => deltaE(c, target) < 9)) continue;
    if (rounds.some((r) => deltaE(hexToRgb(r.target), target) < 12)) continue;
    rounds.push({ target: rgbToHex(target), recipe, parDrops: total, timeLimitMs });
  }
  return { level, pigments, rounds, maxDrops: maxRecipe + 6, threshold, passRounds: roundsToPass(rounds.length) };
}

export function replayDrops(actions: ColorBurstAction[], pigmentCount: number, maxDrops: number): number[] | null {
  const stack: number[] = [];
  for (const a of actions) {
    if (a.a === 'add') {
      if (typeof a.p !== 'number' || a.p < 0 || a.p >= pigmentCount || !Number.isInteger(a.p)) return null;
      if (stack.length >= maxDrops) return null;
      stack.push(a.p);
    } else if (a.a === 'undo') stack.pop();
    else if (a.a === 'clear') stack.length = 0;
    else return null;
  }
  const counts = new Array(pigmentCount).fill(0);
  for (const p of stack) counts[p]++;
  return counts;
}

export function mixedColor(level: ColorBurstLevel, counts: number[]): RGB {
  return mixPigments(level.pigments.map((p) => hexToRgb(p.hex)), counts);
}

export function scoreRound(level: ColorBurstLevel, round: ColorBurstRound, counts: number[], elapsedMs: number) {
  const drops = counts.reduce((s, c) => s + c, 0);
  if (drops === 0) return { matched: false, dE: 100, score: 0 };
  const dE = deltaE(mixedColor(level, counts), hexToRgb(round.target));
  const inTime = elapsedMs <= round.timeLimitMs + 1000;
  const matched = inTime && dE <= level.threshold;
  if (!matched) return { matched, dE, score: inTime ? Math.round(clamp01(1 - dE / 40) * 40) : 0 };
  const accuracy = clamp01(1 - dE / level.threshold);
  const speed = clamp01(1 - elapsedMs / round.timeLimitMs);
  const exact = counts.every((c, i) => c === round.recipe[i]) ? 50 : 0;
  return { matched, dE, score: Math.round(120 + accuracy * 120 + speed * 100 + exact) };
}

export function validateColorBurst(seed: number, levelNo: number, log: ColorBurstLog, rounds?: number): ValidationResult {
  const level = generateColorBurst(seed, levelNo, rounds);
  if (!log || !Array.isArray(log.rounds) || log.rounds.length !== level.rounds.length) return invalid('round_count_mismatch');
  const times: number[] = [];
  for (const r of log.rounds) {
    if (!Array.isArray(r.actions) || r.actions.length > 200) return invalid('bad_actions');
    for (const a of r.actions) times.push(a.t);
    times.push(r.submit_t);
  }
  const bad = checkTimes(times);
  if (bad) return invalid(bad);
  let start = 0;
  let total = 0;
  let matched = 0;
  const flags: string[] = [];
  const perRound: { dE: number; matched: boolean; score: number; ms: number }[] = [];
  for (let i = 0; i < level.rounds.length; i++) {
    const r = log.rounds[i];
    const counts = replayDrops(r.actions, level.pigments.length, level.maxDrops);
    if (!counts) return invalid('illegal_action');
    const ms = r.submit_t - start;
    const s = scoreRound(level, level.rounds[i], counts, ms);
    if (s.matched && ms < 350 && counts.reduce((a, b) => a + b, 0) >= 2) flags.push('superhuman_speed');
    if (s.matched) matched++;
    total += s.score;
    perRound.push({ dE: Math.round(s.dE * 10) / 10, matched: s.matched, score: s.score, ms });
    start = r.submit_t;
  }
  const passed = matched >= level.passRounds;
  const ratio = matched / level.rounds.length;
  const avgDe = perRound.filter((r) => r.matched).reduce((s, r) => s + r.dE, 0) / Math.max(1, matched);
  const stars = !passed ? 0 : ratio === 1 && avgDe <= level.threshold * 0.5 ? 3 : ratio >= 0.8 ? 2 : 1;
  return {
    valid: true, passed, score: total + (passed ? levelNo * 20 : 0), stars: stars as 0 | 1 | 2 | 3,
    summary: { rounds: perRound, matched, of: level.rounds.length },
    flags, suspicious: flags.length > 0, min_duration_ms: times.length ? times[times.length - 1] : 0,
  };
}
