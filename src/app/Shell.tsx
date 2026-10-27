import { Gamepad2, Globe2, Images, LayoutGrid, Shield, Trophy, Settings as SettingsIcon, Package, CalendarDays, Award, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { Avatar, LogoMark, ResourcePill } from '../ui';

const MAIN = [
  { to: '/', label: 'World', icon: Globe2, end: true },
  { to: '/canvases', label: 'Canvases', icon: LayoutGrid },
  { to: '/play', label: 'Play', icon: Gamepad2 },
  { to: '/gallery', label: 'Gallery', icon: Images },
  { to: '/players', label: 'Players', icon: Users },
];
const MORE = [
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/leaderboards', label: 'Ranks', icon: Trophy },
  { to: '/achievements', label: 'Badges', icon: Award },
  { to: '/inventory', label: 'Studio', icon: Package },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Shell() {
  const me = useOnboardedMe();
  const loc = useLocation();
  const isMap = loc.pathname === '/';
  const admin = me?.roles?.includes('owner');
  return (
    <div className="flex h-full bg-bg">
      <nav className="hidden w-[88px] shrink-0 flex-col items-center gap-1 border-r border-line bg-bg-2/70 py-4 md:flex" aria-label="Main">
        <NavLink to="/" className="mb-3" aria-label="LANDVAS home"><LogoMark size={36} /></NavLink>
        {[...MAIN, ...MORE].map((i) => <RailItem key={i.to} {...i} />)}
        {admin ? <RailItem to="/admin" label="Admin" icon={Shield} /> : null}
        <div className="flex-1" />
        {me ? (
          <NavLink to="/me" className="rounded-2xl p-1 hover:bg-surface-2" aria-label="Your profile">
            <Avatar seed={me.profile.avatar_seed} style={me.profile.avatar_style} accent={me.profile.accent_color} size={40} />
          </NavLink>
        ) : null}
      </nav>
      <main className={cn('relative min-w-0 flex-1', isMap ? 'overflow-hidden' : 'overflow-y-auto scroll-thin')}>
        <Outlet />
      </main>
      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex justify-around border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,0px)] md:hidden" aria-label="Main">
        {MAIN.map((i) => <TabItem key={i.to} {...i} />)}
        <TabItem to="/me" label="Me" icon={null} avatar={me ? <Avatar seed={me.profile.avatar_seed} style={me.profile.avatar_style} accent={me.profile.accent_color} size={24} /> : null} />
      </nav>
    </div>
  );
}

function RailItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: any; end?: boolean }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cn('flex w-[72px] flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold transition',
        isActive ? 'bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}>
      <Icon className="h-5 w-5" />
      {label}
    </NavLink>
  );
}

function TabItem({ to, label, icon: Icon, end, avatar }: { to: string; label: string; icon: any; end?: boolean; avatar?: ReactNode }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cn('flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold', isActive ? 'text-fg' : 'text-faint')}>
      {avatar ?? (Icon ? <Icon className="h-[22px] w-[22px]" /> : <span className="h-[22px] w-[22px] rounded-full bg-surface-2" />)}
      {label}
    </NavLink>
  );
}

/** Scrollable page wrapper used by every non-map screen. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn('gutter mx-auto w-full pb-28 pt-5 md:pb-12', wide ? 'max-w-7xl' : 'max-w-5xl')}>{children}</div>;
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const me = useOnboardedMe();
  return (
    <header className="mb-6 grid gap-4">
      <div className="flex items-center justify-between gap-3 md:hidden">
        <LogoMark size={30} />
        {me && <ResourceBar compact />}
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
