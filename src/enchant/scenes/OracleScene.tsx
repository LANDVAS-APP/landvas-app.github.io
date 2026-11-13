// 👁️ Oracle Eye: a great eye in the dark that follows your finger and blinks when you poke it. Once a day it opens: choose
// what to look at and the cards are dealt face down — flip them to see what's coming. The server has locked them in; what
// they show is what happens. Swap two to change the order, or hold one to burn it and draw again.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { rarityInfo } from '../../shared/rarity';
import { Button, inputCls } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { EVILS, dur, enchantName, kindInfo } from '../kinds';
import { feel } from '../living';

const WHAT = [
  { id: 'roll', label: 'My next plot rolls', emoji: '🎲' },
  { id: 'reward', label: 'My next minigame rewards', emoji: '🎮' },
  { id: 'pandora', label: 'Pandora’s next lid', emoji: '🏺' },
  { id: 'egg', label: 'My Goose’s next eggs', emoji: '🥚' },
] as const;

function cardFace(what: string, c: any) {
  if (what === 'roll') {
    if (c.rarity === 'enchanted') return { color: '#B26BFF', big: kindInfo(c.kind).emoji, label: 'ENCHANTED', sub: kindInfo(c.kind).name };
    const r = rarityInfo(c.rarity); return { color: r.color, big: '✦', label: r.name.toUpperCase(), sub: 'your next roll' };
  }
  if (what === 'reward') { const m = Number(c.mult); return { color: m >= 2 ? '#FFD23F' : m > 1 ? '#3DDC97' : m < 1 ? '#FF4D6D' : '#9BA7D8', big: `×${m}`, label: m >= 2 ? 'FORTUNE' : m < 1 ? 'MISFORTUNE' : m > 1 ? 'GOOD' : 'PLAIN', sub: 'Ink on that win' }; }
  if (what === 'egg') return c.platinum ? { color: '#E5F2FF', big: '🥚', label: 'PLATINUM', sub: '×3 Ink' } : { color: '#FFD23F', big: '🥚', label: 'GOLDEN', sub: 'a golden egg' };
  const evils = (c.slots ?? []).filter((s: any) => s.type === 'evil');
  return { color: evils.length ? '#FF4D6D' : '#3DDC97', big: (c.slots ?? []).map((s: any) => (s.type === 'evil' ? EVILS[s.evil]?.emoji ?? '👿' : s.type === 'ink' ? '💧' : s.type === 'luck' ? '🍀' : s.type === 'enchant' ? '✨' : '⏳')).join(''),
    label: `${c.notches} NOTCH${c.notches > 1 ? 'ES' : ''}`, sub: evils.length ? evils.map((s: any) => EVILS[s.evil]?.name).join(', ') + ' escape' : 'only gifts' };
}

function Eye({ color, blink, look }: { color: string; blink: number; look: { x: number; y: number } }) {
  return (
    <svg viewBox="0 0 200 120" className="w-full drop-shadow-[0_0_30px_rgba(255,92,219,0.5)]" aria-hidden>
      <defs>
        <radialGradient id="oe-iris" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" /><stop offset="0.25" stopColor={color} /><stop offset="0.85" stopColor="#3A0F5C" /><stop offset="1" stopColor="#12051F" /></radialGradient>
        <radialGradient id="oe-white" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#FFF6FF" /><stop offset="1" stopColor="#E0C9F0" /></radialGradient>
        <clipPath id="oe-lid"><path d="M10 60 Q100 -8 190 60 Q100 128 10 60Z" /></clipPath>
      </defs>
      <path d="M10 60 Q100 -8 190 60 Q100 128 10 60Z" fill="url(#oe-white)" stroke="#FF5CDB" strokeWidth="3" />
      <g clipPath="url(#oe-lid)">
        <g style={{ transform: `translate(${look.x * 26}px, ${look.y * 14}px)`, transition: 'transform 0.12s ease-out' }}>
          <circle cx="100" cy="60" r="34" fill="url(#oe-iris)" />
          {Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return <line key={i} x1={100 + Math.cos(a) * 14} y1={60 + Math.sin(a) * 14} x2={100 + Math.cos(a) * 32} y2={60 + Math.sin(a) * 32} stroke="#fff" strokeOpacity="0.18" />; })}
          <circle cx="100" cy="60" r="12" fill="#05010A" /><circle cx="92" cy="52" r="5" fill="#fff" opacity="0.85" />
        </g>
        <motion.rect key={blink} x="0" y="-70" width="200" height="70" fill="#2A0D44" initial={{ y: -70 }} animate={{ y: [-70, 0, -70] }} transition={{ duration: 0.28 }} />
        <motion.rect key={`b${blink}`} x="0" y="120" width="200" height="70" fill="#2A0D44" initial={{ y: 120 }} animate={{ y: [120, 50, 120] }} transition={{ duration: 0.28 }} />
      </g>
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={30 + i * 17.5} y1={i % 2 ? 18 : 14} x2={34 + i * 17.5} y2={i % 2 ? 6 : 2} stroke="#FF5CDB" strokeWidth="2.5" strokeLinecap="round" />)}
    </svg>
  );
}

