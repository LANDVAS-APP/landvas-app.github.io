// What makes an enchantment feel alive: your phone as the controller (shake, tilt, rub, hold), a look that changes as it
// levels up (3, 6, 10), a sleepy night where its plot is, dust when it's been left alone, and a hybrid that wears both of
// its parents. Small shared pieces the scenes, the map and the Grimoire all use.
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';
import { Sigil } from './Sigil';
import { kindInfo, nightAt } from './kinds';
import { cellCenter } from '../shared/grid';

const haptics = () => useUi.getState().settings.haptics;
export const feel = (k: Parameters<typeof buzz>[0] = 'light') => { if (haptics()) buzz(k); };

// ---- the phone as a controller --------------------------------------------------------------------------------------
let motionAsked = false;
/** iOS asks before it shares motion: ask once, on a tap */
export async function askMotion() {
  if (motionAsked) return true;
  motionAsked = true;
  const D = (globalThis as any).DeviceMotionEvent, O = (globalThis as any).DeviceOrientationEvent;
  try {
    if (D?.requestPermission) await D.requestPermission();
    if (O?.requestPermission) await O.requestPermission();
  } catch { /* declined: taps still work */ }
  return true;
}

/** a shake of the phone (each one calls back, at most every 450 ms) */
export function useShake(on: (() => void) | null, threshold = 22) {
  const cb = useRef(on); cb.current = on;
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const f = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity ?? e.acceleration;
      if (!a) return;
      const m = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = performance.now();
      if (m > threshold && now - last > 450) { last = now; cb.current?.(); }
    };
    addEventListener('devicemotion', f);
    return () => removeEventListener('devicemotion', f);
  }, [!!on, threshold]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** the phone's tilt, front-to-back (−1 tipped toward you … +1 tipped away) — null on a desktop */
export function useTilt(on = true) {
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    let raf = 0, v: number | null = null;
    const f = (e: DeviceOrientationEvent) => {
      if (e.beta == null) return;
      v = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setT(v); });
    };
    addEventListener('deviceorientation', f);
    return () => { removeEventListener('deviceorientation', f); cancelAnimationFrame(raf); };
  }, [on]);
  return t;
}

/** rubbing a finger over something: progress 0..1 as the finger travels `need` px; the shine follows it */
export function useRub(need = 900, onDone?: () => void) {
  const [p, setP] = useState(0);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const st = useRef({ down: false, last: null as null | { x: number; y: number }, dist: 0, buzzAt: 0, done: false });
  const done = useRef(onDone); done.current = onDone;
  const reset = () => { st.current = { down: false, last: null, dist: 0, buzzAt: 0, done: false }; setP(0); setAt(null); };
  const bind = {
    onPointerDown: (e: React.PointerEvent) => { st.current.down = true; st.current.last = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current; if (!s.down || s.done) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setAt({ x: e.clientX - r.left, y: e.clientY - r.top });
      if (s.last) s.dist += Math.hypot(e.clientX - s.last.x, e.clientY - s.last.y);
      s.last = { x: e.clientX, y: e.clientY };
      if (s.dist - s.buzzAt > 120) { s.buzzAt = s.dist; feel('light'); }
      const v = Math.min(1, s.dist / need); setP(v);
      if (v >= 1) { s.done = true; done.current?.(); }
    },
    onPointerUp: () => { st.current.down = false; },
    onPointerCancel: () => { st.current.down = false; },
    style: { touchAction: 'none' as const },
  };
  return { progress: p, at, bind, reset };
}

/** hold to feel it: a heartbeat in your hand while you press */
export function useHeartbeat(bpm = 72) {
  const t = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (t.current) clearInterval(t.current); t.current = null; };
  useEffect(() => stop, []);
  return {
    onPointerDown: () => { stop(); feel('medium'); t.current = setInterval(() => { feel('medium'); setTimeout(() => feel('light'), 140); }, 60000 / bpm); },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
  };
}

