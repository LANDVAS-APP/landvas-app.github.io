// 🎭 The Puppeteer's stage: the real minigame, on strings. The curtain rises on the level the server dealt (its seed, its
// level), the puppet plays it with the game's own solver — human-paced moves — under a wooden cross whose strings tug
// with every round, and the round dots fill as it goes. How far it gets was decided when the curtain rose: a puppet
// that tangles stops in that round. Then the bow: "+1 level complete · +N Ink" once the server has paid it.
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PuppetRun } from '../../backend/api';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { GAME_INFO, type GameId } from '../../shared/minigames';
import { rarityInfo } from '../../shared/rarity';
import { efx } from '../core';
import { feel } from '../living';
import './puppet.css';
import { readable } from '../../lib/readable';

const Game = lazy(async () => {
  const { GAMES } = await import('../../play/gameRegistry');
  return { default: function PuppetGame(p: { game: GameId } & Parameters<(typeof GAMES)[GameId]>[0]) { const G = GAMES[p.game]; return G ? <G {...p} /> : null; } };
});
export { gameName } from './names';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** the wooden cross and its strings, swaying over the game (a tug on every round) */
function Strings({ tug, tangled }: { tug: number; tangled: boolean }) {
  return (
    <div className={cn('lv-pup-crossbox', tangled && 'tangled')}>
    <motion.svg className="lv-pup-cross" viewBox="0 0 200 70" aria-hidden key={tug} initial={{ y: -10, rotate: -3 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 9 }}>
      <defs><linearGradient id="pup-wood2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5C3A1E" /><stop offset="0.5" stopColor="#B07A45" /><stop offset="1" stopColor="#5C3A1E" /></linearGradient></defs>
      <rect x="30" y="10" width="140" height="10" rx="4" fill="url(#pup-wood2)" stroke="#2A1808" strokeWidth="1.2" />
      <rect x="94" y="0" width="12" height="44" rx="4" fill="url(#pup-wood2)" stroke="#2A1808" strokeWidth="1.2" />
      {[[36, 15, 30], [70, 15, 70], [130, 15, 130], [164, 15, 170], [100, 40, 100]].map(([x, y, x2], i) => (
        <line key={i} x1={x} y1={y} x2={tangled && i % 2 ? x2 + 18 : x2} y2={70} stroke={tangled ? '#FF6B6B' : '#FFE8A3'} strokeWidth="1.3" className="lv-pup-thread"
          style={{ filter: tangled ? undefined : 'drop-shadow(0 0 3px #FFD166)' }} />
      ))}
    </motion.svg>
    </div>
  );
}

