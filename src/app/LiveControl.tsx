// Live control of the game, from the admin portal (Live control), with no app update: game_config 'app'.
// Every copy of the game (the website and the iOS / Android apps) reads it when it starts, when it comes back to the
// front and every few minutes, and then:
//   * apps older than min_version show a full-screen "update" prompt with the store button;
//     apps older than latest_version are offered the update once;
//   * planned maintenance shows a "back soon" screen (staff on the website still get in);
//   * pages switched off disappear: every link, card, tab and tile to them is hidden, and their address goes back to
//     the main screen.
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import type { AppConfig } from '../backend/types';
import { useMe } from '../lib/queries';
import { isNative, platform } from '../native/native';
import { syncBundle } from '../native/liveBundle';
import { NATIVE_APP } from './buildFlags';

const CORE = ['/', '/world', '/hub', '/welcome', '/settings', '/support', '/legal', '/onboarding', '/reset-password'];

export const useAppConfig = () =>
  useQuery({ queryKey: ['app-config'], queryFn: api.appConfig, staleTime: 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true, retry: 1 });

/** the pages switched off for this copy of the game (everywhere, plus the apps-only list in the apps) */
export function offPages(c: AppConfig | undefined): string[] {
  const list = [...(c?.hidden_pages ?? []), ...(isNative() ? c?.hidden_pages_apps ?? [] : [])];
  return [...new Set(list.filter((p) => typeof p === 'string' && /^\/[a-z0-9/_-]+$/.test(p) && !CORE.includes(p)))];
}
const under = (path: string, page: string) => path === page || path.startsWith(`${page}/`);

/** is this page switched off right now? */
export function usePageOff() {
  const c = useAppConfig().data;
  const off = useMemo(() => offPages(c), [c]);
  return (path: string) => off.some((p) => under(path, p));
}

