// Other players on the map — only explorers out in the game without GPS (on a trip, or the joystick far from home).
// The server decides who shows (never anyone on GPS, never near their real spot); this draws them, glides the ones on
// the move, and a tap shows who it is with "Team up".
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { UserPlus, X } from 'lucide-react';
import { newMarker } from '../map/maplib';
import { mapHandle } from '../map/mapHandle';
import { explorerElement } from '../explorer/character';
import { api } from '../backend/api';
import type { FoundExplorer, MapExplorer } from '../backend/types';
import { Button, PlayerAvatar } from '../ui';
import { useParty, usePartyJoin, usePartyUi } from '../party/party';
import { explorerDoing, useMapFocus } from './findOnMap';

type Box = { w: number; s: number; e: number; n: number };
/** the map's view, rounded so small pans don't refetch */
function useViewBox() {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    let map = mapHandle.current;
    const read = () => {
      map = mapHandle.current;
      if (!map) return;
      const b = map.getBounds(), z = map.getZoom();
      const step = z < 4 ? 5 : z < 8 ? 0.5 : 0.05;
      const r = (x: number, up: boolean) => (up ? Math.ceil(x / step) : Math.floor(x / step)) * step;
      const cl = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
      const next = { w: cl(r(b.getWest(), false), -180, 180), s: cl(r(b.getSouth(), false), -85, 85), e: cl(r(b.getEast(), true), -180, 180), n: cl(r(b.getNorth(), true), -85, 85) };
      setBox((o) => (o && o.w === next.w && o.s === next.s && o.e === next.e && o.n === next.n ? o : next));
    };
    const on = () => { if (t) clearTimeout(t); t = setTimeout(read, 400); };
    const iv = setInterval(() => { if (mapHandle.current && mapHandle.current !== map) { map?.off('moveend', on); map = mapHandle.current; map.on('moveend', on); read(); } }, 1000);
    if (map) { map.on('moveend', on); read(); }
    return () => { clearInterval(iv); if (t) clearTimeout(t); map?.off('moveend', on); };
  }, []);
  return box;
}

/** where a fetched explorer is now: mid-ride ones slide towards where the leg ends */
function posOf(p: MapExplorer, fetchedAt: number, now: number): [number, number] {
  if (!p.traveling || p.dest_lng == null || p.dest_lat == null || !p.arrives_at) return [p.lng, p.lat];
  const end = Date.parse(p.arrives_at);
  const f = end <= fetchedAt ? 1 : Math.min(1, Math.max(0, (now - fetchedAt) / (end - fetchedAt)));
  return [p.lng + (p.dest_lng - p.lng) * f, p.lat + (p.dest_lat - p.lat) * f];
}