export function PuppetStage({ run, result, compact, onDone }: { run: PuppetRun; result?: PuppetRun['result'] | null; compact?: boolean; onDone?(): void }) {
  const reduce = useUi((s) => !!s.settings.reduceMotion);
  const solver = useRef<(() => Promise<void>) | null>(null);
  const t0 = useRef(performance.now());
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [dots, setDots] = useState<boolean[]>([]);
  const [tug, setTug] = useState(0);
  const [phase, setPhase] = useState<'curtain' | 'playing' | 'bow' | 'tangled'>('curtain');
  const [toast, setToast] = useState<string | null>(null);
  const stopAt = run.passed ? undefined : run.cleared;
  const info = GAME_INFO[run.game as GameId];

  // the game fits the stage, however big it draws itself
  useLayoutEffect(() => {
    const fit = () => {
      const b = box.current, i = inner.current;
      if (!b || !i) return;
      const w = i.scrollWidth || 1, h = i.scrollHeight || 1;
      setScale(Math.min(1, (b.clientWidth - 8) / w, (b.clientHeight - 8) / h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (inner.current) ro.observe(inner.current);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // the curtain rises, the strings pull, the puppet plays
  useEffect(() => {
    let live = true;
    void (async () => {
      await sleep(reduce ? 200 : 1100);
      if (!live) return;
      setPhase('playing'); feel('light');
      for (let k = 0; k < 40 && !solver.current && live; k++) await sleep(100);
      try { await solver.current?.(); } catch { /* the game went away */ }
      if (!live) return;
      // (a puppet that tangles stops in that round)
      await sleep(run.passed ? 700 : 1200);
      if (!live) return;
      setPhase(run.passed ? 'bow' : 'tangled');
      feel(run.passed ? 'success' : 'heavy');
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the bow, once the server has paid it
  useEffect(() => {
    if ((phase !== 'bow' && phase !== 'tangled') || !result) return;
    const c = box.current?.getBoundingClientRect();
    if (c && phase === 'bow') efx.burst({ x: c.left + c.width / 2, y: c.top + c.height * 0.4, colors: ['#FFE8A3', '#FFB703', '#E63946', '#fff'], count: compact ? 60 : 160, speed: compact ? 8 : 13, kind: 'spark' });
    const t = setTimeout(() => onDone?.(), reduce ? 1500 : 3200);
    return () => clearTimeout(t);
  }, [phase, !!result]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRound = (i: number, ok: boolean) => {
    setDots((d) => { const n = [...d]; n[i] = ok; return n; });
    setTug((t) => t + 1);
    setToast(ok ? `Round ${i + 1} ✓` : `Round ${i + 1} — missed`);
    setTimeout(() => setToast(null), 1100);
  };

  const r = rarityInfo(run.rarity ?? 'common');
  return (
    <div className={cn('lv-pup-stage relative grid overflow-hidden rounded-2xl', compact ? 'aspect-[4/3]' : 'aspect-[3/4] sm:aspect-[4/3]')} data-testid="puppet-stage" data-run={run.id} data-phase={phase}>
      <div className="lv-pup-backdrop absolute inset-0" />
      {/* the stage head: what's playing */}
      <div className="relative z-[3] flex items-center gap-2 px-2.5 pt-2 text-[11px] font-black text-[#FFE8A3]">
        <span className="truncate">🎭 {info?.name ?? run.game} · level {run.level}</span>
        {run.grand && <span className="rounded-full bg-[#FFB703] px-1.5 text-[10px] text-[#2A0509]">🎪 Grand</span>}
        <span className="ml-auto truncate text-white/60">{run.own ? (run.name ?? 'your plot') : `@${run.owner_name ?? '?'}’s plot`} <span style={{ color: readable(r.color) }}>●</span></span>
      </div>
      <div className="relative z-[3] flex justify-center gap-1 pt-1" data-testid="puppet-dots">
        {Array.from({ length: run.rounds }, (_, i) => (
          <span key={i} className={cn('h-2 w-5 rounded-full', dots[i] === true ? 'bg-[#3DDC97]' : dots[i] === false ? 'bg-[#FF4D6D]' : i === dots.length && phase === 'playing' ? 'bg-[#FFE8A3]/70' : 'bg-white/15')} />
        ))}
      </div>
      {/* the game itself — played on strings, not by your hand */}
      <div ref={box} className="relative z-[1] min-h-0 overflow-hidden">
        <div ref={inner} className="pointer-events-none absolute left-1/2 top-1 origin-top select-none" style={{ transform: `translateX(-50%) scale(${scale})` }} aria-hidden>
          <Suspense fallback={null}>
            <Game game={run.game as GameId} seed={Number(run.seed)} level={run.level} rounds={run.rounds} now={() => performance.now() - t0.current}
              onDone={() => {}} registerSolver={(fn) => { solver.current = fn; }} stopAt={stopAt} onRound={onRound} />
          </Suspense>
        </div>
        <Strings tug={tug} tangled={phase === 'tangled'} />
      </div>
      {/* the curtains */}
      <motion.div className="lv-pup-curtain l" initial={{ scaleX: 1 }} animate={{ scaleX: phase === 'curtain' ? 1 : 0.12 }} transition={{ duration: reduce ? 0 : 1, ease: [0.6, 0, 0.2, 1] }} />
      <motion.div className="lv-pup-curtain r" initial={{ scaleX: 1 }} animate={{ scaleX: phase === 'curtain' ? 1 : 0.12 }} transition={{ duration: reduce ? 0 : 1, ease: [0.6, 0, 0.2, 1] }} />
      <AnimatePresence>
        {toast && phase === 'playing' && (
          <motion.div key={toast} className="absolute left-1/2 top-[22%] z-[5] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[12px] font-black text-white" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>{toast}</motion.div>
        )}
        {(phase === 'bow' || phase === 'tangled') && (
          <motion.div key="end" className="absolute inset-0 z-[6] grid place-items-center bg-black/55 p-3 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="puppet-bow" data-passed={run.passed}>
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }} className="grid justify-items-center gap-1">
              <span className="text-[40px] leading-none">{phase === 'bow' ? '🎭' : '🪢'}</span>
              {phase === 'bow' ? (
                <>
                  <span className="font-display text-[22px] font-black text-[#FFE8A3] drop-shadow-[0_0_12px_#FFB703]">+1 level complete</span>
                  <span className="text-[14px] font-black text-white" data-testid="puppet-bow-ink">{result ? `+${Math.round(Number(result.ink))} Ink${result.tip ? ` · @${run.owner_name} got a ${result.tip} Ink tip` : ''}` : 'taking a bow…'}</span>
                  <span className="text-[11px] text-white/60">Level {run.level} cleared on strings{run.grand ? ' — a Grand Show act' : ''}</span>
                </>
              ) : (
                <>
                  <span className="font-display text-[20px] font-black text-[#FF9AA2]">The strings tangled</span>
                  <span className="text-[12px] text-white/75">in round {run.cleared + 1} of {run.rounds} — level {run.level} stands. The next act tries again.</span>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
