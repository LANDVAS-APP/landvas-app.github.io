// The Leviathan on the map: the creature itself (the same beast, in the same place, for everyone — big enough to see from
// space, colossal up close), the ink trail behind it, the road ahead, the plot it's turned on when enraged, the ink splats
// on trampled plots, and the bones of every Leviathan that ever fell, where it fell.
import { useQuery } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../backend/api';
import { useUi } from '../lib/store';
import { mapHandle } from '../map/mapHandle';
import { cellCenter, cellPolygon } from '../shared/grid';
import { LeviathanArt } from './LeviathanArt';
import { levPos, pathAhead, serverNow, useLeviathan } from './useLeviathan';
import { useLevUi } from './Leviathan';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function LeviathanLayer({ ready }: { ready: boolean }) {
  const q = useLeviathan();
  const l = q.data?.lev ?? null;
  const bones = q.data?.bones ?? [];
  const [node] = useState(() => { const d = document.createElement('div'); d.className = 'lv-lev-marker'; d.dataset.testid = 'map-leviathan'; return d; });
  const marker = useRef<maplibregl.Marker | null>(null);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [paused, setPaused] = useState(false);
  const bbox = useUi((s) => s.bbox);
  const zoom = useUi((s) => s.view.zoom);
  const trampled = useQuery({ queryKey: ['lev-map', bbox && [bbox.min_gx >> 6, bbox.min_gy >> 6, bbox.max_gx >> 6, bbox.max_gy >> 6]],
    queryFn: () => api.leviathanMap({ min_gx: bbox!.min_gx - 32, min_gy: bbox!.min_gy - 32, max_gx: bbox!.max_gx + 32, max_gy: bbox!.max_gy + 32 }),
    enabled: !!l && !!bbox && zoom >= 14 && bbox.max_gx - bbox.min_gx < 18000, staleTime: 20_000, refetchInterval: 30_000 });

  // the creature: placed every frame from the path and the clock (no jumps between polls)
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !l) return;
    const m = new maplibregl.Marker({ element: node, anchor: 'bottom' });
    marker.current = m;
    const p0 = levPos(l);
    m.setLngLat([p0.lng, p0.lat]).addTo(map);
    node.onclick = (e) => { e.stopPropagation(); useLevUi.getState().open(); };
    let raf = 0, last = 0;
    const size = () => {
      const z = map.getZoom();
      const px = Math.round(Math.max(76, Math.min(380, 76 + (z - 3) * 22)));
      node.style.width = `${px}px`; node.style.height = `${Math.round(px * 0.84)}px`;
    };
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 66) return; last = t;
      const p = levPos(l, serverNow());
      m.setLngLat([p.lng, p.lat]);
      setFacing(Math.sin(p.heading) < 0 ? -1 : 1);
      setPaused(p.paused);
    };
    size(); map.on('zoom', size);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); map.off('zoom', size); m.remove(); marker.current = null; };
  }, [ready, l?.id, l?.walk_at, l?.walk_s, l?.pause_until, l?.speed_kmh, JSON.stringify(l?.path)]); // eslint-disable-line react-hooks/exhaustive-deps

  // its trail, the road ahead, its target
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const draw = () => {
      if (!map.getStyle()) return;
      if (!map.getSource('lv-lev')) {
        map.addSource('lv-lev', { type: 'geojson', data: EMPTY });
        map.addLayer({ id: 'lv-lev-trail-glow', type: 'line', source: 'lv-lev', filter: ['==', ['get', 't'], 'trail'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#B026FF', 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.45 } });
        map.addLayer({ id: 'lv-lev-trail', type: 'line', source: 'lv-lev', filter: ['==', ['get', 't'], 'trail'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2A1260', 'line-width': 5, 'line-opacity': 0.9 } });
        map.addLayer({ id: 'lv-lev-ahead', type: 'line', source: 'lv-lev', filter: ['==', ['get', 't'], 'ahead'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#FF5CDB', 'line-width': 2, 'line-dasharray': [1, 2.5], 'line-opacity': 0.7 } });
        map.addLayer({ id: 'lv-lev-splat', type: 'fill', source: 'lv-lev', filter: ['==', ['get', 't'], 'splat'], paint: { 'fill-color': '#2A0D5C', 'fill-opacity': 0.82 } });
        map.addLayer({ id: 'lv-lev-splat-line', type: 'line', source: 'lv-lev', filter: ['==', ['get', 't'], 'splat'], paint: { 'line-color': '#B026FF', 'line-width': 1.4, 'line-opacity': 0.9 } });
      }
      const feats: GeoJSON.Feature[] = [];
      if (l) {
        const p = levPos(l);
        if (l.trail.length > 1) feats.push({ type: 'Feature', properties: { t: 'trail' }, geometry: { type: 'LineString', coordinates: [...l.trail.map((x) => [Number(x[0]), Number(x[1])]), [p.lng, p.lat]] } });
        feats.push({ type: 'Feature', properties: { t: 'ahead' }, geometry: { type: 'LineString', coordinates: pathAhead(l, p) } });
      }
      for (const s of trampled.data ?? []) feats.push({ type: 'Feature', properties: { t: 'splat' }, geometry: { type: 'Polygon', coordinates: [cellPolygon(s.gx, s.gy)] } });
      (map.getSource('lv-lev') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
    };
    draw();
    const t = setInterval(draw, 15000);
    map.on('styledata', draw);
    return () => { clearInterval(t); map.off('styledata', draw); };
  }, [ready, l?.id, l?.trail?.length, JSON.stringify(l?.path), trampled.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // the enraged target, and the bones of the fallen
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const ms: maplibregl.Marker[] = [];
    if (l?.target) {
      const n = document.createElement('div'); n.className = 'lv-lev-target'; n.innerHTML = `<i></i><b>🎯 @${l.target.owner_name}</b>`;
      ms.push(new maplibregl.Marker({ element: holder(n) }).setLngLat(cellCenter(l.target.gx, l.target.gy)).addTo(map));
    }
    for (const b of bones) {
      const n = document.createElement('button'); n.className = 'lv-bones'; n.innerHTML = '<span>🦴</span><i>💀</i>';
      n.title = `Leviathan #${b.gen} fell here${b.place ? ` (${b.place})` : ''} · ${b.players} fought it${b.top ? ` · top: @${b.top}` : ''}`;
      n.dataset.testid = 'map-bones';
      n.addEventListener('click', (e) => { e.stopPropagation(); useLevUi.getState().showBones(b); });
      ms.push(new maplibregl.Marker({ element: holder(n), anchor: 'bottom' }).setLngLat([b.lng, b.lat]).addTo(map));
    }
    return () => ms.forEach((m) => m.remove());
  }, [ready, l?.target?.gx, l?.target?.gy, bones.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!l) return null;
  return createPortal(<LeviathanArt status={l.status} paused={paused} shrunk={!!l.shrunk_until && Date.parse(l.shrunk_until) > serverNow()} foretold={!!l.foretold_until && Date.parse(l.foretold_until) > serverNow()} facing={facing} className="h-full w-full" />, node);
}

/** the map moves a marker's own element (position and transform): what's styled and animated lives inside it */
function holder(n: HTMLElement) { const d = document.createElement('div'); d.appendChild(n); return d; }
