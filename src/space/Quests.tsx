// Planet quests: three of your own each day on every world, and a crew quest everyone on the world works
// on together (everyone who pitched in can claim it once the crew gets there).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollText, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlanetQuest, PlanetQuests } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, Dialog, PlayerAvatar, ResourceIcon } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { poll } from '../lib/poll';

export const questsKey = (world: string) => ['planet-quests', world] as const;
export function useQuests(world: string, enabled: boolean) {
  return useQuery({ queryKey: questsKey(world), queryFn: () => api.planetQuests(world), enabled, refetchInterval: poll(60_000), staleTime: 20_000 });
}

const fmtAmount = (metric: string, n: number) => (metric.endsWith('_m') ? (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} km` : `${Math.floor(n)} m`) : `${Math.floor(n)}`);

/** The chip on the planet screen. */
export function QuestsChip({ q, onOpen }: { q?: PlanetQuests; onOpen(): void }) {
  if (!q) return null;
  const ready = q.solo.filter((x) => x.done && !x.claimed).length + (q.crew?.can_claim && !q.crew.claimed ? 1 : 0);
  const done = q.solo.filter((x) => x.claimed).length;
  return (
    <button className={cn('pointer-events-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]', ready ? 'bg-[#FFB13D]/85 text-black' : 'bg-black/50')} onClick={onOpen} data-testid="quests-open">
      <ScrollText className="h-3 w-3" /> {ready ? `${ready} to claim!` : `Quests ${done}/${q.solo.length}`}
    </button>
  );
}

export function QuestsDialog({ world, worldName, q, open, onOpenChange }: { world: string; worldName: string; q?: PlanetQuests; open: boolean; onOpenChange(o: boolean): void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  if (!q) return null;
  const claim = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.planetQuestClaim(world, id);
      qc.setQueryData(questsKey(world), r); invalidateGame(qc); confettiCannons();
      const got = Object.entries(r.items_got ?? {}).map(([k, n]) => `${n} ${q.item_info[k]?.emoji ?? k}`);
      toast.success('Quest complete!', { description: [r.paid ? `+${r.paid} Ink` : r.earned ? 'Planet Ink is capped for today' : '', ...got].filter(Boolean).join(' · ') });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const hours = Math.max(0, Math.round((new Date(q.resets_at).getTime() - Date.now()) / 3600000));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={<span className="flex items-center gap-2"><ScrollText className="h-5 w-5 text-[#FFB13D]" /> Quests on {worldName}</span>} description={`New quests in about ${hours} hour${hours === 1 ? '' : 's'}.`}>
      <div className="grid gap-2" data-testid="quests-list">
        {q.solo.map((x) => <QuestRow key={x.id} x={x} info={q.item_info} busy={busy === x.id} onClaim={() => claim(x.id)} />)}
        {q.crew && (
          <div className="mt-2 rounded-2xl border border-[#7FE3FF]/40 bg-[#7FE3FF]/5 p-3" data-testid="crew-quest">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#7FE3FF]"><Users className="h-3.5 w-3.5" /> Crew quest · everyone on {worldName}</div>
            <QuestRow x={{ ...q.crew, done: q.crew.can_claim }} info={q.item_info} busy={busy === q.crew.id} onClaim={() => claim(q.crew!.id)} crew />
            <div className="mt-2 text-[11px] text-muted">
              You’ve done {fmtAmount(q.crew.metric, q.crew.mine)}{q.crew.mine < q.crew.min_share ? ` — do at least ${fmtAmount(q.crew.metric, q.crew.min_share)} to share the reward` : ' — you’re in on the reward'}.
            </div>
            {q.crew.crew.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {q.crew.crew.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2 text-[11px]"><PlayerAvatar p={p} size={18} /> @{p.username} · {fmtAmount(q.crew!.metric, p.amount)}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function QuestRow({ x, info, busy, onClaim, crew }: { x: PlanetQuest; info: PlanetQuests['item_info']; busy: boolean; onClaim(): void; crew?: boolean }) {
  const pct = Math.min(100, (x.progress / x.target) * 100);
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl p-2.5', !crew && 'bg-surface-2', x.claimed && 'opacity-60')} data-testid={`quest-${x.id}`}>
      <span className="text-2xl">{x.emoji ?? '📜'}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{x.title}</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><div className={cn('h-full rounded-full', x.done || pct >= 100 ? 'bg-ok' : 'bg-[#FFB13D]')} style={{ width: `${pct}%` }} /></div>
          <span className="shrink-0 text-[10px] text-muted tnum">{fmtAmount(x.metric, x.progress)}/{fmtAmount(x.metric, x.target)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted">
          {x.ink > 0 && <span className="flex items-center gap-0.5">+{x.ink} <ResourceIcon r="ink" className="h-3 w-3" /></span>}
          {Object.entries(x.items).map(([k, n]) => <span key={k}>+{n} {info[k]?.emoji ?? k}</span>)}
        </div>
      </div>
      {x.claimed ? <span className="text-xs font-bold text-ok">Done ✓</span>
        : <Button size="sm" variant={x.done ? 'rainbow' : 'secondary'} disabled={!x.done} loading={busy} onClick={onClaim} data-testid={`quest-claim-${x.id}`}>{x.done ? 'Claim' : 'To do'}</Button>}
    </div>
  );
}
