import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { cn } from '../lib/utils';
import { Cost, Empty, Spinner } from '../ui';
import { BadgeIcon, tierOf } from './BadgeIcon';
import { useState } from 'react';

const CATS: Record<string, string> = { rarity: '💎 Rarities', collection: '🗺️ Collection', kinds: '🏗️ Every kind of plot', daily: '🔥 Daily & Luck', travel: '✈️ Travel', estate: '🏘️ Estates', creation: '🎨 Creation', exploration: '🧭 Exploration', mastery: '🎮 Mastery', community: '💖 Community' };
export default function Achievements() {
  const q = useQuery({ queryKey: ['achievements'], queryFn: api.achievements });
  const [show, setShow] = useState<'all' | 'got' | 'todo'>('all');
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const list = q.data ?? [];
  if (!list.length) return <Page><Empty icon={<Award className="h-6 w-6" />} title="No badges yet" /></Page>;
  const done = list.filter((a) => a.unlocked_at).length;
  const shown = (cat: string) => list.filter((a) => a.category === cat && (show === 'all' || (show === 'got' ? !!a.unlocked_at : !a.unlocked_at)));
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
                  <div key={a.key} className={cn('glass flex items-start gap-3 rounded-3xl p-4', !a.unlocked_at && 'opacity-80')}>
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
