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
  return Number(s.balance_usd) + rate * ((secs - boosted) + mult * boosted);
}

/** Effective rate right now (boosted while the boost window is open). */
export function currentRate(s: RentState, nowMs: number) {
  const rate = Number(s.rate_usd_per_second) || 0;
  const until = s.boost?.until ? new Date(s.boost.until).getTime() : 0;
  return until > nowMs ? rate * (Number(s.boost.multiplier) || 1) : rate;
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
