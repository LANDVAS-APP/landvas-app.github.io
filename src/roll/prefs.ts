// How Luck's rerolls play: at the normal speed (each one a full spin) or quick. Kept on this device.
import { useSyncExternalStore } from 'react';

export type RerollSpeed = 'normal' | 'quick';
const KEY = 'landvas.rerollSpeed';
const subs = new Set<() => void>();
export function rerollSpeed(): RerollSpeed {
  try { return localStorage.getItem(KEY) === 'quick' ? 'quick' : 'normal'; } catch { return 'normal'; }
}
export function setRerollSpeed(s: RerollSpeed) {
  try { localStorage.setItem(KEY, s); } catch { /* private mode: this session only */ }
  subs.forEach((f) => f());
}
export function useRerollSpeed(): [RerollSpeed, (s: RerollSpeed) => void] {
  const v = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, rerollSpeed, () => 'normal' as RerollSpeed);
  return [v, setRerollSpeed];
}
