// The Leviathan on the map: the creature itself (the same beast, in the same place, for everyone — big enough to see from
// space, colossal up close), the ink trail behind it, the road ahead, the plot it's turned on when enraged, the ink splats
// on trampled plots, and the bones of every Leviathan that ever fell, where it fell.
// Its powers show here too: TINY (a speck in a ring), HIDDEN (gone — only a hazy area; zoom in and pan around to search:
// it tells you hot or cold, and when it's in view you've found it), and the owner's RAMPAGE (speed streaks, red).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { newMarker } from '../map/maplib';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api, type Leviathan } from '../backend/api';
import { feel } from '../enchant/living';
import { useUi } from '../lib/store';
import { mapHandle } from '../map/mapHandle';
import { cellCenter, cellPolygon } from '../shared/grid';
import { LeviathanArt } from './LeviathanArt';
import { LEV_KEY, levHidden, levPos, levRampage, levTiny, pathAhead, serverNow, useLeviathan } from './useLeviathan';
import { useLevUi } from './Leviathan';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
/** a circle on the map, km across from its middle */
function circle(lng: number, lat: number, km: number, n = 64): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([lng + (km * Math.sin(a)) / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180))), lat + (km * Math.cos(a)) / 111.32]);
  }
  return out;
}

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

  const tiny = !!l && levTiny(l), rampage = !!l && levRampage(l);
  // the creature: placed every frame from the path and the clock (no jumps between polls) — unless it's hidden from you
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !l || !l.path) return;
    const m = newMarker({ element: node, anchor: 'bottom' });
    marker.current = m;
    const p0 = levPos(l);
    m.setLngLat([p0.lng, p0.lat]).addTo(map);
    node.onclick = (e) => { e.stopPropagation(); useLevUi.getState().open(); };
    let raf = 0, last = 0;
    const size = () => {
      const z = map.getZoom();
      // (tiny: a fifth of its size — still there, if you look)
      const px = Math.round(Math.max(76, Math.min(380, 76 + (z - 3) * 22)) * (tiny ? 0.22 : 1));
      node.style.width = `${px}px`; node.style.height = `${Math.round(px * 0.84)}px`;
    };
    node.classList.toggle('tiny', tiny); node.classList.toggle('rampage', rampage);
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
  }, [ready, l?.id, l?.walk_at, l?.walk_s, l?.pause_until, l?.speed_kmh, JSON.stringify(l?.path), tiny, rampage]); // eslint-disable-line react-hooks/exhaustive-deps

  // its trail, the road ahead, its target (hidden: only the hazy area it's somewhere in)
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
        map.addLayer({ id: 'lv-lev-haze', type: 'fill', source: 'lv-lev', filter: ['==', ['get', 't'], 'haze'], paint: { 'fill-color': '#6B2BD9', 'fill-opacity': 0.16 } });
        map.addLayer({ id: 'lv-lev-haze-line', type: 'line', source: 'lv-lev', filter: ['==', ['get', 't'], 'haze'], paint: { 'line-color': '#C9A0FF', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } });
      }
      const feats: GeoJSON.Feature[] = [];
      if (l) {
        const p = levPos(l);
        if (l.path) {
          if (l.trail.length > 1) feats.push({ type: 'Feature', properties: { t: 'trail' }, geometry: { type: 'LineString', coordinates: [...l.trail.map((x) => [Number(x[0]), Number(x[1])]), [p.lng, p.lat]] } });
          feats.push({ type: 'Feature', properties: { t: 'ahead' }, geometry: { type: 'LineString', coordinates: pathAhead(l, p) } });
        } else {
          // the trail stops where it vanished
          if (l.trail.length > 1) feats.push({ type: 'Feature', properties: { t: 'trail' }, geometry: { type: 'LineString', coordinates: l.trail.map((x) => [Number(x[0]), Number(x[1])]) } });
          if (l.haze) feats.push({ type: 'Feature', properties: { t: 'haze' }, geometry: { type: 'Polygon', coordinates: [circle(Number(l.haze.lng), Number(l.haze.lat), Number(l.haze.km))] } });
        }
      }
      for (const s of trampled.data ?? []) feats.push({ type: 'Feature', properties: { t: 'splat' }, geometry: { type: 'Polygon', coordinates: [cellPolygon(s.gx, s.gy)] } });
      (map.getSource('lv-lev') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
    };
    draw();
    const t = setInterval(draw, 15000);
    map.on('styledata', draw);
    return () => { clearInterval(t); map.off('styledata', draw); };
  }, [ready, l?.id, l?.trail?.length, JSON.stringify(l?.path), JSON.stringify(l?.haze), trampled.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // the enraged target, and the bones of the fallen
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const ms: maplibregl.Marker[] = [];
    // where it's heading: the places the owner aimed it at, or the plot it turned on when enraged
    const aims: [number, number][] = l?.targets?.length ? l.targets.map((t) => [Number(t[0]), Number(t[1])])
      : l?.target && l.target.gx != null && l.target.gy != null ? [cellCenter(l.target.gx, l.target.gy)] : [];
    aims.forEach((pt, i) => {
      const n = document.createElement('div'); n.className = 'lv-lev-target'; n.innerHTML = `<i></i>${i === 0 && l?.target?.owner_name ? `<b>🎯 @${l.target.owner_name}</b>` : '<b>🎯</b>'}`;
      ms.push(newMarker({ element: holder(n) }).setLngLat(pt).addTo(map));
    });
    // hidden: a question mark in the middle of the haze
    if (l && !l.path && l.haze) {
      const n = document.createElement('button'); n.className = 'lv-lev-haze-mark'; n.innerHTML = '<span>🫥</span><b>Hiding somewhere in here — zoom in to search</b>';
      n.dataset.testid = 'map-lev-haze';
      n.addEventListener('click', (e) => { e.stopPropagation(); useUi.getState().requestFly({ lng: Number(l.haze!.lng), lat: Number(l.haze!.lat), zoom: 9.6 }); });
      ms.push(newMarker({ element: holder(n) }).setLngLat([Number(l.haze.lng), Number(l.haze.lat)]).addTo(map));
    }
    for (const b of bones) {
      const n = document.createElement('button'); n.className = 'lv-bones'; n.innerHTML = '<span>🦴</span><i>💀</i>';
      n.title = `Leviathan #${b.gen} fell here${b.place ? ` (${b.place})` : ''} · ${b.players} fought it${b.top ? ` · top: @${b.top}` : ''}`;
      n.dataset.testid = 'map-bones';
      n.addEventListener('click', (e) => { e.stopPropagation(); useLevUi.getState().showBones(b); });
      ms.push(newMarker({ element: holder(n), anchor: 'bottom' }).setLngLat([b.lng, b.lat]).addTo(map));
    }
    return () => ms.forEach((m) => m.remove());
  }, [ready, l?.target?.gx, l?.target?.gy, l?.target?.owner_name, JSON.stringify(l?.targets), JSON.stringify(l?.haze), !!l?.path, bones.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const hint = useSeek(ready, l);

  if (!l) return null;
  if (!l.path) return hint ? <SeekChip hint={hint} /> : null;
  return createPortal(<LeviathanArt status={l.status} paused={paused} shrunk={!!l.shrunk_until && Date.parse(l.shrunk_until) > serverNow()} foretold={!!l.foretold_until && Date.parse(l.foretold_until) > serverNow()} facing={facing} className="h-full w-full" />, node);
}

