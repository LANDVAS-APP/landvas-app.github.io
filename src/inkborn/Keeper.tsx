// /inkborn/keeper — the Keeper's Lodge: your keeper level and Glimmer, today's wishes, expeditions, the treat
// bakery, sanctuary upgrades and your treasure collection. KeeperNews turns what your creatures earned while
// you were busy (jobs, games, springs, wishes coming true) into little toasts.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Keeper, KeeperCreature, KeeperEvent, KeeperExpeditionResult, KeeperRegion } from '../backend/types';
import { Page } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, Dialog, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { CreatureView } from './CreatureView';
import { cleanGenome } from './genome';
import { GAMES, type GameId } from './games/engines';

export const keeperKey = ['keeper'] as const;
export const useKeeper = (on = true) => useQuery({ queryKey: keeperKey, queryFn: api.keeperGet, enabled: on, staleTime: 15_000 });
type Tab = 'wishes' | 'expeditions' | 'bakery' | 'upgrades' | 'collection';

const PERSONALITY: Record<string, string> = { playful: '🎈 Playful', sleepy: '😴 Sleepy', curious: '🔍 Curious', shy: '🙈 Shy', foodie: '🍰 Foodie', brave: '🦁 Brave' };
const CARE_WISH: Record<string, [string, string]> = {
  pet: ['a pat on the head', '🤚'], feed: ['a snack', '🍎'], play: ['some playtime', '🎾'], brush: ['a good brushing', '🪮'], fetch: ['a game of fetch', '🥏'],
  trick: ['to show off a trick', '🎪'], bathe: ['a bubbly bath', '🛁'], hideseek: ['hide and seek', '🙈'],
};
const JOB_WISH: Record<string, [string, string]> = { forage: ['to go foraging', '🫐'], explore: ['to explore the woods', '🧭'], quest: ['to go on a quest', '🗺️'] };
const left = (iso: string, now: number) => { const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
export const powerOf = (c: KeeperCreature, reg: KeeperRegion) => (3 + c.level * 2 + c.bond / 20) * (c.personality === reg.favours ? 1.5 : 1) * (0.5 + (0.5 * c.happiness) / 100);
export const chanceOf = (power: number, reg: KeeperRegion) => Math.min(0.97, Math.max(0.15, (0.75 * power) / Math.max(1, reg.power)));

function Mats({ k, items, className }: { k: Keeper; items: Record<string, number>; className?: string }) {
  return <span className={cn('inline-flex flex-wrap gap-1', className)}>{Object.entries(items).map(([m, n]) => <span key={m} className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-bold">{k.config.materials[m]?.emoji ?? m} {n}</span>)}</span>;
}

/** Toasts for what your creatures earned while you were elsewhere (jobs, games, springs, wishes, level-ups). */
export function KeeperNews() {
  const me = useOnboardedMe();
  const q = useKeeper(!!me);
  const shown = useRef(new Set<number>());
  useEffect(() => {
    const ev = q.data?.events ?? [];
    const fresh = ev.filter((e) => !shown.current.has(e.id));
    if (!fresh.length) return;
    fresh.forEach((e) => shown.current.add(e.id));
    const recent = fresh.filter((e) => Date.now() - new Date(e.at).getTime() < 15 * 60_000);
    for (const e of recent.slice(-2)) newsToast(q.data!, e);
    void api.keeperEventsSeen(Math.max(...fresh.map((e) => e.id))).catch(() => undefined);
  }, [q.data]);
  return null;
}
function newsToast(k: Keeper, e: KeeperEvent) {
  const d = e.data;
  const gains = [d.glimmer ? `+${d.glimmer} ✨` : '', ...Object.entries((d.materials ?? {}) as Record<string, number>).map(([m, n]) => `+${n} ${k.config.materials[m]?.emoji ?? m}`), d.xp ? `+${Math.round(d.xp)} XP` : ''].filter(Boolean).join('  ');
  if (d.level_up) { confettiCannons(); toast.success(`🌟 Keeper level ${d.level}!`, { description: d.level_glimmer ? `+${d.level_glimmer} Glimmer — new things may have unlocked in the Lodge.` : undefined }); }
  switch (e.kind) {
    case 'job': toast(`${JOB_WISH[d.job]?.[1] ?? '🎒'} ${d.name} brought things home`, { description: gains }); break;
    case 'game': toast(`${GAMES[d.game as GameId]?.emoji ?? '🎮'} ${GAMES[d.game as GameId]?.name ?? 'Game'} haul`, { description: gains }); break;
    case 'spring': toast('🫧 The spring sparkled', { description: gains }); break;
    case 'new_creature': toast(`🐣 Welcome, ${d.name}!`, { description: gains }); break;
    case 'wish_done': toast(`💭 ${d.name}’s wish came true!`, { description: 'Grant it in the Keeper’s Lodge for Glimmer.' }); break;
    case 'creature_level': toast.success(`⬆️ ${d.name} reached level ${d.level}!`, { description: 'Stronger on expeditions.' }); break;
    default: break;
  }
}

/** A small banner for the Inkborn hub. */
export function KeeperBanner() {
  const q = useKeeper();
  const k = q.data;
  if (!k) return null;
  const frac = Math.min(1, (k.xp - k.level_xp) / Math.max(1, k.next_xp - k.level_xp));
  const wishes = k.wishes.filter((w) => w.done && !w.claimed).length;
  const back = k.expeditions.filter((x) => x.done && !x.claimed).length;
  return (
    <Link to="/inkborn/keeper" className="glass mb-6 flex items-center gap-4 rounded-3xl p-4 transition hover:-translate-y-0.5" data-testid="keeper-banner"
      style={{ background: 'radial-gradient(120% 140% at 0% 0%, rgba(201,184,255,0.25), transparent 60%)' }}>
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#8B6CFF] font-display text-2xl font-black text-white shadow-lg">{k.level}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><b className="font-display text-lg">Keeper’s Lodge</b><span className="rounded-full bg-[#FFE14D]/20 px-2 py-0.5 text-xs font-bold text-[#FFD84D]">✨ {k.glimmer.toLocaleString()} Glimmer</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-[#8B6CFF]" style={{ width: `${frac * 100}%` }} /></div>
        <div className="mt-1 text-xs text-muted">{wishes ? `💭 ${wishes} wish${wishes === 1 ? '' : 'es'} to grant · ` : ''}{back ? `🧭 ${back} expedition${back === 1 ? '' : 's'} home · ` : ''}Wishes, expeditions, the treat bakery and upgrades →</div>
      </div>
    </Link>
  );
}

export default function KeeperScreen() {
  const me = useOnboardedMe();
  const q = useKeeper(!!me);
  const nav = useNavigate();
  if (!me || q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (!q.data) return <Page><div className="py-20 text-center text-muted">The Lodge couldn’t load. <button className="underline" onClick={() => q.refetch()}>Try again</button></div></Page>;
  return <Lodge k={q.data} onBack={() => nav(-1)} />;
}

function Lodge({ k, onBack }: { k: Keeper; onBack(): void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('wishes');
  const [busy, setBusy] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [result, setResult] = useState<{ r: KeeperExpeditionResult; region: string } | null>(null);
  const [feed, setFeed] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const set = (r: Keeper) => qc.setQueryData(keeperKey, r);
  const run = async (key: string, fn: () => Promise<Keeper>, ok?: (r: Keeper) => void) => {
    setBusy(key);
    try { const r = await fn(); set(r); ok?.(r); invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['sanctuaries'] }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const cfg = k.config;
  const frac = Math.min(1, (k.xp - k.level_xp) / Math.max(1, k.next_xp - k.level_xp));
  const byId = useMemo(() => Object.fromEntries(k.creatures.map((c) => [c.id, c])), [k.creatures]);
  const wishesReady = k.wishes.filter((w) => w.done && !w.claimed).length;
  const expBack = k.expeditions.filter((x) => x.done && !x.claimed).length;
  const treatsOwned = Object.entries(k.treats).filter(([, n]) => n > 0);

  return (
    <Page wide>
      <KeeperNews />
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="rounded-2xl bg-surface-2 p-2.5" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="font-display text-2xl font-bold">Keeper’s Lodge</h1>
      </div>
      <section className="glass mb-4 grid gap-3 rounded-3xl p-4" data-testid="keeper-header" style={{ background: 'radial-gradient(120% 140% at 100% 0%, rgba(139,108,255,0.25), transparent 60%)' }}>
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#8B6CFF] text-white shadow-lg"><div className="text-[10px] font-bold uppercase leading-none">Level</div><div className="font-display text-3xl font-black leading-none" data-testid="keeper-level">{k.level}</div></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs text-muted"><span>{k.xp - k.level_xp} / {k.next_xp - k.level_xp} XP</span><span>to level {k.level + 1}</span></div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-[#8B6CFF]" style={{ width: `${frac * 100}%` }} /></div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#FFE14D]/20 px-2.5 py-1 text-sm font-black text-[#FFD84D]" data-testid="keeper-glimmer">✨ {k.glimmer.toLocaleString()}</span>
              {Object.entries(cfg.materials).map(([m, x]) => <span key={m} title={x.name} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold">{x.emoji} {k.materials[m] ?? 0}</span>)}
            </div>
          </div>
        </div>
      </section>

      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
        {([['wishes', '💭 Wishes', wishesReady], ['expeditions', '🧭 Expeditions', expBack], ['bakery', '🥧 Bakery', 0], ['upgrades', '⬆️ Upgrades', 0], ['collection', '🏺 Treasures', 0]] as const).map(([t, label, n]) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`keeper-tab-${t}`} className={cn('shrink-0 rounded-full px-3.5 py-2 text-sm font-bold', tab === t ? 'bg-accent text-white' : 'bg-surface-2')}>
            {label}{n ? <span className="ml-1 rounded-full bg-[#FF4D6D] px-1.5 text-[10px] text-white">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'wishes' && (
        <section className="grid gap-2" data-testid="keeper-wishes">
          <p className="text-sm text-muted">Each creature wishes for something today. Make it happen, then grant the wish for Glimmer and bond. Grant them all for a bonus of {cfg.wishes.all_done_glimmer} ✨ and {cfg.wishes.all_done_ink} Ink.</p>
          {!k.wishes.length && <p className="py-6 text-center text-muted">No wishes yet — create a creature first.</p>}
          {k.wishes.map((w) => {
            const c = byId[w.inkborn];
            const [txt, emo] = w.kind === 'care' ? CARE_WISH[w.target ?? ''] ?? ['some attention', '💕'] : w.kind === 'job' ? JOB_WISH[w.target ?? ''] ?? ['an adventure', '🎒']
              : w.kind === 'treat' ? [`a ${cfg.treats[w.target ?? '']?.name.toLowerCase() ?? 'treat'}`, cfg.treats[w.target ?? '']?.emoji ?? '🍬'] : ['to play a game with you', '🎮'];
            const haveTreat = w.kind === 'treat' && (k.treats[w.target ?? ''] ?? 0) > 0;
            return (
              <div key={w.id} className={cn('glass flex items-center gap-3 rounded-2xl p-2.5', w.claimed && 'opacity-60')} data-testid={`wish-${w.id}`}>
                {c ? <CreatureView genome={cleanGenome(c.genome)} size={56} state={w.done ? 'happy' : 'idle'} /> : <div className="h-14 w-14" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><b>{w.name}</b> wishes for {txt} <span className="text-lg">{emo}</span></div>
                  <div className="text-xs text-muted">{w.claimed ? 'Granted ✓' : w.done ? 'It came true!' : w.kind === 'treat' ? (haveTreat ? 'You have one — give it now' : 'Bake one in the bakery') : w.kind === 'game' ? 'Play any game as them' : w.kind === 'job' ? 'Send them on that job' : 'Do it in their sanctuary'}</div>
                </div>
                {w.claimed ? <Check className="h-5 w-5 text-ok" />
                  : w.done ? <Button size="sm" variant="rainbow" loading={busy === `w${w.id}`} data-testid={`wish-grant-${w.id}`}
                      onClick={() => run(`w${w.id}`, () => api.keeperWishClaim(w.id), (r) => { if (r.all_done) { confettiCannons(); toast.success('🌈 Every wish granted today!', { description: `+${cfg.wishes.all_done_glimmer} ✨${r.ink ? ` · +${r.ink} Ink` : ''}` }); } else toast.success(`💭 Wish granted · +10 ✨`); })}>Grant ✨</Button>
                  : haveTreat ? <Button size="sm" variant="secondary" loading={busy === `t${w.id}`} onClick={() => run(`t${w.id}`, () => api.keeperFeedTreat(w.inkborn, w.target!), () => toast.success(`${w.name} loved it!`))}>Give {cfg.treats[w.target!]?.emoji}</Button>
                  : w.kind === 'game' && c && !c.job ? <Button size="sm" variant="secondary" onClick={() => nav(`/inkborn/play/${(Object.keys(GAMES) as GameId[])[w.id % Object.keys(GAMES).length]}/${c.id}`)}>Play</Button>
                  : null}
              </div>
            );
          })}
          <p className="pt-1 text-center text-xs text-muted">New wishes in {left(k.resets_at, now)}</p>
        </section>
      )}

      {tab === 'expeditions' && (
        <section className="grid gap-3" data-testid="keeper-expeditions">
          {k.expeditions.filter((x) => !x.claimed).map((x) => {
            const reg = cfg.regions[x.region];
            return (
              <div key={x.id} className="glass flex items-center gap-3 rounded-2xl p-3" data-testid={`expedition-${x.id}`}>
                <span className="text-3xl">{reg?.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{reg?.name}</div>
                  <div className="flex -space-x-2">{x.team.map((id) => byId[id] && <CreatureView key={id} genome={cleanGenome(byId[id].genome)} size={36} state="walk" />)}</div>
                  <div className="text-xs text-muted">{x.done ? 'They’re home!' : `Back in ${left(x.ends_at, now)}`} · {Math.round(x.chance * 100)}% chance of success</div>
                </div>
                {x.done && <Button variant="rainbow" size="sm" loading={busy === x.id} data-testid={`expedition-claim-${x.id}`}
                  onClick={() => run(x.id, () => api.keeperExpeditionClaim(x.id), (r) => { if (r.result) { setResult({ r: r.result, region: x.region }); if (r.result.success) confettiCannons(); } })}>Welcome home</Button>}
              </div>
            );
          })}
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(cfg.regions).sort((a, b) => a[1].order - b[1].order).map(([key, reg]) => {
              const locked = k.level < reg.level;
              const found = k.treasures.filter((t) => t.startsWith(`${key}:`)).length;
              return (
                <button key={key} disabled={locked} onClick={() => setRegion(key)} data-testid={`region-${key}`}
                  className={cn('glass grid gap-1 rounded-2xl p-3 text-left transition hover:-translate-y-0.5', locked && 'opacity-55')}>
                  <div className="flex items-center gap-2"><span className="text-3xl">{reg.emoji}</span><div className="min-w-0 flex-1"><b>{reg.name}</b><div className="text-xs text-muted">{reg.minutes >= 60 ? `${reg.minutes / 60}h` : `${reg.minutes}m`} · power {reg.power} · {PERSONALITY[reg.favours]} creatures do best</div></div>
                    {locked ? <span className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold"><Lock className="h-3 w-3" /> Lv {reg.level}</span> : <span className="text-xs font-bold text-accent">Send →</span>}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">{Object.keys(reg.loot).map((m) => <span key={m} className="rounded-full bg-black/20 px-1.5">{cfg.materials[m]?.emoji}</span>)}<span className="rounded-full bg-black/20 px-1.5">+{reg.glimmer} ✨</span><span className="ml-auto text-muted">🏺 {found}/{reg.treasures.length}</span></div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'bakery' && (
        <section className="grid gap-2" data-testid="keeper-bakery">
          <p className="text-sm text-muted">Jobs, games and expeditions bring home materials. Bake them into treats that make your creatures happy, rested and wiser — and that they sometimes wish for.</p>
          {treatsOwned.length > 0 && (
            <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3"><b className="text-sm">Your treats:</b>
              {treatsOwned.map(([t, n]) => <button key={t} onClick={() => setFeed(t)} data-testid={`feed-${t}`} className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold hover:bg-surface-3">{cfg.treats[t]?.emoji} {n} · Give</button>)}
            </div>
          )}
          {Object.entries(cfg.treats).sort((a, b) => a[1].level - b[1].level).map(([t, x]) => {
            const locked = k.level < x.level;
            const can = Math.min(20, ...Object.entries(x.needs).map(([m, n]) => Math.floor((k.materials[m] ?? 0) / n)));
            const fx = [x.happiness ? `+${x.happiness} 💗` : '', x.energy ? `+${x.energy} ⚡` : '', x.xp ? `+${x.xp} creature XP` : '', x.bond ? `+${x.bond} bond` : ''].filter(Boolean).join(' · ');
            return (
              <div key={t} className={cn('glass flex items-center gap-3 rounded-2xl p-3', locked && 'opacity-55')} data-testid={`treat-${t}`}>
                <span className="text-3xl">{x.emoji}</span>
                <div className="min-w-0 flex-1"><b className="text-sm">{x.name}</b> {(k.treats[t] ?? 0) > 0 && <span className="text-xs text-muted">(have {k.treats[t]})</span>}<div className="text-xs text-muted">{fx}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{Object.entries(x.needs).map(([m, n]) => <span key={m} className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', (k.materials[m] ?? 0) >= n ? 'bg-ok/20 text-ok' : 'bg-surface-3 text-muted')}>{cfg.materials[m]?.emoji} {k.materials[m] ?? 0}/{n}</span>)}</div></div>
                {locked ? <span className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold"><Lock className="h-3 w-3" /> Lv {x.level}</span>
                  : <div className="flex flex-col gap-1"><Button size="sm" variant="rainbow" disabled={can < 1} loading={busy === `b${t}`} data-testid={`bake-${t}`} onClick={() => run(`b${t}`, () => api.keeperBake(t, 1), () => toast.success(`${x.emoji} ${x.name} baked!`))}>Bake</Button>
                    {can > 1 && <Button size="sm" variant="secondary" loading={busy === `ba${t}`} onClick={() => run(`ba${t}`, () => api.keeperBake(t, can), () => toast.success(`${x.emoji} Baked ${can}!`))}>×{can}</Button>}</div>}
              </div>
            );
          })}
        </section>
      )}

      {tab === 'upgrades' && (
        <section className="grid gap-2" data-testid="keeper-upgrades">
          {Object.entries(cfg.upgrades).sort((a, b) => a[1].level - b[1].level).map(([key, u]) => {
            const lvl = k.upgrades[key] ?? 0; const cost = k.upgrade_costs[key]; const locked = k.level < u.level; const maxed = lvl >= u.max;
            return (
              <div key={key} className={cn('glass flex items-center gap-3 rounded-2xl p-3', locked && 'opacity-55')}>
                <span className="text-3xl">{u.emoji}</span>
                <div className="min-w-0 flex-1"><b className="text-sm">{u.name}</b> <span className="text-xs text-muted">{lvl}/{u.max}</span><div className="text-xs text-muted">{u.desc}</div>
                  <div className="mt-1 flex gap-0.5">{Array.from({ length: u.max }, (_, i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < lvl ? 'bg-[#8B6CFF]' : 'bg-surface-3')} />)}</div></div>
                {locked ? <span className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold"><Lock className="h-3 w-3" /> Lv {u.level}</span>
                  : maxed ? <span className="rounded-full bg-ok/20 px-2 py-1 text-[11px] font-bold text-ok">Max</span>
                  : <Button size="sm" variant={k.glimmer >= cost ? 'rainbow' : 'secondary'} disabled={k.glimmer < cost} loading={busy === `u${key}`} data-testid={`kupgrade-${key}`}
                      onClick={() => run(`u${key}`, () => api.keeperUpgrade(key), () => toast.success(`${u.emoji} ${u.name} → level ${lvl + 1}`))}>✨ {cost}</Button>}
              </div>
            );
          })}
        </section>
      )}

      {tab === 'collection' && (
        <section className="grid gap-3 sm:grid-cols-2" data-testid="keeper-collection">
          {Object.entries(cfg.regions).sort((a, b) => a[1].order - b[1].order).map(([key, reg]) => {
            const have = reg.treasures.map((_, i) => k.treasures.includes(`${key}:${i}`));
            const full = have.every(Boolean);
            return (
              <div key={key} className={cn('glass grid gap-2 rounded-2xl p-3', full && 'ring-2 ring-[#FFD84D]')}>
                <div className="flex items-center gap-2"><span className="text-2xl">{reg.emoji}</span><b className="flex-1">{reg.name}</b>{full ? <span className="rounded-full bg-[#FFE14D]/20 px-2 py-0.5 text-xs font-bold text-[#FFD84D]">Set complete ✨</span> : <span className="text-xs text-muted">{have.filter(Boolean).length}/{reg.treasures.length}</span>}</div>
                <div className="grid grid-cols-3 gap-2">{reg.treasures.map((t, i) => (
                  <div key={t} className={cn('grid min-h-[72px] content-center justify-items-center rounded-xl p-2 text-center text-[11px]', have[i] ? 'bg-[#8B6CFF]/20' : 'bg-surface-2 text-faint')}>
                    <span className="text-xl">{have[i] ? '🏺' : '❔'}</span>{have[i] ? t : '???'}
                  </div>))}</div>
              </div>
            );
          })}
          <p className="text-xs text-muted sm:col-span-2">Successful expeditions sometimes find a treasure. Complete a region’s set for a bonus of {cfg.expedition.set_bonus_glimmer} ✨. Treasure maps (an upgrade) make finds more likely.</p>
        </section>
      )}

      <TeamPicker k={k} region={region} onClose={() => setRegion(null)} busy={busy === 'start'}
        onStart={(team) => void run('start', () => api.keeperExpeditionStart(region!, team), () => { setRegion(null); toast.success('🧭 The team set off!'); })} />
      <Dialog open={!!result} onOpenChange={() => setResult(null)} title={result?.r.success ? '🎉 A great expedition!' : '😅 A tricky expedition'} description={result ? cfg.regions[result.region]?.name : ''}>
        {result && (
          <div className="grid justify-items-center gap-3 py-2 text-center" data-testid="expedition-result">
            <div className="text-5xl">{result.r.success ? cfg.regions[result.region]?.emoji : '🌧️'}</div>
            <p className="text-sm text-muted">{result.r.success ? 'Everyone came home happy, arms full.' : 'They had to turn back early, but brought a little home.'}</p>
            <Mats k={k} items={result.r.loot ?? {}} />
            <div className="flex flex-wrap justify-center gap-2 text-sm font-bold"><span>+{result.r.glimmer} ✨</span><span>+{Math.round(result.r.xp)} XP</span>{result.r.ink > 0 && <span className="flex items-center gap-1">+{result.r.ink} <ResourceIcon r="ink" className="h-4 w-4" /></span>}</div>
            {result.r.treasure && <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="rounded-2xl bg-[#8B6CFF]/20 px-4 py-2 font-bold">🏺 Treasure found: {result.r.treasure}{result.r.set_complete ? ' — set complete! ✨' : ''}</motion.div>}
            <Button variant="rainbow" onClick={() => setResult(null)}>Lovely</Button>
          </div>
        )}
      </Dialog>
      <Dialog open={!!feed} onOpenChange={() => setFeed(null)} title={feed ? `Give a ${cfg.treats[feed]?.name.toLowerCase()} ${cfg.treats[feed]?.emoji}` : ''} description="Who gets it?">
        <div className="grid grid-cols-3 gap-2" data-testid="feed-picker">
          {k.creatures.map((c) => (
            <button key={c.id} disabled={!!c.job || !!busy} onClick={() => feed && run(`f${c.id}`, () => api.keeperFeedTreat(c.id, feed), (r) => { setFeed(null); toast.success(`${c.name} loved it! ${cfg.treats[feed]?.emoji}`, { description: r.creature_level_up ? `⬆️ ${c.name} levelled up!` : undefined }); })}
              className="grid justify-items-center gap-0.5 rounded-2xl bg-surface-2 p-2 text-xs hover:bg-surface-3 disabled:opacity-50">
              <CreatureView genome={cleanGenome(c.genome)} size={64} state="idle" /><b className="w-full truncate">{c.name}</b><span className="text-muted">Lv {c.level}{c.job ? ' · away' : ''}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </Page>
  );
}

function TeamPicker({ k, region, onClose, onStart, busy }: { k: Keeper; region: string | null; onClose(): void; onStart(team: string[]): void; busy: boolean }) {
  const [team, setTeam] = useState<string[]>([]);
  useEffect(() => { setTeam([]); }, [region]);
  const reg = region ? k.config.regions[region] : null;
  if (!reg) return <Dialog open={false} onOpenChange={onClose} title=""><div /></Dialog>;
  const need = k.config.expedition.energy;
  const power = team.reduce((s, id) => { const c = k.creatures.find((x) => x.id === id); return s + (c ? powerOf(c, reg) : 0); }, 0);
  const chance = chanceOf(power, reg);
  return (
    <Dialog open={!!region} onOpenChange={(o) => !o && onClose()} title={`${reg.emoji} ${reg.name}`} description={`Pick up to ${k.config.expedition.team_max}. ${PERSONALITY[reg.favours]} creatures are 50% stronger here; happier, higher-level, closer creatures do better.`}>
      <div className="grid gap-3" data-testid="team-picker">
        <div className="grid grid-cols-3 gap-2">
          {k.creatures.map((c) => {
            const on = team.includes(c.id); const away = !!c.job; const tired = c.energy < need;
            return (
              <button key={c.id} disabled={away || tired} onClick={() => setTeam((t) => (on ? t.filter((x) => x !== c.id) : t.length < k.config.expedition.team_max ? [...t, c.id] : t))} data-testid={`team-${c.id}`}
                className={cn('relative grid justify-items-center gap-0.5 rounded-2xl p-2 text-xs transition', on ? 'bg-accent/25 ring-2 ring-accent' : 'bg-surface-2 hover:bg-surface-3', (away || tired) && 'opacity-45')}>
                <CreatureView genome={cleanGenome(c.genome)} size={60} state={on ? 'happy' : 'idle'} />
                <b className="w-full truncate">{c.name}</b>
                <span className="text-muted">Lv {c.level} · {c.personality === reg.favours ? <b className="text-ok">{PERSONALITY[c.personality]}</b> : PERSONALITY[c.personality] ?? c.personality}</span>
                <span className="text-[10px] text-muted">{away ? 'away' : tired ? 'too tired' : `⚡${Math.round(c.energy)} · power ${powerOf(c, reg).toFixed(1)}`}</span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-1 rounded-2xl bg-surface-2 p-3 text-sm">
          <div className="flex justify-between"><span>Team power</span><b>{power.toFixed(1)} / {reg.power}</b></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${chance * 100}%`, background: chance > 0.7 ? '#3DDC97' : chance > 0.4 ? '#FFC93D' : '#FF4D6D' }} /></div>
          <div className="flex justify-between text-xs text-muted"><span>{team.length ? `${Math.round(chance * 100)}% chance of success` : 'Pick your team'}</span><span>{reg.minutes >= 60 ? `${reg.minutes / 60}h` : `${reg.minutes}m`} · ⚡{need} each</span></div>
        </div>
        <Button variant="rainbow" disabled={!team.length} loading={busy} onClick={() => onStart(team)} data-testid="expedition-go">Set off 🧭</Button>
      </div>
    </Dialog>
  );
}
