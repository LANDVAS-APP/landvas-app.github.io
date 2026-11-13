// The app's Play tab: the game's main menu. You and your money up top, today's rewards (the daily check-in lives
// here, not on the map), the World as the hero, every part of the game as a card, and an "Everything" grid so
// nothing is more than two taps away.
import { useQuery } from '@tanstack/react-query';
import {
  Award, BookOpen, Brush, CalendarDays, ChevronRight, Compass, Crown, DoorOpen, Gamepad2, Gift, Globe2, Images, LayoutGrid, LifeBuoy,
  MessagesSquare, Moon, Package, Palette, PawPrint, PenLine, Rocket, Settings, Shield, Smile, Sparkles, Swords, Theater, Trees, Trophy, Users, Zap,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import type { DailyStatus } from '../backend/types';
import { StreakDialog, useStreakPrompt } from '../daily/Streak';
import { DailyWheel } from '../earn/DailyWheel';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { poll } from '../lib/poll';
import { buzz } from '../native/native';
import { useQuickRoll } from '../simple/useQuickRoll';
import { Emblem, type DiscTone } from '../ui';
import GameHud from './GameHud';
import { Page, SECTIONS } from './Shell';

type Card = { to: string; title: string; sub: string; icon: LucideIcon; tone: DiscTone };
const CARDS: Card[] = [
  { to: '/canvases', title: 'Create', sub: 'Paint your plots', icon: Brush, tone: 'rose' },
  { to: '/inkborn', title: 'Inkborn', sub: 'Hatch & raise creatures', icon: PawPrint, tone: 'emerald' },
  { to: '/play', title: 'Play & Earn', sub: 'Minigames for Ink', icon: Gamepad2, tone: 'ember' },
  { to: '/pvp', title: 'PvP', sub: 'Duel other players', icon: Swords, tone: 'crimson' },
  { to: '/space', title: 'Space', sub: 'Fly missions', icon: Rocket, tone: 'violet' },
  { to: '/events', title: 'Events', sub: 'Limited-time fun', icon: CalendarDays, tone: 'azure' },
  { to: '/social', title: 'Community', sub: 'Friends, chat & clans', icon: MessagesSquare, tone: 'teal' },
  { to: '/leaderboards', title: 'Ranks', sub: 'See who’s on top', icon: Trophy, tone: 'gold' },
];

const PAGE_ICON: Record<string, LucideIcon> = {
  '/world': Globe2, '/plots': LayoutGrid, '/canvases': Palette, '/challenges': Trophy, '/sketch': PenLine, '/duet': Theater, '/inventory': Package,
  '/inkborn': PawPrint, '/inkborn/create': Sparkles, '/habitat': Trees, '/inkborn/visit': DoorOpen, '/space': Rocket, '/space/play/asteroids': Zap,
  '/space/play/lander': Moon, '/play': Gamepad2, '/pvp': Swords, '/doodle': Brush, '/events': CalendarDays, '/leaderboards': Award, '/social': MessagesSquare,
  '/clans': Shield, '/gallery': Images, '/players': Users, '/invite': Gift, '/me': Smile, '/achievements': Award, '/explorer': Compass,
  '/grimoire': BookOpen, '/royalty': Crown, '/guide': BookOpen, '/settings': Settings, '/support': LifeBuoy,
};
const GROUP_TONE: Record<string, DiscTone> = { '/world': 'azure', '/canvases': 'rose', '/inkborn': 'emerald', '/space': 'violet', '/play': 'ember', '/social': 'teal', '/me': 'gold' };
const YOU = { to: '/me', label: 'You', pages: [
  { to: '/me', label: 'Profile' }, { to: '/achievements', label: 'Badges' }, { to: '/explorer', label: 'Explorer' }, { to: '/grimoire', label: 'Grimoire' },
  { to: '/royalty', label: 'Royalty' }, { to: '/guide', label: 'Guide' }, { to: '/settings', label: 'Settings' }, { to: '/support', label: 'Help' },
] };

const rise = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 12) * 0.035, type: 'spring' as const, stiffness: 420, damping: 32 } });

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function GameHub() {
  const me = useOnboardedMe();
  const on = !!me;
  const daily = useQuery({ queryKey: ['daily'], queryFn: api.dailyStatus, enabled: on, staleTime: 5 * 60_000 });
  const wheel = useQuery({ queryKey: ['wheel'], queryFn: api.wheelStatus, enabled: on, staleTime: 5 * 60_000 });
  const today = useQuery({ queryKey: ['earned-today'], queryFn: api.myEarningsToday, enabled: on, refetchInterval: poll(60_000) });
  const [streakOpen, setStreakOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  // the daily check-in opens here once a day (the map leaves it to the Play tab)
  useStreakPrompt(() => setStreakOpen(true));
  const quick = useQuickRoll();
  const d = daily.data as DailyStatus | undefined;
  const streakReady = !!d?.enabled && (!d.claimed_today || (d.tickets?.length ?? 0) > 0);
  const spins = wheel.data?.enabled ? Number(wheel.data.spins_left ?? 0) : 0;
  const earned = Math.floor(Number(today.data?.total ?? 0));
  const name = me ? (me.profile.display_name || me.profile.username) : '';
  let n = 0;

  return (
    <Page>
      <div className="lv-hub mx-auto max-w-lg" data-testid="game-hub">
        {/* you: the same HUD as the map, here at the top of the menu */}
        {me && <GameHud />}
        <motion.div {...rise(n++)} className="mb-3.5 mt-1 flex items-end justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-muted">{greeting()}{name ? ',' : ''}</div>
            <h1 className="lv-hub-title truncate">{name || 'Welcome to LANDVAS'}</h1>
          </div>
          {me && (
            <div className="flex shrink-0 gap-1.5">
              <span className="lv-stat"><b className="tnum">{me.artist_level}</b><i>Level</i></span>
              <span className="lv-stat"><b className="tnum">{fmt(me.plot_count)}</b><i>Plots</i></span>
            </div>
          )}
        </motion.div>

        {/* today's rewards: always here, lit up when there's something to grab */}
        {me && (d?.enabled || wheel.data?.enabled) && (
          <motion.div {...rise(n++)} className="mb-3 grid grid-cols-2 gap-2.5" data-testid="hub-daily">
            {d?.enabled && (
              <button className={cn('lv-pdaily t-ember', streakReady && 'ready')} onClick={() => { buzz('light'); setStreakOpen(true); }} data-testid="hub-streak">
                <Emblem tone="ember" size={42}><span className="text-[20px] leading-none">🔥</span></Emblem>
                <span className="min-w-0 text-left">
                  <span className="t">{streakReady ? 'Daily reward' : `Day ${d.streak} streak`}</span>
                  <span className="s">{streakReady ? <b>CLAIM</b> : 'Back tomorrow'}</span>
                </span>
              </button>
            )}
            {wheel.data?.enabled && (
              <button className={cn('lv-pdaily t-violet', spins > 0 && 'ready')} onClick={() => { buzz('light'); setWheelOpen(true); }} data-testid="hub-spin">
                <Emblem tone="violet" size={42}><span className="text-[20px] leading-none">🎡</span></Emblem>
                <span className="min-w-0 text-left">
                  <span className="t">{spins > 0 ? 'Free spin' : 'Daily wheel'}</span>
                  <span className="s">{spins > 0 ? <b>{spins > 1 ? `${spins} SPINS` : 'SPIN'}</b> : 'Resets daily'}</span>
                </span>
              </button>
            )}
          </motion.div>
        )}

        {/* the world: the heart of the game */}
        <motion.div {...rise(n++)}>
          <Link to="/world" className="lv-hero mb-3" data-sound="tab" data-testid="hub-world">
            <span className="grid-art" aria-hidden />
            <span className="pin p1" aria-hidden /><span className="pin p2" aria-hidden /><span className="pin p3" aria-hidden />
            <span className="relative flex h-full flex-col justify-between">
              <span className="flex items-center gap-2.5">
                <Emblem tone="azure" size={44}><Globe2 className="h-[22px] w-[22px]" /></Emblem>
                <span className="kicker">The World</span>
              </span>
              <span>
                <span className="block font-display text-[26px] font-black leading-none tracking-tight">Explore & claim land</span>
                <span className="mt-1.5 block text-[13px] font-semibold text-white/70">{me ? `${fmt(me.plot_count)} plot${me.plot_count === 1 ? '' : 's'} earning rent · roll for more` : 'Real places, real rent'}</span>
              </span>
            </span>
            <span className="go">Enter <ChevronRight className="h-4 w-4" /></span>
          </Link>
        </motion.div>

        {/* every part of the game */}
        <div className="mb-6 grid grid-cols-2 gap-2.5" data-testid="hub-cards">
          {CARDS.map((c) => {
            const Icon = c.icon;
            const sub = c.to === '/play' && earned > 0 ? `+${fmt(earned)} Ink today` : c.sub;
            return (
              <motion.div key={c.to} {...rise(n++)}>
                <Link to={c.to} data-sound="tab" className={cn('lv-pcard', `t-${c.tone}`)} data-testid={`hub-${c.to}`}>
                  <Emblem tone={c.tone} size={50}><Icon className="h-6 w-6" /></Emblem>
                  <span className="mt-auto block min-w-0">
                    <span className="block font-display text-[17px] font-black leading-tight">{c.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] font-semibold text-white/60">{sub}</span>
                  </span>
                  <span className="chev" aria-hidden><ChevronRight className="h-3.5 w-3.5" /></span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* everything, at a glance */}
        <motion.h2 {...rise(n++)} className="mb-2.5 px-0.5 font-display text-[17px] font-black">Everything</motion.h2>
        <div className="grid gap-3" data-testid="hub-all">
          {[...SECTIONS.map((s) => ({ to: s.to, label: s.label, pages: s.pages })), YOU].map((g) => {
            const tone = GROUP_TONE[g.to] ?? 'steel';
            return (
              <motion.section key={g.label} {...rise(n++)} className={cn('lv-allgroup', `t-${tone}`)}>
                <h3>{g.label}</h3>
                <div className="grid grid-cols-4 gap-x-1 gap-y-3">
                  {g.pages.map((p) => {
                    const Icon = PAGE_ICON[p.to] ?? Sparkles;
                    return (
                      <Link key={p.to} to={p.to} data-sound="tab" className="lv-alltile" data-testid={`hub-all-${p.to}`}>
                        <Emblem tone={tone} size={46}><Icon className="h-5 w-5" /></Emblem>
                        <span className="lb">{p.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
          {me?.roles?.includes('owner') && <Link to="/admin" className="lv-btn h-11 w-full text-sm"><Shield className="h-4 w-4" /> Admin</Link>}
        </div>
      </div>
      {me && <StreakDialog open={streakOpen} onOpenChange={setStreakOpen} onRoll={(o) => { setStreakOpen(false); void quick.roll(o); }} />}
      {me && <DailyWheel open={wheelOpen} onOpenChange={setWheelOpen} />}
      {me && quick.element}
    </Page>
  );
}
