// To space, in first person: from Explorer's Eyes, pick a world on the solar system (the Moon, the planets people are
// building on, your far-off home) and ride your rocket there — liftoff from the street, past the Earth and the Moon,
// across the solar system for as long as the real trip takes, and down onto it. Step out and you're on that world's
// own map (the World tab); or walk it in 3D. The trip is mission control's own (the same launch, fuel, fast travel and
// free warps), only seen from the saddle.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { SpaceState } from '../backend/types';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';
import { SystemMap, WorldCard } from '../space/SpaceScreen';
import { SPACE_KEY, fmtLeft, placeName, useFlight, useSpace } from '../space/useSpace';
import { createFlight, type Flight, type FlightPhase } from './flight3d';
import { jetLayers, type SelfLook } from './selfView';
import { Button, Spinner } from '../ui';
import { config } from '../env';

export default function SpaceFlight({ look, onClose }: { look: SelfLook; onClose(): void }) {
  const me = useOnboardedMe();
  const q = useSpace();
  const qc = useQueryClient();
  const nav = useNavigate();
  const s = q.data ? { ...q.data, balances: { ...q.data.balances, ...(me?.balances ?? {}) } } as SpaceState : null;
  const flight = useFlight(s);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // the trip being ridden: from, to, and whether it starts on the ground
  const [ride, setRide] = useState<{ from: string; to: string; liftoff: boolean; instant: boolean } | null>(null);
  // already on the way when you open it: straight into the flight
  useEffect(() => { if (!ride && s?.dest && s.arrive_at && flight.flying) setRide({ from: s.location, to: s.dest, liftoff: false, instant: false }); }, [s?.dest, flight.flying]); // eslint-disable-line react-hooks/exhaustive-deps

  const launch = async (dest: string, fast = false) => {
    if (!s) return;
    const from = s.location;
    setBusy(`launch:${dest}${fast ? ':fast' : ''}`);
    try {
      let r = await api.spaceLaunch(dest);
      if (fast && !r.warped) r = await api.spaceRush();
      qc.setQueryData(SPACE_KEY, r); invalidateGame(qc);
      if (useUi.getState().settings.haptics) buzz('heavy');
      setPick(null);
      setRide({ from, to: dest === 'home' ? `exo:${r.home_seed}` : r.dest ?? r.location, liftoff: true, instant: !!r.warped || fast || !r.dest });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };

  if (!me) return null;
  return (
    <motion.div className="fixed inset-0 z-[60] bg-[#05060F] text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="eyes-space">
      {!s ? <div className="grid h-full place-items-center"><Spinner /></div>
        : ride ? <Ride s={s} ride={ride} look={look} flight={flight} onClose={onClose}
            onRush={async () => { try { const r = await api.spaceRush(); qc.setQueryData(SPACE_KEY, r); invalidateGame(qc); } catch (e) { toast.error(toGameError(e).message); } }}
            onOut={(to) => { onClose(); nav(to); }} />
        : !s.built ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="grid max-w-xs gap-3">
              <div className="text-5xl">🚀</div>
              <div className="font-display text-xl font-black">Your rocket isn’t built yet</div>
              <p className="text-sm text-white/70">Build it at Mission Control (four parts), then ride it from right here to the Moon and beyond.</p>
              <Button variant="rainbow" onClick={() => { onClose(); nav('/space'); }}>Go to Mission Control</Button>
              <button className="text-sm font-bold text-white/60" onClick={onClose}>Not now</button>
            </div>
          </div>
        ) : (
          // where to? the whole solar system, live
          <div className="relative h-full">
            <div className="absolute inset-0 [&_canvas]:!h-full [&_canvas]:!rounded-none" data-testid="eyes-space-system">
              <SystemMap s={s} progress={flight.progress} flying={flight.flying} picked={pick} onPick={setPick} accent={me.profile.accent_color ?? '#8B5CFF'} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
              <div className="rounded-2xl bg-black/50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.25em] text-[#8FF3FF]">Where to?</div>
                <div className="text-[12.5px] font-bold text-white/80">You’re on {placeName(s, s.location)} · tap a world</div>
              </div>
              <button className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/55" onClick={onClose} aria-label="Close" data-testid="eyes-space-close"><X className="h-5 w-5" /></button>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
              <div className="w-[min(420px,100%)]">
                <AnimatePresence mode="wait">
                  {pick ? <WorldCard key={pick} s={s} id={pick} busy={busy} flying={flight.flying} onLaunch={(fast) => void launch(pick, fast)} onClose={() => setPick(null)} />
                    : (
                      <div className="flex flex-wrap justify-center gap-2">
                        {['moon', 'mars', 'jupiter', 'saturn'].map((id) => <button key={id} className="rounded-full bg-black/55 px-3 py-2 text-[13px] font-black" onClick={() => setPick(id)} data-testid={`eyes-space-pick-${id}`}>{placeName(s, id)}</button>)}
                        {s.home_seed && <button className="rounded-full bg-black/55 px-3 py-2 text-[13px] font-black" onClick={() => setPick('home')}>🏠 {s.home_name}</button>}
                        {s.location !== 'earth' && <button className="rounded-full bg-[#3DDC97]/80 px-3 py-2 text-[13px] font-black text-[#04201A]" onClick={() => void launch('earth')} data-testid="eyes-space-home">🌍 Back to Earth</button>}
                      </div>
                    )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
    </motion.div>
  );
}

/** riding it: the flight, the rocket and your hands, where you are on the way */
function Ride({ s, ride, look, flight, onClose, onRush, onOut }: {
  s: SpaceState; ride: { from: string; to: string; liftoff: boolean; instant: boolean }; look: SelfLook;
  flight: ReturnType<typeof useFlight>; onClose(): void; onRush(): void; onOut(to: string): void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fl = useRef<Flight | null>(null);
  const reduce = useUi((st) => st.settings.reduceMotion);
  const [phase, setPhase] = useState<FlightPhase>(ride.liftoff ? 'liftoff' : 'cruise');
  const [flash, setFlash] = useState(0);
  const layers = useMemo(() => jetLayers(look), [JSON.stringify(look.style ?? {}), look.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const cockpit = useRef<HTMLDivElement>(null), flames = useRef<HTMLDivElement>(null);
  // (arrived: here and not going anywhere)
  const arrived = !s.dest && (s.location === ride.to || (ride.to.startsWith('exo:') && s.location.startsWith('exo:')));

  useEffect(() => {
    let f: Flight;
    try { f = createFlight(cv.current!, { reduce }); } catch (e) { console.warn('flight unavailable', e); onOut('/world'); return; }
    fl.current = f;
    f.leg(ride.from, ride.to, ride.liftoff, { seed: s.home_seed, name: s.home_name });
    if (config.e2e || import.meta.env.DEV) (window as { __landvasFlight?: Flight }).__landvasFlight = f;
    // the cockpit: the rocket burns and shakes with the flight; the phase for the words on screen
    let raf = 0, last = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const b = f.burn(), p = f.phase();
      if (p !== last) { if (last === 'liftoff' && p === 'approach') setFlash((n) => n + 1); last = p; setPhase(p); }
      if (flames.current) flames.current.style.transform = `scale(${(1 + b * 0.6 + Math.random() * 0.15 * b).toFixed(3)}, ${(1 + b * 1.1 + Math.random() * 0.25 * b).toFixed(3)})`;
      if (cockpit.current) { const k = b * 3; cockpit.current.style.transform = `translate3d(${((Math.random() - 0.5) * k).toFixed(1)}px, ${((Math.random() - 0.5) * k).toFixed(1)}px, 0)`; }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); f.dispose(); fl.current = null; delete (window as { __landvasFlight?: Flight }).__landvasFlight; };
  }, [ride]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fl.current?.progress(arrived ? 1 : flight.progress, arrived); }, [flight.progress, arrived]);

  const to = placeName(s, ride.to);
  const words = phase === 'liftoff' ? 'Liftoff! 🚀' : phase === 'cruise' ? `On the way to ${to}` : phase === 'approach' ? `Coming down on ${to}…` : ride.to === 'earth' ? 'Back home on Earth 🌍' : `You’ve landed on ${to}!`;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" data-testid="eyes-space-canvas" />
      {/* the air burning round you on the way down */}
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ opacity: phase === 'approach' ? 0.85 : 0, background: 'radial-gradient(75% 65% at 50% 55%, transparent 52%, rgba(255,120,40,0.55) 78%, rgba(255,60,20,0.85) 100%)' }} />
      <AnimatePresence>{flash > 0 && <motion.div key={flash} className="pointer-events-none absolute inset-0 bg-white" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} />}</AnimatePresence>
      {/* you, astride your rocket */}
      {phase !== 'landed' && (
        <div className="pointer-events-none absolute left-1/2 aspect-[4/3] w-[min(100vw,640px)] -translate-x-1/2" style={{ bottom: 'max(0px, calc((100dvh - 133vw) * 0.42))' }}>
          <div ref={cockpit} className="absolute inset-0" style={{ willChange: 'transform' }}>
            {Object.entries(layers).map(([k, svg]) => (
              <div key={k} ref={k === 'flames' ? flames : undefined} className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" style={{ transformOrigin: '50% 100%', willChange: k === 'flames' ? 'transform' : undefined }} dangerouslySetInnerHTML={{ __html: svg }} />
            ))}
          </div>
        </div>
      )}
      {/* where you are on the way */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <motion.div key={phase} className="rounded-2xl bg-black/55 px-3.5 py-2" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} data-testid="eyes-space-status" data-phase={phase}>
          <div className="font-display text-[17px] font-black leading-tight">{words}</div>
          {phase === 'cruise' && flight.flying && <div className="text-[12px] font-bold text-white/70 tnum">{fmtLeft(flight.left)} to go · {Math.round(flight.progress * 100)}% of the way</div>}
        </motion.div>
        <button className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/55" onClick={onClose} aria-label="Back to the street" data-testid="eyes-space-close"><X className="h-5 w-5" /></button>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 pb-[max(14px,env(safe-area-inset-bottom,0px))]">
        {phase === 'cruise' && flight.flying && s.rush_cost != null && s.config.fast_travel?.enabled !== false && (
          <button className="rounded-2xl bg-black/60 px-4 py-2 text-[13px] font-black text-[#FFE89A]" onClick={onRush} data-testid="eyes-space-rush">⚡ Arrive now · {s.rush_cost} Ink</button>
        )}
        {phase === 'landed' && (
          <motion.div className="grid w-[min(380px,100%)] gap-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {ride.to === 'earth'
              ? <Button variant="rainbow" size="lg" onClick={onClose} data-testid="eyes-space-out">Back to the street</Button>
              : <>
                  <Button variant="rainbow" size="lg" onClick={() => onOut('/world')} data-testid="eyes-space-out">Step out onto {to} →</Button>
                  <button className="rounded-2xl bg-black/55 px-4 py-2 text-[13px] font-black" onClick={() => onOut('/space/surface')} data-testid="eyes-space-walk">Walk it in 3D</button>
                </>}
          </motion.div>
        )}
      </div>
    </div>
  );
}
