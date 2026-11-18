// A room's chat (your party, the arcade room you're in): the list call is the only way messages get in (filtered and
// checked on the server); the server nudges the room's topic when someone says something, and a slow safety check
// catches anything missed. Same pattern as planet, home and clan chat.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlanetChatMsg } from '../backend/types';
import { live } from '../lib/poll';
import { useNudge } from '../lib/nudge';
import { isAway } from '../lib/away';

export type RoomChat = {
  msgs: PlanetChatMsg[]; unread: number; ready: boolean;
  /** `replyTo`: the message this answers (the global chat takes replies; other rooms ignore it) */
  send(body: string, replyTo?: number | null): Promise<PlanetChatMsg>;
  setOpen(open: boolean): void;
};

export function useRoomChat(opts: {
  /** a new key starts the chat over (another party, another arcade); null: no chat */ key: string | null;
  list(after: number): Promise<{ items: PlanetChatMsg[]; topic: string | null }>;
  send(body: string, replyTo?: number | null): Promise<PlanetChatMsg>;
  myId?: string;
  /** a new message came in, or you sent one (not the backlog) */ onLine?(m: PlanetChatMsg): void;
  /** at most one look per this long, however many nudges (a busy room: the global chat) */ gapMs?: number;
}): RoomChat {
  const { key, myId } = opts;
  const [msgs, setMsgs] = useState<PlanetChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [topic, setTopic] = useState<string | null>(null);
  const last = useRef(0);
  const seen = useRef(new Set<number>());
  const first = useRef(true);
  const open = useRef(false);
  const ref = useRef(opts); ref.current = opts;

  useEffect(() => { setMsgs([]); setUnread(0); setTopic(null); last.current = 0; seen.current = new Set(); first.current = true; }, [key]);

  const add = useCallback((list: PlanetChatMsg[], fromList: boolean, backlog: boolean) => {
    const fresh = list.filter((m) => m && typeof m.id === 'number' && !seen.current.has(m.id) && typeof m.body === 'string' && m.player?.id);
    if (!fresh.length) return;
    for (const m of fresh) {
      seen.current.add(m.id);
      // only the list moves the cursor: a message of mine mustn't skip ones sent just before it
      if (fromList) last.current = Math.max(last.current, m.id);
      if (!backlog) ref.current.onLine?.(m);
    }
    setMsgs((cur) => [...cur, ...fresh].sort((a, b) => a.id - b.id).slice(-60));
    if (!open.current && !backlog) setUnread((u) => u + fresh.filter((m) => m.player.id !== myId && (m.kind ?? 'chat') === 'chat').length);
  }, [myId]);

  const tick = useCallback(async () => {
    if (!key) return;
    try {
      const r = await ref.current.list(last.current);
      setTopic(r.topic);
      add(r.items, true, first.current);
      first.current = false;
    } catch { /* next time */ }
  }, [key, add]);

  useNudge(key && topic ? topic : null, tick, { enabled: !!key, safetyMs: live(45_000), fallbackMs: live(6000), gapMs: opts.gapMs ?? 900 });
  // until the server says where to listen (you've only just walked in), look every few seconds
  useEffect(() => {
    if (!key || topic) return;
    const t = setInterval(() => { if (!isAway()) void tick(); }, 5000);
    return () => clearInterval(t);
  }, [key, topic, tick]);

  const send = useCallback(async (body: string, replyTo?: number | null) => {
    const m = await ref.current.send(body, replyTo);
    add([m], false, true);
    ref.current.onLine?.(m); // (your own line pops up over you too)
    return m;
  }, [add]);

  return {
    msgs, unread, ready: !!topic, send,
    setOpen: (o: boolean) => { open.current = o; if (o) setUnread(0); },
  };
}

/** a place people walk about in (a house, an arcade, a game) that can show a speech bubble over someone (their id, or 'me') */
export type Talker = { say(id: string, text: string): void };

/** what someone said, over their head (chat lines only — not "joined the party") */
export const bubbleFor = (scene: { current: Talker | null } | undefined, myId: string | undefined) => (m: PlanetChatMsg) => {
  if ((m.kind ?? 'chat') !== 'chat' || !m.player?.id) return;
  scene?.current?.say(m.player.id === myId ? 'me' : m.player.id, m.body);
};
