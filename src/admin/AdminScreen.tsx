// The operator's admin hub. Only the owner can open it; the owner is claimed
// once with a one-time code. Every action is authorised and audited in SQL.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, ChevronDown, DoorOpen, Eye, KeyRound, MapPin, Shield, ShieldCheck, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt, plotLabel, timeAgo } from '../lib/utils';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { Z_HOUSE, Z_PLOT, cellCenter } from '../shared/grid';
import { GAME_IDS } from '../shared/minigames/types';
import { SupportAdmin, UpdatesAdmin } from './UpdatesSupportAdmin';
import { useNotifications } from '../updates/Notifications';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { Button, Empty, Field, Spinner, Switch, Tabs, inputCls, useConfirm, PlayerAvatar } from '../ui';
import { RarityBadge } from '../plot/RarityBadge';
import type { AdminPlot } from '../backend/types';

const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
  try { await fn(); toast.success(ok); after?.(); } catch (e) { toast.error(toGameError(e).message); }
};

export default function AdminScreen() {
  const me = useOnboardedMe();
  if (!me) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (!me.roles.includes('owner')) return <OwnerGate />;
  return <Hub />;
}

// ---- gate ---------------------------------------------------------------------------

function OwnerGate() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['owner-status'], queryFn: api.ownerStatus });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (status.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (status.data?.claimed) {
    return <Page><Empty icon={<Shield className="h-6 w-6" />} title="This page is private">Only the LANDVAS operator can open the admin hub.</Empty></Page>;
  }
  return (
    <Page>
      <div className="mx-auto max-w-md pt-8">
        <section className="glass rounded-[28px] p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent-2"><KeyRound className="h-6 w-6" /></div>
          <h1 className="font-display text-2xl font-bold">Claim the admin hub</h1>
          <p className="mt-1 text-sm text-muted">Enter your one-time owner code. It makes this account the game's only owner and can never be used again.</p>
          <form className="mt-5 grid gap-3" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const r = await api.claimOwner(code);
              if (!r.ok) { setErr(r.reason === 'already_claimed' ? 'The admin hub has already been claimed.' : 'That code didn’t work. Check it and try again.'); return; }
              toast.success('You’re the owner now. Welcome to the admin hub.');
              invalidateGame(qc);
              void qc.invalidateQueries({ queryKey: qk.me });
              void qc.invalidateQueries({ queryKey: ['owner-status'] });
            } catch (e2) { setErr(toGameError(e2).message); } finally { setBusy(false); }
          }}>
            <Field label="Owner code" htmlFor="owner-code" error={err}>
              <input id="owner-code" className={cn(inputCls, 'font-mono tracking-wider')} autoComplete="off" spellCheck={false} placeholder="LV-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" value={code} onChange={(e) => setCode(e.target.value)} data-testid="owner-code" />
            </Field>
            <Button type="submit" variant="rainbow" size="lg" loading={busy} disabled={code.replace(/[^a-z0-9]/gi, '').length < 10} data-testid="owner-claim">Claim admin hub</Button>
          </form>
        </section>
      </div>
    </Page>
  );
}

// ---- hub ----------------------------------------------------------------------------

const TABS = [
  { value: 'review', label: 'Review' },
  { value: 'overview', label: 'Dashboard' },
  { value: 'players', label: 'Players' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'world', label: 'World' },
  { value: 'plots', label: 'Plots' },
  { value: 'updates', label: 'Updates' },
  { value: 'support', label: 'Support' },
  { value: 'social', label: 'Social' },
  { value: 'shop', label: 'Shop' },
  { value: 'flags', label: 'Switches' },
  { value: 'cashouts', label: 'Cash-outs' },
  { value: 'system', label: 'System' },
];

function Hub() {
  const [tab, setTab] = useState(() => (location.hash.slice(1) && TABS.some((t) => t.value === location.hash.slice(1)) ? location.hash.slice(1) : 'review'));
  const mode = useQuery({ queryKey: ['admin', 'review-mode'], queryFn: api.admin.reviewMode, refetchInterval: 20_000 });
  const pending = mode.data?.pending ?? 0;
  const notes = useNotifications();
  const openTickets = notes.data?.open_tickets_staff ?? 0;
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);
  return (
    <Page wide>
      <PageHeader eyebrow="Owner" title={<span className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-accent-2" /> Admin hub</span>}>
        Complete control of LANDVAS. Every change is applied to all players immediately and recorded in the audit log.
      </PageHeader>
      <Tabs value={tab} onValueChange={setTab} className="mb-5" items={TABS.map((t) => ({
        value: t.value,
        label: t.value === 'review' && pending > 0 ? <span className="flex items-center gap-1.5">Review <span className="rounded-full bg-hot px-1.5 text-[11px] font-bold text-white tnum">{pending}</span></span>
          : t.value === 'support' && openTickets > 0 ? <span className="flex items-center gap-1.5">Support <span className="rounded-full bg-hot px-1.5 text-[11px] font-bold text-white tnum">{openTickets}</span></span> : t.label,
      }))} />
      {tab === 'review' && <ReviewTab />}
      {tab === 'overview' && <Overview onTab={setTab} />}
      {tab === 'players' && <Players />}
      {tab === 'earnings' && <Earnings />}
      {tab === 'world' && <World />}
      {tab === 'plots' && <Plots />}
      {tab === 'updates' && <UpdatesAdmin />}
      {tab === 'support' && <SupportAdmin />}
      {tab === 'social' && <SocialAdmin />}
      {tab === 'shop' && <ShopAdmin />}
      {tab === 'flags' && <Flags />}
      {tab === 'cashouts' && <Cashouts />}
      {tab === 'system' && <System />}
    </Page>
  );
}

