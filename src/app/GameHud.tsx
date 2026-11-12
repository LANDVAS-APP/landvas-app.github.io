// The app's top bar on every screen (except the map, which has its own): your avatar and level, live USD rent,
// Ink, the menu and the bell — chunky, always in the same place, like any mobile game's HUD.
// Plus the game menu: every place in LANDVAS as a big tile, one tap away.
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { uiSound } from '../native/uiSound';
import { LiveUsd, WalletDialog, useRent } from '../rent/RentHud';
import { PlayerAvatar, ResourceIcon } from '../ui';
import { NotificationBell } from '../updates/Notifications';
import { useClaimables } from './claimables';
import { SECTIONS, goBack, isRootPage } from './Shell';

export default function GameHud({ children }: { children?: ReactNode }) {
  const me = useOnboardedMe();
  const { rent, offset } = useRent();
  const [wallet, setWallet] = useState(false);
  const [menu, setMenu] = useState(false);
  const claim = useClaimables();
  const loc = useLocation();
  const nav = useNavigate();
  const deep = !isRootPage(loc.pathname);
  useEffect(() => setMenu(false), [loc.pathname]);
  // pull-to-refresh sits just under the HUD, whatever its height
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => document.documentElement.style.setProperty('--hud-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="lv-hudbar sticky top-0 z-40" data-testid="game-hud">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top,0px))]">
        {deep && (
          <button className="lv-gbtn round !h-10 !w-10 shrink-0" onClick={() => goBack(nav as (to: string | number) => void, loc.pathname)} aria-label="Back" data-testid="hud-back">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {me ? (
          <Link to="/me" className="relative shrink-0" aria-label="Your profile">
            <span className="lv-hud-avatar block"><PlayerAvatar p={me.profile} size={40} /></span>
            <span className="lv-hud-level" aria-label={`Level ${me.artist_level}`}>{me.artist_level}</span>
          </Link>
        ) : (
          <Link to="/welcome" className="lv-gbtn on h-10 px-4 text-sm">Play</Link>
        )}
        {me && rent && (
          <button className="lv-hud min-w-0 shrink" onClick={() => setWallet(true)} data-testid="hud-rent" aria-label="USD rent">
            <span className="ico bg-[linear-gradient(180deg,#5ef2a6,#16a86b)] text-[13px] font-black text-white">$</span>
            <LiveUsd rent={rent} offset={offset} decimals={typeof innerWidth === 'number' && innerWidth < 370 ? 4 : 6} className="truncate tnum" />
          </button>
        )}
        {me && (
          <Link to="/play" className="lv-hud shrink-0" aria-label="Ink — win minigames to earn more" data-testid="hud-ink">
            <span className="ico bg-[linear-gradient(180deg,#5fd0ff,#1f7bff)]"><ResourceIcon r="ink" className="h-4 w-4 [&_path]:fill-white" /></span>
            <span className="tnum">{fmt(Math.floor(Number(me.balances.ink ?? 0)))}</span>
          </Link>
        )}
        <div className="flex-1" />
        <button className="lv-gbtn round !h-10 !w-10 relative" onClick={() => { setMenu(true); uiSound.tab(); }} aria-label="Menu" data-testid="hud-menu">
          <Menu className="h-5 w-5" />
          {claim.count > 0 && <span className="lv-bang" aria-label="Something to claim">!</span>}
        </button>
        <NotificationBell size="sm" className="lv-gbtn round !h-10 !w-10" />
      </div>
      {children}
      <WalletDialog open={wallet} onOpenChange={setWallet} />
      <AnimatePresence>{menu && <GameMenu onClose={() => setMenu(false)} />}</AnimatePresence>
    </div>
  );
}

// ---- the menu ------------------------------------------------------------------------------------
const ICON: Record<string, string> = {
  '/world': '🗺️', '/plots': '🏡', '/canvases': '🎨', '/challenges': '🏆', '/sketch': '✏️', '/duet': '🎭', '/inventory': '🛍️',
  '/inkborn': '🐾', '/inkborn/create': '✨', '/habitat': '🌳', '/inkborn/visit': '🚪', '/space': '🚀', '/space/play/asteroids': '☄️',
  '/space/play/lander': '🌙', '/play': '🎮', '/pvp': '⚔️', '/doodle': '🖍️', '/events': '🎉', '/leaderboards': '🏅', '/social': '💬',
  '/clans': '🛡️', '/gallery': '🖼️', '/players': '👥', '/invite': '🎁', '/me': '😎', '/achievements': '🎖️', '/explorer': '🧭',
  '/grimoire': '📖', '/royalty': '👑', '/guide': '📘', '/settings': '⚙️', '/support': '🛟',
};
const COLOR: Record<string, string> = {
  '/world': '#2F7BFF', '/canvases': '#FF4D6D', '/inkborn': '#3DDC97', '/space': '#7B5CFF', '/play': '#FF9F1C', '/social': '#22C7B5', '/me': '#FF4FD8',
};
const MORE = { to: '/me', label: 'You', pages: [
  { to: '/me', label: 'Me' }, { to: '/achievements', label: 'Badges' }, { to: '/explorer', label: 'Explorer' }, { to: '/grimoire', label: 'Grimoire' },
  { to: '/royalty', label: 'Royalty' }, { to: '/guide', label: 'Guide' }, { to: '/settings', label: 'Settings' }, { to: '/support', label: 'Help' },
] };

function GameMenu({ onClose }: { onClose(): void }) {
  const loc = useLocation();
  const simple = useUi((s) => !!s.settings.simpleMode);
  const update = useUi((s) => s.updateSettings);
  const claim = useClaimables();
  const me = useOnboardedMe();
  const groups = simple
    ? [{ to: '/world', label: 'Simple mode', pages: [{ to: '/world', label: 'Home' }, { to: '/play', label: 'Play' }] }, MORE]
    : [...SECTIONS.map((s) => ({ to: s.to, label: s.label, pages: s.pages })), MORE];
  const badge = (to: string) => (to === '/world' ? claim.count : 0);
  return (
    <motion.div className="lv-menu fixed inset-0 z-[70] overflow-y-auto overscroll-contain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} data-testid="game-menu">
      <div className="mx-auto max-w-lg px-4 pb-[calc(110px+env(safe-area-inset-bottom,0px))] pt-[max(14px,env(safe-area-inset-top,0px))]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="lv-title-banner text-2xl">Menu</h2>
          <button className="lv-gbtn round !h-11 !w-11" onClick={onClose} aria-label="Close menu" data-testid="menu-close"><X className="h-5 w-5" /></button>
        </div>
        {claim.count > 0 && (
          <Link to="/world" className="lv-gbtn hot mb-4 flex w-full justify-between px-4 py-3 text-left" onClick={() => buzz('medium')} data-testid="menu-claim">
            <span className="text-[15px]">🎁 {claim.streak && claim.spin ? 'Daily reward + a free spin' : claim.streak ? 'Your daily reward is ready' : 'A free wheel spin is waiting'}</span>
            <span className="text-sm opacity-90">Claim →</span>
          </Link>
        )}
        {groups.map((g, gi) => (
          <motion.section key={g.label} className="mb-5" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * gi, type: 'spring', stiffness: 380, damping: 30 }}>
            <h3 className="mb-2 px-1 font-display text-[13px] font-black uppercase tracking-[0.14em]" style={{ color: COLOR[g.to] ?? '#c9b8ff' }}>{g.label}</h3>
            <div className="grid grid-cols-4 gap-2.5">
              {g.pages.map((p) => {
                const on = loc.pathname === p.to;
                return (
                  <Link key={p.to} to={p.to} data-sound="tab" className={cn('lv-tile', on && 'on')} style={{ ['--tile' as string]: COLOR[g.to] ?? '#7B5CFF' }} data-testid={`menu-${p.to}`}>
                    <span className="em" aria-hidden>{ICON[p.to] ?? '⭐'}</span>
                    <span className="lbl">{p.label}</span>
                    {badge(p.to) > 0 && <span className="lv-bang">!</span>}
                  </Link>
                );
              })}
            </div>
          </motion.section>
        ))}
        {simple ? (
          <button className="lv-gbtn on h-12 w-full text-[15px]" onClick={() => { update({ simpleMode: false }); onClose(); }} data-testid="menu-full-game">🗺️ Switch to the full game</button>
        ) : me?.roles?.includes('owner') ? (
          <Link to="/admin" className="lv-gbtn h-11 w-full text-sm">🛡️ Admin</Link>
        ) : null}
      </div>
    </motion.div>
  );
}
