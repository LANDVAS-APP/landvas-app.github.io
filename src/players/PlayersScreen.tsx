// Everyone playing LANDVAS: their land, their art, and their room to visit.
import { useInfiniteQuery } from '@tanstack/react-query';
import { DoorOpen, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { DirectoryPlayer } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { Button, Empty, Spinner, Tabs, inputCls, PlayerAvatar } from '../ui';
import { RarityBadge } from '../plot/RarityBadge';
import { ArtThumb } from '../gallery/GalleryScreen';
import { FriendButton } from '../social/FriendButton';

const SORTS = [
  { value: 'land', label: 'Most land' },
  { value: 'art', label: 'Most art' },
  { value: 'loved', label: 'Most loved' },
  { value: 'level', label: 'Top artists' },
  { value: 'new', label: 'Newest' },
  { value: 'name', label: 'A–Z' },
];
const PAGE = 30;

export default function PlayersScreen() {
  const [sort, setSort] = useState('land');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useInfiniteQuery({
    queryKey: ['players', debounced, sort],
    queryFn: ({ pageParam }) => api.playersDirectory(debounced, sort, PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length * PAGE : undefined),
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  return (
    <Page wide>
      <PageHeader eyebrow="The people of the map" title="Players">
        Everyone claiming and painting the world. Step into anyone’s room to see all their art and land — rooms never show where it is.
      </PageHeader>
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center">
        <label className="glass flex h-11 items-center gap-2 rounded-2xl px-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" aria-label="Search players" className="h-full min-w-0 flex-1 bg-transparent text-[14px] focus:outline-none" data-testid="players-search" />
        </label>
        <Tabs value={sort} onValueChange={setSort} items={SORTS} />
      </div>
      {list.isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : !rows.length ? (
        <Empty icon={<Users className="h-6 w-6" />} title={debounced ? 'No players match' : 'No players yet'}>{debounced ? 'Try another name.' : 'Be the first to claim a plot!'}</Empty>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{fmt(total)} player{total === 1 ? '' : 's'}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="players-list">
            {rows.map((r) => <PlayerCard key={r.profile.id} r={r} />)}
          </div>
          {list.hasNextPage && (
            <div className="mt-5 flex justify-center"><Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Show more</Button></div>
          )}
        </>
      )}
    </Page>
  );
}

function PlayerCard({ r }: { r: DirectoryPlayer }) {
  const nav = useNavigate();
  const me = useOnboardedMe();
  const p = r.profile;
  const isMe = me?.profile.id === p.id;
  return (
    <article className="glass flex gap-3 rounded-3xl p-3" data-testid="player-card">
      <Link to={`/u/${p.username}`} className="relative shrink-0" aria-label={`@${p.username}'s profile`}>
        {r.top_art ? <ArtThumb card={{ thumb_path: r.top_art.thumb_path, title: r.top_art.title }} className="h-24 w-24" /> : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${p.accent_color}55, transparent)` }}>
            <PlayerAvatar p={p} size={56} />
          </div>
        )}
        {r.top_art && <span className="absolute -bottom-1 -right-1"><PlayerAvatar p={p} size={30} className="ring-2 ring-bg" /></span>}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/u/${p.username}`} className="min-w-0 hover:underline">
          <div className="truncate font-bold">{p.display_name || p.username}{isMe && <span className="ml-1.5 rounded bg-accent/20 px-1 text-[10px] font-bold text-accent-2">you</span>}</div>
          <div className="truncate text-xs text-muted">@{p.username} · artist level {r.artist_level}</div>
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="tnum"><b>{fmt(r.plots)}</b> plot{r.plots === 1 ? '' : 's'}</span>
          <span className="tnum"><b>{fmt(r.artworks)}</b> artwork{r.artworks === 1 ? '' : 's'}</span>
          <span className="tnum text-muted">{fmt(r.appreciations)} ♥</span>
          {r.best_rarity && r.best_rarity !== 'common' && <RarityBadge r={r.best_rarity} small />}
        </div>
        <div className="mt-auto flex gap-2 pt-2">
          <Button size="sm" variant="secondary" data-testid="visit-player" onClick={() => nav(`/u/${p.username}/room`)}><DoorOpen className="h-4 w-4" /> {isMe ? 'My room' : 'Visit room'}</Button>
          {!isMe && <FriendButton playerId={p.id} username={p.username} />}
        </div>
      </div>
    </article>
  );
}
