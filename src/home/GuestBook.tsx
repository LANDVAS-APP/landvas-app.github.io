// The guestbook: a real book. It opens with the cover swinging back, the pages turn like paper, and visitors
// sign it in handwriting (with a sticker if they like). On a phone it's one page at a time; wider, a full spread.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { BookDrawing, RoomSocial } from '../backend/types';
import { DrawPad, DrawingView } from './DrawPad';
import { sfx } from '../arcade/sfx';
import { cn, timeAgo } from '../lib/utils';
import { PlayerAvatar } from '../ui';
import { poll } from '../lib/poll';

const HAND = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", "Marker Felt", cursive';
const STICKERS = ['💖', '🌟', '🎨', '🌈', '🐾', '🍰', '🎉', '🌻', '🕹️', '👋'];
const PER_PAGE = 2;
type Page = { kind: 'cover-in' } | { kind: 'sign' } | { kind: 'notes'; notes: RoomSocial['notes']; n: number } | { kind: 'visitors' } | { kind: 'end' };

export function GuestBook({ username, hostName, own, onClose }: { username: string; hostName: string; own: boolean; onClose(): void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['room-social', username], queryFn: () => api.roomSocial(username), refetchInterval: poll(60_000) });
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(0);
  const [flip, setFlip] = useState<null | { dir: 1 | -1; from: number }>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= 700);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 700); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  useEffect(() => { const t = setTimeout(() => { setOpen(true); sfx.blip?.(6); }, 350); return () => clearTimeout(t); }, []);
  const d = q.data;
  const pages: Page[] = useMemo(() => {
    const out: Page[] = [{ kind: 'cover-in' }, { kind: 'sign' }];
    const notes = d?.notes ?? [];
    for (let i = 0; i < Math.max(1, Math.ceil(notes.length / PER_PAGE)); i++) out.push({ kind: 'notes', notes: notes.slice(i * PER_PAGE, (i + 1) * PER_PAGE), n: i });
    out.push({ kind: 'visitors' });
    if (wide && out.length % 2) out.push({ kind: 'end' });
    return out;
  }, [d, wide]);
  const per = wide ? 2 : 1;
  const last = Math.ceil(pages.length / per) - 1;
  const at = Math.min(spread, last);
  const go = (dir: 1 | -1) => {
    if (flip) return; const to = at + dir; if (to < 0 || to > last) return;
    setFlip({ dir, from: at }); sfx.blip?.(dir > 0 ? 9 : 7);
    setTimeout(() => { setSpread(to); setFlip(null); }, 620);
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });

  const pageOf = (i: number): ReactNode => {
    const p = pages[i]; if (!p) return <Paper />;
    if (p.kind === 'cover-in') return <Paper><div className="grid h-full place-content-center gap-3 text-center" style={{ fontFamily: HAND }}>
      <div className="text-5xl">🏠</div><div className="text-3xl font-bold text-[#5C3A21]">Welcome to</div><div className="text-2xl text-[#3E5C76]">{hostName}’s home</div>
      <div className="mx-auto mt-2 h-px w-24 bg-[#C9B79C]" />
      <div className="text-sm text-[#8C7A66]">{d ? `${d.visits} visit${d.visits === 1 ? '' : 's'} · ${d.notes.length} note${d.notes.length === 1 ? '' : 's'}` : '…'}</div>
      <div className="text-xs text-[#B5A48E]">turn the page →</div></div></Paper>;
    if (p.kind === 'sign') return <Paper><SignPage username={username} own={own} onSigned={(r) => { qc.setQueryData(['room-social', username], r); }} /></Paper>;
    if (p.kind === 'notes') return <Paper n={p.n + 1}>
      {!p.notes.length ? <div className="grid h-full place-content-center text-center text-[#8C7A66]" style={{ fontFamily: HAND }}><div className="text-4xl">🖋️</div><div className="text-lg">No notes yet — be the first!</div></div>
        : <div className="grid gap-4">{p.notes.map((n, k) => <Note key={n.id} n={n} k={k} canDelete={n.mine || !!d?.is_host} onDeleted={() => void qc.invalidateQueries({ queryKey: ['room-social', username] })} />)}</div>}
    </Paper>;
    if (p.kind === 'visitors') return <Paper><div style={{ fontFamily: HAND }}>
      <div className="mb-3 text-2xl font-bold text-[#5C3A21]">Who’s been by</div>
      <div className="grid gap-2">{(d?.visitors ?? []).slice(0, 8).map((v) => (
        <Link key={v.player.id} to={`/u/${v.player.username}/home`} className="flex items-center gap-2 text-[#3B2A20]"><PlayerAvatar p={v.player} size={26} /><span className="flex-1 truncate text-lg">@{v.player.username}</span><span className="text-xs text-[#8C7A66]">{v.checked_in ? '✓ ' : ''}{timeAgo(v.at)}</span></Link>
      ))}{!d?.visitors.length && <div className="text-[#8C7A66]">Nobody yet!</div>}</div></div></Paper>;
    return <Paper><div className="grid h-full place-content-center text-center text-4xl opacity-40">❦</div></Paper>;
  };

  const L = at * per, R = L + 1;
  const nextL = (at + (flip?.dir ?? 0)) * per;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-3 backdrop-blur-[2px]" onClick={onClose} data-testid="guestbook">
      <div className="relative" onClick={(e) => e.stopPropagation()} style={{ perspective: 1800 }}>
        <button onClick={onClose} className="absolute -right-2 -top-10 rounded-full bg-white/15 p-2 text-white" aria-label="Close the guestbook" data-testid="guestbook-close"><X className="h-5 w-5" /></button>
        {/* the book */}
        <div className="relative rounded-[18px] bg-[#6B2E2E] p-2.5 shadow-[0_30px_60px_rgba(0,0,0,0.6)]" style={{ width: wide ? 'min(94vw, 820px)' : 'min(92vw, 400px)', height: wide ? 'min(78vh, 540px)' : 'min(74vh, 560px)' }}>
          <div className={cn('relative grid h-full', wide ? 'grid-cols-2' : 'grid-cols-1')} style={{ transformStyle: 'preserve-3d' }}>
            {/* underneath: what you'll see when the flip is done */}
            {wide ? <>
              <div className="relative h-full">{pageOf(flip?.dir === -1 ? nextL : L)}</div>
              <div className="relative h-full">{pageOf(flip?.dir === 1 ? nextL + 1 : R)}</div>
            </> : <div className="relative h-full">{pageOf(flip ? nextL : L)}</div>}
            {wide && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-10 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/20 to-transparent" />}
            {/* the turning leaf */}
            {flip && (
              <motion.div className="absolute inset-y-0" style={{ transformStyle: 'preserve-3d', transformOrigin: flip.dir === 1 ? 'left center' : 'right center', left: wide ? (flip.dir === 1 ? '50%' : 0) : 0, width: wide ? '50%' : '100%' }}
                initial={{ rotateY: 0 }} animate={{ rotateY: flip.dir === 1 ? -180 : 180 }} transition={{ duration: 0.6, ease: [0.45, 0.05, 0.3, 1] }}>
                <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>{pageOf(wide ? (flip.dir === 1 ? R : L) : L)}<Shade /></div>
                <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>{pageOf(wide ? (flip.dir === 1 ? nextL : nextL + 1) : nextL)}<Shade /></div>
              </motion.div>
            )}
            {/* the cover, swinging open */}
            <AnimatePresence>
              {!open && (
                <motion.div className="absolute inset-y-0 right-0 z-10" style={{ width: wide ? '50%' : '100%', transformOrigin: 'left center', transformStyle: 'preserve-3d' }}
                  exit={{ rotateY: -170, opacity: 0.2 }} transition={{ duration: 0.9, ease: [0.45, 0.05, 0.3, 1] }}>
                  <Cover hostName={hostName} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* ribbon */}
          <div className="absolute -bottom-6 left-[58%] h-10 w-4 bg-[#C9A227] [clip-path:polygon(0_0,100%_0,100%_100%,50%_75%,0_100%)]" />
        </div>
        <div className="mt-8 flex items-center justify-center gap-4 text-white">
          <button onClick={() => go(-1)} disabled={at === 0 || !!flip} className="rounded-full bg-white/15 p-2.5 disabled:opacity-30" aria-label="Previous page" data-testid="guestbook-prev"><ChevronLeft className="h-5 w-5" /></button>
          <span className="text-sm tabular-nums text-white/70">{at + 1} / {last + 1}</span>
          <button onClick={() => go(1)} disabled={at === last || !!flip} className="rounded-full bg-white/15 p-2.5 disabled:opacity-30" aria-label="Next page" data-testid="guestbook-next"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  );
}

