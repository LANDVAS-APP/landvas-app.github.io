// The Worlds button: on the map's side rail (next to + and Me), one tap to your home and your best place of every
// kind — your highest tier (a Domain over an Estate over the plain place) and, among those, your highest level — so
// ten farms show up as one Farm, the best one. Space and the Inkborn are there too; My plots lists everything.
// It lives on the map only: inside an arcade, a farm or a game there's nothing floating over the play.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { CanvasGroup } from '../backend/types';
import { qk } from '../lib/queries';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Dialog } from '../ui';
import { isRealm, REALM_META, realmRoute } from '../realms/kinds';
import { kindFamily, tierSize } from '../realms/estates/meta';

export type WorldPlace = {
  key: string; emoji: string; title: string; sub?: string; route: string;
  /** the kind it belongs to (a farm, its Ranch and its Kingdom are one family) */ family?: string;
  /** 0 plain, 2 Estate, 3 Domain */ tier?: number;
  /** the place's own level (arcades and realms), else its best plot's */ level?: number; plotLevel?: number; plots?: number;
  /** how many of this kind you have */ count?: number;
};

const named = (g: CanvasGroup) => (g.name && !/^untitled/i.test(g.name.trim()) ? g.name.trim() : undefined);

/** every place your plots have become (the same doors as the plot cards) */
export function placesOf(groups: CanvasGroup[]): WorldPlace[] {
  const out: WorldPlace[] = [];
  for (const g of groups) {
    if (g.status && g.status !== 'active') continue;
    const k = g.kind;
    const meta = { key: g.id, sub: named(g), family: k ? kindFamily(k) : 'canvas', tier: tierSize(k), level: Number(g.place_level ?? 0) || undefined,
      plotLevel: Math.max(1, ...(g.cells ?? []).map((c) => Number(c[3]) || 1)), plots: g.plot_count };
    // (an arcade's Carnival and Galaxy Park are that arcade, grown: they open the arcade)
    if (isRealm(k) && g.realm_id) out.push({ ...meta, emoji: REALM_META[k].emoji, title: REALM_META[k].name, route: kindFamily(k) === 'arcade' && g.arcade_id ? `/arcade/${g.arcade_id}` : realmRoute(g.realm_id) });
    else if (k === 'arcade' && g.arcade_id) out.push({ ...meta, emoji: '🕹️', title: 'Arcade', route: `/arcade/${g.arcade_id}` });
    else if (k === 'farm' && g.farm_id) out.push({ ...meta, emoji: '🌾', title: 'Farm', route: `/farm/${g.farm_id}` });
    else if (k === 'habitat' && g.habitat_id) out.push({ ...meta, emoji: '🐾', title: 'Sanctuary', route: `/habitat/${g.habitat_id}` });
    else if (k === 'business' && g.business_id) out.push({ ...meta, emoji: '🍋', title: 'Business', route: `/business/${g.business_id}` });
    else if (k === 'landlord') out.push({ ...meta, emoji: '🏘️', title: 'Estate', route: `/landlord/${g.id}` });
  }
  return out;
}

/** better first: the highest tier you've unlocked, then the highest level, then the best plot, then the biggest */
const rank = (a: WorldPlace, b: WorldPlace) => (b.tier ?? 0) - (a.tier ?? 0) || (b.level ?? 0) - (a.level ?? 0)
  || (b.plotLevel ?? 1) - (a.plotLevel ?? 1) || (b.plots ?? 1) - (a.plots ?? 1) || a.key.localeCompare(b.key);

