// Dress up your explorer: body, skin, face and hair matched to your explorer's sex, then hats, outfits, held items,
// auras and trails (bought with Ink, won at arcades, or unlocked by ultra plots).
import { useQueryClient } from '@tanstack/react-query';
import { Check, Footprints, Lock, RotateCcw, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ExplorerPart, ExplorerStyle, ShopItem } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { Button, Cost, Spinner } from '../ui';
import { ExplorerFigure } from './ExplorerFigure';
import { HAIR_COLOR, SKIN, styleOf } from './character';
import { ultraOfRarity } from './ultra';

type Item = ShopItem & { sex?: 'm' | 'f'; arcade?: boolean; ultra?: string };
const GROUPS: { id: string; label: string; parts: { id: ExplorerPart; label: string }[] }[] = [
  { id: 'body', label: 'Body', parts: [{ id: 'skin', label: 'Skin' }, { id: 'body', label: 'Build' }, { id: 'face', label: 'Face' }] },
  { id: 'hair', label: 'Hair', parts: [{ id: 'hair', label: 'Hairstyle' }, { id: 'hairc', label: 'Hair colour' }] },
  { id: 'style', label: 'Style', parts: [{ id: 'hat', label: 'Hat' }, { id: 'outfit', label: 'Outfit' }, { id: 'hold', label: 'Holding' }] },
  { id: 'fx', label: 'Effects', parts: [{ id: 'aura', label: 'Aura' }, { id: 'trail', label: 'Trail' }] },
];
const ALL_PARTS: ExplorerPart[] = ['sex', 'skin', 'body', 'face', 'hair', 'hairc', 'hat', 'outfit', 'hold', 'aura', 'trail'];
/** what a male or female explorer starts with when the old look doesn't fit */
const SEX_DEFAULT: Record<'m' | 'f', Partial<Record<ExplorerPart, string>>> = { m: { hair: 'short', body: 'classic', face: 'none' }, f: { hair: 'long', body: 'classic', face: 'none' } };
const SWATCH: Partial<Record<ExplorerPart, Record<string, string>>> = { skin: SKIN, hairc: HAIR_COLOR };

const isFree = (it: ShopItem) => !Object.values(it.cost ?? {}).some((v) => Number(v) > 0);
const fits = (it: Item, sex: string) => !it.sex || !sex || it.sex === sex;

