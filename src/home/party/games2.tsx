// More house party games for 3–8: Scribble Chain (draw-and-guess telephone), Word Spy (find the one with a
// different word), Same Brain (score by thinking alike) and Bluff Buffet (fool everyone with a fake answer).
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { PlayerAvatar } from '../../ui';
import { type PartyDef, type Seat, dec, enc, norm, placesBy, rng, seatOf, secs } from './kit';

// ---- shared bits ------------------------------------------------------------------------------------------------------
type Strokes = { c: string; w: number; p: number[] }[];
const shuffle = <T,>(a: T[], r: () => number) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const Timer = ({ ms }: { ms: number }) => <span className={cn('rounded-full px-3 py-1 text-sm font-black tabular-nums', ms < 6000 ? 'bg-[#FF3D6E] text-white' : 'bg-white/10')}>{secs(ms)}s</span>;
const Waiting = ({ seats, done, me }: { seats: Seat[]; done: Set<string>; me: string }) => (
  <div className="flex flex-wrap justify-center gap-1.5">
    {seats.map((x) => <span key={x.id} className={cn('flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-bold', done.has(x.id) ? 'bg-[#3DDC97]/25 text-[#7DFFB2]' : 'bg-white/10 text-white/60')}>
      <PlayerAvatar p={x.p} size={18} />{x.id === me ? 'You' : x.name}{done.has(x.id) ? ' ✓' : '…'}</span>)}
  </div>
);
function TextIn({ onSend, placeholder, done, max = 40, testid }: { onSend(t: string): void; placeholder: string; done?: string | null; max?: number; testid: string }) {
  const [t, setT] = useState('');
  if (done) return <div className="rounded-2xl bg-white/10 px-4 py-3 text-center text-sm">✓ <b>{done}</b> — waiting for the others…</div>;
  return (
    <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onSend(t.trim()); setT(''); } }}>
      <input value={t} onChange={(e) => setT(e.target.value.slice(0, max))} placeholder={placeholder} className="h-12 min-w-0 flex-1 rounded-2xl bg-white px-4 text-[16px] text-[#1C1512]" autoFocus data-testid={testid} />
      <button className="rounded-2xl bg-[#FFB13D] px-5 font-black text-[#2A1A08]" disabled={!t.trim()}>Send</button>
    </form>
  );
}
const Card = ({ children, color = '#FFFFFF' }: { children: ReactNode; color?: string }) => (
  <motion.div initial={{ scale: 0.85, opacity: 0, rotate: -2 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} className="w-full rounded-3xl p-5 text-center font-display text-2xl font-black text-[#1C1512] shadow-2xl" style={{ background: color }}>{children}</motion.div>
);

/** draws strokes (coordinates 0–1000 both ways) on a 4:3 canvas */
export function StrokeView({ strokes, className }: { strokes: Strokes | null | undefined; className?: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return; const g = c.getContext('2d')!;
    g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, c.width, c.height); g.lineCap = 'round'; g.lineJoin = 'round';
    const kx = c.width / 1000, ky = c.height / 1000;
    for (const st of strokes ?? []) { g.strokeStyle = st.c; g.lineWidth = st.w * kx; g.beginPath(); for (let i = 0; i < st.p.length; i += 2) { const x = st.p[i] * kx, y = st.p[i + 1] * ky; if (!i) { g.moveTo(x, y); g.lineTo(x + 0.01, y); } else g.lineTo(x, y); } g.stroke(); }
  }, [strokes]);
  return <canvas ref={cv} width={480} height={360} className={cn('block w-full rounded-2xl bg-[#FFFDF7]', className)} />;
}
const INKS = ['#1C1512', '#FF3D3D', '#FFB13D', '#FFE14D', '#3DDC97', '#22B8CF', '#4C6EF5', '#8B5CFF', '#FF5FA2', '#8B5A2B', '#FFFFFF'];
/** a drawing pad that keeps the drawing on your device until you hand it in (or time runs out) */
function Pad({ onDone, ends, now }: { onDone(s: Strokes): void; ends: number; now: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Strokes>([]), cur = useRef<Strokes[number] | null>(null), sent = useRef(false);
  const [color, setColor] = useState('#1C1512'); const [size, setSize] = useState(8); const [, force] = useState(0);
  const redraw = () => {
    const c = cv.current; if (!c) return; const g = c.getContext('2d')!;
    g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, c.width, c.height); g.lineCap = 'round'; g.lineJoin = 'round';
    const k = c.width / 1000, ky = c.height / 1000;
    for (const st of [...strokes.current, ...(cur.current ? [cur.current] : [])]) { g.strokeStyle = st.c; g.lineWidth = st.w * k; g.beginPath(); for (let i = 0; i < st.p.length; i += 2) { const x = st.p[i] * k, y = st.p[i + 1] * ky; if (!i) { g.moveTo(x, y); g.lineTo(x + 0.01, y); } else g.lineTo(x, y); } g.stroke(); }
  };
  useEffect(redraw);
  // hand it in by itself just before time's up
  const hand = () => {
    if (sent.current) return; sent.current = true;
    // keep it small enough to send: thin out the points of a very busy drawing
    const total = strokes.current.reduce((n, st) => n + st.p.length, 0), stride = Math.max(1, Math.ceil(total / 3000));
    onDone(strokes.current.slice(0, 200).map((st) => ({ ...st, p: st.p.filter((_, i) => Math.floor(i / 2) % stride === 0 || i >= st.p.length - 2) })));
    force((n) => n + 1);
  };
  useEffect(() => { if (ends - now < 1500) hand(); });
  const pt = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)]; };
  if (sent.current) return <div className="grid w-full gap-2"><StrokeView strokes={strokes.current} /><div className="text-center text-sm text-white/80">✓ Handed in — waiting for the others…</div></div>;
  return (
    <div className="grid w-full gap-2">
      <canvas ref={cv} width={640} height={480} className="block w-full cursor-crosshair touch-none rounded-2xl bg-[#FFFDF7] shadow-2xl" data-testid="sc-pad"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); const [x, y] = pt(e); cur.current = { c: color, w: size, p: [x, y] }; redraw(); }}
        onPointerMove={(e) => { if (!cur.current) return; const [x, y] = pt(e); const p = cur.current.p; if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) > 4) { p.push(x, y); redraw(); } }}
        onPointerUp={() => { if (cur.current) strokes.current.push(cur.current); cur.current = null; }} />
      <div className="flex flex-wrap items-center gap-1.5">
        {INKS.map((c) => <button key={c} onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-full border-2', color === c ? 'scale-110 border-white' : 'border-white/30')} style={{ background: c }} aria-label={`Colour ${c}`} />)}
        {[5, 10, 20].map((w) => <button key={w} onClick={() => setSize(w)} className={cn('grid h-8 w-8 place-items-center rounded-full bg-white/10', size === w && 'ring-2 ring-white')} aria-label={`Size ${w}`}><span className="rounded-full bg-white" style={{ width: w / 2 + 2, height: w / 2 + 2 }} /></button>)}
        <button onClick={() => { strokes.current.pop(); force((n) => n + 1); }} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">Undo</button>
        <button onClick={() => { strokes.current = []; force((n) => n + 1); }} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">Clear</button>
        <button onClick={hand} className="ml-auto rounded-xl bg-[#3DDC97] px-4 py-1.5 text-sm font-black text-[#0F2A1E]" data-testid="sc-done">Done ✓</button>
      </div>
    </div>
  );
}

