// The map while an enchantment is picking one of your plots: the plots you can pick wear crosshairs (the rest of the map
// dims), tap one, then "Use this plot" takes you back to the enchantment with it chosen.
import type * as maplibregl from 'maplibre-gl';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../lib/store';
import { flyAway } from '../lib/toMap';
import { cn } from '../lib/utils';
import { newMarker } from '../map/maplib';
import { mapHandle } from '../map/mapHandle';
import { isNative } from '../native/native';
import { cellCenter, cellPolygon } from '../shared/grid';
import { rarityInfo } from '../shared/rarity';
import { Button } from '../ui';
import { feel } from './living';
import { usePlotPick, type PickSpec } from './plotPick';
import { plotLabel } from './sizeray';

/** "Pick it on the map": start picking and go to the map (closing the Grimoire if it's a sheet over the map) */
export function usePickOnMapFor() {
  const nav = useNavigate();
  return (spec: PickSpec) => {
    usePlotPick.getState().start(spec);
    import('./GrimoireButton').then((m) => m.useGrimoireSheet.getState().set(false)).catch(() => {});
    nav('/world');
  };
}

/** the app's HUD card lit in the enchantment's colour (an .lv-mcard needs its colours, or it's see-through) */
const tint = (c: string) => ({ '--r1': '#ffffff', '--r2': c, '--r3': `${c}55`, '--tint': `${c}55`, '--g': `${c}99` }) as React.CSSProperties;

export function PlotPickOverlay() {
  const spec = usePlotPick((s) => s.spec);
  if (!spec) return null;
  return <Picking key={`${spec.id}:${spec.slot}`} spec={spec} />;
}

