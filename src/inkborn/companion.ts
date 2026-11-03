// Your companion: the Inkborn you starred, who roams with you — beside your explorer on the map, on
// other worlds and into the sanctuaries you visit.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../backend/api';
import type { Inkborn } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { cleanGenome, type Genome } from './genome';

export function useCompanion(): { c: Inkborn; g: Genome } | null {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me, staleTime: 60_000 });
  const c = q.data?.companion_id ? q.data.creatures.find((x) => x.id === q.data!.companion_id) ?? null : null;
  return useMemo(() => (c ? { c, g: cleanGenome(c.genome) } : null), [c?.id, c?.genome]); // eslint-disable-line react-hooks/exhaustive-deps
}
