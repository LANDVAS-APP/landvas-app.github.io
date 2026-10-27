// Live USD rent: a per-frame ticking balance, the current rate, and the 20x boost.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { MyState } from '../backend/types';
import { qk, useOnboardedMe, useWorld } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { boostRemaining, currentRate, formatDuration, formatRate, formatUsd, liveRent, serverOffset, type RentState } from '../shared/rent';
import { RARITY_ORDER, rarityInfo, setRarities } from '../shared/rarity';
import { Button, Dialog, Spinner } from '../ui';
import { useTicker } from '../play/common';
import { RarityBadge } from '../plot/RarityBadge';

/** Keep the rarity table in sync with the server config. */
export function useRaritySync() {
  const world = useWorld();
  useEffect(() => setRarities(world.data?.rarities), [world.data?.rarities]);
}

export function useRent(): { rent: RentState | null; offset: number; update(r: RentState): void } {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const rent = me?.rent ?? null;
  const offset = useMemo(() => (rent ? serverOffset(rent.server_time) : 0), [rent]);
  const update = (r: RentState) => qc.setQueryData<MyState>(qk.me, (old) => (old && old.onboarded ? { ...old, rent: r } : old));
  return { rent, offset, update };
}

export function LiveUsd({ rent, offset, decimals = 10, className }: { rent: RentState; offset: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (ref.current) ref.current.textContent = formatUsd(liveRent(rent, Date.now() + offset), decimals);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [rent, offset, decimals]);
  return <span ref={ref} className={cn('tnum', className)} data-testid="usd-live">{formatUsd(liveRent(rent, Date.now() + offset), decimals)}</span>;
}

export async function boost(update: (r: RentState) => void) {
  try {
    const r = await api.activateBoost();
    update(r);
    toast.success(`${r.boost.multiplier}× rent boost on`, { description: `${formatDuration(r.boost.remaining_seconds)} of boosted earnings banked · ${r.boost.left_today} free boosts left today` });
    return r;
  } catch (e) {
    toast.error(toGameError(e).message);
    return null;
  }
}

