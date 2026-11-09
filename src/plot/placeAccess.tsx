// Bigger land opens more games: a place on one plot has a quarter of its type's games, two or three plots half,
// four or more all of them. The server enforces it; this shows it.
import { useQuery } from '@tanstack/react-query';
import { Lock, Gamepad2 } from 'lucide-react';
import { api } from '../backend/api';
import type { CanvasGroup, PlaceAccess } from '../backend/types';
import { isTier } from '../realms/estates/meta';

export type PlaceKind = 'arcade' | 'farm' | 'business' | 'realm';
export const placeAccessKey = (kind: PlaceKind, id: string) => ['place-access', kind, id] as const;

export function usePlaceAccess(kind: PlaceKind, id: string | null | undefined) {
  return useQuery({ queryKey: placeAccessKey(kind, id ?? ''), queryFn: () => api.placeAccess(kind, id!), enabled: !!id, staleTime: 30_000 });
}
/** is this game open here? (true while loading, so nothing flickers locked) */
export const isOpen = (a: PlaceAccess | undefined, game: string) => !a || !a.games.includes(game) || a.allowed.includes(game);
/** the label on a locked game: how big the land has to be */
export const lockLabel = (a: PlaceAccess | undefined, game: string) => {
  if (!a || isOpen(a, game)) return null;
  const i = a.games.indexOf(game) + 1;
  return i <= (a.next?.open ?? 0) ? `${a.next!.plots} plots` : '4 plots';
};

/** the group's place: what kind of place it is and its id (null for art canvases, habitats and the merge tiers) */
export function placeOf(g: CanvasGroup): { kind: PlaceKind; id: string } | null {
  if (!g.kind || isTier(g.kind)) return null;
  if (g.kind === 'arcade' && g.arcade_id) return { kind: 'arcade', id: g.arcade_id };
  if (g.kind === 'farm' && g.farm_id) return { kind: 'farm', id: g.farm_id };
  if (g.kind === 'business' && g.business_id) return { kind: 'business', id: g.business_id };
  if (g.realm_id && g.kind !== 'brawl') return { kind: 'realm', id: g.realm_id };
  return null;
}

/** In the plot panel: how many of the place's games are open, and what merging more opens. */
export function PlaceAccessCard({ group }: { group: CanvasGroup }) {
  const pl = placeOf(group);
  const a = usePlaceAccess(pl?.kind ?? 'arcade', pl?.id).data;
  if (!pl || !a || !a.total) return null;
  const all = a.open >= a.total;
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-3" data-testid="place-access" data-open={a.open} data-total={a.total}>
      <div className="flex items-center gap-2 text-xs font-bold"><Gamepad2 className="h-4 w-4 text-accent" /> {all ? `All ${a.total} games open` : `${a.open} of ${a.total} games open`}</div>
      <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
        {a.games.map((g, i) => <span key={g} className={i < a.open ? 'h-2.5 w-2.5 rounded-full bg-accent' : i < (a.next?.open ?? 0) ? 'h-2.5 w-2.5 rounded-full border border-accent/70' : 'h-2.5 w-2.5 rounded-full border border-line-strong'} />)}
      </div>
      {a.next && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Lock className="h-3 w-3" /> Merge to {a.next.plots} plots of this type to open {a.next.open}{a.next.open < a.total ? `, and 4 plots for all ${a.total}` : ''}.</div>}
    </div>
  );
}