function Card({ title, children, actions, className }: { title: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('glass rounded-3xl p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-base font-semibold">{title}</h2>{actions}</div>
      {children}
    </section>
  );
}

function PubPreview({ path, className }: { path: string | null; className?: string }) {
  const q = useQuery({ queryKey: ['private-asset', path], queryFn: () => getBackend().privateAssetUrl(path), enabled: !!path });
  return q.data
    ? <img src={q.data} alt="" className={cn('art-paper rounded-2xl object-contain [image-rendering:pixelated]', className)} />
    : <div className={cn('flex items-center justify-center rounded-2xl bg-surface-2 text-xs text-faint', className)}>{path ? '' : 'no preview'}</div>;
}

// ---- review ---------------------------------------------------------------------------

const REJECT_REASONS = ['Not appropriate for an all-ages map', 'Copyrighted or someone else’s work', 'Personal information or a real person', 'Spam, ads or links'];

function ReviewTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const mode = useQuery({ queryKey: ['admin', 'review-mode'], queryFn: api.admin.reviewMode, refetchInterval: 20_000 });
  const list = useQuery({ queryKey: ['admin', 'pending'], queryFn: api.admin.pendingPublications, refetchInterval: 20_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin'] }); };
  const reviews = mode.data?.reviews ?? true;
  const pending = list.data ?? [];
  const decide = async (id: string, decision: 'approve' | 'reject', reason?: string) => {
    setBusy(id);
    await run(() => api.admin.reviewPublication(id, decision, reason), decision === 'approve' ? 'Approved — it goes live on the map in a moment' : 'Rejected — the artist sees your reason', refresh);
    setBusy(null);
    setRejecting(null);
  };
  return (
    <div className="grid gap-4">
      <Card title="Artwork reviews">
        <Switch id="reviews-on" checked={reviews} label={reviews ? 'Reviews are ON — you approve every artwork before it goes live' : 'Reviews are OFF — every artwork goes live automatically'}
          hint={reviews ? 'Turn off to let everyone’s artwork through without waiting for you.' : 'Automated checks still run, and you can remove anything from the map at any time.'}
          onCheckedChange={async (on) => {
            if (!on && !(await confirm({ title: 'Turn reviews off?', body: `Every artwork will go live right after the automated checks${pending.length ? `, including the ${pending.length} waiting now` : ''}. You can still remove anything later.`, confirm: 'Turn reviews off' }))) return;
            await run(async () => {
              const r = await api.admin.setReviewMode(on);
              if (!on && r.approved) toast.success(`${r.approved} waiting artwork${r.approved === 1 ? '' : 's'} published`);
            }, on ? 'Reviews are on' : 'Reviews are off', refresh);
          }} />
        {reviews && pending.length > 1 && (
          <Button size="sm" variant="secondary" className="mt-2" loading={busy === 'all'} onClick={async () => {
            if (!(await confirm({ title: `Approve all ${pending.length}?`, body: 'They all go live on the map.', confirm: 'Approve all' }))) return;
            setBusy('all');
            await run(() => api.admin.approveAllPending(), 'All approved', refresh);
            setBusy(null);
          }}><CheckCheck className="h-4 w-4" /> Approve all {pending.length}</Button>
        )}
      </Card>
      {list.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !pending.length ? (
        <Empty icon={<Check className="h-6 w-6" />} title="Nothing waiting">New submissions appear here{reviews ? '' : ' only while reviews are on'}.</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pending.map((p: any) => (
            <article key={p.id} className="glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row" data-testid="review-item">
              <PubPreview path={p.preview_path} className="h-40 w-full shrink-0 sm:h-36 sm:w-36" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div>
                  <div className="truncate font-display text-lg font-semibold">{p.title}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <PlayerAvatar p={p.artist} size={18} />
                    <b className="text-fg">@{p.artist.username}</b>{p.is_mine && <span className="rounded bg-accent/20 px-1 font-bold text-accent-2">you</span>}
                    · {p.plot_count} plot{p.plot_count === 1 ? '' : 's'} · {timeAgo(p.submitted_at ?? p.created_at)}
                    · {p.artist_published} published{p.artist_strikes ? ` · ${p.artist_strikes} strike${p.artist_strikes === 1 ? '' : 's'}` : ''}
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                </div>
                {rejecting === p.id ? (
                  <div className="grid gap-1.5">
                    {REJECT_REASONS.map((r) => <Button key={r} size="sm" variant="ghost" className="justify-start" loading={busy === p.id} onClick={() => decide(p.id, 'reject', r)}>{r}</Button>)}
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" loading={busy === p.id} onClick={() => decide(p.id, 'approve')} data-testid="review-approve"><Check className="h-4 w-4" /> Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setRejecting(p.id)}><X className="h-4 w-4" /> Reject</Button>
                    <FlyButton lng={p.center_lng} lat={p.center_lat} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Reports />
    </div>
  );
}

function FlyButton({ lng, lat, zoom = Z_HOUSE, label = 'Map' }: { lng: number; lat: number; zoom?: number; label?: string }) {
  const nav = useNavigate();
  return <Button size="sm" variant="ghost" onClick={() => { useUi.getState().requestFly({ lng, lat, zoom }); nav('/world'); }}><MapPin className="h-4 w-4" /> {label}</Button>;
}

/** Player reports, appeals, flagged minigame runs. */
function Reports() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'queue'], queryFn: () => api.admin.queue('open') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const cases = (q.data?.cases ?? []).filter((c: any) => c.kind !== 'review');
  if (!cases.length) return null;
  return (
    <Card title={`Reports & flags (${cases.length})`}>
      <div className="grid gap-3">
        {cases.map((c: any) => (
          <div key={c.id} className="flex flex-wrap gap-4 rounded-2xl border border-line p-3">
            {c.publication && <PubPreview path={c.publication.preview_path} className="h-24 w-24" />}
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-bold">{String(c.kind).replace(/_/g, ' ')} · {c.reason} <span className="text-xs font-normal text-faint">{timeAgo(c.created_at)}</span></div>
              {c.subject && <div className="text-muted">Player @{c.subject.username} · strikes {c.subject_strikes}</div>}
              {c.publication && <div className="text-muted">“{c.publication.title}” · {c.publication.plot_count} plots · {c.publication.status}</div>}
              {c.details && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-faint">{JSON.stringify(c.details)}</pre>}
              <div className="mt-2 flex flex-wrap gap-2">
                {c.publication?.status === 'published' && <Button size="sm" variant="danger" onClick={() => run(() => api.admin.removePublication(c.publication.id, c.reason || 'Content policy', true), 'Removed with a strike', refresh)}>Remove + strike</Button>}
                {c.publication?.status === 'rejected' && c.kind === 'appeal' && <Button size="sm" onClick={() => run(() => api.admin.reviewPublication(c.publication.id, 'approve'), 'Appeal granted — publishing', refresh)}>Grant appeal</Button>}
                {c.reason === 'chat_message' && c.details?.message_id && <>
                  <Button size="sm" variant="danger" onClick={() => run(() => api.admin.deleteChat(Number(c.details.message_id), 'Removed after a report'), 'Message removed', refresh)}>Delete message</Button>
                  {c.subject_player_id && <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.mutePlayer(c.subject_player_id, 24 * 60, 'Muted after a chat report'), 'Muted for 24 hours', refresh)}>Mute 24h</Button>}
                </>}
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
    </Card>
  );
}

// ---- dashboard ------------------------------------------------------------------------

function Overview({ onTab }: { onTab(t: string): void }) {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: api.admin.overview, refetchInterval: 30_000 });
  if (!q.data) return <div className="flex justify-center py-10"><Spinner /></div>;
  const d = q.data;
  const tiles: [string, number, string?][] = [
    ['Players', d.players_total], ['Online now', d.players_active_15m ?? 0], ['Active 24h', d.players_active_24h], ['New 24h', d.signups_24h],
    ['Plots owned', d.plots_owned], ['Claimed 24h', d.plots_claimed_24h ?? 0], ['Art waiting', d.pending_review ?? 0, 'review'], ['Published 24h', d.art_published_24h ?? 0],
    ['Minigames 24h', d.minigame_sessions_24h], ['Wins 24h', d.minigame_wins_24h ?? 0], ['Ink minted 24h', d.ink_issued_24h], ['Ink spent 24h', d.ink_spent_24h],
    ['Flagged runs', d.flagged_sessions], ['GPS jumps 24h', d.gps_jumps_24h ?? 0], ['Client errors 24h', d.client_errors_24h, 'system'], ['Named plots', d.named_plots ?? 0],
    ['Chat messages 24h', d.chat_messages_24h ?? 0, 'social'], ['Friendships', d.friendships ?? 0, 'social'], ['Invites rewarded 24h', d.referrals?.rewarded_24h ?? 0, 'social'], ['Invite Ink 24h', d.referrals?.ink_paid_24h ?? 0, 'social'],
  ];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([l, v, tab]) => (
          <button key={l} disabled={!tab} onClick={() => tab && onTab(tab)} className={cn('glass rounded-2xl p-4 text-left', tab && 'hover:border-line-strong')}>
            <div className="font-display text-xl font-semibold tnum">{fmt(Number(v ?? 0))}</div>
            <div className="eyebrow !text-[10px]">{l}</div>
          </button>
        ))}
      </div>
      <Card title="USD rent">
        <div className="grid gap-1 text-sm tnum">
          <div>Owed to players (settled, incl. held): <b>${Number(d.rent.settled_liability_usd).toFixed(6)}</b></div>
          <div>Lifetime rent accrued: ${Number(d.rent.lifetime_usd).toFixed(6)} · paid out: ${Number(d.rent.paid_usd).toFixed(2)}</div>
          <div>World rent rate (unboosted): {formatRate(Number(d.rent.rate_usd_per_second))} ≈ ${(Number(d.rent.rate_usd_per_second) * 86400 * 30).toFixed(4)}/month · boosted now: {d.rent.boosted_players_now}</div>
        </div>
      </Card>
      <Card title="Pipeline">
        <div className="flex flex-wrap gap-4 text-sm text-muted">
          <span>Publications: {Object.entries(d.publications ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</span>
          <span>Render jobs: {Object.entries(d.jobs ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} (oldest queued {d.oldest_queued_seconds}s)</span>
        </div>
      </Card>
    </div>
  );
}

// ---- players --------------------------------------------------------------------------

function Players() {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['admin', 'players', query], queryFn: () => api.admin.searchPlayers(query) });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card title={`Players${list.data ? ` (${list.data.length}${list.data.length >= 60 ? '+' : ''})` : ''}`}>
        <input className={inputCls} placeholder="Search username, email or id" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-3 grid max-h-[65vh] gap-1 overflow-y-auto scroll-thin">
          {(list.data ?? []).map((p: any) => (
            <button key={p.id} onClick={() => setSel(p.id)} className={cn('flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-surface-2', sel === p.id && 'bg-surface-2')}>
              <span className="min-w-0 truncate"><b>@{p.username}</b> <span className="text-faint">{p.email}</span></span>
              <span className={cn('shrink-0 text-xs', p.status === 'active' ? 'text-muted' : 'font-bold text-bad')}>{p.plots} plots · {p.status}</span>
            </button>
          ))}
        </div>
      </Card>
      {sel ? <PlayerDetail id={sel} /> : <Empty title="Pick a player">See their land, artwork, balances and history, and change anything.</Empty>}
    </div>
  );
}

function PlayerDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const detail = useQuery({ queryKey: ['admin', 'player', id], queryFn: () => api.admin.playerDetail(id) });
  const [adj, setAdj] = useState({ resource: 'ink', delta: '', reason: '' });
  const refetch = () => { void detail.refetch(); void qc.invalidateQueries({ queryKey: ['admin', 'players'] }); };
  if (!detail.data) return <div className="flex justify-center py-10"><Spinner /></div>;
  const d = detail.data;
  const pr = d.profile;
  const plots = (d.plot_list ?? []) as AdminPlot[];
  const muted = d.player.chat_muted_until && new Date(d.player.chat_muted_until) > new Date();
  return (
    <div className="grid gap-4">
      <Card title={`@${pr.username}`} actions={<div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => nav(`/u/${pr.username}`)}><Eye className="h-4 w-4" /> Profile</Button>
        {d.plots > 0 && <Button size="sm" variant="secondary" onClick={() => nav(`/u/${pr.username}/room`)}><DoorOpen className="h-4 w-4" /> Visit room</Button>}
      </div>}>
        <div className="grid gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2"><PlayerAvatar p={pr} size={36} /><span>{d.email}</span> · <b className={d.player.status === 'active' ? 'text-ok' : 'text-bad'}>{d.player.status}</b> · strikes {d.player.strikes} · joined {new Date(d.player.created_at).toLocaleDateString()} · seen {timeAgo(d.player.last_active_at)}{muted ? <> · <b className="text-warn">chat muted until {new Date(d.player.chat_muted_until).toLocaleString()}</b></> : null}</div>
          {(d.referrals?.codes?.length > 0 || d.referrals?.referred_by) && (
            <div className="text-xs text-muted">Invite codes {(d.referrals.codes as string[]).join(', ') || '—'} · invited {d.referrals.invited} ({d.referrals.rewarded} rewarded){d.referrals.referred_by ? ` · invited by @${d.referrals.referred_by}` : ''}</div>
          )}
          <div className="tnum">Ink <b>{fmt(d.balances.ink)}</b> · Pigments <b>{fmt(d.balances.pigments)}</b> · XP <b>{fmt(d.balances.brush_points)}</b> · Tokens <b>{fmt(d.balances.gallery_tokens)}</b> · USD <b>${Number(d.rent.live_usd).toFixed(9)}</b></div>
          <div className="text-xs text-muted">{d.plots} plots · {d.groups} canvases{d.explorer ? ` · explorer ${d.explorer.mode}${d.explorer.traveling ? ', travelling' : ''} near block ${d.explorer.gx}, ${d.explorer.gy}` : ' · no explorer yet'}{d.joystick ? ` · joystick ${Math.round(d.joystick.seconds_left)}s left` : ''}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <select className={cn(inputCls, "h-9 w-auto")} value={adj.resource} onChange={(e) => setAdj({ ...adj, resource: e.target.value })} aria-label="Resource">
              {['ink', 'pigments', 'brush_points', 'gallery_tokens', 'usd'].map((r) => <option key={r} value={r}>{r === 'brush_points' ? 'XP' : r}</option>)}
            </select>
            <input className={cn(inputCls, "h-9 w-28")} placeholder="± amount" inputMode="decimal" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} />
            <input className={cn(inputCls, "h-9 min-w-40 flex-1")} placeholder="Reason (audited)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
            <Button size="sm" disabled={!Number(adj.delta)} onClick={() => run(() => adj.resource === 'usd' ? api.admin.adjustRent(id, Number(adj.delta), adj.reason) : api.admin.adjustBalance(id, adj.resource, Math.trunc(Number(adj.delta)), adj.reason), 'Balance adjusted', () => { setAdj({ ...adj, delta: '' }); refetch(); })}>Apply</Button>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" variant="danger" onClick={() => run(() => api.admin.setPlayerStatus(id, 'suspended', new Date(Date.now() + 7 * 864e5).toISOString(), 'Suspended by the operator'), 'Suspended for 7 days', refetch)}>Suspend 7 days</Button>
            <Button size="sm" variant="danger" onClick={async () => { if (await confirm({ title: `Ban @${pr.username}?`, body: 'They can no longer play. Their art stays unless you remove it.', confirm: 'Ban' })) void run(() => api.admin.setPlayerStatus(id, 'banned', null, 'Banned by the operator'), 'Banned', refetch); }}>Ban</Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.setPlayerStatus(id, 'active', null, ''), 'Reactivated', refetch)}>Reactivate</Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.hideProfile(id, !pr.is_hidden, 'Operator decision'), pr.is_hidden ? 'Profile visible again' : 'Profile hidden', refetch)}>{pr.is_hidden ? 'Unhide profile' : 'Hide profile'}</Button>
            {pr.avatar_path && <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.clearAvatar(id, 'Profile picture removed by the operator'), 'Profile picture removed', refetch)}>Remove picture</Button>}
            {muted
              ? <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.mutePlayer(id, 0, 'Unmuted by the operator'), 'Chat unmuted', refetch)}>Unmute chat</Button>
              : <>
                <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.mutePlayer(id, 60, 'Muted by the operator'), 'Muted in chat for 1 hour', refetch)}>Mute chat 1h</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.mutePlayer(id, 7 * 24 * 60, 'Muted by the operator'), 'Muted in chat for 7 days', refetch)}>Mute 7 days</Button>
              </>}
          </div>
        </div>
      </Card>
      <Card title={`Land (${d.plots})`}>
        {!plots.length ? <p className="text-sm text-muted">No plots.</p> : (
          <div className="grid max-h-72 gap-1 overflow-y-auto text-sm scroll-thin">
            {plots.map(([gx, gy, r, t, level, art, , name]) => (
              <div key={`${gx}_${gy}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                <RarityBadge r={r} small />
                <span className="min-w-0 flex-1 truncate"><b>{name || `Plot ${plotLabel(gx, gy)}`}</b> <span className="text-xs text-faint">{t} · lvl {level}{art ? ' · painted' : ''}</span></span>
                {name && <button className="text-xs text-bad hover:underline" onClick={() => run(() => api.admin.clearPlotName(gx, gy, 'Name removed by the operator'), 'Name cleared', refetch)}>Clear name</button>}
                <button className="text-xs text-accent-2 hover:underline" onClick={() => { const [lng, lat] = cellCenter(gx, gy); useUi.getState().requestFly({ lng, lat, zoom: Z_PLOT }); useUi.getState().select({ gx, gy }); nav('/world'); }}>Map</button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title={`Artwork (${d.publications.length})`}>
        {!d.publications.length ? <p className="text-sm text-muted">Nothing submitted yet.</p> : (
          <div className="grid gap-2">
            {d.publications.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-line p-2">
                <PubPreview path={p.preview_path} className="h-14 w-14 shrink-0" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-semibold">{p.title}</div>
                  <div className="text-xs text-muted">{p.status} · {p.plot_count} plots · {timeAgo(p.created_at)}</div>
                </div>
                {p.status === 'published' && <Button size="sm" variant="danger" onClick={async () => { if (await confirm({ title: 'Remove this artwork from the map?', body: 'Each plot goes back to its previous artwork. No strike is given.', confirm: 'Remove' })) void run(() => api.admin.removePublication(p.id, 'Removed by the operator', false), 'Removed', refetch); }}>Remove</Button>}
                {(p.status === 'removed' || p.status === 'rejected') && <Button size="sm" variant="ghost" onClick={() => run(() => p.status === 'removed' ? api.admin.restorePublication(p.id, 'Restored by the operator') : api.admin.reviewPublication(p.id, 'approve'), p.status === 'removed' ? 'Restored' : 'Approved', refetch)}>{p.status === 'removed' ? 'Restore' : 'Approve'}</Button>}
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Recent ledger">
          <div className="grid max-h-64 gap-1 overflow-y-auto text-xs scroll-thin">
            {d.ledger.map((l: any) => <div key={l.id} className="flex justify-between gap-2"><span className="truncate">{l.resource} · {String(l.reason).replace(/_/g, ' ')}</span><span className={cn('shrink-0 tnum', l.delta > 0 ? 'text-ok' : 'text-muted')}>{l.delta > 0 ? '+' : ''}{fmt(l.delta)} · {timeAgo(l.created_at)}</span></div>)}
          </div>
        </Card>
        <Card title="Security & minigames">
          <div className="grid max-h-64 gap-1 overflow-y-auto text-xs scroll-thin">
            {(d.security_events ?? []).map((e: any, i: number) => <div key={`e${i}`}><span className="text-faint">{timeAgo(e.created_at)}</span> <b>{String(e.kind).replace(/_/g, ' ')}</b> {e.details?.distance_m ? `${fmt(e.details.distance_m)} m in ${e.details.seconds}s` : ''}</div>)}
            {d.sessions.map((s: any) => <div key={s.id}><span className="text-faint">{timeAgo(s.started_at)}</span> {GAME_INFO[s.game as GameId]?.name ?? s.game} L{s.level} · {s.status}{s.passed ? ' · won' : ''} · {fmt(s.score ?? 0)}{s.review_status === 'flagged' ? ' · FLAGGED' : ''}</div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---- earnings ---------------------------------------------------------------------------

function NumberField({ label, value, onChange, step = 1, min = 0, max, hint, suffix }: { label: string; value: number; onChange(v: number): void; step?: number; min?: number; max?: number; hint?: string; suffix?: string }) {
  const id = useMemo(() => `nf-${label.replace(/\W+/g, '-').toLowerCase()}`, [label]);
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input id={id} type="number" className={cn(inputCls, 'h-10 tnum')} value={Number.isFinite(value) ? value : ''} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
        {suffix && <span className="shrink-0 text-xs text-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

function useConfig() {
  return useQuery({ queryKey: ['admin', 'config'], queryFn: api.admin.configGet });
}
function useSaveConfig() {
  const qc = useQueryClient();
  return async (key: string, value: unknown, ok = 'Saved for all players') => {
    await run(() => api.admin.configSet(key, value), ok, () => { void qc.invalidateQueries({ queryKey: ['admin', 'config'] }); void qc.invalidateQueries({ queryKey: ['world'] }); });
  };
}

const GAMES: GameId[] = [...GAME_IDS];

function Earnings() {
  const cfg = useConfig();
  if (!cfg.data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MinigameEarnings value={cfg.data.config.minigames.value} rarities={cfg.data.rarities} />
      <div className="grid content-start gap-4">
        <RarityRates rarities={cfg.data.rarities} />
        <PlotPrice economy={cfg.data.config.economy.value} />
        <BoostSettings rent={cfg.data.config.rent.value} />
      </div>
    </div>
  );
}

function MinigameEarnings({ value, rarities }: { value: any; rarities: any[] }) {
  const save = useSaveConfig();
  const [v, setV] = useState<any>(() => structuredClone(value));
  useEffect(() => setV(structuredClone(value)), [value]);
  const rw = v.rewards ?? {};
  const setRw = (k: string, n: number) => setV({ ...v, rewards: { ...rw, [k]: n } });
  const setGame = (g: string, patch: Record<string, unknown>) => setV({ ...v, games: { ...v.games, [g]: { ...(v.games?.[g] ?? {}), ...patch } } });
  const [ex, setEx] = useState({ level: 1, rarity: 'common', plotLevel: 1, game: 'tracecraft' as GameId });
  const rMult = Number(rarities.find((r) => r.id === ex.rarity)?.ink_reward_multiplier ?? 1);
  const eg = v.games?.[ex.game] ?? {};
  const boost = boostActive(eg.boost) ? Number(eg.boost.multiplier) : 1;
  const mult = (1 + Number(eg.plot_level_bonus ?? v.plot_level_bonus ?? 0.05) * (ex.plotLevel - 1)) * rMult * Number(v.ink_multiplier ?? 1) * Number(eg.ink_multiplier ?? 1) * boost;
  const exRounds = Number(eg.rounds ?? 5);
  const perRound = levelInk(eg, ex.level);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <Card title="Minigame earnings (Ink)" actions={<div className="flex gap-2">
      {dirty && <Button size="sm" variant="ghost" onClick={() => setV(structuredClone(value))}>Undo</Button>}
      <Button size="sm" variant="primary" disabled={!dirty} onClick={() => save('minigames', v, 'Minigame earnings updated for everyone')} data-testid="save-minigames">Save</Button>
    </div>}>
      <p className="mb-4 text-sm text-muted">You set the Ink for every round of every level, per game. A cleared round pays <b>that level’s Ink per round</b> × plot upgrade bonus × rarity bonus × multipliers × boost. Clearing every round levels the plot up.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Everyone’s Ink multiplier" value={Number(v.ink_multiplier ?? 1)} step={0.1} max={100} onChange={(n) => setV({ ...v, ink_multiplier: n })} suffix="×" hint="Applies to every game" />
        <NumberField label="Plot upgrade bonus" value={Math.round(Number(v.plot_level_bonus ?? 0.05) * 1000) / 10} step={0.5} onChange={(n) => setV({ ...v, plot_level_bonus: n / 100 })} suffix="% / level" />
        <NumberField label="Paid runs per game per day" value={Number(v.daily_rewarded_wins_per_game ?? 6)} max={1000} onChange={(n) => setV({ ...v, daily_rewarded_wins_per_game: Math.round(n) })} />
        <NumberField label="Default max level" value={Number(v.max_level ?? 60)} min={1} max={500} onChange={(n) => setV({ ...v, max_level: Math.round(n) })} hint="Used by games without their own" />
      </div>
      <div className="mt-5 grid gap-2">
        <div className="eyebrow">Each game</div>
        {GAMES.map((g) => <GameEarningsRow key={g} g={g} v={v} setGame={setGame} />)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <NumberField label="XP per win" value={Number(rw.brush_points_base)} onChange={(n) => setRw('brush_points_base', n)} />
        <NumberField label="XP per star" value={Number(rw.brush_points_per_star)} onChange={(n) => setRw('brush_points_per_star', n)} />
        <NumberField label="Pigments at 3★" value={Number(rw.pigments_on_three_stars)} onChange={(n) => setRw('pigments_on_three_stars', n)} />
        <NumberField label="XP for a loss" value={Number(rw.fail_brush_points)} onChange={(n) => setRw('fail_brush_points', n)} />
      </div>
      <div className="mt-4 rounded-2xl bg-accent/10 p-3 text-sm">
        <div className="eyebrow mb-2">Preview</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={cn(inputCls, 'h-9 w-auto')} value={ex.game} onChange={(e) => setEx({ ...ex, game: e.target.value as GameId })} aria-label="Game">{GAMES.map((g) => <option key={g} value={g}>{GAME_INFO[g]?.name ?? g}</option>)}</select>
          <span>level</span><input type="number" min={1} max={maxLevelOf(eg, v)} className={cn(inputCls, 'h-9 w-16')} value={ex.level} onChange={(e) => setEx({ ...ex, level: Number(e.target.value) })} />
          <span>on a</span><select className={cn(inputCls, 'h-9 w-auto')} value={ex.rarity} onChange={(e) => setEx({ ...ex, rarity: e.target.value })} aria-label="Rarity">{RARITY_ORDER.map((r) => <option key={r} value={r}>{rarityInfo(r).name}</option>)}</select>
          <span>plot, upgrade level</span><input type="number" min={1} max={10} className={cn(inputCls, 'h-9 w-16')} value={ex.plotLevel} onChange={(e) => setEx({ ...ex, plotLevel: Number(e.target.value) })} />
        </div>
        <div className="mt-2 font-display text-lg font-semibold tnum">{fmt(Math.floor(perRound * mult))} Ink per round · {fmt(Math.floor(perRound * exRounds * mult))} for all {exRounds} <span className="text-sm font-normal text-muted">(×{mult.toFixed(2)}{boost > 1 ? `, incl. ${boost}× boost` : ''})</span></div>
      </div>
    </Card>
  );
}

const boostActive = (b: any) => !!b && Number(b.multiplier) > 1 && (!b.ends_at || new Date(b.ends_at).getTime() > Date.now());
const maxLevelOf = (gc: any, v: any) => Math.max(1, Math.min(500, Number(gc?.max_level ?? v?.max_level ?? 60)));
/** Ink per cleared round at a level (the last table value carries on past the table's end). */
function levelInk(gc: any, level: number) {
  const t: number[] = Array.isArray(gc?.level_ink) ? gc.level_ink : [];
  if (!t.length) return 0;
  return Number(t[Math.min(level, t.length) - 1] ?? 0);
}

function GameEarningsRow({ g, v, setGame }: { g: GameId; v: any; setGame(g: string, patch: Record<string, unknown>): void }) {
  const c = v.games?.[g] ?? {};
  const max = maxLevelOf(c, v);
  const rounds = Number(c.rounds ?? 5);
  const table: number[] = Array.from({ length: max }, (_, i) => levelInk(c, i + 1));
  const [fill, setFill] = useState({ start: table[0] || 5, step: 1 });
  const [hours, setHours] = useState(24);
  const [boostX, setBoostX] = useState(2);
  const live = boostActive(c.boost);
  const setMax = (n: number) => {
    const m = Math.max(1, Math.min(500, Math.round(n)));
    const next = Array.from({ length: m }, (_, i) => table[i] ?? table[table.length - 1] ?? fill.start);
    setGame(g, { max_level: m, level_ink: next });
  };
  const setCell = (i: number, n: number) => { const next = [...table]; next[i] = Math.max(0, Math.round(n)); setGame(g, { level_ink: next }); };
  return (
    <details className={cn('group rounded-2xl border p-3', live ? 'border-gold/60 bg-gold/5' : 'border-line')} data-testid={`game-earn-${g}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <span className="font-semibold">{GAME_INFO[g]?.name ?? g}</span>
        <span className="text-xs text-faint tnum">{max} levels · {rounds} rounds · Lv 1 {fmt(table[0] ?? 0)}/round → Lv {max} {fmt(table[max - 1] ?? 0)}/round</span>
        {live && <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold text-bg">{c.boost.multiplier}× BOOST</span>}
        {c.enabled === false && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-faint">OFF</span>}
        <ChevronDown className="ml-auto h-4 w-4 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={c.enabled !== false} onChange={(e) => setGame(g, { enabled: e.target.checked })} /> Playable</label>
          <NumberField label="Levels" value={max} min={1} max={500} onChange={setMax} />
          <NumberField label="Rounds per level" value={rounds} min={1} max={10} onChange={(n) => setGame(g, { rounds: Math.round(n) })} />
          <NumberField label="Game multiplier" value={Number(c.ink_multiplier ?? 1)} step={0.1} max={100} onChange={(n) => setGame(g, { ink_multiplier: n })} suffix="×" />
          <NumberField label="Upgrade bonus" value={Math.round(Number(c.plot_level_bonus ?? v.plot_level_bonus ?? 0.05) * 1000) / 10} step={0.5} max={1000} onChange={(n) => setGame(g, { plot_level_bonus: n / 100 })} suffix="%/lv" />
        </div>
        <div className="rounded-2xl border border-gold/40 bg-gold/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Zap className="h-4 w-4 text-gold" /> Boost {live ? <span className="text-xs font-semibold text-gold">live · {c.boost.multiplier}× until {c.boost.ends_at ? new Date(c.boost.ends_at).toLocaleString() : 'you stop it'}</span> : <span className="text-xs font-normal text-muted">shows at the top of Play with its rate</span>}</div>
          <div className="flex flex-wrap items-end gap-2">
            <NumberField label="Multiplier" value={boostX} min={1.1} max={50} step={0.5} onChange={setBoostX} suffix="×" />
            <NumberField label="For" value={hours} min={0} max={24 * 30} onChange={setHours} suffix="hours" hint="0 = until you stop it" />
            <Button size="sm" variant="primary" onClick={() => setGame(g, { boost: { multiplier: boostX, ends_at: hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : null } })} data-testid={`boost-${g}`}><Zap className="h-4 w-4" /> {live ? 'Update boost' : 'Start boost'}</Button>
            {c.boost && <Button size="sm" variant="ghost" onClick={() => setGame(g, { boost: undefined })}>Stop boost</Button>}
          </div>
          <p className="mt-1 text-[11px] text-faint">Remember to press Save above.</p>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <div className="eyebrow mr-auto">Ink per cleared round, by level</div>
            <NumberField label="Level 1" value={fill.start} min={0} onChange={(n) => setFill({ ...fill, start: n })} suffix="Ink" />
            <NumberField label="Then add" value={fill.step} min={0} step={0.5} onChange={(n) => setFill({ ...fill, step: n })} suffix="per level" />
            <Button size="sm" variant="secondary" onClick={() => setGame(g, { level_ink: Array.from({ length: max }, (_, i) => Math.round(fill.start + fill.step * i)) })} data-testid={`fill-${g}`}>Fill all {max} levels</Button>
          </div>
          <div className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5 overflow-y-auto scroll-thin pr-1">
            {table.map((n, i) => (
              <label key={i} className="grid gap-0.5 rounded-xl border border-line bg-surface/40 p-1.5 text-[10px] font-semibold text-muted">
                Lv {i + 1} <span className="font-normal text-faint">= {fmt(n * rounds)}/level</span>
                <input type="number" min={0} max={100000} className="h-8 w-full rounded-lg border border-line bg-surface px-1.5 text-sm text-fg tnum" value={n} onChange={(e) => setCell(i, Number(e.target.value))} aria-label={`Level ${i + 1} Ink per round`} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function RarityRates({ rarities }: { rarities: any[] }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Record<string, { usd?: string; ink?: string }>>({});
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'config'] }); void qc.invalidateQueries({ queryKey: ['world'] }); };
  return (
    <Card title="Rarities: USD rent & Ink bonus">
      <div className="grid gap-2">
        {RARITY_ORDER.map((id) => {
          const r = rarities.find((x: any) => x.id === id);
          if (!r) return null;
          const e = edit[id] ?? {};
          return (
            <div key={id} className="flex flex-wrap items-center gap-2 text-sm">
              <RarityBadge r={id} small />
              <span className="w-44 text-xs tnum text-muted">{formatRate(Number(r.usd_per_second))} · ×{Number(r.ink_reward_multiplier).toFixed(2)} Ink · {(r.weight / 10).toFixed(1)}%</span>
              <input className={cn(inputCls, "h-8 w-32 text-xs")} placeholder="USD / second" value={e.usd ?? ''} onChange={(ev) => setEdit({ ...edit, [id]: { ...e, usd: ev.target.value } })} />
              <input className={cn(inputCls, "h-8 w-20 text-xs")} placeholder="Ink ×" value={e.ink ?? ''} onChange={(ev) => setEdit({ ...edit, [id]: { ...e, ink: ev.target.value } })} />
              <Button size="sm" disabled={!e.usd && !e.ink} onClick={() => run(() => api.admin.updateRarity(id, { ...(e.usd ? { usd_per_second: Number(e.usd) } : {}), ...(e.ink ? { ink_reward_multiplier: Number(e.ink) } : {}) }), `${r.name} updated`, () => { setEdit({ ...edit, [id]: {} }); refresh(); })}>Set</Button>
            </div>
          );
        })}
        <p className="text-xs text-faint">Rent changes bank everyone’s rent first, so they never apply retroactively. Atlas Earth’s common rate is 0.0000000011 USD/s.</p>
      </div>
    </Card>
  );
}

function PlotPrice({ economy }: { economy: any }) {
  const save = useSaveConfig();
  const [price, setPrice] = useState(Number(economy.acquire?.base_ink ?? 100));
  useEffect(() => setPrice(Number(economy.acquire?.base_ink ?? 100)), [economy]);
  return (
    <Card title="Plot price" actions={<Button size="sm" variant="primary" disabled={price === Number(economy.acquire?.base_ink)} onClick={() => save('economy', { ...economy, acquire: { ...economy.acquire, base_ink: price } }, 'Plot price updated')}>Save</Button>}>
      <NumberField label="Ink per plot" value={price} min={1} onChange={setPrice} hint="Rarer plots don’t cost more unless you change a rarity’s price multiplier." />
    </Card>
  );
}

function BoostSettings({ rent }: { rent: any }) {
  const save = useSaveConfig();
  const [b, setB] = useState<any>(() => ({ ...rent.boost }));
  useEffect(() => setB({ ...rent.boost }), [rent]);
  const dirty = JSON.stringify(b) !== JSON.stringify(rent.boost);
  return (
    <Card title="Rent boost" actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => save('rent', { ...rent, boost: b }, 'Boost updated')}>Save</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Multiplier" value={Number(b.multiplier)} min={1} max={100} onChange={(n) => setB({ ...b, multiplier: n })} suffix="×" />
        <NumberField label="Minutes per press" value={Number(b.minutes_per_boost)} min={1} onChange={(n) => setB({ ...b, minutes_per_boost: Math.round(n) })} />
        <NumberField label="Free presses per day" value={Number(b.free_per_day)} onChange={(n) => setB({ ...b, free_per_day: Math.round(n) })} />
        <NumberField label="Max stacked hours" value={Number(b.max_stack_hours)} step={0.5} onChange={(n) => setB({ ...b, max_stack_hours: n })} />
      </div>
    </Card>
  );
}

// ---- world ------------------------------------------------------------------------------

function World() {
  const cfg = useConfig();
  const save = useSaveConfig();
  const qc = useQueryClient();
  const [v, setV] = useState<any>(null);
  useEffect(() => { if (cfg.data) setV(structuredClone(cfg.data.config.explorer.value)); }, [cfg.data]);
  if (!cfg.data || !v) return <div className="flex justify-center py-10"><Spinner /></div>;
  const value = cfg.data.config.explorer.value;
  const j = v.joystick ?? {};
  const setJ = (patch: Record<string, unknown>) => setV({ ...v, joystick: { ...j, ...patch } });
  const gate = cfg.data.flags.find((f: any) => f.key === 'location_gated_claims');
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Explorer & claiming" actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => save('explorer', v, 'Explorer rules updated')}>Save</Button>}>
        {gate && <Switch id="gate" checked={gate.enabled} label="Plots can only be claimed near your explorer" hint="Off = anyone can claim any plot from anywhere." onCheckedChange={(on) => run(() => api.admin.setFlag('location_gated_claims', on), on ? 'Location rules on' : 'Location rules off', () => qc.invalidateQueries({ queryKey: ['admin', 'config'] }))} />}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <NumberField label="Claim reach" value={Number(v.claim_reach)} max={25} onChange={(n) => setV({ ...v, claim_reach: Math.round(n) })} suffix="plots" />
          <NumberField label="Max believable GPS speed" value={Number(v.max_speed_kmh)} min={10} onChange={(n) => setV({ ...v, max_speed_kmh: n })} suffix="km/h" />
        </div>
        <p className="mt-3 text-xs text-muted">Explorers follow real GPS only: no teleporting, no placing by hand, no tap-to-travel. The joystick can nudge an explorer at most one tank’s distance from the player.</p>
      </Card>
      <Card title="Joystick" actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => save('explorer', v, 'Joystick updated')}>Save</Button>}>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={j.enabled !== false} onChange={(e) => setJ({ enabled: e.target.checked })} /> Joystick available</label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="Speed" value={Number(j.speed_kmh ?? 40)} min={1} max={500} onChange={(n) => setJ({ speed_kmh: n })} suffix="km/h" />
          <NumberField label="Tank" value={Number(j.tank_seconds ?? 60)} min={0} max={3600} onChange={(n) => setJ({ tank_seconds: Math.round(n) })} suffix="seconds" hint="Also how far (time × speed) it can stray from the player" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={j.daily_refill !== false} onChange={(e) => setJ({ daily_refill: e.target.checked })} /> Free daily refill (until rewarded ads are connected)</label>
      </Card>
    </div>
  );
}

// ---- plots ------------------------------------------------------------------------------

function Plots() {
  const [q, setQ] = useState('');
  const [cell, setCell] = useState<{ gx: number; gy: number } | null>(null);
  const nav = useNavigate();
  const look = useQuery({ queryKey: ['admin', 'plot', cell?.gx, cell?.gy], queryFn: () => api.admin.plotLookup(cell!.gx, cell!.gy), enabled: !!cell });
  const [reason, setReason] = useState('');
  const d = look.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Find a plot">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const m = q.match(/(\d+)\D+(\d+)/); if (m) setCell({ gx: Number(m[1]), gy: Number(m[2]) }); }}>
          <input className={inputCls} placeholder="Plot coordinates, e.g. 12398 24628" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit">Look up</Button>
        </form>
        <p className="mt-2 text-xs text-faint">Tip: open a plot on the map — its number is in the panel header.</p>
      </Card>
      {cell && (
        <Card title={`Plot ${plotLabel(cell.gx, cell.gy)}`} actions={<Button size="sm" variant="ghost" onClick={() => { const [lng, lat] = cellCenter(cell.gx, cell.gy); useUi.getState().requestFly({ lng, lat, zoom: Z_PLOT }); useUi.getState().select(cell); nav('/world'); }}><MapPin className="h-4 w-4" /> Map</Button>}>
          {!d ? <Spinner /> : (
            <div className="grid gap-2 text-sm">
              <div>{d.plot ? <>Owner <b>@{d.owner?.username ?? '—'}</b> · {d.plot.plot_type} · {d.plot.rarity} · level {d.plot.level}{d.plot.name ? ` · “${d.plot.name}”` : ''}{d.plot.locked ? ' · LOCKED' : ''}</> : <>Unclaimed · {d.computed_type}</>}</div>
              <input className={cn(inputCls, 'h-9')} placeholder="Reason (audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {d.plot && <Button size="sm" variant="ghost" disabled={reason.length < 4} onClick={() => run(() => api.admin.setPlotLock(cell.gx, cell.gy, !d.plot.locked, reason), d.plot.locked ? 'Unlocked' : 'Locked', () => look.refetch())}>{d.plot.locked ? 'Unlock' : 'Lock'}</Button>}
                {d.plot?.owner_id && <Button size="sm" variant="danger" disabled={reason.length < 4} onClick={() => run(() => api.admin.releasePlot(cell.gx, cell.gy, reason), 'Released', () => look.refetch())}>Release from owner</Button>}
                {d.plot?.name && <Button size="sm" variant="ghost" onClick={() => run(() => api.admin.clearPlotName(cell.gx, cell.gy, reason || 'Operator'), 'Name cleared', () => look.refetch())}>Clear name</Button>}
              </div>
              <div className="eyebrow mt-2">Ownership history</div>
              <div className="grid gap-1 text-xs text-muted">{d.ownership_history.map((o: any, i: number) => <div key={i}>@{o.player?.username} · {o.method} · {new Date(o.acquired_at).toLocaleString()}{o.released_at ? ` → released ${new Date(o.released_at).toLocaleString()} (${o.release_reason})` : ''}</div>)}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ---- switches, cash-outs, system ----------------------------------------------------------

function Flags() {
  const qc = useQueryClient();
  const q = useConfig();
  if (!q.data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
      {q.data.flags.filter((f: any) => f.key !== 'local_dev_mode').map((f: any) => (
        <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0">
            <div className="font-bold">{f.key.replace(/_/g, ' ')} {f.config?.legally_gated && <span className="ml-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold text-warn">NEEDS LEGAL SIGN-OFF</span>}</div>
            <div className="text-xs text-muted">{f.description}</div>
          </div>
          <Button size="sm" variant={f.enabled ? 'secondary' : 'primary'} onClick={() => run(() => api.admin.setFlag(f.key, !f.enabled), `${f.key} ${f.enabled ? 'off' : 'on'}`, () => qc.invalidateQueries({ queryKey: ['admin', 'config'] }))}>{f.enabled ? 'Turn off' : 'Turn on'}</Button>
        </div>
      ))}
    </div>
  );
}

function Cashouts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'cashouts'], queryFn: () => api.admin.cashoutQueue('requested') });
  const [refs, setRefs] = useState<Record<string, string>>({});
  if (q.error) return <Empty title="Cash-outs unavailable">{toGameError(q.error).message}</Empty>;
  if (!q.data) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!q.data.length) return <Empty title="No cash-out requests">Cash-out stays off until the legally gated “cashout” switch is signed off.</Empty>;
  return (
    <div className="grid gap-3">
      {q.data.map((r: any) => (
        <div key={r.id} className="glass grid gap-2 rounded-3xl p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><b>@{r.player.username}</b> requested <b className="tnum">${(r.payout_cents / 100).toFixed(2)}</b> via {r.method} to <code className="rounded bg-surface-2 px-1">{r.destination}</code> <span className="text-faint">{timeAgo(r.created_at)}</span></div>
          <div className="text-xs text-muted">{r.player_plots} plots · member since {new Date(r.player_since).toLocaleDateString()} {r.risk_flags?.length ? `· flags: ${r.risk_flags.join(', ')}` : ''}</div>
          <div className="flex flex-wrap gap-2">
            <input className={cn(inputCls, "h-9 max-w-xs")} placeholder="Payment reference (after paying)" value={refs[r.id] ?? ''} onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })} />
            <Button size="sm" variant="primary" disabled={!refs[r.id]} onClick={() => run(() => api.admin.decideCashout(r.id, 'paid', refs[r.id]), 'Marked paid', () => qc.invalidateQueries({ queryKey: ['admin', 'cashouts'] }))}>Mark paid</Button>
            <Button size="sm" variant="danger" onClick={() => run(() => api.admin.decideCashout(r.id, 'rejected', undefined, 'Rejected by review'), 'Rejected — funds returned', () => qc.invalidateQueries({ queryKey: ['admin', 'cashouts'] }))}>Reject</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function JsonConfig({ k, value, description }: { k: string; value: unknown; description?: string }) {
  const save = useSaveConfig();
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <details className="rounded-2xl border border-line p-3">
      <summary className="cursor-pointer text-sm font-bold">{k}<span className="ml-2 text-xs font-normal text-muted">{description}</span></summary>
      <textarea className={cn(inputCls, "mt-2 h-64 py-2 font-mono text-xs")} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <Button size="sm" className="mt-2" onClick={() => { try { void save(k, JSON.parse(text), `${k} saved`); } catch { toast.error('That isn’t valid JSON'); } }}>Save {k}</Button>
    </details>
  );
}

function System() {
  const qc = useQueryClient();
  const cfg = useConfig();
  const jobs = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => api.admin.jobs() });
  const errs = useQuery({ queryKey: ['admin', 'errors'], queryFn: api.admin.clientErrors });
  const audit = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api.admin.audit(80) });
  return (
    <div className="grid gap-4">
      <Card title="Every setting (advanced)">
        <p className="mb-3 text-xs text-muted">Raw values behind the game. Changes are validated and audited; invalid ranges are refused.</p>
        <div className="grid gap-2">
          {cfg.data && Object.entries(cfg.data.config).map(([k, c]: [string, any]) => <JsonConfig key={k} k={k} value={c.value} description={c.description} />)}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
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
    </div>
  );
}

