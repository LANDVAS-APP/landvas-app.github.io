// Star data hooks: a star's plots and paintings, and its skin made from them (cached by its revision).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../backend/api';
import { starSkin, type ArtLayer, type StarPlotRow } from './skin';
import type { StarCard } from './types';

/**
 * A star's claimed plots: all of them while there aren't too many (game_config stars.plots_full, whatever the star's
 * size), else just your own (they always come back in full: star_my_plots). Whatever happens, your own are in it.
 */
export async function loadStarPlots(card: Pick<StarCard, 'id' | 'claimed'> & { mine?: number }): Promise<StarPlotRow[]> {
  if (!card.claimed) return [];
  try { return (await api.starPlotsOf(card.id)).plots; }
  catch { return card.mine ? await api.starMyPlots(card.id).catch(() => []) : []; }
}
/** the paintings on a star (each with its picture, and the part of the star it covers) */
export async function loadArtLayers(card: Pick<StarCard, 'id' | 'art'>, limit = 24): Promise<ArtLayer[]> {
  return Promise.all(card.art.slice(0, limit).map(async (a) => { try { return (await api.starArtLayer(card.id, a.owner)) ?? a; } catch { return a; } }));
}
/** a star's skin for the sky, the preview and the shell (the whole star as a flat map) */
export async function buildStarSkin(card: StarCard, plots?: StarPlotRow[] | null, W?: number): Promise<HTMLCanvasElement> {
  const [p, layers] = await Promise.all([plots ? Promise.resolve(plots) : loadStarPlots(card), loadArtLayers(card)]);
  return starSkin(card.m, p, layers, W ?? (card.cells <= 252 ? 512 : card.cells <= 3242 ? 1024 : 2048));
}

const skins = new Map<string, HTMLCanvasElement>();
/** a star's claimed plots (see loadStarPlots) */
export function useStarPlots(card: Pick<StarCard, 'id' | 'cells' | 'claimed'> & { mine?: number } | null) {
  return useQuery({
    queryKey: ['star-plots', card?.id, card?.claimed, card?.mine ?? 0],
    queryFn: () => loadStarPlots(card!),
    enabled: !!card && card.claimed > 0,
    staleTime: 20_000,
  });
}
/** your own plots on a star, all of them (latest first) */
export function useMyStarPlots(id: number | null, mine = 1) {
  return useQuery({
    queryKey: ['star-my-plots', id, mine],
    queryFn: () => api.starMyPlots(id!),
    enabled: id != null && Number.isFinite(id) && mine > 0,
    staleTime: 10_000,
  });
}
/** a star's skin (its plots in their owners' colours and its paintings), as a flat map canvas */
export function useStarSkin(card: StarCard | null, size?: number) {
  const plots = useStarPlots(card);
  const [skin, setSkin] = useState<HTMLCanvasElement | null>(null);
  const key = card ? `${card.id}:${card.claimed}:${card.art_rev}:${card.art.map((a) => `${a.owner}.${a.rev}.${a.status}`).join(',')}:${size ?? 0}:${plots.data?.length ?? -1}` : '';
  useEffect(() => {
    if (!card || !card.claimed) { setSkin(null); return; }
    const had = skins.get(key);
    if (had) { setSkin(had); return; }
    let live = true;
    void (async () => {
      const c = await buildStarSkin(card, plots.data ?? [], size);
      if (!live) return;
      skins.set(key, c);
      if (skins.size > 24) skins.delete(skins.keys().next().value!);
      setSkin(c);
    })();
    return () => { live = false; };
  }, [key, plots.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return { plots: plots.data ?? null, skin };
}
