// The economy: money owed, Ink in and out by reason, what's in circulation, rarity reality vs the odds, top holders.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { InkPacing } from '../../../src/admin/InkPacing';
import { portal } from '../../shared/api';
import { HBars, Split, SERIES } from '../../shared/charts';
import { DataTable } from '../../shared/table';
import { compact, int, pct, perDay, perMonth, reasonName, resourceName, usd, words } from '../../shared/format';
import { PageHeader, Panel, Q, Rarity, Seg, Stat } from '../../shared/ui';

export default function Economy() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['portal', 'economy', days], queryFn: () => portal.economy(days), refetchInterval: 120_000 });
  return (
    <>
      <PageHeader title="Economy" sub="Where Ink and USD come from and go, who holds them, and how plot rarities have actually landed compared with the odds you set."
        actions={<Seg label="Time range" value={days} onChange={setDays} options={[{ value: 1, label: '24 h' }, { value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: 'A year' }]} />} />
      <Q q={q}>{(d) => <Body d={d} days={days} />}</Q>
      <div className="mt-3"><Panel title="Hidden Ink pacing"><InkPacing /></Panel></div>
    </>
  );
}

function Body({ d, days }: { d: any; days: number }) {
  const flows = (d.flows ?? []) as { resource: string; reason: string; in: number; out: number; n: number; players: number }[];
  const ink = flows.filter((f) => f.resource === 'ink');
  const inkIn = ink.reduce((a, f) => a + Number(f.in), 0), inkOut = ink.reduce((a, f) => a + Number(f.out), 0);
  const circ = d.circulation ?? {};
  const owned = (d.rarities ?? []).reduce((a: number, r: any) => a + Number(r.owned), 0) || 1;
  const weights = (d.rarities ?? []).filter((r: any) => !r.ppm).reduce((a: number, r: any) => a + Number(r.weight), 0) || 1;
  const rate = Number(d.world_rate_usd_per_second ?? 0);
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Owed to players" value={usd(Number(d.usd.balance) + Number(d.usd.held))} tone="gold" sub={`${usd(d.usd.held)} held for cash-outs`} />
        <Stat label="World rent per day" value={usd(perDay(rate))} sub={`${usd(perMonth(rate))} a month before boosts`} />
        <Stat label="Rent earned ever" value={usd(d.usd.lifetime)} sub={`${usd(d.usd.paid)} paid out`} />
        <Stat label={`Ink created, ${days === 1 ? '24 h' : `${days} days`}`} value={compact(inkIn)} />
        <Stat label="Ink spent" value={compact(inkOut)} sub={`net ${compact(inkIn - inkOut)}`} />
        <Stat label="Ink in circulation" value={compact(circ.ink?.total ?? 0)} sub={`${int(circ.ink?.holders ?? 0)} holders · largest ${compact(circ.ink?.max ?? 0)}`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Ink created, by source">
          <HBars items={ink.filter((f) => f.in > 0).sort((a, b) => b.in - a.in).map((f, i) => ({ key: f.reason, label: reasonName(f.reason), value: Number(f.in), color: SERIES[i % 8], note: `${int(f.players)} players` }))} format={compact} />
        </Panel>
        <Panel title="Ink spent, by purpose">
          <HBars items={ink.filter((f) => f.out > 0).sort((a, b) => b.out - a.out).map((f, i) => ({ key: f.reason, label: reasonName(f.reason), value: Number(f.out), color: SERIES[(i + 1) % 8], note: `${int(f.players)} players` }))} format={compact} />
        </Panel>
      </div>
      <Panel title="Every flow in this range" pad={false}>
        <DataTable rows={flows} rowKey={(r) => `${r.resource}.${r.reason}`} maxHeight={420} cols={[
          { key: 'resource', label: 'Resource', sort: true, render: (r) => resourceName(r.resource) },
          { key: 'reason', label: 'Reason', sort: true, render: (r) => <span>{reasonName(r.reason)} <span className="p-mono text-faint">{r.reason}</span></span> },
          { key: 'in', label: 'Created', num: true, sort: true, render: (r) => (r.in ? <span className="text-ok">+{int(r.in)}</span> : '—') },
          { key: 'out', label: 'Spent', num: true, sort: true, render: (r) => (r.out ? `−${int(r.out)}` : '—') },
          { key: 'n', label: 'Entries', num: true, sort: true, render: (r) => int(r.n) },
          { key: 'players', label: 'Players', num: true, sort: true, render: (r) => int(r.players) },
        ]} />
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="USD movements in this range">
          <HBars items={(d.usd_flows ?? []).map((f: any, i: number) => ({ key: f.kind, label: reasonName(f.kind), value: Math.abs(Number(f.usd)), color: SERIES[(i + 3) % 8], note: `${int(f.n)} entries` }))} format={(v) => usd(v)} />
        </Panel>
        <Panel title="Everything in circulation">
          <DataTable rows={Object.entries(circ).map(([k, v]: any) => ({ k, ...v }))} rowKey={(r: any) => r.k} cols={[
            { key: 'k', label: 'Resource', render: (r: any) => resourceName(r.k) },
            { key: 'total', label: 'Total', num: true, render: (r: any) => int(r.total) },
            { key: 'holders', label: 'Holders', num: true, render: (r: any) => int(r.holders) },
            { key: 'max', label: 'Largest balance', num: true, render: (r: any) => int(r.max) },
          ]} />
        </Panel>
      </div>
      <Panel title="Rarities: what players own, against the odds" pad={false}>
        <div className="px-4 pb-1 text-sm text-muted">Usual-table share is each rarity’s weight over all weights; ultra rarities roll separately (parts per million). Owned share is out of {int(owned)} owned plots.</div>
        <DataTable rows={d.rarities ?? []} rowKey={(r: any) => r.id} cols={[
          { key: 'id', label: 'Rarity', render: (r: any) => <Rarity id={r.id} /> },
          { key: 'owned', label: 'Owned', num: true, sort: true, render: (r: any) => int(r.owned) },
          { key: 'share', label: 'Owned share', num: true, sort: (r: any) => r.owned / owned, render: (r: any) => pct(r.owned / owned, 2) },
          { key: 'odds', label: 'Odds', num: true, render: (r: any) => (r.ppm ? `${int(r.ppm)} ppm` : pct(r.weight / weights, 2)) },
          { key: 'shiny', label: 'Shiny', num: true, sort: true, render: (r: any) => int(r.shiny) },
          { key: 'owners', label: 'Owners', num: true, sort: true, render: (r: any) => int(r.owners) },
          { key: 'usd_per_second', label: 'Base rent / day', num: true, sort: true, render: (r: any) => usd(perDay(r.usd_per_second)) },
        ]} />
        <div className="px-4 pb-4 pt-3"><Link to="/tools/earnings" className="text-sm text-accent-2 hover:underline">Change odds and rates</Link></div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Owned plots by type"><HBars items={(d.plot_types ?? []).filter((t: any) => t.owned > 0).map((t: any, i: number) => ({ key: t.id, label: t.name ?? words(t.id), value: Number(t.owned), color: SERIES[i % 8] }))} /></Panel>
        <Panel title="Plots by what they’re used for"><Split parts={Object.entries(d.kinds ?? {}).map(([k, v]) => ({ label: words(k), value: Number(v) }))} /></Panel>
        <Panel title="Enchantments by kind"><HBars items={Object.entries(d.enchantments ?? {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v], i) => ({ key: k, label: words(k), value: Number(v), color: SERIES[i % 8] }))} /></Panel>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TopList title="Most Ink held" rows={d.top_ink} format={compact} />
        <TopList title={`Most Ink earned, ${days === 1 ? '24 h' : `${days} days`}`} rows={d.top_earned} format={compact} />
        <TopList title="Most USD owed" rows={d.top_usd} format={(v) => usd(v)} />
        <TopList title="Most plots" rows={d.top_plots} format={int} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Cash-outs, all time">
          <DataTable rows={Object.entries(d.cashouts ?? {}).map(([k, v]: any) => ({ k, ...v }))} rowKey={(r: any) => r.k} empty={<p className="text-sm text-muted">No cash-out requests yet.</p>} cols={[
            { key: 'k', label: 'Status', render: (r: any) => words(r.k) }, { key: 'n', label: 'Requests', num: true, render: (r: any) => int(r.n) }, { key: 'usd', label: 'Amount', num: true, render: (r: any) => usd(r.usd) },
          ]} />
        </Panel>
        <Panel title="Ink pacing today">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Players paced" value={int(d.pacing_today?.players)} />
            <Stat label="Slowed down now" value={int(d.pacing_today?.slowed)} />
            <Stat label="Raw Ink earned" value={compact(d.pacing_today?.earned)} />
            <Stat label="Ink paid" value={compact(d.pacing_today?.paid)} sub={d.pacing_today?.earned ? `${pct(d.pacing_today.paid / d.pacing_today.earned)} of raw` : undefined} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TopList({ title, rows, format }: { title: string; rows: { id: string; username: string; value: number }[]; format(v: number): string }) {
  return (
    <Panel title={title}>
      <ol className="grid gap-1 text-sm">
        {(rows ?? []).map((r, i) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2"><span className="w-5 text-right text-xs text-faint tnum">{i + 1}</span><Link className="truncate hover:text-accent-2" to={`/players/${r.id}`}>@{r.username}</Link></span>
            <b className="tnum">{format(Number(r.value))}</b>
          </li>
        ))}
        {!rows?.length && <li className="text-muted">Nobody yet.</li>}
      </ol>
    </Panel>
  );
}

