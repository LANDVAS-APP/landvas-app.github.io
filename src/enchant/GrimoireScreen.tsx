// The Grimoire: your enchantments, what's visiting your land, the ten kinds in the world, and your Splice Codex — and
// each enchantment's own page: its sigil, its mint number, its level and titles, its living scene and its chronicle.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type EnchantView, type EnchantVisitor } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { toMap } from '../lib/toMap';
import { cn, fmt, timeAgo } from '../lib/utils';
import { buzz } from '../native/native';
import { cellCenter } from '../shared/grid';
import { Button, Empty, Spinner, Tabs, inputCls } from '../ui';
import { EnchantFxLayer, centerOf, efx, useAct, useEnchant, useMyEnchantments, useVisitors } from './core';
import { ABERRATIONS, ABERRATION_COUNT, EVILS, HYBRIDS, HYBRID_COUNT, KINDS, KIND_ORDER, PERFECT_COUNT, SPLICE_MODES, TITLES, dur, enchantName, hybridCard, hybridKey, kindInfo, traitText, type EnchantKind, type SpliceMode } from './kinds';
import { HybridCard } from './HybridCard';
import { EvolveAura, MoodVeil, useMood } from './living';
import { PeelOff } from './PeelOff';
import { SceneFor } from './scenes';
import { WarpTunnel } from './scenes/WormholeScene';
import { Sigil } from './Sigil';
import './enchant.css';

export default function GrimoireScreen() {
  const { id } = useParams();
  return (
    <div className="lv-grim-page min-h-full">
      <EnchantFxLayer />
      {id ? <Detail id={id} /> : <Home />}
    </div>
  );
}

// ---- the book ---------------------------------------------------------------------------------------------------------
function Home() {
  const me = useOnboardedMe();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'mine';
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  const best = useQuery({ queryKey: ['enchant-bestiary'], queryFn: api.enchantBestiary, staleTime: 60_000 });
  const list = mine.data ?? [];
  const attn = list.filter((e) => e.attention).length;
  if (!me) return <Page><Empty title="Sign in to open your Grimoire" /></Page>;
  return (
    <Page>
      <header className="mb-5 grid gap-3">
        <div className="flex items-center gap-3">
          <motion.div className="lv-grim-btn shrink-0" initial={{ rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }}><span className="lv-grim-book text-3xl">📖</span></motion.div>
          <div className="grid">
            <h1 className="font-display text-3xl font-black tracking-tight">Grimoire</h1>
            <p className="text-sm text-muted">{list.length ? `${list.length} enchantment${list.length === 1 ? '' : 's'}${attn ? ` · ${attn} need${attn === 1 ? 's' : ''} you` : ''}` : `Enchantments live on plots — ${best.data ? `${best.data.chance.base}% of plot rolls come out` : 'some plot rolls come out'} Enchanted.`}</p>
          </div>
        </div>
        {best.data && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#B26BFF]/30 bg-[#B26BFF]/10 px-3 py-2 text-[12px]" data-testid="grimoire-chance">
            <span className="font-black text-[#E5CCFF]">✨ Your next roll: {best.data.chance.base + best.data.chance.charges * best.data.chance.step}% Enchanted</span>
            <span className="text-white/60">{best.data.chance.charges ? `(${best.data.chance.charges} Enchanted Luck charge${best.data.chance.charges === 1 ? '' : 's'})` : 'Buy Enchanted Luck at the Altar of Luck to raise it.'}</span>
          </div>
        )}
      </header>
      <SpliceInvites />
      <Tabs value={tab} onValueChange={(t) => setSp((p) => { p.set('tab', t); return p; }, { replace: true })} className="mb-4"
        items={[{ value: 'mine', label: `Enchantments${list.length ? ` · ${list.length}` : ''}` }, { value: 'visitors', label: `On my land${visitors.data?.length ? ` · ${visitors.data.length}` : ''}` }, { value: 'bestiary', label: 'Bestiary' }, { value: 'codex', label: 'Codex' }]} />
      {tab === 'mine' && (mine.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : list.length ? (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="grimoire-list">{list.map((e, i) => <Card key={e.id} e={e} i={i} />)}</div>
      ) : (
        <Empty icon={<span className="text-3xl">✨</span>} title="No enchantments yet" action={<Link to="/world"><Button variant="rainbow">Roll a plot</Button></Link>}>
          Every plot roll has a {best.data?.chance.base ?? 2}% chance to come out Enchanted — an enchantment in place of a rarity. Raise the odds with Enchanted Luck at the Altar of Luck.
        </Empty>
      ))}
      {tab === 'visitors' && <Visitors list={visitors.data ?? []} loading={visitors.isLoading} />}
      {tab === 'bestiary' && <Bestiary data={best.data} />}
      {tab === 'codex' && <Codex codex={best.data?.codex ?? []} trinities={best.data?.trinities ?? []} plots={best.data?.plots ?? []} aberrations={best.data?.aberrations ?? []} />}
    </Page>
  );
}

