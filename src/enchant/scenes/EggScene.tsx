// 🥚 A Cuckoo Egg: the Cuckoo flew away and left this. Pick one of the six new enchantments and the egg cracks — the
// shell bursts, and what you chose rises out in its own colours. It keeps the Cuckoo's level, XP, Stars and name.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Button } from '../../ui';
import { centerOf, efx, type SceneProps } from '../core';
import { sleep } from '../craft';
import { HATCHABLE, kindInfo } from '../kinds';
import { feel } from '../living';

export function EggScene({ v, act, busy }: SceneProps) {
  const egg = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [crack, setCrack] = useState(0);
  const [born, setBorn] = useState<string | null>(null);
  const hatch = async () => {
    if (!pick) return;
    for (let i = 1; i <= 3; i++) { setCrack(i); feel(i === 3 ? 'heavy' : 'medium'); await sleep(380); }
    const r = await act('hatch', { kind: pick }, { silent: true });
    if (!r?.result?.hatched) { setCrack(0); return; }
    const k = kindInfo(pick);
    setBorn(pick);
    efx.burst({ ...centerOf(egg.current), colors: [k.a, k.b, '#fff', '#FFE8A3'], count: 280, speed: 16, kind: 'spark' });
    efx.burst({ ...centerOf(egg.current), colors: [k.a], count: 18, speed: 10, kind: 'emoji', emojis: ['🥚', k.emoji, '✨'] });
  };
  const k = pick ? kindInfo(pick) : null;
  return (
    <div className="grid gap-3">
      <div className="lvx-stage lv-scene aspect-[4/3] w-full" data-testid="egg-scene">
        <div className="lvx-nest" style={k ? { background: `radial-gradient(70% 60% at 50% 60%, ${k.a}33 0%, #101820 70%)` } : undefined} />
        <div ref={egg} className="absolute left-1/2 top-[48%] h-[58%] -translate-x-1/2 -translate-y-1/2" style={{ aspectRatio: '0.8' }}>
          <AnimatePresence>
            {!born && (
              <motion.svg key="egg" viewBox="0 0 80 100" className="lvx-egg h-full w-full overflow-visible" exit={{ scale: 1.4, opacity: 0 }} transition={{ duration: 0.35 }} aria-hidden>
                <defs><radialGradient id="egg-g" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#E9F8FF" /><stop offset="0.5" stopColor="#8EC5FF" /><stop offset="1" stopColor="#2C5A8A" /></radialGradient></defs>
                <path d="M40 4 C64 4 76 44 76 64 C76 86 60 98 40 98 C20 98 4 86 4 64 C4 44 16 4 40 4 Z" fill="url(#egg-g)" stroke="#E9F8FF" strokeOpacity="0.5" strokeWidth="1.5" />
                {[[18, 30], [56, 22], [62, 60], [26, 70], [44, 46]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3 + (i % 3)} fill="#F72585" opacity="0.55" />)}
                {crack >= 1 && <path d="M30 40 L36 46 L32 52 L40 56" stroke="#0B1A2A" strokeWidth="2" fill="none" />}
                {crack >= 2 && <path d="M40 56 L48 50 L52 58 L60 54" stroke="#0B1A2A" strokeWidth="2" fill="none" />}
                {crack >= 3 && <path d="M14 58 L22 54 L26 62 L30 56" stroke="#0B1A2A" strokeWidth="2" fill="none" />}
                {k && <ellipse cx="40" cy="60" rx="20" ry="26" fill={k.a} opacity={0.12 + crack * 0.12} />}
              </motion.svg>
            )}
          </AnimatePresence>
          {born && (
            <motion.div className="absolute inset-0 grid place-items-center text-center" initial={{ scale: 0.2, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }} data-testid="egg-born">
              <div className="grid gap-1"><span className="text-[90px] leading-none" style={{ filter: `drop-shadow(0 0 24px ${kindInfo(born).a})` }}>{kindInfo(born).emoji}</span>
                <span className="font-display text-[22px] font-black text-white" style={{ textShadow: `0 0 16px ${kindInfo(born).a}` }}>A {kindInfo(born).name}!</span></div>
            </motion.div>
          )}
        </div>
        {!born && <div className="absolute inset-x-0 top-3 text-center text-[13px] font-black text-white/80">Your Cuckoo flew away — and left you an egg.</div>}
      </div>
      {!born && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="egg-choices">
            {HATCHABLE.map((id) => {
              const info = kindInfo(id);
              return (
                <motion.button key={id} type="button" className="grid gap-1 rounded-2xl border-2 p-2.5 text-left" style={{ borderColor: pick === id ? info.a : 'rgba(255,255,255,0.1)', background: pick === id ? `${info.a}22` : 'rgba(255,255,255,0.03)' }}
                  onClick={() => { setPick(id); feel('light'); }} whileTap={{ scale: 0.97 }} data-testid={`egg-pick-${id}`}>
                  <span className="text-[26px]">{info.emoji}</span>
                  <span className="text-[13px] font-black" style={{ color: info.a }}>{info.name}</span>
                  <span className="text-[11px] leading-snug text-white/65">{info.tagline}</span>
                </motion.button>
              );
            })}
          </div>
          <Button variant="rainbow" size="lg" onClick={() => void hatch()} disabled={!pick || !!busy || crack > 0} data-testid="egg-hatch">{pick ? `🥚 Hatch a ${kindInfo(pick).name}` : 'Choose what hatches'}</Button>
          <p className="text-center text-[11px] text-white/55">It keeps your Cuckoo’s level {v.level}, its XP{v.stars ? `, its ${'★'.repeat(v.stars)}` : ''}, its name and its chronicle.</p>
        </>
      )}
    </div>
  );
}
