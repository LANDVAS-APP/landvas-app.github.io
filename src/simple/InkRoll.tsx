// The plot roll: a full-screen moment. A drop of ink falls onto a blank canvas, splashes, and the ink cycles
// through every rarity like a slot machine (faster, then slower…) until it lands on the one you rolled — then it
// floods the canvas, the rays and sparks go off, and the rarity slams in. Rarer rolls hit harder.
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, rarityInfo, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { PLOT_TYPES } from '../map/plotStyle';
import { confetti, confettiCannons } from '../ui/confetti';

export type RollResult = { rarity: RarityId; usd: number; type: string; first: boolean };
type Phase = 'drop' | 'spin' | 'land' | 'reveal';

const INK = '#1B1240';
// an organic ink blob (100 × 100 box), centred on 50,50
const BLOB = 'M50 8 C63 8 70 18 78 22 C90 28 94 40 92 52 C90 64 96 74 86 84 C76 94 62 90 50 92 C38 94 26 96 17 86 C8 76 10 64 8 52 C6 40 10 28 22 21 C31 15 38 8 50 8Z';

export function InkRoll({ open, result, onClose, onAgain, canAgain, againLabel }: {
  open: boolean; result: RollResult | null; onClose(): void; onAgain(): void; canAgain: boolean; againLabel: string;
}) {
  return createPortal(<AnimatePresence>{open && <Roll key="roll" result={result} onClose={onClose} onAgain={onAgain} canAgain={canAgain} againLabel={againLabel} />}</AnimatePresence>, document.body);
}

