// Every LANDVAS player confirms their email. A signed-in player whose email isn't confirmed yet (accounts from
// before confirmation was required) sees this screen instead of the game until they open a LANDVAS email link —
// on this device or any other: the screen checks by itself and unlocks the moment it's done.
// The server enforces the same rule on every game action (private.require_active_player).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check, LogOut, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { EmailStatus } from '../backend/types';
import { Button } from '../ui';
import { confettiCannons } from '../ui/confetti';

export const EMAIL_STATUS_KEY = ['email-status'] as const;

/** pages a player can open before confirming (the confirm link itself, password reset, the legal pages) */
export const EMAIL_EXEMPT = /^\/(auth\/confirm|reset-password|legal|brawl-demo)(\/|$)/;

const mustConfirm = (s: EmailStatus | undefined) => !!s && s.required && !s.verified;

/** the player's email status (fails open: if it can't be read, the server still enforces the rule) */
export function useEmailStatus(signedIn: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: EMAIL_STATUS_KEY,
    queryFn: api.myEmailStatus,
    enabled: signedIn,
    staleTime: 10 * 60_000,
    retry: 1,
    // while the screen is up, check every few seconds (the link may be opened on another device)
    refetchInterval: (query) => (mustConfirm(query.state.data as EmailStatus | undefined) ? 5000 : false),
  });
  // the server refused a game action for an unconfirmed email: look again now
  useEffect(() => {
    const on = () => void qc.invalidateQueries({ queryKey: EMAIL_STATUS_KEY });
    window.addEventListener('landvas:email-unverified', on);
    return () => window.removeEventListener('landvas:email-unverified', on);
  }, [qc]);
  return q;
}

/** true while this signed-in player has to confirm their email; celebrates the moment they do */
export function useEmailGate(signedIn: boolean) {
  const q = useEmailStatus(signedIn);
  const qc = useQueryClient();
  const gated = signedIn && mustConfirm(q.data);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !gated && signedIn && q.data?.verified) {
      confettiCannons();
      toast.success('Email confirmed — welcome back!', { description: 'Your plots, Ink and earnings are right where you left them.' });
      void qc.invalidateQueries(); // everything the server refused a moment ago
    }
    was.current = gated;
  }, [gated, signedIn, q.data?.verified, qc]);
  return { gated, status: q.data };
}

export function EmailGate({ status }: { status?: EmailStatus }) {
  const qc = useQueryClient();
  const b = getBackend();
  const email = status?.email ?? b.session()?.email ?? '';
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  const send = async () => {
    if (!email || !b.sendEmailConfirmation) return;
    setBusy(true); setNote(null);
    try {
      await b.sendEmailConfirmation(email);
      setSent(true); setCooldown(60);
      setNote({ tone: 'ok', text: `Sent to ${email}. It’s from LANDVAS (no-reply@landvas.app) — check spam or promotions too.` });
    } catch (err) {
      const ge = toGameError(err);
      if (ge.code === 'email_rate_limited') setCooldown(60);
      setNote({ tone: 'warn', text: ge.message });
    } finally { setBusy(false); }
  };
  const check = async () => {
    setChecking(true); setNote(null);
    try {
      const s = await qc.fetchQuery({ queryKey: EMAIL_STATUS_KEY, queryFn: api.myEmailStatus, staleTime: 0 });
      if (mustConfirm(s)) setNote({ tone: 'warn', text: 'Not confirmed yet — open the link in the email first, then come back.' });
    } catch (err) { setNote({ tone: 'warn', text: toGameError(err).message }); } finally { setChecking(false); }
  };

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg p-4" data-testid="email-gate">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(70%_60%_at_50%_0%,rgba(123,92,255,0.22),transparent_70%)]" />
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="glass relative grid w-full max-w-md justify-items-center gap-5 rounded-[28px] p-7 text-center">
        <img src="/brand/landvas-mark.svg" alt="LANDVAS" width={76} height={76} className="h-[76px] w-[76px]" />
        <div className="font-display text-[15px] font-black tracking-[0.16em]">LANDVAS</div>
        <motion.span initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 14 }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-2"><MailCheck className="h-6 w-6" /></motion.span>
        <div className="grid gap-1.5">
          <h1 className="font-display text-2xl font-black leading-tight">Confirm your email to keep playing</h1>
          <p className="text-sm leading-relaxed text-muted">
            We’ll email a one-tap link to <b className="break-all text-fg" data-testid="email-gate-address">{email || 'your address'}</b>. Open it on any device — this screen unlocks by itself.
          </p>
        </div>

        <div className="grid w-full gap-2.5">
          <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!email || cooldown > 0} onClick={send} data-testid="email-gate-send">
            {sent ? <><Check className="h-4 w-4" /> {cooldown > 0 ? `Sent — send again in ${cooldown}s` : 'Send it again'}</> : cooldown > 0 ? `Try again in ${cooldown}s` : 'Email me the link'}
          </Button>
          <Button variant="secondary" size="lg" className="w-full" loading={checking} onClick={check} data-testid="email-gate-check">
            <RefreshCw className="h-4 w-4" /> I’ve confirmed
          </Button>
        </div>

        {note && (
          <p role="status" data-testid="email-gate-note" className={note.tone === 'ok'
            ? 'w-full rounded-2xl border border-[#3DDC97]/30 bg-[#3DDC97]/10 px-3.5 py-2.5 text-[13px] leading-snug text-fg'
            : 'w-full rounded-2xl border border-[#FF9F1C]/35 bg-[#FF9F1C]/10 px-3.5 py-2.5 text-[13px] leading-snug text-fg'}>{note.text}</p>
        )}

        <p className="flex items-start gap-2 text-left text-[12.5px] leading-snug text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#3DDC97]" />
          <span>This keeps LANDVAS fair: every player and every invite is a real person. Your plots, Ink and earnings are safe.</span>
        </p>
        <button type="button" onClick={() => void b.signOut()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-faint hover:text-fg" data-testid="email-gate-signout">
          <LogOut className="h-3.5 w-3.5" /> Not your email? Sign out
        </button>
      </motion.div>
    </div>
  );
}
