// Your plots, light: for the six new enchantments' pickers (the same cache the rest of the game uses).
import { useQuery } from '@tanstack/react-query';
import { api } from '../backend/api';
import { qk, useOnboardedMe } from '../lib/queries';
import type { PlotLite } from './craft';

export function useMyPlotsLite(): PlotLite[] {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me, staleTime: 30_000 });
  return ((q.data ?? []) as any[]).filter((p) => p.rarity !== 'enchanted' && !String(p.rarity ?? '').startsWith('crown'))
    .map((p) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, plot_type: p.plot_type, name: p.name, shiny: p.shiny, level: p.level }));
}
