import { useQuery } from '@tanstack/react-query';
import { Ban, Brush, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { fmt } from '../lib/utils';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { Avatar, Button, Empty, Spinner } from '../ui';
import { ArtGrid, ArtThumb } from '../gallery/GalleryScreen';
import { RarityBadge } from '../plot/RarityBadge';
import { RARITY_ORDER } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { GRID_SIZE, Z_HOUSE, Z_PLOT, Z_STREET, cellCenter } from '../shared/grid';
import { useUi } from '../lib/store';
import { visitPlayer } from '../visit/visit';
import type { PlayerLand } from '../backend/types';

export default function ProfileScreen() {
  const { username = '' } = useParams();
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['profile', username], queryFn: () => api.profileByUsername(username) });
  const land = useQuery({ queryKey: ['land', username], queryFn: () => api.playerLand(username), enabled: !!q.data });
  const nav = useNavigate();
  const [visiting, setVisiting] = useState(false);
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
          {(land.data?.total_plots ?? 0) > 0 && (
            <Button variant="rainbow" size="sm" loading={visiting} data-testid="profile-visit" onClick={async () => {
              setVisiting(true);
              if (await visitPlayer(p.username)) nav('/');
              setVisiting(false);
            }}><MapPin className="h-4 w-4" /> {d.is_me ? 'Go to my land' : 'Visit their land'}</Button>
          )}
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
      {land.data && land.data.total_plots > 0 && <LandSection land={land.data} />}
      <section className="mt-5">
        <h2 className="mb-3 font-display text-lg font-semibold">Artworks</h2>
        {d.gallery?.length ? <ArtGrid cards={d.gallery} /> : <Empty icon={<Brush className="h-6 w-6" />} title="No published artworks yet" />}
      </section>
    </Page>
  );
}

/** A player's land: rarity mix, rent rate and each canvas (with its art). */
function LandSection({ land }: { land: PlayerLand }) {
  const nav = useNavigate();
  const counts = RARITY_ORDER.map((r) => [r, land.plots.filter((x) => x[2] === r).length] as const).filter(([, n]) => n > 0);
  const named = land.plots.filter((x) => x[7]);
  const go = (gx: number, gy: number, zoom = Z_HOUSE) => {
    const [lng, lat] = cellCenter(((gx % GRID_SIZE) + GRID_SIZE) % GRID_SIZE, gy);
    useUi.getState().requestFly({ lng, lat, zoom });
    nav('/');
  };
  return (
    <section className="mt-5" data-testid="profile-land">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Land</h2>
        <span className="text-xs text-muted tnum">{fmt(land.total_plots)} plots · earns {formatRate(Number(land.usd_per_second))}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">{counts.map(([r, n]) => <span key={r} className="flex items-center gap-1.5"><RarityBadge r={r} small /><b className="text-sm tnum">{n}</b></span>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {land.canvases.slice(0, 24).map((c) => (
          <button key={c.id} className="glass flex items-center gap-3 rounded-2xl p-2 text-left hover:border-line-strong" onClick={() => go(Math.floor((c.min_gx + c.max_gx) / 2), Math.floor((c.min_gy + c.max_gy) / 2), c.plot_count > 16 ? Z_STREET : Z_HOUSE)}>
            {c.art ? <ArtThumb card={c.art} className="h-16 w-16 shrink-0" /> : <div className="checker h-16 w-16 shrink-0 rounded-2xl opacity-60" />}
            <div className="min-w-0">
              <div className="truncate font-semibold">{c.art?.title ?? c.name}</div>
              <div className="text-xs text-muted">{c.plot_count} plot{c.plot_count === 1 ? '' : 's'} · {c.max_gx - c.min_gx + 1}×{c.max_gy - c.min_gy + 1}{c.art ? '' : ' · not painted yet'}</div>
            </div>
          </button>
        ))}
      </div>
      {named.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {named.slice(0, 30).map((x) => (
            <button key={`${x[0]}_${x[1]}`} className="flex items-center gap-1.5 rounded-xl border border-line px-2 py-1 text-xs font-semibold hover:border-line-strong" onClick={() => go(x[0], x[1], Z_PLOT)}>
              <RarityBadge r={x[2]} small /> {x[7]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
