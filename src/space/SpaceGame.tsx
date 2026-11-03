// /space/play/:game — a space minigame round. The server sets the seed, checks the round ran its
// full time, and pays Ink for the score under the space daily cap.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { holdUpdates } from '../app/updates';
import { config } from '../env';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { Button, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import type { Engine, GameInput } from '../inkborn/games/engines';
import { Rocket } from './Rocket';
import { SPACE_ENGINES, SPACE_GAMES, type SpaceGameId } from './games';
import { SPACE_KEY, useSpace } from './useSpace';

type Phase = { k: 'intro' } | { k: 'count'; n: number; session: string; seed: number; seconds: number } | { k: 'play'; session: string; seed: number; seconds: number }
  | { k: 'done'; score: number; paid: number; capped: boolean; best: number | null };

/** A fresh round screen for each game (switching games must not carry a round across). */
export default function SpaceGameRoute() {
  const { game } = useParams();
  return <SpaceGame key={game} />;
}

function SpaceGame() {
  const { game } = useParams();
  const g = (game && game in SPACE_GAMES ? game : 'asteroids') as SpaceGameId;
  const info = SPACE_GAMES[g];
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const s = useSpace();
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [busy, setBusy] = useState(false);
  const cfg = s.data?.config.games[g];

  const start = async () => {
    setBusy(true);
    try {
      const r = await api.spaceGameStart(g);
      setPhase({ k: 'count', n: 3, session: r.session, seed: r.seed, seconds: r.seconds });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, seconds: phase.seconds }), 700);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    try {
      const r = await api.spaceGameFinish(session, score);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: SPACE_KEY });
      if (r.paid > 0) confettiCannons();
      setPhase({ k: 'done', score: r.score, paid: r.paid, capped: r.capped, best: r.best });
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase({ k: 'done', score, paid: 0, capped: false, best: null });
    }
  };

  if (!me || s.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#05060F]"><Spinner /></div>;
  if (phase.k === 'play') return <Arena key={phase.session} game={g} seed={phase.seed} seconds={phase.seconds} onEnd={(sc) => void finish(phase.session, sc)} />;
  const built = !!s.data?.built;
  return (
    <div className="lv-space fixed inset-0 overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_0%,#2A1E5E_0%,#05060F_70%)] text-white" data-testid="space-game">
      <div className="mx-auto grid min-h-full max-w-md content-center gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))]">
        <button onClick={() => nav('/space')} className="flex w-fit items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Mission control</button>
        <AnimatePresence mode="wait">
          {phase.k === 'intro' && (
            <motion.div key="intro" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3 text-center">
              <div className="text-5xl">{info.emoji}</div>
              <h1 className="font-display text-3xl font-bold">{info.name}</h1>
              <p className="text-white/80">{info.blurb}</p>
              <Rocket parts={s.data?.parts ?? []} engine={s.data?.engine} flame size={150} accent={me.profile.accent_color ?? '#8B5CFF'} />
              <p className="rounded-2xl bg-white/10 p-3 text-sm text-white/80">{info.how}</p>
              {cfg && (
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-3 py-1">⏱ {cfg.seconds}s</span>
                  <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1"><ResourceIcon r="ink" className="h-3 w-3" /> up to {cfg.max_ink} Ink</span>
                </div>
              )}
              {s.data && <p className="text-[11px] text-white/60">Space Ink today: {s.data.ink_today}/{s.data.config.daily_cap}</p>}
              <Button variant="rainbow" size="lg" disabled={!built} loading={busy} onClick={start} data-testid="space-game-start"><Play className="h-5 w-5" /> {built ? 'Play' : 'Build your rocket first'}</Button>
            </motion.div>
          )}
          {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="py-24 text-center font-display text-8xl font-black">{phase.n}</motion.div>}
          {phase.k === 'done' && (
            <motion.div key="done" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="grid justify-items-center gap-3 text-center" data-testid="space-game-done">
              <div className="text-5xl">{info.emoji}</div>
              <div className="text-sm uppercase tracking-widest text-white/60">Score</div>
              <div className="font-display text-6xl font-black" data-testid="space-game-score">{phase.score}</div>
              {phase.best != null && <div className="text-xs text-white/60">Best: {phase.best}</div>}
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold"><ResourceIcon r="ink" className="h-5 w-5" /> +{phase.paid} Ink</div>
              {phase.capped && <p className="text-xs text-white/70">You’ve hit today’s space Ink limit — it resets this evening.</p>}
              <div className="flex gap-2">
                <Button variant="rainbow" onClick={() => setPhase({ k: 'intro' })}><RotateCcw className="h-4 w-4" /> Again</Button>
                <Button variant="secondary" onClick={() => nav('/space')}>Mission control</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Arena({ game, seed, seconds, onEnd }: { game: SpaceGameId; seed: number; seconds: number; onEnd(score: number): void }) {
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
    const engine: Engine = SPACE_ENGINES[game](seed, W, H, input.current);
    if (config.e2e || import.meta.env.DEV) (window as any).__landvasSpaceGame = { engine, input: input.current };
    let raf = 0, last = performance.now(), t = 0, shown = -1, lastScore = -1;
    const t0 = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      engine.step(dt, t);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      engine.draw(g, W, H, t);
      const left = Math.max(0, seconds - (now - t0) / 1000);
      const sc = engine.score();
      if (Math.ceil(left) !== shown || sc !== lastScore) { shown = Math.ceil(left); lastScore = sc; setHud({ score: sc, left: Math.ceil(left) }); }
      if (left <= 0 && !ended.current) { ended.current = true; onEnd(sc); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const kd = (e: KeyboardEvent) => { input.current.keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault(); };
    const ku = (e: KeyboardEvent) => input.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { cancelAnimationFrame(raf); engine.dispose?.(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  return (
    <div className="fixed inset-0 select-none bg-black text-white" data-testid="space-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ } const p = pos(e); input.current.tap = p; input.current.target = p; }}
        onPointerMove={(e) => { if (e.buttons) input.current.target = pos(e); }}
        onPointerUp={() => { input.current.target = null; }} onPointerCancel={() => { input.current.target = null; }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3 pt-[max(12px,env(safe-area-inset-top,0px))] font-display text-xl font-black">
        <span className="rounded-2xl bg-black/50 px-4 py-1.5" data-testid="space-arena-score">⭐ {hud.score}</span>
        <span className="rounded-2xl bg-black/50 px-4 py-1.5">⏱ {hud.left}</span>
      </div>
    </div>
  );
}
