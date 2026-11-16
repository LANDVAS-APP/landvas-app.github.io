// Admin → Fair play. Five scanners on one page:
//   Radar: what's going wrong in the whole game right now — sources paying far more than usual (and who takes most of each,
//     with the Earning switch that stops it), payouts paid twice, balances out of step with the ledger, actions spiking,
//     arcade scores sent above what's possible, and the riskiest players.
//   Referral fraud: every inviter, worst first, with each invited account's evidence (email, link, play, what it paid).
//   Risk scores: the integrity scanner (src/admin/IntegrityAdmin).
//   Egg loop: players who sacrificed Inkborn they never had (hatch an egg, sacrifice the Inkborn, the egg came back),
//     the plots they rolled with that Luck, and the fixes: put a plot back to a lower tier, take it away, and take back
//     what those plots earned (and what it was spent on).
//   Ultras & rent: everyone with ultras, and what their land earns now and would earn boosted 24/7.
// EggLoopPlayer and PlayerUltras also show on a player's profile.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { IntegrityAdmin } from '../../../src/admin/IntegrityAdmin';
import { toGameError } from '../../../src/backend/backend';
import { Button, PlayerAvatar, useConfirm } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { rarityInfo } from '../../../src/shared/rarity';
import { portal, type EggLoopPlayer as EggData, type EggLoopPlot, type Families, type Referee, type UltraRow } from '../../shared/api';
import { TimeChart } from '../../shared/charts';
import { DataTable } from '../../shared/table';
import { date, dateTime, int, pct, plotLabel, usd } from '../../shared/format';
import { Badge, Empty, KV, Panel, Q, Rarity, Seg, Stat, statusTone, useDebounced } from '../../shared/ui';

const err = (e: unknown) => toast.error(toGameError(e).message);
const key = (p: { gx: number; gy: number }) => `${p.gx}_${p.gy}`;
const REASON = 'Egg loop: Luck from duplicated Inkborn';
type View = 'radar' | 'referrals' | 'risk' | 'eggloop' | 'ultras';

export default function FairPlayPage() {
  const [sp, setSp] = useSearchParams();
  const view = (['radar', 'referrals', 'eggloop', 'ultras'].includes(sp.get('view') ?? '') ? sp.get('view') : 'risk') as View;
  const set = (v: View) => setSp((prev) => { const n = new URLSearchParams(prev); n.delete('player'); if (v === 'risk') n.delete('view'); else n.set('view', v); return n; }, { replace: true });
  return (
    <div className="grid gap-4" data-testid="fair-play">
      <Seg value={view} onChange={set} label="Scanner" options={[
        { value: 'risk', label: '🛡️ Risk scores' }, { value: 'radar', label: '📡 Exploit radar' }, { value: 'referrals', label: '🎯 Referral fraud' },
        { value: 'eggloop', label: '🥚 Egg loop' }, { value: 'ultras', label: '🌈 Ultras & rent' },
      ]} />
      {view === 'radar' && <ExploitRadar />}
      {view === 'referrals' && <ReferralFraud />}
      {view === 'risk' && <IntegrityAdmin />}
      {view === 'eggloop' && <EggLoopScanner />}
      {view === 'ultras' && <UltraScanner />}
    </div>
  );
}

// ---- the radar ------------------------------------------------------------------------------------------------------
const FAMILY: Record<string, string> = { referral: 'Referral', multi_account: 'Alt accounts', ink_ring: 'Ink ring', automation: 'Bot / script', speed: 'Speed', exploit: 'Exploit', location: 'Location' };
export function FamilyChips({ f, proof }: { f: Families; proof?: boolean }) {
  const list = Object.entries(f ?? {}).filter(([, v]) => Number(v) >= 0.1).sort((a, b) => Number(b[1]) - Number(a[1]));
  return (
    <span className="flex flex-wrap items-center gap-1">
      {proof && <Badge tone="bad">proof</Badge>}
      {list.map(([k, v]) => <Badge key={k} tone={Number(v) >= 0.6 ? 'bad' : Number(v) >= 0.35 ? 'warn' : 'muted'}>{FAMILY[k] ?? k} {Math.round(Number(v) * 100)}%</Badge>)}
    </span>
  );
}

