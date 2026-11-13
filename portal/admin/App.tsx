// admin.landvas.app — the staff portal. Every call is checked in SQL against the caller's staff roles.
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Coins, Database, FileClock, Flag, Globe2, HeartPulse, LayoutDashboard, LifeBuoy, Map as MapIcon, Megaphone,
  MessagesSquare, Scale, ShieldCheck, ShieldAlert, ShoppingBag, SlidersHorizontal, Terminal, Trophy, Users, Wallet, Wrench, ImageIcon, RadioTower,
} from 'lucide-react';
import { api } from '../../src/backend/api';
import { getBackend } from '../../src/backend/backend';
import { useNotifications } from '../../src/updates/Notifications';
import { useUi } from '../../src/lib/store';
import { lngLatToCell } from '../../src/shared/grid';
import { SignIn, MfaChallenge, ResetPassword, useRecovery } from '../shared/auth';
import { useSession } from '../shared/boot';
import { portal, type WhoAmI } from '../shared/api';
import { Shell, type NavItem } from '../shared/layout';
import { ErrorBox, Loading, RouteError } from '../shared/ui';
import { TopSearch } from './search';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Players = lazy(() => import('./pages/Players'));
const Player = lazy(() => import('./pages/Player'));
const Economy = lazy(() => import('./pages/Economy'));
const MapPage = lazy(() => import('./pages/MapPage'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Data = lazy(() => import('./pages/Data'));
const Sql = lazy(() => import('./pages/Sql'));
const Audit = lazy(() => import('./pages/Audit'));
const Config = lazy(() => import('./pages/Config'));
const Live = lazy(() => import('./pages/Live'));
const Security = lazy(() => import('./pages/Security'));
const Tool = lazy(() => import('./pages/Tools'));

export function useWho() {
  return useQuery({ queryKey: ['whoami', getBackend().session()?.userId], queryFn: portal.whoami, staleTime: 60_000 });
}

function Gate() {
  const session = useSession();
  const [recovery, doneRecovery] = useRecovery();
  const who = useWho();
  const qc = useQueryClient();
  if (recovery && session) return <ResetPassword onDone={doneRecovery} />;
  if (!session) return <SignIn app="admin" />;
  if (who.error) return <div className="mx-auto max-w-lg p-10"><ErrorBox error={who.error} retry={() => void who.refetch()} /></div>;
  if (!who.data) return <Loading label="Checking your access…" className="min-h-screen" />;
  const w = who.data;
  if (!w.staff) return <NotStaff who={w} />;
  if (w.require_mfa && w.aal !== 'aal2') return <MfaChallenge who={w} onVerified={() => void qc.invalidateQueries()} />;
  return <AdminShell who={w} />;
}

function NotStaff({ who }: { who: WhoAmI }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md">
        <h1 className="p-h1">This page is for LANDVAS staff</h1>
        <p className="p-sub mt-2">You’re signed in as @{who.username ?? 'a player'}, which doesn’t have a staff role. Your own account, earnings and plots are on <a className="text-accent-2 hover:underline" href="https://my.landvas.app">my.landvas.app</a>.</p>
        <button className="mt-5 text-sm text-accent-2 hover:underline" onClick={() => void getBackend().signOut()}>Sign in with another account</button>
      </div>
    </main>
  );
}

function AdminShell({ who }: { who: WhoAmI }) {
  const has = (...roles: string[]) => who.roles.some((r) => r === 'owner' || r === 'admin' || roles.includes(r));
  const review = useQuery({ queryKey: ['admin', 'review-mode'], queryFn: api.admin.reviewMode, enabled: has('moderator'), refetchInterval: 60_000 });
  const notes = useNotifications();
  const cash = useQuery({ queryKey: ['admin', 'cashouts', 'requested'], queryFn: () => api.admin.cashoutQueue('requested'), enabled: has('payouts'), refetchInterval: 120_000 });
  const me = useQuery({ queryKey: ['admin-me'], queryFn: api.myState, staleTime: 300_000 });
  const nav: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard />, end: true, short: 'Home' },
    { to: '/players', label: 'Players', icon: <Users />, group: 'People' },
    has('moderator') && { to: '/tools/review', label: 'Art review', icon: <ImageIcon />, group: 'People', count: review.data?.pending },
    has('moderator') && { to: '/tools/integrity', label: 'Fair play', icon: <ShieldAlert />, group: 'People' },
    has('support') && { to: '/tools/support', label: 'Support', icon: <LifeBuoy />, group: 'People', count: notes.data?.open_tickets_staff },
    has('moderator') && { to: '/tools/social', label: 'Chat & social', icon: <MessagesSquare />, group: 'People' },
    has('economy', 'payouts') && { to: '/economy', label: 'Economy', icon: <Scale />, group: 'Economy' },
    { to: '/ledger', label: 'Ledger', icon: <BookOpen />, group: 'Economy' },
    has('economy') && { to: '/tools/earnings', label: 'Rates & rarities', icon: <Coins />, group: 'Economy' },
    has('economy') && { to: '/tools/shop', label: 'Shop', icon: <ShoppingBag />, group: 'Economy' },
    has('payouts') && { to: '/tools/cashouts', label: 'Cash-outs', icon: <Wallet />, group: 'Economy', count: cash.data?.length },
    { to: '/map', label: 'World map', icon: <MapIcon />, group: 'World', short: 'Map' },
    has('moderator') && { to: '/tools/plots', label: 'Plot tools', icon: <Wrench />, group: 'World' },
    has('economy') && { to: '/tools/world', label: 'World & events', icon: <Globe2 />, group: 'World' },
    has() && { to: '/tools/challenges', label: 'Challenges', icon: <Trophy />, group: 'World' },
    has() && { to: '/tools/updates', label: 'Updates', icon: <Megaphone />, group: 'World', count: notes.data?.drafts_staff },
    who.owner && { to: '/data', label: 'Data explorer', icon: <Database />, group: 'Data' },
    who.owner && { to: '/sql', label: 'SQL console', icon: <Terminal />, group: 'Data' },
    has() && { to: '/audit', label: 'Audit log', icon: <FileClock />, group: 'Data' },
    has('economy') && { to: '/live', label: 'Live control', icon: <RadioTower />, group: 'Data' },
    has() && { to: '/config', label: 'Game settings', icon: <SlidersHorizontal />, group: 'Data' },
    has() && { to: '/tools/switches', label: 'Switches', icon: <Flag />, group: 'Data' },
    { to: '/security', label: 'Security & staff', icon: <ShieldCheck />, group: 'Account' },
    has() && { to: '/tools/system', label: 'System health', icon: <HeartPulse />, group: 'Account' },
  ].filter(Boolean) as NavItem[];
  return (
    <Shell title="Admin" nav={nav} tabs={['/', '/players', '/map', who.roles.some((r) => ['owner', 'admin', 'economy', 'payouts'].includes(r)) ? '/economy' : '/ledger']} top={<TopSearch />}
      user={{ username: who.username, profile: me.data && me.data.onboarded ? me.data.profile : undefined, sub: who.roles.join(', ') + (who.aal === 'aal2' ? ' · verified' : '') }}>
      <Suspense fallback={<Loading />}><Outlet context={who} /></Suspense>
    </Shell>
  );
}

