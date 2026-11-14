// ⚡ Storm Coil: a Tesla coil you crank by spinning the handle. Full, it calls a 3-minute thunderstorm over your plots:
// the sky goes black, rain comes down, and bolts gather over your hybrids and your plots — a ring closes in, then the bolt
// strikes. Tap it as it lands. On a hybrid it mutates it (+6 h, a surge, an overcharge — or an Aberration); on a plot it
// pays Ink; the ones you miss may scorch the plot. The server keeps the storm's clock, so it's the same storm on the map.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { cn } from '../../lib/utils';
import { cellCenter } from '../../shared/grid';
import { Button } from '../../ui';
import { centerOf, efx, useTick, type SceneProps } from '../core';
import { ABERRATIONS, kindInfo } from '../kinds';
import { feel } from '../living';

type Bolt = { i: number; t: number; gx: number; gy: number; kind: 'mutate' | 'ink' | 'stray'; target?: string; tkind?: string };
const BOLT = 'M15 0 L4 92 L14 92 L2 220 L28 70 L17 70 L26 0 Z';

function outcome(r: any) {
  switch (r?.what) {
    case 'aberration': return `☣️ ${r.aberration}!`;
    case 'surge': return `⚡ SURGE — Traits ×${r.k}`;
    case 'overcharge': return '⚡ OVERCHARGED — next reward ×2';
    case 'extend': return `⏳ +${r.hours} h fused`;
    default: return `+${r?.ink ?? 0} Ink`;
  }
}

function Coil({ charge, live }: { charge: number; live: boolean }) {
  const h = Math.max(0, Math.min(1, charge / 100));
  return (
    <svg viewBox="0 0 120 220" className="h-full" aria-hidden>
      <defs><linearGradient id="sc-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#3D5AFE" /><stop offset="1" stopColor="#7DF9FF" /></linearGradient></defs>
      <rect x="30" y="196" width="60" height="18" rx="4" fill="#2A2F45" stroke="#7D86A8" strokeWidth="2" />
      <rect x="46" y="70" width="28" height="128" rx="6" fill="#1A1E33" stroke="#4A5274" strokeWidth="2" />
      <rect x="48" y={70 + 126 * (1 - h)} width="24" height={126 * h} rx="5" fill="url(#sc-g)" opacity="0.85" />
      {Array.from({ length: 14 }, (_, i) => <ellipse key={i} cx="60" cy={78 + i * 8.6} rx="20" ry="3.4" fill="none" stroke="#C88B3A" strokeWidth="2.2" opacity="0.9" />)}
      <ellipse cx="60" cy="54" rx="40" ry="16" fill="#2A2F45" stroke="#9AA6D6" strokeWidth="3" />
      <ellipse cx="60" cy="50" rx="30" ry="9" fill="#3A4266" />
      {live && <>
        <polyline className="lv-storm-arc" points="20,52 6,30 14,26 2,6" fill="none" stroke="#7DF9FF" strokeWidth="2.4" />
        <polyline className="lv-storm-arc" points="100,52 114,34 106,28 118,10" fill="none" stroke="#E8F6FF" strokeWidth="2.4" />
        <polyline className="lv-storm-arc" points="60,36 52,18 64,14 56,0" fill="none" stroke="#7DF9FF" strokeWidth="2" />
      </>}
    </svg>
  );
}

