import { useQuery } from '@tanstack/react-query';
import { Ban, Brush } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { fmt } from '../lib/utils';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { Avatar, Button, Empty, Spinner } from '../ui';
import { ArtGrid } from '../gallery/GalleryScreen';

export default function ProfileScreen() {
  const { username = '' } = useParams();
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['profile', username], queryFn: () => api.profileByUsername(username) });
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (q.error || !q.data) return <Page><Empty title="Profile not found">This artist doesn't exist or isn't visible to you.</Empty></Page>;
  const d = q.data;
  const p = d.profile;
  return (
    <Page>
      <section className="glass relative overflow-hidden rounded-[28px] p-6">
        <div className="absolute inset-x-0 top-0 h-24 opacity-40" style={{ background: `linear-gradient(120deg, ${p.accent_color}, transparent)` }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar seed={p.avatar_seed} style={p.avatar_style} accent={p.accent_color} size={84} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">{p.display_name || p.username}</h1>
            <p className="text-sm text-muted">@{p.username} · Artist level {d.stats.artist_level} · since {new Date(d.stats.member_since).toLocaleDateString()}</p>
            {p.bio && <p className="mt-2 max-w-xl text-sm">{p.bio}</p>}
          </div>
          {me && !d.is_me && (
            <Button variant="ghost" size="sm" onClick={async () => {
              try { await api.blockPlayer(p.id, !d.blocked); toast.success(d.blocked ? 'Unblocked' : 'Blocked — their art is hidden from you'); void q.refetch(); } catch (e) { toast.error(toGameError(e).message); }
            }}><Ban className="h-4 w-4" /> {d.blocked ? 'Unblock' : 'Block'}</Button>
          )}
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Plots', d.stats.plots], ['Artworks', d.stats.artworks], ['Mural area', d.stats.canvas_area], ['Appreciations', d.stats.appreciations]].map(([l, v]) => (
            <div key={l as string} className="rounded-2xl border border-line bg-surface/50 p-3 text-center">
              <div className="font-display text-lg font-semibold tnum">{fmt(v as number)}</div>
              <div className="eyebrow !text-[10px]">{l}</div>
            </div>
          ))}
        </div>
      </section>
      {Object.keys(d.minigames ?? {}).length > 0 && (
        <section className="mt-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Minigames</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(d.minigames).map(([g, r]: [string, any]) => (
              <div key={g} className="glass rounded-2xl p-3">
                <div className="font-bold">{GAME_INFO[g as GameId]?.name ?? g}</div>
                <div className="text-xs text-muted tnum">Level {r.highest_level} · best {fmt(r.best_score)} · {r.wins} wins</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="mt-5">
        <h2 className="mb-3 font-display text-lg font-semibold">Artworks</h2>
        {d.gallery?.length ? <ArtGrid cards={d.gallery} /> : <Empty icon={<Brush className="h-6 w-6" />} title="No published artworks yet" />}
      </section>
    </Page>
  );
}
