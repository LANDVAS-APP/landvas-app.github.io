// Run by the deploy after the site is published: writes this build's notes into a draft update that
// staff preview and approve in Admin → Updates. Nothing reaches players until it's approved.
// Optional: with the ANTHROPIC_API_KEY secret set, Claude writes the summary; otherwise the commit notes are used.
import { execFileSync } from 'node:child_process';
import { aiPrompt, parseLog, sqlJson, summarize } from './update-notes.mjs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const sha = process.env.BUILD_SHA || execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const before = process.env.BUILD_BEFORE;
if (!token || !ref) { console.log('No database token — skipping the update draft.'); process.exit(0); }

const range = before && !/^0+$/.test(before) ? `${before}..${sha}` : `${sha}~1..${sha}`;
let raw = '';
try { raw = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', range]).toString(); }
catch { raw = execFileSync('git', ['log', '-1', '--format=%H%x1f%s%x1f%b%x1e', sha]).toString(); }
const commits = parseLog(raw);
const plain = summarize(commits);
if (!plain) { console.log('Nothing players would notice in this build — no draft.'); process.exit(0); }

let draft = plain;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.UPDATE_MODEL || 'claude-haiku-5-5', max_tokens: 800, messages: [{ role: 'user', content: aiPrompt(commits) }] }),
    });
    const j = await res.json();
    const text = j?.content?.[0]?.text ?? '';
    const ai = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (ai.title && ai.body) draft = { ...plain, title: String(ai.title).slice(0, 120), body: String(ai.body).slice(0, 3900) };
  } catch (e) { console.log(`::warning::AI summary skipped (${String(e).slice(0, 120)}) — using the build notes`); }
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: `select private.build_update_draft(${sqlJson({ sha, title: draft.title, body: draft.body, notes: plain.notes })}) r` }),
});
const out = await res.text();
if (!res.ok) { console.log(`::warning::Couldn't save the update draft: HTTP ${res.status} ${out.slice(0, 300)}`); process.exit(0); }
console.log(`Update draft: ${out.slice(0, 300)}`);
console.log(`::notice title=Update draft waiting for approval::${draft.title}`);
