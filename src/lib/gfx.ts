// Shared 3D settings for phones. An iPhone draws at 3x its screen size, which triples the pixels every 3D
// scene has to fill (and drains the battery); 1.5x looks just as sharp in motion. Scenes also step their
// resolution down by themselves if frames start running slow, and back up when there's room.
const mobileUA = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobi/i.test(navigator.userAgent);
export const isPhone = () => mobileUA || (typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600 && matchMedia('(pointer: coarse)').matches);
/** The pixel ratio a 3D scene should start at. */
export const sceneDpr = (max = 2) => Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, isPhone() ? 1.5 : max);
/** Antialiasing costs a lot on phones (and barely shows at 1.5x). */
export const sceneAntialias = () => !isPhone();

// ---- frame pacing ---------------------------------------------------------------------------------------------------
// A scene's loop runs on every screen refresh. On a 90/120 Hz Android phone that's two frames for every one a 60 Hz
// screen asks for — twice the GPU work and heat for motion nobody can tell apart in a game like this. So scenes draw
// at most 60 frames a second, and a place you're just standing in (your home, the farm, a realm…) drops to 30 while
// nobody is touching the screen on a phone, back to 60 the moment you do.
let lastInput = -1e9;
let pointersDown = 0;
if (typeof window !== 'undefined') {
  const touched = () => { lastInput = performance.now(); };
  for (const ev of ['pointermove', 'keydown', 'wheel']) window.addEventListener(ev, touched, { passive: true, capture: true });
  window.addEventListener('pointerdown', () => { pointersDown++; touched(); }, { passive: true, capture: true });
  const up = () => { pointersDown = Math.max(0, pointersDown - 1); touched(); };
  window.addEventListener('pointerup', up, { passive: true, capture: true });
  window.addEventListener('pointercancel', up, { passive: true, capture: true });
  // a finger lifted off-screen or an app switch can lose the "up": never stay stuck at full speed
  document.addEventListener('visibilitychange', () => { pointersDown = 0; });
}
const RESTING_AFTER = 2500;
/** someone is touching (or just touched) the screen */
export const userActive = () => pointersDown > 0 || performance.now() - lastInput < RESTING_AFTER;

export type FramePacer = {
  /** Call first thing in a frame: false means skip drawing this one (the next frame's dt then covers it). */
  ready(now: number): boolean;
  /** the time a frame is meant to take now, in seconds (1/60 or 1/30) */
  target(): number;
};

/**
 * Paces a scene's loop. `ambient`: a place to look around in (not a fast minigame), which on a phone may rest at
 * 30 fps while nobody touches the screen — pass a function to decide frame by frame (e.g. not mid-fight).
 */
export function framePacer(opts: { ambient?: boolean | (() => boolean) } = {}): FramePacer {
  const phone = isPhone();
  let last = -1e9;
  const restful = () => phone && (typeof opts.ambient === 'function' ? opts.ambient() : !!opts.ambient) && !userActive();
  const interval = () => (restful() ? 1000 / 30 : 1000 / 60);
  return {
    ready(now) {
      const iv = interval();
      // (a little slack: refresh timestamps jitter by a fraction of a millisecond)
      if (now - last < iv - 2) return false;
      // keep an even cadence on 90/120 Hz screens without drifting below the target
      last = now - last > iv * 2 ? now : Math.max(last + iv, now - iv);
      return true;
    },
    target: () => interval() / 1000,
  };
}

/** Watches frame times and nudges a renderer's pixel ratio down (or back up) to keep things smooth. With a pacer,
 *  "slow" means slow for the rate the scene is aiming at (a resting 30 fps scene isn't struggling). */
export function adaptiveDpr(setDpr: (d: number) => void, start = sceneDpr(), pace?: FramePacer) {
  let dpr = start, acc = 0, n = 0, tg = 1 / 60;
  return (rawDt: number) => {
    const want = pace ? pace.target() : 1 / 60;
    // the pace changed (a touch, or a rest): measure afresh
    if (want !== tg) { tg = want; acc = 0; n = 0; return; }
    acc += rawDt; n++;
    if (acc < 2) return;
    const avg = acc / n; acc = 0; n = 0;
    const next = avg > tg * 1.44 ? Math.max(0.75, dpr - 0.25) : avg < tg * 0.87 ? Math.min(start, dpr + 0.1) : dpr;
    if (Math.abs(next - dpr) > 0.01) { dpr = next; setDpr(dpr); }
  };
}
