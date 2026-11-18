// Which client errors get sent to the server. Production saw ~17,000 reports a day from a few hundred players: the
// same message repeated by a loop or a flaky connection. Each distinct message goes once per visit, network blips
// (the server or the connection, already handled by the guard and retries) aren't reported at all, and a visit sends
// at most MAX_PER_VISIT in total.
const MAX_PER_VISIT = 20;
const seen = new Set<string>();
let sent = 0;

/** network trouble the app already copes with: nothing for staff to fix in the code */
const NOISE = /^(Failed to fetch|Load failed|NetworkError|The network connection was lost|The server took too long|The operation was aborted|AbortError|signal is aborted|server_busy|not_signed_in|rate_limited|ResizeObserver loop|Script error\.?$)/i;

/** the message with its varying parts (numbers, ids) taken out, so one bug counts once */
const shape = (msg: string) => msg.slice(0, 200).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#').replace(/\d+/g, '#');

export function shouldReport(msg: string): boolean {
  const m = String(msg ?? '').trim();
  if (!m || NOISE.test(m) || sent >= MAX_PER_VISIT) return false;
  const k = shape(m);
  if (seen.has(k)) return false;
  seen.add(k);
  sent++;
  return true;
}

/** (for tests) */
export function resetReports() { seen.clear(); sent = 0; }
