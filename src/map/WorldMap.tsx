// The world canvas: MapLibre map with the plot grid, ownership, default designs,
// the published-art tile pyramid and four presentation modes.
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, RasterTileSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { PlotRow } from '../backend/types';
import { config } from '../env';
import { qk, useOnboardedMe, useWorld } from '../lib/queries';
import { effectiveDark, useUi, type MapMode } from '../lib/store';
import { outlineEdges } from '../shared/fusion';
import { GRID_SIZE, cellPolygon, latToY, lngLatToCell, plotTypeFor, viewportCells, xToLng, yToLat, type PlotTypeWeight } from '../shared/grid';
import { ArtIndex, registerArtProtocol } from './artTiles';
import { BASE_LAYERS, recolorOffline, resolveStyle, themeColors } from './basemap';
import { citiesInView } from './places';
import { PLOT_TYPES, patternImages } from './plotStyle';

maplibregl.setWorkerUrl(workerUrl);

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const typeColor = ['match', ['get', 't'], 'graphite', PLOT_TYPES.graphite.a, 'pigment', PLOT_TYPES.pigment.a, 'mosaic', PLOT_TYPES.mosaic.a, 'lumina', PLOT_TYPES.lumina.a, '#888'] as any;
const ART_TILES = (gen: number) => [`lvart://{z}/{x}/{y}?g=${gen}`];

function poly(gx: number, gy: number, props: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [cellPolygon(gx, gy)] } };
}
const setData = (map: MLMap, id: string, data: GeoJSON.GeoJSON) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

export const artIndex = new ArtIndex();

