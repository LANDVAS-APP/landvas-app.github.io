// A player's money: earnings over time, every Ink and USD ledger line, and cash-outs.
import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api } from '../../../src/backend/api';
import { Button } from '../../../src/ui';
import { portal } from '../../shared/api';
import { TimeChart, SERIES } from '../../shared/charts';
import { DataTable, type Col } from '../../shared/table';
import { compact, date, dateShort, dateTime, downloadFile, duration, int, perDay, reasonName, resourceName, signed, toCsv, tzName, usd } from '../../shared/format';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Panel, Q, Seg, Stat, statusTone } from '../../shared/ui';

const RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: 'A year' }];

export function Earnings() {
  const me = useOutletContext<any>();
  const [days, setDays] = useState(30);
  const tz = tzName();
  const s = useQuery({ queryKey: ['me', 'series', days, tz], queryFn: () => portal.meSeries(days, tz) });
  const from = useMemo(() => new Date(Date.now() - days * 864e5).toISOString(), [days]);
  const r = useQuery({ queryKey: ['me', 'reasons', days], queryFn: () => portal.meLedger({ from, limit: 1 }) });
  const rate = Number(me.rent?.rate_usd_per_second ?? 0);
  return (
    <>
      <PageHeader title="Earnings" sub="What you earned and spent, day by day, and where it came from." actions={<Seg label="Time range" value={days} onChange={setDays} options={RANGES} />} />
      <Q q={s}>{(rows) => {
        const x = rows.map((d) => d.day);
        const inkIn = rows.reduce((a, d) => a + d.ink_in, 0), inkOut = rows.reduce((a, d) => a + d.ink_out, 0), usdIn = rows.reduce((a, d) => a + d.usd_rent, 0);
        const best = rows.reduce((m, d) => (d.ink_in > m.ink_in ? d : m), rows[0] ?? { ink_in: 0, day: '' });
        const totals = new Map<string, number>();
        for (const d of rows) for (const [k, v] of Object.entries(d.ink_reasons ?? {})) if (v > 0) totals.set(k, (totals.get(k) ?? 0) + v);
        const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
        const sources = [
          ...top.map((k, i) => ({ name: reasonName(k), values: rows.map((d) => Math.max(0, d.ink_reasons?.[k] ?? 0)), color: SERIES[i] })),
          { name: 'Other', values: rows.map((d) => Object.entries(d.ink_reasons ?? {}).filter(([k, v]) => v > 0 && !top.includes(k)).reduce((a, [, v]) => a + v, 0)), color: SERIES[6] },
        ];
        return (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Ink earned" value={compact(inkIn)} sub={`${compact(inkIn / Math.max(1, days))} a day on average`} />
              <Stat label="Ink spent" value={compact(inkOut)} />
              <Stat label="Net Ink" value={signed(inkIn - inkOut)} tone={inkIn >= inkOut ? 'ok' : undefined} />
              <Stat label="Best day" value={compact(best.ink_in)} sub={best.day ? dateShort(best.day) : undefined} />
              <Stat label="USD rent settled" value={usd(usdIn)} tone="gold" />
              <Stat label="Minigames won" value={int(rows.reduce((a, d) => a + d.wins, 0))} sub={`of ${int(rows.reduce((a, d) => a + d.sessions, 0))} played`} />
            </div>
            <Panel title="Ink earned each day, by source"><TimeChart type="stack" x={x} series={sources} format={(v) => int(v)} height={250} /></Panel>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Ink spent each day"><TimeChart type="bar" x={x} series={[{ name: 'Spent', values: rows.map((d) => d.ink_out), color: SERIES[1] }]} format={(v) => int(v)} height={200} /></Panel>
              <Panel title="USD rent each day"><TimeChart type="area" x={x} series={[{ name: 'Rent', values: rows.map((d) => d.usd_rent), color: SERIES[3] }]} format={(v) => usd(v)} height={200} /></Panel>
            </div>
          </div>
        );
      }}</Q>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title={`Every source and spend, last ${days} days`} pad={false}>
          <Q q={r}>{(d) => (
            <DataTable rows={d.reasons} rowKey={(x) => `${x.resource}.${x.reason}`} cols={[
              { key: 'reason', label: 'What', sort: true, render: (x) => reasonName(x.reason) },
              { key: 'resource', label: 'Resource', sort: true, render: (x) => resourceName(x.resource) },
              { key: 'in', label: 'Earned', num: true, sort: true, render: (x) => (x.in ? <span className="text-ok">+{int(x.in)}</span> : '—') },
              { key: 'out', label: 'Spent', num: true, sort: true, render: (x) => (x.out ? `−${int(x.out)}` : '—') },
              { key: 'n', label: 'Times', num: true, sort: true, render: (x) => int(x.n) },
            ]} empty={<Empty title="Nothing in this range" />} />
          )}</Q>
        </Panel>
        <Panel title="At your current rent rate">
          <p className="mb-3 text-sm text-muted">What your plots earn in USD if nothing changes, before boosts.</p>
          <div className="grid gap-1.5 text-sm">
            {[['An hour', 3600], ['A day', 86400], ['A week', 604800], ['30 days', 2592000], ['A year', 31536000]].map(([l, sec]) => (
              <div key={l as string} className="flex justify-between border-b border-line/60 pb-1.5"><span className="text-muted">{l}</span><b className="tnum">{usd(rate * (sec as number))}</b></div>
            ))}
          </div>
          {Number(me.rent_mult) !== 1 && <p className="mt-3 text-xs text-muted">Includes your ×{Number(me.rent_mult).toFixed(2)} rent bonus.</p>}
        </Panel>
      </div>
    </>
  );
}

