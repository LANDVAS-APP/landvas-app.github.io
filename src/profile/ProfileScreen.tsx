import { useQuery } from '@tanstack/react-query';
import { Ban, Brush, DoorOpen } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { fmt } from '../lib/utils';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { Button, Empty, Spinner, PlayerAvatar } from '../ui';
import { ArtGrid } from '../gallery/GalleryScreen';
import { RarityBadge } from '../plot/RarityBadge';
import { RARITY_ORDER } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { LandMosaic } from '../land/LandMosaic';
import { FriendButton } from '../social/FriendButton';
import { ExplorerFigure } from '../explorer/ExplorerFigure';
import type { PlayerLand } from '../backend/types';

export default function ProfileScreen() {
  const { username = '' } = useParams();
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['profile', username], queryFn: () => api.profileByUsername(username) });
  const land = useQuery({ queryKey: ['land', username], queryFn: () => api.playerLand(username), enabled: !!q.data });
  const nav = useNavigate();
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (q.error || !q.data) return <Page><Empty title="Profile not found">This artist doesn't exist or isn't visible to you.</Empty></Page>;
  const d = q.data;
  const p = d.profile;
  return (
    <Page>
      <section className="glass relative overflow-hidden rounded-[28px] p-6">
        <div className="absolute inset-x-0 top-0 h-24 opacity-40" style={{ background: `linear-gradient(120deg, ${p.accent_color}, transparent)` }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <PlayerAvatar p={p} size={84} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">{p.display_name || p.username}</h1>
            <p className="text-sm text-muted">@{p.username} · Artist level {d.stats.artist_level} · since {new Date(d.stats.member_since).toLocaleDateString()}</p>
            {p.bio && <p className="mt-2 max-w-xl text-sm">{p.bio}</p>}
          </div>
          <ExplorerFigure style={p.explorer_style} accent={p.accent_color} size={52} className="hidden sm:block" label={`@${p.username}'s explorer`} />
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <Button variant="rainbow" size="sm" data-testid="profile-visit" onClick={() => nav(`/u/${p.username}/room`)}>
            <DoorOpen className="h-4 w-4" /> {d.is_me ? 'My room' : 'Visit their room'}
          </Button>
          <FriendButton playerId={p.id} username={p.username} />
          {me && !d.is_me && (
            <Button variant="ghost" size="sm" onClick={async () => {
              try { await api.blockPlayer(p.id, !d.blocked); toast.success(d.blocked ? 'Unblocked' : 'Blocked — their art and messages are hidden from you'); void q.refetch(); } catch (e) { toast.error(toGameError(e).message); }
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
      {land.data && land.data.total_plots > 0 && <LandSection land={land.data} username={p.username} />}
      <section className="mt-5">
        <h2 className="mb-3 font-display text-lg font-semibold">Artworks</h2>
        {d.gallery?.length ? <ArtGrid cards={d.gallery} /> : <Empty icon={<Brush className="h-6 w-6" />} title="No published artworks yet" />}
      </section>
    </Page>
  );
}

/** A player's land in brief: rarity mix, rent rate and their biggest canvases (shapes only). */
function LandSection({ land, username }: { land: PlayerLand; username: string }) {
  const counts = RARITY_ORDER.map((r) => [r, land.rarity_counts[r] ?? 0] as const).filter(([, n]) => n > 0);
  return (
    <section className="mt-5" data-testid="profile-land">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Land</h2>
        <span className="text-xs text-muted tnum">{fmt(land.total_plots)} plots · earns {formatRate(Number(land.usd_per_second))}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">{counts.map(([r, n]) => <span key={r} className="flex items-center gap-1.5"><RarityBadge r={r} small /><b className="text-sm tnum">{n}</b></span>)}</div>
      <Link to={`/u/${username}/room`} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-3 hover:border-line-strong">
        {land.canvases.slice(0, 5).map((c) => (
          <div key={c.id} className="flex h-20 w-20 items-center justify-center rounded-2xl bg-bg-2/70 p-1.5 shadow-[inset_0_0_0_1px_var(--line)]">
            <LandMosaic canvas={c} size={64} />
          </div>
        ))}
        <span className="flex items-center gap-1.5 px-2 text-sm font-bold text-accent-2"><DoorOpen className="h-4 w-4" /> See everything in their room</span>
      </Link>
    </section>
  );
}
