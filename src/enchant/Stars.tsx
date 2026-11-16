// ⭐ Stars: pour a copy of an enchantment into another of the same kind (or three of other kinds, as Essence) and it
// earns a star — +10% Ink a star and a new power at each. Here: the stars it wears (an aura on its sigil), its three
// powers, and the pouring ritual itself.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api, type EnchantView, type MergeResult } from '../backend/api';
import { toGameError } from '../backend/backend';
import { ClipMomentButton, enchantRef, useKeepMoment } from '../clips/ClipMoment';
import type { Moment } from '../clips/moments';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button } from '../ui';
import { efx, useMyEnchantments } from './core';
import { enchantName, kindInfo } from './kinds';
import { Sigil } from './Sigil';
import './enchant.css';

/** ★★☆ */
export function StarPips({ stars, of = 3, className, testId }: { stars: number; of?: number; className?: string; testId?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-[1px] leading-none', className)} aria-label={`${stars} of ${of} stars`} data-testid={testId} data-stars={stars}>
      {Array.from({ length: of }, (_, i) => <span key={i} className={i < stars ? 'text-[#FFD23F] drop-shadow-[0_0_4px_#FFB31F]' : 'text-white/20'}>★</span>)}
    </span>
  );
}

/** the stars it wears: a golden ring (★1), runes in orbit (★2), a crown of stars (★3) */
export function StarAura({ stars, size, children }: { stars: number; size: number; children: ReactNode }) {
  if (!stars) return <>{children}</>;
  return (
    <div className={`lv-staraura s${stars} relative grid place-items-center`} style={{ width: size, height: size }} data-testid="star-aura" data-stars={stars}>
      <span className="lv-staraura-ring" />
      {stars >= 2 && <span className="lv-staraura-orbit">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 60}deg) translateY(-${size * 0.56}px)` }}>✦</i>)}</span>}
      {stars >= 3 && <span className="lv-staraura-crown">{['⭐', '🌟', '⭐'].map((s, i) => <i key={i} style={{ transform: `rotate(${(i - 1) * 26}deg) translateY(-${size * 0.6}px)` }}>{s}</i>)}</span>}
      <div className="relative">{children}</div>
    </div>
  );
}

const busyOf = (x: EnchantView) =>
  !!x.partner || (x.partners ?? []).length > 0 || (x.kind === 'splice' && !!x.view?.active) || (x.kind === 'stormcoil' && !!x.view?.storm);

/** its stars, its three powers, and the way to earn the next one */
export function StarsPanel({ v }: { v: EnchantView }) {
  const [open, setOpen] = useState(false);
  const stars = v.stars ?? 0, need = v.star_need ?? null, fill = v.star_fill ?? 0, ess = v.essence ?? 0;
  const k = kindInfo(v.kind);
  return (
    <section className="lv-stars-card mb-4 grid gap-2.5 rounded-3xl p-3.5" style={{ ['--a' as string]: k.a }} data-testid="ench-stars">
      <div className="flex items-center gap-2">
        <span className="font-display text-[17px] font-black text-[#FFE8A3]">⭐ Stars</span>
        <StarPips stars={stars} className="text-[18px]" testId="ench-stars-pips" />
        {stars > 0 && <span className="rounded-full bg-[#FFD23F]/15 px-2 py-0.5 text-[11px] font-black text-[#FFD23F]">+{v.star_ink ?? stars * 10}% Ink</span>}
        <span className="ml-auto text-[11px] font-bold text-[#C9B8FF]" title="Pour in enchantments of other kinds: 3 Essence pour in as one copy" data-testid="ench-essence">🔮 {ess} Essence</span>
      </div>
      {need != null && (
        <div className="flex items-center gap-2 text-[11px] font-bold text-white/65" data-testid="ench-star-progress">
          <span>Next star (★{stars + 1}):</span>
          {Array.from({ length: need }, (_, i) => <span key={i} className={cn('h-2.5 w-6 rounded-full', i < fill ? 'bg-[linear-gradient(90deg,#FFD23F,#FF9F1C)]' : 'bg-white/10')} />)}
          <span>{fill}/{need} cop{need === 1 ? 'y' : 'ies'}</span>
        </div>
      )}
      <div className="grid gap-1.5" data-testid="ench-powers">
        {(v.powers ?? []).map((p) => (
          <div key={p.star} className={cn('flex items-start gap-2.5 rounded-2xl px-2.5 py-2', p.on ? 'bg-[linear-gradient(90deg,#FFD23F22,transparent)] ring-1 ring-[#FFD23F]/40' : 'bg-white/[0.03] opacity-70')} data-testid={`ench-power-${p.star}`} data-on={p.on}>
            <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-[17px]', p.on ? 'bg-[#FFD23F]/20' : 'bg-white/5 grayscale')}>{p.on ? p.emoji : '🔒'}</span>
            <span className="grid min-w-0 leading-tight">
              <span className="text-[13px] font-black"><span className="text-[#FFD23F]">{'★'.repeat(p.star)}</span> {p.name}</span>
              <span className="text-[11.5px] text-white/70">{p.text}</span>
            </span>
          </div>
        ))}
      </div>
      <Button variant={stars < 3 ? 'rainbow' : 'secondary'} onClick={() => setOpen(true)} data-testid="ench-merge-open">
        {stars < 3 ? `✨ Pour in a copy${(v.copies ?? 0) > 0 ? ` (${v.copies} ${k.name}${v.copies === 1 ? '' : 's'} to pour)` : ''}` : '🔮 Pour others in as Essence'}
      </Button>
      <p className="text-center text-[11px] text-white/50">Another {k.name} fills its next star. Any other enchantment becomes Essence — 3 Essence pour in as one copy. Levels and XP carry over; the copy’s plot stays yours and takes its own roll.</p>
      {open && <MergeRitual v={v} onClose={() => setOpen(false)} />}
    </section>
  );
}

type Phase = { at: 'pick' } | { at: 'confirm'; copy: EnchantView | null } | { at: 'pour'; copy: EnchantView | null } | { at: 'done'; copy: EnchantView | null; r: MergeResult; v: EnchantView };

/** choose what to pour in, then watch it pour */
function MergeRitual({ v, onClose }: { v: EnchantView; onClose(): void }) {
  const mine = useMyEnchantments();
  const qc = useQueryClient();
  const keep = useKeepMoment();
  // (the list may be a little old: what you could pour is read fresh when the pouring opens)
  useEffect(() => { void mine.refetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reduce = useUi((s) => !!s.settings.reduceMotion);
  const haptics = useUi((s) => !!s.settings.haptics);
  const [ph, setPh] = useState<Phase>({ at: 'pick' });
  const [moment, setMoment] = useState<Moment | null>(null);
  const k = kindInfo(v.kind);
  const stars = v.stars ?? 0, ess = v.essence ?? 0;
  const list = useMemo(() => (mine.data ?? []).filter((x) => x.id !== v.id), [mine.data, v.id]);
  const same = list.filter((x) => x.kind === v.kind), other = list.filter((x) => x.kind !== v.kind);
  const pour = async (copy: EnchantView | null) => {
    setPh({ at: 'pour', copy });
    if (haptics) buzz('heavy');
    try {
      const [r] = await Promise.all([api.enchantMerge(v.id, copy?.id ?? null), new Promise((res) => setTimeout(res, reduce ? 300 : 1700))]);
      const { result, ...view } = r;
      qc.setQueryData(['enchant', v.id], view);
      if (copy) qc.removeQueries({ queryKey: ['enchant', copy.id] });
      void qc.invalidateQueries({ queryKey: ['enchantments'] });
      void qc.invalidateQueries({ queryKey: ['enchant-chronicle', v.id] });
      void qc.invalidateQueries({ queryKey: ['enchant-map'] });
      invalidateGame(qc);
      setPh({ at: 'done', copy, r: result, v: view as EnchantView });
      const c = { x: innerWidth / 2, y: innerHeight * 0.42 };
      efx.burst({ ...c, colors: [k.a, '#FFD23F', '#FFE8A3', '#fff'], count: result.starred ? 320 : 140, speed: result.starred ? 18 : 11, kind: 'spark' });
      if (result.starred) efx.burst({ ...c, colors: ['#FFD23F', '#fff'], count: 30, speed: 9, kind: 'emoji', emojis: ['⭐', '🌟', '✨'], life: 1.5 });
      if (haptics) buzz('success');
      setMoment(result.starred && result.power ? keep({ type: 'star', e: enchantRef(view as EnchantView), stars: result.stars, power: result.power.name, text: result.power.text, copy: copy ? enchantRef(copy) : null }) : null);
    } catch (e) {
      toast.error(toGameError(e).message);
      setPh({ at: 'pick' });
    }
  };
  const Item = ({ x, note, off }: { x: EnchantView; note: string; off?: string | null }) => (
    <button disabled={!!off} onClick={() => setPh({ at: 'confirm', copy: x })} data-testid={`merge-pick-${x.kind}`}
      className="flex items-center gap-2.5 rounded-2xl bg-white/[0.05] p-2 text-left disabled:opacity-35">
      <Sigil kind={x.kind} seed={x.sigil} size={40} level={x.level} still />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-[13px] font-black">{enchantName(x)} {(x.stars ?? 0) > 0 && <StarPips stars={x.stars ?? 0} className="text-[11px]" />}</span>
        <span className="text-[11px] text-white/55">LV {x.level} · {off ?? note}</span>
      </span>
    </button>
  );
  return createPortal(
    <div className="fixed inset-0 z-[140] grid place-items-center bg-[#07030F]/95 p-3" data-testid="merge-ritual">
      <div className="lv-merge-glow pointer-events-none absolute inset-0" style={{ ['--a' as string]: k.a }} />
      <div className="relative grid max-h-[92vh] w-full max-w-[460px] gap-3 overflow-y-auto rounded-3xl border border-[#FFD23F]/30 bg-[#120A22] p-4">
        <div className="flex items-center justify-between">
          <span className="font-display text-[19px] font-black text-[#FFE8A3]">✨ The pouring</span>
          {ph.at !== 'pour' && <button className="text-sm font-bold text-white/60" onClick={onClose} data-testid="merge-close">Close</button>}
        </div>
        {/* the vessel: what it's pouring into */}
        <div className="relative grid h-[210px] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_60%,#2A1446,#0B0616_70%)]" data-testid="merge-stage">
          <AnimatePresence>
            {ph.at === 'pour' && ph.copy && (
              <motion.div key="copy" className="absolute left-1/2 top-2 -translate-x-1/2" initial={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
                animate={{ y: 110, scale: 0.2, rotate: 540, opacity: 0 }} transition={{ duration: reduce ? 0.2 : 1.5, ease: 'easeIn' }}>
                <Sigil kind={ph.copy.kind} seed={ph.copy.sigil} size={70} still />
              </motion.div>
            )}
            {ph.at === 'pour' && !reduce && (
              <motion.span key="stream" className="lv-merge-stream absolute left-1/2 top-10 h-[92px] w-[10px] -translate-x-1/2 rounded-full" style={{ ['--a' as string]: ph.copy ? kindInfo(ph.copy.kind).a : '#B79CFF' }}
                initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: [0, 1, 1, 0] }} transition={{ duration: 1.5 }} />
            )}
          </AnimatePresence>
          <motion.div animate={ph.at === 'pour' && !reduce ? { scale: [1, 1.06, 0.96, 1.1], rotate: [0, -3, 3, 0] } : { scale: 1 }} transition={{ duration: 1.6 }} className="mt-10">
            <StarAura stars={ph.at === 'done' ? ph.r.stars : stars} size={112}><Sigil kind={v.kind} seed={v.sigil} size={104} level={v.level} /></StarAura>
          </motion.div>
          {ph.at === 'done' && ph.r.starred && (
            <motion.div className="absolute inset-x-0 top-3 text-center" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 14 }}>
              <span className="font-display text-[30px] font-black text-[#FFD23F] drop-shadow-[0_0_16px_#FFB31F]">{'★'.repeat(ph.r.stars)}</span>
            </motion.div>
          )}
        </div>
        {ph.at === 'pick' && (
          <div className="grid gap-2" data-testid="merge-pick">
            <div className="text-center text-[13px] font-bold text-white/80">Pour into <b style={{ color: k.a }}>{enchantName(v)}</b> <StarPips stars={stars} /></div>
            {(mine.isLoading || mine.isFetching) && !list.length && <div className="text-center text-[12px] text-white/50">Gathering your enchantments…</div>}
            {stars < 3 && ess >= 3 && <Button variant="rainbow" onClick={() => setPh({ at: 'confirm', copy: null })} data-testid="merge-essence">🔮 Pour 3 Essence in as a copy ({ess} banked)</Button>}
            <div className="text-[11px] font-black uppercase tracking-wider text-[#FFE8A3]">Another {k.name} — a copy</div>
            {same.length ? same.map((x) => <Item key={x.id} x={x} note={`fills its next star${(x.stars ?? 0) > 0 ? ' (and brings its own stars)' : ''}`} off={stars >= 3 ? 'it already has all three stars' : busyOf(x) ? 'busy right now' : null} />)
              : !mine.isFetching && <p className="text-[12px] text-white/50">No other {k.name} yet — every new plot has a 2% chance of being enchanted. Or pour in other kinds as Essence.</p>}
            <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-[#C9B8FF]">Other kinds — Essence ({ess}/3)</div>
            {other.length ? other.map((x) => <Item key={x.id} x={x} note="becomes 1 Essence" off={busyOf(x) ? 'busy right now' : null} />)
              : !mine.isFetching && <p className="text-[12px] text-white/50">Your other enchantments would show here.</p>}
          </div>
        )}
        {ph.at === 'confirm' && (
          <div className="grid gap-2 text-center" data-testid="merge-confirm">
            {ph.copy ? (
              <>
                <div className="text-[14px] font-bold">Pour <b style={{ color: kindInfo(ph.copy.kind).a }}>{enchantName(ph.copy)}</b> into <b style={{ color: k.a }}>{enchantName(v)}</b>?</div>
                <div className="text-[12px] text-white/65">
                  {ph.copy.kind === v.kind ? `It fills ${enchantName(v)}’s next star.` : `It becomes 1 Essence${stars < 3 && ess + 1 >= 3 ? ' — that’s 3: they pour in as a copy' : ` (${Math.min(3, ess + 1)}/3)`}.`}
                  {' '}Its {ph.copy.xp} XP pours in too. It’s gone for good — its plot stays yours and takes its own roll.
                </div>
              </>
            ) : <div className="text-[14px] font-bold">Pour 3 Essence into <b style={{ color: k.a }}>{enchantName(v)}</b>?</div>}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPh({ at: 'pick' })}>Back</Button>
              <Button variant="rainbow" className="flex-1" onClick={() => void pour(ph.copy)} data-testid="merge-go">✨ Pour it in</Button>
            </div>
          </div>
        )}
        {ph.at === 'pour' && <div className="text-center font-display text-[16px] font-black text-[#FFE8A3] lv-keep-moving" data-testid="merge-pouring">Pouring it in…</div>}
        {ph.at === 'done' && (
          <div className="grid justify-items-center gap-2 text-center" data-testid="merge-done">
            {ph.r.starred && ph.r.power ? (
              <>
                <div className="font-display text-[22px] font-black text-[#FFD23F]" data-testid="merge-power">{ph.r.power.emoji} ★{ph.r.stars} {ph.r.power.name}</div>
                <div className="max-w-[320px] text-[13px] text-white/80">{ph.r.power.text}</div>
                <div className="text-[12px] font-bold text-[#FFE8A3]">+{ph.r.stars * 10}% Ink on everything it pays</div>
              </>
            ) : ph.r.same || ph.r.essence_used ? (
              <div className="text-[14px] font-bold" data-testid="merge-fill">+1 toward ★{ph.r.stars + 1} · {ph.r.fill}/{ph.r.need}</div>
            ) : (
              <div className="text-[14px] font-bold text-[#C9B8FF]" data-testid="merge-essence-got">🔮 +1 Essence · {ph.r.essence}/3</div>
            )}
            {ph.r.copy && <div className="text-[11px] text-white/50">{kindInfo(ph.r.copy.kind).name} #{ph.r.copy.serial}’s plot stays yours — rolled {ph.r.copy.rarity}.</div>}
            <div className="flex flex-wrap justify-center gap-2">
              {moment && <ClipMomentButton moment={moment} testId="merge-clip" />}
              {ph.r.stars < 3 && <Button variant="secondary" onClick={() => setPh({ at: 'pick' })} data-testid="merge-again">Pour another</Button>}
              <Button variant="primary" onClick={onClose} data-testid="merge-finish">Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body);
}
