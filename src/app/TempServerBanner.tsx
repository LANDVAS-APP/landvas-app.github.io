import { useState } from 'react';
import { X } from 'lucide-react';
import { config } from '../env';

const KEY = 'lv-temp-banner-dismissed';

function wasDismissed() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** Shown on every screen while the game runs on the temporary event server. */
export function TempServerBanner() {
  const [hidden, setHidden] = useState(wasDismissed);
  if (!config.tempServer || hidden) return null;
  const close = () => {
    setHidden(true);
    try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
  };
  return (
    <div
      role="status"
      data-testid="temp-server-banner"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(8px,env(safe-area-inset-top,0px))]"
    >
      <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border border-line bg-bg-2/95 px-4 py-2.5 text-[13px] leading-snug shadow-lg backdrop-blur">
        <span aria-hidden className="pt-0.5">🌍</span>
        <p className="min-w-0 flex-1">
          <b>Fresh Start Event:</b> this is a temporary world while the main server is fixed.
          Sign up with the <b>same email</b> you normally use. Ink you earn here is added to your
          real account; everything else resets when the event ends.
        </p>
        <button type="button" onClick={close} aria-label="Dismiss" className="rounded-full p-1 hover:bg-surface-2">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
