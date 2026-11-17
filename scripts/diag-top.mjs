// Read-only: the top 100 things using the database and the API, ranked several ways. Counts, timings and query
// shapes only — never player data. Run by hand from .github/workflows/diag.yml (and safe to run any time).
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) { console.log('no token/ref — skipping'); process.exit(0); }
const api = `https://api.supabase.com/v1/projects/${ref}`;
async function query(sql) {
  try {
    const res = await fetch(`${api}/database/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    if (!res.ok) return [{ error: `HTTP ${res.status}: ${text.slice(0, 400)}` }];
    return JSON.parse(text);
  } catch (e) { return [{ error: String(e).slice(0, 200) }]; }
}
async function logs(sql, hours = 24) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600e3 + 60e3);
  const u = new URL(`${api}/analytics/endpoints/logs`);
  u.searchParams.set('sql', sql);
  u.searchParams.set('iso_timestamp_start', start.toISOString());
  u.searchParams.set('iso_timestamp_end', end.toISOString());
  await new Promise((r) => setTimeout(r, 4000)); // the logs API allows a few calls a minute
  try {
    const res = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(90000) });
    const text = await res.text();
    if (!res.ok) return [{ error: `HTTP ${res.status}: ${text.slice(0, 400)}` }];
    const j = JSON.parse(text);
    return j.result ?? (j.error ? [{ error: JSON.stringify(j.error).slice(0, 400) }] : j);
  } catch (e) { return [{ error: String(e).slice(0, 200) }]; }
}
const out = (title, rows) => console.log(`REPORT ${title} ${JSON.stringify(rows)}`);

if (!process.env.LOGS_ONLY) {
// ---- database: statements and functions ------------------------------------------------------------------------
const fnName = `coalesce(substring(query from '"public"\\."([a-z_0-9]+)"'), substring(query from 'public\\.([a-z_0-9]+)\\('), left(regexp_replace(query, '\\s+', ' ', 'g'), 110))`;
out('stats_window', await query(`select now() at_, (select stats_reset from extensions.pg_stat_statements_info) pss_reset, now() - pg_postmaster_start_time() up`));
out('totals', await query(`select sum(calls) calls, round(sum(total_exec_time)) total_ms, round(sum(wal_bytes) / 1048576) wal_mb, sum(shared_blks_hit) hit, sum(shared_blks_read) rd, sum(rows) rows_ from extensions.pg_stat_statements`));
const agg = `select ${fnName} fn, sum(calls)::bigint calls, round(sum(total_exec_time)) total_ms, round((sum(total_exec_time) / nullif(sum(calls), 0))::numeric, 2) mean_ms,
  round(max(max_exec_time)) max_ms, sum(rows)::bigint rows_, sum(shared_blks_hit)::bigint hit, sum(shared_blks_read)::bigint rd, sum(shared_blks_dirtied)::bigint dirt,
  sum(temp_blks_written)::bigint tmp, round(sum(wal_bytes) / 1024) wal_kb from extensions.pg_stat_statements group by 1`;
out('top_by_time', await query(`${agg} order by total_ms desc limit 110`));
out('top_by_calls', await query(`${agg} order by calls desc limit 110`));
out('top_by_wal', await query(`${agg} order by wal_kb desc limit 60`));
out('top_by_hit', await query(`${agg} order by hit desc limit 60`));
// the per-statement view inside plpgsql (track = all shows nested statements)
out('pss_track', await query(`select name, setting from pg_settings where name like 'pg_stat_statements.%'`));
out('nested_top', await query(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 220) q, calls, round(total_exec_time) total_ms, round(mean_exec_time::numeric, 2) mean_ms, rows, shared_blks_hit hit
  from extensions.pg_stat_statements where toplevel = false order by total_exec_time desc limit 120`));
out('user_functions', await query(`select schemaname||'.'||funcname f, calls, round(total_time) total_ms, round(self_time) self_ms, round((total_time / nullif(calls, 0))::numeric, 2) mean_ms
  from pg_stat_user_functions order by total_time desc limit 150`));
out('seq_scans', await query(`select schemaname||'.'||relname t, seq_scan, seq_tup_read, idx_scan, n_live_tup live, round(seq_tup_read::numeric / nullif(seq_scan, 0)) per_scan
  from pg_stat_user_tables order by seq_tup_read desc limit 40`));
out('tables_by_reads', await query(`select s.schemaname||'.'||s.relname t, heap_blks_hit + coalesce(idx_blks_hit, 0) hits, seq_scan, idx_scan, n_tup_upd upd, n_tup_ins ins, n_live_tup live
  from pg_statio_user_tables s join pg_stat_user_tables u using (relid) order by heap_blks_hit + coalesce(idx_blks_hit, 0) desc limit 40`));
out('cron_runs_24h', await query(`select j.jobname, j.schedule, count(*) runs, round(avg(extract(epoch from d.end_time - d.start_time) * 1000)) avg_ms, round(max(extract(epoch from d.end_time - d.start_time) * 1000)) max_ms
  from cron.job j join cron.job_run_details d on d.jobid = j.jobid where d.start_time > now() - interval '24 hours' group by 1, 2 order by 4 desc`));
out('cron_jobs', await query(`select jobname, schedule, left(command, 200) cmd, active from cron.job order by jobname`));
out('triggers', await query(`select event_object_schema||'.'||event_object_table t, trigger_name, action_timing, string_agg(event_manipulation, ',') ev, left(action_statement, 120) act
  from information_schema.triggers where event_object_schema in ('public', 'private') group by 1, 2, 3, 5 order by 1`));
out('net_http', await query(`select count(*) n, min(created) oldest from net._http_response`));
out('active_players', await query(`select count(*) filter (where last_active_at > now() - interval '15 minutes') m15, count(*) filter (where last_active_at > now() - interval '24 hours') d1,
  count(*) filter (where last_active_at > now() - interval '7 days') d7, count(*) total from public.players`));

}
// ---- API gateway logs (last 24 h, ClickHouse): every request the apps make -----------------------------------------
const A = (k) => `log_attributes['${k}']`;

