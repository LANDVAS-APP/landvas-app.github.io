// Travel groups (v0.9.9): up to 10 travellers. When the leader sets off, everyone in the group rides too — each
// boarding at the stop nearest them — and arrives together. Members see each other on the map, but only while
// they're away travelling: nobody's GPS, and nobody's home, ever shows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { toast } from 'sonner';
import { Copy, Crown, LogOut, UserPlus, X } from 'lucide-react';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { TravelGroupMember, TravelGroupState } from '../backend/types';
import { mapHandle } from '../map/mapHandle';
import { useExplorer } from '../explorer/explorer';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button, PlayerAvatar, Spinner, inputCls } from '../ui';

export const GROUP_KEY = ['travel-group'] as const;

export function useTravelGroup() {
  const me = useOnboardedMe();
  return useQuery({
    queryKey: GROUP_KEY, queryFn: api.travelGroup, enabled: !!me, staleTime: 5_000,
    // members on the move: keep up with them
    refetchInterval: (q) => (q.state.data?.group?.members.some((m) => m.away && !m.me) ? 8_000 : q.state.data?.group ? 30_000 : 60_000),
  });
}

/** where a member is now: their stop, or along the leg they're riding */
export function memberAt(m: TravelGroupMember, now: number): [number, number] | null {
  if (!m.away || m.lng == null || m.lat == null) return null;
  if (!m.traveling || m.dest_lng == null || m.dest_lat == null || !m.speed_mps || !m.fixed_at || m.origin_lng == null || m.origin_lat == null) return [m.lng, m.lat];
  const R = Math.PI / 180, a = [m.origin_lng, m.origin_lat], b = [m.dest_lng, m.dest_lat];
  const h = Math.sin(((b[1] - a[1]) * R) / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(((b[0] - a[0]) * R) / 2) ** 2;
  const d = 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
  const f = Math.min(1, Math.max(0, ((now - new Date(m.fixed_at).getTime()) / 1000) * m.speed_mps / Math.max(d, 1)));
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

const where = (m: TravelGroupMember) =>
  !m.away ? '🏠 At home' : m.traveling ? `${m.trip?.mode === 'plane' ? '✈️' : '🚆'} On the way${m.trip?.to ? ` to ${m.trip.to}` : ''}` : `📍 ${m.trip?.to ?? 'Away'}`;

/** the Group tab of the Travel sheet */
export function GroupPane({ onDone }: { onDone(): void }) {
  const q = useTravelGroup();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const requestFly = useUi((s) => s.requestFly);
  const run = async (key: string, f: () => Promise<TravelGroupState>, ok?: string) => {
    setBusy(key);
    try { qc.setQueryData(GROUP_KEY, await f()); if (ok) toast.success(ok); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const d = q.data;
  if (!d) return <div className="flex justify-center py-8"><Spinner /></div>;
  const g = d.group;
  return (
    <div className="space-y-3" data-testid="travel-group">
      {d.invites.map((i) => (
        <div key={i.group_id} className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3" data-testid="group-invite">
          <PlayerAvatar p={i.by} size={34} />
          <div className="min-w-0 flex-1 text-sm"><b>@{i.by.username}</b> invited you to travel together <span className="text-muted">· {i.size} in the group</span></div>
          <Button size="sm" variant="primary" loading={busy === `a${i.group_id}`} onClick={() => run(`a${i.group_id}`, () => api.travelGroupAccept(i.group_id), 'You’re in the group 🧳')} data-testid="group-accept">Join</Button>
          <button className="text-muted" aria-label="Decline" onClick={() => run(`d${i.group_id}`, () => api.travelGroupDecline(i.group_id))}><X className="h-4 w-4" /></button>
        </div>
      ))}
      {!g ? (
        <>
          <div className="rounded-2xl bg-surface-2/60 p-4 text-[13px] leading-relaxed">
            <div className="mb-1 text-sm font-bold">👥 Travel together</div>
            Up to 10 travellers. When the leader sets off, everyone rides too — each from the station or airport nearest them — and you all arrive together.
            While you’re away you see each other on the map. Nobody’s real location is ever shown.
          </div>
          <Button variant="primary" className="w-full" loading={busy === 'create'} onClick={() => run('create', api.travelGroupCreate, 'Your group is ready — share the code!')} data-testid="group-create">Start a group</Button>
          <div className="flex gap-2">
            <input className={cn(inputCls, 'flex-1 uppercase tracking-widest')} placeholder="Join with a code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="group-code-input" />
            <Button variant="ghost" disabled={code.trim().length < 6} loading={busy === 'join'} onClick={() => run('join', () => api.travelGroupJoin(code), 'You’re in the group 🧳')} data-testid="group-join">Join</Button>
          </div>
          <div className="text-center text-[11px] text-muted">Leading a group needs a Travel plot (Train or Plane).</div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-surface-2/60 px-4 py-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-faint">Group code</div>
              <div className="font-display text-2xl font-black tracking-[0.25em]" data-testid="group-code">{g.code}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(g.code).catch(() => {}); toast('Code copied'); }}><Copy className="h-4 w-4" /> Copy</Button>
          </div>
          <div className="text-[12px] text-muted">{g.leader ? 'You lead: when you board, the whole group rides with you.' : 'When the leader boards, you ride along.'} {g.members.length}/{g.max} travellers.</div>
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
                  {g.leader && !m.me && (
                    <button className="text-muted hover:text-bad" aria-label={`Remove @${m.username}`} onClick={() => run(`k${m.id}`, () => api.travelGroupKick(m.id))}><X className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
            {g.invited.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 opacity-60">
                <PlayerAvatar p={p} size={28} /><span className="text-[13px]">@{p.username} · invited</span>
              </div>
            ))}
          </div>
          {g.members.length < g.max && (
            <div className="flex gap-2">
              <input className={cn(inputCls, 'flex-1')} placeholder="Invite by username" value={who} onChange={(e) => setWho(e.target.value.replace(/^@/, ''))} data-testid="group-invite-input" />
              <Button variant="ghost" disabled={!who.trim()} loading={busy === 'invite'} onClick={() => run('invite', () => api.travelGroupInvite(who.trim()), `Invited @${who.trim()}`).then(() => setWho(''))} data-testid="group-invite-send"><UserPlus className="h-4 w-4" /></Button>
            </div>
          )}
          <button className="flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-bad" onClick={() => run('leave', api.travelGroupLeave, 'You left the group')} data-testid="group-leave"><LogOut className="h-3.5 w-3.5" /> Leave the group</button>
        </>
      )}
    </div>
  );
}

/** your group on the map: the others, wherever they are travelling (never anyone at home) */
export function GroupMapLayer() {
  const q = useTravelGroup();
  const mates = useMemo(() => (q.data?.group?.members ?? []).filter((m) => !m.me && m.away), [q.data]);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  useEffect(() => {
    const map = mapHandle.current;
    const have = markers.current;
    const keep = new Set(mates.map((m) => m.id));
    for (const [id, mk] of have) if (!keep.has(id)) { mk.remove(); have.delete(id); }
    if (!map) return;
    for (const m of mates) {
      let mk = have.get(m.id);
      if (!mk) {
        const el = document.createElement('div');
        el.className = 'lv-mate';
        el.dataset.testid = 'group-mate'; el.dataset.user = m.username;
        el.innerHTML = `<div class="ring"><span></span></div><div class="who"></div>`;
        (el.querySelector('.ring span') as HTMLElement).textContent = (m.display_name || m.username).slice(0, 1).toUpperCase();
        (el.querySelector('.ring') as HTMLElement).style.setProperty('--c', /^#[0-9a-f]{3,8}$/i.test(m.accent_color) ? m.accent_color : '#8B5CFF');
        (el.querySelector('.who') as HTMLElement).textContent = `@${m.username}`;
        mk = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng!, m.lat!]).addTo(map);
        have.set(m.id, mk);
      }
      mk.getElement().classList.toggle('riding', !!m.traveling);
    }
    const tick = () => {
      const now = Date.now() + useExplorer.getState().offset;
      for (const m of mates) { const p = memberAt(m, now); if (p) have.get(m.id)?.setLngLat(p); }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [mates]);
  useEffect(() => () => { for (const m of markers.current.values()) m.remove(); markers.current.clear(); }, []);
  return null;
}
