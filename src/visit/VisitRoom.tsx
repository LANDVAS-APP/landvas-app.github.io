// An artist's room: their explorer, their art on the walls and every canvas of
// land they own, laid out by shape only. Nothing here says where in the world
// any of it is — visitors see the art and the land, never the neighbourhood.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { toGameError } from '../backend/backend';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { Button } from '../ui';
import { ArrowLeft, Brush, CheckCircle2, DoorOpen, Heart, Lock, Sparkles, User } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../backend/api';
import type { ArtworkCard, LandCanvas } from '../backend/types';
import { Page } from '../app/Shell';
import { ExplorerFigure } from '../explorer/ExplorerFigure';
import { LandMosaic } from '../land/LandMosaic';
import { FriendButton } from '../social/FriendButton';
import { useAssetUrl } from '../gallery/GalleryScreen';
import { RarityBadge } from '../plot/RarityBadge';
import { PLOT_TYPES } from '../map/plotStyle';
import { RARITY_ORDER } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import type { PlotTypeId } from '../shared/grid';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Empty, PlayerAvatar, Spinner } from '../ui';

const LIVE_MS = 15_000;

export default function VisitRoom() {
  const { username = '' } = useParams();
  const profile = useQuery({ queryKey: ['profile', username], queryFn: () => api.profileByUsername(username), refetchInterval: LIVE_MS });
  const land = useQuery({ queryKey: ['land', username], queryFn: () => api.playerLand(username), enabled: !!profile.data, refetchInterval: LIVE_MS });
  if (profile.isLoading) return <Page><div className="flex justify-center py-24"><Spinner /></div></Page>;
  if (profile.error || !profile.data) return <Page><Empty title="Room not found">This artist doesn’t exist or isn’t visible to you.</Empty></Page>;
  const d = profile.data;
  const p = d.profile;
  const gallery: ArtworkCard[] = d.gallery ?? [];
  const wall = pickWall(d, gallery);
  const canvases = land.data?.canvases ?? [];
  const updated = Math.max(profile.dataUpdatedAt, land.dataUpdatedAt);
  return (
    <div className="lv-room" style={{ ['--room' as string]: p.accent_color }} data-testid="visit-room">
      <Page wide>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link to={`/u/${p.username}`} className="glass flex h-10 items-center gap-1.5 rounded-2xl px-3 text-sm font-bold text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Profile</Link>
          <span className="lv-live" title={`Updates every ${LIVE_MS / 1000} seconds`} data-testid="room-live"><i /> Live{updated ? ` · ${timeAgo(new Date(updated).toISOString())}` : ''}</span>
          <div className="ml-auto flex items-center gap-2">
            <CheckIn username={p.username} />
            <FriendButton playerId={p.id} username={p.username} />
          </div>
        </div>

        {/* the room itself: a wall of their best work and their explorer on the floor */}
        <section className="lv-room-stage" aria-label={`@${p.username}'s room`}>
          <div className="lv-room-wall">
            <div className="lv-room-sign">
              <PlayerAvatar p={p} size={34} />
              <div className="min-w-0">
                <div className="truncate font-display text-[15px] font-bold leading-tight">{p.display_name || p.username}’s room</div>
                <div className="truncate text-[11.5px] text-white/70">@{p.username} · artist level {d.stats.artist_level}</div>
              </div>
            </div>
            <div className="lv-room-frames">
              {wall.length ? wall.map((a, i) => <WallFrame key={a.id} art={a} className={cn(i === 0 ? 'lv-frame-lg' : 'lv-frame-sm', i === 2 && 'hidden sm:block')} />) : (
                <div className="lv-frame-empty"><Brush className="h-5 w-5" /> A blank wall — no published art yet</div>
              )}
            </div>
          </div>
          <div className="lv-room-floor">
            <div className="lv-room-spot" />
            <ExplorerFigure style={p.explorer_style} accent={p.accent_color} size={78} className="lv-room-explorer" label={`@${p.username}'s explorer`} />
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Plots" value={fmt(land.data?.total_plots ?? d.stats.plots)} />
          <Stat label="Canvases" value={fmt(canvases.length)} />
          <Stat label="Artworks" value={fmt(d.stats.artworks)} />
          <Stat label="Loves" value={fmt(d.stats.appreciations)} />
          <Stat label="Earns" value={land.data ? formatRate(Number(land.data.usd_per_second)) : '—'} className="col-span-2 sm:col-span-1" />
        </div>

        <section className="mt-7">
          <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Their land" note="Every canvas they own, by shape. Where it is stays private." />
          {land.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !canvases.length ? (
            <Empty title="No land yet">@{p.username} hasn’t claimed a plot yet.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="room-canvases">
              {canvases.slice(0, 60).map((c) => <CanvasCard key={c.id} c={c} />)}
            </div>
          )}
          {canvases.length > 60 && <p className="mt-2 text-xs text-muted">and {fmt(canvases.length - 60)} more canvases</p>}
        </section>

        {land.data && land.data.total_plots > 0 && (
          <section className="mt-7">
            <SectionTitle title="Collection" />
            <div className="glass grid gap-4 rounded-3xl p-4 md:grid-cols-2">
              <div>
                <div className="eyebrow mb-2">Rarities</div>
                <div className="flex flex-wrap gap-2">
                  {RARITY_ORDER.filter((r) => land.data!.rarity_counts[r]).map((r) => (
                    <span key={r} className="flex items-center gap-1.5"><RarityBadge r={r} small /><b className="text-sm tnum">{fmt(land.data!.rarity_counts[r]!)}</b></span>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow mb-2">Plot types</div>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(PLOT_TYPES) as PlotTypeId[]).filter((t) => land.data!.type_counts[t]).map((t) => (
                    <span key={t} className="flex items-center gap-1.5 text-sm">
                      <span className="inline-block h-3.5 w-3.5 rounded-[4px]" style={{ background: `linear-gradient(135deg, ${PLOT_TYPES[t].a}, ${PLOT_TYPES[t].b})` }} />
                      <b>{PLOT_TYPES[t].name}</b><span className="tnum text-muted">{fmt(land.data!.type_counts[t]!)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mt-7">
          <SectionTitle icon={<Brush className="h-4 w-4" />} title="Gallery wall" note={gallery.length ? `${fmt(gallery.length)} published` : undefined} />
          {gallery.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="room-gallery">
              {gallery.map((a) => <WallFrame key={a.id} art={a} caption />)}
            </div>
          ) : <Empty icon={<Brush className="h-6 w-6" />} title="Nothing on the walls yet" />}
        </section>

        <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-faint"><Lock className="h-3.5 w-3.5" /> Rooms never show where anyone’s land is. <Link to={`/u/${p.username}`} className="inline-flex items-center gap-1 font-semibold text-muted hover:text-fg"><User className="h-3.5 w-3.5" /> Profile</Link></p>
      </Page>
    </div>
  );
}

/** Up to three pieces for the wall: their featured work, their largest mural, their newest. */
function pickWall(d: any, gallery: ArtworkCard[]): ArtworkCard[] {
  const out: ArtworkCard[] = [];
  for (const a of [d.featured, d.largest_mural, ...gallery]) {
    if (a && !out.some((x) => x.id === a.id)) out.push(a);
    if (out.length === 3) break;
  }
  return out;
}

function WallFrame({ art, className, caption }: { art: ArtworkCard; className?: string; caption?: boolean }) {
  const url = useAssetUrl(art.preview_path ?? art.thumb_path);
  const ratio = art.preview_width && art.preview_height ? art.preview_width / art.preview_height : 1;
  return (
    <Link to={`/art/${art.id}`} className={cn('group block min-w-0', className)} title={art.title}>
      <div className="lv-frame">
        <div className="art-paper overflow-hidden" style={{ aspectRatio: `${Math.max(0.5, Math.min(2.4, ratio))}` }}>
          {url ? <img src={url} alt={art.title} className="h-full w-full object-contain" loading="lazy" /> : <div className="h-full w-full animate-pulse bg-surface-2" />}
        </div>
      </div>
      {caption && (
        <div className="mt-2 px-0.5">
          <div className="truncate text-sm font-bold group-hover:underline">{art.title}</div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{art.plot_count} plot{art.plot_count === 1 ? '' : 's'} · {timeAgo(art.published_at)}</span>
            <span className="flex items-center gap-1 tnum"><Heart className={cn('h-3 w-3', art.appreciated && 'fill-hot text-hot')} />{fmt(art.appreciation_count)}</span>
          </div>
        </div>
      )}
    </Link>
  );
}

function CanvasCard({ c }: { c: LandCanvas }) {
  const named = c.cells.filter((x) => x[6]);
  const best = RARITY_ORDER.slice().reverse().find((r) => c.cells.some((x) => x[2] === r));
  const Body = (
    <>
      <div className="flex min-h-[132px] items-center justify-center rounded-2xl bg-bg-2/70 p-3 shadow-[inset_0_0_0_1px_var(--line)]">
        <LandMosaic canvas={c} size={150} />
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="truncate font-semibold">{c.art?.title ?? c.name}</div>
          <div className="text-xs text-muted">{c.plot_count} plot{c.plot_count === 1 ? '' : 's'} · {c.width}×{c.height}{c.art ? '' : ' · not painted yet'}</div>
        </div>
        {best && best !== 'common' && <RarityBadge r={best} small className="shrink-0" />}
      </div>
      {named.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-0.5">
          {named.slice(0, 6).map((x) => <span key={`${x[0]}_${x[1]}`} className="rounded-lg border border-line px-1.5 py-0.5 text-[11px] font-semibold text-muted">{x[6]}</span>)}
        </div>
      )}
    </>
  );
  return c.art
    ? <Link to={`/art/${c.art.id}`} className="glass block rounded-3xl p-3 transition hover:-translate-y-0.5 hover:border-line-strong">{Body}</Link>
    : <div className="glass rounded-3xl p-3">{Body}</div>;
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('glass rounded-2xl p-3 text-center', className)}>
      <div className="truncate font-display text-[15px] font-semibold tnum">{value}</div>
      <div className="eyebrow !text-[10px]">{label}</div>
    </div>
  );
}

function SectionTitle({ title, note, icon }: { title: string; note?: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">{icon}{title}</h2>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}


/** Check into someone's room: after a short look around, you both earn a little Ink (once a day). */
function CheckIn({ username }: { username: string }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ['room-enter', username], queryFn: () => api.roomEnter(username), enabled: !!me, staleTime: 60_000, retry: false });
  const [wait, setWait] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!st.data || st.data.own || st.data.checked_in) return;
    const until = Date.now() + st.data.stay_seconds * 1000 + 400;
    const tick = () => setWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [st.data]);
  if (!me || !st.data || !st.data.enabled || st.data.own) return null;
  const s = st.data;
  if (s.checked_in) return <span className="glass flex h-10 items-center gap-1.5 rounded-2xl px-3 text-sm font-bold text-ok" data-testid="room-checked-in"><CheckCircle2 className="h-4 w-4" /> Checked in today</span>;
  const pays = s.old_enough && s.paid_today < s.visitor_daily ? s.visitor_ink : 0;
  return (
    <Button size="sm" variant="rainbow" disabled={(wait ?? 1) > 0} loading={busy} data-testid="room-checkin" onClick={async () => {
      setBusy(true);
      try {
        const r = await api.roomCheckin(username);
        toast.success(r.earned > 0 ? `Checked in · +${r.earned} Ink` : 'Checked in', { description: r.host_earned > 0 ? `@${username} earned ${r.host_earned} Ink from your visit.` : s.old_enough ? 'You’ve used today’s paid check-ins.' : 'New accounts earn from check-ins after their first day.' });
        void qc.invalidateQueries({ queryKey: ['room-enter', username] });
        invalidateGame(qc);
      } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
    }}>
      <DoorOpen className="h-4 w-4" /> {(wait ?? 1) > 0 ? `Look around… ${wait ?? ''}` : pays > 0 ? `Check in · +${pays} Ink` : 'Check in'}
    </Button>
  );
}
