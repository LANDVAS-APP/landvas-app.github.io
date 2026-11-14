import { describe, expect, it } from 'vitest';
import { Director, recreate } from '../../src/roll/stage/director';
import { layoutFor } from '../../src/roll/stage/layout';
import { HOLD, PICK_MONTAGE, clipAt, clipTimeline, reelPos } from '../../src/roll/stage/trace';
import { inkSplash } from '../../src/roll/stage/splash';
import { RARITY_ORDER, type RarityId } from '../../src/shared/rarity';

const L = layoutFor(390, 844);
const mod = (n: number, m: number) => ((n % m) + m) % m;

describe('the roll director', () => {
  it('spins the rarity drum after the drop, lands on the rarity, and the minigame shows as it lands', () => {
    const locks: number[] = [];
    const d = new Director(L, { reduce: false, quickRerolls: () => false, seed: 42, hooks: { lock: (i) => locks.push(i) } });
    d.setResult({ rarity: 'legendary', type: 'lumina', usd: 1e-9, first: false });
    let t = 0;
    for (; t < 20_000 && d.phase !== 'reveal'; t += 1000 / 60) d.tick(t);
    const tr = d.trace;
    expect(tr.look).toBe('classic');
    expect(tr.steps).toHaveLength(1);
    const s = tr.steps[0];
    expect(s.tReel).toBeNull();
    expect(s.type).toBe('lumina');
    expect(s.rStart).toBe(tr.drop);
    expect(RARITY_ORDER[mod(Math.round(reelPos(s.rReel!, s.rLock!)), RARITY_ORDER.length)]).toBe('legendary');
    expect(locks).toEqual([0]);
    expect(tr.reveal!).toBeGreaterThan(s.rLock!);
    // a few turns of the drum before it starts to land (the classic roll's timing)
    expect(s.rReel!.lands[0].t - s.rStart!).toBeGreaterThan(900);
    // an Epic+ charges the canvas as it slows; the reveal shakes and bursts
    expect(s.charge).toBeDefined();
    expect(tr.shakes.length).toBe(1);
    expect(tr.bursts.length).toBeGreaterThan(5);
    expect(tr.overlay?.kind).toBe('gold');
  });

  it('the drum moves smoothly into its landing (no jumps)', () => {
    const tr = recreate({ rarity: 'mythic', type: 'clay', usd: 1e-9, first: false }, L, { seed: 7 });
    const r = tr.steps[0].rReel!, l = r.lands[0];
    expect(Math.abs(reelPos(r, l.t - 0.01) - reelPos(r, l.t + 0.01))).toBeLessThan(0.05);
    const end = l.t + l.D;
    expect(Math.abs(reelPos(r, end - 0.01) - reelPos(r, end + 0.01))).toBeLessThan(0.05);
  });

  it('Luck: every reroll lands with its own minigame and rarity, then the pick decides the reveal', () => {
    const choices: RarityId[] = ['rare', 'epic', 'kraken', 'legendary'];
    const locks: number[] = [];
    const d = new Director(L, { reduce: false, quickRerolls: () => false, seed: 3, hooks: { lock: (i) => locks.push(i) } });
    d.setResult({ rarity: 'kraken', type: 'pigment', usd: 1e-9, first: false, choices, choiceTypes: ['pigment', 'mosaic', 'lumina', 'clay'], choiceShiny: [false, true, true, false] });
    let t = 0;
    for (; t < 60_000 && d.phase !== 'pick'; t += 1000 / 60) d.tick(t);
    d.pick(2);
    const tr = d.trace;
    expect(tr.steps.map((s) => s.rarity)).toEqual(choices);
    expect(tr.steps.map((s) => s.type)).toEqual(['pigment', 'mosaic', 'lumina', 'clay']);
    expect(locks).toEqual([0, 1, 2, 3]);
    // each reroll carries on from where the drum stopped
    expect(Math.abs(tr.steps[1].rReel!.p0 - reelPos(tr.steps[0].rReel!, tr.steps[1].rStart!))).toBeLessThan(1e-6);
    expect(tr.final).toMatchObject({ rarity: 'kraken', type: 'lumina', shiny: true, kept: 2 });
    expect(tr.reveal).toBe(tr.pick!.t1);
  });

  it('an Enchanted roll breaks off mid-spin into the transformation', () => {
    const d = new Director(L, { reduce: false, quickRerolls: () => false, seed: 9 });
    d.setResult({ rarity: 'enchanted' as RarityId, type: 'pigment', usd: 0, first: false, enchant: { id: 'x', kind: 'genie', serial: 3, sigil: 99 } });
    let t = 0;
    for (; t < 20_000 && d.phase !== 'reveal'; t += 16) d.tick(t);
    expect(d.trace.enchant?.t0).toBeDefined();
    expect(d.trace.steps[0].rLock).toBeUndefined();
    expect(d.trace.reveal! - d.trace.enchant!.t0).toBeGreaterThanOrEqual(3500);
  });

  it('a tap hurries it along (and it still lands)', () => {
    const slow = recreate({ rarity: 'epic', type: 'glass', usd: 0, first: false }, L, { seed: 5 });
    for (const at of [300, 1600]) {
      const d = new Director(L, { reduce: false, quickRerolls: () => false, seed: 5 });
      d.setResult({ rarity: 'epic', type: 'glass', usd: 0, first: false });
      let t = 0;
      for (; t < 20_000 && d.phase !== 'reveal'; t += 16) { if (t > at) d.skip(); d.tick(t); }
      expect(d.phase).toBe('reveal');
      expect(d.trace.reveal!).toBeLessThan(slow.reveal!);
      const s = d.trace.steps[0];
      expect(RARITY_ORDER[mod(Math.round(reelPos(s.rReel!, s.rLock!)), RARITY_ORDER.length)]).toBe('epic');
    }
  });

  it('the roll on screen and its clip splash the same ink', () => {
    const a = inkSplash(1234), b = inkSplash(1234), c = inkSplash(99);
    expect(a.shapes.map((x) => x.d)).toEqual(b.shapes.map((x) => x.d));
    expect(a.shapes[a.shapes.length - 1].d).not.toBe(c.shapes[c.shapes.length - 1].d);
    expect(a.tendrils.length).toBe(6);
  });
});

