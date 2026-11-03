import { describe, expect, it } from 'vitest';
import { BODIES, EARS, EYES, HORNS, MOODS, PATTERNS, TAILS, WINGS, cleanGenome, randomGenome, randomName } from '../../src/inkborn/genome';
import { drawCreature, type CreatureState } from '../../src/inkborn/rig';
import { CELL, DECOR, canPlace, defaultLayout, inPond, inside, makeTerrain, solidsOf, walkable } from '../../src/inkborn/world';
import { bondLevel } from '../../src/inkborn/care';

/** a 2D context that accepts every call (gradients included) and counts the drawing ones */
function fakeCtx() {
  let draws = 0;
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = { canvas: { width: 100, height: 100 } };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'draws') return draws;
      if (k.startsWith('create')) return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      return (..._a: unknown[]) => { if (['fill', 'stroke', 'fillRect', 'drawImage', 'fillText'].includes(k)) draws++; };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  });
  return ctx as unknown as CanvasRenderingContext2D & { draws: number };
}

describe('Inkborn genomes', () => {
  it('rolls the same creature for the same seed and different ones for others', () => {
    expect(randomGenome(7)).toEqual(randomGenome(7));
    const set = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(randomGenome(i + 1))));
    expect(set.size).toBe(40);
    expect(randomName(3)).toBe(randomName(3));
  });
  it('cleans anything unexpected back into a valid genome', () => {
    const g = cleanGenome({ body: 'dragon' as never, color: 'red; drop table', size: 99, legs: 7 as never, mood: 'evil' as never });
    expect(BODIES).toContain(g.body);
    expect(g.color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(g.size).toBeGreaterThanOrEqual(0.8);
    expect(g.size).toBeLessThanOrEqual(1.25);
    expect(MOODS).toContain(g.mood);
    expect(g.legs).toBeGreaterThanOrEqual(0);
    expect(g.legs).toBeLessThanOrEqual(8); // any count from 0 to 8 is a real creature now
  });
  it('draws every part and every animation state on the rig', () => {
    const states: CreatureState[] = ['idle', 'walk', 'look', 'sleep', 'eat', 'happy'];
    const parts = { body: BODIES, eyes: EYES, ears: EARS, horns: HORNS, tail: TAILS, wings: WINGS, pattern: PATTERNS } as const;
    const base = randomGenome(11);
    for (const [k, opts] of Object.entries(parts)) {
      for (const o of opts) {
        for (const st of states) {
          const ctx = fakeCtx();
          expect(() => drawCreature(ctx, { ...base, [k]: o }, 50, 90, 60, { t: 1.3, state: st, dir: -1, look: 0.5 })).not.toThrow();
          expect(ctx.draws).toBeGreaterThan(3);
        }
      }
    }
  });
});

describe('the woodland sanctuary', () => {
  const starter = makeTerrain([[0, 0], [1, 0], [0, 1], [1, 1]], 1234);
  it('builds terrain from the habitat shape', () => {
    expect(starter.W).toBe(2 * CELL);
    expect(starter.H).toBe(2 * CELL);
    expect(starter.pond).not.toBeNull();
    expect(starter.forest.length).toBeGreaterThan(20);
    // the forest only grows outside the sanctuary
    for (const f of starter.forest) expect(inside(starter, f.x, f.y, 0)).toBe(false);
  });
  it('an L-shaped habitat keeps its missing corner as forest', () => {
    const L = makeTerrain([[0, 0], [1, 0], [0, 1]], 5);
    expect(inside(L, CELL * 1.5, CELL * 0.5)).toBe(true);
    expect(inside(L, CELL * 1.5, CELL * 1.5)).toBe(false);
  });
  it('blocks walking through water, trees and the forest edge', () => {
    const p = starter.pond!;
    expect(inPond(starter, p.x, p.y)).toBe(true);
    expect(walkable(starter, [], p.x, p.y)).toBe(false);
    expect(walkable(starter, [], -2, 5)).toBe(false);
    const tree = [{ x: 10, y: 10, r: 1.3 }];
    expect(walkable(starter, tree, 10, 10)).toBe(false);
    expect(walkable(starter, tree, 16, 22) || walkable(starter, tree, 20, 6)).toBe(true);
  });
  it('makes a cosy, valid starting layout with somewhere to eat, sleep and play', () => {
    const L = defaultLayout(starter, 1234, 50);
    expect(L).toEqual(defaultLayout(starter, 1234, 50));
    expect(L.length).toBeGreaterThan(15);
    expect(L.length).toBeLessThanOrEqual(35);
    for (const d of L) expect(canPlace(starter, L, d.k, d.x, d.y, d.id)).toBe(true);
    const tags = new Set(L.map((d) => DECOR.find((x) => x.k === d.k)?.tag));
    expect(tags.has('food')).toBe(true);
    expect(tags.has('bed')).toBe(true);
    expect(tags.has('toy')).toBe(true);
    // there's still plenty of open meadow to walk on
    const solids = solidsOf(L);
    let open = 0;
    for (let x = 1; x < 32; x += 2) for (let y = 1; y < 32; y += 2) if (walkable(starter, solids, x, y)) open++;
    expect(open).toBeGreaterThan(80);
  });
  it('refuses overlapping or out-of-bounds decorations', () => {
    const L = [{ id: 'a', k: 'oak', x: 10, y: 10 }];
    expect(canPlace(starter, L, 'boulder', 10.5, 10.2)).toBe(false);
    expect(canPlace(starter, L, 'rock', 40, 10)).toBe(false);
    expect(canPlace(starter, L, 'flowers', 14, 14)).toBe(true);
  });
  it('bond levels grow with care', () => {
    expect(bondLevel(0).name).toBe('New friend');
    expect(bondLevel(10).name).toBe('Pal');
    expect(bondLevel(5).progress).toBeCloseTo(0.5);
    expect(bondLevel(10_000).next).toBeNull();
  });
});
