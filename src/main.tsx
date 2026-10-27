import './styles/app.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from './env';
import { applyTheme, useUi } from './lib/store';
import { initBackend } from './backend/backend';
import { BootScreen } from './app/BootScreen';
import { startUpdates } from './app/updates';

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
if (config.e2e) document.documentElement.classList.add('e2e');

startUpdates();

function Root() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; error?: unknown; App?: React.ComponentType }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initBackend();
        const { App } = await import('./app/App');
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
  return <state.App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
