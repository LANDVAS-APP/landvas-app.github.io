// 📡 The Size Ray, on the map: pick any plot, choose GROW or SHRINK, and fire as the needle peaks. The beam comes down from
// the top of the screen onto the plot, the screen shakes, and the plot's own drawing goes 100× bigger (or 100× smaller) on
// everyone's map — the camera pulls back to show the whole giant. Your own plot: for real. Someone else's: a prank, just
// for show (they're told, and can undo it). The server times the needle from its own clock and decides how long it lasts.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '../backend/api';
import { qk } from '../lib/queries';
import { useUi } from '../lib/store';
import { flyAway } from '../lib/toMap';
import { cn } from '../lib/utils';
import { isNative } from '../native/native';
import { mapHandle } from '../map/mapHandle';
import { PLOT_TYPES } from '../map/plotStyle';
import { cellCenter, cellPolygon } from '../shared/grid';
import { rarityInfo } from '../shared/rarity';
import { Button } from '../ui';
import { efx, useAct, useEnchant, useMyEnchantments } from './core';
import { dur } from './kinds';
import { askMotion, feel, useTilt } from './living';

export type RayMode = 'grow' | 'shrink';
export const RAY = { grow: { label: 'GROW', emoji: '🔼', c: '#39FF14', c2: '#B6FF3D', text: 'Giant: its drawing goes 100× bigger on everyone’s map. Yours: its minigames pay more — and every Parasite and Leviathan sees it.',
    prank: 'Prank: their drawing goes 100× bigger on everyone’s map for up to 3 hours — just for show. They’ll know it was you.' },
  shrink: { label: 'SHRINK', emoji: '🔽', c: '#FF00E5', c2: '#FF7AE0', text: 'Tiny: its drawing shrinks 100× — a speck you need a magnifying glass for. Yours: nobody can find it and its time runs fast, but its minigames pay less.',
    prank: 'Prank: their drawing shrinks 100× on everyone’s map for up to 3 hours — just for show. They’ll know it was you.' } } as const;

/** the map's targeting mode */
export const useRayTarget = create<{ ray: string | null; mode: RayMode; picked: { gx: number; gy: number } | null;
  start(ray: string, mode?: RayMode): void; setMode(m: RayMode): void; pick(c: { gx: number; gy: number } | null): void; cancel(): void }>((set) => ({
  ray: null, mode: 'grow', picked: null,
  start: (ray, mode) => set((s) => ({ ray, mode: mode ?? s.mode, picked: null })),
  setMode: (mode) => set({ mode }),
  pick: (picked) => set({ picked }),
  cancel: () => set({ ray: null, picked: null }),
}));

const GRADE_C: Record<string, string> = { PERFECT: '#B6FF3D', GREAT: '#39FF14', GOOD: '#FFD23F', WIDE: '#FF9F1C', MISS: '#FF4D6D' };

/** aim → a swinging needle (the server's own formula) → fire */
export function useRayShot(id: string | null) {
  const { act, busy } = useAct(id ?? '');
  const [aim, setAim] = useState<{ at: number; period: number; offset: number } | null>(null);
  const needle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aim) return;
    let raf = 0, lastBuzz = 0;
    const f = () => {
      const t = (Date.now() + aim.offset) / 1000 - aim.at;
      const x = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / aim.period);
      if (needle.current) needle.current.style.transform = `translateX(${x * 100}%)`;
      // a tick in your hand as it nears the peak
      if (x > 0.93 && performance.now() - lastBuzz > aim.period * 800) { lastBuzz = performance.now(); feel('light'); }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [aim]);
  const doAim = async (target: Record<string, unknown>) => {
    const t0 = Date.now();
    const r = await act('aim', { target }, { silent: true });
    if (!r) return false;
    const rtt = (Date.now() - t0) / 2;
    setAim({ at: Number(r.result.aim.at), period: Number(r.result.period_ms) / 1000, offset: Number(r.result.server_time) * 1000 + rtt - Date.now() });
    return true;
  };
  const fire = async () => {
    feel('heavy');
    const r = await act('fire', {}, { silent: true });
    setAim(null);
    return r?.result ?? null;
  };
  return { aim, needle, doAim, fire, busy, cancel: () => setAim(null) };
}

