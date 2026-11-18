// The phone as a controller, part two: the compass (which way you're facing), a flick (a quick throw), a swirl (stirring
// circles), and the raw tilt. iOS asks before it shares motion — call askMotion() from a tap first (see
// enchant/living.tsx); until then these simply report nothing and the screen's buttons still work.
import { useEffect, useRef, useState } from 'react';

/** iOS: compass degrees (0 = north) on the plain event; Android: 'deviceorientationabsolute' with alpha counter-clockwise */
type Orient = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };

/** which way the top of the phone points, 0..360 from north (null until the compass answers) */
export function useCompass(on = true) {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    let raf = 0, v: number | null = null, sawWebkit = false;
    const push = (deg: number) => {
      v = ((deg % 360) + 360) % 360;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setH(v); });
    };
    const ios = (e: Event) => {
      const o = e as Orient;
      if (typeof o.webkitCompassHeading === 'number' && !Number.isNaN(o.webkitCompassHeading)) { sawWebkit = true; push(o.webkitCompassHeading); }
    };
    const abs = (e: Event) => {
      const o = e as Orient;
      if (sawWebkit || o.alpha == null) return;
      push(360 - o.alpha);
    };
    addEventListener('deviceorientation', ios);
    addEventListener('deviceorientationabsolute' as 'deviceorientation', abs);
    return () => { removeEventListener('deviceorientation', ios); removeEventListener('deviceorientationabsolute' as 'deviceorientation', abs); cancelAnimationFrame(raf); };
  }, [on]);
  return h;
}

/** the bearing from a to b, degrees from north */
export function bearing(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}
/** metres between two points */
export function metres(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const R = 6_371_000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
/** the smallest turn between two headings (0..180) */
export const turnBetween = (a: number, b: number) => { const d = Math.abs((((a - b) % 360) + 540) % 360 - 180); return d; };

/**
 * A flick: a quick throwing motion of the whole phone (a sharp spin and a jolt together — a tap on the glass is
 * neither). Calls back with its strength 0.3..1, at most every `gap` ms.
 */
export function detectFlick(e: { rr: number; acc: number }, last: number, now: number, gap = 550): number | null {
  if (now - last < gap) return null;
  if (e.rr < 260 && e.acc < 15) return null;
  if (e.rr < 140 || e.acc < 7) return null; // (both have to move: a spin alone is turning round, a jolt alone a bump)
  return Math.max(0.3, Math.min(1, Math.max(e.rr / 720, e.acc / 32)));
}
export function useFlick(on: ((strength: number) => void) | null) {
  const cb = useRef(on); cb.current = on;
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const f = (e: DeviceMotionEvent) => {
      const r = e.rotationRate, a = e.acceleration;
      if (!r && !a) return;
      const rr = Math.hypot(r?.alpha ?? 0, r?.beta ?? 0, r?.gamma ?? 0);
      const acc = Math.hypot(a?.x ?? 0, a?.y ?? 0, a?.z ?? 0);
      const now = performance.now();
      const s = detectFlick({ rr, acc }, last, now);
      if (s != null) { last = now; cb.current?.(s); }
    };
    addEventListener('devicemotion', f);
    return () => removeEventListener('devicemotion', f);
  }, [!!on]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Swirling the phone (stirring circles in the air, or spinning it flat on the table): degrees turned are added up and
 * passed on as they come (always positive — either way round counts). `onStill` once it stops for `stillMs`.
 */
export function useSwirl(on: boolean, onDeg: (deg: number) => void, onStill?: () => void, stillMs = 900) {
  const cb = useRef({ onDeg, onStill }); cb.current = { onDeg, onStill };
  useEffect(() => {
    if (!on) return;
    let lastT = 0, lastAng: number | null = null, moving = false, stillT = 0;
    const f = (e: DeviceMotionEvent) => {
      const now = performance.now();
      const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
      lastT = now;
      // spinning it flat: the turn rate round the screen's axis
      const spin = Math.abs(e.rotationRate?.alpha ?? 0) * dt;
      // stirring: the direction the phone is being pushed goes round and round
      const a = e.acceleration;
      let stir = 0;
      const m = Math.hypot(a?.x ?? 0, a?.y ?? 0);
      if (a && m > 2.2) {
        const ang = (Math.atan2(a.y ?? 0, a.x ?? 0) * 180) / Math.PI;
        if (lastAng != null) { let d = ang - lastAng; if (d > 180) d -= 360; if (d < -180) d += 360; if (Math.abs(d) < 90) stir = Math.abs(d); }
        lastAng = ang;
      } else lastAng = null;
      const deg = Math.max(spin, stir);
      if (deg > 0.8) { moving = true; stillT = now; cb.current.onDeg(deg); }
      else if (moving && now - stillT > stillMs) { moving = false; cb.current.onStill?.(); }
    };
    addEventListener('devicemotion', f);
    return () => removeEventListener('devicemotion', f);
  }, [on, stillMs]);
}

/** the raw tilt: beta (front-back, 0 flat … 90 upright) and gamma (left-right, −90…90); null on a desktop */
export function useTiltAngles(on = true) {
  const [t, setT] = useState<{ beta: number; gamma: number } | null>(null);
  useEffect(() => {
    if (!on) return;
    let raf = 0, v: { beta: number; gamma: number } | null = null;
    const f = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      v = { beta: e.beta, gamma: e.gamma };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setT(v); });
    };
    addEventListener('deviceorientation', f);
    return () => { removeEventListener('deviceorientation', f); cancelAnimationFrame(raf); };
  }, [on]);
  return t;
}
