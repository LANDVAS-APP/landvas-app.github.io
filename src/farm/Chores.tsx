// The farm's daily chores: a short, calm to-do list. Tap chores take a few peaceful seconds; farming
// chores tick along as you plant, water, harvest and sell. Each pays a little Ink, and all of them a bonus.
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Farm, FarmChore, FarmChores } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, Dialog, ResourceIcon } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { farmKey } from './FarmScreen';

export const choresLeft = (c?: FarmChores) => (c ? c.list.filter((x) => !x.done).length : 0);
export const choresReady = (c?: FarmChores) => (c ? c.list.filter((x) => x.ready && x.kind === 'count').length : 0);

export function ChoresDialog({ open, onOpenChange, f, haptics }: { open: boolean; onOpenChange(o: boolean): void; f: Farm; haptics?: boolean }) {
  const qc = useQueryClient();
  const chores = f.progress?.chores;
  const [doing, setDoing] = useState<{ key: string; t0: number; secs: number } | null>(null);
  const [frac, setFrac] = useState(0);
  const timer = useRef<number>(0);
  const setChores = (c: FarmChores) => qc.setQueryData(farmKey(f.id), (old: Farm | undefined) => old && old.progress && ({ ...old, progress: { ...old.progress, chores: c } }));
  const claim = async (key: string) => {
    try {
      const r = await api.farmChoreClaim(key);
      setChores(r.chores); invalidateGame(qc); if (haptics) buzz('success');
      if (r.all_done) { confettiCannons(); toast.success(`🌻 All of today’s chores done! +${r.chores.bonus_ink} Ink · +${r.chores.bonus_coins} 🪙`); }
      else toast.success(`Done — +${r.paid} Ink`);
    } catch (e) { toast.error(toGameError(e).message); }
  };
  // a tap chore takes a few calm seconds
  useEffect(() => {
    if (!doing) return;
    const tick = () => {
      const p = Math.min(1, (performance.now() - doing.t0) / (doing.secs * 1000)); setFrac(p);
      if (p >= 1) { const k = doing.key; setDoing(null); void claim(k); return; }
      timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timer.current);
  }, [doing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) setDoing(null); }, [open]);
  if (!chores) return null;
  const done = chores.list.filter((c) => c.done).length;
  const resetsIn = Math.max(0, new Date(chores.resets_at).getTime() - Date.now());
  const row = (c: FarmChore) => {
    const active = doing?.key === c.key;
    return (
      <div key={c.key} className={cn('relative flex items-center gap-3 overflow-hidden rounded-2xl p-3', c.done ? 'bg-ok/10' : 'bg-surface-2')} data-testid={`chore-${c.key}`}>
        {active && <div className="absolute inset-y-0 left-0 bg-[#7BD957]/25" style={{ width: `${frac * 100}%` }} />}
        <motion.span className="relative text-3xl" animate={active ? { rotate: [0, -12, 12, 0], y: [0, -4, 0] } : {}} transition={{ repeat: Infinity, duration: 0.9 }}>{c.emoji}</motion.span>
        <div className="relative min-w-0 flex-1">
          <div className={cn('text-sm font-semibold', c.done && 'text-muted line-through')}>{c.name}</div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            {c.kind === 'count' && !c.done && <span>{Math.min(c.progress, c.target ?? 1)}/{c.target} · </span>}
            +{c.ink} <ResourceIcon r="ink" className="h-3 w-3" />
          </div>
        </div>
        <div className="relative shrink-0">
          {c.done ? <span className="grid h-8 w-8 place-items-center rounded-full bg-ok text-white"><Check className="h-4 w-4" /></span>
            : c.kind === 'tap' ? <Button size="sm" variant="rainbow" disabled={!!doing} onClick={() => setDoing({ key: c.key, t0: performance.now(), secs: c.seconds ?? 4 })} data-testid={`chore-do-${c.key}`}>{active ? 'Doing…' : 'Do it'}</Button>
            : c.ready ? <Button size="sm" variant="rainbow" onClick={() => claim(c.key)} data-testid={`chore-tick-${c.key}`}>Tick off</Button>
            : <span className="rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold text-muted">In progress</span>}
        </div>
      </div>
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="📝 Today’s chores" description={`A few easy jobs round the farm. ${done}/${chores.list.length} done · new list in ${Math.floor(resetsIn / 3600000)}h ${Math.floor((resetsIn % 3600000) / 60000)}m`}>
      <div className="grid gap-2" data-testid="farm-chores">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-ok transition-all" style={{ width: `${(done / Math.max(1, chores.list.length)) * 100}%` }} /></div>
        {chores.list.map(row)}
        <p className="pt-1 text-center text-xs text-muted">Finish them all for a bonus: +{chores.bonus_ink} Ink and {chores.bonus_coins} 🪙</p>
      </div>
    </Dialog>
  );
}