function ExploitRadar() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin', 'radar'], queryFn: portal.exploitRadar, refetchInterval: 60_000 });
  const stop = async (key: string, label: string) => {
    const ok = await confirm({ title: `Stop ${label} now?`, body: <>Everyone keeps playing; <b>{label}</b> pays nothing until you switch it back on (Earning switches).</>, confirm: 'Stop it', danger: true });
    if (!ok) return;
    try { await portal.earnSwitch(key, true, 'Stopped from the Fair play radar'); toast.success(`Stopped: ${key}`); void qc.invalidateQueries({ queryKey: ['admin'] }); } catch (e) { err(e); }
  };
  return (
    <div className="grid gap-3" data-testid="exploit-radar">
      <Panel title="📡 Exploit radar">
        <p className="text-sm text-muted">
          The whole game in the last 24 hours against its usual day (the 7 days before). A source paying far more than usual, or mostly to one player, is the
          first sign of a bug being farmed. Stop any of them on the spot: the game keeps playing and that source pays nothing until you switch it back on.
        </p>
      </Panel>
      <Q q={q} label="Sweeping the game…">{(d) => {
        const off = new Set(d.switches_off);
        return (
          <>
            <Panel pad={false} title="Where Ink comes from today">
              <DataTable rows={d.sources} rowKey={(r) => r.source} dense cols={[
                { key: 'source', label: 'Source', render: (r) => <span data-testid={`radar-src-${r.source}`}><b>{r.source.replace(/_/g, ' ')}</b>{off.has(r.key) && <Badge tone="bad" className="ml-1.5">stopped</Badge>}</span> },
                { key: 'today', label: 'Today', num: true, sort: true, render: (r) => int(r.today) },
                { key: 'usual', label: 'Usual day', num: true, sort: true, render: (r) => <span className="text-muted">{int(r.usual)}</span> },
                { key: 'spike', label: 'vs usual', num: true, sort: (r) => r.spike ?? 999, render: (r) => r.spike == null ? <Badge tone="accent">new</Badge>
                  : <b className={r.spike >= 3 ? 'text-bad' : r.spike >= 1.5 ? 'text-gold' : 'text-muted'}>×{r.spike.toFixed(2)}</b> },
                { key: 'players', label: 'Players', num: true, sort: true, render: (r) => int(r.players) },
                { key: 'top', label: 'Top earner', sort: (r) => r.top?.share ?? 0, render: (r) => r.top ? (
                  <Link to={`/players/${r.top.player.id}`} className="flex items-center gap-1.5 hover:underline">
                    <PlayerAvatar p={r.top.player} size={20} />@{r.top.player.username}
                    <span className={cn('tnum', r.top.share >= 0.5 && r.players > 3 ? 'font-bold text-bad' : 'text-muted')}>{pct(r.top.share, 0)}</span>
                  </Link>) : '—' },
                { key: 'act', label: '', render: (r) => off.has(r.key) ? <Button size="sm" variant="ghost" onClick={() => nav(`/earning?find=${encodeURIComponent(r.key)}`)}>Switches</Button>
                  : <Button size="sm" variant="ghost" onClick={() => void stop(r.key, r.source.replace(/_/g, ' '))} data-testid={`radar-stop-${r.source}`}>Stop</Button> },
              ]} />
            </Panel>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="💸 Payouts paid more than once (7 days)">
                {d.double_paid.length ? (
                  <div className="grid gap-1.5 text-sm" data-testid="radar-double">
                    {d.double_paid.map((x) => <div key={x.ref_type} className="flex flex-wrap items-center gap-2"><b>{x.ref_type.replace(/_/g, ' ')}</b>
                      <span className="text-muted">{int(x.groups)} payouts · {int(x.players)} players</span><b className="ml-auto text-bad">+{int(x.extra_ink)} Ink</b></div>)}
                    <p className="text-xs text-faint">The same game, match or find paid twice: a bug, and whoever repeats it on purpose is farming it.</p>
                  </div>) : <p className="text-sm text-muted">None — every payout was paid once.</p>}
              </Panel>
              <Panel title="⚖️ Balances out of step with the ledger">
                {d.mismatched.length ? (
                  <div className="grid gap-1.5 text-sm" data-testid="radar-mismatch">
                    {d.mismatched.map((x) => <Link key={x.player.id} to={`/players/${x.player.id}`} className="flex items-center gap-2 hover:underline">
                      <PlayerAvatar p={x.player} size={22} />@{x.player.username}<span className="ml-auto tnum text-muted">{int(x.balance)} vs ledger {int(x.ledger)}</span>
                      <b className={cn('tnum', x.balance > x.ledger ? 'text-bad' : 'text-muted')}>{x.balance > x.ledger ? '+' : ''}{int(x.balance - x.ledger)}</b></Link>)}
                    <p className="text-xs text-faint">Ink that changed outside the game’s own payouts (or by hand in the database).</p>
                  </div>) : <p className="text-sm text-muted">Every active player’s Ink matches the ledger.</p>}
              </Panel>
              <Panel title="🔁 Game actions today vs usual">
                {d.actions.length ? (
                  <div className="grid gap-1 text-sm">
                    {d.actions.slice(0, 12).map((x) => <div key={x.action} className="flex items-center gap-2"><b>{x.action.replace(/_/g, ' ')}</b>
                      <span className="text-muted">{int(x.today)} by {int(x.players)}</span>
                      <span className={cn('ml-auto tnum', (x.spike ?? 0) >= 3 ? 'font-bold text-bad' : 'text-muted')}>{x.spike == null ? 'new' : `×${x.spike.toFixed(2)}`}</span></div>)}
                  </div>) : <p className="text-sm text-muted">No game actions logged today.</p>}
              </Panel>
              <Panel title="🕹️ Arcade scores above what’s possible (7 days)">
                {d.arcade_tamper.length ? (
                  <div className="grid gap-1 text-sm">{d.arcade_tamper.map((x) => <div key={x.game} className="flex gap-2"><b>{x.game}</b><span className="ml-auto text-muted">{int(x.plays)} runs · {int(x.players)} players</span></div>)}
                    <p className="text-xs text-faint">The score sent was more than anyone could reach in the time played: kept at the most possible, and a sign of a modified game.</p></div>
                ) : <p className="text-sm text-muted">None.</p>}
              </Panel>
            </div>
            <Panel pad={false} title="Riskiest players right now">
              {d.top.length ? (
                <DataTable rows={d.top} rowKey={(r) => r.player.id} onRow={(r) => nav(`/tools/integrity?player=${r.player.id}`)} cols={[
                  { key: 'player', label: 'Player', render: (r) => <span className="flex items-center gap-2"><PlayerAvatar p={r.player} size={24} /><b>@{r.player.username}</b></span> },
                  { key: 'score', label: 'Risk', num: true, sort: true, render: (r) => <b className={r.level === 'severe' ? 'text-bad' : 'text-gold'}>{r.score} {r.level}</b> },
                  { key: 'families', label: 'Evidence', render: (r) => <FamilyChips f={r.families} proof={r.proof} /> },
                  { key: 'impact', label: 'Ink involved', num: true, sort: true, render: (r) => r.impact ? int(r.impact) : '—' },
                  { key: 'top', label: 'Strongest sign', render: (r) => <span className="text-muted">{r.top ?? ''}</span> },
                ]} />) : <div className="p-4"><Empty title="Nobody high or severe">Run “Scan everyone” under Risk scores, or wait for the hourly scan.</Empty></div>}
            </Panel>
          </>
        );
      }}</Q>
    </div>
  );
}

