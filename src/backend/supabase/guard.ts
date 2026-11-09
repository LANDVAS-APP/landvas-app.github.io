// Keeps the game usable when the server is struggling. When calls start timing out, failing with server errors or
// taking seconds, the background ones — alert checks, chat lists, presence check-ins, counters — pause for a moment
// (15 s, doubling up to 2 min while it lasts) instead of piling on, so what you actually tap still gets through and
// the server gets room to recover. Nothing a player does is ever held back.

/** Calls that only refresh things in the background (safe to skip for a while). */
export const BACKGROUND = /^(my_alerts|my_notifications|my_friends|friend_status|map_updates_since|public_stats|gallery_list|featured_today|feed_recent|set_activity|report_position|arcade_live|arena_live|home_live|planet_live|planet_meteors|planet_chat_list|home_chat_list|clan_chat_list|chat_list|my_streak|earn_overview|space_state|my_sanctuaries|my_minigame_records|my_publications|habitat_spring|planet_overview|planet_here)$/;

const WINDOW_MS = 30_000, STRAIN = 3, SLOW_MS = 4_000;
let strains: number[] = [];
let until = 0, backoff = 15_000, calmSince = 0;
const listeners = new Set<(busy: boolean) => void>();

const tell = (busy: boolean) => { for (const l of listeners) l(busy); };

export const guard = {
  /** Background calls wait while the server is catching its breath. */
  skip(fn: string) { return Date.now() < until && BACKGROUND.test(fn); },
  busy() { return Date.now() < until; },
  /** After every call: how it went. */
  record(ms: number, strained: boolean) {
    const now = Date.now();
    if (strained || ms > SLOW_MS) {
      strains = strains.filter((t) => now - t < WINDOW_MS);
      strains.push(now);
      calmSince = 0;
      if (strains.length >= STRAIN && now >= until) {
        until = now + backoff;
        backoff = Math.min(backoff * 2, 120_000);
        strains = [];
        tell(true);
        setTimeout(() => { if (Date.now() >= until) tell(false); }, until - now + 50);
      }
    } else if (now >= until) {
      // a calm minute: back to the shortest pause next time
      if (!calmSince) calmSince = now;
      else if (now - calmSince > 60_000) { backoff = 15_000; calmSince = now; }
    }
  },
  onChange(cb: (busy: boolean) => void) { listeners.add(cb); return () => void listeners.delete(cb); },
  /** (for tests) */ reset() { strains = []; until = 0; backoff = 15_000; calmSince = 0; },
};

/** Errors that mean the server (not the request) is in trouble. */
export const isStrain = (e: { code?: string; message?: string; status?: number } | null | undefined) =>
  !!e && ((e.status ?? 0) >= 500 || e.code === '57014' || e.code === '53300' || e.code === '53200' || e.code === 'PGRST000' || e.code === 'PGRST001' || e.code === 'PGRST002' ||
    /fetch|network|timed? ?out|abort|load failed|ECONN|503|504|connection/i.test(e.message ?? ''));

/** fetch with a time limit, so a request to a stuck server fails in 15 s instead of hanging forever. */
export const timedFetch: typeof fetch = (input, init) => {
  if (init?.signal || typeof AbortController === 'undefined') return fetch(input, init);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15_000);
  return fetch(input, { ...init, signal: c.signal }).finally(() => clearTimeout(t));
};
