// /duet — Duets: two players each paint half of a picture without seeing the other half
// (the bottom painter only sees where the top half's lines end), then it's revealed to both.
// /duet/:id shows a finished duet to anyone with the link.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, EyeOff, Send, Share2, Sparkles, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Duet, DuetPublic } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, safeStorage, saveStorage, timeAgo } from '../lib/utils';
import { drawStrokes, type Stroke } from '../shared/strokes';
import { Button, Empty, PlayerAvatar, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { SketchPad, StrokeView } from './SketchPad';

const TOP = { y0: 0, y1: 500 }, BOTTOM = { y0: 500, y1: 1000 };

/** The two halves together. */
export function DuetView({ top, bottom, size = 300, className }: { top: Stroke[] | null; bottom: Stroke[] | null; size?: number; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-white', className)} style={{ width: size, height: size }}>
      <StrokeView strokes={top} size={size} clip={TOP} className="absolute inset-0 !rounded-none" />
      <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: size / 2 }}>
        <div style={{ marginTop: -size / 2 }}><StrokeView strokes={bottom} size={size} clip={BOTTOM} className="!rounded-none" /></div>
      </div>
    </div>
  );
}

export default function DuetScreen() {
  const { id } = useParams();
  if (id) return <PublicDuet id={id} />;
  return <DuetHome />;
}

