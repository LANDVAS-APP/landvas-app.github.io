// The claim preview: tap an empty plot and this is all you see — the plot, what to build on it, and one big Claim
// button, all on screen without scrolling (website and app alike). What a plot could roll lives one tap away in the
// Odds sheet (and in full on the Guide), not in the preview.
import { AnimatePresence, motion } from 'motion/react';
import { Dices, Info, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PlotDetails, PlotKind } from '../backend/types';
import { buzz } from '../native/native';
import { cn, fmt, plotLabel } from '../lib/utils';
import { plotMetres } from '../shared/grid';
import { isFusion, isPrimordial, rarities } from '../shared/rarity';
import { Dialog } from '../ui';
import { HotZoneFact } from '../daily/HotZone';
import './claim.css';

export type KindOpt = { k: PlotKind; icon: string; title: string; body: string; color: string; perks: string[]; subs?: PlotKind[]; tid?: string };
export type SubOpt = { icon: string; title: string; body: string; perks: string[] };

/** the top of the preview: a glowing mystery tile, where it is, and the way to the odds */
export function ClaimHeader({ d, onClose, onOdds }: { d: PlotDetails; onClose(): void; onOdds(): void }) {
  return (
    <div className="lv-cpv-head" data-testid="claim-head">
      <div className="lv-cpv-orb" aria-hidden><span className="ring" /><span className="face">?</span></div>
      <div className="min-w-0 flex-1">
        <div className="lv-cpv-eyebrow">Unclaimed land</div>
        <h2 className="truncate font-display text-[19px] font-bold leading-tight" data-testid="plot-title">{d.name || 'A mystery plot'}</h2>
        <p className="truncate text-[11.5px] font-semibold tnum text-white/55">Plot {plotLabel(d.gx, d.gy)} · ≈{plotMetres(d.center.lat).toFixed(0)} m square</p>
      </div>
      <button type="button" className="lv-cpv-odds" onClick={onOdds} data-testid="claim-odds"><Dices className="h-4 w-4" />Odds</button>
      <button type="button" onClick={onClose} className="lv-cpv-x" aria-label="Close plot panel"><X className="h-5 w-5" /></button>
    </div>
  );
}

/** what's known about it (the minigame, when the world has revealed it) and the mystery */
export function ClaimFacts({ d, children }: { d: PlotDetails; children?: ReactNode }) {
  return (
    <div className="lv-cpv-facts">
      {d.type_info?.minigame_name && <span className="lv-cpv-fact">🎮 {d.type_info.minigame_name}</span>}
      <HotZoneFact gx={d.gx} gy={d.gy} />
      <span className="lv-cpv-fact lv-cpv-mystery" data-testid="mystery-note"><b>?</b> Rarity, rent{d.type_info ? '' : ' and minigame'} revealed when you claim</span>
      {children}
    </div>
  );
}

