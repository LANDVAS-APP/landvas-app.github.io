// A plot on a star, tapped: an open one to claim (its price, a Keystone or not, what to make it into), yours to run
// (its type, its name, painting the star), or someone else's to look at.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { rarityInfo } from '../shared/rarity';
import { isKeystone } from './goldberg';
import { fmtInk } from './StarPreview';
import type { StarCard, StarPlotRow } from './types';

/** each star-only plot type's own panel (they arrive as they're built) */
const KindPanel = lazy(() => import('./kinds/KindPanel'));

export type StarKind = { id: string; name: string; emoji: string; blurb: string; keystone: boolean };

export function StarPlotSheet({ card, cell, plot, meId, onClose, onClaim, onChanged }: {
  card: StarCard; cell: number; plot: StarPlotRow | null; meId: string | null; onClose(): void; onClaim(kind: string): void; onChanged(): void;
}) {
  const kinds = useQuery({ queryKey: ['star-kinds'], queryFn: api.starKinds, staleTime: 5 * 60_000 });
  const key = isKeystone(cell);
  const list = (kinds.data ?? []).filter((k) => key || !k.keystone);
  const [kind, setKind] = useState('base');
  const [busy, setBusy] = useState(false);
  const mine = !!plot?.[4];
  const info = plot ? rarityInfo(plot[1]) : null;
  const price = key ? card.keystone_price : card.price;
  const change = async (k: string) => {
    setBusy(true);
    try { await api.starSetKind(card.id, cell, k); toast.success(`It’s a ${list.find((x) => x.id === k)?.name ?? k} now`); onChanged(); }
    catch (e) { toast.error(toGameError(e).message); }
    finally { setBusy(false); }
  };
  return (
    <motion.div className="fixed inset-x-0 bottom-0 z-[55] flex justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom,0px))]" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} data-testid="star-plot-sheet">
      <div className="relative max-h-[78vh] w-full max-w-md overflow-y-auto rounded-[26px] border border-white/12 bg-[#070B1C] p-4 text-white shadow-2xl">
        <button className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/10" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        {!plot ? (
          <div className="grid gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.25em] text-[#9DE4FF]">{key ? '⬟ Keystone' : 'Open plot'} · #{cell}</div>
              <div className="font-display text-[21px] font-black">Claim it</div>
              <div className="text-[12px] text-white/60">{key ? 'One of this star’s 12 pentagon plots: it rolls Epic or better, and only a Keystone can hold a Stargate or a Starbeam Lens.' : 'It rolls Common to Mythic (no ultras among the stars), and pays rent like Earth’s — a little more.'}</div>
            </div>
            <div className="grid gap-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">Make it a</div>
              <div className="grid grid-cols-2 gap-1.5">
                {list.map((k) => (
                  <button key={k.id} className={`rounded-2xl border px-2.5 py-2 text-left text-[12px] ${kind === k.id ? 'border-[#22E3FF] bg-[#22E3FF]/12' : 'border-white/10 bg-white/5'}`} onClick={() => setKind(k.id)} data-testid={`star-kind-${k.id}`}>
                    <div className="font-black">{k.emoji} {k.name}</div>
                    <div className="line-clamp-2 text-[10.5px] text-white/55">{k.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            {price && <div className="flex items-center justify-between rounded-2xl bg-white/6 px-3 py-2 text-[12.5px]"><span>Price</span><b className="text-[#FFE28A]">{fmtInk(price.ink)} Ink</b></div>}
            <button className="lv-btn on h-12 text-[15px]" disabled={busy} onClick={() => { setBusy(true); onClaim(kind); }} data-testid="star-claim">✨ Claim this plot</button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: info?.color }}>{plot[8] ? '⬟ Keystone · ' : ''}{info?.name}{plot[2] ? ' · ✨ Shiny' : ''}</div>
              <div className="font-display text-[21px] font-black">{plot[7] ?? (mine ? 'Your plot' : `@${plot[5] ?? 'someone'}’s plot`)}</div>
              <div className="text-[12px] text-white/60">{list.find((k) => k.id === plot[3])?.emoji} {list.find((k) => k.id === plot[3])?.name ?? plot[3]} · plot #{cell}</div>
            </div>
            {mine && plot[3] !== 'base' && plot[3] !== 'art' && (
              <Suspense fallback={<div className="text-sm text-white/50">…</div>}><KindPanel card={card} cell={cell} kind={plot[3]} meId={meId} /></Suspense>
            )}
            {mine && (
              <div className="grid gap-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">Make it a</div>
                <div className="flex flex-wrap gap-1.5">
                  {list.filter((k) => k.id !== plot[3]).map((k) => <button key={k.id} disabled={busy} className="rounded-full bg-white/8 px-2.5 py-1 text-[11.5px] font-bold" onClick={() => void change(k.id)} data-testid={`star-make-${k.id}`}>{k.emoji} {k.name}</button>)}
                </div>
                <NamePlot card={card} cell={cell} name={plot[7]} onDone={onChanged} />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function NamePlot({ card, cell, name, onDone }: { card: StarCard; cell: number; name: string | null; onDone(): void }) {
  const [v, setV] = useState(name ?? '');
  return (
    <div className="mt-1 flex gap-1.5">
      <input className="h-9 min-w-0 flex-1 rounded-xl bg-black/40 px-3 text-[13px] outline-none" maxLength={32} value={v} onChange={(e) => setV(e.target.value)} placeholder="Name this plot" />
      <button className="lv-btn h-9 px-3 text-[12px]" onClick={() => void api.starNamePlot(card.id, cell, v).then(onDone).catch((e) => toast.error(toGameError(e).message))}>Save</button>
    </div>
  );
}
