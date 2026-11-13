// The app's HUD: your avatar and level, live USD rent, Ink and the bell. On the map it's two rows (you, your full
// earnings and the boost; then the map's buttons); at the top of the Play hub it's one. Other screens are full
// screen without it. Tapping your avatar drops down everything you can do with your profile.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Bell, ChevronRight, Copy, Gift, Home, LayoutGrid, LifeBuoy, LogOut, Package, Pencil, Settings, Shirt, Sparkles, User } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getBackend } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { LiveUsd, WalletDialog, useRent } from '../rent/RentHud';
import { CurrencyIcon, Emblem, GameDisc, PlayerAvatar, type DiscTone } from '../ui';
import { BellCard, useUpdatesCount } from '../updates/Notifications';
import { useHudCard } from './radial';

export default function GameHud({ overlay, after }: { overlay?: boolean; after?: ReactNode }) {
  const me = useOnboardedMe();
  const { rent, offset } = useRent();
  const [wallet, setWallet] = useState(false);
  const card = useHudCard((s) => s.card);
  const toggle = useHudCard((s) => s.toggle);
  const close = useHudCard((s) => s.close);
  const loc = useLocation();
  useEffect(() => close(), [loc.pathname, close]);
  const narrow = typeof innerWidth === 'number' && innerWidth < 370;
  return (
    <div className={cn(overlay ? 'lv-hudbar-clear pointer-events-none' : 'relative z-30')} data-testid="game-hud">
      <div className={cn('flex items-center gap-2 pb-2 pt-[max(10px,env(safe-area-inset-top,0px))] [&>*]:pointer-events-auto', overlay ? 'pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))]' : 'px-0.5')}>
        {me ? (
          <button className="relative mb-2 shrink-0" onClick={() => { buzz('light'); toggle('me'); }} aria-label={`Your profile — level ${me.artist_level}, ${me.plot_count} plots`} aria-expanded={card === 'me'} data-testid="hud-avatar">
            <span className={cn('lv-hud-avatar block', card === 'me' && 'open')}><PlayerAvatar p={me.profile} size={48} className="!rounded-[16px]" /></span>
            <span className="lv-hud-tag" aria-hidden><b>LV {me.artist_level}</b><i />{fmt(me.plot_count)}<Home className="h-[9px] w-[9px]" /></span>
          </button>
        ) : (
          <Link to="/welcome" className="lv-btn hot h-10 px-4 text-sm">Play</Link>
        )}
        {me && rent && (
          <button className="lv-hud lv-money min-w-0 shrink" onClick={() => setWallet(true)} data-testid="hud-rent" aria-label="USD rent">
            <CurrencyIcon kind="usd" />
            {/* your earnings, every digit ticking */}
            <LiveUsd rent={rent} offset={offset} dim decimals={narrow ? 8 : 10} className="truncate tnum" />
          </button>
        )}
        {me && <InkPill />}
        {after}
        <div className="flex-1 !pointer-events-none" />
        {me && <BellDisc />}
      </div>
      {/* the hub: your menu and the bell drop down right here (the map shows them under its own row) */}
      {!overlay && (
        <div className="absolute inset-x-0 top-full z-40 px-0.5">
          <AnimatePresence>{card === 'me' && <ProfileMenu key="me" />}</AnimatePresence>
          <AnimatePresence>{card === 'bell' && <BellCard key="bell" onClose={close} />}</AnimatePresence>
        </div>
      )}
      <WalletDialog open={wallet} onOpenChange={setWallet} />
    </div>
  );
}

/** your Ink: tap for ways to earn more */
export function InkPill() {
  const me = useOnboardedMe();
  if (!me) return null;
  return (
    <Link to="/play" className="lv-hud shrink-0" aria-label="Ink — win minigames to earn more" data-testid="hud-ink">
      <CurrencyIcon kind="ink" />
      <span className="tnum">{fmt(Math.floor(Number(me.balances.ink ?? 0)))}</span>
    </Link>
  );
}

/** the bell as a medallion; it fills and opens the notifications card */
export function BellDisc() {
  const count = useUpdatesCount();
  const card = useHudCard((s) => s.card);
  const toggle = useHudCard((s) => s.toggle);
  return (
    <GameDisc tone="azure" size={42} on={card === 'bell'} badge={count ? (count > 9 ? '9+' : count) : undefined}
      onClick={() => { buzz('light'); toggle('bell'); }} aria-label={count ? `Updates, ${count} new` : 'Updates'} aria-expanded={card === 'bell'} data-testid="notification-bell">
      <Bell className="h-[19px] w-[19px]" />
    </GameDisc>
  );
}

