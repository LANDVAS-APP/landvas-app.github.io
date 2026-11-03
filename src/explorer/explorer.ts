// The player's explorer: a character on the map at their live GPS position.
// There is no teleporting or placing it by hand — only real GPS moves it (plus a
// one-minute joystick nudge around the player). Plots can only be claimed near it. The server is authoritative; this module
// mirrors its interpolation so the character moves smoothly between updates.
import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '../backend/api';
import type { ExplorerState } from '../backend/types';
import { GRID_SIZE, lngLatToCell } from '../shared/grid';
import { saveStorage } from '../lib/utils';
import { config } from '../env';

export type GpsStatus = 'off' | 'asking' | 'on' | 'paused' | 'denied' | 'unavailable';

type Store = {
  state: ExplorerState | null;
  offset: number; // server clock - client clock (ms)
  gps: GpsStatus;
  following: boolean;
  heading: number; // -1 facing left, 1 facing right
  set(s: ExplorerState | null | undefined): void;
  setGps(g: GpsStatus): void;
  setFollowing(f: boolean): void;
};

export const useExplorer = create<Store>((set, get) => ({
  state: null,
  offset: 0,
  gps: 'off',
  following: false,
  heading: 1,
  set: (s) => {
    if (s === undefined) return;
    const prev = get().state;
    let heading = get().heading;
    if (s && prev) {
      const target = s.dest ?? s;
      const dx = target.lng - prev.lng;
      if (Math.abs(dx) > 1e-7) heading = dx > 0 ? 1 : -1;
    }
    set({ state: s, offset: s ? new Date(s.server_time).getTime() - Date.now() : get().offset, heading });
  },
  setGps: (gps) => set({ gps }),
  setFollowing: (following) => set({ following }),
}));

if (typeof window !== 'undefined' && (config.e2e || import.meta.env.DEV)) (window as any).__landvasExplorer = useExplorer;

