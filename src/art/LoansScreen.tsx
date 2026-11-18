// Your art on loan: museums asking to borrow your published pieces, and what's out on loan now (the alert opens this).
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { MuseumLoan } from '../backend/types';
import { buzz } from '../native/native';
import { Button, Dialog, Spinner } from '../ui';
import { LoanRow } from './ArtPlaceScreen';

export default function LoansScreen() {
  const nav = useNavigate();
  return <div className="min-h-[60vh]"><ArtistLoans onClose={() => (history.length > 1 ? nav(-1) : nav('/world'))} /></div>;
}

/** an artist's side of loans: museums asking to borrow your work, and what's out on loan (from the alert) */
export function ArtistLoans({ onClose }: { onClose(): void }) {
  const q = useQuery({ queryKey: ['museum-loans'], queryFn: () => api.museumLoans() });
  const [busy, setBusy] = useState<number | null>(null);
  const answer = async (l: MuseumLoan, yes: boolean) => {
    setBusy(l.id);
    try { const r = await api.museumLoanAnswer(l.id, yes); q.refetch(); void r; buzz(yes ? 'success' : 'medium'); toast.success(yes ? `Lent to @${l.owner.username}’s museum 🏛️` : 'Said no, kindly'); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="📜 Your art on loan" description="Museums can borrow your published pieces for two weeks. Admires and sparks found on them pay you Renown.">
      {!q.data ? <Spinner /> : (
        <div className="grid gap-3" data-testid="artist-loans">
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">Asked of you</b>
            {!q.data.asked.length ? <p className="text-sm text-muted">Nobody’s asking right now.</p> : q.data.asked.map((l) => (
              <LoanRow key={l.id} l={l} who={l.owner} right={<div className="flex gap-1">
                <Button size="sm" variant="primary" loading={busy === l.id} onClick={() => void answer(l, true)} data-testid="loan-yes">Lend it</Button>
                <Button size="sm" variant="ghost" disabled={busy === l.id} onClick={() => void answer(l, false)} data-testid="loan-no">No</Button>
              </div>} />
            ))}
          </section>
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">Out on loan</b>
            {!q.data.out.length ? <p className="text-sm text-muted">Nothing out on loan.</p> : q.data.out.map((l) => (
              <LoanRow key={l.id} l={l} who={l.owner} right={<Link to={`/studio/${l.group_id}?room=museum`} className="text-xs font-bold text-accent">Visit →</Link>} />
            ))}
          </section>
        </div>
      )}
    </Dialog>
  );
}

