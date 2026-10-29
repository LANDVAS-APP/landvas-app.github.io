// The four PvP minigames. Each round takes its own board seed, records a move log and
// hands it back; the server replays every round to score the run.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MURAL_COLORS } from '../shared/minigames/memorymural';
import { copyCloseness, copyFill, generateClash, generateCopycat, generateForgery, generateRecall, generateTurf, solveTurf, turfNeighbors, type PvpGame } from '../shared/pvp';
import { cn, sleep } from '../lib/utils';
import { Button } from '../ui';
import { Hud, fmtClock, haptic, useBoardSize, useLatest, useTicker } from '../play/common';
import { Palette, PaintGridBoard } from '../play/games/PaintGrid';

export type PvpBoardProps = { seed: number; now(): number; onDone(log: unknown): void; registerSolver(fn: () => Promise<void>): void };

function useFinish(now: () => number, onDone: (log: unknown) => void) {
  const done = useRef(false);
  return (log: Record<string, unknown>) => {
    if (done.current) return;
    done.current = true;
    onDone({ ...log, done_t: Math.round(now()) });
  };
}

// ----------------------------------------------------------------- Turf Wars
function TurfWars({ seed, now, onDone, registerSolver }: PvpBoardProps) {
  const L = useMemo(() => generateTurf(seed), [seed]);
  const [owned, setOwned] = useState<number[]>([L.start]);
  const ref = useLatest(owned);
  const taps = useRef<{ t: number; i: number }[]>([]);
  const finish = useFinish(now, onDone);
  useTicker(250);
  const size = useBoardSize(440, 330);
  const cell = Math.floor(size / L.n);
  const left = L.timeLimitMs - now();
  const strokesLeft = L.strokes - taps.current.length;
  const land = owned.reduce((s, i) => s + L.values[i], 0);
  useEffect(() => { if (left <= 0 || strokesLeft <= 0) finish({ taps: taps.current }); }); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = (i: number) => {
    const o = ref.current;
    if (o.includes(i) || !turfNeighbors(L.n, i).some((x) => o.includes(x)) || taps.current.length >= L.strokes) return;
    taps.current.push({ t: Math.round(now()), i });
    const next = [...o, i];
    ref.current = next;
    setOwned(next);
    haptic(5);
  };
  registerSolver(async () => { for (const i of solveTurf(L)) { await sleep(380 + Math.random() * 120); tap(i); } });
  const frontier = new Set(owned.flatMap((o) => turfNeighbors(L.n, o)).filter((x) => !owned.includes(x)));
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Land value', value: land, tone: 'ok' }, { label: 'Strokes', value: strokesLeft, tone: strokesLeft <= 3 ? 'warn' : undefined }, { label: 'Time', value: fmtClock(left), tone: left < 10000 ? 'warn' : undefined }]} />
      <div className="grid gap-[3px] rounded-2xl bg-[#0b1226] p-[3px]" style={{ gridTemplateColumns: `repeat(${L.n}, ${cell - 3}px)` }} data-testid="turf-board">
        {L.values.map((v, i) => {
          const mine = owned.includes(i), can = frontier.has(i);
          return (
            <button key={i} onClick={() => tap(i)} disabled={!can} aria-label={`Plot worth ${v}`}
              className={cn('flex items-center justify-center rounded-md font-display text-sm font-bold tnum transition', mine ? 'text-bg' : can ? 'text-fg ring-1 ring-accent-2/70 hover:bg-accent-2/20' : 'text-faint')}
              style={{ height: cell - 3, background: mine ? `linear-gradient(135deg,#3DDC97,#22E3FF)` : v === 0 ? '#101626' : `rgba(61,220,151,${0.06 + v * 0.045})` }}>
              {i === L.start ? '★' : v || ''}
            </button>
          );
        })}
      </div>
      <p className="max-w-sm text-center text-xs text-muted">Tap plots next to your land to paint them. Plan a route through the rich plots — you only get {L.strokes} strokes.</p>
      <Button variant="secondary" size="sm" onClick={() => finish({ taps: taps.current })}>Lock in {land}</Button>
    </div>
  );
}