export function NeedleMeter({ needle, mode }: { needle: React.RefObject<HTMLDivElement | null>; mode: RayMode }) {
  const c = RAY[mode];
  return (
    <div className="relative h-10 overflow-hidden rounded-full border-2 border-white/30" style={{ background: `linear-gradient(90deg,#330000,#664400 40%,${c.c} 88%,${c.c2} 96%,${c.c})` }} data-testid="ray-meter">
      <div ref={needle} className="absolute inset-y-0 left-0 w-full"><div className="h-full w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_#fff]" /></div>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#0A1A0F]">PEAK</span>
    </div>
  );
}

/** GROW ↔ SHRINK: a two-ended dial (on a phone, tilt it: away from you grows, toward you shrinks) */
export function ModeDial({ mode, onChange, tilt = true }: { mode: RayMode; onChange(m: RayMode): void; tilt?: boolean }) {
  const t = useTilt(tilt && isNative());
  const last = useRef(mode);
  useEffect(() => {
    if (t == null) return;
    const m: RayMode | null = t > 0.45 ? 'grow' : t < -0.45 ? 'shrink' : null;
    if (m && m !== last.current) { last.current = m; feel('medium'); onChange(m); }
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { last.current = mode; }, [mode]);
  return (
    <div className="lv-raydial relative grid grid-cols-2 overflow-hidden rounded-full border-2 border-white/20 bg-black/40 p-1" data-testid="ray-dial" data-mode={mode}>
      <motion.span className="absolute inset-y-1 w-[calc(50%-4px)] rounded-full" layout transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        style={{ left: mode === 'grow' ? 4 : 'calc(50%)', background: `linear-gradient(90deg, ${RAY[mode].c}, ${RAY[mode].c2})`, boxShadow: `0 0 18px ${RAY[mode].c}` }} />
      {(['grow', 'shrink'] as RayMode[]).map((m) => (
        <button key={m} onClick={() => { feel('light'); onChange(m); }} className={cn('relative z-[1] h-10 rounded-full text-[14px] font-black tracking-wider', mode === m ? 'text-[#0A1A0F]' : 'text-white/70')} data-testid={`ray-mode-${m}`}>
          {RAY[m].emoji} {RAY[m].label}
        </button>
      ))}
      {t != null && <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-white/50">tilt the phone to switch</span>}
    </div>
  );
}

type PlotLite = { gx: number; gy: number; rarity: string; name?: string | null; plot_type?: string };
export const plotLabel = (p: PlotLite) => p.name ?? PLOT_TYPES[p.plot_type as keyof typeof PLOT_TYPES]?.name ?? 'Plot';

/** a radar of your plots (for when there's no map): blips where they really are, relative to each other */
export function Radar({ plots, picked, onPick, sizes }: { plots: PlotLite[]; picked: { gx: number; gy: number } | null; onPick(p: PlotLite): void; sizes?: { gx: number; gy: number; mode: RayMode }[] }) {
  const pts = plots.slice(0, 60);
  if (!pts.length) return <p className="p-2 text-[12px] text-white/55">You need a plot to aim at.</p>;
  const xs = pts.map((p) => p.gx), ys = pts.map((p) => p.gy);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(8, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // far-flung plots spread on a log scale so near ones don't all pile into one dot
  const pos = (p: PlotLite) => {
    const dx = p.gx - cx, dy = p.gy - cy, d = Math.hypot(dx, dy), r = d ? Math.log1p(d) / Math.log1p(span / 1.4) : 0;
    return { x: 50 + (d ? (dx / d) * r * 42 : 0), y: 50 + (d ? (dy / d) * r * 42 : 0) };
  };
  return (
    <div className="lv-radar relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-full" data-testid="ray-radar">
      <div className="lv-radar-sweep absolute inset-0" />
      {[20, 34, 48].map((r) => <span key={r} className="absolute rounded-full border border-[#39FF14]/25" style={{ left: `${50 - r}%`, top: `${50 - r}%`, width: `${r * 2}%`, height: `${r * 2}%` }} />)}
      {pts.map((p) => {
        const { x, y } = pos(p), on = picked?.gx === p.gx && picked?.gy === p.gy, sz = sizes?.find((s) => s.gx === p.gx && s.gy === p.gy);
        return (
          <button key={`${p.gx}_${p.gy}`} onClick={() => { feel('light'); onPick(p); }} className={cn('absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full', on ? 'z-10' : '')}
            style={{ left: `${x}%`, top: `${y}%`, width: on ? 26 : sz?.mode === 'grow' ? 18 : sz?.mode === 'shrink' ? 6 : 12, height: on ? 26 : sz?.mode === 'grow' ? 18 : sz?.mode === 'shrink' ? 6 : 12,
              background: rarityInfo(p.rarity).color, boxShadow: `0 0 ${on ? 18 : 8}px ${rarityInfo(p.rarity).color}` }} aria-label={plotLabel(p)} data-testid="ray-blip">
            {on && <span className="lv-lockon absolute -inset-2 rounded-full border-2 border-white" />}
          </button>
        );
      })}
    </div>
  );
}

/** the beam: from the top of the screen down onto a point */
export function Beam({ x, y, mode, onDone }: { x: number; y: number; mode: RayMode; onDone(): void }) {
  useEffect(() => { const t = setTimeout(onDone, 1500); return () => clearTimeout(t); }, [onDone]);
  const c = RAY[mode];
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[160]" data-testid="ray-beam">
      <motion.div className="absolute origin-top" style={{ left: x - 14, top: 0, width: 28, height: y, background: `linear-gradient(180deg, transparent, ${c.c} 20%, #fff 50%, ${c.c})`, boxShadow: `0 0 40px 12px ${c.c}`, borderRadius: 14 }}
        initial={{ scaleY: 0, opacity: 1 }} animate={{ scaleY: [0, 1, 1], opacity: [1, 1, 0] }} transition={{ duration: 1.2, times: [0, 0.25, 1] }} />
      <motion.div className="absolute rounded-full" style={{ left: x, top: y, width: 10, height: 10, marginLeft: -5, marginTop: -5, background: '#fff', boxShadow: `0 0 60px 30px ${c.c}` }}
        initial={{ scale: 0 }} animate={{ scale: mode === 'grow' ? [0, 14, 22] : [0, 10, 0.2], opacity: [1, 0.9, 0] }} transition={{ duration: 1.3, delay: 0.25 }} />
    </div>, document.body);
}

function shake() {
  const el = document.querySelector('[data-testid=world-map]')?.parentElement ?? document.body;
  el.classList.remove('lv-shake'); void (el as HTMLElement).offsetWidth; el.classList.add('lv-shake');
  setTimeout(() => el.classList.remove('lv-shake'), 900);
}

/** the map's targeting mode: your plots wear crosshairs, everything else dims; tap one, then fire */
export function RayTargeting() {
  const ray = useRayTarget((s) => s.ray);
  if (!ray) return null;
  return <Targeting id={ray} />;
}

function Targeting({ id }: { id: string }) {
  const { mode, picked, setMode, pick, cancel } = useRayTarget();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots });
  const e = useEnchant(id);
  const shot = useRayShot(id);
  const [beam, setBeam] = useState<{ x: number; y: number; mode: RayMode } | null>(null);
  const [result, setResult] = useState<any>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const qc = useQueryClient();
  const list: PlotLite[] = plots.data ?? [];
  const bbox = useUi((s) => s.bbox);
  const shots = Number(e.data?.view?.shots ?? 0);
  // dim the map, light up your plots
  useEffect(() => {
    document.documentElement.classList.add('lv-targeting');
    void askMotion();
    return () => document.documentElement.classList.remove('lv-targeting');
  }, []);
  // fly to your plots if none are on screen
  useEffect(() => {
    if (!list.length) return;
    const z = mapHandle.current?.getZoom() ?? 0;
    const inView = !!bbox && z >= 15 && list.some((p) => p.gx >= bbox.min_gx && p.gx <= bbox.max_gx && p.gy >= bbox.min_gy && p.gy <= bbox.max_gy);
    if (!inView) { const [lng, lat] = cellCenter(list[0].gx, list[0].gy); flyAway({ lng, lat, zoom: 18.6 }); }
  }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapHandle.current;
    if (!map || !bbox) return;
    const src = 'lv-ray-targets';
    const visible = list.filter((p) => p.gx >= bbox.min_gx - 40 && p.gx <= bbox.max_gx + 40 && p.gy >= bbox.min_gy - 40 && p.gy <= bbox.max_gy + 40).slice(0, 120);
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: visible.map((p) => ({ type: 'Feature', properties: { on: picked?.gx === p.gx && picked?.gy === p.gy ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: [cellPolygon(p.gx, p.gy)] } })) };
    // (someone else's plot you've locked on to is outlined too)
    if (picked && !visible.some((p) => p.gx === picked.gx && p.gy === picked.gy)) data.features.push({ type: 'Feature', properties: { on: 1 }, geometry: { type: 'Polygon', coordinates: [cellPolygon(picked.gx, picked.gy)] } });
    if (!map.getSource(src)) {
      map.addSource(src, { type: 'geojson', data });
      map.addLayer({ id: 'lv-ray-glow', type: 'line', source: src, paint: { 'line-color': RAY[mode].c, 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.75 } });
      map.addLayer({ id: 'lv-ray-line', type: 'line', source: src, paint: { 'line-color': ['case', ['==', ['get', 'on'], 1], '#ffffff', RAY[mode].c2], 'line-width': ['case', ['==', ['get', 'on'], 1], 4, 2] } });
    } else (map.getSource(src) as maplibregl.GeoJSONSource).setData(data);
    map.setPaintProperty('lv-ray-glow', 'line-color', RAY[mode].c);
    for (const m of markers.current) m.remove();
    markers.current = visible.slice(0, 60).map((p) => {
      const el = document.createElement('button');
      const on = picked?.gx === p.gx && picked?.gy === p.gy;
      el.className = `lv-crosshair${on ? ' on' : ''}`; el.style.setProperty('--c', RAY[mode].c);
      el.dataset.testid = 'ray-crosshair';
      el.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
      el.addEventListener('click', (ev) => { ev.stopPropagation(); feel('medium'); pick({ gx: p.gx, gy: p.gy }); });
      // (the marker's own element only gets moved by the map: the spinning crosshair lives inside it)
      const holder = document.createElement('div'); holder.appendChild(el);
      return new maplibregl.Marker({ element: holder }).setLngLat(cellCenter(p.gx, p.gy)).addTo(map);
    });
    return () => { for (const m of markers.current) m.remove(); markers.current = []; };
  }, [bbox, list.length, picked, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    const map = mapHandle.current;
    for (const l of ['lv-ray-glow', 'lv-ray-line']) if (map?.getLayer(l)) map.removeLayer(l);
    if (map?.getSource('lv-ray-targets')) map.removeSource('lv-ray-targets');
  }, []);
  const own = picked ? list.find((p) => p.gx === picked.gx && p.gy === picked.gy) : null;
  // someone else's plot (or nobody's): ask the map who owns it
  const other = useQuery({ queryKey: ['ray-plot', picked?.gx, picked?.gy], queryFn: () => api.plotDetails(picked!.gx, picked!.gy), enabled: !!picked && !own, staleTime: 30_000 });
  const plot = own ?? (other.data && other.data.owned ? { gx: other.data.gx, gy: other.data.gy, rarity: other.data.rarity, name: other.data.name, plot_type: other.data.plot_type } as PlotLite : null);
  const prank = !own && !!other.data?.owned;
  const ownerName = other.data?.owner?.username ?? null;
  const empty = !!picked && !own && other.data && !other.data.owned;
  const go = async () => {
    if (!picked || (!own && !prank)) return;
    if (!shot.aim) { await shot.doAim({ type: 'plot', gx: picked.gx, gy: picked.gy, mode }); return; }
    const r = await shot.fire();
    if (!r) return;
    const map = mapHandle.current;
    const at = r.bounced ? { gx: Number(r.gx), gy: Number(r.gy) } : picked;
    const pt = map ? map.project(cellCenter(picked.gx, picked.gy)) : { x: innerWidth / 2, y: innerHeight / 2 };
    const box = map?.getContainer().getBoundingClientRect();
    setBeam({ x: (box?.left ?? 0) + pt.x, y: (box?.top ?? 0) + pt.y, mode: r.mode });
    setTimeout(() => { shake(); feel('heavy'); efx.burst({ x: (box?.left ?? 0) + pt.x, y: (box?.top ?? 0) + pt.y, colors: [RAY[r.mode as RayMode].c, RAY[r.mode as RayMode].c2, '#fff'], count: r.grade === 'PERFECT' ? 260 : 140, speed: 16, kind: 'spark' }); }, 320);
    setResult(r);
    // the reveal: pull right back to show the whole giant, or dive right in to find the speck
    if (map) setTimeout(() => {
      const [lng, lat] = cellCenter(at.gx, at.gy);
      const dim = Math.min(map.getContainer().clientWidth, map.getContainer().clientHeight);
      const zoom = r.mode === 'grow' ? 22 + Math.log2((0.72 * dim) / (100 * 512)) : map.getMaxZoom() - 0.2;
      flyAway({ lng, lat, zoom });
    }, 900);
    void qc.invalidateQueries({ queryKey: ['enchant-map'] }); void qc.invalidateQueries({ queryKey: ['enchant-world'] });
  };
  const app = isNative();
  return createPortal(
    <>
      <div className={cn('pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center px-3', app ? 'pt-[max(12px,env(safe-area-inset-top,0px))]' : 'pt-3')}>
        <motion.div className={cn('pointer-events-auto grid w-[min(420px,100%)] gap-2 p-3', app ? 'lv-mcard t-emerald' : 'rounded-3xl border border-[#39FF14]/40 bg-[#07140B]/92 shadow-2xl backdrop-blur')}
          initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-testid="ray-targeting">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📡</span>
            <div className="min-w-0 flex-1 leading-tight"><div className="font-display text-[17px] font-black text-white">Size Ray</div>
              <div className="text-[12px] font-semibold text-white/70">{picked ? `Locked on: ${plot ? plotLabel(plot) : '…'}${prank && ownerName ? ` · @${ownerName}’s` : ''}` : 'Tap any plot — yours are in crosshairs. Someone else’s? That’s a prank.'}</div></div>
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-black text-[#B6FF3D]">⚡ {shots}/3</span>
            <button className="lv-x" onClick={() => { shot.cancel(); cancel(); }} aria-label="Stop aiming" data-testid="ray-cancel">×</button>
          </div>
          {!shot.aim && <ModeDial mode={mode} onChange={setMode} />}
          <p className="text-[11.5px] font-semibold text-white/60">{prank ? RAY[mode].prank : RAY[mode].text}</p>
        </motion.div>
      </div>
      <AnimatePresence>
        {picked && (
          <motion.div className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+90px)] md:pb-6" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
            <div className={cn('pointer-events-auto grid w-[min(420px,100%)] gap-2.5 p-3', app ? 'lv-mcard t-emerald' : 'rounded-3xl border border-white/15 bg-[#07140B]/94 shadow-2xl backdrop-blur')} data-testid="ray-fire-sheet">
              {plot && <div className="flex items-center gap-2 text-[13px] font-black"><span className="h-3 w-3 rounded" style={{ background: rarityInfo(plot.rarity).color }} /><span className="truncate">{plotLabel(plot)} · <span style={{ color: rarityInfo(plot.rarity).color }}>{rarityInfo(plot.rarity).name}</span></span>
                <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] text-[#0A1A0F]" style={{ background: RAY[mode].c }}>{RAY[mode].emoji} {RAY[mode].label}</span></div>}
              {prank && <div className="grid gap-0.5 rounded-xl bg-[#FF5CDB]/15 px-2.5 py-1.5" data-testid="ray-prank"><span className="text-[13px] font-black text-[#FFC2F1]">🤡 Prank @{ownerName ?? '?'}!</span><span className="text-[11px] font-semibold text-white/60">For show only · up to 3 hours · they’re told, and can undo it</span></div>}
              {empty && <div className="rounded-xl bg-white/10 px-2.5 py-2 text-[12px] font-bold text-white/75">Nobody owns this plot — there’s nothing on it to zap. Pick a claimed one.</div>}
              {shot.aim && <NeedleMeter needle={shot.needle} mode={mode} />}
              <Button variant="rainbow" size="lg" disabled={!!shot.busy || shots < 1 || (!own && !prank)} onClick={() => void go()} data-testid={shot.aim ? 'ray-fire' : 'ray-aim'}>
                {shots < 1 ? `Recharging · ${dur(e.data?.view?.next_in)}` : shot.aim ? '🔫 FIRE!' : prank ? `🤡 Aim at @${ownerName ?? '?'}’s plot` : !own && !other.data ? 'Looking…' : `🎯 Aim at this plot`}
              </Button>
              {shot.aim && <p className="text-center text-[11px] font-semibold text-white/55">Fire as the needle hits the peak. PERFECT lasts 12 h · GREAT 8 h · GOOD 6 h · WIDE 2 h — a total miss backfires.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {beam && <Beam {...beam} onDone={() => setBeam(null)} />}
      <AnimatePresence>
        {result && !beam && (
          <motion.button key="res" className="fixed inset-0 z-[170] grid place-items-center bg-black/55 px-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setResult(null); pick(null); }} data-testid="ray-grade">
            <motion.div initial={{ scale: 2.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
              <div className="font-display text-6xl font-black" style={{ color: GRADE_C[result.grade], textShadow: '0 0 24px currentColor' }}>{result.grade}!</div>
              <div className="mt-2 text-[15px] font-black text-white">{gradeLine(result)}</div>
              <div className="mt-1 text-[12px] font-semibold text-white/65">{result.prank ? `@${result.owner_name ?? '?'} has been told it was you.` : result.mode === 'shrink' && !result.backfire ? 'Three micro-gems are hiding in it — tap the speck to search.' : 'Everyone on the map can see it now.'} Tap to carry on.</div>
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>
    </>, document.body);
}

/** what the grade card says under the grade */
export function gradeLine(r: any) {
  const big = r.mode === 'grow' ? 'GIANT' : 'TINY';
  if (r.bounced) return `Backfire! It bounced straight back — YOUR plot went ${big} for 30 minutes.`;
  if (r.backfire) return `Backfire! It went ${big} instead — for 30 minutes.`;
  if (r.prank) return `Pranked @${r.owner_name ?? '?'}! Their plot is ${big} — 100× ${r.mode === 'grow' ? 'bigger' : 'smaller'} — for ${r.hours} h`;
  return r.mode === 'grow' ? `100× GIANT for ${r.hours} hours — its minigames pay ×${r.mult}` : `100× smaller for ${r.hours} hours — hidden, and its time runs fast`;
}

/** /world?fly=gx,gy[&z=zoom]: open the map on a plot (from an alert, say: "your plot was pranked — see it") */
export function FlyParam() {
  const [sp, setSp] = useSearchParams();
  const fly = sp.get('fly');
  useEffect(() => {
    if (!fly) return;
    const [gx, gy] = fly.split(',').map(Number);
    const z = Number(sp.get('z')) || 19;
    const next = new URLSearchParams(sp); next.delete('fly'); next.delete('z'); setSp(next, { replace: true });
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
    const [lng, lat] = cellCenter(gx, gy);
    flyAway({ lng, lat, zoom: z });
    setTimeout(() => useUi.getState().select({ gx, gy }), 1800);
  }, [fly]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** "Pick on the map": the Grimoire hands over to the map */
export function usePickOnMap() {
  const nav = useNavigate();
  return (ray: string, mode: RayMode) => {
    useRayTarget.getState().start(ray, mode);
    // (the Grimoire may be a sheet over the map: close it)
    import('./GrimoireButton').then((m) => m.useGrimoireSheet.getState().set(false)).catch(() => {});
    nav('/world');
  };
}

export function useMySizeRays() {
  const mine = useMyEnchantments();
  return (mine.data ?? []).filter((x) => x.kind === 'sizeray');
}

export function toastSize(r: any) {
  if (!r) return;
  toast.success(r.mode === 'grow' ? `Giant for ${r.hours} h` : `Tiny for ${r.hours} h`);
}