function Roll({ result, onClose, onAgain, canAgain, againLabel }: { result: RollResult | null; onClose(): void; onAgain(): void; canAgain: boolean; againLabel: string }) {
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const [phase, setPhase] = useState<Phase>('drop');
  const [shown, setShown] = useState<RarityId>('common');
  const started = useRef(performance.now());
  const shake = useAnimationControls();
  const final = result?.rarity;
  const finalRef = useRef(final);
  finalRef.current = final;
  const tier = final ? RARITY_ORDER.indexOf(final) : 0;
  const info = rarityInfo(shown);

  // drop → splash
  useEffect(() => { const t = setTimeout(() => setPhase('spin'), reduce ? 150 : 720); return () => clearTimeout(t); }, [reduce]);

  // the slot machine: flick through rarities until the result is in and enough time has passed, then slow to a stop
  useEffect(() => {
    if (phase === 'drop') return;
    let alive = true, i = 0, delay = 70, landing = false, steps = 0;
    const order = RARITY_ORDER;
    const tick = () => {
      if (!alive) return;
      const final = finalRef.current;
      const ready = final && performance.now() - started.current > (reduce ? 400 : 2300);
      if (ready && !landing) { landing = true; setPhase('land'); }
      if (landing) {
        steps++;
        delay = Math.min(520, delay * 1.32);
        const target = order.indexOf(final!);
        // keep going until we're slow enough and sitting on the result
        if (delay > 300 && order[i % order.length] === final) { setShown(final!); setTimeout(() => alive && setPhase('reveal'), 260); return; }
        if (steps > 40) { setShown(order[target]); setPhase('reveal'); return; }
      }
      i++;
      setShown(order[i % order.length]);
      if (haptics) buzz('light');
      setTimeout(tick, delay);
    };
    const t = setTimeout(tick, delay);
    return () => { alive = false; clearTimeout(t); };
  }, [phase === 'drop']); // eslint-disable-line react-hooks/exhaustive-deps

  // the reveal: harder the rarer
  useEffect(() => {
    if (phase !== 'reveal') return;
    if (haptics) buzz(tier >= 3 ? 'heavy' : 'success');
    if (reduce) return;
    if (tier >= 3) void shake.start({ x: [0, -14, 12, -9, 7, -4, 0], y: [0, 6, -8, 5, -3, 2, 0], transition: { duration: 0.55 } });
    else if (tier >= 1) void shake.start({ x: [0, -6, 5, -3, 0], transition: { duration: 0.35 } });
    const t1 = setTimeout(() => { if (tier >= 2) confettiCannons(); else confetti({ y: innerHeight * 0.4, count: 60 }); }, 120);
    const t2 = tier >= 4 ? setTimeout(() => confettiCannons(), 700) : 0;
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const drops = useMemo(() => Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2 + (k % 3) * 0.2; const d = 70 + ((k * 37) % 60); return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 4 + ((k * 13) % 9) }; }), []);
  const sparks = useMemo(() => Array.from({ length: 10 + tier * 8 }, (_, k) => { const a = (k / (10 + tier * 8)) * Math.PI * 2; const d = 160 + ((k * 53) % 140); return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 3 + ((k * 7) % 6) }; }), [tier]);
  const color = phase === 'drop' ? INK : info.color;
  const revealed = phase === 'reveal' && result;
  const t = result ? PLOT_TYPES[result.type as keyof typeof PLOT_TYPES] : null;

  return (
    <motion.div className="fixed inset-0 z-[200] grid touch-none select-none place-items-center overflow-hidden" data-testid="ink-roll"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      {/* the room */}
      <div className="absolute inset-0 bg-[#05040F]" />
      <motion.div className="absolute inset-0" animate={{ background: revealed ? `radial-gradient(70% 55% at 50% 42%, ${info.color}66 0%, #0B0820 62%, #05040F 100%)` : 'radial-gradient(70% 55% at 50% 42%, #2A1F5C 0%, #0B0820 62%, #05040F 100%)' }} transition={{ duration: 0.5 }} />
      {/* light rays behind the canvas once it lands */}
      {revealed && !reduce && (
        <motion.div className="pointer-events-none absolute left-1/2 top-[40%] h-[150vmax] w-[150vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: `repeating-conic-gradient(from 0deg, ${tier >= 4 ? '#ffffff' : info.glow}${tier >= 3 ? '55' : '33'} 0deg 7deg, transparent 7deg 22deg)`, WebkitMaskImage: 'radial-gradient(closest-side, #000 10%, transparent 70%)', maskImage: 'radial-gradient(closest-side, #000 10%, transparent 70%)' }}
          initial={{ opacity: 0, scale: 0.4, rotate: 0 }} animate={{ opacity: 1, scale: 1, rotate: 360 }} transition={{ opacity: { duration: 0.4 }, scale: { duration: 0.5 }, rotate: { duration: 30, repeat: Infinity, ease: 'linear' } }} />
      )}

      <motion.div animate={shake} className="relative flex w-full flex-col items-center px-6">
        {/* the rarity name above the canvas */}
        <div className="relative mb-5 h-[64px]">
          <AnimatePresence mode="popLayout">
            {phase === 'drop' ? (
              <motion.div key="t" className="font-display text-[22px] font-black text-white/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Rolling your plot…</motion.div>
            ) : revealed ? (
              <motion.div key="r" data-testid="roll-rarity" className="font-display text-[52px] font-black uppercase leading-none tracking-wide"
                style={{ color: '#fff', WebkitTextStroke: `2px ${info.color}`, textShadow: `0 0 24px ${info.color}, 0 0 60px ${info.glow}, 0 6px 0 ${info.color}` }}
                initial={{ scale: 3, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}>
                {info.name}{tier >= 3 ? '!' : ''}
              </motion.div>
            ) : (
              <motion.div key={shown} className="font-display text-[36px] font-black uppercase leading-none" style={{ color: info.color, textShadow: `0 0 18px ${info.color}` }}
                initial={{ y: -26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 26, opacity: 0 }} transition={{ duration: 0.08 }}>{info.name}</motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* the canvas */}
        <motion.div className="relative aspect-square w-[min(74vw,320px)]"
          initial={{ scale: 0.5, rotate: -6, opacity: 0 }} animate={{ scale: phase === 'spin' ? [1, 0.95, 1.02, 1] : 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
          {/* glow behind */}
          <motion.div className="absolute -inset-6 rounded-[40px] blur-2xl" animate={{ background: color, opacity: phase === 'drop' ? 0 : revealed ? 0.9 : 0.45 }} transition={{ duration: 0.12 }} />
          <div className="absolute inset-0 overflow-hidden rounded-[28px] border-[6px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]" style={{ borderColor: revealed ? info.color : '#E9DFC8', background: 'linear-gradient(160deg,#FFFCF5,#F3EAD6)' }}>
            {/* linen */}
            <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#6B4A22 0 1px,transparent 1px 6px),repeating-linear-gradient(90deg,#6B4A22 0 1px,transparent 1px 6px)' }} />
            {/* the ink */}
            {phase !== 'drop' && (
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
                <defs><radialGradient id="ink-shine" cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity="0.45" /><stop offset="0.4" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
                <motion.g style={{ originX: '50px', originY: '50px' }} initial={{ scale: 0 }} animate={{ scale: revealed ? 2.4 : 0.62, rotate: revealed ? 25 : 0 }} transition={revealed ? { duration: 0.55, ease: [0.2, 0.9, 0.3, 1] } : { type: 'spring', stiffness: 300, damping: 14 }}>
                  <motion.path d={BLOB} animate={{ fill: color }} transition={{ duration: 0.06 }} />
                  <path d={BLOB} fill="url(#ink-shine)" />
                </motion.g>
              </svg>
            )}
            {/* the plot itself rises out of the ink, in its rarity's finish */}
            {revealed && result && (
              <motion.div className="absolute inset-[14%] drop-shadow-[0_14px_20px_rgba(0,0,0,0.45)]" data-testid="roll-plot"
                initial={{ opacity: 0, scale: 0.3, rotate: -12, y: 20 }} animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }} transition={{ delay: 0.22, type: 'spring', stiffness: 320, damping: 15 }}>
                <BasePlotArt rarity={result.rarity} size="100%" />
              </motion.div>
            )}
            {/* splash droplets */}
            {phase !== 'drop' && !reduce && drops.map((d, k) => (
              <motion.span key={k} className="absolute left-1/2 top-1/2 rounded-full" style={{ width: d.r * 2, height: d.r * 2, marginLeft: -d.r, marginTop: -d.r }}
                initial={{ x: 0, y: 0, scale: 1.4, background: INK }} animate={{ x: d.x, y: d.y, scale: 0.7, background: color }} transition={{ x: { duration: 0.45, ease: 'easeOut' }, y: { duration: 0.45, ease: 'easeOut' }, scale: { duration: 0.45 }, background: { duration: 0.06 } }} />
            ))}
          </div>
          {/* the falling drop */}
          {phase === 'drop' && (
            <motion.svg viewBox="0 0 40 60" className="absolute left-1/2 top-1/2 h-[72px] w-[48px] -translate-x-1/2"
              initial={{ y: '-62vh', scaleY: 1.5, scaleX: 0.8 }} animate={{ y: '-55%', scaleY: [1.5, 1.6, 0.6], scaleX: [0.8, 0.8, 1.6] }} transition={{ duration: reduce ? 0.1 : 0.62, ease: [0.5, 0, 0.9, 0.6], times: [0, 0.85, 1] }}>
              <path d="M20 2 C26 16 36 28 36 40 A16 16 0 0 1 4 40 C4 28 14 16 20 2Z" fill={INK} />
              <ellipse cx="14" cy="38" rx="4" ry="7" fill="#fff" opacity="0.35" />
            </motion.svg>
          )}
          {/* the shockwave at the splash, and again at the reveal */}
          {phase !== 'drop' && !reduce && <motion.span key={revealed ? 'r' : 's'} className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-4" style={{ borderColor: revealed ? info.glow : '#fff' }}
            initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: revealed ? 7 : 4, opacity: 0 }} transition={{ duration: revealed ? 0.8 : 0.5 }} />}
          {/* sparks on the reveal */}
          {revealed && !reduce && sparks.map((s, k) => (
            <motion.span key={k} className="pointer-events-none absolute left-1/2 top-1/2 rounded-full" style={{ width: s.s, height: s.s, background: k % 3 ? info.glow : '#fff', boxShadow: `0 0 10px ${info.color}` }}
              initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: s.x, y: s.y, opacity: 0 }} transition={{ duration: 0.9 + (k % 4) * 0.15, ease: 'easeOut' }} />
          ))}
        </motion.div>

        {/* what you got */}
        <div className="mt-7 min-h-[150px] w-full max-w-[340px]">
          <AnimatePresence>
            {revealed && result && (
              <motion.div className="grid gap-3 text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <div className="text-sm font-bold text-white/80">
                  {result.first ? 'Your first plot · ' : ''}<span style={{ color: t?.a }}>{t?.name ?? 'A'} plot</span> · <span className="text-[#3DDC97] tnum">{formatRate(result.usd)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button onClick={onClose} className="h-[52px] rounded-2xl border-[1.5px] border-white/20 bg-white/10 font-display text-[16px] font-black text-white" data-testid="roll-done">Collect</button>
                  <button onClick={onAgain} disabled={!canAgain} className="h-[52px] rounded-2xl bg-[linear-gradient(135deg,#9a7bff,#5b3df5_55%,#ff3d9a)] font-display text-[16px] font-black text-white shadow-[0_5px_0_#2c1a8a] disabled:opacity-50" data-testid="roll-again">🎲 {againLabel}</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
