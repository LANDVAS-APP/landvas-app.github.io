// 🫙 Déjà Vu: a glass jar on a shelf at dusk. The moments you've caught drift inside it as little lights, each in its
// own colour, fainter as they fade. Whatever's happening near you right now — the day's Hot Zone, a Solar Flare, the
// Leviathan's weak moment, a storm, a falling star, your Golden Hour — floats above the jar as a wisp: drag it in (or tap
// "Catch it"), then twist the lid shut with a finger round the rim. Uncork one later: the lid pops, and the moment
// happens again — a zone you place on the map, a weak spot for everyone, a bolt into one of your hybrids, stars in your
// hand, a Golden Hour that starts again.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { cellCenter } from '../../shared/grid';
import { Button } from '../../ui';
import { centerOf, efx, useTick, type SceneProps } from '../core';
import { sleep, useCraftClip, useSpotPick } from '../craft';
import { dur, kindInfo } from '../kinds';
import { feel } from '../living';
import './dejavu.css';

type Moment = { i: number; t: MomentT; name: string; emoji: string; from?: string; d?: any; at: number; s: number; pct: number; gone_at: number | null; dt?: boolean };
type Live = { t: MomentT; src: string; name: string; emoji: string; from?: string; d?: any };
type Zone = { i: number; t: 'hotzone' | 'flare'; gx: number; gy: number; r_m: number; um: number; flare: boolean; until: number; party?: boolean };
type MomentT = 'hotzone' | 'flare' | 'weakspot' | 'bolt' | 'star' | 'golden';

/** each moment's colours, and what uncorking it does */
const LOOK: Record<MomentT, { c: string; c2: string; does: (m?: Moment) => string }> = {
  hotzone: { c: '#FF8A3D', c2: '#FFD166', does: () => 'Place it on the map: your own Déjà Vu zone — claims inside roll again with ultras ×2.5, for 15 minutes.' },
  flare: { c: '#FDE68A', c2: '#FFFFFF', does: () => 'Place it on the map: for a minute, every claim inside keeps the better of two rolls.' },
  weakspot: { c: '#FF4D6D', c2: '#FFB3C1', does: (m) => `The Leviathan’s ${m?.d?.label ?? 'weak moment'} happens again — for everyone fighting it, half as long.` },
  bolt: { c: '#7DF9FF', c2: '#3D5AFE', does: () => 'Strikes one of your hybrids: a storm mutation — a surge, an overcharge, more time fused, or 1 in 6 an Aberration.' },
  star: { c: '#C4B5FD', c2: '#FDE68A', does: () => 'Three falling stars land in your hand: Ink, Luck or a Golden Hour each.' },
  golden: { c: '#FFD23F', c2: '#FF9F1C', does: (m) => `Your Golden Hour starts again: your next ${m?.d?.uses ?? 3} minigame wins pay ×${m?.d?.mult ?? 2}.` },
};
const DUST = Array.from({ length: 18 }, (_, i) => ({ x: (i * 37.7) % 100, y: 8 + ((i * 23.3) % 62), d: (i % 7) * 0.9 }));
const look = (t: string) => LOOK[t as MomentT] ?? LOOK.star;