export function StormCoilScene({ v, view, act, busy, at }: SceneProps) {
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const acc = useRef<{ last: number | null; total: number }>({ last: null, total: 0 });
  const [offset, setOffset] = useState(() => Number(view.server_now) * 1000 - at);
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [flash, setFlash] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const ended = useRef<number | null>(null);
  const storm = view.storm as null | { n: number; at: number; until: number; bolts: Bolt[]; caught: Record<string, string> };
  useTick(storm ? 100 : 1000);
  useEffect(() => { setOffset(Number(view.server_now) * 1000 - at); }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = (Date.now() + offset) / 1000;
  const t = storm ? now - storm.at : 0;
  const charge = Number(view.charge);
  const turnsShown = Math.floor(acc.current.total / 360);

  // ---- the crank ----
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons === 0 || charge >= 100 || storm) return;
    const c = centerOf(handle.current);
    const a = (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
    if (acc.current.last != null) {
      let d = a - acc.current.last; if (d > 180) d -= 360; if (d < -180) d += 360;
      if (d > 0) {
        const before = Math.floor(acc.current.total / 360);
        const most = Math.ceil((100 - charge) / Number(view.per_turn || 10));
        acc.current.total = Math.min(acc.current.total + d, most * 360 + 359);
        if (Math.floor(acc.current.total / 360) > before) { feel('medium'); efx.burst({ ...c, colors: ['#7DF9FF', '#E8F6FF'], count: 14, speed: 6, kind: 'spark' }); }
        setAngle(acc.current.total);
      }
    }
    acc.current.last = a;
  };
  const release = async () => {
    acc.current.last = null;
    const n = Math.min(10, Math.floor(acc.current.total / 360));
    acc.current.total = 0; setAngle(0);
    if (n >= 1) await act('crank', { turns: n }, { silent: true });
  };
  const callStorm = async () => {
    feel('heavy');
    const t0 = Date.now();
    const r = await act('storm', {}, { silent: true });
    if (!r) return;
    const rtt = (Date.now() - t0) / 2;
    setOffset(Number(r.result.server_now) * 1000 + rtt - Date.now());
    setSummary(null); ended.current = null;
    setFlash((x) => x + 1);
    efx.burst({ ...centerOf(box.current), colors: ['#7DF9FF', '#3D5AFE', '#fff'], count: 220, speed: 16, kind: 'spark' });
  };

  // ---- the storm's targets, scattered like a little map around the coil ----
  const targets = useMemo(() => {
    if (!storm) return [] as { key: string; x: number; y: number; bolts: Bolt[]; kind: Bolt['kind']; tkind?: string }[];
    const m = new Map<string, Bolt[]>();
    for (const b of storm.bolts) { const k = `${b.gx},${b.gy}`; m.set(k, [...(m.get(k) ?? []), b]); }
    const keys = [...m.keys()].sort();
    return keys.map((key, i) => {
      const a = i * 2.399963, r = 12 + 30 * Math.sqrt((i + 0.5) / keys.length);
      const bs = m.get(key)!;
      return { key, x: 50 + Math.cos(a) * r * 1.15, y: 50 + Math.sin(a) * r * 0.85, bolts: bs, kind: bs[0].kind, tkind: bs[0].tkind };
    });
  }, [storm?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // a flash for every strike
  const struck = storm ? storm.bolts.filter((b) => t >= b.t && t < b.t + 0.15).map((b) => b.i).join(',') : '';
  useEffect(() => { if (struck) { setFlash((x) => x + 1); feel('light'); } }, [struck]);

  // when it's over, settle it (once)
  useEffect(() => {
    if (!storm || ended.current === storm.n || now < storm.until + 3.5) return;
    ended.current = storm.n;
    void (async () => {
      const r = await act('end', {}, { at: centerOf(box.current) });
      if (r) setSummary(r.result.last);
    })();
  });

  const tap = async (tg: (typeof targets)[number], ev: React.PointerEvent) => {
    if (!storm) return;
    const b = tg.bolts.find((x) => t >= x.t - 1.6 && t <= x.t + 0.8 && !storm.caught[String(x.i)]);
    const r0 = box.current?.getBoundingClientRect();
    const x = r0 ? ((ev.clientX - r0.left) / r0.width) * 100 : tg.x, y = r0 ? ((ev.clientY - r0.top) / r0.height) * 100 : tg.y;
    if (!b) { feel('light'); return; }
    feel('heavy');
    const r = await act('catch', { i: b.i }, { silent: true });
    if (!r) return;
    const id = Date.now() + Math.random();
    setPops((p) => [...p, { id, x, y, text: outcome(r.result) }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 1700);
    efx.burst({ x: ev.clientX, y: ev.clientY, colors: r.result.what === 'aberration' ? ['#FF5C8A', '#FFD23F', '#fff'] : ['#7DF9FF', '#E8F6FF', '#FFE8A3'], count: r.result.what === 'aberration' ? 220 : 70, speed: 11, kind: 'spark' });
    feel('success');
  };
  const watchOnMap = () => { const [lng, lat] = cellCenter(v.gx, v.gy); toMap(nav, { lng, lat, zoom: 16.5 }); };

  const left = storm ? Math.max(0, storm.until - now) : 0;
  const caughtN = storm ? Object.keys(storm.caught ?? {}).length : 0;
  return (
    <div className="grid gap-3">
      <div ref={box} className="lv-scene aspect-[4/3] w-full" style={{ background: storm ? 'radial-gradient(circle at 50% 10%,#1B2347,#03050F 75%)' : 'radial-gradient(circle at 50% 30%,#14204A,#04081A 75%)' }} data-testid="storm-scene">
        {storm ? (
          <>
            <div className="lv-storm-rain" />
            <div className="lv-storm-cloud pointer-events-none absolute inset-x-[-10%] top-[-6%] h-[26%] text-center text-[64px] leading-none opacity-90">☁️☁️☁️☁️</div>
            {targets.map((tg) => {
              const live = tg.bolts.find((b) => t >= b.t - 1.6 && t <= b.t + 0.8);
              const caught = tg.bolts.some((b) => storm.caught[String(b.i)] && t >= b.t - 1.6);
              const charging = live && t < live.t && !storm.caught[String(live.i)];
              const strike = live && t >= live.t;
              return (
                <button key={tg.key} className={cn('lv-storm-tgt', charging && 'charging', strike && 'strike', caught && 'caught')} style={{ left: `${tg.x}%`, top: `${tg.y}%` }}
                  onPointerDown={(e) => void tap(tg, e)} data-testid={`storm-tgt-${tg.kind}`}>
                  <span className="ret" />
                  <svg className="bolt" viewBox="0 0 30 220" aria-hidden><path d={BOLT} fill={tg.kind === 'stray' ? '#FFD23F' : '#E8F6FF'} stroke="#7DF9FF" strokeWidth="2" /></svg>
                  <span className="relative">{tg.kind === 'mutate' ? kindInfo(tg.tkind).emoji : tg.kind === 'stray' ? '🏘️' : '🟫'}</span>
                </button>
              );
            })}
            <div className="pointer-events-none absolute bottom-[3%] left-1/2 h-[30%] -translate-x-1/2"><Coil charge={100} live /></div>
            <div className="absolute left-3 top-3 grid gap-1">
              <span className="rounded-full bg-black/55 px-3 py-1 font-display text-[16px] font-black text-[#7DF9FF]" data-testid="storm-left">⛈️ {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}</span>
              <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-black text-white/80">⚡ {caughtN}/{storm.bolts.length} caught · +{Number((storm as any).ink ?? 0)} Ink</span>
            </div>
            {left <= 0 && <div className="absolute inset-0 grid place-items-center bg-black/50 font-display text-2xl font-black text-white">The storm passes…</div>}
          </>
        ) : (
          <>
            <div className="absolute inset-y-[6%] left-[14%]"><Coil charge={charge} live={charge >= 100} /></div>
            {/* the crank */}
            <div ref={handle} className="absolute bottom-[10%] right-[8%] grid aspect-square w-[34%] touch-none place-items-center rounded-full bg-[radial-gradient(circle,rgba(125,249,255,0.18),transparent_70%)]"
              onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); acc.current.last = null; }} onPointerMove={onMove} onPointerUp={() => void release()} onPointerCancel={() => void release()} data-testid="storm-crank">
              <motion.svg viewBox="0 0 100 100" className="w-[86%]" style={{ rotate: angle }} aria-hidden>
                <circle cx="50" cy="50" r="30" fill="#1A1E33" stroke="#9AA6D6" strokeWidth="4" />
                <rect x="46" y="14" width="8" height="38" rx="4" fill="#C88B3A" /><circle cx="50" cy="14" r="9" fill="#E8F6FF" stroke="#3D5AFE" strokeWidth="3" />
                <circle cx="50" cy="50" r="7" fill="#C88B3A" />
              </motion.svg>
              <span className="absolute -top-5 whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black text-[#7DF9FF]">{charge >= 100 ? 'fully charged' : turnsShown ? `${turnsShown} turn${turnsShown > 1 ? 's' : ''} — let go` : '↻ spin to crank'}</span>
            </div>
            <div className="absolute left-3 top-3 grid gap-1">
              <span className="rounded-full bg-black/50 px-3 py-1 font-display text-[16px] font-black text-[#7DF9FF]" data-testid="storm-charge">⚡ {Math.round(charge)}%</span>
              <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-white/75">{view.storms_left}/{view.per_day} storm{view.per_day > 1 ? 's' : ''} left today · {view.hybrids} hybrid{view.hybrids === 1 ? '' : 's'} to strike</span>
            </div>
          </>
        )}
        {flash > 0 && <div key={flash} className="lv-storm-flash" />}
        {pops.map((p) => <span key={p.id} className="lv-storm-pop" style={{ left: `${p.x}%`, top: `${p.y}%` }}>{p.text}</span>)}
        <AnimatePresence>
          {summary && !storm && (
            <motion.div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSummary(null)} data-testid="storm-summary">
              <div className="grid justify-items-center gap-1.5">
                <span className="text-5xl">⛈️</span>
                <span className="font-display text-2xl font-black text-[#7DF9FF]">{summary.caught}/{summary.of} bolts caught</span>
                <span className="text-[13px] font-black text-[#FFE8A3]">+{summary.ink} Ink{summary.scorched ? ` · ${summary.scorched} plot${summary.scorched > 1 ? 's' : ''} scorched` : ''}</span>
                {(summary.mut ?? []).map((m: any, i: number) => <span key={i} className="text-[12px] text-white/85">{kindInfo(m.kind).emoji} {m.hybrid ?? m.from}: {outcome(m)}{m.what === 'aberration' ? ` — ${ABERRATIONS[m.aberration]?.secret ?? ''}` : ''}</span>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {storm ? (
        <div className="grid gap-2">
          <p className="text-center text-[12px] font-bold text-white/75">Tap a bolt as the ring closes and it strikes. On a hybrid it mutates it; on a plot it pays Ink — miss it and it may scorch the plot.</p>
          <Button variant="secondary" onClick={watchOnMap} data-testid="storm-map">📍 Watch it on the map</Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Button variant="rainbow" size="lg" disabled={!!busy || charge < 100 || Number(view.storms_left) < 1} onClick={() => void callStorm()} data-testid="storm-call">
            {Number(view.storms_left) < 1 ? 'The sky is spent for today' : charge < 100 ? `Crank it to 100% (${Math.ceil((100 - charge) / Number(view.per_turn || 10))} more turns)` : '⛈️ CALL THE STORM'}
          </Button>
          <p className="text-center text-[11px] text-white/50">{view.hybrids ? `Your ${view.hybrids} spliced enchantment${view.hybrids > 1 ? 's' : ''} will draw the lightning.` : 'Splice something first — lightning on a hybrid mutates it. Plots only pay Ink.'} Neighbours can catch the stray bolts.</p>
          {view.last && <p className="text-center text-[11px] text-white/45">Last storm: {view.last.caught}/{view.last.of} caught · +{view.last.ink} Ink{view.last.scorched ? ` · ${view.last.scorched} scorched` : ''}</p>}
        </div>
      )}
      <p className="text-center text-[11px] text-white/45">{Number(v.stats?.storms ?? 0)} storms · {Number(v.stats?.bolts ?? 0)} bolts caught · {Number(v.stats?.aberrations ?? 0)} Aberrations</p>
    </div>
  );
}
