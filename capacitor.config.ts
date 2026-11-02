import type { CapacitorConfig } from '@capacitor/cli';

// The LANDVAS app for iOS and Android: the game, bundled into a native shell with native GPS,
// rewarded ads, haptics, a splash screen and a full-screen, app-like layout.
// Build: npm run native:sync  (then open android/ or ios/ — or let CI build them, see docs/STORE-LAUNCH.md)
const config: CapacitorConfig = {
  appId: 'com.landvas.app',
  appName: 'LANDVAS',
  webDir: 'dist-native',
  backgroundColor: '#0B0820',
  android: { allowMixedContent: false, backgroundColor: '#0B0820' },
  ios: { contentInset: 'never', backgroundColor: '#0B0820', scrollEnabled: false, limitsNavigationsToAppBoundDomains: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, launchAutoHide: false, backgroundColor: '#0B0820', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
  },
};
export default config;