/** Every plot type in one row you swipe (the picked one glows), its subplots under it, one line on what it does. */
export function TypePicker({ opts, subs, kind, onPick }: { opts: KindOpt[]; subs: Partial<Record<PlotKind, SubOpt>>; kind: PlotKind; onPick(k: PlotKind): void }) {
  const opt = opts.find((o) => o.k === kind || o.subs?.includes(kind)) ?? opts[0];
  const sub = subs[kind];
  const [details, setDetails] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const pick = (k: PlotKind, el?: HTMLElement | null) => { buzz('light'); onPick(k); el?.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2" data-testid="plot-kind-choice">
      <div className="flex items-baseline justify-between px-0.5">
        <span className="lv-cpv-eyebrow">Build a…</span>
        <span className="text-[11px] font-semibold text-white/45">Same price for every type</span>
      </div>
      <div ref={row} className="lv-cpv-types no-scrollbar" role="radiogroup" aria-label="What this plot becomes" data-testid="plot-kind">
        {opts.map((o) => {
          const on = opt.k === o.k;
          return (
            <button key={o.k} type="button" role="radio" aria-checked={on} className={cn('lv-cpv-type', on && 'on')} style={{ ['--k' as string]: o.color }}
              onClick={(e) => pick(o.subs ? (o.subs.includes(kind) ? kind : o.subs[0]) : o.k, e.currentTarget)} data-testid={`buy-as-${o.tid ?? o.k}`}>
              <span className="ic">{o.icon}</span><span className="nm">{o.title}</span>
            </button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {opt.subs && (
          <motion.div key="subs" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="lv-cpv-subs" style={{ ['--k' as string]: opt.color }} role="radiogroup" aria-label={`${opt.title} subplot`} data-testid="buy-subplots">
              {opt.subs.map((k) => {
                const sp = subs[k]!, on = kind === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} className={cn('lv-cpv-sub', on && 'on')} onClick={() => pick(k)} data-testid={`buy-as-${k}`}>
                    <span className="text-lg leading-none">{sp.icon}</span><span className="min-w-0"><b>{sp.title}</b><i>{sp.body}</i></span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={kind} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.14 }}
            className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white/70" data-testid="claim-type-line">
            <span style={{ color: opt.color }}>{sub ? `${sub.icon} ${sub.title}` : `${opt.icon} ${opt.title}`}</span> — {sub?.body ?? opt.body}
          </motion.p>
        </AnimatePresence>
        <button type="button" onClick={() => setDetails((v) => !v)} className="lv-cpv-more" aria-expanded={details} data-testid="buy-details-toggle"><Info className="h-3.5 w-3.5" />{details ? 'Less' : 'More'}</button>
      </div>
      <AnimatePresence initial={false}>
        {details && (
          <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="lv-cpv-details no-scrollbar" data-testid="buy-details">
              {opts.map((o) => (
                <div key={o.k} className={cn('lv-cpv-detail', opt.k === o.k && 'on')} style={{ ['--k' as string]: o.color }}>
                  <button type="button" onClick={() => pick(o.subs ? (o.subs.includes(kind) ? kind : o.subs[0]) : o.k)} className="flex w-full items-center gap-2 text-left">
                    <span className="text-xl">{o.icon}</span>
                    <span className="min-w-0 flex-1"><b className="block text-[13px]" style={{ color: o.color }}>{o.title}</b><span className="block text-[11px] text-white/55">{o.body}</span></span>
                  </button>
                  <ul className="mt-1 grid gap-0.5 pl-8 text-[11px] text-white/75">{o.perks.map((p) => <li key={p} className="flex gap-1"><span style={{ color: o.color }}>✦</span>{p}</li>)}</ul>
                  {o.subs && (
                    <div className="mt-1.5 grid gap-1.5 pl-8">
                      {o.subs.map((k) => { const sp = subs[k]!; return (
                        <button key={k} type="button" onClick={() => pick(k)} className={cn('rounded-lg border p-1.5 text-left', kind === k ? 'border-[var(--k)]' : 'border-white/10')} data-testid={`buy-detail-${k}`}>
                          <div className="text-xs font-bold">{sp.icon} {sp.title} <span className="font-normal text-white/55">— {sp.body}</span></div>
                          <ul className="mt-0.5 grid gap-0.5 text-[10.5px] text-white/55">{sp.perks.map((p) => <li key={p}>· {p}</li>)}</ul>
                        </button>
                      ); })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The odds, out of the preview: the everyday ladder every claim rolls, then the rare tiers on top. */
export function OddsSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const t = useMemo(() => {
    const all = rarities();
    const ladder = all.filter((r) => Number(r.weight) > 0 && !r.tier);
    const total = ladder.reduce((s, r) => s + Number(r.weight), 0) || 1;
    const ultras = all.filter((r) => r.tier === 'ultra' && !r.id.startsWith('crown'));
    const ppm = ultras.reduce((s, r) => s + Number(r.ppm || 0), 0);
    const prim = all.filter((r) => isPrimordial(r.id) || r.tier === 'primordial');
    const ppb = prim.reduce((s, r) => s + Number(r.ppb || 0), 0);
    return { ladder, total, ultras, ppm, prim, ppb, fusions: all.filter((r) => isFusion(r.id) || r.tier === 'fusion').length };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (w: number) => { const p = (w / t.total) * 100; return p >= 10 ? `${Math.round(p)}%` : p >= 1 ? `${p.toFixed(1)}%` : `${p.toFixed(2)}%`; };
  const oneIn = (p: number) => (p > 0 ? `1 in ${fmt(Math.round(1 / p))}` : '—');
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="🎲 What a plot can roll" description="Every claim rolls its rarity the moment you claim it. These are the real odds the server uses.">
      <div className="grid gap-4" data-testid="odds-sheet">
        <div>
          <div className="mb-2 flex h-3 gap-0.5 overflow-hidden rounded-full">
            {t.ladder.map((r) => <div key={r.id} style={{ flex: Number(r.weight), background: r.color }} />)}
          </div>
          <div className="grid gap-1.5">
            {t.ladder.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2/60 px-3 py-2" data-testid={`odds-${r.id}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color, boxShadow: `0 0 10px ${r.glow}` }} />
                <b className="min-w-0 flex-1 text-sm" style={{ color: r.glow }}>{r.name}</b>
                <span className="text-sm font-bold tnum">{pct(Number(r.weight))}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">On top of that, any claim can be…</div>
          {t.ppm > 0 && <OddsRow emoji="🌈" name={`An ultra (${t.ultras.length} kinds)`} odds={oneIn(t.ppm / 1_000_000)} />}
          <OddsRow emoji="👑" name="A Crown" odds="the first in a free kingdom" />
          {t.ppb > 0 && <OddsRow emoji="🌌" name={`A Primordial (${t.prim.length} kinds)`} odds={oneIn(t.ppb / 1_000_000_000)} />}
          {t.fusions > 0 && <OddsRow emoji="⚗️" name={`Ultra Fusions (${t.fusions})`} odds="Fusion Lab only" />}
        </div>
        <Link to="/guide#rates" onClick={onClose} className="justify-self-center text-sm font-bold text-accent-2 hover:underline" data-testid="odds-guide">Every rarity, its rent and its odds → Guide</Link>
      </div>
    </Dialog>
  );
}
function OddsRow({ emoji, name, odds }: { emoji: string; name: string; odds: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
      <span className="text-lg">{emoji}</span><span className="min-w-0 flex-1 text-sm font-semibold">{name}</span><span className="text-xs font-bold text-muted tnum">{odds}</span>
    </div>
  );
}
