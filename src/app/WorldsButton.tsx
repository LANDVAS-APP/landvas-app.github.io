// The Worlds button: one tap to anywhere — the map, your home, and every place your plots have become (arcades,
// farms, sanctuaries, businesses, realms, estates), plus your rocket and the Inkborn. It floats on the edge of every
// screen: drag it up or down (or across to the other side), and tuck it into the edge when it's in the way — a tap
// on the little tab brings it back. In games and the editor it starts tucked so it never covers the play.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../backend/api';
import type { CanvasGroup } from '../backend/types';
import { qk, useOnboardedMe } from '../lib/queries';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { buzz } from '../native/native';
import { Dialog, GameDisc } from '../ui';
import { isRealm, REALM_META, realmRoute } from '../realms/kinds';

type Spot = { y: number; side: 'left' | 'right'; tucked: boolean };
const KEY = 'landvas.worlds';
const DEFAULT: Spot = { y: 0.6, side: 'right', tucked: false }; // (the left edge is the app's swipe-back zone)
/** screens it never shows on (signed out, setting up) */
const NEVER = /^\/(welcome|onboarding|auth|reset-password|legal)(\/|$)|^\/$/;
/** screens where it starts tucked (games, the editor): it'd cover the play */
const PLAYING = /\/play\/|^\/play-sandbox|^\/pvp-sandbox|^\/create\/|^\/space\/planet\/|^\/brawl-demo|^\/inkborn\/playdate/;

/** a game is on screen somewhere (a cabinet, a live match, a party game): the button tucks itself away meanwhile */
const useWorldsAway = create<{ n: number; add(d: number): void }>((set) => ({ n: 0, add: (d) => set((s) => ({ n: Math.max(0, s.n + d) })) }));
export function useTuckWorlds(on: boolean) {
  useEffect(() => {
    if (!on) return;
    useWorldsAway.getState().add(1);
    return () => useWorldsAway.getState().add(-1);
  }, [on]);
}

export type WorldPlace = { key: string; emoji: string; title: string; sub?: string; route: string };

/** where each of your plots takes you (the same doors as the plot cards) */
export function placesOf(groups: CanvasGroup[]): WorldPlace[] {
  const out: WorldPlace[] = [];
  const name = (g: CanvasGroup) => (g.name && !/^untitled/i.test(g.name.trim()) ? g.name.trim() : undefined);
  for (const g of groups) {
    if (g.status && g.status !== 'active') continue;
    const k = g.kind;
    if (isRealm(k) && g.realm_id) out.push({ key: g.id, emoji: REALM_META[k].emoji, title: REALM_META[k].name, sub: name(g), route: g.arcade_id ? `/arcade/${g.arcade_id}` : realmRoute(g.realm_id) });
    else if (k === 'arcade' && g.arcade_id) out.push({ key: g.id, emoji: '🕹️', title: 'Arcade', sub: name(g), route: `/arcade/${g.arcade_id}` });
    else if (k === 'farm' && g.farm_id) out.push({ key: g.id, emoji: '🌾', title: 'Farm', sub: name(g), route: `/farm/${g.farm_id}` });
    else if (k === 'habitat' && g.habitat_id) out.push({ key: g.id, emoji: '🐾', title: 'Sanctuary', sub: name(g), route: `/habitat/${g.habitat_id}` });
    else if (k === 'business' && g.business_id) out.push({ key: g.id, emoji: '🍋', title: 'Business', sub: name(g), route: `/business/${g.business_id}` });
    else if (k === 'landlord') out.push({ key: g.id, emoji: '🏘️', title: 'Estate', sub: name(g), route: `/landlord/${g.id}` });
  }
  // the same kind together, and numbered when you have more than one
  out.sort((a, b) => a.title.localeCompare(b.title));
  const count: Record<string, number> = {}, seen: Record<string, number> = {};
  for (const p of out) count[p.title] = (count[p.title] ?? 0) + 1;
  for (const p of out) if (count[p.title] > 1) { seen[p.title] = (seen[p.title] ?? 0) + 1; if (!p.sub) p.sub = `#${seen[p.title]}`; }
  return out;
}

const here = (path: string, route: string) => path === route || (route !== '/world' && path.startsWith(`${route}/`));

