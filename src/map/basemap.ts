// Base map styles.
//  * The atlas (always): a stylised, colourful world built from Natural Earth
//    country shapes bundled with the app — every country gets its own jewel
//    tone (greedy map colouring, so neighbours never match). Works offline.
//  * Streets (hosted builds, VITE_STREETS): real roads, parks, water, labels
//    and 3D buildings from OpenStreetMap vector tiles (OpenFreeMap, free, no
//    key), styled as a neon night city (or a pastel day city in light mode).
//    The atlas fades out as you zoom into a city; if the tiles can't be
//    reached the atlas simply stays.
//  * A full external style (VITE_MAP_STYLE_URL) replaces both.
import type { LayerSpecification, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { feature, mesh, neighbors } from 'topojson-client';
import countriesUrl from '../data/countries-50m.json?url';
import { config } from '../env';
import { effectiveDark, useUi } from '../lib/store';

export type ThemeColors = { ocean: string; land: string; border: string; coast: string; grat: string; bg: string; palette: string[]; dark: boolean };

const DARK_PALETTE = ['#1e6e58', '#6b318a', '#9c4b22', '#25528f', '#8c2a52', '#5f7020', '#1f7d88'];
const LIGHT_PALETTE = ['#c3efdd', '#e6d1f4', '#f8d7c1', '#cddcf7', '#f6cddc', '#e4edbd', '#c3e9ee'];

export function themeColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const dark = effectiveDark(useUi.getState().settings.theme);
  return {
    ocean: v('--map-ocean'), land: v('--map-land'), border: v('--map-border'), coast: v('--map-coast'), grat: v('--map-grat'), bg: v('--bg'),
    palette: dark ? DARK_PALETTE : LIGHT_PALETTE, dark,
  };
}

let geo: Promise<{ land: GeoJSON.FeatureCollection; borders: GeoJSON.MultiLineString }> | null = null;
function loadGeo() {
  geo ??= fetch(countriesUrl)
    .then((r) => r.json())
    .then((topo) => {
      const geoms = topo.objects.countries.geometries;
      // greedy colouring: neighbours always get different colours
      const nb: number[][] = neighbors(geoms);
      const colors: number[] = new Array(geoms.length).fill(-1);
      const order = geoms.map((_: unknown, i: number) => i).sort((a: number, b: number) => nb[b].length - nb[a].length);
      for (const i of order) {
        const used = new Set(nb[i].map((j) => colors[j]));
        let c = (i * 3) % DARK_PALETTE.length;
        for (let k = 0; k < DARK_PALETTE.length && used.has(c); k++) c = (c + 1) % DARK_PALETTE.length;
        colors[i] = c;
      }
      const land = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
      land.features.forEach((f, i) => (f.properties = { ...(f.properties ?? {}), mc: colors[i] }));
      return {
        land,
        borders: mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b) as unknown as GeoJSON.MultiLineString,
      };
    });
  return geo;
}

function graticule(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let lng = -180; lng <= 180; lng += 15)
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 35 }, (_, i) => [lng, -85 + i * 5]) } });
  for (let lat = -75; lat <= 75; lat += 15)
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]) } });
  return { type: 'FeatureCollection', features };
}

export const BASE_LAYERS = ['lv-bg', 'lv-grat', 'lv-land', 'lv-coast', 'lv-borders'];
const landColor = (palette: string[]) => ['match', ['get', 'mc'], ...palette.flatMap((c, i) => [i, c]), palette[0]] as any;

// ---- streets palette --------------------------------------------------------------

type StreetPalette = {
  land: string; residential: string; commercial: string; industrial: string; civic: string; cemetery: string; sport: string;
  park: string; parkLine: string; wood: string; farm: string; sand: string; wetland: string; ice: string; rock: string;
  water: string; waterLine: string; waterway: string; casing: string; motorway: string; trunk: string; primary: string;
  secondary: string; tertiary: string; minor: string; service: string; path: string; rail: string; runway: string;
  bld: [number, string][]; roadText: string; placeText: string; waterText: string; halo: string;
};

