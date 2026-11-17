// The way into Explorer's Eyes from the map: a round button that dives the map down into your explorer and opens
// the first-person view. (Light on purpose: the 3D view itself only downloads when you go in.)
import { useNavigate } from 'react-router-dom';
import { usePageOff } from '../app/LiveControl';
import { explorerNow, useExplorer } from '../explorer/explorer';
import { diveInto } from '../map/Hud';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';
import { safeStorage } from '../lib/utils';
import { GameDisc } from '../ui';

/** open the first-person view (diving the map into your explorer first, when it's on screen) */
export function openEyes(nav: (to: string) => void) {
  const st = useExplorer.getState();
  const p = explorerNow(st.state, st.offset);
  if (useUi.getState().settings.haptics) buzz('medium');
  diveInto(nav as Parameters<typeof diveInto>[0], '/eyes', p ? { lng: p.lng, lat: p.lat } : null);
}

export function EyesDisc({ size = 44 }: { size?: number }) {
  const nav = useNavigate();
  const off = usePageOff()('/eyes');
  const has = useExplorer((s) => !!s.state);
  if (off || !has) return null;
  const fresh = !safeStorage('landvas.eyes.hinted', false);
  return (
    <GameDisc tone="teal" size={size} glow dot={fresh} onClick={() => openEyes(nav)} aria-label="Explorer’s Eyes: see the world through your explorer" title="Explorer’s Eyes: step into your explorer and look around" data-testid="eyes-disc">
      <span className="text-[20px] leading-none">👁️</span>
    </GameDisc>
  );
}
