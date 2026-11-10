// Travelling together, live (v1.0.0): your travel group's positions stream over the group's private realtime channel
// (like walking together on a planet), so everyone moves live on each other's maps — as their own explorers. Also
// emotes (wave, high five, dance…), "meet me here" pings and game nudges.
//
// Privacy: you only ever send while you're away travelling, and never on your way home. At home nothing is sent at
// all, so nobody's GPS, and nobody's home, ever reaches anyone else.
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getBackend } from '../backend/backend';
import type { TravelGroupMember, VehicleKind } from '../backend/types';
import { explorerNow, useExplorer } from '../explorer/explorer';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';

export type LivePos = { lng: number; lat: number; at: number; v?: VehicleKind; r?: 'train' | 'plane' | null };
export type Emote = 'wave' | 'five' | 'dance' | 'love' | 'lol' | 'cheese' | 'race';
export const EMOTES: { id: Emote; emoji: string; label: string }[] = [
  { id: 'wave', emoji: '👋', label: 'Wave' }, { id: 'five', emoji: '🙌', label: 'High five' }, { id: 'dance', emoji: '💃', label: 'Dance' },
  { id: 'love', emoji: '❤️', label: 'Love it' }, { id: 'lol', emoji: '😂', label: 'LOL' }, { id: 'cheese', emoji: '📸', label: 'Say cheese' },
  { id: 'race', emoji: '🏃', label: 'Race you!' },
];
export type Ping = { id: string; who: string; lng: number; lat: number; at: number };

type Msg =
  | { t: 'pos'; id: string; lng: number; lat: number; v?: VehicleKind; r?: 'train' | 'plane' | null }
  | { t: 'bye'; id: string } | { t: 'hello'; id: string }
  | { t: 'emote'; id: string; e: Emote }
  | { t: 'ping'; id: string; lng: number; lat: number }
  | { t: 'game'; id: string };

export const useGroupLive = create<{
  pos: Record<string, LivePos>; emotes: Record<string, { e: Emote; at: number }>; pings: Ping[]; connected: boolean;
  send: ((m: Msg) => void) | null;
}>(() => ({ pos: {}, emotes: {}, pings: [], connected: false, send: null }));
if (typeof window !== 'undefined') (window as unknown as { __landvasGroupLive: unknown }).__landvasGroupLive = useGroupLive;

/** am I somewhere I may be seen? away travelling, and not on the way home */
export function shareable() {
  const s = useExplorer.getState().state;
  return !!s && s.mode === 'travel' && s.trip?.mode !== 'home';
}
const emoteOf = (e: Emote) => EMOTES.find((x) => x.id === e)!;

/** your own explorer on the map: shows your emote too */
export function showMyEmote(e: Emote) {
  const el = document.querySelector('.lv-explorer:not(.lv-mate)') as HTMLElement | null;
  if (el) bubble(el, e);
}
export function bubble(el: HTMLElement, e: Emote) {
  el.querySelector(':scope > .lv-emote')?.remove();
  const b = document.createElement('div');
  b.className = 'lv-emote';
  b.textContent = emoteOf(e).emoji;
  el.appendChild(b);
  if (e === 'dance') { el.classList.add('dancing'); setTimeout(() => el.classList.remove('dancing'), 3200); }
  setTimeout(() => b.remove(), 3600);
}

/** send something to the group (only while you're away travelling) */
type Out<M> = M extends { id: string } ? Omit<M, 'id'> : never;
export function sendGroup(m: Out<Msg>) {
  const s = useGroupLive.getState().send;
  if (!s) return false;
  if ((m.t === 'pos' || m.t === 'ping' || m.t === 'emote') && !shareable()) return false;
  s(m as unknown as Msg);
  return true;
}

