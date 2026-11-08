// Read-only: what is using the database's disk (the free plan's Disk IO budget). Counts and query shapes only —
// never player data. Run by .github/workflows/diag.yml.
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
  const msg = JSON.stringify(rows).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').replace(/%/g, '%25').slice(0, 3800);
  console.log(`::warning title=${title}::${msg}`);
};
out('db_size', await query(`select pg_size_pretty(pg_database_size(current_database())) size, (select setting from pg_settings where name='shared_buffers') shared_buffers, now() - pg_postmaster_start_time() up`));
out('tables_by_writes', await query(`select schemaname||'.'||relname t, n_tup_ins ins, n_tup_upd upd, n_tup_hot_upd hot, n_tup_del del, n_live_tup live, n_dead_tup dead, pg_size_pretty(pg_total_relation_size(relid)) size from pg_stat_user_tables order by n_tup_ins+n_tup_upd+n_tup_del desc limit 15`));
out('tables_by_disk_reads', await query(`select s.schemaname||'.'||s.relname t, heap_blks_read hr, heap_blks_hit hh, idx_blks_read ir, toast_blks_read tr, seq_scan, seq_tup_read from pg_statio_user_tables s join pg_stat_user_tables u using (relid) order by heap_blks_read+coalesce(idx_blks_read,0)+coalesce(toast_blks_read,0) desc limit 12`));
out('tables_by_size', await query(`select schemaname||'.'||relname t, pg_size_pretty(pg_total_relation_size(relid)) size from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 12`));
const pss = `select left(regexp_replace(query, '\\s+', ' ', 'g'), 110) q, calls, shared_blks_read rd, shared_blks_dirtied dirt, shared_blks_written wr, temp_blks_written tmp, wal_bytes / 1048576 wal_mb, round(total_exec_time) ms from extensions.pg_stat_statements`;
out('statements_by_wal', await query(`${pss} order by wal_bytes desc limit 14`));
out('statements_by_disk_read', await query(`${pss} order by shared_blks_read desc limit 14`));
out('statements_by_dirtied', await query(`${pss} order by shared_blks_dirtied + shared_blks_written + temp_blks_written desc limit 12`));
out('statements_by_calls', await query(`${pss} order by calls desc limit 14`));
out('wal_and_ckpt', await query(`select * from pg_stat_wal`));
out('bgwriter', await query(`select * from pg_stat_bgwriter`));
out('realtime_and_cron', await query(`select (select count(*) from pg_publication_tables where pubname='supabase_realtime') realtime_tables, (select count(*) from pg_extension where extname='pg_cron') has_cron`));
