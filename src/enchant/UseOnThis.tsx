// On any enchantment's page: your other enchantments that can work on this one, right here — no going back and forth.
// A Clockwork fast-forwards or freezes it, a Splice fuses it with a partner (a Clockwork partner makes its time run
// ×3–×4), the Oracle reads a Goose's coming eggs or a box's fates, the Size Ray shrinks its plot (time runs twice as
// fast). Only what's possible shows: a Clockwork with stored time, a Splice with a charge and a free partner…
// Also: the badge that shows an enchantment's clock running fast, as it runs.
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type EnchantView } from '../backend/api';
import { toGameError } from '../backend/backend';
import { cn } from '../lib/utils';
import { invalidateGame } from '../lib/queries';
import { Button } from '../ui';
import { Sigil } from './Sigil';
import { efx, rateOf, useMyEnchantments } from './core';
import { dur, enchantName, hybridCard, kindInfo, SPLICE_MODES, type EnchantKind, type SpliceMode } from './kinds';
import { feel } from './living';

/** ⚙️ ×3 — this enchantment's clock is running fast (a Clockwork spliced in, a tiny plot), with when it ends */
export function TempoBadge({ e, className, compact }: { e: Pick<EnchantView, 'clock'>; className?: string; compact?: boolean }) {
  const rate = rateOf(e);
  if (rate <= 1) return null;
  const until = e.clock?.rate_until ? (Date.parse(e.clock.rate_until) - Date.now()) / 1000 : null;
  const x = Number.isInteger(rate) ? `${rate}` : rate.toFixed(1);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-[linear-gradient(90deg,#D4A37333,#FFE8A333)] px-2 py-0.5 font-black text-[#FFE8A3] ring-1 ring-[#D4A373]/50', compact ? 'text-[10px]' : 'text-[11px]', className)}
      title="Its clock runs this many times as fast as normal right now" data-testid="tempo-badge">
      <svg viewBox="0 0 24 24" className={cn('lv-gear', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} style={{ animationDuration: `${Math.max(0.6, 6 / rate)}s` }} aria-hidden>
        <path fill="currentColor" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.1 4.6 1.9 1.5-2 3.4-2.3-.8a8 8 0 0 1-1.8 1l-.4 2.4h-4l-.4-2.4a8 8 0 0 1-1.8-1l-2.3.8-2-3.4 1.9-1.5a8 8 0 0 1 0-2.2L1.1 9.4l2-3.4 2.3.8a8 8 0 0 1 1.8-1L7.6 3.4h4l.4 2.4a8 8 0 0 1 1.8 1l2.3-.8 2 3.4-1.9 1.5a8 8 0 0 1 0 2.2Z" />
      </svg>
      Time ×{x}{!compact && until != null && until > 0 ? ` · ${dur(until)} left` : ''}
    </span>
  );
}

type Run = (id: string, action: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>;

export function UseOnThis({ v }: { v: EnchantView }) {
  const mine = useMyEnchantments();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // fresh on arrival: stored time, charges and partners change all the time
  useEffect(() => { void mine.refetch(); }, [v.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = (mine.data ?? []).filter((x) => x.id !== v.id && x.status === 'active');
  const run: Run = async (id, action, args, ok) => {
    if (busy) return false;
    setBusy(`${id}:${action}`);
    try {
      await api.enchantAct(id, action, args);
      feel('success');
      await Promise.all([qc.invalidateQueries({ queryKey: ['enchant', v.id] }), qc.invalidateQueries({ queryKey: ['enchant', id] }), qc.invalidateQueries({ queryKey: ['enchantments'] })]);
      invalidateGame(qc);
      if (ok) toast.success(ok);
      return true;
    } catch (e) { toast.error(toGameError(e).message); return false; }
    finally { setBusy(null); }
  };
  const kind = (v.reflect_kind ?? v.kind) as EnchantKind;
  const clocks = list.filter((x) => x.kind === 'clockwork');
  const splices = list.filter((x) => x.kind === 'splice');
  const oracles = list.filter((x) => x.kind === 'oracle');
  const rays = list.filter((x) => x.kind === 'sizeray');
  const free = !v.partner && !(v.partners ?? []).length && !v.clock?.frozen_until && v.kind !== 'splice';
  const partners = list.filter((x) => x.kind !== 'splice' && !x.partner && !(x.partners ?? []).length && !x.clock?.frozen_until)
    // Clockworks first: they make time run fast
    .sort((a, b) => Number(b.kind === 'clockwork') - Number(a.kind === 'clockwork'));
  // a Splice that isn't already running a splice (one at a time), with a charge if any has one
  const idle = splices.filter((s) => !s.view?.active);
  const spliceWith = idle.find((s) => Number(s.view?.charges ?? 0) >= 1) ?? idle[0];
  const showClock = clocks.length > 0 && v.kind !== 'clockwork';
  const showSplice = !!spliceWith && free && partners.length > 0;
  const showOracle = oracles.length > 0 && (kind === 'goose' || kind === 'pandora');
  const showRay = rays.length > 0 && !v.size;
  if (!showClock && !showSplice && !showOracle && !showRay) return null;
  return (
    <section id="ench-use" className="mt-4 grid scroll-mt-14 gap-2" data-testid="ench-use">
      <h2 className="font-display text-lg font-black">✨ Use your enchantments on this one</h2>
      {showClock && clocks.map((c) => <ClockRow key={c.id} c={c} v={v} run={run} busy={busy} />)}
      {showSplice && <SpliceRow v={v} spliceE={spliceWith!} partners={partners} run={run} busy={busy} />}
      {showOracle && oracles.map((o) => (
        <Row key={o.id} e={o} title={kind === 'goose' ? 'Read its coming eggs' : 'Read the box’s fates'} sub="See which eggs are Platinum (or what each notch holds) before you commit">
          <Link to={`/grimoire/${o.id}`} className="rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-black text-white" data-testid="use-oracle">🔮 Open the Oracle</Link>
        </Row>
      ))}
      {showRay && rays.map((r) => (
        <Row key={r.id} e={r} title="Shrink its plot: time runs twice as fast" sub="A tiny plot’s enchantments live at double speed (and foxes can’t find a tiny plot)">
          <Link to={`/grimoire/${r.id}`} className="rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-black text-white" data-testid="use-sizeray">🔽 Aim the Size Ray</Link>
        </Row>
      ))}
    </section>
  );
}

function Row({ e, title, sub, children, testid }: { e: EnchantView; title: string; sub?: string; children: React.ReactNode; testid?: string }) {
  const k = kindInfo(e.kind);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5" style={{ ['--a' as string]: k.a }} data-testid={testid}>
      <Sigil kind={e.kind} seed={e.sigil} size={36} level={e.level} still />
      <span className="grid min-w-[9rem] flex-1 basis-[9rem] leading-tight">
        <span className="truncate text-[13px] font-black"><span style={{ color: k.a }}>{k.emoji} {enchantName(e)}</span> · {title}</span>
        {sub && <span className="text-[11px] text-white/55">{sub}</span>}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function ClockRow({ c, v, run, busy }: { c: EnchantView; v: EnchantView; run: Run; busy: string | null }) {
  const charge = Math.floor(Number(c.view?.charge ?? 0));
  const cost = Number(c.view?.freeze_cost ?? 10);
  const frozen = !!v.clock?.frozen_until;
  const [whirl, setWhirl] = useState(0);
  const forward = async (m: number) => {
    setWhirl((x) => x + 1);
    if (await run(c.id, 'forward', { target: v.id, minutes: m }, `⏩ ${enchantName(v)} jumped ${m >= 60 ? `${Math.round(m / 60 * 10) / 10}h` : `${m}m`} ahead`)) {
      efx.burst({ x: innerWidth / 2, y: innerHeight * 0.35, colors: ['#D4A373', '#FFE8A3', '#fff'], count: 70, speed: 10, kind: 'spark' });
    }
  };
  return (
    <Row e={c} title={frozen ? 'Its time is frozen' : `Bend its time · ⏱ ${charge} min stored`} sub={frozen ? 'Thaw it to let it run again' : 'Fast-forward it (a minute of stored time per minute), or freeze it'} testid="use-clockwork">
      <motion.span key={whirl} className="text-lg" animate={whirl ? { rotate: [0, 720] } : {}} transition={{ duration: 0.9 }} aria-hidden>⚙️</motion.span>
      {frozen ? <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void run(c.id, 'unfreeze', { target: v.id }, 'Thawed')} data-testid="use-clock-thaw">Thaw</Button> : <>
        {[15, 60].map((m) => <Button key={m} size="sm" variant="secondary" disabled={!!busy || charge < m} onClick={() => void forward(m)} data-testid={`use-clock-forward-${m}`}>⏩ {m < 60 ? `${m}m` : '1h'}</Button>)}
        {charge >= 2 && charge !== 15 && charge !== 60 && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void forward(charge)} data-testid="use-clock-forward-all">⏩ All {charge >= 60 ? `${Math.floor(charge / 60)}h${charge % 60 ? ` ${charge % 60}m` : ''}` : `${charge}m`}</Button>}
        <Button size="sm" variant="secondary" disabled={!!busy || charge < 3 * cost} onClick={() => void run(c.id, 'freeze', { target: v.id, hours: 3 }, '❄️ Frozen for 3 hours')} data-testid="use-clock-freeze">❄️ 3h</Button>
      </>}
    </Row>
  );
}

function SpliceRow({ v, spliceE, partners, run, busy }: { v: EnchantView; spliceE: EnchantView; partners: EnchantView[]; run: Run; busy: string | null }) {
  const charges = Number(spliceE.view?.charges ?? 0);
  const [open, setOpen] = useState(partners.some((p) => p.kind === 'clockwork'));
  const shown = open ? partners : partners.slice(0, 3);
  const go = async (b: EnchantView, mode: SpliceMode) => {
    const card = hybridCard(v.kind as EnchantKind, b.kind as EnchantKind, { mode });
    if (await run(spliceE.id, 'splice', { mode, a: v.id, b: b.id }, `🧬 ${card.name}! Spliced for ${SPLICE_MODES[mode].hours} hours`)) {
      efx.burst({ x: innerWidth / 2, y: innerHeight * 0.4, colors: [kindInfo(v.kind).a, kindInfo(b.kind).a, '#00F5D4', '#fff'], count: 200, speed: 14, kind: 'spark' });
    }
  };
  return (
    <div className="grid gap-1.5 rounded-2xl border border-[#00F5D4]/25 bg-[#00F5D4]/[0.05] p-2.5" data-testid="use-splice">
      <div className="flex items-center gap-2">
        <Sigil kind="splice" seed={spliceE.sigil} size={36} level={spliceE.level} still />
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-[13px] font-black text-[#9BF6E5]">🧬 Splice it with…</span>
          <span className="text-[11px] text-white/55">{charges >= 1 ? `${charges} charge${charges === 1 ? '' : 's'} ready` : 'No charge right now — it recharges by itself'} · Swap 24h, Chimera 12h (both Traits doubled)</span>
        </span>
        <Link to={`/grimoire/${spliceE.id}`} className="text-[11px] font-black text-white/60">All modes →</Link>
      </div>
      {shown.map((b) => {
        const swap = hybridCard(v.kind as EnchantKind, b.kind as EnchantKind, { mode: 'swap' });
        const chim = hybridCard(v.kind as EnchantKind, b.kind as EnchantKind, { mode: 'chimera' });
        const mine = swap.lines.find((l) => l.me === v.kind);
        const mineC = chim.lines.find((l) => l.me === v.kind);
        return (
          <div key={b.id} className={cn('flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5', b.kind === 'clockwork' ? 'bg-[#D4A373]/15 ring-1 ring-[#D4A373]/40' : 'bg-white/[0.04]')} data-testid="use-splice-partner" data-kind={b.kind}>
            <Sigil kind={b.kind} seed={b.sigil} size={28} still />
            <span className="grid min-w-[11rem] flex-1 basis-[11rem] leading-tight">
              <span className="truncate text-[12.5px] font-black">{swap.name}{swap.perfect ? ' ✦' : ''} <span className="font-bold text-white/50">with {enchantName(b)}</span></span>
              {mine && <span className="text-[11px] text-white/70">This one: {mine.gets}{mineC && mineC.gets !== mine.gets ? ` (Chimera: ${mineC.gets})` : ''}</span>}
            </span>
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="secondary" disabled={!!busy || charges < 1} onClick={() => void go(b, 'swap')} data-testid="use-splice-swap">🔁 Swap</Button>
              <Button size="sm" variant="rainbow" disabled={!!busy || charges < 1} onClick={() => void go(b, 'chimera')} data-testid="use-splice-chimera">🐉 Chimera</Button>
            </div>
          </div>
        );
      })}
      {!open && partners.length > shown.length && <button className="text-[11px] font-black text-white/60" onClick={() => setOpen(true)}>+ {partners.length - shown.length} more</button>}
    </div>
  );
}
