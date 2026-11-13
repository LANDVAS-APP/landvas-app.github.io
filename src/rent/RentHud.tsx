// Live USD rent: a per-frame ticking balance, the current rate, and the 20x boost.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useHudCard } from '../app/radial';
import { buzz } from '../native/native';
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

/** Where the leading zeros of "$0.0000012345" end, so they can be dimmed and the ticking digits stand out. */
function splitUsd(t: string): [string, string] {
  const i = t.slice(1).search(/[1-9]/);
  return i < 0 ? [t, ''] : [t.slice(0, i + 1), t.slice(i + 1)];
}

/**
 * A live, ticking USD balance. React renders the element once and never its text: the numbers are written straight
 * into two text nodes (dim zeros + bright digits), so a parent re-rendering can't reset them and make them blink.
 */
export function LiveUsd({ rent, offset, decimals = 10, className, dim, style, ...rest }: { rent: RentState; offset: number; decimals?: number; className?: string; dim?: boolean; style?: React.CSSProperties } & Record<`data-${string}`, unknown>) {
  const ref = useRef<HTMLSpanElement>(null);
  const latest = useRef({ rent, offset, decimals, dim });
  latest.current = { rent, offset, decimals, dim };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = '';
    const zeros = document.createElement('span');
    const digits = document.createTextNode('');
    el.append(zeros, digits);
    let last = '';
    // ~12 updates a second still reads as a live counter without re-laying-out the screen every frame
    const tick = () => {
      if (document.hidden) return;
      const L = latest.current;
      const t = formatUsd(liveRent(L.rent, Date.now() + L.offset), L.decimals);
      if (t === last) return;
      last = t;
      const [z, d] = L.dim ? splitUsd(t) : ['', t];
      if (zeros.textContent !== z) zeros.textContent = z;
      zeros.style.opacity = z ? '0.42' : '';
      digits.nodeValue = d;
    };
    tick();
    const iv = setInterval(tick, 85);
    const vis = () => { last = ''; tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); el.textContent = ''; };
  }, []);
  // (no children on purpose — see above)
  return <span ref={ref} className={cn('tnum inline-block', className)} style={{ contain: 'layout paint', ...style }} data-testid="usd-live" aria-live="off" {...rest} />;
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

