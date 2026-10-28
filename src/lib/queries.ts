// TanStack Query hooks: server state with caching and invalidation.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { MyState, NewAchievement } from '../backend/types';
import { toast } from 'sonner';

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

export const useWorld = () => useQuery({ queryKey: qk.world, queryFn: api.worldConfig, staleTime: 5 * 60_000 });
export const useMe = () =>
  useQuery({ queryKey: qk.me, queryFn: api.myState, enabled: !!getBackend().session(), staleTime: 15_000, refetchInterval: 60_000 });
export const useOnboardedMe = () => {
  const q = useMe();
  return q.data && q.data.onboarded ? (q.data as Extract<MyState, { onboarded: true }>) : null;
};

export function invalidateGame(qc: QueryClient) {
  for (const key of [qk.me, qk.groups, qk.myPlots, qk.pubs, qk.records, qk.plotProgress]) void qc.invalidateQueries({ queryKey: key });
  void qc.invalidateQueries({ queryKey: ['plot'] });
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
