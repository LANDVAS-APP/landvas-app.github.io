// Out on a world: the storm (when it's blowing, and when the next one comes), the aliens hiding round the
// landing site, and places to discover. The chips sit in the planet's chip row; the sheet is your alien codex
// and what's left to find here, with how far the nearest ones are.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Discoveries } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Dialog } from '../ui';
import { confettiCannons } from '../ui/confetti';
import type { FindKind, FindMark, PlanetScene } from './planet3d';
import { poll } from '../lib/poll';

const RARITY: Record<string, string> = { common: '#B8C0D8', uncommon: '#4FD18B', rare: '#5CA8FF', legendary: '#FFB13D' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const angle = (a: number[], b: number[]) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

export function useDiscoveries(world: string, ready: boolean, scene: React.RefObject<PlanetScene | null>) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['discoveries', world], queryFn: () => api.planetDiscoveries(world), enabled: ready, refetchInterval: poll(20_000) });
  const d = q.data;
  // refetch the moment a storm starts or ends
  useEffect(() => {
    if (!d?.enabled) return;
    const at = new Date(d.weather.active ? d.weather.ends : d.weather.starts).getTime() - Date.now();
    if (at <= 0 || at > 3_600_000) return;
    const t = setTimeout(() => void q.refetch(), at + 800);
    return () => clearTimeout(t);
  }, [d?.weather.active, d?.weather.starts, d?.weather.ends]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sc = scene.current; if (!ready || !sc || !d?.enabled) return;
    sc.setWeather(d.weather.active ? d.weather.kind : null);
    const marks: FindMark[] = [
      ...(d.weather.active ? d.weather.shards.map((s) => ({ id: `shard:${d.weather.win}:${s.i}`, kind: 'shard' as const, i: s.i, d: s.d, found: s.taken, storm: d.weather.kind, rare: s.rare })) : []),
      ...d.aliens.map((a) => ({ id: `alien:${a.i}:${a.species.id}`, kind: 'alien' as const, i: a.i, d: a.d, found: a.found, species: a.species.id, rarity: a.species.rarity })),
      ...d.pois.map((p) => ({ id: `poi:${p.i}`, kind: 'poi' as const, i: p.i, d: p.d, found: p.found, poi: p.kind })),
    ];
    sc.setFinds(marks);
  }, [ready, d, scene]);

  const busy = useRef(new Set<string>());
  const farUntil = useRef(new Map<string, number>()); // after "too far", wait a moment before trying that one again
  const find = async (kind: FindKind, i: number) => {
    const key = `${kind}:${i}`;
    if (busy.current.has(key) || !d || (farUntil.current.get(key) ?? 0) > Date.now()) return;
    busy.current.add(key);
    let far = false;
    try {
      const r = await api.planetFind(world, kind, i, scene.current?.pose().d ?? null);
      const at = kind === 'shard' ? d.weather.shards.find((s) => s.i === i)?.d : kind === 'alien' ? d.aliens.find((a) => a.i === i)?.d : d.pois.find((p) => p.i === i)?.d;
      if (at) scene.current?.burst(at, kind === 'alien' ? '#9FFFD0' : kind === 'shard' ? '#FFE36B' : '#B69CFF');
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['dig'] }); void qc.invalidateQueries({ queryKey: ['base-catalog'] });
      const items = Object.entries(r.items ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
      const ink = r.paid > 0 ? ` · +${r.paid} Ink` : '';
      if (kind === 'alien') {
        const sp = r.species;
        if (r.new_species) confettiCannons();
        toast.success(r.new_species ? `New species! ${sp?.emoji ?? '👽'} ${sp?.name ?? 'Alien'}` : `Found a ${sp?.name ?? 'alien'} ${sp?.emoji ?? '👽'}`, { description: `${r.new_species ? 'Added to your alien codex' : 'Another one for your codex'}${ink}`, duration: 3200 });
      } else if (kind === 'poi') {
        const pk = d.poi_kinds[r.poi ?? ''];
        toast.success(`${pk?.emoji ?? '🔍'} ${pk?.name ?? 'Discovery'} investigated!`, { description: `${items || 'Nothing left to take'}${ink}`, duration: 3200 });
      } else toast.success(`Storm shard! ${d.weather.emoji}`, { description: `${items}${ink}`, duration: 2400 });
    } catch (e) {
      const err = toGameError(e);
      if (err.code === 'too_far') { far = true; farUntil.current.set(key, Date.now() + 8000); } else toast(err.message, { duration: 1800 });
    } finally {
      busy.current.delete(key);
      if (!far) void q.refetch();
    }
  };
  return { data: d, find, refetch: q.refetch };
}

/** The storm chip: blowing now (shards left, time left), or when the next one rolls in. */
export function StormChip({ d, onOpen }: { d: Discoveries | undefined; onOpen(): void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!d?.enabled) return null;
  const w = d.weather;
  const left = Math.max(0, (new Date(w.active ? w.ends : w.starts).getTime() - now) / 1000);
  const shards = w.shards.filter((s) => !s.taken).length;
  return (
    <button onClick={onOpen} className={cn('pointer-events-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]', w.active ? 'animate-pulse bg-[#5C6BFF]/85' : 'bg-black/50')} data-testid="storm-chip">
      {w.emoji} {w.active ? `${w.name}${shards ? ` · ${shards} shards` : ''} · ${mmss(left)}` : `${w.name} in ${left > 3600 ? '1h+' : mmss(left)}`}
    </button>
  );
}

