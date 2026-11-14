// The three newest enchantments, out on the map: a Homunculus walking from one of its owner's plots to the next (tap
// someone else's to greet it — a few Ink each), a serpent coiled round every enchantment in a coiled splice (its loops on
// a badge), and storms — a thundercloud over the Storm Coil and every bolt gathering and striking where it lands, on the
// server's own clock. Tap your own bolts to catch them; anyone can catch a stray that lands on a neighbour's plot.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type EnchantMap2, type MapStorm } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { mapHandle } from '../map/mapHandle';
import { newMarker } from '../map/maplib';
import { cellCenter } from '../shared/grid';
import { homuSvg } from './homunculus';
import { feel } from './living';

const WALK_ZOOM = 15.5;
const STORM_ZOOM = 12.5;
const ZZ = '<svg class="zz" viewBox="0 0 30 220" aria-hidden="true"><path d="M15 0 L4 92 L14 92 L2 220 L28 70 L17 70 L26 0 Z" fill="#E8F6FF" stroke="#7DF9FF" stroke-width="2"/></svg>';
const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function wrap(html: string, cls: string, onClick?: () => void) {
  const w = document.createElement('div');
  const b = document.createElement(onClick ? 'button' : 'div');
  b.className = cls; b.innerHTML = html;
  if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  w.appendChild(b);
  return w;
}
const what = (r: any) => (r?.what === 'aberration' ? `☣️ It mutated into ${r.aberration}!` : r?.what === 'surge' ? `⚡ Surge — its Traits ×${r.k}` : r?.what === 'overcharge' ? '⚡ Overcharged — its next reward ×2'
  : r?.what === 'extend' ? `⏳ +${r.hours} h fused` : `⚡ +${r?.ink ?? 0} Ink`);

