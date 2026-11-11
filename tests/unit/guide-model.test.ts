import { describe, it, expect } from 'vitest';
import { boostPerDay, expectedRate, minigameInk, minigameInkAt, minigameCap, scoreGames, groupCaps, profiles, overtakeDay, rarityChoices, project, COMPETITORS, SECONDS_PER_MONTH, type Guide } from '../../src/guide/model';

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
  it('Ink for a level by rarity and plot level', () => {
    expect(minigameInkAt(g(), 1, 1)).toBe(6);
    expect(minigameInkAt(g(), 1, 2.25)).toBeCloseTo(13.5);
    expect(minigameInkAt(g({ minigames: { ...g().config.minigames, plot_level_bonus: 0.05 } }), 1, 1, 11)).toBeCloseTo(9);
  });
  it('the minigame cap can be switched off', () => {
    expect(minigameCap(g())).toBe(6);
    expect(minigameCap(g({ minigames: { ...g().config.minigames, limit_paid_runs: false } }))).toBe(Infinity);
    const capped = project(g(), 10, 5, 30)[0].plotsPerDay;
    const open = project(g({ minigames: { ...g().config.minigames, limit_paid_runs: false } }), 10, 5, 30)[0].plotsPerDay;
    expect(open).toBeGreaterThan(capped);
  });
  it('score games: top prize a play and Ink an hour back to back; no cap means Infinity', () => {
    const x = g({ arcade: { daily_cap: null, games: { bop: { name: 'Bop', max_ink: 10, points_per_ink: 240, per_second: 20, min_seconds: 15 } } } });
    const bop = scoreGames(x).find((q) => q.id === 'bop')!;
    expect(bop.secs).toBe(120); expect(bop.perHour).toBeCloseTo(10 * 3600 / 130);
    expect(groupCaps(x)['Arcade cabinets']).toBe(Infinity);
  });
  it('real profiles come from the measured days, and LANDVAS uses that Ink in the race', () => {
    const x = g(); x.stats = { players: 20, player_days: { p50: 400, p75: 1200, hours_p50: 1, hours_p75: 2 }, grinders: { days: 5, avg_ink: 6000, avg_hours: 5 }, top10pct: { days: 3, avg_ink: 8000, avg_hours: 6 } } as any;
    const ps = profiles(x);
    expect(ps.map((p) => p.id)).toEqual(['top', 'grinder', 'keen', 'typical']);
    const [lv, tm] = project(x, 5, 30, 30, 6000);
    expect(lv.plotsPerDay).toBe(60);
    expect(tm.currencyPerDay).toBeCloseTo(5 * 30 * COMPETITORS.terramine.earn.perWin);
    expect(overtakeDay(lv, tm)).not.toBeNull();
    const few = g(); few.stats = { players: 2 } as any;
    expect(profiles(few)).toEqual([]);
  });
  it('plot-rarity Ink: choices from real wins and each rarity, and they change minigame Ink', () => {
    const x = g(); x.stats = { players: 20, minigame_rarity: { top: { wins: 500, avg_mult: 1.8 }, all: { wins: 900, avg_mult: 1.2 } } } as any;
    const ch = rarityChoices(x);
    expect(ch.map((c) => c.id)).toEqual(['top', 'all', 'claim', 'rare']);
    expect(minigameInk(x, 1, 1, 1.8).perWin).toBeCloseTo(6 * 1.8);
    const base = project(x, 1, 5, 10, undefined, 1)[0].plotsPerDay, topMix = project(x, 1, 5, 10, undefined, 1.8)[0].plotsPerDay;
    expect(topMix).toBeGreaterThan(base);
  });
});