describe('a clip of the roll', () => {
  it('replays it in full, holding on the reveal', () => {
    const tr = recreate({ rarity: 'epic', type: 'fresco', usd: 0, first: false }, L, { seed: 1 });
    const tl = clipTimeline(tr);
    expect(tl.total).toBeCloseTo(tr.reveal! + HOLD, 0);
    expect(clipAt(tl, 1234).t).toBe(1234);
  });
  it('squeezes a long wait for the server and the time spent picking', () => {
    const d = new Director(L, { reduce: false, quickRerolls: () => true, seed: 2 });
    let t = 0;
    for (; t < 4000; t += 16) d.tick(t); // the server takes ages
    d.setResult({ rarity: 'rare', type: 'pigment', usd: 0, first: false, choices: ['rare', 'epic'], choiceTypes: ['pigment', 'clay'] });
    for (; t < 30_000 && d.phase !== 'pick'; t += 16) d.tick(t);
    const pickAt = t;
    for (; t < pickAt + 9000; t += 16) d.tick(t); // the player thinks it over
    d.pick(1);
    for (let k = 0; k < 60; k++, t += 16) d.tick(t);
    const tr = d.trace, tl = clipTimeline(tr);
    expect(tr.final.rarity).toBe('epic');
    expect(tl.total).toBeLessThan(tr.reveal! + HOLD - 9000);
    const pickSeg = tl.segs.find((s) => s.kind === 'pick')!;
    expect(pickSeg.c1 - pickSeg.c0).toBe(PICK_MONTAGE);
    expect(clipAt(tl, pickSeg.c0 + PICK_MONTAGE / 2).pick).toBeCloseTo(0.5, 2);
  });
});
