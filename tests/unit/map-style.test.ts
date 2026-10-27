// The street map style is generated in code; make sure MapLibre will accept it.
import { describe, it, expect } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { STREET_LABEL_LAYERS, streetLayers, streetPalette } from '../../src/map/basemap';

describe('street map style', () => {
  for (const dark of [true, false]) {
    it(`is a valid MapLibre style (${dark ? 'night' : 'day'})`, () => {
      const st = streetLayers(streetPalette(dark));
      const style: any = {
        version: 8,
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: { streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
        layers: [...st.base, ...st.labels],
      };
      const errors = validateStyleMin(style).map((e: any) => e.message);
      expect(errors).toEqual([]);
      expect(st.labels.map((l) => l.id)).toEqual(STREET_LABEL_LAYERS);
      expect(st.base.some((l) => l.type === 'fill-extrusion')).toBe(true);
    });
  }
});
