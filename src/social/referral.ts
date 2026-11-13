import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { useEmailStatus } from '../app/EmailGate';
import { clearPendingReferral, pendingReferral } from './referralStore';

const DONE = 'landvas.ref.done';
const doneFor = (uid: string) => { try { return localStorage.getItem(DONE) === uid; } catch { return false; } };
const markDone = (uid: string) => { try { localStorage.setItem(DONE, uid); } catch { /* storage blocked */ } };

/**
 * Once a new player has a profile and a confirmed email, apply the invite code they arrived with: the one kept on
 * this device, or the one saved with their account at sign-up (so it still counts when they confirm their email,
 * and first play, on another phone or browser). The inviter's reward waits for the friend's confirmed email.
 */
export function useReferralRedeemer() {
  const me = useOnboardedMe();
  const email = useEmailStatus(!!me);
  const qc = useQueryClient();
  const busy = useRef(false);
  const uid = me?.user_id ?? null;
  const waiting = !email.data || (email.data.required && !email.data.verified);
  useEffect(() => {
    if (!me || !uid || busy.current || waiting) return;
    busy.current = true;
    void (async () => {
      const local = pendingReferral();
      const code = local ?? (doneFor(uid) ? null : await getBackend().signupReferral?.().catch(() => null) ?? null);
      if (!code) { if (!local) markDone(uid); return; }
      try {
        const r = await api.redeemReferral(code);
        qc.setQueryData(['referrals'], r);
        const who = r.referred_by?.player.username;
        toast.success(who ? `Invited by @${who}` : 'Invite code applied', { description: 'Thanks for joining! Your friend gets their reward as you play.' });
        clearPendingReferral(); markDone(uid);
      } catch (e) {
        const err = toGameError(e);
        // try again later (busy server, email not confirmed on the server yet)
        if (err.code === 'rate_limited' || err.code === 'unknown_error' || err.code === 'email_not_verified') { busy.current = false; return; }
        if (err.code === 'invalid_referral_code' && local) toast.error('That invite code didn’t work', { description: 'You can enter a code yourself on the Invite page.' });
        clearPendingReferral(); markDone(uid);
      }
    })();
  }, [me, uid, waiting, qc]);
}
