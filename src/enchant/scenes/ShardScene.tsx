// 🪞 Mirror Shard: a jagged piece of glass that never quite reflects the room. Gaze into it and three of other players'
// enchantments swim up in its fragments; step through one — the glass shatters and reforms — and for 24 hours the
// shard IS that enchantment, its whole scene seen through glass. Every reflection adds a crack; at seven it shatters.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useUi } from '../../lib/store';
import { buzz } from '../../native/native';
import { Button } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur, kindInfo } from '../kinds';
import { SceneFor } from './index';

const CRACKS = ['M50 50 L22 18', 'M50 50 L84 30', 'M50 50 L70 86', 'M50 50 L18 70', 'M50 50 L56 10', 'M50 50 L90 62', 'M50 50 L34 92'];

export function ShardScene(p: SceneProps) {
  const { v, view, act, busy, at } = p;
  const glass = useRef<HTMLDivElement>(null);
  const [shatter, setShatter] = useState(false);
  const gazeIn = useLeft(view.gaze_in, at);
  const reflect = view.reflect;
  const leftR = useLeft(reflect ? Number(reflect.until) - Date.parse(v.clock?.now ?? v.server_time) / 1000 : null, at);
  const options: any[] = view.options ?? [];
  const step = async (i: number) => {
    setShatter(true);
    if (useUi.getState().settings.haptics) buzz('heavy');
    efx.burst({ ...centerOf(glass.current), colors: ['#C0F5FF', '#fff', '#7DD3FC'], count: 160, speed: 14, kind: 'glitter' });
    await new Promise((r) => setTimeout(r, 600));
    const r = await act('step', { i }, { silent: true });
    setShatter(false);
    if (r?.result?.shattered) efx.burst({ ...centerOf(glass.current), colors: ['#fff'], count: 30, speed: 12, kind: 'emoji', emojis: ['💥', '🍀', '✨'] });
  };
  if (reflect && v.reflected) {
    const k = kindInfo(reflect.kind);
    return (
      <div className="grid gap-3">
        <div className="flex items-center gap-2.5 rounded-2xl border border-[#C0F5FF]/40 bg-[linear-gradient(90deg,rgba(192,245,255,0.15),rgba(125,211,252,0.05))] p-2.5" data-testid="shard-reflecting">
          <span className="text-2xl">🪞</span>
          <span className="grid flex-1 leading-tight"><span className="text-[13px] font-black text-[#C0F5FF]">Reflecting {reflect.owner_name ? `@${reflect.owner_name}’s` : 'a dream of a'} {k.name}</span><span className="text-[11px] text-white/60">for {dur(leftR)} · crack {view.cracks}/7</span></span>
          <Button size="sm" variant="ghost" onClick={() => void act('release')} disabled={!!busy}>Step back</Button>
        </div>
        <div className="relative rounded-[30px] p-[3px]" style={{ background: 'linear-gradient(135deg,#C0F5FF,#7DD3FC 40%,#fff 60%,#7DD3FC)' }}>
          <div className="relative overflow-hidden rounded-[28px]">
            <SceneFor kind={reflect.kind} {...p} view={v.reflected} mirror />
            <div className="lv-glass pointer-events-none absolute inset-0 opacity-25 mix-blend-screen" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 50% 40%,#16324A,#060E18 75%)' }} data-testid="shard-scene">
        <motion.div ref={glass} className="absolute left-1/2 top-1/2 aspect-[3/4] w-[46%] -translate-x-1/2 -translate-y-1/2"
          animate={shatter ? { scale: [1, 1.15, 0.2], rotate: [0, -8, 25], opacity: [1, 1, 0] } : { scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 0.6 }}>
          <svg viewBox="0 0 100 130" className="h-full w-full drop-shadow-[0_0_30px_rgba(192,245,255,0.5)]" aria-hidden>
            <defs><linearGradient id="shard" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E8FBFF" /><stop offset="0.45" stopColor="#7DD3FC" /><stop offset="0.55" stopColor="#C0F5FF" /><stop offset="1" stopColor="#2A6F97" /></linearGradient></defs>
            <polygon points="50,2 88,30 96,84 60,128 14,104 4,40" fill="url(#shard)" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.5" />
            <g transform="translate(0 15)">{CRACKS.slice(0, view.cracks).map((d, i) => <path key={i} d={d} stroke="#fff" strokeWidth="1.2" fill="none" opacity="0.9" />)}</g>
          </svg>
          <div className="lv-shine absolute inset-y-0 left-0 w-1/4 bg-white/40 blur-sm" />
          {/* reflections swimming in the glass */}
          <AnimatePresence>
            {options.map((o, i) => (
              <motion.div key={`${o.kind}${i}`} className="absolute" style={{ left: `${[18, 52, 30][i]}%`, top: `${[16, 34, 60][i]}%` }} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 0.85, scale: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.2 + i * 0.2 }}>
                <Sigil kind={o.kind} seed={o.serial ?? i + 7} size={44} still />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
        <div className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-[#C0F5FF]" data-testid="shard-cracks">🪞 {view.cracks}/7 cracks</div>
        {!options.length && <div className="absolute inset-x-0 bottom-4 text-center text-[13px] font-bold text-white/70">{(gazeIn ?? 0) > 0 ? `The glass is clouded · clears in ${dur(gazeIn)}` : 'The glass is clear. Look closer…'}</div>}
      </div>
      {options.length ? (
        <div className="grid gap-1.5" data-testid="shard-options">
          <div className="text-[12px] font-black uppercase tracking-wider text-white/60">Step through a reflection</div>
          {options.map((o, i) => {
            const k = kindInfo(o.kind);
            return (
              <motion.button key={i} onClick={() => void step(i)} disabled={!!busy || shatter} data-testid={`shard-step-${i}`}
                className="flex items-center gap-3 rounded-2xl border-2 bg-white/[0.04] p-2.5 text-left" style={{ borderColor: `${k.a}66` }} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} whileTap={{ scale: 0.97 }}>
                <Sigil kind={o.kind} seed={o.serial ?? i + 7} size={42} still />
                <span className="grid flex-1 leading-tight"><span className="text-[14px] font-black" style={{ color: k.a }}>{k.name}{o.serial ? ` #${o.serial}` : ''}</span>
                  <span className="text-[11px] text-white/60">{o.dream ? 'a dream — no one’s, yet' : `@${o.owner_name}’s · level ${o.level}`}</span></span>
                <span className="text-[11px] font-black text-[#C0F5FF]">Become it →</span>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <Button variant="rainbow" onClick={() => void act('gaze')} disabled={!!busy || (gazeIn ?? 0) > 0} data-testid="shard-gaze">{(gazeIn ?? 0) > 0 ? `Clouded · ${dur(gazeIn)}` : '👁️ Gaze into the shard'}</Button>
      )}
      <p className="text-center text-[11px] text-white/55">A reflection lasts 24 hours; its owner is told, and tipped 3 Ink. Seven cracks and the shard shatters into +20 Luck and Enchanted Luck.</p>
    </div>
  );
}
