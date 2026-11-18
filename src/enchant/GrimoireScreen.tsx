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
import { Button, Empty, Spinner, inputCls } from '../ui';
import { AltarDialog, useLuck } from '../luck/Altar';
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

/** one enchantment's page, on its own (in a sheet over Explorer's Eyes): use its powers without leaving the view */
export function EnchantDetailSheet({ id }: { id: string }) {
  return (
    <div className="lv-grim-page min-h-full">
      <EnchantFxLayer />
      <Detail id={id} />
    </div>
  );
}

// ---- the book ---------------------------------------------------------------------------------------------------------
// One clear home: what it is (for a new player), what's ready to tend right now (with one button to start), your odds,
// then five tabs that always fit on a phone. Your enchantments are tiles: the ready ones first and glowing.
type Filter = 'all' | 'ready' | 'spliced';
type TabId = 'mine' | 'visitors' | 'bestiary' | 'codex' | 'badges';
const LEARN_KEY = 'landvas.grimoire.learned';
const learned = () => { try { return localStorage.getItem(LEARN_KEY) === '1'; } catch { return false; } };

function Home() {
  const me = useOnboardedMe();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'mine') as TabId;
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  const best = useQuery({ queryKey: ['enchant-bestiary'], queryFn: api.enchantBestiary, staleTime: 60_000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 30_000); return () => clearInterval(t); }, []);
  const list = mine.data ?? [];
  // new players see how it works until they close it (or once they have a few)
  const [help, setHelp] = useState<boolean | null>(null);
  const showHelp = help ?? (!learned() && list.length < 3);
  const closeHelp = () => { setHelp(false); try { localStorage.setItem(LEARN_KEY, '1'); } catch { /* private mode */ } };
  const elapsed = mine.dataUpdatedAt ? Math.max(0, (now - mine.dataUpdatedAt) / 1000) : 0;
  const ready = list.filter((e) => e.attention);
  const waitOf = (e: EnchantView) => (e.attention ? -1 : nextIn(e, elapsed * rateOf(e)) ?? Infinity);
  const shown = list.filter((e) => (filter === 'ready' ? !!e.attention : filter === 'spliced' ? !!(e.partner || e.partners?.length) : true));
  // copies of one kind stay side by side; kinds with something ready first, then whatever comes soonest
  const groups = useMemo(() => {
    const m = new Map<string, EnchantView[]>();
    for (const e of shown) { if (!m.has(e.kind)) m.set(e.kind, []); m.get(e.kind)!.push(e); }
    for (const g of m.values()) g.sort((a, b) => waitOf(a) - waitOf(b));
    const order = [...KIND_ORDER, 'cuckoo'] as string[];
    return [...m.entries()].sort((a, b) => waitOf(a[1][0]) - waitOf(b[1][0]) || order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [shown, elapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  const kinds = new Set(list.map((e) => e.kind)).size;
  const soonest = useMemo(() => list.filter((e) => !e.attention).map((e) => ({ e, s: nextIn(e, elapsed * rateOf(e)) })).filter((x) => x.s != null).sort((a, b) => a.s! - b.s!)[0], [list, elapsed]);
  const twins = useMemo(() => { const c = new Map<string, number>(); for (const e of list) if (e.kind !== 'cuckoo') c.set(e.kind, (c.get(e.kind) ?? 0) + 1); return [...c.entries()].filter(([, n]) => n > 1); }, [list]);
  const setTab = (t: TabId) => setSp((p) => { p.set('tab', t); return p; }, { replace: true });
  if (!me) return <Page><Empty title="Sign in to open your Grimoire" /></Page>;
  return (
    <Page>
      <header className="lv-gx-hero" data-testid="grimoire-hero">
        <motion.span className="lv-gx-book" initial={{ rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} aria-hidden><span className="lv-grim-book">📖</span></motion.span>
        <div className="min-w-0 flex-1">
          <h1>Grimoire</h1>
          <p>{list.length ? `${list.length} enchantment${list.length === 1 ? '' : 's'} · ${kinds} kind${kinds === 1 ? '' : 's'}` : 'Magical creatures that live on your plots'}</p>
        </div>
        <button className={cn('lv-gx-help', showHelp && 'on')} onClick={() => (showHelp ? closeHelp() : setHelp(true))} aria-expanded={showHelp} aria-label="How enchantments work" data-testid="grimoire-help">?</button>
      </header>
      <div className="grid gap-3">
        <AnimatePresence initial={false}>{showHelp && <HowItWorks key="learn" chance={best.data?.chance.base ?? 2} onClose={closeHelp} />}</AnimatePresence>
        <SpliceInvites />
        {list.length > 0 && <TodayCard list={list} ready={ready} soonest={soonest} />}
        <ChanceCard chance={best.data?.chance} />
        <AllChests />
        <GrimTabs tab={tab} onTab={setTab} counts={{ mine: list.length, ready: ready.length, visitors: visitors.data?.length ?? 0 }} />
        {tab === 'mine' && (mine.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : list.length ? (
          <div className="grid gap-3">
            <div className="lv-gx-chips" data-testid="grimoire-filter">
              {([['all', 'All', list.length], ['ready', '✦ Ready', ready.length], ['spliced', '🧬 Spliced', list.filter((e) => e.partner || e.partners?.length).length]] as [Filter, string, number][]).map(([f, label, n]) => (
                <button key={f} onClick={() => setFilter(f)} className={cn('lv-gx-chip', filter === f && 'on')} aria-pressed={filter === f} data-testid={`grimoire-filter-${f}`}>{label} <b>{n}</b></button>
              ))}
            </div>
            <div className="lv-gx-grid" data-testid="grimoire-list">
              {groups.map(([kind, copies], gi) => (
                <div key={kind} className="contents" data-testid="grimoire-group" data-kind={kind}>
                  {copies.map((e, ci) => <EnchantTile key={e.id} e={e} of={copies.length} i={gi + ci} elapsed={elapsed} />)}
                </div>
              ))}
            </div>
            {!groups.length && <p className="lv-gx-tip">{filter === 'ready' ? 'Nothing needs you right now — come back soon.' : 'Nothing spliced yet. Open a 🧪 Splice to fuse two enchantments into a hybrid.'}</p>}
            {twins.length > 0 && filter === 'all' && (
              <p className="lv-gx-tip" data-testid="grimoire-twins"><span className="text-lg">⭐</span><span>You have {twins.map(([k, n]) => `${n} ${kindInfo(k).name}s`).join(', ')}. Open the one to keep and use <b>“Pour in a copy”</b> to give it a Star.</span></p>
            )}
          </div>
        ) : (
          <div className="lv-gx-empty" data-testid="grimoire-empty">
            <span className="text-5xl">✨</span>
            <b>No enchantments yet</b>
            <p>Every plot you roll has a {best.data?.chance.base ?? 2}% chance to come out <b>Enchanted</b> — a living creature instead of a rarity. Raise the odds with Enchanted Luck.</p>
            <Link to="/world"><Button variant="rainbow">🎲 Roll a plot</Button></Link>
          </div>
        ))}
        {tab === 'visitors' && <Visitors list={visitors.data ?? []} loading={visitors.isLoading} />}
        {tab === 'bestiary' && <Bestiary data={best.data} />}
        {tab === 'badges' && <GrimoireBadges />}
        {tab === 'codex' && <Codex codex={best.data?.codex ?? []} trinities={best.data?.trinities ?? []} plots={best.data?.plots ?? []} aberrations={best.data?.aberrations ?? []} />}
      </div>
    </Page>
  );
}

/** three steps, in plain words, for someone who has never seen an enchantment */
function HowItWorks({ chance, onClose }: { chance: number; onClose(): void }) {
  const steps = [
    ['🎲', 'Roll plots', `About ${chance} in 100 come out Enchanted — a living creature instead of a rarity.`],
    ['✦', 'Tend it when it glows', 'Each kind has its own little game. Playing it pays Ink and levels it up.'],
    ['⭐', 'Grow your collection', 'Pour in copies for Stars, Splice two into a hybrid, and fill the Codex.'],
  ] as const;
  return (
    <motion.section className="lv-gx-learn" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} data-testid="grimoire-learn">
      <div className="flex items-center gap-2"><b className="flex-1 font-display text-[15px] text-[#E5CCFF]">How enchantments work</b>
        <button className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-black text-white/85" onClick={onClose} data-testid="grimoire-learn-close">Got it</button></div>
      <ol className="lv-gx-steps">
        {steps.map(([icon, t, d], i) => <li key={t} className="lv-gx-step"><span className="n" aria-hidden>{icon}</span><span className="min-w-0"><b>{i + 1}. {t}</b><i>{d}</i></span></li>)}
      </ol>
    </motion.section>
  );
}

/** today: how many are waiting for you, a ring that fills as you tend them, and one button to start the round */
function TodayCard({ list, ready, soonest }: { list: EnchantView[]; ready: EnchantView[]; soonest?: { e: EnchantView; s: number | null } }) {
  const done = list.length - ready.length, pct = list.length ? done / list.length : 1;
  const r = 31, c = 2 * Math.PI * r;
  const first = ready[0];
  return (
    <section className={cn('lv-gx-today', !ready.length && 'calm')} data-testid="grimoire-ready">
      <div className="lv-gx-ring" aria-label={`${done} of ${list.length} tended`}>
        <svg viewBox="0 0 74 74" width="74" height="74" aria-hidden>
          <circle cx="37" cy="37" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
          <circle cx="37" cy="37" r={r} fill="none" stroke="url(#lv-gx-ring)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,1.2,.4,1)' }} />
          <defs><linearGradient id="lv-gx-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3DDC97" /><stop offset="1" stopColor="#FFD23F" /></linearGradient></defs>
        </svg>
        {ready.length ? <span className="grid justify-items-center"><b>{ready.length}</b><i>ready</i></span> : <span className="text-[26px]" aria-hidden>✓</span>}
      </div>
      <div className="min-w-0">
        <h2>{ready.length ? `${ready.length} ready to tend` : 'All tended!'}</h2>
        {ready.length ? (
          <div className="lv-gx-stack" aria-label="Ready now">
            {ready.slice(0, 6).map((e) => <Link key={e.id} to={`/grimoire/${e.id}`} title={`${enchantName(e)} — ${e.attention}`} data-testid="grimoire-ready-chip"><Sigil kind={e.kind} seed={e.sigil} size={30} level={e.level} still /></Link>)}
            {ready.length > 6 && <span className="more">+{ready.length - 6}</span>}
          </div>
        ) : (
          <p data-testid="grimoire-none-ready">{soonest ? <>Next up: <b className="text-white/90">{enchantName(soonest.e)}</b> in {dur(soonest.s!)}.</> : 'Nothing is waiting on you.'}</p>
        )}
      </div>
      {first && (
        <Link to={`/grimoire/${first.id}`} className="lv-gx-go" data-testid="grimoire-start">
          <span aria-hidden>▶</span><span className="min-w-0 truncate">{ready.length > 1 ? 'Start tending' : 'Tend'} · {enchantName(first)}</span>
        </Link>
      )}
    </section>
  );
}

/** your next roll's odds of coming out Enchanted, with the Altar of Luck one tap away */
function ChanceCard({ chance }: { chance?: { base: number; charges: number; step: number; max?: number } }) {
  const luck = useLuck();
  const [altar, setAltar] = useState(false);
  if (!chance) return null;
  const pct = chance.base + chance.charges * chance.step;
  const can = !!luck.data?.enabled;
  return (
    <>
      <button className="lv-gx-chance" onClick={() => can && setAltar(true)} disabled={!can} data-testid="grimoire-chance">
        <span className="orb" aria-hidden>✨</span>
        <span className="min-w-0 flex-1"><b>Next roll: {pct}% Enchanted</b>
          <i>{chance.charges ? `${chance.charges} Enchanted Luck charge${chance.charges === 1 ? '' : 's'} armed` : 'Raise your odds with Enchanted Luck'}</i></span>
        {can && <span className="cta">Raise ›</span>}
      </button>
      {can && <AltarDialog open={altar} onOpenChange={setAltar} />}
    </>
  );
}

/** five tabs that always fit, each with its icon and a count where it matters */
function GrimTabs({ tab, onTab, counts }: { tab: TabId; onTab(t: TabId): void; counts: { mine: number; ready: number; visitors: number } }) {
  const items: [TabId, string, string, number | null][] = [
    ['mine', '📖', 'Mine', counts.ready || null], ['visitors', '🌿', 'My land', counts.visitors || null],
    ['bestiary', '🐉', 'Bestiary', null], ['codex', '🧬', 'Codex', null], ['badges', '🏅', 'Badges', null],
  ];
  return (
    <div className="lv-gx-tabs" role="tablist" aria-label="Grimoire" data-testid="grimoire-tabs">
      {items.map(([id, icon, label, n]) => (
        <button key={id} role="tab" aria-selected={tab === id} data-state={tab === id ? 'active' : 'inactive'} className="lv-gx-tab" onClick={() => onTab(id)} data-sound="tab" data-testid={`grimoire-tab-${id}`}>
          <span className="ic" aria-hidden>{icon}</span><span className="lb">{label}{id === 'mine' && counts.mine ? <span className="sr-only"> ({counts.mine})</span> : null}</span>
          {n ? <span className="ct">{n}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** one enchantment as a tile: its sigil, its name, its level and stars, and — in plain words — whether it's ready */
function EnchantTile({ e, of, i, elapsed }: { e: EnchantView; of: number; i: number; elapsed: number }) {
  const k = kindInfo(e.reflect_kind ?? e.kind);
  const n = e.attention ? null : nextIn(e, elapsed * rateOf(e));
  const partner = e.partner ?? e.partners?.[0];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="min-w-0">
      <Link to={`/grimoire/${e.id}`} className={cn('lv-gx-tile', e.attention && 'ready')} style={{ ['--a' as string]: kindInfo(e.kind).a, ['--b' as string]: kindInfo(e.kind).b }} data-testid="grimoire-card" data-kind={e.kind}>
        <span className="lv-gx-tile-top">
          <span className="flex items-center gap-1"><span className="lv-gx-lv">LV {e.level}</span>{(e.stars ?? 0) > 0 && <StarPips stars={e.stars ?? 0} of={e.stars ?? 0} className="text-[10px]" />}</span>
          {of > 1 && <span className="lv-gx-x" title={`You have ${of} of this kind`}>×{of}</span>}
        </span>
        <span className="lv-gx-art">
          <StarAura stars={e.stars ?? 0} size={62}><Sigil kind={e.kind} seed={e.sigil} size={62} level={e.level} still={!e.attention} /></StarAura>
          {e.reflect_kind && <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-[#C0F5FF] text-[12px] shadow">{k.emoji}</span>}
        </span>
        <span className="lv-gx-name">{enchantName(e)}</span>
        <span className="lv-gx-sub">{partner ? <>🧬 {partner.hybrid}</> : <>{kindInfo(e.kind).emoji} {kindInfo(e.kind).name}</>}</span>
        <span className="lv-gx-status" data-testid="grimoire-status"><span>{e.attention ? `✦ ${e.attention}` : e.clock?.frozen_until ? '❄️ Frozen' : n != null ? `⏳ ${dur(n)}` : '💤 Resting'}</span></span>
        <TempoBadge e={e} compact className="absolute right-2 top-[30px]" />
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
/** all twenty-one kinds as tiles: tap one to read what it does (it opens across the row) */
function Bestiary({ data }: { data: Awaited<ReturnType<typeof api.enchantBestiary>> | undefined }) {
  const [open, setOpen] = useState<string | null>(null);
  const owned = KIND_ORDER.filter((id) => (data?.kinds.find((x) => x.kind === id)?.mine ?? 0) > 0).length;
  return (
    <div className="grid gap-3" data-testid="grimoire-bestiary">
      <p className="lv-gx-tip"><span className="text-lg">🐉</span><span>Every kind of enchantment in the world. You’ve found <b>{owned} of {KIND_ORDER.length}</b>. Tap one to see what it does.</span></p>
      <div className="lv-gx-grid lv-gx-grid-list">
        {KIND_ORDER.map((id, i) => {
          const k = KINDS[id], d = data?.kinds.find((x) => x.kind === id), have = (d?.mine ?? 0) > 0, isOpen = open === id;
          return (
            <motion.button key={id} layout="position" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}
              className={cn('lv-gx-beast', isOpen && 'open', !have && 'locked')} style={{ ['--a' as string]: k.a }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }} data-testid="bestiary-kind" data-kind={id}>
              <span className="em" aria-hidden>{k.emoji}</span>
              <span className="grid min-w-0 gap-0.5">
                <b>{k.name}</b>
                <i>{have ? <span className="text-[#9BF6C8]">✓ Yours{d!.mine > 1 ? ` ×${d!.mine}` : ''}</span> : 'Not found yet'} · {fmt(d?.population ?? 0)} in the world</i>
                {isOpen ? <span className="tl">{k.tagline}</span> : <span className="tl clamp">{k.tagline}</span>}
              </span>
              <AnimatePresence>
                {isOpen && (
                  <motion.span className="how" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <ol>{k.how.map((h) => <li key={h}>{h}</li>)}</ol>
                    {k.geneText && <span className="gene">🧬 Spliced, it lends its <b>{k.geneName}</b> Trait: the other one {k.geneText}.</span>}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** the Codex: pick a kind and see every hybrid it makes (found ones named, the rest still a mystery) — and the full
 *  chart of every pairing, which fits the screen */
function Codex({ codex, trinities, plots, aberrations }: { codex: string[]; trinities: string[]; plots: string[]; aberrations: string[] }) {
  const ks = KIND_ORDER.filter((k) => k !== 'splice');
  const [pick, setPick] = useState<EnchantKind>(ks[0]);
  const [open, setOpen] = useState<string | null>(null);
  const perfectFound = Object.entries(HYBRIDS).filter(([key, [, p]]) => p && codex.includes(key)).length;
  const foundOf = (k: string) => ks.filter((c) => c !== k && codex.includes(hybridKey(k, c))).length;
  const pairs = ks.filter((c) => c !== pick).map((c) => { const key = hybridKey(pick, c), [name, perfect] = HYBRIDS[key] ?? ['?', false]; return { c, key, name, perfect, has: codex.includes(key) }; })
    .sort((a, b) => Number(b.has) - Number(a.has) || Number(b.perfect) - Number(a.perfect));
  return (
    <div className="grid gap-3" data-testid="grimoire-codex">
      <div className="lv-gx-codex-head">
        <div className="min-w-0"><b>🧬 Splice Codex</b><i>Every hybrid you’ve made by splicing two kinds</i></div>
        <span className="big">{codex.length}<small>/{HYBRID_COUNT}</small></span>
        <div className="lv-gx-bar" aria-hidden><i style={{ width: `${(codex.length / HYBRID_COUNT) * 100}%` }} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black">
        <div className="lv-gx-stat"><b className="text-[#E5CCFF]">{perfectFound}/{PERFECT_COUNT}</b>✦ Perfect</div>
        <div className="lv-gx-stat"><b className="text-[#9BF6E5]">{trinities.length}</b>🔺 Trinities</div>
        <div className="lv-gx-stat"><b className="text-[#FFB3C7]">{aberrations.length}/{ABERRATION_COUNT}</b>☣️ Aberrations</div>
      </div>
      {/* pick a kind: what it makes */}
      <div className="grid gap-2">
        <h3 className="lv-gx-label">Pick a kind to see what it makes</h3>
        <div className="lv-gx-kindpick" data-testid="codex-kinds">
          {ks.map((k) => {
            const f = foundOf(k);
            return (
              <button key={k} onClick={() => { setPick(k); setOpen(null); }} className={cn(pick === k && 'on')} style={{ ['--a' as string]: KINDS[k].a }} aria-pressed={pick === k} title={KINDS[k].name} data-testid={`codex-kind-${k}`}>
                <span aria-hidden>{KINDS[k].emoji}</span>{f > 0 && <i>{f}</i>}
              </button>
            );
          })}
        </div>
        <div className="lv-gx-pairs" data-testid="codex-pairs">
          <div className="text-[12.5px] font-black" style={{ color: KINDS[pick].a }}>{KINDS[pick].emoji} {KINDS[pick].name} · {foundOf(pick)} of {ks.length - 1} found</div>
          {pairs.map((p) => (
            <div key={p.key} className="grid gap-1.5">
              <button onClick={() => setOpen(open === p.key ? null : p.key)} className={cn('lv-gx-pair', p.has && 'has', p.perfect && 'perfect')} aria-expanded={open === p.key} data-testid="codex-pair">
                <span className="e" aria-hidden>{KINDS[pick].emoji}<small>+</small>{KINDS[p.c].emoji}</span>
                <span className="min-w-0 flex-1 truncate">{p.has ? p.name : p.perfect ? '✦ A Perfect Match awaits' : 'Undiscovered'}</span>
                <span className="tag">{p.has ? (p.perfect ? '✦ Found' : '✓ Found') : '?'}</span>
              </button>
              {open === p.key && (p.has ? <HybridCard a={pick} b={p.c} /> : (
                <p className="rounded-2xl bg-white/[0.04] px-3 py-2 text-[12px] text-white/70">{p.perfect ? '✦ A Perfect Match — both Traits doubled. ' : ''}Splice a {KINDS[pick].name} with a {KINDS[p.c].name} to discover it.</p>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <h3 className="lv-gx-label">☣️ Aberrations — 1 in 20 Swaps or Chimeras mutates</h3>
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
      {/* the whole chart: a row and a column for every kind, squeezed to fit */}
      <details className="lv-gx-fold" data-testid="codex-chart">
        <summary>🗺️ The full chart <small>every pairing at once</small></summary>
        <div className="lv-codex-grid mt-2 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${ks.length + 1}, minmax(0, 1fr))` }}>
          <span />
          {ks.map((k) => <span key={k} className="lv-gx-cell head">{KINDS[k].emoji}</span>)}
          {ks.map((r) => [
            <span key={`r${r}`} className="lv-gx-cell head">{KINDS[r].emoji}</span>,
            ...ks.map((c) => {
              if (r === c) return <span key={r + c} className="lv-gx-cell self" />;
              const key = hybridKey(r, c), [name, perfect] = HYBRIDS[key] ?? ['?', false], has = codex.includes(key);
              return (
                <button key={r + c} onClick={() => { setPick(r); setOpen(key); }} title={has ? name : perfect ? 'A Perfect Match awaits' : 'Undiscovered'}
                  className={cn('lv-gx-cell', has ? (perfect ? 'bg-[linear-gradient(135deg,#00F5D4,#B26BFF)] text-[#04211D]' : 'bg-[#00F5D4]/35 text-white') : perfect ? 'border border-dashed border-[#E5CCFF]/50 text-[#E5CCFF]/60' : 'bg-white/[0.04] text-white/20')}>
                  {has ? (perfect ? '✦' : '●') : perfect ? '✦' : ''}
                </button>
              );
            }),
          ])}
        </div>
      </details>
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
    <div className="grid gap-2" data-testid="splice-invites">
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
  return <SeekChests chests={q.data ?? []} title={`Buried chests waiting · ${q.data?.length ?? 0}`} hint="Your enchantments’ Seeking Trait buried these by their plots. Dig them up here or tap them on the map." />;
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
  stormcoil: ['your hybrids', 'your plots'], sun: ['any spot on the map', 'your plots', 'your party'], rod: ['your plot rolls', 'spots near you'], dejavu: ['moments near you', 'spots on the map', 'your hybrids', 'the Leviathan'], spyglass: ['unclaimed plots on the map'], origami: ['your plots', 'free spots on the map'],
  crucible: ['your plots'], puppeteer: ['other players’ plots'], deck: ['your day'], glyph: ['your plots', 'your enchantments', 'the Leviathan'], cuckoo: ['what it hatches into'],
};
const SECTIONS = [['play', '✨', 'Play'], ['traits', '🧬', 'Traits'], ['stars', '⭐', 'Stars'], ['story', '📜', 'Story'], ['how', '❓', 'How']] as const;

/** which section of the page is on screen, for the jump bar */
function useSpy(ids: string[], key: string) {
  const [on, setOn] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((s) => document.getElementById(`ench-${s}`)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setOn(vis.target.id.replace('ench-', ''));
    }, { rootMargin: '-30% 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [on, setOn] as const;
}

/** the last one of the round tended: a little celebration */
function useRoundCheer(v: EnchantView | undefined, all: EnchantView[] | undefined) {
  const was = useRef<{ id: string; attn: boolean } | null>(null);
  useEffect(() => {
    if (!v || v.mine === false) return;
    const prev = was.current;
    was.current = { id: v.id, attn: !!v.attention };
    if (!prev || prev.id !== v.id || !prev.attn || v.attention) return;
    if ((all ?? []).some((e) => e.attention && e.id !== v.id)) return;
    feel('success');
    efx.burst({ x: innerWidth / 2, y: innerHeight * 0.35, colors: ['#3DDC97', '#FFD23F', '#fff'], count: 140, speed: 12, kind: 'spark' });
    toast.success('✓ All tended — nothing else needs you right now');
  }, [v?.id, v?.attention]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Detail({ id }: { id: string }) {
  const q = useEnchant(id);
  const nav = useNavigate();
  const { act, busy } = useAct(id);
  const mineList = useMyEnchantments();
  useRoundCheer(q.data, mineList.data);
  const [naming, setNaming] = useState<string | null>(null);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const v = q.data;
  const partners = v ? (v.partners ?? (v.partner ? [v.partner] : [])) : [];
  const mine = !!v && v.mine !== false && !!v.view;
  const sections = SECTIONS.filter(([s2]) => s2 !== 'traits' || partners.length > 0);
  const [on, setOn] = useSpy(sections.map(([s2]) => s2), `${id}:${mine}:${partners.length}`);
  if (q.isLoading) return <Page><div className="flex justify-center py-16"><Spinner /></div></Page>;
  if (!v) return <Page><Empty title="This enchantment has gone">It may have passed to a new owner, or vanished from the land.</Empty></Page>;
  const k = kindInfo(v.kind);
  const [lng, lat] = cellCenter(v.gx, v.gy);
  const xpPct = v.xp_next ? Math.min(100, ((v.xp - (v.xp_prev ?? 0)) / Math.max(1, v.xp_next - (v.xp_prev ?? 0))) * 100) : 0;
  // your other copies of this kind: step between them
  const all = mineList.data ?? [];
  const copies = all.filter((e) => e.kind === v.kind);
  const at = copies.findIndex((e) => e.id === v.id);
  // the round: the other enchantments that are ready right now, in the order the Grimoire shows them
  const queue = all.filter((e) => e.attention && e.id !== v.id);
  const wait = v.attention ? null : nextIn(v, (q.dataUpdatedAt ? (Date.now() - q.dataUpdatedAt) / 1000 : 0) * rateOf(v));
  const traitNeeds = !!(v.traits?.fold && v.traits.fold.left > 0) || !!(v.traits?.rune && v.traits.rune.ready) || !!(v.traits?.golden && v.traits.golden.left > 0) || !!(v.traits?.chaos && v.traits.chaos.left > 0);
  const jump = (s: string) => { setOn(s); document.getElementById(`ench-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const titles = v.titles ?? [];
  return (
    <Page>
      {/* the top bar: back, your copies of this kind, clip it, find it on the map */}
      <div className="lv-gx-top">
        <Link to="/grimoire" className="lv-gx-back" data-testid="ench-back"><span aria-hidden>‹</span> Grimoire</Link>
        {copies.length > 1 && at >= 0 ? (
          <div className="lv-gx-copies" data-testid="ench-copies">
            {copies.map((c, i) => (
              <Link key={c.id} to={`/grimoire/${c.id}`} replace className={cn('relative grid h-8 w-8 shrink-0 place-items-center rounded-full', c.id === v.id ? 'bg-white/20 ring-2 ring-white/70' : 'opacity-70')} title={enchantName(c)} data-testid="ench-copy">
                <Sigil kind={c.kind} seed={c.sigil} size={26} level={c.level} still />
                {c.attention && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#FFD23F] ring-2 ring-[#12041F]" />}
                <span className="sr-only">{i + 1}</span>
              </Link>
            ))}
            <span className="shrink-0 px-1.5 text-[11px] font-black text-white/70">{at + 1}/{copies.length}</span>
          </div>
        ) : <span className="flex-1" />}
        <ClipMomentButton className="lv-gx-clip" label="🎬" testId="ench-clip" moment={newMoment({ type: 'showcase', e: enchantRef(v), titles, user: v.owner?.username ?? null })} />
        <button className="lv-gx-ibtn" onClick={() => toMap(nav, { lng, lat, zoom: 19 })} aria-label="Show it on the map" title="Show it on the map" data-testid="ench-map">📍</button>
      </div>
      <div className="lv-gx-detail">
        <div className="lv-gx-aside">
          {/* who it is: one of a kind */}
          <motion.section className="lv-gx-head" style={{ ['--a' as string]: k.a, ['--b' as string]: k.b }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} data-testid="ench-header">
            <div className="lv-gx-head-row">
              <StarAura stars={v.stars ?? 0} size={92}><EvolveAura level={v.level} color={k.a} size={92}><Sigil kind={v.kind} seed={v.sigil} size={86} level={v.level} /></EvolveAura></StarAura>
              <div className="grid min-w-0 gap-1">
                {naming == null ? (
                  <button className="min-w-0 text-left" onClick={() => mine && setNaming(v.nickname ?? '')} data-testid="ench-name"><span className="break-words font-display text-[22px] font-black leading-tight">{enchantName(v)}</span>{mine && <span className="ml-1 text-xs text-white/40" aria-label="Rename">✎</span>}</button>
                ) : (
                  <form className="flex min-w-0 gap-1.5" onSubmit={async (e) => { e.preventDefault(); await act('rename', { name: naming }); setNaming(null); }}>
                    <input autoFocus maxLength={24} className={cn(inputCls, 'h-9 min-w-0')} value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={`${k.name} #${v.serial}`} data-testid="ench-rename" />
                    <Button size="sm" type="submit">Name</Button>
                  </form>
                )}
                <div className="lv-gx-kindline">{k.emoji} {k.name} · #{v.serial}</div>
                <div className="lv-gx-xp" data-testid="ench-level">
                  <span className="lv-gx-lv">LV {v.level}</span>
                  <span className="lv-gx-xpbar" title={`${Math.round(xpPct)}% to level ${v.level + 1}`}><i style={{ width: `${xpPct}%` }} /></span>
                  {(v.stars ?? 0) > 0 && <StarPips stars={v.stars ?? 0} className="text-[13px]" testId="ench-header-stars" />}
                </div>
              </div>
            </div>
            <p className="lv-gx-tagline">{k.tagline}{v.level > 1 && <span className="text-white/45"> · LV {v.level} pays +{Math.round((v.level - 1) * 6)}% Ink</span>}</p>
            {/* what it's doing right now — and one button to it */}
            {mine && (
              <div className={cn('lv-gx-cta', v.attention ? 'ready' : 'wait')} data-testid="ench-status">
                <span className="min-w-0 flex-1">{v.attention ? <>✦ {v.attention}</> : v.clock?.frozen_until ? <>❄️ Frozen for {dur((Date.parse(v.clock.frozen_until) - Date.now()) / 1000)}</> : wait != null ? <NextInLive v={v} at={q.dataUpdatedAt} /> : <>💤 Resting — nothing waiting</>}</span>
                <TempoBadge e={v} />
                {v.attention ? <button className="go" onClick={() => jump('play')} data-testid="ench-go-play">Play ↓</button>
                  : queue[0] ? <Link className="go" to={`/grimoire/${queue[0].id}`} data-testid="ench-next">Next ready ›</Link> : null}
              </div>
            )}
            <div className="lv-gx-works" data-testid="ench-works-on">
              <span className="font-black text-white/50">🎯 Works on</span>
              {(WORKS_ON[v.reflect_kind ?? v.kind] ?? []).map((w) => <span key={w} className="w">{w}</span>)}
              {titles.length > 2 && <button className="lv-gx-titles-btn" onClick={() => setTitlesOpen((o) => !o)} aria-expanded={titlesOpen}>🏅 {titles.length} titles</button>}
            </div>
            {titles.length > 0 && (titlesOpen || titles.length <= 2) && (
              <div className="flex flex-wrap gap-1.5" data-testid="ench-titles">{titles.map((t) => <span key={t} title={TITLES[t]} className="rounded-full bg-[linear-gradient(90deg,#FFD23F33,#B26BFF33)] px-2.5 py-0.5 text-[11px] font-black text-[#FFE8A3]">🏅 {t}</span>)}</div>
            )}
            {v.size && <div className="rounded-2xl px-3 py-2 text-[12px] font-bold" style={{ background: v.size.mode === 'grow' ? '#39FF1418' : '#FF00E518', color: v.size.mode === 'grow' ? '#B6FF3D' : '#FF7AE0' }} data-testid="ench-size">
              {v.size.prank ? `🤡 @${v.size.by_name ?? '?'} pranked its plot ${v.size.mode === 'grow' ? 'GIANT' : 'TINY'} (only for show)` : v.size.mode === 'grow' ? '🔼 Its plot is 100× GIANT' : '🔽 Its plot is 100× tiny — its time runs twice as fast'}{v.size.linked ? ' (through a wormhole)' : ''} · {dur((Date.parse(v.size.until) - Date.now()) / 1000)} left</div>}
            {v.clock?.frozen_until && <div className="rounded-2xl bg-[#C0F5FF]/10 px-3 py-2 text-[12px] font-bold text-[#C0F5FF]">❄️ Frozen in time by a Clockwork — nothing grows, nothing comes until it thaws.</div>}
          </motion.section>
          {/* jump to: play · traits · stars · story · how (it follows you down the page) */}
          {mine && (
            <nav className="lv-gx-nav" aria-label="Sections" data-testid="ench-nav">
              {sections.map(([s2, icon, label]) => (
                <button key={s2} onClick={() => jump(s2)} className={cn(on === s2 && 'on')} aria-current={on === s2 ? 'true' : undefined} data-testid={`ench-nav-${s2}`}>
                  <span aria-hidden>{icon}</span> {label}{s2 === 'traits' && traitNeeds && <span className="dot" />}{s2 === 'play' && v.attention && <span className="dot" />}
                </button>
              ))}
            </nav>
          )}
        </div>
        <div className="min-w-0">
          {/* the scene: where you play with it */}
          <section id="ench-play" className="lv-gx-sec first">
            {mine ? <div className="relative mx-auto w-full max-w-[680px]"><ClockRate.Provider value={rateOf(v)}><SceneFor kind={v.kind} v={v} view={v.view} act={act} busy={busy} at={q.dataUpdatedAt} /></ClockRate.Provider><SceneMood v={v} /></div>
              : <div className="lv-gx-empty"><span className="text-5xl">{k.emoji}</span><b>@{v.owner?.username}’s {k.name}</b><p>{k.tagline}</p></div>}
          </section>
          {/* done here? the next one that's ready, one tap away */}
          {mine && queue.length > 0 && (
            <Link to={`/grimoire/${queue[0].id}`} className="lv-gx-next" style={{ ['--a' as string]: kindInfo(queue[0].kind).a }} data-testid="ench-next-card">
              <Sigil kind={queue[0].kind} seed={queue[0].sigil} size={40} level={queue[0].level} still />
              <span className="grid min-w-0 flex-1 leading-tight"><i>Next ready{queue.length > 1 ? ` · ${queue.length} waiting` : ''}</i><b>{enchantName(queue[0])}</b><small>✦ {queue[0].attention}</small></span>
              <span className="arrow" aria-hidden>›</span>
            </Link>
          )}
          {mine && !v.attention && !queue.length && all.length > 1 && <p className="lv-gx-tip mt-3" data-testid="ench-all-tended"><span className="text-lg">✓</span><span>All your enchantments are tended. Come back when one glows.</span></p>}
          {/* your other enchantments that can work on this one, right here */}
          {mine && <UseOnThis v={v} />}
          {mine && (v.chests?.length ?? 0) > 0 && (
            <SeekChests className="mt-4" chests={v.chests!} title={v.kind === 'map' ? `Chests your Seeking Trait buried · ${v.chests!.length}` : `Its buried chests · ${v.chests!.length}`}
              hint={v.kind === 'map' ? 'This map lent its Seeking Trait in a splice: these chests are buried by the plots of the enchantments that wore it.' : 'Its Seeking Trait buried these right by its plot. Dig them up here or tap them on the map.'} />
          )}
          {partners.length > 0 && (
            <section id="ench-traits" className="lv-gx-sec">
              <h2 className="lv-gx-h2">🧬 Traits it wears <small>from its splice</small></h2>
              <TraitsAtWork v={v} mine={mine} onSeparate={() => void act('separate')} act={act} busy={busy} />
            </section>
          )}
          {mine && <section id="ench-stars" className="lv-gx-sec"><StarsPanel v={v} /></section>}
          {mine && <section id="ench-story" className="lv-gx-sec"><Chronicle id={v.id} v={v} /></section>}
          {/* how it works, step by step */}
          <section id="ench-how" className="lv-gx-sec">
            <details className="lv-gx-fold" open={!mine || v.level <= 2} data-testid="ench-how">
              <summary>❓ How the {k.name} works</summary>
              <ol className="lv-gx-howlist">{k.how.map((h) => <li key={h}>{h}</li>)}</ol>
              {k.geneText && <p className="mt-2 text-[12.5px] font-bold text-[#9BF6E5]">🧬 When spliced, it lends its {k.geneName} Trait: the other one {k.geneText}.</p>}
            </details>
          </section>
          {mine && v.kind === 'wormhole' && <WarpTunnel />}
        </div>
      </div>
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
  scooped: (d) => `🫙 Caught ${d.name ?? 'a moment'} in the jar${d.from ? ` (${d.from})` : ''}`,
  uncorked: (d) => `🫙 Uncorked ${d.name ?? 'a moment'} at ${d.pct ?? 100}% — ${d.zone ? (d.zone.flare ? 'a Flare zone' : `a Déjà Vu zone, ultras ×${d.zone.um}`) : d.lev ? `${d.lev.label ?? 'a weak moment'} again for ${d.lev.secs} s` : d.bolt ? (d.bolt.what === 'aberration' ? `it struck and made ${d.bolt.aberration}!` : `it struck a hybrid (${d.bolt.what})`) : d.stars ? `${d.stars.n} stars fell` : d.golden ? `a Golden Hour again (${d.golden.uses} wins)` : 'it happened again'}${d.double ? ' · half stayed in the jar' : ''}`,
  poured: (d) => `🫙 Poured ${d.name ?? 'a moment'} out of the jar`,
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
  auto_show: (d) => (d.passed ? `🎭 +1 level complete — ${gameName(d.game)} level ${d.level}${d.owner ? ` on @${d.owner}’s plot` : ''}${d.held ? ' · Ink paused right now' : Number(d.ink) ? ` · +${d.ink} Ink${Number(d.mult) > 1 ? ` (×${Number(d.mult) >= 10 ? Math.round(Number(d.mult)) : Math.round(Number(d.mult) * 10) / 10} plot)` : ''}` : ''}${d.grand ? ' · Grand Show' : ''}`
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
function Chronicle({ id, v }: { id: string; v: EnchantView }) {
  const q = useQuery({ queryKey: ['enchant-chronicle', id], queryFn: () => api.enchantChronicle(id), staleTime: 10_000 });
  const [all, setAll] = useState(false);
  const list = q.data ?? [];
  const shown = all ? list : list.slice(0, 8);
  const facts: [string, string][] = [
    ['Mint number', `#${v.serial} of ${fmt(v.minted)}`], ['Alive in the world', fmt(v.population)],
    ['Born', `${timeAgo(v.born_at)} · ${v.born_place ?? 'an unmapped place'}`], ['Held by', v.owner ? `@${v.owner.username}` : '—'],
    ...(v.first_owner && v.owner && v.first_owner.id !== v.owner.id ? [['First held by', `@${v.first_owner.username}`] as [string, string]] : []),
    ...(v.stats?.ink ? [['Ink earned', `💧 ${fmt(v.stats.ink)}`] as [string, string]] : []),
    ...(v.clock?.skip_s ? [['Its clock', `⏩ ${dur(v.clock.skip_s)} ahead`] as [string, string]] : []),
  ];
  return (
    <div className="grid gap-3" data-testid="ench-chronicle">
      <h2 className="lv-gx-h2">📜 Its story</h2>
      <div className="lv-gx-facts" data-testid="ench-facts">{facts.map(([a, b]) => <div key={a} className="lv-gx-fact"><i>{a}</i><b>{b}</b></div>)}</div>
      <ol className="lv-gx-log">
        {shown.map((e) => <li key={e.id}><span className="min-w-0 flex-1">{EV[e.kind]?.(e.data) ?? e.kind}</span><time>{timeAgo(e.at)}</time></li>)}
      </ol>
      {!list.length && <p className="text-[12px] text-white/50">Nothing written yet.</p>}
      {list.length > 8 && <button className="w-fit text-[12px] font-black text-[#9BE7FF]" onClick={() => setAll((x) => !x)}>{all ? 'Show less' : `Show all ${list.length}`}</button>}
    </div>
  );
}