/** every second of a boost: "1h 04m 09s" */
function fullLeft(sec: number) {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(x).padStart(2, '0')}s` : `${m}m ${String(x).padStart(2, '0')}s`;
}

export function BoostButton({ compact, hud }: { compact?: boolean; hud?: boolean }) {
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
      className={cn('relative flex shrink-0 items-center gap-1.5 overflow-hidden text-[12.5px] font-extrabold uppercase tracking-wide text-white transition active:scale-95 disabled:cursor-not-allowed',
        hud ? 'lv-hud-boost h-9 rounded-full pl-2.5 pr-3' : 'h-10 rounded-2xl px-3',
        active ? 'shadow-[0_0_24px_-2px_#FFB31F]' : 'shadow-[0_10px_30px_-12px_#FF3D9A]', (none || capped) && !active && 'opacity-60')}
      style={{ background: active ? 'linear-gradient(90deg,#FF6A00,#FFB31F,#FF3D9A,#FF6A00)' : 'linear-gradient(135deg,#FF3D9A,#A45CFF)', backgroundSize: active ? '300% 100%' : undefined, animation: active ? 'lv-shimmer 2.5s linear infinite' : undefined }}
      data-shimmer={active ? '1' : undefined}
    >
      {busy ? <Spinner className="h-4 w-4 text-white" /> : <Zap className={cn('h-4 w-4', active && 'fill-white')} />}
      {active ? (
        <span className="tnum">{rent.boost.multiplier}× · {hud ? fullLeft(remaining) : formatDuration(remaining)}</span>
      ) : (
        <span>{compact ? `${rent.boost.multiplier}×` : `${rent.boost.multiplier}× Boost`}</span>
      )}
      {!compact && !active && <span className="rounded-md bg-black/25 px-1 text-[10px] tnum">{rent.boost.left_today}</span>}
    </button>
  );
}

/** the app's HUD: a compact "20×" chip beside your earnings; tap it for the boost card */
export function BoostChip() {
  const { rent, offset } = useRent();
  const card = useHudCard((x) => x.card);
  const toggle = useHudCard((x) => x.toggle);
  useTicker(1000);
  if (!rent) return null;
  const active = boostRemaining(rent, Date.now() + offset) > 0;
  const left = rent.boost.left_today;
  return (
    <button className={cn('lv-boostchip', active && 'live', card === 'boost' && 'open')} onClick={() => { buzz('light'); toggle('boost'); }}
      aria-label={active ? `${rent.boost.multiplier}× boost on — see how much it earns` : `${rent.boost.multiplier}× boost — ${left} left today`} aria-expanded={card === 'boost'} data-testid="boost-chip">
      <Zap className={cn('h-[13px] w-[13px] shrink-0', (active || left > 0) && 'fill-white')} />
      <span className="tnum">{rent.boost.multiplier}×</span>
      {!active && left > 0 && <i aria-hidden />}
    </button>
  );
}

/** the boost card: what's on, what it will still earn, what one more boost adds — and the button to boost again */
export function BoostCard({ onClose }: { onClose(): void }) {
  const { rent, offset, update } = useRent();
  const [busy, setBusy] = useState(false);
  useTicker(250);
  if (!rent) return null;
  const now = Date.now() + offset;
  const remaining = boostRemaining(rent, now);
  const active = remaining > 0;
  const mult = Number(rent.boost.multiplier) || 1;
  const base = Number(rent.rate_usd_per_second) || 0;
  const per = Number(rent.boost.minutes_per_boost) * 60;
  const capS = Number(rent.boost.max_stack_hours) * 3600;
  const capped = remaining >= capS - 60;
  const none = rent.boost.left_today <= 0;
  const willEarn = base * mult * remaining;        // everything your plots make in the time left
  const extra = base * (mult - 1) * remaining;      // of which the boost adds
  const oneMore = base * (mult - 1) * Math.min(per, Math.max(0, capS - remaining));
  const resets = new Date(rent.boost.resets_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const usd = (v: number) => formatUsd(v, v >= 0.01 ? 4 : v >= 0.0001 ? 6 : v >= 0.000001 ? 8 : 10);
  return (
    <motion.div className="lv-mcard t-rose lv-boostcard pointer-events-auto w-[min(380px,100%)]" data-testid="boost-card"
      initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.12 } }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
      <div className="flex items-center gap-3">
        <div className={cn('lv-boostorb', active && 'live')}><Zap className="h-7 w-7 fill-white" /><b className="tnum">{mult}×</b></div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[19px] font-black leading-tight">{active ? `${mult}× rent is on` : `${mult}× rent boost`}</div>
          <div className="text-[12px] font-semibold text-white/60">{active ? 'Every plot you own earns ' + mult + '× until it runs out.' : `Each boost adds ${rent.boost.minutes_per_boost} min of ${mult}× rent to all your plots.`}</div>
        </div>
        <button className="lv-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      {active ? (
        <div className="mt-3 grid gap-2">
          <div className="lv-boosttime"><Clock3 className="h-4 w-4" /><span className="tnum" data-testid="boost-left">{fullLeft(remaining)}</span><small>left</small></div>
          <div className="lv-boostbar"><span style={{ width: `${Math.min(100, (remaining / capS) * 100)}%` }} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="lv-sheetstat rounded-2xl p-2.5"><div className="text-[10px] font-bold uppercase text-white/50">You'll earn</div><div className="tnum font-display text-[16px] font-black text-[#5ff0b0]" data-testid="boost-will-earn">{usd(willEarn)}</div><div className="text-[10.5px] font-semibold text-white/45">in the time left</div></div>
            <div className="lv-sheetstat rounded-2xl p-2.5"><div className="text-[10px] font-bold uppercase text-white/50">From the boost</div><div className="tnum font-display text-[16px] font-black text-[#ffd27a]">+{usd(extra)}</div><div className="text-[10.5px] font-semibold text-white/45">extra on top</div></div>
          </div>
          <div className="text-center text-[11.5px] font-semibold text-white/50 tnum">Earning {formatRate(base * mult)} now · {formatRate(base)} without it</div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="lv-sheetstat rounded-2xl p-2.5"><div className="text-[10px] font-bold uppercase text-white/50">Earning now</div><div className="tnum font-display text-[15px] font-black">{formatRate(base)}</div></div>
          <div className="lv-sheetstat rounded-2xl p-2.5"><div className="text-[10px] font-bold uppercase text-white/50">Boosted</div><div className="tnum font-display text-[15px] font-black text-[#5ff0b0]">{formatRate(base * mult)}</div></div>
        </div>
      )}
      <button className="lv-btn lv-rainbow mt-3 h-13 w-full flex-col !gap-0 py-2 text-[16px]" disabled={busy || capped || none} data-testid="boost"
        onClick={async () => { setBusy(true); buzz('medium'); await boost(update); setBusy(false); }}>
        {busy ? <Spinner className="h-5 w-5 text-white" /> : <>
          <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 fill-white" />{none ? 'No boosts left today' : capped ? 'Boost is full' : active ? 'Boost again' : 'Boost now'}</span>
          <small className="text-[11px] font-bold opacity-85 tnum">{none ? `More at ${resets}` : capped ? `Stacks up to ${rent.boost.max_stack_hours}h` : `+${rent.boost.minutes_per_boost} min · +${usd(oneMore)} · ${rent.boost.left_today} left today`}</small>
        </>}
      </button>
    </motion.div>
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
          <LiveUsd rent={rent} offset={offset} dim className="block font-display text-[13.5px] font-semibold leading-tight" />
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
        {(rent.landlord?.plots ?? 0) > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#6FA3D9]/40 bg-[#3E6E9C]/15 p-3 text-sm" data-testid="wallet-landlord">
            <span className="text-2xl">🏘️</span>
            <div>
              <div className="font-bold">{rent.landlord!.active ? `Rent day! ${rent.landlord!.multiplier}× on your Landlord plots` : `Landlord plots: ${rent.landlord!.multiplier}× on the 1st`}</div>
              <div className="text-xs text-muted">{rent.landlord!.plots} plot{rent.landlord!.plots === 1 ? '' : 's'} · {formatRate(Number(rent.landlord!.rate))} normally{rent.landlord!.active ? ` · ${formatRate(Number(rent.landlord!.rate) * rent.landlord!.multiplier)} today` : ` · next rent day ${new Date(rent.landlord!.next).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</div>
            </div>
          </div>
        )}
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
        <ConvertToInk />
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
          Rates are set by LANDVAS and can change; they're not a promise of future earnings, and owning plots is not an investment. Plots can only be bought with Ink, which you earn by playing — winning minigames, inviting friends or converting your rent — never with money.
          Rent keeps accruing while you visit at least once every {rent.max_offline_days} days.
        </p>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
      </div>
    </Dialog>
  );
}

