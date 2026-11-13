// /auth/confirm — where every LANDVAS email button lands (a landvas.app link, never the Supabase
// project's own address; see scripts/auth-emails.mjs). It checks the one-time code with Supabase
// Auth, then: confirmed → "You're in", sign-in link → the map, reset link → choose a new password,
// new email → done (or "now tap the other email" for the first half of a two-address change).
import { motion } from 'motion/react';
import { ArrowRight, Check, Mail, Smartphone, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { EMAIL_STATUS_KEY } from '../app/EmailGate';
import { config } from '../env';
import { linkKind, nextPath, parseEmailLink, type EmailLink } from '../lib/emailLink';
import { saveStorage } from '../lib/utils';
import { Button } from '../ui';
import { confettiCannons } from '../ui/confetti';

type State = { s: 'checking' } | { s: 'done' } | { s: 'half' } | { s: 'error'; msg: string; signedIn: boolean };

const COPY = {
  confirm: { title: 'You’re confirmed!', text: 'Your LANDVAS account is ready. Claim your first free plots, paint them, and start earning.', button: 'Start playing' },
  signin: { title: 'You’re in!', text: 'Your email is confirmed. Taking you to the map…', button: 'Go to the map' },
  reset: { title: 'Link checked', text: 'Taking you to choose a new password…', button: 'Choose a new password' },
  email_change: { title: 'Email updated', text: 'Your LANDVAS account now uses your new address.', button: 'Back to settings' },
} as const;

export function AuthConfirm() {
  const nav = useNavigate();
  const qc = useQueryClient();
  // read once: the code is removed from the address bar straight away
  const [link] = useState<EmailLink | null>(() => parseEmailLink(location.search));
  const [st, setSt] = useState<State>(() => link ? { s: 'checking' } : { s: 'error', msg: 'This link is incomplete. Open the newest email from LANDVAS and tap its button again.', signedIn: !!getBackend().session() });
  const ran = useRef(false);
  const kind = link ? linkKind(link.type) : 'confirm';

  useEffect(() => {
    if (!link || ran.current) return;
    ran.current = true; // a code works once: never send it twice (React dev mode runs effects twice)
    if (config.router === 'browser') history.replaceState(history.state, '', '/auth/confirm');
    const b = getBackend();
    if (!b.verifyEmailLink) { setSt({ s: 'error', msg: 'Email links only work on landvas.app.', signedIn: !!b.session() }); return; }
    b.verifyEmailLink(link.tokenHash, link.type).then(async ({ signedIn }) => {
      // this sign-in came from an email link: LANDVAS counts the email as confirmed (and any invite they came from)
      if (signedIn) await api.myEmailStatus().then((s) => qc.setQueryData(EMAIL_STATUS_KEY, s)).catch(() => {});
      if (kind === 'reset') return nav(nextPath(link.type), { replace: true });
      if (kind === 'email_change' && !signedIn) return setSt({ s: 'half' });
      saveStorage('landvas.welcomed', true);
      setSt({ s: 'done' });
      confettiCannons();
      if (kind === 'signin') setTimeout(() => nav(nextPath(link.type), { replace: true }), 2400);
    }).catch((err) => {
      setSt({ s: 'error', msg: toGameError(err).message, signedIn: !!b.session() });
    });
  }, [link, kind, nav, qc]);

  const go = (path: string) => nav(path, { replace: true });
  const copy = COPY[kind];

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg p-4" data-testid="auth-confirm" data-state={st.s}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(70%_60%_at_50%_0%,rgba(123,92,255,0.22),transparent_70%)]" />
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="glass relative grid w-full max-w-md justify-items-center gap-5 rounded-[28px] p-7 text-center">
        <motion.img
          src="/brand/landvas-mark.svg" alt="LANDVAS" width={76} height={76}
          className="h-[76px] w-[76px]"
          animate={st.s === 'checking' ? { scale: [1, 1.05, 1] } : { scale: 1 }}
          transition={st.s === 'checking' ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 260, damping: 14 }}
        />
        <div className="font-display text-[15px] font-black tracking-[0.16em]">LANDVAS</div>

        {st.s === 'checking' && (
          <div className="grid gap-2" role="status">
            <h1 className="font-display text-xl font-bold">Checking your link…</h1>
            <p className="text-sm text-muted">One moment.</p>
          </div>
        )}

        {st.s === 'done' && (
          <div className="grid w-full justify-items-center gap-4">
            <motion.span initial={{ scale: 0.4, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 13 }} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#3DDC97]/15 text-[#3DDC97]"><Check className="h-6 w-6" strokeWidth={3} /></motion.span>
            <div className="grid gap-1.5">
              <h1 className="font-display text-2xl font-black">{copy.title}</h1>
              <p className="text-sm leading-relaxed text-muted">{copy.text}</p>
            </div>
            <Button variant="primary" size="lg" className="w-full" onClick={() => go(nextPath(link!.type))} data-testid="auth-confirm-continue">{copy.button} <ArrowRight className="h-4 w-4" /></Button>
            {(kind === 'confirm' || kind === 'signin') && (
              <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2/50 px-3.5 py-3 text-left text-[13px] leading-snug text-muted">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" />
                <span>Using the LANDVAS app? Just head back to it — you’re all set there too.</span>
              </p>
            )}
          </div>
        )}

        {st.s === 'half' && (
          <div className="grid w-full justify-items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-2"><Mail className="h-6 w-6" /></span>
            <div className="grid gap-1.5">
              <h1 className="font-display text-2xl font-black">One more tap</h1>
              <p className="text-sm leading-relaxed text-muted">Now open the link we sent to your other email address to finish the change.</p>
            </div>
          </div>
        )}

        {st.s === 'error' && (
          <div className="grid w-full justify-items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FF9F1C]/15 text-[#FF9F1C]"><TriangleAlert className="h-6 w-6" /></span>
            <div className="grid gap-1.5">
              <h1 className="font-display text-xl font-bold">That link didn’t work</h1>
              <p className="text-sm leading-relaxed text-muted" data-testid="auth-confirm-error">
                {st.msg}{' '}
                {st.signedIn ? 'You’re signed in, so you can carry on playing.'
                  : kind === 'reset' ? 'Ask for a new reset link from the sign-in screen.'
                  : kind === 'confirm' ? 'If you already confirmed, just sign in.'
                  : 'Sign in, or ask for a new link.'}
              </p>
            </div>
            {st.signedIn
              ? <Button variant="primary" size="lg" className="w-full" onClick={() => go('/world')}>Keep playing <ArrowRight className="h-4 w-4" /></Button>
              : <Button variant="primary" size="lg" className="w-full" onClick={() => go('/welcome?mode=signin')}>{kind === 'reset' ? 'Get a new link' : 'Sign in'} <ArrowRight className="h-4 w-4" /></Button>}
          </div>
        )}
      </motion.div>
    </div>
  );
}
