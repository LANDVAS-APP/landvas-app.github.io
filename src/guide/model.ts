// The numbers behind the Guide page. LANDVAS's come live from the server (game_guide); Atlas Earth's and TerraMine's are
// their published figures (sources listed in COMPETITORS). Everything here is plain maths so it can be tested.

export const SECONDS_PER_MONTH = 30 * 86_400;

export type GuideRarity = { id: string; name: string; usd_per_second: number | string; ink_mult: number | string; chance: number | string; ultra: boolean; emoji?: string | null; ability?: string | null; color?: string };
export type GuideStats = {
  days: number; players: number; active_hours: number; ink: number;
  ink_per_active_hour: number | null; ink_per_active_hour_median: number | null; ink_per_active_hour_p90: number | null;
  ink_per_active_day_median: number | null; ink_per_active_day_p90: number | null; hours_per_active_day_avg: number | null;
  by_source: Record<string, { ink: number; times: number; players: number; avg: number }>;
  plots: { owners: number; avg: number | null; median: number | null; total: number };
  minigames: { plays: number; win_rate: number | null; median_seconds: number | null };
};
export type Guide = { updated_at: string; stats_at: string; stats: GuideStats; config: Record<string, any>; rarities: GuideRarity[] };

const n = (x: unknown, d = 0) => { const v = Number(x); return Number.isFinite(v) ? v : d; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** a claim's expected base rent ($/s), counting each rarity's chance and the Shiny bonus */
export function expectedRate(g: Guide) {
  const base = g.rarities.reduce((s, r) => s + n(r.chance) * n(r.usd_per_second), 0);
  const sh = g.config.shiny;
  const shiny = sh?.enabled !== false && n(sh?.one_in) > 0 ? (n(sh?.rent_mult, 1) - 1) / n(sh.one_in) : 0;
  return base * (1 + shiny);
}
/** the expected Ink multiplier a claimed plot gives its minigame */
export function expectedInkMult(g: Guide) {
  return g.rarities.reduce((s, r) => s + n(r.chance) * n(r.ink_mult, 1), 0) || 1;
}
/** free rent boost hours a day, and the day-average multiplier it gives */
export function boostPerDay(g: Guide) {
  const b = g.config.rent?.boost ?? {};
  const hours = Math.min(24, n(b.free_per_day) * n(b.minutes_per_boost) / 60);
  const mult = n(b.multiplier, 1);
  return { hours, mult, avg: (hours * mult + (24 - hours)) / 24 };
}
export function plotPrice(g: Guide) { return n(g.config.economy?.acquire?.base_ink, 100); }

/** the classic minigames: Ink for a win at each level (averaged over the games), with the plot's expected rarity bonus */
export function minigameInk(g: Guide, from = 1, to = 34) {
  const games = Object.values(g.config.minigames?.games ?? {}).filter((x: any) => x?.enabled !== false) as any[];
  const per = games.map((x) => avg((x.level_ink ?? []).slice(from - 1, to).map(Number)) * n(x.ink_multiplier, 1));
  return { perWin: avg(per) * expectedInkMult(g), games: games.length, winsPerGamePerDay: n(g.config.minigames?.daily_rewarded_wins_per_game, Infinity) };
}
/** the daily streak's average Ink a day (a 7-day cycle, plus the day-30 bonus) */
export function streakInkPerDay(g: Guide) {
  const d = g.config.daily_streak;
  if (!d || d.enabled === false) return 0;
  return avg((d.ink ?? []).map(Number)) + n(d.day30_ink) / 30;
}
export function pvpInk(g: Guide) {
  const games = Object.values(g.config.pvp?.games ?? {}).filter((x: any) => x?.enabled !== false) as any[];
  return { perWin: avg(games.map((x) => n(x.win_ink))), perDay: n(g.config.pvp?.daily_rewarded_matches) };
}

/** the other games with a daily Ink cap (Inkborn, planets, space, the arena): how much more a day, and about how much a game */
export function otherCappedInk(g: Guide) {
  const c = g.config;
  const cap = n(c.inkborn?.daily_cap) + n(c.planets?.daily_cap_total ?? c.planets?.daily_cap) + n(c.space?.daily_cap) + n(c.arcade?.arena?.daily_ink_cap);
  const games = Object.values(c.inkborn?.games ?? {}) as any[];
  // a decent run scores about three quarters of a game's top prize
  const perGame = games.length ? avg(games.map((x) => n(x.max_ink))) * 0.75 : 15;
  return { cap, perGame };
}

// ---- Atlas Earth and TerraMine: their published numbers ----------------------------------------------------------------

export const COMPETITORS = {
  atlas: {
    name: 'Atlas Earth', emoji: '🌎', color: '#3DA5FF',
    startPlots: 1,
    plotCost: 100, // Atlas Bucks per parcel
    // Common $0.0000000011/s, Rare 0.0000000016, Epic 0.0000000022, Legendary 0.0000000044. Atlas doesn't publish its
    // rarity odds, so the Common rate is used (rarer parcels earn up to 4×).
    ratePerPlot: 0.0000000011,
    rates: [['Common', 0.0000000011], ['Rare', 0.0000000016], ['Epic', 0.0000000022], ['Legendary', 0.0000000044]] as [string, number][],
    boost: { mult: 30, hours: 6, note: '30× for an hour per ad watched, up to 6 hours a day (under 150 parcels)' },
    // free currency: 2 Atlas Bucks per shop ad (USA), one ad every 20 minutes → 6 an hour, 72 a day at most
    earn: { perHour: 6, perDayCap: 72, note: '2 Atlas Bucks per ad, one ad every 20 minutes' },
    rentToCurrency: 25, // $1 of rent → 25 Atlas Bucks
    cashout: '$5 minimum',
    sources: [
      { label: 'Atlas Earth help: parcel types and rates', url: 'https://atlasreality.helpshift.com/hc/en/3-atlas-earth/faq/313-what-are-the-different-types-of-land-parcels-and-how-much-do-they-earn/?p=android' },
      { label: 'Atlas Earth help: all the ways to earn Atlas Bucks', url: 'https://atlasreality.helpshift.com/hc/en/3-atlas-earth/faq/317-what-are-all-the-ways-i-can-earn-atlas-bucks/?p=android' },
      { label: 'Atlas Earth help: converting rent to Atlas Bucks', url: 'https://atlasreality.helpshift.com/hc/en/3-atlas-earth/faq/319-how-do-i-turn-my-earned-rent-into-atlas-bucks/?p=android' },
      { label: 'Norton: Atlas Earth boosts (up to 6 hours a day)', url: 'https://us.norton.com/blog/online-scams/atlas-earth-scam' },
      { label: 'Atlas Earth calculator: 30× boost drops to 20× at 150 parcels', url: 'https://atlasearthcalculator.com/tips.html' },
    ],
  },
  terramine: {
    name: 'TerraMine', emoji: '⛏️', color: '#FFB13D',
    startPlots: 10, // starts with 1,000 TerraBucks
    plotCost: 100, // TerraBucks per mine
    // Rock ≈ $0.002851 a month (community-measured) = $0.0000000011/s; Coal 1.5×, Gold 2×, Diamond 4×; odds 60/30/9/1
    ratePerPlot: (0.002851 / SECONDS_PER_MONTH) * (0.6 * 1 + 0.3 * 1.5 + 0.09 * 2 + 0.01 * 4),
    rates: [['Rock (60%)', 0.002851 / SECONDS_PER_MONTH], ['Coal (30%)', 1.5 * 0.002851 / SECONDS_PER_MONTH], ['Gold (9%)', 2 * 0.002851 / SECONDS_PER_MONTH], ['Diamond (1%)', 4 * 0.002851 / SECONDS_PER_MONTH]] as [string, number][],
    boost: { mult: 20, hours: 8, note: '20×, free daily boosts plus ads, stacking up to 8 hours' },
    // minigame TerraBucks per win at Easy (levels 1–34): Rock 3, Coal 5, Gold 1, Diamond 1, weighted by how common each mine is
    earn: { perWin: 0.6 * 3 + 0.3 * 5 + 0.09 * 1 + 0.01 * 1, note: '1–5 TerraBucks per minigame win at levels 1–34 (up to 20 at level 71+)' },
    rentToCurrency: 200, // $1 = 200 TB in the trading screen
    cashout: '$5 minimum (5,000 TB)',
    sources: [
      { label: 'TerraMine on Google Play (mine types, 100 TB a mine, 1,000 TB to start)', url: 'https://play.google.com/store/apps/details?id=com.terramine.app&hl=en_US' },
      { label: 'TerraMine Guide: minigame rewards rebalanced (Oct 2026) and $1 = 200 TB', url: 'https://terramineguide.com/latest-news' },
      { label: 'TerraMine Guide: mine odds 60/30/9/1 and Rock’s monthly rent', url: 'https://terramineguide.com/mine-rates' },
      { label: 'TerraMine calculator FAQ', url: 'https://terraminecalculator.com/faq' },
    ],
  },
} as const;

export type GameId = 'landvas' | 'atlas' | 'terramine';
export type Projection = { id: GameId; name: string; color: string; plots: number[]; monthly: number[]; earned: number[]; perPlotMonthly: number; plotsPerDay: number };

/** where each game gets you after `days` days of `hours` of play a day, `winsPerHour` minigame wins an hour */
export function project(g: Guide, hours: number, days: number, winsPerHour: number): Projection[] {
  const mg = minigameInk(g);
  const pv = pvpInk(g);
  const wins = hours * winsPerHour;
  // LANDVAS: classic minigame wins (with their daily cap), then PvP wins (with theirs), then the other games that have a
  // daily Ink cap (Inkborn, planets, space, the arena), plus the daily streak. Farms, businesses, arcades, realms, art and
  // invites are left out, so this is a floor, not a best case.
  const classic = Math.min(wins, mg.games * mg.winsPerGamePerDay);
  const pvpWins = Math.min(Math.max(0, wins - classic), pv.perDay);
  const oc = otherCappedInk(g);
  const other = Math.min(Math.max(0, wins - classic - pvpWins) * oc.perGame, oc.cap);
  const landvasInk = classic * mg.perWin + pvpWins * pv.perWin + other + streakInkPerDay(g);
  const b = boostPerDay(g);
  const lv = { start: n(g.config.economy?.free_plots, 1), cost: plotPrice(g), perDay: landvasInk, perPlot: expectedRate(g) * b.avg * SECONDS_PER_MONTH };

  const a = COMPETITORS.atlas;
  const atlas = { start: a.startPlots, cost: a.plotCost, perDay: Math.min(hours * a.earn.perHour, a.earn.perDayCap), perPlot: a.ratePerPlot * ((a.boost.hours * a.boost.mult + (24 - a.boost.hours)) / 24) * SECONDS_PER_MONTH };
  const t = COMPETITORS.terramine;
  const terra = { start: t.startPlots, cost: t.plotCost, perDay: wins * t.earn.perWin, perPlot: t.ratePerPlot * ((t.boost.hours * t.boost.mult + (24 - t.boost.hours)) / 24) * SECONDS_PER_MONTH };

  const run = (id: GameId, name: string, color: string, x: { start: number; cost: number; perDay: number; perPlot: number }): Projection => {
    const plots: number[] = [], monthly: number[] = [], earned: number[] = [];
    let total = 0;
    for (let d = 0; d <= days; d++) {
      const p = x.start + Math.floor((x.perDay * d) / x.cost);
      plots.push(p); monthly.push(p * x.perPlot);
      if (d > 0) total += (p * x.perPlot) / 30;
      earned.push(total);
    }
    return { id, name, color, plots, monthly, earned, perPlotMonthly: x.perPlot, plotsPerDay: x.perDay / x.cost };
  };
  return [
    run('landvas', 'LANDVAS', '#8B5CFF', lv),
    run('terramine', t.name, t.color, terra),
    run('atlas', a.name, a.color, atlas),
  ];
}
