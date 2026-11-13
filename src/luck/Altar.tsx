// The Altar of Luck: sacrifice Base plots or offer Ink to charge your Luck (0–100), and choose how many rerolls your
// next claim spends (20 Luck each) — extra rolls you pick from, and likelier ultras. The chip shows how charged you are; the altar is where you feed it.
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
import { Dialog, GameDisc } from '../ui';
import { useRerollSpeed } from '../roll/prefs';

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
export function LuckChip({ className, disc }: { className?: string; disc?: boolean }) {
  const q = useLuck();
  const [open, setOpen] = useState(false);
  if (!q.data?.enabled) return null;
  const l = q.data;
  // the app: a clean disc with the meter as its ring
  if (disc) return (
    <>
      <GameDisc tone="emerald" size={44} glow={l.luck > 0} onClick={() => setOpen(true)} className={className} aria-label={`Altar of Luck — Luck ${l.luck}`} data-testid="luck-chip">
        <span className="pointer-events-none absolute inset-[-3px] grid place-items-center"><Ring luck={l.luck} max={l.max} size={50} /></span>
        <span className="text-[19px] leading-none">🍀</span>
        {l.luck > 0 && <span className="lv-disc-count tnum">{l.luck}</span>}
      </GameDisc>
      <AltarDialog open={open} onOpenChange={setOpen} />
    </>
  );
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="luck-chip"
        className={cn('pointer-events-auto relative flex items-center gap-2 rounded-full border border-white/12 bg-[#0f1a2e]/90 py-1 pl-1 pr-3 text-[12px] font-extrabold text-white', l.luck > 0 && 'shadow-[0_0_18px_rgba(61,220,151,0.45)]', className)}>
        <span className="relative grid place-items-center"><Ring luck={l.luck} max={l.max} /><span className="absolute text-[15px]">🍀</span></span>
        <span className="grid text-left leading-tight"><span>Luck {l.luck}</span><span className="text-[10px] font-semibold text-white/55" data-testid="luck-chip-note">{l.enchant > 0 ? `✨ ${Number(l.enchant_pct)}% enchant · ` : ''}{l.rolls > 1 ? `next plot: ${l.rolls - 1} reroll${l.rolls > 2 ? 's' : ''} armed` : l.can_reroll > 0 ? 'saved · tap to use' : 'Sacrifice for free rerolls'}</span></span>
      </button>
      <AltarDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ArmButton({ on, disabled, onClick, testid, top, sub }: { on: boolean; disabled: boolean; onClick(): void; testid: string; top: string; sub: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on} data-testid={testid}
      className={cn('grid rounded-2xl px-1 py-1.5 text-center transition active:scale-95 disabled:opacity-35', on ? 'bg-[linear-gradient(135deg,#3DDC97,#FFE14D)] text-[#0b2a1c] shadow-[0_0_16px_rgba(61,220,151,0.5)]' : 'bg-white/[0.07] text-white')}>
      <span className="text-[14px] font-black leading-tight">{top}</span><span className={cn('text-[10px] font-bold', on ? 'text-[#0b2a1c]/70' : 'text-white/50')}>{sub}</span>
    </button>
  );
}

