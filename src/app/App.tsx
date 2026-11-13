import { fresh } from '../lib/poll';
import { useUi as __ui } from '../lib/store';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { isNative } from '../native/native';
import { useActivityReporter } from '../social/activity';
import { AlertPopups } from '../updates/Notifications';
import { useOnboardedMe, watchBalances, watchCalls } from '../lib/queries';
import { Navigate, Outlet, RouterProvider, createBrowserRouter, createHashRouter, createMemoryRouter, useLocation, type RouteObject } from 'react-router-dom';
import { Toaster } from 'sonner';
import { getBackend } from '../backend/backend';
import { api } from '../backend/api';
import { config } from '../env';
import { useMe } from '../lib/queries';
import { ConfirmProvider, ScreenSkeleton, Spinner, TipProvider } from '../ui';
import { MaintenanceGate } from './Maintenance';
import { Shell } from './Shell';
// the map (and everything heavy that comes with it) only downloads when it's shown: never in simple mode
const MapScreen = lazy(() => import('../screens/MapScreen').then((m) => ({ default: m.MapScreen })));
const SimpleHome = lazy(() => import('../simple/SimpleHome'));
const SimplePlay = lazy(() => import('../simple/SimplePlay'));
/** The Play tab: in simple mode, just the plot minigames */
function PlayRoute() {
  const simple = __ui((s) => !!s.settings.simpleMode);
  return simple ? <Suspense fallback={<div className="absolute inset-0 bg-bg" />}><SimplePlay /></Suspense> : <PlayHub />;
}
/** The World tab: the map, or in simple mode the one-screen game */
function WorldRoute() {
  const simple = __ui((s) => !!s.settings.simpleMode);
  return <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>{simple ? <SimpleHome /> : <MapScreen />}</Suspense>;
}
import { Welcome } from '../screens/Welcome';
import { ResetPassword } from '../screens/ResetPassword';
import { Onboarding } from '../screens/Onboarding';
import { useReferralRedeemer } from '../social/referral';

const EditorScreen = lazy(() => import('../editor/EditorScreen'));
const CanvasesScreen = lazy(() => import('../canvases/CanvasesScreen'));
const PlayHub = lazy(() => import('../play/PlayEarn'));
const GameHub = lazy(() => import('./GameHub'));
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
import { useIntegrityPing } from '../integrity/signals';
import { RestrictionNotice } from '../integrity/RestrictionNotice';
import { TermsUpdate } from './TermsUpdate';
const LegendScreen = lazy(() => import('../screens/Legend'));
const GrimoireScreen = lazy(() => import('../enchant/GrimoireScreen'));
const GuideScreen = lazy(() => import('../screens/Guide'));
const RoyaltyScreen = lazy(() => import('../screens/Royalty'));
const RarityRankingsScreen = lazy(() => import('../screens/RarityRankings'));
const EstateScreen = lazy(() => import('../landlord/EstateScreen'));
// the mobile apps never contain the admin tools (staff use the admin portal, admin.landvas.app): the native build
// folds this to the small notice and the admin screens' code is left out of the app entirely
const AdminScreen = import.meta.env.MODE === 'native' ? lazy(() => import('../admin/AdminElsewhere')) : lazy(() => import('../admin/AdminScreen'));
const PlayersScreen = lazy(() => import('../players/PlayersScreen'));
const HomePage = lazy(() => import('../home/HomePage'));
const SupportScreen = lazy(() => import('../support/SupportScreen'));
const PvpScreen = lazy(() => import('../pvp/PvpScreen'));
const ChallengesScreen = lazy(() => import('../earn/ChallengesScreen'));
const BrawlDemo = lazy(() => import('../brawl/Demo'));
const PvpSandbox = lazy(() => import('../pvp/PvpScreen').then((m) => ({ default: m.PvpSandbox })));