const NIGHT: StreetPalette = {
  land: '#1a1236', residential: '#21173f', commercial: '#2c1646', industrial: '#1f1b3b', civic: '#2d1a3c', cemetery: '#1a2c2c', sport: '#12452f',
  park: '#135b3c', parkLine: '#3ddc97', wood: '#0f4a33', farm: '#1f2e24', sand: '#4d3f1d', wetland: '#134640', ice: '#2d3f5c', rock: '#2c2742',
  water: '#0b3a4e', waterLine: '#22e3ff', waterway: '#1a6f8c', casing: '#0a0618', motorway: '#ff4fa3', trunk: '#ff7a59', primary: '#ffb347',
  secondary: '#ffe066', tertiary: '#b69cff', minor: '#6a58b8', service: '#54479a', path: '#8f7fd6', rail: '#8d7fb5', runway: '#3a2f66',
  bld: [[0, '#3b2a72'], [15, '#5a3aa8'], [40, '#7f48d8'], [100, '#b35cff'], [250, '#ff5cc8']],
  roadText: '#e6ddff', placeText: '#ffffff', waterText: '#7fe8ff', halo: '#120c2c',
};
const DAY: StreetPalette = {
  land: '#f6f1ff', residential: '#efe7fc', commercial: '#fde4f1', industrial: '#ece7f4', civic: '#fde9e3', cemetery: '#dcefe5', sport: '#c8f0d8',
  park: '#bdecce', parkLine: '#5cc98c', wood: '#a9dfc0', farm: '#eef4d8', sand: '#f8ecc4', wetland: '#cdebe3', ice: '#e8f4ff', rock: '#e4e0ea',
  water: '#9fdcef', waterLine: '#4fbfe0', waterway: '#7fcde3', casing: '#cdbff2', motorway: '#ff8cc6', trunk: '#ffab91', primary: '#ffd27a',
  secondary: '#fff1a6', tertiary: '#ffffff', minor: '#ffffff', service: '#fbf9ff', path: '#a493e6', rail: '#a79cc7', runway: '#ddd5f5',
  bld: [[0, '#dcd2fb'], [20, '#cbb9f8'], [60, '#b39cf2'], [150, '#9a7ee8']],
  roadText: '#3b2d6b', placeText: '#1d1640', waterText: '#1b6f8c', halo: '#ffffff',
};

const STREETS_MIN = 8;
// touch devices skip the blurred road glows: wide blurred lines are the most expensive
// thing a phone GPU draws, and the roads read just as well without them
const LITE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** 3D buildings only stand up while the map is tilted; flat roofs draw far cheaper. */
export const BUILDING_LAYERS = { flat: 'st-buildings-flat', tall: 'st-buildings' };
const fadeIn = (from: number, to: number, max = 1) => ['interpolate', ['linear'], ['zoom'], from, 0, to, max] as any;
const widths = (stops: [number, number][]) => ['interpolate', ['exponential', 1.6], ['zoom'], ...stops.flat()] as any;
const cls = (...c: string[]) => ['in', ['get', 'class'], ['literal', c]] as any;

const ROADS: { id: string; classes: string[]; color: keyof StreetPalette; w: [number, number][]; min: number; glow?: boolean }[] = [
  { id: 'service', classes: ['service', 'track'], color: 'service', w: [[13, 0.4], [16, 3], [19, 12]], min: 13 },
  { id: 'minor', classes: ['minor'], color: 'minor', w: [[11, 0.4], [14, 1.6], [16, 5], [19, 22]], min: 11 },
  { id: 'tertiary', classes: ['tertiary'], color: 'tertiary', w: [[10, 0.5], [13, 1.6], [16, 6.5], [19, 26]], min: 10 },
  { id: 'secondary', classes: ['secondary'], color: 'secondary', w: [[9, 0.5], [12, 1.6], [16, 8], [19, 30]], min: 9 },
  { id: 'primary', classes: ['primary'], color: 'primary', w: [[8, 0.6], [12, 2], [16, 9.5], [19, 34]], min: 8, glow: true },
  { id: 'trunk', classes: ['trunk'], color: 'trunk', w: [[8, 0.8], [12, 2.4], [16, 10], [19, 36]], min: 8, glow: true },
  { id: 'motorway', classes: ['motorway'], color: 'motorway', w: [[8, 1], [12, 2.8], [16, 11], [19, 38]], min: 8, glow: true },
];

