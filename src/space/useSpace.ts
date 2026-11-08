// The pilot's state (rocket, where it is, any trip under way), shared by the space screens and the
// map's travel chip. A trip lands on the server when its time is up; the client just refetches then.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import type { SpaceState } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { worldOf } from './worlds';
import { poll } from '../lib/poll';

export const SPACE_KEY = ['space'] as const;

export function useSpace(enabled = true) {
  const me = useOnboardedMe();
  return useQuery({ queryKey: SPACE_KEY, queryFn: api.spaceState, enabled: !!me && enabled, staleTime: 15_000, refetchInterval: poll(60_000) });
}

/** Seconds left and progress (0..1) of the trip under way, ticking every second; refetches on landing. */
export function useFlight(s: SpaceState | undefined | null) {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const offset = s ? new Date(s.server_time).getTime() - Date.now() : 0;
  const flying = !!s?.dest && !!s.arrive_at;
  useEffect(() => {
    if (!flying) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [flying]);
  const arrive = flying ? new Date(s!.arrive_at!).getTime() : 0, depart = flying ? new Date(s!.depart_at!).getTime() : 0;
  const left = flying ? Math.max(0, (arrive - (now + offset)) / 1000) : 0;
  const progress = flying ? Math.min(1, Math.max(0, (now + offset - depart) / Math.max(1, arrive - depart))) : 0;
  const landed = flying && left <= 0;
  useEffect(() => {
    if (!landed || !s) return;
    const dest = s.dest!;
    void qc.invalidateQueries({ queryKey: SPACE_KEY }).then(() => {
      const w = worldOf(dest, s.home_seed, s.home_name);
      toast.success(dest === 'earth' ? 'Back home on Earth 🌍' : `Touchdown on ${w?.name ?? 'a new world'}! 🚀`, { description: dest === 'earth' ? undefined : 'Explore the surface and collect today’s samples.' });
    });
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps
  return { flying: flying && !landed, left, progress };
}

export const fmtLeft = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
export const placeName = (s: SpaceState, id: string | null | undefined) => (id === 'earth' || !id ? 'Earth' : worldOf(id, s.home_seed, s.home_name)?.name ?? 'deep space');