export function WorldsButton() {
  const me = useOnboardedMe();
  const loc = useLocation();
  const [spot, setSpot] = useState<Spot>(() => ({ ...DEFAULT, ...safeStorage<Partial<Spot>>(KEY, {}) }));
  const [open, setOpen] = useState(false);
  // tucked for now (a game): opening it once shows it again on this screen
  const away = useWorldsAway((w) => w.n > 0);
  const playing = PLAYING.test(loc.pathname) || away;
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [loc.pathname, away]);
  const save = (s: Spot) => { setSpot(s); saveStorage(KEY, s); };
  const tucked = spot.tucked || (playing && !peek);
  // dragging: up and down along the edge; across the middle to switch sides; into the edge to tuck it away
  const drag = useRef<{ x0: number; y0: number; y: number; moved: boolean; id: number } | null>(null);
  const [live, setLive] = useState<{ y: number; dx: number } | null>(null);
  const clampY = (y: number) => Math.min(0.8, Math.max(0.14, y));
  const down = (e: React.PointerEvent) => {
    drag.current = { x0: e.clientX, y0: e.clientY, y: spot.y, moved: false, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    setLive({ y: clampY(d.y + dy / window.innerHeight), dx });
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (!d.moved) { setLive(null); buzz('light'); setOpen(true); return; }
    const dx = e.clientX - d.x0;
    const y = clampY(d.y + (e.clientY - d.y0) / window.innerHeight);
    const toEdge = spot.side === 'right' ? dx > 34 : dx < -34;
    const across = spot.side === 'right' ? e.clientX < window.innerWidth / 2 : e.clientX > window.innerWidth / 2;
    setLive(null);
    if (across) save({ ...spot, y, side: spot.side === 'right' ? 'left' : 'right' });
    else if (toEdge) { buzz('light'); save({ ...spot, y, tucked: true }); }
    else save({ ...spot, y });
  };
  if (!me || NEVER.test(loc.pathname)) return null;
  const y = live?.y ?? spot.y;
  const right = spot.side === 'right';
  const edge = right ? { right: 'max(6px, env(safe-area-inset-right, 0px))' } : { left: 'max(6px, env(safe-area-inset-left, 0px))' };
  const pull = live ? (right ? Math.max(0, live.dx) : Math.min(0, live.dx)) : 0;
  return createPortal(
    <>
      {tucked ? (
        <button className={cn('lv-worlds-tab', right ? 'r' : 'l')} style={{ top: `${y * 100}%`, ...(right ? { right: 0 } : { left: 0 }) }}
          onClick={() => { buzz('light'); if (spot.tucked) save({ ...spot, tucked: false }); else setPeek(true); }}
          aria-label="Show the Worlds button" data-testid="worlds-tab">
          {right ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}<span aria-hidden>🌍</span>
        </button>
      ) : (
        <div className="lv-worlds" style={{ top: `${y * 100}%`, ...edge, transform: `translate(${pull}px, -50%)`, opacity: Math.abs(pull) > 34 ? 0.55 : 1 }}>
          <GameDisc tone="violet" size={46} label="Worlds" className="touch-none select-none" onPointerDown={down} onPointerMove={move} onPointerUp={up}
            onPointerCancel={() => { drag.current = null; setLive(null); }} onClick={(e) => { if (e.detail === 0) setOpen(true); /* (the keyboard) */ }}
            aria-label="Worlds — go anywhere" data-testid="worlds-button">
            <span className="text-[22px] leading-none" aria-hidden>🌍</span>
          </GameDisc>
        </div>
      )}
      <WorldsSheet open={open} onOpenChange={setOpen} spot={spot} onSpot={save} />
    </>,
    document.body,
  );
}

function WorldsSheet({ open, onOpenChange, spot, onSpot }: { open: boolean; onOpenChange(o: boolean): void; spot: Spot; onSpot(s: Spot): void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: open, staleTime: 30_000 });
  const places = useMemo(() => placesOf(groups.data ?? []), [groups.data]);
  const go = (route: string) => { onOpenChange(false); buzz('light'); if (!here(loc.pathname, route)) nav(route); };
  const Tile = ({ p, big }: { p: WorldPlace; big?: boolean }) => {
    const at = here(loc.pathname, p.route);
    return (
      <button onClick={() => go(p.route)} data-testid="world-go" data-route={p.route}
        className={cn('flex min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors', big ? 'bg-accent/15 border-accent/40' : 'bg-surface-2/50 border-line', at && '!border-ok/60 !bg-ok/10')}>
        <span className={cn('grid shrink-0 place-items-center rounded-xl bg-black/25', big ? 'h-11 w-11 text-[26px]' : 'h-9 w-9 text-[20px]')} aria-hidden>{p.emoji}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-[14px]">{p.title}</b>
          <span className="block truncate text-[11.5px] text-muted">{at ? '📍 You’re here' : p.sub ?? ' '}</span>
        </span>
      </button>
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🌍 Worlds" description="Jump anywhere — your home, the map, and every place your plots have become.">
      <div className="grid gap-4" data-testid="worlds-sheet">
        <div className="grid grid-cols-2 gap-2">
          <Tile big p={{ key: 'world', emoji: '🗺️', title: 'Earth map', sub: 'Your plots and explorer', route: '/world' }} />
          <Tile big p={{ key: 'home', emoji: '🏠', title: 'Home', sub: 'Your house', route: '/home' }} />
        </div>
        <section className="grid gap-2">
          <div className="eyebrow">Your places{places.length ? ` · ${places.length}` : ''}</div>
          {groups.isLoading ? <div className="h-14 animate-pulse rounded-2xl bg-surface-2/50" />
            : places.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2" data-testid="worlds-places">{places.map((p) => <Tile key={p.key} p={p} />)}</div>
            : <button className="rounded-2xl border border-dashed border-line p-3 text-left text-[12.5px] text-muted" onClick={() => go('/plots')}>
                Give a plot a type — an Arcade, a Farm, a Sanctuary, a Business or a Realm — and it shows up here. <b className="text-fg">My plots →</b>
              </button>}
        </section>
        <section className="grid gap-2">
          <div className="eyebrow">Further out</div>
          <div className="grid grid-cols-2 gap-2">
            <Tile p={{ key: 'space', emoji: '🚀', title: 'Space', sub: 'Your rocket', route: '/space' }} />
            <Tile p={{ key: 'inkborn', emoji: '🐉', title: 'Inkborn', sub: 'Your creatures', route: '/inkborn' }} />
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line pt-3 text-[12px]">
          <button className="rounded-full bg-surface-2/60 px-3 py-1.5 font-bold" onClick={() => { onSpot({ ...spot, tucked: true }); onOpenChange(false); }} data-testid="worlds-tuck">Tuck the button away</button>
          <button className="rounded-full bg-surface-2/60 px-3 py-1.5 font-bold" onClick={() => onSpot({ ...spot, side: spot.side === 'right' ? 'left' : 'right' })} data-testid="worlds-side">Move it to the {spot.side === 'right' ? 'left' : 'right'}</button>
        </div>
        <p className="-mt-2 text-center text-[11px] text-faint">Drag the button to move it, or into the edge to tuck it away.</p>
      </div>
    </Dialog>
  );
}
