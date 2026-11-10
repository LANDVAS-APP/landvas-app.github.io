// The world canvas: MapLibre map with the rarity-coloured plot grid, everyone's
// plots, the published-art tile pyramid, the player's explorer and four modes.
import { autoSaveMapCache, restoreMapCache, saveMapCache } from './mapCache';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, RasterTileSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { CanvasGroup, PlotKind, PlotRow } from '../backend/types';
import { toast } from 'sonner';
import { canPick, pickKind, sameKindMessage } from '../plot/mergeKind';
import { config } from '../env';
import { qk, useOnboardedMe, useWorld } from '../lib/queries';
import { DEFAULT_MAP_THEME, useUi, type MapMode } from '../lib/store';
import { outlineEdges } from '../shared/fusion';
import { ART_MAX_ZOOM, ART_MIN_ZOOM, GRID_LEVEL, GRID_SIZE, Z_STREET, cellPolygon, latToY, lngLatToCell, viewportCells, xToLng, yToLat } from '../shared/grid';
import { rarities } from '../shared/rarity';
import { explorerNow, useExplorer } from '../explorer/explorer';
import { ArtIndex, registerArtProtocol } from './artTiles';
import { CELLS_MIN_ZOOM, GRIDLINES_MIN_ZOOM, PLOTS_MIN_ZOOM, PlotBlocks, registerPlotProtocols } from './plotTiles';
import { useCelebration } from '../plot/ClaimCelebration';
import { BUILDING_LAYERS, STREET_LABEL_LAYERS, mapIsDark, recolorOffline, resolveStyle, themeColors } from './basemap';
import { citiesInView } from './places';
import { mapHandle } from './mapHandle';
import { explorerElement } from '../explorer/character';
import { useCompanion } from '../inkborn/companion';
import { drawCreature } from '../inkborn/rig';
import { MapFx, invalidateResidents } from './MapFx';
import { PlotBubbles } from './Hud';

maplibregl.setWorkerUrl(workerUrl);

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const ART_TILES = (gen: number) => [`lvart://{z}/{x}/{y}?g=${gen}`];
const PLOT_TILES = (gen: number) => [`lvplots://{z}/{x}/{y}?g=${gen}`];
const HAB_TILES = (gen: number) => [`lvhab://{z}/{x}/{y}?g=${gen}`];
const NAMES_MIN_ZOOM = GRID_LEVEL - 1.8;
// phones with 3x screens draw at 2x: a third of the pixels to fill, the same look
const PIXEL_RATIO = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);

function poly(gx: number, gy: number, props: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [cellPolygon(gx, gy)] } };
}
const setData = (map: MLMap, id: string, data: GeoJSON.GeoJSON) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

export const artIndex = new ArtIndex();
let lastMergePaint = 0;
let lastKindNotice = 0;
const mergeKindNotice = (k: PlotKind) => { if (performance.now() - lastKindNotice > 2500) { lastKindNotice = performance.now(); toast(sameKindMessage(k)); } };
export const plotBlocks = new PlotBlocks();
let autoSaving = false;
let lastUid: string | undefined;

