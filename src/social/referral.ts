import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { clearPendingReferral, pendingReferral } from './referralStore';

/** Once a new player has a profile, apply the invite code they arrived with. */
export function useReferralRedeemer() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const busy = useRef(false);
  useEffect(() => {
    if (!me || busy.current) return;
    const code = pendingReferral();
    if (!code) return;
    busy.current = true;
    api.redeemReferral(code)
      .then((r) => {
        qc.setQueryData(['referrals'], r);
        const who = r.referred_by?.player.username;
        toast.success(who ? `Invited by @${who}` : 'Invite code applied', { description: 'Thanks for joining! Your friend gets their reward as you play.' });
        clearPendingReferral();
      })
      .catch((e) => {
        const err = toGameError(e);
        if (err.code === 'rate_limited' || err.code === 'unknown_error') { busy.current = false; return; }
        if (err.code === 'invalid_referral_code') toast.error('That invite code didn’t work', { description: 'You can enter a code yourself on the Invite page.' });
        clearPendingReferral();
      });
  }, [me, qc]);
}
