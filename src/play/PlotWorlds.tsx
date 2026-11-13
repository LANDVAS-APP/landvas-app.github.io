// The app's Play area: every world you own a plot of — arcades, farms, businesses, realms, sanctuaries, your home —
// with its games, what each pays in Ink, and today's Ink limit (or "no limit"). Your biggest one of each kind is the
// one you enter. Worlds whose Ink is maxed for today sink to the bottom.
import { useQueries, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { CanvasGroup } from '../backend/types';
import { qk, useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { REALM_META, isRealm } from '../realms/kinds';
import { ResourceIcon } from '../ui';

type Game = { key: string; emoji: string; name: string; maxInk: number | null; lockedUntil?: number; to?: string; note?: string };
type Info = { level?: number; today: number; cap: number | null; games: Game[] };
type World = { key: string; kind: string; name: string; emoji: string; color: string; enter: string; to: string; plots: number; fetch?: () => Promise<Info> };

const n = (v: unknown) => Number(v ?? 0) || 0;

function worldsFrom(groups: CanvasGroup[]): World[] {
  const best = new Map<string, CanvasGroup>();
  for (const g of groups) {
    const k = g.kind ?? 'canvas';
    const id = g.arcade_id || g.farm_id || g.business_id || g.realm_id || g.habitat_id || (k === 'home' ? 'home' : null);
    if (!id) continue;
    const kk = g.arcade_id ? 'arcade' : k;
    const cur = best.get(kk);
    if (!cur || g.plot_count > cur.plot_count) best.set(kk, g);
  }
  const out: World[] = [];
  for (const [kind, g] of best) {
    if (kind === 'arcade' && g.arcade_id) {
      const id = g.arcade_id;
      out.push({ key: `arcade:${id}`, kind, name: 'Arcade', emoji: '🕹️', color: '#FF4FD8', enter: 'Enter arcade', to: `/arcade/${id}`, plots: g.plot_count,
        fetch: async () => {
          const a = await api.arcadeGet(id);
          const games = Object.entries(a.games ?? {}).sort((x, y) => n(x[1].order) - n(y[1].order))
            .map(([key, gi]) => ({ key, emoji: gi.emoji, name: gi.name, maxInk: n(gi.max_ink) || null, lockedUntil: n(gi.level) > n(a.level?.level) ? n(gi.level) : undefined }));
          return { level: n(a.level?.level), today: n(a.me?.ink_today), cap: a.me?.daily_cap == null || n(a.me.daily_cap) <= 0 ? null : n(a.me.daily_cap), games };
        } });
    } else if (kind === 'farm' && g.farm_id) {
      const id = g.farm_id;
      out.push({ key: `farm:${id}`, kind, name: 'Farm', emoji: '🌾', color: '#3DDC97', enter: 'Enter farm', to: `/farm/${id}`, plots: g.plot_count,
        fetch: async () => {
          const f = await api.farmGet(id);
          const games = Object.entries(f.config?.games ?? {}).map(([key, gi]) => ({ key, emoji: gi.emoji, name: gi.name, maxInk: n(gi.max_ink) || null, to: `/farm/${id}/play/${key}` }));
          return { level: f.progress ? n((f.progress as { level?: number }).level) : undefined, today: n(f.ink_today), cap: n(f.config?.daily_cap) > 0 ? n(f.config.daily_cap) : null, games };
        } });
    } else if (kind === 'business' && g.business_id) {
      const id = g.business_id;
      out.push({ key: `biz:${id}`, kind, name: 'Business', emoji: '🍋', color: '#FFC93D', enter: 'Open business', to: `/business/${id}`, plots: g.plot_count,
        fetch: async () => {
          const b = await api.bizGet(id);
          const games = Object.entries(b.games ?? {}).map(([key, gi]) => ({ key, emoji: gi.emoji, name: gi.name, maxInk: n(gi.max_ink) || null, to: `/business/${id}/play/${key}` }));
          return { today: n(b.state?.ink_today), cap: n(b.state?.daily_cap) > 0 ? n(b.state!.daily_cap) : null, games };
        } });
    } else if (isRealm(kind) && g.realm_id) {
      const id = g.realm_id, m = REALM_META[kind];
      out.push({ key: `realm:${id}`, kind, name: m.name, emoji: m.emoji, color: m.color, enter: m.enter, to: `/realm/${id}`, plots: g.plot_count,
        fetch: async () => {
          const r = await api.realmGet(id);
          const games = Object.entries(r.cfg?.games ?? {}).map(([key, gi]) => ({ key, emoji: gi.emoji, name: gi.name, maxInk: null, note: 'Pays in finds', lockedUntil: n(gi.level) > n(r.level?.level) ? n(gi.level) : undefined }));
          return { level: n(r.level?.level), today: n(r.me?.ink_today), cap: n(r.me?.daily_cap) > 0 ? n(r.me.daily_cap) : null, games };
        } });
    } else if (kind === 'habitat' && g.habitat_id) {
      out.push({ key: `hab:${g.habitat_id}`, kind, name: 'Sanctuary', emoji: '🐾', color: '#34C3FF', enter: 'Enter sanctuary', to: `/habitat/${g.habitat_id}`, plots: g.plot_count });
    } else if (kind === 'home') {
      out.push({ key: 'home', kind, name: 'Your home', emoji: '🏠', color: '#FF8A5B', enter: 'Go home', to: '/home', plots: g.plot_count });
    }
  }
  return out;
}

export function PlotWorlds() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me, staleTime: 60_000 });
  const worlds = worldsFrom(groups.data ?? []);
  const infos = useQueries({ queries: worlds.map((w) => ({ queryKey: ['world-games', w.key], queryFn: w.fetch ?? (async () => null), enabled: !!w.fetch, staleTime: 120_000, retry: 0 })) });
  const [open, setOpen] = useState<string | null>(null);
  if (!worlds.length) return null;
  const rows = worlds.map((w, i) => ({ w, info: infos[i]?.data as Info | null | undefined }))
    // maxed for today sink to the bottom
    .sort((a, b) => Number(maxed(a.info)) - Number(maxed(b.info)));
  return (
    <section className="mb-6" data-testid="hub-plot-worlds">
      <h2 className="mb-2.5 px-0.5 font-display text-[17px] font-black">Your plot worlds</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {rows.map(({ w, info }, i) => {
          const isOpen = open === w.key, full = maxed(info);
          return (
            <motion.div key={w.key} layout className={cn('lv-worldcard', full && 'maxed')} style={{ ['--c' as string]: w.color }} data-testid={`world-${w.kind}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <div className="flex items-center gap-3">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { buzz('light'); setOpen(isOpen ? null : w.key); }} aria-expanded={isOpen} disabled={!w.fetch}>
                  <span className="lv-worldicon">{w.emoji}</span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-display text-[16px] font-black">{w.name}{info?.level ? <span className="ml-1.5 text-[11px] font-black text-white/50">LV {info.level}</span> : null}</span>
                    <span className="block truncate text-[11.5px] font-semibold text-white/55">{w.plots} plot{w.plots === 1 ? '' : 's'}{info ? ` · ${info.games.length} game${info.games.length === 1 ? '' : 's'}` : ''}</span>
                  </span>
                  {info && <InkLimit info={info} />}
                  {w.fetch && <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/40 transition', isOpen && 'rotate-180')} />}
                </button>
                <button className="lv-pgbtn play" onClick={() => { buzz('medium'); nav(w.to); }} data-testid={`world-enter-${w.kind}`}>{w.kind === 'home' ? 'Go' : 'Enter'}</button>
              </div>
              {isOpen && info && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                  <div className="mt-3 grid gap-1.5" data-testid="world-games">
                    {info.games.map((g) => (
                      <button key={g.key} className={cn('lv-worldgame', g.lockedUntil && 'locked')} onClick={() => { buzz('light'); nav(g.lockedUntil ? w.to : g.to ?? w.to); }}>
                        <span className="text-[20px] leading-none">{g.lockedUntil ? '🔒' : g.emoji}</span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold">{g.name}</span>
                        <span className="shrink-0 text-[11.5px] font-bold text-white/60 tnum">
                          {g.lockedUntil ? `Opens at LV ${g.lockedUntil}` : g.maxInk ? <span className="inline-flex items-center gap-1">up to <ResourceIcon r="ink" className="h-3.5 w-3.5" /> {fmt(g.maxInk)} a run</span> : g.note ?? 'Plays for fun'}
                        </span>
                      </button>
                    ))}
                    {!info.games.length && <div className="text-center text-[12px] text-white/50">No games here yet.</div>}
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

const maxed = (i: Info | null | undefined) => !!i && i.cap != null && i.today >= i.cap;

/** today's Ink: "120 / 400" with a little bar, or "No limit" */
function InkLimit({ info }: { info: Info }) {
  if (info.cap == null) return <span className="lv-inklimit nolimit" data-testid="ink-nolimit">No limit</span>;
  const pct = Math.min(100, (info.today / Math.max(1, info.cap)) * 100);
  return (
    <span className={cn('lv-inklimit', pct >= 100 && 'full')} data-testid="ink-limit">
      <span className="inline-flex items-center gap-1 tnum"><ResourceIcon r="ink" className="h-3 w-3" />{pct >= 100 ? 'Maxed' : `${fmt(info.today)}/${fmt(info.cap)}`}</span>
      <i><b style={{ width: `${pct}%` }} /></i>
    </span>
  );
}
