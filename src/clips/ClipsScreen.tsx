// Clips: every roll you've made on this phone (replayed exactly as it went), every big moment (splices, the Forbidden
// Wish, Hope, evolutions, treasure…), and any plot you own (its roll re-created) — cut a video of any of them, or
// snip any frame as a picture.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { Page } from '../app/Shell';
import { qk, useOnboardedMe } from '../lib/queries';
import { cn, timeAgo } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { BasePlotArt } from '../plot/BasePlotArt';
import { kindInfo } from '../enchant/kinds';
import { ClipSheet, rollJob, type ClipJob } from '../roll/clip';
import { recreate } from '../roll/stage/director';
import { layoutFor } from '../roll/stage/layout';
import type { Trace } from '../roll/stage/trace';
import { rarityInfo, type RarityId } from '../shared/rarity';
import { Button, Empty, Spinner, Tabs } from '../ui';
import { removeClip, useClips, type ClipEntry } from './history';
import { momentJob, momentTitle } from './moments';

type Open = { job: ClipJob; mode: 'video' | 'snip' };

export default function ClipsScreen() {
  const me = useOnboardedMe();
  const user = me?.profile.username ?? null;
  const all = useClips(user);
  const [tab, setTab] = useState<'rolls' | 'moments' | 'plots'>('rolls');
  const [open, setOpen] = useState<Open | null>(null);
  const rolls = all.filter((e) => e.kind === 'roll');
  const moments = all.filter((e) => e.kind === 'moment');
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me && tab === 'plots', staleTime: 30_000 });
  const jobOf = (e: ClipEntry) => (e.kind === 'roll' ? rollJob(e.trace) : momentJob(e.moment, user));
  return (
    <Page>
      <header className="mb-4 grid gap-1">
        <div className="flex items-center gap-3">
          <motion.div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl lv-clip-btn" initial={{ rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }}>🎬</motion.div>
          <div className="grid">
            <h1 className="font-display text-3xl font-black tracking-tight">Clips</h1>
            <p className="text-sm text-muted">Replay any roll exactly as it went, clip your big moments, or snip any frame.</p>
          </div>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4"
        items={[{ value: 'rolls', label: `Rolls${rolls.length ? ` · ${rolls.length}` : ''}` }, { value: 'moments', label: `Moments${moments.length ? ` · ${moments.length}` : ''}` }, { value: 'plots', label: 'My plots' }]} />
      {tab === 'rolls' && (rolls.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="clips-rolls">
          {rolls.map((e, i) => <Card key={e.id} e={e} i={i} onOpen={(mode) => setOpen({ job: jobOf(e), mode })} />)}
        </div>
      ) : (
        <Empty icon={<span className="text-3xl">🎲</span>} title="No rolls kept yet" action={<Link to="/world"><Button variant="rainbow">Roll a plot</Button></Link>}>
          Every plot you roll from now on is kept here — the whole roll, every reroll, exactly as it went — ready to clip or snip.
        </Empty>
      ))}
      {tab === 'moments' && (moments.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="clips-moments">
          {moments.map((e, i) => <Card key={e.id} e={e} i={i} onOpen={(mode) => setOpen({ job: jobOf(e), mode })} />)}
        </div>
      ) : (
        <Empty icon={<span className="text-3xl">✨</span>} title="No moments yet" action={<Link to="/grimoire"><Button variant="secondary">Open the Grimoire</Button></Link>}>
          Splices, the Forbidden Wish, Hope rising from Pandora’s Box, a Parasite evolving, treasure dug up, a Platinum egg, a shattered Mirror Shard, a PERFECT zap… each one lands here to clip.
        </Empty>
      ))}
      {tab === 'plots' && <PlotList loading={plots.isLoading} list={(plots.data ?? []) as PlotRow[]} user={user} onOpen={setOpen} />}
      <p className="mt-5 text-center text-[11px] text-white/45">Rolls and moments are kept on this phone (the last 30 of each).</p>
      {open && <ClipSheet job={open.job} startWith={open.mode} onClose={() => setOpen(null)} />}
    </Page>
  );
}

