// 🎨 The Paintbrawl instant demo as its own small app: just the arena, no world map, no database. Built with
// VITE_DEMO=brawl (see DemoBackend) so it opens fast and fits in a phone's memory.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ConfirmProvider, TipProvider } from '../ui';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { DemoBackend } from '../backend/demo/DemoBackend';
import { config } from '../env';
import BrawlDemo from './Demo';
import BrawlScreen from './BrawlScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Arena() {
  const { id } = useParams();
  return <BrawlScreen id={id!} />;
}

const router = createMemoryRouter(
  [
    { path: '/brawl-demo', element: <BrawlDemo /> },
    { path: '/realm/:id', element: <Arena /> },
    // "back to the map" and anything else lands on the demo's menu
    { path: '*', element: <Navigate to="/brawl-demo?menu=1" replace /> },
  ],
  { initialEntries: [`/brawl-demo${typeof location !== 'undefined' ? location.search : ''}`] },
);

if (config.e2e || import.meta.env.DEV) {
  const be = getBackend() as DemoBackend;
  Object.assign(be, { db: be.testDb?.() });
  Object.assign(window as any, { __landvasApi: api, __landvasNav: (p: string) => router.navigate(p), __landvasBackend: be, __landvasQc: queryClient }); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TipProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" theme="system" toastOptions={{ className: 'glass !rounded-2xl !text-fg !bg-[var(--glass)] !border-[var(--line)]' }} />
        </ConfirmProvider>
      </TipProvider>
    </QueryClientProvider>
  );
}
