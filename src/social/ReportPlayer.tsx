// Report a player: their name, picture, plot names, creatures or home, or how they behave. Every kind of player
// content can be reported (App Store guideline 1.2), not only a chat line or an artwork. Opens from a profile or the
// player card; one sheet for the whole app (mounted once next to the player card host).
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { cn } from '../lib/utils';
import { Button, Dialog, inputCls } from '../ui';

type Reason = Parameters<typeof api.reportPlayer>[1];
const REASONS: [Reason, string, string][] = [
  ['name', 'Offensive name', 'Their username or display name'],
  ['picture', 'Offensive picture', 'Their profile picture or explorer'],
  ['content', 'Offensive plots or creations', 'Plot names, art, Inkborn, home, clan or party names'],
  ['harassment', 'Harassment or bullying', 'Threats, hate or targeting someone'],
  ['personal_info', 'Sharing personal information', 'Someone’s address, phone or real name'],
  ['cheating', 'Cheating', 'Bots, multiple accounts or exploits'],
  ['spam', 'Spam or scams', 'Ads, links or begging'],
  ['other', 'Something else', 'Tell us below'],
];

const useReport = create<{ who: { id: string; username: string } | null; open(who: { id: string; username: string }): void; close(): void }>((set) => ({
  who: null, open: (who) => set({ who }), close: () => set({ who: null }),
}));
export const openReportPlayer = (who: { id: string; username: string }) => useReport.getState().open(who);

/** A small "Report" button for a profile or a player card. */
export function ReportPlayerButton({ id, username, className, label = 'Report' }: { id: string; username: string; className?: string; label?: string }) {
  return (
    <button type="button" className={cn('inline-flex items-center gap-1', className)} onClick={() => openReportPlayer({ id, username })} data-testid="report-player">
      <Flag className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

export function ReportPlayerHost() {
  const who = useReport((s) => s.who);
  const close = useReport((s) => s.close);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const done = () => { close(); setReason(null); setDetails(''); };
  const send = async () => {
    if (!who || !reason) return;
    setBusy(true);
    try {
      await api.reportPlayer(who.id, reason, details.trim() || undefined);
      toast.success('Thanks — a moderator will take a look', { description: 'You can also block them so you don’t see their messages or art.' });
      done();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!who} onOpenChange={(o) => { if (!o) done(); }} title={who ? `Report @${who.username}` : 'Report'}
      description="Reports go to our moderators and stay private: they’re never told who reported them.">
      <div className="grid gap-1.5" role="radiogroup" aria-label="What’s wrong" data-testid="report-player-sheet">
        {REASONS.map(([id, title, hint]) => (
          <button key={id} type="button" role="radio" aria-checked={reason === id} onClick={() => setReason(id)} data-testid={`report-reason-${id}`}
            className={cn('flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
              reason === id ? 'border-accent bg-accent/15' : 'border-line bg-surface/60 hover:bg-surface-2')}>
            <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', reason === id ? 'border-accent' : 'border-line-strong')}>
              {reason === id && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
            </span>
            <span className="min-w-0"><b className="block text-sm">{title}</b><span className="block text-xs text-muted">{hint}</span></span>
          </button>
        ))}
        <textarea className={cn(inputCls, 'mt-1 h-20 resize-none py-2')} maxLength={1000} placeholder="Anything that helps (optional)" value={details}
          onChange={(e) => setDetails(e.target.value)} data-testid="report-player-details" />
        <Button variant="danger" className="mt-1 w-full" disabled={!reason} loading={busy} onClick={send} data-testid="report-player-send">
          <Flag className="h-4 w-4" /> Send report
        </Button>
      </div>
    </Dialog>
  );
}
