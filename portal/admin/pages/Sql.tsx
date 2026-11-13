// The SQL console (owner only): any read-only query against the live database. Writes are impossible here:
// the transaction is switched to read-only before the query runs. Every query is kept in the audit log.
import { useEffect, useRef, useState } from 'react';
import { Download, Play, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { toGameError } from '../../../src/backend/backend';
import { Button } from '../../../src/ui';
import { portal } from '../../shared/api';
import { downloadFile, int, toCsv } from '../../shared/format';
import { Badge, Cell, PageHeader, Panel } from '../../shared/ui';

const EXAMPLES: [string, string][] = [
  ['Newest players', `select p.username, u.email, pl.created_at, pl.status\nfrom profiles p join players pl on pl.id = p.id join auth.users u on u.id = p.id\norder by pl.created_at desc\nlimit 50`],
  ['Biggest Ink earners this week', `select pr.username, sum(l.delta) as ink\nfrom resource_ledger l join profiles pr on pr.id = l.player_id\nwhere l.resource = 'ink' and l.delta > 0 and l.created_at > now() - interval '7 days'\ngroup by 1 order by 2 desc limit 25`],
  ['Rarity counts', `select rarity, count(*) as plots, count(*) filter (where shiny) as shiny\nfrom world_plots where owner_id is not null\ngroup by 1 order by 2 desc`],
  ['Plots per country', `select c.country_name, count(*) as plots, count(distinct w.owner_id) as owners\nfrom world_plots w join world_cities c on c.id = w.city_id\nwhere w.owner_id is not null group by 1 order by 2 desc`],
  ['Largest tables', `select relname, n_live_tup as rows, pg_size_pretty(pg_total_relation_size(relid)) as size\nfrom pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 25`],
  ['Game settings', `select key, value, updated_at from game_config order by key`],
];
const KEY = 'landvas-portal-sql';
type Saved = { name: string; sql: string };

export default function Sql() {
  const [sql, setSql] = useState(() => localStorage.getItem(`${KEY}-draft`) || EXAMPLES[0][1]);
  const [res, setRes] = useState<Awaited<ReturnType<typeof portal.sql>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved[]>(() => { try { return JSON.parse(localStorage.getItem(`${KEY}-saved`) || '[]'); } catch { return []; } });
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { try { localStorage.setItem(`${KEY}-draft`, sql); } catch { /* full */ } }, [sql]);
  const keep = (s: Saved[]) => { setSaved(s); try { localStorage.setItem(`${KEY}-saved`, JSON.stringify(s)); } catch { /* full */ } };
  const run = async () => {
    const el = ta.current;
    const text = el && el.selectionEnd > el.selectionStart ? sql.slice(el.selectionStart, el.selectionEnd) : sql;
    setBusy(true);
    try { setRes(await portal.sql(text)); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const rowsAsObjects = () => (res?.rows ?? []).map((r) => Object.fromEntries(res!.columns.map((c, i) => [c, r[i]])));
  return (
    <>
      <PageHeader title="SQL console" sub="Run any read-only query against the live database: up to 1,000 rows, cut off after a few seconds. Nothing here can change data. Every query is recorded in the audit log." />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
        <Panel pad={false}>
          <div className="p-3">
            <textarea ref={ta} className="p-input p-mono min-h-[180px] w-full !text-[13px]" spellCheck={false} value={sql} onChange={(e) => setSql(e.target.value)} aria-label="SQL query"
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void run(); } }} data-testid="sql-input" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" loading={busy} onClick={run} data-testid="sql-run"><Play className="h-4 w-4" /> Run</Button>
              <span className="text-xs text-muted">⌘/Ctrl + Enter runs it; select part of the text to run only that.</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { const name = prompt('Name this query'); if (name) keep([{ name, sql }, ...saved.filter((s) => s.name !== name)]); }}><Save className="h-4 w-4" /> Save</Button>
                <Button size="sm" variant="ghost" disabled={!res?.rows?.length} onClick={() => downloadFile('landvas-query.csv', toCsv(rowsAsObjects()), 'text/csv')}><Download className="h-4 w-4" /> CSV</Button>
              </div>
            </div>
          </div>
          {res && (
            <div className="border-t border-line">
              {res.error ? (
                <div className="p-4 text-sm"><Badge tone="bad">Error {res.state}</Badge> <span className="p-mono ml-2">{res.error}</span></div>
              ) : (
                <>
                  <div className="px-4 py-2 text-xs text-muted">{int(res.count)} row{res.count === 1 ? '' : 's'}{res.truncated ? ' (first 1,000 shown)' : ''} in {res.ms} ms</div>
                  <div className="p-scroll max-h-[60vh]">
                    <table className="p-table">
                      <thead><tr>{res.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                      <tbody>{res.rows.map((r, i) => <tr key={i}>{r.map((v, k) => <td key={k}><Cell v={v} /></td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </Panel>
        <div className="grid content-start gap-3">
          <Panel title="Examples">
            <div className="grid gap-1">{EXAMPLES.map(([n, s]) => <button key={n} className="rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-2/60" onClick={() => setSql(s)}>{n}</button>)}</div>
          </Panel>
          <Panel title="Saved on this computer">
            {saved.length ? <div className="grid gap-1">{saved.map((s) => (
              <div key={s.name} className="flex items-center gap-1">
                <button className="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-2/60" onClick={() => setSql(s.sql)}>{s.name}</button>
                <button className="rounded p-1 text-faint hover:text-bad" aria-label={`Delete ${s.name}`} onClick={() => keep(saved.filter((x) => x !== s))}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}</div> : <p className="text-sm text-muted">Save a query to find it here next time.</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