/** Street-level layers. `base` sit under the plot layers, `labels` on top of everything. */
export function streetLayers(p: StreetPalette): { base: LayerSpecification[]; labels: LayerSpecification[] } {
  const src = { source: 'streets' } as const;
  const base: LayerSpecification[] = [
    { id: 'st-landcover', type: 'fill', ...src, 'source-layer': 'landcover', minzoom: STREETS_MIN,
      paint: { 'fill-color': ['match', ['get', 'class'], 'wood', p.wood, 'grass', p.park, 'farmland', p.farm, 'sand', p.sand, 'wetland', p.wetland, 'ice', p.ice, 'rock', p.rock, p.park] as any, 'fill-opacity': fadeIn(STREETS_MIN, 9.5, 0.9) } },
    { id: 'st-landuse', type: 'fill', ...src, 'source-layer': 'landuse', minzoom: 10,
      paint: {
        'fill-color': ['match', ['get', 'class'],
          ['residential', 'suburb', 'quarter', 'neighbourhood'], p.residential,
          ['commercial', 'retail'], p.commercial,
          ['industrial', 'railway', 'garages', 'quarry', 'dam'], p.industrial,
          ['school', 'university', 'college', 'kindergarten', 'library', 'hospital'], p.civic,
          'cemetery', p.cemetery, 'military', p.industrial,
          ['stadium', 'pitch', 'playground', 'track', 'theme_park', 'zoo'], p.sport,
          p.residential] as any,
        'fill-opacity': fadeIn(10, 11.5, 1),
      } },
    { id: 'st-park', type: 'fill', ...src, 'source-layer': 'park', minzoom: STREETS_MIN, paint: { 'fill-color': p.park, 'fill-opacity': fadeIn(STREETS_MIN, 9.5, 0.85) } },
    { id: 'st-park-line', type: 'line', ...src, 'source-layer': 'park', minzoom: 12, paint: { 'line-color': p.parkLine, 'line-width': 1.2, 'line-opacity': fadeIn(12, 13.5, 0.45) } },
    { id: 'st-water', type: 'fill', ...src, 'source-layer': 'water', minzoom: STREETS_MIN - 0.5, paint: { 'fill-color': p.water, 'fill-opacity': fadeIn(STREETS_MIN - 0.5, STREETS_MIN + 0.5, 1) } },
    { id: 'st-water-glow', type: 'line', ...src, 'source-layer': 'water', minzoom: 10, paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 3] as any, 'line-blur': 2, 'line-opacity': fadeIn(10, 12, 0.35) } },
    { id: 'st-waterway', type: 'line', ...src, 'source-layer': 'waterway', minzoom: 10,
      paint: { 'line-color': p.waterway, 'line-width': widths([[10, 0.6], [14, 2], [18, 8]]), 'line-opacity': fadeIn(10, 11, 0.9) } },
    { id: 'st-aeroway', type: 'line', ...src, 'source-layer': 'aeroway', minzoom: 11, filter: cls('runway', 'taxiway'),
      paint: { 'line-color': p.runway, 'line-width': widths([[11, 1], [14, 8], [17, 40]]) } },
    // roads: dark casing, coloured core, glow on the big ones
    ...ROADS.filter((r) => r.glow && !LITE).map((r): LayerSpecification => ({
      id: `st-road-${r.id}-glow`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: r.min,
      filter: ['all', cls(...r.classes), ['!=', ['get', 'brunnel'], 'tunnel']] as any,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p[r.color] as string, 'line-width': widths(r.w.map(([z, w]) => [z, w * 3.2])), 'line-blur': widths(r.w.map(([z, w]) => [z, w * 1.6])), 'line-opacity': fadeIn(r.min, r.min + 1.5, p === NIGHT ? 0.32 : 0.18) },
    })),
    ...ROADS.map((r): LayerSpecification => ({
      id: `st-road-${r.id}-casing`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: Math.max(r.min, 12),
      filter: cls(...r.classes),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.casing, 'line-width': widths(r.w.map(([z, w]) => [z, w + Math.max(1, w * 0.35)])), 'line-opacity': ['match', ['get', 'brunnel'], 'tunnel', 0.4, 0.9] as any },
    })),
    ...ROADS.map((r): LayerSpecification => ({
      id: `st-road-${r.id}`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: r.min,
      filter: cls(...r.classes),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p[r.color] as string, 'line-width': widths(r.w), 'line-opacity': ['interpolate', ['linear'], ['zoom'], r.min, 0, r.min + 1, ['match', ['get', 'brunnel'], 'tunnel', 0.45, 1]] as any },
    })),
    { id: 'st-path', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 14, filter: cls('path'),
      paint: { 'line-color': p.path, 'line-width': widths([[14, 0.6], [17, 2], [19, 4]]), 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 } },
    { id: 'st-rail', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 11, filter: cls('rail', 'transit'),
      paint: { 'line-color': p.rail, 'line-width': widths([[11, 0.6], [15, 1.6], [18, 3]]), 'line-dasharray': [3, 2], 'line-opacity': 0.85 } },
    // buildings: flat roofs from above, 3D towers when the map is tilted
    { id: 'st-buildings-flat', type: 'fill', ...src, 'source-layer': 'building', minzoom: 13.5,
      paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], ...p.bld.flat()] as any, 'fill-opacity': fadeIn(13.5, 14.5, 0.88) } },
    { id: 'st-buildings', type: 'fill-extrusion', ...src, 'source-layer': 'building', minzoom: 13.5, layout: { visibility: 'none' },
      filter: ['!=', ['get', 'hide_3d'], true] as any,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], ...p.bld.flat()] as any,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15, ['coalesce', ['get', 'render_height'], 8]] as any,
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] as any,
        'fill-extrusion-opacity': 0.88,
        'fill-extrusion-vertical-gradient': true,
      } },
  ];
  const font = ['Noto Sans Regular'];
  const bold = ['Noto Sans Bold'];
  const labels: LayerSpecification[] = [
    { id: 'st-label-road', type: 'symbol', ...src, 'source-layer': 'transportation_name', minzoom: 14.5,
      filter: cls('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'),
      layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']] as any, 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 10, 18, 13] as any, 'text-max-angle': 30, 'symbol-spacing': 320 },
      paint: { 'text-color': p.roadText, 'text-halo-color': p.halo, 'text-halo-width': 1.4, 'text-opacity': fadeIn(14.5, 15.2, 0.92) } },
    { id: 'st-label-water', type: 'symbol', ...src, 'source-layer': 'water_name', minzoom: 11,
      layout: { 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']] as any, 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'symbol-placement': 'point' },
      paint: { 'text-color': p.waterText, 'text-halo-color': p.halo, 'text-halo-width': 1.2 } },
    { id: 'st-label-place', type: 'symbol', ...src, 'source-layer': 'place', minzoom: 9.5,
      filter: cls('city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood'),
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']] as any,
        'text-font': bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 9.5, ['match', ['get', 'class'], 'city', 14, 'town', 12.5, 10.5], 15, ['match', ['get', 'class'], 'city', 21, 'town', 16, 13]] as any,
        'text-transform': ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], 'uppercase', 'none'] as any,
        'text-letter-spacing': ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], 0.12, 0.02] as any,
        'text-max-width': 8,
      },
      paint: { 'text-color': p.placeText, 'text-halo-color': p.halo, 'text-halo-width': 1.8, 'text-opacity': ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], 0.75, 0.95] as any } },
  ];
  return { base, labels };
}

