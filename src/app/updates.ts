// Keeps installed copies of LANDVAS up to date. The service worker caches the
// app for offline play; when a new build is deployed it takes over open tabs
// (skipWaiting + clientsClaim) and the page reloads once. As a safety net the
// app also polls /version.json and, if it is still running an old build after
// the service worker had its chance, clears the cache and reloads.
//
// Players asked not to be booted mid-drawing or mid-game: a new build found while you're playing starts a
// 30-minute countdown in the corner (the owner can change it: game_config 'app' update_grace_minutes) — finish what
// you're doing, or tap "Update now". Just opened the game (the first minute)? It updates straight away.
import { config } from '../env';

declare const __LANDVAS_BUILD__: string;
declare const __LANDVAS_BUILT_AT__: string;

export const BUILD = { id: __LANDVAS_BUILD__, at: __LANDVAS_BUILT_AT__ };

let registration: ServiceWorkerRegistration | undefined;

// ---- the countdown before a reload --------------------------------------------------------------------------------
const STARTED = Date.now();
let graceMin = 30;
/** when a found update will reload the page (null: none waiting) */
let dueAt: number | null = null;
let dueRun: (() => void) | null = null;
let dueTimer: ReturnType<typeof setTimeout> | undefined;
const dueListeners = new Set<(at: number | null) => void>();
export const updateDue = () => dueAt;
export const onUpdateDue = (cb: (at: number | null) => void) => { dueListeners.add(cb); return () => void dueListeners.delete(cb); };
/** the owner's grace period (minutes; 0 = reload straight away) */
export function setUpdateGrace(min: unknown) { const n = Number(min); if (Number.isFinite(n) && n >= 0 && n <= 240) graceMin = n; }
/** run `go` (the reload) now if the game was only just opened, else when the countdown runs out */
function whenDue(go: () => void) {
  if (Date.now() - STARTED < 60_000 || graceMin === 0) { go(); return; }
  dueRun = go;
  if (dueAt == null) {
    dueAt = Date.now() + graceMin * 60_000;
    clearTimeout(dueTimer);
    dueTimer = setTimeout(() => { const f = dueRun; dueRun = null; dueAt = null; for (const l of dueListeners) l(null); f?.(); }, graceMin * 60_000);
    for (const l of dueListeners) l(dueAt);
  }
}
/** "Update now" */
export function updateNow() { clearTimeout(dueTimer); const f = dueRun; dueRun = null; dueAt = null; for (const l of dueListeners) l(null); if (f) f(); else void hardRefresh(`now-${Date.now()}`); }
// while someone is drawing, a new build waits (a reload would lose their strokes)
let holds = 0;
let pending: string | null = null;
let swPending = false;
let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
export function holdUpdates() {
  holds++;
  return () => {
    holds = Math.max(0, holds - 1);
    if (!holds && swPending) { swPending = false; setTimeout(() => { if (!holds) void updateSW?.(true); }, 3000); }
    if (!holds && pending) { const b = pending; pending = null; setTimeout(() => { if (!holds) void hardRefresh(b); }, 4000); }
  };
}
export const updatesHeld = () => holds > 0;
const TRIED = 'landvas.update.tried';

function triedFor(build: string) {
  try {
    return sessionStorage.getItem(TRIED) === build;
  } catch {
    return false;
  }
}
function markTried(build: string) {
  try {
    sessionStorage.setItem(TRIED, build);
  } catch {
    /* storage blocked */
  }
}

/** Drop every cached copy of the app and load the live one (once per build per tab). */
export async function hardRefresh(build = 'unknown') {
  if (holds) { pending = build; return; }
  if (triedFor(build)) return;
  markTried(build);
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* best effort */
  }
  location.reload();
}

async function checkVersion() {
  if (!import.meta.env.PROD || config.isArtifact) return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const live = (await res.json()) as { build?: string };
    if (!live.build || live.build === BUILD.id) return;
    if (dueAt != null) return; // already counting down to it
    await registration?.update().catch(() => {});
    // the new service worker normally asks to reload within a few seconds (and starts the countdown); if it doesn't,
    // the countdown starts here
    setTimeout(() => { if (dueAt == null) whenDue(() => { if (holds) pending = live.build!; else void hardRefresh(live.build); }); }, 12_000);
  } catch {
    /* offline */
  }
}

export function startUpdates() {
  if (config.serviceWorker && 'serviceWorker' in navigator && import.meta.env.PROD) {
    const register = () => void import('virtual:pwa-register')
      .then(({ registerSW }) =>
        (updateSW = registerSW({
          immediate: true,
          onRegisteredSW(_url, r) {
            registration = r;
          },
          onNeedRefresh() {
            whenDue(() => {
              if (holds) swPending = true;
              else void updateSW?.(true);
            });
          },
        })),
      )
      .catch(() => {});
    // the offline copy of the game is several MB: it downloads once the first screen is up, not while the map and
    // its tiles are still loading over a phone connection
    const later = () => setTimeout(register, 5000);
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
  }
  // a lazily loaded screen from a build that no longer exists: fetch the new build
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    void hardRefresh(`chunk-${BUILD.id}`);
  });
  void checkVersion();
  setInterval(() => void checkVersion(), 5 * 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkVersion();
  });
}
