// The joystick: steer your explorer with the drag wheel, the D-pad, or WASD / the arrow keys.
// It moves at joystick.speed_kmh and burns its tank — one second per second at full speed
// (less when you push gently). The tank refills every day for free and, once an ad network is
// connected, every time a rewarded ad is watched. The server checks every step (speed limit +
// tank), so this is only the smooth local preview of what it allows.
//
// Two layouts share one drive engine:
//  * the wheel — a round drag pad (the default in portrait)
//  * the D-pad — four arrows plus diagonals, laid out for a phone turned sideways. Hold an arrow
//    to keep walking; tap it to step exactly one plot.
import { motion } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDot, Clapperboard, Fuel, Gamepad2, Satellite, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ExplorerState } from '../backend/types';
import { useUi } from '../lib/store';
import { cn, safeStorage } from '../lib/utils';
import { qk, useWorld } from '../lib/queries';
import { plotMetres } from '../shared/grid';
import { buzz } from '../native/native';
import { explorerNow, gpsSupported, pauseGps, resumeGps, useExplorer } from './explorer';
import { saveStorage } from '../lib/utils';
import { AdButton } from '../ads/AdButton';
import { adsSupported } from '../ads/ads';

const R = 54; // knob travel radius (px)
const SEND_MS = 900;
/** a press shorter than this is a tap: it walks exactly one plot */
const TAP_MS = 220;

function metresBetween(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function offset(p: { lng: number; lat: number }, east: number, north: number) {
  const lat = Math.max(-85, Math.min(85, p.lat + north / 111320));
  let lng = p.lng + east / (111320 * Math.cos((p.lat * Math.PI) / 180));
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;
  return { lng, lat };
}
export const fmtTank = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// ---- keyboard ---------------------------------------------------------------------------
// WASD and the arrow keys. The map screen listens all the time (so a key press can open the
// joystick); the drive engine reads the held keys every frame.
export const DRIVE_KEYS: Record<string, [number, number]> = {
  w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
};
const held = new Map<string, number>(); // key -> when it went down
let keyTap: { x: number; y: number } | null = null; // a quick key press waiting to become a one-plot step
let freshPress = false; // a key went down with none held: start measuring a new press
let lastDrive = 0;
/** Steered in the last few seconds: a slower server snapshot of the explorer mustn't pull it back. */
export const recentlyDriven = () => performance.now() - lastDrive < 4000;
export function keyVector() {
  let x = 0, y = 0;
  for (const k of held.keys()) { const v = DRIVE_KEYS[k]; if (v) { x += v[0]; y += v[1]; } }
  const m = Math.hypot(x, y);
  return m > 0 ? { x: x / m, y: y / m } : null;
}
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]');

/** Steer with WASD / arrows on the map. `onFirst` runs on a key press while the joystick is closed. */
export function useDriveKeys(enabled: boolean, onFirst: () => void) {
  const first = useRef(onFirst);
  first.current = onFirst;
  useEffect(() => {
    if (!enabled) { held.clear(); return; }
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!DRIVE_KEYS[k] || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // the map would pan on the arrow keys; here they walk the explorer instead
      e.preventDefault();
      e.stopPropagation();
      if (!held.size) freshPress = true;
      if (!held.has(k)) held.set(k, performance.now());
      first.current();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const t0 = held.get(k);
      if (t0 === undefined) return;
      held.delete(k);
      e.stopPropagation();
      if (!held.size && performance.now() - t0 < TAP_MS) { const v = DRIVE_KEYS[k]; keyTap = { x: v[0], y: v[1] }; }
    };
    const blur = () => held.clear();
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); held.clear(); };
  }, [enabled]);
}

// ---- layout -----------------------------------------------------------------------------
const LANDSCAPE_PHONE = '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)';
/** A phone (or small tablet) turned sideways. */
export function useLandscapePhone() {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(LANDSCAPE_PHONE).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(LANDSCAPE_PHONE);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return on;
}
type Layout = 'wheel' | 'dpad';
const LAYOUT_KEY = 'landvas.joystick.layout';