function DuetHome() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['duets'], queryFn: api.duetsMine, enabled: !!me, refetchInterval: 20_000 });
  const recent = useQuery({ queryKey: ['duets-recent'], queryFn: () => api.duetsRecent(12) });
  const [cur, setCur] = useState<Duet | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Duet | null>(null);
  if (!me || q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const d = q.data;
  const start = async () => {
    setBusy(true);
    try { setCur(await api.duetStart()); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <Page>
      <PageHeader eyebrow="Two painters · one picture" title={<span className="flex items-center gap-2"><Users className="h-7 w-7 text-hot" /> Duets</span>}>
        You paint one half of a picture, a random partner paints the other — neither sees the other’s half until it’s done. The results are wonderfully weird. Finishing one pays you both {d?.complete_ink ?? 8} Ink.
      </PageHeader>
      {d && !d.enabled && <p className="mb-4 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">Duets are taking a break.</p>}
      {cur ? <Painting d={cur} onDone={(x) => { setCur(null); void qc.invalidateQueries({ queryKey: ['duets'] }); invalidateGame(qc); if (x.status === 'done') { setReveal(x); confettiCannons(); } else toast.success('Your half is in — we’ll reveal it when your partner finishes.'); }} /> : (
        <section className="glass mb-6 grid justify-items-center gap-3 rounded-3xl p-6 text-center">
          <EyeOff className="h-10 w-10 text-accent-2" />
          <p className="max-w-sm text-sm text-muted">{d?.waiting ? `${d.waiting} half-finished duet${d.waiting === 1 ? ' is' : 's are'} waiting for a partner — you’ll paint the bottom half.` : 'You’ll paint the top half; the next player paints the bottom.'}</p>
          <Button variant="rainbow" size="lg" loading={busy} onClick={start} data-testid="duet-start">{d?.waiting ? 'Finish a duet' : 'Start a duet'}</Button>
        </section>
      )}
      <AnimatePresence>
        {reveal && <Reveal d={reveal} onClose={() => setReveal(null)} />}
      </AnimatePresence>
      {!!d?.duets.length && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Your duets</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="duet-list">
            {d.duets.map((x) => (
              <button key={x.id} onClick={() => (x.status === 'done' ? setReveal(x) : x.status === 'top' || x.status === 'bottom' ? setCur(x) : undefined)} className="glass grid gap-1.5 rounded-2xl p-2 text-left">
                {x.status === 'done' ? <DuetView top={x.top} bottom={x.bottom} size={180} className="w-full" /> : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-surface-2 p-3 text-center text-xs text-muted">
                    {x.status === 'waiting' ? 'Waiting for a partner to paint the bottom half…' : x.status === 'expired' ? 'Nobody finished this one' : 'Tap to keep painting'}
                  </div>
                )}
                <div className="px-1 text-sm font-semibold capitalize">{x.prompt}</div>
                <div className="px-1 text-[11px] text-muted">{x.status === 'done' && x.partner ? `with @${x.partner.username}` : x.status} · {timeAgo(x.done_at ?? x.created_at)}</div>
              </button>
            ))}
          </div>
        </section>
      )}
      {!!recent.data?.length && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="h-5 w-5 text-gold" /> Fresh duets</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recent.data.map((x) => x && (
              <Link key={x.id} to={`/duet/${x.id}`} className="glass grid gap-1 rounded-2xl p-2">
                <DuetView top={x.top} bottom={x.bottom} size={150} className="w-full" />
                <div className="truncate px-1 text-xs font-semibold capitalize">{x.prompt}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}

function Painting({ d, onDone }: { d: Duet; onDone(d: Duet): void }) {
  const key = `landvas.duet.${d.id}`;
  const [strokes, setStrokesRaw] = useState<Stroke[]>(() => safeStorage<Stroke[] | null>(key, null) ?? (d.half === 'top' ? d.top : d.bottom) ?? []);
  const setStrokes = (s: Stroke[]) => { setStrokesRaw(s); saveStorage(key, s); };
  const [busy, setBusy] = useState(false);
  const t0 = useRef(performance.now());
  const top = d.half === 'top';
  // the bottom painter sees a thin band where the top half ends
  const edge = (g: CanvasRenderingContext2D, size: number) => {
    if (top || !d.edge) return;
    g.save();
    g.beginPath();
    g.rect(0, size * 0.44, size, size * 0.06);
    g.clip();
    drawStrokes(g, d.edge, size);
    g.restore();
    g.fillStyle = 'rgba(11,18,48,0.85)';
    g.fillRect(0, 0, size, size * 0.44);
  };
  const send = async () => {
    if (strokes.length < 2) { toast('Paint a little more first.'); return; }
    setBusy(true);
    try { const r = await api.duetSubmit(d.id, strokes); saveStorage(key, null); onDone(r); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <section className="glass mb-6 grid justify-items-center gap-3 rounded-3xl p-4" data-testid="duet-painting">
      <div className="text-center">
        <div className="eyebrow">{top ? 'Top half' : 'Bottom half'}</div>
        <div className="font-display text-xl font-semibold capitalize">Paint {top ? 'the top' : 'the bottom'} of {d.prompt}</div>
        <p className="text-xs text-muted">{top ? 'Head, shoulders, the top of it — end your lines at the middle so your partner can carry on.' : 'Only the edge of the top half is showing. Carry those lines on into the bottom half.'}</p>
      </div>
      <SketchPad strokes={strokes} onChange={setStrokes} t0={t0.current} disabled={busy} clip={top ? { y0: 0, y1: 520 } : { y0: 480, y1: 1000 }} underlay={edge} size={440} testid="duet-pad" />
      <Button variant="rainbow" loading={busy} onClick={() => void send()} data-testid="duet-submit"><Send className="h-4 w-4" /> {top ? 'Send my half' : 'Finish & reveal'}</Button>
    </section>
  );
}

function shareDuet(id: string) {
  const url = `${location.origin}/duet/${id}`;
  return async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Our LANDVAS duet', text: 'We each painted half without seeing the other — look what happened:', url });
      else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    } catch { /* cancelled */ }
  };
}

function Reveal({ d, onClose }: { d: Duet; onClose(): void }) {
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} data-testid="duet-reveal">
      <motion.div className="glass grid justify-items-center gap-3 rounded-[28px] p-5" initial={{ scale: 0.8, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-xl font-bold capitalize">{d.prompt} — revealed!</div>
        <div className="relative" style={{ width: 'min(80vw, 360px)', height: 'min(80vw, 360px)' }}>
          <motion.div className="absolute inset-0" initial={{ clipPath: 'inset(0 0 50% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} transition={{ delay: 0.5, duration: 0.9, ease: 'easeOut' }}>
            <DuetView top={d.top} bottom={d.bottom} size={Math.min(360, Math.round(innerWidth * 0.8))} />
          </motion.div>
        </div>
        {d.partner && <div className="flex items-center gap-2 text-sm"><PlayerAvatar p={d.partner} size={24} /> painted with @{d.partner.username}</div>}
        {d.ink > 0 && <div className="text-sm font-bold text-gold">+{d.ink} Ink each</div>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={shareDuet(d.id)}><Share2 className="h-4 w-4" /> Share</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PublicDuet({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['duet', id], queryFn: () => api.duetPublic(id) });
  const d: DuetPublic | null | undefined = q.data;
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (!d) return <Page><Empty title="This duet isn’t finished yet">Come back once both halves are painted.</Empty></Page>;
  return (
    <Page>
      <div className="grid justify-items-center gap-4 py-4 text-center">
        <div className="eyebrow">A LANDVAS duet</div>
        <h1 className="font-display text-3xl font-bold capitalize">{d.prompt}</h1>
        <p className="max-w-md text-sm text-muted">Two artists each painted half without seeing the other’s.</p>
        <DuetView top={d.top} bottom={d.bottom} size={Math.min(420, Math.round(innerWidth - 32))} />
        <div className="flex flex-wrap justify-center gap-3">{d.painters.map((p) => p && <Link key={p.id} to={`/u/${p.username}`} className="flex items-center gap-2 text-sm font-semibold"><PlayerAvatar p={p} size={28} />@{p.username}</Link>)}</div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={shareDuet(d.id)}><Copy className="h-4 w-4" /> Share</Button>
          <Link to="/duet" className="lv-cta inline-flex h-10 items-center rounded-xl px-4 text-sm font-extrabold text-white">Paint a duet</Link>
        </div>
      </div>
    </Page>
  );
}