export function AltarDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const q = useLuck();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [speed, setSpeed] = useRerollSpeed();
  const [burn, setBurn] = useState<{ key: string; rarity: RarityId; gained: number } | null>(null);
  const [confirm, setConfirm] = useState<{ gx: number; gy: number; rarity: RarityId; luck: number } | null>(null);
  const [confirmThing, setConfirmThing] = useState<{ kind: 'inkborn' | 'egg'; id: string; luck: number; label: string } | null>(null);
  const offerThing = async (kind: 'inkborn' | 'egg', id: string, luck: number, label: string) => {
    setBusy(id); setConfirmThing(null);
    try {
      const r = kind === 'inkborn' ? await api.luckSacrificeInkborn(id) : await api.luckSacrificeEgg(id);
      buzz('heavy');
      setBurn({ key: `${id}${Date.now()}`, rarity: 'mythic', gained: r.gained });
      setTimeout(() => setBurn(null), 1600);
      toast(`🔥 ${label} went into the flames`, { description: `+${r.gained} Luck` });
      qc.setQueryData(['luck'], (old: typeof l) => (old ? { ...old, ...r, inkborn: old.inkborn.filter((x) => x.id !== id), eggs: old.eggs.filter((x) => x.id !== id) } : old));
      after(); void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
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
  const arm = async (n: number) => {
    setBusy(`arm${n}`);
    try { const r = await api.luckArm(n); buzz('light'); qc.setQueryData(['luck'], (old: typeof l) => (old ? { ...old, ...r } : old)); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const [inkAmt, setInkAmt] = useState('');
  const offerPts = l ? Math.min(Math.floor(Number(inkAmt || 0) / Math.max(1, l.ink_per_point)), Math.max(0, l.max - l.luck)) : 0;
  const offerAmount = async () => {
    setBusy('inkamt');
    try {
      const r = await api.luckOfferInkAmount(Number(inkAmt));
      buzz('success'); setInkAmt('');
      setBurn({ key: `ink${Date.now()}`, rarity: 'common', gained: r.gained });
      setTimeout(() => setBurn(null), 1400);
      qc.setQueryData(['luck'], (old: typeof l) => (old ? { ...old, ...r } : old));
      after();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const enchant = async (n: number) => {
    setBusy(`enchant${n}`);
    try {
      const r = await api.luckEnchant(n);
      buzz('success');
      setBurn({ key: `en${Date.now()}`, rarity: 'enchanted', gained: r.bought });
      setTimeout(() => setBurn(null), 1400);
      qc.setQueryData(['luck'], (old: typeof l) => (old ? { ...old, ...r } : old));
      after(); void qc.invalidateQueries({ queryKey: ['enchant-bestiary'] });
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
    <Dialog open={open} onOpenChange={onOpenChange} title="🍀 The Altar of Luck" description="Sacrifice plots, Inkborn, eggs or Ink to charge your Luck. Every 20 Luck is a reroll — choose how many to use on your next plot, then keep the roll you like. Ink also buys Enchanted Luck.">
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
              {l.rolls > 1 ? <>Next plot: <span className="text-[#3DDC97]">{l.rolls} rolls — you pick one</span></> : l.can_reroll > 0 ? <>Saved: <span className="text-[#3DDC97]">{l.can_reroll} reroll{l.can_reroll > 1 ? 's' : ''}</span> ready</> : l.luck > 0 ? `${l.per_roll - (l.luck % l.per_roll)} more Luck for a free reroll` : 'No Luck yet — your next roll is a normal one.'}
            </div>
            <div className="text-[11px] text-white/50">Every {l.per_roll} Luck = a reroll (up to {l.max_rerolls}) · you choose when to use them · you see every roll and keep one</div>
            <div className="mt-1 flex gap-1">{Array.from({ length: 5 }, (_, i) => <span key={i} className={cn('h-2 w-7 rounded-full transition-colors', l.luck >= (i + 1) * 20 ? 'bg-[linear-gradient(90deg,#3DDC97,#FFE14D)]' : 'bg-white/12')} />)}</div>
          </div>

          {/* when to use it */}
          <section className="grid gap-2 rounded-3xl border border-[#3DDC97]/30 bg-[#3DDC97]/[0.06] p-3" data-testid="luck-arm">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[12px] font-black uppercase tracking-wider text-white/70">Use on your next plot</h3>
              <span className="text-[11px] text-white/55">{l.per_roll} Luck a reroll</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              <ArmButton on={l.armed === 0} disabled={!!busy} onClick={() => void arm(0)} testid="luck-arm-0" top="Save" sub="keep it" />
              {Array.from({ length: l.max_rerolls }, (_, i) => i + 1).map((n) => (
                <ArmButton key={n} on={l.armed === n} disabled={!!busy || n > l.can_reroll} onClick={() => void arm(n)} testid={`luck-arm-${n}`}
                  top={n === l.max_rerolls ? `All ${n}` : `${n}`} sub={`−${n * l.per_roll}`} />
              ))}
            </div>
            <p className="text-[11px] text-white/55">
              {l.armed > 0 && l.rolls > 1
                ? <>Your next claim rolls <b className="text-[#3DDC97]">{l.rolls} times</b> ({l.rolls - 1} reroll{l.rolls > 2 ? 's' : ''}, −{(l.rolls - 1) * l.per_roll} Luck) with ultras <b className="text-[#FFE14D]">×{Number(l.ultra_x.toFixed(1))}</b> likelier — then you pick the one you keep.</>
                : l.can_reroll > 0 ? 'Your Luck is saved. Pick how many rerolls to spend on your next claim — more rerolls make ultras likelier too.' : 'Charge 20 Luck for your first reroll.'}
            </p>
            <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[12px]">
              <span className="font-bold text-white/70">Rerolls play</span>
              <div className="flex gap-1 rounded-full bg-white/[0.07] p-0.5" role="radiogroup" aria-label="Reroll speed">
                {(['normal', 'quick'] as const).map((v) => (
                  <button key={v} role="radio" aria-checked={speed === v} onClick={() => setSpeed(v)} data-testid={`reroll-speed-${v}`}
                    className={cn('rounded-full px-3 py-1 font-black', speed === v ? 'bg-white text-[#0b2a1c]' : 'text-white/60')}>{v === 'quick' ? '⏩ Quick' : '▶ Normal'}</button>
                ))}
              </div>
            </div>
          </section>

          {/* Enchanted Luck */}
          <section className="relative grid gap-2 overflow-hidden rounded-3xl border border-[#B26BFF]/40 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(178,107,255,0.28),rgba(20,8,40,0.6))] p-3" data-testid="luck-enchant">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[12px] font-black uppercase tracking-wider text-[#E5CCFF]">✨ Enchanted Luck</h3>
              <span className="font-display text-[20px] font-black text-white" data-testid="luck-enchant-pct">{Number(l.enchant_pct)}%<span className="ml-1 text-[11px] font-bold text-white/55">next roll Enchanted</span></span>
            </div>
            <div className="flex gap-1">{Array.from({ length: l.enchant_max }, (_, i) => <motion.span key={i} className={cn('h-2.5 flex-1 rounded-full', i < l.enchant ? 'bg-[linear-gradient(90deg,#B26BFF,#FFE8A3)] shadow-[0_0_8px_#B26BFF]' : 'bg-white/12')} animate={i === l.enchant - 1 ? { scale: [1, 1.4, 1] } : {}} />)}</div>
            <p className="text-[11px] text-white/60">Every roll has a {Number(l.enchant_base)}% chance to come out Enchanted — an enchantment in place of a rarity. Each charge adds {Number(l.enchant_step)} points to your <b>next</b> roll (used up by it, Enchanted or not). {fmt(l.enchant_ink)} Ink a charge.</p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 3, l.enchant_max].map((n, i) => {
                const k = Math.min(n, l.enchant_max - l.enchant);
                return (
                  <button key={i} disabled={!!busy || k < 1} onClick={() => void enchant(k)} data-testid={`luck-enchant-${i === 2 ? 'max' : n}`}
                    className="grid rounded-2xl border border-[#B26BFF]/40 bg-[#B26BFF]/15 px-2 py-2 text-center disabled:opacity-40">
                    <span className="text-[15px] font-black">{i === 2 ? 'Max' : `+${n}`} ✨</span><span className="text-[11px] font-semibold text-white/60">{fmt(Math.max(k, 0) * l.enchant_ink)} Ink</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Ink, any amount */}
          <section className="grid gap-2">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-white/60">Offer Ink · {l.ink_per_point} Ink a point</h3>
            <div className="flex gap-2">
              <input className="h-11 min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.06] px-3 text-[15px] font-bold text-white placeholder:text-white/30" inputMode="numeric" placeholder="Any amount of Ink"
                value={inkAmt} onChange={(e) => setInkAmt(e.target.value.replace(/[^0-9]/g, ''))} data-testid="luck-ink-amount" />
              <button disabled={!!busy || l.luck >= l.max || offerPts < 1} onClick={() => void offerAmount()} data-testid="luck-ink-offer"
                className="rounded-xl bg-[linear-gradient(135deg,#3DDC97,#1FA971)] px-4 font-black text-white disabled:opacity-40">+{offerPts} 🍀</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[5, 20, 100].map((n) => (
                <button key={n} disabled={!!busy || l.luck >= l.max} onClick={() => void offer(Math.min(n, l.max - l.luck))} data-testid={`luck-ink-${n}`}
                  className="grid rounded-2xl border border-white/12 bg-white/[0.06] px-2 py-1.5 text-center disabled:opacity-40">
                  <span className="text-[13px] font-black">{n === 100 ? 'Fill up' : `+${n}`} 🍀</span><span className="text-[11px] font-semibold text-white/60">{fmt(Math.min(n, Math.max(0, l.max - l.luck)) * l.ink_per_point)} Ink</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/45">Offer as much as you like — only what fits under the {l.max} Luck maximum is taken.</p>
          </section>

          {/* Inkborn and eggs */}
          {(l.inkborn.length > 1 || l.eggs.length > 0) && (
            <section className="grid gap-2">
              <h3 className="text-[12px] font-black uppercase tracking-wider text-white/60">Sacrifice an Inkborn or an egg</h3>
              <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1">
                {l.eggs.map((e) => (
                  <div key={e.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] p-2" data-testid="luck-egg">
                    <span className="grid h-9 w-9 place-items-center rounded-xl text-2xl" style={{ background: `radial-gradient(circle at 40% 35%, ${e.shell?.a ?? '#fff'}, ${e.shell?.b ?? '#c9b8ff'})` }}>🥚</span>
                    <span className="grid min-w-0 flex-1 leading-tight"><span className="truncate text-[13px] font-black capitalize">{e.kind} egg{e.mutated ? ' ✨' : ''}</span><span className="text-[11px] text-white/50">Unhatched</span></span>
                    <button disabled={!!busy || l.luck >= l.max} onClick={() => void offerThing('egg', e.id, e.luck, `${e.kind} egg`)} data-testid="luck-sacrifice-egg"
                      className="rounded-xl bg-[linear-gradient(135deg,#FF6A1F,#FF2E63)] px-3 py-1.5 text-[12px] font-black text-white shadow-[0_3px_0_#7a1030] disabled:opacity-40">🔥 +{e.luck}</button>
                  </div>
                ))}
                {l.inkborn.length > 1 && l.inkborn.map((i) => (
                  <div key={i.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] p-2" data-testid="luck-inkborn">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-2xl">🐾</span>
                    <span className="grid min-w-0 flex-1 leading-tight"><span className="truncate text-[13px] font-black">{i.name}</span><span className="text-[11px] text-white/50">Bond {i.bond}{i.bond >= 50 ? ' · close friends' : ''}</span></span>
                    <button disabled={!!busy || l.luck >= l.max} onClick={() => setConfirmThing({ kind: 'inkborn', id: i.id, luck: i.luck, label: i.name })} data-testid="luck-sacrifice-inkborn"
                      className="rounded-xl bg-[linear-gradient(135deg,#FF6A1F,#FF2E63)] px-3 py-1.5 text-[12px] font-black text-white shadow-[0_3px_0_#7a1030] disabled:opacity-40">🔥 +{i.luck}</button>
                  </div>
                ))}
              </div>
            </section>
          )}

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

          <Dialog open={!!confirmThing} onOpenChange={(o) => !o && setConfirmThing(null)} title={`Sacrifice ${confirmThing?.label ?? ''}?`} description={confirmThing ? `${confirmThing.label} is gone for good, for +${confirmThing.luck} Luck. This can’t be undone.` : ''}>
            {confirmThing && (
              <div className="grid grid-cols-2 gap-2">
                <button className="h-11 rounded-2xl bg-white/10 font-bold" onClick={() => setConfirmThing(null)}>Keep them</button>
                <button className="h-11 rounded-2xl bg-[linear-gradient(135deg,#FF6A1F,#FF2E63)] font-black text-white" onClick={() => void offerThing(confirmThing.kind, confirmThing.id, confirmThing.luck, confirmThing.label)} data-testid="luck-confirm-thing">🔥 Sacrifice</button>
              </div>
            )}
          </Dialog>
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
