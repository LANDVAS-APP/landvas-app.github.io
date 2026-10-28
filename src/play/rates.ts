// Client mirror of the server's minigame pay rules (the server is authoritative).
import { rarityInfo } from '../shared/rarity';

export type Boost = { multiplier: number; ends_at: string | null };

/** The live boost on a game, if any. */
export function activeBoost(world: any, game: string): Boost | null {
  const b = world?.minigames?.games?.[game]?.boost;
  if (!b || !(Number(b.multiplier) > 1)) return null;
  if (b.ends_at && new Date(b.ends_at).getTime() <= Date.now()) return null;
  return { multiplier: Number(b.multiplier), ends_at: b.ends_at ?? null };
}

/** Ink one cleared round pays at a level on a plot, with every multiplier. */
export function inkPerRound(world: any, game: string, level: number, plot?: { rarity: any; level: number } | null) {
  const mg = world?.minigames ?? {};
  const g = mg.games?.[game] ?? {};
  const t: number[] = Array.isArray(g.level_ink) ? g.level_ink : [];
  const base = t.length ? Number(t[Math.min(level, t.length) - 1] ?? 0)
    : (Number(g.base_ink ?? mg.rewards?.base_ink ?? 20) + Number(g.ink_per_level ?? mg.rewards?.ink_per_level ?? 2) * level) / Number(g.rounds ?? 5);
  const upgrade = 1 + Number(g.plot_level_bonus ?? mg.plot_level_bonus ?? 0.05) * ((plot?.level ?? 1) - 1);
  const mult = (plot ? Number(rarityInfo(plot.rarity).ink_reward_multiplier) * upgrade : 1)
    * Number(mg.ink_multiplier ?? 1) * Number(g.ink_multiplier ?? 1) * (activeBoost(world, game)?.multiplier ?? 1);
  return Math.floor(base * mult);
}

/** All per-round bonuses for clearing every round, with the same multipliers as Ink per round. */
export function roundBonusTotal(world: any, game: string, plot?: { rarity: any; level: number } | null) {
  const mg = world?.minigames ?? {};
  const g = mg.games?.[game] ?? {};
  const b: number[] = Array.isArray(g.round_bonus) ? g.round_bonus : [];
  const rounds = Number(g.rounds ?? 5);
  const sum = b.slice(0, rounds).reduce((s, x) => s + Number(x || 0), 0);
  if (!sum) return 0;
  const upgrade = 1 + Number(g.plot_level_bonus ?? mg.plot_level_bonus ?? 0.05) * ((plot?.level ?? 1) - 1);
  const mult = (plot ? Number(rarityInfo(plot.rarity).ink_reward_multiplier) * upgrade : 1)
    * Number(mg.ink_multiplier ?? 1) * Number(g.ink_multiplier ?? 1) * (activeBoost(world, game)?.multiplier ?? 1);
  return Math.floor(sum * mult);
}

export function boostLeft(b: Boost) {
  if (!b.ends_at) return 'for a limited time';
  const ms = new Date(b.ends_at).getTime() - Date.now();
  const h = Math.floor(ms / 3600_000), m = Math.max(1, Math.round((ms % 3600_000) / 60_000));
  return h >= 48 ? `for ${Math.round(h / 24)} more days` : h >= 1 ? `for ${h}h ${m}m more` : `for ${m} more min`;
}
