// Block Splash: drag paint stencils onto the canvas; full rows and columns splash away. Lines that a drop would clear
// glow while you hold it there, the splash bursts in the stencil's colours, and combos, doubles and gold pay extra.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GOLD, N, SPLASH_COLORS, fits, generateBlockSplash, initialState, place, solveBlockSplash, step, stuck, type PlayState, type SplashMove, type Stencil } from '../../shared/minigames/blocksplash';
import { cn, sleep } from '../../lib/utils';
import { useUi } from '../../lib/store';
import { Hud, fmtClock, haptic, useBoardSize, useLatest, useTicker, type GameProps } from '../common';
import { readable } from '../../lib/readable';

type Drag = { p: number; cx: number; cy: number; lift: number };
type Pop = { id: number; text: string; color: string; x: number; y: number; big?: boolean };
type Burst = { id: number; cells: number[]; colors: string[] };

const colorOf = (c: number) => (c === GOLD ? '#FFD84D' : SPLASH_COLORS[c] ?? '#888');
const tile = (c: number, size: number, matte: boolean): React.CSSProperties => c === GOLD
  ? { background: 'linear-gradient(135deg,#FFF3A8,#FFD84D 45%,#E2A01B)', boxShadow: `inset 0 -${size * 0.08}px 0 rgba(0,0,0,0.18), 0 0 ${size * 0.25}px rgba(255,216,77,0.55)` }
  : { background: matte ? colorOf(c) : `linear-gradient(160deg, ${colorOf(c)}, ${colorOf(c)} 55%, rgba(0,0,0,0.18))`, boxShadow: `inset 0 -${size * 0.09}px 0 rgba(0,0,0,0.2), inset 0 ${size * 0.06}px 0 rgba(255,255,255,0.22)` };

/** a stencil drawn at a cell size (for the tray and the one you're dragging) */
function StencilView({ s, cell, matte, faded }: { s: Stencil; cell: number; matte: boolean; faded?: boolean }) {
  const gap = Math.max(1, cell * 0.08);
  return (
    <div className="relative" style={{ width: s.w * cell, height: s.h * cell, opacity: faded ? 0.35 : 1 }}>
      {s.cells.map(([x, y]) => (
        <span key={`${x}-${y}`} className="absolute rounded-[22%]" style={{ left: x * cell + gap / 2, top: y * cell + gap / 2, width: cell - gap, height: cell - gap, ...tile(s.color, cell, matte) }} />
      ))}
    </div>
  );
}

