import { useQuery } from '@tanstack/react-query';
import { Swords, Gift, LifeBuoy, Gamepad2, Globe2, Images, MessagesSquare, Shield, Trophy, Package, CalendarDays, Award, Users, Brush, PenLine } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { useUi } from '../lib/store';
import { LogoMark, ResourcePill, PlayerAvatar } from '../ui';
import { AnnouncementPopup, NotificationBell } from '../updates/Notifications';
import { Tour } from '../tour/Tour';

/** The five places in the game; each groups the pages that belong together. */
export const SECTIONS = [
  { to: '/world', label: 'World', icon: Globe2, pages: [] as { to: string; label: string }[] },
  { to: '/canvases', label: 'Create', icon: Brush, pages: [
    { to: '/canvases', label: 'My canvases' }, { to: '/challenges', label: 'Challenges' }, { to: '/sketch', label: 'Sketch of the Day' },
    { to: '/duet', label: 'Duets' }, { to: '/inventory', label: 'Studio & shop' },
  ] },
  { to: '/play', label: 'Play & Earn', icon: Gamepad2, pages: [
    { to: '/play', label: 'Play & Earn' }, { to: '/pvp', label: 'PvP' }, { to: '/doodle', label: 'Draw & Guess' }, { to: '/events', label: 'Events' }, { to: '/leaderboards', label: 'Ranks' },
  ] },
  { to: '/social', label: 'Community', icon: MessagesSquare, pages: [
    { to: '/social', label: 'Feed & chat' }, { to: '/gallery', label: 'Gallery' }, { to: '/players', label: 'Players' }, { to: '/invite', label: 'Invite friends' },
  ] },
];
const ME_PAGES = [
  { to: '/me', label: 'Me' }, { to: '/achievements', label: 'Badges' }, { to: '/explorer', label: 'Explorer' }, { to: '/settings', label: 'Settings' }, { to: '/support', label: 'Help' },
];
const under = (path: string, to: string) => path === to || path.startsWith(`${to}/`);
/** Which section (and its pages) a path belongs to. */
function sectionOf(path: string) {
  if (ME_PAGES.some((p) => under(path, p.to))) return { to: '/me', label: 'Me', pages: ME_PAGES };
  return SECTIONS.find((s) => under(path, s.to) || s.pages.some((p) => under(path, p.to))) ?? null;
}

// the phone tab bar: four tabs the player picks (Settings → Phone navigation), then Me
export const DEFAULT_TABS = ['/world', '/canvases', '/play', '/social'];
export const MAX_TABS = 4;
/** Everything that can sit in the phone tab bar: the sections, or a favourite page. */
export const TAB_CHOICES = [
  ...SECTIONS.map(({ to, label, icon }) => ({ to, label, icon })),
  { to: '/gallery', label: 'Gallery', icon: Images }, { to: '/players', label: 'Players', icon: Users }, { to: '/invite', label: 'Invite', icon: Gift },
  { to: '/pvp', label: 'PvP', icon: Swords }, { to: '/challenges', label: 'Challenges', icon: Trophy }, { to: '/sketch', label: 'Sketch', icon: PenLine },
  { to: '/events', label: 'Events', icon: CalendarDays }, { to: '/leaderboards', label: 'Ranks', icon: Trophy }, { to: '/achievements', label: 'Badges', icon: Award },
  { to: '/inventory', label: 'Studio', icon: Package }, { to: '/support', label: 'Help', icon: LifeBuoy },
];