/** the game's admin screens link to game addresses; send them to the portal's own pages */
function GameWorldLink() {
  const fly = useUi.getState().flyTo;
  const sel = useUi.getState().selected;
  const cell = sel ?? (fly ? lngLatToCell(fly.lng, fly.lat) : null);
  return <Navigate to={cell ? `/map?gx=${cell.gx}&gy=${cell.gy}` : '/map'} replace />;
}
function GameProfileLink() {
  const { username } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['find-user', username], queryFn: () => portal.players({ q: username, limit: 5 }) });
  const hit = q.data?.rows.find((r: any) => r.username?.toLowerCase() === username?.toLowerCase());
  if (q.data && hit) return <Navigate to={`/players/${hit.id}`} replace />;
  if (q.data) return <div className="p-6 text-sm">No player called @{username}. <button className="text-accent-2" onClick={() => nav(-1)}>Go back</button></div>;
  return <Loading />;
}
function GameHomeLink() {
  const { username } = useParams();
  window.open(`https://landvas.app/u/${encodeURIComponent(username ?? '')}/home`, '_blank', 'noopener');
  return <Navigate to={-1 as any} replace />;
}

const page = (el: ReactNode) => el;
const router = createBrowserRouter([
  {
    path: '/',
    element: <Gate />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(<Dashboard />) },
      { path: 'players', element: page(<Players />) },
      { path: 'players/:id', element: page(<Player />) },
      { path: 'players/:id/:tab', element: page(<Player />) },
      { path: 'economy', element: page(<Economy />) },
      { path: 'map', element: page(<MapPage />) },
      { path: 'ledger', element: page(<Ledger />) },
      { path: 'data', element: page(<Data />) },
      { path: 'data/:schema/:table', element: page(<Data />) },
      { path: 'sql', element: page(<Sql />) },
      { path: 'audit', element: page(<Audit />) },
      { path: 'config', element: page(<Config />) },
      { path: 'live', element: page(<Live />) },
      { path: 'security', element: page(<Security />) },
      { path: 'tools/:tool', element: page(<Tool />) },
      { path: 'world', element: <GameWorldLink /> },
      { path: 'u/:username', element: <GameProfileLink /> },
      { path: 'u/:username/home', element: <GameHomeLink /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
