// The world canvas: MapLibre map with the rarity-coloured plot grid, everyone's
// plots, the published-art tile pyramid, the player's explorer and four modes.
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
import { ART_MAX_ZOOM, ART_MIN_ZOOM, GRID_LEVEL, GRID_SIZE, Z_STREET, cellPolygon, latToY, lngLatToCell, plotTypeFor, viewportCells, xToLng, yToLat, type PlotTypeWeight } from '../shared/grid';
import { rarities } from '../shared/rarity';
import { explorerNow, travelTo, useExplorer } from '../explorer/explorer';
import { ArtIndex, registerArtProtocol } from './artTiles';
import { STREET_LABEL_LAYERS, recolorOffline, resolveStyle, themeColors } from './basemap';
import { citiesInView } from './places';
import { patternImages, typeIconImages } from './plotStyle';
import { useVisit } from '../visit/visit';
import { mapHandle } from './mapHandle';

maplibregl.setWorkerUrl(workerUrl);

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const ART_TILES = (gen: number) => [`lvart://{z}/{x}/{y}?g=${gen}`];
// zooms at which each layer of the plot grid appears (a plot is 256 px at GRID_LEVEL)
const PLOTS_MIN_ZOOM = GRID_LEVEL - 6.5; // owned plots load (~3 px each)
const CELLS_MIN_ZOOM = GRID_LEVEL - 3.8; // every plot drawn (~18 px)
const GRIDLINES_MIN_ZOOM = GRID_LEVEL - 4.8;
const TYPE_PATTERN_ZOOM = GRID_LEVEL - 3;
const TYPE_ICON_ZOOM = GRID_LEVEL - 2.4;
const NAMES_MIN_ZOOM = GRID_LEVEL - 1.8;
const MAX_CELLS = 5200;

function rarityColor(prop = 'r', key: 'color' | 'glow' = 'color') {
  const list = rarities();
  return ['match', ['get', prop], ...list.flatMap((r) => [r.id, r[key]]), '#888'] as any;
}
function poly(gx: number, gy: number, props: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [cellPolygon(gx, gy)] } };
}
const setData = (map: MLMap, id: string, data: GeoJSON.GeoJSON) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

export const artIndex = new ArtIndex();

function explorerElement(accent: string) {
  const el = document.createElement('div');
  el.className = 'lv-explorer';
  el.innerHTML = `
    <div class="lv-explorer-ring" style="--c:${accent}"></div>
    <svg viewBox="0 0 46 58" width="46" height="58" aria-hidden="true">
      <ellipse class="shadow" cx="23" cy="54" rx="11" ry="3.4" fill="rgba(0,0,0,0.45)"/>
      <g class="body"><g class="flip">
        <rect x="16" y="40" width="5" height="11" rx="2.5" fill="#1b1f3d"/>
        <rect x="25" y="40" width="5" height="11" rx="2.5" fill="#1b1f3d"/>
        <ellipse cx="11.5" cy="33" rx="5.5" ry="6.5" fill="#FFB31F"/>
        <circle cx="10" cy="31" r="1.3" fill="#FF3D9A"/><circle cx="12.6" cy="34.5" r="1.3" fill="#22E3FF"/><circle cx="10" cy="36" r="1.2" fill="#3DDC97"/>
        <rect x="12" y="25.5" width="22" height="19" rx="9.5" fill="${accent}"/>
        <rect x="14" y="27.5" width="18" height="6" rx="3" fill="rgba(255,255,255,0.22)"/>
        <circle cx="23" cy="17" r="11" fill="#FFE2C4"/>
        <path d="M11.5 13.5 Q22 1 34.5 11.5 Q29 9.5 11.5 13.5Z" fill="#FF3D9A"/>
        <circle cx="25" cy="4.6" r="2.1" fill="#FF3D9A"/>
        <circle cx="19.3" cy="18" r="1.9" fill="#1b1f3d"/><circle cx="27" cy="18" r="1.9" fill="#1b1f3d"/>
        <circle cx="19.9" cy="17.4" r="0.6" fill="#fff"/><circle cx="27.6" cy="17.4" r="0.6" fill="#fff"/>
        <path d="M19.6 22.2 Q23 25.2 26.6 22.2" stroke="#1b1f3d" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <circle cx="16.8" cy="21.4" r="1.6" fill="#FF9DB8" opacity="0.7"/><circle cx="29.4" cy="21.4" r="1.6" fill="#FF9DB8" opacity="0.7"/>
        <g transform="rotate(28 36 30)"><rect x="34.8" y="22" width="2.6" height="15" rx="1.2" fill="#8B5A2B"/><path d="M34.4 22 Q36.1 15.5 37.8 22Z" fill="#22E3FF"/></g>
      </g></g>
    </svg>`;
  return el;
}

