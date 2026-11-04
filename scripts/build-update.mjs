// Run by the deploy after the site is published. Every update players would notice becomes its own draft
// announcement (a headline, a themed banner and a card per feature) that staff preview and publish in
// Admin → Updates. Updates from before, that were never announced, are offered too (marked "past update"),
// so older work can be announced as well. Nothing reaches players until it's published.
// Optional: with the ANTHROPIC_API_KEY secret set, Claude writes this build's headline and summary.
import { execFileSync } from 'node:child_process';
import { aiPrompt, draftsFor, parseLog, sqlJson } from './update-notes.mjs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const sha = process.env.BUILD_SHA || execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const before = process.env.BUILD_BEFORE;
if (!token || !ref) { console.log('No database token — skipping the update drafts.'); process.exit(0); }

const FORMAT = '--format=%H%x1f%s%x1f%b%x1f%cI%x1e';
const git = (args) => { try { return execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 }).toString(); } catch { return ''; } };
const range = before && !/^0+$/.test(before) ? `${before}..${sha}` : `${sha}~1..${sha}`;
const thisPush = new Set(parseLog(git(['log', '--no-merges', FORMAT, range])).map((c) => c.sha));
const history = parseLog(git(['log', '--no-merges', FORMAT, sha]));
const drafts = draftsFor(history).map((d) => ({ ...d, source: thisPush.has(d.sha) ? 'auto' : 'backfill' }));
if (!drafts.length) { console.log('Nothing players would notice — no drafts.'); process.exit(0); }

// an AI-written headline and summary for this build's own updates, if a key is set
if (process.env.ANTHROPIC_API_KEY) {
  for (const d of drafts.filter((x) => x.source === 'auto')) {
    try {
      const c = history.find((h) => h.sha === d.sha);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.UPDATE_MODEL || 'claude-haiku-5-5', max_tokens: 800, messages: [{ role: 'user', content: aiPrompt([c]) }] }),
      });
      const j = await res.json();
      const text = j?.content?.[0]?.text ?? '';
      const ai = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      if (ai.title && ai.body) { d.title = String(ai.title).slice(0, 120); d.body = String(ai.body).slice(0, 3900); }
    } catch (e) { console.log(`::warning::AI summary skipped (${String(e).slice(0, 120)}) — using the build notes`); }
  }
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: `select private.build_update_drafts(${sqlJson(drafts)}) r` }),
});
const out = await res.text();
if (!res.ok) { console.log(`::warning::Couldn't save the update drafts: HTTP ${res.status} ${out.slice(0, 300)}`); process.exit(0); }
console.log(`Update drafts: ${out.slice(0, 300)} (${drafts.filter((d) => d.source === 'auto').length} from this build, ${drafts.length} updates in all)`);
for (const d of drafts.filter((x) => x.source === 'auto')) console.log(`::notice title=Update draft waiting for approval::${d.title}`);
