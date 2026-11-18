// A room's chat (your party, the arcade room you're in): the list call is the only way messages get in (filtered and
// checked on the server); the server nudges the room's topic when someone says something, and a slow safety check
// catches anything missed. Same pattern as planet, home and clan chat.
//
// A chat everybody is in (the global chat) can't work like that: every message would make every open map ask the
// database again — the load grows with the square of the players. There the server sends the line itself on a channel
// only it can post on (`lines`); the list is only asked for the backlog (on opening, coming back, reconnecting, and a
// slow safety check). If that channel can't be joined, or a line you sent never comes back on it, the chat goes back
// to the nudges for the visit.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackend } from '../backend/backend';
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
  /** lines arrive with the push on this server-only channel (see the top) */ lines?: { topic: string; event: string };
  /** lines from these players aren't shown (your blocks: the list leaves them out on the server) */ hide?: (playerId: string) => boolean;
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

  // lines with the push (when the room has them and the channel is up): no nudges to answer, a slow backlog check
  const [pushed, setPushedState] = useState(false);
  const pushedRef = useRef(false);
  const setPushed = (on: boolean) => { pushedRef.current = on; if (!on) armed.current = false; setPushedState(on); };
  const broken = useRef(false);
  const echo = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const heard = useRef(new Set<number>()); // ids that came on the push channel (a line can beat its own send's answer)
  // missed-line check: once live, the first backlog sets the mark; a later backlog holding lines newer than the mark
  // that never came on the channel (leaving out the newest few, which may still be on their way) means it isn't
  // delivering — back to the nudges for this visit
  const armed = useRef(false);
  const mark = useRef(0);

  const tick = useCallback(async () => {
    if (!key) return;
    try {
      const r = await ref.current.list(last.current);
      setTopic(r.topic);
      if (pushedRef.current && !broken.current) {
        const ids = r.items.map((m) => m.id).filter((id) => typeof id === 'number').sort((a, b) => a - b);
        if (!armed.current) { armed.current = true; mark.current = Math.max(last.current, ids[ids.length - 1] ?? 0); }
        else if (ids.slice(0, Math.max(0, ids.length - 3)).some((id) => id > mark.current && !seen.current.has(id))) {
          broken.current = true; setPushed(false);
        }
      }
      add(r.items, true, first.current);
      first.current = false;
    } catch { /* next time */ }
  }, [key, add]); // eslint-disable-line react-hooks/exhaustive-deps
  const nudge = useNudge(key && topic && !pushed ? topic : null, tick, { enabled: !!key, safetyMs: pushed ? live(120_000) : live(45_000), fallbackMs: live(6000), gapMs: opts.gapMs ?? 900 });
  const linesTopic = opts.lines?.topic ?? null, linesEvent = opts.lines?.event ?? 'line';
  useEffect(() => {
    const b = getBackend();
    if (!key || !linesTopic || !b.serverChannel || broken.current) return;
    let wasLive = false;
    const ch = b.serverChannel(linesTopic, linesEvent, (raw) => {
      const m = raw as PlanetChatMsg;
      if (!m || typeof m.id !== 'number') return;
      heard.current.add(m.id);
      if (heard.current.size > 500) heard.current = new Set([...heard.current].slice(-200));
      const t = echo.current.get(m.id);
      if (t) { clearTimeout(t); echo.current.delete(m.id); }
      if (m.player?.id && ref.current.hide?.(m.player.id)) return;
      add([m], false, false);
    }, (isLive) => {
      if (broken.current) return;
      setPushed(isLive);
      // (re)connected: fetch what was said while it was down
      if (isLive && !wasLive) nudge.current?.soon(0);
      wasLive = isLive;
    });
    return () => { ch.close(); setPushed(false); for (const t of echo.current.values()) clearTimeout(t); echo.current.clear(); };
  }, [key, linesTopic, linesEvent, add]); // eslint-disable-line react-hooks/exhaustive-deps
  // until the server says where to listen (you've only just walked in), look every few seconds
  useEffect(() => {
    if (!key || topic) return;
    const t = setInterval(() => { if (!isAway()) void tick(); }, 5000);
    return () => clearInterval(t);
  }, [key, topic, tick]);

  const send = useCallback(async (body: string, replyTo?: number | null) => {
    const m = await ref.current.send(body, replyTo);
    add([m], false, true);
    // your own line should come back on the push channel; if it doesn't, the channel isn't delivering: use the nudges
    if (pushed && typeof m?.id === 'number' && !heard.current.has(m.id)) {
      echo.current.set(m.id, setTimeout(() => { echo.current.delete(m.id); broken.current = true; setPushed(false); nudge.current?.soon(0); }, 10_000));
    }
    ref.current.onLine?.(m); // (your own line pops up over you too)
    return m;
  }, [add, pushed]); // eslint-disable-line react-hooks/exhaustive-deps

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
