// Enchantments on the map, alive: every enchanted plot has its creature on it (the goose waddles, smoke curls from the
// Genie's lamp, the Oracle's eye follows you as you pan; they sleep at real night and gather dust when left alone, and
// look grander at levels 3, 6 and 10). A Parasite is wrapped right round the plot it feeds on (ParasiteWraps), a Cuckoo's
// nest sits on its host. A Size Ray giant is the plot's own look — its frame and its drawing — a hundred plots across, over
// the whole neighbourhood (a beacon from far away); a tiny plot is the same, a hundredth of one, in a dark hole (with a 🔍).
// Open Wormholes arc across the world between their ends; tap the vortex to fly through.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api, type EnchantMap, type EnchantWorld } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useUi } from '../lib/store';
import { flyAway } from '../lib/toMap';
import { mapHandle } from '../map/mapHandle';
import { GRID_SIZE, cellCenter, xToLng, yToLat, type PlotTypeId } from '../shared/grid';
import { drawPlotDesign } from '../map/plotStyle';
import { plotArtUrl } from './plotArt';
import { rarityInfo } from '../shared/rarity';
import { useMyEnchantments } from './core';
import { dur, kindInfo, nightAt } from './kinds';
import { feel } from './living';
import { ParasiteWraps } from './ParasiteWraps';
import { useWarp } from './scenes/WormholeScene';
import './enchant.css';

const MIN_ZOOM = 15.5;
const BEACON_ZOOM = 2.5;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function el(html: string, cls: string, onClick?: () => void, tag: 'button' | 'div' = 'button') {
  const wrap = document.createElement('div');
  const b = document.createElement(tag);
  b.className = cls; b.innerHTML = html;
  if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  wrap.appendChild(b);
  return wrap;
}
/** a square n cells across, centred on a cell */
function square(gx: number, gy: number, n: number, dx = 0, dy = 0): GeoJSON.Polygon {
  const h = n / 2, x0 = (gx + 0.5 - h + dx) / GRID_SIZE, x1 = (gx + 0.5 + h + dx) / GRID_SIZE, y0 = (gy + 0.5 - h + dy) / GRID_SIZE, y1 = (gy + 0.5 + h + dy) / GRID_SIZE;
  return { type: 'Polygon', coordinates: [[[xToLng(x0), yToLat(y0)], [xToLng(x1), yToLat(y0)], [xToLng(x1), yToLat(y1)], [xToLng(x0), yToLat(y1)], [xToLng(x0), yToLat(y0)]]] };
}
/** a tiny plot's own look (its pattern, its drawing, its rarity frame), for the speck that marks it */
async function drawTinyPlot(cv: HTMLCanvasElement, s: { gx: number; gy: number; rarity: string | null; plot_type?: string | null }) {
  const N = 48;
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  if (!g) return;
  g.fillStyle = '#F4EFE6'; g.fillRect(0, 0, N, N);
  if (s.plot_type) drawPlotDesign(g, s.plot_type as PlotTypeId, N, (s.gx * 31 + s.gy) % 97);
  try {
    const url = await plotArtUrl(s.gx, s.gy);
    if (url) { const img = new Image(); img.src = url; await img.decode(); g.drawImage(img, 0, 0, N, N); }
  } catch { /* its pattern will do */ }
  g.strokeStyle = rarityInfo(s.rarity ?? 'common').color; g.lineWidth = 5; g.strokeRect(2.5, 2.5, N - 5, N - 5);
}
/** the four corners of a square n plots across, centred on a plot (for an image laid on the map) */
function corners(gx: number, gy: number, n: number): [[number, number], [number, number], [number, number], [number, number]] {
  const h = n / 2, x0 = (gx + 0.5 - h) / GRID_SIZE, x1 = (gx + 0.5 + h) / GRID_SIZE, y0 = (gy + 0.5 - h) / GRID_SIZE, y1 = (gy + 0.5 + h) / GRID_SIZE;
  return [[xToLng(x0), yToLat(y0)], [xToLng(x1), yToLat(y0)], [xToLng(x1), yToLat(y1)], [xToLng(x0), yToLat(y1)]];
}
const GIANT = 100;
/** a giant fades as you zoom right in, so the plots underneath can still be seen (and claimed) */
const GIANT_OPACITY: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 0.95, 19, 0.6, 21, 0.3];
/** a wormhole's arc: bowed to one side, like space folding */
function arc(a: [number, number], b: [number, number]): [number, number][] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
  const cx = mx - dy * 0.28, cy = my + dx * 0.28;
  return Array.from({ length: 49 }, (_, i) => { const t = i / 48, u = 1 - t; return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]] as [number, number]; });
}
const left = (until: string | number) => (typeof until === 'number' ? until * 1000 : Date.parse(until)) - Date.now();

