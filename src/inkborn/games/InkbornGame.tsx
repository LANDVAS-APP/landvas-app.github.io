// /inkborn/play/:game/:id — play a round as your Inkborn. Starting a round uses some of the
// creature's energy; the server sets the layout (seed), checks the round ran its full time and
// pays Ink for the score, under the shared Inkborn daily cap.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import { holdUpdates } from '../../app/updates';
import { config } from '../../env';
import { invalidateGame, useOnboardedMe } from '../../lib/queries';
import { Button, ResourceIcon, Spinner } from '../../ui';
import { confettiCannons } from '../../ui/confetti';
import { CreatureView } from '../CreatureView';
import { cleanGenome } from '../genome';
import { AdButton } from '../../ads/AdButton';
import { ENGINES, GAMES, type Engine, type GameId, type GameInput } from './engines';

type Phase = { k: 'intro' } | { k: 'count'; n: number; session: string; seed: number; seconds: number } | { k: 'play'; session: string; seed: number; seconds: number }
  | { k: 'done'; session: string; score: number; earned: number; paid: number; capped: boolean; best: number | null; doubled?: boolean };

export default function InkbornGame() {
  const { game, id } = useParams();
  const g = (game && game in GAMES ? game : 'berrydash') as GameId;
  const info = GAMES[g];
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const sanct = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me });
  const eco = useQuery({ queryKey: ['inkborn-economy'], queryFn: api.inkbornEconomy, enabled: !!me });
  const c = sanct.data?.creatures.find((x) => x.id === id) ?? null;
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [busy, setBusy] = useState(false);
  const cfg = eco.data?.games[g];

  const start = async () => {
    if (!c) return;
    setBusy(true);
    try {
      const s = await api.inkbornGameStart(c.id, g);
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      setPhase({ k: 'count', n: 3, session: s.session, seed: s.seed, seconds: s.seconds });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, seconds: phase.seconds }), 700);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    try {
      const r = await api.inkbornGameFinish(session, score);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['inkborn-economy'] });
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      if (r.paid > 0) confettiCannons();
      setPhase({ k: 'done', session, score: r.score, earned: r.earned, paid: r.paid, capped: r.capped, best: r.best });
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase({ k: 'done', session, score, earned: 0, paid: 0, capped: false, best: null });
    }
  };

  if (!me || sanct.isLoading) return <div className="fixed inset-0 flex items-center justify-center bg-[#0f2a1a]"><Spinner /></div>;
  if (!c) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#0f2a1a] p-6 text-center text-white"><p>That Inkborn isn’t yours.</p><Link to="/inkborn"><Button variant="secondary">Back</Button></Link></div>;
  const genome = cleanGenome(c.genome);
  const enough = c.energy >= (cfg?.energy ?? 15);

  if (phase.k === 'play') return <Arena key={phase.session} game={g} genome={genome} seed={phase.seed} seconds={phase.seconds} onEnd={(s) => void finish(phase.session, s)} />;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_0%,#24365f_0%,#0f2a1a_70%)] text-white" data-testid="inkborn-game">
      <div className="mx-auto grid min-h-full max-w-md content-center gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))]">
        <button onClick={() => nav(-1)} className="flex w-fit items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Back</button>
        <AnimatePresence mode="wait">
          {phase.k === 'intro' && (
            <motion.div key="intro" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3 text-center">
              <div className="text-5xl">{info.emoji}</div>
              <h1 className="font-display text-3xl font-bold">{info.name}</h1>
              <p className="text-white/80">{info.blurb}</p>
              <CreatureView genome={genome} size={170} state="happy" />
              <div className="font-display text-lg font-semibold">Playing as {c.name}</div>
              <p className="rounded-2xl bg-white/10 p-3 text-sm text-white/80">{info.how}</p>
              {cfg && (
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-3 py-1">⏱ {cfg.seconds}s</span>
                  <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1"><Zap className="h-3 w-3 text-[#FFC93D]" /> uses {cfg.energy} energy (has {c.energy})</span>
                  <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1"><ResourceIcon r="ink" className="h-3 w-3" /> up to {cfg.max_ink} Ink</span>
                </div>
              )}
              {eco.data && <p className="text-[11px] text-white/60">Inkborn Ink today: {eco.data.ink_today}/{eco.data.daily_cap}</p>}
              {!enough && <AdButton reward="inkborn_energy" refId={c.id} label={`Watch an ad to wake ${c.name} up`} done={`${c.name} is full of beans!`} />}
              <Button variant="rainbow" size="lg" disabled={!enough} loading={busy} onClick={start} data-testid="game-start"><Play className="h-5 w-5" /> {enough ? 'Play' : `${c.name} is too sleepy — let them rest`}</Button>
            </motion.div>
          )}
          {phase.k === 'count' && (
            <motion.div key={`c${phase.n}`} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="py-24 text-center font-display text-8xl font-black">{phase.n}</motion.div>
          )}
          {phase.k === 'done' && (
            <motion.div key="done" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="grid justify-items-center gap-3 text-center" data-testid="game-done">
              <CreatureView genome={genome} size={150} state={phase.score > 0 ? 'happy' : 'idle'} />
              <div className="text-sm uppercase tracking-widest text-white/60">Score</div>
              <div className="font-display text-6xl font-black" data-testid="game-score">{phase.score}</div>
              {phase.best != null && <div className="text-xs text-white/60">Best: {phase.best}</div>}
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold" data-testid="game-ink"><ResourceIcon r="ink" className="h-5 w-5" /> +{phase.paid} Ink</div>
              {phase.paid > 0 && !phase.doubled && <AdButton reward="game_double" refId={phase.session} label={`Watch an ad: double to ${phase.paid * 2} Ink`} done={`+${phase.paid} more Ink!`} onDone={() => setPhase({ ...phase, doubled: true, paid: phase.paid * 2 })} />}
              {phase.capped && <p className="text-xs text-white/70">You’ve hit today’s Inkborn Ink limit — it resets this evening.</p>}
              <div className="flex gap-2">
                <Button variant="rainbow" onClick={() => setPhase({ k: 'intro' })}><RotateCcw className="h-4 w-4" /> Again</Button>
                <Button variant="secondary" onClick={() => nav(c.habitat_id ? `/habitat/${c.habitat_id}` : '/inkborn')}>Back to {c.name}’s home</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Arena({ game, genome, seed, seconds, onEnd }: { game: GameId; genome: ReturnType<typeof cleanGenome>; seed: number; seconds: number; onEnd(score: number): void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, left: seconds });
  const input = useRef<GameInput>({ joy: { x: 0, y: 0 }, keys: new Set(), tap: null, target: null });
  const ended = useRef(false);
  useEffect(() => holdUpdates(), []);
  useEffect(() => {
    const c = cv.current!;
    const g = c.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const engine: Engine = ENGINES[game](genome, seed, W, H, input.current);
    if (config.e2e || import.meta.env.DEV) (window as any).__landvasInkGame = { engine, input: input.current };
    let raf = 0, last = performance.now(), t = 0, shown = -1;
    const t0 = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      engine.step(dt, t);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      engine.draw(g, W, H, t);
      // the clock runs on real time, so a slow device doesn't get a longer round
      const left = Math.max(0, seconds - (now - t0) / 1000);
      const sc = engine.score();
      if (Math.ceil(left) !== shown || sc !== hud.score) { shown = Math.ceil(left); setHud({ score: sc, left: Math.ceil(left) }); }
      if (left <= 0 && !ended.current) { ended.current = true; onEnd(sc); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const kd = (e: KeyboardEvent) => { input.current.keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow')) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => input.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  return (
    <div className="fixed inset-0 select-none bg-black text-white" data-testid="inkborn-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); input.current.tap = p; input.current.target = p; }}
        onPointerMove={(e) => { if (e.buttons) input.current.target = pos(e); }}
        onPointerUp={() => { input.current.target = null; }} onPointerCancel={() => { input.current.target = null; }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3 pt-[max(12px,env(safe-area-inset-top,0px))] font-display text-xl font-black">
        <span className="rounded-2xl bg-black/50 px-4 py-1.5" data-testid="arena-score">⭐ {hud.score}</span>
        <span className="rounded-2xl bg-black/50 px-4 py-1.5">⏱ {hud.left}</span>
      </div>
    </div>
  );
}