/** landvas.app: the public homepage (the live map lives at /world). */
function RootRoute() {
  // the app opens straight into the game (the website's home page is for visitors)
  if (isNative()) return <Navigate to={getBackend().session() ? '/world' : '/welcome'} replace />;
  return p(<HomePage />);
}
const HomeScreen = lazy(() => import('../home/HomeScreen'));
const SocialScreen = lazy(() => import('../social/SocialScreen'));
const InviteScreen = lazy(() => import('../social/InviteScreen'));
const ExplorerScreen = lazy(() => import('../explorer/ExplorerScreen'));
const SketchScreen = lazy(() => import('../creative/SketchScreen'));
const DoodleScreen = lazy(() => import('../creative/DoodleScreen'));
const DuetScreen = lazy(() => import('../creative/DuetScreen'));
const InkbornHub = lazy(() => import('../inkborn/Hub'));
const Playdate = lazy(() => import('../inkborn/Playdate'));
const VisitSanctuaries = lazy(() => import('../inkborn/Visit'));
const InkbornStudio = lazy(() => import('../inkborn/Studio'));
const Sanctuary = lazy(() => import('../inkborn/Sanctuary'));
const KeeperScreen = lazy(() => import('../inkborn/Keeper'));
const FarmScreen = lazy(() => import('../farm/FarmScreen'));
const FarmGame = lazy(() => import('../farm/FarmGame'));
const BusinessScreen = lazy(() => import('../business/BusinessScreen'));
const ArcadeScreen = lazy(() => import('../arcade/ArcadeScreen'));
const RealmScreen = lazy(() => import('../realms/RealmScreen'));
const ClansScreen = lazy(() => import('../clans/ClansScreen'));
const ClanHall = lazy(() => import('../clans/ClanHall'));
const BusinessGame = lazy(() => import('../business/BusinessGame'));
const InkbornGame = lazy(() => import('../inkborn/games/InkbornGame'));
const SpaceScreen = lazy(() => import('../space/SpaceScreen'));
const PlotsScreen = lazy(() => import('../plots/PlotsScreen'));
const SpaceSurface = lazy(() => import('../space/Surface'));
const SpaceGame = lazy(() => import('../space/SpaceGame'));
const PlanetGame = lazy(() => import('../space/PlanetGame'));

// the app: once the first screen is up, quietly load the main tabs' code so switching tabs is instant
if (isNative()) {
  setTimeout(() => {
    for (const load of [() => import('./GameHub'), () => import('../play/PlayEarn'), () => import('../canvases/CanvasesScreen'), () => import('../inkborn/Hub'), () => import('../social/SocialScreen'),
      () => import('../profile/MeHub'), () => import('../screens/Settings'), () => import('./GameHud')]) void load().catch(() => {});
  }, 3000);
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: fresh } }, // back in the app: stale screens refresh once
});
// new balances that calls hand back go straight onto the screen
watchBalances(queryClient);
watchCalls();

export function useSession() {
  const b = getBackend();
  return useSyncExternalStore((cb) => b.onAuthChange(cb), () => b.session());
}

