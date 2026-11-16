// The numbers behind the Handbook. Everything a player could ask "how much?" about comes live from the server where
// the server publishes it (game_guide: the economy, rent, minigames, Luck, Hot Zones…; world_config: the explorer and
// the rarity table; hot_zone_today: today's city). When a number isn't published, or the page is offline, the
// fallback is the game's own default — so the page never shows a blank, and a changed setting changes the page.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { api } from '../backend/api';
import type { HotZoneInfo, WorldConfig } from '../backend/types';
import type { Guide } from '../guide/model';
import { useWorld } from '../lib/queries';
import { NATIVE_APP } from '../app/buildFlags';
import { rarities, setRarities, type RarityInfo } from '../shared/rarity';

export type Ctx = {
  g: Guide | null;
  w: WorldConfig | null;
  hz: HotZoneInfo | null;
  /** live: the numbers are from the server (false while loading or offline) */
  live: boolean;
  /** the apps leave out cash-out and other games' names */
  native: boolean;
  /** a number from the live config ("rent.boost.multiplier"), or the default */
  n(path: string, d: number): number;
  /** any value from the live config */
  v<T>(path: string, d: T): T;
  /** the everyday rarities with their live chance (0–1) */
  everyday: { id: string; name: string; color: string; chance: number; usd: number; ink: number }[];
  /** every rarity the client knows (ultras, fusions, Primordials included) */
  all: RarityInfo[];
  /** the daily reset in the reader's own clock, e.g. "6:00 PM" */
  resetLocal: string;
};

function dig(o: unknown, path: string): unknown {
  let cur: any = o;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

/** "6:00 PM" — when the game's day rolls over (rent.boost.reset_hour in reset_tz), in the reader's own time zone */
export function resetTime(hour: number, tz: string) {
  try {
    // the zone's wall clock right now, read part by part, gives its offset from UTC
    const now = Date.now();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(now)).map((p) => [p.type, Number(p.value)]));
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    const offset = wall - Math.floor(now / 1000) * 1000;
    const at = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour) - offset);
    return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'} Mountain Time`;
  }
}

export function useHandbook(): Ctx {
  const guide = useQuery({ queryKey: ['game-guide'], queryFn: api.gameGuide, staleTime: 5 * 60_000, retry: 1 });
  const world = useWorld();
  const hot = useQuery({ queryKey: ['hot-zone'], queryFn: api.hotZone, staleTime: 10 * 60_000, retry: 0 });
  useEffect(() => setRarities(world.data?.rarities), [world.data?.rarities]);
  const g = guide.data ?? null;
  const w = world.data ?? null;
  const hz = hot.data ?? null;
  return useMemo<Ctx>(() => {
    const cfg = g?.config ?? {};
    const v = <T,>(path: string, d: T): T => {
      const x = dig(cfg, path);
      return (x === undefined || x === null ? d : (x as T));
    };
    const n = (path: string, d: number) => {
      const x = Number(dig(cfg, path));
      return Number.isFinite(x) && dig(cfg, path) !== null && dig(cfg, path) !== undefined ? x : d;
    };
    const all = rarities();
    const total = all.filter((r) => r.weight > 0).reduce((s, r) => s + r.weight, 0) || 1;
    const ultraShare = all.reduce((s, r) => s + (r.ppm ?? 0), 0) / 1e6;
    const everyday = g?.rarities?.length
      ? g.rarities.filter((r) => !r.ultra && Number(r.chance) > 0).map((r) => ({ id: r.id, name: r.name, color: r.color ?? '#fff', chance: Number(r.chance), usd: Number(r.usd_per_second), ink: Number(r.ink_mult) }))
      : all.filter((r) => r.weight > 0).map((r) => ({ id: r.id, name: r.name, color: r.color, chance: (r.weight / total) * (1 - ultraShare), usd: r.usd_per_second, ink: r.ink_reward_multiplier }));
    const b = (w?.rent?.boost ?? {}) as { reset_hour?: number; reset_tz?: string };
    const hour = Number(v('rent.boost.reset_hour', b.reset_hour ?? 18));
    const tz = String(v('rent.boost.reset_tz', b.reset_tz ?? 'America/Denver'));
    return { g, w, hz, live: !!g, native: NATIVE_APP, n, v, everyday, all, resetLocal: resetTime(hour, tz) };
  }, [g, w, hz]);
}

/** "35%" / "1 in 2,500" / "1 in 3 million" */
export function oddsText(p: number) {
  if (!(p > 0)) return '—';
  if (p >= 0.01) return `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
  const one = 1 / p;
  if (one >= 1e6) return `1 in ${(one / 1e6).toFixed(one >= 1e7 ? 0 : 1).replace(/\.0$/, '')} million`;
  return `1 in ${Math.round(one).toLocaleString()}`;
}
export const fmtN = (x: number, d = 0) => (Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
/** USD for tiny amounts: "$0.0000000011" per second, "$0.002" a day */
export function usd(x: number) {
  if (!Number.isFinite(x) || x === 0) return '$0';
  if (x >= 1) return `$${x.toFixed(2)}`;
  if (x >= 0.01) return `$${x.toFixed(3)}`;
  if (x >= 0.0001) return `$${x.toFixed(5)}`;
  return `$${x.toPrecision(2)}`;
}
export const perSec = (x: number) => `$${x.toFixed(Math.min(14, Math.max(2, Math.ceil(-Math.log10(x || 1)) + 1)))}`;
