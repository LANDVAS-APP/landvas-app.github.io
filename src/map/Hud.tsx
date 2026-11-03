// The map's game HUD: your badge, currency pills, the map-mode/legend button, a sky that follows
// the time of day, bubbles over your plots (collect an Ink Spring, step into a sanctuary) and the
// "dive in" transition that zooms the map down into a plot before its screen opens.
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Compass, Layers, MapPinned, Palette } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, type NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useExplorer } from '../explorer/explorer';
import { invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { useUi, type MapMode } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { RarityBadge } from '../plot/RarityBadge';
import { cellCenter } from '../shared/grid';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { PlayerAvatar, ResourceIcon } from '../ui';
import { mapHandle } from './mapHandle';
import { PLOT_TYPES } from './plotStyle';

// ---- your badge and currencies --------------------------------------------------------------
export function PlayerBadge() {
  const me = useOnboardedMe();
  if (!me) return null;
  return (
    <Link to="/me" className="pointer-events-auto lv-hud h-[46px] gap-2 pl-1 pr-3" data-testid="hud-player">
      <span className="relative rounded-full p-[2px]" style={{ background: 'conic-gradient(#22E3FF,#8B5CFF,#FF3D9A,#FFC93D,#22E3FF)' }}>
        <PlayerAvatar p={me.profile} size={36} />
      </span>
      <span className="grid leading-tight">
        <span className="max-w-[110px] truncate text-[13px]">{me.profile.display_name || me.profile.username}</span>
        <span className="text-[10px] font-black text-gold">LV {me.artist_level ?? 1} · {me.plot_count ?? 0} plots</span>
      </span>
    </Link>
  );
}

export function CurrencyPills() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  if (!me) return null;
  const b = me.balances;
  const pill = (r: 'ink' | 'pigments', bg: string, to: string) => (
    <motion.button whileTap={{ scale: 0.92 }} onClick={() => nav(to)} className="pointer-events-auto lv-hud" data-testid={`hud-${r}`}>
      <span className="ico" style={{ background: bg }}><ResourceIcon r={r} className="h-4 w-4" /></span>
      <span className="tnum">{fmt(Number(b[r] ?? 0))}</span>
    </motion.button>
  );
  return (
    <div className="flex items-center gap-1.5">
      {pill('ink', 'linear-gradient(180deg,#B79CFF,#6B4BEF)', '/play')}
      {pill('pigments', 'linear-gradient(180deg,#FFD27A,#FF7A59)', '/inventory')}
    </div>
  );
}

// ---- map modes and the legend, behind one round button ----------------------------------------
const MODES: { id: MapMode; label: string; icon: typeof Layers; hint: string }[] = [
  { id: 'atlas', label: 'Atlas', icon: MapPinned, hint: 'Places, borders and every owned territory' },
  { id: 'canvas', label: 'Canvas', icon: Palette, hint: 'The art itself — the map steps back' },
  { id: 'discovery', label: 'Discover', icon: Compass, hint: 'Claimable mystery plots and who owns the land around you' },
  { id: 'land', label: 'My Land', icon: Layers, hint: 'Your plots, canvases and upgrade options' },
];
export function ModeButton() {
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  const Cur = MODES.find((m) => m.id === mode)?.icon ?? Layers;
  return (
    <div className="pointer-events-auto relative">
      <button className={cn('lv-gbtn round', open && 'on')} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Map view" data-testid="mode-button">
        <Cur className="h-5 w-5" /><span className="lbl">View</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, x: -10, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -10, scale: 0.95 }}
            className="absolute left-[62px] top-0 z-30 grid w-56 gap-1.5 rounded-[22px] border-[1.5px] border-white/15 bg-[#0e1336]/95 p-2 text-white shadow-2xl" role="radiogroup" aria-label="Map mode">
            {MODES.map((m) => (
              <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => { setMode(m.id); buzz('light'); }}
                className={cn('lv-gbtn justify-start px-3 py-2 text-left text-[13px]', mode === m.id && 'on')}>
                <m.icon className="h-4 w-4 shrink-0" /><span className="grid"><span>{m.label}</span><span className="text-[10px] font-semibold opacity-70">{m.hint}</span></span>
              </button>
            ))}
            <button className="rounded-xl px-3 py-1.5 text-left text-xs font-bold text-white/70" onClick={() => setLegend((l) => !l)} aria-expanded={legend}>{legend ? 'Hide' : 'Show'} the legend</button>
            {legend && (
              <div className="grid gap-1.5 px-1 pb-1 text-[11px]">
                {RARITY_ORDER.map((r) => <div key={r} className="flex items-center justify-between gap-2"><RarityBadge r={r} small /><span className="tnum text-white/60">{formatRate(rarityInfo(r).usd_per_second)}</span></div>)}
                {(Object.keys(PLOT_TYPES) as (keyof typeof PLOT_TYPES)[]).map((t) => (
                  <div key={t} className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: `linear-gradient(135deg, ${PLOT_TYPES[t].a}, ${PLOT_TYPES[t].b})` }} /><b>{PLOT_TYPES[t].name}</b><span className="text-white/50">{PLOT_TYPES[t].game}</span></div>
                ))}
                <div className="text-white/60">Dashed square: plots you can claim around your explorer.</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- the sky follows your local time ----------------------------------------------------------
