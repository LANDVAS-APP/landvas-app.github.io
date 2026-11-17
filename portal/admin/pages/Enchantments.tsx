// Admin → Enchantments: the Enchantment editor. Every number that shapes each enchantment, live — its power dials
// (Ink paid, star and level bonus, XP, Luck), every number in its rules (found in the server code itself, so nothing is
// missing: each shows its default and the line of code it sits on), how often it rolls, and the words players read
// (tagline, how-it-works lines, the five star powers). Server: supabase/migrations/20261119000415_enchant_editor.sql.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, Search } from 'lucide-react';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import type { EnchantEditor, EnchantEditorKind, EnchantTunable } from '../../../src/backend/types';
import { KINDS, kindInfo } from '../../../src/enchant/kinds';
import { cn } from '../../../src/lib/utils';
import { DIALS, GLOBAL, LABELS, UNIT_SUFFIX, prettyKey, readable, type Label } from '../../../src/admin/enchantLabels';
import { ago, int } from '../../shared/format';
import { Badge, PageHeader, Panel, Q } from '../../shared/ui';

const KEY = ['admin', 'enchant-editor'];
type Draft = Record<string, number | null>;
const info = (k: string) => (k in KINDS ? kindInfo(k as never) : { name: k === 'cuckoo' ? 'Cuckoo Egg' : prettyKey(k), emoji: k === 'cuckoo' ? '🥚' : '✨', a: '#7B5CFF', b: '#22E3FF', tagline: '', how: [] as string[] });
const changedCount = (k: EnchantEditorKind) => [...k.tunables, ...k.dials].filter((t) => t.value != null).length + (Number(k.weight) !== 1 ? 1 : 0);

