// Walking together on a world. A heartbeat finds (and keeps) your live group of up to 10 — dropping
// you next to someone the first time — and in between, positions stream to the group over a realtime
// channel. Used by both the 3D surface and the planet map, so you stay in the same group either way.
import { useEffect, useRef, useState } from 'react';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { LiveMember } from '../backend/types';
import { safeStorage, saveStorage } from '../lib/utils';

export type Pose = { d: number[]; face: number[]; hop: number };
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
  onRemote(id: string, d: number[], face: number[], hop: number): void;
  onSpawn?(d: number[], who: LiveMember | null): void;
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
    const onMsg = (m: unknown) => {
      const x = m as { id?: string; d?: number[]; f?: number[]; h?: number };
      if (x?.id && members.has(x.id) && x.d && x.f) ref.current.onRemote(x.id, x.d, x.f, x.h ?? 0);
    };
    const beat = async () => {
      if (stopped) return;
      const pose = ref.current.pose();
      try {
        const r = await api.planetLive(world, pose?.d ?? null, pose?.face ?? null, pose?.hop ?? 0);
        if (stopped) return;
        if (first && r.joined && r.spawn) ref.current.onSpawn?.(r.spawn.d, r.members.find((m) => m.id === r.spawn!.player) ?? null);
        first = false;
        members = new Set(r.members.map((m) => m.id));
        if (!(window as { __landvasLiveFreeze?: boolean }).__landvasLiveFreeze) ref.current.onMembers(r.members);
        if (r.channel !== chName) { ch?.close(); chName = r.channel; ch = backend.liveChannel?.(r.channel, onMsg) ?? null; }
        setInfo({ with: r.members.length, onWorld: r.on_world, size: r.group_size });
      } catch (e) {
        if (toGameError(e).code === 'land_first') stopped = true;
      }
    };
    void beat();
    const hb = setInterval(() => void beat(), backend.mode === 'local' ? 1000 : 2000);
    const tx = setInterval(() => {
      const p = ref.current.pose(); if (!p || !ch) return;
      const key = p.d.map((n) => n.toFixed(4)).join() + p.hop.toFixed(2);
      const now = performance.now();
      if (key !== lastKey || now - lastSent > 1000) { lastKey = key; lastSent = now; ch.send({ id: myId, d: p.d, f: p.face, h: p.hop }); savePose(world, p); }
    }, 100);
    // no explicit leave: a quick hop between the map and the 3D view keeps your group (and spot)
    return () => { stopped = true; clearInterval(hb); clearInterval(tx); ch?.close(); };
  }, [opts.enabled, opts.world, opts.myId]); // eslint-disable-line react-hooks/exhaustive-deps
  return info;
}
