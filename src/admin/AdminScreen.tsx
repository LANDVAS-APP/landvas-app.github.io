// Operator console. Every action is authorised and audited in SQL (admin_*).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { fmt, timeAgo } from '../lib/utils';
import { RARITY_ORDER } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { Avatar, Button, Empty, Spinner, Tabs, inputCls } from '../ui';
import { RarityBadge } from '../plot/RarityBadge';

const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
  try { await fn(); toast.success(ok); after?.(); } catch (e) { toast.error(toGameError(e).message); }
};

export default function AdminScreen() {
  const me = useOnboardedMe();
  const [tab, setTab] = useState('overview');
  if (!me) return <Page><Spinner /></Page>;
  if (!me.roles.length) return <Page><Empty icon={<Shield className="h-6 w-6" />} title="Admins only">Ask an owner to grant you a role.</Empty></Page>;
  return (
    <Page wide>
      <PageHeader eyebrow={me.roles.join(' · ')} title="Admin console" />
      <div className="mb-4 overflow-x-auto scroll-thin">
        <Tabs value={tab} onValueChange={setTab} items={[
          { value: 'overview', label: 'Overview' }, { value: 'moderation', label: 'Moderation' }, { value: 'cashouts', label: 'Cash-outs' },
          { value: 'players', label: 'Players' }, { value: 'economy', label: 'Economy' }, { value: 'flags', label: 'Flags' }, { value: 'ops', label: 'Operations' },
        ]} />
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'moderation' && <Moderation />}
      {tab === 'cashouts' && <Cashouts />}
      {tab === 'players' && <Players />}
      {tab === 'economy' && <Economy />}
      {tab === 'flags' && <Flags />}
      {tab === 'ops' && <Ops />}
    </Page>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="glass rounded-3xl p-5"><h2 className="mb-3 font-display text-base font-semibold">{title}</h2>{children}</section>;
}

