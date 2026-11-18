// Smooth mode: how much a phone can take. The game runs inside the phone's own web engine, and on an older iPhone
// (iOS 16 and before) that engine is years behind — no drawing off the main thread (OffscreenCanvas came in 16.4),
// slower canvases and compositing. A modest Android (4 GB or less, four cores or fewer) is in the same spot. On those
// the game goes lighter without losing anything you can do: 3D places and the map draw fewer pixels, the endless
// decorations rest sooner, first person builds a smaller town round you, and the heaviest effects hold still.
// Settings → Smooth mode: Automatic (the default), On or Off.
import { useUi } from './store';

/** the iOS version of this web view, or null (not iOS). (iOS 26's Safari reports 18.x: either way, not old.) */
export function iosVersion(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): [number, number] | null {
  if (!/iPhone|iPad|iPod/.test(ua)) return null;
  const m = /OS (\d+)[_.](\d+)/.exec(ua);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** an iOS web engine without OffscreenCanvas 2D (before 16.4): everything drawn is drawn on the main thread */
export function oldWebKit(ua?: string) {
  const v = iosVersion(ua);
  return !!v && (v[0] < 16 || (v[0] === 16 && v[1] < 4));
}

/** this phone is one to go easy on (when Smooth mode is Automatic) */
export function liteAuto(nav: Partial<Navigator> & { deviceMemory?: number } = typeof navigator !== 'undefined' ? navigator : {}): boolean {
  const ua = nav.userAgent ?? '';
  const v = iosVersion(ua);
  if (v) return v[0] < 17;
  if (/Android/.test(ua)) {
    const mem = (nav as { deviceMemory?: number }).deviceMemory;
    return (mem != null && mem <= 4) || (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 4);
  }
  return false;
}

export type SmoothSetting = 'auto' | 'on' | 'off';
/** Smooth mode is on right now */
export function smooth(): boolean {
  const s = (useUi.getState().settings.smooth ?? 'auto') as SmoothSetting;
  return s === 'on' || (s === 'auto' && liteAuto());
}

/** mark the page (html.lv-lite) so the stylesheet can go lighter; call at start and when the setting changes */
export function applySmooth() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('lv-lite', smooth());
  document.documentElement.classList.toggle('lv-old-webkit', oldWebKit());
}
