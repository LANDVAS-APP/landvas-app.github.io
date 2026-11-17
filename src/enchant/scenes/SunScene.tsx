// ☀️ Pocket Sun: a newborn star in a glass orb on a brass stand. Rub the orb and it stokes hotter — amber, then
// orange-red, then white-hot, its corona flaring and the glass trembling (past 95 a rub can snuff it out). Throw it:
// it hands over to the map, you tap a spot in reach, and back here the orb launches with a comet tail and the zone
// blooms in rings. Aim the Solar Flare: a ring sweeps in on the server's clock — tap as it meets the corona.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { cellCenter } from '../../shared/grid';
import { Button } from '../../ui';
import { centerOf, efx, useTick, type SceneProps } from '../core';
import { sleep, useCraftClip, useSpotPick } from '../craft';
import { dur } from '../kinds';
import { feel } from '../living';
import './sunrod.css';

type Zone = { i: number; gx: number; gy: number; r_m: number; tier: 'warm' | 'hot' | 'white' | 'nova'; heat_now: number; mult: number; mode: 'claim' | 'orbit'; party?: boolean;
  until: number; left_s: number; flare: boolean; flare_until?: number; spots: [number, number][]; claims?: number };
const TIER: Record<string, { name: string; core: string; glow: string; rim: string }> = {
  warm: { name: 'Warm', core: '#FFE08A', glow: '#FFB703', rim: '#FF8A00' },
  hot: { name: 'Hot', core: '#FFD0A0', glow: '#FF5E3A', rim: '#D7263D' },
  white: { name: 'White-hot', core: '#FFFFFF', glow: '#BDE6FF', rim: '#7FB8FF' },
  nova: { name: 'SUPERNOVA', core: '#FFFFFF', glow: '#FF5CDB', rim: '#9FE8FF' },
};
const heatTier = (h: number) => (h >= 90 ? 'white' : h >= 50 ? 'hot' : 'warm');
const RAYS = Array.from({ length: 14 }, (_, i) => i);
const MOTES = Array.from({ length: 22 }, (_, i) => ({ x: (i * 47.3) % 100, y: 30 + ((i * 29.1) % 60), d: (i % 6) * 0.5 }));

function Orb({ heat, lit, shake, rubbing, nova }: { heat: number; lit: boolean; shake: boolean; rubbing: number; nova?: boolean }) {
  const t = TIER[nova ? 'nova' : heatTier(heat)];
  const glow = lit ? 0.55 + Math.min(1, heat / 100) * 0.45 : 0.25;
  return (
    <div className={`lv-sun-orb ${shake ? 'lv-sun-shake' : ''}`} style={{ ['--core' as any]: t.core, ['--glow' as any]: t.glow, ['--rim' as any]: t.rim }}>
      <div className="lv-sun-halo" style={{ opacity: glow, transform: `scale(${1 + rubbing * 0.25})` }} />
      <div className="lv-sun-rays" style={{ opacity: lit ? 0.9 : 0.25 }}>{RAYS.map((r) => <i key={r} style={{ transform: `rotate(${r * (360 / RAYS.length)}deg)` }} />)}</div>
      <div className="lv-sun-rays b" style={{ opacity: lit ? 0.6 : 0.15 }}>{RAYS.map((r) => <i key={r} style={{ transform: `rotate(${r * (360 / RAYS.length) + 12}deg)` }} />)}</div>
      <div className="lv-sun-core" style={{ transform: `scale(${0.7 + Math.min(1, heat / 100) * 0.3 + rubbing * 0.08})` }}><span className="lv-sun-gran" /></div>
      <div className="lv-sun-glass" />
      <div className="lv-sun-glint" />
    </div>
  );
}

