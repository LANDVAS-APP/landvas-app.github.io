// Chat in any place: the global chat, your party wherever they are, and everyone in your room of this place. What
// anyone in the room says pops up over their head (the scene's speech bubbles).
import type { RefObject } from 'react';
import { api } from '../backend/api';
import { cn } from '../lib/utils';
import { useOnboardedMe } from '../lib/queries';
import { ChatDock, globalChannel, partyChannel, type DockChannel } from '../party/ChatDock';
import { bubbleFor, useRoomChat, type Talker } from '../party/chat';
import { useParty, usePartyUi } from '../party/party';
import { useGlobalChat, usePartyChat } from '../party/usePartyChat';

export function PlaceChatDock({ place, label, inRoom, myId, scene, raised, emoji = '💬' }: {
  place: string; label: string; inRoom: boolean; myId: string; scene: RefObject<Talker | null>; raised: boolean; emoji?: string;
}) {
  const me = useOnboardedMe();
  const onLine = bubbleFor(scene, myId);
  const room = useRoomChat({
    key: inRoom ? `place:${place}` : null,
    list: (after) => api.placeChatList(place, after),
    send: (body) => api.placeChatSend(place, body),
    myId: me?.user_id, onLine,
  });
  const party = usePartyChat({ onLine });
  const global = useGlobalChat({ onLine });
  const inParty = !!useParty().data?.group;
  const show = usePartyUi((s) => s.show);
  const channels: DockChannel[] = [
    ...globalChannel(global),
    ...partyChannel(party, inParty),
    { id: 'place', label, chat: room, placeholder: 'Say something to the room…',
      empty: `Everyone in this room sees what you say here ${emoji}`, notHere: 'Step inside first — you’ll be in a room in a moment.' },
  ];
  return (
    <ChatDock channels={channels} myId={myId} onInvite={() => show('invite')} testid="place-chat"
      className={cn('absolute left-3 z-20 transition-[bottom]', raised ? 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+124px)]' : 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+60px)]')} />
  );
}
