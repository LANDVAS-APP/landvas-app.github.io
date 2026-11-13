// One player, all of it: account, money, plots, every ledger line, fair-play signals, every table they appear in.
import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Database, ExternalLink } from 'lucide-react';
import { api } from '../../../src/backend/api';
import { Button, PlayerAvatar, Tabs } from '../../../src/ui';
import { PlayerDetail } from '../../../src/admin/AdminScreen';
import { PlayerMinigameStats } from '../../../src/admin/PvpAdmin';
import { PlayerPlots } from '../../../src/admin/PlayerPlots';
import { rarityInfo } from '../../../src/shared/rarity';
import { portal, type WhoAmI } from '../../shared/api';
import { HBars, Split, TimeChart, SERIES } from '../../shared/charts';
import { PlotMap, type MapPlot } from '../../shared/PlotMap';
import { DataTable, type Col } from '../../shared/table';
import { ago, compact, date, dateTime, duration, int, perDay, perMonth, plotLabel, reasonName, resourceName, signed, tzName, usd, words, gameName } from '../../shared/format';
import { Badge, Cell, CopyText, Empty, ErrorBox, Json, KV, Loading, Panel, Q, Rarity, Seg, Stat, statusTone, useTicker } from '../../shared/ui';

const TABS = [
  { value: 'overview', label: 'Overview' }, { value: 'manage', label: 'Manage' }, { value: 'plots', label: 'Plots' }, { value: 'ledger', label: 'Ink ledger' },
  { value: 'usd', label: 'USD ledger' }, { value: 'games', label: 'Minigames' }, { value: 'fairplay', label: 'Fair play' }, { value: 'data', label: 'All data' }, { value: 'audit', label: 'History' },
];

export default function Player() {
  const { id = '', tab = 'overview' } = useParams();
  const nav = useNavigate();
  const p = useQuery({ queryKey: ['portal', 'player', id], queryFn: () => portal.player(id), refetchInterval: 60_000 });
  return (
    <>
      <Link to="/players" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> All players</Link>
      <Q q={p} label="Loading the player…">{(d) => (
        <>
          <Header d={d} id={id} />
          <Tabs value={tab} onValueChange={(t) => nav(`/players/${id}/${t}`, { replace: true })} className="mb-4 mt-5" items={TABS} />
          {tab === 'overview' && <Overview d={d} id={id} />}
          {tab === 'manage' && <div className="max-w-5xl"><PlayerDetail id={id} /></div>}
          {tab === 'plots' && <Plots id={id} username={d.profile.username} />}
          {tab === 'ledger' && <InkLedger id={id} totals={d.ledger_totals} />}
          {tab === 'usd' && <UsdLedger id={id} d={d} />}
          {tab === 'games' && <Games id={id} />}
          {tab === 'fairplay' && <FairPlay id={id} pacing={d.pacing} />}
          {tab === 'data' && <AllData id={id} />}
          {tab === 'audit' && <History rows={d.audit} />}
        </>
      )}</Q>
    </>
  );
}