/** 1.2.10 vs 1.10.0: compares numbers part by part */
export function olderThan(version: string, than: string) {
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = than.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

let appVersion: Promise<string | null> | null = null;
/** the installed app's version (the stores' version name), or null on the website */
function installedVersion() {
  appVersion ??= isNative()
    ? import('@capacitor/app').then(({ App }) => App.getInfo()).then((i) => i.version).catch(() => null)
    : Promise.resolve(null);
  return appVersion;
}

function storeUrl(c: AppConfig) {
  const url = platform() === 'ios' ? c.store?.ios : c.store?.android;
  return url || c.links?.website || 'https://landvas.app';
}

const OFFERED = 'landvas.update.offered';

export function LiveControl() {
  const cfg = useAppConfig().data;
  const me = useMe().data;
  const loc = useLocation();
  const [version, setVersion] = useState<string | null>(null);
  const [softClosed, setSoftClosed] = useState(false);
  useEffect(() => { void installedVersion().then(setVersion); }, []);
  // the apps: a newer live build of the game, fetched quietly and applied on a later launch
  useEffect(() => { if (NATIVE_APP && isNative()) void syncBundle(cfg); }, [cfg]);

  // pages switched off: hide every link to them, wherever it is (cards, tabs, tiles, lists)
  const off = useMemo(() => offPages(cfg), [cfg]);
  useEffect(() => {
    let el = document.getElementById('live-off-pages') as HTMLStyleElement | null;
    if (!off.length) { el?.remove(); return; }
    if (!el) { el = document.createElement('style'); el.id = 'live-off-pages'; document.head.appendChild(el); }
    const links = off.flatMap((p) => [`a[href="${p}"]`, `a[href^="${p}/"]`, `a[href^="${p}?"]`]).join(',');
    // a card's wrapper goes too, so grids close up (where the browser supports :has)
    el.textContent = `${links}{display:none!important}` + `@supports selector(:has(a)){:where(div,li):has(> :is(${links}):only-child){display:none!important}}`;
  }, [off]);

  const staffOnWeb = !isNative() && !!me && 'roles' in me && (me.roles?.length ?? 0) > 0;
  const pageOff = off.find((p) => under(loc.pathname, p));
  useEffect(() => { if (pageOff) toast('That part of LANDVAS is switched off for now. It’ll be back soon.'); }, [pageOff]);

  if (!cfg) return null;

  // an app too old to keep playing
  if (version && cfg.min_version && olderThan(version, cfg.min_version)) {
    return (
      <FullScreen testid="update-required" title={cfg.update?.title || 'Time to update LANDVAS'}
        message={cfg.update?.message || 'This version of LANDVAS is too old to keep playing. Update it from the store and you’ll be right back where you left off.'}>
        <button className="lv-btn on h-12 w-full max-w-xs text-base" onClick={() => location.assign(storeUrl(cfg))}>Update LANDVAS</button>
        <p className="text-xs text-white/50">You have version {version}.</p>
      </FullScreen>
    );
  }

  // planned maintenance (staff on the website still get in, with a reminder)
  if (cfg.maintenance?.on && !staffOnWeb) {
    const until = cfg.maintenance.until ? new Date(cfg.maintenance.until) : null;
    return (
      <FullScreen testid="maintenance-planned" title={cfg.maintenance.title || 'Back soon'}
        message={cfg.maintenance.message || 'We’re making LANDVAS better. Your plots keep earning while we work.'}>
        {until && !Number.isNaN(until.getTime()) && <p className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white/80">Back around {until.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>}
        <button className="text-xs font-bold text-[#B8A8FF] underline underline-offset-4" onClick={() => location.reload()}>Try again</button>
      </FullScreen>
    );
  }

  return (
    <>
      {cfg.maintenance?.on && staffOnWeb && (
        <div className="fixed inset-x-0 top-0 z-[9998] bg-warn px-3 py-1 text-center text-xs font-bold text-black">Maintenance is on: players see the “back soon” screen. Turn it off in the admin portal’s Live control.</div>
      )}
      {pageOff && <Navigate to={isNative() ? '/hub' : '/world'} replace />}
      {version && cfg.latest_version && olderThan(version, cfg.latest_version) && !softClosed && readOffered() !== cfg.latest_version && (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[9990] mx-auto max-w-md rounded-2xl border border-white/15 bg-[#141a3d]/95 p-4 text-white shadow-2xl backdrop-blur" role="dialog" aria-label="Update available" data-testid="update-available">
          <div className="font-display text-base font-black">{cfg.update?.soft_title || 'A new LANDVAS is out'}</div>
          <p className="mt-1 text-sm text-white/75">{cfg.update?.soft_message || 'Update from the store for the latest features and fixes.'}</p>
          <div className="mt-3 flex gap-2">
            <button className="lv-btn on h-10 flex-1 text-sm" onClick={() => { writeOffered(cfg.latest_version!); location.assign(storeUrl(cfg)); }}>Update</button>
            <button className="lv-btn h-10 flex-1 text-sm" onClick={() => { writeOffered(cfg.latest_version!); setSoftClosed(true); }}>Later</button>
          </div>
        </div>
      )}
    </>
  );
}

function FullScreen({ title, message, children, testid }: { title: string; message: string; children?: React.ReactNode; testid: string }) {
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-[#0B0820] p-6 text-center text-white" role="alert" data-testid={testid}>
      <div className="grid max-w-sm justify-items-center gap-4">
        <img src="/brand/landvas-mark-512.png" alt="" width={84} height={84} />
        <h1 className="font-display text-2xl font-black">{title}</h1>
        <p className="whitespace-pre-line text-sm leading-relaxed text-white/75">{message}</p>
        {children}
      </div>
    </div>
  );
}

function readOffered() {
  try { return localStorage.getItem(OFFERED); } catch { return null; }
}
function writeOffered(v: string) {
  try { localStorage.setItem(OFFERED, v); } catch { /* storage blocked */ }
}
