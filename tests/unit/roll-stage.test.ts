import { describe, expect, it } from 'vitest';
import { Director, recreate } from '../../src/roll/stage/director';
import { layoutFor } from '../../src/roll/stage/layout';
import { HOLD, PICK_MONTAGE, TYPE_ORDER, clipAt, clipTimeline, reelPos } from '../../src/roll/stage/trace';
import { RARITY_ORDER, type RarityId } from '../../src/shared/rarity';

const L = layoutFor(390, 844);
const mod = (n: number, m: number) => ((n % m) + m) % m;

describe('the roll director', () => {
  it('rolls the minigame first, then the rarity, and lands on both', () => {
    const tr = recreate({ rarity: 'legendary', type: 'lumina', usd: 1e-9, first: false }, L, { seed: 42 });
    expect(tr.steps).toHaveLength(1);
    const s = tr.steps[0];
    expect(s.tLock).toBeDefined();
    expect(s.rStart!).toBeGreaterThan(s.tLock!);
    expect(TYPE_ORDER[mod(Math.round(reelPos(s.tReel!, s.tLock!)), TYPE_ORDER.length)]).toBe('lumina');
    expect(RARITY_ORDER[mod(Math.round(reelPos(s.rReel!, s.rLock!)), RARITY_ORDER.length)]).toBe('legendary');
    expect(tr.reveal!).toBeGreaterThan(s.rLock!);
    // an Epic+ charges the canvas as it slows; the reveal shakes and bursts
    expect(s.charge).toBeDefined();
    expect(tr.shakes.length).toBe(1);
    expect(tr.bursts.length).toBeGreaterThan(5);
    expect(tr.overlay?.kind).toBe('gold');
  });

  it('the reels move smoothly into their landings (no jumps)', () => {
    const tr = recreate({ rarity: 'mythic', type: 'clay', usd: 1e-9, first: false }, L, { seed: 7 });
    for (const r of [tr.steps[0].tReel!, tr.steps[0].rReel!]) {
      const l = r.lands[0];
      expect(Math.abs(reelPos(r, l.t - 0.01) - reelPos(r, l.t + 0.01))).toBeLessThan(0.05);
      const end = l.t + l.D;
      expect(Math.abs(reelPos(r, end - 0.01) - reelPos(r, end + 0.01))).toBeLessThan(0.05);
    }
  });

  it('Luck: every reroll gets its own minigame and rarity, then the pick decides the reveal', () => {
    const choices: RarityId[] = ['rare', 'epic', 'kraken', 'legendary'];
    const tr = recreate({ rarity: 'kraken', type: 'pigment', usd: 1e-9, first: false, choices, choiceTypes: ['pigment', 'mosaic', 'lumina', 'clay'], choiceShiny: [false, true, true, false] }, L, { seed: 3 });
    expect(tr.steps.map((s) => s.rarity)).toEqual(choices);
    expect(tr.steps.map((s) => s.type)).toEqual(['pigment', 'mosaic', 'lumina', 'clay']);
    expect(tr.pick?.t1).toBeDefined();
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

  it('a tap hurries it along', () => {
    const slow = recreate({ rarity: 'epic', type: 'glass', usd: 0, first: false }, L, { seed: 5 });
    const d = new Director(L, { reduce: false, quickRerolls: () => false, seed: 5 });
    d.setResult({ rarity: 'epic', type: 'glass', usd: 0, first: false });
    let t = 0;
    for (; t < 20_000 && d.phase !== 'reveal'; t += 16) { if (t > 800) d.skip(); d.tick(t); }
    expect(d.trace.reveal!).toBeLessThan(slow.reveal!);
  });

  it('a plot type the reel doesn’t know goes straight to the rarity', () => {
    const tr = recreate({ rarity: 'rare', type: 'farm', usd: 0, first: false }, L, { seed: 11 });
    expect(tr.steps[0].tReel).toBeNull();
    expect(tr.reveal).toBeDefined();
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
