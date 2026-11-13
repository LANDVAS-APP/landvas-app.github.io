// The Grimoire on the map: a glowing spellbook that floats, sheds gold motes, and pulses a badge when an enchantment
// needs you (a fox at the egg, a wish ready, a chick hatched…) or something is visiting your land.
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useOnboardedMe } from '../lib/queries';
import { useMyEnchantments, useVisitors } from './core';
import { kindInfo } from './kinds';
import './enchant.css';
import { GameDisc } from '../ui';

export function GrimoireButton({ rail }: { rail?: boolean } = {}) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  if (!me) return null;
  const list = mine.data ?? [];
  const attn = list.filter((e) => e.attention).length + (visitors.data?.length ?? 0);
  const first = list.find((e) => e.attention) ?? list[0];
  if (rail) return (
    <GameDisc tone="gold" size={44} glow={attn > 0} badge={attn || undefined}
      onClick={() => nav('/grimoire')} aria-label={`Grimoire${attn ? ` — ${attn} need${attn === 1 ? 's' : ''} you` : ''}`} data-testid="grimoire-button">
      <span className="text-[20px] leading-none">📖</span>
    </GameDisc>
  );
  return (
    <motion.button onClick={() => nav('/grimoire')} className="pointer-events-auto relative grid justify-items-center gap-0.5" whileTap={{ scale: 0.9 }} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }} aria-label={`Grimoire${attn ? ` — ${attn} need${attn === 1 ? 's' : ''} you` : ''}`} data-testid="grimoire-button">
      <span className="lv-grim-btn">
        {[0, 1, 2, 3].map((i) => <span key={i} className="lv-grim-mote" style={{ left: `${18 + i * 9}px`, top: '18px', animationDelay: `${i * 0.7}s`, ['--dx' as string]: `${(i - 1.5) * 6}px` }} />)}
        <span className="lv-grim-book text-[30px] leading-none drop-shadow-[0_0_10px_rgba(255,210,63,0.8)]">📖</span>
        {first && <span className="absolute -bottom-1 -left-1 grid h-6 w-6 place-items-center rounded-full bg-[#12041F] text-[13px] ring-2 ring-[#FFD23F]/70">{kindInfo(first.reflect_kind ?? first.kind).emoji}</span>}
        {attn > 0 ? <span className="lv-grim-badge absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-[linear-gradient(135deg,#FF3D9A,#FF7A59)] px-1 text-[12px] font-black text-white shadow-[0_0_12px_#FF3D9A]" data-testid="grimoire-badge">{attn}</span>
          : list.length > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#FFD23F] px-1 text-[10px] font-black text-[#1a0b2e]">{list.length}</span>}
      </span>
      <span className="rounded-full bg-[#12041F]/85 px-2 py-[1px] text-[10px] font-black uppercase tracking-wider text-[#FFE8A3] shadow">Grimoire</span>
    </motion.button>
  );
}
