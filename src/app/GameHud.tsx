// The app's HUD: your avatar and level, live USD rent, Ink and the bell. On the map it's two rows (you, your full
// earnings and the boost; then the map's buttons); at the top of the Play hub it's one. Other screens are full
// screen without it. Tapping your avatar drops down everything you can do with your profile.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Bell, ChevronRight, Copy, Gift, Home, LayoutGrid, LifeBuoy, LogOut, Package, Pencil, Settings, Shirt, Sparkles, User } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getBackend } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { BoostCard, BoostChip, LiveUsd, WalletDialog, useRent } from '../rent/RentHud';
import { liveRent, type RentState } from '../shared/rent';
import { CurrencyIcon, Emblem, GameDisc, PlayerAvatar, type DiscTone } from '../ui';
import { BellCard, useUpdatesCount } from '../updates/Notifications';
import { OrbGlyph } from '../ui/OrbGlyph';
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
  // earnings and Ink share one type size, worked out from the room the row has, so both always fit
  const row = useRef<HTMLDivElement>(null);
  // the room the two numbers share: the row's width minus everything that isn't one of them (measured, not guessed)
  const [room, setRoom] = useState<{ px: number; font: string } | null>(null);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const kids = [...el.children].filter((k) => (k as HTMLElement).offsetWidth > 0 && !k.classList.contains('flex-1')) as HTMLElement[];
      let used = (parseFloat(cs.columnGap) || 0) * Math.max(0, kids.length - 1);
      let font = '';
      for (const k of kids) {
        const w = k.getBoundingClientRect().width;
        const num = k.querySelector<HTMLElement>('[data-hud-num]');
        if (num) { used += w - num.getBoundingClientRect().width; const f = getComputedStyle(num); font ||= `${f.fontWeight} 100px ${f.fontFamily}`; } else used += w;
      }
      setRoom({ px: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - used, font });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [!!me, !!rent, !!after]); // eslint-disable-line react-hooks/exhaustive-deps
  const inkText = fmt(Math.floor(Number(me?.balances.ink ?? 0)));
  const fit = rent ? fitHud(room, rent, offset, inkText) : null;
  return (
    <div className={cn(overlay ? 'lv-hudbar-clear pointer-events-none' : 'relative z-30')} data-testid="game-hud">
      <div ref={row} className={cn('flex items-center gap-1.5 pb-4 pt-[max(10px,env(safe-area-inset-top,0px))] [&>*]:pointer-events-auto', overlay ? 'pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))]' : 'px-0.5')}>
        {me ? (
          <button className="relative shrink-0" onClick={() => { buzz('light'); toggle('me'); }} aria-label={`Your profile — level ${me.artist_level}, ${me.plot_count} plots`} aria-expanded={card === 'me'} data-testid="hud-avatar">
            <span className={cn('lv-hud-avatar block', card === 'me' && 'open')}><PlayerAvatar p={me.profile} size={48} className="!rounded-[16px]" /></span>
            <HudTag level={me.artist_level} plots={me.plot_count} />
          </button>
        ) : (
          <Link to="/welcome" className="lv-btn hot h-10 px-4 text-sm">Play</Link>
        )}
        {me && rent && (
          <button className="lv-hud lv-money lv-fit" onClick={() => setWallet(true)} data-testid="hud-rent" aria-label="USD rent">
            <CurrencyIcon kind="usd" />
            {/* your earnings, every digit ticking — the text sizes itself to the room it has */}
            <LiveUsd key={fit!.decimals} rent={rent} offset={offset} dim decimals={fit!.decimals} className="lv-fit-text tnum" style={{ fontSize: fit!.fs }} data-hud-num />
          </button>
        )}
        {me && rent && <BoostChip />}
        {me && <InkPill fs={fit?.fs} />}
        {after}
        {!me && <div className="flex-1 !pointer-events-none" />}
        {me && <BellDisc />}
      </div>
      {/* the hub: your menu and the bell drop down right here (the map shows them under its own row) */}
      {!overlay && (
        <div className="absolute inset-x-0 top-full z-40 px-0.5">
          <AnimatePresence>{card === 'me' && <ProfileMenu key="me" />}</AnimatePresence>
          <AnimatePresence>{card === 'bell' && <BellCard key="bell" onClose={close} />}</AnimatePresence>
          <AnimatePresence>{card === 'boost' && <BoostCard key="boost" onClose={close} />}</AnimatePresence>
        </div>
      )}
      <WalletDialog open={wallet} onOpenChange={setWallet} />
    </div>
  );
}

