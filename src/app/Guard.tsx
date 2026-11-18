// Crashes stay small. A part of a screen that hits a problem (a map layer, a button, a card) quietly steps aside and
// tries again a little later, while the rest of the screen keeps working: one bad answer from the server must never
// take the map — or the game — down with it. Every crash is reported once (lib/errorReports).
// Three layers, smallest first: <Guard> around parts of a screen, RouteError around every screen (App.tsx), and
// <AppCrash> around the whole game (main.tsx), so a player never meets a developer error page or a blank screen.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { shouldReport } from '../lib/errorReports';

/** a chunk of this build that's no longer on the server (the game was updated while it was open) */
export const STALE_BUILD = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk \d+ failed|Unable to preload CSS/i;

/** send a crash to the server's error log (once per kind of crash per visit; signed-in players only) */
export function reportCrash(where: string, error: unknown, extra?: Record<string, unknown>) {
  const msg = `${where}: ${error instanceof Error ? error.message : String(error)}`;
  if (!shouldReport(msg)) return;
  void Promise.all([import('../backend/api'), import('../backend/backend')]).then(([{ api }, { getBackend }]) => {
    if (!getBackend().session()) return;
    return api.reportClientError(msg.slice(0, 500), { path: location.pathname, stack: error instanceof Error ? error.stack?.slice(0, 1500) : undefined, ua: navigator.userAgent, ...extra });
  }).catch(() => {});
}

type GuardProps = {
  /** what this part is (for the error log), e.g. "map:enchant" */
  name: string;
  children?: ReactNode;
  /** shown instead while it's stepped aside (nothing by default); a function gets a way to try again now */
  fallback?: ReactNode | ((retry: () => void) => ReactNode);
  /** a new value (e.g. the card that's open) gives it a fresh try straight away */
  resetKey?: unknown;
};

/** A part of a screen that can fail on its own: on a crash it shows nothing (or `fallback`), reports it, and tries
 *  again after a while (a few times), or straight away when `resetKey` changes. */
export class Guard extends Component<GuardProps, { failed: boolean; key: unknown; tries: number }> {
  state = { failed: false, key: this.props.resetKey, tries: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError() { return { failed: true }; }

  static getDerivedStateFromProps(p: GuardProps, s: { failed: boolean; key: unknown; tries: number }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn(`[guard] ${this.props.name} stepped aside:`, error);
    reportCrash(`part ${this.props.name}`, error, { component: info.componentStack?.slice(0, 600) });
    // try again later: often the next answer from the server is fine (3 tries: after 15 s, 1 min, 4 min)
    if (this.state.tries < 3) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.setState((s) => ({ failed: false, tries: s.tries + 1 })), 15_000 * 4 ** this.state.tries);
    }
  }

  componentWillUnmount() { clearTimeout(this.timer); }

  private retry = () => { clearTimeout(this.timer); this.setState((s) => ({ failed: false, tries: s.tries + 1 })); };

  render() {
    if (!this.state.failed) return this.props.children;
    const f = this.props.fallback;
    return typeof f === 'function' ? f(this.retry) : (f ?? null);
  }
}

/** A small card in place of a part that couldn't open (a sheet, a panel), with a way to try again. */
export function PartTrouble({ what, retry, onClose }: { what: string; retry: () => void; onClose?: () => void }) {
  return (
    <div className="pointer-events-auto fixed inset-x-3 bottom-[calc(104px+env(safe-area-inset-bottom,0px))] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/15 bg-[#10153a] p-3 text-left text-white shadow-2xl" role="alert" data-testid="part-trouble">
      <span className="text-2xl" aria-hidden>🧩</span>
      <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">{what} didn’t open just now.</span>
      <button className="shrink-0 rounded-xl bg-accent px-3 py-2 text-[13px] font-bold" onClick={retry} data-testid="part-trouble-retry">Try again</button>
      {onClose && <button className="shrink-0 px-1 text-lg text-white/60" onClick={onClose} aria-label="Close">×</button>}
    </div>
  );
}

/** The last net, around the whole game: if anything outside a screen breaks, a calm screen with a way back
 *  instead of a blank page. A build that's gone from the server fetches the new one. */
export class AppCrash extends Component<{ children?: ReactNode; onRecover?: () => Promise<void> | void }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) { return { error }; }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[app] crashed:', error);
    reportCrash('app', error, { component: info.componentStack?.slice(0, 600) });
    if (STALE_BUILD.test(String((error as Error)?.message ?? error))) location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const again = async () => {
      try { await this.props.onRecover?.(); } catch { /* still reload */ }
      location.replace('/world');
    };
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg p-8 text-center" role="alert" data-testid="app-crash">
        <img src="/brand/landvas-mark-512.png" alt="" className="h-20 w-20" />
        <h1 className="font-display text-xl font-black">LANDVAS hit a snag</h1>
        <p className="max-w-xs text-sm text-muted">Your land, Ink and progress are safe. Tap below to jump back into the world.</p>
        <button className="rounded-2xl bg-accent px-6 py-3 font-bold text-white" onClick={() => void again()} data-testid="app-crash-restart">Back to the world</button>
      </div>
    );
  }
}
