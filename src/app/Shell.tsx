import { getBackend } from '../backend/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Swords, Gift, LifeBuoy, Gamepad2, Globe2, Images, MessagesSquare, Shield, Trophy, Package, CalendarDays, Award, Users, Brush, PenLine, PawPrint, Rocket, LayoutGrid, Home, Smile } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { useUi } from '../lib/store';
import { Emblem, LogoMark, ResourcePill, PlayerAvatar, useEdgeFade, type DiscTone } from '../ui';
import { AnnouncementPopup, NotificationBell } from '../updates/Notifications';
import { Tour } from '../tour/Tour';
import { buzz, isNative, useOnline } from '../native/native';
import { useWorldButton } from './radial';
import { useStreakReminder } from '../native/reminders';
import { initAds } from '../ads/ads';
import { useEffect, useRef, useState } from 'react';
import { useScreenGestures } from './gestures';
import { useClaimables } from './claimables';
// the app's game HUD (top bar + menu) — only the app downloads it
import { guard } from '../backend/supabase/guard';
import { poll } from '../lib/poll';

/** The five places in the game; each groups the pages that belong together. */
export const SECTIONS = [
  { to: '/world', label: 'World', icon: Globe2, pages: [{ to: '/world', label: 'Map' }, { to: '/plots', label: 'My plots' }] as { to: string; label: string }[] },
  { to: '/canvases', label: 'Create', icon: Brush, pages: [
    { to: '/canvases', label: 'My canvases' }, { to: '/challenges', label: 'Challenges' }, { to: '/sketch', label: 'Sketch of the Day' },
    { to: '/duet', label: 'Duets' }, { to: '/inventory', label: 'Studio & shop' },
  ] },
  { to: '/inkborn', label: 'Inkborn', icon: PawPrint, pages: [
    { to: '/inkborn', label: 'My creatures' }, { to: '/inkborn/create', label: 'Create an Inkborn' }, { to: '/habitat', label: 'Sanctuary' }, { to: '/inkborn/visit', label: 'Visit' },
  ] },
  { to: '/space', label: 'Space', icon: Rocket, pages: [
    { to: '/space', label: 'Mission control' }, { to: '/space/play/asteroids', label: 'Asteroid Run' }, { to: '/space/play/lander', label: 'Moon Lander' },
  ] },
  { to: '/play', label: 'Play & Earn', icon: Gamepad2, pages: [
    { to: '/play', label: 'Play & Earn' }, { to: '/pvp', label: 'PvP' }, { to: '/doodle', label: 'Draw & Guess' }, { to: '/events', label: 'Events' }, { to: '/leaderboards', label: 'Ranks' },
  ] },
  { to: '/social', label: 'Community', icon: MessagesSquare, pages: [
    { to: '/social', label: 'Feed & chat' }, { to: '/clans', label: 'Clans' }, { to: '/gallery', label: 'Gallery' }, { to: '/players', label: 'Players' }, { to: '/invite', label: 'Invite friends' },
  ] },
];
export const ME_PAGES = [
  { to: '/me', label: 'Me' }, { to: '/achievements', label: 'Badges' }, { to: '/explorer', label: 'Explorer' }, { to: '/settings', label: 'Settings' }, { to: '/support', label: 'Help' },
];
// the app gets chunkier, game-style tabs
const NATIVE = isNative();
const under = (path: string, to: string) => path === to || path.startsWith(`${to}/`);
/** A top-level place (a tab, a section page or a menu page): no back button there, just tabs. */
export function isRootPage(path: string) {
  return path === '/' || path === '/hub' || ME_PAGES.some((p) => p.to === path) || SECTIONS.some((s) => s.to === path || s.pages.some((p) => p.to === path));
}
/** Go back like an app: the previous screen, or (opened from a link) the section this screen belongs to. */
export function goBack(nav: (to: string | number) => void, path: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) nav(-1); else nav(sectionOf(path)?.to ?? (NATIVE ? '/hub' : '/world'));
}
/** The app: each section's medallion and colour (the screen's title and its glow). */
const SECTION_LOOK: Record<string, { tone: DiscTone; icon: typeof Globe2; glow: string }> = {
  '/world': { tone: 'azure', icon: Globe2, glow: 'rgba(58, 168, 255, 0.34)' },
  '/canvases': { tone: 'rose', icon: Brush, glow: 'rgba(255, 92, 174, 0.3)' },
  '/inkborn': { tone: 'emerald', icon: PawPrint, glow: 'rgba(47, 212, 147, 0.28)' },
  '/space': { tone: 'violet', icon: Rocket, glow: 'rgba(138, 107, 255, 0.36)' },
  '/play': { tone: 'ember', icon: Gamepad2, glow: 'rgba(255, 122, 47, 0.3)' },
  '/social': { tone: 'teal', icon: MessagesSquare, glow: 'rgba(34, 199, 181, 0.28)' },
  '/me': { tone: 'gold', icon: Smile, glow: 'rgba(233, 178, 63, 0.26)' },
};
/** Which section (and its pages) a path belongs to. */
function sectionOf(path: string) {
  if (ME_PAGES.some((p) => under(path, p.to))) return { to: '/me', label: 'Me', pages: ME_PAGES };
  return SECTIONS.find((s) => under(path, s.to) || s.pages.some((p) => under(path, p.to))) ?? null;
}

