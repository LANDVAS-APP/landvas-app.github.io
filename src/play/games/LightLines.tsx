// LightLines (Lumina plots): tap mirrors to bend coloured beams into their targets.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BEAM_HEX, applyToggle, generateLightLines, traceBeams, type LLCell } from '../../shared/minigames/lightlines';
import { sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, haptic, useBoardSize, useLatest, type GameProps } from '../common';

export function LightLinesGame({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateLightLines(seed, level), [seed, level]);
  const [cells, setCells] = useState<LLCell[]>(() => L.cells.map((c) => ({ ...c })) as LLCell[]);
  const cellsRef = useLatest(cells);
  const moves = useRef<{ t: number; i: number }[]>([]);
  const done = useRef(false);
  const size = useBoardSize(560, 280);
  const res = useMemo(() => traceBeams(L.w, L.h, cells), [L, cells]);

  const toggle = (i: number) => {
    if (done.current) return;
    const next = cellsRef.current.map((c) => ({ ...c })) as LLCell[];
    if (!applyToggle(next, i)) return;
    moves.current.push({ t: Math.round(now()), i });
    cellsRef.current = next;
    setCells(next);
    haptic();
  };
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ moves: moves.current, done_t: Math.round(now()) });
  };

  useEffect(() => {
    if (res.solved && !done.current) {
      const t = setTimeout(finish, 650);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.solved]);

  registerSolver(async () => {
    for (let i = 0; i < L.cells.length; i++) {
      const c = cellsRef.current[i];
      if (c.k === 'mirror' && !c.fixed && L.solution[i] && c.m !== L.solution[i]) {
        await sleep(420 + Math.random() * 200);
        toggle(i);
      }
    }
  });

  const cell = size / L.w;
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[
        { label: 'Lit', value: `${res.litTargets}/${res.targets}`, tone: res.solved ? 'ok' : undefined },
        { label: 'Flips', value: moves.current.length },
        { label: 'Par', value: L.par },
      ]} />
      <svg width={size} height={size} viewBox={`0 0 ${L.w} ${L.h}`} className="no-touch-scroll rounded-3xl bg-[#090d24] shadow-[0_0_0_1px_rgba(140,160,255,0.18),0_30px_80px_-30px_#000]" role="grid" aria-label="LightLines board">
        <defs>
          <filter id="ll-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.09" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {cells.map((c, i) => {
          const x = i % L.w, y = Math.floor(i / L.w);
          const mirror = c.k === 'mirror';
          return (
            <g key={i} transform={`translate(${x} ${y})`} onPointerDown={mirror ? (e) => { e.preventDefault(); toggle(i); } : undefined}
              style={{ cursor: mirror && !c.fixed ? 'pointer' : 'default' }} data-cell={i}>
              <rect x={0.04} y={0.04} width={0.92} height={0.92} rx={0.14} fill={c.k === 'block' ? '#1b1f3d' : '#10163a'} stroke="rgba(140,160,255,0.12)" strokeWidth={0.02} />
              {c.k === 'block' && <path d="M0.25 0.25 L0.75 0.75 M0.75 0.25 L0.25 0.75" stroke="#3a4170" strokeWidth={0.08} strokeLinecap="round" />}
              {mirror && (
                <>
                  <line x1={c.m === '/' ? 0.2 : 0.2} y1={c.m === '/' ? 0.8 : 0.2} x2={0.8} y2={c.m === '/' ? 0.2 : 0.8}
                    stroke={c.fixed ? '#8e97c8' : '#F2F5FF'} strokeWidth={0.1} strokeLinecap="round" filter="url(#ll-glow)" />
                  {c.fixed && <circle cx={0.82} cy={0.82} r={0.07} fill="#8e97c8" />}
                </>
              )}
              {c.k === 'emitter' && (
                <g>
                  <circle cx={0.5} cy={0.5} r={0.3} fill={BEAM_HEX[c.c]} filter="url(#ll-glow)" />
                  <path d="M0.42 0.36 L0.66 0.5 L0.42 0.64 Z" fill="#0b0f26" transform={`rotate(${c.d * 90} 0.5 0.5)`} />
                </g>
              )}
              {c.k === 'target' && (
                <circle cx={0.5} cy={0.5} r={0.27} fill={res.lit.get(i)?.has(c.c) ? BEAM_HEX[c.c] : 'transparent'} stroke={BEAM_HEX[c.c]} strokeWidth={0.08}
                  filter={res.lit.get(i)?.has(c.c) ? 'url(#ll-glow)' : undefined} />
              )}
              {/* generous invisible hit area for fingers */}
              {mirror && <rect x={0} y={0} width={1} height={1} fill="transparent" />}
            </g>
          );
        })}
        {res.segments.map((s, k) => (
          <polyline key={k} points={s.points.map((p) => p.join(',')).join(' ')} fill="none" stroke={BEAM_HEX[s.color]} strokeWidth={0.07}
            strokeLinejoin="round" strokeLinecap="round" opacity={0.92} filter="url(#ll-glow)" pointerEvents="none" />
        ))}
      </svg>
      <p className="max-w-sm text-center text-xs text-muted">Tap a mirror to flip it. Light every ring with its own colour. {cell < 44 ? 'Tip: turn your phone sideways for bigger cells.' : ''}</p>
      <Button variant="ghost" size="sm" onClick={finish}>Give up and submit</Button>
    </div>
  );
}