export function Ledger() {
  const [resource, setResource] = useState<string>('ink');
  const [reason, setReason] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['me', 'ledger', resource, reason, from, to],
    queryFn: ({ pageParam }) => portal.meLedger({ resource: resource === 'all' ? null : resource, reason: reason || null, from: from ? new Date(from).toISOString() : null, to: to ? new Date(`${to}T23:59:59`).toISOString() : null, before: pageParam, limit: 200 }),
    initialPageParam: null as number | null,
    getNextPageParam: (l) => l.next,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const reasons = (q.data?.pages[0]?.reasons ?? []).filter((r) => resource === 'all' || r.resource === resource);
  const loadedIn = rows.reduce((a, r) => a + Math.max(0, r.delta), 0), loadedOut = rows.reduce((a, r) => a + Math.max(0, -r.delta), 0);
  const cols: Col<any>[] = [
    { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) },
    { key: 'resource', label: 'Resource', render: (r) => resourceName(r.resource) },
    { key: 'reason', label: 'What for', render: (r) => <span>{reasonName(r.reason)}{r.staff && <span className="text-faint"> (by LANDVAS)</span>}</span> },
    { key: 'delta', label: 'Change', num: true, render: (r) => <b className={r.delta > 0 ? 'text-ok' : 'text-muted'}>{signed(r.delta)}</b> },
    { key: 'balance_after', label: 'Balance after', num: true, render: (r) => int(r.balance_after) },
  ];
  return (
    <>
      <PageHeader title="Ink & resources" sub="Every time your Ink, pigments, XP or gallery tokens changed, newest first."
        actions={<Button size="sm" disabled={!rows.length} onClick={() => downloadFile(`my-landvas-${resource}.csv`, toCsv(rows), 'text/csv')}><Download className="h-4 w-4" /> Download loaded rows</Button>} />
      <Panel pad={false}>
        <div className="flex flex-wrap items-end gap-3 px-4 pt-4">
          <Seg value={resource} onChange={(v) => { setResource(v); setReason(''); }} options={['ink', 'pigments', 'brush_points', 'gallery_tokens', 'all'].map((r) => ({ value: r, label: r === 'all' ? 'Everything' : resourceName(r) }))} />
          <select className="p-input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="What for">
            <option value="">Every reason</option>
            {reasons.map((r) => <option key={`${r.resource}.${r.reason}`} value={r.reason}>{reasonName(r.reason)} ({int(r.n)})</option>)}
          </select>
          <label className="grid gap-0.5"><span className="p-label">From</span><input type="date" className="p-input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="grid gap-0.5"><span className="p-label">To</span><input type="date" className="p-input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          {(from || to || reason) && <button className="pb-2 text-sm text-accent-2" onClick={() => { setFrom(''); setTo(''); setReason(''); }}>Clear</button>}
        </div>
        {rows.length > 0 && <p className="px-4 pt-2 text-xs text-muted">{int(rows.length)} entries loaded: +{int(loadedIn)} / −{int(loadedOut)}</p>}
        <div className="mt-2">
          {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <Loading /> : <DataTable rows={rows} rowKey={(r) => String(r.id)} cols={cols} maxHeight="calc(100vh - 300px)" empty={<Empty title="No entries match" />} />}
        </div>
        {q.hasNextPage && <div className="p-3 text-center"><Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load older entries</Button></div>}
      </Panel>
    </>
  );
}

