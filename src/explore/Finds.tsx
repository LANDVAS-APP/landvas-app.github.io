// Finds (v0.9.9): things to do on the map that aren't plots. Every day Ink crystals, balloons, gifts and the odd golden
// star turn up all over the world (the same ones for everyone). Walk — or bike, or drive — up to one and tap it.
// Riding right past one collects it too.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { MapFind, MapFindKind } from '../backend/types';
import { mapHandle } from '../map/mapHandle';
import { explorerNow, useExplorer } from '../explorer/explorer';
import { useInvalidate, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';

export const FIND_META: Record<MapFindKind, { emoji: string; name: string; verb: string }> = {
  crystal: { emoji: '💎', name: 'Ink crystal', verb: 'Picked up' },
  balloon: { emoji: '🎈', name: 'Balloon', verb: 'Popped' },
  gift: { emoji: '🎁', name: 'Gift', verb: 'Opened' },
  star: { emoji: '🌟', name: 'Golden star', verb: 'Caught' },
};
const REACH_M = 45;
const AUTO_M = 14;
const MIN_ZOOM = 14.5;

function metres(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function FindsLayer() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const [bbox, setBbox] = useState<{ w: number; s: number; e: number; n: number } | null>(null);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const taken = useRef(new Set<string>());
  const busy = useRef(new Set<string>());
  // follow the map: finds show once you're zoomed in to street level
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    let map = mapHandle.current;
    const read = () => {
      map = mapHandle.current;
      if (!map) return;
      if (map.getZoom() < MIN_ZOOM) { setBbox(null); return; }
      const b = map.getBounds();
      const r = (x: number) => Math.round(x * 200) / 200;
      const n = { w: r(b.getWest()) - 0.005, s: r(b.getSouth()) - 0.005, e: r(b.getEast()) + 0.005, n: r(b.getNorth()) + 0.005 };
      setBbox((o) => (o && o.w === n.w && o.s === n.s && o.e === n.e && o.n === n.n ? o : n));
    };
    const on = () => { if (t) clearTimeout(t); t = setTimeout(read, 300); };
    const iv = setInterval(() => { if (mapHandle.current && mapHandle.current !== map) { map?.off('moveend', on); map = mapHandle.current; map.on('moveend', on); read(); } }, 1000);
    if (map) { map.on('moveend', on); read(); }
    return () => { clearInterval(iv); if (t) clearTimeout(t); map?.off('moveend', on); };
  }, []);
  const q = useQuery({ queryKey: ['map-finds', bbox], queryFn: () => api.mapFinds(bbox!), enabled: !!me && !!bbox, staleTime: 60_000, placeholderData: (p) => p });
  const finds = useMemo(() => (bbox ? (q.data ?? []).filter((f) => !taken.current.has(f.id)) : []), [q.data, bbox]);

  const collect = async (f: MapFind, auto = false) => {
    if (busy.current.has(f.id) || taken.current.has(f.id)) return;
    const st = useExplorer.getState();
    const p = explorerNow(st.state, st.offset);
    const d = p ? metres(p, f) : Infinity;
    if (d > REACH_M) {
      if (!auto) toast(`${FIND_META[f.kind].emoji} ${FIND_META[f.kind].name} · ${d === Infinity ? 'place your explorer first' : `${Math.round(d)} m away`}`, { description: 'Walk up to it — or ride with the joystick 🕹️ — then tap it.' });
      return;
    }
    busy.current.add(f.id);
    const el = markers.current.get(f.id)?.getElement();
    el?.classList.add('got');
    try {
      const r = await api.mapFindClaim(f.id);
      taken.current.add(f.id);
      if (useUi.getState().settings.haptics) buzz('success');
      const m = FIND_META[r.kind];
      toast.success(`${m.emoji} ${m.verb} a ${m.name.toLowerCase()}!`, { description: r.ink ? `+${r.ink} Ink · ${r.today} found today` : r.capped ? 'That’s today’s Ink from finds — the rest are just for fun.' : `${r.today} found today` });
      setTimeout(() => { markers.current.get(f.id)?.remove(); markers.current.delete(f.id); }, 650);
      invalidate();
      void qc.invalidateQueries({ queryKey: ['map-finds'] });
    } catch (e) {
      el?.classList.remove('got');
      const err = toGameError(e);
      if (err.code === 'already_found' || err.code === 'find_gone') { taken.current.add(f.id); markers.current.get(f.id)?.remove(); markers.current.delete(f.id); }
      if (!auto) toast.error(err.message);
    } finally { busy.current.delete(f.id); }
  };
  const collectRef = useRef(collect);
  collectRef.current = collect;

  // the markers
  useEffect(() => {
    const map = mapHandle.current;
    if (!map) return;
    const keep = new Set(finds.map((f) => f.id));
    for (const [id, m] of markers.current) if (!keep.has(id) && !m.getElement().classList.contains('got')) { m.remove(); markers.current.delete(id); }
    for (const f of finds) {
      if (markers.current.has(f.id)) continue;
      const el = document.createElement('button');
      el.className = `lv-find ${f.kind}`;
      el.dataset.testid = 'map-find'; el.dataset.kind = f.kind; el.dataset.id = f.id;
      el.setAttribute('aria-label', FIND_META[f.kind].name);
      el.innerHTML = `<span class="b">${FIND_META[f.kind].emoji}</span><span class="sh"></span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); void collectRef.current(f); });
      markers.current.set(f.id, new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([f.lng, f.lat]).addTo(map));
    }
  }, [finds]);
  useEffect(() => () => { for (const m of markers.current.values()) m.remove(); markers.current.clear(); }, []);

  // riding right past one picks it up
  useEffect(() => {
    if (!finds.length) return;
    const iv = setInterval(() => {
      const st = useExplorer.getState();
      if (!st.state || st.state.mode === 'gps') return; // only while you steer (GPS jitter shouldn't grab things)
      const p = explorerNow(st.state, st.offset);
      if (!p) return;
      for (const f of finds) if (!taken.current.has(f.id) && metres(p, f) <= AUTO_M) void collectRef.current(f, true);
    }, 700);
    return () => clearInterval(iv);
  }, [finds]);
  return null;
}