export function WorldMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onlineRef = useRef(false);
  const genRef = useRef(1);
  const seqRef = useRef(0);
  const rowsRef = useRef<PlotRow[]>([]);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const [ready, setReady] = useState(false);
  const mode = useUi((s) => s.mode);
  const selected = useUi((s) => s.selected);
  const flyTo = useUi((s) => s.flyTo);
  const settings = useUi((s) => s.settings);
  const me = useOnboardedMe();
  const world = useWorld();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const weights = (world.data?.plot_types ?? []) as unknown as PlotTypeWeight[];
  const weightsRef = useRef(weights);
  weightsRef.current = weights.length ? weights : weightsRef.current;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ---- init -----------------------------------------------------------------
  useEffect(() => {
    let map: MLMap | null = null;
    let disposed = false;
    registerArtProtocol(artIndex);
    artIndex.reset();
    (async () => {
      const { style, online } = await resolveStyle(themeColors());
      if (disposed || !container.current) return;
      onlineRef.current = online;
      const v = useUi.getState().view;
      const m = new maplibregl.Map({
        container: container.current,
        style,
        center: [v.lng, v.lat],
        zoom: v.zoom,
        minZoom: 0.6,
        maxZoom: 19.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        renderWorldCopies: true,
        fadeDuration: 180,
      });
      map = m;
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Artwork © LANDVAS artists · Natural Earth · GeoNames' }), 'bottom-left');
      mapRef.current = m;
      if (config.e2e || import.meta.env.DEV) (window as any).__landvasMap = m;
      m.on('load', () => {
        if (!map) return;
        addLayers(map);
        applyProjection(map, useUi.getState().settings.globe);
        applyMode(map, modeRef.current, onlineRef.current);
        setReady(true);
        refresh();
      });
      m.on('moveend', () => {
        if (!map) return;
        const c = map.getCenter();
        const b = map.getBounds();
        const cells = viewportCells(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        useUi.getState().setView({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }, { min_gx: cells.minGx, min_gy: cells.minGy, max_gx: cells.maxGx, max_gy: cells.maxGy });
        refresh();
      });
      m.on('click', (e) => {
        if (!map) return;
        const z = map.getZoom();
        if (z < 11.5) {
          map.easeTo({ center: e.lngLat, zoom: Math.min(z + 3.2, 14.5), duration: 650 });
          return;
        }
        useUi.getState().select(lngLatToCell(e.lngLat.lng, e.lngLat.lat));
      });
      m.on('mousemove', (e) => {
        if (!map || map.getZoom() < 12) return setData(map!, 'lv-hover', EMPTY);
        const c = lngLatToCell(e.lngLat.lng, e.lngLat.lat);
        setData(map, 'lv-hover', { type: 'FeatureCollection', features: [poly(c.gx, c.gy, {})] });
      });
      m.getCanvas().addEventListener('mouseleave', () => setData(m, 'lv-hover', EMPTY));
    })();
    const unsub = getBackend().subscribeMapUpdates((u) => {
      artIndex.invalidate(u.min_gx, u.min_gy, u.max_gx, u.max_gy);
      const bbox = useUi.getState().bbox;
      const inView = !bbox || (u.max_gx >= bbox.min_gx - 1 && u.min_gx <= bbox.max_gx + 1 && u.max_gy >= bbox.min_gy - 1 && u.min_gy <= bbox.max_gy + 1);
      const m = mapRef.current;
      if (inView && m?.getSource('lv-art')) {
        genRef.current++;
        (m.getSource('lv-art') as RasterTileSource).setTiles(ART_TILES(genRef.current));
      }
      void qc.invalidateQueries({ queryKey: ['plot'] });
      refresh();
    });
    return () => {
      disposed = true;
      unsub();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- viewport data ------------------------------------------------------------
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function refresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void loadViewport(), 120);
  }

  async function loadViewport() {
    const map = mapRef.current;
    if (!map || !map.getSource('lv-plots')) return;
    const seq = ++seqRef.current;
    const z = map.getZoom();
    const b = map.getBounds();
    const v = viewportCells(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
    const cols = v.maxGx - v.minGx + 1;
    const rows = v.maxGy - v.minGy + 1;
    // owned plots (z >= 9.5) or aggregated density below
    if (z >= 9.5 && cols <= 1024 && rows <= 1024) {
      try {
        const data = await api.plotsInBbox(v.minGx, v.minGy, v.maxGx, v.maxGy);
        if (seq !== seqRef.current) return;
        rowsRef.current = data;
        setData(map, 'lv-plots', {
          type: 'FeatureCollection',
          features: data.map(([gx, gy, t, level, mine, group, art, user]) => poly(gx, gy, { t, level, m: mine ? 1 : 0, g: group, a: art ? 1 : 0, u: user })),
        });
        setData(map, 'lv-density', EMPTY);
      } catch {
        /* transient */
      }
    } else {
      setData(map, 'lv-plots', EMPTY);
      const L = [3, 5, 7, 9, 11].reduce((best, l) => (Math.abs(l - (z + 3.4)) < Math.abs(best - (z + 3.4)) ? l : best), 3);
      const s = 16 - L;
      try {
        const pts = await api.densityInBbox(L, Math.max(0, v.minGx >> s), Math.max(0, v.minGy >> s), Math.min((1 << L) - 1, v.maxGx >> s), Math.min((1 << L) - 1, v.maxGy >> s));
        if (seq !== seqRef.current) return;
        setData(map, 'lv-density', {
          type: 'FeatureCollection',
          features: pts.map(([x, y, n]) => ({
            type: 'Feature', properties: { n },
            geometry: { type: 'Point', coordinates: [xToLng((x + 0.5) / (1 << L)), yToLat((y + 0.5) / (1 << L))] },
          })),
        });
      } catch {
        /* transient */
      }
    }
    // grid lines
    if (z >= 13 && cols <= 400 && rows <= 400) {
      const lines: GeoJSON.Feature[] = [];
      const north = yToLat(v.minGy / GRID_SIZE), south = yToLat((v.maxGy + 1) / GRID_SIZE);
      const west = xToLng(v.minGx / GRID_SIZE), east = xToLng((v.maxGx + 1) / GRID_SIZE);
      for (let x = v.minGx; x <= v.maxGx + 1; x++) lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[xToLng(x / GRID_SIZE), north], [xToLng(x / GRID_SIZE), south]] } });
      for (let y = v.minGy; y <= v.maxGy + 1; y++) lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[west, yToLat(y / GRID_SIZE)], [east, yToLat(y / GRID_SIZE)]] } });
      setData(map, 'lv-grid', { type: 'FeatureCollection', features: lines });
    } else setData(map, 'lv-grid', EMPTY);
    // discovery: highlight claimable plots and their types
    if (modeRef.current === 'discovery' && z >= 13.5 && cols * rows <= 2500) {
      const owned = new Set(rowsRef.current.map((r) => `${r[0]}_${r[1]}`));
      const feats: GeoJSON.Feature[] = [];
      for (let y = v.minGy; y <= v.maxGy; y++)
        for (let x = v.minGx; x <= v.maxGx; x++) {
          const gx = ((x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
          if (!owned.has(`${gx}_${y}`)) feats.push(poly(x, y, { t: plotTypeFor(gx, y, weightsRef.current.length ? weightsRef.current : undefined) }));
        }
      setData(map, 'lv-avail', { type: 'FeatureCollection', features: feats });
    } else setData(map, 'lv-avail', EMPTY);
    // offline city labels
    void updateLabels(map, b, z);
  }

  async function updateLabels(map: MLMap, b: maplibregl.LngLatBounds, z: number) {
    const markers = markersRef.current;
    const show = !onlineRef.current && modeRef.current !== 'canvas' && z >= 2.2;
    const list = show ? await citiesInView(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z) : [];
    const keep = new Set(list.map((c) => c.name + c.lng));
    for (const [k, m] of markers) if (!keep.has(k)) { m.remove(); markers.delete(k); }
    for (const c of list) {
      const k = c.name + c.lng;
      if (markers.has(k)) continue;
      const el = document.createElement('div');
      el.className = 'city-label';
      el.textContent = c.name;
      markers.set(k, new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 4] }).setLngLat([c.lng, c.lat]).addTo(map));
    }
  }

  // ---- reactive updates ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyMode(map, mode, onlineRef.current);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setData(map, 'lv-sel', selected ? { type: 'FeatureCollection', features: [poly(selected.gx, selected.gy, {})] } : EMPTY);
  }, [selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !groups.data) return;
    const feats: GeoJSON.Feature[] = groups.data.map((g) => ({
      type: 'Feature',
      properties: { id: g.id, n: g.plot_count },
      geometry: {
        type: 'MultiLineString',
        coordinates: outlineEdges(g.cells.map((c) => [c[0], c[1]])).map(([[x1, y1], [x2, y2]]) => [
          [xToLng(x1 / GRID_SIZE), yToLat(y1 / GRID_SIZE)],
          [xToLng(x2 / GRID_SIZE), yToLat(y2 / GRID_SIZE)],
        ]),
      },
    }));
    setData(map, 'lv-groups', { type: 'FeatureCollection', features: feats });
  }, [groups.data, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom, essential: true, duration: settings.reduceMotion ? 0 : 1600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setPaintProperty('lv-art', 'raster-resampling', settings.crispPixels ? 'nearest' : 'linear');
    applyProjection(map, settings.globe);
  }, [settings.crispPixels, settings.globe, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const recolor = () => {
      if (!onlineRef.current) recolorOffline(map, themeColors());
      applySky(map);
    };
    recolor();
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', recolor);
    const obs = new MutationObserver(recolor);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', recolor);
      obs.disconnect();
    };
  }, [settings.theme, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" data-testid="world-map" aria-label="World map" role="application" />
    </div>
  );
}

