// Group chat for your live group (up to 10) on a world (a tab in the planet's chat box, beside Global and Party): every
// message pops up as a speech bubble over the explorer who said it. When someone says something the server nudges the
// group's topic and phones fetch the new messages; a slow safety check catches anything missed.
import { live } from '../lib/poll';
import { useNudge } from '../lib/nudge';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../backend/api';
import type { PlanetChatMsg } from '../backend/types';
import type { PlanetScene } from './planet3d';

export function usePlanetChat(world: string, myId: string | undefined, enabled: boolean, scene: { current: PlanetScene | null }) {
  const [msgs, setMsgs] = useState<PlanetChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const last = useRef(0);
  const seen = useRef(new Set<number>());
  const first = useRef(true);
  const open = useRef(false);
  const sendRef = useRef<((m: unknown) => void) | null>(null);

  const add = useCallback((list: PlanetChatMsg[], bubbles: boolean, fromList = false) => {
    const fresh = list.filter((m) => m && typeof m.id === 'number' && !seen.current.has(m.id) && typeof m.body === 'string' && m.player?.id);
    if (!fresh.length) return;
    for (const m of fresh) {
      seen.current.add(m.id); if (fromList) last.current = Math.max(last.current, m.id); // only the list moves the cursor: a message of mine (or one sent live) mustn't skip ones before it
      if (bubbles) scene.current?.say(m.player.id === myId ? 'me' : m.player.id, m.body);
    }
    setMsgs((cur) => [...cur, ...fresh].sort((a, b) => a.id - b.id).slice(-40));
    if (!open.current) setUnread((u) => u + fresh.filter((m) => m.player.id !== myId).length);
  }, [scene, myId]);

  // the server nudges your group's topic when someone says something; the list call (filtered and checked) is
  // the only way messages get in
  const [shard, setShard] = useState<number | null>(null);
  useEffect(() => { setMsgs([]); setUnread(0); last.current = 0; seen.current = new Set(); first.current = true; setShard(null); }, [world]);
  const tick = useCallback(async () => {
    try {
      const r = await api.planetChatList(world, last.current);
      if (r.shard !== null) setShard(r.shard);
      // the backlog when you arrive goes in the box, without a cloud of old bubbles
      add(r.items, !first.current, true); first.current = false;
    } catch { /* next time */ }
  }, [world, add]);
  const nudge = useNudge(enabled && shard !== null ? `pc:${world}:${shard}` : null, tick,
    { enabled, safetyMs: live(60_000), fallbackMs: live(8000), gapMs: 1000 });
  // until we know our group, look every few seconds (you join one within moments of landing)
  useEffect(() => {
    if (!enabled || shard !== null) return;
    const t = setInterval(() => { if (!document.hidden) void tick(); }, 5000);
    return () => clearInterval(t);
  }, [enabled, shard, tick]);

  const send = useCallback(async (body: string) => {
    const m = await api.planetChatSend(world, body);
    add([m], true);
    sendRef.current?.({ t: 'chat', id: myId, m });
    return m;
  }, [world, myId, add]);

  return {
    msgs, unread, send, sendRef,
    // a group member says they just sent something: look now (what they sent isn't trusted as-is)
    onChat: () => nudge.current?.soon(0),
    setOpen: (o: boolean) => { open.current = o; if (o) setUnread(0); },
  };
}