// the phone tab bar: five tabs the player picks (Settings → Phone navigation), then Me
// (the app: Play first, then Community — the World in the middle — then Inkborn and Create)
export const DEFAULT_TABS = NATIVE ? ['/play', '/social', '/world', '/inkborn', '/canvases'] : ['/world', '/canvases', '/inkborn', '/play', '/social'];
export const MAX_TABS = 5;
/** simple mode's tab bar */
const SIMPLE_TABS = [{ to: '/world', label: 'Home', icon: Home }, { to: '/play', label: 'Play', icon: Gamepad2 }];
/** Everything that can sit in the phone tab bar: the sections, or a favourite page. */
export const TAB_CHOICES = [
  ...SECTIONS.map(({ to, label, icon }) => ({ to, label, icon })),
  { to: '/plots', label: 'My plots', icon: LayoutGrid }, { to: '/gallery', label: 'Gallery', icon: Images }, { to: '/players', label: 'Players', icon: Users }, { to: '/invite', label: 'Invite', icon: Gift },
  { to: '/pvp', label: 'PvP', icon: Swords }, { to: '/challenges', label: 'Challenges', icon: Trophy }, { to: '/sketch', label: 'Sketch', icon: PenLine },
  { to: '/events', label: 'Events', icon: CalendarDays }, { to: '/leaderboards', label: 'Ranks', icon: Trophy }, { to: '/achievements', label: 'Badges', icon: Award },
  { to: '/inventory', label: 'Studio', icon: Package }, { to: '/support', label: 'Help', icon: LifeBuoy },
];

/** The app's tabs: '/play' becomes the hub (the game's menu); if the player didn't pick it, it takes the last slot. */
function hubTabs(tabs: typeof TAB_CHOICES): typeof TAB_CHOICES {
  const hub = { to: '/hub', label: 'Play', icon: Gamepad2 };
  if (tabs.some((t) => t.to === '/play')) return tabs.map((t) => (t.to === '/play' ? hub : t));
  const out = [...tabs];
  const at = out.map((t) => t.to).lastIndexOf(out.filter((t) => t.to !== '/world').at(-1)?.to ?? '');
  if (out.length >= MAX_TABS && at >= 0) out.splice(at, 1);
  return [...out, hub];
}