export function WorldMap() {
  const companion = useCompanion();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onlineRef = useRef(false);
  const streetsRef = useRef(false);
  const genRef = useRef(1);
  const plotGenRef = useRef(1);
  const seqRef = useRef(0);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const explorerMarker = useRef<maplibregl.Marker | null>(null);
  const nameMarkers = useRef(new Map<string, maplibregl.Marker>());
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
  const styleKey = JSON.stringify(me?.profile.explorer_style ?? {});

  // ---- init -----------------------------------------------------------------
  useEffect(() => {
    let map: MLMap | null = null;
    let disposed = false;
    registerArtProtocol(artIndex);
    registerPlotProtocols(plotBlocks, () => ({ mode: modeRef.current, hidden: useCelebration.getState().hidden }));
    // keep what's already loaded (this visit or the last one) when the backend can tell us exactly what changed since;
    // otherwise start fresh, as updates may have happened unseen
    const be = getBackend();
    if (be.mapCursor) {
      restoreMapCache(plotBlocks, artIndex);
      if (!autoSaving) { autoSaving = true; autoSaveMapCache(plotBlocks, artIndex); }
    } else {
      artIndex.reset();
      plotBlocks.reset();
    }
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
        pixelRatio: PIXEL_RATIO,
      });
      map = m;
      // terrain tiles that don't arrive (offline, a blip) just leave the land unshaded: not an error worth reporting
      m.on('error', (ev) => {
        const e = ev as unknown as { sourceId?: string; error?: Error };
        if (e.sourceId === 'dem' || /elevation-tiles/.test(String(e.error?.message ?? ''))) return;
        console.error(e.error ?? e);
      });
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Artwork © LANDVAS artists · Natural Earth · GeoNames' }), 'bottom-left');
      mapRef.current = m;
      mapHandle.current = m;
      if (config.e2e || import.meta.env.DEV) (window as any).__landvasMap = m;
      // Set up as soon as the style is ready — not on 'load', which waits for every first
      // basemap tile: on a slow phone connection that left the explorer missing until a zoom
      // happened to finish the download.
      let setUp = false;
      const onReady = () => {
        if (!map || setUp || !(map as any).style?._loaded) return; // the style itself (isStyleLoaded() would wait for tiles too)
        setUp = true;
        // a fly-to requested before this map existed (e.g. "View on map" from the editor)
        const pending = useUi.getState().flyTo;
        if (pending && Date.now() - pending.at < 15000) map.jumpTo({ center: [pending.lng, pending.lat], zoom: pending.zoom });
        addLayers(map, streetsRef.current);
        // street names and place labels stay readable above the plots
        if (streetsRef.current) for (const id of STREET_LABEL_LAYERS) if (map.getLayer(id)) map.moveLayer(id);
        applyProjection(map, useUi.getState().settings.globe);
        applyMode(map, modeRef.current, onlineRef.current);
        setReady(true);
        refresh();
      };
      m.on('style.load', onReady);
      m.on('styledata', onReady);
      m.on('load', onReady);
      m.on('moveend', () => {
        if (!map) return;
        const c = map.getCenter();
        const b = map.getBounds();
        const cells = viewportCells(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        useUi.getState().setView({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }, { min_gx: cells.minGx, min_gy: cells.minGy, max_gx: cells.maxGx, max_gy: cells.maxGy });
        refresh();
      });
      m.on('dragstart', () => useExplorer.getState().following && useExplorer.getState().setFollowing(false));
      // markers hold their little animations still while the map moves (see app.css)
      m.on('movestart', () => container.current?.classList.add('lv-map-moving'));
      m.on('moveend', () => container.current?.classList.remove('lv-map-moving'));
      // raster fades only animate while frames keep coming: make sure a frame
      // follows every freshly loaded art tile so it always reaches full opacity
      m.on('sourcedata', (e: any) => {
        if (e.sourceId === 'lv-art' && e.tile) setTimeout(() => m.triggerRepaint(), 260);
      });
      m.on('click', (e) => {
        if (!map) return;
        const ex = useExplorer.getState();
        const z = map.getZoom();
        if (z < GRIDLINES_MIN_ZOOM) {
          map.easeTo({ center: e.lngLat, zoom: Math.min(z + 3.2, Z_STREET + 0.5), duration: 650 });
          return;
        }
        const cell = lngLatToCell(e.lngLat.lng, e.lngLat.lat);
        const ui = useUi.getState();
        if (ui.merge) {
          // merge mode: tapping one of your plots adds or removes its canvas (a drag-pick already did)
          if (performance.now() - lastMergePaint < 700) return;
          const g = (qc.getQueryData(qk.groups) as CanvasGroup[] | undefined)?.find((x) => x.cells.some((c) => c[0] === cell.gx && c[1] === cell.gy));
          if (g) {
            const all = qc.getQueryData(qk.groups) as CanvasGroup[] | undefined;
            if (!canPick(all, ui.merge, g.id)) { mergeKindNotice(pickKind(all, ui.merge)!); return; }
            ui.toggleMerge(g.id);
          }
          return;
        }
        ui.select(cell);
      });
      m.on('mousemove', (e) => {
        if (!map || map.getZoom() < GRIDLINES_MIN_ZOOM) return setData(map!, 'lv-hover', EMPTY);
        const c = lngLatToCell(e.lngLat.lng, e.lngLat.lat);
        // merge mode: light up the whole canvas under the pointer
        const ui = useUi.getState();
        if (ui.merge) {
          const g = (qc.getQueryData(qk.groups) as CanvasGroup[] | undefined)?.find((x) => x.status === 'active' && x.cells.some((k) => k[0] === c.gx && k[1] === c.gy));
          ui.setMergeHover(g ? [g.id] : null);
        }
        setData(map, 'lv-hover', { type: 'FeatureCollection', features: [poly(c.gx, c.gy, {})] });
      });
      m.getCanvas().addEventListener('mouseleave', () => setData(m, 'lv-hover', EMPTY));
    })();
    const unsub = getBackend().subscribeMapUpdates((u) => {
      artIndex.invalidate(u.min_gx, u.min_gy, u.max_gx, u.max_gy);
      plotBlocks.invalidate(u.min_gx, u.min_gy, u.max_gx, u.max_gy);
      const bbox = useUi.getState().bbox;
      const inView = !bbox || (u.max_gx >= bbox.min_gx - 1 && u.min_gx <= bbox.max_gx + 1 && u.max_gy >= bbox.min_gy - 1 && u.min_gy <= bbox.max_gy + 1);
      const m = mapRef.current;
      if (inView && m?.getSource('lv-art')) {
        genRef.current++;
        (m.getSource('lv-art') as RasterTileSource).setTiles(ART_TILES(genRef.current));
        redrawPlots();
      }
      densityKey.current = '';
      void qc.invalidateQueries({ queryKey: ['plot'] });
      refresh();
    });
    return () => {
      disposed = true;
      unsub();
      if (getBackend().mapCursor) saveMapCache(plotBlocks, artIndex);
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

  /** Redraw the owned-plot tiles (after the data or the look changed). */
  function redrawPlots() {
    const m = mapRef.current;
    if (!m?.getSource('lv-plots')) return;
    plotGenRef.current++;
    (m.getSource('lv-plots') as RasterTileSource).setTiles(PLOT_TILES(plotGenRef.current));
    (m.getSource('lv-habitats') as RasterTileSource | undefined)?.setTiles(HAB_TILES(plotGenRef.current));
  }

  // Plots, their outlines and the grid are image tiles (see plotTiles.ts) that MapLibre
  // loads on its own as you pan; all that's left here are the cheap extras.
  async function loadViewport() {
    const map = mapRef.current;
    if (!map || !map.getSource('lv-density')) return;
    const seq = ++seqRef.current;
    const z = map.getZoom();
    const b = map.getBounds();
    const v = viewportCells(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
    void updateLabels(map, b, z);
    if (z >= PLOTS_MIN_ZOOM) {
      if (lastDensity.current) { lastDensity.current = false; densityKey.current = ''; setData(map, 'lv-density', EMPTY); }
      if (z >= NAMES_MIN_ZOOM && modeRef.current !== 'canvas') {
        try {
          const rows = await plotBlocks.rowsIn(v.minGx, v.minGy, v.maxGx, v.maxGy, 16);
          if (seq !== seqRef.current) return;
          updateNames(map, rows, z);
        } catch {
          /* transient */
        }
      } else updateNames(map, [], z);
      return;
    }
    updateNames(map, [], z);
    const L = [5, 7, 9, 11, 13, 15, 17].reduce((best, l) => (Math.abs(l - (z + 3.4)) < Math.abs(best - (z + 3.4)) ? l : best), 5);
    const s = GRID_LEVEL - L;
    const key = `${L}_${v.minGx >> s}_${v.minGy >> s}_${v.maxGx >> s}_${v.maxGy >> s}`;
    if (key === densityKey.current) return;
    try {
      const pts = await api.densityInBbox(L, Math.max(0, v.minGx >> s), Math.max(0, v.minGy >> s), Math.min((1 << L) - 1, v.maxGx >> s), Math.min((1 << L) - 1, v.maxGy >> s));
      if (seq !== seqRef.current) return;
      densityKey.current = key;
      lastDensity.current = true;
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
  const densityKey = useRef('');
  const lastDensity = useRef(false);

  /** Custom plot names float over their plots when zoomed in. */
  function updateNames(map: MLMap, rows: PlotRow[], z: number) {
    const markers = nameMarkers.current;
    const show = z >= NAMES_MIN_ZOOM && modeRef.current !== 'canvas';
    // with map fonts, the map draws the names itself (on the GPU, nothing to move per frame)
    if (map.getSource('lv-names')) {
      const named = show ? rows.filter((r) => r[10]).slice(0, 120) : [];
      setData(map, 'lv-names', { type: 'FeatureCollection', features: named.map((r) => ({ type: 'Feature', properties: { name: String(r[10]), r: r[9] ?? 'common' },
        geometry: { type: 'Point', coordinates: [xToLng((r[0] + 0.5) / GRID_SIZE), yToLat((r[1] + 0.5) / GRID_SIZE)] } })) });
      return;
    }
    const named = show ? rows.filter((r) => r[10]).slice(0, 40) : [];
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
    // with map fonts available the labels are drawn by the map itself (no page elements to move every frame)
    if (map.getSource('lv-cities')) {
      setData(map, 'lv-cities', { type: 'FeatureCollection', features: list.map((c) => ({ type: 'Feature', properties: { name: c.name }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } })) });
      return;
    }
    const keep = new Set(list.map((c) => c.name + c.lng));
    for (const [k, m] of markers) if (!keep.has(k)) { m.remove(); markers.delete(k); }
    for (const c of list) {
      const k = c.name + c.lng;
      if (markers.has(k)) continue;
      const el = document.createElement('div');
      el.className = 'city-label';
      el.textContent = c.name;
      markers.set(k, new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 4], opacityWhenCovered: '0' }).setLngLat([c.lng, c.lat]).addTo(map));
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
    const el = explorerElement(me?.profile.explorer_style, accent);
    // your companion trots along beside you
    let pet: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; n: number } | null = null;
    if (companion) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 96; cv.className = 'lv-companion';
      el.appendChild(cv); pet = { cv, g: cv.getContext('2d')!, n: 0 };
    }
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 6], opacity: '1', opacityWhenCovered: '1' });
    explorerMarker.current = marker;
    let added = false;
    let prev: { lng: number; lat: number } | null = null;
    let movingUntil = 0;
    let lastLng = NaN, lastLat = NaN;
    const cls = { walking: false, left: false, gps: false, 'ride-train': false, 'ride-plane': false, 'ride-home': false };
    const toggle = (k: keyof typeof cls, on: boolean) => { if (cls[k] !== on) { cls[k] = on; el.classList.toggle(k, on); } };
    // runs every frame only while something's moving; standing still it checks a few times a second
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPet = 0;
    const loop = () => {
      raf = 0; timer = null;
      const { state, offset, heading, following, gps } = useExplorer.getState();
      const p = explorerNow(state, offset);
      if (p) {
        if (!added) { marker.setLngLat([p.lng, p.lat]).addTo(map); added = true; lastLng = p.lng; lastLat = p.lat; }
        else if (p.lng !== lastLng || p.lat !== lastLat) { marker.setLngLat([p.lng, p.lat]); lastLng = p.lng; lastLat = p.lat; }
        if (prev && (Math.abs(prev.lng - p.lng) > 1e-9 || Math.abs(prev.lat - p.lat) > 1e-9)) movingUntil = performance.now() + 900;
        prev = p;
        toggle('walking', p.traveling || performance.now() < movingUntil);
        toggle('left', heading < 0);
        toggle('gps', gps === 'on');
        // riding a train or a plane: the explorer is in it
        const ride = state?.mode === 'travel' && p.traveling ? state.trip?.mode : null;
        toggle('ride-train', ride === 'train'); toggle('ride-plane', ride === 'plane'); toggle('ride-home', ride === 'home');
        const t = performance.now();
        // the companion animates at 20 fps walking, 8 standing still, and holds while the map moves
        if (pet && companion && t - lastPet > (cls.walking ? 50 : 125) && !container.current?.classList.contains('lv-map-moving')) {
          lastPet = t; pet.n++;
          pet.g.clearRect(0, 0, 96, 96);
          drawCreature(pet.g, companion.g, 48, 92, 46, { t: performance.now() / 1000, state: cls.walking ? 'walk' : 'idle', dir: cls.left ? -1 : 1 });
        }
        const c = lngLatToCell(p.lng, p.lat);
        const key = `${c.gx}_${c.gy}_${state?.reach ?? 1}`;
        if (key !== lastCell) {
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
        // follow only when the explorer has drifted from the middle of the screen (re-centring on the same
        // spot every second kept the map animating — and redrawing — non-stop while standing still)
        if (following && now - lastFollow > 900 && !map.isMoving() && offCentre(map, p.lng, p.lat) > 6) {
          lastFollow = now;
          // keep the 3D tilt while following (a plain easeTo would cancel a tilt in progress)
          map.easeTo({ center: [p.lng, p.lat], pitch: useUi.getState().settings.tilt3d ? 55 : 0, duration: 850, easing: (t) => t });
        }
      } else if (added) {
        marker.remove();
        added = false;
        lastCell = '';
        setData(map, 'lv-reach', EMPTY);
      }
      const ex = useExplorer.getState();
      const busy = !!p && (p.traveling || performance.now() < movingUntil) || ex.following && !!p?.traveling;
      if (busy) raf = requestAnimationFrame(loop);
      else timer = setTimeout(loop, companion ? 120 : 250);
    };
    // the joystick and GPS wake it straight away
    const unsubEx = useExplorer.subscribe(() => { if (!raf) { if (timer) clearTimeout(timer); timer = null; raf = requestAnimationFrame(loop); } });
    loop();
    return () => {
      cancelAnimationFrame(raf); if (timer) clearTimeout(timer); unsubEx();
      marker.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accent, styleKey, companion?.c.id]);

  // ---- reactive updates ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyMode(map, mode, onlineRef.current);
    redrawPlots();
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready]);

  // a different player sees different "mine" highlights
  const uid = me?.user_id;
  useEffect(() => {
    if (!ready) return;
    // (the blocks say which plots are yours, so only a different player needs them again)
    if (lastUid !== undefined && lastUid !== uid) plotBlocks.reset();
    lastUid = uid;
    redrawPlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !world.data) return;
    redrawPlots(); // rarity colours come from the world config
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.data, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setData(map, 'lv-sel', selected ? { type: 'FeatureCollection', features: [poly(selected.gx, selected.gy, {})] } : EMPTY);
  }, [selected, ready]);

  const merge = useUi((s) => s.merge);
  const mergeHover = useUi((s) => s.mergeHover);
  const mergeTool = useUi((s) => s.mergeTool);
  // merge mode: drag a finger (or the mouse) across your plots to pick them all in one go
  const picking = merge !== null && mergeTool === 'pick';
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !picking) return;
    map.dragPan.disable();
    const el = map.getCanvasContainer();
    let painting = false, add = true;
    const touched = new Set<string>();
    const groupAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const ll = map.unproject([e.clientX - r.left, e.clientY - r.top]);
      const c = lngLatToCell(ll.lng, ll.lat);
      return (qc.getQueryData(qk.groups) as CanvasGroup[] | undefined)?.find((x) => x.status === 'active' && x.cells.some((k) => k[0] === c.gx && k[1] === c.gy)) ?? null;
    };
    const apply = (id: string) => {
      touched.add(id);
      const ui = useUi.getState(), cur = ui.merge ?? [];
      const all = qc.getQueryData(qk.groups) as CanvasGroup[] | undefined;
      if (add && !canPick(all, cur, id)) { mergeKindNotice(pickKind(all, cur)!); return; }
      if (add && !cur.includes(id)) ui.setMerge([...cur, id]);
      if (!add && cur.includes(id)) ui.setMerge(cur.filter((x) => x !== id));
      lastMergePaint = performance.now();
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button > 0) return;
      const g = groupAt(e);
      painting = true; touched.clear();
      add = !g || !(useUi.getState().merge ?? []).includes(g.id);
      if (g) apply(g.id);
    };
    const move = (e: PointerEvent) => { if (!painting) return; const g = groupAt(e); if (g && !touched.has(g.id)) apply(g.id); };
    const up = () => { painting = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      map.dragPan.enable();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    };
  }, [ready, picking]); // eslint-disable-line react-hooks/exhaustive-deps
  const rolling = useCelebration((s) => s.hidden);
  useEffect(() => { if (ready) redrawPlots(); }, [rolling]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if ((!merge && !mergeHover?.length) || !groups.data) { setData(map, 'lv-merge', EMPTY); return; }
    // s: 0 = your other canvases (merge mode), 1 = picked, 2 = the canvas you're pointing at / about to connect
    // once something's picked, only plots of the same type light up
    const lock = merge ? pickKind(groups.data, merge) : null;
    const feats: GeoJSON.Feature[] = groups.data.filter((g) => g.status === 'active' && (merge || mergeHover?.includes(g.id)) && (!lock || (g.kind ?? 'canvas') === lock))
      .flatMap((g) => g.cells.map((c) => poly(c[0], c[1], { s: mergeHover?.includes(g.id) && !merge?.includes(g.id) ? 2 : merge?.includes(g.id) ? 1 : merge ? 0 : 1 })));
    setData(map, 'lv-merge', { type: 'FeatureCollection', features: feats });
  }, [merge, mergeHover, groups.data, ready]);

  // your own land changed (a claim, purchase, merge or new art): redraw those blocks at once
  const ownKey = useRef('');
  useEffect(() => {
    if (!ready || !groups.data) return;
    const k = groups.data.map((g) => `${g.id}:${g.status}:${g.plot_count}:${g.cells.length}:${g.kind ?? 'canvas'}`).sort().join('|');
    if (ownKey.current && ownKey.current !== k) {
      invalidateResidents();
      for (const g of groups.data) for (const [gx, gy] of g.cells) plotBlocks.invalidate(gx, gy, gx, gy);
      redrawPlots();
    }
    ownKey.current = k;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.data, ready]);

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
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom, pitch: settings.tilt3d ? 55 : 0, essential: true, duration: settings.reduceMotion ? 0 : 1600 });
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
    if (map.getLayer(BUILDING_LAYERS.tall)) {
      map.setLayoutProperty(BUILDING_LAYERS.tall, 'visibility', settings.tilt3d ? 'visible' : 'none');
      map.setLayoutProperty(BUILDING_LAYERS.flat, 'visibility', settings.tilt3d ? 'none' : 'visible');
    }
    if (Math.abs(map.getPitch() - pitch) > 0.5) map.easeTo({ pitch, duration: settings.reduceMotion ? 0 : 900 });
  }, [settings.tilt3d, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const recolor = () => {
      if (!onlineRef.current) recolorOffline(map, themeColors(), streetsRef.current);
      applySky(map);
      if (map.getLayer('lv-veil')) map.setPaintProperty('lv-veil', 'background-color', themeColors().bg || '#0b0820');
      // a light map (Terrain, Atlas, or Neon by day) gets dark labels with a white halo
      const light = !mapIsDark();
      container.current?.classList.toggle('lv-map-light', light);
      if (map.getLayer('lv-cities')) {
        map.setPaintProperty('lv-cities', 'text-color', light ? '#3a3550' : cssVar('--muted', '#a1abd6'));
        map.setPaintProperty('lv-cities', 'text-halo-color', light ? '#ffffff' : cssVar('--bg', '#070b1c'));
      }
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
  }, [settings.theme, settings.mapTheme, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" data-testid="world-map" aria-label="World map" role="application" />
      <MapFx map={ready ? mapRef.current : null} blocks={plotBlocks} />
      <PlotBubbles ready={ready} />
    </div>
  );
}

