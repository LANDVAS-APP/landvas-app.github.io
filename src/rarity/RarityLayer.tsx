// The Ultra Expansion on the live map.
//  * Every Primordial in the world, for everyone: a living emblem on its plot (a beacon when you're zoomed far out).
//  * Your own ultras' marks, for you only: a Volcano's obsidian, a World Tree's roots, a Leyline's beam, a Wanderer's
//    rainbow trail, a Mycelium's mushrooms, a Hive's bees, a Glacier's frost, your Sunspot and your Rift, the spots a
//    World's Eye marked. (Nobody else is sent them.)
//  * What Primordials put out for everyone: shooting stars to catch, new land from a Genesis Well.
//  * The shockwave: whenever anyone anywhere gets a Primordial, every open map feels it.
// The ultras themselves don't animate. Everything here is markers and map layers — no frame loop; the Primordials'
// emblems loop on transform and opacity only.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api, type RxMap, type RxWorldPlot } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { useUi } from '../lib/store';
import { mapHandle } from '../map/mapHandle';
import { newMarker } from '../map/maplib';
import { config } from '../env';
import { buzz } from '../native/native';
import { cellCenter } from '../shared/grid';
import { rarityInfo } from '../shared/rarity';
import './rarity.css';

const SRC = 'lvrx-src';
const LAYERS = ['lvrx-fill', 'lvrx-line', 'lvrx-dash'];
const ANIM: Record<string, string> = {
  heart_world: 'beat', throne_ink: 'shine', serpent_egg: 'bob', world_eye: 'blink', void_gate: 'spin', first_light: 'spin', fallen_star: 'bob',
  genesis_well: 'spin', chrysalis: 'bob', hourglass: 'flip', sunspot: 'spin', eleven: 'shine', loom: 'spin', upside_down: 'flip', midas: 'shine',
  chain: 'beat', transmuter: 'bob', doubling_cube: 'flip', rift: 'spin',
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** a square of one plot, a circle of m metres, a line — as GeoJSON */
const sq = (gx: number, gy: number, k: number, p: Record<string, unknown>) => {
  const [a, b] = cellCenter(gx, gy), [c, d] = cellCenter(gx + 1, gy + 1), dx = (c - a) * (0.5 - k / 2), dy = (d - b) * (0.5 - k / 2);
  const x0 = a - (c - a) / 2 + dx, x1 = a + (c - a) / 2 - dx, y0 = b - (d - b) / 2 + dy, y1 = b + (d - b) / 2 - dy;
  return { type: 'Feature', properties: p, geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } };
};
const circle = (gx: number, gy: number, m: number, p: Record<string, unknown>) => {
  const [lng, lat] = cellCenter(gx, gy), dLat = m / 111320, dLng = m / (111320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const pts = Array.from({ length: 49 }, (_, i) => { const t = (i / 48) * Math.PI * 2; return [lng + Math.cos(t) * dLng, lat + Math.sin(t) * dLat]; });
  return { type: 'Feature', properties: p, geometry: { type: 'Polygon', coordinates: [pts] } };
};
const line = (a: [number, number], b: [number, number], p: Record<string, unknown>, bend = 0) => {
  const A = cellCenter(a[0], a[1]), B = cellCenter(b[0], b[1]);
  if (!bend) return { type: 'Feature', properties: p, geometry: { type: 'LineString', coordinates: [A, B] } };
  // a root: a gentle curve
  const mx = (A[0] + B[0]) / 2 - (B[1] - A[1]) * bend, my = (A[1] + B[1]) / 2 + (B[0] - A[0]) * bend;
  const pts = Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [(1 - t) ** 2 * A[0] + 2 * (1 - t) * t * mx + t * t * B[0], (1 - t) ** 2 * A[1] + 2 * (1 - t) * t * my + t * t * B[1]]; });
  return { type: 'Feature', properties: p, geometry: { type: 'LineString', coordinates: pts } };
};

