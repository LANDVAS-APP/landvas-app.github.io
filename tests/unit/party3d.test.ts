// 3D party games: each plays to a finish with wandering players, hands out valid places, and keeps its
// snapshots small (they go out ~12 times a second).
import { describe, expect, it } from 'vitest';
import { LAVA, SIMS3, ballMap, candyMap, gardenMap, inBush, lavaMap, sees, snap3, tileAt, type In3 } from '../../src/home/live3d/sims';
import { rng } from '../../src/home/party/kit';

function run(id: string, n: number, seed: number, bot?: (w: any, pid: string, t: number, r: () => number) => In3) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const sim = SIMS3[id], ids = Array.from({ length: n }, (_, i) => `p${i}`), w = sim.init(ids, seed), r = rng(seed * 3 + 1);
  let res = null, maxSnap = 0, k = 0;
  while (!(res = sim.result(w)) && w.t < 15 * 60) {
    const inputs = Object.fromEntries(ids.map((id, i) => [id, bot ? bot(w, id, w.t, r) : { x: Math.sin(w.t * (0.7 + i * 0.3) + i), y: Math.cos(w.t * (0.5 + i * 0.2) + i * 2), b: r() < 0.03 }]));
    sim.step(w, inputs, 1 / 30);
    if (k++ % 10 === 0) maxSnap = Math.max(maxSnap, JSON.stringify(snap3(w)).length);
  }
  return { res, w, ids, maxSnap };
}
const valid = (res: Record<string, number> | null, ids: string[]) => {
  expect(res).not.toBeNull();
  expect(Object.keys(res!).sort()).toEqual([...ids].sort());
  expect(Object.values(res!)).toContain(1);
};

