// Live builds of the game in the iOS / Android apps: new versions of the game's web code reach installed apps
// without a store release (Capacitor Updater, self-hosted, nothing automatic and no third-party service).
//
//  * Every deploy publishes the game's files for the apps on landvas.app and records the current build per kind of
//    app binary in the database (public.ota_bundles, with the sha-256 of every file). See scripts/publish-ota.mjs.
//  * The app reads which build is current with its live settings (app_config), and when it's newer than the one it
//    runs, fetches only the files it doesn't already have. Each file is checked against the list before use.
//  * The new build is applied only after the app has been away for more than five minutes, or on its next launch,
//    never in the middle of play, and never while someone is drawing. Nothing is shown to the player.
//  * A build that doesn't start rolls back by itself (markBundleReady must run within 15 seconds of a launch).
//  * Staff control it in the admin portal (Live control → Live versions): stop sending builds, hold app versions
//    that are under store review on the build inside them, or send every app back to its store build.
// Only in the native build: the website keeps its own way of refreshing (src/app/updates.ts).
import { NATIVE_APP } from '../app/buildFlags';
import { updatesHeld } from '../app/updates';
import { api } from '../backend/api';
import type { AppConfig } from '../backend/types';

declare const __LANDVAS_BUILD__: string;
declare const __LANDVAS_BUILT_AT__: string;
declare const __LANDVAS_NATIVE_COMPAT__: string;

const plugin = () => import('@capgo/capacitor-updater').then((m) => m.CapacitorUpdater);

/** tell the app shell this build started fine (otherwise it rolls back to the last good one) */
export function markBundleReady() {
  if (!NATIVE_APP) return;
  void plugin().then((u) => u.notifyAppReady()).catch(() => { /* not in an app */ });
}

/** the game's own code failed to load in a live build: go back to the last build that worked */
export async function recoverFromBrokenBundle() {
  if (!NATIVE_APP) return;
  try {
    const u = await plugin();
    const cur = await u.current();
    if (cur.bundle.id !== 'builtin') await u.reset({ toLastSuccessful: true });
  } catch { /* nothing to do */ }
}

export type BundlePlan =
  | { kind: 'none'; why: string }
  | { kind: 'back_to_store' }
  | { kind: 'take'; build: string };

/** what to do, given the live settings and this app (pure, so it can be tested) */
export function planBundle(cfg: AppConfig | undefined, app: { nativeVersion: string | null; compat: string; build: string; builtAt: string; onStoreBuild: boolean }): BundlePlan {
  if (!cfg) return { kind: 'none', why: 'no settings' };
  const ota = cfg.ota ?? {};
  if (ota.back_to_store_build) return app.onStoreBuild ? { kind: 'none', why: 'on the store build' } : { kind: 'back_to_store' };
  if (ota.on === false) return { kind: 'none', why: 'off' };
  if (!app.compat) return { kind: 'none', why: 'not an app build' };
  if (app.nativeVersion && (ota.paused_for ?? []).includes(app.nativeVersion)) return { kind: 'none', why: 'held for review' };
  const latest = cfg.ota_builds?.[app.compat];
  if (!latest?.build) return { kind: 'none', why: 'nothing published for this app' };
  if (latest.build === app.build) return { kind: 'none', why: 'up to date' };
  // never go back to an older build than the one running (a newer store build, or a build being rolled out)
  const newer = Date.parse(latest.built_at ?? ''), mine = Date.parse(app.builtAt);
  if (Number.isFinite(newer) && Number.isFinite(mine) && newer <= mine) return { kind: 'none', why: 'older than this build' };
  return { kind: 'take', build: latest.build };
}

let busy = false;
let queued: string | null = null;
let firstCheck = true;

/** check the live settings and, if there's a newer build for this app, get it ready for the next launch */
export async function syncBundle(cfg: AppConfig | undefined) {
  if (!NATIVE_APP || busy || !cfg) return;
  busy = true;
  try {
    const u = await plugin();
    const { App } = await import('@capacitor/app');
    const [cur, info] = await Promise.all([u.current(), App.getInfo().catch(() => null)]);
    const plan = planBundle(cfg, {
      nativeVersion: info?.version ?? null, compat: __LANDVAS_NATIVE_COMPAT__, build: __LANDVAS_BUILD__, builtAt: __LANDVAS_BUILT_AT__,
      onStoreBuild: cur.bundle.id === 'builtin',
    });
    const start = firstCheck;
    firstCheck = false;
    if (plan.kind === 'back_to_store') {
      // straight away when the app has just opened; otherwise the next time it's away for a while
      if (start) { await u.reset({ toLastSuccessful: false }); return; }
      await u.next({ id: 'builtin' });
      await u.setMultiDelay({ delayConditions: [{ kind: 'background', value: '300000' }, { kind: 'kill' }], conditionMode: 'or' });
      return;
    }
    if (plan.kind !== 'take' || queued === plan.build) return;
    // already fetched (an earlier session)? otherwise fetch just the files this app doesn't have yet
    const have = (await u.list()).bundles.find((b) => b.version === plan.build && b.status !== 'error' && b.status !== 'deleted' && b.status !== 'downloading');
    let id = have?.id;
    if (!id) {
      const m = await api.otaManifest(__LANDVAS_NATIVE_COMPAT__);
      if (!m || m.build !== plan.build || !m.manifest?.length) return;
      const files = m.manifest.map(({ file_name, file_hash, download_url }) => ({ file_name, file_hash, download_url }));
      id = (await u.download({ url: `${m.base_url}index.html`, version: m.build, manifest: files })).id;
    }
    // someone is drawing: try again at the next check
    if (updatesHeld()) return;
    await u.next({ id });
    await u.setMultiDelay({ delayConditions: [{ kind: 'background', value: '300000' }, { kind: 'kill' }], conditionMode: 'or' });
    queued = plan.build;
  } catch (e) {
    console.warn('live build', e);
  } finally {
    busy = false;
  }
}