/** the map moves a marker's own element (position and transform): what's styled and animated lives inside it */
function holder(n: HTMLElement) { const d = document.createElement('div'); d.appendChild(n); return d; }

type Hint = 'zoom' | 'cold' | 'warm' | 'hot' | 'looking';
/** a hidden Leviathan: every time the map stops moving (zoomed in), look at what's on screen */
function useSeek(ready: boolean, l: Leviathan | null) {
  const qc = useQueryClient();
  const [hint, setHint] = useState<Hint | null>(null);
  const hidden = !!l && !l.path && levHidden(l);
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !hidden) { setHint(null); return; }
    let t = 0, alive = true;
    const look = () => {
      clearTimeout(t);
      t = window.setTimeout(async () => {
        if (map.getZoom() < 7.5) { setHint('zoom'); return; }
        const b = map.getBounds();
        try {
          const r = await api.leviathanSeek(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
          if (!alive) return;
          if (r.found) {
            setHint(null); feel('success');
            toast.success(r.first ? `🐉 You found the Leviathan first! +${r.ink ?? 0} Ink` : `🐉 You found the Leviathan!${r.ink ? ` +${r.ink} Ink` : ''}`, { description: 'You can see it and fight it now (you’ll lose sight of it in 15 minutes).' });
            void qc.invalidateQueries({ queryKey: LEV_KEY });
          } else if (r.too_wide) setHint('zoom');
          else if (r.hint) setHint(r.hint);
          else if (r.hidden === false) void qc.invalidateQueries({ queryKey: LEV_KEY });
        } catch { /* the map carries on */ }
      }, 650);
    };
    setHint('looking');
    look(); map.on('moveend', look);
    return () => { alive = false; clearTimeout(t); map.off('moveend', look); };
  }, [ready, hidden, l?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return hint;
}

const HINTS: Record<Hint, [string, string]> = {
  zoom: ['🫥', 'The Leviathan is hiding — zoom in on the haze and look around'],
  looking: ['🔍', 'Looking…'],
  cold: ['🧊', 'Cold — it’s not around here'],
  warm: ['🌡️', 'Warm… it’s close'],
  hot: ['🔥', 'HOT — it’s right near here!'],
};
function SeekChip({ hint }: { hint: Hint }) {
  const [e, text] = HINTS[hint];
  return createPortal(<div className={`lv-lev-seek ${hint}`} data-testid="lev-seek" data-hint={hint}><span>{e}</span><b>{text}</b></div>, document.body);
}
