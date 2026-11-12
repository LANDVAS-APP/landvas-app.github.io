// Enchantments on the map: every enchanted plot glows with its enchantment (yours ringed in gold), parasites and spotted
// cuckoo eggs sit on the plots they've latched onto, giant plots show their Size Ray, and your Treasure Map's pieces and
// X are marked for you. Markers are maplibre DOM markers (the map positions them; only their insides animate).
import { useQuery } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { useEffect } from 'react';
import { api, type EnchantMap } from '../backend/api';
import { useUi } from '../lib/store';
import { mapHandle } from '../map/mapHandle';
import { cellCenter } from '../shared/grid';
import { useMyEnchantments } from './core';
import { kindInfo } from './kinds';
import './enchant.css';

const MIN_ZOOM = 15.5;

function el(html: string, cls: string, onClick?: () => void) {
  const wrap = document.createElement('div');
  const b = document.createElement('button');
  b.className = cls; b.innerHTML = html;
  if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  wrap.appendChild(b);
  return wrap;
}

export function EnchantLayer({ ready }: { ready: boolean }) {
  const bbox = useUi((s) => s.bbox);
  const zoom = useUi((s) => s.view.zoom);
  const on = !!bbox && zoom >= MIN_ZOOM;
  // a little margin round the view, rounded so panning doesn't refetch every frame
  const key = bbox ? [bbox.min_gx, bbox.min_gy, bbox.max_gx, bbox.max_gy].map((x) => Math.round(x / 64) * 64) : null;
  const q = useQuery({ queryKey: ['enchant-map', key], queryFn: () => api.enchantMap({ min_gx: key![0] - 64, min_gy: key![1] - 64, max_gx: key![2] + 64, max_gy: key![3] + 64 }),
    enabled: on && !!key && key[2] - key[0] < 20000, staleTime: 30_000, refetchInterval: 60_000, placeholderData: (p) => p });
  const mine = useMyEnchantments();
  const data: EnchantMap | undefined = on ? q.data : undefined;
  const maps = (mine.data ?? []).filter((e) => (e.reflect_kind ?? e.kind) === 'map').map((e) => (e.reflect_kind ? e.reflected : e.view)).filter(Boolean);

  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map) return;
    const markers: maplibregl.Marker[] = [];
    const add = (gx: number, gy: number, node: HTMLElement, anchor: maplibregl.PositionAnchor = 'center', offset: [number, number] = [0, 0]) => {
      const [lng, lat] = cellCenter(gx, gy);
      markers.push(new maplibregl.Marker({ element: node, anchor, offset }).setLngLat([lng, lat]).addTo(map));
    };
    for (const p of data?.plots ?? []) {
      const k = kindInfo(p.reflect ?? p.kind);
      const ring = p.mine ? '#FFD23F' : kindInfo(p.kind).a;
      const node = el(`<span class="lv-em-orb" style="--a:${kindInfo(p.kind).a};--r:${ring}"><span class="lv-em-ring"></span><span class="lv-em-ico">${k.emoji}</span>${p.partner ? `<span class="lv-em-tag">🧬</span>` : ''}${p.frozen ? `<span class="lv-em-tag lv-em-tag-l">❄️</span>` : ''}</span>`,
        'lv-em', () => useUi.getState().select({ gx: p.gx, gy: p.gy }));
      node.title = `${kindInfo(p.kind).name} #${p.serial}${p.owner_name ? ` · @${p.owner_name}` : ''}`;
      node.dataset.testid = 'map-enchant';
      add(p.gx, p.gy, node);
    }
    for (const a of data?.attached ?? []) {
      const node = el(a.what === 'parasite' ? (a.stage >= 2 ? '💚' : '🦠') : '🥚', `lv-em-small${a.on_mine ? ' lv-em-alert' : ''}`, () => useUi.getState().select({ gx: a.gx, gy: a.gy }));
      add(a.gx, a.gy, node, 'bottom-left', [4, -4]);
    }
    for (const g of data?.giants ?? []) add(g.gx, g.gy, el(`📡 ×${Number(g.mult).toFixed(1)}`, 'lv-em-giant'), 'bottom', [0, -10]);
    for (const m of maps) {
      for (const p of m.pieces ?? []) if (!p.found_at) add(p.gx, p.gy, el('🧩', 'lv-em-small lv-em-alert'), 'bottom', [0, -6]);
      if (m.x) add(m.x.gx, m.x.gy, el('<b style="color:#FF3B30;font-size:22px;text-shadow:0 0 8px #FF3B30">✕</b>', 'lv-em-x'));
    }
    const vis = () => { const show = map.getZoom() >= MIN_ZOOM; for (const m of markers) m.getElement().style.display = show ? '' : 'none'; };
    vis();
    map.on('zoom', vis);
    return () => { map.off('zoom', vis); markers.forEach((m) => m.remove()); };
  }, [ready, data, JSON.stringify(maps.map((m) => [m.pieces, m.x]))]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
