// /inkborn — your creatures and your sanctuaries. Everyone has a free starter sanctuary;
// plots turned into Inkborn Habitats add bigger ones that others can find on the map.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Heart, MapPinned, Plus, TreePine, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import type { Inkborn } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { Button, Empty, Spinner } from '../ui';
import { bondLevel } from './care';
import { CreatureView } from './CreatureView';
import { EggsPanel } from './Eggs';
import { MOOD_INFO, cleanGenome } from './genome';
import { CreatureProfile } from './Profile';
import { jobLabel, useInkEconomy } from './Earn';
import { GAMES, type GameId } from './games/engines';
import { cn } from '../lib/utils';
import { ResourceIcon } from '../ui';
import { useNavigate } from 'react-router-dom';

export default function Hub() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me });
  const [open, setOpen] = useState<Inkborn | null>(null);
  if (!me || q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (q.error || !q.data) return <Page><Empty title="Inkborn couldn’t load">Try again in a moment.</Empty></Page>;
  const d = q.data;
  const cur = open ? d.creatures.find((c) => c.id === open.id) ?? open : null;
  return (
    <Page wide>
      <PageHeader eyebrow="Inkborn" title="Your creatures" actions={
        <div className="flex gap-2">
          <Link to={`/habitat/${d.starter_id}`}><Button variant="secondary"><TreePine className="h-4 w-4" /> Enter sanctuary</Button></Link>
          <Link to="/inkborn/create"><Button variant="rainbow" data-testid="new-inkborn"><Plus className="h-4 w-4" /> Create</Button></Link>
        </div>
      }>
        Draw a creature and watch it come alive, then raise it in a woodland sanctuary. Pet, feed and play with your Inkborn to grow your bond — and visit other players’ sanctuaries for playdates that lay eggs.
      </PageHeader>

      {d.creatures.length === 0 ? (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass relative mb-6 grid justify-items-center gap-3 overflow-hidden rounded-[28px] p-8 text-center" data-testid="inkborn-empty">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#2f7d3a]/40 to-transparent" />
          <div className="text-5xl">🐾</div>
          <h2 className="font-display text-2xl font-bold">Your sanctuary is waiting</h2>
          <p className="max-w-md text-sm text-muted">Draw any creature you can imagine — a round body, big ears, a curly tail — and it becomes a living Inkborn that walks, naps, eats and plays.</p>
          <Link to="/inkborn/create"><Button variant="rainbow" size="lg">Draw your first Inkborn</Button></Link>
        </motion.section>
      ) : (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="inkborn-list">
          {d.creatures.map((c, i) => {
            const g = cleanGenome(c.genome);
            return (
              <motion.button key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }} whileHover={{ y: -4 }}
                onClick={() => setOpen(c)} className="glass group grid justify-items-center gap-1 rounded-3xl p-3 text-left">
                <div className={cn('relative', c.job && 'opacity-60')}><CreatureView genome={g} size={120} state={c.energy < 15 ? 'sleep' : c.happiness > 80 ? 'happy' : 'idle'} />
                  {c.job && <span className="absolute right-0 top-0 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold">{c.job_until && new Date(c.job_until).getTime() <= Date.now() ? '🎁 back!' : `🎒 ${jobLabel(c.job)}`}</span>}
                </div>
                <div className="w-full truncate text-center font-display font-semibold">{c.name}</div>
                <div className="text-[11px] text-muted">{MOOD_INFO[g.mood].emoji} {MOOD_INFO[g.mood].label} · {bondLevel(c.bond).name}</div>
                <div className="mt-1 flex w-full items-center gap-2 text-[10px] text-muted">
                  <Heart className="h-3 w-3 text-[#FF4D6D]" /><div className="h-1.5 flex-1 rounded-full bg-surface-2"><div className="h-full rounded-full bg-[#FF4D6D]" style={{ width: `${c.happiness}%` }} /></div>
                  <Zap className="h-3 w-3 text-[#FFC93D]" /><div className="h-1.5 flex-1 rounded-full bg-surface-2"><div className="h-full rounded-full bg-[#FFC93D]" style={{ width: `${c.energy}%` }} /></div>
                </div>
              </motion.button>
            );
          })}
        </section>
      )}

      <EggsPanel />
      {d.creatures.length > 0 && <EarnPanel creatures={d.creatures} />}

      <h2 className="mb-3 font-display text-lg font-semibold">Sanctuaries</h2>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="sanctuary-list">
        {d.habitats.map((h) => (
          <Link key={h.id} to={`/habitat/${h.id}`} className="glass group relative overflow-hidden rounded-3xl p-4 transition hover:-translate-y-0.5">
            <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: 'radial-gradient(120% 80% at 80% 120%, #2f7d3a 0%, transparent 60%), radial-gradient(60% 50% at 20% 110%, #3a8fd0 0%, transparent 70%)' }} />
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-display font-semibold">{h.name}</div>
                <div className="text-xs text-muted">{h.kind === 'starter' ? 'Free starter sanctuary' : `${h.plots} habitat plot${h.plots === 1 ? '' : 's'} on the map`}</div>
              </div>
              <span className="text-2xl">{h.kind === 'starter' ? '🌳' : '🏞️'}</span>
            </div>
            <div className="relative mt-3 flex items-center gap-2 text-xs"><span className="rounded-full bg-black/25 px-2 py-0.5 font-bold">🐾 {h.creatures}/{h.capacity}</span><span className="text-muted group-hover:text-fg">Enter →</span></div>
          </Link>
        ))}
        <Link to="/canvases" className="grid content-center gap-1 rounded-3xl border border-dashed border-line p-4 text-sm text-muted hover:border-line-strong hover:text-fg">
          <MapPinned className="h-5 w-5" />
          <b className="text-fg">Turn a plot into a habitat</b>
          Open one of your canvases and switch it to an Inkborn Habitat. Merged habitat plots become one bigger sanctuary with room for more creatures — your artwork is kept safe and comes back if you switch again.
        </Link>
      </section>
      <CreatureProfile c={cur} open={!!open} onOpenChange={(v) => !v && setOpen(null)} sanct={d} />
    </Page>
  );
}

