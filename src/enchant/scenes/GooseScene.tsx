// 🪿 The Golden Goose: a meadow at golden hour. The egg swells as it grows (Platinum ones shimmer silver), cracks show
// every bite the fox took, the bush rustles before the fox comes — and when it peeks out, tap it to chase it off.
// Rub the egg with your finger to polish it (the shine follows your finger); hold it to feel its heartbeat; poke the goose.
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { cn, fmt } from '../../lib/utils';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';
import { useHeartbeat, usePoke, useRub } from '../living';

const eNow = (v: SceneProps['v']) => Date.parse(v.clock?.now ?? v.server_time) / 1000;

export function GooseScene({ v, view, act, busy, at }: SceneProps) {
  const egg = useRef<HTMLButtonElement>(null);
  const fox = useRef<HTMLButtonElement>(null);
  const frozen = !!v.clock?.frozen_until;
  const lurkLeft = useLeft(view.lurk_end != null ? view.lurk_end - eNow(v) : null, frozen ? Date.now() : at);
  const polishIn = useLeft(view.polish_ready_in, at);
  const collectIn = useLeft(view.collect_in, at);
  const scale = 0.5 + 0.65 * (Number(view.grow) / 100);
  const plat = !!view.platinum;
  const lurking = view.lurking != null && (lurkLeft ?? 0) > 0;
  const small = (view.visits ?? []).some((x: any) => x.state === 'lurking_small');
  const canPolish = !busy && !((polishIn ?? 0) > 0) && view.polish < view.polish_max;
  const polish = async () => {
    const r = await act('polish');
    if (r) efx.burst({ ...centerOf(egg.current), colors: plat ? ['#fff', '#DDE6F0', '#B8C4D6'] : ['#FFE8A3', '#FFD23F', '#fff'], count: 40, speed: 6, kind: 'glitter' });
    rub.reset();
  };
  const rub = useRub(700, () => { if (canPolish) void polish(); });
  const heart = useHeartbeat(view.grow > 80 ? 96 : 68);
  const { n: pokes, poke } = usePoke();
  const chase = async () => {
    const r = await act('chase', {}, { at: centerOf(fox.current) });
    if (r) efx.burst({ ...centerOf(fox.current), colors: ['#FF8C42', '#fff'], count: 30, speed: 9, kind: 'emoji', emojis: ['💨', '🍂'] });
  };
  const collect = async () => {
    efx.burst({ ...centerOf(egg.current), colors: plat ? ['#fff', '#C9D6E8'] : ['#FFD23F', '#FFB31F', '#fff'], count: 90, speed: 13, kind: 'spark' });
    await act('collect', {}, { at: centerOf(egg.current) });
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'linear-gradient(180deg,#FFB36B 0%,#FFD89A 38%,#9ED07A 62%,#5E9E48 100%)' }} data-testid="goose-scene">
        {/* sun and hills */}
        <div className="absolute left-[62%] top-[10%] h-24 w-24 rounded-full bg-[radial-gradient(circle,#FFF5C8,#FFD23F_45%,transparent_70%)] opacity-90" />
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          <path d="M0 190 Q90 150 180 180 T400 170 V300 H0Z" fill="#7DBE5C" />
          <path d="M0 225 Q120 195 230 220 T400 215 V300 H0Z" fill="#5A9C43" />
          {Array.from({ length: 26 }, (_, i) => <path key={i} d={`M${i * 16 + 4} 300 q3 -16 6 0`} stroke="#3F7A2E" strokeWidth="2" fill="none" className="lv-sway" style={{ animationDelay: `${(i % 7) * 0.3}s` }} />)}
        </svg>
        {/* the bush the fox hides in */}
        <div className={cn('absolute bottom-[14%] left-[3%] w-[34%]', view.rustle && !lurking && 'lv-rustle')} style={{ transformOrigin: '50% 100%' }}>
          <svg viewBox="0 0 120 80" className="w-full" aria-hidden><circle cx="30" cy="55" r="28" fill="#2F6B2A" /><circle cx="62" cy="42" r="34" fill="#3B8235" /><circle cx="94" cy="56" r="25" fill="#2F6B2A" /><circle cx="50" cy="30" r="6" fill="#FF5A5F" /><circle cx="80" cy="36" r="5" fill="#FF5A5F" /></svg>
        </div>
        <AnimatePresence>
          {lurking && (
            <motion.button ref={fox} key="fox" onClick={() => void chase()} disabled={!!busy} data-testid="goose-fox"
              className="absolute bottom-[22%] left-[12%] w-[24%] origin-bottom" initial={{ x: -30, y: 20, opacity: 0, scale: small ? 0.45 : 1 }} animate={{ x: 0, y: 0, opacity: 1, scale: small ? 0.45 : 1 }}
              exit={{ x: -260, opacity: 0, rotate: -20, transition: { duration: 0.5 } }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} aria-label="Chase the fox">
              <svg viewBox="0 0 100 80" className="w-full drop-shadow-[0_6px_6px_rgba(0,0,0,0.35)]" aria-hidden>
                <path d="M15 70 Q10 40 35 35 L45 30 Q60 18 75 30 L88 22 L86 40 Q95 52 80 60 Q70 72 45 70Z" fill="#E8692E" />
                <path d="M75 30 L70 10 L82 24Z M60 26 L58 8 L68 22Z" fill="#E8692E" /><path d="M76 46 Q86 50 80 56 Q74 54 76 46Z" fill="#fff" />
                <circle cx="72" cy="38" r="3.2" fill="#1a0b00" className="lv-ench-rune" /><circle cx="84" cy="40" r="2.2" fill="#1a0b00" />
                <path d="M15 70 Q0 60 8 48 Q20 62 30 66Z" fill="#fff" /></svg>
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#2B0E00]/80 px-2 py-0.5 text-[11px] font-black text-[#FFB27A]">TAP! · {dur(lurkLeft)}</span>
            </motion.button>
          )}
        </AnimatePresence>
        {/* the goose */}
        <motion.button key={pokes} onClick={poke} className="absolute bottom-[18%] right-[8%] w-[30%] lv-waddle" animate={pokes ? { scaleY: [1, 0.82, 1.08, 1], rotate: [0, -6, 4, 0] } : {}} transition={{ duration: 0.4 }} aria-label="Poke the goose" data-testid="goose-goose">
          {pokes > 0 && <motion.span key={`h${pokes}`} className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-white px-2 py-0.5 text-[12px] font-black text-[#3A2600]" initial={{ y: 6, opacity: 0 }} animate={{ y: -6, opacity: [0, 1, 0] }} transition={{ duration: 0.9 }}>HONK!</motion.span>}
          <svg viewBox="0 0 120 120" className="w-full drop-shadow-[0_8px_8px_rgba(0,0,0,0.25)]" aria-hidden>
            <ellipse cx="60" cy="82" rx="38" ry="26" fill="#FFF8E7" /><path d="M30 78 Q20 60 34 58 Q46 70 48 82Z" fill="#F3E2BE" />
            <path d="M78 66 Q80 30 92 22 Q104 18 104 32 Q100 40 92 44 Q90 60 92 72Z" fill="#FFF8E7" />
            <path d="M102 28 L118 32 L102 36Z" fill="#FF9F1C" /><circle cx="97" cy="28" r="2.6" fill="#1a1205" />
            <path d="M54 106 L50 116 M66 106 L70 116" stroke="#FF9F1C" strokeWidth="4" strokeLinecap="round" />
            <path d="M40 74 Q60 64 80 76" stroke="#FFD23F" strokeWidth="3" fill="none" opacity="0.8" /></svg>
        </motion.button>
        {/* the nest and the egg */}
        <div className="absolute bottom-[10%] left-1/2 w-[38%] -translate-x-1/2">
          <div className="relative grid place-items-center">
            <motion.button ref={egg} data-testid="goose-egg" {...rub.bind}
              onPointerDown={(e) => { rub.bind.onPointerDown(e); heart.onPointerDown(); }} onPointerUp={() => { rub.bind.onPointerUp(); heart.onPointerUp(); }} onPointerLeave={heart.onPointerLeave} onPointerCancel={() => { rub.bind.onPointerCancel(); heart.onPointerCancel(); }}
              className="relative mb-[-14%] aspect-[4/5] w-[62%] origin-bottom" animate={{ scale }} whileTap={{ scale: scale * 0.94 }} transition={{ type: 'spring', stiffness: 120, damping: 12 }} aria-label="Rub the egg to polish it">
              <div className="absolute inset-0 overflow-hidden rounded-[50%_50%_46%_46%/60%_60%_40%_40%]" style={{
                background: plat ? 'radial-gradient(circle at 35% 28%,#FFFFFF,#E3EAF3 35%,#A9B7CB 75%,#7D8BA3)' : 'radial-gradient(circle at 35% 28%,#FFF6C8,#FFD23F 38%,#E9A100 78%,#9C6400)',
                boxShadow: `0 0 ${20 + view.grow / 2}px ${plat ? '#E6F0FF' : '#FFD23F'}` }}>
                <div className="lv-shine absolute -inset-y-4 left-0 w-1/3 bg-white/50 blur-[2px]" />
                {rub.at && <span className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 blur-md" style={{ left: rub.at.x, top: rub.at.y }} />}
                {rub.progress > 0 && rub.progress < 1 && <span className="pointer-events-none absolute inset-x-[18%] bottom-[12%] h-1.5 overflow-hidden rounded-full bg-black/25"><span className="block h-full bg-white" style={{ width: `${rub.progress * 100}%` }} /></span>}
                {Array.from({ length: Math.min(view.bites, 4) }, (_, i) => (
                  <svg key={i} viewBox="0 0 40 50" className="absolute inset-0 h-full w-full" aria-hidden><path d={['M8 18 L16 22 L12 28 L20 32', 'M30 12 L24 20 L30 24 L26 30', 'M14 36 L22 34 L20 42', 'M32 30 L26 36 L32 40'][i]} stroke="#5A3A00" strokeWidth="1.4" fill="none" /></svg>
                ))}
              </div>
              {plat && <span className="absolute -right-2 -top-2 text-xl lv-ench-rune">✨</span>}
            </motion.button>
            <svg viewBox="0 0 160 50" className="relative w-full" aria-hidden><ellipse cx="80" cy="30" rx="76" ry="18" fill="#8B5A2B" />{Array.from({ length: 18 }, (_, i) => <path key={i} d={`M${8 + i * 8} ${24 + (i % 3) * 4} q20 -${6 + (i % 4) * 2} 40 0`} stroke="#C08A4A" strokeWidth="2" fill="none" />)}</svg>
          </div>
        </div>
        {/* readout */}
        <div className="absolute left-3 top-3 grid gap-1">
          <span className="rounded-full bg-black/35 px-3 py-1 font-display text-[18px] font-black text-white backdrop-blur" data-testid="goose-value">{plat ? '✨ Platinum egg' : '🥚 Golden egg'} · ≈{fmt(view.value)} Ink</span>
          <span className="w-fit rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-bold text-white/90">{Math.round(view.grow)}% grown{view.bites ? ` · 🦊 bitten ×${view.bites}` : ''}{view.streak ? ` · 🔥 streak ${view.streak}` : ''}</span>
        </div>
        {view.rustle && !lurking && <div className="absolute bottom-[42%] left-[6%] rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold text-white">…something stirs in the bush</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void polish()} disabled={!!busy || (polishIn ?? 0) > 0 || view.polish >= view.polish_max} data-testid="goose-polish">
          ✨ Polish {view.polish >= view.polish_max ? '(max)' : (polishIn ?? 0) > 0 ? `· ${dur(polishIn)}` : `+3 (${view.polish}/${view.polish_max})`}
        </Button>
        <Button variant="rainbow" onClick={() => void collect()} disabled={!!busy || (collectIn ?? 0) > 0} loading={busy === 'collect'} data-testid="goose-collect">
          {(collectIn ?? 0) > 0 ? `Ready in ${dur(collectIn)}` : `🥚 Collect ≈${fmt(view.value)}`}
        </Button>
      </div>
      <p className="text-center text-[11px] text-white/55">Rub the egg to polish it · hold it to feel it beat. Wait longer for a bigger egg — but every fox that slips past takes a bite. {view.eggs} egg{view.eggs === 1 ? '' : 's'} laid.</p>
    </div>
  );
}
