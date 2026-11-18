// Out on the map, live: your Pocket Suns (and your party's shared ones) — a burning disc and its corona over the zone,
// the zone itself as a glowing circle, and your sunspots blinking inside it — and storms: a thundercloud over the Storm
// Coil and every bolt gathering and striking where it lands, on the server's own clock. Tap your own bolts to catch
// them; anyone can catch a stray that lands on a neighbour's plot. And the plots in your Origami pocket, carried where you
// stand on real GPS.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type EnchantMap2, type MapStorm } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { mapHandle } from '../map/mapHandle';
import { newMarker } from '../map/maplib';
import { cellCenter } from '../shared/grid';
import { feel } from './living';
import './scenes/dejavu.css';

const SUN_ZOOM = 13.5;
const STORM_ZOOM = 12.5;
const ZZ = '<svg class="zz" viewBox="0 0 30 220" aria-hidden="true"><path d="M15 0 L4 92 L14 92 L2 220 L28 70 L17 70 L26 0 Z" fill="#E8F6FF" stroke="#7DF9FF" stroke-width="2"/></svg>';
const ring = (gx: number, gy: number, m: number) => {
  const [lng, lat] = cellCenter(gx, gy);
  const dLat = m / 111_320, dLng = m / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]; });
};
/** 🫙 each moment a Déjà Vu let out of its jar, as a circle on the map */
function echoGeo(list: NonNullable<EnchantMap2['echoes']>) {
  return { type: 'FeatureCollection', features: list.map((z) => ({ type: 'Feature', properties: { c: z.flare ? '#FDE68A' : '#A78BFA' },
    geometry: { type: 'Polygon', coordinates: [ring(Number(z.gx), Number(z.gy), Number(z.r_m))] } })) };
}
/** each sun's zone as a circle on the map */
function sunGeo(list: EnchantMap2['suns']) {
  return { type: 'FeatureCollection', features: list.map((z) => ({ type: 'Feature', properties: { c: z.tier === 'nova' ? '#FF5CDB' : z.tier === 'white' ? '#BDE6FF' : z.tier === 'hot' ? '#FF5E3A' : '#FFB703', flare: !!z.flare },
    geometry: { type: 'Polygon', coordinates: [ring(Number(z.gx), Number(z.gy), Number(z.r_m))] } })) };
}
const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function wrap(html: string, cls: string, onClick?: () => void) {
  const w = document.createElement('div');
  const b = document.createElement(onClick ? 'button' : 'div');
  b.className = cls; b.innerHTML = html;
  if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  w.appendChild(b);
  return w;
}
const what = (r: any) => (r?.what === 'aberration' ? `☣️ It mutated into ${r.aberration}!` : r?.what === 'surge' ? `⚡ Surge — its Traits ×${r.k}` : r?.what === 'overcharge' ? '⚡ Overcharged — its next reward ×2'
  : r?.what === 'extend' ? `⏳ +${r.hours} h fused` : `⚡ +${r?.ink ?? 0} Ink`);

