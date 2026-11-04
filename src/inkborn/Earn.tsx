// Ways Inkborn earn Ink: the habitat's Ink Spring, jobs, and games played as the creature.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Gamepad2, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Inkborn } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, ResourceIcon } from '../ui';
import { GAMES, type GameId } from './games/engines';
import { AdButton } from '../ads/AdButton';

export const useInkEconomy = (on = true) => useQuery({ queryKey: ['inkborn-economy'], queryFn: api.inkbornEconomy, enabled: on, staleTime: 30_000 });

const JOB_ICONS: Record<string, string> = { forage: '🫐', explore: '🧭', quest: '🗺️' };
export const jobLabel = (job: string) => ({ forage: 'foraging', explore: 'exploring', quest: 'on a quest', expedition: 'on an expedition' } as Record<string, string>)[job] ?? 'away';

function useNow(ms = 1000) {
  const [now, set] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
export const left = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

/** Jobs and games for one creature (its keeper only). */
export function CreatureWork({ c, onChanged, compact }: { c: Inkborn; onChanged?(c: Inkborn): void; compact?: boolean }) {
  const eco = useInkEconomy();
  const qc = useQueryClient();
  const nav = useNavigate();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<'jobs' | 'games' | null>(null);
  const refresh = () => { invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['sanctuaries'] }); void qc.invalidateQueries({ queryKey: ['inkborn-economy'] }); void qc.invalidateQueries({ queryKey: ['habitat'] }); };
  const run = async (k: string, f: () => Promise<Inkborn & { paid?: number; capped?: boolean }>) => {
    setBusy(k);
    try {
      const r = await f();
      if (typeof r.paid === 'number') toast.success(`${c.name} is back! +${r.paid} Ink`, { description: r.capped ? 'You’ve reached today’s Inkborn Ink limit.' : 'Bond +2 for a job well done.' });
      onChanged?.(r); refresh(); setPick(null);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  if (c.job === 'expedition' && c.job_until) {
    const home = new Date(c.job_until).getTime() <= now;
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-2 text-xs" data-testid="job-status">
        <span className="text-lg">🧭</span>
        <div className="min-w-0 flex-1"><b>{home ? `${c.name}’s team is home!` : `${c.name} is on an expedition`}</b><div className="text-white/60">{home ? 'Welcome them home in the Keeper’s Lodge.' : `Back in ${left(c.job_until, now)}`}</div></div>
        <Button size="sm" variant={home ? 'rainbow' : 'secondary'} onClick={() => nav('/inkborn/keeper')}>Lodge</Button>
      </div>
    );
  }
  if (c.job && c.job_until) {
    const done = new Date(c.job_until).getTime() <= now;
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-2 text-xs" data-testid="job-status">
        <span className="text-lg">{JOB_ICONS[c.job] ?? '🎒'}</span>
        <div className="min-w-0 flex-1"><b>{done ? `${c.name} is back!` : `${c.name} is ${jobLabel(c.job)}`}</b><div className="text-white/60">{done ? 'They brought something back.' : `Back in ${left(c.job_until, now)}`}</div></div>
        {done ? <Button size="sm" variant="rainbow" loading={busy === 'claim'} onClick={() => void run('claim', () => api.inkbornJobClaim(c.id))} data-testid="job-claim">Collect</Button>
          : <AdButton reward="job_rush" refId={c.id} label="Ad: home now" done={`${c.name} hurried home!`} className="px-2.5 py-1.5 text-[11px]" onDone={() => onChanged?.({ ...c, job_until: new Date().toISOString() })} />}
      </div>
    );
  }
  const jobs = Object.entries(eco.data?.jobs ?? {});
  const games = (Object.keys(GAMES) as GameId[]).filter((g) => eco.data?.games[g]?.enabled !== false);
  return (
    <div className="grid gap-1.5">
      <div className={cn('grid grid-cols-2 gap-1.5', compact && 'text-[11px]')}>
        <button onClick={() => setPick(pick === 'jobs' ? null : 'jobs')} className={cn('flex items-center justify-center gap-1.5 rounded-2xl py-2 text-xs font-bold', pick === 'jobs' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20')} data-testid="open-jobs"><Timer className="h-4 w-4" /> Send on a job</button>
        <button onClick={() => setPick(pick === 'games' ? null : 'games')} className={cn('flex items-center justify-center gap-1.5 rounded-2xl py-2 text-xs font-bold', pick === 'games' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20')} data-testid="open-games"><Gamepad2 className="h-4 w-4" /> Play as {c.name}</button>
      </div>
      {pick && c.energy < 30 && <AdButton reward="inkborn_energy" refId={c.id} label={`Ad: wake ${c.name} up (+energy)`} done={`${c.name} is full of beans!`} onDone={(r) => onChanged?.({ ...c, energy: Number(r.energy ?? c.energy) })} />}
      {pick === 'jobs' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-1.5">
          {jobs.map(([k, j]) => {
            const tired = c.energy < j.energy;
            return (
              <button key={k} disabled={tired || !!busy} onClick={() => void run(k, () => api.inkbornJobStart(c.id, k))} data-testid={`job-${k}`}
                className="flex items-center gap-2 rounded-2xl bg-white/10 p-2 text-left text-xs hover:bg-white/20 disabled:opacity-50">
                <span className="text-lg">{JOB_ICONS[k] ?? '🎒'}</span>
                <span className="min-w-0 flex-1"><b>{j.label}</b><span className="block text-white/60">{j.minutes >= 60 ? `${j.minutes / 60}h` : `${j.minutes}m`} · ⚡{j.energy}{tired ? ' — too tired' : ''}</span></span>
                <span className="flex items-center gap-1 font-bold"><ResourceIcon r="ink" className="h-3.5 w-3.5" />{j.ink}+</span>
              </button>
            );
          })}
        </motion.div>
      )}
      {pick === 'games' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-1.5">
          {games.map((g) => (
            <button key={g} onClick={() => nav(`/inkborn/play/${g}/${c.id}`)} data-testid={`game-${g}`} className="grid gap-0.5 rounded-2xl bg-white/10 p-2 text-left text-xs hover:bg-white/20" style={{ boxShadow: `inset 0 0 0 1px ${GAMES[g].color}55` }}>
              <span className="text-lg">{GAMES[g].emoji}</span><b>{GAMES[g].name}</b><span className="flex items-center gap-1 text-white/60">up to <ResourceIcon r="ink" className="h-3 w-3" />{eco.data?.games[g]?.max_ink ?? 25}</span>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/** The habitat's Ink Spring: what's ready, and a button to collect it. */
export function SpringPill({ habitatId, onCollected }: { habitatId: string; onCollected?(paid: number): void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['spring', habitatId], queryFn: () => api.habitatSpring(habitatId), refetchInterval: 60_000 });
  const [busy, setBusy] = useState(false);
  const s = q.data;
  if (!s || !s.enabled) return null;
  const collect = async () => {
    setBusy(true);
    try {
      const r = await api.habitatCollect(habitatId);
      qc.setQueryData(['spring', habitatId], r);
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['inkborn-economy'] });
      if (r.paid > 0) { toast.success(`+${r.paid} Ink from the Ink Spring`, { description: r.capped ? 'You’ve reached today’s Inkborn Ink limit.' : undefined }); onCollected?.(r.paid); }
      else toast('The spring is still filling — happy creatures fill it faster.');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="grid justify-items-end gap-1.5">
    <button onClick={collect} disabled={busy} data-testid="spring-pill"
      className={cn('flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-bold', s.ready > 0 ? 'bg-[#6A4CFF]/80 shadow-[0_0_24px_-4px_#8B6CFF]' : 'bg-black/55')}
      title={`${s.happy} happy creature${s.happy === 1 ? '' : 's'} and ${s.springs} Ink Spring${s.springs === 1 ? '' : 's'} make ${s.rate} Ink an hour (fills for up to 12 hours)`}>
      <span>🫧</span>
      <span className="text-left leading-tight">{s.ready > 0 ? <>Collect {s.ready} Ink</> : <>Ink Spring</>}<span className="block text-[10px] font-normal text-white/70">{s.rate} Ink/hour</span></span>
    </button>
    {s.rate > 0 && s.full_in_hours > 2 && <AdButton reward="spring_boost" refId={habitatId} label="Ad: +2h of Ink" done="The spring bubbles over!" className="px-2.5 py-1.5 text-[11px]" />}
    </div>
  );
}
