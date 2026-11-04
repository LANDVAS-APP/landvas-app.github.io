// The farm's progression hub: the orders board, upgrades, buildings (coop, hive, dairy, windmill,
// kitchen) and cooking. Everything is bought with Farm Coins, earned by farming.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Farm, FarmConfig, FarmProgress, FarmProgressResult } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, Dialog, ResourceIcon } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { farmKey } from './FarmScreen';

export type HubTab = 'orders' | 'upgrades' | 'buildings' | 'kitchen';

/** The emoji and name of anything you can hold: a crop, a golden crop, eggs/honey/milk, or a dish. */
export function itemInfo(cfg: FarmConfig, key: string) {
  const golden = key.startsWith('golden_');
  const base = key.replace(/^golden_/, '');
  const x = cfg.crops[base] ?? cfg.products?.[key] ?? cfg.recipes?.[key];
  return { emoji: x?.emoji ?? '📦', name: `${golden ? 'Golden ' : ''}${x?.name ?? key.replace(/_/g, ' ')}`, golden, sell: (x?.sell ?? 1) * (golden ? cfg.golden_mult : 1) };
}
export const coinFmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : `${Math.floor(n)}`);
export const Coin = ({ className }: { className?: string }) => <span className={cn('inline-block leading-none', className)}>🪙</span>;

/** Level, XP bar and coins, for the top of the farm. */
export function LevelBadge({ p, onClick }: { p: FarmProgress; onClick?(): void }) {
  const frac = Math.max(0, Math.min(1, (p.xp - p.level_xp) / Math.max(1, p.next_xp - p.level_xp)));
  return (
    <button onClick={onClick} className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-black/45 px-2.5 py-1.5 text-left backdrop-blur" data-testid="farm-level">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#7BD957] font-display text-sm font-black text-black">{p.level}</span>
      <span className="grid min-w-[84px] gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-white/75">Farm level</span>
        <span className="h-1.5 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-[#7BD957]" style={{ width: `${frac * 100}%` }} /></span>
      </span>
      <span className="rounded-full bg-[#FFC93D] px-2 py-0.5 text-xs font-black text-black" data-testid="farm-coins"><Coin /> {coinFmt(p.coins)}</span>
    </button>
  );
}

