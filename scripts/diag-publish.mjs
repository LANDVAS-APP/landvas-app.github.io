// Read-only health check for publishing (run by .github/workflows/diag.yml).
// Prints counts, statuses and pipeline errors as workflow annotations — never
// player names, emails or plot coordinates.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) return [{ error: `HTTP ${res.status}: ${text.slice(0, 400)}` }];
  try { return JSON.parse(text); } catch { return [{ text: text.slice(0, 400) }]; }
}
const out = (title, rows) => {
  const msg = JSON.stringify(rows).replace(/\r?\n/g, ' ').replace(/%/g, '%25').slice(0, 3500);
  console.log(`::warning title=${title}::${msg}`);
};
out('publications_by_status_3d', await query(`select status, count(*) n, max(coalesce(processed_at, submitted_at, created_at)) last from public.artwork_publications where created_at > now() - interval '3 days' group by status order by 2 desc`));
out('render_jobs_recent', await query(`select id, kind, status, attempts, left(coalesce(last_error, ''), 600) err, created_at, updated_at from private.render_jobs order by id desc limit 8`));
out('render_jobs_by_status', await query(`select status, count(*) from private.render_jobs group by status`));
out('migrations_latest', await query(`select name, applied_at from landvas_meta.migrations order by applied_at desc limit 5`));
out('storage_buckets', await query(`select id, public from storage.buckets order by id`));
out('recent_publication_errors', await query(`select status, left(coalesce(decision_reason, ''), 200) reason, created_at, submitted_at, processed_at, published_at from public.artwork_publications order by created_at desc limit 6`));