// ---- social: invites, Ink conversion, chat ---------------------------------------------------

function SocialAdmin() {
  const cfg = useConfig();
  const save = useSaveConfig();
  const qc = useQueryClient();
  const [ref, setRef] = useState<any>(null);
  const [conv, setConv] = useState<any>(null);
  useEffect(() => {
    if (!cfg.data) return;
    setRef(structuredClone(cfg.data.config.referrals?.value ?? {}));
    setConv(structuredClone(cfg.data.config.rent?.value?.convert ?? { enabled: true, ink_per_usd: 100 }));
  }, [cfg.data]);
  const chat = useQuery({ queryKey: ['admin', 'chat'], queryFn: () => api.chatRecent(null), refetchInterval: 10_000 });
  if (!cfg.data || !ref || !conv) return <div className="flex justify-center py-10"><Spinner /></div>;
  const refValue = cfg.data.config.referrals?.value ?? {};
  const rent = cfg.data.config.rent.value;
  const chatFlag = cfg.data.flags.find((f: any) => f.key === 'global_chat');
  const refDirty = JSON.stringify(ref) !== JSON.stringify(refValue);
  const convDirty = JSON.stringify(conv) !== JSON.stringify(rent.convert ?? { enabled: true, ink_per_usd: 100 });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Invite rewards" actions={<Button size="sm" variant="primary" disabled={!refDirty} onClick={() => save('referrals', { ...ref, reward_ink: Math.round(ref.reward_ink), referee_reward_ink: Math.round(ref.referee_reward_ink ?? 0), daily_cap: Math.round(ref.daily_cap), redeem_window_days: Math.round(ref.redeem_window_days) }, 'Invite rewards updated')} data-testid="save-referrals">Save</Button>}>
        <Switch id="ref-on" checked={ref.enabled !== false} label={ref.enabled !== false ? 'Invite rewards are on' : 'Invite rewards are paused'} onCheckedChange={(on) => setRef({ ...ref, enabled: on })} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="Ink for the inviter" value={Number(ref.reward_ink)} max={100000} onChange={(n) => setRef({ ...ref, reward_ink: n })} />
          <NumberField label="Ink for the new player" value={Number(ref.referee_reward_ink ?? 0)} max={100000} onChange={(n) => setRef({ ...ref, referee_reward_ink: n })} />
          <NumberField label="Rewarded invites per day" value={Number(ref.daily_cap)} max={10000} onChange={(n) => setRef({ ...ref, daily_cap: n })} hint="per inviter" />
          <NumberField label="Days to enter a code" value={Number(ref.redeem_window_days)} max={3650} onChange={(n) => setRef({ ...ref, redeem_window_days: n })} hint="after joining" />
        </div>
        <Field label="Pay out when the new player…" htmlFor="ref-qualify">
          <select id="ref-qualify" className={cn(inputCls, 'h-10')} value={ref.qualify} onChange={(e) => setRef({ ...ref, qualify: e.target.value })}>
            <option value="signup">finishes signing up</option>
            <option value="starter_plot">claims their first plot</option>
            <option value="first_win">wins their first minigame (recommended)</option>
          </select>
        </Field>
      </Card>
      <Card title="USD rent → Ink" actions={<Button size="sm" variant="primary" disabled={!convDirty} onClick={() => save('rent', { ...rent, convert: { enabled: !!conv.enabled, ink_per_usd: Math.max(1, Math.round(conv.ink_per_usd)) } }, 'Conversion updated')}>Save</Button>}>
        <Switch id="conv-on" checked={conv.enabled !== false} label={conv.enabled !== false ? 'Players can convert rent to Ink' : 'Conversion is off'} onCheckedChange={(on) => setConv({ ...conv, enabled: on })} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="Ink per $1" value={Number(conv.ink_per_usd)} min={1} max={1000000} onChange={(n) => setConv({ ...conv, ink_per_usd: n })} hint={`Smallest conversion: $${(1 / Math.max(1, Number(conv.ink_per_usd) || 1)).toFixed(4)} = 1 Ink`} />
        </div>
      </Card>
      <Card title="Global chat" className="xl:col-span-2" actions={chatFlag && (
        <Switch id="chat-on" checked={chatFlag.enabled} label={chatFlag.enabled ? 'Chat on' : 'Chat off'} onCheckedChange={(on) => run(() => api.admin.setFlag('global_chat', on), on ? 'Chat is on' : 'Chat is off', () => qc.invalidateQueries({ queryKey: ['admin', 'config'] }))} />
      )}>
        <p className="mb-3 text-xs text-muted">Messages are filtered (links blocked, blocked words masked) and rate limited. Reports land in the Review tab.</p>
        <div className="grid max-h-[50vh] gap-1 overflow-y-auto text-sm scroll-thin">
          {(chat.data?.messages ?? []).slice().reverse().map((m) => (
            <div key={m.id} className={cn('flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2', m.deleted && 'opacity-50')}>
              <PlayerAvatar p={m.player} size={24} />
              <div className="min-w-0 flex-1"><b>@{m.player.username}</b> <span className="text-xs text-faint">{timeAgo(m.created_at)}</span>{m.deleted && <span className="ml-1 text-xs text-bad">removed</span>}<div className="break-words">{m.body}</div></div>
              {!m.deleted && <button className="text-xs text-bad hover:underline" onClick={() => run(() => api.admin.deleteChat(m.id, 'Removed by the operator'), 'Message removed', () => chat.refetch())}>Delete</button>}
              <button className="text-xs text-muted hover:underline" onClick={() => run(() => api.admin.mutePlayer(m.player.id, 60, 'Muted by the operator'), `@${m.player.username} muted for 1 hour`)}>Mute 1h</button>
            </div>
          ))}
          {!chat.data?.messages?.length && <p className="text-sm text-muted">No messages yet.</p>}
        </div>
      </Card>
    </div>
  );
}

