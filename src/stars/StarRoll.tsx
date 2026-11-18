// A plot on a star rolling: the drum of rarities spins (the everyday ladder — there are no ultras among the stars),
// slows, and lands; the panel on the shell lights up with its beam. Keystones only spin the top of the ladder.
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { RARITY_ORDER, rarityInfo, type RarityId } from '../shared/rarity';
import type { StarClaim } from './types';

const LADDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as RarityId[];

export function StarRoll({ res, onClose }: { res: StarClaim; onClose(): void }) {
  const ladder = useMemo(() => (res.keystone ? LADDER.slice(3) : LADDER).filter((r) => (RARITY_ORDER as string[]).includes(r) || true), [res.keystone]);
  const target = Math.max(0, ladder.indexOf(res.rarity as RarityId));
  const spins = ladder.length * 4 + target;
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let k = 0, t: ReturnType<typeof setTimeout>;
    const step = () => {
      k++;
      setI(k);
      if (k >= spins) { setDone(true); return; }
      // (it slows as it comes round to where it lands)
      const left = spins - k;
      t = setTimeout(step, left > 10 ? 55 : 55 + (10 - left) * 38);
    };
    t = setTimeout(step, 250);
    return () => clearTimeout(t);
  }, [spins]);
  const cur = ladder[i % ladder.length];
  const info = rarityInfo(done ? res.rarity : cur);
  return (
    <motion.div className="fixed inset-0 z-[65] grid place-items-center bg-black/55 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done && onClose()} data-testid="star-roll">
      <motion.div className="relative grid w-full max-w-xs justify-items-center gap-3 rounded-[28px] border-2 bg-[#070B1C]/95 px-5 pb-5 pt-6 text-center text-white shadow-2xl"
        style={{ borderColor: info.color, boxShadow: done ? `0 0 60px ${info.glow || info.color}` : undefined }}
        animate={done ? { scale: [1, 1.06, 1] } : {}} transition={{ duration: 0.5 }}>
        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/55">{res.keystone ? '⬟ A Keystone' : 'A plot among the stars'}</div>
        <div className="grid h-[92px] w-full place-items-center overflow-hidden rounded-2xl bg-white/5">
          <motion.div key={done ? 'done' : i} initial={{ y: -16, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.08 }}
            className="font-display text-[30px] font-black" style={{ color: info.color, textShadow: `0 0 18px ${info.glow || info.color}` }} data-testid={done ? 'star-roll-rarity' : undefined}>
            {info.emoji ? `${info.emoji} ` : ''}{info.name}
          </motion.div>
        </div>
        {done && (
          <motion.div className="grid gap-1.5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {res.shiny && <div className="font-display text-[15px] font-black text-[#FFF0A6]">✨ Shiny!</div>}
            <div className="text-[12.5px] text-white/75">+${(res.usd_per_second * 3600).toFixed(6)} an hour in rent · cost {res.cost.ink.toLocaleString()} Ink</div>
            {res.discovered && <div className="text-[12.5px] font-bold text-[#9DE4FF]">🔭 You’re this star’s Discoverer</div>}
            {res.discoverer_cut > 0 && <div className="text-[11.5px] text-white/55">The Discoverer earned {res.discoverer_cut} Ink from it</div>}
            <div className="text-[11.5px] text-white/50">Next plot here: {res.next_price.ink.toLocaleString()} Ink</div>
            <button className="lv-btn on mt-1 h-10 px-6" onClick={onClose} data-testid="star-roll-ok">Nice</button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