export function Shell() {
  const me = useOnboardedMe();
  const loc = useLocation();
  const isHome = loc.pathname === '/';
  const simple = useUi((s) => !!s.settings.simpleMode);
  const isMap = loc.pathname === '/world' && !simple;
  const admin = me?.roles?.includes('owner');
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, refetchInterval: poll(120_000), staleTime: 60_000 });
  const claim = useClaimables();
  const badge = (to: string) => (to === '/social' ? friends.data?.incoming.length ?? 0 : to === (NATIVE && !simple ? '/hub' : '/world') ? claim.count : 0);
  const chosen = useUi((s) => s.settings.mobileTabs);
  const chosenTabs = chosen?.length ? chosen : DEFAULT_TABS;
  const sec = sectionOf(loc.pathname);
  // the server is struggling: say so (background refreshes are paused for a moment; taps still go through)
  const [busy, setBusy] = useState(false);
  useEffect(() => guard.onChange(setBusy), []);
  // pushes: when your alerts change (or there's news) the server says so, and only then do we look
  const qc = useQueryClient();
  useEffect(() => {
    if (!me) return;
    // (at most one look per kind every few seconds — the shared news topic is open to anyone, so a flood of fake
    // nudges can't make every phone hammer the server)
    const last: Record<string, number> = {};
    return getBackend().onPush?.((kind) => {
      const k = kind === 'news' ? 'news' : kind === 'eggs' ? 'eggs' : 'alerts', gap = k === 'news' ? 60_000 : 5_000;
      if (Date.now() - (last[k] ?? 0) < gap) return;
      last[k] = Date.now();
      if (k === 'news') { void qc.invalidateQueries({ queryKey: ['notifications'] }); return; }
      if (k === 'eggs') { void qc.invalidateQueries({ queryKey: ['ink-eggs'] }); return; }
      if (kind === 'support') void qc.invalidateQueries({ queryKey: ['support'] });
      for (const q of [['alerts'], ['notifications'], ['friends']]) void qc.invalidateQueries({ queryKey: q });
    });
  }, [!!me]); // eslint-disable-line react-hooks/exhaustive-deps
  // the app sets up ads (consent + Apple's tracking prompt) once you're signed in and playing
  useEffect(() => { if (NATIVE && me) void initAds(); }, [!!me]); // eslint-disable-line react-hooks/exhaustive-deps
  // the app: the daily streak reminder stays in step with the streak (only if the player turned reminders on)
  useStreakReminder(!!me);
  const online = useOnline();
  // a tab lights up for its own page, or for its section unless another tab is that page
  const tabActive = (to: string) => under(loc.pathname, to) || (sec?.to === to && !chosenTabs.some((t) => t !== to && under(loc.pathname, t)));
  // simple mode keeps just the essentials: home and play (and Me)
  const tabs = simple ? SIMPLE_TABS : (chosen?.length ? chosen : DEFAULT_TABS).map((to) => TAB_CHOICES.find((i) => i.to === to)).filter(Boolean).slice(0, MAX_TABS) as typeof TAB_CHOICES;
  // the app: the Play tab is the game's main menu (the hub), and it's always in the bar
  const gameTabs = NATIVE && !simple ? hubTabs(tabs) : tabs;
  const hubActive = (to: string) => (to === '/hub' ? loc.pathname === '/hub' || !gameTabs.some((t) => t.to !== '/hub' && tabActive(t.to)) && sec?.to !== '/me' : tabActive(to));
  // the app: swipe from the left edge to go back, pull down to refresh, and screens that move like an app's
  const nav = useNavigate();
  const navType = useNavigationType();
  const mainRef = useRef<HTMLElement>(null);
  const deep = !isRootPage(loc.pathname);
  useEffect(() => { if (NATIVE) document.documentElement.style.setProperty('--hud-h', 'max(10px, env(safe-area-inset-top, 0px))'); }, []);
  const gest = useScreenGestures(mainRef, { enabled: NATIVE && !isMap, canGoBack: deep, onBack: () => goBack(nav as (to: string | number) => void, loc.pathname) });
  const enter = !NATIVE ? { initial: { opacity: 0, y: 10 }, transition: { duration: 0.24, ease: 'easeOut' as const } }
    : navType === 'POP' ? { initial: { opacity: 0, x: -36 }, transition: { type: 'spring' as const, stiffness: 520, damping: 42 } }
    : deep ? { initial: { opacity: 0, x: 44 }, transition: { type: 'spring' as const, stiffness: 520, damping: 42 } }
    : { initial: { opacity: 0, scale: 0.985 }, transition: { duration: 0.16, ease: 'easeOut' as const } };
  // the public homepage is full-bleed, without the game's navigation
  if (isHome) return <main className="h-full overflow-y-auto scroll-thin"><Outlet /><AnnouncementPopup /></main>;
  return (
    <div className="flex h-full bg-bg">
      {!online ? <div className="pointer-events-none fixed left-1/2 top-[max(8px,env(safe-area-inset-top,0px))] z-[60] -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-[11px] font-bold text-white shadow-lg backdrop-blur" role="status" data-testid="offline">📡 You’re offline — LANDVAS picks up where you left off when you’re back</div>
        : busy && <div className="pointer-events-none fixed left-1/2 top-[max(8px,env(safe-area-inset-top,0px))] z-[60] -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[11px] font-bold text-white shadow-lg backdrop-blur" role="status" data-testid="server-busy">🐢 The server is busy — background updates are paused for a moment</div>}
      <nav className="hidden w-[88px] shrink-0 flex-col items-center gap-1 border-r border-line bg-bg-2/70 py-4 md:flex" aria-label="Main">
        <NavLink to="/" className="mb-3" aria-label="LANDVAS home"><LogoMark size={36} /></NavLink>
        {(simple ? SIMPLE_TABS : SECTIONS).map((i) => <RailItem key={i.to} {...i} active={simple ? under(loc.pathname, i.to) : sec?.to === i.to} badge={badge(i.to)} />)}
        {admin ? <RailItem to="/admin" label="Admin" icon={Shield} active={loc.pathname.startsWith('/admin')} /> : null}
        <div className="flex-1" />
        <NotificationBell className="mb-2 !bg-transparent !shadow-none hover:!bg-surface-2" />
        {me ? (
          <NavLink to="/me" className="rounded-2xl p-1 hover:bg-surface-2" aria-label="Your profile">
            <PlayerAvatar p={me.profile} size={40} />
          </NavLink>
        ) : null}
      </nav>
      <main ref={mainRef} className={cn('relative min-w-0 flex-1', isMap ? 'overflow-hidden' : 'overflow-y-auto scroll-thin', simple && 'overflow-x-hidden')} {...(NATIVE && !isMap ? gest.handlers : {})}>
        {NATIVE && !isMap && gest.overlay}
        {!isMap && <Ambient />}
        {NATIVE && !isMap && sec && SECTION_LOOK[sec.to] && <div className="lv-sec-glow" style={{ ['--sec' as string]: SECTION_LOOK[sec.to].glow }} aria-hidden />}
        {NATIVE && !isMap ? (
          // the app: no top bar on screens — just a back button (deeper screens) and the section's tabs, which
          // scroll away with the screen; the HUD lives on the map and in the Play hub
          loc.pathname === '/hub' || (simple && loc.pathname === '/world') ? null
            : <ScreenBar deep={deep} pages={!simple && sec && sec.pages.length > 1 ? sec.pages : null} path={loc.pathname} onBack={() => goBack(nav as (to: string | number) => void, loc.pathname)} />
        ) : !isMap && !simple && sec && sec.pages.length > 1 && <SubNav pages={sec.pages} path={loc.pathname} />}
        {isMap ? <Outlet /> : (
          <div style={gest.offset ? { transform: `translateY(${gest.offset}px)`, transition: 'transform 0.2s ease-out' } : undefined}>
            <motion.div key={loc.pathname} className="relative" initial={enter.initial} animate={{ opacity: 1, y: 0, x: 0, scale: 1 }} transition={enter.transition}>
              <Outlet />
            </motion.div>
          </div>
        )}
      </main>
      <AnnouncementPopup />
      <Tour />
      {NATIVE ? <GameTabBar away={deep && !isMap} tabs={gameTabs} simple={simple} active={(to) => (simple ? under(loc.pathname, to) : hubActive(to))} badge={badge} meActive={sec?.to === '/me'} /> : <nav className="lv-game fixed inset-x-0 bottom-0 z-40 flex justify-around rounded-t-[26px] border-t-[1.5px] border-white/15 bg-[linear-gradient(180deg,rgba(24,30,78,0.97),rgba(10,13,38,0.98))] px-1 pb-[env(safe-area-inset-bottom,0px)] pt-1 text-white shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.8)] md:hidden" aria-label="Main">
        {tabs.map((i) => <TabItem key={i.to} {...i} label={i.to === '/play' ? 'Play' : i.label} active={simple ? under(loc.pathname, i.to) : tabActive(i.to)} badge={badge(i.to)} />)}
        <TabItem to="/me" label="Me" icon={null} active={sec?.to === '/me'} avatar={me ? <PlayerAvatar p={me.profile} size={24} /> : null} />
      </nav>}
    </div>
  );
}

