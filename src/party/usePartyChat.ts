// The chats every chat box offers: the global chat (everyone playing), your party's (members only; it starts from when
// you joined), and the room you're in (an arcade's, the Live Arena's).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { useRoomChat } from './chat';
import { useParty } from './party';

export function usePartyChat(opts: { onLine?: Parameters<typeof useRoomChat>[0]['onLine'] } = {}) {
  const me = useOnboardedMe();
  const g = useParty().data?.group ?? null;
  return useRoomChat({ key: g ? `party:${g.id}` : null, list: api.partyChatList, send: api.partyChatSend, myId: me?.user_id, onLine: opts.onLine });
}

type OnLine = Parameters<typeof useRoomChat>[0]['onLine'];

/** the chat in the arcade room you're in (everyone there, not just your party; the mirror side has its own rooms) */
export function useArcadeChat(arcadeId: string, inRoom: boolean, opts: { side?: 'front' | 'mirror'; onLine?: OnLine } = {}) {
  const me = useOnboardedMe();
  return useRoomChat({
    key: inRoom ? `arcade:${arcadeId}:${opts.side ?? 'front'}` : null,
    list: (after) => api.arcadeChatList(arcadeId, after),
    send: (body) => api.arcadeChatSend(arcadeId, body),
    myId: me?.user_id, onLine: opts.onLine,
  });
}

/** the chat in the Live Arena room you're in */
export function useArenaChat(inRoom: boolean, opts: { onLine?: OnLine } = {}) {
  const me = useOnboardedMe();
  return useRoomChat({ key: inRoom ? 'arena' : null, list: api.arenaChatList, send: api.arenaChatSend, myId: me?.user_id, onLine: opts.onLine });
}

/** the global chat (everyone playing LANDVAS; the Social page's chat), as a tab in every chat box. `enabled`: the
    global switch (staff can turn it off) */
export function useGlobalChat(opts: { onLine?: OnLine } = {}) {
  const me = useOnboardedMe();
  const [enabled, setEnabled] = useState(true);
  // players you've blocked: the list leaves them out on the server; pushed lines are filtered here
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: api.myBlocks, enabled: !!me, staleTime: 10 * 60_000 });
  const blocked = new Set((blocks.data ?? []).map((p) => p.id));
  const chat = useRoomChat({
    key: me ? 'global' : null,
    list: async (after) => { const r = await api.globalChatList(after); setEnabled(r.enabled); return r; },
    send: api.globalChatSend, myId: me?.user_id, onLine: opts.onLine,
    // (everyone's in it: one look every couple of seconds at most, however busy)
    gapMs: 2000,
    // the lines themselves come on a channel only the server posts on (no database call per message per player)
    lines: { topic: 'global-chat:lines', event: 'line' },
    hide: (id) => blocked.has(id),
  });
  return { ...chat, enabled: enabled && !!me };
}
