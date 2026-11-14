// The map library (maplibre-gl, ~1 MB) belongs to the map screen. Pieces that put markers on the map — the HUD,
// travel, the Hot Zone, enchantments, the Size Ray, the Leviathan — are also imported by other screens (the hub,
// plot sheets, the planets, the Grimoire, simple mode), and a plain `import * as maplibregl` in any of them made those
// screens download and parse the whole library too. They make markers through here instead: a marker is only ever
// made on a map that's on screen, so by then the world map has loaded the library and handed it over.
import type * as ML from 'maplibre-gl';

let lib: typeof ML | null = null;
/** called once by the world map, which owns the library */
export function setMapLib(m: typeof ML) { lib = m; }
/** the library itself, for code that only runs once the world map has loaded (e.g. registering tile protocols) */
export function mapLib(): typeof ML {
  if (!lib) throw new Error('mapLib: the world map has not loaded');
  return lib;
}
/** `new maplibregl.Marker(…)`, for code that only runs with a map on screen */
export function newMarker(opts?: ML.MarkerOptions): ML.Marker {
  if (!lib) throw new Error('newMarker: no map on screen');
  return new lib.Marker(opts);
}
