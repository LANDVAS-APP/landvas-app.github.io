// The numbers behind the Guide page. LANDVAS's come live from the server (game_guide); Atlas Earth's and TerraMine's are
// their published figures (sources listed in COMPETITORS). Everything here is plain maths so it can be tested.
import { NATIVE_APP } from '../app/buildFlags';

export const SECONDS_PER_MONTH = 30 * 86_400;

export type GuideRarity = { id: string; name: string; usd_per_second: number | string; ink_mult: number | string; chance: number | string; ultra: boolean; emoji?: string | null; ability?: string | null; color?: string };
export type GuideStats = {
  days: number; players: number; active_hours: number; ink: number;
  ink_per_active_hour: number | null; ink_per_active_hour_median: number | null; ink_per_active_hour_p90: number | null;
  ink_per_active_day_median: number | null; ink_per_active_day_p90: number | null; hours_per_active_day_avg: number | null;
  by_source: Record<string, { ink: number; times: number; players: number; avg: number; per_hour?: number; p90_hour?: number; max_hour?: number }>;
  plots: { owners: number; avg: number | null; median: number | null; total: number; p90?: number | null; max?: number | null; avg_usd_per_second?: number | null };
  player_days?: { count: number; p50: number; p75: number; p90: number; p95: number; p99: number; max: number; hours_p50: number; hours_p75: number; ge_1000: number; ge_3000: number; ge_5000: number; ge_8000: number };
  top_days?: { ink: number; hours: number; span_hours: number; rewards: number; sources: Record<string, number> }[];
  grinders?: { days: number; avg_ink: number | null; avg_hours: number | null; ink_per_active_hour: number | null; p50: number | null; p90: number | null };
  top10pct?: { days: number; avg_ink: number | null; avg_hours: number | null; ink_per_active_hour: number | null };
  top_days_sources?: Record<string, number>;
  minigame_rarity?: { all?: { wins: number; avg_mult: number | null; avg_plot_level: number | null }; top?: { wins: number; avg_mult: number | null; avg_plot_level: number | null; players: number }; by_mult?: { mult: number; wins: number }[] };
  claims_per_day?: { player_days: number; avg: number | null; p50: number | null; p90: number | null; max: number | null };
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
export function minigameInk(g: Guide, from = 1, to = 34, inkMult?: number) {
  const games = Object.values(g.config.minigames?.games ?? {}).filter((x: any) => x?.enabled !== false) as any[];
  const per = games.map((x) => avg((x.level_ink ?? []).slice(from - 1, to).map(Number)) * n(x.ink_multiplier, 1));
  return { perWin: avg(per) * (inkMult ?? expectedInkMult(g)), games: games.length, winsPerGamePerDay: n(g.config.minigames?.daily_rewarded_wins_per_game, Infinity) };
}

export type RarityChoice = { id: string; name: string; mult: number; note: string };
/** which plots' Ink bonus to use for minigame wins: the average claim, what players really got, or a rarity */
export function rarityChoices(g: Guide): RarityChoice[] {
  const mr = g.stats?.minigame_rarity;
  const out: RarityChoice[] = [];
  if (mr?.top && n(mr.top.wins) >= 20 && n(mr.top.avg_mult) > 0) out.push({ id: 'top', name: 'Top players’ plots', mult: n(mr.top.avg_mult), note: `the real average rarity bonus on top players’ wins (${n(mr.top.wins).toLocaleString()} wins)` });
  if (mr?.all && n(mr.all.wins) >= 20 && n(mr.all.avg_mult) > 0) out.push({ id: 'all', name: 'All players’ plots', mult: n(mr.all.avg_mult), note: 'the real average rarity bonus on everyone’s wins' });
  out.push({ id: 'claim', name: 'An average claim', mult: expectedInkMult(g), note: 'each rarity’s chance × its Ink bonus' });
  for (const r of g.rarities.filter((x) => !x.ultra && n(x.chance) > 0 && n(x.ink_mult, 1) > 1)) out.push({ id: r.id, name: `All ${r.name}`, mult: n(r.ink_mult, 1), note: `every win on ${r.name} plots` });
  return out;
}
/** is the classic minigames' daily paid-win cap on? (an admin can switch it off) */
export function minigameCap(g: Guide) {
  const m = g.config.minigames ?? {};
  return m.limit_paid_runs === false || (g as any).config?.ink_uncapped ? Infinity : n(m.daily_rewarded_wins_per_game, 6);
}
/** Ink for clearing a level: that level's Ink (averaged over the games) × the plot's rarity bonus × its plot-level bonus */
export function minigameInkAt(g: Guide, level: number, rarityMult = 1, plotLevel = 1) {
  const m = g.config.minigames ?? {};
  const games = Object.values(m.games ?? {}).filter((x: any) => x?.enabled !== false) as any[];
  const per = games.map((x) => { const t = (x.level_ink ?? []).map(Number); return t.length ? n(t[Math.min(level, t.length) - 1]) * n(x.ink_multiplier, 1) : 0; });
  const lv = 1 + n(m.plot_level_bonus, 0.05) * (plotLevel - 1);
  return avg(per) * rarityMult * lv * n(m.ink_multiplier, 1);
}
export type PlayGame = { id: string; name: string; emoji: string; group: string; maxInk: number; secs: number; perHour: number };
/** games paid by score: the most Ink a play gives, about how long a top run takes, and Ink an hour playing back to back */
export function scoreGames(g: Guide): PlayGame[] {
  const c = g.config;
  const mk = (group: string, id: string, x: any, secsOverride?: number): PlayGame => {
    const maxInk = n(x.max_ink);
    const toMax = n(x.per_second) > 0 ? (n(x.points_per_ink) * maxInk) / n(x.per_second) : 0;
    const secs = Math.max(n(x.min_seconds), secsOverride ?? 0, toMax, 10);
    return { id, name: x.name ?? id, emoji: x.emoji ?? '', group, maxInk, secs, perHour: maxInk * 3600 / (secs + 10) };
  };
  const out: PlayGame[] = [];
  for (const [id, x] of Object.entries(c.arcade?.games ?? {}) as [string, any][]) out.push(mk('Arcade cabinets', id, x));
  for (const [id, x] of Object.entries(c.arcade?.carnival ?? {}) as [string, any][]) out.push(mk('Carnival', id, x, n(x.seconds)));
  for (const [id, x] of Object.entries(c.business?.games ?? {}) as [string, any][]) out.push(mk('Business', id, x, n(x.seconds)));
  for (const x of (c.realms?.games ?? []) as any[]) out.push(mk('Realms', `${x.realm}-${x.name}`, { ...x, name: `${x.name} (${x.realm})` }));
  for (const [id, x] of Object.entries(c.inkborn?.games ?? {}) as [string, any][]) out.push(mk('Inkborn', id, { ...x, name: id }, n(x.seconds)));
  for (const [id, x] of Object.entries(c.planets?.games ?? {}) as [string, any][]) out.push(mk('Planets', id, { ...x, name: id }, n(x.seconds)));
  return out.filter((x) => x.maxInk > 0);
}
/** each group's daily Ink cap (Infinity when there is none) */
export function groupCaps(g: Guide): Record<string, number> {
  const c = g.config;
  const cap = (v: unknown) => (c.ink_uncapped || v == null || n(v) <= 0 ? Infinity : n(v));
  return { 'Arcade cabinets': cap(c.arcade?.daily_cap), Carnival: cap(c.arcade?.daily_cap), Business: cap(c.business?.daily_cap), Realms: cap(c.realms?.daily_cap),
           Inkborn: cap(c.inkborn?.daily_cap), Planets: cap(c.planets?.daily_cap_total ?? c.planets?.daily_cap) };
}

export type Profile = { id: string; name: string; inkPerDay: number; hours: number; note: string };
/** real players' days, from the measured stats: typical, keen, grinder, top 10% */
export function profiles(g: Guide): Profile[] {
  const s = g.stats;
  const d = s.player_days;
  if (!d || n(s.players) < 5) return [];
  const rb = n(s.minigame_rarity?.top?.avg_mult);
  const out: Profile[] = [];
  if (s.top10pct && n(s.top10pct.days) > 0) out.push({ id: 'top', name: 'Top players', inkPerDay: n(s.top10pct.avg_ink), hours: n(s.top10pct.avg_hours, 3),
    note: `the average of the best tenth of days, with Ink from every source${rb > 0 ? ` (their minigame wins averaged a ×${rb.toFixed(2)} plot-rarity bonus, already counted)` : ' (plot-rarity bonuses already counted)'}` });
  if (s.grinders && n(s.grinders.days) > 0) out.push({ id: 'grinder', name: 'Grinder', inkPerDay: n(s.grinders.avg_ink), hours: n(s.grinders.avg_hours, 3), note: 'the average day with 3+ hours of play, every source' });
  out.push({ id: 'keen', name: 'Keen player', inkPerDay: n(d.p75), hours: Math.max(0.25, n(d.hours_p75, 1)), note: 'better than 3 in 4 days' });
  out.push({ id: 'typical', name: 'Typical day', inkPerDay: n(d.p50), hours: Math.max(0.25, n(d.hours_p50, 1)), note: 'the median day of play' });
  return out;
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

// (the apps leave them out: no other games are named in the app stores' builds)
const RIVALS = {
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
export const COMPETITORS = NATIVE_APP ? (null as unknown as typeof RIVALS) : RIVALS;

export type GameId = 'landvas' | 'atlas' | 'terramine';
export type Projection = { id: GameId; name: string; color: string; plots: number[]; monthly: number[]; earned: number[]; perPlotMonthly: number; plotsPerDay: number; currencyPerDay: number };

/** where each game gets you after `days` days of `hours` of play a day, `winsPerHour` minigame wins an hour */
export function project(g: Guide, hours: number, days: number, winsPerHour: number, landvasInkPerDay?: number, inkMult?: number): Projection[] {
  const mg = minigameInk(g, 1, 34, inkMult);
  const pv = pvpInk(g);
  const wins = hours * winsPerHour;
  // LANDVAS: classic minigame wins (with their daily cap), then PvP wins (with theirs), then the other games that have a
  // daily Ink cap (Inkborn, planets, space, the arena), plus the daily streak. Farms, businesses, arcades, realms, art and
  // invites are left out, so this is a floor, not a best case.
  const classic = Math.min(wins, mg.games * minigameCap(g));
  const pvpWins = Math.min(Math.max(0, wins - classic), pv.perDay);
  const oc = otherCappedInk(g);
  const other = Math.min(Math.max(0, wins - classic - pvpWins) * oc.perGame, oc.cap);
  const landvasInk = landvasInkPerDay ?? classic * mg.perWin + pvpWins * pv.perWin + other + streakInkPerDay(g);
  const b = boostPerDay(g);
  const lv = { start: n(g.config.economy?.free_plots, 1), cost: plotPrice(g), perDay: landvasInk, perPlot: expectedRate(g) * b.avg * SECONDS_PER_MONTH };


  const run = (id: GameId, name: string, color: string, x: { start: number; cost: number; perDay: number; perPlot: number }): Projection => {
    const plots: number[] = [], monthly: number[] = [], earned: number[] = [];
    let total = 0;
    for (let d = 0; d <= days; d++) {
      const p = x.start + Math.floor((x.perDay * d) / x.cost);
      plots.push(p); monthly.push(p * x.perPlot);
      if (d > 0) total += (p * x.perPlot) / 30;
      earned.push(total);
    }
    return { id, name, color, plots, monthly, earned, perPlotMonthly: x.perPlot, plotsPerDay: x.perDay / x.cost, currencyPerDay: x.perDay };
  };
  if (NATIVE_APP) return [run('landvas', 'LANDVAS', '#8B5CFF', lv)];
  const a = COMPETITORS.atlas;
  const atlas = { start: a.startPlots, cost: a.plotCost, perDay: Math.min(hours * a.earn.perHour, a.earn.perDayCap), perPlot: a.ratePerPlot * ((a.boost.hours * a.boost.mult + (24 - a.boost.hours)) / 24) * SECONDS_PER_MONTH };
  const t = COMPETITORS.terramine;
  const terra = { start: t.startPlots, cost: t.plotCost, perDay: wins * t.earn.perWin, perPlot: t.ratePerPlot * ((t.boost.hours * t.boost.mult + (24 - t.boost.hours)) / 24) * SECONDS_PER_MONTH };
  return [
    run('landvas', 'LANDVAS', '#8B5CFF', lv),
    run('terramine', t.name, t.color, terra),
    run('atlas', a.name, a.color, atlas),
  ];
}

/** the first day LANDVAS's daily rent beats another game's (null if it never does in the window; 0 if from the start) */
export function overtakeDay(lv: Projection, other: Projection) {
  for (let d = 0; d < lv.monthly.length; d++) if (lv.monthly[d] > other.monthly[d]) return d;
  return null;
}
