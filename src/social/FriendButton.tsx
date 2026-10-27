import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { FriendStatus } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { Button, useConfirm } from '../ui';

/** Add / accept / remove a friend. Hidden on your own profile and when signed out. */
export function FriendButton({ playerId, username, size = 'sm' }: { playerId: string; username: string; size?: 'sm' | 'md' }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['friend', playerId], queryFn: () => api.friendStatus(playerId), enabled: !!me && me.profile.id !== playerId });
  const [busy, setBusy] = useState(false);
  if (!me || me.profile.id === playerId || !q.data) return null;
  const status: FriendStatus = q.data.status;
  const act = async (fn: () => Promise<{ status: FriendStatus }>, ok?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      qc.setQueryData(['friend', playerId], r);
      void qc.invalidateQueries({ queryKey: ['friends'] });
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

