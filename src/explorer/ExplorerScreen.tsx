// Dress up your explorer: hats, held tools, outfits, trails and auras bought with Ink.
import { useQueryClient } from '@tanstack/react-query';
import { Check, Footprints, Lock, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ExplorerPart, ExplorerStyle, ShopItem } from '../backend/types';
import { Page, PageHeader, ResourceBar } from '../app/Shell';
import { invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { Button, Cost, Spinner, Tabs } from '../ui';
import { ExplorerFigure } from './ExplorerFigure';
import { styleOf } from './character';

const PARTS: { id: ExplorerPart; label: string }[] = [
  { id: 'hat', label: 'Hat' },
  { id: 'hold', label: 'Holding' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'trail', label: 'Trail' },
  { id: 'aura', label: 'Aura' },
];

const isFree = (it: ShopItem) => !Object.values(it.cost ?? {}).some((v) => Number(v) > 0);

export default function ExplorerScreen() {
  const me = useOnboardedMe();
  const world = useWorld();
  const qc = useQueryClient();
  const [part, setPart] = useState<ExplorerPart>('hat');
  const [draft, setDraft] = useState<Required<ExplorerStyle> | null>(null);
  const [walking, setWalking] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const saved = useMemo(() => styleOf(me?.profile.explorer_style), [me?.profile.explorer_style]);
  useEffect(() => { if (me && !draft) setDraft(saved); }, [me, saved, draft]);
  if (!me || !draft) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const items = (world.data?.shop?.items ?? []).filter((it) => it.kind === 'explorer' && it.enabled !== false);
  const owns = (it: ShopItem) => isFree(it) || me.unlocks.includes(it.key);
  const byPart = items.filter((it) => it.part === part);
  const changed = PARTS.some((p) => draft[p.id] !== saved[p.id]);
  const missing = PARTS.map((p) => items.find((it) => it.part === p.id && it.id === draft[p.id])).filter((it): it is ShopItem => !!it && !owns(it));
  const accent = me.profile.accent_color;

  const buy = async (it: ShopItem) => {
    setBusy(it.key);
    try {
      await api.purchaseUnlock(it.key);
      toast.success(`${it.name} is yours`);
      invalidateGame(qc);
      await qc.invalidateQueries({ queryKey: qk.me });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    try {
      await api.equipExplorer(draft);
      toast.success('New look saved — everyone sees it now');
      await qc.invalidateQueries({ queryKey: qk.me });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };

  return (
    <Page wide>
      <PageHeader eyebrow="Studio" title="Your explorer" actions={<ResourceBar />}>
        Your explorer walks the map for you and greets visitors in your room. Try anything on, buy what you love with Ink, then save your look.
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section className="lv-room-stage lg:sticky lg:top-5 lg:self-start" style={{ ['--room' as string]: accent, gridTemplateRows: 'minmax(230px,1fr) 92px' }} data-testid="explorer-preview">
          <div className="lv-room-wall items-center justify-center">
            <div className="lv-room-sign self-center"><span className="px-2 text-sm font-bold">@{me.profile.username}</span></div>
          </div>
          <div className="lv-room-floor">
            <div className="lv-room-spot" />
            <ExplorerFigure style={draft} accent={accent} size={96} walking={walking} className="lv-room-explorer" />
          </div>
        </section>
        <div className="grid content-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={part} onValueChange={(v) => setPart(v as ExplorerPart)} items={PARTS.map((p) => ({ value: p.id, label: p.label }))} />
            <Button size="sm" variant={walking ? 'secondary' : 'ghost'} onClick={() => setWalking((w) => !w)} aria-pressed={walking}><Footprints className="h-4 w-4" /> {walking ? 'Walking' : 'Standing'}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" data-testid="explorer-items">
            {byPart.map((it) => {
              const on = draft[part] === it.id;
              const own = owns(it);
              return (
                <button key={it.key} onClick={() => setDraft({ ...draft, [part]: it.id! })} aria-pressed={on} data-testid="explorer-item" data-key={it.key}
                  className={cn('glass flex flex-col items-center gap-2 rounded-3xl p-3 text-center transition hover:-translate-y-0.5', on && 'ring-2 ring-accent-2')}>
                  <div className="flex h-24 w-full items-end justify-center rounded-2xl bg-bg-2/60 pb-1">
                    <ExplorerFigure style={{ ...draft, [part]: it.id }} accent={accent} size={50} walking={part === 'trail' && it.id !== 'none'} />
                  </div>
                  <div className="min-h-[2.5em] text-[13px] font-bold leading-tight">{it.name}</div>
                  <div className="text-xs">
                    {saved[part] === it.id ? <span className="font-bold text-ok">Wearing</span> : own ? <span className="flex items-center gap-1 text-muted"><Check className="h-3.5 w-3.5" /> Owned</span> : <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-gold" /><Cost cost={it.cost} /></span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="glass sticky bottom-[calc(76px+env(safe-area-inset-bottom,0px))] grid gap-3 rounded-3xl p-4 md:bottom-4">
            {missing.length > 0 ? (
              <div className="grid gap-2">
                <div className="text-sm"><b>Buy to wear this look:</b> <span className="text-muted">{missing.map((m) => m.name).join(', ')}</span></div>
                <div className="flex flex-wrap gap-2">
                  {missing.map((m) => {
                    const ink = Number(m.cost.ink ?? 0);
                    const can = Number(me.balances.ink) >= ink;
                    return (
                      <Button key={m.key} size="sm" variant={can ? 'primary' : 'secondary'} disabled={!can} loading={busy === m.key} onClick={() => buy(m)} data-testid="explorer-buy">
                        {can ? <>Buy {m.name} · <Cost cost={m.cost} /></> : `${m.name}: need ${fmt(ink - Number(me.balances.ink))} more Ink`}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{changed ? 'Looking good. Save it so everyone sees it.' : 'This is your current look.'}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="rainbow" disabled={!changed || missing.length > 0} loading={busy === 'save'} onClick={save} data-testid="explorer-save"><Save className="h-4 w-4" /> Save look</Button>
              <Button variant="ghost" disabled={!changed} onClick={() => setDraft(saved)}><RotateCcw className="h-4 w-4" /> Undo changes</Button>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
