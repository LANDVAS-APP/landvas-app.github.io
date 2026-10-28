// The joystick ("drag wheel"): steer your explorer by dragging the knob. It
// moves at joystick.speed_kmh and burns its tank — one second per second at
// full speed (less when you push gently). The tank refills every day for free
// and, once an ad network is connected, every time a rewarded ad is watched.
// The server checks every step (speed limit + tank), so this is only the
// smooth local preview of what it allows.
import { motion } from 'motion/react';
import { Clapperboard, Fuel, Satellite, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ExplorerState } from '../backend/types';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { qk, useWorld } from '../lib/queries';
import { explorerNow, gpsSupported, startGps, stopGps, useExplorer } from './explorer';
import { saveStorage } from '../lib/utils';

const R = 54; // knob travel radius (px)
const SEND_MS = 900;

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

export function Joystick({ onClose }: { onClose(): void }) {
  const world = useWorld();
  const ex = useExplorer();
  const settings = useUi((s) => s.settings);
  const joy = ex.state?.joystick;
  const qc = useQueryClient();
  const [refilling, setRefilling] = useState(false);
  const speed = Number(joy?.speed_kmh ?? world.data?.explorer?.joystick?.speed_kmh ?? 40) / 3.6;
  const tank = Number(joy?.tank_seconds ?? 600);
  const [secs, setSecs] = useState(Number(joy?.seconds_left ?? tank));
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const [gpsWasOn] = useState(() => ex.gps === 'on' || ex.gps === 'asking');
  const vec = useRef({ x: 0, y: 0, active: false });
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

  // GPS would pull the explorer straight back, so it pauses while you steer
  useEffect(() => {
    if (gpsWasOn) {
      stopGps();
      toast('GPS paused while you use the joystick', { description: 'Tap “Back to GPS” to return to where you really are.' });
    }
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

  // movement loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const v = vec.current;
      const mag = Math.min(1, Math.hypot(v.x, v.y));
      if (v.active && mag > 0.08 && secsRef.current > 0) {
        const st = useExplorer.getState();
        if (!local.current) {
          const p = explorerNow(st.state, st.offset);
          if (p) local.current = { lng: p.lng, lat: p.lat };
        }
        if (local.current && st.state) {
          const dist = speed * mag * dt;
          const dirX = v.x / (mag || 1), dirY = v.y / (mag || 1);
          local.current = offset(local.current, dirX * dist, -dirY * dist);
          secsRef.current = Math.max(0, secsRef.current - mag * dt);
          st.set({ ...st.state, mode: 'manual', lng: local.current.lng, lat: local.current.lat, origin: { ...local.current }, dest: null, speed_mps: null, traveling: false });
          if (!st.following) st.setFollowing(true);
          void send();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const tick = setInterval(() => setSecs(secsRef.current), 250);
    return () => { cancelAnimationFrame(raf); clearInterval(tick); };
  }, [speed]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const pct = tank > 0 ? Math.max(0, Math.min(1, secs / tank)) : 0;
  const empty = secs <= 0.05;
  const C = 2 * Math.PI * 70;
  return (
    <motion.div initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.9 }}
      className="pointer-events-auto glass flex items-center gap-3 rounded-[28px] p-3" data-testid="joystick">
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
        <div ref={pad} role="slider" aria-label="Joystick: drag to move your explorer" aria-valuetext={`${fmtTank(secs)} left`} tabIndex={0}
          className={cn('absolute inset-[14px] rounded-full bg-[radial-gradient(circle_at_50%_40%,rgba(139,92,255,0.22),rgba(10,8,30,0.35))] shadow-[inset_0_0_24px_rgba(0,0,0,0.35)]', empty ? 'cursor-not-allowed opacity-50' : 'cursor-grab')}
          onPointerDown={(e) => {
            if (empty) { toast('Joystick tank is empty'); return; }
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            if (settings.haptics) navigator.vibrate?.(8);
            setFromPointer(e);
          }}
          onPointerMove={(e) => knob.active && setFromPointer(e)}
          onPointerUp={release} onPointerCancel={release} data-testid="joystick-pad">
          <div className={cn('absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-white/80 bg-[linear-gradient(135deg,#22E3FF,#8B5CFF_55%,#FF3D9A)] shadow-[0_6px_18px_rgba(139,92,255,0.6),inset_0_2px_6px_rgba(255,255,255,0.5)]', knob.active ? '' : 'transition-transform duration-200')}
            style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px)) scale(${knob.active ? 1.06 : 1})` }} />
        </div>
      </div>
      <div className="grid min-w-[118px] gap-2">
        <div>
          <div className="eyebrow !text-[10px]">Joystick tank</div>
          <div className={cn('font-display text-2xl font-semibold tnum', empty && 'text-bad')} data-testid="joystick-tank">{fmtTank(secs)}</div>
          <div className="text-[11px] text-muted">{Math.round(speed * 3.6)} km/h at full push</div>
        </div>
        <button className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs font-bold hover:bg-surface disabled:opacity-40" disabled={refilling || (joy?.ink_refills_left ?? 0) <= 0 || secs >= Number(joy?.tank_seconds ?? 60)}
          title={(joy?.ink_refills_left ?? 0) <= 0 ? 'No Ink refills left today' : `Refill the tank for ${joy?.refill_ink ?? 50} Ink`}
          onClick={async () => {
            setRefilling(true);
            try {
              const r = await api.refillJoystickWithInk();
              useExplorer.getState().set(r);
              const full = Number(r.joystick?.seconds_left ?? 0); setSecs(full); secsRef.current = full;
              qc.invalidateQueries({ queryKey: qk.me });
              toast.success('Tank refilled', { description: `−${r.cost} Ink · ${r.joystick?.ink_refills_left ?? 0} Ink refill${r.joystick?.ink_refills_left === 1 ? "" : "s"} left today` });
            } catch (e) { toast.error(toGameError(e).message); } finally { setRefilling(false); }
          }} data-testid="joystick-refill-ink"><Fuel className="h-3.5 w-3.5 text-gold" /> Refill · {joy?.refill_ink ?? 50} Ink</button>
        <button className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs font-bold hover:bg-surface" onClick={() => {
          if (joy?.ads_enabled) toast('Ads are on their way', { description: 'The ad player will appear here once the ad network is connected.' });
          else toast('Refill with an ad — coming soon', { description: `Ads aren’t live yet. Your tank also refills for free at ${new Date(joy?.next_refill_at ?? Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` });
        }} data-testid="joystick-refill"><Clapperboard className="h-3.5 w-3.5 text-accent-2" /> Watch an ad</button>
        {gpsWasOn && gpsSupported() && (
          <button className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-ok hover:bg-surface" onClick={() => {
            saveStorage('landvas.gps', true);
            startGps();
            onClose();
          }}><Satellite className="h-3.5 w-3.5" /> Back to GPS</button>
        )}
        <button className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-muted hover:text-fg" onClick={onClose} data-testid="joystick-close"><X className="h-3.5 w-3.5" /> Close</button>
      </div>
    </motion.div>
  );
}
