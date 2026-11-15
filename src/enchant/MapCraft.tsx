// The six new enchantments, out on the map: your Spyglass readings (only you see them — a ring in the rarity's colour,
// with how long it lasts; tap to claim), plots folded into someone's pocket (a sheet of paper where the plot was), the
// fresh creases on a plot just unfolded, and the Crucible's monuments and inlays for everyone to see.
import { useQuery } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { useEffect } from 'react';
import { api, type EnchantMap3 } from '../backend/api';
import { useUi } from '../lib/store';
import { mapHandle } from '../map/mapHandle';
import { newMarker } from '../map/maplib';
import { cellCenter } from '../shared/grid';
import { rarityInfo } from '../shared/rarity';
import { dur, kindInfo } from './kinds';
import { usePlotPick } from './plotPick';
import './craft.css';

const ZOOM = 14.5;
const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const METAL: Record<string, string> = { iron: '#9AA0A8', copper: '#D07A40', silver: '#DDE6F0', gold: '#F2C440', platinum: '#C8F0FA', starsteel: '#A98BFF' };
const TIER = [null, ['🗿', '#CD7F32'], ['🗽', '#DDE6F0'], ['🏆', '#F2C440'], ['🌠', '#A98BFF']] as const;

function node(html: string, cls: string, onClick?: () => void) {
  const w = document.createElement('div');
  const b = document.createElement(onClick ? 'button' : 'div');
  b.className = cls; b.innerHTML = html;
  if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); const pick = usePlotPick.getState(); if (pick.spec) return; onClick(); });
  w.appendChild(b);
  return w;
}

export function MapCraft({ ready }: { ready: boolean }) {
  const bbox = useUi((s) => s.bbox);
  const zoom = useUi((s) => s.view.zoom);
  const on = !!bbox && zoom >= ZOOM;
  const key = bbox ? [bbox.min_gx, bbox.min_gy, bbox.max_gx, bbox.max_gy].map((x) => Math.round(x / 64) * 64) : null;
  const q = useQuery({ queryKey: ['enchant-map3', key], queryFn: () => api.enchantMap3({ min_gx: key![0] - 64, min_gy: key![1] - 64, max_gx: key![2] + 64, max_gy: key![3] + 64 }),
    enabled: ready && on && !!key && key[2] - key[0] < 20000, staleTime: 20_000, refetchInterval: 45_000, placeholderData: (p) => p });
  const data: EnchantMap3 | undefined = on ? q.data : undefined;

  useEffect(() => {
    const map = mapHandle.current;
    if (!ready || !map || !data) return;
    const ms: maplibregl.Marker[] = [];
    const add = (gx: number, gy: number, el: HTMLElement, anchor: maplibregl.PositionAnchor = 'center', off: [number, number] = [0, 0]) =>
      ms.push(newMarker({ element: el, anchor, offset: off }).setLngLat(cellCenter(gx, gy)).addTo(map));
    const select = (gx: number, gy: number) => useUi.getState().select({ gx, gy });
    for (const i of data.inlays) add(i.gx, i.gy, node('', 'lvx-inlay'), 'center');
    for (const c of data.creases ?? []) add(c.gx, c.gy, node('<i></i><i></i><i></i>', 'lvx-crease'), 'center');
    for (const f of data.folds) {
      const el = node(`<i></i><b>🦢</b><u>${f.mine ? 'in your pocket' : `folded by @${esc(f.owner_name)}`}</u>`, 'lvx-paper', () => select(f.gx, f.gy));
      el.title = 'A plot folded into an Origami Pocket';
      (el.firstChild as HTMLElement).dataset.testid = 'map-fold';
      add(f.gx, f.gy, el);
    }
    for (const m of data.monuments) {
      const t = TIER[Math.max(1, Math.min(4, m.tier))]!;
      const el = node(`<span class="stat">${t[0]}</span><span class="plinth"></span><em>${esc(m.name || `@${m.owner_name}’s monument`)}</em>`, 'lvx-monument', () => select(m.gx, m.gy));
      (el.firstChild as HTMLElement).style.setProperty('--t', String(m.tier)); (el.firstChild as HTMLElement).style.setProperty('--c', t[1]);
      (el.firstChild as HTMLElement).dataset.testid = 'map-monument';
      add(m.gx, m.gy, el, 'bottom', [0, 6]);
    }
    for (const s of data.sightings) {
      const c = s.rarity === 'enchanted' ? '#B79CFF' : rarityInfo(s.rarity).color;
      const name = s.rarity === 'enchanted' ? (s.kind ? `Enchanted ${kindInfo(s.kind).emoji}` : '✨ Something stirs') : s.rarity.startsWith('crown') ? `👑 ${rarityInfo(s.rarity).name}` : rarityInfo(s.rarity).name;
      const el = node(`<b>🔭</b><em>${esc(name)} · ${dur(s.expires_in)}</em>`, 'lvx-sight', () => select(s.gx, s.gy));
      (el.firstChild as HTMLElement).style.setProperty('--c', c);
      (el.firstChild as HTMLElement).dataset.testid = 'map-sighting';
      el.style.zIndex = '20';
      add(s.gx, s.gy, el);
    }
    return () => { for (const m of ms) m.remove(); };
  }, [ready, data]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
