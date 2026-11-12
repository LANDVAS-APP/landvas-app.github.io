// The iOS / Android app shell (Capacitor). On the website none of this runs.
// It makes the app feel like a game rather than a web page: full-screen with a see-through status
// bar, the native splash handing over to the animated boot screen, haptic taps, the Android back
// button, native GPS, the phone's own share sheet, a keyboard without the web "‹ › Done" bar,
// streak reminders, and links to other sites opening in the system browser.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { setCelebrateHook } from '../ui/confetti';
import { uiSound } from './uiSound';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform() as 'ios' | 'android' | 'web';

let haptics: typeof import('@capacitor/haptics') | null = null;
/** a light tap you can feel (buttons, picks, rewards) */
export function buzz(kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light') {
  if (!haptics) return;
  const { Haptics, ImpactStyle, NotificationType } = haptics;
  if (kind === 'success' || kind === 'warning') void Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning }).catch(() => {});
  else void Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}

/** Native GPS behind the browser's geolocation API, so the rest of the game needn't know. */
async function nativeGeolocation() {
  const { Geolocation } = await import('@capacitor/geolocation');
  const watches = new Map<number, string>();
  let next = 1;
  const toPos = (p: { coords: GeolocationCoordinates | any; timestamp: number }) => ({ coords: p.coords, timestamp: p.timestamp, toJSON() { return this; } }) as unknown as GeolocationPosition;
  const toErr = (e: unknown) => ({ code: /denied|permission/i.test(String((e as any)?.message ?? e)) ? 1 : 2, message: String((e as any)?.message ?? e), PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;
  const ensure = async () => {
    const p = await Geolocation.checkPermissions().catch(() => null);
    if (p?.location !== 'granted') await Geolocation.requestPermissions({ permissions: ['location'] }).catch(() => {});
  };
  const geo: Geolocation = {
    getCurrentPosition(ok, fail, opts) {
      void ensure().then(() => Geolocation.getCurrentPosition({ enableHighAccuracy: opts?.enableHighAccuracy ?? true, timeout: opts?.timeout ?? 15000, maximumAge: opts?.maximumAge ?? 0 }))
        .then((p) => ok(toPos(p))).catch((e) => fail?.(toErr(e)));
    },
    watchPosition(ok, fail, opts) {
      const id = next++;
      void ensure().then(() => Geolocation.watchPosition({ enableHighAccuracy: opts?.enableHighAccuracy ?? true, timeout: opts?.timeout ?? 20000, maximumAge: opts?.maximumAge ?? 0 }, (p, err) => {
        if (err || !p) fail?.(toErr(err)); else ok(toPos(p));
      })).then((cb) => { if (watches.has(id)) watches.set(id, cb); else void Geolocation.clearWatch({ id: cb }); });
      watches.set(id, '');
      return id;
    },
    clearWatch(id) {
      const cb = watches.get(id);
      watches.delete(id);
      if (cb) void Geolocation.clearWatch({ id: cb });
    },
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
}

/** The phone's own share sheet behind the browser's share API (Android's web view has none, and iOS's can't share
 *  files the game just drew), so every "Share" in the game opens the real one. */
async function nativeShare() {
  const [{ Share }, { Filesystem, Directory }] = await Promise.all([import('@capacitor/share'), import('@capacitor/filesystem')]);
  const toBase64 = (f: Blob) => new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => bad(r.error);
    r.readAsDataURL(f);
  });
  const share = async (data: ShareData = {}) => {
    const files: string[] = [];
    for (const [i, f] of (data.files ?? []).entries()) {
      const name = `share-${Date.now()}-${i}-${(f.name || 'landvas.png').replace(/[^\w.-]+/g, '-')}`;
      const w = await Filesystem.writeFile({ path: name, data: await toBase64(f), directory: Directory.Cache });
      files.push(w.uri);
    }
    try {
      await Share.share({ title: data.title, text: data.text, url: data.url, files: files.length ? files : undefined, dialogTitle: data.title });
    } catch (e) {
      // closing the sheet is a "cancel", like the web's AbortError
      if (/cancel/i.test(String((e as Error)?.message ?? e))) throw new DOMException('Share canceled', 'AbortError');
      throw e;
    }
  };
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
}

/** Online/offline, so screens can say "you're offline" instead of spinning (the web view reports it too). */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => { addEventListener('online', cb); addEventListener('offline', cb); return () => { removeEventListener('online', cb); removeEventListener('offline', cb); }; },
    () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    () => true,
  );
}

export async function initNative(nav?: (to: number) => void) {
  if (!isNative()) return;
  document.documentElement.classList.add('native', `native-${platform()}`);
  try {
    const [{ StatusBar, Style }, { App }] = await Promise.all([import('@capacitor/status-bar'), import('@capacitor/app')]);
    haptics = await import('@capacitor/haptics');
    void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    // Android 15+ draws edge to edge: light status/navigation icons over the game's night sky
    void SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
    // iOS: no web-style "‹ › Done" bar above the keyboard
    if (platform() === 'ios') void import('@capacitor/keyboard').then(({ Keyboard }) => Keyboard.setAccessoryBarVisible({ isVisible: false })).catch(() => {});
    // Android back: step back through screens; at the map, leave the app
    void App.addListener('backButton', ({ canGoBack }) => {
      if (location.pathname === '/world' || !canGoBack) void App.minimizeApp();
      else if (nav) nav(-1); else history.back();
    });
    await nativeGeolocation();
    await nativeShare().catch((e) => console.warn('native share', e));
  } catch (e) {
    console.warn('native init', e);
  }
  setTimeout(hideSplash, 8000); // never leave the splash up, whatever happens
  // a little tap you can feel (and hear) on every button press, like a game controller
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement | null)?.closest('button, a, [role=tab], [role=radio], [role=button]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    buzz('light');
    if (el.closest('[data-sound=tab], [role=tab]')) uiSound.tab(); else uiSound.tap();
  }, { passive: true, capture: true });
  // every celebration (claims, wins, level-ups) gets a chime
  setCelebrateHook(() => uiSound.reward());
  // links to other websites open in the system browser, not inside the game
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
      e.preventDefault();
      void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: url.href }));
    }
  }, { capture: true });
}

/** Hide the native splash once the animated boot screen is showing. */
export function hideSplash() {
  if (!isNative()) return;
  void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 250 })).catch(() => {});
}
