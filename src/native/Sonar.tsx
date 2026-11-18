// 🧭 Haptic sonar (the apps): hold the phone flat and turn. It pings in your hand — faster the closer you face what
// you're looking for, harder the nearer it is — so you can find a buried chest, a Treasure Map piece or the Rod's spot
// with the screen in your pocket. The radar on screen says the same thing for anyone who'd rather look.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { askMotion } from '../enchant/living';
import { cn } from '../lib/utils';
import { hit, pingEvery, play, stop } from './feel';
import { bearing, metres, turnBetween, useCompass } from './motion';
import { isNative } from './native';

export type SonarTarget = {
  lng: number; lat: number;
  /** what it is ("a buried chest", "piece 2 of the map") */
  label: string;
  emoji: string;
  /** within this many metres you're on it (default 25) */
  reach?: number;
};

export { pingEvery };
/** how hard each ping is, by distance */
export const pingHit = (m: number) => (m < 60 ? 'heavy' : m < 400 ? 'medium' : 'light') as 'heavy' | 'medium' | 'light';
export function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}
/** "turn left", "turn right", "straight ahead" */
export function turnHint(heading: number, to: number) {
  const rel = (((to - heading) % 360) + 360) % 360;
  if (rel < 12 || rel > 348) return 'Straight ahead';
  if (rel > 165 && rel < 195) return 'Behind you — turn around';
  return rel < 180 ? `Turn right ${Math.round(rel)}°` : `Turn left ${Math.round(360 - rel)}°`;
}

