// ✍️ Glyphcaster: a casting circle on dark slate. Draw a glyph you know with your finger — the ink glows as you go — and
// when you lift, the circle reads it: the true shape traces itself over yours in light, and the spell fires (the neater,
// the stronger). Mana orbs refill through the day. The Spellbook keeps every glyph you've found — its shape, what it
// does, its cost, your best drawing, its mastery — and smudged pages for the ones still hidden.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, useMyEnchantments, type SceneProps } from '../core';
import { PlotRow, sleep, useCraftClip, type PlotLite } from '../craft';
import { glyphPath, recognise, type Pt } from '../glyphs';
import { EnchantPicker, MapPickButton, useMapPick } from '../pickers';
import { dur, enchantName, kindInfo } from '../kinds';
import { feel } from '../living';
import { useMyPlotsLite } from '../myPlots';

type G = { id: string; name: string; cost: number; text: string; a?: 'plot' | 'enchant'; secret?: boolean; start?: boolean };
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function said(x: any) {
  switch (x.t) {
    case 'ink': return `+${x.v} Ink`; case 'luck': return `+${x.v} Luck`; case 'eluck': return `+${x.v} Enchanted Luck`;
    case 'ward': return `Plot shielded for ${Math.round(x.min / 60 * 10) / 10} h`; case 'leaf': return `That plot’s next win ×${x.m}`;
    case 'bolt': return `Leviathan hits ×${x.m} for ${x.min} min`; case 'strike': return `⚡ It struck the Leviathan: ${Number(x.dmg).toLocaleString()} damage${x.fell ? ' — and it fell!' : ''}`;
    case 'pull': return `🌀 Pulled in ${x.n} buried chest${x.n > 1 ? 's' : ''}: +${x.ink} Ink`; case 'key': return `${Math.round(x.s / 60)} minutes cut off its wait`;
    case 'xp': return `+${x.v} XP`; case 'glow': return `Enchantments ×${x.m} for ${x.h} h`; case 'wins': return `Next ${x.u} win${x.u > 1 ? 's' : ''} ×${x.m}`;
    case 'cleanse': return x.v ? `${x.v} curse${x.v > 1 ? 's' : ''} washed away` : 'No curses on you'; case 'ticket': return `A ${x.r}+ roll ticket!`;
    default: return '';
  }
}

