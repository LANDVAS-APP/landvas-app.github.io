// Base map styles. Offline (default): a stylised, colourful world built from
// Natural Earth country shapes bundled with the app — every country gets its
// own jewel tone (greedy map colouring, so neighbours never match). Works with
// no tile server, offline in the PWA and inside sandboxed frames. Online: any
// MapLibre vector style URL (VITE_MAP_STYLE_URL) for streets in hosted builds.
import type { Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { feature, mesh, neighbors } from 'topojson-client';
import countriesUrl from '../data/countries-50m.json?url';
import { config } from '../env';
import { effectiveDark, useUi } from '../lib/store';

export type ThemeColors = { ocean: string; land: string; border: string; coast: string; grat: string; bg: string; palette: string[] };

const DARK_PALETTE = ['#1e6e58', '#6b318a', '#9c4b22', '#25528f', '#8c2a52', '#5f7020', '#1f7d88'];
const LIGHT_PALETTE = ['#c3efdd', '#e6d1f4', '#f8d7c1', '#cddcf7', '#f6cddc', '#e4edbd', '#c3e9ee'];

export function themeColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const dark = effectiveDark(useUi.getState().settings.theme);
  return {
    ocean: v('--map-ocean'), land: v('--map-land'), border: v('--map-border'), coast: v('--map-coast'), grat: v('--map-grat'), bg: v('--bg'),
    palette: dark ? DARK_PALETTE : LIGHT_PALETTE,
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

export async function offlineStyle(c: ThemeColors): Promise<StyleSpecification> {
  const g = await loadGeo();
  return {
    version: 8,
    name: 'LANDVAS Atlas',
    sources: {
      land: { type: 'geojson', data: g.land, attribution: 'Natural Earth' },
      borders: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: g.borders } },
      grat: { type: 'geojson', data: graticule() },
    },
    layers: [
      { id: 'lv-bg', type: 'background', paint: { 'background-color': c.ocean } },
      { id: 'lv-grat', type: 'line', source: 'grat', paint: { 'line-color': c.grat, 'line-width': 1 } },
      { id: 'lv-land', type: 'fill', source: 'land', paint: { 'fill-color': landColor(c.palette), 'fill-opacity': 0.92, 'fill-antialias': true } },
      { id: 'lv-coast', type: 'line', source: 'land', paint: { 'line-color': c.coast, 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 8, 2] } },
      { id: 'lv-borders', type: 'line', source: 'borders', paint: { 'line-color': c.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 1.4], 'line-dasharray': [3, 2] } },
    ],
  };
}

/** Recolour the offline base map after a theme change without reloading it. */
export function recolorOffline(map: MLMap, c: ThemeColors) {
  const set = (id: string, prop: string, v: unknown) => map.getLayer(id) && map.setPaintProperty(id, prop as any, v as any);
  set('lv-bg', 'background-color', c.ocean);
  set('lv-grat', 'line-color', c.grat);
  set('lv-land', 'fill-color', landColor(c.palette));
  set('lv-coast', 'line-color', c.coast);
  set('lv-borders', 'line-color', c.border);
}

/** Resolve the configured style; fall back to the offline atlas if it cannot load. */
export async function resolveStyle(c: ThemeColors): Promise<{ style: StyleSpecification | string; online: boolean }> {
  if (config.mapStyleUrl) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(config.mapStyleUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return { style: (await res.json()) as StyleSpecification, online: true };
    } catch {
      /* offline or blocked — use the bundled atlas */
    }
  }
  return { style: await offlineStyle(c), online: false };
}
