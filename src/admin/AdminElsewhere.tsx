// The mobile apps don't carry the admin tools: staff use the admin portal (admin.landvas.app) in a browser.
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Page } from '../app/Shell';

export const ADMIN_PORTAL = 'https://admin.landvas.app';

export default function AdminElsewhere() {
  return (
    <Page>
      <div className="mx-auto max-w-md pt-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent-2"><ShieldCheck className="h-6 w-6" /></div>
        <h1 className="font-display text-2xl font-bold">The admin tools are on the web</h1>
        <p className="mt-2 text-sm text-muted">Open the admin portal in your browser and sign in with this account. It has everything the old admin hub had, and much more.</p>
        <a href={ADMIN_PORTAL} target="_blank" rel="noopener" className="lv-btn on mx-auto mt-5 inline-flex h-11 items-center gap-2 px-5 text-sm">Open admin.landvas.app <ExternalLink className="h-4 w-4" /></a>
      </div>
    </Page>
  );
}
