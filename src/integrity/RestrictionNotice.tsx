// What a restricted player sees: suspended (until when) or banned, the reason, the proof, what was taken back, and where to
// appeal. Suspensions and bans cover the whole app; a warning can be read and closed.
import { useQuery } from '@tanstack/react-query';
import * as RDialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { fmt } from '../lib/utils';
import { Button, inputCls, Spinner } from '../ui';
import { toast } from 'sonner';
import { toGameError } from '../backend/backend';
import { cn, timeAgo } from '../lib/utils';

type Restriction = { status: 'suspended' | 'banned' | 'warned'; until: string | null; reason: string | null; title: string | null; proof: string[];
  at: string | null; ink_removed: number; plots_removed: number; appeal: { id: string; status: 'open' | 'answered' | 'closed'; created_at: string } | null };

export function RestrictionNotice() {
  const me = useOnboardedMe();
  const signedIn = !!me || !!getBackend().session();
  const q = useQuery({ queryKey: ['my-restriction'], queryFn: api.myRestriction, enabled: signedIn, refetchInterval: 5 * 60_000, staleTime: 60_000 });
  const [closed, setClosed] = useState<string | null>(null);
  const r = q.data as Restriction | null | undefined;
  if (!r || (r.status === 'warned' && closed === r.at)) return null;
  const until = r.until ? new Date(r.until) : null;
  const title = r.status === 'banned' ? 'Your account has been banned' : r.status === 'suspended' ? 'Your account is suspended' : 'A warning on your account';
  return (
    // a real modal, so it sits above anything else that's open and keeps focus; it can't be dismissed (except a warning)
    <RDialog.Root open onOpenChange={() => {}}>
      <RDialog.Portal>
      <RDialog.Overlay className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm" style={{ pointerEvents: 'auto' }} />
      <RDialog.Content aria-describedby={undefined} onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}
        style={{ pointerEvents: 'auto' }} className="fixed left-1/2 top-1/2 z-[201] max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-hot/40 bg-bg-2 p-5 shadow-2xl" data-testid="restriction-notice">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hot/15 text-hot"><ShieldAlert className="h-6 w-6" /></span>
          <div>
            <RDialog.Title className="font-display text-xl font-black">{title}</RDialog.Title>
            {r.status === 'suspended' && until && <p className="text-sm text-muted" data-testid="restriction-until">until {until.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}
          </div>
        </div>
        {r.title && <div className="mb-1 text-xs font-black uppercase tracking-wide text-hot">{r.title}</div>}
        {r.reason && <p className="mb-3 text-sm leading-relaxed" data-testid="restriction-reason">{r.reason}</p>}
        {r.proof?.length > 0 && (
          <div className="mb-3 rounded-2xl bg-surface-2/70 p-3">
            <div className="mb-1 text-xs font-bold text-muted">Why</div>
            <ul className="grid list-disc gap-1 pl-4 text-sm" data-testid="restriction-proof">{r.proof.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}
        {(r.ink_removed > 0 || r.plots_removed > 0) && (
          <p className="mb-3 text-sm text-muted">Taken back: {[r.ink_removed > 0 && `${fmt(r.ink_removed)} Ink`, r.plots_removed > 0 && `${fmt(r.plots_removed)} plot${r.plots_removed === 1 ? '' : 's'} bought with it`].filter(Boolean).join(' and ')}.</p>
        )}
        {r.status !== 'warned' && <Appeal r={r} username={me?.profile?.username} onSent={() => void q.refetch()} />}
        <div className="flex flex-wrap gap-2">
          {r.status === 'warned'
            ? <Button onClick={() => setClosed(r.at)} data-testid="restriction-ok">I understand</Button>
            : <Button variant="secondary" onClick={() => void getBackend().signOut().then(() => location.assign('/'))} data-testid="restriction-signout">Sign out</Button>}
        </div>
      </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** the one thing a restricted player can do: appeal, through a support ticket, and follow it */
function Appeal({ r, username, onSent }: { r: Restriction; username?: string; onSent(): void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useQuery({ queryKey: ['appeal', r.appeal?.id], queryFn: () => api.supportTicket(r.appeal!.id), enabled: !!r.appeal, refetchInterval: 60_000 });
  const send = async () => {
    setBusy(true);
    try {
      if (r.appeal) { await api.supportReply(r.appeal.id, text.trim()); void t.refetch(); }
      else { await api.supportCreate(`Appeal: ${username ? `@${username}` : 'my account'} (${r.status})`, 'appeal', text.trim()); onSent(); }
      setText(''); toast.success(r.appeal ? 'Sent' : 'Appeal sent — we’ll answer here');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const status = r.appeal?.status;
  return (
    <div className="mb-4 grid gap-2 rounded-2xl border border-line p-3 text-sm" data-testid="restriction-appeal">
      <div className="flex items-center gap-2">
        <span className="font-bold">{r.appeal ? 'Your appeal' : 'Think this is a mistake?'}</span>
        {status && <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-black uppercase', status === 'answered' ? 'bg-ok/20 text-ok' : status === 'closed' ? 'bg-surface-2 text-muted' : 'bg-accent/20 text-accent-2')} data-testid="appeal-status">{status === 'answered' ? 'Answered' : status === 'closed' ? 'Closed' : 'Waiting for the team'}</span>}
      </div>
      {!r.appeal && <p className="text-muted">Tell the LANDVAS team why. Your appeal goes to support and they’ll answer right here.</p>}
      {r.appeal && (t.isLoading ? <Spinner /> : (
        <div className="grid max-h-48 gap-1.5 overflow-y-auto" data-testid="appeal-thread">
          {(t.data?.thread ?? []).map((m) => (
            <div key={m.id} className={cn('rounded-xl px-2.5 py-1.5', m.is_staff ? 'bg-accent/15' : 'bg-surface-2/70')}>
              <div className="text-[10.5px] font-bold text-muted">{m.is_staff ? 'LANDVAS team' : 'You'} · {timeAgo(m.created_at)}</div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
          ))}
        </div>
      ))}
      {status !== 'closed' && <>
        <textarea className={cn(inputCls, 'h-24 py-2 text-sm')} maxLength={2000} placeholder={r.appeal ? 'Add something to your appeal…' : 'Explain what happened…'} value={text} onChange={(e) => setText(e.target.value)} data-testid="appeal-text" />
        <Button disabled={busy || text.trim().length < 10} loading={busy} onClick={() => void send()} data-testid="appeal-send">{r.appeal ? 'Send' : 'Send my appeal'}</Button>
      </>}
    </div>
  );
}