function EarnPanel({ creatures }: { creatures: Inkborn[] }) {
  const eco = useInkEconomy();
  const nav = useNavigate();
  const rested = [...creatures].filter((c) => !c.job).sort((a, b) => b.energy - a.energy)[0];
  return (
    <section className="mb-8 grid gap-3" data-testid="inkborn-earn">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Earn Ink with your Inkborn</h2>
        {eco.data && <span className="flex items-center gap-1 text-xs text-muted"><ResourceIcon r="ink" className="h-3.5 w-3.5" /> {eco.data.ink_today}/{eco.data.daily_cap} today</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(GAMES) as GameId[]).map((g) => (
          <motion.button key={g} whileHover={{ y: -3 }} disabled={!rested} onClick={() => rested && nav(`/inkborn/play/${g}/${rested.id}`)}
            className="glass grid gap-1 rounded-3xl p-4 text-left disabled:opacity-60" style={{ boxShadow: `inset 0 0 0 1px ${GAMES[g].color}44` }} data-testid={`hub-game-${g}`}>
            <span className="text-3xl">{GAMES[g].emoji}</span>
            <b className="font-display">{GAMES[g].name}</b>
            <span className="text-xs text-muted">{GAMES[g].blurb}</span>
            <span className="mt-1 text-[11px] font-bold" style={{ color: GAMES[g].color }}>{rested ? `Play as ${rested.name} →` : 'Everyone is away'}</span>
          </motion.button>
        ))}
        <div className="glass grid gap-1 rounded-3xl p-4 text-sm">
          <span className="text-3xl">🎒</span><b className="font-display">Jobs</b>
          <span className="text-xs text-muted">Send a creature foraging, exploring or questing. They come back with Ink, and a closer bond brings back more.</span>
        </div>
        <div className="glass grid gap-1 rounded-3xl p-4 text-sm">
          <span className="text-3xl">🫧</span><b className="font-display">Ink Springs</b>
          <span className="text-xs text-muted">Happy creatures slowly fill their sanctuary’s spring with Ink, and Ink Spring decorations add more. Collect it in the sanctuary.</span>
        </div>
      </div>
    </section>
  );
}