export function Shell() {
  const me = useOnboardedMe();
  const loc = useLocation();
  const isHome = loc.pathname === '/';
  const isMap = loc.pathname === '/world';
  const admin = me?.roles?.includes('owner');
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, refetchInterval: 60_000, staleTime: 30_000 });
  const badge = (to: string) => (to === '/social' ? friends.data?.incoming.length ?? 0 : 0);
  const chosen = useUi((s) => s.settings.mobileTabs);
  const chosenTabs = chosen?.length ? chosen : DEFAULT_TABS;
  const sec = sectionOf(loc.pathname);
  // a tab lights up for its own page, or for its section unless another tab is that page
  const tabActive = (to: string) => under(loc.pathname, to) || (sec?.to === to && !chosenTabs.some((t) => t !== to && under(loc.pathname, t)));
  const tabs = (chosen?.length ? chosen : DEFAULT_TABS).map((to) => TAB_CHOICES.find((i) => i.to === to)).filter(Boolean).slice(0, MAX_TABS) as typeof TAB_CHOICES;
  // the public homepage is full-bleed, without the game's navigation
  if (isHome) return <main className="h-full overflow-y-auto scroll-thin"><Outlet /><AnnouncementPopup /></main>;
  return (
    <div className="flex h-full bg-bg">
      <nav className="hidden w-[88px] shrink-0 flex-col items-center gap-1 border-r border-line bg-bg-2/70 py-4 md:flex" aria-label="Main">
        <NavLink to="/" className="mb-3" aria-label="LANDVAS home"><LogoMark size={36} /></NavLink>
        {SECTIONS.map((i) => <RailItem key={i.to} {...i} active={sec?.to === i.to} badge={badge(i.to)} />)}
        {admin ? <RailItem to="/admin" label="Admin" icon={Shield} active={loc.pathname.startsWith('/admin')} /> : null}
        <div className="flex-1" />
        <NotificationBell className="mb-2 !bg-transparent !shadow-none hover:!bg-surface-2" />
        {me ? (
          <NavLink to="/me" className="rounded-2xl p-1 hover:bg-surface-2" aria-label="Your profile">
            <PlayerAvatar p={me.profile} size={40} />
          </NavLink>
        ) : null}
      </nav>
      <main className={cn('relative min-w-0 flex-1', isMap ? 'overflow-hidden' : 'overflow-y-auto scroll-thin')}>
        {!isMap && <Ambient />}
        {!isMap && sec && sec.pages.length > 1 && <SubNav pages={sec.pages} path={loc.pathname} />}
        {isMap ? <Outlet /> : (
          <motion.div key={loc.pathname} className="relative" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: 'easeOut' }}>
            <Outlet />
          </motion.div>
        )}
      </main>
      <AnnouncementPopup />
      <Tour />
      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex justify-around border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,0px)] md:hidden" aria-label="Main">
        {tabs.map((i) => <TabItem key={i.to} {...i} label={i.to === '/play' ? 'Play' : i.label} active={tabActive(i.to)} badge={badge(i.to)} />)}
        <TabItem to="/me" label="Me" icon={null} active={sec?.to === '/me'} avatar={me ? <PlayerAvatar p={me.profile} size={24} /> : null} />
      </nav>
    </div>
  );
}

function Dot({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="absolute -right-1.5 -top-1 min-w-[16px] rounded-full bg-hot px-1 text-center text-[10px] font-bold leading-4 text-white tnum" aria-label={`${n} new`}>{n > 9 ? '9+' : n}</span>;
}

function RailItem({ to, label, icon: Icon, badge, active }: { to: string; label: string; icon: any; badge?: number; active?: boolean }) {
  return (
    <Link to={to} className={cn('relative flex w-[72px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-semibold transition', active ? 'text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg')} aria-current={active ? 'page' : undefined}>
      {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-2xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--line-strong),0_8px_24px_-12px_var(--accent)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <motion.span className="relative" animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}><Icon className="h-5 w-5" /><Dot n={badge} /></motion.span>
      <span className="relative text-center leading-tight">{label}</span>
    </Link>
  );
}

function TabItem({ to, label, icon: Icon, avatar, badge, active }: { to: string; label: string; icon: any; avatar?: ReactNode; badge?: number; active?: boolean }) {
  return (
    <Link to={to} className={cn('relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold transition-colors', active ? 'text-fg' : 'text-faint')} aria-current={active ? 'page' : undefined}>
      {active && <motion.span layoutId="tab-active" className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-gradient-to-r from-accent to-accent-2 shadow-[0_0_12px_var(--accent)]" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
      <motion.span className="relative" animate={active ? { y: [0, -4, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }} transition={{ duration: 0.4 }}>
        {avatar ?? (Icon ? <Icon className="h-[22px] w-[22px]" /> : <span className="block h-[22px] w-[22px] rounded-full bg-surface-2" />)}<Dot n={badge} />
      </motion.span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </Link>
  );
}

/** The pages of the current section, as pills under the top of the screen. */
function SubNav({ pages, path }: { pages: { to: string; label: string }[]; path: string }) {
  const cur = [...pages].sort((a, b) => b.to.length - a.to.length).find((p) => under(path, p.to))?.to;
  return (
    <div className="sticky top-0 z-30 border-b border-white/5 bg-bg/75 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl" data-testid="subnav">
      <div className="gutter no-scrollbar mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2">
        {pages.map((p) => {
          const on = cur === p.to;
          return (
            <Link key={p.to} to={p.to} className={cn('relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors', on ? 'text-fg' : 'text-muted hover:text-fg')} aria-current={on ? 'page' : undefined}>
              {on && <motion.span layoutId="subnav-active" className="absolute inset-0 rounded-full bg-gradient-to-r from-accent/30 to-accent-2/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
              <span className="relative">{p.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Slow colour light behind every page (transform-only, so it stays smooth on phones). */
function Ambient() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden md:left-[88px]" aria-hidden>
      <div className="lv-orb-a" />
      <div className="lv-orb-b" />
    </div>
  );
}

/** Scrollable page wrapper used by every non-map screen. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn('lv-page gutter relative mx-auto w-full pb-[calc(96px+env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))] md:pb-12', wide ? 'max-w-7xl' : 'max-w-5xl')}>{children}</div>;
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
          <h1 className="lv-title font-display text-2xl font-bold md:text-3xl">{title}</h1>
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
