// The corner countdown before an update reloads the game: finish your drawing or your round first. Tap "Update now"
// whenever you're ready; tap the chip to tuck it smaller.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { onUpdateDue, setUpdateGrace, updateDue, updateNow } from './updates';
import { useAppConfig } from './LiveControl';

const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function UpdateCountdown() {
  const cfg = useAppConfig().data;
  useEffect(() => { if (cfg?.update_grace_minutes != null) setUpdateGrace(cfg.update_grace_minutes); }, [cfg?.update_grace_minutes]);
  const [due, setDue] = useState<number | null>(updateDue());
  const [now, setNow] = useState(Date.now());
  const [small, setSmall] = useState(false);
  useEffect(() => onUpdateDue(setDue), []);
  useEffect(() => {
    if (due == null) return;
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, [due]);
  if (due == null) return null;
  const left = due - now, last = left < 60_000;
  return (
    <div className={cn('pointer-events-auto fixed right-[max(10px,env(safe-area-inset-right,0px))] z-[150] flex items-center gap-2 rounded-2xl border text-white shadow-2xl',
      'bottom-[calc(98px+env(safe-area-inset-bottom,0px))] md:bottom-4', last ? 'border-[#FF8A3D]/70 bg-[#3a1606]/95' : 'border-white/15 bg-[#121638]/95', small ? 'px-2.5 py-1.5' : 'px-3 py-2')}
      role="status" aria-live="polite" data-testid="update-countdown">
      <button className="flex items-center gap-2 text-left" onClick={() => setSmall((x) => !x)} aria-label={small ? 'Show the update countdown' : 'Make the update countdown smaller'}>
        <RefreshCw className={cn('h-4 w-4 shrink-0', last ? 'text-[#FFB27A]' : 'text-[#22E3FF]')} />
        {small ? <span className="font-mono text-[13px] font-black tnum">{mmss(left)}</span> : (
          <span className="grid leading-tight">
            <span className="text-[12px] font-black">A new update is ready</span>
            <span className="text-[11px] text-white/70">Reloading in <b className="font-mono tnum text-white">{mmss(left)}</b> — finish what you’re doing</span>
          </span>
        )}
      </button>
      {!small && <button className="rounded-xl bg-white/15 px-2.5 py-1.5 text-[12px] font-black hover:bg-white/25" onClick={updateNow} data-testid="update-now">Update now</button>}
    </div>
  );
}
