// Parties (v1.2): one party for everything. Start one (or get invited), make it Public — it shows up in the lobbies
// for anyone to join — or keep it Private, and take it anywhere: the map (and trips, where the party rides along
// when the leader boards), arcades, space. Party chat goes with you. Invite anyone online, any friend, or send a link
// to someone who hasn't even signed up yet.
//
// This file is the small core every screen can import (the query, the sheet's open/close, links, the join flow);
// the panels themselves live in PartyPanels.tsx and only load when they're opened.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PartyActivity, PartyState, TravelGroupMember, Whereabouts } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { poll } from '../lib/poll';
import { isNative } from '../native/native';
import { useConfirm } from '../ui';

/** the party is the same row as the old travel group, so it shares the query (trips, group games and photos read it) */
export const PARTY_KEY = ['travel-group'] as const;
export const LOBBIES_KEY = ['party-lobbies'] as const;

export function useParty() {
  const me = useOnboardedMe();
  return useQuery({
    queryKey: PARTY_KEY, queryFn: api.travelGroup, enabled: !!me, staleTime: 5_000,
    // members on the move: keep up with them; otherwise changes are pushed (this is a safety net)
    refetchInterval: (q) => (q.state.data?.group?.members.some((m) => m.away && !m.me) ? 8_000 : q.state.data?.group ? poll(30_000) : poll(90_000)),
  });
}

export const ACTIVITIES: Record<PartyActivity, { emoji: string; label: string }> = {
  hangout: { emoji: '💬', label: 'Hanging out' },
  travel: { emoji: '🧳', label: 'Travelling' },
  arcade: { emoji: '🕹️', label: 'Arcade' },
  games: { emoji: '🎮', label: 'Minigames' },
  space: { emoji: '🚀', label: 'Space' },
  art: { emoji: '🎨', label: 'Art' },
  explore: { emoji: '🗺️', label: 'Exploring' },
};
export const ACTIVITY_IDS = Object.keys(ACTIVITIES) as PartyActivity[];
export const activityOf = (a: string | null | undefined) => ACTIVITIES[(a ?? 'hangout') as PartyActivity] ?? ACTIVITIES.hangout;

// ---- the sheet (open from anywhere) ---------------------------------------------------------------------------------
export type PartyTab = 'party' | 'invite' | 'lobbies';
export const usePartyUi = create<{ open: boolean; tab: PartyTab; show(tab?: PartyTab): void; setTab(t: PartyTab): void; close(): void }>((set) => ({
  open: false, tab: 'party',
  show: (tab) => set({ open: true, tab: tab ?? 'party' }),
  setTab: (tab) => set({ tab }),
  close: () => set({ open: false }),
}));

// ---- links ----------------------------------------------------------------------------------------------------------
const SITE = 'https://landvas.app';
/** landvas.app/party/CODE?ref=YOURCODE: opens the party for anyone; a new player who signs up with it counts as your invite */
export function partyLink(code: string, ref?: string | null) {
  const web = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !isNative();
  const sub = (import.meta.env.BASE_URL || '/').startsWith('/') ? (import.meta.env.BASE_URL || '/').replace(/\/$/, '') : '';
  const base = web ? `${location.origin}${sub}` : SITE;
  return `${base}/party/${encodeURIComponent(code)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
}
export { PARTY_CODE } from './link';

export { capturePartyLink, clearPendingParty, pendingParty, savePendingParty } from './link';

// ---- joining (with a "switch parties?" when you're already in one) ----------------------------------------------------
export type JoinHow = { kind: 'code'; code: string } | { kind: 'public'; id: string } | { kind: 'invite'; id: string } | { kind: 'player'; id: string };
export function usePartyJoin() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  return async (how: JoinHow, name?: string): Promise<PartyState | null> => {
    const call = (sw: boolean) => (how.kind === 'code' ? api.partyJoinCode(how.code, sw) : how.kind === 'public' ? api.partyJoinPublic(how.id, sw)
      : how.kind === 'player' ? api.partyJoinPlayer(how.id, sw) : api.partyAccept(how.id, sw));
    const done = (r: PartyState) => { qc.setQueryData(PARTY_KEY, r); void qc.invalidateQueries({ queryKey: LOBBIES_KEY }); return r; };
    try {
      return done(await call(false));
    } catch (e) {
      const err = toGameError(e);
      if (err.code !== 'already_in_group') throw err;
      const ok = await confirm({ title: 'Switch parties?', body: `You’ll leave the party you’re in and join ${name ? `“${name}”` : 'this one'}.`, confirm: 'Switch' });
      if (!ok) return null;
      return done(await call(true));
    }
  };
}

/** what a party member is up to, in a few words ("🕹️ in an arcade") — or online / away */
export function memberStatus(m: { me?: boolean; online?: boolean; away?: boolean; traveling?: boolean; trip?: { mode: string; to: string | null } | null }, describe: string | null) {
  if (m.away && m.traveling) return `${m.trip?.mode === 'plane' ? '✈️' : '🚆'} on the way${m.trip?.to ? ` to ${m.trip.to}` : ''}`;
  if (m.away && m.trip?.to) return `📍 in ${m.trip.to}`;
  if (describe) return describe;
  return m.online ? '🟢 online' : 'offline';
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


/** where someone is that you can go to: their arcade, a home (theirs or someone's) — you land in their room */
export function goTarget(now: Whereabouts | null | undefined): { label: string; route: string } | null {
  const a = now?.activity;
  if (!now?.online || !a) return null;
  if (a.kind === 'arcade' && a.detail.arcade) return { label: '🕹️ Join', route: `/arcade/${a.detail.arcade}` };
  if (a.kind === 'home' && a.detail.username) return { label: '🏠 Join', route: `/u/${encodeURIComponent(a.detail.username)}/home` };
  // at their farm, business, realm…: come and help
  if (a.kind === 'place' && a.detail.route && /^\/(farm|business|realm|habitat|landlord)\/[\w-]+$/.test(a.detail.route)) return { label: '🤝 Help', route: a.detail.route };
  return null;
}
/** go to them (and into their room) */
export async function goTo(playerId: string, route: string, nav: (to: string) => void) {
  try { await api.placeFollow(playerId); } catch { /* still go */ }
  nav(route);
}
