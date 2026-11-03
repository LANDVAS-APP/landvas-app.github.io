// Turns a build's commit messages into a player-facing update draft (headline + bullet points).
// Pure functions, shared by scripts/build-update.mjs and the unit tests.

const TRAILER = /^(co-authored-by|claude-session|signed-off-by|reviewed-by|change-id):/i;
// commits that only touch plumbing don't make it into player updates
const PLUMBING = /^(ci|chore|build|test|tests|e2e|deploy|diag|wip|merge|revert|bump|docs?|refactor|admin|staff)\b|^(fix(e[sd])? )?(the )?(deploy|workflow|ci|tests?|typecheck|lint)\b/i;

/** Parse `git log --format=%H%x1f%s%x1f%b%x1e` output into [{ sha, subject, notes }]. */
export function parseLog(raw) {
  return raw.split('\x1e').map((c) => c.trim()).filter(Boolean).map((c) => {
    const [sha, subject = '', body = ''] = c.split('\x1f');
    return { sha: sha.trim(), subject: subject.trim(), notes: bullets(body) };
  });
}

/** The "- " bullet points in a commit body (continuation lines joined), trailers dropped. */
export function bullets(body) {
  const out = [];
  for (const line of String(body).split(/\r?\n/)) {
    if (!line.trim() || TRAILER.test(line.trim())) continue;
    const m = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (m) out.push(m[1].trim());
    else if (out.length && /^\s{2,}\S/.test(line)) out[out.length - 1] += ' ' + line.trim();
  }
  return out.map((s) => s.replace(/\s+/g, ' ')).filter(Boolean);
}

const tidy = (s) => { const t = s.replace(/\s+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };

/** A draft without any AI: headline from the commit subjects, one bullet per note. */
export function summarize(commits, maxBullets = 14) {
  const real = commits.filter((c) => c.subject && !PLUMBING.test(c.subject));
  if (!real.length) return null;
  const subjects = real.map((c) => tidy(c.subject.replace(/[.!]+$/, '')));
  let title = subjects.length === 1 ? subjects[0] : `New: ${subjects.join(' · ')}`;
  if (title.length > 120) title = title.slice(0, 117).replace(/[\s·,]+\S*$/, '') + '…';
  const notes = real.flatMap((c) => (c.notes.length ? c.notes : [c.subject])).map(tidy);
  const seen = new Set(); const uniq = notes.filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const shown = uniq.slice(0, maxBullets);
  let body = shown.map((n) => `• ${n}`).join('\n');
  if (uniq.length > shown.length) body += `\n• …and ${uniq.length - shown.length} more improvements`;
  return { title, body: body.slice(0, 3900), notes: uniq };
}

/** The prompt for an AI-written summary (used only when an API key is configured). */
export function aiPrompt(commits) {
  const log = commits.map((c) => `## ${c.subject}\n${c.notes.map((n) => `- ${n}`).join('\n')}`).join('\n\n');
  return `You write the in-game "What's new" update for LANDVAS, a playful map game where players own plots, paint, raise Inkborn creatures and explore planets.
Turn these build notes into one update for players. Rules: friendly and exciting but plain; no technical words (no SQL, server, RPC, migration, e2e, tests, refactor); skip anything players can't notice; say what they can now do.
Reply with JSON only: {"title": "<headline, max 80 characters>", "body": "<4-10 lines, each starting with an emoji, max 1500 characters>"}

Build notes:
${log}`;
}

/** Safe to embed in SQL: a JSON string inside a dollar-quoted literal. */
export function sqlJson(obj) {
  const json = JSON.stringify(obj).replace(/\$/g, '\\u0024');
  return `$lvjson$${json}$lvjson$::jsonb`;
}