export function MapMarvels({ ready }: { ready: boolean }) {
  const bbox = useUi((s) => s.bbox);
  const zoom = useUi((s) => s.view.zoom);
  const nav = useNavigate();
  const qc = useQueryClient();
  const on = !!bbox && zoom >= STORM_ZOOM;
  const key = bbox ? [bbox.min_gx, bbox.min_gy, bbox.max_gx, bbox.max_gy].map((x) => Math.round(x / 64) * 64) : null;
  const q = useQuery({ queryKey: ['enchant-map2', key], queryFn: () => api.enchantMap2({ min_gx: key![0] - 64, min_gy: key![1] - 64, max_gx: key![2] + 64, max_gy: key![3] + 64 }),
    enabled: on && !!key && key[2] - key[0] < 20000, staleTime: 15_000, refetchInterval: 20_000, placeholderData: (p) => p });
  const data: EnchantMap2 | undefined = on ? q.data : undefined;
  const offset = useRef(0);
  useEffect(() => { if (q.data) offset.current = Number(q.data.server_now) * 1000 - q.dataUpdatedAt; }, [q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const caught = useRef(new Set<string>());

  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !data) return;
    const near: maplibregl.Marker[] = [], far: maplibregl.Marker[] = [];
    const add = (list: maplibregl.Marker[], lngLat: [number, number], node: HTMLElement, anchor: maplibregl.PositionAnchor = 'center', offs: [number, number] = [0, 0]) => {
      const m = newMarker({ element: node, anchor, offset: offs }).setLngLat(lngLat).addTo(map);
      list.push(m); return m;
    };
    // 🧫 walking Homunculi
    for (const w of data.walkers) {
      const name = w.nickname || `Homunculus #${w.serial}`;
      const html = `<span class="lv-homu-mk"><span class="fig lv-homu-figure walking">${homuSvg(w.parts, { id: `mw${w.id.slice(0, 8)}` })}</span>`
        + `<span class="tag${w.mine ? ' mine' : ''}">${w.mine ? 'Your ' : ''}${esc(name)}${w.mine ? '' : ` · @${esc(w.owner_name)}`} · ×${Number(w.mult).toFixed(1)}</span>`
        + `${!w.mine && !w.greeted ? '<span class="wave">👋</span>' : ''}</span>`;
      const node = wrap(html, 'lv-em', async () => {
        if (w.mine) { nav(`/grimoire/${w.id}`); return; }
        if (w.greeted) { toast(`You’ve greeted @${w.owner_name ?? '?'}’s Homunculus today`); return; }
        try {
          const r = await api.homunculusGreet(w.id);
          feel('success');
          toast.success(`👋 You greeted @${w.owner_name ?? '?'}’s Homunculus: +${r.you} Ink (and they got +${r.them})`);
          void qc.invalidateQueries({ queryKey: ['enchant-map2'] }); invalidateGame(qc);
        } catch (e) { toast.error(toGameError(e).message); }
      });
      node.title = `${name}${w.owner_name ? ` · @${w.owner_name}` : ''} — its plot’s games ×${Number(w.mult).toFixed(2)}`;
      node.dataset.testid = 'map-homunculus';
      add(near, cellCenter(w.gx, w.gy), node, 'bottom', [0, 10]);
    }
    // 🐍 coiled serpents
    for (const c of data.coils) {
      const node = wrap(`<span class="lv-ouro-mk${c.status === 'closed' ? ' closed' : ''}"><i></i><b>🐍${c.loops}</b></span>`, 'lv-em-ouro');
      node.style.pointerEvents = 'none';
      node.dataset.testid = 'map-coil';
      add(near, cellCenter(c.gx, c.gy), node);
    }
    // ⚡ storms: the cloud, and every bolt where it lands
    const bolts: { node: HTMLElement; s: MapStorm; b: MapStorm['bolts'][number] }[] = [];
    for (const s of data.storms) {
      const cloud = wrap(`<span class="lv-storm-mk"><span class="cl">⛈️</span><b>⚡ ${s.mine ? 'Your storm' : `@${esc(s.owner_name)}’s storm`}</b></span>`, 'lv-em-storm');
      cloud.style.pointerEvents = 'none';
      cloud.style.zIndex = '6';
      cloud.dataset.testid = 'map-storm';
      add(far, cellCenter(s.gx, s.gy), cloud, 'bottom', [0, -30]);
      for (const b of s.bolts) {
        const can = s.mine || b.kind === 'stray';
        const k = `${s.id}:${b.i}`;
        const node = wrap(`<span class="ret"></span>${ZZ}`, `lv-storm-bolt-mk${b.kind === 'stray' ? ' stray' : ''}`, can ? async () => {
          if (caught.current.has(k) || !node.firstElementChild?.classList.contains('live')) return;
          try {
            feel('heavy');
            if (s.mine) {
              const r = await api.enchantAct(s.id, 'catch', { i: b.i });
              qc.setQueryData(['enchant', s.id], r);
              toast.success(what(r.result));
            } else {
              const r = await api.stormCatch(s.id, b.i);
              toast.success(`⚡ You caught a stray bolt from @${s.owner_name ?? '?'}’s storm: +${r.ink} Ink`);
              invalidateGame(qc);
            }
            caught.current.add(k);
            feel('success');
          } catch (e) { toast.error(toGameError(e).message); }
        } : undefined);
        node.dataset.testid = 'map-bolt';
        node.style.zIndex = '7';
        if (s.caught.includes(b.i)) caught.current.add(k);
        bolts.push({ node, s, b });
        add(far, cellCenter(b.gx, b.gy), node);
      }
    }
    // zoomed out a little, only the storms show; right in, the walkers and coils too
    const vis = () => {
      const z = map.getZoom();
      for (const m of near) m.getElement().style.display = z >= WALK_ZOOM ? '' : 'none';
      for (const m of far) m.getElement().style.display = z >= STORM_ZOOM ? '' : 'none';
    };
    vis();
    map.on('zoom', vis);
    // the storms' clock: a ring gathers 1.6 s before a bolt lands, then it strikes
    let timer = 0;
    if (bolts.length) {
      timer = window.setInterval(() => {
        if (document.hidden) return;
        const now = (Date.now() + offset.current) / 1000;
        for (const { node, s, b } of bolts) {
          const el = node.firstElementChild as HTMLElement | null;
          if (!el) continue;
          const t = now - s.at, k = `${s.id}:${b.i}`;
          const charging = t >= b.t - 1.6 && t < b.t, strike = t >= b.t && t <= b.t + 0.8;
          el.classList.toggle('charging', charging && !caught.current.has(k));
          el.classList.toggle('strike', strike);
          el.classList.toggle('live', (charging || strike) && !caught.current.has(k));
          el.classList.toggle('done', !(charging || strike) || caught.current.has(k));
        }
      }, 120);
    }
    return () => { map.off('zoom', vis); clearInterval(timer); [...near, ...far].forEach((m) => m.remove()); };
  }, [ready, data]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
