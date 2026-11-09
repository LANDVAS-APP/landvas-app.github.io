// A room's check-in rhythm. Being "in" an arcade, arena, home or planet group is a database write, so it happens
// only every half minute while nothing much is going on, every few seconds while a match is being set up, and right
// away when something changes (someone arrives or leaves, a nudge from another player, coming back to the app).
// Who is connected comes from the room's live channel in between.
import { getBackend } from '../backend/backend';

export const SLOW_MS = 30_000;
export const FAST_MS = 5_000;

export function pulse(beat: () => Promise<void>, fast: () => boolean) {
  const local = getBackend().mode === 'local';
  let stopped = false, running = false, again = false;
  let timer: ReturnType<typeof setTimeout> | null = null, soonT: ReturnType<typeof setTimeout> | null = null;
  const run = async () => {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    if (timer) { clearTimeout(timer); timer = null; }
    try { await beat(); } finally { running = false; }
    if (stopped) return;
    if (again) { again = false; return void run(); }
    timer = setTimeout(() => void run(), local ? 1000 : fast() ? FAST_MS : SLOW_MS);
  };
  const onShow = () => { if (!document.hidden) soon(); };
  const soon = (ms = 600) => { if (stopped || soonT) return; soonT = setTimeout(() => { soonT = null; void run(); }, ms); };
  document.addEventListener('visibilitychange', onShow);
  void run();
  return {
    /** check in now */ now: () => void run(),
    /** check in in a moment (many triggers in a row become one) */ soon,
    stop: () => { stopped = true; if (timer) clearTimeout(timer); if (soonT) clearTimeout(soonT); document.removeEventListener('visibilitychange', onShow); },
  };
}