export default function EnchantmentsPage() {
  const q = useQuery({ queryKey: KEY, queryFn: api.admin.enchantEditor });
  const [sel, setSel] = useState<string>('sun');
  const [find, setFind] = useState('');
  // (on a phone the editor sits under the list: picking one brings it into view)
  const pick = (k: string) => {
    setSel(k);
    if (matchMedia('(max-width: 1023px)').matches) setTimeout(() => document.querySelector('[data-testid=enchant-panel]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  return (
    <>
      <PageHeader title="Enchantments" sub="The Enchantment editor: every number that shapes each enchantment — its powers, multipliers, timers and odds — plus the words players read. Changes are live for everyone at once and recorded in the audit log." />
      <Q q={q} label="Loading every enchantment…">{(d: EnchantEditor) => {
        const kinds = [...d.kinds].sort((a, b) => info(a.kind).name.localeCompare(info(b.kind).name));
        const shown = find.trim() ? kinds.filter((k) => matches(k, find)) : kinds;
        const cur = sel === 'global' ? null : d.kinds.find((k) => k.kind === sel) ?? kinds[0];
        return (
          <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]" data-testid="enchant-editor">
            <div className="grid content-start gap-2">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface/70 px-3">
                <Search className="h-4 w-4 text-muted" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Find a number (e.g. “shiny”, “fuel”)" value={find} onChange={(e) => setFind(e.target.value)} data-testid="enchant-find" />
              </label>
              <button onClick={() => pick('global')} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-bold', sel === 'global' ? 'border-accent bg-accent/10' : 'border-line')} data-testid="enchant-kind-global">
                <span className="text-lg">🔮</span><span className="flex-1">All enchantments</span><span className="text-[11px] font-semibold text-muted">odds</span>
              </button>
              <div className="grid max-h-[46vh] gap-1 overflow-y-auto pr-1 scroll-thin lg:max-h-[70vh]">
                {shown.map((k) => {
                  const i = info(k.kind); const n = changedCount(k);
                  return (
                    <button key={k.kind} onClick={() => pick(k.kind)} data-testid={`enchant-kind-${k.kind}`}
                      className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm', cur?.kind === k.kind && sel !== 'global' ? 'border-accent bg-accent/10' : 'border-line hover:bg-white/5')}>
                      <span className="text-lg">{i.emoji}</span>
                      <span className="min-w-0 flex-1"><b className="block truncate">{i.name}</b><span className="text-[11px] text-muted">{k.tunables.length + k.dials.length} numbers · {int(k.pop.alive)} alive</span></span>
                      {n > 0 && <Badge tone="gold">{n} changed</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid scroll-mt-20 content-start gap-3" data-testid="enchant-panel">
              {sel === 'global' || !cur ? <GlobalCard g={d.global} /> : <KindEditor key={cur.kind} k={cur} find={find} />}
              <History d={d} />
            </div>
          </div>
        );
      }}</Q>
    </>
  );
}

function matches(k: EnchantEditorKind, s: string) {
  const f = s.toLowerCase();
  if (info(k.kind).name.toLowerCase().includes(f)) return true;
  return [...k.tunables, ...k.dials].some((t) => t.key.includes(f) || (labelOf(k.kind, t.key).label.toLowerCase().includes(f)));
}
const labelOf = (kind: string, key: string): Label => LABELS[kind]?.[key] ?? DIALS[key] ?? { label: prettyKey(key) };

function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, values }: { kind: string; values: Record<string, number | boolean | null> }) => api.admin.setEnchantTuning(kind, values),
    onSuccess: (d, v) => { qc.setQueryData(KEY, d); void qc.invalidateQueries({ queryKey: ['admin', 'config'] }); toast.success(`${v.kind === 'global' ? 'Shared settings' : info(v.kind).name} saved`, { description: 'Live for everyone now. Recorded in the audit log.' }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
}

/** one number: its label, what it does, the default, the input, reset, and where it lives in the code */
function NumberRow({ kind, t, draft, setDraft }: { kind: string; t: EnchantTunable; draft: Draft; setDraft(d: Draft): void }) {
  const l = labelOf(kind, t.key);
  const has = t.key in draft;
  const cur = has ? draft[t.key] : t.value ?? null;
  const shownVal = cur ?? t.def;
  const changed = cur != null && Number(cur) !== Number(t.def);
  const [where, setWhere] = useState(false);
  return (
    <div className={cn('grid gap-1 rounded-xl border px-3 py-2', changed ? 'border-gold/50 bg-gold/5' : 'border-line')} data-testid={`num-${t.key}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-semibold leading-tight">{l.label}{changed && <span className="ml-2 text-[11px] font-bold text-gold">changed</span>}</span>
        <input type="number" step="any" className="h-9 w-24 shrink-0 rounded-lg border border-line bg-surface/80 px-2 text-right font-mono text-sm tnum" aria-label={l.label}
          value={Number.isFinite(Number(shownVal)) ? String(shownVal) : ''} onChange={(e) => setDraft({ ...draft, [t.key]: e.target.value === '' ? null : Number(e.target.value) })} data-testid={`input-${t.key}`} />
        <span className="w-12 shrink-0 text-[11px] text-muted">{readable(Number(shownVal), l.unit) || (l.unit ? UNIT_SUFFIX[l.unit] : '')}</span>
        <button title="Back to its default" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/10 disabled:opacity-30" disabled={cur == null && !has}
          onClick={() => setDraft({ ...draft, [t.key]: null })} data-testid={`reset-${t.key}`}><RotateCcw className="h-4 w-4" /></button>
      </div>
      {(l.hint || t.line) && (
        <div className="text-[11px] text-muted">
          <span className="text-faint">default {t.def}{l.unit ? ` ${UNIT_SUFFIX[l.unit]}` : ''}{readable(Number(t.def), l.unit) ? ` (${readable(Number(t.def), l.unit)})` : ''}</span>{l.hint ? ' · ' : ' '}{l.hint}{' '}
          <button className="font-semibold underline decoration-dotted" onClick={() => setWhere(!where)}>{where ? 'hide where' : 'where it’s used'}</button>
          {where && <code className="mt-1 block whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2 font-mono text-[10.5px] text-white/70">{t.line}{'\n'}— in {t.fns.join(', ')}</code>}
        </div>
      )}
    </div>
  );
}

function KindEditor({ k, find }: { k: EnchantEditorKind; find: string }) {
  const save = useSave();
  const i = info(k.kind);
  const [draft, setDraft] = useState<Draft>({});
  const [weight, setWeight] = useState<number>(Number(k.weight));
  useEffect(() => { setDraft({}); setWeight(Number(k.weight)); }, [k]);
  const f = find.trim().toLowerCase();
  const filt = (t: EnchantTunable) => !f || t.key.includes(f) || labelOf(k.kind, t.key).label.toLowerCase().includes(f);
  // the numbers in groups (as labelled), the rest under "Other numbers"
  const groups = useMemo(() => {
    const m = new Map<string, EnchantTunable[]>();
    for (const t of k.tunables.filter(filt)) {
      const g = LABELS[k.kind]?.[t.key]?.group ?? (LABELS[k.kind]?.[t.key] ? 'Its numbers' : 'Other numbers');
      m.set(g, [...(m.get(g) ?? []), t]);
    }
    return [...m.entries()];
  }, [k, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = Object.keys(draft).filter((key) => {
    const t = [...k.tunables, ...k.dials].find((x) => x.key === key);
    return t && (draft[key] ?? null) !== (t.value ?? null);
  });
  const weightChanged = weight !== Number(k.weight);
  const n = pending.length + (weightChanged ? 1 : 0);
  const bad = pending.some((key) => draft[key] != null && !Number.isFinite(Number(draft[key])));
  const doSave = () => {
    const values: Record<string, number | null> = Object.fromEntries(pending.map((key) => [key, draft[key] == null ? null : Number(draft[key])]));
    if (weightChanged) values.weight = weight === 1 ? null : weight;
    save.mutate({ kind: k.kind, values });
  };
  return (
    <>
      <Panel title={<span className="flex items-center gap-2"><span className="text-2xl">{i.emoji}</span>{i.name}</span>}
        actions={<div className="flex items-center gap-2">
          {n > 0 && <button className="text-xs font-bold text-muted hover:text-fg" onClick={() => { setDraft({}); setWeight(Number(k.weight)); }}>Discard</button>}
          <button disabled={!n || bad || save.isPending} onClick={doSave} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" data-testid="enchant-save">
            {save.isPending ? 'Saving…' : n ? `Save ${n} change${n === 1 ? '' : 's'}` : 'Saved'}</button>
        </div>}>
        {i.tagline && <p className="mb-3 text-sm text-muted">{k.texts.tagline ?? i.tagline}</p>}
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>{int(k.pop.alive)} alive now</span><span>{int(k.pop.minted)} ever made</span><span>{k.tunables.length} numbers + {k.dials.length} power dials</span></div>
        <div className="grid gap-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-muted">Power dials</div>
          <div className="grid gap-1.5 md:grid-cols-2">
            {k.dials.filter(filt).map((t) => <NumberRow key={t.key} kind={k.kind} t={t} draft={draft} setDraft={setDraft} />)}
            {(!f || 'roll weight how often'.includes(f)) && (
              <div className={cn('grid gap-1 rounded-xl border px-3 py-2', weightChanged || Number(k.weight) !== 1 ? 'border-gold/50 bg-gold/5' : 'border-line')} data-testid="num-weight">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-tight">How often it rolls (weight)</span>
                  <input type="number" min={0} step="any" className="h-9 w-24 shrink-0 rounded-lg border border-line bg-surface/80 px-2 text-right font-mono text-sm" value={weight} onChange={(e) => setWeight(Number(e.target.value))} data-testid="input-weight" />
                  <button title="Back to its default" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/10" onClick={() => setWeight(1)}><RotateCcw className="h-4 w-4" /></button>
                </div>
                <div className="text-[11px] text-muted"><span className="text-faint">default 1</span> · Compared with the other enchantments when a roll turns Enchanted. 2 = twice as likely, 0 = never rolls (the ones out there keep working).</div>
              </div>
            )}
          </div>
          {groups.map(([g, ts]) => (
            <div key={g} className="grid gap-1.5">
              <div className="mt-2 text-[11px] font-black uppercase tracking-wider text-muted">{g}</div>
              <div className="grid gap-1.5 md:grid-cols-2">{ts.map((t) => <NumberRow key={t.key} kind={k.kind} t={t} draft={draft} setDraft={setDraft} />)}</div>
            </div>
          ))}
          {!groups.length && f && <p className="text-sm text-muted">No number here matches “{find}”.</p>}
        </div>
      </Panel>
      <WordsCard k={k} />
    </>
  );
}

/** what players read: the tagline, how it works, the five star powers */
function WordsCard({ k }: { k: EnchantEditorKind }) {
  const qc = useQueryClient();
  const i = info(k.kind);
  const init = () => ({
    tagline: k.texts.tagline ?? i.tagline ?? '',
    how: (k.texts.how ?? i.how ?? []).join('\n'),
    stars: (k.star_powers?.length === 5 ? k.star_powers : Array.from({ length: 5 }, (_, n) => k.star_powers?.[n] ?? { name: '', emoji: '⭐', text: '' })).map((p) => ({ ...p })),
  });
  const [w, setW] = useState(init);
  useEffect(() => setW(init()), [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const custom = !!(k.texts.tagline || k.texts.how || k.texts.star_powers);
  const save = useMutation({
    mutationFn: (texts: Parameters<typeof api.admin.setEnchantTexts>[1]) => api.admin.setEnchantTexts(k.kind, texts),
    onSuccess: (d) => { qc.setQueryData(KEY, d); toast.success(`${i.name}: words saved`, { description: 'Players see them the next time the game loads.' }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  const starsOk = w.stars.every((p) => p.name.trim() && p.text.trim());
  return (
    <Panel title="What players read" actions={<div className="flex items-center gap-2">
      {custom && <button className="text-xs font-bold text-muted hover:text-fg" onClick={() => save.mutate(null)} data-testid="words-reset">Back to the built-in words</button>}
      <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" disabled={!starsOk || save.isPending} data-testid="words-save"
        onClick={() => save.mutate({ tagline: w.tagline, how: w.how.split('\n').map((l) => l.trim()).filter(Boolean), star_powers: w.stars })}>Save words</button>
    </div>}>
      <p className="mb-3 text-xs text-muted">Change a number above? Change the words that mention it here, so what players read stays true. {custom ? <Badge tone="gold">custom words</Badge> : <Badge>built-in words</Badge>}</p>
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold">Tagline
          <input className="h-9 rounded-lg border border-line bg-surface/80 px-2 text-sm font-normal" maxLength={200} value={w.tagline} onChange={(e) => setW({ ...w, tagline: e.target.value })} data-testid="words-tagline" />
        </label>
        <label className="grid gap-1 text-xs font-semibold">How it works <span className="font-normal text-muted">(one line each)</span>
          <textarea className="min-h-32 rounded-lg border border-line bg-surface/80 p-2 text-sm font-normal" value={w.how} onChange={(e) => setW({ ...w, how: e.target.value })} data-testid="words-how" />
        </label>
        <div className="grid gap-1.5">
          <div className="text-xs font-semibold">The five star powers</div>
          {w.stars.map((p, n) => (
            <div key={n} className="grid grid-cols-[40px_56px_minmax(0,160px)_minmax(0,1fr)] items-center gap-1.5" data-testid={`words-star-${n + 1}`}>
              <span className="text-xs font-black text-gold">{'★'.repeat(n + 1).slice(0, 5)}</span>
              <input className="h-9 rounded-lg border border-line bg-surface/80 px-2 text-center" maxLength={8} value={p.emoji} aria-label={`Star ${n + 1} emoji`} onChange={(e) => setW({ ...w, stars: w.stars.map((x, j) => (j === n ? { ...x, emoji: e.target.value } : x)) })} />
              <input className="h-9 rounded-lg border border-line bg-surface/80 px-2 text-sm" maxLength={40} value={p.name} aria-label={`Star ${n + 1} name`} onChange={(e) => setW({ ...w, stars: w.stars.map((x, j) => (j === n ? { ...x, name: e.target.value } : x)) })} />
              <input className="h-9 rounded-lg border border-line bg-surface/80 px-2 text-sm" maxLength={300} value={p.text} aria-label={`Star ${n + 1} text`} onChange={(e) => setW({ ...w, stars: w.stars.map((x, j) => (j === n ? { ...x, text: e.target.value } : x)) })} />
            </div>
          ))}
          <p className="text-[11px] text-faint">The star powers’ numbers live in the numbers above (look for “★”); these are the words for them.</p>
        </div>
      </div>
    </Panel>
  );
}

function GlobalCard({ g }: { g: EnchantEditor['global'] }) {
  const save = useSave();
  const [v, setV] = useState(g);
  useEffect(() => setV(g), [g]);
  const keys = Object.keys(GLOBAL) as (keyof typeof GLOBAL)[];
  const changed = keys.filter((k) => Number((v as any)[k]) !== Number((g as any)[k]));
  const n = changed.length + (v.enabled !== g.enabled ? 1 : 0);
  return (
    <Panel title="🔮 All enchantments" actions={<button disabled={!n || save.isPending} onClick={() => save.mutate({ kind: 'global', values: { ...Object.fromEntries(changed.map((k) => [k, Number((v as any)[k])])), ...(v.enabled !== g.enabled ? { enabled: v.enabled } : {}) } })}
      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" data-testid="global-save">{n ? `Save ${n} change${n === 1 ? '' : 's'}` : 'Saved'}</button>}>
      <button onClick={() => setV({ ...v, enabled: !v.enabled })} className={cn('mb-3 rounded-full border px-3 py-1.5 text-xs font-bold', v.enabled ? 'border-ok/60 bg-ok/15 text-ok' : 'border-bad/60 bg-bad/10 text-bad')} data-testid="global-enabled">
        {v.enabled ? '✓ Plot rolls can turn Enchanted' : '✕ Enchanted rolls are off (the ones out there keep working)'}
      </button>
      <div className="grid gap-2 sm:grid-cols-2">
        {keys.map((k) => (
          <label key={k} className="grid gap-0.5 rounded-xl border border-line px-3 py-2">
            <span className="text-xs font-semibold">{GLOBAL[k].label}</span>
            <input type="number" step="any" className="h-9 rounded-lg border border-line bg-surface/80 px-2 font-mono text-sm" value={(v as any)[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} data-testid={`global-${k}`} />
            {GLOBAL[k].hint && <span className="text-[11px] text-faint">{GLOBAL[k].hint}</span>}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">How often each kind turns up is its own “How often it rolls” — pick an enchantment on the left.</p>
    </Panel>
  );
}

function History({ d }: { d: EnchantEditor }) {
  if (!d.history.length) return null;
  return (
    <Panel title="Recent changes">
      <div className="grid gap-1 text-xs" data-testid="enchant-history">
        {d.history.slice(0, 15).map((h, n) => (
          <div key={n} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
            <span>{h.kind === 'global' ? '🔮' : info(h.kind).emoji}</span>
            <b>{h.kind === 'global' ? 'All enchantments' : info(h.kind).name}</b>
            <span className="text-muted">{h.action === 'enchant.texts' ? 'words changed' : Object.entries(h.details?.to ?? {}).map(([key, val]) => `${labelOf(h.kind, key).label}: ${val ?? 'default'}`).join(' · ')}</span>
            <span className="ml-auto text-faint">{h.by ? `@${h.by} · ` : ''}{ago(h.at)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