/** one type size for the earnings and Ink that fits the row: the room left after the avatar, boost chip, bell, gaps and
 *  the pills' icons, shared by both numbers. As Ink grows the earnings drop a decimal or two rather than going tiny. */
let ruler: HTMLSpanElement | null = null;
/** a number's width in ems, measured in the real font with tabular figures (a hidden span, reused) */
const em = (text: string, font: string) => {
  if (typeof document === 'undefined' || !font) return text.length * 0.64;
  if (!ruler) {
    ruler = document.createElement('span');
    ruler.setAttribute('aria-hidden', 'true');
    ruler.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-variant-numeric:tabular-nums;letter-spacing:-0.01em';
    document.body.appendChild(ruler);
  }
  ruler.style.font = font;
  ruler.textContent = text;
  return ruler.getBoundingClientRect().width / 100;
};
function fitHud(room: { px: number; font: string } | null, rent: RentState, offset: number, ink: string) {
  if (!room) return { decimals: 10, fs: 12 };
  const whole = String(Math.floor(Math.max(0, liveRent(rent, Date.now() + offset))));
  const inkEm = em(ink.replace(/\d/g, '0'), room.font);
  for (let d = 10; d >= 6; d--) {
    const usdEm = em(`$${whole.replace(/\d/g, '0')}.${'0'.repeat(d)}`, room.font);
    const fs = (room.px - 3) / (usdEm + inkEm);
    if (fs >= 10.5 || d === 6) return { decimals: d, fs: Math.floor(Math.max(8.5, Math.min(13.5, fs)) * 10) / 10 };
  }
  return { decimals: 8, fs: 12 };
}

/** big numbers, short: 999 · 1.2k · 12k · 1.2M */
const short = (n: number) => (n < 1000 ? String(n) : n < 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n < 1_000_000 ? `${Math.floor(n / 1000)}k` : `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`);

/** level and plots under the avatar: always one tidy line, never wider than the avatar's lane */
function HudTag({ level, plots }: { level: number; plots: number }) {
  const lv = short(Math.max(0, Math.floor(level))), pl = short(Math.max(0, Math.floor(plots)));
  const len = lv.length + pl.length;
  return (
    <span className="lv-hud-tag" style={{ fontSize: len <= 5 ? 7.5 : len <= 6 ? 7 : 6.5 }} aria-hidden data-testid="hud-tag">
      <b>LV {lv}</b><i />{pl}<Home className="h-[8px] w-[8px] shrink-0" />
    </span>
  );
}

/** your Ink: tap for ways to earn more */
export function InkPill({ fs }: { fs?: number }) {
  const me = useOnboardedMe();
  if (!me) return null;
  // the number gets smaller as it grows, so any balance fits beside the bell
  const text = fmt(Math.floor(Number(me.balances.ink ?? 0)));
  const size = text.length <= 3 ? 13.5 : text.length <= 5 ? 12.5 : text.length <= 7 ? 11 : text.length <= 9 ? 9.5 : text.length <= 11 ? 8.5 : 7.5;
  return (
    <Link to="/play" className="lv-hud lv-inkpill shrink-0" aria-label={`Ink: ${text} — win minigames to earn more`} data-testid="hud-ink">
      <CurrencyIcon kind="ink" size={20} />
      <span className="tnum whitespace-nowrap leading-none" style={{ fontSize: fs ?? size }} data-hud-num>{text}</span>
    </Link>
  );
}

/** the bell as a medallion; it fills and opens the notifications card */
export function BellDisc() {
  const count = useUpdatesCount();
  const card = useHudCard((s) => s.card);
  const toggle = useHudCard((s) => s.toggle);
  return (
    <GameDisc tone="rose" size={34} className="lv-belldisc" on={card === 'bell'} badge={count ? (count > 9 ? '9+' : count) : undefined}
      onClick={() => { buzz('light'); toggle('bell'); }} aria-label={count ? `Updates, ${count} new` : 'Updates'} aria-expanded={card === 'bell'} data-testid="notification-bell">
      <OrbGlyph kind="bell" on={card === 'bell'} size={17} />
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
