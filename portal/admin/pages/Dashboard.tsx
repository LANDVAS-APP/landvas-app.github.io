// The dashboard: the world right now, what needs attention, and every daily trend.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../../src/backend/api';
import { useNotifications } from '../../../src/updates/Notifications';
import { portal, type Day } from '../../shared/api';
import { HBars, TimeChart, SERIES } from '../../shared/charts';
import { ago, compact, int, perDay, perMonth, reasonName, tzName, usd, words } from '../../shared/format';
import { Badge, ErrorBox, Loading, PageHeader, Panel, Seg, Stat, useTicker } from '../../shared/ui';

const RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 180, label: '180 days' }];

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const tz = tzName();
  const ov = useQuery({ queryKey: ['admin', 'overview'], queryFn: api.admin.overview, refetchInterval: 30_000 });
  const series = useQuery({ queryKey: ['portal', 'series', days, tz], queryFn: () => portal.series(days, tz), refetchInterval: 120_000 });
  return (
    <>
      <PageHeader title="Dashboard" sub="Live numbers for the whole of LANDVAS. Finished days are worked out once and kept; today keeps updating." />
      {ov.error && <ErrorBox error={ov.error} retry={() => void ov.refetch()} />}
      {ov.data ? <WorldNow d={ov.data} /> : !ov.error && <Loading />}
      <Attention />
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-body)' }}>Trends</h2>
        <Seg label="Time range" value={days} options={RANGES} onChange={setDays} />
      </div>
      {series.error ? <ErrorBox error={series.error} retry={() => void series.refetch()} /> : !series.data ? <Loading label="Working out the daily numbers…" /> : <Trends days={series.data.days} />}
      <RecentAudit />
    </>
  );
}

function WorldNow({ d }: { d: any }) {
  const rate = Number(d.rent?.rate_usd_per_second ?? 0);
  const owed = useTicker(Number(d.rent?.settled_liability_usd ?? 0), rate, d.server_time);
  const tiles: [string, number | string, string | undefined, string?][] = [
    ['Online now', d.players_active_15m ?? 0, 'last 15 minutes'],
    ['Active today', d.players_active_24h ?? 0, `${int(d.signups_24h)} new in 24 h`],
    ['Players', d.players_total ?? 0, undefined, '/players'],
    ['Plots owned', d.plots_owned ?? 0, `${int(d.plots_claimed_24h ?? 0)} claimed in 24 h`, '/map'],
    ['Ink minted 24 h', d.ink_issued_24h ?? 0, `${compact(d.ink_spent_24h)} spent`, '/economy'],
    ['Minigames 24 h', d.minigame_sessions_24h ?? 0, `${int(d.minigame_wins_24h ?? 0)} wins`],
    ['Flagged runs', d.flagged_sessions ?? 0, `${int(d.gps_jumps_24h ?? 0)} GPS jumps in 24 h`, '/tools/integrity'],
    ['Client errors 24 h', d.client_errors_24h ?? 0, undefined, '/tools/system'],
  ];
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)]">
      <section className="p-panel relative overflow-hidden p-5">
        <WorldGrid />
        <div className="relative">
        <div className="p-label">Owed to players right now</div>
        <div className="p-figure mt-2 text-[clamp(30px,3.4vw,46px)] text-gold" data-testid="world-owed">{usd(owed, { max: 6, min: 6 })}</div>
        <div className="mt-1 text-sm text-muted">USD rent, settled and still accruing, held cash-outs included</div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
          <div><div className="p-label">World rate</div><div className="mt-0.5 font-semibold tnum">{usd(perDay(rate))}<span className="text-muted">/day</span></div></div>
          <div><div className="p-label">A month at this rate</div><div className="mt-0.5 font-semibold tnum">{usd(perMonth(rate))}</div></div>
          <div><div className="p-label">Paid out ever</div><div className="mt-0.5 font-semibold tnum">{usd(d.rent?.paid_usd ?? 0)}</div></div>
        </div>
        <div className="mt-3 text-xs text-muted">{int(d.rent?.boosted_players_now ?? 0)} players have a rent boost running · lifetime rent {usd(d.rent?.lifetime_usd ?? 0)}</div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([l, v, sub, to]) => {
          const body = <Stat label={l} value={typeof v === 'number' ? compact(v) : v} sub={sub} className="h-full" />;
          return to ? <Link key={l} to={to} className="block rounded-2xl hover:brightness-110">{body}</Link> : <div key={l}>{body}</div>;
        })}
      </div>
    </div>
  );
}

/** a faint field of plots behind the headline figure */
function WorldGrid() {
  return (
    <svg aria-hidden className="pointer-events-none absolute -right-10 -top-10 opacity-[0.16]" width="176" height="176" viewBox="0 0 220 220">
      {Array.from({ length: 100 }, (_, i) => {
        const x = i % 10, y = Math.floor(i / 10);
        const on = (x * 7 + y * 13) % 11 === 0;
        return <rect key={i} x={x * 22 + 2} y={y * 22 + 2} width={18} height={18} rx={3} fill={on ? 'var(--gold)' : 'rgba(160,180,255,0.35)'} opacity={on ? 0.9 : 0.25 + ((x + y) % 4) * 0.08} />;
      })}
    </svg>
  );
}

