// /play — Play & Earn: every way to earn Ink in one place. Today's progress up top, then
// "paint your plot, earn Ink", then the ways to earn grouped into Today · Games · Create ·
// Friends, and a history of everything you've made (sketches, duets, drawings) to share.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, Brush, Check, Clock, DoorOpen, Flame, Gamepad2, Gift, Lightbulb, Paintbrush, PenLine, RotateCw, Share2, Sparkles, Stamp, Star, Swords, Trophy, Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt, safeStorage, saveStorage, timeAgo } from '../lib/utils';
import { ResourceIcon, Spinner } from '../ui';
import { DailyWheel } from '../earn/DailyWheel';
import { StrokeView } from '../creative/SketchPad';
import { DuetView } from '../creative/DuetScreen';
import { shareDrawing } from '../creative/share';
import { MinigameGrid } from './PlayHub';

type Tab = 'today' | 'games' | 'create' | 'friends' | 'mine';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'games', label: 'Games' }, { id: 'create', label: 'Create' }, { id: 'friends', label: 'Friends' }, { id: 'mine', label: 'My creations' },
];

type Card = {
  key: string; icon: typeof Brush; color: string; title: string; text: string; reward?: string;
  status?: 'ready' | 'done' | null; today?: number; to?: string; onClick?(): void;
};