// ---- layers & modes ----------------------------------------------------------------

function addLayers(map: MLMap, glyphs: boolean) {
  // Canvas mode lays a veil over the base map so the art leads
  map.addLayer({ id: 'lv-veil', type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': themeColors().bg || '#0b0820', 'background-opacity': 0 } });
  map.addSource('lv-density', { type: 'geojson', data: EMPTY });
  // the plot grid and owned plots are image tiles drawn on the device (plotTiles.ts)
  map.addSource('lv-plots', { type: 'raster', tiles: PLOT_TILES(1), tileSize: 256, minzoom: Math.floor(PLOTS_MIN_ZOOM), maxzoom: GRID_LEVEL });
  map.addSource('lv-habitats', { type: 'raster', tiles: HAB_TILES(1), tileSize: 256, minzoom: Math.floor(PLOTS_MIN_ZOOM), maxzoom: GRID_LEVEL });
  map.addSource('lv-art', { type: 'raster', tiles: ART_TILES(1), tileSize: 256, minzoom: ART_MIN_ZOOM, maxzoom: ART_MAX_ZOOM });
  map.addSource('lv-groups', { type: 'geojson', data: EMPTY });
  map.addSource('lv-reach', { type: 'geojson', data: EMPTY });
  map.addSource('lv-route', { type: 'geojson', data: EMPTY });
  map.addSource('lv-hover', { type: 'geojson', data: EMPTY });
  map.addSource('lv-sel', { type: 'geojson', data: EMPTY });
  map.addSource('lv-merge', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'lv-density', type: 'circle', source: 'lv-density', maxzoom: PLOTS_MIN_ZOOM + 1,
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'n'], 1, '#3DDC97', 8, '#FFB31F', 40, '#FF3D9A'],
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 3.5, 10, 11, 40, 24],
      'circle-opacity': 0.7, 'circle-blur': 0.45,
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.35,
    },
  });
  // the plot grid (unclaimed plots: a faint, identical square each) and claimed plots — owner colour + plot-type
  // pattern; plots with art show nothing but the art — share one image layer
  map.addLayer({ id: 'lv-plots', type: 'raster', source: 'lv-plots', minzoom: PLOTS_MIN_ZOOM, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
  map.addLayer({ id: 'lv-groups-glow', type: 'line', source: 'lv-groups', paint: { 'line-color': '#22E3FF', 'line-width': 7, 'line-blur': 6, 'line-opacity': 0.45 } });
  map.addLayer({ id: 'lv-groups-line', type: 'line', source: 'lv-groups', paint: { 'line-color': '#C9F6FF', 'line-width': 1.6, 'line-opacity': 0.9 } });
  // merge mode: your canvases (dim) and the ones you've picked (bright)
  map.addLayer({ id: 'lv-merge-fill', type: 'fill', source: 'lv-merge', paint: { 'fill-color': ['match', ['get', 's'], 1, '#22E3FF', 2, '#FFC93D', '#FFFFFF'], 'fill-opacity': ['match', ['get', 's'], 1, 0.42, 2, 0.5, 0.08] } });
  map.addLayer({ id: 'lv-merge-line', type: 'line', source: 'lv-merge', paint: { 'line-color': ['match', ['get', 's'], 1, '#22E3FF', 2, '#FFC93D', '#C9F6FF'], 'line-width': ['match', ['get', 's'], 0, 1.2, 3], 'line-dasharray': [2, 1.5], 'line-opacity': 0.95 } });
  map.addLayer({ id: 'lv-reach-fill', type: 'fill', source: 'lv-reach', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.06 } });
  // published art sits above every territory overlay: it is shown exactly as it was painted
  map.addLayer({ id: 'lv-art', type: 'raster', source: 'lv-art', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest', 'raster-opacity': 1 } });
  // Inkborn Habitat plots: a miniature woodland drawn over the plot (any old artwork stays saved underneath)
  map.addLayer({ id: 'lv-habitats', type: 'raster', source: 'lv-habitats', minzoom: PLOTS_MIN_ZOOM, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
  map.addLayer({ id: 'lv-reach-line', type: 'line', source: 'lv-reach', paint: { 'line-color': '#FFFFFF', 'line-width': 1.6, 'line-opacity': 0.7, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'lv-route', type: 'line', source: 'lv-route', paint: { 'line-color': '#FFE14D', 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [1, 1.6] } });
  map.addLayer({ id: 'lv-hover', type: 'line', source: 'lv-hover', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.75 } });
  map.addLayer({ id: 'lv-sel-glow', type: 'line', source: 'lv-sel', paint: { 'line-color': '#FFE14D', 'line-width': 10, 'line-blur': 7, 'line-opacity': 0.6 } });
  map.addLayer({ id: 'lv-sel-line', type: 'line', source: 'lv-sel', paint: { 'line-color': '#FFE14D', 'line-width': 2.4 } });
  if (glyphs) {
    // plot names: a dark pill with a rim in the plot's rarity colour (one stretchable image per rarity)
    for (const r of rarities()) addPill(map, `lv-pill-${r.id}`, r.color);
    map.addSource('lv-names', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'lv-names', type: 'symbol', source: 'lv-names', minzoom: NAMES_MIN_ZOOM,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11.5, 'text-max-width': 12, 'icon-image': ['concat', 'lv-pill-', ['get', 'r']],
        'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 9, 3, 9], 'text-allow-overlap': false, 'icon-allow-overlap': false, 'text-padding': 4, 'text-optional': false },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.55)', 'text-halo-width': 0.8 },
    });
    map.addSource('lv-cities', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'lv-cities', type: 'symbol', source: 'lv-cities',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-letter-spacing': 0.04, 'text-anchor': 'top', 'text-offset': [0, 0.35], 'text-allow-overlap': false },
      paint: { 'text-color': cssVar('--muted', '#a1abd6'), 'text-halo-color': cssVar('--bg', '#070b1c'), 'text-halo-width': 1.6, 'text-halo-blur': 0.6 },
    });
  }
  applySky(map);
}

/** How far (in screen pixels) a point is from the middle of the map. */
function offCentre(map: MLMap, lng: number, lat: number) {
  const a = map.project([lng, lat]), c = map.getCanvas();
  return Math.hypot(a.x - c.clientWidth / 2, a.y - c.clientHeight / 2);
}

/** A stretchable pill (9-slice) with a coloured rim, drawn once per rarity. */
function addPill(map: MLMap, id: string, rim: string) {
  if (map.hasImage(id)) return;
  const W = 64, H = 40, R = 20, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(14,10,36,0.82)'; g.strokeStyle = rim; g.lineWidth = 3;
  g.beginPath(); g.roundRect(1.5, 1.5, W - 3, H - 3, R - 1.5); g.fill(); g.stroke();
  map.addImage(id, g.getImageData(0, 0, W, H), { pixelRatio: 2, stretchX: [[R, W - R]], stretchY: [[R - 2, H - R + 2]], content: [R - 6, 8, W - R + 6, H - 8] });
}

const cssVar = (n: string, d: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;

function applySky(map: MLMap) {
  const dark = mapIsDark();
  const natural = !dark && (useUi.getState().settings.mapTheme ?? DEFAULT_MAP_THEME) !== 'neon';
  try {
    map.setSky({
      'sky-color': dark ? '#0a0620' : natural ? '#bfe3ff' : '#e9e3ff',
      'horizon-color': dark ? '#6b2fb3' : natural ? '#e8f4ff' : '#c7b4ff',
      'fog-color': dark ? '#120a2e' : natural ? '#f2f8fc' : '#f4f0ff',
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
  if (!map.getLayer('lv-veil')) return;
  // a hidden layer costs nothing; an invisible one still fills every pixel of every frame
  map.setLayoutProperty('lv-veil', 'visibility', dim ? 'visible' : 'none');
  map.setPaintProperty('lv-veil', 'background-opacity', dim ? 0.6 : 0);
}

export function applyMode(map: MLMap, mode: MapMode, online: boolean) {
  const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  const p = (id: string, prop: string, v: unknown) => map.getLayer(id) && map.setPaintProperty(id, prop as any, v as any);
  dimBase(map, mode === 'canvas', online);
  vis('lv-density', true);
  // the art itself is never tinted or faded: modes only change the overlays around it
  p('lv-art', 'raster-opacity', 1);
  switch (mode) {
    case 'atlas':
      p('lv-groups-glow', 'line-opacity', 0.35);
      p('lv-groups-line', 'line-opacity', 0.7);
      break;
    case 'canvas':
      p('lv-groups-glow', 'line-opacity', 0);
      p('lv-groups-line', 'line-opacity', 0);
      break;
    case 'discovery':
      p('lv-groups-glow', 'line-opacity', 0.25);
      p('lv-groups-line', 'line-opacity', 0.5);
      break;
    case 'land':
      p('lv-groups-glow', 'line-opacity', 0.75);
      p('lv-groups-line', 'line-opacity', 1);
      break;
  }
}

export { latToY };
