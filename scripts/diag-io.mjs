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
  console.log(`::warning title=${title}::${msg.slice(0, 300)}`);
  console.log(`REPORT ${title} ${JSON.stringify(rows)}`); // the full rows (annotations are capped at 10 a step)
};
out('db_size', await query(`select pg_size_pretty(pg_database_size(current_database())) size, (select setting from pg_settings where name='shared_buffers') shared_buffers, now() - pg_postmaster_start_time() up`));
out('tables_by_writes', await query(`select schemaname||'.'||relname t, n_tup_ins ins, n_tup_upd upd, n_tup_hot_upd hot, n_tup_del del, n_live_tup live, n_dead_tup dead, pg_size_pretty(pg_total_relation_size(relid)) size from pg_stat_user_tables order by n_tup_ins+n_tup_upd+n_tup_del desc limit 15`));
out('tables_by_disk_reads', await query(`select s.schemaname||'.'||s.relname t, heap_blks_read hr, heap_blks_hit hh, idx_blks_read ir, toast_blks_read tr, seq_scan, seq_tup_read from pg_statio_user_tables s join pg_stat_user_tables u using (relid) order by heap_blks_read+coalesce(idx_blks_read,0)+coalesce(toast_blks_read,0) desc limit 12`));
out('tables_by_size', await query(`select schemaname||'.'||relname t, pg_size_pretty(pg_total_relation_size(relid)) size from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 12`));
const pss = `select coalesce(substring(query from '"public"\\."([a-z_0-9]+)"'), left(regexp_replace(query, '\\s+', ' ', 'g'), 80)) q, calls, shared_blks_read rd, shared_blks_dirtied dirt, shared_blks_written wr, temp_blks_written tmp, wal_bytes / 1048576 wal_mb, round(total_exec_time) ms from extensions.pg_stat_statements`;
out('statements_by_wal', await query(`${pss} order by wal_bytes desc limit 14`));
out('statements_by_disk_read', await query(`${pss} order by shared_blks_read desc limit 14`));
out('statements_by_dirtied', await query(`${pss} order by shared_blks_dirtied + shared_blks_written + temp_blks_written desc limit 12`));
out('statements_by_calls', await query(`${pss} order by calls desc limit 14`));
out('wal_and_ckpt', await query(`select * from pg_stat_wal`));
out('bgwriter', await query(`select * from pg_stat_bgwriter`));
out('realtime_and_cron', await query(`select (select count(*) from pg_publication_tables where pubname='supabase_realtime') realtime_tables, (select count(*) from pg_extension where extname='pg_cron') has_cron`));
// what lasts: cache hits, cleanup, write cost of indexes, and the size of the machine
out('cache_hit', await query(`select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0), 2) table_hit_pct, round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0), 2) index_hit_pct from pg_statio_user_tables`));
out('dead_rows', await query(`select schemaname||'.'||relname t, n_live_tup live, n_dead_tup dead, round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0)) dead_pct, round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0)) hot_pct, last_autovacuum::date av from pg_stat_user_tables where n_dead_tup > 500 order by n_dead_tup desc limit 15`));
out('unused_indexes', await query(`select s.schemaname||'.'||s.relname t, s.indexrelname i, pg_size_pretty(pg_relation_size(s.indexrelid)) size, u.n_tup_ins + u.n_tup_upd + u.n_tup_del table_writes from pg_stat_user_indexes s join pg_stat_user_tables u using (relid) join pg_index x on x.indexrelid = s.indexrelid where s.idx_scan = 0 and not x.indisunique and not x.indisprimary and s.schemaname in ('public','private') order by u.n_tup_ins + u.n_tup_upd + u.n_tup_del desc limit 25`));
out('unused_index_total', await query(`select count(*) n, pg_size_pretty(sum(pg_relation_size(s.indexrelid))) size from pg_stat_user_indexes s join pg_index x on x.indexrelid = s.indexrelid where s.idx_scan = 0 and not x.indisunique and not x.indisprimary and s.schemaname in ('public','private')`));
out('stats_since', await query(`select stats_reset, now() - stats_reset age from pg_stat_database where datname = current_database()`));
out('growing_logs', await query(`select relname t, n_live_tup live, pg_size_pretty(pg_total_relation_size(relid)) size from pg_stat_user_tables where relname ~ '(ledger|_log|logs|feed|chat|notif|history|events|runs|plays|visits|_days)' order by pg_total_relation_size(relid) desc limit 15`));
out('connections', await query(`select state, count(*) from pg_stat_activity group by 1`));
{
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/billing/addons`, { headers: { authorization: `Bearer ${token}` } });
  const j = res.ok ? await res.json() : { error: res.status };
  out('compute', (j.selected_addons ?? []).map((a) => ({ type: a.type, variant: a.variant?.identifier ?? a.variant?.name })).concat(j.error ? [j] : []));
}
out('functions_by_time', await query(`select substring(query from '"public"\\."([a-z_0-9]+)"') fn, sum(calls) calls, round(sum(total_exec_time)) total_ms, round(sum(total_exec_time) / sum(calls)) mean_ms, sum(shared_blks_read) rd, sum(shared_blks_dirtied) dirt, sum(temp_blks_written) tmp, round(sum(wal_bytes) / 1024) wal_kb from extensions.pg_stat_statements where query ~ '"public"\\."[a-z_0-9]+"' group by 1 order by 3 desc limit 30`));
out('functions_by_wal', await query(`select substring(query from '"public"\\."([a-z_0-9]+)"') fn, sum(calls) calls, round(sum(wal_bytes) / 1024) wal_kb, round(sum(wal_bytes) / sum(calls)) wal_per_call, sum(shared_blks_dirtied) dirt, sum(temp_blks_written) tmp from extensions.pg_stat_statements where query ~ '"public"\\."[a-z_0-9]+"' group by 1 order by 3 desc limit 20`));
out('presence_indexes', await query(`select tablename t, indexname i, indexdef d from pg_indexes where schemaname = 'public' and tablename in ('planet_presence','arcade_presence','arena_presence','home_presence','player_activity','explorers') order by 1, 2`));
out('row_counts', await query(`select relname t, reltuples::bigint est_rows from pg_class where relname in ('resource_ledger','minigame_sessions','minigame_rewards','idempotent_ops','client_errors','feed_events','player_notifications','audit_logs','rent_ledger') order by 2 desc`));
out('oldest_rows', await query(`select 'idempotent_ops' t, min(created_at)::date oldest, count(*) filter (where created_at < now() - interval '30 days') older_30d from private.idempotent_ops union all select 'minigame_sessions', min(created_at)::date, count(*) filter (where created_at < now() - interval '30 days') from public.minigame_sessions union all select 'client_errors', min(created_at)::date, count(*) filter (where created_at < now() - interval '30 days') from private.client_errors`));
// timings of read-only game helpers on real data (stable functions only: nothing is written)
const timed = async (label, sql) => {
  const r = await query(`explain (analyze, format json) ${sql}`);
  const plan = r?.[0]?.['QUERY PLAN']?.[0];
  return { label, ms: plan ? Math.round(plan['Execution Time']) : null, rows: plan?.Plan?.['Actual Rows'] ?? null, error: plan ? undefined : JSON.stringify(r).slice(0, 200) };
};
out('helper_timings', [
  await timed('factory solve, biggest grid', `select private.rfac_solve(grid) from public.realm_factories order by length(grid::text) desc limit 1`),
  await timed('factory solve, all grids', `select private.rfac_solve(grid) from public.realm_factories`),
  await timed('realm pending, all realms', `select private.rlm_pending(r) from public.realms r`),
  await timed('business json, top 5', `select private.biz_json(s) from public.biz_state s order by alltime desc limit 5`),
  await timed('realm config read x20', `select private.rlm_cfg(k) from (select (array['mine','sky','workshop','diner','dungeon'])[1 + (g % 5)] k from generate_series(1, 20) g) x`),
]);
out('config_sizes', await query(`select key, pg_size_pretty(pg_column_size(value)::bigint) size from public.game_config order by pg_column_size(value) desc limit 8`));
out('scheduled_jobs', await query(`select j.jobname, j.schedule, (select status || ' ' || coalesce(return_message, '') from cron.job_run_details d where d.jobid = j.jobid order by start_time desc limit 1) last_run from cron.job j where j.jobname like 'landvas-%'`));
// memory: the database's settings, the API pool, and who holds connections
out('memory_settings', await query(`select name, setting, unit from pg_settings where name in ('shared_buffers','work_mem','maintenance_work_mem','effective_cache_size','logical_decoding_work_mem','max_connections','max_worker_processes','autovacuum_max_workers','max_wal_size','huge_pages','idle_session_timeout') order by name`));
out('connections_by_app', await query(`select coalesce(application_name, '') app, usename, state, count(*) n, max(extract(epoch from now() - backend_start))::int oldest_s from pg_stat_activity where backend_type = 'client backend' group by 1, 2, 3 order by 4 desc`));
{
  const get = async (path) => { const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, { headers: { authorization: `Bearer ${token}` } }); return res.ok ? res.json() : { error: res.status }; };
  const pg = await get('/config/database/postgres');
  const rest = await get('/postgrest');
  const pooler = await get('/config/database/pooler');
  out('api_config', [{ postgres_overrides: pg, postgrest_pool: rest.db_pool ?? null, max_rows: rest.max_rows ?? null, pooler: Array.isArray(pooler) ? pooler.map((p) => ({ mode: p.pool_mode, size: p.default_pool_size, max_client: p.max_client_conn })) : pooler }]);
}
