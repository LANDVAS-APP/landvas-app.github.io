// "Back to" a screen without trapping anyone in a loop. A game inside a business or a sanctuary used to push its parent
// screen again on the way out, so the parent's own back button (history back) went into the game again, and the phone's
// Back button bounced between the two. Now: if that screen is right behind us in history, step back to it; otherwise
// replace this screen with it.
import { useEffect } from 'react';
import { useLocation, type NavigateFunction } from 'react-router-dom';

/** the path of each history entry React Router has numbered (history.state.idx), as we saw them */
const seen = new Map<number, string>();
const idxNow = () => (window.history.state as { idx?: number } | null)?.idx ?? 0;

export function HistoryTracker() {
  const loc = useLocation();
  useEffect(() => {
    const i = idxNow();
    seen.set(i, loc.pathname);
    // (entries past this one were replaced by a new branch of history: forget them)
    for (const k of [...seen.keys()]) if (k > i && window.history.length <= k) seen.delete(k);
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** go to `path` as "back": history back if it's the screen behind this one, else replace this screen with it */
export function backTo(nav: NavigateFunction, path: string) {
  const i = idxNow();
  if (i > 0 && seen.get(i - 1) === path) nav(-1);
  else nav(path, { replace: true });
}