export function WorldMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onlineRef = useRef(false);
  const streetsRef = useRef(false);
  const genRef = useRef(1);
  const seqRef = useRef(0);
  const rowsRef = useRef<PlotRow[]>([]);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const rarityKeyRef = useRef('');
  const explorerMarker = useRef<maplibregl.Marker | null>(null);
  const nameMarkers = useRef(new Map<string, maplibregl.Marker>());
  const typesRef = useRef<PlotTypeWeight[] | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const mode = useUi((s) => s.mode);
  const selected = useUi((s) => s.selected);
  const flyTo = useUi((s) => s.flyTo);
  const settings = useUi((s) => s.settings);
  const me = useOnboardedMe();
  const world = useWorld();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const accent = me?.profile.accent_color ?? '#7B5CFF';
  typesRef.current = world.data?.plot_types?.map((t) => ({ id: t.id, weight: Number(t.weight), sort: Number(t.sort) }));
  const visit = useVisit((s) => s.visit);

  // ---- init -----------------------------------------------------------------
  useEffect(() => {
    let map: MLMap | null = null;
    let disposed = false;
    registerArtProtocol(artIndex);
    artIndex.reset();
    (async () => {
      const { style, online, streets } = await resolveStyle(themeColors());
      if (disposed || !container.current) return;
      onlineRef.current = online;
      streetsRef.current = streets;
      const v = useUi.getState().view;
      const m = new maplibregl.Map({
        container: container.current,
        style,
        center: [v.lng, v.lat],
        zoom: v.zoom,
        minZoom: 0.6,
        maxZoom: GRID_LEVEL + 0.6,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 65,
        pitch: useUi.getState().settings.tilt3d ? 55 : 0,
        renderWorldCopies: true,
        fadeDuration: 180,
      });
      map = m;
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Artwork © LANDVAS artists · Natural Earth · GeoNames' }), 'bottom-left');
      mapRef.current = m;
      mapHandle.current = m;
      if (config.e2e || import.meta.env.DEV) (window as any).__landvasMap = m;
      m.on('load', () => {
        if (!map) return;
        // a fly-to requested before this map existed (e.g. "View on map" from the editor)
        const pending = useUi.getState().flyTo;
        if (pending && Date.now() - pending.at < 15000) map.jumpTo({ center: [pending.lng, pending.lat], zoom: pending.zoom });
        addLayers(map);
        // street names and place labels stay readable above the plots
        if (streetsRef.current) for (const id of STREET_LABEL_LAYERS) if (map.getLayer(id)) map.moveLayer(id);
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
      m.on('dragstart', () => useExplorer.getState().following && useExplorer.getState().setFollowing(false));
      // raster fades only animate while frames keep coming: make sure a frame
      // follows every freshly loaded art tile so it always reaches full opacity
      m.on('sourcedata', (e: any) => {
        if (e.sourceId === 'lv-art' && e.tile) setTimeout(() => m.triggerRepaint(), 260);
      });
      m.on('click', (e) => {
        if (!map) return;
        const ex = useExplorer.getState();
        if (ex.placing) {
          ex.setPlacing(false);
          void travelTo(e.lngLat.lng, e.lngLat.lat).then(() => {
            void qc.invalidateQueries({ queryKey: qk.me });
            void qc.invalidateQueries({ queryKey: ['plot'] });
          });
          map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), Z_STREET + 0.5), duration: 700 });
          return;
        }
        const z = map.getZoom();
        if (z < GRIDLINES_MIN_ZOOM) {
          map.easeTo({ center: e.lngLat, zoom: Math.min(z + 3.2, Z_STREET + 0.5), duration: 650 });
          return;
        }
        useUi.getState().select(lngLatToCell(e.lngLat.lng, e.lngLat.lat));
      });
      m.on('mousemove', (e) => {
        if (!map || map.getZoom() < GRIDLINES_MIN_ZOOM) return setData(map!, 'lv-hover', EMPTY);
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
      explorerMarker.current?.remove();
      explorerMarker.current = null;
      for (const m of nameMarkers.current.values()) m.remove();
      nameMarkers.current.clear();
      map?.remove();
      mapRef.current = null;
      mapHandle.current = null;
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
    if (z >= PLOTS_MIN_ZOOM && cols <= 1024 && rows <= 1024) {
      try {
        const data = await api.plotsInBbox(v.minGx, v.minGy, v.maxGx, v.maxGy);
        if (seq !== seqRef.current) return;
        rowsRef.current = data;
        setData(map, 'lv-plots', {
          type: 'FeatureCollection',
          features: data.map(([gx, gy, t, level, mine, group, art, user, accentColor, r]) =>
            poly(gx, gy, { t, level, m: mine ? 1 : 0, g: group, a: art ? 1 : 0, u: user, c: accentColor || '#7B5CFF', r: r || 'common' })),
        });
        setData(map, 'lv-density', EMPTY);
        updateNames(map, data, z);
      } catch {
        /* transient */
      }
    } else {
      setData(map, 'lv-plots', EMPTY);
      updateNames(map, [], z);
      const L = [5, 7, 9, 11, 13, 15, 17].reduce((best, l) => (Math.abs(l - (z + 3.4)) < Math.abs(best - (z + 3.4)) ? l : best), 5);
      const s = GRID_LEVEL - L;
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
    // every unclaimed plot in view, showing its type (rarity stays secret until claimed)
    const rarityKey = `${v.minGx}_${v.minGy}_${v.maxGx}_${v.maxGy}_${rowsRef.current.length}_${rowsRef.current[0]?.[0] ?? ''}`;
    if (z >= CELLS_MIN_ZOOM && cols * rows <= MAX_CELLS) {
      if (rarityKeyRef.current === rarityKey) return void updateLabels(map, b, z);
      rarityKeyRef.current = rarityKey;
      const owned = new Set(rowsRef.current.map((r) => `${r[0]}_${r[1]}`));
      const feats: GeoJSON.Feature[] = [];
      for (let y = v.minGy; y <= v.maxGy; y++)
        for (let x = v.minGx; x <= v.maxGx; x++) {
          const gx = ((x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
          if (!owned.has(`${gx}_${y}`)) feats.push(poly(x, y, { t: plotTypeFor(gx, y, typesRef.current) }));
        }
      setData(map, 'lv-rarity', { type: 'FeatureCollection', features: feats });
    } else if (rarityKeyRef.current !== 'empty') {
      rarityKeyRef.current = 'empty';
      setData(map, 'lv-rarity', EMPTY);
    }
    // grid lines when zoomed out a little further than the rarity layer
    if (z >= GRIDLINES_MIN_ZOOM && z < CELLS_MIN_ZOOM && cols <= 400 && rows <= 400) {
      const lines: GeoJSON.Feature[] = [];
      const north = yToLat(v.minGy / GRID_SIZE), south = yToLat((v.maxGy + 1) / GRID_SIZE);
      const west = xToLng(v.minGx / GRID_SIZE), east = xToLng((v.maxGx + 1) / GRID_SIZE);
      for (let x = v.minGx; x <= v.maxGx + 1; x++) lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[xToLng(x / GRID_SIZE), north], [xToLng(x / GRID_SIZE), south]] } });
      for (let y = v.minGy; y <= v.maxGy + 1; y++) lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[west, yToLat(y / GRID_SIZE)], [east, yToLat(y / GRID_SIZE)]] } });
      setData(map, 'lv-grid', { type: 'FeatureCollection', features: lines });
    } else setData(map, 'lv-grid', EMPTY);
    void updateLabels(map, b, z);
  }

  /** Custom plot names float over their plots when zoomed in. */
  function updateNames(map: MLMap, rows: PlotRow[], z: number) {
    const markers = nameMarkers.current;
    const show = z >= NAMES_MIN_ZOOM && modeRef.current !== 'canvas';
    const named = show ? rows.filter((r) => r[10]).slice(0, 80) : [];
    const keep = new Set(named.map((r) => `${r[0]}_${r[1]}_${r[10]}`));
    for (const [k, m] of markers) if (!keep.has(k)) { m.remove(); markers.delete(k); }
    for (const r of named) {
      const k = `${r[0]}_${r[1]}_${r[10]}`;
      if (markers.has(k)) continue;
      const el = document.createElement('div');
      el.className = 'lv-plot-name';
      el.style.setProperty('--c', rarities().find((x) => x.id === r[9])?.color ?? '#fff');
      el.textContent = String(r[10]);
      el.title = `${r[10]} · @${r[7] ?? ''}`;
      const [lng, lat] = [xToLng((r[0] + 0.5) / GRID_SIZE), yToLat((r[1] + 0.5) / GRID_SIZE)];
      markers.set(k, new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
    }
  }

  async function updateLabels(map: MLMap, b: maplibregl.LngLatBounds, z: number) {
    const markers = markersRef.current;
    const show = !onlineRef.current && modeRef.current !== 'canvas' && z >= 2.2 && (!streetsRef.current || z < 9.5);
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

  // ---- explorer: character, reach area and travel route ------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let raf = 0;
    let lastCell = '';
    let lastRoute = 0;
    let lastFollow = 0;
    let lastPaint = 0;
    const el = explorerElement(accent);
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 6] });
    explorerMarker.current = marker;
    let added = false;
    let prev: { lng: number; lat: number } | null = null;
    let movingUntil = 0;
    let reachHidden = false;
    const loop = () => {
      const { state, offset, heading, following: follow, gps } = useExplorer.getState();
      const visiting = !!useVisit.getState().visit;
      const following = follow && !visiting;
      const p = explorerNow(state, offset);
      if (visiting && !reachHidden) { reachHidden = true; lastCell = ''; setData(map, 'lv-reach', EMPTY); }
      if (!visiting && reachHidden) reachHidden = false;
      if (p) {
        if (!added) { marker.setLngLat([p.lng, p.lat]).addTo(map); added = true; }
        else marker.setLngLat([p.lng, p.lat]);
        if (prev && (Math.abs(prev.lng - p.lng) > 1e-9 || Math.abs(prev.lat - p.lat) > 1e-9)) movingUntil = performance.now() + 900;
        prev = p;
        el.classList.toggle('walking', p.traveling || performance.now() < movingUntil);
        el.classList.toggle('left', heading < 0);
        el.classList.toggle('gps', gps === 'on');
        const c = lngLatToCell(p.lng, p.lat);
        const key = `${c.gx}_${c.gy}_${state?.reach ?? 1}`;
        if (key !== lastCell && !visiting) {
          lastCell = key;
          const r = state?.reach ?? 6;
          // the claimable square around the explorer, as one outline
          const y0 = Math.max(0, c.gy - r), y1 = Math.min(GRID_SIZE - 1, c.gy + r);
          const west = xToLng((c.gx - r) / GRID_SIZE), east = xToLng((c.gx + r + 1) / GRID_SIZE);
          const north = yToLat(y0 / GRID_SIZE), south = yToLat((y1 + 1) / GRID_SIZE);
          setData(map, 'lv-reach', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[west, north], [east, north], [east, south], [west, south], [west, north]]] } });
          void qc.invalidateQueries({ queryKey: ['plot'] });
        }
        const now = performance.now();
        if (now < movingUntil && now - lastPaint > 1000) {
          lastPaint = now;
          map.triggerRepaint();
        }
        if (state?.dest && p.traveling && now - lastRoute > 1000) {
          lastRoute = now;
          setData(map, 'lv-route', { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[p.lng, p.lat], [state.dest.lng, state.dest.lat]] } });
        } else if (!p.traveling && lastRoute) {
          lastRoute = 0;
          setData(map, 'lv-route', EMPTY);
        }
        if (following && now - lastFollow > 900) {
          lastFollow = now;
          // keep the 3D tilt while following (a plain easeTo would cancel a tilt in progress)
          map.easeTo({ center: [p.lng, p.lat], pitch: useUi.getState().settings.tilt3d ? 55 : 0, duration: 850, easing: (t) => t });
        }
      } else if (added) {
        marker.remove();
        added = false;
        setData(map, 'lv-reach', EMPTY);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      marker.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accent]);

  // ---- visiting another player: their land glows, a ghost of you stands on it ---------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!visit) {
      setData(map, 'lv-visit', EMPTY);
      return;
    }
    const color = visit.player.accent_color || '#FF3D9A';
    for (const [id, prop] of [['lv-visit-fill', 'fill-color'], ['lv-visit-glow', 'line-color'], ['lv-visit-line', 'line-color']] as const) if (map.getLayer(id)) map.setPaintProperty(id, prop, color);
    setData(map, 'lv-visit', { type: 'FeatureCollection', features: visit.plots.slice(0, 2000).map((p) => poly(p[0], p[1], {})) });
    const el = explorerElement(accent);
    el.classList.add('ghost');
    const tag = document.createElement('div');
    tag.className = 'lv-visit-tag';
    tag.textContent = `Visiting @${visit.player.username}`;
    el.appendChild(tag);
    const ghost = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 6] }).setLngLat([visit.center.lng, visit.center.lat]).addTo(map);
    return () => { ghost.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit, ready, accent]);

  // legendary & mythic plots shimmer
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || settings.reduceMotion) return;
    const id = setInterval(() => {
      const t = performance.now() / 1000;
      if (map.getLayer('lv-owned-glow')) map.setPaintProperty('lv-owned-glow', 'line-opacity', 0.45 + 0.35 * Math.sin(t * 2.4));
    }, 90);
    return () => clearInterval(id);
  }, [ready, settings.reduceMotion]);

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
    if (!ready || !map || !world.data) return;
    if (map.getLayer('lv-owned-glow')) map.setPaintProperty('lv-owned-glow', 'line-color', rarityColor('r', 'glow'));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.data, ready]);

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

  // 3D: tilt the camera so buildings stand up
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pitch = settings.tilt3d ? 55 : 0;
    if (Math.abs(map.getPitch() - pitch) > 0.5) map.easeTo({ pitch, duration: settings.reduceMotion ? 0 : 900 });
  }, [settings.tilt3d, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const recolor = () => {
      if (!onlineRef.current) recolorOffline(map, themeColors(), streetsRef.current);
      applySky(map);
      if (map.getLayer('lv-veil')) map.setPaintProperty('lv-veil', 'background-color', themeColors().bg || '#0b0820');
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

  const placing = useExplorer((s) => s.placing);
  return (
    <div className="absolute inset-0">
      <div ref={container} className={`h-full w-full ${placing ? 'cursor-crosshair' : ''}`} data-testid="world-map" aria-label="World map" role="application" />
    </div>
  );
}

// ---- layers & modes ----------------------------------------------------------------

function addLayers(map: MLMap) {
  for (const img of patternImages()) if (!map.hasImage(img.id)) map.addImage(img.id, { width: img.width, height: img.height, data: img.data }, { pixelRatio: 2 });
  for (const img of typeIconImages()) if (!map.hasImage(img.id)) map.addImage(img.id, { width: img.width, height: img.height, data: img.data }, { pixelRatio: 2 });
  // Canvas mode lays a veil over the base map so the art leads
  map.addLayer({ id: 'lv-veil', type: 'background', paint: { 'background-color': themeColors().bg || '#0b0820', 'background-opacity': 0 } });
  map.addSource('lv-density', { type: 'geojson', data: EMPTY });
  map.addSource('lv-rarity', { type: 'geojson', data: EMPTY }); // unclaimed cells in view (type only)
  map.addSource('lv-plots', { type: 'geojson', data: EMPTY });
  map.addSource('lv-art', { type: 'raster', tiles: ART_TILES(1), tileSize: 256, minzoom: ART_MIN_ZOOM, maxzoom: ART_MAX_ZOOM });
  map.addSource('lv-grid', { type: 'geojson', data: EMPTY });
  map.addSource('lv-groups', { type: 'geojson', data: EMPTY });
  map.addSource('lv-reach', { type: 'geojson', data: EMPTY });
  map.addSource('lv-route', { type: 'geojson', data: EMPTY });
  map.addSource('lv-hover', { type: 'geojson', data: EMPTY });
  map.addSource('lv-sel', { type: 'geojson', data: EMPTY });
  map.addSource('lv-visit', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'lv-density', type: 'circle', source: 'lv-density', maxzoom: PLOTS_MIN_ZOOM + 1,
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'n'], 1, '#3DDC97', 8, '#FFB31F', 40, '#FF3D9A'],
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 3.5, 10, 11, 40, 24],
      'circle-opacity': 0.7, 'circle-blur': 0.45,
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.35,
    },
  });
  // unclaimed plots: a faint grid square, the type's pattern, then its minigame badge (rarity is secret)
  map.addLayer({ id: 'lv-cells-fill', type: 'fill', source: 'lv-rarity', minzoom: CELLS_MIN_ZOOM, paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.035 } });
  map.addLayer({
    id: 'lv-free-pattern', type: 'fill', source: 'lv-rarity', minzoom: TYPE_PATTERN_ZOOM,
    paint: { 'fill-pattern': ['concat', 'pat-free-', ['get', 't']], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], TYPE_PATTERN_ZOOM, 0, TYPE_PATTERN_ZOOM + 0.8, 0.7] },
  });
  map.addLayer({
    id: 'lv-cells-line', type: 'line', source: 'lv-rarity', minzoom: CELLS_MIN_ZOOM,
    paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], CELLS_MIN_ZOOM, 0.5, GRID_LEVEL, 1.4], 'line-opacity': ['interpolate', ['linear'], ['zoom'], CELLS_MIN_ZOOM, 0.12, GRID_LEVEL - 2, 0.3] },
  });
  map.addLayer({
    id: 'lv-free-icon', type: 'symbol', source: 'lv-rarity', minzoom: TYPE_ICON_ZOOM,
    layout: {
      'icon-image': ['concat', 'ico-', ['get', 't']], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], TYPE_ICON_ZOOM, 0.45, GRID_LEVEL - 1, 0.8, GRID_LEVEL + 0.5, 1.15],
    },
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], TYPE_ICON_ZOOM, 0, TYPE_ICON_ZOOM + 0.6, 0.95] },
  });
  map.addLayer({ id: 'lv-grid', type: 'line', source: 'lv-grid', minzoom: GRIDLINES_MIN_ZOOM, paint: { 'line-color': '#c7b8ff', 'line-width': 0.6, 'line-opacity': 0.25 } });
  // claimed plots without art: owner colour + plot-type pattern; plots with art show nothing but the art
  map.addLayer({ id: 'lv-plots-fill', type: 'fill', source: 'lv-plots', filter: ['==', ['get', 'a'], 0], paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['case', ['==', ['get', 'm'], 1], 0.55, 0.38] } });
  map.addLayer({ id: 'lv-plots-pattern', type: 'fill', source: 'lv-plots', filter: ['==', ['get', 'a'], 0], paint: { 'fill-pattern': ['concat', 'pat-owned-', ['get', 't']], 'fill-opacity': 0.55 } });
  map.addLayer({
    id: 'lv-owned-glow', type: 'line', source: 'lv-plots', filter: ['all', ['==', ['get', 'a'], 0], ['in', ['get', 'r'], ['literal', ['legendary', 'mythic']]]],
    paint: { 'line-color': rarityColor('r', 'glow'), 'line-width': ['interpolate', ['linear'], ['zoom'], GRID_LEVEL - 3, 3, GRID_LEVEL, 9], 'line-blur': 5, 'line-opacity': 0.6 },
  });
  map.addLayer({
    id: 'lv-plots-line', type: 'line', source: 'lv-plots',
    paint: { 'line-color': ['case', ['==', ['get', 'm'], 1], '#FFFFFF', ['get', 'c']], 'line-width': ['interpolate', ['linear'], ['zoom'], PLOTS_MIN_ZOOM, 0.5, GRID_LEVEL - 1, ['case', ['==', ['get', 'm'], 1], 2.4, 1.6]], 'line-opacity': 0.9 },
  });
  map.addLayer({ id: 'lv-visit-fill', type: 'fill', source: 'lv-visit', paint: { 'fill-color': '#FF3D9A', 'fill-opacity': 0.16 } });
  map.addLayer({ id: 'lv-visit-glow', type: 'line', source: 'lv-visit', paint: { 'line-color': '#FF3D9A', 'line-width': 9, 'line-blur': 7, 'line-opacity': 0.55 } });
  map.addLayer({ id: 'lv-visit-line', type: 'line', source: 'lv-visit', paint: { 'line-color': '#FF3D9A', 'line-width': 2, 'line-opacity': 0.95 } });
  map.addLayer({ id: 'lv-groups-glow', type: 'line', source: 'lv-groups', paint: { 'line-color': '#22E3FF', 'line-width': 7, 'line-blur': 6, 'line-opacity': 0.45 } });
  map.addLayer({ id: 'lv-groups-line', type: 'line', source: 'lv-groups', paint: { 'line-color': '#C9F6FF', 'line-width': 1.6, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'lv-reach-fill', type: 'fill', source: 'lv-reach', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.06 } });
  // published art sits above every territory overlay: it is shown exactly as it was painted
  map.addLayer({ id: 'lv-art', type: 'raster', source: 'lv-art', paint: { 'raster-fade-duration': 200, 'raster-resampling': 'nearest', 'raster-opacity': 1 } });
  map.addLayer({ id: 'lv-reach-line', type: 'line', source: 'lv-reach', paint: { 'line-color': '#FFFFFF', 'line-width': 1.6, 'line-opacity': 0.7, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'lv-route', type: 'line', source: 'lv-route', paint: { 'line-color': '#FFE14D', 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [1, 1.6] } });
  map.addLayer({ id: 'lv-hover', type: 'line', source: 'lv-hover', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.75 } });
  map.addLayer({ id: 'lv-sel-glow', type: 'line', source: 'lv-sel', paint: { 'line-color': '#FFE14D', 'line-width': 10, 'line-blur': 7, 'line-opacity': 0.6 } });
  map.addLayer({ id: 'lv-sel-line', type: 'line', source: 'lv-sel', paint: { 'line-color': '#FFE14D', 'line-width': 2.4 } });
  applySky(map);
}

