// A farm game: the intro, a 3-2-1, the game, then your score, Ink and basket of produce.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { Button, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { FARM_ARENAS, FARM_HOW } from './games';
import { farmKey } from './FarmScreen';
import { itemInfo } from './FarmHub';

type Phase = { k: 'intro' } | { k: 'count'; n: number; session: string; seed: number; seconds: number } | { k: 'play'; session: string; seed: number; seconds: number }
  | { k: 'done'; score: number; paid: number; capped: boolean; best: number | null; bonus: Record<string, number>; coins: number };

export default function FarmGame() {
  const { id, game } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const haptics = useUi((s) => s.settings.haptics);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const f = useQuery({ queryKey: farmKey(id!), queryFn: () => api.farmGet(id!) });
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPhase({ k: 'intro' }); }, [game]);
  const info = f.data?.config.games[game!];
  const Arena = FARM_ARENAS[game!];
  const back = () => nav(`/farm/${id}`);
  const start = async () => {
    setBusy(true);
    try { const r = await api.farmGameStart(id!, game!); setPhase({ k: 'count', n: 3, session: r.session, seed: r.seed, seconds: r.seconds }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, seconds: phase.seconds }), 700);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    try {
      const r = await api.farmGameFinish(session, score);
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: farmKey(id!) });
      if (r.paid > 0 || r.level_up) confettiCannons();
      if (r.level_up) toast.success('🌾 Farm level up!', { description: 'Check 📈 Grow for what’s unlocked.' });
      setPhase({ k: 'done', score: r.score, paid: r.paid, capped: r.capped, best: r.best, bonus: r.bonus ?? {}, coins: r.coins ?? 0 });
    } catch (e) { toast.error(toGameError(e).message); setPhase({ k: 'done', score, paid: 0, capped: false, best: null, bonus: {}, coins: 0 }); }
  };
  if (f.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#8FD3FF]"><Spinner /></div>;
  if (!info || !Arena) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#6CB84A] p-6 text-center text-white"><p>That game doesn’t exist.</p><Button onClick={back}>Back to the farm</Button></div>;
  if (phase.k === 'play') return <Arena key={phase.session} seed={phase.seed} seconds={phase.seconds} haptics={haptics} reduce={reduce} onEnd={(sc) => void finish(phase.session, sc)} />;
  return (
    <div className="fixed inset-0 overflow-y-auto text-white" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #9BE07A 0%, #2F7D3A 75%)' }} data-testid="farm-game">
      <div className="mx-auto grid min-h-full max-w-md content-center gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))]">
        <button onClick={back} className="flex w-fit items-center gap-1 rounded-full bg-black/25 px-3 py-1.5 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Back to the farm</button>
        <AnimatePresence mode="wait">
          {phase.k === 'intro' && (
            <motion.div key="intro" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3 text-center">
              <div className="text-7xl">{info.emoji}</div>
              <h1 className="font-display text-3xl font-bold">{info.name}</h1>
              <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-bold uppercase">{info.dim} · {info.seconds} seconds</span>
              <p className="rounded-2xl bg-black/25 p-3 text-sm text-white/90">{FARM_HOW[game!]}</p>
              <p className="text-[11px] text-white/75">Pays up to {info.max_ink} Ink a round (farm Ink is capped at {f.data!.config.daily_cap} a day), plus Farm Coins, XP and a basket of produce for a good score.</p>
              <Button variant="rainbow" size="lg" loading={busy} onClick={start} data-testid="farm-game-start"><Play className="h-5 w-5" /> Play</Button>
            </motion.div>
          )}
          {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="py-24 text-center font-display text-8xl font-black">{phase.n}</motion.div>}
          {phase.k === 'done' && (
            <motion.div key="done" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="grid justify-items-center gap-3 text-center" data-testid="farm-game-done">
              <div className="text-6xl">{info.emoji}</div>
              <div className="text-sm uppercase tracking-widest text-white/75">Score</div>
              <div className="font-display text-6xl font-black">{phase.score}</div>
              {phase.best != null && <div className="text-xs text-white/75">Best: {phase.best}</div>}
              <div className="flex items-center gap-2 rounded-2xl bg-black/25 px-4 py-2 text-lg font-bold"><ResourceIcon r="ink" className="h-5 w-5" /> +{phase.paid} Ink{phase.coins ? <span className="ml-2">🪙 +{phase.coins}</span> : null}</div>
              {Object.entries(phase.bonus).map(([k, n]) => <div key={k} className="rounded-2xl bg-black/20 px-4 py-1.5 text-sm font-bold">🧺 +{n} {itemInfo(f.data!.config, k).emoji} {itemInfo(f.data!.config, k).name.toLowerCase()}</div>)}
              {phase.capped && <p className="text-xs text-white/80">You’ve hit today’s farm Ink limit — it resets tomorrow (you still get the produce).</p>}
              <div className="flex gap-2">
                <Button variant="rainbow" onClick={() => setPhase({ k: 'intro' })} data-testid="farm-game-again"><RotateCcw className="h-4 w-4" /> Again</Button>
                <Button variant="secondary" onClick={back}>Back to the farm</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