function features(d: RxMap | undefined) {
  const f: any[] = [];
  if (!d) return f;
  for (const p of d.mine) {
    const info = rarityInfo(p.rarity);
    for (const r of p.roots ?? []) f.push(line([p.gx, p.gy], r, { k: 'line', c: '#86EFAC', w: 4, o: 0.85 }, 0.18));
    for (const b of p.beams ?? []) { f.push(line([p.gx, p.gy], b, { k: 'line', c: '#E0F2FE', w: 7, o: 0.35 })); f.push(line([p.gx, p.gy], b, { k: 'line', c: '#38BDF8', w: 2.5, o: 0.95 })); }
    for (const b of p.bees ?? []) f.push(line([p.gx, p.gy], b, { k: 'dash', c: '#FACC15', w: 2, o: 0.9 }, 0.25));
    if (p.from) f.push(line(p.from, [p.gx, p.gy], { k: 'dash', c: '#F0ABFC', w: 3, o: 0.9 }));
    if (p.cells) f.push(circle(p.gx, p.gy, p.cells * 7, { k: 'fill', c: '#A5F3FC', o: 0.16 }), circle(p.gx, p.gy, p.cells * 7, { k: 'line', c: '#67E8F9', w: 2, o: 0.8 }));
    if (p.zone && p.m) f.push(circle(p.zone.gx, p.zone.gy, p.m, { k: 'fill', c: '#FB923C', o: 0.12 }), circle(p.zone.gx, p.zone.gy, p.m, { k: 'dash', c: '#FDBA74', w: 3, o: 0.95 }));
    if (p.rift && p.m) f.push(circle(p.rift.gx, p.rift.gy, p.m, { k: 'fill', c: '#6366F1', o: 0.18 }), circle(p.rift.gx, p.rift.gy, p.m, { k: 'line', c: '#A5B4FC', w: 3, o: 0.95 }));
    if (p.area_m && p.rarity !== 'sunspot' && p.rarity !== 'rift') f.push(circle(p.gx, p.gy, p.area_m, { k: 'dash', c: info.glow, w: 1.5, o: 0.5 }));
  }
  const SPOT: Record<string, string> = { obsidian: '#F97316', trail: '#F0ABFC', mushroom: '#A3E635' };
  for (const s of d.spots) {
    const c = s.kind === 'glint' ? rarityInfo(s.rarity ?? 'epic').color : SPOT[s.kind];
    f.push(sq(s.gx, s.gy, 0.9, { k: 'fill', c, o: s.kind === 'glint' ? 0.55 : 0.7 }), sq(s.gx, s.gy, 0.9, { k: 'line', c: '#ffffff', w: 1.2, o: 0.7 }));
  }
  for (const [gx, gy] of d.genesis) f.push(sq(gx, gy, 1, { k: 'fill', c: '#10B981', o: 0.45 }), sq(gx, gy, 1, { k: 'line', c: '#FEF08A', w: 1.5, o: 0.9 }));
  return f;
}

function node(html: string, cls: string, onClick?: () => void) {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  if (onClick) el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return el;
}

