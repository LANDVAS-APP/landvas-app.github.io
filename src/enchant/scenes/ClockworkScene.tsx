// ⚙️ Clockwork: a brass clock with its works showing. Grab the key and wind it — drag round and round; every full turn
// clicks and stores 8 minutes. Then spend the stored time on your other enchantments: fast-forward their clocks (the
// hands whirl) or freeze them in frost — a frozen spliced hybrid stays fused for longer. And ⏪ Rewind: what went wrong
// in the last 12 hours sits on a tape — run it back and it never happened; once a week, a plot you just claimed rolls again.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { rarityInfo } from '../../shared/rarity';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { buzz } from '../../native/native';
import { Button } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useMyEnchantments, type SceneProps } from '../core';
import { dur, enchantName, kindInfo } from '../kinds';
import { MapPickButton, useMapPick } from '../pickers';
import { readable } from '../../lib/readable';

function Gear({ r, teeth, cls, x, y, c }: { r: number; teeth: number; cls: string; x: number; y: number; c: string }) {
  const d = Array.from({ length: teeth * 2 }, (_, i) => { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 0.82; return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
  return <g className={cls}><polygon points={d} fill={c} stroke="#3A2A1A" strokeWidth="1.5" /><circle cx={x} cy={y} r={r * 0.35} fill="#3A2A1A" /><circle cx={x} cy={y} r={r * 0.15} fill="#D4A373" /></g>;
}

type Moment = { id: string; type: string; emoji: string; title: string; detail: string; ago: number; cost: number; kind?: string; serial?: number };
type RollPlot = { gx: number; gy: number; rarity: string; name: string | null; left_s: number };
const KIND_OF: Record<string, string> = { goose: '🪿', pandora: '🏺', crucible: '⚒️', deck: '🃏', glyph: '✍️', sizeray: '📡', stormcoil: '⚡', leviathan: '🐉' };
const agoText = (s: number) => (s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min ago`);
const tapeTime = (s: number) => { const t = new Date(Date.now() - s * 1000); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };

/** ◀◀ the tape running back over the clock: scanlines, tracking noise, the hands spinning backwards, the clock on the OSD
 *  counting back to the moment — then a flash, and it never happened */
function RewindFx({ ago, onDone }: { ago: number; onDone(): void }) {
  const reduce = useUi((s) => !!s.settings.reduceMotion);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduce) { const t = setTimeout(onDone, 500); return () => clearTimeout(t); }
    const t0 = performance.now(), len = 1900;
    let raf = 0;
    const step = () => { const p = Math.min(1, (performance.now() - t0) / len); setShown(ago * (1 - (1 - p) ** 2)); if (p < 1) raf = requestAnimationFrame(step); else setTimeout(onDone, 650); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div className="lv-vhs pointer-events-none absolute inset-0 z-20 overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="clock-rewinding">
      <div className="lv-vhs-lines absolute inset-0" />
      {!reduce && Array.from({ length: 3 }, (_, i) => (
        <motion.div key={i} className="lv-vhs-track absolute inset-x-0 h-[14%]" initial={{ y: '110%' }} animate={{ y: ['110%', '-20%'] }} transition={{ duration: 0.7, delay: i * 0.55, ease: 'linear' }} />
      ))}
      <div className="absolute left-3 top-3 font-mono text-[18px] font-black text-white [text-shadow:2px_0_#FF2D55,-2px_0_#00E5FF]">◀◀ REWIND</div>
      <div className="absolute bottom-3 right-3 font-mono text-[15px] font-black text-white [text-shadow:2px_0_#FF2D55,-2px_0_#00E5FF]" data-testid="clock-osd">−{agoText(shown).replace(' ago', '')} · {tapeTime(shown)}</div>
      <motion.div className="absolute inset-0 bg-white" initial={{ opacity: 0 }} animate={{ opacity: reduce ? 0 : [0, 0, 0.85, 0] }} transition={{ duration: 2.5, times: [0, 0.74, 0.8, 1] }} />
    </motion.div>
  );
}

export function ClockworkScene({ v, view, act, busy }: SceneProps) {
  const [tolled, setTolled] = useState<number | null>(null);
  const toll = async () => {
    const r = await act('toll');
    if (r) { setTolled(Number(r.result.tolled)); efx.burst({ x: innerWidth / 2, y: innerHeight * 0.4, colors: ['#FFE8A3', '#D4A373', '#fff'], count: 140, speed: 11, kind: 'spark' }); }
  };
  const mine = useMyEnchantments();
  const key = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const [whirl, setWhirl] = useState(false);
  const acc = useRef<{ last: number | null; total: number }>({ last: null, total: 0 });
  const turns = Math.min(Number(view.turns_left), Math.floor(acc.current.total / 360));
  const left = Number(view.turns_left);
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons === 0 || left < 1) return;
    const c = centerOf(key.current);
    const a = (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
    if (acc.current.last != null) {
      let d = a - acc.current.last; if (d > 180) d -= 360; if (d < -180) d += 360;
      if (d > 0) {
        const before = Math.floor(acc.current.total / 360);
        acc.current.total = Math.min(acc.current.total + d, left * 360 + 359);
        if (Math.floor(acc.current.total / 360) > before) { if (useUi.getState().settings.haptics) buzz('medium'); efx.burst({ ...c, colors: ['#D4A373', '#FFE8A3'], count: 10, speed: 5, kind: 'spark' }); }
        setAngle(acc.current.total);
      }
    }
    acc.current.last = a;
  };
  const release = async () => {
    acc.current.last = null;
    const n = Math.min(left, Math.floor(acc.current.total / 360));
    acc.current.total = 0; setAngle(0);
    if (n >= 1) await act('wind', { turns: n });
  };
  const forward = async (id: string, minutes: number) => {
    setWhirl(true);
    const r = await act('forward', { target: id, minutes });
    setTimeout(() => setWhirl(false), 1200);
    if (r) efx.burst({ ...centerOf(face.current), colors: ['#D4A373', '#FFE8A3', '#fff'], count: 60, speed: 9, kind: 'spark' });
  };
  const freeze = async (id: string, hours: number) => {
    const r = await act('freeze', { target: id, hours });
    if (r) efx.burst({ ...centerOf(face.current), colors: ['#C0F5FF', '#fff', '#7DD3FC'], count: 80, speed: 8, kind: 'glitter' });
  };
  const [focus, setFocus] = useState<string | null>(null);
  const targets = (mine.data ?? []).filter((x) => x.id !== v.id).sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  // pick the one to bend on the map: it comes to the top, lit
  const mapPick = useMapPick(v.id, 'bend', (p) => { const t = (mine.data ?? []).find((x) => x.gx === p.gx && x.gy === p.gy && x.id !== v.id); if (t) setFocus(t.id); });
  const charge = Number(view.charge);
  // ⏪ Rewind
  const rw = (view.rewind ?? {}) as { back_h?: number; per_day?: number; used?: number; half?: boolean; roll_per_week?: number; roll_used?: number; roll_cost?: number; paradox?: boolean };
  const timeline = ((view.timeline ?? []) as Moment[]);
  const rolls = ((view.rolls ?? []) as RollPlot[]);
  const [rewinding, setRewinding] = useState<{ ago: number; then?: () => void } | null>(null);
  const [undone, setUndone] = useState<{ title: string; emoji: string } | null>(null);
  const [rolled, setRolled] = useState<{ was: string; rarity: string; kept: boolean; kind?: string | null } | null>(null);
  const rewLeft = Math.max(0, Number(rw.per_day ?? 1) - Number(rw.used ?? 0));
  const rollLeft = Math.max(0, Number(rw.roll_per_week ?? 1) - Number(rw.roll_used ?? 0));
  const rewind = async (m: Moment) => {
    setUndone(null);
    if (useUi.getState().settings.haptics) buzz('heavy');
    const r = await act('rewind', { id: m.id });
    if (!r) return;
    setRewinding({ ago: m.ago, then: () => { setUndone({ title: m.title, emoji: m.emoji }); efx.burst({ ...centerOf(face.current), colors: ['#00E5FF', '#FF2D55', '#FFE8A3', '#fff'], count: 120, speed: 11, kind: 'spark' }); } });
  };
  const rollAgain = async (p: RollPlot) => {
    setRolled(null);
    if (useUi.getState().settings.haptics) buzz('heavy');
    const r = await act('rewind_roll', { gx: p.gx, gy: p.gy });
    if (!r) return;
    const x = r.result as { was: string; rarity: string; kept_old: boolean; drew: { kind?: string } };
    setRewinding({ ago: 600 - p.left_s, then: () => { setRolled({ was: x.was, rarity: x.rarity, kept: x.kept_old, kind: x.drew?.kind ?? null }); efx.burst({ ...centerOf(face.current), colors: [rarityInfo(x.rarity).color, '#fff', '#FFE8A3'], count: 160, speed: 12, kind: 'spark' }); } });
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 40% 40%,#3B2B1C,#140D07 75%)' }} data-testid="clock-scene">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden>
          <Gear r={46} teeth={12} cls="lv-gear" x={70} y={70} c="#8B6B42" /><Gear r={30} teeth={9} cls="lv-gear-r" x={128} y={40} c="#A47E4D" />
          <Gear r={38} teeth={11} cls="lv-gear-r" x={340} y={230} c="#8B6B42" /><Gear r={24} teeth={8} cls="lv-gear" x={300} y={270} c="#A47E4D" />
        </svg>
        <AnimatePresence>{rewinding && <RewindFx ago={rewinding.ago} onDone={() => { rewinding.then?.(); setRewinding(null); }} />}</AnimatePresence>
        {/* the clock face */}
        <div ref={face} className={cn('absolute left-[30%] top-[10%] aspect-square w-[44%] rounded-full border-[6px] border-[#D4A373] bg-[radial-gradient(circle,#FFF8E7,#E9D8B4)] shadow-[0_0_30px_rgba(212,163,115,0.45),inset_0_0_20px_rgba(0,0,0,0.25)]', rewinding && 'lv-clock-back')}>
          <svg viewBox="0 0 100 100" className="absolute inset-0" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <line key={i} x1={50 + Math.cos(a) * 40} y1={50 + Math.sin(a) * 40} x2={50 + Math.cos(a) * 46} y2={50 + Math.sin(a) * 46} stroke="#3A2A1A" strokeWidth={i % 3 ? 1.5 : 3} />; })}
            <motion.line x1="50" y1="50" x2="50" y2="22" stroke="#3A2A1A" strokeWidth="3" strokeLinecap="round" animate={{ rotate: rewinding ? -1440 : whirl ? 1080 : angle / 12 }} transition={{ duration: rewinding ? 2 : whirl ? 1.1 : 0.1, ease: rewinding ? 'easeOut' : undefined }} style={{ transformOrigin: '50px 50px' }} />
            <motion.line x1="50" y1="50" x2="50" y2="12" stroke="#7A2E1A" strokeWidth="1.6" strokeLinecap="round" animate={{ rotate: rewinding ? -8640 : whirl ? 4320 : angle }} transition={{ duration: rewinding ? 2 : whirl ? 1.1 : 0.1, ease: rewinding ? 'easeOut' : undefined }} style={{ transformOrigin: '50px 50px' }} />
            <circle cx="50" cy="50" r="3" fill="#3A2A1A" />
          </svg>
        </div>
        {/* the key */}
        <div ref={key} className="absolute bottom-[8%] right-[8%] grid aspect-square w-[26%] touch-none place-items-center rounded-full bg-[radial-gradient(circle,rgba(212,163,115,0.25),transparent_70%)]"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); acc.current.last = null; }} onPointerMove={onMove} onPointerUp={() => void release()} onPointerCancel={() => void release()} data-testid="clock-key">
          <motion.svg viewBox="0 0 100 100" className="w-[80%]" style={{ rotate: angle }} aria-hidden>
            <circle cx="50" cy="50" r="12" fill="#D4A373" stroke="#3A2A1A" strokeWidth="2" />
            <path d="M50 38 Q30 10 50 4 Q70 10 50 38Z M50 62 Q30 90 50 96 Q70 90 50 62Z" fill="#B88B5A" stroke="#3A2A1A" strokeWidth="2" />
          </motion.svg>
          <span className="absolute -top-5 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-black text-[#FFE8A3]">{left ? (turns ? `${turns} turn${turns > 1 ? 's' : ''} — let go` : '↻ wind me') : 'wound out today'}</span>
        </div>
        {/* stored time */}
        {/* (on a dark card of its own: the small print sits over the bright clock face otherwise) */}
        <div className="absolute left-3 top-3 z-[2] grid max-w-[min(68%,15rem)] gap-1 rounded-2xl bg-black/60 p-2 shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
          <span className="font-display text-[16px] font-black leading-tight text-[#FFE8A3]" data-testid="clock-charge">⏱ {Math.floor(charge)} min stored</span>
          <div className="h-1.5 w-36 max-w-full overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[linear-gradient(90deg,#D4A373,#FFE8A3)]" style={{ width: `${(charge / Number(view.cap)) * 100}%` }} /></div>
          <span className="text-[10.5px] font-bold leading-snug text-white/80">{left}/{view.turns_max} turns left today · ticks +3 min an hour</span>
          <span className="text-[10.5px] font-bold leading-snug text-[#FFE8A3]" data-testid="clock-chime">{left ? `🔔 The day’s last turn chimes: +30–50 Ink` : '🔔 Chimed today — wind again tomorrow'}</span>
        </div>
      </div>
      {view.toll && (
        <div className="grid gap-1 rounded-2xl border border-[#FFD23F]/30 bg-[#FFD23F]/[0.06] p-3" data-testid="clock-toll">
          <Button variant="rainbow" disabled={!!busy || !!view.toll_used} onClick={() => void toll()} data-testid="clock-toll-go">🔔 {view.toll_used ? 'Rung today — again tomorrow' : 'Ring the Toll of Hours'}</Button>
          <div className="text-center text-[11px] text-white/60">{tolled != null ? `The hour struck: ${tolled} enchantment${tolled === 1 ? '' : 's'} jumped 30 minutes ahead.` : '★3: once a day, every other enchantment you own jumps 30 minutes ahead.'}</div>
        </div>
      )}
      {(
        <section className="lv-tape grid gap-2 rounded-2xl p-3" data-testid="clock-rewind">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[15px] font-black tracking-wider text-[#FFE8A3] [text-shadow:1px_0_#FF2D55,-1px_0_#00E5FF]">⏪ REWIND</span>
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-black text-white/70" data-testid="clock-rewind-left">{rewLeft}/{rw.per_day ?? 1} left today · {rw.back_h ?? 12} h back{rw.half ? ' · half price' : ''}</span>
          </div>
          <AnimatePresence>
            {undone && (
              <motion.div key="undone" className="rounded-xl bg-[#00E5FF]/10 px-3 py-2 text-center text-[13px] font-black text-[#BDF6FF] ring-1 ring-[#00E5FF]/40" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} data-testid="clock-undone">
                {undone.emoji} {undone.title} — <span className="text-white">it never happened.</span>
              </motion.div>
            )}
          </AnimatePresence>
          {timeline.length ? (
            <ol className="lv-tape-reel grid gap-1.5" data-testid="clock-timeline">
              {timeline.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 rounded-xl bg-black/35 p-2" data-testid="clock-moment" data-type={m.type}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[19px]">{m.emoji}</span>
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-[12.5px] font-black">{m.title}</span>
                    <span className="truncate text-[10.5px] text-white/55">{m.kind && KIND_OF[m.kind] ? `${KIND_OF[m.kind]} ` : ''}{m.detail}</span>
                    <span className="font-mono text-[10px] font-bold text-[#00E5FF]/80">▮▮ {tapeTime(m.ago)} · {agoText(m.ago)}</span>
                  </span>
                  <Button size="sm" variant="secondary" disabled={!!busy || !!rewinding || rewLeft < 1 || charge < m.cost} onClick={() => void rewind(m)} data-testid="clock-rewind-go">⏪ {m.cost}m</Button>
                </li>
              ))}
            </ol>
          ) : <p className="text-center text-[12px] text-white/50" data-testid="clock-timeline-empty">Nothing’s gone wrong in the last {rw.back_h ?? 12} hours — no fox bites, curses, failed strikes, reversed cards, fizzles, backfires, scorches or tramples to take back.</p>}
          <div className="mt-1 grid gap-1.5 rounded-xl border border-white/10 p-2.5" data-testid="clock-rolls">
            <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] font-black text-[#FFE8A3]">🦋 Roll it again</span>
              <span className="text-[10px] font-bold text-white/55">{rollLeft}/{rw.roll_per_week ?? 1} this week · a plot claimed in the last 10 minutes{rw.paradox ? ' · ♾️ Paradox: the better timeline stands' : ' · the new roll stands'}</span></div>
            <AnimatePresence>
              {rolled && (
                <motion.div key="rolled" className="grid justify-items-center gap-0.5 rounded-xl bg-black/40 p-2 text-center" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} data-testid="clock-rolled">
                  <span className="text-[11px] text-white/55">{rarityInfo(rolled.was).name} → </span>
                  <span className="font-display text-[22px] font-black" style={{ color: readable(rarityInfo(rolled.rarity).color), textShadow: `0 0 14px ${rarityInfo(rolled.rarity).color}` }}>{rolled.kind ? `🔮 Enchanted (${kindInfo(rolled.kind).name})` : rarityInfo(rolled.rarity).name}</span>
                  {rolled.kept && <span className="text-[11px] font-black text-[#9FE8FF]">♾️ Paradox: the first timeline was better — it stands</span>}
                </motion.div>
              )}
            </AnimatePresence>
            {rolls.length ? rolls.map((p) => (
              <div key={`${p.gx}:${p.gy}`} className="flex items-center gap-2 rounded-lg bg-white/[0.04] p-1.5" data-testid="clock-roll">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: rarityInfo(p.rarity).color }} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{p.name ?? `Plot ${p.gx}, ${p.gy}`} · <span style={{ color: readable(rarityInfo(p.rarity).color) }}>{rarityInfo(p.rarity).name}</span> <span className="text-[10px] text-white/45">{Math.ceil(p.left_s / 60)} min left</span></span>
                <Button size="sm" variant="rainbow" disabled={!!busy || !!rewinding || rollLeft < 1 || charge < Number(rw.roll_cost ?? 60)} onClick={() => void rollAgain(p)} data-testid="clock-roll-go">⏪ {rw.roll_cost ?? 60}m</Button>
              </div>
            )) : <p className="text-[11px] text-white/45">Claim a plot and it shows here for 10 minutes.</p>}
          </div>
        </section>
      )}
      <div className="grid gap-1.5" data-testid="clock-targets">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[12px] font-black uppercase tracking-wider text-white/60">Bend time for…</div>
          {!mapPick.simple && targets.length > 0 && <MapPickButton testId="clock-map" label="Pick it on the map" onClick={() => mapPick.open({ title: 'Bend time for…', emoji: '⚙️', color: '#D4A373', hint: 'Tap the plot one of your enchantments lives on',
            allowed: targets.map((t) => ({ gx: t.gx, gy: t.gy, rarity: 'enchanted', name: enchantName(t), note: `${kindInfo(t.kind).emoji} ${kindInfo(t.kind).name}` })) })} />}</div>
        {targets.length ? targets.map((t) => {
          const frozen = !!t.clock?.frozen_until;
          return (
            <div key={t.id} className={cn('flex flex-wrap items-center gap-2 rounded-2xl p-2', frozen ? 'bg-[#C0F5FF]/10 ring-1 ring-[#C0F5FF]/40' : 'bg-white/[0.04]', focus === t.id && 'ring-2 ring-[#FFD23F]')} data-testid={focus === t.id ? 'clock-focus' : undefined}>
              <Sigil kind={t.kind} seed={t.sigil} size={36} still />
              <span className="grid min-w-[8.5rem] flex-1 basis-[8.5rem] leading-tight"><span className="truncate text-[13px] font-black">{enchantName(t)}</span>
                <span className="text-[10px] text-white/55">{frozen ? `❄️ frozen for ${dur((Date.parse(t.clock!.frozen_until!) - Date.now()) / 1000)}` : t.attention ?? 'ticking along'}{t.partner ? ` · 🧬 ${t.partner.hybrid}` : ''}</span></span>
              {/* (the buttons stay together, and drop under the name on a narrow phone rather than squeezing it) */}
              {frozen ? <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void act('unfreeze', { target: t.id })} disabled={!!busy}>Thaw</Button> : <div className="ml-auto flex gap-1.5">
                {[15, 60].map((m) => <Button key={m} size="sm" variant="secondary" disabled={!!busy || charge < m} onClick={() => void forward(t.id, m)} data-testid={`clock-forward-${t.kind}-${m}`}>⏩ {m < 60 ? `${m}m` : '1h'}</Button>)}
                <Button size="sm" variant="secondary" disabled={!!busy || charge < 3 * Number(view.freeze_cost)} onClick={() => void freeze(t.id, 3)} data-testid={`clock-freeze-${t.kind}`}>❄️ 3h</Button>
              </div>}
            </div>
          );
        }) : <p className="text-[12px] text-white/55">Your other enchantments will appear here.</p>}
      </div>
      <p className="text-center text-[11px] text-white/55">Fast-forward costs a minute of stored time per minute{Number(view.skip_x ?? 1) > 1 ? ` (and gives ${view.skip_x}×)` : ''}; freezing costs {view.freeze_cost} minutes an hour. Wound {v.stats?.winds ?? 0} turns in all.</p>
    </div>
  );
}
