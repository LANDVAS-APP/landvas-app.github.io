// An enchanted plot in the plot panel: whose enchantment it is, what it's doing, and the way into the Grimoire.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { kindInfo, enchantName } from './kinds';
import { Sigil } from './Sigil';
import './enchant.css';

export function PlotEnchant({ gx, gy }: { gx: number; gy: number }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['enchant-at', gx, gy], queryFn: () => api.enchantAt(gx, gy), staleTime: 20_000 });
  const e = q.data;
  if (!e) return null;
  const k = kindInfo(e.kind);
  return (
    <motion.button onClick={() => (e.mine ? nav(`/grimoire/${e.id}`) : nav('/grimoire?tab=bestiary'))} className="lv-ench-card mt-3 flex w-full items-center gap-3 p-3 text-left" style={{ ['--a' as string]: k.a }}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="plot-enchant">
      <Sigil kind={e.kind} seed={e.sigil} size={60} level={e.level} />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="text-[11px] font-black uppercase tracking-wider text-[#E5CCFF]">✨ Enchanted{e.status === 'dormant' ? ' · sleeping' : ''}</span>
        <span className="truncate font-display text-[17px] font-black">{enchantName(e)}</span>
        <span className="text-[11px] text-white/60">{k.name} #{e.serial} of {e.minted}{e.owner ? ` · @${e.owner.username}` : ''}{e.partner ? ` · 🧬 ${e.partner.hybrid}` : ''}</span>
        <span className="text-[11px] font-bold" style={{ color: k.a }}>{e.mine ? 'Open it in your Grimoire →' : e.status === 'dormant' ? 'Claim this plot and it wakes for you.' : k.tagline}</span>
      </span>
    </motion.button>
  );
}
