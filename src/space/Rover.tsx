// Rovers: buy one in the garage (Ink + materials you've dug), hop in and drive across the world much
// faster than walking. Fuel burns by the kilometre (the server measures where you actually went);
// refuel with ice you've dug, or Ink. Run dry and you're back on your feet.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { RoverModel, RoverState } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, Dialog, ResourceIcon } from '../ui';
import type { PlanetScene } from './planet3d';

export const ROVER_KEY = ['rover'] as const;

/** Driving on this world: getting in and out, and the fuel meter while you go. */
export function useRover(world: string, scene: { current: PlanetScene | null }, ready: boolean, high: boolean) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ROVER_KEY, queryFn: api.roverState, staleTime: 30_000 });
  const [driving, setDriving] = useState(false);
  const busy = useRef(false);
  const set = useCallback((r: RoverState) => qc.setQueryData(ROVER_KEY, r), [qc]);
  const model = (r: RoverState | undefined) => r?.config.models.find((m) => m.id === r.active) ?? null;

  const stop = useCallback(async (why?: string) => {
    scene.current?.setRover(null); setDriving(false);
    if (why) toast(why);
    try { set(await api.roverDrive(world, false, null)); } catch { /* fine */ }
  }, [world, scene, set]);

  const start = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try {
      const r = await api.roverDrive(world, true, scene.current?.pose().d ?? null);
      set(r);
      const m = model(r);
      if (m) { scene.current?.setRover(m.id, m.speed); setDriving(true); buzz('medium'); }
    } catch (e) { toast.error(toGameError(e).message); }
    finally { busy.current = false; }
  }, [world, scene, set]);

  // the meter: where you are every 5 s; the server burns fuel for the distance (capped by the rover's speed)
  useEffect(() => {
    if (!driving) return;
    const t = setInterval(async () => {
      try {
        const r = await api.roverTick(world, scene.current?.pose().d ?? null);
        set(r);
        if (!r.driving) { scene.current?.setRover(null); setDriving(false); buzz('warning'); toast(r.out_of_fuel ? '⛽ Out of fuel — refuel in the garage.' : 'You hopped out.'); }
      } catch { /* try again next tick */ }
    }, 5000);
    return () => clearInterval(t);
  }, [driving, world, scene, set]);

  // flying up high: the rover stays parked (and stops burning fuel); leaving the world too
  useEffect(() => { if (driving && high) void stop(); }, [driving, high, stop]);
  useEffect(() => () => { if (scene.current) scene.current.setRover(null); }, [scene]);
  useEffect(() => { if (!ready) setDriving(false); }, [ready]);
  const drivingRef = useRef(false); drivingRef.current = driving;
  useEffect(() => () => { if (drivingRef.current) void api.roverDrive(world, false, null).catch(() => {}); }, [world]);
  // the scene is rebuilt: put the rover back under you
  useEffect(() => {
    if (ready && driving) { const m = model(q.data); if (m) scene.current?.setRover(m.id, m.speed); }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state: q.data, driving, start, stop: () => stop(), set };
}

const pct = (r?: RoverState) => (r && r.tank > 0 ? Math.max(0, Math.min(1, r.fuel / r.tank)) : 0);

/** The rail buttons: get in / out, and a fuel chip that opens the garage. */
export function RoverControls({ rover, onGarage }: { rover: ReturnType<typeof useRover>; onGarage(): void }) {
  const r = rover.state;
  const has = !!r?.active;
  const p = pct(r);
  return (
    <>
      <button className={cn('lv-gbtn round pointer-events-auto', rover.driving && 'on')} data-testid="rover-drive"
        aria-label={rover.driving ? 'Get out of the rover' : has ? 'Drive your rover' : 'Rover garage'}
        onClick={() => (rover.driving ? rover.stop() : has && (r?.fuel ?? 0) > 0 ? void rover.start() : onGarage())}>
        <span className="text-lg leading-none">{rover.driving ? '🚶' : r?.config.models.find((m) => m.id === r.active)?.emoji ?? '🚙'}</span>
        <span className="lbl">{rover.driving ? 'Exit' : has ? 'Drive' : 'Rover'}</span>
      </button>
      {has && (
        <button onClick={onGarage} className="pointer-events-auto grid w-12 justify-items-center gap-0.5 rounded-xl bg-black/55 px-1 py-1 text-[9px] font-bold text-white backdrop-blur" data-testid="rover-fuel" aria-label={`Fuel ${Math.round(p * 100)}% — open the garage`}>
          <span>⛽ {Math.round(p * 100)}%</span>
          <span className="h-1.5 w-9 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full" style={{ width: `${p * 100}%`, background: p < 0.2 ? '#FF4D6D' : p < 0.5 ? '#FFC93D' : '#3DDC97' }} /></span>
        </button>
      )}
    </>
  );
}

