// Runs a single-board game as a multi-round level: one fresh board per round,
// with round-relative clocks, a quick "Round 2 of 5" beat between boards, and
// instant per-round feedback from the same validator the server uses.
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { roundSeed } from '../../shared/minigames/boards';
import { validateRollerMural } from '../../shared/minigames/rollermural';
import { validateLightLines } from '../../shared/minigames/lightlines';
import { validateMemoryMural } from '../../shared/minigames/memorymural';
import { validateMirrorline } from '../../shared/minigames/mirrorline';
import { validatePatternShift } from '../../shared/minigames/patternshift';
import { validateSculptor } from '../../shared/minigames/sculptor';
import { roundsToPass, type GameId, type ValidationResult } from '../../shared/minigames/types';
import { cn, sleep } from '../../lib/utils';
import type { GameProps } from '../common';

const CHECK: Partial<Record<GameId, (seed: number, level: number, log: any) => ValidationResult>> = {
  patternshift: validatePatternShift, lightlines: validateLightLines, memorymural: validateMemoryMural,
  sculptor: validateSculptor, rollermural: validateRollerMural, mirrorline: validateMirrorline,
};

export function boardsGame(game: GameId, Inner: (p: GameProps) => ReactElement | null) {
  return function BoardsGame({ seed, level, rounds = 5, now, onDone, registerSolver }: GameProps) {
    const [round, setRound] = useState(0);
    const [between, setBetween] = useState(false);
    const [results, setResults] = useState<boolean[]>([]);
    const logs = useRef<{ t0: number; log: unknown }[]>([]);
    const t0 = useRef(Math.round(now()));
    const innerSolver = useRef<{ r: number; fn: () => Promise<void> } | null>(null);
    const roundRef = useRef(0);
    roundRef.current = round;
    useEffect(() => { if (!between) t0.current = Math.round(now()); }, [round, between]); // eslint-disable-line react-hooks/exhaustive-deps

    const finishRound = (log: unknown) => {
      logs.current.push({ t0: t0.current, log });
      const v = CHECK[game]?.(roundSeed(seed, roundRef.current), level, log);
      setResults((r) => [...r, !!v?.passed]);
      if (logs.current.length >= rounds) {
        onDone({ boards: logs.current });
        return;
      }
      setBetween(true);
      setTimeout(() => { setBetween(false); setRound((r) => r + 1); }, 900);
    };

    registerSolver(async () => {
      for (let r = roundRef.current; r < rounds; r++) {
        // wait for this round's board to mount and register its solver
        for (let k = 0; k < 150 && (roundRef.current !== r || innerSolver.current?.r !== r); k++) await sleep(60);
        await innerSolver.current?.fn();
        for (let k = 0; k < 100 && logs.current.length <= r; k++) await sleep(60);
      }
    });

    const need = roundsToPass(rounds);
    return (
      <div className="grid w-full justify-items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label={`Round ${round + 1} of ${rounds}`} data-testid="round-dots">
          {Array.from({ length: rounds }, (_, i) => (
            <span key={i} className={cn('flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[11px] font-bold tnum transition',
              results[i] === true ? 'border-ok/60 bg-ok/15 text-ok' : results[i] === false ? 'border-bad/60 bg-bad/10 text-bad' : i === round ? 'border-accent-2 bg-accent-2/15 text-fg' : 'border-line text-faint')}>
              {results[i] === true ? <Check className="h-3.5 w-3.5" /> : results[i] === false ? <X className="h-3.5 w-3.5" /> : i + 1}
            </span>
          ))}
          <span className="ml-1 text-xs text-muted">clear all {need} to level up · every round pays Ink</span>
        </div>
        {between ? (
          <div className="grid min-h-[300px] place-items-center" aria-live="polite">
            <div className="text-center">
              <div className={cn('font-display text-4xl font-bold', results[results.length - 1] ? 'text-ok' : 'text-bad')}>{results[results.length - 1] ? 'Nice!' : 'Missed it'}</div>
              <div className="mt-2 text-sm text-muted">Round {round + 2} of {rounds}</div>
            </div>
          </div>
        ) : (
          <Inner key={round} seed={roundSeed(seed, round)} level={level} now={() => now() - t0.current} onDone={finishRound}
            registerSolver={(fn) => { innerSolver.current = { r: round, fn }; }} />
        )}
      </div>
    );
  };
}
