// Star data hooks: a star's plots and paintings, and its skin made from them (cached by its revision).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../backend/api';
import { starSkin, type StarPlotRow } from './skin';
import type { StarCard } from './types';

const skins = new Map<string, HTMLCanvasElement>();
/** a star's claimed plots (all of them, for a star small enough) */
export function useStarPlots(card: Pick<StarCard, 'id' | 'cells' | 'claimed'> | null) {
  return useQuery({
    queryKey: ['star-plots', card?.id, card?.claimed],
    queryFn: async () => (card!.cells <= 3242 ? (await api.starPlotsOf(card!.id)).plots : [] as StarPlotRow[]),
    enabled: !!card && card.claimed > 0,
    staleTime: 20_000,
  });
}
/** a star's skin (its plots in their owners' colours and its paintings), as a flat map canvas */
export function useStarSkin(card: StarCard | null, size?: number) {
  const plots = useStarPlots(card);
  const [skin, setSkin] = useState<HTMLCanvasElement | null>(null);
  const key = card ? `${card.id}:${card.claimed}:${card.art_rev}:${card.art.map((a) => `${a.owner}.${a.rev}.${a.status}`).join(',')}:${size ?? 0}` : '';
  useEffect(() => {
    if (!card || !card.claimed) { setSkin(null); return; }
    const had = skins.get(key);
    if (had) { setSkin(had); return; }
    let live = true;
    void (async () => {
      const layers = await Promise.all(card.art.slice(0, 24).map(async (a) => { try { return (await api.starArtLayer(card.id, a.owner)) ?? a; } catch { return a; } }));
      const W = size ?? (card.cells <= 252 ? 512 : card.cells <= 3242 ? 1024 : 2048);
      const c = await starSkin(card.m, plots.data ?? [], layers, W);
      if (!live) return;
      skins.set(key, c);
      if (skins.size > 24) skins.delete(skins.keys().next().value!);
      setSkin(c);
    })();
    return () => { live = false; };
  }, [key, plots.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return { plots: plots.data ?? null, skin };
}