export function GlyphMark({ id, size = 56, color = '#9EF6FF', draw, className }: { id: string; size?: number; color?: string; draw?: boolean; className?: string }) {
  return (
    <svg viewBox="-6 -6 112 112" width={size} height={size} className={className} aria-hidden>
      <motion.path d={glyphPath(id)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        initial={draw ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeInOut' }} />
    </svg>
  );
}

export function GlyphScene({ v, view, act, busy, at, mirror }: SceneProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const clip = useCraftClip(v);
  const plots = useMyPlotsLite();
  const mine = useMyEnchantments();
  const strokes = useRef<Pt[][]>([]);
  const drawing = useRef(false);
  const lift = useRef<number | null>(null);
  const [read, setRead] = useState<{ id: string; accuracy: number } | null>(null);
  // (Chain Cast: the glyphs drawn so far, waiting for the rest — two, or three with ★5 Triple Cast)
  const [queue, setQueue] = useState<{ id: string; accuracy: number }[]>([]);
  const [need, setNeed] = useState<{ ids: string[]; accuracy: number; kind: 'plot' | 'enchant' } | null>(null);
  const [shown, setShown] = useState<any>(null);
  const [chain, setChain] = useState<0 | 2 | 3>(0);
  const [arch, setArch] = useState(false);
  const [tab, setTab] = useState<'cast' | 'book'>('cast');
  const [page, setPage] = useState<string | null>(null);
  const book: G[] = view.book ?? [];
  const known: string[] = view.known ?? [];
  const mast: Record<string, number> = view.mastery ?? {}, best: Record<string, number> = view.best ?? {};
  const mana = Number(view.mana ?? 0), max = Number(view.max ?? 5);
  const nextIn = useLeft(view.next_in, at);
  const def = (id: string) => book.find((g) => g.id === id);
  const costOf = (id: string) => Math.max(1, (def(id)?.cost ?? 1) - ((mast[id] ?? 0) >= 10 ? 1 : 0));

  // ---- the ink ----
  const ctx = () => cv.current?.getContext('2d') ?? null;
  const fit = () => {
    const c = cv.current; if (!c) return;
    const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
    const g = ctx(); if (g) g.setTransform(d, 0, 0, d, 0, 0);
  };
  useEffect(() => { fit(); addEventListener('resize', fit); return () => removeEventListener('resize', fit); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const paint = () => {
    const g = ctx(), c = cv.current; if (!g || !c) return;
    g.clearRect(0, 0, c.width, c.height);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of strokes.current) {
      if (s.length < 2) continue;
      for (const [w, col, a] of [[14, '#4DD0E1', 0.18], [7, '#9EF6FF', 0.5], [3, '#FFFFFF', 0.95]] as const) {
        g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < s.length; i++) g.lineTo(s[i].x, s[i].y);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  };
  const pt = (e: React.PointerEvent): Pt => { const r = cv.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => {
    if (mirror || busy || need) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (lift.current) { clearTimeout(lift.current); lift.current = null; }
    if (read) { setRead(null); strokes.current = []; }
    drawing.current = true; strokes.current.push([pt(e)]); paint();
  };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; strokes.current[strokes.current.length - 1].push(pt(e)); paint(); };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    // a short wait, in case it's drawn in more than one stroke
    lift.current = window.setTimeout(() => { lift.current = null; void finish(); }, 420);
  };
  const clear = () => { strokes.current = []; paint(); };

  const finish = async () => {
    const all = strokes.current.flat();
    const r = recognise(all, known);
    if (!r) { feel('light'); efx.burst({ ...centerOf(box.current), colors: ['#4A5A60'], count: 24, speed: 4, kind: 'glitter' }); await sleep(250); clear(); setShown({ fizzled: true, none: true }); return; }
    setRead(r); feel('medium');
    if (chain && queue.length + 1 < chain) { setQueue((q) => [...q, r]); await sleep(500); clear(); setRead(null); return; }
    const drawn = [...queue, r];
    const ids = drawn.map((x) => x.id);
    const acc = drawn.reduce((t, x) => t + x.accuracy, 0) / drawn.length;
    const needs = ids.map((id) => def(id)?.a).find(Boolean) as 'plot' | 'enchant' | undefined;
    if (needs) { setNeed({ ids, accuracy: acc, kind: needs }); return; }
    await cast(ids, acc, {});
  };
  const plotTarget = useMapPick(v.id, 'glyph-plot', (p, k) => { if (k?.ids) void cast(k.ids as string[], Number(k.accuracy), { gx: p.gx, gy: p.gy }); });
  const cast = async (ids: string[], accuracy: number, target: Record<string, unknown>) => {
    setNeed(null);
    const r = await act('cast', { ...(ids.length > 1 ? { glyphs: ids } : { glyph: ids[0] }), accuracy, arch, ...target }, { silent: true });
    setQueue([]); setArch(false);
    await sleep(300); clear(); setRead(null);
    if (!r?.result) return;
    setShown(r.result);
    if (r.result.fizzled) { feel('light'); return; }
    feel('success');
    const at2 = centerOf(box.current);
    efx.burst({ ...at2, colors: ['#9EF6FF', '#7C4DFF', '#fff'], count: 120 + Math.round(120 * Number(r.result.power ?? 1)), speed: 13, kind: 'spark' });
    if (r.result.pay?.paid) efx.pay(r.result.pay, 'glyph', at2);
    if (r.result.found) {
      efx.burst({ ...at2, colors: ['#F5ECD7'], count: 20, speed: 8, kind: 'emoji', emojis: ['📜', '✨'] });
      clip({ title: `A glyph found: ${r.result.found.name}`, sub: v.nickname || 'Glyphcaster', emoji: '✍️', payoff: '📜', color: '#4DD0E1', kicker: 'Casting…', head: 'A NEW GLYPH!',
        lines: [r.result.found.text, r.result.found.secret ? 'A secret glyph' : 'Into the Spellbook'], text: `📜 A page fluttered out: ${r.result.found.name}!` });
    }
  };
  const study = async () => {
    const r = await act('study', {}, { silent: true });
    if (r?.result) { setShown({ studied: true, ...r.result }); if (r.result.found) { setPage(r.result.found.id); setTab('book'); efx.burst({ x: innerWidth / 2, y: innerHeight / 2, colors: ['#F5ECD7', '#9EF6FF'], count: 90, speed: 9, kind: 'glitter' }); } }
  };

  const pagesKnown = book.filter((g) => known.includes(g.id));
  return (
    <div className="grid gap-3">
      <div ref={box} className="lvx-stage lv-scene aspect-square w-full sm:aspect-[4/3]" data-testid="glyph-scene">
        <div className="lvx-parchment" />
        <div className="lvx-circle-ring spin left-[8%] right-[8%] top-[8%] bottom-[8%]" style={{ borderStyle: 'dashed' }} />
        <div className="lvx-circle-ring spin2 left-[16%] right-[16%] top-[16%] bottom-[16%]" />
        <div className="lvx-circle-ring left-[24%] right-[24%] top-[24%] bottom-[24%]" style={{ borderColor: 'rgba(124,77,255,0.35)' }} />
        <AnimatePresence>
          {read && (
            <motion.div key={read.id} className="pointer-events-none absolute inset-[14%] grid place-items-center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <GlyphMark id={read.id} size={260} color="#FFE8A3" draw className="h-full w-full" />
            </motion.div>
          )}
        </AnimatePresence>
        <canvas ref={cv} className="lvx-draw absolute inset-0 h-full w-full" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="glyph-canvas" />
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1" data-testid="glyph-mana">
          {Array.from({ length: max }, (_, i) => <motion.span key={i} className={cn('lvx-mana', i >= mana && 'empty')} animate={{ scale: i < mana ? 1 : 0.8 }} />)}
          {mana < max && nextIn != null && <span className="ml-1 rounded-full bg-black/50 px-1.5 text-[10px] font-bold text-white/70">+1 in {dur(nextIn)}</span>}
        </div>
        {queue.length > 0 && <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[#7C4DFF]/40 px-2 py-1 text-[11px] font-black text-white" data-testid="glyph-queue">{chain === 3 ? '🔯' : '⛓️'} {queue.map((x, i) => <GlyphMark key={i} id={x.id} size={20} />)} + …</div>}
        {!read && !strokes.current.length && !shown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[10%] text-center text-[12px] font-bold text-white/60">Draw a glyph you know — {known.length} found</div>
        )}
        <AnimatePresence>
          {shown && (
            <motion.div className="absolute inset-x-3 bottom-3 grid gap-1 rounded-2xl bg-[#04161C]/92 p-3" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShown(null)} data-testid="glyph-result">
              {shown.none ? <div className="text-[13px] font-bold text-white/80">The ink fades — that isn’t a glyph you know. Try again, a little neater.</div>
                : shown.fizzled ? <div className="text-[13px] font-bold text-white/80">It fizzled — too rough to hold. (1 mana)</div>
                : shown.studied ? <div className="text-[13px] font-bold text-white">{shown.found ? `📜 A page: ${shown.found.name}!` : `You turn the pages… ${shown.hint ? `“${shown.hint}”` : 'nothing new today.'}`}</div>
                : <>
                    <div className="flex items-center gap-2 font-display text-[16px] font-black text-[#9EF6FF]">{(shown.glyphs as string[]).map((id) => <GlyphMark key={id} id={id} size={26} />)}{(shown.glyphs as string[]).map((id) => def(id)?.name).join(' + ')}
                      <span className="ml-auto text-[11px] font-black text-white/70">drawn {pct(shown.accuracy)}{shown.chain ? ((shown.glyphs as string[]).length >= 3 ? ' · TRIPLE ×2' : ' · chained ×1.5') : ''}{shown.arch ? ' · Archmage' : ''}</span></div>
                    {(shown.effects as any[]).map((x, i) => <motion.div key={i} className="text-[13px] font-bold text-white" initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.12 }}>✦ {said(x)}</motion.div>)}
                    {shown.found && <div className="text-[12px] font-black text-[#FFE8A3]">📜 A page fluttered out: {shown.found.name}</div>}
                  </>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {need && (
        <div className="grid gap-1.5 rounded-2xl border border-[#4DD0E1]/40 bg-[#4DD0E1]/10 p-2.5" data-testid="glyph-target">
          <div className="text-[13px] font-black text-white">{need.kind === 'plot' ? 'Which plot?' : 'Which enchantment?'}</div>
          {need.kind === 'plot' ? (
            <>
              {!plotTarget.simple && plots.length > 0 && <MapPickButton className="w-fit" testId="glyph-target-map" label="Pick the plot on the map"
                onClick={() => plotTarget.open({ title: `Cast ${need.ids.map((id) => def(id)?.name).join(' + ')}`, emoji: '✍️', color: '#4DD0E1', hint: 'Tap one of your plots for the spell', keep: { ids: need.ids, accuracy: need.accuracy },
                  allowed: plots.map((p: PlotLite) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, name: p.name ?? null, plot_type: p.plot_type })) })} />}
              <div className="grid max-h-[180px] gap-1 overflow-y-auto">
                {plots.slice(0, 40).map((p: PlotLite) => <PlotRow key={`${p.gx},${p.gy}`} p={p} onClick={() => void cast(need.ids, need.accuracy, { gx: p.gx, gy: p.gy })} testId="glyph-target-plot" />)}
              </div>
            </>
          ) : (
            <EnchantPicker self={v} slot="glyph-enchant" title="Cast it on…" chipTestId="glyph-target-enchant" keep={{ ids: need.ids, accuracy: need.accuracy }}
              onPick={(e, k) => void cast((k?.ids as string[]) ?? need.ids, Number(k?.accuracy ?? need.accuracy), { target: e.id })} />
          )}
          <button className="text-[11px] font-bold text-white/60" onClick={() => { setNeed(null); setQueue([]); clear(); setRead(null); }}>never mind</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
        {(['cast', 'book'] as const).map((t) => <button key={t} className={cn('rounded-xl py-2 text-[12px] font-black', tab === t ? 'bg-[#4DD0E1] text-[#04161C]' : 'text-white/70')} onClick={() => setTab(t)} data-testid={`glyph-tab-${t}`}>{t === 'cast' ? '✍️ Cast' : `📖 Spellbook · ${known.length}/24`}</button>)}
      </div>

      {tab === 'cast' && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1.5">
            {view.chain && <button className={cn('rounded-full border px-3 py-1 text-[12px] font-black', chain === 2 ? 'border-[#7C4DFF] bg-[#7C4DFF]/30 text-white' : 'border-white/15 text-white/70')} onClick={() => { setChain(chain === 2 ? 0 : 2); setQueue([]); }} data-testid="glyph-chain">⛓️ Chain Cast</button>}
            {view.triple && <button className={cn('rounded-full border px-3 py-1 text-[12px] font-black', chain === 3 ? 'border-[#FFD23F] bg-[#FFD23F]/25 text-white' : 'border-white/15 text-white/70')} onClick={() => { setChain(chain === 3 ? 0 : 3); setQueue([]); }} data-testid="glyph-triple">🔯 Triple Cast</button>}
            {view.arch_ready && <button className={cn('rounded-full border px-3 py-1 text-[12px] font-black', arch ? 'border-[#FFE8A3] bg-[#FFE8A3]/20 text-white' : 'border-white/15 text-white/70')} onClick={() => setArch(!arch)} data-testid="glyph-arch">🧙 Archmage</button>}
            <Button size="sm" variant="ghost" onClick={() => { clear(); setRead(null); setQueue([]); setShown(null); }}>Wipe</Button>
            {view.study_ready && <Button size="sm" variant="rainbow" onClick={() => void study()} disabled={!!busy || !!mirror} data-testid="glyph-study">📖 Study today’s pages</Button>}
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="glyph-known">
            {pagesKnown.map((g) => (
              <button key={g.id} className="flex items-center gap-1.5 rounded-xl bg-white/5 px-2 py-1" onClick={() => { setPage(g.id); setTab('book'); }}>
                <GlyphMark id={g.id} size={24} /><span className="text-[11px] font-black text-white">{g.name}</span><span className="text-[10px] font-bold text-[#9EF6FF]">{costOf(g.id)}💧</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'book' && (
        <div className="grid gap-2">
          {page && def(page) && known.includes(page) && (
            <motion.div key={page} className="lvx-page grid grid-cols-[auto_1fr] gap-3" initial={{ rotateY: -40, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} style={{ transformPerspective: 800 }} data-testid="glyph-page">
              <GlyphMark id={page} size={96} color="#1A5F7A" draw />
              <div className="grid content-start gap-1">
                <div className="font-display text-[18px] font-black">{def(page)!.name}{def(page)!.secret ? ' · secret' : ''}</div>
                <div className="text-[12px] font-semibold">{def(page)!.text}</div>
                <div className="text-[11px] font-bold">Costs {costOf(page)} mana{(mast[page] ?? 0) >= 10 ? ' (mastered)' : ''} · best drawing {pct(best[page] ?? 0)}</div>
                <div className="h-2 overflow-hidden rounded-full bg-black/15"><div className="h-full rounded-full bg-[#1A5F7A]" style={{ width: `${Math.min(100, ((mast[page] ?? 0) / 10) * 100)}%` }} /></div>
                <div className="text-[10px] font-bold opacity-70">Mastery {Math.min(10, mast[page] ?? 0)}/10 casts</div>
              </div>
            </motion.div>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="glyph-book">
            {book.map((g) => {
              const on = known.includes(g.id);
              return (
                <button key={g.id} className={cn('lvx-page grid justify-items-center gap-1 p-2', !on && 'smudged')} onClick={() => on && setPage(g.id)} data-testid={`glyph-page-${g.id}`}>
                  <GlyphMark id={g.id} size={46} color={on ? '#1A5F7A' : '#999'} />
                  <span className="text-[11px] font-black leading-tight">{on ? g.name : g.secret ? '? ? ?' : 'An unread page'}</span>
                  {on ? <span className="text-[10px] font-bold opacity-70">{costOf(g.id)} mana · {Math.min(10, mast[g.id] ?? 0)}/10</span>
                    : (g as any).hint && <span className="text-[9.5px] font-semibold italic leading-tight opacity-70" data-testid="glyph-hint">“{(g as any).hint}”</span>}
                </button>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-white/55">New pages turn up as you cast and study — and in minigame wins, Leviathan loot, chests and rare plots. Each smudged page keeps a hint. The four secret glyphs show themselves once you’ve found twenty.</p>
        </div>
      )}
    </div>
  );
}
