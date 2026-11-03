// /space/planet/:world/:gx/:gy/:game — a round of one of your planet plot's two games. The first few
// rounds a day on each plot pay Ink (under the daily planet cap); after that they're just for fun.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { Button, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { PLANET_GAMES, makePlanetEngine } from './planetGames';
import { Arena } from './SpaceGame';
import { useSpace } from './useSpace';
import { worldOf } from './worlds';

type Phase = { k: 'intro' } | { k: 'count'; n: number; session: string; seed: number; seconds: number; rewarded: boolean; left: number }
  | { k: 'play'; session: string; seed: number; seconds: number }
  | { k: 'done'; score: number; paid: number; capped: boolean; rewarded: boolean; best: number | null };

export default function PlanetGameRoute() {
  const p = useParams();
  return <PlanetGame key={`${p.world}/${p.gx}/${p.gy}/${p.game}`} />;
}

function PlanetGame() {
  const { world = 'moon', gx = '0', gy = '0', game = 'rockrun' } = useParams();
  const info = PLANET_GAMES[game] ?? PLANET_GAMES.rockrun;
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const s = useSpace();
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const w = worldOf(world, s.data?.home_seed, s.data?.home_name);
  const make = useMemo(() => makePlanetEngine(game, me?.profile.accent_color ?? '#8B5CFF', s.data?.home_seed), [game, me?.profile.accent_color, s.data?.home_seed]);
  const back = () => nav(s.data?.location === world && !s.data?.dest ? '/space/surface' : '/space');

  const start = async () => {
    setBusy(true);
    try {
      const r = await api.planetGameStart(world, Number(gx), Number(gy), game);
      setLeft(r.rounds_left);
      setPhase({ k: 'count', n: 3, session: r.session, seed: r.seed, seconds: r.seconds, rewarded: r.rewarded, left: r.rounds_left });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, seconds: phase.seconds }), 700);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    try {
      const r = await api.planetGameFinish(session, score);
      invalidateGame(qc);
      if (r.paid > 0) confettiCannons();
      setPhase({ k: 'done', score: r.score, paid: r.paid, capped: r.capped, rewarded: r.rewarded, best: r.best });
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase({ k: 'done', score, paid: 0, capped: false, rewarded: false, best: null });
    }
  };

  if (!me || s.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#05060F]"><Spinner /></div>;
  if (phase.k === 'play') return <Arena key={phase.session} make={make} seed={phase.seed} seconds={phase.seconds} onEnd={(sc) => void finish(phase.session, sc)} />;
  const bg = w ? `radial-gradient(120% 80% at 50% 0%, ${w.color2} 0%, #05060F 72%)` : '#05060F';
  return (
    <div className="lv-space fixed inset-0 overflow-y-auto text-white" style={{ background: bg }} data-testid="planet-game">
      <div className="mx-auto grid min-h-full max-w-md content-center gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))]">
        <button onClick={back} className="flex w-fit items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Back to {w?.name ?? 'the planet'}</button>
        <AnimatePresence mode="wait">
          {phase.k === 'intro' && (
            <motion.div key="intro" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3 text-center">
              <div className="text-6xl">{info.emoji}</div>
              <h1 className="font-display text-3xl font-bold">{info.name}</h1>
              <p className="text-white/80">{info.blurb}</p>
              <p className="rounded-2xl bg-white/10 p-3 text-sm text-white/80">{info.how}</p>
              <p className="text-[11px] text-white/60">The first 3 rounds a day on each of your plots pay Ink.{left != null ? ` ${left} paid round${left === 1 ? '' : 's'} left here today.` : ''}</p>
              <Button variant="rainbow" size="lg" loading={busy} onClick={start} data-testid="planet-game-start"><Play className="h-5 w-5" /> Play</Button>
            </motion.div>
          )}
          {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="py-24 text-center font-display text-8xl font-black">{phase.n}</motion.div>}
          {phase.k === 'done' && (
            <motion.div key="done" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="grid justify-items-center gap-3 text-center" data-testid="planet-game-done">
              <div className="text-5xl">{info.emoji}</div>
              <div className="text-sm uppercase tracking-widest text-white/60">Score</div>
              <div className="font-display text-6xl font-black">{phase.score}</div>
              {phase.best != null && <div className="text-xs text-white/60">Best: {phase.best}</div>}
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold"><ResourceIcon r="ink" className="h-5 w-5" /> +{phase.paid} Ink</div>
              {!phase.rewarded && <p className="text-xs text-white/70">That was a just-for-fun round — this plot’s paid rounds are used up for today.</p>}
              {phase.capped && <p className="text-xs text-white/70">You’ve hit today’s planet Ink limit — it resets this evening.</p>}
              <div className="flex gap-2">
                <Button variant="rainbow" onClick={() => setPhase({ k: 'intro' })}><RotateCcw className="h-4 w-4" /> Again</Button>
                <Button variant="secondary" onClick={back}>Back to {w?.name ?? 'the planet'}</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
