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

describe('country outlines across the date line', () => {
  it('keeps Russia and Fiji continuous and leaves Antarctica alone', async () => {
    const { readFileSync } = await import('node:fs');
    const { feature } = await import('topojson-client');
    const { unwrapDateLine } = await import('../../src/map/basemap');
    const topo = JSON.parse(readFileSync('src/data/countries-50m.json', 'utf8'));
    const fc = unwrapDateLine(feature(topo, topo.objects.countries) as any);
    const rings = (name: string) => {
      const g: any = fc.features.find((f: any) => f.properties?.name === name)!.geometry;
      return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat() as number[][][];
    };
    const jumps = (r: number[][]) => r.slice(1).filter((p, i) => Math.abs(p[0] - r[i][0]) > 180).length;
    for (const name of ['Russia', 'Fiji']) {
      for (const r of rings(name)) {
        expect(jumps(r)).toBe(0);
        expect(r[0]).toEqual(r[r.length - 1]);
      }
    }
    expect(rings('Antarctica').some((r) => jumps(r) > 0)).toBe(true);
  });
});