function Header({ d, id }: { d: any; id: string }) {
  const pr = d.profile, pl = d.player;
  return (
    <div className="flex flex-wrap items-start gap-4">
      <PlayerAvatar p={pr} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="p-h1">@{pr.username}</h1>
          <Badge tone={statusTone(pl.status)}>{pl.status}{pl.suspended_until ? ` until ${date(pl.suspended_until)}` : ''}</Badge>
          {d.roles.map((r: any) => <Badge key={r.role} tone="accent">{r.role}</Badge>)}
          {pr.is_hidden && <Badge>profile hidden</Badge>}
          {pl.strikes > 0 && <Badge tone="bad">{pl.strikes} strike{pl.strikes > 1 ? 's' : ''}</Badge>}
          {pl.chat_muted_until && new Date(pl.chat_muted_until) > new Date() && <Badge tone="warn">muted until {dateTime(pl.chat_muted_until)}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {pr.display_name && <span>{pr.display_name}</span>}
          <CopyText text={d.auth.email ?? ''} label={d.auth.email ?? 'no email'} />
          <CopyText text={id} label={<span className="p-mono">{id}</span>} />
          <span>joined {date(pl.created_at)}</span>
          <span>seen {ago(pl.last_active_at)}</span>
        </div>
        {pl.suspension_reason && <p className="mt-1 text-sm text-warn">Reason: {pl.suspension_reason}</p>}
      </div>
      <div className="flex gap-2">
        <a href={`https://landvas.app/u/${encodeURIComponent(pr.username)}`} target="_blank" rel="noopener"><Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /> Profile in the game</Button></a>
      </div>
    </div>
  );
}

function Overview({ d, id }: { d: any; id: string }) {
  const rent = d.rent ?? {};
  const at = useMemo(() => Date.now(), [d]);
  const live = useTicker(Number(rent.live_usd ?? 0), Number(rent.rate_usd_per_second ?? 0) * (rent.boost?.active ? Number(rent.boost?.multiplier ?? 1) : 1), at);
  const [days, setDays] = useState(30);
  const tz = tzName();
  const s = useQuery({ queryKey: ['portal', 'player-series', id, days, tz], queryFn: () => portal.playerSeries(id, days, tz) });
  const b = d.balances ?? {};
  const rar = Object.entries(d.rarities ?? {}).map(([k, v]) => ({ label: rarityInfo(k).name || words(k), value: Number(v), color: rarityInfo(k).color, sort: rarityInfo(k).sort })).sort((a, b2) => a.sort - b2.sort);
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        <Stat label="USD balance" value={usd(live, { min: 6, max: 6 })} tone="gold" sub={`${usd(perDay(rent.rate_usd_per_second))}/day`} />
        <Stat label="Lifetime USD" value={usd(rent.lifetime_usd)} sub={`${usd(rent.paid_usd)} paid out`} />
        <Stat label="Ink" value={compact(b.ink)} />
        <Stat label="Pigments" value={compact(b.pigments)} />
        <Stat label="XP" value={compact(b.brush_points)} />
        <Stat label="Gallery tokens" value={compact(b.gallery_tokens)} />
        <Stat label="Plots" value={int(d.counts.plots)} sub={`${int(d.counts.plots_ever)} ever owned`} />
        <Stat label="Streak" value={int(d.streak?.streak ?? 0)} sub={`best ${int(d.streak?.best ?? 0)} · ${int(d.streak?.total_days ?? 0)} days played`} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Their last {days} days</h2>
        <Seg value={days} onChange={setDays} options={[{ value: 14, label: '14 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: 'A year' }]} />
      </div>
      <Q q={s}>{(rows) => (
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Ink earned and spent"><TimeChart type="bar" x={rows.map((r) => r.day)} series={[{ name: 'Earned', values: rows.map((r) => r.ink_in) }, { name: 'Spent', values: rows.map((r) => r.ink_out) }]} height={190} /></Panel>
          <Panel title="USD rent"><TimeChart type="area" x={rows.map((r) => r.day)} series={[{ name: 'Rent', values: rows.map((r) => r.usd_rent), color: SERIES[3] }]} format={(v) => usd(v)} height={190} /></Panel>
          <Panel title="Minigames"><TimeChart x={rows.map((r) => r.day)} series={[{ name: 'Played', values: rows.map((r) => r.sessions) }, { name: 'Won', values: rows.map((r) => r.wins) }]} height={190} /></Panel>
        </div>
      )}</Q>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Account">
          <KV items={[
            ['Email', d.auth.email], ['Email confirmed', d.auth.email_confirmed_at ? date(d.auth.email_confirmed_at) : 'not yet'], ['Last sign-in', dateTime(d.auth.last_sign_in_at)],
            ['Sign-in methods', (d.auth.providers ?? []).join(', ') || 'email'], ['Terms accepted', d.player.terms_version ? `${d.player.terms_version} on ${date(d.player.terms_accepted_at)}` : 'not yet'],
            ['Starter plot', d.player.starter_plot_claimed ? 'claimed' : 'not claimed'], ['Clan', d.clan ? `${d.clan.name} [${d.clan.tag}] · ${d.clan.role}` : 'none'],
            ['Invited by', d.referred_by ? <Link className="text-accent-2" to={`/players/${d.referred_by.id}`}>@{d.referred_by.username}</Link> : 'nobody'], ['Players they invited', int(d.invited)],
            ['Explorer', d.explorer ? `${words(d.explorer.mode)} at ${Number(d.explorer.lat).toFixed(3)}, ${Number(d.explorer.lng).toFixed(3)} · ${ago(d.explorer.updated_at)}` : 'not placed'], ['Last activity', d.activity ? `${words(d.activity.kind)} ${ago(d.activity.at)}` : '—'],
            ['Rent boost', rent.boost?.active ? `on, ${Math.round(rent.boost.remaining_seconds / 60)} min left` : `off · ${rent.boost?.used_today ?? 0}/${rent.boost?.free_per_day ?? 0} used today`],
          ]} />
        </Panel>
        <Panel title="What they have">
          <KV items={[
            ['Plot groups', int(d.counts.groups)], ['Enchantments', int(d.counts.enchantments)], ['Inkborn', int(d.counts.inkborn)], ['Achievements', int(d.counts.achievements)],
            ['Minigames played', int(d.counts.sessions)], ['Minigames won', int(d.counts.wins)], ['Friends', int(d.counts.friends)], ['Artworks', int(d.counts.publications)],
            ['Support tickets', int(d.counts.tickets)], ['Cash-out requests', int(d.counts.cashouts)], ['Rent per month', usd(perMonth(rent.rate_usd_per_second))], ['Held for cash-outs', usd(rent.held_usd)],
          ]} />
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Plots by rarity">{rar.length ? <Split parts={rar} /> : <p className="text-sm text-muted">No plots yet.</p>}</Panel>
        <Panel title="Plots by type"><HBars items={Object.entries(d.plot_types ?? {}).map(([k, v], i) => ({ key: k, label: words(k), value: Number(v), color: SERIES[i % 8] }))} /></Panel>
      </div>
      {d.cashouts?.length > 0 && (
        <Panel title="Cash-outs">
          <DataTable rows={d.cashouts} rowKey={(r: any) => r.id} cols={[
            { key: 'created_at', label: 'Requested', render: (r: any) => dateTime(r.created_at) }, { key: 'amount_usd', label: 'Amount', num: true, render: (r: any) => usd(r.amount_usd) },
            { key: 'method', label: 'Method' }, { key: 'destination', label: 'Destination' }, { key: 'status', label: 'Status', render: (r: any) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
            { key: 'risk_flags', label: 'Risk flags', render: (r: any) => (r.risk_flags ?? []).join(', ') || '—' }, { key: 'decided_at', label: 'Decided', render: (r: any) => dateTime(r.decided_at) }, { key: 'note', label: 'Note', render: (r: any) => r.note ?? '—' },
          ]} />
        </Panel>
      )}
    </div>
  );
}

function Plots({ id, username }: { id: string; username: string }) {
  const m = useQuery({ queryKey: ['portal', 'map', id], queryFn: () => portal.map(id) });
  const list = useQuery({ queryKey: ['portal', 'rows', 'world_plots', id], queryFn: () => portal.rows({ schema: 'public', table: 'world_plots', filters: [{ col: 'owner_id', op: 'eq', value: id }], sort: 'claimed_at', limit: 500 }) });
  const [focus, setFocus] = useState<{ gx: number; gy: number } | null>(null);
  const plots: MapPlot[] = useMemo(() => (m.data?.plots ?? []).map(([gx, gy, rarity, , shiny, type, , name]) => ({ gx, gy, rarity, shiny: !!shiny, title: name || `Plot ${plotLabel(gx, gy)}`, sub: `${rarityInfo(rarity).name} · ${words(type)}` })), [m.data]);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <PlotMap plots={plots} focus={focus} height={520} />
        <Panel title={`${int(list.data?.total ?? 0)} plots`} pad={false}>
          <Q q={list}>{(d) => (
            <DataTable rows={d.rows} rowKey={(r: any) => `${r.gx}_${r.gy}`} onRow={(r: any) => setFocus({ gx: r.gx, gy: r.gy })} selected={focus ? `${focus.gx}_${focus.gy}` : null} maxHeight={470}
              cols={[
                { key: 'rarity', label: 'Rarity', sort: true, render: (r: any) => <Rarity id={r.rarity} shiny={r.shiny} /> },
                { key: 'name', label: 'Plot', render: (r: any) => <span>{r.name ?? <span className="tnum text-muted">{plotLabel(r.gx, r.gy)}</span>}</span> },
                { key: 'plot_type', label: 'Type', sort: true, render: (r: any) => words(r.plot_type) },
                { key: 'level', label: 'Lvl', num: true, sort: true },
                { key: 'claimed_at', label: 'Since', sort: true, render: (r: any) => date(r.claimed_at) },
              ]} />
          )}</Q>
        </Panel>
      </div>
      <Panel title="Plot actions"><PlayerPlots playerId={id} username={username} /></Panel>
    </div>
  );
}

function InkLedger({ id, totals }: { id: string; totals: any[] }) {
  const [resource, setResource] = useState<string>('ink');
  const [reason, setReason] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['portal', 'ledger', id, resource, reason],
    queryFn: ({ pageParam }) => portal.ledger({ player: id, resource, reason, before: pageParam, limit: 200 }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const mine = totals.filter((t) => t.resource === resource);
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Panel title={`${resourceName(resource)} by reason, all time`}>
        <Seg value={resource} onChange={(r) => { setResource(r); setReason(null); }} options={['ink', 'pigments', 'brush_points', 'gallery_tokens'].map((r) => ({ value: r, label: resourceName(r) }))} />
        <div className="mt-4 grid gap-1 text-sm">
          {mine.map((t) => (
            <button key={t.reason} onClick={() => setReason(reason === t.reason ? null : t.reason)} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-surface-2/60 ${reason === t.reason ? 'bg-accent/15' : ''}`}>
              <span className="truncate">{reasonName(t.reason)} <span className="text-faint">× {int(t.n)}</span></span>
              <span className="tnum">{t.in > 0 && <span className="text-ok">+{compact(t.in)}</span>} {t.out > 0 && <span className="text-muted">−{compact(t.out)}</span>}</span>
            </button>
          ))}
          {!mine.length && <p className="text-muted">Nothing yet.</p>}
        </div>
      </Panel>
      <Panel title={reason ? `${reasonName(reason)} entries` : 'Every entry, newest first'} pad={false}>
        {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <Loading /> : (
          <>
            <DataTable rows={rows} rowKey={(r: any) => String(r.id)} maxHeight={600} cols={[
              { key: 'created_at', label: 'When', render: (r: any) => dateTime(r.created_at) },
              { key: 'reason', label: 'Reason', render: (r: any) => <span>{reasonName(r.reason)}{r.actor && <span className="text-faint"> by @{r.actor}</span>}</span> },
              { key: 'delta', label: 'Change', num: true, render: (r: any) => <b className={r.delta > 0 ? 'text-ok' : 'text-muted'}>{signed(r.delta)}</b> },
              { key: 'balance_after', label: 'Balance after', num: true, render: (r: any) => int(r.balance_after) },
              { key: 'ref', label: 'Reference', render: (r: any) => <span className="text-xs text-faint">{[r.ref_type, r.ref_id].filter(Boolean).join(' ') || '—'}</span> },
            ]} />
            {q.hasNextPage && <div className="p-3 text-center"><Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load older entries</Button></div>}
          </>
        )}
      </Panel>
    </div>
  );
}

function UsdLedger({ id, d }: { id: string; d: any }) {
  const [kind, setKind] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['portal', 'usd', id, kind],
    queryFn: ({ pageParam }) => portal.ledger({ player: id, kind: 'usd', reason: kind, before: pageParam, limit: 200 }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const totals = Object.entries(d.rent_totals ?? {}) as [string, { usd: number; n: number }][];
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {totals.map(([k, v]) => <button key={k} onClick={() => setKind(kind === k ? null : k)} className="text-left"><Stat label={reasonName(k)} value={usd(v.usd)} sub={`${int(v.n)} entries`} className={kind === k ? '!border-accent' : ''} /></button>)}
      </div>
      <Panel title={kind ? reasonName(kind) : 'Every USD entry, newest first'} pad={false}>
        {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : !q.data ? <Loading /> : (
          <>
            <DataTable rows={rows} rowKey={(r: any) => String(r.id)} maxHeight={600} cols={[
              { key: 'created_at', label: 'When', render: (r: any) => dateTime(r.created_at) },
              { key: 'kind', label: 'Kind', render: (r: any) => reasonName(r.kind) },
              { key: 'amount_usd', label: 'Amount', num: true, render: (r: any) => <b className={r.amount_usd > 0 ? 'text-ok' : 'text-muted'}>{usd(r.amount_usd)}</b> },
              { key: 'balance_after', label: 'Balance after', num: true, render: (r: any) => usd(r.balance_after) },
              { key: 'seconds', label: 'Time covered', num: true, render: (r: any) => (r.seconds ? duration(Number(r.seconds) * 1000) : '—') },
              { key: 'boosted_seconds', label: 'Boosted', num: true, render: (r: any) => (Number(r.boosted_seconds) ? duration(Number(r.boosted_seconds) * 1000) : '—') },
              { key: 'rate_usd_per_second', label: 'Rate / day', num: true, render: (r: any) => (r.rate_usd_per_second ? usd(perDay(r.rate_usd_per_second)) : '—') },
            ]} />
            {q.hasNextPage && <div className="p-3 text-center"><Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load older entries</Button></div>}
          </>
        )}
      </Panel>
    </div>
  );
}

function Games({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ['portal', 'rows', 'sessions', id, offset], queryFn: () => portal.rows({ schema: 'public', table: 'minigame_sessions', filters: [{ col: 'player_id', op: 'eq', value: id }], sort: 'started_at', limit: 100, offset }) });
  return (
    <div className="grid gap-3">
      <PlayerMinigameStats id={id} />
      <Panel title="Every minigame they started" pad={false}>
        <Q q={q}>{(d) => (
          <>
            <DataTable rows={d.rows} rowKey={(r: any) => r.id} maxHeight={560} cols={[
              { key: 'started_at', label: 'Started', render: (r: any) => dateTime(r.started_at) },
              { key: 'game', label: 'Game', render: (r: any) => gameName(r.game) },
              { key: 'level', label: 'Level', num: true },
              { key: 'plot', label: 'Plot', render: (r: any) => (r.gx != null ? <Link className="tnum text-accent-2" to={`/map?gx=${r.gx}&gy=${r.gy}`}>{plotLabel(r.gx, r.gy)}</Link> : '—') },
              { key: 'status', label: 'Status', render: (r: any) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
              { key: 'passed', label: 'Result', render: (r: any) => (r.passed ? <span className="text-ok">won</span> : r.finished_at ? 'lost' : '—') },
              { key: 'score', label: 'Score', num: true, render: (r: any) => int(r.score) },
              { key: 'stars', label: 'Stars', num: true },
              { key: 'play_ms', label: 'Play time', num: true, render: (r: any) => (r.play_ms ? duration(r.play_ms) : '—') },
              { key: 'review_status', label: 'Review', render: (r: any) => (r.review_status ? <Badge tone={statusTone(r.review_status)}>{r.review_status}</Badge> : '—') },
              { key: 'flags', label: 'Flags', render: (r: any) => <Cell v={r.flags} /> },
            ]} />
            <div className="px-4 pb-3"><PagerLite offset={offset} n={d.rows.length} total={d.total} onChange={setOffset} /></div>
          </>
        )}</Q>
      </Panel>
    </div>
  );
}

function PagerLite({ offset, n, total, onChange }: { offset: number; n: number; total: number; onChange(o: number): void }) {
  return (
    <div className="flex items-center justify-between pt-3 text-xs text-muted">
      <span className="tnum">{total ? `${offset + 1}–${offset + n} of ${total.toLocaleString()}` : 'None'}</span>
      <span className="flex gap-1.5"><Button size="sm" variant="ghost" disabled={!offset} onClick={() => onChange(Math.max(0, offset - 100))}>Previous</Button><Button size="sm" variant="ghost" disabled={offset + n >= total} onClick={() => onChange(offset + 100)}>Next</Button></span>
    </div>
  );
}

function FairPlay({ id, pacing }: { id: string; pacing: any[] }) {
  const q = useQuery({ queryKey: ['admin', 'integrity-player', id], queryFn: () => api.admin.integrityPlayer(id) });
  return (
    <div className="grid gap-3">
      <Q q={q}>{(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Risk level" value={words(d.level)} tone={d.level === 'high' ? 'bad' : d.level === 'medium' ? 'gold' : 'ok'} sub={`score ${int(d.score)}`} />
            <Stat label="Linked accounts" value={int(d.linked?.length ?? 0)} />
            <Stat label="Devices" value={int(d.devices?.length ?? 0)} />
            <Stat label="Networks" value={int(d.networks?.length ?? 0)} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Signals">{d.signals?.length ? <ul className="grid gap-1 text-sm">{d.signals.map((s: any, i: number) => <li key={i}><b>{s.label ?? words(s.key)}</b> {s.detail && <span className="text-muted">{typeof s.detail === 'string' ? s.detail : JSON.stringify(s.detail)}</span>}</li>)}</ul> : <p className="text-sm text-muted">Nothing unusual.</p>}</Panel>
            <Panel title="Linked accounts">{d.linked?.length ? <ul className="grid gap-1 text-sm">{d.linked.map((l: any, i: number) => <li key={i}>{l.id ? <Link className="text-accent-2" to={`/players/${l.id}`}>@{l.username ?? l.id}</Link> : JSON.stringify(l)} {l.via && <span className="text-muted">via {l.via}</span>}</li>)}</ul> : <p className="text-sm text-muted">No other accounts share their devices or networks.</p>}</Panel>
            <Panel title="Where their Ink came from"><HBars items={Object.entries(d.ink_sources ?? {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v], i) => ({ key: k, label: reasonName(k), value: Number(v), color: SERIES[i % 8] }))} format={(v) => compact(v)} /></Panel>
            <Panel title="Countries their plots are in"><HBars items={(d.plot_countries ?? []).map((c: any, i: number) => ({ key: c.country, label: c.country ?? 'Unknown', value: c.plots, color: SERIES[i % 8] }))} /></Panel>
            <Panel title="Devices"><Json value={d.devices ?? []} max={260} /></Panel>
            <Panel title="Networks"><Json value={d.networks ?? []} max={260} /></Panel>
            <Panel title="Actions taken on them"><Json value={d.actions ?? []} max={260} /></Panel>
            <Panel title="Inflows from other players"><Json value={d.inflows ?? []} max={260} /></Panel>
          </div>
        </>
      )}</Q>
      <Panel title="Hidden Ink pacing, last 14 days" pad={false}>
        <DataTable rows={pacing ?? []} rowKey={(r: any) => r.day} empty={<Empty title="No pacing records">Records appear once they earn Ink from paced sources.</Empty>} cols={[
          { key: 'day', label: 'Game day', render: (r: any) => date(r.day) },
          { key: 'earned', label: 'Earned (raw)', num: true, render: (r: any) => int(r.earned) },
          { key: 'paid', label: 'Paid', num: true, render: (r: any) => int(r.paid) },
          { key: 'factor', label: 'Last factor', num: true, render: (r: any) => `${Math.round(Number(r.factor) * 100)}%` },
          { key: 'rate', label: 'Rate', num: true, render: (r: any) => `${Math.round(Number(r.rate) * 100)}%` },
          { key: 'events', label: 'Payouts', num: true, render: (r: any) => int(r.events) },
          { key: 'hours', label: 'Hours active', num: true, render: (r: any) => int(r.hours) },
          { key: 'heat', label: 'Heat', num: true, render: (r: any) => Number(r.heat).toFixed(2) },
          { key: 'load', label: 'Load', num: true, render: (r: any) => Number(r.load).toFixed(2) },
          { key: 'last_at', label: 'Last payout', render: (r: any) => dateTime(r.last_at) },
        ]} />
      </Panel>
    </div>
  );
}

function AllData({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['portal', 'player-tables', id], queryFn: () => portal.playerTables(id) });
  const [all, setAll] = useState(false);
  const who = useOutletContext<WhoAmI>();
  return (
    <Panel title="Every table that mentions them" actions={<label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show empty tables</label>}>
      <p className="mb-3 text-sm text-muted">Counts stop at 10,000 per table. {who.owner ? 'Open a table to see, filter and edit their rows in the data explorer.' : 'Only the owner can open tables.'}</p>
      <Q q={q}>{(rows) => (
        <DataTable rows={rows.filter((r) => all || r.rows > 0).sort((a, b) => b.rows - a.rows)} rowKey={(r) => `${r.schema}.${r.table}.${r.column}`} cols={[
          { key: 'table', label: 'Table', sort: true, render: (r) => <span><span className="text-faint">{r.schema}.</span><b>{r.table}</b></span> },
          { key: 'column', label: 'Matched on', render: (r) => <span className="p-mono text-muted">{r.column}</span> },
          { key: 'rows', label: 'Rows', num: true, sort: true, render: (r) => (r.rows >= 10000 ? '10,000+' : int(r.rows)) },
          { key: 'open', label: '', render: (r) => (who.owner && r.rows > 0 ? <Link className="inline-flex items-center gap-1 text-accent-2 hover:underline" to={`/data/${r.schema}/${r.table}?f=${encodeURIComponent(JSON.stringify([{ col: r.column, op: 'eq', value: id }]))}`}><Database className="h-3.5 w-3.5" /> Open</Link> : null) },
        ]} />
      )}</Q>
    </Panel>
  );
}

function History({ rows }: { rows: any[] }) {
  const cols: Col<any>[] = [
    { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) },
    { key: 'actor', label: 'By', render: (r) => `@${r.actor ?? 'system'}` },
    { key: 'action', label: 'Action', render: (r) => <Badge>{words(r.action)}</Badge> },
    { key: 'details', label: 'Details', render: (r) => <Cell v={r.details} /> },
  ];
  return <Panel title="Staff actions on this player, and by them" pad={false}><DataTable rows={rows ?? []} rowKey={(r) => String(r.id)} cols={cols} empty={<Empty title="No staff actions yet" />} /></Panel>;
}
