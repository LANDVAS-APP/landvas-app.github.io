// Choosing what an enchantment works on, the same way everywhere: one of your plots (in a list, or on the real map with
// crosshairs), or one of your other enchantments (cards with their sigil and whether they're ready — or on the map,
// where each of them lives). The map hands back to the page with the choice made.
import { motion } from 'motion/react';
import { useEffect } from 'react';
import type { EnchantView } from '../backend/api';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { useMyEnchantments } from './core';
import { dur, enchantName, kindInfo } from './kinds';
import { usePickOnMapFor } from './PlotPickOverlay';
import { usePlotPick, type PickPlot, type PickSpec } from './plotPick';
import { Sigil } from './Sigil';

/** hand a choice over to the map, and get it back here when it's made (null-safe in simple mode: no map there) */
export function useMapPick(id: string, slot: string, onPicked: (p: PickPlot, keep?: Record<string, unknown>) => void) {
  const pick = usePickOnMapFor();
  const simple = useUi((s) => !!(s.settings as any).simpleMode);
  const done = usePlotPick((s) => (s.done && s.done.id === id && s.done.slot === slot ? s.done : null));
  useEffect(() => {
    if (!done) return;
    usePlotPick.getState().clear();
    onPicked(done.plot, done.keep);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (o: Omit<PickSpec, 'id' | 'slot' | 'back'> & { back?: string }) => pick({ id, slot, back: o.back ?? `/grimoire/${id}`, ...o });
  return { open, simple };
}

export function MapPickButton({ onClick, label = 'Pick it on the map', testId, disabled, className }: { onClick(): void; label?: string; testId?: string; disabled?: boolean; className?: string }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={onClick} disabled={disabled}
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-[#9BE7FF]/40 bg-[#9BE7FF]/10 px-3 py-1.5 text-[12px] font-black text-[#C9F3FF] disabled:opacity-40', className)}
      data-testid={testId}>
      <span aria-hidden>🗺️</span>{label}
    </motion.button>
  );
}

/** a choice of your plots: the list, and the map (crosshairs on exactly these) */
export function usePlotChoice<P extends { gx: number; gy: number; rarity: string; name?: string | null; plot_type?: string }>(
  v: { id: string }, slot: string, plots: P[], onPick: (p: P) => void, o: { title: string; emoji: string; color: string; hint: string; note?: (p: P) => string | undefined; refuse?: string },
) {
  const { open, simple } = useMapPick(v.id, slot, (picked) => {
    const p = plots.find((x) => x.gx === picked.gx && x.gy === picked.gy);
    if (p) onPick(p);
  });
  const toMap = () => open({ title: o.title, emoji: o.emoji, color: o.color, hint: o.hint, refuse: o.refuse,
    allowed: plots.map((p) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, name: p.name ?? null, plot_type: p.plot_type, note: o.note?.(p) })) });
  return { toMap, canMap: !simple && plots.length > 0 };
}

/** seconds until something next happens for an enchantment (from its own view), or null */
export function nextIn(e: Pick<EnchantView, 'view'>, elapsedS = 0): number | null {
  const v = e.view;
  if (!v || typeof v !== 'object') return null;
  let best: number | null = null;
  for (const [k, x] of Object.entries(v)) {
    if (!k.endsWith('_in') || k === 'choose_in' || typeof x !== 'number' || x <= 0) continue;
    const s = x - elapsedS;
    if (s > 0 && (best == null || s < best)) best = s;
  }
  return best;
}

/** one of your enchantments as a little card: its sigil, its name, and whether it's ready */
export function EnchantChip({ e, on, onClick, testId, elapsedS = 0, right }: { e: EnchantView; on?: boolean; onClick?: () => void; testId?: string; elapsedS?: number; right?: React.ReactNode }) {
  const k = kindInfo(e.reflect_kind ?? e.kind);
  const n = e.attention ? null : nextIn(e, elapsedS);
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick} className={cn('lvx-ench-chip', on && 'on')} style={{ ['--a' as string]: kindInfo(e.kind).a }} data-testid={testId} data-kind={e.kind}>
      <Sigil kind={e.kind} seed={e.sigil} size={34} level={e.level} still />
      <span className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-[12.5px] font-black text-white">{enchantName(e)}</span>
        <span className={cn('truncate text-[10.5px] font-bold', e.attention ? 'text-[#FFE8A3]' : 'text-white/50')}>
          {e.attention ? `✦ ${e.attention}` : n != null ? `⏳ ${dur(n)}` : `${k.emoji} ${k.name}`}
        </span>
      </span>
      {right}
    </motion.button>
  );
}

/** pick one of your other enchantments: cards grouped by kind, or tap where it lives on the map */
export function EnchantPicker({ self, filter, onPick, picked, title, slot = 'enchant', testId = 'enchant-picker', chipTestId = 'enchant-pick', keep }: {
  self: { id: string }; filter?: (e: EnchantView) => boolean; onPick(e: EnchantView, keep?: Record<string, unknown>): void; picked?: string | null; title: string; slot?: string; testId?: string; chipTestId?: string;
  /** what the page needs back after a trip to the map */ keep?: Record<string, unknown>;
}) {
  const mine = useMyEnchantments();
  const list = (mine.data ?? []).filter((e) => e.id !== self.id && (!filter || filter(e)));
  const elapsed = mine.dataUpdatedAt ? (Date.now() - mine.dataUpdatedAt) / 1000 : 0;
  const { open, simple } = useMapPick(self.id, slot, (p, k) => { const e = (mine.data ?? []).find((x) => x.gx === p.gx && x.gy === p.gy && x.id !== self.id); if (e) onPick(e, k); });
  return (
    <div className="grid gap-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="lvx-label">{title}</span>
        {!simple && list.length > 0 && (
          <MapPickButton testId={`${testId}-map`} onClick={() => open({ title, emoji: '🎯', color: '#B26BFF', hint: 'Tap the plot one of your enchantments lives on', keep,
            allowed: list.map((e) => ({ gx: e.gx, gy: e.gy, rarity: 'enchanted', name: enchantName(e), note: `${kindInfo(e.kind).emoji} ${kindInfo(e.kind).name}` })) })} />
        )}
      </div>
      {list.length ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {list.map((e) => <EnchantChip key={e.id} e={e} on={picked === e.id} onClick={() => onPick(e, keep)} testId={chipTestId} elapsedS={elapsed} />)}
        </div>
      ) : <p className="text-[12px] text-white/55">Your other enchantments will show up here.</p>}
    </div>
  );
}