describe('3D party games', () => {
  for (const [id, n] of [['tag', 2], ['tag', 6], ['hide', 3], ['hide', 5], ['lava', 2], ['lava', 8], ['chairs', 3], ['chairs', 6]] as const) {
    it(`${id} with ${n} finishes`, () => {
      const { res, ids, maxSnap, w } = run(id, n, n * 7);
      valid(res, ids);
      expect(maxSnap).toBeLessThan(4500);
      for (const p of w.ps) { expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true); }
    });
  }
  it('tag: touching someone passes “it” on (and no tag-backs)', () => {
    const w = SIMS3.tag.init(['a', 'b', 'c'], 1); w.it = 'a';
    const [a, b] = [w.ps[0], w.ps[1]]; a.x = 0; a.z = 3; b.x = 0.5; b.z = 3; w.ps[2].x = -8; w.ps[2].z = -8;
    SIMS3.tag.step(w, {}, 1 / 30);
    expect(w.it).toBe('b');
    SIMS3.tag.step(w, {}, 1 / 30);
    expect(w.it).toBe('b'); // a is immune for a moment
  });
  it('hide & seek: the seeker can’t move while counting, and finds by touching', () => {
    const w = SIMS3.hide.init(['s', 'h1', 'h2'], 4);
    expect(w.seeker).toBe('s');
    const s = w.ps[0]; const x0 = s.x;
    for (let i = 0; i < 30; i++) SIMS3.hide.step(w, { s: { x: 1, y: 0, b: false } }, 1 / 30);
    expect(s.x).toBe(x0);
    w.t = w.ends; SIMS3.hide.step(w, {}, 1 / 30);
    expect(w.phase).toBe('seek');
    const h = w.ps[1]; h.x = s.x + 0.6; h.z = s.z;
    SIMS3.hide.step(w, {}, 1 / 30);
    expect(w.found.h1).toBeDefined();
    expect(w.pts.s).toBe(3);
  });
  it('lines of sight and bushes', () => {
    const obs = [{ k: 'b' as const, x: 0, z: 0, w: 4, d: 1, h: 2.4, tall: true, m: 'hedge' }, { k: 'c' as const, x: 5, z: 5, r: 0.85, h: 1.2, soft: true, m: 'bush' }];
    expect(sees(obs, 0, -3, 0, 3)).toBe(false);
    expect(sees(obs, 5, -3, 5, 3)).toBe(true);
    expect(inBush(obs, 5.2, 5)).toBe(true);
    expect(inBush(obs, 7, 5)).toBe(false);
  });
  it('lava: tiles crumble under you and you drop to the floor below', () => {
    const w = SIMS3.lava.init(['a', 'b'], 2); const a = w.ps[0]; a.x = 0; a.z = 0; w.ps[1].x = 6; w.ps[1].z = 6;
    w.tiles = w.tiles.map(() => '1'.repeat(w.N * w.N));
    for (let i = 0; i < 117; i++) SIMS3.lava.step(w, {}, 1 / 30);
    expect(w.tiles[0][tileAt(w.N, 0, 0)]).toBe('0');
    expect(a.y).toBe(LAVA.Y[1]);
    expect(a.alive).toBe(true);
  });
  it('lava: mushrooms bounce you up, and the lava rises', () => {
    const w = SIMS3.lava.init(['a', 'b'], 5); const a = w.ps[0]; a.x = 0; a.z = 0; a.y = LAVA.Y[1]; a.on = true; w.ps[1].x = 6;
    w.tiles[1] = 'b'.repeat(w.N * w.N);
    let top = a.y; for (let i = 0; i < 20; i++) { SIMS3.lava.step(w, {}, 1 / 30); top = Math.max(top, a.y); }
    expect(top).toBeGreaterThan(LAVA.Y[0]);
    w.t = LAVA.RISE_AT + 100; SIMS3.lava.step(w, {}, 1 / 30);
    expect(w.lava).toBeGreaterThan(LAVA.LAVA + 5);
  });
  it('maps: new every game, the same on every device, bigger with more players', () => {
    for (const make of [candyMap, gardenMap, ballMap]) {
      const a = make(11, 4), b = make(11, 4), c = make(12, 4), big = make(11, 8) as { H?: number; R?: number }, small = make(11, 2) as { H?: number; R?: number };
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
      expect((big.H ?? big.R)!).toBeGreaterThan((small.H ?? small.R)!);
    }
    expect(lavaMap(3, 8).N).toBeGreaterThan(lavaMap(3, 2).N);
    expect(JSON.stringify(lavaMap(3, 4))).not.toBe(JSON.stringify(lavaMap(4, 4)));
    // plenty to play with
    const park = candyMap(5, 6).obs, garden = gardenMap(5, 6).obs;
    for (const m of ['boost', 'bounce', 'tree', 'cotton']) expect(park.some((o) => o.m === m)).toBe(true);
    for (const m of ['hedge', 'bush', 'grass']) expect(garden.some((o) => o.m === m)).toBe(true);
    expect(garden.filter((o) => 'soft' in o && o.soft).length).toBeGreaterThan(8);
    // nobody starts inside anything
    for (const id of ['tag', 'hide', 'chairs']) { const w = SIMS3[id].init(['a', 'b', 'c', 'd'], 9); for (const p of w.ps) for (const o of w.obs) if (o.k === 'c' && !o.soft) expect(Math.hypot(p.x - o.x, p.z - o.z)).toBeGreaterThan(o.r); }
  });
  it('your own device moves you the same way the host does', () => {
    for (const id of ['tag', 'hide', 'chairs', 'lava']) {
      const sim = SIMS3[id], host = sim.init(['a', 'b', 'c'], 21), mine = { ...host.ps[0] };
      if (id === 'hide') { host.phase = 'seek'; host.seeker = 'b'; }
      if (id !== 'lava') { host.ps[1].x = 30; host.ps[1].z = 30; host.ps[2].x = -30; host.ps[2].z = 30; }
      for (let i = 0; i < 40; i++) { const inp = { x: Math.sin(i / 7), y: 1, b: false }; sim.step(host, { a: inp }, 1 / 30); sim.move(host, mine, inp, 1 / 30); }
      expect([id, Math.hypot(mine.x - host.ps[0].x, mine.z - host.ps[0].z) < 0.05]).toEqual([id, true]);
    }
  });
  it('boost strips fling you, trampolines launch you over walls', () => {
    const w = SIMS3.tag.init(['a', 'b', 'c'], 1); w.obs = [{ k: 'z', x: 0, z: 0, r: 1, m: 'boost', a: 0 }, { k: 'z', x: 10, z: 0, r: 1, m: 'bounce' }]; w.H = 20;
    const a = w.ps[0], b = w.ps[1]; a.x = 0; a.z = 0; b.x = 10; b.z = 0; w.it = 'c'; w.ps[2].x = -15; w.ps[2].z = -15;
    SIMS3.tag.step(w, {}, 1 / 30); expect(a.vz).toBeGreaterThan(10);
    let top = 0; for (let i = 0; i < 20; i++) { SIMS3.tag.step(w, {}, 1 / 30); top = Math.max(top, b.y); }
    expect(top).toBeGreaterThan(1.5);
  });
  it('musical chairs: one fewer chair than players, the slowest is out', () => {
    const w = SIMS3.chairs.init(['a', 'b', 'c'], 3);
    w.t = w.ends; SIMS3.chairs.step(w, {}, 1 / 30);
    expect(w.phase).toBe('grab'); expect(w.chairs.length).toBe(2);
    w.ps[0].x = w.chairs[0].x; w.ps[0].z = w.chairs[0].z; w.ps[1].x = w.chairs[1].x; w.ps[1].z = w.chairs[1].z;
    SIMS3.chairs.step(w, {}, 1 / 30);
    expect(w.chairs.every((c: any) => c.by)).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
    SIMS3.chairs.step(w, {}, 1 / 30);
    expect(w.lost).toEqual(['c']);
  });
});
