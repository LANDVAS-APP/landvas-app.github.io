import { useQuery } from '@tanstack/react-query';
import { Award, Check, Lock } from 'lucide-react';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { cn } from '../lib/utils';
import { Cost, Empty, Spinner } from '../ui';

const CATS: Record<string, string> = { creation: 'Creation', collection: 'Collection', exploration: 'Exploration', mastery: 'Mastery', community: 'Community' };

export default function Achievements() {
  const q = useQuery({ queryKey: ['achievements'], queryFn: api.achievements });
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const list = q.data ?? [];
  if (!list.length) return <Page><Empty icon={<Award className="h-6 w-6" />} title="No badges yet" /></Page>;
  const done = list.filter((a) => a.unlocked_at).length;
  return (
    <Page>
      <PageHeader eyebrow={`${done} of ${list.length} unlocked`} title="Badges">Milestones for painting, collecting, exploring and mastering your plots' games.</PageHeader>
      {Object.entries(CATS).map(([cat, label]) => {
        const items = list.filter((a) => a.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} className="mb-6">
            <h2 className="eyebrow mb-3">{label}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((a) => {
                const pct = Math.min(100, (a.progress / Math.max(1, a.threshold)) * 100);
                return (
                  <div key={a.key} className={cn('glass flex items-start gap-3 rounded-3xl p-4', !a.unlocked_at && 'opacity-80')}>
                    <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', a.unlocked_at ? 'shimmer text-white' : 'bg-surface-2 text-faint')}>
                      {a.unlocked_at ? <Check className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                    </div>
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
