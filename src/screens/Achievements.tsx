import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { cn } from '../lib/utils';
import { Cost, Dialog, Empty, Spinner } from '../ui';
import { isNative } from '../native/native';
import type { Achievement } from '../backend/types';
import { BadgeIcon, tierOf } from './BadgeIcon';
import { useState } from 'react';

const APP = isNative();

const CATS: Record<string, string> = { rarity: '💎 Rarities', collection: '🗺️ Collection', kinds: '🏗️ Every kind of plot', daily: '🔥 Daily & Luck', travel: '✈️ Travel', estate: '🏘️ Estates', creation: '🎨 Creation', exploration: '🧭 Exploration', mastery: '🎮 Mastery', community: '💖 Community' };
export default function Achievements() {
  const q = useQuery({ queryKey: ['achievements'], queryFn: api.achievements });
  const [show, setShow] = useState<'all' | 'got' | 'todo'>('all');
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const list = q.data ?? [];
  if (!list.length) return <Page><Empty icon={<Award className="h-6 w-6" />} title="No badges yet" /></Page>;
  const done = list.filter((a) => a.unlocked_at).length;
  const shown = (cat: string) => list.filter((a) => a.category === cat && (show === 'all' || (show === 'got' ? !!a.unlocked_at : !a.unlocked_at)));
  if (APP) return <AppBadges list={list} done={done} show={show} setShow={setShow} shown={shown} />;
  return (
    <Page>
      <PageHeader eyebrow={`${done} of ${list.length} unlocked`} title="Badges">Every rarity, every kind of plot, streaks, trips, estates and more — each with its own medal. The metal shows how hard it is to get.</PageHeader>
      <div className="mb-5 flex gap-1.5" data-testid="badge-filter">
        {([['all', 'All'], ['got', 'Unlocked'], ['todo', 'To go']] as const).map(([k, l]) => <button key={k} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', show === k ? 'bg-accent text-white' : 'bg-surface-2 text-muted')} onClick={() => setShow(k)}>{l}</button>)}
      </div>
      {Object.entries(CATS).map(([cat, label]) => {
        const items = shown(cat);
        if (!items.length) return null;
        return (
          <section key={cat} className="mb-6">
            <h2 className="eyebrow mb-3">{label} <span className="text-faint">· {items.filter((a) => a.unlocked_at).length}/{list.filter((a) => a.category === cat).length}</span></h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((a) => {
                const pct = Math.min(100, (a.progress / Math.max(1, a.threshold)) * 100);
                return (
                  // (220 badge cards: the ones scrolled out of view aren't laid out or painted until they come near)
                  <div key={a.key} className={cn('glass lv-offscreen-skip flex items-start gap-3 rounded-3xl p-4', !a.unlocked_at && 'opacity-80')}>
                    <BadgeIcon icon={a.icon} category={a.category} tier={tierOf(a)} locked={!a.unlocked_at} size={56} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{a.name}</div>
                      <div className="text-sm text-muted">{a.description}</div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent-2" style={{ width: `${pct}%` }} /></div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-faint tnum">
                        <span>{a.unlocked_at ? `Unlocked ${new Date(a.unlocked_at).toLocaleDateString()}` : `${a.progress} / ${a.threshold}`}</span>
                        <span className="flex items-center gap-1"><Cost cost={a.reward} /></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </Page>
  );
}

// the app: a collection — a progress ring, the badges you're closest to, then every category as a grid of medals
const pctOf = (a: Achievement) => Math.min(100, (a.progress / Math.max(1, a.threshold)) * 100);
function AppBadges({ list, done, show, setShow, shown }: { list: Achievement[]; done: number; show: 'all' | 'got' | 'todo'; setShow(v: 'all' | 'got' | 'todo'): void; shown(cat: string): Achievement[] }) {
  const [open, setOpen] = useState<Achievement | null>(null);
  const pct = Math.round((done / list.length) * 100);
  const close = list.filter((a) => !a.unlocked_at && a.progress > 0).sort((a, b) => pctOf(b) - pctOf(a)).slice(0, 3);
  const R = 40, C = 2 * Math.PI * R;
  return (
    <Page>
      <section className="lv-badgehero" data-testid="badge-hero">
        <svg viewBox="0 0 100 100" className="lv-badgering" aria-hidden>
          <defs><linearGradient id="bh-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe58a" /><stop offset="0.5" stopColor="#ff9f1c" /><stop offset="1" stopColor="#ff4fd8" /></linearGradient></defs>
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
          <circle cx="50" cy="50" r={R} fill="none" stroke="url(#bh-ring)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 50 50)" />
        </svg>
        <div className="lv-badgering-mid"><b className="tnum">{pct}%</b><small>complete</small></div>
        <div className="min-w-0 flex-1">
          <div className="lv-earnlabel">Your collection</div>
          <h1 className="font-display text-[28px] font-black leading-none">Badges</h1>
          <div className="mt-1.5 text-sm font-bold text-white/70"><span className="tnum text-white">{done}</span> of <span className="tnum">{list.length}</span> unlocked</div>
        </div>
      </section>
      {close.length > 0 && show !== 'got' && (
        <section className="mb-4" data-testid="badge-close">
          <h2 className="eyebrow mb-2">Almost there</h2>
          <div className="grid gap-2">
            {close.map((a) => (
              <button key={a.key} className="lv-closebadge" onClick={() => setOpen(a)}>
                <BadgeIcon icon={a.icon} category={a.category} tier={tierOf(a)} locked size={46} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-display text-[15px] font-bold">{a.name}</span>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-black/40"><span className="lv-closebar block h-full rounded-full" style={{ width: `${pctOf(a)}%` }} /></span>
                </span>
                <span className="text-right text-xs font-black tnum text-white/80">{a.progress}/{a.threshold}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="lv-seg2 mb-4" data-testid="badge-filter">
        {([['all', 'All'], ['got', 'Unlocked'], ['todo', 'To go']] as const).map(([k, l]) => <button key={k} className={cn(show === k && 'on')} onClick={() => setShow(k)}>{l}</button>)}
      </div>
      {Object.entries(CATS).map(([cat, label]) => {
        const items = shown(cat);
        if (!items.length) return null;
        const all = list.filter((a) => a.category === cat);
        const got = all.filter((a) => a.unlocked_at).length;
        return (
          <section key={cat} className="lv-badgecat">
            <div className="mb-2.5 flex items-center gap-2">
              <h2 className="font-display text-[15px] font-black">{label}</h2>
              <span className="lv-earnchip ml-auto h-6 tnum">{got}/{all.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((a) => (
                <button key={a.key} className={cn('lv-medal lv-offscreen-skip', a.unlocked_at ? 'got' : 'locked')} onClick={() => setOpen(a)} data-testid={`badge-${a.key}`}>
                  <BadgeIcon icon={a.icon} category={a.category} tier={tierOf(a)} locked={!a.unlocked_at} size={54} />
                  <span className="lv-medal-name">{a.name}</span>
                  {!a.unlocked_at && <span className="lv-medal-bar"><i style={{ width: `${pctOf(a)}%` }} /></span>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)} title={open?.name ?? ''}>
        {open && (
          <div className="flex flex-col items-center gap-3 pb-2 text-center" data-testid="badge-sheet">
            <BadgeIcon icon={open.icon} category={open.category} tier={tierOf(open)} locked={!open.unlocked_at} size={104} />
            <p className="text-sm text-muted">{open.description}</p>
            <div className="w-full">
              <div className="h-2.5 overflow-hidden rounded-full bg-black/40"><div className="lv-closebar h-full rounded-full" style={{ width: `${pctOf(open)}%` }} /></div>
              <div className="mt-1.5 flex justify-between text-xs font-bold text-muted tnum">
                <span>{open.unlocked_at ? `Unlocked ${new Date(open.unlocked_at).toLocaleDateString()}` : `${open.progress} / ${open.threshold}`}</span>
                <span className="flex items-center gap-1">Reward <Cost cost={open.reward} /></span>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </Page>
  );
}
