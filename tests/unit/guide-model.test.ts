import { describe, it, expect } from 'vitest';
import { boostPerDay, expectedRate, minigameInk, project, COMPETITORS, SECONDS_PER_MONTH, type Guide } from '../../src/guide/model';

const level_ink = Array.from({ length: 60 }, (_, i) => 6 + Math.floor(i * 0.4));
const g = (over: Record<string, any> = {}): Guide => ({
  updated_at: '', stats_at: '', stats: {} as any,
  rarities: [
    { id: 'common', name: 'Common', usd_per_second: 1e-9, ink_mult: 1, chance: 0.5, ultra: false },
    { id: 'rare', name: 'Rare', usd_per_second: 3e-9, ink_mult: 2, chance: 0.5, ultra: false },
  ],
  config: {
    economy: { acquire: { base_ink: 100 }, free_plots: 1 },
    rent: { boost: { multiplier: 20, free_per_day: 6, minutes_per_boost: 30 } },
    shiny: { enabled: true, one_in: 1000, rent_mult: 5 },
    minigames: { daily_rewarded_wins_per_game: 6, games: { a: { level_ink, ink_multiplier: 1 }, b: { level_ink, ink_multiplier: 1 } } },
    pvp: { daily_rewarded_matches: 10, games: { x: { win_ink: 10 } } },
    daily_streak: { enabled: true, ink: [70, 70, 70, 70, 70, 70, 70], day30_ink: 0 },
    ...over,
  },
});

describe('guide model', () => {
  it('expected rent counts every rarity’s chance and Shiny', () => {
    expect(expectedRate(g())).toBeCloseTo(2e-9 * (1 + 4 / 1000), 15);
  });
  it('the free boost: 6 × 30 min of ×20 → a day averages ×3.375', () => {
    expect(boostPerDay(g())).toEqual({ hours: 3, mult: 20, avg: 3.375 });
  });
  it('minigame Ink a win includes the rarity Ink bonus', () => {
    const m = minigameInk(g(), 1, 1);
    expect(m.perWin).toBeCloseTo(6 * 1.5); expect(m.games).toBe(2);
  });
  it('projections follow each game’s rules, and change when the config changes', () => {
    const [lv, tm, ae] = project(g(), 1, 10, 10);
    // LANDVAS: 10 wins (cap 12) × Ink a win + 70 streak
    const perWin = minigameInk(g()).perWin;
    expect(lv.plotsPerDay).toBeCloseTo((10 * perWin + 70) / 100);
    expect(lv.plots[0]).toBe(1);
    expect(tm.plots[0]).toBe(10); expect(tm.plotsPerDay).toBeCloseTo((10 * COMPETITORS.terramine.earn.perWin) / 100);
    expect(ae.plotsPerDay).toBeCloseTo(6 / 100);
    expect(lv.perPlotMonthly).toBeCloseTo(expectedRate(g()) * 3.375 * SECONDS_PER_MONTH);
    const cheaper = project(g({ economy: { acquire: { base_ink: 50 }, free_plots: 1 } }), 1, 10, 10)[0];
    expect(cheaper.plotsPerDay).toBeCloseTo(lv.plotsPerDay * 2);
  });
  it('LANDVAS stops counting minigame Ink past the daily cap', () => {
    const a = project(g(), 10, 5, 30)[0], b = project(g(), 20, 5, 30)[0];
    expect(a.plotsPerDay).toBe(b.plotsPerDay);
  });
});
