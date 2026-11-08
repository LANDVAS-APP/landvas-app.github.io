// Find your way round: every plot you own — on Earth and on every world — with one tap to warp there; who's on
// this world with you right now (tap to go to them); and every world with how many plots are claimed on it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlanetHere, SpaceState } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Z_PLOT, cellCenter } from '../shared/grid';
import { Dialog, PlayerAvatar, Spinner } from '../ui';
import { savePose } from './live';
import { PlanetBall } from './PlanetBall';
import { cellCenterDir } from './planetGrid';
import { SPACE_KEY, useSpace } from './useSpace';
import { WORLD_ORDER, worldOf } from './worlds';
import { poll } from '../lib/poll';

const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const ang = (a: number[], b: number[]) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
const order = (w: string) => { const i = (WORLD_ORDER as readonly string[]).indexOf(w); return i < 0 ? 99 : i; };

/** Go somewhere: a plot on a world (warping there first if you're elsewhere), or a plot on Earth. */
export function useGoTo(here?: { world: string; go(d: number[]): void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const space = useSpace();
  const warp = async (dest: string) => {
    const s = space.data as SpaceState | undefined;
    if (!s || s.location === dest) return true;
    const key = s.home_seed != null && dest === `exo:${s.home_seed}` ? 'home' : dest;
    try { const r = await api.spaceLaunch(key); qc.setQueryData(SPACE_KEY, r); invalidateGame(qc); return true; }
    catch (e) { toast.error(toGameError(e).message); return false; }
  };
  return {
    planet: async (p: { world: string; gx: number; gy: number; rows: number; name?: string | null }) => {
      const d = cellCenterDir(p, p.rows) as number[];
      if (here && here.world === p.world) { here.go(d); toast(`📍 ${p.name || 'Your plot'}`); return; }
      savePose(p.world, { d, face: [0, 1, 0], hop: 0 });
      if (!(await warp(p.world))) return;
      toast.success(`⚡ Warped to ${p.name || 'your plot'} on ${worldOf(p.world)?.name ?? 'your world'}`);
      nav('/world');
    },
    earth: async (p: { gx: number; gy: number; name?: string | null }) => {
      if (!(await warp('earth'))) return;
      const [lng, lat] = cellCenter(p.gx, p.gy);
      useUi.getState().requestFly({ lng, lat, zoom: Z_PLOT }); useUi.getState().select({ gx: p.gx, gy: p.gy });
      nav('/world');
    },
    world: async (w: string) => { if (await warp(w)) { toast.success(`⚡ Warped to ${worldOf(w)?.name ?? w}`); nav('/world'); } },
  };
}

export function PlacesSheet({ open, onOpenChange, here, start = 'plots' }: {
  open: boolean; onOpenChange(o: boolean): void; start?: 'plots' | 'people' | 'worlds';
  /** on a world's surface: where you are, and how to move there */ here?: { world: string; go(d: number[]): void; pose(): number[] | null; R: number };
}) {
  const [tab, setTab] = useState<'plots' | 'people' | 'worlds'>(start);
  const space = useSpace();
  const s = space.data;
  const go = useGoTo(here);
  const ov = useQuery({ queryKey: ['planet-overview'], queryFn: api.planetOverview, enabled: open, refetchInterval: open ? poll(20_000) : false });
  const earth = useQuery({ queryKey: ['my-plots'], queryFn: api.myPlots, enabled: open && tab === 'plots', staleTime: 30_000 });
  const ppl = useQuery({ queryKey: ['planet-here', here?.world], queryFn: () => api.planetHere(here!.world), enabled: open && !!here, refetchInterval: open ? 5000 : false });
  const tabs = ([['plots', '📍 My plots'], ...(here ? [['people', `👥 Here now${ppl.data ? ` · ${ppl.data.length}` : ''}`]] : []), ['worlds', '🪐 Worlds']] as [typeof tab, string][]);
  const me = here?.pose() ?? null;
  const byWorld = new Map<string, NonNullable<typeof ov.data>['plots']>();
  for (const p of ov.data?.plots ?? []) { if (!byWorld.has(p.world)) byWorld.set(p.world, []); byWorld.get(p.world)!.push(p); }
  const worldName = (w: string) => (w === 'earth' ? 'Earth' : s && w === `exo:${s.home_seed}` ? s.home_name ?? 'Home' : worldOf(w)?.name ?? w);
  const earthPlots = (earth.data ?? []) as { gx: number; gy: number; name: string | null; rarity: string }[];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Places" description="Your plots everywhere, who’s here with you, and every world. Tap to go — warps are free and instant.">
      <div className="mb-3 flex gap-1.5" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`places-tab-${k}`}
            className={cn('flex-1 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-bold', tab === k ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>{l}</button>
        ))}
      </div>
      {tab === 'plots' && (
        <div className="grid max-h-[55vh] gap-3 overflow-y-auto" data-testid="places-plots">
          {(ov.isLoading || earth.isLoading) && <div className="grid place-items-center py-6"><Spinner /></div>}
          {earthPlots.length > 0 && (
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2 text-xs font-bold"><span className="text-lg">🌍</span> Earth <span className="ml-auto font-normal text-[var(--fg-2)]">{earthPlots.length}</span></div>
              {earthPlots.map((p) => (
                <button key={`e${p.gx}:${p.gy}`} onClick={() => { onOpenChange(false); void go.earth(p); }} data-testid="places-earth-plot"
                  className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2 text-left text-sm hover:brightness-110">
                  <MapPin className="h-4 w-4 shrink-0 text-[var(--fg-2)]" /><span className="min-w-0 flex-1 truncate font-semibold">{p.name || 'Plot'}</span>
                  <span className="text-[11px] capitalize text-[var(--fg-2)]">{p.rarity}</span><span className="text-[11px] font-bold text-[var(--accent)]">Go</span>
                </button>
              ))}
            </div>
          )}
          {[...byWorld.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([w, plots]) => (
            <div key={w} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-xs font-bold"><PlanetBall w={worldOf(w, s?.home_seed, s?.home_name)} size={20} /> {worldName(w)}{here?.world === w && <span className="rounded-full bg-[#4FD18B]/25 px-1.5 text-[10px] text-[#4FD18B]">you’re here</span>}<span className="ml-auto font-normal text-[var(--fg-2)]">{plots.length}</span></div>
              {plots.map((p) => {
                const d = here?.world === w && me ? Math.round(ang(me, cellCenterDir(p, p.rows) as number[]) * here.R) : null;
                return (
                  <button key={`${w}${p.gx}:${p.gy}`} onClick={() => { onOpenChange(false); void go.planet(p); }} data-testid="places-planet-plot"
                    className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2 text-left text-sm hover:brightness-110">
                    <MapPin className="h-4 w-4 shrink-0 text-[var(--fg-2)]" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name || 'Plot'}{p.base ? <span className="ml-1 text-[11px] font-normal text-[var(--fg-2)]">· base, {p.base} pieces</span> : null}</span>
                    <span className="text-[11px] capitalize text-[var(--fg-2)]">{d != null ? dist(d) : p.rarity}</span>
                    <span className="text-[11px] font-bold text-[var(--accent)]">{here?.world === w ? 'Go' : 'Warp'}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!ov.isLoading && !earth.isLoading && !earthPlots.length && !byWorld.size && <p className="py-4 text-center text-sm text-[var(--fg-2)]">No plots yet — claim one on Earth or on any world you land on.</p>}
        </div>
      )}
      {tab === 'people' && here && (
        <div className="grid max-h-[55vh] gap-1.5 overflow-y-auto" data-testid="places-people">
          {ppl.isLoading && <div className="grid place-items-center py-6"><Spinner /></div>}
          {(ppl.data ?? [] as PlanetHere).map((x) => {
            const m = me ? Math.round(ang(me, x.d) * here.R) : null;
            return (
              <div key={x.player.id} className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2 text-sm">
                <PlayerAvatar p={x.player} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">@{x.player.username}{x.friend && <span className="ml-1 text-[10px] text-[#FFB13D]">★ friend</span>}</div>
                  <div className="text-[11px] text-[var(--fg-2)]">{x.with_you ? 'In your group' : 'Exploring'}{m != null ? ` · ${dist(m)} away` : ''}</div>
                </div>
                <button onClick={() => { onOpenChange(false); here.go(x.d); toast(`👋 You went over to @${x.player.username}`); }} data-testid="places-go-to-player"
                  className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white">Go to</button>
              </div>
            );
          })}
          {ppl.data && !ppl.data.length && <p className="py-4 text-center text-sm text-[var(--fg-2)]"><Users className="mx-auto mb-1 h-5 w-5" />Nobody else is on this world right now.</p>}
        </div>
      )}
      {tab === 'worlds' && (
        <div className="grid max-h-[55vh] gap-1.5 overflow-y-auto" data-testid="places-worlds">
          {ov.isLoading && <div className="grid place-items-center py-6"><Spinner /></div>}
          {[...(ov.data?.worlds ?? [])].sort((a, b) => order(a.world) - order(b.world)).map((x) => {
            const can = !!s?.warps?.includes(x.world) || (s?.home_seed != null && x.world === `exo:${s.home_seed}`);
            const at = s?.location === x.world;
            return (
              <div key={x.world} className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2 text-sm" data-testid={`places-world-${x.world}`}>
                <PlanetBall w={worldOf(x.world, s?.home_seed, s?.home_name)} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{worldName(x.world)}</div>
                  <div className="text-[11px] text-[var(--fg-2)]">{x.claimed.toLocaleString()} of {(x.rows * x.cols).toLocaleString()} plots claimed{x.mine ? ` · ${x.mine} yours` : ''}</div>
                </div>
                {x.here_now > 0 && <span className="flex items-center gap-1 rounded-full bg-[#4FD18B]/20 px-2 py-0.5 text-[11px] font-bold text-[#4FD18B]"><span className="h-1.5 w-1.5 rounded-full bg-[#4FD18B]" />{x.here_now}</span>}
                {at ? <span className="text-[11px] font-bold text-[#4FD18B]">Here</span> : (
                  <button disabled={!can} onClick={() => { onOpenChange(false); void go.world(x.world); }} title={can ? 'Warp there' : 'Fly there first from Mission control'}
                    className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', can ? 'bg-[var(--accent)] text-white' : 'bg-white/10 text-[var(--fg-2)]')}>{can ? 'Warp' : '🔒'}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