export function MapPlayersLayer() {
  const box = useViewBox();
  const q = useQuery({
    queryKey: ['map-explorers', box], queryFn: () => api.mapExplorers(box!), enabled: !!box,
    staleTime: 15_000, refetchInterval: 20_000, placeholderData: (p) => p,
  });
  const fetchedAt = q.dataUpdatedAt;
  // your party is drawn by its own layer (as soon as you team up, not at the next refresh)
  const party = useParty().data?.group;
  const mates = useMemo(() => new Set((party?.members ?? []).map((m) => m.id)), [party]);
  const people = useMemo(() => (q.data?.items ?? []).filter((p) => !p.in_party && !mates.has(p.id)), [q.data, mates]);
  const [open, setOpen] = useState<MapExplorer | null>(null);
  const markers = useRef(new Map<string, { mk: maplibregl.Marker; el: HTMLElement; style: string }>());
  const peopleRef = useRef(people); peopleRef.current = people;

  useEffect(() => {
    const map = mapHandle.current;
    const have = markers.current;
    const keep = new Set(people.map((p) => p.id));
    for (const [id, x] of have) if (!keep.has(id)) { x.mk.remove(); have.delete(id); }
    if (!map) return;
    const now = Date.now();
    for (const p of people) {
      const style = JSON.stringify(p.explorer_style ?? null) + p.accent_color;
      let x = have.get(p.id);
      if (x && x.style !== style) { x.mk.remove(); have.delete(p.id); x = undefined; }
      if (!x) {
        const el = explorerElement(p.explorer_style, /^#[0-9a-f]{3,8}$/i.test(p.accent_color) ? p.accent_color : '#8B5CFF');
        el.classList.add('lv-mate', 'lv-other');
        el.dataset.testid = 'map-player'; el.dataset.user = p.username;
        const nm = document.createElement('div'); nm.className = 'lv-mate-name'; nm.textContent = `@${p.username}`;
        el.appendChild(nm);
        el.addEventListener('click', (ev) => { ev.stopPropagation(); const cur = peopleRef.current.find((o) => o.id === p.id); if (cur) setOpen(cur); });
        x = { mk: newMarker({ element: el, anchor: 'bottom', offset: [0, 6] }).setLngLat(posOf(p, fetchedAt, now)).addTo(map), el, style };
        have.set(p.id, x);
      }
      const ride = p.traveling && (p.trip?.mode === 'train' || p.trip?.mode === 'plane') ? p.trip.mode : null;
      x.el.classList.toggle('ride-train', ride === 'train'); x.el.classList.toggle('ride-plane', ride === 'plane');
      const v = ride ? null : p.vehicle;
      x.el.classList.toggle('veh-bike', v === 'bike'); x.el.classList.toggle('veh-car', v === 'car'); x.el.classList.toggle('veh-jet', v === 'jet');
      x.el.classList.toggle('walking', !!p.traveling);
      if (p.traveling && p.dest_lng != null) x.el.classList.toggle('left', p.dest_lng < p.lng);
      x.mk.setLngLat(posOf(p, fetchedAt, now));
    }
    // the ones on the move glide along (a step a second is plenty at map scale; nothing runs while hidden)
    if (!people.some((p) => p.traveling)) return;
    const iv = setInterval(() => {
      if (document.hidden) return;
      const t = Date.now();
      for (const p of peopleRef.current) if (p.traveling) have.get(p.id)?.mk.setLngLat(posOf(p, fetchedAt, t));
    }, 1000);
    return () => clearInterval(iv);
  }, [people, fetchedAt]);
  useEffect(() => () => { for (const x of markers.current.values()) x.mk.remove(); markers.current.clear(); }, []);

  // "Find on map": open their card once they're in view
  const focus = useMapFocus((s) => s.id);
  useEffect(() => {
    if (!focus) return;
    const p = people.find((o) => o.id === focus);
    if (p) { setOpen(p); useMapFocus.getState().set(null); }
  }, [focus, people]);
  // keep an open card current (or close it when they leave the map)
  useEffect(() => { if (open && q.data) { const cur = people.find((p) => p.id === open.id); if (!cur) setOpen(null); else if (cur !== open) setOpen(cur); } }, [people]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(<AnimatePresence>{open && <PlayerCard key={open.id} p={open} onClose={() => setOpen(null)} />}</AnimatePresence>, document.body);
}

function PlayerCard({ p, onClose }: { p: MapExplorer; onClose(): void }) {
  const nav = useNavigate();
  const join = usePartyJoin();
  const [busy, setBusy] = useState(false);
  const teamUp = async () => {
    setBusy(true);
    try {
      const r = await join({ kind: 'player', id: p.id }, p.username);
      if (r) { toast.success(`You’re teamed up with @${p.username}`, { description: 'Party chat is open — say hi!' }); usePartyUi.getState().show('party'); onClose(); }
    } finally { setBusy(false); }
  };
  return (
    <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
      className="fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-[60] mx-auto w-[min(92vw,380px)] rounded-3xl bg-[#0B0E24] p-3 text-white shadow-2xl ring-1 ring-white/10 md:bottom-8"
      data-testid="map-player-card">
      <div className="flex items-center gap-3">
        <PlayerAvatar p={p} size={44} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-display text-base font-black">@{p.username}</div>
          <div className="truncate text-xs text-white/70" data-testid="map-player-doing">{explorerDoing(p)}</div>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-full bg-white/10" onClick={onClose} aria-label="Close" data-testid="map-player-close"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="ghost" className="flex-1 !text-white" onClick={() => { onClose(); nav(`/u/${p.username}`); }} data-testid="map-player-profile">Profile</Button>
        {p.joinable
          ? <Button size="sm" variant="rainbow" className="flex-1" loading={busy} onClick={() => void teamUp()} data-testid="map-player-team"><UserPlus className="h-4 w-4" />Team up</Button>
          : <span className="flex flex-1 items-center justify-center text-[11px] text-white/55">Playing privately</span>}
      </div>
    </motion.div>
  );
}
