import { useQuery } from '@tanstack/react-query';
import { Swords, LifeBuoy, Gamepad2, Globe2, Images, LayoutGrid, MessagesSquare, Shield, Trophy, Settings as SettingsIcon, Package, CalendarDays, Award, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { LogoMark, ResourcePill, PlayerAvatar } from '../ui';
import { AnnouncementPopup, NotificationBell } from '../updates/Notifications';

const MAIN = [
  { to: '/world', label: 'World', icon: Globe2, end: true },
  { to: '/canvases', label: 'Canvases', icon: LayoutGrid },
  { to: '/play', label: 'Play', icon: Gamepad2 },
  { to: '/social', label: 'Social', icon: MessagesSquare },
  { to: '/gallery', label: 'Gallery', icon: Images },
  { to: '/players', label: 'Players', icon: Users },
];
// the phone tab bar keeps five: Canvases and Players live in Me and Social
const MOBILE = ['/world', '/play', '/social', '/gallery'];
const MORE = [
  { to: '/duels', label: 'Duels', icon: Swords },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/leaderboards', label: 'Ranks', icon: Trophy },
  { to: '/achievements', label: 'Badges', icon: Award },
  { to: '/inventory', label: 'Studio', icon: Package },
  { to: '/support', label: 'Help', icon: LifeBuoy },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Shell() {
  const me = useOnboardedMe();
  const loc = useLocation();
  const isHome = loc.pathname === '/';
  const isMap = loc.pathname === '/world';
  const admin = me?.roles?.includes('owner');
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, refetchInterval: 60_000, staleTime: 30_000 });
  const badge = (to: string) => (to === '/social' ? friends.data?.incoming.length ?? 0 : 0);
  // the public homepage is full-bleed, without the game's navigation
  if (isHome) return <main className="h-full overflow-y-auto scroll-thin"><Outlet /><AnnouncementPopup /></main>;
  return (
    <div className="flex h-full bg-bg">
      <nav className="hidden w-[88px] shrink-0 flex-col items-center gap-1 border-r border-line bg-bg-2/70 py-4 md:flex" aria-label="Main">
        <NavLink to="/" className="mb-3" aria-label="LANDVAS home"><LogoMark size={36} /></NavLink>
        {[...MAIN, ...MORE].map((i) => <RailItem key={i.to} {...i} badge={badge(i.to)} />)}
        {admin ? <RailItem to="/admin" label="Admin" icon={Shield} /> : null}
        <div className="flex-1" />
        <NotificationBell className="mb-2 !bg-transparent !shadow-none hover:!bg-surface-2" />
        {me ? (
          <NavLink to="/me" className="rounded-2xl p-1 hover:bg-surface-2" aria-label="Your profile">
            <PlayerAvatar p={me.profile} size={40} />
          </NavLink>
        ) : null}
      </nav>
      <main className={cn('relative min-w-0 flex-1', isMap ? 'overflow-hidden' : 'overflow-y-auto scroll-thin')}>
        <Outlet />
      </main>
      <AnnouncementPopup />
      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex justify-around border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,0px)] md:hidden" aria-label="Main">
        {MAIN.filter((i) => MOBILE.includes(i.to)).map((i) => <TabItem key={i.to} {...i} badge={badge(i.to)} />)}
        <TabItem to="/me" label="Me" icon={null} avatar={me ? <PlayerAvatar p={me.profile} size={24} /> : null} />
      </nav>
    </div>
  );
}

function Dot({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="absolute -right-1.5 -top-1 min-w-[16px] rounded-full bg-hot px-1 text-center text-[10px] font-bold leading-4 text-white tnum" aria-label={`${n} new`}>{n > 9 ? '9+' : n}</span>;
}

function RailItem({ to, label, icon: Icon, end, badge }: { to: string; label: string; icon: any; end?: boolean; badge?: number }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cn('flex w-[72px] flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold transition',
        isActive ? 'bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}>
      <span className="relative"><Icon className="h-5 w-5" /><Dot n={badge} /></span>
      {label}
    </NavLink>
  );
}

function TabItem({ to, label, icon: Icon, end, avatar, badge }: { to: string; label: string; icon: any; end?: boolean; avatar?: ReactNode; badge?: number }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cn('flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold', isActive ? 'text-fg' : 'text-faint')}>
      <span className="relative">{avatar ?? (Icon ? <Icon className="h-[22px] w-[22px]" /> : <span className="block h-[22px] w-[22px] rounded-full bg-surface-2" />)}<Dot n={badge} /></span>
      {label}
    </NavLink>
  );
}

/** Scrollable page wrapper used by every non-map screen. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn('gutter mx-auto w-full pb-[calc(96px+env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))] md:pb-12', wide ? 'max-w-7xl' : 'max-w-5xl')}>{children}</div>;
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const me = useOnboardedMe();
  return (
    <header className="mb-6 grid gap-4">
      <div className="flex items-center justify-between gap-3 md:hidden">
        <LogoMark size={30} />
        <div className="flex items-center gap-2">{me && <ResourceBar compact />}<NotificationBell size="sm" /></div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h1 className="font-display text-2xl font-bold md:text-3xl">{title}</h1>
          {children && <div className="mt-2 max-w-2xl text-sm text-muted">{children}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {me && <div className="hidden md:block"><ResourceBar /></div>}
        </div>
      </div>
    </header>
  );
}

export function ResourceBar({ compact }: { compact?: boolean }) {
  const me = useOnboardedMe();
  if (!me) return null;
  const b = me.balances;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ResourcePill r="ink" value={b.ink} />
      <ResourcePill r="pigments" value={b.pigments} />
      {!compact && <ResourcePill r="brush_points" value={b.brush_points} />}
      {!compact && <ResourcePill r="gallery_tokens" value={b.gallery_tokens} />}
    </div>
  );
}
