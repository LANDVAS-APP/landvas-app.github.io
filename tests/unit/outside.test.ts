// 📱 Outside: the knock detector, the Lasso walk's sums and the sky's words — the pure parts.
import { describe, expect, it } from 'vitest';
import { detectKnock } from '../../src/outside/Bump';
import { fmtArea, keepFix, ringArea, thin, type Pt } from '../../src/outside/LassoWalk';
import { lassoFeatures } from '../../src/outside/LassoLayer';
import { moonEmoji, moonName } from '../../src/outside/Sky';

describe('a knock of the phone', () => {
  it('is a sharp jolt, not a spin, and only once in a moment', () => {
    expect(detectKnock({ acc: 25, rr: 40 }, 0, 2000)).not.toBeNull();
    expect(detectKnock({ acc: 25, rr: 600 }, 0, 2000)).toBeNull(); // a flick
    expect(detectKnock({ acc: 6, rr: 10 }, 0, 2000)).toBeNull(); // a nudge
    expect(detectKnock({ acc: 25, rr: 40 }, 1500, 2000)).toBeNull(); // the rattle after the knock
    expect(detectKnock({ acc: 60, rr: 10 }, 0, 2000)).toBe(1);
  });
});

describe('the Lasso walk', () => {
  const k = 111_320 * Math.cos((45 * Math.PI) / 180);
  const square = (side: number) => [[0, 0], [side, 0], [side, side], [0, side]].map(([x, y]) => ({ lng: 10 + x / k, lat: 45 + y / 111_320 }));
  it('measures the land inside the loop', () => {
    expect(ringArea(square(100))).toBeGreaterThan(9_900);
    expect(ringArea(square(100))).toBeLessThan(10_100);
    expect(ringArea(square(100).slice(0, 2))).toBe(0);
  });
  it('keeps good fixes a few metres apart', () => {
    const a: Pt = [10, 45, 0, 8];
    expect(keepFix(undefined, a)).toBe(true);
    expect(keepFix(a, [10, 45, 1000, 80])).toBe(false); // fuzzy
    expect(keepFix(a, [10 + 1 / k, 45, 1000, 8])).toBe(false); // a metre on
    expect(keepFix(a, [10 + 6 / k, 45, 1000, 8])).toBe(true);
    expect(keepFix(a, [10, 45, 12_000, 8])).toBe(true); // standing still a while
  });
  it('thins a long walk, keeping the start and the end', () => {
    const pts: Pt[] = Array.from({ length: 10_000 }, (_, i) => [i, 0, i, 5]);
    const t = thin(pts, 100);
    expect(t).toHaveLength(100);
    expect(t[0]).toBe(pts[0]);
    expect(t[99]).toBe(pts[9_999]);
    expect(thin(pts.slice(0, 50), 100)).toHaveLength(50);
  });
  it('says areas the way people do', () => {
    expect(fmtArea(8_400)).toBe('8,400 m²');
    expect(fmtArea(14_400)).toBe('1.4 ha');
    expect(fmtArea(1_500_000)).toBe('1.50 km²');
  });
  it('draws each Footprint as a closed polygon on the map', () => {
    const fc = lassoFeatures([{ id: 1, mine: true, who: { username: 'me' } as never, ring: [[0, 0], [1, 0], [1, 1]], area_m2: 1, expires_at: '' },
      { id: 2, mine: false, who: { username: 'pal', accent_color: '#123456' } as never, ring: [[0, 0], [1, 0]], area_m2: 1, expires_at: '' }]);
    expect(fc.features).toHaveLength(1);
    const g = fc.features[0].geometry as GeoJSON.Polygon;
    expect(g.coordinates[0]).toHaveLength(4);
    expect(g.coordinates[0][3]).toEqual(g.coordinates[0][0]);
    expect(fc.features[0].properties).toMatchObject({ mine: true, name: 'Your Footprint' });
  });
});

describe('the sky in words', () => {
  it('names the Moon', () => {
    expect(moonName(0)).toBe('New moon');
    expect(moonName(0.25)).toBe('First quarter');
    expect(moonName(0.5)).toBe('Full moon');
    expect(moonName(0.6)).toBe('Waning gibbous');
    expect(moonName(0.99)).toBe('New moon');
    expect(moonEmoji(0.5)).toBe('🌕');
    expect(moonEmoji(0)).toBe('🌑');
  });
});
