// Pick the rarity your name wears in every chat: your rarest plot (the default, and it keeps up as you roll rarer ones)
// or any rarity you own, to show it off. A Phantom keeps its secret here as everywhere: it counts as the Common it
// pretends to be (a Doppelgänger as its disguise).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { cn } from '../lib/utils';
import { rarityInfo } from '../shared/rarity';
import { useOnboardedMe } from '../lib/queries';
import { nameStyle } from './nameColor';

export function NameColorPicker({ compact = false }: { compact?: boolean }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['name-color'], queryFn: api.nameColorInfo, enabled: !!me, staleTime: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return null;
  const d = q.data;
  const pick = async (r: string | null) => {
    if (busy) return;
    setBusy(r ?? 'auto');
    try {
      const next = await api.setNameColor(r);
      qc.setQueryData(['name-color'], next);
      void qc.invalidateQueries({ queryKey: ['peek'] });
      toast.success(r ? `Your name wears ${rarityInfo(r).name} now ✨` : 'Your name wears your rarest plot');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const name = me.profile.display_name || me.profile.username;
  return (
    <div className={cn('rounded-2xl border border-line bg-bg-2/50', compact ? 'p-2.5' : 'p-4')} data-testid="name-color-picker">
      <div className="flex items-baseline justify-between gap-2">
        <div className={cn('font-black', compact ? 'text-[12px]' : 'font-display text-base')}><Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent-2" />Your name colour</div>
        {d?.shown && <span className="truncate text-[12px] font-black" style={nameStyle({ name_rarity: d.shown })} data-testid="name-color-preview">{name}</span>}
      </div>
      {!compact && <p className="mt-1 text-xs text-muted">How your name looks in every chat. It wears your rarest plot, or pick any rarity you own to show it off.</p>}
      {!d ? <div className="lv-skel mt-2 h-9 rounded-xl" /> : !d.options.length ? (
        <p className="mt-2 text-[12px] text-muted">Claim a plot and your name takes its colour.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Swatch label="Rarest" title={d.auto ? `Your rarest plot (${rarityInfo(d.auto).name})` : 'Your rarest plot'} rarity={d.auto} on={!d.pick} busy={busy === 'auto'} onClick={() => pick(null)} testid="name-color-auto" />
          {d.options.map((o) => (
            <Swatch key={o.rarity} rarity={o.rarity} title={`${rarityInfo(o.rarity).name} · ${o.count} plot${o.count === 1 ? '' : 's'}`} on={d.pick === o.rarity} busy={busy === o.rarity}
              onClick={() => pick(o.rarity)} testid={`name-color-${o.rarity}`} />
          ))}
        </div>
      )}
      {d?.secret && <p className="mt-1.5 text-[11px] text-muted">👻 Phantoms keep their secret: they count as the Common they pretend to be.</p>}
    </div>
  );
}

function Swatch({ rarity, label, title, on, busy, onClick, testid }: { rarity: string | null; label?: string; title: string; on: boolean; busy: boolean; onClick(): void; testid: string }) {
  const r = rarity ? rarityInfo(rarity) : null;
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={on} onClick={onClick} disabled={busy} data-testid={testid}
      className={cn('relative flex h-8 items-center gap-1 rounded-full border px-2 text-[11.5px] font-bold transition', on ? 'border-transparent ring-2 ring-[var(--accent-2,#22E3FF)]' : 'border-line hover:border-line-strong', busy && 'opacity-60')}
      style={r ? { background: `${r.color}22` } : undefined}>
      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: r ? `linear-gradient(135deg, ${r.color}, ${r.glow})` : 'var(--line-strong)' }} />
      {label ? <span>{label}</span> : <span style={nameStyle({ name_rarity: rarity })}>{r?.emoji ? `${r.emoji} ` : ''}{r?.name}</span>}
      {on && <Check className="h-3 w-3" />}
    </button>
  );
}
