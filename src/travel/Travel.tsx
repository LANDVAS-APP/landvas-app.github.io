// Travel plots (v0.9.7): a Train or Plane subplot lets your explorer ride to real stations and airports on the map.
// Board at the station or airport nearest you, ride (trains stop at the real stations on the way), arrive and really
// be there — claim plots, play, check in — and collect a souvenir stamp for every new stop. Head home when you're done.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { toast } from 'sonner';
import * as maplibregl from 'maplibre-gl';
import { Home, Plane, Search, TrainFront } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { TravelArrival, TravelMode, TravelPlan, TravelStatus, TravelStop, TravelStopInfo, TravelTrip } from '../backend/types';
import { explorerNow, useExplorer } from '../explorer/explorer';
import { searchPlaces, type Place } from '../map/places';
import { mapHandle } from '../map/mapHandle';
import { useOnboardedMe, useInvalidate } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { config } from '../env';
import { TrafficLayer, trafficAt, trafficPath, useTraffic, useTrafficPref } from './traffic';
import type { TravelTraffic } from '../backend/types';
import { Button, Dialog, PlayerAvatar, Spinner, Switch, Tabs, inputCls } from '../ui';

export const TRAVEL_KEY = ['travel'] as const;
const MODE_META: Record<TravelMode, { name: string; emoji: string; stop: string; stops: string; verb: string }> = {
  train: { name: 'Train', emoji: '🚆', stop: 'station', stops: 'stations', verb: 'Ride' },
  plane: { name: 'Plane', emoji: '✈️', stop: 'airport', stops: 'airports', verb: 'Fly' },
};

/** the arrival card waiting to be shown, and whether the travel sheet is open */
export const useTravelUi = create<{ open: boolean; arrival: TravelArrival | null; stop: string | null; setOpen(o: boolean): void; setArrival(a: TravelArrival | null): void; setStop(s: string | null): void }>((set) => ({
  open: false, arrival: null, stop: null,
  setOpen: (open) => set({ open }), setArrival: (arrival) => set({ arrival }), setStop: (stop) => set({ stop }),
}));

export const fmtDur = (s: number) => {
  s = Math.max(0, Math.round(s));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
};

