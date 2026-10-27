import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, Outlet, RouterProvider, createBrowserRouter, createHashRouter, createMemoryRouter, useLocation, type RouteObject } from 'react-router-dom';
import { Toaster } from 'sonner';
import { getBackend } from '../backend/backend';
import { api } from '../backend/api';
import { config } from '../env';
import { useMe } from '../lib/queries';
import { ConfirmProvider, Spinner, TipProvider } from '../ui';
import { Shell } from './Shell';
import { MapScreen } from '../screens/MapScreen';
import { Welcome } from '../screens/Welcome';
import { Onboarding } from '../screens/Onboarding';
import { useReferralRedeemer } from '../social/referral';

const EditorScreen = lazy(() => import('../editor/EditorScreen'));
const CanvasesScreen = lazy(() => import('../canvases/CanvasesScreen'));
const PlayHub = lazy(() => import('../play/PlayHub'));
const GameScreen = lazy(() => import('../play/GameScreen'));
const GalleryScreen = lazy(() => import('../gallery/GalleryScreen'));
const ArtworkScreen = lazy(() => import('../gallery/ArtworkScreen'));
const ProfileScreen = lazy(() => import('../profile/ProfileScreen'));
const MeHub = lazy(() => import('../profile/MeHub'));
const AchievementsScreen = lazy(() => import('../screens/Achievements'));
const LeaderboardsScreen = lazy(() => import('../screens/Leaderboards'));
const InventoryScreen = lazy(() => import('../screens/Inventory'));
const EventsScreen = lazy(() => import('../screens/Events'));
const SettingsScreen = lazy(() => import('../screens/Settings'));
const LegalScreen = lazy(() => import('../screens/Legal'));
const AdminScreen = lazy(() => import('../admin/AdminScreen'));
const PlayersScreen = lazy(() => import('../players/PlayersScreen'));
const VisitRoom = lazy(() => import('../visit/VisitRoom'));
const SocialScreen = lazy(() => import('../social/SocialScreen'));
const InviteScreen = lazy(() => import('../social/InviteScreen'));
const ExplorerScreen = lazy(() => import('../explorer/ExplorerScreen'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function useSession() {
  const b = getBackend();
  return useSyncExternalStore((cb) => b.onAuthChange(cb), () => b.session());
}

function Loading() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

/** Requires a signed-in, onboarded player. */
function RequirePlayer({ children }: { children: ReactNode }) {
  const session = useSession();
  const me = useMe();
  const loc = useLocation();
  if (!session) return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (me.isLoading) return <Loading />;
  if (me.data && !me.data.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function OnboardingGate() {
  const session = useSession();
  const me = useMe();
  const loc = useLocation();
  if (session && me.data && !me.data.onboarded && loc.pathname !== '/onboarding' && !loc.pathname.startsWith('/legal')) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function SessionSync() {
  const qc = useQueryClient();
  useReferralRedeemer();
  useEffect(() => getBackend().onAuthChange(() => void qc.resetQueries()), [qc]);
  useEffect(() => {
    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = 'reason' in e ? String((e.reason as any)?.message ?? e.reason) : e.message;
      if (getBackend().session()) void api.reportClientError(msg.slice(0, 500), { path: location.pathname, ua: navigator.userAgent }).catch(() => {});
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, []);
  return null;
}

const p = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;
const player = (el: ReactNode) => <RequirePlayer>{p(el)}</RequirePlayer>;

const routes: RouteObject[] = [
  {
    element: <><SessionSync /><OnboardingGate /></>,
    children: [
      { path: '/welcome', element: <Welcome /> },
      { path: '/onboarding', element: <Onboarding /> },
      { path: '/create/:groupId', element: player(<EditorScreen />) },
      { path: '/play/:game', element: player(<GameScreen />) },
      {
        element: <Shell />,
        children: [
          { path: '/', element: <MapScreen /> },
          { path: '/canvases', element: player(<CanvasesScreen />) },
          { path: '/play', element: player(<PlayHub />) },
          { path: '/gallery', element: p(<GalleryScreen />) },
          { path: '/art/:id', element: p(<ArtworkScreen />) },
          { path: '/u/:username', element: p(<ProfileScreen />) },
          { path: '/u/:username/room', element: p(<VisitRoom />) },
          { path: '/social', element: p(<SocialScreen />) },
          { path: '/invite', element: player(<InviteScreen />) },
          { path: '/explorer', element: player(<ExplorerScreen />) },
          { path: '/players', element: p(<PlayersScreen />) },
          { path: '/me', element: player(<MeHub />) },
          { path: '/achievements', element: player(<AchievementsScreen />) },
          { path: '/leaderboards', element: p(<LeaderboardsScreen />) },
          { path: '/inventory', element: player(<InventoryScreen />) },
          { path: '/events', element: p(<EventsScreen />) },
          { path: '/settings', element: p(<SettingsScreen />) },
          { path: '/legal/:doc', element: p(<LegalScreen />) },
          { path: '/admin', element: player(<AdminScreen />) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
];

const initial = () => {
  const s = getBackend().session();
  try {
    if (!s && !localStorage.getItem('landvas.welcomed')) return '/welcome';
  } catch {
    if (!s) return '/welcome';
  }
  return '/';
};

const router =
  config.router === 'memory' ? createMemoryRouter(routes, { initialEntries: [initial()] })
  : config.router === 'hash' ? createHashRouter(routes)
  : createBrowserRouter(routes);

if (config.router !== 'memory' && !getBackend().session()) {
  try {
    if (!localStorage.getItem('landvas.welcomed') && location.pathname === '/') void router.navigate('/welcome', { replace: true });
  } catch {
    /* storage blocked */
  }
}

if (config.e2e || import.meta.env.DEV) {
  Object.assign(window as any, { __landvasApi: api, __landvasNav: (p: string) => router.navigate(p), __landvasBackend: getBackend() });
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

export { router };