const Shade = () => <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/5" />;
function Paper({ children, n }: { children?: ReactNode; n?: number }) {
  return (
    <div className="relative h-full overflow-hidden rounded-[10px] bg-[#FBF5E6] p-5 shadow-[inset_0_0_30px_rgba(120,90,50,0.18)]"
      style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 29px, rgba(62,92,118,0.13) 29px 30px)', backgroundPositionY: 18 }}>
      <div className="absolute inset-y-0 left-9 w-px bg-[#E8A0A0]/50" />
      <div className="relative h-full overflow-y-auto pl-5">{children}</div>
      {n != null && <div className="absolute bottom-2 right-4 text-xs text-[#B5A48E]" style={{ fontFamily: HAND }}>{n}</div>}
    </div>
  );
}
function Cover({ hostName }: { hostName: string }) {
  return (
    <div className="grid h-full place-content-center rounded-[10px] border-4 border-[#C9A227]/60 bg-gradient-to-br from-[#8B3A3A] to-[#5A2323] text-center shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" style={{ backfaceVisibility: 'hidden' }}>
      <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border-2 border-[#E9C46A] text-3xl">🏠</div>
      <div className="font-display text-3xl font-black tracking-wide text-[#E9C46A] [text-shadow:0_2px_0_rgba(0,0,0,0.4)]">Check-in Book</div>
      <div className="mt-1 text-sm text-[#E9C46A]/80" style={{ fontFamily: HAND }}>{hostName}’s home</div>
    </div>
  );
}
function Note({ n, k, canDelete, onDeleted }: { n: RoomSocial['notes'][number]; k: number; canDelete: boolean; onDeleted(): void }) {
  const fresh = Date.now() - Date.parse(n.at) < 15_000;
  const tilt = [-1.2, 0.8, -0.4][k % 3];
  return (
    <div className="group relative" style={{ transform: `rotate(${tilt}deg)`, fontFamily: HAND }} data-testid="guestbook-note">
      <motion.p initial={fresh ? { clipPath: 'inset(0 100% 0 0)' } : false} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 1.4, ease: 'linear' }}
        className="whitespace-pre-wrap break-words text-[19px] leading-[30px] text-[#1F3A5F]">{n.body}</motion.p>
      {n.drawing?.s?.length ? <DrawingView d={n.drawing} className="mt-1 max-w-[260px] shadow-sm" /> : null}
      <div className="mt-1 flex items-center gap-1.5 text-sm text-[#8C7A66]"><PlayerAvatar p={n.author} size={18} /> — @{n.author.username}, {timeAgo(n.at)}
        {canDelete && <button className="ml-auto text-xs text-[#B5485D] opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Remove note"
          onClick={async () => { try { await api.roomNoteDelete(n.id); onDeleted(); } catch (e) { toast.error(toGameError(e).message); } }}>remove</button>}
      </div>
    </div>
  );
}
/** sign a check-in book: a note, or a drawing (or both) */
export function SignForm({ username, onSigned, compact }: { username: string; onSigned(r: RoomSocial): void; compact?: boolean }) {
  const [mode, setMode] = useState<'note' | 'draw'>('note');
  const [body, setBody] = useState('');
  const [drawing, setDrawing] = useState<BookDrawing | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = !!body.trim() || !!drawing;
  const sign = async () => {
    if (!ready) return; setBusy(true);
    try { onSigned(await api.roomNote(username, body.trim(), drawing)); setBody(''); setDrawing(null); toast.success(drawing ? 'Drew in the book 🎨' : 'Signed the book ✍️'); sfx.coin(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2" style={{ fontFamily: HAND }} data-testid="sign-form">
      <div className="flex gap-1">
        {(['note', 'draw'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={cn('rounded-full px-3 py-1 text-base', mode === m ? 'bg-[#3E5C76] text-white' : 'bg-[#F0E4C8] text-[#5C3A21]')} data-testid={`sign-mode-${m}`}>{m === 'note' ? '✍️ Note' : '🎨 Drawing'}</button>
        ))}
      </div>
      {mode === 'note' ? (
        <>
          <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 140))} rows={compact ? 3 : 4} placeholder="Write something nice…" data-testid="guestbook-input"
            className="w-full resize-none rounded-lg bg-transparent text-[19px] leading-[30px] text-[#1F3A5F] outline-none placeholder:text-[#B5A48E]" style={{ fontFamily: HAND }} />
          <div className="flex flex-wrap gap-1">{STICKERS.map((s) => <button key={s} onClick={() => setBody((b) => (b + s).slice(0, 140))} className="rounded-lg px-1 text-xl hover:bg-[#F0E4C8]" aria-label={`Add ${s}`}>{s}</button>)}</div>
        </>
      ) : <DrawPad onChange={setDrawing} />}
      <div className="flex items-center justify-between"><span className="text-sm text-[#B5A48E]">{mode === 'note' ? `${140 - body.length} left` : drawing ? 'Looking good!' : 'Draw something'}{mode === 'note' && drawing ? ' · + your drawing' : ''}</span>
        <button onClick={sign} disabled={busy || !ready} className="rounded-full bg-[#3E5C76] px-5 py-1.5 text-lg text-white shadow disabled:opacity-40" data-testid="guestbook-sign">{busy ? '…' : 'Sign ✍️'}</button></div>
    </div>
  );
}

