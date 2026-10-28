// /play/:game?gx&gy — intro → server session → play → server-validated results.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronRight, Gamepad2, Map as MapIcon, RotateCcw, Sparkles, Star, Trophy } from 'lucide-react';
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
import { boardsGame } from './games/Boards';
import { HueFlowBoard } from './games/HueFlow';
import { MemoryMuralBoard } from './games/MemoryMural';
import { MirrorlineBoard } from './games/Mirrorline';
import { SculptorBoard } from './games/Sculptor';
import type { GameProps } from './common';
import { RarityBadge } from '../plot/RarityBadge';

const GAMES: Record<GameId, (p: GameProps) => React.ReactElement | null> = {
  lightlines: boardsGame('lightlines', LightLinesGame),
  patternshift: boardsGame('patternshift', PatternShiftGame),
  colorburst: ColorBurstGame,
  tracecraft: TraceCraftGame,
  memorymural: boardsGame('memorymural', MemoryMuralBoard),
  sculptor: boardsGame('sculptor', SculptorBoard),
  hueflow: boardsGame('hueflow', HueFlowBoard),
  mirrorline: boardsGame('mirrorline', MirrorlineBoard),
};
const TYPE_OF = Object.fromEntries(Object.entries(GAME_INFO).map(([g, i]) => [g, i.plotType])) as Record<GameId, keyof typeof PLOT_TYPES>;

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
  const plotProgress = useQuery({ queryKey: qk.plotProgress, queryFn: api.myPlotProgress, enabled: !!me });
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
  // every plot keeps its own fresh level ladder
  const prog = cell ? plotProgress.data?.[`${cell.gx}_${cell.gy}`] : undefined;
  const gameCfg = world.data?.minigames?.games?.[game] ?? {};
  const maxLevel = Number(gameCfg.max_level ?? world.data?.minigames?.max_level ?? 60);
  const unlocked = Math.min((prog?.highest_level ?? 0) + 1, maxLevel);
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => { setLevel(null); }, [cell?.gx, cell?.gy]);
  const lvl = level ?? unlocked;
  const rounds = Math.max(1, Math.min(10, Number(gameCfg.rounds ?? 5)));
  const nextPlot = (() => {
    if (candidates.length < 2 || !cell) return null;
    const k = candidates.findIndex((p: any) => p.gx === cell.gx && p.gy === cell.gy);
    const n = candidates[(k + 1) % candidates.length];
    return { gx: n.gx, gy: n.gy };
  })();
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
            {candidates.length > 0 && (
              <PlotPicker plots={candidates} progress={plotProgress.data} maxLevel={maxLevel} cell={cell} onPick={(c) => { setCell(c); nav(`/play/${game}?gx=${c.gx}&gy=${c.gy}`, { replace: true }); }} />
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
              <span className="text-muted">{leftToday > 0 ? `Each round you clear pays` : 'Practice mode until reset'}</span>
              <span className="flex items-center gap-1.5 font-bold">
                {leftToday > 0 ? <><ResourceIcon r="ink" /> ~{fmt(Math.floor(estimateInk(world.data, lvl, plot, game) / rounds))} Ink {plot && <RarityBadge r={plot.rarity} small />}</> : <span className="text-faint">resets {records.data?.resets_at ? new Date(records.data.resets_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'daily'}</span>}
              </span>
              <span className="w-full text-xs text-faint">Clear all {rounds} rounds (~{fmt(estimateInk(world.data, lvl, plot, game))} Ink) to unlock level {Math.min(lvl + 1, maxLevel)} on this plot.</span>
            </div>
            <p className="mt-2 text-xs text-faint tnum">This plot: {prog ? `level ${prog.highest_level} cleared · ${prog.wins} wins` : 'fresh — starts at level 1'} · max level {maxLevel}{rec ? ` · best ever ${fmt(rec.best_score)}` : ''}</p>
            <Button variant="rainbow" size="lg" className="mt-4 w-full" disabled={!cell || !candidates.length} onClick={() => start(lvl)} data-testid="game-start">
              <Sparkles className="h-4 w-4" /> Play level {lvl}
            </Button>
          </div>
        )}
        {(phase.k === 'starting' || phase.k === 'submitting') && (
          <div className="grid justify-items-center gap-3 text-muted"><Spinner className="h-8 w-8" />{phase.k === 'submitting' ? 'Checking your run…' : 'Setting up the level…'}</div>
        )}
        {phase.k === 'playing' && (
          <Game key={phase.s.session_id} seed={Number(phase.s.seed)} level={phase.s.level} rounds={phase.s.rounds ?? undefined}
            now={() => performance.now() - phase.t0}
            onDone={(log) => void finish(phase.s, log)}
            registerSolver={(fn) => { solver.current = fn; }} />
        )}
        {phase.k === 'results' && <Results r={phase.r} level={phase.level} unlocked={unlocked} onAgain={(n) => { setLevel(n); void start(n); }} onMap={() => nav('/world')}
          onNextPlot={nextPlot ? () => { setCell(nextPlot); nav(`/play/${game}?gx=${nextPlot.gx}&gy=${nextPlot.gy}`, { replace: true }); setPhase({ k: 'intro' }); } : undefined} />}
      </main>
    </div>
  );
}

