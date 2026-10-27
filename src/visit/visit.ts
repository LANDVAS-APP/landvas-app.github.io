// Visiting another player: the camera (and a ghost of your explorer) teleports
// to their land so you can watch their art live. It never moves your real
// explorer, and you can't claim or buy plots while visiting. Only land is
// public — nobody's real-world position is ever visible.
import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { LandPlot, Profile } from '../backend/types';
import { useUi } from '../lib/store';
import { GRID_SIZE, Z_HOUSE, Z_STREET, cellCenter } from '../shared/grid';
import { explorerNow, useExplorer } from '../explorer/explorer';

export type Visit = {
  player: Profile;
  plots: LandPlot[];
  center: { lng: number; lat: number };
  gx: number;
  gy: number;
  startedAt: number;
};

type Store = { visit: Visit | null; start(v: Visit): void; end(): void; setPlots(p: LandPlot[]): void };

export const useVisit = create<Store>((set) => ({
  visit: null,
  start: (visit) => set({ visit }),
  end: () => set({ visit: null }),
  setPlots: (plots) => set((s) => (s.visit ? { visit: { ...s.visit, plots } } : s)),
}));

const wrap = (gx: number) => ((gx % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;

/** Teleport to a player's land (their biggest canvas). Returns false if they have none. */
export async function visitPlayer(username: string): Promise<boolean> {
  try {
    const land = await api.playerLand(username);
    if (!land.plots.length) {
      toast(`@${land.player.username} hasn't claimed any land yet`);
      return false;
    }
    const c = land.canvases[0];
    let gx: number, gy: number;
    if (c) {
      gx = wrap(Math.floor((c.min_gx + c.max_gx) / 2));
      gy = Math.floor((c.min_gy + c.max_gy) / 2);
      // a canvas bbox centre can fall on a gap in an L-shaped canvas: snap to its nearest plot
      const inCanvas = land.plots.filter((p) => p[6] === c.id);
      if (inCanvas.length && !inCanvas.some((p) => p[0] === gx && p[1] === gy)) {
        const best = inCanvas.reduce((b, p) => (Math.abs(p[0] - gx) + Math.abs(p[1] - gy) < Math.abs(b[0] - gx) + Math.abs(b[1] - gy) ? p : b));
        gx = best[0];
        gy = best[1];
      }
    } else {
      [gx, gy] = land.plots[0];
    }
    const [lng, lat] = cellCenter(gx, gy);
    useExplorer.getState().setFollowing(false);
    useUi.getState().select(null);
    // your own land is just a fly-to; visiting (spectating) is for other players' land
    if (getBackend().session()?.userId === land.player.id) useVisit.getState().end();
    else useVisit.getState().start({ player: land.player, plots: land.plots, center: { lng, lat }, gx, gy, startedAt: Date.now() });
    const zoom = Math.max(Z_STREET, Z_HOUSE - Math.log2(Math.max(1, Math.sqrt(land.plots.length))) / 2);
    useUi.getState().requestFly({ lng, lat, zoom: Math.min(zoom, Z_HOUSE) });
    return true;
  } catch (e) {
    toast.error(toGameError(e).message);
    return false;
  }
}

/** Leave the visit and fly back to your own explorer. */
export function endVisit() {
  useVisit.getState().end();
  const { state, offset } = useExplorer.getState();
  const p = explorerNow(state, offset);
  if (p) useUi.getState().requestFly({ lng: p.lng, lat: p.lat, zoom: Math.max(useUi.getState().view.zoom, Z_STREET + 0.5) });
}

/** Refresh the visited land now and then so new claims and art show up live. */
export async function refreshVisit() {
  const v = useVisit.getState().visit;
  if (!v) return;
  try {
    const land = await api.playerLand(v.player.username);
    if (useVisit.getState().visit?.player.id === v.player.id) useVisit.getState().setPlots(land.plots);
  } catch {
    /* transient */
  }
}
