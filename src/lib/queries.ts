// TanStack Query hooks: server state with caching and invalidation.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, onBalances } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { MyState, NewAchievement } from '../backend/types';
import { toast } from 'sonner';
import { poll } from './poll';

export const qk = {
  world: ['world'] as const,
  me: ['me'] as const,
  plot: (gx: number, gy: number) => ['plot', gx, gy] as const,
  groups: ['groups'] as const,
  project: (id: string) => ['project', id] as const,
  versions: (id: string) => ['versions', id] as const,
  pubs: ['publications'] as const,
  records: ['records'] as const,
  plotProgress: ['plot-progress'] as const,
  myPlots: ['my-plots'] as const,
};

export const useWorld = () => useQuery({ queryKey: qk.world, queryFn: api.worldConfig, staleTime: 30 * 60_000 }); // the world's settings barely change
export const useMe = () =>
  // your balances and rent: the USD counter ticks on the phone from the rate, so this is only re-read when something you
// do changes it (those actions refresh it), as a slow safety net, and when you come back to the app after a while
useQuery({ queryKey: qk.me, queryFn: api.myState, enabled: !!getBackend().session(), staleTime: 60_000, refetchInterval: poll(90_000) });
export const useOnboardedMe = () => {
  const q = useMe();
  return q.data && q.data.onboarded ? (q.data as Extract<MyState, { onboarded: true }>) : null;
};

/**
 * After something changes your game (a purchase, a harvest, a win…): refresh what's on screen. Bursts of actions —
 * planting a row of crops, tapping a business — are folded into one refresh a moment after the last one, instead of
 * re-reading everything after every tap.
 */
let pending: { qc: QueryClient; t: ReturnType<typeof setTimeout>; first: number; me: boolean } | null = null;
const flush = (qc: QueryClient) => {
  const me = pending?.me ?? true;
  pending = null;
  // (your state is only re-read if something in the burst didn't already hand back your new balances)
  for (const key of [...(me ? [qk.me] : []), qk.groups, qk.myPlots, qk.pubs, qk.records, qk.plotProgress]) void qc.invalidateQueries({ queryKey: key });
  void qc.invalidateQueries({ queryKey: ['plot'] });
};

/**
 * Calls that change nothing in your state but your balances, and say what they became: after these the app just
 * shows the new numbers instead of re-reading everything.
 */
const BALANCE_ONLY = new Set(['farm_plant', 'farm_sell', 'planet_meteor_grab', 'planet_find', 'planet_dig', 'arcade_finish', 'realm_buy', 'realm_collect']);
let balancesAt = 0;
export function watchBalances(qc: QueryClient) {
  onBalances((fn, b) => {
    qc.setQueryData(qk.me, (old: MyState | undefined) => (old && old.onboarded ? { ...old, balances: { ...old.balances, ...b } } : old));
    if (BALANCE_ONLY.has(fn)) balancesAt = Date.now();
  });
}
export function invalidateGame(qc: QueryClient) {
  const me = Date.now() - balancesAt > 1500;
  if (pending && pending.qc === qc) {
    pending.me ||= me;
    clearTimeout(pending.t);
    if (Date.now() - pending.first > 1500) return flush(qc);
    pending.t = setTimeout(() => flush(qc), 400);
    return;
  }
  pending = { qc, first: Date.now(), me, t: setTimeout(() => flush(qc), 400) };
}

export function useInvalidate() {
  const qc = useQueryClient();
  return () => invalidateGame(qc);
}

export function celebrate(achievements: NewAchievement[] | undefined) {
  for (const a of achievements ?? []) {
    const reward = Object.entries(a.reward ?? {}).map(([k, v]) => `+${v} ${k.replace('_', ' ')}`).join(' · ');
    toast.success(`Achievement unlocked: ${a.name}`, { description: `${a.description}${reward ? ` — ${reward}` : ''}` });
  }
}
