// /doodle — Draw & Guess: draw a word for other players, or race to guess theirs from the
// replay. The faster the guess, the more the guesser earns; the drawer earns for each of the
// first players who get it. Everyone stays anonymous.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Brush, Clock, Eye, Lightbulb, Send, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { DoodleGuess } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, timeAgo } from '../lib/utils';
import type { Stroke } from '../shared/strokes';
import { Button, Empty, Spinner, Tabs, inputCls } from '../ui';
import { confetti, confettiCannons } from '../ui/confetti';
import { SketchPad, StrokeView } from './SketchPad';
import { clock, useNow } from './SketchScreen';

export default function DoodleScreen() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['doodle'], queryFn: api.doodleMine, enabled: !!me, refetchInterval: 30_000 });
  const [tab, setTab] = useState<'guess' | 'draw'>('guess');
  if (!me || q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const d = q.data;
  return (
    <Page>
      <PageHeader eyebrow="Anonymous · everyone earns" title={<span className="flex items-center gap-2"><Lightbulb className="h-7 w-7 text-gold" /> Draw &amp; Guess</span>}>
        Draw a word for other players, or race to guess theirs as the drawing replays. Guessers earn up to {d?.guesser_ink ?? 8} Ink for a fast guess; drawers earn {d?.drawer_ink ?? 4} Ink each time one of the first players gets it.
      </PageHeader>
      {d && !d.enabled && <p className="mb-4 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">Draw &amp; Guess is taking a break.</p>}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'guess' | 'draw')} items={[{ value: 'guess', label: `Guess${d?.open ? ` (${d.open})` : ''}` }, { value: 'draw', label: 'Draw' }]} className="mb-4" />
      {tab === 'guess' ? <Guess /> : <Draw />}
      {d && (
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <span className="glass rounded-full px-3 py-1.5 tnum">{fmt(d.stats.guessed)} guessed of {fmt(d.stats.tried)}</span>
          <span className="glass rounded-full px-3 py-1.5 font-bold text-ok tnum">+{fmt(d.stats.ink)} Ink from guessing</span>
        </div>
      )}
      {d && d.drawings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold">Your drawings</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {d.drawings.map((x) => (
              <div key={x.id} className="glass grid gap-1 rounded-2xl p-2">
                <StrokeView strokes={x.strokes} size={160} className="w-full" />
                <div className="px-1 text-sm font-semibold capitalize">{x.word}</div>
                <div className="px-1 text-[11px] text-muted tnum">{x.solved}/{x.guesses} guessed · +{x.ink} Ink · {timeAgo(x.created_at)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}

function Guess() {
  const qc = useQueryClient();
  const [g, setG] = useState<DoodleGuess | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState<string[]>([]);
  const [result, setResult] = useState<{ correct: boolean; word?: string | null; ink: number; ms?: number } | null>(null);
  const [skew, setSkew] = useState(0);
  const now = useNow(250) + skew;
  const start = async () => {
    setBusy(true);
    try {
      const r = await api.doodleGuessStart();
      setSkew(new Date(r.server_time).getTime() - Date.now());
      setG(r); setResult(null); setWrong([]); setText('');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const left = g ? new Date(g.started_at).getTime() + g.guess_seconds * 1000 - now : 0;
  const send = async () => {
    if (!g || !text.trim()) return;
    const guess = text.trim();
    setText('');
    try {
      const r = await api.doodleGuess(g.doodle_id, guess);
      if (r.correct) { setResult(r); confettiCannons(); invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['doodle'] }); }
      else if (r.over) setResult(r);
      else setWrong((w) => [guess, ...w]);
    } catch (e) { toast.error(toGameError(e).message); }
  };
  if (!g) return (
    <section className="glass grid justify-items-center gap-3 rounded-3xl p-6 text-center">
      <Eye className="h-10 w-10 text-accent-2" />
      <p className="max-w-sm text-sm text-muted">A drawing replays stroke by stroke. Type what it is — the sooner you get it, the more you earn.</p>
      <Button variant="rainbow" size="lg" loading={busy} onClick={start} data-testid="doodle-guess-start">Guess a drawing</Button>
    </section>
  );
  return (
    <section className="glass grid justify-items-center gap-3 rounded-3xl p-4" data-testid="doodle-guessing">
      <div className="flex w-full items-center justify-between gap-2">
        <div className="font-display text-lg font-semibold tracking-[0.3em]">{result?.word ? result.word.toUpperCase() : g.shape.split('').join(' ')}</div>
        {!result && <div className={cn('flex items-center gap-1 rounded-full px-3 py-1 font-display font-bold tnum', left < 10_000 ? 'bg-hot/20 text-hot' : 'bg-surface-2')}><Clock className="h-4 w-4" />{clock(left)}</div>}
      </div>
      <StrokeView strokes={g.strokes} size={360} replay speed={1.15} className="max-w-full" testid="doodle-replay" />
      {result ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-2 text-center" data-testid="doodle-result">
          <div className={cn('font-display text-2xl font-bold', result.correct ? 'text-ok' : 'text-muted')}>{result.correct ? `Got it in ${((result.ms ?? 0) / 1000).toFixed(1)}s!` : `It was “${result.word}”`}</div>
          {result.ink > 0 && <div className="font-bold text-gold">+{result.ink} Ink</div>}
          <Button variant="primary" onClick={start} loading={busy} data-testid="doodle-next"><Shuffle className="h-4 w-4" /> Next drawing</Button>
        </motion.div>
      ) : (
        <form className="flex w-full max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input className={cn(inputCls, 'min-w-0 flex-1')} placeholder="Your guess…" value={text} onChange={(e) => setText(e.target.value)} autoFocus autoComplete="off" maxLength={40} data-testid="doodle-input" />
          <Button type="submit" variant="primary" data-testid="doodle-send"><Send className="h-4 w-4" /></Button>
        </form>
      )}
      {!result && wrong.length > 0 && <div className="flex flex-wrap justify-center gap-1">{wrong.map((w, i) => <span key={i} className="rounded-full bg-bad/15 px-2 py-0.5 text-xs text-bad line-through">{w}</span>)}<span className="text-xs text-muted">· {8 - wrong.length} tries left</span></div>}
    </section>
  );
}

