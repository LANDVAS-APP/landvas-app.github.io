// The Leviathan as you see it = the world's view (one CDN snapshot everyone reads, world_snapshot('leviathan')) + your
// own part (leviathan_me: your bombs, damage, rank, loot, a hidden one you've spotted). Together they're exactly what
// leviathan_state gives (tests/sql/540-world-snapshots.test.ts checks it, case by case).
import type { LevState } from '../backend/api';

/** what leviathan_me answers */
export type LevMine = { server_time: string; me: LevState['me']; loot: NonNullable<LevState['last']>['loot'] | null; deep_my_dmg: number | null; lev: LevState['lev'] | null };

export function levMerge(world: LevState & { built_at?: string; snapshot?: string }, mine: LevMine | null, myId: string | null): LevState {
  const { built_at: _b, snapshot: _s, ...w } = world;
  const out: LevState = { ...w };
  out.top = w.top ? w.top.map((t) => ({ ...t, me: myId != null && t.player?.id === myId })) : w.top;
  out.me = mine?.me ?? null;
  if (w.last) out.last = { ...w.last, loot: mine?.loot ?? null };
  if (w.deep) out.deep = { ...w.deep, my_dmg: mine?.deep_my_dmg ?? null };
  if (mine?.lev) out.lev = mine.lev;
  return out;
}

/** your own part as it stands in a full state (an action's answer: a hit, a move) */
export const mineOf = (s: LevState, worldHides: boolean): LevMine => ({
  server_time: s.server_time, me: s.me, loot: s.last?.loot ?? null, deep_my_dmg: s.deep?.my_dmg ?? null,
  lev: worldHides && s.lev && !s.lev.hidden ? s.lev : null,
});

/** what changes your part (a new Leviathan, a new stage, one just ended or dove) */
export const levKey = (s: LevState) => `${s.lev?.id ?? ''}|${s.lev?.status ?? ''}|${s.last?.id ?? ''}|${s.deep?.id ?? ''}`;
