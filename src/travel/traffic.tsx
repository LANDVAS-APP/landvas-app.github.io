// Other travellers (v0.9.8): their train rides and flights on the map — a line for the route and the train or plane
// (with their @username) moving along it — and a list in the Travel sheet. Not live to the second: the server says
// when each trip set off and lands, and the map plays it back.
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { newMarker } from '../map/maplib';
import { api } from '../backend/api';
import type { TravelTraffic } from '../backend/types';
import { mapHandle } from '../map/mapHandle';
import { useExplorer } from '../explorer/explorer';
import { create } from 'zustand';
import { safeStorage, saveStorage } from '../lib/utils';

type Pt = [number, number];
const R = Math.PI / 180;

/** show other travellers on the map even when you're at home (they always show while you're away) */
export const useTrafficPref = create<{ show: boolean; set(v: boolean): void }>((set) => ({
  show: safeStorage<boolean>('landvas.showTraffic', false),
  set: (show) => { saveStorage('landvas.showTraffic', show); set({ show }); },
}));

function hav(a: Pt, b: Pt) {
  const dLat = (b[1] - a[1]) * R, dLng = (b[0] - a[0]) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** points along the great circle from a to b (planes fly these) */
function greatCircle(a: Pt, b: Pt, n = 48): Pt[] {
  const [l1, p1, l2, p2] = [a[0] * R, a[1] * R, b[0] * R, b[1] * R];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6) return [a, b];
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(y, x) / R, Math.atan2(z, Math.hypot(x, y)) / R]);
  }
  // keep longitudes continuous across the date line so the line doesn't wrap the world
  for (let i = 1; i < out.length; i++) while (out[i][0] - out[i - 1][0] > 180) out[i][0] -= 360;
  for (let i = 1; i < out.length; i++) while (out[i][0] - out[i - 1][0] < -180) out[i][0] += 360;
  return out;
}

/** the part of a trip that's shown, as a line with its length so far at each point */
export function trafficPath(t: TravelTraffic): { pts: Pt[]; cum: number[] } {
  const stops: Pt[] = [...(t.from ? [[t.from.lng, t.from.lat] as Pt] : []), ...t.stops.map((s) => [s.lng, s.lat] as Pt), [t.to.lng, t.to.lat]];
  const pts = t.mode === 'plane' && stops.length === 2 ? greatCircle(stops[0], stops[1]) : stops;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]));
  return { pts, cum };
}
/** where the train or plane is now (0..1 of the way) */
export function trafficAt(t: TravelTraffic, path: { pts: Pt[]; cum: number[] }, now: number): { p: Pt; f: number; next: Pt } {
  // set off from home: only the destination is known — it waits there, arriving
  if (!t.starts_at || t.inbound) { const p: Pt = [t.to.lng, t.to.lat]; return { p, f: now >= new Date(t.arrives_at).getTime() ? 1 : 0.99, next: p }; }
  const a = new Date(t.starts_at).getTime(), b = new Date(t.arrives_at).getTime();
  const f = Math.min(1, Math.max(0, (now - a) / Math.max(b - a, 1)));
  const { pts, cum } = path, L = cum[cum.length - 1], d = f * L;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < d) i++;
  const seg = Math.max(cum[i] - cum[i - 1], 1e-9), k = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
  const p: Pt = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  return { p, f, next: pts[i] };
}

const PLANE = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 1.5c.9 0 1.5 1 1.5 2.3V9l8 4.6v2.2l-8-2.4v5.1l2.3 1.8v1.7L12 21l-3.8 1v-1.7l2.3-1.8v-5.1l-8 2.4v-2.2l8-4.6V3.8c0-1.3.6-2.3 1.5-2.3z" fill="#fff" stroke="#1d6fa3" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
const TRAIN = `<svg viewBox="0 0 24 24" width="24" height="24"><rect x="5" y="2.5" width="14" height="16" rx="4" fill="#2FA4D9" stroke="#0e4d70" stroke-width="1.1"/><rect x="7.5" y="5" width="9" height="5" rx="1.2" fill="#E9F7FF"/><circle cx="8.8" cy="14" r="1.3" fill="#FFE7A3"/><circle cx="15.2" cy="14" r="1.3" fill="#FFE7A3"/><path d="M8 18.5 6 22M16 18.5l2 3.5" stroke="#0e4d70" stroke-width="1.4"/></svg>`;

