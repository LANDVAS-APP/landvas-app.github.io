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
const plugins = Object.keys(pkg.dependencies).filter((d) => /^@capacitor(-community)?\/|^@capgo\//.test(d) && !['@capacitor/core', '@capacitor/android', '@capacitor/ios'].includes(d));
const included = ADS ? plugins : plugins.filter((p) => p !== '@capacitor-community/admob');
// Push on Android runs through Firebase Cloud Messaging, which needs android/app/google-services.json (the Native apps
// workflow writes it from the GOOGLE_SERVICES_JSON secret). Without it, asking Firebase for a push address crashes the
// app — so a build without the file leaves the push plugin out on Android, and the game sees push isn't there.
const FCM = fs.existsSync('android/app/google-services.json');

const config: CapacitorConfig = {
  appId: 'com.landvas.app',
  appName: 'LANDVAS',
  webDir: 'dist-native',
  backgroundColor: '#0B0820',
  includePlugins: included,
  android: { allowMixedContent: false, backgroundColor: '#0B0820', includePlugins: FCM ? included : included.filter((p) => p !== '@capacitor/push-notifications') },
  // no web-style link previews or callouts on long-press: it's a game, not a page
  ios: { contentInset: 'never', backgroundColor: '#0B0820', scrollEnabled: false, limitsNavigationsToAppBoundDomains: false, allowsLinkPreview: false },
  plugins: {
    // the splash stays up until the game's first screen is drawn (hideSplash() in src/native/native.ts), so nothing
    // half-loaded ever shows. (launchShowDuration must not be 0: 0 turns the launch splash off altogether, on both
    // platforms, and the half-built page showed through — Google Play's reviewer saw a text wall, then a logo.)
    SplashScreen: { launchShowDuration: 10000, launchAutoHide: false, launchFadeOutDuration: 250, backgroundColor: '#0B0820', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
    // edge-to-edge on Android 15+: the safe areas reach the page as env() / --safe-area-inset-* (and the keyboard is handled natively)
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
    // the page shrinks above the keyboard like a native screen (no web "‹ › Done" bar — see native.ts)
    Keyboard: { resize: 'native', resizeOnFullScreen: false },
    LocalNotifications: { smallIcon: 'ic_stat_landvas', iconColor: '#7B5CFF' },
    // pushes that arrive while LANDVAS is open show inside the game (src/native/push.ts), not as a system banner
    PushNotifications: { presentationOptions: [] },
    // new versions of the game's web code without a store release (src/native/liveBundle.ts). Nothing automatic and
    // no third-party service: the game decides what to fetch (from landvas.app), checks every file against the list
    // kept in the database, applies it only after the app has been away for a while or on the next launch, and
    // rolls back by itself if a build doesn't start. No stats leave the device.
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
      updateUrl: '',
      channelUrl: '',
      httpsOnly: true,
      appReadyTimeout: 15000,
      responseTimeout: 30,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      // a new app version from the store starts clean on the build inside it
      resetWhenUpdate: true,
      shakeMenu: false,
      allowPreview: false,
      allowModifyUrl: false,
      allowSetDefaultChannel: false,
    },
  },
};
export default config;