function useCountUp(target: number) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 1200);
      setV(Math.round(a + (target - a) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export default function PlayEarn() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const on = !!me;
  const earn = useQuery({ queryKey: ['earn'], queryFn: api.earnOverview, enabled: on, staleTime: 30_000 });
  const today = useQuery({ queryKey: ['earned-today'], queryFn: api.myEarningsToday, enabled: on, refetchInterval: 60_000 });
  const streak = useQuery({ queryKey: ['streak'], queryFn: api.myStreak, enabled: on, staleTime: 60_000 });
  const sketch = useQuery({ queryKey: ['sketch'], queryFn: api.sketchToday, staleTime: 60_000 });
  const pvp = useQuery({ queryKey: ['pvp'], queryFn: api.pvpLobby, enabled: on, staleTime: 30_000 });
  const doodle = useQuery({ queryKey: ['doodle'], queryFn: api.doodleMine, enabled: on, staleTime: 60_000 });
  const duets = useQuery({ queryKey: ['duets'], queryFn: api.duetsMine, enabled: on, staleTime: 60_000 });
  const refs = useQuery({ queryKey: ['referrals'], queryFn: api.myReferrals, enabled: on, staleTime: 5 * 60_000 });
  const [tab, setTabRaw] = useState<Tab>(() => safeStorage<Tab>('landvas.play.tab', 'today'));
  const setTab = (t: Tab) => { setTabRaw(t); saveStorage('landvas.play.tab', t); };
  const [wheel, setWheel] = useState(false);

  if (!me || earn.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const e = earn.data, st = streak.data, sk = sketch.data, by = today.data?.by_reason ?? {};
  const sum = (...k: string[]) => k.reduce((a, x) => a + Number(by[x] ?? 0), 0);
  const pvpGames = Object.values(pvp.data?.config?.games ?? {}).filter((g) => g.enabled !== false);
  const pvpWaiting = pvpGames.reduce((a, g) => a + (g.waiting ?? 0), 0);
  const pvpWin = Math.max(0, ...pvpGames.map((g) => Number(g.win_ink ?? 0)));
  const tiers = [...(e?.craft.tiers ?? [])].sort((a, b) => a.min - b.min);
  const topTier = tiers.length ? tiers[tiers.length - 1].ink : 0;
  const share = refs.data?.share?.enabled ? refs.data.share : null;

  const cards: Record<Exclude<Tab, 'mine'>, Card[]> = {
    today: [
      ...(e?.wheel.enabled ? [{ key: 'wheel', icon: RotateCw, color: '#FFE14D', title: 'Daily wheel', text: e.wheel.spins_left > 0 ? 'Your free spin is ready.' : 'Spun today — back after the reset.', reward: 'Ink, pigments & boosts', status: e.wheel.spins_left > 0 ? 'ready' : 'done', today: sum('wheel'), onClick: () => setWheel(true) } as Card] : []),
      ...(sk?.enabled ? [{ key: 'sketch', icon: PenLine, color: '#34C3FF', title: `Sketch of the Day · “${sk.word}”`, text: sk.mine?.submitted ? `Sketched! ${sk.votes_left} votes left — vote for your favourites.` : `${sk.minutes} minutes to sketch today’s word. Everyone votes.`, reward: `Top ${sk.prizes.filter((x) => x > 0).length} win up to ${fmt(sk.prizes[0] ?? 0)}`, status: sk.mine?.submitted ? 'done' : 'ready', today: sum('sketch'), to: '/sketch' } as Card] : []),
      ...(st?.enabled ? [{ key: 'streak', icon: Flame, color: '#FF4D6D', title: st.days > 0 ? `${st.days}-day painting streak` : 'Start a painting streak', text: st.today ? 'Painted today ✓ — your streak is safe.' : 'Paint on your plot today to keep it going.', reward: `+${st.step_pct}% craft bonus a day · up to +${st.max_pct}%`, status: st.today ? 'done' : 'ready', to: '/canvases' } as Card] : []),
      { key: 'minigames', icon: Gamepad2, color: '#3DDC97', title: 'Plot minigames', text: 'Clear rounds on your plots’ games. Every round pays.', reward: 'Ink every round', today: sum('minigame'), onClick: () => setTab('games') },
      ...((e?.challenges ?? 0) > 0 ? [{ key: 'challenge', icon: Trophy, color: '#FF9F1C', title: 'Weekly challenge', text: `${e!.challenges} theme${e!.challenges > 1 ? 's' : ''} open — paint it, vote, win.`, reward: 'Prizes for the top entries', status: 'ready', today: sum('challenge'), to: '/challenges' } as Card] : []),
      ...(e?.rooms.enabled ? [{ key: 'rooms', icon: DoorOpen, color: '#7B5CFF', title: 'Check into rooms', text: `${e.rooms.paid_today}/${e.rooms.visitor_daily} paid check-ins today. Hosts earn too.`, reward: `+${e.rooms.visitor_ink} Ink each`, status: e.rooms.paid_today < e.rooms.visitor_daily ? 'ready' : 'done', today: sum('room_visit', 'room_host'), to: '/players' } as Card] : []),
    ],
    games: [
      { key: 'pvp', icon: Swords, color: '#FF4D6D', title: 'PvP minigames', text: pvpWaiting > 0 ? `${pvpWaiting} rival${pvpWaiting === 1 ? '' : 's'} waiting — play now for an instant result.` : 'Free head-to-head games against an anonymous rival.', reward: pvpWin ? `${fmt(pvpWin)} Ink a win` : 'Ink for wins', status: pvpWaiting > 0 ? 'ready' : null, today: sum('pvp'), to: '/pvp' },
      ...(doodle.data?.enabled ? [{ key: 'doodle', icon: Lightbulb, color: '#FFE14D', title: 'Draw & Guess', text: doodle.data.open ? `${doodle.data.open} drawing${doodle.data.open === 1 ? '' : 's'} to guess right now.` : 'Draw a word for others to guess.', reward: `Up to ${doodle.data.guesser_ink} a guess · ${doodle.data.drawer_ink} per guesser`, status: doodle.data.open ? 'ready' : null, today: sum('doodle'), to: '/doodle' } as Card] : []),
    ],
    create: [
      ...(e?.craft.enabled ? [{ key: 'craft', icon: Paintbrush, color: '#FF4FD8', title: 'Paint your plot', text: 'Publish careful, original art on your plots and get a craft bonus.', reward: `Up to ${fmt(topTier)} Ink a canvas`, today: sum('craft'), to: '/canvases' } as Card] : []),
      ...(duets.data?.enabled ? [{ key: 'duet', icon: Users, color: '#FF4D6D', title: 'Duets', text: duets.data.waiting ? `${duets.data.waiting} half-painted duet${duets.data.waiting === 1 ? '' : 's'} need a partner.` : 'Paint half a picture blind — then the big reveal.', reward: `+${duets.data.complete_ink} Ink each`, status: duets.data.waiting ? 'ready' : null, today: sum('duet'), to: '/duet' } as Card] : []),
      ...(sk?.enabled ? [{ key: 'sketch2', icon: PenLine, color: '#34C3FF', title: 'Sketch of the Day', text: `Today: “${sk.word}”.`, reward: `Up to ${fmt(sk.prizes[0] ?? 0)} Ink`, status: sk.mine?.submitted ? 'done' : 'ready', to: '/sketch' } as Card] : []),
      ...((e?.challenges ?? 0) > 0 ? [{ key: 'challenge2', icon: Trophy, color: '#FF9F1C', title: 'Weekly challenge', text: 'Paint the theme on your plot and enter it.', reward: 'Prizes for the top entries', to: '/challenges' } as Card] : []),
      { key: 'stamps', icon: Stamp, color: '#FFB23F', title: 'Stamps', text: 'Other players collect numbered stamps of your art.', reward: 'You earn most of every stamp', today: sum('stamp_sale'), to: '/gallery' },
      { key: 'featured', icon: Star, color: '#FFE14D', title: 'Get Featured', text: 'Standout pieces are featured as Painting of the Day.', reward: e?.featured_ink ? `+${fmt(e.featured_ink)} Ink` : undefined, today: sum('featured'), to: '/gallery' },
    ],
    friends: [
      { key: 'invite', icon: Gift, color: '#FFE14D', title: 'Invite friends', text: share ? `Plus ${share.pct}% of everything they earn, up to ${fmt(share.cap_ink)} per friend.` : 'Paid when they start playing.', reward: refs.data ? `${fmt(refs.data.reward_ink + (share?.cap_ink ?? 0))} Ink per friend` : undefined, status: 'ready', today: sum('referral', 'referral_share'), to: '/invite' },
      ...(e?.inspire.enabled ? [{ key: 'inspire', icon: Sparkles, color: '#3DDC97', title: 'Inspire artists', text: `Each piece you inspire pays its artist ${e.inspire.artist_ink} Ink${e.inspire.giver_ink ? ` — and you ${e.inspire.giver_ink}` : ''}.`, reward: e.inspire.giver_ink ? `${e.inspire.given_today}/${e.inspire.giver_daily} today` : undefined, today: sum('inspire', 'inspire_given'), to: '/gallery' } as Card] : []),
      ...(e?.rooms.enabled ? [{ key: 'host', icon: DoorOpen, color: '#7B5CFF', title: 'Host visitors', text: 'Players who check into your room pay you Ink.', reward: `+${e.rooms.host_ink} Ink a visitor`, today: sum('room_host'), to: `/u/${me.profile.username}/room` } as Card] : []),
      { key: 'stampcollect', icon: Stamp, color: '#FFB23F', title: 'Collect stamps', text: 'Collect numbered stamps of art you love — the artist earns from it.', to: '/gallery' },
    ],
  };

  // the daily checklist
  const checks = [
    e?.wheel.enabled && { label: 'Spin the wheel', done: (e?.wheel.spins_left ?? 1) === 0 },
    st?.enabled && { label: 'Paint on your plot', done: !!st?.today },
    sk?.enabled && { label: 'Sketch the word', done: !!sk?.mine?.submitted },
    { label: 'Win a minigame', done: sum('minigame') > 0 },
    { label: 'Play a PvP match', done: sum('pvp') > 0 },
  ].filter(Boolean) as { label: string; done: boolean }[];

  return (
    <Page>
      <PageHeader eyebrow="Every way to earn Ink" title="Play & Earn" />
      <TodayHero total={Number(today.data?.total ?? 0)} checks={checks} resets={today.data?.resets_at ?? e?.resets_at} streak={st?.days ?? 0} />
      <PaintCard tiers={tiers} plotPct={e?.craft.plot_bonus_pct ?? 0} streakPct={st?.step_pct ?? 0} onPaint={() => nav('/canvases')} />
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-20 -mx-1 mb-4 overflow-x-auto px-1 py-2 no-scrollbar">
        <div className="glass inline-flex gap-1 rounded-2xl p-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`play-tab-${t.id}`}
              className={cn('relative whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition', tab === t.id ? 'text-fg' : 'text-muted hover:text-fg')}>
              {tab === t.id && <motion.span layoutId="play-tab" className="absolute inset-0 rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--line-strong)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {tab === 'mine' ? <MyCreations /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid={`earn-cards-${tab}`}>
                {cards[tab].map((c, i) => <EarnCard key={c.key} c={c} i={i} />)}
              </div>
              {tab === 'games' && <div className="mt-6"><h2 className="mb-2 font-display text-lg font-semibold">Your plots’ minigames</h2><MinigameGrid /></div>}
              {tab === 'today' && !e?.old_enough && <p className="mt-3 text-xs text-faint">Some rewards (check-ins, votes, Draw &amp; Guess, Duets, stamps) start paying after your account’s first day.</p>}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <DailyWheel open={wheel} onOpenChange={setWheel} />
    </Page>
  );
}

function TodayHero({ total, checks, resets, streak }: { total: number; checks: { label: string; done: boolean }[]; resets?: string; streak: number }) {
  const shown = useCountUp(total);
  const done = checks.filter((c) => c.done).length;
  const r = 34, circ = 2 * Math.PI * r;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const left = resets ? Math.max(0, new Date(resets).getTime() - now) : 0;
  return (
    <section className="relative mb-4 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(123,92,255,0.35),transparent_55%),radial-gradient(120%_140%_at_100%_100%,rgba(61,220,151,0.25),transparent_55%)] p-5" data-testid="today-hero">
      <InkDrops />
      <div className="relative flex flex-wrap items-center gap-5">
        <div className="relative h-[84px] w-[84px] shrink-0">
          <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
            <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
            <motion.circle cx="42" cy="42" r={r} fill="none" stroke="url(#pe-ring)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - done / Math.max(1, checks.length)) }} transition={{ duration: 1.2, ease: 'easeOut' }} />
            <defs><linearGradient id="pe-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3DDC97" /><stop offset="1" stopColor="#FFE14D" /></linearGradient></defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-display text-xl font-bold tnum">{done}/{checks.length}</span><span className="text-[9px] font-bold uppercase tracking-wider text-muted">today</span></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Earned today</div>
          <div className="flex items-center gap-2 font-display text-4xl font-bold tnum" data-testid="earned-today"><ResourceIcon r="ink" className="h-7 w-7" />{fmt(shown)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> resets in {Math.floor(left / 3600000)}h {Math.floor((left % 3600000) / 60000)}m</span>
            {streak > 0 && <span className="flex items-center gap-1 font-bold text-hot"><Flame className="h-3.5 w-3.5" /> {streak}-day streak</span>}
          </div>
        </div>
        <ul className="grid w-full gap-1 sm:w-auto">
          {checks.map((c, i) => (
            <motion.li key={c.label} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }} className="flex items-center gap-2 text-sm">
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', c.done ? 'bg-ok text-bg' : 'border border-white/25')}>{c.done && <Check className="h-3.5 w-3.5" />}</span>
              <span className={cn(c.done && 'text-muted line-through')}>{c.label}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Ink drops drifting up behind the hero. */
function InkDrops() {
  const drops = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ x: 6 + ((i * 37) % 90), d: 5 + (i % 4) * 1.4, delay: i * 0.7, s: 6 + (i % 3) * 3 })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {drops.map((p, i) => (
        <motion.span key={i} className="absolute bottom-0 rounded-full bg-gradient-to-b from-accent-2 to-accent opacity-40" style={{ left: `${p.x}%`, width: p.s, height: p.s * 1.3 }}
          animate={{ y: [20, -180], opacity: [0, 0.5, 0] }} transition={{ duration: p.d, repeat: Infinity, delay: p.delay, ease: 'easeOut' }} />
      ))}
    </div>
  );
}

/** The plainest message on the page: painting on your plot earns Ink. */
function PaintCard({ tiers, plotPct, streakPct, onPaint }: { tiers: { min: number; ink: number }[]; plotPct: number; streakPct: number; onPaint(): void }) {
  return (
    <section className="glass relative mb-5 grid items-center gap-4 overflow-hidden rounded-[28px] p-5 sm:grid-cols-[150px_1fr]" data-testid="paint-earns">
      <PaintAnim />
      <div className="min-w-0">
        <div className="eyebrow text-accent-2">The big one</div>
        <h2 className="font-display text-2xl font-bold">Paint your plot → earn Ink</h2>
        <p className="mt-1 text-sm text-muted">Paint on your land and publish it to the map. Every canvas earns a <b className="text-fg">craft bonus</b> — the richer, more original and more carefully painted it is, the more Ink.</p>
        {tiers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tiers.map((t) => <span key={t.min} className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold tnum">craft {t.min}+ <ArrowRight className="h-3 w-3 text-muted" /> <ResourceIcon r="ink" className="h-3.5 w-3.5" />{fmt(t.ink)}</span>)}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {plotPct > 0 && <span>+{plotPct}% for every extra plot in a mural</span>}
          {streakPct > 0 && <span>+{streakPct}% for every day in a row you paint</span>}
          <span>Repeats of your earlier art earn less</span>
        </div>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onPaint} className="lv-cta mt-4 inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-extrabold text-white" data-testid="paint-now"><Brush className="h-4 w-4" /> Paint my plot</motion.button>
      </div>
    </section>
  );
}

function PaintAnim() {
  return (
    <svg viewBox="0 0 150 150" className="mx-auto h-[130px] w-[130px] sm:h-[150px] sm:w-[150px]" aria-hidden>
      <defs><linearGradient id="pa-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF4D6D" /><stop offset="0.5" stopColor="#7B5CFF" /><stop offset="1" stopColor="#22E3FF" /></linearGradient></defs>
      <rect x="20" y="40" width="90" height="90" rx="10" fill="#F5F4EF" />
      <rect x="20" y="40" width="90" height="90" rx="10" fill="url(#pa-g)">
        <animate attributeName="width" values="0;90;90;0" keyTimes="0;0.55;0.9;1" dur="3.2s" repeatCount="indefinite" />
      </rect>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;90 0;90 0;0 0" keyTimes="0;0.55;0.9;1" dur="3.2s" repeatCount="indefinite" />
        <rect x="8" y="22" width="10" height="44" rx="4" fill="#C98B62" transform="rotate(-25 13 44)" />
        <rect x="10" y="58" width="12" height="16" rx="3" fill="#E5E5EA" transform="rotate(-25 16 66)" />
        <path d="M12 72 q4 14 12 12 q-6 -6 -4 -14z" fill="#7B5CFF" transform="rotate(-25 16 66)" />
      </g>
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <circle cx={60 + k * 22} cy="44" r="6" fill="#34C3FF" opacity="0">
            <animate attributeName="opacity" values="0;0;1;0" keyTimes={`0;${0.55 + k * 0.08};${0.62 + k * 0.08};1`} dur="3.2s" repeatCount="indefinite" />
            <animate attributeName="cy" values="44;44;28;8" keyTimes={`0;${0.55 + k * 0.08};${0.62 + k * 0.08};1`} dur="3.2s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      <text x="118" y="30" textAnchor="middle" fontSize="15" fontWeight="900" fill="#FFE14D" opacity="0">
        +Ink
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.6;0.68;0.9;1" dur="3.2s" repeatCount="indefinite" />
      </text>
    </svg>
  );
}

function EarnCard({ c, i }: { c: Card; i: number }) {
  const body = (
    <>
      {c.status === 'ready' && <motion.span className="pointer-events-none absolute inset-0 rounded-[22px]" style={{ boxShadow: `inset 0 0 0 1.5px ${c.color}` }} animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 2.4, repeat: Infinity }} />}
      <div className="flex items-start gap-3">
        <motion.span whileHover={{ rotate: -8, scale: 1.08 }} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${c.color}22`, color: c.color, boxShadow: `0 0 28px -10px ${c.color}` }}><c.icon className="h-6 w-6" /></motion.span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display font-semibold">{c.title}</span>
            {c.status === 'ready' && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase" style={{ background: c.color, color: '#0B1230' }}>Ready</span>}
            {c.status === 'done' && <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-ok/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-ok"><Check className="h-3 w-3" />Done</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted">{c.text}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {c.reward ? <span className="flex items-center gap-1 text-xs font-bold"><ResourceIcon r="ink" className="h-3.5 w-3.5" />{c.reward}</span> : <span />}
        {c.today ? <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok tnum">+{fmt(c.today)} today</span> : <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1" />}
      </div>
    </>
  );
  const cls = 'group glass relative block rounded-[22px] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgba(123,92,255,0.6)]';
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      {c.to ? <Link to={c.to} className={cls} data-testid={`earn-${c.key}`}>{body}</Link> : <button onClick={c.onClick} className={cn(cls, 'w-full')} data-testid={`earn-${c.key}`}>{body}</button>}
    </motion.div>
  );
}

// ---- My creations ------------------------------------------------------------------------
function MyCreations() {
  const [kind, setKind] = useState<'sketches' | 'duets' | 'drawings'>('sketches');
  const sketches = useQuery({ queryKey: ['my-sketches'], queryFn: () => api.mySketches(60) });
  const duets = useQuery({ queryKey: ['duets'], queryFn: api.duetsMine });
  const drawings = useQuery({ queryKey: ['my-doodles'], queryFn: () => api.myDoodles(60) });
  const done = (duets.data?.duets ?? []).filter((d) => d.status === 'done');
  const counts = { sketches: sketches.data?.length ?? 0, duets: done.length, drawings: drawings.data?.length ?? 0 };
  return (
    <section data-testid="my-creations">
      <div className="mb-3 flex flex-wrap gap-2">
        {(['sketches', 'duets', 'drawings'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('rounded-full border px-3 py-1.5 text-sm font-bold capitalize transition', kind === k ? 'border-accent bg-accent/15' : 'border-line text-muted hover:text-fg')}>
            {k} <span className="tnum text-muted">{counts[k]}</span>
          </button>
        ))}
      </div>
      {kind === 'sketches' && <Grid empty="Your daily sketches collect here." to="/sketch" cta="Sketch today’s word" items={(sketches.data ?? []).map((s) => ({
        id: s.id, view: <StrokeView strokes={s.strokes} size={220} className="w-full" />, title: s.word,
        meta: s.live ? `${s.votes} vote${s.votes === 1 ? '' : 's'} · voting now` : s.place ? `#${s.place} · +${s.prize} Ink` : `${s.votes} vote${s.votes === 1 ? '' : 's'}`, badge: s.place && s.place <= 3 ? `#${s.place}` : undefined,
        share: () => shareDrawing({ parts: [{ strokes: s.strokes }], title: `Sketch of the Day: ${s.word}`, url: `${location.origin}/sketch/${s.id}` }),
      }))} />}
      {kind === 'duets' && <Grid empty="Finished duets show up here, ready to share." to="/duet" cta="Paint a duet" items={done.map((d) => ({
        id: d.id, view: <DuetView top={d.top} bottom={d.bottom} size={220} className="!w-full" />, title: d.prompt, meta: d.partner ? `with @${d.partner.username} · ${timeAgo(d.done_at)}` : timeAgo(d.done_at),
        share: () => shareDrawing({ parts: [{ strokes: d.top, clip: { y0: 0, y1: 500 } }, { strokes: d.bottom, clip: { y0: 500, y1: 1000 } }], title: `Duet: ${d.prompt}`, url: `${location.origin}/duet/${d.id}` }),
      }))} />}
      {kind === 'drawings' && <Grid empty="Words you draw in Draw & Guess show up here." to="/doodle" cta="Draw a word" items={(drawings.data ?? []).map((d) => ({
        id: d.id, view: <StrokeView strokes={d.strokes} size={220} className="w-full" />, title: d.word, meta: `${d.solved}/${d.guesses} guessed · +${d.ink} Ink`,
        share: () => shareDrawing({ parts: [{ strokes: d.strokes }], title: `Guess my drawing!`, text: 'Can you guess what I drew on LANDVAS?' }),
      }))} />}
    </section>
  );
}

