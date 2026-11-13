// A world map of plots on the game's own base map: dots in rarity colours far out, the real plot squares close in.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { resolveStyle, themeColors } from '../../src/map/basemap';
import { cellCenter, cellPolygon } from '../../src/shared/grid';
import { rarityInfo } from '../../src/shared/rarity';
import { cn } from '../../src/lib/utils';

maplibregl.setWorkerUrl(workerUrl);

export type MapPlot = { gx: number; gy: number; rarity: string; title?: string; sub?: string; id?: string; shiny?: boolean };

export function PlotMap({ plots, onPick, focus, height = 460, className, colorBy }: {
  plots: MapPlot[];
  onPick?: (p: MapPlot) => void;
  /** fly here (e.g. the plot picked in a list) */
  focus?: { gx: number; gy: number; zoom?: number } | null;
  height?: number | string;
  className?: string;
  /** colour by something other than rarity */
  colorBy?: (p: MapPlot) => string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  const byKey = useRef(new Map<string, MapPlot>());

  const data = useMemo(() => {
    byKey.current = new Map(plots.map((p) => [`${p.gx}_${p.gy}`, p]));
    const color = (p: MapPlot) => (colorBy ? colorBy(p) : rarityInfo(p.rarity).color || '#8b6bff');
    return {
      points: { type: 'FeatureCollection', features: plots.map((p) => ({ type: 'Feature', properties: { k: `${p.gx}_${p.gy}`, c: color(p), s: p.shiny ? 1 : 0 }, geometry: { type: 'Point', coordinates: cellCenter(p.gx, p.gy) } })) },
      cells: { type: 'FeatureCollection', features: plots.map((p) => ({ type: 'Feature', properties: { k: `${p.gx}_${p.gy}`, c: color(p) }, geometry: { type: 'Polygon', coordinates: [cellPolygon(p.gx, p.gy)] } })) },
    } as const;
  }, [plots, colorBy]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { style } = await resolveStyle(themeColors());
        if (cancelled || !el.current) return;
        const m = new maplibregl.Map({ container: el.current, style: style as any, center: [0, 25], zoom: 1.2, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        m.touchZoomRotate.disableRotation();
        map.current = m;
        m.on('load', () => {
          m.addSource('pl-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addSource('pl-cells', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addLayer({ id: 'pl-cells', type: 'fill', source: 'pl-cells', minzoom: 15, paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.55, 'fill-outline-color': ['get', 'c'] } });
          m.addLayer({ id: 'pl-cells-line', type: 'line', source: 'pl-cells', minzoom: 15, paint: { 'line-color': ['get', 'c'], 'line-width': 1.5 } });
          m.addLayer({
            id: 'pl-dots', type: 'circle', source: 'pl-points', maxzoom: 17,
            paint: {
              'circle-color': ['get', 'c'],
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 8, 4, 14, 6, 16.5, 3],
              'circle-stroke-color': '#070b1c', 'circle-stroke-width': 1.5,
              'circle-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 1, 17, 0],
              'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 1, 17, 0],
            },
          });
          for (const layer of ['pl-dots', 'pl-cells']) {
            m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
            m.on('click', layer, (e) => {
              const k = e.features?.[0]?.properties?.k as string | undefined;
              const p = k ? byKey.current.get(k) : undefined;
              if (!p) return;
              if (pick.current) pick.current(p);
              if (p.title) new maplibregl.Popup({ closeButton: false, offset: 8 }).setLngLat(cellCenter(p.gx, p.gy)).setHTML(`<b>${esc(p.title)}</b>${p.sub ? `<div style="color:var(--muted);margin-top:2px">${esc(p.sub)}</div>` : ''}`).addTo(m);
            });
          }
          setReady(true);
        });
      } catch (e) {
        console.error(e);
        setFailed(true);
      }
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // data in, then frame it
  const framed = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource('pl-points') as GeoJSONSource).setData(data.points as any);
    (m.getSource('pl-cells') as GeoJSONSource).setData(data.cells as any);
    if (!framed.current && plots.length && !focus) {
      framed.current = true;
      const b = new maplibregl.LngLatBounds();
      for (const p of plots) b.extend(cellCenter(p.gx, p.gy));
      m.fitBounds(b, { padding: 50, maxZoom: plots.length === 1 ? 17 : 15, duration: 0 });
    }
  }, [ready, data, plots, focus]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !focus) return;
    framed.current = true;
    m.flyTo({ center: cellCenter(focus.gx, focus.gy), zoom: focus.zoom ?? 18, duration: 900 });
  }, [ready, focus]);

  return (
    <div className={cn('p-map relative overflow-hidden rounded-2xl border border-line bg-[var(--map-ocean)]', className)} style={{ height }}>
      <div ref={el} className="h-full w-full" />
      {failed && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">The map couldn’t load here.</div>}
    </div>
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
