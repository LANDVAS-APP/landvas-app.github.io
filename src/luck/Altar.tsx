// The Altar of Luck: sacrifice Base plots or offer Ink to charge your Luck (0–100). Your next claim spends it all —
// extra rolls (keep the best) and likelier ultras. The chip shows how charged you are; the altar is where you feed it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { BasePlotArt } from '../plot/BasePlotArt';
import { rarityInfo, type RarityId } from '../shared/rarity';
import { Dialog } from '../ui';

export function useLuck() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['luck'], queryFn: api.luckStatus, enabled: !!me, staleTime: 30_000 });
}

/** the luck meter as a ring */
function Ring({ luck, max, size = 34 }: { luck: number; max: number; size?: number }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r, f = Math.min(1, luck / Math.max(1, max));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#lv-luck-g)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} style={{ transition: 'stroke-dasharray .5s cubic-bezier(.2,1.4,.4,1)' }} />
      <defs><linearGradient id="lv-luck-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3DDC97" /><stop offset="1" stopColor="#FFE14D" /></linearGradient></defs>
    </svg>
  );
}

/** a compact chip: 🍀 and the meter — tap for the altar */
export function LuckChip({ className }: { className?: string }) {
  const q = useLuck();
  const [open, setOpen] = useState(false);
  if (!q.data?.enabled) return null;
  const l = q.data;
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="luck-chip"
        className={cn('pointer-events-auto relative flex items-center gap-2 rounded-full border border-white/12 bg-[#0f1a2e]/90 py-1 pl-1 pr-3 text-[12px] font-extrabold text-white', l.luck > 0 && 'shadow-[0_0_18px_rgba(61,220,151,0.45)]', className)}>
        <span className="relative grid place-items-center"><Ring luck={l.luck} max={l.max} /><span className="absolute text-[15px]">🍀</span></span>
        <span className="grid text-left leading-tight"><span>Luck {l.luck}</span><span className="text-[10px] font-semibold text-white/55">{l.luck > 0 ? `next roll: best of ${l.rolls}` : 'Sacrifice for a better roll'}</span></span>
      </button>
      <AltarDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AltarDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const q = useLuck();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [burn, setBurn] = useState<{ key: string; rarity: RarityId; gained: number } | null>(null);
  const [confirm, setConfirm] = useState<{ gx: number; gy: number; rarity: RarityId; luck: number } | null>(null);
  const l = q.data;
  const after = () => { invalidateGame(qc); for (const k of [qk.myPlots, qk.groups, ['luck'], ['collection'], ['quick-buy-quote']]) void qc.invalidateQueries({ queryKey: k }); };

  const sacrifice = async (p: { gx: number; gy: number; rarity: RarityId }) => {
    setBusy(`${p.gx}_${p.gy}`); setConfirm(null);
    try {
      const r = await api.luckSacrificePlot(p.gx, p.gy);
      buzz('heavy');
      setBurn({ key: `${p.gx}_${p.gy}_${Date.now()}`, rarity: p.rarity, gained: r.gained });
      setTimeout(() => setBurn(null), 1600);
      qc.setQueryData(['luck'], (old: typeof l) => (old ? { ...old, ...r, plots: old.plots.filter((x) => x.gx !== p.gx || x.gy !== p.gy) } : old));
      after();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const offer = async (points: number) => {
    setBusy(`ink${points}`);
    try {
      const r = await api.luckOfferInk(points);
      buzz('success');
      setBurn({ key: `ink${Date.now()}`, rarity: 'common', gained: r.gained });
      setTimeout(() => setBurn(null), 1400);
      qc.setQueryData(['luck'], (old: typeof l) => (old ? { ...old, ...r } : old));
      after();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🍀 The Altar of Luck" description="Sacrifice plots or offer Ink to charge your Luck. Your next plot roll spends all of it.">
      {l && (
        <div className="grid gap-4" data-testid="altar">
          {/* the meter */}
          <div className="relative grid justify-items-center gap-1 overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_50%_30%,rgba(61,220,151,0.25),transparent_70%)] py-4">
            <div className="relative grid place-items-center">
              <Ring luck={l.luck} max={l.max} size={120} />
              <div className="absolute grid justify-items-center leading-none"><span className="text-[34px]">🍀</span><span className="font-display text-[28px] font-black tnum" data-testid="luck-value">{l.luck}</span></div>
              <AnimatePresence>
                {burn && (
                  <motion.div key={burn.key} className="pointer-events-none absolute inset-0 grid place-items-center" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.4, delay: 0.2 }}>
                    <motion.span className="absolute font-display text-[26px] font-black text-[#3DDC97]" initial={{ y: 0, scale: 0.6 }} animate={{ y: -70, scale: 1.3 }} transition={{ duration: 1.2, ease: 'easeOut' }}>+{burn.gained}</motion.span>
                    <motion.span className="absolute h-28 w-28 rounded-full border-4" style={{ borderColor: rarityInfo(burn.rarity).color }} initial={{ scale: 0.4, opacity: 1 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.8 }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="text-center text-sm font-bold">
              {l.luck > 0 ? <>Next roll: <span className="text-[#3DDC97]">best of {l.rolls}</span> · ultras <span className="text-[#FFE14D]">×{Number(l.ultra_x).toFixed(1)}</span></> : 'No Luck yet — your next roll is a normal one.'}
            </div>
            <div className="text-[11px] text-white/50">Every 20 Luck = one extra roll (keep the best) · ultras get likelier with every point</div>
          </div>

          {/* Ink */}
          <section className="grid gap-2">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-white/60">Offer Ink · {l.ink_per_point} Ink a point · {l.ink_left_today} left today</h3>
            <div className="grid grid-cols-3 gap-2">
              {[1, 5, 10].map((n) => (
                <button key={n} disabled={!!busy || n > l.ink_left_today || l.luck + n > l.max} onClick={() => void offer(n)} data-testid={`luck-ink-${n}`}
                  className="grid rounded-2xl border border-white/12 bg-white/[0.06] px-2 py-2 text-center disabled:opacity-40">
                  <span className="text-[15px] font-black">+{n} 🍀</span><span className="text-[11px] font-semibold text-white/60">{fmt(n * l.ink_per_point)} Ink</span>
                </button>
              ))}
            </div>
          </section>

          {/* plots */}
          <section className="grid gap-2">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-white/60">Sacrifice a Base plot</h3>
            {l.plots.length ? (
              <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">
                {l.plots.map((p) => {
                  const info = rarityInfo(p.rarity);
                  return (
                    <div key={`${p.gx}_${p.gy}`} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] p-2" data-testid="luck-plot">
                      <BasePlotArt rarity={p.rarity} shiny={p.shiny} size={36} />
                      <span className="grid min-w-0 flex-1 leading-tight"><span className="truncate text-[13px] font-black" style={{ color: info.color }}>{info.emoji} {info.name}{p.shiny ? ' ✨' : ''}</span><span className="truncate text-[11px] text-white/50">{p.name ?? 'Base plot'}</span></span>
                      <button disabled={!!busy || l.luck >= l.max} onClick={() => setConfirm(p)} data-testid="luck-sacrifice"
                        className="rounded-xl bg-[linear-gradient(135deg,#FF6A1F,#FF2E63)] px-3 py-1.5 text-[12px] font-black text-white shadow-[0_3px_0_#7a1030] disabled:opacity-40">🔥 +{p.luck}</button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="rounded-2xl bg-white/[0.04] px-3 py-2 text-[12px] text-white/55">Only Base plots that stand alone can be sacrificed (not merged, not your last plot). Roll some more!</p>}
            <p className="text-[11px] text-white/45">A sacrificed plot goes back to the world for good. Rarer plots give more Luck; an ultra fills the altar.</p>
          </section>

          <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title="Sacrifice this plot?" description={confirm ? `Your ${rarityInfo(confirm.rarity).name} plot goes back to the world for +${confirm.luck} Luck. This can’t be undone.` : ''}>
            {confirm && (
              <div className="grid grid-cols-2 gap-2">
                <button className="h-11 rounded-2xl bg-white/10 font-bold" onClick={() => setConfirm(null)}>Keep it</button>
                <button className="h-11 rounded-2xl bg-[linear-gradient(135deg,#FF6A1F,#FF2E63)] font-black text-white" onClick={() => void sacrifice(confirm)} data-testid="luck-confirm">🔥 Sacrifice</button>
              </div>
            )}
          </Dialog>
        </div>
      )}
    </Dialog>
  );
}
