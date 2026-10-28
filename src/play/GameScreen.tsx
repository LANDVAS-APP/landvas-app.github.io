// /play/:game?gx&gy — intro → server session → play → server-validated results.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Gamepad2, Map as MapIcon, RotateCcw, Sparkles, Star, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GamePreview } from './GamePreview';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { MinigameFinish, MinigameStart } from '../backend/types';
import { config } from '../env';
import { celebrate, invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { cn, fmt, plotLabel } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { rarityInfo } from '../shared/rarity';
import { Button, ResourceIcon, Spinner } from '../ui';
import { ColorBurstGame } from './games/ColorBurst';
import { LightLinesGame } from './games/LightLines';
import { PatternShiftGame } from './games/PatternShift';
import { TraceCraftGame } from './games/TraceCraft';
import type { GameProps } from './common';
import { RarityBadge } from '../plot/RarityBadge';

const GAMES: Record<GameId, (p: GameProps) => React.ReactElement | null> = {
  lightlines: LightLinesGame,
  patternshift: PatternShiftGame,
  colorburst: ColorBurstGame,
  tracecraft: TraceCraftGame,
};
const TYPE_OF: Record<GameId, keyof typeof PLOT_TYPES> = { tracecraft: 'graphite', colorburst: 'pigment', patternshift: 'mosaic', lightlines: 'lumina' };

type Phase = { k: 'intro' } | { k: 'starting' } | { k: 'playing'; s: MinigameStart; t0: number } | { k: 'submitting' } | { k: 'results'; r: MinigameFinish; level: number };

export default function GameScreen() {
  const { game: gameParam } = useParams();
  const game = (gameParam ?? 'lightlines') as GameId;
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const world = useWorld();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me });
  const info = GAME_INFO[game];
  const type = TYPE_OF[game];
  const t = PLOT_TYPES[type];

  // which plot to play on: the one in the URL, else the best-paying plot of this type
  const candidates = useMemo(() => (plots.data ?? []).filter((p: any) => p.plot_type === type)
    .sort((a: any, b: any) => rarityInfo(b.rarity).ink_reward_multiplier * (1 + 0.05 * (b.level - 1)) - rarityInfo(a.rarity).ink_reward_multiplier * (1 + 0.05 * (a.level - 1))), [plots.data, type]);
  const urlCell = sp.get('gx') ? { gx: Number(sp.get('gx')), gy: Number(sp.get('gy')) } : null;
  const [cell, setCell] = useState<{ gx: number; gy: number } | null>(urlCell);
  useEffect(() => {
    if (!cell && candidates[0]) setCell({ gx: candidates[0].gx, gy: candidates[0].gy });
  }, [candidates, cell]);
  const plot = candidates.find((p: any) => cell && p.gx === cell.gx && p.gy === cell.gy);

  const rec = records.data?.records?.[game];
  const unlocked = Math.min((rec?.highest_level ?? 0) + 1, Number(world.data?.minigames?.max_level ?? 60));
  const [level, setLevel] = useState<number | null>(null);
  const lvl = level ?? unlocked;
  const limit = records.data?.daily_rewarded_wins_per_game ?? 6;
  const usedToday = records.data?.rewarded_today?.[game] ?? 0;
  const leftToday = Math.max(0, limit - usedToday);

  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const solver = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!(config.e2e || import.meta.env.DEV)) return;
    (window as any).__landvasGame = phase.k === 'playing' ? { autoSolve: () => solver.current?.() } : undefined;
    return () => { (window as any).__landvasGame = undefined; };
  }, [phase.k]);

  const start = async (lv: number) => {
    if (!cell) return;
    setPhase({ k: 'starting' });
    try {
      const s = await api.startMinigame(game, lv, cell.gx, cell.gy);
      setPhase({ k: 'playing', s, t0: performance.now() });
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase({ k: 'intro' });
    }
  };
  const finish = async (s: MinigameStart, log: unknown) => {
    setPhase({ k: 'submitting' });
    try {
      const r = await api.finishMinigame(s.session_id, log);
      celebrate(r.achievements);
      invalidateGame(qc);
      setPhase({ k: 'results', r, level: s.level });
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase({ k: 'intro' });
    }
  };

  if (!me) return <div className="flex h-dvh items-center justify-center"><Spinner /></div>;
  const Game = GAMES[game];
  return (
    <div className="flex min-h-dvh flex-col bg-bg" style={{ backgroundImage: `radial-gradient(1200px 600px at 50% -10%, ${t.a}22, transparent 60%), radial-gradient(900px 500px at 100% 100%, ${t.b}18, transparent 60%)` }}>
      <header className="gutter flex items-center gap-3 pb-2 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={() => (phase.k === 'playing' ? setPhase({ k: 'intro' }) : nav(-1))} className="glass flex h-10 w-10 items-center justify-center rounded-2xl" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{t.name} plot{plot ? ` · ${plotLabel(plot.gx, plot.gy)}` : ''}</div>
          <h1 className="truncate font-display text-lg font-semibold">{info.name}{phase.k === 'playing' ? ` · Level ${phase.s.level}` : ''}</h1>
        </div>
        <div className="glass flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold" title="Wins that pay Ink today">
          <ResourceIcon r="ink" /> {leftToday}/{limit} left
        </div>
      </header>

      <main className="gutter flex flex-1 flex-col items-center justify-center pb-[max(20px,env(safe-area-inset-bottom,0px))]">
        {phase.k === 'intro' && (
          <div className="glass w-full max-w-lg rounded-[28px] p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <GamePreview game={game} size={104} className="shrink-0 shadow-lg ring-1 ring-white/10" />
              <div>
                <div className="eyebrow" style={{ color: t.a }}>{t.name} plots</div>
                <h2 className="font-display text-xl font-semibold">{info.name}</h2>
                <p className="text-sm text-muted">{info.tagline}</p>
              </div>
            </div>
            <ol className="mt-4 grid gap-2 text-sm text-muted">
              {info.howTo.map((h, i) => <li key={i} className="flex gap-2"><span className="font-bold text-fg">{i + 1}.</span>{h}</li>)}
            </ol>
            {!candidates.length && !plots.isLoading && (
              <p className="mt-4 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">You need a {t.name} plot to play {info.name}. Plot types are revealed when you claim them — keep claiming to find one.</p>
            )}
            {candidates.length > 1 && (
              <div className="mt-4">
                <div className="eyebrow mb-2">Play on</div>
                <div className="flex flex-wrap gap-2">
                  {candidates.slice(0, 8).map((p: any) => (
                    <button key={`${p.gx}_${p.gy}`} onClick={() => setCell({ gx: p.gx, gy: p.gy })}
                      className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs', cell?.gx === p.gx && cell?.gy === p.gy ? 'border-accent-2 bg-accent-2/10' : 'border-line')}>
                      <RarityBadge r={p.rarity} small /> L{p.level}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4">
              <div className="eyebrow mb-2">Level</div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto scroll-thin">
                {Array.from({ length: unlocked }, (_, i) => i + 1).reverse().slice(0, 30).map((n) => (
                  <button key={n} onClick={() => setLevel(n)} className={cn('h-9 min-w-9 rounded-xl border px-2 text-sm font-bold tnum', n === lvl ? 'border-accent-2 bg-accent-2/15 text-fg' : 'border-line text-muted hover:text-fg')}>{n}</button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface/50 p-3 text-sm">
              <span className="text-muted">{leftToday > 0 ? 'A win pays' : 'Practice mode until reset'}</span>
              <span className="flex items-center gap-1.5 font-bold">
                {leftToday > 0 ? <><ResourceIcon r="ink" /> ~{fmt(estimateInk(world.data, lvl, plot, game))} Ink {plot && <RarityBadge r={plot.rarity} small />}</> : <span className="text-faint">resets {records.data?.resets_at ? new Date(records.data.resets_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'daily'}</span>}
              </span>
            </div>
            {rec && <p className="mt-2 text-xs text-faint tnum">Best {fmt(rec.best_score)} · {rec.wins} wins · highest level {rec.highest_level}</p>}
            <Button variant="rainbow" size="lg" className="mt-4 w-full" disabled={!cell || !candidates.length} onClick={() => start(lvl)} data-testid="game-start">
              <Sparkles className="h-4 w-4" /> Play level {lvl}
            </Button>
          </div>
        )}
        {(phase.k === 'starting' || phase.k === 'submitting') && (
          <div className="grid justify-items-center gap-3 text-muted"><Spinner className="h-8 w-8" />{phase.k === 'submitting' ? 'Checking your run…' : 'Setting up the level…'}</div>
        )}
        {phase.k === 'playing' && (
          <Game key={phase.s.session_id} seed={Number(phase.s.seed)} level={phase.s.level}
            now={() => performance.now() - phase.t0}
            onDone={(log) => void finish(phase.s, log)}
            registerSolver={(fn) => { solver.current = fn; }} />
        )}
        {phase.k === 'results' && <Results r={phase.r} level={phase.level} unlocked={unlocked} onAgain={(n) => { setLevel(n); void start(n); }} onMap={() => nav('/world')} />}
      </main>
    </div>
  );
}

function estimateInk(world: any, level: number, plot: any, game?: string) {
  const mg = world?.minigames ?? {};
  const rw = mg.rewards ?? { base_ink: 20, ink_per_level: 2, score_ink_divisor: 80 };
  const levelBonus = 1 + Number(mg.plot_level_bonus ?? 0.05) * ((plot?.level ?? 1) - 1);
  const mult = (plot ? rarityInfo(plot.rarity).ink_reward_multiplier * levelBonus : 1)
    * Number(mg.ink_multiplier ?? 1) * Number((game && mg.games?.[game]?.ink_multiplier) ?? 1);
  return Math.floor((Number(rw.base_ink) + Number(rw.ink_per_level) * level + 600 / Math.max(Number(rw.score_ink_divisor), 1)) * mult);
}

function Results({ r, level, unlocked, onAgain, onMap }: { r: MinigameFinish; level: number; unlocked: number; onAgain(n: number): void; onMap(): void }) {
  const nav = useNavigate();
  return (
    <div className="glass w-full max-w-md rounded-[28px] p-6 text-center" data-testid="game-results">
      <div className="flex justify-center gap-1.5">
        {[1, 2, 3].map((s) => <Star key={s} className={cn('h-9 w-9', s <= r.stars ? 'fill-gold text-gold drop-shadow-[0_0_12px_rgba(255,201,61,0.6)]' : 'text-line-strong')} />)}
      </div>
      <h2 className="mt-3 font-display text-2xl font-semibold">{r.passed ? `Level ${level} cleared!` : r.status === 'expired' ? 'Session expired' : 'Not quite'}</h2>
      <p className="mt-1 text-sm text-muted tnum">Score {fmt(r.score)}{r.new_best ? ' · new best!' : ''}</p>
      {r.passed && (
        <div className="mt-4 grid gap-2 rounded-2xl border border-line bg-surface/50 p-4">
          {r.rewards.ink > 0 ? (
            <div className="flex items-center justify-center gap-2 font-display text-xl font-semibold"><ResourceIcon r="ink" className="h-6 w-6" /> +{fmt(r.rewards.ink)} Ink</div>
          ) : r.rewards.practice ? (
            <p className="text-sm text-muted">Practice win — today's Ink-paying wins for this game are used up. They reset daily.</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3 text-sm text-muted">
            {r.rewards.pigments > 0 && <span className="flex items-center gap-1"><ResourceIcon r="pigments" /> +{r.rewards.pigments}</span>}
            {r.rewards.brush_points > 0 && <span className="flex items-center gap-1"><ResourceIcon r="brush_points" /> +{r.rewards.brush_points} XP</span>}
            {r.rewards.held && <span className="text-warn">Rewards held for a quick review</span>}
          </div>
          {r.rewards.ink > 0 && <p className="text-xs text-faint">{r.rewards.rewarded_left} Ink-paying win{r.rewards.rewarded_left === 1 ? '' : 's'} left today for this game.</p>}
        </div>
      )}
      <div className="mt-5 grid gap-2">
        {r.passed && level + 1 <= Math.max(unlocked, level + 1) && (
          <Button variant="rainbow" size="lg" onClick={() => onAgain(level + 1)} data-testid="game-next"><Trophy className="h-4 w-4" /> Next level ({level + 1})</Button>
        )}
        <Button variant={r.passed ? 'secondary' : 'primary'} onClick={() => onAgain(level)} data-testid="game-replay"><RotateCcw className="h-4 w-4" /> {r.passed ? 'Replay' : 'Try again'}</Button>
        <Button variant="ghost" onClick={() => { onMap(); nav('/world'); }}><MapIcon className="h-4 w-4" /> Back to the map — buy plots with Ink</Button>
      </div>
    </div>
  );
}