function applySky(map: MLMap) {
  const dark = effectiveDark(useUi.getState().settings.theme);
  try {
    map.setSky({
      'sky-color': dark ? '#0a0620' : '#e9e3ff',
      'horizon-color': dark ? '#6b2fb3' : '#c7b4ff',
      'fog-color': dark ? '#120a2e' : '#f4f0ff',
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

/** Dim the base map (Canvas mode lets the art lead). */
function dimBase(map: MLMap, dim: boolean, _online: boolean) {
  if (map.getLayer('lv-veil')) map.setPaintProperty('lv-veil', 'background-opacity', dim ? 0.6 : 0);
}

export function applyMode(map: MLMap, mode: MapMode, online: boolean) {
  const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  const p = (id: string, prop: string, v: unknown) => map.getLayer(id) && map.setPaintProperty(id, prop as any, v as any);
  const mine = (a: number, b: number) => ['case', ['==', ['get', 'm'], 1], a, b];
  dimBase(map, mode === 'canvas', online);
  for (const id of ['lv-cells-fill', 'lv-cells-line', 'lv-free-pattern', 'lv-free-icon', 'lv-grid', 'lv-owned-glow']) vis(id, mode !== 'canvas');
  vis('lv-density', true);
  // the art itself is never tinted or faded: modes only change the overlays around it
  p('lv-art', 'raster-opacity', 1);
  switch (mode) {
    case 'atlas':
      p('lv-plots-pattern', 'fill-opacity', 0.55);
      p('lv-plots-fill', 'fill-opacity', mine(0.55, 0.38));
      p('lv-plots-line', 'line-opacity', 0.9);
      p('lv-groups-glow', 'line-opacity', 0.35);
      p('lv-groups-line', 'line-opacity', 0.7);
      break;
    case 'canvas':
      p('lv-plots-pattern', 'fill-opacity', 0.2);
      p('lv-plots-fill', 'fill-opacity', 0.15);
      p('lv-plots-line', 'line-opacity', 0);
      p('lv-groups-glow', 'line-opacity', 0);
      p('lv-groups-line', 'line-opacity', 0);
      break;
    case 'discovery':
      p('lv-plots-pattern', 'fill-opacity', 0.7);
      p('lv-plots-fill', 'fill-opacity', 0.5);
      p('lv-plots-line', 'line-opacity', 1);
      p('lv-groups-glow', 'line-opacity', 0.25);
      p('lv-groups-line', 'line-opacity', 0.5);
      break;
    case 'land':
      p('lv-plots-pattern', 'fill-opacity', mine(0.8, 0.1));
      p('lv-plots-fill', 'fill-opacity', mine(0.7, 0.1));
      p('lv-plots-line', 'line-opacity', mine(1, 0.15));
      p('lv-groups-glow', 'line-opacity', 0.75);
      p('lv-groups-line', 'line-opacity', 1);
      break;
  }
}

export { latToY };
