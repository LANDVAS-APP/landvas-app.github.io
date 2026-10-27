// ColorBurst (Pigment plots): mix paint drops to hit each target colour before the clock runs out.
import { Undo2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { rgbToHex } from '../../shared/color';
import { generateColorBurst, mixedColor, replayDrops, scoreRound, type ColorBurstAction } from '../../shared/minigames/colorburst';
import { cn, sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, fmtClock, haptic, useLatest, useTicker, type GameProps } from '../common';

export function ColorBurstGame({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateColorBurst(seed, level), [seed, level]);
  const [round, setRound] = useState(0);
  const [actions, setActions] = useState<ColorBurstAction[]>([]);
  const [feedback, setFeedback] = useState<{ matched: boolean; dE: number } | null>(null);
  const log = useRef<{ actions: ColorBurstAction[]; submit_t: number }[]>([]);
  const roundStart = useRef(0);
  const actionsRef = useLatest(actions);
  const roundRef = useLatest(round);
  const busy = useRef(false);
  const done = useRef(false);
  useTicker(200);

  const counts = replayDrops(actions, L.pigments.length, L.maxDrops) ?? L.pigments.map(() => 0);
  const drops = counts.reduce((s, c) => s + c, 0);
  const mix = drops ? rgbToHex(mixedColor(L, counts)) : null;
  const r = L.rounds[round];
  const left = r ? r.timeLimitMs - (now() - roundStart.current) : 0;

  const act = (a: ColorBurstAction['a'], p?: number) => {
    if (busy.current || done.current) return;
    if (a === 'add' && drops >= L.maxDrops) return;
    const next = [...actionsRef.current, { t: Math.round(now()), a, ...(p !== undefined ? { p } : {}) }];
    actionsRef.current = next;
    setActions(next);
    haptic(6);
  };

  const submit = async () => {
    if (busy.current || done.current) return;
    busy.current = true;
    const submit_t = Math.round(now());
    const acts = actionsRef.current;
    log.current.push({ actions: acts, submit_t });
    const c = replayDrops(acts, L.pigments.length, L.maxDrops) ?? L.pigments.map(() => 0);
    const s = scoreRound(L, L.rounds[roundRef.current], c, submit_t - roundStart.current);
    setFeedback({ matched: s.matched, dE: s.dE });
    haptic(s.matched ? 20 : 40);
    await sleep(650);
    setFeedback(null);
    if (roundRef.current + 1 >= L.rounds.length) {
      done.current = true;
      onDone({ rounds: log.current });
    } else {
      roundStart.current = submit_t; // the server times each round from the previous submit
      actionsRef.current = [];
      setActions([]);
      setRound(roundRef.current + 1);
    }
    busy.current = false;
  };

  // time's up: submit whatever is in the well
  useEffect(() => {
    if (r && left <= 0 && !busy.current && !done.current) void submit();
  });

  registerSolver(async () => {
    for (let k = roundRef.current; k < L.rounds.length; k++) {
      while (roundRef.current !== k) await sleep(50);
      const recipe = L.rounds[k].recipe;
      for (let p = 0; p < recipe.length; p++)
        for (let j = 0; j < recipe[p]; j++) {
          await sleep(240 + Math.random() * 120);
          act('add', p);
        }
      await sleep(380);
      await submit();
    }
  });

  if (!r) return null;
  const urgent = left < 6000;
  return (
    <div className="grid w-full max-w-[560px] justify-items-center gap-4">
      <Hud items={[
        { label: 'Round', value: `${round + 1}/${L.rounds.length}` },
        { label: 'Time', value: fmtClock(left), tone: urgent ? 'warn' : undefined },
        { label: 'Match', value: `ΔE ≤ ${L.threshold.toFixed(1)}` },
      ]} />
      <div className="grid grid-cols-2 gap-4">
        <figure className="grid justify-items-center gap-2">
          <div className="h-32 w-32 rounded-full shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] ring-4 ring-white/10 sm:h-40 sm:w-40" style={{ background: r.target }} />
          <figcaption className="eyebrow">Target</figcaption>
        </figure>
        <figure className="grid justify-items-center gap-2">
          <div className={cn('relative flex h-32 w-32 items-center justify-center rounded-full ring-4 transition-colors sm:h-40 sm:w-40', feedback ? (feedback.matched ? 'ring-ok' : 'ring-bad') : 'ring-white/10')}
            style={{ background: mix ?? 'repeating-conic-gradient(#1a2048 0 25%, #121836 0 50%) 50% / 24px 24px' }}>
            {feedback && <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-bold text-white">{feedback.matched ? 'Match!' : `ΔE ${feedback.dE.toFixed(1)}`}</span>}
            {!mix && !feedback && <span className="text-xs font-semibold text-muted">Add paint</span>}
          </div>
          <figcaption className="eyebrow">Your mix · {drops}/{L.maxDrops} drops</figcaption>
        </figure>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        {L.pigments.map((p, i) => (
          <button key={p.id} onClick={() => act('add', i)} className="group grid w-[74px] justify-items-center gap-1 rounded-2xl border border-line bg-surface/70 p-2 active:scale-95" aria-label={`Add a drop of ${p.name}`} data-pigment={i}>
            <span className="relative h-10 w-10 rounded-full shadow-inner ring-2 ring-white/15" style={{ background: p.hex }}>
              {counts[i] > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-fg px-1 text-[11px] font-bold text-bg">{counts[i]}</span>}
            </span>
            <span className="text-center text-[10.5px] leading-tight text-muted">{p.name}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => act('undo')} disabled={!drops}><Undo2 className="h-4 w-4" /> Undo</Button>
        <Button variant="ghost" size="sm" onClick={() => act('clear')} disabled={!drops}><Trash2 className="h-4 w-4" /> Clear</Button>
        <Button variant="rainbow" size="lg" onClick={() => void submit()} disabled={!drops} data-testid="cb-mix">Mix!</Button>
      </div>
    </div>
  );
}