/** Every plot of this game's type, with its own minigame level — tap one to level it up. */
function PlotPicker({ plots, progress, maxLevel, cell, onPick }: {
  plots: any[]; progress?: Record<string, { highest_level: number; wins: number }>; maxLevel: number;
  cell: { gx: number; gy: number } | null; onPick(c: { gx: number; gy: number }): void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? plots : plots.slice(0, 6);
  return (
    <div className="mt-4" data-testid="plot-picker">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="eyebrow">{plots.length === 1 ? 'Your plot' : `Pick a plot to level up · ${plots.length}`}</div>
        <div className="text-[11px] text-faint">each plot levels up on its own</div>
      </div>
      <div className="grid max-h-72 gap-1.5 overflow-y-auto scroll-thin pr-0.5">
        {shown.map((p: any) => {
          const key = `${p.gx}_${p.gy}`;
          const done = progress?.[key]?.highest_level ?? 0;
          const on = cell?.gx === p.gx && cell?.gy === p.gy;
          const maxed = done >= maxLevel;
          return (
            <button key={key} onClick={() => onPick({ gx: p.gx, gy: p.gy })} aria-pressed={on} data-testid="plot-pick"
              className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition', on ? 'border-accent-2 bg-accent-2/10 shadow-[0_0_0_1px_rgba(34,227,255,0.35)]' : 'border-line hover:border-line-strong')}>
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border', on ? 'border-accent-2 bg-accent-2 text-bg' : 'border-line-strong')}>{on && <Check className="h-3.5 w-3.5" />}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.name || plotLabel(p.gx, p.gy)}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted"><RarityBadge r={p.rarity} small /> upgrade Lv {p.level}</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#22E3FF,#8B5CFF)]" style={{ width: `${Math.min(100, (done / Math.max(1, maxLevel)) * 100)}%` }} /></span>
              </span>
              <span className="text-right">
                <span className="block font-display text-base font-semibold tnum">{maxed ? 'MAX' : `Lv ${done + 1}`}</span>
                <span className="block text-[10px] text-faint tnum">{done}/{maxLevel} cleared</span>
              </span>
            </button>
          );
        })}
      </div>
      {plots.length > 6 && <button className="mt-1.5 text-xs font-semibold text-accent-2" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${plots.length} plots`}</button>}
    </div>
  );
}

function estimateInk(world: any, level: number, plot: any, game?: string) {
  const mg = world?.minigames ?? {};
  const rw = mg.rewards ?? { base_ink: 20, ink_per_level: 2, score_ink_divisor: 80 };
  const g = (game && mg.games?.[game]) ?? {};
  const base = Number(g.base_ink ?? rw.base_ink), perLevel = Number(g.ink_per_level ?? rw.ink_per_level);
  const levelBonus = 1 + Number(g.plot_level_bonus ?? mg.plot_level_bonus ?? 0.05) * ((plot?.level ?? 1) - 1);
  const mult = (plot ? rarityInfo(plot.rarity).ink_reward_multiplier * levelBonus : 1)
    * Number(mg.ink_multiplier ?? 1) * Number((game && mg.games?.[game]?.ink_multiplier) ?? 1);
  return Math.floor((base + perLevel * level + 600 / Math.max(Number(rw.score_ink_divisor), 1)) * mult);
}

function Results({ r, level, unlocked, onAgain, onMap, onNextPlot }: { r: MinigameFinish; level: number; unlocked: number; onAgain(n: number): void; onMap(): void; onNextPlot?(): void }) {
  const nav = useNavigate();
  const cleared = r.rewards?.rounds_cleared ?? (r.passed ? 1 : 0), total = r.rewards?.rounds ?? 1;
  return (
    <div className="glass w-full max-w-md rounded-[28px] p-6 text-center" data-testid="game-results">
      <div className="flex justify-center gap-1.5">
        {[1, 2, 3].map((s) => <Star key={s} className={cn('h-9 w-9', s <= r.stars ? 'fill-gold text-gold drop-shadow-[0_0_12px_rgba(255,201,61,0.6)]' : 'text-line-strong')} />)}
      </div>
      <h2 className="mt-3 font-display text-2xl font-semibold">{r.passed ? `Level ${level} cleared!` : r.status === 'expired' ? 'Session expired' : 'Not quite'}</h2>
      <p className="mt-1 text-sm text-muted tnum">{total > 1 ? `${cleared} of ${total} rounds cleared · ` : ''}Score {fmt(r.score)}{r.new_best ? ' · new best!' : ''}</p>
      {!r.passed && r.status !== 'expired' && total > 1 && <p className="mt-1 text-xs text-faint">Clear all {total} rounds to unlock the next level{cleared > 0 ? ' — the rounds you cleared still paid Ink.' : '.'}</p>}
      {(r.passed || cleared > 0) && r.rewards && (
        <div className="mt-4 grid gap-2 rounded-2xl border border-line bg-surface/50 p-4">
          {r.rewards.ink > 0 ? (
            <div className="flex items-center justify-center gap-2 font-display text-xl font-semibold"><ResourceIcon r="ink" className="h-6 w-6" /> +{fmt(r.rewards.ink)} Ink</div>
          ) : r.rewards.practice ? (
            <p className="text-sm text-muted">Practice run — today's Ink-paying runs for this game are used up. They reset daily.</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3 text-sm text-muted">
            {r.rewards.pigments > 0 && <span className="flex items-center gap-1"><ResourceIcon r="pigments" /> +{r.rewards.pigments}</span>}
            {r.rewards.brush_points > 0 && <span className="flex items-center gap-1"><ResourceIcon r="brush_points" /> +{r.rewards.brush_points} XP</span>}
            {r.rewards.held && <span className="text-warn">Rewards held for a quick review</span>}
          </div>
          {r.rewards.ink > 0 && <p className="text-xs text-faint">{r.rewards.rewarded_left} Ink-paying run{r.rewards.rewarded_left === 1 ? '' : 's'} left today for this game.</p>}
        </div>
      )}
      <div className="mt-5 grid gap-2">
        {r.passed && level + 1 <= Math.max(unlocked, level + 1) && (
          <Button variant="rainbow" size="lg" onClick={() => onAgain(level + 1)} data-testid="game-next"><Trophy className="h-4 w-4" /> Next level ({level + 1})</Button>
        )}
        <Button variant={r.passed ? 'secondary' : 'primary'} onClick={() => onAgain(level)} data-testid="game-replay"><RotateCcw className="h-4 w-4" /> {r.passed ? 'Replay' : 'Try again'}</Button>
        {onNextPlot && <Button variant="secondary" onClick={onNextPlot} data-testid="game-next-plot"><ChevronRight className="h-4 w-4" /> Level up my next plot</Button>}
        <Button variant="ghost" onClick={() => { onMap(); nav('/world'); }}><MapIcon className="h-4 w-4" /> Back to the map — buy plots with Ink</Button>
      </div>
    </div>
  );
}

// Test-only sandbox (?e2e=1 or dev): plays a game locally and checks it with the
// same validator the server runs. Pays nothing and touches no backend.
export function GameSandbox() {
  const { game } = useParams();
  const [sp] = useSearchParams();
  return <SandboxRun key={`${game}?${sp.toString()}`} />;
}

function SandboxRun() {
  const { game: g } = useParams();
  const game = (g ?? 'lightlines') as GameId;
  const [sp] = useSearchParams();
  const level = Number(sp.get('level') ?? 1), rounds = Number(sp.get('rounds') ?? 5), seed = Number(sp.get('seed') ?? 424242);
  const t0 = useRef(performance.now());
  const solver = useRef<(() => Promise<void>) | null>(null);
  const [result, setResult] = useState<unknown>(null);
  useEffect(() => {
    (window as any).__landvasGame = { autoSolve: () => solver.current?.() };
    return () => { (window as any).__landvasGame = undefined; };
  }, []);
  if (!(config.e2e || import.meta.env.DEV)) return null;
  const Game = GAMES[game];
  return (
    <main className="gutter mx-auto grid max-w-3xl justify-items-center gap-4 py-6">
      {result ? <pre data-testid="sandbox-result" data-game={game} className="text-xs">{JSON.stringify(result)}</pre> : (
        <Game seed={seed} level={level} rounds={rounds} now={() => performance.now() - t0.current}
          onDone={(log) => { void import('../shared/minigames').then((m) => setResult(m.validateMinigame(game, seed, level, log, rounds))); }}
          registerSolver={(fn) => { solver.current = fn; }} />
      )}
    </main>
  );
}
