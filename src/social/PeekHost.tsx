// Where a player peek appears (mounted once, under the router): nothing until someone taps a name, then the card loads.
import { Suspense, lazy, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePeek } from './peek';

const PlayerPeek = lazy(() => import('./PlayerPeek'));

export function PeekHost() {
  const player = usePeek((s) => s.player);
  const close = usePeek((s) => s.close);
  const { pathname } = useLocation();
  // going somewhere else closes it
  useEffect(() => { close(); }, [pathname, close]);
  if (!player) return null;
  return <Suspense fallback={null}><PlayerPeek /></Suspense>;
}