export function RoverGarage({ open, onOpenChange, rover }: { open: boolean; onOpenChange(o: boolean): void; rover: ReturnType<typeof useRover> }) {
  const qc = useQueryClient();
  const r = rover.state;
  const [busy, setBusy] = useState(false);
  if (!r) return null;
  const info = (k: string) => r.item_info?.[k] ?? { name: k, emoji: '✨' };
  const act = async (f: () => Promise<RoverState>, ok?: (x: RoverState) => string) => {
    setBusy(true);
    try { const x = await f(); rover.set(x); invalidateGame(qc); if (ok) toast.success(ok(x)); }
    catch (e) { const g = toGameError(e); toast.error(g.code === 'not_enough_materials' ? `Not enough ${info(String((e as any)?.details ?? (e as any)?.detail ?? '')).name.toLowerCase() || 'materials'} — dig for more.` : g.message); }
    finally { setBusy(false); }
  };
  const room = Math.max(0, r.tank - r.fuel);
  const ice = r.items.ice ?? 0;
  const iceFill = Math.min(ice, Math.ceil(room / r.config.fuel_per_ice));
  const inkFill = Math.ceil(room / r.config.fuel_per_ink);
  const active = r.config.models.find((m) => m.id === r.active);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🚙 Rover garage" description="Drive across the worlds far faster than walking. Fuel burns by the kilometre.">
      <div className="grid gap-3" data-testid="rover-garage">
        {active && (
          <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{active.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold">{active.name}</div>
                <div className="text-[11px] text-muted">{active.speed} m/s · {active.burn_per_km} fuel a km · {r.km_today.toFixed(1)} km today · {r.km.toFixed(1)} km in all</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs font-bold">
              ⛽ <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full bg-ok" style={{ width: `${pct(r) * 100}%` }} /></span>
              <span className="tnum" data-testid="rover-fuel-amount">{Math.floor(r.fuel)}/{r.tank}</span>
            </div>
            {room > 0.5 ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" disabled={busy || iceFill < 1} onClick={() => act(() => api.roverRefuel(iceFill, 0), (x) => `Refuelled +${x.added} with ice`)} data-testid="rover-refuel-ice">
                  🧊 {iceFill > 0 ? `Use ${iceFill} ice` : 'No ice — dig some'}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => act(() => api.roverRefuel(0, inkFill), (x) => `Refuelled +${x.added}`)} data-testid="rover-refuel-ink">
                  Fill up · {inkFill} <ResourceIcon r="ink" className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : <div className="mt-2 text-center text-[11px] text-muted">Full tank — off you go.</div>}
            <div className="mt-1 text-center text-[10px] text-faint">1 ice = {r.config.fuel_per_ice} fuel · 1 Ink = {r.config.fuel_per_ink} fuel. You have 🧊 {ice}.</div>
          </div>
        )}
        <div className="grid gap-2">
          {r.config.models.map((m) => <ModelRow key={m.id} m={m} r={r} busy={busy} info={info}
            onBuy={() => act(() => api.roverBuy(m.id), (x) => (x.bought ? `${m.emoji} ${m.name} is yours!` : `${m.emoji} Switched to the ${m.name}`))} />)}
        </div>
        {active && r.fuel > 0 && !rover.driving && <Button variant="rainbow" onClick={() => { onOpenChange(false); void rover.start(); }} data-testid="rover-go">Hop in and drive</Button>}
      </div>
    </Dialog>
  );
}

function ModelRow({ m, r, busy, info, onBuy }: { m: RoverModel; r: RoverState; busy: boolean; info(k: string): { name: string; emoji: string }; onBuy(): void }) {
  const owned = r.owned.includes(m.id);
  const isActive = r.active === m.id;
  const mats = Object.entries(m.cost).filter(([k]) => k !== 'ink');
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border p-2.5', isActive ? 'border-accent/60 bg-accent/10' : 'border-line')} data-testid={`rover-model-${m.id}`}>
      <span className="text-3xl">{m.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{m.name}</div>
        <div className="text-[11px] text-muted">{m.speed} m/s · tank {m.tank} · {m.burn_per_km}/km</div>
        {!owned && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
            {m.cost.ink ? <span className="inline-flex items-center gap-0.5">{m.cost.ink}<ResourceIcon r="ink" className="h-3 w-3" /></span> : null}
            {mats.map(([k, n]) => <span key={k} className={(r.items[k] ?? 0) >= n ? 'text-ok' : 'text-hot'}>{info(k).emoji} {r.items[k] ?? 0}/{n}</span>)}
          </div>
        )}
      </div>
      {isActive ? <span className="text-xs font-bold text-accent-2">Driving this</span>
        : <Button size="sm" variant={owned ? 'secondary' : 'primary'} disabled={busy} onClick={onBuy} data-testid={`rover-buy-${m.id}`}>{owned ? 'Use' : 'Buy'}</Button>}
    </div>
  );
}