function skyTint(h: number) {
  if (h >= 21 || h < 5) return 'linear-gradient(180deg, rgba(40,52,140,0.55), rgba(70,80,170,0.4))';
  if (h < 7) return 'linear-gradient(180deg, rgba(255,170,150,0.35), rgba(255,220,200,0.15))'; // dawn
  if (h >= 18) return 'linear-gradient(180deg, rgba(255,140,90,0.38), rgba(255,190,140,0.18))'; // dusk
  return 'transparent';
}
export function DayNight() {
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [h, setH] = useState(() => new Date().getHours());
  useEffect(() => { const t = setInterval(() => setH(new Date().getHours()), 5 * 60_000); return () => clearInterval(t); }, []);
  const night = h >= 21 || h < 5;
  return (
    <>
      <div className="lv-daynight" style={{ background: skyTint(h) }} data-testid="daynight" data-hour={h} />
      {night && !reduce && (
        <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <motion.span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-[#E6FF9C] shadow-[0_0_10px_3px_rgba(230,255,140,0.7)]"
              style={{ left: `${(i * 37) % 100}%`, top: `${20 + ((i * 53) % 70)}%` }}
              animate={{ opacity: [0, 0.9, 0], x: [0, (i % 2 ? 1 : -1) * 18, 0], y: [0, -14, 0] }} transition={{ duration: 4 + (i % 5), repeat: Infinity, delay: i * 0.6 }} />
          ))}
        </div>
      )}
    </>
  );
}

// ---- dive into a plot ---------------------------------------------------------------------------
const RETURN_KEY = 'landvas.map.return';
/** Zoom the map down into a spot and close an iris over it, then open `path`. */
export function diveInto(nav: NavigateFunction, path: string, at: { lng: number; lat: number } | null) {
  const map = mapHandle.current;
  const reduce = useUi.getState().settings.reduceMotion;
  if (!map || reduce || !at) { nav(path); return; }
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ lng: at.lng, lat: at.lat, zoom: map.getZoom(), at: Date.now() })); } catch { /* private mode */ }
  useExplorer.getState().setFollowing(false);
  if (useUi.getState().settings.haptics) buzz('medium');
  map.flyTo({ center: [at.lng, at.lat], zoom: Math.min(22.5, Math.max(map.getZoom() + 2, 21)), pitch: 45, duration: 850, essential: true });
  const el = document.createElement('div');
  el.className = 'lv-portal';
  const r = map.getCanvas().getBoundingClientRect();
  el.style.setProperty('--x', `${r.left + r.width / 2}px`); el.style.setProperty('--y', `${r.top + r.height / 2}px`);
  document.body.appendChild(el);
  const R = Math.hypot(window.innerWidth, window.innerHeight);
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / 800);
    el.style.setProperty('--r', `${R * (1 - k * k)}px`);
    if (k < 1) requestAnimationFrame(step);
    else { nav(path); setTimeout(() => { el.style.transition = 'opacity 0.35s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 120); }
  };
  requestAnimationFrame(step);
}
/** Where to zoom back out to when you come back to the map from a plot (fresh only). */
export function takeReturn(): { lng: number; lat: number; zoom: number } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
    sessionStorage.removeItem(RETURN_KEY);
    return v && Date.now() - v.at < 30 * 60_000 ? v : null;
  } catch { return null; }
}

