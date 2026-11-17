// A player → Account: their email and sign-in, and the fixes staff can make (supabase/migrations/…_account_help.sql and
// the account-help Edge Function): send a password reset or sign-in link, change a mistyped email, mark it confirmed or
// ask them to confirm again, sign them out everywhere, and (owner) make a one-time link to copy.
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, KeyRound, Link2, LogOut, MailCheck, MailQuestion, PenLine, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { toGameError } from '../../../src/backend/backend';
import { Button, Dialog } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { accountHelp, portal, type AccountHelpBody, type AccountInfo } from '../../shared/api';
import { ago, date, dateTime } from '../../shared/format';
import { Badge, CopyText, Empty, KV, Panel, Q } from '../../shared/ui';

export const accountKey = (id: string) => ['portal', 'account', id] as const;
export const useAccount = (id: string) => useQuery({ queryKey: accountKey(id), queryFn: () => portal.account(id), refetchInterval: 30_000 });

const VIA: Record<string, string> = {
  magiclink: 'opened a sign-in link', otp: 'opened an email link', recovery: 'opened a password reset link', 'email/signup': 'tapped their sign-up link',
  invite: 'opened an invite link', email_change: 'confirmed an email change',
};
/** how their email came to count as confirmed, in words */
export function confirmedHow(a: AccountInfo) {
  if (!a.verified) return null;
  const v = a.verified_via;
  if (!v) return 'tapped their sign-up link';
  if (v.via === 'staff') return `marked confirmed by staff ${date(v.at)}`;
  const m = v.via.replace(/^(link|earlier):/, '');
  return `${VIA[m] ?? 'opened an email link'} ${date(v.at)}`;
}

/** confirmed / waiting / not yet, as a badge */
export function ConfirmBadge({ a }: { a: AccountInfo }) {
  if (a.verified) return <Badge tone="ok"><Check className="h-3 w-3" /> Confirmed</Badge>;
  if (a.recheck) return <Badge tone="warn">Asked to confirm</Badge>;
  return <Badge tone="warn">Not confirmed</Badge>;
}

const PROVIDERS: Record<string, string> = { email: 'Email', google: 'Google', apple: 'Apple', discord: 'Discord', github: 'GitHub' };
const HOW: Record<string, string> = { password: 'password', otp: 'email link', magiclink: 'email link', recovery: 'reset link', 'email/signup': 'sign-up link', oauth: 'Google/Apple', totp: 'authenticator', sso: 'SSO', anonymous: 'guest' };
const ACTION_WORDS: Record<string, string> = {
  account_send_reset: 'Sent a password reset link', account_send_link: 'Sent a sign-in link', account_change_email: 'Changed their email',
  account_confirm: 'Marked their email confirmed', account_recheck: 'Asked them to confirm their email', account_signout: 'Signed them out everywhere',
  account_make_link: 'Made a one-time link to copy',
};

type Ask = { title: string; body: ReactNode; confirm: string; danger?: boolean; reason: boolean; run(reason: string): Promise<unknown> };

