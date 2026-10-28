import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brush, Check, Lock, MapPin, Palette, Shirt, Sparkles, Wrench } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Balances, ShopItem } from '../backend/types';
import { Page, PageHeader, ResourceBar } from '../app/Shell';
import { invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt, plotLabel, timeAgo } from '../lib/utils';
import { Z_HOUSE, cellCenter } from '../shared/grid';
import { formatRate } from '../shared/rent';
import { PALETTES } from '../shared/color';
import { Button, Cost, Empty, RESOURCE_META, Spinner, Tabs } from '../ui';
import { RarityBadge } from '../plot/RarityBadge';
import { PLOT_TYPES } from '../map/plotStyle';
import { ExplorerFigure } from '../explorer/ExplorerFigure';

const GROUPS: { id: string; title: string; icon: any; blurb: string }[] = [
  { id: 'Brushes', title: 'Brushes', icon: Brush, blurb: 'Everyone starts with the pencil, paintbrush and eraser.' },
  { id: 'Colours', title: 'Colours', icon: Palette, blurb: 'Your 12 starter colours are always free.' },
  { id: 'Tools', title: 'Tools', icon: Wrench, blurb: 'Fill, eyedropper and straight lines come free.' },
  { id: 'Studio', title: 'Studio', icon: Sparkles, blurb: 'More layers and frames for your profile.' },
];

export default function Inventory() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'shop';
  const setTab = (t: string) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
  const me = useOnboardedMe();
  const nav = useNavigate();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me && tab === 'plots' });
  const ledger = useQuery({ queryKey: ['ledger'], queryFn: () => api.myLedger(60), enabled: !!me && tab === 'history' });
  if (!me) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  return (
    <Page>
      <PageHeader eyebrow="Your stuff" title="Studio" actions={<ResourceBar />}>
        Spend what you earn on new brushes, colours, tools and a look for your explorer. Earn Ink by winning minigames, inviting friends or converting your USD rent. Nothing here can be bought with real money.
      </PageHeader>
      <Tabs value={tab} onValueChange={setTab} items={[{ value: 'shop', label: 'Shop' }, { value: 'plots', label: 'My plots' }, { value: 'history', label: 'History' }]} className="mb-4" />
      {tab === 'shop' && <Shop />}
      {tab === 'plots' && (plots.isLoading ? <Spinner /> : !(plots.data ?? []).length ? (
        <Empty icon={<MapPin className="h-6 w-6" />} title="No plots yet" action={<Button variant="rainbow" onClick={() => nav('/world')}>Find one near you</Button>} />
      ) : (
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {(plots.data ?? []).map((p: any) => (
            <button key={`${p.gx}_${p.gy}`} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => {
              const [lng, lat] = cellCenter(p.gx, p.gy);
              useUi.getState().requestFly({ lng, lat, zoom: Z_HOUSE });
              useUi.getState().select({ gx: p.gx, gy: p.gy });
              nav('/world');
            }}>
              <RarityBadge r={p.rarity} small />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold tnum">{p.name || `Plot ${plotLabel(p.gx, p.gy)}`}</div>
                <div className="text-xs text-muted">{PLOT_TYPES[p.plot_type as keyof typeof PLOT_TYPES]?.name} · level {p.level}{p.has_art ? ' · painted' : ''}</div>
              </div>
              <span className="text-xs font-semibold text-[#3DDC97] tnum">{formatRate(Number(p.usd_per_second))}</span>
            </button>
          ))}
        </div>
      ))}
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

const affordable = (cost: Partial<Balances>, b: Balances) => Object.entries(cost).every(([k, v]) => Number(b[k as keyof Balances] ?? 0) >= Number(v ?? 0));

function Shop() {
  const me = useOnboardedMe()!;
  const world = useWorld();
  const items = (world.data?.shop?.items ?? []).filter((it) => it.enabled !== false);
  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((it) => (it.group ?? 'Studio') === g.id) })).filter((g) => g.items.length);
  const style = me.profile.explorer_style;
  return (
    <div className="grid gap-6" data-testid="shop">
      <Link to="/explorer" className="glass group flex items-center gap-4 overflow-hidden rounded-3xl p-4 hover:border-line-strong" data-testid="shop-explorer">
        <div className="flex h-24 w-24 shrink-0 items-end justify-center rounded-2xl pb-1" style={{ background: `radial-gradient(circle at 50% 70%, ${me.profile.accent_color}55, transparent 70%)` }}>
          <ExplorerFigure style={style} accent={me.profile.accent_color} size={54} />
        </div>
        <div className="min-w-0">
          <div className="eyebrow">Explorer</div>
          <div className="font-display text-lg font-semibold">Dress up your explorer</div>
          <p className="text-sm text-muted">Hats, tools, outfits, trails and auras, bought with Ink. Everyone sees them in your room and on the map.</p>
        </div>
        <Shirt className="ml-auto hidden h-6 w-6 shrink-0 text-accent-2 transition group-hover:translate-x-0.5 sm:block" />
      </Link>
      {groups.map((g) => (
        <section key={g.id}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><g.icon className="h-4 w-4 text-accent-2" /> {g.title}</h2>
            <span className="text-xs text-muted">{g.blurb}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => <ShopCard key={it.key} it={it} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function ShopCard({ it }: { it: ShopItem }) {
  const me = useOnboardedMe()!;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const owned = me.unlocks.includes(it.key);
  const locked = !!it.requires && !me.unlocks.includes(it.requires);
  const can = affordable(it.cost, me.balances);
  const palette = it.kind === 'palette' ? Object.values(PALETTES).find((p) => p.unlock === it.key) : null;
  return (
    <div className={cn('glass flex flex-col gap-2 rounded-3xl p-4', owned && 'border-ok/40')} data-testid="shop-item" data-key={it.key}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="eyebrow !text-[10px]">{it.kind.replace('_', ' ')}</div>
          <div className="font-bold">{it.name}</div>
        </div>
        {!owned && <Cost cost={it.cost} />}
      </div>
      {palette && (
        <div className="grid grid-cols-8 gap-1">
          {palette.colors.slice(0, 16).map((c, i) => <span key={c + i} className="aspect-square rounded-md border border-line" style={{ background: c }} />)}
        </div>
      )}
      <p className="text-sm text-muted">{it.description}</p>
      <Button size="sm" variant={owned ? 'secondary' : can && !locked ? 'primary' : 'secondary'} disabled={owned || locked || !can} loading={busy} className="mt-auto justify-self-start" data-testid="shop-buy" onClick={async () => {
        setBusy(true);
        try { await api.purchaseUnlock(it.key); toast.success(`${it.name} unlocked`); invalidateGame(qc); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
      }}>
        {owned ? <><Check className="h-4 w-4" /> Owned</> : locked ? <><Lock className="h-4 w-4" /> Buy the previous one first</> : can ? 'Buy' : 'Not enough yet'}
      </Button>
    </div>
  );
}