function Loading() {
  if (isNative()) return <ScreenSkeleton />;
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
  if (session && me.data && !me.data.onboarded && loc.pathname !== '/onboarding' && loc.pathname !== '/brawl-demo' && !loc.pathname.startsWith('/legal')) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

const TITLES: [RegExp, string][] = [
  [/^\/world/, 'Live world map'], [/^\/gallery/, 'Gallery — the newest art on the map'], [/^\/players/, 'Players'], [/^\/social/, 'Social — live feed, chat & friends'], [/^\/guide/, 'The LANDVAS guide — rates, Ink and how everything works'], [/^\/royalty/, 'Royalty — every Crown and who holds it'], [/^\/rankings\/rarities/, 'Rarity rankings'], [/^\/clans/, 'Clans'], [/^\/clan\/hall/, 'Clan hall'],
  [/^\/inkborn/, 'Inkborn — draw a creature, watch it come alive'], [/^\/habitat/, 'Inkborn sanctuary'], [/^\/play/, 'Minigames'], [/^\/welcome/, 'Play free — create your account'], [/^\/u\/[^/]+\/room/, 'Visit room'], [/^\/u\//, 'Artist profile'],
  [/^\/art\//, 'Artwork'], [/^\/legal\//, 'Legal'], [/^\/invite/, 'Invite friends'], [/^\/explorer/, 'Your explorer'], [/^\/inventory/, 'Studio'], [/^\/support/, 'Support'], [/^\/pvp/, 'PvP minigames'], [/^\/challenges/, 'Weekly challenges'],
];
/** Per-page title and canonical address (the homepage sets its own title). */
function RouteMeta() {
  const loc = useLocation();
  useEffect(() => {
    const path = loc.pathname;
    const t = TITLES.find(([re]) => re.test(path))?.[1];
    if (path !== '/') document.title = t ? `${t} · LANDVAS` : 'LANDVAS — Own a piece. Play it your way.';
    const url = `https://landvas.app${path === '/' ? '/' : path}`;
    document.querySelector('link[rel=canonical]')?.setAttribute('href', url);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
  }, [loc.pathname]);
  return null;
}

/** Tell friends what you're up to (the screen you're on). */
function ActivitySync() {
  const me = useOnboardedMe();
  useActivityReporter(!!me);
  useIntegrityPing(me?.profile?.id ?? null);
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
    element: <><SessionSync /><RouteMeta /><ActivitySync /><AlertPopups /><OnboardingGate /><RestrictionNotice /><TermsUpdate /></>,
    children: [
      { path: '/welcome', element: <Welcome /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/onboarding', element: <Onboarding /> },
      { path: '/create/:groupId', element: player(<EditorScreen />) },
      { path: '/play/:game', element: player(<GameScreen />) },
      { path: '/habitat', element: player(<Sanctuary />) },
      { path: '/inkborn/play/:game/:id', element: player(<InkbornGame />) },
      { path: '/inkborn/playdate/:theirs', element: player(<Playdate />) },
      { path: '/habitat/:id', element: p(<Sanctuary />) },
      { path: '/farm/:id', element: player(<FarmScreen />) },
      { path: '/landlord/:id', element: player(<EstateScreen />) },
      { path: '/farm/:id/play/:game', element: player(<FarmGame />) },
      { path: '/business/:id', element: player(<BusinessScreen />) },
      { path: '/arcade/:id', element: player(<ArcadeScreen />) },
      { path: '/realm/:id', element: player(<RealmScreen />) },
      { path: '/clan/hall', element: player(<ClanHall />) },
      { path: '/home', element: player(<HomeScreen />) },
      { path: '/u/:username/home', element: player(<HomeScreen />) },
      { path: '/u/:username/room', element: player(<HomeScreen />) },
      { path: '/business/:id/play/:game', element: player(<BusinessGame />) },
      { path: '/space/surface', element: player(<SpaceSurface />) },
      { path: '/space/play/:game', element: player(<SpaceGame />) },
      { path: '/space/planet/:world/:gx/:gy/:game', element: player(<PlanetGame />) },
      { path: '/play-sandbox/:game', element: <GameSandbox /> },
      { path: '/pvp-sandbox/:game', element: <PvpSandbox /> },
      { path: '/brawl-demo', element: p(<BrawlDemo />) },
      {
        element: <Shell />,
        children: [
          { path: '/', element: <RootRoute /> },
          { path: '/world', element: <WorldRoute /> },
          { path: '/canvases', element: player(<CanvasesScreen />) },
          { path: '/play', element: player(<PlayRoute />) },
          { path: '/hub', element: p(<GameHub />) },
          { path: '/gallery', element: p(<GalleryScreen />) },
          { path: '/art/:id', element: p(<ArtworkScreen />) },
          { path: '/u/:username', element: p(<ProfileScreen />) },
          { path: '/social', element: p(<SocialScreen />) },
          { path: '/clans', element: player(<ClansScreen />) },
          { path: '/clans/:id', element: player(<ClansScreen />) },
          { path: '/invite', element: player(<InviteScreen />) },
          { path: '/explorer', element: player(<ExplorerScreen />) },
          { path: '/players', element: p(<PlayersScreen />) },
          { path: '/me', element: player(<MeHub />) },
          { path: '/achievements', element: player(<AchievementsScreen />) },
          { path: '/legend', element: p(<LegendScreen />) },
          { path: '/grimoire', element: player(<GrimoireScreen />) },
          { path: '/grimoire/:id', element: player(<GrimoireScreen />) },
          { path: '/guide', element: p(<GuideScreen />) },
          { path: '/royalty', element: p(<RoyaltyScreen />) },
          { path: '/rankings/rarities', element: p(<RarityRankingsScreen />) },
          { path: '/leaderboards', element: p(<LeaderboardsScreen />) },
          { path: '/inventory', element: player(<InventoryScreen />) },
          { path: '/events', element: p(<EventsScreen />) },
          { path: '/settings', element: p(<SettingsScreen />) },
          { path: '/support', element: p(<SupportScreen />) }, // public: the stores' support link (signed out it shows how to reach us)
          { path: '/pvp', element: player(<PvpScreen />) },
          { path: '/challenges', element: p(<ChallengesScreen />) },
          { path: '/sketch', element: p(<SketchScreen />) },
          { path: '/sketch/:id', element: p(<SketchScreen />) },
          { path: '/doodle', element: player(<DoodleScreen />) },
          { path: '/duet', element: player(<DuetScreen />) },
          { path: '/space', element: player(<SpaceScreen />) },
          { path: '/plots', element: player(<PlotsScreen />) },
          { path: '/inkborn', element: player(<InkbornHub />) },
          { path: '/inkborn/create', element: player(<InkbornStudio />) },
          { path: '/inkborn/visit', element: player(<VisitSanctuaries />) },
          { path: '/inkborn/keeper', element: player(<KeeperScreen />) },
          { path: '/inkborn/edit/:id', element: player(<InkbornStudio />) },
          { path: '/duet/:id', element: p(<DuetScreen />) },
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
  // an offline preview built to open straight into one thing (e.g. VITE_START=/brawl-demo)
  if (config.backend === 'local' && import.meta.env.VITE_START) return import.meta.env.VITE_START as string;
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
  Object.assign(window as any, { __landvasApi: api, __landvasNav: (p: string) => router.navigate(p), __landvasBackend: getBackend(), __landvasQc: queryClient, __landvasUi: __ui });
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TipProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
          <MaintenanceGate />
          <Toaster position="top-center" theme="system" toastOptions={{ className: 'glass !rounded-2xl !text-fg !bg-[var(--glass)] !border-[var(--line)]' }} />
        </ConfirmProvider>
      </TipProvider>
    </QueryClientProvider>
  );
}

export { router };
