import { useQuery } from '@tanstack/react-query';
import { Heart, Images } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { ArtworkCard } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Empty, Spinner, Tabs, PlayerAvatar } from '../ui';

export function useAssetUrl(path: string | null | undefined) {
  return useQuery({ queryKey: ['asset', path], queryFn: () => getBackend().publicAssetUrl(path), enabled: !!path, staleTime: Infinity }).data ?? null;
}

export function ArtThumb({ card, className }: { card: Pick<ArtworkCard, 'thumb_path' | 'title'>; className?: string }) {
  const url = useAssetUrl(card.thumb_path);
  return (
    <div className={cn('art-paper aspect-square overflow-hidden rounded-2xl', className)}>
      {url ? <img src={url} alt={card.title} className="h-full w-full object-cover [image-rendering:pixelated]" loading="lazy" /> : <div className="h-full w-full animate-pulse bg-surface-2" />}
    </div>
  );
}

export function ArtGrid({ cards }: { cards: ArtworkCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.id} to={`/art/${c.id}`} className="group glass overflow-hidden rounded-3xl p-2 transition hover:-translate-y-0.5">
          <ArtThumb card={c} />
          <div className="px-1.5 pb-1 pt-2">
            <div className="truncate text-sm font-bold">{c.title}</div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="flex min-w-0 items-center gap-1.5"><PlayerAvatar p={c.artist} size={16} /><span className="truncate">@{c.artist.username}</span></span>
              <span className="flex shrink-0 items-center gap-1 tnum"><Heart className={cn('h-3 w-3', c.appreciated && 'fill-hot text-hot')} />{fmt(c.appreciation_count)}</span>
            </div>
            <div className="text-[11px] text-faint">{c.plot_count} plot{c.plot_count === 1 ? '' : 's'} · {timeAgo(c.published_at)}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

const SECTIONS = [
  { value: 'new', label: 'New' },
  { value: 'appreciated', label: 'Most loved' },
  { value: 'largest', label: 'Largest murals' },
  { value: 'featured', label: 'Featured' },
  { value: 'staff_picks', label: 'Staff picks' },
  { value: 'mine', label: 'Mine' },
];

export default function GalleryScreen() {
  const [section, setSection] = useState('new');
  const q = useQuery({ queryKey: ['gallery', section], queryFn: () => api.galleryList(section, 48) });
  const artists = useQuery({ queryKey: ['trending'], queryFn: api.trendingArtists });
  return (
    <Page wide>
      <PageHeader eyebrow="The world's walls" title="Gallery">Every mural published on the map, by every artist. Tap one to fly to it.</PageHeader>
      <Tabs value={section} onValueChange={setSection} items={SECTIONS} className="mb-4" />
      {q.isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : !(q.data ?? []).length ? (
        <Empty icon={<Images className="h-6 w-6" />} title={section === 'mine' ? 'You have not published yet' : 'Nothing here yet'}>
          {section === 'featured' || section === 'staff_picks' ? 'Curators feature standout murals here.' : 'Claim a plot, paint it and publish — your art appears here and on the map.'}
        </Empty>
      ) : <ArtGrid cards={q.data!} />}
      {!!artists.data?.length && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Trending artists this week</h2>
          <div className="flex flex-wrap gap-2">
            {artists.data.map((a) => (
              <Link key={a.artist.id} to={`/u/${a.artist.username}`} className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
                <PlayerAvatar p={a.artist} size={28} />
                <span className="text-sm font-bold">@{a.artist.username}</span>
                <span className="text-xs text-muted tnum">{fmt(a.appreciations)} ♥</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