export function Usd() {
  const me = useOutletContext<any>();
  const [kind, setKind] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['me', 'rent', kind],
    queryFn: ({ pageParam }) => portal.meRent({ kind, before: pageParam, limit: 200 }),
    initialPageParam: null as number | null,
    getNextPageParam: (l) => l.next,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const totals = q.data?.pages[0]?.totals ?? {};
  const asc = [...rows].reverse();
  const rent = me.rent ?? {};
  return (
    <>
      <PageHeader title="USD rent" sub="Your plots’ rent is added up every time you open the game. Each line here is one of those, or a cash-out, conversion or adjustment."
        actions={<Button size="sm" disabled={!rows.length} onClick={() => downloadFile('my-landvas-usd.csv', toCsv(rows), 'text/csv')}><Download className="h-4 w-4" /> Download loaded rows</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Balance now" value={usd(rent.live_usd, { max: 9 })} tone="gold" sub={`${usd(rent.held_usd)} held for a cash-out`} />
        <Stat label="Earned ever" value={usd(rent.lifetime_usd)} />
        <Stat label="Paid out" value={usd(rent.paid_usd)} />
        <Stat label="Current rate" value={`${usd(perDay(rent.rate_usd_per_second))}/day`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={`p-chip ${kind === null ? 'on' : ''}`} onClick={() => setKind(null)}>Everything</button>
        {Object.entries(totals).map(([k, v]) => <button key={k} className={`p-chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{reasonName(k)} <span className="tnum text-faint">{usd(v.usd)} · {int(v.n)}</span></button>)}
      </div>
      {asc.length > 1 && !kind && (
        <Panel className="mt-3" title="Balance over time">
          <TimeChart x={asc.map((r) => r.created_at)} xFormat={dateShort} series={[{ name: 'Balance', values: asc.map((r) => Number(r.balance_after)), color: SERIES[3] }]} format={(v) => usd(v)} height={200} />
        </Panel>
      )}
      <Panel className="mt-3" pad={false} title="Every entry, newest first">
        {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <Loading /> : (
          <DataTable rows={rows} rowKey={(r) => String(r.id)} maxHeight="calc(100vh - 340px)" empty={<Empty title="No rent yet">Own a plot and open the game to collect your first rent.</Empty>} cols={[
            { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) },
            { key: 'kind', label: 'What', render: (r) => <span>{reasonName(r.kind)}{r.staff && <span className="text-faint"> (by LANDVAS)</span>}</span> },
            { key: 'amount_usd', label: 'Amount', num: true, render: (r) => <b className={r.amount_usd > 0 ? 'text-ok' : 'text-muted'}>{usd(r.amount_usd)}</b> },
            { key: 'balance_after', label: 'Balance after', num: true, render: (r) => usd(r.balance_after) },
            { key: 'seconds', label: 'Time covered', num: true, render: (r) => (r.seconds ? duration(Number(r.seconds) * 1000) : '—') },
            { key: 'boosted_seconds', label: 'Boosted', num: true, render: (r) => (Number(r.boosted_seconds) ? duration(Number(r.boosted_seconds) * 1000) : '—') },
            { key: 'rate', label: 'Rate then', num: true, render: (r) => (r.rate_usd_per_second ? `${usd(perDay(r.rate_usd_per_second))}/day` : '—') },
          ]} />
        )}
        {q.hasNextPage && <div className="p-3 text-center"><Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load older entries</Button></div>}
      </Panel>
    </>
  );
}

export function Cashouts() {
  const q = useQuery({ queryKey: ['me', 'cashout'], queryFn: api.cashoutStatus });
  return (
    <>
      <PageHeader title="Cash-outs" sub="Turning your USD rent into real money. Requests are made in the game." />
      <Q q={q}>{(d) => (
        <div className="grid gap-3">
          <Panel>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={d.enabled ? 'ok' : 'muted'}>{d.enabled ? 'Cash-outs are open' : 'Cash-outs aren’t open yet'}</Badge>
              <span className="text-sm text-muted">Minimum {usd(d.minimum_usd)}{d.methods?.length ? ` · ${d.methods.join(', ').replace(/_/g, ' ')}` : ''}</span>
            </div>
            {d.message && <p className="mt-2 text-sm">{d.message}</p>}
            {d.open_request && <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">You have a request for <b>{usd(d.open_request.amount_usd)}</b> waiting since {date(d.open_request.created_at)}.</p>}
          </Panel>
          <Panel title="Your requests" pad={false}>
            <DataTable rows={d.history ?? []} rowKey={(r) => r.id} empty={<Empty title="No cash-outs yet" />} cols={[
              { key: 'created_at', label: 'Requested', render: (r) => dateTime(r.created_at) },
              { key: 'amount_usd', label: 'Amount', num: true, render: (r) => usd(r.amount_usd) },
              { key: 'method', label: 'Method', render: (r) => String(r.method).replace(/_/g, ' ') },
              { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
              { key: 'decided_at', label: 'Decided', render: (r) => dateTime(r.decided_at) },
            ]} />
          </Panel>
        </div>
      )}</Q>
    </>
  );
}

