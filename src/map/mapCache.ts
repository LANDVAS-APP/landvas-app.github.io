// The map's tile data kept between visits. Plot and art index blocks are saved on this device with the newest map
// update they reflect; on the next visit they're used straight away and only the blocks changed since are fetched
// again (the backend replays the updates since that point). A different player, an old save, or a backend that can't
// replay updates simply starts fresh.
import { getBackend } from '../backend/backend';
import type { PlotRow } from '../backend/types';
import type { ArtIndex } from './artTiles';
import type { PlotBlocks } from './plotTiles';

const KEY = 'landvas.map-cache.v1';
const MAX_AGE = 12 * 3600_000;
const MAX_CHARS = 1_500_000;

type Saved = { uid: string; at: number; cursor: number; plots: [string, PlotRow[]][]; art: [string, [string, number][]][] };

let restored = false;

/** Fill the caches from the last visit (once per page load, before the map asks for updates). */
export function restoreMapCache(plots: PlotBlocks, art: ArtIndex): boolean {
  if (restored) return false;
  restored = true;
  const be = getBackend(), uid = be.session()?.userId;
  if (!uid || !be.mapCursor || !be.setMapCursor || be.mapCursor() !== 0) return false;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (!s || s.uid !== uid || Date.now() - s.at > MAX_AGE || !(s.cursor > 0)) return false;
    plots.restore(s.plots);
    art.restore(s.art);
    be.setMapCursor(s.cursor);
    return true;
  } catch { return false; }
}

/** Save the caches with the newest update they reflect. */
export function saveMapCache(plots: PlotBlocks, art: ArtIndex) {
  const be = getBackend(), uid = be.session()?.userId, cursor = be.mapCursor?.() ?? 0;
  if (!uid || !cursor) return;
  try {
    for (const [np, na] of [[400, 600], [150, 250], [50, 80]]) {
      const json = JSON.stringify({ uid, at: Date.now(), cursor, plots: plots.dump(np), art: art.dump(na) } satisfies Saved);
      if (json.length <= MAX_CHARS) { localStorage.setItem(KEY, json); return; }
    }
  } catch { /* storage full or blocked: next visit just loads fresh */ }
}

/** Save whenever the app goes to the background or closes. */
export function autoSaveMapCache(plots: PlotBlocks, art: ArtIndex) {
  const save = () => saveMapCache(plots, art);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}
