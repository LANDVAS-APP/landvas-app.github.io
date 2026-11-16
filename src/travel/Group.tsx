// Travelling together: your party (v1.2 — parties are their own thing now, see src/party) rides along when its leader
// boards a train or plane — each from the stop nearest them — and arrives together. Members see each other on the
// map, but only while they're away travelling: nobody's GPS, and nobody's home, ever shows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type * as maplibregl from 'maplibre-gl';
import { newMarker } from '../map/maplib';
import { toast } from 'sonner';
import { Crown, UserPlus, Users } from 'lucide-react';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { TravelGroupMember } from '../backend/types';
import { mapHandle } from '../map/mapHandle';
import { useExplorer } from '../explorer/explorer';
import { useUi } from '../lib/store';
import { Button, PlayerAvatar, Spinner } from '../ui';
import { explorerElement } from '../explorer/character';
import { bubble, useGroupLive, useGroupLiveSync } from './live';
import { PARTY_KEY, activityOf, memberAt, useParty, usePartyUi } from '../party/party';

export const GROUP_KEY = PARTY_KEY;
export const useTravelGroup = useParty;
export { memberAt } from '../party/party';

const where = (m: TravelGroupMember) =>
  !m.away ? '🏠 At home' : m.traveling ? `${m.trip?.mode === 'plane' ? '✈️' : '🚆'} On the way${m.trip?.to ? ` to ${m.trip.to}` : ''}` : `📍 ${m.trip?.to ?? 'Away'}`;

/** the Party tab of the Travel sheet: who's coming along, and the party itself one tap away */
export function GroupPane({ onDone }: { onDone(): void }) {
  const q = useTravelGroup();
  const qc = useQueryClient();
  const show = usePartyUi((s) => s.show);
  const requestFly = useUi((s) => s.requestFly);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  if (!d) return <div className="flex justify-center py-8"><Spinner /></div>;
  const g = d.group;
  const open = (tab: 'party' | 'invite' | 'lobbies') => { onDone(); show(tab); };
  if (!g) {
    return (
      <div className="space-y-3" data-testid="travel-group">
        <div className="rounded-2xl bg-surface-2/60 p-4 text-[13px] leading-relaxed">
          <div className="mb-1 text-sm font-bold">👥 Travel together</div>
          Start a party (anyone can) and when its leader boards a train or plane, the whole party rides along — each from the station or airport
          nearest them — and you all arrive together. While you’re away you see each other on the map. Nobody’s real location is ever shown.
        </div>
        <Button variant="primary" className="w-full" loading={busy} data-testid="group-create" onClick={async () => {
          setBusy(true);
          try { qc.setQueryData(GROUP_KEY, await api.partyCreate({ activity: 'travel' })); toast.success('Your party is ready — invite people!'); open('invite'); }
          catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
        }}>Start a party</Button>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => open('lobbies')}>Find a lobby</Button>
          <Button variant="ghost" className="flex-1" onClick={() => open('party')}>{d.invites.length ? `Invites · ${d.invites.length}` : 'Join with a code'}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="travel-group">
      <button className="flex w-full items-center gap-3 rounded-2xl bg-surface-2/60 px-4 py-3 text-left" onClick={() => open('party')} data-testid="group-open-party">
        <Users className="h-5 w-5 shrink-0 text-accent-2" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{g.name ?? 'Your party'}</span>
          <span className="block text-[12px] text-muted">{activityOf(g.activity).emoji} {g.members.length}/{g.max} · {g.leader ? 'you lead: when you board, everyone rides with you' : 'you ride along when the leader boards'}</span>
        </span>
        <span className="text-[12px] font-bold text-accent-2">Open</span>
      </button>
      <div className="grid gap-1" data-testid="group-members">
        {g.members.map((m) => {
          const at = memberAt(m, Date.now() + useExplorer.getState().offset);
          return (
            <div key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5" data-testid="group-member" data-user={m.username}>
              <PlayerAvatar p={m} size={34} />
              <button className="min-w-0 flex-1 text-left" disabled={!at} onClick={() => { if (at) { useExplorer.getState().setFollowing(false); requestFly({ lng: at[0], lat: at[1], zoom: 14 }); onDone(); } }}>
                <span className="flex items-center gap-1 truncate text-sm font-semibold">@{m.username}{m.me && <span className="text-[11px] font-normal text-muted">(you)</span>}{m.leader && <Crown className="h-3.5 w-3.5 text-gold" />}</span>
                <span className="block truncate text-[11px] text-muted" data-testid="member-where">{where(m)}</span>
              </button>
            </div>
          );
        })}
      </div>
      {g.members.length < g.max && <Button variant="ghost" className="w-full" onClick={() => open('invite')} data-testid="group-invite-open"><UserPlus className="h-4 w-4" /> Invite people</Button>}
    </div>
  );
}

