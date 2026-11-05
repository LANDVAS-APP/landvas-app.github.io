// An arcade plot: walk round the hall with your explorer. Step up to a cabinet and "Play" appears; tap it and the
// camera glides in until the cabinet's screen fills the view, then the game runs on that screen. Scores win
// tickets (and a little Ink); the prize counter at the back swaps tickets for prizes that go on your shelves;
// the ticket machine by the door pays a daily bonus. Owners level the arcade up by having it played, then buy
// new cabinets, upgrade them (more tickets a round) and pick the floor, neon and light show.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Lock, Play, RotateCcw, Trophy, Volume2, VolumeX, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Arcade, ArcadeFinish, ArcadeMe, ExplorerStyle } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button, Dialog, PlayerAvatar, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { ARENAS, HOW } from './games';
import { createHall, type HallScene, type HallSpot } from './hall3d';
import { isMuted, setMuted, sfx } from './sfx';

export const arcadeKey = (id: string) => ['arcade', id] as const;
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const tix = (n: number) => Math.round(n).toLocaleString();

export default function ArcadeScreen() {
  const { id } = useParams();
  const q = useQuery({ queryKey: arcadeKey(id!), queryFn: () => api.arcadeGet(id!), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#05040F]"><Spinner /></div>;
  if (q.error || !q.data) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#05040F] p-6 text-center text-white">
        <div className="text-5xl">🕹️</div><p>This arcade couldn’t be found.</p>
        <Link to="/world"><Button variant="secondary">Back to the map</Button></Link>
      </div>
    );
  }
  return <ArcadeView a={q.data} />;
}

/** A handful of regulars hanging round the cabinets (more as the arcade levels up). */
function regulars(seed: number, n: number) {
  const pick = <T,>(xs: T[], k: number) => xs[(seed * 7 + k * 13) % xs.length];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const st: ExplorerStyle = { sex: i % 2 ? 'f' : 'm', hair: pick(['short', 'long', 'curly', 'ponytail', 'spiky', 'bob', 'bun'], i), hairc: pick(['brown', 'black', 'blonde', 'red', 'pink', 'blue'], i + 3),
      skin: pick(['peach', 'light', 'tan', 'brown', 'deep'], i + 1), hat: pick(['none', 'cap', 'headphones', 'none', 'beret'], i + 2), hold: 'brush', body: i % 2 ? pick(['classic', 'skirt', 'dress'], i) : 'classic' };
    out.push(svgUrl(explorerSvg(st, pick(['#7B5CFF', '#FF4D6D', '#22C7B5', '#FF9F1C', '#34C3FF'], i), 160)));
  }
  return out;
}