// ---- layers & modes ----------------------------------------------------------------

function addLayers(map: MLMap) {
  for (const img of patternImages()) if (!map.hasImage(img.id)) map.addImage(img.id, { width: img.width, height: img.height, data: img.data }, { pixelRatio: 2 });
  map.addSource('lv-density', { type: 'geojson', data: EMPTY });
  map.addSource('lv-avail', { type: 'geojson', data: EMPTY });
  map.addSource('lv-plots', { type: 'geojson', data: EMPTY });
  map.addSource('lv-art', { type: 'raster', tiles: ART_TILES(1), tileSize: 256, minzoom: 8, maxzoom: 16 });
  map.addSource('lv-grid', { type: 'geojson', data: EMPTY });
  map.addSource('lv-groups', { type: 'geojson', data: EMPTY });
  map.addSource('lv-hover', { type: 'geojson', data: EMPTY });
  map.addSource('lv-sel', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'lv-density', type: 'circle', source: 'lv-density', maxzoom: 10.5,
    paint: {
      'circle-color': '#8B5CFF',
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 3, 10, 10, 40, 22],
      'circle-opacity': 0.55, 'circle-blur': 0.5,
      'circle-stroke-color': '#22E3FF', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.5,
    },
  });
  map.addLayer({ id: 'lv-avail-fill', type: 'fill', source: 'lv-avail', paint: { 'fill-pattern': ['concat', 'pat-free-', ['get', 't']], 'fill-opacity': 0.9 } });
  map.addLayer({ id: 'lv-avail-line', type: 'line', source: 'lv-avail', paint: { 'line-color': typeColor, 'line-opacity': 0.35, 'line-width': 1 } });
  map.addLayer({ id: 'lv-plots-pattern', type: 'fill', source: 'lv-plots', filter: ['==', ['get', 'a'], 0], paint: { 'fill-pattern': ['concat', 'pat-owned-', ['get', 't']], 'fill-opacity': 0.9 } });
  map.addLayer({ id: 'lv-art', type: 'raster', source: 'lv-art', paint: { 'raster-fade-duration': 200, 'raster-resampling': 'linear' } });
  map.addLayer({ id: 'lv-grid', type: 'line', source: 'lv-grid', minzoom: 13, paint: { 'line-color': '#9fb0ff', 'line-width': 0.6, 'line-opacity': 0.22 } });
  map.addLayer({
    id: 'lv-plots-line', type: 'line', source: 'lv-plots',
    paint: { 'line-color': ['case', ['==', ['get', 'm'], 1], '#22E3FF', typeColor], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 15, 1.4], 'line-opacity': 0.6 },
  });
  map.addLayer({ id: 'lv-groups-glow', type: 'line', source: 'lv-groups', paint: { 'line-color': '#22E3FF', 'line-width': 7, 'line-blur': 6, 'line-opacity': 0.45 } });
  map.addLayer({ id: 'lv-groups-line', type: 'line', source: 'lv-groups', paint: { 'line-color': '#C9F6FF', 'line-width': 1.6, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'lv-hover', type: 'line', source: 'lv-hover', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.75 } });
  map.addLayer({ id: 'lv-sel-glow', type: 'line', source: 'lv-sel', paint: { 'line-color': '#FFE14D', 'line-width': 10, 'line-blur': 7, 'line-opacity': 0.6 } });
  map.addLayer({ id: 'lv-sel-line', type: 'line', source: 'lv-sel', paint: { 'line-color': '#FFE14D', 'line-width': 2.4 } });
  applySky(map);
}