function Overview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: api.admin.overview, refetchInterval: 30_000 });
  if (!q.data) return <Spinner />;
  const d = q.data;
  const tiles = [
    ['Players', d.players_total], ['Active 24h', d.players_active_24h], ['Sign-ups 24h', d.signups_24h], ['Plots owned', d.plots_owned],
    ['Canvases', d.groups_active], ['Minigames 24h', d.minigame_sessions_24h], ['Flagged runs', d.flagged_sessions], ['Client errors 24h', d.client_errors_24h],
    ['Ink issued 24h', d.ink_issued_24h], ['Ink spent 24h', d.ink_spent_24h],
  ];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {tiles.map(([l, v]) => <div key={l as string} className="glass rounded-2xl p-4"><div className="font-display text-xl font-semibold tnum">{fmt(v as number)}</div><div className="eyebrow !text-[10px]">{l}</div></div>)}
      </div>
      <Card title="USD rent liability">
        <div className="grid gap-1 text-sm tnum">
          <div>Settled balances (owed, incl. held): <b>${Number(d.rent.settled_liability_usd).toFixed(6)}</b></div>
          <div>Lifetime rent accrued: ${Number(d.rent.lifetime_usd).toFixed(6)} · paid out: ${Number(d.rent.paid_usd).toFixed(2)}</div>
          <div>World rent rate (unboosted): {formatRate(Number(d.rent.rate_usd_per_second))} ≈ ${(Number(d.rent.rate_usd_per_second) * 86400 * 30).toFixed(4)}/month · players boosted now: {d.rent.boosted_players_now}</div>
        </div>
      </Card>
      <Card title="Queues">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>Publications: {Object.entries(d.publications ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</span>
          <span>Open cases: {Object.entries(d.open_cases ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</span>
          <span>Render jobs: {Object.entries(d.jobs ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} (oldest queued {d.oldest_queued_seconds}s)</span>
        </div>
      </Card>
    </div>
  );
}

function PubPreview({ path }: { path: string | null }) {
  const q = useQuery({ queryKey: ['private-asset', path], queryFn: () => getBackend().privateAssetUrl(path), enabled: !!path });
  return q.data ? <img src={q.data} alt="" className="checker h-28 w-28 rounded-xl object-contain [image-rendering:pixelated]" /> : <div className="h-28 w-28 rounded-xl bg-surface-2" />;
}

function Moderation() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'queue'], queryFn: () => api.admin.queue('open') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'queue'] });
  if (!q.data) return <Spinner />;
  if (!q.data.cases.length) return <Empty title="Queue is clear">{q.data.pending_publications} publication(s) pending review.</Empty>;
  return (
    <div className="grid gap-3">
      {q.data.cases.map((c: any) => (
        <div key={c.id} className="glass flex flex-wrap gap-4 rounded-3xl p-4">
          {c.publication && <PubPreview path={c.publication.preview_path} />}
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-bold">{c.kind.replace('_', ' ')} · {c.reason} <span className="text-xs text-faint">{timeAgo(c.created_at)}</span></div>
            {c.subject && <div className="text-muted">Player @{c.subject.username} · strikes {c.subject_strikes}</div>}
            {c.publication && <div className="text-muted">“{c.publication.title}” · {c.publication.plot_count} plots · {c.publication.status}</div>}
            {c.details && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-faint">{JSON.stringify(c.details)}</pre>}
            <div className="mt-2 flex flex-wrap gap-2">
              {c.publication?.status === 'pending_review' && <>
                <Button size="sm" variant="primary" onClick={() => run(() => api.admin.reviewPublication(c.publication.id, 'approve'), 'Approved', refresh)}>Approve</Button>
                <Button size="sm" variant="danger" onClick={() => run(() => api.admin.reviewPublication(c.publication.id, 'reject', 'Does not meet the content policy'), 'Rejected', refresh)}>Reject</Button>
              </>}
              {c.publication?.status === 'published' && <Button size="sm" variant="danger" onClick={() => run(() => api.admin.removePublication(c.publication.id, c.reason || 'Content policy', true), 'Removed with a strike', refresh)}>Remove + strike</Button>}
              {c.kind === 'score_review' && c.session_id && <>
                <Button size="sm" onClick={() => run(() => api.admin.reviewSession(c.session_id, 'clear', 'Looks legitimate'), 'Rewards released', refresh)}>Clear run</Button>
                <Button size="sm" variant="danger" onClick={() => run(() => api.admin.reviewSession(c.session_id, 'void', 'Automated play'), 'Run voided', refresh)}>Void run</Button>
              </>}
              <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.resolveCase(c.id, 'dismissed', 'No action needed'), 'Dismissed', refresh)}>Dismiss</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Cashouts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'cashouts'], queryFn: () => api.admin.cashoutQueue('requested') });
  const [refs, setRefs] = useState<Record<string, string>>({});
  if (q.error) return <Empty title="Payouts role required">{toGameError(q.error).message}</Empty>;
  if (!q.data) return <Spinner />;
  if (!q.data.length) return <Empty title="No cash-out requests">Cash-out is controlled by the legally gated “cashout” flag.</Empty>;
  return (
    <div className="grid gap-3">
      {q.data.map((r: any) => (
        <div key={r.id} className="glass grid gap-2 rounded-3xl p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><b>@{r.player.username}</b> requested <b className="tnum">${(r.payout_cents / 100).toFixed(2)}</b> via {r.method} to <code className="rounded bg-surface-2 px-1">{r.destination}</code> <span className="text-faint">{timeAgo(r.created_at)}</span></div>
          <div className="text-xs text-muted">{r.player_plots} plots · member since {new Date(r.player_since).toLocaleDateString()} {r.risk_flags?.length ? `· flags: ${r.risk_flags.join(', ')}` : ''}</div>
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} h-9 max-w-xs`} placeholder="Payment reference (after paying)" value={refs[r.id] ?? ''} onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })} />
            <Button size="sm" variant="primary" disabled={!refs[r.id]} onClick={() => run(() => api.admin.decideCashout(r.id, 'paid', refs[r.id]), 'Marked paid', () => qc.invalidateQueries({ queryKey: ['admin', 'cashouts'] }))}>Mark paid</Button>
            <Button size="sm" variant="danger" onClick={() => run(() => api.admin.decideCashout(r.id, 'rejected', undefined, 'Rejected by review'), 'Rejected — funds returned', () => qc.invalidateQueries({ queryKey: ['admin', 'cashouts'] }))}>Reject</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Players() {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['admin', 'players', query], queryFn: () => api.admin.searchPlayers(query) });
  const detail = useQuery({ queryKey: ['admin', 'player', sel], queryFn: () => api.admin.playerDetail(sel!), enabled: !!sel });
  const [adj, setAdj] = useState({ resource: 'ink', delta: '', reason: '' });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card title="Players">
        <input className={inputCls} placeholder="Search username, email or id" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-3 grid max-h-[60vh] gap-1 overflow-y-auto scroll-thin">
          {(list.data ?? []).map((p: any) => (
            <button key={p.id} onClick={() => setSel(p.id)} className={`flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-surface-2 ${sel === p.id ? 'bg-surface-2' : ''}`}>
              <span className="min-w-0 truncate"><b>@{p.username}</b> <span className="text-faint">{p.email}</span></span>
              <span className="shrink-0 text-xs text-muted">{p.plots} plots · {p.status}</span>
            </button>
          ))}
        </div>
      </Card>
      {sel && detail.data && (
        <Card title={`@${detail.data.profile.username}`}>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2"><Avatar seed={detail.data.profile.avatar_seed} style={detail.data.profile.avatar_style} accent={detail.data.profile.accent_color} size={32} />{detail.data.email} · {detail.data.player.status} · strikes {detail.data.player.strikes}</div>
            <div className="tnum">Ink {fmt(detail.data.balances.ink)} · Pigments {fmt(detail.data.balances.pigments)} · USD ${Number(detail.data.rent.live_usd).toFixed(9)} · {detail.data.plots} plots</div>
            {detail.data.explorer && <div className="text-xs text-muted">Explorer near block {detail.data.explorer.gx}, {detail.data.explorer.gy} ({detail.data.explorer.mode})</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              <select className={`${inputCls} h-9 w-auto`} value={adj.resource} onChange={(e) => setAdj({ ...adj, resource: e.target.value })}>
                {['ink', 'pigments', 'brush_points', 'gallery_tokens', 'usd'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input className={`${inputCls} h-9 w-28`} placeholder="± amount" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} />
              <input className={`${inputCls} h-9 min-w-40 flex-1`} placeholder="Reason (audited)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
              <Button size="sm" onClick={() => run(() => adj.resource === 'usd' ? api.admin.adjustRent(sel, Number(adj.delta), adj.reason) : api.admin.adjustBalance(sel, adj.resource, Math.trunc(Number(adj.delta)), adj.reason), 'Adjusted', () => detail.refetch())}>Apply</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="danger" onClick={() => run(() => api.admin.setPlayerStatus(sel, 'suspended', new Date(Date.now() + 7 * 864e5).toISOString(), 'Suspended by admin'), 'Suspended 7 days', () => detail.refetch())}>Suspend 7 days</Button>
              <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.setPlayerStatus(sel, 'active', null, ''), 'Reactivated', () => detail.refetch())}>Reactivate</Button>
              {['moderator', 'economy', 'support', 'payouts'].map((role) => {
                const has = detail.data.roles.includes(role);
                return <Button key={role} size="sm" variant="ghost" onClick={() => run(() => api.admin.setRole(sel, role, !has), has ? `Removed ${role}` : `Granted ${role}`, () => detail.refetch())}>{has ? `− ${role}` : `+ ${role}`}</Button>;
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function JsonConfig({ k, value, onSaved }: { k: string; value: unknown; onSaved(): void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  return (
    <div className="grid gap-2">
      <textarea className={`${inputCls} h-56 py-2 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <Button size="sm" className="justify-self-start" onClick={() => run(async () => api.admin.configSet(k, JSON.parse(text)), `${k} saved`, onSaved)}>Save {k}</Button>
    </div>
  );
}

function Economy() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'config'], queryFn: api.admin.configGet });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'config'] }); void qc.invalidateQueries({ queryKey: ['world'] }); };
  const [edit, setEdit] = useState<Record<string, string>>({});
  if (!q.data) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Rarities">
        <div className="grid gap-2">
          {RARITY_ORDER.map((id) => {
            const r = q.data.rarities.find((x: any) => x.id === id);
            if (!r) return null;
            return (
              <div key={id} className="flex flex-wrap items-center gap-2 text-sm">
                <RarityBadge r={id} small />
                <span className="w-40 tnum text-muted">{formatRate(Number(r.usd_per_second))} · {(r.weight / 10).toFixed(1)}%</span>
                <input className={`${inputCls} h-8 w-36 text-xs`} placeholder="USD/sec" value={edit[id] ?? ''} onChange={(e) => setEdit({ ...edit, [id]: e.target.value })} />
                <Button size="sm" disabled={!edit[id]} onClick={() => run(() => api.admin.updateRarity(id, { usd_per_second: Number(edit[id]) }), `${r.name} rate updated`, refresh)}>Set rate</Button>
              </div>
            );
          })}
          <p className="text-xs text-faint">Rate changes bank everyone's rent first, so they never apply retroactively.</p>
        </div>
      </Card>
      {['rent', 'explorer', 'economy', 'minigames'].map((k) => (
        <Card key={k} title={k}>
          <p className="mb-2 text-xs text-muted">{q.data.config[k]?.description}</p>
          <JsonConfig k={k} value={q.data.config[k]?.value} onSaved={refresh} />
        </Card>
      ))}
    </div>
  );
}