function vehicleEl(t: TravelTraffic) {
  const el = document.createElement('div');
  el.className = `lv-traveller ${t.mode}`;
  el.dataset.testid = 'traveller'; el.dataset.user = t.username;
  if (t.inbound) el.classList.add('inbound');
  el.innerHTML = `<div class="veh">${t.mode === 'plane' ? PLANE : TRAIN}</div><div class="who"></div>`;
  (el.querySelector('.who') as HTMLElement).textContent = t.inbound ? `@${t.username} · arriving` : `@${t.username}`;
  el.title = `@${t.username} → ${t.to.name}`;
  return el;
}

export function useTraffic(enabled: boolean) {
  return useQuery({ queryKey: ['travel-traffic'], queryFn: api.travelTraffic, enabled, staleTime: 20_000, refetchInterval: enabled ? 30_000 : false });
}

/** the lines and vehicles on the map */
export function TrafficLayer({ enabled }: { enabled: boolean }) {
  const q = useTraffic(enabled);
  const list = useMemo(() => (enabled ? q.data ?? [] : []), [enabled, q.data]);
  const paths = useMemo(() => new Map(list.map((t) => [t.trip, trafficPath(t)])), [list]);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  // the route lines
  useEffect(() => {
    let tries = 0, timer: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      const map = mapHandle.current;
      if (!map || !map.isStyleLoaded()) { if (tries++ < 40) timer = setTimeout(draw, 500); return; }
      const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: list.filter((t) => !t.inbound).map((t) => ({ type: 'Feature', properties: { mode: t.mode, done: t.arrived ? 1 : 0 }, geometry: { type: 'LineString', coordinates: paths.get(t.trip)!.pts } })) };
      const src = map.getSource('lv-traffic') as maplibregl.GeoJSONSource | undefined;
      if (src) { src.setData(data); return; }
      map.addSource('lv-traffic', { type: 'geojson', data });
      const before = map.getLayer('lv-trip') ? 'lv-trip' : map.getLayer('lv-route') ? 'lv-route' : undefined;
      map.addLayer({ id: 'lv-traffic', type: 'line', source: 'lv-traffic', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'mode'], 'plane', '#7FD3FF', '#2FA4D9'] as any,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.4, 8, 3] as any,
          'line-opacity': ['case', ['==', ['get', 'done'], 1], 0.28, 0.75] as any,
          'line-dasharray': [2, 1.5],
        } }, before);
    };
    draw();
    return () => { if (timer) clearTimeout(timer); };
  }, [list, paths]);
  // the trains and planes, moving along
  useEffect(() => {
    const map = mapHandle.current;
    const have = markers.current;
    const live = list.filter((t) => !t.arrived && new Date(t.arrives_at).getTime() > Date.now() + useExplorer.getState().offset);
    const keep = new Set(live.map((t) => t.trip));
    for (const [id, m] of have) if (!keep.has(id)) { m.remove(); have.delete(id); }
    if (!map) return;
    for (const t of live) if (!have.has(t.trip)) have.set(t.trip, newMarker({ element: vehicleEl(t), anchor: 'center' }).setLngLat([t.to.lng, t.to.lat]).addTo(map));
    const tick = () => {
      const now = Date.now() + useExplorer.getState().offset;
      for (const t of live) {
        const m = have.get(t.trip), path = paths.get(t.trip);
        if (!m || !path) continue;
        const { p, f, next } = trafficAt(t, path, now);
        m.setLngLat(p);
        const el = m.getElement();
        el.classList.toggle('landed', f >= 1);
        if (t.mode === 'plane' && !t.inbound) {
          // point the plane the way it's flying (the map is always north-up)
          const a = map.project(p), b = map.project(next);
          if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) (el.querySelector('.veh') as HTMLElement).style.transform = `rotate(${Math.atan2(b.x - a.x, a.y - b.y)}rad)`;
        }
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    map.on('move', tick);
    return () => { clearInterval(iv); map.off('move', tick); };
  }, [list, paths]);
  useEffect(() => () => {
    for (const m of markers.current.values()) m.remove();
    markers.current.clear();
    const map = mapHandle.current;
    try { if (map?.getLayer('lv-traffic')) map.removeLayer('lv-traffic'); if (map?.getSource('lv-traffic')) map.removeSource('lv-traffic'); } catch { /* the map is gone */ }
  }, []);
  // switched off: empty the lines
  useEffect(() => {
    if (enabled) return;
    const src = mapHandle.current?.getSource('lv-traffic') as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: [] });
  }, [enabled]);
  return null;
}
