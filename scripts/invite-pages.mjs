// After a deploy has published the site: tell the game which invite codes now have their own page
// (landvas.app/i/CODE, written by scripts/prerender-share.mjs), so the app starts sharing those links.
//   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/invite-pages.mjs [invite-pages.json]
import fs from 'node:fs';

const file = process.argv[2] || 'invite-pages.json';
if (!fs.existsSync(file)) { console.log('invite pages: none built — nothing to mark'); process.exit(0); }
const codes = JSON.parse(fs.readFileSync(file, 'utf8')).filter((c) => /^[A-Z0-9_]{3,20}$/.test(c));
if (!codes.length) { console.log('invite pages: none built — nothing to mark'); process.exit(0); }
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) { console.log('::warning::SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF missing — invite pages not marked'); process.exit(0); }
// the site goes live a few minutes after it's published (Cloudflare picks up the new build)
const wait = Number(process.env.INVITE_PAGES_WAIT_S ?? 240);
if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
const list = codes.map((c) => `'${c}'`).join(',');
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: `select private.invite_pages_built(array[${list}]::text[]) as n` }),
});
const text = await res.text();
if (!res.ok) { console.log(`::warning::invite pages not marked: HTTP ${res.status} ${text.slice(0, 300)}`); process.exit(0); }
console.log(`invite pages: ${codes.length} codes have their own page (${text.slice(0, 80)})`);
