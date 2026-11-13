// The "Clip it" button for a moment (a splice, the Forbidden Wish, Hope, an evolution…) and the helpers the scenes use
// to keep each moment for the Clips page.
import { useState } from 'react';
import { useOnboardedMe } from '../lib/queries';
import { buzz } from '../native/native';
import { toast } from 'sonner';
import { ClipSheet, openClip, type ClipJob } from '../roll/clip';
import { enchantName } from '../enchant/kinds';
import { saveMoment } from './history';
import { momentJob, newMoment, type EnchantRef, type Moment, type MomentInput } from './moments';
import { cn } from '../lib/utils';

/** an enchantment, as a moment needs it */
export const enchantRef = (v: { kind: string; sigil: number; serial?: number | null; nickname?: string | null; level?: number | null; born_place?: string | null; minted?: number | null }): EnchantRef => ({
  kind: v.kind, sigil: Number(v.sigil) || 1, name: enchantName({ kind: v.kind, serial: Number(v.serial ?? 0), nickname: v.nickname }), serial: v.serial ?? null, level: v.level ?? null, born_place: v.born_place ?? null, minted: v.minted ?? null,
});

/** keep a moment for later (and return it, for its Clip button) */
export function keepMoment(m: MomentInput, user?: string | null): Moment {
  const mm = newMoment({ ...m, user: user ?? null } as MomentInput);
  try { saveMoment(mm); } catch { /* storage off */ }
  return mm;
}

export function ClipMomentButton({ moment, label = '🎬 Clip it', className, testId = 'moment-clip' }: { moment: Moment; label?: string; className?: string; testId?: string }) {
  const me = useOnboardedMe();
  const [job, setJob] = useState<ClipJob | null>(null);
  return (
    <>
      <button type="button" data-testid={testId}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setJob(momentJob(moment, me?.profile.username ?? moment.user ?? null)); buzz('light'); }}
        className={cn('lv-clip-btn relative inline-flex h-10 items-center gap-1.5 overflow-hidden rounded-2xl px-3.5 font-display text-[14px] font-black text-white', className)}>
        {label}
      </button>
      {job && <ClipSheet job={job} onClose={() => setJob(null)} />}
    </>
  );
}

/** keep moments as this player */
export function useKeepMoment() {
  const me = useOnboardedMe();
  return (m: MomentInput) => keepMoment(m, me?.profile.username ?? null);
}

/** a moment with no screen of its own (a Platinum egg, a shattered shard, a PERFECT zap): kept, and offered as a clip */
export function offerClip(m: Moment, text: string) {
  toast(text, { description: 'Kept in Clips — share it now?', duration: 7000, action: { label: '🎬 Clip it', onClick: () => openClip(momentJob(m, m.user ?? null)) } });
}
