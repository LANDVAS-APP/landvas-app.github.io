// Your roll tickets, wherever they came from (the daily streak, events, or a gift from the LANDVAS team): a chip on
// the map whenever you have one, and the list to roll them from. A ticket can be "Rare or better", an exact rarity, an
// Enchanted plot with its enchantment chosen, Shiny, a minigame, free rerolls or even a Godroll.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../backend/api';
import type { RollTicket } from '../backend/types';
import { kindInfo } from '../enchant/kinds';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { buzz } from '../native/native';
import { rarityInfo } from '../shared/rarity';
import { Dialog, GameDisc } from '../ui';
import type { RollOpts } from '../simple/useQuickRoll';

export function useMyTickets() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['my-roll-tickets'], queryFn: api.myRollTickets, enabled: !!me, staleTime: 60_000, refetchOnWindowFocus: true });
}

export const ticketTitle = (t: Pick<RollTicket, 'min_rarity' | 'exact' | 'godroll' | 'enchant' | 'label'>) =>
  `${t.label ? `${t.label} · ` : ''}${t.godroll ? `${t.godroll === 'echo' ? 'Echo' : 'Pantheon'} Godroll` : t.min_rarity === 'enchanted' ? (t.enchant?.kind ? `Enchanted: ${kindInfo(t.enchant.kind).name}` : 'Enchanted plot') : t.exact ? rarityInfo(t.min_rarity).name : `${rarityInfo(t.min_rarity).name} or better`}`;
export const ticketExtras = (t: Partial<Pick<RollTicket, 'plot_type' | 'shiny' | 'rerolls' | 'enchant' | 'godroll'>>) =>
  [t.godroll ? 'every roll an ultra' : null, t.plot_type ? PLOT_TYPES[t.plot_type as keyof typeof PLOT_TYPES]?.game ?? t.plot_type : null, t.shiny ? '✨ Shiny' : null,
    t.rerolls ? `🎲 +${t.rerolls} free reroll${t.rerolls === 1 ? '' : 's'}` : null, t.enchant?.stars ? '★'.repeat(t.enchant.stars) : null, t.enchant?.level ? `Lv ${t.enchant.level}` : null].filter(Boolean).join(' · ');
const ticketIcon = (t: Pick<RollTicket, 'godroll' | 'enchant' | 'min_rarity'>) => (t.godroll ? '⚡' : t.min_rarity === 'enchanted' ? (t.enchant?.kind ? kindInfo(t.enchant.kind).emoji : '🔮') : t.min_rarity === 'legendary' ? '👑' : '🎟️');

export function TicketsDialog({ open, onOpenChange, onRoll }: { open: boolean; onOpenChange(o: boolean): void; onRoll(o: RollOpts): void }) {
  const q = useMyTickets();
  const rows = q.data ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🎟️ Your roll tickets" description="Each one rolls you a free plot nearby, with what’s on the ticket guaranteed.">
      <div className="grid gap-2" data-testid="tickets-sheet">
        {!rows.length && <p className="py-6 text-center text-sm text-muted">No tickets right now — keep your daily streak going to earn them.</p>}
        {rows.map((t) => {
          const r = rarityInfo(t.min_rarity);
          return (
            <motion.button key={t.id} whileTap={{ scale: 0.97 }} data-testid="use-ticket"
              onClick={() => { buzz('light'); onOpenChange(false); setTimeout(() => onRoll({ ticket: t.id, ticketRarity: t.min_rarity }), 200); }}
              className={cn('flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left', t.godroll && 'lv-godroll-card')} style={{ borderColor: t.godroll ? '#FFD23F' : r.color, background: `${t.godroll ? '#FFD23F' : r.color}22` }}>
              <span className="text-2xl">{ticketIcon(t)}</span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-black">{ticketTitle(t)}</span>
                <span className="text-[11px] text-white/60">{ticketExtras(t) || (t.exact ? 'A free plot of exactly this rarity' : 'A free plot, guaranteed — could even be an ultra')}</span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-black text-[#14103a]">Roll!</span>
            </motion.button>
          );
        })}
      </div>
    </Dialog>
  );
}

/** the map's tickets button: only there when you have one (and `?tickets=1` opens it, from a notification) */
export function TicketsButton({ onRoll, disc }: { onRoll(o: RollOpts): void; disc?: boolean }) {
  const q = useMyTickets();
  const [open, setOpen] = useState(false);
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    if (sp.get('tickets') !== '1') return;
    setOpen(true); void q.refetch();
    const next = new URLSearchParams(sp); next.delete('tickets'); setSp(next, { replace: true });
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = q.data?.length ?? 0;
  const special = (q.data ?? []).some((t) => t.special || t.godroll);
  return (
    <>
      {n > 0 && (disc
        ? <GameDisc tone={special ? 'gold' : 'violet'} size={44} badge={n} onClick={() => { buzz('light'); setOpen(true); }} aria-label={`${n} roll ticket${n === 1 ? '' : 's'}`} data-testid="tickets-chip"><span className="text-[20px] leading-none">🎟️</span></GameDisc>
        : <button className="pointer-events-auto lv-hud !h-9 gap-1.5 !rounded-full !px-3 text-[12px] font-extrabold" onClick={() => setOpen(true)} data-testid="tickets-chip">🎟️ {n} ticket{n === 1 ? '' : 's'}</button>)}
      <TicketsDialog open={open} onOpenChange={setOpen} onRoll={onRoll} />
    </>
  );
}
