// The livelier half of a room: a swipeable showcase of every artwork, the people who've
// visited or checked in, and a guestbook visitors can sign.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, MessageSquareHeart, Send, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ArtworkCard } from '../backend/types';
import { useAssetUrl } from '../gallery/GalleryScreen';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Button, PlayerAvatar, inputCls } from '../ui';
import { poll } from '../lib/poll';
import { useNudge } from '../lib/nudge';

/** Every artwork, one at a time: swipe, drag, arrow keys or the arrows. */
export function ArtShowcase({ art }: { art: ArtworkCard[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    const k = Math.max(0, Math.min(art.length - 1, n));
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const on = () => setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  if (!art.length) return null;
  return (
    <section className="mt-6" data-testid="room-showcase" aria-roledescription="carousel">
      <div className="mb-2 flex items-end justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Showcase</h2>
        <span className="text-xs font-bold text-muted tnum">{i + 1} / {art.length}</span>
      </div>
      <div className="relative">
        <div ref={track} tabIndex={0} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-[28px] outline-none [cursor:grab] active:[cursor:grabbing]"
          onKeyDown={(e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}
          onPointerDown={(e) => { if (e.pointerType === 'mouse') drag.current = { x: e.clientX, left: track.current!.scrollLeft }; }}
          onPointerMove={(e) => { if (drag.current) { track.current!.style.scrollSnapType = 'none'; track.current!.scrollLeft = drag.current.left - (e.clientX - drag.current.x); } }}
          onPointerUp={(e) => { if (!drag.current) return; const dx = e.clientX - drag.current.x; drag.current = null; track.current!.style.scrollSnapType = ''; go(dx < -40 ? i + 1 : dx > 40 ? i - 1 : i); }}
          onPointerLeave={() => { if (drag.current) { drag.current = null; track.current!.style.scrollSnapType = ''; go(i); } }}>
          {art.map((a, k) => <Slide key={a.id} a={a} active={k === i} />)}
        </div>
        {i > 0 && <button onClick={() => go(i - 1)} className="glass absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full" aria-label="Previous artwork"><ChevronLeft className="h-5 w-5" /></button>}
        {i < art.length - 1 && <button onClick={() => go(i + 1)} className="glass absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full" aria-label="Next artwork"><ChevronRight className="h-5 w-5" /></button>}
      </div>
      {art.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {art.slice(0, 24).map((a, k) => <button key={a.id} onClick={() => go(k)} aria-label={`Artwork ${k + 1}`} className={cn('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-accent' : 'w-1.5 bg-surface-2')} />)}
        </div>
      )}
    </section>
  );
}

function Slide({ a, active }: { a: ArtworkCard; active: boolean }) {
  const url = useAssetUrl(a.preview_path ?? a.thumb_path);
  return (
    <div className="w-full shrink-0 snap-center px-0.5">
      <motion.div animate={{ scale: active ? 1 : 0.94, opacity: active ? 1 : 0.6 }} className="glass grid gap-3 rounded-[28px] p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end">
        <div className="art-paper flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[22px]">
          {url ? <img src={url} alt={a.title} draggable={false} className="h-full w-full select-none object-contain [image-rendering:pixelated]" /> : <div className="h-full w-full animate-pulse bg-surface-2" />}
        </div>
        <div className="grid gap-1 p-1">
          <div className="font-display text-lg font-semibold">{a.title}</div>
          <div className="text-xs text-muted">{fmt(a.plot_count)} plot{a.plot_count === 1 ? '' : 's'} · {fmt(a.appreciation_count)} inspired · {timeAgo(a.published_at)}</div>
          <Link to={`/art/${a.id}`} className="mt-2 inline-flex h-9 items-center justify-center rounded-xl bg-surface-2 px-3 text-sm font-bold hover:bg-surface">Open artwork</Link>
        </div>
      </motion.div>
    </div>
  );
}

/** Who's been here, and the guestbook. */
export function RoomGuests({ username, hostId }: { username: string; hostId?: string }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['room-social', username], queryFn: () => api.roomSocial(username), refetchInterval: poll(120_000) });
  // the server nudges this room's topic when someone visits, checks in or signs the guestbook
  useNudge(hostId ? `rv:${hostId}` : null, () => q.refetch(), { enabled: !!hostId, immediate: false, safetyMs: poll(120_000), fallbackMs: poll(20_000), gapMs: 2000, trailMs: 3000 });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const d = q.data;
  if (!d) return null;
  const sign = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { qc.setQueryData(['room-social', username], await api.roomNote(username, body.trim())); setBody(''); toast.success('Signed the guestbook'); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-7 grid gap-4 lg:grid-cols-2">
      <section className="glass rounded-3xl p-4" data-testid="room-visitors">
        <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-accent-2" /><h2 className="font-display text-base font-semibold">Recent visitors</h2>
          <span className="ml-auto text-xs text-muted tnum">{fmt(d.visits)} visits · {fmt(d.checkins)} check-ins</span></div>
        {!d.visitors.length ? <p className="text-sm text-muted">No visitors yet — be the first!</p> : (
          <div className="flex flex-wrap gap-2">
            {d.visitors.map((v, k) => (
              <motion.div key={v.player.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(k, 15) * 0.03 }}>
                <Link to={`/u/${v.player.username}/home`} className="flex items-center gap-1.5 rounded-full border border-line bg-surface/50 py-1 pl-1 pr-2.5 text-xs font-semibold hover:border-line-strong" title={`${v.checked_in ? 'Checked in' : 'Visited'} ${timeAgo(v.at)}`}>
                  <PlayerAvatar p={v.player} size={22} />@{v.player.username}{v.checked_in && <span className="text-ok">✓</span>}
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>
      <section className="glass grid content-start gap-3 rounded-3xl p-4" data-testid="room-guestbook">
        <div className="flex items-center gap-2"><MessageSquareHeart className="h-4 w-4 text-hot" /><h2 className="font-display text-base font-semibold">Guestbook</h2></div>
        {me && !d.is_host && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sign(); }}>
            <input className={cn(inputCls, 'min-w-0 flex-1')} maxLength={140} placeholder="Leave a kind note…" value={body} onChange={(e) => setBody(e.target.value)} data-testid="guestbook-input" />
            <Button type="submit" variant="primary" loading={busy} disabled={!body.trim()} aria-label="Sign"><Send className="h-4 w-4" /></Button>
          </form>
        )}
        <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 scroll-thin">
          {!d.notes.length && <p className="text-sm text-muted">{d.is_host ? 'Notes from visitors appear here.' : 'Nobody has signed yet.'}</p>}
          {d.notes.map((n) => (
            <div key={n.id} className="flex items-start gap-2 rounded-2xl bg-surface/50 p-2.5">
              <Link to={`/u/${n.author.username}/home`}><PlayerAvatar p={n.author} size={28} /></Link>
              <div className="min-w-0 flex-1 text-sm"><b>@{n.author.username}</b> <span className="text-xs text-faint">{timeAgo(n.at)}</span><div className="break-words">{n.body}</div></div>
              {(d.is_host || n.mine) && (
                <button onClick={async () => { try { await api.roomNoteDelete(n.id); void q.refetch(); } catch (e) { toast.error(toGameError(e).message); } }} className="rounded-lg p-1 text-faint hover:text-bad" aria-label="Remove note"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