/** A 🧭 button that opens the sonar — only in the apps (a desktop has no compass to turn). */
export function SonarButton({ target, className, children }: { target: SonarTarget | null; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!isNative() || !target) return null;
  return (
    <>
      <button type="button" className={cn('grid h-9 min-w-9 place-items-center rounded-xl bg-[#22E3FF]/15 px-2 text-[15px] font-black text-[#9FF3FF]', className)}
        onClick={() => { void askMotion(); setOpen(true); }} aria-label={`Sonar: find ${target.label}`} data-testid="sonar-open">{children ?? '🧭'}</button>
      {open && <SonarOverlay target={target} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SonarOverlay({ target, onClose }: { target: SonarTarget; onClose(): void }) {
  const heading = useCompass(true);
  const [me, setMe] = useState<{ lng: number; lat: number; acc: number } | null>(null);
  const [geoErr, setGeoErr] = useState(false);
  const [pulse, setPulse] = useState(0);
  const arrived = useRef(false);
  useEffect(() => {
    const id = navigator.geolocation?.watchPosition(
      (p) => setMe({ lng: p.coords.longitude, lat: p.coords.latitude, acc: p.coords.accuracy }),
      () => setGeoErr(true), { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 });
    return () => { if (id != null) navigator.geolocation?.clearWatch(id); };
  }, []);
  const d = me ? metres(me, target) : null;
  const to = me ? bearing(me, target) : null;
  const facing = heading != null && to != null ? turnBetween(heading, to) : null;
  const reach = target.reach ?? 25;
  const on = d != null && d <= reach;
  // the pings: a loop that reads the latest numbers each time
  const live = useRef({ facing, d, on }); live.current = { facing, d, on };
  useEffect(() => {
    let t = 0, alive = true;
    const tick = () => {
      if (!alive) return;
      const { facing: f, d: dist, on: there } = live.current;
      let wait = 700;
      if (!document.hidden && dist != null) {
        if (there) {
          if (!arrived.current) { arrived.current = true; play([[0, 'heavy'], [120, 'heavy'], [320, 'success']], 'sonar'); }
          wait = 1200;
        } else if (f != null) {
          const h = pingHit(dist);
          hit(h); if (f < 12) setTimeout(() => hit(h), 90);
          setPulse((n) => n + 1);
          wait = pingEvery(f);
        }
      }
      t = window.setTimeout(tick, wait);
    };
    tick();
    return () => { alive = false; clearTimeout(t); stop('sonar'); };
  }, []);
  // the target on the radar: its angle from the top of the phone, and its distance on a log scale (5 km at the rim)
  const rel = heading != null && to != null ? (((to - heading) % 360) + 360) % 360 : to ?? 0;
  const rr = d == null ? 0.7 : Math.min(1, Math.log10(1 + d / 10) / Math.log10(501));
  const bx = 50 + Math.sin((rel * Math.PI) / 180) * rr * 42, by = 50 - Math.cos((rel * Math.PI) / 180) * rr * 42;
  return createPortal(
    <motion.div className="fixed inset-0 z-[180] flex flex-col items-center bg-[#02060F]/96 px-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] pt-[max(18px,env(safe-area-inset-top,0px))] text-white"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="sonar">
      <div className="flex w-full items-center justify-between">
        <div className="leading-tight">
          <div className="text-[10.5px] font-black uppercase tracking-[0.18em] text-[#7FF3FF]">🧭 Sonar</div>
          <div className="font-display text-[19px] font-black">{target.emoji} {target.label}</div>
        </div>
        <button className="lv-x" onClick={onClose} aria-label="Close" data-testid="sonar-close">×</button>
      </div>
      <div className="relative my-6 aspect-square w-full max-w-[340px]">
        <div className="absolute inset-0 rounded-full border-2 border-[#22E3FF]/40 bg-[radial-gradient(circle,#06303A_0%,#03141C_60%,#02080D_100%)]" />
        {[0.33, 0.66].map((k) => <div key={k} className="absolute rounded-full border border-[#22E3FF]/15" style={{ inset: `${(1 - k) * 50}%` }} />)}
        {/* north, turning as you turn */}
        <div className="absolute inset-0" style={{ transform: `rotate(${-(heading ?? 0)}deg)`, transition: 'transform 120ms linear' }}>
          <div className="absolute left-1/2 top-1 -translate-x-1/2 text-[12px] font-black text-[#FF6B6B]" style={{ transform: `rotate(${heading ?? 0}deg)` }}>N</div>
        </div>
        {/* each ping, a ring going out */}
        <AnimatePresence>
          <motion.div key={pulse} className="absolute inset-[46%] rounded-full border-2 border-[#7FF3FF]" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 9, opacity: 0 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
        </AnimatePresence>
        {/* you, facing up */}
        <div className="absolute left-1/2 top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 border-x-[9px] border-b-[18px] border-x-transparent border-b-white" />
        {/* the target */}
        {d != null && <div className={cn('absolute -translate-x-1/2 -translate-y-1/2 text-[26px] drop-shadow-[0_0_10px_#22E3FF]', on && 'animate-pulse')} style={{ left: `${bx}%`, top: `${by}%` }} data-testid="sonar-blip">{target.emoji}</div>}
      </div>
      <div className="grid w-full max-w-[360px] justify-items-center gap-1.5 text-center">
        {on ? <div className="font-display text-[26px] font-black text-[#7FF3FF]" data-testid="sonar-there">You’re right on it!</div>
          : d != null ? <div className="font-display text-[34px] font-black tabular-nums" data-testid="sonar-dist">{fmtDist(d)}</div>
            : <div className="text-[14px] font-bold text-white/70">{geoErr ? 'Your location is off — the sonar needs it (Settings → LANDVAS → Location).' : 'Finding where you are…'}</div>}
        {!on && heading != null && to != null && <div className="text-[15px] font-black text-[#FFE8A3]" data-testid="sonar-turn">{turnHint(heading, to)}</div>}
        {!on && heading == null && d != null && <div className="text-[12.5px] font-bold text-white/60">Hold the phone flat and turn slowly — waiting for the compass…</div>}
        <p className="mt-2 text-[12px] font-semibold text-white/55">Hold it flat and turn: it pings faster as you face it, harder as you get close. Keep LANDVAS open while you walk.</p>
        {me && me.acc > 60 && <p className="text-[11px] font-bold text-[#FFB31F]">GPS is fuzzy here (±{Math.round(me.acc)} m) — step outside for a sharper fix.</p>}
      </div>
    </motion.div>,
    document.body,
  );
}
