// The app's Ultras hub: the Ultra Expansion in one place — your ultras today, the nine land-changing ultras, the
// Fusion Lab, the Primordials, Godrolls, Ascend, Crown shares and the rarity rankings.
import { useQuery } from '@tanstack/react-query';
import { Atom, Crown, Gem, Sparkles, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../backend/api';
import { fmt } from '../../lib/utils';
import { buzz } from '../../native/native';
import { NEW_ULTRAS, rarityInfo, rarityOdds } from '../../shared/rarity';
import { Dialog } from '../../ui';
import { UltraTracker, useUltras } from '../../ultra/UltraTracker';
import { useOnboardedMe } from '../../lib/queries';
import { HeroButton, HubCard, HubH2, HubHero, HubJump, HubLearn, HubPage, NewTag, rise } from './HubKit';

type Info = { emoji: string; title: string; lines: string[]; color: string; to?: { to: string; label: string } };
const GODROLL: Info = { emoji: '⚡', title: 'Godrolls', color: '#FFC93D', lines: [
  'An insanely rare claim where every roll is an ultra.',
  'Echo gives the same ultra every time. Pantheon gives a different one every time.',
  'You keep one of them — pick the plot you want.',
], to: { to: '/world', label: 'Claim a plot' } };
const ASCEND: Info = { emoji: '⬆️', title: 'Ascend', color: '#3DDC97', lines: [
  'Spend Ink to push a freshly claimed plot’s rarity up.',
  'It only ever goes up — never down — and the price climbs fast with each try.',
  'Look for the Ascend button on a plot you just claimed.',
], to: { to: '/world', label: 'Claim a plot' } };

export default function UltrasHub() {
  const me = useOnboardedMe();
  const ultras = useUltras();
  const tier = useQuery({ queryKey: ['primordial-tier'], queryFn: api.primordialTier, staleTime: 60_000 });
  const book = useQuery({ queryKey: ['fusion-book'], queryFn: api.fusionBook, staleTime: 60_000, enabled: !!me });
  const crowns = useQuery({ queryKey: ['crown-shares'], queryFn: api.crownSharesMine, staleTime: 60_000, retry: false, enabled: !!me });
  const [info, setInfo] = useState<Info | null>(null);
  const [ultra, setUltra] = useState<string | null>(null);
  const plots = ultras.data?.plots ?? [];
  const ownedOf = (r: string) => plots.filter((p) => p.rarity === r).length;
  const prim = tier.data?.list ?? [];
  const primMine = prim.reduce((s, x) => s + Number(x.mine ?? 0), 0);
  const primWorld = prim.reduce((s, x) => s + Number(x.world ?? 0), 0);
  const recipes = book.data?.recipes.length ?? 0;
  const fusable = (book.data?.ultras ?? []).filter((u) => !u.why).length;
  const myCrowns = crowns.data?.length ?? 0;

  return (
    <HubPage tone="ultras" id="ultras-hub">
      <HubHero kicker="The Ultra Expansion" icon={<Gem className="h-3.5 w-3.5" />} art="🌋" title="Ultras"
        sub="The rarest land in LANDVAS: ultras that change the map, Fusions, Primordials, Godrolls and Ascend."
        stats={[
          { label: 'Ultras', value: ultras.data ? fmt(plots.length) : '–', testid: 'ultras-owned' },
          primMine ? { label: 'Primordials', value: `${fmt(primMine)} ✦`, hot: true, testid: 'ultras-primordials' } : { label: 'Primordials', value: fmt(primWorld), testid: 'ultras-primordials' },
          { label: 'Recipes', value: fmt(recipes) },
          { label: 'Crowns', value: fmt(myCrowns), hot: myCrowns > 0 },
        ]}
        actions={<>
          <HeroButton to="/fusion" testid="ultras-fusion"><Atom className="h-4 w-4" /> Fusion Lab</HeroButton>
          <HeroButton to="/world" ghost>Claim land</HeroButton>
        </>} />

      <HubJump tone="gold" items={[
        { to: '/fusion', label: 'Fusion Lab', icon: Atom },
        { to: '/primordials', label: 'Primordials', icon: Sparkles },
        { to: '/royalty', label: 'Royalty', icon: Crown },
        { to: '/rankings/rarities', label: 'Rarity ranks', icon: Trophy },
      ]} />

      {/* your ultras and where each one stands today */}
      <div className="mt-5">
        {plots.length ? <UltraTracker /> : (
          <motion.div {...rise(2)} className="lvh-note" data-testid="ultras-none">
            <b>No ultras yet.</b> Every claim rolls for one on its own odds — and a Godroll makes every roll an ultra. The daily Hot Zone and Luck raise your chances.
          </motion.div>
        )}
      </div>

      <HubH2 note="Tap one to see it" i={3}><span>Land-changing ultras<NewTag /></span></HubH2>
      <div className="lvh-rail" data-testid="ultras-new-rail">
        {NEW_ULTRAS.map((id) => {
          const r = rarityInfo(id), n = ownedOf(id);
          return (
            <button key={id} type="button" className="lvh-orb" style={{ ['--c' as string]: r.color }} onClick={() => { buzz('light'); setUltra(id); }} data-testid={`ultras-orb-${id}`}>
              <span className="o">{r.emoji}{n > 0 && <span className="n">{n}</span>}</span>
              <span className="lb">{r.name}</span>
            </button>
          );
        })}
      </div>

      <HubH2 i={4}>Rarer than rare</HubH2>
      <div className="lvh-grid" data-testid="ultras-cards">
        <HubCard tone="teal" emoji="🧬" title="Fusion Lab" sub="Fuse two ultras by recipe — two recipes are secret" value={fusable ? `${fusable} ready` : undefined} hot={fusable > 0} to="/fusion" testid="ultras-card-fusion" />
        <HubCard tone="violet" emoji="🌠" title="Primordials" isNew sub={`A tier above every ultra${tier.data?.tier_one_in ? ` · 1 in ${fmt(tier.data.tier_one_in)}` : ''}`} value={primWorld ? `${fmt(primWorld)} found` : undefined} to="/primordials" testid="ultras-card-primordials" />
        <HubCard tone="gold" emoji="⚡" title="Godrolls" isNew sub="Every roll an ultra — Echo or Pantheon" onClick={() => setInfo(GODROLL)} testid="ultras-card-godrolls" />
        <HubCard tone="emerald" emoji="⬆️" title="Ascend" isNew sub="Spend Ink to push a fresh plot’s rarity up" onClick={() => setInfo(ASCEND)} testid="ultras-card-ascend" />
        <HubCard tone="ember" emoji="👑" title="Crowns" sub="A 1% share of their kingdom: Ink or rent" value={myCrowns ? `${myCrowns} held` : undefined} hot={myCrowns > 0} to="/royalty" testid="ultras-card-crowns" />
        <HubCard tone="azure" emoji="🏆" title="Rarity ranks" sub="Who owns the rarest land in the world" to="/rankings/rarities" testid="ultras-card-ranks" />
        <HubCard tone="rose" emoji="🎬" title="Clip your best rolls" sub="Replay a roll exactly as it went, sized for TikTok, Discord and chats" to="/clips" wide testid="ultras-card-clips" />
      </div>

      {prim.length > 0 && (
        <>
          <HubH2 note={`${fmt(primWorld)} in the world`} i={6}>The Primordials</HubH2>
          <div className="lvh-rail" data-testid="ultras-prim-rail">
            {prim.map((p) => (
              <Link key={p.id} to="/primordials" className="lvh-orb" style={{ ['--c' as string]: p.color }} onClick={() => buzz('light')}>
                <span className="o">{p.emoji}{Number(p.mine) > 0 && <span className="n">{p.mine}</span>}</span>
                <span className="lb">{p.name}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <HubLearn links={[
        { to: '/handbook/roll#ultras', label: '🌌 Ultra rarities' }, { to: '/handbook/ultra#classic', label: '☀️ Getting the most from each' },
        { to: '/handbook/ultra#new', label: '🌋 Land-changing ultras' }, { to: '/handbook/ultra#fusion', label: '🧬 The Fusion Lab' },
        { to: '/handbook/ultra#primordials', label: '🌠 The Primordials' }, { to: '/handbook/roll#crowns', label: '👑 Crowns' }, { to: '/handbook/roll#shiny', label: '✨ Shiny plots' },
      ]} />

      {info && (
        <Dialog open onOpenChange={(o) => !o && setInfo(null)} title={<span>{info.title}<NewTag /></span>}>
          <div style={{ ['--a' as string]: info.color, ['--b' as string]: '#1b2156' }} data-testid="ultras-info-sheet">
            <div className="lvh-sheet-art" aria-hidden>{info.emoji}</div>
            <ul className="lvh-how">{info.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            {info.to && <div className="mt-4 flex justify-end"><Link to={info.to.to} className="lvh-cta !h-10 !text-[13px]" onClick={() => setInfo(null)}>{info.to.label}</Link></div>}
          </div>
        </Dialog>
      )}
      {ultra && <UltraSheet id={ultra} owned={ownedOf(ultra)} onClose={() => setUltra(null)} />}
    </HubPage>
  );
}

function UltraSheet({ id, owned, onClose }: { id: string; owned: number; onClose(): void }) {
  const r = rarityInfo(id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={r.name} description={r.ability ?? undefined}>
      <div style={{ ['--a' as string]: r.color, ['--b' as string]: r.glow }} data-testid="ultras-sheet">
        <div className="lvh-sheet-art" aria-hidden>{r.emoji}</div>
        <div className="flex flex-wrap justify-center gap-1.5 text-[11.5px] font-bold">
          <span className="rounded-full bg-white/10 px-2.5 py-1">{rarityOdds(id)} claims</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{owned ? `You own ${owned}` : 'Not in your land yet'}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">×{+Number(r.ink_reward_multiplier).toFixed(2)} minigame Ink</span>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Link to="/handbook/ultra#new" className="lvh-cta ghost !h-10 !text-[13px]" onClick={onClose}>Read in the Handbook</Link>
          <Link to="/world" className="lvh-cta !h-10 !text-[13px]" onClick={onClose}>Claim land</Link>
        </div>
      </div>
    </Dialog>
  );
}
