// Starts a portal: fonts, the backend (the same Supabase project as the game), rarity colours, providers.
import './portal.css';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import { StrictMode, useSyncExternalStore, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { getBackend, initBackend, setBackend } from '../../src/backend/backend';
import { api } from '../../src/backend/api';
import { setRarities } from '../../src/shared/rarity';
import { useUi } from '../../src/lib/store';
import { ConfirmProvider, Spinner, TipProvider, setAvatarResolver } from '../../src/ui';

/** a password-reset link opened this page (read before the auth client tidies the address) */
export const openedFromRecovery = typeof location !== 'undefined' && (/type=recovery/.test(location.hash) || location.pathname.startsWith('/reset-password'));

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 } },
});

export function useSession() {
  const b = getBackend();
  return useSyncExternalStore((cb) => b.onAuthChange(cb), () => b.session());
}

export const isDev = () => !!import.meta.env.VITE_PORTAL_DEV_API;

export async function boot(App: ComponentType) {
  document.documentElement.dataset.theme = 'dark';
  // the game's own night map (jewel-toned countries) sits best on the portal's dark pages
  try { useUi.getState().updateSettings({ theme: 'dark', mapTheme: 'neon' } as any); } catch { /* defaults */ }
  const root = createRoot(document.getElementById('root')!);
  root.render(<div className="flex min-h-screen items-center justify-center"><Spinner /></div>);
  try {
    if (import.meta.env.VITE_PORTAL_DEV_API) {
      const { DevBackend, asBackend } = await import('./devBackend');
      setBackend(asBackend(new DevBackend(import.meta.env.VITE_PORTAL_DEV_API as string)));
    } else {
      await initBackend();
    }
    setAvatarResolver((p) => getBackend().avatarUrl(p));
    void api.worldConfig().then((w) => setRarities(w?.rarities)).catch(() => {});
  } catch (e) {
    console.error(e);
    root.render(<div className="flex min-h-screen items-center justify-center p-6 text-center text-muted">LANDVAS couldn’t reach its server. Check your connection and reload the page.</div>);
    return;
  }
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TipProvider delayDuration={200}>
          <ConfirmProvider>
            <App />
            <Toaster theme="dark" position="bottom-right" richColors closeButton />
          </ConfirmProvider>
        </TipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
