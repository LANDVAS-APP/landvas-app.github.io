// /sketch — Sketch of the Day: one word for everyone, 10 minutes to sketch it, then the
// community votes (anonymously) and the top sketches are paid when the day resets.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Clock, Crown, Heart, PenLine, Send, Sparkles, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { SketchToday } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, safeStorage, saveStorage } from '../lib/utils';
import type { Stroke } from '../shared/strokes';
import { Button, Empty, PlayerAvatar, Spinner, useConfirm } from '../ui';
import { confetti, confettiCannons } from '../ui/confetti';
import { SketchPad, StrokeView } from './SketchPad';

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(x).padStart(2, '0')}`;
};
export function useNow(every = 500) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), every); return () => clearInterval(i); }, [every]);
  return t;
}

export default function SketchScreen() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['sketch'], queryFn: api.sketchToday, refetchInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const skew = useMemo(() => (d ? new Date(d.server_time).getTime() - Date.now() : 0), [d]);
  const now = useNow() + skew;
  const set = (v: SketchToday) => qc.setQueryData(['sketch'], v);
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (!d) return <Page><Empty title="Sketch of the Day is unavailable">{q.error ? toGameError(q.error).message : 'Try again in a moment.'}</Empty></Page>;
  const drawing = d.mine && !d.mine.submitted && new Date(d.mine.deadline).getTime() + 45_000 > now;
  const start = async () => {
    if (!(await confirm({ title: `Sketch “${d.word}”?`, body: `You get ${d.minutes} minutes from now, once a day. Make it yours — the most-voted sketches win Ink.`, confirm: 'Start the clock' }))) return;
    setBusy(true);
    try { set(await api.sketchStart()); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <Page>
      <PageHeader eyebrow="One word · one sketch · everyone votes" title={<span className="flex items-center gap-2"><PenLine className="h-7 w-7 text-accent-2" /> Sketch of the Day</span>}>
        Everyone gets the same word. You get {d.minutes} minutes to sketch it, once a day. Vote for your favourites — the top {d.prizes.filter((p) => p > 0).length} are paid when the day resets.
      </PageHeader>
      {!d.enabled && <p className="mb-4 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">Sketch of the Day is taking a break.</p>}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mb-5 overflow-hidden rounded-[28px] border border-accent-2/30 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(52,195,255,0.22),transparent_60%),radial-gradient(120%_120%_at_100%_100%,rgba(255,79,216,0.22),transparent_60%)] p-5" data-testid="sketch-word">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Today’s word</div>
            <div className="font-display text-[clamp(2.2rem,8vw,3.6rem)] font-bold capitalize leading-none">{d.word}</div>
          </div>
          <div className="text-right text-sm">
            <div className="flex items-center justify-end gap-1.5 font-bold"><Clock className="h-4 w-4 text-muted" /> {clock(new Date(d.ends_at).getTime() - now)} left today</div>
            <div className="mt-1 flex flex-wrap justify-end gap-1">{d.prizes.slice(0, 5).map((p, i) => <span key={i} className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold tnum', i === 0 ? 'bg-gold/20 text-gold' : 'bg-surface-2')}>#{i + 1} {fmt(p)}</span>)}{d.prizes.length > 5 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold">+{d.prizes.length - 5} more</span>}</div>
          </div>
        </div>
      </motion.section>

      {me && d.enabled && !d.mine && <Button variant="rainbow" size="lg" className="mb-6 w-full sm:w-auto" loading={busy} onClick={start} data-testid="sketch-start"><PenLine className="h-5 w-5" /> Start my {d.minutes}-minute sketch</Button>}
      {!me && <p className="mb-6 text-sm text-muted">Sign in to sketch and vote.</p>}
      {drawing && d.mine && <Drawing d={d} deadline={new Date(d.mine.deadline).getTime()} now={now} onDone={set} />}
      {d.mine && !drawing && (
        <section className="glass mb-6 flex flex-wrap items-center gap-4 rounded-3xl p-4" data-testid="sketch-mine">
          {d.mine.submitted ? <StrokeView strokes={d.mine.strokes} size={140} /> : <div className="flex h-[140px] w-[140px] items-center justify-center rounded-2xl bg-surface-2 text-center text-xs text-muted">Time ran out before you sent it</div>}
          <div>
            <div className="font-display text-lg font-semibold">{d.mine.submitted ? 'Your sketch is in!' : 'Missed today’s sketch'}</div>
            {d.mine.submitted && <div className="flex items-center gap-1.5 text-sm"><Heart className="h-4 w-4 text-hot" /> <b className="tnum">{d.mine.votes}</b> vote{d.mine.votes === 1 ? '' : 's'} so far</div>}
            <p className="text-xs text-muted">New word in {clock(new Date(d.ends_at).getTime() - now)}.</p>
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Vote for today’s best</h2>
          {me && <span className="text-xs font-bold text-muted tnum">{d.votes_left} of {d.votes_per_player} votes left</span>}
        </div>
        {!d.entries.filter((e) => !e.mine).length ? <Empty icon={<Sparkles className="h-6 w-6" />} title="No sketches yet">Be the first to sketch “{d.word}”.</Empty> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="sketch-entries">
            {d.entries.filter((e) => !e.mine).map((e) => <VoteCard key={e.id} e={e} can={!!me && (e.voted || d.votes_left > 0)} onVote={async (on) => {
              try { set(await api.sketchVote(e.id, on)); } catch (err) { toast.error(toGameError(err).message); }
            }} />)}
          </div>
        )}
      </section>

      {d.yesterday.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><Trophy className="h-5 w-5 text-gold" /> Yesterday’s winners · “{d.yesterday_word}”</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {d.yesterday.map((e) => (
              <div key={e.id} className={cn('glass grid gap-2 rounded-2xl p-2', e.place === 1 && 'ring-2 ring-gold/60')}>
                <div className="relative"><StrokeView strokes={e.strokes} size={180} className="w-full" />
                  <span className={cn('absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold', e.place === 1 ? 'bg-gold text-bg' : 'bg-bg/80')}>{e.place === 1 && <Crown className="h-3 w-3" />}#{e.place}</span></div>
                <div className="flex items-center gap-1.5 px-1 text-xs">{e.artist && <PlayerAvatar p={e.artist} size={20} />}<span className="min-w-0 flex-1 truncate font-semibold">@{e.artist?.username}</span><span className="font-bold text-ok tnum">+{e.prize}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}

function Drawing({ d, deadline, now, onDone }: { d: SketchToday; deadline: number; now: number; onDone(v: SketchToday): void }) {
  const qc = useQueryClient();
  const key = `landvas.sketch.${d.mine!.id}`;
  const [strokes, setStrokes] = useState<Stroke[]>(() => safeStorage<Stroke[]>(key, []));
  const t0 = useRef(performance.now() - (strokes.length ? (strokes[strokes.length - 1].p.at(-1) ?? 0) + 500 : 0));
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  const left = deadline - now;
  const change = (s: Stroke[]) => { setStrokes(s); saveStorage(key, s); };
  const send = async (auto = false) => {
    if (sent.current) return;
    if (strokes.length < 3) { if (!auto) toast('Add a few more strokes first.'); return; }
    sent.current = true;
    setBusy(true);
    try {
      onDone(await api.sketchSubmit(strokes));
      saveStorage(key, null);
      confettiCannons();
      toast.success('Sketch sent — now vote for your favourites!');
      invalidateGame(qc);
    } catch (e) { sent.current = false; toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (left <= 0) void send(true); }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="glass mb-6 grid justify-items-center gap-3 rounded-3xl p-4" data-testid="sketch-drawing">
      <div className="flex w-full items-center justify-between gap-2">
        <div className="font-display text-lg font-semibold capitalize">Sketch: {d.word}</div>
        <div className={cn('rounded-full px-3 py-1 font-display text-lg font-bold tnum', left < 60_000 ? 'bg-hot/20 text-hot' : 'bg-surface-2')}>{clock(left)}</div>
      </div>
      <SketchPad strokes={strokes} onChange={change} t0={t0.current} disabled={left <= 0 || busy} />
      <Button variant="rainbow" size="lg" loading={busy} onClick={() => void send()} data-testid="sketch-submit"><Send className="h-4 w-4" /> Send my sketch</Button>
    </section>
  );
}

function VoteCard({ e, can, onVote }: { e: SketchToday['entries'][number]; can: boolean; onVote(on: boolean): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={cn('glass grid gap-2 rounded-2xl p-2', e.voted && 'ring-2 ring-hot/60')}>
      <StrokeView strokes={e.strokes} size={200} className="w-full" />
      <button disabled={!can || busy} onClick={async (ev) => {
        setBusy(true);
        if (!e.voted) confetti({ x: ev.clientX, y: ev.clientY, count: 24, power: 0.5, colors: ['#FF4D6D', '#FF4FD8', '#FFE14D'] });
        await onVote(!e.voted);
        setBusy(false);
      }} className={cn('flex h-9 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition disabled:opacity-40', e.voted ? 'bg-hot text-white' : 'bg-surface-2 hover:bg-hot/20')} data-testid="sketch-vote">
        <Heart className={cn('h-4 w-4', e.voted && 'fill-current')} /> {e.voted ? 'Voted' : 'Vote'}
      </button>
    </div>
  );
}

