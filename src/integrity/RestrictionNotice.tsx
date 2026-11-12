// What a restricted player sees: suspended (until when) or banned, the reason, the proof, what was taken back, and where to
// appeal. Suspensions and bans cover the whole app; a warning can be read and closed.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { fmt } from '../lib/utils';
import { Button } from '../ui';

type Restriction = { status: 'suspended' | 'banned' | 'warned'; until: string | null; reason: string | null; title: string | null; proof: string[];
  at: string | null; ink_removed: number; plots_removed: number; appeal_email: string };

export function RestrictionNotice() {
  const me = useOnboardedMe();
  const signedIn = !!me || !!getBackend().session();
  const q = useQuery({ queryKey: ['my-restriction'], queryFn: api.myRestriction, enabled: signedIn, refetchInterval: 5 * 60_000, staleTime: 60_000 });
  const [closed, setClosed] = useState<string | null>(null);
  const r = q.data as Restriction | null | undefined;
  if (!r || (r.status === 'warned' && closed === r.at)) return null;
  const until = r.until ? new Date(r.until) : null;
  const title = r.status === 'banned' ? 'Your account has been banned' : r.status === 'suspended' ? 'Your account is suspended' : 'A warning on your account';
  const subject = encodeURIComponent(`Appeal: ${me?.profile?.username ? `@${me.profile.username}` : 'my LANDVAS account'} (${r.status})`);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="restriction-title" data-testid="restriction-notice">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-hot/40 bg-bg-2 p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hot/15 text-hot"><ShieldAlert className="h-6 w-6" /></span>
          <div>
            <h2 id="restriction-title" className="font-display text-xl font-black">{title}</h2>
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
        <div className="mb-4 rounded-2xl border border-line p-3 text-sm">
          <div className="font-bold">Think this is a mistake?</div>
          <p className="text-muted">Email <a className="font-bold text-accent-2 underline" href={`mailto:${r.appeal_email}?subject=${subject}`} data-testid="restriction-appeal">{r.appeal_email}</a> with your username and why. We read every appeal.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status === 'warned'
            ? <Button onClick={() => setClosed(r.at)} data-testid="restriction-ok">I understand</Button>
            : <Button variant="secondary" onClick={() => void getBackend().signOut().then(() => location.assign('/'))} data-testid="restriction-signout">Sign out</Button>}
        </div>
      </div>
    </div>
  );
}