/** The finds chip: how many aliens and places are left round here. */
export function FindsChip({ d, onOpen }: { d: Discoveries | undefined; onOpen(): void }) {
  if (!d?.enabled) return null;
  const aliens = d.aliens.filter((a) => !a.found).length, places = d.pois.filter((p) => !p.found).length;
  return (
    <button onClick={onOpen} className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px]" data-testid="finds-chip">
      🔍 {aliens} 👽 · {places} places
    </button>
  );
}

export function DiscoveriesDialog({ d, open, onOpenChange, worldName, pose, R }: {
  d: Discoveries | undefined; open: boolean; onOpenChange(o: boolean): void; worldName: string; pose: () => number[] | null; R: number;
}) {
  const [tab, setTab] = useState<'here' | 'codex'>('here');
  if (!d?.enabled) return null;
  const me = pose();
  const far = (x: number[]) => (me ? Math.round(angle(me, x) * R) : null);
  const left = [
    ...d.weather.shards.filter((s) => !s.taken && d.weather.active).map((s) => ({ key: `s${s.i}`, emoji: s.rare ? '🌟' : d.weather.emoji, name: s.rare ? 'Rare storm shard' : 'Storm shard', m: far(s.d) })),
    ...d.aliens.filter((a) => !a.found).map((a) => ({ key: `a${a.i}`, emoji: '❔', name: 'Something hiding…', m: far(a.d) })),
    ...d.pois.filter((p) => !p.found).map((p) => ({ key: `p${p.i}`, emoji: d.poi_kinds[p.kind]?.emoji ?? '🔍', name: d.poi_kinds[p.kind]?.name ?? p.kind, m: far(p.d) })),
  ].sort((a, b) => (a.m ?? 1e9) - (b.m ?? 1e9));
  const found = Object.keys(d.codex).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Discoveries on ${worldName}`} description="Storm shards blow in with each storm, aliens hide somewhere new every day, and places stay put until you’ve investigated them. Walk right up to anything to find it.">
      <div className="mb-3 flex gap-1.5" role="tablist">
        {(['here', 'codex'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`disc-tab-${t}`}
            className={cn('flex-1 rounded-xl px-3 py-2 text-sm font-bold', tab === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>
            {t === 'here' ? 'Round here' : `Alien codex · ${found}/${d.species.length}`}
          </button>
        ))}
      </div>
      {tab === 'here' ? (
        <div className="space-y-3" data-testid="disc-here">
          <div className="rounded-2xl bg-[var(--bg-3)] p-3 text-sm">
            <div className="font-bold">{d.weather.emoji} {d.weather.name}{d.weather.active ? ' — blowing now!' : ''}</div>
            <div className="text-xs text-[var(--fg-2)]">{d.weather.active
              ? `Grab the glowing shards round the landing site before it passes: ${d.weather_kinds[d.weather.kind]?.item ?? ''}, and rarely ${d.weather_kinds[d.weather.kind]?.rare ?? ''}.`
              : `Next one at ${new Date(d.weather.starts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Storms here scatter ${d.weather_kinds[d.weather.kind]?.item ?? 'materials'} shards.`}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-[var(--bg-3)] p-2"><div className="text-lg font-bold">{d.aliens.filter((a) => a.found).length}/{d.aliens.length}</div>aliens found today</div>
            <div className="rounded-xl bg-[var(--bg-3)] p-2"><div className="text-lg font-bold">{d.pois.filter((p) => p.found).length}/{d.pois.length}</div>places investigated</div>
            <div className="rounded-xl bg-[var(--bg-3)] p-2"><div className="text-lg font-bold">{d.weather.shards.filter((s) => s.taken).length}/{d.weather.active ? d.weather.shards.length : 0}</div>storm shards</div>
          </div>
          <div className="max-h-[38vh] space-y-1 overflow-y-auto" data-testid="disc-list">
            {left.slice(0, 30).map((x) => (
              <div key={x.key} className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2 text-sm">
                <span className="text-lg">{x.emoji}</span><span className="flex-1">{x.name}</span>
                {x.m != null && <span className="text-xs font-bold text-[var(--fg-2)]">{x.m < 1000 ? `${x.m} m` : `${(x.m / 1000).toFixed(1)} km`}</span>}
              </div>
            ))}
            {!left.length && <div className="py-4 text-center text-sm text-[var(--fg-2)]">You’ve found everything round here for now. New aliens hide tomorrow!</div>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="disc-codex">
          {d.species.map((s) => {
            const n = d.codex[s.id] ?? 0;
            return (
              <div key={s.id} className="rounded-2xl border-2 bg-[var(--bg-3)] p-2 text-center" style={{ borderColor: n ? RARITY[s.rarity] : 'transparent' }}>
                <div className={cn('text-3xl', !n && 'opacity-30 grayscale')}>{n ? s.emoji : '❔'}</div>
                <div className="truncate text-xs font-bold">{n ? s.name : '???'}</div>
                <div className="text-[10px] capitalize" style={{ color: RARITY[s.rarity] }}>{s.rarity}{n ? ` · ×${n}` : ''}</div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