// ---- referral fraud ---------------------------------------------------------------------------------------------------
function ReferralFraud() {
  const [min, setMin] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'referral-fraud', min], queryFn: () => portal.referralFraud(min) });
  return (
    <div className="grid gap-3" data-testid="referral-fraud">
      <Panel title="🎯 Referral fraud" actions={<Seg value={min} onChange={setMin} label="Fake invited accounts" options={[{ value: 0, label: 'All inviters' }, { value: 1, label: '1+' }, { value: 3, label: '3+' }, { value: 10, label: '10+' }]} />}>
        <p className="text-sm text-muted">
          Every invited account is scored on its own: did it confirm its email, did it ever really play (and how — far faster than anyone, or only in the gaps
          between the inviter’s own games, like one person switching accounts), is its email temporary, random letters, or a near-copy of the inviter’s or the
          other invited accounts’, is it on the inviter’s own device, and did it stop the moment the bonus paid. An account at 60%+ counts as fake.
          {q.data?.scanned_at ? ` Last scan ${dateTime(q.data.scanned_at)}.` : ''}
        </p>
      </Panel>
      <Q q={q} label="Checking every invite…">{(d) => d.rows.length ? (
        <Panel pad={false} title={`${int(d.rows.length)} inviter${d.rows.length === 1 ? '' : 's'}`}>
          <div className="divide-y divide-line">
            {d.rows.map((r) => (
              <div key={r.player.id} data-testid={`ref-row-${r.player.username}`}>
                <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-surface-2/40" onClick={() => setOpen(open === r.player.id ? null : r.player.id)}>
                  <PlayerAvatar p={r.player} size={30} />
                  <span className="min-w-0"><b>@{r.player.username}</b>{r.status !== 'active' && <Badge tone={statusTone(r.status)} className="ml-1.5">{r.status}</Badge>}
                    <span className="block truncate text-xs text-faint">{r.email}</span></span>
                  <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge tone={r.fake ? 'bad' : 'muted'}>{int(r.fake)} of {int(r.invited)} fake</Badge>
                    {r.unverified > 0 && <Badge tone="warn">{int(r.unverified)} unconfirmed</Badge>}
                    {r.never_played > 0 && <Badge tone="warn">{int(r.never_played)} never played</Badge>}
                    {r.temp > 0 && <Badge tone="warn">{int(r.temp)} throwaway</Badge>}
                    <span className="tnum text-muted">{int(r.paid_fake)} of {int(r.paid)} invite Ink from fakes</span>
                    <b className={cn('tnum', r.referral >= 0.6 ? 'text-bad' : r.referral >= 0.35 ? 'text-gold' : 'text-muted')}>{Math.round(r.referral * 100)}%</b>
                  </span>
                </button>
                {open === r.player.id && (
                  <div className="grid gap-2 bg-surface-2/30 p-3" data-testid={`ref-detail-${r.player.username}`}>
                    {r.referees.map((x) => <RefereeCard key={x.id} r={x} />)}
                    <Link className="text-sm font-bold text-accent-2 hover:underline" to={`/tools/integrity?player=${r.player.id}`}>Open @{r.player.username} in Risk scores to act →</Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      ) : <Empty title="Nothing found">No inviter has invited accounts that look fake. Scans run every hour on their own.</Empty>}</Q>
    </div>
  );
}

function RefereeCard({ r }: { r: Referee }) {
  const c = r.suspicion >= 60 ? '#FF3D6E' : r.suspicion >= 35 ? '#FF8A3D' : '#3DDC97';
  return (
    <div className="rounded-xl bg-surface p-2.5 text-xs" style={{ boxShadow: `inset 3px 0 0 ${c}` }} data-testid={`referee-card-${r.username}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/players/${r.id}`} className="font-bold text-accent-2 hover:underline">@{r.username}</Link>
        <span className="min-w-0 break-all text-muted">{r.email}</span>
        {r.verified ? <Badge tone="ok">email confirmed</Badge> : <Badge tone="warn">not confirmed</Badge>}
        {r.disposable && <Badge tone="bad">throwaway</Badge>}{r.gibberish >= 0.5 && <Badge tone="warn">random letters</Badge>}
        {r.lookalike && <Badge tone="bad">copy of inviter’s</Badge>}{r.linked_via && <Badge tone="bad">same {r.linked_via.replace(/\+/g, ', ')}</Badge>}
        {r.switching && <Badge tone="bad">switching accounts</Badge>}
        <b className="ml-auto tnum" style={{ color: c }}>{r.suspicion}%</b>
      </div>
      <div className="mt-1 text-faint">joined {date(r.joined)} · {int(r.plays + r.arcade)} games · {int(r.ink_earned)} Ink earned · {int(r.plots)} plots · {int(r.active_days)} active days · paid the inviter {int(r.paid_inviter)}</div>
      {r.reasons.length > 0 && <div className="mt-1 text-muted">{r.reasons.join(' · ')}</div>}
    </div>
  );
}

// ---- the egg loop ---------------------------------------------------------------------------------------------------
function EggLoopScanner() {
  const [sp, setSp] = useSearchParams();
  const [min, setMin] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'egg-loop', min], queryFn: () => portal.eggLoopScan(min) });
  const open = sp.get('player');
  const pick = (id: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (id) n.set('player', id); else n.delete('player'); return n; }, { replace: true });
  return (
    <div className="grid gap-3" data-testid="egg-loop">
      <Panel title="🥚 The egg loop" actions={<Seg value={min} onChange={setMin} label="Extra Inkborn" options={[{ value: 1, label: 'Any' }, { value: 3, label: '3+' }, { value: 10, label: '10+' }, { value: 25, label: '25+' }]} />}>
        <p className="text-sm text-muted">
          Hatch an egg, sacrifice the new Inkborn at the Altar of Luck, and the egg came back to hatch again{q.data ? ` (closed ${dateTime(q.data.fixed_at)})` : ''}.
          Every sacrifice is in the live feed, and a player can only ever have had the Inkborn they made plus one per egg. <b className="text-fg">Extra</b> is
          how many they sacrificed beyond that: the least the loop gave them. Open a player to see the plots that Luck rolled, put them back or take them away, and take back what they earned.
        </p>
      </Panel>
      <Q q={q} label="Scanning the altar…">{(d) => d.rows.length ? (
        <Panel pad={false} title={`${int(d.rows.length)} caught`}>
          <DataTable rows={d.rows} rowKey={(r) => r.player.id} onRow={(r) => pick(r.player.id)} selected={open} cols={[
            { key: 'player', label: 'Player', render: (r) => (
              <span className="flex items-center gap-2" data-testid={`egg-row-${r.player.username}`}>
                <PlayerAvatar p={r.player} size={26} /><b>@{r.player.username}</b>{r.status !== 'active' && <Badge tone={statusTone(r.status)}>{r.status}</Badge>}
              </span>) },
            { key: 'excess', label: 'Extra Inkborn', num: true, sort: (r) => r.stats.excess, render: (r) => <b className="text-bad">{int(r.stats.excess)}</b> },
            { key: 'sacrificed', label: 'Sacrificed', num: true, sort: (r) => r.stats.sacrificed, render: (r) => <span>{int(r.stats.sacrificed)} <span className="text-faint">of {int(r.stats.could_have)} possible</span></span> },
            { key: 'luck', label: 'Luck from them', num: true, sort: (r) => r.stats.luck_from_inkborn, render: (r) => int(r.stats.luck_from_inkborn) },
            { key: 'peak', label: 'Most in a day', num: true, sort: (r) => r.stats.peak_day, render: (r) => int(r.stats.peak_day) },
            { key: 'when', label: 'When', render: (r) => <span className="text-muted">{dateTime(r.stats.first_at)} → {dateTime(r.stats.last_at)}</span> },
            { key: 'rolls', label: 'Plots Luck upgraded', sort: (r) => r.rolls.open, render: (r) => (
              <span className="flex flex-wrap items-center gap-1.5">
                {int(r.rolls.improved)}{r.rolls.ultras > 0 && <span className="text-gold">· {int(r.rolls.ultras)} ultra</span>}
                {r.rolls.open > 0 ? <Badge tone="warn">{int(r.rolls.open)} to fix</Badge> : r.rolls.fixed > 0 ? <Badge tone="ok">fixed</Badge> : null}
              </span>) },
          ]} />
        </Panel>
      ) : <Empty title="Nobody caught">No player has sacrificed more Inkborn than they could ever have had.</Empty>}</Q>
      {open && <EggLoopPlayer key={open} id={open} onClose={() => pick(null)} />}
    </div>
  );
}