/** the creature on its plot: each kind moves in its own way */
function creature(p: EnchantMap['plots'][number]) {
  const k = kindInfo(p.reflect ?? p.kind);
  const lvl = p.level >= 10 ? 10 : p.level >= 6 ? 6 : p.level >= 3 ? 3 : 1;
  const [lng] = cellCenter(p.gx, p.gy);
  const night = nightAt(lng), dusty = p.mine && !!p.updated_at && Date.now() - Date.parse(p.updated_at) > 3 * 86400_000;
  const fx: Record<string, string> = {
    goose: '<i class="egg"></i>', genie: '<i class="puff"></i><i class="puff"></i><i class="puff"></i>', map: '<i class="x">✕</i>', parasite: '<i class="drip"></i>',
    cuckoo: '<i class="feather">🪶</i>', pandora: '<i class="glow"></i>', splice: '<i class="bub"></i><i class="bub"></i><i class="bub"></i>', clockwork: '<i class="gear">⚙</i>',
    sizeray: '<i class="wave"></i><i class="wave"></i>', shard: '<i class="glint"></i>', wormhole: '<i class="swirl"></i>', oracle: '<i class="lid"></i>',
  };
  return `<span class="lv-cr k-${p.reflect ?? p.kind} lvl${lvl}${night ? ' night' : ''}${dusty ? ' dusty' : ''}" style="--a:${k.a};--b:${k.b};--r:${p.mine ? '#FFD23F' : k.a}">`
    + `<span class="lv-cr-ring"></span>${lvl >= 6 ? '<span class="lv-cr-crown">👑</span>' : ''}<span class="lv-cr-body">${k.emoji}</span>${fx[p.reflect ?? p.kind] ?? ''}`
    + `${night ? '<span class="lv-cr-z">z</span>' : ''}${p.partner ? '<span class="lv-em-tag">🧬</span>' : ''}${p.frozen ? '<span class="lv-em-tag lv-em-tag-l">❄️</span>' : ''}</span>`;
}

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource('lv-size')) {
    map.addSource('lv-size', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'lv-size-shadow', type: 'fill', source: 'lv-size', filter: ['==', ['get', 't'], 'shadow'], paint: { 'fill-color': '#000', 'fill-opacity': 0.32 } });
    map.addLayer({ id: 'lv-size-glow', type: 'line', source: 'lv-size', filter: ['==', ['get', 't'], 'giant'], paint: { 'line-color': ['get', 'c'], 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.8 } });
    // a tiny plot leaves a hole where it was; the plot itself sits in the middle, a hundredth of the size, in a hairline frame
    map.addLayer({ id: 'lv-size-tiny', type: 'fill', source: 'lv-size', filter: ['==', ['get', 't'], 'tiny'], paint: { 'fill-color': '#0D0618', 'fill-opacity': 1 } });
    map.addLayer({ id: 'lv-size-tiny-line', type: 'line', source: 'lv-size', filter: ['==', ['get', 't'], 'tiny'], paint: { 'line-color': '#FF00E5', 'line-width': 1.2, 'line-dasharray': [1, 1.5], 'line-opacity': 0.8 } });
  }
  if (!map.getSource('lv-worm')) {
    map.addSource('lv-worm', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'lv-worm-glow', type: 'line', source: 'lv-worm', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#7B5CFF', 'line-width': 9, 'line-blur': 8, 'line-opacity': 0.55 } });
    map.addLayer({ id: 'lv-worm-core', type: 'line', source: 'lv-worm', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['case', ['get', 'mine'], '#00E0FF', '#C9B8FF'], 'line-width': 2.2, 'line-dasharray': [1.5, 1.5] } });
  }
}

