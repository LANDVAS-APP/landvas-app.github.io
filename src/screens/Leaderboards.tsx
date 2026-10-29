import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { cn, fmt } from '../lib/utils';
import { Empty, Spinner, Tabs, PlayerAvatar } from '../ui';

const KINDS = [
  { value: 'plots', label: 'Landholders', unit: 'plots' },
  { value: 'murals', label: 'Largest murals', unit: 'plots' },
  { value: 'appreciated', label: 'Most loved', unit: '♥' },
  { value: 'level', label: 'Artist level', unit: 'level' },
  { value: 'minigame:lightlines', label: 'LightLines', unit: 'pts' },
  { value: 'minigame:paintpop', label: 'Paint Pop', unit: 'pts' },
  { value: 'minigame:colorburst', label: 'ColorBurst', unit: 'pts' },
  { value: 'minigame:tracecraft', label: 'TraceCraft', unit: 'pts' },
  { value: 'minigame:memorymural', label: 'Memory Mural', unit: 'pts' },
  { value: 'minigame:sculptor', label: 'Sculptor', unit: 'pts' },
  { value: 'minigame:rollermural', label: 'Roller Mural', unit: 'pts' },
  { value: 'minigame:mirrorline', label: 'Mirrorline', unit: 'pts' },
];

export default function Leaderboards() {
  const [kind, setKind] = useState('plots');
  const [k, game] = kind.split(':');
  const q = useQuery({ queryKey: ['leaderboard', kind], queryFn: () => api.leaderboard(k, game) });
  const unit = KINDS.find((x) => x.value === kind)?.unit ?? '';
  const rows = q.data?.rows ?? [];
  return (
    <Page>
      <PageHeader eyebrow="Real players only" title="Rankings">The top 50 in each category. Everyone listed is a real account.</PageHeader>
      <div className="mb-4 overflow-x-auto scroll-thin"><Tabs value={kind} onValueChange={setKind} items={KINDS.map(({ value, label }) => ({ value, label }))} /></div>
      {q.isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : !rows.length ? (
        <Empty icon={<Trophy className="h-6 w-6" />} title="No one here yet">Be the first — this board fills up as players claim, paint and play.</Empty>
      ) : (
        <ol className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {rows.map((r: any) => (
            <li key={`${r.rank}-${r.player.id}-${r.artwork?.id ?? ''}`} className="flex items-center gap-3 px-4 py-3">
              <span className={cn('w-8 text-center font-display font-bold tnum', r.rank <= 3 ? 'text-gold' : 'text-muted')}>{r.rank}</span>
              <PlayerAvatar p={r.player} size={34} />
              <Link to={`/u/${r.player.username}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.player.display_name || r.player.username}</div>
                <div className="truncate text-xs text-muted">@{r.player.username}{r.artwork ? ` · “${r.artwork.title}”` : ''}</div>
              </Link>
              <span className="font-display font-semibold tnum">{fmt(r.value)} <span className="text-xs text-muted">{unit}</span></span>
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
}