function Jar({ open, moments, glow, boxRef }: { open: boolean; moments: Moment[]; glow: string; boxRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={boxRef} className="lv-dv-jar" data-testid="dv-jar">
      <svg viewBox="0 0 200 240" aria-hidden>
        <defs>
          <linearGradient id="dv-glass" x1="0" x2="1"><stop offset="0" stopColor="#E9E3FF" stopOpacity="0.32" /><stop offset="0.25" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="0.7" stopColor="#B9C6FF" stopOpacity="0.06" /><stop offset="1" stopColor="#E9E3FF" stopOpacity="0.28" /></linearGradient>
          <linearGradient id="dv-lid" x1="0" x2="1"><stop offset="0" stopColor="#6B7280" /><stop offset="0.45" stopColor="#E5E7EB" /><stop offset="1" stopColor="#4B5563" /></linearGradient>
          <radialGradient id="dv-glow" cx="0.5" cy="0.62" r="0.6"><stop offset="0" stopColor={glow} stopOpacity="0.55" /><stop offset="1" stopColor={glow} stopOpacity="0" /></radialGradient>
        </defs>
        {/* the glow of what's inside */}
        <ellipse cx="100" cy="150" rx="86" ry="84" fill="url(#dv-glow)" />
        {/* the glass: shoulders, body, base */}
        <path d="M58 52 Q58 40 70 38 L130 38 Q142 40 142 52 L142 62 Q178 72 178 112 L178 206 Q178 230 152 232 L48 232 Q22 230 22 206 L22 112 Q22 72 58 62 Z"
          fill="url(#dv-glass)" stroke="#E9E3FF" strokeOpacity="0.55" strokeWidth="2.5" />
        <path d="M36 116 Q36 92 52 84" stroke="#fff" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M40 140 L40 196" stroke="#fff" strokeOpacity="0.22" strokeWidth="4" strokeLinecap="round" />
        {/* a paper label */}
        <rect x="62" y="150" width="76" height="36" rx="6" fill="#F5EBD7" opacity="0.92" />
        <text x="100" y="166" textAnchor="middle" fontSize="11" fontWeight="900" fill="#3B2A1E" fontFamily="Georgia, serif">déjà vu</text>
        <text x="100" y="179" textAnchor="middle" fontSize="7.5" fill="#6B4B33" fontFamily="Georgia, serif">{moments.length ? `${moments.length} kept` : 'empty'}</text>
        {/* the lid, with its threads */}
        <g className={`lv-dv-lid ${open ? 'off' : ''}`}>
          <rect x="52" y="14" width="96" height="28" rx="6" fill="url(#dv-lid)" stroke="#374151" strokeWidth="1.5" />
          <g className="lv-dv-threads" stroke="#374151" strokeOpacity="0.55" strokeWidth="2">
            {Array.from({ length: 9 }, (_, i) => <line key={i} x1={60 + i * 10} y1="18" x2={56 + i * 10} y2="38" />)}
          </g>
          <rect x="52" y="12" width="96" height="6" rx="3" fill="#F3F4F6" opacity="0.7" />
        </g>
      </svg>
      <div className="lv-dv-inside">
        {moments.map((m, n) => (
          <span key={m.i} className={`lv-dv-mote ${m.s < 0.7 ? 'faint' : ''}`} data-testid="dv-mote"
            style={{ ['--c' as any]: look(m.t).c, ['--r' as any]: `${18 + (n % 3) * 12}px`, ['--d' as any]: `${5 + n * 1.3}s`, animationDelay: `${-n * 1.7}s`, opacity: 0.35 + m.s * 0.65 }}>
            <span style={{ animationDelay: `${-n * 1.7}s` }}>{m.emoji}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** twist the lid shut: a finger (or two) round the rim — a quarter turn per tap works too */
function Twist({ color, onDone, onCancel }: { color: string; onDone: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [turn, setTurn] = useState(0);
  const last = useRef<number | null>(null);
  const clicks = useRef(0);
  const NEED = 300;
  const angle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const add = (d: number) => setTurn((t) => {
    const n = Math.min(NEED, t + Math.abs(d));
    if (Math.floor(n / 45) > clicks.current) { clicks.current = Math.floor(n / 45); feel('light'); }
    return n;
  });
  useEffect(() => { if (turn >= NEED) { feel('heavy'); onDone(); } }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = turn / NEED;
  return (
    <>
      <div ref={ref} className="lv-dv-ring" style={{ top: '30%' }} data-testid="dv-twist"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); last.current = angle(e); }}
        onPointerMove={(e) => {
          if (last.current == null) return;
          const a = angle(e); let d = a - last.current;
          if (d > 180) d -= 360; if (d < -180) d += 360;
          last.current = a; add(d);
        }}
        onPointerUp={() => { last.current = null; }}
        onClick={() => add(90)}>
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="44" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="6" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" pathLength={1}
            strokeDasharray={`${pct} 1`} transform="rotate(-90 50 50)" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <path d="M84 30 l6 -9 l3 11 z" fill="#fff" opacity={pct < 1 ? 0.9 : 0} />
        </svg>
      </div>
      <div className="lv-dv-hint" style={{ top: '6%' }}>Twist the lid shut ↻<div className="mt-1 text-[11px] font-bold text-white/70">circle the rim with a finger — or tap it</div></div>
      <button className="absolute bottom-3 right-3 z-[8] rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-white/80" onClick={onCancel}>Let it go</button>
    </>
  );
}

export function DejaVuScene({ v, view, act, busy }: SceneProps) {
  const nav = useNavigate();
  const clip = useCraftClip(v);
  const spot = useSpotPick(v, 'uncork');
  useTick(1000);
  const jar: Moment[] = view.jar ?? [];
  const live: Live[] = view.live ?? [];
  const zones: Zone[] = view.zones ?? [];
  const cap: number = view.cap ?? 3;
  const [catching, setCatching] = useState<Live | null>(null);
  const [held, setHeld] = useState<{ src: string; x: number; y: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [aim, setAim] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const jarRef = useRef<HTMLDivElement>(null);
  const full = jar.length >= cap;
  const chosen = jar.find((m) => m.i === sel) ?? null;
  const glow = jar.length ? look(jar[jar.length - 1].t).c : '#7C6BD9';
  const anchors = useMemo(() => {
    const a: [number, number][] = [];
    if (view.explorer) a.push([view.explorer[0], view.explorer[1]]);
    a.push([v.gx, v.gy]);
    return a;
  }, [view.explorer, v.gx, v.gy]);

  // ---- catch it: drag a wisp into the jar, then twist the lid ----
  const overJar = (x: number, y: number) => {
    const r = jarRef.current?.getBoundingClientRect();
    return !!r && x > r.left - 20 && x < r.right + 20 && y > r.top - 30 && y < r.bottom;
  };
  const startCatch = (m: Live) => {
    if (full) return;
    feel('medium'); setOpen(true); setCatching(m);
  };
  const sealed = async () => {
    const m = catching;
    if (!m) return;
    const r = await act('scoop', { src: m.src }, { silent: true });
    setCatching(null); setOpen(false);
    if (!r?.result?.scooped) return;
    const c = centerOf(jarRef.current);
    efx.burst({ ...c, colors: [look(m.t).c, look(m.t).c2, '#fff'], count: 120, speed: 9, kind: 'spark' });
    efx.burst({ ...c, colors: [look(m.t).c], count: 10, speed: 6, kind: 'emoji', emojis: [m.emoji, '🫙', '✨'] });
    feel('success');
    setFlash(`${m.emoji} Caught ${m.name}`);
    setTimeout(() => setFlash(null), 2200);
  };

  // ---- uncork it ----
  const uncork = async (m: Moment, args: Record<string, unknown> = {}) => {
    setOpen(true); feel('heavy');
    await sleep(450);
    const r = await act('uncork', { i: m.i, ...args }, { silent: true });
    setOpen(false); setAim(null); setSel(null);
    if (!r?.result) return;
    const res = r.result, c = centerOf(jarRef.current), L = look(m.t);
    efx.burst({ ...c, colors: [L.c, L.c2, '#fff'], count: 200, speed: 13, kind: 'spark' });
    efx.burst({ ...c, colors: [L.c], count: 16, speed: 9, kind: 'emoji', emojis: [m.emoji, '✨', '🫙'] });
    if (res.stars?.pay?.paid) efx.pay(res.stars.pay, 'dejavu', c);
    const line = res.zone ? (res.zone.flare ? 'A Flare zone — better of two rolls' : `A Déjà Vu zone — ultras ×${res.zone.um}`)
      : res.lev ? `${res.lev.label} — again, for everyone` : res.bolt ? (res.bolt.what === 'aberration' ? `It mutated into ${res.bolt.aberration}!` : `Lightning struck a hybrid: ${res.bolt.what}`)
      : res.stars ? `${res.stars.n} stars fell into my hand` : res.golden ? `A Golden Hour again: ${res.golden.uses} wins ×${res.golden.mult}` : 'It happened again';
    setFlash(`${m.emoji} ${line}${res.double_take ? ' · half stayed in the jar' : ''}`);
    setTimeout(() => setFlash(null), 3200);
    clip({ title: 'Déjà vu', sub: v.nickname || 'Déjà Vu', emoji: '🫙', payoff: m.emoji, color: L.c, kicker: `Uncorking ${m.name}…`,
      head: 'IT HAPPENED AGAIN', lines: [line, `${m.pct}% strength`], text: `🫙 I let ${m.name} out of my jar — clip it?` });
  };
  const startUncork = (m: Moment) => {
    if (m.t === 'hotzone' || m.t === 'flare') {
      const km = (Number(view.range_m ?? 2000) / 1000).toFixed(1);
      spot.start({ title: `Uncork ${m.name}`, emoji: m.emoji, color: look(m.t).c, anchors, radiusM: Number(view.range_m ?? 2000), use: 'Let it happen here',
        hint: `Tap a spot within ${km} km of your explorer or any of your plots`, keep: { i: m.i } });
      return;
    }
    if (m.t === 'bolt') { setAim(m.i); return; }
    void uncork(m);
  };
  // (back from the map with a spot)
  useEffect(() => {
    if (!spot.done) return;
    const { gx, gy } = spot.done.plot;
    const i = Number((spot.done as any).keep?.i);
    spot.clear();
    const m = jar.find((x) => x.i === i);
    if (m) void uncork(m, { gx, gy });
  }, [spot.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const goHotZone = () => {
    const hz = view.hot_zone;
    if (!hz) return;
    const [lng, lat] = cellCenter(Number(hz.gx), Number(hz.gy));
    toMap(nav, { lng, lat, zoom: 13 });
  };
  const goZone = (z: Zone) => { const [lng, lat] = cellCenter(z.gx, z.gy); toMap(nav, { lng, lat, zoom: 16.5 }); };
  const now = Date.now() / 1000;

  return (
    <div className="grid gap-3">
      <div ref={stage} className="lvx-stage lv-scene lv-dv-stage aspect-[4/3] w-full touch-none select-none" data-testid="dejavu-scene"
        onPointerMove={(e) => { if (held) setHeld({ ...held, x: e.clientX, y: e.clientY }); }}
        onPointerUp={(e) => {
          if (!held) return;
          const m = live.find((x) => x.src === held.src);
          setHeld(null);
          if (m && overJar(e.clientX, e.clientY)) startCatch(m);
        }}>
        {DUST.map((d, i) => <i key={i} className="lv-dv-dust" style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.d}s` }} />)}
        <Jar open={open} moments={jar} glow={glow} boxRef={jarRef} />
        {/* what's happening near you: drag it into the jar */}
        {!catching && !full && live.map((m, n) => {
          const isHeld = held?.src === m.src;
          const r = stage.current?.getBoundingClientRect();
          const pos = isHeld && r ? { left: held!.x - r.left - 60, top: held!.y - r.top - 18 } : { left: `${8 + (n % 2) * 48}%`, top: `${6 + Math.floor(n / 2) * 13}%` };
          return (
            <div key={m.src} className={`lv-dv-wisp ${isHeld ? 'held' : ''}`} style={{ ['--c' as any]: look(m.t).c, ...pos }} data-testid="dv-wisp" data-t={m.t}
              onPointerDown={(e) => { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); setHeld({ src: m.src, x: e.clientX, y: e.clientY }); feel('light'); }}>
              <b>{m.emoji}</b><span className="truncate">{m.name}</span>
            </div>
          );
        })}
        {held && <div className="lv-dv-hint" style={{ bottom: '4%' }}>Drop it in the jar</div>}
        {catching && <Twist color={look(catching.t).c} onDone={() => void sealed()} onCancel={() => { setCatching(null); setOpen(false); }} />}
        {!catching && !live.length && !jar.length && (
          <div className="lv-dv-hint" style={{ top: '9%' }}>An empty jar<div className="mt-1 text-[11px] font-bold text-white/65">nothing is happening near you right now</div></div>
        )}
        {full && !!live.length && !catching && <div className="lv-dv-hint" style={{ top: '6%' }}>The jar is full<div className="mt-1 text-[11px] font-bold text-white/65">uncork a moment to make room</div></div>}
        <AnimatePresence>
          {flash && <motion.div className="absolute inset-x-3 bottom-3 z-[9] rounded-2xl bg-black/70 px-3 py-2 text-center text-[13px] font-black text-white" data-testid="dv-flash"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{flash}</motion.div>}
        </AnimatePresence>
        <div className="absolute bottom-3 left-3 z-[4] rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-black text-white" data-testid="dv-count">🫙 {jar.length}/{cap}</div>
        <div className="lvx-grain" />
      </div>

      {/* happening now */}
      {live.length > 0 && (
        <div className="grid gap-2 rounded-2xl bg-white/[0.04] p-3" data-testid="dv-live">
          <div className="lvx-label">Happening near you now</div>
          {live.map((m) => (
            <div key={m.src} className="lv-dv-item" style={{ ['--c' as any]: look(m.t).c }}>
              <span className="lv-dv-orb">{m.emoji}</span>
              <span className="grid min-w-0 leading-tight"><b className="truncate text-[13px]">{m.name}</b><span className="truncate text-[11px] text-white/60">{m.from ?? 'near you'}</span></span>
              <Button size="sm" variant="rainbow" disabled={full || !!busy || !!catching} onClick={() => startCatch(m)} data-testid="dv-catch">{full ? 'Jar full' : 'Catch it'}</Button>
            </div>
          ))}
        </div>
      )}

      {/* in the jar */}
      <div className="grid gap-2 rounded-2xl bg-white/[0.04] p-3" data-testid="dv-shelf">
        <div className="flex items-center justify-between"><span className="lvx-label">In the jar</span>
          <span className="text-[11px] font-bold text-white/55">{view.fade_d ? `moments fade over ${view.fade_d} days` : 'moments never fade (★5)'}</span></div>
        {jar.length === 0 && <p className="text-[12px] text-white/60">Nothing caught yet. Moments to catch: today’s Hot Zone, a Solar Flare from a Pocket Sun, the Leviathan’s weak moment, a storm or a falling star within {((view.range_m ?? 2000) / 1000).toFixed(0)} km of your explorer, your own Golden Hour.</p>}
        <div className="lv-dv-shelf">
          {jar.map((m) => {
            const L = look(m.t), on = sel === m.i;
            return (
              <div key={m.i} className={`lv-dv-item ${on ? 'on' : ''}`} style={{ ['--c' as any]: L.c }} data-testid="dv-moment" data-t={m.t}>
                <button className="lv-dv-orb" onClick={() => setSel(on ? null : m.i)} aria-label={`${m.name}: what it does`}>{m.emoji}</button>
                <button className="grid min-w-0 gap-1 text-left leading-tight" onClick={() => setSel(on ? null : m.i)}>
                  <b className="truncate text-[13px]">{m.name}{m.dt ? ' · half' : ''}</b>
                  <span className="lv-dv-bar"><span style={{ transform: `scaleX(${Math.max(0.02, m.s)})` }} /></span>
                  <span className="truncate text-[11px] text-white/60">{m.pct}% strength{m.gone_at ? ` · fades in ${dur(m.gone_at - now)}` : ''}{m.from ? ` · ${m.from}` : ''}</span>
                </button>
                <Button size="sm" disabled={!!busy || !!catching} onClick={() => startUncork(m)} data-testid="dv-uncork">Uncork</Button>
              </div>
            );
          })}
        </div>
        {chosen && (
          <div className="grid gap-2 rounded-xl bg-black/25 p-2.5 text-[12px]" data-testid="dv-detail">
            <span className="font-bold text-white/85">{look(chosen.t).does(chosen)} {chosen.pct < 100 ? `At ${chosen.pct}% strength it comes out a little weaker.` : ''}{view.vintage ? ' ★4 Vintage: 50% stronger.' : ''}</span>
            <button className="justify-self-start text-[11px] font-bold text-white/50 underline" disabled={!!busy} onClick={() => void act('pour', { i: chosen.i }).then(() => setSel(null))} data-testid="dv-pour">Pour it out</button>
          </div>
        )}
        {aim != null && (
          <div className="grid gap-2 rounded-xl bg-[#7DF9FF]/10 p-2.5" data-testid="dv-aim">
            <span className="text-[12px] font-black">⚡ Which hybrid should the lightning strike?</span>
            {(view.hybrids ?? []).length === 0 && <span className="text-[12px] text-white/65">None of your enchantments is spliced right now — splice two, then uncork it.</span>}
            <div className="flex flex-wrap gap-1.5">
              {(view.hybrids ?? []).map((h: any) => (
                <button key={h.id} className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-black text-white" disabled={!!busy} data-testid="dv-hybrid"
                  onClick={() => { const m = jar.find((x) => x.i === aim); if (m) void uncork(m, { target: h.id }); }}>
                  {kindInfo(h.kind).emoji} {h.hybrid ?? h.name}
                </button>
              ))}
            </div>
            <button className="justify-self-start text-[11px] font-bold text-white/50 underline" onClick={() => setAim(null)}>Not now</button>
          </div>
        )}
      </div>

      {/* zones it let out */}
      {zones.length > 0 && (
        <div className="grid gap-2 rounded-2xl bg-white/[0.04] p-3" data-testid="dv-zones">
          <div className="lvx-label">Let out on the map</div>
          {zones.map((z) => (
            <div key={z.i} className="flex items-center gap-2 text-[12.5px] font-bold">
              <span>{z.flare ? '🌞' : '🫙'}</span>
              <span className="flex-1">{z.flare ? 'A Flare zone — better of two rolls' : `A Déjà Vu zone — ultras ×${z.um}`} · {Math.round(z.r_m)} m{z.party ? ' · shared' : ''} · {dur(z.until - now)} left</span>
              <Button size="sm" variant="secondary" onClick={() => goZone(z)}>Map →</Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {view.hot_zone && <Button size="sm" variant="secondary" onClick={goHotZone} data-testid="dv-go-hot">🔥 Today’s Hot Zone: {view.hot_zone.name}</Button>}
        {view.double_take && <span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black text-white/80">🔁 Double Take ready today</span>}
        {view.shared && <span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black text-white/80">♾️ Zones shared with your party</span>}
      </div>
    </div>
  );
}
