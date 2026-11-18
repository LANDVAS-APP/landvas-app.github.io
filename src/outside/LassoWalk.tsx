// 🪢 The Lasso walk (the apps): walk a closed loop on your real location; the land inside becomes your Footprint for a
// day — claims anywhere inside skip the walk-up rule, your party sees your ink line on the map, and the week's biggest
// loop tops the board. The walk keeps recording while you look at other screens (keep LANDVAS open); the server checks
// it's a real walk (pace, a closed loop, where you end up).
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { enableGps, useExplorer } from '../explorer/explorer';
import { toMap } from '../lib/toMap';
import { cn } from '../lib/utils';
import { hit, play } from '../native/feel';
import { metres } from '../native/motion';
import { Button } from '../ui';
import { LASSO_KEY, useLassoView } from './LassoLayer';

export type Pt = [number, number, number, number]; // lng, lat, t (ms), accuracy (m)

/** square metres, the way people say it */
export function fmtArea(m2: number) {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(m2 >= 10_000_000 ? 0 : 2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(1)} ha`;
  return `${Math.round(m2).toLocaleString()} m²`;
}
/** the area inside a walked ring (closed back to its start), flat near the loop — the server's own sum */
export function ringArea(pts: { lng: number; lat: number }[]) {
  if (pts.length < 3) return 0;
  const k = 111_320 * Math.cos((pts[0].lat * Math.PI) / 180);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.lng * k * (q.lat * 111_320) - q.lng * k * (p.lat * 111_320);
  }
  return Math.abs(a) / 2;
}
/** keep a fix? good enough (≤ 40 m), and either a few metres on or a while since the last */
export function keepFix(last: Pt | undefined, p: Pt) {
  if (p[3] > 40) return false;
  if (!last) return true;
  return metres({ lng: last[0], lat: last[1] }, { lng: p[0], lat: p[1] }) >= 4 || p[2] - last[2] >= 10_000;
}
/** at most n points, evenly picked (always the first and last) */
export function thin(pts: Pt[], n = 5800) {
  if (pts.length <= n) return pts;
  const step = (pts.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => pts[Math.round(i * step)]);
}

type Walk = { on: boolean; pts: Pt[]; watch: number | null; started: number; start(): void; stop(): void };
export const useWalk = create<Walk>((set, get) => ({
  on: false, pts: [], watch: null, started: 0,
  start() {
    get().stop();
    const id = navigator.geolocation.watchPosition((pos) => {
      const p: Pt = [pos.coords.longitude, pos.coords.latitude, pos.timestamp || Date.now(), pos.coords.accuracy ?? 99];
      const pts = get().pts;
      if (keepFix(pts[pts.length - 1], p)) set({ pts: [...pts, p] });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 });
    set({ on: true, pts: [], watch: id, started: Date.now() });
  },
  stop() {
    const w = get().watch;
    if (w != null) navigator.geolocation.clearWatch(w);
    set({ on: false, watch: null });
  },
}));

export default function LassoWalk() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const view = useLassoView();
  const gps = useExplorer((s) => s.gps);
  const walk = useWalk();
  const [sending, setSending] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 1000); return () => clearInterval(t); }, []);
  const v = view.data;
  const cfg = v?.cfg;
  const pts = walk.pts;
  const ll = useMemo(() => pts.map((p) => ({ lng: p[0], lat: p[1] })), [pts]);
  const length = useMemo(() => ll.reduce((s, p, i) => (i ? s + metres(ll[i - 1], p) : 0), 0), [ll]);
  const area = useMemo(() => ringArea(ll), [ll]);
  const toStart = ll.length > 1 ? metres(ll[ll.length - 1], ll[0]) : null;
  const mins = walk.on ? (Date.now() - walk.started) / 60_000 : 0;
  // the pace over the last minute or so
  const recent = pts.filter((p) => p[2] > Date.now() - 60_000);
  const pace = recent.length > 1 ? (recent.reduce((s, p, i) => (i ? s + metres({ lng: recent[i - 1][0], lat: recent[i - 1][1] }, { lng: p[0], lat: p[1] }) : 0), 0) / Math.max(1, (recent[recent.length - 1][2] - recent[0][2]) / 1000)) * 3.6 : 0;
  const ready = !!cfg && walk.on && length >= cfg.min_len_m && mins >= cfg.min_minutes && toStart != null && toStart <= cfg.close_m && area >= cfg.min_area_m2;
  const near = !!cfg && toStart != null && length >= cfg.min_len_m && toStart <= cfg.close_m * 3;
  // you feel it come round: a pulse as you near the start, a flourish when the loop can close
  useEffect(() => { if (near && !ready) hit('light'); }, [pts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) play([[0, 'heavy'], [140, 'medium'], [300, 'success']], 'lasso'); }, [ready]);

  const close = async () => {
    setSending(true);
    try {
      const r = await api.lassoSubmit(thin(walk.pts));
      walk.stop();
      play([[0, 'heavy'], [120, 'heavy'], [320, 'success']], 'lasso');
      toast.success(`🪢 Your Footprint: ${fmtArea(r.area_m2)}`, { description: `Claim anywhere inside for ${cfg?.hours ?? 24} hours · #${r.rank} this week` });
      void qc.invalidateQueries({ queryKey: LASSO_KEY });
    } catch (e) { toast.error(toGameError(e).message); }
    finally { setSending(false); }
  };
  const mineLoop = v?.loops.find((l) => l.mine);
  const showLoop = (ring: [number, number][]) => {
    const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
    toMap(nav, { lng: c[0], lat: c[1], zoom: 15.6 });
  };

  return (
    <Page>
      <div className="lvo mx-auto grid max-w-lg gap-3 px-4 pb-8 pt-2" data-testid="lasso-screen">
        <div>
          <div className="text-[10.5px] font-black uppercase tracking-[0.18em] text-[#FF9BEA]">🪢 The Lasso walk</div>
          <h1 className="font-display text-[26px] font-black leading-tight">Walk a loop. Own what’s inside — for a day.</h1>
          <p className="mt-1 text-[13px] text-white/70">Walk a closed loop on your real location. The land inside becomes your Footprint for {cfg?.hours ?? 24} hours: claim any plot inside it without walking up to it, and your party sees your ink line on the map. The biggest loop of the week tops the board.</p>
        </div>

        {mineLoop && !walk.on && (
          <div className="lvo-card" data-testid="lasso-footprint">
            <div className="flex items-center gap-3">
              <LoopArt ring={mineLoop.ring} className="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <b className="text-[15px]">Your Footprint · {fmtArea(mineLoop.area_m2)}</b>
                <div className="text-[12px] text-white/60">Claim anywhere inside for another {left(mineLoop.expires_at)}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => showLoop(mineLoop.ring)} data-testid="lasso-show">📍 Map</Button>
            </div>
          </div>
        )}

        <div className="lvo-card" data-testid="lasso-walk">
          {walk.on ? (
            <>
              <LoopArt ring={ll.map((p) => [p.lng, p.lat] as [number, number])} live closeTo={near} className="mx-auto h-56 w-56" />
              <div className="mt-2 grid grid-cols-3 gap-2 text-center" data-testid="lasso-stats">
                <Stat label="walked" value={length >= 1000 ? `${(length / 1000).toFixed(2)} km` : `${Math.round(length)} m`} />
                <Stat label="inside" value={fmtArea(area)} />
                <Stat label="back to start" value={toStart == null ? '—' : `${Math.round(toStart)} m`} hot={near} />
              </div>
              {cfg && pace > cfg.max_kmh && <p className="mt-2 text-center text-[12px] font-black text-[#FFB31F]" data-testid="lasso-pace">🐢 Slow down — Lasso walks are on foot</p>}
              <p className="mt-2 text-center text-[12px] text-white/60">
                {ready ? 'You’re back at the start — close the loop!' : !cfg ? '' : length < cfg.min_len_m ? `Walk at least ${cfg.min_len_m} m, then head back to where you started.` : mins < cfg.min_minutes ? 'Keep going a little longer…' : `Head back to where you started (within ${cfg.close_m} m).`}
                {' '}Keep LANDVAS open while you walk.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" onClick={() => walk.stop()} data-testid="lasso-cancel">Stop</Button>
                <Button className="flex-1" variant="rainbow" disabled={!ready || sending} loading={sending} onClick={() => void close()} data-testid="lasso-close">🪢 Close the loop</Button>
              </div>
            </>
          ) : gps !== 'on' && !v?.gps ? (
            <Button className="w-full" variant="primary" onClick={() => enableGps()} data-testid="lasso-gps">📍 Turn on my location</Button>
          ) : (
            <>
              <Button className="w-full" variant="rainbow" disabled={!!v && !v.enabled || (!!cfg && (v?.today ?? 0) >= cfg.per_day)} onClick={() => { walk.start(); hit('medium'); }} data-testid="lasso-start">🚶 Start a loop here</Button>
              <p className="mt-2 text-center text-[11.5px] text-white/55">{cfg ? `${Math.max(0, cfg.per_day - (v?.today ?? 0))} of ${cfg.per_day} loops left today · at least ${cfg.min_len_m} m and ${cfg.min_minutes} minutes · up to ${fmtArea(cfg.max_area_m2)} inside · on foot (under ${cfg.max_kmh} km/h)` : ''}</p>
            </>
          )}
        </div>

        {!!v?.board.length && (
          <div className="lvo-card" data-testid="lasso-board">
            <h3 className="mb-2 text-[13px] font-black uppercase tracking-wider text-[#FFE8A3]">🏆 This week’s biggest loops</h3>
            <div className="grid gap-1">
              {v.board.map((b, i) => (
                <div key={b.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px]', b.me ? 'bg-[#FF5CDB]/15' : 'bg-white/[0.04]')}>
                  <b className="w-6 text-center tabular-nums text-white/60">{i + 1}</b><span className="flex-1 truncate font-bold">@{b.username}</span><b className="tabular-nums">{fmtArea(b.area_m2)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        {!!v?.loops.filter((l) => !l.mine).length && (
          <p className="text-center text-[12px] text-white/55" data-testid="lasso-party">Your party’s Footprints today: {v.loops.filter((l) => !l.mine).map((l) => `@${l.who.username} (${fmtArea(l.area_m2)})`).join(', ')} — they’re on your map.</p>
        )}
      </div>
    </Page>
  );
}

const left = (iso: string) => { const s = Math.max(0, (Date.parse(iso) - Date.now()) / 1000); return s > 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.ceil(s / 60)} min`; };

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return <div className={cn('rounded-xl bg-white/[0.05] px-1 py-1.5', hot && 'bg-[#FF5CDB]/20')}><b className="block font-display text-[16px] tabular-nums">{value}</b><i className="text-[10.5px] not-italic text-white/55">{label}</i></div>;
}

/** the loop drawn small: an ink line round a wash (live: the start marked, the closing stretch dashed) */
function LoopArt({ ring, live, closeTo, className }: { ring: [number, number][]; live?: boolean; closeTo?: boolean; className?: string }) {
  const W = 100;
  if (ring.length < 2) return <svg viewBox={`0 0 ${W} ${W}`} className={className}><circle cx={W / 2} cy={W / 2} r={4} fill="#FF5CDB" /></svg>;
  const k = Math.cos((ring[0][1] * Math.PI) / 180);
  const xs = ring.map((p) => p[0] * k), ys = ring.map((p) => -p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = (W - 16) / Math.max(1e-9, x1 - x0, y1 - y0);
  const P = ring.map((_, i) => [8 + (xs[i] - x0) * s + ((W - 16) - (x1 - x0) * s) / 2, 8 + (ys[i] - y0) * s + ((W - 16) - (y1 - y0) * s) / 2] as [number, number]);
  const d = P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className={className} aria-hidden>
      <path d={`${d} Z`} fill="#FF5CDB" fillOpacity={live ? 0.1 : 0.18} stroke="none" />
      <path d={d} fill="none" stroke="#FF5CDB" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {live && <line x1={P[P.length - 1][0]} y1={P[P.length - 1][1]} x2={P[0][0]} y2={P[0][1]} stroke={closeTo ? '#7CFFB2' : '#ffffff55'} strokeWidth={1.4} strokeDasharray="2 2" />}
      {live && <circle cx={P[0][0]} cy={P[0][1]} r={3.2} fill="#7CFFB2" />}
      {live && <circle cx={P[P.length - 1][0]} cy={P[P.length - 1][1]} r={3.6} fill="#fff" className="animate-pulse" />}
    </svg>
  );
}
