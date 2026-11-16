// Chat in the arcade: everyone in your room (up to 10 walking about), and your party wherever they are.
import { cn } from '../lib/utils';
import { ChatDock, type DockChannel } from '../party/ChatDock';
import { useParty, usePartyUi } from '../party/party';
import { useArcadeChat, usePartyChat } from '../party/usePartyChat';

export function ArcadeChatDock({ arcadeId, inRoom, myId, raised }: { arcadeId: string; inRoom: boolean; myId: string; raised: boolean }) {
  const room = useArcadeChat(arcadeId, inRoom);
  const party = usePartyChat();
  const inParty = !!useParty().data?.group;
  const show = usePartyUi((s) => s.show);
  const channels: DockChannel[] = [
    { id: 'arcade', label: 'Arcade', chat: room, placeholder: 'Say something to the room…', empty: 'Everyone in this room sees what you say here 🕹️', notHere: 'Step into the arcade first — you’ll be in a room in a moment.' },
    ...(inParty ? [{ id: 'party', label: 'Party', chat: party, placeholder: 'Message your party…', empty: 'Only your party sees this — wherever they are.', notHere: 'You’re not in a party right now.' }] : []),
  ];
  return (
    <ChatDock channels={channels} myId={myId} onInvite={() => show('invite')} testid="arcade-chat"
      className={cn('absolute left-3 z-20 transition-[bottom]', raised ? 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+112px)]' : 'bottom-[calc(max(20px,env(safe-area-inset-bottom,0px))+60px)]')} />
  );
}