// ---- shop prices ----------------------------------------------------------------------------

const COST_KEYS = ['ink', 'pigments', 'gallery_tokens'] as const;

function ShopAdmin() {
  const cfg = useConfig();
  const save = useSaveConfig();
  const [items, setItems] = useState<any[] | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => { if (cfg.data) setItems(structuredClone(cfg.data.config.shop?.value?.items ?? [])); }, [cfg.data]);
  if (!cfg.data || !items) return <div className="flex justify-center py-10"><Spinner /></div>;
  const value = cfg.data.config.shop?.value?.items ?? [];
  const dirty = JSON.stringify(items) !== JSON.stringify(value);
  const groups = [...new Set(items.map((i) => i.group ?? 'Other'))];
  const setItem = (key: string, patch: Record<string, unknown>) => setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const setCost = (key: string, res: string, n: number) => setItems(items.map((i) => {
    if (i.key !== key) return i;
    const cost = { ...(i.cost ?? {}) };
    if (!Number.isFinite(n) || n <= 0) delete cost[res]; else cost[res] = Math.min(9_999_999, Math.round(n));
    return { ...i, cost };
  }));
  return (
    <div className="grid gap-4">
      <Card title="Shop prices" actions={<div className="flex gap-2">
        {dirty && <Button size="sm" variant="ghost" onClick={() => setItems(structuredClone(value))}>Undo</Button>}
        <Button size="sm" variant="primary" disabled={!dirty} onClick={() => save('shop', { ...cfg.data.config.shop.value, items }, 'Shop prices saved for everyone')} data-testid="save-shop">Save prices</Button>
      </div>}>
        <p className="mb-3 text-sm text-muted">Set any price to 0 to make an item free for everyone. Turning an item off hides it from the shop; players who already bought it keep it.</p>
        <input className={cn(inputCls, 'mb-3')} placeholder="Filter items" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="grid gap-5">
          {groups.map((g) => {
            const list = items.filter((i) => (i.group ?? 'Other') === g && (!filter || `${i.name} ${i.key}`.toLowerCase().includes(filter.toLowerCase())));
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="eyebrow mb-2">{g}</div>
                <div className="grid gap-1.5">
                  {list.map((i) => (
                    <div key={i.key} className={cn('flex flex-wrap items-center gap-2 rounded-2xl border border-line px-3 py-2', i.enabled === false && 'opacity-55')}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{i.name}</div>
                        <div className="truncate font-mono text-[11px] text-faint">{i.key}</div>
                      </div>
                      {COST_KEYS.map((r) => (
                        <label key={r} className="flex items-center gap-1 text-[11px] text-muted">
                          {r === 'gallery_tokens' ? 'tokens' : r}
                          <input type="number" min={0} className={cn(inputCls, 'h-8 w-20 text-xs tnum')} value={i.cost?.[r] ?? 0} onChange={(e) => setCost(i.key, r, Number(e.target.value))} />
                        </label>
                      ))}
                      <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={i.enabled !== false} onChange={(e) => setItem(i.key, { enabled: e.target.checked })} /> In shop</label>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
