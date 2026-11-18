// 🪢 Footprints on the map (the apps): your Lasso walk's loop and your party's, as an ink line round a faint wash, for
// the day they last. One small call (the same the Lasso screen makes), kept a minute and asked again every five.
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { mapHandle } from '../map/mapHandle';
import { isNative } from '../native/native';
import type { LassoLoop } from './types';

export const LASSO_KEY = ['lasso'];

/** the loops as map features: a polygon each, yours a little stronger */
export function lassoFeatures(loops: LassoLoop[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: loops.filter((l) => l.ring.length >= 3).map((l) => ({
      type: 'Feature', properties: { mine: l.mine, name: l.mine ? 'Your Footprint' : `@${l.who?.username ?? ''}`, color: l.mine ? '#FF5CDB' : (l.who?.accent_color || '#22E3FF') },
      geometry: { type: 'Polygon', coordinates: [[...l.ring, l.ring[0]]] },
    })),
  };
}

export function useLassoView(on = true) {
  const me = useOnboardedMe();
  return useQuery({ queryKey: LASSO_KEY, queryFn: api.lassoView, enabled: on && !!me && isNative(), staleTime: 60_000, refetchInterval: 5 * 60_000 });
}

export function LassoLayer({ ready }: { ready: boolean }) {
  const q = useLassoView();
  const loops = q.data?.loops ?? [];
  const key = loops.map((l) => `${l.id}:${l.expires_at}`).join(',');
  useEffect(() => {
    if (!ready) return;
    const data = lassoFeatures(loops);
    let off = () => {}, t = 0;
    const attach = (map: maplibregl.Map) => {
      let done = false;
      const draw = () => {
        if (done) return;
        const src = map.getSource('lv-lasso') as maplibregl.GeoJSONSource | undefined;
        if (src) { src.setData(data); done = true; return; }
        if (!map.getStyle()) return;
        map.addSource('lv-lasso', { type: 'geojson', data });
        map.addLayer({ id: 'lv-lasso-fill', type: 'fill', source: 'lv-lasso', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'mine'], 0.14, 0.08] } });
        map.addLayer({ id: 'lv-lasso-glow', type: 'line', source: 'lv-lasso', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.35 } });
        map.addLayer({ id: 'lv-lasso-line', type: 'line', source: 'lv-lasso', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'mine'], 3.2, 2.2], 'line-dasharray': [2, 1.4] } });
        done = true;
      };
      draw();
      // (not ready yet, or a new map look dropped the layers: try again when the style settles)
      const again = () => { if (!map.getSource('lv-lasso')) done = false; draw(); };
      map.on('styledata', again);
      map.on('idle', again);
      off = () => { map.off('styledata', again); map.off('idle', again); };
    };
    // (back from a parked map, the map is handed back just after this layer's effect has run: wait a moment for it)
    const find = (tries: number) => {
      const map = mapHandle.current;
      if (map) attach(map);
      else if (tries < 60) t = window.setTimeout(() => find(tries + 1), 50);
    };
    find(0);
    return () => { clearTimeout(t); off(); };
  }, [ready, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
