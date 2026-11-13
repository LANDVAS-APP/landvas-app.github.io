// my.landvas.app — a player's own portal: every number, plot and record of their LANDVAS account.
// Read-only: everything is changed in the game. Every call returns only the signed-in player's own rows.
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, BookOpen, Coins, Database, Gem, Home, Map as MapIcon, Sparkles, User, Users, Wallet, Egg, DollarSign } from 'lucide-react';
import { getBackend, toGameError } from '../../src/backend/backend';
import { SignIn, ResetPassword, useRecovery } from '../shared/auth';
import { useSession } from '../shared/boot';
import { portal } from '../shared/api';
import { Shell, type NavItem } from '../shared/layout';
import { ErrorBox, Loading, RouteError } from '../shared/ui';

const Overview = lazy(() => import('./pages/Overview'));
const Earnings = lazy(() => import('./pages/Money').then((m) => ({ default: m.Earnings })));
const Ledger = lazy(() => import('./pages/Money').then((m) => ({ default: m.Ledger })));
const Usd = lazy(() => import('./pages/Money').then((m) => ({ default: m.Usd })));
const Cashouts = lazy(() => import('./pages/Money').then((m) => ({ default: m.Cashouts })));
const Plots = lazy(() => import('./pages/Land').then((m) => ({ default: m.Plots })));
const Plot = lazy(() => import('./pages/Land').then((m) => ({ default: m.Plot })));
const Collection = lazy(() => import('./pages/Land').then((m) => ({ default: m.Collection })));
const Enchantments = lazy(() => import('./pages/Land').then((m) => ({ default: m.Enchantments })));
const ActivityPage = lazy(() => import('./pages/Play').then((m) => ({ default: m.ActivityPage })));
const Inkborn = lazy(() => import('./pages/Play').then((m) => ({ default: m.Inkborn })));
const Social = lazy(() => import('./pages/Play').then((m) => ({ default: m.Social })));
const MyData = lazy(() => import('./pages/Account').then((m) => ({ default: m.MyData })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));

export const useMe = () => useQuery({ queryKey: ['me', getBackend().session()?.userId], queryFn: portal.me, refetchInterval: 60_000 });

function Gate() {
  const session = useSession();
  const [recovery, doneRecovery] = useRecovery();
  const me = useMe();
  if (recovery && session) return <ResetPassword onDone={doneRecovery} />;
  if (!session) return <SignIn app="my" />;
  if (me.error) {
    if (toGameError(me.error).code === 'onboarding_required') return <NotOnboarded />;
    return <div className="mx-auto max-w-lg p-10"><ErrorBox error={me.error} retry={() => void me.refetch()} /></div>;
  }
  if (!me.data) return <Loading label="Loading your LANDVAS…" className="min-h-screen" />;
  const nav: NavItem[] = [
    { to: '/', label: 'Overview', icon: <Home />, end: true },
    { to: '/earnings', label: 'Earnings', icon: <Coins />, group: 'Money' },
    { to: '/ledger', label: 'Ink & resources', icon: <BookOpen />, group: 'Money' },
    { to: '/usd', label: 'USD rent', icon: <DollarSign />, group: 'Money' },
    { to: '/cashouts', label: 'Cash-outs', icon: <Wallet />, group: 'Money' },
    { to: '/plots', label: 'My plots', icon: <MapIcon />, group: 'Land', count: undefined },
    { to: '/collection', label: 'Collection', icon: <Gem />, group: 'Land' },
    { to: '/enchantments', label: 'Enchantments', icon: <Sparkles />, group: 'Land' },
    { to: '/activity', label: 'Activity', icon: <Activity />, group: 'Play' },
    { to: '/inkborn', label: 'Inkborn', icon: <Egg />, group: 'Play' },
    { to: '/social', label: 'Friends & clan', icon: <Users />, group: 'Play' },
    { to: '/data', label: 'All my data', icon: <Database />, group: 'Account' },
    { to: '/account', label: 'Account', icon: <User />, group: 'Account' },
  ];
  return (
    <Shell title="My LANDVAS" nav={nav} user={{ username: me.data.profile?.username, profile: me.data.profile, sub: `${me.data.counts.plots} plots` }}
      top={<span className="hidden text-sm text-muted md:inline">Everything here is read-only. Play, buy and change things in the game.</span>}>
      <Suspense fallback={<Loading />}><Outlet context={me.data} /></Suspense>
    </Shell>
  );
}

function NotOnboarded() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md">
        <h1 className="p-h1">Finish setting up in the game first</h1>
        <p className="p-sub mt-2">Your account exists, but you haven’t picked a player name yet. Open LANDVAS, finish setting up, and this page will fill with your plots and earnings.</p>
        <div className="mt-5 flex gap-4 text-sm"><a className="text-accent-2 hover:underline" href="https://landvas.app/onboarding">Open LANDVAS</a><button className="text-muted hover:text-fg" onClick={() => void getBackend().signOut()}>Sign out</button></div>
      </div>
    </main>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Gate />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'earnings', element: <Earnings /> },
      { path: 'ledger', element: <Ledger /> },
      { path: 'usd', element: <Usd /> },
      { path: 'cashouts', element: <Cashouts /> },
      { path: 'plots', element: <Plots /> },
      { path: 'plots/:gx/:gy', element: <Plot /> },
      { path: 'collection', element: <Collection /> },
      { path: 'enchantments', element: <Enchantments /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'inkborn', element: <Inkborn /> },
      { path: 'social', element: <Social /> },
      { path: 'data', element: <MyData /> },
      { path: 'account', element: <Account /> },
      { path: 'reset-password', element: <Navigate to="/" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