export default function PlayerAccount({ id }: { id: string }) {
  const q = useAccount(id);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [link, setLink] = useState<{ url: string; kind: 'signin' | 'reset' } | null>(null);

  const run = async (key: string, body: Omit<AccountHelpBody, 'player'>) => {
    setBusy(key);
    try {
      const r = await accountHelp({ ...body, player: id });
      void qc.invalidateQueries({ queryKey: accountKey(id) });
      void qc.invalidateQueries({ queryKey: ['portal', 'player', id] });
      return r;
    } catch (e) {
      toast.error(toGameError(e).message);
      return null;
    } finally { setBusy(null); }
  };

  return (
    <Q q={q} label="Loading their account…">{(a) => {
      const send = async (key: 'send_reset' | 'send_link') => {
        const r = await run(key, { action: key });
        if (!r) return;
        toast.success(key === 'send_reset' ? 'Password reset link sent' : r.kind === 'signup' ? 'Sign-up confirmation sent again' : 'Sign-in link sent',
          { description: `To ${r.sent_to}. It’s from no-reply@landvas.app — they should check spam too.` });
      };
      const confirmAction = a.verified
        ? () => setAsk({
          title: 'Ask them to confirm their email again?', confirm: 'Ask them to confirm', reason: true,
          body: <>Their game will show <b>“Confirm your email to keep playing”</b> until they open a link we email to <b>{a.email}</b> now. Earlier proof stops counting.</>,
          run: async (reason) => {
            const r = await run('recheck', { action: 'recheck', reason });
            if (r) toast.success('They’ll be asked to confirm', { description: r.sent_to ? `Link sent to ${r.sent_to}.` : r.send_error ?? 'They can send the link themselves from the game.' });
          },
        })
        : () => setAsk({
          title: 'Mark their email confirmed?', confirm: 'Mark confirmed', reason: true,
          body: <>Only if you’ve checked <b>{a.email}</b> really is theirs. They can play straight away, and any invite rewards waiting on their confirmation are paid.</>,
          run: async (reason) => { if (await run('confirm', { action: 'confirm', reason })) toast.success('Email marked confirmed'); },
        });
      const signOut = () => setAsk({
        title: 'Sign them out everywhere?', confirm: 'Sign out everywhere', danger: true, reason: false,
        body: <>Ends all {a.sessions.length || ''} sign-in{a.sessions.length === 1 ? '' : 's'} on every phone and browser — for a lost phone, or someone else in their account. Each device is signed out as soon as its sign-in renews (within the hour). They sign in again with their password or an email link.</>,
        run: async (reason) => { const r = await run('signout', { action: 'signout', reason: reason || null }); if (r) toast.success(`Signed out of ${r.sessions ?? 0} sign-in${r.sessions === 1 ? '' : 's'}`); },
      });
      const makeLink = (kind: 'signin' | 'reset') => setAsk({
        title: kind === 'reset' ? 'Make a password reset link to copy?' : 'Make a sign-in link to copy?', confirm: 'Make the link', reason: true,
        body: <>For when our emails don’t reach them. <b>Anyone with this link can get into their account</b>, so only give it to the player themselves, privately. It works once, for about an hour, and the last link we emailed them stops working.</>,
        run: async (reason) => { const r = await run('make_link', { action: 'make_link', kind, reason }); if (r?.link) setLink({ url: r.link, kind }); },
      });

      return (
        <div className="grid gap-3">
          {a.recheck && (
            <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
              <MailQuestion className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <span>Waiting for them to confirm <b>{a.recheck.email ?? a.email}</b> — asked {ago(a.recheck.since)}{a.recheck.by ? ` by @${a.recheck.by}` : ''}. Their game asks them to until they open a LANDVAS email link.</span>
            </div>
          )}
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Email & sign-in" actions={<ConfirmBadge a={a} />}>
              <KV cols={1} items={[
                ['Email', a.email ? <CopyText text={a.email} label={a.email} /> : 'none'],
                ['Confirmed', a.verified ? confirmedHow(a) : a.recheck ? `asked again ${ago(a.recheck.since)}` : 'not yet'],
                ...(a.pending_email ? [['Change they asked for', <span key="p">{a.pending_email} <span className="text-faint">· waiting for them</span></span>] as [ReactNode, ReactNode]] : []),
                ['Signs in with', [...(a.has_password ? ['password'] : []), 'email links', ...a.providers.filter((p) => p !== 'email').map((p) => PROVIDERS[p] ?? p)].join(', ')],
                ['Last sign-in', a.last_sign_in_at ? `${dateTime(a.last_sign_in_at)} · ${ago(a.last_sign_in_at)}` : 'never'],
                ['Last sign-in or reset link sent', a.sent.link ? dateTime(a.sent.link) : '—'],
                ['Last sign-up confirmation sent', a.sent.confirmation ? dateTime(a.sent.confirmation) : '—'],
                ['Account made', date(a.created_at)],
                ...(a.banned_until && new Date(a.banned_until) > new Date() ? [['Sign-in blocked until', dateTime(a.banned_until)] as [ReactNode, ReactNode]] : []),
              ]} />
              {!a.required && <p className="mt-3 text-xs text-muted">Confirming isn’t required to play right now (Game settings → email_verification).</p>}
            </Panel>

            <Panel title="Email them a link">
              <div className="grid gap-2.5">
                <ActionRow icon={<KeyRound className="h-4 w-4" />} title="Password reset" sub={<>They choose a new password. Goes to <b className="text-fg">{a.email ?? '—'}</b>.</>}>
                  <Button size="sm" loading={busy === 'send_reset'} disabled={!a.email || !!busy} onClick={() => void send('send_reset')} data-testid="acct-send-reset">Send reset link</Button>
                </ActionRow>
                <ActionRow icon={<MailCheck className="h-4 w-4" />} title={a.auth_confirmed ? 'Sign-in link' : 'Sign-up confirmation'}
                  sub={a.auth_confirmed ? 'One tap signs them in — and confirms their email.' : 'They never tapped their sign-up email: this sends it again. Tapping it confirms them.'}>
                  <Button size="sm" loading={busy === 'send_link'} disabled={!a.email || !!busy} onClick={() => void send('send_link')} data-testid="acct-send-link">{a.auth_confirmed ? 'Send sign-in link' : 'Send it again'}</Button>
                </ActionRow>
                {a.can.link && (
                  <ActionRow icon={<Link2 className="h-4 w-4" />} title="A link to copy" sub="Owner only. For when our emails don’t reach them.">
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" disabled={!a.email || !!busy} onClick={() => makeLink('signin')} data-testid="acct-link-signin">Sign-in</Button>
                      <Button size="sm" variant="ghost" disabled={!a.email || !!busy} onClick={() => makeLink('reset')}>Reset</Button>
                    </div>
                  </ActionRow>
                )}
                <p className="text-xs text-faint">Each new link replaces the last one. Links work once, for about an hour. If they don’t see it, ask them to check spam or promotions.</p>
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <ChangeEmail a={a} busy={busy} run={run} />
            <Panel title="Other fixes">
              <div className="grid gap-2.5">
                <ActionRow icon={<ShieldCheck className="h-4 w-4" />} title={a.verified ? 'Ask them to confirm again' : 'Mark email confirmed'}
                  sub={a.verified ? 'If the address on file might not be theirs. Their game asks until they open a new link.' : 'If you’ve checked the address is theirs another way. They can play straight away.'}>
                  <Button size="sm" disabled={!a.can.confirm || !!busy || (a.verified && !a.email)} onClick={confirmAction} data-testid="acct-confirm">{a.verified ? 'Ask again' : 'Mark confirmed'}</Button>
                </ActionRow>
                <ActionRow icon={<LogOut className="h-4 w-4" />} title="Sign out everywhere" sub={`A lost phone, or someone else in their account. Signed in on ${a.sessions.length} device${a.sessions.length === 1 ? '' : 's'} now.`}>
                  <Button size="sm" variant="danger" loading={busy === 'signout'} disabled={!!busy} onClick={signOut} data-testid="acct-signout">Sign out</Button>
                </ActionRow>
                {!a.can.confirm && <p className="text-xs text-faint">{a.staff_target ? 'Only the owner can change a staff account’s confirmation.' : 'Only admins can change confirmation.'}</p>}
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title={`Signed in on (${a.sessions.length})`} pad={false}>
              {a.sessions.length ? (
                <div className="p-scroll"><table className="p-table">
                  <thead><tr><th>Device</th><th>How</th><th>Since</th><th>Last active</th></tr></thead>
                  <tbody>{a.sessions.map((s, i) => (
                    <tr key={i}><td>{s.device}{s.two_step && <Badge tone="ok" className="ml-1.5">two-step</Badge>}</td><td>{s.how.map((h) => HOW[h] ?? h).join(', ') || '—'}</td><td>{date(s.started_at)}</td><td>{ago(s.active_at)}</td></tr>
                  ))}</tbody>
                </table></div>
              ) : <div className="px-4 pb-4"><Empty title="Not signed in anywhere">They sign in again with their password or an email link.</Empty></div>}
            </Panel>
            <Panel title="Account help history">
              {a.history.length ? (
                <ol className="grid gap-2" data-testid="acct-history">{a.history.map((h) => (
                  <li key={h.id} className="rounded-xl border border-line/60 px-3 py-2 text-sm">
                    <div className="break-words">
                      <b className="font-semibold">{h.action === 'account_send_link' && h.details.kind === 'signup' ? 'Sent their sign-up confirmation again' : ACTION_WORDS[h.action] ?? h.action}</b>
                      {h.details.from && h.details.to ? <>: <span className="text-muted">{h.details.from}</span> → <b>{h.details.to}</b></> : h.details.to ? <span className="text-muted"> to {h.details.to}</span> : null}
                      {h.action === 'account_change_email' && <span className="text-muted"> · {h.details.then === 'confirmed' ? 'marked confirmed' : 'they confirm it'}</span>}
                      {h.details.sessions != null && <span className="text-muted"> · {h.details.sessions} sign-in{h.details.sessions === 1 ? '' : 's'}</span>}
                      {h.details.kind && h.action === 'account_make_link' && <span className="text-muted"> · {h.details.kind === 'reset' ? 'reset' : 'sign-in'}</span>}
                      {h.details.fresh_start_ink && <span className="text-ok"> · Fresh Start credit paid</span>}
                    </div>
                    {h.details.reason && <div className="mt-0.5 text-xs text-muted">“{h.details.reason}”</div>}
                    <div className="mt-0.5 text-xs text-faint">@{h.by ?? 'system'} · {dateTime(h.at)}</div>
                  </li>
                ))}</ol>
              ) : <Empty title="Nothing yet">Emails sent and changes made here show up in this list and the audit log.</Empty>}
            </Panel>
          </div>

          <AskDialog ask={ask} busy={!!busy} onClose={() => setAsk(null)} />
          <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)} title={link?.kind === 'reset' ? 'Password reset link' : 'Sign-in link'}
            description="Give this only to the player, privately. It works once, for about an hour."
            footer={<Button variant="primary" onClick={() => setLink(null)}>Done</Button>}>
            {link && (
              <div className="grid gap-2">
                <div className="break-all rounded-xl border border-line bg-surface/80 p-3 p-mono text-[12px]" data-testid="acct-link">{link.url}</div>
                <CopyText text={link.url} label="Copy the link" className="justify-self-start text-sm text-accent-2" />
              </div>
            )}
          </Dialog>
        </div>
      );
    }}</Q>
  );
}

