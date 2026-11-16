// Primordials can only be rolled now. Anyone whose Primordial came from fusing three ultras gets them back — and picks
// which three: the plot becomes the first, the next two plots they claim roll the other two. This card opens by itself
// (once per session) while a refund is waiting, and from the Fusion Lab.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type PrimordialRefund as Refund, type RefundChoice } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useSession } from '../app/App';
import { invalidateGame } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { formatRate } from '../shared/rent';
import { rarityInfo, type RarityId } from '../shared/rarity';
import { BasePlotArt } from '../plot/BasePlotArt';
import { confettiCannons } from '../ui/confetti';
import { buzz } from '../native/native';
import './rarity.css';

export const refundKey = ['primordial-refunds'] as const;
let shownThisSession = false;

export function useRefunds(enabled = true) {
  const session = useSession();
  return useQuery({ queryKey: refundKey, queryFn: api.primordialRefundStatus, enabled: enabled && !!session, staleTime: 5 * 60_000, retry: false });
}

/** mounted once in the app: opens the picker by itself when a refund is waiting */
export function PrimordialRefundGlobal() {
  const q = useRefunds();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const has = (q.data?.open.length ?? 0) > 0;
  const quiet = /^\/(welcome|onboarding|play\/|arcade\/|create\/)/.test(loc.pathname) || loc.pathname.startsWith('/fusion');
  // open by itself once a session — after any other pop-up (a welcome, an explorer tip) has been dealt with
  useEffect(() => {
    if (!has || shownThisSession || quiet) return;
    const t = setInterval(() => {
      if (document.querySelector('[role=dialog][data-state=open], [role=alertdialog][data-state=open]')) return;
      clearInterval(t); shownThisSession = true; setOpen(true);
    }, 1200);
    return () => clearInterval(t);
  }, [has, quiet]);
  // keep what was opened while it's open (the list empties the moment the picks are in, and "done" still shows)
  const [held, setHeld] = useState<{ refund: Refund; choices: RefundChoice[] } | null>(null);
  useEffect(() => { if (open && q.data?.open[0] && !held) setHeld({ refund: q.data.open[0], choices: q.data.choices }); }, [open, q.data, held]);
  if (!held) return null;
  return <RefundPicker refund={held.refund} choices={held.choices} open={open} onClose={() => { setOpen(false); setHeld(null); }} />;
}

/** pick three ultras for one refund */
export function RefundPicker({ refund, choices, open, onClose }: { refund: Refund; choices: RefundChoice[]; open: boolean; onClose(): void }) {
  const qc = useQueryClient();
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const prim = rarityInfo(refund.primordial);
  const add = (id: string) => { buzz('light'); setPicks((p) => (p.length < 3 ? [...p, id] : p)); };
  const remove = (i: number) => setPicks((p) => p.filter((_, j) => j !== i));
  const go = async () => {
    setBusy(true);
    try {
      await api.primordialRefundChoose(refund.id, picks);
      buzz('success'); confettiCannons(); setDone(picks);
      void qc.invalidateQueries({ queryKey: refundKey }); void qc.invalidateQueries({ queryKey: ['fusion-book'] }); invalidateGame(qc);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[140] grid place-items-center bg-black/80 p-3" style={{ pointerEvents: 'auto' }} role="dialog" aria-modal="true" aria-label="Pick your three ultras"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="refund-picker">
          <motion.div className="lvrx-refund flex max-h-[92dvh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-[28px] p-4 text-white" initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}>
            {done ? (
              <div className="grid justify-items-center gap-3 py-4 text-center" data-testid="refund-done">
                <div className="text-[11px] font-black uppercase tracking-[0.25em] text-white/60">Your ultras are back</div>
                <div className="flex gap-2">{done.map((id, i) => <div key={i} className="grid justify-items-center gap-1"><BasePlotArt rarity={id as RarityId} size={72} /><b className="text-xs" style={{ color: rarityInfo(id).glow }}>{rarityInfo(id).name}</b></div>)}</div>
                <p className="max-w-sm text-sm text-white/75">Your plot is a <b>{rarityInfo(done[0]).name}</b> now. The next two plots you claim roll <b>{rarityInfo(done[1]).name}</b> and <b>{rarityInfo(done[2]).name}</b>.</p>
                <button className="lv-gbtn px-6 py-2.5" onClick={onClose} data-testid="refund-close">Brilliant</button>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-start gap-3">
                  <BasePlotArt rarity={refund.primordial as RarityId} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#FDE68A]">Primordials are rolled, never fused</div>
                    <h2 className="font-display text-xl font-black leading-tight">Your three ultras come back — pick them</h2>
                    <p className="mt-1 text-[12px] leading-snug text-white/70">Your {prim.emoji} {prim.name} was fused from {refund.fused_from.map((r) => rarityInfo(r).name).join(', ')}. For being part of it, choose <b>any three ultras</b>: your plot{refund.name ? ` “${refund.name}”` : ''} becomes the first, and your next two claims roll the other two.</p>
                  </div>
                  <button className="rounded-lg p-1 text-white/50 hover:text-white" onClick={onClose} aria-label="Later" data-testid="refund-later">✕</button>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-2" data-testid="refund-slots">
                  {[0, 1, 2].map((i) => {
                    const id = picks[i];
                    return (
                      <button key={i} type="button" onClick={() => id && remove(i)} className={cn('lvrx-slot grid h-[78px] justify-items-center content-center gap-1 rounded-2xl text-center', id && 'on')} style={id ? { ['--c' as string]: rarityInfo(id).color } : undefined} data-testid={`refund-slot-${i}`}>
                        {id ? <><BasePlotArt rarity={id as RarityId} size={38} /><b className="text-[11px]" style={{ color: rarityInfo(id).glow }}>{rarityInfo(id).name}</b></> : <span className="text-[11px] font-bold text-white/45">{i === 0 ? 'Your plot' : `Claim #${i}`}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="-mx-1 grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto overscroll-contain px-1 pb-1 sm:grid-cols-3" data-testid="refund-choices">
                  {choices.map((c) => (
                    <button key={c.id} type="button" disabled={picks.length >= 3} onClick={() => add(c.id)} className="lvrx-choice grid justify-items-center gap-0.5 rounded-2xl p-2.5 text-center disabled:opacity-50" style={{ ['--c' as string]: c.color }} data-testid={`refund-choice-${c.id}`}>
                      <BasePlotArt rarity={c.id as RarityId} size={40} />
                      <b className="text-[12px]" style={{ color: c.glow }}>{c.emoji} {c.name}</b>
                      <span className="text-[10px] text-white/55">{formatRate(Number(c.usd_per_second))} · ×{Number(c.ink_mult).toFixed(1)} Ink</span>
                      {picks.filter((p) => p === c.id).length > 0 && <span className="text-[10px] font-black text-[#3DDC97]">picked ×{picks.filter((p) => p === c.id).length}</span>}
                    </button>
                  ))}
                </div>
                <button className="lv-gbtn shrink-0 py-3 text-base disabled:opacity-50" disabled={picks.length < 3 || busy} onClick={go} data-testid="refund-confirm">
                  {busy ? 'Bringing them back…' : picks.length < 3 ? `Pick ${3 - picks.length} more` : 'Bring my ultras back'}
                </button>
                <p className="shrink-0 text-center text-[11px] text-white/45">Picked the same one twice? That’s fine — tap a slot to change it. {fmt(choices.length)} ultras to choose from.</p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
