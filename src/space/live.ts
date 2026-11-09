// Walking together on a world. A heartbeat finds (and keeps) your live group of up to 10 — dropping
// you next to someone the first time — and in between, positions stream to the group over a realtime
// channel. Used by both the 3D surface and the planet map, so you stay in the same group either way.
import { useEffect, useRef, useState } from 'react';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { LiveMember } from '../backend/types';
import { safeStorage, saveStorage } from '../lib/utils';
import { pulse } from '../lib/pulse';

export type Pose = { d: number[]; face: number[]; hop: number; v?: string };
export type LiveInfo = { with: number; onWorld: number; size: number };

/** Your last spot on each world, so the map and the 3D surface agree on where you are. */
export const savedPose = (world: string): Pose | null => {
  const p = safeStorage<Pose | null>(`landvas.planet.pose.${world}`, null);
  return p && Array.isArray(p.d) && p.d.length === 3 && p.d.every(Number.isFinite) ? p : null;
};
export const savePose = (world: string, p: Pose) => saveStorage(`landvas.planet.pose.${world}`, { d: p.d, face: p.face, hop: 0 });

export function usePlanetLive(opts: {
  world: string; enabled: boolean; myId: string | undefined;
  pose(): Pose | null;
  onMembers(m: LiveMember[]): void;
  onRemote(id: string, d: number[], face: number[], hop: number, v?: string | null): void;
  onSpawn?(d: number[], who: LiveMember | null): void;
  /** a chat message someone in the group just sent (instant, before the next list fetch) */ onChat?(m: unknown): void;
  /** filled in with a way to broadcast to the group */ sendRef?: { current: ((m: unknown) => void) | null };
}) {
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const ref = useRef(opts); ref.current = opts;
  useEffect(() => {
    if (!opts.enabled || !opts.myId) return;
    const backend = getBackend();
    const world = opts.world, myId = opts.myId;
    let stopped = false, ch: { send(m: unknown): void; close(): void } | null = null, chName = '', first = true;
    let members = new Set<string>();
    let lastSent = 0, lastKey = '';
    let lastBeatD: number[] | null = null, lastBeatAt = 0;
    const onMsg = (m: unknown) => {
      const x = m as { id?: string; d?: number[]; f?: number[]; h?: number; v?: string; t?: string; m?: unknown };
      if (x?.t === 'chat') { if (x.id && members.has(x.id)) ref.current.onChat?.(x.m); return; }
      if (x?.id && members.has(x.id) && x.d && x.f) ref.current.onRemote(x.id, x.d, x.f, x.h ?? 0, x.v ?? null);
      // someone new on the channel: fetch the group now rather than at the next check-in
      else if (x?.id && x.id !== myId && !members.has(x.id)) pl.soon();
    };
    // arrivals and departures come straight from the live channel; a departure disappears at once
    let shown: LiveMember[] = [];
    const onPeer = (id: string, here: boolean) => {
      if (!here && members.has(id)) { members.delete(id); shown = shown.filter((m) => m.id !== id); ref.current.onMembers(shown); }
      pl.soon(here ? 600 : 2000);
    };
    const beat = async () => {
      if (stopped || document.hidden) return;
      const pose = ref.current.pose();
      try {
        const r = await api.planetLive(world, pose?.d ?? null, pose?.face ?? null, pose?.hop ?? 0);
        if (stopped) return;
        if (first && r.joined && r.spawn) ref.current.onSpawn?.(r.spawn.d, r.members.find((m) => m.id === r.spawn!.player) ?? null);
        first = false;
        lastBeatD = pose?.d ?? lastBeatD; lastBeatAt = performance.now();
        members = new Set(r.members.map((m) => m.id));
        shown = r.members;
        if (!(window as { __landvasLiveFreeze?: boolean }).__landvasLiveFreeze) ref.current.onMembers(r.members);
        if (r.channel !== chName) { ch?.close(); chName = r.channel; ch = backend.liveChannel?.(r.channel, onMsg, { me: myId, onPeer }) ?? null; }
        setInfo({ with: r.members.length, onWorld: r.on_world, size: r.group_size });
      } catch (e) {
        if (toGameError(e).code === 'land_first') stopped = true;
      }
    };
    if (opts.sendRef) opts.sendRef.current = (m) => ch?.send(m);
    // a check-in keeps you in your group (each one is a database write): every half minute, and sooner after you've
    // walked a fair way (the server checks what you pick up against where your last check-in put you)
    const pl = pulse(beat, () => false);
    const tx = setInterval(() => {
      const p = ref.current.pose(); if (!p || !ch) return;
      const key = p.d.map((n) => n.toFixed(4)).join() + p.hop.toFixed(2) + (p.v ?? '');
      const now = performance.now();
      if (key !== lastKey || now - lastSent > 6000) { lastKey = key; lastSent = now; ch.send({ id: myId, d: p.d, f: p.face, h: p.hop, v: p.v }); savePose(world, p); }
      // walked away from where the last check-in put you: check in again (at most every 10 s while walking)
      if (lastBeatD && p.d.length === 3 && now - lastBeatAt > 10_000 && lastBeatD[0] * p.d[0] + lastBeatD[1] * p.d[1] + lastBeatD[2] * p.d[2] < 0.9998) { lastBeatD = null; pl.soon(300); }
    }, 100);
    // no explicit leave: a quick hop between the map and the 3D view keeps your group (and spot)
    return () => { stopped = true; pl.stop(); clearInterval(tx); ch?.close(); if (opts.sendRef) opts.sendRef.current = null; };
  }, [opts.enabled, opts.world, opts.myId]); // eslint-disable-line react-hooks/exhaustive-deps
  return info;
}
