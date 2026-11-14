// Resting decorations. Any endless CSS animation on screen — a bobbing button, a sparkle, a sloshing meter — makes the
// phone compose a new frame on every refresh (60, or 90–120 a second on newer phones) for as long as it's showing,
// even when nothing else changes: that's what keeps a phone warm on a screen that's just sitting there. When nobody
// has touched the screen for a while on a screen you browse (the map, the hub, lists, profiles), those decorative
// loops hold still until the next touch — the earnings keep ticking, loaders keep moving, anything opening still
// animates in, and games and 3D places are never paused (they pace themselves; see framePacer in gfx.ts).
const REST_AFTER = 20_000;
/** screens you look around in, where decorations may rest (games, the editor and 3D places never do) */
const RESTFUL = /^\/($|world$|hub$|play$|me$|plots$|canvases$|inventory$|social$|players$|clans$|events$|challenges$|leaderboards$|achievements$|explorer$|gallery$|invite$|settings$|support$|space$|grimoire$|inkborn$|badges$|guide$|u\/[^/]+$)/;

let path = '/';
let timer: ReturnType<typeof setTimeout> | null = null;
let resting = false;
const listeners = new Set<(resting: boolean) => void>();

// Only endless CSS loops are held, never a one-off animation: a dialog or card opening while things rest must still
// play its entrance (pausing those left them stuck at their first, invisible frame). Loaders keep moving.
const KEEP = '.lv-loader, .lv-skel, .animate-spin, .animate-pulse, .lv-keep-moving';
let held: Animation[] = [];
function hold() {
  if (typeof document.getAnimations !== 'function' || typeof CSSAnimation === 'undefined') return;
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running' || !(a instanceof CSSAnimation) || a.effect?.getTiming().iterations !== Infinity) continue;
    const t = (a.effect as KeyframeEffect | null)?.target;
    if (t?.closest?.(KEEP)) continue;
    a.pause();
    held.push(a);
  }
}
function release() {
  const list = held;
  held = [];
  for (const a of list) { try { if (a.playState === 'paused') a.play(); } catch { /* gone with its element */ } }
}

function set(on: boolean) {
  if (on === resting || typeof document === 'undefined') return;
  resting = on;
  document.documentElement.classList.toggle('lv-rest', on);
  if (on) hold(); else release();
  for (const l of listeners) l(on);
}
function arm() {
  if (timer) clearTimeout(timer);
  const after = (globalThis as { __landvasRestMs?: number }).__landvasRestMs ?? REST_AFTER; // (tests shorten it)
  timer = setTimeout(() => { timer = null; if (RESTFUL.test(path)) set(true); }, after);
}
function wake() {
  set(false);
  arm();
}

let hooked = false;
/** start watching for touches (once, from the app shell) */
export function startRest() {
  if (hooked || typeof window === 'undefined') return;
  hooked = true;
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll']) window.addEventListener(ev, wake, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  arm();
}
/** the screen changed: decorations play again (a new screen always opens alive) */
export function restRoute(p: string) {
  path = p;
  wake();
}
export const isResting = () => resting;
/** hear when decorations start or stop resting (for loops CSS can't pause, like the SVG previews' clock) */
export function onRest(cb: (resting: boolean) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
