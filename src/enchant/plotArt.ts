// A plot's own drawing, as an image URL for the page (the map draws it itself through its art protocol).
import { useQuery } from '@tanstack/react-query';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { BLOCK_SIZE } from '../map/artTiles';
import { GRID_LEVEL } from '../shared/grid';

const urls = new Map<string, string>();

/** the published art on a plot (null if nothing's drawn there yet) */
export async function plotArtUrl(gx: number, gy: number): Promise<string | null> {
  const shift = Math.log2(BLOCK_SIZE);
  const bx = gx >> shift, by = gy >> shift;
  const idx = await api.artTileIndex(GRID_LEVEL, [[bx, by]]);
  const rev = (idx[`${bx}_${by}`] ?? []).find(([x, y]) => x === gx && y === gy)?.[2];
  if (!rev) return null;
  const key = `${gx}/${gy}/${rev}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const buf = await getBackend().artTile(GRID_LEVEL, gx, gy, Number(rev));
  if (!buf) return null;
  const url = URL.createObjectURL(new Blob([buf]));
  urls.set(key, url);
  return url;
}

export function usePlotArt(gx: number, gy: number, enabled = true) {
  return useQuery({ queryKey: ['plot-art-url', gx, gy], queryFn: () => plotArtUrl(gx, gy), enabled, staleTime: 120_000 }).data ?? null;
}
