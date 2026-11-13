import { toast } from 'sonner';
import { useExplorer } from '../explorer/explorer';
import { useUi } from './store';

type View = { lng: number; lat: number; zoom: number };

/** Show a place on the map: stop following your explorer first, or the map would swing straight back to it. */
export function flyAway(v: View) {
  const ex = useExplorer.getState();
  if (ex.following) ex.setFollowing(false);
  useUi.getState().requestFly(v);
}

/** Going to the map from a sheet or a screen ("show me on the map"). Simple mode has no map, so the tap that asked for
 * the map opens the full game — and says how to get back. */
export function toMap(nav: (path: string) => void, fly?: View) {
  const ui = useUi.getState();
  if (ui.settings.simpleMode) {
    ui.updateSettings({ simpleMode: false });
    toast('Opened the full map', { description: 'Switch back to simple mode any time from the top of the map.' });
  }
  import('../enchant/GrimoireButton').then((m) => m.useGrimoireSheet.getState().set(false)).catch(() => {});
  nav('/world');
  if (fly) flyAway(fly);
}