function applySky(map: MLMap) {
  const dark = effectiveDark(useUi.getState().settings.theme);
  try {
    map.setSky({
      'sky-color': dark ? '#070b1c' : '#dfe7fb',
      'horizon-color': dark ? '#2d3f9a' : '#a9bdf5',
      'fog-color': dark ? '#0b1230' : '#eef2fd',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.6,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.5, 7, 0],
    } as any);
  } catch {
    /* sky unsupported */
  }
}

function applyProjection(map: MLMap, globe: boolean) {
  try {
    map.setProjection({ type: globe ? 'globe' : 'mercator' });
  } catch {
    /* projection unsupported */
  }
}

const baseOpacityCache = new WeakMap<MLMap, Map<string, [string, unknown][]>>();
function dimBase(map: MLMap, factor: number, online: boolean) {
  if (!online) {
    map.setPaintProperty('lv-land', 'fill-opacity', factor < 1 ? 0.55 : 1);
    map.setPaintProperty('lv-coast', 'line-opacity', factor < 1 ? 0.25 : 0.75);
    map.setPaintProperty('lv-borders', 'line-opacity', factor < 1 ? 0 : 1);
    map.setPaintProperty('lv-grat', 'line-opacity', factor < 1 ? 0.3 : 1);
    return;
  }
  let cache = baseOpacityCache.get(map);
  const style = map.getStyle();
  if (!cache) {
    cache = new Map();
    for (const l of style.layers) {
      if (l.id.startsWith('lv-') && !BASE_LAYERS.includes(l.id)) continue;
      const props = ['fill-opacity', 'line-opacity', 'text-opacity', 'icon-opacity', 'raster-opacity', 'fill-extrusion-opacity', 'background-opacity', 'circle-opacity']
        .filter((p) => p.startsWith(l.type === 'symbol' ? 'text' : l.type) || (l.type === 'symbol' && p === 'icon-opacity'));
      cache.set(l.id, props.map((p) => [p, map.getPaintProperty(l.id, p as any)]));
    }
    baseOpacityCache.set(map, cache);
  }
  for (const [id, props] of cache)
    for (const [p, orig] of props) {
      const base = typeof orig === 'number' ? orig : 1;
      try {
        map.setPaintProperty(id, p as any, factor < 1 ? base * factor : orig ?? undefined);
      } catch {
        /* expression-valued opacity: leave as is */
      }
    }
}

