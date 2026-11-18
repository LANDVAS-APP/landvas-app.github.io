// Away from the screen. A tab left open on a desktop (or a phone propped up with its screen kept on) used to keep asking
// the server about everything — the map, chats, the party, alerts — around the clock, for nobody. Production logs showed
// desktop browsers sending close to half of all calls. When nobody has touched, typed, scrolled or walked (a GPS move)
// for AWAY_AFTER on a screen you browse (the map, the hub, lists — see isBrowseScreen in rest.ts), the game counts you
// as away: background refreshes stop (React Query's interval refetches, the map's update check, the "look again"
// nudges, the activity heartbeat). Pushes still arrive. The first touch brings you back: every screen that went stale
// while you were away refreshes once, straight away.
//
// Games, rooms, lobbies, homes, the editor, first person and watching someone never count as away (you may be waiting
// for a match without touching anything). A browse screen that's watched rather than touched can hold you here with
// `holdHere()`.
import { focusManager } from '@tanstack/react-query';
import { isBrowseScreen } from './rest';

const AWAY_AFTER = 5 * 60_000;
const awayAfter = () => (globalThis as { __landvasAwayMs?: number }).__landvasAwayMs ?? AWAY_AFTER; // (tests shorten it)

let away = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let holds = 0;
let browsing = true;
let hooked = false;
const backs = new Set<() => void>();
const changes = new Set<(away: boolean) => void>();

function set(next: boolean) {
  if (next === away) return;
  away = next;
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('lv-away', away);
  for (const l of changes) { try { l(away); } catch { /* a listener's own trouble */ } }
  if (!away) for (const b of backs) { try { b(); } catch { /* ditto */ } }
}
function arm() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; if (holds === 0 && browsing) set(true); }, awayAfter());
}

/** Someone's here (a touch, a key, a GPS move): not away, and the away clock starts over. */
export function stillHere() {
  set(false);
  arm();
}

/** Away: nobody has done anything for a while (a hidden page counts as away too). */
export const isAway = () => away || (typeof document !== 'undefined' && document.hidden);

/** Run `cb` whenever someone comes back after being away. Returns the unsubscribe. */
export function onBack(cb: () => void) {
  backs.add(cb);
  return () => { backs.delete(cb); };
}

/** Hear every change (true: just went away). Returns the unsubscribe. */
export function onAwayChange(cb: (away: boolean) => void) {
  changes.add(cb);
  return () => { changes.delete(cb); };
}

/** A browse screen that's watched rather than touched keeps you here while it's open. Returns the release. */
export function holdHere() {
  holds++;
  stillHere();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds = Math.max(0, holds - 1);
    if (holds === 0) arm();
  };
}

/** The screen changed (from the app shell): only browse screens can go away. */
export function awayRoute(path: string) {
  browsing = isBrowseScreen(path);
  stillHere();
}

/** Start watching (once, from the app shell). React Query's "focused" becomes visible AND not away, so every interval
 *  refetch pauses while away, and coming back refreshes whatever went stale (refetchOnWindowFocus). */
export function startAway() {
  if (hooked || typeof window === 'undefined') return;
  hooked = true;
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(ev, stillHere, { passive: true, capture: true });
  focusManager.setEventListener((setFocused) => {
    const update = () => setFocused(!document.hidden && !away);
    const onVis = () => { if (!document.hidden) stillHere(); update(); };
    document.addEventListener('visibilitychange', onVis, false);
    const off = onAwayChange(update);
    return () => { document.removeEventListener('visibilitychange', onVis); off(); };
  });
  arm();
}

/** (for tests) */
export function resetAway() {
  away = false; holds = 0; browsing = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