export function EnchantLayer({ ready }: { ready: boolean }) {
  const bbox = useUi((s) => s.bbox);
  const zoom = useUi((s) => s.view.zoom);
  const qc = useQueryClient();
  const on = !!bbox && zoom >= MIN_ZOOM;
  const key = bbox ? [bbox.min_gx, bbox.min_gy, bbox.max_gx, bbox.max_gy].map((x) => Math.round(x / 64) * 64) : null;
  const q = useQuery({ queryKey: ['enchant-map', key], queryFn: () => api.enchantMap({ min_gx: key![0] - 64, min_gy: key![1] - 64, max_gx: key![2] + 64, max_gy: key![3] + 64 }),
    enabled: on && !!key && key[2] - key[0] < 20000, staleTime: 30_000, refetchInterval: 60_000, placeholderData: (p) => p });
  const world = useQuery({ queryKey: ['enchant-world'], queryFn: api.enchantWorld, enabled: ready, staleTime: 60_000, refetchInterval: 120_000 });
  const mine = useMyEnchantments();
  const data: EnchantMap | undefined = on ? q.data : undefined;
  const w: EnchantWorld | undefined = world.data;
  const maps = (mine.data ?? []).filter((e) => (e.reflect_kind ?? e.kind) === 'map').map((e) => (e.reflect_kind ? e.reflected : e.view)).filter(Boolean);

  // ---- the creatures, nests, specks, labels, map pieces (zoomed in) ----
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const markers: maplibregl.Marker[] = [];
    const tinies: { cv: HTMLCanvasElement; scale: number }[] = [];
    const eyes: { m: maplibregl.Marker; node: HTMLElement }[] = [];
    const add = (lngLat: [number, number], node: HTMLElement, anchor: maplibregl.PositionAnchor = 'center', offset: [number, number] = [0, 0]) => {
      const m = new maplibregl.Marker({ element: node, anchor, offset }).setLngLat(lngLat).addTo(map);
      markers.push(m); return m;
    };
    for (const p of data?.plots ?? []) {
      const k = kindInfo(p.kind);
      const node = el(creature(p), 'lv-em', () => useUi.getState().select({ gx: p.gx, gy: p.gy }));
      node.title = `${k.name} #${p.serial}${p.owner_name ? ` · @${p.owner_name}` : ''}`;
      node.dataset.testid = 'map-enchant'; node.dataset.kind = p.kind;
      const m = add(cellCenter(p.gx, p.gy), node);
      if ((p.reflect ?? p.kind) === 'oracle') eyes.push({ m, node });
    }
    for (const a of data?.attached ?? []) {
      if (a.what === 'egg') {
        // the cuckoo's nest on its host: the egg wobbles faster as it nears hatching
        const left = a.hatch_at ? Math.max(0, a.hatch_at - Date.now() / 1000) : 36000;
        const speed = Math.max(0.25, Math.min(2.6, left / 14000));
        const node = el(`<span class="lv-nest"><i class="egg" style="animation-duration:${speed.toFixed(2)}s"></i></span>`, `lv-em-small lv-em-nest${a.on_mine ? ' lv-em-alert' : ''}`, () => useUi.getState().select({ gx: a.gx, gy: a.gy }));
        node.dataset.testid = 'map-nest';
        add(cellCenter(a.gx, a.gy), node, 'bottom', [0, 4]);
      } else if (a.on_mine) {
        const node = el(a.stage >= 2 ? '💚' : '🦠', 'lv-em-small lv-em-alert', () => useUi.getState().select({ gx: a.gx, gy: a.gy }));
        add(cellCenter(a.gx, a.gy), node, 'bottom-left', [6, -6]);
      }
    }
    for (const s of data?.sizes ?? []) {
      const ms = left(s.until);
      if (ms <= 0) continue;
      if (s.mode === 'grow') {
        // its label floats at the top edge of the giant
        const [lng] = cellCenter(s.gx, s.gy), lat = yToLat((s.gy + 0.5 - GIANT / 2) / GRID_SIZE);
        const total = Math.max(1, Date.parse(s.until) - Date.parse(s.from));
        const what = s.prank ? `🤡 GIANT · ${s.by_me ? 'your prank' : `@${s.by_name ?? '?'}’s prank`}` : `GIANT ×${Number(s.mult).toFixed(1)}`;
        const html = `<span class="lv-giant-tag${s.prank ? ' prank' : ''}"><span class="lv-ring sm" style="--p:${(ms / total).toFixed(3)};--c:${s.prank ? '#FF5CDB' : '#39FF14'}">📡</span><b>${what}</b><i>${dur(ms / 1000)}</i>`
          + `${!s.mine && !s.visited && !s.by_me ? '<u data-visit="1">Visit · tip +2</u>' : ''}${s.owner_name && !s.mine ? `<em>@${s.owner_name}</em>` : ''}</span>`;
        const node = el(html, 'lv-em-giant-wrap', async () => {
          if (s.mine || s.visited || s.by_me) { useUi.getState().select({ gx: s.gx, gy: s.gy }); return; }
          try { const r = await api.sizeGiantVisit(s.gx, s.gy); feel('success'); toast.success(`You visited the giant: +${r.you} Ink (and @${s.owner_name} got +${r.them})`); void qc.invalidateQueries({ queryKey: ['enchant-map'] }); }
          catch (e) { toast.error(toGameError(e).message); }
        });
        node.dataset.testid = 'map-giant';
        add([lng, lat], node, 'bottom', [0, -4]);
      } else {
        // the plot itself, a hundredth of its size, in the middle of the hole it left (drawn here: too small for the map's own images)
        const node = el('<span class="lv-speck"><canvas class="lv-speck-plot"></canvas></span>', 'lv-em-speck', () => useUi.getState().select({ gx: s.gx, gy: s.gy }));
        const cv = node.querySelector('canvas')!;
        void drawTinyPlot(cv, s);
        tinies.push({ cv, scale: Number(s.scale) || 0.01 });
        node.title = `A tiny plot — 100× smaller${s.prank ? ` (@${s.by_name ?? '?'}’s prank)` : ''}`;
        node.dataset.testid = 'map-tiny';
        add(cellCenter(s.gx, s.gy), node);
      }
    }
    for (const wh of data?.wormholes ?? []) {
      for (const e of wh.ends) {
        const other = wh.ends.find((x) => x !== e && (e.home ? !x.home : x.home)) ?? wh.ends.find((x) => x !== e);
        const node = el('<span class="lv-vortex-mk"><i></i><i></i><i></i></span>', 'lv-em', () => {
          if (wh.mine && other) { feel('heavy'); useWarp.getState().go({ gx: other.gx, gy: other.gy }); }
          else useUi.getState().select({ gx: e.gx, gy: e.gy });
        });
        node.title = wh.mine ? 'Your wormhole — tap to fly through' : `@${wh.owner_name ?? '?'}’s wormhole`;
        node.dataset.testid = 'map-wormhole';
        add(cellCenter(e.gx, e.gy), node, 'center', [14, -14]);
      }
    }
    for (const m of maps) {
      for (const p of m.pieces ?? []) if (!p.found_at) add(cellCenter(p.gx, p.gy), el('🧩', 'lv-em-small lv-em-alert'), 'bottom', [0, -6]);
      if (m.x) add(cellCenter(m.x.gx, m.x.gy), el('<b style="color:#FF3B30;font-size:22px;text-shadow:0 0 8px #FF3B30">✕</b>', 'lv-em-x'));
    }
    const vis = () => {
      const z = map.getZoom(), show = z >= MIN_ZOOM;
      for (const m of markers) m.getElement().style.display = show ? '' : 'none';
      // a tiny plot is exactly a hundredth of a plot across, at every zoom (a plot is 512 px at zoom 22)
      for (const t of tinies) { const px = Math.max(0.6, 512 * 2 ** (z - 22) * t.scale); t.cv.style.width = t.cv.style.height = `${px.toFixed(2)}px`; }
    };
    // the Oracle's eye turns to follow you as you pan
    const look = () => {
      if (!eyes.length) return;
      const c = map.getContainer().getBoundingClientRect();
      for (const { m, node } of eyes) {
        const pt = map.project(m.getLngLat());
        const dx = c.width / 2 - pt.x, dy = c.height / 2 - pt.y, d = Math.hypot(dx, dy) || 1;
        node.style.setProperty('--lx', `${((dx / d) * Math.min(1, d / 160) * 4).toFixed(1)}px`);
        node.style.setProperty('--ly', `${((dy / d) * Math.min(1, d / 160) * 3).toFixed(1)}px`);
      }
    };
    vis(); look();
    map.on('zoom', vis); map.on('move', look);
    return () => { map.off('zoom', vis); map.off('move', look); markers.forEach((m) => m.remove()); };
  }, [ready, data, JSON.stringify(maps.map((m) => [m.pieces, m.x]))]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- giants tower over the block; tiny plots go dark (drawn by the map itself) ----
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const draw = () => {
      if (!map.getStyle()) return;
      ensureLayers(map);
      const feats: GeoJSON.Feature[] = [];
      for (const s of data?.sizes ?? []) {
        if (left(s.until) <= 0) continue;
        if (s.mode === 'grow') {
          feats.push({ type: 'Feature', properties: { t: 'shadow' }, geometry: square(s.gx, s.gy, GIANT, 4, 4) });
          feats.push({ type: 'Feature', properties: { t: 'giant', c: s.prank ? '#FF5CDB' : rarityInfo(s.rarity ?? 'common').color }, geometry: square(s.gx, s.gy, GIANT) });
        } else {
          feats.push({ type: 'Feature', properties: { t: 'tiny' }, geometry: square(s.gx, s.gy, 1) });
        }
      }
      (map.getSource('lv-size') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
      const arcs: GeoJSON.Feature[] = [];
      for (const wh of w?.wormholes ?? []) {
        const home = wh.ends.find((e) => e.home) ?? wh.ends[0];
        for (const e of wh.ends) if (e !== home) arcs.push({ type: 'Feature', properties: { mine: wh.mine }, geometry: { type: 'LineString', coordinates: arc(cellCenter(home.gx, home.gy), cellCenter(e.gx, e.gy)) } });
      }
      (map.getSource('lv-worm') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: arcs });
    };
    draw();
    map.on('styledata', draw);
    return () => { map.off('styledata', draw); };
  }, [ready, data, w]);

  // ---- zoomed out: every giant in the world is a beacon you can see from anywhere ----
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !w) return;
    const markers = w.giants.filter((g) => left(g.until) > 0).slice(0, 200).map((g) => {
      const c = rarityInfo(g.rarity ?? 'common').color;
      const node = el(`<span class="lv-beacon" style="--c:${c}"><i></i>${g.prank ? '🤡' : '📡'}<b>${g.prank ? `GIANT · @${g.by_name ?? '?'}’s prank` : `GIANT${g.owner_name ? ` · @${g.owner_name}` : ''}`}</b></span>`, 'lv-em', () => { const [lng, lat] = cellCenter(g.gx, g.gy); flyAway({ lng, lat, zoom: 15.6 }); });
      node.title = `A giant plot${g.owner_name ? ` · @${g.owner_name}` : ''}${g.prank ? ` · @${g.by_name ?? '?'}’s prank` : ` · ×${Number(g.mult).toFixed(1)}`}`;
      node.dataset.testid = 'map-beacon';
      return new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat(cellCenter(g.gx, g.gy)).addTo(map);
    });
    // (close enough that the giant fills the screen, the beacon says what it is)
    const vis = () => { const z = map.getZoom(), show = z >= BEACON_ZOOM && z < MIN_ZOOM; for (const m of markers) { const n = m.getElement(); n.style.display = show ? '' : 'none'; n.classList.toggle('lv-near', z >= 12.5); } };
    vis();
    map.on('zoom', vis);
    return () => { map.off('zoom', vis); markers.forEach((m) => m.remove()); };
  }, [ready, w]);

  // ---- 100×: a giant is the plot's own look — its frame and its drawing — a hundred plots across ----
  // (the map draws it from its own plot and art tiles, so a giant is exactly that plot, blown up)
  const shown = useRef(new Set<string>());
  const gen = useRef(Date.now());
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const want = new Map<string, { gx: number; gy: number; n: number; before: string }>();
    const b = useUi.getState().bbox;
    const cx = b ? (b.min_gx + b.max_gx) / 2 : 0, cy = b ? (b.min_gy + b.max_gy) / 2 : 0;
    const near = (gx: number, gy: number) => !b || (gx >= b.min_gx - GIANT && gx <= b.max_gx + GIANT && gy >= b.min_gy - GIANT && gy <= b.max_gy + GIANT);
    const giants = [...(w?.giants ?? []), ...(data?.sizes ?? []).filter((s) => s.mode === 'grow')]
      .filter((g) => left(g.until) > 0 && near(g.gx, g.gy))
      .sort((p, q) => Math.hypot(p.gx - cx, p.gy - cy) - Math.hypot(q.gx - cx, q.gy - cy));
    for (const g of giants) { if (want.size >= 12) break; want.set(`${g.gx}_${g.gy}_g`, { gx: g.gx, gy: g.gy, n: GIANT, before: 'lv-size-glow' }); }
    const sync = () => {
      if (!map.getStyle()) return;
      ensureLayers(map);
      const keep = new Set<string>();
      for (const [k, t] of want) {
        for (const kind of ['plots', 'art'] as const) {
          const id = `lv-sz-${k}-${kind}`;
          keep.add(id);
          if (map.getSource(id)) continue;
          map.addSource(id, { type: 'image', url: `${kind === 'plots' ? 'lvplots' : 'lvart'}://22/${t.gx}/${t.gy}?g=${gen.current}`, coordinates: corners(t.gx, t.gy, t.n) });
          map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-fade-duration': 0, 'raster-opacity': t.n > 1 ? GIANT_OPACITY : 1 } }, map.getLayer(t.before) ? t.before : undefined);
        }
      }
      for (const id of shown.current) if (!keep.has(id)) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
      shown.current = keep;
    };
    sync();
    map.on('styledata', sync);
    return () => { map.off('styledata', sync); };
  }, [ready, data, w, key?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    const map = mapHandle.current;
    for (const id of shown.current) { if (map?.getLayer(id)) map.removeLayer(id); if (map?.getSource(id)) map.removeSource(id); }
    shown.current = new Set();
  }, []);

  return <ParasiteWraps ready={ready} attached={(data?.attached ?? []).filter((a) => a.what === 'parasite')} />;
}