/** Turn USD rent into Ink at the configured rate ($1 = 100 Ink by default). No minimum beyond one whole Ink. */
function ConvertToInk() {
  const { rent, offset, update } = useRent();
  const world = useWorld();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  useTicker(1000);
  const cfg = (world.data?.rent as any)?.convert as { enabled?: boolean; ink_per_usd?: number } | undefined;
  if (!rent || cfg?.enabled === false) return null;
  const rate = Math.max(1, Number(cfg?.ink_per_usd ?? 100));
  const live = liveRent(rent, Date.now() + offset);
  const usd = amount.trim() === '' ? NaN : Number(amount);
  const ink = Number.isFinite(usd) ? Math.floor(Math.min(usd, live) * rate + 1e-9) : 0;
  const minUsd = 1 / rate;
  const run = async (all: boolean) => {
    setBusy(true);
    try {
      const r = await api.convertUsd(all ? null : usd);
      update(r.rent);
      qc.setQueryData<MyState>(qk.me, (old) => (old && old.onboarded ? { ...old, balances: r.balances, rent: r.rent } : old));
      toast.success(`+${fmt(r.ink)} Ink`, { description: `Converted $${Number(r.usd).toFixed(2)} of rent at $1 = ${fmt(r.rate)} Ink.` });
      setAmount('');
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2.5 rounded-2xl border border-[#34C3FF]/40 bg-[#34C3FF]/[0.07] p-3 text-sm" data-testid="convert-usd">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold">Convert to Ink</div>
        <span className="text-xs font-bold text-muted tnum">$1 = {fmt(rate)} Ink</span>
      </div>
      <p className="text-xs text-muted">Any amount from ${minUsd.toFixed(2)} works. Only whole Ink is issued — the rest stays in your rent.</p>
      <div className="flex items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-xl border border-line bg-surface/80 px-3 focus-within:border-accent">
          <span className="text-muted">$</span>
          <input className="h-full min-w-0 flex-1 bg-transparent tnum focus:outline-none" inputMode="decimal" placeholder="0.01" value={amount} aria-label="Amount in USD" data-testid="convert-amount"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 14))} />
        </label>
        <Button variant="primary" disabled={busy || ink < 1} loading={busy} onClick={() => run(false)} data-testid="convert-submit">
          {ink >= 1 ? `Get ${fmt(ink)} Ink` : 'Convert'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[0.01, 0.1, 1].map((v) => (
          <button key={v} className="rounded-lg border border-line px-2 py-1 text-xs font-bold tnum hover:border-line-strong disabled:opacity-40" disabled={live < v} onClick={() => setAmount(String(v))}>${v.toFixed(2)}</button>
        ))}
        <button className="rounded-lg border border-line px-2 py-1 text-xs font-bold hover:border-line-strong disabled:opacity-40" disabled={busy || live * rate < 1} onClick={() => run(true)} data-testid="convert-all">
          All · {fmt(Math.floor(live * rate))} Ink
        </button>
        {Number.isFinite(usd) && usd > live && <span className="text-xs text-warn">You have ${live.toFixed(4)}</span>}
      </div>
    </div>
  );
}
