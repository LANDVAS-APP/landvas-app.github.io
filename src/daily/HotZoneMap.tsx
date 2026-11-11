// The Hot Zone on the full map: a glowing circle over today's city (it stays when plots are hidden — it's light),
// and a chip that flies you there.
import * as maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { mapHandle } from '../map/mapHandle';
import { useUi } from '../lib/store';
import { useExplorer } from '../explorer/explorer';
import { Button, Dialog } from '../ui';
import { useFly } from '../travel/Fly';
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
    const click = () => { if (map.getZoom() < 9) flyToHotZone(z); };
    const enter = () => { if (map.getZoom() < 9) map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('click', 'lv-hot-fill', click); map.on('mouseenter', 'lv-hot-fill', enter); map.on('mouseleave', 'lv-hot-fill', leave);
    // a pin that stays readable at every zoom (the circle alone is a dot from far out)
    const el = document.createElement('button');
    el.className = 'lv-hot-pin'; el.setAttribute('data-testid', 'hot-zone-pin');
    el.innerHTML = `<span class="f">🔥</span><span class="t"><b></b><i>HOT ZONE</i></span>`;
    (el.querySelector('b') as HTMLElement).textContent = z.name;
    el.addEventListener('click', (e) => { e.stopPropagation(); flyToHotZone(z); });
    const [lng, lat] = hotCenter(z);
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
    const zoom = () => { el.style.display = map.getZoom() < 11 ? '' : 'none'; };
    zoom(); map.on('zoom', zoom);
    return () => {
      marker.remove(); map.off('zoom', zoom);
      map.off('styledata', add);
      map.off('click', 'lv-hot-fill', click); map.off('mouseenter', 'lv-hot-fill', enter); map.off('mouseleave', 'lv-hot-fill', leave);
      try { for (const l of ['lv-hot-line', 'lv-hot-fill']) if (map.getLayer(l)) map.removeLayer(l); if (map.getSource(SRC)) map.removeSource(SRC); } catch { /* map gone */ }
    };
  }, [map, z?.gx, z?.gy, z?.radius]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** fly the map to today's zone (and stop following the explorer, which would pull the map straight back) */
export function flyToHotZone(z: { gx: number; gy: number }) {
  const [lng, lat] = hotCenter(z);
  useExplorer.getState().setFollowing(false);
  useUi.getState().requestFly({ lng, lat, zoom: 10.5 });
}

/** the HUD chip: today's city — tap for the Hot Zone sheet (fly there, or roll a plot there) */
export function HotZoneChip({ className, onRoll }: { className?: string; onRoll(): void }) {
  const q = useHotZone();
  const [open, setOpen] = useState(false);
  const fly = useFly();
  const z = q.data?.today;
  if (!z) return null;
  return (
    <>
      <button className={cn('pointer-events-auto lv-hud !h-9 gap-1.5 !rounded-full !px-3 text-[12px] font-extrabold', className)} data-testid="hot-zone-chip"
        onClick={() => setOpen(true)} title={`Today’s Hot Zone: better rarities in ${z.name}`}>
        <span className="animate-pulse">🔥</span><span className="max-w-[110px] truncate">{z.name}</span><span className="text-white/50">· {endsIn(q.data!.ends_at)}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={`🔥 Hot Zone: ${z.name}`} description={`Today only — ${endsIn(q.data!.ends_at)} left. Plots claimed here roll better.`}>
        <div className="grid gap-3" data-testid="hot-zone-sheet">
          <ul className="grid gap-1.5 text-sm">
            <li>🎲 The better of two rarity rolls</li>
            <li>🌌 Ultra rarities {q.data!.ultra_mult}× likelier</li>
            <li>✨ Shiny {q.data!.shiny_mult}× likelier</li>
            <li>{q.data!.crown_free ? `👑 ${z.name}’s Crown is up for grabs!` : `👑 ${z.name}’s Crown is taken`}</li>
          </ul>
          <div className="grid gap-2">
            <Button variant="rainbow" onClick={() => { setOpen(false); const [lng, lat] = hotCenter(z); void fly(lng, lat, `Hot Zone · ${z.name}`); }} data-testid="hot-zone-fly">✈️ Fly there · pick your own plots (100 Ink each)</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => { setOpen(false); flyToHotZone(z); }} data-testid="hot-zone-look">🗺️ Just look</Button>
              <Button variant="secondary" onClick={() => { setOpen(false); onRoll(); }} data-testid="hot-zone-roll-map">🎲 Roll there · {q.data!.roll_ink ?? 150} Ink</Button>
            </div>
            <p className="text-[11px] text-muted">✈️ Flying uses 1 of your 2 trips today; once you land, claim any plot around you at the normal price. 🎲 A roll drops you a random plot in the zone for {q.data!.roll_ink ?? 150} Ink — no trip needed.</p>
          </div>
          {q.data!.tomorrow && <p className="text-xs text-muted">Tomorrow’s Hot Zone: {q.data!.tomorrow.name}</p>}
        </div>
      </Dialog>
    </>
  );
}
