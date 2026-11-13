// Every roll (its full record) and every big moment is kept on this phone, newest first, so any of them can be clipped
// or snipped later from the Clips page. Small: a roll's record is a few KB. Device-only (nothing is uploaded).
import { useSyncExternalStore } from 'react';
import type { Trace } from '../roll/stage/trace';
import type { Moment } from './moments';

export type ClipEntry =
  | { id: string; at: number; user: string | null; kind: 'roll'; trace: Trace }
  | { id: string; at: number; user: string | null; kind: 'moment'; moment: Moment };

const KEY = 'landvas.clips.v1';
const MAX = { roll: 30, moment: 30 };
const subs = new Set<() => void>();
let cache: ClipEntry[] | null = null;

function read(): ClipEntry[] {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '[]') as ClipEntry[]; } catch { cache = []; }
  if (!Array.isArray(cache)) cache = [];
  return cache;
}
function write(list: ClipEntry[]) {
  const trim = (l: ClipEntry[]) => {
    let r = 0, m = 0;
    return l.filter((e) => (e.kind === 'roll' ? ++r <= MAX.roll : ++m <= MAX.moment));
  };
  let next = trim(list.sort((a, b) => b.at - a.at));
  for (let i = 0; i < 6; i++) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); break; } catch {
      // (storage full: let the oldest go)
      next = next.slice(0, Math.max(1, Math.floor(next.length * 0.7)));
    }
  }
  cache = next;
  subs.forEach((f) => f());
}

/** keep a roll (called once it lands) */
export function saveRoll(tr: Trace) {
  if (!tr.reveal && !tr.final) return;
  const list = read().filter((e) => e.id !== tr.id);
  write([{ id: tr.id, at: tr.at || Date.now(), user: tr.user?.username ?? null, kind: 'roll', trace: JSON.parse(JSON.stringify(tr)) }, ...list]);
}
/** keep a moment (a splice, the Forbidden Wish, Hope…) */
export function saveMoment(m: Moment) {
  const list = read().filter((e) => e.id !== m.id);
  write([{ id: m.id, at: m.at, user: m.user ?? null, kind: 'moment', moment: m }, ...list]);
}
export function removeClip(id: string) { write(read().filter((e) => e.id !== id)); }

/** this player's kept rolls and moments (entries saved before sign-in count too) */
export function useClips(user: string | null | undefined) {
  const all = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, () => [] as ClipEntry[]);
  return all.filter((e) => !user || !e.user || e.user === user);
}
