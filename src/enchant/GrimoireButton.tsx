// The Grimoire on the map: a glowing spellbook that floats, sheds gold motes, and pulses a badge when an enchantment
// needs you (a fox at the egg, a wish ready, a chick hatched…) or something is visiting your land.
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, lazy, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { useHudCard } from '../app/radial';
import { buzz } from '../native/native';
import { useOnboardedMe } from '../lib/queries';
import { useMyEnchantments, useVisitors } from './core';
import { kindInfo } from './kinds';
import './enchant.css';
import { GameDisc, Spinner } from '../ui';

export function GrimoireButton({ rail }: { rail?: boolean } = {}) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  if (!me) return null;
  const list = mine.data ?? [];
  const attn = list.filter((e) => e.attention).length + (visitors.data?.length ?? 0);
  const first = list.find((e) => e.attention) ?? list[0];
  if (rail) return <GrimoireDisc attn={attn} />;
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

// ---- the app: the 📖 on the map opens a card, and the whole Grimoire pops up over the map ----------------------
function GrimoireDisc({ attn }: { attn: number }) {
  const card = useHudCard((s) => s.card);
  const toggle = useHudCard((s) => s.toggle);
  return (
    <GameDisc tone="gold" size={44} glow={attn > 0 && card !== 'grim'} on={card === 'grim'} badge={attn || undefined}
      onClick={() => { buzz('light'); toggle('grim'); }} aria-expanded={card === 'grim'}
      aria-label={`Grimoire${attn ? ` — ${attn} need${attn === 1 ? 's' : ''} you` : ''}`} data-testid="grimoire-button">
      <span className="text-[20px] leading-none">📖</span>
    </GameDisc>
  );
}

export const useGrimoireSheet = create<{ open: boolean; set(o: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }));

/** your enchantments at a glance: who needs you, who's visiting, and the book itself */
export function GrimoireCard({ onClose }: { onClose(): void }) {
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  const openSheet = useGrimoireSheet((s) => s.set);
  const nav = useNavigate();
  const list = mine.data ?? [];
  const need = list.filter((e) => e.attention);
  const shown = [...need, ...list.filter((e) => !e.attention)].slice(0, 3);
  const v = visitors.data?.length ?? 0;
  return (
    <motion.div className="lv-mcard t-gold pointer-events-auto w-[min(360px,100%)]" data-testid="grimoire-card"
      initial={{ opacity: 0, scale: 0.7, y: -14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -10, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }} style={{ transformOrigin: '128px 0' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="kicker">📖 Grimoire</div>
          <div className="font-display text-[22px] font-black leading-tight">{list.length ? `${list.length} enchantment${list.length === 1 ? '' : 's'}` : 'No enchantments yet'}</div>
        </div>
        <button className="lv-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="lv-mstat"><b className="tnum">{need.length}</b><i>need you</i></div>
        <div className="lv-mstat"><b className="tnum">{v}</b><i>on your land</i></div>
      </div>
      {shown.length > 0 ? (
        <div className="mt-2.5 grid gap-1.5">
          {shown.map((e) => {
            const k = kindInfo(e.reflect_kind ?? e.kind);
            return (
              <button key={e.id} className="lv-menurow" onClick={() => { onClose(); nav(`/grimoire/${e.id}`); }}>
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-black/30 text-[17px]">{k.emoji}</span>
                <span className="min-w-0 flex-1 text-left"><b className="truncate">{e.nickname || k.name} #{e.serial}</b><i className="truncate">{e.attention ? `✨ ${e.attention}` : `Level ${e.level}`}</i></span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2.5 text-[12.5px] font-semibold text-white/65">Every plot roll has a small chance to come out Enchanted — a living enchantment in place of a rarity.</p>
      )}
      <button className="lv-cta gold mt-3 w-full" onClick={() => { onClose(); openSheet(true); }} data-testid="grimoire-open">📖 Open the Grimoire<span>bestiary, codex & more</span></button>
    </motion.div>
  );
}

const GrimoireScreen = lazy(() => import('./GrimoireScreen'));
/** the whole Grimoire, popped up over the map (no page change) */
export function GrimoireSheet() {
  const open = useGrimoireSheet((s) => s.open);
  const set = useGrimoireSheet((s) => s.set);
  const loc = useLocation();
  useEffect(() => set(false), [loc.pathname, set]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="grim" className="lv-sheet lv-book" role="dialog" aria-label="Grimoire" data-testid="grimoire-sheet"
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
          {/* a leather-bound collection book: the cover swings open, then the pages are yours */}
          <motion.div className="lv-book-cover" aria-hidden initial={{ rotateY: 0 }} animate={{ rotateY: -115, opacity: [1, 1, 0] }} transition={{ duration: 0.85, ease: [0.6, 0.05, 0.3, 1], delay: 0.15 }}>
            <span className="emblem">📖</span><span className="title">GRIMOIRE</span><span className="sub">Collected enchantments</span>
          </motion.div>
          <span className="lv-book-spine" aria-hidden />
          <span className="lv-book-corner tl" aria-hidden /><span className="lv-book-corner tr" aria-hidden /><span className="lv-book-corner bl" aria-hidden /><span className="lv-book-corner br" aria-hidden />
          <button className="lv-sheet-close" onClick={() => set(false)} aria-label="Close the Grimoire" data-testid="grimoire-close">×</button>
          <div className="lv-sheet-body lv-book-pages"><Suspense fallback={<div className="grid place-items-center py-24"><Spinner /></div>}><GrimoireScreen /></Suspense></div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
