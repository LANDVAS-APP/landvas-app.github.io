// Shared pieces for the four plot minigames.
import { useEffect, useRef, useState } from 'react';
import { useUi } from '../lib/store';

export type GameProps = {
  seed: number;
  level: number;
  /** ms since the server started the session (monotonic). */
  now(): number;
  /** Called once with the move log; the server replays it to score the run. */
  onDone(log: unknown): void;
  /** Register an automated solver (e2e tests only; makes human-paced moves). */
  registerSolver(fn: () => Promise<void>): void;
};

export function haptic(ms = 8) {
  try {
    if (useUi.getState().settings.haptics && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}

/** Re-render every `ms` while mounted (for timers). */
export function useTicker(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Size of a square board that fits the viewport (phones first). */
export function useBoardSize(max = 560, reserve = 300) {
  const calc = () => Math.max(220, Math.min(max, window.innerWidth - 32, window.innerHeight - reserve));
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const on = () => setSize(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return size;
}

export function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Hud({ items }: { items: { label: string; value: string | number; tone?: 'warn' | 'ok' }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {items.map((it) => (
        <div key={it.label} className="glass flex items-baseline gap-1.5 rounded-xl px-3 py-1.5">
          <span className="eyebrow !text-[10px]">{it.label}</span>
          <span className={`font-display text-sm font-semibold tnum ${it.tone === 'warn' ? 'text-warn' : it.tone === 'ok' ? 'text-ok' : 'text-fg'}`}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}
