// The apps: you feel the Leviathan coming. While it walks within 30 km of one of your plots, a footstep thuds in your
// hand now and then — faint and far apart while it's far off, heavier and closer together as it nears, a shaking double
// step when it's on your doorstep. It only reads what the game already has (the Leviathan the map and hub keep fresh,
// and your plots): no extra calls to the server. Not while it's hidden from you (that would give it away), not in the
// background, and never over the roll's own heartbeat.
import type { QueryClient } from '@tanstack/react-query';
import type { LevState } from '../backend/api';
import { qk } from '../lib/queries';
import { cellCenter } from '../shared/grid';
import { footstep, play, playing, canFeel } from '../native/feel';
import { isNative } from '../native/native';
import { LEV_KEY, levPos } from './useLeviathan';

export const STEP_RANGE_KM = 30;

const km = (a: [number, number], b: [number, number]) => {
  const R = 6371, dLat = ((b[1] - a[1]) * Math.PI) / 180, dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** how often a step comes (ms) and how heavy it is (0..1), this far from your nearest plot — null out of range */
export function stepFor(dKm: number): { every: number; w: number } | null {
  if (!(dKm < STEP_RANGE_KM)) return null;
  const w = Math.max(0, Math.min(1, 1 - dKm / STEP_RANGE_KM));
  return { every: dKm > 20 ? 14_000 : dKm > 10 ? 10_000 : dKm > 5 ? 7_000 : dKm > 2 ? 5_000 : 3_500, w };
}

/** the nearest of these plots to the Leviathan right now (km), or null */
export function nearestKm(lng: number, lat: number, plots: { gx: number; gy: number }[]) {
  let best: number | null = null;
  for (const p of plots) {
    const [x, y] = cellCenter(p.gx, p.gy);
    const d = km([lng, lat], [x, y]);
    if (best == null || d < best) best = d;
  }
  return best;
}

let started = false;
export function startFootsteps(qc: QueryClient) {
  if (started || !isNative() || typeof window === 'undefined') return;
  started = true;
  let next = 0;
  setInterval(() => {
    if (document.hidden || !canFeel() || performance.now() < next) return;
    if (playing('roll-heart') || playing('roll-feel')) return;
    const st = qc.getQueryData<LevState>([...LEV_KEY, true]);
    const l = st?.lev;
    if (!l || !l.path || l.hidden || l.status === 'warning') return;
    const plots = qc.getQueryData<{ gx: number; gy: number }[]>(qk.myPlots);
    if (!plots?.length) return;
    const p = levPos(l);
    if (p.paused || p.done) return;
    const d = nearestKm(p.lng, p.lat, plots);
    const s = d == null ? null : stepFor(d);
    if (!s) return;
    play(footstep(s.w), 'lev-step');
    next = performance.now() + s.every;
  }, 1000);
}
