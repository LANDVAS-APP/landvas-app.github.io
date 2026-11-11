// The Hot Zone on the full map: a glowing circle over today's city (it stays when plots are hidden — it's light),
// and a chip that flies you there.
import { useEffect, useState } from 'react';
import { mapHandle } from '../map/mapHandle';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { GRID_SIZE } from '../shared/grid';
import { endsIn, hotCenter, useHotZone } from './HotZone';

const SRC = 'lv-hot';
function circle(z: { gx: number; gy: number; radius: number }): GeoJSON.Feature {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const gx = z.gx + Math.cos(t) * z.radius, gy = z.gy + Math.sin(t) * z.radius;
    const lng = (gx / GRID_SIZE) * 360 - 180, n = Math.PI * (1 - (2 * gy) / GRID_SIZE);
    pts.push([lng, (180 / Math.PI) * Math.atan(Math.sinh(n))]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

/** draws today's zone on the map (re-adds itself if the map is rebuilt) */
export function HotZoneLayer() {
  const q = useHotZone();
  const z = q.data?.today;
  // wait for the map (it's built, and rebuilt for the Lite map, by WorldMap)
  const [map, setMap] = useState(mapHandle.current);
  useEffect(() => { const t = setInterval(() => { if (mapHandle.current !== map) setMap(mapHandle.current); }, 1000); return () => clearInterval(t); }, [map]);
  useEffect(() => {
    if (!map || !z) return;
    const add = () => {
      if (!map.isStyleLoaded() || map.getSource(SRC)) return;
      map.addSource(SRC, { type: 'geojson', data: circle(z) });
      map.addLayer({ id: 'lv-hot-fill', type: 'fill', source: SRC, paint: { 'fill-color': '#FF6A1F', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.35, 12, 0.08] } });
      map.addLayer({ id: 'lv-hot-line', type: 'line', source: SRC, paint: { 'line-color': '#FFB27A', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 14, 4], 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } });
    };
    add();
    map.on('styledata', add);
    return () => {
      map.off('styledata', add);
      try { for (const l of ['lv-hot-line', 'lv-hot-fill']) if (map.getLayer(l)) map.removeLayer(l); if (map.getSource(SRC)) map.removeSource(SRC); } catch { /* map gone */ }
    };
  }, [map, z?.gx, z?.gy, z?.radius]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** the HUD chip: today's city, tap to fly there */
export function HotZoneChip({ className }: { className?: string }) {
  const q = useHotZone();
  const requestFly = useUi((s) => s.requestFly);
  const z = q.data?.today;
  if (!z) return null;
  return (
    <button className={cn('pointer-events-auto lv-hud !h-9 gap-1.5 !rounded-full !px-3 text-[12px] font-extrabold', className)} data-testid="hot-zone-chip"
      onClick={() => { const [lng, lat] = hotCenter(z); requestFly({ lng, lat, zoom: 9.5 }); }} title={`Today’s Hot Zone: better rarities in ${z.name} for ${endsIn(q.data!.ends_at)}`}>
      <span className="animate-pulse">🔥</span><span className="max-w-[110px] truncate">{z.name}</span><span className="text-white/50">· {endsIn(q.data!.ends_at)}</span>
    </button>
  );
}
