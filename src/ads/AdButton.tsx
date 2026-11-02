// "Watch an ad for a bonus" — shown only in the mobile apps, only when ads are switched on and
// the player has bonus ads left today.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { confettiCannons } from '../ui/confetti';
import { adsSupported, watchRewarded, type AdReward } from './ads';

export const useAdStatus = () => useQuery({ queryKey: ['ad-status'], queryFn: api.adStatus, enabled: adsSupported(), staleTime: 60_000 });

export function AdButton({ reward, refId = '', label, done, onDone, className, testid }: {
  reward: AdReward; refId?: string; label: string; done?: string; onDone?(result: Record<string, unknown>): void; className?: string; testid?: string;
}) {
  const st = useAdStatus();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!adsSupported() || !st.data?.enabled || st.data.rewards[reward]?.enabled === false) return null;
  const left = st.data.daily_cap - st.data.used_today;
  if (left <= 0) return null;
  const go = async () => {
    setBusy(true);
    try {
      const r = await watchRewarded(reward, refId);
      if (r.ok) {
        buzz('success'); confettiCannons();
        toast.success(done ?? 'Bonus unlocked!');
        invalidateGame(qc);
        for (const k of ['ad-status', 'sanctuaries', 'inkborn-economy', 'habitat', 'spring']) void qc.invalidateQueries({ queryKey: [k] });
        onDone?.(r.result);
      } else if (r.reason !== 'dismissed') toast(r.message ?? 'No ad right now — try again soon.');
    } finally { setBusy(false); }
  };
  return (
    <button onClick={go} disabled={busy} data-testid={testid ?? `ad-${reward}`}
      className={cn('flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFB31F] to-[#FF4FD8] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_24px_-8px_#FF4FD8] disabled:opacity-60', className)}>
      <Clapperboard className={cn('h-4 w-4', busy && 'animate-pulse')} /> {busy ? 'Playing ad…' : label}
      <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-bold">{left} left</span>
    </button>
  );
}