// ------------------------------------------------------------- Palette Clash
function PaletteClash({ seed, now, onDone, registerSolver }: PvpBoardProps) {
  const L = useMemo(() => generateClash(seed), [seed]);
  const [k, setK] = useState(0);
  const [sel, setSel] = useState<number[]>([]);
  const picks = useRef<{ t: number; a: number; b: number }[]>([]);
  const finish = useFinish(now, onDone);
  useTicker(250);
  const left = L.timeLimitMs - now();
  useEffect(() => { if (left <= 0) finish({ picks: picks.current }); }); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (i: number) => {
    const s = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i];
    if (s.length < 2) { setSel(s); return; }
    picks.current.push({ t: Math.round(now()), a: s[0], b: s[1] });
    haptic(8);
    setSel([]);
    if (picks.current.length >= L.targets.length) finish({ picks: picks.current });
    else setK((x) => x + 1);
  };
  const latest = useLatest(k);
  registerSolver(async () => {
    for (let q = latest.current; q < L.targets.length; q++) {
      await sleep(700 + Math.random() * 300);
      picks.current.push({ t: Math.round(now()), a: L.targets[q].a, b: L.targets[q].b });
      if (picks.current.length >= L.targets.length) finish({ picks: picks.current }); else setK(q + 1);
    }
  });
  const target = L.targets[Math.min(k, L.targets.length - 1)];
  const preview = sel.length === 1 ? L.pigments[sel[0]] : null;
  return (
    <div className="grid justify-items-center gap-4">
      <Hud items={[{ label: 'Swatch', value: `${Math.min(k + 1, L.targets.length)}/${L.targets.length}` }, { label: 'Time', value: fmtClock(left), tone: left < 10000 ? 'warn' : undefined }]} />
      <div className="flex items-center gap-4">
        <div className="grid justify-items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">Target<div className="h-28 w-28 rounded-3xl shadow-xl ring-2 ring-white/20" style={{ background: target.hex }} data-testid="clash-target" /></div>
        <div className="grid justify-items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">Your mix<div className="h-20 w-20 rounded-3xl ring-1 ring-white/10" style={{ background: preview ?? 'repeating-linear-gradient(45deg,#1b2133 0 6px,#141a2a 6px 12px)' }} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3" data-testid="clash-pigments">
        {L.pigments.map((p, i) => (
          <button key={i} onClick={() => choose(i)} aria-label={`Pigment ${i + 1}`} aria-pressed={sel.includes(i)}
            className={cn('h-16 w-16 rounded-2xl border-2 transition active:scale-95', sel.includes(i) ? 'scale-110 border-white' : 'border-white/10')} style={{ background: p }} />
        ))}
      </div>
      <p className="max-w-sm text-center text-xs text-muted">Tap two pigments — their even mix should match the target. Exact mixes score 100.</p>
    </div>
  );
}

// --------------------------------------------------------- Spot the Forgery
function Forgery({ seed, now, onDone, registerSolver }: PvpBoardProps) {
  const L = useMemo(() => generateForgery(seed), [seed]);
  const [hits, setHits] = useState<number[]>([]);
  const [misses, setMisses] = useState<number[]>([]);
  const taps = useRef<{ t: number; i: number }[]>([]);
  const finish = useFinish(now, onDone);
  useTicker(250);
  const size = useBoardSize(300, 420);
  const left = L.timeLimitMs - now();
  useEffect(() => { if (left <= 0 || hits.length >= L.changed.length) finish({ taps: taps.current }); }); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = (i: number) => {
    if (hits.includes(i) || misses.includes(i)) return;
    taps.current.push({ t: Math.round(now()), i });
    if (L.changed.includes(i)) { setHits((h) => [...h, i]); haptic(10); } else { setMisses((m) => [...m, i]); haptic(30); }
  };
  registerSolver(async () => { for (const i of L.changed) { await sleep(650 + Math.random() * 300); tap(i); } });
  const s = size / L.n;
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Found', value: `${hits.length}/${L.changed.length}`, tone: 'ok' }, { label: 'Misses', value: misses.length, tone: misses.length ? 'warn' : undefined }, { label: 'Time', value: fmtClock(left), tone: left < 10000 ? 'warn' : undefined }]} />
      <div className="grid gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted">Original
        <svg width={size} height={size} className="rounded-xl" aria-hidden>{L.original.map((c, i) => <rect key={i} x={(i % L.n) * s} y={Math.floor(i / L.n) * s} width={s} height={s} fill={MURAL_COLORS[c]} />)}</svg>
      </div>
      <div className="grid gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-gold">Forgery — tap the changes
        <svg width={size} height={size} className="cursor-crosshair rounded-xl" data-testid="forgery-board"
          onClick={(e) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); tap(Math.floor(((e.clientY - r.top) / r.height) * L.n) * L.n + Math.floor(((e.clientX - r.left) / r.width) * L.n)); }}>
          {L.forgery.map((c, i) => <rect key={i} x={(i % L.n) * s} y={Math.floor(i / L.n) * s} width={s} height={s} fill={MURAL_COLORS[c]} />)}
          {hits.map((i) => <circle key={`h${i}`} cx={(i % L.n + 0.5) * s} cy={(Math.floor(i / L.n) + 0.5) * s} r={s * 0.62} fill="none" stroke="#3DDC97" strokeWidth={3} />)}
          {misses.map((i) => <path key={`m${i}`} d={`M${(i % L.n) * s + 4} ${Math.floor(i / L.n) * s + 4}l${s - 8} ${s - 8}m0 -${s - 8}l-${s - 8} ${s - 8}`} stroke="#FF4D6D" strokeWidth={3} />)}
        </svg>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Pixel Recall
