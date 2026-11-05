// A creature's profile: its portrait, personality, bond, happiness and energy, where it came
// from (its original drawing), and — for its keeper — rename, customise, move or release.
import { useQueryClient } from '@tanstack/react-query';
import { Heart, Home, Paintbrush, Pencil, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Inkborn, Sanctuaries } from '../backend/types';
import { cn, timeAgo } from '../lib/utils';
import { Button, Dialog, inputCls } from '../ui';
import { StrokeView } from '../creative/SketchPad';
import { bondLevel, energyWord, moodWord } from './care';
import { CreatureView } from './CreatureView';
import { CreatureWork } from './Earn';
import { MOOD_INFO, cleanGenome } from './genome';
import { WEAR, WEAR_SLOTS } from '../arcade/cosmetics';
import { useOnboardedMe } from '../lib/queries';

export function Meter({ icon, label, value, color, hint }: { icon: React.ReactNode; label: string; value: number; color: string; hint?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1 font-bold">{icon}{label}</span><span className="text-muted">{hint ?? `${Math.round(value)}%`}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, Math.min(100, value))}%`, background: color }} /></div>
    </div>
  );
}

export function CreatureProfile({ c, open, onOpenChange, sanct, onChanged }: {
  c: Inkborn | null; open: boolean; onOpenChange(v: boolean): void; sanct?: Sanctuaries | null; onChanged?(c: Inkborn | null): void;
}) {
  const qc = useQueryClient();
  const [rename, setRename] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const me = useOnboardedMe();
  if (!c) return null;
  const g = cleanGenome(c.genome);
  const b = bondLevel(c.bond);
  const mood = MOOD_INFO[g.mood];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['sanctuaries'] }); void qc.invalidateQueries({ queryKey: ['habitat'] }); };
  const run = async (f: () => Promise<Inkborn | null>, ok: string) => {
    setBusy(true);
    try { const r = await f(); toast.success(ok); refresh(); onChanged?.(r); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const homes = sanct?.habitats ?? [];
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setRename(null); setReleasing(false); } }} title={c.name} description={`${mood.emoji} ${mood.label} · ${b.name}`}>
      <div className="grid gap-4" data-testid="creature-profile">
        <div className="relative grid justify-items-center overflow-hidden rounded-3xl bg-gradient-to-b from-[#16324a] to-[#2f7d3a]/70 p-3">
          <CreatureView genome={g} size={200} cycle />
          {c.source === 'drawn' && c.drawing && c.drawing.length > 0 && (
            <div className="absolute bottom-2 left-2 grid justify-items-center rounded-xl bg-black/30 p-1 backdrop-blur" title="The drawing it came from">
              <StrokeView strokes={c.drawing} size={64} /><span className="text-[9px] text-white/80">Origin drawing</span>
            </div>
          )}
        </div>
        <p className="text-center text-sm text-muted">{mood.text}</p>
        <div className="grid gap-3 rounded-2xl border border-line p-3">
          <Meter icon={<Heart className="h-3.5 w-3.5 text-[#FF4D6D]" />} label="Happiness" value={c.happiness} color="linear-gradient(90deg,#FF4D6D,#FF9FB2)" hint={moodWord(c.happiness)} />
          <Meter icon={<Zap className="h-3.5 w-3.5 text-[#FFC93D]" />} label="Energy" value={c.energy} color="linear-gradient(90deg,#FFC93D,#FFE58A)" hint={energyWord(c.energy)} />
          <Meter icon={<span className="text-[13px]">💞</span>} label={`Bond · level ${b.level} ${b.name}`} value={b.progress * 100} color="linear-gradient(90deg,#7B5CFF,#FF4FD8)" hint={b.next ? `${b.toNext} to ${b.next}` : 'Max bond'} />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-surface-2/60 p-2"><dt className="text-muted">Born</dt><dd className="font-bold">{timeAgo(c.created_at)}</dd></div>
          <div className="rounded-xl bg-surface-2/60 p-2"><dt className="text-muted">Made by</dt><dd className="font-bold capitalize">{c.source === 'drawn' ? 'Drawing' : c.source === 'random' ? 'Random roll' : 'Customizer'}</dd></div>
          <div className="rounded-xl bg-surface-2/60 p-2"><dt className="text-muted">Bond points</dt><dd className="font-bold">{c.bond}</dd></div>
          <div className="rounded-xl bg-surface-2/60 p-2"><dt className="text-muted">Home</dt><dd className="truncate font-bold">{homes.find((h) => h.id === c.habitat_id)?.name ?? (c.habitat_id ? 'Sanctuary' : 'No room yet')}</dd></div>
        </dl>
        {c.mine && (
          <div className="grid gap-2 rounded-2xl border border-[#FF3D9A]/30 bg-[#FF3D9A]/5 p-3" data-testid="creature-wear">
            <div className="flex items-center justify-between text-xs font-bold"><span>🕹️ Arcade wear</span><span className="font-normal text-muted">Win more with tickets at any arcade</span></div>
            {WEAR_SLOTS.map(({ slot, label }) => {
              const owned = WEAR[slot].filter((w) => me?.unlocks.includes(`inkborn.${slot}.${w.id}`));
              const on = (c.genome as Record<string, unknown>)[slot] as string | undefined;
              return (
                <div key={slot} className="flex items-center gap-1.5 overflow-x-auto text-xs">
                  <span className="w-10 shrink-0 text-muted">{label}</span>
                  <button disabled={busy || !on} onClick={() => void run(() => api.inkbornWear(c.id, slot, null), 'Taken off')} className={cn('shrink-0 rounded-full px-2.5 py-1', !on ? 'bg-accent text-white' : 'bg-surface-2')}>None</button>
                  {owned.map((w) => (
                    <button key={w.id} disabled={busy || on === w.id} onClick={() => void run(() => api.inkbornWear(c.id, slot, w.id), `${c.name} looks great`)} data-testid={`wear-${slot}-${w.id}`}
                      className={cn('shrink-0 rounded-full px-2.5 py-1 font-bold', on === w.id ? 'bg-accent text-white' : 'bg-surface-2')}>{w.emoji} {w.name}</button>
                  ))}
                  {!owned.length && <span className="text-faint">Nothing yet</span>}
                </div>
              );
            })}
          </div>
        )}
        {c.mine && <div className="rounded-2xl bg-[#13261a] p-2 text-white"><CreatureWork c={c} onChanged={(n) => onChanged?.(n)} /></div>}
        {c.portrait_status === 'unconfigured' && <p className="text-center text-[11px] text-faint">AI-painted portraits aren’t switched on yet — {c.name} is shown on the Inkborn animation rig.</p>}
        {c.mine && (
          <div className="grid gap-2 border-t border-line pt-3">
            {rename !== null ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (rename.trim()) void run(() => api.inkbornUpdate(c.id, rename.trim(), null), 'Renamed').then(() => setRename(null)); }}>
                <input className={cn(inputCls, 'min-w-0 flex-1')} value={rename} maxLength={24} autoFocus onChange={(e) => setRename(e.target.value)} aria-label="New name" />
                <Button type="submit" loading={busy}>Save</Button>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRename(c.name)}><Pencil className="h-4 w-4" /> Rename</Button>
                <Link to={`/inkborn/edit/${c.id}`}><Button size="sm" variant="secondary"><Paintbrush className="h-4 w-4" /> Customise</Button></Link>
                {c.habitat_id && <Link to={`/habitat/${c.habitat_id}`}><Button size="sm" variant="secondary"><Home className="h-4 w-4" /> Visit</Button></Link>}
              </div>
            )}
            {homes.length > 1 && (
              <label className="grid gap-1 text-xs font-bold text-muted">Move to
                <select className={cn(inputCls, 'h-10')} value={c.habitat_id ?? ''} disabled={busy} onChange={(e) => void run(() => api.inkbornMove(c.id, e.target.value), `${c.name} moved house`)}>
                  {!c.habitat_id && <option value="">Choose a sanctuary…</option>}
                  {homes.map((h) => <option key={h.id} value={h.id} disabled={h.id !== c.habitat_id && h.creatures >= h.capacity}>{h.name} ({h.creatures}/{h.capacity})</option>)}
                </select>
              </label>
            )}
            {releasing ? (
              <div className="grid gap-2 rounded-2xl border border-bad/40 bg-bad/10 p-3 text-sm">
                <p>Release <b>{c.name}</b> into the wild? They’ll leave your sanctuaries for good, along with their bond.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" loading={busy} onClick={() => void run(async () => { await api.inkbornRelease(c.id); onOpenChange(false); return null; }, `${c.name} wandered off into the woods`)}>Yes, release</Button>
                  <Button size="sm" variant="ghost" onClick={() => setReleasing(false)}>Keep them</Button>
                </div>
              </div>
            ) : (
              <button className="justify-self-start text-xs text-faint underline-offset-2 hover:text-bad hover:underline" onClick={() => setReleasing(true)}>Release into the wild…</button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
