import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { FriendStatus, FriendsList } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { Button, useConfirm } from '../ui';

/** Where you stand with a player, from your friend list (friends, and requests both ways). */
export function friendStatusFrom(list: FriendsList, playerId: string): FriendStatus {
  if (list.friends.some((f) => f.player.id === playerId)) return 'friends';
  if (list.incoming.some((f) => f.player.id === playerId)) return 'incoming';
  if (list.outgoing.some((f) => f.player.id === playerId)) return 'outgoing';
  return 'none';
}

/** Add / accept / remove a friend. Hidden on your own profile and when signed out. */
export function FriendButton({ playerId, username, size = 'sm' }: { playerId: string; username: string; size?: 'sm' | 'md' }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  // every button reads the one friend list the app already keeps (friends, and requests both ways), instead of each
  // asking the server about its own player
  const q = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, staleTime: 60_000 });
  const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState<FriendStatus | null>(null); // what the last button press made it, until the list catches up
  if (!me || me.profile.id === playerId || !q.data) return null;
  const status: FriendStatus = after ?? friendStatusFrom(q.data, playerId);
  const act = async (fn: () => Promise<{ status: FriendStatus }>, ok?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      setAfter(r.status);
      await qc.invalidateQueries({ queryKey: ['friends'] });
      setAfter(null);
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setBusy(false);
    }
  };
  if (status === 'friends') {
    return (
      <Button size={size} variant="secondary" loading={busy} data-testid="friend-button" onClick={async () => {
        if (await confirm({ title: `Remove @${username} from friends?`, body: 'You can send a new request any time.', confirm: 'Remove friend' })) void act(() => api.friendRemove(playerId), 'Friend removed');
      }}><Check className="h-4 w-4 text-ok" /> Friends</Button>
    );
  }
  if (status === 'incoming') {
    return (
      <span className="flex gap-1.5">
        <Button size={size} variant="primary" loading={busy} data-testid="friend-accept" onClick={() => act(() => api.friendRespond(playerId, true), `You and @${username} are friends`)}><UserPlus className="h-4 w-4" /> Accept</Button>
        <Button size={size} variant="ghost" disabled={busy} aria-label="Decline friend request" onClick={() => act(() => api.friendRespond(playerId, false))}><X className="h-4 w-4" /></Button>
      </span>
    );
  }
  if (status === 'outgoing') {
    return (
      <Button size={size} variant="ghost" loading={busy} data-testid="friend-button" title="Cancel request" onClick={() => act(() => api.friendRemove(playerId), 'Request cancelled')}>
        <Clock className="h-4 w-4" /> Requested
      </Button>
    );
  }
  return (
    <Button size={size} variant="primary" loading={busy} data-testid="friend-button" onClick={() => act(() => api.friendRequest(playerId), `Friend request sent to @${username}`)}>
      <UserPlus className="h-4 w-4" /> Add friend
    </Button>
  );
}

