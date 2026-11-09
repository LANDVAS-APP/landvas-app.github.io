// The merge tier in the plot panel. For land you own, one card that says where it stands:
//   • not a 2x2 square yet  → how close it is (a little 2x2 with the missing plots) and what it will unlock
//   • a square of a type with an Estate → "Estate unlocked!": upgrade to it, or keep the type (both free, both kept)
//   • already an Estate     → what it is, and switching back to the base type
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Crown, Lock, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup, EstateKind } from '../backend/types';
import { invalidateGame, qk } from '../lib/queries';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { Button } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { realmRoute } from '../realms/kinds';
import { ESTATES, estateOf, hasSquare, isEstate, kindFamily, squareProgress } from '../realms/estates/meta';
import { KIND_LABEL } from './mergeKind';

const KEPT = 'landvas.estate.kept';

/** A little animated postcard of an Estate. */
export function EstatePostcard({ kind, size = 120, locked }: { kind: EstateKind; size?: number; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const e = ESTATES[kind];
  useEffect(() => {
    const c = ref.current!; const dpr = Math.min(2, devicePixelRatio || 1); c.width = c.height = size * dpr;
    const g = c.getContext('2d')!; g.scale(dpr, dpr);
    let raf = 0; const t0 = performance.now();
    const icons = e.perks.length ? [e.emoji, '✨', '👑'] : [e.emoji];
    const frame = (now: number) => {
      const t = (now - t0) / 1000, s = size;
      const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, e.color); gr.addColorStop(1, '#0B0A1A'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
      g.globalAlpha = 0.25; for (let i = 0; i < 6; i++) { g.fillStyle = '#fff'; g.beginPath(); g.arc((i * 37 + t * 12) % s, (i * 53) % s, 1.5, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
      g.font = `${s * 0.42}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (locked) g.globalAlpha = 0.45;
      g.fillText(icons[0], s / 2, s / 2 + Math.sin(t * 2) * s * 0.03);
      g.globalAlpha = 1;
      g.font = `${s * 0.18}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.fillText(locked ? '🔒' : '👑', s / 2, s * 0.16 + Math.sin(t * 3) * 2);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, size, locked]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0 rounded-2xl shadow-lg" aria-hidden />;
}

/** a 2x2 diagram: which plots of the best square you have, which are missing */
function SquareDiagram({ have, color }: { have: boolean[]; color: string }) {
  return (
    <div className="grid w-14 shrink-0 grid-cols-2 gap-1" aria-hidden>
      {have.map((h, i) => (
        <div key={i} className={cn('aspect-square rounded-md border-2', h ? '' : 'border-dashed border-line-strong bg-surface/30')} style={h ? { background: color, borderColor: color, boxShadow: `0 0 10px -2px ${color}` } : undefined} />
      ))}
    </div>
  );
}

export function EstateCard({ group }: { group: CanvasGroup }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const kind = group.kind ?? 'canvas';
  const base = kindFamily(kind), estate = isEstate(kind) ? kind : estateOf(base);
  const [kept, setKept] = useState(() => (safeStorage<string[]>(KEPT, []) ?? []).includes(group.id));
  if (!estate) return null;
  const e = ESTATES[estate], cells = (group.cells ?? []) as unknown as [number, number][];
  const square = hasSquare(cells);
  const switchTo = async (to: string, upgrade: boolean) => {
    setBusy(true);
    try {
      const r = await api.setGroupKind(group.id, to as never);
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: qk.groups }); void qc.invalidateQueries({ queryKey: ['plot'] });
      if (upgrade) {
        confettiCannons();
        toast.success(`${e.emoji} ${e.name} — your Estate is open!`, { description: `${e.tagline} Your first one starts with a charter bonus to spend.`, action: r.realm_id ? { label: e.enter, onClick: () => nav(realmRoute(r.realm_id!)) } : undefined, duration: 7000 });
        if (r.realm_id) nav(realmRoute(r.realm_id));
      } else toast.success(`Back to ${KIND_LABEL[base].one} ${KIND_LABEL[base].emoji}`, { description: `Your ${e.name} keeps all its progress — switch back any time while the land stays a 2×2 square.` });
    } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
  };

  // ---- already an Estate ----
  if (isEstate(kind)) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: `${e.color}66`, background: `linear-gradient(135deg, ${e.color}22, transparent)` }} data-testid="estate-card" data-state="estate">
        <EstatePostcard kind={estate} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: e.color }}><Crown className="h-3.5 w-3.5" /> Estate tier</div>
          <div className="truncate font-display font-semibold">{e.name}</div>
          <div className="text-[11px] text-muted">Built on your {KIND_LABEL[base].one}. Both keep their progress.</div>
        </div>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void switchTo(base, false)} data-testid="estate-keep-base"><Undo2 className="h-4 w-4" /> {KIND_LABEL[base].emoji}</Button>
      </div>
    );
  }

  // ---- not a square yet: show how close ----
  if (!square) {
    const p = squareProgress(cells);
    const have = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => !p.missing.some(([x, y]) => x === p.x + i && y === p.y + j));
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/40 p-3" data-testid="estate-card" data-state="progress">
        <SquareDiagram have={have} color={e.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted"><Lock className="h-3 w-3" /> Estate · {p.have}/4 in a square</div>
          <div className="font-display text-sm font-semibold">{e.emoji} {e.name}</div>
          <div className="text-[11px] text-muted">Merge {4 - p.have} more {KIND_LABEL[base].one} plot{4 - p.have === 1 ? '' : 's'} into a 2×2 square to unlock it: {e.body.toLowerCase()}, with {e.game}.</div>
        </div>
      </div>
    );
  }

  // ---- a square: the choice ----
  return (
    <AnimatePresence initial={false} mode="wait">
      {kept ? (
        <motion.div key="kept" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-2xl border p-2.5" style={{ borderColor: `${e.color}55` }} data-testid="estate-card" data-state="kept">
          <span className="text-2xl">{e.emoji}</span>
          <div className="min-w-0 flex-1 text-xs"><b>{e.name}</b> <span className="text-muted">is unlocked — upgrade any time.</span></div>
          <Button size="sm" variant="secondary" onClick={() => { setKept(false); saveStorage(KEPT, (safeStorage<string[]>(KEPT, []) ?? []).filter((x) => x !== group.id)); }}>Show</Button>
        </motion.div>
      ) : (
        <motion.div key="offer" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="relative overflow-hidden rounded-3xl border-2 p-4" style={{ borderColor: e.color, background: `radial-gradient(circle at 20% 0%, ${e.color}38, transparent 60%)`, boxShadow: `0 0 40px -16px ${e.color}` }} data-testid="estate-card" data-state="offer">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider" style={{ color: e.color }}><Crown className="h-4 w-4" /> Estate unlocked!</div>
          <div className="mt-2 flex gap-3">
            <EstatePostcard kind={estate} size={92} />
            <div className="min-w-0">
              <div className="font-display text-lg font-bold leading-tight">{e.name}</div>
              <p className="mt-0.5 text-xs text-muted">{e.tagline}</p>
              <ul className="mt-1.5 grid gap-0.5 text-[11px]">{e.perks.map((p) => <li key={p} className="flex gap-1.5"><span style={{ color: e.color }}>✦</span>{p}</li>)}</ul>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">{e.long}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => { setKept(true); saveStorage(KEPT, [...new Set([...(safeStorage<string[]>(KEPT, []) ?? []), group.id])]); }} data-testid="estate-keep">Keep {KIND_LABEL[base].emoji} {KIND_LABEL[base].one}</Button>
            <Button variant="primary" loading={busy} onClick={() => void switchTo(estate, true)} style={{ background: e.color, color: '#0B0A1A' }} data-testid="estate-upgrade">Upgrade <ArrowRight className="h-4 w-4" /></Button>
          </div>
          <p className="mt-2 text-center text-[10.5px] text-faint">Free either way. Switching keeps the progress in both{base === 'habitat' ? ' — your Inkborn wait in your home sanctuary while it’s an Estate' : base === 'canvas' ? ' — your published art stays saved' : ''}.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
