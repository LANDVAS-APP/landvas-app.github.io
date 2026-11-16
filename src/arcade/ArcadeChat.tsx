// Chat in the arcade: everyone in your room (up to 10 walking about), and your party wherever they are. What anyone
// in the room says pops up over their head in the hall. The Mirror Arcade has rooms (and a chat) of its own, and so
// does the Live Arena.
import type { RefObject } from 'react';
import { cn } from '../lib/utils';
import { ChatDock, type DockChannel } from '../party/ChatDock';
import { bubbleFor, type Talker } from '../party/chat';
import { useParty, usePartyUi } from '../party/party';
import { useArcadeChat, useArenaChat, usePartyChat } from '../party/usePartyChat';


export function ArcadeChatDock({ arcadeId, inRoom, myId, raised, side = 'front', arena = false, hall }: {
  arcadeId: string; inRoom: boolean; myId: string; raised: 'tall' | 'lobby' | 'near' | null;
  side?: 'front' | 'mirror'; arena?: boolean; hall?: RefObject<Talker | null>;
}) {
  const onLine = bubbleFor(hall, myId);
  const room = useArcadeChat(arcadeId, !arena && inRoom, { side, onLine });
  const arenaRoom = useArenaChat(arena && inRoom, { onLine });
  const party = usePartyChat({ onLine });
  const inParty = !!useParty().data?.group;
  const show = usePartyUi((s) => s.show);
  const label = arena ? 'Arena' : side === 'mirror' ? 'Mirror' : 'Arcade';
  const channels: DockChannel[] = [
    { id: 'arcade', label, chat: arena ? arenaRoom : room, placeholder: 'Say something to the room…',
      empty: arena ? 'Everyone in this arena room sees what you say here ⚔️' : side === 'mirror' ? 'Everyone through the glass here sees what you say 🪞' : 'Everyone in this room sees what you say here 🕹️',
      notHere: arena ? 'Step into the arena first — you’ll be in a room in a moment.' : 'Step into the arcade first — you’ll be in a room in a moment.' },
    ...(inParty ? [{ id: 'party', label: 'Party', chat: party, placeholder: 'Message your party…', empty: 'Only your party sees this — wherever they are.', notHere: 'You’re not in a party right now.' }] : []),
  ];
  return (
    <ChatDock channels={channels} myId={myId} onInvite={() => show('invite')} testid="arcade-chat"
      // above whatever's at the bottom: a match lobby (tall), the machine you're at, or the walking hint
      className={cn('absolute left-3 z-20 transition-[bottom]', raised === 'tall' ? 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+300px)]' : raised === 'lobby' ? 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+214px)]'
        : raised === 'near' ? 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+112px)]' : 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+60px)]')} />
  );
}
