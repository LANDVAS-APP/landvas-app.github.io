// Your party's chat (members only; it starts from when you joined). Used by the Party page, the map and arcades.
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