// ---- your profile menu -----------------------------------------------------------------------------------------
type Item = { to?: string; label: string; sub?: string; icon: typeof User; tone: DiscTone; onClick?(): void; testid?: string };

export function ProfileMenu() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const close = useHudCard((s) => s.close);
  if (!me) return null;
  const u = me.profile.username;
  const link = `https://landvas.app/u/${u}`;
  const go = (to: string) => { close(); nav(to); };
  const big: Item[] = [
    { to: `/u/${u}`, label: 'My profile', sub: 'What others see', icon: User, tone: 'violet', testid: 'menu-profile' },
    { to: `/u/${u}/home`, label: 'My home', sub: 'Your room', icon: Home, tone: 'emerald', testid: 'menu-home' },
    { to: '/plots', label: 'My plots', sub: `${fmt(me.plot_count)} owned`, icon: LayoutGrid, tone: 'azure', testid: 'menu-plots' },
    { to: '/explorer', label: 'My explorer', sub: 'Your look', icon: Shirt, tone: 'rose', testid: 'menu-explorer' },
  ];
  const rows: Item[] = [
    { to: '/me', label: 'Edit profile', icon: Pencil, tone: 'steel' },
    { to: '/achievements', label: 'Badges', sub: `${fmt(me.achievement_count)} earned`, icon: Award, tone: 'gold' },
    { to: '/inventory', label: 'Studio & shop', icon: Package, tone: 'ember' },
    { to: '/invite', label: 'Invite friends', sub: 'Up to 1,500 Ink each', icon: Gift, tone: 'teal' },
    { to: '/grimoire', label: 'Grimoire', icon: Sparkles, tone: 'violet' },
    { to: '/settings', label: 'Settings', icon: Settings, tone: 'steel' },
    { to: '/support', label: 'Help & support', icon: LifeBuoy, tone: 'steel' },
  ];
  return (
    <motion.div className="lv-mcard t-violet pointer-events-auto mt-1 w-[min(360px,100%)]" data-testid="profile-menu"
      initial={{ opacity: 0, scale: 0.7, y: -14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -10, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }} style={{ transformOrigin: '22px 0' }}>
      <div className="flex items-center gap-3">
        <span className="lv-hud-avatar open shrink-0"><PlayerAvatar p={me.profile} size={52} className="!rounded-[17px]" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[19px] font-black leading-tight">{me.profile.display_name || u}</div>
          <div className="truncate text-[12px] font-semibold text-white/60">@{u} · Level {me.artist_level}</div>
        </div>
        <button className="lv-x" aria-label="Share my profile" data-testid="menu-share" onClick={async () => {
          try { if (navigator.share) { await navigator.share({ title: `@${u} on LANDVAS`, url: link }); return; } } catch { return; /* cancelled */ }
          await navigator.clipboard?.writeText(link).catch(() => {}); toast.success('Profile link copied');
        }}>
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {big.map((i) => (
          <button key={i.label} className="lv-menutile" onClick={() => go(i.to!)} data-testid={i.testid}>
            <Emblem tone={i.tone} size={38}><i.icon className="h-[18px] w-[18px]" /></Emblem>
            <span className="min-w-0 text-left"><b>{i.label}</b><i>{i.sub}</i></span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid">
        {rows.map((i) => (
          <button key={i.label} className="lv-menurow" onClick={() => go(i.to!)}>
            <Emblem tone={i.tone} size={30}><i.icon className="h-[15px] w-[15px]" /></Emblem>
            <span className="min-w-0 flex-1 text-left"><b>{i.label}</b>{i.sub && <i>{i.sub}</i>}</span>
            <ChevronRight className="h-4 w-4 text-white/35" />
          </button>
        ))}
        <button className="lv-menurow bad" onClick={async () => { close(); await getBackend().signOut(); qc.clear(); nav('/welcome'); }} data-testid="menu-signout">
          <Emblem tone="crimson" size={30}><LogOut className="h-[15px] w-[15px]" /></Emblem>
          <span className="flex-1 text-left"><b>Sign out</b></span>
        </button>
      </div>
    </motion.div>
  );
}