export default function ExplorerScreen() {
  const me = useOnboardedMe();
  const world = useWorld();
  const qc = useQueryClient();
  const [group, setGroup] = useState(GROUPS[0].id);
  const [draft, setDraft] = useState<Required<ExplorerStyle> | null>(null);
  const [walking, setWalking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const saved = useMemo(() => styleOf(me?.profile.explorer_style), [me?.profile.explorer_style]);
  useEffect(() => { if (me && !draft) setDraft(saved); }, [me, saved, draft]);
  if (!me || !draft) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const items = (world.data?.shop?.items ?? []).filter((it) => it.kind === 'explorer' && it.enabled !== false) as Item[];
  const owns = (it: ShopItem) => isFree(it) || me.unlocks.includes(it.key);
  const changed = ALL_PARTS.some((p) => draft[p] !== saved[p]);
  const missing = ALL_PARTS.map((p) => items.find((it) => it.part === p && it.id === draft[p])).filter((it): it is Item => !!it && !owns(it));
  const accent = me.profile.accent_color;

  const setSex = (sex: 'm' | 'f') => {
    const next = { ...draft, sex } as Required<ExplorerStyle>;
    for (const p of ['hair', 'body', 'face'] as const) {
      const cur = items.find((it) => it.part === p && it.id === next[p]);
      if (cur && !fits(cur, sex)) next[p] = SEX_DEFAULT[sex][p]!;
    }
    setDraft(next);
  };
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
  const g = GROUPS.find((x) => x.id === group)!;

  return (
    <Page wide>
      <PageHeader eyebrow="Studio" title="Your explorer">
        Shown everywhere you go — the map, planets, farms and arcades. Try anything on, then save your look. Every ultra rarity has its own set: get the plot and it’s yours.
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-6">
        {/* the stage: always in view while you change things */}
        <div className="sticky top-[calc(56px+env(safe-area-inset-top,0px))] z-20 -mt-2 bg-bg pt-2 lg:top-[calc(72px+env(safe-area-inset-top,0px))] lg:mt-0 lg:self-start lg:bg-transparent lg:pt-0">
          <section className="lv-studio-stage relative overflow-hidden rounded-[28px]" style={{ '--room': accent } as CSSProperties} data-testid="explorer-preview">
            <div className="absolute left-3 top-3 z-10 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white backdrop-blur">@{me.profile.username}</div>
            <button onClick={() => setWalking((w) => !w)} aria-pressed={walking} data-testid="explorer-walk"
              className={cn('absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold backdrop-blur transition', walking ? 'bg-white text-[#1b1f3d]' : 'bg-black/40 text-white')}>
              <Footprints className="h-3.5 w-3.5" /> {walking ? 'Walking' : 'Standing'}
            </button>
            <div className="lv-studio-pedestal" aria-hidden />
            <motion.div key={`${draft.sex}`} initial={{ scale: 0.92, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="relative z-[1]">
              <ExplorerFigure style={draft} accent={accent} size={100} walking={walking} className="lv-studio-figure" label="Your explorer" />
            </motion.div>
          </section>
        </div>

        <div className="grid min-w-0 content-start gap-4 pb-28">
          {/* male / female */}
          <div className="grid grid-cols-2 gap-2" data-testid="explorer-sex">
            {([['m', '♂ Male'], ['f', '♀ Female']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setSex(id)} aria-pressed={draft.sex === id} data-testid={`explorer-sex-${id}`}
                className={cn('rounded-2xl py-3 text-sm font-black transition active:scale-[0.98]', draft.sex === id ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'bg-surface-2/70 text-muted hover:text-fg')}>{label}</button>
            ))}
          </div>
          {!draft.sex && <p className="-mt-2 text-center text-xs text-muted">Pick male or female to see hair, builds and faces made for them.</p>}

          {/* groups */}
          <div className="flex gap-1 rounded-full border border-line bg-surface/80 p-1" role="tablist">
            {GROUPS.map((x) => (
              <button key={x.id} role="tab" aria-selected={group === x.id} onClick={() => setGroup(x.id)} data-testid={`explorer-group-${x.id}`}
                className={cn('relative flex-1 rounded-full py-2 text-[13px] font-bold transition', group === x.id ? 'text-white' : 'text-muted hover:text-fg')}>
                {group === x.id && <motion.span layoutId="explorer-group" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="relative">{x.label}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-5" data-testid="explorer-items">
            {g.parts.map(({ id: part, label }) => {
              const sw = SWATCH[part];
              const list = items.filter((it) => it.part === part && fits(it, draft.sex))
                .sort((a, b) => (sw ? Object.keys(sw).indexOf(a.id!) - Object.keys(sw).indexOf(b.id!) : 0));
              return (
                <section key={part} data-testid={`explorer-part-${part}`}>
                  <h3 className="mb-2 flex items-baseline justify-between text-sm font-black">{label}<span className="text-xs font-normal text-muted">{list.find((it) => it.id === draft[part])?.name}</span></h3>
                  {sw ? (
                    <div className="flex flex-wrap gap-2.5">
                      {list.map((it) => (
                        <button key={it.key} onClick={() => setDraft({ ...draft, [part]: it.id! })} aria-pressed={draft[part] === it.id} aria-label={it.name} title={it.name}
                          data-testid="explorer-item" data-key={it.key}
                          className={cn('h-10 w-10 rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)] transition hover:scale-110', draft[part] === it.id ? 'ring-[3px] ring-accent-2 ring-offset-2 ring-offset-bg' : 'ring-1 ring-white/15')}
                          style={{ background: sw[it.id!] ?? '#888' }} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                      {list.map((it) => {
                        const on = draft[part] === it.id;
                        const own = owns(it);
                        const ut = ultraOfRarity(it.ultra);
                        return (
                          <button key={it.key} onClick={() => setDraft({ ...draft, [part]: it.id! })} aria-pressed={on} data-testid="explorer-item" data-key={it.key}
                            className={cn('flex flex-col items-center gap-1 rounded-2xl bg-surface-2/50 p-2 text-center transition hover:-translate-y-0.5 hover:bg-surface-2', on && 'bg-surface-2 ring-2 ring-accent-2')}
                            style={ut && own ? { boxShadow: `inset 0 0 0 1px ${ut.a}88` } : undefined}>
                            <div className={cn('flex h-[78px] w-full items-end justify-center overflow-hidden rounded-xl bg-bg-2/60', ['hair', 'face', 'hat'].includes(part) && 'items-start pt-1')}>
                              <ExplorerFigure style={{ ...draft, [part]: it.id }} accent={accent} size={['hair', 'face', 'hat'].includes(part) ? 84 : 48} walking={part === 'trail' && it.id !== 'none'} />
                            </div>
                            <div className="min-h-[2.4em] text-[11.5px] font-bold leading-tight">{it.name}</div>
                            <div className="text-[10.5px]">
                              {saved[part] === it.id ? <span className="font-bold text-ok">Wearing</span> : own ? <span className="flex items-center gap-0.5 text-muted"><Check className="h-3 w-3" /> {isFree(it) ? 'Free' : 'Owned'}</span>
                                : ut ? <span className="flex items-center gap-0.5 font-bold" style={{ color: ut.a }} data-testid="ultra-lock"><Lock className="h-3 w-3" />{ut.emoji} {ut.name} plot</span>
                                : it.arcade ? <span className="flex items-center gap-0.5 font-bold text-[#FF3D9A]"><Lock className="h-3 w-3" />🎟️ {Number((it.cost as Record<string, number>).tickets ?? 0).toLocaleString()}</span>
                                : <span className="flex items-center gap-0.5"><Lock className="h-3 w-3 text-gold" /><Cost cost={it.cost} /></span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {/* save bar */}
      <div className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-30 mx-auto max-w-3xl md:bottom-4" data-testid="explorer-savebar">
        <div className="grid gap-2 rounded-3xl border border-line bg-surface p-3 shadow-2xl">
          {missing.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {missing.map((m) => {
                const ut = ultraOfRarity(m.ultra);
                if (ut) return <span key={m.key} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: `${ut.a}22`, color: ut.a }}>{ut.emoji} {m.name}: unlocked for good when you get a {ut.name} plot</span>;
                if (m.arcade) return <span key={m.key} className="rounded-xl bg-[#FF3D9A]/15 px-3 py-2 text-xs font-bold text-[#FF3D9A]">🕹️ {m.name}: win it with {Number((m.cost as Record<string, number>).tickets ?? 0).toLocaleString()} tickets at an arcade</span>;
                const ink = Number(m.cost.ink ?? 0);
                const can = Number(me.balances.ink) >= ink;
                return (
                  <Button key={m.key} size="sm" variant={can ? 'primary' : 'secondary'} disabled={!can} loading={busy === m.key} onClick={() => buy(m)} data-testid="explorer-buy">
                    {can ? <>Buy {m.name} · <Cost cost={m.cost} /></> : `${m.name}: need ${fmt(ink - Number(me.balances.ink))} more Ink`}
                  </Button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="rainbow" className="flex-1" disabled={!changed || missing.length > 0} loading={busy === 'save'} onClick={save} data-testid="explorer-save"><Save className="h-4 w-4" /> {changed ? 'Save look' : 'This is your look'}</Button>
            <Button variant="ghost" disabled={!changed} onClick={() => setDraft(saved)} aria-label="Undo changes"><RotateCcw className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </Page>
  );
}