function Card({ e, i, onOpen }: { e: ClipEntry; i: number; onOpen(mode: 'video' | 'snip'): void }) {
  const head = e.kind === 'roll' ? rollHead(e.trace) : (() => { const h = momentTitle(e.moment); return { title: h.title, sub: h.sub, color: h.color, emoji: h.emoji, badge: null as string | null }; })();
  return (
    <motion.div className="grid gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} data-testid="clip-card">
      <button onClick={() => onOpen('video')} className="relative overflow-hidden rounded-2xl" aria-label={`Clip ${head.title}`}>
        <Thumb e={e} />
        {head.badge && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black text-white">{head.badge}</span>}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-left">
          <span className="block truncate font-display text-[14px] font-black" style={{ color: head.color }}>{head.emoji} {head.title}</span>
          <span className="block truncate text-[10px] font-semibold text-white/70">{head.sub}</span>
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        <button className="lv-clip-btn h-9 flex-1 rounded-xl text-[13px] font-black text-white" onClick={() => onOpen('video')} data-testid="clip-card-video">🎬 Clip</button>
        <button className="h-9 flex-1 rounded-xl bg-white/10 text-[13px] font-black text-white" onClick={() => onOpen('snip')} data-testid="clip-card-snip">📸 Snip</button>
        <button className="h-9 w-9 rounded-xl bg-white/5 text-[13px] text-white/60" onClick={() => removeClip(e.id)} aria-label="Remove">🗑</button>
      </div>
      <div className="px-1 text-[10px] font-semibold text-white/45">{timeAgo(new Date(e.at).toISOString())}</div>
    </motion.div>
  );
}

function rollHead(tr: Trace) {
  const f = tr.final, ench = f.enchant;
  const info = rarityInfo(ench ? 'enchanted' : f.rarity), ty = PLOT_TYPES[f.type as keyof typeof PLOT_TYPES];
  const ek = ench ? kindInfo(ench.kind) : null;
  return {
    title: `${f.shiny ? 'Shiny ' : ''}${ek ? ek.name : info.name}`, emoji: ek?.emoji ?? info.emoji ?? '🎲',
    sub: [ty ? ty.game : null, f.choices && f.choices.length > 1 ? `${f.choices.length} Lucky rolls` : null, tr.recreated ? 're-created' : null].filter(Boolean).join(' · ') || 'A plot roll',
    color: ench ? '#E5CCFF' : info.glow, badge: f.choices && f.choices.length > 1 ? `🍀 ×${f.choices.length}` : f.shiny ? '✨ SHINY' : null,
  };
}

// a still from each clip (drawn one per frame, so a long list never stutters)
const queue: (() => Promise<void>)[] = [];
let busy = false;
function enqueue(f: () => Promise<void>) {
  queue.push(f);
  if (busy) return;
  busy = true;
  const run = async () => { const job = queue.shift(); if (!job) { busy = false; return; } try { await job(); } catch { /* skip */ } requestAnimationFrame(() => void run()); };
  void run();
}
function Thumb({ e }: { e: ClipEntry | { kind: 'job'; job: ClipJob; id: string } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    enqueue(async () => {
      if (dead || !ref.current) return;
      const job = e.kind === 'job' ? e.job : e.kind === 'roll' ? rollJob(e.trace) : momentJob(e.moment);
      await job.prepare();
      if (dead || !ref.current) return;
      const big = document.createElement('canvas'); big.width = job.w; big.height = job.h;
      job.draw(big.getContext('2d', { willReadFrequently: true })!, job.poster);
      const c = ref.current, g = c.getContext('2d')!;
      g.drawImage(big, 0, 0, c.width, c.height);
    });
    return () => { dead = true; };
  }, [e.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={216} height={384} className="block aspect-[9/16] w-full bg-[#05040F]" />;
}

type PlotRow = { gx: number; gy: number; plot_type: string; rarity: RarityId; name: string | null; usd_per_second: number; claimed_at: string; shiny?: boolean };
function PlotList({ loading, list, user, onOpen }: { loading: boolean; list: PlotRow[]; user: string | null; onOpen(o: Open): void }) {
  const [n, setN] = useState(24);
  const rows = useMemo(() => [...list].filter((p) => p.rarity !== 'enchanted').sort((a, b) => Date.parse(b.claimed_at) - Date.parse(a.claimed_at)), [list]);
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!rows.length) return <Empty icon={<span className="text-3xl">🗺️</span>} title="No plots yet">Roll your first plot — then come back to clip it.</Empty>;
  const job = (p: PlotRow) => rollJob(recreate({ rarity: p.rarity, type: p.plot_type, shiny: !!p.shiny, usd: Number(p.usd_per_second), first: false, name: p.name }, layoutFor(390, 844), { user: user ? { username: user } : undefined, seed: (p.gx * 73856093) ^ (p.gy * 19349663) }));
  return (
    <div className="grid gap-2" data-testid="clips-plots">
      <p className="px-1 text-[12px] text-white/55">Plots from before rolls were kept get their roll re-created — same plot, same minigame, same rarity.</p>
      {rows.slice(0, n).map((p) => {
        const info = rarityInfo(p.rarity), ty = PLOT_TYPES[p.plot_type as keyof typeof PLOT_TYPES];
        return (
          <div key={`${p.gx}_${p.gy}`} className={cn('flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2')}>
            <span className="relative block shrink-0 overflow-hidden rounded-[22%]"><BasePlotArt rarity={p.rarity} shiny={!!p.shiny} size={48} /></span>
            <div className="grid min-w-0 flex-1">
              <span className="truncate font-display text-[15px] font-black" style={{ color: info.color }}>{p.shiny ? '✨ ' : ''}{info.emoji ? `${info.emoji} ` : ''}{info.name}{p.name ? ` · “${p.name}”` : ''}</span>
              <span className="truncate text-[11px] font-semibold text-white/55">{ty ? `${ty.game} · ${ty.name}` : 'Plot'} · {timeAgo(p.claimed_at)}</span>
            </div>
            <button className="lv-clip-btn h-9 rounded-xl px-3 text-[12px] font-black text-white" onClick={() => onOpen({ job: job(p), mode: 'video' })} data-testid="plot-clip">🎬 Clip</button>
            <button className="h-9 rounded-xl bg-white/10 px-3 text-[12px] font-black text-white" onClick={() => onOpen({ job: job(p), mode: 'snip' })}>📸</button>
          </div>
        );
      })}
      {rows.length > n && <Button variant="ghost" onClick={() => setN(n + 24)}>Show more</Button>}
    </div>
  );
}