export function Joystick({ onClose }: { onClose(): void }) {
  const world = useWorld();
  const ex = useExplorer();
  const settings = useUi((s) => s.settings);
  const joy = ex.state?.joystick;
  const qc = useQueryClient();
  const landscape = useLandscapePhone();
  // the D-pad is the default sideways; either layout can be picked (and is remembered per orientation)
  const [pref, setPref] = useState<Record<'portrait' | 'landscape', Layout>>(() => ({ portrait: 'wheel', landscape: 'dpad', ...safeStorage<Partial<Record<'portrait' | 'landscape', Layout>>>(LAYOUT_KEY, {}) }));
  const layout: Layout = pref[landscape ? 'landscape' : 'portrait'];
  const setLayout = (l: Layout) => { const p = { ...pref, [landscape ? 'landscape' : 'portrait']: l }; setPref(p); saveStorage(LAYOUT_KEY, p); };
  const [refilling, setRefilling] = useState(false);
  const speed = Number(joy?.speed_kmh ?? world.data?.explorer?.joystick?.speed_kmh ?? 40) / 3.6;
  const tank = Number(joy?.tank_seconds ?? 600);
  const [secs, setSecs] = useState(Number(joy?.seconds_left ?? tank));
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const [dir, setDir] = useState<{ x: number; y: number } | null>(null); // the D-pad arrow being pressed
  const [gpsWasOn] = useState(() => ex.gps === 'on' || ex.gps === 'asking' || ex.gps === 'paused');
  const back = useRef(true); // resume GPS when the joystick closes (unless the player stays manual)
  const vec = useRef({ x: 0, y: 0, active: false });
  // a tap on the D-pad (or a quick key press) walks one plot: how far is left of that step
  const stepRef = useRef<{ x: number; y: number; left: number } | null>(null);
  const press = useRef({ at: 0, moved: 0 });
  const local = useRef<{ lng: number; lat: number } | null>(null);
  const secsRef = useRef(secs);
  const inflight = useRef(false);
  const lastSend = useRef(0);
  const pad = useRef<HTMLDivElement>(null);

  // the server's tank figure wins whenever it arrives
  useEffect(() => {
    if (joy && !vec.current.active) {
      secsRef.current = Number(joy.seconds_left);
      setSecs(secsRef.current);
    }
  }, [joy?.seconds_left]); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS would pull the explorer straight back, so it pauses while you steer and picks up again after
  useEffect(() => {
    if (!gpsWasOn) return;
    pauseGps();
    return () => { if (back.current) resumeGps(); };
  }, [gpsWasOn]);

  async function send(force = false) {
    const p = local.current;
    if (!p || inflight.current || (!force && performance.now() - lastSend.current < SEND_MS)) return;
    inflight.current = true;
    lastSend.current = performance.now();
    const sent = { ...p };
    const usedBefore = secsRef.current;
    try {
      const r = await api.joystickStep(sent.lng, sent.lat);
      // keep moving smoothly: re-apply what we moved since sending onto the server's answer
      const now = local.current ?? sent;
      const drift = { east: (now.lng - sent.lng) * 111320 * Math.cos((sent.lat * Math.PI) / 180), north: (now.lat - sent.lat) * 111320 };
      const corrected = metresBetween(sent, r) > 3 ? offset(r, drift.east, drift.north) : now;
      local.current = corrected;
      const spentSince = Math.max(0, usedBefore - secsRef.current);
      secsRef.current = Math.max(0, Number(r.joystick?.seconds_left ?? secsRef.current) - spentSince);
      setSecs(secsRef.current);
      useExplorer.getState().set({ ...r, lng: corrected.lng, lat: corrected.lat, origin: corrected } as ExplorerState);
      if (r.empty) {
        toast('Joystick tank is empty', { description: r.joystick?.ads_enabled ? 'Watch an ad to refill it.' : `It refills for free at ${new Date(r.joystick?.next_refill_at ?? Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` });
      }
    } catch (e) {
      const err = toGameError(e);
      if (err.code !== 'rate_limited') toast.error(err.message);
    } finally {
      inflight.current = false;
    }
  }

  // movement loop: the wheel / D-pad, else the keyboard, else a one-plot step still under way
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let wasMoving = false;
    const loop = () => {
      const now = performance.now();
      // slow devices still move at the right speed (the server checks it either way)
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const st = useExplorer.getState();
      if (freshPress) { freshPress = false; press.current = { at: now, moved: 0 }; stepRef.current = null; }
      if (keyTap) { const plot = plotMetres(st.state?.lat ?? 0); stepRef.current = { ...keyTap, left: Math.max(0, plot - press.current.moved) }; keyTap = null; }
      const v = vec.current;
      const kv = keyVector();
      let mx = 0, my = 0, mag = 0;
      if (v.active) { mag = Math.min(1, Math.hypot(v.x, v.y)); mx = v.x; my = v.y; }
      else if (kv) { mag = 1; mx = kv.x; my = kv.y; }
      else if (stepRef.current && stepRef.current.left > 0.05) { mag = 1; mx = stepRef.current.x; my = stepRef.current.y; }
      // a fresh press (pad or key) starts counting how far it has walked, for the tap-to-step rule
      const pressing = v.active || !!kv;
      if (mag > 0.08 && secsRef.current > 0) {
        if (!local.current) {
          const p = explorerNow(st.state, st.offset);
          if (p) local.current = { lng: p.lng, lat: p.lat };
        }
        if (local.current && st.state) {
          let dist = speed * mag * dt;
          const step = !pressing ? stepRef.current : null;
          if (step) { dist = Math.min(dist, step.left); step.left -= dist; if (step.left <= 0.05) stepRef.current = null; }
          else if (pressing) { press.current.moved += dist; stepRef.current = null; }
          const m = Math.hypot(mx, my) || 1;
          local.current = offset(local.current, (mx / m) * dist, (-my / m) * dist);
          secsRef.current = Math.max(0, secsRef.current - mag * dt);
          lastDrive = now;
          st.set({ ...st.state, mode: 'manual', lng: local.current.lng, lat: local.current.lat, origin: { ...local.current }, dest: null, speed_mps: null, traveling: false });
          if (!st.following) st.setFollowing(true);
          void send(!stepRef.current && !pressing);
        }
        wasMoving = pressing;
      } else {
        if (wasMoving) void send(true);
        wasMoving = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const tick = setInterval(() => setSecs(secsRef.current), 250);
    return () => { cancelAnimationFrame(raf); clearInterval(tick); };
  }, [speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const feel = () => { if (settings.haptics) { buzz('light'); navigator.vibrate?.(8); } };

  // ---- the wheel ----
  const setFromPointer = (e: React.PointerEvent) => {
    const el = pad.current!;
    const b = el.getBoundingClientRect();
    let x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) { x = (x / d) * R; y = (y / d) * R; }
    vec.current = { x: x / R, y: y / R, active: true };
    setKnob({ x, y, active: true });
  };
  const release = () => {
    vec.current = { x: 0, y: 0, active: false };
    setKnob({ x: 0, y: 0, active: false });
    void send(true);
  };

  // ---- the D-pad: the direction is the 8-way sector under your thumb ----
  const dpadDir = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2);
    if (Math.hypot(x, y) < b.width * 0.12) return null; // the centre is a dead zone
    const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: Math.round(Math.cos(a) * 1000) / 1000, y: Math.round(Math.sin(a) * 1000) / 1000 };
  };
  const dpadSet = (d: { x: number; y: number } | null) => {
    setDir((prev) => { if (d && (!prev || prev.x !== d.x || prev.y !== d.y)) feel(); return d; });
    vec.current = d ? { ...d, active: true } : { x: 0, y: 0, active: false };
  };
  const dpadUp = () => {
    const d = dir;
    const quick = performance.now() - press.current.at < TAP_MS;
    dpadSet(null);
    if (d && quick) {
      const plot = plotMetres(useExplorer.getState().state?.lat ?? 0);
      // diagonals step one plot each way
      const len = plot * (Math.abs(d.x) > 0.1 && Math.abs(d.y) > 0.1 ? Math.SQRT2 : 1);
      stepRef.current = { x: d.x, y: d.y, left: Math.max(0, len - press.current.moved) };
    } else void send(true);
  };

  const pct = tank > 0 ? Math.max(0, Math.min(1, secs / tank)) : 0;
  const empty = secs <= 0.05;
  const C = 2 * Math.PI * 70;

  const refillInk = async () => {
    setRefilling(true);
    try {
      const r = await api.refillJoystickWithInk();
      useExplorer.getState().set(r);
      const full = Number(r.joystick?.seconds_left ?? 0); setSecs(full); secsRef.current = full;
      qc.invalidateQueries({ queryKey: qk.me });
      toast.success('Tank refilled', { description: `−${r.cost} Ink · ${r.joystick?.ink_refills_left ?? 0} Ink refill${r.joystick?.ink_refills_left === 1 ? "" : "s"} left today` });
    } catch (e) { toast.error(toGameError(e).message); } finally { setRefilling(false); }
  };
  const btn = 'flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs font-bold hover:bg-surface';
  const controls = (
    <>
      <button className={cn(btn, 'disabled:opacity-40')} disabled={refilling || (joy?.ink_refills_left ?? 0) <= 0 || secs >= Number(joy?.tank_seconds ?? 60)}
        title={(joy?.ink_refills_left ?? 0) <= 0 ? 'No Ink refills left today' : `Refill the tank for ${joy?.refill_ink ?? 50} Ink`}
        onClick={refillInk} data-testid="joystick-refill-ink"><Fuel className="h-3.5 w-3.5 text-gold" /> Refill · {joy?.refill_ink ?? 50} Ink</button>
      {adsSupported() ? (
        <AdButton reward="joystick_refill" label="Ad: refill" done="Tank refilled!" className="rounded-xl px-2.5 py-1.5 text-xs" testid="joystick-refill"
          onDone={() => { void api.myState().then((st) => { if (st.onboarded && st.explorer) useExplorer.getState().set(st.explorer as any); }); }} />
      ) : (
        <button className={btn} onClick={() => {
          toast('Refill with an ad in the LANDVAS app', { description: `Bonus ads play in the iOS and Android apps. Your tank also refills for free at ${new Date(joy?.next_refill_at ?? Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` });
        }} data-testid="joystick-refill"><Clapperboard className="h-3.5 w-3.5 text-accent-2" /> Watch an ad</button>
      )}
      {gpsWasOn && gpsSupported() && (
        <button className={cn(btn, 'text-ok')} onClick={() => { saveStorage('landvas.gps', true); onClose(); }} data-testid="back-to-gps"><Satellite className="h-3.5 w-3.5" /> Back to GPS</button>
      )}
    </>
  );
  const tankInfo = (
    <div>
      <div className="eyebrow !text-[10px]">Joystick tank</div>
      <div className={cn('font-display text-2xl font-semibold tnum', empty && 'text-bad')} data-testid="joystick-tank">{fmtTank(secs)}</div>
      <div className="text-[11px] text-muted">{Math.round(speed * 3.6)} km/h · tap = 1 plot</div>
      {gpsWasOn && <div className="text-[10.5px] font-semibold text-ok" data-testid="gps-paused-note">GPS is fine — paused while you steer</div>}
    </div>
  );
  const switcher = (
    <div className="flex rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label="Controller">
      <button role="radio" aria-checked={layout === 'wheel'} onClick={() => setLayout('wheel')} title="Drag wheel"
        className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold', layout === 'wheel' ? 'bg-surface text-fg shadow' : 'text-muted')} data-testid="layout-wheel"><CircleDot className="h-3.5 w-3.5" /> Wheel</button>
      <button role="radio" aria-checked={layout === 'dpad'} onClick={() => setLayout('dpad')} title="D-pad"
        className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold', layout === 'dpad' ? 'bg-surface text-fg shadow' : 'text-muted')} data-testid="layout-dpad"><Gamepad2 className="h-3.5 w-3.5" /> D-pad</button>
    </div>
  );
  const closeBtn = <button className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-muted hover:text-fg" onClick={onClose} data-testid="joystick-close"><X className="h-3.5 w-3.5" /> Close</button>;

  if (layout === 'dpad') {
    const arrow = (d: { x: number; y: number }) => !!dir && Math.sign(dir.x) === d.x && Math.sign(dir.y) === d.y;
    const lit = (dx: number, dy: number) => !!dir && ((dx && Math.sign(dir.x) === dx) || (dy && Math.sign(dir.y) === dy));
    const arm = 'absolute flex items-center justify-center rounded-xl border border-white/15 bg-[linear-gradient(160deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition';
    const on = 'border-white/70 bg-[linear-gradient(135deg,#22E3FF,#8B5CFF_55%,#FF3D9A)] scale-[0.96] shadow-[0_0_18px_rgba(139,92,255,0.7)]';
    return (
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
        className={cn('pointer-events-auto flex gap-3', landscape ? 'w-full items-end justify-start' : 'glass items-center rounded-[28px] p-3')} data-testid="joystick" data-layout="dpad">
        {/* the D-pad */}
        <div className={cn('relative shrink-0 select-none rounded-full', landscape ? 'glass h-[172px] w-[172px] p-2' : 'h-[160px] w-[160px]')} style={{ touchAction: 'none' }}>
          <div className={cn('relative h-full w-full', empty && 'opacity-50')} role="group" aria-label={`D-pad: hold to walk, tap to step one plot. ${fmtTank(secs)} left`} data-testid="dpad"
            onPointerDown={(e) => {
              if (empty) { toast('Joystick tank is empty'); return; }
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
              press.current = { at: performance.now(), moved: 0 };
              stepRef.current = null;
              dpadSet(dpadDir(e));
            }}
            onPointerMove={(e) => { if (e.buttons && vec.current.active) { const d = dpadDir(e); if (d) dpadSet(d); } }}
            onPointerUp={dpadUp} onPointerCancel={dpadUp}>
            <div className={cn(arm, 'left-1/3 top-0 h-1/3 w-1/3 rounded-b-md', lit(0, -1) && on)} data-testid="dpad-up"><ChevronUp className="h-7 w-7" /></div>
            <div className={cn(arm, 'bottom-0 left-1/3 h-1/3 w-1/3 rounded-t-md', lit(0, 1) && on)} data-testid="dpad-down"><ChevronDown className="h-7 w-7" /></div>
            <div className={cn(arm, 'left-0 top-1/3 h-1/3 w-1/3 rounded-r-md', lit(-1, 0) && on)} data-testid="dpad-left"><ChevronLeft className="h-7 w-7" /></div>
            <div className={cn(arm, 'right-0 top-1/3 h-1/3 w-1/3 rounded-l-md', lit(1, 0) && on)} data-testid="dpad-right"><ChevronRight className="h-7 w-7" /></div>
            <div className="absolute left-1/3 top-1/3 flex h-1/3 w-1/3 items-center justify-center bg-white/5">
              <span className={cn('h-3 w-3 rounded-full bg-white/40', dir && 'bg-white')} />
            </div>
            {/* diagonal hints */}
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => (
              <span key={`${dx}${dy}`} className={cn('absolute h-2 w-2 rounded-full bg-white/25 transition', arrow({ x: dx, y: dy }) && 'scale-150 bg-white')}
                style={{ left: `${50 + dx * 33}%`, top: `${50 + dy * 33}%`, transform: 'translate(-50%,-50%)' }} />
            ))}
          </div>
        </div>
        {/* tank and buttons */}
        <div className={cn('grid min-w-[150px] gap-2', landscape && 'glass rounded-[22px] p-3')}>
          <div className="flex items-start justify-between gap-2">{tankInfo}{landscape && closeBtn}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-[linear-gradient(90deg,#22E3FF,#8B5CFF,#FF3D9A)] transition-[width]" style={{ width: `${pct * 100}%` }} /></div>
          <div className={cn('flex flex-wrap gap-1.5', !landscape && 'flex-col')}>{controls}</div>
          {switcher}
          {!landscape && closeBtn}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.9 }}
      className="pointer-events-auto glass flex items-center gap-3 rounded-[28px] p-3" data-testid="joystick" data-layout="wheel">
      <div className="relative h-[156px] w-[156px] shrink-0 select-none" style={{ touchAction: 'none' }}>
        <svg viewBox="0 0 156 156" className="absolute inset-0" aria-hidden>
          <defs>
            <linearGradient id="joy-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22E3FF" /><stop offset="0.5" stopColor="#8B5CFF" /><stop offset="1" stopColor="#FF3D9A" /></linearGradient>
          </defs>
          <circle cx="78" cy="78" r="70" fill="none" stroke="var(--line)" strokeWidth="7" />
          <circle cx="78" cy="78" r="70" fill="none" stroke="url(#joy-g)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 78 78)" style={{ transition: 'stroke-dasharray 0.25s linear' }} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="78" y1="16" x2="78" y2={a % 90 ? 21 : 24} stroke="var(--muted)" strokeWidth={a % 90 ? 1.5 : 2.5} transform={`rotate(${a} 78 78)`} opacity="0.6" />
          ))}
          <text x="78" y="36" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--muted)">N</text>
        </svg>
        <div ref={pad} role="slider" aria-label="Joystick: drag to move your explorer (or use WASD / the arrow keys)" aria-valuetext={`${fmtTank(secs)} left`} tabIndex={0}
          className={cn('absolute inset-[14px] rounded-full bg-[radial-gradient(circle_at_50%_40%,rgba(139,92,255,0.22),rgba(10,8,30,0.35))] shadow-[inset_0_0_24px_rgba(0,0,0,0.35)]', empty ? 'cursor-not-allowed opacity-50' : 'cursor-grab')}
          onPointerDown={(e) => {
            if (empty) { toast('Joystick tank is empty'); return; }
            try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
            feel();
            setFromPointer(e);
          }}
          onPointerMove={(e) => knob.active && setFromPointer(e)}
          onPointerUp={release} onPointerCancel={release} data-testid="joystick-pad">
          <div className={cn('absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-white/80 bg-[linear-gradient(135deg,#22E3FF,#8B5CFF_55%,#FF3D9A)] shadow-[0_6px_18px_rgba(139,92,255,0.6),inset_0_2px_6px_rgba(255,255,255,0.5)]', knob.active ? '' : 'transition-transform duration-200')}
            style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px)) scale(${knob.active ? 1.06 : 1})` }} />
        </div>
      </div>
      <div className="grid min-w-[118px] gap-2">
        {tankInfo}
        {controls}
        {switcher}
        {closeBtn}
      </div>
    </motion.div>
  );
}
