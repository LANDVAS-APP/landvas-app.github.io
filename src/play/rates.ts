// Client mirror of the server's minigame pay rules (the server is authoritative):
//   level Ink — paid once for completing a level (every round cleared), from the game's level table
//   round Ink — paid for each cleared round, by its position (round 1, round 2, …)
// Both are multiplied by rarity, plot upgrades, multipliers and any boost.
import { rarityInfo } from '../shared/rarity';

export type Boost = { multiplier: number; ends_at: string | null };
type PlotLike = { rarity: any; level: number } | null | undefined;

/** The live boost on a game, if any. */
export function activeBoost(world: any, game: string): Boost | null {
  const b = world?.minigames?.games?.[game]?.boost;
  if (!b || !(Number(b.multiplier) > 1)) return null;
  if (b.ends_at && new Date(b.ends_at).getTime() <= Date.now()) return null;
  return { multiplier: Number(b.multiplier), ends_at: b.ends_at ?? null };
}

function multiplier(world: any, game: string, plot: PlotLike) {
  const mg = world?.minigames ?? {};
  const g = mg.games?.[game] ?? {};
  const upgrade = 1 + Number(g.plot_level_bonus ?? mg.plot_level_bonus ?? 0.05) * ((plot?.level ?? 1) - 1);
  return (plot ? Number(rarityInfo(plot.rarity).ink_reward_multiplier) * upgrade : 1)
    * Number(mg.ink_multiplier ?? 1) * Number(g.ink_multiplier ?? 1) * (activeBoost(world, game)?.multiplier ?? 1);
}

/** Ink for completing a level on a plot (the last table value carries on past the table's end). */
export function levelInk(world: any, game: string, level: number, plot?: PlotLike) {
  const t: number[] = world?.minigames?.games?.[game]?.level_ink ?? [];
  const base = Array.isArray(t) && t.length ? Number(t[Math.min(level, t.length) - 1] ?? 0) : 0;
  return Math.floor(base * multiplier(world, game, plot));
}

/** Ink for clearing each round position, with every multiplier. */
export function roundInk(world: any, game: string, plot?: PlotLike): number[] {
  const g = world?.minigames?.games?.[game] ?? {};
  const rounds = Math.max(1, Number(g.rounds ?? 5));
  const t: number[] = Array.isArray(g.round_ink) ? g.round_ink : [];
  const m = multiplier(world, game, plot);
  return Array.from({ length: rounds }, (_, r) => Math.floor(Number(t[r] ?? 0) * m));
}

/** Everything a full clear of a level pays (level Ink + every round's Ink). */
export function fullClearInk(world: any, game: string, level: number, plot?: PlotLike) {
  const g = world?.minigames?.games?.[game] ?? {};
  const t: number[] = Array.isArray(g.round_ink) ? g.round_ink : [];
  const rounds = Math.max(1, Number(g.rounds ?? 5));
  const roundsBase = t.slice(0, rounds).reduce((s, x) => s + Number(x || 0), 0);
  const tl: number[] = g.level_ink ?? [];
  const lvl = Array.isArray(tl) && tl.length ? Number(tl[Math.min(level, tl.length) - 1] ?? 0) : 0;
  return Math.floor((lvl + roundsBase) * multiplier(world, game, plot));
}

export function boostLeft(b: Boost) {
  if (!b.ends_at) return 'for a limited time';
  const ms = new Date(b.ends_at).getTime() - Date.now();
  const h = Math.floor(ms / 3600_000), m = Math.max(1, Math.round((ms % 3600_000) / 60_000));
  return h >= 48 ? `for ${Math.round(h / 24)} more days` : h >= 1 ? `for ${h}h ${m}m more` : `for ${m} more min`;
}
