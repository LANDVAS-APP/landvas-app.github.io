// Finding someone on the map (kept apart from the map layer so panels can use it without pulling in the map).
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { FoundExplorer } from '../backend/types';
import { useUi } from '../lib/store';
import { Z_STREET } from '../shared/grid';
import { Button } from '../ui';

/** someone to show (and open) once the map gets there: set by "Find on map" */
export const useMapFocus = create<{ id: string | null; at: number; set(id: string | null): void }>((set) => ({
  id: null, at: 0, set: (id) => set({ id, at: Date.now() }),
}));

/** what someone's explorer is up to, in a few words */
export function explorerDoing(f: Pick<FoundExplorer, 'how' | 'traveling' | 'trip' | 'vehicle'>) {
  if (f.how === 'travel') {
    const by = f.trip?.mode === 'plane' ? '✈️ flying' : f.trip?.mode === 'train' ? '🚆 on a train' : '🧭 travelling';
    if (f.traveling) return f.trip?.to ? `${by} to ${f.trip.to}` : by;
    return f.trip?.to ? `🏙️ visiting ${f.trip.to}` : '🏙️ out exploring';
  }
  return f.vehicle === 'jet' ? '🚀 jetpacking around' : f.vehicle === 'car' ? '🚗 driving around' : f.vehicle === 'bike' ? '🚲 biking around' : '🕹️ exploring';
}

/** find someone: fly the map to them (only works while they're out in the game, away from home) */
export function useFindOnMap() {
  const nav = useNavigate();
  return async (id: string, name?: string) => {
    try {
      const f = await api.findExplorer(id);
      if (!f) { toast(`${name ? `@${name}` : 'They'} can’t be found on the map right now`, { description: 'Players only show while they’re out travelling in the game — never while they’re on GPS.' }); return false; }
      useMapFocus.getState().set(id);
      useUi.getState().requestFly({ lng: f.lng, lat: f.lat, zoom: Math.max(useUi.getState().view.zoom, Z_STREET - 2) });
      nav('/world');
      return true;
    } catch (e) { toast.error(toGameError(e).message); return false; }
  };
}


/** "Find on map" — only there while they're out in the game, away from home */
export function FindOnMapButton({ playerId, username }: { playerId: string; username: string }) {
  const q = useQuery({ queryKey: ['find-explorer', playerId], queryFn: () => api.findExplorer(playerId), staleTime: 30_000 });
  const find = useFindOnMap();
  if (!q.data) return null;
  return (
    <Button variant="secondary" size="sm" className="rounded-full" data-testid="profile-find-map" onClick={() => void find(playerId, username)}>
      <MapPin className="h-4 w-4" /> Find on map · <span className="text-muted">{explorerDoing(q.data)}</span>
    </Button>
  );
}
