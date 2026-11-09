// "Look again" nudges: instead of asking the server every few seconds whether something changed, a screen listens on
// a topic, and the database sends a tiny message there when it does. The screen then asks once.
//
// Nudges are only hints: they carry no data (anything shown still comes from the usual, checked server call), and
// topics for shared places can be guessed, so a flood of fake nudges is held to one check per `gapMs`. A check also
// runs when the app comes back to the front (pushes sent while the phone slept are lost), and a slow safety check
// catches anything else that slipped through. Backends without live channels (local mode) just check on a timer.
import { useEffect, useRef } from 'react';
import { getBackend } from '../backend/backend';

export type NudgeOpts = {
  /** the slow safety check while nothing is heard (ms) */ safetyMs: number;
  /** at most one check per this long, however many nudges arrive (ms) */ gapMs?: number;
  /** with live channels unavailable, check this often instead (ms) */ fallbackMs?: number;
  /** check once more this long after a nudge (for topics the server only nudges once every few seconds) */ trailMs?: number;
};

export type Nudger = {
  /** check soon (many calls in a row become one check, never more often than `gapMs`) */ soon(ms?: number): void;
  stop(): void;
};

/** Listen on `topic` (none: just the safety and come-back checks) and run `check` when it's time to look again. */
export function nudged(topic: string | null, check: () => unknown, opts: NudgeOpts): Nudger {
  const b = getBackend();
  const gap = opts.gapMs ?? 1500;
  const canListen = !!b.liveChannel;
  let stopped = false, lastAt = 0, soonT: ReturnType<typeof setTimeout> | null = null, trailT: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (stopped || (typeof document !== 'undefined' && document.hidden)) return;
    lastAt = Date.now();
    try { void Promise.resolve(check()).catch(() => undefined); } catch { /* next time */ }
  };
  const soon = (ms = 250) => {
    if (stopped || soonT) return;
    const wait = Math.max(ms, lastAt + gap - Date.now());
    soonT = setTimeout(() => { soonT = null; run(); }, wait);
  };
  const heard = () => {
    soon();
    if (opts.trailMs && !trailT) trailT = setTimeout(() => { trailT = null; soon(0); }, opts.trailMs);
  };
  const ch = topic && canListen ? b.liveChannel!(topic, heard) : null;
  const every = canListen ? opts.safetyMs : (opts.fallbackMs ?? opts.safetyMs);
  const timer = setInterval(() => { if (Date.now() - lastAt >= every * 0.9) run(); }, every);
  const onShow = () => { if (typeof document !== 'undefined' && !document.hidden) soon(0); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onShow);
  return {
    soon,
    stop: () => {
      stopped = true; clearInterval(timer); ch?.close();
      if (soonT) clearTimeout(soonT);
      if (trailT) clearTimeout(trailT);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onShow);
    },
  };
}

/**
 * React: run `check` when `topic` is nudged (plus once on mount, on coming back to the app, and on the safety timer).
 * `topic` may change (e.g. once the server says which group you're in); null listens to nothing.
 * Returns a ref whose `.current.soon()` asks for a check, e.g. after a message arrives over another channel.
 */
export function useNudge(topic: string | null, check: () => unknown, opts: NudgeOpts & { enabled?: boolean; immediate?: boolean }) {
  const ref = useRef(check); ref.current = check;
  const n = useRef<Nudger | null>(null);
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const x = nudged(topic, () => ref.current(), opts);
    n.current = x;
    if (opts.immediate ?? true) x.soon(0);
    return () => { x.stop(); if (n.current === x) n.current = null; };
  }, [topic, enabled, opts.safetyMs, opts.gapMs, opts.fallbackMs, opts.trailMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return n;
}
