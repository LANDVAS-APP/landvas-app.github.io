// Admin → Fair play. Three scanners on one page:
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
import { portal, type EggLoopPlayer as EggData, type EggLoopPlot, type UltraRow } from '../../shared/api';
import { TimeChart } from '../../shared/charts';
import { DataTable } from '../../shared/table';
import { date, dateTime, int, pct, plotLabel, usd } from '../../shared/format';
import { Badge, Empty, KV, Panel, Q, Rarity, Seg, Stat, statusTone, useDebounced } from '../../shared/ui';

const err = (e: unknown) => toast.error(toGameError(e).message);
const key = (p: { gx: number; gy: number }) => `${p.gx}_${p.gy}`;
const REASON = 'Egg loop: Luck from duplicated Inkborn';
type View = 'risk' | 'eggloop' | 'ultras';

export default function FairPlayPage() {
  const [sp, setSp] = useSearchParams();
  const view = (['eggloop', 'ultras'].includes(sp.get('view') ?? '') ? sp.get('view') : 'risk') as View;
  const set = (v: View) => setSp((prev) => { const n = new URLSearchParams(prev); n.delete('player'); if (v === 'risk') n.delete('view'); else n.set('view', v); return n; }, { replace: true });
  return (
    <div className="grid gap-4" data-testid="fair-play">
      <Seg value={view} onChange={set} label="Scanner" options={[
        { value: 'risk', label: '🛡️ Risk scores' }, { value: 'eggloop', label: '🥚 Egg loop' }, { value: 'ultras', label: '🌈 Ultras & rent' },
      ]} />
      {view === 'risk' && <IntegrityAdmin />}
      {view === 'eggloop' && <EggLoopScanner />}
      {view === 'ultras' && <UltraScanner />}
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