export function FarmHub({ open, onOpenChange, f, tab, setTab }: { open: boolean; onOpenChange(o: boolean): void; f: Farm; tab: HubTab; setTab(t: HubTab): void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const cfg = f.config;
  const p = f.progress!;
  const items = f.items ?? {};
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!open) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [open]);
  const apply = (r: FarmProgressResult) => {
    const { items: newItems, ...rest } = r;
    const progress: FarmProgress = { level: rest.level, xp: rest.xp, level_xp: rest.level_xp, next_xp: rest.next_xp, coins: rest.coins, upgrades: rest.upgrades, upgrade_costs: rest.upgrade_costs, buildings: rest.buildings, orders: rest.orders, orders_left: rest.orders_left };
    qc.setQueryData(farmKey(f.id), (old: Farm | undefined) => old && ({ ...old, progress, items: newItems ?? old.items }));
    if (r.level_up) { confettiCannons(); toast.success(`🌾 Farm level ${rest.level}!`, { description: 'New crops, upgrades and buildings may have unlocked.' }); }
    void qc.invalidateQueries({ queryKey: farmKey(f.id) });
  };
  const run = async (key: string, fn: () => Promise<FarmProgressResult>, ok?: (r: FarmProgressResult) => void) => {
    setBusy(key);
    try { const r = await fn(); apply(r); ok?.(r); invalidateGame(qc); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const fillable = p.orders.filter((o) => o.ready && o.can_fill).length;
  const tabs: { k: HubTab; label: string; badge?: number }[] = [
    { k: 'orders', label: '📋 Orders', badge: fillable }, { k: 'upgrades', label: '⬆️ Upgrades' }, { k: 'buildings', label: '🏡 Buildings' }, { k: 'kitchen', label: '🍳 Kitchen' },
  ];
  const have = (k: string) => items[k] ?? 0;
  const Want = ({ wants, mult = 1 }: { wants: Record<string, number>; mult?: number }) => (
    <div className="flex flex-wrap gap-1">
      {Object.entries(wants).map(([k, n]) => {
        const it = itemInfo(cfg, k); const ok = have(k) >= n * mult;
        return <span key={k} title={it.name} className={cn('rounded-full px-2 py-0.5 text-xs font-bold', ok ? 'bg-ok/20 text-ok' : 'bg-surface-3 text-muted')}>{it.emoji} {have(k)}/{n * mult}</span>;
      })}
    </div>
  );
  const recipes = useMemo(() => Object.entries(cfg.recipes ?? {}), [cfg.recipes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="📈 Grow your farm" description={`Level ${p.level} · ${coinFmt(p.coins)} Farm Coins · ${p.xp - p.level_xp}/${p.next_xp - p.level_xp} XP to level ${p.level + 1}`}>
      <div className="grid gap-3" data-testid="farm-hub">
        <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} data-testid={`hub-tab-${t.k}`}
              className={cn('relative shrink-0 rounded-full px-3 py-1.5 text-xs font-bold', tab === t.k ? 'bg-accent text-white' : 'bg-surface-2 text-fg')}>
              {t.label}{t.badge ? <span className="ml-1 rounded-full bg-[#FF4D6D] px-1.5 text-[10px] text-white">{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'orders' && (
          <div className="grid gap-2" data-testid="hub-orders">
            <p className="text-xs text-muted">Customers pay far more than the market — in coins, XP and Ink. {p.orders_left} more orders today.</p>
            {p.orders.map((o) => {
              const wait = new Date(o.available_at).getTime() - now;
              return (
                <div key={o.slot} className="grid gap-2 rounded-2xl bg-surface-2 p-3" data-testid={`order-${o.slot}`}>
                  {!o.ready && wait > 0 ? (
                    <div className="flex items-center gap-2 text-sm text-muted">🚶 A new customer arrives in {Math.floor(wait / 60000)}:{String(Math.floor((wait % 60000) / 1000)).padStart(2, '0')}</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <Want wants={o.wants} />
                        <div className="shrink-0 text-right text-xs font-bold"><Coin /> {o.coins}<div className="flex items-center justify-end gap-0.5 text-muted">+{o.xp} XP · {o.ink} <ResourceIcon r="ink" className="h-3 w-3" /></div></div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="rainbow" className="flex-1" disabled={!o.can_fill || !p.orders_left} loading={busy === `order-${o.slot}`} data-testid={`order-fill-${o.slot}`}
                          onClick={() => run(`order-${o.slot}`, () => api.farmOrderFill(o.slot), (r) => toast.success(`Order filled! +${r.filled?.coins} 🪙 · +${r.filled?.xp} XP${r.filled?.ink ? ` · +${r.filled.ink} Ink` : ''}`))}>
                          {o.can_fill ? 'Deliver' : 'Not enough yet'}
                        </Button>
                        <Button size="sm" variant="secondary" loading={busy === `skip-${o.slot}`} onClick={() => run(`skip-${o.slot}`, () => api.farmOrderSkip(o.slot))}>Skip</Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'upgrades' && (
          <div className="grid gap-2" data-testid="hub-upgrades">
            {Object.entries(cfg.upgrades ?? {}).sort((a, b) => a[1].level - b[1].level).map(([k, u]) => {
              const lvl = p.upgrades[k] ?? 0; const cost = p.upgrade_costs[k]; const locked = p.level < u.level; const maxed = lvl >= u.max;
              return (
                <div key={k} className={cn('flex items-center gap-3 rounded-2xl bg-surface-2 p-3', locked && 'opacity-60')}>
                  <span className="text-3xl">{u.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{u.name} <span className="text-xs text-muted">{lvl}/{u.max}</span></div>
                    <div className="text-[11px] text-muted">{u.desc}</div>
                    <div className="mt-1 flex gap-0.5">{Array.from({ length: u.max }, (_, i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < lvl ? 'bg-ok' : 'bg-surface-3')} />)}</div>
                  </div>
                  {locked ? <span className="shrink-0 rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold">🔒 Lv {u.level}</span>
                    : maxed ? <span className="shrink-0 rounded-full bg-ok/20 px-2 py-1 text-[11px] font-bold text-ok">Max</span>
                    : <Button size="sm" variant={p.coins >= cost ? 'rainbow' : 'secondary'} disabled={p.coins < cost} loading={busy === `up-${k}`} data-testid={`upgrade-${k}`}
                        onClick={() => run(`up-${k}`, () => api.farmUpgrade(k), () => toast.success(`${u.emoji} ${u.name} → level ${lvl + 1}`))}><Coin /> {coinFmt(cost)}</Button>}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'buildings' && (
          <div className="grid gap-2" data-testid="hub-buildings">
            {Object.entries(cfg.buildings ?? {}).sort((a, b) => a[1].level - b[1].level).map(([k, b]) => {
              const s = p.buildings[k]; const lvl = s?.lvl ?? 0; const locked = p.level < b.level; const maxed = lvl >= b.max; const cost = s?.cost ?? b.build;
              const item = b.item ? itemInfo(cfg, b.item) : null;
              return (
                <div key={k} className={cn('grid gap-2 rounded-2xl bg-surface-2 p-3', locked && 'opacity-60')} data-testid={`building-${k}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{b.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{b.name} {lvl > 0 && <span className="text-xs text-muted">level {lvl}/{b.max}</span>}</div>
                      <div className="text-[11px] text-muted">
                        {item ? (lvl ? `Makes ${item.emoji} every ${s?.every_min} min · holds ${s?.cap}` : `Makes ${item.emoji} ${item.name.toLowerCase()} while you’re away`)
                          : k === 'mill' ? 'Grinds 🌽 corn into 🌾 flour' : 'Cook dishes from your produce — worth far more'}
                      </div>
                    </div>
                    {locked ? <span className="shrink-0 rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold">🔒 Lv {b.level}</span>
                      : maxed ? <span className="shrink-0 rounded-full bg-ok/20 px-2 py-1 text-[11px] font-bold text-ok">Max</span>
                      : <Button size="sm" variant={p.coins >= cost ? 'rainbow' : 'secondary'} disabled={p.coins < cost} loading={busy === `b-${k}`} data-testid={`build-${k}`}
                          onClick={() => run(`b-${k}`, () => api.farmBuild(k), () => toast.success(lvl ? `${b.emoji} ${b.name} upgraded` : `${b.emoji} ${b.name} built!`))}>{lvl ? 'Upgrade' : 'Build'} · <Coin /> {coinFmt(cost)}</Button>}
                  </div>
                  {item && lvl > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-[#FFC93D]" style={{ width: `${Math.min(100, ((s?.ready ?? 0) / Math.max(1, s?.cap ?? 1)) * 100)}%` }} /></div>
                      <Button size="sm" variant="secondary" disabled={!s?.ready} loading={busy === `c-${k}`} data-testid={`collect-${k}`}
                        onClick={() => run(`c-${k}`, () => api.farmCollect(k), (r) => toast.success(`Collected ${Object.entries(r.collected ?? {}).map(([i, n]) => `${n} ${itemInfo(cfg, i).emoji}`).join(' ')}`))}>
                        Collect {s?.ready ?? 0} {item.emoji}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'kitchen' && (
          <div className="grid gap-2" data-testid="hub-kitchen">
            <p className="text-xs text-muted">Combine your crops, eggs, honey and milk into dishes. Sell them, or use them for orders.</p>
            {recipes.map(([k, r]) => {
              const blvl = p.buildings[r.building]?.lvl ?? 0; const bInfo = cfg.buildings?.[r.building];
              const times = Math.min(50, ...Object.entries(r.needs).map(([i, n]) => Math.floor(have(i) / n)));
              return (
                <div key={k} className={cn('grid gap-2 rounded-2xl bg-surface-2 p-3', !blvl && 'opacity-60')} data-testid={`recipe-${k}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{r.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{r.name}{r.makes > 1 ? ` ×${r.makes}` : ''} <span className="text-xs font-normal text-muted">sells for {r.sell} 🪙</span></div>
                      <Want wants={r.needs} />
                    </div>
                    {!blvl ? <span className="shrink-0 rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold">Needs {bInfo?.emoji} {bInfo?.name.toLowerCase()}</span> : (
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button size="sm" variant="rainbow" disabled={times < 1} loading={busy === `cook-${k}`} data-testid={`cook-${k}`} onClick={() => run(`cook-${k}`, () => api.farmCraft(k, 1), () => toast.success(`${r.emoji} ${r.name} made!`))}>{r.building === 'mill' ? 'Mill' : 'Cook'}</Button>
                        {times > 1 && <Button size="sm" variant="secondary" loading={busy === `cookall-${k}`} onClick={() => run(`cookall-${k}`, () => api.farmCraft(k, times), (x) => toast.success(`${r.emoji} Made ${x.times} × ${r.name.toLowerCase()}`))}>All ×{times}</Button>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