out('edge_keys', await logs(`select arrayJoin(mapKeys(log_attributes)) k, count() c from logs where source = 'edge_logs' group by k order by c desc limit 150`));
out('edge_sample', await logs(`select log_attributes from logs where source = 'edge_logs' and ${A('request.path')} like '/rest/v1/rpc/%' order by timestamp desc limit 2`));
const P = `${A('request.path')}`;
out('api_by_path', await logs(`select ${P} path, ${A('request.method')} method, count() n, round(avg(toFloat64OrZero(${A('response.origin_time')}))) avg_ms from logs where source = 'edge_logs' group by path, method order by n desc limit 150`));
out('api_by_kind', await logs(`select extract(${P}, '^/([a-z]+/v[0-9]+)') kind, count() n from logs where source = 'edge_logs' group by kind order by n desc limit 20`));
out('api_by_status', await logs(`select ${A('response.status_code')} st, count() n from logs where source = 'edge_logs' group by st order by n desc limit 20`));
out('api_bytes_by_path', await logs(`select ${P} path, count() n, sum(toInt64OrZero(${A('response.headers.content_length')})) bytes from logs where source = 'edge_logs' group by path order by bytes desc limit 80`));
out('api_by_hour', await logs(`select toStartOfHour(timestamp) h, count() n from logs where source = 'edge_logs' group by h order by h`));
out('api_by_ua', await logs(`select substring(${A('request.headers.user_agent')}, 1, 60) ua, count() n from logs where source = 'edge_logs' group by ua order by n desc limit 15`));
out('api_by_ip_top', await logs(`select cityHash64(${A('request.headers.x_real_ip')}) % 100000 ip_bucket, count() n from logs where source = 'edge_logs' group by ip_bucket order by n desc limit 25`));
out('storage_by_path', await logs(`select extract(${P}, '^(/storage/v1/object/[a-z]+/[^/]+)') p, count() n, sum(toInt64OrZero(${A('response.headers.content_length')})) bytes from logs where source = 'edge_logs' and ${P} like '/storage/%' group by p order by n desc limit 30`));
out('auth_by_path', await logs(`select ${P} path, count() n from logs where source = 'edge_logs' and ${P} like '/auth/%' group by path order by n desc limit 30`));
out('functions_calls', await logs(`select ${P} path, count() n from logs where source = 'edge_logs' and ${P} like '/functions/%' group by path order by n desc limit 20`));
