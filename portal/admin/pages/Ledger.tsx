// Every balance change in the game, newest first: Ink, pigments, XP, tokens, and USD.
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '../../../src/ui';
import { portal } from '../../shared/api';
import { DataTable, type Col } from '../../shared/table';
import { dateTime, downloadFile, duration, int, perDay, reasonName, resourceName, signed, toCsv, usd } from '../../shared/format';
import { ErrorBox, Loading, PageHeader, Panel, Seg, useDebounced } from '../../shared/ui';

export default function Ledger() {
  const [kind, setKind] = useState<'resource' | 'usd'>('resource');
  const [resource, setResource] = useState<string>('all');
  const [reason, setReason] = useState('');
  const dReason = useDebounced(reason.trim(), 300);
  const q = useInfiniteQuery({
    queryKey: ['portal', 'ledger-all', kind, resource, dReason],
    queryFn: ({ pageParam }) => portal.ledger({ kind, resource: kind === 'usd' || resource === 'all' ? null : resource, reason: dReason || null, before: pageParam, limit: 200 }),
    initialPageParam: null as number | null,
    getNextPageParam: (l) => l.next,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const player: Col<any> = { key: 'username', label: 'Player', render: (r) => <Link className="hover:text-accent-2" to={`/players/${r.player_id}`}>@{r.username}</Link> };
  const cols: Col<any>[] = kind === 'usd' ? [
    { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) }, player,
    { key: 'kind', label: 'Kind', render: (r) => reasonName(r.kind) },
    { key: 'amount_usd', label: 'Amount', num: true, render: (r) => <b className={r.amount_usd > 0 ? 'text-ok' : 'text-muted'}>{usd(r.amount_usd)}</b> },
    { key: 'balance_after', label: 'Balance after', num: true, render: (r) => usd(r.balance_after) },
    { key: 'seconds', label: 'Time covered', num: true, render: (r) => (r.seconds ? duration(Number(r.seconds) * 1000) : '—') },
    { key: 'rate', label: 'Rate / day', num: true, render: (r) => (r.rate_usd_per_second ? usd(perDay(r.rate_usd_per_second)) : '—') },
  ] : [
    { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) }, player,
    { key: 'resource', label: 'Resource', render: (r) => resourceName(r.resource) },
    { key: 'reason', label: 'Reason', render: (r) => <span>{reasonName(r.reason)} <span className="p-mono text-faint">{r.reason}</span>{r.actor && <span className="text-faint"> by @{r.actor}</span>}</span> },
    { key: 'delta', label: 'Change', num: true, render: (r) => <b className={r.delta > 0 ? 'text-ok' : 'text-muted'}>{signed(r.delta)}</b> },
    { key: 'balance_after', label: 'Balance after', num: true, render: (r) => int(r.balance_after) },
    { key: 'ref', label: 'Reference', render: (r) => <span className="text-xs text-faint">{[r.ref_type, r.ref_id].filter(Boolean).join(' ') || '—'}</span> },
  ];
  return (
    <>
      <PageHeader title="Ledger" sub="Every change to every balance, as it was written. Nothing here can be edited; corrections are new entries."
        actions={<Button size="sm" disabled={!rows.length} onClick={() => downloadFile(`landvas-ledger-${kind}.csv`, toCsv(rows), 'text/csv')}><Download className="h-4 w-4" /> Export loaded rows</Button>} />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
          <Seg value={kind} onChange={(k) => { setKind(k); setReason(''); }} options={[{ value: 'resource', label: 'Ink & resources' }, { value: 'usd', label: 'USD' }]} />
          {kind === 'resource' && <Seg value={resource} onChange={setResource} options={['all', 'ink', 'pigments', 'brush_points', 'gallery_tokens'].map((r) => ({ value: r, label: r === 'all' ? 'All' : resourceName(r) }))} />}
          <input className="p-input w-60" placeholder={kind === 'usd' ? 'Kind, e.g. rent' : 'Reason, e.g. minigame_reward'} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Filter by reason" />
        </div>
        <div className="mt-3">
          {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <Loading /> : <DataTable rows={rows} rowKey={(r) => String(r.id)} cols={cols} maxHeight="calc(100vh - 300px)" />}
        </div>
        {q.hasNextPage && <div className="p-3 text-center"><Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load older entries</Button></div>}
      </Panel>
    </>
  );
}
