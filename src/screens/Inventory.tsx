import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page, PageHeader, ResourceBar } from '../app/Shell';
import { invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { useUi } from '../lib/store';
import { fmt, plotLabel, timeAgo } from '../lib/utils';
import { cellCenter } from '../shared/grid';
import { formatRate } from '../shared/rent';
import { Button, Cost, Empty, RESOURCE_META, Spinner, Tabs } from '../ui';
import { RarityBadge } from '../plot/RarityBadge';
import { PLOT_TYPES } from '../map/plotStyle';

export default function Inventory() {
  const [tab, setTab] = useState('plots');
  const me = useOnboardedMe();
  const world = useWorld();
  const qc = useQueryClient();
  const nav = useNavigate();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me && tab === 'plots' });
  const ledger = useQuery({ queryKey: ['ledger'], queryFn: () => api.myLedger(60), enabled: !!me && tab === 'history' });
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const items = world.data?.shop?.items ?? [];
  return (
    <Page>
      <PageHeader eyebrow="Your stuff" title="Studio" actions={<ResourceBar />}>
        Ink buys plots and is earned only by winning minigames. Pigments, XP and Gallery Tokens unlock tools and cosmetics. None of them can be bought or cashed out.
      </PageHeader>
      <Tabs value={tab} onValueChange={setTab} items={[{ value: 'plots', label: 'My plots' }, { value: 'shop', label: 'Shop' }, { value: 'history', label: 'History' }]} className="mb-4" />
      {tab === 'plots' && (plots.isLoading ? <Spinner /> : !(plots.data ?? []).length ? (
        <Empty icon={<MapPin className="h-6 w-6" />} title="No plots yet" action={<Button variant="rainbow" onClick={() => nav('/')}>Find one near you</Button>} />
      ) : (
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {(plots.data ?? []).map((p: any) => (
            <button key={`${p.gx}_${p.gy}`} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => {
              const [lng, lat] = cellCenter(p.gx, p.gy);
              useUi.getState().requestFly({ lng, lat, zoom: 15.5 });
              useUi.getState().select({ gx: p.gx, gy: p.gy });
              nav('/');
            }}>
              <RarityBadge r={p.rarity} small />
              <div className="min-w-0 flex-1">
                <div className="font-semibold tnum">Plot {plotLabel(p.gx, p.gy)}</div>
                <div className="text-xs text-muted">{PLOT_TYPES[p.plot_type as keyof typeof PLOT_TYPES]?.name} · level {p.level}{p.has_art ? ' · painted' : ''}</div>
              </div>
              <span className="text-xs font-semibold text-[#3DDC97] tnum">{formatRate(Number(p.usd_per_second))}</span>
            </button>
          ))}
        </div>
      ))}
      {tab === 'shop' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((it) => {
            const owned = me.unlocks.includes(it.key);
            const locked = it.requires && !me.unlocks.includes(it.requires);
            return (
              <div key={it.key} className="glass flex flex-col gap-2 rounded-3xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="eyebrow !text-[10px]">{it.kind.replace('_', ' ')}</div>
                    <div className="font-bold">{it.name}</div>
                  </div>
                  <Cost cost={it.cost} />
                </div>
                <p className="text-sm text-muted">{it.description}</p>
                <Button size="sm" variant={owned ? 'secondary' : 'primary'} disabled={owned || !!locked} loading={busy === it.key} className="mt-auto justify-self-start" onClick={async () => {
                  setBusy(it.key);
                  try { await api.purchaseUnlock(it.key); toast.success(`${it.name} unlocked`); invalidateGame(qc); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
                }}>{owned ? <><Check className="h-4 w-4" /> Owned</> : locked ? 'Unlock the previous one first' : 'Unlock'}</Button>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'history' && (ledger.isLoading ? <Spinner /> : (
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl text-sm">
          {(ledger.data ?? []).map((l: any) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate"><span className="font-semibold">{RESOURCE_META[l.resource as keyof typeof RESOURCE_META]?.name ?? l.resource}</span> · {String(l.reason).replace(/_/g, ' ')}</span>
              <span className="shrink-0 text-xs text-muted">{timeAgo(l.created_at)}</span>
              <span className={`shrink-0 font-semibold tnum ${l.delta > 0 ? 'text-ok' : 'text-muted'}`}>{l.delta > 0 ? '+' : ''}{fmt(l.delta)}</span>
            </div>
          ))}
        </div>
      ))}
    </Page>
  );
}
