// The Grimoire: your enchantments, what's visiting your land, the ten kinds in the world, and your Splice Codex — and
// each enchantment's own page: its sigil, its mint number, its level and titles, its living scene and its chronicle.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ClockRate, EnchantFxLayer, centerOf, efx, rateOf, useAct, useEnchant, useMyEnchantments, useTick, useVisitors } from './core';
import { TempoBadge, UseOnThis } from './UseOnThis';
import { ABERRATIONS, ABERRATION_COUNT, EVILS, HYBRIDS, HYBRID_COUNT, KINDS, KIND_ORDER, PERFECT_COUNT, SPLICE_MODES, TITLES, TRAIT_CHIP, dur, enchantName, hybridCard, hybridKey, kindInfo, traitHere, type EnchantKind, type SpliceMode } from './kinds';
import { ARTIFACTS } from './artifacts';
import { SeekChests, useSeekChests } from './Chests';
import { HybridCard } from './HybridCard';
import { EvolveAura, MoodVeil, feel, useMood } from './living';
import { PeelOff } from './PeelOff';
import { ClipMomentButton, enchantRef } from '../clips/ClipMoment';
import { newMoment } from '../clips/moments';
import { SceneFor } from './scenes';
import { WarpTunnel } from './scenes/WormholeScene';
import { Sigil } from './Sigil';
import { nextIn } from './pickers';
import { GlyphMark, said } from './scenes/GlyphScene';
import { StarAura, StarPips, StarsPanel } from './Stars';
import { ChaosBox, DivineTarget, GoldenEggs, LinkPlot, traitProof } from './TraitTools';
import { GrimoireBadges } from './GrimoireBadges';
import './enchant.css';
import { gameName } from './puppet/names';

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
type Filter = 'all' | 'ready' | 'spliced';
function Home() {
  const me = useOnboardedMe();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'mine';
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  const best = useQuery({ queryKey: ['enchant-bestiary'], queryFn: api.enchantBestiary, staleTime: 60_000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 30_000); return () => clearInterval(t); }, []);
  const list = mine.data ?? [];
  const elapsed = mine.dataUpdatedAt ? Math.max(0, (now - mine.dataUpdatedAt) / 1000) : 0;
  const ready = list.filter((e) => e.attention);
  const shown = list.filter((e) => (filter === 'ready' ? !!e.attention : filter === 'spliced' ? !!e.partner : true));
  // copies of one kind stay together; the kinds in the book's order
  const groups = useMemo(() => {
    const m = new Map<string, EnchantView[]>();
    for (const e of shown) { const k = e.kind; if (!m.has(k)) m.set(k, []); m.get(k)!.push(e); }
    const order = [...KIND_ORDER, 'cuckoo'] as string[];
    return [...m.entries()].sort((a, b) => Number(b[1].some((x) => x.attention)) - Number(a[1].some((x) => x.attention)) || order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [shown]);
  const soonest = useMemo(() => list.filter((e) => !e.attention).map((e) => ({ e, s: nextIn(e, elapsed * rateOf(e)) })).filter((x) => x.s != null).sort((a, b) => a.s! - b.s!)[0], [list, elapsed]);
  if (!me) return <Page><Empty title="Sign in to open your Grimoire" /></Page>;
  return (
    <Page>
      <header className="mb-4 grid gap-3">
        <div className="flex items-center gap-3">
          <motion.div className="lv-grim-btn shrink-0" initial={{ rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }}><span className="lv-grim-book text-3xl">📖</span></motion.div>
          <div className="grid">
            <h1 className="font-display text-3xl font-black tracking-tight">Grimoire</h1>
            <p className="text-sm text-muted">{list.length ? `${list.length} enchantment${list.length === 1 ? '' : 's'} · ${groups.length} kind${groups.length === 1 ? '' : 's'}${ready.length ? ` · ${ready.length} ready` : ''}` : `Enchantments live on plots — ${best.data ? `${best.data.chance.base}% of plot rolls come out` : 'some plot rolls come out'} Enchanted.`}</p>
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
      <AllChests />
      <Tabs value={tab} onValueChange={(t) => setSp((p) => { p.set('tab', t); return p; }, { replace: true })} className="mb-4"
        items={[{ value: 'mine', label: `Enchantments${list.length ? ` · ${list.length}` : ''}` }, { value: 'visitors', label: `On my land${visitors.data?.length ? ` · ${visitors.data.length}` : ''}` }, { value: 'bestiary', label: 'Bestiary' }, { value: 'codex', label: 'Codex' }, { value: 'badges', label: 'Badges' }]} />
      {tab === 'mine' && (mine.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : list.length ? (
        <div className="grid gap-3">
          {/* ready now: everything that has something waiting, one tap away */}
          <section className="grid gap-2" data-testid="grimoire-ready">
            <div className="flex items-center justify-between"><h2 className="font-display text-[15px] font-black text-[#FFE8A3]">✦ Ready now{ready.length ? ` · ${ready.length}` : ''}</h2></div>
            {ready.length ? (
              <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                {ready.map((e) => (
                  <Link key={e.id} to={`/grimoire/${e.id}`} className="lv-ready-chip snap-start" style={{ ['--a' as string]: kindInfo(e.kind).a }} data-testid="grimoire-ready-chip">
                    <Sigil kind={e.kind} seed={e.sigil} size={40} level={e.level} still />
                    <span className="grid min-w-0 leading-tight"><b className="truncate text-[12.5px] text-white">{enchantName(e)}</b><i className="truncate text-[11px] not-italic text-[#FFE8A3]">{e.attention}</i></span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white/[0.04] px-3 py-2 text-[12px] text-white/60" data-testid="grimoire-none-ready">Nothing needs you right now.{soonest ? <> Next up: <b className="text-white/85">{enchantName(soonest.e)}</b> in {dur(soonest.s!)}.</> : ''}</p>
            )}
          </section>
          {/* show: all / ready / spliced */}
          <div className="flex flex-wrap gap-1.5" data-testid="grimoire-filter">
            {([['all', `All · ${list.length}`], ['ready', `Ready · ${ready.length}`], ['spliced', `Spliced · ${list.filter((e) => e.partner).length}`]] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={cn('rounded-full px-3 py-1.5 text-[12px] font-black', filter === f ? 'bg-white text-[#1a0b2e]' : 'bg-white/[0.07] text-white/75')} data-testid={`grimoire-filter-${f}`}>{label}</button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2" data-testid="grimoire-list">
            {groups.map(([kind, copies], gi) => <KindGroup key={kind} kind={kind} copies={copies} i={gi} elapsed={elapsed} />)}
            {!groups.length && <p className="text-[12px] text-white/55">Nothing here — try another filter.</p>}
          </div>
        </div>
      ) : (
        <Empty icon={<span className="text-3xl">✨</span>} title="No enchantments yet" action={<Link to="/world"><Button variant="rainbow">Roll a plot</Button></Link>}>
          Every plot roll has a {best.data?.chance.base ?? 2}% chance to come out Enchanted — an enchantment in place of a rarity. Raise the odds with Enchanted Luck at the Altar of Luck.
        </Empty>
      ))}
      {tab === 'visitors' && <Visitors list={visitors.data ?? []} loading={visitors.isLoading} />}
      {tab === 'bestiary' && <Bestiary data={best.data} />}
      {tab === 'badges' && <GrimoireBadges />}
      {tab === 'codex' && <Codex codex={best.data?.codex ?? []} trinities={best.data?.trinities ?? []} plots={best.data?.plots ?? []} aberrations={best.data?.aberrations ?? []} />}
    </Page>
  );
}

/** one kind, all your copies of it together: who's ready, who's waiting, and that copies can be poured in for a star */
function KindGroup({ kind, copies, i, elapsed }: { kind: string; copies: EnchantView[]; i: number; elapsed: number }) {
  const k = kindInfo(kind);
  const nReady = copies.filter((e) => e.attention).length;
  return (
    <motion.section className="lv-kind-group grid gap-1.5 p-2.5" style={{ ['--a' as string]: k.a, ['--b' as string]: k.b }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} data-testid="grimoire-group" data-kind={kind}>
      <div className="flex items-center gap-2 px-1">
        <span className="text-[22px]">{k.emoji}</span>
        <span className="min-w-0 flex-1 leading-tight"><b className="block truncate font-display text-[16px] text-white">{k.name}{copies.length > 1 ? <span className="ml-1.5 rounded-full bg-white/15 px-2 text-[12px]">×{copies.length}</span> : null}</b>
          <i className="block truncate text-[11px] not-italic text-white/50">{k.tagline}</i></span>
        {nReady > 0 && <span className="rounded-full bg-[#FFD23F] px-2 py-0.5 text-[11px] font-black text-[#1a0b2e]">{nReady} ready</span>}
      </div>
      {copies.map((e) => <EnchantRow key={e.id} e={e} elapsed={elapsed} />)}
      {copies.length > 1 && kind !== 'cuckoo' && <p className="px-1 text-[11px] font-semibold text-white/50">⭐ Copies of one kind can be poured into one for a star — open the one to keep and use “Pour in a copy”.</p>}
    </motion.section>
  );
}

function EnchantRow({ e, elapsed }: { e: EnchantView; elapsed: number }) {
  const k = kindInfo(e.reflect_kind ?? e.kind);
  const n = e.attention ? null : nextIn(e, elapsed * rateOf(e));
  return (
    <Link to={`/grimoire/${e.id}`} className={cn('lv-ench-row flex items-center gap-3', e.attention && 'ready')} data-testid="grimoire-card" data-kind={e.kind}>
      <div className="relative shrink-0"><StarAura stars={e.stars ?? 0} size={52}><Sigil kind={e.kind} seed={e.sigil} size={52} level={e.level} /></StarAura>
        {e.reflect_kind && <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-[#C0F5FF] text-[12px] shadow">{k.emoji}</span>}</div>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex items-center gap-1.5"><span className="truncate text-[14.5px] font-black text-white">{enchantName(e)}</span>
          <span className="shrink-0 rounded-full bg-[#FFD23F]/20 px-1.5 text-[10px] font-black text-[#FFD23F]">LV {e.level}</span>{(e.stars ?? 0) > 0 && <StarPips stars={e.stars ?? 0} className="text-[11px]" />}</div>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className={cn('rounded-full px-2 py-[1px] font-black', e.attention ? 'bg-[#FFD23F] text-[#1a0b2e]' : 'bg-white/[0.08] text-white/60')} data-testid="grimoire-status">
            {e.attention ? `✦ ${e.attention}` : e.clock?.frozen_until ? '❄️ frozen' : n != null ? `⏳ ${dur(n)}` : 'resting'}</span>
          {e.partner && <span className="truncate rounded-full bg-[#00F5D4]/15 px-2 py-[1px] font-black text-[#00F5D4]">🧬 {e.partner.hybrid}</span>}
          <TempoBadge e={e} compact />
        </div>
      </div>
      <span className="shrink-0 text-white/30" aria-hidden>›</span>
    </Link>
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
  if (!list.length) return <Empty icon={<span className="text-3xl">🌿</span>} title="Nothing on your land">When someone’s Parasite latches onto your plot, you’ll find it here — and you can deal with it (and get paid for it).</Empty>;
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

// ---- every kind -----------------------------------------------------------------------------------------------------
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

/** every chest your enchantments' Seeking Trait buried, waiting to be dug up */
function AllChests() {
  const q = useSeekChests();
  return <SeekChests className="mb-4" chests={q.data ?? []} title={`Buried chests waiting · ${q.data?.length ?? 0}`} hint="Your enchantments’ Seeking Trait buried these by their plots. Dig them up here or tap them on the map." />;
}

/** the Traits an enchantment wears right now: what each one does on this kind, whether it needs you, and what it's done —
 *  and, for the Traits you use, the button or the drawing pad right there */
function TraitsAtWork({ v, mine, onSeparate, act, busy }: { v: EnchantView; mine: boolean; onSeparate(): void; act: ReturnType<typeof useAct>['act']; busy: string | null }) {
  const partners = v.partners ?? (v.partner ? [v.partner] : []);
  const chron = useQuery({ queryKey: ['enchant-chronicle', v.id], queryFn: () => api.enchantChronicle(v.id), staleTime: 10_000, enabled: mine && partners.length > 0 });
  if (!partners.length) return null;
  const kind = v.reflect_kind ?? v.kind;
  const tn = v.traits ?? {};
  return (
    <div className="grid gap-2" data-testid="ench-traits">
      {partners.map((p) => {
        const t = traitHere(p.gene, p.strength, kind);
        const since = Date.parse((p as any).started_at ?? '') || 0;
        const paid = (chron.data ?? []).filter((e) => e.kind === 'paid' && Date.parse(e.at) >= since);
        const chip = TRAIT_CHIP[p.gene ?? ''];
        const hits = chip ? paid.filter((e) => (e.data?.mods ?? []).some((m: any) => String(m.label).startsWith(chip))).length : 0;
        const buried = paid.reduce((a, e) => a + Number(e.data?.chests ?? 0), 0);
        const proof = p.gene === 'seek' ? `${buried} chest${buried === 1 ? '' : 's'} buried since the splice`
          : p.gene === 'tempo' ? (v.clock?.skip_s ? `Its clock has run ${dur(v.clock.skip_s)} ahead so far` : null)
          : p.gene === 'strings' && tn.strings ? (tn.strings.last ? `Last chore: a puppet ${tn.strings.last.label}${tn.strings.last.kind !== kind ? ` (for your ${kindInfo(tn.strings.last.kind).name})` : ''} · ${tn.strings.chores} in all` : 'Its puppet hasn’t done a chore yet today — it will soon')
          : p.gene === 'farsight' && tn.farsight ? (tn.farsight.reaches ? `It reaches ${tn.farsight.reach}× as far right now` : `${tn.farsight.scouted} plot${tn.farsight.scouted === 1 ? '' : 's'} scouted${tn.farsight.today ? ' · today’s are on your map' : ''}`)
          : p.gene === 'trick' && tn.tempered ? `Its plot is tempered${tn.tempered.dodged ? ` · ${tn.tempered.dodged} bad luck dodged` : ''}`
          : p.gene === 'fated' && tn.fated ? (tn.fated.last ? `Last card: ${tn.fated.last.name} — ${tn.fated.last.fx} · ${tn.fated.cards} in all` : 'No card drawn yet — one comes with a reward')
          : traitProof(p.gene, tn) ? traitProof(p.gene, tn)
          : t?.on ? (paid.length ? `Worked on ${hits} of ${paid.length} reward${paid.length === 1 ? '' : 's'} since the splice` : `No reward since the splice yet — it works on ${t.on}`) : null;
        return (
          <div key={(p as any).row ?? p.id} className="grid gap-1.5 rounded-2xl bg-[#00F5D4]/10 px-3 py-2.5 text-[12px]" data-testid="ench-partner">
            <div className="flex items-center gap-2"><span className="text-lg">🧬</span><b className="flex-1 text-[#00F5D4]">{p.hybrid}{p.perfect ? ' ✦' : ''}{p.aberration ? ' ☣️' : ''}</b><span className="text-white/50">{Date.parse(p.ends_at) - Date.now() > 50 * 365 * 86400e3 ? '♾️ forever' : `${dur((Date.parse(p.ends_at) - Date.now()) / 1000)} left`}</span></div>
            <div className="text-white/70">{p.kind === 'plot' ? `Spliced into your ${p.plot_kind ?? 'canvas'} plot` : `${SPLICE_MODES[(p.mode === 'friend' ? 'friend' : p.mode) as SpliceMode]?.name ?? 'Spliced'} with ${p.friend ? `@${p.friend.username}’s ` : 'a '}${kindInfo(p.kind).name}`}. It wears this Trait:</div>
            {t ? (
              <div className="grid gap-1 rounded-xl bg-black/25 px-2.5 py-2" data-testid="ench-trait" data-gene={p.gene}>
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]"><span>{t.emoji}</span><b className="text-white">{t.name}</b>
                  {t.k >= 2 && <span className="rounded-full bg-[#E5CCFF]/20 px-1.5 text-[10px] font-black text-[#E5CCFF]">{t.k >= 3 ? '×3 · Aberration' : '×2 strength'}</span>}
                  <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-black', t.you ? 'bg-[#FFD23F] text-[#1a0b2e]' : 'bg-[#3DDC97]/20 text-[#9BF6C8]')} data-testid="ench-trait-tag">{t.you ? '👆 Needs you' : '✓ Works by itself'}</span></div>
                <div className="text-white/90">{t.text[0].toUpperCase() + t.text.slice(1)}.</div>
                {t.on && <div className="text-[11.5px] text-white/60">Works on {t.on}.</div>}
                {proof && <div className="text-[11px] font-bold text-[#9BF6E5]" data-testid="ench-trait-proof">📈 {proof}</div>}
                {mine && p.gene === 'folded' && tn.fold && <FoldWait v={v} fold={tn.fold} act={act} busy={busy} />}
                {mine && p.gene === 'inscribed' && tn.rune && <TraceRune rune={tn.rune} act={act} busy={busy} />}
                {mine && p.gene === 'golden' && tn.golden && <GoldenEggs g={tn.golden} act={act} busy={busy} />}
                {mine && p.gene === 'chaos' && tn.chaos && <ChaosBox c={tn.chaos} act={act} busy={busy} />}
                {mine && p.gene === 'linked' && tn.linked && <LinkPlot v={v} l={tn.linked} act={act} busy={busy} />}
                {mine && p.gene === 'divining' && tn.divining && <DivineTarget d={tn.divining} act={act} busy={busy} />}
                {mine && p.gene === 'farsight' && tn.farsight && !tn.farsight.reaches && tn.farsight.scouted > 0 && (
                  <Link to="/world" className="w-fit rounded-full bg-[#F4C95D]/20 px-3 py-1 text-[11.5px] font-black text-[#FFE8A3]" data-testid="ench-farsight-map">🔭 See its readings on the map</Link>
                )}
              </div>
            ) : <div className="text-white/70">—</div>}
            {p.aberration && ABERRATIONS[p.aberration] && <div className="font-bold text-[#FFB3C7]">{ABERRATIONS[p.aberration].emoji} {ABERRATIONS[p.aberration].secret}</div>}
            {mine && <button className="w-fit text-[11px] font-bold text-white/55 underline" onClick={onSeparate} data-testid="ench-separate">Step out of the splice</button>}
          </div>
        );
      })}
    </div>
  );
}

const WAIT_NAME: Record<string, string> = { next_in: 'next charge', collect_in: 'golden egg', gosling_in: 'gosling', ready_in: 'next harvest', rest_in: 'rest', boon_in: 'boon',
  locked_in: 'lid', roar_in: 'next roar', can_open_in: 'next opening', next_drop_in: 'next drop', next_move_in: 'next walk', shed_in: 'shedding', polish_ready_in: 'next polish' };

/** 🦢 Folded: a tap folds its longest wait in half — the timer creases and halves */
function FoldWait({ v, fold, act, busy }: { v: EnchantView; fold: NonNullable<NonNullable<EnchantView['traits']>['fold']>; act: ReturnType<typeof useAct>['act']; busy: string | null }) {
  const [done, setDone] = useState<{ s: number; other: boolean; kind: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const go = async () => {
    feel('medium');
    const r = await act('trait_fold', {}, { silent: true });
    if (!r?.result?.folded) return;
    setDone({ s: Number(r.result.folded), other: !!r.result.other, kind: r.result.target_kind });
    feel('success');
    efx.burst({ ...centerOf(ref.current), colors: ['#FFF3E0', '#FF6F91', '#fff'], count: 70, speed: 9, kind: 'spark' });
  };
  const w = fold.wait;
  return (
    <div ref={ref} className="grid gap-1.5 rounded-xl border border-[#FF6F91]/40 bg-[#FF6F91]/10 p-2" data-testid="ench-fold">
      <div className="flex items-center gap-2">
        <motion.div className="relative h-9 w-14 overflow-hidden rounded-lg bg-[#FFF3E0] text-center text-[11px] font-black leading-9 text-[#6A2C4B]"
          animate={done ? { scaleX: [1, 0.5, 0.5], rotateY: [0, 0, 0] } : { scaleX: 1 }} transition={{ duration: 0.7, times: [0, 0.6, 1] }}>
          <span className="absolute inset-y-0 left-1/2 w-px bg-[#FF6F91]/60" />{w ? dur(done ? w.s / 2 : w.s) : '—'}
        </motion.div>
        <div className="min-w-0 flex-1 text-[11.5px] font-bold text-white/85">
          {done ? <>Folded! {done.other ? `Your ${kindInfo(done.kind).name}’s` : 'Its'} wait is {dur(done.s)} shorter.</>
            : w ? <>Its longest wait — {WAIT_NAME[w.key] ?? w.key.replace(/_in$/, '').replace(/_/g, ' ')} — is {dur(w.s)}. Fold it to {dur(w.s / 2)}.</>
            : <>Nothing waiting here — the fold goes to your enchantment with the longest wait.</>}
        </div>
      </div>
      <Button size="sm" variant="rainbow" disabled={!!busy || fold.left < 1 || !!done} onClick={() => void go()} data-testid="ench-fold-go">
        {fold.left < 1 && !done ? 'Folded today — again tomorrow' : done ? '🦢 Folded' : `🦢 Fold its wait${fold.k > 1 ? ` (${fold.left} left today)` : ''}`}</Button>
      {fold.saved > 0 && <div className="text-[10.5px] font-bold text-white/50">{dur(fold.saved)} folded away so far</div>}
    </div>
  );
}

/** ✍️ Inscribed: trace its rune — a glyph — and it casts for free, as strong as you drew it */
function TraceRune({ rune, act, busy }: { rune: NonNullable<NonNullable<EnchantView['traits']>['rune']>; act: ReturnType<typeof useAct>['act']; busy: string | null }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const pts = useRef<{ x: number; y: number }[][]>([]);
  const lift = useRef<number | null>(null);
  const [res, setRes] = useState<any>(null);
  const paint = () => {
    const c = cv.current, g = c?.getContext('2d'); if (!c || !g) return;
    const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of pts.current) for (const [w, col] of [[10, '#4DD0E155'], [4, '#9EF6FF'], [2, '#fff']] as const) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); st.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    }
  };
  const at = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const finish = async () => {
    const { recognise } = await import('./glyphs');
    const m = recognise(pts.current.flat(), [rune.glyph]);
    const acc = m ? m.accuracy : 0;
    const r = await act('trait_rune', { accuracy: acc }, { silent: true });
    pts.current = []; paint();
    if (!r?.result) return;
    setRes(r.result);
    feel(r.result.fizzled ? 'light' : 'success');
    if (!r.result.fizzled) efx.burst({ ...centerOf(cv.current), colors: ['#9EF6FF', '#7C4DFF', '#fff'], count: 120, speed: 11, kind: 'spark' });
  };
  if (!rune.ready && !res) return <div className="rounded-xl bg-[#4DD0E1]/10 px-2.5 py-1.5 text-[11.5px] font-bold text-[#9EF6FF]" data-testid="ench-rune-done">✍️ Its rune ({rune.name}) was traced today{rune.best ? ` · best ${Math.round(Number(rune.best) * 100)}%` : ''} — again tomorrow</div>;
  return (
    <div className="grid gap-1.5 rounded-xl border border-[#4DD0E1]/40 bg-[#04161C] p-2" data-testid="ench-rune">
      <div className="text-[11.5px] font-bold text-white/85">Its rune is <b className="text-[#9EF6FF]">{rune.name}</b>: {rune.text}</div>
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl bg-[radial-gradient(circle,#0B3340,#04161C_70%)]">
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-35"><GlyphMark id={rune.glyph} size={120} color="#4DD0E1" draw /></div>
        <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="ench-rune-canvas"
          onPointerDown={(e) => { if (busy || (res && !res.fizzled)) return; (e.target as Element).setPointerCapture?.(e.pointerId); if (lift.current) clearTimeout(lift.current); pts.current.push([at(e)]); paint(); }}
          onPointerMove={(e) => { if (e.buttons === 0 || !pts.current.length) return; pts.current[pts.current.length - 1].push(at(e)); paint(); }}
          onPointerUp={() => { lift.current = window.setTimeout(() => void finish(), 450); }} />
      </div>
      {res && <div className="text-[12px] font-black" data-testid="ench-rune-result">{res.fizzled ? <span className="text-white/70">A scrawl — it didn’t take. Trace it again.</span>
        : <span className="text-[#9EF6FF]">✍️ {res.name} cast at {Math.round(Number(res.accuracy) * 100)}%: {(res.effects as any[]).map(said).filter(Boolean).join(' · ')}</span>}</div>}
    </div>
  );
}

/** "⏳ Next in …", ticking at the speed its clock runs */
function NextInLive({ v, at }: { v: EnchantView; at: number }) {
  useTick(1000);
  const n = nextIn(v, (at ? (Date.now() - at) / 1000 : 0) * rateOf(v));
  return <>⏳ Next in {dur(n)}</>;
}

function SceneMood({ v }: { v: EnchantView }) {
  const m = useMood(v);
  return <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3] overflow-hidden rounded-[28px]"><MoodVeil {...m} /></div>;
}

// ---- one enchantment ------------------------------------------------------------------------------------------------
/** what each kind works on — so it's clear what it can be used on */
const WORKS_ON: Record<string, string[]> = {
  goose: ['its own egg'], genie: ['you'], map: ['plots nearby', 'the map'], parasite: ['other players’ plots'], pandora: ['you'], splice: ['your enchantments', 'your plots', 'friends'],
  clockwork: ['your other enchantments'], sizeray: ['any plot on the map'], shard: ['others’ enchantments'], wormhole: ['two of your plots'], oracle: ['your rolls', 'a friend’s roll'],
  stormcoil: ['your hybrids', 'your plots'], sun: ['any spot on the map', 'your plots', 'your party'], rod: ['your plot rolls', 'spots near you'], spyglass: ['unclaimed plots on the map'], origami: ['your plots', 'free spots on the map'],
  crucible: ['your plots'], puppeteer: ['other players’ plots'], deck: ['your day'], glyph: ['your plots', 'your enchantments', 'the Leviathan'], cuckoo: ['what it hatches into'],
};
const SECTIONS = [['play', '✨ Play'], ['traits', '🧬 Traits'], ['stars', '⭐ Stars'], ['story', '📜 Story'], ['how', '❓ How']] as const;

function Detail({ id }: { id: string }) {
  const q = useEnchant(id);
  const nav = useNavigate();
  const { act, busy } = useAct(id);
  const mineList = useMyEnchantments();
  const [naming, setNaming] = useState<string | null>(null);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const v = q.data;
  if (q.isLoading) return <Page><div className="flex justify-center py-16"><Spinner /></div></Page>;
  if (!v) return <Page><Empty title="This enchantment has gone">It may have passed to a new owner, or vanished from the land.</Empty></Page>;
  const k = kindInfo(v.kind);
  const mine = v.mine !== false && !!v.view;
  const [lng, lat] = cellCenter(v.gx, v.gy);
  const xpPct = v.xp_next ? Math.min(100, ((v.xp - (v.xp_prev ?? 0)) / Math.max(1, v.xp_next - (v.xp_prev ?? 0))) * 100) : 0;
  // your other copies of this kind: step between them
  const copies = (mineList.data ?? []).filter((e) => e.kind === v.kind);
  const at = copies.findIndex((e) => e.id === v.id);
  const wait = v.attention ? null : nextIn(v, (q.dataUpdatedAt ? (Date.now() - q.dataUpdatedAt) / 1000 : 0) * rateOf(v));
  const partners = v.partners ?? (v.partner ? [v.partner] : []);
  const traitNeeds = !!(v.traits?.fold && v.traits.fold.left > 0) || !!(v.traits?.rune && v.traits.rune.ready) || !!(v.traits?.golden && v.traits.golden.left > 0) || !!(v.traits?.chaos && v.traits.chaos.left > 0);
  const jump = (s: string) => document.getElementById(`ench-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <Page>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Link to="/grimoire" className="text-sm font-bold text-white/70">← Grimoire</Link>
        {copies.length > 1 && at >= 0 && (
          <div className="flex items-center gap-1 rounded-full bg-white/[0.07] p-1" data-testid="ench-copies">
            {copies.map((c, i) => (
              <Link key={c.id} to={`/grimoire/${c.id}`} replace className={cn('relative grid h-8 w-8 place-items-center rounded-full', c.id === v.id ? 'bg-white/20 ring-2 ring-white/70' : 'opacity-70')} title={enchantName(c)} data-testid="ench-copy">
                <Sigil kind={c.kind} seed={c.sigil} size={26} level={c.level} still />
                {c.attention && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#FFD23F] ring-2 ring-[#12041F]" />}
                <span className="sr-only">{i + 1}</span>
              </Link>
            ))}
            <span className="px-1.5 text-[11px] font-black text-white/70">{at + 1} of {copies.length}</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <ClipMomentButton className="h-8 px-3 text-[12px]" testId="ench-clip" moment={newMoment({ type: 'showcase', e: enchantRef(v), titles: v.titles ?? [], user: v.owner?.username ?? null })} />
          <button className="text-sm font-bold text-[#9BE7FF]" onClick={() => toMap(nav, { lng, lat, zoom: 19 })}>📍 On the map</button>
        </div></div>
      {/* the header: one of a kind */}
      <motion.section className="lv-ench-card mb-3 grid gap-3 p-4" style={{ ['--a' as string]: k.a }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} data-testid="ench-header">
        <div className="flex items-center gap-4">
          <StarAura stars={v.stars ?? 0} size={104}><EvolveAura level={v.level} color={k.a} size={104}><Sigil kind={v.kind} seed={v.sigil} size={96} level={v.level} /></EvolveAura></StarAura>
          <div className="grid min-w-0 flex-1 gap-1">
            {naming == null ? (
              <button className="text-left" onClick={() => mine && setNaming(v.nickname ?? '')} data-testid="ench-name"><span className="font-display text-[24px] font-black leading-tight">{enchantName(v)}</span>{mine && <span className="ml-1 text-xs text-white/40">✎</span>}</button>
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
              {(v.stars ?? 0) > 0 && <StarPips stars={v.stars ?? 0} className="text-[14px]" testId="ench-header-stars" />}
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,#FFD23F,#FF9F1C)]" style={{ width: `${xpPct}%` }} /></div>
              {v.level < 10 && <span className="text-[10px] text-white/45">+{Math.round((v.level - 1) * 6)}% Ink</span>}
            </div>
          </div>
        </div>
        {/* what it's doing right now, and what it works on */}
        {mine && (
          <div className={cn('flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-black', v.attention ? 'bg-[#FFD23F] text-[#1a0b2e]' : 'bg-white/[0.06] text-white/75')} data-testid="ench-status">
            {v.attention ? <>✦ {v.attention}</> : v.clock?.frozen_until ? <>❄️ Frozen for {dur((Date.parse(v.clock.frozen_until) - Date.now()) / 1000)}</> : wait != null ? <NextInLive v={v} at={q.dataUpdatedAt} /> : <>💤 Resting — nothing waiting</>}
            <TempoBadge e={v} className="ml-auto" />
            {v.attention && <button className="ml-auto rounded-full bg-[#1a0b2e] px-2.5 py-0.5 text-[11px] text-[#FFE8A3]" onClick={() => jump('play')}>Go ↓</button>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" data-testid="ench-works-on">
          <span className="font-black text-white/50">🎯 Works on</span>
          {(WORKS_ON[v.reflect_kind ?? v.kind] ?? []).map((w) => <span key={w} className="rounded-full bg-white/[0.07] px-2 py-0.5 font-bold text-white/80">{w}</span>)}
          {(v.titles ?? []).length > 0 && <button className="ml-auto rounded-full bg-[linear-gradient(90deg,#FFD23F33,#B26BFF33)] px-2.5 py-0.5 font-black text-[#FFE8A3]" onClick={() => setTitlesOpen((o) => !o)}>🏅 {v.titles.length} title{v.titles.length === 1 ? '' : 's'}</button>}
        </div>
        {(v.titles ?? []).length > 0 && (titlesOpen || v.titles.length <= 2) && (
          <div className="flex flex-wrap gap-1.5" data-testid="ench-titles">{v.titles.map((t) => <span key={t} title={TITLES[t]} className="rounded-full bg-[linear-gradient(90deg,#FFD23F33,#B26BFF33)] px-2.5 py-0.5 text-[11px] font-black text-[#FFE8A3]">🏅 {t}</span>)}</div>
        )}
        {v.size && <div className="rounded-2xl px-3 py-2 text-[12px] font-bold" style={{ background: v.size.mode === 'grow' ? '#39FF1418' : '#FF00E518', color: v.size.mode === 'grow' ? '#B6FF3D' : '#FF7AE0' }} data-testid="ench-size">
          {v.size.prank ? `🤡 @${v.size.by_name ?? '?'} pranked its plot ${v.size.mode === 'grow' ? 'GIANT' : 'TINY'} (only for show)` : v.size.mode === 'grow' ? '🔼 Its plot is 100× GIANT' : '🔽 Its plot is 100× tiny — its time runs twice as fast'}{v.size.linked ? ' (through a wormhole)' : ''} · {dur((Date.parse(v.size.until) - Date.now()) / 1000)} left</div>}
        {v.clock?.frozen_until && <div className="rounded-2xl bg-[#C0F5FF]/10 px-3 py-2 text-[12px] font-bold text-[#C0F5FF]">❄️ Frozen in time by a Clockwork for {dur((Date.parse(v.clock.frozen_until) - Date.now()) / 1000)} — nothing grows, nothing comes.</div>}
        <div className="flex flex-wrap gap-3 text-[11px] text-white/55">{v.stats?.ink ? <span>💧 {fmt(v.stats.ink)} Ink earned</span> : null}{v.owner && <span>Held by @{v.owner.username}</span>}{!!v.clock?.skip_s && <span>⏩ its clock runs {dur(v.clock.skip_s)} ahead</span>}</div>
      </motion.section>
      {/* jump to: play · traits · stars · story · how */}
      {mine && (
        <nav className="lv-ench-nav sticky top-0 z-20 -mx-1 mb-3 flex gap-1 overflow-x-auto px-1 py-1.5" data-testid="ench-nav">
          {SECTIONS.filter(([s2]) => s2 !== 'traits' || partners.length > 0).map(([s2, label]) => (
            <button key={s2} onClick={() => jump(s2)} className="relative shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-black text-white/85" data-testid={`ench-nav-${s2}`}>
              {label}{s2 === 'traits' && traitNeeds && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#FFD23F]" />}
            </button>
          ))}
        </nav>
      )}
      {/* the scene */}
      <section id="ench-play" className="scroll-mt-14">
        {mine ? <div className="relative mx-auto w-full max-w-[680px]"><ClockRate.Provider value={rateOf(v)}><SceneFor kind={v.kind} v={v} view={v.view} act={act} busy={busy} at={q.dataUpdatedAt} /></ClockRate.Provider><SceneMood v={v} /></div> : <Empty title={`@${v.owner?.username}’s ${k.name}`}>{k.tagline}</Empty>}
      </section>
      {/* your other enchantments that can work on this one, right here */}
      {mine && <UseOnThis v={v} />}
      {mine && (v.chests?.length ?? 0) > 0 && (
        <SeekChests className="mt-4" chests={v.chests!} title={v.kind === 'map' ? `Chests your Seeking Trait buried · ${v.chests!.length}` : `Its buried chests · ${v.chests!.length}`}
          hint={v.kind === 'map' ? 'This map lent its Seeking Trait in a splice: these chests are buried by the plots of the enchantments that wore it.' : 'Its Seeking Trait buried these right by its plot. Dig them up here or tap them on the map.'} />
      )}
      {partners.length > 0 && (
        <section id="ench-traits" className="mt-4 grid scroll-mt-14 gap-2">
          <h2 className="font-display text-lg font-black">🧬 Spliced — the Traits it wears</h2>
          <TraitsAtWork v={v} mine={mine} onSeparate={() => void act('separate')} act={act} busy={busy} />
        </section>
      )}
      {mine && <section id="ench-stars" className="mt-4 scroll-mt-14"><StarsPanel v={v} /></section>}
      {mine && <section id="ench-story" className="scroll-mt-14"><Chronicle id={v.id} /></section>}
      {/* how it works */}
      <details id="ench-how" className="mt-4 scroll-mt-14 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[13px]" open={!mine}>
        <summary className="cursor-pointer font-black">How the {k.name} works</summary>
        <div className="mt-2 grid gap-1 text-white/75">{k.how.map((h) => <div key={h}>• {h}</div>)}{k.geneText && <div className="font-bold text-[#9BF6E5]">🧬 When spliced, it lends its {k.geneName} Trait: the other one {k.geneText}.</div>}</div>
      </details>
      {mine && v.kind === 'wormhole' && <WarpTunnel />}
    </Page>
  );
}

const EV: Record<string, (d: any) => string> = {
  born: (d) => `✨ Born in ${d.place ?? 'the world'} — #${d.serial}`, woke: () => '🌅 Woke for a new owner', named: (d) => (d.name ? `✎ Named “${d.name}”` : '✎ Name cleared'),
  level: (d) => `⭐ Reached level ${d.level}`, title: (d) => `🏅 Earned ${(d.titles ?? []).join(', ')}`, paid: (d) => `💧 +${d.ink} Ink — ${d.what}${d.chests ? ` · 🧰 ${d.chests === 1 ? 'a chest' : `${d.chests} chests`} buried` : ''}`,
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
  coiled: (d) => `🐍 Coiled around ${d.hybrid}`, looped: (d) => `🐍 Loop ${d.loop} held — ${d.bank} Ink banked`, catch: (d) => `🎯 ${d.grade === 'CLEAN' ? 'A clean catch' : d.grade === 'CLOSE' ? 'A close catch' : 'Missed the tail'} before loop ${d.loop}`,
  bitten: (d) => `💥 Bit through on loop ${d.loop} — ${d.hybrid} snapped (${d.lost ?? 0} Ink lost)`, slipped: (d) => `🍀 Slipped a bite on loop ${d.loop}`, closed: (d) => `⭕ The circle closed around ${d.hybrid}`,
  circle: (d) => `☣️ ${d.hybrid} became ${d.aberration}`, broke: (d) => `💰 Broke the circle after ${d.loops} loops (+${d.ink ?? 0} Ink)`, uncoiled: (d) => `🐍 Let go of ${d.hybrid} (the splice was separated)`,
  renewed: (d) => `♾️ ${d.hybrid} renewed itself (${d.n}/${d.of})`,
  drip: (d) => `🧪 ${d.hybrid} dripped in${(d.new ?? []).length ? ` — new: ${(d.new as string[]).map((k) => kindInfo(k).emoji).join(' ')}` : ''}${(d.grew ?? []).length ? ` · grew: ${(d.grew as string[]).map((k) => kindInfo(k).emoji).join(' ')}` : ''}${d.glow ? ' ✨' : ''}`,
  awoke: (d) => `💓 Woke and walked out of the flask (${d.parts} parts, generation ${d.gen})`, led: () => '🫱 Led to a plot', greeted: (d) => `👋 @${d.by} said hello`,
  heart: (d) => `❤️ Melted into a heart: +${d.ink ?? 0} Ink, +${d.luck} Enchanted Luck${d.spark ? ', a Splice charge' : ''}${d.kept ? ` · kept ${kindInfo(d.kept).emoji}` : ''}`,
  storm: (d) => `⛈️ Called a storm (${d.bolts} bolts${d.hybrids ? `, ${d.hybrids} hybrids under it` : ''})`, storm_end: (d) => `⚡ The storm passed: ${d.caught}/${d.of} caught, +${d.ink ?? 0} Ink${d.scorched ? `, ${d.scorched} scorched` : ''}`,
  charge: (d) => `⚡ A spare charge — ${d.from === 'ink' ? `bought for ${d.ink} Ink` : d.from === 'egg' ? `cracked a ${d.egg} egg` : d.from === 'goose' ? 'a spark from a golden egg' : d.from === 'heart' ? 'from a Homunculus’s heart' : d.from}`,
  invited: (d) => `🤝 Asked @${d.to} to splice: ${d.hybrid}`, leviathan: (d) => `🐉 Struck the Leviathan with ${d.move} — ${Number(d.dmg).toLocaleString()}`, reflect: (d) => `🪞 Reflected ${d.owner ? `@${d.owner}’s ` : 'a dream of a '}${kindInfo(d.kind).name}`, shatter: () => '💥 Shattered — and mended',
  seek_chest: (d) => `🧰 Dug up a chest its Seeking Trait buried: +${d.ink} Ink`, chime: () => '🔔 The clock chimed',
  merged: (d) => (d.kind === 'essence' ? '🔮 Three Essence poured in' : d.same ? `✨ A ${kindInfo(d.kind).name} #${d.serial} was poured in` : `🔮 A ${kindInfo(d.kind).name} #${d.serial} poured in as Essence`),
  merged_away: (d) => `✨ Poured into ${kindInfo(d.into).name} #${d.serial}${d.same ? '' : ' as Essence'}`,
  star: (d) => `${'⭐'.repeat(d.stars)} Earned ★${d.stars}: ${d.power}`,
  became: (d) => (d.from === 'ouroboros' ? '🐍 The Ouroboros straightened into a Dowsing Rod' : '🧫 The Homunculus’s heart lit up into a Pocket Sun'),
  ignited: (d) => `☀️ Lit a ${d.mode === 'orbit' ? 'sun in orbit' : 'Pocket Sun'}, ${d.r} m across`, snuffed: () => '🌑 Stoked too hot — the sun snuffed out', doused: () => '💧 Doused the sun',
  flared: (d) => `🌞 A ${d.grade} Solar Flare (${d.s} s)`, tuned: (d) => `🪄 Tuned to ${d.name} (full depth in ${Number(d.need).toLocaleString()} rolls)`,
  dowsed: (d) => `💧 Dowsed ${d.name}${d.how === 'forced' ? ' at full depth' : ''}!`, rod_slip: (d) => `🫗 Held back a ${d.name} — ${Math.round((100 * d.depth) / Math.max(1, d.need))}% deep`,
  walked: (d) => (d.found ? `🚶 Walked the map and twitched over a ${d.rarity} spot` : '🚶 Walked the map — nothing today'),
  gold_egg: (d) => `🪿 Cracked a golden egg: ${d.what ?? `+${d.ink} Ink`}${d.spark ? ' — and a Splice spark' : ''}`,
  chaos_box: (d) => (d.good ? `🏺 A chaos box: ${d.label}` : d.dodged ? '🏺 A chaos box hiccup — dodged' : '🏺 A chaos box hiccup: its clock stopped for an hour'),
  spored: (d) => `🦠 Sent ${d.n} spore${d.n > 1 ? 's' : ''} to neighbours’ plots`, stood_giant: (d) => `📡 Its plot stood giant for ${d.h} h`,
  echoed: (d) => `🪞 An echo: ${d.action === 'reward' ? 'its last reward paid again' : `${d.action} again, by itself`}${d.ink ? ` (+${d.ink} Ink)` : ''}`, echo_faded: () => '🪞 An echo faded (nothing to repeat)',
  arced: (d) => `⚡ Static arced to ${d.plots} plot${d.plots === 1 ? '' : 's'} (×1.25 for an hour)`, linked_plot: () => '🌀 Linked a second plot', divined: (d) => `🪄 Divined ${d.key === 'platinum' ? 'a Platinum egg' : d.key === 'aberration' ? 'an Aberration' : d.key === 'strike' ? 'a strike that lands' : d.key === 'world' ? 'The World' : 'a Splice spark'}!`,
  divine_slip: () => '🫗 Divining held back a natural hit — a little deeper',
  rewound: (d) => `⏪ Rewound: ${d.title} (${Math.max(1, Math.round(Number(d.ago) / 60))} min back, ${d.cost} min of time)`,
  rerolled: (d) => (d.kept ? `♾️ Paradox: rolled ${d.was} again — drew ${d.drew}, kept the better timeline` : `🦋 Rolled a ${d.was} plot again: ${d.drew === 'enchanted' ? `🔮 Enchanted (${kindInfo(d.kind).name})` : d.drew}`),
  unbitten: () => '⏪ A fox bite was rewound — it never bit', unhappened: (d) => `⏪ Rewound by a Clockwork: ${d.title ?? 'it never happened'}`,
  woven: (d) => `🕸️ Wove a fate: an Enchanted roll (${kindInfo(d.kind).name})`, nova: (d) => `💥 Went supernova — ×6 over ${d.r} m`,
  gift: (d) => `🎁 Gave a wish to @${d.to}`, boon: () => '👑 The Master’s Boon: an Epic+ roll ticket', toll: (d) => `🔔 Rang the Toll of Hours — ${d.n} enchantments jumped 30 min ahead`,
  hatched_into: (d) => `🥚 Hatched into a ${kindInfo(d.kind).name} (#${d.serial})`,
  sighted: (d) => `🔭 Sighted a ${d.rarity === 'enchanted' ? 'plot that stirs ✨' : `${d.rarity} plot`}`, prospected: (d) => `🔭 Claimed a plot it sighted (${d.rarity})${d.ink ? ` +${d.ink} Ink` : ''}`,
  second_sight: (d) => `👁️ Second Sight: ${d.was} → ${d.drew}${d.better ? ' (kept)' : ''}`,
  folded: (d) => `🦢 Folded ${d.name ?? 'a plot'} (${d.rarity}) into the pocket`, unfolded: (d) => `🦢 Unfolded a ${d.rarity} plot ${d.km} km away`, smoothed: () => '🦢 Smoothed a plot out where it was',
  creased: (d) => `🦢 Its clock folded ${d.hours} hours forward`,
  melted: (d) => `🔥 Melted ${d.n} plot${d.n > 1 ? 's' : ''} into ${d.heat} Heat`, struck: (d) => (d.ok ? `⚒️ Forged a ${d.from} plot up to ${d.to}${d.master ? ' — a Masterwork' : ''}` : `⚒️ A strike missed (${Math.round(d.chance * 100)}%)`),
  rune: (d) => (d.glyph ? `✍️ Its rune was traced: ${d.name} at ${Math.round(Number(d.accuracy) * 100)}%` : `🪨 Made a ${d.rune} rune`), artifact: (d) => `⚒️ Forged a ${ARTIFACTS[d.artifact]?.name ?? d.artifact}`, fused: (d) => `⚒️ Fused a ${ARTIFACTS[d.artifact]?.name ?? d.artifact} up to level ${d.level}`, tended: (d) => `✨ The artifacts brought ${[Number(d.luck) ? `${d.luck} Luck` : '', Number(d.ink) ? `${d.ink} Ink` : ''].filter(Boolean).join(' and ') || 'their gifts'}`,
  inlaid: (d) => `◇ Inlaid ${d.metal} into a plot`, monument: (d) => `🏛️ ${d.name ?? 'A monument'} grew to ${d.points} points`,
  strung: (d) => `🎭 Pulled the strings of @${d.owner}’s plot${d.grand ? ' — a Grand Show' : ''}`, show: (d) => `🎭 ${d.passed ? 'A show on strings' : 'A puppet run'} · level ${d.level}${d.ink ? ` · +${d.ink} Ink` : ''}`,
  auto_show: (d) => (d.passed ? `🎭 +1 level complete — ${gameName(d.game)} level ${d.level}${d.owner ? ` on @${d.owner}’s plot` : ''}${Number(d.ink) ? ` · +${d.ink} Ink` : ''}${d.grand ? ' · Grand Show' : ''}`
    : `🪢 The strings tangled on ${gameName(d.game)} level ${d.level}${d.owner ? ` (@${d.owner}’s plot)` : ''} — ${d.cleared ?? 0}/${d.rounds} rounds`),
  show_on: (d) => `🎪 The show went on: ${d.n} plot${d.n === 1 ? '' : 's'} on the playlist${d.encore === false ? '' : ', encores on'}`,
  show_off: (d) => (d.why === 'away' ? '🌙 The show closed for the night — nobody was watching for a day' : '🎪 The curtain came down on the show'),
  carried: (d) => `🎒 Its pocket has been carried ${d.km} km`,
  fate: (d) => `🃏 ${d.card}${d.up === false ? ' (reversed)' : ''}${d.held ? ', played from the hand' : ''}`, reborn: (d) => `🦋 Rebirth: a ${d.from} plot became ${d.to}`,
  trait_fold: (d) => `🦢 Folded ${d.target_kind ? `a ${kindInfo(d.target_kind).name}’s` : 'its'} wait: ${dur(Number(d.s))} shorter`, folded_by: (d) => `🦢 A ${kindInfo(d.kind).name} folded its wait: ${dur(Number(d.s))} shorter`,
  strings: (d) => `🎭 A puppet ${d.label}${d.other ? ` (for your ${kindInfo(d.kind).name})` : ''}`, far_sighted: (d) => `🔭 Scouted ${d.n} unclaimed plot${d.n > 1 ? 's' : ''} nearby (best: ${d.best === 'enchanted' ? '✨ something stirs' : d.best})`,
  grand_spread: (d) => `🌌 The Grand Spread: ${(d.cards ?? []).join(', ')}`, found: (d) => `📜 Found the ${d.name} glyph${d.source ? ` (${d.source === 'minigame' ? 'in a minigame win' : d.source === 'leviathan' ? 'in the Leviathan’s loot' : d.source === 'plot' ? 'in a rare plot' : 'in a chest'})` : ''}`,
  cast: (d) => `✍️ Cast ${(d.glyphs ?? []).join(' + ')}${d.found ? ` — and found ${d.found}` : ''}`, fizzled: () => '✍️ A glyph fizzled', studied: (d) => `📖 Studied the Spellbook${d.found ? ` — found ${d.found}` : ''}`,
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