const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const latOfY = (y: number) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
function haversine(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const R = 6371008.8, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Explorer position right now — the same interpolation as private.explorer_now. */
export function explorerNow(s: ExplorerState | null, offset: number): { lng: number; lat: number; traveling: boolean; progress: number } | null {
  if (!s) return null;
  if (!s.dest || !s.speed_mps) return { lng: s.lng, lat: s.lat, traveling: false, progress: 1 };
  const o = s.origin, d = s.dest;
  const dist = haversine(o, d);
  const elapsed = Math.max(0, (Date.now() + offset - new Date(s.fixed_at).getTime()) / 1000);
  const f = dist > 0 ? Math.min(1, (elapsed * s.speed_mps) / dist) : 1;
  const x0 = (o.lng + 180) / 360;
  let x1 = (d.lng + 180) / 360;
  if (x1 - x0 > 0.5) x1 -= 1;
  else if (x0 - x1 > 0.5) x1 += 1;
  let x = x0 + (x1 - x0) * f;
  x -= Math.floor(x);
  const y = mercY(o.lat) + (mercY(d.lat) - mercY(o.lat)) * f;
  return { lng: x * 360 - 180, lat: latOfY(y), traveling: f < 1, progress: f };
}

export function explorerCell(): { gx: number; gy: number } | null {
  const { state, offset } = useExplorer.getState();
  const p = explorerNow(state, offset);
  return p ? lngLatToCell(p.lng, p.lat) : null;
}

export function cellDistance(a: { gx: number; gy: number }, b: { gx: number; gy: number }) {
  const dx = Math.abs(a.gx - b.gx);
  return Math.max(Math.min(dx, GRID_SIZE - dx), Math.abs(a.gy - b.gy));
}

export function travelEta(s: ExplorerState | null, offset: number, to: { lng: number; lat: number }, speedKmh: number) {
  const p = explorerNow(s, offset);
  if (!p) return 0;
  return haversine(p, to) / (speedKmh / 3.6);
}

/** Turn on location: the only way to place and move the explorer. */
export function enableGps(onFirstFix?: (lng: number, lat: number) => void) {
  saveStorage('landvas.gps', true);
  if (!gpsSupported()) {
    useExplorer.getState().setGps('unavailable');
    toast.error('This browser can’t share your location', { description: 'LANDVAS needs GPS to place your explorer. Try your phone’s browser.' });
    return;
  }
  startGps({ onFirstFix });
  useExplorer.getState().setFollowing(true);
}

// ---- GPS -------------------------------------------------------------------------

let watchId: number | null = null;
let lastReport = { at: 0, lng: 0, lat: 0 };
let lastFix = 0;
let wanted = false; // the player wants GPS on (it may be paused or restarting)
let resumeHooked = false;
let inflight = false;
let warned = false;

export function gpsSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function startGps(opts: { onFirstFix?: (lng: number, lat: number) => void } = {}) {
  const st = useExplorer.getState();
  if (!gpsSupported()) {
    st.setGps('unavailable');
    return;
  }
  if (watchId !== null) return;
  wanted = true;
  hookResume();
  st.setGps('asking');
  let first = true;
  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { longitude: lng, latitude: lat, accuracy } = pos.coords;
      useExplorer.getState().setGps('on');
      lastFix = Date.now();
      // plots are ~7-9 m: report every few metres so the explorer keeps up with you
      const moved = haversine(lastReport, { lng, lat });
      const due = Date.now() - lastReport.at > 12_000 || moved > Math.max(4, Math.min(20, accuracy * 0.5));
      if (first) opts.onFirstFix?.(lng, lat);
      first = false;
      if (!due || inflight || accuracy > 3000) return;
      inflight = true;
      try {
        const r = await api.reportPosition(lng, lat, Math.round(accuracy));
        lastReport = { at: Date.now(), lng, lat };
        useExplorer.getState().set(r);
        if (r.accepted === false && !warned) {
          warned = true;
          const mins = Math.ceil((r.wait_seconds ?? 0) / 60);
          toast.warning('That GPS jump was too far to be real', { description: `Your explorer stays put. Try again in about ${mins} min.` });
        }
        if (r.reanchored) toast('Welcome to a new place!', { description: 'Your explorer moved with you. Far jumps like this are allowed once a day.' });
      } catch (e) {
        if (!String((e as Error).message).includes('rate')) console.warn('[landvas] position report failed', e);
      } finally {
        inflight = false;
      }
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        stopGps();
        useExplorer.getState().setGps('denied');
      } else if (Date.now() - lastFix > 60_000) {
        // no fix for a while (tunnel, indoors, a phone that dropped the watch): start it again
        restartGps();
      }
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 },
  );
}

function restartGps() {
  if (!wanted) return;
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  startGps();
}

/** Phones (and installed web apps) stop location updates in the background and don't
 *  always restart them: start a fresh watch whenever the game comes back to the front. */
function hookResume() {
  if (resumeHooked || typeof document === 'undefined') return;
  resumeHooked = true;
  const back = () => { if (!document.hidden && wanted && useExplorer.getState().gps !== 'paused') { lastReport.at = 0; restartGps(); } };
  document.addEventListener('visibilitychange', back);
  window.addEventListener('pageshow', back);
  window.addEventListener('focus', () => { if (wanted && Date.now() - lastFix > 20_000) back(); });
}

/** Turn GPS off (the player chose to). */
export function stopGps() {
  wanted = false;
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (useExplorer.getState().gps !== 'denied' && useExplorer.getState().gps !== 'unavailable') useExplorer.getState().setGps('off');
}

/** Hold GPS while the joystick steers (GPS would pull the explorer straight back). */
export function pauseGps() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (wanted) useExplorer.getState().setGps('paused');
}
/** Pick GPS up again after the joystick closes. */
export function resumeGps() {
  if (useExplorer.getState().gps !== 'paused') return;
  lastReport.at = 0;
  wanted = true;
  startGps();
}
