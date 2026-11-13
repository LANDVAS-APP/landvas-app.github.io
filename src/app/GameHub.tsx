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
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { DailyStatus } from '../backend/types';
import { StreakDialog, useStreakPrompt } from '../daily/Streak';
import { DailyWheel } from '../earn/DailyWheel';
import { useOnboardedMe, useWorld } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { poll } from '../lib/poll';
import { buzz } from '../native/native';
import { useQuickRoll } from '../simple/useQuickRoll';
import { Emblem, ResourceIcon, type DiscTone } from '../ui';
import { qk } from '../lib/queries';
import { useUi } from '../lib/store';
import { PLOT_TYPES } from '../map/plotStyle';
import { ORDER } from '../play/PlayHub';
import { GamePreview } from '../play/GamePreview';
import { GAME_INFO } from '../shared/minigames';
import { rarityInfo } from '../shared/rarity';
import { Z_PLOT, cellCenter } from '../shared/grid';
import { UltraTracker } from '../ultra/UltraTracker';
import { PlotWorlds } from '../play/PlotWorlds';
import { activeBoost, fullClearInk } from '../play/rates';
import { Footprints } from 'lucide-react';
import GameHud from './GameHud';
import { Page, SECTIONS } from './Shell';
import { NATIVE_APP } from './buildFlags';

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

        {/* your plot games: every plot type you own — play its game, or step into your best plot of it */}
        {me && <PlotGames />}
        {me && <PlotWorlds />}
        {me && <UltraTracker />}

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
          {!NATIVE_APP && me?.roles?.includes('owner') && <Link to="/admin" className="lv-btn h-11 w-full text-sm"><Shield className="h-4 w-4" /> Admin</Link>}
        </div>
      </div>
      {me && <StreakDialog open={streakOpen} onOpenChange={setStreakOpen} onRoll={(o) => { setStreakOpen(false); void quick.roll(o); }} />}
      {me && <DailyWheel open={wheelOpen} onOpenChange={setWheelOpen} />}
      {me && quick.element}
    </Page>
  );
}

/** one card per plot type you own: its minigame on your highest-level plot of that type, or into that plot —
 *  with what a clear pays, today's paid runs (or "No limit"), and games that are maxed for today at the bottom */
function PlotGames() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const world = useWorld();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me, staleTime: 60_000 });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me, staleTime: 60_000 });
  const progress = useQuery({ queryKey: qk.plotProgress, queryFn: api.myPlotProgress, enabled: !!me, staleTime: 60_000 });
  const unlimited = world.data?.minigames?.limit_paid_runs === false;
  const limit = records.data?.daily_rewarded_wins_per_game ?? 6;
  const cfg = world.data?.minigames?.games ?? {};
  const rows = ORDER.filter(({ game }) => cfg[game]?.enabled !== false).map(({ game, type }) => {
    const maxLevel = Number(cfg[game]?.max_level ?? world.data?.minigames?.max_level ?? 60);
    const done = (p: { gx: number; gy: number }) => (progress.data?.[`${p.gx}_${p.gy}`]?.highest_level ?? 0) >= maxLevel;
    const mine = ((plots.data ?? []) as { gx: number; gy: number; plot_type: string; level: number; rarity: string }[]).filter((p) => p.plot_type === type);
    // the highest-level plot that still has levels to beat (a plot that beat them all goes last)
    const best = [...mine].sort((a, b) => Number(done(a)) - Number(done(b)) || b.level - a.level || rarityInfo(b.rarity).ink_reward_multiplier - rarityInfo(a.rarity).ink_reward_multiplier)[0];
    const left = unlimited ? Infinity : Math.max(0, limit - (records.data?.rewarded_today?.[game] ?? 0));
    const allDone = mine.length > 0 && mine.every(done);
    const lvl = best ? Math.min((progress.data?.[`${best.gx}_${best.gy}`]?.highest_level ?? 0) + 1, maxLevel) : 1;
    return { game, type, count: mine.length, best, left, maxed: left === 0 || allDone, allDone, pay: best ? fullClearInk(world.data, game, lvl, best) : 0, boost: activeBoost(world.data, game) };
  }).filter((r) => r.count > 0)
    .sort((a, b) => Number(a.maxed) - Number(b.maxed) || (b.boost?.multiplier ?? 1) - (a.boost?.multiplier ?? 1));
  if (!rows.length) return null;
  const enter = (b: { gx: number; gy: number }) => {
    buzz('medium');
    const [lng, lat] = cellCenter(b.gx, b.gy);
    nav('/world');
    // fly down into it and open its card (the map picks this up when it's ready)
    setTimeout(() => { useUi.getState().requestFly({ lng, lat, zoom: Z_PLOT + 1 }); useUi.getState().select({ gx: b.gx, gy: b.gy }); }, 350);
  };
  return (
    <motion.section {...rise(14)} className="mb-6" data-testid="hub-plot-games">
      <h2 className="mb-2.5 flex items-baseline justify-between px-0.5 font-display text-[17px] font-black">Your plot games
        <span className="text-[11.5px] font-bold text-white/45">{unlimited ? 'Paid runs: no limit today' : `${limit} paid runs a game, every day`}</span></h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {rows.map(({ game, type, count, best, left, maxed, allDone, pay, boost }) => {
          const t = PLOT_TYPES[type];
          return (
            <motion.div layout key={game} className={cn('lv-plotgame', maxed && 'maxed', boost && 'boosted')} style={{ ['--a' as string]: t.a, ['--b' as string]: t.b }} data-testid={`hub-game-${game}`} data-maxed={maxed || undefined}>
              <GamePreview game={game} size={54} className="shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[16px] font-black">{GAME_INFO[game].name}{boost ? <span className="ml-1.5 rounded-full bg-[#FFC93D] px-1.5 py-0.5 align-middle text-[10px] font-black text-[#2a1800]">{boost.multiplier}×</span> : null}</div>
                <div className="truncate text-[11.5px] font-semibold text-white/55">{t.name} · {count} plot{count === 1 ? '' : 's'} · best level {best!.level}</div>
                <div className="mt-1 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-extrabold tnum">
                  {allDone ? <span className="text-[#3DDC97]">All levels beaten</span> : <span className="inline-flex items-center gap-0.5 text-[#9CF7C9]"><ResourceIcon r="ink" className="h-3.5 w-3.5" />+{fmt(pay)} a clear</span>}
                  <span className={cn('rounded-full px-1.5 py-0.5', unlimited ? 'bg-[#34C3FF]/20 text-[#9BE1FF]' : left === 0 ? 'bg-white/10 text-white/50' : 'bg-white/10 text-white/75')} data-testid={`hub-runs-${game}`}>
                    {unlimited ? 'No limit' : left === 0 ? 'Maxed today' : `${left}/${limit} runs`}
                  </span>
                </div>
              </div>
              <button className="lv-pgbtn enter" onClick={() => enter(best!)} aria-label={`Enter your best ${t.name} plot`} data-testid={`hub-enter-${game}`}><Footprints className="h-4 w-4" /></button>
              <button className="lv-pgbtn play" onClick={() => { buzz('light'); nav(`/play/${game}?gx=${best!.gx}&gy=${best!.gy}`); }} data-testid={`hub-play-${game}`}>Play</button>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