// ======================================================================================================================
// Scribble Chain: write something, the next person draws it, the next guesses the drawing, the next draws the
// guess… then watch every chain unfold and vote for the best drawing.
// ======================================================================================================================
type Link = { by: string; t?: string; d?: Strokes };
type SC = { ids: string[]; step: number; steps: number; phase: 'write' | 'draw' | 'guess' | 'show' | 'vote' | 'done'; ends: number; chains: Link[][]; show: number;
  votes: Record<string, string>; pts: Record<string, number>; seed: number };
const SC_T = { write: 35_000, draw: 75_000, guess: 35_000, show: 11_000, vote: 30_000 };
const PROMPTS = ['a cat riding a skateboard', 'a pizza in space', 'a dragon at the dentist', 'a snowman on holiday', 'a robot walking a dog', 'a haunted sandwich', 'a giraffe in a tiny car',
  'a wizard making pancakes', 'a shark at a birthday party', 'a cow on the moon', 'a ghost learning to swim', 'a penguin selling ice cream', 'a cactus giving a hug', 'a superhero doing laundry',
  'a dinosaur playing piano', 'a banana in a tuxedo', 'an octopus juggling', 'a castle made of cake', 'a sleepy volcano', 'a bee driving a bus'];
/** who holds chain c at step k */
const scHolder = (s: SC, c: number, k: number) => s.ids[(c + k) % s.ids.length];
const scKind = (k: number) => (k === 0 ? 'write' : k % 2 ? 'draw' : 'guess') as 'write' | 'draw' | 'guess';
function scMine(s: SC, me: string) { const c = s.ids.findIndex((_, ci) => scHolder(s, ci, s.step) === me); return c; }
function scAdvance(s: SC, now: number) {
  // fill in anything missing, then move on
  s.chains.forEach((ch, c) => { if (!ch[s.step]) ch[s.step] = s.phase === 'draw' ? { by: scHolder(s, c, s.step), d: [] } : { by: scHolder(s, c, s.step), t: s.phase === 'write' ? PROMPTS[Math.floor(rng(s.seed + c)() * PROMPTS.length)] : '(no idea!)' }; });
  s.step++;
  if (s.step >= s.steps) { s.phase = 'show'; s.show = 0; s.ends = now + SC_T.show; return; }
  s.phase = scKind(s.step); s.ends = now + SC_T[s.phase];
}
export const chain: PartyDef<SC, { k: 'text'; t: string } | { k: 'draw'; d: Strokes } | { k: 'vote'; c: string }> = {
  id: 'chain', name: 'Scribble Chain', emoji: '🔗', color: '#FF5FA2', min: 3, max: 8, kind: 'party',
  blurb: 'Write it, draw it, guess it, draw that… then see how wrong it all went.', how: 'Everyone writes something silly. It’s passed on: the next player draws it, the next guesses the drawing, the next draws the guess… At the end, watch each chain and vote for the best drawing.',
  init(seats, seed) { const n = seats.length; const steps = Math.min(n, 5) % 2 ? Math.min(n, 5) : Math.min(n, 5) - 1 || 3; return { ids: seats.map((x) => x.id), step: 0, steps: Math.max(3, steps), phase: 'write', ends: SC_T.write, chains: seats.map(() => []), show: 0, votes: {}, pts: Object.fromEntries(seats.map((x) => [x.id, 0])), seed }; },
  move(s, by, m, now) {
    if (s.phase === 'vote' && m.k === 'vote') {
      if (s.votes[by] || !s.ids.includes(by)) return false;
      const [c, k] = m.c.split(':').map(Number); const l = s.chains[c]?.[k]; if (!l?.d || l.by === by) return false;
      s.votes[by] = m.c; s.pts[l.by] += 3; s.pts[by] += 1;
      if (Object.keys(s.votes).length >= s.ids.length) { s.phase = 'done'; }
      return true;
    }
    if (!['write', 'draw', 'guess'].includes(s.phase)) return false;
    const c = scMine(s, by); if (c < 0 || s.chains[c][s.step]) return false;
    if (s.phase === 'draw') { if (m.k !== 'draw' || !Array.isArray(m.d)) return false; s.chains[c][s.step] = { by, d: m.d.slice(0, 200).map((x) => ({ c: /^#[0-9a-fA-F]{6}$/.test(x.c) ? x.c : '#1C1512', w: Math.max(2, Math.min(30, +x.w || 6)), p: (x.p ?? []).slice(0, 1600).map((v) => Math.max(0, Math.min(1000, Math.round(+v || 0)))) })) }; }
    else { if (m.k !== 'text') return false; const t = String(m.t).slice(0, 60).trim(); if (!t) return false; s.chains[c][s.step] = { by, t }; s.pts[by] += 1; }
    if (s.chains.every((ch) => ch[s.step])) scAdvance(s, now);
    return true;
  },
  tick(s, now) {
    if (s.phase === 'done' || now < s.ends) return false;
    if (s.phase === 'show') {
      s.show++;
      if (s.show >= s.chains.length) {
        // a bonus for every chain whose last guess still matches how it started
        s.chains.forEach((ch) => { const a = new Set(norm(ch[0]?.t ?? '').length ? (ch[0]!.t ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2) : []); const z = (ch[ch.length - 1]?.t ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2); if (z.some((w) => a.has(w))) for (const l of ch) s.pts[l.by] += 2; });
        s.phase = 'vote'; s.ends = now + SC_T.vote;
      } else s.ends = now + SC_T.show;
      return true;
    }
    if (s.phase === 'vote') { s.phase = 'done'; return true; }
    scAdvance(s, now); return true;
  },
  result: (s) => (s.phase === 'done' ? placesBy(s.pts) : null),
  score: (s) => s.pts,
  // while people are writing and drawing, nobody needs the old drawings: keep what goes over the wire small
  view(s) {
    if (s.phase === 'show' || s.phase === 'vote' || s.phase === 'done') return s;
    return { ...s, chains: s.chains.map((ch) => ch.map((l, k) => (k === s.step - 1 ? l : l.d ? { by: l.by, d: [] } : l))) };
  },
  View({ s, me, seats, send, now }) {
    const c = scMine(s, me), prev = c >= 0 ? s.chains[c][s.step - 1] : null, mine = c >= 0 ? s.chains[c][s.step] : null;
    const done = useMemo(() => new Set(s.chains.map((ch) => ch[s.step]?.by).filter(Boolean) as string[]), [s]);
    if (s.phase === 'write') return (
      <div className="grid w-full max-w-md justify-items-center gap-3">
        <div className="flex w-full items-center justify-between"><b className="font-display text-xl">Write something to draw</b><Timer ms={s.ends - now} /></div>
        <p className="text-sm text-white/70">Something silly, like “{PROMPTS[Math.floor(rng(s.seed + 9)() * PROMPTS.length)]}”.</p>
        <TextIn onSend={(t) => send({ k: 'text', t })} placeholder="a ____ doing ____" done={mine?.t} max={60} testid="sc-text" />
        <Waiting seats={seats} done={done} me={me} />
      </div>
    );
    if (s.phase === 'draw') return (
      <div className="grid w-full max-w-lg justify-items-center gap-2">
        <div className="flex w-full items-center justify-between gap-2"><span className="text-sm text-white/70">Draw this:</span><Timer ms={s.ends - now} /></div>
        <Card color="#FFE8A3">“{prev?.t ?? '…'}”</Card>
        <Pad key={s.step} ends={s.ends} now={now} onDone={(d) => send({ k: 'draw', d })} />
        <Waiting seats={seats} done={done} me={me} />
      </div>
    );
    if (s.phase === 'guess') return (
      <div className="grid w-full max-w-lg justify-items-center gap-2">
        <div className="flex w-full items-center justify-between"><b className="font-display text-xl">What is this?</b><Timer ms={s.ends - now} /></div>
        <StrokeView strokes={prev?.d} className="shadow-2xl" />
        <TextIn key={s.step} onSend={(t) => send({ k: 'text', t })} placeholder="It’s a…" done={mine?.t} max={60} testid="sc-guess" />
        <Waiting seats={seats} done={done} me={me} />
      </div>
    );
    if (s.phase === 'show') {
      const ch = s.chains[s.show] ?? [];
      return (
        <div className="grid w-full max-w-lg gap-2">
          <div className="flex items-center justify-between"><b className="font-display text-xl">Chain {s.show + 1} of {s.chains.length}</b><Timer ms={s.ends - now} /></div>
          {ch.map((l, k) => (
            <motion.div key={`${s.show}-${k}`} initial={{ opacity: 0, x: k % 2 ? 30 : -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.9 }} className={cn('flex items-start gap-2', k % 2 && 'flex-row-reverse')}>
              <PlayerAvatar p={seatOf(seats, l.by)!.p} size={28} />
              {l.d ? <div className="w-[70%]"><StrokeView strokes={l.d} /></div> : <div className="rounded-2xl bg-white px-4 py-2 text-[17px] font-bold text-[#1C1512]">{k === 0 ? '✍️ ' : '🤔 '}{l.t}</div>}
            </motion.div>
          ))}
        </div>
      );
    }
    if (s.phase === 'vote') {
      const pics = s.chains.flatMap((ch, ci) => ch.map((l, k) => ({ l, key: `${ci}:${k}` })).filter((x) => x.l.d && x.l.d.length));
      return (
        <div className="grid w-full max-w-lg gap-2">
          <div className="flex items-center justify-between"><b className="font-display text-xl">Vote for the best drawing</b><Timer ms={s.ends - now} /></div>
          <div className="grid grid-cols-2 gap-2">
            {pics.map(({ l, key }) => (
              <button key={key} disabled={!!s.votes[me] || l.by === me} onClick={() => send({ k: 'vote', c: key })} data-testid={`sc-vote-${key}`}
                className={cn('relative rounded-2xl p-1 text-left', s.votes[me] === key ? 'bg-[#FFB13D]' : 'bg-white/10', l.by === me && 'opacity-60')}>
                <StrokeView strokes={l.d} />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 text-[10px] font-bold">{l.by === me ? 'yours' : seatOf(seats, l.by)?.name}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }
    return <div className="py-10 text-center font-display text-3xl font-black">What a mess. Brilliant. 🎨</div>;
  },
};

// ======================================================================================================================
// Word Spy: everyone gets the same word — except the spy, who gets a close one (and doesn't know they're the spy).
// Give one-word clues in turn, then vote for who you think the spy is.
// ======================================================================================================================
const PAIRS = [['cat', 'dog'], ['coffee', 'tea'], ['piano', 'guitar'], ['beach', 'desert'], ['pizza', 'burger'], ['moon', 'sun'], ['rain', 'snow'], ['train', 'bus'], ['apple', 'pear'],
  ['football', 'basketball'], ['castle', 'palace'], ['ghost', 'zombie'], ['shark', 'dolphin'], ['cake', 'pie'], ['library', 'museum'], ['pirate', 'ninja'], ['volcano', 'mountain'],
  ['candle', 'torch'], ['bee', 'butterfly'], ['wizard', 'witch'], ['rocket', 'airplane'], ['popcorn', 'crisps'], ['penguin', 'owl'], ['forest', 'jungle'], ['violin', 'trumpet'],
  ['skateboard', 'bicycle'], ['hospital', 'school'], ['milk', 'juice'], ['crown', 'hat'], ['robot', 'alien']];
type WS = { ids: string[]; round: number; rounds: number; phase: 'clue' | 'vote' | 'reveal' | 'done'; ends: number; turn: number; lap: number; laps: number; spy: string; wz: string; sz: string;
  clues: { by: string; t: string; lap: number }[]; votes: Record<string, string>; caught: boolean | null; pts: Record<string, number>; seed: number };
const WS_T = { clue: 25_000, vote: 30_000, reveal: 7_000 };
function wsDeal(s: WS, now: number) {
  const r = rng(s.seed + s.round * 211); const pair = PAIRS[Math.floor(r() * PAIRS.length)]; const flip = r() < 0.5;
  s.spy = enc(s.ids[Math.floor(r() * s.ids.length)]); s.wz = enc(flip ? pair[1] : pair[0]); s.sz = enc(flip ? pair[0] : pair[1]);
  s.phase = 'clue'; s.turn = s.round % s.ids.length; s.lap = 0; s.clues = []; s.votes = {}; s.caught = null; s.ends = now + WS_T.clue;
}
const wsNextTurn = (s: WS, now: number) => {
  s.turn = (s.turn + 1) % s.ids.length;
  if (s.turn === s.round % s.ids.length) { s.lap++; if (s.lap >= s.laps) { s.phase = 'vote'; s.ends = now + WS_T.vote; return; } }
  s.ends = now + WS_T.clue;
};
function wsReveal(s: WS, now: number) {
  const spy = dec(s.spy), tally: Record<string, number> = {};
  for (const v of Object.values(s.votes)) tally[v] = (tally[v] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(tally)); const most = Object.keys(tally).filter((k) => tally[k] === top);
  s.caught = top > 0 && most.length === 1 && most[0] === spy;
  for (const id of s.ids) {
    if (id === spy) s.pts[id] += s.caught ? 0 : 5;
    else { if (s.caught) s.pts[id] += 2; if (s.votes[id] === spy) s.pts[id] += 1; }
  }
  s.phase = 'reveal'; s.ends = now + WS_T.reveal;
}
export const spy: PartyDef<WS, { k: 'clue'; t: string } | { k: 'vote'; who: string }> = {
  id: 'spy', name: 'Word Spy', emoji: '🕵️', color: '#3DDC97', min: 3, max: 8, kind: 'party',
  blurb: 'One of you has a different word — and doesn’t know it. Sniff them out.', how: 'Everyone sees a secret word, but one player (the spy) got a slightly different one. Take turns giving a one-word clue, then vote for the spy. Catch them: points for everyone. Stay hidden, spy: big points.',
  init(seats, seed) { const s: WS = { ids: seats.map((x) => x.id), round: 0, rounds: Math.min(4, Math.max(3, seats.length)), phase: 'clue', ends: 0, turn: 0, lap: 0, laps: seats.length <= 4 ? 2 : 1, spy: '', wz: '', sz: '', clues: [], votes: {}, caught: null, pts: Object.fromEntries(seats.map((x) => [x.id, 0])), seed }; wsDeal(s, 0); return s; },
  move(s, by, m, now) {
    if (s.phase === 'clue' && m.k === 'clue') {
      if (s.ids[s.turn] !== by) return false;
      const t = String(m.t).trim().split(/\s+/)[0]?.slice(0, 20) ?? ''; if (!t) return false;
      const mine = by === dec(s.spy) ? dec(s.sz) : dec(s.wz); if (norm(t) === norm(mine)) return false; // no saying the word!
      s.clues.push({ by, t, lap: s.lap }); wsNextTurn(s, now); return true;
    }
    if (s.phase === 'vote' && m.k === 'vote') {
      if (s.votes[by] || m.who === by || !s.ids.includes(m.who) || !s.ids.includes(by)) return false;
      s.votes[by] = m.who; if (Object.keys(s.votes).length >= s.ids.length) wsReveal(s, now); return true;
    }
    return false;
  },
  tick(s, now) {
    if (s.phase === 'done' || now < s.ends) return false;
    if (s.phase === 'clue') { s.clues.push({ by: s.ids[s.turn], t: '🤐', lap: s.lap }); wsNextTurn(s, now); return true; }
    if (s.phase === 'vote') { wsReveal(s, now); return true; }
    s.round++; if (s.round >= s.rounds) { s.phase = 'done'; return true; }
    wsDeal(s, now); return true;
  },
  result: (s) => (s.phase === 'done' ? placesBy(s.pts) : null),
  turn: (s) => (s.phase === 'clue' ? s.ids[s.turn] : null),
  score: (s) => s.pts,
  View({ s, me, seats, send, now }) {
    const spyId = dec(s.spy), myWord = me === spyId ? dec(s.sz) : dec(s.wz);
    const done = useMemo(() => new Set(Object.keys(s.votes)), [s.votes]);
    const [oops, setOops] = useState(false);
    return (
      <div className="grid w-full max-w-md justify-items-center gap-3">
        <div className="flex w-full items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">Round {Math.min(s.round + 1, s.rounds)}/{s.rounds}</span>{s.phase !== 'done' && s.phase !== 'reveal' && <Timer ms={s.ends - now} />}</div>
        {s.phase !== 'done' && <Card color="#C9F7DD"><div className="text-xs font-bold uppercase tracking-widest text-[#1E7F5C]">your secret word</div><div className="text-4xl" data-testid="ws-word">{myWord}</div></Card>}
        <div className="grid w-full gap-1">
          {s.clues.map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-xl bg-white/10 px-2 py-1.5">
              <PlayerAvatar p={seatOf(seats, c.by)!.p} size={22} /><span className="text-xs text-white/60">{c.by === me ? 'You' : seatOf(seats, c.by)?.name}</span><b className="ml-auto text-lg">{c.t}</b>
            </motion.div>
          ))}
        </div>
        {s.phase === 'clue' && (s.ids[s.turn] === me
          ? <><div className="text-sm font-black text-[#7DFFB2]">{oops ? '😬 Not the word itself! Try another clue.' : 'Your turn: one word that fits your word (but don’t give it away!)'}</div>
              <TextIn key={s.clues.length} onSend={(t) => { if (norm(t.split(/\s+/)[0]) === norm(myWord)) { setOops(true); return; } setOops(false); send({ k: 'clue', t }); }} placeholder="one word…" max={20} testid="ws-clue" /></>
          : <div className="text-sm text-white/70">{seatOf(seats, s.ids[s.turn])?.name} is thinking of a clue…</div>)}
        {s.phase === 'vote' && (
          <div className="grid w-full gap-2">
            <b className="text-center font-display text-xl">Who’s the spy?</b>
            <div className="grid grid-cols-2 gap-2">
              {seats.filter((x) => x.id !== me).map((x) => (
                <button key={x.id} disabled={!!s.votes[me]} onClick={() => send({ k: 'vote', who: x.id })} data-testid={`ws-vote-${x.slot}`}
                  className={cn('flex items-center gap-2 rounded-2xl p-2.5 text-left font-bold', s.votes[me] === x.id ? 'bg-[#FFB13D] text-[#2A1A08]' : 'bg-white/10')}><PlayerAvatar p={x.p} size={28} />{x.name}</button>
              ))}
            </div>
            <Waiting seats={seats} done={done} me={me} />
          </div>
        )}
        {s.phase === 'reveal' && (
          <Card color={s.caught ? '#C9F7DD' : '#FFD1DC'}>
            <div className="text-base">The spy was</div><div className="flex items-center justify-center gap-2"><PlayerAvatar p={seatOf(seats, spyId)!.p} size={34} />{spyId === me ? 'You!' : seatOf(seats, spyId)?.name}</div>
            <div className="mt-1 text-sm font-bold">Words: “{dec(s.wz)}” · spy had “{dec(s.sz)}”</div>
            <div className="mt-2 text-xl">{s.caught ? 'Caught! 🎉' : 'The spy got away! 🕵️'}</div>
          </Card>
        )}
      </div>
    );
  },
};

// ======================================================================================================================
// Same Brain: everyone answers the same question; you score for every other player who said the same thing.
// ======================================================================================================================
const QUESTIONS = ['Name a pizza topping', 'Name a pet', 'Something you find at the beach', 'A colour of the rainbow', 'Something that’s always cold', 'A famous monster', 'A breakfast food',
  'Something you do in the morning', 'An animal with stripes', 'Something you take on a picnic', 'A word that rhymes with “cat”', 'A sport with a ball', 'Something in a toolbox',
  'A fruit that’s yellow', 'Something you see in the sky', 'A musical instrument', 'Something with wheels', 'A planet', 'A superpower', 'Something you put on a sandwich',
  'A board game piece', 'An ice cream flavour', 'Something spooky', 'A shape', 'Something you’d find in a castle', 'A farm animal', 'A dessert', 'Something that buzzes',
  'A job that uses a uniform', 'Something you wear on your head', 'A vegetable', 'Something green', 'A weather', 'An ocean animal', 'A holiday'];
type SB = { ids: string[]; round: number; rounds: number; phase: 'answer' | 'reveal' | 'done'; ends: number; q: number; ans: Record<string, string>; got: Record<string, number>; pts: Record<string, number>; seed: number; used: number[] };
const SB_T = { answer: 25_000, reveal: 8_000 };
const sbKey = (t: string) => { let k = norm(t); if (k.length > 3 && k.endsWith('s')) k = k.slice(0, -1); return k; };
function sbNext(s: SB, now: number) { const r = rng(s.seed + s.round * 53); let q = Math.floor(r() * QUESTIONS.length); while (s.used.includes(q)) q = (q + 1) % QUESTIONS.length; s.used.push(q); s.q = q; s.ans = {}; s.got = {}; s.phase = 'answer'; s.ends = now + SB_T.answer; }
function sbScore(s: SB, now: number) {
  const groups: Record<string, string[]> = {};
  for (const [id, z] of Object.entries(s.ans)) { const k = sbKey(dec(z)); if (k) (groups[k] ??= []).push(id); }
  for (const ids of Object.values(groups)) for (const id of ids) { s.got[id] = ids.length - 1; s.pts[id] += ids.length - 1; }
  s.phase = 'reveal'; s.ends = now + SB_T.reveal;
}
export const samebrain: PartyDef<SB, { k: 'say'; t: string }> = {
  id: 'samebrain', name: 'Same Brain', emoji: '🧠', color: '#FFE14D', min: 3, max: 8, kind: 'party',
  blurb: 'Don’t be clever — be the same as everyone else.', how: 'Everyone answers the same question at once. You score a point for every other player who said the same thing. Great minds think alike!',
  init(seats, seed) { const s: SB = { ids: seats.map((x) => x.id), round: 0, rounds: 7, phase: 'answer', ends: 0, q: 0, ans: {}, got: {}, pts: Object.fromEntries(seats.map((x) => [x.id, 0])), seed, used: [] }; sbNext(s, 0); return s; },
  move(s, by, m, now) {
    if (s.phase !== 'answer' || s.ans[by] || !s.ids.includes(by)) return false;
    const t = String(m.t).trim().slice(0, 24); if (!sbKey(t)) return false;
    s.ans[by] = enc(t); if (Object.keys(s.ans).length >= s.ids.length) sbScore(s, now); return true;
  },
  tick(s, now) {
    if (s.phase === 'done' || now < s.ends) return false;
    if (s.phase === 'answer') { sbScore(s, now); return true; }
    s.round++; if (s.round >= s.rounds) { s.phase = 'done'; return true; }
    sbNext(s, now); return true;
  },
  result: (s) => (s.phase === 'done' ? placesBy(s.pts) : null),
  score: (s) => s.pts,
  View({ s, me, seats, send, now }) {
    const done = new Set(Object.keys(s.ans));
    const groups = useMemo(() => {
      const g: Record<string, { t: string; ids: string[] }> = {};
      for (const [id, z] of Object.entries(s.ans)) { const t = dec(z), k = sbKey(t); (g[k] ??= { t, ids: [] }).ids.push(id); }
      return Object.values(g).sort((a, b) => b.ids.length - a.ids.length);
    }, [s.ans]);
    if (s.phase === 'done') return <div className="py-10 text-center font-display text-3xl font-black">Brains: synced. 🧠</div>;
    return (
      <div className="grid w-full max-w-md justify-items-center gap-3">
        <div className="flex w-full items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">Round {s.round + 1}/{s.rounds}</span>{s.phase === 'answer' && <Timer ms={s.ends - now} />}</div>
        <Card key={s.q} color="#FFF3B0"><span data-testid="sb-q">{QUESTIONS[s.q]}</span></Card>
        {s.phase === 'answer' ? (
          <>
            <TextIn key={s.round} onSend={(t) => send({ k: 'say', t })} placeholder="What would everyone say?" done={s.ans[me] ? dec(s.ans[me]) : null} max={24} testid="sb-answer" />
            <Waiting seats={seats} done={done} me={me} />
          </>
        ) : (
          <div className="grid w-full gap-2">
            {groups.map((g, i) => (
              <motion.div key={g.t + i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.15 }}
                className={cn('flex items-center gap-2 rounded-2xl px-3 py-2', g.ids.length > 1 ? 'bg-[#3DDC97]/25' : 'bg-white/10')}>
                <b className="flex-1 text-lg">{g.t}</b>
                <div className="flex -space-x-2">{g.ids.map((id) => <PlayerAvatar key={id} p={seatOf(seats, id)!.p} size={26} />)}</div>
                <span className="w-10 text-right text-sm font-black text-[#7DFFB2]">{g.ids.length > 1 ? `+${g.ids.length - 1}` : ''}</span>
              </motion.div>
            ))}
            {!groups.length && <div className="text-center text-white/60">Nobody answered!</div>}
          </div>
        )}
      </div>
    );
  },
};

// ======================================================================================================================
// Bluff Buffet: a true fact with a blank. Everyone writes a fake answer; then everyone tries to pick the real one.
// Points for finding the truth, and for every player your fake fooled.
// ======================================================================================================================
const FACTS: [string, string][] = [
  ['A group of flamingos is called a ____.', 'flamboyance'], ['The national animal of Scotland is the ____.', 'unicorn'], ['A baby kangaroo is called a ____.', 'joey'],
  ['An octopus has ____ hearts.', 'three'], ['The dot over a lowercase “i” is called a ____.', 'tittle'], ['A group of crows is called a ____.', 'murder'],
  ['Wombat poop is shaped like ____.', 'cubes'], ['A group of owls is called a ____.', 'parliament'], ['The plastic tip of a shoelace is called an ____.', 'aglet'],
  ['The Eiffel Tower gets slightly taller in the ____.', 'summer'], ['Sea otters hold ____ while they sleep.', 'hands'], ['The largest desert in the world is ____.', 'Antarctica'],
  ['Scotland has over 400 words for ____.', 'snow'], ['Strawberries aren’t really berries, but ____ are.', 'avocados'], ['The shortest war in history lasted about 38 ____.', 'minutes'],
  ['A “jiffy” is an actual unit of ____.', 'time'], ['The # symbol is also called an ____.', 'octothorpe'], ['A baby puffin is called a ____.', 'puffling'],
  ['A day on Venus is longer than its ____.', 'year'], ['Butterflies taste with their ____.', 'feet'], ['Peanuts aren’t nuts — they’re ____.', 'legumes'],
  ['A group of jellyfish can be called a ____.', 'smack'], ['Koalas have fingerprints very like a ____.', 'human'], ['Bananas are technically ____.', 'berries'],
  ['A group of pandas is called an ____.', 'embarrassment'], ['Honey found in ancient Egyptian tombs was still ____.', 'edible'], ['A snail breathes through a hole called a ____.', 'pneumostome'],
  ['Cows have best ____.', 'friends'], ['The fingerprint-like pattern on a cat’s nose is as unique as a human ____.', 'fingerprint'], ['A baby goat is called a ____.', 'kid'],
];
type BB = { ids: string[]; round: number; rounds: number; phase: 'write' | 'pick' | 'reveal' | 'done'; ends: number; f: number; lies: Record<string, string>; oops: Record<string, boolean>;
  opts: { t: string; by: string[] }[]; picks: Record<string, number>; pts: Record<string, number>; seed: number; used: number[] };
const BB_T = { write: 40_000, pick: 25_000, reveal: 9_000 };
function bbNext(s: BB, now: number) { const r = rng(s.seed + s.round * 71); let f = Math.floor(r() * FACTS.length); while (s.used.includes(f)) f = (f + 1) % FACTS.length; s.used.push(f); s.f = f; s.lies = {}; s.oops = {}; s.opts = []; s.picks = {}; s.phase = 'write'; s.ends = now + BB_T.write; }
function bbToPick(s: BB, now: number) {
  const truth = FACTS[s.f][1], merged: Record<string, { t: string; by: string[] }> = { [norm(truth)]: { t: enc(truth), by: [] } };
  for (const [id, z] of Object.entries(s.lies)) { const t = dec(z), k = norm(t); if (!merged[k]) merged[k] = { t: z, by: [] }; merged[k].by.push(id); }
  // a couple of house fakes if there aren't many answers
  const fillers = ['spoon', 'banana', 'seven', 'pickles', 'Tuesday', 'a wizard'];
  let i = 0; while (Object.keys(merged).length < Math.min(4, s.ids.length + 1)) { const f = fillers[(s.f + i++) % fillers.length]; if (!merged[norm(f)]) merged[norm(f)] = { t: enc(f), by: [] }; }
  s.opts = shuffle(Object.values(merged), rng(s.seed + s.round * 13)); s.phase = 'pick'; s.ends = now + BB_T.pick;
}
function bbScore(s: BB, now: number) {
  const truth = norm(FACTS[s.f][1]);
  for (const [id, o] of Object.entries(s.picks)) {
    const opt = s.opts[o]; if (!opt) continue;
    if (norm(dec(opt.t)) === truth) s.pts[id] += 3; else for (const liar of opt.by) if (liar !== id) s.pts[liar] += 2;
  }
  s.phase = 'reveal'; s.ends = now + BB_T.reveal;
}
export const bluff: PartyDef<BB, { k: 'lie'; t: string } | { k: 'pick'; o: number }> = {
  id: 'bluff', name: 'Bluff Buffet', emoji: '🤥', color: '#8B5CFF', min: 3, max: 8, kind: 'party',
  blurb: 'Make up fake answers to strange-but-true facts. Fool your friends!', how: 'You’ll see a true fact with a blank. Write a believable fake answer. Then pick which answer you think is real: +3 for the truth, +2 for everyone who falls for your fake.',
  init(seats, seed) { const s: BB = { ids: seats.map((x) => x.id), round: 0, rounds: 5, phase: 'write', ends: 0, f: 0, lies: {}, oops: {}, opts: [], picks: {}, pts: Object.fromEntries(seats.map((x) => [x.id, 0])), seed, used: [] }; bbNext(s, 0); return s; },
  move(s, by, m, now) {
    if (!s.ids.includes(by)) return false;
    if (s.phase === 'write' && m.k === 'lie') {
      if (s.lies[by]) return false;
      const t = String(m.t).trim().slice(0, 30); if (!norm(t)) return false;
      if (norm(t) === norm(FACTS[s.f][1])) { s.oops[by] = true; return true; } // that's the real answer! write a fake one
      s.lies[by] = enc(t); delete s.oops[by];
      if (Object.keys(s.lies).length >= s.ids.length) bbToPick(s, now);
      return true;
    }
    if (s.phase === 'pick' && m.k === 'pick') {
      if (s.picks[by] != null || !s.opts[m.o] || s.opts[m.o].by.includes(by)) return false;
      s.picks[by] = m.o; if (Object.keys(s.picks).length >= s.ids.length) bbScore(s, now); return true;
    }
    return false;
  },
  tick(s, now) {
    if (s.phase === 'done' || now < s.ends) return false;
    if (s.phase === 'write') { bbToPick(s, now); return true; }
    if (s.phase === 'pick') { bbScore(s, now); return true; }
    s.round++; if (s.round >= s.rounds) { s.phase = 'done'; return true; }
    bbNext(s, now); return true;
  },
  result: (s) => (s.phase === 'done' ? placesBy(s.pts) : null),
  score: (s) => s.pts,
  View({ s, me, seats, send, now }) {
    const fact = FACTS[s.f], truth = norm(fact[1]);
    if (s.phase === 'done') return <div className="py-10 text-center font-display text-3xl font-black">Nobody can be trusted. 🤥</div>;
    const q = fact[0].split('____');
    return (
      <div className="grid w-full max-w-md justify-items-center gap-3">
        <div className="flex w-full items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">Round {s.round + 1}/{s.rounds}</span>{s.phase !== 'reveal' && <Timer ms={s.ends - now} />}</div>
        <Card key={s.f} color="#E9DEFF"><span className="text-xl leading-snug" data-testid="bb-fact">{q[0]}<span className="mx-1 inline-block min-w-16 border-b-4 border-[#8B5CFF]">{s.phase === 'reveal' ? fact[1] : ' '}</span>{q[1]}</span></Card>
        {s.phase === 'write' && (
          <>
            {s.oops[me] && <div className="rounded-xl bg-[#FFE14D] px-3 py-1.5 text-sm font-black text-[#2A1A08]">😲 That’s actually the right answer! Write a fake one.</div>}
            <TextIn key={`${s.round}-${s.oops[me]}`} onSend={(t) => send({ k: 'lie', t })} placeholder="A believable fake answer…" done={s.lies[me] ? dec(s.lies[me]) : null} max={30} testid="bb-lie" />
            <Waiting seats={seats} done={new Set(Object.keys(s.lies))} me={me} />
          </>
        )}
        {(s.phase === 'pick' || s.phase === 'reveal') && (
          <div className="grid w-full gap-2">
            {s.phase === 'pick' && <b className="text-center">Which one is true?</b>}
            {s.opts.map((o, i) => {
              const t = dec(o.t), real = norm(t) === truth, mineOpt = o.by.includes(me), pickers = Object.keys(s.picks).filter((id) => s.picks[id] === i);
              return (
                <motion.button key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} disabled={s.phase !== 'pick' || s.picks[me] != null || mineOpt}
                  onClick={() => send({ k: 'pick', o: i })} data-testid={`bb-opt-${i}`}
                  className={cn('flex items-center gap-2 rounded-2xl px-4 py-3 text-left text-lg font-bold', s.phase === 'reveal' && real ? 'bg-[#3DDC97] text-[#0F2A1E]' : s.picks[me] === i ? 'bg-[#FFB13D] text-[#2A1A08]' : 'bg-white/10', mineOpt && s.phase === 'pick' && 'opacity-50')}>
                  <span className="flex-1">{t}{mineOpt && s.phase === 'pick' ? ' (yours)' : ''}</span>
                  {s.phase === 'reveal' && (
                    <span className="flex items-center gap-1 text-xs">
                      {real ? '✅ TRUE' : o.by.length ? `🤥 ${o.by.map((b) => (b === me ? 'you' : seatOf(seats, b)?.name)).join(', ')}` : '🏠 house fake'}
                      <span className="ml-1 flex -space-x-1.5">{pickers.map((p) => <PlayerAvatar key={p} p={seatOf(seats, p)!.p} size={20} />)}</span>
                    </span>
                  )}
                </motion.button>
              );
            })}
            {s.phase === 'pick' && <Waiting seats={seats} done={new Set(Object.keys(s.picks))} me={me} />}
          </div>
        )}
      </div>
    );
  },
};
