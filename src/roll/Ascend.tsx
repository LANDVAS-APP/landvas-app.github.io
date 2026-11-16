// ⬆️ Ascend: pay Ink to reroll a plot you just claimed. The rarity can only go up (what you have is locked in as the
// floor), every try costs more than the last, and every try nudges the odds of a higher tier up a little.
// Server: public.ascend_quote / public.ascend_roll (supabase/migrations/20261119000232_ascend_roll_settings.sql).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { AscendQuote, AscendResult } from '../backend/types';
import { invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { RarityBadge } from '../plot/RarityBadge';
import { rarityInfo } from '../shared/rarity';
import { Dialog, ResourceIcon } from '../ui';
import { endsIn } from '../daily/HotZone';

export const useAscend = create<{ at: { gx: number; gy: number } | null; open(gx: number, gy: number): void; close(): void }>((set) => ({
  at: null,
  open: (gx, gy) => set({ at: { gx, gy } }),
  close: () => set({ at: null }),
}));

const quoteKey = (gx: number, gy: number) => ['ascend', gx, gy];
export function useAscendQuote(gx: number | null, gy: number | null, enabled = true) {
  const me = useOnboardedMe();
  return useQuery({ queryKey: quoteKey(gx ?? 0, gy ?? 0), queryFn: () => api.ascendQuote(gx!, gy!), enabled: !!me && enabled && gx != null && gy != null, staleTime: 15_000, retry: false });
}

/** the offer under a fresh roll (and on your plot): shows only when this plot can Ascend */
export function AscendOffer({ gx, gy, onOpen, className }: { gx: number; gy: number; onOpen?(): void; className?: string }) {
  const q = useAscendQuote(gx, gy);
  const me = useOnboardedMe();
  if (!q.data?.ok) return null;
  const a = q.data;
  const can = Number(me?.balances.ink ?? 0) >= a.cost;
  return (
    <button className={cn('lv-ascend-offer flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left', className)} data-testid="ascend-offer"
      onClick={() => { buzz('light'); onOpen ? onOpen() : useAscend.getState().open(gx, gy); }}>
      <span className="text-[22px] leading-none">⬆️</span>
      <span className="min-w-0 flex-1 leading-tight">
        <b className="block text-[14px] font-black text-white">Ascend this plot</b>
        <span className="text-[11px] font-semibold text-white/70">{Math.round(a.chance_up)}% to go higher · it can only go up{a.tries ? ` · try ${a.tries + 1}` : ''}</span>
      </span>
      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-black tnum', can ? 'bg-white text-[#2a1650]' : 'bg-white/15 text-white/70')}><ResourceIcon r="ink" className="h-3.5 w-3.5" />{fmt(a.cost)}</span>
    </button>
  );
}

/** the Ascend sheet: what you'd get, what it costs, and the button. Mounted once (in the shell). */
export function AscendHost() {
  const at = useAscend((s) => s.at);
  const close = useAscend((s) => s.close);
  if (!at) return null;
  return <AscendSheet key={`${at.gx}_${at.gy}`} gx={at.gx} gy={at.gy} onClose={close} />;
}

function AscendSheet({ gx, gy, onClose }: { gx: number; gy: number; onClose(): void }) {
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const q = useAscendQuote(gx, gy);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<AscendResult | null>(null);
  const a: AscendQuote | undefined = last?.quote ?? q.data;
  const ink = Number(me?.balances.ink ?? 0);
  const go = async () => {
    if (!a?.ok || busy) return;
    setBusy(true); buzz('medium');
    try {
      const r = await api.ascendRoll(gx, gy);
      setLast(r);
      qc.setQueryData(quoteKey(gx, gy), r.quote);
      if (r.up) buzz('success');
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: qk.myPlots });
      void qc.invalidateQueries({ queryKey: qk.plot(gx, gy) });
    } catch (e) { toast.error(toGameError(e).message); void q.refetch(); }
    finally { setBusy(false); }
  };
  const rarity = last?.to ?? a?.rarity;
  const why = a && !a.ok ? WHY[a.why ?? 'locked'] : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="⬆️ Ascend" description="Reroll this plot’s rarity for Ink. It can only go up — what you have now is locked in as the floor.">
      {!a ? <div className="py-8 text-center text-sm text-muted">Checking this plot…</div> : (
        <div className="grid gap-3" data-testid="ascend-sheet">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[.05] p-3">
            <div className="grid gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">This plot</span>
              <AnimatePresence mode="popLayout">
                <motion.span key={rarity} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 460, damping: 20 }}>
                  <RarityBadge r={rarity!} />
                </motion.span>
              </AnimatePresence>
              {a.from && a.from !== rarity && <span className="text-[11px] text-muted">Started as {rarityInfo(a.from).name}</span>}
            </div>
            <div className="text-right text-[11px] text-muted">
              <div>{a.ok ? <>Try <b className="tnum text-fg">{a.tries + 1}</b> of {a.max_tries}</> : <><b className="tnum text-fg">{a.tries}</b> {a.tries === 1 ? 'try' : 'tries'} used</>}</div>
              {a.ends_at && <div>{endsIn(a.ends_at)} left to Ascend</div>}
              {a.spent > 0 && <div>Spent so far: <span className="tnum">{fmt(a.spent)}</span> Ink</div>}
            </div>
          </div>
          {last && (
            <motion.div key={`${last.try}`} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className={cn('rounded-2xl px-3 py-2.5 text-center text-sm font-black', last.up ? 'lv-ascend-up text-[#2a1600]' : 'bg-white/[.06] text-white/80')} data-testid="ascend-result">
              {last.up ? `⬆️ Up to ${rarityInfo(last.to).name}!` : `Stayed ${rarityInfo(last.to).name} — the next try is a little likelier to go up.`}
            </motion.div>
          )}
          {a.ok ? (
            <>
              <div className="grid gap-1.5" data-testid="ascend-odds">
                <div className="flex items-center justify-between text-xs"><span className="font-bold">Chance to go higher</span><b className="tnum text-ok">{a.chance_up.toFixed(a.chance_up < 10 ? 1 : 0)}%</b></div>
                <div className="grid gap-1">
                  {a.odds.filter((o) => o.pct > 0).map((o) => (
                    <div key={o.rarity} className="flex items-center gap-2 text-[11px]">
                      <span className="w-24 shrink-0 truncate font-bold" style={{ color: rarityInfo(o.rarity).color }}>{rarityInfo(o.rarity).name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, o.pct))}%`, background: rarityInfo(o.rarity).color }} /></span>
                      <span className="w-12 text-right tnum text-muted">{o.pct < 1 ? o.pct.toFixed(2) : o.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                  {a.ultra_pct > 0 && <div className="text-[11px] text-muted">🌌 Any ultra: {a.ultra_pct.toFixed(3)}%</div>}
                </div>
                <p className="text-[11px] text-faint">Otherwise it stays {rarityInfo(a.rarity).name}. Goes up to {rarityInfo(a.cap).name} at most.</p>
              </div>
              <button disabled={busy || ink < a.cost} onClick={() => void go()} data-testid="ascend-go"
                className="lv-ascend-go flex h-[54px] items-center justify-center gap-2 rounded-2xl font-display text-[17px] font-black text-white disabled:opacity-50">
                {busy ? 'Rolling…' : <>⬆️ Ascend for <ResourceIcon r="ink" className="h-4 w-4" /><span className="tnum">{fmt(a.cost)}</span></>}
              </button>
              {ink < a.cost && <p className="text-center text-[11px] text-warn">You have {fmt(ink)} Ink — win minigames for more.</p>}
            </>
          ) : <p className="rounded-2xl bg-white/[.05] px-3 py-3 text-center text-sm text-muted" data-testid="ascend-done">{why}</p>}
          <button className="justify-self-center text-xs font-bold text-muted hover:text-fg" onClick={onClose}>Done</button>
        </div>
      )}
    </Dialog>
  );
}
const WHY: Record<string, string> = {
  disabled: 'Ascend is switched off right now.',
  not_on_ladder: 'This rarity is special — it can’t Ascend.',
  top: 'This plot is as high as Ascend goes. 🎉',
  too_old: 'Ascend only works on plots you claimed recently.',
  max_tries: 'This plot has used all its Ascend tries.',
  locked: 'This plot can’t Ascend any more.',
  not_owned: 'You can only Ascend your own plots.',
};
