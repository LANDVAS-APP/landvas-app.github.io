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
const GameSandbox = lazy(() => import('../play/GameScreen').then((m) => ({ default: m.GameSandbox })));
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
const HomePage = lazy(() => import('../home/HomePage'));
const SupportScreen = lazy(() => import('../support/SupportScreen'));
const PvpScreen = lazy(() => import('../pvp/PvpScreen'));
const PvpSandbox = lazy(() => import('../pvp/PvpScreen').then((m) => ({ default: m.PvpSandbox })));

/** landvas.app: the public homepage (the live map lives at /world). */
function RootRoute() {
  return p(<HomePage />);
}
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

const TITLES: [RegExp, string][] = [
  [/^\/world/, 'Live world map'], [/^\/gallery/, 'Gallery — the newest map art'], [/^\/players/, 'Players'], [/^\/social/, 'Social — live feed, chat & friends'],
  [/^\/play/, 'Minigames'], [/^\/welcome/, 'Play free — create your account'], [/^\/u\/[^/]+\/room/, 'Visit room'], [/^\/u\//, 'Artist profile'],
  [/^\/art\//, 'Artwork'], [/^\/legal\//, 'Legal'], [/^\/invite/, 'Invite friends'], [/^\/explorer/, 'Your explorer'], [/^\/inventory/, 'Studio'], [/^\/support/, 'Support'], [/^\/pvp/, 'PvP minigames'],
];
/** Per-page title and canonical address (the homepage sets its own title). */
function RouteMeta() {
  const loc = useLocation();
  useEffect(() => {
    const path = loc.pathname;
    const t = TITLES.find(([re]) => re.test(path))?.[1];
    if (path !== '/') document.title = t ? `${t} · LANDVAS` : 'LANDVAS — Own a piece. Paint the world.';
    const url = `https://landvas.app${path === '/' ? '/' : path}`;
    document.querySelector('link[rel=canonical]')?.setAttribute('href', url);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
  }, [loc.pathname]);
  return null;
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
    element: <><SessionSync /><RouteMeta /><OnboardingGate /></>,
    children: [
      { path: '/welcome', element: <Welcome /> },
      { path: '/onboarding', element: <Onboarding /> },
      { path: '/create/:groupId', element: player(<EditorScreen />) },
      { path: '/play/:game', element: player(<GameScreen />) },
      { path: '/play-sandbox/:game', element: <GameSandbox /> },
      { path: '/pvp-sandbox/:game', element: <PvpSandbox /> },
      {
        element: <Shell />,
        children: [
          { path: '/', element: <RootRoute /> },
          { path: '/world', element: <MapScreen /> },
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
          { path: '/support', element: player(<SupportScreen />) },
          { path: '/pvp', element: player(<PvpScreen />) },
          { path: '/duels', element: <Navigate to="/pvp" replace /> },
          { path: '/legal/:doc', element: p(<LegalScreen />) },
          { path: '/admin', element: player(<AdminScreen />) },
          { path: '*', element: <Navigate to="/world" replace /> },
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
  return '/world';
};

const router =
  config.router === 'memory' ? createMemoryRouter(routes, { initialEntries: [initial()] })
  : config.router === 'hash' ? createHashRouter(routes)
  : createBrowserRouter(routes);

if (config.router !== 'memory' && !getBackend().session()) {
  try {
    // visitors land on the homepage at "/" (the public face of LANDVAS)
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
