// When the Terms of Service or Privacy Policy change, every player is asked once to accept the new versions —
// a game-style card over whatever screen they're on (the legal pages themselves stay readable).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { qk, useOnboardedMe } from '../lib/queries';
import { Button, Dialog } from '../ui';

export function TermsUpdate() {
  const me = useOnboardedMe();
  const loc = useLocation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const current = me?.terms_current;
  const open = !!me && !!current && me.player.terms_version !== current && !loc.pathname.startsWith('/legal') && loc.pathname !== '/onboarding';
  // (the dialog stays mounted and closes itself, so the page underneath gets its taps back cleanly)
  if (!me) return null;
  const accept = async () => {
    setBusy(true);
    try {
      const st = await api.acceptTerms(current!);
      qc.setQueryData(qk.me, st);
      toast.success('Thanks — you’re all set');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} locked onOpenChange={() => {}} title="📜 Updated Terms & Privacy Policy"
      description="LANDVAS is getting ready for the App Store and Google Play, so our policies are now final.">
      <div className="grid gap-3 text-sm" data-testid="terms-update">
        <ul className="grid gap-1.5 text-muted [&_b]:text-fg">
          <li>• LANDVAS is run by <b>LANDVAS LLC</b> (Utah, USA). Contact: <b>contact@landvas.app</b>.</li>
          <li>• Plots, Ink and other game items are virtual and have no cash value; USD rent follows the rent rules.</li>
          <li>• The privacy policy lists exactly what we collect, who helps us run the game, and your rights.</li>
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-bold">
          <Link to="/legal/terms" className="text-accent-2 underline">Read the Terms</Link>
          <Link to="/legal/privacy" className="text-accent-2 underline">Read the Privacy Policy</Link>
        </div>
        <Button variant="primary" size="lg" loading={busy} onClick={() => void accept()} data-testid="terms-accept">Accept and keep playing</Button>
      </div>
    </Dialog>
  );
}