function Card({ e, i }: { e: EnchantView; i: number }) {
  const k = kindInfo(e.reflect_kind ?? e.kind);
  const base = kindInfo(e.kind);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Link to={`/grimoire/${e.id}`} className={cn('lv-ench-card flex items-center gap-3 p-3', e.attention && 'lv-ench-attn')} style={{ ['--a' as string]: base.a }} data-testid="grimoire-card" data-kind={e.kind}>
        <div className="relative shrink-0"><Sigil kind={e.kind} seed={e.sigil} size={74} level={e.level} />
          {e.reflect_kind && <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-[#C0F5FF] text-[14px] shadow">{k.emoji}</span>}</div>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex items-center gap-1.5"><span className="truncate font-display text-[17px] font-black">{enchantName(e)}</span>{e.level > 1 && <span className="rounded-full bg-[#FFD23F]/20 px-1.5 text-[10px] font-black text-[#FFD23F]">LV {e.level}</span>}</div>
          <div className="text-[11px] text-white/60">{base.name} #{e.serial} of {fmt(e.minted)}{e.nickname ? '' : ''} · {e.born_place ?? 'somewhere'}</div>
          {e.partner && <div className="truncate text-[11px] font-black text-[#00F5D4]">🧬 {e.partner.hybrid}</div>}
          {e.clock?.frozen_until && <div className="text-[11px] font-black text-[#C0F5FF]">❄️ frozen</div>}
          <div className={cn('truncate text-[12px] font-bold', e.attention ? 'text-[#FFE8A3]' : 'text-white/45')}>{e.attention ? `✦ ${e.attention}` : base.tagline}</div>
        </div>
      </Link>
    </motion.div>
  );
}

// ---- things on my land -----------------------------------------------------------------------------------------------
function Visitors({ list, loading }: { list: EnchantVisitor[]; loading: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [taps, setTaps] = useState<Record<string, number>>({});
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const run = async (v: EnchantVisitor, action: 'shake' | 'welcome' | 'eject') => {
    try {
      const r = await api.enchantVisitorAct(v.id, action);
      qc.setQueryData(['enchant-visitors'], r.visitors); invalidateGame(qc);
      const at = centerOf(refs.current[v.id]);
      if (action === 'shake') { efx.burst({ ...at, colors: ['#7CFF6B', '#fff'], count: 50, speed: 12, kind: 'drop' }); toast.success(`Shaken off! +${r.result.ink} Ink`); }
      if (action === 'eject') { efx.burst({ ...at, colors: ['#4CC9F0', '#fff'], count: 30, speed: 10, kind: 'emoji', emojis: ['🥚', '💨'] }); toast.success(r.result.rolled_on ? `Thrown out — it rolled into a neighbour’s nest. +${r.result.ink} Ink` : `Thrown out! +${r.result.ink} Ink`); }
      if (action === 'welcome') { efx.burst({ ...at, colors: ['#3DDC97', '#FFD23F'], count: 40, speed: 8, kind: 'emoji', emojis: ['💚'] }); toast.success('Welcomed — you’ll get a bigger share of its meal'); }
    } catch (e) { toast.error(toGameError(e).message); }
  };
  // shaking off takes five quick taps
  const tap = (v: EnchantVisitor) => {
    const n = (taps[v.id] ?? 0) + 1;
    if (useUi.getState().settings.haptics) buzz('light');
    efx.burst({ ...centerOf(refs.current[v.id]), colors: ['#7CFF6B'], count: 8, speed: 5, kind: 'drop' });
    if (n >= 5) { setTaps({ ...taps, [v.id]: 0 }); void run(v, 'shake'); } else setTaps({ ...taps, [v.id]: n });
  };
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!list.length) return <Empty icon={<span className="text-3xl">🌿</span>} title="Nothing on your land">When someone’s Parasite latches onto your plot, or a Cuckoo sneaks an egg into your nest, you’ll find it here — and you can deal with it (and get paid for it).</Empty>;
  return (
    <div className="grid gap-3" data-testid="grimoire-visitors">
      {list.map((v) => {
        const k = kindInfo(v.kind), sym = v.what === 'parasite' && v.stage >= 2, n = taps[v.id] ?? 0;
        const [lng, lat] = cellCenter(v.gx, v.gy);
        return (
          <div key={v.id} ref={(el) => { refs.current[v.id] = el; }} className="lv-ench-card flex flex-wrap items-center gap-3 p-3" style={{ ['--a' as string]: k.a }} data-testid="visitor">
            <motion.span className={cn('text-5xl', v.what === 'parasite' && 'lv-wriggle')} animate={n ? { x: [0, -8, 8, -4, 0], rotate: [0, -12, 12, 0] } : {}} transition={{ duration: 0.25 }} key={n}>{v.what === 'parasite' ? (sym ? '💚' : '🦠') : '🥚'}</motion.span>
            <div className="grid min-w-0 flex-1">
              <span className="font-black">{v.what === 'parasite' ? (sym ? 'A Symbiote is wrapped around your plot — sharing it' : `A Parasite is wrapped around your plot${v.feeds ? ` (fed ${v.feeds}×)` : ''}`) : 'A strange egg is in your nest'}</span>
              <span className="text-[12px] text-white/60">@{v.owner?.username ?? '?'}’s {v.mirror ? 'mirrored ' : ''}{k.name} #{v.serial}{v.what === 'egg' && v.hatch_at ? ` · hatches in ${dur(v.hatch_at - Date.now() / 1000)}` : ''}</span>
              <button className="w-fit text-[11px] font-bold text-[#9BE7FF] underline" onClick={() => toMap(nav, { lng, lat, zoom: 19 })}>Show the plot</button>
            </div>
            {v.what === 'parasite' && !sym && <div className="w-full"><PeelOff v={v} /></div>}
            {sym && !v.welcomed && <Button variant="secondary" onClick={() => void run(v, 'welcome')} data-testid="visitor-welcome">💚 Welcome it</Button>}
            {sym && v.welcomed && <span className="text-[12px] font-black text-[#3DDC97]">Welcomed 💚</span>}
            {v.what === 'egg' && <Button variant="rainbow" onClick={() => void run(v, 'eject')} data-testid="visitor-eject">🥚 Throw it out</Button>}
          </div>
        );
      })}
    </div>
  );
}

// ---- the ten kinds -----------------------------------------------------------------------------------------------------
function Bestiary({ data }: { data: Awaited<ReturnType<typeof api.enchantBestiary>> | undefined }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="grimoire-bestiary">
      {KIND_ORDER.map((id, i) => {
        const k = KINDS[id], d = data?.kinds.find((x) => x.kind === id), owned = (d?.mine ?? 0) > 0;
        return (
          <motion.button key={id} onClick={() => setOpen(open === id ? null : id)} className="lv-ench-card grid gap-2 p-3 text-left" style={{ ['--a' as string]: k.a }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <div className="flex items-center gap-3">
              <span className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-4xl', !owned && 'grayscale-[0.6]')} style={{ background: `radial-gradient(circle, ${k.a}55, transparent 70%)` }}>{k.emoji}</span>
              <div className="grid min-w-0 flex-1">
                <span className="font-display text-[17px] font-black" style={{ color: k.a }}>{k.name}</span>
                <span className="text-[12px] text-white/65">{k.tagline}</span>
                <span className="text-[11px] font-bold text-white/45">{fmt(d?.population ?? 0)} in the world · {owned ? `you have ${d!.mine}` : 'not yet yours'}</span>
              </div>
            </div>
            <AnimatePresence>
              {open === id && (
                <motion.div className="grid gap-1 overflow-hidden text-[12px] text-white/80" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  {k.how.map((h) => <div key={h}>• {h}</div>)}
                  {k.geneText && <div className="mt-1 font-bold text-[#9BF6E5]">🧬 When spliced, it lends its <b>{k.geneName}</b> Trait: the other one {k.geneText}.</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

/** the Codex: a grid of every pairing — what you've made shows its card, the rest are silhouettes */
function Codex({ codex, trinities, plots, aberrations }: { codex: string[]; trinities: string[]; plots: string[]; aberrations: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ks = KIND_ORDER.filter((k) => k !== 'splice');
  const perfectFound = Object.entries(HYBRIDS).filter(([key, [, p]]) => p && codex.includes(key)).length;
  return (
    <div className="grid gap-3" data-testid="grimoire-codex">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#00F5D4]/30 bg-[#00F5D4]/10 px-3 py-2">
        <span className="text-[13px] font-black text-[#9BF6E5]">🧬 Splice Codex — every hybrid you’ve made</span><span className="font-display text-xl font-black text-[#00F5D4]">{codex.length}/{HYBRID_COUNT}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black">
        <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-[16px] text-[#E5CCFF]">{perfectFound}/{PERFECT_COUNT}</div>✦ Perfect Matches</div>
        <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-[16px] text-[#9BF6E5]">{trinities.length}</div>🔺 Trinities</div>
        <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-[16px] text-[#FFB3C7]">{aberrations.length}/{ABERRATION_COUNT}</div>☣️ Aberrations</div>
      </div>
      {/* the grid: a row and a column for every kind */}
      <div className="overflow-x-auto pb-1">
        <div className="lv-codex-grid grid gap-[3px]" style={{ gridTemplateColumns: `28px repeat(${ks.length}, minmax(28px, 1fr))` }}>
          <span />
          {ks.map((k) => <span key={k} className="grid h-7 place-items-center text-[15px]">{KINDS[k].emoji}</span>)}
          {ks.map((r) => [
            <span key={`r${r}`} className="grid h-7 place-items-center text-[15px]">{KINDS[r].emoji}</span>,
            ...ks.map((c) => {
              if (r === c) return <span key={r + c} className="h-7 rounded-md bg-white/[0.02]" />;
              const key = hybridKey(r, c), [name, perfect] = HYBRIDS[key] ?? ['?', false], has = codex.includes(key);
              return (
                <button key={r + c} onClick={() => setOpen(open === key ? null : key)} title={has ? name : perfect ? 'A Perfect Match awaits' : 'Undiscovered'}
                  className={cn('h-7 rounded-md text-[11px] font-black', has ? (perfect ? 'bg-[linear-gradient(135deg,#00F5D4,#B26BFF)] text-[#04211D]' : 'bg-[#00F5D4]/35 text-white') : perfect ? 'border border-dashed border-[#E5CCFF]/50 text-[#E5CCFF]/60' : 'bg-white/[0.04] text-white/20', open === key && 'ring-2 ring-white')}>
                  {has ? (perfect ? '✦' : '●') : perfect ? '✦' : '?'}
                </button>
              );
            }),
          ])}
        </div>
      </div>
      <AnimatePresence>
        {open && (() => { const [a, b] = open.split('+') as EnchantKind[]; const has = codex.includes(open); return (
          <motion.div key={open} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {has ? <HybridCard a={a} b={b} /> : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12.5px] text-white/70">
                <b className="text-white">{KINDS[a].emoji} + {KINDS[b].emoji} = ???</b><div>{hybridCard(a, b).perfect ? '✦ A Perfect Match — both Traits doubled. Splice these two to find out its name.' : 'Undiscovered. Splice a ' + KINDS[a].name + ' with a ' + KINDS[b].name + ' to find it.'}</div>
              </div>
            )}
          </motion.div>
        ); })()}
      </AnimatePresence>
      <div className="grid gap-1.5">
        <div className="text-[12px] font-black uppercase tracking-wider text-white/60">☣️ Aberrations — 1 in 20 Swaps or Chimeras mutates</div>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(ABERRATIONS).map(([name, a]) => { const has = aberrations.includes(name); return (
            <div key={name} className={cn('rounded-xl p-2 text-center text-[10.5px] font-black', has ? 'bg-[#FF5C8A]/20 text-[#FFD1DE]' : 'bg-white/[0.03] text-white/25')} title={has ? a.secret : 'A secret'}>
              <div className="text-[18px]">{has ? a.emoji : '☣️'}</div>{has ? name : '???'}
            </div>
          ); })}
        </div>
      </div>
      {(trinities.length > 0 || plots.length > 0) && (
        <div className="grid gap-1 text-[12px] text-white/75">
          {trinities.map((t) => { const k = t.split('+'); return <div key={t}>🔺 {k.map((x) => KINDS[x as EnchantKind]?.emoji).join('')} {k.map((x) => KINDS[x as EnchantKind]?.name).join(' + ')}</div>; })}
          {plots.map((p) => { const [k, pk] = p.split('@'); return <div key={p}>🏞️ {KINDS[k as EnchantKind]?.emoji} {KINDS[k as EnchantKind]?.name} + a {pk} plot</div>; })}
        </div>
      )}
      <p className="text-center text-[11px] text-white/50">✦ Perfect Matches wear each other’s Traits twice as strong. Make hybrids with a 🧪 Splice enchantment.</p>
    </div>
  );
}

/** a friend wants to splice with one of yours */
function SpliceInvites() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['splice-invites'], queryFn: api.spliceInvites, staleTime: 20_000, refetchInterval: 60_000 });
  if (!q.data?.length) return null;
  const respond = async (id: number, yes: boolean) => {
    try {
      const r = await api.spliceInviteRespond(id, yes);
      qc.setQueryData(['splice-invites'], r.invites); invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['enchantments'] });
      if (yes) { toast.success(`Spliced: ${r.hybrid}!`); efx.burst({ x: innerWidth / 2, y: innerHeight / 3, colors: ['#00F5D4', '#9B5DE5', '#fff'], count: 200, speed: 14, kind: 'spark' }); }
    } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <div className="mb-4 grid gap-2" data-testid="splice-invites">
      {q.data.map((i) => (
        <div key={i.id} className="grid gap-2 rounded-3xl border border-[#00F5D4]/40 bg-[#00F5D4]/10 p-3">
          <div className="text-[13px] font-black text-white">🤝 @{i.from?.username} wants to splice their {kindInfo(i.theirs.kind).name} with your {enchantName(i.yours)}</div>
          <HybridCard a={i.theirs.kind as EnchantKind} b={i.yours.kind as EnchantKind} compact />
          <div className="flex gap-2"><Button variant="rainbow" size="sm" onClick={() => void respond(i.id, true)} data-testid="splice-accept">Splice! (24 h)</Button><Button variant="ghost" size="sm" onClick={() => void respond(i.id, false)}>No thanks</Button></div>
        </div>
      ))}
    </div>
  );
}

function SceneMood({ v }: { v: EnchantView }) {
  const m = useMood(v);
  return <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3] overflow-hidden rounded-[28px]"><MoodVeil {...m} /></div>;
}

// ---- one enchantment ------------------------------------------------------------------------------------------------
function Detail({ id }: { id: string }) {
  const q = useEnchant(id);
  const nav = useNavigate();
  const { act, busy } = useAct(id);
  const [naming, setNaming] = useState<string | null>(null);
  const v = q.data;
  if (q.isLoading) return <Page><div className="flex justify-center py-16"><Spinner /></div></Page>;
  if (!v) return <Page><Empty title="This enchantment has gone">It may have passed to a new owner, or vanished from the land.</Empty></Page>;
  const k = kindInfo(v.kind);
  const mine = v.mine !== false && !!v.view;
  const [lng, lat] = cellCenter(v.gx, v.gy);
  const xpPct = v.xp_next ? Math.min(100, ((v.xp - (v.xp_prev ?? 0)) / Math.max(1, v.xp_next - (v.xp_prev ?? 0))) * 100) : 0;
  return (
    <Page>
      <div className="mb-3 flex items-center justify-between"><Link to="/grimoire" className="text-sm font-bold text-white/70">← Grimoire</Link>
        <button className="text-sm font-bold text-[#9BE7FF]" onClick={() => toMap(nav, { lng, lat, zoom: 19 })}>📍 On the map</button></div>
      {/* the header: one of a kind */}
      <motion.section className="lv-ench-card mb-4 grid gap-3 p-4" style={{ ['--a' as string]: k.a }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} data-testid="ench-header">
        <div className="flex items-center gap-4">
          <EvolveAura level={v.level} color={k.a} size={120}><Sigil kind={v.kind} seed={v.sigil} size={112} level={v.level} /></EvolveAura>
          <div className="grid min-w-0 flex-1 gap-1">
            {naming == null ? (
              <button className="text-left" onClick={() => mine && setNaming(v.nickname ?? '')} data-testid="ench-name"><span className="font-display text-[26px] font-black leading-tight">{enchantName(v)}</span>{mine && <span className="ml-1 text-xs text-white/40">✎</span>}</button>
            ) : (
              <form className="flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); await act('rename', { name: naming }); setNaming(null); }}>
                <input autoFocus maxLength={24} className={cn(inputCls, 'h-9')} value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={`${k.name} #${v.serial}`} data-testid="ench-rename" />
                <Button size="sm" type="submit">Name</Button>
              </form>
            )}
            <div className="text-[12px] font-bold" style={{ color: k.a }}>{k.emoji} {k.name} · #{v.serial} of {fmt(v.minted)} ever minted · {fmt(v.population)} alive</div>
            <div className="text-[11px] text-white/55">Born {timeAgo(v.born_at)} in {v.born_place ?? 'an unmapped place'}{v.first_owner && v.owner && v.first_owner.id !== v.owner.id ? ` · first held by @${v.first_owner.username}` : ''}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-[#FFD23F]/20 px-2 py-0.5 text-[11px] font-black text-[#FFD23F]">LV {v.level}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,#FFD23F,#FF9F1C)]" style={{ width: `${xpPct}%` }} /></div>
              {v.level < 10 && <span className="text-[10px] text-white/45">+{Math.round((v.level - 1) * 6)}% Ink</span>}
            </div>
          </div>
        </div>
        {(v.titles ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="ench-titles">{v.titles.map((t) => <span key={t} title={TITLES[t]} className="rounded-full bg-[linear-gradient(90deg,#FFD23F33,#B26BFF33)] px-2.5 py-0.5 text-[11px] font-black text-[#FFE8A3]">🏅 {t}</span>)}</div>
        )}
        {(v.partners ?? (v.partner ? [v.partner] : [])).map((p) => (
          <div key={(p as any).row ?? p.id} className="grid gap-1 rounded-2xl bg-[#00F5D4]/10 px-3 py-2 text-[12px]" data-testid="ench-partner">
            <div className="flex items-center gap-2"><span className="text-lg">🧬</span><b className="flex-1 text-[#00F5D4]">{p.hybrid}{p.perfect ? ' ✦' : ''}{p.aberration ? ' ☣️' : ''}</b><span className="text-white/50">{dur((Date.parse(p.ends_at) - Date.now()) / 1000)}</span></div>
            <div className="text-white/85">{p.kind === 'plot' ? `Spliced into your ${p.plot_kind ?? 'canvas'} plot` : `${SPLICE_MODES[(p.mode === 'friend' ? 'friend' : p.mode) as SpliceMode]?.name ?? 'Spliced'} with ${p.friend ? `@${p.friend.username}’s ` : 'a '}${kindInfo(p.kind).name}`}. It wears the <b>{p.kind === 'plot' ? 'plot’s' : kindInfo(p.kind).geneName}</b> Trait: it {traitText(p.gene, p.strength)}{p.strength >= 3 ? ' (tripled — an Aberration)' : p.strength === 2 ? ' (doubled)' : ''}.</div>
            {p.aberration && ABERRATIONS[p.aberration] && <div className="font-bold text-[#FFB3C7]">{ABERRATIONS[p.aberration].emoji} {ABERRATIONS[p.aberration].secret}</div>}
            {mine && <button className="w-fit text-[11px] font-bold text-white/55 underline" onClick={() => void act('separate')} data-testid="ench-separate">Step out of the splice</button>}
          </div>
        ))}
        {v.size && <div className="rounded-2xl px-3 py-2 text-[12px] font-bold" style={{ background: v.size.mode === 'grow' ? '#39FF1418' : '#FF00E518', color: v.size.mode === 'grow' ? '#B6FF3D' : '#FF7AE0' }} data-testid="ench-size">
          {v.size.prank ? `🤡 @${v.size.by_name ?? '?'} pranked its plot ${v.size.mode === 'grow' ? 'GIANT' : 'TINY'} (only for show)` : v.size.mode === 'grow' ? '🔼 Its plot is 100× GIANT' : '🔽 Its plot is 100× tiny — its time runs twice as fast'}{v.size.linked ? ' (through a wormhole)' : ''} · {dur((Date.parse(v.size.until) - Date.now()) / 1000)} left</div>}
        {v.clock?.frozen_until && <div className="rounded-2xl bg-[#C0F5FF]/10 px-3 py-2 text-[12px] font-bold text-[#C0F5FF]">❄️ Frozen in time by a Clockwork for {dur((Date.parse(v.clock.frozen_until) - Date.now()) / 1000)} — nothing grows, nothing comes.</div>}
        {!!v.clock?.skip_s && <div className="text-[11px] text-white/45">⏩ Its clock runs {dur(v.clock.skip_s)} ahead of the world.</div>}
        <div className="flex flex-wrap gap-3 text-[11px] text-white/55">{v.stats?.ink ? <span>💧 {fmt(v.stats.ink)} Ink earned</span> : null}{v.owner && <span>Held by @{v.owner.username}</span>}</div>
      </motion.section>
      {/* the scene */}
      {mine ? <div className="relative mx-auto w-full max-w-[680px]"><SceneFor kind={v.kind} v={v} view={v.view} act={act} busy={busy} at={q.dataUpdatedAt} /><SceneMood v={v} /></div> : <Empty title={`@${v.owner?.username}’s ${k.name}`}>{k.tagline}</Empty>}
      {/* how it works */}
      <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[13px]">
        <summary className="cursor-pointer font-black">How the {k.name} works</summary>
        <div className="mt-2 grid gap-1 text-white/75">{k.how.map((h) => <div key={h}>• {h}</div>)}{k.geneText && <div className="font-bold text-[#9BF6E5]">🧬 When spliced, it lends its {k.geneName} Trait: the other one {k.geneText}.</div>}</div>
      </details>
      {mine && <Chronicle id={v.id} />}
      {mine && v.kind === 'wormhole' && <WarpTunnel />}
    </Page>
  );
}

const EV: Record<string, (d: any) => string> = {
  born: (d) => `✨ Born in ${d.place ?? 'the world'} — #${d.serial}`, woke: () => '🌅 Woke for a new owner', named: (d) => (d.name ? `✎ Named “${d.name}”` : '✎ Name cleared'),
  level: (d) => `⭐ Reached level ${d.level}`, title: (d) => `🏅 Earned ${(d.titles ?? []).join(', ')}`, paid: (d) => `💧 +${d.ink} Ink — ${d.what}`,
  fox: () => '🦊 Chased off a fox', egg: (d) => `🥚 ${d.platinum ? 'Platinum' : 'Golden'} egg collected${d.bites ? ` (bitten ×${d.bites})` : ''}${d.streak ? ` · streak ${d.streak}` : ''}`,
  wish: (d) => `🧞 Wished for ${d.wish}${d.kept ? ' (and kept the wish!)' : ''}`, forbidden: (d) => `⛓️ The Forbidden Wish: ${d.outcome}`,
  map: () => '🗺️ Drew a treasure map', piece: (d) => `🧩 Found piece ${d.n} of 4`, chest: (d) => `🧰 Dug up a chest${d.legendary ? ' — with a Legendary ticket!' : d.epic ? ' — with an Epic ticket!' : ''}`,
  leap: (d) => `🦠 Leapt onto @${d.host}’s plot`, fed: (d) => `🍽️ Fed on @${d.host}’s plot`, evolved: (d) => `🧬 Evolved into a ${['Larva', 'Parasite', 'Symbiote'][d.stage]}`,
  shaken: () => '👋 Shaken off a host', shrunk: () => '📡 Shrunk off a host', laid: (d) => `🪺 Laid an egg in @${d.host}’s ${d.rarity} nest`, hatched: (d) => `🐣 Raised a chick from @${d.host}’s nest${d.feather ? ' (lucky feather!)' : ''}`,
  ejected: () => '🥚 An egg was thrown out', evil: (d) => `${EVILS[d.evil]?.emoji ?? '👿'} ${EVILS[d.evil]?.name ?? d.evil} escaped${d.dodged ? ' — curse dodged' : ''}`, hope: (d) => `🦋 Hope rose! Cycle ${d.cycle}`,
  spliced: (d) => `🧬 Spliced: ${d.hybrid}${d.with ? ` (with a ${kindInfo(d.with).name})` : ''}`, forward: (d) => `⏩ Fast-forwarded a ${kindInfo(d.target).name} by ${d.minutes} min`,
  forwarded: (d) => `⏩ Time skipped ${d.minutes} min`, freeze: (d) => `❄️ Froze a ${kindInfo(d.target).name} for ${d.hours} h`, frozen: (d) => `❄️ Frozen for ${d.hours} h`,
  zap: (d) => `📡 ${d.target === 'plot' ? (d.bounced ? `A prank bounced back onto your own plot` : d.prank ? `Pranked @${d.prank} — ${d.mode === 'shrink' ? 'shrank' : 'grew'} their plot 100×` : `${d.backfire ? 'Backfired on' : d.mode === 'shrink' ? 'Shrank' : 'Grew'} a plot 100×`) : `Zapped a ${d.target}`} — ${Math.round(Number(d.accuracy) * 100)}%`,
  opened: (d) => `🌀 Opened a wormhole ${d.km} km wide (${d.stability}% stable, ${d.hours} h)`, caught: (d) => `🌀 Caught ${d.type === 'chest' ? 'a chest' : d.type === 'star' ? 'a falling star' : d.type === 'fox' ? 'a fox' : 'some spores'} from the wormhole`,
  gaze: (d) => `👁️ Gazed into ${d.what === 'roll' ? 'your next rolls' : d.what === 'reward' ? 'your next rewards' : d.what === 'pandora' ? 'Pandora’s lid' : 'the Goose’s eggs'}`,
  swap: () => '👁️ Rewrote fate: two cards swapped', burn: () => '🔥 Burned a card of fate', foretell: (d) => `🔏 Sealed a prophecy for @${d.to}`, prophecy_true: () => '✅ A sealed prophecy came true',
  invited: (d) => `🤝 Asked @${d.to} to splice: ${d.hybrid}`, leviathan: (d) => `🐉 Struck the Leviathan with ${d.move} — ${Number(d.dmg).toLocaleString()}`, reflect: (d) => `🪞 Reflected ${d.owner ? `@${d.owner}’s ` : 'a dream of a '}${kindInfo(d.kind).name}`, shatter: () => '💥 Shattered — and mended',
};
function Chronicle({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['enchant-chronicle', id], queryFn: () => api.enchantChronicle(id), staleTime: 10_000 });
  return (
    <section className="mt-4 grid gap-2" data-testid="ench-chronicle">
      <h2 className="font-display text-lg font-black">Chronicle</h2>
      {(q.data ?? []).map((e) => <div key={e.id} className="flex items-start gap-2 text-[13px]"><span className="min-w-0 flex-1 text-white/80">{EV[e.kind]?.(e.data) ?? e.kind}</span><span className="shrink-0 text-[11px] text-white/40">{timeAgo(e.at)}</span></div>)}
      {!q.data?.length && <p className="text-[12px] text-white/50">Nothing written yet.</p>}
    </section>
  );
}
