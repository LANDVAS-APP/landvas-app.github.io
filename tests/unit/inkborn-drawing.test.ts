// Drawings become exactly what was drawn: eye counts, leg counts (none → it rolls), ears, horns.
import { describe, expect, it } from 'vitest';
import { cleanGenome, defaultGait, randomGenome, readParts } from '../../src/inkborn/genome';
import { drawCreature } from '../../src/inkborn/rig';
import type { Stroke } from '../../src/shared/strokes';

const N = 96;
let t = 0;
/** a stroke through points (board units 0-1000) */
const line = (pts: [number, number][], c = 1, w = 14): Stroke => ({ c, w, p: pts.flatMap(([x, y]) => [x, y, (t += 16)]) });
const circle = (cx: number, cy: number, r: number, c = 1, w = 14, n = 36): Stroke => line(Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r] as [number, number]), c, w);
const dot = (x: number, y: number, c = 1, w = 26): Stroke => ({ c, w, p: [x, y, (t += 16)] });

/** what the canvas would show: thick lines rasterised to N×N */
function raster(strokes: Stroke[]) {
  const ink = new Uint8Array(N * N);
  const k = N / 1000;
  const stamp = (x: number, y: number, r: number) => {
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++)
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && (xx - x) ** 2 + (yy - y) ** 2 <= r * r) ink[yy * N + xx] = 1;
  };
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (const s of strokes) {
    const r = Math.max(0.5, (s.w * k) / 2);
    for (let i = 0; i < s.p.length; i += 3) {
      const ax = s.p[i] * k, ay = s.p[i + 1] * k;
      const bx = i + 3 < s.p.length ? s.p[i + 3] * k : ax, by = i + 3 < s.p.length ? s.p[i + 4] * k : ay;
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let j = 0; j <= steps; j++) stamp(ax + ((bx - ax) * j) / steps, ay + ((by - ay) * j) / steps, r);
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (ink[y * N + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { ink, box: { x0, y0, x1, y1 } };
}
const read = (strokes: Stroke[]) => { const r = raster(strokes); return readParts(strokes, N, r.ink, r.box); };

describe('reading a drawing', () => {
  it('three eyes and no legs: three eyes, no legs', () => {
    const p = read([circle(500, 500, 260, 4), dot(400, 420), dot(600, 420), dot(500, 330)]);
    expect(p.eyes).toBe(3);
    expect(p.legs).toBe(0);
  });
  it('an eye drawn with a pupil inside counts once; the mouth isn’t an eye', () => {
    const p = read([circle(500, 500, 260, 4), circle(420, 430, 45), dot(425, 435), circle(580, 430, 45), dot(585, 435), line([[430, 570], [500, 590], [570, 570]])]);
    expect(p.eyes).toBe(2);
  });
  it('one big eye', () => {
    expect(read([circle(500, 500, 260, 4), circle(500, 420, 60), dot(500, 420)]).eyes).toBe(1);
  });
  it('no eyes drawn: no eyes', () => {
    expect(read([circle(500, 500, 260, 4)]).eyes).toBe(0);
  });
  it('legs hanging off the bottom are counted, however many', () => {
    const body = circle(500, 420, 220, 6);
    const legs = (n: number) => Array.from({ length: n }, (_, i) => { const x = 330 + (340 * i) / Math.max(1, n - 1); return line([[x, 600], [x, 760]]); });
    expect(read([body, dot(440, 380), dot(560, 380), ...legs(2)]).legs).toBe(2);
    expect(read([body, dot(440, 380), dot(560, 380), ...legs(4)]).legs).toBe(4);
    expect(read([body, dot(440, 380), dot(560, 380), ...legs(6)]).legs).toBe(6);
  });
  it('a body drawn in one stroke with stubby legs still gets its legs; a plain round bottom gets none', () => {
    // a box body whose outline dips down into two feet
    const withFeet = line([[300, 300], [700, 300], [700, 600], [640, 600], [640, 720], [580, 720], [580, 600], [420, 600], [420, 720], [360, 720], [360, 600], [300, 600], [300, 300]], 4);
    expect(read([withFeet, dot(430, 400), dot(570, 400)]).legs).toBe(2);
    expect(read([circle(500, 500, 260, 4), dot(430, 420), dot(570, 420)]).legs).toBe(0);
  });
  it('two bumps on top are ears; one spike in the middle is a horn', () => {
    const body = circle(500, 560, 220, 4);
    const ears = read([body, line([[380, 380], [400, 230], [450, 360]]), line([[550, 360], [600, 230], [620, 380]]), dot(440, 520), dot(560, 520)]);
    expect(['cat', 'bunny', 'round']).toContain(ears.ears);
    const horn = read([body, line([[480, 360], [500, 150], [520, 360]], 5), dot(440, 520), dot(560, 520)]);
    expect(horn.horns).toBe('unicorn');
  });
});

describe('genomes', () => {
  it('legless creatures get a way to move from their shape', () => {
    expect(defaultGait('round', 'none')).toBe('roll');
    expect(defaultGait('long', 'none')).toBe('slither');
    expect(defaultGait('tall', 'none')).toBe('bounce');
    expect(defaultGait('round', 'leaf')).toBe('hover');
    const g = cleanGenome({ ...randomGenome(3), legs: 0, gait: 'walk' });
    expect(g.gait).not.toBe('walk');
    expect(cleanGenome({ ...randomGenome(3), legs: 3 }).gait).toBe('walk');
  });
  it('old creatures keep their looks: two eyes (one for the one-eyed), legs as they were', () => {
    const old = { body: 'round', color: '#7FD3F5', eyes: 'one', legs: 4, mood: 'playful' } as any;
    expect(cleanGenome(old)).toMatchObject({ eyecount: 1, legs: 4, gait: 'walk' });
    expect(cleanGenome({ ...old, eyes: 'big' }).eyecount).toBe(2);
    expect(cleanGenome({ ...old, legs: 99, eyecount: -4 })).toMatchObject({ legs: 8, eyecount: 0 });
  });
  it('the rig draws every count and gait without trouble', () => {
    const g = new Proxy({} as Record<string, unknown>, { get: (o, k: string) => (k in o ? o[k] : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: (o, k: string, v) => { o[k] = v; return true; } }) as unknown as CanvasRenderingContext2D;
    for (const legs of [0, 1, 3, 6, 8]) for (const eyecount of [0, 1, 3, 5, 6]) for (const gait of ['roll', 'bounce', 'slither', 'hover'] as const)
      for (const state of ['walk', 'idle', 'sleep', 'happy'] as const) drawCreature(g, cleanGenome({ ...randomGenome(legs + eyecount), legs, eyecount, gait }), 50, 50, 60, { t: 1.3, state, dir: 1 });
  });
});
