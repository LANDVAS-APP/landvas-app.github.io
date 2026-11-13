// The audit log: every staff action, with who did it, to what, and the details (row before and after for edits).
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Button } from '../../../src/ui';
import { portal } from '../../shared/api';
import { dateTime, downloadFile, toCsv, words } from '../../shared/format';
import { Badge, Empty, ErrorBox, Json, Loading, PageHeader, Panel, useDebounced } from '../../shared/ui';

export default function Audit() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const res = useInfiniteQuery({
    queryKey: ['portal', 'audit', dq, action],
    queryFn: ({ pageParam }) => portal.audit({ q: dq, action: action || null, before: pageParam, limit: 100 }),
    initialPageParam: null as number | null,
    getNextPageParam: (l) => l.next,
  });
  const rows = res.data?.pages.flatMap((p) => p.rows) ?? [];
  const actions = res.data?.pages[0]?.actions ?? [];
  const groups = [...new Set(actions.map((a) => a.split('.')[0]))];
  const [open, setOpen] = useState<Set<number>>(new Set());
  return (
    <>
      <PageHeader title="Audit log" sub="Every staff action in the portal and the game’s admin screens, newest first. Entries can’t be changed or deleted."
        actions={<Button size="sm" disabled={!rows.length} onClick={() => downloadFile('landvas-audit.csv', toCsv(rows), 'text/csv')}><Download className="h-4 w-4" /> Export loaded rows</Button>} />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
          <input className="p-input w-full max-w-sm" placeholder="Search actions, targets and details" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the audit log" />
          <select className="p-input" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
            <option value="">Every action</option>
            {groups.map((g) => <optgroup key={g} label={words(g)}><option value={g}>All {words(g).toLowerCase()}</option>{actions.filter((a) => a.startsWith(`${g}.`)).map((a) => <option key={a} value={a}>{words(a.slice(g.length + 1))}</option>)}</optgroup>)}
          </select>
        </div>
        <div className="mt-3">
          {res.error ? <div className="p-4"><ErrorBox error={res.error} /></div> : !res.data ? <Loading /> : !rows.length ? <div className="p-4"><Empty title="No matching entries" /></div> : (
            <div className="p-scroll max-h-[calc(100vh-280px)]">
              <table className="p-table">
                <thead><tr><th style={{ width: 24 }} /><th>When</th><th>By</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead>
                <tbody>
                  {rows.map((a: any) => {
                    const on = open.has(a.id);
                    return [
                      <tr key={a.id} className="click" onClick={() => { const n = new Set(open); if (on) n.delete(a.id); else n.add(a.id); setOpen(n); }}>
                        <td>{on ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}</td>
                        <td className="whitespace-nowrap">{dateTime(a.created_at)}</td>
                        <td>{a.actor_id ? <Link onClick={(e) => e.stopPropagation()} className="hover:text-accent-2" to={`/players/${a.actor_id}`}>@{a.actor}</Link> : 'system'}</td>
                        <td><Badge>{a.action}</Badge></td>
                        <td className="max-w-[320px] truncate">{a.target_name ? <Link onClick={(e) => e.stopPropagation()} className="text-accent-2 hover:underline" to={`/players/${a.target_id}`}>@{a.target_name}</Link> : <span className="text-muted">{a.target_type} {a.target_id}</span>}</td>
                        <td className="max-w-[360px] truncate text-muted">{a.details?.reason ?? (a.details?.query ? <span className="p-mono">{a.details.query}</span> : '')}</td>
                      </tr>,
                      on && <tr key={`${a.id}-d`}><td /><td colSpan={5}><Json value={a.details} max={420} /></td></tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {res.hasNextPage && <div className="p-3 text-center"><Button size="sm" loading={res.isFetchingNextPage} onClick={() => void res.fetchNextPage()}>Load older entries</Button></div>}
      </Panel>
    </>
  );
}
