// Base map styles. Offline (default): a stylised world built from Natural Earth
// country shapes bundled with the app — works with no tile server, in the PWA
// offline and inside sandboxed frames. Online: any MapLibre vector style URL
// (VITE_MAP_STYLE_URL) for roads, cities and labels in Atlas mode.
import type { Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { feature, mesh } from 'topojson-client';
import countriesUrl from '../data/countries-50m.json?url';
import { config } from '../env';

export type ThemeColors = { ocean: string; land: string; border: string; coast: string; grat: string; bg: string };

export function themeColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { ocean: v('--map-ocean'), land: v('--map-land'), border: v('--map-border'), coast: v('--map-coast'), grat: v('--map-grat'), bg: v('--bg') };
}

let geo: Promise<{ land: GeoJSON.FeatureCollection; borders: GeoJSON.MultiLineString }> | null = null;
function loadGeo() {
  geo ??= fetch(countriesUrl)
    .then((r) => r.json())
    .then((topo) => ({
      land: feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection,
      borders: mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b) as unknown as GeoJSON.MultiLineString,
    }));
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
      { id: 'lv-land', type: 'fill', source: 'land', paint: { 'fill-color': c.land, 'fill-antialias': true } },
      { id: 'lv-coast', type: 'line', source: 'land', paint: { 'line-color': c.coast, 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 1.6] } },
      { id: 'lv-borders', type: 'line', source: 'borders', paint: { 'line-color': c.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 8, 1.2], 'line-dasharray': [3, 2] } },
    ],
  };
}

/** Recolour the offline base map after a theme change without reloading it. */
export function recolorOffline(map: MLMap, c: ThemeColors) {
  const set = (id: string, prop: string, v: string) => map.getLayer(id) && map.setPaintProperty(id, prop as any, v);
  set('lv-bg', 'background-color', c.ocean);
  set('lv-grat', 'line-color', c.grat);
  set('lv-land', 'fill-color', c.land);
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