function PixelRecall({ seed, now, onDone, registerSolver }: PvpBoardProps) {
  const L = useMemo(() => generateRecall(seed), [seed]);
  const [grid, setGrid] = useState<number[]>(() => new Array(L.n * L.n).fill(0));
  const [color, setColor] = useState(L.colors[1]);
  const paints = useRef<{ t: number; i: number; c: number }[]>([]);
  const finish = useFinish(now, onDone);
  useTicker(100);
  const size = useBoardSize(380, 380);
  const t = now();
  const showing = t < L.previewMs;
  const left = L.previewMs + L.timeLimitMs - t;
  useEffect(() => { if (!showing && left <= 0) finish({ paints: paints.current }); }); // eslint-disable-line react-hooks/exhaustive-deps
  const paint = (i: number, c = color) => {
    if (now() < L.previewMs) return;
    paints.current.push({ t: Math.round(now()), i, c });
    setGrid((g) => { const n = g.slice(); n[i] = c; return n; });
    haptic(4);
  };
  registerSolver(async () => {
    while (now() < L.previewMs + 200) await sleep(100);
    for (let i = 0; i < L.target.length; i++) if (L.target[i] !== 0) { await sleep(120 + Math.random() * 60); paint(i, L.target[i]); }
    await sleep(300);
    finish({ paints: paints.current });
  });
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={showing ? [{ label: 'Memorise', value: fmtClock(L.previewMs - t), tone: 'warn' }] : [{ label: 'Time', value: fmtClock(left), tone: left < 8000 ? 'warn' : undefined }]} />
      <PaintGridBoard n={L.n} grid={showing ? L.target : grid} size={size} onPaint={showing ? undefined : (i) => paint(i)} />
      {!showing && <Palette colors={L.colors} value={color} onChange={setColor} />}
      {!showing && <Button variant="primary" onClick={() => finish({ paints: paints.current })} data-testid="recall-done">Done</Button>}
    </div>
  );
}

// ----------------------------------------------------------------- Copy Cat
function CopyCat({ seed, now, onDone, registerSolver }: PvpBoardProps) {
  const L = useMemo(() => generateCopycat(seed), [seed]);
  const [grid, setGrid] = useState<number[]>(() => new Array(L.n * L.n).fill(0));
  const ref = useLatest(grid);
  const [color, setColor] = useState(L.colors[1]);
  const [fill, setFill] = useState(false);
  const paints = useRef<{ t: number; i: number; c: number; f?: 1 }[]>([]);
  const finish = useFinish(now, onDone);
  useTicker(250);
  const size = useBoardSize(340, 300);
  const left = L.timeLimitMs - now();
  useEffect(() => { if (left <= 0) finish({ paints: paints.current }); }); // eslint-disable-line react-hooks/exhaustive-deps
  const paint = (i: number, c = color, f = fill) => {
    if (f && ref.current[i] === c) return;
    paints.current.push({ t: Math.round(now()), i, c, ...(f ? { f: 1 as const } : {}) });
    const next = f ? copyFill(ref.current, L.n, i, c) : (() => { const g = ref.current.slice(); g[i] = c; return g; })();
    ref.current = next;
    setGrid(next);
    haptic(4);
  };
  registerSolver(async () => {
    for (let i = 0; i < L.target.length; i++) if (L.target[i] !== 0) { await sleep(70 + Math.random() * 40); paint(i, L.target[i], false); }
    await sleep(300);
    finish({ paints: paints.current });
  });
  const close = Math.round(copyCloseness(grid, L.target) * 100);
  const ex = Math.round(size * 0.42), es = ex / L.n;
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Draw', value: L.motif }, { label: 'Match', value: `${close}%`, tone: close >= 80 ? 'ok' : undefined }, { label: 'Time', value: fmtClock(left), tone: left < 10000 ? 'warn' : undefined }]} />
      <div className="flex flex-wrap items-start justify-center gap-3">
        <div className="grid gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-gold">Example
          <svg width={ex} height={ex} className="rounded-xl shadow-[0_0_0_2px_rgba(255,79,216,0.5)]" data-testid="copy-example" aria-hidden>
            {L.target.map((c, i) => <rect key={i} x={(i % L.n) * es} y={Math.floor(i / L.n) * es} width={es + 0.3} height={es + 0.3} fill={MURAL_COLORS[c]} />)}
          </svg>
        </div>
        <div className="grid gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted">Your copy
          <PaintGridBoard n={L.n} grid={grid} size={size} onPaint={(i) => paint(i)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Palette colors={L.colors} value={color} onChange={setColor} />
        <Button size="sm" variant={fill ? 'primary' : 'secondary'} onClick={() => setFill((f) => !f)} data-testid="copy-fill">{fill ? 'Fill: on' : 'Fill'}</Button>
      </div>
      <Button variant="primary" onClick={() => finish({ paints: paints.current })} data-testid="copy-done">Done · {close}%</Button>
    </div>
  );
}

export const PVP_COMPONENTS: Record<PvpGame, (p: PvpBoardProps) => React.ReactElement> = {
  copycat: CopyCat, turfwars: TurfWars, paletteclash: PaletteClash, forgery: Forgery, pixelrecall: PixelRecall,
};