/** checking in: the book opens at a fresh page for your note or drawing */
export function SignBookDialog({ username, hostName, onSigned, onClose }: { username: string; hostName: string; onSigned(r: RoomSocial): void; onClose(): void }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-3 backdrop-blur-[2px]" onClick={onClose} data-testid="sign-book">
      <div className="relative w-[min(94vw,460px)] rounded-[18px] bg-[#6B2E2E] p-2.5 shadow-[0_30px_60px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -right-2 -top-10 rounded-full bg-white/15 p-2 text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        <div className="rounded-[10px] bg-[#FBF5E6] p-4 shadow-[inset_0_0_30px_rgba(120,90,50,0.18)]">
          <div className="mb-1 text-2xl font-bold text-[#5C3A21]" style={{ fontFamily: HAND }}>📖 Check in at {hostName}’s</div>
          <p className="mb-2 text-base text-[#8C7A66]" style={{ fontFamily: HAND }}>To check in, leave a note or a drawing in their book.</p>
          <SignForm username={username} onSigned={onSigned} compact />
        </div>
      </div>
    </div>
  );
}

function SignPage({ username, own, onSigned }: { username: string; own: boolean; onSigned(r: RoomSocial): void }) {
  return (
    <div className="grid gap-3" style={{ fontFamily: HAND }}>
      <div className="text-2xl font-bold text-[#5C3A21]">{own ? 'Your check-in book' : 'Sign the book'}</div>
      {own ? <p className="text-lg leading-[30px] text-[#3B2A20]">Visitors check in by leaving you a note or a drawing here. Turn the page to see them →</p>
        : <SignForm username={username} onSigned={onSigned} />}
    </div>
  );
}