// ---- looks ------------------------------------------------------------------------------------------------------------
/** level 3: an aura · level 6: a crown of light · level 10: a golden halo shedding sparks */
export function EvolveAura({ level, color, children, size = 120 }: { level: number; color: string; children: ReactNode; size?: number }) {
  return (
    <div className="lv-evolve relative grid place-items-center" style={{ width: size, height: size, ['--a' as string]: color }} data-level={level >= 10 ? 10 : level >= 6 ? 6 : level >= 3 ? 3 : 1}>
      {level >= 3 && <span className="lv-evolve-aura" />}
      {level >= 6 && <span className="lv-evolve-crown">{'✦'.repeat(5).split('').map((s, i) => <i key={i} style={{ transform: `rotate(${-40 + i * 20}deg) translateY(-${size * 0.52}px)` }}>{s}</i>)}</span>}
      {level >= 10 && <span className="lv-evolve-halo">{Array.from({ length: 8 }, (_, i) => <b key={i} style={{ animationDelay: `${i * 0.35}s`, left: `${10 + i * 10}%` }} />)}</span>}
      <div className="relative">{children}</div>
    </div>
  );
}

/** a hybrid: both parents' sigils fused, colours blended, the partner's emblem worn like an accessory */
export function HybridSigil({ a, b, seedA, seedB, size = 96, c }: { a: string; b: string; seedA: number; seedB: number; size?: number; c?: string | null }) {
  const ka = kindInfo(a), kb = kindInfo(b), kc = c ? kindInfo(c) : null;
  return (
    <div className="lv-hybrid relative grid place-items-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 0deg, ${ka.a}, ${kb.a}, ${kc?.a ?? ka.b}, ${ka.a})`, filter: 'blur(14px)', opacity: 0.55 }} />
      <div className="absolute left-0 top-0 opacity-80" style={{ transform: 'translate(-8%, -4%) rotate(-12deg)' }}><Sigil kind={a} seed={seedA} size={size * 0.78} glow={false} /></div>
      <div className="absolute bottom-0 right-0 mix-blend-screen" style={{ transform: 'translate(8%, 4%) rotate(14deg)' }}><Sigil kind={b} seed={seedB} size={size * 0.62} glow={false} /></div>
      <motion.span className="absolute -right-1 -top-1 grid place-items-center rounded-full text-[18px] shadow-lg" style={{ width: size * 0.34, height: size * 0.34, background: `radial-gradient(circle, ${kb.a}, ${kb.b})` }}
        animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 3 }}>{kb.emoji}</motion.span>
      {kc && <span className="absolute -bottom-1 -left-1 grid place-items-center rounded-full text-[15px] shadow-lg" style={{ width: size * 0.3, height: size * 0.3, background: `radial-gradient(circle, ${kc.a}, ${kc.b})` }}>{kc.emoji}</span>}
    </div>
  );
}

/** night where the plot is (it sleeps), and dust if nobody has seen to it in three days */
export function useMood(e: { gx: number; gy: number; updated_at?: string | null } | null | undefined) {
  if (!e) return { night: false, dusty: false };
  const [lng] = cellCenter(e.gx, e.gy);
  const night = nightAt(lng);
  const dusty = !!e.updated_at && Date.now() - Date.parse(e.updated_at) > 3 * 86400_000;
  return { night, dusty };
}
export function MoodVeil({ night, dusty }: { night: boolean; dusty: boolean }) {
  if (!night && !dusty) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
      {night && <div className="lv-night absolute inset-0"><span className="lv-zzz">z</span><span className="lv-zzz" style={{ animationDelay: '0.9s' }}>z</span><span className="lv-zzz" style={{ animationDelay: '1.8s' }}>Z</span></div>}
      {dusty && <div className="lv-dust absolute inset-0" />}
      <div className="absolute left-3 bottom-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-black text-white/80">{night ? '🌙 It’s night where it lives — it’s sleeping' : '🕸️ Dusty — it’s missed you'}</div>
    </div>
  );
}

/** poke it: it reacts (a squash, a sound, a buzz) */
export function usePoke() {
  const [n, setN] = useState(0);
  const poke = () => { setN((x) => x + 1); feel('light'); try { honk(); } catch { /* no audio */ } };
  return { n, poke };
}
let actx: AudioContext | null = null;
function honk() {
  if (useUi.getState().settings.sfx === false) return;
  actx = actx ?? new (globalThis.AudioContext || (globalThis as any).webkitAudioContext)();
  const c = actx!, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.22);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.3);
}