function ArcadeView({ a }: { a: Arcade }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const cv = useRef<HTMLCanvasElement>(null);
  const hall = useRef<HallScene | null>(null);
  const [near, setNear] = useState<HallSpot | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'prizes' | 'scores' | 'manage' | null>(null);
  const [mute, setMute] = useState(isMuted());
  const [meState, setMeState] = useState<ArcadeMe>(a.me);
  useEffect(() => setMeState(a.me), [a.me]);
  const title = /^untitled/i.test(a.name.trim()) || !a.name.trim() ? `${a.owner.username}’s Arcade` : a.name;
  const games = useMemo(() => Object.entries(a.games).sort((x, y) => x[1].order - y[1].order), [a.games]);
  const prizeEmoji = useMemo(() => Object.fromEntries(a.prizes.map((p) => [p.id, p.emoji])), [a.prizes]);

  useEffect(() => {
    if (!cv.current) return;
    const h = createHall({
      canvas: cv.current, seed: a.seed, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onNear: (s) => { setNear(s); if (s) sfx.blip(s.kind === 'machine' ? 7 : 12); },
    });
    hall.current = h;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) (window as unknown as { __landvasArcade: HallScene }).__landvasArcade = h;
    return () => { h.dispose(); hall.current = null; };
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // what's in the hall
  useEffect(() => {
    const h = hall.current; if (!h) return;
    h.setMachines(games.map(([id, g]) => ({ id, name: g.name, color: g.color, emoji: g.emoji, level: a.machines[id] ?? 0, locked: !(id in a.machines), lockLabel: `LV ${g.level}` })));
    h.setRegulars(regulars(a.seed, Math.min(5, 1 + Math.floor(a.level.level / 2))));
  }, [games, a.machines, a.level.level, a.seed]);
  useEffect(() => { hall.current?.setDecor(a.decor, title); }, [a.decor, title]);
  useEffect(() => { hall.current?.setShelf(Object.entries(a.shelf).map(([k, n]) => ({ emoji: prizeEmoji[k] ?? '🎁', n }))); }, [a.shelf, prizeEmoji]);
  useEffect(() => { hall.current?.setBonus(meState.bonus_ready); }, [meState.bonus_ready]);
  useEffect(() => { hall.current?.setPaused(!!sheet && !playing); }, [sheet, playing]);

  const refresh = (next?: Arcade) => { if (next) qc.setQueryData(arcadeKey(a.id), next); else void qc.invalidateQueries({ queryKey: arcadeKey(a.id) }); };
  const play = async (id: string) => {
    sfx.coin();
    await hall.current?.zoomIn(id);
    setPlaying(id);
  };
  const stopPlaying = () => { setPlaying(null); hall.current?.zoomOut(); refresh(); };
  const daily = async () => {
    try {
      const r = await api.arcadeDaily();
      setMeState(r.me); sfx.tickets(r.tickets); confettiCannons(); invalidateGame(qc);
      toast.success(`🎟️ +${r.tickets} tickets${r.paid ? ` · +${r.paid} Ink` : ''}`, { description: r.streak > 1 ? `${r.streak} days in a row — come back tomorrow for more!` : 'Come back tomorrow for a bigger bonus.' });
    } catch (e) { toast(toGameError(e).message); }
  };

  const nearGame = near?.kind === 'machine' ? a.games[near.id] : null;
  const nearLocked = near?.kind === 'machine' && !(near.id in a.machines);
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05040F] text-white" data-testid="arcade">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="arcade-hall" />
      {/* top bar */}
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))] transition-opacity', playing && 'opacity-0')}>
        <button onClick={() => nav(-1)} className="pointer-events-auto rounded-xl bg-black/55 p-2" aria-label="Leave the arcade"><ArrowLeft className="h-5 w-5" /></button>
        <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div className="lv-arc-marquee min-w-0 truncate text-base" style={{ ['--glow' as string]: '#FF3D9A' }}>{title}</div>
            <span className="shrink-0 rounded-full bg-[#8B5CFF] px-1.5 text-[10px] font-black">LV {a.level.level}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" title={`${a.level.into}/${a.level.need} XP`}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#FF3D9A] to-[#22E3FF]" style={{ width: a.level.max ? '100%' : `${(a.level.into / Math.max(1, a.level.need)) * 100}%` }} />
          </div>
          {!a.mine && <div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/60"><PlayerAvatar p={a.owner} size={14} /> @{a.owner.username}’s arcade</div>}
        </div>
        <div className="pointer-events-auto grid justify-items-end gap-1.5">
          <div className="lv-arc-ticket text-sm" data-testid="arcade-tickets">🎟️ {tix(meState.tickets)}</div>
          <button onClick={() => { setMuted(!mute); setMute(!mute); }} className="rounded-xl bg-black/55 p-1.5" aria-label={mute ? 'Sound on' : 'Sound off'}>{mute ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
        </div>
      </div>
      {/* side buttons */}
      {!playing && (
        <div className="absolute right-3 top-[calc(max(12px,env(safe-area-inset-top,0px))+92px)] grid gap-2">
          <button onClick={() => setSheet('scores')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="arcade-scores"><Trophy className="h-5 w-5 text-[#FFE14D]" />Scores</button>
          <button onClick={() => setSheet('prizes')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="arcade-prizes-btn"><span className="text-lg leading-none">🎁</span>Prizes</button>
          {a.mine && <button onClick={() => setSheet('manage')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="arcade-manage"><Wrench className="h-5 w-5" />Manage</button>}
        </div>
      )}
      {/* what you're standing at */}
      <AnimatePresence>
        {!playing && near && (
          <motion.div key={near.kind === 'machine' ? near.id : near.kind} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            {near.kind === 'machine' && nearGame && !nearLocked && (
              <button onClick={() => void play(near.id)} className="lv-arc-play flex items-center gap-3 rounded-3xl px-5 py-3 text-left shadow-2xl" style={{ background: `linear-gradient(135deg, ${nearGame.color}, #8B5CFF)`, boxShadow: `0 0 40px ${nearGame.color}` }} data-testid="arcade-play">
                <span className="text-4xl">{nearGame.emoji}</span>
                <span><span className="block text-xs font-bold uppercase tracking-widest text-white/80">Free play</span><span className="flex items-center gap-1.5 font-display text-2xl font-black"><Play className="h-5 w-5 fill-white" /> Play {nearGame.name}</span>
                  <span className="block text-[11px] text-white/80">Your best: {meState.best[near.id] ?? '—'} · Record: {a.boards[near.id]?.[0]?.score ?? '—'}{(a.machines[near.id] ?? 1) > 1 ? ` · +${Math.round((a.machines[near.id] - 1) * a.upgrade.bonus * 100)}% tickets` : ''}</span></span>
              </button>
            )}
            {near.kind === 'machine' && nearGame && nearLocked && (
              <div className="flex items-center gap-3 rounded-3xl bg-black/75 px-5 py-3">
                <Lock className="h-6 w-6 text-white/60" />
                <div><div className="font-display text-lg font-black">{nearGame.emoji} {nearGame.name}</div>
                  <div className="text-xs text-white/70">{a.mine ? (a.level.level >= nearGame.level ? `Install it for ${nearGame.cost} 🎟️` : `Reach arcade level ${nearGame.level} to install it`) : 'Coming soon to this arcade'}</div></div>
                {a.mine && a.level.level >= nearGame.level && <Button size="sm" variant="rainbow" disabled={meState.tickets < nearGame.cost} onClick={async () => { try { const n = await api.arcadeUnlock(a.id, near.id); refresh(n); sfx.jackpot(); confettiCannons(); toast.success(`${nearGame.name} installed!`); } catch (e) { toast.error(toGameError(e).message); } }} data-testid="arcade-install">Install</Button>}
              </div>
            )}
            {near.kind === 'prizes' && (
              <button onClick={() => setSheet('prizes')} className="lv-arc-play flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#FFB13D] to-[#FF3D9A] px-5 py-3 shadow-2xl" data-testid="arcade-counter"><span className="text-4xl">🎁</span><span className="font-display text-2xl font-black">Prize counter</span></button>
            )}
            {near.kind === 'bonus' && (
              <button onClick={daily} disabled={!meState.bonus_ready} className={cn('lv-arc-play flex items-center gap-3 rounded-3xl px-5 py-3 shadow-2xl', meState.bonus_ready ? 'bg-gradient-to-br from-[#FFE14D] to-[#FF7A3D] text-[#3A1A00]' : 'bg-black/75')} data-testid="arcade-daily">
                <span className="text-4xl">🎟️</span><span><span className="block font-display text-2xl font-black">{meState.bonus_ready ? 'Daily tickets!' : 'Come back tomorrow'}</span>
                  <span className="block text-xs">{meState.streak > 0 ? `${meState.streak}-day streak` : 'More every day in a row'}</span></span>
              </button>
            )}
          </motion.div>
        )}
        {!playing && !near && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <div className="rounded-full bg-black/60 px-4 py-2 text-xs text-white/80">Tap the floor or a cabinet to walk there{meState.bonus_ready ? ' · 🎟️ free tickets by the door!' : ''}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {playing && <Cabinet a={a} me={meState} game={playing} haptics={haptics} reduce={reduce} onExit={stopPlaying} onMe={setMeState} />}
      {sheet === 'prizes' && <PrizeCounter a={a} me={meState} onMe={setMeState} onClose={() => setSheet(null)} onShelf={() => refresh()} />}
      {sheet === 'scores' && <Scores a={a} me={meState} onClose={() => setSheet(null)} />}
      {sheet === 'manage' && <Manage a={a} me={meState} onChange={(n) => { refresh(n); setMeState(n.me); }} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ---- playing a cabinet: the screen fills the view, with the marquee above and the bezel round it ----------------
type Phase = { k: 'attract' } | { k: 'count'; n: number; session: string; seed: number; level: number } | { k: 'play'; session: string; seed: number; level: number } | { k: 'done'; r: ArcadeFinish | null; score: number };
function Cabinet({ a, me, game, haptics, reduce, onExit, onMe }: { a: Arcade; me: ArcadeMe; game: string; haptics: boolean; reduce: boolean; onExit(): void; onMe(m: ArcadeMe): void }) {
  const qc = useQueryClient();
  const info = a.games[game];
  const Arena = ARENAS[game];
  const [phase, setPhase] = useState<Phase>({ k: 'attract' });
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState(0);
  const start = async () => {
    setBusy(true);
    try { const r = await api.arcadeStart(a.id, game); sfx.coin(); setPhase({ k: 'count', n: 3, session: r.session, seed: r.seed, level: r.level }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    sfx.blip(phase.n === 1 ? 12 : 0);
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, level: phase.level }), 650);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    try {
      const r = await api.arcadeFinish(session, score);
      onMe(r.me); invalidateGame(qc);
      setCounted(0); setPhase({ k: 'done', r, score: r.score });
      if (r.new_record || r.level_up) confettiCannons();
    } catch (e) { toast.error(toGameError(e).message); setPhase({ k: 'done', r: null, score }); }
  };
  // tickets spill out, counted up one by one
  useEffect(() => {
    if (phase.k !== 'done' || !phase.r) return;
    const total = phase.r.tickets; if (!total) return;
    sfx.tickets(total);
    const step = Math.max(1, Math.ceil(total / 40));
    const t = setInterval(() => setCounted((c) => { const n = Math.min(total, c + step); if (n >= total) clearInterval(t); return n; }), 35);
    return () => clearInterval(t);
  }, [phase]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex flex-col items-center bg-black/30 px-2 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-[max(10px,env(safe-area-inset-top,0px))]" style={{ ['--glow' as string]: info.color }} data-testid="arcade-cabinet">
      <div className="flex w-full max-w-[560px] items-center gap-2 pb-2">
        <button onClick={onExit} className="rounded-xl bg-black/60 p-2" aria-label="Step back from the cabinet" data-testid="arcade-exit"><X className="h-5 w-5" /></button>
        <div className="lv-arc-marquee min-w-0 flex-1 truncate text-center text-xl">{info.emoji} {info.name}</div>
        <div className="lv-arc-ticket text-xs">🎟️ {tix(me.tickets)}</div>
      </div>
      <div className="lv-arc-crt min-h-0 w-full max-w-[560px] flex-1">
        {phase.k === 'play' && Arena && <Arena key={phase.session} seed={phase.seed} level={phase.level} haptics={haptics} reduce={reduce} onEnd={(s) => void finish(phase.session, s)} />}
        {phase.k !== 'play' && (
          <div className="absolute inset-0 grid place-items-center overflow-y-auto p-5 text-center" style={{ background: `radial-gradient(120% 90% at 50% 10%, ${info.color}55, #05030C 70%)` }}>
            <AnimatePresence mode="wait">
              {phase.k === 'attract' && (
                <motion.div key="attract" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3">
                  <motion.div animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-7xl">{info.emoji}</motion.div>
                  <div className="lv-arc-marquee text-3xl">{info.name}</div>
                  <p className="max-w-xs text-sm text-white/85">{HOW[game]}</p>
                  <div className="font-mono text-xs text-white/60">YOUR BEST {me.best[game] ?? 0} · HIGH SCORE {a.boards[game]?.[0]?.score ?? 0}</div>
                  <button onClick={start} disabled={busy} className="lv-arc-bigbtn !h-20 !w-auto !rounded-3xl px-8 text-lg" data-testid="arcade-start">{busy ? '…' : '▶ PRESS START'}</button>
                  <div className="font-mono text-[11px] text-[#FFE14D] opacity-80">FREE PLAY · WIN TICKETS 🎟️</div>
                </motion.div>
              )}
              {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} className="lv-arc-marquee text-9xl">{phase.n}</motion.div>}
              {phase.k === 'done' && (
                <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-2.5" data-testid="arcade-done">
                  {phase.r?.new_record ? <div className="lv-arc-marquee text-2xl" style={{ ['--glow' as string]: '#FFE14D' }}>★ NEW HIGH SCORE ★</div> : phase.r?.new_best ? <div className="lv-arc-marquee text-xl" style={{ ['--glow' as string]: '#22E3FF' }}>PERSONAL BEST!</div> : <div className="font-mono text-sm text-white/70">GAME OVER</div>}
                  <div className="font-mono text-6xl font-black text-[#FFE14D]" style={{ textShadow: '0 0 24px #FFB13D' }}>{phase.score}</div>
                  {phase.r && (
                    <>
                      <motion.div initial={{ scale: 0.8 }} animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: counted < phase.r.tickets ? Infinity : 0, duration: 0.3 }} className="lv-arc-ticket text-2xl" data-testid="arcade-won">🎟️ +{counted}</motion.div>
                      <div className="flex flex-wrap justify-center gap-2 text-sm">
                        {phase.r.paid > 0 && <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-bold"><ResourceIcon r="ink" className="h-4 w-4" /> +{phase.r.paid} Ink</span>}
                        {phase.r.owner_cut > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-xs">+{phase.r.owner_cut} 🎟️ to @{a.owner.username}</span>}
                        {phase.r.level_up && <span className="rounded-full bg-[#8B5CFF] px-3 py-1 text-xs font-bold">Arcade level {phase.r.level_up}!</span>}
                      </div>
                      {phase.r.capped && <p className="text-[11px] text-white/60">Today’s arcade Ink is maxed — tickets keep coming.</p>}
                    </>
                  )}
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setPhase({ k: 'attract' })} className="lv-arc-bigbtn !h-14 !w-auto !rounded-2xl px-5 text-sm" data-testid="arcade-again"><RotateCcw className="mr-1 inline h-4 w-4" />PLAY AGAIN</button>
                    <button onClick={onExit} className="rounded-2xl bg-white/10 px-5 text-sm font-bold">Step back</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---- the prize counter ------------------------------------------------------------------------------------------
function PrizeCounter({ a, me, onMe, onClose, onShelf }: { a: Arcade; me: ArcadeMe; onMe(m: ArcadeMe): void; onClose(): void; onShelf(): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const next = a.prizes.find((p) => p.tickets > me.tickets);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🎁 Prize counter" description="Swap tickets for prizes. They go up on the shelves behind the counter of your arcade for everyone to see.">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-[var(--bg-3)] p-3">
        <div className="lv-arc-ticket text-lg">🎟️ {tix(me.tickets)}</div>
        {next && <div className="text-right text-xs text-[var(--fg-2)]">{tix(next.tickets - me.tickets)} more for {next.emoji} {next.name}</div>}
      </div>
      <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" data-testid="arcade-prizes">
        {a.prizes.map((p) => {
          const can = me.tickets >= p.tickets, have = me.prizes[p.id] ?? 0;
          return (
            <button key={p.id} disabled={!can || busy === p.id} data-testid={`prize-${p.id}`}
              onClick={async () => {
                setBusy(p.id);
                try { const r = await api.arcadePrize(p.id); onMe(r.me); onShelf(); sfx.win(5); confettiCannons(); toast.success(`${p.emoji} ${p.name} is yours!`); }
                catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
              }}
              className={cn('relative grid justify-items-center gap-0.5 rounded-2xl border-2 p-2 text-center transition', can ? 'border-[#FFB13D] bg-[#FFB13D]/10 hover:-translate-y-0.5' : 'border-transparent bg-[var(--bg-3)] opacity-60')}>
              {have > 0 && <span className="absolute right-1.5 top-1 rounded-full bg-[#3DDC97] px-1.5 text-[10px] font-black text-black">×{have}</span>}
              <span className="text-4xl">{p.emoji}</span>
              <span className="w-full truncate text-xs font-bold">{p.name}</span>
              <span className="lv-arc-ticket text-[11px]">🎟️ {tix(p.tickets)}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

// ---- high scores --------------------------------------------------------------------------------------------------
function Scores({ a, me, onClose }: { a: Arcade; me: ArcadeMe; onClose(): void }) {
  const ids = Object.entries(a.games).sort((x, y) => x[1].order - y[1].order).map(([k]) => k);
  const [g, setG] = useState(ids[0]);
  const [where, setWhere] = useState<'here' | 'world'>('here');
  const hof = useQuery({ queryKey: ['arcade-hof', g], queryFn: () => api.arcadeHallOfFame(g), enabled: where === 'world' });
  const rows = where === 'here' ? a.boards[g] ?? [] : hof.data ?? [];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🏆 High scores" description="Every cabinet keeps its own board. Your best on each is shown under its name.">
      <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
        {ids.map((k) => (
          <button key={k} onClick={() => setG(k)} className={cn('shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold', g === k ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>
            {a.games[k].emoji} {a.games[k].name}<span className="block text-[10px] font-normal opacity-75">best {me.best[k] ?? '—'}</span>
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-1.5">
        {(['here', 'world'] as const).map((w) => <button key={w} onClick={() => setWhere(w)} className={cn('flex-1 rounded-xl py-1.5 text-xs font-bold', where === w ? 'bg-white/15' : 'bg-[var(--bg-3)]')}>{w === 'here' ? 'This arcade' : 'Hall of fame (everywhere)'}</button>)}
      </div>
      <div className="grid gap-1.5" data-testid="arcade-board">
        {rows.map((r, i) => (
          <div key={r.player.id} className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2 font-mono text-sm">
            <span className={cn('w-6 text-center font-black', i === 0 ? 'text-[#FFD84D]' : i === 1 ? 'text-[#C9D3E6]' : i === 2 ? 'text-[#E0A06B]' : 'text-[var(--fg-2)]')}>{i + 1}</span>
            <PlayerAvatar p={r.player} size={24} /><span className="min-w-0 flex-1 truncate font-sans font-semibold">@{r.player.username}</span><b className="text-[#FFE14D]">{r.score}</b>
          </div>
        ))}
        {where === 'world' && hof.isLoading && <div className="grid place-items-center py-4"><Spinner /></div>}
        {!rows.length && !(where === 'world' && hof.isLoading) && <p className="py-4 text-center text-sm text-[var(--fg-2)]">No scores yet — be the first!</p>}
      </div>
    </Dialog>
  );
}

// ---- owner: cabinets and decor ----------------------------------------------------------------------------------
function Manage({ a, me, onChange, onClose }: { a: Arcade; me: ArcadeMe; onChange(n: Arcade): void; onClose(): void }) {
  const [tab, setTab] = useState<'cabinets' | 'decor'>('cabinets');
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, f: () => Promise<Arcade>, ok: string) => {
    setBusy(key);
    try { const n = await f(); onChange(n); sfx.win(4); toast.success(ok); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const games = Object.entries(a.games).sort((x, y) => x[1].order - y[1].order);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🛠️ Run your arcade" description={`Level ${a.level.level}${a.level.max ? ' (max)' : ` · ${a.level.into}/${a.level.need} XP to the next`}. Every game played here gives XP — visitors too (and you get 10% of their tickets).`}>
      <div className="mb-3 flex items-center gap-2">
        {(['cabinets', 'decor'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn('flex-1 rounded-xl py-2 text-sm font-bold capitalize', tab === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>{t}</button>)}
        <div className="lv-arc-ticket shrink-0 text-sm">🎟️ {tix(me.tickets)}</div>
      </div>
      {tab === 'cabinets' ? (
        <div className="grid max-h-[55vh] gap-2 overflow-y-auto" data-testid="arcade-cabinets">
          {games.map(([id, g]) => {
            const lv = a.machines[id];
            const cost = a.upgrade.costs[id];
            return (
              <div key={id} className="flex items-center gap-3 rounded-2xl bg-[var(--bg-3)] p-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `${g.color}33`, boxShadow: lv ? `0 0 16px ${g.color}66` : undefined }}>{g.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{g.name}</div>
                  <div className="text-[11px] text-[var(--fg-2)]">{lv ? `Level ${lv}/${a.upgrade.max} · +${Math.round((lv - 1) * a.upgrade.bonus * 100)}% tickets` : a.level.level >= g.level ? `Ready to install` : `Needs arcade level ${g.level}`}</div>
                </div>
                {!lv ? (
                  <Button size="sm" variant="rainbow" disabled={a.level.level < g.level || me.tickets < g.cost} loading={busy === id} data-testid={`install-${id}`}
                    onClick={() => run(id, () => api.arcadeUnlock(a.id, id), `${g.name} installed!`)}>{a.level.level < g.level ? <><Lock className="h-3.5 w-3.5" /> LV {g.level}</> : `Install · ${g.cost} 🎟️`}</Button>
                ) : lv >= a.upgrade.max ? <span className="text-xs font-bold text-[#3DDC97]">MAX</span> : (
                  <Button size="sm" variant="secondary" disabled={me.tickets < (cost ?? 0)} loading={busy === id} data-testid={`upgrade-${id}`}
                    onClick={() => run(id, () => api.arcadeUpgrade(a.id, id), `${g.name} → level ${lv + 1}`)}>⬆ {cost} 🎟️</Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid max-h-[55vh] gap-3 overflow-y-auto" data-testid="arcade-decor">
          {(['floor', 'neon', 'lights'] as const).map((slot) => (
            <div key={slot}>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--fg-2)]">{slot === 'floor' ? 'Floor' : slot === 'neon' ? 'Neon' : 'Light show'}</div>
              <div className="flex flex-wrap gap-1.5">
                {a.decor_catalog[slot].map((d) => {
                  const own = a.decor_owned.includes(`${slot}:${d.id}`), on = a.decor[slot] === d.id;
                  return (
                    <button key={d.id} disabled={on || (!own && me.tickets < d.tickets) || busy === `${slot}:${d.id}`} data-testid={`decor-${slot}-${d.id}`}
                      onClick={() => run(`${slot}:${d.id}`, () => api.arcadeDecor(a.id, slot, d.id), `${d.name} ✨`)}
                      className={cn('rounded-xl px-3 py-2 text-xs font-bold', on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]', !on && !own && me.tickets < d.tickets && 'opacity-50')}>
                      {d.name}<span className="block text-[10px] font-normal">{on ? 'In use' : own ? 'Owned' : `${d.tickets} 🎟️`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