/** joins the group's channel while you're in one: streams your position, hears everyone else's */
export function useGroupLiveSync(channel: string | undefined, members: TravelGroupMember[]) {
  const me = useOnboardedMe();
  const myId = me?.user_id;
  const qc = useQueryClient();
  const memRef = useRef(members); memRef.current = members;
  useEffect(() => {
    if (!channel || !myId) return;
    const backend = getBackend();
    const known = (id: string) => memRef.current.some((m) => m.id === id && !m.me);
    const name = (id: string) => memRef.current.find((m) => m.id === id)?.username ?? 'someone';
    let last: { lng: number; lat: number; at: number } | null = null;
    let wasSharing = false;
    const onMsg = (raw: unknown) => {
      const m = raw as Msg;
      if (!m || typeof m !== 'object' || !('id' in m) || !known(m.id)) return;
      const st = useGroupLive.getState();
      if (m.t === 'pos' && Number.isFinite(m.lng) && Number.isFinite(m.lat)) {
        useGroupLive.setState({ pos: { ...st.pos, [m.id]: { lng: m.lng, lat: m.lat, at: Date.now(), v: m.v, r: m.r ?? null } } });
      } else if (m.t === 'bye') {
        const { [m.id]: _gone, ...rest } = st.pos; useGroupLive.setState({ pos: rest });
      } else if (m.t === 'hello') {
        last = null; // say where I am right away
      } else if (m.t === 'emote' && EMOTES.some((x) => x.id === m.e)) {
        useGroupLive.setState({ emotes: { ...st.emotes, [m.id]: { e: m.e, at: Date.now() } } });
      } else if (m.t === 'ping' && Number.isFinite(m.lng) && Number.isFinite(m.lat)) {
        const p: Ping = { id: m.id, who: name(m.id), lng: m.lng, lat: m.lat, at: Date.now() };
        useGroupLive.setState({ pings: [...st.pings.filter((x) => x.id !== m.id), p] });
        toast(`📍 @${p.who}: meet me here!`, { action: { label: 'Show', onClick: () => { useExplorer.getState().setFollowing(false); useUi.getState().requestFly({ lng: p.lng, lat: p.lat, zoom: 16 }); } } });
      } else if (m.t === 'game') {
        void qc.invalidateQueries({ queryKey: ['group-game'] });
        void qc.invalidateQueries({ queryKey: ['travel-group'] });
      }
    };
    const ch = backend.liveChannel?.(channel, onMsg) ?? null;
    const send = (m: Msg) => ch?.send({ ...m, id: myId });
    useGroupLive.setState({ send, connected: !!ch });
    send({ t: 'hello', id: myId });
    // my position: when it moves, and every few seconds anyway (but only while away, never on the way home)
    const iv = setInterval(() => {
      const sharing = shareable();
      if (!sharing) { if (wasSharing) send({ t: 'bye', id: myId }); wasSharing = false; last = null; return; }
      wasSharing = true;
      const s = useExplorer.getState();
      const p = explorerNow(s.state, s.offset);
      if (!p) return;
      const now = performance.now();
      const moved = !last || Math.abs(p.lng - last.lng) * 111320 * Math.cos((p.lat * Math.PI) / 180) + Math.abs(p.lat - last.lat) * 110574 > 0.6;
      if (!moved && last && now - last.at < 3000) return;
      last = { lng: p.lng, lat: p.lat, at: now };
      const r = p.traveling && s.state?.trip?.mode && s.state.trip.mode !== 'home' ? s.state.trip.mode : null;
      send({ t: 'pos', id: myId, lng: p.lng, lat: p.lat, v: s.state?.vehicle?.current, r });
    }, 300);
    // forget anyone who's gone quiet, and old pings
    const gc = setInterval(() => {
      const st = useGroupLive.getState(), now = Date.now();
      const pos = Object.fromEntries(Object.entries(st.pos).filter(([, v]) => now - v.at < 20_000));
      const pings = st.pings.filter((p) => now - p.at < 90_000);
      if (Object.keys(pos).length !== Object.keys(st.pos).length || pings.length !== st.pings.length) useGroupLive.setState({ pos, pings });
    }, 2000);
    return () => {
      clearInterval(iv); clearInterval(gc);
      if (wasSharing) send({ t: 'bye', id: myId });
      ch?.close();
      useGroupLive.setState({ send: null, connected: false, pos: {}, pings: [] });
    };
  }, [channel, myId, qc]);
}