let seen: TravelStatus | undefined;
/** keeps the travel status fresh: while you ride it checks in when you're due to arrive */
export function useTravel() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const q = useQuery({ queryKey: TRAVEL_KEY, queryFn: api.travelStatus, enabled: !!me, staleTime: 15_000, refetchInterval: (x) => (x.state.data?.away ? 30_000 : false) });
  const d = q.data;
  if (typeof window !== 'undefined' && (config.e2e || import.meta.env.DEV)) (window as any).__landvasTravel = { refresh: () => qc.invalidateQueries({ queryKey: TRAVEL_KEY }), ui: useTravelUi };
  useEffect(() => {
    if (!d || seen === d) return;
    seen = d;
    if (d.explorer) useExplorer.getState().set(d.explorer);
    if (d.arrival) {
      useTravelUi.getState().setArrival(d.arrival);
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);
  // due at the next station (or to arrive): check in then, and the ride moves on to its next leg
  const exArr = useExplorer((s) => (s.state?.mode === 'travel' ? s.state.arrives_at : null));
  const due = d?.trip && !d.trip.arrived ? new Date(exArr ?? d.trip.arrives_at).getTime() : 0;
  useEffect(() => {
    if (!due) return;
    const off = useExplorer.getState().offset;
    const t = setTimeout(() => void qc.invalidateQueries({ queryKey: TRAVEL_KEY }), Math.max(400, due - (Date.now() + off) + 700));
    return () => clearTimeout(t);
  }, [due, qc]);
  return q;
}

function useNow(ms = 500) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

/** seconds left, and the next stop, of the trip under way */
function tripProgress(trip: TravelTrip) {
  const { state, offset } = useExplorer.getState();
  const p = explorerNow(state, offset);
  const left = (new Date(trip.arrives_at).getTime() - (Date.now() + offset)) / 1000;
  const total = (new Date(trip.arrives_at).getTime() - new Date(trip.departs_at).getTime()) / 1000;
  const f = Math.min(1, Math.max(0, 1 - left / Math.max(total, 1)));
  // the station this leg is heading for (and whether the train is standing at one)
  const next = trip.stops[trip.leg] ?? null;
  return { left, f, next, standing: !!p && !p.traveling && !trip.arrived };
}

/** the rail button: Travel, or the trip under way */
export function TravelButton() {
  const q = useTravel();
  const open = useTravelUi((s) => s.setOpen);
  useNow(1000);
  const d = q.data;
  const trip = d?.trip;
  const riding = trip && !trip.arrived;
  const label = riding ? fmtDur(tripProgress(trip).left) : d?.away ? 'Away' : 'Travel';
  const Icon = trip?.mode === 'plane' ? Plane : trip?.mode === 'home' ? Home : TrainFront;
  return (
    <button className={cn('lv-gbtn round', riding && 'hot', d?.away && !riding && 'on')} onClick={() => open(true)} title="Ride a train or fly to real stations and airports" data-testid="travel-button">
      <Icon className={cn('h-5 w-5', riding && 'animate-[lv-bob_1.2s_ease-in-out_infinite]')} /><span className="lbl tnum">{label}</span>
    </button>
  );
}

/** the bar while you're away: on the way (next stop, time left), or there (head home) */
export function TravelBar() {
  const q = useTravel();
  const d = q.data;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  useNow(500);
  const trip = d?.trip;
  if (!d?.away || !trip) return null;
  const riding = !trip.arrived;
  const pr = tripProgress(trip);
  const home = async () => {
    setBusy(true);
    try {
      const st = await api.travelHome();
      qc.setQueryData(TRAVEL_KEY, st);
      if (st.explorer) useExplorer.getState().set(st.explorer);
      useExplorer.getState().setFollowing(true);
      toast('Heading home 🚕', { description: 'Your GPS takes over again when you’re back.' });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const emoji = trip.mode === 'home' ? '🚕' : MODE_META[trip.mode].emoji;
  return (
    <div className="pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-2xl bg-[#0B0E24]/92 px-4 py-2.5 text-white shadow-xl backdrop-blur" data-testid="travel-bar">
      <span className="text-2xl">{riding ? emoji : '📍'}</span>
      <div className="min-w-0 flex-1 leading-tight">
        {riding ? (
          <>
            <div className="truncate text-sm font-bold" data-testid="travel-bar-title">{trip.mode === 'home' ? 'Heading home' : `To ${trip.to?.name}`}</div>
            <div className="truncate text-[11px] text-white/65">
              {pr.next ? <>{pr.standing ? 'Calling at' : 'Next stop'}: <b className="text-white/90" data-testid="travel-next-stop">{pr.next.name}</b> · </> : null}<span className="tnum">{fmtDur(pr.left)}</span> left
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FFB020]" style={{ width: `${Math.min(100, pr.f * 100)}%` }} /></div>
          </>
        ) : (
          <>
            <div className="truncate text-sm font-bold" data-testid="travel-bar-title">You’re in {trip.to?.name}</div>
            <div className="truncate text-[11px] text-white/65">Really here: claim plots, play and check in nearby.</div>
          </>
        )}
      </div>
      {!riding && <Button size="sm" variant="rainbow" loading={busy} onClick={home} data-testid="travel-home">🏠 Home</Button>}
    </div>
  );
}

/** the travel sheet: pick Train or Plane, search a place or a stop, see the ride, board */
export function TravelSheet() {
  const open = useTravelUi((s) => s.open);
  const setOpen = useTravelUi((s) => s.setOpen);
  const q = useTravel();
  const d = q.data;
  const [tab, setTab] = useState<'train' | 'plane' | 'passport' | 'people'>('train');
  useEffect(() => {
    // open on the kind of plot you have
    if (open && d && !d.train.plots && d.plane.plots) setTab((t) => (t === 'train' ? 'plane' : t));
  }, [open, d]);
  return (
    <Dialog open={open} onOpenChange={setOpen} title={<span className="flex items-center gap-2">🧳 Travel</span>}
      description="Ride trains and fly to real stations and airports. When you arrive you’re really there.">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-3"
        items={[{ value: 'train', label: '🚆 Train' }, { value: 'plane', label: '✈️ Plane' }, { value: 'passport', label: `🛂 Passport${d?.stamps ? ` · ${d.stamps}` : ''}` }, { value: 'people', label: '🌍 Travellers' }]} />
      {!d ? <div className="flex justify-center py-8"><Spinner /></div>
        : tab === 'passport' ? <Passport status={d} />
        : tab === 'people' ? <Travellers status={d} onDone={() => setOpen(false)} />
        : <ModePane key={tab} mode={tab} status={d} onDone={() => setOpen(false)} />}
    </Dialog>
  );
}

function ModePane({ mode, status, onDone }: { mode: TravelMode; status: TravelStatus; onDone(): void }) {
  const m = MODE_META[mode];
  const own = status[mode];
  const [text, setText] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [pick, setPick] = useState<TravelStop | null>(null);
  const qt = text.trim();
  const stops = useQuery({ queryKey: ['travel-search', mode, qt], queryFn: () => api.travelSearch(mode, qt), enabled: qt.length >= 2 && !place, staleTime: 60_000 });
  const places = useQuery({ queryKey: ['places', qt], queryFn: () => searchPlaces(qt, 4), enabled: qt.length >= 2 && !place, staleTime: 60_000 });
  const near = useQuery({ queryKey: ['travel-near', mode, place?.lng, place?.lat], queryFn: () => api.travelSearch(mode, null, place!), enabled: !!place });
  const riding = status.trip && !status.trip.arrived;
  if (pick) return <PlanView mode={mode} stop={pick} status={status} onBack={() => setPick(null)} onDone={onDone} />;
  return (
    <div className="space-y-3" data-testid={`travel-pane-${mode}`}>
      <div className={cn('rounded-2xl px-3.5 py-2.5 text-[13px]', own.plots ? 'bg-surface-2/70' : 'bg-[#FFB020]/12 text-fg')}>
        {own.plots ? (
          <span data-testid="travel-trips-left">{m.emoji} <b>{own.left}</b> {own.left === 1 ? 'trip' : 'trips'} left today · {own.plots} {m.name} {own.plots === 1 ? 'plot' : 'plots'}</span>
        ) : (
          <span data-testid="travel-needs-plot">{m.emoji} To {m.verb.toLowerCase()}, set one of your plots to <b>Travel · {m.name}</b>. <Link to="/plots" className="font-bold text-accent underline" onClick={onDone}>Your plots</Link></span>
        )}
      </div>
      {riding && <div className="rounded-2xl bg-surface-2/70 px-3.5 py-2.5 text-[13px]">You’re on the way — you can plan your next trip once you arrive.</div>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input className={cn(inputCls, 'pl-9')} placeholder={`Search a city or ${m.stop}…`} value={text} autoFocus data-testid="travel-search"
          onChange={(e) => { setText(e.target.value); setPlace(null); }} />
      </div>
      {place ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>{m.stops.replace(/^./, (c) => c.toUpperCase())} near <b className="text-fg">{place.name}</b></span>
            <button className="font-bold text-accent" onClick={() => setPlace(null)}>Back</button>
          </div>
          {near.isLoading ? <div className="flex justify-center py-4"><Spinner /></div>
            : !near.data?.length ? <div className="py-3 text-center text-[13px] text-muted">No {m.stops} near there{mode === 'train' ? ' on our rail map yet — try a plane.' : '.'}</div>
            : near.data.map((s) => <StopRow key={s.id} s={s} sub={`${fmt(s.from_point_km ?? 0)} km from ${place.name}`} onClick={() => setPick(s)} />)}
        </div>
      ) : qt.length >= 2 ? (
        <div className="space-y-1.5">
          {(stops.data ?? []).slice(0, 8).map((s) => <StopRow key={s.id} s={s} onClick={() => setPick(s)} />)}
          {(places.data ?? []).filter((p) => p.kind === 'city').map((p) => (
            <button key={p.name + p.lng} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2/70" onClick={() => setPlace(p)} data-testid="travel-place">
              <span className="text-lg">📍</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-[11px] text-muted">{p.sub} · {m.stops} nearby</span></span>
            </button>
          ))}
          {stops.isFetching && !stops.data && <div className="flex justify-center py-3"><Spinner /></div>}
          {!stops.isFetching && !stops.data?.length && !places.data?.length && <div className="py-3 text-center text-[13px] text-muted">Nothing called that.</div>}
        </div>
      ) : (
        <div className="px-1 text-[12px] leading-relaxed text-muted">
          {mode === 'train'
            ? 'Trains run on real lines: the US (Amtrak), Great Britain, Europe, and big stations elsewhere. You board at the station nearest you and stop at the real stations on the way.'
            : 'Fly to any of 3,000+ real airports worldwide. You board at the airport nearest you.'}
        </div>
      )}
    </div>
  );
}

function StopRow({ s, sub, onClick }: { s: TravelStop; sub?: string; onClick(): void }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2/70" onClick={onClick} data-testid="travel-stop" data-stop={s.id}>
      <span className="text-lg">{s.kind === 'airport' ? '✈️' : '🚉'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{s.name}</span>
        <span className="block truncate text-[11px] text-muted">{sub ?? [s.code, countryName(s.country), s.km != null ? `${fmt(s.km)} km away` : null].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(cc: string) {
  if (!cc) return '';
  try { regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' }); return regionNames.of(cc) ?? cc; } catch { return cc; }
}
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');

function PlanView({ mode, stop, status, onBack, onDone }: { mode: TravelMode; stop: TravelStop; status: TravelStatus; onBack(): void; onDone(): void }) {
  const m = MODE_META[mode];
  const qc = useQueryClient();
  const requestFly = useUi((s) => s.requestFly);
  const plan = useQuery({ queryKey: ['travel-plan', mode, stop.id, status.explorer?.lng, status.explorer?.lat], queryFn: () => api.travelPlan(mode, stop.id), retry: false });
  const [busy, setBusy] = useState(false);
  const p: TravelPlan | undefined = plan.data;
  const riding = !!status.trip && !status.trip.arrived;
  const board = async () => {
    setBusy(true);
    try {
      const st = await api.travelDepart(mode, stop.id);
      qc.setQueryData(TRAVEL_KEY, st);
      if (st.explorer) {
        useExplorer.getState().set(st.explorer);
        requestFly({ lng: st.explorer.lng, lat: st.explorer.lat, zoom: mode === 'plane' ? 4 : 7 });
        useExplorer.getState().setFollowing(true);
      }
      toast.success(`${m.emoji} All aboard!`, { description: `${p?.from.name} → ${stop.name}` });
      onDone();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3" data-testid="travel-plan">
      <button className="text-[12px] font-bold text-accent" onClick={onBack}>← Back</button>
      {plan.isLoading ? <div className="flex justify-center py-8"><Spinner /></div>
        : plan.error ? <div className="rounded-2xl bg-surface-2/70 px-4 py-3 text-sm" data-testid="travel-plan-error">{toGameError(plan.error).message}</div>
        : p && (
          <>
            <div className="rounded-2xl bg-surface-2/70 p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-faint">Board at</div>
                  <div className="truncate text-sm font-bold" data-testid="plan-from">{p.from.name}</div>
                  <div className="text-[11px] text-muted">{p.board_km < 0.5 ? 'right here' : `${fmt(p.board_km)} km from you`}</div>
                </div>
                <span className="text-2xl">{m.emoji}</span>
                <div className="min-w-0 flex-1 text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-faint">Arrive at</div>
                  <div className="truncate text-sm font-bold" data-testid="plan-to">{p.to.name}</div>
                  <div className="text-[11px] text-muted">{flag(p.to.country)} {countryName(p.to.country)}</div>
                </div>
              </div>
              <div className="mt-3 flex justify-center gap-4 text-[12px] text-muted">
                <span><b className="text-fg tnum">{fmt(p.km)}</b> km</span><span><b className="text-fg tnum">{fmtDur(p.seconds)}</b> ride</span>
                {mode === 'train' && <span><b className="text-fg">{p.stops.length}</b> {p.stops.length === 1 ? 'stop' : 'stops'}</span>}
              </div>
            </div>
            {p.stops.length > 0 && (
              <ol className="relative ml-3 space-y-1.5 border-l-2 border-dashed border-line pl-4 text-[13px]" data-testid="plan-stops">
                {p.stops.map((s) => <li key={s.id} className="relative"><span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#FFB020]" />{s.name}</li>)}
              </ol>
            )}
            <Button variant="primary" className="w-full" loading={busy} disabled={!p.plots || p.left < 1 || riding} onClick={board} data-testid="travel-board">
              {!p.plots ? `Needs a Travel · ${m.name} plot` : p.left < 1 ? 'No trips left today' : riding ? 'Still on the way' : `${m.emoji} Board · ${p.left} ${p.left === 1 ? 'trip' : 'trips'} left`}
            </Button>
            <div className="text-center text-[11px] text-muted">While you’re away your GPS rests. Head home any time.</div>
          </>
        )}
    </div>
  );
}

/** a souvenir stamp: a round ink stamp with the stop's code and the date */
export function Stamp({ s, date, size = 96, fresh }: { s: TravelStop; date?: string; size?: number; fresh?: boolean }) {
  const hue = [...s.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const col = `hsl(${hue} 62% 46%)`;
  const d = date ? new Date(date) : new Date();
  const when = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }).toUpperCase();
  const code = (s.code || s.name.slice(0, 3)).toUpperCase().slice(0, 4);
  const id = `st-${s.id.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={cn(fresh && 'animate-[lv-pop_.5s_ease-out]')} style={{ transform: `rotate(${(hue % 19) - 9}deg)` }} aria-label={`Stamp: ${s.name}`}>
      <defs><path id={id} d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" /></defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke={col} strokeWidth="3.5" />
      <circle cx="50" cy="50" r="29" fill="none" stroke={col} strokeWidth="1.6" strokeDasharray="2 2" />
      <text fontSize="8.2" fontWeight="800" fill={col} letterSpacing="1.2"><textPath href={`#${id}`}>{s.name.toUpperCase().slice(0, 34)}</textPath></text>
      <text x="50" y="47" textAnchor="middle" fontSize={code.length > 3 ? 15 : 19} fontWeight="900" fill={col}>{code}</text>
      <text x="50" y="60" textAnchor="middle" fontSize="12">{s.kind === 'airport' ? '✈️' : '🚆'}</text>
      <text x="50" y="72" textAnchor="middle" fontSize="6.5" fontWeight="700" fill={col}>{when}</text>
    </svg>
  );
}

/** you've arrived: the stamp, any Ink, and you're really there */
export function ArrivalCard() {
  const a = useTravelUi((s) => s.arrival);
  const set = useTravelUi((s) => s.setArrival);
  const open = !!a && (!!a.stop || !!a.home);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && set(null)} title={a?.home ? '🏠 Home again' : `Welcome to ${a?.stop?.name ?? ''}`}
      description={a?.home ? 'Your GPS has your explorer again.' : 'You’re really here: claim plots, play and check in nearby.'}>
      {a?.stop && (
        <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="travel-arrival">
          <Stamp s={a.stop} size={150} fresh={a.new_stamp} />
          {a.new_stamp ? (
            <div className="text-sm font-bold" data-testid="arrival-new-stamp">New stamp in your passport!{a.new_country ? ` First time in ${countryName(a.stop.country)} ${flag(a.stop.country)}` : ''}</div>
          ) : <div className="text-sm text-muted">Back again — this one’s already in your passport.</div>}
          {!!a.ink && <div className="rounded-full bg-accent/15 px-3 py-1 text-sm font-bold text-accent">+{a.ink} Ink</div>}
        </div>
      )}
      <Button variant="primary" className="mt-3 w-full" onClick={() => set(null)} data-testid="arrival-close">{a?.home ? 'OK' : 'Explore'}</Button>
    </Dialog>
  );
}

function Passport({ status }: { status: TravelStatus }) {
  const pp = useQuery({ queryKey: ['travel-passport', status.stamps], queryFn: api.travelPassport });
  return (
    <div data-testid="travel-passport">
      <div className="mb-3 flex justify-center gap-6 text-center">
        <div><div className="text-2xl font-black tnum">{status.stamps}</div><div className="text-[11px] text-muted">stamps</div></div>
        <div><div className="text-2xl font-black tnum">{status.countries}</div><div className="text-[11px] text-muted">countries</div></div>
      </div>
      {pp.isLoading ? <div className="flex justify-center py-6"><Spinner /></div>
        : !pp.data?.length ? <div className="py-6 text-center text-sm text-muted">No stamps yet. Every new station and airport you travel to is a stamp.</div>
        : (
          <div className="grid grid-cols-3 gap-2">
            {pp.data.map((s) => (
              <button key={s.id} className="flex flex-col items-center rounded-2xl bg-surface-2/50 p-2 hover:bg-surface-2" onClick={() => useTravelUi.getState().setStop(s.id)} data-testid="passport-stamp">
                <Stamp s={s} date={s.first_at} size={78} />
                <span className="mt-1 w-full truncate text-[11px] font-semibold">{s.name}</span>
                {s.visits > 1 && <span className="text-[10px] text-muted">×{s.visits}</span>}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

/** one station or airport's building: who has been here */
export function StopInfoDialog() {
  const id = useTravelUi((s) => s.stop);
  const set = useTravelUi((s) => s.setStop);
  const q = useQuery({ queryKey: ['travel-stop', id], queryFn: () => api.travelStop(id!), enabled: !!id });
  const s: TravelStopInfo | undefined = q.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && set(null)} title={s ? `${s.kind === 'airport' ? '✈️' : '🚉'} ${s.name}` : '…'}
      description={s ? `${flag(s.country)} ${countryName(s.country)}${s.code ? ` · ${s.code}` : ''}` : undefined}>
      {!s ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <div className="space-y-3" data-testid="stop-info">
          <div className="flex items-center gap-4">
            {s.mine ? <Stamp s={s} date={s.mine.first_at} size={84} /> : <div className="grid h-[84px] w-[84px] place-items-center rounded-full border-2 border-dashed border-line text-center text-[10px] text-muted">No stamp yet</div>}
            <div className="text-sm"><b className="tnum">{fmt(s.visitors)}</b> {s.visitors === 1 ? 'traveller has' : 'travellers have'} been here.{s.mine ? ` You’ve visited ${s.mine.visits}×.` : ''}</div>
          </div>
          {s.recent.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.recent.map((p) => <Link key={p.id} to={`/u/${p.username}`} onClick={() => set(null)} className="flex items-center gap-1.5 rounded-full bg-surface-2/70 py-1 pl-1 pr-2.5 text-[12px] font-semibold"><PlayerAvatar p={p} size={22} />@{p.username}</Link>)}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---- on the map: the stations and airports people have travelled to, and your trip's stops ----------------------
const STATION_SVG = `<svg viewBox="0 0 46 38" class="bld"><path d="M3 36V17h40v19z" fill="#C9B79C"/><path d="M1 18 23 4l22 14z" fill="#8E3B2E"/><rect x="18" y="20" width="10" height="16" rx="5" fill="#2E3A55"/><rect x="6" y="22" width="7" height="8" rx="1.5" fill="#FFE7A3"/><rect x="33" y="22" width="7" height="8" rx="1.5" fill="#FFE7A3"/><circle cx="23" cy="13" r="4" fill="#fff" stroke="#2E3A55" stroke-width="1.2"/><path d="M23 11v2.2l1.6 1" stroke="#2E3A55" stroke-width="1" fill="none"/></svg>`;
const AIRPORT_SVG = `<svg viewBox="0 0 46 38" class="bld"><rect x="2" y="22" width="34" height="14" rx="2" fill="#B9C6D6"/><path d="M2 22h34l-4-5H6z" fill="#6E86A3"/><rect x="5" y="25" width="28" height="5" fill="#9FD3FF"/><rect x="37" y="9" width="5" height="27" fill="#93A3B8"/><path d="M34 4h11l-2 6h-7z" fill="#3D5878"/><rect x="35" y="5.5" width="9" height="3" fill="#9FD3FF"/></svg>`;

function stopEl(name: string, kind: TravelStop['kind'], cls: string, onClick?: () => void) {
  const el = document.createElement('div');
  el.className = `lv-stop ${cls}`;
  el.innerHTML = (kind === 'airport' ? AIRPORT_SVG : STATION_SVG) + `<div class="nm"></div>`;
  (el.querySelector('.nm') as HTMLElement).textContent = name;
  if (onClick) el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return el;
}

/** buildings at every stop someone has travelled to (in view), and your trip's stations */
export function TravelMapLayer() {
  const q = useTravel();
  const trip = q.data?.away ? q.data.trip : null;
  const [bbox, setBbox] = useState<{ w: number; s: number; e: number; n: number } | null>(null);
  // follow the map
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    let map = mapHandle.current;
    const read = () => {
      map = mapHandle.current;
      if (!map) return;
      // zoomed far out, only the destination keeps its name (the stations on the way would pile up)
      map.getContainer().classList.toggle('lv-zoom-far', map.getZoom() < 6);
      if (map.getZoom() < 7) { setBbox(null); return; }
      const b = map.getBounds();
      const r = (x: number) => Math.round(x * 20) / 20;
      setBbox((o) => {
        const n = { w: r(b.getWest()) - 0.05, s: r(b.getSouth()) - 0.05, e: r(b.getEast()) + 0.05, n: r(b.getNorth()) + 0.05 };
        return o && o.w === n.w && o.s === n.s && o.e === n.e && o.n === n.n ? o : n;
      });
    };
    const on = () => { if (t) clearTimeout(t); t = setTimeout(read, 350); };
    const iv = setInterval(() => { if (mapHandle.current && mapHandle.current !== map) { map?.off('moveend', on); map = mapHandle.current; map.on('moveend', on); read(); } }, 1000);
    if (map) { map.on('moveend', on); read(); }
    return () => { clearInterval(iv); if (t) clearTimeout(t); map?.off('moveend', on); };
  }, []);
  const blds = useQuery({ queryKey: ['travel-buildings', bbox], queryFn: () => api.travelBuildings(bbox!), enabled: !!bbox, staleTime: 60_000 });
  const want = useMemo(() => {
    const m = new Map<string, { name: string; kind: TravelStop['kind']; lng: number; lat: number; cls: string }>();
    for (const b of blds.data ?? []) m.set(b.id, { name: b.name, kind: b.kind, lng: b.lng, lat: b.lat, cls: '' });
    if (trip && trip.mode !== 'home') {
      const kind = trip.mode === 'plane' ? 'airport' : 'station';
      for (const s of trip.stops) if (!m.has(s.id)) m.set(s.id, { name: s.name, kind, lng: s.lng, lat: s.lat, cls: 'way' });
      if (trip.from) m.set(trip.from.id, { ...trip.from, cls: m.has(trip.from.id) ? '' : 'way' });
      if (trip.to) m.set(trip.to.id, { ...trip.to, cls: 'dest' });
    }
    return m;
  }, [blds.data, trip]);
  const markers = useRef(new Map<string, { m: maplibregl.Marker; key: string }>());
  useEffect(() => {
    const map = mapHandle.current;
    if (!map) return;
    const have = markers.current;
    for (const [id, v] of have) {
      const w = want.get(id);
      if (!w || w.cls + w.name !== v.key) { v.m.remove(); have.delete(id); }
    }
    for (const [id, w] of want) {
      if (have.has(id)) continue;
      const el = stopEl(w.name, w.kind, w.cls, () => useTravelUi.getState().setStop(id));
      el.dataset.testid = 'travel-building'; el.dataset.stop = id;
      have.set(id, { m: new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, w.cls === 'way' ? -4 : -34] }).setLngLat([w.lng, w.lat]).addTo(map), key: w.cls + w.name });
    }
  }, [want]);
  useEffect(() => () => { for (const v of markers.current.values()) v.m.remove(); markers.current.clear(); }, []);
  // the whole line, through its stations
  const line = useMemo(() => {
    if (!trip || trip.mode === 'home' || !trip.from || !trip.to || trip.arrived) return null;
    return [[trip.from.lng, trip.from.lat], ...trip.stops.map((s) => [s.lng, s.lat]), [trip.to.lng, trip.to.lat]];
  }, [trip]);
  useEffect(() => {
    let tries = 0, t: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      const map = mapHandle.current;
      if (!map || !map.isStyleLoaded()) { if (tries++ < 40) t = setTimeout(draw, 500); return; }
      const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line ?? [] } };
      const src = map.getSource('lv-trip') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        map.addSource('lv-trip', { type: 'geojson', data });
        map.addLayer({ id: 'lv-trip', type: 'line', source: 'lv-trip', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#2FA4D9', 'line-width': 4, 'line-opacity': 0.55 } }, map.getLayer('lv-route') ? 'lv-route' : undefined);
      }
    };
    draw();
    return () => { if (t) clearTimeout(t); };
  }, [line]);
  return null;
}

/** everything Travel adds to the map screen */
export function TravelOverlays() {
  const away = !!useTravel().data?.away;
  const show = useTrafficPref((s) => s.show);
  return (<><TravelMapLayer /><TrafficLayer enabled={away || show} /><TravelSheet /><ArrivalCard /><StopInfoDialog /></>);
}

const ago = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** who else is travelling: their rides and flights, and whether yours show */
function Travellers({ status, onDone }: { status: TravelStatus; onDone(): void }) {
  const q = useTraffic(true);
  const qc = useQueryClient();
  const pref = useTrafficPref();
  const requestFly = useUi((s) => s.requestFly);
  useNow(1000);
  const [share, setShare] = useState(status.share !== false);
  const now = Date.now() + useExplorer.getState().offset;
  const look = (t: TravelTraffic) => {
    const { p } = trafficAt(t, trafficPath(t), now);
    pref.set(true);
    useExplorer.getState().setFollowing(false);
    requestFly({ lng: p[0], lat: p[1], zoom: t.mode === 'plane' ? 4 : 7 });
    onDone();
  };
  return (
    <div className="space-y-3" data-testid="travel-people">
      <div className="grid gap-2 rounded-2xl bg-surface-2/60 p-3">
        <Switch id="show-traffic" checked={pref.show || status.away} onCheckedChange={(v) => pref.set(v)} label="Show travellers on the map" hint={status.away ? 'Always on while you’re away' : 'Their trains and planes, with their names'} />
        <Switch id="share-trips" checked={share} label="Share my trips" hint="Others see your rides and flights (never your trips home, nor the station by your home)"
          onCheckedChange={async (v) => { setShare(v); try { await api.travelShare(v); void qc.invalidateQueries({ queryKey: TRAVEL_KEY }); } catch (e) { setShare(!v); toast.error(toGameError(e).message); } }} />
      </div>
      {q.isLoading ? <div className="flex justify-center py-6"><Spinner /></div>
        : !q.data?.length ? <div className="py-6 text-center text-sm text-muted">Nobody else is travelling right now. Check back soon!</div>
        : (
          <div className="grid gap-1.5">
            {q.data.map((t) => {
              const left = (new Date(t.arrives_at).getTime() - now) / 1000;
              const done = t.arrived || left <= 0;
              return (
                <button key={t.trip} onClick={() => look(t)} className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2/70" data-testid="traveller-row">
                  <PlayerAvatar p={t} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">@{t.username} <span className="font-normal">{t.mode === 'plane' ? '✈️' : '🚆'}</span></span>
                    <span className="block truncate text-[11px] text-muted">{t.from ? (t.from.code || t.from.name) : '…'} → {t.to.name}</span>
                  </span>
                  <span className={cn('shrink-0 text-right text-[11px] tnum', done ? 'text-muted' : 'font-bold text-[#2FA4D9]')}>
                    {done ? `arrived ${ago(now - new Date(t.arrives_at).getTime())}` : `${t.mode === 'plane' ? 'lands' : 'arrives'} in ${fmtDur(left)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}


/** on a Train or Plane plot's panel: what it does, trips left today, your stamps */
export function TravelPlotCard({ mode }: { mode: TravelMode }) {
  const q = useTravel();
  const m = MODE_META[mode];
  const d = q.data;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#2FA4D9]/40 bg-[#2FA4D9]/10 p-3" data-testid="travel-plot-card">
      <span className="text-3xl">{m.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Travel · {m.name}</div>
        <div className="text-sm font-semibold">{mode === 'train' ? 'Ride to real stations' : 'Fly to real airports'}</div>
        {d && <div className="text-[11px] text-muted"><b className="text-fg tnum">{d[mode].left}</b> {d[mode].left === 1 ? 'trip' : 'trips'} left today · {d.stamps} {d.stamps === 1 ? 'stamp' : 'stamps'} · {d.countries} {d.countries === 1 ? 'country' : 'countries'}</div>}
      </div>
    </div>
  );
}
