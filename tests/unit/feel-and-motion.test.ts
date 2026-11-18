// The apps' haptic language, the motion gestures, the sonar, the Leviathan's footsteps and Smooth mode: the pure parts.
import { describe, expect, it } from 'vitest';
import { foxPatter, footstep, heartbeat, pingEvery, quake, revealFeel, rollHeart, rumble, seekFeel, summon } from '../../src/native/feel';
import { bearing, detectFlick, metres, turnBetween } from '../../src/native/motion';
import { fmtDist, pingHit, turnHint } from '../../src/native/Sonar';
import { nearestKm, stepFor, STEP_RANGE_KM } from '../../src/leviathan/footsteps';
import { iosVersion, liteAuto, oldWebKit } from '../../src/lib/device';
import { fpsStats } from '../../src/app/FpsMeter';
import { cellCenter } from '../../src/shared/grid';

const sorted = (p: [number, string][]) => p.every((x, i) => i === 0 || x[0] >= p[i - 1][0]);
const iphone = (v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`;

describe('the haptic language', () => {
  it('beats a heart for the whole landing, faster as it goes', () => {
    const p = heartbeat(3000, 60, 120, [[0, 'medium'], [150, 'light']]);
    expect(p.length).toBeGreaterThan(4);
    expect(p.every(([t]) => t < 3000)).toBe(true);
    const lubs = p.filter(([, h]) => h === 'medium').map(([t]) => t);
    expect(lubs[1] - lubs[0]).toBeGreaterThan(lubs[lubs.length - 1] - lubs[lubs.length - 2]);
  });
  it('gives every rarity tier its own heartbeat, bigger as it gets rarer', () => {
    const ms = 3000;
    const heavy = (t: number) => rollHeart(t, 'x', false, ms).filter(([, h]) => h === 'heavy').length;
    expect(rollHeart(0, 'common', false, ms)).toHaveLength(1);
    expect(rollHeart(0, 'uncommon', false, ms)).toHaveLength(2);
    expect(heavy(1)).toBe(0);
    expect(heavy(3)).toBeGreaterThan(0);
    expect(heavy(4)).toBeGreaterThanOrEqual(heavy(3));
    for (let t = 0; t <= 6; t++) {
      const p = rollHeart(t, 'rare', false, ms);
      expect(p.every(([at]) => at >= 0 && at <= ms)).toBe(true);
    }
  });
  it('sparkles for a shiny', () => {
    expect(rollHeart(2, 'epic', true, 3000).length).toBeGreaterThan(rollHeart(2, 'epic', false, 3000).length);
    expect(rollHeart(0, 'common', true, 3000).length).toBe(4);
  });
  it('summons, quakes and reveals', () => {
    const s = summon();
    expect(sorted(s)).toBe(true);
    expect(s[s.length - 1][1]).toBe('success');
    const q = quake(2600);
    expect(q.length).toBeGreaterThan(20);
    expect(q.some(([, h]) => h === 'heavy')).toBe(true);
    expect(q[q.length - 1][0]).toBeLessThan(2600);
    expect(revealFeel(6).length).toBeGreaterThan(revealFeel(5).length);
    expect(revealFeel(1)).toEqual([]);
  });
  it('rumbles to a shape', () => {
    expect(rumble(1000, () => 0)).toEqual([]);
    expect(rumble(1000, () => 1).every(([, h]) => h === 'heavy')).toBe(true);
  });
  it('feels footsteps heavier up close, a fox, and hot/warm/cold', () => {
    expect(footstep(0.1)).toEqual([[0, 'light']]);
    expect(footstep(0.95).length).toBe(3);
    expect(foxPatter().length).toBeGreaterThan(5);
    expect(seekFeel('hot').length).toBeGreaterThan(seekFeel('warm').length);
    expect(seekFeel('warm').length).toBeGreaterThan(seekFeel('cold').length);
  });
});

describe('the sonar', () => {
  it('pings faster the more squarely you face it', () => {
    expect(pingEvery(0)).toBe(160);
    expect(pingEvery(180)).toBe(1500);
    expect(pingEvery(30)).toBeLessThan(pingEvery(90));
    expect(pingEvery(400)).toBe(1500);
  });
  it('hits harder up close', () => {
    expect(pingHit(20)).toBe('heavy');
    expect(pingHit(200)).toBe('medium');
    expect(pingHit(3000)).toBe('light');
  });
  it('says which way to turn', () => {
    expect(turnHint(0, 5)).toBe('Straight ahead');
    expect(turnHint(0, 90)).toBe('Turn right 90°');
    expect(turnHint(90, 0)).toBe('Turn left 90°');
    expect(turnHint(0, 180)).toMatch(/Behind you/);
    expect(turnHint(350, 20)).toBe('Turn right 30°');
  });
  it('measures distance and bearing', () => {
    const a = { lng: 0, lat: 0 };
    expect(bearing(a, { lng: 0, lat: 1 })).toBeCloseTo(0, 3);
    expect(bearing(a, { lng: 1, lat: 0 })).toBeCloseTo(90, 3);
    expect(bearing(a, { lng: -1, lat: 0 })).toBeCloseTo(270, 3);
    expect(metres(a, { lng: 0, lat: 1 })).toBeGreaterThan(110_000);
    expect(metres(a, { lng: 0, lat: 1 })).toBeLessThan(112_000);
    expect(turnBetween(10, 350)).toBe(20);
    expect(turnBetween(0, 180)).toBe(180);
    expect(fmtDist(312.4)).toBe('312 m');
    expect(fmtDist(2400)).toBe('2.4 km');
    expect(fmtDist(25_000)).toBe('25 km');
  });
});

describe('a flick of the phone', () => {
  it('needs a spin and a jolt together, and not too often', () => {
    expect(detectFlick({ rr: 400, acc: 20 }, 0, 1000)).not.toBeNull();
    expect(detectFlick({ rr: 400, acc: 2 }, 0, 1000)).toBeNull(); // turning round
    expect(detectFlick({ rr: 30, acc: 25 }, 0, 1000)).toBeNull(); // a bump
    expect(detectFlick({ rr: 100, acc: 8 }, 0, 1000)).toBeNull(); // too gentle
    expect(detectFlick({ rr: 400, acc: 20 }, 800, 1000)).toBeNull(); // too soon after the last
    const soft = detectFlick({ rr: 270, acc: 9 }, 0, 1000)!, hard = detectFlick({ rr: 900, acc: 40 }, 0, 1000)!;
    expect(soft).toBeGreaterThanOrEqual(0.3);
    expect(hard).toBe(1);
    expect(hard).toBeGreaterThan(soft);
  });
});

describe("the Leviathan's footsteps", () => {
  it('come heavier and closer together as it nears', () => {
    expect(stepFor(STEP_RANGE_KM + 1)).toBeNull();
    expect(stepFor(Number.NaN)).toBeNull();
    const far = stepFor(25)!, mid = stepFor(8)!, near = stepFor(1)!;
    expect(far.every).toBeGreaterThan(mid.every);
    expect(mid.every).toBeGreaterThan(near.every);
    expect(near.w).toBeGreaterThan(mid.w);
    expect(mid.w).toBeGreaterThan(far.w);
  });
  it('measures from your nearest plot', () => {
    const [lng, lat] = cellCenter(1000, 1000);
    expect(nearestKm(lng, lat, [])).toBeNull();
    expect(nearestKm(lng, lat, [{ gx: 1000, gy: 1000 }, { gx: 5000, gy: 5000 }])!).toBeLessThan(0.01);
  });
});

describe('Smooth mode', () => {
  it('reads the iOS version', () => {
    expect(iosVersion(iphone('16_1_1'))).toEqual([16, 1]);
    expect(iosVersion(iphone('18_6'))).toEqual([18, 6]);
    expect(iosVersion('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBeNull();
  });
  it('knows an old web engine (no OffscreenCanvas before 16.4)', () => {
    expect(oldWebKit(iphone('16_1_1'))).toBe(true);
    expect(oldWebKit(iphone('15_7'))).toBe(true);
    expect(oldWebKit(iphone('16_4'))).toBe(false);
    expect(oldWebKit(iphone('17_2'))).toBe(false);
  });
  it('goes easy on older iPhones and modest Androids', () => {
    expect(liteAuto({ userAgent: iphone('16_1_1') })).toBe(true);
    expect(liteAuto({ userAgent: iphone('17_0') })).toBe(false);
    expect(liteAuto({ userAgent: 'Mozilla/5.0 (Linux; Android 13)', hardwareConcurrency: 4 })).toBe(true);
    expect(liteAuto({ userAgent: 'Mozilla/5.0 (Linux; Android 13)', hardwareConcurrency: 8, deviceMemory: 8 } as never)).toBe(false);
    expect(liteAuto({ userAgent: 'Mozilla/5.0 (Linux; Android 13)', hardwareConcurrency: 8, deviceMemory: 3 } as never)).toBe(true);
    expect(liteAuto({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe(false);
  });
  it('counts frames for the meter', () => {
    expect(fpsStats([])).toEqual({ fps: 0, worst: 0 });
    expect(fpsStats(Array(60).fill(1000 / 60)).fps).toBe(60);
    expect(fpsStats([16, 16, 120, 16]).worst).toBe(120);
  });
});