/** The app's tab bar: a floating capsule with the world as a big raised button in the middle (you and your
 *  profile live in the top bar). Tabs are the five the player picked (Settings → Phone navigation). */
function GameTabBar({ tabs, simple, active, badge, meActive, away }: { tabs: typeof TAB_CHOICES; simple: boolean; active(to: string): boolean; badge(to: string): number; meActive: boolean; away?: boolean }) {
  // the World button: hold it for the map's actions (they fan out around it); on the map, a tap centres on you
  const nav = useNavigate();
  const loc = useLocation();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const held = useRef(false);
  const [worldHold, setWorldHold] = useState(false);
  const stop = () => { clearTimeout(timer.current); setWorldHold(false); };
  const hold = {
    onPointerDown: () => {
      held.current = false; setWorldHold(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        held.current = true; setWorldHold(false);
        buzz('medium');
        if (loc.pathname !== '/world') nav('/world');
        useWorldButton.getState().setOpen(true);
      }, 380);
    },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: (e: React.MouseEvent) => {
      if (held.current) { e.preventDefault(); held.current = false; return; }
      if (loc.pathname === '/world') { e.preventDefault(); const w = useWorldButton.getState(); if (w.open) w.setOpen(false); else w.center(); }
    },
  };
  const centerTo = tabs.some((t) => t.to === '/world') ? '/world' : tabs[Math.floor(tabs.length / 2)]?.to;
  const center = tabs.find((t) => t.to === centerTo);
  const rest: { to: string; label: string; icon: any }[] = tabs.filter((t) => t.to !== centerTo);
  if (simple) rest.push({ to: '/me', label: 'Me', icon: Smile });
  const half = Math.ceil(rest.length / 2);
  const item = (t: { to: string; label: string; icon: any }) => {
    const on = t.to === '/me' ? meActive : active(t.to);
    const Icon = t.icon;
    return (
      <Link key={t.to} to={t.to} data-sound="tab" className={cn('lv-tb-item', on && 'on')} aria-current={on ? 'page' : undefined} data-testid={`tab-${t.to}`}>
        <span className="ic"><Icon className="h-[22px] w-[22px]" /><Dot n={badge(t.to)} /></span>
        <span className="lb">{t.to === '/play' ? 'Play' : t.label}</span>
      </Link>
    );
  };
  return (
    <nav className={cn('lv-tabbar lv-game', away && 'away')} aria-label="Main" aria-hidden={away || undefined} data-testid="game-tabbar">
      <div className="flex flex-1 justify-around">{rest.slice(0, half).map(item)}</div>
      {center && (
        <Link to={center.to} data-sound="tab" className={cn('lv-tb-center', active(center.to) && 'on', worldHold && 'holding')} aria-current={active(center.to) ? 'page' : undefined} aria-label={simple ? 'Home' : `${center.label} — hold for map actions`} data-testid={`tab-${center.to}`}
          {...(center.to === '/world' && !simple ? hold : {})}>
          <span className="orb">{simple ? <Home className="h-7 w-7" /> : <center.icon className="h-7 w-7" />}{badge(center.to) > 0 && <span className="lv-bang">{badge(center.to)}</span>}</span>
          <span className="lb">{simple ? 'Home' : center.label}</span>
        </Link>
      )}
      <div className="flex flex-1 justify-around">{rest.slice(half).map(item)}</div>
    </nav>
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
    <Link to={to} data-sound="tab" className={cn('relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-extrabold transition-colors', active ? 'text-white' : 'text-white/55')} aria-current={active ? 'page' : undefined}>
      <motion.span className={cn('relative flex h-10 w-12 items-center justify-center rounded-2xl transition-colors', active && 'bg-[linear-gradient(180deg,#9a7bff,#5b3df5)] text-white shadow-[0_3px_0_#2c1a8a,0_10px_22px_-8px_rgba(123,92,255,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]')} animate={active ? { y: [0, -6, -2], scale: [1, 1.15, 1.05] } : { y: 0, scale: 1 }} transition={{ duration: 0.4 }} whileTap={{ scale: 0.88 }}>
        {avatar ?? (Icon ? <Icon className="h-[22px] w-[22px]" /> : <span className="block h-[22px] w-[22px] rounded-full bg-surface-2" />)}<Dot n={badge} />
      </motion.span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </Link>
  );
}