function Attention() {
  const review = useQuery({ queryKey: ['admin', 'review-mode'], queryFn: api.admin.reviewMode });
  const notes = useNotifications();
  const cash = useQuery({ queryKey: ['admin', 'cashouts', 'requested'], queryFn: () => api.admin.cashoutQueue('requested') });
  const items: [string, number, string][] = [
    ['Artwork waiting for review', review.data?.pending ?? 0, '/tools/review'],
    ['Open support tickets', notes.data?.open_tickets_staff ?? 0, '/tools/support'],
    ['Cash-outs to decide', cash.data?.length ?? 0, '/tools/cashouts'],
    ['Update drafts to approve', notes.data?.drafts_staff ?? 0, '/tools/updates'],
  ];
  const open = items.filter(([, n]) => n > 0);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {open.length ? open.map(([l, n, to]) => (
        <Link key={l} to={to} className="inline-flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-1.5 hover:bg-warn/15">
          <b className="tnum">{n}</b> {l}
        </Link>
      )) : <span className="text-muted">Nothing is waiting on you: no art to review, no open tickets, no cash-outs.</span>}
    </div>
  );
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function Trends({ days }: { days: Day[] }) {
  const x = days.map((d) => d.day);
  const col = (f: (d: Day) => number) => days.map(f);
  // the biggest Ink sources over the range, the rest folded into "Other"
  const totals = new Map<string, number>();
  for (const d of days) for (const [r, v] of Object.entries(d.ink_reasons ?? {})) if (v > 0) totals.set(r, (totals.get(r) ?? 0) + v);
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r]) => r);
  const sources = [
    ...top.map((r, i) => ({ name: reasonName(r), values: col((d) => Math.max(0, d.ink_reasons?.[r] ?? 0)), color: SERIES[i] })),
    { name: 'Other', values: col((d) => Object.entries(d.ink_reasons ?? {}).filter(([r, v]) => v > 0 && !top.includes(r)).reduce((a, [, v]) => a + v, 0)), color: SERIES[6] },
  ];
  const sinks = new Map<string, number>();
  for (const d of days) for (const [r, v] of Object.entries(d.ink_reasons ?? {})) if (v < 0) sinks.set(r, (sinks.get(r) ?? 0) - v);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Players">
        <TimeChart x={x} series={[{ name: 'Active players', values: col((d) => d.active ?? 0) }, { name: 'New sign-ups', values: col((d) => d.signups ?? 0) }]} />
        <p className="mt-2 text-xs text-muted">Active means earned, spent or played anything that day. {int(sum(col((d) => d.signups ?? 0)))} sign-ups in this range.</p>
      </Panel>
      <Panel title="Ink created and spent">
        <TimeChart type="bar" x={x} series={[{ name: 'Created', values: col((d) => d.ink_in) }, { name: 'Spent', values: col((d) => d.ink_out) }]} format={(v) => int(v)} />
        <p className="mt-2 text-xs text-muted">{compact(sum(col((d) => d.ink_in)))} created, {compact(sum(col((d) => d.ink_out)))} spent, net {compact(sum(col((d) => d.ink_in - d.ink_out)))}.</p>
      </Panel>
      <Panel title="Where new Ink comes from">
        <TimeChart type="stack" x={x} series={sources} format={(v) => int(v)} height={240} />
      </Panel>
      <Panel title="Where Ink goes">
        <HBars items={[...sinks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([r, v], i) => ({ key: r, label: reasonName(r), value: v, color: SERIES[(i + 1) % 8] }))} format={(v) => compact(v)} />
        {!sinks.size && <p className="text-sm text-muted">No Ink was spent in this range.</p>}
      </Panel>
      <Panel title="USD rent earned by players">
        <TimeChart type="area" x={x} series={[{ name: 'Rent', values: col((d) => d.usd_rent), color: SERIES[3] }]} format={(v) => usd(v)} />
        <p className="mt-2 text-xs text-muted">{usd(sum(col((d) => d.usd_rent)))} of rent settled into players’ balances in this range.</p>
      </Panel>
      <Panel title="Plots bought and claimed">
        <TimeChart type="bar" x={x} series={[{ name: 'Plots', values: col((d) => d.plots), color: SERIES[2] }]} format={(v) => int(v)} />
        <p className="mt-2 text-xs text-muted">{int(sum(col((d) => d.plots)))} plots taken, {int(sum(col((d) => d.released)))} given back.</p>
      </Panel>
      <Panel title="Plot minigames">
        <TimeChart x={x} series={[{ name: 'Games started', values: col((d) => d.sessions) }, { name: 'Wins', values: col((d) => d.wins) }]} />
      </Panel>
      <Panel title="Cash-out requests">
        <TimeChart type="bar" x={x} series={[{ name: 'Requested', values: col((d) => d.cashout_usd), color: SERIES[3] }]} format={(v) => usd(v)} />
        <p className="mt-2 text-xs text-muted">{int(sum(col((d) => d.cashouts)))} requests worth {usd(sum(col((d) => d.cashout_usd)))}.</p>
      </Panel>
    </div>
  );
}

function RecentAudit() {
  const q = useQuery({ queryKey: ['portal', 'audit', 'recent'], queryFn: () => portal.audit({ limit: 10 }) });
  return (
    <Panel className="mt-3" title="Latest staff actions" actions={<Link to="/audit" className="text-sm text-accent-2 hover:underline">Full audit log</Link>}>
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <Loading /> : !q.data.rows.length ? <p className="text-sm text-muted">No staff actions yet.</p> : (
        <ul className="grid gap-1.5 text-sm">
          {q.data.rows.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="w-20 shrink-0 text-xs text-faint">{ago(a.created_at)}</span>
              <b>@{a.actor ?? 'system'}</b>
              <Badge>{words(a.action)}</Badge>
              {a.target_name ? <Link className="text-accent-2 hover:underline" to={`/players/${a.target_id}`}>@{a.target_name}</Link> : a.target_id && <span className="truncate text-muted">{a.target_type} {String(a.target_id).slice(0, 40)}</span>}
              {a.details?.reason && <span className="truncate text-muted">“{a.details.reason}”</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