export const streetPalette = (dark: boolean) => (dark ? NIGHT : DAY);

function atlasLayers(c: ThemeColors, streets: boolean): LayerSpecification[] {
  const p = streetPalette(c.dark);
  // with streets, the jewel-toned countries hand over to real land and water as you zoom in
  const out = (from: number, to: number, v: number) => (streets ? ['interpolate', ['linear'], ['zoom'], from, v, to, 0] as any : v);
  return [
    { id: 'lv-bg', type: 'background', paint: { 'background-color': streets ? ['interpolate', ['linear'], ['zoom'], STREETS_MIN - 0.5, c.ocean, STREETS_MIN + 0.8, p.land] as any : c.ocean } },
    { id: 'lv-grat', type: 'line', source: 'grat', ...(streets ? { maxzoom: 9 } : {}), paint: { 'line-color': c.grat, 'line-width': 1, 'line-opacity': out(7, 9, 1) } },
    { id: 'lv-land', type: 'fill', source: 'land', ...(streets ? { maxzoom: STREETS_MIN + 1.8 } : {}), paint: { 'fill-color': landColor(c.palette), 'fill-opacity': out(STREETS_MIN + 0.3, STREETS_MIN + 1.8, 0.92), 'fill-antialias': true } },
    { id: 'lv-coast', type: 'line', source: 'land', ...(streets ? { maxzoom: STREETS_MIN + 1.5 } : {}), paint: { 'line-color': c.coast, 'line-opacity': out(STREETS_MIN, STREETS_MIN + 1.5, 0.7), 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 8, 2] } },
    { id: 'lv-borders', type: 'line', source: 'borders', ...(streets ? { maxzoom: 11 } : {}), paint: { 'line-color': c.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 1.4], 'line-dasharray': [3, 2], 'line-opacity': out(9, 11, 1) } },
  ];
}