export function applyMode(map: MLMap, mode: MapMode, online: boolean) {
  const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  const p = (id: string, prop: string, v: unknown) => map.getLayer(id) && map.setPaintProperty(id, prop as any, v as any);
  const mine = (a: number, b: number) => ['case', ['==', ['get', 'm'], 1], a, b];
  dimBase(map, mode === 'canvas' ? 0.35 : 1, online);
  vis('lv-avail-fill', mode === 'discovery');
  vis('lv-avail-line', mode === 'discovery');
  vis('lv-grid', mode !== 'canvas');
  vis('lv-density', true);
  switch (mode) {
    case 'atlas':
      p('lv-plots-pattern', 'fill-opacity', 0.85);
      p('lv-art', 'raster-opacity', 1);
      p('lv-plots-line', 'line-opacity', 0.55);
      p('lv-grid', 'line-opacity', 0.2);
      p('lv-groups-glow', 'line-opacity', 0.35);
      p('lv-groups-line', 'line-opacity', 0.7);
      break;
    case 'canvas':
      p('lv-plots-pattern', 'fill-opacity', 0.28);
      p('lv-art', 'raster-opacity', 1);
      p('lv-plots-line', 'line-opacity', 0);
      p('lv-groups-glow', 'line-opacity', 0);
      p('lv-groups-line', 'line-opacity', 0);
      break;
    case 'discovery':
      p('lv-plots-pattern', 'fill-opacity', 0.95);
      p('lv-art', 'raster-opacity', 0.55);
      p('lv-plots-line', 'line-opacity', 0.9);
      p('lv-grid', 'line-opacity', 0.35);
      p('lv-groups-glow', 'line-opacity', 0.25);
      p('lv-groups-line', 'line-opacity', 0.5);
      break;
    case 'land':
      p('lv-plots-pattern', 'fill-opacity', mine(1, 0.12));
      p('lv-art', 'raster-opacity', 0.9);
      p('lv-plots-line', 'line-opacity', mine(0.95, 0.08));
      p('lv-grid', 'line-opacity', 0.15);
      p('lv-groups-glow', 'line-opacity', 0.75);
      p('lv-groups-line', 'line-opacity', 1);
      break;
  }
}

export { latToY };