/** one place per kind: your best of each */
export function bestPlaces(groups: CanvasGroup[]): WorldPlace[] {
  const fam = new Map<string, WorldPlace[]>();
  for (const p of placesOf(groups)) fam.set(p.family ?? p.key, [...(fam.get(p.family ?? p.key) ?? []), p]);
  const out = [...fam.values()].map((list) => {
    const best = [...list].sort(rank)[0];
    const bits = [best.tier === 3 ? 'Domain' : best.tier === 2 ? 'Estate' : null, best.level ? `Lv ${best.level}` : best.plotLevel && best.plotLevel > 1 ? `Plot lv ${best.plotLevel}` : null,
      list.length > 1 ? `best of ${list.length}` : best.sub ?? null].filter(Boolean);
    return { ...best, count: list.length, sub: bits.join(' · ') || undefined };
  });
  // the grandest first, then by name
  return out.sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || (b.level ?? 0) - (a.level ?? 0) || a.title.localeCompare(b.title));
}

/** the button on the map's side rail */
export function WorldsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={cn('lv-gbtn round lv-worlds-btn', className)} onClick={() => { buzz('light'); setOpen(true); }} aria-label="Worlds — go anywhere" data-testid="worlds-button">
        <span className="text-[22px] leading-none" aria-hidden>🌍</span><span className="lbl">Worlds</span>
      </button>
      <WorldsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

const here = (path: string, route: string) => path === route || path.startsWith(`${route}/`);

function WorldsSheet({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: open, staleTime: 30_000 });
  const places = useMemo(() => bestPlaces(groups.data ?? []), [groups.data]);
  const go = (route: string) => { onOpenChange(false); buzz('light'); if (!here(loc.pathname, route)) nav(route); };
  const Tile = ({ p, big }: { p: WorldPlace; big?: boolean }) => (
    <button onClick={() => go(p.route)} data-testid="world-go" data-route={p.route}
      className={cn('flex min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors active:scale-[0.98]', big ? 'border-accent/40 bg-accent/15' : 'border-line bg-surface-2/50')}>
      <span className={cn('grid shrink-0 place-items-center rounded-xl bg-black/25', big ? 'h-11 w-11 text-[26px]' : 'h-10 w-10 text-[21px]')} aria-hidden>{p.emoji}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <b className="block truncate text-[14px]">{p.title}</b>
        {p.sub && <span className="block truncate text-[11.5px] text-muted">{p.sub}</span>}
      </span>
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🌍 Worlds" description="Jump to your home, your best place of every kind, or further out.">
      <div className="grid gap-4" data-testid="worlds-sheet">
        <div className="grid grid-cols-2 gap-2">
          <Tile big p={{ key: 'home', emoji: '🏠', title: 'Home', sub: 'Your house', route: '/home' }} />
          <Tile big p={{ key: 'plots', emoji: '🗂️', title: 'My plots', sub: 'Every plot and place', route: '/plots' }} />
        </div>
        <section className="grid gap-2">
          <div className="eyebrow">Your places{places.length ? ` · ${places.length}` : ''}</div>
          {groups.isLoading ? <div className="h-14 animate-pulse rounded-2xl bg-surface-2/50" />
            : places.length ? <div className="grid grid-cols-2 gap-2" data-testid="worlds-places">{places.map((p) => <Tile key={p.key} p={p} />)}</div>
            : <button className="rounded-2xl border border-dashed border-line p-3 text-left text-[12.5px] text-muted" onClick={() => go('/plots')}>
                Give a plot a type — an Arcade, a Farm, a Sanctuary, a Business or a Realm — and it shows up here. <b className="text-fg">My plots →</b>
              </button>}
          {places.some((p) => (p.count ?? 1) > 1) && <p className="text-[11px] text-faint">One of each kind: your highest tier, then your highest level. My plots has the rest.</p>}
        </section>
        <section className="grid gap-2">
          <div className="eyebrow">Further out</div>
          <div className="grid grid-cols-2 gap-2">
            <Tile p={{ key: 'space', emoji: '🚀', title: 'Space', sub: 'Your rocket', route: '/space' }} />
            <Tile p={{ key: 'inkborn', emoji: '🐉', title: 'Inkborn', sub: 'Your creatures', route: '/inkborn' }} />
          </div>
        </section>
      </div>
    </Dialog>
  );
}
