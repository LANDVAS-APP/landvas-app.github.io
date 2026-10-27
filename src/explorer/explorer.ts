// The player's explorer: a character on the map at their live GPS position (or,
// where GPS is unavailable, travelling at a fixed speed to where they tap).
// Plots can only be claimed near it. The server is authoritative; this module
// mirrors its interpolation so the character moves smoothly between updates.
import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ExplorerState } from '../backend/types';
import { GRID_SIZE, lngLatToCell } from '../shared/grid';

export type GpsStatus = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';

type Store = {
  state: ExplorerState | null;
  offset: number; // server clock - client clock (ms)
  gps: GpsStatus;
  following: boolean;
  placing: boolean; // "tap the map to place your explorer" mode
  heading: number; // -1 facing left, 1 facing right
  set(s: ExplorerState | null | undefined): void;
  setGps(g: GpsStatus): void;
  setFollowing(f: boolean): void;
  setPlacing(p: boolean): void;
};

export const useExplorer = create<Store>((set, get) => ({
  state: null,
  offset: 0,
  gps: 'off',
  following: false,
  placing: false,
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
  setPlacing: (placing) => set({ placing }),
}));

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

export async function travelTo(lng: number, lat: number, jump = false) {
  try {
    const r = await api.travelTo(lng, lat, jump);
    useExplorer.getState().set(r);
    if (r.placed) toast.success('Your explorer has arrived', { description: 'Plots around you are now claimable.' });
    else if (r.jumped) toast.success('Jumped!', { description: 'Your next instant jump unlocks in 24 hours.' });
    return r;
  } catch (e) {
    toast.error(toGameError(e).message);
    return null;
  }
}

// ---- GPS -------------------------------------------------------------------------

let watchId: number | null = null;
let lastReport = { at: 0, lng: 0, lat: 0 };
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
  st.setGps('asking');
  let first = true;
  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { longitude: lng, latitude: lat, accuracy } = pos.coords;
      useExplorer.getState().setGps('on');
      const moved = haversine(lastReport, { lng, lat });
      const due = Date.now() - lastReport.at > 30_000 || moved > 25;
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
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 },
  );
}

export function stopGps() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (useExplorer.getState().gps === 'on' || useExplorer.getState().gps === 'asking') useExplorer.getState().setGps('off');
}
