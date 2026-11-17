// What the six new enchantments share: plots in plain words, rarity chips, a picker for spots on the map, and a clip
// for each big moment (a Legendary sighting, an unfold, a forged plot, a puppet show, a fated card, a glyph found).
import { motion } from 'motion/react';
import { enchantRef, offerClip, useKeepMoment } from '../clips/ClipMoment';
import type { EnchantView } from '../backend/api';
import { cn } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { rarityInfo } from '../shared/rarity';
import { usePickOnMapFor } from './PlotPickOverlay';
import { pickedFor, usePlotPick } from './plotPick';
import './craft.css';
import { readable } from '../lib/readable';

export type PlotLite = { gx: number; gy: number; rarity: string; plot_type?: string; name?: string | null; shiny?: boolean; level?: number; owner_name?: string | null; kind?: string | null };

export const typeName = (t?: string | null) => (t ? (PLOT_TYPES as Record<string, { name: string }>)[t]?.name ?? t : 'Plot');
export const plotName = (p: PlotLite) => p.name || `${typeName(p.plot_type)} ${String(p.gx).slice(-3)}·${String(p.gy).slice(-3)}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** a rarity that sorts: the ladder, then the ultras */
export const LADDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
export const grand = (r: string) => !LADDER.includes(r) || LADDER.indexOf(r) >= 4;

export function RarityChip({ r, className }: { r: string; className?: string }) {
  if (r === 'enchanted') return <span className={cn('lvx-chip text-[#1a0b2e]', className)} style={{ background: 'linear-gradient(90deg,#B79CFF,#FFE8A3)' }}>✨ Enchanted</span>;
  const ri = rarityInfo(r);
  return <span className={cn('lvx-chip', className)} style={{ background: `${ri.color}26`, color: readable(ri.color), boxShadow: `inset 0 0 0 1px ${ri.color}66` }}>{ri.name}</span>;
}

export function PlotRow({ p, on, onClick, right, testId, disabled }: { p: PlotLite; on?: boolean; onClick?: () => void; right?: React.ReactNode; testId?: string; disabled?: boolean }) {
  const ri = p.rarity === 'enchanted' ? { color: '#B79CFF' } : rarityInfo(p.rarity);
  return (
    <motion.button type="button" className={cn('lvx-row w-full', on && 'on')} style={{ ['--c' as any]: ri.color }} onClick={onClick} disabled={disabled} data-testid={testId}
      whileTap={{ scale: 0.98 }} layout>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-black" style={{ background: `linear-gradient(135deg, ${ri.color}, ${ri.color}55)`, boxShadow: p.shiny ? `0 0 12px ${ri.color}` : undefined }}>
        {p.shiny ? '✨' : p.kind ? '🔮' : '▦'}
      </span>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-[13px] font-black text-white">{plotName(p)}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/60"><RarityChip r={p.rarity} />{p.owner_name ? <span>@{p.owner_name}</span> : <span>{typeName(p.plot_type)}</span>}</span>
      </span>
      {right}
    </motion.button>
  );
}

/** a clip for one of the six's big moments: kept in Clips and offered at once */
export function useCraftClip(v: EnchantView) {
  const keep = useKeepMoment();
  return (o: { title: string; sub: string; emoji: string; payoff: string; color: string; kicker: string; head: string; lines: string[]; text: string }) => {
    const { text, ...rest } = o;
    offerClip(keep({ type: 'craft', e: enchantRef(v), ...rest }), text);
  };
}

/** pick a free spot on the map (within a reach), and come back to this page with it */
export function useSpotPick(v: EnchantView, slot: string) {
  const pick = usePickOnMapFor();
  const start = (o: { title: string; emoji: string; hint: string; color: string; anchors: [number, number][]; radiusM: number | null; use: string; keep?: Record<string, unknown> }) =>
    pick({ id: v.id, slot, title: o.title, emoji: o.emoji, hint: o.hint, color: o.color, allowed: [], back: `/grimoire/${v.id}`, keep: o.keep,
      free: { anchors: o.anchors, radiusM: o.radiusM, use: o.use } });
  const done = pickedFor(v.id, slot);
  return { start, done, clear: () => usePlotPick.getState().clear() };
}

export function Meter({ value, max, color, label }: { value: number; max: number; color: string; label?: string }) {
  return (
    <div className="grid gap-1">
      {label && <div className="lvx-label">{label}</div>}
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${Math.max(0, Math.min(1, value / Math.max(1, max))) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
    </div>
  );
}
