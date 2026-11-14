import { useQuery } from '@tanstack/react-query';
import { Crown, Gem, Trophy } from 'lucide-react';
import { isNative } from '../native/native';
import { useMe } from '../lib/queries';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { cn, fmt } from '../lib/utils';
import { Emblem, Empty, Spinner, Tabs, PlayerAvatar } from '../ui';

const APP = isNative();

const KINDS = [
  { value: 'plots', label: 'Landholders', unit: 'plots' },
  { value: 'murals', label: 'Largest murals', unit: 'plots' },
  { value: 'appreciated', label: 'Most loved', unit: '♥' },
  { value: 'level', label: 'Level', unit: 'level' },
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
      {APP ? (
        <div className="mb-3 grid grid-cols-2 gap-2" data-testid="lb-links">
          <Link to="/rankings/rarities" className="lv-rankcard t-azure"><Emblem tone="azure" size={34}><Gem className="h-4 w-4" /></Emblem><span>Rarity<br />rankings</span></Link>
          <Link to="/royalty" className="lv-rankcard t-gold"><Emblem tone="gold" size={34}><Crown className="h-4 w-4" /></Emblem><span>Royalty</span></Link>
        </div>
      ) : <div className="mb-3 grid grid-cols-2 gap-2" data-testid="lb-links">
        <Link to="/rankings/rarities" className="glass flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold">💎 Rarity rankings<span className="ml-auto text-muted">›</span></Link>
        <Link to="/royalty" className="glass flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold text-[#FFD84D]">👑 Royalty<span className="ml-auto text-muted">›</span></Link>
      </div>}
      <div className="mb-4 overflow-x-auto scroll-thin"><Tabs value={kind} onValueChange={setKind} items={KINDS.map(({ value, label }) => ({ value, label }))} /></div>
      {q.isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : !rows.length ? (
        <Empty icon={<Trophy className="h-6 w-6" />} title="No one here yet">Be the first — this board fills up as players claim, paint and play.</Empty>
      ) : APP ? <AppBoard rows={rows} unit={unit} /> : (
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

// the app: a podium for the top three, then everyone else as cards (your own row lit up)
function AppBoard({ rows, unit }: { rows: any[]; unit: string }) {
  const me = useMe().data;
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const name = (r: any) => r.player.display_name || r.player.username;
  return (
    <div data-testid="lb-board">
      <div className="lv-podium">
        {order.map((r, i) => r ? (
          <Link key={r.player.id + (r.artwork?.id ?? '')} to={`/u/${r.player.username}`} className={cn('lv-pod', `p${r.rank}`)}>
            {r.rank === 1 && <Crown className="lv-pod-crown" />}
            <div className="lv-pod-ava"><PlayerAvatar p={r.player} size={r.rank === 1 ? 64 : 50} /></div>
            <div className="lv-pod-name">{name(r)}</div>
            <div className="lv-pod-val tnum">{fmt(r.value)} <small>{unit}</small></div>
            <div className="lv-pod-step"><b>{r.rank}</b></div>
          </Link>
        ) : <div key={`gap${i}`} className="lv-pod empty" />)}
      </div>
      {rows.length > 3 && (
        <ol className="mt-3 grid gap-2">
          {rows.slice(3).map((r) => (
            <li key={`${r.rank}-${r.player.id}-${r.artwork?.id ?? ''}`}>
              <Link to={`/u/${r.player.username}`} className={cn('lv-rankrow', me?.user_id === r.player.id && 'me')}>
                <span className="lv-rank tnum">{r.rank}</span>
                <PlayerAvatar p={r.player} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-bold">{name(r)}</span>
                  <span className="block truncate text-xs text-muted">@{r.player.username}{r.artwork ? ` · “${r.artwork.title}”` : ''}</span>
                </span>
                <span className="font-display font-black tnum">{fmt(r.value)} <small className="text-[11px] font-bold text-muted">{unit}</small></span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