export function SunScene({ v, view, act, busy, at, mirror }: SceneProps) {
  const nav = useNavigate();
  const clip = useCraftClip(v);
  const spot = useSpotPick(v, 'ignite');
  useTick(1000);
  const zones: Zone[] = view.zones ?? [];
  const z = zones[0] ?? null;
  const [heat, setHeat] = useState<number>(z ? Number(z.heat_now) : 30);
  const [rub, setRub] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'launch' | 'bloom' | 'aim' | 'flared' | 'snuffed'>('idle');
  const [ring, setRing] = useState<{ at: number; t0: number } | null>(null);
  const [grade, setGrade] = useState<any>(null);
  const [mode, setMode] = useState<'claim' | 'orbit'>('claim');
  const stage = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const rubbed = useRef({ d: 0, last: null as null | { x: number; y: number }, n: 0, t: 0 });
  useEffect(() => { if (z) setHeat(Number(z.heat_now)); }, [z?.heat_now]); // eslint-disable-line react-hooks/exhaustive-deps

  // a mirrored sun (a Mirror Shard reflecting one) is thrown around your explorer: it has no plot of its own
  const nearExplorer = !!mirror && !!view.explorer;
  const anchors = useMemo(() => {
    const a: [number, number][] = [];
    if (view.explorer) a.push([view.explorer[0], view.explorer[1]]);
    if (!nearExplorer) a.push([v.gx, v.gy]);
    return a;
  }, [view.explorer, v.gx, v.gy, nearExplorer]);

  // ---- throw it onto the map ----
  const startThrow = () => {
    feel('medium');
    const km = (Number(view.range_m ?? 2000) / 1000).toFixed(1);
    spot.start({ title: mirror ? 'Throw your mirrored Pocket Sun' : 'Throw your Pocket Sun', emoji: '☀️', color: '#FFB703', anchors, radiusM: Number(view.range_m ?? 2000),
      use: mode === 'orbit' ? 'Put it in orbit here' : 'Light it here',
      hint: nearExplorer ? `Tap anywhere within ${km} km of your explorer` : `Tap a spot within ${km} km of your explorer or any of your plots`, keep: { mode } });
  };
  useEffect(() => {
    if (!spot.done) return;
    const { gx, gy } = spot.done.plot;
    const m = ((spot.done as any).keep?.mode as 'claim' | 'orbit' | undefined) ?? mode;
    spot.clear();
    void (async () => {
      setPhase('launch'); feel('heavy');
      await sleep(700);
      const r = await act('ignite', { gx, gy, mode: m }, { silent: true });
      if (!r?.result?.zone) { setPhase('idle'); return; }
      setPhase('bloom');
      const c = centerOf(orbRef.current);
      efx.burst({ ...c, colors: ['#FFE08A', '#FFB703', '#FF5E3A', '#fff'], count: 220, speed: 14, kind: 'spark' });
      efx.burst({ ...c, colors: ['#FFB703'], count: 18, speed: 8, kind: 'emoji', emojis: ['☀️', '✨', '🔥'] });
      clip({ title: 'A Pocket Sun lit up', sub: v.nickname || 'Pocket Sun', emoji: '☀️', payoff: '🔥', color: '#FFB703',
        kicker: 'Thrown onto the map…', head: 'A SUN OF MY OWN', lines: [`${Math.round(r.result.zone.r_m)} m of private Hot Zone`, 'Ultras ×2 inside — just for me'],
        text: '☀️ My own Hot Zone just lit up — clip it?' });
      await sleep(1600); setPhase('idle');
    })();
  }, [spot.done]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- rub to stoke ----
  const onDown = (e: React.PointerEvent) => {
    if (!z || busy) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    rubbed.current = { d: 0, last: { x: e.clientX, y: e.clientY }, n: 0, t: Date.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    const r = rubbed.current;
    if (!r.last || !z) return;
    const d = Math.hypot(e.clientX - r.last.x, e.clientY - r.last.y);
    r.last = { x: e.clientX, y: e.clientY }; r.d += d;
    setRub(Math.min(1, r.d / 600));
    const strokes = Math.min(6, Math.floor(r.d / 140));
    if (strokes > r.n) {
      r.n = strokes; feel('light');
      setHeat((h) => Math.min(100, h + 7));
      const c = centerOf(orbRef.current);
      efx.burst({ ...c, colors: [TIER[heatTier(heat)].glow, '#fff'], count: 24, speed: 6, kind: 'spark' });
    }
  };
  const onUp = async () => {
    const r = rubbed.current; r.last = null;
    const n = r.n; setRub(0);
    if (!n || !z) return;
    const res = await act('stoke', { i: z.i, n }, { silent: true });
    if (!res) return;
    if (res.result?.snuffed) {
      setPhase('snuffed'); feel('heavy');
      efx.burst({ ...centerOf(orbRef.current), colors: ['#555', '#222', '#FF5E3A'], count: 120, speed: 9, kind: 'spark' });
      await sleep(2200); setPhase('idle'); setHeat(30);
      return;
    }
    const t = heatTier(Number(res.result?.heat ?? heat));
    if (t === 'white') { feel('heavy'); efx.burst({ ...centerOf(orbRef.current), colors: ['#fff', '#BDE6FF', '#7FB8FF'], count: 160, speed: 13, kind: 'spark' }); }
  };

  // ---- the Solar Flare ----
  const aim = async () => {
    const r = await act('aim', {}, { silent: true });
    if (!r?.result) return;
    const delay = (Number(r.result.ring_at) - Number(r.result.server_now)) * 1000;
    setRing({ at: performance.now() + delay, t0: performance.now() }); setPhase('aim'); setGrade(null);
  };
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (phase !== 'aim') return;
    let raf = 0;
    const loop = () => { setFrame((f) => f + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const stop = setTimeout(() => { setPhase((p) => (p === 'aim' ? 'idle' : p)); setRing(null); }, 5000);
    return () => { cancelAnimationFrame(raf); clearTimeout(stop); };
  }, [phase]);
  const fire = async () => {
    if (phase !== 'aim') return;
    feel('heavy');
    const r = await act('flare', {}, { silent: true });
    setRing(null);
    if (!r?.result) { setPhase('idle'); return; }
    setGrade(r.result); setPhase('flared');
    const c = centerOf(orbRef.current);
    const big = r.result.grade === 'PERFECT' || r.result.grade === 'GREAT';
    efx.burst({ ...c, colors: ['#fff', '#FFE08A', '#FFB703', '#FF5E3A'], count: big ? 340 : 160, speed: big ? 18 : 12, kind: 'spark' });
    if (r.result.grade === 'PERFECT') clip({ title: 'A PERFECT Solar Flare', sub: v.nickname || 'Pocket Sun', emoji: '🌞', payoff: '💥', color: '#FFB703',
      kicker: 'The ring closes…', head: 'PERFECT FLARE', lines: [`${r.result.secs} s where every claim keeps the better of two rolls`], text: '🌞 PERFECT Solar Flare — clip it?' });
    await sleep(2600); setPhase('idle');
  };
  const ringScale = ring ? Math.max(0.35, 3.2 - (2.85 * (performance.now() - ring.t0)) / Math.max(1, ring.at - ring.t0)) : 0;

  const isNova = z?.tier === 'nova';
  const t = TIER[isNova ? 'nova' : heatTier(heat)];
  const left = z ? Math.max(0, Number(z.until) - Date.now() / 1000) : 0;
  const flareLeft = z?.flare_until ? Math.max(0, Number(z.flare_until) - Date.now() / 1000) : 0;
  const showOnMap = (zz: Zone) => { const [lng, lat] = cellCenter(zz.gx, zz.gy); toMap(nav, { lng, lat, zoom: 16.4 }); };

  return (
    <div className="grid gap-3">
      <div ref={stage} className={`lvx-stage lv-scene lv-sun-stage aspect-[4/3] w-full tier-${z ? (isNova ? 'nova' : heatTier(heat)) : 'off'}`} data-testid="sun-scene"
        style={{ ['--glow' as any]: t.glow }}>
        <div className="lv-sun-sky" />
        {MOTES.map((m, i) => <span key={i} className="lv-sun-mote" style={{ left: `${m.x}%`, top: `${m.y}%`, animationDelay: `${m.d}s` }} />)}
        <svg className="absolute inset-x-0 bottom-0 h-[26%] w-full" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
          <path d="M0 14 Q22 4 48 11 T100 8 L100 26 L0 26 Z" fill="#1B0B06" /><path d="M0 20 Q30 12 62 18 T100 16 L100 26 L0 26 Z" fill="#0C0503" />
        </svg>
        {/* the stand */}
        <div className="lv-sun-stand" />
        <motion.div ref={orbRef} className="absolute left-1/2 top-[44%] aspect-square w-[42%] -translate-x-1/2 -translate-y-1/2 touch-none" data-testid="sun-orb"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => void onUp()} onPointerCancel={() => void onUp()} onClick={phase === 'aim' ? () => void fire() : undefined}
          animate={phase === 'launch' ? { y: -420, scale: 0.4, opacity: 0 } : phase === 'snuffed' ? { scale: 0.86, filter: 'grayscale(1) brightness(0.5)' } : { y: 0, scale: 1, opacity: 1, filter: 'none' }}
          transition={phase === 'launch' ? { duration: 0.7, ease: [0.4, 0, 0.9, 0.5] } : { type: 'spring', stiffness: 160, damping: 16 }}>
          <Orb heat={heat} lit={!!z} shake={!!z && heat >= 90} rubbing={rub} nova={isNova} />
          {isNova && <><span className="lv-sun-nova" /><span className="lv-sun-nova b" /></>}
          {phase === 'launch' && <span className="lv-sun-tail" />}
        </motion.div>
        {/* the flare's ring, closing in on the server's clock */}
        {phase === 'aim' && ring && (
          <button className="absolute inset-0 z-10" onClick={() => void fire()} data-testid="sun-flare-tap" aria-label="Fire the flare">
            <span className="lv-sun-ring" style={{ transform: `translate(-50%, -50%) scale(${ringScale})`, borderColor: Math.abs(ringScale - 0.62) < 0.12 ? '#fff' : t.glow }} />
            <span className="lv-sun-ring target" />
          </button>
        )}
        <AnimatePresence>
          {phase === 'bloom' && [0, 1, 2].map((i) => (
            <motion.span key={i} className="lv-sun-bloom" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 4.5, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1.4, delay: i * 0.25, ease: 'easeOut' }} />
          ))}
          {phase === 'flared' && grade && (
            <motion.div key="g" className="absolute inset-x-0 top-[12%] z-20 grid justify-items-center" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="lv-sun-grade" data-testid="sun-grade">{grade.grade}!</span>
              <span className="text-[13px] font-black text-white drop-shadow">{grade.secs} s of Solar Flare</span>
            </motion.div>
          )}
          {phase === 'snuffed' && (
            <motion.div key="s" className="absolute inset-x-0 top-[14%] z-20 text-center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="font-display text-[22px] font-black text-white/90">🌑 Too close to the sun</div>
              <div className="text-[12px] font-bold text-white/60">It burned itself out. A new one lights tomorrow.</div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* heat meter */}
        {z && (
          <div className="absolute bottom-3 left-3 right-3 z-10 grid gap-1" data-testid="sun-heat">
            <div className="flex items-center justify-between text-[11px] font-black text-white/85"><span>🔥 {t.name} · ultras ×{z.mult}</span><span>{Math.round(heat)}°</span></div>
            <div className="lv-sun-heatbar"><span style={{ transform: `scaleX(${Math.min(1, heat / 100)})` }} /><i style={{ left: '50%' }} /><i style={{ left: '90%' }} /></div>
          </div>
        )}
        {isNova && (
          <div className="absolute inset-x-0 top-[12%] z-20 grid justify-items-center text-center" data-testid="sun-nova">
            <span className="lv-sun-grade" style={{ color: '#FFE8FF' }}>💥 SUPERNOVA</span>
            <span className="text-[12px] font-black text-white drop-shadow">×{z?.mult} over {Math.round(Number(z?.r_m))} m · {dur(left)} left</span>
          </div>
        )}
        <div className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[12px] font-black text-[#FFE08A]" data-testid="sun-status">
          {z ? `☀️ ${z.mode === 'orbit' ? 'In orbit' : 'Burning'} · ${dur(left)} left${flareLeft > 0 ? ` · FLARE ${Math.ceil(flareLeft)}s` : ''}` : view.can_ignite ? '☀️ Ready to light' : `☀️ Resting · a new sun in ${dur(view.next_day_in)}`}
        </div>
        {z && <div className="absolute right-3 top-3 z-10 text-[11px] font-black text-white/70">{z.claims ?? 0} claims · {(z.spots ?? []).length} sunspots</div>}
        <div className="lvx-grain" />
      </div>

      {!z && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2" data-testid="sun-mode">
            {(['claim', 'orbit'] as const).map((m) => (
              <button key={m} className={`lv-sun-mode ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)} data-testid={`sun-mode-${m}`}>
                <b>{m === 'claim' ? '🎯 Hot Zone' : '🪐 Orbit'}</b>
                <span>{m === 'claim' ? 'Claims inside roll hotter: ultras ×2–×4, shinies ×2, sunspots' : 'Warms your plots: minigames ×1.25, enchantments 10% faster'}</span>
              </button>
            ))}
          </div>
          <Button variant="rainbow" size="lg" onClick={startThrow} disabled={!!busy || !view.can_ignite || phase !== 'idle'} data-testid="sun-throw">
            {view.can_ignite ? `☀️ Throw it onto the map (${Math.round(Number(view.r0))} m)` : `Your sun rests · ${dur(view.next_day_in)}`}
          </Button>
        </div>
      )}

      {z && (
        <div className="grid gap-2">
          <p className="text-center text-[12px] font-bold text-white/70">{heat >= 90 ? '⚠️ White-hot: half the size, burning twice as fast — one more rub could snuff it.' : 'Rub the orb to stoke it: hotter means stronger, but smaller.'}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="rainbow" onClick={() => void aim()} disabled={!!busy || !view.flare_ready || phase !== 'idle'} data-testid="sun-aim">
              {view.flare_ready ? '🌞 Solar Flare' : '🌞 Flare used today'}
            </Button>
            <Button variant="secondary" onClick={() => showOnMap(z)} data-testid="sun-map">🗺️ See it on the map</Button>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-[11.5px] font-bold">
            <button className="rounded-full bg-white/10 px-3 py-1" disabled={!!busy} onClick={() => void act('mode', { i: z.i, mode: z.mode === 'orbit' ? 'claim' : 'orbit' })} data-testid="sun-switch">
              {z.mode === 'orbit' ? '🎯 Switch to Hot Zone' : '🪐 Switch to orbit'}</button>
            {view.in_party && <button className="rounded-full bg-white/10 px-3 py-1" disabled={!!busy} onClick={() => void act('share', { i: z.i, on: !z.party })} data-testid="sun-share">
              {z.party ? '🤝 Shared with your party' : '🤝 Share with your party'}</button>}
            <button className="rounded-full bg-white/5 px-3 py-1 text-white/50" disabled={!!busy} onClick={() => void act('douse', { i: z.i })} data-testid="sun-douse">💧 Douse it</button>
          </div>
          {view.conjunction && <div className="rounded-2xl bg-[#FF5E3A]/20 px-3 py-2 text-center text-[12px] font-black text-[#FFD0A0]" data-testid="sun-conjunction">🪐 Conjunction! Your sun overlaps today’s Hot Zone — ultras up to ×{8}.</div>}
          {zones.length > 1 && <div className="text-center text-[11px] font-bold text-white/60">✨ Binary star: {zones.length} suns burning</div>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-white/70">
        <div className="rounded-xl bg-white/5 py-2"><div className="text-[16px] font-black text-white">{view.ignites ?? 0}</div>suns lit</div>
        <div className="rounded-xl bg-white/5 py-2"><div className="text-[16px] font-black text-white">{view.sun_claims ?? 0}</div>claims in its light</div>
        <div className="rounded-xl bg-white/5 py-2"><div className="text-[16px] font-black text-white">{view.sunspots ?? 0}</div>sunspots claimed</div>
      </div>
      <p className="text-center text-[11px] text-white/55">Only you see your sun (and your party, if you share it). The daily Hot Zone and your sun stack — a Conjunction.</p>
    </div>
  );
}
