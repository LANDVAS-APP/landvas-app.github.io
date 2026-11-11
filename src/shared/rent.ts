// Client-side mirror of private.rent_accrual: turns the server's settled rent
// state into a live, per-frame USD figure without polling.
export type RentBoost = {
  multiplier: number;
  until: string | null;
  active: boolean;
  remaining_seconds: number;
  minutes_per_boost: number;
  max_stack_hours: number;
  free_per_day: number;
  used_today: number;
  left_today: number;
  resets_at: string;
};

export type RentState = {
  enabled: boolean;
  currency: string;
  balance_usd: number | string;
  settled_at: string;
  live_usd: number | string;
  held_usd: number | string;
  paid_usd: number | string;
  lifetime_usd: number | string;
  rate_usd_per_second: number | string;
  max_offline_days: number;
  boost: RentBoost;
  by_rarity: Record<string, number>;
  /** Landlord plots: rent day (the 1st of each month, UTC) pays `multiplier`x their rate all day */
  /** ultra-rarity abilities: Solar/Lunar/Comet earn extra during a daily window (UTC start hour, length in hours) */
  extras?: { windows: { rate: number | string; start: number | string; len: number | string }[]; multiplier: number | string; collection_pct: number | string; shiny: number;
    /** Chaos & Phoenix: what they added before today began, today's extra rate, and today's span (they change at the daily reset) */
    daily?: { prior: number | string; rate: number | string; start: string; end: string } };
  landlord?: { rate: number | string; multiplier: number; plots: number; active: boolean; day_start: string; day_end: string; next: string };
  server_time: string;
};

/** Offset to add to Date.now() to get server time, from a response's server_time. */
export function serverOffset(serverTime: string, receivedAt = Date.now()) {
  return new Date(serverTime).getTime() - receivedAt;
}

/** Live balance at server time `nowMs`. */
export function liveRent(s: RentState, nowMs: number) {
  const settled = new Date(s.settled_at).getTime();
  const capS = (s.max_offline_days ?? 30) * 86400;
  const secs = Math.min(Math.max((nowMs - settled) / 1000, 0), capS);
  const until = s.boost?.until ? new Date(s.boost.until).getTime() : settled;
  const boosted = Math.min(Math.max((until - settled) / 1000, 0), secs);
  const rate = Number(s.rate_usd_per_second) || 0;
  const mult = Number(s.boost?.multiplier) || 1;
  const from = Math.max(settled, nowMs - capS * 1000);
  return Number(s.balance_usd) + rate * ((secs - boosted) + mult * boosted) + landlordExtra(s, from, nowMs) + windowExtra(s, from, nowMs) + dailyExtra(s, from, nowMs);
}

/** seconds of [from, to] (ms) inside a window that opens every day at `start` (UTC hours) for `len` hours —
 *  the same sum as private.window_seconds on the server */
export function windowSeconds(fromMs: number, toMs: number, start: number, len: number) {
  if (toMs <= fromMs) return 0;
  const DAY = 86400000;
  let total = 0;
  for (let d = Math.floor(fromMs / DAY) * DAY - DAY; d <= toMs; d += DAY) {
    const a = d + start * 3600000, b = a + len * 3600000;
    total += Math.max(0, Math.min(b, toMs) - Math.max(a, fromMs));
  }
  return total / 1000;
}
/** the extra Solar / Lunar / Comet rent earned over [from, to] */
export function windowExtra(s: RentState, fromMs: number, toMs: number) {
  let t = 0;
  for (const w of s.extras?.windows ?? []) t += Number(w.rate) * windowSeconds(fromMs, toMs, Number(w.start), Number(w.len));
  return t;
}
/** Chaos & Phoenix: the server's total up to the start of today, plus today's rate since then (until the day ends) */
export function dailyExtra(s: RentState, fromMs: number, toMs: number) {
  const d = s.extras?.daily;
  if (!d) return 0;
  const start = new Date(d.start).getTime(), end = new Date(d.end).getTime();
  return Number(d.prior) + Number(d.rate) * Math.max(0, (Math.min(toMs, end) - Math.max(fromMs, start)) / 1000);
}
/** is a daily window open right now? */
const inWindow = (nowMs: number, start: number, len: number) => windowSeconds(nowMs - 1000, nowMs, start, len) > 0;

/** seconds of [from, to] (ms) that fall on the 1st of a month, UTC: Landlord rent day */
export function rentDaySeconds(fromMs: number, toMs: number) {
  if (toMs <= fromMs) return 0;
  let total = 0;
  const d = new Date(fromMs);
  let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  while (m < toMs) {
    total += Math.max(0, Math.min(toMs, m + 86400_000) - Math.max(fromMs, m)) / 1000;
    const md = new Date(m); m = Date.UTC(md.getUTCFullYear(), md.getUTCMonth() + 1, 1);
  }
  return total;
}
/** what Landlord plots have earned on top, on rent days, between two times */
export function landlordExtra(s: RentState, fromMs: number, toMs: number) {
  const r = Number(s.landlord?.rate) || 0;
  return r ? r * ((Number(s.landlord?.multiplier) || 50) - 1) * rentDaySeconds(fromMs, toMs) : 0;
}
/** is it rent day right now (UTC)? */
export const isRentDay = (nowMs: number) => new Date(nowMs).getUTCDate() === 1;

/** Effective rate right now (boosted while the boost window is open). */
export function currentRate(s: RentState, nowMs: number) {
  const rate = Number(s.rate_usd_per_second) || 0;
  const until = s.boost?.until ? new Date(s.boost.until).getTime() : 0;
  const lr = isRentDay(nowMs) ? (Number(s.landlord?.rate) || 0) * ((Number(s.landlord?.multiplier) || 50) - 1) : 0;
  const wr = (s.extras?.windows ?? []).reduce((t, w) => t + (inWindow(nowMs, Number(w.start), Number(w.len)) ? Number(w.rate) : 0), 0);
  const dr = s.extras?.daily && nowMs < new Date(s.extras.daily.end).getTime() ? Number(s.extras.daily.rate) : 0;
  return (until > nowMs ? rate * (Number(s.boost.multiplier) || 1) : rate) + lr + wr + dr;
}

export function boostRemaining(s: RentState, nowMs: number) {
  const until = s.boost?.until ? new Date(s.boost.until).getTime() : 0;
  return Math.max(0, (until - nowMs) / 1000);
}

/** "$0.0000004213" — enough decimals that the last digits visibly tick. */
export function formatUsd(v: number, decimals = 10) {
  if (!Number.isFinite(v)) return '$0';
  return '$' + v.toFixed(decimals);
}

/** Rates like 0.0000000011 → "$0.0000000011/s". */
export function formatRate(perSecond: number) {
  if (!perSecond) return '$0/s';
  const digits = Math.min(14, Math.max(2, Math.ceil(-Math.log10(perSecond)) + 1));
  return '$' + perSecond.toFixed(digits) + '/s';
}

/** Rough per-period projection at the current base rate (display only; never a promise). */
export function projectUsd(perSecond: number, seconds: number) {
  return perSecond * seconds;
}

export function formatDuration(s: number) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
