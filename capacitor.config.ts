import type { CapacitorConfig } from '@capacitor/cli';
import fs from 'node:fs';

// The LANDVAS app for iOS and Android: the game, bundled into a native shell with native GPS,
// haptics, the native share sheet, reminders, a splash screen and a full-screen, app-like layout.
// Build: npm run native:sync  (then open android/ or ios/ — or let CI build them, see docs/STORE-LAUNCH.md)

// Rewarded ads ship only once AdMob has approved the app (it has to be live in the stores first).
// Until then LANDVAS_ADS is unset and the AdMob plugin is left out of the native projects entirely,
// so the binaries contain no ad SDK, no advertising ID and no App Tracking Transparency.
const ADS = process.env.LANDVAS_ADS === 'on';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
const plugins = Object.keys(pkg.dependencies).filter((d) => /^@capacitor(-community)?\//.test(d) && !['@capacitor/core', '@capacitor/android', '@capacitor/ios'].includes(d));

const config: CapacitorConfig = {
  appId: 'com.landvas.app',
  appName: 'LANDVAS',
  webDir: 'dist-native',
  backgroundColor: '#0B0820',
  includePlugins: ADS ? plugins : plugins.filter((p) => p !== '@capacitor-community/admob'),
  android: { allowMixedContent: false, backgroundColor: '#0B0820' },
  // no web-style link previews or callouts on long-press: it's a game, not a page
  ios: { contentInset: 'never', backgroundColor: '#0B0820', scrollEnabled: false, limitsNavigationsToAppBoundDomains: false, allowsLinkPreview: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, launchAutoHide: false, backgroundColor: '#0B0820', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
    // edge-to-edge on Android 15+: the safe areas reach the page as env() / --safe-area-inset-* (and the keyboard is handled natively)
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
    // the page shrinks above the keyboard like a native screen (no web "‹ › Done" bar — see native.ts)
    Keyboard: { resize: 'native', resizeOnFullScreen: false },
    LocalNotifications: { smallIcon: 'ic_stat_landvas', iconColor: '#7B5CFF' },
  },
};
export default config;