function Flags() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'config'], queryFn: api.admin.configGet });
  if (!q.data) return <Spinner />;
  return (
    <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
      {q.data.flags.map((f: any) => (
        <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0">
            <div className="font-bold">{f.key} {f.config?.legally_gated && <span className="ml-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold text-warn">LEGAL SIGN-OFF REQUIRED</span>}</div>
            <div className="text-xs text-muted">{f.description}</div>
          </div>
          <Button size="sm" variant={f.enabled ? 'secondary' : 'primary'} onClick={() => run(() => api.admin.setFlag(f.key, !f.enabled), `${f.key} ${f.enabled ? 'disabled' : 'enabled'}`, () => qc.invalidateQueries({ queryKey: ['admin', 'config'] }))}>{f.enabled ? 'Disable' : 'Enable'}</Button>
        </div>
      ))}
    </div>
  );
}

function Ops() {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => api.admin.jobs() });
  const errs = useQuery({ queryKey: ['admin', 'errors'], queryFn: api.admin.clientErrors });
  const audit = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api.admin.audit(60) });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Render jobs">
        <div className="grid max-h-80 gap-1 overflow-y-auto text-xs scroll-thin">
          {(jobs.data ?? []).map((j: any) => (
            <div key={j.id} className="flex items-center justify-between gap-2">
              <span>#{j.id} {j.kind} · {j.status} · tries {j.attempts}{j.last_error ? ` · ${String(j.last_error).slice(0, 60)}` : ''}</span>
              {j.status === 'failed' && <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.retryJob(j.id), 'Retrying', () => qc.invalidateQueries({ queryKey: ['admin', 'jobs'] }))}>Retry</Button>}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Client errors">
        <div className="grid max-h-80 gap-1 overflow-y-auto text-xs scroll-thin">
          {(errs.data ?? []).map((e: any) => <div key={e.id}><span className="text-faint">{timeAgo(e.created_at)}</span> {String(e.message).slice(0, 160)}</div>)}
        </div>
      </Card>
      <Card title="Audit log">
        <div className="grid max-h-80 gap-1 overflow-y-auto text-xs scroll-thin">
          {(audit.data ?? []).map((a: any) => <div key={a.id}><span className="text-faint">{timeAgo(a.created_at)}</span> {a.action} {a.target_type}:{String(a.target_id).slice(0, 12)}</div>)}
        </div>
      </Card>
    </div>
  );
}
