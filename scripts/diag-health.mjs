// Read-only health check run by the deploy: connections, slow queries and recent client errors.
// Prints counts, timings and error text only — never player names, emails, ids or locations.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
async function query(sql) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (!res.ok) return [{ error: `HTTP ${res.status}: ${text.slice(0, 300)}` }];
    return JSON.parse(text);
  } catch (e) { return [{ error: String(e).slice(0, 200) }]; }
}
const out = (title, rows) => console.log(`::warning title=${title}::${JSON.stringify(rows).replace(/\r?\n/g, ' ').replace(/%/g, '%25').slice(0, 3800)}`);
if (!token || !ref) process.exit(0);
out('connections', await query(`select state, coalesce(application_name, '') app, count(*) n, max(extract(epoch from now() - query_start))::int longest_s
  from pg_stat_activity where datname = current_database() group by 1, 2 order by 3 desc limit 12`));
out('max_connections', await query(`select setting from pg_settings where name = 'max_connections'`));
out('long_running', await query(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 160) q, state, extract(epoch from now() - query_start)::int secs, wait_event_type
  from pg_stat_activity where datname = current_database() and state <> 'idle' and now() - query_start > interval '5 seconds' order by 3 desc limit 8`));
out('slow_queries', await query(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 140) q, calls, round(mean_exec_time::numeric, 1) mean_ms, round(total_exec_time::numeric / 1000) total_s
  from extensions.pg_stat_statements order by total_exec_time desc limit 12`));
out('busiest_calls', await query(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 120) q, calls from extensions.pg_stat_statements order by calls desc limit 10`));
out('client_errors_2h', await query(`select left(message, 140) message, coalesce(context ->> 'path', '') path, count(*) n from private.client_errors
  where created_at > now() - interval '2 hours' group by 1, 2 order by 3 desc limit 15`));
out('active_players_15m', await query(`select count(*) n from public.players where last_active_at > now() - interval '15 minutes'`));
out('presence_live', await query(`select world, count(*) n from public.planet_presence where seen_at > now() - interval '30 seconds' group by 1`));
out('db_size', await query(`select pg_size_pretty(pg_database_size(current_database())) size`));
out('big_tables', await query(`select relname, n_live_tup, n_dead_tup, pg_size_pretty(pg_total_relation_size(relid)) size from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 8`));