function Grid({ items, empty, to, cta }: { items: { id: string; view: React.ReactNode; title: string; meta: string; badge?: string; share(): void }[]; empty: string; to: string; cta: string }) {
  if (!items.length) return (
    <div className="glass grid justify-items-center gap-3 rounded-3xl p-8 text-center">
      <Sparkles className="h-8 w-8 text-accent-2" />
      <p className="text-sm text-muted">{empty}</p>
      <Link to={to} className="lv-cta inline-flex h-10 items-center rounded-xl px-4 text-sm font-extrabold text-white">{cta}</Link>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((x, i) => (
        <motion.div key={x.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="glass relative grid gap-1.5 overflow-hidden rounded-2xl p-2">
          <div className="overflow-hidden rounded-xl [&>*]:!w-full [&_canvas]:!h-auto [&_canvas]:!w-full">{x.view}</div>
          {x.badge && <span className="absolute left-3 top-3 rounded-full bg-gold px-2 py-0.5 text-[11px] font-extrabold text-bg">{x.badge}</span>}
          <div className="flex items-center gap-1 px-1">
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold capitalize">{x.title}</div><div className="truncate text-[11px] text-muted">{x.meta}</div></div>
            <button onClick={x.share} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Share ${x.title}`}><Share2 className="h-4 w-4" /></button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