export function BoostButton({ compact }: { compact?: boolean }) {
  const { rent, offset, update } = useRent();
  const [busy, setBusy] = useState(false);
  useTicker(500);
  if (!rent) return null;
  const now = Date.now() + offset;
  const remaining = boostRemaining(rent, now);
  const active = remaining > 0;
  const capped = remaining >= Number(rent.boost.max_stack_hours) * 3600 - 60;
  const none = rent.boost.left_today <= 0;
  return (
    <button
      disabled={busy || capped || none}
      onClick={async () => { setBusy(true); await boost(update); setBusy(false); }}
      data-testid="boost"
      title={none ? `No free boosts left — they reset ${new Date(rent.boost.resets_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `+${rent.boost.minutes_per_boost} min of ${rent.boost.multiplier}× rent`}
      className={cn('relative flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-2xl px-3 text-[12.5px] font-extrabold uppercase tracking-wide text-white transition active:scale-95 disabled:cursor-not-allowed',
        active ? 'shadow-[0_0_24px_-2px_#FFB31F]' : 'shadow-[0_10px_30px_-12px_#FF3D9A]', (none || capped) && !active && 'opacity-60')}
      style={{ background: active ? 'linear-gradient(90deg,#FF6A00,#FFB31F,#FF3D9A,#FF6A00)' : 'linear-gradient(135deg,#FF3D9A,#A45CFF)', backgroundSize: active ? '300% 100%' : undefined, animation: active ? 'lv-shimmer 2.5s linear infinite' : undefined }}
    >
      {busy ? <Spinner className="h-4 w-4 text-white" /> : <Zap className={cn('h-4 w-4', active && 'fill-white')} />}
      {active ? (
        <span className="tnum">{rent.boost.multiplier}× · {formatDuration(remaining)}</span>
      ) : (
        <span>{compact ? `${rent.boost.multiplier}×` : `${rent.boost.multiplier}× Boost`}</span>
      )}
      {!compact && !active && <span className="rounded-md bg-black/25 px-1 text-[10px] tnum">{rent.boost.left_today}</span>}
    </button>
  );
}

/** Top-of-map pill: live USD balance; tap for the wallet. */
export function RentHud() {
  const { rent, offset } = useRent();
  const [open, setOpen] = useState(false);
  useTicker(1000);
  if (!rent || !rent.enabled) return null;
  const rate = currentRate(rent, Date.now() + offset);
  const boosted = rate > Number(rent.rate_usd_per_second);
  return (
    <>
      <button onClick={() => setOpen(true)} className="glass pointer-events-auto flex h-10 min-w-0 items-center gap-2 rounded-2xl px-3 text-left" aria-label="Your USD rent" data-testid="rent-hud">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3DDC97]/20 text-[13px] font-black text-[#3DDC97]">$</span>
        <span className="min-w-0">
          <LiveUsd rent={rent} offset={offset} className="block font-display text-[13.5px] font-semibold leading-tight" />
          <span className={cn('block text-[10.5px] font-semibold leading-tight tnum', boosted ? 'text-gold' : 'text-muted')}>{formatRate(rate)}{boosted ? ` · ${rent.boost.multiplier}×` : ''}</span>
        </span>
      </button>
      <WalletDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function WalletDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const { rent, offset } = useRent();
  const world = useWorld();
  const cash = useQuery({ queryKey: ['cashout'], queryFn: api.cashoutStatus, enabled: open });
  const ledger = useQuery({ queryKey: ['rent-ledger'], queryFn: () => api.myRentLedger(20), enabled: open });
  useTicker(1000);
  if (!rent) return null;
  const base = Number(rent.rate_usd_per_second);
  const day = base * 86400;
  const rarities = world.data?.rarities ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Your USD rent" description="Every plot you own earns rent each second at its rarity's rate. Boosts multiply all of it.">
      <div className="grid gap-4">
        <div className="rounded-2xl border border-line bg-surface/60 p-4 text-center">
          <div className="eyebrow">Balance</div>
          <LiveUsd rent={rent} offset={offset} decimals={11} className="block font-display text-3xl font-semibold text-[#3DDC97]" />
          <div className="mt-1 text-xs text-muted tnum">
            {formatRate(currentRate(rent, Date.now() + offset))} now · base {formatRate(base)} · ≈ ${(day).toFixed(6)}/day unboosted
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 p-3">
          <div className="text-sm">
            <div className="font-bold">{rent.boost.multiplier}× boost</div>
            <div className="text-xs text-muted">Each press adds {rent.boost.minutes_per_boost} min (stacks to {rent.boost.max_stack_hours} h). {rent.boost.left_today}/{rent.boost.free_per_day} free presses left today.</div>
          </div>
          <BoostButton compact />
        </div>
        <div>
          <div className="eyebrow mb-2">Your plots by rarity</div>
          <div className="grid gap-1.5">
            {RARITY_ORDER.map((id) => {
              const r = rarities.find((x) => x.id === id) ?? rarityInfo(id);
              const n = rent.by_rarity?.[id] ?? 0;
              return (
                <div key={id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2"><RarityBadge r={id} small /> <span className="text-muted">×{n}</span></span>
                  <span className="tnum text-muted">{formatRate(Number(r.usd_per_second))} each</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface/40 p-3 text-sm">
          <div className="font-bold">Cash-out</div>
          {cash.isLoading ? <Spinner /> : (
            <p className="text-muted">{cash.data?.message ?? 'Cash-out isn\'t available yet.'}{cash.data?.enabled ? ` Minimum $${Number(cash.data.minimum_usd).toFixed(2)}.` : ''}</p>
          )}
        </div>
        {!!ledger.data?.length && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer font-semibold text-fg">Rent history</summary>
            <div className="mt-2 grid gap-1">
              {ledger.data.map((l: any) => (
                <div key={l.id} className="flex justify-between tnum">
                  <span>{new Date(l.created_at).toLocaleString()} · {l.kind}{Number(l.boosted_seconds) > 0 ? ` (${fmt(l.boosted_seconds)}s boosted)` : ''}</span>
                  <span>{Number(l.amount_usd) >= 0 ? '+' : ''}{Number(l.amount_usd).toFixed(12)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
        <p className="text-[11px] leading-relaxed text-faint">
          Rates are set by LANDVAS and can change; they're not a promise of future earnings, and owning plots is not an investment. Plots can only be bought with Ink, which is earned by winning minigames — never with money.
          Rent keeps accruing while you visit at least once every {rent.max_offline_days} days.
        </p>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
      </div>
    </Dialog>
  );
}