/** your group on the map: the others, as their own explorers, moving live (never anyone at home) */
export function GroupMapLayer() {
  const q = useTravelGroup();
  const group = q.data?.group ?? null;
  useGroupLiveSync(group?.channel, group?.members ?? []);
  const live = useGroupLive((s) => s.pos);
  const emotes = useGroupLive((s) => s.emotes);
  const pings = useGroupLive((s) => s.pings);
  const others = useMemo(() => (group?.members ?? []).filter((m) => !m.me), [group]);
  const markers = useRef(new Map<string, { mk: maplibregl.Marker; el: HTMLElement; at: [number, number] | null; target: [number, number] | null }>());
  const liveRef = useRef(live); liveRef.current = live;
  // where each member should be: their live position (fresh), else what the server says while they're away
  const targetOf = (m: TravelGroupMember, now: number): [number, number] | null => {
    const l = liveRef.current[m.id];
    if (l && Date.now() - l.at < 12_000) return [l.lng, l.lat];
    return memberAt(m, now);
  };
  useEffect(() => {
    const map = mapHandle.current;
    const have = markers.current;
    const keep = new Set(others.map((m) => m.id));
    for (const [id, x] of have) if (!keep.has(id)) { x.mk.remove(); have.delete(id); }
    if (!map) return;
    for (const m of others) {
      if (have.has(m.id)) continue;
      const el = explorerElement(m.explorer_style, /^#[0-9a-f]{3,8}$/i.test(m.accent_color) ? m.accent_color : '#8B5CFF');
      el.classList.add('lv-mate');
      el.dataset.testid = 'group-mate'; el.dataset.user = m.username;
      const nm = document.createElement('div'); nm.className = 'lv-mate-name'; nm.textContent = `@${m.username}`;
      el.appendChild(nm);
      el.style.display = 'none';
      const mk = newMarker({ element: el, anchor: 'bottom', offset: [0, 6] }).setLngLat([0, 0]).addTo(map);
      have.set(m.id, { mk, el, at: null, target: null });
    }
    // glide each one towards where they are (live positions arrive a few times a second)
    let raf = 0, prev = performance.now();
    const frame = () => {
      const t = performance.now(), dt = Math.min(0.1, (t - prev) / 1000); prev = t;
      const now = Date.now() + useExplorer.getState().offset;
      for (const m of others) {
        const x = have.get(m.id);
        if (!x) continue;
        const tgt = targetOf(m, now);
        if (!tgt) { if (x.el.style.display !== 'none') x.el.style.display = 'none'; x.at = null; continue; }
        if (x.el.style.display === 'none') { x.el.style.display = ''; x.at = tgt; }
        const at = x.at ?? tgt;
        const dx = tgt[0] - at[0], dy = tgt[1] - at[1];
        // far off (a new leg, a teleport): jump; otherwise ease along
        const far = Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05;
        const k = far ? 1 : 1 - Math.exp(-dt * 6);
        const next: [number, number] = [at[0] + dx * k, at[1] + dy * k];
        const moving = Math.hypot(dx * 111320 * Math.cos((tgt[1] * Math.PI) / 180), dy * 110574) > 0.4;
        x.el.classList.toggle('walking', moving);
        if (Math.abs(dx) > 1e-7) x.el.classList.toggle('left', dx < 0);
        const l = liveRef.current[m.id];
        const ride = (l && Date.now() - l.at < 12_000 ? l.r : m.traveling ? (m.trip?.mode === 'train' || m.trip?.mode === 'plane' ? m.trip.mode : null) : null) ?? null;
        x.el.classList.toggle('ride-train', ride === 'train'); x.el.classList.toggle('ride-plane', ride === 'plane');
        const v = !ride ? (l?.v ?? m.vehicle) : null;
        x.el.classList.toggle('veh-bike', v === 'bike'); x.el.classList.toggle('veh-car', v === 'car'); x.el.classList.toggle('veh-jet', v === 'jet');
        x.at = next;
        x.mk.setLngLat(next);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [others]); // eslint-disable-line react-hooks/exhaustive-deps
  // their emotes pop up over them
  const seen = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const [id, e] of Object.entries(emotes)) {
      if (seen.current[id] === e.at) continue;
      seen.current[id] = e.at;
      const x = markers.current.get(id);
      if (x) bubble(x.el, e.e);
    }
  }, [emotes]);
  // "meet me here" pins
  const pinRefs = useRef(new Map<string, maplibregl.Marker>());
  useEffect(() => {
    const map = mapHandle.current;
    const keep = new Set(pings.map((p) => `${p.id}:${p.at}`));
    for (const [k, mk] of pinRefs.current) if (!keep.has(k)) { mk.remove(); pinRefs.current.delete(k); }
    if (!map) return;
    for (const p of pings) {
      const k = `${p.id}:${p.at}`;
      if (pinRefs.current.has(k)) continue;
      const el = document.createElement('div');
      el.className = 'lv-ping'; el.dataset.testid = 'group-ping';
      el.innerHTML = '<i></i><b></b><span></span>';
      (el.querySelector('span') as HTMLElement).textContent = `@${p.who}: meet here!`;
      pinRefs.current.set(k, newMarker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  }, [pings]);
  useEffect(() => () => {
    for (const x of markers.current.values()) x.mk.remove(); markers.current.clear();
    for (const mk of pinRefs.current.values()) mk.remove(); pinRefs.current.clear();
  }, []);
  return null;
}
