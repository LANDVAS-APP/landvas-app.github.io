// "Back soon": when the game servers don't answer (a Supabase outage or a restart), players see a friendly
// maintenance screen instead of a page that never loads. It checks again by itself every few seconds and, the
// moment the servers answer, reloads straight into the game — nothing to switch off afterwards.
import { useEffect, useState } from 'react';
import { config } from '../env';

/** Is the database answering? Any reply from it (even "not allowed") means yes; errors from the gateway,
 *  timeouts and network failures mean no. */
export async function serversUp(timeoutMs = 7000): Promise<boolean> {
  if (config.backend !== 'supabase') return true;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/game_config?select=key&limit=1`, {
      headers: { apikey: config.supabaseAnonKey, authorization: `Bearer ${config.supabaseAnonKey}` }, signal: ctl.signal, cache: 'no-store',
    });
    return res.status < 500;
  } catch {
    // offline phones aren't an outage: only call it maintenance when the internet itself works
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } finally {
    clearTimeout(t);
  }
}

export function MaintenanceGate() {
  const [down, setDown] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (config.backend !== 'supabase') return;
    let stop = false, gap = 0, timer: ReturnType<typeof setTimeout> | null = null, tick: ReturnType<typeof setInterval> | null = null;
    const check = async (first: boolean) => {
      const up = await serversUp();
      if (stop) return;
      if (up) { if (!first) location.reload(); return; }
      setDown(true);
      // back off gently: 10 s, then 20 s, then every 30 s (a struggling server doesn't need every phone knocking)
      const next = gap = first ? 10 : Math.min(30, gap + 10);
      setWait(next);
      let left = next;
      if (tick) clearInterval(tick);
      tick = setInterval(() => setWait(--left > 0 ? left : 0), 1000);
      timer = setTimeout(() => void check(false), next * 1000);
    };
    void check(true);
    return () => { stop = true; if (timer) clearTimeout(timer); if (tick) clearInterval(tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!down) return null;
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-[#0B0820] p-6 text-center text-white" role="alert" data-testid="maintenance">
      <div className="grid max-w-sm justify-items-center gap-4">
        <div className="text-6xl" aria-hidden>🛠️</div>
        <h1 className="font-display text-2xl font-black">Back in a few minutes</h1>
        <p className="text-sm leading-relaxed text-white/75">LANDVAS is having a quick tune-up. Your plots, Ink and everything you’ve made are safe. This page will reconnect by itself as soon as we’re back.</p>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white/80">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#FFD23F]" />{wait > 0 ? `Checking again in ${wait}s` : 'Checking…'}
        </div>
        <button onClick={() => location.reload()} className="text-xs font-bold text-[#B8A8FF] underline underline-offset-4">Try now</button>
      </div>
    </div>
  );
}
