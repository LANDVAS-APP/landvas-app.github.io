// The claim moment: a flash and shockwave from the plot, a burst of paint in
// the plot's colours, the square drawing itself onto the map, and a slot-machine
// reveal of the rarity that was secret until now. Legendary and Mythic plots get
// light rays and a bigger burst. Reduced motion shows the reveal card only.
import { AnimatePresence, motion } from 'motion/react';
import { Brush, Sparkles, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { useUi } from '../lib/store';
import { GRID_LEVEL, cellCenter, type PlotTypeId } from '../shared/grid';
import { RARITY_ORDER, rarityInfo, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { PLOT_TYPES } from '../map/plotStyle';
import { mapHandle } from '../map/mapHandle';
import { Button } from '../ui';

export type Celebration = {
  gx: number; gy: number; rarity: RarityId; type: PlotTypeId; name?: string | null; usd: number;
  groupId: string; first: boolean; onDone?: () => void;
};

/** `hidden`: the plot whose rarity is still rolling — the map keeps it neutral until the reveal. */
export const useCelebration = create<{ c: Celebration | null; hidden: { gx: number; gy: number } | null; show(c: Celebration): void; reveal(): void; close(): void }>((set, get) => ({
  c: null,
  hidden: null,
  show: (c) => set({ c, hidden: { gx: c.gx, gy: c.gy } }),
  reveal: () => set({ hidden: null }),
  close: () => {
    const done = get().c?.onDone;
    set({ c: null, hidden: null });
    done?.();
  },
}));

const EPIC = new Set<RarityId>(['legendary', 'mythic']);

export function ClaimCelebration() {
  const c = useCelebration((s) => s.c);
  return <AnimatePresence>{c && <Show key={`${c.gx}_${c.gy}`} c={c} />}</AnimatePresence>;
}

function usePlotPoint(gx: number, gy: number) {
  const [pt, setPt] = useState<{ x: number; y: number; size: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    const [lng, lat] = cellCenter(gx, gy);
    const loop = () => {
      const m = mapHandle.current;
      if (m) {
        const p = m.project([lng, lat]);
        const r = m.getContainer().getBoundingClientRect();
        setPt({ x: r.left + p.x, y: r.top + p.y, size: Math.max(18, 256 * 2 ** (m.getZoom() - GRID_LEVEL)) });
      } else setPt({ x: innerWidth / 2, y: innerHeight / 2, size: 40 });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [gx, gy]);
  return pt;
}

function Show({ c }: { c: Celebration }) {
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const info = rarityInfo(c.rarity);
  const epic = EPIC.has(c.rarity);
  const pt = usePlotPoint(c.gx, c.gy);
  const [revealed, setRevealed] = useState(reduce);
  // nothing hints at the rarity until the roll lands: no colours, no rays, no special buzz
  useEffect(() => {
    if (!revealed) { if (haptics) navigator.vibrate?.([8, 40, 8]); return; }
    useCelebration.getState().reveal();
    if (haptics) navigator.vibrate?.(epic ? [12, 40, 18, 60, 30, 90, 60] : [10, 30, 25]);
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useCelebration.getState().close();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div className="fixed inset-0 z-[60]" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }} data-testid="claim-celebration">
      {!reduce && pt && !revealed && (
        <>
          {[0, 1, 2].map((i) => (
            <span key={i} className="pointer-events-none absolute rounded-full lv-claim-ring" style={{ left: pt.x, top: pt.y, borderColor: '#ffffff', animationDelay: `${i * 0.22}s`, boxShadow: '0 0 18px rgba(255,255,255,0.6)' }} />
          ))}
          <PlotSquare x={pt.x} y={pt.y} size={pt.size} color="#C9D4F2" glow="#ffffff" />
        </>
      )}
      {!reduce && pt && revealed && (
        <>
          <div className="pointer-events-none absolute inset-0 lv-claim-flash" style={{ background: `radial-gradient(circle at ${pt.x}px ${pt.y}px, ${info.glow}cc, ${info.color}55 18%, transparent 55%)` }} />
          {[0, 1, 2].map((i) => (
            <span key={i} className="pointer-events-none absolute rounded-full lv-claim-ring" style={{ left: pt.x, top: pt.y, borderColor: i === 1 ? '#ffffff' : info.color, animationDelay: `${i * 0.16}s`, boxShadow: `0 0 24px ${info.color}` }} />
          ))}
          {epic && <div className="pointer-events-none absolute lv-claim-rays" style={{ left: pt.x, top: pt.y, ['--c' as any]: info.color, ['--g' as any]: info.glow }} />}
          <Burst x={pt.x} y={pt.y} colors={[info.color, info.glow, '#ffffff', PLOT_TYPES[c.type].a, PLOT_TYPES[c.type].b, '#FFE14D']} count={epic ? 220 : 130} />
          <PlotSquare x={pt.x} y={pt.y} size={pt.size} color={info.color} glow={info.glow} />
        </>
      )}
      <div className="absolute inset-0 bg-black/25" onClick={() => revealed && useCelebration.getState().close()} />
      <Card c={c} reduce={reduce} onRevealed={() => setRevealed(true)} revealed={revealed} />
    </motion.div>
  );
}

function PlotSquare({ x, y, size, color, glow }: { x: number; y: number; size: number; color: string; glow: string }) {
  const s = Math.min(size, 260);
  return (
    <svg className="pointer-events-none absolute overflow-visible" style={{ left: x - s / 2, top: y - s / 2, width: s, height: s }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <rect x="0" y="0" width="100" height="100" fill={color} className="lv-claim-fill" />
      <rect x="0" y="0" width="100" height="100" fill="none" stroke={glow} strokeWidth="6" vectorEffect="non-scaling-stroke" pathLength={400} className="lv-claim-draw" style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
    </svg>
  );
}

/** Canvas particle burst: paint droplets and sparks with gravity and drag. */
function Burst({ x, y, colors, count }: { x: number; y: number; colors: string[]; count: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const origin = useRef({ x, y });
  origin.current = { x, y };
  useEffect(() => {
    const cv = ref.current!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; life: number; spark: boolean; rot: number };
    const parts: P[] = [];
    const spawn = (n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.35 + Math.random() * 0.9);
        parts.push({ x: origin.current.x, y: origin.current.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35, r: 2 + Math.random() * 5, c: colors[(Math.random() * colors.length) | 0], life: 1, spark: Math.random() < 0.35, rot: Math.random() * 6 });
      }
    };
    spawn(count, 11);
    const second = setTimeout(() => spawn(Math.round(count * 0.45), 7), 380);
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(2.5, (now - last) / 16.67);
      last = now;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vx *= 0.985 ** dt;
        p.vy = p.vy * 0.985 ** dt + 0.28 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.012 * dt;
        p.rot += 0.2 * dt;
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        ctx.fillStyle = p.c;
        if (p.spark) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r * 1.6, -0.9, p.r * 3.2, 1.8);
          ctx.fillRect(-0.9, -p.r * 1.6, 1.8, p.r * 3.2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (0.6 + p.life * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (parts.some((p) => p.life > 0)) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); clearTimeout(second); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}

function Card({ c, reduce, revealed, onRevealed }: { c: Celebration; reduce: boolean; revealed: boolean; onRevealed(): void }) {
  const nav = useNavigate();
  const info = rarityInfo(c.rarity);
  const epic = EPIC.has(c.rarity);
  const [spin, setSpin] = useState<RarityId>(reduce ? c.rarity : 'common');
  useEffect(() => {
    if (reduce) { onRevealed(); return; }
    // slot-machine: cycle through the rarities, slowing down, and land on the real one
    const seq: RarityId[] = [];
    for (let i = 0; i < 11; i++) seq.push(RARITY_ORDER[i % RARITY_ORDER.length]);
    seq.push(c.rarity);
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      setSpin(seq[i]);
      i++;
      if (i < seq.length) t = setTimeout(step, 55 + i * i * 4.5);
      else onRevealed();
    };
    t = setTimeout(step, 520);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = rarityInfo(spin);
  const close = () => useCelebration.getState().close();
  const go = (start: 'draw' | 'upload') => { close(); nav(`/create/${c.groupId}?start=${start}`); };
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] flex justify-center px-4 md:bottom-12">
      <motion.div initial={{ y: 80, opacity: 0, scale: 0.85 }} animate={{ y: 0, opacity: 1, scale: 1, transition: { delay: reduce ? 0 : 0.35, type: 'spring', stiffness: 260, damping: 20 } }}
        className="glass pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[30px] p-5 text-center"
        style={{ boxShadow: `0 0 0 1.5px ${shown.color}66, 0 20px 60px ${shown.color}44`, transition: 'box-shadow 0.15s' }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-50" style={{ background: `radial-gradient(ellipse at 50% 0%, ${shown.color}, transparent 70%)` }} />
        <div className="relative">
          <div className="eyebrow flex items-center justify-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-gold" /> {c.first ? 'Your first piece of the world' : 'Plot claimed'}</div>
          <div className="mt-2 font-display text-4xl font-black uppercase tracking-wide transition-colors" data-testid="claim-rarity"
            style={{ color: shown.color, textShadow: revealed ? `0 0 18px ${info.glow}, 0 0 42px ${info.color}` : 'none', transform: revealed ? 'scale(1.06)' : 'scale(1)', transition: 'transform 0.25s cubic-bezier(.2,1.6,.4,1)' }}>
            {shown.name}
          </div>
          <div className="mt-1 h-5 text-sm font-bold" style={{ color: info.glow }}>{revealed ? (epic ? `Incredible — a ${info.name} plot!` : c.rarity === 'common' ? 'A solid start' : `Nice — a ${info.name} plot`) : 'Revealing rarity…'}</div>
          {c.name && <div className="mt-2 truncate font-display text-lg font-semibold">“{c.name}”</div>}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{PLOT_TYPES[c.type].name} · {PLOT_TYPES[c.type].game}</span>
            <span className="font-bold tnum" style={{ color: revealed ? '#3DDC97' : undefined }}>{revealed ? `+${formatRate(c.usd)} rent` : '+$? / s'}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="rainbow" onClick={() => go('draw')} data-testid="choose-draw"><Brush className="h-4 w-4" /> Paint it</Button>
            <Button variant="secondary" onClick={() => go('upload')} data-testid="choose-upload"><Upload className="h-4 w-4" /> Upload art</Button>
          </div>
          <button className="mt-3 text-xs font-bold text-muted hover:text-fg" onClick={close} data-testid="celebration-close">Keep exploring</button>
        </div>
      </motion.div>
    </div>
  );
}
