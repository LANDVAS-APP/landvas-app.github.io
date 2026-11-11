// Rarity rankings: who owns the most plots of each rarity. One tap per rarity; every rarity's totals at a glance.
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, PageHeader } from '../app/Shell';
import { api } from '../backend/api';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RarityBadge } from '../plot/RarityBadge';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { Empty, PlayerAvatar, Spinner } from '../ui';
import { cn, fmt } from '../lib/utils';

export default function RarityRankings() {
  const [params, setParams] = useSearchParams();
  const all = useQuery({ queryKey: ['rarity-rankings'], queryFn: api.rarityRankings, staleTime: 60_000 });
  const order = (all.data ?? []).map((x: any) => x.rarity as string);
  const ids = order.length ? order : (RARITY_ORDER as string[]);
  const r = params.get('r') && ids.includes(params.get('r')!) ? params.get('r')! : 'mythic';
  const one = useQuery({ queryKey: ['rarity-ranking', r], queryFn: () => api.rarityRanking(r), staleTime: 60_000 });
  const info = rarityInfo(r);
  const summary = (all.data ?? []).find((x: any) => x.rarity === r);
  const pick = (id: string) => setParams((p) => { p.set('r', id); return p; }, { replace: true });
  return (
    <Page>
      <PageHeader eyebrow="Rankings" title="🏆 Rarity rankings">Who owns the most of every rarity. Tap a rarity to see its top 50.</PageHeader>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Link to="/leaderboards" className="rounded-full bg-surface-2 px-3 py-1.5 font-bold">All rankings</Link>
        <Link to="/royalty" className="rounded-full bg-[#FFD84D]/15 px-3 py-1.5 font-bold text-[#FFD84D]">👑 Royalty</Link>
        <Link to="/legend" className="rounded-full bg-surface-2 px-3 py-1.5 font-bold">What each rarity does</Link>
      </div>
      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-2 scroll-thin" data-testid="rr-chips">
        {ids.map((id) => {
          const s = (all.data ?? []).find((x: any) => x.rarity === id);
          return (
            <button key={id} onClick={() => pick(id)} data-testid={`rr-${id}`}
              className={cn('flex shrink-0 flex-col items-center gap-1 rounded-2xl px-2.5 py-2 text-[11px] font-bold transition', id === r ? 'bg-surface-2 ring-2' : 'bg-surface/60 opacity-80 hover:opacity-100')}
              style={id === r ? { ['--tw-ring-color' as any]: rarityInfo(id).color } : undefined}>
              <BasePlotArt rarity={id as any} size={34} />
              <span style={{ color: rarityInfo(id).color }}>{rarityInfo(id).name}</span>
              <span className="tnum text-faint">{s ? fmt(s.owned) : '·'}</span>
            </button>
          );
        })}
      </div>

      <section className="glass mb-4 flex items-center gap-4 rounded-3xl p-4" style={{ boxShadow: `inset 0 0 0 1.5px ${info.color}44` }} data-testid="rr-head">
        <BasePlotArt rarity={r as any} size={56} />
        <div className="min-w-0 flex-1">
          <RarityBadge r={r} />
          <div className="mt-1 text-sm text-muted">{summary ? <>{fmt(summary.owned)} owned by {fmt(summary.owners)} player{summary.owners === 1 ? '' : 's'}{summary.shiny ? ` · ${fmt(summary.shiny)} ✨ shiny` : ''}</> : '…'}</div>
          {one.data?.me != null && <div className="text-xs font-bold" style={{ color: info.color }}>You own {fmt(one.data.me)}</div>}
        </div>
      </section>

      {one.isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : !one.data?.rows.length ? (
        <Empty icon={<Trophy className="h-6 w-6" />} title={`No one owns a ${info.name} plot yet`}>Be the first to roll one.</Empty>
      ) : (
        <ol className="glass mb-8 divide-y divide-line overflow-hidden rounded-3xl" data-testid="rr-rows">
          {one.data.rows.map((x: any) => (
            <li key={x.player.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn('w-8 text-center font-display font-bold tnum', x.rank <= 3 ? 'text-gold' : 'text-muted')}>{x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : x.rank}</span>
              <PlayerAvatar p={x.player} size={34} />
              <Link to={`/u/${x.player.username}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold">{x.player.display_name || x.player.username}</div>
                <div className="truncate text-xs text-muted">@{x.player.username}{x.shiny ? ` · ${x.shiny} ✨` : ''}</div>
              </Link>
              <span className="font-display font-semibold tnum" style={{ color: info.color }}>{fmt(x.value)}</span>
            </li>
          ))}
        </ol>
      )}

      {(all.data ?? []).length > 0 && (
        <section className="mb-10 grid gap-2" data-testid="rr-all">
          <h2 className="font-display text-lg font-black">Every rarity at a glance</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(all.data ?? []).map((s: any) => (
              <button key={s.rarity} onClick={() => { pick(s.rarity); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="glass flex items-center gap-3 rounded-2xl p-3 text-left">
                <BasePlotArt rarity={s.rarity} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold" style={{ color: rarityInfo(s.rarity).color }}>{rarityInfo(s.rarity).name}</div>
                  <div className="truncate text-xs text-muted">{fmt(s.owned)} owned{s.top ? ` · top: @${s.top.player.username} (${fmt(s.top.value)})` : ' · none yet'}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