// ---- bubbles over your plots ----------------------------------------------------------------------
/** Over each of your habitats: how full its Ink Spring is (tap to collect) or a door into it. */
export function PlotBubbles({ ready }: { ready: boolean }) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  // your habitat plots, straight from your land (always current)
  const habitats = useMemo(() => (groups.data ?? []).filter((g) => g.status === 'active' && g.kind === 'habitat' && g.habitat_id)
    .map((g) => ({ id: g.habitat_id!, group_id: g.id, name: g.name })), [groups.data]);
  const springs = useQueries({ queries: habitats.map((h) => ({ queryKey: ['spring', h.id], queryFn: () => api.habitatSpring(h.id), refetchInterval: 60_000, staleTime: 30_000 })) });
  const springKey = springs.map((s) => s.data?.ready ?? -1).join(',');
  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !groups.data) return;
    const markers: maplibregl.Marker[] = [];
    habitats.forEach((h, i) => {
      const g = groups.data!.find((x) => x.id === h.group_id && x.status === 'active');
      if (!g) return;
      // the plot nearest the middle of the habitat
      const mx = g.cells.reduce((n, c) => n + c[0], 0) / g.cells.length, my = g.cells.reduce((n, c) => n + c[1], 0) / g.cells.length;
      const c = g.cells.reduce((b, k) => (Math.hypot(k[0] - mx, k[1] - my) < Math.hypot(b[0] - mx, b[1] - my) ? k : b));
      const [lng, lat] = cellCenter(c[0], c[1]);
      const sp = springs[i]?.data;
      const full = !!sp && sp.ready >= 1;
      const el = document.createElement('button');
      el.className = `lv-bubble${full ? ' ready' : ''}`;
      el.dataset.testid = 'plot-bubble';
      el.setAttribute('aria-label', full ? `Collect ${sp!.ready} Ink from ${h.name}` : `Enter ${h.name}`);
      el.innerHTML = full ? `<span class="em">💧</span>+${sp!.ready}` : `<span class="em">🐾</span>Enter`;
      el.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (full) {
          try {
            const r = await api.habitatCollect(h.id);
            if (useUi.getState().settings.haptics) buzz('success');
            toast.success(`+${r.paid} Ink from ${h.name}`, { description: r.capped ? 'That’s today’s Inkborn limit reached.' : 'Happy creatures keep the spring flowing.' });
            invalidateGame(qc);
            void qc.invalidateQueries({ queryKey: ['spring', h.id] });
          } catch (e) { toast.error(toGameError(e).message); }
        } else diveInto(nav, `/habitat/${h.id}`, { lng, lat });
      });
      // the map positions the wrapper; only the bubble inside bobs (an animation on the marker
      // element itself would override the map's own transform)
      const wrap = document.createElement('div');
      wrap.appendChild(el);
      const m = new maplibregl.Marker({ element: wrap, anchor: 'bottom', offset: [0, -14] }).setLngLat([lng, lat]).addTo(map);
      markers.push(m);
    });
    // only once plots are big enough to see
    const vis = () => { const show = map.getZoom() >= 17.2; for (const m of markers) m.getElement().style.display = show ? '' : 'none'; };
    vis();
    map.on('zoom', vis);
    return () => { map.off('zoom', vis); markers.forEach((m) => m.remove()); };
  }, [ready, groups.data, habitats, springKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
