// /inkborn/visit — find anyone's sanctuary: search by name, or browse the liveliest, the newest and
// your friends'. Step in to meet their creatures (and bring yours along for a playdate).
import { useInfiniteQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { cn } from '../lib/utils';
import { Button, Empty, PlayerAvatar, Spinner, inputCls } from '../ui';
import { CreatureView } from './CreatureView';
import { cleanGenome } from './genome';

const SORTS = [{ id: 'lively', label: '🐾 Liveliest' }, { id: 'new', label: '✨ Newest' }, { id: 'friends', label: '💞 Friends' }] as const;
type Sort = (typeof SORTS)[number]['id'];
const ago = (iso: string) => {
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  return m < 10 ? 'here now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export default function Visit() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('lively');
  useEffect(() => { const t = setTimeout(() => setQuery(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const q = useInfiniteQuery({
    queryKey: ['sanctuary-directory', query, sort],
    queryFn: ({ pageParam }) => api.sanctuaryDirectory(query, sort, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.items.length === 24 ? all.length * 24 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Page wide>
      <PageHeader eyebrow="Inkborn" title="Visit sanctuaries">
        Step into anyone’s sanctuary to meet their creatures — and bring one of yours along for a playdate. Great playdates lay an egg for each of you.
      </PageHeader>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={cn(inputCls, 'pl-9')} value={text} onChange={(e) => setText(e.target.value)} placeholder="Search players or sanctuaries" data-testid="visit-search" />
        </div>
        <div className="flex gap-1.5">
          {SORTS.map((s) => (
            <button key={s.id} onClick={() => setSort(s.id)} className={cn('whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold', sort === s.id ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-fg')} data-testid={`visit-sort-${s.id}`}>{s.label}</button>
          ))}
        </div>
      </div>
      {q.isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : !items.length ? (
        <Empty icon={<Users className="h-6 w-6" />} title={sort === 'friends' ? 'No friends’ sanctuaries yet' : 'No sanctuaries found'}>
          {sort === 'friends' ? 'Add friends from the Community tab — their sanctuaries show up here.' : 'Try another name.'}
        </Empty>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="visit-list">
          {items.map((h, i) => (
            <motion.div key={h.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
              <Link to={`/habitat/${h.id}`} className="glass group relative block overflow-hidden rounded-3xl p-4 transition hover:-translate-y-0.5" data-testid="visit-card">
                <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(120% 80% at 80% 120%, #2f7d3a 0%, transparent 60%), radial-gradient(60% 50% at 20% 110%, #3a8fd0 0%, transparent 70%)' }} />
                <div className="relative flex items-center gap-2.5">
                  <PlayerAvatar p={h.owner} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display font-semibold">@{h.owner.username}{h.friend && <span className="ml-1.5 text-xs">💞</span>}</div>
                    <div className="truncate text-xs text-muted">{h.name} · {ago(h.active_at)}</div>
                  </div>
                  <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-bold">🐾 {h.creatures}</span>
                </div>
                <div className="relative mt-2 flex h-[86px] items-end justify-center gap-1">
                  {h.preview.map((c, k) => <div key={k} className="grid justify-items-center" title={c.name}><CreatureView genome={cleanGenome(c.genome)} size={k === 0 ? 86 : 66} /></div>)}
                </div>
                <div className="relative mt-1 flex items-center justify-between text-xs">
                  <span className="truncate text-muted">{h.preview.map((c) => c.name).join(', ')}{h.creatures > h.preview.length ? ` +${h.creatures - h.preview.length}` : ''}</span>
                  <span className="font-semibold text-fg/80 group-hover:text-fg">Visit →</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </section>
      )}
      {q.hasNextPage && <div className="mt-4 flex justify-center"><Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Show more</Button></div>}
    </Page>
  );
}