export async function offlineStyle(c: ThemeColors, streets?: { url: string }): Promise<StyleSpecification> {
  const g = await loadGeo();
  const st = streets ? streetLayers(streetPalette(c.dark)) : null;
  return {
    version: 8,
    name: 'LANDVAS Atlas',
    ...(streets ? { glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf' } : {}),
    sources: {
      land: { type: 'geojson', data: g.land, attribution: 'Natural Earth' },
      borders: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: g.borders } },
      grat: { type: 'geojson', data: graticule() },
      ...(streets ? { streets: { type: 'vector', url: streets.url, attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' } } : {}),
    },
    layers: [...atlasLayers(c, !!streets), ...(st ? [...st.base, ...st.labels] : [])],
  } as StyleSpecification;
}

export const STREET_LABEL_LAYERS = ['st-label-road', 'st-label-water', 'st-label-place'];

/** Recolour the base map after a theme change without reloading it. */
export function recolorOffline(map: MLMap, c: ThemeColors, streets: boolean) {
  for (const l of atlasLayers(c, streets)) {
    for (const [k, v] of Object.entries(l.paint ?? {})) if (map.getLayer(l.id)) map.setPaintProperty(l.id, k as any, v as any);
  }
  if (!streets) return;
  const st = streetLayers(streetPalette(c.dark));
  for (const l of [...st.base, ...st.labels]) {
    if (!map.getLayer(l.id)) continue;
    for (const [k, v] of Object.entries(l.paint ?? {})) map.setPaintProperty(l.id, k as any, v as any);
  }
}

async function streetsAvailable(): Promise<{ url: string } | null> {
  if (!config.streets) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(config.streets, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const tj = await res.json();
    return Array.isArray(tj?.tiles) && tj.tiles.length ? { url: config.streets } : null;
  } catch {
    return null; // offline or blocked — the atlas alone still works
  }
}

/** Resolve the configured style; fall back to the offline atlas if it cannot load. */
export async function resolveStyle(c: ThemeColors): Promise<{ style: StyleSpecification | string; online: boolean; streets: boolean }> {
  if (config.mapStyleUrl) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(config.mapStyleUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return { style: (await res.json()) as StyleSpecification, online: true, streets: false };
    } catch {
      /* offline or blocked — use the bundled atlas */
    }
  }
  const [streets] = await Promise.all([streetsAvailable(), loadGeo()]);
  return { style: await offlineStyle(c, streets ?? undefined), online: false, streets: !!streets };
}
