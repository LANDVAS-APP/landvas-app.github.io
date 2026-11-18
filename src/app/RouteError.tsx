// A screen that hit a problem never takes the game down with it: the tab bar and every other screen stay up, and the
import { shouldReport } from '../lib/errorReports';
// player can try it again or go elsewhere — no dead page that needs a reload. A screen from a build that's no longer on
// the server (the game was updated while it was open) fetches the new build instead. Every crash is reported.
import { useEffect, useState } from 'react';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { Button } from '../ui';
import { BUILD, hardRefresh } from './updates';

const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk \d+ failed|Unable to preload CSS/i;

export function RouteError() {
  const err = useRouteError();
  const nav = useNavigate();
  const loc = useLocation();
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : String(err);
  // (if the new build doesn't arrive — offline, or already tried — the buttons show after a moment)
  const [waited, setWaited] = useState(false);
  const stale = STALE.test(msg) && !waited;
  useEffect(() => { const t = setTimeout(() => setWaited(true), 5000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (STALE.test(msg)) { void hardRefresh(`route-${BUILD.id}`); return; }
    if (getBackend().session() && shouldReport(`screen: ${msg}`)) void api.reportClientError(`screen: ${msg}`.slice(0, 500), { path: loc.pathname, stack: err instanceof Error ? err.stack?.slice(0, 1500) : undefined, ua: navigator.userAgent }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid min-h-[60dvh] place-items-center p-6 text-center" role="alert" data-testid="route-error">
      <div className="grid max-w-sm justify-items-center gap-3">
        <div className="text-5xl" aria-hidden>{stale ? '✨' : '🧩'}</div>
        <h1 className="font-display text-xl font-black">{stale ? 'Getting the latest LANDVAS…' : 'This screen hit a snag'}</h1>
        <p className="text-sm text-muted">{stale ? 'The game was just updated — one moment.' : 'Everything else is fine. Try it again, or head somewhere else.'}</p>
        {!stale && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => nav(loc.pathname + loc.search, { replace: true })} data-testid="route-error-retry">Try again</Button>
            <Button variant="secondary" onClick={() => nav('/world')}>Go to the map</Button>
          </div>
        )}
      </div>
    </div>
  );
}