export function BlockSplashBoard({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateBlockSplash(seed, level), [seed, level]);
  const matte = !useUi((s) => s.settings.glossyBlobs);
  const size = useBoardSize(440, 330);
  const cell = size / N;
  const [st, setSt] = useState<PlayState>(() => initialState(L));
  const ref = useLatest(st);
  const moves = useRef<SplashMove[]>([]);
  const done = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useLatest(drag);
  const [sel, setSel] = useState<number | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [shake, setShake] = useState(0);
  const [end, setEnd] = useState<null | 'win' | 'stuck' | 'time'>(null);
  const uid = useRef(0);
  useTicker(250);
  const left = L.timeLimitMs - now();

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ moves: moves.current, done_t: Math.round(now()) });
  };
  useEffect(() => { if (left <= 0 && !done.current) { setEnd('time'); finish(); } }); // eslint-disable-line react-hooks/exhaustive-deps

  const pop = (p: Omit<Pop, 'id'>, ms = 1300) => {
    const id = ++uid.current;
    setPops((x) => [...x.slice(-5), { ...p, id }]);
    setTimeout(() => setPops((x) => x.filter((y) => y.id !== id)), ms);
  };

  /** drop tray stencil p with its top-left at (x, y) */
  const drop = (p: number, x: number, y: number) => {
    if (done.current) return false;
    const cur = ref.current;
    const nx = step(L, cur, p, x, y);
    if (!nx) return false;
    const t = Math.round(now());
    moves.current.push({ t: Math.max(t, (moves.current.at(-1)?.t ?? 0)), p: p as 0 | 1 | 2, x, y });
    ref.current = nx;
    setSt(nx);
    setSel(null);
    haptic(nx.placed.lines ? 18 : 6);
    const s = L.pieces[cur.tray[p]!];
    if (nx.placed.lines) {
      const id = ++uid.current;
      setBursts((b) => [...b.slice(-3), { id, cells: nx.placed.cleared, colors: [colorOf(s.color), '#FFFFFF', SPLASH_COLORS[(s.color + 2) % SPLASH_COLORS.length]] }]);
      setTimeout(() => setBursts((b) => b.filter((q) => q.id !== id)), 700);
      const cx = (x + s.w / 2) * cell, cy = (y + s.h / 2) * cell;
      const gained = nx.score - cur.score;
      pop({ text: `+${gained}`, color: '#FFFFFF', x: cx, y: cy });
      if (nx.placed.lines >= 2) pop({ text: nx.placed.lines >= 3 ? `${nx.placed.lines}× SPLASH!` : 'DOUBLE!', color: '#FFE14D', x: size / 2, y: size * 0.38, big: true });
      if (nx.combo >= 2) pop({ text: `COMBO ×${nx.combo}`, color: '#22E3FF', x: size / 2, y: size * 0.55, big: true });
      if (nx.placed.gold) pop({ text: `✦ GOLD +${nx.placed.gold * 25}`, color: '#FFD84D', x: size / 2, y: size * 0.7 });
      setShake((k) => k + 1);
    }
    if (nx.lines >= L.goal) { setEnd('win'); setTimeout(finish, 750); }
    else if (stuck(L, nx)) { setEnd('stuck'); haptic(40); setTimeout(finish, 1100); }
    return true;
  };

  // where a held stencil would land (top-left cell), from the pointer
  const target = (d: Drag | null) => {
    if (!d || !boardRef.current) return null;
    const idx = ref.current.tray[d.p];
    if (idx == null) return null;
    const s = L.pieces[idx];
    const r = boardRef.current.getBoundingClientRect();
    const x = Math.round((d.cx - r.left) / cell - s.w / 2), y = Math.round((d.cy - d.lift - r.top) / cell - s.h / 2);
    if (x < -1 || y < -1 || x > N - s.w + 1 || y > N - s.h + 1) return null;
    const cx = Math.min(Math.max(x, 0), N - s.w), cy = Math.min(Math.max(y, 0), N - s.h);
    return { x: cx, y: cy, s, ok: fits(ref.current.board, s, cx, cy) };
  };
  const tgt = target(drag);
  const preview = useMemo(() => (tgt && tgt.ok ? place(st.board, tgt.s, tgt.x, tgt.y) : null), [tgt?.x, tgt?.y, tgt?.ok, tgt?.s, st.board]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghost = new Set(tgt ? tgt.s.cells.map(([dx, dy]) => (tgt.y + dy) * N + tgt.x + dx) : []);
  const glow = new Set(preview?.cleared ?? []);

  // dragging from the tray (pointer anywhere on screen while held)
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => { const d = dragRef.current; if (!d) return; const nd = { ...d, cx: e.clientX, cy: e.clientY }; dragRef.current = nd; setDrag(nd); };
    const up = () => {
      const d = dragRef.current, t = target(d);
      dragRef.current = null;
      setDrag(null);
      if (d && t?.ok) drop(d.p, t.x, t.y);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    return () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  }, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

  // tap a stencil, then tap the canvas (its top-left lands on the tapped cell, nudged in to fit)
  const tapBoard = (e: React.PointerEvent) => {
    if (sel == null || drag) return;
    const idx = ref.current.tray[sel];
    if (idx == null) return;
    const s = L.pieces[idx], r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(Math.max(Math.floor((e.clientX - r.left) / cell - (s.w - 1) / 2), 0), N - s.w);
    const y = Math.min(Math.max(Math.floor((e.clientY - r.top) / cell - (s.h - 1) / 2), 0), N - s.h);
    if (!drop(sel, x, y)) { haptic(30); pop({ text: 'No room there', color: '#FF8FA3', x: (x + s.w / 2) * cell, y: (y + s.h / 2) * cell }, 900); }
  };

  registerSolver(async () => {
    for (const m of solveBlockSplash(L)) {
      if (done.current) return;
      await sleep(260 + Math.random() * 140);
      drop(m.p, m.x, m.y);
    }
    await sleep(900);
    finish();
  });

  const trayCell = Math.min(cell * 0.55, 26);
  const pct = Math.min(100, (st.lines / L.goal) * 100);
  return (
    <div className="grid w-full justify-items-center gap-3 select-none" data-testid="blocksplash">
      <Hud items={[{ label: 'Lines', value: `${st.lines}/${L.goal}`, tone: st.lines >= L.goal ? 'ok' : undefined }, { label: 'Score', value: st.score }, { label: 'Combo', value: st.combo >= 2 ? `×${st.combo}` : '—' }, { label: 'Time', value: fmtClock(left), tone: left < 10000 ? 'warn' : undefined }]} />
      <div className="h-2 w-full max-w-[440px] overflow-hidden rounded-full bg-white/10" aria-hidden><div className="h-full rounded-full bg-[linear-gradient(90deg,#FF4FD8,#22E3FF,#3DDC97)] transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
      <div key={shake} className={cn('relative rounded-[22px] p-[6px]', shake && 'lvbs-shake')} style={{ background: 'linear-gradient(160deg,#2a1240,#120a24)', boxShadow: '0 0 0 1.5px rgba(255,79,216,0.25), 0 18px 40px -18px rgba(0,0,0,0.8)' }}>
        <div ref={boardRef} className="no-touch-scroll relative touch-none" style={{ width: size, height: size }} onPointerDown={tapBoard} data-testid="bs-board">
          {st.board.map((c, i) => {
            const x = i % N, y = Math.floor(i / N), g = ghost.has(i), lit = glow.has(i);
            return (
              <span key={i} className="absolute rounded-[22%] transition-[background,box-shadow,transform] duration-150"
                style={{ left: x * cell + 1.5, top: y * cell + 1.5, width: cell - 3, height: cell - 3, transform: lit ? 'scale(1.06)' : undefined,
                  ...(c >= 0 ? tile(c, cell, matte) : g ? { background: tgt?.ok ? `${colorOf(tgt.s.color)}99` : 'rgba(255,90,110,0.35)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.35)' } : { background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }),
                  ...(lit ? { boxShadow: '0 0 0 2px #fff, 0 0 18px rgba(255,255,255,0.8)' } : null) }}>
                {c === GOLD && <span className="absolute inset-0 grid place-items-center text-[#8A5A00]" style={{ fontSize: cell * 0.42 }}>✦</span>}
              </span>
            );
          })}
          {bursts.map((b) => b.cells.map((i, k) => (
            <span key={`${b.id}-${i}`} className="lvbs-splash pointer-events-none absolute rounded-full" style={{ left: (i % N) * cell, top: Math.floor(i / N) * cell, width: cell, height: cell, background: `radial-gradient(circle, ${b.colors[k % 3]} 0 35%, transparent 70%)`, animationDelay: `${(k % N) * 18}ms` }} />
          )))}
          {pops.map((p) => (
            <span key={p.id} className={cn('lvbs-pop pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display font-black', p.big ? 'text-[22px]' : 'text-[15px]')}
              style={{ left: p.x, top: p.y, color: readable(p.color), textShadow: '0 2px 0 rgba(0,0,0,0.55), 0 0 14px rgba(0,0,0,0.5)' }}>{p.text}</span>
          ))}
          {end && (
            <div className="lvbs-end pointer-events-none absolute inset-0 grid place-items-center rounded-[16px] bg-black/45" aria-live="polite">
              <span className="font-display text-3xl font-black" style={{ color: end === 'win' ? '#3DDC97' : '#FF8FA3' }}>{end === 'win' ? 'Splashed it!' : end === 'stuck' ? 'No room left!' : 'Time!'}</span>
            </div>
          )}
        </div>
      </div>
      {/* the tray */}
      <div className="flex w-full max-w-[460px] items-center justify-around gap-2 rounded-[22px] bg-white/[0.04] px-2 py-3" data-testid="bs-tray">
        {st.tray.map((idx, p) => {
          const s = idx == null ? null : L.pieces[idx];
          const canFit = !!s && (() => { for (let y = 0; y <= N - s.h; y++) for (let x = 0; x <= N - s.w; x++) if (fits(st.board, s, x, y)) return true; return false; })();
          return (
            <button key={p} type="button" disabled={!s || done.current} aria-label={s ? `Stencil ${p + 1}: ${s.name}` : 'Used'} data-testid={`bs-piece-${p}`}
              className={cn('grid h-[92px] min-w-[86px] flex-1 touch-none place-items-center rounded-2xl transition', sel === p ? 'bg-white/15 ring-2 ring-[#FF4FD8]' : 'hover:bg-white/5', drag?.p === p && 'opacity-30')}
              onPointerDown={(e) => {
                if (!s) return;
                e.preventDefault();
                setSel((q) => (q === p ? null : p));
                setDrag({ p, cx: e.clientX, cy: e.clientY, lift: e.pointerType === 'touch' ? cell * 1.6 : 0 });
                haptic(4);
              }}>
              {s && <StencilView s={s} cell={trayCell} matte={matte} faded={!canFit} />}
            </button>
          );
        })}
      </div>
      {drag && st.tray[drag.p] != null && (
        <div className="pointer-events-none fixed z-[300]" style={{ left: drag.cx, top: drag.cy - drag.lift, transform: 'translate(-50%, -50%)' }}>
          <StencilView s={L.pieces[st.tray[drag.p]!]} cell={cell} matte={matte} />
        </div>
      )}
      <p className="max-w-sm text-center text-xs text-muted">Drag a stencil onto the canvas (or tap it, then tap a spot). Fill a row or column to splash it — {L.goal} lines clears the round. Lines that would splash glow white.</p>
    </div>
  );
}
