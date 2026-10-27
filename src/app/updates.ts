// Keeps installed copies of LANDVAS up to date. The service worker caches the
// app for offline play; when a new build is deployed it takes over open tabs
// (skipWaiting + clientsClaim) and the page reloads once. As a safety net the
// app also polls /version.json and, if it is still running an old build after
// the service worker had its chance, clears the cache and reloads.
import { config } from '../env';

declare const __LANDVAS_BUILD__: string;
declare const __LANDVAS_BUILT_AT__: string;

export const BUILD = { id: __LANDVAS_BUILD__, at: __LANDVAS_BUILT_AT__ };

let registration: ServiceWorkerRegistration | undefined;
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
    await registration?.update().catch(() => {});
    // the new service worker normally reloads the page within a few seconds
    setTimeout(() => void hardRefresh(live.build), 12_000);
  } catch {
    /* offline */
  }
}

export function startUpdates() {
  if (config.serviceWorker && 'serviceWorker' in navigator && import.meta.env.PROD) {
    void import('virtual:pwa-register')
      .then(({ registerSW }) =>
        registerSW({
          immediate: true,
          onRegisteredSW(_url, r) {
            registration = r;
          },
        }),
      )
      .catch(() => {});
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