export function MapMarvels({ ready }: { ready: boolean }) {
  const bbox = useUi((s) => s.bbox);
  const zoom = useUi((s) => s.view.zoom);
  const nav = useNavigate();
  const qc = useQueryClient();
  const on = !!bbox && zoom >= STORM_ZOOM;
  const key = bbox ? [bbox.min_gx, bbox.min_gy, bbox.max_gx, bbox.max_gy].map((x) => Math.round(x / 64) * 64) : null;
  const q = useQuery({ queryKey: ['enchant-map2', key], queryFn: () => api.enchantMap2({ min_gx: key![0] - 64, min_gy: key![1] - 64, max_gx: key![2] + 64, max_gy: key![3] + 64 }),
    enabled: on && !!key && key[2] - key[0] < 20000, staleTime: 15_000, refetchInterval: 20_000, placeholderData: (p) => p });
  const data: EnchantMap2 | undefined = on ? q.data : undefined;
  const offset = useRef(0);
  useEffect(() => { if (q.data) offset.current = Number(q.data.server_now) * 1000 - q.dataUpdatedAt; }, [q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const caught = useRef(new Set<string>());

  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !data) return;
    const near: maplibregl.Marker[] = [], far: maplibregl.Marker[] = [];
    const add = (list: maplibregl.Marker[], lngLat: [number, number], node: HTMLElement, anchor: maplibregl.PositionAnchor = 'center', offs: [number, number] = [0, 0]) => {
      const m = newMarker({ element: node, anchor, offset: offs }).setLngLat(lngLat).addTo(map);
      list.push(m); return m;
    };
    // ☀️ suns: the disc and its corona, the zone as a ring, the sunspots inside (yours only)
    const suns: { s: (typeof data.suns)[number] }[] = [];
    for (const z of data.suns ?? []) {
      const tag = z.tier === 'nova' ? `💥 SUPERNOVA ×${Number(z.mult ?? 6)}` : z.mine ? `${z.mode === 'orbit' ? '🪐 In orbit' : '☀️ Your sun'}` : `🤝 @${esc(z.owner_name)}’s sun`;
      const node = wrap(`<span class="lv-sun-mk ${z.tier}${z.flare ? ' flare' : ''}"><i class="corona"></i><i class="disc"></i><b class="tag">${tag}</b></span>`, 'lv-em-sun', () => {
        if (z.mine && !z.reflected) nav(`/grimoire/${z.id}`);
      });
      node.dataset.testid = 'map-sun';
      add(far, cellCenter(Number(z.gx), Number(z.gy)), node);
      if (z.mine) for (const [gx, gy] of z.spots ?? []) {
        const sp = wrap('<span class="lv-sun-spot"></span>', 'lv-em-sunspot');
        sp.style.pointerEvents = 'none';
        sp.dataset.testid = 'map-sunspot';
        add(near, cellCenter(gx, gy), sp);
      }
      suns.push({ s: z });
    }
    if (map.getSource('lv-suns')) (map.getSource('lv-suns') as maplibregl.GeoJSONSource).setData(sunGeo(data.suns ?? []) as any);
    else if (map.isStyleLoaded()) {
      map.addSource('lv-suns', { type: 'geojson', data: sunGeo(data.suns ?? []) as any });
      map.addLayer({ id: 'lv-suns-fill', type: 'fill', source: 'lv-suns', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['case', ['get', 'flare'], 0.28, 0.14] } });
      map.addLayer({ id: 'lv-suns-line', type: 'line', source: 'lv-suns', paint: { 'line-color': ['get', 'c'], 'line-width': 2.5, 'line-opacity': 0.85, 'line-dasharray': [3, 1.5] } });
    }
    // 🫙 moments let out of a Déjà Vu jar: an uncorked Hot Zone or Solar Flare, burning for a little while
    for (const z of data.echoes ?? []) {
      const tag = `${z.flare ? '🌞 Flare again' : `🫙 Déjà Vu ×${Number(z.um)}`}${z.mine ? '' : ` · @${esc(z.owner_name)}`}`;
      const node = wrap(`<span class="lv-echo-mk${z.flare ? ' flare' : ''}"><i class="jar">🫙</i><b class="tag">${tag}</b></span>`, 'lv-em-echo', () => {
        if (z.mine) nav(`/grimoire/${z.id}`);
      });
      node.dataset.testid = 'map-echo';
      add(far, cellCenter(Number(z.gx), Number(z.gy)), node);
    }
    if (map.getSource('lv-echoes')) (map.getSource('lv-echoes') as maplibregl.GeoJSONSource).setData(echoGeo(data.echoes ?? []) as any);
    else if (data.echoes?.length) {
      // (only the style itself has to be ready, not every tile: a slow or offline tile doesn't keep the ring away)
      try {
        map.addSource('lv-echoes', { type: 'geojson', data: echoGeo(data.echoes) as any });
        if (!map.getLayer('lv-echoes-fill')) map.addLayer({ id: 'lv-echoes-fill', type: 'fill', source: 'lv-echoes', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.16 } });
        if (!map.getLayer('lv-echoes-line')) map.addLayer({ id: 'lv-echoes-line', type: 'line', source: 'lv-echoes', paint: { 'line-color': ['get', 'c'], 'line-width': 2.5, 'line-opacity': 0.9, 'line-dasharray': [1, 1.2] } });
      } catch { /* the style is still loading: the next refresh (20 s) adds it */ }
    }
    // 🎒 plots folded in your Origami pocket, carried on your GPS: their powers work from where you stand
    for (const c of data.carried ?? []) {
      if (!c.at) continue;
      const label = c.rarity === 'enchanted' && c.kind ? `🎒 ${esc(c.kind.replace(/_/g, ' '))}` : `🎒 ${esc(c.rarity.replace(/_/g, ' '))}`;
      const node = wrap(`<span class="lv-carry-mk r-${esc(c.rarity)}"><i class="crane">🦢</i><b>${label} · carried</b></span>`, 'lv-em-carry');
      node.style.pointerEvents = 'none';
      node.style.zIndex = '5';
      node.dataset.testid = 'map-carried';
      add(far, cellCenter(c.at[0], c.at[1]), node, 'bottom', [0, -18]);
    }
    // ⚡ storms: the cloud, and every bolt where it lands
    const bolts: { node: HTMLElement; s: MapStorm; b: MapStorm['bolts'][number] }[] = [];
    for (const s of data.storms) {
      const cloud = wrap(`<span class="lv-storm-mk"><span class="cl">⛈️</span><b>⚡ ${s.mine ? 'Your storm' : `@${esc(s.owner_name)}’s storm`}</b></span>`, 'lv-em-storm');
      cloud.style.pointerEvents = 'none';
      cloud.style.zIndex = '6';
      cloud.dataset.testid = 'map-storm';
      add(far, cellCenter(s.gx, s.gy), cloud, 'bottom', [0, -30]);
      for (const b of s.bolts) {
        const can = s.mine || b.kind === 'stray';
        const k = `${s.id}:${b.i}`;
        const node = wrap(`<span class="ret"></span>${ZZ}`, `lv-storm-bolt-mk${b.kind === 'stray' ? ' stray' : ''}`, can ? async () => {
          if (caught.current.has(k) || !node.firstElementChild?.classList.contains('live')) return;
          try {
            feel('heavy');
            if (s.mine) {
              const r = await api.enchantAct(s.id, 'catch', { i: b.i });
              qc.setQueryData(['enchant', s.id], r);
              toast.success(what(r.result));
            } else {
              const r = await api.stormCatch(s.id, b.i);
              toast.success(`⚡ You caught a stray bolt from @${s.owner_name ?? '?'}’s storm: +${r.ink} Ink`);
              invalidateGame(qc);
            }
            caught.current.add(k);
            feel('success');
          } catch (e) { toast.error(toGameError(e).message); }
        } : undefined);
        node.dataset.testid = 'map-bolt';
        node.style.zIndex = '7';
        if (s.caught.includes(b.i)) caught.current.add(k);
        bolts.push({ node, s, b });
        add(far, cellCenter(b.gx, b.gy), node);
      }
    }
    // zoomed out a little, the storms and suns show; right in, the sunspots too
    const vis = () => {
      const z = map.getZoom();
      for (const m of near) m.getElement().style.display = z >= SUN_ZOOM + 2 ? '' : 'none';
      for (const m of far) m.getElement().style.display = z >= STORM_ZOOM ? '' : 'none';
    };
    vis();
    map.on('zoom', vis);
    // the storms' clock: a ring gathers 1.6 s before a bolt lands, then it strikes
    let timer = 0;
    if (bolts.length) {
      timer = window.setInterval(() => {
        if (document.hidden) return;
        const now = (Date.now() + offset.current) / 1000;
        for (const { node, s, b } of bolts) {
          const el = node.firstElementChild as HTMLElement | null;
          if (!el) continue;
          const t = now - s.at, k = `${s.id}:${b.i}`;
          const charging = t >= b.t - 1.6 && t < b.t, strike = t >= b.t && t <= b.t + 0.8;
          el.classList.toggle('charging', charging && !caught.current.has(k));
          el.classList.toggle('strike', strike);
          el.classList.toggle('live', (charging || strike) && !caught.current.has(k));
          el.classList.toggle('done', !(charging || strike) || caught.current.has(k));
        }
      }, 120);
    }
    return () => { map.off('zoom', vis); clearInterval(timer); [...near, ...far].forEach((m) => m.remove()); if (map.getSource('lv-suns')) (map.getSource('lv-suns') as maplibregl.GeoJSONSource).setData(sunGeo([]) as any);
      if (map.getSource('lv-echoes')) (map.getSource('lv-echoes') as maplibregl.GeoJSONSource).setData(echoGeo([]) as any); };
  }, [ready, data]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
