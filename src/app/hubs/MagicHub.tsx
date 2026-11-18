// The app's Magic hub: everything about enchantments in one place — what you own and what's ready, your Enchanted
// odds, Stars to ★5, Splice, the Clockwork's Rewind, badges, the Leviathan, and all twenty-one kinds to collect.
import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, Dna, DoorOpen, Library, Sparkles, WandSparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../backend/api';
import { useMyEnchantments, useVisitors } from '../../enchant/core';
import { HYBRID_COUNT, KIND_ORDER, PAYS_FROM, enchantName, kindInfo, type EnchantKind } from '../../enchant/kinds';
import { fmt } from '../../lib/utils';
import { buzz } from '../../native/native';
import { Dialog } from '../../ui';
import { HeroButton, HubCard, HubH2, HubHero, HubJump, HubLearn, HubPage, NewTag, rise } from './HubKit';

/** the newest kinds wear a NEW tag */
const NEWEST: EnchantKind[] = ['dejavu', 'sun', 'rod', 'puppeteer'];

export default function MagicHub() {
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  const best = useQuery({ queryKey: ['enchant-bestiary'], queryFn: api.enchantBestiary, staleTime: 60_000 });
  const [open, setOpen] = useState<EnchantKind | null>(null);
  const list = mine.data ?? [];
  const ready = list.filter((e) => e.attention);
  const byKind = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const e of list) m.set(e.kind, [...(m.get(e.kind) ?? []), e]);
    return m;
  }, [list]);
  const owned = KIND_ORDER.filter((k) => byKind.has(k)).length;
  const stars = list.reduce((s, e) => s + Number(e.stars ?? 0), 0);
  const chance = best.data ? best.data.chance.base + best.data.chance.charges * best.data.chance.step : null;
  const codex = best.data?.codex.length ?? 0;
  const clockwork = byKind.get('clockwork')?.[0];
  const pop = (k: string) => best.data?.kinds.find((x) => x.kind === k)?.population ?? 0;

  return (
    <HubPage tone="magic" id="magic-hub">
      <HubHero kicker="Magic" icon={<WandSparkles className="h-3.5 w-3.5" />} art="🔮" title="Enchantments"
        sub={`Living creatures on your plots that change the rules. ${KIND_ORDER.length} kinds, Stars to ★5, Splice and the Leviathan.`}
        stats={[
          // (a dash until your Grimoire has loaded, never a 0 that isn't true)
          { label: 'Owned', value: mine.data ? fmt(list.length) : '–', testid: 'magic-owned' },
          { label: 'Kinds', value: mine.data ? `${owned}/${KIND_ORDER.length}` : '–', testid: 'magic-kinds' },
          { label: 'Ready', value: mine.data ? fmt(ready.length) : '–', hot: ready.length > 0, testid: 'magic-ready' },
          { label: 'Stars', value: mine.data ? `${fmt(stars)}★` : '–' },
        ]}
        actions={<>
          <HeroButton to="/grimoire" testid="magic-open-grimoire"><BookOpen className="h-4 w-4" /> Grimoire</HeroButton>
          <HeroButton to="/world" ghost testid="magic-chance">{chance != null ? `✨ ${chance}% Enchanted` : 'Roll a plot'}</HeroButton>
        </>} />

      <HubJump tone="violet" items={[
        { to: '/grimoire', label: 'Grimoire', icon: BookOpen },
        { to: '/grimoire?tab=badges', label: 'Badges', icon: Award },
        { to: '/grimoire?tab=codex', label: 'Codex', icon: Dna },
        { to: '/grimoire?tab=bestiary', label: 'Bestiary', icon: Library },
        { to: '/grimoire?tab=visitors', label: 'On my land', icon: DoorOpen },
      ]} />

      {/* ready now: everything with something waiting, one tap away */}
      {ready.length > 0 && (
        <>
          <HubH2 note="Tap to collect">✦ Ready now · {ready.length}</HubH2>
          <div className="lvh-rail" data-testid="magic-ready-rail">
            {ready.map((e) => {
              const k = kindInfo(e.kind);
              return (
                <Link key={e.id} to={`/grimoire/${e.id}`} className="lvh-ready" style={{ ['--a' as string]: k.a, ['--b' as string]: k.b }} onClick={() => buzz('light')} data-testid="magic-ready-chip">
                  <span className="g" aria-hidden>{k.emoji}</span>
                  <span className="min-w-0"><b>{enchantName(e)}</b><i>{e.attention}</i></span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <HubH2 note={`${HYBRID_COUNT} hybrids to discover`}>The latest magic</HubH2>
      <div className="lvh-grid" data-testid="magic-cards">
        <HubCard tone="gold" emoji="⭐" title="Stars to ★5" isNew sub="Pour in copies: a new power at every star and +10% Ink each" value={stars ? `${stars}★` : undefined} to="/handbook/enchant#stars" testid="magic-stars" />
        <HubCard tone="teal" emoji="🧪" title="Splice" sub="Fuse two enchantments into a living hybrid" value={`${codex}/${HYBRID_COUNT}`} to="/grimoire?tab=codex" testid="magic-splice" />
        <HubCard tone="ember" emoji="⏪" title="Clockwork Rewind" isNew sub="Undo something that went wrong in the last 12 hours" to={clockwork ? `/grimoire/${clockwork.id}` : '/handbook/enchant#kinds'} testid="magic-rewind" />
        <HubCard tone="violet" emoji="🏅" title="Badges" isNew sub="130+ enchantment badges to collect" to="/grimoire?tab=badges" testid="magic-badges" />
        <HubCard tone="crimson" emoji="🐉" title="The Leviathan" sub="The world boss — every kind has a move against it" to="/handbook/enchant#leviathan" testid="magic-leviathan" />
        <HubCard tone="emerald" emoji="🦠" title="On my land" sub="What other players' enchantments are doing on your plots" value={visitors.data?.length ? fmt(visitors.data.length) : undefined} hot={!!visitors.data?.length}
          to="/grimoire?tab=visitors" testid="magic-visitors" />
      </div>

      <HubH2 note={`${owned} of ${KIND_ORDER.length} collected`} i={5}>All {KIND_ORDER.length} kinds</HubH2>
      <motion.div {...rise(6)} className="lvh-kinds" data-testid="magic-kinds-grid">
        {KIND_ORDER.map((kind) => {
          const k = kindInfo(kind), n = byKind.get(kind)?.length ?? 0;
          return (
            <button key={kind} type="button" className={n ? 'lvh-kind' : 'lvh-kind locked'} onClick={() => { buzz('light'); setOpen(kind); }} data-testid={`magic-kind-${kind}`}
              style={{ ['--a' as string]: k.a, ['--b' as string]: k.b }} aria-label={`${k.name}${n ? ` — you have ${n}` : ''}`}>
              <span className="gem"><span>{k.emoji}</span>{n > 0 && <span className="n">{n}</span>}{NEWEST.includes(kind) && <span className="nw lvh-newtag">NEW</span>}</span>
              <span className="lb">{k.name}</span>
            </button>
          );
        })}
      </motion.div>
      <motion.p {...rise(7)} className="lvh-note mt-3">
        <Sparkles className="mr-1 inline h-3.5 w-3.5 text-[#E5CCFF]" />
        Every plot roll can come out <b>Enchanted</b> — an enchantment in place of a rarity{best.data ? <> ({best.data.chance.base}% to start)</> : null}. Raise the odds with Enchanted Luck at the Altar of Luck, or tune a Dowsing Rod to it.
      </motion.p>

      <HubLearn links={[
        { to: '/handbook/enchant#what', label: '🔮 What an enchantment is' }, { to: '/handbook/enchant#kinds', label: `📚 The ${KIND_ORDER.length} kinds` },
        { to: '/handbook/enchant#stars', label: '⭐ Stars' }, { to: '/handbook/enchant#splice', label: '🧪 Splice' }, { to: '/handbook/enchant#traits', label: '🧬 Every Trait' },
        { to: '/handbook/enchant#leviathan', label: '🐉 The Leviathan' }, { to: '/handbook/enchant#tips', label: '🧠 Strategy' },
      ]} />

      {open && <KindSheet kind={open} copies={byKind.get(open) ?? []} population={pop(open)} onClose={() => setOpen(null)} />}
    </HubPage>
  );
}

function KindSheet({ kind, copies, population, onClose }: { kind: EnchantKind; copies: { id: string; level: number; stars?: number; nickname?: string | null; kind: string; serial: number }[]; population: number; onClose(): void }) {
  const k = kindInfo(kind);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={<span>{k.name}{NEWEST.includes(kind) && <NewTag />}</span>} description={k.tagline}>
      <div style={{ ['--a' as string]: k.a, ['--b' as string]: k.b }} data-testid="magic-kind-sheet">
        <div className="lvh-sheet-art" aria-hidden>{k.emoji}</div>
        <div className="flex flex-wrap justify-center gap-1.5 text-[11.5px] font-bold">
          <span className="rounded-full bg-white/10 px-2.5 py-1">{copies.length ? `You have ${copies.length}` : 'Not in your Grimoire yet'}</span>
          {population > 0 && <span className="rounded-full bg-white/10 px-2.5 py-1">{fmt(population)} in the world</span>}
          {k.geneName && <span className="rounded-full bg-white/10 px-2.5 py-1">Trait: {k.geneName}</span>}
        </div>
        <ul className="lvh-how">{k.how.map((h) => <li key={h}>{h}</li>)}</ul>
        <p className="mt-3 text-[12px] text-white/55">Pays Ink from {PAYS_FROM[kind]}.</p>
        {copies.length > 0 && (
          <div className="mt-4 grid gap-1.5">
            {copies.slice(0, 6).map((e) => (
              <Link key={e.id} to={`/grimoire/${e.id}`} className="lvh-row" onClick={onClose} data-testid="magic-kind-copy">
                <span className="lvh-emo !h-10 !w-10 !rounded-xl !text-[20px]" style={{ background: `linear-gradient(160deg, ${k.a}, ${k.b})` }} aria-hidden>{k.emoji}</span>
                <span className="min-w-0 flex-1"><span className="t">{enchantName(e)}</span><span className="s">Level {e.level}{e.stars ? ` · ${'★'.repeat(e.stars)}` : ''}</span></span>
                <span className="lvh-go">Open</span>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Link to="/handbook/enchant#kinds" className="lvh-cta ghost !h-10 !text-[13px]" onClick={onClose}>Read in the Handbook</Link>
          {!copies.length && <Link to="/world" className="lvh-cta !h-10 !text-[13px]" onClick={onClose}>Roll for one</Link>}
        </div>
      </div>
    </Dialog>
  );
}