function Draw() {
  const qc = useQueryClient();
  const [s, setS] = useState<{ doodle_id: string; choices: string[]; draw_seconds: number; started: number } | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const t0 = useRef(0);
  const now = useNow(250);
  const left = s && choice ? s.started + s.draw_seconds * 1000 - now : 0;
  const start = async () => {
    setBusy(true);
    try { const r = await api.doodleDrawStart(); setS({ ...r, started: 0 }); setChoice(null); setStrokes([]); setSent(null); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!s || !choice) return;
    if (strokes.length < 3) { toast('Draw a little more first.'); return; }
    setBusy(true);
    try {
      const r = await api.doodleDrawSubmit(s.doodle_id, choice, strokes);
      setSent(r.word); setS(null); confetti();
      void qc.invalidateQueries({ queryKey: ['doodle'] });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (s && choice && left <= 0 && !busy) void submit(); }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return (
    <section className="glass grid justify-items-center gap-3 rounded-3xl p-6 text-center">
      <Brush className="h-10 w-10 text-accent" />
      {sent ? <p className="text-sm"><b>“{sent}”</b> is out there — you earn when players guess it.</p> : <p className="max-w-sm text-sm text-muted">Pick one of three words and draw it. No letters or numbers — make it guessable!</p>}
      <Button variant="rainbow" size="lg" loading={busy} onClick={start} data-testid="doodle-draw-start">{sent ? 'Draw another' : 'Draw a word'}</Button>
    </section>
  );
  if (!choice) return (
    <section className="glass grid justify-items-center gap-3 rounded-3xl p-6 text-center" data-testid="doodle-choices">
      <div className="font-display text-lg font-semibold">Pick a word to draw</div>
      <div className="flex flex-wrap justify-center gap-2">
        {s.choices.map((w, i) => <Button key={w} variant="secondary" size="lg" className="capitalize" onClick={() => { setChoice(i + 1); t0.current = performance.now(); setS({ ...s, started: Date.now() }); }} data-testid="doodle-choice">{w}</Button>)}
      </div>
      <p className="text-xs text-muted">You’ll have {s.draw_seconds} seconds.</p>
    </section>
  );
  return (
    <section className="glass grid justify-items-center gap-3 rounded-3xl p-4" data-testid="doodle-drawing">
      <div className="flex w-full items-center justify-between gap-2">
        <div className="font-display text-lg font-semibold capitalize">Draw: {s.choices[choice - 1]}</div>
        <div className={cn('rounded-full px-3 py-1 font-display font-bold tnum', left < 10_000 ? 'bg-hot/20 text-hot' : 'bg-surface-2')}>{clock(left)}</div>
      </div>
      <SketchPad strokes={strokes} onChange={setStrokes} t0={t0.current} disabled={busy || left <= 0} size={420} testid="doodle-pad" />
      <Button variant="rainbow" loading={busy} onClick={() => void submit()} data-testid="doodle-submit"><Send className="h-4 w-4" /> Send it</Button>
    </section>
  );
}