/** The app's screens have no top bar: a round back button on deeper screens, and the section's tabs. */
function ScreenBar({ deep, pages, path, onBack }: { deep: boolean; pages: { to: string; label: string }[] | null; path: string; onBack(): void }) {
  const cur = pages ? [...pages].sort((a, b) => b.to.length - a.to.length).find((p) => under(path, p.to))?.to : undefined;
  return (
    <div className="lv-screenbar relative z-20 flex items-center gap-1 pt-[max(10px,env(safe-area-inset-top,0px))]" data-testid="screen-bar">
      {deep && (
        <button className="lv-back ml-3 shrink-0" onClick={onBack} aria-label="Back" data-testid="hud-back"><ChevronLeft className="h-6 w-6" strokeWidth={2.6} /></button>
      )}
      {pages ? <HudTabs pages={pages} cur={cur} /> : <div className="h-10" />}
    </div>
  );
}

/** The app: the section's pages as pills under the HUD; the current one slides into view, the row fades at the edge. */
function HudTabs({ pages, cur }: { pages: { to: string; label: string }[]; cur?: string }) {
  const ref = useEdgeFade<HTMLDivElement>();
  useEffect(() => {
    const row = ref.current, el = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !el) return;
    const left = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: row.scrollLeft ? 'smooth' : 'auto' });
  }, [cur]);
  return (
    <div ref={ref} className="lv-fade no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto px-3 py-1" data-testid="subnav">
      {pages.map((p) => (
        <Link key={p.to} to={p.to} data-sound="tab" className={cn('lv-gtab', cur === p.to && 'on')} aria-current={cur === p.to ? 'page' : undefined}>{p.label}</Link>
      ))}
    </div>
  );
}

