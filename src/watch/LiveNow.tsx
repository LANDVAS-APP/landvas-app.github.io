// Ways in to watching someone: a "Live now" row of people playing something you could watch (friends first), and a
// 👀 button wherever someone's shown with what they're up to.
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { api } from '../backend/api';
import type { Whereabouts } from '../backend/types';
import { Button, PlayerAvatar } from '../ui';
import { useOnboardedMe } from '../lib/queries';
import { live } from '../lib/poll';
import { describeWhereabouts } from '../social/activity';

/** 👀 — watch them play (only shown while they can be watched) */
export function WatchButton({ username, now, onGo, label = false }: { username: string; now: Whereabouts | null | undefined; onGo?(): void; label?: boolean }) {
  const nav = useNavigate();
  if (!now?.watch) return null;
  return (
    <Button size="sm" variant="secondary" onClick={() => { onGo?.(); nav(`/watch/${encodeURIComponent(username)}`); }} data-testid="watch-btn" aria-label={`Watch @${username} play`}>
      <Eye className="h-4 w-4" />{label && ' Watch'}
    </Button>
  );
}

/** on a profile: "Watch live" while they're playing something */
export function WatchProfileButton({ username }: { username: string }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['watch', username.toLowerCase()], queryFn: () => api.watchStart(username), staleTime: 30_000, retry: false });
  if (!q.data?.now?.watch) return null;
  return (
    <Button variant="rainbow" size="sm" className="rounded-full" data-testid="profile-watch" onClick={() => nav(`/watch/${encodeURIComponent(username)}`)}>
      <Eye className="h-4 w-4" /> Watch live · <span className="opacity-80">{describeWhereabouts(q.data.now)}</span>
    </Button>
  );
}

/** people playing something you could watch right now */
export function LiveNow({ onGo }: { onGo?(): void }) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['watchable-players'], queryFn: api.watchablePlayers, enabled: !!me, refetchInterval: live(30_000), staleTime: 15_000 });
  const ps = q.data ?? [];
  if (!ps.length) return null;
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-1.5" data-testid="live-now">
      <div className="eyebrow flex items-center gap-1.5"><i className="lv-watch-dot" /> Live now — watch someone play · {ps.length}</div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ps.map((p) => (
          <button key={p.id} type="button" className="lv-live-card" data-testid="live-now-card" data-user={p.username}
            onClick={() => { onGo?.(); nav(`/watch/${encodeURIComponent(p.username)}`); }}>
            <span className="relative"><PlayerAvatar p={p} size={44} /><span className="lv-live-ring" /></span>
            <span className="w-full truncate text-xs font-semibold">@{p.username}{p.friend && ' ⭐'}</span>
            <span className="w-full truncate text-[10px] text-muted">{describeWhereabouts(p.now ?? undefined)}</span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-accent-2"><Eye className="h-3 w-3" /> Watch</span>
          </button>
        ))}
      </div>
    </section>
  );
}