function Rolls({ p }: { p: EggLoopPlot }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {p.options.map((r, i) => {
        const info = rarityInfo(r);
        return (
          <span key={i} title={`${i === 0 ? 'The plot’s own roll' : `Luck roll ${i}`}${i === p.kept ? ' · kept' : ''}`}
            className={cn('inline-flex h-[20px] items-center gap-1 rounded-full border px-1.5 text-[11px] font-semibold', i === p.kept ? 'border-transparent text-black' : 'border-line text-muted')}
            style={i === p.kept ? { background: info.color } : undefined}>
            {info.emoji ?? ''}{info.name || r}{p.shinies?.[i] ? ' ✦' : ''}
          </span>
        );
      })}
    </span>
  );
}

/** one player's egg loop: the numbers, the plots their Luck rolled, and every fix (also on their profile's Fair play tab) */
export function EggLoopPlayer({ id, onClose, embedded }: { id: string; onClose?(): void; embedded?: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin', 'egg-loop-player', id], queryFn: () => portal.eggLoopPlayer(id) });
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [to, setTo] = useState('own');
  const [reason, setReason] = useState(REASON);
  const [mode, setMode] = useState<'all' | 'extra'>('all');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const d = q.data;
  const loaded = !!d;
  useEffect(() => { if (!embedded && loaded) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [embedded, loaded]);
  // picked to start with: plots Luck upgraded after the loop began that are still theirs and not dealt with yet
  useEffect(() => { if (d && sel === null) setSel(new Set(d.plots.filter((p) => p.in_window && p.improved && p.theirs && !p.fix).map(key))); }, [d, sel]);
  const loopPlots = useMemo(() => (d?.plots ?? []).filter((p) => p.in_window && p.improved), [d]);
  useEffect(() => { setPreview(null); }, [mode, id]);
  if (q.isLoading || q.error || !d) return <Q q={q} label="Loading the egg loop…">{() => null}</Q>;
  if (embedded && d.stats.sacrificed === 0) return null;
  const s = d.stats;
  const chosen = d.plots.filter((p) => sel?.has(key(p)));
  const save = (r: EggData) => {
    qc.setQueryData(['admin', 'egg-loop-player', id], r);
    for (const k of [['admin', 'egg-loop'], ['admin', 'ultras'], ['admin', 'player-ultras', id], ['portal', 'player', id], ['admin', 'integrity-player', id]]) void qc.invalidateQueries({ queryKey: k });
  };
  const toggle = (p: EggLoopPlot) => setSel((prev) => { const n = new Set(prev ?? []); if (n.has(key(p))) n.delete(key(p)); else n.add(key(p)); return n; });
  const fix = async (action: 'downgrade' | 'take') => {
    const list = chosen.filter((p) => p.theirs);
    if (!list.length) { toast.error('Pick plots that are still theirs.'); return; }
    const toName = to === 'own' ? 'each plot’s own roll (what it was before Luck)' : rarityInfo(to).name;
    const ok = await confirm({
      title: action === 'take' ? `Take ${list.length} plot${list.length === 1 ? '' : 's'} away from @${d.player.username}?` : `Put ${list.length} plot${list.length === 1 ? '' : 's'} back to ${to === 'own' ? 'their own roll' : rarityInfo(to).name}?`,
      body: action === 'take' ? 'They go back to the world at the cell’s own rarity. This can’t be undone.' : `Each goes to ${toName}; a shine Luck gave goes too. Rent is settled first. You can undo a downgrade.`,
      confirm: action === 'take' ? 'Take them away' : 'Put them back', danger: action === 'take',
    });
    if (!ok) return;
    setBusy(action);
    try {
      const r = await portal.eggLoopFix(id, list.map((p) => ({ gx: p.gx, gy: p.gy, action, rarity: action === 'downgrade' && to !== 'own' ? to : null })), reason);
      save(r); setSel(new Set()); setPreview(null);
      const skipped = r.results.filter((x) => !x.ok);
      toast.success(`${r.done} plot${r.done === 1 ? '' : 's'} ${action === 'take' ? 'taken away' : 'put back'}`, { description: skipped.length ? `${skipped.length} skipped (${[...new Set(skipped.map((x) => x.why === 'not_lower' ? 'already that tier or lower' : 'not theirs any more'))].join(', ')})` : undefined });
    } catch (e) { err(e); } finally { setBusy(null); }
  };
  const runPreview = async () => {
    setBusy('preview');
    try { setPreview(await portal.eggLoopReverse(id, loopPlots.map((p) => ({ gx: p.gx, gy: p.gy })), mode, reason, true)); } catch (e) { err(e); } finally { setBusy(null); }
  };
  const reverse = async () => {
    const ok = await confirm({ title: `Take back what @${d.player.username}'s Luck plots earned?`,
      body: <>About {int(preview?.ink_target ?? 0)} Ink in all: {int(preview?.ink_taken ?? 0)} from their balance, {int(preview?.plots?.length ?? 0)} plot{preview?.plots?.length === 1 ? '' : 's'} they bought since, {int(preview?.debt ?? 0)} owed from what they earn next, and {usd(preview?.usd_taken ?? 0)} from their USD balance. You can undo it (plots taken don’t come back, their cost does as Ink).</>,
      confirm: 'Take it back', danger: true });
    if (!ok) return;
    setBusy('reverse');
    try {
      const r = await portal.eggLoopReverse(id, loopPlots.map((p) => ({ gx: p.gx, gy: p.gy })), mode, reason, false);
      save(r); setPreview(null);
      toast.success('Taken back', { description: `${int(r.reversal.ink_taken)} Ink, ${int(r.reversal.plots.length)} plot${r.reversal.plots.length === 1 ? '' : 's'}, ${usd(r.reversal.usd_taken)}${r.reversal.debt ? `, ${int(r.reversal.debt)} Ink owed` : ''}` });
    } catch (e) { err(e); } finally { setBusy(null); }
  };
  const undoFix = async (fixId: number) => { try { save(await portal.eggLoopUndo(fixId)); toast.success('Put back as it was'); } catch (e) { err(e); } };
  const undoRev = async (revId: number) => {
    if (!(await confirm({ title: 'Undo this take-back?', body: 'The Ink, the USD and what the plots cost (as Ink) go back to them, and the debt it added is cleared. Plots taken stay in the world.', confirm: 'Undo it' }))) return;
    try { const r = await portal.eggLoopReverseUndo(revId); save(r); toast.success(`${int(r.ink_returned)} Ink and ${usd(r.usd_returned)} returned`); } catch (e) { err(e); }
  };
  const lower = d.tiers.filter((t) => !t.ultra);
  return (
    <div ref={top} className="grid scroll-mt-4 gap-3" data-testid="egg-loop-player">
      {!embedded && (
        <div className="flex flex-wrap items-center gap-3">
          <PlayerAvatar p={d.player} size={44} />
          <div className="min-w-0 flex-1">
            <Link to={`/players/${id}`} className="text-lg font-bold hover:underline">@{d.player.username}</Link>
            <div className="truncate text-xs text-muted">{d.email}</div>
          </div>
          {onClose && <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Extra Inkborn" value={int(s.excess)} tone={s.excess > 0 ? 'bad' : 'ok'} sub="sacrificed beyond any they had" />
        <Stat label="Inkborn sacrificed" value={int(s.sacrificed)} sub={`could have had ${int(s.could_have)}: ${int(s.made)} made + ${int(s.eggs)} eggs${s.after_fix ? ` + ${int(s.after_fix)} since the fix` : ''}, ${int(s.alive)} kept`} />
        <Stat label="Luck from Inkborn" value={int(s.luck_from_inkborn)} sub={`${s.luck_total ? pct(s.luck_from_inkborn / s.luck_total, 0) : '—'} of all the Luck they got`} />
        <Stat label="Plots Luck upgraded" value={int(loopPlots.length)} tone="gold" sub={`since ${dateTime(s.first_at)} · ${int(loopPlots.filter((p) => p.ultra).length)} ultra`} />
        <Stat label="Ink they owe" value={int(d.owed)} tone={d.owed > 0 ? 'bad' : undefined} sub="taken from what they earn next" />
      </div>
      {d.days.length > 0 && (
        <Panel title="Inkborn sacrificed, day by day">
          <TimeChart type="bar" x={d.days.map((x) => x.day)} series={[{ name: 'Inkborn', values: d.days.map((x) => x.inkborn) }]} height={150} />
        </Panel>
      )}
      <Panel title={`Every plot they claimed with Luck · ${int(d.plots.length)}`} pad={false}
        actions={d.plots.length > 0 && <span className="text-xs text-muted">{int(chosen.length)} picked</span>}>
        <DataTable rows={d.plots} rowKey={key} onRow={toggle} cols={[
          { key: 'plot', label: 'Plot', render: (p) => (
            <span className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={!!sel?.has(key(p))} onChange={() => toggle(p)} onClick={(e) => e.stopPropagation()} data-testid={`egg-pick-${key(p)}`} aria-label={`Pick plot ${plotLabel(p.gx, p.gy)}`} />
              <span className="min-w-0">{p.name ?? <span className="tnum">{plotLabel(p.gx, p.gy)}</span>}</span>
            </span>) },
          { key: 'rolled', label: 'Rolled', sort: (p) => p.rolled_at, render: (p) => <span className="flex flex-wrap items-center gap-1">{dateTime(p.rolled_at)}{!p.in_window && <Badge>before the loop</Badge>}</span> },
          { key: 'rolls', label: 'Luck’s rolls (kept in colour)', render: (p) => <Rolls p={p} /> },
          { key: 'own', label: 'Its own roll', render: (p) => <Rarity id={p.own} shiny={p.own_shiny} /> },
          { key: 'now', label: 'Now', render: (p) => p.theirs && p.rarity ? <Rarity id={p.rarity} shiny={p.shiny} /> : <span className="text-muted">not theirs any more</span> },
          { key: 'fix', label: 'Done', render: (p) => p.fix ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone="ok">{p.fix.action === 'take' ? 'taken away' : `${rarityInfo(p.fix.from).name} → ${rarityInfo(p.fix.to ?? '').name}`}</Badge>
              {p.fix.action === 'downgrade' && d.can_fix && <button className="text-xs text-accent-2 hover:underline" onClick={(e) => { e.stopPropagation(); void undoFix(p.fix!.id); }}>Undo</button>}
            </span>) : p.improved && p.in_window ? <Badge tone="warn">to fix</Badge> : <span className="text-faint">—</span> },
        ]} empty={<Empty title="No Luck claims">They never claimed a plot with Luck.</Empty>} />
        {d.can_fix && d.plots.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
            <span className="text-sm text-muted">{int(chosen.length)} picked</span>
            <button className="p-chip" onClick={() => setSel(new Set(loopPlots.filter((p) => p.theirs).map(key)))}>Pick the loop’s</button>
            <button className="p-chip" onClick={() => setSel(new Set())}>None</button>
            <span className="mx-1 h-5 w-px bg-line" />
            <label className="flex items-center gap-2 text-sm">Down to
              <select className="p-input h-9" value={to} onChange={(e) => setTo(e.target.value)} data-testid="egg-to">
                <option value="own">Their own roll (before Luck)</option>
                {lower.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <Button size="sm" loading={busy === 'downgrade'} disabled={!chosen.length || !!busy} onClick={() => void fix('downgrade')} data-testid="egg-downgrade">Put back to a lower tier</Button>
            {d.can_take && <Button size="sm" variant="danger" loading={busy === 'take'} disabled={!chosen.length || !!busy} onClick={() => void fix('take')} data-testid="egg-take">Take away</Button>}
          </div>
        )}
      </Panel>
      {d.can_fix && loopPlots.length > 0 && (
        <Panel title="Take back what those plots earned" actions={<Seg value={mode} onChange={setMode} label="What to take back" options={[{ value: 'all', label: 'Everything they earned' }, { value: 'extra', label: 'Only what Luck added' }]} />}>
          <p className="text-sm text-muted">
            The {int(loopPlots.length)} plot{loopPlots.length === 1 ? '' : 's'} Luck upgraded since the loop began: Ink from games played on them and their USD rent (an estimate from their rate and
            how long they had them, boosts included), until each was fixed or left them. USD comes off their USD balance; USD they’d converted, held or cashed out comes back as Ink.
            Ink comes off their balance, then the plots they bought with Ink since the loop began (newest first), and the rest is owed: it comes out of the next Ink they earn.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className="p-input h-9 min-w-[16rem] flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (goes in the audit log)" aria-label="Reason" data-testid="egg-reason" />
            <Button size="sm" variant="secondary" loading={busy === 'preview'} disabled={!!busy} onClick={() => void runPreview()} data-testid="egg-preview">Work it out</Button>
          </div>
          {preview && (
            <div className="mt-3 grid gap-3" data-testid="egg-preview-result">
              <KV cols={2} items={[
                ['Ink from games on those plots', int(preview.earnings.ink_games)],
                ['USD rent they earned (estimate)', usd(preview.usd)],
                ['Off their USD balance', usd(preview.usd_taken)],
                ['USD already spent, back as Ink', `${int(preview.usd_as_ink)} Ink (${int(preview.ink_rate)} per $1)`],
                ['Ink to take back', <b key="t">{int(preview.ink_target)}</b>],
                ['Off their Ink balance', `${int(preview.ink_taken)} of ${int(preview.ink_balance)}`],
                ['Plots they bought with it', `${int(preview.plots.length)} · ${int(preview.plots_ink)} Ink`],
                ['Still owed (from what they earn next)', <b key="o" className={preview.debt > 0 ? 'text-bad' : ''}>{int(preview.debt)}</b>],
              ]} />
              {preview.plots.length > 0 && (
                <div className="flex flex-wrap gap-1.5">{preview.plots.map((p: any) => <Badge key={key(p)}><Rarity id={p.rarity} /> {plotLabel(p.gx, p.gy)} · {int(p.ink)} Ink</Badge>)}</div>
              )}
              <div className="flex justify-end">
                <Button variant="danger" loading={busy === 'reverse'} disabled={!!busy || !d.can_take || (preview.ink_target === 0 && Number(preview.usd_taken) === 0)} onClick={() => void reverse()} data-testid="egg-reverse">
                  Take it back
                </Button>
              </div>
              {!d.can_take && <p className="text-xs text-muted">Taking it back needs economy and moderator access (plots bought with it can be taken).</p>}
            </div>
          )}
        </Panel>
      )}
      {(d.fixes.length > 0 || d.reversals.length > 0) && (
        <Panel title="What’s been done" pad={false}>
          <DataTable rows={[...d.reversals.map((r) => ({ ...r, kind: 'reverse' as const })), ...d.fixes.map((f) => ({ ...f, kind: 'fix' as const }))].sort((a, b) => b.at.localeCompare(a.at))}
            rowKey={(r: any) => `${r.kind}-${r.id}`} cols={[
              { key: 'at', label: 'When', render: (r: any) => dateTime(r.at) },
              { key: 'what', label: 'What', render: (r: any) => r.kind === 'reverse'
                ? <span>Took back {int(r.ink_taken)} Ink, {int(r.plots_removed.length)} plot{r.plots_removed.length === 1 ? '' : 's'} ({int(r.plots_ink)} Ink), {usd(r.usd_taken)}{r.debt ? `, ${int(r.debt)} Ink owed` : ''} <span className="text-faint">· {r.mode === 'all' ? 'everything' : 'Luck’s share'} of {int(r.plots)} plots</span></span>
                : <span>{r.action === 'take' ? 'Took away' : 'Put back'} {plotLabel(r.gx, r.gy)}: <Rarity id={r.from} shiny={r.from_shiny} />{r.to && <> → <Rarity id={r.to} shiny={!!r.to_shiny} /></>}</span> },
              { key: 'by', label: 'By', render: (r: any) => (r.by ? `@${r.by}` : '—') },
              { key: 'reason', label: 'Reason', render: (r: any) => <span className="text-muted">{r.reason}</span> },
              { key: 'undo', label: '', render: (r: any) => r.undone_at ? <Badge>undone {date(r.undone_at)}</Badge>
                : r.kind === 'reverse' ? (d.can_fix ? <Button size="sm" variant="ghost" onClick={() => void undoRev(r.id)}>Undo</Button> : null)
                : r.action === 'downgrade' && d.can_fix ? <Button size="sm" variant="ghost" onClick={() => void undoFix(r.id)}>Undo</Button> : null },
            ]} />
        </Panel>
      )}
    </div>
  );
}

// ---- ultras & rent --------------------------------------------------------------------------------------------------
function UltraChips({ list }: { list: { rarity: string; n: number }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((x) => { const r = rarityInfo(x.rarity); return (
        <span key={x.rarity} title={r.name} className="inline-flex h-[20px] items-center gap-1 rounded-full px-1.5 text-[11px] font-bold" style={{ background: `${r.color}26`, color: r.color }}>
          {r.emoji ?? '◆'} {x.n > 1 ? `×${x.n}` : r.name}
        </span>); })}
    </span>
  );
}

function UltraScanner() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [min, setMin] = useState(1);
  const [sort, setSort] = useState<'boosted' | 'ultras' | 'crowns' | 'plots'>('boosted');
  const s = useQuery({ queryKey: ['admin', 'ultras', dq, min, sort], queryFn: () => portal.ultraScan({ q: dq, min, sort }) });
  return (
    <div className="grid gap-3" data-testid="ultra-scan">
      <Panel title="🌈 Ultras & rent" actions={
        <div className="flex flex-wrap items-center gap-2">
          <input className="p-input h-9 w-48" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" data-testid="ultra-search" />
          <Seg value={min} onChange={setMin} label="Ultras at least" options={[{ value: 1, label: '1+' }, { value: 3, label: '3+' }, { value: 10, label: '10+' }]} />
        </div>}>
        <p className="text-sm text-muted">
          Everyone who owns an ultra or a Crown, with their land’s rent: now (no boost), with their {s.data ? Math.round(s.data.free_boost_seconds / 3600) : 3} free boost hours a day,
          and boosted 24/7 (×{s.data?.boost_mult ?? 20} all day, every day). A player’s profile adds the extras that aren’t boosted.
        </p>
      </Panel>
      <Q q={s} label="Counting ultras…">{(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Players" value={int(d.totals.players)} />
            <Stat label="Ultras" value={int(d.totals.ultras)} tone="gold" />
            <Stat label="Crowns" value={int(d.totals.crowns)} />
            <Stat label="Their rent a day, now" value={usd(d.totals.day)} />
            <Stat label="Boosted 24/7, a day" value={usd(d.totals.day_boosted)} tone="gold" sub={`${usd(Number(d.totals.day_boosted) * 30)} a month`} />
          </div>
          <Panel pad={false} title={`${int(d.rows.length)} player${d.rows.length === 1 ? '' : 's'}`} actions={<Seg value={sort} onChange={setSort} label="Sort" options={[{ value: 'boosted', label: 'Rent' }, { value: 'ultras', label: 'Ultras' }, { value: 'crowns', label: 'Crowns' }, { value: 'plots', label: 'Plots' }]} />}>
            <DataTable rows={d.rows} rowKey={(r: UltraRow) => r.player.id} onRow={(r) => nav(`/players/${r.player.id}`)} empty={<Empty title="Nobody yet">No one owns an ultra.</Empty>} cols={[
              { key: 'player', label: 'Player', render: (r) => (
                <span className="flex items-center gap-2" data-testid={`ultra-row-${r.player.username}`}>
                  <PlayerAvatar p={r.player} size={26} /><b>@{r.player.username}</b>
                  {r.egg_loop > 0 && <Badge tone="bad">egg loop</Badge>}
                </span>) },
              { key: 'ultras', label: 'Ultras', num: true, render: (r) => <span className="flex flex-wrap items-center justify-end gap-1.5"><b>{int(r.ultras)}</b>{r.shiny_ultras > 0 && <span className="text-gold">✦{int(r.shiny_ultras)}</span>}</span> },
              { key: 'which', label: 'Which', render: (r) => <UltraChips list={r.by_rarity} /> },
              { key: 'plots', label: 'Plots', num: true, render: (r) => int(r.plots) },
              { key: 'day', label: 'A day now', num: true, render: (r) => usd(r.day) },
              { key: 'free', label: 'With free boosts', num: true, hideOnPhone: true, render: (r) => usd(r.day_free_boosts) },
              { key: 'boosted', label: 'Boosted 24/7, a day', num: true, render: (r) => <b className="text-gold">{usd(r.day_boosted)}</b> },
              { key: 'month', label: 'A month, boosted', num: true, render: (r) => usd(Number(r.day_boosted) * 30) },
            ]} />
          </Panel>
        </>
      )}</Q>
    </div>
  );
}

/** a player's ultras and their rent now and boosted 24/7 (their profile's overview) */
export function PlayerUltras({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['admin', 'player-ultras', id], queryFn: () => portal.playerUltras(id) });
  return (
    <Q q={q} label="Counting their ultras…">{(u) => (
      <Panel title="🌈 Ultras & rent if boosted 24/7" actions={u.egg_loop && u.egg_loop.excess > 0
        ? <Link to={`/players/${id}/fairplay`}><Badge tone="bad">egg loop · {int(u.egg_loop.excess)} extra Inkborn</Badge></Link> : undefined}>
        <div className="grid gap-3" data-testid="player-ultras">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Ultras" value={int(u.ultras)} tone="gold" sub={`${int(u.shiny_ultras)} shiny · ${int(u.crowns)} Crown${u.crowns === 1 ? '' : 's'} · ${int(u.plots)} plots`} />
            <Stat label="Rent a day, now" value={usd(u.day)} sub="no boost" />
            <Stat label="With free boosts" value={usd(u.day_free_boosts)} sub={`${Math.round(u.free_boost_seconds / 3600)} h a day at ×${u.boost_mult}`} />
            <Stat label="Boosted 24/7, a day" value={usd(u.day_boosted)} tone="gold" sub={`×${u.boost_mult} all day`} />
            <Stat label="Boosted 24/7, a month" value={usd(Number(u.day_boosted) * 30)} tone="gold" sub={`${usd(Number(u.day_boosted) * 365)} a year`} />
            <Stat label="From ultras & Crowns" value={u.rate > 0 ? pct(u.ultra_rate / u.rate, 0) : '—'} sub={`of their rent · ×${Number(u.rent_mult).toFixed(2)} on all rent`} />
          </div>
          {u.by_rarity.length > 0 && <UltraChips list={u.by_rarity} />}
          {u.list.length > 0 && (
            <DataTable rows={u.list} rowKey={key} maxHeight={320} cols={[
              { key: 'rarity', label: 'Rarity', render: (p) => <span className="flex items-center gap-1.5"><Rarity id={p.rarity} shiny={p.shiny} />{p.luck && <Badge tone="accent">Luck</Badge>}</span> },
              { key: 'plot', label: 'Plot', render: (p) => p.name ?? <span className="tnum">{plotLabel(p.gx, p.gy)}</span> },
              { key: 'level', label: 'Lvl', num: true, render: (p) => int(p.level) },
              { key: 'since', label: 'Since', render: (p) => date(p.claimed_at) },
              { key: 'day', label: 'A day now', num: true, sort: (p) => p.rate, render: (p) => usd(p.rate * 86400) },
              { key: 'boosted', label: 'Boosted 24/7, a day', num: true, render: (p) => <b className="text-gold">{usd(p.rate * 86400 * u.boost_mult)}</b> },
            ]} />
          )}
          <p className="text-xs text-muted">
            Boosts multiply their land’s rent (×{u.boost_mult}). Extras (landlord days, ultra abilities, daily bonuses) aren’t boosted; they’re counted from the last 24 hours: {usd(u.extras_day)} a day.
          </p>
        </div>
      </Panel>
    )}</Q>
  );
}