function ActionRow({ icon, title, sub, children }: { icon: ReactNode; title: ReactNode; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-surface-2/30 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-2">{icon}</span>
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function AskDialog({ ask, busy, onClose }: { ask: Ask | null; busy: boolean; onClose(): void }) {
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const close = () => { setReason(''); onClose(); };
  const go = async () => {
    setWorking(true);
    try { await ask?.run(reason.trim()); close(); } finally { setWorking(false); }
  };
  const need = !!ask?.reason && reason.trim().length < 3;
  return (
    <Dialog open={!!ask} onOpenChange={(o) => !o && close()} title={ask?.title ?? ''}
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant={ask?.danger ? 'danger' : 'primary'} loading={working} disabled={need || busy} onClick={() => void go()} data-testid="acct-ask-go">{ask?.confirm}</Button></>}>
      <div className="grid gap-3">
        <div className="text-sm text-muted">{ask?.body}</div>
        <label className="grid gap-1.5">
          <span className="p-label">Reason{ask?.reason ? '' : ' (optional)'} — for the audit log</span>
          <input className="p-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. asked on Discord, checked their old email" data-testid="acct-ask-reason" />
        </label>
      </div>
    </Dialog>
  );
}

const looksLikeEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(s);

function ChangeEmail({ a, busy, run }: { a: AccountInfo; busy: string | null; run(key: string, body: Omit<AccountHelpBody, 'player'>): Promise<any> }) {
  const [email, setEmail] = useState('');
  const [again, setAgain] = useState('');
  const [then, setThen] = useState<'link' | 'confirmed'>('link');
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const clean = email.trim().toLowerCase();
  const problem = !clean ? null
    : !looksLikeEmail(clean) ? 'That doesn’t look like an email address.'
    : clean === (a.email ?? '').toLowerCase() ? 'That’s already their email.'
    : again.trim() && again.trim().toLowerCase() !== clean ? 'The two addresses don’t match.' : null;
  const ready = !!clean && !problem && again.trim().toLowerCase() === clean && reason.trim().length >= 3;

  if (!a.can.change) {
    return (
      <Panel title="Change their email">
        <p className="text-sm text-muted">{a.staff_target ? 'This is a staff account: only the owner can change its email.' : 'Only admins and the owner can change a player’s email. You can still email them a link.'}</p>
      </Panel>
    );
  }
  const go = async () => {
    const r = await run('change_email', { action: 'change_email', email: clean, then, reason: reason.trim() });
    setSure(false);
    if (!r) return;
    setEmail(''); setAgain(''); setReason('');
    const extra = r.fresh_start_ink ? ` Their Fresh Start credit (${Number(r.fresh_start_ink).toLocaleString()} Ink) for that address was paid too.` : '';
    if (then === 'confirmed') toast.success('Email changed and confirmed', { description: `They sign in with ${clean} from now on.${extra}` });
    else if (r.sent_to) toast.success('Email changed — link sent', { description: `They confirm ${clean} by opening the link we just sent there.${extra}` });
    else toast.warning('Email changed, but the link didn’t send', { description: `${r.send_error ?? ''} Use “Send sign-in link” in a minute.${extra}` });
  };
  return (
    <Panel title="Change their email">
      <div className="grid gap-3">
        <p className="text-sm text-muted">For a mistyped address, or one they can’t get into any more. Their password, plots and everything else stay the same; they sign in with the new address from now on.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5"><span className="p-label">New email</span>
            <input className="p-input" type="email" autoComplete="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" data-testid="acct-new-email" /></label>
          <label className="grid gap-1.5"><span className="p-label">Type it again</span>
            <input className="p-input" type="email" autoComplete="off" spellCheck={false} value={again} onChange={(e) => setAgain(e.target.value)} onPaste={(e) => e.preventDefault()} placeholder="to catch typos" data-testid="acct-new-email-again" /></label>
        </div>
        {problem && <p className="flex items-center gap-1.5 text-xs font-semibold text-warn"><AlertTriangle className="h-3.5 w-3.5" /> {problem}</p>}
        <div className="grid gap-2" role="radiogroup" aria-label="After the change">
          <Choice on={then === 'link'} onClick={() => setThen('link')} title="They confirm it (recommended)" testid="acct-then-link"
            sub="We email a link to the new address. Their game asks them to confirm until they open it — so you know the address works." />
          <Choice on={then === 'confirmed'} onClick={() => setThen('confirmed')} title="Mark it confirmed" testid="acct-then-confirmed"
            sub="You’ve checked it’s really theirs. No email is sent and they keep playing." />
        </div>
        <label className="grid gap-1.5"><span className="p-label">Reason — for the audit log</span>
          <input className="p-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. typo at sign-up, confirmed on Discord" data-testid="acct-change-reason" /></label>
        <div className="flex justify-end">
          <Button variant="primary" disabled={!ready || !!busy} onClick={() => setSure(true)} data-testid="acct-change"><PenLine className="h-4 w-4" /> Change email</Button>
        </div>
      </div>
      <Dialog open={sure} onOpenChange={setSure} title="Change their email?"
        footer={<><Button variant="ghost" onClick={() => setSure(false)}>Cancel</Button><Button variant="primary" loading={busy === 'change_email'} onClick={() => void go()} data-testid="acct-change-go">Change it</Button></>}>
        <div className="grid gap-2 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-muted">From</span><span className="break-all">{a.email ?? '—'}</span>
            <span className="text-muted">To</span><b className="break-all">{clean}</b>
          </div>
          <p className="text-muted">{then === 'link'
            ? <>We’ll email a link to <b>{clean}</b>. Until they open it, their game asks them to confirm their email.</>
            : <>Their email counts as confirmed straight away. Nothing is emailed.</>}</p>
        </div>
      </Dialog>
    </Panel>
  );
}

function Choice({ on, onClick, title, sub, testid }: { on: boolean; onClick(): void; title: string; sub: string; testid: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} data-testid={testid}
      className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition', on ? 'border-accent/60 bg-accent/10' : 'border-line/70 hover:border-line-strong')}>
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-accent bg-accent' : 'border-line-strong')}>{on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
      <span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted">{sub}</span></span>
    </button>
  );
}

