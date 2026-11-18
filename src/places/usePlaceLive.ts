// A live room in any place (wave 1 on): up to 10 people walking about together. The heartbeat keeps your spot in the
// room (and finds your party's room when you walk in); positions stream over the room's realtime channel in between,
// so others glide about smoothly. Leaving the place lets the room go at once.
import { useEffect, useRef, useState } from 'react';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { ExplorerStyle, PlaceLive } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { pulse } from '../lib/pulse';
import type { PlaceScene } from './engine';

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
export const explorerUrl = (style: ExplorerStyle | null | undefined, accent: string | null | undefined) => svgUrl(explorerSvg(style ?? undefined, accent ?? '#7B5CFF', 184));
type Msg = { t: 'pos'; id: string; x: number; z: number; f: number; a: string | null };

export function usePlaceLive(opts: { place: string | null; myId: string | undefined; scene: React.RefObject<PlaceScene | null>; act?: string | null }) {
  const [live, setLive] = useState<PlaceLive | null>(null);
  const ref = useRef(opts); ref.current = opts;
  const soon = useRef<(() => void) | null>(null);
  // stepping into (or out of) something that counts on the server (inside a painting) checks in at once
  const lasting = opts.act?.startsWith('inside:') ? opts.act : null;
  useEffect(() => { soon.current?.(); }, [lasting]);
  useEffect(() => {
    const place = opts.place, myId = opts.myId;
    if (!place || !myId) return;
    const backend = getBackend();
    let stopped = false, ch: { send(m: unknown): void; close(): void } | null = null, chName = '', members = new Set<string>();
    const urls = new Map<string, string>();
    const onMsg = (raw: unknown) => {
      const m = raw as Msg | { t: 'nudge' };
      if (m && m.t === 'nudge') { p.soon(); return; }
      if (!m || !('id' in m) || m.id === myId) return;
      if (!members.has(m.id)) { p.soon(); return; } // someone new: look again now rather than at the next beat
      ref.current.scene.current?.moveOther(m.id, m.x, m.z, m.f, m.a);
    };
    const onPeer = (id: string, here: boolean) => {
      if (!here && members.has(id)) members.delete(id);
      p.soon(here ? 600 : 1500);
    };
    const beat = async () => {
      if (stopped || document.hidden) return;
      const pose = ref.current.scene.current?.pose();
      try {
        const r = await api.placeLive(place, pose?.x ?? null, pose?.z ?? null, ref.current.act ?? null);
        if (stopped) return;
        members = new Set(r.members.map((m) => m.id));
        ref.current.scene.current?.setOthers(r.members.map((m) => {
          let u = urls.get(m.id); if (!u) { u = explorerUrl(m.explorer_style as ExplorerStyle | undefined, m.accent_color); urls.set(m.id, u); }
          return { id: m.id, url: u, name: `@${m.username}`, x: m.x, z: m.z, act: m.act };
        }));
        if (r.channel !== chName) { ch?.close(); chName = r.channel; ch = backend.liveChannel?.(r.channel, onMsg, { me: myId, onPeer }) ?? null; ch?.send({ t: 'nudge' }); }
        setLive(r);
      } catch { /* try again next beat */ }
    };
    const p = pulse(beat, () => false);
    soon.current = () => p.soon(0);
    // your position, a few times a second while it changes (and now and then while it doesn't)
    let lastKey = '', lastAt = 0;
    const tx = setInterval(() => {
      const ps = ref.current.scene.current?.pose(); if (!ps || !ch) return;
      const key = `${ps.x.toFixed(2)},${ps.z.toFixed(2)},${ps.face},${ref.current.act ?? ''}`, now = performance.now();
      if (key !== lastKey || now - lastAt > 6000) { lastKey = key; lastAt = now; ch.send({ t: 'pos', id: myId, x: ps.x, z: ps.z, f: ps.face, a: ref.current.act ?? null }); }
    }, 140);
    return () => { stopped = true; soon.current = null; p.stop(); clearInterval(tx); ch?.close(); ref.current.scene.current?.setOthers([]); void api.placeLeave().catch(() => {}); };
  }, [opts.place, opts.myId]);
  return live;
}
