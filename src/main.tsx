import './styles/app.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from './env';
import { applyMotion, applyTheme, useUi } from './lib/store';
import { applySmooth } from './lib/device';
import { initBackend } from './backend/backend';
import { BootScreen } from './app/BootScreen';
import { setAvatarResolver } from './ui';
import { startUpdates } from './app/updates';
import { captureReferral } from './social/referralStore';
import { capturePartyLink } from './party/link';
import { initNative } from './native/native';
import { markBundleReady, recoverFromBrokenBundle } from './native/liveBundle';
import { TempServerBanner } from './app/TempServerBanner';

if (config.fonts === 'self') {
  void import('@fontsource-variable/unbounded');
  void import('@fontsource-variable/manrope');
} else {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&family=Unbounded:wght@400..800&display=swap';
  document.head.appendChild(link);
}
applyTheme(useUi.getState().settings.theme);
applyMotion(useUi.getState().settings.reduceMotion);
applySmooth();
useUi.subscribe((s, prev) => { if (s.settings.smooth !== prev.settings.smooth) applySmooth(); });
if (config.e2e) document.documentElement.classList.add('e2e');

void initNative();
// the apps: this build of the game started, so the app shell keeps it (a build that never gets here rolls back)
markBundleReady();
startUpdates();
// keep an invite code from a ?ref= link before the router tidies the address
captureReferral();
capturePartyLink();

function Root() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; error?: unknown; App?: React.ComponentType }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const backend = await initBackend();
        setAvatarResolver((path) => backend.avatarUrl(path));
        // the Paintbrawl instant demo is its own small app (no world map, no database)
        const { App } = await (import.meta.env.VITE_DEMO === 'brawl' ? import('./brawl/DemoApp') : import('./app/App')).catch(async (e) => {
          // in the apps, a live build whose own code won't load goes back to the last build that worked
          await recoverFromBrokenBundle();
          throw e;
        });
        if (!cancelled) setState({ status: 'ready', App });
      } catch (error) {
        console.error(error);
        if (!cancelled) setState({ status: 'error', error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (state.status !== 'ready' || !state.App) return <BootScreen error={state.status === 'error' ? state.error : null} />;
  return <><state.App /><TempServerBanner /></>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
