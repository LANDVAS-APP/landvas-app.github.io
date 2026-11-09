// The merge tiers in the plot panel. Four plots of one type in a 2x2 square unlock that type's Estate; nine in a 3x3
// unlock its Domain. For land you own, the cards say where it stands:
//   • the tier it is now (if any)            → what it is, and switching back down (base, or Estate from a Domain)
//   • the next tier the land already holds   → "unlocked!": upgrade to it, or keep what it is (free, progress kept)
//   • otherwise the next tier it could reach → how close it is (a little 2x2 / 3x3 with the missing plots)
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Crown, Lock, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup } from '../backend/types';
import { invalidateGame, qk } from '../lib/queries';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { Button } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { realmRoute } from '../realms/kinds';
import { TIERS, estateOf, hasSquare, isTier, kindFamily, squareProgress, tierSize, type TierKind } from '../realms/estates/meta';
import { domainOf } from '../realms/estates/domains';
import { KIND_LABEL } from './mergeKind';

const KEPT = 'landvas.estate.kept';

/** A little animated postcard of an Estate. */
export function EstatePostcard({ kind, size = 120, locked }: { kind: TierKind; size?: number; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const e = TIERS[kind], big = tierSize(kind) === 3;
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
      g.font = `${s * 0.18}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.fillText(locked ? '🔒' : big ? '👑👑' : '👑', s / 2, s * 0.16 + Math.sin(t * 3) * 2);
      if (big && !locked) { g.strokeStyle = '#FFE14D'; g.globalAlpha = 0.5 + Math.sin(t * 3) * 0.3; g.lineWidth = 3; g.strokeRect(2, 2, s - 4, s - 4); g.globalAlpha = 1; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, size, locked]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0 rounded-2xl shadow-lg" aria-hidden />;
}

/** an n×n diagram: which plots of the best square you have, which are missing */
function SquareDiagram({ have, n, color }: { have: boolean[]; n: number; color: string }) {
  return (
    <div className={cn('grid shrink-0 gap-1', n === 3 ? 'w-16 grid-cols-3' : 'w-14 grid-cols-2')} aria-hidden>
      {have.map((h, i) => (
        <div key={i} className={cn('aspect-square rounded-md border-2', h ? '' : 'border-dashed border-line-strong bg-surface/30')} style={h ? { background: color, borderColor: color, boxShadow: `0 0 10px -2px ${color}` } : undefined} />
      ))}
    </div>
  );
}
const tierName = (k: TierKind) => (tierSize(k) === 3 ? 'Domain' : 'Estate');
const keptKey = (group: string, tier: TierKind) => `${group}:${tier}`;

export function EstateCard({ group }: { group: CanvasGroup }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const kind = group.kind ?? 'canvas';
  const base = kindFamily(kind), estate = estateOf(base), domain = domainOf(base);
  const [keptList, setKeptList] = useState(() => safeStorage<string[]>(KEPT, []) ?? []);
  if (!estate && !domain) return null;
  const cells = (group.cells ?? []) as unknown as [number, number][];
  const has2 = hasSquare(cells, 2), has3 = hasSquare(cells, 3);
  const now = isTier(kind) ? kind : null, nowSize = tierSize(kind);
  // the next tier up the land already qualifies for, and the next one it could grow into
  const ready: TierKind | null = domain && has3 && nowSize < 3 ? domain : estate && has2 && nowSize < 2 ? estate : null;
  const goal: TierKind | null = ready ? null : estate && !has2 && nowSize < 2 ? estate : domain && !has3 && nowSize < 3 ? domain : null;
  const isKept = (t: TierKind) => keptList.includes(keptKey(group.id, t)) || (t === estate && keptList.includes(group.id));
  const setKept = (t: TierKind, on: boolean) => { const next = on ? [...new Set([...keptList, keptKey(group.id, t)])] : keptList.filter((x) => x !== keptKey(group.id, t) && x !== group.id); setKeptList(next); saveStorage(KEPT, next); };

  const switchTo = async (to: string, upgrade: boolean) => {
    setBusy(to);
    const e = isTier(to) ? TIERS[to] : now ? TIERS[now] : null;
    try {
      const r = await api.setGroupKind(group.id, to as never);
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: qk.groups }); void qc.invalidateQueries({ queryKey: ['plot'] });
      if (upgrade && e) {
        confettiCannons();
        toast.success(`${e.emoji} ${e.name} — your ${tierName(to as TierKind)} is open!`, { description: `${e.tagline} Your first one starts with a charter bonus to spend.`, action: r.realm_id ? { label: e.enter, onClick: () => nav(realmRoute(r.realm_id!)) } : undefined, duration: 7000 });
        if (r.realm_id) nav(realmRoute(r.realm_id));
      } else {
        const label = isTier(to) ? `${TIERS[to].name} ${TIERS[to].emoji}` : `${KIND_LABEL[base].one} ${KIND_LABEL[base].emoji}`;
        toast.success(`Back to ${label}`, { description: `${now ? TIERS[now].name : 'It'} keeps all its progress — switch back any time while the land keeps its square.` });
      }
    } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(null); }
  };

  return (
    <div className="grid gap-2" data-testid="tier-cards">
      {/* ---- the tier it is now ---- */}
      {now && (() => {
        const e = TIERS[now], down = nowSize === 3 && estate && has2 ? estate : null;
        return (
          <div className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: `${e.color}66`, background: `linear-gradient(135deg, ${e.color}22, transparent)` }} data-testid="estate-card" data-state="estate" data-tier={tierName(now).toLowerCase()}>
            <EstatePostcard kind={now} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: e.color }}><Crown className="h-3.5 w-3.5" /> {tierName(now)} tier</div>
              <div className="truncate font-display font-semibold">{e.name}</div>
              <div className="text-[11px] text-muted">Built on your {KIND_LABEL[base].one}. Every tier keeps its progress.</div>
            </div>
            <div className="flex flex-col gap-1">
              {down && <Button size="sm" variant="ghost" loading={busy === down} onClick={() => void switchTo(down, false)} data-testid="estate-keep-estate" title={`Switch to ${TIERS[down].name}`}><Undo2 className="h-4 w-4" /> {TIERS[down].emoji}</Button>}
              <Button size="sm" variant="ghost" loading={busy === base} onClick={() => void switchTo(base, false)} data-testid="estate-keep-base" title={`Switch to ${KIND_LABEL[base].one}`}><Undo2 className="h-4 w-4" /> {KIND_LABEL[base].emoji}</Button>
            </div>
          </div>
        );
      })()}

      {/* ---- not there yet: how close the next tier is ---- */}
      {goal && (() => {
        const e = TIERS[goal], n = tierSize(goal), p = squareProgress(cells, n), need = n * n - p.have;
        const have: boolean[] = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) have.push(!p.missing.some(([x, y]) => x === p.x + i && y === p.y + j));
        return (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/40 p-3" data-testid="estate-card" data-state="progress" data-tier={tierName(goal).toLowerCase()}>
            <SquareDiagram have={have} n={n} color={e.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted"><Lock className="h-3 w-3" /> {tierName(goal)} · {p.have}/{n * n} in a square</div>
              <div className="font-display text-sm font-semibold">{e.emoji} {e.name}</div>
              <div className="text-[11px] text-muted">Merge {need} more {KIND_LABEL[base].one} plot{need === 1 ? '' : 's'} into a {n}×{n} square to unlock it: {e.body.toLowerCase()}, with {e.game}.</div>
            </div>
          </div>
        );
      })()}

      {/* ---- a square that unlocks the next tier: the choice ---- */}
      {ready && (() => {
        const e = TIERS[ready], big = tierSize(ready) === 3, from = now ? TIERS[now].name : `${KIND_LABEL[base].emoji} ${KIND_LABEL[base].one}`;
        return (
          <AnimatePresence initial={false} mode="wait">
            {isKept(ready) ? (
              <motion.div key="kept" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-2xl border p-2.5" style={{ borderColor: `${e.color}55` }} data-testid="estate-card" data-state="kept" data-tier={tierName(ready).toLowerCase()}>
                <span className="text-2xl">{e.emoji}</span>
                <div className="min-w-0 flex-1 text-xs"><b>{e.name}</b> <span className="text-muted">({tierName(ready)}) is unlocked — upgrade any time.</span></div>
                <Button size="sm" variant="secondary" onClick={() => setKept(ready, false)}>Show</Button>
              </motion.div>
            ) : (
              <motion.div key="offer" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="relative overflow-hidden rounded-3xl border-2 p-4" style={{ borderColor: e.color, background: big ? `radial-gradient(circle at 20% 0%, ${e.color}50, transparent 60%), radial-gradient(circle at 100% 100%, #FFE14D22, transparent 50%)` : `radial-gradient(circle at 20% 0%, ${e.color}38, transparent 60%)`, boxShadow: `0 0 ${big ? 60 : 40}px -16px ${e.color}` }} data-testid="estate-card" data-state="offer" data-tier={tierName(ready).toLowerCase()}>
                <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider" style={{ color: e.color }}><Crown className="h-4 w-4" />{big && <Crown className="-ml-1 h-4 w-4" />} {tierName(ready)} unlocked!</div>
                <div className="mt-2 flex gap-3">
                  <EstatePostcard kind={ready} size={92} />
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold leading-tight">{e.name}</div>
                    <p className="mt-0.5 text-xs text-muted">{e.tagline}</p>
                    <ul className="mt-1.5 grid gap-0.5 text-[11px]">{e.perks.map((p) => <li key={p} className="flex gap-1.5"><span style={{ color: e.color }}>✦</span>{p}</li>)}</ul>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted">{e.long}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setKept(ready, true)} data-testid="estate-keep">Keep {from}</Button>
                  <Button variant="primary" loading={busy === ready} onClick={() => void switchTo(ready, true)} style={{ background: e.color, color: '#0B0A1A' }} data-testid="estate-upgrade">Upgrade <ArrowRight className="h-4 w-4" /></Button>
                </div>
                <p className="mt-2 text-center text-[10.5px] text-faint">Free either way. Switching keeps the progress in every tier{base === 'habitat' ? ' — your Inkborn wait in your home sanctuary meanwhile' : base === 'canvas' ? ' — your published art stays saved' : ''}.</p>
              </motion.div>
            )}
          </AnimatePresence>
        );
      })()}
    </div>
  );
}