/** The pages of the current section, as pills under the top of the screen. */
function SubNav({ pages, path, inHud }: { pages: { to: string; label: string }[]; path: string; inHud?: boolean }) {
  const cur = [...pages].sort((a, b) => b.to.length - a.to.length).find((p) => under(path, p.to))?.to;
  if (inHud) return <HudTabs pages={pages} cur={cur} />;
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
  const deep = !isRootPage(useLocation().pathname);
  return <div className={cn('lv-page gutter relative mx-auto w-full md:pb-12', NATIVE ? (deep ? 'pb-[calc(28px+env(safe-area-inset-bottom,0px))] pt-2' : 'pb-[calc(112px+env(safe-area-inset-bottom,0px))] pt-2') : 'pb-[calc(96px+env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))]', wide ? 'max-w-7xl' : 'max-w-5xl')}>{children}</div>;
}

function HeaderActions({ children }: { children: ReactNode }) {
  const ref = useEdgeFade<HTMLDivElement>();
  return <div ref={ref} className="lv-fade no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [&>*]:shrink-0">{children}</div>;
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const me = useOnboardedMe();
  const [info, setInfo] = useState(false);
  // the app: a game-style title (the HUD above already shows you, your Ink and the bell); the explanation hides
  // behind an (i) so screens open on the game, not on a paragraph
  const loc = useLocation();
  if (NATIVE) {
    // a medallion of the screen's section next to its title
    const sec = sectionOf(loc.pathname);
    const look = sec ? SECTION_LOOK[sec.to] : null;
    return (
    <header className="mb-5 grid gap-3" data-testid="page-header">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {look && <Emblem tone={look.tone} size={46}><look.icon className="h-[22px] w-[22px]" /></Emblem>}
          <div className="min-w-0">
            {eyebrow && <div className="lv-ribbon mb-1">{eyebrow}</div>}
            <h1 className="lv-title-banner text-[25px] leading-tight">{title}</h1>
          </div>
        </div>
        {children && (
          <button className={cn('lv-info shrink-0', info && 'on')} onClick={() => setInfo(!info)} aria-label="What is this?" aria-expanded={info} data-testid="page-info">i</button>
        )}
      </div>
      {actions && <HeaderActions>{actions}</HeaderActions>}
      {children && info && (
        <motion.div className="lv-speech text-[13.5px] leading-snug" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}>{children}</motion.div>
      )}
    </header>
    );
  }
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