export function OracleScene({ view, act, busy, at, v }: SceneProps) {
  const scene = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(0);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [swapA, setSwapA] = useState<number | null>(null);
  const [what, setWhat] = useState<string>('roll');
  const [target, setTarget] = useState<string>('');
  const [who, setWho] = useState('');
  const [burning, setBurning] = useState<number | null>(null);
  const holdT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextIn = useLeft(view.next_in, at);
  const cards = view.cards;
  const list: any[] = cards?.list ?? [];
  useEffect(() => { const t = setInterval(() => setBlink((b) => b + 1), 4200 + Math.random() * 2500); return () => clearInterval(t); }, []);
  useEffect(() => { setFlipped({}); setSwapA(null); }, [cards?.at]);
  const first = list.find((c) => !c.done);
  const iris = first && cards ? cardFace(cards.what, first).color : kindInfo('oracle').a;
  const track = (e: React.PointerEvent) => {
    const r = scene.current!.getBoundingClientRect();
    setLook({ x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2.2)), y: Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.4) * 2.2)) });
  };
  const gaze = async () => {
    const t = what === 'pandora' || what === 'egg' ? target || (view.targets ?? []).find((x: any) => x.kind === (what === 'egg' ? 'goose' : 'pandora'))?.id : undefined;
    feel('heavy');
    const r = await act('gaze', { what, target: t }, { silent: true });
    if (r) { setBlink((b) => b + 1); efx.burst({ ...centerOf(scene.current), colors: ['#FF5CDB', '#5B2BFF', '#fff'], count: 120, speed: 11, kind: 'spark' }); }
  };
  const tapCard = async (i: number) => {
    const c = list[i];
    if (!flipped[i]) { setFlipped((f) => ({ ...f, [i]: true })); feel('medium'); return; }
    if (c.done || (cards?.rewrites ?? 0) < 1 || cards?.what === 'pandora') return;
    if (swapA == null) { setSwapA(i); feel('light'); return; }
    if (swapA === i) { setSwapA(null); return; }
    const r = await act('swap', { i: swapA, j: i }, { silent: true });
    setSwapA(null);
    if (r) feel('success');
  };
  const startHold = (i: number) => {
    if (list[i]?.done || (cards?.rewrites ?? 0) < 1) return;
    holdT.current = setTimeout(async () => {
      setBurning(i); feel('heavy');
      const r = await act('burn', { i }, { silent: true });
      setTimeout(() => setBurning(null), 900);
      if (r) setFlipped((f) => ({ ...f, [i]: true }));
    }, 900);
  };
  const endHold = () => { if (holdT.current) clearTimeout(holdT.current); holdT.current = null; };
  const lvl = v.level;
  const unlocks = view.unlocks ?? { roll: 1, reward: 3, pandora: 5, egg: 5 };
  const needT = what === 'pandora' || what === 'egg';
  const targets = (view.targets ?? []).filter((x: any) => x.kind === (what === 'egg' ? 'goose' : 'pandora'));
  return (
    <div className="grid gap-3">
      <div ref={scene} className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 50% 40%,#3B0F55,#0C0318 72%)' }} onPointerMove={track} data-testid="oracle-scene">
        {Array.from({ length: 22 }, (_, i) => <span key={i} className="lv-star absolute h-[2px] w-[2px] rounded-full bg-[#FFC6F3]" style={{ left: `${(i * 41) % 100}%`, top: `${(i * 29) % 100}%`, animationDelay: `${(i % 7) * 0.5}s` }} />)}
        <button className="absolute left-1/2 top-[10%] w-[62%] -translate-x-1/2" onClick={() => { setBlink((b) => b + 1); feel('light'); }} aria-label="Poke the eye" data-testid="oracle-eye">
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 4 }}><Eye color={iris} blink={blink} look={look} /></motion.div>
        </button>
        {cards && (
          <div className="absolute inset-x-2 bottom-3 flex justify-center gap-1.5" data-testid="oracle-cards">
            {list.map((c, i) => {
              const f = cardFace(cards.what, c), open = flipped[i] || c.done;
              return (
                <button key={i} className={cn('lv-tarot relative', open && 'open', swapA === i && 'pick', c.done && 'done')} style={{ ['--c' as string]: f.color, width: `${Math.min(22, 92 / list.length)}%` }}
                  onClick={() => void tapCard(i)} onPointerDown={() => open && startHold(i)} onPointerUp={endHold} onPointerLeave={endHold} data-testid="oracle-card">
                  <span className="lv-tarot-back">👁️</span>
                  <span className="lv-tarot-face"><b className="text-[20px] leading-none">{f.big}</b><i>{f.label}</i><small>{f.sub}</small>{c.done && <em>✓ came true</em>}{c.burned && !c.done && <em>🔥 redrawn</em>}</span>
                  {burning === i && <span className="lv-burn" />}
                </button>
              );
            })}
          </div>
        )}
        {!cards && <div className="absolute inset-x-0 bottom-4 text-center text-[13px] font-bold text-white/70">{Number(view.charges) > 0 ? 'The Eye is open. Choose what it should look at.' : `The Eye is closed — it opens in ${dur(nextIn)}`}</div>}
      </div>
      {cards && (
        <p className="text-center text-[12px] font-semibold text-white/70" data-testid="oracle-help">
          {Object.keys(flipped).length < list.length ? 'Tap the cards to turn them over. ' : ''}
          {(cards.rewrites ?? 0) > 0 ? (cards.what === 'pandora' ? 'Hold a card to burn it and draw again (it may come out worse).' : 'Tap two turned cards to swap them, or hold one to burn it and draw again.') : 'Fate is set — the cards will come true in this order.'}
          {(cards.rewrites ?? 0) > 0 && ` · ${cards.rewrites} rewrite${cards.rewrites === 1 ? '' : 's'} left`}
        </p>
      )}
      <div className="grid gap-2 rounded-2xl bg-white/[0.04] p-2.5">
        <div className="flex items-center justify-between text-[12px]"><span className="font-black uppercase tracking-wider text-white/60">Gaze into…</span>
          <span className="font-bold text-[#FFC6F3]">{view.charges}/{view.max} · {Number(view.charges) < Number(view.max) ? `next ${dur(nextIn)}` : 'ready'}</span></div>
        <div className="grid grid-cols-2 gap-1.5">
          {WHAT.map((w) => {
            const locked = lvl < (unlocks[w.id] ?? 1);
            return (
              <button key={w.id} disabled={locked} onClick={() => { setWhat(w.id); feel('light'); }} className={cn('rounded-xl px-2.5 py-2 text-left text-[12px] font-black', what === w.id ? 'bg-[linear-gradient(135deg,#FF5CDB,#5B2BFF)] text-white' : 'bg-white/[0.05] text-white/75', locked && 'opacity-40')} data-testid={`oracle-what-${w.id}`}>
                {w.emoji} {w.label}{locked ? ` · level ${unlocks[w.id]}` : ''}
              </button>
            );
          })}
        </div>
        {needT && (targets.length ? (
          <select className={cn(inputCls, 'h-9')} value={target} onChange={(e) => setTarget(e.target.value)} data-testid="oracle-target">
            {targets.map((x: any) => <option key={x.id} value={x.id}>{enchantName(x)}</option>)}
          </select>
        ) : <p className="text-[11.5px] text-white/55">You need a {what === 'egg' ? 'Golden Goose' : 'Pandora’s Box'} for this.</p>)}
        <Button variant="rainbow" disabled={!!busy || Number(view.charges) < 1 || (needT && !targets.length)} onClick={() => void gaze()} data-testid="oracle-gaze">
          {Number(view.charges) < 1 ? `The Eye opens in ${dur(nextIn)}` : `👁️ Gaze — ${view.cards_n} cards`}
        </Button>
        {(view.queued?.roll > 0 || view.queued?.reward > 0) && <p className="text-[11px] text-white/55">Already fated: {view.queued.roll} roll{view.queued.roll === 1 ? '' : 's'}, {view.queued.reward} minigame reward{view.queued.reward === 1 ? '' : 's'}.</p>}
      </div>
      <div className="grid gap-2 rounded-2xl bg-white/[0.04] p-2.5" data-testid="oracle-foretell">
        <div className="text-[12px] font-black uppercase tracking-wider text-white/60">Seal a prophecy for a friend</div>
        <p className="text-[11.5px] text-white/60">The Eye fixes their next plot roll and seals it. When it comes true, you both get 10 Ink. Once a day.</p>
        <form className="flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (!who.trim()) return; const r = await act('foretell', { username: who.trim() }, { silent: true }); if (r) { setWho(''); feel('success'); } }}>
          <input className={cn(inputCls, 'h-9')} placeholder="@username" value={who} onChange={(e) => setWho(e.target.value)} disabled={!view.can_foretell} data-testid="oracle-foretell-name" />
          <Button size="sm" type="submit" disabled={!view.can_foretell || !!busy}>Seal</Button>
        </form>
        <AnimatePresence>
          {(view.sealed ?? []).slice(-4).reverse().map((s: any) => (
            <motion.div key={s.fate} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-[12px]">
              <span>{s.done ? '✅' : '🔏'}</span><span className="flex-1">@{s.to_name}: {s.done ? `came true — ${s.outcome?.rarity === 'enchanted' ? 'Enchanted!' : rarityInfo(s.outcome?.rarity).name}` : 'sealed, waiting for their next roll'}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <p className="text-center text-[11px] text-white/55">{view.gazes} gaze{view.gazes === 1 ? '' : 's'} · {view.fulfilled} prophecies came true.</p>
    </div>
  );
}