export function RarityLayer({ ready }: { ready: boolean }) {
  const qc = useQueryClient();
  const bbox = useUi((s) => s.bbox);
  const zoom = useUi((s) => s.view.zoom);
  const signed = !!getBackend().session();
  const near = !!bbox && zoom >= 12;
  const key = bbox ? [bbox.min_gx, bbox.min_gy, bbox.max_gx, bbox.max_gy].map((x) => Math.round(x / 256) * 256) : null;
  const marks = useQuery({ queryKey: ['rarity-map', key], queryFn: () => api.rarityMap({ min_gx: key![0] - 256, min_gy: key![1] - 256, max_gx: key![2] + 256, max_gy: key![3] + 256 }),
    enabled: ready && signed && near && !!key && key[2] - key[0] < 150_000, staleTime: 20_000, refetchInterval: 45_000, placeholderData: (p) => p });
  const world = useQuery({ queryKey: ['primordials-world'], queryFn: api.primordialsWorld, enabled: ready && signed, staleTime: 60_000, refetchInterval: 120_000 });
  const data: RxMap | undefined = near ? marks.data : undefined;

  // ---- your marks, and new land: map layers ----
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const fc = { type: 'FeatureCollection', features: features(data) } as any;
    const sync = () => {
      if (!map.getStyle()) return;
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) { src.setData(fc); return; }
      map.addSource(SRC, { type: 'geojson', data: fc });
      map.addLayer({ id: 'lvrx-fill', type: 'fill', source: SRC, filter: ['==', ['get', 'k'], 'fill'], paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['get', 'o'] } });
      map.addLayer({ id: 'lvrx-line', type: 'line', source: SRC, filter: ['==', ['get', 'k'], 'line'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'o'] } });
      map.addLayer({ id: 'lvrx-dash', type: 'line', source: SRC, filter: ['==', ['get', 'k'], 'dash'], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'o'], 'line-dasharray': [1.5, 1.5] } });
    };
    sync();
    map.on('styledata', sync);
    return () => { map.off('styledata', sync); };
  }, [ready, data]);
  useEffect(() => () => {
    const map = mapHandle.current;
    for (const l of LAYERS) if (map?.getLayer(l)) map.removeLayer(l);
    if (map?.getSource(SRC)) map.removeSource(SRC);
  }, []);

  // ---- shooting stars: anyone can catch them ----
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !data) return;
    const ms: maplibregl.Marker[] = [];
    for (const s of data.stars) {
      const el = node('<span>⭐</span>', 'lvrx-star', () => {
        el.classList.add('caught');
        void api.rarityCatch(s.id).then((r) => {
          buzz('success');
          toast.success(r.ink ? `⭐ Caught! +${r.ink} Ink` : r.luck ? `⭐ Caught! +${r.luck} Luck` : '⭐ Caught a Golden Hour!');
          void qc.invalidateQueries({ queryKey: ['rarity-map'] });
        }).catch((e) => { toast.error(toGameError(e).message); el.classList.remove('caught'); });
      });
      el.dataset.testid = 'map-star';
      ms.push(newMarker({ element: el, anchor: 'center' }).setLngLat(cellCenter(s.gx, s.gy)).addTo(map));
    }
    return () => { for (const m of ms) m.remove(); };
  }, [ready, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the Primordials, for everyone ----
  const plots = world.data?.plots;
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !plots?.length) return;
    const far = zoom < 9;
    const inView = (p: RxWorldPlot) => !bbox || far || (p.gx >= bbox.min_gx - 64 && p.gx <= bbox.max_gx + 64 && p.gy >= bbox.min_gy - 64 && p.gy <= bbox.max_gy + 64);
    const ms: maplibregl.Marker[] = [];
    for (const p of plots.filter(inView).slice(0, far ? 300 : 120)) {
      const i = rarityInfo(p.rarity);
      const el = node(`<i class="h"></i><i class="r"></i><b>${i.emoji ?? '✦'}</b>${far ? '' : `<em>${esc(i.name)}${p.owner_name ? ` · @${esc(p.owner_name)}` : ''}</em>`}`,
        `lvrx-pm lvrx-pm-${ANIM[p.rarity] ?? 'spin'}${far ? ' far' : ''}${p.open ? ' open' : ''}`, () => useUi.getState().select({ gx: p.gx, gy: p.gy }));
      el.style.setProperty('--c', i.color); el.style.setProperty('--g', i.glow);
      el.dataset.testid = 'map-primordial'; el.dataset.rarity = p.rarity;
      el.title = `${i.name} — a Primordial`;
      ms.push(newMarker({ element: el, anchor: 'center' }).setLngLat(cellCenter(p.gx, p.gy)).addTo(map));
    }
    return () => { for (const m of ms) m.remove(); };
  }, [ready, plots, zoom < 9, key?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the shockwave: a Primordial came into the world ----
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!ready || !signed) return;
    if (last.current == null && world.data) last.current = world.data.last;
    let stop = false;
    const look = async () => {
      if (stop || document.hidden || last.current == null) return;
      try {
        const r = await api.rarityMoments(last.current);
        last.current = Math.max(last.current, r.last);
        for (const m of r.moments) shockwave(m.gx, m.gy, m.rarity, m.mine, m.owner_name, m.place, m.how);
        if (r.moments.length) void qc.invalidateQueries({ queryKey: ['primordials-world'] });
      } catch { /* next time */ }
    };
    const t = setInterval(look, config.e2e ? 4_000 : 40_000);
    return () => { stop = true; clearInterval(t); };
  }, [ready, signed, world.data?.last != null]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** a ring of light from where a Primordial appeared, across the whole map; and a word of it */
export function shockwave(gx: number, gy: number, rarity: string, mine: boolean, owner: string | null, place: string | null, how: string) {
  const map = mapHandle.current;
  const i = rarityInfo(rarity);
  if (map) {
    const host = map.getContainer();
    const p = map.project(cellCenter(gx, gy));
    const el = document.createElement('div');
    el.className = 'lvrx-shock';
    el.dataset.testid = 'map-shockwave';
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    el.style.setProperty('--c', i.color); el.style.setProperty('--g', i.glow);
    el.innerHTML = '<i></i><i></i><i></i>';
    host.appendChild(el);
    setTimeout(() => el.remove(), 3600);
    buzz('heavy');
  }
  const verb = how === 'fused' ? 'fused' : how === 'hatched' ? 'hatched' : 'rolled';
  toast(`${i.emoji} ${mine ? `You ${verb}` : `@${owner ?? 'someone'} just ${verb}`} a Primordial: ${i.name}${place ? ` in ${place}` : ''}!`, {
    description: 'The whole world felt that.',
    action: { label: 'Fly there', onClick: () => { mapHandle.current?.flyTo({ center: cellCenter(gx, gy), zoom: 17 }); } },
  });
}