function Picking({ spec }: { spec: PickSpec }) {
  const nav = useNavigate();
  const tapped = usePlotPick((s) => s.tapped);
  const bbox = useUi((s) => s.bbox);
  const markers = useRef<maplibregl.Marker[]>([]);
  const list = spec.allowed;
  const plot = tapped ? (spec.free ? { gx: tapped.gx, gy: tapped.gy, rarity: 'common', name: null, note: 'this spot' } : list.find((p) => p.gx === tapped.gx && p.gy === tapped.gy) ?? null) : null;
  // dim the map; fly to the plots if none is on screen
  useEffect(() => {
    document.documentElement.classList.add('lv-targeting');
    const z = mapHandle.current?.getZoom() ?? 0;
    const inView = !!bbox && z >= 15 && list.some((p) => p.gx >= bbox.min_gx && p.gx <= bbox.max_gx && p.gy >= bbox.min_gy && p.gy <= bbox.max_gy);
    const first = list[0] ?? (spec.free?.anchors[0] ? { gx: spec.free.anchors[0][0], gy: spec.free.anchors[0][1] } : null);
    if (first && !inView) { const [lng, lat] = cellCenter(first.gx, first.gy); flyAway({ lng, lat, zoom: spec.free ? 17.2 : 18.4 }); }
    return () => document.documentElement.classList.remove('lv-targeting');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // crosshairs on the plots you can pick
  useEffect(() => {
    const map = mapHandle.current;
    if (!map || !bbox) return;
    const src = 'lv-pick-targets';
    const visible = list.filter((p) => p.gx >= bbox.min_gx - 40 && p.gx <= bbox.max_gx + 40 && p.gy >= bbox.min_gy - 40 && p.gy <= bbox.max_gy + 40).slice(0, 120);
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: visible.map((p) => ({ type: 'Feature', properties: { on: tapped?.gx === p.gx && tapped?.gy === p.gy ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: [cellPolygon(p.gx, p.gy)] } })) };
    if (!map.getSource(src)) {
      map.addSource(src, { type: 'geojson', data });
      map.addLayer({ id: 'lv-pick-glow', type: 'line', source: src, paint: { 'line-color': spec.color, 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.75 } });
      map.addLayer({ id: 'lv-pick-line', type: 'line', source: src, paint: { 'line-color': ['case', ['==', ['get', 'on'], 1], '#ffffff', spec.color], 'line-width': ['case', ['==', ['get', 'on'], 1], 4, 2] } });
    } else (map.getSource(src) as maplibregl.GeoJSONSource).setData(data);
    for (const m of markers.current) m.remove();
    markers.current = visible.slice(0, 60).map((p) => {
      const el = document.createElement('button');
      const on = tapped?.gx === p.gx && tapped?.gy === p.gy;
      el.className = `lv-crosshair${on ? ' on' : ''}`; el.style.setProperty('--c', spec.color);
      el.dataset.testid = 'pick-crosshair';
      el.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
      el.addEventListener('click', (ev) => { ev.stopPropagation(); feel('medium'); usePlotPick.getState().tap({ gx: p.gx, gy: p.gy }); });
      // (above the creatures and chests on the plots, so the tap is the pick)
      const holder = document.createElement('div'); holder.style.zIndex = '30'; holder.appendChild(el);
      return newMarker({ element: holder }).setLngLat(cellCenter(p.gx, p.gy)).addTo(map);
    });
    return () => { for (const m of markers.current) m.remove(); markers.current = []; };
  }, [bbox, tapped, list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // a free pick: how far it reaches (a ring round each anchor) and the spot you tapped
  useEffect(() => {
    const map = mapHandle.current;
    if (!map || !spec.free) return;
    const src = 'lv-pick-free';
    const ring = (gx: number, gy: number, m: number): [number, number][] => {
      const [lng, lat] = cellCenter(gx, gy);
      const dLat = m / 111_320, dLng = m / (111_320 * Math.cos((lat * Math.PI) / 180));
      return Array.from({ length: 65 }, (_, i) => { const a = (i / 64) * Math.PI * 2; return [lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat] as [number, number]; });
    };
    const feats: GeoJSON.Feature[] = [];
    if (spec.free.radiusM) for (const [gx, gy] of spec.free.anchors.slice(0, 40)) feats.push({ type: 'Feature', properties: { t: 'ring' }, geometry: { type: 'Polygon', coordinates: [ring(gx, gy, spec.free.radiusM)] } });
    if (tapped) feats.push({ type: 'Feature', properties: { t: 'spot' }, geometry: { type: 'Polygon', coordinates: [cellPolygon(tapped.gx, tapped.gy)] } });
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: feats };
    if (!map.getSource(src)) {
      map.addSource(src, { type: 'geojson', data });
      map.addLayer({ id: 'lv-pick-free-fill', type: 'fill', source: src, filter: ['==', ['get', 't'], 'ring'], paint: { 'fill-color': spec.color, 'fill-opacity': 0.07 } });
      map.addLayer({ id: 'lv-pick-free-ring', type: 'line', source: src, filter: ['==', ['get', 't'], 'ring'], paint: { 'line-color': spec.color, 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } });
      map.addLayer({ id: 'lv-pick-free-spot', type: 'line', source: src, filter: ['==', ['get', 't'], 'spot'], paint: { 'line-color': '#ffffff', 'line-width': 4 } });
    } else (map.getSource(src) as maplibregl.GeoJSONSource).setData(data);
  }, [tapped, spec.free?.radiusM]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    const map = mapHandle.current;
    for (const l of ['lv-pick-glow', 'lv-pick-line', 'lv-pick-free-fill', 'lv-pick-free-ring', 'lv-pick-free-spot']) if (map?.getLayer(l)) map.removeLayer(l);
    if (map?.getSource('lv-pick-targets')) map.removeSource('lv-pick-targets');
    if (map?.getSource('lv-pick-free')) map.removeSource('lv-pick-free');
  }, []);
  const back = () => { usePlotPick.getState().cancel(); nav(spec.back); };
  const use = () => { if (!plot) return; feel('success'); usePlotPick.getState().finish(plot); nav(spec.back); };
  const app = isNative();
  return createPortal(
    <>
      <div className={cn('pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center px-3', app ? 'pt-[max(12px,env(safe-area-inset-top,0px))]' : 'pt-3')}>
        <motion.div className={cn('pointer-events-auto grid w-[min(420px,100%)] gap-1.5 p-3', app ? 'lv-mcard' : 'rounded-3xl border bg-[#0B0820]/92 shadow-2xl backdrop-blur')} style={app ? tint(spec.color) : { borderColor: `${spec.color}66` }}
          initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-testid="pick-card">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{spec.emoji}</span>
            <div className="min-w-0 flex-1 leading-tight"><div className="font-display text-[17px] font-black text-white">{spec.title}</div>
              <div className="text-[12px] font-semibold text-white/70">{spec.hint}</div></div>
            <button className="lv-x" onClick={back} aria-label="Stop picking" data-testid="pick-cancel">×</button>
          </div>
          {!list.length && !spec.free && <p className="text-[12px] font-bold text-white/70">None of your plots can be picked for this.</p>}
        </motion.div>
      </div>
      <AnimatePresence>
        {tapped && (
          <motion.div className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+90px)] md:pb-6" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
            <div className={cn('pointer-events-auto grid w-[min(420px,100%)] gap-2.5 p-3', app ? 'lv-mcard' : 'rounded-3xl border border-white/15 bg-[#0B0820]/94 shadow-2xl backdrop-blur')} style={app ? tint(spec.color) : undefined} data-testid="pick-sheet">
              {plot ? (
                <>
                  {spec.free ? <div className="text-[13px] font-black">{spec.emoji} This spot <span className="text-[11px] font-bold text-white/60">({plot.gx}, {plot.gy})</span></div> : (
                  <div className="flex items-center gap-2 text-[13px] font-black"><span className="h-3 w-3 rounded" style={{ background: rarityInfo(plot.rarity).color }} />
                    <span className="min-w-0 flex-1 truncate">{plotLabel(plot)} · <span style={{ color: rarityInfo(plot.rarity).color }}>{rarityInfo(plot.rarity).name}</span></span>
                    {plot.note && <span className="shrink-0 text-[11px] font-bold text-white/60">{plot.note}</span>}</div>)}
                  <Button variant="rainbow" size="lg" onClick={use} data-testid="pick-use">{spec.emoji} {spec.free?.use ?? 'Use this plot'}</Button>
                </>
              ) : (
                <div className="rounded-xl bg-white/10 px-2.5 py-2 text-[12px] font-bold text-white/75" data-testid="pick-refuse">{spec.refuse ?? 'Pick one of the plots in crosshairs.'}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>, document.body);
}
